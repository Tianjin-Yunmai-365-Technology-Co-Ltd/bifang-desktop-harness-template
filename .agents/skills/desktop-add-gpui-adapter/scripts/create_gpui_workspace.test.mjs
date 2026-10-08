/** GPUI 生成器回归覆盖裁剪、身份、依赖与零覆盖安全边界。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGpuiWorkspace, renderGpuiFiles } from './create_gpui_workspace.mjs';

const identity = { projectId: 'example_tool', nameZh: '示例工具', nameEn: 'Example Tool', owner: 'Example Owner' };

/** 真实临时根先规范化，避免 macOS /tmp 本身为链接影响目标路径测试。 */
function temporary() { return fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'harness-gpui-test-')); }

/** GPUI 依赖唯一归根，core 不出现任何框架或宿主引用。 */
test('workspace_has_direct_core_dependency_and_central_native_dependencies', () => {
  const files = renderGpuiFiles(identity);
  const root = files.get('Cargo.toml');
  assert.match(root, /gui-framework = "gpui"/);
  assert.match(root, /gpui-kit = "0\.7\.1"/);
  assert.match(root, /rust-i18n = "4\.2\.0"/);
  assert.match(root, /sys-locale = "0\.3\.2"/);
  const gui = files.get('example_tool_gui/Cargo.toml');
  assert.match(gui, /example_tool_core\.workspace = true/);
  assert.doesNotMatch(gui, /version\s*=|tokio|tauri|serde/);
  assert.doesNotMatch(files.get('example_tool_core/Cargo.toml'), /dependencies|gpui|tokio/);
  assert.match(files.get('example_tool_gui/src/app/mod.rs'), /example_tool_core::product_definition\(\)/);
});

/** 关闭支持页时没有源码、词典键、导航或支付媒体残留。 */
test('disabled_support_pages_remove_all_runtime_references_and_media', () => {
  const files = renderGpuiFiles({ ...identity, aboutPage: 'disabled', sponsorPage: 'disabled', sidebarMode: 'compact' });
  assert.equal(files.has('example_tool_gui/src/app/about.rs'), false);
  assert.equal(files.has('example_tool_gui/src/app/sponsor.rs'), false);
  for (const file of files.keys()) assert.doesNotMatch(file, /assets\/sponsor|media-manifest|src\/app\/(about|sponsor)/);
  const app = files.get('example_tool_gui/src/app/mod.rs');
  assert.doesNotMatch(app, /Page::About|Page::Sponsor|mod about|mod sponsor|sidebar-toggle|show_release_notes|show_update_status/);
  const words = JSON.parse(files.get('example_tool_gui/locales/en-US.json'));
  assert.equal(words.about, undefined);
  assert.equal(words.sponsor, undefined);
  assert.equal(words.navigation.about, undefined);
  assert.equal(words.navigation.sponsor, undefined);
  assert.equal(words.sidebar, undefined);
});

/** 选择赞助页后每个实际媒体都嵌入程序，并具备可追溯摘要。 */
test('enabled_sponsor_embeds_complete_managed_local_media', () => {
  const files = renderGpuiFiles(identity);
  const assets = files.get('example_tool_gui/src/assets.rs');
  const manifest = JSON.parse(files.get('example_tool_gui/assets/sponsor-media-manifest.json'));
  assert.equal(manifest.assetCount, 12);
  assert.equal(manifest.bundlePolicy.paymentAutomationAuthorized, false);
  for (const asset of manifest.assets) {
    assert.equal(files.get(`example_tool_gui/assets/${asset.bundlePath}`).length, asset.sizeBytes);
    assert.ok(assets.includes(`include_bytes!("../assets/${asset.bundlePath}")`));
  }
  const sponsor = files.get('example_tool_gui/src/app/sponsor.rs');
  assert.match(sponsor, /sponsor_tier\("sponsor\.tier1_name", 19/);
  assert.match(sponsor, /sponsor_tier\("sponsor\.tier2_name", 199/);
  assert.match(sponsor, /sponsor_tier\("sponsor\.tier3_name", 1999/);
  assert.match(sponsor, /viewport_size\(\)\.width >= px\(1100\.\)/);
});

/** 未成熟的六项能力不能通过参数偷偷启用。 */
test('unavailable_native_capabilities_fail_closed_before_any_write', () => {
  for (const key of ['systemTray', 'systemNotification', 'autostart', 'singleInstance', 'deepLink', 'globalShortcut']) {
    assert.throws(() => renderGpuiFiles({ ...identity, [key]: 'enabled' }), new RegExp(`${key} is unavailable`));
  }
});

/** 所有框架运行时文件分别使用用户确认的中英文名称。 */
test('bilingual_identity_is_required_and_escaped_in_rust_source', () => {
  assert.throws(() => renderGpuiFiles({ ...identity, nameEn: '' }), /nameEn/);
  assert.throws(() => renderGpuiFiles({ ...identity, nameZh: 'bad\nname' }), /nameZh/);
  assert.throws(() => renderGpuiFiles({ ...identity, projectId: '../escape' }), /projectId/);
  const files = renderGpuiFiles({ ...identity, nameEn: 'Example "Quoted" Tool' });
  assert.equal(JSON.parse(files.get('example_tool_gui/locales/zh-CN.json')).application.name, identity.nameZh);
  assert.equal(JSON.parse(files.get('example_tool_gui/locales/en-US.json')).application.name, 'Example "Quoted" Tool');
  assert.match(files.get('example_tool_gui/src/app/mod.rs'), /Example \\"Quoted\\" Tool/);
});

/** 创建工作区不建立 Git、远端、产品规格或伪造确认状态。 */
test('fresh_workspace_is_created_without_git_or_policy_side_effects', () => {
  const root = temporary();
  try {
    const target = path.join(root, 'generated');
    const result = createGpuiWorkspace({ ...identity, target });
    assert.equal(result.guiFramework, 'gpui');
    assert.equal(fs.existsSync(path.join(target, 'example_tool_gui/src/main.rs')), true);
    assert.equal(fs.existsSync(path.join(target, '.git')), false);
    assert.equal(fs.existsSync(path.join(target, 'docs/AGENT_POLICY.md')), false);
    assert.equal(fs.existsSync(path.join(target, 'docs/product_spec')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

/** 目标中的现有内容保持原字节，不产生半个工程。 */
test('existing_target_contents_are_never_overwritten', () => {
  const root = temporary();
  try {
    const target = path.join(root, 'existing');
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, 'keep.txt'), 'user-content');
    assert.throws(() => createGpuiWorkspace({ ...identity, target }), /absent or empty/);
    assert.deepEqual(fs.readdirSync(target), ['keep.txt']);
    assert.equal(fs.readFileSync(path.join(target, 'keep.txt'), 'utf8'), 'user-content');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

/** 链接目录及其子路径都不能逃逸空目标约束。 */
test('symlink_target_and_ancestor_are_rejected', () => {
  const root = temporary();
  try {
    const real = path.join(root, 'real');
    fs.mkdirSync(real);
    const link = path.join(root, 'link');
    fs.symlinkSync(real, link, process.platform === 'win32' ? 'junction' : 'dir');
    for (const target of [link, path.join(link, 'child')]) assert.throws(() => createGpuiWorkspace({ ...identity, target }), /symbolic links/);
    assert.deepEqual(fs.readdirSync(real), []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

/** 错误输入在 staging 和目标创建前失败。 */
test('invalid_generation_leaves_empty_target_empty', () => {
  const root = temporary();
  try {
    const target = path.join(root, 'target');
    fs.mkdirSync(target);
    assert.throws(() => createGpuiWorkspace({ ...identity, target, sidebarMode: 'unknown' }), /sidebarMode/);
    assert.deepEqual(fs.readdirSync(target), []);
    assert.deepEqual(fs.readdirSync(root), ['target']);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

/** 身份中的模板形状文本只作为字符串保留，非法代理字符直接失败。 */
test('identity_is_never_recursively_interpolated_and_requires_unicode_scalars', () => {
  const files = renderGpuiFiles({ ...identity, nameEn: '@@ABOUT_TITLE@@' });
  assert.ok(files.get('example_tool_gui/src/main.rs').includes('title: Some("@@ABOUT_TITLE@@".into())'));
  assert.throws(() => renderGpuiFiles({ ...identity, nameEn: '\ud800' }), /nameEn/);
});
