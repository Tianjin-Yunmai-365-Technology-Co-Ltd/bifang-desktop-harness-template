"""校验初始化 Skills、环境门禁、Rust asset 与 workspace 依赖契约。"""

from __future__ import annotations

import re
import struct
import tomllib
import zlib
from pathlib import Path

from .context import *  # noqa: F403
from .initialization_environment import source_file_has_executable_mode
from .initialization_primary_contract import primary_required_fragments
from .initialization_repository_contract import repository_required_fragments


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
CARGO_MINIMUM_REQUIREMENT = re.compile(r"^\^?\d+\.\d+\.\d+$")


def validate_workspace_dependency_minimums(
    errors: list[str],
    dependencies: dict[str, object],
) -> None:
    """拒绝 Rust 中性资产恢复宽泛、精确锁死或无稳定下界的 registry 要求。"""
    for name, declaration in dependencies.items():
        if isinstance(declaration, str):
            version = declaration
        elif isinstance(declaration, dict):
            if "path" in declaration and "version" not in declaration:
                continue
            if any(key in declaration for key in ("git", "branch", "tag", "rev")):
                fail(errors, f"workspace dependency must not use Git selectors: {name}")
                continue
            version = declaration.get("version")
        else:
            version = None
        if not isinstance(version, str) or not CARGO_MINIMUM_REQUIREMENT.fullmatch(version):
            fail(
                errors,
                "workspace registry dependency must use a compatible full three-part "
                f"minimum requirement: {name}={version!r}",
            )


def validate_macos_dmg_background_asset(
    errors: list[str],
    path: Path = MACOS_DMG_BACKGROUND,  # noqa: F405
) -> None:
    """验证初始化携带的 DMG 背景是完整、可追溯且尺寸固定的 PNG。"""
    if path.is_symlink() or not path.is_file():
        fail(errors, f"macOS DMG background must be a regular file: {display_path(path)}")
        return
    try:
        payload = path.read_bytes()
    except OSError as error:
        fail(errors, f"cannot read macOS DMG background {display_path(path)}: {error}")
        return
    if len(payload) < 4096 or not payload.startswith(PNG_SIGNATURE):
        fail(errors, f"macOS DMG background is not a nontrivial PNG: {display_path(path)}")
        return

    offset = len(PNG_SIGNATURE)
    dimensions: tuple[int, int] | None = None
    idat_bytes = 0
    saw_iend = False
    while offset < len(payload):
        if offset + 12 > len(payload):
            fail(errors, f"macOS DMG background has a truncated PNG chunk: {display_path(path)}")
            return
        chunk_length = struct.unpack(">I", payload[offset : offset + 4])[0]
        chunk_type = payload[offset + 4 : offset + 8]
        chunk_end = offset + 12 + chunk_length
        if chunk_end > len(payload):
            fail(errors, f"macOS DMG background has an invalid PNG chunk length: {display_path(path)}")
            return
        chunk_data = payload[offset + 8 : offset + 8 + chunk_length]
        expected_crc = struct.unpack(">I", payload[offset + 8 + chunk_length : chunk_end])[0]
        actual_crc = zlib.crc32(chunk_type + chunk_data) & 0xFFFFFFFF
        if actual_crc != expected_crc:
            fail(errors, f"macOS DMG background has an invalid PNG checksum: {display_path(path)}")
            return
        if offset == len(PNG_SIGNATURE):
            if chunk_type != b"IHDR" or chunk_length != 13:
                fail(errors, f"macOS DMG background has no leading IHDR: {display_path(path)}")
                return
            dimensions = struct.unpack(">II", chunk_data[:8])
        if chunk_type == b"IDAT":
            idat_bytes += chunk_length
        if chunk_type == b"IEND":
            if chunk_length != 0 or chunk_end != len(payload):
                fail(errors, f"macOS DMG background has an invalid PNG terminator: {display_path(path)}")
                return
            saw_iend = True
        offset = chunk_end

    if dimensions != (660, 400):
        fail(
            errors,
            "macOS DMG background dimensions must be 660x400: "
            f"{display_path(path)} observed {dimensions}",
        )
    if idat_bytes == 0 or not saw_iend:
        fail(errors, f"macOS DMG background has incomplete PNG image data: {display_path(path)}")


def validate_initialization_contract(errors: list[str]) -> None:
    """校验环境门禁、Rust asset 与 workspace 依赖继承的初始化契约。"""
    skill_file = INITIALIZE_SKILL / "SKILL.md"
    gate_file = ENVIRONMENT_SKILL / "references" / "development-environment-gates.md"
    rust_baseline = ROOT / "docs" / "RUST_CLI_TEMPLATE.md"

    validate_macos_dmg_background_asset(errors)

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
            "[workspace.metadata.agent-first-harness]",
            "target-platforms = []",
            "interfaces = []",
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
        GUI_NOTIFICATION_SKILL,
        GUI_AUTOSTART_SKILL,
        GUI_SUPPORT_SKILL,
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
            "MIN_RUST_PATCH=1",
            "NODE_REQUIREMENT='>=24.21.0'",
            "PNPM_REQUIREMENT='>=12.4.1'",
            "PNPM_INSTALL_REQUIREMENT='pnpm@>=12.4.1'",
            "validate_node",
            "validate_pnpm",
            "not-required",
            "GIT_STATUS=upgrade-required",
            "RUST_STATUS=upgrade-required",
            "NODE_STATUS=upgrade-required",
            "PNPM_STATUS=upgrade-required",
            "git_change=upgraded",
            "rust_change=upgraded",
            "node_change=upgraded",
            "pnpm_change=upgraded",
            "安装或升级后仍",
            "validate_user_tool_directory_path",
            "physical_path_with_existing_parent",
            "physical_existing_path",
            "physical_managed_path",
            "validate_installed_user_tool_range",
            "preflight_user_installation",
            "validate_durable_rust_homes",
            "verify_persisted_passed_tools_before_write",
            "AFH_CURRENT_GIT_PATH",
            "AFH_PROJECTED_PATH",
            'validate_managed_directory_path "$MANAGED_CARGO_HOME" "Rust Cargo 当前用户 PATH 根"',
            "profile_managed_block",
            "管理块顺序或正文已损坏",
            'NODE_HOME=$USER_HOME/.local/lib/nodejs',
            'PNPM_HOME=$USER_HOME/.local',
            "AFH_MANAGED_CARGO_HOME",
            "AFH_MANAGED_RUSTUP_HOME",
            "check_afh_tool npm",
            "check_afh_tool git",
            "既有用户级工具链接不属于当前受管安装根",
            "node.archive.sha256=",
            "版本与已选择稳定版不一致",
            'cmp -s "$profile_path" "$profile_snapshot"',
            '.$profile_name.agent-first-harness.tmp.XXXXXX',
            "# agent-first-harness: standard current-user tool PATH",
            'legacy_source_line=',
            'user_cargo_home=${CARGO_HOME:-$HOME/.cargo}',
            'fish_add_path --path "$user_cargo_home/bin"',
            'fish_add_path --path "$HOME/.local/bin"',
            "FRESH_BASE_PATH=/usr/bin:/bin:/usr/sbin:/sbin",
            '"$installer_path" -y --profile minimal --default-toolchain stable --no-modify-path',
            'install --global --prefix "$PNPM_HOME"',
            "当前最高 LTS",
            "gate.fresh_shell.status=",
        ),
        PREREQUISITE_WINDOWS: (
            "[switch]$CheckOnly",
            "https://static.rust-lang.org/rustup/dist",
            "https://nodejs.org/dist",
            "function Get-Sha256File",
            "[IO.File]::OpenRead($Path)",
            "[Security.Cryptography.SHA256]::Create()",
            "Get-Sha256File $installer",
            "Get-Sha256File $archive",
            "SHASUMS256.txt",
            "https://aka.ms/vs/17/release/vs_BuildTools.exe",
            "Get-AuthenticodeSignature",
            "Microsoft.VisualStudio.Workload.VCTools",
            "Install-MissingMsvc",
            "gate.msvc.status=passed",
            "gate.msvc.change=$MsvcChange",
            "$MinimumRustPatch = 1",
            '$NodeRequirement = ">=24.21.0"',
            '$PnpmRequirement = ">=12.4.1"',
            '$PnpmInstallRequirement = "pnpm@>=12.4.1"',
            "Test-NodeVersion",
            "Test-PnpmVersion",
            "Test-MsvcPrerequisite",
            "[string[]]$Interfaces",
            '@("CLI", "TUI", "MCP", "GUI")',
            '$FrontendRequired = $NormalizedInterfaces -contains "GUI"',
            "不支持的接口",
            "Install-MissingPnpm",
            "gate.pnpm.status=",
            "not-required",
            'return "upgrade-required"',
            '[ValidateSet("installed", "upgraded")]',
            '$change = if ($gitState -eq "missing") { "installed" } else { "upgraded" }',
            '$change = if ($rustState -eq "missing") { "installed" } else { "upgraded" }',
            '$change = if ($nodeState -eq "missing") { "installed" } else { "upgraded" }',
            '$change = if ($pnpmState -eq "missing") { "installed" } else { "upgraded" }',
            '[IO.Path]::GetExtension($npm)',
            "('\"' + $PnpmInstallRequirement + '\"')",
            "安装或升级后仍",
            "function Test-FreshPowerShellToolDiscovery",
            "function Resolve-PathCommand",
            "Get-Command -Name $Name -CommandType Application,ExternalScript -All",
            "function Resolve-AfhFreshCommand",
            "function Invoke-RustCommand",
            "function Assert-ManagedDirectoryPath",
            "function Assert-SinglePathRootValue",
            "function Get-PersistedUserEnvironmentValue",
            '$script:ProcessCargoHome = [Environment]::GetEnvironmentVariable("CARGO_HOME", "Process")',
            '$script:ProcessRustupHome = [Environment]::GetEnvironmentVariable("RUSTUP_HOME", "Process")',
            '$script:PersistedCargoHome = Get-PersistedUserEnvironmentValue "CARGO_HOME"',
            '$script:PersistedRustupHome = Get-PersistedUserEnvironmentValue "RUSTUP_HOME"',
            "function Assert-DurableRustHomes",
            "function Get-PersistedMachinePath",
            "function Get-PersistedCombinedPath",
            "function Resolve-PersistedPathCommand",
            "function Assert-PersistedCommandIdentity",
            "function Assert-PendingPersistedCommandIdentity",
            "function Assert-PersistedRustHostIdentity",
            "function Assert-NoMachinePathCommandShadow",
            "function Assert-MachinePathCommandAlignment",
            "function Assert-ManagedNodeRootInventory",
            "function Get-FinalExistingPath",
            "function Test-PathWithinDirectory",
            "function Assert-ManagedCommandWrapper",
            "function Resolve-ManagedCommandWrapper",
            "function Assert-ManagedPnpmWrapperInventory",
            'Join-Path $LocalAppDataRoot "Programs\\nodejs"',
            'Join-Path $RoamingAppDataRoot "npm"',
            '"AFH_MANAGED_CARGO_HOME"',
            '"AFH_MANAGED_RUSTUP_HOME"',
            '@("-y", "--profile", "minimal", "--default-toolchain", "stable", "--no-modify-path")',
            "Sort-Object -Property SortVersion -Descending",
            "LTS 稳定版",
            '@("npm", $npm, $NpmVersion)',
            '[Environment]::GetEnvironmentVariable("Path", "Machine")',
            "gate.fresh_shell.status=$freshShellStatus",
            "-not [IO.Path]::IsPathRooted",
            "node.archive.sha256=$expected",
            "SelectedNodeVersion",
        ),
        PREREQUISITE_TESTS: (
            "test_existing_rust_only_project_does_not_probe_frontend_tools",
            "test_rustup_installer_cannot_mutate_unmanaged_shell_profiles",
            "test_existing_tools_support_spaces_in_probe_path",
            "test_newer_stable_rust_versions_satisfy_the_minimum",
            "test_newer_git_versions_satisfy_the_minimum_without_replacement",
            "test_missing_git_is_installed_and_reprobed",
            "test_existing_gui_tools_are_not_modified",
            "test_newer_compatible_frontend_tools_are_preserved",
            "test_lower_node_versions_require_upgrade_in_check_only",
            "test_lower_pnpm_requires_upgrade_in_check_only",
            "test_check_only_reports_all_lower_versions_without_installing",
            "test_lower_gui_toolchain_is_upgraded_and_reprobed",
            "test_node_installer_selects_highest_lts_independent_of_index_order",
            "test_prerelease_versions_are_rejected_without_upgrade",
            "test_unparseable_versions_are_rejected_without_upgrade",
            "test_missing_gui_toolchain_is_installed_in_isolation",
            "test_fish_path_config_respects_standard_cargo_home",
            "test_user_tool_directory_symlink_component_fails_before_installation",
            "test_unmanaged_user_tool_symlink_is_never_replaced",
            "test_profile_and_fish_config_conflicts_fail_before_download",
            "test_managed_rust_root_symlink_fails_before_download",
            "test_rust_only_change_validates_local_path_prefix_before_download",
            "test_frontend_only_change_validates_cargo_path_prefix_before_download",
            "test_literal_glob_probe_entry_is_not_expanded",
            "test_standard_rust_home_settings_are_respected_without_private_overrides",
            "test_fresh_shell_rechecks_unchanged_frontend_tools_after_rust_upgrade",
            "test_cargo_must_match_the_rustc_stable_line",
            "test_existing_node_version_requires_marker_and_contained_executables",
            "test_profile_atomic_update_does_not_overwrite_concurrent_change",
            "test_path_separator_in_user_install_root_fails_before_probe_or_write",
            "test_process_only_custom_rust_homes_fail_before_download",
            "test_login_persisted_custom_rust_homes_are_used_and_reprobed",
            "test_only_git_change_requires_exact_fresh_login_shell_discovery",
            "test_pending_git_profile_shadow_is_rejected_before_package_install",
            "test_missing_current_node_rejects_persisted_higher_version_before_install",
            "test_projected_user_path_shadow_is_rejected_before_install",
            "test_pnpm_wrapper_symlink_outside_user_prefix_is_rejected_before_npm",
            "test_pnpm_installer_rejects_new_wrapper_symlink_outside_user_prefix",
            "test_git_bash_full_install_uses_standard_user_roots",
            "test_check_only_reports_missing_without_installing",
            "test_rust_upgrade_that_remains_below_msrv_fails_closed",
            "test_rust_installer_failure_blocks_the_gate",
            "test_rust_checksum_mismatch_blocks_the_gate",
            "test_node_checksum_mismatch_blocks_the_gate",
            "test_pnpm_upgrade_failure_blocks_the_gate",
            "test_removed_web_interface_is_rejected",
            "test_windows_msvc_gate_installs_signed_build_tools",
        ),
        PREREQUISITE_WINDOWS_TESTS: (
            "test_check_only_reports_upgrade_required_without_writes",
            "test_rust_version_uses_full_three_part_minimum_and_accepts_newer_releases",
            "test_node_version_is_a_continuous_minimum_not_an_even_major_allowlist",
            "test_pnpm_version_uses_full_three_part_minimum_and_accepts_newer_releases",
            "test_standard_rust_homes_are_respected_without_private_overrides",
            "test_higher_installed_versions_pass_without_installation",
            "test_process_only_or_mismatched_custom_rust_homes_fail_before_install",
            "test_path_separator_in_standard_or_managed_user_root_fails_before_install",
            "test_drive_or_root_relative_user_root_fails_before_install",
            "test_machine_path_old_node_cannot_be_hidden_by_user_first_probe_order",
            "test_existing_node_machine_shadow_is_preflighted_when_only_pnpm_changes",
            "test_each_passed_tool_must_be_identical_on_persisted_path_before_install",
            "test_missing_current_tool_rejects_persisted_existing_identity_before_install",
            "test_pending_current_tool_rejects_different_persisted_identity_before_install",
            "test_persisted_rust_host_is_reprobed_before_another_tool_is_installed",
            "test_persisted_version_is_reprobed_before_another_tool_is_installed",
            "test_malformed_managed_node_version_is_rejected_before_index_download",
            "test_selected_node_marker_is_verified_before_archive_download",
            "test_below_minimum_git_is_upgraded_and_reprobed",
            "test_git_upgrade_that_remains_old_is_rejected",
            "test_below_msrv_rust_is_upgraded_with_existing_rustup",
            "test_below_minimum_node_is_upgraded_from_verified_archive",
            "test_below_minimum_pnpm_is_upgraded_and_reprobed",
            "test_windows_wrapper_precedes_extensionless_posix_shim",
            "test_npm_ps1_uses_powershells_real_command_precedence",
            "test_node_and_pnpm_are_discoverable_from_persisted_user_path",
            "test_node_reparse_root_fails_before_archive_download",
            "test_cargo_below_msrv_cannot_pass_with_new_rustc",
            "test_only_git_change_requires_exact_fresh_powershell_discovery",
            "test_existing_selected_node_directory_must_match_verified_version",
            "test_managed_node_npm_reparse_wrapper_is_rejected_before_pnpm_install",
            "test_pnpm_prefix_reparse_wrappers_are_rejected_before_npm_install",
            "test_projected_pnpm_path_cannot_shadow_passed_node_before_npm_install",
            "test_projected_pnpm_path_rejects_foreign_node_when_node_is_also_pending",
            "test_projected_rust_upgrade_paths_are_checked_before_rustup_runs",
            "test_projected_new_node_path_cannot_shadow_passed_pnpm_or_rust",
        ),
        MACOS_XWIN_GATE: (
            "--install-missing",
            "--check-only",
            "x86_64-pc-windows-msvc",
            '"$brew_path" install llvm',
            '"$brew_path" install lld',
            '"$brew_path" install nsis',
            'target add "$TARGET"',
            'install --locked --version "$CARGO_XWIN_REQUIREMENT" cargo-xwin',
            "CARGO_XWIN_REQUIREMENT='>=0.23.1, <0.24.0'",
            "gate.cargo_xwin.requirement=",
            "本门禁不自动安装 Homebrew",
            "gate.path.prepend=",
            "xwin_upgrade_required=1",
            "overall=upgrade-required",
            "requested_xwin_change=upgraded",
            '[ "$xwin_upgrade_required" -eq 0 ] || exit 20',
            "安装后复探仍失败",
            'USER_CARGO_HOME=${CARGO_HOME:-$USER_HOME/.cargo}',
            'USER_RUSTUP_HOME=${RUSTUP_HOME:-$USER_HOME/.rustup}',
            "validate_durable_rust_homes",
            'list --versions --formula "$formula"',
            "cargo-xwin 版本探测返回失败",
            "rustup 无法列出已安装 target",
            "AFH_MANAGED_CARGO_HOME",
            "AFH_MANAGED_RUSTUP_HOME",
        ),
        MACOS_XWIN_GATE_TESTS: (
            "test_existing_environment_passes_without_installing",
            "test_missing_environment_is_installed_and_reprobed",
            "test_standard_cargo_and_rustup_homes_are_respected",
            "test_unset_standard_rust_homes_use_home_defaults",
            "test_process_only_custom_rust_homes_fail_before_xwin_install",
            "test_higher_compatible_cargo_xwin_is_preserved",
            "test_outdated_cargo_xwin_is_upgraded_and_reprobed",
            "test_check_only_reports_outdated_cargo_xwin_without_writes",
            "test_upgrade_failure_does_not_claim_success",
            "test_upgrade_reprobe_rejects_still_outdated_cargo_xwin",
            "test_non_upgradeable_cargo_xwin_is_not_replaced",
            "test_check_only_reports_missing_without_writes",
            "test_missing_homebrew_blocks_install",
            "test_formula_install_failure_does_not_claim_success",
            "test_split_llvm_install_adds_missing_lld_formula",
            "test_damaged_existing_lld_formula_is_not_silently_reinstalled",
            "test_formula_root_without_bin_is_not_silently_reinstalled",
            "test_all_formula_conflicts_are_preflighted_before_any_brew_install",
            "test_failing_cargo_xwin_version_probe_is_rejected",
            "test_failing_rustup_target_probe_is_rejected",
            "test_unrecognized_llvm_rc_failure_is_not_accepted",
            "test_failing_base_tool_probe_is_not_accepted",
            "test_non_macos_host_is_rejected",
            "test_unsupported_target_is_rejected",
            "test_literal_glob_probe_entry_is_never_expanded",
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

    forbidden_prerequisite_fragments = {
        PREREQUISITE_UNIX: (
            'mktemp "$config_dir/.env.sh.tmp.XXXXXX"',
            "$USER_HOME/.local/share/agent-first-harness/bin",
            'fish_add_path --path "$user_cargo_bin" "$HOME/.local/bin"',
        ),
        PREREQUISITE_WINDOWS: (
            "$env:CARGO_HOME =",
            "$env:RUSTUP_HOME =",
            "Invoke-ManagedRustCommand",
            '$script:ManagedCargoHome = if ($env:CARGO_HOME)',
            '$script:ManagedRustupHome = if ($env:RUSTUP_HOME)',
        ),
    }
    for path, fragments in forbidden_prerequisite_fragments.items():
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        for fragment in fragments:
            if fragment in text:
                fail(
                    errors,
                    f"private or superseded environment behavior remains in {display_path(path)}: {fragment}",
                )

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
    if TAURI_DMG_LAYOUT_HELPER.is_file() and not source_file_has_executable_mode(
        TAURI_DMG_LAYOUT_HELPER
    ):
        fail(
            errors,
            f"macOS DMG 布局检查器不可执行：{display_path(TAURI_DMG_LAYOUT_HELPER)}",
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
    validate_workspace_dependency_minimums(errors, workspace_dependencies)
    expected_registry_floors = {
        "assert_cmd": "2.2.2",
        "clap": "4.6.6",
        "jiff": "0.2.35",
        "serde": "1.0.229",
        "serde_json": "1.0.151",
        "tokio": "1.53.1",
    }
    for dependency_name, expected_floor in expected_registry_floors.items():
        declaration = workspace_dependencies.get(dependency_name)
        actual_floor = (
            declaration
            if isinstance(declaration, str)
            else declaration.get("version")
            if isinstance(declaration, dict)
            else None
        )
        if actual_floor != expected_floor:
            fail(
                errors,
                "Rust asset dependency floor drifted from the verified baseline: "
                f"{dependency_name}={actual_floor!r}, expected {expected_floor!r}",
            )
    workspace_metadata = workspace.get("metadata", {})
    harness_metadata = (
        workspace_metadata.get("agent-first-harness", {})
        if isinstance(workspace_metadata, dict)
        else {}
    )
    expected_harness_metadata = {"target-platforms": [], "interfaces": []}
    if harness_metadata != expected_harness_metadata:
        fail(
            errors,
            "Rust asset workspace metadata must contain only empty target-platforms/interfaces placeholders",
        )
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
