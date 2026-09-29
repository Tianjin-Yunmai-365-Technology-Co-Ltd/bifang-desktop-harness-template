/** 静态验证打包的候选 workflow 只使用 Node helper 并保持固定门禁顺序。 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const DIRECTORY = dirname(fileURLToPath(import.meta.url));
const WORKFLOW = resolve(DIRECTORY, "../assets/github-release-candidate.yml");
const text = readFileSync(WORKFLOW, "utf8");
const helper = readFileSync(resolve(DIRECTORY, "release_candidate_workflow.mjs"), "utf8");
const HELPER_PATH = resolve(DIRECTORY, "release_candidate_workflow.mjs");

/** 在隔离目录运行候选 workflow helper。 */
function invoke(command, cwd, environment = {}) {
  const result = spawnSync(process.execPath, [HELPER_PATH, command], {
    cwd,
    env: { ...process.env, ...environment },
    encoding: "utf8",
    input: "",
  });
  if (result.error) throw result.error;
  return result;
}

test("dispatch_binds_release_context_digest", () => {
  assert.ok(text.includes("release_context_sha256:"));
  assert.ok(text.includes("RELEASE_CONTEXT_SHA256: ${{ inputs.release_context_sha256 }}"));
  assert.ok(helper.includes("snapshot.releaseContextSha256"));
  assert.ok(helper.includes("snapshot.expectedTag"));
  assert.ok(!helper.includes("snapshot.candidateSelections"));
  assert.ok(!helper.includes("snapshot.gitPublication"));
});

test("context_is_captured_before_tests_and_reverified_before_manifest", () => {
  const capture = text.indexOf("verify_release_context.mjs capture");
  const tests = text.indexOf("cargo test --workspace --all-targets --all-features");
  const verify = text.indexOf("verify_release_context.mjs verify");
  const manifest = text.indexOf("release_candidate_workflow.mjs write-manifest");
  assert.ok(capture >= 0 && capture < tests);
  assert.ok(tests < verify);
  assert.ok(verify < manifest);
});

test("project_cargo_commands_apply_only_the_checked_lock_policy", () => {
  const check = text.indexOf("release_candidate_workflow.mjs check-lock-policy");
  const metadata = text.indexOf("release_candidate_workflow.mjs verify-version");
  const tests = text.indexOf("release_candidate_workflow.mjs list-tests");
  assert.ok(check >= 0 && check < metadata && metadata < tests);
  assert.match(helper, /assertDependencyLocks\(process\.cwd\(\), \{ rustTestManifests: \["Cargo\.toml"\] \}\)/u);
  assert.match(helper, /CARGO_LOCK_FLAG: policy === "tracked" \? "--locked" : ""/u);
  assert.match(helper, /"metadata", "--format-version", "1", "--no-deps", \.\.\.cargoLockArgs\(\)/u);
  assert.match(helper, /"--all-features", \.\.\.cargoLockArgs\(\), "--", "--list"/u);
  assert.match(text, /cargo test --workspace --all-targets --all-features "\$\{lock_args\[@\]\}"/u);
  assert.match(text, /cargo build --workspace --release "\$\{lock_args\[@\]\}"/u);
});

// 候选门禁在缺省时不要求锁文件，显式跟踪时拒绝缺失和未跟踪锁。
test("check_lock_policy_defaults_to_ignored_and_rejects_missing_tracked_lock", () => {
  const temporary = mkdtempSync(join(tmpdir(), "candidate-workflow-lock-"));
  try {
    const environmentPath = join(temporary, "github-env");
    const cargo = join(temporary, "Cargo.toml");
    writeFileSync(cargo, "[workspace]\nmembers = []\n[workspace.metadata.agent-first-harness]\ninterfaces = [\"cli\"]\n", "utf8");
    writeFileSync(environmentPath, "", "utf8");
    const ignored = invoke("check-lock-policy", temporary, { GITHUB_ENV: environmentPath });
    assert.equal(ignored.status, 0, ignored.stderr);
    assert.equal(readFileSync(environmentPath, "utf8"), "CARGO_LOCK_FLAG=\n");
    writeFileSync(cargo, readFileSync(cargo, "utf8") + 'dependency-lock-policy = "tracked"\n');
    const init = spawnSync("git", ["-C", temporary, "init", "-q"], { encoding: "utf8" });
    assert.equal(init.status, 0, init.stderr);
    const missing = invoke("check-lock-policy", temporary, { GITHUB_ENV: environmentPath });
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /Cargo.lock/u);
    writeFileSync(join(temporary, "Cargo.lock"), "# test lock\n", "utf8");
    const untracked = invoke("check-lock-policy", temporary, { GITHUB_ENV: environmentPath });
    assert.equal(untracked.status, 1);
    assert.match(untracked.stderr, /Git 跟踪/u);
    const added = spawnSync("git", ["-C", temporary, "add", "--", "Cargo.lock"], { encoding: "utf8" });
    assert.equal(added.status, 0, added.stderr);
    const tracked = invoke("check-lock-policy", temporary, { GITHUB_ENV: environmentPath });
    assert.equal(tracked.status, 0, tracked.stderr);
    assert.equal(readFileSync(environmentPath, "utf8"), "CARGO_LOCK_FLAG=\nCARGO_LOCK_FLAG=--locked\n");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("checkout_uses_release_branch_full_history_and_no_persisted_credentials", () => {
  assert.ok(text.includes("ref: release"));
  assert.ok(!text.includes("github.event.repository.default_branch"));
  assert.ok(text.includes("fetch-depth: 0"));
  assert.ok(text.includes("persist-credentials: false"));
});

test("workflow_pins_the_required_node_runtime", () => {
  assert.match(text, /actions\/setup-node@[0-9a-f]{40}/);
  assert.match(text, /node-version:\s*24\.21\.0/);
  assert.match(text, /check-latest:\s*false/);
});

test("workflow_has_no_disallowed_legacy_runtime", () => {
  const legacyRuntime = ["py", "thon"].join("");
  const legacyCommand = ["PY", "THON", "_COMMAND"].join("");
  const legacySuffix = [".p", "y "].join("");
  for (const forbidden of [legacyRuntime, legacyCommand, "<<'PY'", legacySuffix]) {
    assert.ok(!text.toLowerCase().includes(forbidden.toLowerCase()), forbidden);
  }
  assert.ok(text.includes("release_candidate_workflow.mjs check-node-runtime"));
});

test("obsolete_branch_envelope_contract_is_absent", () => {
  for (const obsolete of [
    "branch_chain_state_sha256",
    "BRANCH_CHAIN_STATE_SHA256",
    "verify_release_envelope",
    "branchChainStateSha256",
    "GitHub 动态默认分支必须是 main 或 master",
  ]) {
    assert.ok(!text.includes(obsolete));
  }
});

test("read_msrv_reads_only_workspace_package_and_appends_normalized_version", () => {
  const temporary = mkdtempSync(join(tmpdir(), "candidate-workflow-"));
  try {
    const environmentPath = join(temporary, "github-env");
    writeFileSync(join(temporary, "Cargo.toml"), [
      "[workspace.package]",
      'edition = "2024"',
      'rust-version = "1.95"',
      "",
      "[workspace]",
      'members = ["crates/core"]',
      "",
    ].join("\n"), "utf8");
    writeFileSync(environmentPath, "", "utf8");
    const result = invoke("read-msrv", temporary, { GITHUB_ENV: environmentPath });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(environmentPath, "utf8"), "RUSTUP_TOOLCHAIN=1.95.0\n");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("resolve_artifact_requires_one_complete_safe_pair", () => {
  const temporary = mkdtempSync(join(tmpdir(), "candidate-workflow-"));
  try {
    const outputPath = join(temporary, "github-output");
    writeFileSync(outputPath, "", "utf8");
    const accepted = invoke("resolve-artifact", temporary, {
      GITHUB_OUTPUT: outputPath,
      UNIX_ARCHIVE: "example-v1-linux-x64.tar.gz",
      UNIX_STAGE: join(temporary, ".example.release-candidate.123"),
      WINDOWS_ARCHIVE: "",
      WINDOWS_STAGE: "",
    });
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.match(readFileSync(outputPath, "utf8"), /^archive_name=example-v1-linux-x64\.tar\.gz\nstage_path=/);
    const rejected = invoke("resolve-artifact", temporary, {
      GITHUB_OUTPUT: outputPath,
      UNIX_ARCHIVE: "../unsafe.tar.gz",
      UNIX_STAGE: join(temporary, "stage"),
    });
    assert.equal(rejected.status, 1);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
