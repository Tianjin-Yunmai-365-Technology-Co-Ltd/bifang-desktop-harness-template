import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/** 初始化命令必须传入将要生成的真实 Cargo MSRV，避免未来模板变更后遗漏。 */
test("initialization_passes_the_manifest_msrv_to_both_host_gates", () => {
  const skills = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const manifest = readFileSync(path.join(skills, "desktop-initialize-rust-project/assets/rust-lib-cli/Cargo.toml"), "utf8");
  const minimum = /^rust-version\s*=\s*"([0-9]+\.[0-9]+\.[0-9]+)"$/mu.exec(manifest)?.[1];
  assert.ok(minimum);
  const instruction = readFileSync(path.join(skills, "desktop-initialize-rust-project/SKILL.md"), "utf8");
  assert.ok(instruction.includes(`--rust-min-version ${minimum}`));
  assert.ok(instruction.includes(`-RustMinVersion ${minimum}`));
});
