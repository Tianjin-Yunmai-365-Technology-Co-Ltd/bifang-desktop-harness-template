import fs from 'node:fs';
import path from 'node:path';
import { ROOT, fail, run } from './core.mjs';
import { renderGpuiAdapterFiles } from '../../.agents/skills/desktop-add-gpui-adapter/scripts/gpui_adapter_files.mjs';
import { validateGpuiTitleSources } from '../../.agents/skills/desktop-add-gpui-adapter/scripts/gpui_title_contract.mjs';

// 在有超时的独立进程中执行实际 TS 模块；只链接本地版本函数和受管 JSON。
const TAURI_PROBE = `
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
const root = process.argv[1];
const context = vm.createContext({});
const moduleAt = file => new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(file, 'utf8')), { context, identifier: file });
const formatter = moduleAt(path.join(root, 'react/brandSupportProfile.ts'));
const version = moduleAt(path.join(root, 'react/displayVersion.ts'));
const profile = JSON.parse(fs.readFileSync(path.join(root, 'brand-support-profile.json'), 'utf8'));
const data = new vm.SyntheticModule(['default'], function () { this.setExport('default', profile); }, { context });
await formatter.link(specifier => {
  if (specifier === '../brand-support-profile.json') return data;
  if (specifier === './displayVersion') return version;
  throw new Error('unexpected title dependency: ' + specifier);
});
await formatter.evaluate();
const format = formatter.namespace.formatBrandWindowTitle;
const inputs = [['Example Utility','3.4.5'], ['示例工具','3.4.5'], [' Example Utility ',' vv3.4.5 '], ['Example Utility','Vv3.4.5'], ['Other Utility','7.8.9']];
const output = inputs.map(args => format(...args));
const rejected = [[' ','3.4.5'], ['Example Utility',''], ['Example Utility','vV']].map(args => { try { format(...args); return false; } catch { return true; } });
process.stdout.write(JSON.stringify({ output, rejected }));
`;

/** 行为门禁比较真实 formatter 输出，不把未执行的测试源码当作标题正确证据。 */
export function validateTauriWindowTitle(errors, brandRoot) {
  const result = run(process.execPath, ['--experimental-vm-modules', '--no-warnings', '--input-type=module', '-e', TAURI_PROBE, brandRoot], { timeout: 10_000 });
  try {
    if (result.error || result.status !== 0) throw new Error(result.stderr || result.error?.message || 'formatter probe failed');
    const actual = JSON.parse(result.stdout);
    const expected = ['Example Utility v3.4.5 QQ:2222980', '示例工具 v3.4.5 QQ:2222980', 'Example Utility v3.4.5 QQ:2222980', 'Example Utility v3.4.5 QQ:2222980', 'Other Utility v7.8.9 QQ:2222980'];
    if (JSON.stringify(actual.output) !== JSON.stringify(expected) || JSON.stringify(actual.rejected) !== '[true,true,true]') throw new Error('expected application name, vVersion, QQ:2222980 in that order; empty name/version must be rejected');
  } catch (error) { fail(errors, `Tauri window title contract failed: ${error.message.trim()}`); }
}

/** 上游同时检查两种侧栏/支持页组合的真实 GPUI 生成结果与唯一标题规范。 */
export function validateGuiWindowTitleContract(errors, { sourceRoot = ROOT, render = renderGpuiAdapterFiles } = {}) {
  for (const [relative, formula] of [
    ['docs/design_standards/gpui_gui.md', '{applicationName} v{version} QQ:2222980'],
    ['.agents/skills/desktop-prepare-gui-app-identity/SKILL.md', '{applicationName} v{version} QQ:2222980'],
  ]) {
    try {
      const source = fs.readFileSync(path.join(sourceRoot, relative), 'utf8');
      if (!source.includes(formula) || source.includes('联系人只有经确认后才加入')) fail(errors, `GUI title rule must require ${formula}: ${relative}`);
    } catch (error) { fail(errors, `GUI title rule cannot be read: ${error.message}`); }
  }
  for (const sidebarMode of ['compact', 'detailed']) {
    try {
      const files = render({ projectId: 'title_probe', nameZh: '标题验证', nameEn: 'Title Probe', owner: 'Owner', sidebarMode, aboutPage: 'disabled', sponsorPage: 'disabled' });
      const titleErrors = validateGpuiTitleSources({ title: files.get('title_probe_gui/src/window_title.rs'), main: files.get('title_probe_gui/src/main.rs'), shell: files.get('title_probe_gui/src/app/mod.rs') });
      for (const error of titleErrors) fail(errors, error);
    } catch (error) { fail(errors, `GPUI window title generation failed: ${error.message}`); }
  }
}
