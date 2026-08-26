"""把版本门禁专属回归纳入 Harness 默认 unittest 发现。"""

from __future__ import annotations

import sys
import unittest

from . import product_versioning
from .context import VERSION_GATE_TESTS

VERSION_TEST_ROOT = VERSION_GATE_TESTS.parent
if str(VERSION_TEST_ROOT) not in sys.path:
    sys.path.insert(0, str(VERSION_TEST_ROOT))

import test_version_gate as version_gate_tests  # noqa: E402


def load_tests(
    loader: unittest.TestLoader,
    tests: unittest.TestSuite,
    pattern: str | None,
) -> unittest.TestSuite:
    """追加版本 helper 的行为测试，确保默认发现不会漏跑。"""
    del pattern
    tests.addTests(loader.loadTestsFromModule(version_gate_tests))
    return tests


class ValidateProductVersioningContractTests(unittest.TestCase):
    """验证当前仓库真实资产满足下游版本门禁的固定接线契约。"""

    def test_current_repository_passes(self) -> None:
        """真实仓库文件必须在单次校验中全部通过，不产生任何错误。"""
        errors: list[str] = []
        product_versioning.validate_product_versioning_contract(errors)
        self.assertEqual(errors, [])
