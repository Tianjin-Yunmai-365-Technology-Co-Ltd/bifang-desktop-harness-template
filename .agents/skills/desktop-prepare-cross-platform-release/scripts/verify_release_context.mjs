#!/usr/bin/env node
/** Verify a fetched release context and capture immutable matrix inputs. */

import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const OID_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const CONTEXT_PATH = ".harness/release-context.json";
const HELPER_PATH = ".agents/skills/desktop-prepare-release/scripts/release_context.mjs";
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

/** 表示所取源码不是其发布上下文描述的远端发布结果。 */
export class ContextVerificationError extends Error {
  /** 保存可公开的候选门禁错误。 */
  constructor(message) {
    super(message);
    this.name = "ContextVerificationError";
  }
}

/** 执行 Git 并返回原始字节，避免上下文字节被文本层修改。 */
function runGit(root, args, { check = true } = {}) {
  const result = spawnSync("git", ["-C", root, ...args], {
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GCM_INTERACTIVE: "Never",
    },
    input: Buffer.alloc(0),
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw new ContextVerificationError("git executable is unavailable");
  if (check && result.status !== 0) {
    throw new ContextVerificationError(`git ${args.join(" ")} failed: ${result.stderr.toString("utf8").trim()}`);
  }
  return { returncode: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

/** 精确解析一个已 fetch 的 commit ref。 */
function resolveRef(root, reference) {
  const result = runGit(root, ["rev-parse", "--verify", `${reference}^{commit}`], { check: false });
  const oid = result.stdout.toString("utf8").trim();
  if (result.returncode !== 0 || !OID_PATTERN.test(oid)) {
    throw new ContextVerificationError(`missing or invalid fetched ref: ${reference}`);
  }
  return oid;
}

/** 动态加载仓库内已跟踪的 Node 发布上下文验证器。 */
async function loadValidator(root) {
  const helper = join(root, HELPER_PATH);
  let metadata;
  try { metadata = lstatSync(helper); } catch { metadata = null; }
  if (!metadata?.isFile() || metadata.isSymbolicLink()) {
    throw new ContextVerificationError("tracked release-context helper is missing or symbolic");
  }
  try {
    const module = await import(`${pathToFileURL(helper).href}?oid=${Date.now()}-${randomBytes(4).toString("hex")}`);
    if (typeof module.validateContext !== "function" || typeof module.canonicalBytes !== "function") {
      throw new Error("validator interface missing");
    }
    return module;
  } catch (error) {
    throw new ContextVerificationError("cannot load the release-context validator", { cause: error });
  }
}

/** 计算构建前后必须完全相同的发布上下文快照。 */
export async function calculateSnapshot(root, sourceCommit, expectedDigest, repositoryDefaultBranch) {
  if (!OID_PATTERN.test(sourceCommit)) {
    throw new ContextVerificationError("source_commit must be a lowercase 40-character OID");
  }
  if (!SHA256_PATTERN.test(expectedDigest)) {
    throw new ContextVerificationError("release_context_sha256 must be lowercase SHA-256");
  }
  if (typeof repositoryDefaultBranch !== "string" || !repositoryDefaultBranch || /\s/u.test(repositoryDefaultBranch)) {
    throw new ContextVerificationError("repository default branch is invalid");
  }
  const gitRoot = realpathSync(runGit(root, ["rev-parse", "--show-toplevel"]).stdout.toString("utf8").trim());
  if (gitRoot !== root) throw new ContextVerificationError("project root must be the independent Git top level");
  const head = runGit(root, ["rev-parse", "--verify", "HEAD^{commit}"]).stdout.toString("utf8").trim();
  const branchResult = runGit(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], { check: false });
  const branch = branchResult.stdout.toString("utf8").trim();
  if (head !== sourceCommit || branchResult.returncode !== 0 || branch !== repositoryDefaultBranch) {
    throw new ContextVerificationError("runner must check out the named repository default branch at source_commit");
  }
  if (runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"]).stdout.length !== 0) {
    throw new ContextVerificationError("runner worktree must remain clean");
  }
  const contextPath = join(root, CONTEXT_PATH);
  let metadata;
  try { metadata = lstatSync(contextPath); } catch { metadata = null; }
  if (!metadata?.isFile() || metadata.isSymbolicLink()) {
    throw new ContextVerificationError("release context must be a non-symbolic regular file");
  }
  const committed = runGit(root, ["show", `${sourceCommit}:${CONTEXT_PATH}`]).stdout;
  if (!committed.equals(readFileSync(contextPath))) {
    throw new ContextVerificationError("working release context bytes do not match source_commit");
  }
  const digest = createHash("sha256").update(committed).digest("hex");
  if (digest !== expectedDigest) {
    throw new ContextVerificationError("release context digest does not match the host-verified input");
  }
  let normalized;
  try {
    const parsed = JSON.parse(UTF8_DECODER.decode(committed));
    const validator = await loadValidator(root);
    normalized = validator.validateContext(parsed);
    if (!committed.equals(validator.canonicalBytes(normalized))) {
      throw new ContextVerificationError("release context is not canonical");
    }
  } catch (error) {
    if (error instanceof ContextVerificationError) throw error;
    throw new ContextVerificationError("release context failed schema validation", { cause: error });
  }
  if (normalized.gitPublication !== "remote") {
    throw new ContextVerificationError("cross-platform provider release requires remote gitPublication");
  }
  if (normalized.defaultBranch !== repositoryDefaultBranch) {
    throw new ContextVerificationError("provider default branch differs from release context");
  }
  if (resolveRef(root, `refs/remotes/origin/${repositoryDefaultBranch}`) !== sourceCommit) {
    throw new ContextVerificationError("fetched origin default branch does not equal source_commit");
  }
  if (resolveRef(root, `refs/tags/${normalized.expectedTag}`) !== sourceCommit) {
    throw new ContextVerificationError("fetched release tag does not equal source_commit");
  }
  const cliSelections = {
    macosSigningSelection: "not-applicable",
    macosSigningSource: "not-applicable",
    macosSigningReason: null,
    macosSigningRemainingRisk: null,
  };
  if (JSON.stringify(normalized.candidateSelections) !== JSON.stringify(cliSelections)) {
    throw new ContextVerificationError("Rust CLI candidate selections must be exactly not-applicable");
  }
  return {
    sourceCommit,
    releaseContextSha256: digest,
    gitPublication: normalized.gitPublication,
    remote: normalized.remote,
    defaultBranch: repositoryDefaultBranch,
    version: normalized.version,
    expectedTag: normalized.expectedTag,
    releaseReview: normalized.releaseReview,
    candidateSelections: normalized.candidateSelections,
  };
}

/** 递归排序对象字段，生成确定性快照与 CLI JSON。 */
function sortedValue(value) {
  if (Array.isArray(value)) return value.map(sortedValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortedValue(value[key])]));
  }
  return value;
}

/** 读取既有快照并要求普通 UTF-8 JSON 对象。 */
function readSnapshot(path) {
  let metadata;
  try { metadata = lstatSync(path); } catch { metadata = null; }
  if (!metadata?.isFile() || metadata.isSymbolicLink()) {
    throw new ContextVerificationError("release context snapshot must be a regular file");
  }
  try {
    const value = JSON.parse(UTF8_DECODER.decode(readFileSync(path)));
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("not object");
    return value;
  } catch {
    throw new ContextVerificationError("release context snapshot is invalid");
  }
}

/** 在仓库外的既有目录中原子写入一次性快照。 */
function writeSnapshot(path, value, root) {
  const parent = realpathSync(dirname(path));
  try {
    lstatSync(path);
    throw new ContextVerificationError("release context snapshot already exists");
  } catch (error) {
    if (error instanceof ContextVerificationError) throw error;
    if (error.code !== "ENOENT") throw new ContextVerificationError("release context snapshot path is unavailable");
  }
  const relation = relative(root, parent);
  if (relation === "" || (!relation.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && relation !== ".." && !isAbsolute(relation))) {
    throw new ContextVerificationError("release context snapshot must be outside the repository");
  }
  const payload = Buffer.from(`${JSON.stringify(sortedValue(value))}\n`, "utf8");
  let temporary;
  let descriptor;
  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      temporary = join(parent, `.${path.split(/[\\/]/).at(-1)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`);
      try {
        descriptor = openSync(temporary, "wx", 0o600);
        break;
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
    }
    if (descriptor === undefined) throw new ContextVerificationError("cannot allocate release context snapshot temporary file");
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

/** 解析 capture/verify 的固定 CLI 参数。 */
function parseArguments(argv) {
  if (argv.length === 0 || !["capture", "verify"].includes(argv[0])) {
    throw Object.assign(new Error("mode must be capture or verify"), { cliExit: 2 });
  }
  const args = { mode: argv[0] };
  const allowed = new Set([
    "projectRoot", "sourceCommit", "expectedContextSha256", "repositoryDefaultBranch", "snapshot",
  ]);
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--") || index + 1 >= argv.length || argv[index + 1].startsWith("--")) {
      throw Object.assign(new Error(`invalid argument: ${token}`), { cliExit: 2 });
    }
    const name = token.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
    if (!allowed.has(name)) throw Object.assign(new Error(`invalid argument: ${token}`), { cliExit: 2 });
    args[name] = argv[index + 1];
    index += 1;
  }
  for (const name of ["projectRoot", "sourceCommit", "expectedContextSha256", "repositoryDefaultBranch", "snapshot"]) {
    if (args[name] === undefined) throw Object.assign(new Error("required arguments are missing"), { cliExit: 2 });
  }
  return args;
}

/** 执行捕获或复核，并输出稳定 JSON 结果。 */
export async function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArguments(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return error.cliExit ?? 2;
  }
  try {
    const root = realpathSync(resolve(args.projectRoot));
    const snapshot = resolve(args.snapshot);
    const calculated = await calculateSnapshot(
      root,
      args.sourceCommit,
      args.expectedContextSha256,
      args.repositoryDefaultBranch,
    );
    if (args.mode === "capture") {
      writeSnapshot(snapshot, calculated, root);
    } else if (JSON.stringify(sortedValue(readSnapshot(snapshot))) !== JSON.stringify(sortedValue(calculated))) {
      throw new ContextVerificationError("release context changed between build checks");
    }
    const output = sortedValue({
      status: `release-context-${args.mode}d`,
      sourceCommit: calculated.sourceCommit,
      releaseContextSha256: calculated.releaseContextSha256,
      expectedTag: calculated.expectedTag,
    });
    process.stdout.write(`${JSON.stringify(output)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n`);
    return 1;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = await main();
}
