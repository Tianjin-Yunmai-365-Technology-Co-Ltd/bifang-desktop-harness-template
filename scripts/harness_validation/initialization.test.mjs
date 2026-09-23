import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ROOT } from "./core.mjs";
import {
  EXPECTED_REGISTRY_FLOORS,
  validateInitializationContract,
  validateMacosDmgBackgroundAsset,
  validateRustAssetManifests,
  validateWorkspaceDependencyMinimums,
} from "./initialization.mjs";
import { sourceFileHasExecutableMode } from "./initialization_environment.mjs";
import {
  ENVIRONMENT_REFERENCE,
  INITIALIZE_SKILL,
  MACOS_DMG_BACKGROUND,
  MACOS_XWIN_GATE,
  PREREQUISITE_UNIX,
  RUST_ASSET,
  RUST_BASELINE,
} from "./initialization_paths.mjs";
import { primaryRequiredFragments } from "./initialization_primary_contract.mjs";
import { repositoryRequiredFragments } from "./initialization_repository_contract.mjs";
import { parseCargoToml } from "./initialization_toml.mjs";

function withTemporaryDirectory(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "harness-initialization-validator-"));
  try {
    return callback(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function crcTable() {
  return Array.from({ length: 256 }, (_, value) => {
    let current = value;
    for (let bit = 0; bit < 8; bit += 1) {
      current = (current & 1) ? (0xedb88320 ^ (current >>> 1)) : (current >>> 1);
    }
    return current >>> 0;
  });
}

function crc32(buffer) {
  const table = crcTable();
  let crc = 0xffffffff;
  for (const byte of buffer) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function rewritePngDimensions(source, width, height) {
  const payload = Buffer.from(source);
  payload.writeUInt32BE(width, 16);
  payload.writeUInt32BE(height, 20);
  payload.writeUInt32BE(crc32(payload.subarray(12, 29)), 29);
  return payload;
}

function copyRustAsset(directory) {
  const destination = path.join(directory, "rust-lib-cli");
  fs.cpSync(RUST_ASSET, destination, { recursive: true });
  return destination;
}

test("production initialization contract succeeds", () => {
  const errors = [];
  validateInitializationContract(errors);
  assert.deepEqual(errors, []);
});

test("production DMG background is a complete 660x400 PNG", () => {
  const errors = [];
  validateMacosDmgBackgroundAsset(errors);
  assert.deepEqual(errors, []);
});

test("DMG background rejects valid PNG bytes with the wrong dimensions", () => {
  withTemporaryDirectory((directory) => {
    const asset = path.join(directory, "background.png");
    fs.writeFileSync(asset, rewritePngDimensions(fs.readFileSync(MACOS_DMG_BACKGROUND), 659, 400));
    const errors = [];
    validateMacosDmgBackgroundAsset(errors, asset);
    assert.match(errors.join("\n"), /dimensions must be 660x400/u);
  });
});

test("DMG background rejects a corrupt chunk checksum", () => {
  withTemporaryDirectory((directory) => {
    const payload = Buffer.from(fs.readFileSync(MACOS_DMG_BACKGROUND));
    payload[40] ^= 0x01;
    const asset = path.join(directory, "background.png");
    fs.writeFileSync(asset, payload);
    const errors = [];
    validateMacosDmgBackgroundAsset(errors, asset);
    assert.match(errors.join("\n"), /invalid PNG checksum/u);
  });
});

test("workspace dependency minimums accept registry floors and local paths", () => {
  const errors = [];
  validateWorkspaceDependencyMinimums(errors, {
    clap: { version: "4.6.6", features: ["derive"] },
    serde: "^1.0.229",
    local_core: { path: "local_core" },
  });
  assert.deepEqual(errors, []);
});

test("workspace dependency minimums reject selectors and incomplete versions", () => {
  const errors = [];
  validateWorkspaceDependencyMinimums(errors, {
    git_dep: { git: "https://example.invalid/repository" },
    broad: "1",
    exact: "=1.2.3",
    range: ">=1.2.3",
  });
  assert.match(errors.join("\n"), /must not use Git selectors: git_dep/u);
  assert.match(errors.join("\n"), /broad/u);
  assert.match(errors.join("\n"), /exact/u);
  assert.match(errors.join("\n"), /range/u);
});

test("Cargo parser handles dotted keys arrays inline tables and array tables", () => {
  const parsed = parseCargoToml(`
[workspace]
members = ["core", "cli"]

[workspace.dependencies]
serde = { version = "1.0.229", features = ["derive"] }
core = { path = "core" }

[[bin]]
name = "sample_cli"

[dev-dependencies]
serde.workspace = true
`);
  assert.deepEqual(parsed.workspace.members, ["core", "cli"]);
  assert.deepEqual(parsed.workspace.dependencies.serde, {
    version: "1.0.229",
    features: ["derive"],
  });
  assert.deepEqual(parsed.bin, [{ name: "sample_cli" }]);
  assert.deepEqual(parsed["dev-dependencies"].serde, { workspace: true });
});

test("Cargo parser rejects duplicate declarations", () => {
  assert.throws(
    () => parseCargoToml("[package]\nname = \"one\"\nname = \"two\"\n"),
    /duplicate TOML key/u,
  );
});

test("production Rust asset preserves exact verified floors and workspace inheritance", () => {
  const errors = [];
  validateRustAssetManifests(errors);
  assert.deepEqual(errors, []);
  assert.equal(EXPECTED_REGISTRY_FLOORS.get("tokio"), "1.53.1");
});

test("Rust asset rejects a drifted registry floor", () => {
  withTemporaryDirectory((directory) => {
    const asset = copyRustAsset(directory);
    const manifest = path.join(asset, "Cargo.toml");
    const source = fs.readFileSync(manifest, "utf8").replace('clap = { version = "4.6.6"', 'clap = { version = "4.6.5"');
    fs.writeFileSync(manifest, source, "utf8");
    const errors = [];
    validateRustAssetManifests(errors, asset);
    assert.match(errors.join("\n"), /dependency floor drifted.*clap/u);
  });
});

test("Rust asset rejects direct member dependency declarations", () => {
  withTemporaryDirectory((directory) => {
    const asset = copyRustAsset(directory);
    const manifest = path.join(asset, "example_tool_cli", "Cargo.toml");
    const source = fs.readFileSync(manifest, "utf8").replace("clap.workspace = true", 'clap = "4.6.6"');
    fs.writeFileSync(manifest, source, "utf8");
    const errors = [];
    validateRustAssetManifests(errors, asset);
    assert.match(errors.join("\n"), /member dependency must use only/u);
  });
});

test("Rust asset rejects an undeclared nested crate", () => {
  withTemporaryDirectory((directory) => {
    const asset = copyRustAsset(directory);
    const extra = path.join(asset, "forgotten");
    fs.mkdirSync(extra);
    fs.writeFileSync(path.join(extra, "Cargo.toml"), '[package]\nname = "forgotten"\nversion = "0.1.0"\n', "utf8");
    const errors = [];
    validateRustAssetManifests(errors, asset);
    assert.match(errors.join("\n"), /not declared by root workspace members/u);
  });
});

test("fragment validation fails closed on a missing initialization requirement", () => {
  withTemporaryDirectory((directory) => {
    const contract = path.join(directory, "contract.md");
    fs.writeFileSync(contract, "present\n", "utf8");
    const errors = [];
    validateInitializationContract(errors, {
      contracts: new Map([[contract, ["present", "required-but-missing"]]]),
      includeRepositoryContracts: false,
    });
    assert.match(errors.join("\n"), /required-but-missing/u);
  });
});

test("primary contract tracks final Node helper and test names", () => {
  const contracts = primaryRequiredFragments(INITIALIZE_SKILL);
  const relatives = new Set([...contracts.keys()].map((file) => path.relative(ROOT, file).split(path.sep).join("/")));
  for (const relative of [
    ".agents/skills/desktop-instantiate-project/scripts/resolve_project_target.mjs",
    ".agents/skills/desktop-instantiate-project/scripts/resolve_project_target.test.mjs",
    ".agents/skills/desktop-manage-version/scripts/version_gate.mjs",
    ".agents/skills/desktop-manage-git-lifecycle/scripts/git_lifecycle_core.mjs",
    ".agents/skills/desktop-manage-git-lifecycle/scripts/git_lifecycle_publication.mjs",
    ".agents/skills/desktop-manage-git-lifecycle/scripts/git_publication_test_cases.test.mjs",
    ".agents/skills/desktop-manage-git-lifecycle/scripts/git_lifecycle_release.test.mjs",
    ".agents/skills/desktop-rename-project-identity/scripts/rename_project_identity.test.mjs",
  ]) {
    assert.equal(relatives.has(relative), true, relative);
  }
});

test("repository contract declares Node common runtime and GUI-only pnpm", () => {
  const contracts = repositoryRequiredFragments(ENVIRONMENT_REFERENCE, RUST_BASELINE);
  assert.ok(contracts.get(ENVIRONMENT_REFERENCE).includes("Git、Rust 与 Node.js/npm 始终为必需项"));
  assert.ok(contracts.get(RUST_BASELINE).includes("Node.js | 所有接口"));
  assert.ok(contracts.get(RUST_BASELINE).includes("pnpm | 仅 GUI"));
});

test("environment shell gates retain executable source modes", () => {
  assert.equal(sourceFileHasExecutableMode(PREREQUISITE_UNIX), true);
  assert.equal(sourceFileHasExecutableMode(MACOS_XWIN_GATE), true);
});
