import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ROOT } from './core.mjs';
import { validateGuiWindowTitleContract, validateTauriWindowTitle } from './gui_title.mjs';
import { renderGpuiAdapterFiles } from '../../.agents/skills/desktop-add-gpui-adapter/scripts/gpui_adapter_files.mjs';

const brand = path.join(ROOT, '.agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support');

/** 只复制 formatter 的真实输入模块，保持测试独立且不触碰共享工作树。 */
function withTauri(mutate, check) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tauri-title-mutation-'));
  try {
    fs.mkdirSync(path.join(root, 'react'));
    for (const file of ['brand-support-profile.json', 'react/brandSupportProfile.ts', 'react/displayVersion.ts']) fs.copyFileSync(path.join(brand, file), path.join(root, file));
    const file = path.join(root, 'react/brandSupportProfile.ts');
    const original = fs.readFileSync(file, 'utf8');
    const changed = mutate(original);
    assert.notEqual(changed, original, 'mutation must change production code');
    fs.writeFileSync(file, changed);
    const errors = [];
    validateTauriWindowTitle(errors, root);
    check(errors);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

/** 两种框架的当前真实模板和规则必须同时满足统一公式。 */
test('current_tauri_and_gpui_window_titles_pass_the_full_contract', () => {
  const errors = [];
  validateTauriWindowTitle(errors, brand);
  validateGuiWindowTitleContract(errors);
  assert.deepEqual(errors, []);
});

/** 曾经漏检的缺字段与顺序错误现在必须由实际输出拦住。 */
test('tauri_gate_rejects_missing_fields_and_wrong_order_despite_retained_keywords', () => {
  const original = 'return `${normalizedName} ${normalizedVersion} ${contact.channel}:${contact.value}`;';
  for (const replacement of [
    'return `${normalizedVersion} ${contact.channel}:${contact.value}`;',
    'return `${normalizedName} ${contact.channel}:${contact.value}`;',
    'return `${normalizedName} ${normalizedVersion}`;',
    'return `${contact.channel}:${contact.value} ${normalizedVersion} ${normalizedName}`;',
    'return `${normalizedVersion} ${normalizedName} ${contact.channel}:${contact.value}`;',
    'return `${normalizedName} v${normalizedVersion} ${contact.channel}:${contact.value}`;',
  ]) withTauri(source => source.replace(original, replacement) + `\n// ${original}\n`, errors => assert.match(errors.join('\n'), /Tauri window title contract failed/));
});

/** 权威输入必须被真实消费，不能硬编码一次构建结果或放行缺失输入。 */
test('tauri_gate_rejects_stale_names_versions_and_missing_input_validation', () => {
  for (const [from, to] of [
    ['const normalizedName = applicationName.trim();', 'const normalizedName = "Example Utility";'],
    ['formatDisplayVersion(version)', 'formatDisplayVersion("3.4.5")'],
    ['formatDisplayVersion(version)', 'formatDisplayVersion(version) ? "v3.4.5" : ""'],
    ['if (!normalizedName || !normalizedVersion)', 'if (false)'],
    ['${contact.channel}:${contact.value}', 'QQ:0000000'],
  ]) withTauri(source => source.replace(from, to), errors => assert.ok(errors.length, `${from} must fail`));
});

/** 上游硬门禁必须消费 GPUI 的实际生成结果，不能只检查标题规则文字。 */
test('harness_gate_rejects_a_generated_gpui_title_with_missing_qq', () => {
  const errors = [];
  validateGuiWindowTitleContract(errors, { render: input => {
    const files = renderGpuiAdapterFiles(input);
    const file = 'title_probe_gui/src/window_title.rs';
    files.set(file, files.get(file).replace(' QQ:2222980', ''));
    return files;
  } });
  assert.match(errors.join('\n'), /GPUI title must be/);
});

/** 旧的可选联系人或缺少 v 的身份公式不能重新进入规范。 */
test('harness_gate_rejects_conflicting_title_rules', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gui-title-rule-'));
  try {
    for (const relative of ['docs/design_standards/gpui_gui.md', '.agents/skills/desktop-prepare-gui-app-identity/SKILL.md']) {
      const target = path.join(root, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, fs.readFileSync(path.join(ROOT, relative), 'utf8').replace('{applicationName} v{version} QQ:2222980', '{applicationName} {version}'));
    }
    const errors = [];
    validateGuiWindowTitleContract(errors, { sourceRoot: root });
    assert.equal(errors.filter(error => error.includes('GUI title rule must require')).length, 2);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
