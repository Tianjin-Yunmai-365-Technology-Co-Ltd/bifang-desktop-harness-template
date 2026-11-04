import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { installArchify } from './install_archify.mjs';

/** 创建隔离包夹具，验证安装对真实文件的复制、冲突保护和幂等行为。 */
function fixture(t) {
  const temporary = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'archify-install-test-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'project');
  const source = path.join(temporary, 'source');
  fs.mkdirSync(root);
  fs.mkdirSync(source);
  for (const directory of ['bin', 'references', 'schemas', 'renderers', 'assets']) {
    fs.mkdirSync(path.join(source, directory));
    fs.writeFileSync(path.join(source, directory, 'retained.txt'), directory);
  }
  fs.writeFileSync(path.join(source, 'SKILL.md'), '---\nname: archify\ndescription: fixture\n---\n');
  fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify({ name: 'archify', version: '3.2.0' }));
  fs.writeFileSync(path.join(source, 'bin/archify.mjs'), '// fixture runtime\n');
  fs.writeFileSync(path.join(source, 'LICENSE'), 'fixture license');
  for (const relative of [
    'references/repository-authoring.md', 'references/authoring-defaults.md',
    'references/delivery-contract.md', 'schemas/architecture.schema.json',
    'schemas/common.schema.json', 'examples/web-app.architecture.json',
    'assets/template.html', 'renderers/architecture/render-architecture.mjs',
  ]) {
    fs.mkdirSync(path.dirname(path.join(source, relative)), { recursive: true });
    fs.writeFileSync(path.join(source, relative), 'fixture resource');
  }
  return { root, source };
}

// 完整复制实际文件，并证明重复调用不会用上游变化覆盖项目安装。
test('installs_complete_package_and_reuses_without_overwriting', t => {
  const { root, source } = fixture(t);
  const installed = installArchify(root, { source });
  assert.equal(installed.status, 'installed');
  assert.equal(installed.version, '3.2.0');
  assert.equal(fs.readFileSync(path.join(installed.path, 'LICENSE'), 'utf8'), 'fixture license');
  assert.equal(fs.readFileSync(path.join(installed.path, 'renderers/retained.txt'), 'utf8'), 'renderers');
  fs.writeFileSync(path.join(source, 'LICENSE'), 'new license');
  assert.equal(installArchify(root, { source }).status, 'reused');
  assert.equal(fs.readFileSync(path.join(installed.path, 'LICENSE'), 'utf8'), 'fixture license');
});

// 模拟缺失与损坏源，失败不创建安装目标或改变已有项目文件。
test('missing_or_incomplete_source_leaves_project_untouched', t => {
  const { root, source } = fixture(t);
  assert.throws(() => installArchify(root, { searchRoots: [] }), { code: 'archify-source-missing' });
  fs.rmSync(path.join(source, 'bin/archify.mjs'));
  assert.throws(() => installArchify(root, { source }), { code: 'archify-incomplete-package' });
  assert.deepEqual(fs.readdirSync(root), []);
});

// 已有损坏包是冲突而非缺失，不能自动换成另一个源。
test('existing_incomplete_package_is_preserved', t => {
  const { root, source } = fixture(t);
  const existing = path.join(root, '.agents/skills/archify');
  fs.mkdirSync(existing, { recursive: true });
  fs.writeFileSync(path.join(existing, 'user.txt'), 'preserve');
  assert.throws(() => installArchify(root, { source }), { code: 'archify-incomplete-package' });
  assert.equal(fs.readFileSync(path.join(existing, 'user.txt'), 'utf8'), 'preserve');
  assert.deepEqual(fs.readdirSync(existing), ['user.txt']);
});

// 缺少工作流引用或无法加载的 CLI 不会发布成占用目标的成功安装。
test('rejects_missing_resources_and_unloadable_runtime', t => {
  const { root, source } = fixture(t);
  const reference = path.join(source, 'references/repository-authoring.md');
  fs.rmSync(reference);
  assert.throws(() => installArchify(root, { source }), { code: 'archify-incomplete-package' });
  assert.deepEqual(fs.readdirSync(root), []);
  fs.writeFileSync(reference, 'fixture reference');
  fs.writeFileSync(path.join(source, 'bin/archify.mjs'), "import './missing-runtime.mjs';\n");
  assert.throws(() => installArchify(root, { source }), { code: 'archify-runtime-failed' });
  const parent = path.join(root, '.harness/skills');
  assert.deepEqual(fs.readdirSync(parent), []);
});

// 自动发现只使用传入的隔离搜索范围，随后返回真实可执行文件路径。
test('discovers_source_and_prefers_existing_project_package', t => {
  const { root, source } = fixture(t);
  const result = installArchify(root, { searchRoots: [path.join(root, 'missing'), source] });
  assert.equal(result.source, source);
  assert.ok(fs.statSync(path.join(result.path, 'bin/archify.mjs')).isFile());
  assert.equal(installArchify(root, { searchRoots: [] }).path, result.path);
});

// 防止源内链接及目标父目录链接把安装内容写入其他位置。
test('rejects_source_and_destination_symlinks', t => {
  const { root, source } = fixture(t);
  try {
    fs.symlinkSync(path.join(source, 'LICENSE'), path.join(source, 'linked.txt'));
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOSYS', 'ENOTSUP'].includes(error.code)) throw error;
    t.skip(`宿主无法创建符号链接：${error.code}`);
    return;
  }
  assert.ok(fs.lstatSync(path.join(source, 'linked.txt')).isSymbolicLink());
  assert.throws(() => installArchify(root, { source }), { code: 'archify-unsafe-path' });
  fs.unlinkSync(path.join(source, 'linked.txt'));
  fs.symlinkSync(source, path.join(root, '.agents'), 'dir');
  assert.throws(() => installArchify(root, { source }), { code: 'archify-unsafe-path' });
  assert.ok(!fs.existsSync(path.join(source, 'skills')));
});
