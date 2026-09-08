#!/usr/bin/env python3
"""安全管理严格串行、完整推送并直接发布到默认分支的 Git 分支链。"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Sequence

from branch_chain_git import GitError
from branch_chain_operations import (
    inspect_chain,
    integrate_task,
    publish_leaf,
    release_chain,
    start_chain,
    verify_release_review,
)
from branch_chain_state import StateError


def add_common_arguments(parser: argparse.ArgumentParser) -> None:
    """为所有子命令添加精确项目根与可选 remote 参数。"""

    parser.add_argument("--project-root", required=True)
    parser.add_argument("--remote")


def build_parser() -> argparse.ArgumentParser:
    """建立分支链检查、创建、Task 整合、推送与关闭入口。"""

    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    inspect = subparsers.add_parser("inspect", help="只读检查仓库与分支链状态")
    add_common_arguments(inspect)
    start = subparsers.add_parser("start", help="开始下一条严格串行 feature 分支")
    add_common_arguments(start)
    start.add_argument("--summary", required=True)
    integrate = subparsers.add_parser(
        "integrate-task", help="把已冻结的左侧 Task 提交条件快进到 active leaf"
    )
    add_common_arguments(integrate)
    integrate.add_argument("--task-branch", required=True)
    integrate.add_argument("--task-worktree", required=True)
    integrate.add_argument("--task-head", required=True)
    publish = subparsers.add_parser("publish", help="完整推送当前 active leaf")
    add_common_arguments(publish)
    verify = subparsers.add_parser(
        "verify-release-review", help="只读验证当前默认分支的封存审查信封"
    )
    add_common_arguments(verify)
    release = subparsers.add_parser(
        "release", help="原子快进默认分支并清理精确 feature 分支链"
    )
    add_common_arguments(release)
    release.add_argument("--review-selection", choices=("enabled", "disabled"))
    release.add_argument("--review-status", choices=("passed", "Not run"))
    release.add_argument("--review-source-head")
    release.add_argument("--reviewed-source-commit")
    release.add_argument("--review-check", action="append")
    release.add_argument("--review-evidence-summary")
    release.add_argument("--review-reason")
    release.add_argument("--review-remaining-risk")
    release.add_argument(
        "--performance-selection", choices=("enabled", "disabled", "not-applicable")
    )
    release.add_argument(
        "--performance-source",
        choices=(
            "requested",
            "product-required",
            "channel-required",
            "not-requested",
            "not-applicable",
        ),
    )
    release.add_argument("--performance-reason")
    release.add_argument("--performance-remaining-risk")
    release.add_argument(
        "--macos-signing-selection",
        choices=("enabled", "disabled", "not-applicable"),
    )
    release.add_argument(
        "--macos-signing-source",
        choices=(
            "configured",
            "requested",
            "channel-required",
            "not-requested",
            "not-applicable",
        ),
    )
    release.add_argument("--macos-signing-reason")
    release.add_argument("--macos-signing-remaining-risk")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """执行所选状态转换并输出稳定、脱敏的单行 JSON。"""

    arguments = build_parser().parse_args(argv)
    try:
        if arguments.command == "inspect":
            result = inspect_chain(arguments.project_root, arguments.remote)
        elif arguments.command == "start":
            result = start_chain(arguments.project_root, arguments.remote, arguments.summary)
        elif arguments.command == "integrate-task":
            result = integrate_task(
                arguments.project_root,
                arguments.remote,
                arguments.task_branch,
                arguments.task_worktree,
                arguments.task_head,
            )
        elif arguments.command == "publish":
            result = publish_leaf(arguments.project_root, arguments.remote)
        elif arguments.command == "verify-release-review":
            result = verify_release_review(arguments.project_root, arguments.remote)
        else:
            result = release_chain(
                arguments.project_root,
                arguments.remote,
                arguments.review_selection,
                arguments.review_status,
                arguments.review_source_head,
                arguments.reviewed_source_commit,
                arguments.review_check,
                arguments.review_evidence_summary,
                arguments.review_reason,
                arguments.review_remaining_risk,
                arguments.performance_selection,
                arguments.performance_source,
                arguments.performance_reason,
                arguments.performance_remaining_risk,
                arguments.macos_signing_selection,
                arguments.macos_signing_source,
                arguments.macos_signing_reason,
                arguments.macos_signing_remaining_risk,
            )
    except (GitError, StateError, OSError, ValueError) as error:
        print(
            json.dumps({"status": "error", "error": str(error)}, ensure_ascii=False),
            file=sys.stderr,
        )
        return 1
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
