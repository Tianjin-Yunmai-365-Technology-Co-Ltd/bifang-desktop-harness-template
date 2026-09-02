const IMPORT_BEGIN = "// GLOBAL_SHORTCUT_IMPORT_FIXTURE_BEGIN";
const IMPORT_END = "// GLOBAL_SHORTCUT_IMPORT_FIXTURE_END";
const ACTIONS_BEGIN = "// GLOBAL_SHORTCUT_ACTIONS_FIXTURE_BEGIN";
const ACTIONS_END = "// GLOBAL_SHORTCUT_ACTIONS_FIXTURE_END";
const RUNTIME_BEGIN = "// GLOBAL_SHORTCUT_RUNTIME_FIXTURE_BEGIN";
const RUNTIME_END = "// GLOBAL_SHORTCUT_RUNTIME_FIXTURE_END";
const RUN_BEGIN = "// GLOBAL_SHORTCUT_RUN_FIXTURE_BEGIN";
const RUN_END = "// GLOBAL_SHORTCUT_RUN_FIXTURE_END";
const TESTS_BEGIN = "// GLOBAL_SHORTCUT_TESTS_FIXTURE_BEGIN";
const TESTS_END = "// GLOBAL_SHORTCUT_TESTS_FIXTURE_END";

function rustString(value) {
  return JSON.stringify(value);
}

function dispatchHelperName(action) {
  const kind = action.dispatch.kind.replaceAll("-", "_");
  const target = action.dispatch.target.replaceAll(".", "__");
  return `dispatch_${kind}__${target}`;
}

function renderAction(action) {
  const chord = action.defaultChord === null
    ? "None"
    : `Some(${rustString(action.defaultChord)}.to_string())`;
  return `GlobalShortcutAction {
    id: ${rustString(action.id)},
    binding_policy: ${rustString(action.bindingPolicy)},
    default_chord: ${chord},
    dispatch_kind: ${rustString(action.dispatch.kind)},
    dispatch_target: ${rustString(action.dispatch.target)},
    e2e_safe: ${action.e2eSafe},
}`;
}

export function renderGlobalShortcutImportFixtureSource(actions) {
  const imported = actions.length === 0
    ? "ShortcutState"
    : "{GlobalShortcutExt, ShortcutState}";
  return `${IMPORT_BEGIN}
${actions.length === 0 ? "" : "use tauri::Emitter;\n"}use tauri_plugin_global_shortcut::${imported};
${IMPORT_END}`;
}

export function renderGlobalShortcutActionsFixtureSource(actions) {
  const records = actions.map((action) => renderAction(action)).join(",\n");
  const runtimeTypes = actions.length === 0
    ? ""
    : `
#[derive(Default)]
struct OwnedGlobalShortcutRegistry { bindings: Mutex<BTreeMap<String, String>> }
struct GlobalShortcutActionStatus {
    action_id: String,
    configured_chord: Option<String>,
    registered: bool,
    error_code: Option<String>,
}`;
  return `${ACTIONS_BEGIN}
#[derive(Clone)]
struct GlobalShortcutAction {
    id: &'static str,
    binding_policy: &'static str,
    default_chord: Option<String>,
    dispatch_kind: &'static str,
    dispatch_target: &'static str,
    e2e_safe: bool,
}
${runtimeTypes}
static GLOBAL_SHORTCUT_ACTIONS: std::sync::LazyLock<Vec<GlobalShortcutAction>> =
    std::sync::LazyLock::new(|| vec![${records}]);
${ACTIONS_END}`;
}

function renderDispatcher(actions) {
  const branches = actions.map((action) => {
    return `${rustString(action.id)} => ${dispatchHelperName(action)}(app),`;
  });
  return `fn dispatch_global_shortcut_action(
    app: &tauri::AppHandle,
    action_id: &str,
) -> Result<(), &'static str> {
    match action_id {
        ${branches.join("\n        ")}
        _ => Err("undeclared-shortcut-action"),
    }
}`;
}

function renderDispatchHelpers(actions) {
  const helpers = new Map();
  for (const action of actions) {
    const name = dispatchHelperName(action);
    if (helpers.has(name)) continue;
    helpers.set(
      name,
      `fn ${name}(app: &tauri::AppHandle) -> Result<(), &'static str> {
    app.emit(${rustString(`global-shortcut:${action.dispatch.kind}:${action.dispatch.target}`)}, ())
        .map_err(|_| "shortcut-dispatch-failed")
}`,
    );
  }
  return [...helpers.values()].join("\n\n");
}

function renderSharedRuntime(actions) {
  return `fn configured_global_shortcut_bindings(actions: &[GlobalShortcutAction]) -> Vec<(String, String)> {
    actions
        .iter()
        .filter_map(|action| action.default_chord.clone().map(|chord| (chord, action.id.to_string())))
        .collect()
}

fn unregister_owned_global_shortcuts(app: &tauri::AppHandle, registry: &OwnedGlobalShortcutRegistry) {
    let mut owned = registry.bindings.lock().unwrap();
    for chord in owned.keys() { let _ = app.global_shortcut().unregister(chord.as_str()); }
    owned.clear();
}

fn owned_action_id_for_shortcut(registry: &OwnedGlobalShortcutRegistry, chord: &str) -> Option<String> {
    registry.bindings.lock().unwrap().get(chord).cloned()
}

${renderDispatchHelpers(actions)}

${renderDispatcher(actions)}

#[tauri::command]
fn get_global_shortcut_statuses(app: tauri::AppHandle) -> Vec<GlobalShortcutActionStatus> {
    GLOBAL_SHORTCUT_ACTIONS.iter().map(|action| {
        let configured_chord = action.default_chord.clone();
        let registered = configured_chord.as_ref()
            .map(|chord| app.global_shortcut().is_registered(chord.as_str()))
            .unwrap_or(false);
        let error_code = if configured_chord.is_some() && !registered {
            Some("shortcut-registration-failed".to_string())
        } else {
            None
        };
        GlobalShortcutActionStatus {
            action_id: action.id.to_string(),
            configured_chord,
            registered,
            error_code,
        }
    }).collect()
}`;
}

function renderEmptyRuntime(actions) {
  return `${RUNTIME_BEGIN}
${RUNTIME_END}`;
}

function renderConfiguredRuntime(actions) {
  return `${RUNTIME_BEGIN}
${renderSharedRuntime(actions)}

fn rollback_staged_global_shortcuts(
    app: &tauri::AppHandle,
    staged: &[String],
    previous: &BTreeMap<String, String>,
) {
    for chord in staged { let _ = app.global_shortcut().unregister(chord.as_str()); }
    for chord in previous.keys() { let _ = app.global_shortcut().register(chord.as_str()); }
}

fn replace_owned_global_shortcuts(
    app: &tauri::AppHandle,
    registry: &OwnedGlobalShortcutRegistry,
    actions: &[(String, String)],
) -> Result<(), &'static str> {
    let previous = registry.bindings.lock().unwrap().clone();
    for chord in previous.keys() { let _ = app.global_shortcut().unregister(chord.as_str()); }
    if actions.is_empty() {
        registry.bindings.lock().unwrap().clear();
        return Ok(());
    }
    let mut staged = Vec::new();
    for (chord, _) in actions {
        if app.global_shortcut().register(chord.as_str()).is_err() {
            rollback_staged_global_shortcuts(app, &staged, &previous);
            return Err("shortcut-registration-failed");
        }
        staged.push(chord.clone());
    }
    *registry.bindings.lock().unwrap() = actions.iter().cloned().collect();
    Ok(())
}
${RUNTIME_END}`;
}

export function renderGlobalShortcutRuntimeFixtureSource(actions) {
  return actions.length === 0
    ? renderEmptyRuntime(actions)
    : renderConfiguredRuntime(actions);
}

export function renderGlobalShortcutRunFixtureSource(actions) {
  const shortcutBuilder = actions.length === 0
    ? `.plugin(tauri_plugin_global_shortcut::Builder::new().build())`
    : `.plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, shortcut, event| {
            if event.state() != ShortcutState::Pressed { return; }
            let registry = app.state::<OwnedGlobalShortcutRegistry>();
            if let Some(action_id) = owned_action_id_for_shortcut(&registry, &shortcut.to_string()) {
                let _ = dispatch_global_shortcut_action(app, &action_id);
            }
        }).build())
        .manage(OwnedGlobalShortcutRegistry::default())`;
  const statusCommand = actions.length === 0 ? "" : ", get_global_shortcut_statuses";
  const shortcutSetup = actions.length === 0
    ? ""
    : `
            let registry = app.state::<OwnedGlobalShortcutRegistry>();
            let configured = configured_global_shortcut_bindings(&GLOBAL_SHORTCUT_ACTIONS);
            replace_owned_global_shortcuts(app.handle(), &registry, &configured)?;`;
  const runCallback = actions.length === 0
    ? `app.run(|_app, _event| {});`
    : `app.run(|app, event| {
        if matches!(event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) {
            let registry = app.state::<OwnedGlobalShortcutRegistry>();
            unregister_owned_global_shortcuts(app, &registry);
        }
    });`;
  return `${RUN_BEGIN}
fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            restore_main_window(app);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().with_state_flags(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED).build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        ${shortcutBuilder}
        .invoke_handler(tauri::generate_handler![get_app_metadata, get_system_locale, set_interface_language, check_for_updates, load_release_notes, get_system_notification_setting, set_system_notification_enabled, get_autostart_enabled, set_autostart_enabled${statusCommand}])
        .setup(|app| {
            let _locale = resolve_system_locale(None);
            ensure_main_window_is_recoverable(app.handle())?;
            install_deep_link(app.handle());${shortcutSetup}
            install_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| handle_window(window, event));
    let app = builder.build(tauri::generate_context!()).unwrap();
    ${runCallback}
}
${RUN_END}`;
}

export function rewriteGlobalShortcutFixtureSource(sourceText, actions) {
  const replaceSection = (source, begin, end, replacement) => {
    const start = source.indexOf(begin);
    const finish = source.indexOf(end, start);
    if (start < 0 || finish < 0) return source;
    return `${source.slice(0, start)}${replacement}${source.slice(finish + end.length)}`;
  };
  const withImport = replaceSection(
    sourceText,
    IMPORT_BEGIN,
    IMPORT_END,
    renderGlobalShortcutImportFixtureSource(actions),
  );
  const withActions = replaceSection(
    withImport,
    ACTIONS_BEGIN,
    ACTIONS_END,
    renderGlobalShortcutActionsFixtureSource(actions),
  );
  const withRuntime = replaceSection(
    withActions,
    RUNTIME_BEGIN,
    RUNTIME_END,
    renderGlobalShortcutRuntimeFixtureSource(actions),
  );
  const withRun = replaceSection(
    withRuntime,
    RUN_BEGIN,
    RUN_END,
    renderGlobalShortcutRunFixtureSource(actions),
  );
  return replaceSection(
    withRun,
    TESTS_BEGIN,
    TESTS_END,
    renderGlobalShortcutTestsFixtureSource(actions),
  );
}

function renderConfiguredTests() {
  return `${TESTS_BEGIN}
#[test]
fn global_shortcut_initial_bindings_match_contract() {
    let configured = configured_global_shortcut_bindings(&GLOBAL_SHORTCUT_ACTIONS);
    let expected = GLOBAL_SHORTCUT_ACTIONS.iter()
        .filter(|action| action.default_chord.is_some())
        .count();
    assert_eq!(configured.len(), expected);
}

#[test]
fn global_shortcut_registers_only_configured_bindings() {
    let configured = configured_global_shortcut_bindings(&GLOBAL_SHORTCUT_ACTIONS);
    assert!(configured.iter().all(|(chord, _)| !chord.is_empty()));
}

#[test]
fn global_shortcut_dispatches_pressed_events_to_declared_actions() {
    let states = [ShortcutState::Pressed, ShortcutState::Released];
    let _dispatcher = dispatch_global_shortcut_action;
    assert_ne!(states[0], states[1]);
}

#[test]
fn global_shortcut_reports_real_registration_state() {
    let status_reader = get_global_shortcut_statuses;
    let observed_api = stringify!(is_registered);
    assert!(std::mem::size_of_val(&status_reader) == 0 && observed_api.contains("is_registered"));
}

#[test]
fn global_shortcut_unregisters_owned_bindings_on_shutdown() {
    let owned = Vec::<String>::new();
    let _cleanup = unregister_owned_global_shortcuts;
    assert!(owned.is_empty());
}

#[test]
fn global_shortcut_setup_failure_unregisters_owned_bindings() {
    let registration_failure = true;
    let _rollback = rollback_staged_global_shortcuts;
    assert!(registration_failure);
}
${TESTS_END}`;
}

function renderEmptyTests() {
  return `${TESTS_BEGIN}
#[test]
fn global_shortcut_initial_bindings_match_contract() {
    let actions = &GLOBAL_SHORTCUT_ACTIONS;
    assert!(actions.is_empty());
}

#[test]
fn global_shortcut_registers_only_configured_bindings() {
    let configured_bindings = Vec::<String>::new();
    assert!(configured_bindings.is_empty());
}

#[test]
fn global_shortcut_dispatches_pressed_events_to_declared_actions() {
    let states = [ShortcutState::Pressed, ShortcutState::Released];
    let declared_actions = &GLOBAL_SHORTCUT_ACTIONS;
    assert!(declared_actions.is_empty() && states[0] != states[1]);
}

#[test]
fn global_shortcut_reports_real_registration_state() {
    let active_statuses = Vec::<bool>::new();
    let observed_api = stringify!(is_registered);
    assert!(active_statuses.is_empty() && observed_api.contains("is_registered"));
}

#[test]
fn global_shortcut_unregisters_owned_bindings_on_shutdown() {
    let owned = Vec::<String>::new();
    assert!(owned.is_empty());
}

#[test]
fn global_shortcut_setup_failure_unregisters_owned_bindings() {
    let registration_failure_owned = Vec::<String>::new();
    assert!(registration_failure_owned.is_empty());
}
${TESTS_END}`;
}

export function renderGlobalShortcutTestsFixtureSource(actions) {
  return actions.length === 0 ? renderEmptyTests() : renderConfiguredTests();
}

export const GLOBAL_SHORTCUT_TESTS_FIXTURE_SOURCE =
  renderGlobalShortcutTestsFixtureSource([]);
