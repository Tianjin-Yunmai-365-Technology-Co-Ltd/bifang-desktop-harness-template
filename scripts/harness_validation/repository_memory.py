"""校验按日项目记忆索引、命名与执行入口。"""

from __future__ import annotations

import re

from .context import *  # noqa: F403


def validate_daily_project_memory(errors: list[str]) -> None:
    """校验五类按日项目记忆的唯一事实来源、命名、索引和工作流入口。"""
    forbidden_legacy_files = (
        ROOT / "CHANGELOG.md",
        ROOT / "docs" / "DECISIONS.md",
        ROOT / "docs" / "PRODUCT_SPEC.md",
        ROOT / "docs" / "PROJECT_STATUS.md",
        ROOT / "docs" / "WORK_PLAN.md",
    )
    for path in forbidden_legacy_files:
        if path.exists():
            fail(errors, f"legacy growing log must be removed: {display_path(path)}")

    product_is_approved = PRODUCT_SPEC.is_file() and bool(
        re.search(r"状态[：:]\s*Approved", PRODUCT_SPEC.read_text(encoding="utf-8"))
    )
    daily_contracts = (
        (PRODUCT_SPEC_DIR, PRODUCT_SPEC_PATTERN, "Product Spec", True),
        (PRODUCT_STATUS_DIR, PRODUCT_STATUS_PATTERN, "Product Status", True),
        (WORK_PLAN_DIR, WORK_PLAN_PATTERN, "Work Plan", False),
        (ADR_DIR, re.compile(r"^\d{8}_ADR\.md$"), "ADR", product_is_approved),
        (
            CHANGELOG_DIR,
            re.compile(r"^\d{8}_CHANGELOG\.md$"),
            "Changelog",
            False,
        ),
    )
    for directory, filename_pattern, label, dated_file_required in daily_contracts:
        if not directory.is_dir():
            fail(errors, f"missing daily {label} directory: {display_path(directory)}")
            continue
        index = directory / "README.md"
        if not index.is_file():
            fail(errors, f"missing daily {label} index: {display_path(index)}")
            index_text = ""
        else:
            index_text = read_text_cached(index)
        daily_files: list[Path] = []
        for path in sorted(directory.glob("*.md")):
            if path.name == "README.md":
                continue
            if not filename_pattern.fullmatch(path.name):
                fail(errors, f"invalid daily {label} filename: {display_path(path)}")
                continue
            daily_files.append(path)
            if path.name not in index_text:
                fail(errors, f"daily {label} file missing from index: {display_path(path)}")
        if dated_file_required and not daily_files:
            fail(errors, f"no dated {label} file found in {display_path(directory)}")

    required_fragments = {
        PRODUCT_SPEC_DIR / "README.md": (
            "YYYYMMDD_product_spec.md",
            "同一天只维护一份产品规格",
            "读取前一份产品规格",
            "产品目标、边界、约束或成功标准变化时",
            "普通缺陷修复、纯重构、格式整理、测试补强和内部清理",
        ),
        PRODUCT_STATUS_DIR / "README.md": (
            "YYYYMMDD_product_status.md",
            "同一天只维护一份产品状态",
            "读取前一份产品状态",
            "里程碑、重要阻断、跨会话交接或用户要求",
            "普通缺陷修复、纯重构、格式整理、测试补强和内部清理",
        ),
        WORK_PLAN_DIR / "README.md": (
            "YYYYMMDD_work_plan.md",
            "同一天只维护一份工作计划",
            "读取前一份工作计划",
            "快速路径不创建 Work Plan",
            "标准计划至少包含精简 Todo",
            "里程碑计划必须包含对应验证里程碑",
            "维护类型本身不要求 Work Plan",
            "不自动触发其他项目记忆",
        ),
        ADR_DIR / "README.md": (
            "YYYYMMDD_ADR.md",
            "同一天不得新建第二个 ADR 文件",
            "长期重要、难以逆转的决定",
            "缺陷修复、纯重构、格式整理、测试补强、内部清理和实现细节不创建 ADR",
        ),
        CHANGELOG_DIR / "README.md": (
            "YYYYMMDD_CHANGELOG.md",
            "同一天的实际变化持续更新同一文件",
            "普通缺陷修复",
            "一律不进入 Changelog",
            "产品规格转为 `Approved` 本身",
        ),
        SKILLS_ROOT / "define-product" / "SKILL.md": (
            "只在产品边界需要决定时",
            "不默认加载全部历史",
            "低风险局部实现可直接交给 `$implement-change`",
            "普通缺陷修复、不改变可观察行为的纯重构",
        ),
        SKILLS_ROOT / "plan-change" / "SKILL.md": (
            "`标准` 或 `里程碑` 路径",
            "标准路径到此即可",
            "先把路径升级为里程碑",
            "不自动触发 Product Spec、ADR、Product Status、Verification 或 Changelog",
        ),
        SKILLS_ROOT / "implement-change" / "SKILL.md": (
            "快速路径直接实现",
            "纯文档、元数据、格式或不可合理单测",
            "只更新被独立事件触发的记忆",
            "本身不触发 Product Spec、ADR、Product Status、Changelog 或 Verification",
        ),
        SKILLS_ROOT / "verify-delivery" / "SKILL.md": (
            "确认任务已进入里程碑路径",
            "纯文档/元数据治理候选",
            "未触发的记忆不创建占位",
            "不得反向生成 Product Spec、ADR 或 Changelog",
        ),
        SKILLS_ROOT / "prepare-release" / "SKILL.md": (
            "docs/changelog/README.md",
            "仅含普通缺陷修复或纯重构",
            "不创建、不补写也不汇总 Changelog",
        ),
        ROOT / "docs" / "RELEASE.md": (
            "版本变化与 Changelog 写入是独立门禁",
            "仅含普通缺陷修复或纯重构",
            "缺少 Changelog 不削弱发布证据",
        ),
    }
    for path, fragments in required_fragments.items():
        if not path.is_file():
            fail(errors, f"missing daily project-memory contract file: {display_path(path)}")
            continue
        text = read_text_cached(path)
        for fragment in fragments:
            if fragment not in text:
                fail(
                    errors,
                    f"daily project-memory rule missing in {display_path(path)}: {fragment}",
                )
