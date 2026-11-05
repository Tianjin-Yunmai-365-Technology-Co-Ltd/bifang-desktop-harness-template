/** 验证退役资产清理必须先确认、记忆选择并拒绝未完成和漂移的计划。 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { HarnessUpgradeFixture, symlinkOrSkip } from "./harness_upgrade_test_support.mjs";
import { snapshotFile } from "./harness_upgrade_safety.mjs";
import { RETIRED_ENGINEERING_PATHS, RETIREMENT_SCOPE } from "./harness_upgrade_retirement.mjs";

/** 模拟真正旧版来源锁；不能以新版已禁止的退役候选建立旧共同基线。 */
function legacy(t, relative) {
  const f = new HarnessUpgradeFixture(t);
  f.bootstrap();
  f.write(f.target, relative, "legacy project capability\n");
  const lock = JSON.parse(fs.readFileSync(f.lock, "utf8"));
  const snapshot = snapshotFile(path.join(f.target, relative));
  lock.entries[relative] = { mode: "conditional", candidate: snapshot, target: snapshot };
  fs.writeFileSync(f.lock, JSON.stringify(lock));
  return f;
}

/** 覆盖三个旧 Skill 和共享 Skill 中退役合同/资产，拒绝候选恢复并发现未登记文件。 */
for (const root of RETIRED_ENGINEERING_PATHS) {
  const relative = path.extname(root) ? root : `${root}/legacy.txt`;
  test(`retired_path_requires_choice_and_cannot_reenter_candidate_${path.basename(root)}`, t => {
    const f = new HarnessUpgradeFixture(t);
    f.write(f.target, relative, "local legacy bytes");
    const { plan, planPath } = f.createPlan(2);
    assert.equal(f.classification(plan, relative), "cleanup_selection_required");
    assert.equal(plan.actions.find(item => item.path === relative).auto_apply, false);
    assert.match(f.runTool(["record", "--plan", planPath, "--source-version", f.sourceVersion, "--source-commit", f.sourceCommit, "--bootstrap", "--approval", "bootstrap-verified-baseline"], 2).error, /退役能力清理/u);
    f.retirementRequest = "preserve";
    f.write(f.candidate, relative, "must never be restored");
    assert.equal(f.classification(f.plan(2), relative), "retired_candidate");
    assert.equal(fs.readFileSync(path.join(f.target, relative), "utf8"), "local legacy bytes");
  });
}

/** 旧 conditional 基线保留 mode；选择清理不自动删除，只有缺席的新计划能记录完成。 */
test("remove_requires_actual_deletion_and_remembers_choice_for_future_upgrades", t => {
  const relative = ".agents/skills/desktop-add-gui-updater/SKILL.md";
  const f = legacy(t, relative);
  f.write(f.target, relative, "project customization\n");
  f.retirementRequest = "remove";
  const { plan, planPath } = f.createPlan();
  const action = plan.actions.find(item => item.path === relative);
  assert.equal(action.mode, "conditional");
  assert.equal(action.classification, "cleanup_required");
  assert.equal(action.auto_apply, false);
  assert.match(f.runTool(["apply", "--plan", planPath, "--approval", "apply-managed-changes", "--path", relative], 2).error, /update/u);
  for (const extra of [[], ["--resolved-manual", relative]]) {
    assert.match(f.runTool(["record", "--plan", planPath, "--source-version", f.sourceVersion, "--source-commit", f.sourceCommit, "--approval", "record-verified-baseline", ...extra], 2).error, /退役能力清理/u);
  }
  assert.equal(fs.readFileSync(path.join(f.target, relative), "utf8"), "project customization\n");
  fs.rmSync(path.dirname(path.join(f.target, relative)), { recursive: true });
  f.record(f.createPlan().planPath);
  const lock = JSON.parse(fs.readFileSync(f.lock, "utf8"));
  assert.equal(Object.hasOwn(lock.entries, relative), false);
  assert.equal(lock.retirement_cleanup.selection, "remove");
  assert.equal(lock.retirement_cleanup.scope, RETIREMENT_SCOPE);
  f.retirementRequest = null;
  f.write(f.target, relative, "reintroduced");
  const next = f.plan();
  assert.equal(next.retirement_cleanup.source, "remembered");
  assert.equal(f.classification(next, relative), "cleanup_required");
});

/** 明确保留后复用同一偏好和确认时间，保护本地字节，允许用户以后主动更改。 */
test("preserve_remembers_project_choice_without_resetting_confirmation", t => {
  const relative = ".agents/skills/desktop-add-gui-telemetry/SKILL.md";
  const f = legacy(t, relative);
  f.retirementRequest = "preserve";
  f.record(f.createPlan().planPath);
  const remembered = JSON.parse(fs.readFileSync(f.lock, "utf8")).retirement_cleanup;
  f.retirementRequest = null;
  assert.equal(f.classification(f.plan(), relative), "preserve_retired");
  f.record(f.createPlan().planPath);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.lock, "utf8")).retirement_cleanup, remembered);
  assert.equal(fs.readFileSync(path.join(f.target, relative), "utf8"), "legacy project capability\n");
  f.retirementRequest = "remove";
  assert.equal(f.classification(f.plan(), relative), "cleanup_required");
});

/** 初次接入选择保留时也须持久化，并禁止重算后伪造原计划中的用户选择。 */
test("bootstrap_can_remember_preserve_and_rejects_tampered_choice", t => {
  const f = new HarnessUpgradeFixture(t);
  const relative = ".agents/skills/desktop-enable-gui-updates/SKILL.md";
  f.write(f.target, relative, "local-only capability");
  f.retirementRequest = "preserve";
  f.bootstrap();
  const { plan, planPath } = f.createPlan();
  plan.retirement_cleanup.selection = "remove";
  fs.writeFileSync(planPath, JSON.stringify(plan));
  assert.match(f.runTool(["record", "--plan", planPath, "--source-version", f.sourceVersion, "--source-commit", f.sourceCommit, "--approval", "record-verified-baseline"], 2).error, /plan 不再匹配/u);
  assert.equal(JSON.parse(fs.readFileSync(f.lock, "utf8")).retirement_cleanup.selection, "preserve");
});

/** 坏偏好和复核后的锁漂移都必须失败，不能退回隐式默认值。 */
test("invalid_or_drifted_remembered_choice_fails_closed", t => {
  const f = new HarnessUpgradeFixture(t);
  f.retirementRequest = "preserve";
  f.bootstrap();
  const { planPath } = f.createPlan();
  const lock = JSON.parse(fs.readFileSync(f.lock, "utf8"));
  lock.retirement_cleanup.selection = "remove";
  fs.writeFileSync(f.lock, JSON.stringify(lock));
  assert.match(f.runTool(["record", "--plan", planPath, "--source-version", f.sourceVersion, "--source-commit", f.sourceCommit, "--approval", "record-verified-baseline"], 2).error, /plan 不再匹配/u);
  lock.retirement_cleanup.selection = "automatic";
  fs.writeFileSync(f.lock, JSON.stringify(lock));
  assert.match(f.plan(2).error, /清理选择非法/u);
});

/** 未登记退役目录的符号链接不可跟随，不能以保留或删除偏好绕过。 */
test("unregistered_retired_symlink_is_blocked_without_following_it", t => {
  const f = new HarnessUpgradeFixture(t);
  f.retirementRequest = "preserve";
  const relative = ".agents/skills/desktop-add-gui-updater";
  const outside = path.join(f.root, "outside");
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, "secret"), "unchanged");
  if (!symlinkOrSkip(t, outside, path.join(f.target, relative), "dir")) return;
  assert.match(f.plan(2).problems.join("\n"), /符号链接或特殊文件/u);
  assert.equal(fs.readFileSync(path.join(outside, "secret"), "utf8"), "unchanged");
});

/** 退役根的生成目录不剪枝；即使目录为空，也不能把清理选择记为已完成。 */
test("retired_ignored_descendants_and_empty_directories_remain_pending", t => {
  const f = new HarnessUpgradeFixture(t);
  const root = ".agents/skills/desktop-add-gui-updater";
  const relative = `${root}/release/legacy.json`;
  f.write(f.target, ".gitignore", "release/\n");
  f.write(f.target, relative, "ignored legacy");
  f.retirementRequest = "remove";
  assert.equal(f.classification(f.plan(), relative), "cleanup_required");
  fs.rmSync(path.join(f.target, relative));
  const { plan, planPath } = f.createPlan();
  assert.ok(plan.retirement_targets.some(item => item.path === root && item.is_directory));
  assert.match(f.runTool(["record", "--plan", planPath, "--source-version", f.sourceVersion, "--source-commit", f.sourceCommit, "--bootstrap", "--approval", "bootstrap-verified-baseline"], 2).error, /退役能力清理/u);
});

/** 本地加固的 protected 规则仍然有效，但不能静默保留后声称 remove 已完成。 */
test("protected_retired_asset_is_a_cleanup_conflict", t => {
  const f = new HarnessUpgradeFixture(t);
  const relative = ".agents/skills/desktop-add-gui-updater/SKILL.md";
  f.write(f.target, relative, "local protected bytes");
  const ownership = JSON.parse(fs.readFileSync(f.ownership, "utf8"));
  ownership.rules.unshift({ pattern: relative, mode: "protected" });
  fs.writeFileSync(f.ownership, JSON.stringify(ownership));
  f.retirementRequest = "remove";
  const { plan, planPath } = f.createPlan(2);
  assert.equal(f.classification(plan, relative), "protected");
  assert.match(plan.problems.join("\n"), /清理范围与受保护所有权冲突/u);
  assert.match(f.runTool(["record", "--plan", planPath, "--source-version", f.sourceVersion, "--source-commit", f.sourceCommit, "--bootstrap", "--approval", "bootstrap-verified-baseline"], 2).error, /退役能力清理/u);
  assert.equal(fs.readFileSync(path.join(f.target, relative), "utf8"), "local protected bytes");
});
