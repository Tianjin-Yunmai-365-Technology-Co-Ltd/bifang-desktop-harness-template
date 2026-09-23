/** Harness 升级所有权、文件树和共同基线读取。 */

import fs from "node:fs";
import path from "node:path";
import { MINIMUM_OWNERSHIP_RULES, REQUIRED_MANAGED_SOURCE_PATHS, SCHEMA_VERSION, VALID_MODES } from "./harness_upgrade_policy.mjs";
import { UpgradeError, loadJson, safeRelativePath, snapshotFile, validateSnapshot } from "./harness_upgrade_safety.mjs";

function lstatOrNull(value) {
  try { return fs.lstatSync(value); } catch (error) { if (error?.code === "ENOENT") return null; throw error; }
}

function globRegex(pattern) {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*") { while (pattern[index + 1] === "*") index += 1; source += ".*"; }
    else if (character === "?") source += ".";
    else if (character === "[") {
      let closing = index + 1;
      if (pattern[closing] === "!") closing += 1;
      if (pattern[closing] === "]") closing += 1;
      while (closing < pattern.length && pattern[closing] !== "]") closing += 1;
      if (closing >= pattern.length) source += "\\[";
      else {
        let content = pattern.slice(index + 1, closing);
        const negated = content.startsWith("!");
        if (negated) content = content.slice(1);
        content = content.replaceAll("\\", "\\\\").replaceAll("]", "\\]").replaceAll("[", "\\[");
        if (content.startsWith("^")) content = `\\${content}`;
        const characterClass = `[${negated ? "^" : ""}${content}]`;
        try { new RegExp(characterClass, "u"); source += characterClass; } catch { source += "(?!)"; }
        index = closing;
      }
    }
    else source += character.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&");
  }
  return new RegExp(`${source}$`, "u");
}

export function matchesPattern(value, pattern) { return globRegex(pattern).test(value); }

/** 加载有序所有权规则；具体规则必须位于兜底规则之前。 */
export function loadOwnership(file) {
  const data = loadJson(file, "所有权 manifest");
  if (data.schema_version !== 1) throw new UpgradeError("所有权 manifest 的 schema_version 必须为 1");
  if (data.default_mode !== "protected") throw new UpgradeError("所有权 manifest 的 default_mode 必须为 protected");
  if (!Array.isArray(data.rules) || !data.rules.length) throw new UpgradeError("所有权 manifest 的 rules 必须是非空列表");
  const rules = [];
  const seen = new Set();
  data.rules.forEach((item, index) => {
    if (!item || Array.isArray(item) || typeof item !== "object" || Object.keys(item).sort().join(",") !== "mode,pattern") throw new UpgradeError(`所有权规则 ${index} 必须包含 pattern/mode`);
    if (typeof item.pattern !== "string" || !item.pattern) throw new UpgradeError(`所有权规则 ${index} 的 pattern 非法`);
    if (seen.has(item.pattern)) throw new UpgradeError(`所有权规则的 pattern 重复：${item.pattern}`);
    if (!VALID_MODES.has(item.mode)) throw new UpgradeError(`所有权规则 ${index} 的 mode 非法：${JSON.stringify(item.mode)}`);
    seen.add(item.pattern); rules.push([item.pattern, item.mode]);
  });
  const observed = new Map(rules);
  for (const [pattern, mode] of MINIMUM_OWNERSHIP_RULES) if (observed.get(pattern) !== mode) throw new UpgradeError(`所有权 manifest 削弱了必需保护：${pattern} 必须为 ${mode}`);
  const selfIndex = rules.findIndex(([pattern, mode]) => pattern === ".agents/skills/desktop-upgrade-harness/**" && mode === "managed-self");
  const genericIndex = rules.findIndex(([pattern, mode]) => pattern === ".agents/skills/**" && mode === "managed");
  if (selfIndex < 0 || genericIndex < 0 || selfIndex >= genericIndex) throw new UpgradeError("managed-self 所有权规则必须位于通用 managed 规则之前");
  for (const required of REQUIRED_MANAGED_SOURCE_PATHS) if (ownershipMode(required, data.default_mode, rules) !== "managed") throw new UpgradeError(`必需传播路径的有效所有权必须保持 managed：${required}`);
  return { defaultMode: data.default_mode, rules };
}

export function ownershipMode(value, defaultMode, rules) {
  for (const [pattern, mode] of rules) if (matchesPattern(value, pattern)) return mode;
  return defaultMode;
}

export function explicitOwnershipModeForNode(value, { isDirectory, rules }) {
  if (isDirectory) for (const [pattern, mode] of rules) if (matchesPattern(`${value}/__harness_node_probe__`, pattern)) return mode;
  for (const [pattern, mode] of rules) if (matchesPattern(value, pattern)) return mode;
  return null;
}

function relativePosix(root, value) { return path.relative(root, value).split(path.sep).join("/"); }

/** 枚举所有节点及普通文件快照，并报告链接、特殊文件和候选 Git 元数据。 */
export function scanTree(root, { targetTree }) {
  const files = {};
  const unsafe = [];
  const nodes = {};
  const visit = (current) => {
    const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"));
    for (const entry of entries) {
      const child = path.join(current, entry.name);
      const relative = relativePosix(root, child);
      if (targetTree && relative === ".git") continue;
      const observed = fs.lstatSync(child);
      nodes[relative] = entry.isDirectory();
      if (observed.isSymbolicLink()) { unsafe.push(relative); continue; }
      if (observed.isDirectory()) {
        if (!targetTree && relative === ".git") unsafe.push(relative); else visit(child);
      } else if (!observed.isFile()) unsafe.push(relative);
      else files[relative] = snapshotFile(child);
    }
  };
  visit(root);
  return { files, unsafe: unsafe.sort(), nodes };
}

/** 读取并严格校验上一版来源锁；缺失表示必须走 bootstrap audit。 */
export function loadLock(file) {
  if (!lstatOrNull(file)) return null;
  const data = loadJson(file, "上游 lock");
  if (data.schema_version !== SCHEMA_VERSION) throw new UpgradeError(`上游 lock 的 schema_version 必须为 ${SCHEMA_VERSION}`);
  if (!data.entries || Array.isArray(data.entries) || typeof data.entries !== "object") throw new UpgradeError("上游 lock 的 entries 必须是 object");
  for (const [rawPath, entry] of Object.entries(data.entries)) {
    if (safeRelativePath(rawPath) !== rawPath || !entry || Array.isArray(entry) || typeof entry !== "object") throw new UpgradeError(`上游 lock entry 非法：${JSON.stringify(rawPath)}`);
    if (Object.keys(entry).sort().join(",") !== "candidate,mode,target") throw new UpgradeError(`${rawPath} 的上游 lock 字段非法`);
    if (!VALID_MODES.has(entry.mode)) throw new UpgradeError(`${rawPath} 的上游 lock mode 非法`);
    validateSnapshot(entry.candidate, `${rawPath}.candidate`); validateSnapshot(entry.target, `${rawPath}.target`);
  }
  return data;
}
