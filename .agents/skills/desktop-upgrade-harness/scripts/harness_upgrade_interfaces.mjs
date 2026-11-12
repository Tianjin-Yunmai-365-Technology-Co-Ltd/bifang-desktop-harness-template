/** 只读解析升级所需接口事实，按框架阻断不适用的 GUI 工程候选。 */

import fs from "node:fs";
import path from "node:path";
import { UpgradeError, assertSafePath, lstatOrNull, snapshotFile } from "./harness_upgrade_safety.mjs";

const METADATA_TABLE = ["workspace", "metadata", "agent-first-harness"];
const INTERFACES = new Set(["cli", "mcp", "gui", "nsh"]);
const FRAMEWORKS = new Set(["tauri", "nsh"]);
const NSH_TARGETS = new Set(["desktop", "mobile", "web"]);
const NSH_STABLE_REV = "e626a8dd8f8d8b277b9507cfd5ac74d0e67020f3";
const TAURI_SKILLS = new Set([
  "desktop-add-gui-adapter", "mantine-list-view", "desktop-add-gui-system-locale",
  "desktop-add-gui-window-state", "desktop-add-gui-dialog",
  "desktop-add-gui-system-tray", "desktop-add-gui-single-instance", "desktop-add-gui-deep-link",
  "desktop-add-gui-global-shortcut", "desktop-add-gui-system-notifications", "desktop-add-gui-autostart",
  "desktop-build-tauri-local-install", "desktop-build-tauri-release",
]);

/** 以字符串和数组边界分句，防止注释、多行文本伪装成接口元数据。 */
function statements(source) {
  const result = [];
  let current = "";
  let quote = null;
  let triple = false;
  let escaped = false;
  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== null) {
      current += character;
      if (quote === '"' && escaped) escaped = false;
      else if (quote === '"' && character === "\\") escaped = true;
      else if (character === quote && (!triple || source.slice(index, index + 3) === quote.repeat(3))) {
        if (triple) { current += quote.repeat(2); index += 2; }
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      triple = source.slice(index, index + 3) === character.repeat(3);
      current += triple ? character.repeat(3) : character;
      if (triple) index += 2;
    } else if (character === "#") {
      while (index + 1 < source.length && source[index + 1] !== "\n") index += 1;
    } else if (character === "\n" && depth === 0) {
      if (current.trim()) result.push(current.trim());
      current = "";
    } else {
      if (character === "[") depth += 1;
      if (character === "]") depth -= 1;
      current += character;
    }
  }
  if (quote !== null || depth !== 0) throw new UpgradeError("Cargo 接口元数据包含未结束的字符串或数组");
  if (current.trim()) result.push(current.trim());
  return result;
}

/** 支持 Cargo 常见裸键与引号键，未知键语法不猜测。 */
function keyPath(value) {
  const parts = [];
  let remaining = value.trim();
  while (remaining) {
    const matched = /^(?:([A-Za-z0-9_-]+)|'([^']*)'|("(?:[^"\\]|\\.)*"))\s*/u.exec(remaining);
    if (!matched) return null;
    let part;
    try { part = matched[1] ?? matched[2] ?? JSON.parse(matched[3]); }
    catch { return null; }
    parts.push(part);
    remaining = remaining.slice(matched[0].length);
    if (!remaining) return parts;
    if (!remaining.startsWith(".")) return null;
    remaining = remaining.slice(1).trimStart();
    if (!remaining) return null;
  }
  return null;
}

function equalPath(left, right) {
  return left?.length === right.length && left.every((value, index) => value === right[index]);
}

/** 框架值只接受明确字符串；不将未知值或类型当作 Tauri 默认。 */
function stringValue(value, label) {
  if (/^'[^'\r\n]*'$/u.test(value)) return value.slice(1, -1);
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === "string") return parsed;
  } catch { /* 下方统一报告受管字段类型错误。 */ }
  throw new UpgradeError(`Cargo ${label} 必须是字符串`);
}

/** 升级前拒绝未固定到正式版提交的 NSH 工作区依赖。 */
function hasNonstableNshRuntime(source) {
  let section = [];
  for (const statement of statements(source)) {
    if (statement.startsWith("[")) {
      const array = statement.startsWith("[[");
      section = keyPath(statement.slice(array ? 2 : 1, array ? -2 : -1));
      continue;
    }
    if (!equalPath(section, ["workspace", "dependencies"])) continue;
    const separator = statement.indexOf("=");
    if (separator < 0) continue;
    const keys = keyPath(statement.slice(0, separator));
    if (keys?.length !== 1 || !/^nsh-[a-z0-9_-]+$/u.test(keys[0])) continue;
    const dependency = statement.slice(separator + 1).trim();
    const version = /\bversion\s*=\s*"([^"]+)"/u.exec(dependency)?.[1];
    const git = /\bgit\s*=\s*"([^"]+)"/u.exec(dependency)?.[1];
    const revision = /\brev\s*=\s*"([0-9a-f]{40})"/u.exec(dependency)?.[1];
    if (version !== "0.4.0" || git !== "https://github.com/longbridge/nsh.git" || revision !== NSH_STABLE_REV) return true;
  }
  return false;
}

/** 仅缺省框架沿用 Tauri；接口或框架重复、错位与非法类型均失败关闭。 */
export function parseInterfaceSelection(source) {
  let section = [];
  let metadataSections = 0;
  const values = new Map();
  for (const statement of statements(source)) {
    if (statement.startsWith("[")) {
      const array = statement.startsWith("[[");
      section = keyPath(statement.slice(array ? 2 : 1, array ? -2 : -1));
      if (equalPath(section, METADATA_TABLE)) {
        if (array || ++metadataSections > 1) throw new UpgradeError("Cargo Harness 接口元数据表重复或类型非法");
      }
      if (["gui-framework", "interfaces", "nsh-targets"].some((key) => equalPath(section, [...METADATA_TABLE, key]))) {
        throw new UpgradeError("Cargo 接口、框架与 NSH 目标必须是值，不能是表");
      }
      continue;
    }
    const separator = statement.indexOf("=");
    if (separator < 0) continue;
    const keys = keyPath(statement.slice(0, separator));
    const fullPath = keys && section ? [...section, ...keys] : null;
    const value = statement.slice(separator + 1).trim();
    for (const key of ["interfaces", "gui-framework", "nsh-targets"]) {
      const wanted = [...METADATA_TABLE, key];
      if (equalPath(fullPath, wanted)) {
        if (values.has(key)) throw new UpgradeError(`Cargo ${key} 元数据重复`);
        values.set(key, value);
      } else if (["gui-framework", "nsh-targets"].includes(key) && keys?.includes(key)) {
        throw new UpgradeError(`Cargo ${key} 必须位于 workspace.metadata.agent-first-harness`);
      } else if (fullPath && fullPath.length < wanted.length && fullPath.every((part, index) => part === wanted[index]) && value.startsWith("{")) {
        throw new UpgradeError("Cargo Harness 接口元数据须使用独立表或点分键，不能使用内联表");
      }
    }
  }
  let interfaces = [];
  if (values.has("interfaces")) {
    const value = values.get("interfaces");
    if (!value.startsWith("[") || !value.endsWith("]")) throw new UpgradeError("Cargo interfaces 必须是字符串数组");
    const members = value.slice(1, -1).trim().replace(/,\s*$/u, "");
    interfaces = members ? members.split(",").map((member) => stringValue(member.trim(), "interfaces")) : [];
    if (interfaces.some((item) => !INTERFACES.has(item)) || new Set(interfaces).size !== interfaces.length) {
      throw new UpgradeError("Cargo interfaces 包含未知或重复接口");
    }
  }
  const framework = values.has("gui-framework") ? stringValue(values.get("gui-framework"), "gui-framework") : "tauri";
  if (!FRAMEWORKS.has(framework)) throw new UpgradeError('Cargo gui-framework 必须是 "tauri" 或旧版 "nsh"；DESKTOP 仅支持 Tauri');
  if (values.has("gui-framework") && !interfaces.includes("gui")) throw new UpgradeError("Cargo gui-framework 只适用于已选择 GUI 的下游");
  if (interfaces.includes("nsh")) {
    if (interfaces.length !== 1 || values.has("gui-framework")) throw new UpgradeError("Cargo NSH 当前必须是独立顶层接口，不能同时声明 GUI 框架");
    const raw = values.get("nsh-targets");
    if (!raw?.startsWith("[") || !raw.endsWith("]")) throw new UpgradeError("Cargo nsh-targets 必须是非空字符串数组");
    const members = raw.slice(1, -1).trim().replace(/,\s*$/u, "");
    const nshTargets = members ? members.split(",").map((member) => stringValue(member.trim(), "nsh-targets")) : [];
    if (nshTargets.includes("tui")) throw new UpgradeError("Cargo NSH TUI 暂不可用；请先迁移到正式 v0.4.0 工具链与受支持目标");
    if (!nshTargets.length || nshTargets.some((target) => !NSH_TARGETS.has(target)) || new Set(nshTargets).size !== nshTargets.length) {
      throw new UpgradeError("Cargo nsh-targets 包含未知或重复目标");
    }
    if (hasNonstableNshRuntime(source)) throw new UpgradeError("Cargo NSH 运行时须先迁移到正式 v0.4.0 固定提交");
    return { interfaces, guiFramework: null, nshTargets };
  }
  if (values.has("nsh-targets")) throw new UpgradeError("Cargo nsh-targets 只适用于顶层 NSH 接口");
  return { interfaces, guiFramework: interfaces.includes("gui") ? framework : null };
}

/** 缺少 Cargo 的既有工程不推断 GUI；现有清单必须是安全的普通文件。 */
export function readInterfaceSelection(root) {
  const file = assertSafePath(root, path.join(root, "Cargo.toml"), "目标接口清单", { finalMayBeMissing: true });
  const stat = lstatOrNull(file);
  if (stat === null) return { interfaces: [], guiFramework: null, manifestSnapshot: null };
  if (!stat.isFile()) throw new UpgradeError("目标 Cargo.toml 必须是普通文件");
  const source = new TextDecoder("utf-8", { fatal: true }).decode(fs.readFileSync(file));
  return { ...parseInterfaceSelection(source), manifestSnapshot: snapshotFile(file) };
}

/** 接口条件资产仅按受保护 Cargo 选择适用，不能由候选目录反向决定框架。 */
export function inapplicableGuiCandidate(relative, selection) {
  // 旧候选即使带有历史所有权声明，也不能重新传播退役的桌面资产。
  if (/^\.agents\/skills\/(?:desktop-[^/]*-gpui-[^/]+|gpui-kit(?:-design-guides)?)(?:\/|$)/u.test(relative)
      || relative === "docs/design_standards/gpui_gui.md") return true;
  const nsh = selection.interfaces.includes("nsh") || selection.guiFramework === "nsh";
  const desktopGraphics = selection.interfaces.includes("gui") || nsh && (!selection.nshTargets || selection.nshTargets.includes("desktop"));
  const cli = selection.interfaces.includes("cli");
  if (relative === "docs/CLI_CONTRACT.md") return !cli;
  if (relative === "docs/GUI_ENGINEERING.md") return !(selection.interfaces.includes("gui") || nsh);
  const skill = /^\.agents\/skills\/([^/]+)(?:\/|$)/u.exec(relative)?.[1];
  if (["desktop-add-cli-adapter", "desktop-build-rust-release", "desktop-prepare-cross-platform-release"].includes(skill)) return !cli;
  if (skill === "desktop-add-mcp-adapter") return !selection.interfaces.includes("mcp");
  if (skill === "desktop-extract-i18n-strings") return selection.guiFramework !== "tauri";
  if (skill === "desktop-collect-release-artifacts") return !(cli || selection.guiFramework === "tauri");
  if (["desktop-add-nsh-adapter", "desktop-build-nsh-release", "desktop-test-nsh-initialization-e2e"].includes(skill)) return !nsh;
  if (skill === "desktop-prepare-gui-support-surfaces") return !(selection.guiFramework === "tauri" || nsh && (!selection.nshTargets || selection.nshTargets.includes("desktop")));
  if (TAURI_SKILLS.has(skill)) return selection.guiFramework !== "tauri";
  if (skill === "desktop-prepare-gui-app-identity") return !desktopGraphics;
  return false;
}
