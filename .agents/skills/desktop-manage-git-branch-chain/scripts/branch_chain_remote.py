#!/usr/bin/env python3
"""以单一远端快照读取默认分支、Release 与登记的 feature refs。"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Sequence

from branch_chain_git import GitError, OID_PATTERN, run_git


def remote_heads(
    root: Path, remote: str, branches: Sequence[str]
) -> dict[str, str | None]:
    """单次读取精确 heads refs，并拒绝重复、未知或畸形结果。"""

    if not branches or len(set(branches)) != len(branches):
        raise GitError("remote snapshot requires unique branch names")
    expected = {f"refs/heads/{branch}": branch for branch in branches}
    result = run_git(
        root,
        ["ls-remote", "--heads", remote, *expected],
    )
    snapshot: dict[str, str | None] = {branch: None for branch in branches}
    seen: set[str] = set()
    for line in result.stdout.splitlines():
        fields = line.split("\t", 1)
        if (
            len(fields) != 2
            or fields[1] not in expected
            or fields[1] in seen
            or not OID_PATTERN.fullmatch(fields[0])
        ):
            raise GitError("remote branch snapshot is malformed or ambiguous")
        seen.add(fields[1])
        snapshot[expected[fields[1]]] = fields[0]
    return snapshot


def remote_close_state(
    root: Path,
    remote: str,
    closing_head: str,
    closed: dict[str, Any],
) -> str:
    """用一次快照判定直接发布尚待更新、已完成或处于部分状态。"""

    branches = [entry["branch"] for entry in closed["entries"]]
    default_branch = closed["defaultBranch"]
    snapshot_branches = [default_branch, "Release", *branches]
    snapshot = remote_heads(root, remote, snapshot_branches)
    feature_heads = [snapshot[branch] for branch in branches]
    expected_features = [entry["preCloseHead"] for entry in closed["entries"]]
    if (
        feature_heads == expected_features
        and snapshot[default_branch] == closed["defaultHead"]
        and snapshot["Release"] == closed["releaseHeadBefore"]
    ):
        return "pending"
    if (
        closed["releaseHeadBefore"] is not None
        and feature_heads == expected_features
        and snapshot[default_branch] == closed["defaultHead"]
        and snapshot["Release"] is None
    ):
        return "pending-release-missing"
    if (
        all(value is None for value in feature_heads)
        and snapshot[default_branch] == closing_head
        and snapshot["Release"] is None
    ):
        return "complete"
    raise GitError(
        "remote default/Release/feature refs are in an unexpected partial or raced state"
    )


def require_legacy_remote_complete(
    root: Path,
    remote: str,
    closing_head: str,
    closed: dict[str, Any],
) -> None:
    """只接受旧式 Release 事务已经完整完成的远端快照。"""

    branches = [entry["branch"] for entry in closed["entries"]]
    default_branch = closed["defaultBranch"]
    snapshot = remote_heads(root, remote, [default_branch, "Release", *branches])
    if (
        snapshot[default_branch] == closed["defaultHead"]
        and snapshot["Release"] == closing_head
        and all(snapshot[branch] is None for branch in branches)
    ):
        return
    raise GitError(
        "legacy closing state cannot update the remote default branch and its remote Release transaction is not complete"
    )


def push_release_transaction(
    root: Path,
    remote: str,
    closing_head: str,
    default_branch: str,
    default_before: str,
    release_before: str | None,
    entries: list[dict[str, str]],
) -> None:
    """原子快进默认分支，并按冻结状态删除可选 Release 与 feature 链。"""

    arguments = [
        "push",
        "--atomic",
        f"--force-with-lease=refs/heads/{default_branch}:{default_before}",
    ]
    if release_before is not None:
        arguments.append(
            f"--force-with-lease=refs/heads/Release:{release_before}"
        )
    arguments.extend(
        f"--force-with-lease=refs/heads/{entry['branch']}:{entry['preCloseHead']}"
        for entry in entries
    )
    arguments.extend([remote, f"{closing_head}:refs/heads/{default_branch}"])
    if release_before is not None:
        arguments.append(":refs/heads/Release")
    arguments.extend(f":refs/heads/{entry['branch']}" for entry in entries)
    result = run_git(root, arguments, check=False)
    if result.returncode != 0:
        raise GitError("atomic default-branch update and temporary branch cleanup failed")
