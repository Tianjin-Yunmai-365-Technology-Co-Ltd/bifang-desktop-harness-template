#!/usr/bin/env python3
"""安全创建、检查和移除 Harness 并行协作使用的 Git Worktree。"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


IDENTIFIER = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


class WorkflowError(RuntimeError):
    """表示可预期的输入、Git 状态或数据安全阻断。"""

    def __init__(self, code: str, message: str, exit_code: int = 2) -> None:
        """保存稳定错误代码、人类可读原因和进程退出码。"""
        super().__init__(message)
        self.code = code
        self.exit_code = exit_code


@dataclass(frozen=True)
class UnitIdentity:
    """描述由任务与工作单元确定性派生的分支和 Worktree 路径。"""

    project_root: Path
    task: str
    unit: str
    branch: str
    worktree_path: Path


def run_git(project_root: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    """在指定项目根执行 Git，并把失败转换为不含调用栈的稳定错误。"""
    result = subprocess.run(
        ["git", "-C", str(project_root), *args],
        check=False,
        capture_output=True,
        text=True,
    )
    if check and result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "Git 命令失败"
        raise WorkflowError("git_failed", detail, 3)
    return result


def canonical_project_root(raw_root: str) -> Path:
    """确认显式目录存在且自身就是独立 Git 顶层目录。"""
    root = Path(raw_root).expanduser().resolve()
    if not root.is_dir():
        raise WorkflowError("project_root_missing", f"项目根目录不是目录：{root}")
    top = Path(run_git(root, "rev-parse", "--show-toplevel").stdout.strip()).resolve()
    if top != root:
        raise WorkflowError(
            "project_root_not_git_top_level",
            f"项目根目录 {root} 继承了 Git 顶层目录 {top}",
        )
    return root


def validate_identifier(label: str, value: str) -> str:
    """限制任务和单元标识，防止路径穿越与不可预测的分支名称。"""
    if not IDENTIFIER.fullmatch(value):
        raise WorkflowError(
            "invalid_identifier",
            f"{label} 必须匹配 {IDENTIFIER.pattern}：{value!r}",
        )
    return value


def unit_identity(project_root: Path, task: str, unit: str) -> UnitIdentity:
    """从已校验输入派生项目外的隔离目录和 codex/ 分支。"""
    safe_task = validate_identifier("任务", task)
    safe_unit = validate_identifier("单元", unit)
    worktree_root = project_root.parent / ".codex-worktrees" / project_root.name
    worktree_path = (worktree_root / safe_task / safe_unit).resolve()
    if worktree_root.resolve() not in worktree_path.parents:
        raise WorkflowError("worktree_path_outside_root", f"Worktree 路径不安全：{worktree_path}")
    return UnitIdentity(
        project_root=project_root,
        task=safe_task,
        unit=safe_unit,
        branch=f"codex/{safe_task}/{safe_unit}",
        worktree_path=worktree_path,
    )


def require_exact_cwd(expected: Path, code: str, context: str) -> Path:
    """要求进程真实工作目录精确匹配受管目录，避免仅凭参数跨边界操作。"""
    actual = Path.cwd().resolve()
    if actual != expected:
        raise WorkflowError(code, f"{context} 必须从 {expected} 运行，实际 cwd 为 {actual}", 4)
    return actual


def parsed_worktrees(project_root: Path) -> list[dict[str, str | bool]]:
    """把 Git porcelain Worktree 列表转换为可审计的稳定对象。"""
    records: list[dict[str, str | bool]] = []
    current: dict[str, str | bool] = {}
    for line in run_git(project_root, "worktree", "list", "--porcelain").stdout.splitlines():
        if not line:
            if current:
                records.append(current)
                current = {}
            continue
        key, _, value = line.partition(" ")
        current[key] = value if value else True
    if current:
        records.append(current)
    return records


def inspect_project(project_root: Path) -> dict[str, object]:
    """返回基线状态和全部已登记 Worktree，不修改仓库。"""
    status = run_git(project_root, "status", "--porcelain=v1", "--untracked-files=all").stdout
    head = run_git(project_root, "rev-parse", "--verify", "HEAD", check=False)
    branch = run_git(project_root, "branch", "--show-current").stdout.strip()
    return {
        "projectRoot": str(project_root),
        "clean": not bool(status.strip()),
        "branch": branch or None,
        "head": head.stdout.strip() if head.returncode == 0 else None,
        "worktrees": parsed_worktrees(project_root),
    }


def create_unit(identity: UnitIdentity) -> dict[str, object]:
    """从干净且已提交的当前基线创建一个独立分支 Worktree。"""
    state = inspect_project(identity.project_root)
    if not state["clean"]:
        raise WorkflowError(
            "base_worktree_dirty",
            "基线工作树存在已跟踪或未跟踪修改；不得自动贮藏工作树修改或提交",
            4,
        )
    if state["head"] is None:
        raise WorkflowError("base_head_missing", "基线仓库没有已提交的 HEAD", 4)
    branch_exists = run_git(
        identity.project_root,
        "show-ref",
        "--verify",
        "--quiet",
        f"refs/heads/{identity.branch}",
        check=False,
    )
    if branch_exists.returncode == 0:
        raise WorkflowError("branch_exists", f"分支已存在：{identity.branch}", 4)
    if identity.worktree_path.exists() or identity.worktree_path.is_symlink():
        raise WorkflowError("worktree_path_exists", f"Worktree 路径已存在：{identity.worktree_path}", 4)
    identity.worktree_path.parent.mkdir(parents=True, exist_ok=True)
    run_git(
        identity.project_root,
        "worktree",
        "add",
        "-b",
        identity.branch,
        str(identity.worktree_path),
        "HEAD",
    )
    return {
        "created": True,
        "projectRoot": str(identity.project_root),
        "task": identity.task,
        "unit": identity.unit,
        "branch": identity.branch,
        "worktreePath": str(identity.worktree_path),
        "baseHead": state["head"],
    }


def find_exact_worktree(identity: UnitIdentity) -> dict[str, str | bool]:
    """查找路径与预期分支同时匹配的 Worktree，拒绝名称碰撞。"""
    expected_branch = f"refs/heads/{identity.branch}"
    for record in parsed_worktrees(identity.project_root):
        raw_path = record.get("worktree")
        if not isinstance(raw_path, str) or Path(raw_path).resolve() != identity.worktree_path:
            continue
        if record.get("branch") != expected_branch:
            raise WorkflowError(
                "worktree_branch_mismatch",
                f"Worktree 路径属于 {record.get('branch')}，预期为 {expected_branch}",
                4,
            )
        return record
    raise WorkflowError("worktree_not_found", f"未找到受管 Worktree：{identity.worktree_path}", 4)


def guard_unit(identity: UnitIdentity, raw_write_targets: list[str]) -> dict[str, object]:
    """核验单元实际目录、登记、Git 根、分支与声明写入目标均处于所有权边界。"""
    if not raw_write_targets:
        raise WorkflowError(
            "write_target_required",
            "单元 guard 至少需要一个 --write-target",
            4,
        )
    actual_cwd = require_exact_cwd(
        identity.worktree_path,
        "unit_cwd_mismatch",
        "unit guard",
    )
    actual_root = Path(
        run_git(actual_cwd, "rev-parse", "--show-toplevel").stdout.strip()
    ).resolve()
    if actual_root != identity.worktree_path:
        raise WorkflowError(
            "unit_git_root_mismatch",
            f"单元 Git 顶层目录为 {actual_root}，预期为 {identity.worktree_path}",
            4,
        )
    branch = run_git(
        actual_cwd,
        "symbolic-ref",
        "--quiet",
        "--short",
        "HEAD",
        check=False,
    )
    actual_branch = branch.stdout.strip() if branch.returncode == 0 else None
    if actual_branch != identity.branch:
        raise WorkflowError(
            "unit_branch_mismatch",
            f"单元分支为 {actual_branch or 'HEAD 分离状态'}，预期为 {identity.branch}",
            4,
        )
    find_exact_worktree(identity)

    write_targets: list[str] = []
    for raw_target in raw_write_targets:
        candidate = Path(raw_target)
        target = (candidate if candidate.is_absolute() else actual_cwd / candidate).resolve()
        if target != identity.worktree_path and identity.worktree_path not in target.parents:
            raise WorkflowError(
                "write_target_outside_worktree",
                f"写入目标 {target} 位于受管 Worktree {identity.worktree_path} 之外",
                4,
            )
        write_targets.append(str(target))
    return {
        "guarded": True,
        "projectRoot": str(identity.project_root),
        "task": identity.task,
        "unit": identity.unit,
        "branch": identity.branch,
        "worktreePath": str(identity.worktree_path),
        "writeTargets": write_targets,
    }


def remove_unit(identity: UnitIdentity, integrated_into: str) -> dict[str, object]:
    """仅移除已整合且干净的精确 Worktree，并故意保留分支。"""
    validate_identifier("整合引用", integrated_into) if "/" not in integrated_into else None
    find_exact_worktree(identity)
    unit_status = run_git(
        identity.worktree_path,
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
    ).stdout
    if unit_status.strip():
        raise WorkflowError("worktree_dirty", "受管 Worktree 包含已跟踪或未跟踪修改", 4)
    integrated = run_git(
        identity.project_root,
        "merge-base",
        "--is-ancestor",
        identity.branch,
        integrated_into,
        check=False,
    )
    if integrated.returncode != 0:
        raise WorkflowError(
            "branch_not_integrated",
            f"{identity.branch} 不是 {integrated_into} 的祖先",
            4,
        )
    run_git(identity.project_root, "worktree", "remove", str(identity.worktree_path))
    return {
        "removed": True,
        "branchRetained": True,
        "branch": identity.branch,
        "worktreePath": str(identity.worktree_path),
        "integratedInto": integrated_into,
    }


def parser() -> argparse.ArgumentParser:
    """构建 create、guard、inspect 与 remove 四个低风险子命令。"""
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)
    for name in ("inspect", "create", "guard", "remove"):
        command = commands.add_parser(name)
        command.add_argument("--project-root", required=True)
        if name != "inspect":
            command.add_argument("--task", required=True)
            command.add_argument("--unit", required=True)
        if name == "guard":
            command.add_argument("--write-target", action="append", default=[])
        if name == "remove":
            command.add_argument("--integrated-into", required=True)
    return root


def main(argv: list[str] | None = None) -> int:
    """执行请求并始终输出一个便于 Agent 审计的 JSON 文档。"""
    try:
        args = parser().parse_args(argv)
        project_root = canonical_project_root(args.project_root)
        if args.command != "guard":
            require_exact_cwd(
                project_root,
                "project_cwd_mismatch",
                f"{args.command} 操作",
            )
        if args.command == "inspect":
            payload = {"ok": True, "operation": "inspect", **inspect_project(project_root)}
        else:
            identity = unit_identity(project_root, args.task, args.unit)
            if args.command == "create":
                result = create_unit(identity)
            elif args.command == "guard":
                result = guard_unit(identity, args.write_target)
            else:
                result = remove_unit(identity, args.integrated_into)
            payload = {"ok": True, "operation": args.command, **result}
        print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
        return 0
    except WorkflowError as error:
        print(
            json.dumps(
                {"ok": False, "error": {"code": error.code, "message": str(error)}},
                ensure_ascii=False,
                sort_keys=True,
            )
        )
        return error.exit_code


if __name__ == "__main__":
    sys.exit(main())
