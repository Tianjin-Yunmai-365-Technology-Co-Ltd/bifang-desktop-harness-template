"""覆盖 Harness 与下游 Rust 中文注释检查器的接线。"""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
CHECKER_TEST_ROOT = ROOT / ".agents" / "skills" / "desktop-implement-change" / "scripts"
if str(CHECKER_TEST_ROOT) not in sys.path:
    sys.path.insert(0, str(CHECKER_TEST_ROOT))

import test_check_rust_chinese_comments as checker_tests
from scripts.harness_validation import rust_comments


def load_tests(
    loader: unittest.TestLoader,
    tests: unittest.TestSuite,
    pattern: str | None,
) -> unittest.TestSuite:
    """把下游检查器专属回归并入 Harness 默认 Python 测试发现入口。"""

    del pattern
    tests.addTests(loader.loadTestsFromModule(checker_tests))
    return tests


class ValidateRustChineseCommentsTests(unittest.TestCase):
    """验证真实资产、违规转换和失败关闭行为。"""

    def test_current_rust_workspace_asset_passes(self) -> None:
        """完整 workspace 必须由单次根目录调用通过。"""

        errors: list[str] = []
        rust_comments.validate_rust_chinese_comments(errors)
        self.assertEqual(errors, [])

    def test_converts_violation_with_precise_location(self) -> None:
        """声明违规必须保留 workspace 相对位置和声明身份。"""

        report = {
            "ok": False,
            "root": "/fixture",
            "checkedPackages": 1,
            "checkedRustFiles": 1,
            "checkedDeclarations": 1,
            "errors": [],
            "violations": [
                {
                    "path": "sample_core/src/lib.rs",
                    "line": 9,
                    "column": 5,
                    "kind": "struct",
                    "name": "Task",
                    "reason": "missing_chinese_outer_doc",
                }
            ],
        }
        completed = mock.Mock(returncode=1, stdout=json.dumps(report), stderr="")
        with tempfile.TemporaryDirectory() as temporary, mock.patch(
            "scripts.harness_validation.rust_comments.subprocess.run",
            return_value=completed,
        ):
            checker = Path(temporary) / "checker.py"
            checker.write_text("# fixture\n", encoding="utf-8")
            errors: list[str] = []
            rust_comments.validate_rust_chinese_comments(errors, checker=checker)
        self.assertTrue(
            any("sample_core/src/lib.rs:9:5 struct Task" in item for item in errors),
            errors,
        )

    def test_rejects_bad_json_timeout_and_exit_mismatch(self) -> None:
        """桥接层不能把坏输出、超时或状态矛盾误判为通过。"""

        scenarios = (
            mock.Mock(returncode=0, stdout="not-json", stderr=""),
            mock.Mock(returncode=7, stdout=json.dumps({"ok": True}), stderr=""),
            mock.Mock(returncode=0, stdout=json.dumps({"ok": True}), stderr=""),
            mock.Mock(
                returncode=2,
                stdout=json.dumps(
                    {
                        "ok": False,
                        "root": "/fixture",
                        "checkedPackages": 0,
                        "checkedRustFiles": 0,
                        "checkedDeclarations": 0,
                        "errors": [],
                        "violations": [],
                    }
                ),
                stderr="",
            ),
        )
        with tempfile.TemporaryDirectory() as temporary:
            checker = Path(temporary) / "checker.py"
            checker.write_text("# fixture\n", encoding="utf-8")
            for completed in scenarios:
                with self.subTest(completed=completed), mock.patch(
                    "scripts.harness_validation.rust_comments.subprocess.run",
                    return_value=completed,
                ):
                    errors: list[str] = []
                    rust_comments.validate_rust_chinese_comments(errors, checker=checker)
                    self.assertTrue(errors)

            with mock.patch(
                "scripts.harness_validation.rust_comments.subprocess.run",
                side_effect=subprocess.TimeoutExpired("checker", 60),
            ):
                errors = []
                rust_comments.validate_rust_chinese_comments(errors, checker=checker)
                self.assertTrue(any("timed out" in item for item in errors), errors)


if __name__ == "__main__":
    unittest.main()
