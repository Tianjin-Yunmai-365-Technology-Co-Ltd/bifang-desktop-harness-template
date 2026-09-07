#!/usr/bin/env python3
"""安全管理严格串行、完整推送并发布到 Release 的 Git 分支链。"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Sequence

from branch_chain_git import GitError
from branch_chain_operations import inspect_chain, publish_leaf, release_chain, start_chain
from branch_chain_state import StateError


def add_common_arguments(parser: argparse.ArgumentParser) -> None:
    """为所有子命令添加精确项目根与可选 remote 参数。"""

    parser.add_argument("--project-root", required=True)
    parser.add_argument("--remote")


def build_parser() -> argparse.ArgumentParser:
    """建立 inspect、start、publish、release 四个稳定入口。"""

    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    inspect = subparsers.add_parser("inspect", help="只读检查仓库与分支链状态")
    add_common_arguments(inspect)
    start = subparsers.add_parser("start", help="开始下一条严格串行 feature 分支")
    add_common_arguments(start)
    start.add_argument("--summary", required=True)
    publish = subparsers.add_parser("publish", help="完整推送当前 active leaf")
    add_common_arguments(publish)
    release = subparsers.add_parser("release", help="原子发布并清理精确 feature 分支链")
    add_common_arguments(release)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """执行所选状态转换并输出稳定、脱敏的单行 JSON。"""

    arguments = build_parser().parse_args(argv)
    try:
        if arguments.command == "inspect":
            result = inspect_chain(arguments.project_root, arguments.remote)
        elif arguments.command == "start":
            result = start_chain(arguments.project_root, arguments.remote, arguments.summary)
        elif arguments.command == "publish":
            result = publish_leaf(arguments.project_root, arguments.remote)
        else:
            result = release_chain(arguments.project_root, arguments.remote)
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
