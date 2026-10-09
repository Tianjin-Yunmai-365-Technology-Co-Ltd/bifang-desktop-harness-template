#!/usr/bin/env node
/** 仅更新用户明确选择的单项永久能力，保留发布动作与策略正文。 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ActionError, projectRoot, readPolicy, atomicWrite, withPolicyLock, validConfirmedAt,
} from "../../desktop-switch-post-release-action/scripts/post_release_action.mjs";

export const CAPABILITY_FIELDS = Object.freeze([
  "superpowers", "user_owned_tasks", "parallel_worktree_subagents", "acceptance_smoke", "e2e_hint",
]);

/** 只接受完整 v4 策略，旧 schema 由原发布后动作迁移流程处理。 */
function currentPolicy(root) {
  const policy = readPolicy(root, { validateActionSupport: false });
  if (policy.schema !== "4") throw new ActionError("能力配置要求 schema_version: 4；先完成专用迁移");
  return policy;
}

/** 返回可复核的能力和确认事实，不写入文件或创建锁。 */
function state(policy) {
  return {
    schema_version: 4,
    capabilities: Object.fromEntries(CAPABILITY_FIELDS.map((field) => [field, policy.fields.get(field)])),
    post_release_action: policy.fields.get("post_release_action"),
    confirmed_by: policy.fields.get("confirmed_by"),
    confirmed_at: policy.fields.get("confirmed_at"),
  };
}

/** 检查当前已确认策略，不因缺少无关打包资源阻断能力读取。 */
export function inspect(root) { return state(currentPolicy(projectRoot(root))); }

/** 限定确认来源为非空普通标量，避免换行或 YAML 控制字符注入。 */
function validateConfirmation(by, at) {
  if (typeof by !== "string" || by !== by.trim() || !by || /^[?@`-]/u.test(by) || /[\x00-\x1f\x7f:#{}\[\]"'!&*|>]/u.test(by)
    || /^(?:pending|unknown|unset|n\/a)$/iu.test(by)) throw new ActionError("confirmed_by 必须是真实非空普通标量来源");
  if (typeof at !== "string" || !validConfirmedAt(at)) throw new ActionError("confirmed_at 必须是合法 ISO 日期或时间戳");
}

/** 在共享锁内核对旧值，只替换所选字段与本次确认元数据。 */
export function setCapability(rawRoot, { field, value, expectedValue, confirmedBy, confirmedAt, confirmedChoice = false }) {
  if (!confirmedChoice) throw new ActionError("写入要求 --confirmed-user-choice");
  if (!CAPABILITY_FIELDS.includes(field)) throw new ActionError("field 只能是五项能力；发布后动作使用专用入口");
  if (![value, expectedValue].every((item) => ["enabled", "disabled"].includes(item))) throw new ActionError("value 和 expected-value 必须是 enabled 或 disabled");
  validateConfirmation(confirmedBy, confirmedAt);
  const root = projectRoot(rawRoot);
  return withPolicyLock(root, () => {
    const policy = currentPolicy(root);
    const previous = policy.fields.get(field);
    if (previous !== expectedValue) throw new ActionError("能力旧值已变化；重新读取并确认，不覆盖漂移");
    if (previous === value) return { ...state(policy), changed: false, field, previous_value: previous };
    const replacements = new Map([[field, value], ["confirmed_by", confirmedBy], ["confirmed_at", confirmedAt]]);
    const lines = policy.lines.map((line) => {
      const key = line.slice(0, line.indexOf(":"));
      return replacements.has(key) ? `${key}: ${replacements.get(key)}` : line;
    });
    const body = policy.normalized.slice(policy.normalized.indexOf("\n---\n", 4) + 5);
    atomicWrite(policy, `---\n${lines.join("\n")}\n---\n${body}`.replaceAll("\n", policy.newline));
    const verified = inspect(root);
    if (verified.capabilities[field] !== value || verified.post_release_action !== policy.fields.get("post_release_action")) {
      throw new ActionError("能力更新后复读不一致");
    }
    return { ...verified, changed: true, field, previous_value: previous };
  });
}

/** 严格读取单次命令，不接受重复参数、未知字段或缺少参数值。 */
export function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const keys = command === "set"
    ? ["--project-root", "--field", "--value", "--expected-value", "--confirmed-by", "--confirmed-at", "--confirmed-user-choice"]
    : ["--project-root"];
  if (!["inspect", "check", "set"].includes(command)) throw new ActionError("命令只能是 inspect、check 或 set");
  const values = new Map();
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    if (!keys.includes(key) || values.has(key)) throw new ActionError("未知或重复参数");
    if (key === "--confirmed-user-choice") { values.set(key, true); continue; }
    const value = rest[++index];
    if (typeof value !== "string" || value.startsWith("--")) throw new ActionError("参数缺少值");
    values.set(key, value);
  }
  if (keys.some((key) => !values.has(key))) throw new ActionError("缺少必需参数");
  return command === "set" ? setCapability(values.get("--project-root"), {
    field: values.get("--field"), value: values.get("--value"), expectedValue: values.get("--expected-value"),
    confirmedBy: values.get("--confirmed-by"), confirmedAt: values.get("--confirmed-at"), confirmedChoice: values.get("--confirmed-user-choice"),
  }) : inspect(values.get("--project-root"));
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(main())}\n`); }
  catch (error) { process.stderr.write(`${JSON.stringify({ error: error.message })}\n`); process.exitCode = 2; }
}
