import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  MCP_SKILL,
  PRODUCT_SPEC,
  REACT_BASELINE,
  TUI_BASELINE,
  TUI_SKILL,
  validateCurrentDescriptions,
  validateDependencyEvidenceContract,
  validateStaleFragments,
  validateUnverifiedAdapterDependencyContract,
} from "./governance_descriptions.mjs";
import { ROOT } from "./core.mjs";

function withTemporaryRoot(callback) {
  const root = mkdtempSync(path.join(tmpdir(), "afh-governance-descriptions-"));
  try { callback(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

function mutate(root, sourcePath, update) {
  const target = path.join(root, path.basename(sourcePath));
  writeFileSync(target, update(readFileSync(sourcePath, "utf8")));
  return target;
}

test("current descriptions satisfy dependency and stale-description contracts", () => {
  const errors = [];
  validateCurrentDescriptions(errors);
  assert.deepEqual(errors, []);
});

test("dependency evidence keeps non-CLI baselines unverified", () => withTemporaryRoot((root) => {
  const required = "继续保持 `Unverified`";
  const productSpec = mutate(root, PRODUCT_SPEC, (source) => source.replace(required, "已经全部验证通过"));
  const errors = [];
  validateDependencyEvidenceContract(errors, { productSpec });
  assert.ok(errors.some((error) => error.includes("dependency evidence contract missing")), errors.join("\n"));
}));

test("dependency evidence rejects explicit and environment-section overclaims", () => {
  for (const update of [
    (source) => `${source}\n前端/Rust 直接依赖统一表达为经过验证的最低兼容范围\n`,
    (source) => source.replace("依赖清单以完整三段、可在项目最低工具链证明的兼容下界为目标", "依赖清单以经过验证的最低兼容范围为目标"),
    (source) => source.replace("继续保持 `Unverified`", "TUI/MCP/GUI 已完成真实下游最低工具链验证"),
  ]) withTemporaryRoot((root) => {
    const productSpec = mutate(root, PRODUCT_SPEC, update);
    const errors = [];
    validateDependencyEvidenceContract(errors, { productSpec });
    assert.ok(errors.some((error) => error.includes("is overstated")), errors.join("\n"));
  });
});

test("README and engineering rules retain the unverified boundary", () => {
  const readme = path.join(ROOT, "README.md");
  const rules = path.join(ROOT, "docs", "ENGINEERING_RULES.md");
  withTemporaryRoot((root) => {
    const changedReadme = mutate(root, readme, (source) => source.replace("保持 `Unverified`", "已经全部验证通过"));
    const errors = [];
    validateDependencyEvidenceContract(errors, { readme: changedReadme });
    assert.ok(errors.some((error) => error.includes("dependency evidence contract missing")), errors.join("\n"));
  });
  withTemporaryRoot((root) => {
    const changedRules = mutate(root, rules, (source) => `${source}\n直接依赖和受管工具的清单必须表达经过验证的最低兼容范围\n`);
    const errors = [];
    validateDependencyEvidenceContract(errors, { engineeringRules: changedRules });
    assert.ok(errors.some((error) => error.includes("is overstated")), errors.join("\n"));
  });
});

test("current adapter contracts explicitly remain unverified", () => {
  const errors = [];
  validateUnverifiedAdapterDependencyContract(errors);
  assert.deepEqual(errors, []);
});

test("adapter contracts reject superseded overclaims", () => {
  const cases = [
    ["tuiSkill", TUI_SKILL, "TUI 最低兼容稳定组合及当前完整三段下界为"],
    ["tuiBaseline", TUI_BASELINE, "上表是已验证的最低兼容稳定组合"],
    ["mcpSkill", MCP_SKILL, "MCP 最低兼容稳定下界为"],
    ["reactBaseline", REACT_BASELINE, "当前已核定的 GUI 前端直接兼容下界如下"],
  ];
  for (const [key, sourcePath, overclaim] of cases) withTemporaryRoot((root) => {
    const changed = mutate(root, sourcePath, (source) => `${source}\n${overclaim}\n`);
    const errors = [];
    validateUnverifiedAdapterDependencyContract(errors, { [key]: changed });
    assert.ok(errors.some((error) => error.includes("adapter dependency baseline is overstated")), `${key}: ${errors.join("\n")}`);
  });
});

test("adapter contracts require their unverified evidence markers", () => {
  const cases = [
    ["tuiSkill", TUI_SKILL, "在真实 TUI 下游完成最低直接版本解析和测试前保持 `Unverified`"],
    ["mcpSkill", MCP_SKILL, "在真实 MCP 下游完成最低直接版本解析和 Rust 1.98.1 测试前保持 `Unverified`"],
    ["reactBaseline", REACT_BASELINE, "在真实 GUI 下游完成最低 Node.js/pnpm、lowest-direct 解析、类型检查、非空测试与生产构建前保持 `Unverified`"],
  ];
  for (const [key, sourcePath, required] of cases) withTemporaryRoot((root) => {
    const changed = mutate(root, sourcePath, (source) => source.replace(required, ""));
    const errors = [];
    validateUnverifiedAdapterDependencyContract(errors, { [key]: changed });
    assert.ok(errors.some((error) => error.includes("adapter dependency evidence contract missing")), `${key}: ${errors.join("\n")}`);
  });
});

test("React dependency floors require Node types and continuous jsdom support", () => {
  for (const fragment of ["`@types/node` | `^24.13.4`", "`jsdom` | `^29.0.1`", "不得升级到会重新排除 Node.js 25.x"]) {
    withTemporaryRoot((root) => {
      const reactBaseline = mutate(root, REACT_BASELINE, (source) => source.replace(fragment, ""));
      const errors = [];
      validateCurrentDescriptions(errors, { reactBaseline });
      assert.ok(errors.some((error) => error.includes("dependency-floor contract missing")), `${fragment}: ${errors.join("\n")}`);
    });
  }
});

test("React baseline rejects the jsdom 30 Node 25 regression", () => withTemporaryRoot((root) => {
  const reactBaseline = mutate(root, REACT_BASELINE, (source) => source.replace("`jsdom` | `^29.0.1`", "`jsdom` | `^30.0.1`"));
  const errors = [];
  validateCurrentDescriptions(errors, { reactBaseline });
  assert.ok(errors.some((error) => error.includes("superseded exact/latest version rule")), errors.join("\n"));
}));

test("stale preference, environment, initialization, and task-title rules fail closed", () => {
  const fragments = [
    "Worktree 授权只对当前任务有效。",
    "每个会修改仓库或执行交付工作的任务都必须询问并行模式。",
    "显式构建需要不可复用的工具链证据时先运行环境门禁。",
    "每次回复只询问一个最靠前的 `待询问` 字段。",
    "新增、变化、修复、移除、安全事项",
    "{Task}|{序号}|{功能摘要}{当前进度}",
  ];
  for (const fragment of fragments) withTemporaryRoot((root) => {
    const filePath = path.join(root, "current.md");
    writeFileSync(filePath, fragment);
    const errors = [];
    validateStaleFragments(errors, [filePath]);
    assert.ok(errors.some((error) => error.includes("stale current description")), `${fragment}: ${errors.join("\n")}`);
  });
});

test("missing adapter evidence files fail closed", () => withTemporaryRoot((root) => {
  const errors = [];
  validateUnverifiedAdapterDependencyContract(errors, { tuiSkill: path.join(root, "missing.md") });
  assert.ok(errors.some((error) => error.includes("missing adapter dependency evidence contract")), errors.join("\n"));
}));
