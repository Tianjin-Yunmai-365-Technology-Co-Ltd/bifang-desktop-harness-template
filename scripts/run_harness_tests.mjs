#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEARCH_ROOTS = [path.join(ROOT, "scripts"), path.join(ROOT, ".agents", "skills")];
const IGNORED_DIRECTORIES = new Set([".git", "node_modules", "release", "target"]);

/** 递归发现 Node 原生测试文件，使用显式路径避免宿主 glob 差异。 */
export function discoverTests(roots = SEARCH_ROOTS) {
  const tests = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && /\.test\.(?:mjs|cjs|js)$/u.test(entry.name)) tests.push(absolute);
    }
  };
  for (const root of roots) {
    if (fs.existsSync(root)) visit(root);
  }
  return tests.sort();
}

/** 串行运行所有 Harness 与 Skill Node 回归，透传原生 TAP 输出和退出码。 */
export function main() {
  const tests = discoverTests();
  if (tests.length === 0) {
    console.error("ERROR: 未发现任何 Node 回归测试");
    return 1;
  }
  const result = spawnSync(
    process.execPath,
    ["--test", "--test-concurrency=1", ...tests],
    { cwd: ROOT, stdio: "inherit", env: process.env, windowsHide: true },
  );
  if (result.error) {
    console.error(`ERROR: 无法运行 Node 回归: ${result.error.message}`);
    return 2;
  }
  return result.status ?? 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = main();
}
