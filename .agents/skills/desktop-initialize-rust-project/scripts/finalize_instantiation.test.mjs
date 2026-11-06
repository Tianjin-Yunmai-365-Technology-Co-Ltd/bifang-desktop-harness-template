/** 终端裁剪绑定真实工程快照，外部测试与 Computer Use 引用不由 helper 自行认证。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { prepareFixture, writeNeutralWorkspace } from '../../desktop-instantiate-project/scripts/instantiation_test_support.mjs';
import { inventoryTarget } from '../../desktop-instantiate-project/scripts/instantiation_io.mjs';
import { finalizeInstantiation, planFinalization } from './finalize_instantiation.mjs';
import { ensureGpuiKitSkills } from './ensure_gpui_kit_skills.mjs';

/** 夹具只提供外部引用形状，不把此值当真实 E2E 执行证据。 */
function fixtureEvidence(plan) { return { scopeDigest: plan.scopeDigest, ...Object.fromEntries(plan.requiredEvidence.map(key => [key, `tool:fixture-not-real-execution/${key}`])) }; }

/** 每条接口路径裁剪其专属源入口，所有通用工程能力和法律正文继续存在。 */
for (const framework of [null, 'tauri', 'gpui', 'nsh']) test(`terminal_pruning_preserves_selected_${framework ?? 'cli'}_and_common_contracts`, t => {
  const f = prepareFixture(t, framework);
  writeNeutralWorkspace(f);
  if (framework === 'gpui') {
    ensureGpuiKitSkills(f.target);
    fs.appendFileSync(path.join(f.target, 'AGENTS.md'), '- [$gpui-kit](.agents/skills/gpui-kit/SKILL.md)\n- [$gpui-kit-design-guides](.agents/skills/gpui-kit-design-guides/SKILL.md)\n');
  }
  const beforeLicense = fs.readFileSync(path.join(f.target, 'LICENSE.zh-CN.md'));
  const plan = planFinalization(f.preparation);
  const outcome = finalizeInstantiation(f.preparation, plan.planDigest, fixtureEvidence(plan));
  assert.equal(outcome.status, 'terminal-pruning-complete');
  assert.equal(outcome.initializationComplete, false);
  assert.equal(fs.existsSync(path.join(f.target, '.git')), false);
  for (const name of ['desktop-instantiate-project', 'desktop-initialize-rust-project', 'desktop-test-gui-initialization-e2e', 'desktop-test-gpui-initialization-e2e', 'desktop-test-nsh-initialization-e2e']) assert.equal(fs.existsSync(path.join(f.target, '.agents/skills', name)), false, name);
  for (const name of ['desktop-manage-version', 'desktop-task-workflow', 'desktop-manage-git-lifecycle', 'desktop-upgrade-harness', 'desktop-implement-change']) assert.ok(fs.existsSync(path.join(f.target, '.agents/skills', name, 'SKILL.md')), name);
  for (const candidate of ['tauri', 'gpui', 'nsh']) {
    const name = candidate === 'tauri' ? 'desktop-add-gui-adapter' : `desktop-add-${candidate}-adapter`;
    assert.equal(fs.existsSync(path.join(f.target, '.agents/skills', name)), candidate === framework, candidate);
  }
  assert.deepEqual(fs.readFileSync(path.join(f.target, 'LICENSE.zh-CN.md')), beforeLicense);
  const agents = fs.readFileSync(path.join(f.target, 'AGENTS.md'), 'utf8');
  assert.ok(agents.trimEnd().split('\n').length <= 120);
  assert.match(agents, /## Skills 地图/u);
  assert.match(agents, /## 约束地图/u);
  assert.doesNotMatch(agents, /\$desktop-instantiate-project|check_no_python/u);
});

/** 没有真实初始化结构、版本状态或外部证据引用时不删除任何源入口。 */
test('missing_workspace_checks_or_gui_observation_never_prunes', t => {
  const f = prepareFixture(t, 'gpui');
  assert.throws(() => planFinalization(f.preparation), /Cargo/u);
  writeNeutralWorkspace(f);
  const plan = planFinalization(f.preparation);
  const before = fs.readFileSync(path.join(f.target, '.agents/skills/desktop-instantiate-project/SKILL.md'));
  assert.throws(() => finalizeInstantiation(f.preparation, plan.planDigest, { scopeDigest: plan.scopeDigest, passed: true }));
  const evidence = fixtureEvidence(plan); delete evidence.computerUse;
  assert.throws(() => finalizeInstantiation(f.preparation, plan.planDigest, evidence), /computerUse/u);
  assert.deepEqual(fs.readFileSync(path.join(f.target, '.agents/skills/desktop-instantiate-project/SKILL.md')), before);
  fs.mkdirSync(path.join(f.target, '.git'));
  assert.throws(() => planFinalization(f.preparation), /Git 基线之前/u);
});

/** 初始化可改写的明确知识地图之外，准备文件和许可证的用户变化均阻断覆盖。 */
test('prepared_file_drift_and_stale_scope_preserve_user_changes', t => {
  const f = prepareFixture(t); writeNeutralWorkspace(f);
  const plan = planFinalization(f.preparation);
  const file = path.join(f.target, 'LICENSE.en.md'); fs.appendFileSync(file, '\nuser edit\n');
  assert.throws(() => finalizeInstantiation(f.preparation, plan.planDigest, fixtureEvidence(plan)), /漂移/u);
  assert.match(fs.readFileSync(file, 'utf8'), /user edit/u);
  const g = prepareFixture(t); writeNeutralWorkspace(g);
  const old = planFinalization(g.preparation);
  fs.writeFileSync(path.join(g.target, 'new-user-file.txt'), 'user');
  assert.throws(() => finalizeInstantiation(g.preparation, old.planDigest, fixtureEvidence(old)), /摘要/u);
  assert.equal(fs.readFileSync(path.join(g.target, 'new-user-file.txt'), 'utf8'), 'user');
});

/** 实际成员、身份、核心依赖和受保护版本状态必须匹配，不靠文件存在推断完成。 */
test('wrong_project_members_core_dependency_or_version_state_are_rejected', t => {
  for (const mutate of [
    f => fs.writeFileSync(path.join(f.target, 'Cargo.toml'), fs.readFileSync(path.join(f.target, 'Cargo.toml'), 'utf8').replace('project-id = "regression_tool"', 'project-id = "other_tool"')),
    f => fs.writeFileSync(path.join(f.target, 'Cargo.toml'), fs.readFileSync(path.join(f.target, 'Cargo.toml'), 'utf8').replace('"regression_tool_cli"]', '"regression_tool_gui"]')),
    f => fs.writeFileSync(path.join(f.target, 'regression_tool_cli/Cargo.toml'), fs.readFileSync(path.join(f.target, 'regression_tool_cli/Cargo.toml'), 'utf8').replace('regression_tool_core.workspace = true', 'regression_tool_core = { workspace = true, optional = true }')),
    f => fs.writeFileSync(path.join(f.target, '.harness/version-state.json'), '{"schema_version":1,"target_version":"0.2.0"}'),
  ]) {
    const f = prepareFixture(t); writeNeutralWorkspace(f); mutate(f);
    assert.throws(() => planFinalization(f.preparation));
    assert.ok(fs.existsSync(path.join(f.target, '.agents/skills/desktop-instantiate-project/SKILL.md')));
  }
});

/** 预检与 rename 之间出现的新用户文件必须恢复其真实字节，不能当旧快照删除。 */
test('rename_race_restores_actual_moved_user_bytes', t => {
  const f = prepareFixture(t); writeNeutralWorkspace(f);
  const plan = planFinalization(f.preparation);
  const raced = path.join(f.target, plan.operations[0].path);
  const original = fs.renameSync;
  let injected = false;
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (!injected && from === raced) { injected = true; fs.unlinkSync(from); fs.writeFileSync(from, 'concurrent user bytes'); }
    return original(from, to);
  });
  assert.throws(() => finalizeInstantiation(f.preparation, plan.planDigest, fixtureEvidence(plan)), /隔离期间/u);
  assert.equal(fs.readFileSync(raced, 'utf8'), 'concurrent user bytes');
});

/** 中途写入失败恢复整个已修改集合，未修改源和新增业务文件保持不变。 */
test('write_failure_restores_original_tree_without_overwriting_unknown_files', t => {
  const f = prepareFixture(t); writeNeutralWorkspace(f);
  const plan = planFinalization(f.preparation);
  const before = [...inventoryTarget(f.target)].map(([file, item]) => [file, item.sha256]);
  const original = fs.writeFileSync;
  let attempts = 0;
  t.mock.method(fs, 'writeFileSync', (file, ...args) => {
    if (typeof file === 'number' && ++attempts === 2) throw new Error('injected pruning write error');
    return original(file, ...args);
  });
  assert.throws(() => finalizeInstantiation(f.preparation, plan.planDigest, fixtureEvidence(plan)), error => error.recovery.unresolved.length === 0);
  assert.deepEqual([...inventoryTarget(f.target)].map(([file, item]) => [file, item.sha256]), before);
});
