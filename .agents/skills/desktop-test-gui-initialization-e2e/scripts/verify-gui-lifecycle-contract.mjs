#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

import {
  validateFrontendInitializationContract,
  validateLocales,
  validateRustOnlyDesktopCapabilities,
} from "./gui-lifecycle-frontend-contract.mjs";
import {
  collectFiles,
  collectMethodArguments,
  collectRustFunctions,
  resolveGuiRoot,
  tomlAssignment,
  tomlSection,
} from "./gui-lifecycle-source-analysis.mjs";
import {
  hasMeaningfulRustAssertion,
  validatePluginDependencyContract,
  validatePluginRuntimeContract,
  validateRequiredPluginTests,
} from "./gui-lifecycle-plugin-contract.mjs";
import { validateReleaseNotesRuntimeContract } from "./verify-release-notes-contract.mjs";

/**
 * 委托给 frontend-contract 模块的稳定检查面：
 * GUI 固定基线缺少 /settings 路由；未选择${page.label}时不得保留路由或组件；
 * 未选择赞助页时不得保留 public/brand-support/sponsor；侧栏固定检查 22px 图标、
 * DEFAULT_DETAILED_SIDEBAR_COLLAPSED 与 localStorage 持久化。
 */

const TRAY_SOURCE_REQUIREMENTS = [
  ["创建 Tauri 托盘", ["TrayIconBuilder"]],
  ["处理托盘点击事件", ["on_tray_icon_event", "TrayIconEvent::Click"]],
  ["只在鼠标左键释放时恢复窗口", ["MouseButton::Left", "MouseButtonState::Up"]],
  ["处理托盘菜单事件", ["on_menu_event"]],
  ["恢复主窗口可见状态", [".show("]],
  ["取消主窗口最小化", [".unminimize("]],
  ["聚焦主窗口", [".set_focus("]],
  ["处理主窗口关闭请求", ["WindowEvent::CloseRequested"]],
  ["阻止关闭请求终止进程", ["prevent_close"]],
  ["关闭主窗口时隐藏窗口", [".hide("]],
  ["只由显式退出动作结束应用", [".exit("]],
];

const TRAY_SOURCE_ALTERNATIVES = [
  ["创建稳定 ID 的托盘菜单项", ["MenuItemBuilder", "MenuItem::with_id"]],
];

const TRAY_TEST_NAMES = [
  "tray_show_restores_and_focuses_main_window",
  "close_request_hides_without_exit",
  "tray_quit_exits_application",
  "tray_labels_resolve_for_supported_locales",
  "tray_labels_fall_back_to_english",
  "language_change_updates_tray_menu_labels",
];

const NO_TRAY_TEST_NAMES = ["close_last_window_exits_application"];

const GUI_INITIALIZATION_PROFILE_FIELDS = [
  "system_tray",
  "system_notification",
  "autostart",
  "about_page",
  "sponsor_page",
  "single_instance",
  "deep_link",
  "global_shortcut",
  "sidebar_mode",
];

const GUI_INITIALIZATION_PROFILE_FIELD_SET = new Set(
  GUI_INITIALIZATION_PROFILE_FIELDS,
);

const GLOBAL_SHORTCUT_CONTRACT_FIELDS = ["schemaVersion", "actions"];
const GLOBAL_SHORTCUT_ACTION_FIELDS = [
  "id",
  "bindingPolicy",
  "defaultChord",
  "dispatch",
  "e2eSafe",
];
const GLOBAL_SHORTCUT_DISPATCH_FIELDS = ["kind", "target"];
const GLOBAL_SHORTCUT_CHORD_MAX_BYTES = 128;
const GLOBAL_SHORTCUT_MODIFIER_ALIASES = new Map([
  ["alt", "alt"],
  ["cmd", "command"],
  ["cmdorctrl", "commandorcontrol"],
  ["command", "command"],
  ["commandorcontrol", "commandorcontrol"],
  ["control", "control"],
  ["ctrl", "control"],
  ["meta", "meta"],
  ["option", "alt"],
  ["shift", "shift"],
  ["super", "meta"],
  ["win", "meta"],
]);

/** 解析脚本参数，并拒绝不完整或未知的调用形式。 */
function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || value === undefined) {
      throw new Error("用法：verify-gui-lifecycle-contract.mjs --root <project-root> --gui-dir <relative-gui-dir>");
    }
    if (!new Set(["--root", "--gui-dir"]).has(flag) || values.has(flag)) {
      throw new Error(`未知或重复参数：${flag}`);
    }
    values.set(flag, value);
  }
  if (!values.has("--root") || !values.has("--gui-dir")) {
    throw new Error("必须同时提供 --root 与 --gui-dir");
  }
  return { root: values.get("--root"), guiDir: values.get("--gui-dir") };
}

/** 确认目标是普通文件，并以严格 UTF-8 读取。 */
function readTextFile(filePath) {
  const stats = fs.lstatSync(filePath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`必须是普通非符号链接文件：${filePath}`);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(fs.readFileSync(filePath));
}

/** 确认目标是普通二进制文件，并拒绝用符号链接替换受管图标。 */
function readBinaryFile(filePath) {
  const stats = fs.lstatSync(filePath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`必须是普通非符号链接文件：${filePath}`);
  }
  return fs.readFileSync(filePath);
}

/** 确认 JSON 对象只声明当前 schema 允许的字段，避免拼写错误静默失效。 */
function validateExactJsonFields(value, expectedFields, label, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${label}必须是 JSON object`);
    return false;
  }
  const actualFields = Object.keys(value).sort();
  const sortedExpected = [...expectedFields].sort();
  if (
    actualFields.length !== sortedExpected.length ||
    actualFields.some((field, index) => field !== sortedExpected[index])
  ) {
    errors.push(`${label}字段必须恰好为：${expectedFields.join("、")}`);
    return false;
  }
  return true;
}

/** 归一化 chord 仅用于发现跨动作重复，不改写用户保存或注册的原值。 */
function normalizedGlobalShortcutChord(chord, label, errors) {
  if (Buffer.byteLength(chord, "utf8") > GLOBAL_SHORTCUT_CHORD_MAX_BYTES) {
    errors.push(`${label}UTF-8 长度不得超过 ${GLOBAL_SHORTCUT_CHORD_MAX_BYTES} 字节`);
    return null;
  }
  if (/\p{C}/u.test(chord)) {
    errors.push(`${label}不得包含控制字符`);
    return null;
  }
  const tokens = chord.split("+").map((token) => token.trim().toLowerCase());
  if (tokens.length < 2 || tokens.some((token) => token.length === 0)) {
    errors.push(`${label}必须使用“修饰键+按键”的非空 chord`);
    return null;
  }
  const modifiers = tokens
    .map((token) => GLOBAL_SHORTCUT_MODIFIER_ALIASES.get(token))
    .filter(Boolean);
  const primaryKeys = tokens.filter(
    (token) => !GLOBAL_SHORTCUT_MODIFIER_ALIASES.has(token),
  );
  if (modifiers.length === 0 || primaryKeys.length === 0) {
    errors.push(`${label}必须同时包含至少一个修饰键和一个按键`);
    return null;
  }
  if (new Set(modifiers).size !== modifiers.length) {
    errors.push(`${label}不得重复声明同一修饰键`);
    return null;
  }
  return [...modifiers].sort().concat([...primaryKeys].sort()).join("+");
}

/** 读取独立的全局快捷键动作契约；能力启用不代表存在任何默认绑定。 */
export function parseGlobalShortcutContract(profileText, enabled, errors = []) {
  const blocks = [
    ...profileText.matchAll(
      /```gui-global-shortcut-contract[\t ]*\r?\n([\s\S]*?)```/gu,
    ),
  ];
  if (!enabled) {
    if (blocks.length > 0) {
      errors.push("global_shortcut = disabled 时不得保留 gui-global-shortcut-contract 代码块");
    }
    return [];
  }
  if (blocks.length === 0) {
    errors.push("global_shortcut = enabled 时 docs/GUI_APP_PROFILE.md 缺少 gui-global-shortcut-contract JSON 代码块");
    return null;
  }
  if (blocks.length !== 1) {
    errors.push(`global_shortcut = enabled 时 gui-global-shortcut-contract 必须只有一个，实际 ${blocks.length} 个`);
    return null;
  }
  let contract;
  try {
    contract = JSON.parse(blocks[0][1].trim());
  } catch (error) {
    errors.push(`gui-global-shortcut-contract 必须是合法 JSON：${error.message}`);
    return null;
  }
  if (
    !validateExactJsonFields(
      contract,
      GLOBAL_SHORTCUT_CONTRACT_FIELDS,
      "gui-global-shortcut-contract",
      errors,
    )
  ) {
    return null;
  }
  if (contract.schemaVersion !== 1) {
    errors.push("gui-global-shortcut-contract schemaVersion 必须为 1");
  }
  if (!Array.isArray(contract.actions)) {
    errors.push("gui-global-shortcut-contract actions 必须是数组");
    return null;
  }

  const ids = new Set();
  const normalizedChords = new Map();
  for (const [index, action] of contract.actions.entries()) {
    const label = `gui-global-shortcut-contract actions[${index}]`;
    if (!validateExactJsonFields(action, GLOBAL_SHORTCUT_ACTION_FIELDS, label, errors)) {
      continue;
    }
    if (
      typeof action.id !== "string" ||
      !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u.test(action.id)
    ) {
      errors.push(`${label}.id 必须是唯一 ASCII snake_case 标识`);
    } else if (ids.has(action.id)) {
      errors.push(`${label}.id 重复：${action.id}`);
    } else {
      ids.add(action.id);
    }

    if (!new Set(["fixed", "user-configurable"]).has(action.bindingPolicy)) {
      errors.push(`${label}.bindingPolicy 必须为 fixed 或 user-configurable`);
    }
    const chordIsNull = action.defaultChord === null;
    const chordIsNonEmptyString =
      typeof action.defaultChord === "string" && action.defaultChord.trim().length > 0;
    if (action.bindingPolicy === "fixed" && !chordIsNonEmptyString) {
      errors.push(`${label} 的 fixed 动作必须提供非空 defaultChord`);
    } else if (!chordIsNull && !chordIsNonEmptyString) {
      errors.push(`${label}.defaultChord 必须是非空字符串或 null`);
    }
    if (chordIsNonEmptyString) {
      const normalized = normalizedGlobalShortcutChord(
        action.defaultChord,
        `${label}.defaultChord`,
        errors,
      );
      if (normalized) {
        const existingId = normalizedChords.get(normalized);
        if (existingId) {
          errors.push(`${label}.defaultChord 与动作 ${existingId} 规范化后重复`);
        } else {
          normalizedChords.set(normalized, action.id || `actions[${index}]`);
        }
      }
    }

    if (
      validateExactJsonFields(
        action.dispatch,
        GLOBAL_SHORTCUT_DISPATCH_FIELDS,
        `${label}.dispatch`,
        errors,
      )
    ) {
      if (!new Set(["host-action", "core-use-case"]).has(action.dispatch.kind)) {
        errors.push(`${label}.dispatch.kind 必须为 host-action 或 core-use-case`);
      }
      if (
        typeof action.dispatch.target !== "string" ||
        !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:_[a-z0-9]+)*)*$/u.test(
          action.dispatch.target,
        )
      ) {
        errors.push(`${label}.dispatch.target 必须是小写 ASCII snake_case 或点分 snake_case 标识`);
      }
    }
    if (typeof action.e2eSafe !== "boolean") {
      errors.push(`${label}.e2eSafe 必须是 boolean`);
    }
  }
  return contract.actions;
}

/** 从 GUI 应用资料中的固定代码块读取本次初始化选择。 */
function readGuiInitializationProfile(root, errors) {
  const profilePath = path.join(root, "docs", "GUI_APP_PROFILE.md");
  let text;
  try {
    text = readTextFile(profilePath);
  } catch (error) {
    errors.push(`缺少可解析的 GUI 初始化资料：${error.message}`);
    return null;
  }
  const blocks = [...text.matchAll(/```gui-initialization-config\s*\n([\s\S]*?)```/gu)];
  if (blocks.length === 0) {
    errors.push("docs/GUI_APP_PROFILE.md 缺少 gui-initialization-config 代码块");
    return null;
  }
  if (blocks.length !== 1) {
    errors.push(`docs/GUI_APP_PROFILE.md 必须只有一个 gui-initialization-config 代码块，实际 ${blocks.length} 个`);
    return null;
  }
  const block = blocks[0];
  const values = new Map();
  const fieldOrder = [];
  for (const rawLine of block[1].split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^([a-z_]+)\s*=\s*([a-z]+)$/u);
    if (!match || !GUI_INITIALIZATION_PROFILE_FIELD_SET.has(match[1])) {
      errors.push(`GUI 初始化配置包含非法字段行：${line}`);
      continue;
    }
    if (values.has(match[1])) {
      errors.push(`GUI 初始化配置字段重复：${match[1]}`);
      continue;
    }
    values.set(match[1], match[2]);
    fieldOrder.push(match[1]);
  }
  for (const field of GUI_INITIALIZATION_PROFILE_FIELDS) {
    if (!values.has(field)) {
      const detail =
        field === "sidebar_mode"
          ? "；初始化器应在用户未选择时写入 detailed"
          : "";
      errors.push(`GUI 初始化配置缺少字段：${field}${detail}`);
    }
  }
  if (
    fieldOrder.length === GUI_INITIALIZATION_PROFILE_FIELDS.length &&
    fieldOrder.some(
      (field, index) => field !== GUI_INITIALIZATION_PROFILE_FIELDS[index],
    )
  ) {
    errors.push(
      `GUI 初始化配置字段顺序必须为：${GUI_INITIALIZATION_PROFILE_FIELDS.join(" → ")}`,
    );
  }
  for (const field of GUI_INITIALIZATION_PROFILE_FIELDS.filter(
    (field) => field !== "sidebar_mode",
  )) {
    if (values.has(field) && !new Set(["enabled", "disabled"]).has(values.get(field))) {
      errors.push(`GUI 初始化配置 ${field} 必须为 enabled 或 disabled`);
    }
  }
  if (values.has("sidebar_mode") && !new Set(["compact", "detailed"]).has(values.get("sidebar_mode"))) {
    errors.push("GUI 初始化配置 sidebar_mode 必须为 compact 或 detailed");
  }
  if (values.get("deep_link") === "enabled" && values.get("single_instance") !== "enabled") {
    errors.push("GUI 初始化配置 deep_link = enabled 必须同时满足 single_instance = enabled");
  }
  const globalShortcutActions = parseGlobalShortcutContract(
    text,
    values.get("global_shortcut") === "enabled",
    errors,
  );
  if (errors.length > 0) return null;
  return {
    aboutPage: values.get("about_page") === "enabled",
    autostart: values.get("autostart") === "enabled",
    deepLink: values.get("deep_link") === "enabled",
    globalShortcut: values.get("global_shortcut") === "enabled",
    globalShortcutActions,
    sidebarMode: values.get("sidebar_mode"),
    singleInstance: values.get("single_instance") === "enabled",
    sponsorPage: values.get("sponsor_page") === "enabled",
    systemNotification: values.get("system_notification") === "enabled",
    systemTray: values.get("system_tray") === "enabled",
  };
}

/** 读取目录中可能存在的文本文件；目录缺失时返回空集合。 */
function collectOptionalTexts(directory, extensions) {
  if (!fs.existsSync(directory)) return [];
  return collectFiles(directory, extensions).map(readTextFile);
}

/** 还原 PNG scanline filter，确认 32px 托盘来源不是全透明空图。 */
function countVisibleRgbaPixels(compressed, width, height) {
  const bytesPerPixel = 4;
  const rowBytes = width * bytesPerPixel;
  const expectedBytes = height * (rowBytes + 1);
  const encoded = inflateSync(compressed, { maxOutputLength: expectedBytes });
  if (encoded.length !== expectedBytes) {
    throw new Error(`PNG 解压长度错误：期望 ${expectedBytes}，实际 ${encoded.length}`);
  }
  const decoded = Buffer.alloc(width * height * bytesPerPixel);
  const paeth = (left, above, upperLeft) => {
    const estimate = left + above - upperLeft;
    const leftDistance = Math.abs(estimate - left);
    const aboveDistance = Math.abs(estimate - above);
    const upperLeftDistance = Math.abs(estimate - upperLeft);
    if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
    return aboveDistance <= upperLeftDistance ? above : upperLeft;
  };
  for (let row = 0; row < height; row += 1) {
    const encodedOffset = row * (rowBytes + 1);
    const decodedOffset = row * rowBytes;
    const filter = encoded[encodedOffset];
    if (filter > 4) throw new Error(`PNG 使用不支持的 scanline filter：${filter}`);
    for (let column = 0; column < rowBytes; column += 1) {
      const raw = encoded[encodedOffset + column + 1];
      const left = column >= bytesPerPixel ? decoded[decodedOffset + column - bytesPerPixel] : 0;
      const above = row > 0 ? decoded[decodedOffset - rowBytes + column] : 0;
      const upperLeft = row > 0 && column >= bytesPerPixel
        ? decoded[decodedOffset - rowBytes + column - bytesPerPixel]
        : 0;
      const predictor = [0, left, above, Math.floor((left + above) / 2), paeth(left, above, upperLeft)][filter];
      decoded[decodedOffset + column] = (raw + predictor) & 0xff;
    }
  }
  let visiblePixels = 0;
  for (let index = 3; index < decoded.length; index += bytesPerPixel) {
    if (decoded[index] > 0) visiblePixels += 1;
  }
  return visiblePixels;
}

/** 验证 Tauri 官方 32px 图标已进入 bundle 配置，且文件为可见 RGBA PNG。 */
function validateTrayIconAsset(guiRoot, errors) {
  const tauriRoot = path.join(guiRoot, "src-tauri");
  const configPath = path.join(tauriRoot, "tauri.conf.json");
  let config;
  try {
    config = JSON.parse(readTextFile(configPath));
  } catch (error) {
    errors.push(`无法读取严格 JSON Tauri 配置：${error.message}`);
    return;
  }
  const requiredReference = "icons/32x32.png";
  const configuredIcons = config?.bundle?.icon;
  if (!Array.isArray(configuredIcons) || !configuredIcons.includes(requiredReference)) {
    errors.push(`tauri.conf.json bundle.icon 必须引用 ${requiredReference}`);
    return;
  }
  const iconPath = path.resolve(tauriRoot, requiredReference);
  const relative = path.relative(tauriRoot, iconPath);
  if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    errors.push(`托盘图标路径越出 src-tauri：${requiredReference}`);
    return;
  }
  let png;
  try {
    png = readBinaryFile(iconPath);
  } catch (error) {
    errors.push(error.message);
    return;
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (png.length < 33 || !png.subarray(0, 8).equals(signature)) {
    errors.push(`${requiredReference} 必须是有效 PNG`);
    return;
  }
  let offset = 8;
  let header = null;
  const imageData = [];
  try {
    while (offset + 12 <= png.length) {
      const length = png.readUInt32BE(offset);
      const type = png.subarray(offset + 4, offset + 8).toString("ascii");
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;
      const chunkEnd = dataEnd + 4;
      if (chunkEnd > png.length) throw new Error("PNG chunk 越界");
      const data = png.subarray(dataStart, dataEnd);
      if (type === "IHDR") header = data;
      if (type === "IDAT") imageData.push(data);
      offset = chunkEnd;
      if (type === "IEND") break;
    }
    if (!header || header.length !== 13 || imageData.length === 0) {
      throw new Error("PNG 缺少 IHDR 或 IDAT");
    }
    const width = header.readUInt32BE(0);
    const height = header.readUInt32BE(4);
    const [bitDepth, colorType, compression, filter, interlace] = header.subarray(8, 13);
    if (width !== 32 || height !== 32) throw new Error(`尺寸必须为 32x32，实际 ${width}x${height}`);
    if (bitDepth !== 8 || colorType !== 6 || compression !== 0 || filter !== 0 || interlace !== 0) {
      throw new Error("必须是 8-bit RGBA、非交错 PNG");
    }
    const compressed = Buffer.concat(imageData);
    if (compressed.length > 1024 * 1024) throw new Error("PNG IDAT 超出 1 MiB 安全上限");
    if (countVisibleRgbaPixels(compressed, width, height) === 0) {
      throw new Error("全部像素透明，无法形成可见托盘图标");
    }
  } catch (error) {
    errors.push(`${requiredReference} 不满足托盘图标约束：${error.message}`);
  }
}

/** 检查每一组必须同时出现的 Rust 生命周期片段。 */
function validateTraySourceContract(sourceText, errors) {
  for (const [label, fragments] of TRAY_SOURCE_REQUIREMENTS) {
    const missing = fragments.filter((fragment) => !sourceText.includes(fragment));
    if (missing.length > 0) {
      errors.push(`${label}缺少：${missing.join(", ")}`);
    }
  }
  for (const [label, alternatives] of TRAY_SOURCE_ALTERNATIVES) {
    if (!alternatives.some((fragment) => sourceText.includes(fragment))) {
      errors.push(`${label}缺少任一支持形式：${alternatives.join(" | ")}`);
    }
  }
  for (const id of ["show_window", "quit"]) {
    const idPattern = new RegExp(`["']${id}["']`, "u");
    if (!idPattern.test(sourceText)) {
      errors.push(`托盘菜单缺少稳定 ID：${id}`);
    }
  }
}

/** 未选择托盘时拒绝关闭隐藏，并把主窗口关闭确定性接到应用退出。 */
function validateNoTraySourceContract(sourceTexts, errors) {
  const sourceText = sourceTexts.join("\n");
  for (const forbidden of [
    "TrayIconBuilder",
    "prevent_close",
    ".hide(",
    "rust_i18n::t!(\"tray.show_window\")",
  ]) {
    if (sourceText.includes(forbidden)) {
      errors.push(`未选择系统托盘时不得保留托盘/关闭隐藏实现：${forbidden}`);
    }
  }
  const functions = sourceTexts.flatMap(collectRustFunctions);
  const closeExitFunctions = functions.filter(
    (candidate) =>
      candidate.text.includes("WindowEvent::CloseRequested") &&
      /\.exit\s*\(\s*0\s*\)/u.test(candidate.text),
  );
  if (closeExitFunctions.length === 0) {
    errors.push("未选择系统托盘时必须在 CloseRequested 中显式调用 AppHandle::exit(0)");
    return;
  }
  const windowEventArguments = sourceTexts.flatMap((text) =>
    collectMethodArguments(text, "on_window_event"),
  );
  const closeExitWired = closeExitFunctions.some((candidate) =>
    windowEventArguments.some(
      (argument) =>
        (argument.includes("WindowEvent::CloseRequested") &&
          /\.exit\s*\(\s*0\s*\)/u.test(argument)) ||
        new RegExp(`\\b${candidate.name}\\s*\\(`, "u").test(argument),
    ),
  );
  if (!closeExitWired) {
    errors.push("未选择系统托盘时显式退出处理必须由 Tauri Builder .on_window_event(...) 实际注册");
  }
}

/** 验证托盘不是未调用的样例代码，并且图标与菜单都绑定到同一个实际 builder。 */
function validateTrayRuntimeContract(sourceTexts, errors) {
  const functions = sourceTexts.flatMap(collectRustFunctions);
  const trayFunctions = functions.filter((candidate) => candidate.text.includes("TrayIconBuilder"));
  const completeTrayFunctions = trayFunctions.filter((candidate) => {
    const text = candidate.text;
    const iconIndex = text.indexOf("default_window_icon");
    const iconStatementEnd = iconIndex >= 0 ? text.indexOf(";", iconIndex) : -1;
    const iconResolution = iconIndex >= 0
      ? text.slice(iconIndex, iconStatementEnd >= 0 ? iconStatementEnd : iconIndex + 300)
      : "";
    const requiresIcon = /\.(?:expect|unwrap|ok_or|ok_or_else)\s*\(/u.test(iconResolution);
    const buildsTray = /\.build\s*\(\s*app\s*\)\s*(?:\?|\.expect\s*\(|\.unwrap\s*\()/u.test(text);
    return (
      /Menu(?:::|Item)/u.test(text) &&
      /Menu(?:::with_items|Builder)/u.test(text) &&
      /\.menu\s*\(/u.test(text) &&
      /\.icon\s*\(/u.test(text) &&
      requiresIcon &&
      buildsTray
    );
  });
  if (completeTrayFunctions.length === 0) {
    errors.push(
      "托盘安装函数必须在同一实现中创建 Menu、绑定 .menu(...)、强制取得 default_window_icon、绑定 .icon(...) 并成功 .build(app)，不得缺图标后继续启动",
    );
    return;
  }
  const localizedTrayFunctions = completeTrayFunctions.filter((candidate) =>
    ["tray.show_window", "tray.quit"].every((key) => {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      return new RegExp(
        `(?:rust_i18n::)?t!\\s*\\(\\s*["']${escapedKey}["']`,
        "u",
      ).test(candidate.text);
    }),
  );
  if (localizedTrayFunctions.length === 0) {
    errors.push(
      "托盘安装函数必须通过 rust-i18n t! 宏解析 tray.show_window 与 tray.quit；稳定 ID 或原始翻译键不得直接作为可见菜单文本",
    );
  }
  const rawTrayLabelPattern = /(?:MenuItemBuilder::with_id\s*\(\s*[^,]+,\s*|MenuItem::with_id\s*\(\s*[^,]+,\s*[^,]+,\s*|MenuItemBuilder::new\s*\(\s*|\.text\s*\(\s*)["']tray\.(?:show_window|quit)["']/su;
  if (completeTrayFunctions.some((candidate) => rawTrayLabelPattern.test(candidate.text))) {
    errors.push("托盘菜单不得把 tray.show_window 或 tray.quit 原始翻译键直接作为可见标签");
  }
  const setupArguments = sourceTexts.flatMap((text) => collectMethodArguments(text, "setup"));
  const isWiredFromSetup = completeTrayFunctions.some((candidate) =>
    setupArguments.some(
      (argument) =>
        argument.includes("TrayIconBuilder") ||
        new RegExp(`\\b${candidate.name}\\s*\\(`, "u").test(argument),
    ),
  );
  if (!isWiredFromSetup) {
    errors.push("托盘安装函数必须由 Tauri Builder .setup(...) 实际调用，未接线的死代码不算创建托盘");
  }

  const closeFunctions = functions.filter((candidate) => candidate.text.includes("WindowEvent::CloseRequested"));
  const windowEventArguments = sourceTexts.flatMap((text) => collectMethodArguments(text, "on_window_event"));
  const closeHandlerWired = closeFunctions.some((candidate) =>
    windowEventArguments.some(
      (argument) =>
        argument.includes("WindowEvent::CloseRequested") ||
        new RegExp(`\\b${candidate.name}\\s*\\(`, "u").test(argument),
    ),
  );
  if (!closeHandlerWired) {
    errors.push("主窗口关闭隐藏处理必须由 Tauri Builder .on_window_event(...) 实际注册");
  }
}

/** 验证生成项目中的可选页面、侧栏、单实例、托盘、回归测试与本地化资源。 */
export function verifyGuiLifecycleContract(rootInput, guiInput) {
  const errors = [];
  let resolved;
  try {
    resolved = resolveGuiRoot(rootInput, guiInput);
  } catch (error) {
    return [error.message];
  }
  const { root, guiRoot } = resolved;
  const profile = readGuiInitializationProfile(root, errors);
  if (!profile) return errors;
  try {
    const rootCargo = readTextFile(path.join(root, "Cargo.toml"));
    const guiCargo = readTextFile(path.join(guiRoot, "src-tauri", "Cargo.toml"));
    const workspaceTauri =
      tomlAssignment(tomlSection(rootCargo, "workspace.dependencies"), "tauri") ||
      tomlSection(rootCargo, "workspace.dependencies.tauri");
    const hasTrayFeature = /["']tray-icon["']/u.test(workspaceTauri);
    if (profile.systemTray && !hasTrayFeature) {
      errors.push("选择系统托盘时，根 [workspace.dependencies].tauri 必须启用 tray-icon feature");
    }
    if (!profile.systemTray && hasTrayFeature) {
      errors.push("未选择系统托盘时，根 [workspace.dependencies].tauri 不得启用 tray-icon feature");
    }
    const memberTauri =
      tomlAssignment(tomlSection(guiCargo, "dependencies"), "tauri") ||
      tomlSection(guiCargo, "dependencies.tauri");
    if (!memberTauri || !/\bworkspace\s*=\s*true\b/u.test(memberTauri)) {
      errors.push("GUI src-tauri/Cargo.toml 必须通过 workspace = true 继承 tauri");
    }
    const memberDependencyDeclaration = (dependency) =>
      tomlAssignment(tomlSection(guiCargo, "dependencies"), dependency) ||
      tomlSection(guiCargo, `dependencies.${dependency}`);
    if (profile.aboutPage) {
      const workspaceTokio =
        tomlAssignment(tomlSection(rootCargo, "workspace.dependencies"), "tokio") ||
        tomlSection(rootCargo, "workspace.dependencies.tokio");
      if (!workspaceTokio || !/["']fs["']/u.test(workspaceTokio)) {
        errors.push("选择关于页时，根 [workspace.dependencies].tokio 必须启用 fs feature");
      }
      for (const dependency of ["tokio", "serde", "serde_json"]) {
        const memberDependency = memberDependencyDeclaration(dependency);
        if (!memberDependency || !/\bworkspace\s*=\s*true\b/u.test(memberDependency)) {
          errors.push(`选择关于页时，GUI src-tauri/Cargo.toml 必须通过 workspace = true 继承 ${dependency}`);
        }
      }
    } else {
      for (const dependency of ["tokio", "serde", "serde_json"]) {
        if (memberDependencyDeclaration(dependency)) {
          errors.push(`未选择关于页时，GUI src-tauri/Cargo.toml 不得声明 ${dependency} 依赖`);
        }
      }
    }
    validatePluginDependencyContract(rootCargo, guiCargo, profile, errors);

    if (profile.systemTray) validateTrayIconAsset(guiRoot, errors);

    const sourceRoot = path.join(guiRoot, "src-tauri", "src");
    let rustSourceText = "";
    let rustTestText = "";
    const rustFiles = collectFiles(sourceRoot, new Set([".rs"]));
    if (rustFiles.length === 0) {
      errors.push("GUI Rust 源码为空");
    } else {
      const sourceTexts = rustFiles.map(readTextFile);
      const sourceText = sourceTexts.join("\n");
      rustSourceText = sourceText;
      if (profile.systemTray) {
        validateTraySourceContract(sourceText, errors);
        validateTrayRuntimeContract(sourceTexts, errors);
      } else {
        validateNoTraySourceContract(sourceTexts, errors);
      }
      validatePluginRuntimeContract(guiRoot, sourceTexts, profile, errors);
      const testRoot = path.join(guiRoot, "src-tauri", "tests");
      const testFiles = fs.existsSync(testRoot)
        ? collectFiles(testRoot, new Set([".rs"]))
        : [];
      const testText = [...sourceTexts, ...testFiles.map(readTextFile)].join("\n");
      rustTestText = testText;
      const testFunctions = collectRustFunctions(testText);
      const requiredTestNames = [
        ...(profile.systemTray ? TRAY_TEST_NAMES : NO_TRAY_TEST_NAMES),
      ];
      for (const testName of requiredTestNames) {
        const testFunction = testFunctions.find((candidate) => candidate.name === testName);
        if (!testFunction) {
          errors.push(`缺少固定 GUI 生命周期回归测试：${testName}`);
        } else if (!hasMeaningfulRustAssertion(testFunction.text)) {
          errors.push(`固定 GUI 生命周期回归必须包含非平凡断言：${testName}`);
        }
      }
      validateRequiredPluginTests(testFunctions, profile, errors);
    }

    if (profile.systemTray) {
      const localeFiles = collectFiles(guiRoot, new Set([".json", ".yaml", ".yml"]));
      validateLocales(localeFiles.map(readTextFile), errors);
    }
    const frontendSourceText = validateFrontendInitializationContract(
      guiRoot,
      profile,
      errors,
      { collectOptionalTexts, readBinaryFile, readTextFile },
    );
    validateRustOnlyDesktopCapabilities(guiRoot, profile, errors, {
      collectOptionalTexts,
      readTextFile,
    });
    validateReleaseNotesRuntimeContract(
      guiRoot,
      profile.aboutPage,
      rustSourceText,
      rustTestText,
      frontendSourceText,
      errors,
    );
  } catch (error) {
    errors.push(error.message);
  }
  return errors;
}

/** 运行命令行检查并提供稳定的成功或失败输出。 */
function main() {
  let inputs;
  try {
    inputs = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    return 2;
  }
  const errors = verifyGuiLifecycleContract(inputs.root, inputs.guiDir);
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`ERROR: ${error}`);
    }
    return 1;
  }
  console.log(
    "GUI lifecycle contract passed: recorded capability selection, demand-driven global-shortcut actions, conditional pages/media, selected sidebar, host lifecycle, and close behavior.",
  );
  return 0;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  process.exitCode = main();
}
