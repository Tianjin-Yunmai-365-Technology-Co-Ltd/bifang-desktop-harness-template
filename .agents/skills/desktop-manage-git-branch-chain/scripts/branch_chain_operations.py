#!/usr/bin/env python3
"""实现 inspect、start、publish 与 release 的分支链状态机。"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
from pathlib import Path
import re
from typing import Any

from branch_chain_checks import (
    require_active_postcondition,
    require_branch_head_clean,
    require_state_postcondition,
)
from branch_chain_commit import commit_state, require_commit_prerequisites
from branch_chain_git import (
    GitError,
    OID_PATTERN,
    checked_out_branches,
    delete_local_branches,
    is_ancestor,
    local_oid,
    protected_branches,
    push_branch,
    remote_default,
    remote_oid,
    require_clean,
    require_closed_history,
    require_linear_segment,
    require_local_branch_heads,
    require_local_remote_head,
    require_release_not_default,
    resolve_repository,
    run_git,
    select_remote,
    status_records,
    switch_branch,
    update_local_branch,
    require_worktree_ownership,
)
from branch_chain_remote import push_release_transaction, remote_close_state
from branch_chain_state import (
    FEATURE_PATTERN,
    discover_closed_retry_state,
    read_state,
    state_path,
    validate_candidate_selections,
    validate_release_review,
    write_state,
)


SUMMARY_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
TASK_BRANCH_PATTERN = re.compile(r"^codex/task-[a-z0-9]+(?:-[a-z0-9]+)*$")
INTERNAL_WRITE_BRANCH_PREFIXES = ("codex/task-", "codex/unit-")
RELEASE_CHANGELOG_PATTERN = re.compile(
    r"^docs/changelog/(?:19|20)\d{6}_CHANGELOG\.md$"
)


def current_date() -> str:
    """返回 Asia/Shanghai 当前日的 YYYYMMDD。"""

    shanghai_timezone = timezone(timedelta(hours=8))
    return datetime.now(shanghai_timezone).strftime("%Y%m%d")


def feature_branch_name(summary: str) -> str:
    """从已归一化 ASCII kebab 摘要构造固定 feature 分支名。"""

    if not SUMMARY_PATTERN.fullmatch(summary):
        raise GitError("summary must be lowercase ASCII kebab-case")
    name = f"feature-{summary}-{current_date()}"
    if not FEATURE_PATTERN.fullmatch(name):
        raise GitError("generated feature branch name is invalid")
    return name


def resolve_context(
    project_root: str,
    requested_remote: str | None,
) -> tuple[Path, str, str, str, str, str]:
    """解析仓库、当前分支、remote 和动态默认分支快照。"""

    root, branch, head = resolve_repository(project_root)
    remote = select_remote(root, requested_remote)
    default_branch, default_head = remote_default(root, remote)
    require_release_not_default(default_branch)
    return root, branch, head, remote, default_branch, default_head


def require_remote_matches(state_remote: str, selected_remote: str) -> None:
    """阻止活动或关闭链在中途切换 remote。"""

    if state_remote != selected_remote:
        raise GitError("selected remote does not match the branch-chain state")


def require_default_matches(
    state: dict[str, Any], default_branch: str, default_head: str
) -> None:
    """要求活动链冻结的实时远端默认分支名称与 OID 均未改变。"""

    if (
        state["defaultBranch"] != default_branch
        or state["defaultHead"] != default_head
    ):
        raise GitError("remote default branch changed since the branch chain started")


def verify_default_unchanged(
    root: Path,
    remote: str,
    expected_branch: str,
    expected_head: str,
) -> None:
    """复读远端默认分支并证明其名称和 OID 均未改变。"""

    branch, head = remote_default(root, remote)
    if branch != expected_branch or head != expected_head:
        raise GitError("remote default branch changed during the operation")


def inspect_chain(project_root: str, requested_remote: str | None) -> dict[str, Any]:
    """只读报告当前仓库、远端默认分支与分支链状态。"""

    root, branch, head, remote, default_branch, default_head = resolve_context(
        project_root, requested_remote
    )
    state_exists = state_path(root).is_file() and not state_path(root).is_symlink()
    state = read_state(root, allow_missing=True)
    return {
        "status": "inspected",
        "projectRoot": str(root),
        "branch": branch,
        "head": head,
        "clean": not status_records(root),
        "remote": remote,
        "remoteDefaultBranch": default_branch,
        "remoteDefaultHead": default_head,
        "stateFile": "present" if state_exists else "missing",
        "state": state,
    }


def start_chain(
    project_root: str,
    requested_remote: str | None,
    summary: str,
) -> dict[str, Any]:
    """从 Release、首发默认分支或已推送 active leaf 开始下一分支。"""

    root, branch, head, remote, default_branch, default_head = resolve_context(
        project_root, requested_remote
    )
    require_clean(root)
    state = read_state(root, allow_missing=True)
    active = state["activeChain"]
    if active is None:
        release_remote = remote_oid(root, remote, "Release")
        if release_remote is None:
            if state["lastClosedChain"] is not None:
                raise GitError("remote Release may be absent only before the first release")
            if branch != default_branch or head != default_head:
                raise GitError("the first chain without Release must start at remote default HEAD")
            local_release = local_oid(root, "Release", missing_ok=True)
            if local_release not in (None, default_head):
                raise GitError("local Release conflicts with the initial default-branch base")
            base_branch = default_branch
        else:
            if branch != "Release" or head != release_remote:
                raise GitError("a new chain must start from the fully pushed Release branch")
            base_branch = "Release"
        base_head = head
        parent_name = base_branch
        parent_head = head
        entries: list[dict[str, str]] = []
    else:
        require_remote_matches(active["remote"], remote)
        require_default_matches(active, default_branch, default_head)
        leaf = active["activeLeaf"]
        if branch != leaf:
            raise GitError("start is allowed only from the active leaf")
        if local_oid(root, leaf) != head or remote_oid(root, remote, leaf) != head:
            raise GitError("active parent branch must be fully pushed before start")
        base_head = active["baseHead"]
        base_branch = active["baseBranch"]
        parent_name = leaf
        parent_head = head
        entries = list(active["entries"])

    new_branch = feature_branch_name(summary)
    if new_branch in protected_branches(default_branch):
        raise GitError("generated branch is protected as a default branch")
    if local_oid(root, new_branch, missing_ok=True) is not None:
        raise GitError("generated feature branch already exists locally")
    if remote_oid(root, remote, new_branch) is not None:
        raise GitError("generated feature branch already exists remotely")

    switch_branch(root, new_branch, create=True)
    require_branch_head_clean(root, new_branch, parent_head)
    entries.append(
        {"branch": new_branch, "parent": parent_name, "parentHead": parent_head}
    )
    state["activeChain"] = {
        "remote": remote,
        "defaultBranch": default_branch,
        "defaultHead": default_head,
        "baseBranch": base_branch,
        "baseHead": base_head,
        "activeLeaf": new_branch,
        "phase": "active",
        "entries": entries,
    }
    require_commit_prerequisites(root)
    expected_payload = write_state(root, state)
    new_head = commit_state(
        root, f"chore(git): start {new_branch}", new_branch, parent_head, expected_payload
    )
    require_linear_segment(root, parent_head, new_head)
    require_local_remote_head(root, remote, parent_name, parent_head)
    push_branch(root, remote, new_branch, new_head)
    if local_oid(root, new_branch) != new_head:
        raise GitError("local feature branch changed during push")
    require_local_remote_head(root, remote, parent_name, parent_head)
    verify_default_unchanged(root, remote, default_branch, default_head)
    require_active_postcondition(root, new_branch, new_head, state)
    return {
        "status": "started",
        "branch": new_branch,
        "head": new_head,
        "parent": parent_name,
        "parentHead": parent_head,
        "remote": remote,
    }


def require_task_branch_name(task_branch: str) -> None:
    """要求待整合 ref 是由独立 ASCII task-slug 构成的临时 Task 分支。"""

    if not TASK_BRANCH_PATTERN.fullmatch(task_branch):
        raise GitError("task branch must match codex/task-<ascii-kebab-task-slug>")


def resolve_task_worktree(
    coordinator_root: Path,
    task_worktree: str,
    task_branch: str,
    task_head: str,
) -> Path:
    """证明参数精确指向同仓库中 clean、具名且冻结 HEAD 的 Task Worktree。"""

    if not Path(task_worktree).expanduser().is_absolute():
        raise GitError("task worktree path must be absolute")
    task_root, actual_branch, actual_head = resolve_repository(task_worktree)
    if task_root == coordinator_root:
        raise GitError("task worktree must be distinct from the active-leaf worktree")
    if actual_branch != task_branch or actual_head != task_head:
        raise GitError("task worktree branch or HEAD does not match the frozen task commit")
    require_clean(task_root)
    return task_root


def require_integration_worktrees_safe(
    root: Path,
    task_root: Path,
    leaf: str,
    feature_branches: list[str],
    task_branch: str,
) -> dict[str, list[str]]:
    """只允许协调 Worktree、目标 Task Worktree 与不占分支的只读 Worktree。"""

    occupied = checked_out_branches(root)
    for feature in feature_branches:
        require_worktree_ownership(
            occupied, feature, root, feature == leaf
        )
    task_paths = occupied.get(task_branch, [])
    try:
        task_is_exact = (
            len(task_paths) == 1
            and Path(task_paths[0]).resolve(strict=True) == task_root
        )
    except OSError:
        task_is_exact = False
    if not task_is_exact:
        raise GitError("task branch must be checked out only by the declared task worktree")
    for branch in occupied:
        if branch == task_branch:
            continue
        if branch.startswith(INTERNAL_WRITE_BRANCH_PREFIXES):
            raise GitError("another Task or unit Worktree is active during task integration")
    return occupied


def require_task_state_unchanged(
    root: Path,
    task_root: Path,
    leaf_head: str,
    task_head: str,
    expected_state: dict[str, Any],
) -> None:
    """禁止任一 Task 提交触碰受保护状态，即使后续提交恢复了原字节。"""

    commits = run_git(
        root, ["rev-list", "--reverse", f"{leaf_head}..{task_head}"]
    ).stdout.splitlines()
    if not commits:
        raise GitError("cannot verify a non-empty task commit range")
    for commit in commits:
        if not OID_PATTERN.fullmatch(commit):
            raise GitError("cannot verify the protected branch-chain state across task commits")
        changed = run_git(
            root,
            [
                "diff-tree",
                "--no-commit-id",
                "--name-only",
                "-r",
                "--root",
                "--no-renames",
                commit,
                "--",
                ".harness/git-branch-chain.json",
            ],
            check=False,
        )
        if changed.returncode != 0:
            raise GitError(
                "cannot verify the protected branch-chain state across task commits"
            )
        if changed.stdout.strip():
            raise GitError("task commits must not change .harness/git-branch-chain.json")
    if read_state(task_root) != expected_state:
        raise GitError("task worktree branch-chain state does not match the active leaf")


def integrate_task(
    project_root: str,
    requested_remote: str | None,
    task_branch: str,
    task_worktree: str,
    task_head: str,
) -> dict[str, Any]:
    """把已冻结的 clean Task 提交本地快进到 active leaf，绝不自动推送。"""

    require_task_branch_name(task_branch)
    if not OID_PATTERN.fullmatch(task_head):
        raise GitError("task head must be a 40-character lowercase Git OID")
    root, branch, head, remote, default_branch, default_head = resolve_context(
        project_root, requested_remote
    )
    require_clean(root)
    state = read_state(root)
    active = state["activeChain"]
    if active is None:
        raise GitError("there is no active feature branch chain")
    require_remote_matches(active["remote"], remote)
    require_default_matches(active, default_branch, default_head)
    leaf = active["activeLeaf"]
    if branch != leaf or head != local_oid(root, leaf):
        raise GitError("integrate-task is allowed only from the active leaf worktree")
    if leaf in protected_branches(default_branch):
        raise GitError("active leaf unexpectedly resolves to a protected branch")

    resolved = validate_active_repository(root, remote, active)
    leaf_head = resolved[-1][1]
    if head != leaf_head:
        raise GitError("active leaf must equal its fully pushed remote OID before integration")
    if local_oid(root, task_branch, missing_ok=True) != task_head:
        raise GitError("local task branch does not match the frozen task commit")
    if remote_oid(root, remote, task_branch) is not None:
        raise GitError("temporary task branch must not exist on the remote")
    task_root = resolve_task_worktree(root, task_worktree, task_branch, task_head)
    feature_branches = [name for name, _ in resolved]
    occupied = require_integration_worktrees_safe(
        root, task_root, leaf, feature_branches, task_branch
    )
    require_linear_segment(root, leaf_head, task_head)
    require_task_state_unchanged(root, task_root, leaf_head, task_head, state)

    merged = run_git(root, ["merge", "--ff-only", task_head], check=False)
    if merged.returncode != 0:
        raise GitError("task integration fast-forward failed")

    require_linear_segment(root, leaf_head, task_head)
    require_active_postcondition(root, leaf, task_head, state)
    if local_oid(root, task_branch, missing_ok=True) != task_head:
        raise GitError("task branch changed during integration")
    _, current_task_branch, current_task_head = resolve_repository(str(task_root))
    if current_task_branch != task_branch or current_task_head != task_head:
        raise GitError("task worktree changed during integration")
    require_clean(task_root)
    if checked_out_branches(root) != occupied:
        raise GitError("Worktree occupancy changed during task integration")
    require_task_state_unchanged(root, task_root, leaf_head, task_head, state)
    for feature, expected_head in resolved[:-1]:
        if (
            local_oid(root, feature, missing_ok=True) != expected_head
            or remote_oid(root, remote, feature) != expected_head
        ):
            raise GitError("a frozen feature branch changed during task integration")
    if remote_oid(root, remote, leaf) != leaf_head:
        raise GitError("remote active leaf changed during task integration")
    if remote_oid(root, remote, task_branch) is not None:
        raise GitError("temporary task branch appeared on the remote during integration")
    verify_default_unchanged(root, remote, default_branch, default_head)
    return {
        "status": "task-integrated",
        "branch": leaf,
        "previousHead": leaf_head,
        "head": task_head,
        "taskBranch": task_branch,
        "taskHead": task_head,
        "remote": remote,
        "remoteHead": leaf_head,
        "published": False,
        "nextCommand": "publish",
    }


def publish_leaf(project_root: str, requested_remote: str | None) -> dict[str, Any]:
    """只以普通快进语义推送当前 active leaf 并复读精确 OID。"""

    root, branch, head, remote, default_branch, default_head = resolve_context(
        project_root, requested_remote
    )
    require_clean(root)
    state = read_state(root)
    active = state["activeChain"]
    if active is None:
        raise GitError("there is no active feature branch chain")
    require_remote_matches(active["remote"], remote)
    require_default_matches(active, default_branch, default_head)
    leaf = active["activeLeaf"]
    if branch != leaf or head != local_oid(root, leaf):
        raise GitError("publish is allowed only from the active leaf")
    if branch in protected_branches(default_branch):
        raise GitError("active leaf unexpectedly resolves to a protected branch")
    current_remote = remote_oid(root, remote, leaf)
    if current_remote == head:
        verify_default_unchanged(root, remote, default_branch, default_head)
        require_active_postcondition(root, leaf, head, state)
        return {"status": "already-published", "branch": leaf, "head": head, "remote": remote}
    if current_remote is not None:
        if is_ancestor(root, head, current_remote):
            raise GitError("remote active leaf is ahead of the local branch")
        if not is_ancestor(root, current_remote, head):
            raise GitError("remote active leaf has diverged")
    push_branch(root, remote, leaf, head)
    if local_oid(root, leaf) != head:
        raise GitError("local active leaf changed during push")
    verify_default_unchanged(root, remote, default_branch, default_head)
    require_active_postcondition(root, leaf, head, state)
    return {"status": "published", "branch": leaf, "head": head, "remote": remote}


def validate_active_repository(
    root: Path,
    remote: str,
    active: dict[str, Any],
) -> list[tuple[str, str]]:
    """证明活动链的冻结父头、线性历史及全部本地/远端 OID。"""

    previous_name = active["baseBranch"]
    previous_head = active["baseHead"]
    resolved: list[tuple[str, str]] = []
    if local_oid(root, previous_name, missing_ok=True) != previous_head:
        raise GitError("local base branch no longer equals the frozen chain base")
    for entry in active["entries"]:
        if entry["parent"] != previous_name or entry["parentHead"] != previous_head:
            raise GitError("feature branch chain does not match its frozen parent heads")
        branch = entry["branch"]
        head = local_oid(root, branch)
        require_linear_segment(root, previous_head, head)
        if remote_oid(root, remote, branch) != head:
            raise GitError("every feature branch must be fully pushed before release")
        resolved.append((branch, head))
        previous_name = branch
        previous_head = head
    return resolved


def require_release_worktrees_safe(
    root: Path,
    current_branch: str,
    leaf: str,
    branches: list[str],
) -> None:
    """在远端删除前拒绝其他 Worktree 对 Release 或 feature refs 的占用。"""

    occupied = checked_out_branches(root)
    require_worktree_ownership(occupied, "Release", root, current_branch == "Release")
    for branch in branches:
        require_worktree_ownership(
            occupied, branch, root, current_branch == leaf and branch == leaf
        )


def release_review_scope_digest(root: Path, base_head: str, source_head: str) -> str:
    """对固定树差异表示计算与本机 diff 配置无关的 SHA-256。"""

    difference = run_git(
        root,
        [
            "diff-tree",
            "--no-commit-id",
            "--raw",
            "-z",
            "-r",
            "--no-renames",
            "--full-index",
            base_head,
            source_head,
        ],
        text=False,
    ).stdout
    payload = (
        b"agent-first-release-review-scope-v1\0"
        + base_head.encode("ascii")
        + b"\0"
        + source_head.encode("ascii")
        + b"\0"
        + difference
    )
    return hashlib.sha256(payload).hexdigest()


def release_post_review_paths(
    root: Path, source_head: str, pre_close_head: str
) -> list[str]:
    """逐提交列出审查终点之后、关闭提交之前的全部路径变化。"""

    commits = run_git(
        root, ["rev-list", "--reverse", f"{source_head}..{pre_close_head}"]
    ).stdout.splitlines()
    paths: list[str] = []
    for commit in commits:
        if not OID_PATTERN.fullmatch(commit):
            raise GitError("cannot verify post-review commit paths")
        changed = run_git(
            root,
            [
                "diff-tree",
                "--no-commit-id",
                "--name-only",
                "-z",
                "-r",
                "--root",
                "--no-renames",
                commit,
            ],
            text=False,
        ).stdout
        paths.extend(
            item.decode("utf-8", "surrogateescape")
            for item in changed.split(b"\0")
            if item
        )
    return paths


def require_allowed_post_review_paths(paths: list[str]) -> None:
    """审查后只允许确定性发布日志与当日 Changelog 路径。"""

    for path in paths:
        if path == "release-notes.json" or RELEASE_CHANGELOG_PATTERN.fullmatch(path):
            continue
        raise GitError(
            "post-review commits may change only release-notes.json and dated Changelog files"
        )


def build_release_review(
    root: Path,
    active: dict[str, Any],
    pre_close_head: str,
    selection: str | None,
    status: str | None,
    source_head: str | None,
    reviewed_source_commit: str | None,
    checks: list[str] | None,
    evidence_summary: str | None,
    reason: str | None,
    remaining_risk: str | None,
) -> dict[str, Any]:
    """机械验证并构造随关闭提交原子封存的审查信封。"""

    if selection not in {"enabled", "disabled"}:
        raise GitError("an active release requires --review-selection enabled or disabled")
    if source_head is None or not OID_PATTERN.fullmatch(source_head):
        raise GitError("an active release requires a 40-character --review-source-head")
    if not is_ancestor(root, active["baseHead"], source_head) or not is_ancestor(
        root, source_head, pre_close_head
    ):
        raise GitError("review source head must lie on the frozen release chain")
    require_allowed_post_review_paths(
        release_post_review_paths(root, source_head, pre_close_head)
    )
    normalized_checks = [] if checks is None else checks
    return validate_release_review(
        {
            "selection": selection,
            "status": status,
            "scopeBase": active["baseHead"],
            "sourceHead": source_head,
            "scopeDiffSha256": release_review_scope_digest(
                root, active["baseHead"], source_head
            ),
            "reviewedSourceCommit": reviewed_source_commit,
            "checks": normalized_checks,
            "evidenceSummary": evidence_summary,
            "reason": reason,
            "remainingRisk": remaining_risk,
        }
    )


def build_candidate_selections(
    performance_selection: str | None,
    performance_source: str | None,
    performance_reason: str | None,
    performance_remaining_risk: str | None,
    macos_signing_selection: str | None,
    macos_signing_source: str | None,
    macos_signing_reason: str | None,
    macos_signing_remaining_risk: str | None,
) -> dict[str, Any]:
    """机械校验 prepare-release 显式提交的候选选择，不做产品推断。"""

    return validate_candidate_selections(
        {
            "performanceSelection": performance_selection,
            "performanceSource": performance_source,
            "performanceReason": performance_reason,
            "performanceRemainingRisk": performance_remaining_risk,
            "macosSigningSelection": macos_signing_selection,
            "macosSigningSource": macos_signing_source,
            "macosSigningReason": macos_signing_reason,
            "macosSigningRemainingRisk": macos_signing_remaining_risk,
        }
    )


def require_retry_review_arguments_match(
    closed: dict[str, Any],
    selection: str | None,
    status: str | None,
    source_head: str | None,
    reviewed_source_commit: str | None,
    checks: list[str] | None,
    evidence_summary: str | None,
    reason: str | None,
    remaining_risk: str | None,
    performance_selection: str | None,
    performance_source: str | None,
    performance_reason: str | None,
    performance_remaining_risk: str | None,
    macos_signing_selection: str | None,
    macos_signing_source: str | None,
    macos_signing_reason: str | None,
    macos_signing_remaining_risk: str | None,
) -> None:
    """重试可省略参数；若重复提供，则必须逐字段等于已封存信封。"""

    supplied = any(
        value is not None
        for value in (
            selection,
            status,
            source_head,
            reviewed_source_commit,
            checks,
            evidence_summary,
            reason,
            remaining_risk,
            performance_selection,
            performance_source,
            performance_reason,
            performance_remaining_risk,
            macos_signing_selection,
            macos_signing_source,
            macos_signing_reason,
            macos_signing_remaining_risk,
        )
    )
    if not supplied:
        return
    review = closed.get("releaseReview")
    if review is None:
        raise GitError("review arguments cannot be attached to a legacy closing commit")
    if (
        selection != review["selection"]
        or status != review["status"]
        or source_head != review["sourceHead"]
        or reviewed_source_commit != review["reviewedSourceCommit"]
        or ([] if checks is None else checks) != review["checks"]
        or evidence_summary != review["evidenceSummary"]
    ):
        raise GitError("retry review arguments do not match the sealed release review")
    expected_reason = review["reason"] if selection == "disabled" else None
    expected_risk = review["remainingRisk"] if selection == "disabled" else None
    if reason != expected_reason or remaining_risk != expected_risk:
        raise GitError("retry review arguments do not match the sealed release review")
    selections = closed.get("candidateSelections")
    if selections is None:
        raise GitError("candidate selection arguments cannot be attached to a legacy close")
    supplied_selections = {
        "performanceSelection": performance_selection,
        "performanceSource": performance_source,
        "performanceReason": performance_reason,
        "performanceRemainingRisk": performance_remaining_risk,
        "macosSigningSelection": macos_signing_selection,
        "macosSigningSource": macos_signing_source,
        "macosSigningReason": macos_signing_reason,
        "macosSigningRemainingRisk": macos_signing_remaining_risk,
    }
    if supplied_selections != selections:
        raise GitError("retry candidate selections do not match the sealed release state")


def require_release_review_repository(
    root: Path, closed: dict[str, Any]
) -> None:
    """复核封存信封仍绑定关闭历史、允许路径与同一树差异摘要。"""

    review = closed.get("releaseReview")
    if review is None:
        return
    pre_close_head = closed["entries"][-1]["preCloseHead"]
    if (
        review["scopeBase"] != closed["baseHead"]
        or not is_ancestor(root, closed["baseHead"], review["sourceHead"])
        or not is_ancestor(root, review["sourceHead"], pre_close_head)
    ):
        raise GitError("sealed release review does not match the closed branch chain")
    require_allowed_post_review_paths(
        release_post_review_paths(root, review["sourceHead"], pre_close_head)
    )
    expected_digest = release_review_scope_digest(
        root, closed["baseHead"], review["sourceHead"]
    )
    if review["scopeDiffSha256"] != expected_digest:
        raise GitError("sealed release review scope digest does not match repository history")


def verify_release_review(
    project_root: str, requested_remote: str | None
) -> dict[str, Any]:
    """只读证明当前 Release HEAD 正是含有效审查信封的已完成关闭提交。"""

    root, branch, head, remote, default_branch, default_head = resolve_context(
        project_root, requested_remote
    )
    require_clean(root)
    if branch != "Release" or local_oid(root, "Release") != head:
        raise GitError("release review verification requires the current Release branch")
    state = read_state(root)
    if state["activeChain"] is not None or state["lastClosedChain"] is None:
        raise GitError("release review verification requires one closed branch chain")
    closed = state["lastClosedChain"]
    review = closed.get("releaseReview")
    if review is None:
        raise GitError("current closing commit has no releaseReview")
    require_remote_matches(closed["remote"], remote)
    if (
        closed["defaultBranch"] != default_branch
        or closed["defaultHead"] != default_head
    ):
        raise GitError("remote default branch changed since the release transaction began")
    pre_close_heads = [entry["preCloseHead"] for entry in closed["entries"]]
    require_closed_history(root, closed["baseHead"], pre_close_heads, head)
    require_release_review_repository(root, closed)
    if remote_close_state(root, remote, head, closed) != "complete":
        raise GitError("release review verification requires a completed remote transaction")
    for entry in closed["entries"]:
        if local_oid(root, entry["branch"], missing_ok=True) is not None:
            raise GitError("release review verification requires completed local cleanup")
    require_state_postcondition(root, "Release", head, state)
    return {
        "status": "release-review-verified",
        "releaseHead": head,
        "remote": remote,
        "releaseReview": review,
        "candidateSelections": closed["candidateSelections"],
    }


def finish_local_cleanup(
    root: Path,
    branch: str,
    closing_head: str,
    closed: dict[str, Any],
) -> None:
    """切换并仅快进本地 Release，再以精确 OID 删除本地整链。"""

    leaf = closed["entries"][-1]["branch"]
    branches = [entry["branch"] for entry in closed["entries"]]
    occupied = checked_out_branches(root)
    require_worktree_ownership(occupied, "Release", root, branch == "Release")
    for feature in branches:
        require_worktree_ownership(occupied, feature, root, feature == leaf and branch == leaf)
    release_head = local_oid(root, "Release", missing_ok=True)
    if release_head not in (None, closed["baseHead"], closing_head):
        raise GitError("local Release changed before cleanup")
    if release_head != closing_head:
        if branch == "Release":
            if release_head is None:
                raise GitError("checked-out Release has no local ref")
            result = run_git(root, ["merge", "--ff-only", closing_head], check=False)
            if result.returncode != 0:
                raise GitError("local Release fast-forward failed")
        else:
            update_local_branch(root, "Release", closing_head, release_head)
    if branch != "Release":
        if branch != leaf:
            raise GitError("release retry must run from Release or the closing leaf")
        switch_branch(root, "Release")
    if local_oid(root, "Release") != closing_head:
        raise GitError("local Release did not reach the closing commit")
    require_clean(root)
    expected = [
        (
            entry["branch"],
            closing_head if index == len(closed["entries"]) - 1 else entry["preCloseHead"],
        )
        for index, entry in enumerate(closed["entries"])
    ]
    delete_local_branches(root, expected)
    for feature, _ in expected:
        if local_oid(root, feature, missing_ok=True) is not None:
            raise GitError(f"local feature branch remains after cleanup: {feature}")
    expected_state = {
        "schemaVersion": 1,
        "activeChain": None,
        "lastClosedChain": closed,
    }
    require_state_postcondition(root, "Release", closing_head, expected_state)


def release_chain(
    project_root: str,
    requested_remote: str | None,
    review_selection: str | None,
    review_status: str | None,
    review_source_head: str | None,
    reviewed_source_commit: str | None,
    review_checks: list[str] | None,
    review_evidence_summary: str | None,
    review_reason: str | None,
    review_remaining_risk: str | None,
    performance_selection: str | None,
    performance_source: str | None,
    performance_reason: str | None,
    performance_remaining_risk: str | None,
    macos_signing_selection: str | None,
    macos_signing_source: str | None,
    macos_signing_reason: str | None,
    macos_signing_remaining_risk: str | None,
) -> dict[str, Any]:
    """关闭活动链、原子更新远端 Release，并幂等完成本地清理。"""

    root, branch, head, remote, default_branch, default_head = resolve_context(
        project_root, requested_remote
    )
    require_clean(root)
    state = read_state(root, allow_missing=branch == "Release")
    if branch == "Release":
        recovered = discover_closed_retry_state(root)
        if recovered is not None:
            state = recovered
    active = state["activeChain"]
    closed = state["lastClosedChain"]

    if active is not None:
        require_remote_matches(active["remote"], remote)
        require_default_matches(active, default_branch, default_head)
        leaf = active["activeLeaf"]
        if branch != leaf or head != local_oid(root, leaf):
            raise GitError("release is allowed only from the active leaf")
        if local_oid(root, "Release", missing_ok=True) not in (None, active["baseHead"]):
            raise GitError("local Release changed before the release transaction")
        resolved = validate_active_repository(root, remote, active)
        branches = [name for name, _ in resolved]
        require_release_worktrees_safe(root, branch, leaf, branches)
        release_before = remote_oid(root, remote, "Release")
        if active["baseBranch"] == "Release":
            if release_before != active["baseHead"]:
                raise GitError("remote Release no longer equals the frozen chain base")
        elif (
            active["baseBranch"] != active["defaultBranch"]
            or state["lastClosedChain"] is not None
            or release_before is not None
        ):
            raise GitError("only the first chain may create Release from remote default HEAD")
        release_review = build_release_review(
            root,
            active,
            resolved[-1][1],
            review_selection,
            review_status,
            review_source_head,
            reviewed_source_commit,
            review_checks,
            review_evidence_summary,
            review_reason,
            review_remaining_risk,
        )
        candidate_selections = build_candidate_selections(
            performance_selection,
            performance_source,
            performance_reason,
            performance_remaining_risk,
            macos_signing_selection,
            macos_signing_source,
            macos_signing_reason,
            macos_signing_remaining_risk,
        )
        closed = {
            "remote": remote,
            "baseBranch": active["baseBranch"],
            "baseHead": active["baseHead"],
            "defaultBranch": default_branch,
            "defaultHead": default_head,
            "releaseHeadBefore": release_before,
            "closingHead": None,
            "entries": [
                {"branch": name, "preCloseHead": branch_head}
                for name, branch_head in resolved
            ],
            "releaseReview": release_review,
            "candidateSelections": candidate_selections,
        }
        state["activeChain"] = None
        state["lastClosedChain"] = closed
        require_commit_prerequisites(root)
        expected_payload = write_state(root, state)
        closing_head = commit_state(
            root, "chore(git): close feature branch chain", leaf, resolved[-1][1], expected_payload
        )
    else:
        if closed is None:
            raise GitError("there is no active or retryable closed branch chain")
        require_remote_matches(closed["remote"], remote)
        if default_branch != closed["defaultBranch"] or default_head != closed["defaultHead"]:
            raise GitError("remote default branch changed since the release transaction began")
        leaf = closed["entries"][-1]["branch"]
        if branch not in (leaf, "Release"):
            raise GitError("release retry must run from Release or the closing leaf")
        leaf_head = local_oid(root, leaf, missing_ok=True)
        release_head = local_oid(root, "Release", missing_ok=True)
        closing_head = leaf_head or release_head
        if closing_head is None:
            raise GitError("closing commit is unavailable locally")
        if branch == leaf and head != leaf_head:
            raise GitError("closing leaf HEAD changed before retry")
        if branch == "Release" and head != release_head:
            raise GitError("local Release HEAD changed before retry")
        require_retry_review_arguments_match(
            closed,
            review_selection,
            review_status,
            review_source_head,
            reviewed_source_commit,
            review_checks,
            review_evidence_summary,
            review_reason,
            review_remaining_risk,
            performance_selection,
            performance_source,
            performance_reason,
            performance_remaining_risk,
            macos_signing_selection,
            macos_signing_source,
            macos_signing_reason,
            macos_signing_remaining_risk,
        )

    assert closed is not None
    pre_close_heads = [entry["preCloseHead"] for entry in closed["entries"]]
    require_closed_history(root, closed["baseHead"], pre_close_heads, closing_head)
    require_release_review_repository(root, closed)
    remote_state = remote_close_state(root, remote, closing_head, closed)
    if "releaseReview" not in closed and remote_state == "pending":
        raise GitError(
            "a legacy closing commit without releaseReview cannot update remote Release"
        )
    if remote_state == "pending":
        branches = [entry["branch"] for entry in closed["entries"]]
        local_heads = list(zip(branches[:-1], pre_close_heads[:-1])) + [(branches[-1], closing_head)]
        require_local_branch_heads(root, local_heads)
        if local_oid(root, "Release", missing_ok=True) not in (None, closed["baseHead"]):
            raise GitError("local Release changed before the remote release transaction")
        require_release_worktrees_safe(root, branch, branches[-1], branches)
        if not is_ancestor(root, closed["baseHead"], closing_head):
            raise GitError("closing commit is not a fast-forward of the Release base")
        push_release_transaction(
            root,
            remote,
            closing_head,
            closed["releaseHeadBefore"],
            closed["entries"],
        )
    verify_default_unchanged(
        root,
        remote,
        closed["defaultBranch"],
        closed["defaultHead"],
    )
    if remote_close_state(root, remote, closing_head, closed) != "complete":
        raise GitError("remote release transaction did not reach the complete state")
    finish_local_cleanup(root, branch, closing_head, closed)
    result = {
        "status": "released",
        "releaseBranch": "Release",
        "releaseHead": closing_head,
        "remote": remote,
        "remoteCleaned": True,
        "localCleaned": True,
        "closedBranches": [entry["branch"] for entry in closed["entries"]],
        "defaultBranch": closed["defaultBranch"],
        "defaultHead": closed["defaultHead"],
    }
    if "releaseReview" in closed:
        result["releaseReview"] = closed["releaseReview"]
        result["candidateSelections"] = closed["candidateSelections"]
    return result
