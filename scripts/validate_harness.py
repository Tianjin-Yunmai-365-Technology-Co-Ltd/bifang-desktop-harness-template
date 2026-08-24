#!/usr/bin/env python3
"""保留单一命令入口，并按领域编排 Harness 的确定性验证。"""

from __future__ import annotations

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
from scripts.harness_validation.initialization import validate_initialization_contract
from scripts.harness_validation.line_limits import validate_repository_line_limits
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


def main() -> int:
    """运行全部硬门禁与软审查提示，并以稳定退出码报告 Harness 状态。"""
    errors: list[str] = []
    warnings: list[str] = []
    validate_required_files(errors)
    validate_daily_project_memory(errors)
    validate_work_plan_contract(errors)
    validate_skills(errors)
    validate_markdown_links(errors)
    validate_workflow(errors)
    validate_release_contract(errors)
    validate_upgrade_contract(errors)
    validate_initialization_contract(errors)
    validate_gui_support_contract(errors)
    validate_core_first_contract(errors)
    validate_rust_chinese_comments(errors)
    validate_repository_line_limits(errors, warnings=warnings)
    validate_agent_policy(errors)
    validate_engineering_contract(errors)
    validate_streamlined_development_and_build(errors)
    validate_current_descriptions(errors)
    validate_version_contract(errors)
    validate_soft_review_prompts(warnings)
    for warning in warnings:
        print(f"WARNING: {warning}", file=sys.stderr)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        print(f"Harness validation failed with {len(errors)} error(s).", file=sys.stderr)
        return 1
    print(
        f"Harness validation passed: {len(REQUIRED_FILES)} required files, "
        f"{len(EXPECTED_SKILLS)} skills, local Markdown links, 500-line semantic review and hard 2000-line limits, five event-triggered project-memory streams, "
        "opt-in plans, minimal development checks, per-build E2E selection and full unit suites, persistent Agent policy, release/build routing, initialization gates, engineering rules, "
        "parallel worktree gates, core-first dependency boundaries, Rust workspace Chinese-comment coverage, real-artifact acceptance, executable prerequisite gates, workspace dependency inheritance, "
        f"and workflow gates; {len(warnings)} non-blocking review warning(s)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
