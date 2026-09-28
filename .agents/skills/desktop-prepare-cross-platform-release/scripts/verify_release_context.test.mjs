/** 验证跨平台发布上下文快照 helper 的真实 Git 边界。 */

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(SCRIPT_DIRECTORY, "verify_release_context.mjs");
const RELEASE_CONTEXT_SOURCE = resolve(
  SCRIPT_DIRECTORY,
  "../../desktop-prepare-release/scripts/release_context.mjs",
);
const HARNESS_VERSION_CLOCK_SOURCE = resolve(
  SCRIPT_DIRECTORY,
  "../../desktop-prepare-release/scripts/harness_version_clock.mjs",
);
const GIT_LIFECYCLE_CORE_SOURCE = resolve(
  SCRIPT_DIRECTORY,
  "../../desktop-manage-git-lifecycle/scripts/git_lifecycle_core.mjs",
);

/** 与发布审查相同的固定 Git 差异字节，生成真实 fixture 摘要。 */
function scopeDiffSha256(root, base, head, env) {
  const result = spawnSync("git", [
    "-C", root, "-c", "core.quotePath=true",
    "diff", "--binary", "--full-index", "--no-renames", "--no-ext-diff", "--no-textconv",
    "--no-color", "--no-relative", "--src-prefix=a/", "--dst-prefix=b/",
    "--diff-algorithm=myers", "--no-indent-heuristic", "--unified=3",
    "--inter-hunk-context=0", "--submodule=short", "--ignore-submodules=none",
    base, head, "--",
  ], { env, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) assert.fail(`cannot compute fixture Git diff: ${result.stderr?.toString("utf8")}`);
  return createHash("sha256").update(result.stdout).digest("hex");
}

/** 在测试环境中运行命令并返回文本结果。 */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: options.env ?? process.env,
    cwd: options.cwd,
    input: "",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (options.check !== false && result.status !== 0) {
    assert.fail(`${command} ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result;
}

/** 建立默认分支停留在旧提交、release 与 tag 指向发布提交的隔离仓库。 */
function fixture({ repositoryDefaultBranch = "trunk", reviewSelection = "disabled", tamperScopeHash = false } = {}) {
  const temporary = mkdtempSync(join(tmpdir(), "verify-release-context-"));
  const root = join(temporary, "project");
  const remote = join(temporary, "remote.git");
  mkdirSync(root);
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: join(temporary, "global.gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "Never",
  };
  const git = (...args) => run("git", ["-C", root, ...args], { env });
  run("git", ["init", "--quiet", "--bare", remote], { env });
  git("init", "--quiet", "--initial-branch=trunk");
  git("config", "--local", "user.name", "Matrix Test");
  git("config", "--local", "user.email", "matrix@example.com");
  const helper = join(root, ".agents/skills/desktop-prepare-release/scripts/release_context.mjs");
  mkdirSync(dirname(helper), { recursive: true });
  copyFileSync(RELEASE_CONTEXT_SOURCE, helper);
  copyFileSync(HARNESS_VERSION_CLOCK_SOURCE, join(dirname(helper), "harness_version_clock.mjs"));
  const lifecycleCore = join(root, ".agents/skills/desktop-manage-git-lifecycle/scripts/git_lifecycle_core.mjs");
  mkdirSync(dirname(lifecycleCore), { recursive: true });
  copyFileSync(GIT_LIFECYCLE_CORE_SOURCE, lifecycleCore);
  git("add", ".agents");
  git("commit", "--quiet", "-m", "chore: baseline helpers");
  const baseline = git("rev-parse", "HEAD").stdout.trim();
  writeFileSync(join(root, "source.txt"), "candidate\n", "utf8");
  git("add", "source.txt");
  git("commit", "--quiet", "-m", "feat: candidate source");
  const sourceHead = git("rev-parse", "HEAD").stdout.trim();
  const scopeHash = scopeDiffSha256(root, baseline, sourceHead, env);
  run("git", ["-C", remote, "symbolic-ref", "HEAD", `refs/heads/${repositoryDefaultBranch}`], { env });
  git("remote", "add", "origin", remote);
  git("push", "--quiet", "origin", `${baseline}:refs/heads/${repositoryDefaultBranch}`);
  const context = run(process.execPath, [
    helper,
    "write",
    "--project-root", root,
    "--source-head", sourceHead,
    "--version", "1.2.3",
    "--release-date", "2026-09-09",
    "--default-branch", "trunk",
    "--review-selection", reviewSelection,
    "--scope-base", baseline,
    "--scope-diff-sha256", scopeHash,
    ...(reviewSelection === "enabled" ? [
      "--review-evidence-summary", "All required review checks passed for the recorded source diff.",
    ] : [
      "--review-reason", "Optional semantic review was not requested.",
      "--review-remaining-risk", "Semantic issues outside required checks may remain.",
    ]),
  ], { env, cwd: root });
  assert.equal(context.status, 0, context.stderr);
  if (tamperScopeHash) {
    const contextPath = join(root, ".harness/release-context.json");
    const parsed = JSON.parse(readFileSync(contextPath, "utf8"));
    assert.notEqual(parsed.releaseReview.scopeDiffSha256, "0".repeat(64));
    parsed.releaseReview.scopeDiffSha256 = "0".repeat(64);
    writeFileSync(contextPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  }
  git("add", ".harness/release-context.json");
  git("commit", "--quiet", "-m", "chore(release): record context");
  const head = git("rev-parse", "HEAD").stdout.trim();
  git("switch", "--quiet", "-c", "release");
  git("push", "--quiet", "origin", "HEAD:refs/heads/release");
  git("tag", "v1.2.3-20260909");
  git("push", "--quiet", "origin", "refs/tags/v1.2.3-20260909");
  const contextPath = join(root, ".harness/release-context.json");
  const digest = createHash("sha256").update(readFileSync(contextPath)).digest("hex");
  const snapshot = join(temporary, "snapshot.json");
  const invoke = (mode) => run(process.execPath, [
    SCRIPT,
    mode,
    "--project-root", root,
    "--source-commit", head,
    "--expected-context-sha256", digest,
    "--snapshot", snapshot,
  ], { env, cwd: root, check: false });
  return { temporary, root, remote, env, git, baseline, head, snapshot, invoke, repositoryDefaultBranch };
}

test("capture_and_verify_accept_release_with_an_unchanged_default_branch", () => {
  const item = fixture();
  try {
    const captured = item.invoke("capture");
    assert.equal(captured.status, 0, captured.stderr);
    const snapshot = JSON.parse(readFileSync(item.snapshot, "utf8"));
    assert.equal("gitPublication" in snapshot, false);
    assert.equal("remote" in snapshot, false);
    assert.equal("candidateSelections" in snapshot, false);
    assert.equal(snapshot.releaseReview.selection, "disabled");
    assert.equal(snapshot.remoteReleaseBranch, "release");
    assert.equal(snapshot.releaseDefaultBranch, "trunk");
    assert.equal(snapshot.expectedTag, "v1.2.3-20260909");
    assert.equal(item.invoke("verify").status, 0);
    assert.equal(run("git", ["-C", item.remote, "symbolic-ref", "HEAD"], { env: item.env }).stdout.trim(), "refs/heads/trunk");
    assert.equal(run("git", ["-C", item.remote, "rev-parse", "refs/heads/trunk"], { env: item.env }).stdout.trim(), item.baseline);
  } finally {
    rmSync(item.temporary, { recursive: true, force: true });
  }
});

test("capture_and_verify_recompute_enabled_review_scope", () => {
  const item = fixture({ reviewSelection: "enabled" });
  try {
    const captured = item.invoke("capture");
    assert.equal(captured.status, 0, captured.stderr);
    const snapshot = JSON.parse(readFileSync(item.snapshot, "utf8"));
    assert.equal(snapshot.releaseReview.selection, "enabled");
    assert.equal(item.invoke("verify").status, 0);
  } finally {
    rmSync(item.temporary, { recursive: true, force: true });
  }
});

test("capture_rejects_committed_review_scope_digest_mismatch", () => {
  const item = fixture({ reviewSelection: "enabled", tamperScopeHash: true });
  try {
    const captured = item.invoke("capture");
    assert.equal(captured.status, 1);
    assert.match(captured.stderr, /scopeDiffSha256 does not match the Git diff/);
    assert.equal(existsSync(item.snapshot), false);
  } finally {
    rmSync(item.temporary, { recursive: true, force: true });
  }
});

test("capture_accepts_advertised_default_with_a_different_name_and_commit", () => {
  const item = fixture({ repositoryDefaultBranch: "stable" });
  try {
    const captured = item.invoke("capture");
    assert.equal(captured.status, 0, captured.stderr);
    const snapshot = JSON.parse(readFileSync(item.snapshot, "utf8"));
    assert.equal(snapshot.remoteReleaseBranch, "release");
    assert.equal(snapshot.releaseDefaultBranch, "trunk");
    assert.equal(snapshot.sourceCommit, item.head);
    assert.equal(item.invoke("verify").status, 0);
    assert.equal(run("git", ["-C", item.remote, "symbolic-ref", "HEAD"], { env: item.env }).stdout.trim(), "refs/heads/stable");
    assert.equal(run("git", ["-C", item.remote, "rev-parse", "refs/heads/stable"], { env: item.env }).stdout.trim(), item.baseline);
  } finally {
    rmSync(item.temporary, { recursive: true, force: true });
  }
});

test("missing_fetched_tag_is_rejected", () => {
  const item = fixture();
  try {
    item.git("tag", "-d", "v1.2.3-20260909");
    const result = item.invoke("capture");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /missing or invalid fetched ref/);
  } finally {
    rmSync(item.temporary, { recursive: true, force: true });
  }
});

test("fetched_tag_on_a_different_commit_is_rejected", () => {
  const item = fixture();
  try {
    item.git("tag", "-f", "v1.2.3-20260909", "HEAD^");
    const result = item.invoke("capture");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /fetched release tag does not equal source_commit/);
  } finally {
    rmSync(item.temporary, { recursive: true, force: true });
  }
});

test("snapshot_change_is_rejected_at_second_gate", () => {
  const item = fixture();
  try {
    assert.equal(item.invoke("capture").status, 0);
    const snapshot = JSON.parse(readFileSync(item.snapshot, "utf8"));
    snapshot.version = "9.9.9";
    writeFileSync(item.snapshot, JSON.stringify(snapshot), "utf8");
    const result = item.invoke("verify");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /changed between build checks/);
  } finally {
    rmSync(item.temporary, { recursive: true, force: true });
  }
});

test("missing_fetched_origin_release_branch_is_rejected", () => {
  const item = fixture();
  try {
    item.git("update-ref", "-d", "refs/remotes/origin/release");
    const result = item.invoke("capture");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /missing or invalid fetched ref/);
  } finally {
    rmSync(item.temporary, { recursive: true, force: true });
  }
});

test("fetched_origin_release_branch_on_a_different_commit_is_rejected", () => {
  const item = fixture();
  try {
    item.git("update-ref", "refs/remotes/origin/release", item.baseline);
    const result = item.invoke("capture");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /fetched origin release branch does not equal source_commit/);
  } finally {
    rmSync(item.temporary, { recursive: true, force: true });
  }
});

test("fetched_default_branch_is_not_required_for_release_capture", () => {
  const item = fixture({ repositoryDefaultBranch: "stable" });
  try {
    item.git("update-ref", "-d", "refs/remotes/origin/stable");
    const result = item.invoke("capture");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(item.invoke("verify").status, 0);
  } finally {
    rmSync(item.temporary, { recursive: true, force: true });
  }
});

test("release_branch_drift_after_capture_is_rejected_before_manifest", () => {
  const item = fixture();
  try {
    assert.equal(item.invoke("capture").status, 0);
    item.git("update-ref", "refs/remotes/origin/release", item.baseline);
    const result = item.invoke("verify");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /fetched origin release branch does not equal source_commit/);
  } finally {
    rmSync(item.temporary, { recursive: true, force: true });
  }
});

test("tag_drift_after_capture_is_rejected_before_manifest", () => {
  const item = fixture();
  try {
    assert.equal(item.invoke("capture").status, 0);
    item.git("tag", "-f", "v1.2.3-20260909", item.baseline);
    const result = item.invoke("verify");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /fetched release tag does not equal source_commit/);
  } finally {
    rmSync(item.temporary, { recursive: true, force: true });
  }
});
