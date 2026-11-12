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

test('mobile Mixed app uses safe-area bottom tabs and follows its own theme', () => {
  const files = renderNshAdapterFiles({ ...base, targetPlatforms: ['android', 'ios'], nshTargets: ['mobile'] });
  const app = files.get('sample_tool_nsh/App.tsx');
  const appTest = files.get('sample_tool_nsh/App.platform.test.tsx');
  const tokens = files.get('sample_tool_nsh/tokens.ts');
  const config = JSON.parse(files.get('sample_tool_nsh/nsh.json'));
  assert.match(app, /import \{[^\n]*safeArea[^\n]*\} from "nsh";/u);
  assert.match(app, /nativeMobile \? safeArea\(\)\.top : 0/u);
  assert.match(app, /flexDirection: nativeMobile \|\| narrow\(\) \? "column" : "row"/u);
  assert.match(app, /if \(nativeMobile \|\| narrow\(\)\) return "100%"/u);
  assert.match(app, /\{!nativeMobile && \(desktopRail\(\) \? <>/u);
  assert.match(app, /<Scroll style=\{\{ flex: 1, minHeight: 0 \}\}/u);
  assert.match(app, /<\/Scroll>\s*\{nativeMobile && <View testID="mobile-bottom-nav"/u);
  assert.match(app, /paddingBottom: tokens\.optionGap \+ safeArea\(\)\.bottom/u);
  assert.match(app, /<MobileTabAction label=\{tr\(language\(\), "home"\)\} selected=\{page\(\) === "home"\} onPress=\{\(\) => page\.set\("home"\)\} \/>/u);
  assert.match(app, /<MobileTabAction label=\{tr\(language\(\), "settings"\)\} selected=\{page\(\) === "settings"\} onPress=\{\(\) => page\.set\("settings"\)\} \/>/u);
  assert.match(app, /minHeight: tokens\.mobileTabHeight/u);
  assert.match(app, /accessibilityLabel=\{props\.label\}/u);
  assert.match(app, /selected=\{props\.selected\}/u);
  assert.match(tokens, /mobileTabHeight: 48/u);
  assert.match(appTest, /for \(const mobilePlatform of \["ios", "android"\] as const\)/u);
  assert.match(appTest, /id:mobile-bottom-nav >> role:button\[Settings\]/u);
  assert.match(appTest, /id:mobile-bottom-nav >> role:button\[Home\]/u);
  assert.match(app, /nativeMobile \? safeArea\(\)\.right : 0/u);
  assert.match(app, /nativeMobile \? safeArea\(\)\.left : 0/u);
  assert.doesNotMatch(app, /paddingBottom: \(narrow\(\) \? tokens\.contentGap : tokens\.contentPadding\) \+ \(nativeMobile \? safeArea\(\)\.bottom : 0\)/u);
  assert.equal((app.match(/page\(\) === "settings" &&/gu) ?? []).length, 1);
  assert.match(app, /<SettingsSection title=\{tr\(language\(\), "language"\)\}/u);
  assert.match(app, /<SettingsSection title=\{tr\(language\(\), "appearance"\)\}/u);
  assert.match(app, /<SettingsChoices[\s\S]*?groupLabel=\{tr\(language\(\), "language"\)\}/u);
  assert.doesNotMatch(app, /<Action label="中文"|<Action label=\{tr\(language\(\), "system"\)\}/u);
  assert.deepEqual(config.statusBar, { foreground: 'auto' });
  assert.deepEqual(config.capabilities, { statusBar: true });
});

test('combined targets retain official desktop windows while mobile receives status-bar permission', () => {
  const mixed = renderNshAdapterFiles({
    ...base, targetPlatforms: ['macos', 'android', 'ios'], nshTargets: ['desktop', 'mobile'],
    profile: desktopProfile,
  });
  const mixedConfig = JSON.parse(mixed.get('sample_tool_nsh/nsh.json'));
  assert.deepEqual(mixedConfig.statusBar, { foreground: 'auto' });
  assert.equal(mixedConfig.capabilities.statusBar, true);
  assert.deepEqual(mixedConfig.capabilities.windows, { kinds: ['normal'], levels: ['normal'] });

  const web = renderNshAdapterFiles({ ...base, targetPlatforms: ['web'], nshTargets: ['web'] });
  const webConfig = JSON.parse(web.get('sample_tool_nsh/nsh.json'));
  assert.equal(webConfig.statusBar, undefined);
  assert.deepEqual(webConfig.capabilities, {});
  assert.doesNotMatch(web.get('sample_tool_nsh/App.test.tsx'), /mobile-bottom-nav|__MOBILE_TEST__/u);
});
