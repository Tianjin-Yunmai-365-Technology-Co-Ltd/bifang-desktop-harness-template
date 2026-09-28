import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { ROOT } from "./core.mjs";
import {
  validateDownstreamVersionClassification,
  validateProductVersioningContract,
} from "./product_versioning.mjs";

/** 读取真实 Skill 文案，测试有意移除或颠倒关键句后的门禁反馈。 */
function classificationSkills() {
  return {
    implementation: fs.readFileSync(path.join(ROOT, ".agents/skills/desktop-implement-change/SKILL.md"), "utf8"),
    version: fs.readFileSync(path.join(ROOT, ".agents/skills/desktop-manage-version/SKILL.md"), "utf8"),
  };
}

test("current repository satisfies downstream automatic version contract", () => {
  const errors = [];
  validateProductVersioningContract(errors);
  assert.deepEqual(errors, [], errors.join("\n"));
});

test("current_skills_state_requirement_first_and_historical_minimum_rules", () => {
  const { implementation, version } = classificationSkills();
  const errors = [];
  validateDownstreamVersionClassification(errors, implementation, version);
  assert.deepEqual(errors, [], errors.join("\n"));
});

test("requirement_first_classification_rejects_bug_fix_priority", () => {
  const { implementation, version } = classificationSkills();
  const bugFixClause = "确认不属于新需求后，具有新稳定 ID 的问题修复或用户可感知优化分类为 `bug-fix`/Patch。";
  assert.ok(implementation.includes(bugFixClause));
  const reversed = implementation.replace(bugFixClause, "").replace(
    "随后判断变化相对已发布规格与行为的性质。",
    `${bugFixClause}随后判断变化相对已发布规格与行为的性质。`,
  );
  const errors = [];
  validateDownstreamVersionClassification(errors, reversed, version);
  assert.ok(errors.some((error) => error.includes("desktop-implement-change step 2")), errors.join("\n"));
});

test("version_skill_rejects_bug_fix_before_feature", () => {
  const { implementation, version } = classificationSkills();
  const bugFixClause = "确认不属于新需求后，问题修复或用户可感知优化仍可归为 `bug-fix`，无需证明违背既有承诺。";
  assert.ok(version.includes(bugFixClause));
  const reversed = version.replace(bugFixClause, "").replace(
    "已完成正式发布并确认版本 tag 的下游开始新改动时，",
    `已完成正式发布并确认版本 tag 的下游开始新改动时，${bugFixClause}`,
  );
  const errors = [];
  validateDownstreamVersionClassification(errors, implementation, reversed);
  assert.ok(errors.some((error) => error.includes("desktop-manage-version classification")), errors.join("\n"));
});

test("historical_minimum_version_must_not_be_called_a_conflict", () => {
  const { implementation, version } = classificationSkills();
  const misleading = version.replace(
    "最终发布版本高于它是合法历史，不属于记录不一致",
    "最终发布版本高于它是记录不一致，必须强制提升 Minor",
  );
  assert.notEqual(misleading, version);
  const errors = [];
  validateDownstreamVersionClassification(errors, implementation, misleading);
  assert.ok(errors.some((error) => error.includes("desktop-manage-version historical required_version")), errors.join("\n"));
});

test("historical_minimum_policy_requires_evidence_for_real_conflict", () => {
  const { implementation, version } = classificationSkills();
  const incomplete = version.replace(
    "真实冲突须先调查并修正其事实来源，明确两份针对同一事件的记录及不同观察值",
    "真实不一致可以直接按历史最低版本差异认定",
  );
  assert.notEqual(incomplete, version);
  const errors = [];
  validateDownstreamVersionClassification(errors, implementation, incomplete);
  assert.ok(errors.some((error) => error.includes("desktop-manage-version historical required_version")), errors.join("\n"));
});
