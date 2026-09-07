"""聚合 Harness 治理、本地发布与升级契约回归。"""

from __future__ import annotations

import unittest

import harness_validation_governance_tests
import harness_validation_upgrade_tests


def load_tests(
    loader: unittest.TestLoader,
    tests: unittest.TestSuite,
    pattern: str | None,
) -> unittest.TestSuite:
    """从非 discovery 命名模块加载每组测试一次。"""

    del tests, pattern
    suite = unittest.TestSuite()
    for module in (
        harness_validation_governance_tests,
        harness_validation_upgrade_tests,
    ):
        suite.addTests(loader.loadTestsFromModule(module))
    return suite


if __name__ == "__main__":
    unittest.main()
