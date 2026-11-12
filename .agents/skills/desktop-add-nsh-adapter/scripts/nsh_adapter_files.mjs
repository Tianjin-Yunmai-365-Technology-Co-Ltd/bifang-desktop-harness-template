/** Render a neutral NSH Mixed adapter without creating core, Git, or product state. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { renderNshSponsor } from './nsh_support_pages.mjs';
import { NSH_STABLE_REVISION, NSH_TARGETS, nshRevisionForTargets } from './nsh_runtime_revision.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const assetRoot = path.resolve(here, '../assets/gui');
/** Compatibility export for existing stable-only generator checks. */
export const NSH_REVISION = NSH_STABLE_REVISION;
export { NSH_TARGETS, nshRevisionForTargets };
export const NSH_PLATFORMS = ['windows', 'macos', 'linux', 'android', 'ios', 'web'];
export const NSH_UNAVAILABLE = ['system_notification', 'autostart', 'global_shortcut'];
export const PROFILE_FIELDS = ['system_tray', 'system_notification', 'autostart', 'about_page', 'sponsor_page', 'single_instance', 'deep_link', 'global_shortcut', 'sidebar_mode'];
const TARGET_PLATFORMS = { desktop: ['windows', 'macos', 'linux'], mobile: ['android', 'ios'], web: ['web'] };
const NEUTRAL_PROFILE = Object.freeze(Object.fromEntries(PROFILE_FIELDS.map(key => [key, key === 'sidebar_mode' ? 'detailed' : 'disabled'])));

/** Reject unknown fields and unsupported host requests before any output is written. */
export function normalizeNshOptions(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['projectId','nameZh','nameEn','owner','targetPlatforms','nshTargets','profile','logo'].includes(key))) throw new Error('unknown NSH initialization fields');
  if (typeof input.projectId !== 'string' || input.projectId.length > 64 || !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u.test(input.projectId)) throw new Error('invalid projectId');
  for (const key of ['nameZh','nameEn','owner']) if (typeof input[key] !== 'string' || !input[key].trim() || input[key] !== input[key].trim() || input[key].length > 200 || /[\x00-\x1f\x7f]/u.test(input[key]) || (key !== 'owner' && /[\\/:*?"<>|]/u.test(input[key]))) throw new Error('invalid ' + key);
  if (!Array.isArray(input.targetPlatforms) || !input.targetPlatforms.length || new Set(input.targetPlatforms).size !== input.targetPlatforms.length || input.targetPlatforms.some(value => !NSH_PLATFORMS.includes(value))) throw new Error('invalid NSH target platforms');
  nshRevisionForTargets(input.nshTargets);
  const selected = new Set(input.nshTargets);
  const native = input.targetPlatforms.some(platform => TARGET_PLATFORMS.desktop.includes(platform));
  if (native !== (selected.has('desktop') || selected.has('tui'))) throw new Error('NSH desktop/TUI target-platforms mismatch');
  for (const target of ['mobile', 'web']) if (selected.has(target) !== input.targetPlatforms.some(platform => TARGET_PLATFORMS[target].includes(platform))) throw new Error('NSH ' + target + ' target-platforms mismatch');
  if (selected.has('desktop')) {
    if (!input.profile || Array.isArray(input.profile) || typeof input.profile !== 'object' || Object.keys(input.profile).sort().join() !== [...PROFILE_FIELDS].sort().join()) throw new Error('requires exactly nine desktop profile fields');
    for (const key of PROFILE_FIELDS) if (!(key === 'sidebar_mode' ? ['compact','detailed'] : ['enabled','disabled']).includes(input.profile[key])) throw new Error('invalid ' + key);
    for (const key of NSH_UNAVAILABLE) if (input.profile[key] !== 'disabled') throw new Error('NSH desktop capability unavailable: ' + key);
    if (input.profile.deep_link === 'enabled' && input.profile.single_instance !== 'enabled') throw new Error('NSH deep_link requires single_instance');
  } else if (input.profile !== undefined) throw new Error('NSH desktop profile requires desktop target');
  if (input.logo !== undefined) {
    if (!selected.has('desktop')) throw new Error('NSH logo selection requires desktop target');
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
  const mobile = options.nshTargets.includes('mobile');
  const about = desktop && profile.about_page === 'enabled';
  const sponsor = desktop && profile.sponsor_page === 'enabled';
  const tray = desktop && profile.system_tray === 'enabled';
  const deepLink = desktop && profile.deep_link === 'enabled';
  const member = id + '_nsh';
  const files = new Map();
  // Vendored upstream bytes are installed as project skills with the same release as the runtime.
  for (const name of ['nsh', 'nsh-design-guides']) {
    const source = path.resolve(here, '../assets/vendor', name);
    for (const relative of ['SKILL.md', 'LICENSE-APACHE', ...fs.readdirSync(path.join(source, 'references')).sort().map(file => 'references/' + file)]) {
      files.set('.agents/skills/' + name + '/' + relative, fs.readFileSync(path.join(source, relative)));
    }
  }
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
  const omittedLabels = new Set([
    ...(!about ? ['about'] : []),
    ...(!sponsor ? ['sponsor'] : []),
    'start_at_login', 'start_at_login_description', 'enabled', 'disabled', 'unknown', 'refresh', 'autostart_error', 'window_error',
    ...(!deepLink ? ['deep_link_received'] : []),
  ]);
  files.set(member + '/translations.ts', readAsset('translations.ts').split('\n').filter(line => {
    const key = /^\s+([a-z_]+):/u.exec(line)?.[1];
    return !key || !omittedLabels.has(key);
  }).join('\n'));
  files.set(member + '/tokens.ts', readAsset('tokens.ts'));
  files.set(member + '/App.shared.tsx', fill(readAsset('App.shared.tsx'), { '__PROJECT_ID__': id }));
  files.set(member + '/tsconfig.json', readAsset('tsconfig.json'));

  const app = {
    '__PROJECT_ID__': id,
    '__NAME_ZH__': JSON.stringify(nameZh), '__NAME_EN__': JSON.stringify(nameEn),
    '__COMPACT__': String(profile.sidebar_mode === 'compact'),
    '__DESKTOP_IMPORT__': desktop ? 'import { DesktopPanel } from ' + '"./desktop";' : '',
    '__DESKTOP_PANEL__': desktop ? '{nativeDesktop && <DesktopPanel language={language()} title={title()} showControls={page() === "home"} onSettings={() => page.set("settings")} renderWindow={() => <App />} />}' : '',
    '__ABOUT_IMPORT__': about ? 'import { AboutPage } from ' + '"./about";' : '',
    '__ABOUT_NAV__': about ? '{nativeDesktop && <NavAction label={tr(language(), "about")} selected={page() === "about"} rail={rail} onPress={() => page.set("about")} />}' : '',
    '__ABOUT_PAGE__': about ? '{nativeDesktop && page() === "about" && <AboutPage language={language()} />}' : '',
    '__SPONSOR_IMPORT__': sponsor ? 'import { SponsorPage } from ' + '"./sponsor";' : '',
    '__SPONSOR_NAV__': sponsor ? '{nativeDesktop && <NavAction label={tr(language(), "sponsor")} selected={page() === "sponsor"} rail={rail} onPress={() => page.set("sponsor")} />}' : '',
    '__SPONSOR_PAGE__': sponsor ? '{nativeDesktop && page() === "sponsor" && <SponsorPage language={language()} availableWidth={Math.max(0, windowSize().width - (narrow() ? 0 : Number(sidebarWidth())) - (narrow() ? tokens.contentGap : tokens.contentPadding) * 2)} />}' : '',
    '__LOGO_IMPORT__': options.logo ? 'import { Image } from "nsh";\nimport logo from ' + '"./assets/logo.png";' : '',
    '__LOGO_NODE__': options.logo ? '{nativeDesktop && <Image src={logo} accessibilityLabel={title() + " Logo"} style={{ width: tokens.sidebarBrandMark, height: tokens.sidebarBrandMark, borderRadius: tokens.sidebarBrandRadius }} />}' : '',
  };
  files.set(member + '/App.tsx', fill(readAsset('App.tsx'), app));

  let desktopTest = '';
  if (desktop) {
    const scheme = 'app-' + id.replaceAll('_', '-');
    files.set(member + '/desktop.tsx', fill(readAsset('desktop.tsx'), {
      '__DESKTOP_OPTIONAL_IMPORTS__': [
        ...(tray ? ['import { Tray } from "nsh/desktop";', 'import trayIcon from ' + '"./assets/tray.svg";'] : []),
        ...(deepLink ? ['import { signal, UrlScheme } from "nsh";'] : []),
      ].join('\n'),
      '__DESKTOP_CLOSE__': tray ? 'if (win.main) win.hide(); else win.close();' : 'win.close();',
      '__TRAY_SETUP__': tray ? [
        'win.on("closePress", () => win.hide());',
        'effect(() => Tray.set({ icon: trayIcon, tooltip: props.title, onClick: () => win.focus(), menu: [',
        '  { label: tr(props.language, "new_window"), onSelect: openWindow },',
        '  { label: tr(props.language, "show_all"), onSelect: showAll },',
        '  { label: tr(props.language, "quit"), onSelect: quit },',
        '] }));',
      ].join('\n') : '',
      '__DEEP_LINK_SETUP__': deepLink ? [
        'const deepLinkCount = signal(0);',
        'if (win.main) UrlScheme.on("open", ({ url }) => { if (url === ' + JSON.stringify(scheme + '://restore') + ') deepLinkCount.update(count => count + 1); });',
      ].join('\n') : '',
      '__DEEP_LINK_NODE__': deepLink ? '{deepLinkCount() > 0 && <Text style={{ color: palette(colorScheme()).muted }}>{tr(props.language, "deep_link_received")}: {deepLinkCount()}</Text>}' : '',
    }));
    if (tray) files.set(member + '/assets/tray.svg', readAsset('tray.svg'));
    // The official headless API injects startup and runtime URLs without registering an OS handler.
    desktopTest = [
      'test("official desktop window opens and closes through WindowRef", async () => {',
      '  const app = await open(".", { locale: "en-US", platform: "macos" });',
      '  const secondary = app.window("window-1");',
      '  expect(secondary.state()).toBe(null);',
      '  await app.press("New window");',
      '  expect(secondary.state()?.visible).toBe(true);',
      '  await secondary.pressClose();',
      '  expect(secondary.state()).toBe(null);',
      '});',
    ].join('\n');
    if (deepLink) desktopTest += '\n\n' + [
      'test("official URL scheme delivers startup and subsequent links", async () => {',
      '  const app = await open(".", { locale: "en-US", platform: "macos", urlScheme: ' + JSON.stringify(scheme + '://restore') + ' });',
      '  await app.waitFor("Received desktop deep link: 1");',
      '  await app.openWithUrl(' + JSON.stringify(scheme + '://restore') + ');',
      '  await app.waitFor("Received desktop deep link: 2");',
      '});',
    ].join('\n');
  }

  const fixturePlatform = options.targetPlatforms.find(value => ['macos','windows','linux'].includes(value));
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
  const mobileTest = options.nshTargets.includes('mobile') ? [
    'for (const mobilePlatform of ["ios", "android"] as const) {',
    '  test(`${mobilePlatform} bottom navigation switches between home and settings`, async () => {',
    '    const app = await open(".", { locale: "en-US", platform: mobilePlatform });',
    '    await app.press("id:mobile-bottom-nav >> role:button[Settings]");',
    '    await app.waitFor("Appearance");',
    '    await app.press("Dark");',
    '    expect(app.storage().appearance).toBe("dark");',
    '    await app.press("id:mobile-bottom-nav >> role:button[Home]");',
    '    expect(app.texts()).toContain("Neutral workspace initialized. Define the product in this downstream project.");',
    '  });',
    '}',
  ].join('\n') : '';
  files.set(member + '/App.test.tsx', fill(readAsset('App.test.tsx'), { '__MOBILE_TEST__': mobileTest, '__DESKTOP_TEST__': desktopTest, '__SUPPORT_TEST__': supportTest }));

  const shared = path.resolve(here, '../../desktop-prepare-gui-support-surfaces/assets/brand-support');
  const translations = about || sponsor ? Object.fromEntries(['zh-CN','en-US'].map(locale => [locale, JSON.parse(fs.readFileSync(path.join(shared,'i18n',locale + '.json'),'utf8'))])) : {};
  const brand = about || sponsor ? JSON.parse(fs.readFileSync(path.join(shared,'brand-support-profile.json'),'utf8')) : null;
  if (about) {
    const content = locale => ({
      contact: translations[locale].about.contact_author_title,
      owner,
      contactDetail: translations[locale].about.contact_label.replaceAll('{{contact}}', brand.contacts.support.value),
      thanks: translations[locale].about.support_thanks,
      disclaimer: translations[locale].about.disclaimer_title,
      disclaimerItems: [1, 2, 3].map(index => translations[locale].about['disclaimer_' + index]),
      releaseNotes: translations[locale].about.release_notes,
    });
    files.set(member + '/about.tsx', fill(readAsset('about.tsx'), {
      '__PROJECT_ID__': id, '__CONTENT_ZH__': JSON.stringify(content('zh-CN')),
      '__CONTENT_EN__': JSON.stringify(content('en-US')), '__VERSION__': JSON.stringify(version),
    }));
    files.set(member + '/build.rs', readAsset('build.rs'));
  }
  if (sponsor) {
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
    '',
  ].join('\n');
  files.set(member + '/Cargo.toml', manifest);
  const applicationId = 'com.' + id.split('_').map(part => 'p' + part).join('.') + '.app';
  files.set(member + '/nsh.json', JSON.stringify({
    name: nameZh, id: applicationId, version, build: 1, rust: '.', appearance: 'system',
    ...(mobile ? { statusBar: { foreground: 'auto' } } : {}),
    ...(options.logo ? { icon: 'assets/logo.png' } : {}),
    ...(desktop ? { window: { title: nameZh, defaultSize: { width: 1024, height: 700 }, ...(tray ? { closeOnPress: false } : {}) } } : {}),
    ...(desktop && profile.single_instance === 'enabled' ? { singleInstance: true } : {}),
    ...(deepLink ? { schemes: ['app-' + id.replaceAll('_', '-')] } : {}),
    capabilities: {
      ...(mobile ? { statusBar: true } : {}),
      ...(desktop ? { windows: { kinds: ['normal'], levels: ['normal'] } } : {}),
    },
  }, null, 2) + '\n');
  if (desktop) files.set('docs/GUI_APP_PROFILE.md', '# NSH 桌面能力配置\n\n接口事实：根 Cargo metadata 的 nsh；桌面目标由 nsh-targets 声明。身份：' + nameZh + ' / ' + nameEn + '；负责人：' + owner + '。\n\n```gui-initialization-config\n' + PROFILE_FIELDS.map(key => key + ': ' + profile[key]).join('\n') + '\n```\n\n' + (options.logo ? '使用已选择 Logo。' : '中性工程验证夹具，无正式品牌确认。') + ' 多窗口由 NSH 官方运行时提供；托盘、单实例、深链接仅按已选字段接线。自启、系统通知与系统全局快捷键未接入中性模板。未验证平台不得报通过。\n');

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
  const revision = nshRevisionForTargets(options.nshTargets);
  const baseline = ['nsh-core','nsh-base'].map(name => name + ' = { version = "0.5.0", git = "https://github.com/longbridge/nsh.git", rev = "' + revision + '" }').join('\n');
  return baseline;
}

/** Root scripts call only helpers retained by the selected downstream. */
export function nshPackageScripts(id, targets = ['desktop'], platforms = ['macos']) {
  nshRevisionForTargets(targets);
  const desktop = targets.includes('desktop');
  const tui = targets.includes('tui');
  const target = tui ? 'tui' : platforms.includes('web') ? 'web' : platforms.includes('android') ? 'android' : 'ios-simulator';
  return {
    dev: 'nsh run ' + id + '_nsh' + (desktop ? '' : ' --target ' + target),
    ...(tui ? { 'dev:tui': 'nsh run ' + id + '_nsh --target tui', 'nsh:test:tui': 'nsh test ' + id + '_nsh --target tui' + (targets.some(value => value === 'desktop' || value === 'mobile') ? ' --filter "mixed UI reads"' : '') } : {}),
    test: 'cargo test --workspace --all-targets --all-features',
    'nsh:check': 'nsh check ' + id + '_nsh',
    'nsh:test': 'nsh test ' + id + '_nsh',
    ...(targets.some(value => value !== 'tui') ? { 'nsh:package': 'node .agents/skills/desktop-build-nsh-release/scripts/build_nsh_release.mjs --root .' } : {}),
    'release:notes': 'node .agents/skills/desktop-prepare-release/scripts/release_notes.mjs',
    'release:context': 'node .agents/skills/desktop-prepare-release/scripts/release_context.mjs',
    'release:git': 'node .agents/skills/desktop-manage-git-lifecycle/scripts/git_lifecycle.mjs',
  };
}
