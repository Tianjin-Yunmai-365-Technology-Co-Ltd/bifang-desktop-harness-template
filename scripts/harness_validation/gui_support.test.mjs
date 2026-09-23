import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  GUI_SUPPORT_BRAND_ROOT,
  GUI_SUPPORT_METADATA,
  GUI_SUPPORT_REFERENCE,
  GUI_SUPPORT_SKILL,
  validateGuiSupportContract,
} from "./gui_support.mjs";

function withTemporaryRoot(callback) {
  const root = mkdtempSync(path.join(tmpdir(), "afh-gui-support-"));
  try { callback(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

function withBrand(callback) {
  withTemporaryRoot((root) => {
    const brandRoot = path.join(root, "brand-support");
    cpSync(GUI_SUPPORT_BRAND_ROOT, brandRoot, { recursive: true, verbatimSymlinks: true });
    callback(root, brandRoot);
  });
}

function validateBrand(root, brandRoot) {
  const errors = [];
  validateGuiSupportContract(errors, {
    brandRoot,
    productInstancePath: path.join(root, "GUI_SUPPORT_SURFACES.md"),
  });
  return errors;
}

function mutateText(filePath, update) {
  writeFileSync(filePath, update(readFileSync(filePath, "utf8")));
}

function mutateJson(filePath, update) {
  const value = JSON.parse(readFileSync(filePath, "utf8"));
  update(value);
  writeFileSync(filePath, JSON.stringify(value));
}

function expectError(errors, fragment) {
  assert.ok(errors.some((error) => error.includes(fragment)), `${fragment}\n${errors.join("\n")}`);
}

test("current GUI brand contract is complete and product-isolated", () => {
  const errors = [];
  validateGuiSupportContract(errors);
  assert.deepEqual(errors, []);
});

test("fixed remote URIs in Harness text are rejected", () => withTemporaryRoot((root) => {
  const skillPath = path.join(root, "SKILL.md");
  const referencePath = path.join(root, "reference.md");
  const metadataPath = path.join(root, "openai.yaml");
  writeFileSync(skillPath, `${readFileSync(GUI_SUPPORT_SKILL, "utf8")}\n固定地址：https://updates.invalid/check\n`);
  cpSync(GUI_SUPPORT_REFERENCE, referencePath);
  cpSync(GUI_SUPPORT_METADATA, metadataPath);
  const errors = [];
  validateGuiSupportContract(errors, { skillPath, referencePath, metadataPath, productInstancePath: path.join(root, "GUI_SUPPORT_SURFACES.md") });
  expectError(errors, "fixed remote URI");
}));

test("template rejects a precreated downstream product instance", () => withTemporaryRoot((root) => {
  const productInstancePath = path.join(root, "GUI_SUPPORT_SURFACES.md");
  writeFileSync(productInstancePath, "# product instance\n");
  const errors = [];
  validateGuiSupportContract(errors, { productInstancePath });
  expectError(errors, "must not precreate");
}));

test("safe secret-source rule is mandatory", () => withTemporaryRoot((root) => {
  const skillPath = path.join(root, "SKILL.md");
  mutateTextCopy(GUI_SUPPORT_SKILL, skillPath, (source) => source.replace("秘密只能由已批准的安全运行时来源提供", "秘密由实现自行决定"));
  const errors = [];
  validateGuiSupportContract(errors, { skillPath, productInstancePath: path.join(root, "GUI_SUPPORT_SURFACES.md") });
  expectError(errors, "安全运行时来源");
}));

function mutateTextCopy(sourcePath, targetPath, update) {
  writeFileSync(targetPath, update(readFileSync(sourcePath, "utf8")));
}

test("brand media byte drift is rejected", () => withBrand((root, brandRoot) => {
  const target = path.join(brandRoot, "media", "sponsor", "arrow.png");
  writeFileSync(target, Buffer.concat([readFileSync(target), Buffer.from("drift")]));
  expectError(validateBrand(root, brandRoot), "mismatch");
}));

test("missing optional brand media remains a hard failure", () => withBrand((root, brandRoot) => {
  unlinkSync(path.join(brandRoot, "media", "sponsor", "select.png"));
  expectError(validateBrand(root, brandRoot), "media file set mismatch");
}));

test("fixed sponsor prices and contacts cannot drift", () => withBrand((root, brandRoot) => {
  const profile = path.join(brandRoot, "brand-support-profile.json");
  mutateJson(profile, (value) => {
    value.sponsor.tiers[0].price = 20;
    value.contacts.support.value = "0000000";
    value.contacts.windowTitle.value = "2222580";
  });
  const errors = validateBrand(root, brandRoot);
  for (const fragment of ["prices must remain", "support contact drifted", "windowTitle contact drifted"]) expectError(errors, fragment);
}));

test("fixed disclaimer and template references are required", () => withBrand((root, brandRoot) => {
  const translations = path.join(brandRoot, "i18n", "zh-CN.json");
  mutateJson(translations, (value) => { delete value.about.disclaimer_2; });
  mutateText(path.join(brandRoot, "react", "AboutPageTemplate.tsx"), (source) => source.replace('          <List.Item>{t("about.disclaimer_3")}</List.Item>\n', ""));
  const errors = validateBrand(root, brandRoot);
  expectError(errors, "brand about copy");
  expectError(errors, "about.disclaimer_3");
}));

test("tray, navigation, and release-note locale copy cannot drift", () => withBrand((root, brandRoot) => {
  const translations = path.join(brandRoot, "i18n", "en-US.json");
  mutateJson(translations, (value) => {
    value.tray.quit = "Exit now";
    delete value.navigation.sponsor;
    value.release_notes.feature_optimizations = "功能优化";
  });
  mutateText(path.join(brandRoot, "rust-i18n", "en-US.yml"), (source) => source.replace("show_window: Show Window", ""));
  const errors = validateBrand(root, brandRoot);
  for (const fragment of ["brand tray copy drifted", "brand navigation copy drifted", "show_window: Show Window", "release-note fixed format drifted"]) expectError(errors, fragment);
}));

test("bottom navigation order is sponsor, settings, about", () => withBrand((root, brandRoot) => {
  const navigation = path.join(brandRoot, "react", "supportNavigation.ts");
  mutateText(navigation, (source) => source
    .replace("items.push(AVAILABLE_SUPPORT_NAVIGATION_ITEMS.sponsor)", "items.push(AVAILABLE_SUPPORT_NAVIGATION_ITEMS.temporary)")
    .replace("items.push(AVAILABLE_SUPPORT_NAVIGATION_ITEMS.about)", "items.push(AVAILABLE_SUPPORT_NAVIGATION_ITEMS.sponsor)")
    .replace("items.push(AVAILABLE_SUPPORT_NAVIGATION_ITEMS.temporary)", "items.push(AVAILABLE_SUPPORT_NAVIGATION_ITEMS.about)"));
  expectError(validateBrand(root, brandRoot), "sponsor/settings/about");
}));

test("sidebar identity, dimensions, icons, and compact layout are fixed", () => withBrand((root, brandRoot) => {
  const sidebar = path.join(brandRoot, "react", "AppSidebarTemplate.tsx");
  mutateText(sidebar, (source) => source
    .replace("compact: 80", "compact: 79")
    .replace("detailedCollapsed: 76", "detailedCollapsed: 70")
    .replace("detailedExpanded: 248", "detailedExpanded: 240")
    .replace("APP_SIDEBAR_NAV_ICON_SIZE_PX = 22", "APP_SIDEBAR_NAV_ICON_SIZE_PX = 21")
    .replace("APP_SIDEBAR_COMPACT_PADDING_PX = 6", "APP_SIDEBAR_COMPACT_PADDING_PX = 5")
    .replace("APP_SIDEBAR_ICON_STROKE_WIDTH = 1.75", "APP_SIDEBAR_ICON_STROKE_WIDTH = 2")
    .replace('data-testid="app-sidebar-logo"', 'data-testid="temporary-sidebar-item"')
    .replace('data-testid="app-sidebar-version"', 'data-testid="app-sidebar-logo"')
    .replace('data-testid="temporary-sidebar-item"', 'data-testid="app-sidebar-version"')
    .replace('from "@tabler/icons-react"', 'from "@example/icons"')
    .replace('compact ? "icon-above-label" : iconOnly ? "icon-only" : "icon-with-label"', 'compact ? "horizontal" : iconOnly ? "hidden" : "icon-with-label"'));
  const errors = validateBrand(root, brandRoot);
  for (const fragment of ["compact: 80", "detailedCollapsed: 76", "detailedExpanded: 248", "APP_SIDEBAR_NAV_ICON_SIZE_PX", "APP_SIDEBAR_COMPACT_PADDING_PX", "APP_SIDEBAR_ICON_STROKE_WIDTH", "logo must render above", "@tabler/icons-react", "icon-above-label"]) expectError(errors, fragment);
}));

test("compact labels reject fixed em or ch boxes", () => withBrand((root, brandRoot) => {
  const sidebar = path.join(brandRoot, "react", "AppSidebarTemplate.tsx");
  mutateText(sidebar, (source) => source.replace('width: "100%",', 'width: "10em",'));
  expectError(validateBrand(root, brandRoot), "fixed em/ch boxes");
}));

test("detailed sidebar defaults, local preference, and tooltip are mandatory", () => withBrand((root, brandRoot) => {
  const sidebar = path.join(brandRoot, "react", "AppSidebarTemplate.tsx");
  mutateText(sidebar, (source) => source
    .replace("DEFAULT_DETAILED_SIDEBAR_COLLAPSED = false", "DEFAULT_DETAILED_SIDEBAR_COLLAPSED = true")
    .replace("window.localStorage.getItem", "window.sessionStorage.getItem")
    .replace("<Tooltip", "<Popover"));
  const errors = validateBrand(root, brandRoot);
  for (const fragment of ["DEFAULT_DETAILED_SIDEBAR_COLLAPSED = false", "window.localStorage.getItem", "<Tooltip"]) expectError(errors, fragment);
}));

test("AppShell width offset and observable width remain synchronized", () => withBrand((root, brandRoot) => {
  const shell = path.join(brandRoot, "react", "AppShellTemplate.tsx");
  mutateText(shell, (source) => source.replace("navbar={{ breakpoint: 0, width: navbarWidth }}", "navbar={{ breakpoint: 0, width: 248 }}").replace("data-navbar-width={navbarWidth}", "data-navbar-width={248}"));
  const errors = validateBrand(root, brandRoot);
  expectError(errors, "navbar={{ breakpoint: 0, width: navbarWidth }}");
  expectError(errors, "data-navbar-width={navbarWidth}");
}));

test("default settings reject privacy and telemetry surfaces", () => withBrand((root, brandRoot) => {
  const settings = path.join(brandRoot, "react", "SettingsPageTemplate.tsx");
  mutateText(settings, (source) => `${source}\nconst usageReportingConsent = false;\nconst removed = t("settings.privacy_title");\n`);
  mutateJson(path.join(brandRoot, "i18n", "zh-CN.json"), (value) => { value.settings.privacy_title = "隐私"; });
  const errors = validateBrand(root, brandRoot);
  expectError(errors, "forbidden privacy surface");
  expectError(errors, "fixed UI keys drifted");
}));

test("sponsor page remains theme-adaptive", () => withBrand((root, brandRoot) => {
  const sponsor = path.join(brandRoot, "react", "SponsorPageTemplate.tsx");
  mutateText(sponsor, (source) => source.replaceAll("useComputedColorScheme", "useMantineTheme").replaceAll('data-color-scheme={colorScheme}', 'data-theme="light"'));
  const errors = validateBrand(root, brandRoot);
  expectError(errors, "useComputedColorScheme");
  expectError(errors, "data-color-scheme");
}));

test("About update, system theme, and mandatory update gate are required", () => withBrand((root, brandRoot) => {
  mutateText(path.join(brandRoot, "react", "SettingsPageTemplate.tsx"), (source) => source.replace('t("settings.theme_system")', 't("settings.title")'));
  mutateText(path.join(brandRoot, "react", "AboutPageTemplate.tsx"), (source) => source.replace('t("about.check_for_updates")', 't("about.version")'));
  mutateText(path.join(brandRoot, "react", "MandatoryUpdateGateTemplate.tsx"), (source) => source.replace('role="alertdialog"', 'role="dialog"'));
  const errors = validateBrand(root, brandRoot);
  for (const fragment of ["settings.theme_system", "about.check_for_updates", 'role="alertdialog"']) expectError(errors, fragment);
}));

test("About update container cannot proxy child actions", () => withBrand((root, brandRoot) => {
  mutateText(path.join(brandRoot, "react", "AboutPageTemplate.tsx"), (source) => source.replace('<Paper data-testid="about-update-section"', '<Paper data-testid="about-update-section" onClick={onCheckForUpdates}'));
  expectError(validateBrand(root, brandRoot), "must not proxy child button actions");
}));

test("release-note bounds and display version formatter are fixed", () => withBrand((root, brandRoot) => {
  mutateText(path.join(brandRoot, "react", "releaseNotes.ts"), (source) => source.replace("MAX_VISIBLE_RELEASE_NOTE_VERSIONS = 5", "MAX_VISIBLE_RELEASE_NOTE_VERSIONS = 6").replace("MAX_VISIBLE_RELEASE_NOTE_ITEMS = 10", "MAX_VISIBLE_RELEASE_NOTE_ITEMS = 11"));
  mutateText(path.join(brandRoot, "react", "displayVersion.ts"), (source) => source.replace("return `v${normalized}`", "return normalized"));
  const errors = validateBrand(root, brandRoot);
  for (const fragment of ["MAX_VISIBLE_RELEASE_NOTE_VERSIONS = 5", "MAX_VISIBLE_RELEASE_NOTE_ITEMS = 10", "return `v${normalized}`"]) expectError(errors, fragment);
}));

test("release-note runtime loader and narrow command are mandatory", () => withBrand((root, brandRoot) => {
  unlinkSync(path.join(brandRoot, "react", "releaseNotesResource.ts"));
  mutateText(path.join(brandRoot, "rust", "release_notes.rs"), (source) => source.replace("pub async fn load_release_notes", "pub async fn renamed_release_notes"));
  const errors = validateBrand(root, brandRoot);
  expectError(errors, "releaseNotesResource.ts");
  expectError(errors, "pub async fn load_release_notes");
}));

test("localized Rust raw byte fixtures are rejected while ASCII and comments are allowed", () => {
  withBrand((root, brandRoot) => {
    const rust = path.join(brandRoot, "rust", "release_notes.rs");
    mutateText(rust, (source) => `${source}\nconst INVALID_LOCALIZED_FIXTURE: &[u8] = br#"中文"#;\n`);
    expectError(validateBrand(root, brandRoot), "raw byte strings");
  });
  for (const addition of ['\nconst ASCII_FIXTURE: &[u8] = br##"release-notes"##;\n', '\n// br#"中文"#\n/* nested /* br##"中文"## */ comment */\n']) withBrand((root, brandRoot) => {
    const rust = path.join(brandRoot, "rust", "release_notes.rs");
    mutateText(rust, (source) => source + addition);
    assert.equal(validateBrand(root, brandRoot).some((error) => error.includes("raw byte strings")), false);
  });
});

test("release config contains only the fixed resource mapping", () => withBrand((root, brandRoot) => {
  writeFileSync(path.join(brandRoot, "tauri", "tauri.release.conf.json"), '{"bundle":{"resources":{"../../release-notes.json":"nested/release-notes.json"}}}\n');
  expectError(validateBrand(root, brandRoot), "fixed release-notes resource mapping");
}));

test("page session state stays in memory and resets only on successful stale pages", () => withBrand((root, brandRoot) => {
  const state = path.join(brandRoot, "react", "pageSessionState.ts");
  mutateText(state, (source) => source
    .replace('import { atom } from "jotai";', 'import { atomWithStorage as atom } from "jotai/utils";')
    .replace('result.status !== "success"', 'result.status === "loading"')
    .replace("page: pageSize === current.pageSize ? page : 1", "page")
    .replace("query: selection.query,\n        page: 1,", "query: selection.query,\n        page: current.page,"));
  mutateText(path.join(brandRoot, "react", "PageSessionState.test.ts"), (source) => source
    .replace("starts from defaults in a new application store", "keeps state forever")
    .replace("resets to page one when the page size changes", "keeps the stale page when the page size changes")
    .replace("resets to page one when the tab or query scope changes", "keeps the stale page when the query changes"));
  const errors = validateBrand(root, brandRoot);
  for (const fragment of ["process-memory only", 'result.status !== "success"', "pageSize === current.pageSize", "page size changes", "query: selection.query", "query scope changes", "starts from defaults"]) expectError(errors, fragment);
}));

test("application theme retains auto mode and semantic variables", () => withBrand((root, brandRoot) => {
  const theme = path.join(brandRoot, "react", "AppThemeProviderTemplate.tsx");
  mutateText(theme, (source) => source.replace('defaultColorScheme="auto"', 'defaultColorScheme="light"').replaceAll('"--app-text"', '"--app-foreground"'));
  const errors = validateBrand(root, brandRoot);
  expectError(errors, 'defaultColorScheme="auto"');
  expectError(errors, '"--app-text"');
}));

test("brand profile rejects downstream product fields", () => withBrand((root, brandRoot) => {
  mutateJson(path.join(brandRoot, "brand-support-profile.json"), (value) => { value.productName = "source product"; value.route = "/source"; });
  expectError(validateBrand(root, brandRoot), "downstream product fields");
}));

test("media manifest rejects paths escaping the brand root", () => withBrand((root, brandRoot) => {
  mutateJson(path.join(brandRoot, "media-manifest.json"), (value) => { value.assets[0].sourcePath = "../outside.png"; });
  expectError(validateBrand(root, brandRoot), "unsafe asset path");
}));

test("sponsor page rejects fixed desktop-only layout", () => withBrand((root, brandRoot) => {
  mutateText(path.join(brandRoot, "react", "SponsorPageTemplate.tsx"), (source) => source.replace("cols={{ base: 1, sm: 2, lg: 3 }}", "cols={3}"));
  expectError(validateBrand(root, brandRoot), "unsafe fixed layout");
}));

test("host capability failures must reread authoritative state", () => withBrand((root, brandRoot) => {
  mutateText(path.join(brandRoot, "react", "SettingsPageTemplate.tsx"), (source) => source.replace("setChecked(await capability.getEnabled());", "setChecked(capability.enabled);").replace("getEnabled: () => Promise<boolean>;", "getEnabled: () => void;"));
  mutateText(path.join(brandRoot, "react", "CapabilitySwitchTemplate.test.tsx"), (source) => source.replace("autostart_switch_rolls_back_after_failure", "autostart_switch_restores_previous_component_value"));
  const errors = validateBrand(root, brandRoot);
  expectError(errors, "getEnabled");
  expectError(errors, "autostart_switch_rolls_back_after_failure");
}));

test("capability switches retain accessible descriptions", () => withBrand((root, brandRoot) => {
  mutateText(path.join(brandRoot, "react", "SettingsPageTemplate.tsx"), (source) => source.replace("aria-describedby={descriptionId}", "aria-label={title}"));
  expectError(validateBrand(root, brandRoot), "aria-describedby={descriptionId}");
}));

test("video template rejects autoplay and requires transcripts", () => withBrand((root, brandRoot) => {
  mutateText(path.join(brandRoot, "react", "SupportMedia.tsx"), (source) => source.replace("controls\n", "autoPlay\n        controls\n").replaceAll("transcriptHref", "transcriptPath"));
  const errors = validateBrand(root, brandRoot);
  expectError(errors, "autoPlay");
  expectError(errors, "transcriptHref");
}));

test("missing GUI support contract files fail closed", () => withTemporaryRoot((root) => {
  const errors = [];
  validateGuiSupportContract(errors, { skillPath: path.join(root, "missing.md"), productInstancePath: path.join(root, "GUI_SUPPORT_SURFACES.md") });
  expectError(errors, "missing or unsafe GUI support contract file");
  assert.equal(existsSync(path.join(root, "missing.md")), false);
}));
