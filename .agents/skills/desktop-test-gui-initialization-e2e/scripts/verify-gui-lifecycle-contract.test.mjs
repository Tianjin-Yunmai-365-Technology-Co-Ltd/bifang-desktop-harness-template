import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  SCRIPT,
  createTrayPng,
  disableTrayAndSingleInstance,
  withFixture,
  writeInitializationProfile,
} from "./verify-gui-lifecycle-contract.fixture.mjs";
import { registerGlobalShortcutContractTests } from "./gui-global-shortcut-contract.test-cases.mjs";
import { verifyGuiLifecycleContract } from "./verify-gui-lifecycle-contract.mjs";

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
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8")
        .replace(
          "fn resolve_system_locale(saved_language: Option<String>) -> String {\n    normalize_bcp47_locale(tauri_plugin_os::locale(), saved_language)\n}\n",
          `fn resolve_system_locale(saved_language: Option<String>) -> String {\n    normalize_bcp47_locale(tauri_plugin_os::locale(), saved_language)\n}\n\nfn saved_window_geometry_is_recoverable(window: (i32, i32, u32, u32), monitors: &[(i32, i32, u32, u32)]) -> bool {\n    let (x, y, width, height) = window;\n    width >= 960 && height >= 640 && monitors.iter().any(|&(mx, my, mw, mh)| {\n        let (x, y, mx, my) = (i64::from(x), i64::from(y), i64::from(mx), i64::from(my));\n        x < mx + i64::from(mw) && x + i64::from(width) > mx && y < my + i64::from(mh) && y + i64::from(height) > my\n    })\n}\n\nfn ensure_main_window_is_recoverable(app: &tauri::AppHandle) -> tauri::Result<()> {\n    let Some(window) = app.get_webview_window(\"main\") else { return Ok(()); };\n    window.set_min_size(Some(tauri::LogicalSize::new(960.0, 640.0)))?;\n    let position = window.outer_position()?;\n    let size = window.outer_size()?;\n    let monitors = window\n        .available_monitors()?\n        .into_iter()\n        .map(|m| (m.position().x, m.position().y, m.size().width, m.size().height))\n        .collect::<Vec<_>>();\n    if !saved_window_geometry_is_recoverable((position.x, position.y, size.width, size.height), &monitors) {\n        window.set_size(tauri::LogicalSize::new(1440.0, 900.0))?;\n        window.center()?;\n    }\n    Ok(())\n}\n`,
        )
        .replace(
          ".setup(|_app| { let _locale = resolve_system_locale(None); Ok(()) })",
          ".setup(|app| { let _locale = resolve_system_locale(None); ensure_main_window_is_recoverable(app.handle())?; Ok(()) })",
        ),
    );
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

test("rejects a nine-field GUI profile written outside the fixed order", () => {
  withFixture(({ root }) => {
    const profile = path.join(root, "docs", "GUI_APP_PROFILE.md");
    fs.writeFileSync(
      profile,
      fs
        .readFileSync(profile, "utf8")
        .replace(
          "system_notification = enabled\nautostart = enabled\n",
          "autostart = enabled\nsystem_notification = enabled\n",
        ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /字段顺序必须为：system_tray → system_notification → autostart → about_page → sponsor_page → single_instance → deep_link → global_shortcut → sidebar_mode/u,
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

registerGlobalShortcutContractTests();
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
        .replace("load_release_notes, ", ""),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /load_release_notes/u,
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

test("rejects a frontend AppMetadata decoder that trusts IPC fields", () => {
  withFixture(({ root, guiRoot }) => {
    const commands = path.join(guiRoot, "src", "lib", "tauriCommands.ts");
    fs.writeFileSync(
      commands,
      fs
        .readFileSync(commands, "utf8")
        .replace(
          'typeof value.productDefinitionRequired !== "boolean"',
          'typeof value.productDefinitionRequired === "undefined"',
        )
        .replace(
          'const title = readString(value, "title");',
          'const title = String(value.title);',
        ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /严格验证 productDefinitionRequired boolean.*严格验证非空字符串字段：title/su,
    );
  });
});

test("rejects a frontend that does not invoke the fixed metadata command", () => {
  withFixture(({ root, guiRoot }) => {
    const commands = path.join(guiRoot, "src", "lib", "tauriCommands.ts");
    fs.writeFileSync(
      commands,
      fs
        .readFileSync(commands, "utf8")
        .replace('invoke<unknown>("get_app_metadata")', 'invoke<unknown>("metadata")'),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /unknown 解码后调用固定 Tauri command：get_app_metadata/u,
    );
  });
});

test("rejects App runtime that does not consume metadata title or locale commands", () => {
  withFixture(({ root, guiRoot }) => {
    const app = path.join(guiRoot, "src", "App.tsx");
    fs.writeFileSync(
      app,
      fs
        .readFileSync(app, "utf8")
        .replace("      document.title = metadata.title;", "      void metadata;")
        .replace("    void getSystemLocale().then(setLanguage);", "")
        .replace(
          "    const authoritativeLanguage = await setInterfaceLanguage(nextLanguage);",
          "    const authoritativeLanguage = nextLanguage;",
        ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /实际消费 getSystemLocale.*通过 setInterfaceLanguage 写入语言选择.*AppMetadata\.title 更新 document\.title/su,
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
    writeInitializationProfile(root, { deep_link: "disabled", single_instance: "disabled" });
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /不得声明 tauri-plugin-single-instance/u,
    );
  });
});

test("rejects every system-notification residual when that capability is disabled", () => {
  withFixture(({ root, guiRoot }) => {
    disableTrayAndSingleInstance(root, guiRoot);
    fs.appendFileSync(
      path.join(root, "Cargo.toml"),
      'tauri-plugin-notification = "2.4.0"\n',
    );
    fs.appendFileSync(
      path.join(guiRoot, "src", "routes", "settings.tsx"),
      '\nconst system_notification_title = "residual";\n',
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /未选择系统通知时不得声明通知插件.*未选择系统通知时不得保留设置页运行时/su,
    );
  });
});

test("rejects enabled system-notification authority state in WebView storage or Jotai", () => {
  withFixture(({ root, guiRoot }) => {
    fs.appendFileSync(
      path.join(guiRoot, "src", "routes", "settings.tsx"),
      "\nconst systemNotificationAtom = atom(\n  false,\n);\nlocalStorage.setItem(\n  'system_notification_enabled',\n  'false',\n);\n",
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /不得将系统通知状态持久化到 WebView 层（localStorage\/sessionStorage\/Jotai atom\/TanStack Query）/u,
    );
  });
});

test("rejects every autostart residual when that capability is disabled", () => {
  withFixture(({ root, guiRoot }) => {
    disableTrayAndSingleInstance(root, guiRoot);
    fs.appendFileSync(
      path.join(root, "Cargo.toml"),
      'tauri-plugin-autostart = "2.5.1"\n',
    );
    fs.appendFileSync(
      path.join(guiRoot, "src-tauri", "src", "lifecycle.rs"),
      "\nfn get_autostart_enabled() {}\n",
    );
    fs.appendFileSync(
      path.join(guiRoot, "src", "routes", "settings.tsx"),
      '\nconst autostart_title = "residual";\n',
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /未选择开机自启时不得声明 tauri-plugin-autostart.*未选择开机自启时不得保留运行时.*未选择开机自启时不得保留设置页运行时/su,
    );
  });
});

test("rejects enabled autostart authority state in WebView storage or query cache", () => {
  withFixture(({ root, guiRoot }) => {
    fs.appendFileSync(
      path.join(guiRoot, "src", "routes", "settings.tsx"),
      '\nconst queryClient = { setQueryData: () => {} } as const;\nqueryClient.setQueryData(\n  ["autostart"],\n  { enabled: true },\n);\nconst autostartAtom = atomWithStorage(\n  "autostart",\n  false,\n);\n',
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /不得将开机自启状态持久化到 WebView 层（localStorage\/sessionStorage\/Jotai atom\/TanStack Query）/u,
    );
  });
});

test("rejects notification and autostart WebView packages or ACLs", () => {
  withFixture(({ root, guiRoot }) => {
    fs.writeFileSync(
      path.join(guiRoot, "package.json"),
      JSON.stringify({
        dependencies: {
          "@tauri-apps/plugin-autostart": "^2.0.0",
          "@tauri-apps/plugin-notification": "^2.0.0",
        },
      }),
    );
    const capabilityRoot = path.join(guiRoot, "src-tauri", "capabilities");
    fs.mkdirSync(capabilityRoot, { recursive: true });
    fs.writeFileSync(
      path.join(capabilityRoot, "default.json"),
      JSON.stringify({ permissions: ["autostart:allow-enable", "notification:allow-notify"] }),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /不得安装 Rust-only 能力的 JS 插件.*不得获得 Rust-only 插件 ACL/su,
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
      `[workspace]\nmembers = ["sample_gui/src-tauri"]\n\n[workspace.dependencies.mac-usernotifications]\nversion = "0.3.1"\n\n[workspace.dependencies.tauri]\nversion = "2.0.0"\nfeatures = ["tray-icon"]\n\n[workspace.dependencies.tauri-plugin-autostart]\nversion = "2.5.1"\n\n[workspace.dependencies.tauri-plugin-deep-link]\nversion = "2.4.10"\n\n[workspace.dependencies.tauri-plugin-global-shortcut]\nversion = "2.3.2"\n\n[workspace.dependencies.tauri-plugin-notification]\nversion = "2.4.0"\n\n[workspace.dependencies.tauri-plugin-os]\nversion = "2.3.2"\n\n[workspace.dependencies.tauri-plugin-single-instance]\nversion = "2.4.4"\nfeatures = ["deep-link"]\n\n[workspace.dependencies.tauri-plugin-updater]\nversion = "2.11.0"\n\n[workspace.dependencies.tauri-plugin-window-state]\nversion = "2.4.1"\n\n[workspace.dependencies.tokio]\nversion = "1.0.0"\nfeatures = ["macros", "rt", "fs", "sync"]\n\n[workspace.dependencies.serde]\nversion = "1.0.0"\n\n[workspace.dependencies.serde_json]\nversion = "1.0.0"\n`,
    );
    fs.writeFileSync(
      path.join(guiRoot, "src-tauri", "Cargo.toml"),
      `[package]\nname = "sample_gui"\nversion = "0.1.0"\n\n[dependencies.tauri]\nworkspace = true\n\n[dependencies.tauri-plugin-deep-link]\nworkspace = true\n\n[dependencies.tauri-plugin-global-shortcut]\nworkspace = true\n\n[dependencies.tauri-plugin-notification]\nworkspace = true\n\n[dependencies.tauri-plugin-os]\nworkspace = true\n\n[dependencies.tauri-plugin-single-instance]\nworkspace = true\n\n[dependencies.tauri-plugin-updater]\nworkspace = true\n\n[dependencies.tauri-plugin-window-state]\nworkspace = true\n\n[dependencies.tokio]\nworkspace = true\n\n[dependencies.serde]\nworkspace = true\n\n[dependencies.serde_json]\nworkspace = true\n\n[target.'cfg(target_os = "macos")'.dependencies.mac-usernotifications]\nworkspace = true\n\n[target.'cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))'.dependencies.tauri-plugin-autostart]\nworkspace = true\n`,
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
      fs.readFileSync(cargo, "utf8").replace('tauri-plugin-single-instance = { version = "2.4.4", features = ["deep-link"] }\n', ""),
    );
    assert.match(verifyGuiLifecycleContract(root, "sample_gui").join("\n"), /tauri-plugin-single-instance/u);
  });
});

test("rejects system-notification dependency lower bounds below the fixed minimums", () => {
  withFixture(({ root }) => {
    const cargo = path.join(root, "Cargo.toml");
    fs.writeFileSync(
      cargo,
      fs
        .readFileSync(cargo, "utf8")
        .replace('mac-usernotifications = "0.3.1"', 'mac-usernotifications = "0.3.0"')
        .replace('tauri-plugin-notification = "2.4.0"', 'tauri-plugin-notification = "2.3.9"'),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /tauri-plugin-notification.*"2\.4\.0".*mac-usernotifications.*"0\.3\.1"/su,
    );
  });
});

test("rejects an autostart dependency below 2.5.1", () => {
  withFixture(({ root }) => {
    const cargo = path.join(root, "Cargo.toml");
    fs.writeFileSync(
      cargo,
      fs
        .readFileSync(cargo, "utf8")
        .replace('tauri-plugin-autostart = "2.5.1"', 'tauri-plugin-autostart = "2.5.0"'),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /tauri-plugin-autostart.*"2\.5\.1"/u,
    );
  });
});

test("rejects mac-usernotifications outside the macOS member target", () => {
  withFixture(({ root, guiRoot }) => {
    const cargo = path.join(guiRoot, "src-tauri", "Cargo.toml");
    fs.writeFileSync(
      cargo,
      fs
        .readFileSync(cargo, "utf8")
        .replace(
          '\n[target.\'cfg(target_os = "macos")\'.dependencies]\nmac-usernotifications = { workspace = true }\n',
          "",
        ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /只位于 macOS target dependencies/u,
    );
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
          ".plugin(tauri_plugin_single_instance::init",
          ".plugin(tauri_plugin_os::init())\n        .plugin(tauri_plugin_single_instance::init",
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
      fs
        .readFileSync(source, "utf8")
        .replace(
          ".plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {\n            restore_main_window(app);",
          ".plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {\n            let _ = app;",
        ),
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
        .replace(
          ".plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {\n            restore_main_window(app);",
          ".plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {\n            let _received = _args.len();\n            restore_main_window(app);",
        ),
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

test("rejects missing system-notification worker ownership regression coverage", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs
        .readFileSync(source, "utf8")
        .replace("system_notification_worker_is_owned_and_cancelled", "renamed_test"),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /system_notification_worker_is_owned_and_cancelled/u,
    );
  });
});

test("rejects missing conditional settings failure rollback tests", () => {
  withFixture(({ root, guiRoot }) => {
    const tests = path.join(guiRoot, "src", "SettingsCapabilities.test.tsx");
    fs.writeFileSync(
      tests,
      fs
        .readFileSync(tests, "utf8")
        .replace("system_notification_switch_rolls_back_after_denial", "renamed_notification_test")
        .replace("autostart_switch_rolls_back_after_failure", "renamed_autostart_test"),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /system_notification_switch_rolls_back_after_denial.*autostart_switch_rolls_back_after_failure/su,
    );
  });
});

test("rejects autostart E2E coverage that does not restore the previous OS state", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs
        .readFileSync(source, "utf8")
        .replace(
          /fn autostart_e2e_restores_previous_registration\(\) \{[\s\S]*?assert_eq!\(is_enabled\(\), previous\);\s*\}/u,
          "fn autostart_e2e_restores_previous_registration() { let unchanged = true; assert!(unchanged); }",
        ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /必须记录原状态、切换注册并恢复后重新读取/u,
    );
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
          'fn tray_labels_fall_back_to_english() {\n\t        let fallback = "Show Window";\n\t        assert_eq!(fallback, "Show Window");\n\t    }',
          "fn tray_labels_fall_back_to_english() {}",
        ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /固定 GUI 生命周期回归必须包含非平凡断言/u,
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
