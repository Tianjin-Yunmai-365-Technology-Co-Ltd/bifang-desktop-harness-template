/** 验证 Debian 安装标识规范化的纯规则、payload 比较与参数门禁；真实 dpkg 打包只在 Linux 宿主可执行。 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { sha256File } from "./tauri_deb_artifacts.mjs";

import {
  controlField,
  isDebianPackageName,
  missingDepends,
  parseArguments,
  payloadRecords,
  replacePackageField,
  normalizeTauriDeb,
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

/** 必需运行库允许直接项带版本约束，备选组不能保证具体某个库会安装。 */
test("reports_missing_runtime_dependencies", () => {
  assert.deepEqual(missingDepends(CONTROL, ["libwebkit2gtk-4.1-0", "libgtk-3-0"]), []);
  assert.deepEqual(missingDepends(CONTROL, ["libayatana-appindicator3-1", "libappindicator3-1", "libssl3"]),
    ["libayatana-appindicator3-1", "libappindicator3-1", "libssl3"]);
});

/** 备选组两侧都不能绕过必需库门禁，另有独立直接项时才通过。 */
test("alternative_dependencies_do_not_satisfy_required_libraries", () => {
  for (const depends of ["libother | libneeded", "libneeded (>= 1.0) | libother"]) {
    const control = `Depends: ${depends}\n`;
    assert.deepEqual(missingDepends(control, ["libneeded"]), ["libneeded"]);
    assert.deepEqual(missingDepends(`Depends: ${depends}, libneeded (>= 1.0)\n`, ["libneeded"]), []);
  }
});

/** payload 记录覆盖权限、链接目标与内容摘要，并跳过根 DEBIAN 目录。 */
test("payload_records_detect_mode_link_and_content_changes", (t) => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "tauri-deb-payload-"));
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

/** 通过真实 Node CLI 宿主中断调用 main，证明 signal 传递与收尾等待并移除监听器。 */
test("cli_signal_waits_for_normalization_cleanup_and_removes_handlers", {
  skip: process.platform === "win32", timeout: 10_000,
}, async () => {
  const moduleUrl = new URL("./normalize_tauri_deb.mjs", import.meta.url).href;
  const source = `import {main} from ${JSON.stringify(moduleUrl)};
try { await main(['--project-root','.','--package-name','test-app'], async ({signal}) => {
  if (!signal) throw Error('missing signal');
  const heartbeat=setInterval(()=>{},1000);
  process.stdout.write('ready\\n');
  try { await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true})); }
  finally { clearInterval(heartbeat); }
  await new Promise(resolve=>setTimeout(resolve,100));
  process.stdout.write('cleanup-complete\\n');
  throw Error('cancelled');
}); } catch { process.stdout.write('listeners:'+process.listenerCount('SIGTERM')+'\\n'); process.exitCode=1; }`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", source], { stdio: ["ignore", "pipe", "pipe"] });
  let output = ""; child.stdout.on("data", chunk => { output += chunk; });
  const done = once(child, "close");
  try {
    await once(child.stdout, "data");
    child.kill("SIGTERM");
    const [code, signal] = await done;
    assert.equal(code, 1); assert.equal(signal, null);
    assert.match(output, /cleanup-complete\nlisteners:0/u);
  } finally { if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await done; } }
});

/** Linux 原生实际打包、解包、替换、重打包及 CLI 输出；其它宿主不声称执行 dpkg。 */
test("native_dpkg_normalization_preserves_original_payload_and_complete_evidence", {
  skip: process.platform !== "linux" || !["x64", "arm64"].includes(process.arch), timeout: 30_000,
}, async t => {
  const available = spawnSync("dpkg-deb", ["--version"], { encoding: "utf8", timeout: 5000 });
  if (available.error?.code === "ENOENT") { t.skip("dpkg-deb is not installed on this Linux host"); return; }
  assert.equal(available.status, 0);
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "tauri-deb-native-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const architecture = process.arch === "x64" ? "amd64" : "arm64";
  fs.writeFileSync(path.join(root, "Cargo.toml"), '[workspace.package]\nversion = "1.2.3"\n');
  const originalTree = path.join(root, "package");
  fs.mkdirSync(path.join(originalTree, "DEBIAN"), { recursive: true });
  const control = `Package: original-app\nVersion: 1.2.3\nArchitecture: ${architecture}\nMaintainer: Test <test@example.invalid>\nDepends: libc6\nDescription: engineering fixture\n`;
  fs.writeFileSync(path.join(originalTree, "DEBIAN/control"), control);
  fs.writeFileSync(path.join(originalTree, "DEBIAN/postinst"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  fs.mkdirSync(path.join(originalTree, "usr/bin"), { recursive: true });
  fs.writeFileSync(path.join(originalTree, "usr/bin/app"), "#!/bin/sh\nprintf fixture\n", { mode: 0o755 });
  fs.symlinkSync("app", path.join(originalTree, "usr/bin/app-link"));
  const bundle = path.join(root, "target/release/bundle/deb"); fs.mkdirSync(bundle, { recursive: true });
  const input = path.join(bundle, `original-app_1.2.3_${architecture}.deb`);
  const build = spawnSync("dpkg-deb", ["--build", "--root-owner-group", originalTree, input], { encoding: "utf8", timeout: 10_000 });
  assert.equal(build.status, 0, build.stderr);
  const originalHash = sha256File(input);
  const result = await normalizeTauriDeb({ projectRoot: root, packageName: "normalized-app", input, requireDepends: ["libc6"] });
  assert.equal(sha256File(input), originalHash);
  assert.equal(result.originalSha256, originalHash);
  assert.equal(result.sha256, sha256File(result.output));
  assert.deepEqual(JSON.parse(fs.readFileSync(`${result.output}.inspection.json`, "utf8")), result);
  const verified = path.join(root, "verified");
  const extract = spawnSync("dpkg-deb", ["--raw-extract", result.output, verified], { encoding: "utf8", timeout: 10_000 });
  assert.equal(extract.status, 0, extract.stderr);
  assert.equal(fs.readFileSync(path.join(verified, "DEBIAN/control"), "utf8"), replacePackageField(control, "normalized-app"));
  assert.equal(sha256File(path.join(verified, "DEBIAN/postinst")), sha256File(path.join(originalTree, "DEBIAN/postinst")));
  assert.deepEqual(payloadRecords(verified), payloadRecords(originalTree));
  const helper = fileURLToPath(new URL("./normalize_tauri_deb.mjs", import.meta.url));
  const cli = spawnSync(process.execPath, [helper, "--project-root", root, "--package-name", "normalized-app", "--require-depends", "libc6"], { encoding: "utf8", timeout: 20_000 });
  assert.equal(cli.status, 0, cli.stderr);
  const repeated = JSON.parse(cli.stdout);
  assert.notEqual(repeated.output, result.output);
  assert.equal(repeated.sha256, sha256File(repeated.output));
  const before = fs.readdirSync(path.join(root, "target/local-install-linux/artifacts")).sort();
  await assert.rejects(normalizeTauriDeb({ projectRoot: root, packageName: "normalized-app", input, requireDepends: ["missing-library"] }), /runtime dependencies missing/u);
  assert.deepEqual(fs.readdirSync(path.join(root, "target/local-install-linux/artifacts")).sort(), before);
});
