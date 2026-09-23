/** Git 生命周期分支、状态、Worktree 与 publish 黑盒回归。 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SCRIPT, collectProcess, lifecycleFixture, run, spawnHelper } from "./git_lifecycle_test_support.mjs";
import { resolveRepository, statePath, validBranch } from "./git_lifecycle_core.mjs";

/** 在隔离 fixture 中执行测试并保证清理。 */
function scenario(name, callback) {
  test(name, async () => {
    const item = lifecycleFixture();
    try {
      await callback(item);
    } finally {
      item.cleanup();
    }
  });
}

test("help_and_invalid_arguments_are_single_line_json", () => {
  for (const [args, status] of [[["--help"], 0], [[], 1]]) {
    const result = run(process.execPath, [SCRIPT, ...args], { check: false });
    assert.equal(result.status, status);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout.trimEnd().split("\n").length, 1);
    assert.equal(typeof JSON.parse(result.stdout), "object");
  }
});

scenario("start_without_remote_is_idempotent_and_uses_common_dir_state", (item) => {
  const { repository } = item.initializeRepository({ remote: false });
  const started = item.helper(repository, ["start", "--summary", "offline-fix"]).payload;
  assert.match(started.branch, /^feature-offline-fix-\d{8}$/);
  assert.equal(started.remote, null);
  assert.equal(item.git(repository, "branch", "--show-current").stdout.trim(), started.branch);
  const repeated = item.helper(repository, ["start", "--summary", "offline-fix"]).payload;
  assert.equal(repeated.status, "already-started");
  assert.equal(repeated.branch, started.branch);
  const resolved = resolveRepository(repository);
  assert.equal(readFileSync(statePath(resolved), "utf8").includes("offline-fix"), true);
});

scenario("branch_validation_rejects_ambiguous_pseudo_refs", (item) => {
  const { repository } = item.initializeRepository({ remote: false });
  const resolved = resolveRepository(repository);
  assert.equal(validBranch(resolved, "@"), false);
  assert.equal(validBranch(resolved, "HEAD"), false);
  assert.equal(validBranch(resolved, "feature/@-safe"), true);
});

scenario("legacy_v2_state_is_loaded_and_schema_v1_is_rejected", (item) => {
  const { repository } = item.initializeRepository({ remote: false });
  const path = statePath(resolveRepository(repository));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({
    schemaVersion: 2, remote: null, defaultBranch: "main", cycle: null, lastRelease: null,
  }), "utf8");
  const inspected = item.helper(repository, ["inspect"]).payload;
  assert.equal(inspected.state.pendingPublish, null);
  writeFileSync(path, JSON.stringify({
    schemaVersion: 1, remote: null, defaultBranch: "main", cycle: null,
    pendingPublish: null, lastRelease: null,
  }), "utf8");
  const rejected = item.helper(repository, ["inspect"], { success: false }).payload;
  assert.equal(rejected.code, "state-invalid");
});

scenario("registered_remote_precedes_origin_and_conflicting_override_fails", (item) => {
  const { repository, bare } = item.initializeRepository({ remote: true });
  item.git(repository, "remote", "add", "github", bare);
  item.git(repository, "fetch", "--quiet", "github");
  item.git(repository, "remote", "set-head", "github", "--auto");
  const started = item.helper(repository, ["start", "--summary", "stored-remote", "--remote", "github"]).payload;
  assert.equal(started.remote, "github");
  assert.equal(item.helper(repository, ["inspect"]).payload.remote, "github");
  assert.equal(item.helper(repository, ["inspect", "--remote", "origin"], { success: false }).payload.code, "remote-conflict");
});

scenario("start_adds_numeric_suffix_for_local_name_collisions", (item) => {
  const { repository } = item.initializeRepository({ remote: false });
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()).replaceAll("-", "");
  const base = `feature-collision-${date}`;
  item.git(repository, "branch", base);
  item.git(repository, "branch", `${base}-2`);
  assert.equal(item.helper(repository, ["start", "--summary", "collision"]).payload.branch, `${base}-3`);
});

scenario("concurrent_task_starts_preserve_both_branches_and_worktrees", async (item) => {
  const { repository } = item.initializeRepository({ remote: false });
  const worktrees = [join(item.temporary, "task-one"), join(item.temporary, "task-two")];
  for (const worktree of worktrees) item.git(repository, "worktree", "add", "--quiet", "--detach", worktree, "HEAD");
  const children = worktrees.map((worktree, index) => spawnHelper(
    worktree,
    ["start", "--summary", index === 0 ? "parallel-one" : "parallel-two"],
    item.env,
  ));
  const results = await Promise.all(children.map(collectProcess));
  for (const result of results) {
    assert.equal(result.status, 0, result.stdout);
    assert.equal(result.stderr, "");
  }
  const branches = new Set(results.map((result) => JSON.parse(result.stdout).branch));
  const cycle = item.state(repository).cycle;
  assert.deepEqual(new Set(cycle.branches.map((entry) => entry.name)), branches);
  assert.deepEqual(
    new Set(cycle.worktrees.map((entry) => entry.path)),
    new Set(worktrees.map((worktree) => realpathSync(worktree))),
  );
});

scenario("publish_merges_switches_and_pushes_without_tag_or_cleanup", (item) => {
  const { repository } = item.initializeRepository({ remote: true });
  const branch = item.helper(repository, ["start", "--summary", "publish-only"]).payload.branch;
  const expectedHead = item.commitFile(repository, "published.txt", "published\n");
  item.git(repository, "push", "--quiet", "origin", `refs/heads/${branch}:refs/heads/${branch}`);
  const published = item.helper(repository, ["publish"]).payload;
  assert.equal(published.status, "published");
  assert.equal(published.branch, "main");
  assert.equal(published.head, expectedHead);
  assert.equal(published.tagged, false);
  assert.equal(published.cleaned, false);
  assert.equal(item.git(repository, "branch", "--show-current").stdout.trim(), "main");
  assert.equal(item.localBranchExists(repository, branch), true);
  assert.equal(item.remoteBranchExists(repository, "origin", branch), true);
  assert.equal(item.state(repository).cycle !== null, true);
});

scenario("publish_merges_current_remote_default_before_development_branches", (item) => {
  const { repository, bare } = item.initializeRepository({ remote: true });
  item.helper(repository, ["start", "--summary", "remote-advance"]);
  const featureHead = item.commitFile(repository, "feature.txt", "feature\n");
  const collaborator = join(item.temporary, "collaborator");
  item.git(item.temporary, "clone", "--quiet", bare, collaborator);
  item.git(collaborator, "config", "user.name", "Remote Collaborator");
  item.git(collaborator, "config", "user.email", "remote@example.invalid");
  const remoteHead = item.commitFile(collaborator, "remote.txt", "remote\n");
  item.git(collaborator, "push", "--quiet", "origin", "main");
  const published = item.helper(repository, ["publish"]).payload;
  assert.equal(item.gitUnchecked(repository, "merge-base", "--is-ancestor", remoteHead, published.head).status, 0);
  assert.equal(item.gitUnchecked(repository, "merge-base", "--is-ancestor", featureHead, published.head).status, 0);
});

scenario("publish_pushes_same_head_to_additional_remote_without_rebinding", (item) => {
  const { repository } = item.initializeRepository({ remote: true });
  item.git(repository, "remote", "rename", "origin", "github");
  item.addBareRemote(repository, "origin", "stable");
  item.helper(repository, ["start", "--summary", "multi-remote", "--remote", "github"]);
  const expectedHead = item.commitFile(repository, "multi-remote.txt", "shared head\n");
  const published = item.helper(repository, ["publish", "--also-remote", "origin"]).payload;
  assert.equal(published.remote, "github");
  assert.equal(published.head, expectedHead);
  assert.deepEqual(published.publishedRemotes, [
    { remote: "github", branch: "main" },
    { remote: "origin", branch: "stable" },
  ]);
  assert.equal(item.state(repository).remote, "github");
});

scenario("publish_rejects_invalid_additional_remote_sets_before_pushing", (item) => {
  const { repository } = item.initializeRepository({ remote: true });
  item.helper(repository, ["start", "--summary", "invalid-targets"]);
  item.commitFile(repository, "candidate.txt", "candidate\n");
  for (const args of [
    ["publish", "--also-remote", "origin"],
    ["publish", "--also-remote", "missing"],
    ["publish", "--also-remote", "../unsafe"],
  ]) {
    assert.equal(item.helper(repository, args, { success: false }).payload.code.match(/invalid-argument|remote-not-found/) !== null, true);
  }
});

scenario("publish_refuses_missing_registered_branch", (item) => {
  const { repository } = item.initializeRepository({ remote: true });
  const branch = item.helper(repository, ["start", "--summary", "missing-branch"]).payload.branch;
  item.git(repository, "switch", "--quiet", "main");
  item.git(repository, "branch", "-D", branch);
  const rejected = item.helper(repository, ["publish"], { success: false }).payload;
  assert.equal(rejected.code, "registered-branch-missing");
});
