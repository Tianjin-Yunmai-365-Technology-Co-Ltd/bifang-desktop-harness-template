/** 以隔离临时目录验证表单问询、组合约束、确认失效与零写入。 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { evaluateInitializationForm } from "./initialization_form.mjs";
import { GUI_FIELDS, POLICY_FIELDS, POLICY_PRESET, QUESTIONS, questionFor } from "./initialization_questions.mjs";

/** 构造仅含明确答复的快照；测试目录只由夹具建立，表单必须保持只读。 */
function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-form-"));
  const input = { schemaVersion: 1, entry: "instantiate", harnessRoot: root, answers: {} };
  const set = (id, value, source = "user:test-reply") => { input.answers[id] = { value, source }; };
  const base = () => {
    for (const [id, value] of Object.entries({ name_zh: "示例工具", name_en: "Sample Tool", project_id: "sample_tool", project_path: path.join(root, "projects"), owner: "test-owner", interfaces: ["cli"] })) set(id, value);
  };
  const gui = (framework = "tauri") => {
    base(); set("interfaces", ["gui"]); set("gui_framework", framework);
    for (const id of GUI_FIELDS) set(id, id === "sidebar_mode" ? "detailed" : "disabled");
  };
  const nsh = (targets = ["desktop"]) => {
    base(); set("interfaces", ["nsh"]); set("nsh_targets", targets);
    if (targets.includes("desktop")) for (const id of GUI_FIELDS) set(id, id === "sidebar_mode" ? "detailed" : "disabled");
  };
  try { run({ root, input, set, base, gui, nsh, evaluate: () => evaluateInitializationForm(input) }); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}

/** NSH 桌面逐问可用宿主能力；通知与系统热键仍失败关闭。 */
test("nsh_platforms_capabilities_confirmation_and_framework_isolation", () => fixture(({input,set,nsh,evaluate}) => {
  nsh(["desktop","mobile","web"]);
  for (const id of ["system_tray","system_notification","autostart","single_instance","deep_link","global_shortcut"]) delete input.answers[id];
  assert.equal(evaluate().questions[0].id,"system_tray");
  assert.match(evaluate().questions[0].help,/新建窗口/u);
  set("system_tray","disabled");assert.equal(evaluate().questions[0].id,"single_instance");
  assert.match(evaluate().questions[0].help,/处理二次启动并恢复主窗口/u);
  set("single_instance","enabled");assert.equal(evaluate().questions[0].id,"deep_link");
  assert.match(evaluate().questions[0].title,/应用窗口/u);
  assert.match(evaluate().questions[0].help,/app-sample-tool:\/\/restore/u);
  set("single_instance","disabled");
  assert.equal(evaluate().stage,"review");
  assert.equal(evaluate().sources.deep_link,"derived:single_instance");
  assert.deepEqual(evaluate().summary.unavailable,["system_notification","autostart","global_shortcut"]);
  assert.deepEqual(evaluate().values.interfaces,["nsh"]);
  assert.deepEqual(evaluate().values.nsh_targets,["desktop","mobile","web"]);
  assert.deepEqual(evaluate().values.target_platforms,["windows","macos","linux","android","ios","web"]);
  assert.equal(evaluate().sources.target_platforms,"derived:nsh_targets");
  assert.equal(evaluate().values.post_release_action,"pending");
  const digest=evaluate().summaryDigest;input.confirmation={digest,source:"user:test-confirmation"};assert.equal(evaluate().stage,"confirmed");
  set("system_notification","enabled");assert.equal(evaluate().questions[0].id,"system_notification");
  assert.deepEqual(evaluate().questions[0].values,["disabled"]);
  assert.match(evaluate().questions[0].help,/官方通知 API/u);
  set("system_notification","disabled");set("gui_framework","gpui");assert.equal(evaluate().questions[0].id,"interfaces");
  delete input.answers.gui_framework;set("interfaces",["cli","nsh"]);assert.equal(evaluate().questions[0].id,"interfaces");
}));

test("nsh_enabled_native_capabilities_require_explicit_answers_and_deep_link_instance", () => fixture(({input,set,nsh,evaluate}) => {
  nsh();
  set("system_tray","enabled");set("deep_link","enabled");
  assert.equal(evaluate().questions[0].id,"deep_link");
  set("single_instance","enabled");
  assert.equal(evaluate().questions[0].id,"capability_setup_assistance");
  set("capability_setup_assistance","yes");
  assert.equal(evaluate().stage,"review");
  assert.deepEqual(evaluate().summary.unavailable,["system_notification","autostart","global_shortcut"]);
  assert.match(evaluate().summary.notices.join(" "),/默认提供官方多窗口/u);
  set("global_shortcut","enabled");
  assert.equal(evaluate().questions[0].id,"global_shortcut");
  delete input.answers.global_shortcut;
  assert.equal(evaluate().stage,"review");
}));

/** NSH 非桌面目标不询问九项桌面配置；改变能力后重新派生平台。 */
test("nsh_mobile_web_skip_desktop_profile_and_reject_stale_answers", () => fixture(({input,set,nsh,evaluate}) => {
  nsh(["mobile","web"]);
  assert.equal(evaluate().stage,"review");
  assert.deepEqual(evaluate().values.target_platforms,["android","ios","web"]);
  assert.deepEqual(evaluate().summary.unavailable,[]);
  assert.equal(evaluate().values.sidebar_mode,undefined);
  set("about_page","enabled");assert.equal(evaluate().questions[0].id,"nsh_targets");
  delete input.answers.about_page;
  set("nsh_targets",["mobile"]);assert.equal(evaluate().stage,"review");
  assert.deepEqual(evaluate().values.target_platforms,["android","ios"]);
  set("target_platforms",["android"]);assert.equal(evaluate().stage,"review");
  assert.deepEqual(evaluate().values.target_platforms,["android","ios"]);
  delete input.answers.nsh_targets;assert.equal(evaluate().questions[0].id,"nsh_targets");
}));

/** 切到 CLI 或 MCP 后，残留的桌面答案应由程序类型问题纠正。 */
test("non_desktop_interfaces_with_stale_desktop_answers_stay_in_base", () => fixture(({ input, set, base, evaluate }) => {
  base();
  for (const interfaces of [["cli"], ["mcp"], ["cli", "mcp"]]) {
    set("interfaces", interfaces);
    set("sidebar_mode", "compact");
    const result = evaluate();
    assert.equal(result.stage, "base");
    assert.equal(result.questions[0].id, "interfaces");
    assert.match(result.questions[0].issue, /撤下旧桌面答案/u);
    delete input.answers.sidebar_mode;
    assert.equal(evaluate().stage, "review");
  }
}));

/** TUI 单选不需要桌面配置；与桌面并选时去重系统。 */
test("nsh_tui_selection_derives_terminal_hosts", () => fixture(({nsh,evaluate}) => {
  nsh(["tui"]);
  assert.equal(evaluate().stage,"review");
  assert.equal(evaluate().values.sidebar_mode,undefined);
  assert.deepEqual(evaluate().values.target_platforms,["windows","macos","linux"]);
  nsh(["desktop","tui"]);
  assert.equal(evaluate().stage,"review");
  assert.deepEqual(evaluate().values.nsh_targets,["desktop","tui"]);
  assert.deepEqual(evaluate().values.target_platforms,["windows","macos","linux"]);
}));

/** NSH 只问能力，旧平台答案不进入汇总；非 NSH 也默认完整桌面平台。 */
test("nsh_only_asks_capabilities_and_derives_platforms", () => fixture(({input,set,base,evaluate}) => {
  base(); set("interfaces",["nsh"]);
  assert.equal(evaluate().stage,"nsh");
  assert.deepEqual(evaluate().questions.map(({id}) => id),["nsh_targets"]);
  assert.equal(evaluate().questions[0].inputMode,"multiple");
  assert.equal(evaluate().values.target_platforms,undefined);
  set("nsh_targets",["mobile","web"]);
  assert.equal(evaluate().stage,"review");
  assert.deepEqual(evaluate().values.target_platforms,["android","ios","web"]);
  assert.match(evaluate().summary.notices.join(" "),/目标平台仅由所选能力自动确定/u);
  set("target_platforms",["android"]);
  assert.equal(evaluate().stage,"review");
  assert.deepEqual(evaluate().values.target_platforms,["android","ios","web"]);
  assert.equal(evaluate().sources.target_platforms,"derived:nsh_targets");
  set("interfaces",["cli"]); delete input.answers.nsh_targets;
  assert.equal(evaluate().stage,"review");
  assert.deepEqual(evaluate().values.target_platforms,["windows","macos","linux"]);
  assert.equal(evaluate().sources.target_platforms,"default:all_desktop_platforms");
}));

/** 多选题只接受明确提交的非空集合，不能把单个标签或预选默认值当作答案。 */
test("multiple_choice_questions_require_confirmed_arrays", () => fixture(({ input, set, base, evaluate }) => {
  base(); set("interfaces", "cli", "user:clicked-option");
  assert.equal(evaluate().stage, "base");
  assert.equal(evaluate().questions[0].id, "interfaces");
  assert.equal(evaluate().questions[0].inputMode, "multiple");
  assert.match(evaluate().questions[0].issue, /至少一个合法选项/u);
  set("interfaces", ["nsh"], "user:confirmed-selection");
  assert.equal(evaluate().stage, "nsh");
  set("nsh_targets", [], "user:confirmed-selection");
  assert.equal(evaluate().questions[0].id, "nsh_targets");
  assert.equal(evaluate().questions[0].inputMode, "multiple");
  set("nsh_targets", ["web", "desktop", "web"], "user:confirmed-selection");
  for (const id of GUI_FIELDS) set(id, id === "sidebar_mode" ? "detailed" : "disabled");
  assert.deepEqual(evaluate().values.nsh_targets, ["desktop", "web"]);
  assert.equal(evaluate().stage, "review");
  delete input.answers.interfaces;
  assert.equal(evaluate().stage, "base");
  assert.equal(evaluate().questions[0].id, "interfaces");
}));

/** 空表单每轮只问一个基础字段，已有英文名和直接初始化的路径按原规则跳过。 */
test("empty_entries_ask_one_base_field_at_a_time", () => fixture(({ root, input, set, evaluate }) => {
  assert.deepEqual(evaluate().questions.map(({ id }) => id), ["name_zh"]);
  for (const [id, value] of [
    ["name_zh", "示例工具"], ["project_id", "sample_tool"],
    ["project_path", path.join(root, "projects")], ["owner", "test-owner"],
    ["interfaces", ["cli"]],
  ]) {
    assert.deepEqual(evaluate().questions.map(({ id: questionId }) => questionId), [id]);
    assert.equal(evaluate().questions[0].inputMode, id === "interfaces" ? "multiple" : "text");
    set(id, value);
  }
  assert.equal(evaluate().stage, "translation");
  input.answers = { name_en: { value: "Sample Tool", source: "user:earlier-answer" } };
  input.entry = "initialize"; input.currentRoot = root;
  for (const [id, value] of [["project_id", "sample_tool"], ["owner", "test-owner"], ["interfaces", ["cli"]]]) {
    assert.deepEqual(evaluate().questions.map(({ id: questionId }) => questionId), [id]);
    set(id, value);
  }
  assert.equal(evaluate().stage, "translation");
}));

/** 空表单可点击改用英文名；双语均跳过时停在名称题，不把跳过当确认。 */
test("empty_entry_can_switch_to_english_name", () => fixture(({ root, input, set, evaluate }) => {
  assert.deepEqual(evaluate().questions[0].alternateAction, { label: "改用英文名", value: "skip" });
  set("name_zh", "skip", "project:untrusted-switch");
  assert.equal(evaluate().questions[0].id, "name_zh");
  assert.match(evaluate().questions[0].issue, /用户明确选择/u);
  set("name_zh", "skip", "user:clicked-use-english");
  assert.equal(evaluate().questions[0].id, "name_en");
  assert.deepEqual(evaluate().questions[0].alternateAction, { label: "改用中文名", value: "skip" });
  set("name_en", "skip", "user:clicked-use-chinese");
  delete input.answers.name_zh;
  assert.equal(evaluate().questions[0].id, "name_zh");
  assert.equal(evaluate().questions[0].issue, undefined);
  set("name_zh", "skip", "user:clicked-use-english-again");
  assert.match(evaluate().questions[0].issue, /至少需要提供一种语言/u);
  delete input.answers.name_en;
  assert.equal(evaluate().questions[0].id, "name_en");
  set("name_en", "Sample Tool", "user:entered-english-name");
  for (const [id, value] of [
    ["project_id", "sample_tool"], ["project_path", path.join(root, "projects")],
    ["owner", "test-owner"], ["interfaces", ["cli"]],
  ]) {
    assert.deepEqual(evaluate().questions.map(({ id: questionId }) => questionId), [id]);
    set(id, value);
  }
  assert.equal(evaluate().stage, "translation");
  assert.deepEqual(evaluate().translate, ["name_zh"]);
  set("name_zh", "示例工具", "translation:from-english");
  input.answers.name_zh.basedOn = "Sample Tool";
  assert.equal(evaluate().stage, "review");
  assert.equal(evaluate().values.name_en, "Sample Tool");
}));

/** 合法提前答复不重问，只缺译名时交给 Agent 翻译并保留双方来源。 */
test("provided_fields_are_reused_and_translation_is_not_a_user_question", () => fixture(({ input, set, base, evaluate }) => {
  set("name_en", "Sample Tool");
  assert.deepEqual(evaluate().questions.map(({ id }) => id), ["project_id"]);
  base(); delete input.answers.name_zh;
  assert.deepEqual(evaluate().translate, ["name_zh"]);
  set("name_zh", " "); assert.deepEqual(evaluate().translate, ["name_zh"]);
  set("name_zh", "示例工具", "translation:from-english");
  input.answers.name_zh.basedOn = "Sample Tool";
  assert.equal(evaluate().stage, "review");
  assert.equal(evaluate().sources.name_zh, "translation:from-english");
  set("name_en", "Changed Tool"); assert.equal(evaluate().stage, "translation");
}));

/** 程序类型漏答不套默认；明确选后直接派生全部桌面平台。 */
test("missing_answers_wait_while_explicit_defaults_are_field_scoped", () => fixture(({ input, set, base, gui, evaluate }) => {
  base(); delete input.answers.interfaces;
  assert.deepEqual(evaluate().questions.map(({ id }) => id), ["interfaces"]);
  set("interfaces", "default");
  assert.deepEqual(evaluate().values.interfaces, ["cli"]);
  assert.equal(evaluate().stage, "review");
  assert.deepEqual(evaluate().values.target_platforms, ["windows", "macos", "linux"]);
  gui(); delete input.answers.gui_framework;
  assert.equal(evaluate().stage, "review");
  delete input.answers.sidebar_mode;
  assert.equal(evaluate().questions[0].id, "sidebar_mode");
  set("sidebar_mode", ""); assert.equal(evaluate().values.sidebar_mode, "detailed");
  set("sidebar_mode", "invalid"); assert.equal(evaluate().questions[0].id, "sidebar_mode");
}));

/** 非法基础字段逐项修正，路径错误也必须先于框架或策略问题。 */
test("invalid_basic_fields_and_paths_precede_conditional_questions", () => fixture(({ root, set, base, evaluate }) => {
  base(); set("project_id", "Not-Snake"); set("owner", "");
  assert.deepEqual(evaluate().questions.map(({ id }) => id), ["project_id"]);
  set("project_id", "sample_tool");
  assert.deepEqual(evaluate().questions.map(({ id }) => id), ["owner"]);
  set("project_id", "sample_tool"); set("owner", "owner"); set("interfaces", ["gui"]);
  fs.writeFileSync(path.join(root, "file"), "fixture"); set("project_path", path.join(root, "file"));
  assert.deepEqual(evaluate().questions.map(({ id }) => id), ["project_path"]);
  set("project_path", path.join(root, "projects")); set("interfaces", ["mcp"]); set("owner", "");
  assert.deepEqual(evaluate().questions.map(({ id }) => id), ["owner"]);
}));

/** 六项策略固定物化且不进入问句；发布动作到首次发布前补选。 */
test("policy_defaults_are_derived_without_questions_and_release_is_deferred", () => fixture(({ input, set, base, evaluate }) => {
  base();
  const result = evaluate();
  assert.equal(result.stage, "review");
  assert.deepEqual(Object.fromEntries(POLICY_FIELDS.map((id) => [id, result.values[id]])), POLICY_PRESET);
  assert.ok(POLICY_FIELDS.every((id) => result.sources[id] === "default:initialization"));
  assert.equal(result.values.post_release_action, "pending");
  assert.equal(result.sources.post_release_action, "deferred:first_release");
  set("policy_mode", "recommended");
  assert.throws(evaluate, /未知字段/u);
  delete input.answers.policy_mode;
  set("post_release_action", "local_package");
  assert.throws(evaluate, /未知字段/u);
  delete input.answers.post_release_action;
  set("task_worktrees", "enabled");
  assert.throws(evaluate, /未知字段/u);
}));

/** CLI/MCP/DESKTOP 默认完整桌面平台，NSH 与其余类型互斥。 */
test("interface_combinations_default_to_all_desktop_platforms", () => fixture(({ input, set, base, evaluate }) => {
  base();
  for (const interfaces of [["cli", "mcp"], ["mcp"]]) {
    set("interfaces", interfaces);
    assert.equal(evaluate().stage, "review");
    assert.deepEqual(evaluate().values.target_platforms, ["windows", "macos", "linux"]);
  }
  set("interfaces", ["cli", "gui"]);
  assert.equal(evaluate().questions[0].id, "system_tray");
  for (const id of GUI_FIELDS) set(id, id === "sidebar_mode" ? "detailed" : "disabled");
  for (const interfaces of [["cli", "gui"], ["mcp", "gui"], ["cli", "mcp", "gui"]]) {
    set("interfaces", interfaces);
    assert.equal(evaluate().stage, "review");
    assert.deepEqual(evaluate().values.target_platforms, ["windows", "macos", "linux"]);
  }
  const combined = evaluate();
  assert.deepEqual(combined.values.interfaces, ["cli", "mcp", "gui"]);
  input.confirmation = { digest: combined.summaryDigest, source: "user:test-confirmation" };
  assert.equal(evaluate().stage, "confirmed");
  set("interfaces", ["cli", "nsh"]);
  assert.equal(evaluate().questions[0].id, "interfaces");
  set("interfaces", ["gui", "nsh"]);
  assert.equal(evaluate().questions[0].id, "interfaces");
  set("interfaces", ["gui"]); set("target_platforms", ["android"]);
  assert.equal(evaluate().stage, "review");
  assert.deepEqual(evaluate().values.target_platforms, ["windows", "macos", "linux"]);
}));

test("retired_tui_interface_requires_a_new_selection", () => fixture(({ base, set, evaluate }) => {
  base(); set("interfaces", ["tui"]);
  assert.equal(evaluate().questions[0].id, "interfaces");
  assert.ok(evaluate().questions[0].options.every(option => !option.includes("TUI")));
}));

/** DESKTOP 跳过框架问句，逐项确认 Tauri 能力，旧框架输入失败关闭。 */
test("desktop_derives_tauri_and_asks_profile_in_order", () => fixture(({ input, set, gui, evaluate }) => {
  gui(); delete input.answers.gui_framework;
  for (const id of GUI_FIELDS) delete input.answers[id];
  for (const id of GUI_FIELDS) {
    assert.equal(evaluate().questions[0].id, id);
    set(id, id === "sidebar_mode" ? "default" : "disabled");
  }
  assert.equal(evaluate().stage, "review");
  assert.equal(evaluate().values.gui_framework, "tauri");
  assert.deepEqual(evaluate().summary.unavailable, []);
  set("gui_framework", "gpui");
  assert.throws(evaluate, /DESKTOP 只支持 Tauri/u);
}));

/** 已知深链接冲突立即纠正，不继续问快捷键/侧栏，也不擅自开启单实例。 */
test("known_deep_link_conflict_precedes_later_gui_questions", () => fixture(({ input, set, gui, evaluate }) => {
  gui(); set("deep_link", "enabled"); delete input.answers.global_shortcut; delete input.answers.sidebar_mode;
  assert.equal(evaluate().questions[0].id, "deep_link");
  assert.equal(evaluate().values.single_instance, "disabled");
  set("single_instance", "enabled"); assert.equal(evaluate().questions[0].id, "global_shortcut");
}));

/** 汇总固定提示随框架和能力分派，确认问句来自同一目录。 */
test("review_notices_follow_framework_and_enabled_capabilities", () => fixture(({ set, gui, evaluate }) => {
  gui(); set("single_instance", "enabled"); set("deep_link", "enabled"); set("global_shortcut", "enabled"); set("capability_setup_assistance", "yes");
  const tauri = evaluate();
  assert.match(tauri.summary.notices.join("\n"), /app-sample-tool:\/\/restore/u);
  assert.match(tauri.summary.notices.join("\n"), /actions = \[\]/u);
  assert.match(tauri.summary.notices.join("\n"), /dialog:default/u);
  assert.equal(tauri.reviewQuestion.title, "是否按以上完整汇总创建项目？");
}));

/** 配置协助仅在共同五项有启用项时询问一次，复用明确回答。 */
test("assistance_is_required_only_for_enabled_desktop_capabilities", () => fixture(({ input, set, gui, evaluate }) => {
  delete input.answers.capability_setup_assistance;
  gui(); assert.equal(evaluate().stage, "review");
  set("system_notification", "enabled"); assert.equal(evaluate().questions[0].id, "capability_setup_assistance");
  set("capability_setup_assistance", "no"); assert.equal(evaluate().stage, "review");
}));

/** 汇总确认绑定内容、来源和目标状态；旧确认及漏答均不能进入 confirmed。 */
test("confirmation_binds_latest_summary_and_input_order_is_irrelevant", () => fixture(({ root, input, set, base, evaluate }) => {
  base(); const first = evaluate();
  input.confirmation = { digest: first.summaryDigest, source: "user:confirm-latest-summary" };
  assert.equal(evaluate().stage, "confirmed");
  input.answers = Object.fromEntries(Object.entries(input.answers).reverse());
  assert.equal(evaluate().stage, "confirmed");
  set("owner", "changed"); assert.equal(evaluate().stage, "review");
  set("owner", "test-owner"); set("name_zh", "示例工具", "user:different-source"); assert.equal(evaluate().stage, "review");
  input.confirmation.digest = evaluate().summaryDigest;
  fs.mkdirSync(path.join(root, "projects", "sample_tool"), { recursive: true });
  assert.equal(evaluate().stage, "review");
  fs.writeFileSync(path.join(root, "projects", "sample_tool", "user-file"), "keep");
  assert.equal(evaluate().stage, "base");
}));

/** 未知字段、伪造派生来源和多行来源失败关闭；直接入口只复用真实项目身份。 */
test("unknown_fields_and_untrusted_sources_fail_closed", () => fixture(({ root, input, set, base, evaluate }) => {
  base(); set("business", "out-of-scope"); assert.throws(evaluate, /未知字段/u); delete input.answers.business;
  set("owner", "owner", "preset:fake"); assert.throws(evaluate, /来源/u);
  set("owner", "owner", "user:reply\nother"); assert.throws(evaluate, /来源/u);
  set("owner", "owner"); set("name_zh", "示例", "project:old"); set("name_en", "Sample", "project:old");
  assert.throws(evaluate, /展示名称/u);
  input.entry = "initialize"; input.currentRoot = root;
  assert.throws(evaluate, /既定项目根/u); delete input.answers.project_path;
  assert.equal(evaluate().stage, "review");
  set("gui_framework", "tauri"); assert.equal(evaluate().questions[0].id, "interfaces");
}));

/** 直接入口不能把 Harness 源或另一目录当作已确认的目标根。 */
test("direct_initialization_rejects_harness_source_root", () => fixture(({ root, input, evaluate }) => {
  input.entry = "initialize"; input.currentRoot = root;
  fs.writeFileSync(path.join(root, "Version.md"), "fixture");
  fs.mkdirSync(path.join(root, ".agents/skills/desktop-instantiate-project"), { recursive: true });
  fs.writeFileSync(path.join(root, ".agents/skills/desktop-instantiate-project/SKILL.md"), "fixture");
  assert.throws(evaluate, /实例化入口/u);
}));

/** CLI 目录与状态计算复用同一合同，目标不存在且输入文本不泄漏到错误输出。 */
test("cli_is_read_only_and_errors_do_not_echo_unknown_input", () => fixture(({ root, input, base }) => {
  base(); const script = fileURLToPath(new URL("initialization_form.mjs", import.meta.url));
  const run = (args, payload) => spawnSync(process.execPath, [script, ...args], { input: payload, encoding: "utf8" });
  const catalog = run(["--catalog"]); assert.equal(catalog.status, 0);
  const questions = JSON.parse(catalog.stdout);
  assert.deepEqual(questions.map(({ id }) => id), QUESTIONS.map(({ id }) => id));
  assert.deepEqual(questions.filter(({ inputMode }) => inputMode === "multiple").map(({ id }) => id), ["interfaces", "nsh_targets"]);
  assert.equal(questions.find(({ id }) => id === "name_zh").inputMode, "text");
  assert.ok(!questions.some(({ id }) => id === "gui_framework"));
  assert.ok(!QUESTIONS.some(({ id }) => id === "target_platforms"));
  const result = run([], JSON.stringify(input)); assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).stage, "review"); assert.deepEqual(fs.readdirSync(root), []);
  const invalid = run([], JSON.stringify({ ...input, secret_unknown: "DO_NOT_ECHO" }));
  assert.equal(invalid.status, 2); assert.doesNotMatch(invalid.stderr, /DO_NOT_ECHO/u);
  assert.equal(questionFor("global_shortcut").values.length, 2);
}));

test("NSH validates package identity before confirmation and orders desktop dependencies first", () => fixture(({input,set,nsh,evaluate}) => {
  nsh();
  for (const [id, invalid, valid] of [
    ["name_zh", "..", "示例工具"],
    ["name_en", "Tool: Writer", "Tool Writer"],
    ["project_id", "a".repeat(65), "sample_tool"],
    ["owner", " owner ", "owner"],
  ]) {
    set(id, invalid);
    assert.equal(evaluate().questions[0].id, id);
    set(id, valid);
  }
  for (const id of GUI_FIELDS) delete input.answers[id];
  set("system_notification","enabled");
  for (const [id, value] of [["system_tray","disabled"], ["single_instance","enabled"], ["deep_link","disabled"],
    ["about_page","disabled"], ["sponsor_page","disabled"], ["sidebar_mode","detailed"]]) {
    assert.equal(evaluate().questions[0].id, id);
    set(id, value);
  }
  assert.equal(evaluate().questions[0].id, "system_notification");
  assert.deepEqual(evaluate().questions[0].values, ["disabled"]);
}));
