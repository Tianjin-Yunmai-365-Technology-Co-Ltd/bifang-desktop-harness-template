/** Neutral TSX Mixed desktop hosts. Platform assets are rendered only for selected targets. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const assetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/host');
const revision = 'e626a8dd8f8d8b277b9507cfd5ac74d0e67020f3';
const git = 'https://github.com/longbridge/nsh.git';
const desktops = ['macos', 'windows', 'linux'];
const features = {
  TRAY: 'system_tray',
  SINGLE_INSTANCE: 'single_instance',
  DEEP_LINK: 'deep_link',
  AUTOSTART: 'autostart',
};
const alwaysMethods = ['window.list', 'window.setTitle', 'window.open', 'window.focus', 'window.showAll', 'window.close', 'app.quit'];

function assertOptions(options) {
  if (!options || typeof options !== 'object' || !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u.test(options.projectId) ||
      !Array.isArray(options.targetPlatforms) || !Array.isArray(options.nshTargets) ||
      !options.nshTargets.includes('desktop') || !options.targetPlatforms.some(target => desktops.includes(target)) ||
      !options.profile || typeof options.profile !== 'object' ||
      typeof options.nameZh !== 'string' || typeof options.nameEn !== 'string') throw new Error('requires normalized NSH desktop options');
  for (const field of Object.values(features)) {
    if (!['enabled', 'disabled'].includes(options.profile[field])) throw new Error(`invalid desktop capability: ${field}`);
  }
  if (options.profile.deep_link === 'enabled' && options.profile.single_instance !== 'enabled') {
    throw new Error('deep_link requires single_instance');
  }
  for (const field of ['system_notification', 'global_shortcut']) {
    if (options.profile[field] !== 'disabled') throw new Error(`NSH desktop capability unavailable: ${field}`);
  }
}

export function nshHostMethods(options) {
  assertOptions(options);
  return [...alwaysMethods,
    ...(options.profile.autostart === 'enabled' ? ['autostart.get', 'autostart.set'] : []),
    ...(options.profile.deep_link === 'enabled' ? ['deepLink.takePending'] : [])];
}

/** Remove unsupported capability implementations and imports before writing downstream source. */
function selectSections(source, options) {
  for (const [feature, field] of Object.entries(features)) {
    const begin = `// NSH_FEATURE_${feature}_BEGIN`;
    const end = `// NSH_FEATURE_${feature}_END`;
    if ((source.split(begin).length - 1) !== (source.split(end).length - 1)) {
      throw new Error(`unbalanced ${feature} host asset markers`);
    }
    const expression = new RegExp(`^[ \\t]*${begin}\\r?\\n([\\s\\S]*?)^[ \\t]*${end}\\r?\\n?`, 'gmu');
    source = source.replace(expression, (_, body) => options.profile[field] === 'enabled' ? body : '');
  }
  if (/NSH_FEATURE_[A-Z_]+_(?:BEGIN|END)/u.test(source)) throw new Error('nested or unmatched host asset markers');
  return source;
}

function rustString(value) { return JSON.stringify(value); }

function renderSource(filename, options) {
  const appId = `com.${options.projectId.split('_').map(part => `p${part}`).join('.')}.app`;
  const selected = desktops.filter(target => options.targetPlatforms.includes(target));
  const tokens = {
    '__APP_ID__': rustString(appId),
    '__NAME_ZH__': rustString(options.nameZh),
    '__NAME_EN__': rustString(options.nameEn),
    '__CRATE_IDENT__': `${options.projectId}_nsh`,
    '__SCHEME_PREFIX__': rustString(`app-${options.projectId.replaceAll('_', '-')}://`),
    '__SCHEME__': `app-${options.projectId.replaceAll('_', '-')}`,
    '__HOST_EXE__': `${options.projectId}_nsh_host`,
    '__APP_ID_WIDE__': `w!(${rustString(appId)})`,
    '__WINDOW_CLASS_WIDE__': `w!(${rustString(`${appId}.host`)})`,
    '__INSTANCE_MUTEX_WIDE__': `w!(${rustString(`Local\\${appId}.instance`)})`,
    '__READY_EVENT_WIDE__': `w!(${rustString(`Local\\${appId}.ready`)})`,
    '__PLATFORM_MODULES__': selected.map(target => `#[cfg(target_os = "${target}")]\nmod ${target}_host;`).join('\n'),
    '__PLATFORM_MAINS__': selected.map(target => `#[cfg(target_os = "${target}")]\nfn main() -> Result<(), Box<dyn std::error::Error>> { ${target}_host::run() }`).join('\n\n'),
    '__UNSELECTED_PLATFORM_CFG__': `#[cfg(not(any(${selected.map(target => `target_os = "${target}"`).join(', ')})))]`,
    '__DEEP_LINK_MOD__': options.profile.deep_link === 'enabled' ? 'mod deep_link;' : '',
    '__MAC_AUTOSTART_MOD__': options.profile.autostart === 'enabled' && selected.includes('macos') ? '#[cfg(target_os = "macos")]\nmod macos_autostart;' : '',
    '__LINUX_APP_FLAGS__': options.profile.single_instance === 'enabled'
      ? (options.profile.deep_link === 'enabled' ? 'gio::ApplicationFlags::HANDLES_OPEN' : 'gio::ApplicationFlags::empty()')
      : 'gio::ApplicationFlags::NON_UNIQUE',
    '__AUTOSTART_FILE__': rustString(`${appId}.desktop`),
    '__LOGIN_AGENT_NAME__': rustString(`${appId}.login.plist`),
    '__QUIT_AFTER_LAST_WINDOW__': String(options.profile.system_tray !== 'enabled'),
  };
  let source = selectSections(fs.readFileSync(path.join(assetRoot, filename), 'utf8'), options);
  for (const [token, value] of Object.entries(tokens)) source = source.replaceAll(token, value);
  if (/__[A-Z][A-Z_]+__/u.test(source)) throw new Error(`unresolved host token in ${filename}`);
  return source;
}

/** The returned keys are relative to the downstream workspace root. */
export function renderNshHostFiles(options) {
  assertOptions(options);
  const member = `${options.projectId}_nsh`;
  const files = new Map();
  for (const name of ['main.rs', ...desktops.filter(target => options.targetPlatforms.includes(target)).map(target => `${target}_host.rs`)]) {
    files.set(`${member}/src/${name}`, renderSource(name, options));
  }
  if (options.targetPlatforms.includes('windows')) {
    files.set(`${member}/src/windows_calls.rs`, renderSource('windows_calls.rs', options));
    if (options.profile.system_tray === 'enabled') files.set(`${member}/src/windows_tray.rs`, renderSource('windows_tray.rs', options));
    if (options.profile.single_instance === 'enabled') files.set(`${member}/src/windows_instance.rs`, renderSource('windows_instance.rs', options));
  }
  if (options.profile.deep_link === 'enabled') files.set(`${member}/src/deep_link.rs`, renderSource('deep_link.rs', options));
  if (options.profile.deep_link === 'enabled') {
    for (const target of ['windows', 'linux'].filter(target => options.targetPlatforms.includes(target))) {
      const extension = target === 'windows' ? 'ps1' : 'sh';
      const filename = `register-deeplink-${target}.${extension}`;
      files.set(`${member}/scripts/${filename}`, renderSource(filename, options));
    }
  }
  if (options.profile.autostart === 'enabled') {
    for (const target of desktops.filter(target => options.targetPlatforms.includes(target))) {
      files.set(`${member}/src/${target}_autostart.rs`, renderSource(`${target}_autostart.rs`, options));
    }
  }
  return files;
}

function nsh(name) { return `${name} = { version = "0.4.0", git = "${git}", rev = "${revision}" }`; }

/** Append to the mixed member manifest, after its existing [dependencies]. */
export function nshHostCargoDependencies(options) {
  assertOptions(options);
  const lines = [
    `\n[[bin]]\nname = "${options.projectId}_nsh_host"\npath = "src/main.rs"`,
  ];
  if (options.targetPlatforms.includes('macos')) {
    lines.push('\n[target.\'cfg(target_os = "macos")\'.dependencies]', 'nsh-engine.workspace = true', 'nsh-platform-macos.workspace = true', 'serde_json.workspace = true', 'dispatch2.workspace = true');
    if (options.profile.system_tray === 'enabled') lines.push('objc2-app-kit.workspace = true');
  }
  if (options.targetPlatforms.includes('windows')) {
    lines.push('\n[target.\'cfg(target_os = "windows")\'.dependencies]', 'nsh-engine.workspace = true', 'nsh-platform-windows.workspace = true', 'serde_json.workspace = true', 'windows.workspace = true');
  }
  if (options.targetPlatforms.includes('linux')) {
    lines.push('\n[target.\'cfg(target_os = "linux")\'.dependencies]', 'nsh-engine.workspace = true', 'nsh-platform-linux.workspace = true', 'serde_json.workspace = true');
    if (options.profile.system_tray === 'enabled') lines.push('ksni.workspace = true');
  }
  return lines.join('\n') + '\n';
}

/** Root workspace is the only source of direct dependency versions and features. */
export function nshHostWorkspaceDependencies(options) {
  assertOptions(options);
  const selected = desktops.filter(target => options.targetPlatforms.includes(target));
  const lines = [nsh('nsh-engine'), 'serde_json = "1.0.154"'];
  if (selected.includes('macos')) {
    lines.push(nsh('nsh-platform-macos'), 'dispatch2 = "0.3.1"');
    if (options.profile.system_tray === 'enabled') lines.push('objc2-app-kit = { version = "0.3.2", features = ["NSStatusBar", "NSStatusItem", "NSStatusBarButton"] }');
  }
  if (selected.includes('windows')) {
    lines.push(nsh('nsh-platform-windows'));
    const windowsFeatures = ['Win32_Foundation', 'Win32_Globalization', 'Win32_System_LibraryLoader', 'Win32_System_Ole', 'Win32_UI_HiDpi', 'Win32_UI_WindowsAndMessaging'];
    if (options.profile.system_tray === 'enabled') windowsFeatures.push('Win32_UI_Shell');
    if (options.profile.single_instance === 'enabled') windowsFeatures.push('Win32_System_Threading', 'Win32_Security');
    if (options.profile.deep_link === 'enabled') windowsFeatures.push('Win32_System_DataExchange');
    if (options.profile.autostart === 'enabled') windowsFeatures.push('Win32_System_Registry');
    lines.push(`windows = { version = "0.62.2", features = ${JSON.stringify(windowsFeatures.sort())} }`);
  }
  if (selected.includes('linux')) {
    lines.push(nsh('nsh-platform-linux'));
    if (options.profile.system_tray === 'enabled') lines.push('ksni = { version = "0.3.7", default-features = false, features = ["blocking", "tokio"] }');
  }
  return lines.join('\n');
}
