#!/usr/bin/env node

/** 仅为已选 GPUI 的终端下游安装固定官方知识快照；不联网或执行远程代码。 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const SKILL_NAMES = Object.freeze(['gpui-kit', 'gpui-kit-design-guides']);
export const UPSTREAM_COMMIT = '0bbd9870ce420af9feacbf948b21d3824d82dc0b';
export const SNAPSHOT_ROOT = fileURLToPath(new URL('../assets/vendor/gpui-kit-skills/', import.meta.url));
const REPOSITORY = 'https://github.com/longbridge/gpui-kit';
const MANIFEST_SHA256 = '1a08f5dcc48c960019eb807b5ddc90d917f40fd8e9ff3a3963203ae6492a19dc';

/** 只将真正不存在的路径视为缺失，保留权限与文件系统诊断。 */
function optionalStat(file) {
  try { return fs.lstatSync(file); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

/** 计算精确字节摘要，来源锁与目标冲突比较共用同一算法。 */
function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** 拒绝链接和特殊文件，不把目录或不可读内容当作有效快照。 */
function readRegular(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`文件必须为普通非符号链接文件：${file}`);
  return fs.readFileSync(file);
}

/** 逐级验证受控目录，避免项目或快照内部链接把安装导向其它位置。 */
function checkDirectories(root, segments) {
  let current = root;
  for (const segment of ['', ...segments]) {
    current = path.join(current, segment);
    const stat = optionalStat(current);
    if (!stat) return;
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`目录必须为普通非符号链接目录：${current}`);
  }
}

/** 枚举普通文件的相对路径；额外内容也参与冲突判断，链接立即拒绝。 */
function treeFiles(root, relative = '') {
  const files = [];
  for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const file = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...treeFiles(root, file));
    else if (entry.isFile() && !entry.isSymbolicLink()) files.push(file);
    else throw new Error(`Skill 含非普通文件或链接：${file}`);
  }
  return files.sort();
}

/** 校验固定 revision 的完整来源清单，再为每个 Skill 添加独立许可和来源记录。 */
export function loadGpuiKitSkillsSnapshot(snapshotRoot = SNAPSHOT_ROOT) {
  const root = path.resolve(snapshotRoot);
  checkDirectories(root, []);
  const sourceBytes = readRegular(path.join(root, 'source.json'));
  if (digest(sourceBytes) !== MANIFEST_SHA256) throw new Error('GPUI Kit 来源清单摘要不一致');
  const source = JSON.parse(sourceBytes.toString('utf8'));
  if (source.schemaVersion !== 1 || source.repository !== REPOSITORY || source.commit !== UPSTREAM_COMMIT
      || source.license !== 'Apache-2.0' || JSON.stringify(source.skills) !== JSON.stringify(SKILL_NAMES)) {
    throw new Error('GPUI Kit 来源记录无效');
  }
  const declared = Object.keys(source.files).sort();
  if (JSON.stringify(treeFiles(root)) !== JSON.stringify([...declared, 'source.json'].sort())) {
    throw new Error('GPUI Kit 快照文件集与来源清单不一致');
  }
  const bytesByPath = new Map();
  for (const relative of declared) {
    if (relative !== 'LICENSE-APACHE' && !SKILL_NAMES.some(name => relative.startsWith(`${name}/`))) {
      throw new Error(`GPUI Kit 快照路径不受支持：${relative}`);
    }
    const bytes = readRegular(path.join(root, relative));
    const record = source.files[relative];
    if (record.bytes !== bytes.length || record.sha256 !== digest(bytes)) throw new Error(`GPUI Kit 快照摘要不一致：${relative}`);
    bytesByPath.set(relative, bytes);
  }
  const license = bytesByPath.get('LICENSE-APACHE');
  if (!license?.toString('utf8').includes('Apache License')) throw new Error('GPUI Kit Apache 许可缺失');
  return new Map(SKILL_NAMES.map(name => {
    const files = new Map([...bytesByPath].filter(([file]) => file.startsWith(`${name}/`)).map(([file, bytes]) => [file.slice(name.length + 1), bytes]));
    const skill = files.get('SKILL.md')?.toString('utf8');
    if (!skill?.startsWith(`---\nname: ${name}\n`)) throw new Error(`GPUI Kit Skill 名称无效：${name}`);
    files.set('LICENSE-APACHE', license);
    files.set('HARNESS-INTEGRATION.md', Buffer.from(`# GPUI Kit 本地知识资产\n\n官方 Skill 与 references 保留原始字节；来源固定为 [GPUI Kit ${UPSTREAM_COMMIT}](${REPOSITORY}/tree/${UPSTREAM_COMMIT}/skills)，许可见 [LICENSE-APACHE](LICENSE-APACHE)。本文件由 Harness 添加。\n\n用户指令和项目规则优先；这些知识不授权更改已确认的框架、依赖、侧栏、产品范围或验收责任。API 按项目实际依赖版本复核。\n\n上游原样文档中的相对引用按以下语义读取：\n\n- Design Guides：项目本地 .agents/skills/gpui-kit-design-guides/references/design-guides.md。\n- Coding Guides：项目本地 .agents/skills/gpui-kit/references/coding-guides.md。\n- Getting Started：[官方文档](https://gpui-kit.com/docs/getting-started.md)。\n- usage.md 的仓库示例：[bootstrap.rs](${REPOSITORY}/blob/${UPSTREAM_COMMIT}/examples/ai_recipes/src/bootstrap.rs)。该示例是参考，不是本地必需文件或要执行的安装脚本。\n`));
    const provenance = { schemaVersion: 1, repository: REPOSITORY, commit: UPSTREAM_COMMIT, upstreamPath: `skills/${name}`, license: 'Apache-2.0', upstreamModified: false, integrationGuidance: 'HARNESS-INTEGRATION.md',
      files: Object.fromEntries([...files].map(([file, bytes]) => [file, { bytes: bytes.length, sha256: digest(bytes) }])) };
    files.set('source.json', Buffer.from(`${JSON.stringify(provenance, null, 2)}\n`));
    return [name, files];
  }));
}

/** 仅去掉字符串外的 TOML 注释，保留引号内字符以便精确解析框架事实。 */
function withoutComment(line) {
  let quote = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote === '"' && char === '\\') { index += 1; continue; }
    if (quote) { if (char === quote) quote = null; }
    else if (char === '"' || char === "'") quote = char;
    else if (char === '#') return line.slice(0, index);
  }
  return line;
}

/** 从实际根 Cargo 的唯一 metadata 解析 GUI 选择；非法声明不能静默跳过。 */
function isGpuiProject(cargoBytes) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(cargoBytes).split(/\r?\n/u).map(withoutComment).join('\n');
  const sections = [...text.matchAll(/^\s*\[workspace\.metadata\.agent-first-harness\]\s*$/gmu)];
  if (sections.length !== 1) throw new Error('下游 Cargo 必须具有唯一 Harness metadata');
  const remaining = text.slice(sections[0].index + sections[0][0].length);
  const body = remaining.split(/^\s*\[/mu)[0];
  const interfaces = [...body.matchAll(/^\s*interfaces\s*=\s*(\[[\s\S]*?\])/gmu)];
  const frameworks = [...body.matchAll(/^\s*gui-framework\s*=\s*([^\n]+)/gmu)];
  if (interfaces.length !== 1 || frameworks.length > 1) throw new Error('Cargo 接口或框架字段缺失/重复');
  const literal = interfaces[0][1];
  const identifiers = [...literal.matchAll(/(?:"([a-z]+)"|'([a-z]+)')/giu)].map(match => (match[1] ?? match[2]).toLowerCase());
  if (!identifiers.length || literal.replace(/(?:"[a-z]+"|'[a-z]+')/giu, '').replace(/[\s,\[\]]/gu, '')) throw new Error('Cargo interfaces 必须为非空字符串数组');
  const framework = frameworks[0]?.[1].trim() ?? '"tauri"';
  if (!/^(?:"(?:tauri|gpui)"|'(?:tauri|gpui)')$/u.test(framework)) throw new Error('Cargo gui-framework 必须为 tauri 或 gpui');
  if (!identifiers.includes('gui')) {
    if (frameworks.length) throw new Error('非 GUI 下游不能声明 gui-framework');
    return false;
  }
  return framework.includes('gpui');
}

/** 已存在的 Skill 必须与固定安装内容逐字节一致；用户改动和额外文件都不覆盖。 */
function existingStatus(destination, expected) {
  const stat = optionalStat(destination);
  if (!stat) return 'missing';
  checkDirectories(destination, []);
  const actual = treeFiles(destination);
  if (!actual.length) return 'empty';
  if (JSON.stringify(actual) !== JSON.stringify([...expected.keys()].sort())
      || actual.some(file => !readRegular(path.join(destination, file)).equals(expected.get(file)))) {
    throw new Error(`项目本地 GPUI Kit Skill 与固定快照冲突，已保留原内容：${destination}`);
  }
  return 'reused';
}

/** 两个 Skill 先共同预检再暂存安装；失败只回收本次新增目录并恢复既有空目录。 */
export function ensureGpuiKitSkills(projectRoot, { snapshotRoot = SNAPSHOT_ROOT } = {}) {
  const requested = path.resolve(projectRoot);
  checkDirectories(requested, []);
  const root = fs.realpathSync(requested);
  if (optionalStat(path.join(root, 'Version.md')) && optionalStat(path.join(root, '.agents/skills/desktop-instantiate-project/SKILL.md'))) {
    throw new Error('不能把 GPUI Kit Skills 安装到 Harness 源根');
  }
  if (!isGpuiProject(readRegular(path.join(root, 'Cargo.toml')))) return { status: 'skipped', reason: 'gui-framework-is-not-gpui', skills: [] };
  checkDirectories(root, ['.agents', 'skills']);
  const snapshots = loadGpuiKitSkillsSnapshot(snapshotRoot);
  const parent = path.join(root, '.agents', 'skills');
  const planned = [...snapshots].map(([name, files]) => {
    const destination = path.join(parent, name);
    return { name, files, destination, status: existingStatus(destination, files) };
  });
  const pending = planned.filter(item => item.status !== 'reused');
  if (pending.length) {
    fs.mkdirSync(parent, { recursive: true });
    checkDirectories(root, ['.agents', 'skills']);
    const staging = fs.mkdtempSync(path.join(parent, '.gpui-kit-install-'));
    const installed = [];
    try {
      for (const item of pending) {
        for (const [relative, bytes] of item.files) {
          const file = path.join(staging, item.name, relative);
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, bytes, { flag: 'wx' });
        }
      }
      for (const item of pending) {
        checkDirectories(root, ['.agents', 'skills']);
        if (existingStatus(item.destination, item.files) !== item.status) throw new Error(`Skill 安装目标在预检后发生变化：${item.name}`);
        if (item.status === 'empty') fs.rmdirSync(item.destination);
        fs.renameSync(path.join(staging, item.name), item.destination);
        installed.push(item);
      }
    } catch (error) {
      for (const item of installed.reverse()) {
        fs.rmSync(item.destination, { recursive: true });
        if (item.status === 'empty') fs.mkdirSync(item.destination);
      }
      for (const item of pending) if (item.status === 'empty' && !optionalStat(item.destination)) fs.mkdirSync(item.destination);
      throw error;
    } finally { fs.rmSync(staging, { recursive: true, force: true }); }
  }
  return { status: pending.length ? 'installed' : 'reused', commit: UPSTREAM_COMMIT,
    skills: planned.map(item => ({ name: item.name, status: item.status === 'reused' ? 'reused' : 'installed', path: item.destination })) };
}

/** CLI 只接受显式项目根，固定输出安装事实，不提供全局或网络更新选项。 */
export function main(argv = process.argv.slice(2)) {
  try {
    if (argv.length !== 2 || argv[0] !== '--project-root' || !argv[1]?.trim()) throw new Error('用法：node ensure_gpui_kit_skills.mjs --project-root <downstream-root>');
    process.stdout.write(`${JSON.stringify(ensureGpuiKitSkills(argv[1]))}\n`);
    return 0;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ status: 'error', message: error.message })}\n`);
    return 1;
  }
}

if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fileURLToPath(import.meta.url)) process.exitCode = main();
