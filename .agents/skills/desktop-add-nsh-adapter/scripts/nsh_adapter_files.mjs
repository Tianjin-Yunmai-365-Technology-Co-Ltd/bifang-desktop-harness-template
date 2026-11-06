/** NSH 适配器纯渲染；不得创建 core、Git、策略或发布事实。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderNshSponsor } from './nsh_support_pages.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const NSH_REVISION = 'e626a8dd8f8d8b277b9507cfd5ac74d0e67020f3';
export const NSH_PLATFORMS = ['windows', 'macos', 'linux', 'android', 'ios', 'web'];
export const NSH_UNAVAILABLE = ['system_tray', 'system_notification', 'autostart', 'single_instance', 'deep_link', 'global_shortcut'];
export const PROFILE_FIELDS = ['system_tray', 'system_notification', 'autostart', 'about_page', 'sponsor_page', 'single_instance', 'deep_link', 'global_shortcut', 'sidebar_mode'];

/** 严格接受确认字段，未知数据不能流入模板。 */
export function normalizeNshOptions(input) {
  if (!input || typeof input !== 'object' || Object.keys(input).some(key => !['projectId','nameZh','nameEn','owner','targetPlatforms','profile','logo'].includes(key))) throw new Error('unknown NSH initialization fields');
  if (typeof input.projectId !== 'string' || input.projectId.length > 64 || !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u.test(input.projectId)) throw new Error('invalid projectId');
  for (const key of ['nameZh','nameEn','owner']) if (typeof input[key] !== 'string' || !input[key].trim() || input[key] !== input[key].trim() || input[key].length > 200 || /[\x00-\x1f\x7f]/u.test(input[key]) || (key !== 'owner' && /[\\/:*?"<>|]/u.test(input[key]))) throw new Error(`invalid ${key}`);
  if (!Array.isArray(input.targetPlatforms) || !input.targetPlatforms.length || new Set(input.targetPlatforms).size !== input.targetPlatforms.length || input.targetPlatforms.some(value => !NSH_PLATFORMS.includes(value))) throw new Error('invalid NSH target platforms');
  if (!input.profile || Object.keys(input.profile).sort().join() !== [...PROFILE_FIELDS].sort().join()) throw new Error('requires exactly nine GUI profile fields');
  for (const key of PROFILE_FIELDS) if (!(key === 'sidebar_mode' ? ['compact','detailed'] : ['enabled','disabled']).includes(input.profile[key])) throw new Error(`invalid ${key}`);
  for (const key of NSH_UNAVAILABLE) if (input.profile[key] !== 'disabled') throw new Error(`NSH capability unavailable: ${key}`);
  if (input.logo !== undefined) {
    if (!path.isAbsolute(input.logo) || !fs.lstatSync(input.logo).isFile() || fs.lstatSync(input.logo).isSymbolicLink()) throw new Error('logo must be a selected ordinary PNG');
    const bytes = fs.readFileSync(input.logo);
    if (!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.readUInt32BE(16) !== bytes.readUInt32BE(20)) throw new Error('logo must be a square PNG');
  }
  return structuredClone(input);
}

/** 源码模板中仅替换明确词元，用户文本采用 Rust/JSON 字符串转义。 */
export function renderNshAdapterFiles(input, version = '0.1.0') {
  const options = normalizeNshOptions(input);
  const { projectId: id, profile, nameZh, nameEn, owner } = options;
  const gui = `${id}_gui`;
  const files = new Map();
  const assetRoot = path.resolve(here, '../assets/gui/src');
  for (const name of ['lib.rs','tokens.rs','translations.rs']) files.set(`${gui}/src/${name}`, fs.readFileSync(path.join(assetRoot,name),'utf8'));
  const enabledAbout = profile.about_page === 'enabled';
  const enabledSponsor = profile.sponsor_page === 'enabled';
  files.set(`${gui}/src/translations.rs`, files.get(`${gui}/src/translations.rs`).split('\n').filter(line => (enabledAbout || !line.includes('"about"')) && (enabledSponsor || !line.includes('"sponsor"'))).join('\n'));
  const shared = path.resolve(here, '../../desktop-prepare-gui-support-surfaces/assets/brand-support');
  const menus = key => `.child(button().style_with(tokens::button_style).hover(tokens::hover_style).active(tokens::active_style).on_press(move || page.set(${key === 'about' ? 2 : 3})).child(text(move || tr(chinese(), "${key}"))))`;
  const replacements = {
    '__PROJECT_ID__': id, '__NAME_ZH__': JSON.stringify(nameZh), '__NAME_EN__': JSON.stringify(nameEn),
    '__COMPACT__': String(profile.sidebar_mode === 'compact'),
    '__OPTIONAL_MODULES__': [enabledAbout && 'mod about;', enabledSponsor && 'mod sponsor;'].filter(Boolean).join('\n'),
    '__LOGO__': options.logo ? '.child(image(asset!("logo.png")).w(px(48.0)).h(px(48.0)))' : '',
    '__ABOUT_MENU__': enabledAbout ? menus('about') : '', '__SPONSOR_MENU__': enabledSponsor ? menus('sponsor') : '',
    '__ABOUT_PAGE__': enabledAbout ? '.child(when(move || page.get() == 2, move || about::page(chinese())))' : '',
    '__SPONSOR_PAGE__': enabledSponsor ? '.child(when(move || page.get() == 3, move || sponsor::page(chinese())))' : '',
  };
  let source = files.get(`${gui}/src/lib.rs`);
  for (const [key,value] of Object.entries(replacements)) source = source.replaceAll(key,value);
  files.set(`${gui}/src/lib.rs`,source);
  // 条件支持页复用封闭品牌文案；未选页面不复制资源或模块。
  const translations = enabledAbout || enabledSponsor ? Object.fromEntries(['zh-CN','en-US'].map(locale => [locale, JSON.parse(fs.readFileSync(path.join(shared,'i18n',`${locale}.json`),'utf8'))])) : {};
  if (enabledAbout) {
    const content = locale => [translations[locale].about.contact_author_title, owner, 'QQ 2222980', translations[locale].about.support_thanks, translations[locale].about.disclaimer_title, ...[1,2,3].map(index => translations[locale].about[`disclaimer_${index}`])].join('\n\n');
    files.set(`${gui}/src/about.rs`, fs.readFileSync(path.join(assetRoot,'about.rs'),'utf8').replaceAll('__CONTENT_ZH__',JSON.stringify(content('zh-CN'))).replaceAll('__CONTENT_EN__',JSON.stringify(content('en-US'))));
  }
  if (enabledSponsor) {
    files.set(`${gui}/src/sponsor.rs`, renderNshSponsor(translations, JSON.parse(fs.readFileSync(path.join(shared,'brand-support-profile.json'),'utf8'))));
    for (const name of fs.readdirSync(path.join(shared,'media/sponsor'))) {
      const file = path.join(shared,'media/sponsor',name);
      if (fs.statSync(file).isFile()) files.set(`${gui}/assets/sponsor/${name}`,fs.readFileSync(file));
    }
    files.set(`${gui}/assets/sponsor-media-manifest.json`,fs.readFileSync(path.join(shared,'media-manifest.json')));
  }
  if (options.logo) files.set(`${gui}/assets/logo.png`,fs.readFileSync(options.logo));
  files.set(`${gui}/Cargo.toml`, `[package]\nname = "${gui}"\nversion.workspace = true\nedition.workspace = true\npublish = false\n\n[lib]\ncrate-type = ["rlib"]\n\n[dependencies]\n${id}_core.workspace = true\nnsh-core.workspace = true\nnsh-base.workspace = true\n`);
  // 每段前缀保证数字分段也符合 Android/Apple 标识约束，并保留 snake_case 唯一性。
  const applicationId = `com.${id.split('_').map(part => `p${part}`).join('.')}.app`;
  files.set(`${gui}/nsh.json`, JSON.stringify({name:nameZh,id:applicationId,version,build:1,rust:'.',root:'App',appearance:'system',...(options.logo ? {icon:'assets/logo.png'} : {})},null,2)+'\n');
  files.set(`${gui}/App.test.tsx`, `import { expect, open, test } from "nsh/test";\n\ntest("settings language and pages", async () => {\n const app = await open(".");\n const settings = app.texts().includes("设置") ? "设置" : "Settings";\n await app.press(settings);\n await app.press("English");\n expect(app.texts()).toContain("Appearance");\n await app.press("Dark");\n await app.press("Light");\n await app.press("System");\n await app.press("Home");\n expect(app.texts()).toContain(${JSON.stringify(nameEn)});\n ${enabledAbout ? 'await app.press("About"); expect(app.texts().some(text => text.includes("QQ 2222980"))).toBe(true);' : 'expect(app.texts()).not.toContain("About");'}\n ${enabledSponsor ? 'await app.press("Sponsor");' : 'expect(app.texts()).not.toContain("Sponsor");'}\n});\n\ntest("narrow viewport keeps settings reachable", async () => {\n const app = await open(".", { width: 390, height: 844 });\n await app.press(app.texts().includes("设置") ? "设置" : "Settings");\n await app.press("English");\n expect(app.texts()).toContain("Appearance");\n await app.setViewport(1200, 800);\n expect(app.texts()).toContain("Appearance");\n});\n`);
  files.set('docs/GUI_APP_PROFILE.md', `# GUI App Profile\n\n框架事实：根 Cargo metadata 的 nsh。身份：${nameZh} / ${nameEn}；负责人：${owner}。\n\n\`\`\`gui-initialization-config\n${PROFILE_FIELDS.map(key => `${key}: ${profile[key]}`).join('\n')}\n\`\`\`\n\n${options.logo ? '使用已选择 Logo。' : '中性工程验证夹具，无正式品牌确认。'} 六项宿主能力 unavailable/disabled，原生窗口由当前宿主管理；未验证平台不得报通过。\n`);
  return files;
}

/** 工作区依赖使用官方版本对应 revision，避免移动源码缺失。 */
export function nshDependencies() {
  return ['nsh-core','nsh-base'].map(name => `${name} = { version = "0.4.0", git = "https://github.com/longbridge/nsh.git", rev = "${NSH_REVISION}" }`).join('\n');
}

/** 根工程脚本只调用保留的项目 helper。 */
export function nshPackageScripts(id) {
  return { dev:`nsh run ${id}_gui`, test:`cargo test --workspace --all-targets --all-features`, 'nsh:check':`nsh check ${id}_gui`, 'nsh:test':`nsh test ${id}_gui`, 'nsh:package':'node .agents/skills/desktop-build-nsh-release/scripts/build_nsh_release.mjs --root .', 'release:notes':'node .agents/skills/desktop-prepare-release/scripts/release_notes.mjs', 'release:context':'node .agents/skills/desktop-prepare-release/scripts/release_context.mjs', 'release:git':'node .agents/skills/desktop-manage-git-lifecycle/scripts/git_lifecycle.mjs' };
}
