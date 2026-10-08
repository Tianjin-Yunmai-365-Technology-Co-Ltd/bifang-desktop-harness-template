/** 已有下游的 add-only 入口不得具有派生新项目或覆盖核心的能力。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { addGpuiAdapter } from './add_gpui_adapter.mjs';
import { renderGpuiAdapterFiles } from './gpui_adapter_files.mjs';

const identity = { projectId: 'existing_tool', nameZh: '既有工具', nameEn: 'Existing Tool', owner: 'Confirmed Owner', sponsorPage: 'disabled' };

/** 独立最小 fixture 只含既有核心与明确 root metadata，不依赖 init-only 入口。 */
function fixture() {
  const target = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'harness-gpui-add-test-'));
  fs.mkdirSync(path.join(target, 'existing_tool_core/src'), { recursive: true });
  fs.writeFileSync(path.join(target, 'existing_tool_core/Cargo.toml'), '[package]\nname = "existing_tool_core"\nversion = "0.1.0"\nedition = "2024"\n');
  fs.writeFileSync(path.join(target, 'existing_tool_core/src/lib.rs'), '//! 原有业务核心必须保留。\npub const USER_OWNED: u32 = 42;\n');
  fs.writeFileSync(path.join(target, 'Cargo.toml'), '[workspace]\nmembers = ["existing_tool_core"]\nresolver = "3"\n\n[workspace.package]\nversion = "0.1.0"\nedition = "2024"\nrust-version = "1.98.1"\n\n[workspace.dependencies]\nexisting_tool_core = { path = "existing_tool_core" }\n\n[workspace.metadata.agent-first-harness]\nproject-id = "existing_tool"\ninterfaces = ["cli"]\ntarget-platforms = ["macos"]\n');
  return target;
}

/** 保留在终端下游的纯 renderer 不包含创建 core 或新 workspace 的文件。 */
test('retained_renderer_only_produces_gui_and_profile_files', () => {
  const files = renderGpuiAdapterFiles(identity);
  for (const file of files.keys()) assert.ok(file.startsWith('existing_tool_gui/') || file === 'docs/GUI_APP_PROFILE.md');
  assert.equal(files.has('Cargo.toml'), false);
  assert.equal(files.has('existing_tool_core/src/lib.rs'), false);
  assert.equal(files.has('.gitignore'), false);
  assert.match(files.get('existing_tool_gui/src/app/mod.rs'), /use existing_tool_core as _;/);
  assert.doesNotMatch(files.get('existing_tool_gui/src/app/mod.rs'), /existing_tool_core::product_definition/);
});

/** 安全合并唯一 Cargo 根后，已有核心和任意用户文件字节保持原样。 */
test('add_only_preserves_existing_core_and_merges_native_gui', () => {
  const target = fixture();
  try {
    const corePath = path.join(target, 'existing_tool_core/src/lib.rs');
    const bytes = fs.readFileSync(corePath);
    fs.writeFileSync(path.join(target, 'user-notes.txt'), 'keep me');
    const result = addGpuiAdapter({ ...identity, target });
    assert.equal(result.corePreserved, true);
    assert.deepEqual(fs.readFileSync(corePath), bytes);
    assert.equal(fs.readFileSync(path.join(target, 'user-notes.txt'), 'utf8'), 'keep me');
    const cargo = fs.readFileSync(path.join(target, 'Cargo.toml'), 'utf8');
    assert.match(cargo, /members = \["existing_tool_core","existing_tool_gui"\]/);
    assert.match(cargo, /interfaces = \["cli","gui"\]/);
    assert.match(cargo, /gui-framework = "gpui"/);
    assert.match(cargo, /gpui-kit = "0\.7\.1"/);
    assert.equal(fs.existsSync(path.join(target, '.git')), false);
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});

/** 不接受空目录作为新下游，避免终端下游继续派生项目。 */
test('add_only_refuses_an_empty_target', () => {
  const target = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'harness-gpui-empty-test-'));
  try {
    assert.throws(() => addGpuiAdapter({ ...identity, target }), /ENOENT/);
    assert.deepEqual(fs.readdirSync(target), []);
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});

/** 已有 GUI 不被第二次调用或框架转换覆盖。 */
test('existing_gui_is_preserved_on_repeat', () => {
  const target = fixture();
  try {
    addGpuiAdapter({ ...identity, target });
    const cargo = fs.readFileSync(path.join(target, 'Cargo.toml'));
    const app = fs.readFileSync(path.join(target, 'existing_tool_gui/src/app/mod.rs'));
    assert.throws(() => addGpuiAdapter({ ...identity, target }), /existing GUI/);
    assert.deepEqual(fs.readFileSync(path.join(target, 'Cargo.toml')), cargo);
    assert.deepEqual(fs.readFileSync(path.join(target, 'existing_tool_gui/src/app/mod.rs')), app);
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});

/** 不支持的清单语法或冲突字段必须在任何工程写入前失败。 */
test('conflicting_dependency_fails_without_partial_adapter', () => {
  const target = fixture();
  try {
    const file = path.join(target, 'Cargo.toml');
    const source = fs.readFileSync(file, 'utf8').replace('[workspace.dependencies]', '[workspace.dependencies]\ngpui-kit = "0.8.0"');
    fs.writeFileSync(file, source);
    assert.throws(() => addGpuiAdapter({ ...identity, target }), /conflicting workspace dependency gpui-kit/);
    assert.equal(fs.readFileSync(file, 'utf8'), source);
    assert.equal(fs.existsSync(path.join(target, 'existing_tool_gui')), false);
    assert.equal(fs.readdirSync(target).some(name => name.startsWith('.gpui-')), false);
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});

/** 子路径中的符号链接不能用来读取别处 core 或写入别处资源。 */
test('add_only_rejects_symlink_core_manifest', () => {
  const target = fixture();
  try {
    const file = path.join(target, 'existing_tool_core/Cargo.toml');
    const source = path.join(target, 'core-original.toml');
    fs.renameSync(file, source);
    fs.symlinkSync(source, file, 'file');
    assert.throws(() => addGpuiAdapter({ ...identity, target }), /symbolic links/);
    assert.equal(fs.existsSync(path.join(target, 'existing_tool_gui')), false);
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});

/** 既有Harness metadata不强制project-id字段，核心包与member仍精确绑定身份。 */
test('existing_standard_metadata_without_project_id_is_supported', () => {
  const target = fixture();
  try {
    const file = path.join(target, 'Cargo.toml');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('project-id = "existing_tool"\n', ''));
    const result = addGpuiAdapter({ ...identity, target });
    assert.equal(result.corePreserved, true);
    assert.equal(fs.existsSync(path.join(target, 'existing_tool_gui/src/main.rs')), true);
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});
