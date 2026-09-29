/** 校验跨平台候选 workflow 的完整性、安全边界与打包顺序。 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { ROOT, fail, readText, nodeSyntaxError, relativePath } from "./core.mjs";
import {
  CHECKOUT_USE,
  EXPECTED_ACTION_STEPS,
  EXPECTED_INPUTS,
  EXPECTED_NAMED_STEPS,
  EXPECTED_WORKFLOW_SHA256,
  SETUP_NODE_USE,
  UPLOAD_USE,
} from "./workflow_contract.mjs";

export const WORKFLOW = path.join(
  ROOT,
  ".agents",
  "skills",
  "desktop-prepare-cross-platform-release",
  "assets",
  "github-release-candidate.yml",
);
export const RELEASE_CONTEXT_HELPER = path.join(
  ROOT,
  ".agents",
  "skills",
  "desktop-prepare-cross-platform-release",
  "scripts",
  "verify_release_context.mjs",
);
export const CANDIDATE_WORKFLOW_HELPER = path.join(
  ROOT,
  ".agents",
  "skills",
  "desktop-prepare-cross-platform-release",
  "scripts",
  "release_candidate_workflow.mjs",
);
export const DISPATCH_READINESS_HELPER = path.join(
  ROOT,
  ".agents",
  "skills",
  "desktop-prepare-cross-platform-release",
  "scripts",
  "verify_dispatch_readiness.mjs",
);

/** 返回一个顶层函数的源码片段，供顺序门禁使用。 */
function functionSource(text, name) {
  const startPattern = new RegExp(`^(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`, "mu");
  const match = startPattern.exec(text);
  if (!match) return "";
  const rest = text.slice(match.index + match[0].length);
  const next = /^(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/mu.exec(rest);
  return text.slice(match.index, next ? match.index + match[0].length + next.index : text.length);
}

/** 要求片段按声明顺序出现。 */
function requireOrder(errors, text, fragments, label) {
  let cursor = -1;
  for (const fragment of fragments) {
    const next = text.indexOf(fragment, cursor + 1);
    if (next < 0) {
      fail(errors, `${label} 缺少或顺序错误: ${fragment}`);
      return;
    }
    cursor = next;
  }
}

/** 对单个 Node helper 做语法和固定片段检查。 */
function validateHelper(errors, helper, fragments, label) {
  let text;
  try {
    const metadata = fs.lstatSync(helper);
    if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error("不是普通文件");
    text = readText(helper);
  } catch (error) {
    fail(errors, `missing ${label}: ${relativePath(helper)} (${error.message})`);
    return "";
  }
  const detail = nodeSyntaxError(helper);
  if (detail !== null) {
    fail(errors, `cannot parse ${label} ${relativePath(helper)}: ${detail}`);
    return "";
  }
  for (const fragment of fragments) {
    if (!text.includes(fragment)) fail(errors, `${label} contract missing: ${fragment}`);
  }
  return text;
}

/** 要求远程矩阵验证已独立推送的分支、tag 与本地发布源码提交。 */
export function validateReleaseContextHelper(errors, helper = RELEASE_CONTEXT_HELPER) {
  const text = validateHelper(errors, helper, [
    'const CONTEXT_PATH = ".harness/release-context.json"',
    'const HELPER_PATH = ".agents/skills/desktop-prepare-release/scripts/release_context.mjs"',
    'const RELEASE_BRANCH = "release"',
    "export async function calculateSnapshot(",
    "runner must check out the named release branch at source_commit",
    "working release context bytes do not match source_commit",
    "release context digest does not match the host-verified input",
    "fetched origin release branch does not equal source_commit",
    "fetched release tag does not equal source_commit",
    "`refs/remotes/origin/${RELEASE_BRANCH}`",
    "`refs/tags/${normalized.expectedTag}`",
    "releaseContextSha256: digest",
    "remoteReleaseBranch: RELEASE_BRANCH",
    "releaseDefaultBranch: normalized.defaultBranch",
    '["capture", "verify"].includes',
    "release context changed between build checks",
  ], "release context helper");
  if (text.includes("normalized.gitPublication") || text.includes("normalized.candidateSelections")) {
    fail(errors, "release context helper must not depend on release mode or candidate selections");
  }
  if (text.includes("repositoryDefaultBranch") || text.includes("refs/remotes/origin/${normalized.defaultBranch}")) {
    fail(errors, "release context helper must not require the advertised remote default branch");
  }
  return text;
}

/** 验证 workflow Node helper 仍承担源码、测试、manifest 与原子提交门禁。 */
export function validateCandidateWorkflowHelper(errors, helper = CANDIDATE_WORKFLOW_HELPER) {
  const text = validateHelper(errors, helper, [
    "const MINIMUM_NODE = [24, 21, 0]",
    'const RELEASE_BRANCH = "release"',
    "function verifyCheckout(",
    "function readMsrv(",
    "function hashReleaseNotes(",
    "function listTests(",
    "function verifyPostTest(",
    "function resolveArtifact(",
    "function writeManifest(",
    "function commitCandidate(",
    "source_commit 必须是由小写十六进制字符组成的 40 字符 SHA",
    "必须检出具名 release 分支",
    "release-notes.json 必须是非符号链接普通文件",
    "未发现测试",
    "测试后源码提交或 clean 状态发生变化",
    'buildMode: "cross-platform-native"',
    'e2eSelection: environment("E2E_SELECTION")',
    "releaseContextSha256: snapshot.releaseContextSha256",
    "releaseReview: review",
    'signingEvidence: { verification: environment("SIGNING_EVIDENCE")',
    'milestoneAcceptance: "pending"',
    "候选校验和与归档字节不匹配",
    "归档内更新日志与源码事实不一致",
    "renameSync(stage, releasePath)",
    "已提交的发布文件集不是精确候选集合",
    'case "write-manifest"',
    'case "commit-candidate"',
  ], "candidate workflow helper");
  if (!text) return;
  if (text.includes("snapshot.candidateSelections") || text.includes("snapshot.gitPublication")) {
    fail(errors, "candidate workflow helper must not source build choices from release context");
  }
  if (text.includes("REPOSITORY_DEFAULT_BRANCH")) {
    fail(errors, "candidate workflow helper must not require the advertised remote default branch");
  }
  const manifest = functionSource(text, "writeManifest");
  requireOrder(errors, manifest, [
    "const expectedBefore =",
    "if (!sameNames(names(stage), expectedBefore))",
    "createHash(\"sha256\").update(readFileSync(archive))",
    "releaseNotesDigest !== environment(\"RELEASE_NOTES_SHA256\")",
    "if (!packaged.equals(releaseNotes))",
    "const snapshot = JSON.parse",
    "const manifest = {",
    "writeFileSync(manifestPath",
    "if (!sameNames(names(stage), expectedAfter))",
  ], "candidate manifest sequence");
  const commit = functionSource(text, "commitCandidate");
  requireOrder(errors, commit, [
    "requirePlainDirectory(releasePath",
    "requirePlainDirectory(stage",
    "if (names(releasePath).length)",
    "if (!sameNames(names(stage), expected))",
    "rmdirSync(releasePath)",
    "renameSync(stage, releasePath)",
    "requirePlainDirectory(releasePath",
    "if (realpathSync(releasePath) !== releasePath)",
    "if (!sameNames(names(releasePath), expected))",
  ], "candidate atomic commit sequence");
}

/** 确认派发前只读验证远端默认分支已有可触发的 workflow。 */
export function validateDispatchReadinessHelper(errors, helper = DISPATCH_READINESS_HELPER) {
  const text = validateHelper(errors, helper, [
    'const WORKFLOW_PATH = ".github/workflows/release-candidate.yml"',
    "export function verifyDispatchReadiness(",
    'git(root, ["ls-remote", "--symref", remote, "HEAD"])',
    'git(root, ["ls-tree", "-z", head, "--", WORKFLOW_PATH])',
    "workflow_dispatch:",
    "plainFile(join(root, WORKFLOW_PATH)).equals(plainFile(ASSET_PATH))",
    "远端 advertised 默认分支在派发预检期间漂移",
    "远端默认分支缺少可派发的普通 workflow 文件",
  ], "dispatch readiness helper");
  if (/git\(root, \["(?:fetch|push|update-ref|branch)"/u.test(text)) {
    fail(errors, "dispatch readiness helper must not mutate local or remote Git refs");
  }
}

/** 确认 workflow 是受审模板，只构建 pending 候选且不执行产品验收。 */
export function validateWorkflow(errors, workflow = WORKFLOW) {
  let payload;
  let text;
  try {
    const metadata = fs.lstatSync(workflow);
    if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error("不是普通文件");
    payload = fs.readFileSync(workflow);
    const canonical = Buffer.from(payload.toString("binary").replaceAll("\r\n", "\n"), "binary");
    text = new TextDecoder("utf-8", { fatal: true }).decode(canonical);
    const observed = createHash("sha256").update(canonical).digest("hex");
    if (observed !== EXPECTED_WORKFLOW_SHA256) {
      fail(errors, `workflow asset differs from the fully reviewed candidate template: expected ${EXPECTED_WORKFLOW_SHA256}, got ${observed}`);
    }
  } catch (error) {
    fail(errors, `cannot read workflow asset ${relativePath(workflow)}: ${error.message}`);
    return;
  }

  const lines = text.split("\n");
  const semanticLines = lines.map((line) => line.trimStart().startsWith("#") ? "" : line);
  const semanticText = semanticLines.join("\n");
  const required = [
    "workflow_dispatch:", "fail-fast: false", "os: [ubuntu-latest, macos-latest, windows-latest]",
    "contents: read", "e2e_selection:", "E2E_SELECTION: ${{ inputs.e2e_selection }}",
    "release_context_sha256:", "RELEASE_CONTEXT_SHA256: ${{ inputs.release_context_sha256 }}",
    "RELEASE_CONTEXT_SNAPSHOT: ${{ runner.temp }}/release-context-snapshot.json",
    CHECKOUT_USE, SETUP_NODE_USE, UPLOAD_USE, "node-version: 24.21.0", "check-latest: false",
    "ref: release", "fetch-depth: 0", "persist-credentials: false",
    "release_candidate_workflow.mjs check-node-runtime", "release_candidate_workflow.mjs verify-checkout",
    "verify_release_context.mjs capture", "verify_release_context.mjs verify",
    "release_candidate_workflow.mjs read-msrv", "release_candidate_workflow.mjs verify-version",
    "release_notes.mjs check --file release-notes.json", "release_candidate_workflow.mjs hash-release-notes",
    "cargo test --workspace --all-targets --all-features",
    "release_candidate_workflow.mjs verify-post-test", "cargo build --workspace --release",
    "prepare-release-directory.sh", "prepare-release-directory.ps1", ".release-signing/sign-candidate.sh",
    ".release-signing/sign-candidate.ps1", "release_candidate_workflow.mjs resolve-artifact",
    "release_candidate_workflow.mjs write-manifest", "release_candidate_workflow.mjs commit-candidate",
    "release/${{ steps.candidate_artifact.outputs.archive_name }}.manifest.json",
  ];
  for (const fragment of required) {
    if (!semanticText.includes(fragment)) fail(errors, `workflow candidate gate missing: ${fragment}`);
  }
  const retiredRuntime = `${"py"}thon`;
  const forbidden = [
    "contents: write", "cargo publish", "gh release create", "git tag", "actions/create-release",
    "confirm_release:", "run_e2e:", "e2e_command", "E2E_COMMAND", "Smoke candidate", "smoke test",
    "Optional heavy checks", "HEAVY_CHECK", '"smoke"', '"heavyChecks"',
    '"milestoneAcceptance": "accepted"', "fail-fast: true", "continue-on-error:", "|| true",
    "dist/", "path: release/", "ref: ${{ inputs.source_commit }}", "ref: ${{ github.event.repository.default_branch }}",
    "REPOSITORY_DEFAULT_BRANCH", "git push", "git update-ref", "fetch-depth: 1",
    "cargo fmt", "cargo clippy", `setup-${retiredRuntime}`, `${retiredRuntime}3`, `${retiredRuntime} -`,
  ];
  for (const fragment of forbidden) {
    if (semanticText.toLowerCase().includes(fragment.toLowerCase())) {
      fail(errors, `workflow contains forbidden candidate behavior: ${fragment}`);
    }
  }

  const inputs = new Set();
  const inputsIndex = semanticLines.indexOf("    inputs:");
  if (inputsIndex < 0) fail(errors, "workflow_dispatch inputs block is missing");
  else {
    for (const line of semanticLines.slice(inputsIndex + 1)) {
      if (line.trim() && line.length - line.trimStart().length <= 4) break;
      const match = /^ {6}([A-Za-z0-9_-]+):$/u.exec(line);
      if (match) inputs.add(match[1]);
    }
    if ([...inputs].sort().join("|") !== [...EXPECTED_INPUTS].sort().join("|")) {
      fail(errors, `workflow_dispatch inputs must be exactly ${JSON.stringify([...EXPECTED_INPUTS].sort())}, got ${JSON.stringify([...inputs].sort())}`);
    }
  }
  const e2eStart = semanticLines.indexOf("      e2e_selection:");
  if (e2eStart < 0) fail(errors, "workflow e2e_selection input is missing");
  else {
    const block = new Set();
    for (const line of semanticLines.slice(e2eStart)) {
      if (line !== semanticLines[e2eStart] && line.trim() && line.length - line.trimStart().length <= 6) break;
      block.add(line.trim());
    }
    for (const fragment of ["required: true", "type: choice", "- disabled", "- enabled", "default: disabled"]) {
      if (!block.has(fragment)) fail(errors, `workflow e2e_selection input contract missing: ${fragment}`);
    }
  }

  const namedSteps = semanticLines.flatMap((line) => /^ {6}- name: (.+)$/u.exec(line)?.[1] ?? []);
  const actionSteps = semanticLines.flatMap((line) => /^ {6}- uses: (\S+)(?:\s+#\s*.+)?$/u.exec(line)?.[1] ?? []);
  if (JSON.stringify(namedSteps) !== JSON.stringify(EXPECTED_NAMED_STEPS)) {
    fail(errors, `workflow named-step allowlist mismatch: expected=${JSON.stringify(EXPECTED_NAMED_STEPS)}, got=${JSON.stringify(namedSteps)}`);
  }
  if (JSON.stringify(actionSteps) !== JSON.stringify(EXPECTED_ACTION_STEPS)) {
    fail(errors, `workflow action-step allowlist mismatch: expected=${JSON.stringify(EXPECTED_ACTION_STEPS)}, got=${JSON.stringify(actionSteps)}`);
  }
  for (const action of actionSteps) {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/u.test(action)) {
      fail(errors, `workflow action is not pinned to a full commit SHA: ${action}`);
    }
  }

  const namedIndex = (name) => semanticLines.findIndex((line) => line.trim() === `- name: ${name}`);
  const usesIndex = (use) => semanticLines.findIndex((line) => line.trim().startsWith(`- uses: ${use}`));
  const stepBlock = ({ name, uses }) => {
    const start = uses ? usesIndex(uses) : namedIndex(name);
    if (start < 0) return [];
    const indent = semanticLines[start].length - semanticLines[start].trimStart().length;
    let end = start + 1;
    while (end < semanticLines.length) {
      const line = semanticLines[end];
      if (line.trim() && line.length - line.trimStart().length <= indent) break;
      end += 1;
    }
    return semanticLines.slice(start, end);
  };
  const order = [
    namedIndex("确认已授权候选预检"), usesIndex(CHECKOUT_USE), usesIndex(SETUP_NODE_USE),
    namedIndex("验证 Node.js 运行时"), namedIndex("验证已检出源码"), namedIndex("捕获已发布上下文"),
    namedIndex("读取项目最低 Rust 版本"), namedIndex("选择项目 MSRV"), namedIndex("验证候选版本"),
    namedIndex("验证发布更新日志"), Math.min(namedIndex("准备 Unix 发布目录"), namedIndex("准备 Windows 发布目录")),
    namedIndex("验证候选"), Math.min(namedIndex("尝试 Unix 签名"), namedIndex("尝试 Windows 签名")),
    Math.min(namedIndex("打包 Unix 候选"), namedIndex("打包 Windows 候选")), namedIndex("解析候选制品"),
    namedIndex("记录候选清单"), namedIndex("提交候选制品集合"), usesIndex(UPLOAD_USE),
  ];
  if (order.some((index) => index < 0) || order.some((index, position) => position > 0 && index <= order[position - 1])) {
    fail(errors, "candidate workflow must checkout, validate, capture, test, sign, package, record, atomically commit, then upload");
  }

  const checkout = new Set(stepBlock({ uses: CHECKOUT_USE }).map((line) => line.trim()));
  for (const fragment of ["ref: release", "fetch-depth: 0", "persist-credentials: false"]) {
    if (!checkout.has(fragment)) fail(errors, `workflow checkout must use the release branch with full credential-free history: ${fragment}`);
  }
  const setup = new Set(stepBlock({ uses: SETUP_NODE_USE }).map((line) => line.trim()));
  for (const fragment of ["node-version: 24.21.0", "check-latest: false"]) {
    if (!setup.has(fragment)) fail(errors, `workflow runtime setup missing: ${fragment}`);
  }
  const preflight = stepBlock({ name: "确认已授权候选预检" }).join("\n");
  for (const fragment of ["inputs.confirm_candidate_build", '"$E2E_SELECTION" != "enabled"', '"$E2E_SELECTION" != "disabled"']) {
    if (!preflight.includes(fragment)) fail(errors, `workflow candidate preflight missing: ${fragment}`);
  }
  const contextHelper = ".agents/skills/desktop-prepare-cross-platform-release/scripts/verify_release_context.mjs";
  if (semanticText.split(contextHelper).length - 1 !== 2) fail(errors, "workflow must invoke the offline context helper exactly twice");
  const helperArguments = [
    '--project-root "$GITHUB_WORKSPACE"', '--source-commit "$SOURCE_COMMIT"',
    '--expected-context-sha256 "$RELEASE_CONTEXT_SHA256"',
    '--snapshot "$RELEASE_CONTEXT_SNAPSHOT"',
  ];
  for (const name of ["捕获已发布上下文", "记录候选清单"]) {
    const block = stepBlock({ name }).join("\n");
    for (const fragment of helperArguments) {
      if (!block.includes(fragment)) fail(errors, `workflow ${name} missing immutable binding: ${fragment}`);
    }
  }
  const verify = stepBlock({ name: "验证候选" }).join("\n");
  requireOrder(errors, verify, [
    "release_candidate_workflow.mjs list-tests",
    "cargo test --workspace --all-targets --all-features",
    "release_candidate_workflow.mjs verify-post-test",
    "cargo build --workspace --release",
  ], "workflow candidate verification sequence");
  const manifest = stepBlock({ name: "记录候选清单" }).join("\n");
  requireOrder(errors, manifest, ["verify_release_context.mjs verify", "release_candidate_workflow.mjs write-manifest"], "workflow manifest sequence");

  for (const [name, fragments] of Object.entries({
    "打包 Unix 候选": ["release-notes.json", "tar -czf", '${GITHUB_WORKSPACE}/../.${PRODUCT_NAME}.release-candidate.XXXXXX'],
    "打包 Windows 候选": ["release-notes.json", "Compress-Archive", "Split-Path -Parent $env:GITHUB_WORKSPACE"],
  })) {
    const block = stepBlock({ name }).join("\n");
    for (const fragment of fragments) if (!block.includes(fragment)) fail(errors, `workflow ${name} packaging gate missing: ${fragment}`);
  }
  for (const name of ["尝试 Unix 签名", "尝试 Windows 签名"]) {
    const block = stepBlock({ name }).join("\n");
    for (const fragment of ["probe", "sign", "verify", "SIGNING_STATUS", "SIGNING_EVIDENCE", "unsigned"]) {
      if (!block.includes(fragment)) fail(errors, `workflow ${name} signing contract missing: ${fragment}`);
    }
  }
  const guards = {
    "准备 Unix 发布目录": "if: runner.os != 'Windows' && success()",
    "准备 Windows 发布目录": "if: runner.os == 'Windows' && success()",
    "尝试 Unix 签名": "if: runner.os != 'Windows' && success()",
    "尝试 Windows 签名": "if: runner.os == 'Windows' && success()",
    "打包 Unix 候选": "if: runner.os != 'Windows' && success()",
    "打包 Windows 候选": "if: runner.os == 'Windows' && success()",
  };
  for (const [name, guard] of Object.entries(guards)) {
    if (!new Set(stepBlock({ name }).map((line) => line.trim())).has(guard)) fail(errors, `workflow ${name} must use exact guard: ${guard}`);
  }
  const upload = new Set(stepBlock({ uses: UPLOAD_USE }).map((line) => line.trim()));
  if (!upload.has("if: success()")) fail(errors, "workflow upload step must use exact if: success() guard");
  const expectedUploads = [
    "release/${{ steps.candidate_artifact.outputs.archive_name }}",
    "release/${{ steps.candidate_artifact.outputs.archive_name }}.sha256",
    "release/${{ steps.candidate_artifact.outputs.archive_name }}.manifest.json",
  ];
  for (const candidate of expectedUploads) if (!upload.has(candidate)) fail(errors, `workflow upload missing exact declared path: ${candidate}`);

  validateReleaseContextHelper(errors);
  validateCandidateWorkflowHelper(errors);
  validateDispatchReadinessHelper(errors);
}
