#!/usr/bin/env node
/** 仅渲染原生 GUI/profile 文件，不具有创建 workspace、core 或 Git 的写入能力。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const assetsRoot = path.resolve(here, '../assets');
const nativeCapabilities = ['systemTray', 'systemNotification', 'autostart', 'singleInstance', 'deepLink', 'globalShortcut'];
const text = {
  'zh-CN': {
    navigation: { settings: '设置', about: '关于', sponsor: '赞助' },
    sidebar: { toggle: '展开或收起侧栏' },
    settings: { application: '应用信息', local_preferences: '外观和语言偏好仅保存在此设备。', appearance: '外观', appearance_detail: '选择浅色、深色，或实时跟随操作系统外观。', light: '浅色', dark: '深色', system: '跟随系统', language: '界面语言', language_detail: '默认探测系统语言，可在此随时切换。', chinese: '中文', english: 'English' },
    about: { application: '关于应用', description: '这是中性桌面脚手架，产品功能尚未定义。', author: '项目负责人', check_updates: '检查更新', release_notes: '更新日志', updater_unavailable: '当前 GPUI 基线未提供更新服务，不会发起网络请求。', no_releases: '当前中性项目尚无发布记录。', local_first: '本地运行', local_first_detail: '设置、语言和静态支持页可离线使用。' },
  },
  'en-US': {
    navigation: { settings: 'Settings', about: 'About', sponsor: 'Sponsor' },
    sidebar: { toggle: 'Expand or collapse sidebar' },
    settings: { application: 'Application', local_preferences: 'Appearance and language preferences are stored on this device.', appearance: 'Appearance', appearance_detail: 'Choose light, dark, or follow changes to the operating system appearance.', light: 'Light', dark: 'Dark', system: 'Follow system', language: 'Interface language', language_detail: 'Detect the system language by default, or choose a language here.', chinese: '中文', english: 'English' },
    about: { application: 'About this application', description: 'This is a neutral desktop scaffold. Product features have not been defined.', author: 'Project owner', check_updates: 'Check for updates', release_notes: 'Release notes', updater_unavailable: 'The current GPUI baseline has no update service and makes no network request.', no_releases: 'This neutral project has no published releases.', local_first: 'Runs locally', local_first_detail: 'Settings, languages and static support pages work offline.' },
  },
};

/** 所有路径组件必须是普通目录或文件，拒绝符号链接穿透。 */
export function assertRealPath(value, allowMissing = false) {
  const absolute = path.resolve(value);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const segment of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let metadata;
    try { metadata = fs.lstatSync(current); } catch (error) {
      if (allowMissing && error.code === 'ENOENT') return;
      throw error;
    }
    if (metadata.isSymbolicLink()) throw new Error(`symbolic links are not allowed: ${current}`);
    if (current !== absolute && !metadata.isDirectory()) throw new Error(`ancestor must be a directory: ${current}`);
  }
}

/** 输入严格绑定双语身份、支持页与六项尚不可用的原生能力边界。 */
export function normalizeOptions(options) {
  const result = { aboutPage: 'enabled', sponsorPage: 'enabled', sidebarMode: 'detailed', targetPlatforms: ['macos'], ...options };
  if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(result.projectId ?? '') || result.projectId.length > 64) {
    throw new Error('projectId must be an ASCII snake_case Rust identifier of at most 64 characters');
  }
  for (const key of ['nameZh', 'nameEn', 'owner']) {
    if (typeof result[key] !== 'string' || !result[key].isWellFormed() || !result[key].trim() || result[key] !== result[key].trim() || /[\x00-\x1f\x7f]/.test(result[key]) || result[key].length > 200) {
      throw new Error(`${key} must be nonempty single-line text of at most 200 characters`);
    }
  }
  for (const key of ['aboutPage', 'sponsorPage']) {
    if (!['enabled', 'disabled'].includes(result[key])) throw new Error(`${key} must be enabled or disabled`);
  }
  if (!['compact', 'detailed'].includes(result.sidebarMode)) throw new Error('sidebarMode must be compact or detailed');
  for (const key of nativeCapabilities) {
    if (result[key] !== undefined && result[key] !== 'disabled') throw new Error(`${key} is unavailable in the GPUI baseline; only disabled is supported`);
    result[key] = 'disabled';
  }
  if (!Array.isArray(result.targetPlatforms) || !result.targetPlatforms.length || result.targetPlatforms.some(value => !['macos', 'windows', 'linux'].includes(value)) || new Set(result.targetPlatforms).size !== result.targetPlatforms.length) {
    throw new Error('targetPlatforms must contain distinct macos, windows or linux values');
  }
  if (result.logo !== undefined) {
    if (!path.isAbsolute(result.logo)) throw new Error('logo must be an absolute PNG path');
    assertRealPath(result.logo);
    const metadata = fs.lstatSync(result.logo);
    if (!metadata.isFile() || metadata.size < 33 || metadata.size > 8 * 1024 * 1024) throw new Error('logo must be a bounded regular PNG file');
    const logo = fs.readFileSync(result.logo);
    if (!logo.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('logo must have a PNG signature');
    result.logoBytes = logo;
  }
  return result;
}

/** JSON 与 Rust 的基本字符串转义在已排除控制字符后保持相同。 */
function rustText(value) { return JSON.stringify(value).slice(1, -1); }

/** 读取模板时同样拒绝损坏链接，不允许插值遗漏进入生成源码。 */
function template(file, tokens) {
  const source = path.join(assetsRoot, file);
  assertRealPath(source);
  const value = fs.readFileSync(source, 'utf8');
  return value.replace(/@@([A-Z_]+)@@/g, (_, key) => {
    if (!Object.hasOwn(tokens, key)) throw new Error(`unresolved template token ${key} in ${file}`);
    return tokens[key];
  });
}

/** 生成全部文件供初始化器组合使用；不读取或修改目标工程。 */
export function renderGpuiAdapterFiles(input) {
  const options = normalizeOptions(input);
  const { projectId, nameZh, nameEn, owner } = options;
  const about = options.aboutPage === 'enabled';
  const sponsor = options.sponsorPage === 'enabled';
  const compact = options.sidebarMode === 'compact';
  const profile = JSON.parse(fs.readFileSync(path.join(assetsRoot, 'brand-support/brand-support-profile.json'), 'utf8'));
  const contact = profile.contacts.windowTitle;
  const logoExtension = options.logoBytes ? 'png' : 'svg';
  const manifest = JSON.parse(fs.readFileSync(path.join(assetsRoot, 'brand-support/media-manifest.json'), 'utf8'));
  const media = sponsor ? manifest.assets : [];
  const tokens = {
    CORE_PROBE: options.neutralCoreProbe ? `        let _definition = ${projectId}_core::product_definition();` : `        use ${projectId}_core as _;`,
    PROJECT_ID: projectId, KEBAB_ID: projectId.replaceAll('_', '-'), NAME_ZH: rustText(nameZh), NAME_EN: rustText(nameEn), OWNER: rustText(owner),
    LOGO_EXT: logoExtension, COMPACT: String(compact), CONTACT_TITLE: ` ${rustText(contact.channel)}:${rustText(contact.value)}`, BRAND_CONTACT: rustText(profile.contacts.support.value),
    ABOUT_MODULE: about ? 'mod about;' : '', SPONSOR_MODULE: sponsor ? 'mod sponsor;' : '',
    ABOUT_VARIANT: about ? '    About,' : '', SPONSOR_VARIANT: sponsor ? '    Sponsor,' : '',
    ABOUT_FIELDS: about ? '    show_update_status: bool,\n    show_release_notes: bool,' : '', ABOUT_DEFAULTS: about ? '            show_update_status: false, show_release_notes: false,' : '',
    ABOUT_TITLE: about ? '            Page::About => "navigation.about",' : '', SPONSOR_TITLE: sponsor ? '            Page::Sponsor => "navigation.sponsor",' : '',
    ABOUT_RENDER: about ? '            Page::About => self.about_page(cx),' : '', SPONSOR_RENDER: sponsor ? '            Page::Sponsor => self.sponsor_page(window, cx),' : '',
    ABOUT_NAV: about ? '        sidebar = sidebar.child(self.navigation_item(Page::About, "nav-about", "navigation.about", IconName::Info, cx));' : '',
    SPONSOR_NAV: sponsor ? '        sidebar = sidebar.child(self.navigation_item(Page::Sponsor, "nav-sponsor", "navigation.sponsor", IconName::Heart, cx));' : '',
    COLLAPSE_CONTROL: compact ? '' : `        sidebar = sidebar.child(Button::new("sidebar-toggle").ghost().icon(IconName::PanelLeft).tooltip(self.t("sidebar.toggle")).accessibility_label(self.t("sidebar.toggle"))
            .on_click(cx.listener(|this, _, _, cx| { this.preferences.collapsed = !this.preferences.collapsed; this.writer.save(&this.preferences); cx.notify(); })));`,
    SPONSOR_ASSETS_LOAD: media.map(asset => `        if path == ${JSON.stringify(asset.bundlePath)} { return Ok(Some(Cow::Borrowed(include_bytes!(${JSON.stringify('../assets/' + asset.bundlePath)})))); }`).join('\n'),
    SPONSOR_ASSETS_LIST: media.length ? `        paths.extend([${media.map(asset => JSON.stringify(asset.bundlePath)).join(', ')}].into_iter().filter(|path| path.starts_with(prefix)).map(SharedString::from));` : '',
    SPONSOR_TIERS: profile.sponsor.tiers.map(tier => `                .child(self.sponsor_tier(${JSON.stringify(tier.nameKey)}, ${tier.price}, ${JSON.stringify(tier.image)}, &[${tier.benefits.map(benefit => `(${JSON.stringify(benefit.mainKey)}, ${benefit.noteKey ? `Some(${JSON.stringify(benefit.noteKey)})` : 'None'})`).join(', ')}], cx))`).join('\n'),
  };
  const files = new Map();
  files.set(`${projectId}_gui/Cargo.toml`, `[package]\nname = "${projectId}_gui"\nversion.workspace = true\nedition.workspace = true\nrust-version.workspace = true\n\n[dependencies]\n${projectId}_core.workspace = true\ngpui-kit.workspace = true\nrust-i18n.workspace = true\nsys-locale.workspace = true\n`);
  for (const file of ['main.rs', 'assets.rs', 'preferences.rs', 'app/mod.rs', 'app/settings.rs', ...(about ? ['app/about.rs'] : []), ...(sponsor ? ['app/sponsor.rs'] : [])]) {
    files.set(`${projectId}_gui/src/${file}`, template(`gui/src/${file}`, tokens));
  }
  files.set(`${projectId}_gui/assets/logo.${logoExtension}`, options.logoBytes ?? fs.readFileSync(path.join(assetsRoot, 'gui/assets/logo.svg')));
  for (const locale of ['zh-CN', 'en-US']) {
    const localized = structuredClone(text[locale]);
    localized.application = { name: locale === 'zh-CN' ? nameZh : nameEn };
    const brand = JSON.parse(fs.readFileSync(path.join(assetsRoot, `brand-support/i18n/${locale}.json`), 'utf8'));
    if (about) localized.about = { ...brand.about, ...localized.about };
    else { delete localized.about; delete localized.navigation.about; }
    if (sponsor) localized.sponsor = brand.sponsor;
    else delete localized.navigation.sponsor;
    if (compact) delete localized.sidebar;
    files.set(`${projectId}_gui/locales/${locale}.json`, JSON.stringify(localized, null, 2) + '\n');
  }
  for (const asset of media) {
    const file = path.join(assetsRoot, 'brand-support', asset.sourcePath);
    assertRealPath(file);
    const bytes = fs.readFileSync(file);
    if (bytes.length !== asset.sizeBytes || crypto.createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error(`managed sponsor asset changed: ${asset.sourcePath}`);
    files.set(`${projectId}_gui/assets/${asset.bundlePath}`, bytes);
  }
  files.set('docs/GUI_APP_PROFILE.md', `# GUI 应用资料\n\n- 中文名称：${nameZh}\n- English name: ${nameEn}\n- GUI framework: gpui\n- owner: ${owner}\n- Logo: ${options.logoBytes ? 'caller-selected PNG; upstream identity evidence remains required' : 'neutral engineering fixture; not a confirmed product identity'}\n- unavailable native capabilities: system_tray, system_notification, autostart, single_instance, deep_link, global_shortcut\n\n\`\`\`gui-initialization-config\nsystem_tray: disabled\nsystem_notification: disabled\nautostart: disabled\nabout_page: ${options.aboutPage}\nsponsor_page: ${options.sponsorPage}\nsingle_instance: disabled\ndeep_link: disabled\nglobal_shortcut: disabled\nsidebar_mode: ${options.sidebarMode}\n\`\`\`\n`);
  files.set(`${projectId}_gui/assets/SOURCE.md`, `# 本地资源来源\n\n应用 Logo 来自${options.logoBytes ? '调用方明确选择的 PNG；正式身份核对由初始化器负责' : '本 Skill 自绘中性工程夹具，不代表正式产品身份'}。\n\n${sponsor ? 'sponsor/* 逐字节复用 Harness desktop-prepare-gui-support-surfaces 的受管品牌资产；批准范围、尺寸、SHA-256、敏感支付材料分类及许可责任见 sponsor-media-manifest.json。支付二维码仅静态展示，不授权支付自动化或公开再许可。' : '赞助页未选择，没有赞助媒体或支付材料。'}\n`);
  if (sponsor) files.set(`${projectId}_gui/assets/sponsor-media-manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
  return files;
}
