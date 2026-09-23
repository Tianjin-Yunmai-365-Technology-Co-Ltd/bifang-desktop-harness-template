/** Git 生命周期根合同的失败关闭 mutation 回归。 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  AGENT_POLICY,
  GIT_LIFECYCLE_CORE,
  GIT_LIFECYCLE_PUBLICATION,
  GIT_LIFECYCLE_RELEASE_TESTS,
  GIT_LIFECYCLE_SKILL,
  GIT_LIFECYCLE_TESTS,
  GIT_PUBLICATION_REPORT,
  GIT_PUBLICATION_TEST_CASES,
  RELEASE_CONTEXT_HELPER,
  RELEASE_DOC,
  validateGitLifecycleContract,
} from "./git_lifecycle.mjs";
import { mutateFile, withTemporaryFile } from "./release_test_support.mjs";

function validateMutation(option, sourcePath, fragment, replacement = "") {
  const contents = mutateFile(sourcePath, fragment, replacement);
  return withTemporaryFile(contents, path.basename(sourcePath), (filePath) => {
    const errors = [];
    validateGitLifecycleContract(errors, { [option]: filePath, scanRetired: false });
    return errors;
  });
}

function validateContents(option, sourcePath, contents) {
  return withTemporaryFile(contents, path.basename(sourcePath), (filePath) => {
    const errors = [];
    validateGitLifecycleContract(errors, { [option]: filePath, scanRetired: false });
    return errors;
  });
}

function expectErrors(errors, fragment) {
  assert.ok(errors.length > 0, "mutation unexpectedly passed");
  if (fragment) assert.ok(errors.some((error) => error.includes(fragment)), errors.join("\n"));
}

test("current Git lifecycle contract passes", () => {
  const errors = [];
  validateGitLifecycleContract(errors);
  assert.deepEqual(errors, []);
});

const fixedFragmentCases = [
  ["additional remote CLI contract", "skill", GIT_LIFECYCLE_SKILL, "[--also-remote <name>]..."],
  ["stable primary push error code", "report", GIT_PUBLICATION_REPORT, '"push-failed": "push-rejected"'],
  ["legacy v2 pendingPublish loader", "core", GIT_LIFECYCLE_CORE, "parsed.pendingPublish = null"],
  ["exact local branch cleanup", "publication", GIT_LIFECYCLE_PUBLICATION, '["branch", "-D", "--", branch]'],
  ["release context digest argument", "script", path.join(path.dirname(GIT_LIFECYCLE_CORE), "git_lifecycle.mjs"), "if (args.version === undefined || args.releaseContextSha256 === undefined) invalidArguments();"],
  ["lifecycle main test inventory", "tests", GIT_LIFECYCLE_TESTS, "publish_refuses_missing_registered_branch"],
  ["lifecycle release test inventory", "releaseTests", GIT_LIFECYCLE_RELEASE_TESTS, "dirty_registered_worktree_blocks_release_then_clean_retry_succeeds"],
  ["publication retry test inventory", "publicationTests", GIT_PUBLICATION_TEST_CASES, "additional_remote_rejection_preserves_prefix_and_retry_succeeds"],
];

for (const [name, option, source, fragment] of fixedFragmentCases) {
  test(`rejects missing ${name}`, () => expectErrors(validateMutation(option, source, fragment), "Git lifecycle contract"));
}

test("release context default branch uses check-ref-format", () => {
  const fragment = '["check-ref-format", "--branch", args.defaultBranch]';
  const replacement = '["rev-parse", args.defaultBranch]';
  expectErrors(validateMutation("contextHelper", RELEASE_CONTEXT_HELPER, fragment, replacement), "Git lifecycle contract");
});

test("legacy v2 compatibility wording is required on all authoritative surfaces", () => {
  const compatibility = "既有合法 v2 状态缺少新增可空 `pendingPublish` 时按 `null` 兼容读取";
  for (const [option, source] of [["skill", GIT_LIFECYCLE_SKILL], ["agentPolicy", AGENT_POLICY], ["releaseDoc", RELEASE_DOC]]) {
    expectErrors(validateMutation(option, source, compatibility), "Git lifecycle contract");
  }
});

test("publication journal is cleared only after final local verification", () => {
  const source = fs.readFileSync(GIT_LIFECYCLE_PUBLICATION, "utf8");
  const before = [
    "verifyLocalPosition(repository, primary.branch, head);",
    "state.pendingPublish = null;",
    "saveState(repository, state);",
  ].join("\n  ");
  const after = [
    "state.pendingPublish = null;",
    "saveState(repository, state);",
    "verifyLocalPosition(repository, primary.branch, head);",
  ].join("\n  ");
  assert.ok(source.includes(before), "publication sequence fixture changed");
  expectErrors(validateContents("publication", GIT_LIFECYCLE_PUBLICATION, source.replace(before, after)), "publication journal completion");
});

test("additional remote is reread before and after push", () => {
  const source = fs.readFileSync(GIT_LIFECYCLE_PUBLICATION, "utf8");
  const fragment = "remoteHead = remoteBranchOid(";
  assert.equal(source.split(fragment).length - 1 >= 2, true);
  expectErrors(validateContents("publication", GIT_LIFECYCLE_PUBLICATION, source.replace(fragment, "remoteHead = null; // ")), "frozen publication target");
});

test("release binds context before loading primary lifecycle state", () => {
  const source = fs.readFileSync(GIT_LIFECYCLE_PUBLICATION, "utf8");
  const before = "await releaseContextBinding(repository, args.releaseContextSha256, identity, args);";
  assert.ok(source.includes(before), "release binding fixture changed");
  expectErrors(validateContents("publication", GIT_LIFECYCLE_PUBLICATION, source.replace(before, "await Promise.resolve();")), "caller-context-before-primary");
});

test("fresh local release initializes its default branch from context", () => {
  const source = fs.readFileSync(GIT_LIFECYCLE_PUBLICATION, "utf8");
  expectErrors(validateContents("publication", GIT_LIFECYCLE_PUBLICATION, source.replace("defaultBranch = state.defaultBranch ?? context.defaultBranch", "defaultBranch = state.defaultBranch")), "local context default initialization");
});

test("release persists pending context before performing release", () => {
  const source = fs.readFileSync(GIT_LIFECYCLE_PUBLICATION, "utf8");
  const before = "cycle.pendingRelease =";
  expectErrors(validateContents("publication", GIT_LIFECYCLE_PUBLICATION, source.replace(before, "cycle.retiredPending =")), "context-bound pending-before-release");
});

test("remote release freezes only a context-verified integrated head", () => {
  const source = fs.readFileSync(GIT_LIFECYCLE_PUBLICATION, "utf8");
  const before = [
    "verifyHeadReleaseContextBytes(repository, pending.releaseContextSha256, prepared.head);",
    "pending.head = prepared.head;",
    "saveState(repository, state);",
  ].join("\n  ");
  const after = [
    "pending.head = prepared.head;",
    "saveState(repository, state);",
    "verifyHeadReleaseContextBytes(repository, pending.releaseContextSha256, prepared.head);",
  ].join("\n  ");
  assert.ok(source.includes(before), "freeze sequence fixture changed");
  expectErrors(validateContents("publication", GIT_LIFECYCLE_PUBLICATION, source.replace(before, after)), "integrated-context-before-frozen-head");
});

test("local and remote tags are confirmed before any cleanup", () => {
  const source = fs.readFileSync(GIT_LIFECYCLE_PUBLICATION, "utf8");
  for (const fragment of [
    "ensureReleaseTag(repository, remote, pending.tag, pending.head);",
    "ensureLocalReleaseTag(repository, pending.tag, pending.head);",
  ]) {
    assert.ok(source.includes(fragment), `tag fixture changed: ${fragment}`);
    expectErrors(validateContents("publication", GIT_LIFECYCLE_PUBLICATION, source.replace(fragment, "skipTagVerification();")), "tag-before-cleanup");
  }
});

test("local release helpers may not access any remote operation", () => {
  const source = fs.readFileSync(GIT_LIFECYCLE_PUBLICATION, "utf8");
  const marker = "function prepareLocalRelease(repository, state) {\n";
  assert.ok(source.includes(marker), "local release fixture changed");
  const injected = source.replace(marker, `${marker}  selectRemote(repository);\n`);
  expectErrors(validateContents("publication", GIT_LIFECYCLE_PUBLICATION, injected), "local release path accesses remote operation");
});

test("retired linear, lease, atomic, and ancestry gates remain forbidden", () => {
  const source = fs.readFileSync(GIT_LIFECYCLE_CORE, "utf8");
  for (const token of ['"--ff-only"', '"--force-with-lease', '"--atomic"', '"merge-base"']) {
    expectErrors(validateContents("core", GIT_LIFECYCLE_CORE, `${source}\n// ${token}\n`), "branch gate remains");
  }
});

test("invalid lifecycle JavaScript fails the syntax gate", () => {
  expectErrors(validateContents("core", GIT_LIFECYCLE_CORE, "export function broken( {\n"), "invalid Git lifecycle Node module");
});
