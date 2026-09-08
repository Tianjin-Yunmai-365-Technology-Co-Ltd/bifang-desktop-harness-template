import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  disableTrayAndSingleInstance,
  withFixture,
  writeInitializationProfile,
} from "./verify-gui-lifecycle-contract.fixture.mjs";
import { verifyGuiLifecycleContract } from "./verify-gui-lifecycle-contract.mjs";

function enableFixedShortcut(root) {
  writeInitializationProfile(root, {
    globalShortcutContract: {
      schemaVersion: 1,
      actions: [{
        id: "show_command_palette",
        bindingPolicy: "fixed",
        defaultChord: "Control+Shift+P",
        dispatch: { kind: "host-action", target: "show_command_palette" },
        e2eSafe: true,
      }],
    },
  });
}

test("rejects duplicate GUI initialization profile blocks", () => {
  withFixture(({ root }) => {
    const profile = path.join(root, "docs", "GUI_APP_PROFILE.md");
    const text = fs.readFileSync(profile, "utf8");
    fs.writeFileSync(profile, `${text}\n${text.slice(text.indexOf("```gui-initialization-config"))}`);
    assert.match(verifyGuiLifecycleContract(root, "sample_gui").join("\n"), /必须只有一个.*代码块/u);
  });
});

test("dialog_dependencies_are_fixed", () => {
  const cases = [
    {
      mutate(root) {
        const cargo = path.join(root, "Cargo.toml");
        fs.writeFileSync(
          cargo,
          fs.readFileSync(cargo, "utf8").replace('tauri-plugin-dialog = "2.7.3"\n', ""),
        );
      },
      pattern: /根 \[workspace\.dependencies\].*"2\.7\.3".*tauri-plugin-dialog/u,
    },
    {
      mutate(_root, guiRoot) {
        const cargo = path.join(guiRoot, "src-tauri", "Cargo.toml");
        fs.writeFileSync(
          cargo,
          fs.readFileSync(cargo, "utf8").replace(
            "tauri-plugin-dialog = { workspace = true }\n",
            "",
          ),
        );
      },
      pattern: /member 通过 workspace = true 继承 tauri-plugin-dialog/u,
    },
    {
      mutate(root) {
        const cargo = path.join(root, "Cargo.toml");
        fs.writeFileSync(
          cargo,
          fs.readFileSync(cargo, "utf8").replace(
            'tauri-plugin-dialog = "2.7.3"',
            'tauri-plugin-dialog = "2.7.2"',
          ),
        );
      },
      pattern: /"2\.7\.3".*tauri-plugin-dialog/u,
    },
    {
      mutate(_root, guiRoot) {
        fs.writeFileSync(
          path.join(guiRoot, "package.json"),
          JSON.stringify({
            devDependencies: { "@tauri-apps/plugin-dialog": "^2.7.3" },
          }),
        );
      },
      pattern: /dependencies 生产直依赖 @tauri-apps\/plugin-dialog = \^2\.7\.3/u,
    },
  ];
  for (const { mutate, pattern } of cases) {
    withFixture(({ root, guiRoot }) => {
      mutate(root, guiRoot);
      assert.match(verifyGuiLifecycleContract(root, "sample_gui").join("\n"), pattern);
    });
  }
});

test("dialog_plugin_is_registered_once_in_fixed_order", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8").replace(
        "        .plugin(tauri_plugin_dialog::init())\n",
        "",
      ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /原生 dialog 插件.*恰好注册一次，实际 0 次/u,
    );
  });

  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8").replace(
        "        .plugin(tauri_plugin_dialog::init())\n",
        "        .plugin(tauri_plugin_dialog::init())\n        .plugin(tauri_plugin_dialog::init())\n",
      ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /原生 dialog 插件.*恰好注册一次，实际 2 次/u,
    );
  });

  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    const windowState = "        .plugin(tauri_plugin_window_state::Builder::default().with_state_flags(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED).build())";
    const dialog = "        .plugin(tauri_plugin_dialog::init())";
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8").replace(
        `${windowState}\n${dialog}`,
        `${dialog}\n${windowState}`,
      ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /Tauri plugin 注册顺序必须为：.*window-state → dialog/u,
    );
  });

  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8").replace(
        "tauri_plugin_dialog::init()",
        "tauri_plugin_dialog::init(dialog_config)",
      ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /必须通过 \.plugin\(tauri_plugin_dialog::init\(\)\) 初始化/u,
    );
  });
});

test("rejects deep-link without single-instance", () => {
  withFixture(({ root }) => {
    writeInitializationProfile(root, { deep_link: "enabled", single_instance: "disabled" });
    assert.match(verifyGuiLifecycleContract(root, "sample_gui").join("\n"), /deep_link = enabled.*single_instance = enabled/u);
  });
});

test("rejects a missing system-locale dependency or plugin registration", () => {
  withFixture(({ root, guiRoot }) => {
    const cargo = path.join(root, "Cargo.toml");
    fs.writeFileSync(cargo, fs.readFileSync(cargo, "utf8").replace('tauri-plugin-os = "2.3.2"\n', ""));
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(source, fs.readFileSync(source, "utf8").replace(".plugin(tauri_plugin_os::init())", ""));
    assert.match(verifyGuiLifecycleContract(root, "sample_gui").join("\n"), /2\.3\.2.*os.*恰好注册一次/su);
  });
});

test("rejects browser-only locale wiring without a Rust locale call", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(source, fs.readFileSync(source, "utf8").replace("tauri_plugin_os::locale()", "browser_locale()"));
    assert.match(verifyGuiLifecycleContract(root, "sample_gui").join("\n"), /直接调用 tauri_plugin_os::locale/u);
  });
});

test("rejects treating tauri_plugin_os locale as a Result", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8").replace(
        "tauri_plugin_os::locale(), saved_language",
        "tauri_plugin_os::locale().ok().flatten(), saved_language",
      ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /直接返回 Option<String>.*不得按 Result 调用 \.ok/u,
    );
  });
});

test("rejects system locale wiring without BCP-47 case normalization", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8").replace("\n\t        .to_ascii_lowercase();", ";"),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /BCP-47.*to_ascii_lowercase/u,
    );
  });
});

test("rejects updater code that can check before the NotConfigured gate", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8").replace(
        "if !controller.configured { return UpdaterStatus::NotConfigured; }",
        "if !controller.configured { return UpdaterStatus::Failed; }",
      ),
    );
    assert.match(verifyGuiLifecycleContract(root, "sample_gui").join("\n"), /NotConfigured.*零出站/u);
  });
});

test("rejects a missing explicit empty updater configuration", () => {
  withFixture(({ root, guiRoot }) => {
    const configPath = path.join(guiRoot, "src-tauri", "tauri.conf.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    delete config.plugins.updater;
    fs.writeFileSync(configPath, JSON.stringify(config));
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /plugins\.updater = \{ endpoints: \[\], pubkey: "" \}.*零出站/u,
    );
  });
});

test("rejects updater network or install calls outside check_for_updates", () => {
  for (const method of ["check", "download_and_install", "install"]) {
    withFixture(({ root, guiRoot }) => {
      const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
      fs.appendFileSync(
        source,
        `\nasync fn bypass_update_gate(app: &tauri::AppHandle) { let _ = app.updater().unwrap().${method}().await; }\n`,
      );
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /updater.*只能位于受控 check_for_updates\/UpdateTaskOwner 路径/u,
        `method ${method} must be rejected outside the controlled function`,
      );
    });
  }
});

test("rejects every updater call placed before the NotConfigured early return", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8").replace(
        "if !controller.configured { return UpdaterStatus::NotConfigured; }",
        "let _ = app.updater().unwrap().download_and_install().await;\n\t    if !controller.configured { return UpdaterStatus::NotConfigured; }",
      ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /NotConfigured.*零出站/u,
    );
  });
});

test("ignores updater method-shaped text in Rust comments and strings", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.appendFileSync(
      source,
      '\n// app.updater().unwrap().download_and_install().await\nconst UPDATE_DIAGNOSTIC: &str = ".install(";\n',
    );
    assert.deepEqual(verifyGuiLifecycleContract(root, "sample_gui"), []);
  });
});

test("accepts an updater call inside the owned task body of check_for_updates", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8").replace(
        "let result = app.updater().unwrap().check().await;",
        `let task = tauri::async_runtime::spawn({
            let app = app.clone();
            async move { app.updater().unwrap().check().await }
        });
        let mut owner = UpdateTaskOwner { task: Some(task) };
        let result = owner.task.take().unwrap().await.unwrap();`,
      ),
    );
    assert.deepEqual(verifyGuiLifecycleContract(root, "sample_gui"), []);
  });
});

test("rejects window-state setup that is not wired through the recoverable helper", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8").replace("ensure_main_window_is_recoverable(app.handle())?;", ""),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /ensure_main_window_is_recoverable/u,
    );
  });
});

test("rejects window-state visibility restoration", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8").replace(
        "StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED).build()",
        "StateFlags::SIZE | StateFlags::POSITION | StateFlags::VISIBLE).build()",
      ),
    );
    assert.match(verifyGuiLifecycleContract(root, "sample_gui").join("\n"), /缺少 StateFlags::MAXIMIZED.*不得保存 StateFlags::VISIBLE/su);
  });
});

test("rejects deep-link schemes not derived from project identity", () => {
  withFixture(({ root, guiRoot }) => {
    const config = path.join(guiRoot, "src-tauri", "tauri.conf.json");
    fs.writeFileSync(config, fs.readFileSync(config, "utf8").replace("app-sample", "arbitrary"));
    assert.match(verifyGuiLifecycleContract(root, "sample_gui").join("\n"), /desktop\.schemes.*app-sample/u);
  });
});

test("rejects a deep-link validator that accepts URL prefixes", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8").replace(
        "url == APP_DEEP_LINK_RESTORE_URL",
        'url.starts_with("app-sample://")',
      ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /validate_restore_deep_link.*精确等值.*query\/fragment\/userinfo\/port/u,
    );
  });
});

test("rejects a payload-bearing APP_DEEP_LINK_RESTORE_URL constant", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8").replace(
        'const APP_DEEP_LINK_RESTORE_URL: &str = "app-sample://restore";',
        'const APP_DEEP_LINK_RESTORE_URL: &str = "app-sample://restore?payload=1"; // app-sample://restore',
      ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /APP_DEEP_LINK_RESTORE_URL 必须精确声明为 "app-sample:\/\/restore"/u,
    );
  });
});

test("rejects flattening the deep-link current URL result at the wrong layer", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8").replace(
        /if let Ok\(Some\(urls\)\) = app\.deep_link\(\)\.get_current\(\) \{\s*for url in urls \{/u,
        "for url in app.deep_link().get_current().unwrap_or_default() {",
      ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /Result<Option<Vec<Url>>>.*get_current/u,
    );
  });
});

test("rejects opening deep-link runtime registration APIs on the neutral restore path", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8").replace(
        "app.deep_link().on_open_url(move |event| {",
        "app.deep_link().register_all().unwrap();\n\t        app.deep_link().on_open_url(move |event| {",
      ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /静态 restore 路线.*不得预开运行时注册\/注销\/查询 API/u,
    );
  });
});

test("rejects global shortcut capability without a real registration", () => {
  withFixture(({ root, guiRoot }) => {
    enableFixedShortcut(root);
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8").replace(
        "app.global_shortcut().register(chord.as_str())",
        'Err::<(), _>("not-registered")',
      ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /全局快捷键.*(?:\.register|注册失败|替换)/u,
    );
  });
});

test("rejects a global shortcut handler that fires on press and release", () => {
  withFixture(({ root, guiRoot }) => {
    enableFixedShortcut(root);
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8").replace(
        "if event.state() != ShortcutState::Pressed { return; }",
        "let _state = event.state();",
      ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /只在 ShortcutState::Pressed/u,
    );
  });
});

test("rejects a constant global shortcut registration status", () => {
  withFixture(({ root, guiRoot }) => {
    enableFixedShortcut(root);
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8").replace(
        "app.global_shortcut().is_registered(chord.as_str())",
        "true",
      ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /真实调用 is_registered/u,
    );
  });
});

test("rejects a missing single-instance registration", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8").replace(
        /\s*\.plugin\(tauri_plugin_single_instance::init\([\s\S]*?\}\)\)\n/u,
        "\n",
      ),
    );
    assert.match(verifyGuiLifecycleContract(root, "sample_gui").join("\n"), /single-instance.*实际 0 次/u);
  });
});

test("rejects duplicate notification and autostart plugin registrations", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8")
        .replace(
          ".plugin(tauri_plugin_notification::init())",
          ".plugin(tauri_plugin_notification::init())\n        .plugin(tauri_plugin_notification::init())",
        )
        .replace(
          ".plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))",
          ".plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))\n        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))",
        ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /notification 插件.*实际 2 次.*autostart 插件.*实际 2 次/su,
    );
  });
});

test("rejects disabled notification and autostart dependencies in generic member sections", () => {
  withFixture(({ root, guiRoot }) => {
    disableTrayAndSingleInstance(root, guiRoot);
    const cargo = path.join(guiRoot, "src-tauri", "Cargo.toml");
    fs.appendFileSync(cargo, "\n[dependencies.tauri-plugin-autostart]\nworkspace = true\n\n[dependencies.mac-usernotifications]\nworkspace = true\n");
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /未选择系统通知.*macOS 通知依赖.*未选择开机自启.*tauri-plugin-autostart/su,
    );
  });
});

test("rejects deep-link configuration residuals when the capability is disabled", () => {
  withFixture(({ root, guiRoot }) => {
    disableTrayAndSingleInstance(root, guiRoot);
    const configPath = path.join(guiRoot, "src-tauri", "tauri.conf.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    config.plugins = {
      "deep-link": { desktop: { schemes: ["app-sample"] } },
    };
    fs.writeFileSync(configPath, JSON.stringify(config));
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /未选择深链接时不得保留 plugins\.deep-link.*desktop\.schemes/u,
    );
  });
});

test("accepts equivalent notification cfg attributes without spaces around equals", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8")
        .replaceAll('#[cfg(target_os = "macos")]', '#[cfg(target_os="macos")]')
        .replaceAll('#[cfg(not(target_os = "macos"))]', '#[cfg(not(target_os="macos"))]'),
    );
    assert.deepEqual(verifyGuiLifecycleContract(root, "sample_gui"), []);
  });
});

test("rejects a non-macOS notification permission implementation with an undefined app handle", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs
        .readFileSync(source, "utf8")
        .replace(
          'async fn request_system_notification_permission(app: &tauri::AppHandle) -> Result<(), &\'static str> {\n    let permission = app.notification()',
          'async fn request_system_notification_permission() -> Result<(), &\'static str> {\n    let permission = app.notification()',
        ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /request_system_notification_permission.*macOS 与非 macOS.*app: &tauri::AppHandle/u,
    );
  });
});

test("rejects notification delivery implementations whose app handle signature diverges by platform", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs
        .readFileSync(source, "utf8")
        .replace(
          'async fn deliver_system_notification(app: &tauri::AppHandle, payload: &NotificationPayload) -> Result<(), &\'static str> {\n    app.notification()',
          'async fn deliver_system_notification(payload: &NotificationPayload) -> Result<(), &\'static str> {\n    app.notification()',
        ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /deliver_system_notification.*macOS 与非 macOS.*app: &tauri::AppHandle/u,
    );
  });
});

test("rejects macOS notification permission requests before the current authorization status is read", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs
        .readFileSync(source, "utf8")
        .replace(
          "let mut authorization = get_macos_notification_authorization_status().await?;",
          "let mut authorization = MacosNotificationAuthorizationStatus::NotDetermined;",
        ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /先读取 AuthorizationStatus，只在 NotDetermined 请求并复读/u,
    );
  });
});

test("rejects macOS notification permission requests outside NotDetermined", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs
        .readFileSync(source, "utf8")
        .replace(
          "if matches!(authorization, MacosNotificationAuthorizationStatus::NotDetermined) {",
          "if true {",
        ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /只允许在 NotDetermined 分支请求系统权限/u,
    );
  });
});

test("rejects an unconditional macOS notification permission request appended after the legal request", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs
        .readFileSync(source, "utf8")
        .replace(
          "        authorization = get_macos_notification_authorization_status().await?;\n    }\n    match authorization {",
          "        authorization = get_macos_notification_authorization_status().await?;\n    }\n    let _unconditional_request = mac_usernotifications::request_auth().await;\n    match authorization {",
        ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /必须且只能调用一次 mac_usernotifications::request_auth/u,
    );
  });
});

test("rejects denied macOS notification permission without the fixed settings recovery path", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs
        .readFileSync(source, "utf8")
        .replaceAll(
          "open_macos_notification_settings(app).await?;",
          "let _settings_not_opened = authorization;",
        ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /Denied\/Restricted 必须进入固定 Notifications 系统设置恢复路径/u,
    );
  });
});

test("rejects a still-undetermined macOS notification result without settings recovery", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs
        .readFileSync(source, "utf8")
        .replace(
          "MacosNotificationAuthorizationStatus::NotDetermined => { open_macos_notification_settings(app).await?;",
          "MacosNotificationAuthorizationStatus::NotDetermined => { let _settings_not_opened = authorization;",
        ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /请求后仍为 NotDetermined 时必须打开 Notifications 系统设置/u,
    );
  });
});

test("rejects a macOS notification settings opener with an arbitrary target", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs
        .readFileSync(source, "utf8")
        .replace(
          ".arg(settings_url)",
          ".arg(user_supplied_url)",
        ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /Notifications 设置 opener 缺少受控结果检查/u,
    );
  });
});

test("rejects a macOS notification settings opener that does not target the current app", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs
        .readFileSync(source, "utf8")
        .replace("let bundle_identifier = app.config().identifier.clone();", 'let bundle_identifier = "com.example.other".to_string();'),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /app\.config\(\)\.identifier/u,
    );
  });
});

test("rejects missing macOS notification settings recovery regression coverage", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs
        .readFileSync(source, "utf8")
        .replace("macos_denied_or_restricted_notification_opens_settings", "renamed_test"),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /macos_denied_or_restricted_notification_opens_settings/u,
    );
  });
});

test("rejects enabled commands omitted from the merged invoke handler", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8").replace("get_system_notification_setting, ", ""),
    );
    assert.match(verifyGuiLifecycleContract(root, "sample_gui").join("\n"), /generate_handler! 缺少已启用命令：get_system_notification_setting/u);
  });
});

test("rejects an enabled about page without the updater check command in the merged handler", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8").replace("check_for_updates, load_release_notes", "load_release_notes"),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /generate_handler! 缺少已启用命令：check_for_updates/u,
    );
  });
});

test("keeps the fixed GUI command handler when every optional capability is disabled", () => {
  withFixture(({ root, guiRoot }) => {
    disableTrayAndSingleInstance(root, guiRoot);
    const handlerErrors = verifyGuiLifecycleContract(root, "sample_gui").filter(
      (error) =>
        /invoke_handler|generate_handler|GUI 固定基线命令必须是窄 Tauri command/u.test(
          error,
        ),
    );
    assert.deepEqual(handlerErrors, []);
  });
});

test("rejects missing fixed metadata and locale commands in the merged handler", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs
        .readFileSync(source, "utf8")
        .replace(
          "get_app_metadata, get_system_locale, set_interface_language, ",
          "",
        ),
    );
    const errors = verifyGuiLifecycleContract(root, "sample_gui").join("\n");
    for (const command of [
      "get_app_metadata",
      "get_system_locale",
      "set_interface_language",
    ]) {
      assert.match(
        errors,
        new RegExp(`generate_handler! 缺少已启用命令：${command}`, "u"),
      );
    }
  });
});

test("rejects duplicate commands in the merged initialization handler", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs
        .readFileSync(source, "utf8")
        .replace(
          "get_app_metadata, get_system_locale",
          "get_app_metadata, get_app_metadata, get_system_locale",
        ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /generate_handler! 不得重复命令：get_app_metadata/u,
    );
  });
});

test("rejects a fixed GUI handler entry without the Tauri command attribute", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs
        .readFileSync(source, "utf8")
        .replace(
          "#[tauri::command]\nasync fn get_system_locale",
          "async fn get_system_locale",
        ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /GUI 固定基线命令必须是窄 Tauri command：get_system_locale/u,
    );
  });
});

test("rejects a placeholder get_app_metadata return type", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs
        .readFileSync(source, "utf8")
        .replace(
          "async fn get_app_metadata() -> AppMetadata",
          "async fn get_app_metadata() -> String",
        ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /get_app_metadata 必须返回 AppMetadata/u,
    );
  });
});

test("rejects metadata detached from the core status or Cargo version", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs
        .readFileSync(source, "utf8")
        .replace(
          "let status = sample_core::scaffold_status().await;",
          "let status = sample_core::ScaffoldStatus { product_definition_required: false };",
        )
        .replace(
          'let version = env!("CARGO_PKG_VERSION");',
          'let version = "0.0.0";',
        ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /异步读取 core scaffold_status\(\).*CARGO_PKG_VERSION/su,
    );
  });
});

test("rejects get_system_locale that bypasses saved LocaleState", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs
        .readFileSync(source, "utf8")
        .replace(
          "resolve_system_locale(state.saved_language())",
          "resolve_system_locale(None)",
        ),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /LocaleState\.saved_language\(\).*系统 locale 解析链路/u,
    );
  });
});

test("rejects set_interface_language without native state synchronization", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs
        .readFileSync(source, "utf8")
        .replace("    state.set_saved_language(normalized.clone());\n", "")
        .replace("    rust_i18n::set_locale(&normalized);\n", ""),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /写回 LocaleState.*rust_i18n::set_locale/su,
    );
  });
});

test("rejects an updater handler entry that is not a Tauri command", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8").replace("#[tauri::command]\n\tasync fn check_for_updates", "async fn check_for_updates"),
    );
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /check_for_updates 必须是已注册的窄 Tauri command/u,
    );
  });
});

test("rejects constant-true assertions in fixed plugin tests", () => {
  withFixture(({ root, guiRoot }) => {
    const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
    fs.writeFileSync(
      source,
      fs.readFileSync(source, "utf8").replace(
        /fn updater_checks_are_single_flight\(\) \{[^}]+\}/u,
        "fn updater_checks_are_single_flight() { assert!(true); }",
      ),
    );
    assert.match(verifyGuiLifecycleContract(root, "sample_gui").join("\n"), /非平凡断言：updater_checks_are_single_flight/u);
  });
});
