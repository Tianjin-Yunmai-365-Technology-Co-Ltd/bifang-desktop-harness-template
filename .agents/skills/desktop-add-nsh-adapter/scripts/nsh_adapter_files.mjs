/** Render a neutral NSH Mixed adapter without creating core, Git, or product state. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { renderNshSponsor } from './nsh_support_pages.mjs';
import { renderNshHostFiles, nshHostCargoDependencies, nshHostMethods, nshHostWorkspaceDependencies } from './nsh_host_files.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const assetRoot = path.resolve(here, '../assets/gui');
export const NSH_REVISION = 'e626a8dd8f8d8b277b9507cfd5ac74d0e67020f3';
export const NSH_PLATFORMS = ['windows', 'macos', 'linux', 'android', 'ios', 'web'];
export const NSH_TARGETS = ['desktop', 'mobile', 'web', 'tui'];
export const NSH_UNAVAILABLE = ['system_notification', 'global_shortcut'];
export const PROFILE_FIELDS = ['system_tray', 'system_notification', 'autostart', 'about_page', 'sponsor_page', 'single_instance', 'deep_link', 'global_shortcut', 'sidebar_mode'];
const TARGET_PLATFORMS = { desktop: ['windows', 'macos', 'linux'], mobile: ['android', 'ios'], web: ['web'] };
const NEUTRAL_PROFILE = Object.freeze(Object.fromEntries(PROFILE_FIELDS.map(key => [key, key === 'sidebar_mode' ? 'detailed' : 'disabled'])));

/** Reject unknown fields and unsupported host requests before any output is written. */
export function normalizeNshOptions(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['projectId','nameZh','nameEn','owner','targetPlatforms','nshTargets','profile','logo'].includes(key))) throw new Error('unknown NSH initialization fields');
  if (typeof input.projectId !== 'string' || input.projectId.length > 64 || !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u.test(input.projectId)) throw new Error('invalid projectId');
  for (const key of ['nameZh','nameEn','owner']) if (typeof input[key] !== 'string' || !input[key].trim() || input[key] !== input[key].trim() || input[key].length > 200 || /[\x00-\x1f\x7f]/u.test(input[key]) || (key !== 'owner' && /[\\/:*?"<>|]/u.test(input[key]))) throw new Error('invalid ' + key);
  if (!Array.isArray(input.targetPlatforms) || !input.targetPlatforms.length || new Set(input.targetPlatforms).size !== input.targetPlatforms.length || input.targetPlatforms.some(value => !NSH_PLATFORMS.includes(value))) throw new Error('invalid NSH target platforms');
  if (!Array.isArray(input.nshTargets) || !input.nshTargets.length || new Set(input.nshTargets).size !== input.nshTargets.length || input.nshTargets.some(value => !NSH_TARGETS.includes(value))) throw new Error('invalid NSH targets');
  if (input.nshTargets.includes('tui')) throw new Error('NSH TUI target unavailable in pinned v0.4.0 runtime');
  const selected = new Set(input.nshTargets);
  for (const [target, platforms] of Object.entries(TARGET_PLATFORMS)) {
    const present = input.targetPlatforms.some(platform => platforms.includes(platform));
    if (selected.has(target) !== present) throw new Error('NSH ' + target + ' target-platforms mismatch');
  }
  if (selected.has('desktop')) {
    if (!input.profile || Array.isArray(input.profile) || typeof input.profile !== 'object' || Object.keys(input.profile).sort().join() !== [...PROFILE_FIELDS].sort().join()) throw new Error('requires exactly nine desktop profile fields');
    for (const key of PROFILE_FIELDS) if (!(key === 'sidebar_mode' ? ['compact','detailed'] : ['enabled','disabled']).includes(input.profile[key])) throw new Error('invalid ' + key);
    for (const key of NSH_UNAVAILABLE) if (input.profile[key] !== 'disabled') throw new Error('NSH desktop capability unavailable: ' + key);
    if (input.profile.deep_link === 'enabled' && input.profile.single_instance !== 'enabled') throw new Error('NSH deep_link requires single_instance');
  } else if (input.profile !== undefined) throw new Error('NSH desktop profile requires desktop target');
  if (input.logo !== undefined) {
    if (!path.isAbsolute(input.logo) || !fs.lstatSync(input.logo).isFile() || fs.lstatSync(input.logo).isSymbolicLink()) throw new Error('logo must be a selected ordinary PNG');
    const bytes = fs.readFileSync(input.logo);
    if (!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.readUInt32BE(16) !== bytes.readUInt32BE(20)) throw new Error('logo must be a square PNG');
  }
  return { ...structuredClone(input), nshTargets: NSH_TARGETS.filter(target => selected.has(target)) };
}

function readAsset(name) { return fs.readFileSync(path.join(assetRoot, name), 'utf8'); }
function fill(source, replacements) {
  for (const [token, value] of Object.entries(replacements)) source = source.replaceAll(token, value);
  if (/__[A-Z][A-Z_]+__/u.test(source)) throw new Error('unresolved NSH template token');
  return source;
}

/** Conditional TSX, native-module, and host assets for one selected interface. */
export function renderNshAdapterFiles(input, version = '0.1.0') {
  const options = normalizeNshOptions(input);
  const { projectId: id, nameZh, nameEn, owner } = options;
  const profile = options.profile ?? NEUTRAL_PROFILE;
  const desktop = options.nshTargets.includes('desktop');
  const about = desktop && profile.about_page === 'enabled';
  const sponsor = desktop && profile.sponsor_page === 'enabled';
  const autostart = desktop && profile.autostart === 'enabled';
  const deepLink = desktop && profile.deep_link === 'enabled';
  const member = id + '_nsh';
  const files = new Map();
  const releaseMethod = about ? [
    '/// Read the bilingual release notes embedded by the paired build script.',
    'pub fn release_notes(chinese: bool) -> String {',
    '    if chinese { include_str!(concat!(env!("OUT_DIR"), "/harness_release_notes_zh.txt")) }',
    '    else { include_str!(concat!(env!("OUT_DIR"), "/harness_release_notes_en.txt")) }.to_owned()',
    '}',
  ].join('\n') : '';
  files.set(member + '/src/lib.rs', fill(readAsset('src/lib.rs'), {
    '__PROJECT_ID__': id, '__RELEASE_NOTES_METHOD__': releaseMethod,
  }));
  files.set(member + '/translations.ts', readAsset('translations.ts').split('\n').filter(line => (about || !/^\s+(?:about):/u.test(line)) && (sponsor || !/^\s+(?:sponsor):/u.test(line))).join('\n'));
  files.set(member + '/tokens.ts', readAsset('tokens.ts'));
  files.set(member + '/tsconfig.json', readAsset('tsconfig.json'));

  const app = {
    '__PROJECT_ID__': id,
    '__NAME_ZH__': JSON.stringify(nameZh), '__NAME_EN__': JSON.stringify(nameEn),
    '__COMPACT__': String(profile.sidebar_mode === 'compact'),
    '__DESKTOP_IMPORT__': desktop ? 'import { DesktopPanel' + (autostart ? ', AutostartSetting' : '') + ' } from ' + '"./desktop";' : '',
    '__DESKTOP_PANEL__': desktop ? '{desktopOnly && <DesktopPanel language={language()} title={title()} showControls={page() === "home"} onSettings={() => page.set("settings")} />}' : '',
    '__AUTOSTART_SETTING__': autostart ? '{desktopOnly && <AutostartSetting language={language()} />}' : '',
    '__ABOUT_IMPORT__': about ? 'import { AboutPage } from ' + '"./about";' : '',
    '__ABOUT_NAV__': about ? '{desktopOnly && <Action label={tr(language(), "about")} selected={page() === "about"} onPress={() => page.set("about")} />}' : '',
    '__ABOUT_PAGE__': about ? '{desktopOnly && page() === "about" && <AboutPage language={language()} />}' : '',
    '__SPONSOR_IMPORT__': sponsor ? 'import { SponsorPage } from ' + '"./sponsor";' : '',
    '__SPONSOR_NAV__': sponsor ? '{desktopOnly && <Action label={tr(language(), "sponsor")} selected={page() === "sponsor"} onPress={() => page.set("sponsor")} />}' : '',
    '__SPONSOR_PAGE__': sponsor ? '{desktopOnly && page() === "sponsor" && <SponsorPage language={language()} />}' : '',
    '__LOGO_IMPORT__': options.logo ? 'import { Image } from "nsh";\nimport logo from ' + '"./assets/logo.png";' : '',
    '__LOGO_NODE__': options.logo ? '{desktopOnly && <Image src={logo} accessibilityLabel={title() + " Logo"} style={{ width: 48, height: 48 }} />}' : '',
  };
  files.set(member + '/App.tsx', fill(readAsset('App.tsx'), app));

  if (desktop) {
    const autostartImpl = autostart ? [
      'export function AutostartSetting(props: { language: Language }) {',
      '  const actual = signal<boolean | null>(null);',
      '  const busy = signal(false);',
      '  const error = signal(false);',
      '  async function refresh() {',
      '    try { actual.set(await host.call<boolean>("autostart.get")); error.set(false); }',
      '    catch { actual.set(null); error.set(true); }',
      '  }',
      '  effect(() => { if (host.available()) void refresh(); });',
      '  async function toggle() {',
      '    if (actual() === null || busy()) return;',
      '    busy.set(true);',
      '    try { await host.call<boolean>("autostart.set", { enabled: !actual() }); await refresh(); }',
      '    catch { actual.set(null); error.set(true); }',
      '    finally { busy.set(false); }',
      '  }',
      '  if (!host.available()) return null;',
      '  return <View style={{ gap: 8 }}>',
      '    <Text style={{ color: palette(colorScheme()).foreground }}>{tr(props.language, "start_at_login")}: {tr(props.language, actual() === null ? "unknown" : actual() ? "enabled" : "disabled")}</Text>',
      '    <Action label={actual() === null ? tr(props.language, "refresh") : tr(props.language, "start_at_login")} onPress={() => { void (actual() === null ? refresh() : toggle()); }} />',
      '    {error() && <Text style={{ color: palette(colorScheme()).error }}>{tr(props.language, "autostart_error")}</Text>}',
      '  </View>;',
      '}',
    ].join('\n') : '';
    const desktopTokens = {
      '__AUTOSTART_IMPL__': autostartImpl,
      '__DEEP_LINK_STATE__': deepLink ? 'const deepLinkCount = signal(0);' : '',
      '__DEEP_LINK_DRAIN__': deepLink ? [
        'let drainingDeepLinks = false;',
        'let drainAgain = false;',
        'async function drainDeepLinks() {',
        '  if (!host.available()) return;',
        '  if (drainingDeepLinks) { drainAgain = true; return; }',
        '  drainingDeepLinks = true;',
        '  try {',
        '    do {',
        '      drainAgain = false;',
        '      const links = await host.call<unknown>("deepLink.takePending");',
        '      if (!Array.isArray(links) || links.some((link) => typeof link !== "string")) throw new Error("Invalid Deep Link queue");',
        '      deepLinkCount.update((count) => count + links.length);',
        '    } while (drainAgain);',
        '  } catch { error.set(tr(props.language, "window_error")); }',
        '  finally { drainingDeepLinks = false; }',
        '}',
      ].join('\n') : '',
      '__DEEP_LINK_INIT__': deepLink ? 'const stopDeepLink = host.on("deepLink.available", () => { void drainDeepLinks(); });\n    void drainDeepLinks();' : '',
      '__DEEP_LINK_CLEANUP__': deepLink ? 'stopDeepLink();' : '',
      '__DEEP_LINK_NODE__': deepLink ? '{deepLinkCount() > 0 && <Text style={{ color: palette(colorScheme()).muted }}>{tr(props.language, "deep_link_received")}: {deepLinkCount()}</Text>}' : '',
    };
    files.set(member + '/desktop.tsx', fill(readAsset('desktop.tsx'), desktopTokens));
    for (const [relative, source] of renderNshHostFiles(options)) {
      if (files.has(relative)) throw new Error('duplicate NSH host file: ' + relative);
      files.set(relative, source);
    }
  }

  const fixturePlatform = options.targetPlatforms.find(value => ['macos','windows','linux'].includes(value));
  const desktopTest = desktop ? [
    'test("desktop controls use the declared host methods", async () => {',
    '  const app = await open(".", { locale: "en-US", platform: ' + JSON.stringify(fixturePlatform) + ', host: { params: { windowId: 1 }, handlers: {',
    '    "window.list": () => [{ id: 1, title: "Main window" }],',
    '    "window.setTitle": () => true,',
    '    "window.open": () => ({ id: 2, title: "Second window" }),',
    '  } } });',
    '  await app.press("New window");',
    '  expect(app.host.calls().filter((call) => call.name === "window.open")).toEqual([{ name: "window.open", data: null }]);',
    '});',
    '',
    'test("second window title stays localized in settings without menu ownership", async () => {',
    '  const app = await open(".", { locale: "en-US", platform: ' + JSON.stringify(fixturePlatform) + ', host: { params: { windowId: 2, menuGlobal: true, menuOwner: false }, handlers: {',
    '    "window.list": () => [{ id: 2, title: "Second window" }],',
    '    "window.setTitle": () => true,',
    '  } } });',
    '  await app.waitFor("Second window");',
    '  await app.press("Settings");',
    '  await app.press("中文");',
    '  await app.waitFor("外观主题");',
    '  expect(app.host.calls().filter((call) => call.name === "window.setTitle")).toEqual([',
    '    { name: "window.setTitle", data: { title: ' + JSON.stringify(nameEn + ' · 2') + ' } },',
    '    { name: "window.setTitle", data: { title: ' + JSON.stringify(nameZh + ' · 2') + ' } },',
    '  ]);',
    '  await app.press("首页");',
    '  await app.waitFor("窗口");',
    '  expect(app.host.calls().filter((call) => call.name === "window.list")).toEqual([{ name: "window.list", data: null }]);',
    '});',
    ...(deepLink ? [
      '',
      'test("queued desktop deep links are claimed once after startup and host notifications", async () => {',
      '  const pending = ["app-' + options.projectId.replaceAll('_', '-') + '://restore"];',
      '  const app = await open(".", { locale: "en-US", platform: ' + JSON.stringify(fixturePlatform) + ', host: { params: { windowId: 1 }, handlers: {',
      '    "window.list": () => [{ id: 1, title: "Main window" }],',
      '    "window.setTitle": () => true,',
      '    "deepLink.takePending": () => pending.splice(0),',
      '  } } });',
      '  await app.waitFor("Received desktop deep link: 1");',
      '  pending.push("app-' + options.projectId.replaceAll('_', '-') + '://restore");',
      '  await app.host.send("deepLink.available", null);',
      '  await app.waitFor("Received desktop deep link: 2");',
      '  await app.host.send("deepLink.available", null);',
      '  expect(app.texts()).toContain("Received desktop deep link: 2");',
      '});',
    ] : []),
  ].join('\n') : '';
  const supportTest = [
    ...(about ? [[
      'test("about page reads embedded release notes from the native module", async () => {',
      '  const app = await open(".", { locale: "en-US", platform: ' + JSON.stringify(fixturePlatform) + ' });',
      '  await app.press("About");',
      '  expect(app.texts().some((value) => value.includes(' + JSON.stringify(owner) + '))).toBe(true);',
      '  await app.press("Release notes");',
      '  await app.waitFor("No published release notes");',
      '});',
    ].join('\n')] : []),
    ...(sponsor ? [[
      'test("sponsor page renders bundled local support content", async () => {',
      '  const app = await open(".", { locale: "en-US", platform: ' + JSON.stringify(fixturePlatform) + ' });',
      '  await app.press("Sponsor");',
      '  expect(app.texts().some((value) => value.startsWith("CNY "))).toBe(true);',
      '});',
    ].join('\n')] : []),
  ].join('\n\n');
  files.set(member + '/App.test.tsx', fill(readAsset('App.test.tsx'), { '__DESKTOP_TEST__': desktopTest, '__SUPPORT_TEST__': supportTest }));

  const shared = path.resolve(here, '../../desktop-prepare-gui-support-surfaces/assets/brand-support');
  const translations = about || sponsor ? Object.fromEntries(['zh-CN','en-US'].map(locale => [locale, JSON.parse(fs.readFileSync(path.join(shared,'i18n',locale + '.json'),'utf8'))])) : {};
  if (about) {
    const content = locale => [translations[locale].about.contact_author_title, owner, 'QQ 2222980', translations[locale].about.support_thanks, translations[locale].about.disclaimer_title, ...[1,2,3].map(index => translations[locale].about['disclaimer_' + index])].join('\n\n');
    files.set(member + '/about.tsx', fill(readAsset('about.tsx'), {
      '__PROJECT_ID__': id, '__CONTENT_ZH__': JSON.stringify(content('zh-CN')),
      '__CONTENT_EN__': JSON.stringify(content('en-US')), '__VERSION__': JSON.stringify(version),
    }));
    files.set(member + '/build.rs', readAsset('build.rs'));
  }
  if (sponsor) {
    const brand = JSON.parse(fs.readFileSync(path.join(shared,'brand-support-profile.json'),'utf8'));
    files.set(member + '/sponsor.tsx', renderNshSponsor(translations, brand));
    for (const name of fs.readdirSync(path.join(shared,'media/sponsor'))) {
      const file = path.join(shared,'media/sponsor',name);
      if (fs.statSync(file).isFile()) files.set(member + '/assets/sponsor/' + name, fs.readFileSync(file));
    }
    files.set(member + '/assets/sponsor-media-manifest.json', fs.readFileSync(path.join(shared,'media-manifest.json')));
  }
  if (options.logo) files.set(member + '/assets/logo.png', fs.readFileSync(options.logo));

  const manifest = [
    '[package]', 'name = "' + member + '"', 'version.workspace = true', 'edition.workspace = true', 'publish = false',
    '', '[lib]', 'crate-type = ["rlib"]', '', '[dependencies]', id + '_core.workspace = true',
    'nsh-core.workspace = true', 'nsh-base.workspace = true',
    ...(desktop ? [nshHostCargoDependencies(options).trimEnd()] : []), '',
  ].join('\n');
  files.set(member + '/Cargo.toml', manifest);
  const applicationId = 'com.' + id.split('_').map(part => 'p' + part).join('.') + '.app';
  files.set(member + '/nsh.json', JSON.stringify({
    name: nameZh, id: applicationId, version, build: 1, rust: '.', appearance: 'system',
    ...(options.logo ? { icon: 'assets/logo.png' } : {}),
    ...(desktop ? { capabilities: { host: nshHostMethods(options) } } : {}),
  }, null, 2) + '\n');
  if (desktop) files.set('docs/GUI_APP_PROFILE.md', '# NSH 桌面能力配置\n\n接口事实：根 Cargo metadata 的 nsh；桌面目标由 nsh-targets 声明。身份：' + nameZh + ' / ' + nameEn + '；负责人：' + owner + '。\n\n```gui-initialization-config\n' + PROFILE_FIELDS.map(key => key + ': ' + profile[key]).join('\n') + '\n```\n\n' + (options.logo ? '使用已选择 Logo。' : '中性工程验证夹具，无正式品牌确认。') + ' 桌面多窗口由自定义宿主固定提供；托盘、单实例、深链接、自启仅按已选字段接线。系统通知与系统全局快捷键仍不可用。未验证平台不得报通过。\n');

  // Format all rendered Rust before the caller can write the workspace.
  for (const [filename, source] of files) {
    if (!filename.endsWith('.rs')) continue;
    const result = spawnSync('rustfmt', ['--edition', '2024', '--emit', 'stdout', '--config', 'skip_children=true'], {
      input: source, encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
    });
    if (result.error || result.status !== 0) throw new Error('Rust toolchain rustfmt failed for ' + filename + ': ' + (result.error?.message ?? result.stderr.slice(-2000)));
    files.set(filename, result.stdout);
  }
  return files;
}

/** Workspace dependencies use the pinned NSH revision, not a local Cargo cache path. */
export function nshDependencies(input) {
  const options = normalizeNshOptions(input);
  const baseline = ['nsh-core','nsh-base'].map(name => name + ' = { version = "0.4.0", git = "https://github.com/longbridge/nsh.git", rev = "' + NSH_REVISION + '" }').join('\n');
  return options.nshTargets.includes('desktop') ? baseline + '\n' + nshHostWorkspaceDependencies(options) : baseline;
}

/** Root scripts call only helpers retained by the selected downstream. */
export function nshPackageScripts(id, targets = ['desktop'], platforms = ['macos']) {
  const desktop = targets.includes('desktop');
  const target = platforms.includes('web') ? 'web' : platforms.includes('android') ? 'android' : 'ios-simulator';
  return {
    dev: desktop ? 'node .agents/skills/desktop-add-nsh-adapter/scripts/run_nsh_desktop.mjs --root .' : 'nsh run ' + id + '_nsh --target ' + target,
    test: 'cargo test --workspace --all-targets --all-features',
    'nsh:check': 'nsh check ' + id + '_nsh',
    'nsh:test': 'nsh test ' + id + '_nsh',
    'nsh:package': 'node .agents/skills/desktop-build-nsh-release/scripts/build_nsh_release.mjs --root .',
    'release:notes': 'node .agents/skills/desktop-prepare-release/scripts/release_notes.mjs',
    'release:context': 'node .agents/skills/desktop-prepare-release/scripts/release_context.mjs',
    'release:git': 'node .agents/skills/desktop-manage-git-lifecycle/scripts/git_lifecycle.mjs',
  };
}
