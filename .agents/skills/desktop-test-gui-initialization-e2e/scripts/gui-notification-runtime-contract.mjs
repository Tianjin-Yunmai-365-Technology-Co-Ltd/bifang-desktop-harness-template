import {
  collectRustFunctions,
  sanitizeRustSource,
} from "./gui-lifecycle-source-analysis.mjs";

export const SYSTEM_NOTIFICATION_TEST_NAMES = [
  "system_notification_defaults_disabled",
  "system_notification_permission_precedes_persistence",
  "macos_notification_authorization_status_precedes_request",
  "macos_notification_request_is_limited_to_not_determined",
  "macos_denied_or_restricted_notification_opens_settings",
  "macos_notification_undetermined_after_request_opens_settings",
  "macos_notification_settings_targets_current_app",
  "macos_notification_settings_open_failure_is_observable",
  "system_notification_delivery_failure_is_observable",
  "system_notification_channel_serializes_authorization_and_delivery",
  "system_notification_worker_is_owned_and_cancelled",
  "macos_system_notifications_use_modern_user_notifications",
];

const MACOS_CFG = /#\[\s*cfg\s*\(\s*target_os\s*=\s*"macos"\s*\)\s*\]/u;
const NON_MACOS_CFG = /#\[\s*cfg\s*\(\s*not\s*\(\s*target_os\s*=\s*"macos"\s*\)\s*\)\s*\]/u;

function hasImmediateCfg(sourceText, candidate, cfgPattern) {
  const prefix = sourceText.slice(Math.max(0, candidate.start - 512), candidate.start);
  return new RegExp(
    `${cfgPattern.source}\\s*(?:#\\[[^\\]]+\\]\\s*)*(?:pub(?:\\([^)]*\\))?\\s+)?async\\s*$`,
    "u",
  ).test(prefix);
}

function cfgFunctions(sourceText, rustFunctions, name, cfgPattern) {
  return rustFunctions.filter(
    (candidate) => candidate.name === name && hasImmediateCfg(sourceText, candidate, cfgPattern),
  );
}

function validatePlatformHelperPair(sourceText, rustFunctions, name, errors) {
  const named = rustFunctions.filter((candidate) => candidate.name === name);
  const macos = cfgFunctions(sourceText, rustFunctions, name, MACOS_CFG);
  const nonMacos = cfgFunctions(sourceText, rustFunctions, name, NON_MACOS_CFG);
  const appHandle = /^\s*app\s*:\s*&\s*tauri::AppHandle\s*(?:,|$)/u;
  const payload = /,\s*payload\s*:\s*&\s*NotificationPayload\s*$/u;
  const signaturesMatch = [...macos, ...nonMacos].every((candidate) =>
    appHandle.test(candidate.parameters) && (name !== "deliver_system_notification" || payload.test(candidate.parameters)),
  );
  if (named.length !== 2 || macos.length !== 1 || nonMacos.length !== 1 || !signaturesMatch) {
    errors.push(`系统通知 ${name} 必须在 macOS 与非 macOS cfg 分支各有且仅有一个 async 实现，并统一接收 app: &tauri::AppHandle`);
  }
  return { macos: macos[0], nonMacos: nonMacos[0] };
}

function exactFunction(rustFunctions, name, errors, label) {
  const matches = rustFunctions.filter((candidate) => candidate.name === name);
  if (matches.length !== 1) errors.push(`${label}必须恰好实现一次，实际 ${matches.length} 次`);
  return matches[0];
}

function hasNotificationWorkerState(candidate) {
  return /\bworker\s*:\s*(?:tauri::)?State\s*<\s*'_\s*,\s*NotificationWorker\s*>/u.test(candidate?.parameters ?? "");
}

function collectBracedBlock(code, headerPattern) {
  const header = headerPattern.exec(code);
  if (!header) return undefined;
  const start = code.indexOf("{", header.index);
  let depth = 0;
  for (let index = start; index < code.length; index += 1) {
    if (code[index] === "{") depth += 1;
    else if (code[index] === "}") {
      depth -= 1;
      if (depth === 0) return { start, end: index, text: code.slice(start, index + 1) };
    }
  }
  return undefined;
}

function validateWorkerRouting(sourceText, rustFunctions, errors) {
  const starter = exactFunction(rustFunctions, "start_notification_worker", errors, "系统通知 worker 启动函数");
  const runner = exactFunction(rustFunctions, "run_notification_worker", errors, "系统通知串行接收循环");
  const starterCode = sanitizeRustSource(starter?.text ?? "", true);
  const runnerCode = sanitizeRustSource(runner?.text ?? "", true);
  const channelCalls = [...starterCode.matchAll(/\bmpsc::(channel|unbounded_channel)\s*\(\s*([^)]*)\)/gu)];
  const boundedCapacity = channelCalls.length === 1 &&
    channelCalls[0][1] === "channel" && /^[1-9][0-9]*$/u.test(channelCalls[0][2].trim());
  if (
    !boundedCapacity ||
    !/tauri::async_runtime::spawn\s*\(\s*run_notification_worker\s*\(\s*receiver\s*\)\s*\)/u.test(starterCode) ||
    !sanitizeRustSource(sourceText, true).includes(".manage(start_notification_worker())")
  ) {
    errors.push("系统通知必须由 Tauri Builder 管理唯一 start_notification_worker 及其有界 mpsc 通道");
  }
  const receiveCount = [...runnerCode.matchAll(/\breceiver\s*\.\s*recv\s*\(\s*\)\s*\.await/gu)].length;
  const requestBranch = runnerCode.indexOf("NotificationCommand::RequestPermission");
  const deliveryBranch = runnerCode.indexOf("NotificationCommand::Deliver");
  const requestCode = requestBranch >= 0 && deliveryBranch > requestBranch
    ? runnerCode.slice(requestBranch, deliveryBranch)
    : "";
  const deliveryCode = deliveryBranch >= 0 ? runnerCode.slice(deliveryBranch) : "";
  if (
    receiveCount !== 1 ||
    !/while\s+let\s+Some\s*\(\s*command\s*\)\s*=\s*receiver\s*\.\s*recv\s*\(\s*\)\s*\.await\s*\{/u.test(runnerCode) ||
    !runnerCode.includes("match command") ||
    !/let\s+result\s*=\s*request_system_notification_permission\s*\(\s*&\s*app\s*\)\s*\.await\s*;\s*let\s+_?[A-Za-z][A-Za-z0-9_]*\s*=\s*reply\s*\.\s*send\s*\(\s*result\s*\)\s*;/u.test(requestCode) ||
    !/let\s+result\s*=\s*deliver_system_notification\s*\(\s*&\s*app\s*,\s*&\s*payload\s*\)\s*\.await\s*;\s*let\s+_?[A-Za-z][A-Za-z0-9_]*\s*=\s*reply\s*\.\s*send\s*\(\s*result\s*\)\s*;/u.test(deliveryCode)
  ) {
    errors.push("系统通知唯一 receiver 循环必须串行分派 RequestPermission 与 Deliver，并通过各自 oneshot 返回平台 helper 结果");
  }
  const shutdown = exactFunction(rustFunctions, "shutdown", errors, "系统通知 worker shutdown");
  const shutdownCode = sanitizeRustSource(shutdown?.text ?? "", true);
  const run = exactFunction(rustFunctions, "run", errors, "Tauri 生命周期入口");
  const runCode = sanitizeRustSource(run?.text ?? "", true);
  const dropContract = /impl\s+Drop\s+for\s+NotificationWorker\s*\{[\s\S]*?fn\s+drop\s*\([^)]*\)\s*\{[\s\S]*?self\.sender\.get_mut\(\)[\s\S]*?\.take\(\)[\s\S]*?self\.task\.abort\(\)/u;
  const exitContract = /matches!\s*\(\s*event\s*,\s*tauri::RunEvent::ExitRequested\s*\{\s*\.\.\s*\}\s*\|\s*tauri::RunEvent::Exit\s*\)\s*\{[\s\S]*?app\.state::<NotificationWorker>\(\)\.shutdown\(\)/u;
  if (
    !/self\.sender\.lock\(\)[\s\S]*?\.take\(\)[\s\S]*?self\.task\.abort\(\)/u.test(shutdownCode) ||
    !dropContract.test(sanitizeRustSource(sourceText, true)) ||
    !exitContract.test(runCode)
  ) {
    errors.push("系统通知必须在 ExitRequested、Exit 与 Drop 路径关闭 sender，并等待或取消唯一 worker task");
  }
}

function validateQueuedCommand(command, variant, errors, label) {
  const code = sanitizeRustSource(command?.text ?? "", true);
  const queueSource =
    `sender\\s*\\.\\s*send\\s*\\(\\s*NotificationCommand::${variant}\\s*\\{[\\s\\S]*?reply\\s*:\\s*reply_tx[\\s\\S]*?\\}\\s*\\)\\s*\\.await`;
  const queuePattern = new RegExp(queueSource, "u");
  const sendPropagationPattern = new RegExp(
    `${queueSource}\\s*\\.map_err\\s*\\([^;]*\\)\\s*\\?\\s*;`,
    "u",
  );
  const queued = queuePattern.exec(code);
  const sendPropagation = sendPropagationPattern.exec(code);
  const replyPropagation = /reply_rx\s*\.\s*await\s*\.\s*map_err\s*\([^;]*\)\s*\?\?\s*;/u.exec(code);
  const replyChannels = [
    ...code.matchAll(/let\s*\(\s*reply_tx\s*,\s*reply_rx\s*\)\s*=\s*oneshot::channel\s*\(\s*\)\s*;/gu),
  ];
  const senderAcquisitions = [
    ...code.matchAll(/let\s+sender\s*=\s*worker\.sender\(\)\?\s*;/gu),
  ];
  const variantUses = [
    ...code.matchAll(new RegExp(`\\bNotificationCommand::${variant}\\b`, "gu")),
  ];
  const replyAwaits = [...code.matchAll(/\breply_rx\s*\.\s*await\b/gu)];
  const replyAwait = replyPropagation?.index ?? -1;
  if (
    !hasNotificationWorkerState(command) ||
    replyChannels.length !== 1 ||
    senderAcquisitions.length !== 1 ||
    variantUses.length !== 1 ||
    replyAwaits.length !== 1 ||
    !queued ||
    replyChannels[0]?.index > senderAcquisitions[0]?.index ||
    senderAcquisitions[0]?.index > queued.index ||
    replyAwait < (queued?.index ?? 0)
  ) {
    errors.push(`${label}必须通过同一 NotificationWorker.sender 排队 ${variant} 并等待 oneshot 回执`);
  }
  if (!sendPropagation || !replyPropagation || replyAwait < (sendPropagation?.index ?? 0)) {
    errors.push(`${label}必须传播 mpsc send 失败、oneshot 接收失败与 worker 返回的内层错误`);
  }
  return {
    code,
    channel: replyChannels[0]?.index ?? -1,
    queued: queued?.index ?? -1,
    replyAwait,
    replyEnd: replyPropagation ? replyPropagation.index + replyPropagation[0].length : -1,
  };
}

function validateCommandRouting(sourceText, rustFunctions, errors) {
  const reader = exactFunction(
    rustFunctions,
    "read_system_notification_setting",
    errors,
    "系统通知权威设置读取入口",
  );
  const getter = exactFunction(
    rustFunctions,
    "get_system_notification_setting",
    errors,
    "系统通知 get command",
  );
  const sourceCode = sanitizeRustSource(sourceText, true);
  const defaultDefinitions = [
    ...sourceCode.matchAll(/\bconst\s+DEFAULT_SYSTEM_NOTIFICATION_SETTING\s*:\s*bool\s*=/gu),
  ];
  const getterCode = sanitizeRustSource(getter?.text ?? "", true);
  if (
    defaultDefinitions.length !== 1 ||
    !/\bconst\s+DEFAULT_SYSTEM_NOTIFICATION_SETTING\s*:\s*bool\s*=\s*false\s*;/u.test(sourceCode) ||
    !reader ||
    !/\{\s*Ok\s*\(\s*read_system_notification_setting\s*\(\s*\)\s*\.await\s*\.unwrap_or\s*\(\s*DEFAULT_SYSTEM_NOTIFICATION_SETTING\s*\)\s*\)\s*\}\s*$/u.test(getterCode)
  ) {
    errors.push("系统通知 get command 必须从唯一权威读取入口读取，并把缺失或损坏设置实质回退为默认 false");
  }
  const setting = exactFunction(rustFunctions, "set_system_notification_enabled", errors, "系统通知设置命令");
  const settingRoute = validateQueuedCommand(setting, "RequestPermission", errors, "系统通知设置命令");
  const persistence = settingRoute.code.indexOf("persist_system_notification_setting(enabled).await?");
  const finalRead = /persist_system_notification_setting\s*\(\s*enabled\s*\)\s*\.await\s*\?\s*;\s*get_system_notification_setting\s*\(\s*\)\s*\.await\s*\}\s*$/u.test(settingRoute.code);
  const enabledBlocks = [...settingRoute.code.matchAll(/\bif\s+enabled\s*\{/gu)];
  const enabledBlock = enabledBlocks.length === 1
    ? collectBracedBlock(settingRoute.code, /\bif\s+enabled\s*\{/u)
    : undefined;
  const permissionRequests = [
    ...settingRoute.code.matchAll(/\bNotificationCommand::RequestPermission\b/gu),
  ];
  const roundTripInsideEnabled = enabledBlock &&
    settingRoute.channel > enabledBlock.start && settingRoute.replyEnd < enabledBlock.end;
  const outsideEnabled = enabledBlock
    ? `${settingRoute.code.slice(0, enabledBlock.start)}${" ".repeat(enabledBlock.end - enabledBlock.start + 1)}${settingRoute.code.slice(enabledBlock.end + 1)}`
    : settingRoute.code;
  if (
    !enabledBlock || permissionRequests.length !== 1 ||
    !enabledBlock.text.includes("NotificationCommand::RequestPermission") ||
    !roundTripInsideEnabled ||
    /\b(?:NotificationCommand::RequestPermission|request_system_notification_permission|open_macos_notification_settings|mac_usernotifications::request_auth)\s*(?:\{|\()/u.test(outsideEnabled)
  ) {
    errors.push("系统通知 RequestPermission 必须且只能位于 if enabled 分支，关闭设置不得请求权限或跳转系统设置");
  }
  if (
    /\b(?:request_system_notification_permission|open_macos_notification_settings|mac_usernotifications::request_auth)\s*\(/u.test(settingRoute.code) ||
    settingRoute.queued < 0 ||
    settingRoute.replyAwait < settingRoute.queued ||
    persistence < settingRoute.replyAwait ||
    !finalRead
  ) {
    errors.push("系统通知设置命令必须通过 NotificationWorker.sender 等待权限回执后再持久化，不得直接调用 permission helper；mutation 成功后必须从同一 get command 返回最终权威状态");
  }
  const delivery = exactFunction(rustFunctions, "enqueue_system_notification", errors, "系统通知有界投递入口");
  const deliveryRoute = validateQueuedCommand(delivery, "Deliver", errors, "系统通知投递入口");
  if (/\bdeliver_system_notification\s*\(/u.test(deliveryRoute.code)) {
    errors.push("系统通知投递入口不得绕过同一 NotificationWorker.sender 直接调用平台 delivery helper");
  }
}

function validateMacosAuthorization(sourceText, rustFunctions, permissionFunction, errors) {
  const readers = cfgFunctions(
    sourceText,
    rustFunctions,
    "get_macos_notification_authorization_status",
    MACOS_CFG,
  );
  if (readers.length !== 1) {
    errors.push(`macOS 通知精确状态读取器必须在 macOS cfg 下恰好实现一次，实际 ${readers.length} 次`);
    return;
  }
  const statusReader = readers[0];
  const readerCode = sanitizeRustSource(statusReader.text, true);
  const mappings = [
    ["NotDetermined", "NotDetermined"],
    ["Denied", "Denied"],
    ["Authorized", "Authorized"],
    ["Provisional", "Provisional"],
    ["Ephemeral", "Ephemeral"],
    ["Unknown", "Restricted"],
  ];
  const crateStatuses = [
    ...readerCode.matchAll(/\bmac_usernotifications::AuthorizationStatus::([A-Za-z][A-Za-z0-9_]*)\b/gu),
  ];
  const readsCurrentSettings = /let\s+settings\s*=\s*mac_usernotifications::get_notification_settings\s*\(\s*\)\s*\.await[\s\S]*?\?\s*;[\s\S]*?Ok\s*\(\s*match\s+settings\.authorization_status\s*\{/u.test(readerCode);
  const exactMappings = mappings.every(([source, target]) => {
    const pattern = new RegExp(
      `\\bmac_usernotifications::AuthorizationStatus::${source}\\s*=>\\s*MacosNotificationAuthorizationStatus::${target}\\s*,`,
      "u",
    );
    return pattern.test(readerCode) && crateStatuses.filter((match) => match[1] === source).length === 1;
  });
  if (!readsCurrentSettings || crateStatuses.length !== mappings.length || !exactMappings) {
    errors.push("macOS 通知状态读取器必须消费真实 get_notification_settings().await，并把六个 crate AuthorizationStatus 精确映射到固定内部状态");
  }
  const permissionText = sanitizeRustSource(permissionFunction?.text ?? "");
  const code = sanitizeRustSource(permissionFunction?.text ?? "", true);
  const statusCall = `${statusReader.name}(`;
  const firstStatusRead = code.indexOf(statusCall);
  const requestCalls = [...code.matchAll(/\bmac_usernotifications::request_auth\s*\(/gu)];
  const request = requestCalls[0]?.index ?? -1;
  const secondStatusRead = code.indexOf(statusCall, firstStatusRead + statusCall.length);
  const openSettings = code.indexOf("open_macos_notification_settings(");
  if (requestCalls.length !== 1) errors.push("macOS 通知权限函数必须且只能调用一次 mac_usernotifications::request_auth()");
  if (
    firstStatusRead < 0 || request < 0 || secondStatusRead < 0 || openSettings < 0 ||
    firstStatusRead > request || request > secondStatusRead || secondStatusRead > openSettings
  ) {
    errors.push("macOS 通知必须先读取 AuthorizationStatus，只在 NotDetermined 请求并复读，再按最终状态决定设置恢复路径");
  }
  if (!/if\s+matches!\s*\(\s*authorization\s*,\s*MacosNotificationAuthorizationStatus::NotDetermined\s*\)\s*\{[\s\S]*?mac_usernotifications::request_auth[\s\S]*?get_macos_notification_authorization_status\s*\(\s*\)/u.test(code)) {
    errors.push("macOS 通知只允许在 NotDetermined 分支请求系统权限");
  }
  if (!/MacosNotificationAuthorizationStatus::Authorized\s*\|[\s\S]*MacosNotificationAuthorizationStatus::Provisional\s*\|[\s\S]*MacosNotificationAuthorizationStatus::Ephemeral[\s\S]*Ok\(\(\)\)/u.test(code)) {
    errors.push("macOS 通知只有 Authorized、Provisional 或 Ephemeral 才能进入授权成功路径");
  }
  if (!/MacosNotificationAuthorizationStatus::Denied\s*\|[\s\S]*MacosNotificationAuthorizationStatus::Restricted[\s\S]*open_macos_notification_settings/u.test(code)) {
    errors.push("macOS 通知 Denied/Restricted 必须进入固定 Notifications 系统设置恢复路径");
  }
  if (!/MacosNotificationAuthorizationStatus::NotDetermined\s*=>\s*\{[\s\S]*?open_macos_notification_settings/u.test(code)) {
    errors.push("macOS 通知请求后仍为 NotDetermined 时必须打开 Notifications 系统设置");
  }
  if (!/MacosNotificationAuthorizationStatus::Denied\s*\|[\s\S]*?MacosNotificationAuthorizationStatus::Restricted\s*=>\s*\{[\s\S]*?open_macos_notification_settings\s*\(\s*app\s*\)\s*\.await\?[\s\S]*?Err\s*\([\s\S]*?"permission-denied-settings-opened"[\s\S]*?"permission-restricted-settings-opened"[\s\S]*?\)/u.test(permissionText)) {
    errors.push("macOS 通知 Denied/Restricted 打开设置后必须返回稳定拒绝或受限 Err");
  }
  if (!/MacosNotificationAuthorizationStatus::NotDetermined\s*=>\s*\{[\s\S]*?open_macos_notification_settings\s*\(\s*app\s*\)\s*\.await\?[\s\S]*?Err\s*\(\s*"permission-not-granted-settings-opened"\s*\)/u.test(permissionText)) {
    errors.push("macOS 通知请求后仍为 NotDetermined 并打开设置时必须返回稳定 Err");
  }
}

function validateSettingsOpener(sourceText, rustFunctions, errors) {
  const sourceCode = sanitizeRustSource(sourceText);
  const prefixDeclarations = [
    ...sourceCode.matchAll(/\b(?:const|static|let)\s+MACOS_NOTIFICATION_SETTINGS_URL_PREFIX\b/gu),
  ];
  const exactPrefix = /#\[\s*cfg\s*\(\s*target_os\s*=\s*"macos"\s*\)\s*\]\s*const\s+MACOS_NOTIFICATION_SETTINGS_URL_PREFIX\s*:\s*&\s*str\s*=\s*"x-apple\.systempreferences:com\.apple\.Notifications-Settings\.extension\?id="\s*;/u;
  if (prefixDeclarations.length !== 1 || !exactPrefix.test(sourceCode)) {
    errors.push("macOS Notifications 设置前缀必须在 macOS cfg 下唯一且精确定义为固定 x-apple Notifications pane");
  }
  const openers = cfgFunctions(sourceText, rustFunctions, "open_macos_notification_settings", MACOS_CFG);
  const opener = openers[0];
  if (openers.length !== 1 || !/^\s*app\s*:\s*&\s*tauri::AppHandle\s*$/u.test(opener?.parameters ?? "")) {
    errors.push("macOS Notifications 设置 opener 只能接收内部 AppHandle，不能接受任意 URL 或 bundle identifier");
  }
  const code = sanitizeRustSource(opener?.text ?? "");
  const bundleAssignments = [...code.matchAll(/\blet\s+bundle_identifier\s*=/gu)];
  const settingsAssignments = [...code.matchAll(/\blet\s+settings_url\s*=/gu)];
  const bundle = /let\s+bundle_identifier\s*=\s*app\.config\(\)\.identifier\.clone\(\)\s*;/u.exec(code);
  const settings = /let\s+settings_url\s*=\s*format!\s*\(\s*"\{MACOS_NOTIFICATION_SETTINGS_URL_PREFIX\}\{bundle_identifier\}"\s*\)\s*;/u.exec(code);
  const command = /tauri::async_runtime::spawn_blocking[\s\S]*?std::process::Command::new\s*\(\s*"\/usr\/bin\/open"\s*\)\s*\.arg\s*\(\s*settings_url\s*\)\s*\.status\s*\(\s*\)/u.exec(code);
  const result = /if\s+status\.success\(\)\s*\{\s*Ok\(\(\)\)\s*\}\s*else\s*\{\s*Err\(\s*"notification-settings-open-failed"\s*\)\s*\}/u.exec(code);
  if (
    bundleAssignments.length !== 1 || settingsAssignments.length !== 1 ||
    !bundle || !settings || !command || !result ||
    !(bundle.index < settings.index && settings.index < command.index && command.index < result.index)
  ) {
    errors.push("macOS Notifications 设置 opener 缺少受控结果检查：必须由当前 app identifier 构造固定 URL，并检查 open 退出状态");
  }
}

export function validateNotificationRuntime(sourceTexts, errors) {
  const sourceText = sourceTexts.join("\n");
  const registrations = [...sourceText.matchAll(/\.plugin\s*\(\s*tauri_plugin_notification::init/gu)];
  if (registrations.length !== 1) errors.push(`notification 插件必须在 Tauri Builder 中恰好注册一次，实际 ${registrations.length} 次`);
  for (const token of [
    "NotificationPayload", "NotificationCommand", "mpsc", "oneshot", "JoinHandle",
    "get_system_notification_setting", "set_system_notification_enabled", "enqueue_system_notification",
    "mac_usernotifications::get_notification_settings", "mac_usernotifications::AuthorizationStatus",
    "mac_usernotifications::request_auth", "mac_usernotifications::Notification",
    "MacosNotificationAuthorizationStatus::NotDetermined", "MacosNotificationAuthorizationStatus::Denied",
    "MacosNotificationAuthorizationStatus::Restricted", "MacosNotificationAuthorizationStatus::Authorized",
    "MacosNotificationAuthorizationStatus::Provisional", "MacosNotificationAuthorizationStatus::Ephemeral",
    "open_macos_notification_settings", "MACOS_NOTIFICATION_SETTINGS_URL_PREFIX",
    "x-apple.systempreferences:com.apple.Notifications-Settings.extension?id=", "app.config().identifier",
    'std::process::Command::new("/usr/bin/open")', "permission-denied-settings-opened",
    "permission-restricted-settings-opened", "permission-not-granted-settings-opened",
    "notification-settings-open-failed", "NotificationExt", "request_permission", ".builder(", ".show(",
  ]) {
    if (!sourceText.includes(token)) errors.push(`系统通知 Rust-only 合同缺少：${token}`);
  }
  const rustFunctions = collectRustFunctions(sourceText);
  const permission = validatePlatformHelperPair(
    sourceText,
    rustFunctions,
    "request_system_notification_permission",
    errors,
  );
  validatePlatformHelperPair(sourceText, rustFunctions, "deliver_system_notification", errors);
  validateWorkerRouting(sourceText, rustFunctions, errors);
  validateCommandRouting(sourceText, rustFunctions, errors);
  validateMacosAuthorization(sourceText, rustFunctions, permission.macos, errors);
  validateSettingsOpener(sourceText, rustFunctions, errors);
}
