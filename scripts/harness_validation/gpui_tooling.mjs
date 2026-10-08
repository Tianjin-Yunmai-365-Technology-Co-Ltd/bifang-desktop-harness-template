import path from "node:path";

import { ROOT, fail, readText, relativePath, run } from "./core.mjs";
import { PREREQUISITE_UNIX, PREREQUISITE_WINDOWS } from "./initialization_paths.mjs";

const GPUI_SCRIPTS = ".agents/skills/desktop-add-gpui-adapter/scripts";
const REQUIRED_NODE_SCRIPTS = ["dev", "validate", "release:inspect", "release:notes", "release:context", "release:git", "gpui:package"];

// 只渲染中性文件并注入进程执行器，不运行 Rust、发布、安装或真实项目检查。
const TOOLING_PROBE = `
import { pathToFileURL } from "node:url";
const [toolingPath, rendererPath, runnerPath, root] = process.argv.slice(1);
const { renderGpuiPackageJson } = await import(pathToFileURL(toolingPath));
const { renderGpuiAdapterFiles } = await import(pathToFileURL(rendererPath));
const { validateGpui } = await import(pathToFileURL(runnerPath));
const files = renderGpuiAdapterFiles({ projectId: "tooling_probe", nameZh: "工程验证", nameEn: "Tooling Probe", owner: "Owner", sponsorPage: "disabled" });
const generated = files.get("package.json");
const original = { name: "existing-product", private: false, scripts: { custom: "node custom.mjs" }, engines: { npm: ">=11.0.0" }, custom: { preserve: true } };
const mergedText = renderGpuiPackageJson(JSON.stringify(original));
const conflicts = [ { engines: { node: ">=26.0.0" } }, { scripts: { validate: "node product-validation.mjs" } } ];
const rejected = conflicts.map(value => { try { renderGpuiPackageJson(JSON.stringify(value)); return false; } catch { return true; } });
const calls = [];
const status = validateGpui(root, (command, args, options) => { calls.push({ command, args, options }); return { status: [17, 0, 29][calls.length - 1] }; });
process.stdout.write(JSON.stringify({ generated: generated === undefined ? null : JSON.parse(generated), fresh: JSON.parse(renderGpuiPackageJson()), original, merged: JSON.parse(mergedText), idempotent: renderGpuiPackageJson(mergedText) === mergedText, rejected, calls, status }));
`;

/** 两个原生环境入口都必须由 GUI 接口决定 pnpm，不能再排除 GPUI。 */
export function validateGuiNodeEnvironment(errors, { unixPath = PREREQUISITE_UNIX, windowsPath = PREREQUISITE_WINDOWS } = {}) {
  for (const [file, kind] of [[unixPath, "POSIX"], [windowsPath, "PowerShell"]]) {
    let source;
    try { source = readText(file); }
    catch (error) { fail(errors, `GUI Node environment: ${error.message}`); continue; }
    const commonPnpm = kind === "POSIX"
      ? /case ",\$normalized_interfaces," in\s*\*,GUI,\*\)\s*PNPM_REQUIRED=1\s*;;\s*esac/u.test(source)
      : /^\$PnpmRequired\s*=\s*\(\$NormalizedInterfaces -contains "GUI"\)\s*$/mu.test(source);
    if (!commonPnpm) fail(errors, `${kind} pnpm requirement must apply to both Tauri and GPUI GUI selections: ${relativePath(file)}`);
  }
}

/** 根工程脚本只能指向保留的普通 Node helper，不能引用源 Harness runner 或 Tauri 前端。 */
function validatePackage(errors, document, sourceRoot, label) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    fail(errors, `${label} must generate a root package.json object`);
    return;
  }
  if (document.private !== true) fail(errors, `${label} must generate a private root package.json`);
  for (const [key, floor] of [["node", ">=24.21.0"], ["pnpm", ">=12.4.1"]]) {
    if (document.engines?.[key] !== floor) fail(errors, `${label} engine ${key} must remain ${floor}`);
  }
  for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    if (Object.keys(document[field] ?? {}).length) fail(errors, `${label} must not introduce npm dependencies`);
  }
  if (document.scripts?.test !== "cargo test --workspace --all-targets --all-features") {
    fail(errors, `${label} test must run the complete Rust workspace`);
  }
  for (const key of REQUIRED_NODE_SCRIPTS) {
    const command = document.scripts?.[key];
    const match = typeof command === "string" && /^node (\.agents\/skills\/[a-z0-9-]+\/scripts\/[a-z0-9_]+\.mjs)(?: [A-Za-z0-9_./:=+-]+)*$/u.exec(command);
    if (!match || /tauri|gui-adapter\//u.test(match[1])) {
      fail(errors, `${label} script ${key} must use a retained native GPUI Node helper`);
      continue;
    }
    if (key === "validate" && match[1] !== `${GPUI_SCRIPTS}/gpui_validate.mjs`) fail(errors, `${label} validate must use the retained GPUI runner`);
    if (key === "dev" && command !== `node ${GPUI_SCRIPTS}/gpui_dev.mjs --root .`) fail(errors, `${label} dev must use the retained GPUI development runner`);
    if (key === "gpui:package" && !match[1].endsWith("/desktop-build-gpui-release/scripts/build_gpui_release.mjs")) fail(errors, `${label} gpui:package must use the GPUI build skill`);
    try { readText(path.join(sourceRoot, match[1])); }
    catch (error) { fail(errors, `${label} script ${key}: ${error.message}`); }
  }
}

/** 验证真实模板输出、受限合并和三个保留门禁的调用；不把源码扫描当作下游验收。 */
export function validateGpuiNodeTooling(
  errors,
  {
    sourceRoot = ROOT,
    toolingPath = path.join(sourceRoot, GPUI_SCRIPTS, "gpui_node_tooling.mjs"),
    rendererPath = path.join(sourceRoot, GPUI_SCRIPTS, "gpui_adapter_files.mjs"),
    runnerPath = path.join(sourceRoot, GPUI_SCRIPTS, "gpui_validate.mjs"),
  } = {},
) {
  let result;
  try {
    for (const file of [toolingPath, rendererPath, runnerPath]) readText(file);
    const probe = run(process.execPath, ["--input-type=module", "-e", TOOLING_PROBE, toolingPath, rendererPath, runnerPath, sourceRoot], { timeout: 30_000 });
    if (probe.error || probe.status !== 0) throw new Error((probe.stderr || probe.error?.message || "probe failed").trim());
    result = JSON.parse(probe.stdout);
  } catch (error) {
    fail(errors, `GPUI Node tooling contract cannot execute: ${error.message}`);
    return;
  }
  validatePackage(errors, result.generated, sourceRoot, "GPUI adapter template");
  validatePackage(errors, result.fresh, sourceRoot, "GPUI Node tooling template");
  const { original, merged } = result;
  if (merged?.name !== original.name || merged?.private !== original.private
      || merged?.scripts?.custom !== original.scripts.custom || merged?.engines?.npm !== original.engines.npm
      || JSON.stringify(merged?.custom) !== JSON.stringify(original.custom) || !result.idempotent) {
    fail(errors, "GPUI package merge must preserve unrelated fields, visibility and unchanged bytes");
  }
  if (result.rejected?.length !== 2 || result.rejected.some(value => value !== true)) {
    fail(errors, "GPUI package merge must reject existing engine or script conflicts without lowering requirements");
  }
  const expected = [
    ["check_file_line_limits.mjs", "--root"],
    ["check_rust_chinese_comments.mjs", "--root"],
    ["check_core_first.mjs", "--workspace-root"],
  ];
  const actual = result.calls?.map(({ command, args, options }) => [
    command === process.execPath && options?.cwd === sourceRoot && options?.shell === false,
    path.basename(typeof args?.[0] === "string" ? args[0] : ""), args?.[1], args?.[2],
  ]);
  if (JSON.stringify(actual) !== JSON.stringify(expected.map(([file, option]) => [true, file, option, sourceRoot])) || result.status !== 17) {
    fail(errors, "GPUI validation runner must execute all three retained Node checks and return the first failure");
  }
}
