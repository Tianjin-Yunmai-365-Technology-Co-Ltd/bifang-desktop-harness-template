import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

import { verifyGuiLifecycleContract } from "./verify-gui-lifecycle-contract.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "verify-gui-lifecycle-contract.mjs");

/** 计算 PNG chunk 的 CRC-32，保持测试夹具也是可被真实解码器读取的图片。 */
function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

/** 生成 32x32 8-bit RGBA PNG，可切换为全透明负向夹具。 */
function createTrayPng(visible = true) {
  const width = 32;
  const height = 32;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const pixel = row + 1 + x * 4;
      const inside = visible && x >= 4 && x < 28 && y >= 4 && y < 28;
      raw[pixel] = 28;
      raw[pixel + 1] = 126;
      raw[pixel + 2] = 214;
      raw[pixel + 3] = inside ? 255 : 0;
    }
  }
  const chunk = (type, data) => {
    const name = Buffer.from(type, "ascii");
    const result = Buffer.alloc(data.length + 12);
    result.writeUInt32BE(data.length, 0);
    name.copy(result, 4);
    data.copy(result, 8);
    result.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
    return result;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** 写入结构检查器要求的五项 GUI 初始化选择。 */
function writeInitializationProfile(root, overrides = {}) {
  const selection = {
    about_page: "enabled",
    sidebar_mode: "detailed",
    single_instance: "enabled",
    sponsor_page: "enabled",
    system_tray: "enabled",
    ...overrides,
  };
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs", "GUI_APP_PROFILE.md"),
    `# GUI 应用资料\n\n\`\`\`gui-initialization-config\nsystem_tray = ${selection.system_tray}\nabout_page = ${selection.about_page}\nsponsor_page = ${selection.sponsor_page}\nsingle_instance = ${selection.single_instance}\nsidebar_mode = ${selection.sidebar_mode}\n\`\`\`\n`,
  );
}

/** 写入关于/赞助均启用且采用详细侧栏的最小前端运行时。 */
function writeDetailedFrontendFixture(guiRoot) {
  const sourceRoot = path.join(guiRoot, "src");
  fs.mkdirSync(path.join(sourceRoot, "routes"), { recursive: true });
  fs.mkdirSync(path.join(guiRoot, "public", "brand-support", "sponsor"), { recursive: true });
  fs.writeFileSync(
    path.join(sourceRoot, "AppShell.tsx"),
    `
import { ActionIcon, AppShell, NavLink, Tooltip } from "@mantine/core";
import { IconChevronLeft, IconChevronRight, IconHome } from "@tabler/icons-react";
import { useState } from "react";
export const sidebarMode = "detailed";
export const DEFAULT_DETAILED_SIDEBAR_COLLAPSED = false;
export const APP_SIDEBAR_COLLAPSED_STORAGE_KEY = "app.sidebar.detailed.collapsed";
export const APP_SIDEBAR_LOGO_PATH = "/app-identity/logo.png";
export const APP_SIDEBAR_WIDTHS = { compact: 80, detailedCollapsed: 76, detailedExpanded: 248 };
export const APP_SIDEBAR_LOGO_SIZES = { compact: 36, detailedCollapsed: 44, detailedExpanded: 72 };
export const APP_SIDEBAR_NAV_ICON_SIZE_PX = 22;
export const APP_SIDEBAR_ICON_STROKE_WIDTH = 1.75;
export const APP_SIDEBAR_DETAILED_NAV_ITEM_MIN_HEIGHT_PX = 44;
export const APP_SIDEBAR_COLLAPSE_ICON_SIZE_PX = 18;
export const APP_SIDEBAR_TOOLTIP_OPEN_DELAY_MS = 0;
export const routes = ["/settings", "/about", "/sponsor"];
export function readDetailedSidebarCollapsed() {
  return window.localStorage.getItem(APP_SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
}
export function persistDetailedSidebarCollapsed(collapsed) {
  window.localStorage.setItem(APP_SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
}
export function detailedSidebarNavbarWidth(collapsed) {
  return collapsed ? APP_SIDEBAR_WIDTHS.detailedCollapsed : APP_SIDEBAR_WIDTHS.detailedExpanded;
}
export function AppSidebarTemplate({ detailedCollapsed, onCollapsedChange }) {
  const navigation = (
    <NavLink
      active={true}
      aria-label="Home"
      data-navigation-layout={detailedCollapsed ? "icon-only" : "icon-with-label"}
      label={detailedCollapsed ? undefined : "Home"}
      leftSection={<IconHome size={APP_SIDEBAR_NAV_ICON_SIZE_PX} stroke={APP_SIDEBAR_ICON_STROKE_WIDTH} />}
      px={detailedCollapsed ? 0 : "sm"}
      styles={{
        root: { alignItems: "center", flexDirection: "row", minHeight: APP_SIDEBAR_DETAILED_NAV_ITEM_MIN_HEIGHT_PX },
        section: { marginInline: detailedCollapsed ? 0 : undefined },
      }}
    />
  );
  return (
    <nav style={{ position: "fixed", height: "100dvh", borderInlineEnd: "1px solid var(--app-border)" }}>
      <div data-testid="app-sidebar-identity" p="xs">
        <img src={APP_SIDEBAR_LOGO_PATH} />
        <span>v1.0.0</span>
        <ActionIcon data-testid="app-sidebar-collapse-toggle" onClick={() => onCollapsedChange(!detailedCollapsed)}>
          {detailedCollapsed ? <IconChevronRight size={APP_SIDEBAR_COLLAPSE_ICON_SIZE_PX} /> : <IconChevronLeft size={APP_SIDEBAR_COLLAPSE_ICON_SIZE_PX} />}
        </ActionIcon>
      </div>
      {detailedCollapsed ? <Tooltip label="Home" position="right" openDelay={APP_SIDEBAR_TOOLTIP_OPEN_DELAY_MS}>{navigation}</Tooltip> : navigation}
    </nav>
  );
}
export function DetailedAppShell() {
  const [detailedSidebarCollapsed, setDetailedSidebarCollapsed] = useState(readDetailedSidebarCollapsed);
  const navbarWidth = detailedSidebarNavbarWidth(detailedSidebarCollapsed);
  const handleCollapsedChange = (nextCollapsed) => {
    setDetailedSidebarCollapsed(nextCollapsed);
    persistDetailedSidebarCollapsed(nextCollapsed);
  };
  return (
    <AppShell data-mode="detailed" data-navbar-width={navbarWidth} navbar={{ width: navbarWidth }}>
      <AppShell.Navbar p={0}>
        <AppSidebarTemplate mode="detailed" detailedCollapsed={detailedSidebarCollapsed} onCollapsedChange={handleCollapsedChange} />
      </AppShell.Navbar>
    </AppShell>
  );
}
`,
  );
  fs.writeFileSync(path.join(sourceRoot, "routes", "settings.tsx"), "export function SettingsPage() { return null; }\n");
  fs.writeFileSync(
    path.join(sourceRoot, "routes", "about.tsx"),
    'import { AboutPageTemplate } from "../AboutPageTemplate";\nexport function AboutPage() { return <AboutPageTemplate />; }\n',
  );
  fs.writeFileSync(path.join(sourceRoot, "routes", "sponsor.tsx"), "export function SponsorPage() { return null; }\n");
  fs.writeFileSync(
    path.join(sourceRoot, "releaseNotesResource.ts"),
    `
import { invoke } from "@tauri-apps/api/core";
export const LOAD_RELEASE_NOTES_COMMAND = "load_release_notes";
export function decodeReleaseNotesDocument(value) { if (value.schemaVersion !== 2) throw new Error("invalid"); return value; } export function resolveReleaseNotesLocale(language) { return language?.startsWith("zh") ? "zh-CN" : "en-US"; }
export async function loadBundledReleaseNotes() {
  return decodeReleaseNotesDocument(await invoke<unknown>(command));
}
`,
  );
  fs.writeFileSync(
    path.join(sourceRoot, "AboutPageTemplate.tsx"),
    `
import { loadBundledReleaseNotes } from "./releaseNotesResource";
export function AboutPageTemplate({ releaseNotesLoader = loadBundledReleaseNotes }) {
  const i18n = { resolvedLanguage: "en-US" }; resolveReleaseNotesLocale(i18n.resolvedLanguage); const requestReleaseNotes = () => releaseNotesLoader(); // selects English release-note translations from the active locale
  const releaseNotesStatus = "idle";
  return <Dialog status={releaseNotesStatus}>{t("release_notes.load_failed")}{t("release_notes.retry")}</Dialog>;
}
`,
  );
  fs.writeFileSync(
    path.join(sourceRoot, "ReleaseNotesResource.test.ts"),
    'test("loads the packaged document through the narrow Tauri command", () => assert(true));\ntest("shows a bounded release notes load failure and retries from its own control", () => assert(true));\n',
  );
  for (const filename of [
    "arrow.png",
    "bg.jpg",
    "icon1.png",
    "icon2.png",
    "icon3.png",
    "icon4.png",
    "img1.png",
    "img2.png",
    "img3.png",
    "pay1.png",
    "pay2.png",
    "select.png",
  ]) {
    fs.writeFileSync(path.join(guiRoot, "public", "brand-support", "sponsor", filename), "fixture");
  }
}

/** 把前端运行时切换为只有设置页的精简侧栏配置。 */
function writeCompactFrontendFixture(guiRoot) {
  const sourceRoot = path.join(guiRoot, "src");
  fs.rmSync(sourceRoot, { recursive: true, force: true });
  fs.rmSync(path.join(guiRoot, "public", "brand-support", "sponsor"), { recursive: true, force: true });
  fs.mkdirSync(path.join(sourceRoot, "routes"), { recursive: true });
  fs.writeFileSync(
    path.join(sourceRoot, "AppShell.tsx"),
    `
import { AppShell, NavLink } from "@mantine/core";

export const sidebarMode = "compact";
export const APP_SIDEBAR_WIDTHS = { compact: 80 };
export const logoSizes = { compact: 36 };
export const APP_SIDEBAR_COMPACT_PADDING_PX = 6;
export const APP_SIDEBAR_COMPACT_SECTION_GAP_PX = 8;
export const APP_SIDEBAR_NAV_ICON_SIZE_PX = 22;
export const APP_SIDEBAR_LABEL_FONT_SIZE_PX = 11;
export const APP_SIDEBAR_LABEL_LINE_HEIGHT = 1.25;
export const APP_SIDEBAR_COMPACT_NAV_ITEM_MIN_HEIGHT_PX = 56;
export const APP_SIDEBAR_COMPACT_NAV_ITEM_PADDING_BLOCK_PX = 4;
export const APP_SIDEBAR_COMPACT_NAV_ITEM_GAP_PX = 4;
export const compactLayout = "icon-above-label";
export const routes = ["/settings"];

export function AppSidebarTemplate() {
  return (
    <nav style={{ position: "fixed", height: "100dvh", borderInlineEnd: "1px solid var(--app-border)" }}>
      <NavLink
        active={true}
        aria-label="Home"
        styles={{
          body: { overflow: "visible", textAlign: "center", width: "100%" },
          label: { display: "block", marginInline: "auto", textAlign: "center", width: "100%" },
          root: { alignItems: "center", flexDirection: "column", paddingInline: 0 },
          section: { marginInline: 0 },
        }}
      />
    </nav>
  );
}

export function CompactAppShell() {
  return (
    <AppShell navbar={{ width: APP_SIDEBAR_WIDTHS.compact }}>
      <AppShell.Navbar p={0}><AppSidebarTemplate mode="compact" /></AppShell.Navbar>
    </AppShell>
  );
}
`,
  );
  fs.writeFileSync(path.join(sourceRoot, "routes", "settings.tsx"), "export function SettingsPage() { return null; }\n");
}

/** 在隔离目录创建满足已选单实例与托盘契约的最小项目夹具。 */
function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gui-lifecycle-contract-"));
  const guiRoot = path.join(root, "sample_gui");
  fs.mkdirSync(path.join(guiRoot, "src-tauri", "src"), { recursive: true });
  fs.mkdirSync(path.join(guiRoot, "src-tauri", "locales"), { recursive: true });
  fs.mkdirSync(path.join(guiRoot, "src-tauri", "icons"), { recursive: true });
  writeDetailedFrontendFixture(guiRoot);
  writeInitializationProfile(root);
  fs.writeFileSync(
    path.join(root, "Cargo.toml"),
    `[workspace]\nmembers = ["sample_gui/src-tauri"]\n\n[workspace.dependencies]\ntauri = { version = "2.0.0", features = ["tray-icon"] }\ntauri-plugin-single-instance = { version = "2.0.0" }\ntokio = { version = "1.0.0", features = ["macros", "rt", "fs"] }\nserde = { version = "1.0.0" }\nserde_json = { version = "1.0.0" }\n`,
  );
  fs.writeFileSync(
    path.join(guiRoot, "src-tauri", "Cargo.toml"),
    `[package]\nname = "sample_gui"\nversion = "0.1.0"\n\n[dependencies]\ntauri = { workspace = true }\ntauri-plugin-single-instance = { workspace = true }\ntokio = { workspace = true }\nserde = { workspace = true }\nserde_json = { workspace = true }\n`,
  );
  fs.writeFileSync(
    path.join(guiRoot, "src-tauri", "tauri.conf.json"),
    JSON.stringify({ bundle: { icon: ["icons/32x32.png"] } }),
  );
  fs.writeFileSync(
    path.join(guiRoot, "src-tauri", "tauri.release.conf.json"),
    JSON.stringify({ bundle: { resources: { "../../release-notes.json": "release-notes.json" } } }),
  );
  fs.writeFileSync(path.join(guiRoot, "src-tauri", "icons", "32x32.png"), createTrayPng());
  fs.writeFileSync(
    path.join(guiRoot, "src-tauri", "src", "lifecycle.rs"),
    `
use tauri::{Manager, WindowEvent};
use tauri::menu::{Menu, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

const SHOW_WINDOW_ID: &str = "show_window";
const QUIT_ID: &str = "quit";
const RELEASE_NOTES_RESOURCE_PATH: &str = "release-notes.json"; const RELEASE_NOTES_SCHEMA_VERSION: u8 = 2;

struct ReleaseNotesDocument; struct LocalizedReleaseNoteItem;
enum ReleaseNotesLoadError { Invalid }

#[tauri::command]
async fn load_release_notes(app: tauri::AppHandle) -> Result<ReleaseNotesDocument, ReleaseNotesLoadError> {
    let path = app.path().resolve(RELEASE_NOTES_RESOURCE_PATH, tauri::path::BaseDirectory::Resource).unwrap();
    let _metadata = tokio::fs::symlink_metadata(&path).await.unwrap();
    let bytes = tokio::fs::read(path).await.unwrap();
    serde_json::from_slice(&bytes).map_err(|_| ReleaseNotesLoadError::Invalid)
}

fn restore_main_window(app: &tauri::AppHandle) {
    let window = app.get_webview_window("main").unwrap();
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

fn run() {
    let _builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            restore_main_window(app);
        }))
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![load_release_notes])
        .setup(|app| {
            install_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| handle_window(window, event));
}

fn install_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let show = MenuItemBuilder::with_id(SHOW_WINDOW_ID, rust_i18n::t!("tray.show_window")).build(app)?;
    let quit = MenuItemBuilder::with_id(QUIT_ID, rust_i18n::t!("tray.quit")).build(app)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    let icon = app.default_window_icon().expect("bundled app icon must exist").clone();
    TrayIconBuilder::with_id("main")
        .icon(icon)
        .menu(&menu)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                let window = tray.app_handle().get_webview_window("main").unwrap();
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show_window" => {
                let window = app.get_webview_window("main").unwrap();
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

fn handle_window(window: &tauri::Window, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = window.hide();
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn single_instance_plugin_is_registered_first() {
        assert!(true);
    }

    #[test]
    fn second_launch_restores_existing_main_window() {
        assert!(true);
    }

    #[test]
    fn tray_show_restores_and_focuses_main_window() {
        assert!(true);
    }

    #[test]
    fn close_request_hides_without_exit() {
        assert!(true);
    }

    #[test]
    fn tray_quit_exits_application() {
        assert!(true);
    }

    #[test]
    fn tray_labels_resolve_for_supported_locales() {
        assert_eq!("显示窗口", "显示窗口");
        assert_eq!("Show Window", "Show Window");
    }

    #[test]
    fn tray_labels_fall_back_to_english() {
        assert_eq!("Show Window", "Show Window");
    }

    #[test]
    fn language_change_updates_tray_menu_labels() {
        assert_ne!("显示窗口", "Show Window");
    }

    #[test]
    fn parses_valid_release_notes_resource() {
        assert!(true);
    }

    #[test]
    fn rejects_invalid_release_notes_resource() {
        assert!(true);
    }
}
`,
  );
  fs.writeFileSync(
    path.join(guiRoot, "src-tauri", "locales", "zh-CN.yml"),
    "tray:\n  show_window: 显示窗口\n  quit: 退出\n",
  );
  fs.writeFileSync(
    path.join(guiRoot, "src-tauri", "locales", "en-US.yml"),
    "tray:\n  show_window: Show Window\n  quit: Quit\n",
  );
  return { root, guiRoot };
}

/** 把默认夹具切换为未选择托盘和单实例的合法关闭即退配置。 */
function disableTrayAndSingleInstance(root, guiRoot) {
  writeInitializationProfile(root, {
    about_page: "disabled",
    sidebar_mode: "compact",
    single_instance: "disabled",
    sponsor_page: "disabled",
    system_tray: "disabled",
  });
  fs.writeFileSync(
    path.join(root, "Cargo.toml"),
    `[workspace]\nmembers = ["sample_gui/src-tauri"]\n\n[workspace.dependencies]\ntauri = { version = "2.0.0" }\n`,
  );
  fs.writeFileSync(
    path.join(guiRoot, "src-tauri", "Cargo.toml"),
    `[package]\nname = "sample_gui"\nversion = "0.1.0"\n\n[dependencies]\ntauri = { workspace = true }\n`,
  );
  fs.writeFileSync(
    path.join(guiRoot, "src-tauri", "src", "lifecycle.rs"),
    `
use tauri::WindowEvent;

fn run() {
    let _builder = tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .on_window_event(|window, event| exit_on_close(window, event));
}

fn exit_on_close(window: &tauri::Window, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { .. } = event {
        window.app_handle().exit(0);
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn close_last_window_exits_application() {
        assert!(true);
    }
}
`,
  );
  writeCompactFrontendFixture(guiRoot);
}

/** 在测试结束后删除当前用例创建的隔离项目。 */
function withFixture(callback) {
  const fixture = createFixture();
  try {
    callback(fixture);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

test("accepts a complete single-instance and tray lifecycle contract", () => {
  withFixture(({ root }) => {
    assert.deepEqual(verifyGuiLifecycleContract(root, "sample_gui"), []);
    const result = spawnSync(process.execPath, [SCRIPT, "--root", root, "--gui-dir", "sample_gui"], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /GUI lifecycle contract passed/u);
  });
});

test("accepts an explicit no-tray no-single-instance close-on-last-window contract", () => {
  withFixture(({ root, guiRoot }) => {
    disableTrayAndSingleInstance(root, guiRoot);
    assert.deepEqual(verifyGuiLifecycleContract(root, "sample_gui"), []);
  });
});

test("rejects a GUI initialization without the dedicated capability profile", () => {
  withFixture(({ root }) => {
    fs.rmSync(path.join(root, "docs", "GUI_APP_PROFILE.md"));
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /GUI 初始化资料/u,
    );
  });
});

test("rejects an unresolved GUI sidebar mode", () => {
  withFixture(({ root }) => {
    writeInitializationProfile(root, { sidebar_mode: "pending" });
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /sidebar_mode 必须为 compact 或 detailed/u,
    );
  });
});

test("rejects a final profile that omits the materialized detailed sidebar default", () => {
  withFixture(({ root }) => {
    const profile = path.join(root, "docs", "GUI_APP_PROFILE.md");
    fs.writeFileSync(
      profile,
      fs.readFileSync(profile, "utf8").replace("sidebar_mode = detailed\n", ""),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /缺少字段：sidebar_mode；初始化器应在用户未选择时写入 detailed/u,
    );
  });
});

test("rejects an enabled about page without its route or runtime component", () => {
  withFixture(({ root, guiRoot }) => {
    const shell = path.join(guiRoot, "src", "AppShell.tsx");
    fs.writeFileSync(shell, fs.readFileSync(shell, "utf8").replace(', "/about"', ""));
    fs.rmSync(path.join(guiRoot, "src", "routes", "about.tsx"));
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /选择关于页时缺少 \/about 路由.*选择关于页时缺少运行时组件/su,
    );
  });
});

test("rejects a GUI without the release-only resource mapping", () => {
  withFixture(({ root, guiRoot }) => {
    fs.rmSync(path.join(guiRoot, "src-tauri", "tauri.release.conf.json"));
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /更新日志发布配置/u,
    );
  });
});

test("rejects an enabled about page without a registered release notes command", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs
        .readFileSync(source, "utf8")
        .replace("        .invoke_handler(tauri::generate_handler![load_release_notes])\n", ""),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /generate_handler!\[load_release_notes\]/u,
    );
  });
});

test("rejects an enabled about page without the narrow frontend loader", () => {
  withFixture(({ root, guiRoot }) => {
    fs.rmSync(path.join(guiRoot, "src", "releaseNotesResource.ts"));
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /invoke<unknown>\(command\)/u,
    );
  });
});

test("rejects a GUI without the fixed settings route and runtime component", () => {
  withFixture(({ root, guiRoot }) => {
    const shell = path.join(guiRoot, "src", "AppShell.tsx");
    fs.writeFileSync(shell, fs.readFileSync(shell, "utf8").replace('"/settings", ', ""));
    fs.rmSync(path.join(guiRoot, "src", "routes", "settings.tsx"));
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /缺少 \/settings 路由.*缺少设置页运行时组件/su,
    );
  });
});

test("rejects a disabled about page with a residual runtime route", () => {
  withFixture(({ root }) => {
    writeInitializationProfile(root, { about_page: "disabled" });
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /未选择关于页时不得保留 \/about 路由/u,
    );
  });
});

test("rejects a disabled about page with a residual release notes runtime", () => {
  withFixture(({ root, guiRoot }) => {
    disableTrayAndSingleInstance(root, guiRoot);
    const settings = path.join(guiRoot, "src", "routes", "settings.tsx");
    fs.appendFileSync(settings, "\nconst load_release_notes = true;\n");
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /未选择关于页时不得保留更新日志运行时实现/u,
    );
  });
});

test("rejects an enabled sponsor page with incomplete local media", () => {
  withFixture(({ root, guiRoot }) => {
    fs.rmSync(path.join(guiRoot, "public", "brand-support", "sponsor", "pay2.png"));
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /选择赞助页时缺少完整本地媒体 pay2\.png/u,
    );
  });
});

test("rejects disabled sponsor media left in the runtime bundle", () => {
  withFixture(({ root }) => {
    writeInitializationProfile(root, { sponsor_page: "disabled" });
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /未选择赞助页时不得保留 public\/brand-support\/sponsor/u,
    );
  });
});

test("rejects a disabled sponsor page with residual route and component", () => {
  withFixture(({ root, guiRoot }) => {
    writeInitializationProfile(root, { sponsor_page: "disabled" });
    fs.rmSync(path.join(guiRoot, "public", "brand-support", "sponsor"), { recursive: true });
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /未选择赞助页时不得保留 \/sponsor 路由.*未选择赞助页时不得保留运行时组件/su,
    );
  });
});

test("rejects frontend sidebar wiring that disagrees with the recorded mode", () => {
  withFixture(({ root, guiRoot }) => {
    const shell = path.join(guiRoot, "src", "AppShell.tsx");
    fs.writeFileSync(shell, fs.readFileSync(shell, "utf8").replaceAll('"detailed"', '"compact"'));
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /未把 sidebar_mode = detailed 接入实际侧栏/u,
    );
  });
});

test("rejects detailed sidebar without persistent collapsed-name disclosure", () => {
  withFixture(({ root, guiRoot }) => {
    const shell = path.join(guiRoot, "src", "AppShell.tsx");
    fs.writeFileSync(shell, fs.readFileSync(shell, "utf8").replaceAll("localStorage", "removedStorage").replaceAll("Tooltip", "RemovedTip"));
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /详细侧栏缺少收起名称 Tooltip契约.*详细侧栏缺少独立折叠偏好契约/su,
    );
  });
});

test("rejects detailed AppShell width drift after collapse", () => {
  withFixture(({ root, guiRoot }) => {
    const shell = path.join(guiRoot, "src", "AppShell.tsx");
    const source = fs.readFileSync(shell, "utf8")
      .replace("navbar={{ width: navbarWidth }}", "navbar={{ width: APP_SIDEBAR_WIDTHS.detailedExpanded }}")
      .replace("data-navbar-width={navbarWidth}", "data-navbar-width={APP_SIDEBAR_WIDTHS.detailedExpanded}");
    fs.writeFileSync(shell, source);
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /详细侧栏缺少Mantine navbar 同步宽度契约.*详细侧栏缺少可观察 navbar 同步宽度契约/su,
    );
  });
});

test("rejects detailed identity containers that proxy collapse clicks", () => {
  withFixture(({ root, guiRoot }) => {
    const shell = path.join(guiRoot, "src", "AppShell.tsx");
    const source = fs.readFileSync(shell, "utf8").replace(
      '<div data-testid="app-sidebar-identity" p="xs">',
      '<div data-testid="app-sidebar-identity" onClick={() => onCollapsedChange(true)} p="xs">',
    );
    fs.writeFileSync(shell, source);
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /详细侧栏身份区父级不得代理折叠点击/u,
    );
  });
});

test("rejects compact sidebar layout drift", () => {
  withFixture(({ root, guiRoot }) => {
    disableTrayAndSingleInstance(root, guiRoot);
    const shell = path.join(guiRoot, "src", "AppShell.tsx");
    fs.writeFileSync(shell, fs.readFileSync(shell, "utf8").replace("compact: 80", "compact: 79"));
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /精简侧栏缺少80px 固定宽度契约/u,
    );
  });
});

test("rejects compact sidebar fixed em label boxes", () => {
  withFixture(({ root, guiRoot }) => {
    disableTrayAndSingleInstance(root, guiRoot);
    const shell = path.join(guiRoot, "src", "AppShell.tsx");
    const source = fs.readFileSync(shell, "utf8").replace('width: "100%"', 'width: "10em"');
    fs.writeFileSync(shell, source);
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /精简侧栏名称不得使用固定 em\/ch 占位盒/u,
    );
  });
});

test("rejects close-hide lifecycle code when system tray was not selected", () => {
  withFixture(({ root }) => {
    writeInitializationProfile(root, { system_tray: "disabled" });
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /不得保留托盘\/关闭隐藏实现：prevent_close/u,
    );
  });
});

test("rejects no-tray lifecycle without explicit close exit", () => {
  withFixture(({ root, guiRoot }) => {
    disableTrayAndSingleInstance(root, guiRoot);
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(source, fs.readFileSync(source, "utf8").replace("window.app_handle().exit(0);", "let _ = window;"));
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /必须在 CloseRequested 中显式调用 AppHandle::exit\(0\)/u,
    );
  });
});

test("rejects a no-tray close-exit handler not wired into the builder", () => {
  withFixture(({ root, guiRoot }) => {
    disableTrayAndSingleInstance(root, guiRoot);
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8").replace("\n        .on_window_event(|window, event| exit_on_close(window, event))", ""),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /显式退出处理必须由 Tauri Builder \.on_window_event/u,
    );
  });
});

test("rejects single-instance dependencies when the capability was not selected", () => {
  withFixture(({ root }) => {
    writeInitializationProfile(root, { single_instance: "disabled" });
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /不得声明 tauri-plugin-single-instance/u,
    );
  });
});

test("rejects residual about-page dependencies when the capability was not selected", () => {
  withFixture(({ root, guiRoot }) => {
    disableTrayAndSingleInstance(root, guiRoot);
    fs.appendFileSync(
      path.join(guiRoot, "src-tauri", "Cargo.toml"),
      "\n[dependencies.tokio]\nworkspace = true\n",
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /未选择关于页时.*不得声明 tokio 依赖/u,
    );
  });
});

test("accepts table-form Cargo dependencies and MenuItem with_id", () => {
  withFixture(({ root, guiRoot }) => {
    fs.writeFileSync(
      path.join(root, "Cargo.toml"),
      `[workspace]\nmembers = ["sample_gui/src-tauri"]\n\n[workspace.dependencies.tauri]\nversion = "2.0.0"\nfeatures = ["tray-icon"]\n\n[workspace.dependencies.tauri-plugin-single-instance]\nversion = "2.0.0"\n\n[workspace.dependencies.tokio]\nversion = "1.0.0"\nfeatures = ["macros", "rt", "fs"]\n\n[workspace.dependencies.serde]\nversion = "1.0.0"\n\n[workspace.dependencies.serde_json]\nversion = "1.0.0"\n`,
    );
    fs.writeFileSync(
      path.join(guiRoot, "src-tauri", "Cargo.toml"),
      `[package]\nname = "sample_gui"\nversion = "0.1.0"\n\n[dependencies.tauri]\nworkspace = true\n\n[dependencies.tauri-plugin-single-instance]\nworkspace = true\n\n[dependencies.tokio]\nworkspace = true\n\n[dependencies.serde]\nworkspace = true\n\n[dependencies.serde_json]\nworkspace = true\n`,
    );
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs
        .readFileSync(source, "utf8")
        .replace("use tauri::menu::MenuItemBuilder;", "use tauri::menu::MenuItem;")
        .replaceAll("MenuItemBuilder::with_id", "MenuItem::with_id"),
    );
    assert.deepEqual(verifyGuiLifecycleContract(root, "sample_gui"), []);
  });
});

test("rejects a GUI whose Tauri dependency lost tray-icon", () => {
  withFixture(({ root }) => {
    const cargo = path.join(root, "Cargo.toml");
    fs.writeFileSync(cargo, fs.readFileSync(cargo, "utf8").replace(', features = ["tray-icon"]', ""));
    assert.match(verifyGuiLifecycleContract(root, "sample_gui").join("\n"), /必须启用 tray-icon/u);
  });
});

test("rejects a GUI missing the workspace single-instance dependency", () => {
  withFixture(({ root }) => {
    const cargo = path.join(root, "Cargo.toml");
    fs.writeFileSync(
      cargo,
      fs.readFileSync(cargo, "utf8").replace('tauri-plugin-single-instance = { version = "2.0.0" }\n', ""),
    );
    assert.match(verifyGuiLifecycleContract(root, "sample_gui").join("\n"), /必须声明 tauri-plugin-single-instance/u);
  });
});

test("rejects a GUI that does not register the single-instance plugin first", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs
        .readFileSync(source, "utf8")
        .replace(
          "let _builder = tauri::Builder::default()\n        .plugin(tauri_plugin_single_instance::init",
          "let _builder = tauri::Builder::default()\n        .plugin(tauri_plugin_os::init())\n        .plugin(tauri_plugin_single_instance::init",
        ),
    );
    assert.match(verifyGuiLifecycleContract(root, "sample_gui").join("\n"), /作为首个 Tauri plugin 注册/u);
  });
});

test("rejects a single-instance callback that does not restore the existing window", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8").replace("restore_main_window(app);", "let _ = app;"),
    );
    assert.match(verifyGuiLifecycleContract(root, "sample_gui").join("\n"), /恢复既有窗口/u);
  });
});

test("rejects a neutral single-instance callback that consumes launch arguments", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs
        .readFileSync(source, "utf8")
        .replace("restore_main_window(app);", "let _received = _args.len();\n            restore_main_window(app);"),
    );
    assert.match(verifyGuiLifecycleContract(root, "sample_gui").join("\n"), /不得消费参数\/工作目录/u);
  });
});

test("rejects a GUI whose runtime no longer creates a tray", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(source, fs.readFileSync(source, "utf8").replaceAll("TrayIconBuilder", "RemovedTrayBuilder"));
    assert.match(verifyGuiLifecycleContract(root, "sample_gui").join("\n"), /创建 Tauri 托盘/u);
  });
});

test("rejects a tray implementation that is not wired into Tauri setup", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8").replace("            install_tray(app)?;", "            let _ = app;"),
    );
    assert.match(verifyGuiLifecycleContract(root, "sample_gui").join("\n"), /setup.*实际调用/u);
  });
});

test("rejects a tray builder that does not attach its menu", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(source, fs.readFileSync(source, "utf8").replace("        .menu(&menu)\n", ""));
    assert.match(verifyGuiLifecycleContract(root, "sample_gui").join("\n"), /绑定 \.menu/u);
  });
});

test("rejects optional default icon fallback that can create an iconless tray", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs
        .readFileSync(source, "utf8")
        .replace(
          'let icon = app.default_window_icon().expect("bundled app icon must exist").clone();',
          "let icon = app.default_window_icon().cloned().unwrap_or_else(|| tauri::image::Image::new(&[], 0, 0));",
        ),
    );
    assert.match(verifyGuiLifecycleContract(root, "sample_gui").join("\n"), /不得缺图标后继续启动/u);
  });
});

test("rejects a bundle config that omits the 32px tray icon source", () => {
  withFixture(({ root, guiRoot }) => {
    const config = path.join(guiRoot, "src-tauri", "tauri.conf.json");
    fs.writeFileSync(config, JSON.stringify({ bundle: { icon: ["icons/icon.icns"] } }));
    assert.match(verifyGuiLifecycleContract(root, "sample_gui").join("\n"), /icons\/32x32\.png/u);
  });
});

test("rejects an all-transparent 32px tray icon source", () => {
  withFixture(({ root, guiRoot }) => {
    fs.writeFileSync(path.join(guiRoot, "src-tauri", "icons", "32x32.png"), createTrayPng(false));
    assert.match(verifyGuiLifecycleContract(root, "sample_gui").join("\n"), /全部像素透明/u);
  });
});

test("rejects missing lifecycle regression coverage", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8").replace("tray_quit_exits_application", "renamed_test"),
    );
    assert.match(verifyGuiLifecycleContract(root, "sample_gui").join("\n"), /tray_quit_exits_application/u);
  });
});

test("rejects tray labels that expose raw translation keys", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs
        .readFileSync(source, "utf8")
        .replace(
          "    let menu = Menu::with_items(app, &[&show, &quit])?;",
          '    let leaked = MenuItemBuilder::with_id("leaked", "tray.show_window").build(app)?;\n    let menu = Menu::with_items(app, &[&show, &quit, &leaked])?;',
        ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /不得把 tray\.show_window/u,
    );
  });
});

test("rejects tray i18n regression coverage without assertions", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs
        .readFileSync(source, "utf8")
        .replace(
          'fn tray_labels_fall_back_to_english() {\n        assert_eq!("Show Window", "Show Window");\n    }',
          "fn tray_labels_fall_back_to_english() {}",
        ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /固定 GUI 生命周期回归必须包含真实断言/u,
    );
  });
});

test("rejects missing single-instance regression coverage", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8").replace("second_launch_restores_existing_main_window", "renamed_test"),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /second_launch_restores_existing_main_window/u,
    );
  });
});

test("rejects missing native tray translations", () => {
  withFixture(({ root, guiRoot }) => {
    fs.rmSync(path.join(guiRoot, "src-tauri", "locales", "zh-CN.yml"));
    assert.match(verifyGuiLifecycleContract(root, "sample_gui").join("\n"), /中文托盘资源/u);
  });
});
