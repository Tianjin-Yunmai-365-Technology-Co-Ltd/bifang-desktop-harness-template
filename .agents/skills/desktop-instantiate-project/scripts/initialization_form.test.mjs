/** 以隔离临时目录验证表单问询、组合约束、确认失效与零写入。 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { evaluateInitializationForm, localPackageAvailability } from "./initialization_form.mjs";
import { BASE_FIELDS, GUI_FIELDS, POLICY_FIELDS, POLICY_PRESET, QUESTIONS, questionFor } from "./initialization_questions.mjs";

/** 构造仅含明确答复的快照；测试目录只由夹具建立，表单必须保持只读。 */
function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-form-"));
  const input = { schemaVersion: 1, entry: "instantiate", harnessRoot: root, answers: {} };
  const set = (id, value, source = "user:test-reply") => { input.answers[id] = { value, source }; };
  const base = () => {
    for (const [id, value] of Object.entries({ name_zh: "示例工具", name_en: "Sample Tool", project_id: "sample_tool", project_path: path.join(root, "projects"), owner: "test-owner", target_platforms: ["linux"], interfaces: ["cli"], policy_mode: "recommended", post_release_action: "local_package" })) set(id, value);
  };
  const gui = (framework = "tauri") => {
    base(); set("interfaces", ["gui"]); set("target_platforms", ["macos"]); set("gui_framework", framework);
    for (const id of GUI_FIELDS) set(id, id === "sidebar_mode" ? "detailed" : "disabled");
  };
  try { run({ root, input, set, base, gui, evaluate: () => evaluateInitializationForm(input) }); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}

/** 空表单集中首轮九项，直调初始化只省既定路径，标识与负责人仍须提问。 */
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

/** 漏答不套默认，只有相应字段的显式默认或跳过才归一化。 */
test("missing_answers_wait_while_explicit_defaults_are_field_scoped", () => fixture(({ input, set, base, gui, evaluate }) => {
  base(); delete input.answers.interfaces; delete input.answers.post_release_action;
  assert.deepEqual(evaluate().questions.map(({ id }) => id), ["interfaces", "post_release_action"]);
  set("interfaces", "default"); set("post_release_action", "default");
  assert.deepEqual(evaluate().values.interfaces, ["cli"]);
  assert.equal(evaluate().stage, "review");
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
  set("project_path", path.join(root, "projects")); set("interfaces", ["tui"]); set("owner", "");
  assert.deepEqual(evaluate().questions.map(({ id }) => id), ["owner", "post_release_action"]);
}));

/** 自定义六项按唯一顺序逐问；主动批量给出的合法值不会被清除。 */
test("custom_policy_orders_questions_and_reuses_batched_answers", () => fixture(({ set, base, evaluate }) => {
  base(); set("policy_mode", "custom"); set("e2e_hint", "enabled");
  for (const id of POLICY_FIELDS.filter((id) => id !== "e2e_hint")) {
    assert.equal(evaluate().questions[0].id, id); set(id, "disabled");
  }
  assert.equal(evaluate().stage, "review");
  assert.equal(evaluate().values.e2e_hint, "enabled");
}));

/** 推荐预设一次物化，但不覆盖与用户显式答案冲突的字段。 */
test("recommended_preset_is_exact_and_conflicts_require_mode_choice", () => fixture(({ set, base, evaluate }) => {
  base();
  assert.deepEqual(Object.fromEntries(POLICY_FIELDS.map((id) => [id, evaluate().values[id]])), POLICY_PRESET);
  set("task_worktrees", "enabled");
  assert.equal(evaluate().questions[0].id, "policy_mode");
  assert.equal(evaluate().values.task_worktrees, "enabled");
  set("policy_mode", "custom"); assert.equal(evaluate().questions[0].id, "user_owned_tasks");
}));

/** 遍历全部接口/平台组合，Linux GUI 框架待解不会被提前判为不可打包。 */
test("local_package_matrix_and_linux_framework_revalidation", () => {
  const combinations = (items) => Array.from({ length: 2 ** items.length - 1 }, (_, mask) => items.filter((_, index) => ((mask + 1) & (1 << index)) !== 0));
  for (const interfaces of combinations(["cli", "tui", "mcp", "gui"])) for (const target_platforms of combinations(["windows", "macos", "linux"])) for (const gui_framework of [undefined, "tauri", "gpui"]) {
    const expected = interfaces.includes("cli") ? "available" : !interfaces.includes("gui") ? "unavailable" : !gui_framework ? "pending" : gui_framework === "gpui" || target_platforms.some((item) => item !== "linux") ? "available" : "unavailable";
    assert.equal(localPackageAvailability({ interfaces, target_platforms, gui_framework }), expected);
  }
  fixture(({ input, set, gui, evaluate }) => {
    gui(); set("target_platforms", ["linux"]); delete input.answers.gui_framework;
    assert.equal(evaluate().questions[0].id, "gui_framework");
    set("gui_framework", "tauri"); assert.equal(evaluate().questions[0].id, "post_release_action");
    set("gui_framework", "gpui"); assert.equal(evaluate().stage, "review");
    set("interfaces", ["tui", "mcp"]);
    for (const id of ["gui_framework", ...GUI_FIELDS]) delete input.answers[id];
    delete input.answers.post_release_action;
    assert.match(evaluate().questions[0].options[0], /不可用/u);
    set("post_release_action", "push_release_branch");
    assert.deepEqual(evaluate().values.interfaces, ["tui", "mcp"]);
  });
});

/** 两框架按同一 profile 顺序逐问，已答晚字段不重复；不可用字段直接派生关闭。 */
test("gui_order_and_gpui_unavailable_fields_are_deterministic", () => fixture(({ input, set, gui, evaluate }) => {
  gui(); for (const id of GUI_FIELDS) delete input.answers[id];
  for (const id of GUI_FIELDS) { assert.equal(evaluate().questions[0].id, id); set(id, id === "sidebar_mode" ? "default" : "disabled"); }
  set("gui_framework", "gpui"); set("target_platforms", ["linux"]);
  for (const id of ["deep_link", "system_tray", "global_shortcut"]) delete input.answers[id];
  assert.equal(evaluate().stage, "review");
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
  const result = run([], JSON.stringify(input)); assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).stage, "review"); assert.deepEqual(fs.readdirSync(root), []);
  const invalid = run([], JSON.stringify({ ...input, secret_unknown: "DO_NOT_ECHO" }));
  assert.equal(invalid.status, 2); assert.doesNotMatch(invalid.stderr, /DO_NOT_ECHO/u);
  assert.equal(questionFor("global_shortcut").values.length, 2);
}));
