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

/** 在隔离目录创建满足固定单实例与托盘契约的最小项目夹具。 */
function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gui-lifecycle-contract-"));
  const guiRoot = path.join(root, "sample_gui");
  fs.mkdirSync(path.join(guiRoot, "src-tauri", "src"), { recursive: true });
  fs.mkdirSync(path.join(guiRoot, "src-tauri", "locales"), { recursive: true });
  fs.mkdirSync(path.join(guiRoot, "src-tauri", "icons"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "Cargo.toml"),
    `[workspace]\nmembers = ["sample_gui/src-tauri"]\n\n[workspace.dependencies]\ntauri = { version = "2.0.0", features = ["tray-icon"] }\ntauri-plugin-single-instance = { version = "2.0.0" }\n`,
  );
  fs.writeFileSync(
    path.join(guiRoot, "src-tauri", "Cargo.toml"),
    `[package]\nname = "sample_gui"\nversion = "0.1.0"\n\n[dependencies]\ntauri = { workspace = true }\ntauri-plugin-single-instance = { workspace = true }\n`,
  );
  fs.writeFileSync(
    path.join(guiRoot, "src-tauri", "tauri.conf.json"),
    JSON.stringify({ bundle: { icon: ["icons/32x32.png"] } }),
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

test("accepts table-form Cargo dependencies and MenuItem with_id", () => {
  withFixture(({ root, guiRoot }) => {
    fs.writeFileSync(
      path.join(root, "Cargo.toml"),
      `[workspace]\nmembers = ["sample_gui/src-tauri"]\n\n[workspace.dependencies.tauri]\nversion = "2.0.0"\nfeatures = ["tray-icon"]\n\n[workspace.dependencies.tauri-plugin-single-instance]\nversion = "2.0.0"\n`,
    );
    fs.writeFileSync(
      path.join(guiRoot, "src-tauri", "Cargo.toml"),
      `[package]\nname = "sample_gui"\nversion = "0.1.0"\n\n[dependencies.tauri]\nworkspace = true\n\n[dependencies.tauri-plugin-single-instance]\nworkspace = true\n`,
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
