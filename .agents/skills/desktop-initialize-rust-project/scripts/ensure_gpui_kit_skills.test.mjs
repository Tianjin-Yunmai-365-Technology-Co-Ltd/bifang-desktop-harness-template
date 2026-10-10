/** 用隔离项目验证官方 GPUI Kit 双 Skill 的离线安装、条件选择和冲突保护。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { ensureGpuiKitSkills, loadGpuiKitSkillsSnapshot, SKILL_NAMES, SNAPSHOT_ROOT, UPSTREAM_COMMIT } from './ensure_gpui_kit_skills.mjs';

/** 创建独立 Cargo 夹具，所有安装路径只落在当前测试的临时目录。 */
function fixture(t, metadata = 'interfaces = ["gui"]\ngui-framework = "gpui"') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gpui-kit-skills-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'Cargo.toml'), `[workspace]\nmembers = []\n\n[workspace.metadata.agent-first-harness]\n${metadata}\n`);
  return fs.realpathSync(root);
}

/** 按名称定位当前夹具内的 Skill，不使用用户全局技能目录。 */
function installedPath(root, name = 'gpui-kit') {
  return path.join(root, '.agents', 'skills', name);
}

/** 完整来源必须含两套入口和全部参考，不依赖安装时网络。 */
test('fixed_snapshot_contains_two_complete_official_skills_and_license', () => {
  const skills = loadGpuiKitSkillsSnapshot();
  assert.deepEqual([...skills.keys()], SKILL_NAMES);
  assert.equal(skills.get('gpui-kit').size, 30);
  assert.equal(skills.get('gpui-kit-design-guides').size, 5);
  for (const [name, files] of skills) {
    assert.match(files.get('LICENSE-APACHE').toString(), /Apache License/u);
    const source = JSON.parse(files.get('source.json'));
    assert.equal(source.commit, UPSTREAM_COMMIT);
    assert.equal(source.upstreamPath, `skills/${name}`);
    assert.equal(source.upstreamModified, false);
    assert.match(files.get('HARNESS-INTEGRATION.md').toString(), /bootstrap\.rs/u);
  }
});

/** 新 GPUI 下游逐文件安装原样文档、来源和许可，两个 Skill 均可独立读取。 */
test('gpui_project_installs_both_skills_with_exact_upstream_bytes', t => {
  const root = fixture(t);
  const result = ensureGpuiKitSkills(root);
  assert.equal(result.status, 'installed');
  assert.equal(result.commit, UPSTREAM_COMMIT);
  for (const item of result.skills) {
    assert.equal(item.status, 'installed');
    assert.equal(item.path, installedPath(root, item.name));
    const original = fs.readFileSync(path.join(SNAPSHOT_ROOT, item.name, 'SKILL.md'));
    assert.deepEqual(fs.readFileSync(path.join(item.path, 'SKILL.md')), original);
    assert.equal(JSON.parse(fs.readFileSync(path.join(item.path, 'source.json'))).license, 'Apache-2.0');
    assert.ok(fs.statSync(path.join(item.path, 'references')).isDirectory());
  }
  assert.ok(fs.existsSync(path.join(installedPath(root), 'references/gpui/test-reference.md')));
  assert.ok(fs.existsSync(path.join(installedPath(root, 'gpui-kit-design-guides'), 'references/design-guides.md')));
  assert.deepEqual(fs.readdirSync(path.join(root, '.agents/skills')).sort(), [...SKILL_NAMES].sort());
});

/** Tauri、兼容旧 GUI 和非 GUI 在快照缺失时也零安装，不引入其它接口的 Skill。 */
test('other_frameworks_and_non_gui_projects_skip_without_touching_skills', t => {
  for (const metadata of ['interfaces = ["cli"]', 'interfaces = ["gui"]', 'interfaces = ["gui"]\ngui-framework = "tauri"']) {
    const root = fixture(t, metadata);
    assert.equal(ensureGpuiKitSkills(root, { snapshotRoot: path.join(root, 'absent') }).status, 'skipped');
    assert.equal(fs.existsSync(path.join(root, '.agents')), false);
  }
});

/** 精确重复调用复用两套文件，不重写时间戳或本地来源记录。 */
test('identical_local_skills_are_reused_without_rewriting', t => {
  const root = fixture(t);
  ensureGpuiKitSkills(root);
  const skill = path.join(installedPath(root), 'SKILL.md');
  fs.utimesSync(skill, new Date('2020-01-01T00:00:00Z'), new Date('2020-01-01T00:00:00Z'));
  const before = fs.statSync(skill).mtimeMs;
  const result = ensureGpuiKitSkills(root);
  assert.equal(result.status, 'reused');
  assert.ok(result.skills.every(item => item.status === 'reused'));
  assert.equal(fs.statSync(skill).mtimeMs, before);
});

/** 已有一个原样 Skill 时只补齐另一个，不重写原目录。 */
test('one_identical_skill_is_reused_while_missing_partner_is_installed', t => {
  const root = fixture(t);
  ensureGpuiKitSkills(root);
  fs.rmSync(installedPath(root, 'gpui-kit-design-guides'), { recursive: true });
  const result = ensureGpuiKitSkills(root);
  assert.deepEqual(result.skills.map(item => item.status), ['reused', 'installed']);
});

/** 任意本地冲突在共同预检阶段失败，保留用户内容且不安装缺失伙伴。 */
test('conflicting_local_skill_prevents_any_partner_install_or_overwrite', t => {
  const root = fixture(t);
  const local = installedPath(root);
  fs.mkdirSync(local, { recursive: true });
  fs.writeFileSync(path.join(local, 'SKILL.md'), '用户维护的本地 GPUI Skill\n');
  assert.throws(() => ensureGpuiKitSkills(root), /冲突/u);
  assert.equal(fs.readFileSync(path.join(local, 'SKILL.md'), 'utf8'), '用户维护的本地 GPUI Skill\n');
  assert.equal(fs.existsSync(installedPath(root, 'gpui-kit-design-guides')), false);
  assert.deepEqual(fs.readdirSync(path.join(root, '.agents/skills')), ['gpui-kit']);
});

/** 已安装参考或来源漂移不能只凭 SKILL.md 存在当作复用成功。 */
test('modified_reference_missing_license_and_extra_files_are_conflicts', t => {
  for (const mutation of [
    root => fs.appendFileSync(path.join(installedPath(root), 'references/usage.md'), '\n本地修改\n'),
    root => fs.rmSync(path.join(installedPath(root), 'LICENSE-APACHE')),
    root => fs.writeFileSync(path.join(installedPath(root), 'local.md'), '本地补充\n'),
  ]) {
    const root = fixture(t);
    ensureGpuiKitSkills(root);
    mutation(root);
    assert.throws(() => ensureGpuiKitSkills(root), /冲突/u);
  }
});

/** 预先存在的空目录可用于安装，不把普通空目录误判为用户内容冲突。 */
test('empty_local_skill_directories_are_filled', t => {
  const root = fixture(t);
  for (const name of SKILL_NAMES) fs.mkdirSync(installedPath(root, name), { recursive: true });
  assert.equal(ensureGpuiKitSkills(root).status, 'installed');
});

/** 官方快照的字节或来源清单漂移，在任何目标目录建立之前被拒绝。 */
test('tampered_snapshot_fails_before_project_writes', t => {
  for (const relative of ['gpui-kit/SKILL.md', 'source.json', 'LICENSE-APACHE']) {
    const root = fixture(t);
    const snapshot = path.join(root, 'snapshot');
    fs.cpSync(SNAPSHOT_ROOT, snapshot, { recursive: true });
    fs.appendFileSync(path.join(snapshot, relative), '\nchanged\n');
    assert.throws(() => ensureGpuiKitSkills(root, { snapshotRoot: snapshot }), /摘要不一致/u);
    assert.equal(fs.existsSync(path.join(root, '.agents')), false);
  }
});

/** 快照额外文件不受来源清单声明，必须拒绝而非隐式传播。 */
test('unlisted_snapshot_files_are_rejected', t => {
  const root = fixture(t);
  const snapshot = path.join(root, 'snapshot');
  fs.cpSync(SNAPSHOT_ROOT, snapshot, { recursive: true });
  fs.writeFileSync(path.join(snapshot, 'gpui-kit', 'unexpected.md'), 'not in source manifest');
  assert.throws(() => ensureGpuiKitSkills(root, { snapshotRoot: snapshot }), /文件集/u);
  assert.equal(fs.existsSync(path.join(root, '.agents')), false);
});

/** 项目内部目录和快照引用上的链接均拒绝，不向链接目的地安装。 */
test('symlinked_skill_directories_and_snapshot_files_are_rejected', t => {
  const root = fixture(t);
  const elsewhere = path.join(root, 'elsewhere');
  fs.mkdirSync(elsewhere);
  fs.symlinkSync(elsewhere, path.join(root, '.agents'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => ensureGpuiKitSkills(root), /非符号链接/u);
  assert.deepEqual(fs.readdirSync(elsewhere), []);
  fs.unlinkSync(path.join(root, '.agents'));
  const snapshot = path.join(root, 'snapshot');
  fs.cpSync(SNAPSHOT_ROOT, snapshot, { recursive: true });
  const reference = path.join(snapshot, 'gpui-kit/references/usage.md');
  fs.rmSync(reference);
  fs.symlinkSync(path.join(SNAPSHOT_ROOT, 'gpui-kit/references/usage.md'), reference);
  assert.throws(() => ensureGpuiKitSkills(root, { snapshotRoot: snapshot }), /链接/u);
  assert.equal(fs.existsSync(path.join(root, '.agents')), false);
});

/** Cargo 框架事实必须唯一合法；非 GUI 标注 GPUI 或重复声明不能绕过选择边界。 */
test('invalid_or_duplicate_cargo_selections_fail_without_installing', t => {
  for (const metadata of [
    'interfaces = ["cli"]\ngui-framework = "gpui"',
    'interfaces = ["gui"]\ngui-framework = "other"',
    'interfaces = ["gui"]\ngui-framework = "gpui"\ngui-framework = "gpui"',
    'interfaces = ["gui"]\ninterfaces = ["gui"]\ngui-framework = "gpui"',
    'interfaces = []\ngui-framework = "gpui"',
  ]) {
    const root = fixture(t, metadata);
    assert.throws(() => ensureGpuiKitSkills(root), /Cargo|非 GUI/u);
    assert.equal(fs.existsSync(path.join(root, '.agents')), false);
  }
});

/** 注释、单引号和多行接口列表仍消费实际选择，而非从外部参数推断框架。 */
test('literal_quotes_multiline_interfaces_and_comments_preserve_gpui_selection', t => {
  const root = fixture(t, "interfaces = [\n  'CLI', # retained interface\n  'GUI',\n]\ngui-framework = 'gpui' # actual framework\n");
  assert.equal(ensureGpuiKitSkills(root).status, 'installed');
});

/** Harness 源根被拒绝，不能把源内 vendor 伪装成下游已安装。 */
test('harness_source_root_is_never_an_install_target', t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'Version.md'), '# Harness version\n');
  const sourceSkill = path.join(root, '.agents/skills/desktop-instantiate-project');
  fs.mkdirSync(sourceSkill, { recursive: true });
  fs.writeFileSync(path.join(sourceSkill, 'SKILL.md'), '# source only\n');
  assert.throws(() => ensureGpuiKitSkills(root), /Harness 源根/u);
  assert.equal(fs.existsSync(installedPath(root)), false);
});

/** 命令行显式目标输出真实安装事实，拒绝未知或全局选项。 */
test('cli_reports_installation_and_rejects_global_options', t => {
  const root = fixture(t);
  const script = fileURLToPath(new URL('./ensure_gpui_kit_skills.mjs', import.meta.url));
  const run = spawnSync(process.execPath, [script, '--project-root', root], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).status, 'installed');
  const rejected = spawnSync(process.execPath, [script, '--global'], { encoding: 'utf8' });
  assert.equal(rejected.status, 1);
  assert.equal(JSON.parse(rejected.stdout).status, 'error');
});
