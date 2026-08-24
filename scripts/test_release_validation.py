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
    """验证逐次 E2E、全量单测和全平台路由不能被静默弱化。"""

    @staticmethod
    def _validate_build(source: str) -> list[str]:
        """只替换 Rust 构建 Skill，保留真实跨平台 Skill。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "SKILL.md"
            path.write_text(source, encoding="utf-8")
            errors: list[str] = []
            release.validate_build_skill_contract(
                errors,
                build_skill=path,
                cross_platform_skill=release.CROSS_PLATFORM_RELEASE_SKILL,
            )
            return errors

    @staticmethod
    def _validate_cross_platform(source: str) -> list[str]:
        """只替换跨平台 Skill，保留真实 Rust 构建 Skill。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "SKILL.md"
            path.write_text(source, encoding="utf-8")
            errors: list[str] = []
            release.validate_build_skill_contract(
                errors,
                build_skill=release.BUILD_RELEASE_SKILL,
                cross_platform_skill=path,
            )
            return errors

    @staticmethod
    def _validate_collect(source: str) -> list[str]:
        """只替换制品收集 Skill，保留真实 Rust 与跨平台构建 Skill。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "SKILL.md"
            path.write_text(source, encoding="utf-8")
            errors: list[str] = []
            release.validate_build_skill_contract(errors, collect_skill=path)
            return errors

    def test_rejects_missing_default_cross_platform_route(self) -> None:
        """删除三平台默认句后，即使其他构建文本仍在也必须失败。"""
        source = release.BUILD_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "默认通过 `$desktop-prepare-cross-platform-release` 构建 Windows、macOS 和 Linux 原生候选"
        mutated = source.replace(anchor, "优先构建可用目标", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_build(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_missing_started_matrix_failure_boundary(self) -> None:
        """矩阵真实失败不得通过本机回退被伪装成整体成功。"""
        source = release.BUILD_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "不得把已启动矩阵的失败、测试失败、打包失败、签名失败、超时或取消视为回退条件"
        mutated = source.replace(anchor, "可以把矩阵失败视为回退条件", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_build(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_missing_per_build_e2e_question(self) -> None:
        """没有当次明确选择时，Rust 构建必须在测试和编译前询问一次。"""
        source = release.BUILD_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "否则在任何测试或编译前询问用户一次"
        mutated = source.replace(anchor, "沿用项目历史偏好", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_build(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_missing_full_workspace_unit_test_command(self) -> None:
        """Rust 构建不得把全量 workspace 单测缩小成包级测试。"""
        source = release.BUILD_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "cargo test --workspace --all-targets --all-features --locked"
        mutated = source.replace(anchor, "cargo test -p example")
        self.assertNotEqual(mutated, source)
        errors = self._validate_build(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_automatic_extra_build_gates(self) -> None:
        """普通构建契约必须明确拒绝自动追加格式、lint 和开发门禁。"""
        source = release.BUILD_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "不得在构建名义下自动追加格式、lint、中文注释或其他开发门禁"
        mutated = source.replace(anchor, "构建前运行全部治理门禁", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_build(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_rust_build_project_memory_writes(self) -> None:
        """Rust 构建结果不得被复制进 ADR、Changelog 或其他项目记忆。"""
        source = release.BUILD_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification"
        mutated = source.replace(anchor, "同步更新项目记忆", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_build(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_cross_platform_contract_requires_e2e_selection_manifest(self) -> None:
        """远端矩阵必须接收当次 E2E 选择并传播进候选清单。"""
        source = release.CROSS_PLATFORM_RELEASE_SKILL.read_text(encoding="utf-8")
        for anchor in ("e2e_selection", "e2eSelection"):
            with self.subTest(anchor=anchor):
                mutated = source.replace(anchor, "omittedE2E", 1)
                self.assertNotEqual(mutated, source)
                errors = self._validate_cross_platform(mutated)
                self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_cross_platform_project_memory_writes(self) -> None:
        """原生矩阵的构建事实也只能进入 manifest 和最终回复。"""
        source = release.CROSS_PLATFORM_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification"
        mutated = source.replace(anchor, "同步更新项目记忆", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_cross_platform(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_artifact_collection_project_memory_writes(self) -> None:
        """制品收集不得恢复向 Verification 日期卷写构建流水账的旧行为。"""
        source = release.COLLECT_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification"
        mutated = source.replace(anchor, "按日期更新 Verification", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_collect(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)


class TauriBuildSkillValidationTests(unittest.TestCase):
    """验证 macOS xwin 精确路由和签名公证一体语义不能被弱化。"""

    def _validate_mutated_skill(self, source: str) -> list[str]:
        """只替换 Tauri Skill，其他 helper 使用仓库真实文件。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "SKILL.md"
            path.write_text(source, encoding="utf-8")
            errors: list[str] = []
            release.validate_tauri_build_skill_contract(errors, tauri_skill=path)
            return errors

    def _validate_mutated_verify_skill(self, source: str) -> list[str]:
        """只替换交付验收 Skill，确认最终字节复核不能从传播链消失。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "SKILL.md"
            path.write_text(source, encoding="utf-8")
            errors: list[str] = []
            release.validate_tauri_build_skill_contract(errors, verify_skill=path)
            return errors

    def test_rejects_missing_exact_macos_xwin_route(self) -> None:
        """删掉 cargo-xwin、目标三元组或 NSIS 任一部分都必须失败。"""
        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = (
            "CI=true pnpm tauri build --bundles nsis --runner cargo-xwin "
            "--target x86_64-pc-windows-msvc"
        )
        mutated = source.replace(anchor, "CI=true pnpm tauri build", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutated_skill(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_missing_updater_artifact_generation_gate(self) -> None:
        """启用 updater 时不能省略官方制品生成和发布私钥安全来源门禁。"""

        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        for anchor in (
            "bundle.createUpdaterArtifacts: true",
            "TAURI_SIGNING_PRIVATE_KEY",
            "官方 updater archive 与相邻 `.sig`",
        ):
            with self.subTest(anchor=anchor):
                mutated = source.replace(anchor, "omitted-updater-gate")
                self.assertNotEqual(mutated, source)
                errors = self._validate_mutated_skill(mutated)
                self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_treating_unsigned_installers_as_unsigned_updater_artifacts(self) -> None:
        """安装包 unsigned 许可不能弱化 updater archive 签名验证。"""

        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "安装包代码签名与 updater 制品签名是独立门禁"
        mutated = source.replace(anchor, "安装包和更新制品共用 unsigned 结论", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutated_skill(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_missing_all_or_none_notarization_rule(self) -> None:
        """macOS 候选若允许停在仅签名状态，门禁必须确定性失败。"""
        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "不得输出仅 Developer ID 签名但未公证/staple 的 macOS 候选"
        mutated = source.replace(anchor, "允许输出仅签名候选", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutated_skill(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_missing_final_dmg_layout_verification(self) -> None:
        """只声明背景而不检查最终卷时，构建 Skill 必须确定性失败。"""
        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "scripts/verify-dmg-layout.sh <final-dmg>"
        mutated = source.replace(anchor, "只检查 Tauri 配置", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutated_skill(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_missing_project_dmg_background_reference(self) -> None:
        """构建不能回退为隐式或初始化 Skill 内的背景路径。"""
        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "<project-id>_gui/src-tauri/dmg/background.png"
        mutated = source.replace(anchor, "自动寻找任意背景图", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutated_skill(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_missing_bounded_interactive_dmg_strategy(self) -> None:
        """删除 CI/Finder 策略会重新允许空白安装窗口，必须失败。"""
        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "CI=true TAURI_BUNDLER_DMG_IGNORE_CI=1 pnpm tauri build --bundles dmg"
        mutated = source.replace(anchor, "CI=true pnpm tauri build --bundles dmg", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutated_skill(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_missing_per_build_e2e_question(self) -> None:
        """Tauri 构建也必须在测试和编译前解析当次 E2E 选择。"""
        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "否则在任何测试或编译前询问用户一次"
        mutated = source.replace(anchor, "沿用项目历史偏好", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutated_skill(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_missing_complete_frontend_unit_suite(self) -> None:
        """GUI 候选不能只跑筛选后的前端测试。"""
        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "完整单元测试套件"
        mutated = source.replace(anchor, "筛选后的单元测试", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutated_skill(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_tauri_build_project_memory_writes(self) -> None:
        """Tauri 构建结果不得被复制进 ADR、Changelog 或其他项目记忆。"""
        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification"
        mutated = source.replace(anchor, "同步更新项目记忆", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutated_skill(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_missing_milestone_dmg_reverification(self) -> None:
        """里程碑若不重验当前 DMG，旧布局证据可能错误绑定到新字节。"""
        source = release.VERIFY_DELIVERY_SKILL.read_text(encoding="utf-8")
        anchor = "针对 `release/` 中当前最终字节重新运行"
        mutated = source.replace(anchor, "可以沿用构建阶段的历史布局记录", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutated_verify_skill(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

if __name__ == "__main__":
    unittest.main()
