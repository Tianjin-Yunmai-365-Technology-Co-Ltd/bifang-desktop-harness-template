#!/usr/bin/env node
/**
 * 为 Linux 本地试包规范 Tauri 生成的 Debian 安装标识，并证明安装内容逐项不变。
 *
 * Tauri bundler 由 `productName` 派生 deb 的 `Package:` 字段；非 ASCII 产品名会生成 dpkg 拒绝解析的值。
 * 本 helper 只替换该字段，保留界面显示名、其他控制字段与全部 payload，原始包保留在 Tauri 输出目录供复核。
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Debian Policy 5.6.1 的包名语法：小写字母数字开头，至少两个字符，只含 `a-z0-9+.-`。 */
const DEBIAN_PACKAGE_NAME = /^[a-z0-9][a-z0-9+.-]+$/;
/** Node `process.arch` 到 Debian 架构名的显式映射；未列出的架构失败关闭。 */
const DEBIAN_ARCHITECTURES = { arm64: "arm64", x64: "amd64" };

/** 判断安装标识是否满足 Debian 包名语法。 */
export function isDebianPackageName(value) {
  return typeof value === "string" && DEBIAN_PACKAGE_NAME.test(value);
}

/** 读取恰好出现一次的控制字段值；缺失或重复都视为不可信控制文件。 */
export function controlField(control, name) {
  const matches = [...control.matchAll(new RegExp(`^${name}: ([^\\r\\n]*)$`, "gm"))];
  if (matches.length !== 1) throw new Error(`expected exactly one ${name} field`);
  return matches[0][1];
}

/** 只替换 `Package:` 一行，其余字段、续行与换行风格保持原样。 */
export function replacePackageField(control, packageName) {
  if (!isDebianPackageName(packageName)) throw new Error("package name must follow Debian package name syntax");
  controlField(control, "Package");
  return control.replace(/^Package: [^\r\n]*$/m, `Package: ${packageName}`);
}

/** 必需运行库只认可独立直接依赖；备选组允许不安装该库，不能作为必需性证明。 */
export function missingDepends(control, required) {
  const declared = controlField(control, "Depends")
    .split(",")
    .filter((group) => !group.includes("|"))
    .map((value) => value.trim().split(/[ (]/)[0]);
  return required.filter((name) => !declared.includes(name));
}

/** 计算普通文件的实际字节摘要。 */
function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/**
 * 以相对路径、类型、权限位、链接目标与文件摘要列出安装内容；不跟随符号链接，跳过根下 `DEBIAN`。
 * 遇到设备、FIFO 等非常规条目直接失败，避免把无法比较的内容当作未变化。
 */
export function payloadRecords(directory, relative = "") {
  const records = [];
  for (const name of fs.readdirSync(path.join(directory, relative)).sort()) {
    if (!relative && name === "DEBIAN") continue;
    const entry = path.join(relative, name);
    const absolute = path.join(directory, entry);
    const stat = fs.lstatSync(absolute);
    const mode = stat.mode & 0o7777;
    if (stat.isSymbolicLink()) records.push([entry, "link", mode, fs.readlinkSync(absolute)]);
    else if (stat.isDirectory()) records.push([entry, "directory", mode], ...payloadRecords(directory, entry));
    else if (stat.isFile()) records.push([entry, "file", mode, sha256(absolute)]);
    else throw new Error(`unsupported payload entry: ${entry}`);
  }
  return records;
}

/** 只调用系统 `dpkg-deb` 的固定参数，不经过 shell。 */
function dpkg(...args) {
  return execFileSync("dpkg-deb", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
}

/** 从根 `Cargo.toml` 的 `[workspace.package]` 读取产品版本，作为输入包版本的唯一对照。 */
function workspaceVersion(projectRoot) {
  const cargo = fs.readFileSync(path.join(projectRoot, "Cargo.toml"), "utf8");
  const version = cargo.match(/\[workspace\.package\][\s\S]*?^version = "([0-9]+\.[0-9]+\.[0-9]+)"/m)?.[1];
  if (!version) throw new Error("workspace version missing from root Cargo.toml");
  return version;
}

/** 解析 `--name value` 形式参数；`--require-depends` 可重复，其余参数只允许出现一次。 */
export function parseArguments(argv) {
  const args = { requireDepends: [] };
  const single = new Set(["--project-root", "--package-name", "--input"]);
  for (let index = 0; index < argv.length; index += 2) {
    const [key, value] = [argv[index], argv[index + 1]];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${key}`);
    if (key === "--require-depends") args.requireDepends.push(value);
    else if (single.has(key) && args[key] === undefined) args[key] = value;
    else throw new Error(`invalid argument: ${key}`);
  }
  if (!args["--project-root"] || !args["--package-name"]) throw new Error("--project-root and --package-name are required");
  return {
    projectRoot: path.resolve(args["--project-root"]),
    packageName: args["--package-name"],
    input: args["--input"] ? path.resolve(args["--input"]) : null,
    requireDepends: args.requireDepends,
  };
}

/**
 * 在私有暂存目录解包、改写 `Package:`、重新打包并二次解包核对；全部核对通过后才原子放入
 * `target/local-install-linux/artifacts/`，同时写出 `.sha256` 与 `.inspection.json` 侧车。
 */
export function normalizeTauriDeb({ projectRoot, packageName, input, requireDepends }) {
  if (process.platform !== "linux") throw new Error("Linux native host required");
  if (!isDebianPackageName(packageName)) throw new Error("package name must follow Debian package name syntax");
  const architecture = DEBIAN_ARCHITECTURES[process.arch];
  if (!architecture) throw new Error("unsupported native architecture");
  const version = workspaceVersion(projectRoot);
  const bundleRoot = fs.realpathSync(path.join(projectRoot, "target/release/bundle/deb"));
  const candidates = fs.readdirSync(bundleRoot).filter((name) => name.endsWith(`_${version}_${architecture}.deb`));
  if (!input && candidates.length !== 1) throw new Error("expected exactly one current-version native deb");
  const source = input ?? path.join(bundleRoot, candidates[0]);
  if (!source.startsWith(`${bundleRoot}${path.sep}`) || fs.realpathSync(source) !== source
      || !fs.lstatSync(source).isFile() || path.extname(source) !== ".deb") {
    throw new Error("input must be a regular Tauri deb inside target/release/bundle/deb");
  }
  const outputRoot = path.join(projectRoot, "target/local-install-linux/artifacts");
  fs.mkdirSync(outputRoot, { recursive: true });
  if (fs.realpathSync(outputRoot) !== outputRoot) throw new Error("output directory must not traverse symbolic links");
  const staging = fs.mkdtempSync(path.join(outputRoot, ".deb-normalize-"));
  fs.chmodSync(staging, 0o700);
  try {
    const unpacked = path.join(staging, "original");
    dpkg("--raw-extract", source, unpacked);
    const controlPath = path.join(unpacked, "DEBIAN/control");
    if (!fs.lstatSync(controlPath).isFile()) throw new Error("control must be a regular file");
    const originalControl = fs.readFileSync(controlPath, "utf8");
    if (controlField(originalControl, "Version") !== version
        || controlField(originalControl, "Architecture") !== architecture) {
      throw new Error("source package version or architecture differs from this native build");
    }
    const missing = missingDepends(originalControl, requireDepends);
    if (missing.length > 0) throw new Error(`required runtime dependencies missing: ${missing.join(", ")}`);
    const controlFiles = fs.readdirSync(path.join(unpacked, "DEBIAN")).sort();
    if (controlFiles.some((name) => !fs.lstatSync(path.join(unpacked, "DEBIAN", name)).isFile())) {
      throw new Error("control entries must be regular files");
    }
    const otherControlHashes = controlFiles
      .filter((name) => name !== "control")
      .map((name) => [name, sha256(path.join(unpacked, "DEBIAN", name))]);
    const originalPayload = payloadRecords(unpacked);
    const normalizedControl = replacePackageField(originalControl, packageName);
    fs.writeFileSync(controlPath, normalizedControl);
    const temporary = path.join(staging, "normalized.deb");
    dpkg("--build", "--root-owner-group", unpacked, temporary);
    const verified = path.join(staging, "verified");
    dpkg("--raw-extract", temporary, verified);
    if (fs.readFileSync(path.join(verified, "DEBIAN/control"), "utf8") !== normalizedControl
        || JSON.stringify(payloadRecords(verified)) !== JSON.stringify(originalPayload)) {
      throw new Error("normalized package changed control unexpectedly or changed installed payload");
    }
    const verifiedControlFiles = fs.readdirSync(path.join(verified, "DEBIAN")).sort();
    if (JSON.stringify(controlFiles) !== JSON.stringify(verifiedControlFiles)
        || otherControlHashes.some(([name, hash]) => sha256(path.join(verified, "DEBIAN", name)) !== hash)) {
      throw new Error("normalized package changed other control files");
    }
    const output = path.join(outputRoot, `${packageName}-v${version}-linux-${process.arch}-local.deb`);
    if (fs.existsSync(output) && !fs.lstatSync(output).isFile()) throw new Error("output is not a regular file");
    const result = {
      artifactPurpose: "local-install-test", releaseCandidate: false, signingStatus: "unsigned",
      original: source, originalSha256: sha256(source), originalPackage: controlField(originalControl, "Package"),
      output, packageName, version, architecture, payloadUnchanged: true,
      sha256: sha256(temporary), bytes: fs.statSync(temporary).size,
    };
    const checksum = path.join(staging, "checksum");
    const inspection = path.join(staging, "inspection");
    fs.writeFileSync(checksum, `${result.sha256}  ${path.basename(output)}\n`, { flag: "wx" });
    fs.writeFileSync(inspection, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
    // 同目录原子重命名，绝不跟随已有的符号链接把产物或侧车写到目录外。
    fs.renameSync(temporary, output);
    fs.renameSync(checksum, `${output}.sha256`);
    fs.renameSync(inspection, `${output}.inspection.json`);
    return result;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(normalizeTauriDeb(parseArguments(process.argv.slice(2))), null, 2));
  } catch (error) {
    console.error(`Tauri deb normalization failed: ${error.message}`);
    process.exitCode = 1;
  }
}
