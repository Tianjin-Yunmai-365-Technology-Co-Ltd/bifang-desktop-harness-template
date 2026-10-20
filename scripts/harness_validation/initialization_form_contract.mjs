/** 校验唯一表单目录与入口路由，拒绝已确认会使模型行为分叉的旧提示。 */
import fs from "node:fs";
import path from "node:path";
import { BASE_FIELDS, GUI_FIELDS, POLICY_FIELDS, QUESTIONS } from "../../.agents/skills/desktop-instantiate-project/scripts/initialization_questions.mjs";
import { ROOT, fail } from "./core.mjs";

/** 使用实际目录检查稳定 ID/编号/选项，并验证入口继续消费同一解析器。 */
export function validateInitializationFormRouting(errors, sourceRoot = ROOT) {
  const ids = QUESTIONS.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) fail(errors, "initialization form contains duplicate field IDs");
  if (QUESTIONS.slice(0, 9).some((question, index) => question.number !== index + 1)) fail(errors, "initialization base field numbers must remain 1..9");
  if (BASE_FIELDS.length !== 9 || POLICY_FIELDS.length !== 6 || GUI_FIELDS.length !== 9) fail(errors, "initialization field partitions must remain 9/6/9");
  for (const question of QUESTIONS) {
    if (!question.id || !question.title || question.options?.length !== question.values?.length) fail(errors, `invalid initialization question: ${question.id}`);
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
  for (const relative of ["README.md", "docs/RUST_CLI_TEMPLATE.md", ".agents/skills/desktop-instantiate-project/SKILL.md", ".agents/skills/desktop-initialize-rust-project/SKILL.md", ".agents/skills/desktop-add-gpui-adapter/SKILL.md"]) {
    let source;
    try { source = fs.readFileSync(path.join(sourceRoot, relative), "utf8"); }
    catch { fail(errors, `initialization form source missing: ${relative}`); continue; }
    for (const obsolete of ["未回答、留空、跳过或默认取", "未回答时使用", "未回答或跳过框架时使用", "用户省略、留空或跳过侧栏选择时", "或仅 GUI 且目标平台只有 Linux 时标为不可用"]) {
      if (source.includes(obsolete)) fail(errors, `obsolete initialization default rule in ${relative}: ${obsolete}`);
    }
  }
}
