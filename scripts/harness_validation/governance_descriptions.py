"""校验当前事实源不含已淘汰描述和工具链契约。"""

from __future__ import annotations

from pathlib import Path

from .context import *  # noqa: F403


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
        "每份活动工作计划必须包含 `Todo` 批次和对应验证里程碑",
        "每轮 Todo 开发必须执行非空单元测试",
        "每个已确认需求形成当日独立 ADR 条目",
        "一次性要求用户分别为 Superpowers",
        "不得为缺失答案设置默认值或遗留 `pending`",
        "新增、变化、修复、移除、安全事项",
        "规格转为 `Approved` 前必须存在真实日期记录",
    )
    for path in paths:
        if not path.is_file():
            continue
        text = read_text_cached(path)
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
        *(path for path in sorted((ROOT / "docs" / "harness_engineering").glob("*.md"))),
        ROOT / "docs" / "RELEASE.md",
        ENGINEERING_RULES,
        AGENT_POLICY,
        PRODUCT_SPEC_DIR / "README.md",
        PRODUCT_STATUS_DIR / "README.md",
        WORK_PLAN_DIR / "README.md",
        ADR_DIR / "README.md",
        CHANGELOG_DIR / "README.md",
        WORK_PLAN,
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
