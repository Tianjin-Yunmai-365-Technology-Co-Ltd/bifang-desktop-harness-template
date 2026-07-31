"""校验初始化 Skills、环境门禁、Rust asset 与 workspace 依赖契约。"""

from __future__ import annotations

import tomllib
from pathlib import Path

from .context import *  # noqa: F403

def validate_initialization_contract(errors: list[str]) -> None:
    """校验环境门禁、Rust asset 与 workspace 依赖继承的初始化契约。"""
    skill_file = INITIALIZE_SKILL / "SKILL.md"
    gate_file = ENVIRONMENT_SKILL / "references" / "development-environment-gates.md"
    rust_baseline = ROOT / "docs" / "RUST_CLI_TEMPLATE.md"

    required_fragments = {
        INSTANTIATE_SKILL: (
            "full target project directory path",
            "The target directory is required",
            "ASCII snake_case project identifier",
            "product purpose, core input/output",
            "may remain unresolved",
            "resolved target basename",
            "symlink resolutions",
            "cannot recurse",
            "sole project root",
            "git --version",
            "git init --initial-branch=main .",
            "git rev-parse --show-toplevel",
            "git symbolic-ref --short HEAD",
            "git rev-parse --verify HEAD",
            "git status --porcelain=v1 --untracked-files=all",
            "git remote",
            "independent nested boundary",
            "docs/adr/",
            "docs/changelog/",
            "docs/product_spec/",
            "docs/work_plan/",
            "create exactly one local baseline commit",
            "Do not run the template-wide Harness validator in the selectively copied target",
            "Do not create Product Spec, Work Plan, ADR or Changelog merely for instantiation",
            "LICENSE.zh-CN.md",
            "LICENSE.en.md",
            "byte-for-byte",
            "$rename-project-identity",
            "entire maintained destination tree",
            "Applicable Project Name",
            "all other legal text must remain byte-equivalent",
            "retain `$rename-project-identity`",
            "$run-parallel-worktrees",
            "$upgrade-harness",
            "parallel Worktree/Subagent, milestone smoke, and milestone E2E",
            "Harness-only root `Version.md`",
            "root `Cargo.toml`",
        ),
        SKILLS_ROOT / "instantiate-project" / "agents" / "openai.yaml": (
            "Create a clean project with its own Git root",
            "$instantiate-project",
            "without Harness development memory",
        ),
        skill_file: (
            "$check-development-environment",
            "Only a selection containing `GUI` adds blocking Node.js and pnpm gates.",
            "remove `.agents/skills/instantiate-project/`",
            "remove `.agents/skills/initialize-rust-project/`",
            "## Skills 地图",
            "## 约束地图",
            "workspace = true",
            "exactly `CLI`, `TUI`, `MCP`, and `GUI`",
            "If the user makes no selection, record `CLI`",
            "Do not silently add CLI",
            "docs/AGENT_POLICY.md",
            "Superpowers, parallel Worktree/Subagent, milestone smoke and milestone E2E",
            "do not default an absent answer or leave `pending`",
            "$add-cli-adapter",
            "$add-tui-adapter",
            "$add-mcp-adapter",
            "$add-gui-adapter",
            "_cli",
            "_tui",
            "scaffold status",
            "productDefinitionRequired=true",
            "$define-product",
            "Ratatui + tui-realm + tui-realm-stdlib",
            "React + TypeScript + Mantine UI + TanStack Router + TanStack Query + Jotai",
            "git --version",
            "git init --initial-branch=main .",
            "git rev-parse --show-toplevel",
            "git status --porcelain=v1 --untracked-files=all",
            "git remote",
            "chore: initialize project",
            "user's existing Git identity",
            "do not fabricate an identity",
            "docs/adr/",
            "docs/changelog/",
            "docs/product_spec/",
            "docs/work_plan/",
            "independent Git top-level",
            "project-root `.gitignore`",
            "root-anchored `/release/`",
            "Tokio current-thread async entries",
            "Tauri's Tokio-backed async runtime",
            "LICENSE.zh-CN.md",
            "LICENSE.en.md",
            "retain both inherited proprietary commercial license files",
            "$rename-project-identity",
            "$run-parallel-worktrees",
            "$upgrade-harness",
            "do not run smoke/E2E during neutral initialization",
            "contains the old Harness identity",
        ),
        ENVIRONMENT_SKILL / "SKILL.md": (
            "before the first code-changing development task",
            "Rust is always blocking",
            "Node.js and pnpm are blocking only",
            "report both as `not-required`",
            "retained after downstream initialization",
        ),
        GUI_IDENTITY_SKILL: (
            "application display name",
            "primary window title",
            "Automatic generation",
            "Plan B",
            "User upload",
            "1024×1024",
            "docs/GUI_APP_PROFILE.md",
        ),
        SKILLS_ROOT / "define-product" / "SKILL.md": (
            "neutral `scaffold status` workspace",
            "$plan-change",
            "$implement-change",
        ),
        SKILLS_ROOT / "implement-change" / "SKILL.md": (
            "canonical Git root",
            "branch, commit/unborn state",
            "git status --short",
        ),
        SKILLS_ROOT / "verify-delivery" / "SKILL.md": (
            "source commit",
            "version/build identity",
            "Unverified",
        ),
        SKILLS_ROOT / "build-rust-release" / "SKILL.md": (
            "independent Git top-level",
            "real source commit",
        ),
        SKILLS_ROOT / "prepare-release" / "SKILL.md": (
            "independent Git top-level",
            "unborn HEAD",
        ),
        MCP_SKILL: (
            "Do not ask for another target directory",
            "<project-id>_mcp",
            "Tokio current-thread async entry",
            "measured CPU-intensive",
            "Do not block the Tokio stdio runtime",
        ),
        CLI_SKILL: (
            "CLI is optional",
            "<project-id>_cli",
            "docs/CLI_CONTRACT.md",
            "Tokio current-thread async entry",
            "measured CPU-intensive",
            "Do not block the async runtime",
        ),
        TUI_SKILL: (
            "<project-id>_tui",
            "do not require CLI",
            "Ratatui",
            "tui-realm",
            "tui-realm-stdlib",
            "hard-rule exception",
            "references/tui-baseline.md",
            "Tokio current-thread async entry",
            "measured CPU-intensive",
            "Do not block the Tokio runtime",
        ),
        TUI_BASELINE: (
            "Ratatui",
            "tui-realm",
            "tui-realm-stdlib",
            "latest compatible stable combination",
            "hard-rule exception ADR",
            "Tokio current-thread async entry",
            "measured CPU-intensive",
        ),
        COLLECT_RELEASE_SKILL: (
            "<canonical-project-root>/release",
            "latest completed result",
            "Build and validate the complete source manifest plus milestone-evidence manifest before cleanup",
            "Immediately before copying",
            "remove every existing entry",
            "Copy only the selected current source-manifest files",
            "exact equality with the selected source manifest",
            "Never clean or write outside",
        ),
        PREPARE_RELEASE_SKILL: (
            "root `Version.md`",
            "must not inherit the Harness `Version.md`",
            "$collect-release-artifacts",
            "<project-root>/release",
            "historical, stale, pending, foreign, ambiguous or extra files",
        ),
        BUILD_RELEASE_SKILL: (
            "$collect-release-artifacts",
            "Do not launch the binary",
        ),
        CROSS_PLATFORM_RELEASE_SKILL: (
            "confirm_candidate_build",
            "milestoneAcceptance: pending",
            "Do not include smoke, E2E",
        ),
        REACT_BASELINE: (
            "React and TypeScript",
            "Mantine UI",
            "TanStack Router",
            "TanStack Query",
            "Jotai",
            "Do not mirror a Query result into Jotai",
            "latest mutually compatible stable releases",
        ),
        GUI_SKILL: (
            "Tauri's Tokio-backed singleton async runtime",
            "plain `async fn` Tauri commands",
            "measured CPU-intensive",
            "Missing signing identity",
            "record the artifact as unsigned",
            "distribution target requires signing",
            "Do not ask for another target directory",
            "<project-id>_gui",
            "React, TypeScript, Mantine UI, TanStack Router, TanStack Query and Jotai",
            "hard-rule exception",
            "references/react-frontend-baseline.md",
            "$prepare-gui-app-identity",
            "docs/GUI_APP_PROFILE.md",
        ),
        GUI_BASELINE: (
            "Tokio-backed singleton async runtime",
            "plain `async fn`",
            "Missing signing identity",
            "record the result as unsigned",
            "distribution channel that requires signing",
            "Tauri 2",
            "React + TypeScript",
            "Mantine UI",
            "TanStack Router",
            "TanStack Query",
            "Jotai",
            "hard rules",
        ),
        E2E_SKILL: ("Computer Use", "complete real artifact", "highest-risk failure path"),
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
            "所有第三方依赖和 workspace 内 crate 路径都集中在根",
            "首次 scaffold 在当前项目根创建 `Cargo.toml`",
            "scaffold status",
            "productDefinitionRequired=true",
            "$define-product",
            "Ratatui + tui-realm + tui-realm-stdlib",
            "React + TypeScript + Mantine UI + TanStack Router + TanStack Query + Jotai",
            "硬规则例外",
        ),
        PRODUCT_SPEC: (
            "完整目标项目目录路径",
            "basename 必须与项目标识一致",
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
            "path escapes",
            "symlinks",
            "LICENSE.zh-CN.md",
            "LICENSE.en.md",
            "residual",
        ),
        RENAME_IDENTITY_SKILL / "agents" / "openai.yaml": (
            "Rename Project Identity",
            "$rename-project-identity",
        ),
        RENAME_IDENTITY_SKILL / "scripts" / "rename_project_identity.py": (
            "EXCLUDED_DIRECTORIES",
            "--apply",
            "symbolic link is not allowed",
            "destination already exists",
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
            "rustup-init SHA-256 verification failed",
            "https://nodejs.org/dist",
            "SHASUMS256.txt",
            "Node.js SHA-256 verification failed",
            "--interfaces",
            "CLI,TUI,MCP,GUI",
            "CLI|TUI|MCP|GUI",
            "Unsupported interface",
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
            "Unsupported interface",
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
    }
    for path, fragments in prerequisite_fragments.items():
        if not path.is_file():
            fail(errors, f"missing prerequisite script: {display_path(path)}")
            continue
        text = path.read_text(encoding="utf-8")
        for fragment in fragments:
            if fragment not in text:
                fail(errors, f"prerequisite script gate missing in {display_path(path)}: {fragment}")

    if PREREQUISITE_UNIX.is_file() and not (PREREQUISITE_UNIX.stat().st_mode & 0o111):
        fail(errors, f"Unix prerequisite gate is not executable: {display_path(PREREQUISITE_UNIX)}")
    if PREREQUISITE_UNIX.is_file() and "https://sh.rustup.rs" in PREREQUISITE_UNIX.read_text(encoding="utf-8"):
        fail(errors, "Unix prerequisite gate must verify rustup-init instead of executing the bootstrap script")
    if PREREQUISITE_WINDOWS.is_file() and "Invoke-Expression" in PREREQUISITE_WINDOWS.read_text(encoding="utf-8"):
        fail(errors, "Windows prerequisite gate must not execute downloaded text through Invoke-Expression")

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
