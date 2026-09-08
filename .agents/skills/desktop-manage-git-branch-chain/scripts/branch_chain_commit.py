#!/usr/bin/env python3
"""执行分支链状态提交的身份、模板与 hook 后完整性门禁。"""

from __future__ import annotations

from pathlib import Path
import subprocess
import sys

from branch_chain_git import (
    GitError,
    noninteractive_git_environment,
    require_clean,
    require_state_only_commit,
    resolve_repository,
    run_git,
)


def require_commit_prerequisites(root: Path) -> None:
    """只读调用提交门禁，复核有效身份与仓库 local 受管模板。"""

    helper = (
        Path(__file__).resolve().parents[2]
        / "desktop-configure-git-commits"
        / "scripts"
        / "configure_git_commit.py"
    )
    if not helper.is_file() or helper.is_symlink():
        raise GitError("managed commit prerequisite checker is unavailable")
    for command in ("identity-check", "check"):
        result = subprocess.run(
            [sys.executable, "-B", str(helper), command, "--project-root", str(root)],
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            env=noninteractive_git_environment(),
        )
        if result.returncode != 0:
            raise GitError(f"managed commit prerequisite failed: {command}")


def require_no_unstaged_or_untracked(root: Path) -> None:
    """状态已暂存后要求没有其他未暂存 tracked 或未跟踪内容。"""

    unstaged = run_git(root, ["diff", "--quiet"], check=False)
    if unstaged.returncode not in (0, 1):
        raise GitError("cannot verify unstaged tracked files before state commit")
    untracked = run_git(
        root, ["ls-files", "--others", "--exclude-standard", "-z"], text=False
    ).stdout
    if unstaged.returncode == 1 or untracked:
        raise GitError("state commit requires no other unstaged or untracked paths")


def commit_state(
    root: Path,
    message: str,
    expected_branch: str,
    expected_parent: str,
    expected_payload: bytes,
) -> str:
    """通过正常 hooks 提交状态，并复核分支、父 OID 与实际提交内容。"""

    _, branch_before, head_before = resolve_repository(str(root))
    if branch_before != expected_branch or head_before != expected_parent:
        raise GitError("state commit branch or parent changed before commit")
    path = root / ".harness" / "git-branch-chain.json"
    if path.is_symlink() or path.parent.is_symlink() or path.read_bytes() != expected_payload:
        raise GitError("state payload changed before commit")
    literal = ":(literal).harness/git-branch-chain.json"
    run_git(root, ["add", "-A", "--", literal])
    staged = run_git(root, ["diff", "--cached", "--name-only", "-z"], text=False).stdout
    names = [item.decode("utf-8", "surrogateescape") for item in staged.split(b"\0") if item]
    if names != [".harness/git-branch-chain.json"]:
        raise GitError("state commit must contain only .harness/git-branch-chain.json")
    require_no_unstaged_or_untracked(root)
    result = run_git(root, ["commit", "-m", message], check=False)
    if result.returncode != 0:
        raise GitError("git commit failed; hooks were not bypassed")
    _, branch_after, new_head = resolve_repository(str(root))
    if branch_after != expected_branch:
        raise GitError("state commit moved away from the expected feature branch")
    require_state_only_commit(root, expected_parent, new_head)
    committed = run_git(
        root, ["show", f"{new_head}:.harness/git-branch-chain.json"], text=False
    ).stdout
    if (
        committed != expected_payload
        or path.is_symlink()
        or path.parent.is_symlink()
        or path.read_bytes() != expected_payload
    ):
        raise GitError("state payload changed during commit hooks")
    require_clean(root)
    return new_head
