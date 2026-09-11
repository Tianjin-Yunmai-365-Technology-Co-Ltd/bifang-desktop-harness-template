"""校验按日项目记忆索引、命名与执行入口。"""

from __future__ import annotations

import re

from .context import *  # noqa: F403


def validate_current_changelog_contract(errors: list[str], changelog: Path) -> None:
    """拒绝同日有效 Changelog 继续陈述已被替代的 Task 标题格式。"""
    if not changelog.is_file():
        return
    text = read_text_cached(changelog)
    deprecated_claims = (
        "标题固定使用“动作 + 结果”",
        "当前显示标题固定使用 `{任务}-{ID}-{摘要}`",
        "普通单结果请求在当前调用 Session 完成授权结果和本次必需检查后、最终回复前，至多一次尝试使用",
        "调用后返回的 `threadId`/`clientThreadId` 和可变状态不再反填标题",
        "标题不再携带可变状态",
        "当前调用 Session 与用户可见的 Worktree/Local 左侧 Task 统一使用 `{Task}|{序号}|{功能摘要}{当前进度}`",
        "内部 agent 不套用",
        "普通当前 Session 没有可复用值时从 `1` 开始",
        "当前 Session 没有可复用序号时使用 `1`",
        "左侧 Task 与 Subagent 批次分别按派发顺序从 `1` 分配",
        "按当前协调批次分配稳定序号",
        "普通 Session 无既有值时从 `1` 开始",
        "左侧 Task 与 Subagent 各自按当前派发批次顺序从 `1` 分配",
    )
    for deprecated in deprecated_claims:
        if deprecated in text:
            fail(
                errors,
                f"current Changelog contains superseded Task title contract in "
                f"{display_path(changelog)}: {deprecated}",
            )


def validate_superseded_release_lifecycle_fragments(
    errors: list[str],
    contracts: tuple[tuple[Path, tuple[str, ...]], ...] | None = None,
) -> None:
    """拒绝当前事实源重新引入候选状态、tracked 证据或倒置顺序。"""
    if contracts is None:
        contracts = (
            (
                WORK_PLAN_DIR / "README.md",
                ("存在非 `done` 项时不得把该计划范围标记为 `accepted`",),
            ),
            (
                PRODUCT_SPEC,
                ("明确区分 `pending` 与 `ready`",),
            ),
            (
                ROOT / "docs" / "RUST_CLI_TEMPLATE.md",
                ("`pending`/`ready` 状态转换", "发布准备仍只接受"),
            ),
            (
                SKILLS_ROOT / "desktop-collect-release-artifacts" / "SKILL.md",
                ("发布准备仍要求匹配的",),
            ),
            (
                ROOT / "docs" / "harness_engineering" / "project_lifecycle.md",
                (
                    "发布候选或用户明确要求完整验收时使用 `$desktop-verify-delivery`，"
                    "发布再进入 `$desktop-prepare-release`",
                ),
            ),
            (
                ROOT / "docs" / "harness_engineering" / "foundations.md",
                ("完整验收/发布证据和技术债必须保存在版本化仓库中",),
            ),
            (
                ROOT / "docs" / "harness_engineering" / "agent_first_design.md",
                (
                    "当前版本发布或完整验收完成",
                    "版本号、CHANGELOG、Git 标签和发布物一致",
                ),
            ),
            (
                ROOT / "docs" / "RELEASE.md",
                (
                    "Git 标签和源码归档中的版本一致",
                    "软件显示、Git 标签和发布物名称一致",
                ),
            ),
        )
    for path, fragments in contracts:
        if not path.is_file():
            continue
        text = read_text_cached(path)
        for fragment in fragments:
            if fragment in text:
                fail(
                    errors,
                    f"superseded release lifecycle wording in {display_path(path)}: {fragment}",
                )


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
    def history_archive_pattern(label_upper: str) -> re.Pattern[str]:
        """派生 <LABEL>_history(_N).md 的历史归档文件名模式。"""
        return re.compile(rf"^{label_upper}_history(_\d+)?\.md$")

    daily_contracts = (
        (PRODUCT_SPEC_DIR, PRODUCT_SPEC_PATTERN, "Product Spec", True, None),
        (PRODUCT_STATUS_DIR, PRODUCT_STATUS_PATTERN, "Product Status", True, None),
        (WORK_PLAN_DIR, WORK_PLAN_PATTERN, "Work Plan", False, None),
        (
            ADR_DIR,
            re.compile(r"^\d{8}_ADR\.md$"),
            "ADR",
            product_is_approved,
            history_archive_pattern("ADR"),
        ),
        (
            CHANGELOG_DIR,
            re.compile(r"^\d{8}_CHANGELOG\.md$"),
            "Changelog",
            False,
            history_archive_pattern("CHANGELOG"),
        ),
    )
    for directory, filename_pattern, label, dated_file_required, history_pattern in daily_contracts:
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
            if history_pattern is not None and history_pattern.fullmatch(path.name):
                if path.name not in index_text:
                    fail(errors, f"{label} history archive missing from index: {display_path(path)}")
                continue
            if not filename_pattern.fullmatch(path.name):
                fail(errors, f"invalid daily {label} filename: {display_path(path)}")
                continue
            daily_files.append(path)
            if path.name not in index_text:
                fail(errors, f"daily {label} file missing from index: {display_path(path)}")
        if dated_file_required and not daily_files:
            fail(errors, f"no dated {label} file found in {display_path(directory)}")

    changelog_files = sorted(
        path
        for path in CHANGELOG_DIR.glob("*.md")
        if re.fullmatch(r"\d{8}_CHANGELOG\.md", path.name)
    )
    if changelog_files:
        validate_current_changelog_contract(errors, changelog_files[-1])
    validate_superseded_release_lifecycle_fragments(errors)

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
            "真实渠道发布后的受管记录阶段、重要阻断、跨会话交接或用户要求",
            "候选构建、E2E、完整验收和就绪复核不写本目录",
            "`pending`/`accepted` 候选不触发 tracked 状态",
            "普通缺陷修复、纯重构、格式整理、测试补强和内部清理",
        ),
        WORK_PLAN_DIR / "README.md": (
            "YYYYMMDD_work_plan.md",
            "同一天只维护一份工作计划",
            "读取前一份工作计划",
            "日常开发不自动创建 Work Plan",
            "多步骤、多模块、中等风险或可并行本身都不要求 Work Plan",
            "持久计划至少包含精简 Todo",
            "候选构建、收集、E2E、验收状态或就绪结论不得回写 Work Plan",
            "候选事实只进入忽略的 `release/` 原子集合和最终回复",
            "没有 Work Plan 本身不阻断用户显式请求的构建或完整验收",
            "不自动触发其他项目记忆",
        ),
        PRODUCT_SPEC: (
            "manifest 状态只使用 `pending`、`rejected` 或 `accepted`",
            "`ready` 仅是对完整 `accepted` 原子集合的纯只读就绪复核结论",
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
        SKILLS_ROOT / "desktop-define-product" / "SKILL.md": (
            "只在产品边界需要决定时",
            "不默认加载全部历史",
            "范围确认后直接交给 `$desktop-implement-change`",
            "普通缺陷修复、不改变可观察行为的纯重构",
        ),
        SKILLS_ROOT / "desktop-plan-change" / "SKILL.md": (
            "只在持久计划能解决真实协调问题时建立 Todo",
            "多步骤、多模块、中等风险、可并行或 Agent 偏好本身不构成准入",
            "日常计划不得自行增加这些步骤",
            "计划存在和 Todo 完成都不自动触发 Product Spec、ADR、Product Status、Verification 或 Changelog",
        ),
        SKILLS_ROOT / "desktop-implement-change" / "SKILL.md": (
            "直接实现用户请求",
            "纯文档、元数据、格式或不可合理单测",
            "只更新被独立事件触发的记忆",
            "未触发时不写占位",
        ),
        SKILLS_ROOT / "desktop-verify-delivery" / "SKILL.md": (
            "没有 Work Plan 不阻断验收",
            "当前构建已经运行项目全部非空单元测试",
            "验收证据只写忽略的 `release/`",
            "不得在 tracked 源码中补写项目记忆或占位记录",
        ),
        SKILLS_ROOT / "desktop-prepare-release" / "SKILL.md": (
            "Changelog 仅在独立规则触发时更新",
            "普通缺陷仍进入发布日志",
            "不为此制造 Changelog",
        ),
        SKILLS_ROOT / "desktop-collect-release-artifacts" / "SKILL.md": (
            "发布就绪复核仍要求所有匹配 manifest 组成完整 `Milestone accepted` 原子集合",
        ),
        ROOT / "docs" / "RUST_CLI_TEMPLATE.md": (
            "只使用 `pending`/`rejected`/`accepted` 的候选状态",
            "纯只读就绪复核",
        ),
        ROOT / "docs" / "harness_engineering" / "project_lifecycle.md": (
            "普通合并登记分支、切换并推送动态默认主分支",
            "创建并推送版本 tag",
            "清理登记 Worktree/远端分支/本地分支",
            "最后构建/收集并用 `$desktop-verify-delivery` 完整验收",
        ),
        ROOT / "docs" / "harness_engineering" / "foundations.md": (
            "活动候选的构建与完整验收证据只保存在忽略的 `release/` 原子集合和最终回复",
            "真实渠道发布成功后的发布证据",
        ),
        ROOT / "docs" / "harness_engineering" / "agent_first_design.md": (
            "当前候选完整验收完成",
            "Git 标签或源码归档只在获得独立授权并实际生成时核对",
            "真实渠道发布完成是候选验收之后的独立事件",
        ),
        ROOT / "docs" / "RELEASE.md": (
            "版本变化与 Changelog 写入是独立门禁",
            "仅含普通缺陷修复或纯重构",
            "缺少 Changelog 不削弱候选证据",
            "manifest 状态只使用 `pending`、`rejected` 或 `accepted`",
            "远端 tag `v{版本}-{YYYYMMDD}` 已由正式发布生命周期创建",
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
