/** 校验开发分支、独立推送与本地主分支/tag 发布生命周期。 */

import fs from "node:fs";
import path from "node:path";

import { ROOT, SKILLS_ROOT, fail, readText, nodeSyntaxErrors, relativePath, trackedFiles } from "./core.mjs";

export const GIT_LIFECYCLE_SKILL_ROOT = path.join(SKILLS_ROOT, "desktop-manage-git-lifecycle");
export const GIT_LIFECYCLE_SKILL = path.join(GIT_LIFECYCLE_SKILL_ROOT, "SKILL.md");
export const GIT_LIFECYCLE_METADATA = path.join(GIT_LIFECYCLE_SKILL_ROOT, "agents", "openai.yaml");
export const GIT_LIFECYCLE_SCRIPT = path.join(GIT_LIFECYCLE_SKILL_ROOT, "scripts", "git_lifecycle.mjs");
export const GIT_LIFECYCLE_CORE = path.join(GIT_LIFECYCLE_SKILL_ROOT, "scripts", "git_lifecycle_core.mjs");
export const GIT_LIFECYCLE_PUBLICATION = path.join(GIT_LIFECYCLE_SKILL_ROOT, "scripts", "git_lifecycle_publication.mjs");
export const GIT_PUBLICATION_REPORT = path.join(GIT_LIFECYCLE_SKILL_ROOT, "scripts", "git_publication_report.mjs");
export const GIT_LIFECYCLE_TEST_SUPPORT = path.join(GIT_LIFECYCLE_SKILL_ROOT, "scripts", "git_lifecycle_test_support.mjs");
export const GIT_LIFECYCLE_TESTS = path.join(GIT_LIFECYCLE_SKILL_ROOT, "scripts", "git_lifecycle.test.mjs");
export const GIT_LIFECYCLE_RELEASE_TESTS = path.join(GIT_LIFECYCLE_SKILL_ROOT, "scripts", "git_lifecycle_release.test.mjs");
export const GIT_PUBLICATION_TEST_CASES = path.join(GIT_LIFECYCLE_SKILL_ROOT, "scripts", "git_publication_test_cases.test.mjs");
export const RELEASE_CONTEXT_HELPER = path.join(SKILLS_ROOT, "desktop-prepare-release", "scripts", "release_context.mjs");
export const RELEASE_CONTEXT_HELPER_TESTS = path.join(SKILLS_ROOT, "desktop-prepare-release", "scripts", "release_context.test.mjs");
export const CROSS_RELEASE_CONTEXT_HELPER = path.join(SKILLS_ROOT, "desktop-prepare-cross-platform-release", "scripts", "verify_release_context.mjs");
export const CROSS_RELEASE_CONTEXT_HELPER_TESTS = path.join(SKILLS_ROOT, "desktop-prepare-cross-platform-release", "scripts", "verify_release_context.test.mjs");
export const WORKFLOW = path.join(SKILLS_ROOT, "desktop-prepare-cross-platform-release", "assets", "github-release-candidate.yml");
export const AGENT_POLICY = path.join(ROOT, "docs", "AGENT_POLICY.md");
export const ENGINEERING_RULES = path.join(ROOT, "docs", "ENGINEERING_RULES.md");
export const RELEASE_DOC = path.join(ROOT, "docs", "RELEASE.md");

const OLD_SKILL_ROOT = path.join(SKILLS_ROOT, "desktop-manage-git-branch-chain");

/** 返回一个顶层函数的源码片段。 */
function functionSource(text, name) {
  const startPattern = new RegExp(`^(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`, "mu");
  const match = startPattern.exec(text);
  if (!match) return "";
  const rest = text.slice(match.index + match[0].length);
  const next = /^(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/mu.exec(rest);
  return text.slice(match.index, next ? match.index + match[0].length + next.index : text.length);
}

/** 要求片段按声明顺序出现。 */
function requireOrder(errors, text, fragments, label) {
  let cursor = -1;
  for (const fragment of fragments) {
    const next = text.indexOf(fragment, cursor + 1);
    if (next < 0) {
      fail(errors, `${label} missing or out of order: ${fragment}`);
      return;
    }
    cursor = next;
  }
}

/** 读取普通文本并校验固定片段。 */
function requireContract(errors, filePath, fragments, label) {
  let text;
  try {
    const metadata = fs.lstatSync(filePath);
    if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error("not a regular file");
    text = readText(filePath);
  } catch (error) {
    fail(errors, `missing ${label} file: ${relativePath(filePath)} (${error.message})`);
    return "";
  }
  for (const fragment of fragments) {
    if (!text.includes(fragment)) fail(errors, `${label} missing in ${relativePath(filePath)}: ${fragment}`);
  }
  return text;
}

/** 对执行模块和回归文件运行 Node 语法检查。 */
function validateSyntax(errors, paths) {
  for (const [filePath, detail] of nodeSyntaxErrors(paths.filter((filePath) => fs.existsSync(filePath)))) {
    if (detail !== null) fail(errors, `invalid Git lifecycle Node module ${relativePath(filePath)}: ${detail}`);
  }
}

/** 返回当前活动规则、Skill 与执行面，排除历史证据和负向测试夹具。 */
function activeContractFiles() {
  const primary = [
    "AGENTS.md", "README.md", "docs/AGENT_POLICY.md", "docs/ENGINEERING_RULES.md",
    "docs/RELEASE.md", "docs/RUST_CLI_TEMPLATE.md", "docs/VERIFICATION.md",
  ].map((relative) => path.join(ROOT, relative));
  const files = trackedFiles().filter((relative) => {
    if (relative.endsWith(".test.mjs")) return false;
    if (relative.startsWith(".agents/skills/")) {
      return relative.endsWith("/SKILL.md") || relative.endsWith("/agents/openai.yaml") ||
        /\.(?:mjs|sh|ps1|yml|yaml)$/u.test(relative);
    }
    return relative.startsWith("scripts/harness_validation/") && relative.endsWith(".mjs") &&
      path.basename(relative) !== "git_lifecycle.mjs";
  }).map((relative) => path.join(ROOT, relative));
  return [...primary, ...files];
}

/** 拒绝已经废弃的分支链、发布分支和线性历史门禁。 */
function validateNoRetiredRuntime(errors) {
  const fragments = [
    "desktop-manage-git-branch-chain", ".harness/git-branch-chain.json", "verify-release-review",
    "git push --atomic", "git merge --ff-only", "--force-with-lease", "lastClosedChain", "activeChain",
    "closing commit", "refs/heads/Release", "ref: Release", "codex/task-", "task-slug",
  ];
  const seen = new Set();
  for (const filePath of activeContractFiles()) {
    if (seen.has(filePath) || !fs.existsSync(filePath)) continue;
    seen.add(filePath);
    let text;
    try { text = readText(filePath); } catch { continue; }
    for (const fragment of fragments) {
      if (text.includes(fragment)) fail(errors, `retired Git lifecycle runtime remains in ${relativePath(filePath)}: ${fragment}`);
    }
  }
}

/** 验证 start、多远端开发期 publish、单一 Git release 与独立 push-release。 */
export function validateGitLifecycleContract(errors, overrides = {}) {
  const paths = {
    skill: GIT_LIFECYCLE_SKILL,
    metadata: GIT_LIFECYCLE_METADATA,
    script: GIT_LIFECYCLE_SCRIPT,
    core: GIT_LIFECYCLE_CORE,
    publication: GIT_LIFECYCLE_PUBLICATION,
    report: GIT_PUBLICATION_REPORT,
    support: GIT_LIFECYCLE_TEST_SUPPORT,
    tests: GIT_LIFECYCLE_TESTS,
    releaseTests: GIT_LIFECYCLE_RELEASE_TESTS,
    publicationTests: GIT_PUBLICATION_TEST_CASES,
    contextHelper: RELEASE_CONTEXT_HELPER,
    contextTests: RELEASE_CONTEXT_HELPER_TESTS,
    crossHelper: CROSS_RELEASE_CONTEXT_HELPER,
    crossTests: CROSS_RELEASE_CONTEXT_HELPER_TESTS,
    workflow: WORKFLOW,
    agentPolicy: AGENT_POLICY,
    releaseDoc: RELEASE_DOC,
    ...overrides,
  };
  if (fs.existsSync(OLD_SKILL_ROOT)) fail(errors, `retired Git lifecycle skill still exists: ${relativePath(OLD_SKILL_ROOT)}`);

  requireContract(errors, paths.skill, [
    "name: desktop-manage-git-lifecycle", "start --project-root", "track-worktree --project-root",
    "publish --project-root", "[--also-remote <name>]...", "release --project-root",
    "push-release --project-root . --remote <name>", "feature-<summary>-<Asia/Shanghai YYYYMMDD>",
    "check-post-release --project-root . --action",
    "创建本地分支不要求配置远端", "普通 `git merge --no-edit`", "`pendingPublish` 中临时保存冻结目标与确认进度",
    "v2 的 `pendingRelease` 或 `pendingPublish` 非空时拒绝自动改释", "`releasedResources`", "`schemaVersion: 4`",
    "跨远端推送不是原子操作", "不重新解析默认分支、fetch、merge 或计算新 HEAD",
    "为兼容既有机器调用保留历史稳定 code `push-rejected`", "不创建标签，也不清理任何资源",
    "`v{version}-{YYYYMMDD}`", "全过程不列举、fetch、push、复读或删除远端 ref",
    "不打包，也不删除登记分支或 Worktree", "发布后的独立步骤", "Git common-dir",
    "不会写入项目受跟踪目录", "common-dir 短时互斥",
  ], "Git lifecycle contract");
  requireContract(errors, paths.metadata, ['display_name: "管理 Git 生命周期"', "$desktop-manage-git-lifecycle"], "Git lifecycle contract");
  requireContract(errors, paths.script, [
    'const COMMANDS = ["inspect", "start", "track-worktree", "publish", "release", "push-release", "check-post-release"]',
    "export function parseArguments(",
    'release: new Set(["projectRoot", "version", "date", "releaseContextSha256"])',
    '"push-release": new Set(["projectRoot", "remote"])',
    '"check-post-release": new Set(["projectRoot", "action"])',
    "if (args.version === undefined || args.releaseContextSha256 === undefined) invalidArguments();",
    'if (command === "push-release" && args.remote === undefined) invalidArguments();',
    'if (command === "check-post-release" && args.action === undefined) invalidArguments();', 'alsoRemote',
    "withLifecycleStateLock(repository, operation)", 'code: "interrupted"',
  ], "Git lifecycle contract");
  const core = requireContract(errors, paths.core, [
    "export const SCHEMA_VERSION = 4", 'export const STATE_DIRECTORY = "agent-first-harness"',
    'export const STATE_FILENAME = "git-lifecycle.json"', 'const LOCK_DIRECTORY = ".git-lifecycle.lock"',
    "export function runGit(", "bytes = false", "export function primaryRepository(",
    "export async function withLifecycleStateLock(", "export function resolveAdditionalRemoteTargets(",
    "export function mergeRegisteredBranches(", 'parsed.pendingPublish = null', "function migrateCompletedV2(",
    '"legacy-inflight-unsupported"', "function migrateV3(",
    'legacy.cycle?.pendingRelease !== null', '"Finish or repair the existing v3 Git operation',
    "postReleaseAction: null",
    "export function commandCheckPostRelease(", "releasedResources: []", "baseReference = `refs/heads/${released.defaultBranch}`",
    'createHash("sha256").update(contextBlob.stdout).digest("hex") !== last.releaseContextSha256',
    'branch === "@"', 'branch === "HEAD"', '["switch", "-c", defaultBranch, "--track"',
    '["merge", "--no-edit", `refs/heads/${branch}`]',
  ], "Git lifecycle contract");
  const publication = requireContract(errors, paths.publication, [
    'import { CONTEXT_RELATIVE_PATH as RELEASE_CONTEXT_PATH,',
    'const RELEASE_CONTEXT_HELPER = ".agents/skills/desktop-prepare-release/scripts/release_context.mjs"',
    "export async function releaseContextBinding(", "function verifyHeadReleaseContextBytes(",
    "function confirmPendingPublishTarget(", "function completePendingPublish(", "export function publish(",
    "function prepareLocalRelease(", "function ensureLocalReleaseTag(",
    "function freezePendingReleaseHead(", "function completePendingRelease(",
    "function localReleaseBranchTarget(", "function ensureLocalReleaseBranch(",
    "async function verifyHarnessVersionStamp(", "clock.readHarnessVersionStamp(repository.root, version)",
    "async function verifyFinalReleaseVersion(", 'gate.check(repository.root, "release")',
    "function reviewedReleaseMetadata(", "function verifyReviewedFinalHead(",
    'module.verifyReviewScope(repository.root, value)',
    'if (state.cycle === null && state.lastRelease !== null)', 'if (!validRemote(remote))',
    'const RELEASE_BRANCH = "release";', "function assertNoLocalReleaseCaseVariant(", "function remoteReleaseRefs(",
    "({ branch: confirmedBranch, tag: confirmedTag } = remoteReleaseRefs(repository, remote, last.tag))",
    "export async function commandRelease(", "export function commandPushRelease(", 'state.pendingPublish = { head, targets:',
    '["push", target.remote, `${head}:refs/heads/${target.branch}`]',
    '["push", remote, last.head + ":refs/heads/" + branch]',
    '["push", remote, "refs/tags/" + last.tag + ":refs/tags/" + last.tag]',
    '["update-ref", "refs/heads/release", head, expected]',
    "const postReleaseAction = harnessSource ? null : configuredPostReleaseAction(sourceRepository)",
    "if (last.postReleaseAction === null)", 'if (last.postReleaseAction !== "push_release_branch")',
  ], "Git lifecycle contract");
  requireContract(errors, paths.report, [
    "export function primaryFailureMessage", "export function additionalFailureMessage", "export function pendingFailure",
    "later confirmed additional targets remain recorded", '"push-failed": "push-rejected"',
    '"verification-failed": "remote-verification-failed"', '"local-state-changed": "local-state-changed"',
    '"state-write-failed": "state-write-failed"',
  ], "Git lifecycle contract");
  requireContract(errors, paths.support, [
    "export const SCRIPT", '"git_lifecycle.mjs"', "export function lifecycleFixture", "export function spawnHelper",
  ], "Git lifecycle contract");
  requireContract(errors, paths.tests, [
    "start_without_remote_is_idempotent_and_uses_common_dir_state", "branch_validation_rejects_ambiguous_pseudo_refs",
    "quiescent_v2_state_is_migrated_and_v1_is_rejected", "v2_inflight_release_or_publish_is_rejected_without_state_rewrite",
    "concurrent_task_starts_preserve_both_branches_and_worktrees",
    "publish_merges_switches_and_pushes_without_tag_or_cleanup", "publish_merges_current_remote_default_before_development_branches",
    "publish_pushes_same_head_to_additional_remote_without_rebinding", "publish_rejects_invalid_additional_remote_sets_before_pushing",
    "publish_refuses_missing_registered_branch",
    "quiescent_v3_release_actions_migrate_as_unbound_without_rewriting_state",
    "post_release_check_uses_frozen_action_and_verifies_local_release_refs",
  ], "Git lifecycle contract");
  requireContract(errors, paths.releaseTests, [
    "release_merges_locally_tags_and_preserves_registered_resources_without_remote", "first_release_without_registered_cycle_uses_local_default_branch",
    "harness_release_requires_managed_current_minute_stamp_before_merge_or_tag", "harness_release_accepts_managed_timestamp_stamp",
    "publish_after_release_requires_new_cycle_and_cannot_replace_push_release", "push_release_rechecks_release_branch_and_tag_together_after_tag_push",
    "push_release_rejects_option_like_remote_name",
    "release_succeeds_while_remote_is_offline", "release_from_task_worktree_keeps_worktree_and_local_branch",
    "new_cycle_from_old_task_worktree_starts_at_verified_release_head", "release_rejects_old_mode_flags_before_state_mutation",
    "release_tag_conflict_keeps_registered_resources_and_pending_head", "dirty_registered_worktree_blocks_release_then_clean_retry_succeeds",
    "push_release_is_separate_explicit_idempotent_operation", "tag_push_failure_reports_partial_success_and_retry_keeps_release_complete",
    "harness_release_rechecks_final_version_after_all_registered_merges",
    "downstream_release_rechecks_final_cargo_and_target_version_after_merges",
    "push_release_rechecks_local_tag_after_push_hook_changes_it",
    "push_release_rejects_frozen_local_package_choice_before_ref_change",
    "push_release_rejects_foreign_local_release_branch_before_remote_write",
    "push_release_advances_recorded_local_branch_after_checked_out_worktree_is_removed",
    "push_release_rejects_non_fast_forward_remote_release_branch",
    "push_release_after_new_cycle_preserves_current_checkout",
    "enabled_review_rejects_registered_branch_added_after_review",
    "enabled_review_releases_when_source_and_metadata_are_unchanged",
    "enabled_review_rejects_forged_scope_digest_before_release_state_changes",
    "enabled_review_rejects_source_added_after_review_even_if_premerged",
    "enabled_review_rejects_default_branch_changes_after_merge_before_tag",
  ], "Git lifecycle contract");
  requireContract(errors, paths.publicationTests, [
    "publish_primary_only_failure_persists_and_resumes_frozen_head", "single_target_pending_errors_preserve_stable_codes",
    "additional_drift_reports_later_confirmed_targets", "additional_remote_rejection_preserves_prefix_and_retry_succeeds",
  ], "Git lifecycle contract");
  requireContract(errors, paths.contextHelper, [
    'export const CONTEXT_RELATIVE_PATH = ".harness/release-context.json"', "export function validBranchName(",
    '["check-ref-format", "--branch", args.defaultBranch]',
    "value.schemaVersion !== 3", '"schemaVersion", "sourceHead", "version", "releaseDate"',
    "export function validateContext(", "export function canonicalBytes(", "export function verifyReviewScope(",
    'const expectedTag = `v${value.version}-${compactDate}`',
  ], "Git lifecycle contract");
  requireContract(errors, paths.contextTests, [
    "schema_v2_release_context_is_rejected_without_silent_migration", "write_uses_explicit_branch_without_accessing_remote",
    "local_default_branch_rejects_ambiguous_ref_syntax", "verify_requires_clean_main_and_local_tag",
  ], "Git lifecycle contract");
  requireContract(errors, paths.crossHelper, [
    'const CONTEXT_PATH = ".harness/release-context.json"',
    "releaseContextSha256: digest", "`refs/tags/${normalized.expectedTag}`",
  ], "Git lifecycle contract");
  requireContract(errors, paths.crossTests, [
    "capture_and_verify_accept_release_with_an_unchanged_default_branch", "missing_fetched_tag_is_rejected",
    "snapshot_change_is_rejected_at_second_gate", "missing_fetched_origin_release_branch_is_rejected",
  ], "Git lifecycle contract");
  requireContract(errors, paths.workflow, [
    "release_context_sha256:", "verify_release_context.mjs capture", "verify_release_context.mjs verify",
  ], "Git lifecycle contract");
  requireContract(errors, paths.agentPolicy, ["旧状态若含正在进行的双模式发布或推送，不能静默改写为新语义"], "Git lifecycle contract");
  requireContract(errors, paths.releaseDoc, ["合法且静止的 v2/v3 状态可安全迁移", "有未完成远端发布或推送的旧状态失败关闭"], "Git lifecycle contract");

  validateSyntax(errors, [
    paths.script, paths.core, paths.publication, paths.report, paths.support, paths.tests, paths.releaseTests,
    paths.publicationTests, paths.contextHelper, paths.contextTests, paths.crossHelper, paths.crossTests,
  ]);

  if (core && publication) {
    requireOrder(errors, functionSource(publication, "publish"), [
      "const state = loadState(repository)", "if (state.pendingPublish !== null)",
      "if (state.cycle === null && state.lastRelease !== null)",
      "resolveAdditionalRemoteTargets(", '["fetch", remote', "switchToDefault(",
      '["merge", "--no-edit", `refs/remotes/${remote}/${defaultBranch}`]', "mergeRegisteredBranches(",
      "state.pendingPublish =", "saveState(repository, state)", "completePendingPublish(",
    ], "main publish sequence");
    requireOrder(errors, functionSource(publication, "completePendingPublish"), [
      "confirmPendingPublishTarget(repository, state, index)", "verifyLocalPosition(repository, primary.branch, head)",
      "state.pendingPublish = null", "saveState(repository, state)",
    ], "publication journal completion sequence");
    requireOrder(errors, functionSource(core, "mergeRegisteredBranches"), [
      "const before = currentHead(repository)", '["merge", "--no-edit", `refs/heads/${branch}`]',
      "currentHead(repository) === before",
    ], "registered branch merge sequence");
    requireOrder(errors, functionSource(core, "commandCheckPostRelease"), [
      "const state = loadState(repository)", "const last = state.lastRelease",
      "if (last.postReleaseAction === null)", "if (last.postReleaseAction !== args.action)",
      "branchExists(repository, last.defaultBranch)", "localTagTarget(repository, last.tag)",
      'status: "post-release-action-confirmed"',
    ], "frozen local post-release action check sequence");
    const confirm = functionSource(publication, "confirmPendingPublishTarget");
    requireOrder(errors, confirm, [
      "remoteHead = remoteBranchOid(", '["push", target.remote', "remoteHead = remoteBranchOid(",
      "verifyLocalPosition(", "target.confirmed = true", "saveState(repository, state)",
    ], "frozen publication target sequence");
    if (confirm.split("remoteHead = remoteBranchOid(").length - 1 !== 2) {
      fail(errors, "frozen publication target must reread before and after push");
    }
    const release = functionSource(publication, "commandRelease");
    requireOrder(errors, release, [
      "const identity = releaseIdentity(", "requireClean(repository)", "await releaseContextBinding(",
      "await verifyHarnessVersionStamp(repository, identity.version)",
      "const state = loadState(repository)", "reviewedReleaseMetadata(repository, context, state)",
      "repository = primaryRepository(repository)",
    ], "caller-context-before-primary sequence");
    requireOrder(errors, release, [
      "defaultBranch = state.defaultBranch ?? context.defaultBranch",
      "const postReleaseAction = harnessSource ? null : configuredPostReleaseAction(sourceRepository)",
      "state.defaultBranch = defaultBranch",
    ], "local context default initialization sequence");
    requireOrder(errors, release, [
      "state.cycle.pendingRelease =", "postReleaseAction,", "saveState(repository, state)",
      "return completePendingRelease(repository, state, args, reviewed)",
    ], "context-bound pending-before-release sequence");
    requireOrder(errors, functionSource(publication, "releaseContextBinding"), [
      "raw = readFileSync(path)", "module.validateContext(value)", "module.canonicalBytes(value)",
      'createHash("sha256").update(canonical)', '["show", `HEAD:${RELEASE_CONTEXT_PATH}`]',
    ], "authoritative tracked release-context sequence");
    requireOrder(errors, functionSource(publication, "freezePendingReleaseHead"), [
      "prepareLocalRelease(", "verifyHeadReleaseContextBytes(", "verifyReviewedFinalHead(", "await verifyFinalReleaseVersion(",
      "pending.head = prepared.head", "saveState(repository, state)",
    ], "integrated-context-before-frozen-head sequence");
    requireOrder(errors, functionSource(publication, "completePendingRelease"), [
      "verifyReviewedFinalHead(", "await verifyFinalReleaseVersion(", "ensureLocalReleaseTag(",
      "verifyLocalPosition(", "state.releasedResources.push(",
      "state.lastRelease =", "state.cycle = null", "saveState(repository, state)",
    ], "local tag-before-release-record sequence");
    const releasePaths = ["releaseContextBinding", "prepareLocalRelease", "ensureLocalReleaseTag",
      "freezePendingReleaseHead", "completePendingRelease", "commandRelease"]
      .map((name) => functionSource(publication, name)).join("\n");
    for (const token of ["selectRemote(", "configuredRemotes(", "remoteDefaultBranch(", "remoteBranchOid(", "remoteTagTarget(",
      '["fetch"', '["push"', "cleanupWorktrees(", "cleanupRemoteBranches(", "cleanupLocalBranches("]) {
      if (releasePaths.includes(token)) fail(errors, `Git release path accesses remote operation or cleanup: ${token}`);
    }
    const postReleasePush = functionSource(publication, "commandPushRelease");
    requireOrder(errors, postReleasePush, [
      "const last = state.lastRelease", "if (last.postReleaseAction === null)",
      'if (last.postReleaseAction !== "push_release_branch")', "const branch = RELEASE_BRANCH",
      "const checkoutBranch = currentBranchOrNone(repository)",
      "const checkoutHead = currentHead(repository)", "localTagTarget(",
      "assertNoLocalReleaseCaseVariant(repository)", "remoteReleaseRefs(repository, remote, last.tag)",
      "ensureLocalReleaseBranch(repository, state, last.head)",
      '["push", remote, last.head + ":refs/heads/" + branch]',
      "remoteBranchOid(", '["push", remote, "refs/tags/" + last.tag + ":refs/tags/" + last.tag]',
      "remoteTagTarget(", "remoteReleaseRefs(repository, remote, last.tag)", "requireClean(repository)",
      "currentBranchOrNone(repository) !== checkoutBranch", "currentHead(repository) !== checkoutHead",
      "localTagTarget(repository, last.tag) !== last.head", "localReleaseBranchTarget(repository) !== last.head",
    ], "independent released-head-and-tag push sequence");
    const localReleaseBranch = functionSource(publication, "ensureLocalReleaseBranch");
    requireOrder(errors, localReleaseBranch, [
      "const previous = localReleaseBranchTarget(repository)",
      '["merge-base", "--is-ancestor", previous, head]',
      "state.releasedResources.some((released) => released.head === previous)",
      "worktreeRecords(repository).some((record) => record.branch === RELEASE_BRANCH)",
      '["update-ref", "refs/heads/release", head, expected]',
      "localReleaseBranchTarget(repository) !== head",
    ], "local release branch provenance and compare-and-swap sequence");
    if (postReleasePush.split("localTagTarget(repository, last.tag)").length - 1 !== 2) {
      fail(errors, "post-release push must check the frozen local tag before and after push");
    }
    if (postReleasePush.includes("remoteDefaultBranch(")) {
      fail(errors, "post-release push must target the release branch, not the remote default branch");
    }
    for (const token of ['["fetch"', '["merge"', "mergeRegisteredBranches(", "saveState(repository, state)"]) {
      if (postReleasePush.includes(token)) fail(errors, `post-release push changes local release or fetches/merges: ${token}`);
    }
    const firstStart = functionSource(core, "commandStart");
    requireOrder(errors, firstStart, [
      "if (cycle === null && state.lastRelease !== null)", "localTagTarget(repository, released.tag)",
      "baseReference = `refs/heads/${released.defaultBranch}`", '"switch", "-c", candidate',
    ], "new-cycle start from verified released HEAD sequence");
    for (const forbidden of ['"--ff-only"', '"--force-with-lease', '"--atomic"']) {
      if ((core + publication).includes(forbidden)) fail(errors, `branch gate remains in lifecycle implementation: ${forbidden}`);
    }
  }

  const trackedState = path.join(ROOT, ".harness", "git-lifecycle.json");
  if (fs.existsSync(trackedState)) fail(errors, "Git lifecycle state must live under git-common-dir, not tracked .harness");
  if (overrides.scanRetired !== false) validateNoRetiredRuntime(errors);
}
