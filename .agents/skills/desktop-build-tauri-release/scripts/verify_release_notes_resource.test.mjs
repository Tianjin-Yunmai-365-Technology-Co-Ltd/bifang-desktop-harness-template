import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import {
  CONVENTIONAL_CARGO_SOURCE_MAPPING,
  RELEASE_CONFIG,
  RESOURCE_TARGET,
  ROOT_CARGO_SOURCE_MAPPING,
  main,
  sha256,
  verifyBytes,
  verifyConfig,
} from "./verify_release_notes_resource.mjs";

let root;
let guiRoot;
let configPath;
let source;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "afh-release-resource-"));
  guiRoot = path.join(root, "sample_gui");
  configPath = path.join(guiRoot, RELEASE_CONFIG);
  mkdirSync(path.dirname(configPath), { recursive: true });
  writeFileSync(path.join(guiRoot, "Cargo.toml"), "[package]\n");
  source = path.join(root, "release-notes.json");
  writeFileSync(source, '{"schemaVersion":2,"releases":[]}\n');
  writeFileSync(configPath, JSON.stringify({
    bundle: { resources: { [ROOT_CARGO_SOURCE_MAPPING]: RESOURCE_TARGET } },
  }));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

function captureOutput(callback) {
  let stdout = "";
  let stderr = "";
  const stdoutWrite = process.stdout.write;
  const stderrWrite = process.stderr.write;
  process.stdout.write = (chunk) => { stdout += String(chunk); return true; };
  process.stderr.write = (chunk) => { stderr += String(chunk); return true; };
  try { return { code: callback(), stdout, stderr }; }
  finally {
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  }
}

test("accepts fixed config and byte-identical bundled resource", () => {
  const bundled = path.join(root, "bundle", "release-notes.json");
  mkdirSync(path.dirname(bundled));
  writeFileSync(bundled, readFileSync(source));
  assert.equal(verifyConfig(root, guiRoot), verifyBytes(source, bundled));
});

test("rejects missing or redirected resource mapping", () => {
  for (const resources of [
    {},
    { [ROOT_CARGO_SOURCE_MAPPING]: "nested/release-notes.json" },
    { [CONVENTIONAL_CARGO_SOURCE_MAPPING]: RESOURCE_TARGET },
  ]) {
    writeFileSync(configPath, JSON.stringify({ bundle: { resources } }));
    assert.throws(() => verifyConfig(root, guiRoot), /fixed release-notes mapping/);
  }
});

test("rejects release config with invalid UTF-8 inside otherwise valid JSON", () => {
  const prefix = Buffer.from('{"note":"');
  const suffix = Buffer.from(`","bundle":{"resources":{"${ROOT_CARGO_SOURCE_MAPPING}":"${RESOURCE_TARGET}"}}}`);
  writeFileSync(configPath, Buffer.concat([prefix, Buffer.from([0xff]), suffix]));
  assert.throws(() => verifyConfig(root, guiRoot), /valid UTF-8 JSON/);
});

test("accepts conventional src-tauri Cargo root mapping", () => {
  unlinkSync(path.join(guiRoot, "Cargo.toml"));
  mkdirSync(path.join(guiRoot, "src-tauri"), { recursive: true });
  writeFileSync(path.join(guiRoot, "src-tauri", "Cargo.toml"), "[package]\n");
  writeFileSync(configPath, JSON.stringify({
    bundle: { resources: { [CONVENTIONAL_CARGO_SOURCE_MAPPING]: RESOURCE_TARGET } },
  }));
  assert.equal(verifyConfig(root, guiRoot), sha256(readFileSync(source)));
});

test("rejects missing or ambiguous Cargo manifest root", () => {
  const rootManifest = path.join(guiRoot, "Cargo.toml");
  unlinkSync(rootManifest);
  assert.throws(() => verifyConfig(root, guiRoot), /exactly one supported Cargo manifest/);
  writeFileSync(rootManifest, "[package]\n");
  mkdirSync(path.join(guiRoot, "src-tauri"), { recursive: true });
  writeFileSync(path.join(guiRoot, "src-tauri", "Cargo.toml"), "[package]\n");
  assert.throws(() => verifyConfig(root, guiRoot), /exactly one supported Cargo manifest/);
});

test("rejects bundled bytes that differ from source", () => {
  const bundled = path.join(root, "bundled.json");
  writeFileSync(bundled, '{"schemaVersion":2,"releases":[]} ');
  assert.throws(() => verifyBytes(source, bundled), /do not match/);
});

test("rejects symlinked source or bundled resource", () => {
  const bundledTarget = path.join(root, "bundled-target.json");
  writeFileSync(bundledTarget, readFileSync(source));
  const bundledLink = path.join(root, "bundled-link.json");
  symlinkSync(bundledTarget, bundledLink);
  assert.throws(() => verifyBytes(source, bundledLink), /regular non-symlink/);

  const sourceTarget = path.join(root, "source-target.json");
  writeFileSync(sourceTarget, readFileSync(source));
  unlinkSync(source);
  symlinkSync(sourceTarget, source);
  assert.throws(() => verifyConfig(root, guiRoot), /regular non-symlink/);
});

test("CLI rejects unknown and cross-command options with usage exit two", () => {
  for (const argumentsList of [
    ["config", "--project-root", root, "--gui-root", guiRoot, "--unknown", "value"],
    ["config", "--project-root", root, "--gui-root", guiRoot, "--source", source],
    ["bytes", "--source", source, "--bundled", source, "--project-root", root],
  ]) {
    const result = captureOutput(() => main(argumentsList));
    assert.equal(result.code, 2, `${argumentsList.join(" ")}\n${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /unsupported argument/);
  }
});

test("CLI keeps verification failures distinct from argument failures", () => {
  const result = captureOutput(() => main([
    "config", "--project-root", root, "--gui-root", path.join(root, "missing"),
  ]));
  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /GUI root must be a regular directory/);
});
