import fs from "node:fs";
import path from "node:path";

import { ROOT, fail, readText, relativePath } from "./core.mjs";
import { parseCargoToml } from "./initialization_toml.mjs";
import { POST_RELEASE_ACTIONS, localPackageSupported, parseAgentPolicyDocument, parseReleaseMetadataArray, policyBodyIsCurrent, validConfirmedAt } from "../../.agents/skills/desktop-switch-post-release-action/scripts/post_release_action.mjs";

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
  const expected = new Set(["schema_version", "confirmed_by", "confirmed_at", "decision_mode", "superpowers", "user_owned_tasks", "parallel_worktree_subagents", "acceptance_smoke", "e2e_hint", "post_release_action"]);
  const actual = new Set(fields.keys());
  const missing = [...expected].filter((key) => !actual.has(key)).sort();
  const extra = [...actual].filter((key) => !expected.has(key)).sort();
  if (missing.length > 0 || extra.length > 0) fail(errors, `Agent policy fields mismatch: missing=${JSON.stringify(missing)}, extra=${JSON.stringify(extra)}`);
  if (fields.get("schema_version") !== "4") fail(errors, "Agent policy schema_version must be 4");
  if (fields.get("decision_mode") !== "reuse_then_infer_then_ask") fail(errors, "Agent policy decision_mode must be reuse_then_infer_then_ask");
  if (requireSourceDefaults && fields.get("superpowers") !== "disabled") fail(errors, "Harness source Agent policy must default superpowers to disabled");
  if (requireSourceDefaults && fields.get("user_owned_tasks") !== "disabled") fail(errors, "Harness source Agent policy must default user_owned_tasks to disabled");
  for (const field of ["post_release_action", "confirmed_by", "confirmed_at"]) {
    if (requireSourceDefaults && fields.get(field) !== "pending") fail(errors, `Harness source Agent policy must leave ${field} pending for downstream confirmation`);
  }
  const preferences = ["superpowers", "user_owned_tasks", "parallel_worktree_subagents", "acceptance_smoke", "e2e_hint"];
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
    } else if (!localPackageSupported(selectedInterfaces, selectedPlatforms)) {
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
    "完成初始化的下游五项能力选择只能是 `enabled` 或 `disabled`",
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
    "完成初始化的下游只接受 `schema_version: 4`",
    "不得猜测旧项目选择",
    "`parallel_worktree_subagents` 只控制当前 Task 内部",
    "日常开发直接实施",
    "显式发布候选构建必须为当前候选解析一次 E2E 选择",
    "post_release_action",
    "local_package",
    "push_release_branch",
  ];
  for (const fragment of requiredBodyFragments) {
    if (!text.includes(fragment)) fail(errors, `Agent policy persistence rule missing in ${relativePath(policyPath)}: ${fragment}`);
  }
  // 运行时 post_release_action helper 拒绝未合并新规则的正文；模板与下游必须通过同一判定。
  if (!policyBodyIsCurrent(text)) fail(errors, `Agent policy body in ${relativePath(policyPath)} is rejected by the post_release_action helper`);
  const example = "Task 8 | 运行中 | 左侧 Task 默认关闭并支持开关";
  if (!text.includes(example) || !isValidSessionProgressTitle(example)) fail(errors, `Agent policy must contain a valid progress title example: ${example}`);
}
