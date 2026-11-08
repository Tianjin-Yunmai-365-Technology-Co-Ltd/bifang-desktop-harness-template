import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { NSH_REVISION, NSH_TUI_PREVIEW_REVISION, normalizeNshOptions, nshDependencies, nshPackageScripts, nshRevisionForTargets, renderNshAdapterFiles } from './nsh_adapter_files.mjs';
import { requirePreviewToolchain, runNshTui, tuiCliArgs, tuiDevCommands } from './run_nsh_tui.mjs';

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
    assert.doesNotMatch(nshDependencies(options), new RegExp(NSH_TUI_PREVIEW_REVISION, 'u'));
    const files = renderNshAdapterFiles(options);
    assert.ok(![...files.keys()].some(name => name.includes('.tui.')));
    const scripts = nshPackageScripts(options.projectId, options.nshTargets, options.targetPlatforms);
    assert.equal(scripts['nsh:check'], 'nsh check sample_tool_nsh');
    assert.equal(scripts['nsh:test'], 'nsh test sample_tool_nsh');
    assert.equal(scripts['dev:tui'], undefined);
    assert.equal(scripts['nsh:test:tui'], undefined);
  }
});

/** 所有生成与旧入口都显式拒绝 TUI，不回退预览提交。 */
test('every generation and direct TUI entry rejects the preview target', () => {
  const terminal = { ...base, targetPlatforms: ['macos'], nshTargets: ['tui'] };
  const combined = { ...terminal, nshTargets: ['desktop', 'tui'], profile };
  for (const options of [terminal, combined]) {
    assert.throws(() => normalizeNshOptions(options), /TUI is temporarily unavailable/u);
    assert.throws(() => renderNshAdapterFiles(options), /TUI is temporarily unavailable/u);
    assert.throws(() => nshDependencies(options), /TUI is temporarily unavailable/u);
    assert.throws(() => nshRevisionForTargets(options.nshTargets), /TUI is temporarily unavailable/u);
    assert.throws(() => nshPackageScripts(options.projectId, options.nshTargets, options.targetPlatforms), /TUI is temporarily unavailable/u);
  }
  assert.throws(() => tuiDevCommands('/nonexistent', {}), /TUI is temporarily unavailable/u);
  assert.throws(() => requirePreviewToolchain('/nonexistent', {}, 'nsh 0.4.0 (beeb9fc)'), /TUI is temporarily unavailable/u);
  assert.throws(() => tuiCliArgs('run', path.resolve('app')), /TUI is temporarily unavailable/u);
  assert.throws(() => runNshTui('/nonexistent'), /TUI is temporarily unavailable/u);
});

/** 旧包装器在读取项目或调用全局 CLI 前返回不可用。 */
test('the retained TUI wrapper fails before inspecting a workspace or invoking a CLI', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nsh-disabled-tui-'));
  try {
    const wrapper = fileURLToPath(new URL('./run_nsh_tui.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [wrapper, '--root', root, '--test'], { cwd: root, encoding: 'utf8', timeout: 30_000 });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /TUI is temporarily unavailable/u);
    assert.deepEqual(fs.readdirSync(root), []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
