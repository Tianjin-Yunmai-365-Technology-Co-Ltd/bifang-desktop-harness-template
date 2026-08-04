"""集中维护 Harness validator 的路径、文件集合与稳定错误格式。"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SKILLS_ROOT = ROOT / ".agents" / "skills"
WORKFLOW = (
    SKILLS_ROOT
    / "prepare-cross-platform-release"
    / "assets"
    / "github-release-candidate.yml"
)
INITIALIZE_SKILL = SKILLS_ROOT / "initialize-rust-project"
INSTANTIATE_SKILL = SKILLS_ROOT / "instantiate-project" / "SKILL.md"
RENAME_IDENTITY_SKILL = SKILLS_ROOT / "rename-project-identity"
ENVIRONMENT_SKILL = SKILLS_ROOT / "check-development-environment"
GUI_IDENTITY_SKILL = SKILLS_ROOT / "prepare-gui-app-identity" / "SKILL.md"
MCP_SKILL = SKILLS_ROOT / "add-mcp-adapter" / "SKILL.md"
GUI_SKILL = SKILLS_ROOT / "add-gui-adapter" / "SKILL.md"
CLI_SKILL = SKILLS_ROOT / "add-cli-adapter" / "SKILL.md"
TUI_SKILL = SKILLS_ROOT / "add-tui-adapter" / "SKILL.md"
TUI_BASELINE = SKILLS_ROOT / "add-tui-adapter" / "references" / "tui-baseline.md"
REACT_BASELINE = SKILLS_ROOT / "add-gui-adapter" / "references" / "react-frontend-baseline.md"
GUI_BASELINE = SKILLS_ROOT / "add-gui-adapter" / "references" / "gui-baseline.md"
E2E_SKILL = SKILLS_ROOT / "test-final-artifact-e2e" / "SKILL.md"
PARALLEL_SKILL = SKILLS_ROOT / "run-parallel-worktrees"
PARALLEL_WORKTREE_SCRIPT = PARALLEL_SKILL / "scripts" / "parallel_worktrees.py"
PARALLEL_WORKTREE_TESTS = PARALLEL_SKILL / "scripts" / "test_parallel_worktrees.py"
COLLECT_RELEASE_SKILL = SKILLS_ROOT / "collect-release-artifacts" / "SKILL.md"
PREPARE_RELEASE_SKILL = SKILLS_ROOT / "prepare-release" / "SKILL.md"
BUILD_RELEASE_SKILL = SKILLS_ROOT / "build-rust-release" / "SKILL.md"
TAURI_RELEASE_SKILL = SKILLS_ROOT / "build-tauri-release" / "SKILL.md"
TAURI_NOTARIZATION_HELPER = (
    SKILLS_ROOT / "build-tauri-release" / "scripts" / "probe-macos-notarization.sh"
)
TAURI_RELEASE_DIRECTORY_HELPER = (
    SKILLS_ROOT / "build-tauri-release" / "scripts" / "prepare-release-directory.sh"
)
TAURI_RELEASE_HELPER_TESTS = (
    SKILLS_ROOT / "build-tauri-release" / "scripts" / "test_tauri_release_gates.py"
)
BUILD_RELEASE_POSIX_HELPER = (
    SKILLS_ROOT
    / "build-rust-release"
    / "scripts"
    / "prepare-release-directory.sh"
)
BUILD_RELEASE_POWERSHELL_HELPER = (
    SKILLS_ROOT
    / "build-rust-release"
    / "scripts"
    / "prepare-release-directory.ps1"
)
BUILD_RELEASE_HELPER_TESTS = (
    SKILLS_ROOT
    / "build-rust-release"
    / "scripts"
    / "test_prepare_release_directory.py"
)
CROSS_PLATFORM_RELEASE_SKILL = (
    SKILLS_ROOT / "prepare-cross-platform-release" / "SKILL.md"
)
UPGRADE_SKILL = SKILLS_ROOT / "upgrade-harness"
UPGRADE_SCRIPT = UPGRADE_SKILL / "scripts" / "harness_upgrade.py"
UPGRADE_CORE = UPGRADE_SKILL / "scripts" / "harness_upgrade_core.py"
UPGRADE_MUTATION = UPGRADE_SKILL / "scripts" / "harness_upgrade_mutation.py"
UPGRADE_POLICY_MODULE = UPGRADE_SKILL / "scripts" / "harness_upgrade_policy.py"
UPGRADE_TESTS = UPGRADE_SKILL / "scripts" / "test_harness_upgrade.py"
UPGRADE_OWNERSHIP = UPGRADE_SKILL / "references" / "ownership-manifest.json"
UPGRADE_POLICY = UPGRADE_SKILL / "references" / "ownership-policy.md"
RUST_ASSET = INITIALIZE_SKILL / "assets" / "rust-lib-cli"
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
    "docs/product_spec/README.md",
    "docs/project_status/README.md",
    "docs/RELEASE.md",
    "docs/RUST_CLI_TEMPLATE.md",
    "docs/TECH_DEBT.md",
    "docs/VERIFICATION.md",
    "docs/work_plan/README.md",
    "docs/adr/README.md",
    "docs/changelog/README.md",
    ".agents/skills/check-development-environment/references/development-environment-gates.md",
    ".agents/skills/check-development-environment/scripts/development-environment-gates.sh",
    ".agents/skills/check-development-environment/scripts/development-environment-gates.ps1",
    ".agents/skills/check-development-environment/scripts/test_development_environment_gates.py",
    ".agents/skills/check-development-environment/scripts/macos-tauri-xwin-gates.sh",
    ".agents/skills/check-development-environment/scripts/test_macos_tauri_xwin_gates.py",
    ".agents/skills/rename-project-identity/scripts/rename_project_identity.py",
    ".agents/skills/rename-project-identity/scripts/test_rename_project_identity.py",
    ".agents/skills/add-tui-adapter/references/tui-baseline.md",
    ".agents/skills/add-gui-adapter/references/react-frontend-baseline.md",
    ".agents/skills/add-gui-adapter/references/gui-baseline.md",
    ".agents/skills/run-parallel-worktrees/scripts/parallel_worktrees.py",
    ".agents/skills/run-parallel-worktrees/scripts/test_parallel_worktrees.py",
    ".agents/skills/build-rust-release/scripts/prepare-release-directory.sh",
    ".agents/skills/build-rust-release/scripts/prepare-release-directory.ps1",
    ".agents/skills/build-rust-release/scripts/test_prepare_release_directory.py",
    ".agents/skills/build-tauri-release/references/tauri-macos-windows.md",
    ".agents/skills/build-tauri-release/scripts/probe-macos-notarization.sh",
    ".agents/skills/build-tauri-release/scripts/prepare-release-directory.sh",
    ".agents/skills/build-tauri-release/scripts/test_tauri_release_gates.py",
    ".agents/skills/upgrade-harness/references/ownership-manifest.json",
    ".agents/skills/upgrade-harness/references/ownership-policy.md",
    ".agents/skills/upgrade-harness/scripts/harness_upgrade.py",
    ".agents/skills/upgrade-harness/scripts/harness_upgrade_core.py",
    ".agents/skills/upgrade-harness/scripts/harness_upgrade_mutation.py",
    ".agents/skills/upgrade-harness/scripts/harness_upgrade_policy.py",
    ".agents/skills/upgrade-harness/scripts/test_harness_upgrade.py",
    "scripts/test_agile_workflow.py",
    "scripts/test_validate_harness.py",
    "scripts/test_release_validation.py",
    "scripts/harness_validation/release.py",
    "scripts/validate_harness.py",
)

EXPECTED_SKILLS = {
    "add-cli-adapter",
    "add-gui-adapter",
    "add-mcp-adapter",
    "add-tui-adapter",
    "build-rust-release",
    "build-tauri-release",
    "check-development-environment",
    "collect-release-artifacts",
    "define-product",
    "implement-change",
    "initialize-rust-project",
    "instantiate-project",
    "plan-change",
    "prepare-cross-platform-release",
    "prepare-release",
    "prepare-gui-app-identity",
    "rename-project-identity",
    "run-parallel-worktrees",
    "test-final-artifact-e2e",
    "upgrade-harness",
    "verify-delivery",
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
