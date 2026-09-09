#!/usr/bin/env python3
"""保留单一命令入口，并按领域编排 Harness 的确定性验证。"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# 直接执行脚本时 Python 只加入 scripts 目录；补入仓库根以保持历史命令入口不变。
if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.harness_validation.context import EXPECTED_SKILLS, REQUIRED_FILES, WORKFLOW
from scripts.harness_validation.architecture import validate_core_first_contract
from scripts.harness_validation.governance import (
    validate_agent_policy,
    validate_current_descriptions,
    validate_engineering_contract,
    validate_streamlined_development_and_build,
    validate_version_contract,
)
from scripts.harness_validation.gui_support import validate_gui_support_contract
from scripts.harness_validation.git_lifecycle import validate_git_lifecycle_contract
from scripts.harness_validation.initialization import validate_initialization_contract
from scripts.harness_validation.line_limits import validate_repository_line_limits
from scripts.harness_validation.product_versioning import (
    validate_product_versioning_contract,
)
from scripts.harness_validation.rust_comments import validate_rust_chinese_comments
from scripts.harness_validation.repository import (
    validate_daily_project_memory,
    validate_markdown_links,
    validate_required_files,
    validate_skills,
    validate_work_plan_contract,
)
from scripts.harness_validation.release import validate_release_contract
from scripts.harness_validation.review import validate_soft_review_prompts
from scripts.harness_validation.upgrade import validate_upgrade_contract
from scripts.harness_validation.workflow import validate_workflow as _validate_workflow


def validate_workflow(errors: list[str]) -> None:
    """使用入口当前绑定的 workflow 路径运行校验，保留既有测试替换接口。"""
    _validate_workflow(errors, WORKFLOW)


def _parse_arguments(argv: list[str] | None = None) -> argparse.Namespace:
    """解析显式发布审查开关；日常验证不产生非必要审查提示。"""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--release-review",
        action="store_true",
        help="include non-blocking semantic/refactor review prompts for an enabled release review",
    )
    return parser.parse_args(argv)


def validate_optional_release_review(
    errors: list[str], warnings: list[str], *, enabled: bool
) -> None:
    """始终保留行数硬门禁，仅为已启用的发布审查收集软提示。"""

    validate_repository_line_limits(
        errors,
        warnings=warnings if enabled else None,
    )
    if enabled:
        validate_soft_review_prompts(warnings)


def main() -> int:
    """始终运行硬门禁，只在发布明确启用审查时生成软提示。"""
    arguments = _parse_arguments()
    errors: list[str] = []
    warnings: list[str] = []
    validate_required_files(errors)
    validate_daily_project_memory(errors)
    validate_work_plan_contract(errors)
    validate_skills(errors)
    validate_markdown_links(errors)
    validate_workflow(errors)
    validate_release_contract(errors)
    validate_git_lifecycle_contract(errors)
    validate_upgrade_contract(errors)
    validate_initialization_contract(errors)
    validate_gui_support_contract(errors)
    validate_core_first_contract(errors)
    validate_rust_chinese_comments(errors)
    validate_optional_release_review(
        errors,
        warnings,
        enabled=arguments.release_review,
    )
    validate_agent_policy(errors, require_source_defaults=True)
    validate_engineering_contract(errors)
    validate_streamlined_development_and_build(errors)
    validate_current_descriptions(errors)
    validate_version_contract(errors)
    validate_product_versioning_contract(errors)
    for warning in warnings:
        print(f"WARNING: {warning}", file=sys.stderr)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        print(f"Harness validation failed with {len(errors)} error(s).", file=sys.stderr)
        return 1
    print(
        f"Harness validation passed: {len(REQUIRED_FILES)} required files, "
        f"{len(EXPECTED_SKILLS)} skills, local Markdown links, tiered Rust 400/800, frontend 500/1000 and maintained-text 500/2000 line limits, five event-triggered project-memory streams, "
        "opt-in plans, minimal development checks, local-install/release-candidate separation, per-candidate E2E selection, per-release GUI performance selection and full unit suites, budgeted progressive AGENTS routing, persistent Agent policy, release/build routing, initialization gates, engineering rules, "
        "parallel worktree gates, automatic downstream versioning, core-first dependency boundaries, Rust workspace Chinese-comment coverage, real-artifact acceptance, executable prerequisite gates, workspace dependency inheritance, "
        "and workflow gates"
        + (
            f"; release review included {len(warnings)} non-blocking warning(s)."
            if arguments.release_review
            else "; non-essential review prompts deferred to the release selection."
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
