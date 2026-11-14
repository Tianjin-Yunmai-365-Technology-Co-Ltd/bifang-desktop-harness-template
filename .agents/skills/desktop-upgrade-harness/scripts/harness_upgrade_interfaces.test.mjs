/** GUI 框架选择、候选传播与受保护事实的升级回归。 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { inapplicableGuiCandidate, parseInterfaceSelection } from "./harness_upgrade_interfaces.mjs";
import { snapshotFile } from "./harness_upgrade_safety.mjs";
import { HarnessUpgradeFixture, MANAGED } from "./harness_upgrade_test_support.mjs";

const METADATA = "[workspace.metadata.agent-first-harness]\n";
const TAURI = ".agents/skills/desktop-add-gui-adapter/SKILL.md";

test("desktop_upgrade_rejects_retired_framework_without_mutation", (t) => {
  const source = `${METADATA}interfaces = ["gui"]\n`;
  assert.deepEqual(parseInterfaceSelection(source), { interfaces: ["gui"], guiFramework: "tauri" });
  const explicit = `${source}gui-framework = "gpui"\n`;
  assert.throws(() => parseInterfaceSelection(explicit), /DESKTOP 仅支持 Tauri/u);
  const f = new HarnessUpgradeFixture(t);
  f.write(f.target, "Cargo.toml", explicit);
  f.write(f.candidate, TAURI, "tauri engineering skill\n");
  assert.match(f.plan(2).error, /DESKTOP 仅支持 Tauri/u);
  assert.equal(fs.readFileSync(path.join(f.target, "Cargo.toml"), "utf8"), explicit);
  assert.equal(fs.existsSync(path.join(f.target, TAURI)), false);
});

/** 顶层 NSH 读取显式目标，旧 GUI/NSH 保持原语义。 */
test("top_level_nsh_targets_are_parsed_without_gui_framework", () => {
  assert.deepEqual(parseInterfaceSelection(`${METADATA}interfaces = ["nsh"]\nnsh-targets = ["desktop", "mobile", "web"]\n`), { interfaces: ["nsh"], guiFramework: null, nshTargets: ["desktop", "mobile", "web"] });
  assert.deepEqual(parseInterfaceSelection(`${METADATA}interfaces = ["gui"]\ngui-framework = "nsh"\n`), { interfaces: ["gui"], guiFramework: "nsh" });
  assert.deepEqual(parseInterfaceSelection(`${METADATA}interfaces = ["nsh"]\nnsh-targets = ["tui"]\n`).nshTargets, ["tui"]);
  for (const suffix of ['nsh-targets = []', 'nsh-targets = ["desktop", "desktop"]', 'nsh-targets = ["unknown"]']) {
    assert.throws(() => parseInterfaceSelection(`${METADATA}interfaces = ["nsh"]\n${suffix}\n`), /Cargo nsh-targets/u);
  }
  assert.throws(() => parseInterfaceSelection(`${METADATA}interfaces = ["gui"]\nnsh-targets = ["desktop"]\n`), /只适用于顶层 NSH/u);
  assert.throws(() => parseInterfaceSelection(`${METADATA}interfaces = ["nsh"]\n`), /nsh-targets/u);
  assert.throws(() => parseInterfaceSelection(`${METADATA}interfaces = ["cli", "nsh"]\nnsh-targets = ["desktop"]\n`), /独立顶层接口/u);
});

/** 工程升级兼容两个正式版本，拒绝预览、错配和混装。 */
test("nsh_upgrade_requires_one_supported_runtime_revision", () => {
  const latest = dependency("0.5.1", "224d9a795c7ac9d10d75750de9351adac5549675");
  const previous = dependency("0.5.0", "f4d68f7f9f31eb7b3ecc8a4cbc31096d5c6238a1");
  const preview = dependency("0.5.1", "beeb9fc7707e0d4a195a4f7274f77b30e134c500");
  const source = (core, base) => `${METADATA}interfaces = ["nsh"]\nnsh-targets = ["desktop"]\n[workspace.dependencies]\nnsh-core = ${core}\nnsh-base = ${base}\n`;

  function dependency(version, revision) {
    return `{ version = "${version}", git = "https://github.com/longbridge/nsh.git", rev = "${revision}" }`;
  }

  assert.deepEqual(parseInterfaceSelection(source(latest, latest)).nshTargets, ["desktop"]);
  assert.deepEqual(parseInterfaceSelection(source(previous, previous)).nshTargets, ["desktop"]);
  assert.throws(() => parseInterfaceSelection(source(preview, preview)), /正式版固定提交/u);
  assert.throws(() => parseInterfaceSelection(source(latest, previous)), /正式版固定提交/u);
  const wrongVersion = latest.replace('"0.5.1"', '"0.5.0"');
  assert.throws(() => parseInterfaceSelection(source(wrongVersion, wrongVersion)), /正式版固定提交/u);
});

/** 未知值、错类型、重复键和非法接口不能降级到默认值。 */
test("framework_selection_rejects_unknown_duplicate_and_malformed_metadata", () => {
  for (const suffix of [
    'gui-framework = "unknown"', 'gui-framework = false', 'gui-framework = 1',
    'gui-framework = "gpui"\ngui-framework = "tauri"',
    'interfaces = ["gui"]', '[workspace.metadata.agent-first-harness]\ngui-framework = "gpui"',
    '[workspace.metadata.agent-first-harness.gui-framework]',
  ]) assert.throws(() => parseInterfaceSelection(`${METADATA}interfaces = ["gui"]\n${suffix}\n`), /Cargo/u);
  for (const interfaces of ['"gui"', '["gui", "gui"]', '["tui"]', '["cli", "tui"]', '["unknown"]', '[false]']) {
    assert.throws(() => parseInterfaceSelection(`${METADATA}interfaces = ${interfaces}\n`), /Cargo/u);
  }
  assert.throws(() => parseInterfaceSelection(`${METADATA}interfaces = ["cli"]\ngui-framework = "tauri"\n`), /只适用于已选择 GUI/u);
  assert.throws(() => parseInterfaceSelection('workspace.metadata.agent-first-harness = { interfaces = ["gui"], gui-framework = "gpui" }\n'), /内联表/u);
  assert.throws(() => parseInterfaceSelection('gui-framework = "gpui"\n'), /必须位于 workspace.metadata/u);
});

/** GUI 工程目录按持久框架选择，不从候选中的技能反推接口。 */
test("gui_candidate_selection_excludes_the_other_framework_and_non_gui_projects", () => {
  const nsh = { interfaces: ["gui"], guiFramework: "nsh" };
  assert.equal(inapplicableGuiCandidate("docs/GUI_ENGINEERING.md", nsh), false);
  assert.equal(inapplicableGuiCandidate(".agents/skills/desktop-build-nsh-release/SKILL.md", nsh), false);
  assert.equal(inapplicableGuiCandidate("docs/GUI_ENGINEERING.md", { interfaces: ["cli"], guiFramework: null }), true);
  const topLevelNsh = { interfaces: ["nsh"], guiFramework: null, nshTargets: ["mobile", "web"] };
  assert.equal(inapplicableGuiCandidate(".agents/skills/desktop-build-nsh-release/SKILL.md", topLevelNsh), false);
  assert.equal(inapplicableGuiCandidate(".agents/skills/desktop-add-gui-adapter/SKILL.md", topLevelNsh), true);
  assert.equal(inapplicableGuiCandidate(".agents/skills/desktop-prepare-gui-support-surfaces/SKILL.md", topLevelNsh), true);
  assert.equal(inapplicableGuiCandidate(".agents/skills/desktop-prepare-gui-app-identity/SKILL.md", topLevelNsh), true);
});

/** 实际接口决定文档与发布 Skill 的保留范围；NSH 批次证据不走扁平收集器。 */
test("interface_candidate_selection_prunes_unused_cli_mcp_i18n_and_collection_paths", () => {
  const cases = [
    { selection: { interfaces: ["cli"], guiFramework: null }, kept: ["desktop-add-cli-adapter", "desktop-build-rust-release", "desktop-prepare-cross-platform-release", "desktop-collect-release-artifacts"], removed: ["desktop-add-mcp-adapter", "desktop-extract-i18n-strings"] },
    { selection: { interfaces: ["mcp"], guiFramework: null }, kept: ["desktop-add-mcp-adapter"], removed: ["desktop-add-cli-adapter", "desktop-build-rust-release", "desktop-prepare-cross-platform-release", "desktop-extract-i18n-strings", "desktop-collect-release-artifacts"] },
    { selection: { interfaces: ["gui"], guiFramework: "tauri" }, kept: ["desktop-extract-i18n-strings", "desktop-collect-release-artifacts"], removed: ["desktop-add-cli-adapter", "desktop-add-mcp-adapter", "desktop-build-rust-release", "desktop-prepare-cross-platform-release"] },
    { selection: { interfaces: ["nsh"], guiFramework: null, nshTargets: ["desktop", "mobile", "web"] }, kept: [], removed: ["desktop-add-cli-adapter", "desktop-add-mcp-adapter", "desktop-build-rust-release", "desktop-prepare-cross-platform-release", "desktop-extract-i18n-strings", "desktop-collect-release-artifacts"] },
  ];
  for (const { selection, kept, removed } of cases) {
    for (const name of kept) assert.equal(inapplicableGuiCandidate(`.agents/skills/${name}/SKILL.md`, selection), false, name);
    for (const name of removed) assert.equal(inapplicableGuiCandidate(`.agents/skills/${name}/SKILL.md`, selection), true, name);
    assert.equal(inapplicableGuiCandidate("docs/CLI_CONTRACT.md", selection), !selection.interfaces.includes("cli"));
  }
});

/** 缺省旧 GUI 可接收 Tauri，纯 CLI 不可接收任一种 GUI 技能。 */
test("legacy_tauri_and_non_gui_plans_enforce_gui_applicability", (t) => {
  const f = new HarnessUpgradeFixture(t);
  f.write(f.target, "Cargo.toml", `${METADATA}interfaces = ["gui"]\n`);
  f.write(f.candidate, TAURI, "tauri engineering skill\n");
  assert.equal(f.plan().gui_framework, "tauri");
  const retired = [
    ".agents/skills/desktop-add-gpui-adapter/SKILL.md",
    ".agents/skills/desktop-add-tui-adapter/SKILL.md",
    ".agents/skills/desktop-check-development-environment/scripts/linux-gpui-dependencies.sh",
    ".agents/skills/desktop-check-development-environment/scripts/linux_gpui_dependencies.test.mjs",
    ".agents/skills/desktop-upgrade-harness/references/gpui-ownership.md",
    ".agents/skills/desktop-add-nsh-adapter/scripts/run_nsh_tui.mjs",
    ".agents/skills/desktop-add-nsh-adapter/scripts/nsh_tui_adapter.test.mjs",
  ];
  for (const relative of retired) f.write(f.candidate, relative, "retired engineering asset\n");
  const problems = f.plan(2).problems;
  for (const relative of retired) {
    assert.ok(problems.some(problem => problem.includes(relative)), relative);
    fs.rmSync(path.join(f.candidate, relative));
  }
  f.write(f.target, "Cargo.toml", `${METADATA}interfaces = ["cli"]\n`);
  assert.ok(f.plan(2).problems.some((problem) => problem.includes(TAURI)));
});

/** 退役资产旧基线退出 Harness 管理，已有文件字节及其他工程基线仍保留。 */
test("upgrade_forgets_retired_ownership_without_deleting_target_files", (t) => {
  const f = new HarnessUpgradeFixture(t);
  f.write(f.target, "Cargo.toml", `${METADATA}interfaces = ["cli"]\n`);
  f.write(f.candidate, MANAGED, "current engineering skill\n");
  f.write(f.target, MANAGED, "current engineering skill\n");
  f.bootstrap();
  const lock = JSON.parse(fs.readFileSync(f.lock, "utf8"));
  const retired = ".agents/skills/desktop-add-tui-adapter/SKILL.md";
  const file = path.join(f.target, retired);
  f.write(f.target, retired, "old harness bytes\n");
  const baseline = snapshotFile(file);
  lock.entries[retired] = { mode: "conditional", candidate: baseline, target: baseline };
  fs.writeFileSync(f.lock, JSON.stringify(lock));
  f.write(f.target, retired, "user maintained local copy\n");
  const { plan, planPath } = f.createPlan();
  assert.equal(plan.blocked, false);
  assert.equal(plan.actions.some(item => item.path === retired), false);
  f.record(planPath);
  const recorded = JSON.parse(fs.readFileSync(f.lock, "utf8"));
  assert.equal(Object.hasOwn(recorded.entries, retired), false);
  assert.deepEqual(recorded.entries[MANAGED], lock.entries[MANAGED]);
  assert.equal(fs.readFileSync(file, "utf8"), "user maintained local copy\n");
});

/** 框架事实在计划后改变，即使 Git 脏状态相同也禁止应用其他受管更新。 */
test("framework_metadata_drift_blocks_reviewed_managed_application", (t) => {
  const f = new HarnessUpgradeFixture(t);
  f.write(f.target, "Cargo.toml", `${METADATA}interfaces = ["gui"]\ngui-framework = "tauri"\n`);
  f.write(f.candidate, MANAGED, "v1");
  f.write(f.target, MANAGED, "v1");
  f.bootstrap();
  f.write(f.candidate, MANAGED, "v2");
  const { planPath } = f.createPlan();
  f.write(f.target, "Cargo.toml", `${METADATA}interfaces = ["gui"]\ngui-framework = "nsh"\n`);
  const result = f.runTool(["apply", "--plan", planPath, "--approval", "apply-managed-changes", "--path", MANAGED], 2);
  assert.match(result.error, /已复核 plan 不再匹配/u);
  assert.equal(fs.readFileSync(path.join(f.target, MANAGED), "utf8"), "v1");
});

/** 初始化 E2E 永久禁止通过 Harness 升级恢复。 */
test("initialization_e2e_retains_tombstone_ownership", t => {
  const f = new HarnessUpgradeFixture(t);
  const initial = ".agents/skills/desktop-test-gui-initialization-e2e/SKILL.md";
  f.write(f.target, "Cargo.toml", METADATA + 'interfaces = ["gui"]\ngui-framework = "tauri"\n');
  f.write(f.candidate, initial, "initialization-only E2E\n");
  assert.equal(f.classification(f.plan(2), initial), "tombstone_candidate");
  fs.rmSync(path.join(f.candidate, initial));
  f.write(f.target, initial, "stale E2E\n");
  assert.equal(f.classification(f.plan(2), initial), "tombstone_present");
});
