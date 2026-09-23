import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Harness 仓库根目录；所有校验路径都从这里解析。 */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SKILLS_ROOT = path.join(ROOT, ".agents", "skills");

/** 把宿主路径归一化为稳定的仓库相对 POSIX 路径。 */
export function relativePath(filePath, root = ROOT) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

/** 读取普通、非符号链接的 UTF-8 文件，并拒绝 NUL 与非法编码。 */
export function readText(filePath) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`不是普通非符号链接文件: ${relativePath(filePath)}`);
  }
  const bytes = fs.readFileSync(filePath);
  if (bytes.includes(0)) {
    throw new Error(`文本文件含 NUL 字节: ${relativePath(filePath)}`);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/** 读取并解析 JSON，确保根值满足调用方预期。 */
export function readJson(filePath) {
  try {
    return JSON.parse(readText(filePath));
  } catch (error) {
    throw new Error(`${relativePath(filePath)} 不是合法 JSON: ${error.message}`);
  }
}

/** 计算文件 SHA-256，返回稳定小写十六进制。 */
export function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

/** 以非交互方式运行子进程并返回可诊断结果。 */
export function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...options.env },
    input: options.input,
    maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024,
    timeout: options.timeout ?? 60_000,
    windowsHide: true,
  });
}

/** 子进程内按 CPU 并发运行 `node --check`，输出每个文件的诊断（通过为 null）。 */
const PARALLEL_SYNTAX_CHECK = `
import { execFile } from "node:child_process";
import { availableParallelism } from "node:os";
const files = JSON.parse(await new Response(process.stdin).text());
const results = [];
let next = 0;
async function worker() {
  while (next < files.length) {
    const file = files[next++];
    await new Promise((resolve) => execFile(process.execPath, ["--check", file], { timeout: 30000, windowsHide: true }, (error, _stdout, stderr) => {
      results.push([file, error ? (stderr || error.message || "无诊断").trim() : null]);
      resolve();
    }));
  }
}
await Promise.all(Array.from({ length: Math.max(1, availableParallelism()) }, worker));
process.stdout.write(JSON.stringify(results));
`;
const syntaxResults = new Map();

function syntaxKey(filePath) {
  const stat = fs.statSync(filePath);
  return `${path.resolve(filePath)}\0${stat.mtimeMs}\0${stat.size}`;
}

/** 并发检查尚未缓存的模块；同一进程内按路径、mtime 与大小复用结果，避免各校验器重复解析。 */
export function checkNodeSyntax(filePaths) {
  const keys = new Map(filePaths.map((filePath) => [path.resolve(filePath), syntaxKey(filePath)]));
  const pending = [...keys].filter(([, key]) => !syntaxResults.has(key));
  if (pending.length === 1) {
    // 单个文件直接检查，避免多一层批处理子进程。
    const [[filePath, key]] = pending;
    const result = run(process.execPath, ["--check", filePath], { timeout: 30_000 });
    syntaxResults.set(key, result.error || result.status !== 0 ? (result.stderr || result.error?.message || "无诊断").trim() : null);
  } else if (pending.length > 1) {
    const result = run(process.execPath, ["--input-type=module", "-e", PARALLEL_SYNTAX_CHECK], {
      input: JSON.stringify(pending.map(([filePath]) => filePath)),
      timeout: 120_000,
    });
    if (result.error || result.status !== 0) {
      throw new Error(`Node 语法检查无法执行: ${(result.stderr || result.error?.message || "无诊断").trim()}`);
    }
    for (const [filePath, detail] of JSON.parse(result.stdout)) syntaxResults.set(keys.get(filePath), detail);
  }
  return new Map(filePaths.map((filePath) => [filePath, syntaxResults.get(keys.get(path.resolve(filePath)))]));
}

/** 返回单个模块的语法诊断，null 表示通过。 */
export function nodeSyntaxError(filePath) {
  try {
    return checkNodeSyntax([filePath]).get(filePath);
  } catch (error) {
    return error.message;
  }
}

/** 枚举 Git 可见文件；失败时返回明确错误而不退化为不完整扫描。 */
export function trackedFiles(root = ROOT) {
  const result = run(
    "git",
    ["-C", root, "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root },
  );
  if (result.error || result.status !== 0) {
    const detail = (result.stderr || result.error?.message || "无诊断").trim();
    throw new Error(`Git 文件枚举失败: ${detail}`);
  }
  const files = result.stdout
    .split("\0")
    .filter(Boolean)
    .filter((relative) => {
      try {
        fs.lstatSync(path.join(root, relative));
        return true;
      } catch (error) {
        if (error?.code === "ENOENT") return false;
        throw error;
      }
    })
    .sort();
  if (new Set(files).size !== files.length) {
    throw new Error("Git 文件枚举包含重复路径");
  }
  return files;
}

/** 按跨平台文本分隔符与尾换行语义计算物理行数。 */
export function physicalLineCount(text) {
  if (text.length === 0) return 0;
  const parts = text.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/u);
  return parts.length - (parts.at(-1) === "" ? 1 : 0);
}

/** 判断字节是否应按人工维护 UTF-8 文本参与治理。 */
export function decodeMaintainedText(filePath) {
  const bytes = fs.readFileSync(filePath);
  if (bytes.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** 解析 Markdown/YAML 常用的简单 YAML frontmatter 标量字段。 */
export function parseFrontmatter(text) {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) return null;
  const normalized = text.replaceAll("\r\n", "\n");
  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0) return null;
  const values = {};
  for (const line of normalized.slice(4, end).split("\n")) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*?)\s*$/u.exec(line);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

/** 把错误追加为稳定、可定位的一行文本。 */
export function fail(errors, message) {
  errors.push(message.replaceAll(/\s+/gu, " ").trim());
}

/** 要求文件含全部字面片段，并生成统一诊断。 */
export function requireFragments(errors, filePath, fragments, label = relativePath(filePath)) {
  let text;
  try {
    text = readText(filePath);
  } catch (error) {
    fail(errors, error.message);
    return "";
  }
  for (const fragment of fragments) {
    if (!text.includes(fragment)) {
      fail(errors, `${label} 缺少必需契约片段: ${fragment}`);
    }
  }
  return text;
}

/** 确保路径仍位于仓库根中，避免链接检查越界。 */
export function resolveInsideRoot(baseDirectory, candidate, root = ROOT) {
  const resolved = path.resolve(baseDirectory, candidate);
  const relative = path.relative(root, resolved);
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    return resolved;
  }
  throw new Error(`路径越过仓库根: ${candidate}`);
}
