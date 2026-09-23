/** Git 生命周期本地/远端 release、标签和精确清理回归。 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lifecycleFixture } from "./git_lifecycle_test_support.mjs";

/** 在隔离 fixture 中执行发布场景。 */
function scenario(name, callback) {
  test(name, () => {
    const item = lifecycleFixture();
    try {
      callback(item);
    } finally {
      item.cleanup();
    }
  });
}

/** 建立远端 feature 候选并提交规范发布上下文。 */
function remoteCandidate(item, summary = "release-flow", version = "1.2.3", date = "20260909") {
  const { repository, bare } = item.initializeRepository({ remote: true });
  const branch = item.helper(repository, ["start", "--summary", summary]).payload.branch;
  item.commitFile(repository, "candidate.txt", "candidate\n");
  item.git(repository, "push", "--quiet", "origin", `refs/heads/${branch}:refs/heads/${branch}`);
  const context = item.prepareReleaseContext(repository, {
    version, date, gitPublication: "remote", remote: "origin",
  });
  return { repository, bare, branch, context, version, date };
}

scenario("remote_release_tags_before_exact_cleanup_and_retry_is_idempotent", (item) => {
  const candidate = remoteCandidate(item);
  const released = item.helper(candidate.repository, [
    "release", "--version", candidate.version, "--date", candidate.date,
    "--remote", "origin", "--release-context-sha256", candidate.context.digest,
  ]).payload;
  assert.equal(released.status, "released");
  assert.equal(released.head, candidate.context.head);
  assert.equal(released.tag, "v1.2.3-20260909");
  assert.deepEqual(released.cleanedRemoteBranches, [candidate.branch]);
  assert.deepEqual(released.cleanedLocalBranches, [candidate.branch]);
  assert.equal(item.localBranchExists(candidate.repository, candidate.branch), false);
  assert.equal(item.remoteBranchExists(candidate.repository, "origin", candidate.branch), false);
  assert.match(item.git(candidate.repository, "ls-remote", "--tags", "origin", "refs/tags/v1.2.3-20260909").stdout, new RegExp(`^${candidate.context.head}`));
  const repeated = item.helper(candidate.repository, [
    "release", "--version", candidate.version, "--date", candidate.date,
    "--remote", "origin", "--release-context-sha256", candidate.context.digest,
  ]).payload;
  assert.equal(repeated.status, "already-released");
});

scenario("first_local_release_initializes_default_branch_without_cycle_state", (item) => {
  const { repository } = item.initializeRepository({ remote: false });
  const context = item.prepareReleaseContext(repository, {
    version: "2.0.0", date: "20260910", gitPublication: "local", remote: null,
  });
  const released = item.helper(repository, [
    "release", "--version", "2.0.0", "--date", "20260910", "--local-only",
    "--release-context-sha256", context.digest,
  ]).payload;
  assert.equal(released.status, "released");
  assert.equal(released.gitPublication, "local");
  assert.equal(released.remote, null);
  assert.equal(item.git(repository, "rev-parse", "refs/tags/v2.0.0-20260910^{commit}").stdout.trim(), context.head);
  assert.equal(item.state(repository).lastRelease.gitPublication, "local");
});

scenario("local_release_never_accesses_remote_and_preserves_remote_refs", (item) => {
  const { repository, bare } = item.initializeRepository({ remote: true });
  const branch = item.helper(repository, ["start", "--summary", "local-only"]).payload.branch;
  item.commitFile(repository, "local.txt", "local\n");
  item.git(repository, "push", "--quiet", "origin", `refs/heads/${branch}:refs/heads/${branch}`);
  const context = item.prepareReleaseContext(repository, {
    version: "2.1.0", date: "20260911", gitPublication: "local", remote: null,
  });
  renameSync(bare, `${bare}.offline`);
  const released = item.helper(repository, [
    "release", "--version", "2.1.0", "--date", "20260911", "--local-only",
    "--release-context-sha256", context.digest,
  ]).payload;
  assert.equal(released.status, "released");
  assert.deepEqual(released.cleanedRemoteBranches, []);
  assert.equal(item.localBranchExists(repository, branch), false);
  renameSync(`${bare}.offline`, bare);
  assert.equal(item.remoteBranchExists(repository, "origin", branch), true);
});

scenario("detached_task_worktree_is_removed_after_remote_release", (item) => {
  const { repository } = item.initializeRepository({ remote: true });
  const taskWorktree = join(item.temporary, "task-worktree");
  item.git(repository, "worktree", "add", "--quiet", "--detach", taskWorktree, "HEAD");
  assert.equal(item.helper(taskWorktree, ["inspect"]).payload.branch, null);
  const branch = item.helper(taskWorktree, ["start", "--summary", "detached-task"]).payload.branch;
  item.commitFile(taskWorktree, "task.txt", "task result\n");
  item.git(taskWorktree, "push", "--quiet", "origin", `refs/heads/${branch}:refs/heads/${branch}`);
  const context = item.prepareReleaseContext(taskWorktree, {
    version: "3.0.0", date: "20260912", gitPublication: "remote", remote: "origin",
  });
  const released = item.helper(taskWorktree, [
    "release", "--version", "3.0.0", "--date", "20260912", "--remote", "origin",
    "--release-context-sha256", context.digest,
  ], { cwd: taskWorktree }).payload;
  assert.equal(released.head, context.head);
  assert.equal(existsSync(taskWorktree), false);
  assert.equal(item.localBranchExists(repository, branch), false);
  assert.equal(item.remoteBranchExists(repository, "origin", branch), false);
});

scenario("context_mode_mismatch_fails_before_any_remote_access", (item) => {
  const { repository, bare } = item.initializeRepository({ remote: true });
  const context = item.prepareReleaseContext(repository, {
    version: "3.1.0", date: "20260913", gitPublication: "local", remote: null,
  });
  renameSync(bare, `${bare}.offline`);
  const rejected = item.helper(repository, [
    "release", "--version", "3.1.0", "--date", "20260913", "--remote", "origin",
    "--release-context-sha256", context.digest,
  ], { success: false }).payload;
  assert.equal(rejected.code, "release-context-mismatch");
  assert.equal(existsSync(join(repository, ".git/agent-first-harness/git-lifecycle.json")), false);
});

scenario("release_requires_exactly_one_publication_mode", (item) => {
  const { repository } = item.initializeRepository({ remote: false });
  const digest = "0".repeat(64);
  for (const args of [
    ["release", "--version", "1.0.0", "--date", "20260914", "--release-context-sha256", digest],
    ["release", "--version", "1.0.0", "--date", "20260914", "--release-context-sha256", digest, "--local-only", "--remote", "origin"],
  ]) {
    const rejected = item.helper(repository, args, { success: false }).payload;
    assert.equal(rejected.code, "invalid-argument");
  }
});

scenario("invalid_nested_context_fails_before_pending_release", (item) => {
  const { repository } = item.initializeRepository({ remote: false });
  const context = item.prepareReleaseContext(repository, {
    version: "4.0.0", date: "20260915", gitPublication: "local", remote: null,
  });
  const path = join(repository, ".harness/release-context.json");
  const value = JSON.parse(readFileSync(path, "utf8"));
  value.releaseReview.checks = ["unexpected"];
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  item.git(repository, "add", ".harness/release-context.json");
  item.git(repository, "commit", "--quiet", "-m", "test: corrupt context");
  const rejected = item.helper(repository, [
    "release", "--version", "4.0.0", "--date", "20260915", "--local-only",
    "--release-context-sha256", context.digest,
  ], { success: false }).payload;
  assert.equal(rejected.code, "release-context-invalid");
  assert.equal(existsSync(join(repository, ".git/agent-first-harness/git-lifecycle.json")), false);
});

scenario("release_accepts_crlf_checkout_of_committed_validator", (item) => {
  const { repository } = item.initializeRepository({ remote: false });
  const context = item.prepareReleaseContext(repository, {
    version: "4.1.0", date: "20260916", gitPublication: "local", remote: null,
  });
  const helperPath = join(repository, ".agents/skills/desktop-prepare-release/scripts/release_context.mjs");
  const helper = readFileSync(helperPath, "utf8").replaceAll("\r\n", "\n");
  item.git(repository, "config", "core.autocrlf", "true");
  writeFileSync(helperPath, helper.replaceAll("\n", "\r\n"), "utf8");
  item.git(repository, "add", ".agents/skills/desktop-prepare-release/scripts/release_context.mjs");
  assert.equal(item.git(repository, "status", "--porcelain").stdout, "");
  const released = item.helper(repository, [
    "release", "--version", "4.1.0", "--date", "20260916", "--local-only",
    "--release-context-sha256", context.digest,
  ]).payload;
  assert.equal(released.status, "released");
});

scenario("local_release_tag_conflict_keeps_cycle_resources", (item) => {
  const { repository } = item.initializeRepository({ remote: false });
  const branch = item.helper(repository, ["start", "--summary", "tag-conflict"]).payload.branch;
  item.commitFile(repository, "feature.txt", "feature\n");
  const context = item.prepareReleaseContext(repository, {
    version: "5.0.0", date: "20260917", gitPublication: "local", remote: null,
  });
  const oldHead = item.git(repository, "rev-list", "--max-parents=0", "HEAD").stdout.trim();
  item.git(repository, "tag", "v5.0.0-20260917", oldHead);
  const rejected = item.helper(repository, [
    "release", "--version", "5.0.0", "--date", "20260917", "--local-only",
    "--release-context-sha256", context.digest,
  ], { success: false }).payload;
  assert.equal(rejected.code, "tag-conflict");
  assert.equal(item.localBranchExists(repository, branch), true);
  assert.equal(item.state(repository).cycle.pendingRelease.head, context.head);
});

scenario("dirty_registered_worktree_blocks_release_then_clean_retry_succeeds", (item) => {
  const { repository } = item.initializeRepository({ remote: true });
  const task = join(item.temporary, "task");
  item.git(repository, "worktree", "add", "--quiet", "--detach", task, "HEAD");
  const branch = item.helper(task, ["start", "--summary", "dirty-task"]).payload.branch;
  item.commitFile(task, "task.txt", "task\n");
  item.git(task, "push", "--quiet", "origin", `refs/heads/${branch}:refs/heads/${branch}`);
  const context = item.prepareReleaseContext(task, {
    version: "5.1.0", date: "20260918", gitPublication: "remote", remote: "origin",
  });
  writeFileSync(join(task, "untracked.txt"), "dirty\n", "utf8");
  const rejected = item.helper(task, [
    "release", "--version", "5.1.0", "--date", "20260918", "--remote", "origin",
    "--release-context-sha256", context.digest,
  ], { success: false }).payload;
  assert.equal(rejected.code, "dirty-worktree");
  item.git(task, "clean", "-f", "--", "untracked.txt");
  const released = item.helper(task, [
    "release", "--version", "5.1.0", "--date", "20260918", "--remote", "origin",
    "--release-context-sha256", context.digest,
  ], { cwd: task }).payload;
  assert.equal(released.status, "released");
});
