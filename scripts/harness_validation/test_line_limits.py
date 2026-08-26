"""覆盖 Harness 行数门禁接线，并纳入下游检查器专属回归。"""

from __future__ import annotations

import json
from pathlib import Path
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

import test_check_file_line_limits as checker_tests
from scripts.harness_validation import line_limits


def load_tests(
    loader: unittest.TestLoader,
    tests: unittest.TestSuite,
    pattern: str | None,
) -> unittest.TestSuite:
    """把下游 checker 专属回归并入 Harness 默认发现入口。"""

    del pattern
    tests.addTests(loader.loadTestsFromModule(checker_tests))
    return tests


class ValidateRepositoryLineLimitsTests(unittest.TestCase):
    """验证 Harness 把分层检查器结果转换为提示或阻断错误。"""

    def test_accepts_successful_checker_report(self) -> None:
        """退出码和报告同时成功时不产生 Harness 错误。"""

        report = {"ok": True, "errors": [], "reviewCandidates": [], "violations": []}
        completed = mock.Mock(returncode=0, stdout=json.dumps(report), stderr="")
        with tempfile.TemporaryDirectory() as temporary, mock.patch(
            "scripts.harness_validation.line_limits.subprocess.run",
            return_value=completed,
        ):
            checker = Path(temporary) / "checker.py"
            checker.write_text("# fixture\n", encoding="utf-8")
            errors: list[str] = []
            line_limits.validate_repository_line_limits(errors, checker=checker)
        self.assertEqual(errors, [])

    def test_surfaces_review_candidates_without_rejecting_repository(self) -> None:
        """分层软阈值以上的候选应形成带配置的非阻断复核提示。"""

        report = {
            "ok": True,
            "errors": [],
            "reviewCandidates": [
                {
                    "path": "screen.tsx",
                    "lines": 501,
                    "profile": "frontend",
                    "threshold": 500,
                    "limit": 1000,
                }
            ],
            "violations": [],
        }
        completed = mock.Mock(returncode=0, stdout=json.dumps(report), stderr="")
        with tempfile.TemporaryDirectory() as temporary, mock.patch(
            "scripts.harness_validation.line_limits.subprocess.run",
            return_value=completed,
        ):
            checker = Path(temporary) / "checker.py"
            checker.write_text("# fixture\n", encoding="utf-8")
            errors: list[str] = []
            warnings: list[str] = []
            line_limits.validate_repository_line_limits(
                errors, warnings=warnings, checker=checker
            )
        self.assertEqual(errors, [])
        self.assertTrue(
            any(
                "frontend file" in item
                and "screen.tsx (501 lines, hard limit 1000)" in item
                for item in warnings
            ),
            warnings,
        )

    def test_converts_violations_and_operational_errors(self) -> None:
        """超限和运行错误都必须成为具体 Harness 失败。"""

        report = {
            "ok": False,
            "errors": ["git failed"],
            "reviewCandidates": [],
            "violations": [
                {
                    "path": "lib.rs",
                    "lines": 801,
                    "profile": "rust",
                    "limit": 800,
                }
            ],
        }
        completed = mock.Mock(returncode=2, stdout=json.dumps(report), stderr="")
        with tempfile.TemporaryDirectory() as temporary, mock.patch(
            "scripts.harness_validation.line_limits.subprocess.run",
            return_value=completed,
        ):
            checker = Path(temporary) / "checker.py"
            checker.write_text("# fixture\n", encoding="utf-8")
            errors: list[str] = []
            line_limits.validate_repository_line_limits(errors, checker=checker)
        self.assertTrue(any("git failed" in item for item in errors), errors)
        self.assertTrue(any("lib.rs (801 lines)" in item for item in errors), errors)
        self.assertTrue(any("hard 800-line limit" in item for item in errors), errors)

    def test_rejects_malformed_or_inconsistent_report(self) -> None:
        """检查器输出不可解析或状态矛盾时必须 fail closed。"""

        completed = mock.Mock(returncode=0, stdout="not-json", stderr="")
        with tempfile.TemporaryDirectory() as temporary, mock.patch(
            "scripts.harness_validation.line_limits.subprocess.run",
            return_value=completed,
        ):
            checker = Path(temporary) / "checker.py"
            checker.write_text("# fixture\n", encoding="utf-8")
            errors: list[str] = []
            line_limits.validate_repository_line_limits(errors, checker=checker)
        self.assertTrue(any("invalid file line-limit checker JSON" in item for item in errors))


if __name__ == "__main__":
    unittest.main()
