import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CARGO_SEMVER_COMPONENT_MAX,
  STATE_RELATIVE,
  Version,
  cargoVersion,
  check,
  evaluateChange,
  finalizeRelease,
  initialize,
  projectRoot,
} from "./version_gate.mjs";

const SCRIPT = fileURLToPath(new URL("./version_gate.mjs", import.meta.url));
let root;

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: "utf8", ...options });
}

function writeCargo(targetRoot, version) {
  writeFileSync(path.join(targetRoot, "Cargo.toml"), `[workspace]
members = []

[workspace.package]
version = "${version}"
edition = "2024"
`);
}

function apply(kind, changeId = null, { major = null, userApproved = false, targetRoot = root } = {}) {
  return evaluateChange(targetRoot, { action: "apply", kind, changeId, major, userApproved });
}

function state(targetRoot = root) {
  return JSON.parse(readFileSync(path.join(targetRoot, STATE_RELATIVE), "utf8"));
}

function writeState(targetRoot, value) {
  writeFileSync(path.join(targetRoot, STATE_RELATIVE), JSON.stringify(value));
}

function projectWithVersion(name, version) {
  const targetRoot = path.join(root, name);
  mkdirSync(targetRoot);
  writeCargo(targetRoot, version);
  initialize(targetRoot);
  assert.equal(run("git", ["init", "--initial-branch=main", "."], { cwd: targetRoot }).status, 0);
  return targetRoot;
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "afh-version-gate-"));
  writeCargo(root, "0.1.4");
  initialize(root);
  assert.equal(run("git", ["init", "--initial-branch=main", "."], { cwd: root }).status, 0);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

test("first feature bumps Minor, resets Patch, and later feature does not", () => {
  const first = apply("feature", "FEAT-1");
  const statePath = path.join(root, STATE_RELATIVE);
  const beforeBuild = readFileSync(statePath);
  const buildCheck = check(root, "build");
  assert.deepEqual(readFileSync(statePath), beforeBuild);
  const fix = apply("bug-fix", "BUG-1");
  const second = apply("feature", "FEAT-2");
  assert.equal(first.after_version, "0.2.0");
  assert.equal(first.version_bumped, true);
  assert.equal(buildCheck.passed, true);
  assert.equal(fix.after_version, "0.2.1");
  assert.equal(second.after_version, "0.2.1");
  assert.equal(second.version_bumped, false);
  assert.equal(state().target_version, "0.2.1");
});

test("distinct fixes and user-visible optimizations bump Patch", () => {
  const first = apply("bug-fix", "BUG-1");
  const duplicate = apply("bug-fix", "BUG-1");
  const optimization = apply("bug-fix", "OPT-1");
  assert.equal(first.after_version, "0.1.5");
  assert.equal(duplicate.after_version, "0.1.5");
  assert.equal(duplicate.reason, "change-already-applied");
  assert.equal(optimization.after_version, "0.1.6");
});

test("maintenance and plan do not mutate files", () => {
  const cargoPath = path.join(root, "Cargo.toml");
  const statePath = path.join(root, STATE_RELATIVE);
  const cargoBefore = readFileSync(cargoPath);
  const stateBefore = readFileSync(statePath);
  const planned = evaluateChange(root, {
    action: "plan", kind: "feature", changeId: "FEAT-PLAN", major: null, userApproved: false,
  });
  const maintenance = apply("maintenance", "QUERY-1");
  assert.equal(planned.required_version, "0.2.0");
  assert.equal(planned.changed, false);
  assert.equal(maintenance.reason, "maintenance-does-not-change-version");
  assert.deepEqual(readFileSync(cargoPath), cargoBefore);
  assert.deepEqual(readFileSync(statePath), stateBefore);
});

test("successful release resets feature gate but retains bug deduplication", () => {
  apply("feature", "FEAT-1");
  apply("bug-fix", "BUG-1");
  finalizeRelease(root, "0.2.1", "a".repeat(40));
  const oldBug = apply("bug-fix", "BUG-1");
  assert.throws(() => apply("feature", "BUG-1"), /already used/);
  const nextFeature = apply("feature", "FEAT-2");
  const regression = apply("bug-fix", "BUG-1-REGRESSION-1");
  assert.equal(oldBug.reason, "bug-id-already-consumed");
  assert.equal(nextFeature.after_version, "0.3.0");
  assert.equal(regression.after_version, "0.3.1");
});

test("Major above 100 requires approval and resets lower components", () => {
  assert.throws(() => apply("major", "BREAK-1", { major: 101n }), /explicit/);
  const result = apply("major", "BREAK-1", { major: 101n, userApproved: true });
  const laterFeature = apply("feature", "FEAT-1");
  assert.equal(result.after_version, "101.0.0");
  assert.equal(laterFeature.after_version, "101.0.0");
});

test("Cargo u64 Major limit fails closed before writes", () => {
  assert.equal(Version.parse(`${CARGO_SEMVER_COMPONENT_MAX}.0.0`).major, CARGO_SEMVER_COMPONENT_MAX);
  assert.throws(() => Version.parse(`${CARGO_SEMVER_COMPONENT_MAX + 1n}.0.0`), /u64::MAX/);
  assert.throws(() => Version.parse(`${"9".repeat(5000)}.0.0`), /u64::MAX/);
  assert.throws(() => Version.parse("1.2٢.3"), /stable/);
  for (const invalid of ["0.100.0", "0.0.100", "0.101.0", "0.0.101"]) {
    assert.throws(() => Version.parse(invalid), /0\.\.99/);
  }
  const cargoPath = path.join(root, "Cargo.toml");
  const statePath = path.join(root, STATE_RELATIVE);
  const cargoBefore = readFileSync(cargoPath);
  const stateBefore = readFileSync(statePath);
  assert.throws(
    () => apply("major", "BREAK-U64-OVERFLOW", { major: CARGO_SEMVER_COMPONENT_MAX + 1n, userApproved: true }),
    /u64 range/,
  );
  assert.deepEqual(readFileSync(cargoPath), cargoBefore);
  assert.deepEqual(readFileSync(statePath), stateBefore);

  const carryRoot = projectWithVersion("automatic-major-overflow", `${CARGO_SEMVER_COMPONENT_MAX}.99.99`);
  const carryCargo = readFileSync(path.join(carryRoot, "Cargo.toml"));
  const carryState = readFileSync(path.join(carryRoot, STATE_RELATIVE));
  assert.throws(() => apply("bug-fix", "BUG-U64-CARRY", { targetRoot: carryRoot }), /u64::MAX/);
  assert.deepEqual(readFileSync(path.join(carryRoot, "Cargo.toml")), carryCargo);
  assert.deepEqual(readFileSync(path.join(carryRoot, STATE_RELATIVE)), carryState);

  const featureRoot = projectWithVersion("automatic-feature-major-overflow", `${CARGO_SEMVER_COMPONENT_MAX}.99.42`);
  const featureCargo = readFileSync(path.join(featureRoot, "Cargo.toml"));
  const featureState = readFileSync(path.join(featureRoot, STATE_RELATIVE));
  assert.throws(() => apply("feature", "FEAT-U64-CARRY", { targetRoot: featureRoot }), /u64::MAX/);
  assert.deepEqual(readFileSync(path.join(featureRoot, "Cargo.toml")), featureCargo);
  assert.deepEqual(readFileSync(path.join(featureRoot, STATE_RELATIVE)), featureState);
});

test("Patch and Minor roll over in base 100", () => {
  const patchRoot = projectWithVersion("patch-rollover", "0.0.99");
  const first = apply("bug-fix", "BUG-PATCH-CARRY", { targetRoot: patchRoot });
  const duplicate = apply("bug-fix", "BUG-PATCH-CARRY", { targetRoot: patchRoot });
  const majorRoot = projectWithVersion("major-rollover", "0.99.99");
  const major = apply("bug-fix", "BUG-MAJOR-CARRY", { targetRoot: majorRoot });
  const hundredRoot = projectWithVersion("major-above-99", "99.99.99");
  const hundred = apply("bug-fix", "BUG-MAJOR-100", { targetRoot: hundredRoot });
  const featureRoot = projectWithVersion("feature-rollover", "0.99.42");
  const feature = apply("feature", "FEAT-MAJOR-CARRY", { targetRoot: featureRoot });
  assert.equal(first.after_version, "0.1.0");
  assert.equal(duplicate.after_version, "0.1.0");
  assert.equal(duplicate.idempotent, true);
  assert.equal(major.after_version, "1.0.0");
  assert.equal(hundred.after_version, "100.0.0");
  assert.equal(state(majorRoot).feature_bump_applied, false);
  assert.equal(feature.after_version, "1.0.0");
  assert.equal(state(featureRoot).feature_bump_applied, true);
});

test("bug-fix carry is independent of feature lock", () => {
  const lockedRoot = projectWithVersion("locked-carry", "0.1.99");
  const lockedState = state(lockedRoot);
  lockedState.feature_bump_applied = true;
  lockedState.pending_changes = [{ change_id: "FEAT-ALREADY-LOCKED", kind: "feature", required_version: "0.1.99" }];
  writeState(lockedRoot, lockedState);
  const fixed = apply("bug-fix", "BUG-LOCKED-CARRY", { targetRoot: lockedRoot });
  const laterFeature = apply("feature", "FEAT-STILL-LOCKED", { targetRoot: lockedRoot });
  assert.equal(fixed.after_version, "0.2.0");
  assert.equal(laterFeature.after_version, "0.2.0");
  assert.equal(laterFeature.version_bumped, false);
  assert.equal(state(lockedRoot).feature_bump_applied, true);
});

test("legacy 100 is rejected with no compatibility path", () => {
  writeCargo(root, "0.100.100");
  assert.throws(() => check(root, "development"), /0\.\.99/);
  assert.throws(() => evaluateChange(root, {
    action: "plan", kind: "bug-fix", changeId: "BUG-LEGACY-PLAN", major: null, userApproved: false,
  }), /0\.\.99/);
});

test("rollover plan reports result without mutating files", () => {
  const planRoot = projectWithVersion("rollover-plan", "0.0.99");
  const cargoPath = path.join(planRoot, "Cargo.toml");
  const statePath = path.join(planRoot, STATE_RELATIVE);
  const cargoBefore = readFileSync(cargoPath);
  const stateBefore = readFileSync(statePath);
  const planned = evaluateChange(planRoot, {
    action: "plan", kind: "bug-fix", changeId: "BUG-PLAN-CARRY", major: null, userApproved: false,
  });
  assert.equal(planned.required_version, "0.1.0");
  assert.equal(planned.changed, false);
  assert.deepEqual(readFileSync(cargoPath), cargoBefore);
  assert.deepEqual(readFileSync(statePath), stateBefore);
});

test("version drift and unstable versions fail closed", () => {
  writeCargo(root, "0.1.5");
  assert.throws(() => check(root, "build"), /version drift/);
  writeCargo(root, "0.1.0-beta.1");
  assert.throws(() => cargoVersion(path.join(root, "Cargo.toml")), /stable/);
});

test("CLI rejects oversized semver without stack trace", () => {
  writeCargo(root, `${"9".repeat(5000)}.0.0`);
  const result = run(process.execPath, [SCRIPT, "check", "--project-root", root, "--phase", "development"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /"error"/);
  assert.match(result.stderr, /u64::MAX/);
  assert.doesNotMatch(result.stderr, /GateError|at file:/);
});

test("invalid UTF-8 fails closed before apply mutates Cargo or state", () => {
  const cargoPath = path.join(root, "Cargo.toml");
  const statePath = path.join(root, STATE_RELATIVE);
  const originalCargo = readFileSync(cargoPath);
  const originalState = readFileSync(statePath);

  const invalidCargo = Buffer.concat([originalCargo, Buffer.from([0xff])]);
  writeFileSync(cargoPath, invalidCargo);
  assert.throws(
    () => apply("bug-fix", "BUG-INVALID-CARGO-UTF8"),
    /Cargo\.toml must contain valid UTF-8/,
  );
  assert.deepEqual(readFileSync(cargoPath), invalidCargo);
  assert.deepEqual(readFileSync(statePath), originalState);

  writeFileSync(cargoPath, originalCargo);
  const invalidState = Buffer.concat([originalState, Buffer.from([0xff])]);
  writeFileSync(statePath, invalidState);
  assert.throws(
    () => apply("bug-fix", "BUG-INVALID-STATE-UTF8"),
    /version state must contain valid UTF-8/,
  );
  assert.deepEqual(readFileSync(cargoPath), originalCargo);
  assert.deepEqual(readFileSync(statePath), invalidState);
});

test("CLI rejects unknown and cross-command options with usage status", () => {
  const cases = [
    ["check", "--project-root", root, "--phase", "development", "--unknown", "value"],
    ["check", "--project-root", root, "--phase", "development", "--user-approved"],
    ["init", "--project-root", root, "--phase", "development"],
    ["plan", "--project-root", root, "--kind", "maintenance", "--migration-approved"],
    ["finalize-release", "--project-root", root, "--released-version", "0.1.4", "--source-commit", "a".repeat(40), "--release-succeeded", "--kind", "maintenance"],
  ];
  for (const args of cases) {
    const result = run(process.execPath, [SCRIPT, ...args]);
    assert.equal(result.status, 2, `${args.join(" ")}\n${result.stderr}`);
    assert.match(result.stderr, /unsupported argument/);
  }
});

test("CLI rejects non-decimal Major values without mutating project bytes", () => {
  const cargoPath = path.join(root, "Cargo.toml");
  const statePath = path.join(root, STATE_RELATIVE);
  const originalCargo = readFileSync(cargoPath);
  const originalState = readFileSync(statePath);
  const result = run(process.execPath, [
    SCRIPT,
    "apply",
    "--project-root",
    root,
    "--kind",
    "major",
    "--change-id",
    "BREAK-NON-DECIMAL",
    "--major",
    "0x10",
    "--user-approved",
  ]);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /--major must be a decimal integer/);
  assert.deepEqual(readFileSync(cargoPath), originalCargo);
  assert.deepEqual(readFileSync(statePath), originalState);
});

test("corrupt state version type fails as gate error", () => {
  const corrupt = state();
  corrupt.target_version = 15;
  writeState(root, corrupt);
  assert.throws(() => check(root, "development"), /must be a string/);
});

test("corrupt cross-field state fails closed", () => {
  const kindRoot = projectWithVersion("corrupt-kind-type", "0.1.4");
  const kindState = state(kindRoot);
  kindState.pending_changes = [{ change_id: "KIND-CORRUPT", kind: [], required_version: "0.1.4" }];
  writeState(kindRoot, kindState);
  assert.throws(() => check(kindRoot, "development"), /unsupported kind/);

  const featureRoot = projectWithVersion("corrupt-feature-lock", "0.1.4");
  const featureState = state(featureRoot);
  featureState.pending_changes = [{ change_id: "FEAT-CORRUPT", kind: "feature", required_version: "0.1.4" }];
  writeState(featureRoot, featureState);
  assert.throws(() => check(featureRoot, "development"), /feature_bump_applied/);

  const bugRoot = projectWithVersion("corrupt-bug-dedup", "0.1.4");
  const bugState = state(bugRoot);
  bugState.pending_changes = [{ change_id: "BUG-CORRUPT", kind: "bug-fix", required_version: "0.1.4" }];
  writeState(bugRoot, bugState);
  assert.throws(() => check(bugRoot, "development"), /applied_bug_ids/);

  const conflictRoot = projectWithVersion("corrupt-kind-conflict", "0.1.4");
  const conflictState = state(conflictRoot);
  conflictState.feature_bump_applied = true;
  conflictState.pending_changes = [{ change_id: "SHARED-CORRUPT", kind: "feature", required_version: "0.1.4" }];
  conflictState.applied_bug_ids = ["SHARED-CORRUPT"];
  writeState(conflictRoot, conflictState);
  assert.throws(() => check(conflictRoot, "development"), /another kind/);
});

test("CLI apply emits stable JSON and updates Cargo", () => {
  const result = run(process.execPath, [SCRIPT, "apply", "--project-root", root, "--kind", "bug-fix", "--change-id", "BUG-CLI-1"]);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.after_version, "0.1.5");
  assert.equal(payload.required_version, "0.1.5");
  assert.match(readFileSync(path.join(root, "Cargo.toml"), "utf8"), /version = "0\.1\.5"/);
});

test("CLI init is the only command allowed before independent Git", () => {
  const nested = path.join(root, "pre-git-project");
  mkdirSync(nested);
  writeCargo(nested, "0.1.0");
  const initialized = run(process.execPath, [SCRIPT, "init", "--project-root", nested]);
  const checked = run(process.execPath, [SCRIPT, "check", "--project-root", nested, "--phase", "development"]);
  assert.equal(initialized.status, 0, initialized.stderr);
  assert.ok(readFileSync(path.join(nested, STATE_RELATIVE)));
  assert.notEqual(checked.status, 0);
  assert.match(checked.stderr, /does not equal project root/);
});

test("existing Git migration requires approval and reports lost history", () => {
  const legacy = path.join(root, "legacy-project");
  mkdirSync(legacy);
  assert.equal(run("git", ["init", "--initial-branch=main", "."], { cwd: legacy }).status, 0);
  writeCargo(legacy, "7.8.9");
  const rejected = run(process.execPath, [SCRIPT, "init", "--project-root", legacy]);
  assert.equal(rejected.status, 2);
  assert.match(rejected.stderr, /--migration-approved/);
  assert.match(rejected.stderr, /cannot be recovered/);
  const migrated = run(process.execPath, [SCRIPT, "init", "--project-root", legacy, "--migration-approved"]);
  assert.equal(migrated.status, 0, migrated.stderr);
  const payload = JSON.parse(migrated.stdout);
  assert.equal(payload.migration, true);
  assert.equal(payload.current_version, "7.8.9");
  assert.equal(payload.history_status, "unrecoverable-pre-migration-history");
  assert.deepEqual(payload.unrecoverable_history, ["pending_changes", "applied_bug_ids", "last_release"]);
  const migratedState = state(legacy);
  assert.equal(migratedState.cycle_base_version, "7.8.9");
  assert.equal(migratedState.target_version, "7.8.9");
  assert.deepEqual(migratedState.pending_changes, []);
  assert.deepEqual(migratedState.applied_bug_ids, []);
});

test("symlink project root fails closed", () => {
  const linkedRoot = `${root}-link`;
  try {
    symlinkSync(root, linkedRoot, "dir");
  } catch (error) {
    if (error?.code === "EPERM" || error?.code === "ENOSYS") return;
    throw error;
  }
  try { assert.throws(() => projectRoot(linkedRoot), /must not be a symlink/); }
  finally { unlinkSync(linkedRoot); }
});
