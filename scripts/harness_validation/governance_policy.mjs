import fs from "node:fs";
import path from "node:path";

import { ROOT, fail, readText, relativePath } from "./core.mjs";

export const SESSION_PROGRESS_TITLE_TEMPLATE = "Task {序号} | {当前进度} | {单一结果}";
export const SESSION_PROGRESS_TITLE_INITIAL = "Task {序号} | 已分配 | {单一结果}";
export const SESSION_PROGRESS_STATES = ["已分配", "运行中", "检查中", "已完成"];
const SESSION_PROGRESS_TITLE_PATTERN = /^Task (?<sequence>[1-9][0-9]*) \| (?<progress>已分配|运行中|检查中|已完成) \| (?<singleResult>[^|\r\n]+)$/u;

export const PROJECT_TASK_SEQUENCE_REQUIRED_FRAGMENTS = [
  "`hostId`",
  "`projectId`",
  "`list_threads`",
  "归档",
  "最大有效序号",
  "空历史",
  "缺号不回填",
  "内部 Subagent",
];

/** 判断标题是否满足 user-owned Task 三字段与空白边界。 */
export function isValidSessionProgressTitle(title) {
  if (typeof title !== "string") return false;
  const match = SESSION_PROGRESS_TITLE_PATTERN.exec(title);
  return Boolean(match?.groups?.singleResult && match.groups.singleResult === match.groups.singleResult.trim());
}

/** 按同宿主和项目的全部合法标题分配连续递增序号。 */
export function allocateProjectTaskSequences(records, { hostId, projectId, count = 1 }) {
  for (const [field, value] of [["hostId", hostId], ["projectId", projectId]]) {
    if (typeof value !== "string" || !value || value !== value.trim()) throw new TypeError(`${field} must be a non-empty trimmed string`);
  }
  if (!Number.isInteger(count) || count <= 0) throw new TypeError("count must be a positive integer");
  let highest = 0;
  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record)) continue;
    if (record.kind !== "codex" || record.hostId !== hostId || record.projectId !== projectId) continue;
    const match = typeof record.title === "string" ? SESSION_PROGRESS_TITLE_PATTERN.exec(record.title) : null;
    if (match && isValidSessionProgressTitle(record.title)) highest = Math.max(highest, Number(match.groups.sequence));
  }
  return Array.from({ length: count }, (_, index) => highest + index + 1);
}

function parsePolicyFrontmatter(text, errors, policyPath) {
  const normalized = text.replaceAll("\r\n", "\n");
  if (!normalized.startsWith("---\n")) {
    fail(errors, `missing Agent policy YAML frontmatter: ${relativePath(policyPath)}`);
    return null;
  }
  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0) {
    fail(errors, `missing Agent policy YAML frontmatter: ${relativePath(policyPath)}`);
    return null;
  }
  const fields = new Map();
  for (const line of normalized.slice(4, end).split("\n")) {
    const separator = line.indexOf(":");
    const key = separator >= 0 ? line.slice(0, separator).trim() : "";
    if (separator < 0 || !key) {
      fail(errors, `invalid Agent policy frontmatter line: ${line}`);
      continue;
    }
    if (fields.has(key)) {
      fail(errors, `duplicate Agent policy field: ${key}`);
      continue;
    }
    fields.set(key, line.slice(separator + 1).trim());
  }
  return fields;
}

function validIsoDate(value) {
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }
  if (!/^\d{4}-\d{2}-\d{2}T/u.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

/** 校验九字段持久 Agent 策略、值域、确认元数据与 Task 语义。 */
export function validateAgentPolicy(errors, policyPath = path.join(ROOT, "docs", "AGENT_POLICY.md"), { allowPending = true, requireSourceDefaults = false } = {}) {
  if (!fs.existsSync(policyPath)) {
    fail(errors, `missing Agent policy: ${relativePath(policyPath)}`);
    return;
  }
  const text = readText(policyPath);
  const fields = parsePolicyFrontmatter(text, errors, policyPath);
  if (!fields) return;
  const expected = new Set(["schema_version", "confirmed_by", "confirmed_at", "decision_mode", "superpowers", "user_owned_tasks", "parallel_worktree_subagents", "acceptance_smoke", "e2e_hint"]);
  const actual = new Set(fields.keys());
  const missing = [...expected].filter((key) => !actual.has(key)).sort();
  const extra = [...actual].filter((key) => !expected.has(key)).sort();
  if (missing.length > 0 || extra.length > 0) fail(errors, `Agent policy fields mismatch: missing=${JSON.stringify(missing)}, extra=${JSON.stringify(extra)}`);
  if (fields.get("schema_version") !== "3") fail(errors, "Agent policy schema_version must be 3");
  if (fields.get("decision_mode") !== "reuse_then_infer_then_ask") fail(errors, "Agent policy decision_mode must be reuse_then_infer_then_ask");
  if (requireSourceDefaults && fields.get("superpowers") !== "disabled") fail(errors, "Harness source Agent policy must default superpowers to disabled");
  if (requireSourceDefaults && fields.get("user_owned_tasks") !== "disabled") fail(errors, "Harness source Agent policy must default user_owned_tasks to disabled");
  const preferences = ["superpowers", "user_owned_tasks", "parallel_worktree_subagents", "acceptance_smoke", "e2e_hint"];
  for (const field of preferences) {
    const value = fields.get(field);
    if (!["enabled", "disabled", "pending"].includes(value)) fail(errors, `Agent policy ${field} must be enabled, disabled, or pending`);
    else if (!allowPending && value === "pending") fail(errors, `initialized downstream Agent policy must resolve ${field}`);
  }
  for (const field of ["confirmed_by", "confirmed_at"]) {
    if (!fields.get(field)) fail(errors, `Agent policy ${field} must not be empty`);
  }
  if (!allowPending) {
    const confirmedBy = (fields.get("confirmed_by") ?? "").trim();
    const confirmedAt = (fields.get("confirmed_at") ?? "").trim();
    if (["pending", "unknown", "unset", "n/a"].includes(confirmedBy.toLowerCase())) fail(errors, "initialized downstream Agent policy confirmed_by must identify a real confirmation source");
    if (["pending", "unknown", "unset", "n/a"].includes(confirmedAt.toLowerCase())) fail(errors, "initialized downstream Agent policy confirmed_at must be resolved");
    else if (!validIsoDate(confirmedAt)) fail(errors, "initialized downstream Agent policy confirmed_at must be a calendar-valid ISO date or RFC3339 timestamp");
  }

  const requiredBodyFragments = [
    "完成初始化的下游五项选择只能是 `enabled` 或 `disabled`",
    "`user_owned_tasks`：控制是否由 Agent 自动把新结果拆到 Codex 左侧菜单",
    "`user_owned_tasks: disabled` 是默认状态",
    "用户仍可明确要求创建左侧 Task",
    "`enabled` 是长期授权",
    "一个用户可见 Task 只对应一个明确、可验收的结果",
    "交付物类型变化、生命周期阶段变化",
    "每个项目同一时间只允许一个写入型 active 用户可见 Task",
    "Task0 可以协调和派发，但不得代替实施 Task 写入",
    "Git 项目固定选择",
    "environment.type = worktree",
    "非 Git 项目固定使用同一 project target 与 `environment.type = local`",
    "只返回 `clientThreadId` 表示仍在 setup",
    "保持零实现",
    "取得真实 `threadId`",
    "核对该 id 的标题、`projectId`、cwd 和状态",
    "核对工作区干净及起始提交正确",
    `\`${SESSION_PROGRESS_TITLE_TEMPLATE}\``,
    `title="${SESSION_PROGRESS_TITLE_INITIAL}"`,
    "不识别任何历史标题格式",
    ...PROJECT_TASK_SEQUENCE_REQUIRED_FRAGMENTS,
    "内部 Subagent 不使用本标题合同、不占用 Task 序号",
    "推荐预设确定性物化五项",
    "`parallel_worktree_subagents: disabled`、`acceptance_smoke: enabled`",
    "`user_owned_tasks: disabled`",
    "开启左侧 Task",
    "关闭左侧 Task",
    "不兼容、不推断任何更早 schema 或缺少字段的旧形态",
    "`parallel_worktree_subagents` 只控制当前 Task 内部",
    "日常开发直接实施",
    "显式发布候选构建必须为当前候选解析一次 E2E 选择",
  ];
  for (const fragment of requiredBodyFragments) {
    if (!text.includes(fragment)) fail(errors, `Agent policy persistence rule missing in ${relativePath(policyPath)}: ${fragment}`);
  }
  const example = "Task 8 | 运行中 | 左侧 Task 默认关闭并支持开关";
  if (!text.includes(example) || !isValidSessionProgressTitle(example)) fail(errors, `Agent policy must contain a valid progress title example: ${example}`);
}
