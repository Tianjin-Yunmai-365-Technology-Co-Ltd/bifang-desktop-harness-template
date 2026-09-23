import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/** 本套件执行 macOS 专用的 `verify-dmg-layout.sh`，只在 POSIX 主机运行。 */
const posixOnly = { skip: process.platform === "win32" };

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "verify-dmg-layout.sh");

function withTemporaryRoot(callback) {
  const root = mkdtempSync(path.join(tmpdir(), "afh-dmg-layout-"));
  try { callback(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

function executable(target, content) {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
  chmodSync(target, 0o755);
}

function fakeHdiutil(root) {
  const probe = path.join(root, "probe");
  const detached = path.join(root, "detached");
  executable(path.join(probe, "hdiutil"), `#!/bin/sh
set -eu
if [ "$1" = attach ]; then
  shift
  mount=
  while [ "$#" -gt 0 ]; do
    if [ "$1" = -mountpoint ]; then shift; mount=$1; fi
    shift
  done
  [ -n "$mount" ] || exit 2
  mkdir -p "$mount/Test App.app/Contents/Resources" "$mount/.background"
  mode=\${AFH_DMG_FIXTURE_MODE:-valid}
  [ "$mode" = missing-ds-store ] || printf '%s' finder > "$mount/.DS_Store"
  [ "$mode" = missing-background ] || printf '%s' png > "$mount/.background/background.png"
  if [ "$mode" = wrong-applications ]; then ln -s /tmp "$mount/Applications"; else ln -s /Applications "$mount/Applications"; fi
  [ "$mode" = multiple-apps ] && mkdir "$mount/Second App.app"
  if [ "$mode" != missing-release-notes ]; then
    if [ "$mode" = mismatched-release-notes ]; then
      printf '%s' mismatch > "$mount/Test App.app/Contents/Resources/release-notes.json"
    else
      cp "$AFH_DMG_RELEASE_NOTES_SOURCE" "$mount/Test App.app/Contents/Resources/release-notes.json"
    fi
  fi
  printf '%s\\n' '/dev/disk-test Apple_HFS Test'
elif [ "$1" = detach ]; then
  : > '${detached}'
else
  exit 2
fi
`);
  return probe;
}

function runCheck(root, dmg, { mode = "valid", platform = "Darwin" } = {}) {
  const releaseNotes = path.join(root, "release-notes.json");
  if (!existsSync(releaseNotes)) writeFileSync(releaseNotes, '{"schemaVersion":2,"releases":[]}\n');
  const env = {
    ...process.env,
    AFH_PREREQ_PATH: fakeHdiutil(root),
    AFH_TEST_PLATFORM: platform,
    AFH_ALLOW_TEST_OVERRIDES: "1",
    AFH_DMG_FIXTURE_MODE: mode,
    AFH_DMG_RELEASE_NOTES_SOURCE: releaseNotes,
  };
  return spawnSync("/bin/sh", [SCRIPT, dmg, releaseNotes], { encoding: "utf8", env, timeout: 10_000 });
}

test("complete read-only volume layout passes and detaches", posixOnly, () => withTemporaryRoot((root) => {
  const dmg = path.join(root, "candidate.dmg");
  writeFileSync(dmg, "dmg");
  const result = runCheck(root, dmg);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /gate\.macos_dmg_layout\.status=passed/);
  assert.match(result.stdout, /app_count=1/);
  assert.match(result.stdout, /release_notes=byte-identical/);
  assert.equal(existsSync(path.join(root, "detached")), true);
}));

test("missing .DS_Store fails closed and detaches", posixOnly, () => withTemporaryRoot((root) => {
  const dmg = path.join(root, "candidate.dmg");
  writeFileSync(dmg, "dmg");
  const result = runCheck(root, dmg, { mode: "missing-ds-store" });
  assert.equal(result.status, 41);
  assert.match(result.stdout, /finder-ds-store-missing/);
  assert.equal(existsSync(path.join(root, "detached")), true);
}));

test("wrong Applications link and multiple apps are rejected", posixOnly, () => {
  for (const [mode, reason] of [
    ["wrong-applications", "applications-link-target-invalid"],
    ["multiple-apps", "app-bundle-count-invalid"],
  ]) withTemporaryRoot((root) => {
    const dmg = path.join(root, "candidate.dmg");
    writeFileSync(dmg, "dmg");
    const result = runCheck(root, dmg, { mode });
    assert.equal(result.status, 41);
    assert.match(result.stdout, new RegExp(reason));
  });
});

test("symlinked DMG is rejected before mount", posixOnly, () => withTemporaryRoot((root) => {
  const target = path.join(root, "real.dmg");
  const link = path.join(root, "candidate.dmg");
  writeFileSync(target, "dmg");
  symlinkSync(target, link);
  const result = runCheck(root, link);
  assert.equal(result.status, 41);
  assert.match(result.stdout, /dmg-not-regular-file/);
  assert.equal(existsSync(path.join(root, "detached")), false);
}));

test("missing or mismatched release notes resource is rejected", posixOnly, () => {
  for (const [mode, reason] of [
    ["missing-release-notes", "release-notes-resource-missing"],
    ["mismatched-release-notes", "release-notes-resource-mismatch"],
  ]) withTemporaryRoot((root) => {
    const dmg = path.join(root, "candidate.dmg");
    writeFileSync(dmg, "dmg");
    const result = runCheck(root, dmg, { mode });
    assert.equal(result.status, 41);
    assert.match(result.stdout, new RegExp(reason));
  });
});

test("symlinked release notes source is rejected before mount", posixOnly, () => withTemporaryRoot((root) => {
  const dmg = path.join(root, "candidate.dmg");
  const target = path.join(root, "notes-target.json");
  writeFileSync(dmg, "dmg");
  writeFileSync(target, '{"schemaVersion":2,"releases":[]}\n');
  symlinkSync(target, path.join(root, "release-notes.json"));
  const result = runCheck(root, dmg);
  assert.equal(result.status, 41);
  assert.match(result.stdout, /release-notes-source-not-regular-file/);
  assert.equal(existsSync(path.join(root, "detached")), false);
}));

test("non-macOS host is not applicable", posixOnly, () => withTemporaryRoot((root) => {
  const dmg = path.join(root, "candidate.dmg");
  writeFileSync(dmg, "dmg");
  const result = runCheck(root, dmg, { platform: "Linux" });
  assert.equal(result.status, 30);
  assert.match(result.stdout, /requires-macos-host/);
}));
