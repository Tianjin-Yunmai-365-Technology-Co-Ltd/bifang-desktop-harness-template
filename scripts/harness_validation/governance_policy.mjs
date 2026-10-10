import fs from "node:fs";
import path from "node:path";

import { ROOT, fail, readText, relativePath } from "./core.mjs";
import { parseCargoToml } from "./initialization_toml.mjs";
import { POST_RELEASE_ACTIONS, localPackageSupported, parseAgentPolicyDocument, parseReleaseGuiFramework, parseReleaseMetadataArray, policyBodyIsCurrent, validConfirmedAt } from "../../.agents/skills/desktop-switch-post-release-action/scripts/post_release_action.mjs";

export const SESSION_PROGRESS_TITLE_TEMPLATE = "Task {序号} | {当前进度} | {单一结果}";
export const SESSION_PROGRESS_TITLE_INITIAL = "Task {序号} | 已分配 | {单一结果}";
const SESSION_PROGRESS_STATES = ["已分配", "运行中", "检查中", "已完成"];
const SESSION_PROGRESS_TITLE_PATTERN = new RegExp(`^Task (?<sequence>[1-9][0-9]*) \\| (?<progress>${SESSION_PROGRESS_STATES.join("|")}) \\| (?<singleResult>[^|\\r\\n]+)$`, "u");

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

export const USER_HARD_RULE_REQUIRED_FRAGMENTS = [
  "每次开工先完整读取用户级 `AGENTS.md`",
  "不再用历史全局 Task Tree 要求绕过项目选择",
  "$desktop-task-workflow",
  "自动创建左侧子会话只取本项目已记录的 `user_owned_tasks`",
  "默认关闭",
  "`task_worktrees`：仅选择 Git Task 环境",
];

/** 解析满足 user-owned Task 三字段与空白边界的标题；不合法时返回 null。 */
function parseSessionProgressTitle(title) {
  if (typeof title !== "string") return null;
  const match = SESSION_PROGRESS_TITLE_PATTERN.exec(title);
  return match?.groups?.singleResult && match.groups.singleResult === match.groups.singleResult.trim() ? match.groups : null;
}

/** 判断标题是否满足 user-owned Task 三字段与空白边界。 */
export function isValidSessionProgressTitle(title) {
  return parseSessionProgressTitle(title) !== null;
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
    const parsed = parseSessionProgressTitle(record.title);
    if (parsed) highest = Math.max(highest, Number(parsed.sequence));
  }
  return Array.from({ length: count }, (_, index) => highest + index + 1);
}

function persistedReleaseMetadata(policyPath, errors) {
  const manifestPath = path.join(path.dirname(path.dirname(policyPath)), "Cargo.toml");
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const source = readText(manifestPath);
    parseCargoToml(source);
    return {
      interfaces: parseReleaseMetadataArray(source, "interfaces"),
      "target-platforms": parseReleaseMetadataArray(source, "target-platforms"),
      "gui-framework": parseReleaseGuiFramework(source),
    };
  } catch (error) {
    fail(errors, `cannot inspect persisted interface/platform metadata for post_release_action: ${error.message}`);
    return null;
  }
}

/** 校验持久 Agent 策略、发布后动作、接口组合、确认元数据与 Task 语义。 */
export function validateAgentPolicy(errors, policyPath = path.join(ROOT, "docs", "AGENT_POLICY.md"), { allowPending = true, requireSourceDefaults = false, interfaces = null, targetPlatforms = null } = {}) {
  if (!fs.existsSync(policyPath)) {
    fail(errors, `missing Agent policy: ${relativePath(policyPath)}`);
    return;
  }
  const text = readText(policyPath);
  let fields;
  try { fields = parseAgentPolicyDocument(text).fields; }
  catch (error) {
    fail(errors, `invalid Agent policy frontmatter ${relativePath(policyPath)}: ${error.message}`);
    return;
  }
  const expected = new Set(["schema_version", "confirmed_by", "confirmed_at", "decision_mode", "superpowers", "user_owned_tasks", "task_worktrees", "parallel_worktree_subagents", "acceptance_smoke", "e2e_hint", "post_release_action"]);
  const actual = new Set(fields.keys());
  const missing = [...expected].filter((key) => !actual.has(key)).sort();
  const extra = [...actual].filter((key) => !expected.has(key)).sort();
  if (missing.length > 0 || extra.length > 0) fail(errors, `Agent policy fields mismatch: missing=${JSON.stringify(missing)}, extra=${JSON.stringify(extra)}`);
  if (fields.get("schema_version") !== "5") fail(errors, "Agent policy schema_version must be 5");
  if (fields.get("decision_mode") !== "reuse_then_infer_then_ask") fail(errors, "Agent policy decision_mode must be reuse_then_infer_then_ask");
  if (requireSourceDefaults && fields.get("superpowers") !== "disabled") fail(errors, "Harness source Agent policy must default superpowers to disabled");
  if (requireSourceDefaults && fields.get("user_owned_tasks") !== "disabled") fail(errors, "Harness source Agent policy must default user_owned_tasks to disabled");
  if (requireSourceDefaults && fields.get("task_worktrees") !== "disabled") fail(errors, "Harness source Agent policy must default task_worktrees to disabled");
  for (const field of ["post_release_action", "confirmed_by", "confirmed_at"]) {
    if (requireSourceDefaults && fields.get(field) !== "pending") fail(errors, `Harness source Agent policy must leave ${field} pending for downstream confirmation`);
  }
  const preferences = ["superpowers", "user_owned_tasks", "task_worktrees", "parallel_worktree_subagents", "acceptance_smoke", "e2e_hint"];
  for (const field of preferences) {
    const value = fields.get(field);
    if (!["enabled", "disabled", "pending"].includes(value)) fail(errors, `Agent policy ${field} must be enabled, disabled, or pending`);
    else if (!allowPending && value === "pending") fail(errors, `initialized downstream Agent policy must resolve ${field}`);
  }
  const postReleaseAction = fields.get("post_release_action");
  if (!["pending", ...POST_RELEASE_ACTIONS].includes(postReleaseAction)) {
    fail(errors, "Agent policy post_release_action must be pending, local_package, or push_release_branch");
  } else if (!allowPending && postReleaseAction === "pending") {
    fail(errors, "initialized downstream Agent policy must resolve post_release_action");
  }
  if (!allowPending && postReleaseAction === "local_package") {
    const metadata = persistedReleaseMetadata(policyPath, errors);
    const selectedInterfaces = interfaces ?? metadata?.interfaces ?? null;
    const selectedPlatforms = targetPlatforms ?? metadata?.["target-platforms"] ?? null;
    if (!Array.isArray(selectedInterfaces) || selectedInterfaces.length === 0 || !Array.isArray(selectedPlatforms)) {
      fail(errors, "local_package requires persisted interfaces and target-platforms metadata");
    } else if (!localPackageSupported(selectedInterfaces, selectedPlatforms, metadata?.["gui-framework"] ?? "tauri")) {
      fail(errors, "local_package requires CLI or GUI with a macOS/Windows target; otherwise select push_release_branch");
    }
  }
  for (const field of ["confirmed_by", "confirmed_at"]) {
    if (!fields.get(field)) fail(errors, `Agent policy ${field} must not be empty`);
  }
  if (!allowPending) {
    const confirmedBy = (fields.get("confirmed_by") ?? "").trim();
    const confirmedAt = (fields.get("confirmed_at") ?? "").trim();
    if (["pending", "unknown", "unset", "n/a"].includes(confirmedBy.toLowerCase())) fail(errors, "initialized downstream Agent policy confirmed_by must identify a real confirmation source");
    if (["pending", "unknown", "unset", "n/a"].includes(confirmedAt.toLowerCase())) fail(errors, "initialized downstream Agent policy confirmed_at must be resolved");
    else if (!validConfirmedAt(confirmedAt)) fail(errors, "initialized downstream Agent policy confirmed_at must be a calendar-valid ISO date or RFC3339 timestamp");
  }

  const requiredBodyFragments = [
    ...USER_HARD_RULE_REQUIRED_FRAGMENTS,
    "完成初始化的下游六项能力选择只能是 `enabled` 或 `disabled`",
    "## 用户可见 Task 开关、粒度与创建门禁",
    "../.agents/skills/desktop-task-workflow/SKILL.md",
    "推荐预设确定性物化六项",
    "migrate-task-worktrees", "selection_required",
    "日常开发直接实施",
    "显式发布候选构建必须为当前候选解析一次 E2E 选择",
    "post_release_action", "local_package", "push_release_branch",
  ];
  for (const fragment of requiredBodyFragments) {
    if (!text.includes(fragment)) fail(errors, `Agent policy persistence rule missing in ${relativePath(policyPath)}: ${fragment}`);
  }
  // 运行时 post_release_action helper 拒绝未合并新规则的正文；模板与下游必须通过同一判定。
  if (!policyBodyIsCurrent(text)) fail(errors, `Agent policy body in ${relativePath(policyPath)} is rejected by the post_release_action helper`);

}
