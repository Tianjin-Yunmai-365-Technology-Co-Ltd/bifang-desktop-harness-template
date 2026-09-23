import fs from "node:fs";
import path from "node:path";

import { ROOT, fail, readText, relativePath } from "./core.mjs";
import { sourceFileHasExecutableMode } from "./initialization_environment.mjs";
import {
  E2E_SKILL,
  ENVIRONMENT_REFERENCE,
  GITIGNORE,
  GUI_ADAPTER_SKILL,
  INITIALIZE_SKILL,
  MACOS_DMG_BACKGROUND,
  MACOS_XWIN_GATE,
  MCP_SKILL,
  PREREQUISITE_UNIX,
  PREREQUISITE_WINDOWS,
  PRODUCT_SPEC,
  PRODUCT_STATUS,
  RUST_ASSET,
  RUST_BASELINE,
  TAURI_DMG_LAYOUT_HELPER,
  TAURI_NOTARIZATION_HELPER,
  TAURI_RELEASE_DIRECTORY_HELPER,
  TUI_SKILL,
  CLI_SKILL,
  WORK_PLAN,
} from "./initialization_paths.mjs";
import { primaryRequiredFragments } from "./initialization_primary_contract.mjs";
import { repositoryRequiredFragments } from "./initialization_repository_contract.mjs";
import { parseCargoToml } from "./initialization_toml.mjs";

export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const CARGO_MINIMUM_REQUIREMENT = /^\^?\d+\.\d+\.\d+$/u;
export const EXPECTED_REGISTRY_FLOORS = new Map([
  ["assert_cmd", "2.2.2"],
  ["clap", "4.6.6"],
  ["jiff", "0.2.35"],
  ["serde", "1.0.229"],
  ["serde_json", "1.0.151"],
  ["tokio", "1.53.1"],
]);

let crcTable;
function pngCrc32(buffer) {
  if (!crcTable) {
    crcTable = Array.from({ length: 256 }, (_, value) => {
      let current = value;
      for (let bit = 0; bit < 8; bit += 1) {
        current = (current & 1) ? (0xedb88320 ^ (current >>> 1)) : (current >>> 1);
      }
      return current >>> 0;
    });
  }
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Reject registry requirements without a full compatible three-part minimum. */
export function validateWorkspaceDependencyMinimums(errors, dependencies) {
  if (!dependencies || Array.isArray(dependencies) || typeof dependencies !== "object") {
    fail(errors, "Rust asset root manifest has no workspace dependency table");
    return;
  }
  for (const [name, declaration] of Object.entries(dependencies)) {
    let version;
    if (typeof declaration === "string") version = declaration;
    else if (declaration && !Array.isArray(declaration) && typeof declaration === "object") {
      if (Object.hasOwn(declaration, "path") && !Object.hasOwn(declaration, "version")) continue;
      if (["git", "branch", "tag", "rev"].some((key) => Object.hasOwn(declaration, key))) {
        fail(errors, `workspace dependency must not use Git selectors: ${name}`);
        continue;
      }
      version = declaration.version;
    }
    if (typeof version !== "string" || !CARGO_MINIMUM_REQUIREMENT.test(version)) {
      fail(
        errors,
        `workspace registry dependency must use a compatible full three-part minimum requirement: ${name}=${JSON.stringify(version)}`,
      );
    }
  }
}

/** Validate the bundled DMG background down to PNG chunk lengths and checksums. */
export function validateMacosDmgBackgroundAsset(errors, assetPath = MACOS_DMG_BACKGROUND) {
  let stat;
  try {
    stat = fs.lstatSync(assetPath);
  } catch (error) {
    fail(errors, `macOS DMG background must be a regular file: ${relativePath(assetPath)} (${error.message})`);
    return;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail(errors, `macOS DMG background must be a regular file: ${relativePath(assetPath)}`);
    return;
  }
  let payload;
  try {
    payload = fs.readFileSync(assetPath);
  } catch (error) {
    fail(errors, `cannot read macOS DMG background ${relativePath(assetPath)}: ${error.message}`);
    return;
  }
  if (payload.length < 4096 || !payload.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    fail(errors, `macOS DMG background is not a nontrivial PNG: ${relativePath(assetPath)}`);
    return;
  }

  let offset = PNG_SIGNATURE.length;
  let dimensions = null;
  let idatBytes = 0;
  let sawIend = false;
  while (offset < payload.length) {
    if (offset + 12 > payload.length) {
      fail(errors, `macOS DMG background has a truncated PNG chunk: ${relativePath(assetPath)}`);
      return;
    }
    const length = payload.readUInt32BE(offset);
    const type = payload.subarray(offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > payload.length) {
      fail(errors, `macOS DMG background has an invalid PNG chunk length: ${relativePath(assetPath)}`);
      return;
    }
    const data = payload.subarray(offset + 8, offset + 8 + length);
    const expected = payload.readUInt32BE(offset + 8 + length);
    const actual = pngCrc32(Buffer.concat([type, data]));
    if (actual !== expected) {
      fail(errors, `macOS DMG background has an invalid PNG checksum: ${relativePath(assetPath)}`);
      return;
    }
    const name = type.toString("ascii");
    if (offset === PNG_SIGNATURE.length) {
      if (name !== "IHDR" || length !== 13) {
        fail(errors, `macOS DMG background has no leading IHDR: ${relativePath(assetPath)}`);
        return;
      }
      dimensions = [data.readUInt32BE(0), data.readUInt32BE(4)];
    }
    if (name === "IDAT") idatBytes += length;
    if (name === "IEND") {
      if (length !== 0 || end !== payload.length) {
        fail(errors, `macOS DMG background has an invalid PNG terminator: ${relativePath(assetPath)}`);
        return;
      }
      sawIend = true;
    }
    offset = end;
  }
  if (!dimensions || dimensions[0] !== 660 || dimensions[1] !== 400) {
    fail(
      errors,
      `macOS DMG background dimensions must be 660x400: ${relativePath(assetPath)} observed ${JSON.stringify(dimensions)}`,
    );
  }
  if (idatBytes === 0 || !sawIend) {
    fail(errors, `macOS DMG background has incomplete PNG image data: ${relativePath(assetPath)}`);
  }
}

function validateRequiredFragments(errors, contracts) {
  for (const [filePath, fragments] of contracts) {
    let source;
    try {
      source = readText(filePath);
    } catch (error) {
      fail(errors, `missing initialization contract file: ${relativePath(filePath)} (${error.message})`);
      continue;
    }
    for (const fragment of fragments) {
      if (!source.includes(fragment)) {
        fail(errors, `initialization gate missing in ${relativePath(filePath)}: ${fragment}`);
      }
    }
  }
}

function validateRemovedAndForbiddenContracts(errors) {
  const removedWebSkill = path.join(ROOT, ".agents", "skills", "add-web-adapter");
  if (fs.existsSync(removedWebSkill)) {
    fail(errors, `removed standalone WEB skill still exists: ${relativePath(removedWebSkill)}`);
  }
  const removedWebFragments = new Map([
    [INITIALIZE_SKILL, ["`WEB`", "$add-web-adapter", "_web"]],
    [MCP_SKILL, ["Keep CLI mandatory", "required CLI"]],
    [GUI_ADAPTER_SKILL, [
      "Keep CLI mandatory",
      "required CLI",
      "do not add Node, a frontend framework",
    ]],
    [E2E_SKILL, ["GUI, or WEB artifact", "- WEB:"]],
  ]);
  for (const [filePath, fragments] of removedWebFragments) {
    if (!fs.existsSync(filePath)) continue;
    const source = readText(filePath);
    for (const fragment of fragments) {
      if (source.includes(fragment)) {
        fail(errors, `removed or business-first initialization contract remains in ${relativePath(filePath)}: ${fragment}`);
      }
    }
  }

  const initializationSource = readText(INITIALIZE_SKILL);
  for (const stale of [
    "只有包含 `GUI` 的选择才增加阻断性的 Node.js 和 pnpm 门禁",
    "replace the sample operation with the approved core success path",
    "CLI as the required",
  ]) {
    if (initializationSource.includes(stale)) {
      fail(errors, `business-first initialization regression in ${relativePath(INITIALIZE_SKILL)}: ${stale}`);
    }
  }
}

function validateNeutralAsset(errors, rustAsset) {
  const contracts = new Map([
    [path.join(rustAsset, "example_tool_core", "src", "lib.rs"), [
      "pub async fn scaffold_status",
      "product_definition_required",
    ]],
    [path.join(rustAsset, "example_tool_cli", "src", "adapter.rs"), [
      "ScaffoldCommand",
      'command: "scaffold.status"',
      "product_definition_required",
    ]],
    [path.join(rustAsset, "example_tool_cli", "tests", "cli.rs"), [
      '"scaffold", "status", "--json"',
      'value["data"]["productDefinitionRequired"]',
      "rejects_unapproved_business_commands",
    ]],
    [path.join(rustAsset, "Cargo.toml"), [
      'features = ["macros", "rt"]',
      "[workspace.metadata.agent-first-harness]",
      "target-platforms = []",
      "interfaces = []",
    ]],
    [path.join(rustAsset, "example_tool_cli", "src", "main.rs"), [
      '#[tokio::main(flavor = "current_thread")]',
    ]],
    [GITIGNORE, ["/release/"]],
    [path.join(rustAsset, ".gitignore"), ["/release/"]],
  ]);
  validateRequiredFragments(errors, contracts);
  const forbidden = new Map([
    [path.join(rustAsset, "example_tool_core", "src", "lib.rs"), ["pub async fn execute"]],
    [path.join(rustAsset, "Cargo.toml"), ['features = ["macros", "rt-multi-thread"]']],
    [path.join(rustAsset, "example_tool_cli", "src", "main.rs"), ['flavor = "multi_thread"']],
  ]);
  for (const [filePath, fragments] of forbidden) {
    if (!fs.existsSync(filePath)) continue;
    const source = readText(filePath);
    for (const fragment of fragments) {
      if (source.includes(fragment)) {
        fail(errors, `business-first initialization regression in ${relativePath(filePath)}: ${fragment}`);
      }
    }
  }
}

function validateNaming(errors) {
  const files = [
    INITIALIZE_SKILL,
    CLI_SKILL,
    TUI_SKILL,
    MCP_SKILL,
    GUI_ADAPTER_SKILL,
    RUST_BASELINE,
    PRODUCT_SPEC,
    PRODUCT_STATUS,
    WORK_PLAN,
    path.join(ROOT, "README.md"),
    path.join(ROOT, "AGENTS.md"),
  ];
  const fragments = [
    "<project-id>-core",
    "<project-id>-CLI",
    "<project-id>-MCP",
    "<project-id>-gui",
    "<项目标识>-core",
    "<项目标识>-CLI",
    "<项目标识>-MCP",
    "<项目标识>-gui",
  ];
  for (const filePath of files) {
    if (!fs.existsSync(filePath)) continue;
    const source = readText(filePath);
    for (const fragment of fragments) {
      if (source.includes(fragment)) {
        fail(errors, `legacy mixed-separator naming remains in ${relativePath(filePath)}: ${fragment}`);
      }
    }
  }
}

function validatePrerequisiteScripts(errors) {
  const required = new Map([
    [PREREQUISITE_UNIX, [
      "--install-missing",
      "--check-only",
      "https://static.rust-lang.org/rustup/dist",
      "https://nodejs.org/dist",
      "SHASUMS256.txt",
      "MIN_RUST_PATCH=1",
      "NODE_REQUIREMENT='>=24.21.0'",
      "PNPM_REQUIREMENT='>=12.4.1'",
      "validate_node",
      "validate_pnpm",
      "not-required",
      "upgrade-required",
      "node.archive.sha256=",
      "gate.fresh_shell.status=",
    ]],
    [PREREQUISITE_WINDOWS, [
      "[switch]$CheckOnly",
      "https://static.rust-lang.org/rustup/dist",
      "https://nodejs.org/dist",
      "function Get-Sha256File",
      'NodeRequirement = ">=24.21.0"',
      'PnpmRequirement = ">=12.4.1"',
      "Test-NodeVersion",
      "not-required",
      "upgrade-required",
      "node.archive.sha256=",
      "SelectedNodeVersion",
    ]],
    [MACOS_XWIN_GATE, [
      "--install-missing",
      "--check-only",
      "x86_64-pc-windows-msvc",
      "CARGO_XWIN_REQUIREMENT='>=0.23.1, <0.24.0'",
      "gate.cargo_xwin.requirement=",
      "本门禁不自动安装 Homebrew",
      "USER_CARGO_HOME=",
    ]],
  ]);
  validateRequiredFragments(errors, required);

  const forbidden = new Map([
    [PREREQUISITE_UNIX, [
      'mktemp "$config_dir/.env.sh.tmp.XXXXXX"',
      "$USER_HOME/.local/share/agent-first-harness/bin",
    ]],
    [PREREQUISITE_WINDOWS, [
      "$env:CARGO_HOME =",
      "$env:RUSTUP_HOME =",
      "Invoke-ManagedRustCommand",
    ]],
  ]);
  for (const [filePath, fragments] of forbidden) {
    const source = readText(filePath);
    for (const fragment of fragments) {
      if (source.includes(fragment)) {
        fail(errors, `private or superseded environment behavior remains in ${relativePath(filePath)}: ${fragment}`);
      }
    }
  }

  for (const helper of [
    PREREQUISITE_UNIX,
    MACOS_XWIN_GATE,
    TAURI_NOTARIZATION_HELPER,
    TAURI_RELEASE_DIRECTORY_HELPER,
    TAURI_DMG_LAYOUT_HELPER,
  ]) {
    if (fs.existsSync(helper) && !sourceFileHasExecutableMode(helper)) {
      fail(errors, `shell helper is not executable: ${relativePath(helper)}`);
    }
  }
  if (readText(PREREQUISITE_UNIX).includes("https://sh.rustup.rs")) {
    fail(errors, "Unix 前置门禁必须验证 rustup-init，不得执行引导脚本文本");
  }
  if (readText(PREREQUISITE_WINDOWS).includes("Invoke-Expression")) {
    fail(errors, "Windows 前置门禁不得通过 Invoke-Expression 执行下载的文本");
  }
}

function readCargoManifest(errors, manifestPath, label) {
  try {
    return parseCargoToml(readText(manifestPath));
  } catch (error) {
    fail(errors, `invalid ${label} ${relativePath(manifestPath)}: ${error.message}`);
    return null;
  }
}

function memberDependencyTables(memberData) {
  const tables = [];
  for (const name of ["dependencies", "dev-dependencies", "build-dependencies"]) {
    if (memberData[name] && typeof memberData[name] === "object") tables.push(memberData[name]);
  }
  for (const target of Object.values(memberData.target ?? {})) {
    if (!target || typeof target !== "object") continue;
    for (const name of ["dependencies", "dev-dependencies", "build-dependencies"]) {
      if (target[name] && typeof target[name] === "object") tables.push(target[name]);
    }
  }
  return tables;
}

/** Validate Cargo floors, exact neutral members, and workspace-only member declarations. */
export function validateRustAssetManifests(errors, rustAsset = RUST_ASSET) {
  const rootManifest = path.join(rustAsset, "Cargo.toml");
  if (!fs.existsSync(rootManifest)) {
    fail(errors, `missing Rust asset manifest: ${relativePath(rootManifest)}`);
    return;
  }
  const rootData = readCargoManifest(errors, rootManifest, "Rust asset root manifest");
  if (!rootData) return;
  const workspace = rootData.workspace ?? {};
  const dependencies = workspace.dependencies ?? {};
  validateWorkspaceDependencyMinimums(errors, dependencies);
  for (const [name, expected] of EXPECTED_REGISTRY_FLOORS) {
    const declaration = dependencies[name];
    const actual = typeof declaration === "string" ? declaration : declaration?.version;
    if (actual !== expected) {
      fail(errors, `Rust asset dependency floor drifted from the verified baseline: ${name}=${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    }
  }
  const metadata = workspace.metadata?.["agent-first-harness"];
  if (!metadata || Object.keys(metadata).sort().join(",") !== "interfaces,target-platforms"
      || !Array.isArray(metadata.interfaces) || metadata.interfaces.length !== 0
      || !Array.isArray(metadata["target-platforms"]) || metadata["target-platforms"].length !== 0) {
    fail(errors, "Rust asset workspace metadata must contain only empty target-platforms/interfaces placeholders");
  }
  const expectedMembers = ["example_tool_core", "example_tool_cli"];
  if (JSON.stringify(workspace.members) !== JSON.stringify(expectedMembers)) {
    fail(errors, `Rust asset workspace members must be ${JSON.stringify(expectedMembers)}`);
  }
  if (dependencies.example_tool_core?.path !== "example_tool_core") {
    fail(errors, "workspace dependency missing internal core path");
  }

  const memberManifests = [];
  for (const pattern of Array.isArray(workspace.members) ? workspace.members : []) {
    let matches;
    try {
      matches = fs.globSync(pattern, { cwd: rustAsset });
    } catch (error) {
      fail(errors, `invalid workspace member pattern ${pattern}: ${error.message}`);
      continue;
    }
    if (matches.length === 0) fail(errors, `workspace member has no Cargo.toml: ${pattern}`);
    for (const match of matches.sort()) {
      const candidate = path.join(rustAsset, match);
      const manifest = fs.statSync(candidate).isDirectory() ? path.join(candidate, "Cargo.toml") : candidate;
      if (path.basename(manifest) !== "Cargo.toml" || !fs.existsSync(manifest)) {
        fail(errors, `workspace member has no Cargo.toml: ${pattern}`);
        continue;
      }
      if (!memberManifests.includes(manifest)) memberManifests.push(manifest);
    }
  }
  if (memberManifests.length === 0) {
    fail(errors, "Rust asset contains no member manifests");
    return;
  }
  const declared = new Set(memberManifests.map((file) => path.resolve(file)));
  for (const manifest of fs.globSync("**/Cargo.toml", { cwd: rustAsset }).sort()) {
    const absolute = path.resolve(rustAsset, manifest);
    if (absolute !== path.resolve(rootManifest) && !declared.has(absolute)) {
      fail(errors, `crate manifest is not declared by root workspace members: ${relativePath(absolute)}`);
    }
  }

  for (const manifest of memberManifests) {
    const memberData = readCargoManifest(errors, manifest, "member manifest");
    if (!memberData) continue;
    if (path.basename(path.dirname(manifest)) === "example_tool_cli") {
      const names = Array.isArray(memberData.bin) ? memberData.bin.map((entry) => entry.name) : [];
      if (JSON.stringify(names) !== JSON.stringify(["example_tool_cli"])) {
        fail(errors, "Rust asset real binary must be named example_tool_cli");
      }
    }
    for (const table of memberDependencyTables(memberData)) {
      for (const [name, declaration] of Object.entries(table)) {
        if (!declaration || Array.isArray(declaration) || typeof declaration !== "object"
            || Object.keys(declaration).length !== 1 || declaration.workspace !== true) {
          fail(errors, `member dependency must use only <name>.workspace = true: ${relativePath(manifest)}: ${name}`);
          continue;
        }
        if (!Object.hasOwn(dependencies, name)) {
          fail(errors, `member dependency is not declared in root workspace: ${relativePath(manifest)}: ${name}`);
        }
      }
    }
  }
}

/** Validate the complete neutral initialization surface and all fail-closed prerequisites. */
export function validateInitializationContract(
  errors,
  {
    dmgPath = MACOS_DMG_BACKGROUND,
    rustAsset = RUST_ASSET,
    contracts = null,
    includeRepositoryContracts = true,
  } = {},
) {
  validateMacosDmgBackgroundAsset(errors, dmgPath);
  const required = contracts ?? primaryRequiredFragments(INITIALIZE_SKILL);
  if (includeRepositoryContracts && contracts === null) {
    for (const [file, fragments] of repositoryRequiredFragments(ENVIRONMENT_REFERENCE, RUST_BASELINE)) {
      required.set(file, fragments);
    }
  }
  validateRequiredFragments(errors, required);
  validateRemovedAndForbiddenContracts(errors);
  validateNeutralAsset(errors, rustAsset);
  validateNaming(errors);
  validatePrerequisiteScripts(errors);
  validateRustAssetManifests(errors, rustAsset);
}
