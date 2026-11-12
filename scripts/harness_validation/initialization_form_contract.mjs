/** 校验唯一表单目录与入口路由，拒绝已确认会使模型行为分叉的旧提示。 */
import fs from "node:fs";
import path from "node:path";
import { BASE_FIELDS, GUI_FIELDS, NSH_PLATFORM_ORDER, NSH_TARGET_PLATFORMS, NSH_TARGETS, POLICY_FIELDS, QUESTIONS, REVIEW_QUESTION, questionFor } from "../../.agents/skills/desktop-instantiate-project/scripts/initialization_questions.mjs";
import { ROOT, fail } from "./core.mjs";

/** 使用实际目录检查稳定 ID/编号/选项，并验证入口继续消费同一解析器。 */
export function validateInitializationFormRouting(errors, sourceRoot = ROOT) {
  const ids = QUESTIONS.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) fail(errors, "initialization form contains duplicate field IDs");
  if (QUESTIONS.slice(0, 6).some((question, index) => question.number !== index + 1)) fail(errors, "initialization base numbered fields must remain 1..6");
  if (BASE_FIELDS.length !== 6 || POLICY_FIELDS.length !== 6 || GUI_FIELDS.length !== 9) fail(errors, "initialization field partitions must remain 6/6/9");
  if (JSON.stringify(BASE_FIELDS) !== JSON.stringify(["name_zh", "name_en", "project_id", "project_path", "owner", "interfaces"]) || QUESTIONS.some(question => question.id === "target_platforms")) fail(errors, "initialization must not ask for desktop target platforms");
  if (QUESTIONS.some(({ id }) => ["policy_mode", "post_release_action", ...POLICY_FIELDS].includes(id))) fail(errors, "Agent policy and release action must not be initialization questions");
  if (JSON.stringify(QUESTIONS.find(question => question.id === "interfaces")?.values) !== JSON.stringify(["cli", "mcp", "gui", "nsh"])) fail(errors, "program types must expose CLI/MCP/DESKTOP/NSH in order");
  if (QUESTIONS.some(question => question.id === "gui_framework")) fail(errors, "DESKTOP must derive Tauri without asking for a framework");
  if (JSON.stringify(NSH_TARGETS) !== JSON.stringify(["desktop", "mobile", "web", "tui"]) || JSON.stringify(QUESTIONS.find(question => question.id === "nsh_targets")?.values) !== JSON.stringify(NSH_TARGETS)) fail(errors, "NSH capability choices must be desktop/mobile/web/tui only");
  if (JSON.stringify(NSH_PLATFORM_ORDER) !== JSON.stringify(["windows", "macos", "linux", "android", "ios", "web"])) fail(errors, "NSH derived platforms must keep their canonical order");
  if (JSON.stringify(NSH_TARGET_PLATFORMS) !== JSON.stringify({ desktop: ["windows", "macos", "linux"], mobile: ["android", "ios"], web: ["web"], tui: ["windows", "macos", "linux"] })) fail(errors, "NSH capabilities must derive their complete platform groups");
  if (JSON.stringify(QUESTIONS.filter(question => question.inputMode === "multiple").map(question => question.id)) !== JSON.stringify(["interfaces", "nsh_targets"])) fail(errors, "program types and NSH capabilities must declare multiple selection");
  if (REVIEW_QUESTION.inputMode !== "single") fail(errors, "summary confirmation must declare single selection");
  if (JSON.stringify(QUESTIONS.filter(question => question.alternateAction).map(question => [question.id, question.alternateAction])) !== JSON.stringify([
    ["name_zh", { label: "改用英文名", value: "skip" }],
    ["name_en", { label: "改用中文名", value: "skip" }],
  ])) fail(errors, "either name must allow switching to the other language");
  for (const question of QUESTIONS) {
    if (!question.id || !question.title || question.options?.length !== question.values?.length) fail(errors, `invalid initialization question: ${question.id}`);
    const rendered = questionFor(question.id);
    const expectedMode = ["interfaces", "nsh_targets"].includes(question.id) ? "multiple" : rendered.options ? "single" : "text";
    if (rendered.inputMode !== expectedMode) fail(errors, `invalid initialization input mode: ${question.id}`);
  }
  for (const name of ["desktop-instantiate-project", "desktop-initialize-rust-project"]) {
    for (const suffix of ["SKILL.md", "agents/openai.yaml"]) {
      const relative = `.agents/skills/${name}/${suffix}`;
      let source;
      try { source = fs.readFileSync(path.join(sourceRoot, relative), "utf8"); }
      catch { fail(errors, `initialization form route missing: ${relative}`); continue; }
      for (const token of ["initialization-form.md", "initialization_form.mjs"]) {
        if (!source.includes(token)) fail(errors, `initialization form route ${relative} must reference ${token}`);
      }
    }
  }
  for (const relative of ["README.md", "docs/RUST_CLI_TEMPLATE.md", ".agents/skills/desktop-instantiate-project/SKILL.md", ".agents/skills/desktop-initialize-rust-project/SKILL.md"]) {
    let source;
    try { source = fs.readFileSync(path.join(sourceRoot, relative), "utf8"); }
    catch { fail(errors, `initialization form source missing: ${relative}`); continue; }
    for (const obsolete of ["未回答、留空、跳过或默认取", "未回答时使用", "未回答或跳过框架时使用", "用户省略、留空或跳过侧栏选择时", "或仅 GUI 且目标平台只有 Linux 时标为不可用"]) {
      if (source.includes(obsolete)) fail(errors, `obsolete initialization default rule in ${relative}: ${obsolete}`);
    }
  }
}
