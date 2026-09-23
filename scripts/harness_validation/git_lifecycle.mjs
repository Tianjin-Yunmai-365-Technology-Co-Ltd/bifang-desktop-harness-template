/** 校验开发分支、publish、tag 与精确清理生命周期。 */

import fs from "node:fs";
import path from "node:path";

import { ROOT, SKILLS_ROOT, fail, readText, nodeSyntaxError, relativePath, trackedFiles } from "./core.mjs";

export const GIT_LIFECYCLE_SKILL_ROOT = path.join(SKILLS_ROOT, "desktop-manage-git-lifecycle");
export const GIT_LIFECYCLE_SKILL = path.join(GIT_LIFECYCLE_SKILL_ROOT, "SKILL.md");
export const GIT_LIFECYCLE_METADATA = path.join(GIT_LIFECYCLE_SKILL_ROOT, "agents", "openai.yaml");
export const GIT_LIFECYCLE_SCRIPT = path.join(GIT_LIFECYCLE_SKILL_ROOT, "scripts", "git_lifecycle.mjs");
export const GIT_LIFECYCLE_CORE = path.join(GIT_LIFECYCLE_SKILL_ROOT, "scripts", "git_lifecycle_core.mjs");
export const GIT_LIFECYCLE_PUBLICATION = path.join(GIT_LIFECYCLE_SKILL_ROOT, "scripts", "git_lifecycle_publication.mjs");
export const GIT_PUBLICATION_REPORT = path.join(GIT_LIFECYCLE_SKILL_ROOT, "scripts", "git_publication_report.mjs");
export const GIT_LIFECYCLE_TEST_SUPPORT = path.join(GIT_LIFECYCLE_SKILL_ROOT, "scripts", "git_lifecycle_test_support.mjs");
export const GIT_LIFECYCLE_TESTS = path.join(GIT_LIFECYCLE_SKILL_ROOT, "scripts", "git_lifecycle.test.mjs");
export const GIT_LIFECYCLE_RELEASE_TESTS = path.join(GIT_LIFECYCLE_SKILL_ROOT, "scripts", "git_lifecycle_release.test.mjs");
export const GIT_PUBLICATION_TEST_CASES = path.join(GIT_LIFECYCLE_SKILL_ROOT, "scripts", "git_publication_test_cases.test.mjs");
export const RELEASE_CONTEXT_HELPER = path.join(SKILLS_ROOT, "desktop-prepare-release", "scripts", "release_context.mjs");
export const RELEASE_CONTEXT_HELPER_TESTS = path.join(SKILLS_ROOT, "desktop-prepare-release", "scripts", "release_context.test.mjs");
export const CROSS_RELEASE_CONTEXT_HELPER = path.join(SKILLS_ROOT, "desktop-prepare-cross-platform-release", "scripts", "verify_release_context.mjs");
export const CROSS_RELEASE_CONTEXT_HELPER_TESTS = path.join(SKILLS_ROOT, "desktop-prepare-cross-platform-release", "scripts", "verify_release_context.test.mjs");
export const WORKFLOW = path.join(SKILLS_ROOT, "desktop-prepare-cross-platform-release", "assets", "github-release-candidate.yml");
export const AGENT_POLICY = path.join(ROOT, "docs", "AGENT_POLICY.md");
export const ENGINEERING_RULES = path.join(ROOT, "docs", "ENGINEERING_RULES.md");
export const RELEASE_DOC = path.join(ROOT, "docs", "RELEASE.md");

const OLD_SKILL_ROOT = path.join(SKILLS_ROOT, "desktop-manage-git-branch-chain");

/** 返回一个顶层函数的源码片段。 */
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
      fail(errors, `${label} missing or out of order: ${fragment}`);
      return;
    }
    cursor = next;
  }
}

/** 读取普通文本并校验固定片段。 */
function requireContract(errors, filePath, fragments, label) {
  let text;
  try {
    const metadata = fs.lstatSync(filePath);
    if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error("not a regular file");
    text = readText(filePath);
  } catch (error) {
    fail(errors, `missing ${label} file: ${relativePath(filePath)} (${error.message})`);
    return "";
  }
  for (const fragment of fragments) {
    if (!text.includes(fragment)) fail(errors, `${label} missing in ${relativePath(filePath)}: ${fragment}`);
  }
  return text;
}

/** 对执行模块和回归文件运行 Node 语法检查。 */
function validateSyntax(errors, paths) {
  for (const filePath of paths) {
    if (!fs.existsSync(filePath)) continue;
    const detail = nodeSyntaxError(filePath);
    if (detail !== null) fail(errors, `invalid Git lifecycle Node module ${relativePath(filePath)}: ${detail}`);
  }
}

/** 返回当前活动规则、Skill 与执行面，排除历史证据和负向测试夹具。 */
function activeContractFiles() {
  const primary = [
    "AGENTS.md", "README.md", "docs/AGENT_POLICY.md", "docs/ENGINEERING_RULES.md",
    "docs/RELEASE.md", "docs/RUST_CLI_TEMPLATE.md", "docs/VERIFICATION.md",
  ].map((relative) => path.join(ROOT, relative));
  const files = trackedFiles().filter((relative) => {
    if (relative.endsWith(".test.mjs")) return false;
    if (relative.startsWith(".agents/skills/")) {
      return relative.endsWith("/SKILL.md") || relative.endsWith("/agents/openai.yaml") ||
        /\.(?:mjs|sh|ps1|yml|yaml)$/u.test(relative);
    }
    return relative.startsWith("scripts/harness_validation/") && relative.endsWith(".mjs") &&
      path.basename(relative) !== "git_lifecycle.mjs";
  }).map((relative) => path.join(ROOT, relative));
  return [...primary, ...files];
}

/** 拒绝已经废弃的分支链、发布分支和线性历史门禁。 */
function validateNoRetiredRuntime(errors) {
  const fragments = [
    "desktop-manage-git-branch-chain", ".harness/git-branch-chain.json", "verify-release-review",
    "git push --atomic", "git merge --ff-only", "--force-with-lease", "lastClosedChain", "activeChain",
    "closing commit", "refs/heads/Release", "ref: Release", "codex/task-", "task-slug",
  ];
  const seen = new Set();
  for (const filePath of activeContractFiles()) {
    if (seen.has(filePath) || !fs.existsSync(filePath)) continue;
    seen.add(filePath);
    let text;
    try { text = readText(filePath); } catch { continue; }
    for (const fragment of fragments) {
      if (text.includes(fragment)) fail(errors, `retired Git lifecycle runtime remains in ${relativePath(filePath)}: ${fragment}`);
    }
  }
}

/** 验证本地 start、多远端 publish、tag-first release 与精确清理。 */
export function validateGitLifecycleContract(errors, overrides = {}) {
  const paths = {
    skill: GIT_LIFECYCLE_SKILL,
    metadata: GIT_LIFECYCLE_METADATA,
    script: GIT_LIFECYCLE_SCRIPT,
    core: GIT_LIFECYCLE_CORE,
    publication: GIT_LIFECYCLE_PUBLICATION,
    report: GIT_PUBLICATION_REPORT,
    support: GIT_LIFECYCLE_TEST_SUPPORT,
    tests: GIT_LIFECYCLE_TESTS,
    releaseTests: GIT_LIFECYCLE_RELEASE_TESTS,
    publicationTests: GIT_PUBLICATION_TEST_CASES,
    contextHelper: RELEASE_CONTEXT_HELPER,
    contextTests: RELEASE_CONTEXT_HELPER_TESTS,
    crossHelper: CROSS_RELEASE_CONTEXT_HELPER,
    crossTests: CROSS_RELEASE_CONTEXT_HELPER_TESTS,
    workflow: WORKFLOW,
    agentPolicy: AGENT_POLICY,
    releaseDoc: RELEASE_DOC,
    ...overrides,
  };
  if (fs.existsSync(OLD_SKILL_ROOT)) fail(errors, `retired Git lifecycle skill still exists: ${relativePath(OLD_SKILL_ROOT)}`);

  requireContract(errors, paths.skill, [
    "name: desktop-manage-git-lifecycle", "start --project-root", "track-worktree --project-root",
    "publish --project-root", "[--also-remote <name>]...", "release --project-root",
    "(--local-only | --remote <name>)", "feature-<summary>-<Asia/Shanghai YYYYMMDD>",
    "创建本地分支不要求配置远端", "普通 `git merge --no-edit`", "`pendingPublish` 中临时保存冻结目标与确认进度",
    "既有合法 v2 状态缺少新增可空 `pendingPublish` 时按 `null` 兼容读取", "不参与 release、tag 或清理",
    "跨远端推送不是原子操作", "不重新解析默认分支、fetch、merge 或计算新 HEAD",
    "为兼容既有机器调用保留历史稳定 code `push-rejected`", "不创建标签，也不清理任何资源",
    "`v{version}-{YYYYMMDD}`", "全过程不列举、fetch、push、复读或删除远端 ref",
    "模式内标签确认之前不会开始清理", "不扫描名称前缀", "Git common-dir",
    "不会写入项目受跟踪目录", "多个 Task 同时开始也不会相互覆盖登记",
  ], "Git lifecycle contract");
  requireContract(errors, paths.metadata, ['display_name: "管理 Git 生命周期"', "$desktop-manage-git-lifecycle"], "Git lifecycle contract");
  requireContract(errors, paths.script, [
    'const COMMANDS = ["inspect", "start", "track-worktree", "publish", "release"]',
    "export function parseArguments(",
    'release: new Set(["projectRoot", "version", "date", "releaseContextSha256", "localOnly", "remote"])',
    "if (args.version === undefined || args.releaseContextSha256 === undefined) invalidArguments();",
    'alsoRemote', 'args.cliInvocation = true',
    "withLifecycleStateLock(repository, operation)", 'code: "interrupted"',
  ], "Git lifecycle contract");
  const core = requireContract(errors, paths.core, [
    "export const SCHEMA_VERSION = 2", 'export const STATE_DIRECTORY = "agent-first-harness"',
    'export const STATE_FILENAME = "git-lifecycle.json"', 'const LOCK_DIRECTORY = ".git-lifecycle.lock"',
    "export function runGit(", "bytes = false", "export function primaryRepository(",
    "export async function withLifecycleStateLock(", "export function resolveAdditionalRemoteTargets(",
    "export function mergeRegisteredBranches(", 'parsed.pendingPublish = null',
    'branch === "@"', 'branch === "HEAD"', '["switch", "-c", defaultBranch, "--track"',
    '["merge", "--no-edit", `refs/heads/${branch}`]',
  ], "Git lifecycle contract");
  const publication = requireContract(errors, paths.publication, [
    'const RELEASE_CONTEXT_PATH = ".harness/release-context.json"',
    'const RELEASE_CONTEXT_HELPER = ".agents/skills/desktop-prepare-release/scripts/release_context.mjs"',
    "export async function releaseContextBinding(", "function verifyHeadReleaseContextBytes(",
    "function relocateCliCwdBeforeReleaseCleanup(", "function confirmPendingPublishTarget(",
    "function completePendingPublish(", "function publishPrimaryRemote(", "export function publish(",
    "function prepareLocalRelease(", "function prepareRemoteRelease(", "function ensureLocalReleaseTag(",
    "function ensureReleaseTag(", "function cleanupWorktrees(", "function cleanupRemoteBranches(",
    "function cleanupLocalBranches(", "function freezePendingReleaseHead(", "function completePendingRelease(",
    "export async function commandRelease(", 'state.pendingPublish = { head, targets:',
    '["push", target.remote, `${head}:refs/heads/${target.branch}`]',
    '["push", remote, `refs/tags/${tag}:refs/tags/${tag}`]', '["push", remote, `:refs/heads/${branch}`]',
    '["branch", "-D", "--", branch]',
  ], "Git lifecycle contract");
  requireContract(errors, paths.report, [
    "export function primaryFailureMessage", "export function additionalFailureMessage", "export function pendingFailure",
    "later confirmed additional targets remain recorded", '"push-failed": "push-rejected"',
    '"verification-failed": "remote-verification-failed"', '"local-state-changed": "local-state-changed"',
    '"state-write-failed": "state-write-failed"',
  ], "Git lifecycle contract");
  requireContract(errors, paths.support, [
    "export const SCRIPT", '"git_lifecycle.mjs"', "export function lifecycleFixture", "export function spawnHelper",
  ], "Git lifecycle contract");
  requireContract(errors, paths.tests, [
    "start_without_remote_is_idempotent_and_uses_common_dir_state", "branch_validation_rejects_ambiguous_pseudo_refs",
    "legacy_v2_state_is_loaded_and_schema_v1_is_rejected", "concurrent_task_starts_preserve_both_branches_and_worktrees",
    "publish_merges_switches_and_pushes_without_tag_or_cleanup", "publish_merges_current_remote_default_before_development_branches",
    "publish_pushes_same_head_to_additional_remote_without_rebinding", "publish_rejects_invalid_additional_remote_sets_before_pushing",
    "publish_refuses_missing_registered_branch",
  ], "Git lifecycle contract");
  requireContract(errors, paths.releaseTests, [
    "remote_release_tags_before_exact_cleanup_and_retry_is_idempotent", "first_local_release_initializes_default_branch_without_cycle_state",
    "local_release_never_accesses_remote_and_preserves_remote_refs", "detached_task_worktree_is_removed_after_remote_release",
    "context_mode_mismatch_fails_before_any_remote_access", "release_requires_exactly_one_publication_mode",
    "invalid_nested_context_fails_before_pending_release", "local_release_tag_conflict_keeps_cycle_resources",
    "dirty_registered_worktree_blocks_release_then_clean_retry_succeeds",
  ], "Git lifecycle contract");
  requireContract(errors, paths.publicationTests, [
    "publish_primary_only_failure_persists_and_resumes_frozen_head", "single_target_pending_errors_preserve_stable_codes",
    "additional_drift_reports_later_confirmed_targets", "additional_remote_rejection_preserves_prefix_and_retry_succeeds",
  ], "Git lifecycle contract");
  requireContract(errors, paths.contextHelper, [
    'export const CONTEXT_RELATIVE_PATH = ".harness/release-context.json"', "export function validBranchName(",
    '["check-ref-format", "--branch", args.defaultBranch]',
    'value.gitPublication === "local"', 'value.gitPublication === "remote"',
    "export function validateContext(", "export function canonicalBytes(",
    'const expectedTag = `v${value.version}-${compactDate}`',
  ], "Git lifecycle contract");
  requireContract(errors, paths.contextTests, [
    "schema_v1_release_context_is_rejected", "local_write_uses_explicit_branch_without_accessing_remote",
    "local_default_branch_rejects_ambiguous_ref_syntax", "local_verify_requires_only_local_branch_head_context_and_tag",
  ], "Git lifecycle contract");
  requireContract(errors, paths.crossHelper, [
    'const CONTEXT_PATH = ".harness/release-context.json"', 'normalized.gitPublication !== "remote"',
    "releaseContextSha256: digest", "`refs/tags/${normalized.expectedTag}`",
  ], "Git lifecycle contract");
  requireContract(errors, paths.crossTests, [
    "capture_and_verify_accept_non_main_default_branch", "missing_fetched_tag_is_rejected",
    "snapshot_change_is_rejected_at_second_gate", "local_only_context_is_rejected_by_provider_flow",
  ], "Git lifecycle contract");
  requireContract(errors, paths.workflow, [
    "release_context_sha256:", "verify_release_context.mjs capture", "verify_release_context.mjs verify",
  ], "Git lifecycle contract");
  const compatibility = "既有合法 v2 状态缺少新增可空 `pendingPublish` 时按 `null` 兼容读取";
  requireContract(errors, paths.agentPolicy, [compatibility], "Git lifecycle contract");
  requireContract(errors, paths.releaseDoc, [compatibility], "Git lifecycle contract");

  validateSyntax(errors, [
    paths.script, paths.core, paths.publication, paths.report, paths.support, paths.tests, paths.releaseTests,
    paths.publicationTests, paths.contextHelper, paths.contextTests, paths.crossHelper, paths.crossTests,
  ]);

  if (core && publication) {
    requireOrder(errors, functionSource(publication, "publish"), [
      "resolveAdditionalRemoteTargets(", '["fetch", remote', "switchToDefault(",
      '["merge", "--no-edit", `refs/remotes/${remote}/${defaultBranch}`]', "mergeRegisteredBranches(",
      "state.pendingPublish =", "saveState(repository, state)", "completePendingPublish(",
    ], "main publish sequence");
    requireOrder(errors, functionSource(publication, "completePendingPublish"), [
      "confirmPendingPublishTarget(repository, state, index)", "verifyLocalPosition(repository, primary.branch, head)",
      "state.pendingPublish = null", "saveState(repository, state)",
    ], "publication journal completion sequence");
    requireOrder(errors, functionSource(core, "mergeRegisteredBranches"), [
      "const before = currentHead(repository)", '["merge", "--no-edit", `refs/heads/${branch}`]',
      "currentHead(repository) === before",
    ], "registered branch merge sequence");
    const confirm = functionSource(publication, "confirmPendingPublishTarget");
    requireOrder(errors, confirm, [
      "remoteHead = remoteBranchOid(", '["push", target.remote', "remoteHead = remoteBranchOid(",
      "verifyLocalPosition(", "target.confirmed = true", "saveState(repository, state)",
    ], "frozen publication target sequence");
    if (confirm.split("remoteHead = remoteBranchOid(").length - 1 !== 2) {
      fail(errors, "frozen publication target must reread before and after push");
    }
    const release = functionSource(publication, "commandRelease");
    requireOrder(errors, release, [
      "const identity = releaseIdentity(", "requireClean(repository)", "await releaseContextBinding(",
      "const state = loadState(repository)", "repository = primaryRepository(repository)",
      "relocateCliCwdBeforeReleaseCleanup(repository, state, args)",
    ], "caller-context-before-primary sequence");
    requireOrder(errors, release, [
      "if (args.localOnly)", "defaultBranch = state.defaultBranch ?? context.defaultBranch",
      "state.defaultBranch = defaultBranch",
    ], "local context default initialization sequence");
    requireOrder(errors, release, [
      "cycle.pendingRelease =", "saveState(repository, state)", "return completePendingRelease(repository, state, args)",
    ], "context-bound pending-before-release sequence");
    requireOrder(errors, functionSource(publication, "releaseContextBinding"), [
      "raw = readFileSync(path)", "module.validateContext(value)", "module.canonicalBytes(value)",
      'createHash("sha256").update(canonical)', '["show", `HEAD:${RELEASE_CONTEXT_PATH}`]',
    ], "authoritative tracked release-context sequence");
    requireOrder(errors, functionSource(publication, "prepareRemoteRelease"), [
      '["fetch", remote', "switchToDefault(", '["merge", "--no-edit", `refs/remotes/${remote}/${defaultBranch}`]',
      "mergeRegisteredBranches(",
    ], "remote local-integration sequence");
    requireOrder(errors, functionSource(publication, "freezePendingReleaseHead"), [
      "prepareRemoteRelease(", "verifyHeadReleaseContextBytes(", "pending.head = prepared.head", "saveState(repository, state)",
    ], "integrated-context-before-frozen-head sequence");
    requireOrder(errors, functionSource(publication, "completePendingRelease"), [
      "ensureReleaseTag(", "ensureLocalReleaseTag(", "cleanupWorktrees(", "cleanupRemoteBranches(", "cleanupLocalBranches(",
    ], "local-and-remote tag-before-cleanup release sequence");
    const localPaths = functionSource(publication, "prepareLocalRelease") + functionSource(publication, "ensureLocalReleaseTag");
    for (const token of ["selectRemote(", "configuredRemotes(", "remoteDefaultBranch(", "remoteBranchOid(", "remoteTagTarget(", '["fetch"', '["push"']) {
      if (localPaths.includes(token)) fail(errors, `local release path accesses remote operation: ${token}`);
    }
    requireOrder(errors, functionSource(publication, "ensureReleaseTag"), [
      '["push", remote, `refs/tags/${tag}:refs/tags/${tag}`]', "remoteTarget = remoteTagTarget(", "if (remoteTarget !== head)",
    ], "remote tag verification sequence");
    for (const forbidden of ['"--ff-only"', '"--force-with-lease', '"--atomic"', '"merge-base"']) {
      if ((core + publication).includes(forbidden)) fail(errors, `branch gate remains in lifecycle implementation: ${forbidden}`);
    }
  }

  const trackedState = path.join(ROOT, ".harness", "git-lifecycle.json");
  if (fs.existsSync(trackedState)) fail(errors, "Git lifecycle state must live under git-common-dir, not tracked .harness");
  if (overrides.scanRetired !== false) validateNoRetiredRuntime(errors);
}
