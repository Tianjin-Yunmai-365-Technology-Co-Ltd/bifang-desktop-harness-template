"""Harness 升级所有权和生产模块契约回归。"""

from __future__ import annotations

import contextlib
import fnmatch
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from collections.abc import Iterator
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import scripts.validate_harness as validate_harness
from scripts.harness_validation import context, governance, repository, upgrade
from scripts.harness_validation_test_support import (
    TODO_TOKEN as SHARED_TODO_TOKEN,
    read_repo_text,
    run_validator_on_tempfile,
)


class ValidateUpgradeContractTests(unittest.TestCase):
    """覆盖生产 ownership 下限、规则顺序与 Python 语法。"""

    def test_production_upgrade_contract_is_valid(self) -> None:
        """当前生产清单和拆分后的 updater 模块应通过。"""

        errors: list[str] = []
        upgrade.validate_upgrade_contract(errors)
        self.assertEqual([], errors)

    def test_rejects_weakened_or_reordered_ownership_rules(self) -> None:
        """删除、抢先匹配或重排必需所有权规则都必须失败。"""

        source = json.loads(
            upgrade.UPGRADE_OWNERSHIP.read_text(encoding="utf-8")
        )
        source["rules"] = [
            item for item in source["rules"] if item["pattern"] != "Version.md"
        ]
        self_rule = next(
            item
            for item in source["rules"]
            if item["pattern"] == ".agents/skills/desktop-upgrade-harness/**"
        )
        source["rules"].remove(self_rule)
        source["rules"].append(self_rule)
        source["rules"].insert(
            0,
            {
                "pattern": ".agents/skills/desktop-implement-change/**",
                "mode": "tombstone",
            },
        )
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "ownership.json"
            path.write_text(json.dumps(source), encoding="utf-8")
            errors: list[str] = []
            upgrade.validate_upgrade_contract(errors, manifest_path=path)
        self.assertTrue(any("Version.md" in error for error in errors), errors)
        self.assertTrue(any("must precede" in error for error in errors), errors)
        self.assertTrue(any("required checker ownership" in error for error in errors), errors)

    def test_rejects_malformed_upgrade_python(self) -> None:
        """存在性不能替代生产 updater 模块的语法检查。"""

        with tempfile.TemporaryDirectory() as tmp_dir:
            broken = Path(tmp_dir) / "broken.py"
            broken.write_text("def broken(:\n", encoding="utf-8")
            errors: list[str] = []
            upgrade.validate_upgrade_contract(
                errors,
                python_paths=(broken,),
            )
        self.assertTrue(any("invalid upgrade Python module" in error for error in errors), errors)

    def test_gui_skills_are_conditional_and_product_facts_are_protected(self) -> None:
        """升级只向 GUI 下游传播 GUI 能力，同时保护产品实例与 profile。"""

        manifest = json.loads(upgrade.UPGRADE_OWNERSHIP.read_text(encoding="utf-8"))
        ordered = [
            (item["pattern"], item["mode"])
            for item in manifest["rules"]
        ]
        support_rule = (
            ".agents/skills/desktop-prepare-gui-support-surfaces/**",
            "conditional",
        )
        generic_rule = (".agents/skills/**", "managed")
        self.assertIn(support_rule, ordered)
        self.assertLess(ordered.index(support_rule), ordered.index(generic_rule))
        self.assertIn(("docs/GUI_SUPPORT_SURFACES.md", "protected"), ordered)
        brand_asset = (
            ".agents/skills/desktop-prepare-gui-support-surfaces/"
            "assets/brand-support/media/sponsor/pay1.png"
        )
        resolved_mode = next(
            mode
            for pattern, mode in ordered
            if fnmatch.fnmatchcase(brand_asset, pattern)
        )
        self.assertEqual(resolved_mode, "conditional")
        for skill_name in (
            "desktop-add-gui-system-locale",
            "desktop-add-gui-updater",
            "desktop-add-gui-window-state",
            "desktop-add-gui-dialog",
            "desktop-add-gui-system-tray",
            "desktop-add-gui-single-instance",
            "desktop-add-gui-deep-link",
            "desktop-add-gui-global-shortcut",
            "desktop-add-gui-system-notifications",
            "desktop-add-gui-autostart",
            "desktop-test-gui-release-performance",
        ):
            rule = (f".agents/skills/{skill_name}/**", "conditional")
            self.assertIn(rule, ordered)
            self.assertLess(ordered.index(rule), ordered.index(generic_rule))
        self.assertEqual(
            context.GUI_DIALOG_SKILL,
            ROOT / ".agents/skills/desktop-add-gui-dialog/SKILL.md",
        )
        self.assertIn(
            ".agents/skills/desktop-add-gui-dialog/SKILL.md",
            context.REQUIRED_FILES,
        )
        self.assertIn(
            ".agents/skills/desktop-add-gui-dialog/agents/openai.yaml",
            context.REQUIRED_FILES,
        )
        self.assertIn("desktop-add-gui-dialog", context.EXPECTED_SKILLS)

    def test_upgrade_policy_constants_match_validator_requirements(self) -> None:
        """升级器自身策略常量不得落后于 validator 的最低保护集。"""

        module_path = (
            ROOT
            / ".agents"
            / "skills"
            / "desktop-upgrade-harness"
            / "scripts"
            / "harness_upgrade_policy.py"
        )
        spec = importlib.util.spec_from_file_location(
            "harness_upgrade_policy_under_test",
            module_path,
        )
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        policy = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(policy)
        self.assertEqual(
            upgrade.REQUIRED_RULES,
            policy.MINIMUM_OWNERSHIP_RULES,
        )

    def test_git_lifecycle_skill_is_managed_and_common_dir_state_is_not_source(self) -> None:
        """升级传播完整生命周期 Skill，但不把 common-dir 运行状态当作源码。"""

        module_path = (
            ROOT
            / ".agents"
            / "skills"
            / "desktop-upgrade-harness"
            / "scripts"
            / "harness_upgrade_policy.py"
        )
        spec = importlib.util.spec_from_file_location(
            "git_lifecycle_upgrade_policy_under_test",
            module_path,
        )
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        policy = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(policy)

        lifecycle_paths = {
            ".agents/skills/desktop-manage-git-lifecycle/SKILL.md",
            ".agents/skills/desktop-manage-git-lifecycle/agents/openai.yaml",
            ".agents/skills/desktop-manage-git-lifecycle/scripts/git_lifecycle.py",
            ".agents/skills/desktop-manage-git-lifecycle/scripts/test_git_lifecycle.py",
        }
        self.assertTrue(lifecycle_paths.issubset(context.REQUIRED_FILES))
        self.assertTrue(lifecycle_paths.issubset(policy.REQUIRED_MANAGED_SOURCE_PATHS))
        self.assertIn("desktop-manage-git-lifecycle", context.EXPECTED_SKILLS)

        manifest = json.loads(upgrade.UPGRADE_OWNERSHIP.read_text(encoding="utf-8"))
        ordered = [(item["pattern"], item["mode"]) for item in manifest["rules"]]
        lifecycle_rule = (
            ".agents/skills/desktop-manage-git-lifecycle/**",
            "managed",
        )
        generic_rule = (".agents/skills/**", "managed")
        self.assertIn(lifecycle_rule, ordered)
        self.assertLess(ordered.index(lifecycle_rule), ordered.index(generic_rule))
        self.assertFalse(any(pattern == ".harness/git-lifecycle.json" for pattern, _ in ordered))
        self.assertNotIn(".harness/git-lifecycle.json", policy.REQUIRED_MANAGED_SOURCE_PATHS)

    def test_gui_lifecycle_plugin_contract_is_required_and_tombstoned(self) -> None:
        """插件契约检查器与回归测试必须纳入必需文件并受初始化 tombstone 保护。"""

        required_paths = (
            ".agents/skills/desktop-test-gui-initialization-e2e/scripts/"
            "gui-lifecycle-plugin-contract.mjs",
            ".agents/skills/desktop-test-gui-initialization-e2e/scripts/"
            "gui-lifecycle-plugin-contract.test.mjs",
        )
        self.assertEqual(
            context.GUI_LIFECYCLE_PLUGIN_CONTRACT_CHECKER,
            ROOT / required_paths[0],
        )
        self.assertEqual(
            context.GUI_LIFECYCLE_PLUGIN_CONTRACT_TESTS,
            ROOT / required_paths[1],
        )
        manifest = json.loads(upgrade.UPGRADE_OWNERSHIP.read_text(encoding="utf-8"))
        ordered = [
            (item["pattern"], item["mode"])
            for item in manifest["rules"]
        ]
        for required_path in required_paths:
            self.assertIn(required_path, context.REQUIRED_FILES)
            effective_mode = next(
                mode
                for pattern, mode in ordered
                if fnmatch.fnmatchcase(required_path, pattern)
            )
            self.assertEqual(effective_mode, "tombstone")

    def test_rejects_gui_support_rule_after_generic_skill_rule(self) -> None:
        """宽泛 managed 规则不得抢先吞掉 GUI-only 条件 Skill。"""

        source = json.loads(upgrade.UPGRADE_OWNERSHIP.read_text(encoding="utf-8"))
        support = next(
            item
            for item in source["rules"]
            if item["pattern"]
            == ".agents/skills/desktop-prepare-gui-support-surfaces/**"
        )
        source["rules"].remove(support)
        source["rules"].append(support)
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "ownership.json"
            path.write_text(json.dumps(source), encoding="utf-8")
            errors: list[str] = []
            upgrade.validate_upgrade_contract(errors, manifest_path=path)
        self.assertTrue(
            any("conditional rule must precede" in error for error in errors),
            errors,
        )
