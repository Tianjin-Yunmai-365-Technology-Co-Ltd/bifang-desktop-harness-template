#!/usr/bin/env python3
"""校验文档型 Harness、工程规则与 bundled assets 的确定性契约。"""

from __future__ import annotations

import re
import sys
import tomllib
from pathlib import Path
from urllib.parse import unquote


ROOT = Path(__file__).resolve().parents[1]
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
WEB_SKILL = SKILLS_ROOT / "add-web-adapter" / "SKILL.md"
TUI_BASELINE = SKILLS_ROOT / "add-tui-adapter" / "references" / "tui-baseline.md"
REACT_BASELINE = SKILLS_ROOT / "add-web-adapter" / "references" / "react-frontend-baseline.md"
GUI_BASELINE = SKILLS_ROOT / "add-gui-adapter" / "references" / "gui-baseline.md"
E2E_SKILL = SKILLS_ROOT / "test-final-artifact-e2e" / "SKILL.md"
COLLECT_RELEASE_SKILL = SKILLS_ROOT / "collect-release-artifacts" / "SKILL.md"
PREPARE_RELEASE_SKILL = SKILLS_ROOT / "prepare-release" / "SKILL.md"
BUILD_RELEASE_SKILL = SKILLS_ROOT / "build-rust-release" / "SKILL.md"
CROSS_PLATFORM_RELEASE_SKILL = (
    SKILLS_ROOT / "prepare-cross-platform-release" / "SKILL.md"
)
RUST_ASSET = INITIALIZE_SKILL / "assets" / "rust-lib-cli"
PREREQUISITE_UNIX = ENVIRONMENT_SKILL / "scripts" / "development-environment-gates.sh"
PREREQUISITE_WINDOWS = ENVIRONMENT_SKILL / "scripts" / "development-environment-gates.ps1"
PREREQUISITE_TESTS = ENVIRONMENT_SKILL / "scripts" / "test_development_environment_gates.py"
ENGINEERING_RULES = ROOT / "docs" / "ENGINEERING_RULES.md"
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
    ".agents/skills/rename-project-identity/scripts/rename_project_identity.py",
    ".agents/skills/rename-project-identity/scripts/test_rename_project_identity.py",
    ".agents/skills/add-tui-adapter/references/tui-baseline.md",
    ".agents/skills/add-web-adapter/references/react-frontend-baseline.md",
    ".agents/skills/add-gui-adapter/references/gui-baseline.md",
    "scripts/validate_harness.py",
)

EXPECTED_SKILLS = {
    "add-cli-adapter",
    "add-gui-adapter",
    "add-mcp-adapter",
    "add-tui-adapter",
    "add-web-adapter",
    "build-rust-release",
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
    "test-final-artifact-e2e",
    "verify-delivery",
}


def fail(errors: list[str], message: str) -> None:
    """收集一个会阻止 Harness 通过验证的确定性错误。"""
    errors.append(message)


def display_path(path: Path) -> str:
    """优先返回相对 Harness 根目录的稳定路径，避免输出无必要的本机绝对路径。"""
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def validate_required_files(errors: list[str]) -> None:
    """确认所有规范文档、脚本和门禁入口真实存在。"""
    for relative in REQUIRED_FILES:
        if not (ROOT / relative).is_file():
            fail(errors, f"missing required file: {relative}")


def validate_daily_project_memory(errors: list[str]) -> None:
    """校验五类按日项目记忆的唯一事实来源、命名、索引和工作流入口。"""
    forbidden_legacy_files = (
        ROOT / "CHANGELOG.md",
        ROOT / "docs" / "DECISIONS.md",
        ROOT / "docs" / "PRODUCT_SPEC.md",
        ROOT / "docs" / "PROJECT_STATUS.md",
        ROOT / "docs" / "WORK_PLAN.md",
    )
    for path in forbidden_legacy_files:
        if path.exists():
            fail(errors, f"legacy growing log must be removed: {display_path(path)}")

    product_is_approved = PRODUCT_SPEC.is_file() and bool(
        re.search(r"状态[：:]\s*Approved", PRODUCT_SPEC.read_text(encoding="utf-8"))
    )
    daily_contracts = (
        (PRODUCT_SPEC_DIR, PRODUCT_SPEC_PATTERN, "Product Spec", True),
        (PRODUCT_STATUS_DIR, PRODUCT_STATUS_PATTERN, "Product Status", True),
        (WORK_PLAN_DIR, WORK_PLAN_PATTERN, "Work Plan", True),
        (ADR_DIR, re.compile(r"^\d{8}_ADR\.md$"), "ADR", product_is_approved),
        (
            CHANGELOG_DIR,
            re.compile(r"^\d{8}_CHANGELOG\.md$"),
            "Changelog",
            product_is_approved,
        ),
    )
    for directory, filename_pattern, label, dated_file_required in daily_contracts:
        if not directory.is_dir():
            fail(errors, f"missing daily {label} directory: {display_path(directory)}")
            continue
        index = directory / "README.md"
        if not index.is_file():
            fail(errors, f"missing daily {label} index: {display_path(index)}")
            index_text = ""
        else:
            index_text = index.read_text(encoding="utf-8")
        daily_files: list[Path] = []
        for path in sorted(directory.glob("*.md")):
            if path.name == "README.md":
                continue
            if not filename_pattern.fullmatch(path.name):
                fail(errors, f"invalid daily {label} filename: {display_path(path)}")
                continue
            daily_files.append(path)
            if path.name not in index_text:
                fail(errors, f"daily {label} file missing from index: {display_path(path)}")
        if dated_file_required and not daily_files:
            fail(errors, f"no dated {label} file found in {display_path(directory)}")

    required_fragments = {
        PRODUCT_SPEC_DIR / "README.md": (
            "YYYYMMDD_product_spec.md",
            "同一天只维护一份 Product Spec",
            "读取前一份 Product Spec",
            "完整的当前规格",
        ),
        PRODUCT_STATUS_DIR / "README.md": (
            "YYYYMMDD_product_status.md",
            "同一天只维护一份 Product Status",
            "读取前一份 Product Status",
            "完整的当前状态",
        ),
        WORK_PLAN_DIR / "README.md": (
            "YYYYMMDD_work_plan.md",
            "同一天只维护一份 Work Plan",
            "读取前一份 Work Plan",
            "完整的当前计划",
        ),
        ADR_DIR / "README.md": (
            "YYYYMMDD_ADR.md",
            "同一天不得新建第二个 ADR 文件",
            "独立 `ADR-YYYYMMDD-NNN` 条目",
        ),
        CHANGELOG_DIR / "README.md": (
            "YYYYMMDD_CHANGELOG.md",
            "同一天的实际变化持续更新同一文件",
            "尚未实施的需求只进入 ADR 和计划",
        ),
        SKILLS_ROOT / "define-product" / "SKILL.md": (
            "the latest dated Product Spec",
            "synthesize complete current snapshots",
            "the latest dated ADR",
        ),
        SKILLS_ROOT / "plan-change" / "SKILL.md": (
            "the latest dated Product Status",
            "synthesize its still-valid content",
            "the latest dated ADR",
        ),
        SKILLS_ROOT / "implement-change" / "SKILL.md": (
            "the latest dated Work Plan",
            "synthesize it from the previous dated file",
            "the latest dated ADR",
            "docs/changelog/YYYYMMDD_CHANGELOG.md",
        ),
        SKILLS_ROOT / "verify-delivery" / "SKILL.md": (
            "latest dated Product Spec",
            "latest dated Work Plan",
            "the latest dated ADR",
            "docs/changelog/YYYYMMDD_CHANGELOG.md",
        ),
        SKILLS_ROOT / "prepare-release" / "SKILL.md": ("docs/changelog/README.md",),
    }
    for path, fragments in required_fragments.items():
        if not path.is_file():
            fail(errors, f"missing daily project-memory contract file: {display_path(path)}")
            continue
        text = path.read_text(encoding="utf-8")
        for fragment in fragments:
            if fragment not in text:
                fail(
                    errors,
                    f"daily project-memory rule missing in {display_path(path)}: {fragment}",
                )


def parse_frontmatter(path: Path, errors: list[str]) -> dict[str, str]:
    """解析 Skill 的最小 YAML frontmatter，并拒绝缺失或额外字段。"""
    text = path.read_text(encoding="utf-8")
    match = re.match(r"\A---\n(.*?)\n---\n", text, flags=re.DOTALL)
    if not match:
        fail(errors, f"missing YAML frontmatter: {path.relative_to(ROOT)}")
        return {}

    fields: dict[str, str] = {}
    for line in match.group(1).splitlines():
        key, separator, value = line.partition(":")
        if not separator:
            fail(errors, f"invalid frontmatter line in {path.relative_to(ROOT)}: {line}")
            continue
        fields[key.strip()] = value.strip()
    if set(fields) != {"name", "description"}:
        fail(
            errors,
            f"frontmatter must contain only name/description: {path.relative_to(ROOT)}",
        )
    return fields


def yaml_string(text: str, key: str) -> str | None:
    """从受控 UI 元数据中提取一个双引号字符串字段。"""
    match = re.search(rf'^\s*{re.escape(key)}:\s*"([^"]*)"\s*$', text, re.MULTILINE)
    return match.group(1) if match else None


def validate_skills(errors: list[str]) -> None:
    """校验 Skill 集合、frontmatter、UI 元数据和入口声明保持一致。"""
    actual = {path.name for path in SKILLS_ROOT.iterdir() if path.is_dir()}
    if actual != EXPECTED_SKILLS:
        fail(
            errors,
            f"skill set mismatch: missing={sorted(EXPECTED_SKILLS - actual)}, "
            f"extra={sorted(actual - EXPECTED_SKILLS)}",
        )

    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
    for skill in sorted(actual):
        skill_dir = SKILLS_ROOT / skill
        skill_file = skill_dir / "SKILL.md"
        metadata_file = skill_dir / "agents" / "openai.yaml"
        if not skill_file.is_file():
            fail(errors, f"missing SKILL.md: {skill}")
            continue
        if not metadata_file.is_file():
            fail(errors, f"missing agents/openai.yaml: {skill}")
            continue

        fields = parse_frontmatter(skill_file, errors)
        if fields.get("name") != skill:
            fail(errors, f"skill name does not match directory: {skill}")
        if not fields.get("description"):
            fail(errors, f"empty skill description: {skill}")
        if "TODO" in skill_file.read_text(encoding="utf-8"):
            fail(errors, f"unresolved TODO in skill: {skill}")

        metadata = metadata_file.read_text(encoding="utf-8")
        display_name = yaml_string(metadata, "display_name")
        short_description = yaml_string(metadata, "short_description")
        default_prompt = yaml_string(metadata, "default_prompt")
        if not display_name:
            fail(errors, f"missing display_name: {skill}")
        if not short_description or not 25 <= len(short_description) <= 64:
            fail(errors, f"short_description length must be 25-64: {skill}")
        if not default_prompt or f"${skill}" not in default_prompt:
            fail(errors, f"default_prompt must mention ${skill}: {skill}")

        if f"`${skill}`" not in readme and f"`${'$'}{skill}`" not in readme:
            fail(errors, f"README does not declare skill: {skill}")
        if f"${skill}" not in agents:
            fail(errors, f"AGENTS routing does not mention skill: {skill}")


def validate_markdown_links(errors: list[str]) -> None:
    """解析仓库内 Markdown 链接，并拒绝指向不存在本地目标的引用。"""
    link_pattern = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
    markdown_files = sorted(ROOT.rglob("*.md"))
    for path in markdown_files:
        text = path.read_text(encoding="utf-8")
        for raw_target in link_pattern.findall(text):
            target = raw_target.strip().strip("<>")
            if target.startswith(("http://", "https://", "mailto:", "#")):
                continue
            target = unquote(target.split("#", 1)[0])
            if not target:
                continue
            resolved = (path.parent / target).resolve()
            if not resolved.exists():
                fail(
                    errors,
                    f"broken local link in {path.relative_to(ROOT)}: {raw_target}",
                )


def validate_workflow(errors: list[str]) -> None:
    """确认候选 workflow 保留三平台验证门禁且没有未经授权的发布行为。"""
    if not WORKFLOW.is_file():
        fail(errors, f"missing workflow asset: {display_path(WORKFLOW)}")
        return
    text = WORKFLOW.read_text(encoding="utf-8")
    required_fragments = (
        "os: [ubuntu-latest, macos-latest, windows-latest]",
        "contents: read",
        "rustup toolchain install 1.90.0",
        "--component rustfmt",
        "--component clippy",
        '"cargo", "metadata", "--locked"',
        "no tests discovered",
        "timeout=30",
        "cargo build --workspace --release --locked",
        "actions/upload-artifact@v4",
        '"sourceCommit"',
        '"sha256"',
    )
    for fragment in required_fragments:
        if fragment not in text:
            fail(errors, f"workflow gate missing: {fragment}")

    forbidden_fragments = (
        "contents: write",
        "cargo publish",
        "gh release create",
        "git tag",
        "actions/create-release",
    )
    for fragment in forbidden_fragments:
        if fragment in text:
            fail(errors, f"workflow contains unauthorized publishing behavior: {fragment}")


def validate_initialization_contract(errors: list[str]) -> None:
    """校验环境门禁、Rust asset 与 workspace 依赖继承的初始化契约。"""
    skill_file = INITIALIZE_SKILL / "SKILL.md"
    gate_file = ENVIRONMENT_SKILL / "references" / "development-environment-gates.md"
    rust_baseline = ROOT / "docs" / "RUST_CLI_TEMPLATE.md"

    required_fragments = {
        INSTANTIATE_SKILL: (
            "full target project directory path",
            "required user input",
            "ASCII snake_case project identifier",
            "Product purpose, core input/output",
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
            "intentional absence of four Harness memory streams",
            "LICENSE.zh-CN.md",
            "LICENSE.en.md",
            "byte-for-byte",
            "$rename-project-identity",
            "entire maintained destination tree",
            "Applicable Project Name",
            "all other legal text must remain byte-equivalent",
            "retain `$rename-project-identity`",
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
            "Only a selection containing `GUI` or `WEB` adds blocking Node.js and pnpm gates.",
            "remove `.agents/skills/instantiate-project/`",
            "remove `.agents/skills/initialize-rust-project/`",
            "## Skills 地图",
            "## 约束地图",
            "workspace = true",
            "exactly `CLI`, `TUI`, `MCP`, `GUI`, and `WEB`",
            "If the user makes no selection, record `CLI`",
            "Do not silently add CLI",
            "docs/AGENT_POLICY.md",
            "superpowers: disabled",
            "$add-cli-adapter",
            "$add-tui-adapter",
            "$add-mcp-adapter",
            "$add-gui-adapter",
            "$add-web-adapter",
            "_cli",
            "_tui",
            "_web",
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
            "git rev-parse --show-toplevel",
            "unborn-HEAD",
            "git status --short",
        ),
        SKILLS_ROOT / "verify-delivery" / "SKILL.md": (
            "canonical Git top-level",
            "unborn-HEAD",
            "Not verified",
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
        GUI_SKILL: (
            "Tauri's Tokio-backed singleton async runtime",
            "plain `async fn` Tauri commands",
            "measured CPU-intensive",
            "Missing signing identity",
            "record the artifact as unsigned",
            "distribution target requires signing",
        ),
        GUI_BASELINE: (
            "Tokio-backed singleton async runtime",
            "plain `async fn`",
            "Missing signing identity",
            "record the result as unsigned",
            "distribution channel that requires signing",
        ),
        COLLECT_RELEASE_SKILL: (
            "<canonical-project-root>/release",
            "latest completed result",
            "Build and validate the complete source manifest before cleanup",
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
            "historical, stale, foreign-project, ambiguous or extra files",
        ),
        BUILD_RELEASE_SKILL: (
            "$collect-release-artifacts",
            "project-root `release/` directory",
        ),
        CROSS_PLATFORM_RELEASE_SKILL: (
            "$collect-release-artifacts",
            "project-root `release/` directory",
            "clear historical contents",
        ),
        WEB_SKILL: (
            "<project-id>_web",
            "Do not require or invoke another adapter",
            "React + TypeScript",
            "Mantine UI",
            "TanStack Router",
            "TanStack Query",
            "Jotai",
            "hard-rule exception",
            "references/react-frontend-baseline.md",
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
            "Do not ask for another target directory",
            "<project-id>_gui",
            "React, TypeScript, Mantine UI, TanStack Router, TanStack Query and Jotai",
            "hard-rule exception",
            "React frontend baseline",
            "$prepare-gui-app-identity",
            "docs/GUI_APP_PROFILE.md",
        ),
        GUI_BASELINE: (
            "Tauri 2",
            "React + TypeScript",
            "Mantine UI",
            "TanStack Router",
            "TanStack Query",
            "Jotai",
            "hard rules",
        ),
        E2E_SKILL: ("Computer Use", "real final artifact", "highest-risk failure path"),
        ROOT / "docs" / "AGENT_POLICY.md": (
            "superpowers: enabled",
            "superpowers: disabled",
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
            "只有 GUI/WEB 选择才增加 Node.js 与 pnpm 阻断门禁",
            "example_tool_core = { path = \"example_tool_core\" }",
            "<项目标识>_core",
            "<项目标识>_cli",
            "_tui",
            "_mcp",
            "_gui",
            "_web",
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
            "CLI/TUI/MCP/GUI/WEB",
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
        WEB_SKILL: (
            "choose the smallest maintained stack",
            "do not add a frontend framework solely for a neutral screen",
        ),
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
        WEB_SKILL,
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
    stale_fragments = (
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
    for path in current_files:
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        for fragment in stale_fragments:
            if fragment in text:
                fail(
                    errors,
                    f"stale current description in {display_path(path)}: {fragment}",
                )

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
    """确认 Harness 1.0.0 只有一个版本事实源，当前摘要与下游排除契约一致。"""
    required_fragments = {
        VERSION_FILE: (
            "当前版本：`1.0.0`",
            "初始版本：`1.0.0`",
            "发布状态：Unreleased",
            "唯一事实来源",
            "docs/RELEASE.md",
        ),
        ROOT / "README.md": (
            "当前版本：1.0.0",
            "[`Version.md`](Version.md)",
        ),
        PRODUCT_SPEC: (
            "当前版本：`1.0.0`",
            "唯一事实来源为根 `Version.md`",
        ),
        ROOT / "docs" / "RELEASE.md": (
            "[`Version.md`](../Version.md) 中记录的 `1.0.0`",
            "模板版本事实来源：根目录 `Version.md`",
            "本文件只维护版本与发布规则",
        ),
        PREPARE_RELEASE_SKILL: (
            "The Harness template uses root `Version.md`",
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


def source_files_for_soft_review() -> list[Path]:
    """枚举本仓库人工维护的源码，用于非阻断行数和临时标记审查。"""
    suffixes = {".py", ".ps1", ".rs", ".sh"}
    roots = (ROOT / "scripts", SKILLS_ROOT)
    return sorted(
        path
        for root in roots
        for path in root.rglob("*")
        if path.is_file() and path.suffix.lower() in suffixes
    )


def validate_soft_review_prompts(warnings: list[str]) -> None:
    """报告已批准的软阈值与源码临时标记，但不把人工判断伪装成失败门禁。"""
    entry_limits = {ROOT / "AGENTS.md": (200, 300), ROOT / "README.md": (200, 300)}
    for path, (review_limit, split_limit) in entry_limits.items():
        if not path.is_file():
            continue
        line_count = len(path.read_text(encoding="utf-8").splitlines())
        if line_count > split_limit:
            warnings.append(
                f"entry document should normally be split: {display_path(path)} ({line_count} lines)"
            )
        elif line_count > review_limit:
            warnings.append(
                f"entry document needs split review: {display_path(path)} ({line_count} lines)"
            )

    for path in sorted((ROOT / "docs").rglob("*.md")):
        if path == ROOT / "docs" / "HARNESS_ENGINEERING.md":
            continue
        line_count = len(path.read_text(encoding="utf-8").splitlines())
        if line_count > 800:
            warnings.append(
                f"reference document should normally be split: {display_path(path)} ({line_count} lines)"
            )
        elif line_count > 500:
            warnings.append(
                f"reference document needs split review: {display_path(path)} ({line_count} lines)"
            )

    comment_marker = re.compile(r"^\s*(?://|#).*\b(TODO|FIXME|HACK)\b")
    for path in source_files_for_soft_review():
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        if len(lines) > 800:
            warnings.append(
                f"source file should normally be split: {display_path(path)} ({len(lines)} lines)"
            )
        elif len(lines) > 400:
            warnings.append(
                f"source file needs split review: {display_path(path)} ({len(lines)} lines)"
            )
        for number, line in enumerate(lines, start=1):
            if comment_marker.search(line):
                warnings.append(
                    f"temporary marker needs reason/removal review: {display_path(path)}:{number}"
                )


def main() -> int:
    """运行全部硬门禁与软审查提示，并以稳定退出码报告 Harness 状态。"""
    errors: list[str] = []
    warnings: list[str] = []
    validate_required_files(errors)
    validate_daily_project_memory(errors)
    validate_skills(errors)
    validate_markdown_links(errors)
    validate_workflow(errors)
    validate_initialization_contract(errors)
    validate_engineering_contract(errors)
    validate_current_descriptions(errors)
    validate_version_contract(errors)
    validate_soft_review_prompts(warnings)
    for warning in warnings:
        print(f"WARNING: {warning}", file=sys.stderr)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        print(f"Harness validation failed with {len(errors)} error(s).", file=sys.stderr)
        return 1
    print(
        f"Harness validation passed: {len(REQUIRED_FILES)} required files, "
        f"{len(EXPECTED_SKILLS)} skills, local Markdown links, five daily project-memory streams, "
        "initialization gates, engineering rules, executable prerequisite gates, workspace dependency inheritance, "
        f"and workflow gates; {len(warnings)} non-blocking review warning(s)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
