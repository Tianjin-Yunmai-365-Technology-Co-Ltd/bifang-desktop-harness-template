import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const LOCAL_PACKAGE = '.harness/skills/archify';
const REQUIRED_RESOURCES = [
  'references/repository-authoring.md', 'references/authoring-defaults.md',
  'references/delivery-contract.md', 'schemas/architecture.schema.json',
  'schemas/common.schema.json', 'examples/web-app.architecture.json',
  'assets/template.html', 'renderers/architecture/render-architecture.mjs',
];

/** 为安装失败提供稳定原因，调用方据此区分源缺失与已有文件冲突。 */
function failure(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/** 检查路径各级均为真实目录或普通文件，避免复制和写入沿符号链接越界。 */
function checkPath(target) {
  const absolute = path.resolve(target);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (!fs.existsSync(current) && !fs.lstatSync(current, { throwIfNoEntry: false })) break;
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
      throw failure('archify-unsafe-path', '安装路径包含链接或非普通对象');
    }
  }
}

/** 确认复制的是可独立执行的完整 Skill 包，读取声明版本但不执行第三方代码。 */
function inspectPackage(directory) {
  checkPath(directory);
  for (const relative of ['SKILL.md', 'package.json', 'bin/archify.mjs', 'LICENSE', ...REQUIRED_RESOURCES]) {
    const file = path.join(directory, relative);
    checkPath(file);
    if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
      throw failure('archify-incomplete-package', `Archify 包缺少 ${relative}`);
    }
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  if (manifest.name !== 'archify' || typeof manifest.version !== 'string') {
    throw failure('archify-incomplete-package', 'Archify 包身份或版本无效');
  }
  for (const relative of ['references', 'schemas', 'renderers', 'assets']) {
    const entry = path.join(directory, relative);
    checkPath(entry);
    if (!fs.statSync(entry, { throwIfNoEntry: false })?.isDirectory()) {
      throw failure('archify-incomplete-package', `Archify 包缺少 ${relative} 目录`);
    }
  }
  return manifest.version;
}

/** 在提交目标前确认 CLI 可加载；该最小执行检查不代替真实架构图的 finalize。 */
function checkRuntime(directory) {
  const result = spawnSync(process.execPath, [path.join(directory, 'bin/archify.mjs'), '--help'], {
    cwd: directory, timeout: 10000, maxBuffer: 256 * 1024, windowsHide: true, encoding: 'utf8',
  });
  if (result.error || result.status !== 0) throw failure('archify-runtime-failed', 'Archify CLI 无法加载或超时');
}

/** 复制前递归拒绝链接和特殊对象，完整保留包内相对路径及许可。 */
function inspectTree(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
      throw failure('archify-unsafe-path', 'Archify 源包含链接或非普通对象');
    }
    if (entry.isDirectory()) inspectTree(path.join(directory, entry.name));
  }
}

/** 已有包原样复用；缺少时只从已存在的完整包复制，以临时目录提交安装。 */
export function installArchify(projectRoot, { source, searchRoots } = {}) {
  const root = path.resolve(projectRoot);
  checkPath(root);
  if (!fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
    throw failure('archify-project-missing', '项目根不存在');
  }
  const destination = path.join(root, LOCAL_PACKAGE);
  for (const existing of [path.join(root, '.agents/skills/archify'), destination]) {
    checkPath(existing);
    if (fs.existsSync(existing)) {
      const version = inspectPackage(existing);
      checkRuntime(existing);
      return { status: 'reused', path: existing, version };
    }
  }
  const candidates = source ? [path.resolve(source)] : (searchRoots ?? [
    ...(process.env.CODEX_HOME ? [path.join(process.env.CODEX_HOME, 'skills/archify')] : []),
    path.join(os.homedir(), '.agents/skills/archify'),
    path.join(os.homedir(), '.codex/skills/archify'),
  ]);
  const origin = candidates.find(candidate => {
    checkPath(candidate);
    return fs.existsSync(candidate);
  });
  if (!origin) throw failure('archify-source-missing', '未找到 Archify；按安装引用取得官方完整包后使用 --source');
  const version = inspectPackage(origin);
  inspectTree(origin);
  if (destination.startsWith(`${path.resolve(origin)}${path.sep}`)) {
    throw failure('archify-unsafe-path', '源目录不能包含安装目标');
  }
  const parent = path.dirname(destination);
  checkPath(parent);
  fs.mkdirSync(parent, { recursive: true });
  const staging = fs.mkdtempSync(path.join(parent, '.archify-install-'));
  try {
    fs.cpSync(origin, path.join(staging, 'package'), { recursive: true, force: false, errorOnExist: true });
    inspectPackage(path.join(staging, 'package'));
    checkRuntime(path.join(staging, 'package'));
    checkPath(destination);
    if (fs.existsSync(destination)) throw failure('archify-target-conflict', 'Archify 安装目标已存在');
    fs.renameSync(path.join(staging, 'package'), destination);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  return { status: 'installed', path: destination, version, source: origin };
}

/** 解析显式安装参数并输出可供后续 Skill 使用的真实路径和状态。 */
export function main(argv = process.argv.slice(2)) {
  try {
    const options = {};
    for (let index = 0; index < argv.length; index += 2) {
      const key = argv[index];
      const value = argv[index + 1];
      if (!['--project-root', '--source'].includes(key) || !value || value.startsWith('--') || key in options) {
        throw failure('archify-invalid-arguments', '使用 --project-root <项目根> [--source <完整包目录>]');
      }
      options[key] = value;
    }
    if (!options['--project-root']) throw failure('archify-invalid-arguments', '必须指定 --project-root');
    console.log(JSON.stringify(installArchify(options['--project-root'], { source: options['--source'] })));
    return 0;
  } catch (error) {
    console.error(JSON.stringify({ status: 'failed', code: error.code ?? 'archify-install-failed', message: error.message }));
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
