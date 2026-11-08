/** 以隔离临时目录验证表单问询、组合约束、确认失效与零写入。 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { evaluateInitializationForm } from "./initialization_form.mjs";
import { BASE_FIELDS, GUI_FIELDS, POLICY_FIELDS, POLICY_PRESET, QUESTIONS, questionFor } from "./initialization_questions.mjs";

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
  set("system_tray","disabled");assert.equal(evaluate().questions[0].id,"autostart");
  set("autostart","disabled");assert.equal(evaluate().questions[0].id,"single_instance");
  assert.match(evaluate().questions[0].help,/没有窗口时新建/u);
  set("single_instance","disabled");assert.equal(evaluate().questions[0].id,"deep_link");
  assert.match(evaluate().questions[0].title,/应用窗口/u);
  assert.match(evaluate().questions[0].help,/app-sample-tool:\/\/restore/u);
  set("deep_link","disabled");
  assert.equal(evaluate().stage,"review");
  assert.deepEqual(evaluate().summary.unavailable,["system_notification","global_shortcut"]);
  assert.deepEqual(evaluate().values.interfaces,["nsh"]);
  assert.deepEqual(evaluate().values.nsh_targets,["desktop","mobile","web"]);
  assert.deepEqual(evaluate().values.target_platforms,["windows","macos","linux","android","ios","web"]);
  assert.equal(evaluate().sources.target_platforms,"derived:nsh_targets");
  assert.equal(evaluate().values.post_release_action,"pending");
  const digest=evaluate().summaryDigest;input.confirmation={digest,source:"user:test-confirmation"};assert.equal(evaluate().stage,"confirmed");
  set("system_notification","enabled");assert.equal(evaluate().questions[0].id,"system_notification");
  set("system_notification","disabled");set("gui_framework","gpui");assert.equal(evaluate().questions[0].id,"interfaces");
  delete input.answers.gui_framework;set("interfaces",["cli","nsh"]);assert.equal(evaluate().questions[0].id,"interfaces");
}));

test("nsh_enabled_native_capabilities_require_explicit_answers_and_deep_link_instance", () => fixture(({input,set,nsh,evaluate}) => {
  nsh();
  set("system_tray","enabled");set("autostart","enabled");set("deep_link","enabled");
  assert.equal(evaluate().questions[0].id,"deep_link");
  set("single_instance","enabled");
  assert.equal(evaluate().questions[0].id,"capability_setup_assistance");
  set("capability_setup_assistance","yes");
  assert.equal(evaluate().stage,"review");
  assert.deepEqual(evaluate().summary.unavailable,["system_notification","global_shortcut"]);
  assert.match(evaluate().summary.notices.join(" "),/默认提供多窗口/u);
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

/** TUI 是 NSH 子目标，纯终端不要求桌面 profile，组合目标共用 OS。 */
test("nsh_tui_preview_defers_release_action", () => fixture(({input,set,nsh,evaluate}) => {
  nsh(["tui"]);
  assert.equal(evaluate().stage,"review");
  assert.deepEqual(evaluate().values.target_platforms,["windows","macos","linux"]);
  assert.equal(evaluate().values.post_release_action,"pending");
  assert.match(evaluate().summary.notices.join("\n"),/首次发布前只能选择提交远程/u);
  assert.equal(evaluate().values.sidebar_mode,undefined);
  assert.deepEqual(evaluate().summary.unavailable,[]);
  assert.doesNotMatch(evaluate().summary.notices.join("\n"),/Logo 在本汇总确认后/u);
  const digest=evaluate().summaryDigest; input.confirmation={digest,source:"user:test-confirmation"};
  assert.equal(evaluate().stage,"confirmed");
  set("target_platforms",["android"]); assert.equal(evaluate().stage,"confirmed");
  assert.deepEqual(evaluate().values.target_platforms,["windows","macos","linux"]);
  set("about_page","enabled"); assert.equal(evaluate().questions[0].id,"nsh_targets");
  delete input.answers.about_page;
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
  assert.equal(evaluate().values.target_platforms,undefined);
  set("nsh_targets",["mobile","web","tui"]);
  assert.equal(evaluate().stage,"review");
  assert.deepEqual(evaluate().values.target_platforms,["windows","macos","linux","android","ios","web"]);
  assert.match(evaluate().summary.notices.join(" "),/目标平台仅由所选能力自动确定/u);
  set("target_platforms",["android"]);
  assert.equal(evaluate().stage,"review");
  assert.deepEqual(evaluate().values.target_platforms,["windows","macos","linux","android","ios","web"]);
  assert.equal(evaluate().sources.target_platforms,"derived:nsh_targets");
  set("interfaces",["cli"]); delete input.answers.nsh_targets;
  assert.equal(evaluate().stage,"review");
  assert.deepEqual(evaluate().values.target_platforms,["windows","macos","linux"]);
  assert.equal(evaluate().sources.target_platforms,"default:all_desktop_platforms");
}));

/** 空表单首轮只问身份与程序类型，直调初始化只省既定路径。 */
test("empty_entries_batch_all_missing_base_fields", () => fixture(({ root, input, evaluate }) => {
  assert.deepEqual(evaluate().questions.map(({ id }) => id), BASE_FIELDS);
  input.entry = "initialize"; input.currentRoot = root;
  assert.deepEqual(evaluate().questions.map(({ id }) => id), BASE_FIELDS.filter((id) => id !== "project_path"));
}));

/** 合法提前答复不重问，只缺译名时交给 Agent 翻译并保留双方来源。 */
test("provided_fields_are_reused_and_translation_is_not_a_user_question", () => fixture(({ input, set, base, evaluate }) => {
  set("name_en", "Sample Tool");
  assert.deepEqual(evaluate().questions.map(({ id }) => id), BASE_FIELDS.slice(2));
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
  assert.equal(evaluate().stage, "framework");
  set("gui_framework", "skip"); delete input.answers.sidebar_mode;
  assert.equal(evaluate().questions[0].id, "sidebar_mode");
  set("sidebar_mode", ""); assert.equal(evaluate().values.sidebar_mode, "detailed");
  set("sidebar_mode", "invalid"); assert.equal(evaluate().questions[0].id, "sidebar_mode");
}));

/** 非法基础字段集中修正，路径错误也必须先于框架或策略问题。 */
test("invalid_basic_fields_and_paths_precede_conditional_questions", () => fixture(({ root, set, base, evaluate }) => {
  base(); set("project_id", "Not-Snake"); set("owner", "");
  assert.deepEqual(evaluate().questions.map(({ id }) => id), ["project_id", "owner"]);
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
  assert.equal(evaluate().stage, "framework");
  set("gui_framework", "tauri");
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

/** 两框架按同一 profile 顺序逐问，已答晚字段不重复；不可用字段直接派生关闭。 */
test("gui_order_and_gpui_unavailable_fields_are_deterministic", () => fixture(({ input, set, gui, evaluate }) => {
  gui(); for (const id of GUI_FIELDS) delete input.answers[id];
  for (const id of GUI_FIELDS) { assert.equal(evaluate().questions[0].id, id); set(id, id === "sidebar_mode" ? "default" : "disabled"); }
  set("gui_framework", "gpui");
  for (const id of ["deep_link", "system_tray", "global_shortcut"]) delete input.answers[id];
  assert.equal(evaluate().stage, "review");
  assert.deepEqual(evaluate().values.target_platforms, ["windows", "macos", "linux"]);
  assert.deepEqual(evaluate().summary.unavailable, ["system_tray", "deep_link", "global_shortcut"]);
  set("global_shortcut", "enabled"); assert.equal(evaluate().questions[0].id, "global_shortcut");
  assert.equal(evaluate().values.global_shortcut, "enabled");
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
  gui("gpui");
  const gpui = evaluate();
  assert.match(gpui.summary.notices.join("\n"), /Linux GNU x64\/ARM64/u);
  assert.doesNotMatch(gpui.summary.notices.join("\n"), /dialog:default/u);
}));

/** 配置协助仅在共同五项有启用项时询问一次，复用明确回答。 */
test("assistance_is_required_only_for_enabled_desktop_capabilities", () => fixture(({ input, set, gui, evaluate }) => {
  for (const framework of ["tauri", "gpui"]) {
    delete input.answers.capability_setup_assistance;
    gui(framework); assert.equal(evaluate().stage, "review");
    set("system_notification", "enabled"); assert.equal(evaluate().questions[0].id, "capability_setup_assistance");
    set("capability_setup_assistance", "no"); assert.equal(evaluate().stage, "review");
  }
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
  assert.deepEqual(JSON.parse(catalog.stdout).map(({ id }) => id), QUESTIONS.map(({ id }) => id));
  assert.ok(!QUESTIONS.some(({ id }) => id === "target_platforms"));
  const result = run([], JSON.stringify(input)); assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).stage, "review"); assert.deepEqual(fs.readdirSync(root), []);
  const invalid = run([], JSON.stringify({ ...input, secret_unknown: "DO_NOT_ECHO" }));
  assert.equal(invalid.status, 2); assert.doesNotMatch(invalid.stderr, /DO_NOT_ECHO/u);
  assert.equal(questionFor("global_shortcut").values.length, 2);
}));
