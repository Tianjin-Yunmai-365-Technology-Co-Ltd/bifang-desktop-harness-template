#!/usr/bin/env python3
"""封装分支链 helper 所需的无 shell Git 操作与只读门禁。"""

from __future__ import annotations

import os
from pathlib import Path
import re
import subprocess
from typing import Sequence


OID_PATTERN = re.compile(r"^[0-9a-f]{40}$")
REMOTE_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
GIT_VERSION_PATTERN = re.compile(
    r"^git version (\d+)\.(\d+)\.(\d+)(?:\.windows\.\d+)?(?: [^\r\n]+)?$"
)
MINIMUM_GIT_VERSION = (2, 36, 0)


class GitError(RuntimeError):
    """表示 Git 仓库、引用、远端或命令不满足安全边界。"""


def noninteractive_git_environment() -> dict[str, str]:
    """返回禁止终端与 Git Credential Manager 交互的子进程环境。"""

    environment = os.environ.copy()
    environment.update({"GIT_TERMINAL_PROMPT": "0", "GCM_INTERACTIVE": "Never"})
    return environment


def require_git_version() -> None:
    """要求支持 worktree porcelain -z 的稳定 Git 2.36.0 或更高版本。"""

    try:
        result = subprocess.run(
            ["git", "--version"], check=False, capture_output=True, text=True,
            encoding="utf-8", env=noninteractive_git_environment()
        )
    except FileNotFoundError as error:
        raise GitError("git executable is unavailable") from error
    match = GIT_VERSION_PATTERN.fullmatch(result.stdout.strip())
    if result.returncode != 0 or match is None:
        raise GitError("git version cannot be parsed; stable Git 2.36.0 or newer is required")
    if tuple(int(part) for part in match.groups()) < MINIMUM_GIT_VERSION:
        raise GitError("stable Git 2.36.0 or newer is required")


def run_git(
    root: Path,
    arguments: Sequence[str],
    *,
    check: bool = True,
    text: bool = True,
    input_value: str | bytes | None = None,
) -> subprocess.CompletedProcess[str] | subprocess.CompletedProcess[bytes]:
    """在精确项目根无 shell 运行 Git，并把失败转换为脱敏错误。"""

    try:
        result = subprocess.run(
            ["git", "-C", str(root), *arguments],
            check=False,
            capture_output=True,
            text=text,
            encoding="utf-8" if text else None,
            input=input_value,
            env=noninteractive_git_environment(),
        )
    except FileNotFoundError as error:
        raise GitError("git executable is unavailable") from error
    if check and result.returncode != 0:
        command = arguments[0] if arguments else "command"
        raise GitError(f"git {command} failed")
    return result


def resolve_repository(project_root: str) -> tuple[Path, str, str]:
    """要求非符号链接独立 Git 顶层、具名分支与 40 位 HEAD。"""

    require_git_version()
    supplied = Path(project_root).expanduser()
    if supplied.is_symlink():
        raise GitError("project root must not be a symbolic link")
    try:
        root = supplied.resolve(strict=True)
    except FileNotFoundError as error:
        raise GitError("project root does not exist") from error
    if not root.is_dir():
        raise GitError("project root is not a directory")
    query = run_git(root, ["rev-parse", "--is-inside-work-tree", "--show-toplevel", "HEAD"])
    lines = query.stdout.splitlines()
    if len(lines) != 3 or lines[0] != "true":
        raise GitError("project root is not a Git work tree with HEAD")
    if Path(lines[1]).resolve(strict=True) != root:
        raise GitError("project root must equal the independent Git top level")
    head = lines[2]
    if not OID_PATTERN.fullmatch(head):
        raise GitError("HEAD must resolve to a 40-character lowercase commit")
    branch_result = run_git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], check=False)
    branch = branch_result.stdout.strip()
    if branch_result.returncode != 0 or not branch:
        raise GitError("detached HEAD is not allowed")
    return root, branch, head


def status_records(root: Path) -> list[str]:
    """读取包含全部未跟踪文件的 NUL 分隔工作树状态。"""

    value = run_git(
        root,
        ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
        text=False,
    ).stdout
    return [item.decode("utf-8", "surrogateescape") for item in value.split(b"\0") if item]


def require_clean(root: Path) -> None:
    """要求 index、已跟踪文件和未跟踪文件全部为空。"""

    if status_records(root):
        raise GitError("working tree must be clean")


def configured_remotes(root: Path) -> list[str]:
    """返回排序后的仓库 remote 名称，不读取或输出 URL。"""

    return sorted(line for line in run_git(root, ["remote"]).stdout.splitlines() if line)


def select_remote(root: Path, requested: str | None) -> str:
    """显式选择已配置 remote，或按 origin/唯一 remote 规则解析。"""

    remotes = configured_remotes(root)
    if requested is not None:
        if not REMOTE_PATTERN.fullmatch(requested) or requested not in remotes:
            raise GitError("requested remote is not a configured safe remote name")
        require_single_push_destination(root, requested)
        return requested
    if "origin" in remotes:
        require_single_push_destination(root, "origin")
        return "origin"
    if len(remotes) == 1:
        if not REMOTE_PATTERN.fullmatch(remotes[0]):
            raise GitError("configured remote does not have a safe remote name")
        require_single_push_destination(root, remotes[0])
        return remotes[0]
    if not remotes:
        raise GitError("repository has no configured remote")
    raise GitError("repository has multiple remotes and no origin; pass --remote explicitly")


def require_single_push_destination(root: Path, remote: str) -> None:
    """要求 remote 的 fetch 与唯一 push 目的地相同，以保留单事务语义。"""

    fetch_urls = run_git(root, ["remote", "get-url", "--all", remote]).stdout.splitlines()
    push_urls = run_git(
        root, ["remote", "get-url", "--push", "--all", remote]
    ).stdout.splitlines()
    if len(fetch_urls) != 1 or len(push_urls) != 1 or fetch_urls[0] != push_urls[0]:
        raise GitError("remote must have one identical fetch and push destination")


def remote_default(root: Path, remote: str) -> tuple[str, str]:
    """从远端 HEAD 的 symref 解析动态默认分支及当前 OID。"""

    result = run_git(root, ["ls-remote", "--symref", remote, "HEAD"])
    target: str | None = None
    head: str | None = None
    for line in result.stdout.splitlines():
        if line.startswith("ref: refs/heads/") and line.endswith("\tHEAD"):
            target = line[len("ref: refs/heads/") : -len("\tHEAD")]
        else:
            fields = line.split("\t", 1)
            if len(fields) == 2 and fields[1] == "HEAD" and OID_PATTERN.fullmatch(fields[0]):
                head = fields[0]
    if not target or not head:
        raise GitError("remote default branch cannot be resolved unambiguously")
    return target, head


def protected_branches(default_branch: str) -> set[str]:
    """返回任何自动写操作都不得触及的默认分支集合。"""

    return {"main", "master", default_branch}


def require_release_not_default(default_branch: str) -> None:
    """要求固定 Release 分支不是名称或动态意义上的默认分支。"""

    if "Release" in protected_branches(default_branch):
        raise GitError("Release must not be the remote default branch")


def local_oid(root: Path, branch: str, *, missing_ok: bool = False) -> str | None:
    """读取精确本地 heads ref，绝不把参数解释为通配符。"""

    result = run_git(
        root,
        ["rev-parse", "--verify", f"refs/heads/{branch}^{{commit}}"],
        check=False,
    )
    value = result.stdout.strip()
    if result.returncode != 0:
        if missing_ok:
            return None
        raise GitError(f"local branch is missing: {branch}")
    if not OID_PATTERN.fullmatch(value):
        raise GitError(f"local branch does not resolve to a commit: {branch}")
    return value


def remote_oid(root: Path, remote: str, branch: str) -> str | None:
    """读取远端精确 heads ref；缺失返回 None，多义结果阻断。"""

    result = run_git(root, ["ls-remote", "--heads", remote, f"refs/heads/{branch}"])
    lines = [line for line in result.stdout.splitlines() if line]
    if not lines:
        return None
    if len(lines) != 1:
        raise GitError(f"remote branch lookup is ambiguous: {branch}")
    fields = lines[0].split("\t", 1)
    if len(fields) != 2 or fields[1] != f"refs/heads/{branch}" or not OID_PATTERN.fullmatch(fields[0]):
        raise GitError(f"remote branch lookup is malformed: {branch}")
    return fields[0]


def require_local_remote_head(
    root: Path, remote: str, branch: str, expected_head: str
) -> None:
    """要求一个父分支的本地与远端 ref 同时保持冻结 OID。"""

    if (
        local_oid(root, branch, missing_ok=True) != expected_head
        or remote_oid(root, remote, branch) != expected_head
    ):
        raise GitError("parent branch changed while the next feature branch was created")


def is_ancestor(root: Path, ancestor: str, descendant: str) -> bool:
    """判断一个精确 commit 是否为另一个的祖先，异常状态失败关闭。"""

    result = run_git(
        root,
        ["merge-base", "--is-ancestor", ancestor, descendant],
        check=False,
    )
    if result.returncode not in (0, 1):
        raise GitError("cannot determine commit ancestry")
    return result.returncode == 0


def require_linear_segment(root: Path, parent: str, child: str) -> None:
    """要求 parent 到 child 是至少一个提交且无 merge 的直接父子序列。"""

    lines = run_git(
        root,
        ["rev-list", "--parents", "--reverse", f"{parent}..{child}"],
    ).stdout.splitlines()
    if not lines:
        raise GitError("feature branch segment must contain at least one commit")
    expected_parent = parent
    for line in lines:
        fields = line.split()
        if len(fields) != 2 or fields[1] != expected_parent:
            raise GitError("feature branch segment is not a strict linear parent chain")
        expected_parent = fields[0]
    if expected_parent != child:
        raise GitError("feature branch segment does not end at the expected head")


def require_direct_child(root: Path, parent: str, child: str) -> None:
    """要求 child 是只有一个父提交且该父精确等于 parent 的普通提交。"""

    fields = run_git(root, ["rev-list", "--parents", "-n", "1", child]).stdout.split()
    if fields != [child, parent]:
        raise GitError("state commit must be the direct non-merge child of its expected parent")


def require_state_only_commit(root: Path, parent: str, child: str) -> None:
    """要求提交相对唯一父提交只改变固定分支链状态文件。"""

    require_direct_child(root, parent, child)
    changed = run_git(
        root,
        ["diff-tree", "--no-commit-id", "--name-only", "-z", "-r", parent, child],
        text=False,
    ).stdout
    names = [item.decode("utf-8", "surrogateescape") for item in changed.split(b"\0") if item]
    if names != [".harness/git-branch-chain.json"]:
        raise GitError("state commit contains paths outside .harness/git-branch-chain.json")


def require_closed_history(
    root: Path, base_head: str, pre_close_heads: Sequence[str], closing_head: str
) -> None:
    """从冻结基线逐段验证全部关闭前头，再验证唯一状态关闭提交。"""

    previous = base_head
    for head in pre_close_heads:
        require_linear_segment(root, previous, head)
        previous = head
    require_state_only_commit(root, previous, closing_head)


def checked_out_branches(root: Path) -> dict[str, list[str]]:
    """返回每个本地分支登记的全部 Worktree 路径，不覆盖重复项。"""

    output = run_git(
        root,
        ["worktree", "list", "--porcelain", "-z"],
        text=False,
    ).stdout
    occupied: dict[str, list[str]] = {}
    worktree = "unknown"
    for raw_line in output.split(b"\0"):
        line = raw_line.decode("utf-8", "surrogateescape")
        if line.startswith("worktree "):
            worktree = line[len("worktree ") :]
        elif line.startswith("branch refs/heads/"):
            branch = line[len("branch refs/heads/") :]
            occupied.setdefault(branch, []).append(worktree)
    return occupied


def require_worktree_ownership(
    occupied: dict[str, list[str]], branch: str, root: Path, allow_current: bool
) -> None:
    """只允许未占用分支，或恰由当前根唯一占用的明确例外。"""

    paths = occupied.get(branch, [])
    if not paths:
        return
    try:
        current_only = len(paths) == 1 and Path(paths[0]).resolve() == root
    except OSError:
        current_only = False
    if not (allow_current and current_only):
        raise GitError(f"branch is checked out by another worktree: {branch}")


def push_branch(root: Path, remote: str, branch: str, head: str) -> None:
    """以普通快进语义推送一个精确 feature ref，并让 hooks 自然执行。"""

    result = run_git(
        root,
        ["push", "--set-upstream", remote, f"{head}:refs/heads/{branch}"],
        check=False,
    )
    if result.returncode != 0:
        raise GitError("feature branch push failed without force")
    if remote_oid(root, remote, branch) != head:
        raise GitError("remote feature branch OID does not match after push")
    _, current_branch, current_head = resolve_repository(str(root))
    if current_branch != branch or current_head != head:
        raise GitError("active feature branch or HEAD changed during push hooks")
    require_clean(root)


def switch_branch(
    root: Path,
    branch: str,
    *,
    create: bool = False,
    start_point: str | None = None,
) -> None:
    """切换或新建一个已经过上层精确验证的分支。"""

    if start_point is not None and not create:
        raise GitError("a start point is allowed only when creating a branch")
    arguments = ["switch", "-c", branch] if create else ["switch", branch]
    if start_point is not None:
        arguments.append(start_point)
    run_git(root, arguments)


def update_local_branch(
    root: Path, branch: str, new_head: str, old_head: str | None
) -> None:
    """以精确旧 OID 的 CAS 创建或快进一个本地分支 ref。"""

    expected = old_head or ("0" * 40)
    result = run_git(
        root,
        ["update-ref", f"refs/heads/{branch}", new_head, expected],
        check=False,
    )
    if result.returncode != 0:
        raise GitError(f"local branch changed before update: {branch}")


def require_local_branch_heads(
    root: Path, branches: Sequence[tuple[str, str]]
) -> None:
    """要求每个本地 manifest ref 都存在且精确等于冻结 OID。"""

    for branch, expected_head in branches:
        if local_oid(root, branch, missing_ok=True) != expected_head:
            raise GitError(f"local manifest branch changed before remote cleanup: {branch}")


def delete_local_branches(root: Path, branches: Sequence[tuple[str, str]]) -> None:
    """按预期 OID 用单一 ref 事务删除本地分支，缺失项幂等完成。"""

    pending: list[tuple[str, str]] = []
    for branch, expected_head in branches:
        current = local_oid(root, branch, missing_ok=True)
        if current is None:
            continue
        if current != expected_head:
            raise GitError(f"local branch changed before cleanup: {branch}")
        pending.append((branch, expected_head))
    if not pending:
        return
    commands = [
        f"delete refs/heads/{branch} {expected_head}" for branch, expected_head in pending
    ]
    result = run_git(
        root,
        ["update-ref", "--stdin"],
        check=False,
        text=False,
        input_value=("\n".join(commands) + "\n").encode("ascii"),
    )
    if result.returncode != 0:
        names = ", ".join(branch for branch, _ in pending)
        raise GitError(f"atomic local branch cleanup failed: {names}")
