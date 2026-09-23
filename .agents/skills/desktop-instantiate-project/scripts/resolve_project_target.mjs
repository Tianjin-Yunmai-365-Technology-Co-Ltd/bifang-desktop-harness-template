#!/usr/bin/env node
/** 只读解析下游项目路径，并验证最终项目根目录的安全前置条件。 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const SNAKE_CASE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

function expandHome(value) {
  if (value === "~") return os.homedir();
  if (value.startsWith(`~${path.sep}`)) return path.join(os.homedir(), value.slice(2));
  return value;
}

function exists(value) {
  try {
    fs.accessSync(value);
    return true;
  } catch {
    return false;
  }
}

function isSymbolicLink(value) {
  try {
    return fs.lstatSync(value).isSymbolicLink();
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

/** 在不改变末级名称语义的前提下得到规范化绝对路径。 */
export function lexicalAbsolute(value, base) {
  const expanded = expandHome(value);
  return path.resolve(path.isAbsolute(expanded) ? expanded : path.join(base, expanded));
}

/** 找到最近的已存在祖先，并拒绝文件或断裂符号链接阻断创建。 */
export function nearestExistingDirectory(value) {
  let candidate = value;
  while (!exists(candidate)) {
    if (isSymbolicLink(candidate)) throw new Error(`路径包含断裂符号链接：${candidate}`);
    const parent = path.dirname(candidate);
    if (parent === candidate) break;
    candidate = parent;
  }
  if (!fs.statSync(candidate).isDirectory()) throw new Error(`最近的已存在祖先不是目录：${candidate}`);
  return candidate;
}

/** 确认最终目标缺失或为空，并拒绝链接、文件与非空目录。 */
export function targetState(targetLexical, targetRoot) {
  if (isSymbolicLink(targetLexical)) throw new Error(`最终项目根目录不得是符号链接：${targetLexical}`);
  nearestExistingDirectory(path.dirname(targetLexical));
  if (!exists(targetRoot)) return "missing";
  if (!fs.statSync(targetRoot).isDirectory()) throw new Error(`最终项目根目录不是目录：${targetRoot}`);
  let entries;
  try {
    entries = fs.readdirSync(targetRoot);
  } catch (error) {
    throw new Error(`无法清点最终项目根目录：${targetRoot}: ${error.message}`);
  }
  if (entries.length === 0) return "empty";
  throw new Error(`最终项目根目录不是空目录：${targetRoot}`);
}

/** 按精确末级名称规则计算唯一目标根，并返回机器可读只读结果。 */
export function resolveProjectTarget(harnessRoot, projectPath, projectId) {
  if (!SNAKE_CASE.test(projectId)) throw new Error("--project-id 必须是 ASCII snake_case");

  let canonicalHarness;
  try {
    canonicalHarness = fs.realpathSync(expandHome(harnessRoot));
  } catch (error) {
    throw new Error(`无法解析 Harness 根目录：${harnessRoot}: ${error.message}`);
  }
  if (!fs.statSync(canonicalHarness).isDirectory()) throw new Error(`Harness 根目录不是目录：${canonicalHarness}`);

  const inputPath = lexicalAbsolute(projectPath, canonicalHarness);
  const inputKind = path.basename(inputPath) === projectId ? "target-root" : "parent-directory";
  if (inputKind === "parent-directory" && exists(inputPath) && !fs.statSync(inputPath).isDirectory()) {
    throw new Error(`作为父目录输入的项目路径不是目录：${inputPath}`);
  }

  const targetLexical = inputKind === "target-root" ? inputPath : path.join(inputPath, projectId);
  let targetRoot;
  try {
    const nearest = nearestExistingDirectory(targetLexical);
    targetRoot = path.join(fs.realpathSync(nearest), path.relative(nearest, targetLexical));
  } catch (error) {
    if (error.message.startsWith("路径包含断裂符号链接：") || error.message.startsWith("最近的已存在祖先不是目录：")) throw error;
    throw new Error(`无法解析最终项目根目录：${targetLexical}: ${error.message}`);
  }
  if (targetRoot === canonicalHarness || canonicalHarness.startsWith(`${targetRoot}${path.sep}`)) {
    throw new Error("最终项目根目录不得是 Harness 根目录或其祖先");
  }

  return {
    schemaVersion: 1,
    projectId,
    harnessRoot: canonicalHarness,
    projectPathInput: inputPath,
    inputKind,
    targetRoot,
    targetState: targetState(targetLexical, targetRoot),
  };
}

function main() {
  const { values } = parseArgs({
    options: {
      "harness-root": { type: "string" },
      "project-path": { type: "string" },
      "project-id": { type: "string" },
    },
    strict: true,
  });
  for (const key of ["harness-root", "project-path", "project-id"]) {
    if (!values[key]) throw new Error(`缺少必需参数 --${key}`);
  }
  return resolveProjectTarget(values["harness-root"], values["project-path"], values["project-id"]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(main())}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exitCode = 2;
  }
}
