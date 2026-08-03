"""校验下游 Harness 升级器的生产清单、模块语法与保护下限。"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .context import (
    UPGRADE_CORE,
    UPGRADE_MUTATION,
    UPGRADE_OWNERSHIP,
    UPGRADE_POLICY_MODULE,
    UPGRADE_SCRIPT,
    UPGRADE_TESTS,
    display_path,
    fail,
)


REQUIRED_RULES = {
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
    ".agents/skills/**": "managed",
}
VALID_MODES = {
    "managed",
    "managed-self",
    "merge-sections",
    "conditional",
    "protected",
    "tombstone",
}


def load_manifest(errors: list[str], manifest_path: Path) -> dict[str, Any] | None:
    """解析所有权 JSON；语法或顶层结构错误统一转成 validator 错误。"""

    try:
        value = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(
            errors,
            f"invalid upgrade ownership manifest {display_path(manifest_path)}: {error}",
        )
        return None
    if not isinstance(value, dict):
        fail(errors, "upgrade ownership manifest must contain a JSON object")
        return None
    return value


def validate_upgrade_contract(
    errors: list[str],
    *,
    manifest_path: Path = UPGRADE_OWNERSHIP,
    python_paths: tuple[Path, ...] = (
        UPGRADE_SCRIPT,
        UPGRADE_CORE,
        UPGRADE_MUTATION,
        UPGRADE_POLICY_MODULE,
        UPGRADE_TESTS,
    ),
) -> None:
    """阻止升级器保护清单弱化、规则顺序回退和生产 Python 语法破坏。"""

    manifest = load_manifest(errors, manifest_path)
    if manifest is not None:
        if manifest.get("schema_version") != 1:
            fail(errors, "upgrade ownership manifest schema_version must be 1")
        if manifest.get("default_mode") != "protected":
            fail(errors, "upgrade ownership manifest default_mode must be protected")
        raw_rules = manifest.get("rules")
        ordered: list[tuple[str, str]] = []
        if not isinstance(raw_rules, list) or not raw_rules:
            fail(errors, "upgrade ownership manifest rules must be a non-empty list")
        else:
            seen: set[str] = set()
            for index, item in enumerate(raw_rules):
                if not isinstance(item, dict) or set(item) != {"pattern", "mode"}:
                    fail(
                        errors,
                        f"upgrade ownership rule {index} must contain only pattern/mode",
                    )
                    continue
                pattern = item.get("pattern")
                mode = item.get("mode")
                if not isinstance(pattern, str) or not pattern:
                    fail(errors, f"upgrade ownership rule {index} has invalid pattern")
                    continue
                if pattern in seen:
                    fail(errors, f"duplicate upgrade ownership rule: {pattern}")
                seen.add(pattern)
                if mode not in VALID_MODES:
                    fail(errors, f"upgrade ownership rule {pattern} has invalid mode")
                    continue
                ordered.append((pattern, mode))
            observed = dict(ordered)
            for pattern, expected_mode in REQUIRED_RULES.items():
                if observed.get(pattern) != expected_mode:
                    fail(
                        errors,
                        "upgrade ownership minimum protection missing: "
                        f"{pattern} must be {expected_mode}",
                    )
            self_rule = (
                ".agents/skills/upgrade-harness/**",
                "managed-self",
            )
            generic_rule = (".agents/skills/**", "managed")
            if self_rule in ordered and generic_rule in ordered:
                if ordered.index(self_rule) >= ordered.index(generic_rule):
                    fail(
                        errors,
                        "upgrade managed-self rule must precede generic managed rule",
                    )

    for path in python_paths:
        if not path.is_file():
            fail(errors, f"missing upgrade Python module: {display_path(path)}")
            continue
        try:
            source = path.read_text(encoding="utf-8")
            compile(source, str(path), "exec")
        except (OSError, SyntaxError, UnicodeError) as error:
            fail(errors, f"invalid upgrade Python module {display_path(path)}: {error}")
            continue
        if path != UPGRADE_TESTS and len(source.splitlines()) > 800:
            fail(
                errors,
                f"upgrade production module exceeds 800-line hard threshold: "
                f"{display_path(path)}",
            )
