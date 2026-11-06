/** 固定快照、显式确认和独占写入回归，不触达真实下游或安装环境。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { planInstantiation, prepareInstantiation } from './instantiate_project.mjs';
import { removeUpstreamOnly, renderPreparedFiles, snapshotSource } from './instantiation_files.mjs';
import { confirmedFixtureInput, fixture, SOURCE_ROOT } from './instantiation_test_support.mjs';

/** 未确认、旧摘要和非法日期都不能创建目标。 */
test('unconfirmed_stale_or_invalid_input_is_zero_write', t => {
  const f = fixture(t);
  const original = structuredClone(f.input);
  for (const change of [input => delete input.form.confirmation, input => input.form.confirmation.digest = '0'.repeat(64), input => input.confirmedAt = '2026-02-30', input => input.form.answers.owner.value = 'Changed Owner']) {
    const input = structuredClone(original); change(input);
    assert.throws(() => planInstantiation(input));
    assert.equal(fs.existsSync(f.target), false);
  }
});

/** 计划和准备使用同一清单；只重置身份与策略，法律正文和 vendor 字节保留。 */
test('prepare_installs_fixed_identity_and_preserves_legal_and_vendor_bytes', t => {
  const f = fixture(t);
  const first = planInstantiation(f.input);
  assert.deepEqual(planInstantiation(f.input), first);
  assert.equal(fs.existsSync(f.target), false);
  const prepared = prepareInstantiation(f.input, first.planDigest);
  assert.equal(prepared.initializationComplete, false);
  assert.equal(prepared.status, 'engineering-copy-prepared');
  assert.equal(fs.existsSync(path.join(f.target, '.git')), false);
  for (const item of ['Version.md', 'release-notes.json', '.harness/release-context.json', 'docs/adr', 'docs/project_status', 'docs/verification', 'docs/work_plan', 'docs/product_spec', 'scripts/validate_harness.mjs']) assert.equal(fs.existsSync(path.join(f.target, item)), false, item);
  const policy = fs.readFileSync(path.join(f.target, 'docs/AGENT_POLICY.md'), 'utf8');
  assert.match(policy, /schema_version: 5\n/u);
  assert.match(policy, /confirmed_at: 2026-11-06/u);
  assert.match(policy, /task_worktrees: disabled/u);
  const zh = fs.readFileSync(path.join(SOURCE_ROOT, 'LICENSE.zh-CN.md'), 'utf8');
  const en = fs.readFileSync(path.join(SOURCE_ROOT, 'LICENSE.en.md'), 'utf8');
  assert.equal(fs.readFileSync(path.join(f.target, 'LICENSE.zh-CN.md'), 'utf8'), zh.replace('毕方桌面应用Harness模版', '回归工具'));
  assert.equal(fs.readFileSync(path.join(f.target, 'LICENSE.en.md'), 'utf8'), en.replace('Bifang Desktop Harness Template', 'Regression Tool'));
  for (const item of prepared.files.filter(file => file.path.includes('/assets/vendor/'))) assert.deepEqual(fs.readFileSync(path.join(f.target, item.path)), fs.readFileSync(path.join(SOURCE_ROOT, item.path)));
  const agents = fs.readFileSync(path.join(f.target, 'AGENTS.md'), 'utf8');
  assert.ok(agents.trimEnd().split('\n').length <= 120);
  assert.doesNotMatch(agents, /check_no_python/u);
  assert.equal(prepared.files.some(item => item.path.includes('check_no_python')), false);
});

/** 对确认后出现的隐藏文件或目标链接保持原物，不接受旧计划摘要。 */
test('target_collision_and_symlink_do_not_overwrite_existing_data', t => {
  const f = fixture(t);
  const plan = planInstantiation(f.input);
  fs.mkdirSync(f.target);
  fs.writeFileSync(path.join(f.target, '.user'), 'keep');
  assert.throws(() => prepareInstantiation(f.input, plan.planDigest));
  assert.equal(fs.readFileSync(path.join(f.target, '.user'), 'utf8'), 'keep');
  fs.rmSync(f.target, { recursive: true });
  try { fs.symlinkSync(f.parent, f.target, 'dir'); } catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return t.skip(`宿主不支持目录符号链接：${error.code}`); throw error; }
  assert.throws(() => prepareInstantiation(f.input, plan.planDigest));
  assert.equal(fs.lstatSync(f.target).isSymbolicLink(), true);
});

/** 在源内创建目标仍只使用写入前固定索引，不把目标或父 Git 复制进目标。 */
test('nested_target_and_source_drift_are_bound_without_parent_git_mutation', t => {
  const f = fixture(t);
  const source = path.join(f.parent, 'source'); fs.mkdirSync(source);
  for (const [relative, item] of snapshotSource(SOURCE_ROOT).files) { fs.mkdirSync(path.dirname(path.join(source, relative)), { recursive: true }); fs.writeFileSync(path.join(source, relative), item.bytes, { mode: item.mode }); }
  execFileSync('git', ['init', '--initial-branch=main', source], { stdio: 'pipe' });
  execFileSync('git', ['-C', source, 'add', '.']);
  const index = fs.readFileSync(path.join(source, '.git/index'));
  const nested = path.join(source, 'regression_tool');
  const input = confirmedFixtureInput(nested, null, source);
  const first = planInstantiation(input);
  fs.appendFileSync(path.join(source, 'DESIGN.md'), '\n源变化\n');
  assert.throws(() => prepareInstantiation(input, first.planDigest), /摘要/u);
  assert.equal(fs.existsSync(nested), false);
  const second = planInstantiation(input);
  const prepared = prepareInstantiation(input, second.planDigest);
  assert.equal(prepared.files.some(file => file.path.startsWith('regression_tool/')), false);
  assert.deepEqual(fs.readFileSync(path.join(source, '.git/index')), index);
  assert.equal(fs.existsSync(path.join(nested, '.git')), false);
});

/** 写入失败清理自有项，目标保持可重试；并发用户改动则保留并报告恢复路径。 */
test('copy_failure_rolls_back_owned_files_and_preserves_concurrent_edits', t => {
  const f = fixture(t);
  const plan = planInstantiation(f.input);
  const original = fs.openSync;
  let count = 0;
  const mocked = t.mock.method(fs, 'openSync', (file, flags, ...rest) => {
    if (String(file).startsWith(f.target) && typeof flags === 'number' && flags & fs.constants.O_CREAT && ++count === 3) { const error = new Error('injected write failure'); error.code = 'EACCES'; throw error; }
    return original(file, flags, ...rest);
  });
  assert.throws(() => prepareInstantiation(f.input, plan.planDigest), error => error.recovery.retainedPaths.length === 0);
  mocked.mock.restore();
  assert.equal(fs.existsSync(f.target), false);
  assert.equal(prepareInstantiation(f.input, plan.planDigest).status, 'engineering-copy-prepared');
  const second = fixture(t); const next = planInstantiation(second.input); let installed;
  const mockedAgain = t.mock.method(fs, 'openSync', (file, flags, ...rest) => {
    if (String(file).startsWith(second.target) && typeof flags === 'number' && flags & fs.constants.O_CREAT) {
      if (installed) { fs.writeFileSync(installed, 'user edit'); throw new Error('injected after user edit'); }
      installed = String(file);
    }
    return original(file, flags, ...rest);
  });
  assert.throws(() => prepareInstantiation(second.input, next.planDigest), error => error.recovery.retainedPaths.includes(installed));
  mockedAgain.mock.restore();
  assert.equal(fs.readFileSync(installed, 'utf8'), 'user edit');
});

/** 上游专属子句移除后，同一长段中的通用 Node 和本地依赖规则必须保留。 */
test('upstream_clause_removal_keeps_general_dependency_rules', () => {
  const source = 'Node.js 是所有接口组合的受管工程运行时。仅 Harness 上游源树禁止 Python 源码、解释器。新增上游自动化运行 check_no_python.mjs --root .。下游按自身需求选择语言并显式声明项目依赖。';
  const actual = removeUpstreamOnly(source);
  assert.match(actual, /Node.js 是所有接口组合/u);
  assert.match(actual, /显式声明项目依赖/u);
  assert.doesNotMatch(actual, /上游源树|check_no_python/u);
});

/** 用户只改变自有新文件权限时也必须保留，不能把同字节当作无漂移删除。 */
test('copy_rollback_preserves_permission_drift', t => {
  if (process.platform === 'win32') return t.skip('Windows 不提供 POSIX 文件模式语义');
  const f = fixture(t); const plan = planInstantiation(f.input);
  const original = fs.openSync;
  let installed;
  const mocked = t.mock.method(fs, 'openSync', (file, flags, ...rest) => {
    if (String(file).startsWith(f.target) && typeof flags === 'number' && flags & fs.constants.O_CREAT) {
      if (installed) { fs.chmodSync(installed, 0o600); throw new Error('injected after permission drift'); }
      installed = String(file);
    }
    return original(file, flags, ...rest);
  });
  assert.throws(() => prepareInstantiation(f.input, plan.planDigest), error => error.recovery.retainedPaths.includes(installed));
  mocked.mock.restore();
  assert.equal(fs.statSync(installed).mode & 0o777, 0o600);
});

/** 最后一次写入之后修改早先文件或加入隐藏项，都必须失败并保留用户字节。 */
test('final_tree_verification_rejects_late_edits_and_unknown_hidden_entries', t => {
  for (const lateEdit of [true, false]) {
    const f = fixture(t); const plan = planInstantiation(f.input);
    const original = fs.writeFileSync;
    const changed = path.join(f.target, lateEdit ? plan.files[0].path : '.user-hidden');
    let count = 0;
    const mock = t.mock.method(fs, 'writeFileSync', (file, ...args) => {
      const result = original(file, ...args);
      if (typeof file === 'number' && ++count === plan.files.length) original(changed, 'late user bytes');
      return result;
    });
    assert.throws(() => prepareInstantiation(f.input, plan.planDigest), error => error.recovery.retainedPaths.includes(changed));
    mock.mock.restore();
    assert.equal(fs.readFileSync(changed, 'utf8'), 'late user bytes');
  }
});

/** 新标识或展示名可含示例词元，渲染结果与许可证保持同一确认值。 */
test('confirmed_identity_is_not_rewritten_by_later_replacement_pairs', () => {
  const snapshot = snapshotSource(SOURCE_ROOT);
  snapshot.files.set('docs/identity-fixture.txt', { bytes: Buffer.from('Bifang Desktop Harness Template agent_first_harness_template example_tool'), mode: 0o644 });
  const values = { name_zh: '回归工具', name_en: 'example_tool Studio', project_id: 'example_tool_plus', owner: 'Fixture Owner', target_platforms: ['macos'], interfaces: ['cli'], post_release_action: 'local_package' };
  const rendered = renderPreparedFiles(snapshot, values, 'user:fixture', '2026-11-06');
  assert.equal(rendered.get('docs/identity-fixture.txt').bytes.toString(), 'example_tool Studio example_tool_plus example_tool_plus');
  assert.match(rendered.get('LICENSE.en.md').bytes.toString(), /Applicable Project Name: example_tool Studio\./u);
  assert.ok(rendered.has('.agents/skills/desktop-initialize-rust-project/assets/rust-lib-cli/example_tool_plus_core/Cargo.toml'));
  const rules = rendered.get('docs/ENGINEERING_RULES.md').bytes.toString();
  assert.doesNotMatch(rules, /check_no_python|仅 Harness 上游源树禁止/u);
  assert.match(rules, /Node.js 是所有接口组合的受管工程运行时/u);
  assert.match(rules, /新增第三方运行时依赖须说明必要性/u);
});
