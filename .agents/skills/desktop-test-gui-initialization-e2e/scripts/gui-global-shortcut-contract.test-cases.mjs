import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  disableTrayAndSingleInstance,
  withFixture,
  writeInitializationProfile,
} from "./verify-gui-lifecycle-contract.fixture.mjs";
import {
  parseGlobalShortcutContract,
  verifyGuiLifecycleContract,
} from "./verify-gui-lifecycle-contract.mjs";

const FIXED_ACTION = {
  id: "show_command_palette",
  bindingPolicy: "fixed",
  defaultChord: "Control+Shift+P",
  dispatch: { kind: "host-action", target: "show_command_palette" },
  e2eSafe: true,
};

const CONFIGURABLE_ACTION = {
  id: "create_entry",
  bindingPolicy: "user-configurable",
  defaultChord: null,
  dispatch: { kind: "core-use-case", target: "create_entry" },
  e2eSafe: false,
};

function parseShortcutContract(contract) {
  const errors = [];
  const actions = parseGlobalShortcutContract(
    `\`\`\`gui-global-shortcut-contract\n${JSON.stringify(contract)}\n\`\`\`\n`,
    true,
    errors,
  );
  return { actions, errors };
}

function configureFixedShortcut(root) {
  writeInitializationProfile(root, {
    globalShortcutContract: { schemaVersion: 1, actions: [FIXED_ACTION] },
  });
}

function configureMixedShortcuts(root) {
  writeInitializationProfile(root, {
    globalShortcutContract: {
      schemaVersion: 1,
      actions: [FIXED_ACTION, CONFIGURABLE_ACTION],
    },
  });
}

function mixedShortcutCommandSource(condition, replacementArgument) {
  return `
struct ShortcutBindingUpdate {
    action_id: String,
    configured_chord: Option<String>,
}

fn validate_shortcut_binding_updates(
    actions: &[GlobalShortcutAction],
    updates: &[ShortcutBindingUpdate],
) -> Result<Vec<(String, String)>, &'static str> {
    let mut validated = Vec::new();
    for update in updates {
        let action = actions.iter()
            .find(|action| action.id == update.action_id)
            .ok_or("unknown-action")?;
        if ${condition} {
            return Err("fixed-action");
        }
        if let Some(chord) = update.configured_chord.clone() {
            validated.push((chord, action.id.to_string()));
        }
    }
    Ok(validated)
}

#[tauri::command]
fn load_global_shortcut_bindings() -> Result<(), &'static str> { Ok(()) }
#[tauri::command]
fn save_global_shortcut_bindings(
    app: tauri::AppHandle,
    registry: tauri::State<OwnedGlobalShortcutRegistry>,
    updates: Vec<ShortcutBindingUpdate>,
) -> Result<(), &'static str> {
    let validated_updates = validate_shortcut_binding_updates(
        &GLOBAL_SHORTCUT_ACTIONS,
        &updates,
    )?;
    replace_owned_global_shortcuts(&app, &registry, &${replacementArgument})?;
    Ok(())
}
#[tauri::command]
fn begin_global_shortcut_capture() -> Result<(), &'static str> { Ok(()) }
#[tauri::command]
fn end_global_shortcut_capture() -> Result<(), &'static str> { Ok(()) }
`;
}

/** 注册快捷键专项；由主生命周期测试入口调用，保留原命令的完整覆盖。 */
export function registerGlobalShortcutContractTests() {
  test("rejects enabled global shortcut capability without its action contract block", () => {
    withFixture(({ root }) => {
      const profile = path.join(root, "docs", "GUI_APP_PROFILE.md");
      fs.writeFileSync(
        profile,
        fs
          .readFileSync(profile, "utf8")
          .replace(/\n```gui-global-shortcut-contract[\s\S]*?```\n/u, "\n"),
      );
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /global_shortcut = enabled.*缺少 gui-global-shortcut-contract/u,
      );
    });
  });

  test("rejects a residual global shortcut action contract when the capability is disabled", () => {
    withFixture(({ root }) => {
      const profile = path.join(root, "docs", "GUI_APP_PROFILE.md");
      fs.writeFileSync(
        profile,
        fs
          .readFileSync(profile, "utf8")
          .replace("global_shortcut = enabled", "global_shortcut = disabled"),
      );
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /global_shortcut = disabled.*不得保留 gui-global-shortcut-contract/u,
      );
    });
  });

  test("rejects Rust and frontend shortcut residuals when the capability is disabled", () => {
    withFixture(({ root, guiRoot }) => {
      disableTrayAndSingleInstance(root, guiRoot);
      fs.appendFileSync(
        path.join(guiRoot, "src-tauri", "src", "lifecycle.rs"),
        "\nfn get_global_shortcut_statuses() {}\n",
      );
      fs.appendFileSync(
        path.join(guiRoot, "src", "routes", "settings.tsx"),
        "\nconst globalShortcutStatus = true;\n",
      );
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /未选择全局快捷键时不得保留运行时：global_shortcut_.*未选择全局快捷键时不得保留绑定状态/su,
      );
    });
  });

  test("accepts an empty global shortcut action contract without a default binding or UI", () => {
    withFixture(({ root, guiRoot }) => {
      const profileText = fs.readFileSync(
        path.join(root, "docs", "GUI_APP_PROFILE.md"),
        "utf8",
      );
      const rustText = fs.readFileSync(
        path.join(guiRoot, "src-tauri", "src", "lifecycle.rs"),
        "utf8",
      );
      const errors = [];
      const actions = parseGlobalShortcutContract(profileText, true, errors);
      assert.deepEqual(errors, []);
      assert.deepEqual(actions, []);
      assert.doesNotMatch(profileText, /CommandOrControl\+Shift\+Space|restore_main_window/u);
      assert.doesNotMatch(rustText, /\.\s*register\s*\(/u);
      assert.deepEqual(verifyGuiLifecycleContract(root, "sample_gui"), []);
    });
  });

  test("ignores GlobalShortcutAction values constructed outside the static profile initializer", () => {
    withFixture(({ root, guiRoot }) => {
      fs.appendFileSync(
        path.join(guiRoot, "src-tauri", "src", "lifecycle.rs"),
        `
#[cfg(test)]
fn builds_a_shortcut_action_fixture() {
    let _temporary = GlobalShortcutAction {
        id: "test_only_action",
        binding_policy: "fixed",
        default_chord: Some("Control+Alt+T".to_string()),
        dispatch_kind: "host-action",
        dispatch_target: "test_only_action",
        e2e_safe: true,
    };
}
`,
      );
      assert.deepEqual(verifyGuiLifecycleContract(root, "sample_gui"), []);
    });
  });

  test("parses fixed nullable and dotted-target global shortcut actions", () => {
    const contract = {
      schemaVersion: 1,
      actions: [
        {
          ...FIXED_ACTION,
          dispatch: { kind: "host-action", target: "palette.show" },
        },
        {
          id: "create_entry",
          bindingPolicy: "user-configurable",
          defaultChord: null,
          dispatch: { kind: "core-use-case", target: "entry.create" },
          e2eSafe: false,
        },
      ],
    };
    const { actions, errors } = parseShortcutContract(contract);
    assert.deepEqual(errors, []);
    assert.deepEqual(actions, contract.actions);
  });

  test("accepts a fixed shortcut action with exact Rust materialization and read-only OS status", () => {
    withFixture(({ root, guiRoot }) => {
      configureFixedShortcut(root);
      fs.appendFileSync(
        path.join(guiRoot, "src", "routes", "settings.tsx"),
        `
export const get_global_shortcut_statuses = () => invoke("get_global_shortcut_statuses");
export const fixedShortcut = { id: "show_command_palette", defaultChord: "Control+Shift+P" };
export function FixedShortcutStatus({ registered }) { return <output>{String(registered)}</output>; }
`,
      );
      const localePath = path.join(guiRoot, "src", "i18n", "en-US.json");
      const locale = JSON.parse(fs.readFileSync(localePath, "utf8"));
      locale.settings.global_shortcut_title = "Global shortcut";
      fs.writeFileSync(localePath, JSON.stringify(locale));
      assert.deepEqual(verifyGuiLifecycleContract(root, "sample_gui"), []);
    });
  });

  test("rejects a fixed global shortcut action without a chord", () => {
    const { errors } = parseShortcutContract({
      schemaVersion: 1,
      actions: [{ ...FIXED_ACTION, defaultChord: null }],
    });
    assert.match(errors.join("\n"), /fixed 动作必须提供非空 defaultChord/u);
  });

  test("rejects normalized duplicate default chords", () => {
    const { errors } = parseShortcutContract({
      schemaVersion: 1,
      actions: [
        { ...FIXED_ACTION, id: "first_action", defaultChord: "Control+Shift+K" },
        {
          id: "second_action",
          bindingPolicy: "user-configurable",
          defaultChord: "shift + ctrl + k",
          dispatch: { kind: "core-use-case", target: "second_action" },
          e2eSafe: false,
        },
      ],
    });
    assert.match(errors.join("\n"), /规范化后重复/u);
  });

  test("rejects malformed global shortcut action fields", () => {
    const { errors } = parseShortcutContract({
      schemaVersion: 1,
      actions: [
        {
          id: "Not-Snake-Case",
          bindingPolicy: "mutable",
          defaultChord: "K",
          dispatch: { kind: "script", target: "" },
          e2eSafe: "yes",
        },
      ],
    });
    const message = errors.join("\n");
    assert.match(message, /id 必须是.*snake_case/u);
    assert.match(message, /bindingPolicy 必须为 fixed 或 user-configurable/u);
    assert.match(message, /修饰键\+按键|至少一个修饰键/u);
    assert.match(message, /dispatch.kind 必须为 host-action 或 core-use-case/u);
    assert.match(message, /dispatch.target 必须是.*snake_case/u);
    assert.match(message, /e2eSafe 必须是 boolean/u);
  });

  test("rejects URL script whitespace and unstable dispatch targets", () => {
    for (const target of [
      "https://example.com/action",
      "javascript:alert(1)",
      "show command palette",
      "Palette.Show",
      " leading_target",
    ]) {
      const { errors } = parseShortcutContract({
        schemaVersion: 1,
        actions: [{ ...FIXED_ACTION, dispatch: { kind: "host-action", target } }],
      });
      assert.match(errors.join("\n"), /dispatch.target 必须是小写 ASCII snake_case 或点分 snake_case/u, target);
    }
  });

  test("rejects duplicate action ids and oversized default chords", () => {
    const { errors } = parseShortcutContract({
      schemaVersion: 1,
      actions: [
        {
          ...FIXED_ACTION,
          id: "duplicate_action",
          defaultChord: `Control+${"K".repeat(130)}`,
          dispatch: { kind: "host-action", target: "first" },
        },
        {
          ...FIXED_ACTION,
          id: "duplicate_action",
          defaultChord: "Control+J",
          dispatch: { kind: "host-action", target: "second" },
        },
      ],
    });
    assert.match(errors.join("\n"), /id 重复：duplicate_action/u);
    assert.match(errors.join("\n"), /UTF-8 长度不得超过 128 字节/u);
  });

  test("rejects a global shortcut contract with the wrong schema version", () => {
    const { errors } = parseShortcutContract({ schemaVersion: 2, actions: [] });
    assert.match(errors.join("\n"), /schemaVersion 必须为 1/u);
  });

  test("rejects an implicit legacy global shortcut default outside the action contract", () => {
    withFixture(({ root, guiRoot }) => {
      const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
      fs.appendFileSync(
        source,
        '\nconst LEGACY_SHORTCUT_FALLBACK: &str = "CommandOrControl+Shift+Space";\n',
      );
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /不得隐式恢复旧默认 CommandOrControl\+Shift\+Space/u,
      );
    });
  });

  test("rejects variable-derived OS registration for an empty action contract", () => {
    withFixture(({ root, guiRoot }) => {
      const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
      fs.appendFileSync(
        source,
        `
fn hidden_shortcut_default(app: &tauri::AppHandle) {
    let chord = "Control+Alt+K";
    let shortcuts = app.global_shortcut();
    let _ = shortcuts.register(chord);
}
`,
      );
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /空 gui-global-shortcut-contract 不得由任何非测试函数取得 OS shortcut API/u,
      );
    });
  });

  test("rejects cross-function shortcut API access for an empty action contract", () => {
    withFixture(({ root, guiRoot }) => {
      fs.appendFileSync(
        path.join(guiRoot, "src-tauri", "src", "lifecycle.rs"),
        `
fn acquire_hidden_shortcut_api(app: &tauri::AppHandle) {
    let api = app.global_shortcut();
    register_hidden_binding(api);
}
fn register_hidden_binding<T>(api: T) {
    let chord = "Control+Alt+K";
    let _ = api.register(chord);
    let _ = api.is_registered(chord);
    let _ = api.unregister(chord);
}
`,
      );
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /不得由任何非测试函数取得 OS shortcut API：acquire_hidden_shortcut_api/u,
      );
    });
  });

  test("rejects aliased shortcut commands added to the empty-contract invoke handler", () => {
    withFixture(({ root, guiRoot }) => {
      const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
      fs.writeFileSync(
        source,
        fs
          .readFileSync(source, "utf8")
          .replace(
            "set_autostart_enabled])",
            "set_autostart_enabled, persist_hotkeys, start_key_capture])",
          ) + `
#[tauri::command]
fn persist_hotkeys() {}
#[tauri::command]
fn start_key_capture() {}
`,
      );
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /invoke_handler 不得接入额外命令：persist_hotkeys、start_key_capture/u,
      );
    });
  });

  test("rejects semantic capture UI and hotkey translations for an empty action contract", () => {
    withFixture(({ root, guiRoot }) => {
      fs.appendFileSync(
        path.join(guiRoot, "src", "routes", "settings.tsx"),
        "\nexport function KeyCapturePanel() { return <button>Capture</button>; }\n",
      );
      const localePath = path.join(guiRoot, "src", "i18n", "en-US.json");
      const locale = JSON.parse(fs.readFileSync(localePath, "utf8"));
      locale.hotkey_editor = { title: "Hotkey editor" };
      fs.writeFileSync(localePath, JSON.stringify(locale));
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /空全局快捷键动作契约不得生成默认 chord、快捷键运行时、编辑 UI 或翻译键：(?:KeyCapturePanel|hotkey_editor)/u,
      );
    });
  });

  test("rejects shortcut save capture editor and translations for an empty contract", () => {
    withFixture(({ root, guiRoot }) => {
      fs.appendFileSync(
        path.join(guiRoot, "src-tauri", "src", "lifecycle.rs"),
        "\n#[tauri::command]\nfn save_global_shortcut_bindings() {}\n",
      );
      fs.appendFileSync(
        path.join(guiRoot, "src", "routes", "settings.tsx"),
        "\nexport function ShortcutEditor() { return <button>Capture shortcut</button>; }\n",
      );
      fs.appendFileSync(
        path.join(guiRoot, "src-tauri", "locales", "en-US.yml"),
        "global_shortcut:\n  capture: Capture shortcut\n",
      );
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /空 gui-global-shortcut-contract 不得保留快捷键保存.*空全局快捷键动作契约不得生成默认 chord、快捷键运行时、编辑 UI 或翻译键/su,
      );
    });
  });

  test("rejects non-nullable desired shortcut binding state", () => {
    withFixture(({ root, guiRoot }) => {
      configureFixedShortcut(root);
      const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
      fs.writeFileSync(
        source,
        fs.readFileSync(source, "utf8").replace("default_chord: Option<String>", "default_chord: String"),
      );
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /default_chord: Option<String>.*可空配置/u,
      );
    });
  });

  test("rejects any GLOBAL_SHORTCUT_ACTIONS field that differs from the profile", () => {
    const mutations = [
      ['id: "show_command_palette"', 'id: "other_action"'],
      ['binding_policy: "fixed"', 'binding_policy: "user-configurable"'],
      ['default_chord: Some("Control+Shift+P".to_string())', 'default_chord: Some("Control+Alt+P".to_string())'],
      ['dispatch_kind: "host-action"', 'dispatch_kind: "core-use-case"'],
      ['dispatch_target: "show_command_palette"', 'dispatch_target: "other_target"'],
      ["e2e_safe: true", "e2e_safe: false"],
    ];
    for (const [before, after] of mutations) {
      withFixture(({ root, guiRoot }) => {
        configureFixedShortcut(root);
        const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
        fs.writeFileSync(source, fs.readFileSync(source, "utf8").replace(before, after));
        assert.match(
          verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
          /GLOBAL_SHORTCUT_ACTIONS 与 profile 动作逐字段不一致/u,
          before,
        );
      });
    }
  });

  test("rejects a wildcard no-op shortcut dispatcher", () => {
    withFixture(({ root, guiRoot }) => {
      configureFixedShortcut(root);
      const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
      fs.writeFileSync(
        source,
        fs
          .readFileSync(source, "utf8")
          .replace(
            '"show_command_palette" => dispatch_host_action__show_command_palette(app),',
            '"show_command_palette" => Ok(()),',
          ),
      );
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /typed dispatcher 未按 kind\/target 物化动作/u,
      );
    });
  });

  test("rejects a generic target helper that returns Ok without dispatching", () => {
    withFixture(({ root, guiRoot }) => {
      configureFixedShortcut(root);
      const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
      fs.writeFileSync(
        source,
        fs
          .readFileSync(source, "utf8")
          .replace(
            '"show_command_palette" => dispatch_host_action__show_command_palette(app),',
            '"show_command_palette" => dispatch_host_action(app, "show_command_palette"),',
          ) + `
fn dispatch_host_action(
    _app: &tauri::AppHandle,
    target: &str,
) -> Result<(), &'static str> {
    if target.is_empty() { Err("missing-target") } else { Ok(()) }
}
`,
      );
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /不得通过通用 target helper 分派：dispatch_host_action/u,
      );
    });
  });

  test("rejects a target-specific dispatcher whose helper chain is a no-op", () => {
    withFixture(({ root, guiRoot }) => {
      configureFixedShortcut(root);
      const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
      const effect = `fn dispatch_host_action__show_command_palette(app: &tauri::AppHandle) -> Result<(), &'static str> {
    app.emit("global-shortcut:host-action:show_command_palette", ())
        .map_err(|_| "shortcut-dispatch-failed")
}`;
      const noOp = `fn dispatch_host_action__show_command_palette(app: &tauri::AppHandle) -> Result<(), &'static str> {
    pretend_command_palette_effect(app)
}

fn pretend_command_palette_effect(_app: &tauri::AppHandle) -> Result<(), &'static str> {
    Ok(())
}`;
      fs.writeFileSync(
        source,
        fs.readFileSync(source, "utf8").replace(effect, noOp),
      );
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /kind\/target 专用 helper 不得是通用 target 非空判断或 Ok\/no-op/u,
      );
    });
  });

  test("rejects global shortcut dispatch without a Pressed-only gate", () => {
    withFixture(({ root, guiRoot }) => {
      configureFixedShortcut(root);
      const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
      fs.writeFileSync(
        source,
        fs
          .readFileSync(source, "utf8")
          .replace("if event.state() != ShortcutState::Pressed { return; }", "let _state = event.state();"),
      );
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /只在 ShortcutState::Pressed/u,
      );
    });
  });

  test("rejects a constant-true global shortcut registration status", () => {
    withFixture(({ root, guiRoot }) => {
      configureFixedShortcut(root);
      const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
      fs.writeFileSync(
        source,
        fs
          .readFileSync(source, "utf8")
          .replace("app.global_shortcut().is_registered(chord.as_str())", "true"),
      );
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /逐项状态必须.*真实调用 is_registered/u,
      );
    });
  });

  test("rejects WebView storage Jotai and Query as the global shortcut binding authority", () => {
    for (const [label, sourceLine] of [
      ["localStorage", 'const globalShortcutBinding = window.localStorage.getItem("global_shortcut_binding");'],
      ["sessionStorage", 'window.sessionStorage.setItem("global_shortcut_binding", globalShortcutBinding);'],
      ["Jotai", 'const globalShortcutBindingAtom = atomWithStorage("global_shortcut_binding", null);'],
      ["Query", 'const globalShortcutBindingQuery = useQuery({ queryKey: ["global_shortcut_binding"] });'],
    ]) {
      withFixture(({ root, guiRoot }) => {
        fs.appendFileSync(
          path.join(guiRoot, "src", "routes", "settings.tsx"),
          `\n${sourceLine}\n`,
        );
        assert.match(
          verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
          /不得将全局快捷键绑定持久化到 WebView 层/u,
          label,
        );
      });
    }
  });

  test("rejects unregister_all because cleanup may only release owned shortcuts", () => {
    withFixture(({ root, guiRoot }) => {
      configureFixedShortcut(root);
      const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
      fs.appendFileSync(
        source,
        "\nfn unsafe_shortcut_cleanup(app: &tauri::AppHandle) { let _ = app.global_shortcut().unregister_all(); }\n",
      );
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /只能注销 owned bindings.*unregister_all/u,
      );
    });
  });

  test("rejects replacement rollback that does not restore previous owned bindings", () => {
    withFixture(({ root, guiRoot }) => {
      configureFixedShortcut(root);
      const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
      fs.writeFileSync(
        source,
        fs
          .readFileSync(source, "utf8")
          .replace(
            "for chord in previous.keys() { let _ = app.global_shortcut().register(chord.as_str()); }",
            "let _previous_binding_count = previous.len();",
          ),
      );
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /恢复 previous owned bindings/u,
      );
    });
  });

  test("rejects shortcut cleanup runtime for an empty action contract", () => {
    withFixture(({ root, guiRoot }) => {
      const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
      fs.appendFileSync(
        source,
        "\nfn stale_shortcut_cleanup(app: &tauri::AppHandle) { let shortcuts = app.global_shortcut(); let _ = shortcuts.unregister(\"Control+K\"); }\n",
      );
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /空 gui-global-shortcut-contract 不得由任何非测试函数取得 OS shortcut API/u,
      );
    });
  });

  test("requires narrow Rust load save and capture commands for user-configurable shortcuts", () => {
    withFixture(({ root }) => {
      writeInitializationProfile(root, {
        globalShortcutContract: {
          schemaVersion: 1,
          actions: [
            {
              id: "create_entry",
              bindingPolicy: "user-configurable",
              defaultChord: null,
              dispatch: { kind: "core-use-case", target: "create_entry" },
              e2eSafe: false,
            },
          ],
        },
      });
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /Rust 窄命令：load_global_shortcut_bindings.*Rust 窄命令：save_global_shortcut_bindings.*Rust 窄命令：begin_global_shortcut_capture.*Rust 窄命令：end_global_shortcut_capture/su,
      );
    });
  });

  test("rejects a mixed-policy save command that can modify fixed actions", () => {
    withFixture(({ root, guiRoot }) => {
      configureMixedShortcuts(root);
      fs.appendFileSync(
        path.join(guiRoot, "src-tauri", "src", "lifecycle.rs"),
        `
#[tauri::command]
fn load_global_shortcut_bindings() -> Result<(), &'static str> { Ok(()) }
#[tauri::command]
fn save_global_shortcut_bindings() -> Result<(), &'static str> { Ok(()) }
#[tauri::command]
fn begin_global_shortcut_capture() -> Result<(), &'static str> { Ok(()) }
#[tauri::command]
fn end_global_shortcut_capture() -> Result<(), &'static str> { Ok(()) }
`,
      );
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /混合快捷键保存必须逐 ID 校验策略/u,
      );
    });
  });

  test("rejects a dead fixed-action guard in mixed shortcut persistence", () => {
    withFixture(({ root, guiRoot }) => {
      configureMixedShortcuts(root);
      fs.appendFileSync(
        path.join(guiRoot, "src-tauri", "src", "lifecycle.rs"),
        mixedShortcutCommandSource(
          'false && action.binding_policy == "fixed" && action.default_chord != update.configured_chord',
          "validated_updates",
        ),
      );
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /混合快捷键保存必须逐 ID 校验策略，并在 fixed chord 变化时立即 return Err/u,
      );
    });
  });

  test("rejects raw mixed shortcut updates mutated after fixed validation", () => {
    withFixture(({ root, guiRoot }) => {
      configureMixedShortcuts(root);
      fs.appendFileSync(
        path.join(guiRoot, "src-tauri", "src", "lifecycle.rs"),
        mixedShortcutCommandSource(
          'action.binding_policy == "fixed" && action.default_chord != update.configured_chord',
          "updates",
        ),
      );
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /只能在 fixed 校验后用 validated updates 替换 owned bindings，不得随后全量 mutate 原请求/u,
      );
    });
  });
}
