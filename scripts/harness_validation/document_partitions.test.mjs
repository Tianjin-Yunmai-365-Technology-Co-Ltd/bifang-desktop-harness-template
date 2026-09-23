import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { ROOT } from "./core.mjs";

function readPartition(rootFile, directory) {
  const partitionDirectory = path.join(ROOT, directory);
  return [
    fs.readFileSync(path.join(ROOT, rootFile), "utf8"),
    ...fs.readdirSync(partitionDirectory)
      .filter((name) => name.endsWith(".md"))
      .sort()
      .map((name) => fs.readFileSync(path.join(partitionDirectory, name), "utf8")),
  ];
}

test("verification partition preserves history and signatures", () => {
  const texts = readPartition("docs/VERIFICATION.md", "docs/verification");
  assert.ok(texts.reduce((total, text) => total + text.split("\n## ").length - 1, 0) >= 26);
  assert.ok(texts.reduce((total, text) => total + text.split("\n### ").length - 1, 0) >= 68);
  assert.ok(texts.reduce((total, text) => total + text.split("复核人：").length - 1, 0) >= 4);
  assert.ok(texts.reduce((total, text) => total + text.split("审批边界：").length - 1, 0) >= 3);
  const combined = texts.join("\n");
  for (const fragment of [
    "因缺少第三方 YAML 解析模块",
    "沙箱拒绝写入",
    "首次错误调用",
    "首次发布冒烟错误使用相对",
    "首次负向冒烟包装脚本错误",
  ]) {
    assert.ok(combined.includes(fragment), fragment);
  }
});

test("methodology partition preserves numbered sections", () => {
  const texts = readPartition("docs/HARNESS_ENGINEERING.md", "docs/harness_engineering");
  assert.equal(texts.reduce((total, text) => total + text.split("\n## ").length - 1, 0), 19);
  assert.equal(texts.reduce((total, text) => total + text.split("\n### ").length - 1, 0), 28);
  const combined = texts.join("\n");
  assert.ok(combined.includes("## 2. 什么是个人小工具 Harness 工程"));
  assert.ok(combined.includes("## 15. Agent-first 小工具设计"));
  assert.ok(combined.includes("## 18. 参考资料"));
});
