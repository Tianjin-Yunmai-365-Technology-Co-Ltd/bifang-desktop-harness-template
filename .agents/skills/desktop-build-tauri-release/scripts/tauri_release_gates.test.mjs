import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/** 本套件执行 macOS 专用的 `probe-macos-notarization.sh`，只在 POSIX 主机运行。 */
const posixOnly = { skip: process.platform === "win32" };

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "probe-macos-notarization.sh");
const SECRET_KEYS = [
  "APPLE_API_ISSUER",
  "APPLE_API_KEY",
  "APPLE_API_KEY_PATH",
  "APPLE_ID",
  "APPLE_PASSWORD",
  "APPLE_TEAM_ID",
  "APPLE_SIGNING_IDENTITY",
  "APPLE_NOTARYTOOL_PROFILE",
];

function withTemporaryRoot(callback) {
  const root = mkdtempSync(path.join(tmpdir(), "afh-tauri-gates-"));
  try {
    callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function executable(target, content) {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
  chmodSync(target, 0o755);
}

function fakeAppleTools(root, { identities = 1, includeNotarytool = true, profileReady = true } = {}) {
  const probe = path.join(root, "probe");
  const identityLines = Array.from(
    { length: identities },
    (_, index) => `  ${index + 1}) TESTHASH${index} "Developer ID Application: Test Org ${index} (TEAMTEST)"`,
  ).join("\n");
  executable(path.join(probe, "security"), `#!/bin/sh\nprintf '%s\\n' '${identityLines}'\n`);
  const notaryStatus = includeNotarytool
    ? "exit 0"
    : 'case "$2" in notarytool) exit 1 ;; *) exit 0 ;; esac';
  const profileStatus = profileReady ? "exit 0" : "exit 9";
  executable(path.join(probe, "xcrun"), `#!/bin/sh
set -eu
if [ "$1" = "--find" ]; then
  ${notaryStatus}
elif [ "$1 $2" = "notarytool history" ]; then
  ${profileStatus}
else
  exit 2
fi
`);
  return probe;
}

function runProbe(probe, extra = {}, platform = "Darwin") {
  const env = { ...process.env };
  for (const key of SECRET_KEYS) delete env[key];
  Object.assign(env, {
    AFH_PREREQ_PATH: probe,
    AFH_TEST_PLATFORM: platform,
    AFH_ALLOW_TEST_OVERRIDES: "1",
  }, extra);
  return spawnSync("/bin/sh", [SCRIPT], { encoding: "utf8", env, timeout: 10_000 });
}

test("complete API credentials are ready without secret output", posixOnly, () => withTemporaryRoot((root) => {
  const probe = fakeAppleTools(root);
  const key = path.join(root, "AuthKey_TEST.p8");
  const secret = "TOP-SECRET-PRIVATE-KEY";
  writeFileSync(key, secret);
  const result = runProbe(probe, {
    APPLE_API_ISSUER: "issuer-secret",
    APPLE_API_KEY: "key-secret",
    APPLE_API_KEY_PATH: key,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /gate\.macos_notarization\.status=ready/);
  assert.match(result.stdout, /credentials=app-store-connect-api/);
  const combined = result.stdout + result.stderr;
  for (const value of [secret, "issuer-secret", "key-secret", key]) assert.doesNotMatch(combined, new RegExp(value));
}));

test("complete Apple ID credentials are ready", posixOnly, () => withTemporaryRoot((root) => {
  const result = runProbe(fakeAppleTools(root), {
    APPLE_ID: "test@example.invalid",
    APPLE_PASSWORD: "app-password-secret",
    APPLE_TEAM_ID: "TEAMTEST",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /credentials=apple-id/);
  assert.doesNotMatch(result.stdout + result.stderr, /app-password-secret/);
}));

test("authorized keychain profile is ready without profile output", posixOnly, () => withTemporaryRoot((root) => {
  const profile = "secret-profile-name";
  const result = runProbe(fakeAppleTools(root), { APPLE_NOTARYTOOL_PROFILE: profile });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /credentials=notarytool-keychain-profile/);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(profile));
}));

test("unavailable keychain profile is rejected", posixOnly, () => withTemporaryRoot((root) => {
  const result = runProbe(fakeAppleTools(root, { profileReady: false }), {
    APPLE_NOTARYTOOL_PROFILE: "missing-profile",
  });
  assert.equal(result.status, 3);
  assert.match(result.stdout, /keychain-profile-unavailable/);
}));

test("missing credentials is unavailable, not partially ready", posixOnly, () => withTemporaryRoot((root) => {
  const result = runProbe(fakeAppleTools(root));
  assert.equal(result.status, 3);
  assert.match(result.stdout, /notarization-credentials-missing/);
}));

test("partial or mixed credentials are rejected", posixOnly, () => withTemporaryRoot((root) => {
  const result = runProbe(fakeAppleTools(root), {
    APPLE_ID: "test@example.invalid",
    APPLE_API_ISSUER: "issuer",
  });
  assert.equal(result.status, 3);
  assert.match(result.stdout, /incomplete-or-ambiguous/);
}));

test("keychain profile cannot be mixed with environment credentials", posixOnly, () => withTemporaryRoot((root) => {
  const result = runProbe(fakeAppleTools(root), {
    APPLE_NOTARYTOOL_PROFILE: "profile",
    APPLE_ID: "test@example.invalid",
    APPLE_PASSWORD: "password",
    APPLE_TEAM_ID: "TEAMTEST",
  });
  assert.equal(result.status, 3);
  assert.match(result.stdout, /incomplete-or-ambiguous/);
}));

test("symlinked API key is rejected", posixOnly, () => withTemporaryRoot((root) => {
  const target = path.join(root, "real-key.p8");
  const link = path.join(root, "key-link.p8");
  writeFileSync(target, "secret");
  symlinkSync(target, link);
  const result = runProbe(fakeAppleTools(root), {
    APPLE_API_ISSUER: "issuer",
    APPLE_API_KEY: "key",
    APPLE_API_KEY_PATH: link,
  });
  assert.equal(result.status, 3);
  assert.match(result.stdout, /api-private-key-unreadable/);
}));

test("multiple identities require an explicit selection", posixOnly, () => withTemporaryRoot((root) => {
  const result = runProbe(fakeAppleTools(root, { identities: 2 }), {
    APPLE_ID: "test@example.invalid",
    APPLE_PASSWORD: "password",
    APPLE_TEAM_ID: "TEAMTEST",
  });
  assert.equal(result.status, 3);
  assert.match(result.stdout, /developer-id-application-ambiguous/);
}));

test("missing notarytool is unavailable", posixOnly, () => withTemporaryRoot((root) => {
  const result = runProbe(fakeAppleTools(root, { includeNotarytool: false }), {
    APPLE_ID: "test@example.invalid",
    APPLE_PASSWORD: "password",
    APPLE_TEAM_ID: "TEAMTEST",
  });
  assert.equal(result.status, 3);
  assert.match(result.stdout, /notarytool-missing/);
}));

test("non-macOS host is unavailable", posixOnly, () => withTemporaryRoot((root) => {
  const result = runProbe(fakeAppleTools(root), {}, "Linux");
  assert.equal(result.status, 3);
  assert.match(result.stdout, /not-macos-apple-device/);
}));
