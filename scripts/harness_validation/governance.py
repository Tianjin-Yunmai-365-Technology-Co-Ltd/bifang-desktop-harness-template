"""校验工程治理、并行协作、当前描述与版本事实契约。"""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from .context import *  # noqa: F403

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
        ROOT / "docs" / "AGENT_POLICY.md": ("superpowers: disabled",),
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
        TUI_SKILL: ("engineering rules",),
        WEB_SKILL: ("engineering rules",),
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
    """校验仅编码阶段并行授权、前台协作、安全 Worktree 与验证分层契约。"""
    required_fragments = {
        ROOT / "AGENTS.md": (
            "仅在代码或实现变更阶段",
            "产品定义、范围设计、实施计划设计",
            "验证复核、构建、发布准备、交付工作",
            "授权只对当前任务有效",
            "$run-parallel-worktrees",
            "独立 Git Worktree",
            "启动、阻塞、阶段完成、整合和验证",
            "同步等待全部必需结果",
            "重叠写入必须转为串行",
            "每轮开发必须执行非空单元测试",
            "用户发起最终产物构建或发布准备",
            "不得在日常开发、普通交付复核或发布链路修改中自动触发",
            "失败、超时、取消或选择后未执行均阻断",
        ),
        ROOT / "README.md": (
            "仅在代码或实现变更阶段",
            "产品定义、范围设计、实施计划设计",
            "验证复核、构建、发布准备和交付阶段不询问",
            "$run-parallel-worktrees",
            "保持单 Agent",
            "开发轮次运行非空单元测试和变更相关验证",
            "用户发起最终产物构建或发布准备",
            "未启用且没有产品/渠道硬要求时记录 `Not run`",
        ),
        PARALLEL_SKILL / "SKILL.md": (
            "Do not inherit approval from another task",
            "Do not ask during product definition, scope design, implementation planning",
            "verification review, build, release preparation, delivery work",
            "at least two independent scopes",
            "Show the user the work-unit map",
            "Wait synchronously for every required Subagent result",
            "Do not finish the main task",
            "never auto-stash or auto-commit",
            "deliberately retains the branch",
            "only when the user initiates a final-artifact build or release preparation",
            "Heavy or interactive acceptance additionally requires",
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
            "current worktree with one Agent",
            "Do not ask for or start parallel Worktree + Subagent mode during planning",
            "Separate the development-loop gate from release acceptance",
        ),
        SKILLS_ROOT / "implement-change" / "SKILL.md": (
            "coding-stage collaboration gate",
            "$run-parallel-worktrees",
            "non-empty unit tests plus change-related",
            "A delivery-status review or release-path change runs only",
            "Enter release-stage execution only when the user initiates",
            "only when the user also requests delivery acceptance",
        ),
        SKILLS_ROOT / "define-product" / "SKILL.md": (
            "current worktree with one Agent",
            "Do not ask for or start parallel Worktree + Subagent mode during product definition",
        ),
        SKILLS_ROOT / "verify-delivery" / "SKILL.md": (
            "only an explicit build/release request starts real release gates",
            "implementation-only",
            "return to `$implement-change` development-loop verification",
            "Heavy acceptance such as Computer Use E2E",
            "never automatic here",
        ),
        E2E_SKILL: (
            "explicitly selected release-stage",
            "current final-artifact build or release task",
            "`enabled` by the user or `required`",
            "report the check as `Not run`",
        ),
        PREPARE_RELEASE_SKILL: (
            "user explicitly intends to prepare a release",
            "development-loop evidence alone cannot satisfy",
            "release-stage gate selection before build/package start",
        ),
        ENGINEERING_RULES: (
            "### 5.3 开发验证与发布验收分层",
            "每轮开发必须运行非空单元测试",
            "日常开发默认不重复运行发布级整体验收",
            "修改发布链路时运行相应的单元、静态和隔离契约检查",
            "只有用户发起最终产物构建或发布准备时",
            "失败、超时、取消或选择后未执行均为门禁失败",
        ),
        ROOT / "docs" / "RELEASE.md": (
            "## 发布构建与手动验收顺序",
            "仅要求复核已有交付证据时",
            "所有 `required` 或 `enabled` 项在打包前通过",
            "历史开发证据不能替代候选源码上的重新验收",
            "每轮普通开发不重复最终产物",
        ),
        ROOT / "docs" / "VERIFICATION.md": (
            "开发轮次记录非空单元测试和变更相关验证",
            "开发证据不得写成发布就绪",
            "失败、超时、取消或未执行都属于阻断",
            f"{len(EXPECTED_SKILLS)} 个 Skills",
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
        ROOT / "docs" / "RELEASE.md": ("最低版本 Rust 1.90.0",),
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
            "The Harness template uses root `Version.md`",
            "`YYYYMMDDHHMM`",
            "`Asia/Shanghai`",
            "must not inherit the Harness `Version.md`",
        ),
        INSTANTIATE_SKILL: (
            "Harness-only root `Version.md`",
            "root `Cargo.toml`",
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
