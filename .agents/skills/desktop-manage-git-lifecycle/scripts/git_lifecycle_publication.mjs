/** Git 生命周期的多远端 publish、发布标签与精确清理。 */

import { createHash } from "node:crypto";
import { chdir, cwd as processCwd } from "node:process";
import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { pendingFailure } from "./git_publication_report.mjs";
import {
  HEX_OID_RE,
  LifecycleError,
  SHA256_RE,
  branchExists,
  canonicalPath,
  configuredRemotes,
  currentBranchOrNone,
  currentHead,
  loadState,
  localTagTarget,
  mergeRegisteredBranches,
  preflightCycleResources,
  primaryRepository,
  remoteBranchOid,
  remoteDefaultBranch,
  remoteTagTarget,
  requireClean,
  resolveAdditionalRemoteTargets,
  runGit,
  saveState,
  selectRemote,
  shanghaiDate,
  switchToDefault,
  validBranch,
  verifyLocalPosition,
  worktreeRecords,
} from "./git_lifecycle_core.mjs";

const RELEASE_CONTEXT_PATH = ".harness/release-context.json";
const RELEASE_CONTEXT_HELPER = ".agents/skills/desktop-prepare-release/scripts/release_context.mjs";

/** 验证已跟踪发布上下文及其固定调用身份。 */
export async function releaseContextBinding(repository, expectedSha256, identity, args) {
  if (!SHA256_RE.test(expectedSha256)) throw new LifecycleError("invalid-argument", "Release context SHA-256 is invalid.");
  const directory = join(repository.root, ".harness");
  const path = join(repository.root, RELEASE_CONTEXT_PATH);
  const helperPath = join(repository.root, RELEASE_CONTEXT_HELPER);
  try {
    const directoryMetadata = lstatSync(directory);
    const pathMetadata = lstatSync(path);
    const helperMetadata = lstatSync(helperPath);
    if (directoryMetadata.isSymbolicLink() || !directoryMetadata.isDirectory() ||
        pathMetadata.isSymbolicLink() || !pathMetadata.isFile() ||
        helperMetadata.isSymbolicLink() || !helperMetadata.isFile()) throw new Error("unsafe");
  } catch {
    throw new LifecycleError("release-context-invalid", "Tracked release context is unavailable or unsafe.");
  }
  let raw;
  let value;
  let canonical;
  try {
    const helperRaw = readFileSync(helperPath);
    const committedHelper = runGit(repository.root, ["show", `HEAD:${RELEASE_CONTEXT_HELPER}`], { check: false, bytes: true });
    const lfHelper = Buffer.from(helperRaw.toString("utf8").replaceAll("\r\n", "\n"), "utf8");
    if (committedHelper.returncode !== 0 ||
        (!committedHelper.stdout.equals(helperRaw) && !committedHelper.stdout.equals(lfHelper))) {
      throw new LifecycleError("release-context-invalid", "Release context validator is not tracked by current HEAD.");
    }
    if (statSync(path).size > 1_048_576) throw new LifecycleError("release-context-invalid", "Tracked release context is too large.");
    raw = readFileSync(path);
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
    const module = await import(`${pathToFileURL(helperPath).href}?binding=${Date.now()}-${Math.random()}`);
    if (typeof module.validateContext !== "function" || typeof module.canonicalBytes !== "function") {
      throw new LifecycleError("release-context-invalid", "Release context validator interface is invalid.");
    }
    value = module.validateContext(value);
    canonical = module.canonicalBytes(value);
  } catch (error) {
    if (error instanceof LifecycleError) throw error;
    throw new LifecycleError("release-context-invalid", "Tracked release context cannot be validated.");
  }
  const normalized = Buffer.from(new TextDecoder("utf-8", { fatal: true }).decode(raw).replaceAll("\r\n", "\n"), "utf8");
  if (!normalized.equals(canonical)) throw new LifecycleError("release-context-invalid", "Release context bytes are not canonical.");
  if (createHash("sha256").update(canonical).digest("hex") !== expectedSha256) {
    throw new LifecycleError("release-context-mismatch", "Release context SHA-256 does not match.");
  }
  const expectedDate = `${identity.date.slice(0, 4)}-${identity.date.slice(4, 6)}-${identity.date.slice(6)}`;
  if (value.version !== identity.version || value.releaseDate !== expectedDate || value.expectedTag !== identity.tag) {
    throw new LifecycleError("release-context-mismatch", "Release context identity does not match the release command.");
  }
  const requestedMode = args.localOnly ? "local" : "remote";
  const requestedRemote = args.localOnly ? null : args.remote;
  if (value.gitPublication !== requestedMode || value.remote !== requestedRemote) {
    throw new LifecycleError("release-context-mismatch", "Release context Git publication does not match the release command.");
  }
  if (typeof value.defaultBranch !== "string" || !validBranch(repository, value.defaultBranch)) {
    throw new LifecycleError("release-context-invalid", "Release context default branch is invalid.");
  }
  const committed = runGit(repository.root, ["show", `HEAD:${RELEASE_CONTEXT_PATH}`], { check: false, bytes: true });
  if (committed.returncode !== 0 || !committed.stdout.equals(canonical)) {
    throw new LifecycleError("release-context-mismatch", "Release context bytes are not tracked by current HEAD.");
  }
  return value;
}

/** 确认冻结 HEAD 携带同一发布上下文。 */
function verifyHeadReleaseContextBytes(repository, expectedSha256, head) {
  const committed = runGit(repository.root, ["show", `${head}:${RELEASE_CONTEXT_PATH}`], { check: false, bytes: true });
  if (committed.returncode !== 0 || createHash("sha256").update(committed.stdout).digest("hex") !== expectedSha256) {
    throw new LifecycleError("release-context-mismatch", "Integrated release HEAD does not contain the bound release context bytes.");
  }
}

/** 为 CLI 进程离开将被清理的 Worktree。 */
function relocateCliCwdBeforeReleaseCleanup(repository, state, args) {
  if (!args.cliInvocation || state.cycle === null || state.cycle.worktrees.length === 0) return;
  let current;
  try {
    current = canonicalPath(processCwd(), { strict: true });
  } catch {
    throw new LifecycleError("cwd-unavailable", "Current process directory is unavailable.");
  }
  for (const entry of state.cycle.worktrees) {
    const worktree = canonicalPath(entry.path, { strict: false });
    const relation = relative(worktree, current);
    const within = relation === "" || (!relation.startsWith(`..${sep}`) && relation !== ".." && !isAbsolute(relation));
    if (!within) continue;
    try {
      chdir(repository.root);
    } catch {
      throw new LifecycleError("cwd-relocation-failed", "Process directory could not be moved to the primary worktree.");
    }
    return;
  }
}

/** 把发布结果报告转换成生命周期错误。 */
function pendingPublicationError(pending, index, kind, detail, outcome) {
  const [code, message] = pendingFailure(pending, index, kind, detail, outcome);
  return new LifecycleError(code, message);
}

/** 复读或推送一个冻结目标，并立即保存确认进度。 */
function confirmPendingPublishTarget(repository, state, index) {
  const pending = state.pendingPublish;
  const target = pending.targets[index];
  const head = pending.head;
  const singleTarget = pending.targets.length === 1;
  let remoteHead;
  try {
    remoteHead = remoteBranchOid(repository, target.remote, target.branch);
  } catch (error) {
    if (singleTarget) throw error;
    throw pendingPublicationError(pending, index, "verification-failed", "could not be reread before publication resumed", "outcome is uncertain");
  }
  if (target.confirmed && remoteHead !== head) {
    throw pendingPublicationError(pending, index, "verification-failed", "no longer matches the frozen published HEAD", "previous confirmation has changed");
  }
  if (remoteHead !== head) {
    const transportError = pendingPublicationError(pending, index, "push-failed", "push transport could not be confirmed", "outcome is uncertain");
    const pushed = runGit(repository.root, ["push", target.remote, `${head}:refs/heads/${target.branch}`], {
      check: false,
      code: singleTarget ? "git-error" : transportError.code,
      message: singleTarget ? "Git operation failed." : transportError.publicMessage,
    });
    try {
      remoteHead = remoteBranchOid(repository, target.remote, target.branch);
    } catch (error) {
      if (singleTarget && pushed.returncode === 0) throw error;
      throw transportError;
    }
    if (remoteHead !== head) {
      if (pushed.returncode !== 0) throw transportError;
      throw pendingPublicationError(pending, index, "verification-failed", "did not reread the frozen published HEAD", "outcome is uncertain");
    }
  }
  try {
    verifyLocalPosition(repository, state.defaultBranch, head);
  } catch {
    throw pendingPublicationError(pending, index, "local-state-changed", "was confirmed published but local Git state verification failed", "is confirmed published");
  }
  if (target.confirmed) return;
  target.confirmed = true;
  try {
    saveState(repository, state);
  } catch {
    throw pendingPublicationError(pending, index, "state-write-failed", "was confirmed published but lifecycle state could not be saved", "is confirmed published");
  }
}

/** 沿用已落盘 HEAD 和目标完成 publish。 */
function completePendingPublish(repository, state, merged = [], alreadyMerged = []) {
  const pending = state.pendingPublish;
  const head = pending.head;
  const primary = pending.targets[0];
  verifyLocalPosition(repository, primary.branch, head);
  const configured = new Set(configuredRemotes(repository));
  if (pending.targets.some((target) => !configured.has(target.remote))) {
    throw new LifecycleError("remote-not-found", "A frozen publication remote is not configured.");
  }
  for (let index = 0; index < pending.targets.length; index += 1) confirmPendingPublishTarget(repository, state, index);
  const publishedRemotes = pending.targets.map(({ remote, branch }) => ({ remote, branch }));
  verifyLocalPosition(repository, primary.branch, head);
  state.pendingPublish = null;
  saveState(repository, state);
  return {
    status: "published", branch: primary.branch, head, remote: primary.remote,
    worktree: repository.root, merged, alreadyMerged, publishedRemotes, tagged: false, cleaned: false,
  };
}

/** 向主远端推送固定 HEAD 并复读。 */
function publishPrimaryRemote(repository, state, remote, defaultBranch, head) {
  const pushed = runGit(repository.root, ["push", remote, `${head}:refs/heads/${defaultBranch}`], { check: false });
  let remoteHead;
  try {
    remoteHead = remoteBranchOid(repository, remote, defaultBranch);
  } catch (error) {
    throw new LifecycleError(pushed.returncode !== 0 ? "push-failed" : "remote-verification-failed", "Git default branch push could not be confirmed.");
  }
  if (remoteHead !== head) {
    throw new LifecycleError(pushed.returncode !== 0 ? "push-failed" : "remote-verification-failed", "Git default branch push could not be confirmed.");
  }
  verifyLocalPosition(repository, defaultBranch, head);
  state.remote = remote;
  state.defaultBranch = defaultBranch;
  saveState(repository, state);
}

/** 合并并把同一 HEAD 非强制推送到全部目标。 */
export function publish(repository, explicitRemote, additionalRemotes = []) {
  requireClean(repository);
  const state = loadState(repository);
  if (state.pendingPublish !== null) {
    const primary = state.pendingPublish.targets[0];
    const frozenAdditional = state.pendingPublish.targets.slice(1).map((target) => target.remote);
    if ((explicitRemote !== undefined && explicitRemote !== null && explicitRemote !== primary.remote) ||
        JSON.stringify(additionalRemotes) !== JSON.stringify(frozenAdditional)) {
      throw new LifecycleError("publish-in-progress", "Publication retry arguments differ from the frozen targets.");
    }
    return completePendingPublish(repository, state);
  }
  if (state.cycle?.pendingRelease !== null && state.cycle !== null) {
    throw new LifecycleError("release-in-progress", "A release cleanup must finish before publication.");
  }
  const remote = selectRemote(repository, state, explicitRemote, { required: true });
  const defaultBranch = remoteDefaultBranch(repository, remote);
  const additionalTargets = resolveAdditionalRemoteTargets(repository, remote, additionalRemotes);
  preflightCycleResources(repository, state);
  runGit(repository.root, ["fetch", remote, `refs/heads/${defaultBranch}:refs/remotes/${remote}/${defaultBranch}`], {
    code: "remote-read-failed", message: "Git default branch could not be fetched.",
  });
  switchToDefault(repository, remote, defaultBranch);
  if (runGit(repository.root, ["merge", "--no-edit", `refs/remotes/${remote}/${defaultBranch}`], { check: false }).returncode !== 0) {
    throw new LifecycleError("merge-failed", "Git merge did not complete; inspect the worktree state.");
  }
  const [merged, alreadyMerged] = mergeRegisteredBranches(repository, state, defaultBranch);
  requireClean(repository);
  const head = currentHead(repository);
  const targets = [{ remote, branch: defaultBranch }, ...additionalTargets];
  state.remote = remote;
  state.defaultBranch = defaultBranch;
  state.pendingPublish = { head, targets: targets.map((target) => ({ ...target, confirmed: false })) };
  saveState(repository, state);
  return completePendingPublish(repository, state, merged, alreadyMerged);
}

/** publish 命令保持不创建标签、不清理的边界。 */
export function commandPublish(repository, args) {
  return publish(primaryRepository(repository), args.remote, args.alsoRemote);
}

/** 只在本地默认分支整合登记结果。 */
function prepareLocalRelease(repository, state) {
  requireClean(repository);
  const defaultBranch = state.defaultBranch;
  if (defaultBranch === null || !branchExists(repository, defaultBranch)) {
    throw new LifecycleError("local-default-unavailable", "Recorded local default branch is unavailable.");
  }
  preflightCycleResources(repository, state);
  if (currentBranchOrNone(repository) !== defaultBranch) {
    runGit(repository.root, ["switch", defaultBranch], { code: "switch-failed", message: "Git default branch could not be checked out." });
  }
  const [merged, alreadyMerged] = mergeRegisteredBranches(repository, state, defaultBranch);
  requireClean(repository);
  return { branch: defaultBranch, head: currentHead(repository), merged, alreadyMerged };
}

/** 获取并整合远端默认分支和登记分支，但不 push。 */
function prepareRemoteRelease(repository, state, remote, defaultBranch) {
  requireClean(repository);
  preflightCycleResources(repository, state);
  runGit(repository.root, ["fetch", remote, `refs/heads/${defaultBranch}:refs/remotes/${remote}/${defaultBranch}`], {
    code: "remote-read-failed", message: "Git default branch could not be fetched.",
  });
  switchToDefault(repository, remote, defaultBranch);
  if (runGit(repository.root, ["merge", "--no-edit", `refs/remotes/${remote}/${defaultBranch}`], { check: false }).returncode !== 0) {
    throw new LifecycleError("merge-failed", "Git merge did not complete; inspect the worktree state.");
  }
  const [merged, alreadyMerged] = mergeRegisteredBranches(repository, state, defaultBranch);
  requireClean(repository);
  return { branch: defaultBranch, head: currentHead(repository), merged, alreadyMerged };
}

/** 规范化发布版本和日期并形成标签。 */
export function releaseIdentity(repository, version, date) {
  if (!version || version !== version.trim() || version.toLowerCase().startsWith("v")) {
    throw new LifecycleError("invalid-version", "Version must be provided without a v prefix.");
  }
  if ([...version].some((character) => character.codePointAt(0) < 32) || version.length > 128) {
    throw new LifecycleError("invalid-version", "Version is invalid.");
  }
  const releaseDate = date ?? shanghaiDate();
  if (!/^\d{8}$/.test(releaseDate)) throw new LifecycleError("invalid-date", "Release date must be a valid YYYYMMDD value.");
  const parsed = new Date(`${releaseDate.slice(0, 4)}-${releaseDate.slice(4, 6)}-${releaseDate.slice(6)}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10).replaceAll("-", "") !== releaseDate) {
    throw new LifecycleError("invalid-date", "Release date must be a valid YYYYMMDD value.");
  }
  const tag = `v${version}-${releaseDate}`;
  if (runGit(repository.root, ["check-ref-format", `refs/tags/${tag}`], { check: false }).returncode !== 0) {
    throw new LifecycleError("invalid-version", "Version cannot form a valid Git tag.");
  }
  return { tag, date: releaseDate, version };
}

/** 拒绝已指向其他提交的同名本地或远端标签。 */
function verifyReleaseTagCompatibility(repository, remote, tag, head) {
  const remoteTarget = remoteTagTarget(repository, remote, tag);
  if (remoteTarget !== null && remoteTarget !== head) throw new LifecycleError("tag-conflict", "Remote tag already points to a different commit.");
  const localTarget = localTagTarget(repository, tag);
  if (localTarget !== null && localTarget !== head) throw new LifecycleError("tag-conflict", "Local tag already points to a different commit.");
}

/** 创建或复用固定本地标签。 */
function ensureLocalReleaseTag(repository, tag, head) {
  const target = localTagTarget(repository, tag);
  if (target !== null && target !== head) throw new LifecycleError("tag-conflict", "Local tag already points to a different commit.");
  if (target === null && runGit(repository.root, ["tag", tag, head], { check: false }).returncode !== 0) {
    throw new LifecycleError("tag-create-failed", "Release tag could not be created.");
  }
  if (localTagTarget(repository, tag) !== head) throw new LifecycleError("tag-verification-failed", "Local release tag did not match local HEAD.");
}

/** 创建、推送并复读远端发布标签。 */
function ensureReleaseTag(repository, remote, tag, head) {
  verifyReleaseTagCompatibility(repository, remote, tag, head);
  if (localTagTarget(repository, tag) === null && runGit(repository.root, ["tag", tag, head], { check: false }).returncode !== 0) {
    throw new LifecycleError("tag-create-failed", "Release tag could not be created.");
  }
  const pushed = runGit(repository.root, ["push", remote, `refs/tags/${tag}:refs/tags/${tag}`], { check: false });
  let remoteTarget;
  try {
    remoteTarget = remoteTagTarget(repository, remote, tag);
  } catch {
    throw new LifecycleError(pushed.returncode !== 0 ? "tag-push-failed" : "tag-verification-failed", "Git release tag push could not be confirmed.");
  }
  if (remoteTarget !== head) {
    throw new LifecycleError(pushed.returncode !== 0 ? "tag-push-failed" : "tag-verification-failed",
      pushed.returncode !== 0 ? "Git release tag push could not be confirmed." : "Git remote release tag did not match local HEAD.");
  }
}

/** 精确移除登记的非主 Worktree。 */
function cleanupWorktrees(repository, state) {
  const cleaned = [];
  const cycle = state.cycle;
  for (const entry of [...cycle.worktrees]) {
    const records = worktreeRecords(repository);
    const primary = canonicalPath(records[0].path, { strict: true });
    const registered = canonicalPath(entry.path, { strict: false });
    if (registered === primary) throw new LifecycleError("cleanup-safety", "Registered cleanup path is the primary Git worktree.");
    const found = records.find((record) => canonicalPath(record.path, { strict: false }) === registered);
    if (found) {
      if (found.branch !== entry.branch || found.detached === "true") throw new LifecycleError("ownership-conflict", "Registered worktree ownership changed.");
      if (entry.branch === state.defaultBranch) throw new LifecycleError("cleanup-safety", "Default branch worktree cannot be removed.");
      if (existsSync(registered)) requireClean(repository, registered);
      const command = existsSync(registered)
        ? ["worktree", "remove", "--", registered]
        : ["worktree", "remove", "--force", "--", registered];
      if (runGit(repository.root, command, { check: false }).returncode !== 0) {
        throw new LifecycleError("cleanup-failed", "Registered Git worktree could not be removed safely.");
      }
      if (worktreeRecords(repository).some((record) => canonicalPath(record.path, { strict: false }) === registered)) {
        throw new LifecycleError("cleanup-failed", "Registered Git worktree still exists after removal.");
      }
    }
    cycle.worktrees.splice(cycle.worktrees.indexOf(entry), 1);
    saveState(repository, state);
    cleaned.push(registered);
  }
  return cleaned;
}

/** 精确删除登记的远端分支并逐项保存。 */
function cleanupRemoteBranches(repository, state, remote) {
  const cleaned = [];
  for (const entry of state.cycle.branches) {
    if (entry.remoteDeleted) continue;
    const branch = entry.name;
    const liveDefault = remoteDefaultBranch(repository, remote);
    if (branch === state.defaultBranch || branch === liveDefault) throw new LifecycleError("cleanup-safety", "Default branch cannot be removed.");
    if (remoteBranchOid(repository, remote, branch) !== null) {
      if (runGit(repository.root, ["push", remote, `:refs/heads/${branch}`], { check: false }).returncode !== 0) {
        throw new LifecycleError("cleanup-failed", "Registered remote branch could not be removed.");
      }
      if (remoteBranchOid(repository, remote, branch) !== null) throw new LifecycleError("cleanup-failed", "Registered remote branch still exists after removal.");
    }
    entry.remoteDeleted = true;
    saveState(repository, state);
    cleaned.push(branch);
  }
  return cleaned;
}

/** 精确删除登记的本地分支并逐项保存。 */
function cleanupLocalBranches(repository, state) {
  const cleaned = [];
  for (const entry of state.cycle.branches) {
    if (entry.localDeleted) continue;
    const branch = entry.name;
    if (branch === state.defaultBranch) throw new LifecycleError("cleanup-safety", "Default branch cannot be removed.");
    if (branchExists(repository, branch)) {
      if (worktreeRecords(repository).some((item) => item.branch === branch)) throw new LifecycleError("cleanup-safety", "Registered branch is still checked out in a worktree.");
      if (runGit(repository.root, ["branch", "-D", "--", branch], { check: false }).returncode !== 0) {
        throw new LifecycleError("cleanup-failed", "Registered local branch could not be removed safely.");
      }
      if (branchExists(repository, branch)) throw new LifecycleError("cleanup-failed", "Registered local branch still exists after removal.");
    }
    entry.localDeleted = true;
    saveState(repository, state);
    cleaned.push(branch);
  }
  return cleaned;
}

/** 比较稳定发布身份。 */
function releaseRecordMatchesIdentity(record, identity) {
  return ["tag", "date", "version"].every((key) => record[key] === identity[key]);
}

/** 约束发布重试只能沿用固定模式、远端与上下文。 */
function requireMatchingReleaseMode(record, args) {
  const requestedMode = args.localOnly ? "local" : "remote";
  if (record.gitPublication !== requestedMode ||
      (requestedMode === "remote" && record.remote !== args.remote)) {
    throw new LifecycleError("release-mode-conflict", "Release retry mode differs from lifecycle state.");
  }
  if (record.releaseContextSha256 !== args.releaseContextSha256) {
    throw new LifecycleError("release-context-conflict", "Release context differs from lifecycle state.");
  }
  return requestedMode;
}

/** 完成整合并立即冻结最终 HEAD。 */
function freezePendingReleaseHead(repository, state, args) {
  const pending = state.cycle.pendingRelease;
  const mode = requireMatchingReleaseMode(pending, args);
  const prepared = mode === "local"
    ? prepareLocalRelease(repository, state)
    : prepareRemoteRelease(repository, state, pending.remote, state.defaultBranch);
  verifyHeadReleaseContextBytes(repository, pending.releaseContextSha256, prepared.head);
  pending.head = prepared.head;
  saveState(repository, state);
  return pending;
}

/** 按已落盘模式续跑标签与精确清理。 */
function completePendingRelease(repository, state, args) {
  let pending = state.cycle.pendingRelease;
  const mode = requireMatchingReleaseMode(pending, args);
  if (pending.head === null) pending = freezePendingReleaseHead(repository, state, args);
  const remote = pending.remote;
  const defaultBranch = state.defaultBranch;
  if (defaultBranch === null || !branchExists(repository, defaultBranch)) {
    throw new LifecycleError("local-state-changed", "Recorded Git default branch is unavailable.");
  }
  requireClean(repository);
  if (currentBranchOrNone(repository) !== defaultBranch) {
    runGit(repository.root, ["switch", defaultBranch], { code: "switch-failed", message: "Git default branch could not be checked out." });
  }
  const localHead = currentHead(repository);
  if (localHead !== pending.head) throw new LifecycleError("local-state-changed", "Git default branch changed after release publication.");
  if (mode === "remote") {
    if (selectRemote(repository, state, remote, { required: true }) !== remote) throw new LifecycleError("remote-conflict", "Requested Git remote differs from lifecycle state.");
    const liveDefault = remoteDefaultBranch(repository, remote);
    if (liveDefault !== defaultBranch) throw new LifecycleError("remote-default-changed", "Git remote default branch changed during release cleanup.");
    if (state.cycle.branches.some((entry) => entry.name === liveDefault && !entry.remoteDeleted)) {
      throw new LifecycleError("cleanup-safety", "Remote default branch is registered for cleanup.");
    }
    verifyReleaseTagCompatibility(repository, remote, pending.tag, pending.head);
    publishPrimaryRemote(repository, state, remote, defaultBranch, pending.head);
    ensureReleaseTag(repository, remote, pending.tag, pending.head);
  } else ensureLocalReleaseTag(repository, pending.tag, pending.head);
  const cleanedWorktrees = cleanupWorktrees(repository, state);
  const cleanedRemoteBranches = mode === "remote" ? cleanupRemoteBranches(repository, state, remote) : [];
  const cleanedLocalBranches = cleanupLocalBranches(repository, state);
  state.cycle = null;
  state.lastRelease = pending;
  saveState(repository, state);
  verifyLocalPosition(repository, defaultBranch, localHead);
  return {
    status: "released", branch: defaultBranch, head: pending.head, remote, gitPublication: mode,
    releaseContextSha256: pending.releaseContextSha256, worktree: repository.root, tag: pending.tag,
    cleanedWorktrees, cleanedRemoteBranches, cleanedLocalBranches,
  };
}

/** 按明确本地或远端模式发布固定 HEAD。 */
export async function commandRelease(repository, args) {
  const identity = releaseIdentity(repository, args.version, args.date);
  requireClean(repository);
  const context = await releaseContextBinding(repository, args.releaseContextSha256, identity, args);
  const state = loadState(repository);
  if (state.pendingPublish !== null) throw new LifecycleError("publish-in-progress", "A publication must finish before release.");
  repository = primaryRepository(repository);
  relocateCliCwdBeforeReleaseCleanup(repository, state, args);
  let cycle = state.cycle;
  if (cycle?.pendingRelease) {
    const pending = cycle.pendingRelease;
    if (!releaseRecordMatchesIdentity(pending, identity)) throw new LifecycleError("release-in-progress", "A different release cleanup is already in progress.");
    requireMatchingReleaseMode(pending, args);
    if (context.defaultBranch !== state.defaultBranch) throw new LifecycleError("release-context-mismatch", "Release context default branch differs from lifecycle state.");
    return completePendingRelease(repository, state, args);
  }
  const last = state.lastRelease;
  if (cycle === null && last !== null && releaseRecordMatchesIdentity(last, identity)) {
    const mode = requireMatchingReleaseMode(last, args);
    if (mode === "remote") ensureReleaseTag(repository, last.remote, last.tag, last.head);
    else ensureLocalReleaseTag(repository, last.tag, last.head);
    return {
      status: "already-released", branch: context.defaultBranch, head: last.head, remote: last.remote,
      gitPublication: mode, releaseContextSha256: last.releaseContextSha256,
      worktree: repository.root, tag: last.tag, cleanedWorktrees: [], cleanedRemoteBranches: [], cleanedLocalBranches: [],
    };
  }
  requireClean(repository);
  let remote;
  let defaultBranch;
  if (args.localOnly) {
    remote = null;
    defaultBranch = state.defaultBranch ?? context.defaultBranch;
    state.defaultBranch = defaultBranch;
    if (defaultBranch === null || !branchExists(repository, defaultBranch)) {
      throw new LifecycleError("local-default-unavailable", "Recorded local default branch is unavailable.");
    }
    if (context.defaultBranch !== defaultBranch) throw new LifecycleError("release-context-mismatch", "Release context default branch differs from lifecycle state.");
  } else {
    remote = selectRemote(repository, state, args.remote, { required: true });
    defaultBranch = remoteDefaultBranch(repository, remote);
    if (context.defaultBranch !== defaultBranch) throw new LifecycleError("release-context-mismatch", "Release context default branch differs from Git remote.");
    state.remote = remote;
    state.defaultBranch = defaultBranch;
  }
  preflightCycleResources(repository, state);
  if (cycle === null) {
    cycle = { branches: [], worktrees: [], pendingRelease: null };
    state.cycle = cycle;
  }
  cycle.pendingRelease = {
    ...identity,
    head: null,
    gitPublication: args.localOnly ? "local" : "remote",
    remote,
    releaseContextSha256: args.releaseContextSha256,
  };
  saveState(repository, state);
  return completePendingRelease(repository, state, args);
}
