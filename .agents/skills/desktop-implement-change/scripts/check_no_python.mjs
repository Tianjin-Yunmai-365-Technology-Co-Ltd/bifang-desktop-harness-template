#!/usr/bin/env node

/** 阻止 Python 源码、依赖清单、运行时目录或运行步骤进入 Harness 源与终端下游。 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { gitVisiblePaths } from "./check_file_line_limits.mjs";

/** 本检查器与其回归必须写出被禁止的字面量，因此只豁免这两份文件的文本扫描。 */
const SELF_PATHS = new Set([
  ".agents/skills/desktop-implement-change/scripts/check_no_python.mjs",
  ".agents/skills/desktop-implement-change/scripts/check_no_python.test.mjs",
]);
const MANIFEST_NAMES = new Set([
  ".coveragerc", ".pdm-python", ".pylintrc", ".python-version", ".ruff.toml",
  "conda-lock.yaml", "conda-lock.yml", "environment.yaml", "environment.yml",
  "hatch.toml", "manifest.in", "mypy.ini", "pdm.lock", "pdm.toml", "pipfile", "pipfile.lock",
  "pixi.lock", "pixi.toml", "poetry.lock", "poetry.toml", "pylock.toml", "pyproject.toml",
  "pyrightconfig.json", "pytest.ini", "pyvenv.cfg", "requirements.lock", "ruff.toml",
  "setup.cfg", "setup.py", "tox.ini", "uv.lock", "uv.toml",
]);
const REQUIREMENTS_NAME = /^requirements(?:-[^/]+)?\.(?:in|txt)$/iu;
const SOURCE_SUFFIX = /\.(?:py|pyi|pyw|pyc)$/iu;
const RUNTIME_DIRECTORIES = new Set([
  ".eggs", ".hypothesis", ".mypy_cache", ".nox", ".pyre", ".pytest_cache", ".pytype",
  ".ruff_cache", ".tox", ".venv", "__pycache__", "__pypackages__", "htmlcov", "site-packages", "venv",
]);
const PACKAGE_METADATA_DIRECTORY = /\.(?:egg-info|dist-info)$/iu;
const FILESYSTEM_SCAN_EXCLUSIONS = new Set([".git", ".vite", "coverage", "dist", "node_modules", "release", "target"]);
const BINARY_SUFFIXES = new Set([".jpeg", ".jpg", ".png"]);
/** 已发生的 ADR、Changelog 与 Verification 是当时证据，保留原命令不改写。 */
const HISTORICAL_RECORDS = [
  /^docs\/adr\/(?:\d{8}_ADR|ADR_history(?:_\d+)?)\.md$/u,
  /^docs\/changelog\/(?:\d{8}_CHANGELOG|CHANGELOG_history(?:_\d+)?)\.md$/u,
  /^docs\/verification\/(?:\d{8}(?:-\d{8})?_verification|human_review)\.md$/u,
];
const WORK_PLAN = /^docs\/work_plan\/(\d{8}_work_plan\.md)$/u;
const ARTIFACT_MESSAGES = {
  manifest: "不得包含 Python 依赖清单",
  runtime: "不得包含 Python 源码、字节码或运行时目录",
};

const INTERPRETER = String.raw`python(?:3(?:\.\d+)*)?(?:\.exe)?`;
const PIP = String.raw`pip(?:3)?(?:\.exe)?`;
const BOUNDARY = "(?:^|[^A-Za-z0-9_])";
const QUOTE = `["']?`;
const COMMAND_TAIL = String.raw`(?=\s*(?:$|[\],);|&#<>]|\\(?:\r?\n)|\s+(?:[-<]|[A-Za-z0-9_./])))`;
const PACKAGE_MANAGER = String.raw`(?:(?:${PIP}|pipx|pipenv|poetry|pdm|hatch|rye|pyenv|virtualenv|conda|mamba|pip-(?:compile|sync))\b|uvx\b|uv\s+(?:add|lock|pip|run|sync|tool|venv)\b)`;
const TOOL_COMMAND = String.raw`(?:pytest|tox|nox|mypy|ruff|pyright|pylint)(?:\.exe)?`;
const RUNTIME_MARKERS = [
  String.raw`^#![^\n]*\bpython(?:3(?:\.\d+)*)?\b`,
  "PYTHON_COMMAND",
  "PYTHON(?:HOME|PATH|NOUSERSITE)",
  "PIP_(?:CONFIG_FILE|INDEX_URL|EXTRA_INDEX_URL|REQUIRE_VIRTUALENV)",
  "setup-python",
  "setup-uv",
  "__pycache__",
  String.raw`\.pyc\b`,
  String.raw`\.venv(?:[\/]|\b)`,
  "VIRTUAL_ENV",
  "CONDA_PREFIX",
  String.raw`python:\d`,
  String.raw`pyproject\.toml`,
  String.raw`pipfile(?:\.lock)?`,
  String.raw`poetry\.lock`,
  String.raw`uv\.lock`,
  String.raw`requirements(?:-[^/\s]+)?\.(?:in|txt)`,
  String.raw`(?:^|[-\s])python\s*(?:[=<>!~]=?|:)\s*\d`,
  String.raw`(?:command\s+-v|which|where(?:\.exe)?|Get-Command|type\s+-P)\s+(?:${INTERPRETER}|${PIP})\b`,
].join("|");

/** 预编译一次，按文件复用。 */
function commandPattern(command) {
  return new RegExp(`(?:${BOUNDARY}${QUOTE}${command}${QUOTE}${COMMAND_TAIL}|:\\s*${QUOTE}${command}${QUOTE}\\s*\\})`, "imu");
}
const PROHIBITED_REFERENCES = [
  [commandPattern(INTERPRETER), "Python 解释器命令"],
  [new RegExp(String.raw`${BOUNDARY}${QUOTE}py(?:\.exe)?${QUOTE}\s+-(?=\S|$)`, "imu"), "Python 启动器命令"],
  [commandPattern(PACKAGE_MANAGER), "Python 包管理命令"],
  [commandPattern(TOOL_COMMAND), "Python 工具命令"],
  [/\.py\b/iu, "Python 文件入口"],
  [new RegExp(RUNTIME_MARKERS, "iu"), "Python 运行时标识"],
];

/** 返回路径命中的 Python 产物类别：`manifest`、`runtime` 或 null。 */
export function pythonArtifactKind(relative) {
  const name = path.posix.basename(relative);
  if (MANIFEST_NAMES.has(name.toLowerCase()) || REQUIREMENTS_NAME.test(name)) return "manifest";
  const segments = relative.split("/");
  if (SOURCE_SUFFIX.test(relative) || segments.some((segment) => RUNTIME_DIRECTORIES.has(segment) || PACKAGE_METADATA_DIRECTORY.test(segment))) {
    return "runtime";
  }
  return null;
}

/** 返回单个文本中的 Python 运行时残留类别；历史记录豁免由调用方判定。 */
export function pythonReferenceViolations(text) {
  return PROHIBITED_REFERENCES.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
}

/** 枚举 Git ignore 也不能隐藏的 Python 源码、依赖清单和运行时目录。 */
export function findPythonArtifacts(root) {
  const found = [];
  const visit = (directory, prefix) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory() && (FILESYSTEM_SCAN_EXCLUSIONS.has(entry.name) || entry.name.startsWith(".release-clean."))) continue;
      if (pythonArtifactKind(relative) !== null) found.push(relative);
      else if (entry.isDirectory()) visit(path.join(directory, entry.name), relative);
    }
  };
  visit(root, "");
  return found.sort();
}

function completedWorkPlans(root) {
  try {
    const index = fs.readFileSync(path.join(root, "docs", "work_plan", "README.md"), "utf8");
    return new Set([...index.matchAll(/\((\d{8}_work_plan\.md)\)（已完成）/gu)].map((match) => match[1]));
  } catch {
    return new Set();
  }
}

function listProjectFiles(root) {
  const [paths, errors] = gitVisiblePaths(root);
  if (errors.length > 0) throw new Error(errors.join("; "));
  // 已删除但仍在索引中的路径不再参与检查；悬空符号链接保留并由后续普通文件检查拒绝。
  return paths.filter((relative) => {
    try { fs.lstatSync(path.join(root, relative)); return true; } catch { return false; }
  });
}

/** 检查项目文件、被忽略的 Python 产物和活动文本中的 Python 运行步骤，返回错误列表。 */
export function inspectProject(root, { files = listProjectFiles(root), scanFilesystem = true } = {}) {
  const errors = [];
  const completedPlans = completedWorkPlans(root);
  const isHistorical = (relative) => HISTORICAL_RECORDS.some((pattern) => pattern.test(relative))
    || completedPlans.has(WORK_PLAN.exec(relative)?.[1]);
  for (const relative of files) {
    const kind = pythonArtifactKind(relative);
    if (kind !== null) errors.push(`${ARTIFACT_MESSAGES[kind]}: ${relative}`);
    if (SELF_PATHS.has(relative) || isHistorical(relative)) continue;
    let text;
    try {
      const filePath = path.join(root, relative);
      const stat = fs.lstatSync(filePath);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        errors.push(`活动文件必须是普通非符号链接文件: ${relative}`);
        continue;
      }
      if (BINARY_SUFFIXES.has(path.extname(relative).toLowerCase())) continue;
      text = new TextDecoder("utf-8", { fatal: true }).decode(fs.readFileSync(filePath));
    } catch (error) {
      errors.push(`无法检查活动文件 ${relative}: ${error.message}`);
      continue;
    }
    for (const label of pythonReferenceViolations(text)) errors.push(`活动文件不得保留 ${label}: ${relative}`);
  }
  if (scanFilesystem) {
    const listed = new Set(files);
    for (const relative of findPythonArtifacts(root)) {
      if (!listed.has(relative)) errors.push(`Git ignore 不得隐藏 Python 源码、依赖或运行时产物: ${relative}`);
    }
  }
  return errors;
}

function parseArgs(argv) {
  const args = { root: ".", json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--json") args.json = true;
    else if (value === "--root" && index + 1 < argv.length) args.root = argv[++index];
    else throw new Error(`未知参数: ${value}`);
  }
  return args;
}

/** CLI 入口：0 通过，1 发现 Python 依赖，2 参数或运行错误。 */
export function main(argv = process.argv.slice(2)) {
  const json = argv.includes("--json");
  let errors;
  try {
    errors = inspectProject(path.resolve(parseArgs(argv).root));
  } catch (error) {
    if (json) process.stdout.write(`${JSON.stringify({ errors: [], ok: false, toolError: error.message })}\n`);
    else process.stderr.write(`ERROR: ${error.message}\n`);
    return 2;
  }
  if (json) process.stdout.write(`${JSON.stringify({ errors, ok: errors.length === 0, toolError: null })}\n`);
  else if (errors.length > 0) errors.forEach((error) => process.stderr.write(`ERROR: ${error}\n`));
  else process.stdout.write("no-python check passed\n");
  return errors.length > 0 ? 1 : 0;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) process.exitCode = main();
