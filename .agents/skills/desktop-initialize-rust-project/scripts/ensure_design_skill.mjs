#!/usr/bin/env node

/** 在终端下游内复用或安装原样的 taste-skill；不访问网络、用户主目录或全局 Skill。 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const SKILL_NAME = "design-taste-frontend";
export const SNAPSHOT_ROOT = fileURLToPath(new URL("../assets/vendor/design-taste-frontend/", import.meta.url));
const SNAPSHOT_FILES = ["SKILL.md", "LICENSE"];

/** 仅 ENOENT 表示缺失，权限或文件系统错误不能被当作可安装状态。 */
function optionalStat(file) {
  try { return fs.lstatSync(file); } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

/** 拒绝符号链接或特殊对象，读取普通文件的精确字节。 */
function readRegular(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`文件必须为普通非符号链接文件：${file}`);
  return fs.readFileSync(file);
}

/** 读取关键字段的字符串标量；空值、注释、集合与非字符串类型不能冒充描述。 */
function skillScalar(value, continuation) {
  const scalar = value.trim();
  if (/^[|>](?:[+-]?[1-9]?|[1-9][+-]?)(?:[ \t]+#.*)?$/u.test(scalar)) {
    return continuation.map((line) => line.trim()).join("\n").trim();
  }
  if (scalar.startsWith('"')) {
    const quoted = /^("(?:[^"\\]|\\.)*")(?:[ \t]+#.*)?$/u.exec(scalar);
    if (!quoted || continuation.some((line) => line.trim())) return null;
    try { return JSON.parse(quoted[1]); } catch { return null; }
  }
  if (scalar.startsWith("'")) {
    const quoted = /^'((?:[^']|'')*)'(?:[ \t]+#.*)?$/u.exec(scalar);
    return quoted && !continuation.some((line) => line.trim()) ? quoted[1].replaceAll("''", "'") : null;
  }
  const plain = scalar.replace(/[ \t]+#.*$/u, "").trim();
  if (!plain || /^[#!&*\[\]{},]/u.test(plain) || /:[ \t]/u.test(plain)
      || /^(?:~|null|true|false|[-+]?(?:\d[\d_]*(?:\.[\d_]*)?(?:e[-+]?[\d_]+)?|\.[\d_]+|0x[\da-f_]+|0o[0-7_]+|0b[01_]+|\.(?:inf|nan)))$/iu.test(plain)) return null;
  return [plain, ...continuation.map((line) => line.trim())].join("\n").trim();
}

/** 关键字段只能各出现一次，支持普通、带引号和缩进块形式的本地描述。 */
function skillFields(frontmatter) {
  const fields = new Map();
  const lines = frontmatter.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(name|description|"name"|"description"|'name'|'description')[ \t]*:[ \t]*(.*)$/u.exec(lines[index]);
    if (!match) continue;
    const key = match[1].replaceAll(/["']/gu, "");
    if (fields.has(key)) return null;
    const continuation = [];
    while (index + 1 < lines.length && /^(?:[ \t]+|$)/u.test(lines[index + 1])) continuation.push(lines[++index]);
    fields.set(key, skillScalar(match[2], continuation));
  }
  return fields;
}

/** 本地 Skill 必须声明正确名称和非空描述；已有修改不与上游摘要比较。 */
function validateSkill(bytes) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(text);
  const frontmatter = header?.[1];
  const fields = frontmatter && skillFields(frontmatter);
  const description = fields?.get("description");
  if (text.includes("\0") || !frontmatter
      || fields?.get("name") !== SKILL_NAME || typeof description !== "string" || !description.trim()
      || text.slice(header[0].length).trim().length === 0) {
    throw new Error("项目本地 Skill 无效，需修复后重试；不会覆盖已有内容");
  }
}

/** 校验内嵌上游来源、许可及逐文件摘要，任何快照漂移都在写入目标前失败。 */
export function loadDesignSkillSnapshot(snapshotRoot = SNAPSHOT_ROOT) {
  const root = path.resolve(snapshotRoot);
  const stat = fs.lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("快照目录必须为普通非符号链接目录");
  const provenance = readRegular(path.join(root, "source.json"));
  const metadata = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(provenance));
  if (metadata.schemaVersion !== 1 || metadata.skill !== SKILL_NAME
      || metadata.repository !== "https://github.com/Leonxlnx/taste-skill"
      || !/^[a-f0-9]{40}$/u.test(metadata.commit ?? "")
      || metadata.upstreamPath !== "skills/taste-skill/SKILL.md"
      || metadata.license !== "MIT") throw new Error("taste-skill 来源记录无效");
  const files = new Map();
  for (const name of SNAPSHOT_FILES) {
    const bytes = readRegular(path.join(root, name));
    const declared = metadata.files?.[name];
    if (declared?.bytes !== bytes.length
        || declared?.sha256 !== createHash("sha256").update(bytes).digest("hex")) {
      throw new Error(`taste-skill 快照摘要不一致：${name}`);
    }
    files.set(name, bytes);
  }
  validateSkill(files.get("SKILL.md"));
  if (!files.get("LICENSE").toString("utf8").startsWith("MIT License\n")) throw new Error("taste-skill 许可无效");
  files.set("source.json", provenance);
  return { files, commit: metadata.commit };
}

/** 检查根内每一级本地 Skill 目录；不跟随任何已有的链接。 */
function validateLocalDirectories(root) {
  let current = root;
  for (const segment of [".agents", "skills", SKILL_NAME]) {
    current = path.join(current, segment);
    const stat = optionalStat(current);
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) {
      throw new Error(`项目 Skill 路径必须为普通非符号链接目录：${current}`);
    }
    if (!stat) break;
  }
}

/** 只在真实下游 Cargo 根安装；缺失时使用已校验快照，重复执行保留有效本地内容。 */
export function ensureDesignSkill(projectRoot, { snapshotRoot = SNAPSHOT_ROOT } = {}) {
  const requested = path.resolve(projectRoot);
  const stat = fs.lstatSync(requested);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("项目根必须为普通非符号链接目录");
  const root = fs.realpathSync(requested);
  if (optionalStat(path.join(root, "Version.md"))
      && optionalStat(path.join(root, ".agents/skills/desktop-instantiate-project/SKILL.md"))) {
    throw new Error("不能把设计 Skill 安装到 Harness 源根，请使用唯一终端下游根");
  }
  if (!readRegular(path.join(root, "Cargo.toml")).toString("utf8").includes("[workspace.metadata.agent-first-harness]")) {
    throw new Error("项目根缺少下游 Harness Cargo metadata");
  }
  validateLocalDirectories(root);
  const destination = path.join(root, ".agents", "skills", SKILL_NAME);
  const installedSkill = path.join(destination, "SKILL.md");
  if (optionalStat(installedSkill)) {
    validateSkill(readRegular(installedSkill));
    return { status: "reused", skill: SKILL_NAME, path: destination };
  }
  const { files, commit } = loadDesignSkillSnapshot(snapshotRoot);
  const existingDirectory = optionalStat(destination);
  if (existingDirectory && fs.readdirSync(destination).length > 0) {
    throw new Error("Skill 目录已有其他内容但缺少 SKILL.md，需修复后重试；不会覆盖已有内容");
  }
  const parent = path.dirname(destination);
  fs.mkdirSync(parent, { recursive: true });
  validateLocalDirectories(root);
  const staging = fs.mkdtempSync(path.join(parent, ".taste-skill-install-"));
  try {
    for (const [name, bytes] of files) fs.writeFileSync(path.join(staging, name), bytes, { flag: "wx" });
    validateLocalDirectories(root);
    if (optionalStat(destination)) {
      // 只移除真正空的既有目录；并发产生的文件使 rmdir 失败，不覆盖其内容。
      fs.rmdirSync(destination);
    }
    fs.renameSync(staging, destination);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  return { status: "installed", skill: SKILL_NAME, path: destination, commit };
}

/** CLI 固定要求显式下游根，成功或失败均输出单行 JSON，不接受全局安装选项。 */
export function main(argv = process.argv.slice(2)) {
  try {
    if (argv.length !== 2 || argv[0] !== "--project-root" || !argv[1].trim()) {
      throw new Error("用法：node ensure_design_skill.mjs --project-root <downstream-root>");
    }
    process.stdout.write(`${JSON.stringify(ensureDesignSkill(argv[1]))}\n`);
    return 0;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ status: "error", message: error.message })}\n`);
    return 1;
  }
}

// 入口使用真实路径比较，兼容 macOS 临时根等带有祖先目录别名的下游位置。
if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fileURLToPath(import.meta.url)) process.exitCode = main();
