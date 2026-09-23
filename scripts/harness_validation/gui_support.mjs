import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { ROOT, SKILLS_ROOT, fail, relativePath } from "./core.mjs";
import {
  validateBrandMediaManifest,
  validateBrandProfile,
  validateBrandTranslations,
} from "./gui_support_assets.mjs";

const supportRoot = path.join(SKILLS_ROOT, "desktop-prepare-gui-support-surfaces");
export const GUI_SUPPORT_SKILL = path.join(supportRoot, "SKILL.md");
export const GUI_SUPPORT_REFERENCE = path.join(supportRoot, "references", "gui-support-surfaces.md");
export const GUI_SUPPORT_PAGES_REFERENCE = path.join(supportRoot, "references", "about-and-sponsor-pages.md");
export const GUI_SUPPORT_UPDATE_REFERENCE = path.join(supportRoot, "references", "update-and-telemetry.md");
export const GUI_SUPPORT_METADATA = path.join(supportRoot, "agents", "openai.yaml");
export const GUI_SUPPORT_BRAND_ROOT = path.join(supportRoot, "assets", "brand-support");

const FIXED_REMOTE_URI = /\b(?:https?|wss?):\/\/[^\s<>()]+/iu;

function display(filePath) {
  return relativePath(filePath);
}

function hasNonAsciiRawByteString(source) {
  const identifierCharacter = (character) => character === "_" || /[\p{L}\p{N}]/u.test(character);
  const skipQuoted = (start, quote) => {
    let index = start + 1;
    let escaped = false;
    while (index < source.length) {
      const character = source[index++];
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) break;
    }
    return index;
  };
  let index = 0;
  while (index < source.length) {
    if (source.startsWith("//", index)) {
      const newline = source.indexOf("\n", index + 2);
      index = newline < 0 ? source.length : newline + 1;
      continue;
    }
    if (source.startsWith("/*", index)) {
      let depth = 1;
      index += 2;
      while (index < source.length && depth > 0) {
        if (source.startsWith("/*", index)) {
          depth += 1;
          index += 2;
        } else if (source.startsWith("*/", index)) {
          depth -= 1;
          index += 2;
        } else index += 1;
      }
      continue;
    }
    const boundary = index === 0 || !identifierCharacter(source[index - 1]);
    if (boundary && source.startsWith("br", index)) {
      let marker = index + 2;
      while (marker < source.length && source[marker] === "#") marker += 1;
      if (marker < source.length && source[marker] === '"') {
        const terminator = `"${"#".repeat(marker - index - 2)}`;
        const contentStart = marker + 1;
        const found = source.indexOf(terminator, contentStart);
        const contentEnd = found < 0 ? source.length : found;
        if ([...source.slice(contentStart, contentEnd)].some((character) => character.codePointAt(0) > 0x7f)) return true;
        index = found < 0 ? source.length : found + terminator.length;
        continue;
      }
    }
    if (boundary && source.startsWith("r", index)) {
      let marker = index + 1;
      while (marker < source.length && source[marker] === "#") marker += 1;
      if (marker < source.length && source[marker] === '"') {
        const terminator = `"${"#".repeat(marker - index - 1)}`;
        const found = source.indexOf(terminator, marker + 1);
        index = found < 0 ? source.length : found + terminator.length;
        continue;
      }
    }
    if (source[index] === '"') {
      index = skipQuoted(index, '"');
      continue;
    }
    index += 1;
  }
  return false;
}

function readContractText(errors, filePath) {
  let stat;
  try {
    stat = fs.lstatSync(filePath);
  } catch {
    fail(errors, `missing or unsafe GUI support contract file: ${display(filePath)}`);
    return null;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail(errors, `missing or unsafe GUI support contract file: ${display(filePath)}`);
    return null;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(fs.readFileSync(filePath));
  } catch (error) {
    fail(errors, `cannot read GUI support contract ${display(filePath)}: ${error.message}`);
    return null;
  }
}

function readContractJson(errors, filePath) {
  const text = readContractText(errors, filePath);
  if (text === null) return null;
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    fail(errors, `invalid GUI support JSON in ${display(filePath)}: ${error.message}`);
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(errors, `GUI support JSON root must be an object: ${display(filePath)}`);
    return null;
  }
  return value;
}

const REACT_REQUIRED = {
  "AboutPageTemplate.tsx": [
    "productName: string", "version: string", "BRAND_SUPPORT_PROFILE.contacts.support", 't("about.disclaimer_title")',
    't("about.disclaimer_1")', 't("about.disclaimer_2")', 't("about.disclaimer_3")', 't("about.check_for_updates")',
    't("about.release_notes")', 'update.status === "not-configured"', 'data-testid="about-update-section"',
    "releaseNotesLoader = loadBundledReleaseNotes", "requestReleaseNotes", "openReleaseNotes", "ReleaseNotesDialogTemplate",
    "releaseNotesLoader?: () => Promise<readonly LocalizedReleaseNoteEntry[]>", "RELEASE_NOTES_LOAD_TIMEOUT_MS",
    "releaseNotesStatusRef", "hasAvailableUpdate && update.availableVersion", "status={releaseNotesStatus}", "actions ?",
  ],
  "ReleaseNotesDialogTemplate.tsx": [
    "selectVisibleReleaseNotes", "resolveReleaseNotesLocale", "i18n.resolvedLanguage", 'status === "idle" || status === "loading"',
    'status === "error"', 't("release_notes.load_failed")', 't("release_notes.retry")', "onRetry",
    "formatDisplayVersion(release.version)", 't("release_notes.entry_title"', 't("release_notes.feature_optimizations")',
    't("release_notes.bug_fixes")', 'from "react-markdown"', 'from "remark-gfm"', "Typography",
    "allowedElements={RELEASE_NOTE_MARKDOWN_ELEMENTS}", "skipHtml", "a: ({ children }) => <>{children}</>", "img: ({ alt }) => <>{alt}</>",
  ],
  "releaseNotes.ts": ["MAX_VISIBLE_RELEASE_NOTE_VERSIONS = 5", "MAX_VISIBLE_RELEASE_NOTE_ITEMS = 10", 'ReleaseNotesLocale = "zh-CN" | "en-US"', "item[locale]", "releases.slice(0, MAX_VISIBLE_RELEASE_NOTE_VERSIONS)"],
  "releaseNotesResource.ts": ['from "@tauri-apps/api/core"', 'LOAD_RELEASE_NOTES_COMMAND = "load_release_notes"', "invoke<unknown>(command)", "decodeReleaseNotesDocument", "loadBundledReleaseNotes", "value.releases.length > MAX_VISIBLE_RELEASE_NOTE_VERSIONS", "value.length > MAX_VISIBLE_RELEASE_NOTE_ITEMS", "value.schemaVersion !== 2", "hasExactKeys(item, RELEASE_NOTES_LOCALES)"],
  "ReleaseNotesResource.test.ts": ["loads the packaged document through the narrow Tauri command", "rejects malformed or unbounded IPC documents", "rejects releases that are not ordered newest first", "缺少英文翻译", "LOAD_RELEASE_NOTES_COMMAND"],
  "displayVersion.ts": ["formatDisplayVersion", 'replace(/^[vV]+/, "")', "return `v${normalized}`"],
  "pageSessionState.ts": ['from "jotai"', "createPageSessionState", "const stateAtom = atom(normalizedInitialState)", "setSelectionAtom", "query: selection.query,\n        page: 1,", "setPaginationAtom", "page: pageSize === current.pageSize ? page : 1", "reconcilePageAfterResultAtom", 'result.status !== "success"', "current.page === 1", "set(stateAtom, { ...current, page: 1 })", "Object.freeze"],
  "PageSessionState.test.ts": ['from "jotai/vanilla"', "keeps tabs queries and pagination when a route unmounts and remounts", "resets to page one when the page size changes", "resets to page one when the tab or query scope changes", "falls back to page one only after a successful empty page result", "does not treat loading errors or an empty first page as a stale page", "starts from defaults in a new application store"],
  "SponsorPageTemplate.tsx": ["cols={{ base: 1, sm: 2, lg: 3 }}", "BRAND_SUPPORT_PROFILE", "profile.sponsor.payments.map", "SupportMedia", "useComputedColorScheme", "sponsorBackgroundImage(colorScheme, background)", 'data-color-scheme={colorScheme}'],
  "SupportMedia.tsx": ["controls", 'kind="captions"', "transcriptHref", "requireLocalPath"],
  "BrandUpdaterBanner.tsx": ["resolveBrandAssetPath", "BRAND_SUPPORT_PROFILE.updater.banner", "不启用更新检查"],
  "brandSupportProfile.ts": ["formatBrandWindowTitle", "formatDisplayVersion(version)", "BRAND_SUPPORT_PROFILE.contacts.windowTitle", "isLocalSupportPath", "resolveBrandAssetPath", 'value.includes("://")'],
  "supportNavigation.ts": ["SupportPageSelection", "AVAILABLE_SUPPORT_NAVIGATION_ITEMS", "buildSupportNavigationItems", "selection.sponsorPage", "selection.aboutPage", 'to: "/settings"', 'to: "/about"', 'to: "/sponsor"', 'labelKey: "navigation.settings"', 'labelKey: "navigation.about"', 'labelKey: "navigation.sponsor"'],
  "updatePresentation.ts": ['"not-configured"', '"optional-update"', '"required-update"', "requiresMandatoryUpdate", "前端不得从远端布尔值自行推导"],
  "AppSidebarTemplate.tsx": [
    'AppSidebarMode = "compact" | "detailed"', "DEFAULT_DETAILED_SIDEBAR_COLLAPSED = false", "APP_SIDEBAR_COLLAPSED_STORAGE_KEY", "APP_SIDEBAR_WIDTHS", "compact: 80", "detailedCollapsed: 76", "detailedExpanded: 248", "APP_SIDEBAR_LOGO_SIZES", "compact: 36", "detailedCollapsed: 44", "detailedExpanded: 72", "APP_SIDEBAR_COMPACT_PADDING_PX = 6", "APP_SIDEBAR_COMPACT_SECTION_GAP_PX = 8", "APP_SIDEBAR_NAV_ICON_SIZE_PX = 22", "APP_SIDEBAR_ICON_STROKE_WIDTH = 1.75", "APP_SIDEBAR_DETAILED_NAV_ITEM_MIN_HEIGHT_PX = 44", "APP_SIDEBAR_COLLAPSE_ICON_SIZE_PX = 18", "APP_SIDEBAR_TOOLTIP_OPEN_DELAY_MS = 0", "APP_SIDEBAR_LABEL_FONT_SIZE_PX = 11", "APP_SIDEBAR_LABEL_LINE_HEIGHT = 1.25", "APP_SIDEBAR_COMPACT_NAV_ITEM_MIN_HEIGHT_PX = 56", "APP_SIDEBAR_COMPACT_NAV_ITEM_PADDING_BLOCK_PX = 4", "APP_SIDEBAR_COMPACT_NAV_ITEM_GAP_PX = 4",
    'gap={mode === "compact" ? APP_SIDEBAR_COMPACT_SECTION_GAP_PX : "sm"}', 'p={mode === "compact" ? APP_SIDEBAR_COMPACT_PADDING_PX : 0}', 'p={mode === "detailed" ? "xs" : 0}', "stroke={APP_SIDEBAR_ICON_STROKE_WIDTH}", 'px={compact || iconOnly ? 0 : "sm"}', "lineClamp={2}", 'position: "fixed"', 'height: "100dvh"', 'borderInlineEnd: "1px solid var(--app-border)"', "featureItems.map", "supportNavigationItems.map", "buildSupportNavigationItems(supportPages)", "window.localStorage.getItem", "window.localStorage.setItem", "readDetailedSidebarCollapsed", "persistDetailedSidebarCollapsed", "detailedSidebarNavbarWidth", "IconChevronLeft", "IconChevronRight", "<Tooltip", "openDelay={APP_SIDEBAR_TOOLTIP_OPEN_DELAY_MS}", 'position="right"', "logoSrc: string", 'APP_SIDEBAR_LOGO_PATH = "/app-identity/logo.png"', "mode: AppSidebarMode", "detailedCollapsed?: boolean", "onCollapsedChange?: (collapsed: boolean) => void", "supportPages: SupportPageSelection", 'data-testid="app-sidebar-logo"', 'data-testid="app-sidebar-version"', 'data-testid="fixed-bottom-navigation"', 'data-layout={mode === "compact" ? "compact" : "detailed"}', 'compact ? "icon-above-label" : iconOnly ? "icon-only" : "icon-with-label"', 'data-label-alignment={compact ? "full-width-center" : undefined}', 'display: "block"', 'marginInline: "auto"', 'width: "100%"', 'overflow: compact ? "visible" : undefined', 'whiteSpace: compact ? "normal" : undefined', 'flexDirection: compact ? "column" : "row"', 'marginInlineEnd: compact || iconOnly ? 0 : undefined', 'textAlign: "center"', 'from "@tabler/icons-react"', "type TablerIcon", "icon: TablerIcon", "FIXED_NAVIGATION_ICONS", 'style={{ alignItems: "center", width: "100%" }}', "formatDisplayVersion(version)",
  ],
  "AppShellTemplate.tsx": ['from "@mantine/core"', "useState(", "readDetailedSidebarCollapsed", "detailedSidebarNavbarWidth(detailedSidebarCollapsed)", "persistDetailedSidebarCollapsed(nextCollapsed)", 'data-mode="detailed"', "data-navbar-width={navbarWidth}", "navbar={{ breakpoint: 0, width: navbarWidth }}", "<MantineAppShell.Navbar p={0}>", 'logoSrc={APP_SIDEBAR_LOGO_PATH}', 'mode="detailed"', "onCollapsedChange={handleCollapsedChange}"],
  "AppThemeProviderTemplate.tsx": ['AppColorScheme = "light" | "dark" | "auto"', "localStorageColorSchemeManager", 'defaultColorScheme="auto"', "APP_THEME_CSS_VARIABLES", '"--app-background"', '"--app-surface"', '"--app-text"', '"--app-text-muted"', '"--app-border"', '"--app-accent"', "data-color-scheme={colorScheme}"],
  "SettingsPageTemplate.tsx": ["SupportedInterfaceLanguage", "AsyncHostCapabilitySetting", "getEnabled: () => Promise<boolean>", "onChange: (enabled: boolean) => Promise<boolean>", "systemNotification?: AsyncHostCapabilitySetting", "autostart?: AsyncHostCapabilitySetting", "capability.onChange(nextEnabled)", "capability.getEnabled()", "const titleId = `settings-capability-title-${id}`;", "const descriptionId = `settings-capability-description-${id}`;", "data-testid={titleId}", "data-testid={descriptionId}", "id={titleId}", "id={descriptionId}", "aria-labelledby={titleId}", "aria-describedby={descriptionId}", 'disabled={status === "pending" || status === "unknown"}', 'checked === "unknown"', 't("settings.capability_retry")', 'role="status"', 'role="alert"', 't("settings.theme_light")', 't("settings.theme_dark")', 't("settings.theme_system")', "useMantineColorScheme", "setColorScheme(value)", "formatDisplayVersion(version)"],
  "MandatoryUpdateGateTemplate.tsx": ["requiresMandatoryUpdate(update)", 'role="alertdialog"', "onInstallUpdate", "onExitApplication", "普通功能", "formatDisplayVersion(update.currentVersion)"],
  "SupportSurfaceTemplates.test.tsx": ["2222980", "免责声明", "显示窗口", "formats the fixed dynamic window title", "buildSupportNavigationItems", "fixed bottom order", "APP_SIDEBAR_WIDTHS", "APP_SIDEBAR_COLLAPSED_STORAGE_KEY", "AppShellTemplate", "APP_SIDEBAR_COMPACT_PADDING_PX", "APP_SIDEBAR_COMPACT_NAV_ITEM_MIN_HEIGHT_PX", "APP_SIDEBAR_LABEL_LINE_HEIGHT", "keeps compact icon-above-label navigation centered and non-expandable", "synchronizes the detailed AppShell width and restores its tooltip state", 'from "@tabler/icons-react"', '"data-navigation-layout"', 'alignItems: "center"', "distinct light and dark application theme variables", "inert update entry on About", "keeps update actions bound to their own controls", "selects English release-note translations from the active locale", "shows a bounded release notes load failure and retries from its own control", "MAX_VISIBLE_RELEASE_NOTE_VERSIONS", "MAX_VISIBLE_RELEASE_NOTE_ITEMS", "更新日志 2026-08-26 v1.0.6", "Release notes 2026-08-28 v1.2.3", "core-classified mandatory update", "video.controls", "video.autoplay", "payment images", "optionalAssets"],
  "CapabilitySwitchTemplate.test.tsx": ["renders fixed controls without unselected capability or privacy sections", "system_notification_switch_uses_authoritative_success_result", "system_notification_switch_rolls_back_after_denial", "system_notification_switch_enters_unknown_state_when_reread_fails", "autostart_switch_rolls_back_after_failure", "autostart_switch_enters_unknown_state_when_reread_fails", "settings-capability-title-system_notification", "settings-capability-description-system_notification", "settings-capability-title-autostart", "settings-capability-description-autostart", '"aria-labelledby"', '"aria-describedby"', "notificationTitle.id", "notificationDescription.id", "autostartTitle.id", "autostartDescription.id", "getSystemNotificationEnabled", "getAutostartEnabled", '"data-authoritative-state"', '"unknown"', "重新读取实际状态"],
};

function validateReactAssets(errors, brandRoot) {
  const reactRoot = path.join(brandRoot, "react");
  const required = new Map(Object.entries(REACT_REQUIRED).map(([name, fragments]) => [path.join(reactRoot, name), fragments]));
  required.set(path.join(brandRoot, "rust", "release_notes.rs"), ["#[tauri::command]", "pub async fn load_release_notes", "BaseDirectory::Resource", 'RELEASE_NOTES_RESOURCE_PATH: &str = "release-notes.json"', "tokio::fs::symlink_metadata", "tokio::fs::read", "serde_json::from_slice", "MAX_RELEASE_NOTE_VERSIONS: usize = 5", "MAX_RELEASE_NOTE_ITEMS: usize = 10", "RELEASE_NOTES_SCHEMA_VERSION: u8 = 2", "LocalizedReleaseNoteItem", '#[serde(rename = "zh-CN")]', '#[serde(rename = "en-US")]', "ReleaseNotesLoadError", "parses_valid_release_notes_resource", "rejects_invalid_release_notes_resource"]);
  required.set(path.join(brandRoot, "tauri", "tauri.release.conf.json"), ['"../../release-notes.json": "release-notes.json"']);
  const texts = new Map();
  for (const [filePath, fragments] of required) {
    const text = readContractText(errors, filePath);
    if (text === null) continue;
    texts.set(filePath, text);
    for (const fragment of fragments) {
      if (!text.includes(fragment)) fail(errors, `GUI brand React template missing in ${display(filePath)}: ${fragment}`);
    }
  }
  if (hasNonAsciiRawByteString(texts.get(path.join(brandRoot, "rust", "release_notes.rs")) ?? "")) fail(errors, "GUI brand Rust release-note fixtures must encode localized UTF-8 str values with .as_bytes(), not raw byte strings");
  const sponsorText = texts.get(path.join(reactRoot, "SponsorPageTemplate.tsx")) ?? "";
  for (const pattern of ["minWidth: 800", "minHeight: 600", "cols={3}", "pointerEvents: 'none'"]) {
    if (sponsorText.includes(pattern)) fail(errors, `brand sponsor template restored unsafe fixed layout: ${pattern}`);
  }
  const mediaText = texts.get(path.join(reactRoot, "SupportMedia.tsx")) ?? "";
  if (/\bautoPlay\b/u.test(mediaText)) fail(errors, "brand support video template must not enable autoPlay");
  const navigationText = texts.get(path.join(reactRoot, "supportNavigation.ts")) ?? "";
  const order = ["sponsor", "settings", "about"].map((name) => navigationText.indexOf(`items.push(AVAILABLE_SUPPORT_NAVIGATION_ITEMS.${name})`));
  if (order.some((position) => position < 0) || order.some((position, index) => index > 0 && position < order[index - 1])) fail(errors, "GUI selected bottom navigation must be sponsor/settings/about");
  const sidebarText = texts.get(path.join(reactRoot, "AppSidebarTemplate.tsx")) ?? "";
  const logo = sidebarText.indexOf('data-testid="app-sidebar-logo"');
  const version = sidebarText.indexOf('data-testid="app-sidebar-version"');
  if (logo < 0 || version < 0 || logo > version) fail(errors, "GUI sidebar logo must render above the current version");
  if (sidebarText.indexOf("featureItems.map") > sidebarText.indexOf("supportNavigationItems.map")) fail(errors, "GUI feature navigation must render above selected bottom navigation");
  for (const forbidden of ["icon: ReactNode", "fixedIcons: FixedNavigationIcons", 'collapsed ? "›" : "‹"', "DEFAULT_SIDEBAR_COLLAPSED", "APP_SIDEBAR_LABEL_WIDTH_CH", "data-label-width-ch", "inlineSize: `${APP_SIDEBAR_LABEL_WIDTH_CH}em`"]) {
    if (sidebarText.includes(forbidden)) fail(errors, `GUI sidebar restored forbidden icon contract: ${forbidden}`);
  }
  if (/(?:inlineSize|width)\s*:\s*["'`]\s*[^"'`]*(?:em|ch)\b/su.test(sidebarText)) fail(errors, "GUI compact sidebar labels must not use fixed em/ch boxes");
  if (sidebarText.includes("useState(")) fail(errors, "GUI detailed sidebar state must be owned by AppShell");
  if (!/<IconComponent\b[^>]*\bstroke=\{APP_SIDEBAR_ICON_STROKE_WIDTH\}[^>]*\/>/su.test(sidebarText)) fail(errors, "GUI navigation icon must use APP_SIDEBAR_ICON_STROKE_WIDTH");
  const settingsText = texts.get(path.join(reactRoot, "SettingsPageTemplate.tsx")) ?? "";
  for (const fragment of ["AsyncHostCapabilitySetting", "autostart?: AsyncHostCapabilitySetting", "systemNotification?: AsyncHostCapabilitySetting", 'data-testid={`settings-capability-${id}`}', "const titleId = `settings-capability-title-${id}`;", "const descriptionId = `settings-capability-description-${id}`;", "data-testid={titleId}", "data-testid={descriptionId}", "id={titleId}", "id={descriptionId}", "const title = t(`settings.${id}_title`);", "const description = t(`settings.${id}_description`);", "aria-labelledby={titleId}", "aria-describedby={descriptionId}", 'disabled={status === "pending" || status === "unknown"}', 'checked === "unknown"', 't("settings.capability_retry")', 'role="status"', 'role="alert"', "capability.onChange(nextEnabled)", "capability.getEnabled()"]) {
    if (!settingsText.includes(fragment)) fail(errors, `GUI settings capability contract missing: ${fragment}`);
  }
  for (const forbidden of ["usageReportingConfigured", "usageReportingConsent", "onUsageReportingConsentChange", 't("settings.privacy_title")']) {
    if (settingsText.includes(forbidden)) fail(errors, `GUI default settings restored forbidden privacy surface: ${forbidden}`);
  }
  const aboutText = texts.get(path.join(reactRoot, "AboutPageTemplate.tsx")) ?? "";
  if (/<Paper(?=[^>]*data-testid="about-update-section")[^>]*\bonClick=/su.test(aboutText)) fail(errors, "GUI About update section must not proxy child button actions");
  const releaseRuntime = `${texts.get(path.join(reactRoot, "releaseNotesResource.ts")) ?? ""}\n${texts.get(path.join(brandRoot, "rust", "release_notes.rs")) ?? ""}`;
  for (const forbidden of ["@tauri-apps/plugin-fs", "std::fs::read"]) {
    if (releaseRuntime.includes(forbidden)) fail(errors, `GUI release notes runtime must use the narrow async command: ${forbidden}`);
  }
  const sessionText = texts.get(path.join(reactRoot, "pageSessionState.ts")) ?? "";
  for (const forbidden of ["atomWithStorage", "localStorage", "sessionStorage", "indexedDB", "@tauri-apps/plugin-store", "window.location"]) {
    if (sessionText.includes(forbidden)) fail(errors, `GUI page session state must remain process-memory only: ${forbidden}`);
  }
  for (const [filePath, text] of texts) {
    if (/\.test\.tsx?$/u.test(path.basename(filePath))) continue;
    if (FIXED_REMOTE_URI.test(text)) fail(errors, `GUI brand runtime template contains a fixed remote URI: ${display(filePath)}`);
  }
}

const SUPPORT_REQUIRED = [
  ["skill", ["九项初始化配置", "system-locale、updater、window-state 由各自固定 Skill 无条件接入", "dialog WebView 基线同样由独立固定 Skill 无条件接入", "dialog 选择路径不授权读取或写入该路径", "全局快捷键界面只按 contract 的非空固定/可编辑动作生成，空 contract 无占位", "通知/自启按各自 Skill 接入条件 prop", "全局快捷键只对 contract 非空动作接入逐项真实状态", "固定策略只读，可编辑策略使用 Rust 权威 load/save/capture 命令", "空 contract 不传 prop 或复制翻译键", "`compact` 精确实现 `tauri-gui-sidebar-compact-80-v1`", "`detailed` 精确实现 `tauri-gui-sidebar-detailed-v1`", "Mantine `Tooltip`", "独立 localStorage 键 `APP_SIDEBAR_COLLAPSED_STORAGE_KEY` 持久化", "三态主题与应用级亮暗语义", "不使用固定 `em/ch` 盒且不折叠", "@tabler/icons-react", "初始化设置页不得预置隐私区块或统计开关", "tauri/tauri.release.conf.json", "一个小写 `v`", "父级代理", "应用根 Jotai store", "成功空页", "底部导航为已选赞助、固定设置、已选关于", "`/about` 与 `/sponsor` 只在对应配置启用时建立", "共享作者、联系方式和免责声明", "docs/GUI_SUPPORT_SURFACES.md", "升级器必须将其视为 `protected`", "领域校验、跨接口可复用的资格判断", "默认 fail-open", "禁止 detached task", "秘密只能由已批准的安全运行时来源提供", "只有产品明确启用统计能力后才增加统计同意界面", "仅在托盘启用时复制/加载托盘原生文案", "不得信任远端 `forcedUpdate` 布尔值", "HTTPS JSON `POST` body", "13 个源图片", "只有 `sponsor_page: enabled` 时", "支付二维码是敏感静态品牌材料"]],
  ["reference", ["## 所有权矩阵", "`{applicationName} v{version} {contactChannel}:{contactValue}`", "底部按已选赞助、固定设置、已选关于的视觉顺序生成", "compact 为 `80px`、`6px` 内容内边距、`36px` 本地 Logo、`22px` 图标", "detailed 首次默认 `248px` 展开、`72px` Logo、`22px` 图标", "Mantine Tooltip", "@tabler/icons-react", "浅色、深色、跟随系统", "关于页在手动检查更新旁提供本地更新日志", "发布专用 Tauri 合并配置", "固定 Rust 异步命令", "更新日志五版/十条裁剪", "表格中的 `Switch` 不得因点击行或单元格而切换", "普通页面使用共享 `pageSessionState.ts`", "新 store 默认", "loading/error 不回退", "设置页固定提供当前应用/版本、中英文和浅色/深色/跟随系统", "系统通知与开机自启只在对应配置启用时增加默认关闭", "托盘 i18n：仅在选择系统托盘时", "每个远程能力单独记录", "生产地址默认 HTTPS", "禁用或未同意时请求计数为零", "未认证布尔值不能触发强更", "13 个源文件"]],
  ["pages", ["## 资产包内容", "关于页、赞助页、系统托盘、系统通知、开机自启、单实例、深链接、全局快捷键和侧栏模式则严格消费 GUI 初始化专门问询写入 `docs/GUI_APP_PROFILE.md` 的九项选择", "AppThemeProviderTemplate.tsx", "AppShellTemplate.tsx", "compact `80px` 全宽居中竖排菜单，或 detailed 默认 `248px` 展开、可收起为 `76px`", "同步 fixed 侧栏、Mantine `navbar.width` 与 `data-navbar-width`", "设置页始终保留应用/版本、语言与三态主题", "系统通知/开机自启能力启用时分别把 Rust command 状态接到模板可选 prop", "仅当 `system_tray = enabled` 时", "手动检查更新和稳定状态随关于页存在", "raw byte string", "ReleaseNotesDialog", "rust/release_notes.rs", "tauri/tauri.release.conf.json", "loading/error/retry", "只显示近 5 版/每类 10 个翻译对", "父容器点击不代理两个按钮", "作者、联系人、三段免责声明", "固定价格是 19、199、1999 CNY", "不得使用固定 `minWidth: 800`", "当前品牌包没有视频文件", "13 个源文件逐项核对"]],
  ["update", ["## 更新状态机", "仅当初始化选择关于页时", "旁边的“更新日志”按钮", "发布专用 `--config`", "向单一合并的 `invoke_handler` 暴露 `check_for_updates` 与 `load_release_notes` 两个窄命令", "最近 5 版", "各最多 10 个完整 `zh-CN`/`en-US` 翻译对", "两个按钮的事件只绑定各自元素", "`NotConfigured`", "`RequiredUpdate`", "minimumSupportedVersion", "React 不比较 SemVer、不读取远端布尔字段", "签名验证不可关闭", "强更不是远端一个 `forcedUpdate` 布尔值", "普通功能导航和业务页面不挂载", "## 统计上报同意与固定最小事件", "JSON `POST` body", "禁止使用 GET/query", "不落盘", "撤回同意", "最多一个发送任务、一个在途请求和 32 条内存事件"]],
  ["metadata", ["准备 GUI 支持界面", "$desktop-prepare-gui-support-surfaces"]],
  ["rustZh", ["tray:", "show_window: 显示窗口", "quit: 退出"]],
  ["rustEn", ["tray:", "show_window: Show Window", "quit: Quit"]],
  ["template", ["GUI 初始化已经包含动态标题、所选精简/详细 Logo→版本侧栏", "`sidebar_mode`", "精简：匹配 `tauri-gui-sidebar-compact-80-v1`", "详细：首次默认 `248px` 展开", "自身按钮收起为 `76px`", "APP_SIDEBAR_COLLAPSED_STORAGE_KEY", "同一产物同时支持亮色和暗色", "浅色、深色、跟随系统", "手动检查更新：入口固定存在", "更新日志：按钮紧邻“检查更新”且事件绑定在按钮自身", "最近 5 版", "各最多 10 个 `zh-CN`/`en-US` 翻译对", "全部版本只带一个小写 `v`", "视觉顺序为已选赞助、设置、已选关于", "`NotConfigured`", "禁止远端布尔值直接触发", "初始化设置页不提供统计或隐私控件", "JSON POST body", "支付二维码是敏感静态品牌材料", "autoplay | 禁止", "13 个源文件"]],
];

/** 确保共享品牌资源完整，同时隔离来源下游实例和远程能力。 */
export function validateGuiSupportContract(errors, options = {}) {
  const paths = {
    skill: options.skillPath ?? GUI_SUPPORT_SKILL,
    reference: options.referencePath ?? GUI_SUPPORT_REFERENCE,
    pages: options.pagesReferencePath ?? GUI_SUPPORT_PAGES_REFERENCE,
    update: options.updateReferencePath ?? GUI_SUPPORT_UPDATE_REFERENCE,
    metadata: options.metadataPath ?? GUI_SUPPORT_METADATA,
  };
  const brandRoot = options.brandRoot ?? GUI_SUPPORT_BRAND_ROOT;
  paths.rustZh = path.join(brandRoot, "rust-i18n", "zh-CN.yml");
  paths.rustEn = path.join(brandRoot, "rust-i18n", "en-US.yml");
  paths.template = path.join(brandRoot, "GUI_SUPPORT_SURFACES.template.md");
  for (const [key, fragments] of SUPPORT_REQUIRED) {
    const filePath = paths[key];
    const text = readContractText(errors, filePath);
    if (text === null) continue;
    for (const fragment of fragments) {
      if (!text.includes(fragment)) fail(errors, `GUI support contract missing in ${display(filePath)}: ${fragment}`);
    }
    if (FIXED_REMOTE_URI.test(text)) fail(errors, `GUI support Harness text contains a fixed remote URI in ${display(filePath)}`);
  }
  const profilePath = path.join(brandRoot, "brand-support-profile.json");
  const manifestPath = path.join(brandRoot, "media-manifest.json");
  const zhPath = path.join(brandRoot, "i18n", "zh-CN.json");
  const enPath = path.join(brandRoot, "i18n", "en-US.json");
  const releaseConfigPath = path.join(brandRoot, "tauri", "tauri.release.conf.json");
  const profile = readContractJson(errors, profilePath);
  const manifest = readContractJson(errors, manifestPath);
  const zh = readContractJson(errors, zhPath);
  const en = readContractJson(errors, enPath);
  const releaseConfig = readContractJson(errors, releaseConfigPath);
  if (profile !== null) validateBrandProfile(errors, profile, profilePath);
  if (manifest !== null) validateBrandMediaManifest(errors, manifest, { brandRoot, path: manifestPath });
  if (zh !== null && en !== null) validateBrandTranslations(errors, { zh, en, zhPath, enPath });
  const expectedConfig = { bundle: { resources: { "../../release-notes.json": "release-notes.json" } } };
  if (!isDeepStrictEqual(releaseConfig, expectedConfig)) fail(errors, "GUI release config must contain only the fixed release-notes resource mapping");
  validateReactAssets(errors, brandRoot);
  const productInstancePath = options.productInstancePath ?? path.join(ROOT, "docs", "GUI_SUPPORT_SURFACES.md");
  if (fs.existsSync(productInstancePath)) fail(errors, `Harness template must not precreate downstream GUI support facts: ${display(productInstancePath)}`);
}
