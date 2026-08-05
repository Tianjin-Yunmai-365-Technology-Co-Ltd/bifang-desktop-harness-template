"""校验工程治理、并行协作、当前描述与版本事实契约。"""

from __future__ import annotations

import re
from pathlib import Path

from .context import *  # noqa: F403
from .governance_descriptions import (
    validate_current_descriptions,
    validate_stale_fragments,
)
from .governance_policy import validate_agent_policy
from .governance_version import validate_version_contract as _validate_version_contract


def validate_engineering_contract(errors: list[str]) -> None:
    """确认工程规则唯一来源、关键入口和执行型 Skills 已建立确定性引用。"""
    required_fragments = {
        ENGINEERING_RULES: (
            "## 2. 文件、模块与依赖边界",
            "400 行",
            "单文件 400 行硬上限",
            "## 3. 中文代码注释",
            "## 4. 文档规则",
            "## 5. 测试组织",
            "## 6. 规则例外",
            "## 7. 机械检查边界",
            "本身不触发 Product Spec、ADR、Product Status、Changelog 或 Verification",
            "任务被称为“修复”或“重构”不能绕过门禁",
        ),
        ROOT / "AGENTS.md": (
            "docs/ENGINEERING_RULES.md",
            "普通缺陷修复、不改变可观察行为的纯重构",
        ),
        ROOT / "README.md": (
            "docs/ENGINEERING_RULES.md",
            "普通缺陷修复、不改变可观察行为的纯重构",
        ),
        AGENT_POLICY: (
            "superpowers:",
            "parallel_worktree_subagents:",
            "milestone_smoke:",
            "milestone_e2e:",
            "任务路径与项目记忆触发彼此独立",
        ),
        PRODUCT_SPEC: (
            "docs/ENGINEERING_RULES.md",
            "本身不触发 Product Spec、ADR、Product Status、Changelog 或 Verification",
        ),
        ROOT / "docs" / "RUST_CLI_TEMPLATE.md": ("docs/ENGINEERING_RULES.md",),
        SKILLS_ROOT / "plan-change" / "SKILL.md": ("docs/ENGINEERING_RULES.md",),
        SKILLS_ROOT / "implement-change" / "SKILL.md": ("docs/ENGINEERING_RULES.md",),
        INITIALIZE_SKILL / "SKILL.md": ("docs/ENGINEERING_RULES.md",),
        ENVIRONMENT_SKILL / "SKILL.md": ("docs/RUST_CLI_TEMPLATE.md",),
        GUI_IDENTITY_SKILL: ("docs/ENGINEERING_RULES.md",),
        SKILLS_ROOT / "verify-delivery" / "SKILL.md": ("docs/ENGINEERING_RULES.md",),
        SKILLS_ROOT / "instantiate-project" / "SKILL.md": ("docs/ENGINEERING_RULES.md",),
        SKILLS_ROOT / "add-mcp-adapter" / "SKILL.md": ("docs/ENGINEERING_RULES.md",),
        SKILLS_ROOT / "add-gui-adapter" / "SKILL.md": ("docs/ENGINEERING_RULES.md",),
        CLI_SKILL: ("docs/ENGINEERING_RULES.md",),
        TUI_SKILL: ("工程规则",),
        E2E_SKILL: ("docs/VERIFICATION.md",),
        RUST_ASSET / "example_tool_core" / "src" / "lib.rs": (
            "#![deny(missing_docs)]",
        ),
    }
    for path, fragments in required_fragments.items():
        if not path.is_file():
            fail(errors, f"missing engineering contract file: {display_path(path)}")
            continue
        text = path.read_text(encoding="utf-8")
        for fragment in fragments:
            if fragment not in text:
                fail(
                    errors,
                    f"engineering rule reference missing in {display_path(path)}: {fragment}",
                )

def validate_parallel_and_tiered_verification(errors: list[str]) -> None:
    """校验持久协作策略、Todo 循环、真实里程碑与阶段禁令。"""
    required_fragments = {
        ROOT / "AGENTS.md": (
            "推荐敏捷预设",
            "parallel_worktree_subagents: enabled",
            "$run-parallel-worktrees",
            "独立 Git Worktree",
            "同步等待全部必需结果",
            "重叠写入转为串行",
            "每项任务使用一种路径：`快速`、`标准` 或 `里程碑`",
            "不得降级",
            "不强制 `$define-product`、`$plan-change`",
            "代码行为变化必须以相关非空测试",
            "纯文档、元数据、格式或不可合理单测",
            "只有里程碑路径要求当前批次 Todo 全部为 `done`",
            "Mock、stub、占位页面、中性 scaffold",
            "重开或新增具体 Todo",
            "返回 `$implement-change`",
            "$upgrade-harness",
        ),
        ROOT / "README.md": (
            "推荐敏捷预设",
            "每个任务选择一条路径",
            "低风险且可逆的局部改动走快速路径",
            "多步骤/多模块/需交接的工作走标准路径",
            "高风险、发布候选或用户明确要求时走里程碑路径",
            "纯文档、元数据或机械变更使用链接、解析、静态或差异检查",
            "安全、隐私、数据迁移",
            "$upgrade-harness",
            "dry-run 和三方比较",
        ),
        AGENT_POLICY: (
            "decision_mode: reuse_then_infer_then_ask",
            "parallel_worktree_subagents:",
            "milestone_smoke:",
            "milestone_e2e:",
            "预设只是输入捷径，不新增持久字段",
            "不得在用户未确认时静默采用",
            "快速、标准和里程碑是当前任务的执行路径",
        ),
        PARALLEL_SKILL / "SKILL.md": (
            "parallel_worktree_subagents: enabled",
            "许可，不表示强制要求",
            "至少两个活动 Todo",
            "不重叠的写入所有权",
            "同步等待每个必需结果",
            "绝不得自动暂存或自动提交用户修改",
            "辅助脚本会保留分支",
            "Todo 实施期间不得运行冒烟或 E2E",
            "标准路径直接返回 `$implement-change` 收口",
        ),
        PARALLEL_WORKTREE_SCRIPT: (
            '"rev-parse", "--show-toplevel"',
            'f"codex/{safe_task}/{safe_unit}"',
            "base_worktree_dirty",
            "worktree_path_exists",
            "worktree_branch_mismatch",
            "worktree_dirty",
            "branch_not_integrated",
            '"worktree", "remove"',
        ),
        PARALLEL_WORKTREE_TESTS: (
            "test_create_and_remove_integrated_clean_worktree",
            "test_create_rejects_dirty_base_including_untracked_files",
            "test_create_rejects_unsafe_identifier_and_existing_path",
            "test_remove_rejects_dirty_or_unintegrated_worktree",
        ),
        SKILLS_ROOT / "plan-change" / "SKILL.md": (
            "`标准` 或 `里程碑` 路径",
            "pending",
            "in_progress",
            "blocked",
            "done",
            "标准路径到此即可",
            "先把路径升级为里程碑",
            "模拟、桩、占位、脚手架和开发预览",
        ),
        SKILLS_ROOT / "implement-change" / "SKILL.md": (
            "parallel_worktree_subagents",
            "$run-parallel-worktrees",
            "快速路径直接实现请求",
            "相关非空测试",
            "纯文档、元数据、格式或不可合理单测",
            "本 Skill 不运行冒烟/E2E",
            "只更新被独立事件触发的记忆",
            "只有活动计划存在时报告 Todo 状态",
        ),
        SKILLS_ROOT / "rename-project-identity" / "SKILL.md": (
            "实例化身份重置",
            "现有产品改名",
            "必须先通过 `$define-product`",
            "不得以快速或标准路径完成",
            "交给 `$verify-delivery` 验收",
        ),
        SKILLS_ROOT / "verify-delivery" / "SKILL.md": (
            "确认任务已进入里程碑路径",
            "候选批次中的每个 Todo 均为 `done`",
            "拒绝源码片段、模拟实现、桩实现、占位内容、中性脚手架、开发预览",
            "纯文档/元数据治理候选",
            "milestone_smoke",
            "milestone_e2e",
            "重开或新增一个包含预期行为和回归测试的具体 Todo",
            "立即返回 `$implement-change`",
        ),
        E2E_SKILL: (
            "里程碑批次中的每个 Todo 均为 `done`",
            "$verify-delivery` 已进入里程碑验收",
            "完整真实产物",
            "重开或新增修复 Todo",
            "返回 `$implement-change`",
        ),
        BUILD_RELEASE_SKILL: (
            "不运行冒烟或 E2E",
            "不得启动二进制文件或运行冒烟/E2E",
            "把精确的最终字节和清单交给 `$verify-delivery`",
        ),
        TAURI_RELEASE_SKILL: (
            "不得在本 Skill 中运行冒烟/E2E",
            "不得启动安装包、应用或 Windows 二进制",
            "把精确最终字节交给 `$verify-delivery`",
            "milestoneAcceptance: pending",
        ),
        CROSS_PLATFORM_RELEASE_SKILL: (
            "绝不运行冒烟或 E2E",
            "confirm_candidate_build",
            "milestoneAcceptance: pending",
            "本工作流不得包含冒烟、E2E",
        ),
        COLLECT_RELEASE_SKILL: (
            "Milestone accepted",
            "不重新构建、签名、执行或发布候选",
            "收集过程绝不得自行启动冒烟/E2E",
        ),
        PREPARE_RELEASE_SKILL: (
            "由 `$verify-delivery` 给出的 `Milestone accepted` 候选",
            "不得在此运行任一测试",
            "绝不得在发布准备中运行冒烟/E2E",
            "仅含普通缺陷修复或纯重构",
            "Not applicable",
        ),
        ENGINEERING_RULES: (
            "### 5.3 风险分级与验证",
            "`快速`、`标准` 或 `里程碑` 路径",
            "快速路径适用于范围清楚、局部、可逆",
            "代码行为变化运行相关非空单元/回归测试",
            "纯文档、元数据、格式和不可合理单测",
            "只有里程碑路径要求全部 Todo 为 `done`",
            "模拟实现、测试替身、占位页面、中性脚手架",
            "重开 Todo 并返回实现",
        ),
        ROOT / "docs" / "RELEASE.md": (
            "## 里程碑验收与发布顺序",
            "当前批次全部 Todo 为 `done`",
            "默认先走 Windows、macOS、Linux 原生矩阵",
            "构建前按前述安全流程刷新根 `release/`",
            "构建在归档/哈希前尝试签名并验证",
            "失败记录 `rejected` 并重开 Todo",
            "发布流程检查候选提交、版本、哈希、签名状态、清单与已验收产物一致",
            "不自行运行冒烟/E2E 或重试签名",
            "pnpm tauri build --bundles nsis --runner cargo-xwin --target x86_64-pc-windows-msvc",
            "不得生成仅签名候选",
            "notarizationStatus: notarized-and-stapled",
            "runtimeVerification: Unverified",
            "版本变化与 Changelog 写入是独立门禁",
            "仅含普通缺陷修复或纯重构",
        ),
        UPGRADE_SKILL / "SKILL.md": (
            ".harness/upstream-lock.json",
            "试运行",
            "复核每一种分类",
            "protected",
            "merge-sections",
            "Todo 循环期间不得运行冒烟/E2E",
            "Harness 升级至少采用标准路径",
            "只有任务采用里程碑路径时",
            "--source-root <clean-harness-source-root>",
            "--path <one-reviewed-update-path>",
            "普通 `managed` 更新必须先于 `managed-self` 完成",
        ),
        UPGRADE_POLICY: (
            "managed",
            "managed-self",
            "merge-sections",
            "conditional",
            "protected",
            "tombstone",
        ),
    }
    helper_text = ""
    for path, fragments in required_fragments.items():
        if not path.is_file():
            fail(errors, f"missing parallel/tiered contract file: {display_path(path)}")
            continue
        text = path.read_text(encoding="utf-8")
        if path == PARALLEL_WORKTREE_SCRIPT:
            helper_text = text
        for fragment in fragments:
            if fragment not in text:
                fail(
                    errors,
                    f"parallel/tiered rule missing in {display_path(path)}: {fragment}",
                )

    forbidden_helper_fragments = (
        "git stash",
        "git commit",
        "--force",
        '"branch", "-D"',
    )
    for fragment in forbidden_helper_fragments:
        if fragment in helper_text:
            fail(errors, f"unsafe parallel helper behavior present: {fragment}")




def validate_version_contract(errors: list[str]) -> None:
    """使用 facade 当前 VERSION_FILE，保留测试和调用方的注入边界。"""

    _validate_version_contract(errors, VERSION_FILE)  # noqa: F405
