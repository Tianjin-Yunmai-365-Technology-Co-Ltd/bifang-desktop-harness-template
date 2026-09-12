"""校验当前事实源不含已淘汰描述和工具链契约。"""

from __future__ import annotations

import re
from pathlib import Path

from .context import *  # noqa: F403


MCP_BASELINE = MCP_SKILL.parent / "references" / "mcp-baseline.md"  # noqa: F405


def validate_unverified_adapter_dependency_contract(errors: list[str]) -> None:
    """锁定 TUI/MCP/GUI 候选版本与真实下游验证证据的边界。"""

    required_fragments = {
        TUI_SKILL: (  # noqa: F405
            "经 registry 元数据筛选的 TUI 候选完整三段下界",
            "在真实 TUI 下游完成最低直接版本解析和测试前保持 `Unverified`",
            "只有实际通过后才把候选称为项目兼容下界",
        ),
        TUI_BASELINE: (  # noqa: F405
            "经 registry 元数据筛选的候选组合",
            "在真实 TUI 下游完成最低直接版本解析和 Rust 1.98.1 测试前保持 `Unverified`",
            "只把实际验证通过的版本写成项目兼容下界",
        ),
        MCP_SKILL: (  # noqa: F405
            "经 registry 元数据筛选的 MCP 候选完整三段下界",
            "在真实 MCP 下游完成最低直接版本解析和 Rust 1.98.1 测试前保持 `Unverified`",
            "只有实际通过后才把候选称为项目 Cargo 兼容下界",
        ),
        MCP_BASELINE: (
            "经过 registry 元数据筛选的候选完整三段下界",
            "在真实 MCP 下游完成最低直接版本解析和 Rust 1.98.1 测试前保持 `Unverified`",
            "只有最低直接版本解析与 Rust 1.98.1 实测通过后才可作为项目 Cargo 兼容下界",
        ),
        REACT_BASELINE: (  # noqa: F405
            "经 registry 元数据、peer 与 engine 筛选的 GUI 前端候选完整三段下界",
            "在真实 GUI 下游完成最低 Node.js/pnpm、lowest-direct 解析、类型检查、非空测试与生产构建前保持 `Unverified`",
            "实际通过后才可成为该项目的兼容下界",
        ),
    }
    for path, fragments in required_fragments.items():
        if not path.is_file():
            fail(errors, f"missing adapter dependency evidence contract: {display_path(path)}")  # noqa: F405
            continue
        text = path.read_text(encoding="utf-8")
        for fragment in fragments:
            if fragment not in text:
                fail(  # noqa: F405
                    errors,
                    "adapter dependency evidence contract missing in "
                    f"{display_path(path)}: {fragment}",  # noqa: F405
                )

    superseded_claims = {
        TUI_SKILL: ("TUI 最低兼容稳定组合及当前完整三段下界为",),  # noqa: F405
        TUI_BASELINE: ("上表是已验证的最低兼容稳定组合",),  # noqa: F405
        MCP_SKILL: ("MCP 最低兼容稳定下界为",),  # noqa: F405
        MCP_BASELINE: ("作为新的 Cargo 兼容下界",),
        REACT_BASELINE: ("当前已核定的 GUI 前端直接兼容下界如下",),  # noqa: F405
    }
    for path, fragments in superseded_claims.items():
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        for fragment in fragments:
            if fragment in text:
                fail(  # noqa: F405
                    errors,
                    "unverified adapter dependency baseline is overstated in "
                    f"{display_path(path)}: {fragment}",  # noqa: F405
                )


def validate_dependency_evidence_contract(
    errors: list[str],
    product_spec: Path = PRODUCT_SPEC,  # noqa: F405
    readme: Path = ROOT / "README.md",  # noqa: F405
    engineering_rules: Path = ROOT / "docs" / "ENGINEERING_RULES.md",  # noqa: F405
) -> None:
    """区分已实测 CLI fixture 与仍待真实下游证明的候选下界。"""

    if not product_spec.is_file():
        fail(errors, f"missing dependency evidence contract: {display_path(product_spec)}")  # noqa: F405
        return
    text = product_spec.read_text(encoding="utf-8")
    required = (
        "依赖清单以完整三段、可在项目最低工具链证明的兼容下界为目标",
        "中性 Rust CLI fixture 的 Cargo 直接依赖已经在 Rust `1.98.1` 上完成最低直接版本解析",
        "`rmcp 3.3.0`、TUI 和 GUI/React 的版本数值仅为截至 2026-09-12 经 registry metadata、peer 与 engine 筛选的候选完整三段下界",
        "继续保持 `Unverified`",
        "实例化真实下游时必须在项目最低 Rust/Node.js/pnpm 工具链执行最低直接版本解析",
        "成功后才能成为该项目的兼容下界",
        "中性 Rust CLI fixture 的 Cargo 依赖已在最低 Rust 工具链实测；TUI/MCP/GUI 数值仍为 `Unverified` 候选",
    )
    for fragment in required:
        if fragment not in text:
            fail(  # noqa: F405
                errors,
                f"dependency evidence contract missing in {display_path(product_spec)}: {fragment}",  # noqa: F405
            )
    overclaims = (
        "本次在 Rust `1.98.1`、Node.js `>=24.21.0` 与 pnpm `>=12.4.1` 门禁下验证后，把 MCP",
        "前端/Rust 直接依赖统一表达为经过验证的最低兼容范围",
    )
    for fragment in overclaims:
        if fragment in text:
            fail(  # noqa: F405
                errors,
                f"unverified dependency baseline is overstated in {display_path(product_spec)}: {fragment}",  # noqa: F405
            )

    environment_heading = "### 主流环境下界、标准当前用户安装与最新兼容稳定选择"
    environment_start = text.find(environment_heading)
    environment_end = text.find("\n### ", environment_start + len(environment_heading))
    environment_text = (
        text[environment_start:environment_end]
        if environment_start >= 0 and environment_end >= 0
        else text[environment_start:]
        if environment_start >= 0
        else ""
    )
    for fragment in ("经过验证", "本次验证后"):
        if fragment in environment_text:
            fail(  # noqa: F405
                errors,
                f"unverified dependency baseline is overstated in {display_path(product_spec)}: {fragment}",  # noqa: F405
            )

    positive_claims = (
        r"(?:rmcp|TUI|MCP|GUI(?:/React)?).{0,100}(?:已经|均已|全部已|已完成).{0,16}(?:验证|实测|通过)",
        r"(?:已经|均已|全部已|已完成).{0,16}(?:验证|实测|通过).{0,100}(?:rmcp|TUI|MCP|GUI(?:/React)?)",
        r"(?:所有|全部).{0,20}(?:直接依赖|依赖).{0,24}(?:已经|均已|全部已|已完成|已).{0,16}(?:验证|实测|通过)",
    )
    for pattern in positive_claims:
        if re.search(pattern, environment_text, flags=re.DOTALL):
            fail(  # noqa: F405
                errors,
                f"unverified dependency baseline is overstated in {display_path(product_spec)}: {pattern}",  # noqa: F405
            )

    supporting_contracts = {
        readme: (
            "依赖清单以完整三段、可在项目最低工具链证明的兼容下界为目标",
            "当前只有中性 Rust CLI fixture 的 Cargo 直接依赖已在 Rust 1.98.1 上完成最低直接版本解析",
            "TUI、MCP、GUI/React 数值仍是经 registry metadata、peer 与 engine 筛选的候选",
            "保持 `Unverified`",
        ),
        engineering_rules: (
            "只有这些真实项目检查通过后才可称为“经过验证”",
            "尚无真实下游的 TUI/MCP/GUI 模板数值只能作为 registry metadata、peer 与 engine 筛选后的候选并标记 `Unverified`",
        ),
    }
    forbidden_supporting_claims = {
        readme: ("依赖清单保存经过验证的最低兼容稳定版本范围",),
        engineering_rules: ("直接依赖和受管工具的清单必须表达经过验证的最低兼容范围",),
    }
    for path, fragments in supporting_contracts.items():
        if not path.is_file():
            fail(errors, f"missing dependency evidence contract: {display_path(path)}")  # noqa: F405
            continue
        source = path.read_text(encoding="utf-8")
        for fragment in fragments:
            if fragment not in source:
                fail(  # noqa: F405
                    errors,
                    f"dependency evidence contract missing in {display_path(path)}: {fragment}",  # noqa: F405
                )
        for fragment in forbidden_supporting_claims[path]:
            if fragment in source:
                fail(  # noqa: F405
                    errors,
                    f"unverified dependency baseline is overstated in {display_path(path)}: {fragment}",  # noqa: F405
                )


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
        "选择 GUI 时还包括六项能力",
        "GUI 下游另输出包含七项最终配置",
        "结构检查解析七项 profile",
        "GUI 选择后必须完成七项专门问询",
        "固定通过七项 profile-aware",
        "首次真实 GUI 下游对七项初始化组合",
        "{task}-{id}-{feature}",
        "{任务}-{ID}-{摘要}",
        "状态不得进入标题",
        "状态不入标题",
        "Session 收尾契约至多调用一次",
        "普通 Session 收尾命名",
        "{Task}|{序号}|{功能摘要}{当前进度}",
        "内部 agent 不套用",
        "内部 Subagent、agent thread 和内部单元 Worktree 不执行该操作",
        "只更新进度后缀",
        "稳定三部分与合法四态后缀",
        "普通当前 Session 没有可复用值时从 `1` 开始",
        "当前 Session 没有可复用序号时使用 `1`",
        "分别按该批次顺序从 `1` 分配",
        "左侧 Task 与 Subagent 批次分别按派发顺序从 `1` 分配",
        "按当前协调批次分配稳定序号",
        "普通 Session 无既有值时从 `1` 开始",
        "左侧 Task 与 Subagent 各自按当前派发批次顺序从 `1` 分配",
        "序号只在当前 Session 或同一协调/派发批次内稳定",
        "{序号}|{Task简述}|{当前进度} |{功能摘要}",
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
    validate_dependency_evidence_contract(errors)
    validate_unverified_adapter_dependency_contract(errors)
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

    gui_plugin_product_fragments = (
        "HARNESS-FEAT-GUI-PLUGIN-CAPABILITY-MODULES",
        "`os`（system-locale）、updater、window-state 是不询问的三项 Rust-only 固定基线，dialog 是不询问的固定 WebView 基线",
        "八项条件能力的启用/禁用",
        "包含九项最终配置、三项 Rust-only 固定基线、dialog 固定 WebView 基线",
        "`deep_link = enabled` 必须同时有 `single_instance = enabled`",
    )
    if not PRODUCT_SPEC.is_file():
        fail(errors, f"missing GUI plugin product contract: {display_path(PRODUCT_SPEC)}")
    else:
        product_spec_text = read_text_cached(PRODUCT_SPEC)
        for fragment in gui_plugin_product_fragments:
            if fragment not in product_spec_text:
                fail(
                    errors,
                    "GUI plugin product contract missing in "
                    f"{display_path(PRODUCT_SPEC)}: {fragment}",
                )

    msrv_fragments = {
        PRODUCT_SPEC: (
            "MSRV（即 MSRV 1.98.1）",
            "最低兼容版本而非精确版本锁",
            "Rust 1.98.1 MSRV",
        ),
        ROOT / "docs" / "RUST_CLI_TEMPLATE.md": (
            '| MSRV | `1.98.1` |',
            'rust-version = "1.98.1"',
            "不要求精确等于 1.98.1",
            "使用该声明的最低 Rust 工具链",
        ),
        ROOT / "docs" / "RELEASE.md": ("最低 Rust 版本 1.98.1",),
        PREREQUISITE_UNIX: (
            "MIN_RUST_MAJOR=1",
            "MIN_RUST_MINOR=98",
            "MIN_RUST_PATCH=1",
        ),
        PREREQUISITE_WINDOWS: (
            "$MinimumRustMajor = 1",
            "$MinimumRustMinor = 98",
            "$MinimumRustPatch = 1",
        ),
        PREREQUISITE_TESTS: (
            'rust: str = "1.98.1"',
            'rust="1.98.0"',
            '"1.99.0"',
            '"2.0.0"',
        ),
        PREREQUISITE_WINDOWS_TESTS: (
            'rust: str = "1.98.1"',
            '("1.98.0", 20, "upgrade-required")',
            '("1.99.0", 0, "passed")',
            '("2.0.0", 0, "passed")',
        ),
        RUST_ASSET / "Cargo.toml": ('rust-version = "1.98.1"',),
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
                    f"Rust 1.98.1 MSRV contract missing in {display_path(path)}: {fragment}",
                )

    minimum_version_fragments = {
        ENGINEERING_RULES: (
            "完整三段表达可验证的兼容下界",
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
        TUI_SKILL: ("TUI 候选完整三段下界", "direct-minimal-versions", "`Unverified`"),
        TUI_BASELINE: ("registry 元数据筛选的候选组合", "最低直接版本解析", "`Unverified`"),
        MCP_SKILL: ("MCP 候选完整三段下界", "最低直接版本解析", "`Unverified`"),
        MCP_BASELINE: ("候选完整三段下界", "最低直接版本解析", "`Unverified`"),
        GUI_SKILL: ("最低兼容稳定范围", "最低直接版本解析"),
        REACT_BASELINE: (
            "GUI 前端候选完整三段下界",
            "`Unverified`",
            "engines.node",
            "engines.pnpm",
            "resolutionMode: lowest-direct",
        ),
        ENVIRONMENT_SKILL / "SKILL.md": (
            ">=24.21.0",
            ">=12.4.1",
            "upgrade-required",
            "不得降低项目门槛",
        ),
        ENVIRONMENT_SKILL / "references" / "development-environment-gates.md": (
            ">=24.21.0",
            ">=12.4.1",
            ">=0.23.1, <0.24.0",
            "upgrade-required",
            "不得降低最低门禁",
        ),
        PREREQUISITE_UNIX: (
            "NODE_REQUIREMENT='>=24.21.0'",
            "PNPM_REQUIREMENT='>=12.4.1'",
            "PNPM_INSTALL_REQUIREMENT='pnpm@>=12.4.1'",
        ),
        PREREQUISITE_WINDOWS: (
            '$NodeRequirement = ">=24.21.0"',
            '$PnpmRequirement = ">=12.4.1"',
            '$PnpmInstallRequirement = "pnpm@>=12.4.1"',
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

    dependency_floor_fragments = {
        RUST_ASSET / "Cargo.toml": (
            'assert_cmd = "2.2.2"',
            'clap = { version = "4.6.6"',
            'jiff = "0.2.35"',
            'serde = { version = "1.0.229"',
            'serde_json = "1.0.151"',
            'tokio = { version = "1.53.1"',
        ),
        MCP_SKILL: ("`rmcp 3.3.0`",),
        REACT_BASELINE: (
            "`react` / `react-dom` | `^19.3.0`",
            "`@mantine/core` / `@mantine/hooks` | `^9.6.1`",
            "`@tanstack/react-router` | `^1.170.35`",
            "`@tanstack/router-plugin` | `^1.168.37`",
            "`i18next` | `^26.4.2`",
            "`react-i18next` | `^17.0.13`",
            "`vite` | `^8.3.0`",
            "`eslint` | `^10.10.0`",
            "`typescript-eslint` | `^8.70.0`",
            "`@types/node` | `^24.13.4`",
            "`@types/react` / `@types/react-dom` | `^19.3.0`",
            "`@testing-library/dom` | `^10.4.1`",
            "`@testing-library/user-event` | `^14.6.7`",
            "`jsdom` | `^29.0.1`",
            "不得升级到会重新排除 Node.js 25.x",
        ),
    }
    for path, fragments in dependency_floor_fragments.items():
        if not path.is_file():
            fail(errors, f"missing dependency-floor contract file: {display_path(path)}")
            continue
        text = path.read_text(encoding="utf-8")
        for fragment in fragments:
            if fragment not in text:
                fail(
                    errors,
                    f"dependency-floor contract missing in {display_path(path)}: {fragment}",
                )

    superseded_version_fragments = (
        "pnpm@latest",
        "rustup toolchain install 1.90.0",
        "^20.19.0 || >=22.12.0",
        "pnpm@^10.0.0",
        ">=0.22.0, <0.24.0",
        "^30.0.1",
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
