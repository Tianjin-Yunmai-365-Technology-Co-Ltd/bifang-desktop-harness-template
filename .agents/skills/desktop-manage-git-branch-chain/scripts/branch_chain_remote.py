#!/usr/bin/env python3
"""以单一远端快照读取 Release 与 manifest feature refs。"""

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
    """用一次快照判定远端尚待更新、已完成或处于部分状态。"""

    branches = [entry["branch"] for entry in closed["entries"]]
    snapshot = remote_heads(root, remote, ["Release", *branches])
    feature_heads = [snapshot[branch] for branch in branches]
    expected_features = [entry["preCloseHead"] for entry in closed["entries"]]
    if feature_heads == expected_features and snapshot["Release"] == closed["releaseHeadBefore"]:
        return "pending"
    if all(value is None for value in feature_heads) and snapshot["Release"] == closing_head:
        return "complete"
    raise GitError("remote release/feature refs are in an unexpected partial or raced state")


def push_release_transaction(
    root: Path,
    remote: str,
    closing_head: str,
    release_before: str | None,
    entries: list[dict[str, str]],
) -> None:
    """原子快进 Release，并以逐 ref lease 比较删除远端 feature 链。"""

    arguments = [
        "push",
        "--atomic",
        f"--force-with-lease=refs/heads/Release:{release_before or ''}",
    ]
    arguments.extend(
        f"--force-with-lease=refs/heads/{entry['branch']}:{entry['preCloseHead']}"
        for entry in entries
    )
    arguments.extend([remote, f"{closing_head}:refs/heads/Release"])
    arguments.extend(f":refs/heads/{entry['branch']}" for entry in entries)
    result = run_git(root, arguments, check=False)
    if result.returncode != 0:
        raise GitError("atomic Release update and feature cleanup failed")
