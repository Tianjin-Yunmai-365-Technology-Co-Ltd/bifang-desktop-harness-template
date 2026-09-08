import fs from "node:fs";
import path from "node:path";

import {
  cargoDependencyHasLowerBound,
  collectMethodArguments,
  collectRustFunctions,
  desktopTargetDependencyDeclaration,
  sanitizeRustSource,
  targetDependencyDeclaration,
  tomlAssignment,
  tomlSection,
} from "./gui-lifecycle-source-analysis.mjs";
import {
  GLOBAL_SHORTCUT_TEST_NAMES,
  USER_CONFIGURABLE_GLOBAL_SHORTCUT_TEST_NAMES,
  allowedInitializationCommands,
  invokeHandlerCommands,
  validateGlobalShortcutRuntimeContract,
  validateGlobalShortcutTestCoverage,
} from "./gui-global-shortcut-runtime-contract.mjs";
import {
  validateFixedIpcRuntimeContract,
  validateUpdaterConfiguration,
} from "./gui-fixed-ipc-runtime-contract.mjs";
import {
  SYSTEM_NOTIFICATION_TEST_NAMES,
  validateNotificationRuntime,
} from "./gui-notification-runtime-contract.mjs";

const BASELINE_TEST_NAMES = [
  "system_locale_uses_tauri_plugin_os",
  "system_locale_normalizes_bcp47_once",
  "system_locale_falls_back_to_english",
  "saved_language_precedes_system_locale",
  "updater_defaults_to_not_configured_without_network",
  "updater_checks_are_single_flight",
  "updater_rejects_target_arch_channel_mismatch",
  "updater_tasks_are_owned_and_cancelled",
  "updater_failures_never_report_up_to_date",
  "window_state_restores_size_position_and_maximized",
  "window_state_ignores_saved_visibility",
  "window_state_falls_back_for_invalid_or_offscreen_state",
  "window_state_preserves_first_launch_defaults",
];
const SINGLE_INSTANCE_TEST_NAMES = [
  "single_instance_plugin_is_registered_first",
  "second_launch_restores_existing_main_window",
];
const AUTOSTART_TEST_NAMES = [
  "autostart_defaults_disabled_without_registration",
  "autostart_state_reads_operating_system_registration",
  "autostart_enable_disable_failures_are_observable",
  "autostart_commands_are_idempotent",
  "autostart_e2e_restores_previous_registration",
];

const DEEP_LINK_TEST_NAMES = [
  "deep_link_uses_identity_derived_restore_url",
  "deep_link_rejects_unconfigured_or_payload_urls",
  "deep_link_routes_before_window_restore",
  "deep_link_warm_launch_is_not_lost",
];

const BASELINE_DEPENDENCIES = [
  ["tauri-plugin-os", "2.3.2", "系统语言"],
  ["tauri-plugin-updater", "2.11.0", "更新基线"],
  ["tauri-plugin-window-state", "2.4.1", "窗口状态"],
  ["tauri-plugin-dialog", "2.7.3", "原生对话框"],
];

const CONDITIONAL_DEPENDENCIES = [
  ["deepLink", "tauri-plugin-deep-link", "2.4.10", "深链接"],
  ["globalShortcut", "tauri-plugin-global-shortcut", "2.3.2", "全局快捷键"],
];

const UPDATER_OUTBOUND_METHOD_PATTERN =
  /\.\s*(check|download_and_install|install)\s*\(/gu;

/** 枚举 Rust 运行时代码中的 updater 出站/安装调用，忽略注释和字符串。 */
function updaterOutboundCalls(sourceText) {
  return [
    ...sanitizeRustSource(sourceText, true).matchAll(
      UPDATER_OUTBOUND_METHOD_PATTERN,
    ),
  ];
}

/** 读取 workspace 中一个直接依赖的 inline 或 table 声明。 */
function workspaceDependency(text, dependency) {
  return (
    tomlAssignment(tomlSection(text, "workspace.dependencies"), dependency) ||
    tomlSection(text, `workspace.dependencies.${dependency}`)
  );
}

/** 读取 member 普通 dependencies 中一个 inline 或 table 声明。 */
function memberDependency(text, dependency) {
  return (
    tomlAssignment(tomlSection(text, "dependencies"), dependency) ||
    tomlSection(text, `dependencies.${dependency}`)
  );
}

/** 枚举 member 所有 dependency section，供 disabled 残留与错误 target 检查。 */
function allMemberDependencyDeclarations(text, dependency) {
  const declarations = [];
  const generic = memberDependency(text, dependency);
  if (generic) declarations.push({ section: "dependencies", declaration: generic });
  for (const match of text.matchAll(/^\s*\[([^\]]+)\]\s*$/gmu)) {
    const section = match[1];
    if (!section.startsWith("target.")) continue;
    const declaration = section.endsWith(`.dependencies.${dependency}`)
      ? tomlSection(text, section)
      : section.endsWith(".dependencies")
        ? tomlAssignment(tomlSection(text, section), dependency)
        : "";
    if (declaration) declarations.push({ section, declaration });
  }
  return declarations;
}

function requireWorkspaceMemberDependency(
  rootCargo,
  guiCargo,
  dependency,
  version,
  label,
  errors,
) {
  const workspace = workspaceDependency(rootCargo, dependency);
  if (!cargoDependencyHasLowerBound(workspace, version)) {
    errors.push(`GUI ${label}要求根 [workspace.dependencies] 以 "${version}" 为 ${dependency} 兼容下界`);
  }
  const member = memberDependency(guiCargo, dependency);
  if (!member || !/\bworkspace\s*=\s*true\b/u.test(member)) {
    errors.push(`GUI ${label}要求 member 通过 workspace = true 继承 ${dependency}`);
  }
}

function rejectDependency(rootCargo, guiCargo, dependency, label, errors) {
  if (
    workspaceDependency(rootCargo, dependency) ||
    allMemberDependencyDeclarations(guiCargo, dependency).length > 0
  ) {
    errors.push(`未选择${label}时不得声明 ${dependency} 依赖`);
  }
}

/** 验证四项固定插件与五类条件插件的 Cargo 声明和 target 归属。 */
export function validatePluginDependencyContract(rootCargo, guiCargo, profile, errors) {
  for (const [dependency, version, label] of BASELINE_DEPENDENCIES) {
    requireWorkspaceMemberDependency(
      rootCargo,
      guiCargo,
      dependency,
      version,
      label,
      errors,
    );
  }

  const singleDependency = workspaceDependency(
    rootCargo,
    "tauri-plugin-single-instance",
  );
  if (profile.singleInstance) {
    requireWorkspaceMemberDependency(
      rootCargo,
      guiCargo,
      "tauri-plugin-single-instance",
      "2.4.4",
      "单实例",
      errors,
    );
    const hasDeepLinkFeature = /["']deep-link["']/u.test(singleDependency);
    if (profile.deepLink && !hasDeepLinkFeature) {
      errors.push('深链接启用时 tauri-plugin-single-instance 必须启用 features = ["deep-link"]');
    }
    if (!profile.deepLink && hasDeepLinkFeature) {
      errors.push("深链接禁用时不得预开 single-instance 的 deep-link feature");
    }
  } else {
    rejectDependency(
      rootCargo,
      guiCargo,
      "tauri-plugin-single-instance",
      "单实例",
      errors,
    );
  }

  for (const [flag, dependency, version, label] of CONDITIONAL_DEPENDENCIES) {
    if (profile[flag]) {
      requireWorkspaceMemberDependency(rootCargo, guiCargo, dependency, version, label, errors);
    } else {
      rejectDependency(rootCargo, guiCargo, dependency, label, errors);
    }
  }

  const workspaceNotification = workspaceDependency(
    rootCargo,
    "tauri-plugin-notification",
  );
  const workspaceMacNotifications = workspaceDependency(
    rootCargo,
    "mac-usernotifications",
  );
  const memberNotification = memberDependency(guiCargo, "tauri-plugin-notification");
  const genericMacNotifications = memberDependency(guiCargo, "mac-usernotifications");
  const targetMacNotifications = targetDependencyDeclaration(
    guiCargo,
    "macos",
    "mac-usernotifications",
  );
  if (profile.systemNotification) {
    if (!cargoDependencyHasLowerBound(workspaceNotification, "2.4.0")) {
      errors.push('选择系统通知时 tauri-plugin-notification 兼容下界必须为 "2.4.0"');
    }
    if (!cargoDependencyHasLowerBound(workspaceMacNotifications, "0.3.1")) {
      errors.push('选择系统通知时 mac-usernotifications 兼容下界必须为 "0.3.1"');
    }
    if (!memberNotification || !/\bworkspace\s*=\s*true\b/u.test(memberNotification)) {
      errors.push("选择系统通知时 member 必须通过 workspace = true 继承 tauri-plugin-notification");
    }
    if (
      !targetMacNotifications ||
      !/\bworkspace\s*=\s*true\b/u.test(targetMacNotifications) ||
      genericMacNotifications
    ) {
      errors.push("选择系统通知时 mac-usernotifications 必须只位于 macOS target dependencies");
    }
  } else if (
    workspaceNotification ||
    workspaceMacNotifications ||
    allMemberDependencyDeclarations(guiCargo, "tauri-plugin-notification").length > 0 ||
    allMemberDependencyDeclarations(guiCargo, "mac-usernotifications").length > 0
  ) {
    errors.push("未选择系统通知时不得声明通知插件或 macOS 通知依赖");
  }

  const workspaceAutostart = workspaceDependency(rootCargo, "tauri-plugin-autostart");
  const targetAutostart = desktopTargetDependencyDeclaration(
    guiCargo,
    "tauri-plugin-autostart",
  );
  const genericAutostart = memberDependency(guiCargo, "tauri-plugin-autostart");
  if (profile.autostart) {
    if (!cargoDependencyHasLowerBound(workspaceAutostart, "2.5.1")) {
      errors.push('选择开机自启时 tauri-plugin-autostart 兼容下界必须为 "2.5.1"');
    }
    if (
      !targetAutostart ||
      !/\bworkspace\s*=\s*true\b/u.test(targetAutostart) ||
      genericAutostart
    ) {
      errors.push("选择开机自启时 tauri-plugin-autostart 必须只位于覆盖 macOS/Windows/Linux 的桌面 target dependencies");
    }
  } else if (
    workspaceAutostart ||
    allMemberDependencyDeclarations(guiCargo, "tauri-plugin-autostart").length > 0
  ) {
    errors.push("未选择开机自启时不得声明 tauri-plugin-autostart 依赖");
  }
}

function pluginRegistrations(sourceText, token) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return [...sourceText.matchAll(new RegExp(`\\.plugin\\s*\\(\\s*${escaped}`, "gu"))];
}

function requireSinglePluginRegistration(sourceText, token, label, errors) {
  const registrations = pluginRegistrations(sourceText, token);
  if (registrations.length !== 1) {
    errors.push(`${label}必须在 Tauri Builder 中恰好注册一次，实际 ${registrations.length} 次`);
  }
  return registrations[0]?.index ?? -1;
}

function validatePluginOrder(sourceText, profile, errors) {
  const registrations = [
    ...(profile.singleInstance
      ? [["single-instance", "tauri_plugin_single_instance::init"]]
      : []),
    ...(profile.deepLink ? [["deep-link", "tauri_plugin_deep_link::init"]] : []),
    ["os", "tauri_plugin_os::init"],
    ["updater", "tauri_plugin_updater::Builder::new"],
    ["window-state", "tauri_plugin_window_state::Builder::default"],
    ["dialog", "tauri_plugin_dialog::init"],
    ...(profile.systemNotification
      ? [["notification", "tauri_plugin_notification::init"]]
      : []),
    ...(profile.autostart ? [["autostart", "tauri_plugin_autostart::init"]] : []),
    ...(profile.globalShortcut
      ? [["global-shortcut", "tauri_plugin_global_shortcut::Builder::new"]]
      : []),
  ].map(([label, token]) => [label, pluginRegistrations(sourceText, token)[0]?.index ?? -1]);
  const present = registrations.filter(([, index]) => index >= 0);
  if (present.some((entry, index) => index > 0 && entry[1] <= present[index - 1][1])) {
    errors.push(`Tauri plugin 注册顺序必须为：${registrations.map(([label]) => label).join(" → ")}`);
  }
  const allPluginIndexes = [...sourceText.matchAll(/\.plugin\s*\(/gu)].map((match) => match.index);
  if (profile.singleInstance && present[0]?.[1] !== allPluginIndexes[0]) {
    errors.push("tauri-plugin-single-instance 必须作为首个 Tauri plugin 注册");
  }
}

/** dialog 是固定 WebView 能力，但仍必须由中央 Rust Builder 恰好初始化一次。 */
function validateDialogRuntime(sourceText, errors) {
  const registrations = pluginRegistrations(sourceText, "tauri_plugin_dialog::init");
  if (registrations.length !== 1) {
    errors.push(`原生 dialog 插件必须在 Tauri Builder 中恰好注册一次，实际 ${registrations.length} 次`);
    return;
  }
  if (!/\.plugin\s*\(\s*tauri_plugin_dialog::init\s*\(\s*\)\s*\)/u.test(sourceText)) {
    errors.push("原生 dialog 插件必须通过 .plugin(tauri_plugin_dialog::init()) 初始化");
  }
}

function validateSingleInstanceRuntime(sourceTexts, pluginArguments, errors) {
  const sourceText = sourceTexts.join("\n");
  const registrations = pluginRegistrations(
    sourceText,
    "tauri_plugin_single_instance::init",
  );
  if (registrations.length !== 1) {
    errors.push(`tauri-plugin-single-instance 必须恰好注册一次，实际 ${registrations.length} 次`);
    return;
  }
  const callbackWindow = pluginArguments.find((argument) =>
    argument.includes("tauri_plugin_single_instance::init"),
  ) ?? "";
  const parameters = callbackWindow.match(/\|\s*app\s*,\s*(_args|_)\s*,\s*(_cwd|_)\s*\|/u);
  if (!parameters || !/restore_main_window\s*\(\s*app\s*\)/u.test(callbackWindow)) {
    errors.push("单实例回调必须使用忽略参数并只调用 restore_main_window(app) 恢复既有窗口");
    return;
  }
  for (const name of parameters.slice(1).filter((value) => value !== "_")) {
    if ((callbackWindow.match(new RegExp(`\\b${name}\\b`, "gu")) ?? []).length !== 1) {
      errors.push("单实例回调不得消费参数/工作目录");
    }
  }
}

function validateLocaleRuntime(sourceText, errors) {
  requireSinglePluginRegistration(sourceText, "tauri_plugin_os::init", "系统语言 os 插件", errors);
  const localeFunctions = collectRustFunctions(sourceText);
  validateFixedIpcRuntimeContract(sourceText, errors);
  const resolver = localeFunctions.find(
    (candidate) => candidate.name === "resolve_system_locale",
  );
  const normalizer = localeFunctions.find(
    (candidate) => candidate.name === "normalize_bcp47_locale",
  );
  if (!resolver?.text.includes("tauri_plugin_os::locale()")) {
    errors.push("系统语言基线必须从 Rust 直接调用 tauri_plugin_os::locale()");
  }
  if (/tauri_plugin_os::locale\s*\(\s*\)\s*\.ok\s*\(/u.test(sourceText)) {
    errors.push("tauri_plugin_os::locale() 直接返回 Option<String>，不得按 Result 调用 .ok()");
  }
  for (const token of ["normalize_bcp47_locale", "en-US", "saved_language"]) {
    if (!sourceText.includes(token)) errors.push(`系统语言归一化/回退链路缺少：${token}`);
  }
  for (const token of ["replace('_', \"-\")", "to_ascii_lowercase", '"zh-cn"', '"zh-CN"', '"en-us"', '"en-US"']) {
    if (!normalizer?.text.includes(token)) {
      errors.push(`系统语言 BCP-47 分隔符/大小写/支持语言归一化缺少：${token}`);
    }
  }
}

function validateUpdaterRuntime(sourceText, exposeCommand, errors) {
  const runtimeCode = sanitizeRustSource(sourceText, true);
  requireSinglePluginRegistration(
    sourceText,
    "tauri_plugin_updater::Builder::new",
    "updater 插件",
    errors,
  );
  for (const token of [
    "UpdateController",
    "UpdateTaskOwner",
    "UpdaterStatus::NotConfigured",
    "AtomicBool",
    "JoinHandle",
    ".abort(",
  ]) {
    if (!sourceText.includes(token)) errors.push(`updater 基线缺少：${token}`);
  }
  const checkFunction = collectRustFunctions(runtimeCode).find(
    (candidate) => candidate.name === "check_for_updates",
  );
  if (!checkFunction) {
    errors.push("updater 基线缺少 check_for_updates 状态入口");
  } else {
    const checkCode = checkFunction.text;
    const gate = /if\s*!\s*controller\.configured\s*\{\s*return\s+UpdaterStatus::NotConfigured\s*;\s*\}/u.exec(
      checkCode,
    );
    const controlledCalls = updaterOutboundCalls(checkFunction.text);
    const checkCall = controlledCalls.find((call) => call[1] === "check");
    if (
      !gate ||
      !checkCall ||
      controlledCalls.some((call) => call.index < gate.index + gate[0].length)
    ) {
      errors.push("check_for_updates 必须在官方 .check() 前返回 NotConfigured，保证未配置时零出站");
    }
    const allCalls = [...runtimeCode.matchAll(UPDATER_OUTBOUND_METHOD_PATTERN)];
    if (allCalls.length !== controlledCalls.length) {
      const observedMethods = [
        ...new Set(allCalls.map((call) => `.${call[1]}()`)),
      ].join("、");
      errors.push(
        `updater 的 .check()/.download_and_install()/.install() 只能位于受控 check_for_updates/UpdateTaskOwner 路径，发现 ${allCalls.length - controlledCalls.length} 次额外调用${observedMethods ? `（当前方法：${observedMethods}）` : ""}`,
      );
    }
  }
  if (
    exposeCommand &&
    !/#\[tauri::command\]\s*(?:pub\s+)?async\s+fn\s+check_for_updates\s*\(/u.test(runtimeCode)
  ) {
    errors.push("about_page 启用时 check_for_updates 必须是已注册的窄 Tauri command");
  }
}

function validateWindowStateRuntime(sourceText, pluginArguments, errors) {
  requireSinglePluginRegistration(
    sourceText,
    "tauri_plugin_window_state::Builder::default",
    "window-state 插件",
    errors,
  );
  const argument = pluginArguments.find((candidate) =>
    candidate.includes("tauri_plugin_window_state::Builder::default"),
  );
  if (!argument || !argument.includes("with_state_flags")) {
    errors.push("window-state 必须显式调用 with_state_flags，不能使用全量默认状态");
    return;
  }
  for (const flag of ["StateFlags::SIZE", "StateFlags::POSITION", "StateFlags::MAXIMIZED"]) {
    if (!argument.includes(flag)) errors.push(`window-state 精确恢复集合缺少 ${flag}`);
  }
  for (const forbidden of [
    "StateFlags::VISIBLE",
    "StateFlags::DECORATIONS",
    "StateFlags::FULLSCREEN",
    "StateFlags::all",
  ]) {
    if (argument.includes(forbidden)) errors.push(`window-state 不得保存 ${forbidden}`);
  }
  const setupWiring = collectMethodArguments(sourceText, "setup").some((candidate) =>
    candidate.includes("ensure_main_window_is_recoverable"),
  );
  if (!setupWiring) {
    errors.push("window-state 必须从 Builder setup 实际调用 ensure_main_window_is_recoverable");
  }
  const windowStateFunctions = collectRustFunctions(sourceText);
  const geometryCheck = windowStateFunctions.find(
    (candidate) => candidate.name === "saved_window_geometry_is_recoverable",
  );
  for (const token of ["width >= 960", "height >= 640", "monitors.iter().any"]) {
    if (!geometryCheck?.text.includes(token)) {
      errors.push(`window-state 无效/离屏几何判定缺少：${token}`);
    }
  }
  const recovery = windowStateFunctions.find(
    (candidate) => candidate.name === "ensure_main_window_is_recoverable",
  );
  for (const token of ["set_min_size", "960.0", "640.0", "set_size", "1440.0", "900.0", ".center()"] ) {
    if (!recovery?.text.includes(token)) {
      errors.push(`window-state 1440×900 居中/960×640 回退实现缺少：${token}`);
    }
  }
}

function validateAutostartRuntime(sourceTexts, errors) {
  const sourceText = sourceTexts.join("\n");
  requireSinglePluginRegistration(
    sourceText,
    "tauri_plugin_autostart::init",
    "autostart 插件",
    errors,
  );
  for (const token of [
    "MacosLauncher::LaunchAgent",
    "ManagerExt",
    "autolaunch",
    "get_autostart_enabled",
    "set_autostart_enabled",
    "is_enabled",
    ".enable(",
    ".disable(",
  ]) {
    if (!sourceText.includes(token)) errors.push(`开机自启 Rust-only 合同缺少：${token}`);
  }
  if (!/tauri_plugin_autostart::init\s*\(\s*(?:tauri_plugin_autostart::)?MacosLauncher::LaunchAgent\s*,\s*None\s*\)/u.test(sourceText)) {
    errors.push("开机自启必须使用 MacosLauncher::LaunchAgent 且不传启动参数");
  }
  for (const forbidden of ["--hidden", "--minimized", "--silent-start"]) {
    if (sourceText.includes(forbidden)) errors.push(`开机自启不得加入隐藏参数：${forbidden}`);
  }
  const setupArguments = sourceTexts.flatMap((text) => collectMethodArguments(text, "setup"));
  if (setupArguments.some((argument) => argument.includes("autolaunch") && argument.includes(".enable("))) {
    errors.push("初始化 setup 不得替用户注册开机自启");
  }
  const command = collectRustFunctions(sourceText).find(
    (candidate) => candidate.name === "set_autostart_enabled",
  );
  if (command) {
    const mutation = Math.max(command.text.indexOf(".enable("), command.text.indexOf(".disable("));
    if (mutation < 0 || command.text.lastIndexOf("is_enabled") < mutation) {
      errors.push("开机自启 mutation 成功后必须重新读取并返回最终 OS 状态");
    }
  }
}

function validateDisabledRuntime(sourceText, label, tokens, errors) {
  for (const token of tokens) {
    if (sourceText.includes(token)) errors.push(`未选择${label}时不得保留运行时：${token}`);
  }
}

function validateExactRestoreDeepLink(sourceText, expectedUrl, errors) {
  const uncommentedSource = sanitizeRustSource(sourceText);
  const escapedUrl = expectedUrl.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const constantPattern = new RegExp(
    `\\bconst\\s+APP_DEEP_LINK_RESTORE_URL\\s*:\\s*&\\s*(?:'static\\s+)?str\\s*=\\s*"${escapedUrl}"\\s*;`,
    "gu",
  );
  if ([...uncommentedSource.matchAll(constantPattern)].length !== 1) {
    errors.push(`deep-link APP_DEEP_LINK_RESTORE_URL 必须精确声明为 "${expectedUrl}"`);
  }

  const validator = collectRustFunctions(
    sanitizeRustSource(sourceText, true),
  ).find(
    (candidate) => candidate.name === "validate_restore_deep_link",
  );
  const validatorCode = validator?.text ?? "";
  const functionMatch = validatorCode.match(
    /^fn\s+validate_restore_deep_link\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*&\s*str\s*\)\s*->\s*bool\s*\{([\s\S]*)\}\s*$/u,
  );
  let exactEquality = false;
  if (functionMatch) {
    const parameter = functionMatch[1];
    const expression = functionMatch[2]
      .trim()
      .replace(/^return\s+/u, "")
      .replace(/;\s*$/u, "")
      .replace(/[()\s]/gu, "");
    exactEquality =
      expression === `${parameter}==APP_DEEP_LINK_RESTORE_URL` ||
      expression === `APP_DEEP_LINK_RESTORE_URL==${parameter}`;
  }
  if (!exactEquality) {
    errors.push(
      "deep-link validate_restore_deep_link 必须只对 APP_DEEP_LINK_RESTORE_URL 做精确等值比较；不得使用 starts_with 等宽松匹配，query/fragment/userinfo/port 必须拒绝",
    );
  }
}

function validateDisabledDeepLinkConfig(guiRoot, errors) {
  let config;
  try {
    config = JSON.parse(
      fs.readFileSync(path.join(guiRoot, "src-tauri", "tauri.conf.json"), "utf8"),
    );
  } catch (error) {
    errors.push(`无法读取 deep-link Tauri 配置：${error.message}`);
    return;
  }
  if (
    config?.plugins &&
    Object.prototype.hasOwnProperty.call(config.plugins, "deep-link")
  ) {
    errors.push("未选择深链接时不得保留 plugins.deep-link 或 desktop.schemes 配置");
  }
}

function validateDeepLinkRuntime(guiRoot, sourceText, errors) {
  requireSinglePluginRegistration(
    sourceText,
    "tauri_plugin_deep_link::init",
    "deep-link 插件",
    errors,
  );
  const projectId = path.basename(guiRoot).replace(/_gui$/u, "");
  const expectedScheme = `app-${projectId.replaceAll("_", "-")}`;
  let config;
  try {
    config = JSON.parse(fs.readFileSync(path.join(guiRoot, "src-tauri", "tauri.conf.json"), "utf8"));
  } catch (error) {
    errors.push(`无法读取 deep-link Tauri 配置：${error.message}`);
    return;
  }
  const schemes = config?.plugins?.["deep-link"]?.desktop?.schemes;
  if (JSON.stringify(schemes) !== JSON.stringify([expectedScheme])) {
    errors.push(`deep-link desktop.schemes 必须精确为 ["${expectedScheme}"]`);
  }
  validateExactRestoreDeepLink(
    sourceText,
    `${expectedScheme}://restore`,
    errors,
  );
  for (const token of [
    "DeepLinkExt",
    "get_current",
    "on_open_url",
    "validate_restore_deep_link",
    `${expectedScheme}://restore`,
    "restore_main_window",
  ]) {
    if (!sourceText.includes(token)) errors.push(`deep-link 冷热启动受限路由缺少：${token}`);
  }
  const installer = collectRustFunctions(sourceText).find(
    (candidate) => candidate.name === "install_deep_link",
  );
  if (
    !installer ||
    !/if\s+let\s+Ok\s*\(\s*Some\s*\([^)]*\)\s*\)\s*=\s*[^;{}]*\.get_current\s*\(\s*\)/u.test(
      installer.text,
    )
  ) {
    errors.push("deep-link 冷启动必须按官方 Result<Option<Vec<Url>>> 返回型解构 get_current()");
  }
  if (/\.deep_link\s*\(\s*\)\s*\.(?:register|register_all|unregister|is_registered)\s*\(/u.test(sourceText)) {
    errors.push("deep-link 中性静态 restore 路线不得预开运行时注册/注销/查询 API");
  }
}

function validateInvokeHandler(sourceTexts, profile, errors) {
  const argumentsList = sourceTexts.flatMap((text) => collectMethodArguments(text, "invoke_handler"));
  const expected = allowedInitializationCommands(profile);
  if (argumentsList.length !== 1) {
    errors.push(`GUI 初始化必须只有一个合并的 .invoke_handler(generate_handler![...])，实际 ${argumentsList.length} 个`);
    return;
  }
  const handlerLists = sourceTexts.flatMap((text) => invokeHandlerCommands(text));
  const actual = handlerLists.length === 1 ? handlerLists[0] : [];
  for (const command of expected) {
    if (!actual.includes(command)) {
      errors.push(`合并的 generate_handler! 缺少已启用命令：${command}`);
    }
  }
  const duplicates = [...new Set(actual.filter(
    (command, index) => actual.indexOf(command) !== index,
  ))];
  if (duplicates.length > 0) {
    errors.push(`合并的 generate_handler! 不得重复命令：${duplicates.join("、")}`);
  }
  const expectedSet = new Set(expected);
  const unexpected = actual.filter((command) => !expectedSet.has(command));
  if (unexpected.length > 0) {
    errors.push(`合并的 generate_handler! 不得接入未批准命令：${unexpected.join("、")}`);
  }
}

/** 验证固定/条件插件已接入实际 Builder，且 disabled 能力无源码残留。 */
export function validatePluginRuntimeContract(guiRoot, sourceTexts, profile, errors) {
  const sourceText = sourceTexts.join("\n");
  const pluginArguments = collectMethodArguments(sourceText, "plugin");
  validatePluginOrder(sourceText, profile, errors);
  validateLocaleRuntime(sourceText, errors);
  // 中性 GUI 必须显式配置 plugins.updater = { endpoints: [], pubkey: "" }
  validateUpdaterConfiguration(guiRoot, errors);
  validateUpdaterRuntime(sourceText, profile.aboutPage, errors);
  validateWindowStateRuntime(sourceText, pluginArguments, errors);
  validateDialogRuntime(sourceText, errors);

  if (profile.singleInstance) validateSingleInstanceRuntime(sourceTexts, pluginArguments, errors);
  else validateDisabledRuntime(sourceText, "单实例", ["tauri_plugin_single_instance"], errors);

  if (profile.deepLink) validateDeepLinkRuntime(guiRoot, sourceText, errors);
  else {
    validateDisabledRuntime(
      sourceText,
      "深链接",
      ["tauri_plugin_deep_link", "DeepLinkExt", "on_open_url"],
      errors,
    );
    validateDisabledDeepLinkConfig(guiRoot, errors);
  }

  if (profile.globalShortcut) validateGlobalShortcutRuntimeContract(sourceText, profile, errors);
  else validateDisabledRuntime(sourceText, "全局快捷键", ["tauri_plugin_global_shortcut", "GlobalShortcutExt", "OwnedGlobalShortcutRegistry", "global_shortcut_", "globalShortcut"], errors);

  if (profile.systemNotification) validateNotificationRuntime(sourceTexts, errors);
  else validateDisabledRuntime(sourceText, "系统通知", ["tauri_plugin_notification", "mac_usernotifications", "NotificationCommand", "system_notification"], errors);

  if (profile.autostart) validateAutostartRuntime(sourceTexts, errors);
  else validateDisabledRuntime(sourceText, "开机自启", ["tauri_plugin_autostart", "autolaunch", "get_autostart_enabled", "set_autostart_enabled"], errors);

  validateInvokeHandler(sourceTexts, profile, errors);
}

/** 返回当前 profile 必须存在的独立插件回归名称。 */
export function requiredPluginTestNames(profile) {
  return [
    ...BASELINE_TEST_NAMES,
    ...(profile.singleInstance ? SINGLE_INSTANCE_TEST_NAMES : []),
    ...(profile.systemNotification ? SYSTEM_NOTIFICATION_TEST_NAMES : []),
    ...(profile.autostart ? AUTOSTART_TEST_NAMES : []),
    ...(profile.deepLink ? DEEP_LINK_TEST_NAMES : []),
    ...(profile.globalShortcut ? GLOBAL_SHORTCUT_TEST_NAMES : []),
    ...(profile.globalShortcutActions.some(
      (action) => action.bindingPolicy === "user-configurable",
    )
      ? USER_CONFIGURABLE_GLOBAL_SHORTCUT_TEST_NAMES
      : []),
  ];
}

/** 拒绝 assert!(true)、字面量自比较等只为通过门禁的空回归。 */
export function hasMeaningfulRustAssertion(functionText) {
  const assertions = [
    ...functionText.matchAll(/\bassert(?:_eq|_ne)?!\s*\(([^;]+)\)\s*;/gu),
  ];
  return assertions.some((match) => {
    const expression = match[1]
      .replace(/"(?:\\.|[^"\\])*"/gu, "")
      .replace(/'(?:\\.|[^'\\])*'/gu, "")
      .replace(/\b(?:true|false|None|Some|Ok|Err)\b/gu, "")
      .replace(/\b\d+(?:\.\d+)?\b/gu, "");
    return /\b[a-z_][a-z0-9_]*\b/u.test(expression);
  });
}

/** 验证固定测试存在且至少一个断言依赖变量、函数结果或状态。 */
export function validateRequiredPluginTests(testFunctions, profile, errors) {
  for (const testName of requiredPluginTestNames(profile)) {
    const testFunction = testFunctions.find((candidate) => candidate.name === testName);
    if (!testFunction) {
      errors.push(`缺少固定 GUI 插件回归测试：${testName}`);
    } else if (!hasMeaningfulRustAssertion(testFunction.text)) {
      errors.push(`固定 GUI 插件回归必须包含非平凡断言：${testName}`);
    }
  }
  validateGlobalShortcutTestCoverage(testFunctions, profile, errors);
  if (profile.autostart) {
    const restoration = testFunctions.find(
      (candidate) => candidate.name === "autostart_e2e_restores_previous_registration",
    );
    if (
      restoration &&
      !["previous", "is_enabled", "enable", "disable"].every((token) =>
        restoration.text.includes(token),
      )
    ) {
      errors.push("开机自启 E2E 回归必须记录原状态、切换注册并恢复后重新读取");
    }
  }
}
