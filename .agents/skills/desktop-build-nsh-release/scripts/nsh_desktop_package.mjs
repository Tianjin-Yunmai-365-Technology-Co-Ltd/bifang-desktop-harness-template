/** 组装 NSH Mixed 自定义桌面宿主；移动和 Web 仍由官方 package 负责。 */
import fs from 'node:fs';
import path from 'node:path';

const DESKTOP_TARGETS = new Set(['macos', 'windows', 'linux']);
const BUNDLE_FILES = ['bundle.js', 'app.json', 'capabilities.json'];

function ordinaryFile(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`NSH desktop input is not an ordinary file: ${path.basename(file)}`);
}

function copyDirectoryWithoutLinks(source, destination) {
  const stat = fs.lstatSync(source);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('NSH desktop asset directory is not ordinary');
  fs.mkdirSync(destination, { recursive: true });
  for (const name of fs.readdirSync(source)) {
    const from = path.join(source, name);
    const to = path.join(destination, name);
    const entry = fs.lstatSync(from);
    if (entry.isSymbolicLink()) throw new Error('NSH desktop bundle contains a symlink');
    if (entry.isDirectory()) copyDirectoryWithoutLinks(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
    else throw new Error('NSH desktop bundle contains a special file');
  }
}

function xml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

/** 精确读取九字段代码块；打包不信任手写摘要，也不推断未提供的选项。 */
export function readNshDesktopProfile(root) {
  const source = fs.readFileSync(path.join(root, 'docs/GUI_APP_PROFILE.md'), 'utf8');
  const blocks = [...source.matchAll(/^```gui-initialization-config[ \t]*\r?\n([\s\S]*?)^```[ \t]*\r?$/gmu)];
  if (blocks.length !== 1) throw new Error('requires exactly one desktop profile block');
  const keys = ['system_tray','system_notification','autostart','about_page','sponsor_page','single_instance','deep_link','global_shortcut','sidebar_mode'];
  const values = Object.create(null);
  for (const line of blocks[0][1].trim().split(/\r?\n/u)) {
    const match = /^([a-z_]+): (enabled|disabled|compact|detailed)$/u.exec(line);
    if (!match || Object.hasOwn(values, match[1])) throw new Error('invalid desktop profile entry');
    values[match[1]] = match[2];
  }
  if (Object.keys(values).sort().join() !== [...keys].sort().join() || keys.some(key => !(key === 'sidebar_mode' ? ['compact','detailed'] : ['enabled','disabled']).includes(values[key]))) throw new Error('invalid desktop profile fields');
  if (values.system_notification !== 'disabled' || values.global_shortcut !== 'disabled' || (values.deep_link === 'enabled' && values.single_instance !== 'enabled')) throw new Error('unsupported or inconsistent NSH desktop profile');
  return values;
}

/** A combined desktop/mobile/Web/TUI project needs portable metadata without desktop host permissions. */
export function prepareNshPortableEntry(gui, stage, { terminal = false } = {}) {
  const configFile = path.join(gui, 'nsh.json');
  const appFile = path.join(gui, terminal ? 'App.tui.tsx' : 'App.tsx');
  ordinaryFile(configFile);
  ordinaryFile(path.join(gui, 'App.tsx'));
  ordinaryFile(appFile);
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  if (config.rust !== '.' || Object.hasOwn(config, 'root') || !config.capabilities ||
      typeof config.capabilities !== 'object' || Array.isArray(config.capabilities) ||
      !Array.isArray(config.capabilities.host)) throw new Error('combined NSH project requires Mixed desktop host metadata');
  const entry = path.join(stage, 'portable-entry');
  fs.mkdirSync(entry, { recursive: false });
  const relative = file => path.relative(entry, file).split(path.sep).join('/');
  config.rust = relative(gui);
  delete config.capabilities.host;
  if (Object.keys(config.capabilities).length === 0) delete config.capabilities;
  if (config.icon !== undefined) {
    if (typeof config.icon !== 'string' || path.isAbsolute(config.icon)) throw new Error('invalid NSH icon');
    const icon = path.resolve(gui, config.icon);
    if (!icon.startsWith(gui + path.sep)) throw new Error('NSH icon escapes member');
    ordinaryFile(icon);
    const destination = path.join(entry, 'assets', 'logo.png');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(icon, destination);
    config.icon = 'assets/logo.png';
  }
  fs.writeFileSync(path.join(entry, 'nsh.json'), JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
  fs.writeFileSync(path.join(entry, 'App.tsx'), `import ${JSON.stringify(relative(appFile))};\n`, { flag: 'wx' });
  return entry;
}

/** 将已编译的宿主与 NSH bundle 放到真实运行相对路径；此函数不执行构建。 */
export function assembleNshDesktopPackage({ gui, stage, target, id, profile, targetDirectory, bundleDirectory = path.join(gui, '.nsh', 'out') }) {
  if (!DESKTOP_TARGETS.has(target) || !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u.test(id)) throw new Error('invalid NSH desktop packaging target or id');
  const configFile = path.join(gui, 'nsh.json');
  ordinaryFile(configFile);
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  const expectedAppId = `com.${id.split('_').map(part => `p${part}`).join('.')}.app`;
  if (typeof config.name !== 'string' || !config.name.trim() || config.name === '.' || config.name === '..' ||
      config.name !== path.basename(config.name) || /[\\/\x00-\x1f\x7f]/u.test(config.name) ||
      config.id !== expectedAppId || !/^\d+\.\d+\.\d+$/u.test(config.version)) throw new Error('invalid NSH desktop identity');
  if (typeof targetDirectory !== 'string' || !path.isAbsolute(targetDirectory)) throw new Error('Cargo target directory missing');
  const executable = `${id}_nsh_host${target === 'windows' ? '.exe' : ''}`;
  const binary = path.join(targetDirectory, 'release', executable);
  ordinaryFile(binary);
  const bundle = bundleDirectory;
  for (const name of BUNDLE_FILES) ordinaryFile(path.join(bundle, name));
  const packageRoot = path.join(stage, 'package');
  fs.mkdirSync(packageRoot, { recursive: true });
  let application;
  let resources;
  if (target === 'macos') {
    application = path.join(packageRoot, `${config.name}.app`);
    const macos = path.join(application, 'Contents', 'MacOS');
    resources = path.join(application, 'Contents', 'Resources', 'nsh');
    fs.mkdirSync(macos, { recursive: true });
    fs.copyFileSync(binary, path.join(macos, executable));
    const scheme = `app-${id.replaceAll('_', '-')}`;
    const url = profile.deep_link === 'enabled' ? `<key>CFBundleURLTypes</key><array><dict><key>CFBundleURLName</key><string>${xml(config.id)}.deeplink</string><key>CFBundleTypeRole</key><string>Viewer</string><key>CFBundleURLSchemes</key><array><string>${xml(scheme)}</string></array></dict></array>` : '';
    const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>CFBundleDevelopmentRegion</key><string>en</string><key>CFBundleExecutable</key><string>${xml(executable)}</string><key>CFBundleIdentifier</key><string>${xml(config.id)}</string><key>CFBundleName</key><string>${xml(config.name)}</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>${xml(config.version)}</string><key>CFBundleVersion</key><string>${xml(config.build ?? 1)}</string>${url}<key>LSMinimumSystemVersion</key><string>14.0</string><key>NSHighResolutionCapable</key><true/></dict></plist>\n`;
    fs.writeFileSync(path.join(application, 'Contents', 'Info.plist'), plist, { flag: 'wx' });
  } else if (target === 'windows') {
    application = path.join(packageRoot, id);
    resources = path.join(application, 'nsh');
    fs.mkdirSync(application, { recursive: true });
    fs.copyFileSync(binary, path.join(application, executable));
  } else {
    application = path.join(packageRoot, id);
    const bin = path.join(application, 'bin');
    resources = path.join(bin, 'nsh');
    fs.mkdirSync(bin, { recursive: true });
    fs.copyFileSync(binary, path.join(bin, executable));
  }
  fs.mkdirSync(resources, { recursive: true });
  for (const name of [...BUNDLE_FILES, 'bundle.js.map']) {
    const from = path.join(bundle, name);
    if (fs.existsSync(from)) { ordinaryFile(from); fs.copyFileSync(from, path.join(resources, name)); }
  }
  if (fs.existsSync(path.join(bundle, 'assets'))) copyDirectoryWithoutLinks(path.join(bundle, 'assets'), path.join(resources, 'assets'));
  if (profile.deep_link === 'enabled' && target !== 'macos') {
    const registration = path.join(gui, 'scripts', `register-deeplink-${target}${target === 'windows' ? '.ps1' : '.sh'}`);
    ordinaryFile(registration);
    fs.copyFileSync(registration, path.join(application, path.basename(registration)));
  }
  return { packageRoot, application, executable, config };
}
