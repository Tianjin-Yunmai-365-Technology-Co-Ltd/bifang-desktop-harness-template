"""校验工程治理、并行协作、当前描述与版本事实契约。"""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from .context import *  # noqa: F403


def validate_agent_policy(
    errors: list[str],
    policy_path: Path = AGENT_POLICY,
    *,
    allow_pending: bool = True,
) -> None:
    """校验四项项目级偏好的稳定 schema、值域和持久执行语义。"""
    if not policy_path.is_file():
        fail(errors, f"missing Agent policy: {display_path(policy_path)}")
        return

    text = policy_path.read_text(encoding="utf-8")
    match = re.match(r"\A---\n(.*?)\n---\n", text, flags=re.DOTALL)
    if not match:
        fail(errors, f"missing Agent policy YAML frontmatter: {display_path(policy_path)}")
        return

    fields: dict[str, str] = {}
    for line in match.group(1).splitlines():
        key, separator, value = line.partition(":")
        key = key.strip()
        if not separator or not key:
            fail(errors, f"invalid Agent policy frontmatter line: {line}")
            continue
        if key in fields:
            fail(errors, f"duplicate Agent policy field: {key}")
            continue
        fields[key] = value.strip()

    expected_fields = {
        "schema_version",
        "confirmed_by",
        "confirmed_at",
        "decision_mode",
        "superpowers",
        "parallel_worktree_subagents",
        "milestone_smoke",
        "milestone_e2e",
    }
    if set(fields) != expected_fields:
        fail(
            errors,
            "Agent policy fields mismatch: "
            f"missing={sorted(expected_fields - set(fields))}, "
            f"extra={sorted(set(fields) - expected_fields)}",
        )

    if fields.get("schema_version") != "1":
        fail(errors, "Agent policy schema_version must be 1")
    if fields.get("decision_mode") != "reuse_then_infer_then_ask":
        fail(errors, "Agent policy decision_mode must be reuse_then_infer_then_ask")
    for field in (
        "superpowers",
        "parallel_worktree_subagents",
        "milestone_smoke",
        "milestone_e2e",
    ):
        if fields.get(field) not in {"enabled", "disabled", "pending"}:
            fail(errors, f"Agent policy {field} must be enabled, disabled, or pending")
        elif not allow_pending and fields.get(field) == "pending":
            fail(errors, f"initialized downstream Agent policy must resolve {field}")
    for field in ("confirmed_by", "confirmed_at"):
        if not fields.get(field):
            fail(errors, f"Agent policy {field} must not be empty")
    if not allow_pending:
        confirmed_by = fields.get("confirmed_by", "").strip()
        if confirmed_by.lower() in {"pending", "unknown", "unset", "n/a"}:
            fail(
                errors,
                "initialized downstream Agent policy confirmed_by must identify "
                "a real confirmation source",
            )
        confirmed_at = fields.get("confirmed_at", "").strip()
        if confirmed_at.lower() in {"pending", "unknown", "unset", "n/a"}:
            fail(
                errors,
                "initialized downstream Agent policy confirmed_at must be resolved",
            )
        else:
            try:
                datetime.fromisoformat(confirmed_at.replace("Z", "+00:00"))
            except ValueError:
                fail(
                    errors,
                    "initialized downstream Agent policy confirmed_at must be "
                    "a calendar-valid ISO date or RFC3339 timestamp",
                )

    required_body_fragments = (
        "下游项目 Agent 能力与里程碑验收偏好的唯一持久事实来源",
        "完成初始化的下游四项选择只能是 `enabled` 或 `disabled`",
        "一次收集",
        "后续任务不得仅因进入类似场景而重复询问",
        "先复用、再判断、最后询问",
        "冒烟/E2E 不得在产品定义、计划、Todo 编码",
    )
    for fragment in required_body_fragments:
        if fragment not in text:
            fail(
                errors,
                f"Agent policy persistence rule missing in {display_path(policy_path)}: {fragment}",
            )


def validate_engineering_contract(errors: list[str]) -> None:
    """确认工程规则唯一来源、关键入口和执行型 Skills 已建立确定性引用。"""
    required_fragments = {
        ENGINEERING_RULES: (
            "## 2. 文件、模块与依赖边界",
            "400 行",
            "800 行",
            "## 3. 中文代码注释",
            "## 4. 文档规则",
            "## 5. 测试组织",
            "## 6. 规则例外",
            "## 7. 机械检查边界",
        ),
        ROOT / "AGENTS.md": ("docs/ENGINEERING_RULES.md",),
        ROOT / "README.md": ("docs/ENGINEERING_RULES.md",),
        AGENT_POLICY: (
            "superpowers:",
            "parallel_worktree_subagents:",
            "milestone_smoke:",
            "milestone_e2e:",
        ),
        PRODUCT_SPEC: ("docs/ENGINEERING_RULES.md",),
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
            "下游初始化时一次确认",
            "parallel_worktree_subagents: enabled",
            "$run-parallel-worktrees",
            "独立 Git Worktree",
            "同步等待全部必需结果",
            "重叠写入转为串行",
            "Todo 批次和验证里程碑",
            "pending",
            "in_progress",
            "blocked",
            "done",
            "每轮 Todo 开发必须执行非空单元测试",
            "Todo 开发、普通验证、常规构建、制品收集和发布元数据流程不得运行冒烟或 E2E",
            "Mock、stub、占位页面、中性 scaffold",
            "重开或新增具体 Todo",
            "返回 `$implement-change`",
            "$upgrade-harness",
        ),
        ROOT / "README.md": (
            "一次确认 Superpowers、Worktree/Subagent、验证里程碑冒烟和验证里程碑 E2E",
            "TodoList",
            "Todo 未完成时不进入里程碑",
            "Mock、占位或 scaffold 会被拒绝",
            "缺失和偏差会重开 Todo 返回编码",
            "冒烟/E2E 只在这里按持久策略",
            "$upgrade-harness",
            "dry-run 和三方比较",
        ),
        AGENT_POLICY: (
            "decision_mode: reuse_then_infer_then_ask",
            "parallel_worktree_subagents:",
            "milestone_smoke:",
            "milestone_e2e:",
            "后续任务不得仅因进入类似场景而重复询问",
            "冒烟/E2E 不得在产品定义、计划、Todo 编码",
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
            "Todo 批次",
            "pending",
            "in_progress",
            "blocked",
            "done",
            "不得安排冒烟、E2E、打包、发布或里程碑验收",
            "明确拒绝使用模拟实现、桩实现、占位内容、脚手架、源码片段和开发预览作为替代品",
            "返回 `$implement-change` 的回流路径",
        ),
        SKILLS_ROOT / "implement-change" / "SKILL.md": (
            "parallel_worktree_subagents",
            "$run-parallel-worktrees",
            "单元/回归测试",
            "即使项目策略启用了冒烟或 E2E，也不得在本 Skill 中执行",
            "当前批次仍有可执行的非 `done` Todo 时必须继续处理",
            "重开或新增对应的具体 Todo",
            "返回本 Skill",
        ),
        SKILLS_ROOT / "verify-delivery" / "SKILL.md": (
            "候选批次中的每个 Todo 均为 `done`",
            "拒绝源码片段、模拟实现、桩实现、占位内容、中性脚手架、开发预览",
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
        ),
        ENGINEERING_RULES: (
            "### 5.3 Todo 开发与验证里程碑分层",
            "Todo 开发循环必须运行非空单元测试",
            "任一 Todo 非 `done` 时禁止进入验证里程碑",
            "模拟实现、测试替身、占位页面、中性脚手架",
            "重开或新增具体 Todo 并返回实现",
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
        ),
        UPGRADE_SKILL / "SKILL.md": (
            ".harness/upstream-lock.json",
            "试运行",
            "复核每一种分类",
            "protected",
            "merge-sections",
            "升级 Todo 循环期间不得运行冒烟或 E2E",
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

def validate_stale_fragments(errors: list[str], paths: tuple[Path, ...]) -> None:
    """拒绝旧接口、Git 或协作触发规则重新进入指定当前事实源。"""
    stale_fragments = (
        "每个会修改仓库或执行交付工作的任务",
        "Before substantive execution of each repository-changing or delivery task",
        "current repository-changing or delivery task",
        "仅在产品定义或范围设计、实施计划设计，以及代码或实现变更阶段",
        "仅在产品定义/范围设计、实施计划设计和代码/实现变更阶段",
        "Before substantive product/scope design, implementation planning, or code/implementation work",
        "授权只对当前任务有效",
        "选择只对当前任务有效",
        "不得跨任务继承",
        "最小只读冒烟",
        "所有 Agent-first 项目必须证明 CLI 闭环",
        "CLI 永远是最小 MVP",
        "CLI 不可替代",
        "建立可测试的 CLI 与结构化输出契约",
        "若包含 MCP，CLI 与 MCP 使用同一应用服务和错误模型",
        "实例化不得自动创建嵌套 Git",
        "Git 初始化是另行显式动作",
        "no-auto-commit",
        "do not create a commit",
        "初始化不得自动创建 commit",
        "当前 Harness 根目录的直接子文件夹",
        "<项目标识>-CLI",
        "<项目标识>-MCP",
        "<项目标识>-gui",
    )
    for path in paths:
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        for fragment in stale_fragments:
            if fragment in text:
                fail(
                    errors,
                    f"stale current description in {display_path(path)}: {fragment}",
                )


def validate_current_descriptions(errors: list[str]) -> None:
    """拒绝已被当前接口、Git 与治理规则替代的规范描述重新进入有效事实源。"""
    current_files = (
        ROOT / "README.md",
        ROOT / "AGENTS.md",
        PRODUCT_SPEC,
        PRODUCT_STATUS,
        ROOT / "docs" / "RUST_CLI_TEMPLATE.md",
        ROOT / "docs" / "HARNESS_ENGINEERING.md",
        ROOT / "docs" / "RELEASE.md",
        ENGINEERING_RULES,
        *(path / "SKILL.md" for path in sorted(SKILLS_ROOT.iterdir()) if path.is_dir()),
    )
    validate_stale_fragments(errors, current_files)

    msrv_fragments = {
        PRODUCT_SPEC: (
            "MSRV 1.90.0",
            "最低兼容版本而非精确版本锁",
            "Rust 1.90 MSRV",
        ),
        ROOT / "docs" / "RUST_CLI_TEMPLATE.md": (
            '| MSRV | `1.90.0` |',
            'rust-version = "1.90"',
            "不要求精确等于 1.90.0",
            "必须使用精确 Rust 1.90.0 工具链",
        ),
        ROOT / "docs" / "RELEASE.md": ("最低 Rust 版本 1.90.0",),
        PREREQUISITE_UNIX: ("MIN_RUST_MAJOR=1", "MIN_RUST_MINOR=90"),
        PREREQUISITE_WINDOWS: ("$MinimumRustMajor = 1", "$MinimumRustMinor = 90"),
        PREREQUISITE_TESTS: (
            'rust: str = "1.90.0"',
            'rust="1.89.0"',
            '"1.91.0", "1.97.1", "2.0.0"',
        ),
        RUST_ASSET / "Cargo.toml": ('rust-version = "1.90"',),
        WORKFLOW: (
            "RUSTUP_TOOLCHAIN: 1.90.0",
            "rustup toolchain install 1.90.0",
        ),
    }
    for path, fragments in msrv_fragments.items():
        if not path.is_file():
            fail(errors, f"missing MSRV contract file: {display_path(path)}")
            continue
        text = path.read_text(encoding="utf-8")
        for fragment in fragments:
            if fragment not in text:
                fail(
                    errors,
                    f"Rust 1.90 MSRV contract missing in {display_path(path)}: {fragment}",
                )

    current_skill_files = sorted(
        path
        for path in SKILLS_ROOT.rglob("*")
        if path.is_file()
        and path.suffix.lower() in {".md", ".yaml", ".yml", ".toml", ".py", ".ps1", ".sh"}
    )
    for path in current_skill_files:
        text = path.read_text(encoding="utf-8", errors="replace")
        if "1.85" in text:
            fail(
                errors,
                f"obsolete Rust 1.85 compatibility remains in current Skill content: {display_path(path)}",
            )

def validate_version_contract(errors: list[str]) -> None:
    """确认 Harness 时间版本合法、只有一个事实源且不污染下游版本。"""
    if not VERSION_FILE.is_file():
        fail(errors, f"missing version contract file: {display_path(VERSION_FILE)}")
        return

    version_text = VERSION_FILE.read_text(encoding="utf-8")
    match = re.search(r"当前版本：`(\d{12})`", version_text)
    if not match:
        fail(errors, "Version.md current Harness version must be 12 digits in YYYYMMDDHHMM")
        current_version = "__invalid__"
    else:
        current_version = match.group(1)
        try:
            parsed = datetime.strptime(current_version, "%Y%m%d%H%M").replace(
                tzinfo=ZoneInfo("Asia/Shanghai")
            )
        except ValueError:
            fail(
                errors,
                "Version.md current Harness version is not a valid Shanghai datetime: "
                f"{current_version}",
            )
        else:
            if parsed.strftime("%Y%m%d%H%M") != current_version:
                fail(errors, f"Version.md current Harness version is not canonical: {current_version}")

    required_fragments = {
        VERSION_FILE: (
            f"当前版本：`{current_version}`",
            "时间版本起始值：`202607301002`",
            "旧版本标识：`1.0.0`",
            "版本时区：`Asia/Shanghai`",
            "版本格式：`YYYYMMDDHHMM`",
            "发布状态：Unreleased",
            "唯一事实来源",
            "docs/RELEASE.md",
        ),
        ROOT / "README.md": (
            f"当前版本：{current_version}",
            "上海时区 `YYYYMMDDHHMM`",
            "[`Version.md`](Version.md)",
        ),
        PRODUCT_SPEC: (
            f"当前版本：`{current_version}`",
            "上海时区格式为 `YYYYMMDDHHMM`",
            "唯一事实来源为根 `Version.md`",
        ),
        ROOT / "docs" / "RELEASE.md": (
            f"[`Version.md`](../Version.md) 中记录的 `{current_version}`",
            "`Asia/Shanghai`",
            "`YYYYMMDDHHMM`",
            "模板版本事实来源：根目录 `Version.md`",
            "本文件只维护版本与发布规则",
        ),
        PREPARE_RELEASE_SKILL: (
            "Harness 模板使用根 `Version.md`",
            "`YYYYMMDDHHMM`",
            "`Asia/Shanghai`",
            "不得继承 Harness `Version.md`",
        ),
        INSTANTIATE_SKILL: (
            "仅属于 Harness 的根目录 `Version.md`",
            "根 `Cargo.toml`",
        ),
    }
    for path, fragments in required_fragments.items():
        if not path.is_file():
            fail(errors, f"missing version contract file: {display_path(path)}")
            continue
        text = path.read_text(encoding="utf-8")
        for fragment in fragments:
            if fragment not in text:
                fail(
                    errors,
                    f"version contract missing in {display_path(path)}: {fragment}",
                )

    release_text = (ROOT / "docs" / "RELEASE.md").read_text(encoding="utf-8")
    if "模板版本事实来源：本文件" in release_text:
        fail(errors, "docs/RELEASE.md still claims to be the Harness version fact source")
