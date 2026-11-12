import assert from 'node:assert/strict';
import test from 'node:test';
import { NSH_REVISION, normalizeNshOptions, nshDependencies, nshPackageScripts, nshRevisionForTargets, renderNshAdapterFiles } from './nsh_adapter_files.mjs';

const profile = Object.freeze({
  system_tray: 'disabled', system_notification: 'disabled', autostart: 'disabled',
  about_page: 'disabled', sponsor_page: 'disabled', single_instance: 'disabled',
  deep_link: 'disabled', global_shortcut: 'disabled', sidebar_mode: 'detailed',
});
const base = { projectId: 'sample_tool', nameZh: '示例工具', nameEn: 'Sample Tool', owner: 'test-owner' };

/** 正式目标始终固定同一运行时，且脚本不暴露终端入口。 */
test('supported NSH targets use only the released v0.4.0 runtime and scripts', () => {
  const desktop = { ...base, targetPlatforms: ['macos'], nshTargets: ['desktop'], profile };
  const mobileWeb = { ...base, targetPlatforms: ['android', 'web'], nshTargets: ['mobile', 'web'] };
  assert.equal(NSH_REVISION, 'e626a8dd8f8d8b277b9507cfd5ac74d0e67020f3');
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
  const terminal = { ...base, targetPlatforms: ['macos'], nshTargets: ['tui'] };
  const combined = { ...terminal, nshTargets: ['desktop', 'tui'], profile };
  for (const options of [terminal, combined]) {
    assert.throws(() => normalizeNshOptions(options), /invalid NSH targets/u);
    assert.throws(() => renderNshAdapterFiles(options), /invalid NSH targets/u);
    assert.throws(() => nshDependencies(options), /invalid NSH targets/u);
    assert.throws(() => nshRevisionForTargets(options.nshTargets), /invalid NSH targets/u);
    assert.throws(() => nshPackageScripts(options.projectId, options.nshTargets, options.targetPlatforms), /invalid NSH targets/u);
  }
});
