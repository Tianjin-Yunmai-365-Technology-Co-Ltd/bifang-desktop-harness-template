"""覆盖构建路由与 release ignore 的确定性 validator 回归。"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from scripts.harness_validation import release


class ReleaseIgnoreValidationTests(unittest.TestCase):
    """验证 release ignore 只接受精确且唯一的根锚定规则。"""

    def _validate(self, contents: str) -> list[str]:
        """在隔离文件上运行 ignore 门禁并返回所有稳定错误。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / ".gitignore"
            path.write_text(contents, encoding="utf-8")
            errors: list[str] = []
            release.validate_release_ignore(errors, path)
            return errors

    def test_accepts_one_exact_root_anchored_rule(self) -> None:
        """结果目录与清理 staging 的两个根锚定规则各一个时应通过。"""
        self.assertEqual(
            self._validate("/target/\n/release/\n/.release-clean.*\n"),
            [],
        )

    def test_rejects_duplicate_exact_rule(self) -> None:
        """重复规则会掩盖初始化漂移，必须拒绝。"""
        errors = self._validate("/release/\n/release/\n/.release-clean.*\n")
        self.assertTrue(any("exactly once" in error for error in errors), errors)

    def test_rejects_unanchored_or_overbroad_rule(self) -> None:
        """子目录通配和非根锚定规则不能替代精确项目根目录。"""
        for unsafe in ("release/", "**/release/", "/release"):
            with self.subTest(unsafe=unsafe):
                errors = self._validate(f"/release/\n/.release-clean.*\n{unsafe}\n")
                self.assertTrue(any("unsafe release ignore" in error for error in errors), errors)

    def test_rejects_missing_or_unanchored_cleanup_staging_rule(self) -> None:
        """原子刷新中断遗留物必须只在项目根被忽略。"""
        missing = self._validate("/release/\n")
        self.assertTrue(any("/.release-clean.*" in error for error in missing), missing)
        unsafe = self._validate("/release/\n/.release-clean.*\n.release-clean.*\n")
        self.assertTrue(any("unsafe release ignore" in error for error in unsafe), unsafe)


class BuildSkillValidationTests(unittest.TestCase):
    """验证全平台默认路由和当前平台回退不能被静默弱化。"""

    def test_rejects_missing_default_cross_platform_route(self) -> None:
        """删除三平台默认句后，即使其他构建文本仍在也必须失败。"""
        source = release.BUILD_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "默认通过 `$prepare-cross-platform-release` 构建 Windows、macOS 和 Linux 原生候选"
        mutated = source.replace(anchor, "优先构建可用目标", 1)
        self.assertNotEqual(mutated, source)
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "SKILL.md"
            path.write_text(mutated, encoding="utf-8")
            errors: list[str] = []
            release.validate_build_skill_contract(
                errors,
                build_skill=path,
                cross_platform_skill=release.CROSS_PLATFORM_RELEASE_SKILL,
            )
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_missing_started_matrix_failure_boundary(self) -> None:
        """矩阵真实失败不得通过本机回退被伪装成整体成功。"""
        source = release.BUILD_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "不得把已启动矩阵的失败、测试失败、打包失败、签名失败、超时或取消视为回退条件"
        mutated = source.replace(anchor, "可以把矩阵失败视为回退条件", 1)
        self.assertNotEqual(mutated, source)
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "SKILL.md"
            path.write_text(mutated, encoding="utf-8")
            errors: list[str] = []
            release.validate_build_skill_contract(
                errors,
                build_skill=path,
                cross_platform_skill=release.CROSS_PLATFORM_RELEASE_SKILL,
            )
        self.assertTrue(any(anchor in error for error in errors), errors)


if __name__ == "__main__":
    unittest.main()
