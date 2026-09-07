#!/usr/bin/env python3
"""实现 inspect、start、publish 与 release 的分支链状态机。"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
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
    write_state,
)


SUMMARY_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


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


def release_chain(project_root: str, requested_remote: str | None) -> dict[str, Any]:
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

    assert closed is not None
    pre_close_heads = [entry["preCloseHead"] for entry in closed["entries"]]
    require_closed_history(root, closed["baseHead"], pre_close_heads, closing_head)
    remote_state = remote_close_state(root, remote, closing_head, closed)
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
    return {
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
