#!/usr/bin/env node
/** 只读计算初始化下一问和待确认汇总；不保存会话、不安装工具、不创建目录或 Git 状态。 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { resolveProjectTarget } from "./resolve_project_target.mjs";
import { validNshIdentity } from "../../desktop-add-nsh-adapter/scripts/nsh_runtime_revision.mjs";
import { BASE_FIELDS, DESKTOP_FIELDS, GUI_FIELDS, NSH_PLATFORM_ORDER, NSH_TARGET_PLATFORMS, POLICY_FIELDS, POLICY_PRESET, QUESTIONS, REVIEW_QUESTION, questionFor, summaryNotices } from "./initialization_questions.mjs";

const NSH_DESKTOP_QUESTIONS = ["system_tray", "single_instance", "deep_link", "about_page", "sponsor_page", "sidebar_mode"];
const NSH_FIXED_OFF_HELP = {
  system_notification: "NSH 提供官方通知 API，由下游按产品需求及目标平台接入。",
  autostart: "NSH 0.5.0 尚无官方开机自启 API。",
  global_shortcut: "NSH 提供官方全局快捷键 API，由下游按实际动作及目标平台接入。",
};
const NSH_FIXED_OFF = Object.keys(NSH_FIXED_OFF_HELP);

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
  const definition = id === "target_platforms" ? { values: NSH_PLATFORM_ORDER } : id === "gui_framework" ? { values: ["tauri"], defaultValue: "tauri" } : questionFor(id);
  let value = answer.value;
  if (["name_zh", "name_en"].includes(id) && typeof value === "string" && !value.trim()) return { missing: true };
  if (["name_zh", "name_en"].includes(id) && value === "skip") return answer.source.startsWith("user:") ? { skipped: true } : { issue: "切换展示名称语言须由用户明确选择。" };
  if (value === "default" || value === "skip" || value === "") {
    if (definition.defaultValue === undefined || (value === "" && !["gui_framework", "sidebar_mode"].includes(id))) return { issue: "该字段须明确提供合法值；空白不是确认。" };
    value = structuredClone(definition.defaultValue);
  }
  if (definition.values) {
    if (["target_platforms", "interfaces", "nsh_targets"].includes(id)) {
      if (!Array.isArray(value) || value.length === 0 || value.some((item) => !definition.values.includes(item))) return { issue: "须选择至少一个合法选项。" };
      value = definition.values.filter((item) => value.includes(item));
    } else if (!definition.values.includes(value)) return { issue: "须从列出的选项中明确选择。" };
  } else if (typeof value !== "string" || !value.trim() || /[\x00-\x1f\x7f\u2028\u2029]/u.test(value)) return { issue: "须提供非空单行文本。" };
  if (id === "project_id" && !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u.test(value)) return { issue: "项目标识必须是 ASCII snake_case。" };
  return { value, source: answer.source };
}

/** NSH 能力是平台选择的唯一输入，同一桌面系统只保留一次。 */
function platformsForNshTargets(targets) {
  const selected = new Set(targets.flatMap(target => NSH_TARGET_PLATFORMS[target]));
  return NSH_PLATFORM_ORDER.filter(platform => selected.has(platform));
}

/** 计算问题或汇总；答案可以批量到达，合法值只解析一次并保留来源。 */
export function evaluateInitializationForm(input) {
  exactKeys(input, ["schemaVersion", "entry", "harnessRoot", "currentRoot", "answers", "confirmation"], "表单输入");
  if (input.schemaVersion !== 1) throw new Error("表单 schemaVersion 必须为 1");
  const entry = input.entry ?? "instantiate";
  if (!["instantiate", "initialize"].includes(entry)) throw new Error("未知初始化入口");
  const answers = input.answers ?? {};
  // 旧表单可带平台与 Tauri 答案；新表单只派生这些字段。
  exactKeys(answers, [...QUESTIONS.map(({ id }) => id), "target_platforms", "gui_framework"], "answers");
  const values = {};
  const sources = {};
  const issues = {};
  const skippedNames = new Set();
  for (const [id, answer] of Object.entries(answers)) {
    const result = parseAnswer(id, answer);
    if (id === "target_platforms") continue;
    if (result.skipped) { skippedNames.add(id); continue; }
    if (result.missing) continue;
    if (result.issue) issues[id] = result.issue;
    else { values[id] = result.value; sources[id] = result.source; }
  }
  if (values.interfaces?.includes("nsh")) {
    for (const [id, field, issue] of [
      ["name_zh", "nameZh", "展示名称须能作为各平台的应用包文件名，请修正路径字符、保留名称、首尾空白或长度。"],
      ["name_en", "nameEn", "展示名称须能作为各平台的应用包文件名，请修正路径字符、保留名称、首尾空白或长度。"],
      ["project_id", "projectId", "NSH 项目标识最多 64 个 ASCII 字符，采用 snake_case。"],
      ["owner", "owner", "负责人须为最多 200 字符的非空单行文本，首尾不含空白。"],
    ]) {
      if (!Object.hasOwn(values, id) || validNshIdentity(field, values[id])) continue;
      delete values[id]; delete sources[id];
      issues[id] = issue;
    }
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
  const output = (stage, ids = [], extra = {}) => {
    if (ids.length > 1) throw new Error("每轮只能询问一个字段");
    return {
      schemaVersion: 1, stage, values: { ...values }, sources: { ...sources },
      questions: ids.map((id) => {
        const question = questionFor(id, issues[id]);
        if (values.interfaces?.includes("nsh") && values.nsh_targets?.includes("desktop")) {
          if (id === "system_tray") question.help = "中性菜单包含新建窗口、显示所有窗口和退出；启用后由宿主处理关窗与恢复。";
          if (id === "single_instance") question.help = "Windows 和 Linux 的打包应用由 NSH 处理二次启动并恢复主窗口；macOS 由系统复用已打开的应用包。";
          if (id === "deep_link") {
            question.title = "是否启用只恢复应用窗口的深链接？";
            question.help = "使用官方 URL Scheme app-<kebab-prefix>://restore。模板仅消费这个恢复 URL，并要求同时启用单实例。";
          }
          if (NSH_FIXED_OFF.includes(id) || (id === "deep_link" && values.single_instance === "disabled")) {
            question.options = ["关闭"];
            question.values = ["disabled"];
          }
          if (Object.hasOwn(NSH_FIXED_OFF_HELP, id)) question.help = NSH_FIXED_OFF_HELP[id];
        }
        if (id === "deep_link" && values.project_id) question.help = question.help.replace("<kebab-prefix>", values.project_id.replaceAll("_", "-"));
        return question;
      }), ...extra,
    };
  };
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
  if (!hasName && skippedNames.size === 2) {
    issues.name_zh = "至少需要提供一种语言的展示名称；请输入中文名，或修改英文名答案。";
    return output("base", ["name_zh"]);
  }
  const missingBase = BASE_FIELDS.filter((id) => !values[id] && !skippedNames.has(id) && !(hasName && ["name_zh", "name_en"].includes(id) && !issues[id]));
  if (missingBase.length) return output("base", [missingBase[0]]);
  if (!hasName) throw new Error("至少一个展示名称必须来自用户或已确认项目事实");
  const translated = ["name_zh", "name_en"].filter((id) => !values[id]);
  if (translated.length) return output("translation", [], { translate: translated });
  const gui = values.interfaces.includes("gui");
  const nsh = values.interfaces.includes("nsh");
  if (nsh && values.interfaces.length !== 1) {
    issues.interfaces = "NSH 只能单独选择，不能与 CLI、MCP 或 DESKTOP 组合；CLI、MCP 可互相组合，也可与 DESKTOP 组合。";
    return output("base", ["interfaces"]);
  }
  if ((!gui && Object.hasOwn(answers, "gui_framework")) || (!nsh && Object.hasOwn(answers, "nsh_targets"))) {
    issues.interfaces = "当前程序类型与旧条件答案不匹配；请确认接口组合，或撤下不适用的框架/NSH 答案。";
    return output("base", ["interfaces"]);
  }
  if (nsh) {
    if (!values.nsh_targets) return output("nsh", ["nsh_targets"]);
    values.target_platforms = platformsForNshTargets(values.nsh_targets);
    sources.target_platforms = "derived:nsh_targets";
  } else {
    values.target_platforms = ["windows", "macos", "linux"];
    sources.target_platforms = "default:all_desktop_platforms";
  }
  if (gui && issues.gui_framework) throw new Error("DESKTOP 只支持 Tauri；请移除旧框架答案。");
  if (gui) { values.gui_framework = "tauri"; sources.gui_framework = "derived:desktop"; }
  const desktop = gui || (nsh && values.nsh_targets.includes("desktop"));
  if (!desktop && [...GUI_FIELDS, "capability_setup_assistance"].some(id => Object.hasOwn(answers, id))) {
    const questionId = nsh ? "nsh_targets" : "interfaces";
    issues[questionId] = "未选择桌面能力却提供了桌面条件答案；请确认目标组合，或撤下旧桌面答案。";
    return output(nsh ? "nsh" : "base", [questionId]);
  }
  for (const id of POLICY_FIELDS) { values[id] = POLICY_PRESET[id]; sources[id] = "default:initialization"; }
  values.post_release_action = "pending";
  sources.post_release_action = "deferred:first_release";
  const unavailable = desktop && nsh ? NSH_FIXED_OFF : [];
  if (desktop) {
    if (nsh) {
      const deepLinkConflict = values.deep_link === "enabled" && values.single_instance === "disabled";
      const next = NSH_DESKTOP_QUESTIONS.find(id => {
        if (id === "deep_link" && values.single_instance === "disabled") return deepLinkConflict || Boolean(issues[id]);
        return !values[id];
      });
      if (next === "deep_link" && deepLinkConflict) {
        issues.deep_link = "模板只在启用单实例后提供深链接。可关闭深链接，或把单实例改为启用。";
      }
      if (next) return output("gui", [next], { unavailable });
      if (!values.deep_link) { values.deep_link = "disabled"; sources.deep_link = "derived:single_instance"; }
    }
    for (const id of unavailable) {
      if (issues[id] || (values[id] && values[id] !== "disabled")) {
        issues[id] = "当前 NSH 中性模板将此能力固定为关闭，请确认关闭。";
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
    const enabledDesktop = (nsh ? [...DESKTOP_FIELDS, "deep_link"] : DESKTOP_FIELDS).filter((id) => values[id] === "enabled");
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
