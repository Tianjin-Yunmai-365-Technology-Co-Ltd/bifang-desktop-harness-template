"""集中维护 Harness validator 的路径、文件集合与稳定错误格式。"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SKILLS_ROOT = ROOT / ".agents" / "skills"
WORKFLOW = (
    SKILLS_ROOT
    / "desktop-prepare-cross-platform-release"
    / "assets"
    / "github-release-candidate.yml"
)
INITIALIZE_SKILL = SKILLS_ROOT / "desktop-initialize-rust-project"
INSTANTIATE_SKILL_ROOT = SKILLS_ROOT / "desktop-instantiate-project"
INSTANTIATE_SKILL = INSTANTIATE_SKILL_ROOT / "SKILL.md"
INSTANTIATE_FORM = INSTANTIATE_SKILL_ROOT / "references" / "initialization-form.md"
INSTANTIATE_TARGET_RESOLVER = (
    INSTANTIATE_SKILL_ROOT / "scripts" / "resolve_project_target.py"
)
INSTANTIATE_TARGET_RESOLVER_TESTS = (
    INSTANTIATE_SKILL_ROOT / "scripts" / "test_resolve_project_target.py"
)
RENAME_IDENTITY_SKILL = SKILLS_ROOT / "desktop-rename-project-identity"
ENVIRONMENT_SKILL = SKILLS_ROOT / "desktop-check-development-environment"
GUI_IDENTITY_SKILL = SKILLS_ROOT / "desktop-prepare-gui-app-identity" / "SKILL.md"
GUI_SUPPORT_SKILL = (
    SKILLS_ROOT / "desktop-prepare-gui-support-surfaces" / "SKILL.md"
)
GUI_SUPPORT_REFERENCE = (
    SKILLS_ROOT
    / "desktop-prepare-gui-support-surfaces"
    / "references"
    / "gui-support-surfaces.md"
)
GUI_SUPPORT_PAGES_REFERENCE = (
    SKILLS_ROOT
    / "desktop-prepare-gui-support-surfaces"
    / "references"
    / "about-and-sponsor-pages.md"
)
GUI_SUPPORT_UPDATE_REFERENCE = (
    SKILLS_ROOT
    / "desktop-prepare-gui-support-surfaces"
    / "references"
    / "update-and-telemetry.md"
)
GUI_SUPPORT_METADATA = (
    SKILLS_ROOT
    / "desktop-prepare-gui-support-surfaces"
    / "agents"
    / "openai.yaml"
)
GUI_SUPPORT_BRAND_ROOT = (
    SKILLS_ROOT
    / "desktop-prepare-gui-support-surfaces"
    / "assets"
    / "brand-support"
)
MCP_SKILL = SKILLS_ROOT / "desktop-add-mcp-adapter" / "SKILL.md"
GUI_SKILL = SKILLS_ROOT / "desktop-add-gui-adapter" / "SKILL.md"
GUI_LOCALE_SKILL = SKILLS_ROOT / "desktop-add-gui-system-locale" / "SKILL.md"
GUI_UPDATER_SKILL = SKILLS_ROOT / "desktop-add-gui-updater" / "SKILL.md"
GUI_WINDOW_STATE_SKILL = SKILLS_ROOT / "desktop-add-gui-window-state" / "SKILL.md"
GUI_TRAY_SKILL = SKILLS_ROOT / "desktop-add-gui-system-tray" / "SKILL.md"
GUI_SINGLE_INSTANCE_SKILL = (
    SKILLS_ROOT / "desktop-add-gui-single-instance" / "SKILL.md"
)
GUI_DEEP_LINK_SKILL = SKILLS_ROOT / "desktop-add-gui-deep-link" / "SKILL.md"
GUI_GLOBAL_SHORTCUT_SKILL = (
    SKILLS_ROOT / "desktop-add-gui-global-shortcut" / "SKILL.md"
)
GUI_NOTIFICATION_SKILL = (
    SKILLS_ROOT / "desktop-add-gui-system-notifications" / "SKILL.md"
)
GUI_AUTOSTART_SKILL = SKILLS_ROOT / "desktop-add-gui-autostart" / "SKILL.md"
CLI_SKILL = SKILLS_ROOT / "desktop-add-cli-adapter" / "SKILL.md"
TUI_SKILL = SKILLS_ROOT / "desktop-add-tui-adapter" / "SKILL.md"
TUI_BASELINE = SKILLS_ROOT / "desktop-add-tui-adapter" / "references" / "tui-baseline.md"
REACT_BASELINE = SKILLS_ROOT / "desktop-add-gui-adapter" / "references" / "react-frontend-baseline.md"
GUI_BASELINE = SKILLS_ROOT / "desktop-add-gui-adapter" / "references" / "gui-baseline.md"
MANTINE_GUIDELINES = (
    SKILLS_ROOT / "desktop-add-gui-adapter" / "references" / "mantine-ui-guidelines.md"
)
TYPESCRIPT_COMMENT_CHECKER = (
    SKILLS_ROOT
    / "desktop-add-gui-adapter"
    / "references"
    / "check-typescript-chinese-comments.cjs"
)
TYPESCRIPT_COMMENT_CHECKER_TESTS = (
    SKILLS_ROOT
    / "desktop-add-gui-adapter"
    / "references"
    / "check-typescript-chinese-comments.test.ts"
)
E2E_SKILL = SKILLS_ROOT / "desktop-test-final-artifact-e2e" / "SKILL.md"
GUI_INITIALIZATION_E2E_SKILL = (
    SKILLS_ROOT / "desktop-test-gui-initialization-e2e" / "SKILL.md"
)
GUI_LIFECYCLE_CONTRACT_CHECKER = (
    SKILLS_ROOT
    / "desktop-test-gui-initialization-e2e"
    / "scripts"
    / "verify-gui-lifecycle-contract.mjs"
)
GUI_LIFECYCLE_PLUGIN_CONTRACT_CHECKER = (
    SKILLS_ROOT
    / "desktop-test-gui-initialization-e2e"
    / "scripts"
    / "gui-lifecycle-plugin-contract.mjs"
)
GUI_RELEASE_NOTES_CONTRACT_CHECKER = (
    SKILLS_ROOT
    / "desktop-test-gui-initialization-e2e"
    / "scripts"
    / "verify-release-notes-contract.mjs"
)
GUI_LIFECYCLE_CONTRACT_TESTS = (
    SKILLS_ROOT
    / "desktop-test-gui-initialization-e2e"
    / "scripts"
    / "verify-gui-lifecycle-contract.test.mjs"
)
GUI_LIFECYCLE_PLUGIN_CONTRACT_TESTS = (
    SKILLS_ROOT
    / "desktop-test-gui-initialization-e2e"
    / "scripts"
    / "gui-lifecycle-plugin-contract.test.mjs"
)
VERIFY_DELIVERY_SKILL = SKILLS_ROOT / "desktop-verify-delivery" / "SKILL.md"
GUI_RELEASE_PERFORMANCE_SKILL = (
    SKILLS_ROOT / "desktop-test-gui-release-performance" / "SKILL.md"
)
GUI_RELEASE_PERFORMANCE_REFERENCE = (
    SKILLS_ROOT
    / "desktop-test-gui-release-performance"
    / "references"
    / "performance-evidence-schema.md"
)
VERIFICATION_DOC = ROOT / "docs" / "VERIFICATION.md"
PARALLEL_SKILL = SKILLS_ROOT / "desktop-run-parallel-worktrees"
PARALLEL_WORKTREE_SCRIPT = PARALLEL_SKILL / "scripts" / "parallel_worktrees.py"
PARALLEL_WORKTREE_TESTS = PARALLEL_SKILL / "scripts" / "test_parallel_worktrees.py"
COLLECT_RELEASE_SKILL = SKILLS_ROOT / "desktop-collect-release-artifacts" / "SKILL.md"
PREPARE_RELEASE_SKILL = SKILLS_ROOT / "desktop-prepare-release" / "SKILL.md"
RELEASE_NOTES_HELPER = (
    SKILLS_ROOT
    / "desktop-prepare-release"
    / "scripts"
    / "release_notes.py"
)
RELEASE_NOTES_HELPER_TESTS = (
    SKILLS_ROOT
    / "desktop-prepare-release"
    / "scripts"
    / "test_release_notes.py"
)
RELEASE_GIT_HELPER = (
    SKILLS_ROOT / "desktop-prepare-release" / "scripts" / "release_git.py"
)
RELEASE_GIT_HELPER_TESTS = (
    SKILLS_ROOT / "desktop-prepare-release" / "scripts" / "test_release_git.py"
)
GUI_RELEASE_PERFORMANCE_HELPER = (
    SKILLS_ROOT
    / "desktop-test-gui-release-performance"
    / "scripts"
    / "validate_gui_release_performance.py"
)
GUI_RELEASE_PERFORMANCE_TESTS = (
    SKILLS_ROOT
    / "desktop-test-gui-release-performance"
    / "scripts"
    / "test_validate_gui_release_performance.py"
)
VERSION_SKILL = SKILLS_ROOT / "desktop-manage-version"
VERSION_GATE_HELPER = VERSION_SKILL / "scripts" / "version_gate.py"
VERSION_GATE_TESTS = VERSION_SKILL / "scripts" / "test_version_gate.py"
BUILD_RELEASE_SKILL = SKILLS_ROOT / "desktop-build-rust-release" / "SKILL.md"
TAURI_RELEASE_SKILL = SKILLS_ROOT / "desktop-build-tauri-release" / "SKILL.md"
TAURI_NOTARIZATION_HELPER = (
    SKILLS_ROOT / "desktop-build-tauri-release" / "scripts" / "probe-macos-notarization.sh"
)
TAURI_RELEASE_DIRECTORY_HELPER = (
    SKILLS_ROOT / "desktop-build-tauri-release" / "scripts" / "prepare-release-directory.sh"
)
TAURI_RELEASE_HELPER_TESTS = (
    SKILLS_ROOT / "desktop-build-tauri-release" / "scripts" / "test_tauri_release_gates.py"
)
TAURI_DMG_LAYOUT_HELPER = (
    SKILLS_ROOT / "desktop-build-tauri-release" / "scripts" / "verify-dmg-layout.sh"
)
TAURI_DMG_LAYOUT_TESTS = (
    SKILLS_ROOT / "desktop-build-tauri-release" / "scripts" / "test_verify_dmg_layout.py"
)
TAURI_RELEASE_NOTES_HELPER = (
    SKILLS_ROOT
    / "desktop-build-tauri-release"
    / "scripts"
    / "verify_release_notes_resource.py"
)
TAURI_RELEASE_NOTES_HELPER_TESTS = (
    SKILLS_ROOT
    / "desktop-build-tauri-release"
    / "scripts"
    / "test_verify_release_notes_resource.py"
)
BUILD_RELEASE_POSIX_HELPER = (
    SKILLS_ROOT
    / "desktop-build-rust-release"
    / "scripts"
    / "prepare-release-directory.sh"
)
BUILD_RELEASE_POWERSHELL_HELPER = (
    SKILLS_ROOT
    / "desktop-build-rust-release"
    / "scripts"
    / "prepare-release-directory.ps1"
)
BUILD_RELEASE_HELPER_TESTS = (
    SKILLS_ROOT
    / "desktop-build-rust-release"
    / "scripts"
    / "test_prepare_release_directory.py"
)
CROSS_PLATFORM_RELEASE_SKILL = (
    SKILLS_ROOT / "desktop-prepare-cross-platform-release" / "SKILL.md"
)
UPGRADE_SKILL = SKILLS_ROOT / "desktop-upgrade-harness"
UPGRADE_SCRIPT = UPGRADE_SKILL / "scripts" / "harness_upgrade.py"
UPGRADE_CORE = UPGRADE_SKILL / "scripts" / "harness_upgrade_core.py"
UPGRADE_MUTATION = UPGRADE_SKILL / "scripts" / "harness_upgrade_mutation.py"
UPGRADE_SAFETY = UPGRADE_SKILL / "scripts" / "harness_upgrade_safety.py"
UPGRADE_OWNERSHIP_MODULE = UPGRADE_SKILL / "scripts" / "harness_upgrade_ownership.py"
UPGRADE_PREFLIGHT = UPGRADE_SKILL / "scripts" / "harness_upgrade_preflight.py"
UPGRADE_RECORD = UPGRADE_SKILL / "scripts" / "harness_upgrade_record.py"
UPGRADE_POLICY_MODULE = UPGRADE_SKILL / "scripts" / "harness_upgrade_policy.py"
UPGRADE_TESTS = UPGRADE_SKILL / "scripts" / "test_harness_upgrade.py"
UPGRADE_OWNERSHIP = UPGRADE_SKILL / "references" / "ownership-manifest.json"
UPGRADE_POLICY = UPGRADE_SKILL / "references" / "ownership-policy.md"
RUST_ASSET = INITIALIZE_SKILL / "assets" / "rust-lib-cli"
MACOS_DMG_BACKGROUND = INITIALIZE_SKILL / "assets" / "gui" / "macos-dmg-background.png"
CORE_FIRST_CHECKER = (
    SKILLS_ROOT / "desktop-implement-change" / "scripts" / "check_core_first.py"
)
CORE_FIRST_CHECKER_TESTS = (
    SKILLS_ROOT / "desktop-implement-change" / "scripts" / "test_check_core_first.py"
)
LINE_LIMIT_CHECKER = (
    SKILLS_ROOT / "desktop-implement-change" / "scripts" / "check_file_line_limits.py"
)
LINE_LIMIT_CHECKER_TESTS = (
    SKILLS_ROOT / "desktop-implement-change" / "scripts" / "test_check_file_line_limits.py"
)
RUST_COMMENT_CHECKER = (
    SKILLS_ROOT / "desktop-implement-change" / "scripts" / "check_rust_chinese_comments.py"
)
RUST_COMMENT_CHECKER_TESTS = (
    SKILLS_ROOT
    / "desktop-implement-change"
    / "scripts"
    / "test_check_rust_chinese_comments.py"
)
PREREQUISITE_UNIX = ENVIRONMENT_SKILL / "scripts" / "development-environment-gates.sh"
PREREQUISITE_WINDOWS = ENVIRONMENT_SKILL / "scripts" / "development-environment-gates.ps1"
PREREQUISITE_TESTS = ENVIRONMENT_SKILL / "scripts" / "test_development_environment_gates.py"
MACOS_XWIN_GATE = ENVIRONMENT_SKILL / "scripts" / "macos-tauri-xwin-gates.sh"
MACOS_XWIN_GATE_TESTS = (
    ENVIRONMENT_SKILL / "scripts" / "test_macos_tauri_xwin_gates.py"
)
ENGINEERING_RULES = ROOT / "docs" / "ENGINEERING_RULES.md"
AGENT_POLICY = ROOT / "docs" / "AGENT_POLICY.md"
VERSION_FILE = ROOT / "Version.md"
GITIGNORE = ROOT / ".gitignore"
PRODUCT_SPEC_DIR = ROOT / "docs" / "product_spec"
PRODUCT_STATUS_DIR = ROOT / "docs" / "project_status"
WORK_PLAN_DIR = ROOT / "docs" / "work_plan"
ADR_DIR = ROOT / "docs" / "adr"
CHANGELOG_DIR = ROOT / "docs" / "changelog"
PRODUCT_SPEC_PATTERN = re.compile(r"^\d{8}_product_spec\.md$")
PRODUCT_STATUS_PATTERN = re.compile(r"^\d{8}_product_status\.md$")
WORK_PLAN_PATTERN = re.compile(r"^\d{8}_work_plan\.md$")


def latest_matching_file(directory: Path, pattern: re.Pattern[str]) -> Path:
    """定位日期目录中命名合法的最新正文；缺失时返回稳定的不存在路径供门禁报告。"""
    matches = sorted(
        path
        for path in directory.glob("*.md")
        if path.name != "README.md" and pattern.fullmatch(path.name)
    )
    return matches[-1] if matches else directory / "__missing_latest__.md"


PRODUCT_SPEC = latest_matching_file(PRODUCT_SPEC_DIR, PRODUCT_SPEC_PATTERN)
PRODUCT_STATUS = latest_matching_file(PRODUCT_STATUS_DIR, PRODUCT_STATUS_PATTERN)
WORK_PLAN = latest_matching_file(WORK_PLAN_DIR, WORK_PLAN_PATTERN)

REQUIRED_FILES = (
    ".gitignore",
    "AGENTS.md",
    "LICENSE.zh-CN.md",
    "LICENSE.en.md",
    "README.md",
    "Version.md",
    "docs/CLI_CONTRACT.md",
    "docs/AGENT_POLICY.md",
    "docs/ENGINEERING_RULES.md",
    "docs/design_standards/README.md",
    "docs/design_standards/tauri_gui.md",
    "docs/design_standards/tauri_sidebar.md",
    "docs/HARNESS_ENGINEERING.md",
    "docs/harness_engineering/foundations.md",
    "docs/harness_engineering/project_lifecycle.md",
    "docs/harness_engineering/agent_first_design.md",
    "docs/product_spec/README.md",
    "docs/project_status/README.md",
    "docs/RELEASE.md",
    "docs/RUST_CLI_TEMPLATE.md",
    "docs/TECH_DEBT.md",
    "docs/VERIFICATION.md",
    "docs/verification/20260722-20260723_verification.md",
    "docs/verification/20260727-20260730_verification.md",
    "docs/verification/20260803-20260804_verification.md",
    "docs/verification/human_review.md",
    "docs/work_plan/README.md",
    "docs/adr/README.md",
    "docs/changelog/README.md",
    ".agents/skills/desktop-check-development-environment/references/development-environment-gates.md",
    ".agents/skills/desktop-check-development-environment/scripts/development-environment-gates.sh",
    ".agents/skills/desktop-check-development-environment/scripts/development-environment-gates.ps1",
    ".agents/skills/desktop-check-development-environment/scripts/test_development_environment_gates.py",
    ".agents/skills/desktop-check-development-environment/scripts/macos-tauri-xwin-gates.sh",
    ".agents/skills/desktop-check-development-environment/scripts/test_macos_tauri_xwin_gates.py",
    ".agents/skills/desktop-instantiate-project/references/initialization-form.md",
    ".agents/skills/desktop-instantiate-project/scripts/resolve_project_target.py",
    ".agents/skills/desktop-instantiate-project/scripts/test_resolve_project_target.py",
    ".agents/skills/desktop-rename-project-identity/scripts/rename_project_identity.py",
    ".agents/skills/desktop-rename-project-identity/scripts/test_rename_project_identity.py",
    ".agents/skills/desktop-configure-git-commits/assets/commit-template.txt",
    ".agents/skills/desktop-configure-git-commits/references/commit-convention.md",
    ".agents/skills/desktop-configure-git-commits/scripts/configure_git_commit.py",
    ".agents/skills/desktop-configure-git-commits/scripts/test_configure_git_commit.py",
    ".agents/skills/desktop-add-tui-adapter/references/tui-baseline.md",
    ".agents/skills/desktop-add-gui-system-notifications/SKILL.md",
    ".agents/skills/desktop-add-gui-system-notifications/agents/openai.yaml",
    ".agents/skills/desktop-add-gui-system-locale/SKILL.md",
    ".agents/skills/desktop-add-gui-system-locale/agents/openai.yaml",
    ".agents/skills/desktop-add-gui-updater/SKILL.md",
    ".agents/skills/desktop-add-gui-updater/agents/openai.yaml",
    ".agents/skills/desktop-add-gui-window-state/SKILL.md",
    ".agents/skills/desktop-add-gui-window-state/agents/openai.yaml",
    ".agents/skills/desktop-add-gui-system-tray/SKILL.md",
    ".agents/skills/desktop-add-gui-system-tray/agents/openai.yaml",
    ".agents/skills/desktop-add-gui-single-instance/SKILL.md",
    ".agents/skills/desktop-add-gui-single-instance/agents/openai.yaml",
    ".agents/skills/desktop-add-gui-deep-link/SKILL.md",
    ".agents/skills/desktop-add-gui-deep-link/agents/openai.yaml",
    ".agents/skills/desktop-add-gui-global-shortcut/SKILL.md",
    ".agents/skills/desktop-add-gui-global-shortcut/agents/openai.yaml",
    ".agents/skills/desktop-add-gui-autostart/SKILL.md",
    ".agents/skills/desktop-add-gui-autostart/agents/openai.yaml",
    ".agents/skills/desktop-add-gui-adapter/references/react-frontend-baseline.md",
    ".agents/skills/desktop-add-gui-adapter/references/gui-baseline.md",
    ".agents/skills/desktop-add-gui-adapter/references/mantine-ui-guidelines.md",
    ".agents/skills/desktop-add-gui-adapter/references/check-typescript-chinese-comments.cjs",
    ".agents/skills/desktop-add-gui-adapter/references/check-typescript-chinese-comments.test.ts",
    ".agents/skills/desktop-test-gui-initialization-e2e/scripts/gui-lifecycle-frontend-contract.mjs",
    ".agents/skills/desktop-test-gui-initialization-e2e/scripts/gui-lifecycle-plugin-contract.mjs",
    ".agents/skills/desktop-test-gui-initialization-e2e/scripts/gui-lifecycle-plugin-contract.test.mjs",
    ".agents/skills/desktop-test-gui-initialization-e2e/scripts/gui-lifecycle-source-analysis.mjs",
    ".agents/skills/desktop-test-gui-initialization-e2e/scripts/verify-gui-lifecycle-contract.mjs",
    ".agents/skills/desktop-test-gui-initialization-e2e/scripts/verify-gui-lifecycle-contract.fixture.mjs",
    ".agents/skills/desktop-test-gui-initialization-e2e/scripts/verify-gui-lifecycle-contract.test.mjs",
    ".agents/skills/desktop-test-gui-initialization-e2e/scripts/verify-release-notes-contract.mjs",
    ".agents/skills/desktop-initialize-rust-project/assets/gui/macos-dmg-background.png",
    ".agents/skills/desktop-run-parallel-worktrees/scripts/parallel_worktrees.py",
    ".agents/skills/desktop-run-parallel-worktrees/scripts/test_parallel_worktrees.py",
    ".agents/skills/desktop-build-rust-release/scripts/prepare-release-directory.sh",
    ".agents/skills/desktop-build-rust-release/scripts/prepare-release-directory.ps1",
    ".agents/skills/desktop-build-rust-release/scripts/test_prepare_release_directory.py",
    ".agents/skills/desktop-build-tauri-release/references/tauri-macos-windows.md",
    ".agents/skills/desktop-build-tauri-release/scripts/probe-macos-notarization.sh",
    ".agents/skills/desktop-build-tauri-release/scripts/prepare-release-directory.sh",
    ".agents/skills/desktop-build-tauri-release/scripts/test_tauri_release_gates.py",
    ".agents/skills/desktop-build-tauri-release/scripts/verify-dmg-layout.sh",
    ".agents/skills/desktop-build-tauri-release/scripts/test_verify_dmg_layout.py",
    ".agents/skills/desktop-build-tauri-release/scripts/verify_release_notes_resource.py",
    ".agents/skills/desktop-build-tauri-release/scripts/test_verify_release_notes_resource.py",
    ".agents/skills/desktop-prepare-release/scripts/release_notes.py",
    ".agents/skills/desktop-prepare-release/scripts/test_release_notes.py",
    ".agents/skills/desktop-prepare-release/scripts/release_git.py",
    ".agents/skills/desktop-prepare-release/scripts/test_release_git.py",
    ".agents/skills/desktop-test-gui-release-performance/SKILL.md",
    ".agents/skills/desktop-test-gui-release-performance/agents/openai.yaml",
    ".agents/skills/desktop-test-gui-release-performance/references/performance-evidence-schema.md",
    ".agents/skills/desktop-test-gui-release-performance/scripts/validate_gui_release_performance.py",
    ".agents/skills/desktop-test-gui-release-performance/scripts/test_validate_gui_release_performance.py",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/react/pageSessionState.ts",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/react/PageSessionState.test.ts",
    ".agents/skills/desktop-prepare-gui-support-surfaces/SKILL.md",
    ".agents/skills/desktop-prepare-gui-support-surfaces/agents/openai.yaml",
    ".agents/skills/desktop-prepare-gui-support-surfaces/references/gui-support-surfaces.md",
    ".agents/skills/desktop-prepare-gui-support-surfaces/references/about-and-sponsor-pages.md",
    ".agents/skills/desktop-prepare-gui-support-surfaces/references/update-and-telemetry.md",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/GUI_SUPPORT_SURFACES.template.md",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/brand-support-profile.json",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/media-manifest.json",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/i18n/zh-CN.json",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/i18n/en-US.json",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/rust-i18n/zh-CN.yml",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/rust-i18n/en-US.yml",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/react/AboutPageTemplate.tsx",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/react/ReleaseNotesDialogTemplate.tsx",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/react/displayVersion.ts",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/react/releaseNotes.ts",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/react/releaseNotesResource.ts",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/react/ReleaseNotesResource.test.ts",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/rust/release_notes.rs",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/tauri/tauri.release.conf.json",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/react/SponsorPageTemplate.tsx",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/react/SupportMedia.tsx",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/react/BrandUpdaterBanner.tsx",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/react/brandSupportProfile.ts",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/react/supportNavigation.ts",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/react/updatePresentation.ts",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/react/AppSidebarTemplate.tsx",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/react/AppThemeProviderTemplate.tsx",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/react/SettingsPageTemplate.tsx",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/react/MandatoryUpdateGateTemplate.tsx",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/react/SupportSurfaceTemplates.test.tsx",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/media/sponsor/arrow.png",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/media/sponsor/bg.jpg",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/media/sponsor/icon1.png",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/media/sponsor/icon2.png",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/media/sponsor/icon3.png",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/media/sponsor/icon4.png",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/media/sponsor/img1.png",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/media/sponsor/img2.png",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/media/sponsor/img3.png",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/media/sponsor/pay1.png",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/media/sponsor/pay2.png",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/media/sponsor/select.png",
    ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/media/updater/banner.jpg",
    "scripts/harness_validation/gui_support_assets.py",
    ".agents/skills/desktop-upgrade-harness/references/ownership-manifest.json",
    ".agents/skills/desktop-upgrade-harness/references/ownership-policy.md",
    ".agents/skills/desktop-upgrade-harness/scripts/harness_upgrade.py",
    ".agents/skills/desktop-upgrade-harness/scripts/harness_upgrade_core.py",
    ".agents/skills/desktop-upgrade-harness/scripts/harness_upgrade_mutation.py",
    ".agents/skills/desktop-upgrade-harness/scripts/harness_upgrade_safety.py",
    ".agents/skills/desktop-upgrade-harness/scripts/harness_upgrade_ownership.py",
    ".agents/skills/desktop-upgrade-harness/scripts/harness_upgrade_preflight.py",
    ".agents/skills/desktop-upgrade-harness/scripts/harness_upgrade_record.py",
    ".agents/skills/desktop-upgrade-harness/scripts/harness_upgrade_policy.py",
    ".agents/skills/desktop-upgrade-harness/scripts/test_harness_upgrade.py",
    ".agents/skills/desktop-upgrade-harness/scripts/harness_upgrade_test_support.py",
    ".agents/skills/desktop-upgrade-harness/scripts/harness_upgrade_plan_tests.py",
    ".agents/skills/desktop-upgrade-harness/scripts/harness_upgrade_mutation_tests.py",
    ".agents/skills/desktop-implement-change/scripts/check_core_first.py",
    ".agents/skills/desktop-implement-change/scripts/test_check_core_first.py",
    ".agents/skills/desktop-implement-change/scripts/check_file_line_limits.py",
    ".agents/skills/desktop-implement-change/scripts/test_check_file_line_limits.py",
    ".agents/skills/desktop-implement-change/scripts/check_rust_chinese_comments.py",
    ".agents/skills/desktop-implement-change/scripts/test_check_rust_chinese_comments.py",
    ".agents/skills/desktop-manage-version/scripts/version_gate.py",
    ".agents/skills/desktop-manage-version/scripts/test_version_gate.py",
    "scripts/test_agile_workflow.py",
    "scripts/test_harness_scope_and_initialization_boundaries.py",
    "scripts/test_validate_harness.py",
    "scripts/test_release_validation.py",
    "scripts/harness_validation/release.py",
    "scripts/harness_validation/architecture.py",
    "scripts/harness_validation/architecture_requirements.py",
    "scripts/harness_validation/test_architecture.py",
    "scripts/harness_validation/test_document_partitions.py",
    "scripts/harness_validation/line_limits.py",
    "scripts/harness_validation/test_line_limits.py",
    "scripts/harness_validation/rust_comments.py",
    "scripts/harness_validation/test_rust_comments.py",
    "scripts/harness_validation/gui_support.py",
    "scripts/harness_validation/test_gui_support.py",
    "scripts/harness_validation/governance_policy.py",
    "scripts/harness_validation/governance_version.py",
    "scripts/harness_validation/governance_descriptions.py",
    "scripts/harness_validation/repository_memory.py",
    "scripts/harness_validation/product_versioning.py",
    "scripts/harness_validation/test_product_versioning.py",
    "scripts/harness_validation/workflow_contract.py",
    "scripts/harness_validation/initialization_environment.py",
    "scripts/harness_validation/initialization_primary_contract.py",
    "scripts/harness_validation/initialization_repository_contract.py",
    "scripts/harness_validation_governance_tests.py",
    "scripts/harness_workflow_test_support.py",
    "scripts/harness_validation_workflow_structure_tests.py",
    "scripts/harness_validation_workflow_execution_tests.py",
    "scripts/harness_validation_upgrade_tests.py",
    "scripts/validate_harness.py",
)

EXPECTED_SKILLS = {
    "desktop-add-cli-adapter",
    "desktop-add-gui-adapter",
    "desktop-add-gui-autostart",
    "desktop-add-gui-deep-link",
    "desktop-add-gui-global-shortcut",
    "desktop-add-gui-single-instance",
    "desktop-add-gui-system-locale",
    "desktop-add-gui-system-notifications",
    "desktop-add-gui-system-tray",
    "desktop-add-gui-updater",
    "desktop-add-gui-window-state",
    "desktop-add-mcp-adapter",
    "desktop-add-tui-adapter",
    "desktop-build-rust-release",
    "desktop-build-tauri-release",
    "desktop-check-development-environment",
    "desktop-collect-release-artifacts",
    "desktop-configure-git-commits",
    "desktop-curate-harness-memory",
    "desktop-define-product",
    "desktop-extract-i18n-strings",
    "desktop-implement-change",
    "desktop-manage-version",
    "desktop-initialize-rust-project",
    "desktop-instantiate-project",
    "desktop-plan-change",
    "desktop-refactor-code",
    "desktop-prepare-cross-platform-release",
    "desktop-prepare-release",
    "desktop-prepare-gui-app-identity",
    "desktop-prepare-gui-support-surfaces",
    "desktop-rename-project-identity",
    "desktop-run-parallel-worktrees",
    "desktop-test-final-artifact-e2e",
    "desktop-test-gui-initialization-e2e",
    "desktop-test-gui-release-performance",
    "desktop-upgrade-harness",
    "desktop-verify-delivery",
}


@lru_cache(maxsize=None)
def read_text_cached(path: Path) -> str:
    """按路径缓存读取文本文件，避免同一次校验运行内对同一文件的重复磁盘 I/O。"""
    return path.read_text(encoding="utf-8")


def fail(errors: list[str], message: str) -> None:
    """收集一个会阻止 Harness 通过验证的确定性错误。"""
    errors.append(message)


def display_path(path: Path) -> str:
    """优先返回相对 Harness 根目录的稳定路径，避免输出无必要的本机绝对路径。"""
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def require_fragments(
    errors: list[str], path: Path, fragments: tuple[str, ...], *, label: str
) -> None:
    """要求文件存在且逐字包含全部给定片段，缺失即失败关闭。"""
    if not path.is_file():
        fail(errors, f"missing {label} file: {display_path(path)}")
        return
    text = read_text_cached(path)
    for fragment in fragments:
        if fragment not in text:
            fail(errors, f"{label} missing in {display_path(path)}: {fragment}")
