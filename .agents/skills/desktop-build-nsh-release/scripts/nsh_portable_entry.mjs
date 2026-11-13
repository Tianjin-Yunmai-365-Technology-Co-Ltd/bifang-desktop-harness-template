/** 保留官方应用目录与 Cargo 相对路径，在隔离的副本中移除桌面专用配置。 */
import fs from 'node:fs';
import path from 'node:path';

export const NSH_BUILD_CACHE_NAMES = new Set(['.git', '.nsh', 'target', 'release', 'node_modules']);
const portableCaches = new Set([...NSH_BUILD_CACHE_NAMES].filter(name => name !== 'node_modules'));

function isWithin(root, file) {
  return file.startsWith(root + path.sep);
}

/** NSH 只打包应用根内的静态资源，必须复制工作区布局，不能用跨目录入口或链接。 */
export function prepareNshPortableEntry(root, member, stage, { portable = true, betaIdentity } = {}) {
  const relative = path.relative(root, member);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw new Error('NSH app must belong to its workspace');
  }
  const canonicalRoot = fs.realpathSync(root);
  const workspace = path.join(stage, 'portable-source');
  fs.mkdirSync(workspace);
  const copyOptions = {
    recursive: true,
    errorOnExist: true,
    force: false,
    verbatimSymlinks: true,
    filter(source) {
      const segments = path.relative(root, source).split(path.sep);
      if (!segments.includes('node_modules') && portableCaches.has(path.basename(source))) return false;
      const stat = fs.lstatSync(source);
      if (stat.isSymbolicLink() && segments.includes('node_modules')) {
        const link = fs.readlinkSync(source);
        if (path.isAbsolute(link) || !isWithin(root, path.resolve(path.dirname(source), link)) ||
            !isWithin(canonicalRoot, fs.realpathSync(source))) throw new Error('portable NSH dependencies must use project-local relative links');
        return true;
      }
      if (!stat.isDirectory() && !stat.isFile()) throw new Error('portable NSH source must use ordinary files and directories');
      return true;
    },
  };
  for (const name of fs.readdirSync(root)) {
    if (!portableCaches.has(name)) fs.cpSync(path.join(root, name), path.join(workspace, name), copyOptions);
  }
  const entry = path.join(workspace, relative);
  const configFile = path.join(entry, 'nsh.json');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  if (portable && (config.rust !== '.' || Object.hasOwn(config, 'root'))) throw new Error('combined NSH project requires a Mixed app');
  if (portable && config.capabilities != null) {
    if (typeof config.capabilities !== 'object' || Array.isArray(config.capabilities)) throw new Error('invalid NSH capabilities');
    delete config.capabilities.windows;
    // An explicit empty object denies all capabilities. Omitting the field grants all by default.
  }
  if (portable) {
    delete config.singleInstance;
    delete config.window;
  }
  // 便携目标只移除脚手架生成的桌面协议。
  if (portable && Array.isArray(config.schemes)) {
    const generatedScheme = 'app-' + path.basename(member, '_nsh').replaceAll('_', '-');
    config.schemes = config.schemes.filter(scheme => scheme !== generatedScheme);
    if (!config.schemes.length) delete config.schemes;
  }
  if (betaIdentity) {
    Object.assign(config, betaIdentity);
    if (config.window) config.window.title = config.window.title ? config.window.title + ' Beta' : config.name;
  }
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n');
  return entry;
}
