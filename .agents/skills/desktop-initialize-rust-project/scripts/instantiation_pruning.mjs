/** 根据已确认接口建立终端工程清单；只移除明确的一次性能力，不改业务源码。 */
import path from 'node:path';
import { inapplicableGuiCandidate, parseInterfaceSelection } from '../../desktop-upgrade-harness/scripts/harness_upgrade_interfaces.mjs';
import { parseAgentPolicyDocument, parseReleaseMetadataArray } from '../../desktop-switch-post-release-action/scripts/post_release_action.mjs';
import { GUI_FIELDS, POLICY_FIELDS } from '../../desktop-instantiate-project/scripts/initialization_questions.mjs';
import { removeUpstreamOnly, renderProjectAgents, sha256 } from '../../desktop-instantiate-project/scripts/instantiation_files.mjs';
import { validateNeutralWorkspace } from './initialization_workspace.mjs';

const INITIALIZATION_SKILLS = new Set(['desktop-instantiate-project', 'desktop-initialize-rust-project', 'desktop-test-gui-initialization-e2e', 'desktop-test-gpui-initialization-e2e', 'desktop-test-nsh-initialization-e2e', 'desktop-curate-harness-memory']);
const MEMORY_DIRECTORIES = ['docs/adr/', 'docs/changelog/', 'docs/product_spec/', 'docs/work_plan/', 'docs/project_status/', 'docs/verification/'];
const GPUI_WRAPPER_PATHS = ['.agents/skills/desktop-add-gpui-adapter/scripts/create_gpui_workspace.mjs', '.agents/skills/desktop-add-gpui-adapter/scripts/create_gpui_workspace.test.mjs', '.agents/skills/desktop-add-gpui-adapter/assets/core/'];

/** 新实例化只裁剪预定路径；未知文件与所有实际产品文件保持原样。 */
function excluded(relative, selection) {
  const skill = /^\.agents\/skills\/([^/]+)(?:\/|$)/u.exec(relative)?.[1];
  return INITIALIZATION_SKILLS.has(skill) || inapplicableGuiCandidate(relative, selection)
    || GPUI_WRAPPER_PATHS.some(item => relative === item || (item.endsWith('/') && relative.startsWith(item)))
    || relative.startsWith('scripts/harness_validation/') || ['scripts/validate_harness.mjs', 'scripts/run_harness_tests.mjs', 'docs/HARNESS_ENGINEERING.md', 'docs/VERIFICATION.md', 'Version.md'].includes(relative)
    || relative.startsWith('docs/harness_engineering/') || MEMORY_DIRECTORIES.some(prefix => relative.startsWith(prefix))
    || /(?:^|\/)check_no_python(?:\.test)?\.mjs$/u.test(relative);
}

/** 核对准备凭据与实际 Cargo、策略、profile 和许可证，防止裁剪另一身份或未完成选择的工程。 */
export function validatePreparation(preparation, current) {
  if (!preparation || preparation.schemaVersion !== 1 || preparation.status !== 'engineering-copy-prepared' || !Array.isArray(preparation.files)) throw new Error('缺少工程层准备清单');
  const values = preparation.values;
  if (!values || !Array.isArray(values.interfaces) || !Array.isArray(values.target_platforms)) throw new Error('准备清单缺少已确认接口/平台');
  const cargo = current.get('Cargo.toml')?.bytes.toString('utf8');
  if (!cargo) throw new Error('裁剪前必须完成实际 Cargo 工作区初始化');
  const selection = parseInterfaceSelection(cargo);
  if (JSON.stringify(selection.interfaces) !== JSON.stringify(values.interfaces) || selection.guiFramework !== (values.gui_framework ?? null)
      || JSON.stringify(selection.nshTargets ?? null) !== JSON.stringify(values.nsh_targets ?? null)) throw new Error('实际接口、框架或 NSH 目标与已确认准备清单不一致');
  if (JSON.stringify(parseReleaseMetadataArray(cargo, 'target-platforms')) !== JSON.stringify(values.target_platforms)) throw new Error('实际目标平台与已确认准备清单不一致');
  const policyBytes = current.get('docs/AGENT_POLICY.md')?.bytes;
  if (!policyBytes) throw new Error('缺少已确认策略');
  const policy = parseAgentPolicyDocument(policyBytes);
  for (const key of POLICY_FIELDS) if (policy.fields.get(key) !== values[key]) throw new Error(`已确认策略漂移：${key}`);
  if (policy.fields.get('post_release_action') !== 'pending') throw new Error('初始化期间发布后动作必须保持 pending');
  if (selection.guiFramework || selection.nshTargets?.includes('desktop')) {
    const source = current.get('docs/GUI_APP_PROFILE.md')?.bytes.toString('utf8') ?? '';
    const blocks = [...source.matchAll(/```gui-initialization-config\s*\n([\s\S]*?)```/gu)];
    if (blocks.length !== 1) throw new Error('GUI 初始化九字段必须恰好一个配置块');
    const lines = blocks[0][1].trim().split(/\r?\n/u);
    if (lines.length !== GUI_FIELDS.length || lines.some((line, index) => line !== `${GUI_FIELDS[index]}: ${values[GUI_FIELDS[index]]}`)) throw new Error('GUI profile 与已确认九字段不一致');
  }
  validateNeutralWorkspace(values, current);
  const seen = new Set();
  for (const entry of preparation.files) {
    if (!entry || typeof entry.path !== 'string' || seen.has(entry.path)) throw new Error('准备文件清单含非法或重复项');
    seen.add(entry.path);
    const file = current.get(entry.path);
    if (!file) throw new Error(`准备后的受管文件缺失，须先复核：${entry.path}`);
    if (file.sha256 !== entry.sha256 || file.mode !== entry.mode) {
      const sourceSkills = preparation.files.filter(item => /^\.agents\/skills\/[^/]+\/SKILL\.md$/u.test(item.path)).map(item => item.path.split('/')[2]);
      const allowedGpuiMap = entry.path === 'AGENTS.md' && selection.guiFramework === 'gpui' && file.mode === entry.mode
        && file.bytes.toString('utf8').split('\n').filter(line => !/^- \[\$gpui-kit(?:-design-guides)?\]\(\.agents\/skills\/gpui-kit(?:-design-guides)?\/SKILL\.md\)$/u.test(line)).join('\n') === renderProjectAgents(values, sourceSkills, true);
      if (!allowedGpuiMap) throw new Error(`准备后的受管文件漂移，须先复核：${entry.path}`);
    }
  }
  for (const license of ['LICENSE.zh-CN.md', 'LICENSE.en.md']) if (!seen.has(license)) throw new Error('准备清单必须包含两份原始许可证身份映射');
  return selection;
}

/** 删除已不存在目标的精确 Markdown 链接，保留说明文字；未知断链不会静默放行。 */
function rewriteLinks(text, relative, finalPaths, removedPaths) {
  return text.replace(/\[([^\]\n]*)\]\(([^)\n]+)\)/gu, (whole, label, raw) => {
    const target = raw.trim().replace(/^<|>$/gu, '').split('#')[0];
    if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/)/iu.test(target)) return whole;
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(relative), target));
    if (finalPaths.has(resolved) || [...finalPaths].some(file => file.startsWith(`${resolved.replace(/\/$/u, '')}/`))) return whole;
    const knownAbsent = removedPaths.has(resolved) || resolved === 'Version.md' || MEMORY_DIRECTORIES.some(prefix => resolved === prefix.slice(0, -1) || resolved.startsWith(prefix)) || resolved === 'docs/VERIFICATION.md';
    if (knownAbsent) return label;
    return whole;
  });
}

/** 已退役的路由改为普通背景说明，不能继续形成调用命令；机器 tombstone 数据不参与改写。 */
function neutralizeRoutes(text, removedSkills) {
  for (const name of removedSkills) {
    const replacement = INITIALIZATION_SKILLS.has(name) ? '一次性初始化步骤（基线前完成）' : '未选择的接口能力';
    text = text.replaceAll(`$${name}`, replacement);
    text = text.replaceAll(`.agents/skills/${name}/SKILL.md`, replacement);
    text = text.replaceAll(`.agents/skills/${name}/`, `${replacement}：`);
  }
  return text;
}

/** 仅剔除 Harness 源专用发布段落；下游版本、发布与候选合同保留。 */
function downstreamRelease(text) {
  text = text.replace(/\n## 当前状态\n[\s\S]*?(?=\n## 版本规则)/u, '\n');
  text = text.replace(/(## 版本规则\n)[\s\S]*?(?=下游产品使用)/u, '$1\n');
  text = text.replace(/\n## Harness 模板发布检查清单\n[\s\S]*?(?=\n## |$)/u, '\n');
  return text;
}

/** 对保留的 Markdown/YAML 处理失效的路由与链接，不扫描或改写第三方原文与代码中的保护清单。 */
export function renderPrunedFiles(preparation, current) {
  const selection = validatePreparation(preparation, current);
  const managedPaths = new Set(preparation.files.map(item => item.path));
  const removable = [...current.keys()].filter(relative => excluded(relative, selection));
  for (const relative of removable) if (!managedPaths.has(relative)) throw new Error(`待裁目录含未登记文件，保留并停止：${relative}`);
  const removedPaths = new Set(removable);
  const result = new Map([...current].filter(([relative]) => !removedPaths.has(relative)));
  const skills = [...result.keys()].filter(file => /^\.agents\/skills\/[^/]+\/SKILL\.md$/u.test(file)).map(file => file.split('/')[2]);
  const removedSkills = new Set([...current.keys()].filter(file => /^\.agents\/skills\/[^/]+\/SKILL\.md$/u.test(file) && removedPaths.has(file)).map(file => file.split('/')[2]));
  const finalPaths = new Set(result.keys());
  for (const [relative, file] of result) {
    if (!managedPaths.has(relative) || !/\.(?:md|yaml)$/u.test(relative) || relative.includes('/assets/vendor/') || /^\.agents\/skills\/(?:gpui-kit|gpui-kit-design-guides|design-taste-frontend)\//u.test(relative)) continue;
    let text = file.bytes.toString('utf8');
    // 一次性源命令整段删除，避免把已裁掉脚本留成看似可执行的代码块。
    text = text.replace(/```[^\n]*\n[\s\S]*?```/gu, block => [...removedPaths].some(file => block.includes(file)) ? '' : block);
    text = rewriteLinks(text, relative, finalPaths, removedPaths);
    text = neutralizeRoutes(text, removedSkills);
    for (const removed of removedPaths) if (/\.(?:mjs|md)$/u.test(removed)) text = text.replaceAll(removed, '基线前的一次性工程步骤');
    if (relative === 'docs/RELEASE.md') text = downstreamRelease(text);
    text = removeUpstreamOnly(text);
    result.set(relative, { ...file, bytes: Buffer.from(text), sha256: sha256(text) });
  }
  const agents = renderProjectAgents(preparation.values, skills);
  if (Buffer.byteLength(agents) > 20_000 || agents.trimEnd().split('\n').length > 120) throw new Error('下游 AGENTS 超过轻量入口预算');
  result.set('AGENTS.md', { bytes: Buffer.from(agents), mode: 0o644, sha256: sha256(agents) });
  validateFinalReferences(result, removedSkills);
  return { files: result, removedPaths, selection, skills };
}

/** 核对真实本地链接和相对模块 import；退役路径机器常量不是活动调用。 */
export function validateFinalReferences(files, removedSkills) {
  const paths = new Set(files.keys());
  for (const [relative, file] of files) {
    if (relative.includes('/assets/vendor/') || /^\.agents\/skills\/(?:gpui-kit|gpui-kit-design-guides|design-taste-frontend)\//u.test(relative)) continue;
    const text = file.bytes.toString('utf8');
    if (/\.(?:md|yaml)$/u.test(relative)) {
      if ([...removedSkills].some(name => text.includes(`$${name}`) || text.includes(`.agents/skills/${name}/`))) throw new Error(`裁剪后仍有活动 Skill 路由：${relative}`);
      for (const match of text.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/gu)) {
        const target = match[1].trim().replace(/^<|>$/gu, '').split('#')[0];
        if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/)/iu.test(target) || target.includes('<') || target.includes('>')) continue;
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(relative), target));
        if (!paths.has(resolved) && ![...paths].some(value => value.startsWith(`${resolved.replace(/\/$/u, '')}/`))) throw new Error(`裁剪后本地链接缺失：${relative} -> ${target}`);
      }
    }
    if (/\.(?:mjs|cjs|js)$/u.test(relative)) for (const match of text.matchAll(/(?:from\s+|import\s*\()(['"])(\.[^'"\n]+)\1/gu)) {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(relative), match[2]));
      if (!paths.has(resolved)) throw new Error(`裁剪后相对模块缺失：${relative} -> ${match[2]}`);
    }
  }
}
