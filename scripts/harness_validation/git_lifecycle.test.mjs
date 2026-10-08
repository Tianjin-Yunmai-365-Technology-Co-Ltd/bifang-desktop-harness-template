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
  ["released resource snapshot", "publication", GIT_LIFECYCLE_PUBLICATION, "state.releasedResources.push({", "state.releasedResources.push /* mutation */ ({"],
  ["independent released tag push", "publication", GIT_LIFECYCLE_PUBLICATION, '["push", remote, "refs/tags/" + last.tag + ":refs/tags/" + last.tag]'],
  ["schema v4 state", "core", GIT_LIFECYCLE_CORE, "export const SCHEMA_VERSION = 4"],
  ["v3 actionless migration", "core", GIT_LIFECYCLE_CORE, "function migrateV3("],
  ["v3 in-flight release rejection", "core", GIT_LIFECYCLE_CORE, 'legacy.cycle?.pendingRelease !== null'],
  ["frozen pending action", "publication", GIT_LIFECYCLE_PUBLICATION, "postReleaseAction,"],
  ["frozen push action", "publication", GIT_LIFECYCLE_PUBLICATION, 'if (last.postReleaseAction !== null && last.postReleaseAction !== "push_release_branch")'],
  ["Harness source release identity", "publication", GIT_LIFECYCLE_PUBLICATION, "if (last.postReleaseAction === null && !isHarnessSourceRelease(repository, last))"],
  ["local package action gate", "core", GIT_LIFECYCLE_CORE, "export function commandCheckPostRelease("],
  ["release context digest argument", "script", path.join(path.dirname(GIT_LIFECYCLE_CORE), "git_lifecycle.mjs"), "if (args.version === undefined || args.releaseContextSha256 === undefined) invalidArguments();"],
  ["lifecycle main test inventory", "tests", GIT_LIFECYCLE_TESTS, "publish_refuses_missing_registered_branch"],
  ["lifecycle release test inventory", "releaseTests", GIT_LIFECYCLE_RELEASE_TESTS, "dirty_registered_worktree_blocks_release_then_clean_retry_succeeds"],
  ["publication retry test inventory", "publicationTests", GIT_PUBLICATION_TEST_CASES, "additional_remote_rejection_preserves_prefix_and_retry_succeeds"],
];

for (const [name, option, source, fragment, replacement = ""] of fixedFragmentCases) {
  test(`rejects missing ${name}`, () => expectErrors(
    validateMutation(option, source, fragment, replacement),
    name === "released resource snapshot" ? "local tag-before-release-record" :
      name === "frozen pending action" ? "context-bound pending-before-release" : "Git lifecycle contract",
  ));
}

test("release context default branch uses check-ref-format", () => {
  const fragment = '["check-ref-format", "--branch", args.defaultBranch]';
  const replacement = '["rev-parse", args.defaultBranch]';
  expectErrors(validateMutation("contextHelper", RELEASE_CONTEXT_HELPER, fragment, replacement), "Git lifecycle contract");
});

test("legacy in-flight v2 state cannot be silently reinterpreted", () => {
  for (const [option, source, fragment] of [
    ["skill", GIT_LIFECYCLE_SKILL, "v2 的 `pendingRelease` 或 `pendingPublish` 非空时拒绝自动改释"],
    ["agentPolicy", AGENT_POLICY, "旧状态若含正在进行的双模式发布或推送，不能静默改写为新语义"],
    ["releaseDoc", RELEASE_DOC, "有未完成远端发布或推送的旧状态失败关闭"],
  ]) expectErrors(validateMutation(option, source, fragment), "Git lifecycle contract");
});

test("completed v2 release migration verifies its tagged context digest", () => {
  expectErrors(validateMutation("core", GIT_LIFECYCLE_CORE,
    'createHash("sha256").update(contextBlob.stdout).digest("hex") !== last.releaseContextSha256',
    "false"), "Git lifecycle contract missing");
});

test("publish cannot move the published branch before a new cycle", () => {
  expectErrors(validateMutation("publication", GIT_LIFECYCLE_PUBLICATION,
    "if (state.cycle === null && state.lastRelease !== null)", "if (false)"), "Git lifecycle contract missing");
});

test("push-release rejects option-like remote names", () => {
  expectErrors(validateMutation("publication", GIT_LIFECYCLE_PUBLICATION,
    "if (!validRemote(remote))", "if (false)"), "Git lifecycle contract missing");
});

test("push-release verifies all remote refs after the tag update", () => {
  expectErrors(validateMutation("publication", GIT_LIFECYCLE_PUBLICATION,
    "defaultHead: confirmedDefaultHead } = remoteReleaseRefs(repository, remote, last.tag))", "confirmedBranch = last.head; confirmedTag = last.head"), "Git lifecycle contract missing");
});

test("push-release requires default branch synchronization and final drift checks", () => {
  expectErrors(validateMutation("publication", GIT_LIFECYCLE_PUBLICATION,
    '["push", remote, last.head + ":refs/heads/" + defaultBranch]', '[]'),
  "independent released-head-and-tag push sequence");
  expectErrors(validateMutation("publication", GIT_LIFECYCLE_PUBLICATION,
    "confirmedDefaultBranch !== defaultBranch || confirmedDefaultHead !== last.head", "false"),
  "post-release default branch synchronization");
});

test("push-release targets the fixed release branch", () => {
  expectErrors(validateMutation("publication", GIT_LIFECYCLE_PUBLICATION,
    "const branch = RELEASE_BRANCH", 'const branch = remoteDefaultBranch(repository, remote)'),
  "independent released-head-and-tag push sequence");
  expectErrors(validateMutation("publication", GIT_LIFECYCLE_PUBLICATION,
    'const RELEASE_BRANCH = "release";', 'const RELEASE_BRANCH = "Release";'),
  "Git lifecycle contract");
});

test("local release branch must retain recorded provenance and use compare-and-swap", () => {
  expectErrors(validateMutation("publication", GIT_LIFECYCLE_PUBLICATION,
    "state.releasedResources.some((released) => released.head === previous)", "true"),
  "local release branch provenance and compare-and-swap sequence");
  expectErrors(validateMutation("publication", GIT_LIFECYCLE_PUBLICATION,
    '["update-ref", "refs/heads/release", head, expected]',
    '["update-ref", "refs/heads/release", head]'),
  "local release branch provenance and compare-and-swap sequence");
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
  const before = "await releaseContextBinding(repository, args.releaseContextSha256, identity);";
  assert.ok(source.includes(before), "release binding fixture changed");
  expectErrors(validateContents("publication", GIT_LIFECYCLE_PUBLICATION, source.replace(before, "await Promise.resolve();")), "caller-context-before-primary");
});

test("Harness release checks the managed timestamp stamp before lifecycle state changes", () => {
  expectErrors(validateMutation("publication", GIT_LIFECYCLE_PUBLICATION,
    "await verifyHarnessVersionStamp(repository, identity.version);"), "caller-context-before-primary sequence");
});

test("release recomputes the enabled review scope before lifecycle state changes", () => {
  expectErrors(validateMutation("publication", GIT_LIFECYCLE_PUBLICATION,
    "module.verifyReviewScope(repository.root, value);"), "Git lifecycle contract");
});

test("release binds reviewed metadata before switching to primary worktree", () => {
  expectErrors(validateMutation("publication", GIT_LIFECYCLE_PUBLICATION,
    "const reviewed = reviewedReleaseMetadata(repository, context, state);"), "caller-context-before-primary sequence");
});

test("fresh local release initializes its default branch from context", () => {
  const source = fs.readFileSync(GIT_LIFECYCLE_PUBLICATION, "utf8");
  expectErrors(validateContents("publication", GIT_LIFECYCLE_PUBLICATION, source.replace("defaultBranch = state.defaultBranch ?? context.defaultBranch", "defaultBranch = state.defaultBranch")), "local context default initialization");
});

test("release persists pending context before performing release", () => {
  const source = fs.readFileSync(GIT_LIFECYCLE_PUBLICATION, "utf8");
  const before = "state.cycle.pendingRelease =";
  expectErrors(validateContents("publication", GIT_LIFECYCLE_PUBLICATION, source.replace(before, "state.cycle.retiredPending =")), "context-bound pending-before-release");
});

test("local release freezes only a context-verified integrated head", () => {
  const source = fs.readFileSync(GIT_LIFECYCLE_PUBLICATION, "utf8");
  const before = [
    "verifyHeadReleaseContextBytes(repository, pending.releaseContextSha256, prepared.head);",
    "verifyReviewedFinalHead(repository, reviewed, prepared.head);",
    "await verifyFinalReleaseVersion(repository, pending.version);",
    "pending.head = prepared.head;",
    "saveState(repository, state);",
  ].join("\n  ");
  const after = [
    "pending.head = prepared.head;",
    "saveState(repository, state);",
    "verifyHeadReleaseContextBytes(repository, pending.releaseContextSha256, prepared.head);",
    "verifyReviewedFinalHead(repository, reviewed, prepared.head);",
    "await verifyFinalReleaseVersion(repository, pending.version);",
  ].join("\n  ");
  assert.ok(source.includes(before), "freeze sequence fixture changed");
  expectErrors(validateContents("publication", GIT_LIFECYCLE_PUBLICATION, source.replace(before, after)), "integrated-context-before-frozen-head");
});

test("local tag is confirmed before recording Released", () => {
  const source = fs.readFileSync(GIT_LIFECYCLE_PUBLICATION, "utf8");
  const fragment = "ensureLocalReleaseTag(repository, pending.tag, pending.head);";
  assert.ok(source.includes(fragment), "local tag fixture changed");
  expectErrors(validateContents("publication", GIT_LIFECYCLE_PUBLICATION, source.replace(fragment, "skipTagVerification();")), "local tag-before-release-record");
});

test("enabled review checks final integrated head before the tag", () => {
  expectErrors(validateMutation("publication", GIT_LIFECYCLE_PUBLICATION,
    "verifyReviewedFinalHead(repository, reviewed, prepared.head);"), "integrated-context-before-frozen-head");
});

test("post-release push rereads the local tag after remote confirmation", () => {
  const source = fs.readFileSync(GIT_LIFECYCLE_PUBLICATION, "utf8");
  const fragment = "localTagTarget(repository, last.tag) !== last.head";
  const index = source.lastIndexOf(fragment);
  assert.ok(index > source.indexOf(fragment), "final local tag fixture changed");
  expectErrors(validateContents("publication", GIT_LIFECYCLE_PUBLICATION,
    source.slice(0, index) + "finalTagNotChecked" + source.slice(index + fragment.length)),
  "post-release push must check the frozen local tag before and after push");
});

test("Git release path may not access remote or clean registered resources", () => {
  const source = fs.readFileSync(GIT_LIFECYCLE_PUBLICATION, "utf8");
  const marker = "export async function commandRelease(repository, args) {\n";
  assert.ok(source.includes(marker), "release fixture changed");
  const injected = source.replace(marker, `${marker}  selectRemote(repository);\n`);
  expectErrors(validateContents("publication", GIT_LIFECYCLE_PUBLICATION, injected), "Git release path accesses remote operation or cleanup");
  const injectedCleanup = source.replace(marker, `${marker}  cleanupWorktrees(repository);\n`);
  expectErrors(validateContents("publication", GIT_LIFECYCLE_PUBLICATION, injectedCleanup), "Git release path accesses remote operation or cleanup");
});

test("post-release push must keep branch-before-tag verification and no local merge", () => {
  const source = fs.readFileSync(GIT_LIFECYCLE_PUBLICATION, "utf8");
  const fragment = '["push", remote, "refs/tags/" + last.tag + ":refs/tags/" + last.tag]';
  expectErrors(validateContents("publication", GIT_LIFECYCLE_PUBLICATION, source.replace(fragment, '["push", remote, last.head]')), "independent released-head-and-tag push sequence");
  const marker = "export function commandPushRelease(repository, args) {\n";
  const injected = source.replace(marker, `${marker}  mergeRegisteredBranches(repository);\n`);
  expectErrors(validateContents("publication", GIT_LIFECYCLE_PUBLICATION, injected), "post-release push changes local release");
});

test("new development cycle requires verified released HEAD", () => {
  const source = fs.readFileSync(GIT_LIFECYCLE_CORE, "utf8");
  const fragment = "baseReference = `refs/heads/${released.defaultBranch}`";
  expectErrors(validateContents("core", GIT_LIFECYCLE_CORE, source.replace(fragment, "baseReference = null")), "new-cycle start from verified released HEAD");
});

test("retired linear, lease, and atomic gates remain forbidden", () => {
  const source = fs.readFileSync(GIT_LIFECYCLE_CORE, "utf8");
  for (const token of ['"--ff-only"', '"--force-with-lease', '"--atomic"']) {
    expectErrors(validateContents("core", GIT_LIFECYCLE_CORE, `${source}\n// ${token}\n`), "branch gate remains");
  }
});

test("invalid lifecycle JavaScript fails the syntax gate", () => {
  expectErrors(validateContents("core", GIT_LIFECYCLE_CORE, "export function broken( {\n"), "invalid Git lifecycle Node module");
});
