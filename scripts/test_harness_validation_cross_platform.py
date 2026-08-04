"""Harness 校验器在不同 Git 工作树语义下的回归测试。"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.harness_validation import initialization, workflow
from scripts.harness_validation.context import PREREQUISITE_UNIX, PREREQUISITE_WINDOWS, WORKFLOW


class CrossPlatformCheckoutTests(unittest.TestCase):
    """覆盖 Windows 行尾转换和 Git 可执行位的最高风险回归。"""

    def test_crlf_workflow_matches_reviewed_git_content(self) -> None:
        """CRLF 签出不得改变受审 workflow 的规范哈希或语义。"""

        canonical = WORKFLOW.read_bytes().replace(b"\r\n", b"\n")
        with tempfile.TemporaryDirectory() as tmp_dir:
            candidate = Path(tmp_dir) / "workflow.yml"
            candidate.write_bytes(canonical.replace(b"\n", b"\r\n"))
            errors: list[str] = []
            workflow.validate_workflow(errors, candidate)
        self.assertEqual(errors, [])

    def test_unix_gate_uses_checkout_appropriate_executable_mode(self) -> None:
        """Windows 读取 Git 索引模式，Unix 读取真实文件系统执行位。"""

        self.assertTrue(initialization.source_file_has_executable_mode(PREREQUISITE_UNIX))
        self.assertFalse(initialization.source_file_has_executable_mode(PREREQUISITE_WINDOWS))


if __name__ == "__main__":
    unittest.main()
