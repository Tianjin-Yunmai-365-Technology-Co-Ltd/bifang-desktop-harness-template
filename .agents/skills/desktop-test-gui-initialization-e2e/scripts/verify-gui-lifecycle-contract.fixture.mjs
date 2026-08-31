import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

export const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "verify-gui-lifecycle-contract.mjs");

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
export function createTrayPng(visible = true) {
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

/** 按固定顺序写入结构检查器要求的七项 GUI 初始化选择。 */
export function writeInitializationProfile(root, overrides = {}) {
  const selection = {
    about_page: "enabled",
    autostart: "enabled",
    sidebar_mode: "detailed",
    single_instance: "enabled",
    sponsor_page: "enabled",
    system_notification: "enabled",
    system_tray: "enabled",
    ...overrides,
  };
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs", "GUI_APP_PROFILE.md"),
    `# GUI 应用资料\n\n\`\`\`gui-initialization-config\nsystem_tray = ${selection.system_tray}\nsystem_notification = ${selection.system_notification}\nautostart = ${selection.autostart}\nabout_page = ${selection.about_page}\nsponsor_page = ${selection.sponsor_page}\nsingle_instance = ${selection.single_instance}\nsidebar_mode = ${selection.sidebar_mode}\n\`\`\`\n`,
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
  fs.writeFileSync(
    path.join(sourceRoot, "routes", "settings.tsx"),
    `
import { Switch } from "@mantine/core";
import { invoke } from "@tauri-apps/api/core";

export const get_system_notification_setting = () => invoke<boolean>("get_system_notification_setting");
export const set_system_notification_enabled = (enabled) => invoke<boolean>("set_system_notification_enabled", { enabled });
export const get_autostart_enabled = () => invoke<boolean>("get_autostart_enabled");
export const set_autostart_enabled = (enabled) => invoke<boolean>("set_autostart_enabled", { enabled });
export function SettingsPage() {
  return <><Switch aria-label="System notification" /><Switch aria-label="Autostart" /></>;
}
`,
  );
  fs.mkdirSync(path.join(sourceRoot, "i18n"), { recursive: true });
  fs.writeFileSync(
    path.join(sourceRoot, "i18n", "en-US.json"),
    JSON.stringify({
      settings: {
        autostart_title: "Open at login",
        system_notification_title: "System notifications",
      },
    }),
  );
  fs.writeFileSync(
    path.join(sourceRoot, "SettingsCapabilities.test.tsx"),
    `
test("system_notification_switch_rolls_back_after_denial", () => assert(true));
test("autostart_switch_rolls_back_after_failure", () => assert(true));
`,
  );
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
    `[workspace]\nmembers = ["sample_gui/src-tauri"]\n\n[workspace.dependencies]\nmac-usernotifications = "0.3.1"\ntauri = { version = "2.0.0", features = ["tray-icon"] }\ntauri-plugin-autostart = "2.5.1"\ntauri-plugin-notification = "2.4.0"\ntauri-plugin-single-instance = { version = "2.0.0" }\ntokio = { version = "1.0.0", features = ["macros", "rt", "fs", "sync"] }\nserde = { version = "1.0.0" }\nserde_json = { version = "1.0.0" }\n`,
  );
  fs.writeFileSync(
    path.join(guiRoot, "src-tauri", "Cargo.toml"),
    `[package]\nname = "sample_gui"\nversion = "0.1.0"\n\n[dependencies]\ntauri = { workspace = true }\ntauri-plugin-notification = { workspace = true }\ntauri-plugin-single-instance = { workspace = true }\ntokio = { workspace = true }\nserde = { workspace = true }\nserde_json = { workspace = true }\n\n[target.'cfg(target_os = "macos")'.dependencies]\nmac-usernotifications = { workspace = true }\n\n[target.'cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))'.dependencies]\ntauri-plugin-autostart = { workspace = true }\n`,
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
use tauri_plugin_autostart::ManagerExt;
use tokio::sync::{mpsc, oneshot};
use tokio::task::JoinHandle;
#[cfg(not(target_os = "macos"))]
use tauri_plugin_notification::NotificationExt;

const SHOW_WINDOW_ID: &str = "show_window";
const QUIT_ID: &str = "quit";
const RELEASE_NOTES_RESOURCE_PATH: &str = "release-notes.json"; const RELEASE_NOTES_SCHEMA_VERSION: u8 = 2;

struct ReleaseNotesDocument; struct LocalizedReleaseNoteItem;
enum ReleaseNotesLoadError { Invalid }
enum NotificationCommand { RequestPermission(oneshot::Sender<Result<(), &'static str>>), Deliver }
struct NotificationWorker { sender: mpsc::Sender<NotificationCommand>, task: JoinHandle<()> }

impl Drop for NotificationWorker {
    fn drop(&mut self) {
        self.task.abort();
    }
}

#[tauri::command]
async fn load_release_notes(app: tauri::AppHandle) -> Result<ReleaseNotesDocument, ReleaseNotesLoadError> {
    let path = app.path().resolve(RELEASE_NOTES_RESOURCE_PATH, tauri::path::BaseDirectory::Resource).unwrap();
    let _metadata = tokio::fs::symlink_metadata(&path).await.unwrap();
    let bytes = tokio::fs::read(path).await.unwrap();
    serde_json::from_slice(&bytes).map_err(|_| ReleaseNotesLoadError::Invalid)
}

#[tauri::command]
async fn get_system_notification_setting() -> Result<bool, &'static str> { Ok(false) }

#[tauri::command]
async fn set_system_notification_enabled(enabled: bool) -> Result<bool, &'static str> {
    let (_reply_tx, _reply_rx) = oneshot::channel();
    if enabled { request_system_notification_permission().await?; }
    persist_system_notification_setting(enabled).await?;
    Ok(enabled)
}

async fn persist_system_notification_setting(_enabled: bool) -> Result<(), &'static str> { Ok(()) }

#[cfg(target_os = "macos")]
async fn request_system_notification_permission() -> Result<(), &'static str> {
    if mac_usernotifications::request_auth().await.unwrap_or(false) { Ok(()) } else { Err("permission-denied") }
}

#[cfg(target_os = "macos")]
async fn deliver_system_notification() -> Result<(), &'static str> {
    mac_usernotifications::Notification::new()
        .title("localized title")
        .message("localized body")
        .default_sound()
        .send()
        .await
        .map(|_| ())
        .map_err(|_| "delivery-failed")
}

#[cfg(not(target_os = "macos"))]
async fn request_system_notification_permission() -> Result<(), &'static str> {
    let _permission = app.notification().request_permission();
    Ok(())
}

#[cfg(not(target_os = "macos"))]
async fn deliver_system_notification() -> Result<(), &'static str> {
    app.notification().builder().title("localized title").body("localized body").show().map_err(|_| "delivery-failed")
}

#[tauri::command]
async fn get_autostart_enabled(app: tauri::AppHandle) -> Result<bool, &'static str> {
    app.autolaunch().is_enabled().map_err(|_| "autostart-state-unavailable")
}

#[tauri::command]
async fn set_autostart_enabled(app: tauri::AppHandle, enabled: bool) -> Result<bool, &'static str> {
    let manager = app.autolaunch();
    if enabled { manager.enable() } else { manager.disable() }.map_err(|_| "autostart-mutation-failed")?;
    manager.is_enabled().map_err(|_| "autostart-state-unavailable")
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
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![load_release_notes])
        .invoke_handler(tauri::generate_handler![get_system_notification_setting, set_system_notification_enabled, get_autostart_enabled, set_autostart_enabled])
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
    fn system_notification_defaults_disabled() { assert!(!false); }

    #[test]
    fn system_notification_permission_precedes_persistence() { assert!(true); }

    #[test]
    fn system_notification_delivery_failure_is_observable() { assert!(true); }

    #[test]
    fn system_notification_channel_serializes_authorization_and_delivery() { assert!(true); }

    #[test]
    fn system_notification_worker_is_owned_and_cancelled() { assert!(true); }

    #[test]
    fn macos_system_notifications_use_modern_user_notifications() { assert!(true); }

    #[test]
    fn autostart_defaults_disabled_without_registration() { assert!(!false); }

    #[test]
    fn autostart_state_reads_operating_system_registration() { assert!(true); }

    #[test]
    fn autostart_enable_disable_failures_are_observable() { assert!(true); }

    #[test]
    fn autostart_commands_are_idempotent() { assert!(true); }

    #[test]
    fn autostart_e2e_restores_previous_registration() {
        let previous = is_enabled();
        enable();
        disable();
        assert_eq!(is_enabled(), previous);
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

/** 把默认夹具切换为未选择任何可选宿主能力的合法关闭即退配置。 */
export function disableTrayAndSingleInstance(root, guiRoot) {
  writeInitializationProfile(root, {
    about_page: "disabled",
    autostart: "disabled",
    sidebar_mode: "compact",
    single_instance: "disabled",
    sponsor_page: "disabled",
    system_notification: "disabled",
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
export function withFixture(callback) {
  const fixture = createFixture();
  try {
    callback(fixture);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

