/** 原生能力回归验证32种选择的依赖、生命周期接线与禁用裁剪，不触达宿主登录项。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createGpuiWorkspace } from './create_gpui_workspace.mjs';
import { renderGpuiAdapterFiles } from './gpui_adapter_files.mjs';
import { capabilityKeys, nativeDependencies, trayPixels } from './gpui_native_capabilities.mjs';
import { parseGpuiInitializationProfile } from './gpui_profile.mjs';

const identity = { projectId: 'example_tool', nameZh: '示例工具', nameEn: 'Example Tool', owner: 'Example Owner' };

/** 每种选择都忠实进入九字段，已选能力生成而禁用能力完全裁掉。 */
test('all_32_native_combinations_preserve_profile_and_conditional_files', () => {
  const modules = { systemTray: 'native/tray.rs', systemNotification: 'notifications.rs', autostart: 'native/autostart.rs', singleInstance: 'native/instance.rs', globalShortcut: 'native/shortcuts.rs' };
  for (let mask = 0; mask < 32; mask++) {
    const options = { ...identity, sponsorPage: 'disabled', ...Object.fromEntries(capabilityKeys.map((key, index) => [key, mask & (1 << index) ? 'enabled' : 'disabled'])) };
    const files = renderGpuiAdapterFiles(options);
    const profile = parseGpuiInitializationProfile(files.get('docs/GUI_APP_PROFILE.md'));
    for (const key of capabilityKeys) {
      assert.equal(files.has(`example_tool_gui/src/${modules[key]}`), options[key] === 'enabled', `${mask}:${key}`);
      assert.equal(profile[key.replace(/[A-Z]/g, value => '_' + value.toLowerCase())], options[key]);
    }
    assert.equal(profile.deep_link, 'disabled');
    assert.equal(files.has('example_tool_gui/assets/tray.rgba'), options.systemTray === 'enabled');
    const words = JSON.parse(files.get('example_tool_gui/locales/en-US.json'));
    assert.equal(Object.hasOwn(words, 'tray'), options.systemTray === 'enabled');
    assert.equal(Object.hasOwn(words.settings, 'autostart'), options.autostart === 'enabled');
    assert.equal(Object.hasOwn(words.settings, 'system_notification'), options.systemNotification === 'enabled');
    const member = files.get('example_tool_gui/Cargo.toml');
    for (const [dependency] of nativeDependencies(options)) assert.ok(member.includes(`${dependency}.workspace = true`));
    for (const value of files.values()) if (typeof value === 'string') assert.doesNotMatch(value, /@@[A-Z_]+@@/);
  }
});

/** 全能力工作区在任意宿主都扫描所有 Rust 平台模块，实际保留门禁不得因 Windows 声明缺文档失败。 */
test('generated_native_workspace_passes_retained_rust_comment_check_on_all_hosts', () => {
  const temporary = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'harness-gpui-native-comments-'));
  try {
    const target = path.join(temporary, 'workspace');
    const generated = createGpuiWorkspace({
      ...identity, target, targetPlatforms: ['macos', 'windows'], sponsorPage: 'disabled',
      ...Object.fromEntries(capabilityKeys.map(key => [key, 'enabled'])),
    });
    const scripts = '.agents/skills/desktop-implement-change/scripts';
    const retained = path.join(target, scripts);
    fs.mkdirSync(retained, { recursive: true });
    for (const name of ['check_rust_chinese_comments.mjs', 'check_file_line_limits.mjs']) {
      fs.copyFileSync(fileURLToPath(new URL(`../../desktop-implement-change/scripts/${name}`, import.meta.url)), path.join(retained, name));
    }
    const result = spawnSync(process.execPath, [path.join(retained, 'check_rust_chinese_comments.mjs'), '--root', target, '--json'], {
      cwd: target, encoding: 'utf8', shell: false, timeout: 10_000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.checkedPackages, 2);
    assert.equal(report.checkedRustFiles, generated.files.filter(file => file.endsWith('.rs')).length);
    assert.ok(report.checkedDeclarations > 0);
    assert.deepEqual(report.violations, []);
    assert.deepEqual(report.errors, []);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

/** 本实现不冒充 Linux 托盘支持；快捷键 Linux 运行时仍需 X11，深链接仍拒绝。 */
test('unsupported_native_choices_fail_before_rendering', () => {
  assert.throws(() => renderGpuiAdapterFiles({ ...identity, targetPlatforms: ['linux'], systemTray: 'enabled' }), /macos\/windows only/);
  assert.throws(() => renderGpuiAdapterFiles({ ...identity, deepLink: 'enabled' }), /unavailable/);
  assert.throws(() => renderGpuiAdapterFiles({ ...identity, targetPlatforms: ['linux'], globalShortcut: 'enabled' }), /cannot verify registration/);
});

/** 损坏九字段或中性合同不得静默生成可继续初始化的事实。 */
test('profile_parser_rejects_missing_duplicate_out_of_order_and_non_neutral_contract', () => {
  const profile = renderGpuiAdapterFiles({ ...identity, sponsorPage: 'disabled', globalShortcut: 'enabled' }).get('docs/GUI_APP_PROFILE.md');
  assert.equal(parseGpuiInitializationProfile(profile.replaceAll('\n', '\r\n')).global_shortcut, 'enabled');
  for (const invalid of [
    profile.replace('autostart: disabled\n', ''),
    profile + profile,
    profile.replace('system_tray: disabled', 'system_tray: pending'),
    profile.replace('system_tray: disabled', 'autostart: disabled'),
    profile.replace('deep_link: disabled', 'deep_link: enabled'),
    profile.replace('"actions":[]', '"actions":[{"id":"unexpected"}]'),
    profile.replace('global_shortcut: enabled', 'global_shortcut: disabled'),
    profile.replace('```gui-global-shortcut-contract', '```missing-contract'),
  ]) assert.throws(() => parseGpuiInitializationProfile(invalid));
});

/** 中性托盘工程夹具是可见RGBA，不依赖运行时 PNG 包。 */
test('tray_fixture_has_exact_dimensions_and_visible_pixels', () => {
  const pixels = trayPixels();
  assert.equal(pixels.length, 32 * 32 * 4);
  assert.ok(pixels.some((byte, index) => index % 4 === 3 && byte > 0));
});
