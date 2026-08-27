#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

import { validateReleaseNotesRuntimeContract } from "./verify-release-notes-contract.mjs";

const IGNORED_DIRECTORIES = new Set([".git", ".harness", "node_modules", "target", "dist", "release"]);

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

const SINGLE_INSTANCE_TEST_NAMES = [
  "single_instance_plugin_is_registered_first",
  "second_launch_restores_existing_main_window",
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

const GUI_INITIALIZATION_PROFILE_FIELDS = new Set([
  "system_tray",
  "about_page",
  "sponsor_page",
  "single_instance",
  "sidebar_mode",
]);

const FRONTEND_SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);

const SPONSOR_MEDIA_FILES = [
  "arrow.png",
  "bg.jpg",
  "icon1.png",
  "icon2.png",
  "icon3.png",
  "icon4.png",
  "img1.png",
  "img2.png",
  "img3.png",
  "pay1.png",
  "pay2.png",
  "select.png",
];

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
  const block = text.match(/```gui-initialization-config\s*\n([\s\S]*?)```/u);
  if (!block) {
    errors.push("docs/GUI_APP_PROFILE.md 缺少 gui-initialization-config 代码块");
    return null;
  }
  const values = new Map();
  for (const rawLine of block[1].split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^([a-z_]+)\s*=\s*([a-z]+)$/u);
    if (!match || !GUI_INITIALIZATION_PROFILE_FIELDS.has(match[1])) {
      errors.push(`GUI 初始化配置包含非法字段行：${line}`);
      continue;
    }
    if (values.has(match[1])) {
      errors.push(`GUI 初始化配置字段重复：${match[1]}`);
      continue;
    }
    values.set(match[1], match[2]);
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
  for (const field of ["system_tray", "about_page", "sponsor_page", "single_instance"]) {
    if (values.has(field) && !new Set(["enabled", "disabled"]).has(values.get(field))) {
      errors.push(`GUI 初始化配置 ${field} 必须为 enabled 或 disabled`);
    }
  }
  if (values.has("sidebar_mode") && !new Set(["compact", "detailed"]).has(values.get("sidebar_mode"))) {
    errors.push("GUI 初始化配置 sidebar_mode 必须为 compact 或 detailed");
  }
  if (errors.length > 0) return null;
  return {
    aboutPage: values.get("about_page") === "enabled",
    sidebarMode: values.get("sidebar_mode"),
    singleInstance: values.get("single_instance") === "enabled",
    sponsorPage: values.get("sponsor_page") === "enabled",
    systemTray: values.get("system_tray") === "enabled",
  };
}

/** 递归枚举受管文件，拒绝源码树中的符号链接。 */
function collectFiles(directory, extensions) {
  const results = [];
  const visit = (current) => {
    const stats = fs.lstatSync(current);
    if (stats.isSymbolicLink()) {
      throw new Error(`受管目录不得包含符号链接：${current}`);
    }
    if (stats.isFile()) {
      if (extensions.has(path.extname(current))) {
        results.push(current);
      }
      return;
    }
    if (!stats.isDirectory()) {
      return;
    }
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      visit(path.join(current, entry.name));
    }
  };
  visit(directory);
  return results.sort();
}

/** 去除 TOML 行尾注释，同时保留字符串中的井号。 */
function stripTomlComments(text) {
  return text
    .split(/\r?\n/u)
    .map((line) => {
      let quote = null;
      let escaped = false;
      for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (quote && character === "\\") {
          escaped = true;
          continue;
        }
        if (character === '"' || character === "'") {
          quote = quote === character ? null : quote ?? character;
          continue;
        }
        if (!quote && character === "#") {
          return line.slice(0, index);
        }
      }
      return line;
    })
    .join("\n");
}

/** 提取一个 TOML 表正文，不把后续表误算进当前配置。 */
function tomlSection(text, sectionName) {
  const lines = stripTomlComments(text).split(/\r?\n/u);
  const heading = `[${sectionName}]`;
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) {
    return "";
  }
  const body = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s*\[.+\]\s*$/u.test(lines[index])) {
      break;
    }
    body.push(lines[index]);
  }
  return body.join("\n");
}

/** 提取 TOML 表内一个可能跨行的赋值表达式。 */
function tomlAssignment(section, key) {
  const lines = section.split(/\r?\n/u);
  const keyPattern = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\s*=`, "u");
  const start = lines.findIndex((line) => keyPattern.test(line));
  if (start < 0) {
    return "";
  }
  const block = [];
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let lineIndex = start; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    block.push(line);
    for (const character of line) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (quote && character === "\\") {
        escaped = true;
        continue;
      }
      if (character === '"' || character === "'") {
        quote = quote === character ? null : quote ?? character;
        continue;
      }
      if (!quote && "[{(".includes(character)) {
        depth += 1;
      } else if (!quote && "]})".includes(character)) {
        depth -= 1;
      }
    }
    if (depth <= 0 && !quote) {
      break;
    }
  }
  return block.join("\n");
}

/** 把真实 GUI 路径约束在项目根内，避免检查到错误项目。 */
function resolveGuiRoot(rootInput, guiInput) {
  if (path.isAbsolute(guiInput)) {
    throw new Error("--gui-dir 必须是项目根相对路径");
  }
  const root = fs.realpathSync(path.resolve(rootInput));
  const requested = path.resolve(root, guiInput);
  const guiRoot = fs.realpathSync(requested);
  const relative = path.relative(root, guiRoot);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    throw new Error(`GUI 目录必须严格位于项目根内：${guiInput}`);
  }
  if (fs.lstatSync(requested).isSymbolicLink()) {
    throw new Error(`GUI 目录不得是符号链接：${guiInput}`);
  }
  return { root, guiRoot };
}

/** 在忽略字符串与注释中的分隔符后寻找成对括号的末端。 */
function findMatchingDelimiter(sourceText, openIndex, openCharacter, closeCharacter) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockCommentDepth = 0;
  for (let index = openIndex; index < sourceText.length; index += 1) {
    const character = sourceText[index];
    const next = sourceText[index + 1];
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockCommentDepth > 0) {
      if (character === "/" && next === "*") {
        blockCommentDepth += 1;
        index += 1;
      } else if (character === "*" && next === "/") {
        blockCommentDepth -= 1;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockCommentDepth = 1;
      index += 1;
      continue;
    }
    if (character === '"') {
      quote = character;
      continue;
    }
    if (character === openCharacter) depth += 1;
    if (character === closeCharacter) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** 枚举普通 Rust 函数正文，供生命周期接线检查使用。 */
function collectRustFunctions(sourceText) {
  const functions = [];
  const pattern = /\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>{}]*>)?\s*\(/gu;
  for (const match of sourceText.matchAll(pattern)) {
    const parameterStart = sourceText.indexOf("(", match.index);
    const parameterEnd = findMatchingDelimiter(sourceText, parameterStart, "(", ")");
    if (parameterEnd < 0) continue;
    const bodyStart = sourceText.indexOf("{", parameterEnd);
    const semicolon = sourceText.indexOf(";", parameterEnd);
    if (bodyStart < 0 || (semicolon >= 0 && semicolon < bodyStart)) continue;
    const bodyEnd = findMatchingDelimiter(sourceText, bodyStart, "{", "}");
    if (bodyEnd < 0) continue;
    functions.push({
      name: match[1],
      text: sourceText.slice(match.index, bodyEnd + 1),
    });
  }
  return functions;
}

/** 枚举指定链式方法的完整参数，避免把未接入 Builder 的死代码视为运行时实现。 */
function collectMethodArguments(sourceText, methodName) {
  const argumentsList = [];
  const pattern = new RegExp(`\\.${methodName}\\s*\\(`, "gu");
  for (const match of sourceText.matchAll(pattern)) {
    const openIndex = sourceText.indexOf("(", match.index);
    const closeIndex = findMatchingDelimiter(sourceText, openIndex, "(", ")");
    if (closeIndex >= 0) argumentsList.push(sourceText.slice(openIndex + 1, closeIndex));
  }
  return argumentsList;
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

/** 验证单实例插件先于其他插件注册，且回调只恢复既有主窗口。 */
function validateSingleInstanceContract(sourceTexts, errors) {
  const candidates = sourceTexts.filter((text) => text.includes("tauri_plugin_single_instance::init"));
  if (candidates.length === 0) {
    return;
  }
  const hasValidRegistration = candidates.some((sourceText) => {
    const singleInstanceIndex = sourceText.indexOf("tauri_plugin_single_instance::init");
    const pluginIndexes = [...sourceText.matchAll(/\.plugin\s*\(/gu)].map((match) => match.index);
    const enclosingPluginIndex = pluginIndexes.filter((index) => index < singleInstanceIndex).at(-1);
    if (enclosingPluginIndex === undefined || enclosingPluginIndex !== pluginIndexes[0]) {
      return false;
    }
    const callbackWindow = sourceText.slice(singleInstanceIndex, singleInstanceIndex + 1600);
    const parameters = callbackWindow.match(
      /\|\s*app\s*,\s*(_args|_)\s*,\s*(_cwd|_)\s*\|/u,
    );
    if (!parameters || !/restore_main_window\s*\(\s*app\s*\)/u.test(callbackWindow)) {
      return false;
    }
    const namedIgnoredParameters = parameters.slice(1).filter((name) => name !== "_");
    return namedIgnoredParameters.every((name) => {
      const uses = callbackWindow.match(new RegExp(`\\b${name}\\b`, "gu")) ?? [];
      return uses.length === 1;
    });
  });
  if (!hasValidRegistration) {
    errors.push(
      "tauri-plugin-single-instance 必须作为首个 Tauri plugin 注册，回调不得消费参数/工作目录且只调用 restore_main_window(app) 恢复既有窗口",
    );
  }
}

/** 检查中英文原生托盘文案均被复制到真实 GUI。 */
function validateLocales(localeTexts, errors) {
  const hasChinese = localeTexts.some(
    (text) => text.includes("show_window") && text.includes("quit") && text.includes("显示窗口") && text.includes("退出"),
  );
  const hasEnglish = localeTexts.some(
    (text) => text.includes("show_window") && text.includes("quit") && text.includes("Show Window") && text.includes("Quit"),
  );
  if (!hasChinese) {
    errors.push("缺少同时包含 show_window/quit 的中文托盘资源");
  }
  if (!hasEnglish) {
    errors.push("缺少同时包含 show_window/quit 的英文托盘资源");
  }
}

/** 判断前端源码是否包含一个精确的静态路由字面量。 */
function containsRouteLiteral(sourceText, route) {
  return [`"${route}"`, `'${route}'`, `\`${route}\``].some((literal) =>
    sourceText.includes(literal),
  );
}

/** 按初始化选择验证固定页面、可选页面、侧栏接线和赞助媒体。 */
function validateFrontendInitializationContract(guiRoot, profile, errors) {
  const sourceRoot = path.join(guiRoot, "src");
  if (!fs.existsSync(sourceRoot)) {
    errors.push("GUI 前端缺少 src 源码目录");
    return "";
  }
  const sourceFiles = collectFiles(sourceRoot, FRONTEND_SOURCE_EXTENSIONS);
  if (sourceFiles.length === 0) {
    errors.push("GUI 前端源码为空");
    return "";
  }
  const sourceEntries = sourceFiles.map((filePath) => ({
    relativePath: path.relative(sourceRoot, filePath).split(path.sep).join("/"),
    text: readTextFile(filePath),
  }));
  const sourceText = sourceEntries.map((entry) => entry.text).join("\n");

  if (!containsRouteLiteral(sourceText, "/settings")) {
    errors.push("GUI 固定基线缺少 /settings 路由");
  }
  if (!sourceEntries.some((entry) => /(?:^|\/)settings(?:[./-]|$)/iu.test(entry.relativePath))) {
    errors.push("GUI 固定基线缺少设置页运行时组件");
  }

  for (const page of [
    { enabled: profile.aboutPage, label: "关于页", route: "/about", token: "about" },
    { enabled: profile.sponsorPage, label: "赞助页", route: "/sponsor", token: "sponsor" },
  ]) {
    const hasRoute = containsRouteLiteral(sourceText, page.route);
    const pagePathPattern = new RegExp(`(?:^|/)${page.token}(?:[./-]|$)`, "iu");
    const hasComponent = sourceEntries.some((entry) => pagePathPattern.test(entry.relativePath));
    if (page.enabled) {
      if (!hasRoute) errors.push(`选择${page.label}时缺少 ${page.route} 路由`);
      if (!hasComponent) errors.push(`选择${page.label}时缺少运行时组件`);
    } else {
      if (hasRoute) errors.push(`未选择${page.label}时不得保留 ${page.route} 路由`);
      if (hasComponent) errors.push(`未选择${page.label}时不得保留运行时组件`);
    }
  }

  const mode = profile.sidebarMode;
  const selectedModePattern = new RegExp(
    `(?:\\bsidebarMode\\s*(?::[^=;]+)?=|\\bmode\\s*=|\\bmode\\s*:)\\s*["']${mode}["']`,
    "u",
  );
  if (!selectedModePattern.test(sourceText)) {
    errors.push(`GUI 前端未把 sidebar_mode = ${mode} 接入实际侧栏`);
  }
  if (mode === "compact") {
    for (const [label, pattern] of [
      ["136px 固定宽度", /\bcompact\s*:\s*136\b/u],
      ["56px Logo", /\bcompact\s*:\s*56\b/u],
      ["30px 图标", /(?:ICON_SIZE|iconSize)[A-Z_a-z]*\s*=\s*30\b/u],
      ["11px 名称", /(?:FONT_SIZE|fontSize)[A-Z_a-z]*\s*=\s*11\b/u],
      ["10em 名称宽度", /(?:LABEL_WIDTH|labelWidth)[A-Z_a-z]*\s*=\s*10\b/u],
      ["图标在上、名称在下", /icon-above-label/u],
    ]) {
      if (!pattern.test(sourceText)) errors.push(`精简侧栏缺少${label}契约`);
    }
  } else {
    for (const [label, pattern] of [
      ["248px 展开宽度", /\bdetailedExpanded\s*:\s*248\b/u],
      ["76px 收起宽度", /\bdetailedCollapsed\s*:\s*76\b/u],
      ["72px 展开 Logo", /\bdetailedExpanded\s*:\s*72\b/u],
      ["44px 收起 Logo", /\bdetailedCollapsed\s*:\s*44\b/u],
      ["默认展开", /DEFAULT_DETAILED_SIDEBAR_COLLAPSED\s*=\s*false\b/u],
      ["自身折叠按钮", /\bActionIcon\b/u],
      ["收起名称 Tooltip", /\bTooltip\b/u],
      ["独立折叠偏好", /localStorage\.(?:getItem|setItem)\s*\(/u],
    ]) {
      if (!pattern.test(sourceText)) errors.push(`详细侧栏缺少${label}契约`);
    }
  }

  const sponsorRoot = path.join(guiRoot, "public", "brand-support", "sponsor");
  if (profile.sponsorPage) {
    for (const filename of SPONSOR_MEDIA_FILES) {
      const assetPath = path.join(sponsorRoot, filename);
      try {
        readBinaryFile(assetPath);
      } catch (error) {
        errors.push(`选择赞助页时缺少完整本地媒体 ${filename}：${error.message}`);
      }
    }
  } else if (fs.existsSync(sponsorRoot)) {
    errors.push("未选择赞助页时不得保留 public/brand-support/sponsor 运行时媒体目录");
  }
  return sourceText;
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
    if (profile.aboutPage) {
      const workspaceTokio =
        tomlAssignment(tomlSection(rootCargo, "workspace.dependencies"), "tokio") ||
        tomlSection(rootCargo, "workspace.dependencies.tokio");
      if (!workspaceTokio || !/["']fs["']/u.test(workspaceTokio)) {
        errors.push("选择关于页时，根 [workspace.dependencies].tokio 必须启用 fs feature");
      }
      for (const dependency of ["tokio", "serde", "serde_json"]) {
        const memberDependency =
          tomlAssignment(tomlSection(guiCargo, "dependencies"), dependency) ||
          tomlSection(guiCargo, `dependencies.${dependency}`);
        if (!memberDependency || !/\bworkspace\s*=\s*true\b/u.test(memberDependency)) {
          errors.push(`选择关于页时，GUI src-tauri/Cargo.toml 必须通过 workspace = true 继承 ${dependency}`);
        }
      }
    }
    const workspaceSingleInstance =
      tomlAssignment(tomlSection(rootCargo, "workspace.dependencies"), "tauri-plugin-single-instance") ||
      tomlSection(rootCargo, "workspace.dependencies.tauri-plugin-single-instance");
    const memberSingleInstance =
      tomlAssignment(tomlSection(guiCargo, "dependencies"), "tauri-plugin-single-instance") ||
      tomlSection(guiCargo, "dependencies.tauri-plugin-single-instance");
    if (profile.singleInstance) {
      if (!workspaceSingleInstance) {
        errors.push("选择单实例时，根 [workspace.dependencies] 必须声明 tauri-plugin-single-instance");
      }
      if (!memberSingleInstance || !/\bworkspace\s*=\s*true\b/u.test(memberSingleInstance)) {
        errors.push("选择单实例时，GUI src-tauri/Cargo.toml 必须通过 workspace = true 继承 tauri-plugin-single-instance");
      }
    } else if (workspaceSingleInstance || memberSingleInstance) {
      errors.push("未选择单实例时不得声明 tauri-plugin-single-instance 依赖");
    }

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
      if (profile.singleInstance) {
        validateSingleInstanceContract(sourceTexts, errors);
      } else if (sourceText.includes("tauri_plugin_single_instance::init")) {
        errors.push("未选择单实例时不得注册 tauri-plugin-single-instance");
      }
      const testRoot = path.join(guiRoot, "src-tauri", "tests");
      const testFiles = fs.existsSync(testRoot)
        ? collectFiles(testRoot, new Set([".rs"]))
        : [];
      const testText = [...rustFiles, ...testFiles].map(readTextFile).join("\n");
      rustTestText = testText;
      const testFunctions = collectRustFunctions(testText);
      const requiredTestNames = [
        ...(profile.singleInstance ? SINGLE_INSTANCE_TEST_NAMES : []),
        ...(profile.systemTray ? TRAY_TEST_NAMES : NO_TRAY_TEST_NAMES),
      ];
      for (const testName of requiredTestNames) {
        const testFunction = testFunctions.find((candidate) => candidate.name === testName);
        if (!testFunction) {
          errors.push(`缺少固定 GUI 生命周期回归测试：${testName}`);
        } else if (!/\bassert(?:_eq|_ne)?!\s*\(/u.test(testFunction.text)) {
          errors.push(`固定 GUI 生命周期回归必须包含真实断言：${testName}`);
        }
      }
    }

    if (profile.systemTray) {
      const localeFiles = collectFiles(guiRoot, new Set([".json", ".yaml", ".yml"]));
      validateLocales(localeFiles.map(readTextFile), errors);
    }
    const frontendSourceText = validateFrontendInitializationContract(
      guiRoot,
      profile,
      errors,
    );
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
    "GUI lifecycle contract passed: recorded capability selection, conditional pages/media, selected sidebar, single-instance/tray lifecycle, and close behavior.",
  );
  return 0;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  process.exitCode = main();
}
