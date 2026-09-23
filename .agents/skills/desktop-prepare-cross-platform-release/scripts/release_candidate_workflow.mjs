#!/usr/bin/env node
/** 为三平台候选工作流提供跨平台 Node 标准库门禁。 */

import {
  appendFileSync,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { arch, platform, release, type, version as osVersion } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { gunzipSync, inflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const OID_PATTERN = /^[0-9a-f]{40}$/;
const MINIMUM_NODE = [24, 21, 0];
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

/** 表示 workflow 输入、源码、制品或暂存目录不满足固定候选契约。 */
export class WorkflowError extends Error {
  /** 保存适合 GitHub Actions 日志展示的失败原因。 */
  constructor(message) {
    super(message);
    this.name = "WorkflowError";
  }
}

/** 运行固定外部工具且不经过 shell。 */
function run(command, args, { check = true, text = true } = {}) {
  const result = spawnSync(command, args, {
    encoding: text ? "utf8" : undefined,
    env: process.env,
    input: Buffer.alloc(0),
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw new WorkflowError(`${command} is unavailable`);
  if (check && result.status !== 0) {
    const stderr = text ? result.stderr : result.stderr.toString("utf8");
    throw new WorkflowError(`${command} failed: ${stderr.trim()}`);
  }
  return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

/** 要求环境变量存在且非空。 */
function environment(name) {
  const value = process.env[name];
  if (!value) throw new WorkflowError(`缺少环境变量 ${name}`);
  return value;
}

/** 向 GitHub Actions 环境或输出文件追加单行键值。 */
function appendGithubFile(pathName, values) {
  const path = environment(pathName);
  const lines = Object.entries(values).map(([key, value]) => {
    const text = String(value);
    if (/[\r\n]/u.test(text)) throw new WorkflowError(`${key} 不能包含换行`);
    return `${key}=${text}`;
  });
  appendFileSync(path, `${lines.join("\n")}\n`, "utf8");
}

/** 验证当前 Node.js 是满足连续下界的正式版本。 */
function checkNodeRuntime() {
  const raw = process.versions.node;
  if (raw.includes("-")) throw new WorkflowError("候选 workflow 不接受 Node.js 预发布版本");
  const parts = raw.split(".").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) {
    throw new WorkflowError("无法解析 Node.js 版本");
  }
  for (let index = 0; index < 3; index += 1) {
    if (parts[index] > MINIMUM_NODE[index]) return;
    if (parts[index] < MINIMUM_NODE[index]) {
      throw new WorkflowError("候选 workflow 要求 Node.js >=24.21.0");
    }
  }
}

/** 验证 GitHub checkout 精确绑定动态默认分支与授权提交。 */
function verifyCheckout() {
  const expected = environment("SOURCE_COMMIT");
  if (!OID_PATTERN.test(expected)) throw new WorkflowError("source_commit 必须是由小写十六进制字符组成的 40 字符 SHA");
  const defaultBranch = environment("REPOSITORY_DEFAULT_BRANCH");
  if (/\s/u.test(defaultBranch)) throw new WorkflowError(`GitHub 动态默认分支无效：${JSON.stringify(defaultBranch)}`);
  const observed = run("git", ["rev-parse", "HEAD"]).stdout.trim();
  if (observed !== expected) throw new WorkflowError(`检出源码不匹配：预期=${expected}，实际=${observed}`);
  const branch = run("git", ["symbolic-ref", "--quiet", "--short", "HEAD"]).stdout.trim();
  if (branch !== defaultBranch) {
    throw new WorkflowError(`必须检出具名 GitHub 动态默认分支：预期=${JSON.stringify(defaultBranch)}，实际=${JSON.stringify(branch)}`);
  }
  if (run("git", ["status", "--porcelain=v1", "--untracked-files=all"]).stdout.length) {
    throw new WorkflowError("检出后的工作树不 clean");
  }
}

/** 从根 Cargo.toml 精确读取 workspace MSRV 并写入 GITHUB_ENV。 */
function readMsrv() {
  const manifest = UTF8_DECODER.decode(readFileSync("Cargo.toml"));
  const section = /^\[workspace\.package\][ \t]*\r?$\n(?<body>[\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(manifest);
  if (!section) throw new WorkflowError("根 Cargo.toml 缺少 [workspace.package]");
  const match = /^rust-version\s*=\s*"(?<version>\d+\.\d+(?:\.\d+)?)"\s*$/m.exec(section.groups.body);
  if (!match) throw new WorkflowError("[workspace.package] 缺少可识别的 rust-version");
  const value = match.groups.version.split(".").length === 2 ? `${match.groups.version}.0` : match.groups.version;
  appendGithubFile("GITHUB_ENV", { RUSTUP_TOOLCHAIN: value });
  process.stdout.write(`使用项目声明的最低 Rust 工具链 ${value}\n`);
}

/** 从 Cargo metadata 验证目标二进制的唯一版本。 */
function verifyVersion() {
  const metadata = JSON.parse(run("cargo", ["metadata", "--locked", "--format-version", "1", "--no-deps"]).stdout);
  const product = environment("PRODUCT_NAME");
  const versions = [...new Set(metadata.packages
    .filter((pkg) => pkg.targets.some((target) => target.name === product && target.kind.includes("bin")))
    .map((pkg) => pkg.version))];
  if (versions.length !== 1 || versions[0] !== environment("VERSION")) {
    throw new WorkflowError(`候选版本不匹配：Cargo=${JSON.stringify(versions.sort())}，输入=${environment("VERSION")}`);
  }
}

/** 验证并冻结发布更新日志摘要。 */
function hashReleaseNotes() {
  const path = "release-notes.json";
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new WorkflowError("release-notes.json 必须是非符号链接普通文件");
  }
  const digest = createHash("sha256").update(readFileSync(path)).digest("hex");
  appendGithubFile("GITHUB_ENV", { RELEASE_NOTES_SHA256: digest });
}

/** 先列出并确认至少一个 Rust 测试，再由 workflow 执行完整测试。 */
function listTests() {
  const result = run(
    "cargo",
    ["test", "--workspace", "--all-targets", "--all-features", "--locked", "--", "--list"],
    { check: false },
  );
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.status !== 0) return result.status;
  const count = result.stdout.split(/\r?\n/).filter((line) => line.trimEnd().endsWith(": test")).length;
  if (count === 0) throw new WorkflowError("未发现测试");
  process.stdout.write(`发现 ${count} 个测试\n`);
  return 0;
}

/** 复核测试没有改变源码提交或 clean 状态。 */
function verifyPostTest() {
  const head = run("git", ["rev-parse", "HEAD"]).stdout.trim();
  const status = run("git", ["status", "--porcelain=v1", "--untracked-files=all"]).stdout;
  if (head !== environment("SOURCE_COMMIT") || status) {
    throw new WorkflowError("测试后源码提交或 clean 状态发生变化");
  }
}

/** 从 Unix/Windows 条件步骤输出中解析唯一安全候选组合。 */
function resolveArtifact() {
  const pairs = [
    [process.env.UNIX_ARCHIVE ?? "", process.env.UNIX_STAGE ?? ""],
    [process.env.WINDOWS_ARCHIVE ?? "", process.env.WINDOWS_STAGE ?? ""],
  ].filter(([archive, stage]) => archive || stage);
  if (pairs.length !== 1 || !pairs[0][0] || !pairs[0][1] || basename(pairs[0][0]) !== pairs[0][0]) {
    throw new WorkflowError(`预期恰好一个安全的候选归档/暂存目录组合，实际为 ${JSON.stringify(pairs)}`);
  }
  appendGithubFile("GITHUB_OUTPUT", { archive_name: pairs[0][0], stage_path: pairs[0][1] });
}

/** 要求路径是非符号链接普通文件。 */
function requirePlainFile(path, label) {
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) throw new WorkflowError(`${label}必须是非符号链接的普通文件`);
}

/** 要求路径是非符号链接目录，且 realpath 不漂移。 */
function requirePlainDirectory(path, label) {
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isDirectory() || realpathSync(path) !== resolve(path)) {
    throw new WorkflowError(`${label}必须是普通目录`);
  }
}

/** 从 tar.gz 中读取根级 release-notes.json。 */
function releaseNotesFromTarGz(path) {
  const archive = gunzipSync(readFileSync(path));
  for (let offset = 0; offset + 512 <= archive.length;) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/s, "");
    const sizeText = header.subarray(124, 136).toString("ascii").replace(/\0.*$/s, "").trim();
    const size = Number.parseInt(sizeText || "0", 8);
    if (!Number.isSafeInteger(size) || size < 0) throw new WorkflowError("tar 候选归档结构无效");
    const contentStart = offset + 512;
    if (name === "release-notes.json") return archive.subarray(contentStart, contentStart + size);
    offset = contentStart + Math.ceil(size / 512) * 512;
  }
  throw new WorkflowError("候选归档缺少 release-notes.json");
}

/** 从 zip central directory 中读取根级 release-notes.json。 */
function releaseNotesFromZip(path) {
  const archive = readFileSync(path);
  let eocd = -1;
  const minimum = Math.max(0, archive.length - 65_557);
  for (let offset = archive.length - 22; offset >= minimum; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new WorkflowError("zip 候选归档结构无效");
  const entries = archive.readUInt16LE(eocd + 10);
  let offset = archive.readUInt32LE(eocd + 16);
  for (let index = 0; index < entries; index += 1) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) throw new WorkflowError("zip central directory 无效");
    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (name === "release-notes.json") {
      if (archive.readUInt32LE(localOffset) !== 0x04034b50) throw new WorkflowError("zip local header 无效");
      const localName = archive.readUInt16LE(localOffset + 26);
      const localExtra = archive.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localName + localExtra;
      const compressed = archive.subarray(start, start + compressedSize);
      const content = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null;
      if (!content || content.length !== uncompressedSize) throw new WorkflowError("zip 更新日志压缩格式不受支持");
      return content;
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new WorkflowError("候选归档缺少 release-notes.json");
}

/** 精确列出目录中的直接子项名称。 */
function names(path) {
  return readdirSync(path).sort();
}

/** 比较两个名称集合。 */
function sameNames(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

/** 验证归档、上下文和签名投影后写入候选 manifest。 */
function writeManifest() {
  const root = realpathSync(environment("GITHUB_WORKSPACE"));
  const stage = resolve(environment("CANDIDATE_STAGE"));
  requirePlainDirectory(stage, "候选暂存目录");
  const prefix = `.${environment("PRODUCT_NAME")}.release-candidate.`;
  if (realpathSync(dirname(stage)) !== realpathSync(dirname(root)) || !basename(stage).startsWith(prefix)) {
    throw new WorkflowError("候选暂存目录必须位于项目根同级");
  }
  const archiveName = environment("CANDIDATE_ARCHIVE");
  if (basename(archiveName) !== archiveName) throw new WorkflowError("候选归档名称不安全");
  const archive = join(stage, archiveName);
  const checksum = join(stage, `${archiveName}.sha256`);
  const expectedBefore = [archiveName, `${archiveName}.sha256`];
  if (!sameNames(names(stage), expectedBefore)) throw new WorkflowError("生成清单前的候选文件集异常");
  requirePlainFile(archive, "候选归档");
  requirePlainFile(checksum, "候选校验和");
  const digest = createHash("sha256").update(readFileSync(archive)).digest("hex");
  const checksumParts = readFileSync(checksum, "ascii").trim().split(/\s+/);
  if (!checksumParts.length || checksumParts[0].toLowerCase() !== digest) {
    throw new WorkflowError("候选校验和与归档字节不匹配");
  }
  const releaseNotesPath = join(root, "release-notes.json");
  requirePlainFile(releaseNotesPath, "release-notes.json ");
  const releaseNotes = readFileSync(releaseNotesPath);
  const releaseNotesDigest = createHash("sha256").update(releaseNotes).digest("hex");
  if (releaseNotesDigest !== environment("RELEASE_NOTES_SHA256")) {
    throw new WorkflowError("发布更新日志在构建期间发生变化");
  }
  const packaged = archiveName.endsWith(".tar.gz")
    ? releaseNotesFromTarGz(archive)
    : archiveName.endsWith(".zip")
      ? releaseNotesFromZip(archive)
      : null;
  if (!packaged) throw new WorkflowError("候选归档格式不支持更新日志验证");
  if (!packaged.equals(releaseNotes)) throw new WorkflowError("归档内更新日志与源码事实不一致");
  const snapshotPath = environment("RELEASE_CONTEXT_SNAPSHOT");
  requirePlainFile(snapshotPath, "发布上下文快照");
  const snapshot = JSON.parse(UTF8_DECODER.decode(readFileSync(snapshotPath)));
  if (snapshot.sourceCommit !== environment("SOURCE_COMMIT")) throw new WorkflowError("发布上下文快照未绑定候选 sourceCommit");
  if (snapshot.releaseContextSha256 !== environment("RELEASE_CONTEXT_SHA256")) throw new WorkflowError("发布上下文快照未绑定上下文摘要");
  if (snapshot.version !== environment("VERSION")) throw new WorkflowError("发布上下文版本与候选版本不一致");
  const tagDate = String(snapshot.expectedTag ?? "").split("-").at(-1);
  if (snapshot.expectedTag !== `v${environment("VERSION")}-${tagDate}`) throw new WorkflowError("发布上下文 tag 与候选版本不一致");
  const review = snapshot.releaseReview;
  const rustc = run("rustc", ["-vV"]).stdout.split(/\r?\n/);
  const target = rustc.find((line) => line.startsWith("host:"))?.split(":", 2)[1]?.trim();
  if (!target) throw new WorkflowError("无法解析 rustc host target");
  const manifest = {
    project: environment("PRODUCT_NAME"),
    version: environment("VERSION"),
    sourceCommit: environment("SOURCE_COMMIT"),
    buildRun: environment("BUILD_RUN_ID"),
    buildMode: "cross-platform-native",
    platform: environment("RUNNER_OS"),
    architecture: environment("RUNNER_ARCH"),
    target,
    host: `${type()} ${release()} ${arch()} ${platform()} ${osVersion()}`,
    archive: archiveName,
    sha256: digest,
    tests: "passed",
    e2eSelection: environment("E2E_SELECTION"),
    releaseContextSha256: snapshot.releaseContextSha256,
    releaseTag: snapshot.expectedTag,
    releaseReview: review,
    candidateSelections: snapshot.candidateSelections,
    reviewSelection: review.selection,
    reviewStatus: review.status,
    releaseNotesVersion: `v${environment("VERSION")}`,
    releaseNotesSha256: releaseNotesDigest,
    releaseNotesPath: "release-notes.json",
    signingStatus: environment("SIGNING_STATUS"),
    signingReason: environment("SIGNING_REASON"),
    signingEvidence: { verification: environment("SIGNING_EVIDENCE"), detachedFiles: [] },
    milestoneAcceptance: "pending",
  };
  if (review.selection === "enabled") {
    manifest.reviewedSourceCommit = review.reviewedSourceCommit;
    manifest.reviewEvidence = {
      scopeBase: review.scopeBase,
      sourceHead: review.sourceHead,
      scopeDiffSha256: review.scopeDiffSha256,
      checks: review.checks,
      evidenceSummary: review.evidenceSummary,
    };
  } else if (review.selection === "disabled") {
    manifest.reviewReason = review.reason;
    manifest.reviewRemainingRisk = review.remainingRisk;
  } else {
    throw new WorkflowError("发布审查选择不受支持");
  }
  const manifestPath = join(stage, `${archiveName}.manifest.json`);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const expectedAfter = [...expectedBefore, basename(manifestPath)];
  if (!sameNames(names(stage), expectedAfter)) throw new WorkflowError("最终候选文件集异常");
}

/** 将精确三文件 stage 以目录级 rename 提交为项目 release。 */
function commitCandidate() {
  const root = realpathSync(environment("GITHUB_WORKSPACE"));
  const releasePath = join(root, "release");
  const stage = resolve(environment("CANDIDATE_STAGE"));
  const archive = environment("CANDIDATE_ARCHIVE");
  const expected = [archive, `${archive}.sha256`, `${archive}.manifest.json`];
  requirePlainDirectory(releasePath, "发布目录");
  requirePlainDirectory(stage, "候选暂存目录");
  const prefix = `.${environment("PRODUCT_NAME")}.release-candidate.`;
  if (realpathSync(dirname(stage)) !== realpathSync(dirname(root)) || !basename(stage).startsWith(prefix)) {
    throw new WorkflowError("候选暂存目录必须位于项目根同级");
  }
  if (names(releasePath).length) throw new WorkflowError("构建前刷新后发布目录发生变化");
  if (!sameNames(names(stage), expected)) throw new WorkflowError("提交前候选暂存目录文件集发生变化");
  rmdirSync(releasePath);
  renameSync(stage, releasePath);
  requirePlainDirectory(releasePath, "已提交发布目录");
  if (realpathSync(releasePath) !== releasePath) throw new WorkflowError("已提交的发布目录越出项目根目录");
  if (!sameNames(names(releasePath), expected)) throw new WorkflowError("已提交的发布文件集不是精确候选集合");
  for (const name of expected) requirePlainFile(join(releasePath, name), "已提交候选文件");
}

/** 执行一个固定 workflow 子命令。 */
export function main(argv = process.argv.slice(2)) {
  const command = argv[0];
  try {
    if (argv.length !== 1) throw Object.assign(new WorkflowError("workflow helper 参数无效"), { cliExit: 2 });
    switch (command) {
      case "check-node-runtime": checkNodeRuntime(); break;
      case "verify-checkout": verifyCheckout(); break;
      case "read-msrv": readMsrv(); break;
      case "verify-version": verifyVersion(); break;
      case "hash-release-notes": hashReleaseNotes(); break;
      case "list-tests": return listTests();
      case "verify-post-test": verifyPostTest(); break;
      case "resolve-artifact": resolveArtifact(); break;
      case "write-manifest": writeManifest(); break;
      case "commit-candidate": commitCandidate(); break;
      default: throw Object.assign(new WorkflowError("未知 workflow helper 命令"), { cliExit: 2 });
    }
    return 0;
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n`);
    return error.cliExit ?? 1;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = main();
}
