import assert from 'node:assert/strict';
import test from 'node:test';
import { renderNshAdapterFiles } from './nsh_adapter_files.mjs';

const base = {
  projectId: 'sample_tool', nameZh: '示例工具', nameEn: 'Sample Tool', owner: 'Fixture Owner',
};
const desktopProfile = {
  system_tray: 'disabled', system_notification: 'disabled', autostart: 'disabled',
  about_page: 'disabled', sponsor_page: 'disabled', single_instance: 'disabled',
  deep_link: 'disabled', global_shortcut: 'disabled', sidebar_mode: 'detailed',
};

test('mobile Mixed app keeps content outside system bars and follows its own theme', () => {
  const files = renderNshAdapterFiles({ ...base, targetPlatforms: ['android', 'ios'], nshTargets: ['mobile'] });
  const app = files.get('sample_tool_nsh/App.tsx');
  const config = JSON.parse(files.get('sample_tool_nsh/nsh.json'));
  assert.match(app, /import \{[^\n]*safeArea[^\n]*\} from "nsh";/u);
  assert.match(app, /nativeMobile \? safeArea\(\)\.top : 0/u);
  assert.match(app, /nativeMobile \? safeArea\(\)\.bottom : 0/u);
  assert.match(app, /nativeMobile \? safeArea\(\)\.right : 0/u);
  assert.match(app, /nativeMobile \? safeArea\(\)\.left : 0/u);
  assert.equal((app.match(/page\(\) === "settings" &&/gu) ?? []).length, 1);
  assert.match(app, /<SettingsSection title=\{tr\(language\(\), "language"\)\}/u);
  assert.match(app, /<SettingsSection title=\{tr\(language\(\), "appearance"\)\}/u);
  assert.match(app, /<SettingsChoices[\s\S]*?groupLabel=\{tr\(language\(\), "language"\)\}/u);
  assert.doesNotMatch(app, /<Action label="中文"|<Action label=\{tr\(language\(\), "system"\)\}/u);
  assert.deepEqual(config.statusBar, { foreground: 'auto' });
  assert.deepEqual(config.capabilities, { statusBar: true });
});

test('combined targets retain desktop host while mobile receives status-bar permission', () => {
  const mixed = renderNshAdapterFiles({
    ...base, targetPlatforms: ['macos', 'android', 'ios'], nshTargets: ['desktop', 'mobile'],
    profile: desktopProfile,
  });
  const mixedConfig = JSON.parse(mixed.get('sample_tool_nsh/nsh.json'));
  assert.deepEqual(mixedConfig.statusBar, { foreground: 'auto' });
  assert.equal(mixedConfig.capabilities.statusBar, true);
  assert.ok(mixedConfig.capabilities.host.includes('window.list'));

  const web = renderNshAdapterFiles({ ...base, targetPlatforms: ['web'], nshTargets: ['web'] });
  const webConfig = JSON.parse(web.get('sample_tool_nsh/nsh.json'));
  assert.equal(webConfig.statusBar, undefined);
  assert.equal(webConfig.capabilities, undefined);
});
