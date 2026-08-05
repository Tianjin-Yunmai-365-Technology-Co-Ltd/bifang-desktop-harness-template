"""校验初始化 Skills、环境门禁、Rust asset 与 workspace 依赖契约。"""

from __future__ import annotations

import tomllib
from pathlib import Path

from .context import *  # noqa: F403
from .initialization_environment import source_file_has_executable_mode
from .initialization_primary_contract import primary_required_fragments
from .initialization_repository_contract import repository_required_fragments



def validate_initialization_contract(errors: list[str]) -> None:
    """校验环境门禁、Rust asset 与 workspace 依赖继承的初始化契约。"""
    skill_file = INITIALIZE_SKILL / "SKILL.md"
    gate_file = ENVIRONMENT_SKILL / "references" / "development-environment-gates.md"
    rust_baseline = ROOT / "docs" / "RUST_CLI_TEMPLATE.md"

    required_fragments = primary_required_fragments(skill_file)
    required_fragments.update(
        repository_required_fragments(gate_file, rust_baseline)
    )
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
