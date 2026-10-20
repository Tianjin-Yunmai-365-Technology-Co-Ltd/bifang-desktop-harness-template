import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { withFixture } from "./verify-gui-lifecycle-contract.fixture.mjs";
import { verifyGuiLifecycleContract } from "./verify-gui-lifecycle-contract.mjs";

/** 设置真实目标元数据并移除完整图标点击分支，保留菜单与关闭生命周期。 */
function menuOnlyFixture(root, guiRoot, platforms) {
  const cargoPath = path.join(root, "Cargo.toml");
  let cargo = fs.readFileSync(cargoPath, "utf8");
  const declaration = `target-platforms = ${JSON.stringify(platforms)}`;
  cargo = cargo.includes("[workspace.metadata.agent-first-harness]")
    ? cargo.replace(/^target-platforms\s*=.*$/mu, declaration)
    : `${cargo}\n[workspace.metadata.agent-first-harness]\n${declaration}\n`;
  fs.writeFileSync(cargoPath, cargo);
  const sourcePath = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
  let source = fs.readFileSync(sourcePath, "utf8");
  const start = source.indexOf(".on_tray_icon_event(");
  const end = source.indexOf(".on_menu_event(", start);
  assert.ok(start >= 0 && end > start, "fixture must contain the complete click handler");
  source = (source.slice(0, start) + source.slice(end))
    .replace("MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent", "TrayIconBuilder");
  assert.doesNotMatch(source, /TrayIconEvent::Click|MouseButton::Left/u);
  fs.writeFileSync(sourcePath, source);
  return { cargoPath, sourcePath };
}

/** Linux-only 的菜单恢复实现应通过，不要求宿主不提供的图标事件。 */
test("linux_only_tray_accepts_menu_restore_without_icon_events", () => {
  withFixture(({ root, guiRoot }) => {
    menuOnlyFixture(root, guiRoot, ["linux"]);
    assert.deepEqual(verifyGuiLifecycleContract(root, "sample_gui"), []);
  });
});

/** 支持图标点击的目标或混合目标仍必须保留左键恢复处理。 */
for (const platforms of [["windows"], ["macos"], ["linux", "windows"], ["linux", "macos"]]) {
  test(`tray_requires_icon_events_for_${platforms.join("_")}`, () => {
    withFixture(({ root, guiRoot }) => {
      menuOnlyFixture(root, guiRoot, platforms);
      const errors = verifyGuiLifecycleContract(root, "sample_gui").join("\n");
      assert.match(errors, /处理托盘点击事件缺少/u);
      assert.match(errors, /鼠标左键释放时恢复窗口缺少/u);
    });
  });
}

/** Linux 豁免仅涉及图标事件，菜单接线仍是必需合同。 */
test("linux_only_tray_still_rejects_missing_menu_handler", () => {
  withFixture(({ root, guiRoot }) => {
    const { sourcePath } = menuOnlyFixture(root, guiRoot, ["linux"]);
    fs.writeFileSync(sourcePath, fs.readFileSync(sourcePath, "utf8").replace(".on_menu_event(", ".unwired_menu_event("));
    assert.match(verifyGuiLifecycleContract(root, "sample_gui").join("\n"), /处理托盘菜单事件缺少/u);
  });
});

/** 缺失或非法目标不能通过宿主推断而获得 Linux 图标事件豁免。 */
for (const [label, raw] of [
  ["missing", null], ["empty", "[]"], ["unknown", '["unknown"]'],
  ["scalar", '"linux"'], ["duplicate_platform", '["linux","linux"]'],
  ["duplicate_key", '["linux"]\ntarget-platforms = ["windows"]'],
]) {
  test(`tray_rejects_${label}_target_metadata`, () => {
    withFixture(({ root, guiRoot }) => {
      const { cargoPath } = menuOnlyFixture(root, guiRoot, ["linux"]);
      fs.writeFileSync(cargoPath, fs.readFileSync(cargoPath, "utf8")
        .replace(/^target-platforms\s*=.*$/mu, raw === null ? "" : `target-platforms = ${raw}`));
      assert.match(verifyGuiLifecycleContract(root, "sample_gui").join("\n"), /target-platforms.*(?:缺失|重复|无效)/u);
    });
  });
}
