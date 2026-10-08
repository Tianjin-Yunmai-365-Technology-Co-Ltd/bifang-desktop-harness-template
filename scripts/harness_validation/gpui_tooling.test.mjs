import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { ROOT } from "./core.mjs";
import { validateGpuiNodeTooling, validateGuiNodeEnvironment } from "./gpui_tooling.mjs";
import { PREREQUISITE_UNIX, PREREQUISITE_WINDOWS } from "./initialization_paths.mjs";

const GPUI_DIRECTORY = path.join(ROOT, ".agents/skills/desktop-add-gpui-adapter/scripts");

/** 修改真实模块副本验证门禁，不改共享源文件或运行安装、发布命令。 */
function withMutatedModule(name, mutate, callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "gpui-validator-mutation-"));
  try {
    const original = fs.readFileSync(path.join(GPUI_DIRECTORY, name), "utf8");
    const changed = mutate(original);
    assert.notEqual(changed, original, "mutation must change the actual maintained module");
    const file = path.join(directory, name);
    fs.writeFileSync(file, changed);
    callback(file);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

/** 真正模板必须生成工程入口，保留用户字段并执行完整的三个机械门禁。 */
test("production_gpui_node_templates_and_runner_satisfy_the_contract", () => {
  const errors = [];
  validateGpuiNodeTooling(errors);
  validateGuiNodeEnvironment(errors);
  assert.deepEqual(errors, []);
});

/** pnpm 门槛下降必须由生成结果识别，不能只检查常量或测试标题是否存在。 */
test("gpui_validator_rejects_a_lowered_generated_pnpm_floor", () => {
  withMutatedModule("gpui_node_tooling.mjs", source => source.replace("pnpm: '>=12.4.1'", "pnpm: '>=12.4.0'"), toolingPath => {
    const errors = [];
    validateGpuiNodeTooling(errors, { toolingPath });
    assert.match(errors.join("\n"), /engine pnpm must remain >=12\.4\.1/u);
  });
});

/** 缺失开发入口或改到单次 cargo run 时，实际生成结果必须被门禁拒绝。 */
test("gpui_validator_rejects_missing_or_misrouted_dev_scripts", () => {
  for (const replacement of ['', "  dev: 'node .agents/skills/desktop-add-gpui-adapter/scripts/gpui_validate.mjs --root .',\n"]) {
    withMutatedModule("gpui_node_tooling.mjs", source => source.replace(/^  dev:.*\n/mu, replacement), toolingPath => {
      const errors = [];
      validateGpuiNodeTooling(errors, { toolingPath });
      assert.match(errors.join("\n"), /dev must use/u);
    });
  }
});

/** 静默覆盖既有更严格 engine 或同名脚本，会破坏升级时的 protected 文件边界。 */
test("gpui_validator_rejects_merges_that_silently_overwrite_conflicts", () => {
  withMutatedModule("gpui_node_tooling.mjs", source => source.replace(
    /if \(merged\[field\]\[key\] !== value\) throw new Error\([^\n]+\);/u,
    "merged[field][key] = value;",
  ), toolingPath => {
    const errors = [];
    validateGpuiNodeTooling(errors, { toolingPath });
    assert.match(errors.join("\n"), /merge must reject existing engine or script conflicts/u);
  });
});

/** 真实 runner 若遗漏 core-first，即便剩余两项均可运行也不能通过模板检查。 */
test("gpui_validator_rejects_a_runner_that_omits_core_first", () => {
  withMutatedModule("gpui_validate.mjs", source => source
    .replace("'./gpui_adapter_files.mjs'", JSON.stringify(pathToFileURL(path.join(GPUI_DIRECTORY, "gpui_adapter_files.mjs")).href))
    .replace("  ['check_core_first.mjs', '--workspace-root'],\n", ""), runnerPath => {
    const errors = [];
    validateGpuiNodeTooling(errors, { runnerPath });
    assert.match(errors.join("\n"), /runner must execute all three retained Node checks/u);
  });
});

/** 两平台的旧 GPUI pnpm 豁免均须被识别，Tauri 本身的门禁保持不变。 */
test("gui_environment_validator_rejects_framework_specific_pnpm_exemptions", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "gui-environment-validator-"));
  try {
    const unixPath = path.join(directory, "gate.sh");
    const windowsPath = path.join(directory, "gate.ps1");
    const unix = fs.readFileSync(PREREQUISITE_UNIX, "utf8");
    const windows = fs.readFileSync(PREREQUISITE_WINDOWS, "utf8");
    fs.writeFileSync(unixPath, unix.replace("*,GUI,*) PNPM_REQUIRED=1", '*,GUI,*) [ "$GUI_FRAMEWORK" != tauri ] || PNPM_REQUIRED=1'));
    fs.writeFileSync(windowsPath, windows.replace('$PnpmRequired = ($NormalizedInterfaces -contains "GUI")', '$PnpmRequired = ($NormalizedInterfaces -contains "GUI") -and $GuiFramework -eq "tauri"'));
    const errors = [];
    validateGuiNodeEnvironment(errors, { unixPath, windowsPath });
    assert.equal(errors.length, 2);
    assert.match(errors[0], /POSIX pnpm requirement must apply to both/u);
    assert.match(errors[1], /PowerShell pnpm requirement must apply to both/u);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
