/** 实例化只传输受管工程层；快照在目标创建之前冻结，身份变换不触及第三方材料。 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { replaceExact } from '../../desktop-rename-project-identity/scripts/rename_project_identity.mjs';
import { isRetiredInterfaceAsset } from '../../desktop-upgrade-harness/scripts/harness_upgrade_interfaces.mjs';
import { POLICY_FIELDS } from './initialization_questions.mjs';

const ROOT_FILES = new Set(['AGENTS.md', 'README.md', 'DESIGN.md', '.gitignore', '.gitattributes', 'LICENSE.zh-CN.md', 'LICENSE.en.md']);
const DOC_FILES = new Set(['AGENT_POLICY.md', 'CLI_CONTRACT.md', 'ENGINEERING_RULES.md', 'GUI_ENGINEERING.md', 'RELEASE.md', 'RUST_CLI_TEMPLATE.md', 'TECH_DEBT.md']);
const EXCLUDED_SKILLS = new Set(['desktop-curate-harness-memory']);
const MAX_FILE_BYTES = 16 * 1024 * 1024;

/** 对精确字节计算摘要，用于预览绑定和目标漂移检查。 */
export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

/** 仅真正缺失的路径返回 null，权限和 I/O 错误不会被解释为可写空位。 */
export function lstatOrNull(file) {
  try { return fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

/** 相对路径必须是普通平台均能表示的仓库路径，不允许越界、别名和 Windows ADS。 */
export function safeRelative(relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.includes(':') || /[\x00-\x1f\x7f]/u.test(relative)
      || relative.split('/').some(part => !part || part === '.' || part === '..') || path.isAbsolute(relative)) throw new Error('非法受管相对路径');
  return relative;
}

/** 逐级拒绝符号链接和非目录祖先；缺失尾部只能在明确的新建路径模式下出现。 */
export function assertOrdinaryPath(raw, allowMissing = false) {
  const absolute = path.resolve(raw);
  const root = path.parse(absolute).root;
  let current = root;
  for (const segment of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const stat = lstatOrNull(current);
    if (!stat) { if (allowMissing) return absolute; throw new Error(`路径缺失：${current}`); }
    if (stat.isSymbolicLink() || (current !== absolute && !stat.isDirectory())) throw new Error(`路径不是普通目录树：${current}`);
  }
  return absolute;
}

/** 读取有界普通文件并核对打开前后的文件身份，拒绝链接、特殊对象和读期间变化。 */
export function readRegular(file) {
  assertOrdinaryPath(file);
  const before = fs.lstatSync(file);
  if (!before.isFile() || before.size > MAX_FILE_BYTES || (before.mode & 0o7000)) throw new Error(`受管文件类型、大小或权限非法：${file}`);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) throw new Error(`文件身份变化：${file}`);
    const bytes = fs.readFileSync(fd);
    const after = fs.fstatSync(fd);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs || bytes.length !== before.size) throw new Error(`文件读取期间变化：${file}`);
    return { bytes, mode: before.mode & 0o777, sha256: sha256(bytes), dev: before.dev, ino: before.ino };
  } finally { fs.closeSync(fd); }
}

/** 固定允许范围排除记忆、发布事实、缓存、其他项目以及上游专用治理入口。 */
export function includedSourcePath(relative) {
  safeRelative(relative);
  if (isRetiredInterfaceAsset(relative)) return false;
  if (ROOT_FILES.has(relative)) return true;
  if (relative.startsWith('docs/design_standards/')) return true;
  if (relative.startsWith('docs/') && DOC_FILES.has(relative.slice(5))) return true;
  const skill = /^\.agents\/skills\/([^/]+)\//u.exec(relative)?.[1];
  return Boolean(skill && !EXCLUDED_SKILLS.has(skill) && !/(?:^|\/)check_no_python(?:\.test)?\.mjs$/u.test(relative));
}

/** 通过源仓库索引冻结文件列表，不递归扫描可能包含目标或其他下游的源目录。 */
export function snapshotSource(rawRoot) {
  const root = assertOrdinaryPath(rawRoot);
  if (!fs.lstatSync(root).isDirectory()) throw new Error('Harness 根必须是普通目录');
  const top = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', timeout: 10_000 }).trim();
  if (path.resolve(top) !== root) throw new Error('Harness 源必须是精确 Git 顶层目录');
  const list = execFileSync('git', ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8', timeout: 10_000, maxBuffer: 4 * 1024 * 1024 });
  const paths = [...new Set(list.split('\0').filter(Boolean))].sort();
  const declaredSkills = new Set(paths.filter(file => /^\.agents\/skills\/[^/]+\/SKILL\.md$/u.test(file)).map(file => file.split('/')[2]));
  const files = new Map();
  for (const relative of paths) {
    const skill = /^\.agents\/skills\/([^/]+)\//u.exec(relative)?.[1];
    if (includedSourcePath(relative) && (!skill || declaredSkills.has(skill))) files.set(relative, readRegular(path.join(root, relative)));
  }
  for (const relative of [...ROOT_FILES, 'docs/AGENT_POLICY.md', 'docs/ENGINEERING_RULES.md', '.agents/skills/desktop-instantiate-project/SKILL.md']) {
    if (!files.has(relative)) throw new Error(`Harness 快照缺少必需文件：${relative}`);
  }
  const manifest = [...files].map(([relative, file]) => ({ path: relative, sha256: file.sha256, mode: file.mode }));
  return { root, files, manifest, digest: sha256(JSON.stringify(manifest)) };
}

/** 从两份许可证的唯一项目名称行提取身份；法律正文不会被当作可自由渲染的模板。 */
function sourceNames(files) {
  const zh = files.get('LICENSE.zh-CN.md').bytes.toString('utf8').match(/\*\*适用项目名称：(.+?)。/u)?.[1];
  const en = files.get('LICENSE.en.md').bytes.toString('utf8').match(/\*\*Applicable Project Name: (.+?)\. During/u)?.[1];
  if (!zh || !en) throw new Error('无法确定源许可证的唯一项目名称');
  return { zh, en };
}

/** 下游根入口只表达实际身份、所选接口和未定义产品状态，不继承模板发布结论。 */
export function renderProjectReadme(values) {
  return `# ${values.name_zh}\n\n${values.name_en}\n\n- 项目标识：\`${values.project_id}\`\n- 负责人：${values.owner}\n- 目标平台：${values.target_platforms.join('、')}\n- 接口：${values.interfaces.join('、')}${values.gui_framework ? `（DESKTOP: ${values.gui_framework}）` : ''}${values.nsh_targets ? `（NSH: ${values.nsh_targets.join('、')}）` : ''}\n- 产品定义：待定义，\`productDefinitionRequired=true\`\n- 当前版本事实：根 \`Cargo.toml\`；尚未形成产品发布或候选验收结论。\n\n这是独立的终端项目。中性脚手架完成后，在本项目根目录使用 \`$desktop-define-product\` 定义产品，再通过 \`$desktop-implement-change\` 实施。开发规则从 [AGENTS.md](AGENTS.md) 渐进读取；许可见 [中文](LICENSE.zh-CN.md)与[英文](LICENSE.en.md)。\n`;
}

// Skill 目录名是实例化、裁剪和升级的稳定路径；分组只改变入口的阅读顺序。
export const SKILL_GROUPS = [
  ['创建与身份', [
    'desktop-instantiate-project', 'desktop-initialize-rust-project', 'desktop-check-development-environment',
    'desktop-rename-project-identity', 'desktop-test-gui-initialization-e2e',
    'desktop-test-nsh-initialization-e2e',
  ]],
  ['接口适配', [
    'desktop-add-cli-adapter', 'desktop-add-mcp-adapter', 'desktop-add-gui-adapter',
    'desktop-add-nsh-adapter',
  ]],
  ['桌面能力与呈现', [
    'desktop-add-gui-autostart', 'desktop-add-gui-deep-link',
    'desktop-add-gui-dialog', 'desktop-add-gui-global-shortcut', 'desktop-add-gui-single-instance',
    'desktop-add-gui-system-locale', 'desktop-add-gui-system-notifications',
    'desktop-add-gui-system-tray', 'desktop-add-gui-window-state',
    'desktop-prepare-gui-app-identity', 'desktop-prepare-gui-support-surfaces',
    'desktop-extract-i18n-strings', 'mantine-list-view',
  ]],
  ['开发与架构', [
    'desktop-add-external-process', 'desktop-add-file-operations', 'desktop-implement-change',
    'desktop-refactor-code', 'desktop-manage-dependencies',
    'desktop-review-core-boundaries',
  ]],
  ['Task 与并行', [
    'desktop-task-workflow', 'desktop-manage-user-tasks', 'desktop-manage-task-worktrees',
    'desktop-run-parallel-worktrees',
  ]],
  ['知识与决策', [
    'desktop-define-product', 'desktop-extract-technical-docs', 'desktop-curate-harness-memory',
    'desktop-summarize-development-history', 'desktop-record-adr', 'desktop-plan-change',
    'desktop-handoff-project',
  ]],
  ['版本、策略与 Git', [
    'desktop-configure-agent-policy', 'desktop-configure-git-commits', 'desktop-manage-git-lifecycle',
    'desktop-manage-version', 'desktop-switch-post-release-action', 'desktop-upgrade-harness',
  ]],
  ['构建、发布与验收', [
    'desktop-build-nsh-release', 'desktop-build-rust-release',
    'desktop-build-tauri-local-install', 'desktop-build-tauri-release',
    'desktop-collect-release-artifacts', 'desktop-inspect-release-notes',
    'desktop-prepare-cross-platform-release', 'desktop-prepare-release',
    'desktop-test-final-artifact-e2e', 'desktop-verify-delivery',
  ]],
];

/** 只显示实际保留的 Skill；项目自有入口也必须可发现且不能重复。 */
export function renderProjectSkillMap(skills) {
  const remaining = new Set(skills);
  const sections = [];
  const links = names => {
    const rows = [];
    for (let index = 0; index < names.length; index += 5) {
      rows.push(`- ${names.slice(index, index + 5).map(name => `[$${name}](.agents/skills/${name}/SKILL.md)`).join('、')}。`);
    }
    return rows.join('\n');
  };
  for (const [label, members] of SKILL_GROUPS) {
    const selected = members.filter(name => remaining.delete(name));
    if (selected.length) sections.push(`### ${label}\n\n${links(selected)}`);
  }
  if (remaining.size) sections.push(`### 项目扩展\n\n${links([...remaining].sort())}`);
  return sections.join('\n\n');
}

/** 按实际保留集合生成轻量路由和地图；具体操作合同继续由原 Skill 与规范负责。 */
export function renderProjectAgents(values, skills, prepared = false) {
  return `# AGENTS.md\n\n## 项目使命\n\n${values.name_zh} / ${values.name_en}；这是终端下游，只在已批准产品边界内实施，不继续派生项目。产品未定义时只保留中性状态。\n\n## 启动门禁\n\n1. 先读取用户级 AGENTS.md，再读本文与 docs/AGENT_POLICY.md 的字段语义，复用已确认授权。\n2. 写入前核对精确 Git 根、分支和工作区，保护用户修改。新功能与独立修复通过 $desktop-manage-git-lifecycle 建立受管分支。\n3. 自动左侧 Task 只由 user_owned_tasks 控制；Task、工作树与内部并行合同统一使用 $desktop-task-workflow。\n4. 按任务读取下表的唯一事实源和 Skill，不预加载全部资料。${prepared ? ' 当前工程层已准备；继续已确认的中性初始化，尚未建立独立 Git 基线。' : ''}\n\n## 按任务渐进读取\n\n| 任务 | 事实源与入口 |\n|---|---|\n| 定义产品 | $desktop-define-product；规格不存在时按该 Skill 创建 |\n| 实施与修复 | docs/ENGINEERING_RULES.md、$desktop-implement-change；下游版本由 $desktop-manage-version 管理 |\n| Rust 与接口 | docs/RUST_CLI_TEMPLATE.md；只读实际选择的 adapter Skill${values.interfaces.includes('cli') ? '；CLI 另读 docs/CLI_CONTRACT.md' : ''} |\n| Task 与工作树 | docs/AGENT_POLICY.md、$desktop-task-workflow |\n| 升级工程层 | $desktop-upgrade-harness；保护产品代码、身份、策略与记忆 |\n| 构建与发布 | docs/RELEASE.md 及所选构建 Skill；真实产物验证由 $desktop-verify-delivery 承担 |\n${values.interfaces.includes('gui') ? '| DESKTOP | docs/design_standards/README.md，先读 ui_foundation.md，再读 Tauri 标准 |\n' : ''}${values.interfaces.includes('nsh') ? `| NSH | $desktop-add-nsh-adapter；按 Cargo nsh-targets 选择桌面、移动、Web${values.nsh_targets?.includes('desktop') ? '，桌面能力读 docs/GUI_APP_PROFILE.md' : ''} |\n` : ''}\n## 始终生效的边界\n\n- Core-first：接口无关业务、领域校验、状态转换和稳定错误属于 shared core；适配器只负责协议、展示、纯交互与宿主机制。\n- 日常只实施已授权范围并运行相关非空回归，不自动增加持久计划、全仓检查、构建、E2E 或验收。\n- Node.js 是所有接口组合的 helper 运行时；工具依赖按用户级规则安装，项目依赖使用本地显式清单。\n- superpowers: disabled 时不得调用 superpowers:*；能力允许不能替代当前任务的触发与授权。\n- 规格、决定、变更、状态、计划和验证只按独立事件记录，规则见 docs/ENGINEERING_RULES.md。\n- 发布、签名、凭据与破坏性操作遵守各自真实授权；对完成与验证的结论绑定真实结果，不以脚手架代替验收。\n\n## Skills 地图\n\n${renderProjectSkillMap(skills)}\n\n## 约束地图\n\n| 事实 | 唯一来源 |\n|---|---|\n| 产品与记忆 | 相应事件创建的 docs/product_spec、docs/adr、docs/project_status 等索引 |\n| Agent 选择 | docs/AGENT_POLICY.md |\n| 工程与测试 | docs/ENGINEERING_RULES.md |\n| Rust 与实际接口 | docs/RUST_CLI_TEMPLATE.md、根 Cargo metadata |\n| 版本与周期 | 根 Cargo.toml、受保护 .harness/version-state.json、$desktop-manage-version |\n| 发布与候选 | docs/RELEASE.md、.harness/release-context.json、忽略的 release/ 证据 |\n| 升级来源 | .harness/upstream-lock.json、$desktop-upgrade-harness |\n| 已知限制 | docs/TECH_DEBT.md |\n\n## 每次任务的最小闭环\n\n判定边界与类型 → 按需读取 → 实施并验证当前变化 → 仅更新事件触发记录 → 报告实际变更、检查、未执行项与风险。\n`;
}

/** 删除上游专用禁令段落；下游仍遵守通用的显式依赖和标准库优先规则。 */
export function removeUpstreamOnly(text) {
  return text.replace(/仅 Harness 上游源树禁止[^。\n]*。/gu, '')
    .replace(/[^。\n]*check_no_python[^。\n]*(?:。|$)/gu, '')
    .replace(/初始化和升级均不得把该检查器及上游专用禁令传播到终端下游；/gu, '');
}

/** 在内存中逐文件重置身份；vendor 保持原字节，许可证仅允许唯一名称词元变化。 */
export function renderPreparedFiles(snapshot, values, confirmationSource, confirmedAt) {
  const names = sourceNames(snapshot.files);
  const replacements = [[names.zh, values.name_zh], [names.en, values.name_en], ['agent-first-harness-template', values.project_id.replaceAll('_', '-')], ['agent_first_harness_template', values.project_id], ['example_tool', values.project_id], ['example-tool', values.project_id.replaceAll('_', '-')]].filter(([from, to]) => from !== to).sort((a, b) => b[0].length - a[0].length);
  const result = new Map();
  for (const [relative, file] of snapshot.files) {
    const vendor = relative.includes('/assets/vendor/');
    let destination = vendor ? relative : replaceExact(relative, replacements);
    let bytes = file.bytes;
    if (/^LICENSE\.(?:zh-CN|en)\.md$/u.test(relative)) {
      const old = relative.includes('zh-CN') ? names.zh : names.en;
      const next = relative.includes('zh-CN') ? values.name_zh : values.name_en;
      const source = bytes.toString('utf8');
      if (source.split(old).length !== 2) throw new Error('许可证项目名称必须恰好出现一次');
      bytes = Buffer.from(source.replace(old, next));
    } else if (!vendor && !bytes.includes(0)) {
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { text = null; }
      if (text !== null) bytes = Buffer.from(replaceExact(text, replacements));
    }
    safeRelative(destination);
    if (result.has(destination)) throw new Error(`身份映射路径碰撞：${destination}`);
    result.set(destination, { bytes, mode: file.mode });
  }
  result.set('README.md', { bytes: Buffer.from(renderProjectReadme(values)), mode: 0o644 });
  result.set('docs/TECH_DEBT.md', { bytes: Buffer.from('# 技术债与已知限制\n\n尚未记录下游特有技术债。继承的工程规范与依赖声明不构成本项目的真实平台验证证据。\n'), mode: 0o644 });
  let policy = result.get('docs/AGENT_POLICY.md').bytes.toString('utf8');
  const fields = { schema_version: '5', confirmed_by: JSON.stringify(confirmationSource), confirmed_at: confirmedAt, decision_mode: 'reuse_then_infer_then_ask', ...Object.fromEntries(POLICY_FIELDS.map(key => [key, values[key]])), post_release_action: 'pending' };
  policy = policy.replace(/^---\n[\s\S]*?\n---/u, `---\n${Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join('\n')}\n---`);
  result.set('docs/AGENT_POLICY.md', { bytes: Buffer.from(policy), mode: 0o644 });
  for (const relative of ['docs/ENGINEERING_RULES.md']) {
    const file = result.get(relative);
    result.set(relative, { ...file, bytes: Buffer.from(removeUpstreamOnly(file.bytes.toString('utf8'))) });
  }
  const skills = [...result.keys()].filter(file => /^\.agents\/skills\/[^/]+\/SKILL\.md$/u.test(file)).map(file => file.split('/')[2]);
  result.set('AGENTS.md', { bytes: Buffer.from(renderProjectAgents(values, skills, true)), mode: 0o644 });
  return result;
}
