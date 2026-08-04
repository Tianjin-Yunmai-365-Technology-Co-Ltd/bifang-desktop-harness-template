#!/usr/bin/env python3
"""集中维护下游 Harness 升级器不可弱化的协议常量。"""

from __future__ import annotations

from pathlib import Path
import re


SCHEMA_VERSION = 2
OWNERSHIP_RELATIVE = Path(
    ".agents/skills/upgrade-harness/references/ownership-manifest.json"
)
LOCK_RELATIVE = Path(".harness/upstream-lock.json")
VALID_MODES = {
    "managed",
    "managed-self",
    "merge-sections",
    "conditional",
    "protected",
    "tombstone",
}
AUTO_MODES = {"managed", "managed-self"}
BLOCKING_CLASSES = {
    "bootstrap_conflict",
    "collision",
    "conflict",
    "protected_candidate",
    "tombstone_candidate",
    "tombstone_present",
}
MANUAL_CLASSES = {"add", "delete", "manual_add", "manual_merge"}
MINIMUM_OWNERSHIP_RULES = {
    "Version.md": "tombstone",
    ".agents/skills/instantiate-project/**": "tombstone",
    ".agents/skills/initialize-rust-project/**": "tombstone",
    "scripts/validate_harness.py": "tombstone",
    "scripts/test_agile_workflow.py": "tombstone",
    "scripts/test_validate_harness.py": "tombstone",
    "scripts/harness_validation/**": "tombstone",
    "docs/HARNESS_ENGINEERING.md": "tombstone",
    "docs/AGENT_POLICY.md": "protected",
    "docs/product_spec/**": "protected",
    "docs/project_status/**": "protected",
    "docs/work_plan/**": "protected",
    "docs/adr/**": "protected",
    "docs/changelog/**": "protected",
    "docs/VERIFICATION.md": "protected",
    "docs/TECH_DEBT.md": "protected",
    "LICENSE.zh-CN.md": "protected",
    "LICENSE.en.md": "protected",
    "Cargo.toml": "protected",
    "Cargo.lock": "protected",
    ".gitignore": "protected",
    "AGENTS.md": "merge-sections",
    "README.md": "merge-sections",
    "docs/ENGINEERING_RULES.md": "merge-sections",
    "docs/RUST_CLI_TEMPLATE.md": "merge-sections",
    "docs/CLI_CONTRACT.md": "merge-sections",
    "docs/RELEASE.md": "merge-sections",
    ".agents/skills/upgrade-harness/**": "managed-self",
    ".agents/skills/add-cli-adapter/**": "conditional",
    ".agents/skills/add-tui-adapter/**": "conditional",
    ".agents/skills/add-mcp-adapter/**": "conditional",
    ".agents/skills/add-gui-adapter/**": "conditional",
    ".agents/skills/prepare-gui-app-identity/**": "conditional",
    ".agents/skills/prepare-cross-platform-release/**": "conditional",
    ".agents/skills/build-tauri-release/**": "conditional",
    ".agents/skills/**": "managed",
}
VERSION_PATTERN = re.compile(r"当前版本[：:]\s*`([^`]+)`")
