#!/usr/bin/env node
/** Write and verify the tracked context for one local or remote release. */

import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const OID_PATTERN = /^[0-9a-f]{40}$/;
export const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const REMOTE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const VERSION_PATTERN = /^(?:[0-9]+\.[0-9]+\.[0-9]+|[0-9]{12})$/;
export const CONTEXT_RELATIVE_PATH = ".harness/release-context.json";
export const REVIEW_CHECKS = [
  "behavior-correctness",
  "core-adapter-boundary",
  "external-contracts",
  "responsibility-and-size",
  "temporary-markers",
];
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

/** 表示发布上下文或其 Git 发布绑定不满足固定契约。 */
export class ReleaseContextError extends Error {
  /** 保存可公开错误，避免调用方依赖运行时异常类型。 */
  constructor(message) {
    super(message);
    this.name = "ReleaseContextError";
  }
}

/** 以非交互环境执行 Git，并按调用方选择返回文本或原始字节。 */
export function runGit(root, args, { check = true, text = true } = {}) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: text ? "utf8" : undefined,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GCM_INTERACTIVE: "Never",
    },
    input: Buffer.alloc(0),
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) {
    throw new ReleaseContextError("git executable is unavailable");
  }
  if (check && result.status !== 0) {
    const stderr = text ? result.stderr : result.stderr.toString("utf8");
    const stdout = text ? result.stdout : result.stdout.toString("utf8");
    const detail = stderr.trim() || stdout.trim() || "unknown Git failure";
    throw new ReleaseContextError(`git ${args.join(" ")} failed: ${detail}`);
  }
  return {
    returncode: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

/** 要求调用路径恰好是非符号链接的独立 Git 顶层。 */
export function resolveRoot(projectRoot) {
  const supplied = resolve(projectRoot);
  try {
    if (lstatSync(supplied).isSymbolicLink()) {
      throw new ReleaseContextError("project root must not be a symbolic link");
    }
  } catch (error) {
    if (error instanceof ReleaseContextError) throw error;
    throw new ReleaseContextError("project root does not exist");
  }
  let root;
  try {
    root = realpathSync(supplied);
  } catch {
    throw new ReleaseContextError("project root does not exist");
  }
  if (!statSync(root).isDirectory()) {
    throw new ReleaseContextError("project root is not a directory");
  }
  const result = runGit(root, ["rev-parse", "--is-inside-work-tree", "--show-toplevel"]);
  const lines = result.stdout.trimEnd().split(/\r?\n/);
  let top;
  try {
    top = realpathSync(lines[1]);
  } catch {
    top = "";
  }
  if (lines.length !== 2 || lines[0] !== "true" || top !== root) {
    throw new ReleaseContextError("project root must equal the independent Git top level");
  }
  return root;
}

/** 校验固定长度的小写 Git OID。 */
export function validateOid(value, field) {
  if (typeof value !== "string" || !OID_PATTERN.test(value)) {
    throw new ReleaseContextError(`${field} must be a 40-character lowercase Git OID`);
  }
  return value;
}

/** 校验可公开写入证据的短文本。 */
export function publicText(value, field) {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length === 0 ||
    value.length > 500 ||
    [...value].some((character) => {
      const code = character.codePointAt(0);
      return code < 32 || code === 127;
    })
  ) {
    throw new ReleaseContextError(`${field} must be 1-500 trimmed printable characters`);
  }
  return value;
}

/** 拒绝 revision 语法与无法唯一表示分支的伪引用。 */
export function validBranchName(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.startsWith("-") ||
    value === "@" ||
    value === "HEAD" ||
    value.endsWith("/") ||
    value.endsWith(".") ||
    value.includes("..") ||
    value.includes("@{") ||
    value.includes("//")
  ) {
    return false;
  }
  const forbidden = new Set([" ", "~", "^", ":", "?", "*", "[", "\\"]);
  if ([...value].some((character) => {
    const code = character.codePointAt(0);
    return code < 32 || code === 127 || forbidden.has(character);
  })) {
    return false;
  }
  return value.split("/").every(
    (component) => component && !component.startsWith(".") && !component.endsWith(".lock"),
  );
}

/** 确认对象只包含固定字段。 */
function hasExactKeys(value, keys) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

/** 校验单次发布的语义审查选择，不把它扩张为分支历史门禁。 */
export function validateReleaseReview(value, sourceHead) {
  const required = [
    "selection", "status", "scopeBase", "sourceHead", "scopeDiffSha256",
    "reviewedSourceCommit", "checks", "evidenceSummary", "reason", "remainingRisk",
  ];
  if (!hasExactKeys(value, required)) {
    throw new ReleaseContextError("releaseReview fields are invalid");
  }
  if (value.sourceHead !== sourceHead) {
    throw new ReleaseContextError("releaseReview.sourceHead must equal sourceHead");
  }
  const scopeBase = validateOid(value.scopeBase, "releaseReview.scopeBase");
  if (typeof value.scopeDiffSha256 !== "string" || !SHA256_PATTERN.test(value.scopeDiffSha256)) {
    throw new ReleaseContextError("releaseReview.scopeDiffSha256 must be lowercase SHA-256");
  }
  let evidence;
  let reviewed;
  let checks;
  let reason;
  let remainingRisk;
  if (value.selection === "enabled") {
    if (
      value.status !== "passed" ||
      value.reviewedSourceCommit !== sourceHead ||
      JSON.stringify(value.checks) !== JSON.stringify(REVIEW_CHECKS) ||
      value.reason !== null ||
      value.remainingRisk !== null
    ) {
      throw new ReleaseContextError("enabled releaseReview is inconsistent");
    }
    evidence = publicText(value.evidenceSummary, "releaseReview.evidenceSummary");
    reviewed = sourceHead;
    checks = [...REVIEW_CHECKS];
    reason = null;
    remainingRisk = null;
  } else if (value.selection === "disabled") {
    if (
      value.status !== "Not run" ||
      value.reviewedSourceCommit !== null ||
      !Array.isArray(value.checks) ||
      value.checks.length !== 0 ||
      value.evidenceSummary !== null
    ) {
      throw new ReleaseContextError("disabled releaseReview is inconsistent");
    }
    evidence = null;
    reviewed = null;
    checks = [];
    reason = publicText(value.reason, "releaseReview.reason");
    remainingRisk = publicText(value.remainingRisk, "releaseReview.remainingRisk");
  } else {
    throw new ReleaseContextError("releaseReview.selection is invalid");
  }
  return {
    selection: value.selection,
    status: value.status,
    scopeBase,
    sourceHead,
    scopeDiffSha256: value.scopeDiffSha256,
    reviewedSourceCommit: reviewed,
    checks,
    evidenceSummary: evidence,
    reason,
    remainingRisk,
  };
}

/** 校验候选签名选择，确保禁用和不适用状态不携带矛盾证据。 */
export function validateCandidateSelections(value) {
  const required = [
    "macosSigningSelection", "macosSigningSource", "macosSigningReason",
    "macosSigningRemainingRisk",
  ];
  if (!hasExactKeys(value, required)) {
    throw new ReleaseContextError("candidateSelections fields are invalid");
  }
  const signing = value.macosSigningSelection;
  const source = value.macosSigningSource;
  let reason;
  let risk;
  if (signing === "not-applicable") {
    if (source !== "not-applicable" || value.macosSigningReason !== null || value.macosSigningRemainingRisk !== null) {
      throw new ReleaseContextError("not-applicable macOS signing selection is inconsistent");
    }
    reason = null;
    risk = null;
  } else if (signing === "enabled") {
    if (!["configured", "requested", "channel-required"].includes(source) || value.macosSigningReason !== null || value.macosSigningRemainingRisk !== null) {
      throw new ReleaseContextError("enabled macOS signing selection is inconsistent");
    }
    reason = null;
    risk = null;
  } else if (signing === "disabled") {
    if (source !== "not-requested") {
      throw new ReleaseContextError("disabled macOS signing selection source is invalid");
    }
    reason = publicText(value.macosSigningReason, "candidateSelections.macosSigningReason");
    risk = publicText(value.macosSigningRemainingRisk, "candidateSelections.macosSigningRemainingRisk");
  } else {
    throw new ReleaseContextError("macOS signing selection is invalid");
  }
  return {
    macosSigningSelection: signing,
    macosSigningSource: source,
    macosSigningReason: reason,
    macosSigningRemainingRisk: risk,
  };
}

/** 规范化完整发布上下文并拒绝未知或缺失字段。 */
export function validateContext(value) {
  const required = [
    "schemaVersion", "gitPublication", "sourceHead", "version", "releaseDate",
    "expectedTag", "remote", "defaultBranch", "releaseReview", "candidateSelections",
  ];
  if (!hasExactKeys(value, required) || value.schemaVersion !== 2) {
    throw new ReleaseContextError("release context fields or schemaVersion are invalid");
  }
  const sourceHead = validateOid(value.sourceHead, "sourceHead");
  if (typeof value.version !== "string" || !VERSION_PATTERN.test(value.version) || value.version.slice(0, 1).toLowerCase() === "v") {
    throw new ReleaseContextError("version must be non-empty, safe, and omit the v prefix");
  }
  if (typeof value.releaseDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.releaseDate)) {
    throw new ReleaseContextError("releaseDate must use YYYY-MM-DD");
  }
  const parsed = new Date(`${value.releaseDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value.releaseDate) {
    throw new ReleaseContextError("releaseDate must be a valid YYYY-MM-DD date");
  }
  const compactDate = value.releaseDate.replaceAll("-", "");
  const expectedTag = `v${value.version}-${compactDate}`;
  if (value.expectedTag !== expectedTag) {
    throw new ReleaseContextError("expectedTag does not match v{version}-{YYYYMMDD}");
  }
  let remote;
  if (value.gitPublication === "local") {
    if (value.remote !== null) {
      throw new ReleaseContextError("local gitPublication requires remote to be null");
    }
    remote = null;
  } else if (value.gitPublication === "remote") {
    if (typeof value.remote !== "string" || !REMOTE_PATTERN.test(value.remote)) {
      throw new ReleaseContextError("remote gitPublication requires a valid remote");
    }
    remote = value.remote;
  } else {
    throw new ReleaseContextError("gitPublication must be local or remote");
  }
  if (!validBranchName(value.defaultBranch)) {
    throw new ReleaseContextError("defaultBranch is invalid");
  }
  return {
    schemaVersion: 2,
    gitPublication: value.gitPublication,
    sourceHead,
    version: value.version,
    releaseDate: value.releaseDate,
    expectedTag,
    remote,
    defaultBranch: value.defaultBranch,
    releaseReview: validateReleaseReview(value.releaseReview, sourceHead),
    candidateSelections: validateCandidateSelections(value.candidateSelections),
  };
}

/** 生成跨平台固定 LF 与两个空格缩进的规范 JSON 字节。 */
export function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/** 读取并规范校验发布上下文，返回规范字节与摘要。 */
export function loadContext(root) {
  const path = join(root, CONTEXT_RELATIVE_PATH);
  let metadata;
  try {
    metadata = lstatSync(path);
  } catch {
    throw new ReleaseContextError("release context must be a non-symbolic regular file");
  }
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new ReleaseContextError("release context must be a non-symbolic regular file");
  }
  const raw = readFileSync(path);
  let value;
  try {
    value = JSON.parse(UTF8_DECODER.decode(raw));
  } catch {
    throw new ReleaseContextError("release context must be valid UTF-8 JSON");
  }
  const normalized = validateContext(value);
  const canonical = canonicalBytes(normalized);
  const normalizedRaw = Buffer.from(
    UTF8_DECODER.decode(raw).replaceAll("\r\n", "\n"),
    "utf8",
  );
  if (!normalizedRaw.equals(canonical)) {
    throw new ReleaseContextError("release context must use canonical formatting");
  }
  return {
    value: normalized,
    canonical,
    digest: createHash("sha256").update(canonical).digest("hex"),
  };
}

/** 读取远端声明的唯一默认分支。 */
export function remoteDefaultBranch(root, remote) {
  if (!runGit(root, ["remote"]).stdout.split(/\r?\n/).includes(remote)) {
    throw new ReleaseContextError(`remote is not configured: ${remote}`);
  }
  const result = runGit(root, ["ls-remote", "--symref", remote, "HEAD"]);
  const branches = result.stdout.split(/\r?\n/)
    .filter((line) => line.startsWith("ref: refs/heads/") && line.endsWith("\tHEAD"))
    .map((line) => line.split("\t", 1)[0].slice("ref: refs/heads/".length));
  if (branches.length !== 1 || !branches[0]) {
    throw new ReleaseContextError("remote HEAD is not an unambiguous branch");
  }
  return branches[0];
}

/** 读取一个精确远端引用的 40 位提交。 */
export function remoteRefOid(root, remote, reference) {
  const matches = runGit(root, ["ls-remote", remote, reference]).stdout.split(/\r?\n/)
    .filter((line) => line.endsWith(`\t${reference}`))
    .map((line) => line.split("\t", 1)[0]);
  if (matches.length !== 1 || !OID_PATTERN.test(matches[0])) {
    throw new ReleaseContextError(`remote ref is missing or ambiguous: ${reference}`);
  }
  return matches[0];
}

/** 读取一个精确本地引用最终指向的提交。 */
export function localRefOid(root, reference) {
  const result = runGit(root, ["rev-parse", "--verify", `${reference}^{commit}`], { check: false });
  const oid = result.stdout.trim();
  if (result.returncode !== 0 || !OID_PATTERN.test(oid)) {
    throw new ReleaseContextError(`local ref is missing or invalid: ${reference}`);
  }
  return oid;
}

/** 根据 CLI 选择构造固定发布审查对象。 */
function buildReview(args) {
  const enabled = args.reviewSelection === "enabled";
  return {
    selection: args.reviewSelection,
    status: enabled ? "passed" : "Not run",
    scopeBase: args.scopeBase,
    sourceHead: args.sourceHead,
    scopeDiffSha256: args.scopeDiffSha256,
    reviewedSourceCommit: enabled ? args.sourceHead : null,
    checks: enabled ? [...REVIEW_CHECKS] : [],
    evidenceSummary: enabled ? (args.reviewEvidenceSummary ?? null) : null,
    reason: enabled ? null : (args.reviewReason ?? null),
    remainingRisk: enabled ? null : (args.reviewRemainingRisk ?? null),
  };
}

/** 根据 CLI 选择构造候选签名对象。 */
function buildSelections(args) {
  return {
    macosSigningSelection: args.macosSigningSelection,
    macosSigningSource: args.macosSigningSource,
    macosSigningReason: args.macosSigningReason ?? null,
    macosSigningRemainingRisk: args.macosSigningRemainingRisk ?? null,
  };
}

/** 在同目录建立排他临时文件并原子替换目标。 */
function atomicWrite(path, payload) {
  const directory = dirname(path);
  let temporary;
  let descriptor;
  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      temporary = join(directory, `.release-context.${process.pid}.${randomBytes(8).toString("hex")}.tmp`);
      try {
        descriptor = openSync(temporary, "wx", 0o600);
        break;
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
    }
    if (descriptor === undefined) throw new Error("temporary file collision");
    writeFileSync(descriptor, payload);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, path);
    temporary = undefined;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (temporary && existsSync(temporary)) unlinkSync(temporary);
  }
}

/** 写入本次发布唯一规范上下文。 */
export function writeContext(args) {
  const root = resolveRoot(args.projectRoot);
  const head = runGit(root, ["rev-parse", "--verify", "HEAD^{commit}"]).stdout.trim();
  if (head !== args.sourceHead) {
    throw new ReleaseContextError("sourceHead must equal the current HEAD before metadata commit");
  }
  let publication;
  let remote;
  let defaultBranch;
  if (args.localOnly) {
    if (args.defaultBranch === undefined) {
      throw new ReleaseContextError("--default-branch is required with --local-only");
    }
    if (!validBranchName(args.defaultBranch) || runGit(root, ["check-ref-format", "--branch", args.defaultBranch], { check: false }).returncode !== 0) {
      throw new ReleaseContextError("--default-branch must name one safe Git branch");
    }
    publication = "local";
    remote = null;
    defaultBranch = args.defaultBranch;
    localRefOid(root, `refs/heads/${defaultBranch}`);
  } else {
    if (args.defaultBranch !== undefined) {
      throw new ReleaseContextError("--default-branch is only valid with --local-only");
    }
    publication = "remote";
    remote = args.remote;
    defaultBranch = remoteDefaultBranch(root, remote);
  }
  const value = validateContext({
    schemaVersion: 2,
    gitPublication: publication,
    sourceHead: args.sourceHead,
    version: args.version,
    releaseDate: args.releaseDate,
    expectedTag: `v${args.version}-${args.releaseDate.replaceAll("-", "")}`,
    remote,
    defaultBranch,
    releaseReview: buildReview(args),
    candidateSelections: buildSelections(args),
  });
  const destination = join(root, CONTEXT_RELATIVE_PATH);
  const directory = dirname(destination);
  if (existsSync(directory) && lstatSync(directory).isSymbolicLink()) {
    throw new ReleaseContextError(".harness must not be a symbolic link");
  }
  mkdirSync(directory, { recursive: true, mode: 0o755 });
  if (!statSync(directory).isDirectory()) {
    throw new ReleaseContextError(".harness must be a directory");
  }
  const payload = canonicalBytes(value);
  atomicWrite(destination, payload);
  return {
    status: "written",
    path: CONTEXT_RELATIVE_PATH,
    sourceHead: value.sourceHead,
    expectedTag: value.expectedTag,
    gitPublication: value.gitPublication,
    remote: value.remote,
    defaultBranch: value.defaultBranch,
    releaseContextSha256: createHash("sha256").update(payload).digest("hex"),
  };
}

/** 校验上下文；发布后模式另验证 HEAD、clean、分支和适用 refs。 */
export function checkContext(args, { published }) {
  const root = resolveRoot(args.projectRoot);
  const { value, canonical, digest } = loadContext(root);
  if (args.expectedSha256 !== undefined && digest !== args.expectedSha256) {
    throw new ReleaseContextError("release context SHA-256 does not match the expected value");
  }
  if (args.expectedVersion !== undefined && value.version !== args.expectedVersion) {
    throw new ReleaseContextError("release context version does not match the expected value");
  }
  const result = {
    status: published ? "released" : "valid",
    path: CONTEXT_RELATIVE_PATH,
    releaseContextSha256: digest,
    ...value,
  };
  if (!published) return result;
  const head = runGit(root, ["rev-parse", "--verify", "HEAD^{commit}"]).stdout.trim();
  validateOid(head, "HEAD");
  if (args.expectedHead !== undefined && head !== args.expectedHead) {
    throw new ReleaseContextError("HEAD does not match the expected source commit");
  }
  const status = runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"], { text: false }).stdout;
  if (status.length !== 0) throw new ReleaseContextError("released worktree must be clean");
  const branchResult = runGit(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], { check: false });
  const branch = branchResult.stdout.trim();
  if (branchResult.returncode !== 0 || branch !== value.defaultBranch) {
    throw new ReleaseContextError("current branch is not the release default branch");
  }
  const committed = runGit(root, ["show", `HEAD:${CONTEXT_RELATIVE_PATH}`], { text: false }).stdout;
  if (!committed.equals(canonical)) {
    throw new ReleaseContextError("release context bytes are not tracked by HEAD");
  }
  if (localRefOid(root, `refs/tags/${value.expectedTag}`) !== head) {
    throw new ReleaseContextError("local release tag does not point to HEAD");
  }
  if (value.gitPublication === "remote") {
    if (remoteDefaultBranch(root, value.remote) !== value.defaultBranch) {
      throw new ReleaseContextError("remote default branch changed after release preparation");
    }
    if (remoteRefOid(root, value.remote, `refs/heads/${value.defaultBranch}`) !== head) {
      throw new ReleaseContextError("remote default branch does not point to HEAD");
    }
    if (remoteRefOid(root, value.remote, `refs/tags/${value.expectedTag}`) !== head) {
      throw new ReleaseContextError("remote release tag does not point to HEAD");
    }
  }
  return { ...result, sourceCommit: head, branch };
}

/** 把 kebab-case CLI 选项转换为内部 camelCase 字段。 */
function optionName(value) {
  return value.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}

/** 解析固定 CLI，参数结构错误保持 argparse 的退出码 2。 */
export function parseArguments(argv) {
  if (argv.length === 0 || !["write", "check", "verify"].includes(argv[0])) {
    throw Object.assign(new Error("the following arguments are required: command"), { cliExit: 2 });
  }
  const command = argv[0];
  const booleans = new Set(["localOnly"]);
  const commonCheck = new Set(["projectRoot", "expectedSha256", "expectedVersion", "expectedHead"]);
  const allowed = command === "write" ? new Set([
    "projectRoot", "sourceHead", "version", "releaseDate", "localOnly", "remote",
    "defaultBranch", "reviewSelection", "scopeBase", "scopeDiffSha256",
    "reviewEvidenceSummary", "reviewReason", "reviewRemainingRisk",
    "macosSigningSelection", "macosSigningSource", "macosSigningReason",
    "macosSigningRemainingRisk",
  ]) : commonCheck;
  const args = { command, localOnly: false };
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw Object.assign(new Error("unrecognized arguments"), { cliExit: 2 });
    const name = optionName(token);
    if (!allowed.has(name)) throw Object.assign(new Error(`unrecognized arguments: ${token}`), { cliExit: 2 });
    if (booleans.has(name)) {
      args[name] = true;
      continue;
    }
    if (index + 1 >= argv.length || argv[index + 1].startsWith("--")) {
      throw Object.assign(new Error(`argument ${token}: expected one argument`), { cliExit: 2 });
    }
    args[name] = argv[index + 1];
    index += 1;
  }
  if (command === "write") {
    const required = [
      "projectRoot", "sourceHead", "version", "releaseDate", "reviewSelection",
      "scopeBase", "scopeDiffSha256", "macosSigningSelection", "macosSigningSource",
    ];
    const missing = required.filter((field) => args[field] === undefined);
    if (missing.length > 0) throw Object.assign(new Error("the following arguments are required"), { cliExit: 2 });
    if (args.localOnly && args.remote !== undefined) {
      throw Object.assign(new Error("argument --local-only: not allowed with argument --remote"), { cliExit: 2 });
    }
    if (!args.localOnly && args.remote === undefined) {
      throw Object.assign(new Error("one of the arguments --local-only --remote is required"), { cliExit: 2 });
    }
    if (!["enabled", "disabled"].includes(args.reviewSelection)) {
      throw Object.assign(new Error("invalid choice for --review-selection"), { cliExit: 2 });
    }
    if (!["enabled", "disabled", "not-applicable"].includes(args.macosSigningSelection)) {
      throw Object.assign(new Error("invalid choice for --macos-signing-selection"), { cliExit: 2 });
    }
  } else if (args.projectRoot === undefined) {
    throw Object.assign(new Error("the following arguments are required: --project-root"), { cliExit: 2 });
  }
  return args;
}

/** 执行 CLI，成功写 stdout，验证失败写单行 JSON stderr。 */
export function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArguments(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return error.cliExit ?? 2;
  }
  try {
    let result;
    if (args.command === "write") {
      result = writeContext(args);
    } else {
      if (args.expectedSha256 !== undefined && !SHA256_PATTERN.test(args.expectedSha256)) {
        throw new ReleaseContextError("expected SHA-256 must be 64 lowercase hexadecimal characters");
      }
      if (args.expectedHead !== undefined) validateOid(args.expectedHead, "expected HEAD");
      result = checkContext(args, { published: args.command === "verify" });
    }
    const sortValue = (value) => {
      if (Array.isArray(value)) return value.map(sortValue);
      if (value && typeof value === "object") {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
      }
      return value;
    };
    process.stdout.write(`${JSON.stringify(sortValue(result))}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${JSON.stringify({ status: "error", error: message })}\n`);
    return 1;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = main();
}
