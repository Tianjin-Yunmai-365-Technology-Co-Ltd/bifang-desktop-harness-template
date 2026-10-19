/** 验证 Debian 安装标识规范化的纯规则、payload 比较与参数门禁；真实 dpkg 打包只在 Linux 宿主可执行。 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  controlField,
  isDebianPackageName,
  missingDepends,
  parseArguments,
  payloadRecords,
  replacePackageField,
} from "./normalize_tauri_deb.mjs";

/** Tauri 由中文产品名派生的典型控制文件，Package 值为 dpkg 不接受的非 ASCII。 */
const CONTROL = [
  "Package: 示例看板",
  "Version: 1.2.3",
  "Architecture: amd64",
  "Depends: libwebkit2gtk-4.1-0, libgtk-3-0 (>= 3.24), libayatana-appindicator3-1 | libappindicator3-1",
  "Description: 示例",
  "",
].join("\n");

/** 包名只接受 Debian 语法，拒绝大写、单字符、下划线和非 ASCII。 */
test("accepts_only_debian_package_names", () => {
  for (const name of ["example-dashboard", "app2", "lib.foo+bar"]) assert.equal(isDebianPackageName(name), true);
  for (const name of ["Example", "a", "under_score", "示例看板", "-lead", ""]) assert.equal(isDebianPackageName(name), false);
});

/** 控制字段必须恰好出现一次，替换只改 Package 行并保留其余字节。 */
test("replaces_only_the_package_field", () => {
  assert.equal(controlField(CONTROL, "Version"), "1.2.3");
  assert.throws(() => controlField(`${CONTROL}Version: 9.9.9\n`, "Version"), /exactly one Version/);
  const replaced = replacePackageField(CONTROL, "example-dashboard");
  assert.equal(controlField(replaced, "Package"), "example-dashboard");
  assert.equal(replaced.replace("Package: example-dashboard", "Package: 示例看板"), CONTROL);
  assert.throws(() => replacePackageField(CONTROL, "示例"), /Debian package name/);
});

/** 必需运行库按包名比较，版本约束与备选依赖不影响判定。 */
test("reports_missing_runtime_dependencies", () => {
  assert.deepEqual(missingDepends(CONTROL, ["libwebkit2gtk-4.1-0", "libgtk-3-0", "libayatana-appindicator3-1"]), []);
  assert.deepEqual(missingDepends(CONTROL, ["libappindicator3-1", "libssl3"]), ["libssl3"]);
});

/** payload 记录覆盖权限、链接目标与内容摘要，并跳过根 DEBIAN 目录。 */
test("payload_records_detect_mode_link_and_content_changes", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tauri-deb-payload-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "DEBIAN"));
  fs.writeFileSync(path.join(root, "DEBIAN/control"), CONTROL);
  fs.mkdirSync(path.join(root, "usr/bin"), { recursive: true });
  fs.writeFileSync(path.join(root, "usr/bin/app"), "binary");
  fs.chmodSync(path.join(root, "usr/bin/app"), 0o755);
  fs.symlinkSync("app", path.join(root, "usr/bin/alias"));
  const before = payloadRecords(root);
  assert.equal(before.some(([entry]) => entry.startsWith("DEBIAN")), false);
  fs.writeFileSync(path.join(root, "DEBIAN/control"), replacePackageField(CONTROL, "example-dashboard"));
  assert.deepEqual(payloadRecords(root), before);
  fs.chmodSync(path.join(root, "usr/bin/app"), 0o644);
  assert.notDeepEqual(payloadRecords(root), before);
});

/** 参数解析要求根目录与包名，可重复声明必需依赖，拒绝未知或缺值参数。 */
test("parses_arguments_strictly", () => {
  const parsed = parseArguments([
    "--project-root", ".", "--package-name", "example-dashboard",
    "--require-depends", "libgtk-3-0", "--require-depends", "libayatana-appindicator3-1",
  ]);
  assert.equal(parsed.packageName, "example-dashboard");
  assert.deepEqual(parsed.requireDepends, ["libgtk-3-0", "libayatana-appindicator3-1"]);
  assert.equal(parsed.input, null);
  assert.throws(() => parseArguments(["--project-root", "."]), /required/);
  assert.throws(() => parseArguments(["--project-root", ".", "--package-name", "a", "--force", "1"]), /invalid argument/);
  assert.throws(() => parseArguments(["--project-root", ".", "--package-name"]), /missing value/);
});
