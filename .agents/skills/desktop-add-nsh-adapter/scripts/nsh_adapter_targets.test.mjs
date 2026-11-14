import assert from 'node:assert/strict';
import test from 'node:test';
import { NSH_REVISION, normalizeNshOptions, nshDependencies, nshPackageScripts, nshRevisionForTargets, renderNshAdapterFiles } from './nsh_adapter_files.mjs';

const profile = Object.freeze({
  system_tray: 'disabled', system_notification: 'disabled', autostart: 'disabled',
  about_page: 'disabled', sponsor_page: 'disabled', single_instance: 'disabled',
  deep_link: 'disabled', global_shortcut: 'disabled', sidebar_mode: 'detailed',
});
const base = { projectId: 'sample_tool', nameZh: '示例工具', nameEn: 'Sample Tool', owner: 'test-owner' };

/** 未选择 TUI 的工程不暴露终端入口。 */
test('supported NSH targets use only the released v0.5.1 runtime and scripts', () => {
  const desktop = { ...base, targetPlatforms: ['macos'], nshTargets: ['desktop'], profile };
  const mobileWeb = { ...base, targetPlatforms: ['android', 'web'], nshTargets: ['mobile', 'web'] };
  assert.equal(NSH_REVISION, '224d9a795c7ac9d10d75750de9351adac5549675');
  for (const options of [desktop, mobileWeb]) {
    assert.equal(nshRevisionForTargets(options.nshTargets), NSH_REVISION);
    assert.match(nshDependencies(options), new RegExp(NSH_REVISION, 'u'));
    const files = renderNshAdapterFiles(options);
    assert.ok(![...files.keys()].some(name => name.includes('.tui.')));
    const scripts = nshPackageScripts(options.projectId, options.nshTargets, options.targetPlatforms);
    assert.equal(scripts['nsh:check'], 'nsh check sample_tool_nsh');
    assert.equal(scripts['nsh:test'], 'nsh test sample_tool_nsh');
    assert.equal(scripts['dev:tui'], undefined);
    assert.equal(scripts['nsh:test:tui'], undefined);
  }
});

/** 直接调用各生成入口也拒绝不受支持的目标。 */
test('generation_rejects_unsupported_nsh_targets', () => {
  const terminal = { ...base, targetPlatforms: ['macos'], nshTargets: ['unknown'] };
  const combined = { ...terminal, nshTargets: ['desktop', 'unknown'], profile };
  for (const options of [terminal, combined]) {
    assert.throws(() => normalizeNshOptions(options), /invalid NSH targets/u);
    assert.throws(() => renderNshAdapterFiles(options), /invalid NSH targets/u);
    assert.throws(() => nshDependencies(options), /invalid NSH targets/u);
    assert.throws(() => nshRevisionForTargets(options.nshTargets), /invalid NSH targets/u);
    assert.throws(() => nshPackageScripts(options.projectId, options.nshTargets, options.targetPlatforms), /invalid NSH targets/u);
  }
});

test('selected iOS runs and tests on ios while terminal tests select an explicit file', () => {
  const ios = nshPackageScripts('sample_tool', ['mobile'], ['ios']);
  assert.equal(ios.dev, 'nsh run sample_tool_nsh --target ios');
  assert.equal(ios['dev:android'], undefined);
  const mixed = nshPackageScripts('sample_tool', ['desktop','mobile','web','tui'], ['macos','ios','android','web']);
  assert.equal(mixed['dev:web'], 'nsh run sample_tool_nsh --target web');
  assert.equal(mixed['nsh:test:macos'], 'nsh test sample_tool_nsh/App.test.tsx --target macos');
  assert.equal(mixed['nsh:test:tui'], 'nsh test sample_tool_nsh/App.test.tsx --target tui');
});

test('renderer preserves literal dollar replacements and token-shaped names', () => {
  const options = {...base, nameZh:'工具 $& __PROJECT_ID__', nshTargets:['tui'], targetPlatforms:['macos']};
  const files = renderNshAdapterFiles(options);
  assert.equal(JSON.parse(files.get('sample_tool_nsh/nsh.json')).name, options.nameZh);
  assert.ok(files.get('sample_tool_nsh/App.tsx').includes(JSON.stringify(options.nameZh)));
});
