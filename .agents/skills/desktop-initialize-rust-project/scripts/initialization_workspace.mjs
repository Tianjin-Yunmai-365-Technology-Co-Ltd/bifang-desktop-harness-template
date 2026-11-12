/** 裁剪只接受已建立的中性工作区，静态核对身份、成员、直接核心依赖和初始版本状态。 */
import path from 'node:path';
import { Version } from '../../desktop-manage-version/scripts/version_gate.mjs';
import { nshDependencies, nshPackageScripts, PROFILE_FIELDS } from '../../desktop-add-nsh-adapter/scripts/nsh_adapter_files.mjs';

/** 以 TOML 字符串/数组边界分句，不把注释或多行文本中的伪表当事实。 */
function statements(source) {
  const result = [];
  let current = '', quote = null, triple = false, escaped = false, depth = 0;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (quote) {
      current += character;
      if (quote === '"' && escaped) escaped = false;
      else if (quote === '"' && character === '\\') escaped = true;
      else if (character === quote && (!triple || source.slice(index, index + 3) === quote.repeat(3))) {
        if (triple) { current += quote.repeat(2); index += 2; }
        quote = null;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
      triple = source.slice(index, index + 3) === character.repeat(3);
      current += triple ? character.repeat(3) : character;
      if (triple) index += 2;
    } else if (character === '#') {
      while (index + 1 < source.length && source[index + 1] !== '\n') index++;
    } else if (character === '\n' && !depth) {
      if (current.trim()) result.push(current.trim());
      current = '';
    } else {
      if (character === '[' || character === '{') depth++;
      if (character === ']' || character === '}') depth--;
      current += character;
    }
  }
  if (quote || depth) throw new Error('Cargo 字符串或容器未结束');
  if (current.trim()) result.push(current.trim());
  return result;
}

/** 读取普通表的精确赋值；重复键/表或不支持的声明会在目标字段核对时拒绝。 */
function tables(source) {
  const result = new Map();
  let section = '';
  result.set('', new Map());
  for (const statement of statements(source)) {
    if (statement.startsWith('[')) {
      if (!/^\[[A-Za-z0-9_.-]+\]$/u.test(statement)) { section = null; continue; }
      section = statement.slice(1, -1);
      if (result.has(section)) throw new Error(`Cargo 表重复：${section}`);
      result.set(section, new Map());
    } else if (section !== null) {
      const match = /^([A-Za-z0-9_.-]+)\s*=\s*([\s\S]+)$/u.exec(statement);
      if (!match) throw new Error('初始化 Cargo 声明不可解析');
      const entries = result.get(section);
      if (entries.has(match[1])) throw new Error(`Cargo 键重复：${section}.${match[1]}`);
      entries.set(match[1], match[2]);
    }
  }
  return result;
}

/** 已知初始化字段只接受普通字符串或字符串数组，不从未识别语法猜测默认值。 */
function value(raw, label) {
  try {
    if (raw?.startsWith("'") && raw.endsWith("'") && !raw.slice(1, -1).includes("'")) return raw.slice(1, -1);
    return JSON.parse(raw?.replace(/,\s*\]/gu, ']'));
  } catch { throw new Error(`初始化 Cargo 字段非法：${label}`); }
}

/** 只允许 core 与已选适配器成员，所有适配器直接依赖同一核心，核心不反向依赖接口。 */
export function validateNeutralWorkspace(values, files) {
  const text = relative => {
    const file = files.get(relative);
    if (!file) throw new Error(`工作区缺少必需文件：${relative}`);
    return file.bytes.toString('utf8');
  };
  const root = tables(text('Cargo.toml'));
  const id = values.project_id;
  if (value(root.get('workspace.metadata.agent-first-harness')?.get('project-id'), 'project-id') !== id) throw new Error('Cargo project-id 与确认身份不一致');
  const members = value(root.get('workspace')?.get('members'), 'members');
  const expected = [`${id}_core`, ...values.interfaces.map(item => `${id}_${item}`)];
  if (!Array.isArray(members) || members.length !== expected.length || new Set(members).size !== members.length) throw new Error('Cargo workspace 成员集合不匹配');
  const logical = members.map(member => member === `${id}_gui/src-tauri` ? `${id}_gui` : member);
  if (logical.some(member => !expected.includes(member)) || new Set(logical).size !== expected.length) throw new Error('Cargo workspace 必须恰好包含 core 与已选适配器');
  const workspaceCore = root.get('workspace.dependencies')?.get(`${id}_core`);
  const version = Version.parse(value(root.get('workspace.package')?.get('version'), 'version')).toString();
  if (values.interfaces.includes('nsh')) {
    const member = id + '_nsh';
    const config = JSON.parse(text(member + '/nsh.json'));
    const desktop = values.nsh_targets.includes('desktop');
    const options = {projectId:id, nameZh:values.name_zh, nameEn:values.name_en, owner:values.owner,
      nshTargets:values.nsh_targets, targetPlatforms:values.target_platforms,
      ...(desktop ? {profile:Object.fromEntries(PROFILE_FIELDS.map(field => [field, values[field]]))} : {})};
    if (config.name !== values.name_zh || config.version !== version || config.rust !== '.' || Object.hasOwn(config, 'root')) {
      throw new Error('NSH Mixed 配置与已确认项目身份或版本不一致');
    }
    for (const filename of ['App.tsx', 'App.test.tsx', 'src/lib.rs']) {
      if (!text(member + '/' + filename).trim()) throw new Error('NSH Mixed 文件为空：' + filename);
    }
    const adapterDeps = tables(text(member + '/Cargo.toml')).get('dependencies');
    for (const line of nshDependencies(options).split('\n')) {
      const separator = line.indexOf(' = ');
      const name = line.slice(0, separator);
      const declaration = line.slice(separator + 3);
      if (root.get('workspace.dependencies')?.get(name) !== declaration || adapterDeps?.get(name + '.workspace') !== 'true') {
        throw new Error('NSH 依赖缺少固定版本或 workspace 接线：' + name);
      }
    }
    const scripts = JSON.parse(text('package.json')).scripts;
    for (const [name, command] of Object.entries(nshPackageScripts(id, values.nsh_targets, values.target_platforms))) {
      if (scripts?.[name] !== command) throw new Error('NSH 脚本与已确认目标不一致：' + name);
    }
    if (!desktop && files.has('docs/GUI_APP_PROFILE.md')) throw new Error('NSH 非桌面目标不应有桌面 profile');
  }
  for (const [index, member] of members.entries()) {
    if (typeof member !== 'string' || member.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Cargo member 路径非法');
    const manifest = tables(text(`${member}/Cargo.toml`));
    const name = value(manifest.get('package')?.get('name'), 'package.name');
    if (name !== logical[index]) throw new Error('Cargo member 包身份不匹配');
    const packageFields = manifest.get('package');
    const memberVersion = packageFields?.get('version');
    const inheritedVersion = packageFields?.get('version.workspace') === 'true' || /^\{\s*workspace\s*=\s*true\s*\}$/u.test(memberVersion ?? '') || manifest.get('package.version')?.get('workspace') === 'true';
    const versionForms = Number(memberVersion !== undefined) + Number(packageFields?.has('version.workspace')) + Number(manifest.has('package.version'));
    if (versionForms !== 1 || (!inheritedVersion && Version.parse(value(memberVersion, 'package.version')).toString() !== version)) throw new Error(`成员版本与根版本不一致：${name}`);
    if (name !== `${id}_core`) {
      const raw = manifest.get('dependencies')?.get(`${id}_core`);
      const explicit = manifest.get(`dependencies.${id}_core`);
      const viaWorkspace = raw === undefined ? explicit?.get('workspace') === 'true' : /^(?:true|\{\s*workspace\s*=\s*true\s*\})$/u.test(raw) || manifest.get('dependencies')?.get(`${id}_core.workspace`) === 'true';
      const dotted = manifest.get('dependencies')?.get(`${id}_core.workspace`) === 'true';
      const direct = raw && /^\{\s*path\s*=\s*["'][^"']+["']\s*\}$/u.test(raw) && path.posix.normalize(path.posix.join(member, raw.match(/path\s*=\s*["']([^"']+)/u)[1])) === `${id}_core`;
      if (viaWorkspace || dotted) {
        if (!workspaceCore || !new RegExp(`^\\{\\s*path\\s*=\\s*["']${id}_core["']\\s*\\}$`, 'u').test(workspaceCore)) throw new Error('workspace 核心依赖必须指向同一实际 core');
      } else if (!direct) throw new Error(`适配器缺少非可选直接核心依赖：${name}`);
    }
    for (const [section, entries] of manifest) if (section === 'dependencies' || section.startsWith('dependencies.')) {
      for (const dependency of [...entries.keys(), section.startsWith('dependencies.') ? section.slice('dependencies.'.length) : '']) {
        if (logical.some(other => other !== name && other !== `${id}_core` && dependency.split('.')[0] === other)
            || name === `${id}_core` && /^(?:clap|ratatui|tui-realm|tuirealm|rmcp|tauri|gpui|nsh)(?:[.-]|$)/u.test(dependency)) throw new Error('初始化依赖违反 core-first 或适配器独立边界');
      }
    }
  }
  const state = JSON.parse(text('.harness/version-state.json'));
  const expectedKeys = ['schema_version', 'cycle_base_version', 'target_version', 'feature_bump_applied', 'pending_changes', 'applied_bug_ids', 'applied_reconciliations', 'last_release'];
  if (Object.keys(state).sort().join() !== expectedKeys.sort().join() || state.schema_version !== 1 || state.cycle_base_version !== version || state.target_version !== version
      || state.feature_bump_applied !== false || state.last_release !== null || ['pending_changes', 'applied_bug_ids', 'applied_reconciliations'].some(key => !Array.isArray(state[key]) || state[key].length)) throw new Error('版本状态不是与 Cargo 一致的真实初始化状态');
}
