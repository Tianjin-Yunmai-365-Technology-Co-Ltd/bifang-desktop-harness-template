"""校验初始化 Skills、环境门禁、Rust asset 与 workspace 依赖契约。"""

from __future__ import annotations

import os
import subprocess
import tomllib
from pathlib import Path

from .context import *  # noqa: F403


def source_file_has_executable_mode(path: Path) -> bool:
    """按宿主可观测语义确认 Unix 脚本的可执行位。"""

    if os.name != "nt":
        return bool(path.stat().st_mode & 0o111)

    try:
        relative_path = path.resolve().relative_to(ROOT.resolve()).as_posix()  # noqa: F405
    except (OSError, ValueError):
        return False

    result = subprocess.run(
        ["git", "ls-files", "--stage", "--", relative_path],
        cwd=ROOT,  # noqa: F405
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode != 0:
        return False
    entries = [line for line in result.stdout.splitlines() if line.strip()]
    return len(entries) == 1 and entries[0].split(maxsplit=1)[0] == "100755"

def validate_initialization_contract(errors: list[str]) -> None:
    """校验环境门禁、Rust asset 与 workspace 依赖继承的初始化契约。"""
    skill_file = INITIALIZE_SKILL / "SKILL.md"
    gate_file = ENVIRONMENT_SKILL / "references" / "development-environment-gates.md"
    rust_baseline = ROOT / "docs" / "RUST_CLI_TEMPLATE.md"

    required_fragments = {
        INSTANTIATE_SKILL: (
            "完整目标项目目录路径",
            "目标目录是必填项",
            "ASCII `snake_case` 项目标识",
            "产品目的、核心输入/输出",
            "可以继续保持未确定",
            "解析后的目标目录基本名称",
            "通过符号链接解析到任何禁止位置的路径",
            "以免将 Harness 复制到其内部目标时发生递归",
            "唯一项目根目录",
            "git --version",
            "git init --initial-branch=main .",
            "git rev-parse --show-toplevel",
            "git symbolic-ref --short HEAD",
            "git rev-parse --verify HEAD",
            "git status --porcelain=v1 --untracked-files=all",
            "git remote",
            "独立的嵌套仓库边界",
            "docs/adr/",
            "docs/changelog/",
            "docs/product_spec/",
            "docs/work_plan/",
            "历史验证正文",
            "不得仅为实例化创建产品规格、工作计划、ADR、变更记录或 `docs/VERIFICATION.md`",
            "创建恰好一个本地基线提交",
            "不得在经过选择性复制的目标目录中运行模板级 Harness 验证器",
            "LICENSE.zh-CN.md",
            "LICENSE.en.md",
            "逐字节复制两份许可证文件",
            "$rename-project-identity",
            "整个受维护的目标树",
            "Applicable Project Name",
            "所有其他法律文本必须与复制后的源文件保持字节等价",
            "保留 `$rename-project-identity` 供未来已批准的产品改名使用",
            "$run-parallel-worktrees",
            "$upgrade-harness",
            "推荐敏捷预设",
            "自定义",
            "superpowers: enabled",
            "parallel_worktree_subagents: enabled",
            "milestone_smoke: enabled",
            "milestone_e2e: disabled",
            "Harness 源字段值不是下游确认",
            "不得静默采用预设",
            "一次原子写入",
            "不得再次询问预设或各字段",
            "仅属于 Harness 的根目录 `Version.md`",
            "根 `Cargo.toml`",
        ),
        SKILLS_ROOT / "instantiate-project" / "agents" / "openai.yaml": (
            "在明确目标目录创建拥有独立 Git 根的干净下游项目",
            "$instantiate-project",
            "不继承 Harness 开发记忆",
        ),
        skill_file: (
            "$check-development-environment",
            "只有包含 `GUI` 的选择才增加阻断性的 Node.js 和 pnpm 门禁",
            "完整删除 `.agents/skills/instantiate-project/` 和 `.agents/skills/initialize-rust-project/`",
            "完整删除 `.agents/skills/instantiate-project/` 和 `.agents/skills/initialize-rust-project/`",
            "## Skills 地图",
            "## 约束地图",
            "workspace = true",
            "只能从 `CLI`、`TUI`、`MCP` 和 `GUI` 中选择",
            "如果用户没有作出选择，则记录 `CLI`",
            "不得静默附加 CLI",
            "docs/AGENT_POLICY.md",
            "推荐敏捷预设",
            "自定义",
            "superpowers: enabled",
            "parallel_worktree_subagents: enabled",
            "milestone_smoke: enabled",
            "milestone_e2e: disabled",
            "Harness 源字段值不是下游确认",
            "不得静默采用推荐值",
            "一次原子写入",
            "只验证并复用，不再次询问",
            "$add-cli-adapter",
            "$add-tui-adapter",
            "$add-mcp-adapter",
            "$add-gui-adapter",
            "_cli",
            "_tui",
            "中性脚手架状态",
            "productDefinitionRequired=true",
            "任何适配器首次替换中性状态",
            "都必须进入里程碑路径",
            "$define-product",
            "Ratatui + tui-realm + tui-realm-stdlib",
            "React + TypeScript + Mantine UI + TanStack Router + TanStack Query + Jotai",
            "git --version",
            "git init --initial-branch=main .",
            "git rev-parse --show-toplevel",
            "git status --porcelain=v1 --untracked-files=all",
            "git remote",
            "chore: initialize project",
            "用户现有 Git 身份",
            "不得伪造身份",
            "docs/adr/",
            "docs/changelog/",
            "docs/product_spec/",
            "docs/work_plan/",
            "不创建或更新 `docs/VERIFICATION.md`",
            "`docs/VERIFICATION.md` 仍然不存在",
            "当前项目根目录必须同时是唯一的下游根目录及其独立 Git 顶层目录",
            "项目根目录 `.gitignore`",
            "根锚定的 `/release/`",
            "Tokio current-thread 异步入口",
            "Tauri 由 Tokio 支撑的异步运行时",
            "LICENSE.zh-CN.md",
            "LICENSE.en.md",
            "保留继承的两份非开源企业专有商业许可证文件",
            "$rename-project-identity",
            "$run-parallel-worktrees",
            "$upgrade-harness",
            "选择 GUI 时保留 `$build-tauri-release`",
            "中性初始化期间不得运行冒烟或 E2E",
            "仍包含旧 Harness 身份",
        ),
        ENVIRONMENT_SKILL / "SKILL.md": (
            "首次修改代码的开发任务前",
            "Rust 始终是阻断门禁",
            "仅当已记录的接口选择包含 `GUI` 时，Node.js 和 pnpm 才是阻断门禁",
            "必须把两者都报告为 `not-required`",
            "由中性 `$initialize-rust-project` 调用时",
            "绝不得创建或更新 `docs/VERIFICATION.md`",
            "本 Skill 及其脚本在下游初始化后必须保留",
            "scripts/macos-tauri-xwin-gates.sh --install-missing",
            "不自动安装 Homebrew",
            "只证明交叉工具可用，不证明 Windows 运行时",
        ),
        GUI_IDENTITY_SKILL: (
            "应用展示名称",
            "主窗口标题",
            "自动生成",
            "确定性备选方案",
            "用户上传",
            "1024×1024",
            "docs/GUI_APP_PROFILE.md",
        ),
        SKILLS_ROOT / "define-product" / "SKILL.md": (
            "中性 scaffold 约束",
            "$plan-change",
            "$implement-change",
        ),
        SKILLS_ROOT / "implement-change" / "SKILL.md": (
            "Git 根/分支和工作区",
            "保留用户修改",
            "$check-development-environment",
        ),
        SKILLS_ROOT / "verify-delivery" / "SKILL.md": (
            "源码提交",
            "版本/构建标识",
            "Unverified",
        ),
        SKILLS_ROOT / "build-rust-release" / "SKILL.md": (
            "下游项目根同时是其独立 Git 顶层目录",
            "`HEAD` 解析到真实源码提交",
        ),
        SKILLS_ROOT / "prepare-release" / "SKILL.md": (
            "独立 Git 顶层目录",
            "尚未生成的 `HEAD`",
        ),
        MCP_SKILL: (
            "不得要求另选目标目录",
            "<project-id>_mcp",
            "Tokio current-thread 异步入口",
            "测量确认的 CPU 密集工作",
            "不得用同步 I/O、休眠、进程等待或 CPU 密集工具工作阻塞 Tokio stdio 运行时",
        ),
        CLI_SKILL: (
            "CLI 是可选项",
            "<project-id>_cli",
            "docs/CLI_CONTRACT.md",
            "Tokio current-thread 异步入口",
            "测量确认的 CPU 密集工作",
            "不得用同步 I/O、休眠、进程等待或 CPU 密集循环阻塞异步运行时",
        ),
        TUI_SKILL: (
            "<project-id>_tui",
            "不要求 CLI",
            "Ratatui",
            "tui-realm",
            "tui-realm-stdlib",
            "硬规则例外",
            "references/tui-baseline.md",
            "Tokio current-thread 异步入口",
            "测量确认的 CPU 密集工作",
            "不得用同步 I/O、休眠、进程等待或 CPU 密集的渲染/数据工作阻塞 Tokio 运行时",
        ),
        TUI_BASELINE: (
            "Ratatui",
            "tui-realm",
            "tui-realm-stdlib",
            "最新兼容稳定组合",
            "硬规则例外 ADR",
            "Tokio current-thread 异步入口",
            "测量确认的 CPU 密集工作",
        ),
        REACT_BASELINE: (
            "React 和 TypeScript",
            "Mantine UI",
            "TanStack Router",
            "TanStack Query",
            "Jotai",
            "不得把 Query 结果镜像到 Jotai",
            "最新、彼此兼容稳定版本",
        ),
        GUI_SKILL: (
            "Tauri 基于 Tokio 的单例异步运行时",
            "普通 `async fn` Tauri 命令",
            "测量确认的 CPU 密集工作",
            "缺少完整签名公证条件且渠道允许时",
            "显式生成 `unsigned` 候选",
            "签名、公证与 stapling 必须作为一个阶段完成",
            "$build-tauri-release",
            "不得要求另选目标目录",
            "<project-id>_gui",
            "React、TypeScript、Mantine UI、TanStack Router、TanStack Query 与 Jotai",
            "硬规则例外",
            "references/react-frontend-baseline.md",
            "$prepare-gui-app-identity",
            "docs/GUI_APP_PROFILE.md",
        ),
        GUI_BASELINE: (
            "基于 Tokio 的单例异步运行时",
            "普通 `async fn`",
            "缺少签名身份",
            "使用 `--no-sign` 并记录 unsigned",
            "完成公证与 ticket stapling",
            "$build-tauri-release",
            "cargo-xwin + NSIS",
            "Windows runtime 保持为 `Unverified`",
            "Tauri 2",
            "React + TypeScript",
            "Mantine UI",
            "TanStack Router",
            "TanStack Query",
            "Jotai",
            "Tauri 2 和固定 React 前端技术栈是硬规则",
        ),
        E2E_SKILL: ("Computer Use", "完整真实产物", "最高风险失败路径"),
        AGENT_POLICY: (
            "superpowers:",
            "parallel_worktree_subagents:",
            "milestone_smoke:",
            "milestone_e2e:",
            "`superpowers:`",
        ),
        gate_file: (
            "scripts/development-environment-gates.sh --install-missing",
            "scripts/development-environment-gates.ps1",
            "rustup --version",
            "node --version",
            "pnpm --version",
            "not-required",
            "https://static.rust-lang.org/rustup/dist",
            "https://nodejs.org/dist",
            "https://aka.ms/vs/17/release/vs_BuildTools.exe",
            "MSVC Build Tools",
            "scripts/macos-tauri-xwin-gates.sh --install-missing --target x86_64-pc-windows-msvc",
            "cargo install --locked cargo-xwin",
            "缺少 Homebrew 时阻断",
            "xwin 成功仍把 Windows runtime 记为 `Unverified`",
        ),
        rust_baseline: (
            "$check-development-environment",
            "只有 GUI 选择才增加 Node.js 与 pnpm 阻断门禁",
            "example_tool_core = { path = \"example_tool_core\" }",
            "<项目标识>_core",
            "<项目标识>_cli",
            "_tui",
            "_mcp",
            "_gui",
            "所有第三方依赖和工作区内 crate 路径都集中在根",
            "首次脚手架在当前项目根创建 `Cargo.toml`",
            "scaffold status",
            "productDefinitionRequired=true",
            "$define-product",
            "Ratatui + tui-realm + tui-realm-stdlib",
            "React + TypeScript + Mantine UI + TanStack Router + TanStack Query + Jotai",
            "硬规则例外",
        ),
        PRODUCT_SPEC: (
            "完整目标项目目录路径",
            "目标目录基本名称必须与项目标识一致",
            "唯一项目根目录",
            "CLI/TUI/MCP/GUI",
            "未选择任何接口时默认 CLI",
            "docs/AGENT_POLICY.md",
            "scaffold status",
            "productDefinitionRequired=true",
            "Ratatui",
            "tui-realm-stdlib",
            "Mantine UI",
            "TanStack Router",
            "TanStack Query",
            "Jotai",
            "硬规则例外 ADR",
            "独立 Git 仓库",
            "git rev-parse --show-toplevel",
            "main",
            "Skills 地图和约束地图",
            "$prepare-gui-app-identity",
        ),
        ROOT / "AGENTS.md": (
            "## Skills 地图",
            "## 约束地图",
            "$check-development-environment",
            "$prepare-gui-app-identity",
            "$build-tauri-release",
            "不得继续派生项目",
            "LICENSE.zh-CN.md",
            "LICENSE.en.md",
            "$rename-project-identity",
        ),
        ROOT / "LICENSE.zh-CN.md": (
            "本协议不是开源许可证",
            "终端下游与禁止继续衍生",
            "知识产权",
            "第三方材料",
            "以中文版本为准",
            "适用项目名称：Agent-first Harness 项目模板",
            "仅将该名称替换",
        ),
        ROOT / "LICENSE.en.md": (
            "This is not an open-source license",
            "Terminal Downstream Project; No Further Derivation",
            "intellectual property rights",
            "Third-Party Materials",
            "the Chinese version controls",
            "Applicable Project Name: Agent-first Harness 项目模板",
            "only this name must be replaced",
        ),
        RENAME_IDENTITY_SKILL / "SKILL.md": (
            "--old-display-name",
            "--old-id",
            "--old-kebab",
            "--apply",
            "--rename-root",
            "路径越界",
            "符号链接",
            "LICENSE.zh-CN.md",
            "LICENSE.en.md",
            "残留",
        ),
        RENAME_IDENTITY_SKILL / "agents" / "openai.yaml": (
            "重命名项目身份",
            "$rename-project-identity",
        ),
        RENAME_IDENTITY_SKILL / "scripts" / "rename_project_identity.py": (
            "EXCLUDED_DIRECTORIES",
            "--apply",
        "不允许符号链接",
        "目标已存在",
            "residuals",
        ),
        RENAME_IDENTITY_SKILL / "scripts" / "test_rename_project_identity.py": (
            "test_preview_then_apply_renames_content_paths_and_licenses",
            "test_existing_destination_blocks_without_overwrite",
            "test_symbolic_link_blocks_before_write",
            "test_explicit_root_rename_moves_project_without_overwrite",
        ),
        GITIGNORE: (
            "/target/",
            "**/node_modules/",
            "**/dist/",
            "**/coverage/",
            ".env.*",
            "!.env.example",
            ".DS_Store",
        ),
        ROOT / "docs" / "CLI_CONTRACT.md": (
            "<项目标识>_cli",
            "scaffold status",
            "productDefinitionRequired=true",
        ),
    }
    for path, fragments in required_fragments.items():
        if not path.is_file():
            fail(errors, f"missing initialization contract file: {display_path(path)}")
            continue
        text = path.read_text(encoding="utf-8")
        for fragment in fragments:
            if fragment not in text:
                fail(
                    errors,
                    f"initialization gate missing in {display_path(path)}: {fragment}",
                )

    removed_web_skill = SKILLS_ROOT / "add-web-adapter"
    if removed_web_skill.is_file() or any(
        path.is_file() for path in removed_web_skill.rglob("*")
    ):
        fail(errors, f"removed standalone WEB skill still exists: {display_path(removed_web_skill)}")

    removed_web_fragments = {
        skill_file: ("`WEB`", "$add-web-adapter", "_web"),
        INSTANTIATE_SKILL: ("CLI/TUI/MCP/GUI/WEB",),
        ROOT / "AGENTS.md": ("$add-web-adapter", "CLI/TUI/MCP/GUI/WEB", "_web"),
        ROOT / "README.md": ("$add-web-adapter", "CLI/TUI/MCP/GUI/WEB", "_web"),
        ROOT / "docs" / "RUST_CLI_TEMPLATE.md": (
            "$add-web-adapter",
            "CLI/TUI/MCP/GUI/WEB",
            "_web",
        ),
        E2E_SKILL: ("GUI, or WEB artifact", "- WEB:"),
    }
    for path, fragments in removed_web_fragments.items():
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        for fragment in fragments:
            if fragment in text:
                fail(
                    errors,
                    f"removed standalone WEB contract remains in {display_path(path)}: {fragment}",
                )

    forbidden_regressions = {
        INSTANTIATE_SKILL: (
            "full target project directory path, one-line problem",
            "Do not create a nested repository automatically",
            "standalone Git initialization remains a separate explicit action",
        ),
        skill_file: (
            "Stop if the current project identifier, one-line goal",
            "replace the sample operation with the approved core success path",
            "CLI as the required",
        ),
        MCP_SKILL: ("Keep CLI mandatory", "required CLI"),
        GUI_SKILL: (
            "Keep CLI mandatory",
            "required CLI",
            "Default to bundled local HTML, CSS, and ES modules",
            "do not add Node, a frontend framework",
        ),
        GUI_BASELINE: (
            "Package local HTML, CSS, and ES modules",
            "Do not introduce Node or a frontend framework",
        ),
        ROOT / "docs" / "RUST_CLI_TEMPLATE.md": (
            "不创建嵌套 Git 仓库",
        ),
        RUST_ASSET / "example_tool_core" / "src" / "lib.rs": (
            "pub async fn execute",
            "example.execute",
        ),
        RUST_ASSET / "example_tool_cli" / "src" / "adapter.rs": ("example.execute",),
        RUST_ASSET / "Cargo.toml": (
            'features = ["macros", "rt-multi-thread"]',
        ),
        RUST_ASSET / "example_tool_cli" / "src" / "main.rs": (
            'flavor = "multi_thread"',
        ),
        COLLECT_RELEASE_SKILL: (
            "dist/v<version>/",
            "Do not overwrite an existing candidate",
        ),
    }
    for path, fragments in forbidden_regressions.items():
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        for fragment in fragments:
            if fragment in text:
                fail(
                    errors,
                    f"business-first initialization regression in {display_path(path)}: {fragment}",
                )

    neutral_asset_fragments = {
        RUST_ASSET / "example_tool_core" / "src" / "lib.rs": (
            "pub async fn scaffold_status",
            "product_definition_required",
        ),
        RUST_ASSET / "example_tool_cli" / "src" / "adapter.rs": (
            "ScaffoldCommand",
            'command: "scaffold.status"',
            "product_definition_required",
        ),
        RUST_ASSET / "example_tool_cli" / "tests" / "cli.rs": (
            '"scaffold", "status", "--json"',
            'value["data"]["productDefinitionRequired"]',
            "rejects_unapproved_business_commands",
        ),
        RUST_ASSET / "Cargo.toml": (
            'features = ["macros", "rt"]',
        ),
        RUST_ASSET / "example_tool_cli" / "src" / "main.rs": (
            '#[tokio::main(flavor = "current_thread")]',
        ),
        GITIGNORE: ("/release/",),
        RUST_ASSET / ".gitignore": ("/release/",),
    }
    for path, fragments in neutral_asset_fragments.items():
        if not path.is_file():
            fail(errors, f"missing neutral Rust asset file: {display_path(path)}")
            continue
        text = path.read_text(encoding="utf-8")
        for fragment in fragments:
            if fragment not in text:
                fail(
                    errors,
                    f"neutral Rust asset contract missing in {display_path(path)}: {fragment}",
                )

    current_naming_files = (
        skill_file,
        CLI_SKILL,
        TUI_SKILL,
        MCP_SKILL,
        GUI_SKILL,
        rust_baseline,
        PRODUCT_SPEC,
        ROOT / "docs" / "CLI_CONTRACT.md",
        PRODUCT_STATUS,
        WORK_PLAN,
        ROOT / "README.md",
        ROOT / "AGENTS.md",
    )
    legacy_naming_fragments = (
        "<project-id>-core",
        "<project-id>-CLI",
        "<project-id>-MCP",
        "<project-id>-gui",
        "<项目标识>-core",
        "<项目标识>-CLI",
        "<项目标识>-MCP",
        "<项目标识>-gui",
    )
    for path in current_naming_files:
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        for fragment in legacy_naming_fragments:
            if fragment in text:
                fail(
                    errors,
                    f"legacy mixed-separator naming remains in {display_path(path)}: {fragment}",
                )

    prerequisite_fragments = {
        PREREQUISITE_UNIX: (
            "--install-missing",
            "--check-only",
            "https://static.rust-lang.org/rustup/dist",
            "rustup-init SHA-256 校验失败",
            "https://nodejs.org/dist",
            "SHASUMS256.txt",
            "Node.js SHA-256 校验失败",
            "--interfaces",
            "CLI,TUI,MCP,GUI",
            "CLI|TUI|MCP|GUI",
            "不支持的接口",
            "gate.pnpm.status=",
            "pnpm@latest",
            "not-required",
        ),
        PREREQUISITE_WINDOWS: (
            "[switch]$CheckOnly",
            "https://static.rust-lang.org/rustup/dist",
            "https://nodejs.org/dist",
            "Get-FileHash",
            "SHASUMS256.txt",
            "https://aka.ms/vs/17/release/vs_BuildTools.exe",
            "Get-AuthenticodeSignature",
            "Microsoft.VisualStudio.Workload.VCTools",
            "Install-MissingMsvc",
            "gate.msvc.status=passed",
            "gate.msvc.change=$MsvcChange",
            "Test-MsvcPrerequisite",
            "[string[]]$Interfaces",
            '@("CLI", "TUI", "MCP", "GUI")',
            '$FrontendRequired = $NormalizedInterfaces -contains "GUI"',
            "不支持的接口",
            "Install-MissingPnpm",
            "gate.pnpm.status=",
            "not-required",
        ),
        PREREQUISITE_TESTS: (
            "test_existing_rust_only_project_does_not_probe_frontend_tools",
            "test_existing_tools_support_spaces_in_probe_path",
            "test_existing_gui_tools_are_not_modified",
            "test_missing_gui_toolchain_is_installed_in_isolation",
            "test_check_only_reports_missing_without_installing",
            "test_incompatible_existing_rust_is_not_replaced",
            "test_rust_installer_failure_blocks_the_gate",
            "test_rust_checksum_mismatch_blocks_the_gate",
            "test_node_checksum_mismatch_blocks_the_gate",
            "test_removed_web_interface_is_rejected",
            "test_windows_msvc_gate_installs_signed_build_tools",
        ),
        MACOS_XWIN_GATE: (
            "--install-missing",
            "--check-only",
            "x86_64-pc-windows-msvc",
            '"$brew_path" install llvm',
            '"$brew_path" install nsis',
            'target add "$TARGET"',
            "install --locked cargo-xwin",
            "本门禁不自动安装 Homebrew",
            "gate.path.prepend=",
        ),
        MACOS_XWIN_GATE_TESTS: (
            "test_existing_environment_passes_without_installing",
            "test_missing_environment_is_installed_and_reprobed",
            "test_check_only_reports_missing_without_writes",
            "test_missing_homebrew_blocks_install",
            "test_formula_install_failure_does_not_claim_success",
            "test_non_macos_host_is_rejected",
            "test_unsupported_target_is_rejected",
        ),
    }
    for path, fragments in prerequisite_fragments.items():
        if not path.is_file():
            fail(errors, f"missing prerequisite script: {display_path(path)}")
            continue
        text = path.read_text(encoding="utf-8")
        for fragment in fragments:
            if fragment not in text:
                fail(errors, f"prerequisite script gate missing in {display_path(path)}: {fragment}")

    if PREREQUISITE_UNIX.is_file() and not source_file_has_executable_mode(PREREQUISITE_UNIX):
        fail(errors, f"Unix 前置门禁不可执行：{display_path(PREREQUISITE_UNIX)}")
    if MACOS_XWIN_GATE.is_file() and not source_file_has_executable_mode(MACOS_XWIN_GATE):
        fail(errors, f"macOS Tauri xwin 门禁不可执行：{display_path(MACOS_XWIN_GATE)}")
    if TAURI_NOTARIZATION_HELPER.is_file() and not source_file_has_executable_mode(
        TAURI_NOTARIZATION_HELPER
    ):
        fail(
            errors,
            f"macOS Tauri 公证探测不可执行：{display_path(TAURI_NOTARIZATION_HELPER)}",
        )
    if TAURI_RELEASE_DIRECTORY_HELPER.is_file() and not source_file_has_executable_mode(
        TAURI_RELEASE_DIRECTORY_HELPER
    ):
        fail(
            errors,
            "Tauri release 目录 helper 不可执行："
            f"{display_path(TAURI_RELEASE_DIRECTORY_HELPER)}",
        )
    if PREREQUISITE_UNIX.is_file() and "https://sh.rustup.rs" in PREREQUISITE_UNIX.read_text(encoding="utf-8"):
        fail(errors, "Unix 前置门禁必须验证 rustup-init，不得执行引导脚本文本")
    if PREREQUISITE_WINDOWS.is_file() and "Invoke-Expression" in PREREQUISITE_WINDOWS.read_text(encoding="utf-8"):
        fail(errors, "Windows 前置门禁不得通过 Invoke-Expression 执行下载的文本")

    root_manifest = RUST_ASSET / "Cargo.toml"
    if not root_manifest.is_file():
        fail(errors, f"missing Rust asset manifest: {display_path(root_manifest)}")
        return
    root_text = root_manifest.read_text(encoding="utf-8")
    try:
        root_data = tomllib.loads(root_text)
    except tomllib.TOMLDecodeError as error:
        fail(errors, f"invalid Rust asset root manifest: {error}")
        return
    workspace = root_data.get("workspace", {})
    workspace_dependencies = workspace.get("dependencies", {})
    expected_members = ["example_tool_core", "example_tool_cli"]
    if workspace.get("members") != expected_members:
        fail(errors, f"Rust asset workspace members must be {expected_members}")
    if workspace_dependencies.get("example_tool_core", {}).get("path") != "example_tool_core":
        fail(errors, "workspace dependency missing internal core path")

    cli_manifest = RUST_ASSET / "example_tool_cli" / "Cargo.toml"
    if not cli_manifest.is_file():
        fail(errors, "Rust asset missing prefixed CLI directory")
    else:
        try:
            cli_data = tomllib.loads(cli_manifest.read_text(encoding="utf-8"))
        except tomllib.TOMLDecodeError as error:
            fail(errors, f"invalid CLI manifest: {error}")
        else:
            binary_names = [target.get("name") for target in cli_data.get("bin", [])]
            if binary_names != ["example_tool_cli"]:
                fail(errors, "Rust asset real binary must be named example_tool_cli")

    member_manifests: list[Path] = []
    for pattern in workspace.get("members", []):
        for member_path in sorted(RUST_ASSET.glob(pattern)):
            manifest = member_path / "Cargo.toml" if member_path.is_dir() else member_path
            if manifest.name != "Cargo.toml" or not manifest.is_file():
                fail(errors, f"workspace member has no Cargo.toml: {pattern}")
                continue
            if manifest not in member_manifests:
                member_manifests.append(manifest)
    if not member_manifests:
        fail(errors, "Rust asset contains no member manifests")
        return

    declared_members = set(member_manifests)
    for manifest in sorted(RUST_ASSET.rglob("Cargo.toml")):
        if manifest == root_manifest:
            continue
        if manifest not in declared_members:
            fail(
                errors,
                "crate manifest is not declared by root workspace members: "
                f"{display_path(manifest)}",
            )

    for manifest in member_manifests:
        try:
            member_data = tomllib.loads(manifest.read_text(encoding="utf-8"))
        except tomllib.TOMLDecodeError as error:
            fail(errors, f"invalid member manifest {display_path(manifest)}: {error}")
            continue
        dependency_tables: list[dict[str, object]] = []
        for section_name in ("dependencies", "dev-dependencies", "build-dependencies"):
            section = member_data.get(section_name)
            if isinstance(section, dict):
                dependency_tables.append(section)
        for target in member_data.get("target", {}).values():
            if not isinstance(target, dict):
                continue
            for section_name in ("dependencies", "dev-dependencies", "build-dependencies"):
                section = target.get(section_name)
                if isinstance(section, dict):
                    dependency_tables.append(section)
        for dependency_table in dependency_tables:
            for dependency_name, declaration in dependency_table.items():
                if declaration != {"workspace": True}:
                    fail(
                        errors,
                        "member dependency must use only `<name>.workspace = true`: "
                        f"{display_path(manifest)}: {dependency_name}",
                    )
                    continue
                if dependency_name not in workspace_dependencies:
                    fail(
                        errors,
                        "member dependency is not declared in root workspace: "
                        f"{display_path(manifest)}: {dependency_name}",
                    )
