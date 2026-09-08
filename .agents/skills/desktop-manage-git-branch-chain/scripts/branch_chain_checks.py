#!/usr/bin/env python3
"""集中执行分支链命令成功返回前的本地后置条件。"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from branch_chain_git import GitError, require_clean, resolve_repository
from branch_chain_state import read_state


def require_branch_head_clean(root: Path, branch: str, head: str) -> None:
    """要求当前具名分支、HEAD 与工作树保持精确预期。"""

    _, current_branch, current_head = resolve_repository(str(root))
    if current_branch != branch or current_head != head:
        raise GitError("current feature branch or HEAD changed during hooks")
    require_clean(root)


def require_state_postcondition(
    root: Path,
    branch: str,
    head: str,
    expected_state: dict[str, Any],
) -> None:
    """成功返回前复核当前分支、HEAD、clean 与完整状态快照。"""

    require_branch_head_clean(root, branch, head)
    if read_state(root) != expected_state:
        raise GitError("branch-chain state changed during the operation")


def require_active_postcondition(
    root: Path,
    branch: str,
    head: str,
    expected_state: dict[str, Any],
) -> None:
    """复核 start 或 publish 的完整活动状态后置条件。"""

    require_state_postcondition(root, branch, head, expected_state)
