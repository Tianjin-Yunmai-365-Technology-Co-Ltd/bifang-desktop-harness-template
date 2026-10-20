#!/usr/bin/env node
/** 只读计算初始化下一问和待确认汇总；不保存会话、不安装工具、不创建目录或 Git 状态。 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { resolveProjectTarget } from "./resolve_project_target.mjs";
import { BASE_FIELDS, DESKTOP_FIELDS, GUI_FIELDS, POLICY_FIELDS, POLICY_PRESET, QUESTIONS, REVIEW_QUESTION, questionFor, summaryNotices } from "./initialization_questions.mjs";

/** 拒绝无法解释的状态形状，不把产品字段、凭据或任意配置带入汇总。 */
function exactKeys(object, allowed, label) {
  if (!object || Array.isArray(object) || typeof object !== "object") throw new Error(`${label} 必须是对象`);
  if (Object.keys(object).some((key) => !allowed.includes(key))) throw new Error(`${label} 含未知字段`);
}

/** 标准化显式默认/跳过，缺失答案始终待问；不做模型式近似匹配。 */
function parseAnswer(id, answer) {
  exactKeys(answer, ["value", "source", "basedOn"], "答案");
  if (typeof answer.source !== "string" || !/^(user|project|translation):\S/u.test(answer.source) || /[\x00-\x1f\x7f\u2028\u2029]/u.test(answer.source)) throw new Error("答案必须记录单行 user:/project:/translation: 确认来源");
  if (answer.source.startsWith("translation:") && !["name_zh", "name_en"].includes(id)) throw new Error("只有展示名称允许翻译来源");
  if (answer.source.startsWith("translation:") ? typeof answer.basedOn !== "string" : answer.basedOn !== undefined) throw new Error("翻译答案必须且只能附带原名 basedOn");
  const definition = questionFor(id);
  let value = answer.value;
  if (["name_zh", "name_en"].includes(id) && typeof value === "string" && !value.trim()) return { missing: true };
  if (value === "default" || value === "skip" || value === "") {
    if (definition.defaultValue === undefined || (value === "" && !["gui_framework", "sidebar_mode"].includes(id))) return { issue: "该字段须明确提供合法值；空白不是确认。" };
    value = structuredClone(definition.defaultValue);
  }
  if (definition.values) {
    if (["target_platforms", "interfaces"].includes(id)) {
      if (!Array.isArray(value) || value.length === 0 || value.some((item) => !definition.values.includes(item))) return { issue: "须选择至少一个合法选项。" };
      value = definition.values.filter((item) => value.includes(item));
    } else if (!definition.values.includes(value)) return { issue: "须从列出的选项中明确选择。" };
  } else if (typeof value !== "string" || !value.trim() || /[\x00-\x1f\x7f\u2028\u2029]/u.test(value)) return { issue: "须提供非空单行文本。" };
  if (id === "project_id" && !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u.test(value)) return { issue: "项目标识必须是 ASCII snake_case。" };
  return { value, source: answer.source };
}

/** 本地打包适用性只由接口、框架与目标共同决定；框架未解时返回待校验。 */
export function localPackageAvailability(values) {
  if (values.interfaces.includes("cli")) return "available";
  if (!values.interfaces.includes("gui")) return "unavailable";
  if (!values.gui_framework) return "pending";
  return values.gui_framework === "gpui" || values.target_platforms.some((platform) => ["macos", "windows"].includes(platform)) ? "available" : "unavailable";
}

/** 按当前框架/平台标注不可用能力；用户显式启用时仍须纠正，不能覆盖答案。 */
function unavailableGuiFields(values) {
  if (values.gui_framework !== "gpui") return [];
  return values.target_platforms.includes("linux") ? ["system_tray", "deep_link", "global_shortcut"] : ["deep_link"];
}

/** 计算问题或汇总；答案可以批量到达，合法值只解析一次并保留来源。 */
export function evaluateInitializationForm(input) {
  exactKeys(input, ["schemaVersion", "entry", "harnessRoot", "currentRoot", "answers", "confirmation"], "表单输入");
  if (input.schemaVersion !== 1) throw new Error("表单 schemaVersion 必须为 1");
  const entry = input.entry ?? "instantiate";
  if (!["instantiate", "initialize"].includes(entry)) throw new Error("未知初始化入口");
  const answers = input.answers ?? {};
  exactKeys(answers, QUESTIONS.map(({ id }) => id), "answers");
  const values = {};
  const sources = {};
  const issues = {};
  for (const [id, answer] of Object.entries(answers)) {
    const result = parseAnswer(id, answer);
    if (result.missing) continue;
    if (result.issue) issues[id] = result.issue;
    else { values[id] = result.value; sources[id] = result.source; }
  }
  if (entry === "initialize") {
    if (typeof input.currentRoot !== "string" || !path.isAbsolute(input.currentRoot)) throw new Error("直接初始化必须提供已核实的绝对 currentRoot");
    if (!fs.statSync(input.currentRoot).isDirectory()) throw new Error("currentRoot 不是现有目录");
    if (fs.existsSync(path.join(input.currentRoot, "Version.md")) && fs.existsSync(path.join(input.currentRoot, ".agents/skills/desktop-instantiate-project/SKILL.md"))) throw new Error("Harness 源必须使用实例化入口");
    const currentRoot = fs.realpathSync(input.currentRoot);
    if (Object.hasOwn(answers, "project_path")) {
      if (!values.project_path) throw new Error("直接初始化不能覆盖非法路径答案");
      const requested = path.resolve(input.currentRoot, values.project_path);
      if ((fs.existsSync(requested) ? fs.realpathSync(requested) : requested) !== currentRoot) throw new Error("直接初始化不能更换既定项目根目录");
    }
    values.project_path = currentRoot;
    sources.project_path = "project:currentRoot";
    delete issues.project_path;
  }
  const output = (stage, ids = [], extra = {}) => ({
    schemaVersion: 1, stage, values: { ...values }, sources: { ...sources },
    questions: ids.map((id) => {
      const question = questionFor(id, issues[id]);
      if (id === "post_release_action" && values.interfaces && values.target_platforms) {
        question.localPackage = localPackageAvailability(values);
        if (question.localPackage === "unavailable") question.options[0] = "本地打包（推荐默认，当前组合不可用）";
        if (question.localPackage === "pending") question.help += " GUI 框架解析后再校验本地打包适用性。";
      }
      if (id === "deep_link" && values.project_id) question.help = question.help.replace("<kebab-prefix>", values.project_id.replaceAll("_", "-"));
      return question;
    }), ...extra,
  });
  for (const id of ["name_zh", "name_en"]) {
    const original = id === "name_zh" ? "name_en" : "name_zh";
    if (sources[id]?.startsWith("translation:") && answers[id].basedOn !== values[original]) {
      delete values[id]; delete sources[id];
    }
  }
  // 只缺一个译名时不向用户重问；翻译在基础字段收齐后由 Agent 补齐。
  const hasName = ["name_zh", "name_en"].some((id) => values[id] && (sources[id].startsWith("user:") || (entry === "initialize" && sources[id].startsWith("project:"))));
  if (!hasName && ["name_zh", "name_en"].some((id) => values[id])) throw new Error("至少一个展示名称须来自用户；直接初始化可复用已确认的项目名称");
  let target;
  if (values.project_id && values.project_path) {
    try {
      target = entry === "instantiate" ? resolveProjectTarget(input.harnessRoot, values.project_path, values.project_id) : { targetRoot: values.project_path, targetState: "existing-initialize-root" };
    } catch { issues.project_path = "路径解析或最终目录安全检查失败；请用路径 helper 核对并修正。"; delete values.project_path; }
  }
  if (values.interfaces && values.target_platforms && values.post_release_action === "local_package" && localPackageAvailability(values) === "unavailable") {
    issues.post_release_action = "此接口/平台组合的本地打包不可用；请选择提交远程，或明确修改接口/平台。";
    delete values.post_release_action;
  }
  const missingBase = BASE_FIELDS.filter((id) => !values[id] && !(hasName && ["name_zh", "name_en"].includes(id) && !issues[id]));
  if (missingBase.length) return output("base", missingBase);
  if (!hasName) throw new Error("至少一个展示名称必须来自用户或已确认项目事实");
  const translated = ["name_zh", "name_en"].filter((id) => !values[id]);
  if (translated.length) return output("translation", [], { translate: translated });
  const gui = values.interfaces.includes("gui");
  if (!gui && ["gui_framework", ...GUI_FIELDS, "capability_setup_assistance"].some((id) => Object.hasOwn(answers, id))) {
    issues.interfaces = "未选择 GUI 却提供了 GUI 条件答案；请确认接口组合，或撤下旧 GUI 答案。";
    return output("base", ["interfaces"]);
  }
  if (gui && !values.gui_framework) return output("framework", ["gui_framework"]);
  if (values.policy_mode === "recommended") {
    const conflicts = POLICY_FIELDS.filter((id) => issues[id] || (values[id] && values[id] !== POLICY_PRESET[id]));
    if (conflicts.length) {
      issues.policy_mode = `推荐预设与显式字段冲突：${conflicts.join(", ")}；请保留预设并撤回冲突值，或选择自定义保留已给答案。`;
      return output("policy", ["policy_mode"]);
    }
    for (const id of POLICY_FIELDS) {
      if (!values[id]) { values[id] = POLICY_PRESET[id]; sources[id] = `preset:${sources.policy_mode}`; }
    }
  } else {
    const next = POLICY_FIELDS.find((id) => !values[id]);
    if (next) return output("policy", [next]);
  }
  const unavailable = gui ? unavailableGuiFields(values) : [];
  if (gui) {
    for (const id of unavailable) {
      if (issues[id] || (values[id] && values[id] !== "disabled")) {
        issues[id] = "当前 GPUI 框架/目标组合不支持此能力；须明确关闭，或修改框架/目标。";
        return output("gui", [id], { unavailable });
      }
      if (!values[id]) { values[id] = "disabled"; sources[id] = "capability:unavailable"; }
    }
    if (values.deep_link === "enabled" && values.single_instance === "disabled") {
      issues.deep_link = "深链接启用必须同时启用单实例；请明确启用两者，或保持两者禁用。";
      return output("gui", ["deep_link"], { unavailable });
    }
    const next = GUI_FIELDS.find((id) => !values[id]);
    if (next) return output("gui", [next], { unavailable });
    const enabledDesktop = DESKTOP_FIELDS.filter((id) => values[id] === "enabled");
    if (enabledDesktop.length && !values.capability_setup_assistance) return output("assistance", ["capability_setup_assistance"], { enabledDesktop, unavailable });
    if (!enabledDesktop.length) { delete values.capability_setup_assistance; delete sources.capability_setup_assistance; }
  } else {
    for (const id of ["gui_framework", ...GUI_FIELDS, "capability_setup_assistance"]) { delete values[id]; delete sources[id]; }
  }
  const notices = summaryNotices(values);
  const summary = { entry, values, sources, target, kebabPrefix: values.project_id.replaceAll("_", "-"), unavailable, notices };
  // 与键插入顺序无关；答案、来源、目标或合同变化都会使此前确认失效。
  const canonical = Object.keys(values).sort().map((id) => [id, values[id], sources[id]]);
  const summaryDigest = createHash("sha256").update(JSON.stringify({ contract: QUESTIONS, review: REVIEW_QUESTION, preset: POLICY_PRESET, entry, canonical, target, unavailable, notices })).digest("hex");
  let confirmed = false;
  if (input.confirmation !== undefined) {
    exactKeys(input.confirmation, ["digest", "source"], "confirmation");
    confirmed = input.confirmation.digest === summaryDigest && typeof input.confirmation.source === "string" && /^user:\S/u.test(input.confirmation.source) && !/[\x00-\x1f\x7f\u2028\u2029]/u.test(input.confirmation.source);
  }
  return output(confirmed ? "confirmed" : "review", [], { summary, summaryDigest, reviewQuestion: structuredClone(REVIEW_QUESTION) });
}

/** CLI 只接受标准输入 JSON 或输出问句目录，正常和错误均为单行 JSON。 */
export function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({ args: argv, options: { catalog: { type: "boolean" } }, strict: true });
  return values.catalog ? QUESTIONS.map(({ id }) => questionFor(id)) : evaluateInitializationForm(JSON.parse(fs.readFileSync(0, "utf8")));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.stdout.write(`${JSON.stringify(main())}\n`); }
  catch { process.stderr.write(`${JSON.stringify({ status: "error", code: "invalid_initialization_form", message: "表单输入非法；请按 initialization-form.md 检查字段、枚举、来源与 schema。" })}\n`); process.exitCode = 2; }
}
