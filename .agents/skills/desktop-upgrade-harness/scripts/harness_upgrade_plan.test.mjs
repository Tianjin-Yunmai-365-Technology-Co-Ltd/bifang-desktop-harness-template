#!/usr/bin/env node
/** Harness 升级计划、所有权和 bootstrap 回归。 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { HarnessUpgradeFixture, MANAGED, MIXED, PROTECTED, REQUIRED_MANAGED_CHECKERS, TOMBSTONE, symlinkOrSkip } from "./harness_upgrade_test_support.mjs";
import { matchesPattern } from "./harness_upgrade_ownership.mjs";

test("ownership_glob_preserves_fnmatch_character_classes", () => {
  assert.equal(matchesPattern("docs/a.txt", "docs/[ab].txt"), true);
  assert.equal(matchesPattern("docs/c.txt", "docs/[ab].txt"), false);
  assert.equal(matchesPattern("docs/c.txt", "docs/[!ab].txt"), true);
  assert.equal(matchesPattern("docs/a.txt", "docs/[!ab].txt"), false);
  assert.equal(matchesPattern("docs/a.txt", "docs/[z-a].txt"), false);
});

test("upstream_only_change_can_apply_and_record", (t) => {
  const f = new HarnessUpgradeFixture(t); f.write(f.candidate, MANAGED, "v1"); f.write(f.target, MANAGED, "v1"); f.bootstrap(); f.write(f.candidate, MANAGED, "v2");
  const { plan, planPath } = f.createPlan(); assert.equal(f.classification(plan, MANAGED), "update");
  const applied = f.runTool(["apply", "--plan", planPath, "--approval", "apply-managed-changes", "--path", MANAGED]); assert.deepEqual(applied.applied, [MANAGED]); assert.equal(fs.readFileSync(path.join(f.target, MANAGED), "utf8"), "v2");
  f.record(f.createPlan(0, "converged").planPath);
});

test("local_change_remains_protected_across_later_upstream_change", (t) => {
  const f = new HarnessUpgradeFixture(t); f.write(f.candidate, MANAGED, "v1"); f.write(f.target, MANAGED, "v1"); f.bootstrap(); f.write(f.target, MANAGED, "local");
  const { plan, planPath } = f.createPlan(); assert.equal(f.classification(plan, MANAGED), "preserve_local"); f.record(planPath); f.write(f.candidate, MANAGED, "v2"); assert.equal(f.classification(f.plan(2), MANAGED), "conflict");
});

test("local_delete_remains_protected_across_later_upstream_change", (t) => {
  const f = new HarnessUpgradeFixture(t); f.write(f.candidate, MANAGED, "v1"); f.write(f.target, MANAGED, "v1"); f.bootstrap(); fs.unlinkSync(path.join(f.target, MANAGED));
  const { plan, planPath } = f.createPlan(); assert.equal(f.classification(plan, MANAGED), "preserve_local"); f.record(planPath); f.write(f.candidate, MANAGED, "v2"); assert.equal(f.classification(f.plan(2), MANAGED), "conflict");
});

test("both_sides_change_blocks", (t) => {
  const f = new HarnessUpgradeFixture(t); f.write(f.candidate, MANAGED, "v1"); f.write(f.target, MANAGED, "v1"); f.bootstrap(); f.write(f.candidate, MANAGED, "upstream"); f.write(f.target, MANAGED, "local"); assert.equal(f.classification(f.plan(2), MANAGED), "conflict");
});

test("delete_requires_manual_resolution_before_record", (t) => {
  const f = new HarnessUpgradeFixture(t); f.write(f.candidate, MANAGED, "v1"); f.write(f.target, MANAGED, "v1"); f.bootstrap(); fs.unlinkSync(path.join(f.candidate, MANAGED));
  const { plan, planPath } = f.createPlan(); assert.equal(f.classification(plan, MANAGED), "delete");
  assert.equal(f.runTool(["apply", "--plan", planPath, "--approval", "apply-managed-changes", "--path", MANAGED], 2).ok, false); assert.equal(fs.existsSync(path.join(f.target, MANAGED)), true);
  f.runTool(["record", "--plan", planPath, "--source-version", f.sourceVersion, "--source-commit", f.sourceCommit, "--approval", "record-verified-baseline"], 2);
  fs.unlinkSync(path.join(f.target, MANAGED)); f.record(f.createPlan(0, "delete-resolved").planPath);
});

test("new_managed_path_requires_manual_convergence", (t) => {
  const f = new HarnessUpgradeFixture(t); f.bootstrap(); f.write(f.candidate, MANAGED, "new"); assert.equal(f.classification(f.plan(), MANAGED), "add"); f.write(f.target, MANAGED, "new"); const { plan, planPath } = f.createPlan(); assert.equal(f.classification(plan, MANAGED), "converged"); f.record(planPath);
});

test("source_required_checkers_must_enter_rendered_candidate", (t) => {
  const f = new HarnessUpgradeFixture(t); f.bootstrap();
  for (const relative of REQUIRED_MANAGED_CHECKERS) f.write(f.source, relative, `source:${relative}`);
  f.git(f.source, "add", ...REQUIRED_MANAGED_CHECKERS); f.git(f.source, "-c", "user.name=Harness Fixture", "-c", "user.email=harness-fixture@example.invalid", "commit", "-m", "add required checker"); f.sourceCommit = f.git(f.source, "rev-parse", "HEAD").stdout.trim();
  const missing = f.plan(2);
  for (const relative of REQUIRED_MANAGED_CHECKERS) { assert.ok(missing.problems.some((item) => item.includes(relative) && item.includes("候选缺少源 Harness 必需 managed 路径"))); f.write(f.candidate, relative, `stale:${relative}`); }
  const stale = f.plan(2);
  for (const relative of REQUIRED_MANAGED_CHECKERS) { assert.ok(stale.problems.some((item) => item.includes(relative) && item.includes("必需 managed 路径内容不匹配"))); f.write(f.candidate, relative, `source:${relative}`); }
  const present = f.plan(); for (const relative of REQUIRED_MANAGED_CHECKERS) assert.equal(f.classification(present, relative), "add");
  assert.equal(present.actions.some((item) => item.path === ".harness/release-context.json"), false);
});

test("release_context_is_a_protected_target_fact", (t) => {
  const f = new HarnessUpgradeFixture(t); const releaseContext = ".harness/release-context.json"; f.bootstrap(); f.write(f.target, releaseContext, '{"release": "target"}\n');
  assert.equal(f.plan().actions.some((item) => item.path === releaseContext), false); assert.equal(fs.readFileSync(path.join(f.target, releaseContext), "utf8"), '{"release": "target"}\n');
  f.write(f.candidate, releaseContext, '{"release": "source"}\n'); assert.equal(f.classification(f.plan(2), releaseContext), "protected_candidate");
});

test("new_path_collision_blocks", (t) => {
  const f = new HarnessUpgradeFixture(t); f.bootstrap(); f.write(f.candidate, MANAGED, "upstream"); f.write(f.target, MANAGED, "local"); assert.equal(f.classification(f.plan(2), MANAGED), "collision");
});

test("protected_candidate_blocks_raw_source_tree", (t) => {
  const f = new HarnessUpgradeFixture(t); f.write(f.candidate, PROTECTED, "upstream"); assert.equal(f.classification(f.plan(2), PROTECTED), "protected_candidate");
});

test("tombstone_in_candidate_or_target_blocks", (t) => {
  const f = new HarnessUpgradeFixture(t); f.write(f.candidate, TOMBSTONE, "source"); assert.equal(f.classification(f.plan(2), TOMBSTONE), "tombstone_candidate"); fs.unlinkSync(path.join(f.candidate, TOMBSTONE)); f.write(f.target, TOMBSTONE, "target"); assert.equal(f.classification(f.plan(2), TOMBSTONE), "tombstone_present");
});

test("target_tombstone_symlink_and_empty_directory_block", (t) => {
  const f = new HarnessUpgradeFixture(t); const outside = path.join(f.root, "outside-version.txt"); fs.writeFileSync(outside, "outside"); if (!symlinkOrSkip(t, outside, path.join(f.target, TOMBSTONE))) return; let plan = f.plan(2); assert.ok(plan.problems.some((item) => item.includes("目标包含 tombstone 路径：Version.md")));
  fs.unlinkSync(path.join(f.target, TOMBSTONE)); fs.mkdirSync(path.join(f.target, ".agents", "skills", "desktop-instantiate-project"), { recursive: true }); plan = f.plan(2); assert.ok(plan.problems.some((item) => item.includes("desktop-instantiate-project")));
});

test("manual_add_cannot_be_recorded_without_creating_target", (t) => {
  const f = new HarnessUpgradeFixture(t); f.write(f.candidate, MIXED, "candidate"); const { plan, planPath } = f.createPlan(2); assert.equal(f.classification(plan, MIXED), "manual_add");
  f.runTool(["record", "--plan", planPath, "--source-version", f.sourceVersion, "--source-commit", f.sourceCommit, "--resolved-manual", MIXED, "--bootstrap", "--approval", "bootstrap-verified-baseline"], 2); assert.equal(fs.existsSync(f.lock), false);
});

test("candidate_symlink_blocks_plan_and_bootstrap_record", (t) => {
  const f = new HarnessUpgradeFixture(t); const outside = path.join(f.root, "outside.txt"); fs.writeFileSync(outside, "secret"); const linked = path.join(f.candidate, MANAGED); fs.mkdirSync(path.dirname(linked), { recursive: true }); if (!symlinkOrSkip(t, outside, linked)) return;
  const { planPath } = f.createPlan(2); f.runTool(["record", "--plan", planPath, "--source-version", f.sourceVersion, "--source-commit", f.sourceCommit, "--bootstrap", "--approval", "bootstrap-verified-baseline"], 2); assert.equal(fs.existsSync(f.lock), false);
});

test("bootstrap_rejects_divergent_managed_overlap", (t) => {
  const f = new HarnessUpgradeFixture(t); f.write(f.candidate, MANAGED, "upstream"); f.write(f.target, MANAGED, "local"); const { planPath } = f.createPlan(2); f.runTool(["record", "--plan", planPath, "--source-version", f.sourceVersion, "--source-commit", f.sourceCommit, "--bootstrap", "--approval", "bootstrap-verified-baseline"], 2); assert.equal(fs.existsSync(f.lock), false);
});

test("bootstrap_rejects_tombstone", (t) => {
  const f = new HarnessUpgradeFixture(t); f.write(f.target, TOMBSTONE, "forbidden"); const { planPath } = f.createPlan(2); f.runTool(["record", "--plan", planPath, "--source-version", f.sourceVersion, "--source-commit", f.sourceCommit, "--bootstrap", "--approval", "bootstrap-verified-baseline"], 2); assert.equal(fs.existsSync(f.lock), false);
});
