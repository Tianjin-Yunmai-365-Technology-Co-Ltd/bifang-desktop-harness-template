/** 入口指针与危险旧提示的变异回归，防止后续修改恢复第二套表单。 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ROOT } from "./core.mjs";
import { validateInitializationFormRouting } from "./initialization_form_contract.mjs";

/** 仅复制路由文档到隔离目录，不执行安装、初始化或真实项目写入。 */
function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-form-routing-"));
  const files = ["README.md", "docs/RUST_CLI_TEMPLATE.md", ".agents/skills/desktop-add-gpui-adapter/SKILL.md"];
  for (const skill of ["desktop-instantiate-project", "desktop-initialize-rust-project"]) {
    for (const name of ["SKILL.md", "agents/openai.yaml"]) files.push(`.agents/skills/${skill}/${name}`);
  }
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, file), path.join(root, file));
  }
  try { run(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

/** 两种入口及默认提示必须继续引用同一表单与解析器。 */
test("missing_canonical_form_route_is_rejected", () => fixture((root) => {
  const errors = []; validateInitializationFormRouting(errors, root); assert.deepEqual(errors, []);
  const file = path.join(root, ".agents/skills/desktop-initialize-rust-project/agents/openai.yaml");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replaceAll("initialization_form.mjs", "different_form.mjs"));
  validateInitializationFormRouting(errors, root);
  assert.match(errors.join("\n"), /must reference initialization_form.mjs/u);
}));

/** 缺少消息自动默认和忽略 GPUI 的 Linux 判断不可重新进入用户提示。 */
test("obsolete_silent_defaults_and_linux_gui_rule_are_rejected", () => fixture((root) => {
  const file = path.join(root, "README.md");
  fs.appendFileSync(file, "\n未回答、留空、跳过或默认取 tauri\n或仅 GUI 且目标平台只有 Linux 时标为不可用\n");
  const errors = []; validateInitializationFormRouting(errors, root);
  assert.equal(errors.length, 2); assert.ok(errors.every((error) => error.includes("obsolete initialization default rule")));
}));
