/** 源工程回归只在独立临时目录安装工程文件，不创建真实产品或访问用户项目。 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateInitializationForm } from './initialization_form.mjs';
import { planInstantiation, prepareInstantiation } from './instantiate_project.mjs';
import { GUI_FIELDS } from './initialization_questions.mjs';
import { initialize } from '../../desktop-manage-version/scripts/version_gate.mjs';
import { nshDependencies } from '../../desktop-add-nsh-adapter/scripts/nsh_adapter_files.mjs';

export const SOURCE_ROOT = fs.realpathSync(fileURLToPath(new URL('../../../../', import.meta.url)));

/** 明确标注为测试输入的确认用于验证协议本身，绝不作为真实用户创建授权。 */
export function confirmedFixtureInput(target, framework = null, sourceRoot = SOURCE_ROOT) {
  const nsh = framework?.startsWith('nsh') ?? false;
  const desktop = framework !== 'nsh-mobile-web' && framework !== 'nsh-tui';
  const fields = { name_zh: '回归工具', name_en: 'Regression Tool', project_id: 'regression_tool', project_path: target, owner: 'Fixture Owner', interfaces: nsh ? ['nsh'] : framework ? ['gui'] : ['cli'] };
  if (framework) Object.assign(fields, { ...(nsh ? { nsh_targets: framework === 'nsh-mobile-web' ? ['mobile', 'web'] : framework === 'nsh-tui' ? ['tui'] : framework === 'nsh-desktop-tui' ? ['desktop', 'tui'] : ['desktop'] } : { gui_framework: framework }), ...(desktop ? Object.fromEntries(GUI_FIELDS.map(key => [key, key === 'sidebar_mode' ? 'detailed' : 'disabled'])) : {}) });
  const form = { schemaVersion: 1, entry: 'instantiate', harnessRoot: sourceRoot, answers: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, { value, source: 'user:测试夹具确认，非真实项目授权' }])) };
  const evaluation = evaluateInitializationForm(form);
  if (evaluation.stage !== 'review') throw new Error(`测试表单未完整：${evaluation.stage}`);
  form.confirmation = { digest: evaluation.summaryDigest, source: 'user:测试夹具中的明确确认' };
  return { schemaVersion: 1, form, confirmedAt: '2026-11-06' };
}

/** 每项回归都有独立目标和自动回收边界，失败保留逻辑只作用夹具目录。 */
export function fixture(t, framework = null) {
  const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'harness-instantiation-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const target = path.join(parent, 'regression_tool');
  return { parent, target, input: confirmedFixtureInput(target, framework) };
}

/** 完成被测 prepare 阶段，仅取得文件安装结果，不声明产品初始化成功。 */
export function prepareFixture(t, framework = null) {
  const f = fixture(t, framework);
  const plan = planInstantiation(f.input);
  return { ...f, preparation: prepareInstantiation(f.input, plan.planDigest) };
}

/** 在夹具中写已存在的中性 core/adapter 清单，真实版本初始化器提供受保护状态。 */
export function writeNeutralWorkspace(f) {
  const values = f.preparation.values;
  const id = values.project_id;
  const members = [`${id}_core`, ...values.interfaces.map(kind => `${id}_${kind}`)];
  const write = (relative, bytes) => { fs.mkdirSync(path.dirname(path.join(f.target, relative)), { recursive: true }); fs.writeFileSync(path.join(f.target, relative), bytes, { flag: 'wx' }); };
  const tuiDependencies = values.nsh_targets?.includes('tui') ? nshDependencies({ projectId: id, nameZh: values.name_zh, nameEn: values.name_en, owner: values.owner, targetPlatforms: values.target_platforms, nshTargets: values.nsh_targets, ...(values.nsh_targets.includes('desktop') ? { profile: Object.fromEntries(GUI_FIELDS.map(key => [key, values[key]])) } : {}) }) + '\n' : '';
  write('Cargo.toml', `[workspace]\nmembers = ${JSON.stringify(members)}\nresolver = "3"\n[workspace.package]\nversion = "0.1.0"\nedition = "2024"\n[workspace.dependencies]\n${id}_core = { path = "${id}_core" }\n${tuiDependencies}[workspace.metadata.agent-first-harness]\nproject-id = "${id}"\ninterfaces = ${JSON.stringify(values.interfaces)}\ntarget-platforms = ${JSON.stringify(values.target_platforms)}\n${values.gui_framework ? `gui-framework = "${values.gui_framework}"\n` : ''}${values.nsh_targets ? `nsh-targets = ${JSON.stringify(values.nsh_targets)}\n` : ''}`);
  for (const member of members) {
    write(`${member}/Cargo.toml`, `[package]\nname = "${member}"\nversion.workspace = true\nedition.workspace = true\n${member.endsWith('_core') ? '' : `[dependencies]\n${id}_core.workspace = true\n`}`);
    write(`${member}/src/${member.endsWith('_core') ? 'lib' : 'main'}.rs`, member.endsWith('_core') ? '//! 中性核心夹具。\n/// 返回中性状态。\npub fn status() -> bool { false }\n' : '/// 测试夹具的适配器入口。\nfn main() {}\n');
  }
  if (values.gui_framework || values.nsh_targets?.includes('desktop')) write('docs/GUI_APP_PROFILE.md', `# GUI App Profile\n\n\`\`\`gui-initialization-config\n${GUI_FIELDS.map(key => `${key}: ${values[key]}`).join('\n')}\n\`\`\`\n`);
  initialize(f.target);
}
