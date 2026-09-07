"""覆盖构建路由与 release ignore 的确定性 validator 回归。"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

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


class ReleaseNotesContractValidationTests(unittest.TestCase):
    """锁定发布日志 helper 的五版/十条、原子写入和固定格式。"""

    def test_rejects_weakened_release_notes_retention(self) -> None:
        """helper 把近五版上限放宽时，Harness 总验证必须失败。"""

        source = release.RELEASE_NOTES_HELPER.read_text(encoding="utf-8")
        mutated = source.replace("MAX_RELEASES = 5", "MAX_RELEASES = 6", 1)
        self.assertNotEqual(mutated, source)
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "release_notes.py"
            path.write_text(mutated, encoding="utf-8")
            errors: list[str] = []
            with mock.patch.object(release, "RELEASE_NOTES_HELPER", path):
                release.validate_release_contract(errors)
        self.assertTrue(any("MAX_RELEASES = 5" in error for error in errors), errors)


class TauriLocalInstallSkillValidationTests(unittest.TestCase):
    """锁定本地 Windows 试包不被升级为发布候选。"""

    @staticmethod
    def _validate(source: str) -> list[str]:
        """在隔离 Skill 上运行本地试包静态合同。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "SKILL.md"
            path.write_text(source, encoding="utf-8")
            errors: list[str] = []
            release.validate_tauri_local_install_contract(errors, local_skill=path)
            return errors

    def test_rejects_local_build_that_enters_release_preparation(self) -> None:
        """本地试包不得要求提交或生成正式发布说明。"""
        source = release.TAURI_LOCAL_INSTALL_SKILL.read_text(encoding="utf-8")
        for anchor in (
            "不得调用 `$desktop-prepare-release`",
            "不得生成、读取、校验或改写 `release-notes.json`",
            "不得创建、刷新或写入项目根 `release/`",
        ):
            with self.subTest(anchor=anchor):
                mutated = source.replace(anchor, "允许进入发布准备", 1)
                self.assertNotEqual(mutated, source)
                errors = self._validate(mutated)
                self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_local_build_that_asks_release_test_choices(self) -> None:
        """E2E/性能选择只属于候选，不得污染普通本地试包。"""
        source = release.TAURI_LOCAL_INSTALL_SKILL.read_text(encoding="utf-8")
        anchor = "本 Skill 不询问 E2E 开/关或性能测试开/关"
        mutated = source.replace(anchor, "本 Skill 每次询问测试选择", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_local_build_without_exact_native_unsigned_command(self) -> None:
        """Windows 试包必须原生、NSIS、x64 且显式不签名。"""
        source = release.TAURI_LOCAL_INSTALL_SKILL.read_text(encoding="utf-8")
        anchor = "pnpm tauri build --bundles nsis --target x86_64-pc-windows-msvc --no-sign"
        mutated = source.replace(anchor, "pnpm tauri build --bundles all", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)


class GuiPerformanceContractValidationTests(unittest.TestCase):
    """锁定每次性能选择以及启用、关闭和 xwin 分支的静态契约。"""

    @staticmethod
    def _validate_mutation(
        source: str,
        *,
        parameter: str,
    ) -> list[str]:
        """只替换一个性能契约来源，其余路径继续使用仓库真实文件。"""

        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "contract.md"
            path.write_text(source, encoding="utf-8")
            errors: list[str] = []
            release.validate_gui_release_performance_contract(
                errors,
                **{parameter: path},
            )
            return errors

    def test_rejects_missing_per_release_performance_question(self) -> None:
        """明确发布未携带选择时，发布入口必须询问一次且不得复用历史值。"""

        source = release.PREPARE_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "产品/渠道硬要求强制启用并记录来源；否则询问用户一次"
        mutated = source.replace(anchor, "沿用上次发布选择", 1)
        self.assertNotEqual(mutated, source)

        errors = self._validate_mutation(mutated, parameter="prepare_skill")

        self.assertTrue(any("否则询问用户一次" in error for error in errors), errors)

    def test_rejects_missing_direct_gui_build_performance_question(self) -> None:
        """直接 GUI 构建缺少选择时，也必须在测试或编译前询问一次。"""

        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "否则在任何测试或编译前询问用户一次，可与尚未解析的 E2E 选择同轮询问"
        mutated = source.replace(anchor, "沿用持久策略", 1)
        self.assertNotEqual(mutated, source)

        errors = self._validate_mutation(mutated, parameter="tauri_skill")

        self.assertTrue(
            any("否则在任何测试或编译前询问用户一次" in error for error in errors),
            errors,
        )

    def test_rejects_disabled_branch_that_leaves_performance_artifacts(self) -> None:
        """关闭分支必须省略探针、证据、豁免和运行时绑定字段。"""

        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = (
            "不创建 `performanceProbe`、`performanceEvidence`、"
            "`performanceThresholdProfile`、`performanceWaiver` 或 "
            "`performanceRuntimeBinding`"
        )
        mutated = source.replace(anchor, "保留旧性能证据以便复用", 1)
        self.assertNotEqual(mutated, source)

        errors = self._validate_mutation(mutated, parameter="tauri_skill")

        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_disabled_branch_without_reason_and_remaining_risk(self) -> None:
        """Not run 必须携带明确关闭原因和剩余性能风险。"""

        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "非空 `performanceReason` 和 `performanceRemainingRisk`"
        mutated = source.replace(anchor, "可省略性能关闭原因与风险", 1)
        self.assertNotEqual(mutated, source)

        errors = self._validate_mutation(mutated, parameter="tauri_skill")

        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_enabled_branch_without_probe_runtime_binding(self) -> None:
        """启用分支必须保留阈值、探针证据及包内运行时绑定。"""

        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = (
            "原生 macOS 且性能启用时记录 `performanceStatus: passed | waived`、"
            "`performanceThresholdProfile: gui-release-v2`"
        )
        mutated = source.replace(anchor, "原生 macOS 直接进入打包", 1)
        self.assertNotEqual(mutated, source)

        errors = self._validate_mutation(mutated, parameter="tauri_skill")

        self.assertTrue(
            any("performanceThresholdProfile: gui-release-v2" in error for error in errors),
            errors,
        )

    def test_rejects_xwin_enabled_branch_that_claims_verified_performance(self) -> None:
        """xwin 在性能启用时仍必须保持 Unverified，不能借用 macOS 采样。"""

        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "性能选择为 `enabled` 时 `performanceStatus` 为 `Unverified`"
        mutated = source.replace(anchor, "性能选择为 `enabled` 时记录为 `passed`", 1)
        self.assertNotEqual(mutated, source)

        errors = self._validate_mutation(mutated, parameter="tauri_skill")

        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_missing_native_windows_performance_branch(self) -> None:
        """Windows 原生候选必须能运行真实探针，不能沿用 xwin 的 Unverified。"""
        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "原生 Windows 且性能启用时使用相同的 `performanceStatus: passed | waived`"
        mutated = source.replace(anchor, "Windows 原生性能固定 Unverified", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutation(mutated, parameter="tauri_skill")
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_unconditional_xwin_unverified_status(self) -> None:
        """xwin 只有在性能启用时才是 Unverified，关闭时必须保持 Not run。"""

        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = (
            "只在 `performanceSelection: enabled` 时记录 "
            "`performanceStatus: Unverified`"
        )
        mutated = source.replace(
            anchor,
            "固定记录 `performanceStatus: Unverified`",
            1,
        )
        self.assertNotEqual(mutated, source)

        errors = self._validate_mutation(mutated, parameter="tauri_skill")

        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_removing_product_or_channel_performance_priority(self) -> None:
        """产品或渠道硬要求必须覆盖用户关闭选择并强制执行门禁。"""

        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "产品/渠道硬要求强制为 `enabled` 并记录来源"
        mutated = source.replace(anchor, "产品/渠道要求可以忽略", 1)
        self.assertNotEqual(mutated, source)

        errors = self._validate_mutation(mutated, parameter="tauri_skill")

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

    def test_rejects_missing_exact_native_windows_route(self) -> None:
        """Windows 原生候选不得退化成 xwin 或无目标的模糊命令。"""
        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = (
            "pnpm tauri build --bundles nsis --target x86_64-pc-windows-msvc "
            "--config src-tauri/tauri.release.conf.json"
        )
        mutated = source.replace(anchor, "pnpm tauri build --runner cargo-xwin", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutated_skill(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_native_windows_route_that_claims_runtime_verified(self) -> None:
        """原生编译成功不能代替真实安装和运行验收。"""
        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = (
            "在最终候选 E2E/验收真实执行安装和运行之前，固定记录 "
            "`runtimeVerification: Unverified`"
        )
        mutated = source.replace(anchor, "构建成功后固定记录 `runtimeVerification: passed`", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutated_skill(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_missing_windows_powershell_release_helper(self) -> None:
        """Windows GUI-only 下游不能依赖已裁掉的 CLI Skill 或 POSIX shell。"""
        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "scripts/prepare-release-directory.ps1 -ProjectRoot <project-root>"
        mutated = source.replace(anchor, "scripts/prepare-release-directory.sh <project-root>", 1)
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
