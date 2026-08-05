"""Harness 升级所有权和生产模块契约回归。"""

from __future__ import annotations

import contextlib
import hashlib
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
from scripts.harness_validation import governance, repository, upgrade
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
            if item["pattern"] == ".agents/skills/upgrade-harness/**"
        )
        source["rules"].remove(self_rule)
        source["rules"].append(self_rule)
        source["rules"].insert(
            0,
            {
                "pattern": ".agents/skills/implement-change/**",
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
