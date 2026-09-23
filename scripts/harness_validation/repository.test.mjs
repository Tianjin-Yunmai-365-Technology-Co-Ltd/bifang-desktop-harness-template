import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ROOT } from "./core.mjs";
import { validateWorkPlanContract } from "./repository.mjs";
import {
  validateCurrentChangelogContract,
  validateDailyProjectMemory,
  validateSupersededReleaseLifecycleFragments,
} from "./repository_memory.mjs";

function withTextFile(text, callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "harness-repository-"));
  const filePath = path.join(directory, "fixture.md");
  fs.writeFileSync(filePath, text);
  try {
    callback(filePath);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

const VALID_PLAN = `# Plan

## Todo

### TODO-A（pending）

- 预期行为：完成 A。
- 影响边界：只改 A。
- 验证：运行 A 测试。
`;

test("current project memory and optional plan are valid", () => {
  const errors = [];
  validateDailyProjectMemory(errors);
  validateWorkPlanContract(errors);
  assert.deepEqual(errors, []);
});

test("valid minimal work plan is accepted", () => withTextFile(VALID_PLAN, (filePath) => {
  const errors = [];
  validateWorkPlanContract(errors, filePath, { required: true });
  assert.deepEqual(errors, []);
}));

test("work plan requires stable unique IDs, state, and per-item fields", () => {
  const mutations = [
    VALID_PLAN.replace("TODO-A（pending）", "item A"),
    `${VALID_PLAN}\n### TODO-A（done）\n\n- 预期行为：B\n- 影响边界：B\n- 验证：B\n`,
    VALID_PLAN.replace("（pending）", ""),
    VALID_PLAN.replace("- 验证：运行 A 测试。\n", ""),
  ];
  for (const mutation of mutations) {
    withTextFile(mutation, (filePath) => {
      const errors = [];
      validateWorkPlanContract(errors, filePath, { required: true });
      assert.ok(errors.length > 0);
    });
  }
});

test("work plan rejects candidate evidence and readiness verdicts", () => {
  for (const evidence of ["- sourceCommit: deadbeef", "- 候选状态：accepted", "- 发布就绪：ready"]) {
    withTextFile(`${VALID_PLAN}\n${evidence}\n`, (filePath) => {
      const errors = [];
      validateWorkPlanContract(errors, filePath);
      assert.ok(errors.some((error) => error.includes("candidate evidence")));
    });
  }
});

test("missing required work plan fails while optional absence passes", () => {
  const missing = path.join(os.tmpdir(), `missing-work-plan-${process.pid}.md`);
  let errors = [];
  validateWorkPlanContract(errors, missing);
  assert.deepEqual(errors, []);
  errors = [];
  validateWorkPlanContract(errors, missing, { required: true });
  assert.ok(errors.some((error) => error.includes("missing active Work Plan")));
});

test("current changelog rejects superseded Task title claims", () => {
  withTextFile("当前显示标题固定使用 `{任务}-{ID}-{摘要}`\n", (filePath) => {
    const errors = [];
    validateCurrentChangelogContract(errors, filePath);
    assert.equal(errors.length, 1);
  });
});

test("superseded lifecycle checker uses injected contracts", () => {
  withTextFile("发布准备仍要求匹配的\n", (filePath) => {
    const errors = [];
    validateSupersededReleaseLifecycleFragments(errors, [[filePath, ["发布准备仍要求匹配的"]]]);
    assert.equal(errors.length, 1);
  });
});

test("daily memory validator does not mutate repository", () => {
  const before = fs.statSync(path.join(ROOT, "docs", "product_spec", "README.md")).mtimeMs;
  const errors = [];
  validateDailyProjectMemory(errors);
  const after = fs.statSync(path.join(ROOT, "docs", "product_spec", "README.md")).mtimeMs;
  assert.deepEqual(errors, []);
  assert.equal(after, before);
});
