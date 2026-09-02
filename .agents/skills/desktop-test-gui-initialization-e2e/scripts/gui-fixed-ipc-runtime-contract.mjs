import fs from "node:fs";
import path from "node:path";

import { collectRustFunctions } from "./gui-lifecycle-source-analysis.mjs";

const FIXED_COMMANDS = [
  "get_app_metadata",
  "get_system_locale",
  "set_interface_language",
];

function validateAppMetadataRuntime(sourceText, rustFunctions, errors) {
  const structMatch = /\b(?:pub(?:\([^)]*\))?\s+)?struct\s+AppMetadata\s*\{([^}]*)\}/u.exec(
    sourceText,
  );
  if (!structMatch) {
    errors.push("GUI 固定元数据必须声明 AppMetadata 结构体");
  } else {
    const prefix = sourceText.slice(
      Math.max(0, structMatch.index - 300),
      structMatch.index,
    );
    const attributes = prefix.match(/((?:#\[[^\]]+\]\s*)+)$/u)?.[1] ?? "";
    if (!/\bSerialize\b/u.test(attributes)) {
      errors.push("AppMetadata 必须派生 serde::Serialize");
    }
    if (!/#\[serde\s*\(\s*rename_all\s*=\s*["']camelCase["']\s*\)\s*\]/u.test(attributes)) {
      errors.push('AppMetadata 必须使用 #[serde(rename_all = "camelCase")] 固定前端字段形状');
    }
    const stringType = "(?:&\\s*'static\\s+str|String)";
    const fields = [
      ["application_name", stringType],
      ["version", stringType],
      ["contact_channel", stringType],
      ["contact_value", stringType],
      ["product_definition_required", "bool"],
      ["title", "String"],
    ];
    for (const [field, type] of fields) {
      const pattern = new RegExp(`\\b${field}\\s*:\\s*${type}\\b`, "u");
      if (!pattern.test(structMatch[1])) {
        errors.push(`AppMetadata 缺少固定字段或类型不正确：${field}`);
      }
    }
  }

  const command = rustFunctions.find(
    (candidate) => candidate.name === "get_app_metadata",
  );
  if (!command || !/fn\s+get_app_metadata\s*\([^)]*\)\s*->\s*AppMetadata\b/u.test(command.text)) {
    errors.push("get_app_metadata 必须返回 AppMetadata，而不是占位字符串或宽泛值");
    return;
  }
  const statusBinding = command.text.match(
    /\blet\s+([A-Za-z_]\w*)\s*=\s*(?:[A-Za-z_]\w*::)*scaffold_status\s*\(\s*\)\s*\.await\s*;/u,
  );
  const versionBinding = command.text.match(
    /\blet\s+([A-Za-z_]\w*)\s*=\s*env!\s*\(\s*["']CARGO_PKG_VERSION["']\s*\)\s*;/u,
  );
  if (!statusBinding) {
    errors.push("get_app_metadata 必须异步读取 core scaffold_status() 权威状态");
  }
  if (!versionBinding) {
    errors.push('get_app_metadata 必须从 env!("CARGO_PKG_VERSION") 读取打包版本');
  }
  if (!/\bAppMetadata\s*\{/u.test(command.text)) {
    errors.push("get_app_metadata 必须构造固定 AppMetadata 返回形状");
    return;
  }
  for (const field of [
    "application_name",
    "version",
    "contact_channel",
    "contact_value",
    "product_definition_required",
    "title",
  ]) {
    if (!new RegExp(`\\b${field}\\s*(?::|,)`, "u").test(command.text)) {
      errors.push(`get_app_metadata 返回值缺少固定字段：${field}`);
    }
  }
  if (
    statusBinding &&
    !new RegExp(
      `\\bproduct_definition_required\\s*:\\s*${statusBinding[1]}\\.product_definition_required\\b`,
      "u",
    ).test(command.text)
  ) {
    errors.push("get_app_metadata 的 product_definition_required 必须直接来自 core scaffold_status() 结果");
  }
  if (versionBinding) {
    const versionName = versionBinding[1];
    if (!new RegExp(`\\bversion\\s*(?::\\s*${versionName}\\b|,)`, "u").test(command.text)) {
      errors.push("get_app_metadata 的 version 字段必须直接来自 CARGO_PKG_VERSION");
    }
    const titlePattern = new RegExp(
      `\\btitle\\s*:\\s*format!\\s*\\([^;]*\\b${versionName}\\b`,
      "u",
    );
    if (!titlePattern.test(command.text)) {
      errors.push("get_app_metadata 的 title 必须由权威打包版本构造");
    }
  }
}

function stateBinding(functionText, handleName) {
  const pattern = new RegExp(
    `\\blet\\s+([A-Za-z_]\\w*)\\s*=\\s*${handleName}\\.state::<LocaleState>\\s*\\(\\s*\\)\\s*;`,
    "u",
  );
  return functionText.match(pattern);
}

function validateLocaleStateCommands(sourceText, rustFunctions, errors) {
  if (!/\b(?:pub(?:\([^)]*\))?\s+)?struct\s+LocaleState\s*\{[^}]*\bsaved_language\s*:/u.test(sourceText)) {
    errors.push("系统语言固定命令必须使用含 saved_language 的 LocaleState");
  }

  const getter = rustFunctions.find(
    (candidate) => candidate.name === "get_system_locale",
  );
  const getterHandle = getter?.text.match(
    /fn\s+get_system_locale\s*\([^)]*\b([A-Za-z_]\w*)\s*:\s*(?:tauri::)?AppHandle\b/u,
  );
  if (!getter || !getterHandle) {
    errors.push("get_system_locale 必须接收 AppHandle 并读取 LocaleState");
  } else {
    const state = stateBinding(getter.text, getterHandle[1]);
    if (!state) {
      errors.push("get_system_locale 必须从 AppHandle 取得 LocaleState");
    } else {
      const resolverPattern = new RegExp(
        `resolve_system_locale\\s*\\([^;{}]*${state[1]}\\.saved_language\\s*\\(\\s*\\)`,
        "u",
      );
      if (!resolverPattern.test(getter.text)) {
        errors.push("get_system_locale 必须让 LocaleState.saved_language() 进入系统 locale 解析链路");
      }
    }
  }

  const setter = rustFunctions.find(
    (candidate) => candidate.name === "set_interface_language",
  );
  const setterHandle = setter?.text.match(
    /fn\s+set_interface_language\s*\([^)]*\b([A-Za-z_]\w*)\s*:\s*(?:tauri::)?AppHandle\b/u,
  );
  if (
    !setter ||
    !setterHandle ||
    !/\blanguage\s*:\s*String\b/u.test(setter.text) ||
    !/->\s*Result\s*<\s*String\s*,/u.test(setter.text)
  ) {
    errors.push("set_interface_language 必须接收 language/AppHandle 并返回 Result<String, ...>");
    return;
  }
  const state = stateBinding(setter.text, setterHandle[1]);
  if (!state) {
    errors.push("set_interface_language 必须从 AppHandle 取得 LocaleState");
  }
  const normalizedBinding = setter.text.match(
    /\blet\s+([A-Za-z_]\w*)\s*=\s*normalize_bcp47_locale\s*\([^;]*\blanguage\b[^;]*\)\s*;/u,
  );
  if (!normalizedBinding) {
    errors.push("set_interface_language 必须先通过 normalize_bcp47_locale 归一化 language");
    return;
  }
  const normalized = normalizedBinding[1];
  if (
    state &&
    !new RegExp(
      `\\b${state[1]}\\.set_saved_language\\s*\\([^;]*\\b${normalized}\\b`,
      "u",
    ).test(setter.text)
  ) {
    errors.push("set_interface_language 必须把归一化语言写回 LocaleState");
  }
  if (!new RegExp(`rust_i18n::set_locale\\s*\\([^;]*\\b${normalized}\\b`, "u").test(setter.text)) {
    errors.push("set_interface_language 必须同步调用 rust_i18n::set_locale");
  }
  if (!new RegExp(`\\bOk\\s*\\(\\s*${normalized}\\s*\\)`, "u").test(setter.text)) {
    errors.push("set_interface_language 必须返回归一化后的权威语言");
  }
}

export function validateFixedIpcRuntimeContract(sourceText, errors) {
  for (const command of FIXED_COMMANDS) {
    const commandPattern = new RegExp(
      `#\\[tauri::command\\]\\s*(?:pub\\s+)?async\\s+fn\\s+${command}\\s*\\(`,
      "u",
    );
    if (!commandPattern.test(sourceText)) {
      errors.push(`GUI 固定基线命令必须是窄 Tauri command：${command}`);
    }
  }
  const rustFunctions = collectRustFunctions(sourceText);
  validateAppMetadataRuntime(sourceText, rustFunctions, errors);
  validateLocaleStateCommands(sourceText, rustFunctions, errors);
}

export function validateUpdaterConfiguration(guiRoot, errors) {
  let config;
  try {
    config = JSON.parse(
      fs.readFileSync(path.join(guiRoot, "src-tauri", "tauri.conf.json"), "utf8"),
    );
  } catch (error) {
    errors.push(`无法读取 updater Tauri 配置：${error.message}`);
    return;
  }
  const updater = config?.plugins?.updater;
  const keys =
    updater && typeof updater === "object" && !Array.isArray(updater)
      ? Object.keys(updater).sort()
      : [];
  if (
    JSON.stringify(keys) !== JSON.stringify(["endpoints", "pubkey"]) ||
    JSON.stringify(updater?.endpoints) !== "[]" ||
    updater?.pubkey !== ""
  ) {
    errors.push(
      '中性 GUI 必须显式配置 plugins.updater = { endpoints: [], pubkey: "" }，避免 null 配置阻断启动并保持零出站',
    );
  }
}
