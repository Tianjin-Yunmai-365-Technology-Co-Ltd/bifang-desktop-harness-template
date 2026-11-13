import assert from "node:assert/strict";
import test from "node:test";
import { betaTauriConfig } from "./tauri_channel_config.mjs";

test("Beta applies to the effective Tauri identity without dropping platform window options", () => {
  const configs = [
    { productName: "Tool", identifier: "com.example.tool", app: { windows: [{ title: "Base", width: 640 }] } },
    { productName: "Tool Windows", mainBinaryName: "custom", app: { windows: [{ title: "Windows", label: "main", width: 900 }] } },
    { mainBinaryName: null, bundle: { active: true, macOS: { bundleName: "Internal" } } },
  ];
  assert.deepEqual(betaTauriConfig(configs, "tool_gui"), {
    productName: "Tool Windows Beta",
    identifier: "com.example.tool.beta",
    mainBinaryName: "tool_gui-beta",
    bundle: { macOS: { bundleName: "Internal Beta" } },
    app: { windows: [{ title: "Windows Beta", label: "main", width: 900 }] },
  });
  assert.equal(configs[1].app.windows[0].title, "Windows");
  assert.throws(() => betaTauriConfig([{ identifier: "com.example.tool" }], "tool.exe", "tool"), /valid product name/);
  assert.deepEqual(betaTauriConfig([{ identifier: "com.example.tool" }], "main_bin", "tool"), {
    productName: "tool Beta",
    identifier: "com.example.tool.beta",
    mainBinaryName: "main_bin-beta",
  });
});
