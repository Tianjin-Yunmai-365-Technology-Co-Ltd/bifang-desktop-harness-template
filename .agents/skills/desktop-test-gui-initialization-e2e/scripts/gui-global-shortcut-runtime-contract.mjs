import {
  collectMethodArguments,
  collectRustFunctions,
} from "./gui-lifecycle-source-analysis.mjs";

export const GLOBAL_SHORTCUT_TEST_NAMES = [
  "global_shortcut_initial_bindings_match_contract",
  "global_shortcut_registers_only_configured_bindings",
  "global_shortcut_dispatches_pressed_events_to_declared_actions",
  "global_shortcut_reports_real_registration_state",
  "global_shortcut_unregisters_owned_bindings_on_shutdown",
  "global_shortcut_setup_failure_unregisters_owned_bindings",
];

export const USER_CONFIGURABLE_GLOBAL_SHORTCUT_TEST_NAMES = [
  "shortcut_bindings_require_modifier_and_reject_equivalent_duplicates",
  "global_shortcut_replace_rolls_back_on_registration_failure",
  "global_shortcut_persistence_failure_restores_previous_bindings",
  "global_shortcut_recording_suppresses_dispatch_until_released",
];

function requireSinglePluginRegistration(sourceText, token, label, errors) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const registrations = [
    ...sourceText.matchAll(new RegExp(`\\.plugin\\s*\\(\\s*${escaped}`, "gu")),
  ];
  if (registrations.length !== 1) {
    errors.push(`${label}必须在 Tauri Builder 中恰好注册一次，实际 ${registrations.length} 次`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** 屏蔽 Rust 注释，保留字符串与代码位置，避免注释伪造调用或门禁。 */
function sanitizeRustCode(sourceText, preserveStrings = true) {
  const mask = (value) => value.replace(/[^\r\n]/gu, " ");
  let result = "";
  let index = 0;
  while (index < sourceText.length) {
    if (sourceText.startsWith("//", index)) {
      const end = sourceText.indexOf("\n", index + 2);
      const boundary = end < 0 ? sourceText.length : end;
      result += mask(sourceText.slice(index, boundary));
      index = boundary;
      continue;
    }
    if (sourceText.startsWith("/*", index)) {
      let depth = 1;
      let end = index + 2;
      while (end < sourceText.length && depth > 0) {
        if (sourceText.startsWith("/*", end)) {
          depth += 1;
          end += 2;
        } else if (sourceText.startsWith("*/", end)) {
          depth -= 1;
          end += 2;
        } else {
          end += 1;
        }
      }
      result += mask(sourceText.slice(index, end));
      index = end;
      continue;
    }
    const rawPrefix = sourceText.slice(index).match(/^(?:br|r)(#*)"/u);
    if (rawPrefix) {
      const terminator = `"${rawPrefix[1]}`;
      const contentStart = index + rawPrefix[0].length;
      const closing = sourceText.indexOf(terminator, contentStart);
      const end = closing < 0 ? sourceText.length : closing + terminator.length;
      const rawString = sourceText.slice(index, end);
      result += preserveStrings ? rawString : mask(rawString);
      index = end;
      continue;
    }
    if (sourceText[index] === '"') {
      let end = index + 1;
      let escaped = false;
      while (end < sourceText.length) {
        const character = sourceText[end];
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') {
          end += 1;
          break;
        }
        end += 1;
      }
      const stringLiteral = sourceText.slice(index, end);
      result += preserveStrings ? stringLiteral : mask(stringLiteral);
      index = end;
      continue;
    }
    result += sourceText[index];
    index += 1;
  }
  return result;
}

function rustExecutableCode(sourceText) {
  return sanitizeRustCode(sourceText, false);
}

function semanticRustIdentifierWords(identifier) {
  return identifier
    .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/gu)
    .filter(Boolean);
}

function isShortcutRuntimeIdentifier(identifier) {
  const words = semanticRustIdentifierWords(identifier);
  const joined = words.join("");
  const runtimeVerbs = new Set([
    "begin",
    "capture",
    "cleanup",
    "edit",
    "end",
    "load",
    "persist",
    "record",
    "register",
    "save",
    "start",
    "status",
    "unregister",
  ]);
  return (
    words.some((word) => /^(?:hotkeys?|keybindings?)$/u.test(word)) ||
    joined.includes("keycapture") ||
    (
      words.some((word) => /^shortcuts?$/u.test(word)) &&
      words.some((word) => runtimeVerbs.has(word))
    )
  );
}

function collectRustCallArguments(sourceText, methodName) {
  const code = rustExecutableCode(sourceText);
  const pattern = new RegExp(`(?:\\.|::)\\s*${methodName}\\s*\\(`, "gu");
  const argumentsList = [];
  for (const match of code.matchAll(pattern)) {
    const openIndex = code.indexOf("(", match.index);
    let depth = 0;
    for (let index = openIndex; index < code.length; index += 1) {
      if (code[index] === "(") depth += 1;
      else if (code[index] === ")") {
        depth -= 1;
        if (depth === 0) {
          argumentsList.push(sourceText.slice(openIndex + 1, index));
          break;
        }
      }
    }
  }
  return argumentsList;
}

function invokeHandlerCommands(sourceText) {
  return collectRustCallArguments(sourceText, "invoke_handler").map((argument) => {
    const macro = sanitizeRustCode(argument).match(
      /\bgenerate_handler\s*!\s*\[([\s\S]*?)\]/u,
    );
    if (!macro) return [];
    return macro[1]
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => entry.split("::").at(-1));
  });
}

function allowedInitializationCommands(profile) {
  return [
    ...(profile.aboutPage ? ["check_for_updates", "load_release_notes"] : []),
    ...(profile.systemNotification
      ? ["get_system_notification_setting", "set_system_notification_enabled"]
      : []),
    ...(profile.autostart ? ["get_autostart_enabled", "set_autostart_enabled"] : []),
  ];
}

function dispatchHelperName(action) {
  const kind = action.dispatch.kind.replaceAll("-", "_");
  const target = action.dispatch.target.replaceAll(".", "__");
  return `dispatch_${kind}__${target}`;
}

function meaningfulRustCalls(functionText, functionName) {
  const ignored = new Set([
    functionName,
    "Err",
    "None",
    "Ok",
    "Some",
    "drop",
    "if",
    "match",
    "return",
  ]);
  return [
    ...sanitizeRustCode(functionText).matchAll(/(?:\.\s*|\b)([A-Za-z_][A-Za-z0-9_]*)\s*\(/gu),
  ]
    .map((match) => match[1])
    .filter((name) => !ignored.has(name));
}

const DISPATCH_EFFECT_SINKS = new Set([
  "emit",
  "emit_to",
  "execute",
  "focus",
  "hide",
  "invoke",
  "send",
  "set_focus",
  "show",
  "trigger",
]);

function callNames(sourceText) {
  return [
    ...rustExecutableCode(sourceText).matchAll(
      /(?:\.\s*|\b)([A-Za-z_][A-Za-z0-9_]*)\s*\(/gu,
    ),
  ].map((match) => match[1]);
}

function callNamesActionTarget(callName, target) {
  const normalizedCall = callName.toLowerCase();
  return target.split(".").every((segment) => normalizedCall.includes(segment));
}

function hasDispatchEffect(candidate, functions, action, visited = new Set()) {
  if (!candidate || visited.has(candidate.name)) return false;
  visited.add(candidate.name);
  const functionsByName = new Map(functions.map((item) => [item.name, item]));
  for (const callName of callNames(candidate.text)) {
    if (callName === candidate.name || ["Err", "Ok", "Some"].includes(callName)) {
      continue;
    }
    const localTarget = functionsByName.get(callName);
    if (localTarget) {
      if (hasDispatchEffect(localTarget, functions, action, visited)) return true;
      continue;
    }
    if (
      DISPATCH_EFFECT_SINKS.has(callName) ||
      callNamesActionTarget(callName, action.dispatch.target)
    ) {
      return true;
    }
  }
  return false;
}

function rustIfStatements(functionText) {
  return [
    ...sanitizeRustCode(functionText).matchAll(/\bif\s+([^{}]+)\{([^{}]*)\}/gu),
  ].map((match) => ({ condition: match[1], body: match[2] }));
}

function braceDepthAt(sourceText, targetIndex) {
  const source = sanitizeRustCode(sourceText.slice(0, targetIndex));
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const character of source) {
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") depth -= 1;
  }
  return depth;
}

function findFixedBindingGuard(functions) {
  return functions.find((candidate) => {
    const source = sanitizeRustCode(candidate.text);
    const resolvesActionById =
      /\baction\s*\.\s*id\s*==\s*\w+\s*\.\s*action_id\b/u.test(source) ||
      /\w+\s*\.\s*action_id\s*==\s*action\s*\.\s*id\b/u.test(source);
    const iteratesRequestedUpdates =
      /\bfor\s+\w+\s+in\s+(?:&\s*)?\w+/u.test(source);
    const rejectsChangedFixed = rustIfStatements(source).some(({ condition, body }) =>
      !/\bfalse\b/u.test(condition) &&
      /\bbinding_policy\b/u.test(condition) &&
      /"fixed"/u.test(condition) &&
      /\bdefault_chord\b/u.test(condition) &&
      /\bconfigured_chord\b/u.test(condition) &&
      /!=/u.test(condition) &&
      /\breturn\s+Err\s*\(/u.test(body),
    );
    return resolvesActionById && iteratesRequestedUpdates && rejectsChangedFixed;
  });
}

function validateMixedPolicySave(functions, errors) {
  const saveFunction = functions.find(
    (candidate) => candidate.name === "save_global_shortcut_bindings",
  );
  const guardFunction = findFixedBindingGuard(
    functions.filter((candidate) => candidate !== saveFunction),
  );
  if (!saveFunction || !guardFunction) {
    errors.push("混合快捷键保存必须逐 ID 校验策略，并在 fixed chord 变化时立即 return Err");
    return;
  }
  const saveSource = sanitizeRustCode(saveFunction.text);
  const guardAssignment = saveSource.match(
    new RegExp(
      `let\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*${escapeRegExp(guardFunction.name)}\\s*\\(([^;]*)\\)\\s*\\?\\s*;`,
      "u",
    ),
  );
  if (
    !guardAssignment ||
    braceDepthAt(saveSource, guardAssignment.index) !== 1
  ) {
    errors.push("混合快捷键保存必须在顶层先取得 fixed-safe validated updates，不得把校验放入死分支");
    return;
  }
  const validatedName = guardAssignment[1];
  if (!/\bGLOBAL_SHORTCUT_ACTIONS\b/u.test(guardAssignment[2])) {
    errors.push("混合快捷键保存必须以 GLOBAL_SHORTCUT_ACTIONS 逐 ID 校验请求策略");
    return;
  }
  const replacementCalls = [
    ...saveSource.matchAll(/\breplace_owned_global_shortcuts\s*\(([^;]+)\)\s*\?/gu),
  ];
  if (
    replacementCalls.length === 0 ||
    replacementCalls.some(
      (match) =>
        match.index < guardAssignment.index ||
        !new RegExp(`\\b${escapeRegExp(validatedName)}\\b`, "u").test(match[1]),
    )
  ) {
    errors.push("混合快捷键保存只能在 fixed 校验后用 validated updates 替换 owned bindings，不得随后全量 mutate 原请求");
  }
}

function parseRustStringField(body, field) {
  const match = body.match(
    new RegExp(`\\b${field}\\s*:\\s*(\"(?:\\\\.|[^\"\\\\])*\")`, "u"),
  );
  if (!match) return undefined;
  try {
    return JSON.parse(match[1]);
  } catch {
    return undefined;
  }
}

function globalShortcutInitializerBody(sourceText) {
  const declaration = /\bstatic\s+GLOBAL_SHORTCUT_ACTIONS\b/gu.exec(sourceText);
  if (!declaration) return null;
  const declarationEnd = sourceText.indexOf(";", declaration.index);
  const vectorToken = sourceText.indexOf("vec![", declaration.index);
  if (vectorToken < 0 || declarationEnd < 0 || vectorToken > declarationEnd) return null;
  const openBracket = vectorToken + "vec!".length;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = openBracket; index < sourceText.length; index += 1) {
    const character = sourceText[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "[") depth += 1;
    else if (character === "]") {
      depth -= 1;
      if (depth === 0) return sourceText.slice(openBracket + 1, index);
    }
  }
  return null;
}

function parseMaterializedShortcutActions(sourceText) {
  const initializer = globalShortcutInitializerBody(sourceText);
  if (initializer === null) return [];
  const records = [];
  for (const match of initializer.matchAll(/GlobalShortcutAction\s*\{([\s\S]*?)\}/gu)) {
    const body = match[1];
    const id = parseRustStringField(body, "id");
    if (id === undefined) continue;
    const chordMatch = body.match(
      /\bdefault_chord\s*:\s*(?:Some\s*\(\s*("(?:\\.|[^"\\])*")(?:\.to_string\s*\(\s*\))?\s*\)|None\b)/u,
    );
    let defaultChord;
    if (chordMatch?.[1]) {
      try {
        defaultChord = JSON.parse(chordMatch[1]);
      } catch {
        defaultChord = undefined;
      }
    } else if (chordMatch) {
      defaultChord = null;
    }
    const e2eMatch = body.match(/\be2e_safe\s*:\s*(true|false)\b/u);
    records.push({
      id,
      bindingPolicy: parseRustStringField(body, "binding_policy"),
      defaultChord,
      dispatch: {
        kind: parseRustStringField(body, "dispatch_kind"),
        target: parseRustStringField(body, "dispatch_target"),
      },
      e2eSafe: e2eMatch ? e2eMatch[1] === "true" : undefined,
    });
  }
  return records;
}

function validateMaterializedShortcutActions(sourceText, profile, functions, errors) {
  const expected = profile.globalShortcutActions;
  const actual = parseMaterializedShortcutActions(sourceText);
  const actualById = new Map(actual.map((action) => [action.id, action]));
  if (globalShortcutInitializerBody(sourceText) === null) {
    errors.push("Rust 必须以 typed static GLOBAL_SHORTCUT_ACTIONS vec initializer 物化快捷键 profile");
  }
  if (actual.length !== expected.length || actualById.size !== expected.length) {
    errors.push(`GLOBAL_SHORTCUT_ACTIONS 必须逐项物化 profile，期望 ${expected.length} 项，实际 ${actual.length} 项`);
  }
  for (const action of expected) {
    const materialized = actualById.get(action.id);
    if (!materialized || JSON.stringify(materialized) !== JSON.stringify(action)) {
      errors.push(`GLOBAL_SHORTCUT_ACTIONS 与 profile 动作逐字段不一致：${action.id}`);
    }
  }
  if (expected.length === 0) return;
  const dispatcher = functions.find(
    (candidate) => candidate.name === "dispatch_global_shortcut_action",
  );
  if (!dispatcher) {
    errors.push("全局快捷键缺少 typed dispatch_global_shortcut_action dispatcher");
    return;
  }
  const wildcardBranches = [...dispatcher.text.matchAll(/_\s*=>/gu)];
  if (
    wildcardBranches.length !== 1 ||
    !/_\s*=>\s*Err\s*\(/u.test(dispatcher.text)
  ) {
    errors.push("全局快捷键 typed dispatcher 必须拒绝未知动作，不得使用 wildcard/no-op 分支");
  }
  const declaredBranches = [
    ...dispatcher.text.matchAll(/"([a-z][a-z0-9]*(?:_[a-z0-9]+)*)"\s*=>/gu),
  ].map((match) => match[1]);
  if (
    declaredBranches.length !== expected.length ||
    declaredBranches.some((id) => !expected.some((action) => action.id === id))
  ) {
    errors.push("全局快捷键 typed dispatcher 分支必须与已声明 action id 精确一致");
  }
  for (const genericName of ["dispatch_host_action", "dispatch_core_use_case"]) {
    if (functions.some((candidate) => candidate.name === genericName)) {
      errors.push(`全局快捷键不得通过通用 target helper 分派：${genericName}`);
    }
  }
  for (const action of expected) {
    const dispatchFunction = dispatchHelperName(action);
    const branchPattern = new RegExp(
      `"${escapeRegExp(action.id)}"\\s*=>\\s*${dispatchFunction}\\s*\\(\\s*[^,)]+\\s*\\)`,
      "u",
    );
    if (!branchPattern.test(dispatcher.text)) {
      errors.push(`全局快捷键 typed dispatcher 未按 kind/target 物化动作：${action.id}`);
    }
    const helper = functions.find((candidate) => candidate.name === dispatchFunction);
    if (!helper) {
      errors.push(`全局快捷键缺少 kind/target 专用 helper：${dispatchFunction}`);
      continue;
    }
    const parameters = helper.text.slice(
      helper.text.indexOf("(") + 1,
      helper.text.indexOf(")"),
    );
    if (
      /\btarget\b/u.test(parameters) ||
      /\.\s*is_empty\s*\(/u.test(helper.text) ||
      meaningfulRustCalls(helper.text, helper.name).length === 0 ||
      !hasDispatchEffect(helper, functions, action)
    ) {
      errors.push(`全局快捷键 kind/target 专用 helper 不得是通用 target 非空判断或 Ok/no-op：${dispatchFunction}`);
    }
  }
}

function validateEmptyShortcutRuntime(sourceText, functions, profile, errors) {
  const runtimeTokens = [
    "OwnedGlobalShortcutRegistry",
    "get_global_shortcut_statuses",
    "replace_owned_global_shortcuts",
    "rollback_staged_global_shortcuts",
    "unregister_owned_global_shortcuts",
    "dispatch_global_shortcut_action",
    "owned_action_id_for_shortcut",
    "load_global_shortcut_bindings",
    "save_global_shortcut_bindings",
    "begin_global_shortcut_capture",
    "end_global_shortcut_capture",
    "ShortcutEditor",
    "ShortcutRecorder",
  ];
  const shortcutAccessors = functions.filter((candidate) =>
    /(?:\.|::)\s*global_shortcut\s*\(/u.test(rustExecutableCode(candidate.text)),
  );
  if (shortcutAccessors.length > 0) {
    errors.push(`空 gui-global-shortcut-contract 不得由任何非测试函数取得 OS shortcut API：${shortcutAccessors.map((candidate) => candidate.name).join("、")}`);
  }
  const requiredTestNames = new Set([
    ...GLOBAL_SHORTCUT_TEST_NAMES,
    ...USER_CONFIGURABLE_GLOBAL_SHORTCUT_TEST_NAMES,
  ]);
  const semanticRuntimeFunctions = functions.filter(
    (candidate) =>
      !requiredTestNames.has(candidate.name) &&
      isShortcutRuntimeIdentifier(candidate.name),
  );
  if (semanticRuntimeFunctions.length > 0) {
    errors.push(`空 gui-global-shortcut-contract 不得保留别名快捷键运行时：${semanticRuntimeFunctions.map((candidate) => candidate.name).join("、")}`);
  }
  const executableSource = rustExecutableCode(sourceText);
  for (const token of runtimeTokens) {
    if (executableSource.includes(token)) {
      errors.push(`空 gui-global-shortcut-contract 不得保留快捷键保存、录制或编辑运行时：${token}`);
    }
  }
  const pluginArgument = collectMethodArguments(sourceText, "plugin").find(
    (argument) => argument.includes("tauri_plugin_global_shortcut::Builder::new"),
  ) ?? "";
  const normalizedPluginArgument = sanitizeRustCode(pluginArgument).replace(/\s+/gu, "");
  if (
    normalizedPluginArgument !==
    "tauri_plugin_global_shortcut::Builder::new().build()"
  ) {
    errors.push("空 gui-global-shortcut-contract 的插件注册必须精确为无 handler 的 Builder::new().build()");
  }
  const allowedCommands = new Set(allowedInitializationCommands(profile));
  const handlerCommands = invokeHandlerCommands(sourceText);
  const expectedHandlerCount = allowedCommands.size > 0 ? 1 : 0;
  if (handlerCommands.length !== expectedHandlerCount) {
    errors.push(`空 gui-global-shortcut-contract 只能保留初始化所需的唯一 invoke_handler，实际 ${handlerCommands.length} 个`);
  }
  for (const commands of handlerCommands) {
    const unexpected = commands.filter((command) => !allowedCommands.has(command));
    if (unexpected.length > 0) {
      errors.push(`空 gui-global-shortcut-contract 的 invoke_handler 不得接入额外命令：${unexpected.join("、")}`);
    }
  }
  if (sourceText.includes("CommandOrControl+Shift+Space")) {
    errors.push("全局快捷键不得隐式恢复旧默认 CommandOrControl+Shift+Space；默认绑定只能来自动作契约");
  }
}

/** 验证声明驱动的 owned registry、真实状态、分发、替换回滚与清理契约。 */
export function validateGlobalShortcutRuntimeContract(sourceText, profile, errors) {
  requireSinglePluginRegistration(
    sourceText,
    "tauri_plugin_global_shortcut::Builder::new",
    "global-shortcut 插件",
    errors,
  );
  const functions = collectRustFunctions(sourceText);
  validateMaterializedShortcutActions(sourceText, profile, functions, errors);
  if (profile.globalShortcutActions.length === 0) {
    validateEmptyShortcutRuntime(sourceText, functions, profile, errors);
    return;
  }
  const requiredTokens = [
    "GlobalShortcutExt",
    "OwnedGlobalShortcutRegistry",
    "get_global_shortcut_statuses",
    "replace_owned_global_shortcuts",
    "rollback_staged_global_shortcuts",
    "unregister_owned_global_shortcuts",
    "dispatch_global_shortcut_action",
    "owned_action_id_for_shortcut",
    ".is_registered(",
    ".unregister(",
    "ShortcutState::Pressed",
    ".state()",
    ...(profile.globalShortcutActions.length > 0 ? [".register("] : []),
  ];
  for (const token of requiredTokens) {
    if (!sourceText.includes(token)) errors.push(`全局快捷键 owned registry/状态/替换契约缺少：${token}`);
  }
  if (
    !/struct\s+GlobalShortcutAction\s*\{[^}]*\bdefault_chord\s*:\s*Option\s*<\s*String\s*>/su.test(
      sourceText,
    )
  ) {
    errors.push("全局快捷键期望绑定必须以 GlobalShortcutAction.default_chord: Option<String> 表达可空配置");
  }
  if (
    !/struct\s+OwnedGlobalShortcutRegistry\s*\{[^}]*\b(?:BTreeMap|HashMap)\s*</su.test(
      sourceText,
    )
  ) {
    errors.push("全局快捷键 active registrations 必须保存在 OwnedGlobalShortcutRegistry 的 owned map 中");
  }
  if (/\.unregister_all\s*\(/u.test(sourceText)) {
    errors.push("全局快捷键退出与替换只能注销 owned bindings，不得调用 unregister_all()");
  }
  for (const match of sourceText.matchAll(
    /\.global_shortcut\s*\(\s*\)\s*\.\s*(register|unregister)\s*\(([^)]*)\)/gu,
  )) {
    if (!/\bchord\b/u.test(match[2])) {
      errors.push(`全局快捷键 ${match[1]} 只能消费 contract/owned registry 迭代得到的 chord，不得硬编码默认或注销非 owned binding`);
    }
  }

  const statusFunction = functions.find(
    (candidate) => candidate.name === "get_global_shortcut_statuses",
  );
  if (!statusFunction || !/\.is_registered\s*\(/u.test(statusFunction.text)) {
    errors.push("全局快捷键逐项状态必须在 Rust 命令中真实调用 is_registered(chord)");
  }
  if (
    statusFunction &&
    ![
      "GLOBAL_SHORTCUT_ACTIONS",
      "action_id",
      "configured_chord",
      "registered",
      "error_code",
    ].every((token) => statusFunction.text.includes(token))
  ) {
    errors.push("全局快捷键状态命令必须为每个声明动作返回 configured_chord/registered/error_code 快照");
  }
  if (
    statusFunction &&
    /(?:registered|is_registered)\s*:\s*true\b/u.test(statusFunction.text)
  ) {
    errors.push("全局快捷键逐项状态不得以恒真 registered 伪装 OS 注册结果");
  }

  const replacementFunction = functions.find(
    (candidate) => candidate.name === "replace_owned_global_shortcuts",
  );
  if (profile.globalShortcutActions.length > 0) {
    if (
      !replacementFunction ||
      ![
        "previous",
        "staged",
        "rollback_staged_global_shortcuts",
        ".register(",
        ".unregister(",
      ].every((token) => replacementFunction.text.includes(token))
    ) {
      errors.push("全局快捷键替换必须先暂存新注册，失败回滚 staged additions，成功后再原子提交 owned registry");
    }
  } else if (
    !replacementFunction ||
    !replacementFunction.text.includes("actions.is_empty()")
  ) {
    errors.push("空 gui-global-shortcut-contract 启动路径必须显式验证 actions.is_empty() 且不注册 OS binding");
  }
  const rollbackFunction = functions.find(
    (candidate) => candidate.name === "rollback_staged_global_shortcuts",
  );
  if (
    profile.globalShortcutActions.length > 0 &&
    (
      !rollbackFunction ||
      !rollbackFunction.text.includes("previous") ||
      !/\.unregister\s*\(/u.test(rollbackFunction.text) ||
      !/\.register\s*\(/u.test(rollbackFunction.text)
    )
  ) {
    errors.push("全局快捷键注册失败必须注销 staged bindings 并恢复 previous owned bindings");
  }
  const cleanupFunction = functions.find(
    (candidate) => candidate.name === "unregister_owned_global_shortcuts",
  );
  if (
    !cleanupFunction ||
    !cleanupFunction.text.includes("OwnedGlobalShortcutRegistry") ||
    !/\.unregister\s*\(/u.test(cleanupFunction.text)
  ) {
    errors.push("全局快捷键清理必须只遍历 OwnedGlobalShortcutRegistry 注销本应用拥有的绑定");
  }
  const runFunction = functions.find((candidate) => candidate.name === "run");
  if (
    !runFunction ||
    !runFunction.text.includes("RunEvent::ExitRequested") ||
    !runFunction.text.includes("unregister_owned_global_shortcuts")
  ) {
    errors.push("全局快捷键 owned bindings 必须在应用退出生命周期中实际注销");
  }

  const pluginArgument = collectMethodArguments(sourceText, "plugin").find(
    (argument) => argument.includes("tauri_plugin_global_shortcut::Builder::new"),
  ) ?? "";
  const pressedGate =
    /event\s*\.\s*state\s*\(\s*\)\s*==\s*ShortcutState::Pressed/u.test(pluginArgument) ||
    /event\s*\.\s*state\s*\(\s*\)\s*!=\s*ShortcutState::Pressed/u.test(pluginArgument);
  if (
    !pressedGate ||
    !pluginArgument.includes("owned_action_id_for_shortcut") ||
    !pluginArgument.includes("dispatch_global_shortcut_action")
  ) {
    errors.push("全局快捷键 handler 必须只在 ShortcutState::Pressed 时查找 owned declared action 后分发");
  }

  const declaredChords = new Set(
    profile.globalShortcutActions
      .map((action) => action.defaultChord)
      .filter((chord) => typeof chord === "string"),
  );
  if (
    sourceText.includes("CommandOrControl+Shift+Space") &&
    !declaredChords.has("CommandOrControl+Shift+Space")
  ) {
    errors.push("全局快捷键不得隐式恢复旧默认 CommandOrControl+Shift+Space；默认绑定只能来自动作契约");
  }
  const userConfigurable = profile.globalShortcutActions.some(
    (action) => action.bindingPolicy === "user-configurable",
  );
  const configurableCommands = [
    "load_global_shortcut_bindings",
    "save_global_shortcut_bindings",
    "begin_global_shortcut_capture",
    "end_global_shortcut_capture",
  ];
  if (userConfigurable) {
    for (const command of configurableCommands) {
      const commandFunction = functions.find((candidate) => candidate.name === command);
      const escaped = command.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      if (
        !commandFunction ||
        !new RegExp(`#\\[tauri::command\\]\\s*(?:async\\s+)?fn\\s+${escaped}\\b`, "u").test(sourceText)
      ) {
        errors.push(`user-configurable 快捷键必须提供 Rust 窄命令：${command}`);
      }
    }
    if (profile.globalShortcutActions.some((action) => action.bindingPolicy === "fixed")) {
      validateMixedPolicySave(functions, errors);
    }
  } else {
    for (const command of configurableCommands) {
      if (sourceText.includes(command)) {
        errors.push(`无 user-configurable 动作时不得保留快捷键持久化或录制命令：${command}`);
      }
    }
  }
}

/** 强化固定快捷键回归，使测试名之外还包含相应真实行为证据。 */
export function validateGlobalShortcutTestCoverage(testFunctions, profile, errors) {
  if (!profile.globalShortcut) return;
  const shortcutCoverage = profile.globalShortcutActions.length === 0
    ? [
        ["global_shortcut_initial_bindings_match_contract", ["GLOBAL_SHORTCUT_ACTIONS", "is_empty"]],
        ["global_shortcut_registers_only_configured_bindings", ["configured_bindings", "is_empty"]],
        ["global_shortcut_dispatches_pressed_events_to_declared_actions", ["ShortcutState::Pressed", "ShortcutState::Released", "declared_actions"]],
        ["global_shortcut_reports_real_registration_state", ["is_registered"]],
        ["global_shortcut_unregisters_owned_bindings_on_shutdown", ["owned", "is_empty"]],
        ["global_shortcut_setup_failure_unregisters_owned_bindings", ["registration_failure_owned", "is_empty"]],
      ]
    : [
        ["global_shortcut_initial_bindings_match_contract", ["GLOBAL_SHORTCUT_ACTIONS", "configured_global_shortcut_bindings"]],
        ["global_shortcut_registers_only_configured_bindings", ["configured_global_shortcut_bindings"]],
        ["global_shortcut_dispatches_pressed_events_to_declared_actions", ["ShortcutState::Pressed", "ShortcutState::Released", "dispatch_global_shortcut_action"]],
        ["global_shortcut_reports_real_registration_state", ["is_registered"]],
        ["global_shortcut_unregisters_owned_bindings_on_shutdown", ["owned", "unregister_owned_global_shortcuts"]],
        ["global_shortcut_setup_failure_unregisters_owned_bindings", ["failure", "rollback_staged_global_shortcuts"]],
      ];
  for (const [testName, tokens] of shortcutCoverage) {
    const testFunction = testFunctions.find((candidate) => candidate.name === testName);
    if (
      testFunction &&
      !tokens.every((token) => testFunction.text.includes(token))
    ) {
      errors.push(`全局快捷键固定回归缺少真实行为证据：${testName}`);
    }
  }
}
