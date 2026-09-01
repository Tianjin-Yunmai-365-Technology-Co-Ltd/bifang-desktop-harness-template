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
        "显式构建若缺少与当前接口、MSRV、前端策略、宿主和目标匹配的可复用证据",
        "显式构建需要不可复用的工具链证据",
        "显式构建的环境证据不可复用时才检查环境",
        "缺少可复用证据时才调用 `$desktop-check-development-environment`",
        "每次回复只询问一个最靠前的 `待询问`",
        "每轮只询问一个最靠前的未解析字段",
        "复用表单中已经按需逐项确认的五项值",
        "最终五项配置不得缺失或残留 `pending`",
        "五项初始化配置",
        "依次解析系统托盘、关于页、赞助页、单实例的启用/禁用",
        "表单、环境门禁、脚手架编写、测试和一次性裁剪阶段都不检查 Git",
        "Git 只在真实基线提交前即时检查和设置",
        "不会提前检查或设置 Git",
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
        INSTANTIATE_FORM,
        *(path / "SKILL.md" for path in sorted(SKILLS_ROOT.iterdir()) if path.is_dir()),
    )
    validate_stale_fragments(errors, current_files)

    msrv_fragments = {
        PRODUCT_SPEC: (
            "MSRV（即 MSRV 1.95.0）",
            "最低兼容版本而非精确版本锁",
            "Rust 1.95 MSRV",
        ),
        ROOT / "docs" / "RUST_CLI_TEMPLATE.md": (
            '| MSRV | `1.95.0` |',
            'rust-version = "1.95"',
            "不要求精确等于 1.95.0",
            "使用该声明的最低 Rust 工具链",
        ),
        ROOT / "docs" / "RELEASE.md": ("最低 Rust 版本 1.95.0",),
        PREREQUISITE_UNIX: ("MIN_RUST_MAJOR=1", "MIN_RUST_MINOR=95"),
        PREREQUISITE_WINDOWS: ("$MinimumRustMajor = 1", "$MinimumRustMinor = 95"),
        PREREQUISITE_TESTS: (
            'rust: str = "1.95.0"',
            'rust="1.94.9"',
            '"1.96.0"',
        ),
        RUST_ASSET / "Cargo.toml": ('rust-version = "1.95"',),
        WORKFLOW: (
            "读取项目最低 Rust 版本",
            'environment.write(f"RUSTUP_TOOLCHAIN={version}\\n")',
            'rustup toolchain install "$RUSTUP_TOOLCHAIN"',
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
                    f"Rust 1.95 MSRV contract missing in {display_path(path)}: {fragment}",
                )

    minimum_version_fragments = {
        ENGINEERING_RULES: (
            "最低兼容范围",
            "当前最新非预发布候选",
            "锁文件与兼容要求职责分离",
        ),
        PRODUCT_SPEC: (
            "最新兼容稳定选择",
            "优先选择 registry 当前最新兼容稳定版",
        ),
        ROOT / "docs" / "RUST_CLI_TEMPLATE.md": (
            "最低兼容版本策略",
            "direct-minimal-versions",
            "resolutionMode: lowest-direct",
        ),
        CLI_SKILL: ("完整三段 Cargo 兼容下界", "最低直接版本解析"),
        TUI_SKILL: ("最低兼容稳定组合", "direct-minimal-versions"),
        TUI_BASELINE: ("最低兼容稳定组合", "最低直接版本解析"),
        MCP_SKILL: ("最低兼容稳定下界", "最低直接版本解析"),
        GUI_SKILL: ("最低兼容稳定范围", "最低直接版本解析"),
        REACT_BASELINE: (
            "最低兼容稳定范围",
            "engines.node",
            "engines.pnpm",
            "resolutionMode: lowest-direct",
        ),
        ENVIRONMENT_SKILL / "SKILL.md": (
            "^24.15.0 || >=26.0.0",
            ">=11.24.0",
            "最新兼容稳定版",
        ),
        ENVIRONMENT_SKILL / "references" / "development-environment-gates.md": (
            "^24.15.0 || >=26.0.0",
            ">=11.24.0",
            ">=0.23.1, <0.24.0",
            "当前最新兼容稳定版",
        ),
        PREREQUISITE_UNIX: (
            "NODE_REQUIREMENT='^24.15.0 || >=26.0.0'",
            "PNPM_REQUIREMENT='>=11.24.0'",
        ),
        PREREQUISITE_WINDOWS: (
            '$NodeRequirement = "^24.15.0 || >=26.0.0"',
            '$PnpmRequirement = ">=11.24.0"',
        ),
        MACOS_XWIN_GATE: ("CARGO_XWIN_REQUIREMENT='>=0.23.1, <0.24.0'",),
        WORKFLOW: (
            "读取项目最低 Rust 版本",
            "RUSTUP_TOOLCHAIN={version}",
        ),
    }
    for path, fragments in minimum_version_fragments.items():
        if not path.is_file():
            fail(errors, f"missing minimum-version contract file: {display_path(path)}")
            continue
        text = path.read_text(encoding="utf-8")
        for fragment in fragments:
            if fragment not in text:
                fail(
                    errors,
                    f"minimum-version contract missing in {display_path(path)}: {fragment}",
                )

    superseded_version_fragments = (
        "pnpm@latest",
        "rustup toolchain install 1.90.0",
        "^20.19.0 || >=22.12.0",
        "pnpm@^10.0.0",
        ">=0.22.0, <0.24.0",
    )
    for path in minimum_version_fragments:
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        for fragment in superseded_version_fragments:
            if fragment in text:
                fail(
                    errors,
                    f"superseded exact/latest version rule remains in {display_path(path)}: {fragment}",
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
