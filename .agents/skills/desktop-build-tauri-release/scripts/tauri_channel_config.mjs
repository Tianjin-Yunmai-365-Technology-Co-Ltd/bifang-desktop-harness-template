#!/usr/bin/env node
/** 从已发布上下文生成独立的 Tauri Beta 打包配置。 */

import { lstatSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { checkContext } from "../../desktop-prepare-release/scripts/release_context.mjs";

/** 读取普通 JSON 配置，平台专用文件可缺省。 */
function readConfig(file, optional = false) {
  try {
    if (!lstatSync(file).isFile()) throw new Error("Tauri config must be a regular file");
    const config = JSON.parse(readFileSync(file, "utf8"));
    if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("Tauri config must be an object");
    return config;
  } catch (error) {
    if (optional && error.code === "ENOENT") return undefined;
    throw error;
  }
}

/** 只合并参与身份的字段，遵循 Tauri 配置对象的 JSON Merge Patch 语义。 */
export function betaTauriConfig(configs, cargoBinary, cargoPackage) {
  let productName;
  let identifier;
  let mainBinaryName;
  let windows;
  let bundleName;
  for (const config of configs) {
    if (Object.hasOwn(config, "productName")) productName = config.productName;
    if (Object.hasOwn(config, "identifier")) identifier = config.identifier;
    if (Object.hasOwn(config, "mainBinaryName")) mainBinaryName = config.mainBinaryName;
    if (config.app === null) windows = undefined;
    else if (config.app && Object.hasOwn(config.app, "windows")) windows = config.app.windows;
    if (config.bundle === null || config.bundle?.macOS === null) bundleName = undefined;
    else if (config.bundle?.macOS && Object.hasOwn(config.bundle.macOS, "bundleName")) bundleName = config.bundle.macOS.bundleName;
  }
  productName ??= cargoPackage;
  mainBinaryName ??= cargoBinary;
  if (typeof productName !== "string" || !productName.trim() ||
      typeof identifier !== "string" || !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*$/u.test(identifier) ||
      typeof mainBinaryName !== "string" || !/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/u.test(mainBinaryName) ||
      /\.exe$/iu.test(mainBinaryName)) throw new Error("Tauri Beta requires a valid product name, application id and Cargo binary");
  const overlay = {
    productName: productName + " Beta",
    identifier: identifier + ".beta",
    mainBinaryName: mainBinaryName + "-beta",
  };
  if (typeof bundleName === "string" && bundleName.trim()) {
    overlay.bundle = { macOS: { bundleName: bundleName + " Beta" } };
  }
  if (windows != null) {
    if (!Array.isArray(windows)) throw new Error("Tauri app.windows must be an array");
    overlay.app = { windows: windows.map(window => ({
      ...window,
      title: window.title ? window.title + " Beta" : overlay.productName,
    })) };
  }
  return overlay;
}

/** 输出候选的构建环境值及可作为最终 --config 参数的临时文件。 */
function main() {
  const { values } = parseArgs({ options: {
    "project-root": { type: "string", default: "." },
    "gui-root": { type: "string" },
    platform: { type: "string" },
    "cargo-binary": { type: "string" },
    "cargo-package": { type: "string" },
  } });
  const { releaseChannel } = checkContext({ projectRoot: values["project-root"] }, { published: true });
  if (releaseChannel === "release") return { releaseChannel, configPath: null };
  if (!["macos", "windows"].includes(values.platform)) throw new Error("Select the candidate platform (macos or windows)");
  const root = realpathSync(values["project-root"]);
  const gui = realpathSync(resolve(root, values["gui-root"] ?? "."));
  const relation = relative(root, gui);
  if (relation === ".." || relation.startsWith(".." + sep) || isAbsolute(relation)) throw new Error("GUI root must be inside the project");
  const configRoots = [gui, join(gui, "src-tauri")].filter(directory => readConfig(join(directory, "tauri.conf.json"), true));
  if (configRoots.length !== 1) throw new Error("Locate the single tauri.conf.json before building Beta");
  const [configRoot] = configRoots;
  const configs = [
    readConfig(join(configRoot, "tauri.conf.json")),
    readConfig(join(configRoot, `tauri.${values.platform}.conf.json`), true),
    readConfig(join(gui, "src-tauri", "tauri.release.conf.json")),
  ].filter(Boolean);
  const config = betaTauriConfig(configs, values["cargo-binary"], values["cargo-package"]);
  const configPath = join(mkdtempSync(join(tmpdir(), "harness-tauri-beta-")), "tauri.beta.conf.json");
  writeFileSync(configPath, JSON.stringify(config), { mode: 0o600, flag: "wx" });
  return { releaseChannel, configPath, ...config };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(JSON.stringify(main()) + "\n");
  } catch (error) {
    process.stderr.write(error.message + "\n");
    process.exitCode = 1;
  }
}
