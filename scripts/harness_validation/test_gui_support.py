"""GUI 支持界面 Skill 的中性化与失败关闭回归。"""

from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path

from .context import (
    GUI_SUPPORT_BRAND_ROOT,
    GUI_SUPPORT_METADATA,
    GUI_SUPPORT_REFERENCE,
    GUI_SUPPORT_SKILL,
)
from .gui_support import validate_gui_support_contract


class GuiSupportContractTests(unittest.TestCase):
    """锁定完整品牌包并防止来源产品实例或弱化边界进入 Harness。"""

    def test_current_brand_contract_is_complete_and_product_isolated(self) -> None:
        """当前 Skill 必须完整且模板中没有下游产品实例文档。"""

        errors: list[str] = []
        validate_gui_support_contract(errors)
        self.assertEqual(errors, [])

    def test_fixed_remote_uri_is_rejected(self) -> None:
        """任何可直接调用的固定远程地址进入 Skill 时都必须失败。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            skill = root / "SKILL.md"
            reference = root / "reference.md"
            metadata = root / "openai.yaml"
            skill.write_text(
                GUI_SUPPORT_SKILL.read_text(encoding="utf-8")
                + "\n固定地址：https://updates.invalid/check\n",
                encoding="utf-8",
            )
            reference.write_bytes(GUI_SUPPORT_REFERENCE.read_bytes())
            metadata.write_bytes(GUI_SUPPORT_METADATA.read_bytes())
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                skill_path=skill,
                reference_path=reference,
                metadata_path=metadata,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertTrue(any("fixed remote URI" in error for error in errors), errors)

    def test_product_instance_document_is_rejected_in_template(self) -> None:
        """产品实例只能由终端下游按需创建，不能成为模板默认值。"""

        with tempfile.TemporaryDirectory() as directory:
            instance = Path(directory) / "GUI_SUPPORT_SURFACES.md"
            instance.write_text("# product instance\n", encoding="utf-8")
            errors: list[str] = []
            validate_gui_support_contract(errors, product_instance_path=instance)
        self.assertTrue(any("must not precreate" in error for error in errors), errors)

    def test_missing_safe_secret_source_rule_is_rejected(self) -> None:
        """删除运行时秘密来源边界时应产生确定性错误。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            skill = root / "SKILL.md"
            reference = root / "reference.md"
            metadata = root / "openai.yaml"
            skill.write_text(
                GUI_SUPPORT_SKILL.read_text(encoding="utf-8").replace(
                    "秘密只能由已批准的安全运行时来源提供",
                    "秘密由实现自行决定",
                    1,
                ),
                encoding="utf-8",
            )
            reference.write_bytes(GUI_SUPPORT_REFERENCE.read_bytes())
            metadata.write_bytes(GUI_SUPPORT_METADATA.read_bytes())
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                skill_path=skill,
                reference_path=reference,
                metadata_path=metadata,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertTrue(any("安全运行时来源" in error for error in errors), errors)

    def _copy_brand_root(self, parent: Path) -> Path:
        """复制完整品牌资产到隔离目录，供破坏性负向回归使用。"""

        destination = parent / "brand-support"
        shutil.copytree(GUI_SUPPORT_BRAND_ROOT, destination)
        return destination

    def test_brand_media_byte_drift_is_rejected(self) -> None:
        """任一图片字节变化时，摘要、大小或格式门禁必须失败。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            brand_root = self._copy_brand_root(root)
            target = brand_root / "media" / "sponsor" / "arrow.png"
            target.write_bytes(target.read_bytes() + b"drift")
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                brand_root=brand_root,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertTrue(any("mismatch" in error for error in errors), errors)

    def test_missing_optional_small_image_is_rejected(self) -> None:
        """当前未引用小图仍属于完整品牌包，缺失时必须失败。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            brand_root = self._copy_brand_root(root)
            (brand_root / "media" / "sponsor" / "select.png").unlink()
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                brand_root=brand_root,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertTrue(any("media file set mismatch" in error for error in errors), errors)

    def test_fixed_brand_price_or_contact_drift_is_rejected(self) -> None:
        """未经重新确认的价格或联系人变化不能静默进入品牌包。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            brand_root = self._copy_brand_root(root)
            profile_path = brand_root / "brand-support-profile.json"
            profile = json.loads(profile_path.read_text(encoding="utf-8"))
            profile["sponsor"]["tiers"][0]["price"] = 20
            profile["contacts"]["support"]["value"] = "0000000"
            profile["contacts"]["windowTitle"]["value"] = "2222580"
            profile_path.write_text(json.dumps(profile), encoding="utf-8")
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                brand_root=brand_root,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertTrue(any("prices must remain" in error for error in errors), errors)
        self.assertTrue(any("support contact drifted" in error for error in errors), errors)
        self.assertTrue(any("windowTitle contact drifted" in error for error in errors), errors)

    def test_missing_fixed_disclaimer_is_rejected(self) -> None:
        """关于页免责声明文案或模板缺失时必须失败。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            brand_root = self._copy_brand_root(root)
            translations = brand_root / "i18n" / "zh-CN.json"
            zh = json.loads(translations.read_text(encoding="utf-8"))
            zh["about"].pop("disclaimer_2")
            translations.write_text(json.dumps(zh), encoding="utf-8")
            about = brand_root / "react" / "AboutPageTemplate.tsx"
            about.write_text(
                about.read_text(encoding="utf-8").replace(
                    '          <List.Item>{t("about.disclaimer_3")}</List.Item>\n',
                    "",
                    1,
                ),
                encoding="utf-8",
            )
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                brand_root=brand_root,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertTrue(any("brand about copy" in error for error in errors), errors)
        self.assertTrue(any("about.disclaimer_3" in error for error in errors), errors)

    def test_default_tray_or_navigation_copy_drift_is_rejected(self) -> None:
        """初始化托盘和应用菜单的固定翻译不能静默漂移。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            brand_root = self._copy_brand_root(root)
            translations = brand_root / "i18n" / "en-US.json"
            en = json.loads(translations.read_text(encoding="utf-8"))
            en["tray"]["quit"] = "Exit now"
            en["navigation"].pop("sponsor")
            translations.write_text(json.dumps(en), encoding="utf-8")
            native = brand_root / "rust-i18n" / "en-US.yml"
            native.write_text(
                native.read_text(encoding="utf-8").replace("show_window: Show Window", ""),
                encoding="utf-8",
            )
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                brand_root=brand_root,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertTrue(any("brand tray copy drifted" in error for error in errors), errors)
        self.assertTrue(
            any("brand navigation copy drifted" in error for error in errors), errors
        )
        self.assertTrue(any("show_window: Show Window" in error for error in errors), errors)

    def test_release_note_locale_format_drift_is_rejected(self) -> None:
        """英文界面不得回退为中文标题或偏离 locale 对应的固定结构。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            brand_root = self._copy_brand_root(root)
            translations = brand_root / "i18n" / "en-US.json"
            en = json.loads(translations.read_text(encoding="utf-8"))
            en["release_notes"]["feature_optimizations"] = "###功能优化"
            translations.write_text(json.dumps(en), encoding="utf-8")
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                brand_root=brand_root,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertTrue(any("release-note fixed format drifted" in error for error in errors), errors)

    def test_fixed_bottom_navigation_order_drift_is_rejected(self) -> None:
        """已选底部项必须保持赞助、设置、关于的视觉顺序。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            brand_root = self._copy_brand_root(root)
            navigation = brand_root / "react" / "supportNavigation.ts"
            source = navigation.read_text(encoding="utf-8")
            source = source.replace(
                "items.push(AVAILABLE_SUPPORT_NAVIGATION_ITEMS.sponsor)",
                "items.push(AVAILABLE_SUPPORT_NAVIGATION_ITEMS.temporary)",
                1,
            )
            source = source.replace(
                "items.push(AVAILABLE_SUPPORT_NAVIGATION_ITEMS.about)",
                "items.push(AVAILABLE_SUPPORT_NAVIGATION_ITEMS.sponsor)",
                1,
            )
            source = source.replace(
                "items.push(AVAILABLE_SUPPORT_NAVIGATION_ITEMS.temporary)",
                "items.push(AVAILABLE_SUPPORT_NAVIGATION_ITEMS.about)",
                1,
            )
            navigation.write_text(source, encoding="utf-8")
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                brand_root=brand_root,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertTrue(any("sponsor/settings/about" in error for error in errors), errors)

    def test_sidebar_identity_or_mode_layout_drift_is_rejected(self) -> None:
        """两种侧栏必须保持身份顺序、固定尺寸和各自导航布局。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            brand_root = self._copy_brand_root(root)
            sidebar = brand_root / "react" / "AppSidebarTemplate.tsx"
            source = sidebar.read_text(encoding="utf-8")
            source = source.replace(
                "compact: 80",
                "compact: 79",
                1,
            )
            source = source.replace(
                "detailedCollapsed: 76",
                "detailedCollapsed: 70",
                1,
            )
            source = source.replace(
                "detailedExpanded: 248",
                "detailedExpanded: 240",
                1,
            )
            source = source.replace(
                "APP_SIDEBAR_NAV_ICON_SIZE_PX = 22",
                "APP_SIDEBAR_NAV_ICON_SIZE_PX = 21",
                1,
            )
            source = source.replace(
                "APP_SIDEBAR_COMPACT_PADDING_PX = 6",
                "APP_SIDEBAR_COMPACT_PADDING_PX = 5",
                1,
            )
            source = source.replace(
                "APP_SIDEBAR_ICON_STROKE_WIDTH = 1.75",
                "APP_SIDEBAR_ICON_STROKE_WIDTH = 2",
                1,
            )
            source = source.replace(
                'data-testid="app-sidebar-logo"',
                'data-testid="temporary-sidebar-item"',
                1,
            )
            source = source.replace(
                'data-testid="app-sidebar-version"',
                'data-testid="app-sidebar-logo"',
                1,
            )
            source = source.replace(
                'data-testid="temporary-sidebar-item"',
                'data-testid="app-sidebar-version"',
                1,
            )
            source = source.replace(
                'from "@tabler/icons-react"',
                'from "@example/icons"',
                1,
            )
            source = source.replace(
                'compact ? "icon-above-label" : iconOnly ? "icon-only" : "icon-with-label"',
                'compact ? "horizontal" : iconOnly ? "hidden" : "icon-with-label"',
                1,
            )
            sidebar.write_text(source, encoding="utf-8")
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                brand_root=brand_root,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertTrue(any("compact: 80" in error for error in errors), errors)
        self.assertTrue(any("detailedCollapsed: 76" in error for error in errors), errors)
        self.assertTrue(any("detailedExpanded: 248" in error for error in errors), errors)
        self.assertTrue(any("APP_SIDEBAR_NAV_ICON_SIZE_PX" in error for error in errors), errors)
        self.assertTrue(any("APP_SIDEBAR_COMPACT_PADDING_PX" in error for error in errors), errors)
        self.assertTrue(
            any("APP_SIDEBAR_ICON_STROKE_WIDTH" in error for error in errors),
            errors,
        )
        self.assertTrue(any("logo must render above" in error for error in errors), errors)
        self.assertTrue(any("@tabler/icons-react" in error for error in errors), errors)
        self.assertTrue(any("icon-above-label" in error for error in errors), errors)

    def test_compact_sidebar_fixed_em_label_box_is_rejected(self) -> None:
        """精简侧栏名称必须使用完整可用宽度，不能恢复固定 em/ch 占位盒。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            brand_root = self._copy_brand_root(root)
            sidebar = brand_root / "react" / "AppSidebarTemplate.tsx"
            source = sidebar.read_text(encoding="utf-8").replace(
                'width: "100%",',
                'width: "10em",',
                1,
            )
            sidebar.write_text(source, encoding="utf-8")
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                brand_root=brand_root,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertTrue(any("fixed em/ch boxes" in error for error in errors), errors)

    def test_detailed_sidebar_default_persistence_or_tooltip_drift_is_rejected(self) -> None:
        """详细侧栏必须默认展开，并使用独立设备偏好和 Tooltip。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            brand_root = self._copy_brand_root(root)
            sidebar = brand_root / "react" / "AppSidebarTemplate.tsx"
            source = sidebar.read_text(encoding="utf-8")
            source = source.replace(
                "DEFAULT_DETAILED_SIDEBAR_COLLAPSED = false",
                "DEFAULT_DETAILED_SIDEBAR_COLLAPSED = true",
                1,
            )
            source = source.replace(
                "window.localStorage.getItem",
                "window.sessionStorage.getItem",
                1,
            )
            source = source.replace("<Tooltip", "<Popover", 1)
            sidebar.write_text(source, encoding="utf-8")
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                brand_root=brand_root,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertTrue(
            any("DEFAULT_DETAILED_SIDEBAR_COLLAPSED = false" in error for error in errors),
            errors,
        )
        self.assertTrue(any("window.localStorage.getItem" in error for error in errors), errors)
        self.assertTrue(any("<Tooltip" in error for error in errors), errors)

    def test_detailed_app_shell_width_sync_drift_is_rejected(self) -> None:
        """详细 AppShell 必须同时更新 Mantine 偏移和可观察宽度属性。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            brand_root = self._copy_brand_root(root)
            shell = brand_root / "react" / "AppShellTemplate.tsx"
            source = shell.read_text(encoding="utf-8")
            source = source.replace(
                "navbar={{ width: navbarWidth }}",
                "navbar={{ width: 248 }}",
                1,
            )
            source = source.replace(
                "data-navbar-width={navbarWidth}",
                "data-navbar-width={248}",
                1,
            )
            shell.write_text(source, encoding="utf-8")
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                brand_root=brand_root,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertTrue(any("navbar={{ width: navbarWidth }}" in error for error in errors), errors)
        self.assertTrue(any("data-navbar-width={navbarWidth}" in error for error in errors), errors)

    def test_default_settings_privacy_surface_is_rejected(self) -> None:
        """初始化设置页不得恢复隐私标题、统计开关或对应固定翻译键。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            brand_root = self._copy_brand_root(root)
            settings = brand_root / "react" / "SettingsPageTemplate.tsx"
            settings.write_text(
                settings.read_text(encoding="utf-8")
                + '\nconst usageReportingConsent = false;\nconst removed = t("settings.privacy_title");\n',
                encoding="utf-8",
            )
            translations = brand_root / "i18n" / "zh-CN.json"
            zh = json.loads(translations.read_text(encoding="utf-8"))
            zh["settings"]["privacy_title"] = "隐私"
            translations.write_text(json.dumps(zh), encoding="utf-8")
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                brand_root=brand_root,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertTrue(any("forbidden privacy surface" in error for error in errors), errors)
        self.assertTrue(any("fixed UI keys drifted" in error for error in errors), errors)

    def test_sponsor_theme_adaptation_drift_is_rejected(self) -> None:
        """赞助页不能冻结成单一主题或丢失运行时主题标记。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            brand_root = self._copy_brand_root(root)
            sponsor = brand_root / "react" / "SponsorPageTemplate.tsx"
            source = sponsor.read_text(encoding="utf-8")
            source = source.replace("useComputedColorScheme", "useMantineTheme")
            source = source.replace(
                'data-color-scheme={colorScheme}',
                'data-theme="light"',
            )
            sponsor.write_text(source, encoding="utf-8")
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                brand_root=brand_root,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertTrue(any("useComputedColorScheme" in error for error in errors), errors)
        self.assertTrue(any("data-color-scheme" in error for error in errors), errors)

    def test_missing_about_update_settings_theme_or_gate_is_rejected(self) -> None:
        """关于页更新、设置页主题和根级强更门都不能被静默删除。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            brand_root = self._copy_brand_root(root)
            settings = brand_root / "react" / "SettingsPageTemplate.tsx"
            settings.write_text(
                settings.read_text(encoding="utf-8").replace(
                    't("settings.theme_system")',
                    't("settings.title")',
                    1,
                ),
                encoding="utf-8",
            )
            about = brand_root / "react" / "AboutPageTemplate.tsx"
            about.write_text(
                about.read_text(encoding="utf-8").replace(
                    't("about.check_for_updates")',
                    't("about.version")',
                    1,
                ),
                encoding="utf-8",
            )
            gate = brand_root / "react" / "MandatoryUpdateGateTemplate.tsx"
            gate.write_text(
                gate.read_text(encoding="utf-8").replace(
                    'role="alertdialog"',
                    'role="dialog"',
                    1,
                ),
                encoding="utf-8",
            )
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                brand_root=brand_root,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertTrue(any("settings.theme_system" in error for error in errors), errors)
        self.assertTrue(any("about.check_for_updates" in error for error in errors), errors)
        self.assertTrue(any('role="alertdialog"' in error for error in errors), errors)

    def test_about_parent_action_proxy_is_rejected(self) -> None:
        """关于页更新区父容器不能代理检查更新或更新日志按钮动作。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            brand_root = self._copy_brand_root(root)
            about = brand_root / "react" / "AboutPageTemplate.tsx"
            about.write_text(
                about.read_text(encoding="utf-8").replace(
                    '<Paper data-testid="about-update-section"',
                    '<Paper data-testid="about-update-section" onClick={onCheckForUpdates}',
                    1,
                ),
                encoding="utf-8",
            )
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                brand_root=brand_root,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertTrue(any("must not proxy child button actions" in error for error in errors), errors)

    def test_release_notes_limit_or_display_version_formatter_is_rejected(self) -> None:
        """五版/十条上限与统一 v 前缀格式器缺失时必须失败。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            brand_root = self._copy_brand_root(root)
            release_notes = brand_root / "react" / "releaseNotes.ts"
            release_notes.write_text(
                release_notes.read_text(encoding="utf-8")
                .replace("MAX_VISIBLE_RELEASE_NOTE_VERSIONS = 5", "MAX_VISIBLE_RELEASE_NOTE_VERSIONS = 6")
                .replace("MAX_VISIBLE_RELEASE_NOTE_ITEMS = 10", "MAX_VISIBLE_RELEASE_NOTE_ITEMS = 11"),
                encoding="utf-8",
            )
            display_version = brand_root / "react" / "displayVersion.ts"
            display_version.write_text(
                display_version.read_text(encoding="utf-8").replace(
                    "return `v${normalized}`", "return normalized", 1
                ),
                encoding="utf-8",
            )
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                brand_root=brand_root,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertTrue(any("MAX_VISIBLE_RELEASE_NOTE_VERSIONS = 5" in error for error in errors), errors)
        self.assertTrue(any("MAX_VISIBLE_RELEASE_NOTE_ITEMS = 10" in error for error in errors), errors)
        self.assertTrue(any("return `v${normalized}`" in error for error in errors), errors)

    def test_release_notes_runtime_loader_or_command_is_rejected_when_missing(self) -> None:
        """候选资源前端加载器与窄 Rust 命令都属于必需模板。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            brand_root = self._copy_brand_root(root)
            (brand_root / "react" / "releaseNotesResource.ts").unlink()
            rust = brand_root / "rust" / "release_notes.rs"
            rust.write_text(
                rust.read_text(encoding="utf-8").replace(
                    "pub async fn load_release_notes",
                    "pub async fn renamed_release_notes",
                    1,
                ),
                encoding="utf-8",
            )
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                brand_root=brand_root,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertTrue(any("releaseNotesResource.ts" in error for error in errors), errors)
        self.assertTrue(any("pub async fn load_release_notes" in error for error in errors), errors)

    def test_localized_release_note_raw_byte_fixture_is_rejected(self) -> None:
        """Rust raw byte string 不能承载非 ASCII 本地化测试文本。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            brand_root = self._copy_brand_root(root)
            rust = brand_root / "rust" / "release_notes.rs"
            rust.write_text(
                rust.read_text(encoding="utf-8")
                + '\nconst INVALID_LOCALIZED_FIXTURE: &[u8] = br#"中文"#;\n',
                encoding="utf-8",
            )
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                brand_root=brand_root,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertTrue(any("raw byte strings" in error for error in errors), errors)

    def test_ascii_release_note_raw_byte_fixture_is_allowed(self) -> None:
        """ASCII raw byte string 不应被本地化文本门禁误判。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            brand_root = self._copy_brand_root(root)
            rust = brand_root / "rust" / "release_notes.rs"
            rust.write_text(
                rust.read_text(encoding="utf-8")
                + '\nconst ASCII_FIXTURE: &[u8] = br##"release-notes"##;\n',
                encoding="utf-8",
            )
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                brand_root=brand_root,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertFalse(any("raw byte strings" in error for error in errors), errors)

    def test_commented_localized_raw_byte_example_is_allowed(self) -> None:
        """注释中的本地化 raw byte 示例不属于可执行 Rust fixture。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            brand_root = self._copy_brand_root(root)
            rust = brand_root / "rust" / "release_notes.rs"
            rust.write_text(
                rust.read_text(encoding="utf-8")
                + '\n// br#"中文"#\n/* nested /* br##"中文"## */ comment */\n',
                encoding="utf-8",
            )
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                brand_root=brand_root,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertFalse(any("raw byte strings" in error for error in errors), errors)

    def test_release_notes_release_config_mapping_drift_is_rejected(self) -> None:
        """发布专用 Tauri 配置不得改名、嵌套或附带第二资源。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            brand_root = self._copy_brand_root(root)
            config = brand_root / "tauri" / "tauri.release.conf.json"
            config.write_text(
                '{"bundle":{"resources":{"../../release-notes.json":"nested/release-notes.json"}}}\n',
                encoding="utf-8",
            )
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                brand_root=brand_root,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertTrue(any("fixed release-notes resource mapping" in error for error in errors), errors)

    def test_page_session_state_persistence_or_empty_page_regression_is_rejected(self) -> None:
        """页面会话不得落盘，且成功空页回退和新进程默认值回归不可删除。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            brand_root = self._copy_brand_root(root)
            session_state = brand_root / "react" / "pageSessionState.ts"
            session_state.write_text(
                session_state.read_text(encoding="utf-8")
                .replace(
                    'import { atom } from "jotai";',
                    'import { atomWithStorage as atom } from "jotai/utils";',
                    1,
                )
                .replace(
                    'result.status !== "success"',
                    'result.status === "loading"',
                    1,
                )
                .replace(
                    "page: pageSize === current.pageSize ? page : 1",
                    "page",
                    1,
                )
                .replace(
                    "query: selection.query,\n        page: 1,",
                    "query: selection.query,\n        page: current.page,",
                    1,
                ),
                encoding="utf-8",
            )
            session_tests = brand_root / "react" / "PageSessionState.test.ts"
            session_tests.write_text(
                session_tests.read_text(encoding="utf-8").replace(
                    "starts from defaults in a new application store",
                    "keeps state forever",
                    1,
                ).replace(
                    "resets to page one when the page size changes",
                    "keeps the stale page when the page size changes",
                    1,
                ).replace(
                    "resets to page one when the tab or query scope changes",
                    "keeps the stale page when the query changes",
                    1,
                ),
                encoding="utf-8",
            )
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                brand_root=brand_root,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertTrue(any("process-memory only" in error for error in errors), errors)
        self.assertTrue(any('result.status !== "success"' in error for error in errors), errors)
        self.assertTrue(any("pageSize === current.pageSize" in error for error in errors), errors)
        self.assertTrue(any("page size changes" in error for error in errors), errors)
        self.assertTrue(any("query: selection.query" in error for error in errors), errors)
        self.assertTrue(any("query scope changes" in error for error in errors), errors)
        self.assertTrue(any("starts from defaults" in error for error in errors), errors)

    def test_missing_application_theme_contract_is_rejected(self) -> None:
        """初始化主题必须同时保留亮暗语义变量和系统跟随。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            brand_root = self._copy_brand_root(root)
            theme = brand_root / "react" / "AppThemeProviderTemplate.tsx"
            source = theme.read_text(encoding="utf-8")
            source = source.replace(
                'defaultColorScheme="auto"', 'defaultColorScheme="light"'
            )
            source = source.replace('"--app-text"', '"--app-foreground"')
            theme.write_text(source, encoding="utf-8")
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                brand_root=brand_root,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertTrue(
            any('defaultColorScheme="auto"' in error for error in errors), errors
        )
        self.assertTrue(any('"--app-text"' in error for error in errors), errors)

    def test_downstream_product_fields_are_rejected_from_brand_profile(self) -> None:
        """品牌例外不能借机携带来源下游产品名或路由字段。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            brand_root = self._copy_brand_root(root)
            profile_path = brand_root / "brand-support-profile.json"
            profile = json.loads(profile_path.read_text(encoding="utf-8"))
            profile["productName"] = "source product"
            profile["route"] = "/source"
            profile_path.write_text(json.dumps(profile), encoding="utf-8")
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                brand_root=brand_root,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertTrue(any("downstream product fields" in error for error in errors), errors)

    def test_unsafe_manifest_path_is_rejected(self) -> None:
        """清单路径不能跳出品牌根或把外部文件伪装成媒体。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            brand_root = self._copy_brand_root(root)
            manifest_path = brand_root / "media-manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["assets"][0]["sourcePath"] = "../outside.png"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                brand_root=brand_root,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertTrue(any("unsafe asset path" in error for error in errors), errors)

    def test_fixed_desktop_sponsor_layout_is_rejected(self) -> None:
        """恢复固定三栏或 800px 最小宽度时必须失败。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            brand_root = self._copy_brand_root(root)
            sponsor = brand_root / "react" / "SponsorPageTemplate.tsx"
            sponsor.write_text(
                sponsor.read_text(encoding="utf-8").replace(
                    "cols={{ base: 1, sm: 2, lg: 3 }}",
                    "cols={3}",
                    1,
                ),
                encoding="utf-8",
            )
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                brand_root=brand_root,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertTrue(any("unsafe fixed layout" in error for error in errors), errors)

    def test_host_capability_failure_must_reread_authoritative_state(self) -> None:
        """通知与自启 mutation 失败后不能只恢复旧组件值。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            brand_root = self._copy_brand_root(root)
            settings = brand_root / "react" / "SettingsPageTemplate.tsx"
            settings.write_text(
                settings.read_text(encoding="utf-8")
                .replace(
                    "setChecked(await capability.getEnabled());",
                    "setChecked(capability.enabled);",
                    1,
                )
                .replace(
                    "getEnabled: () => Promise<boolean>;",
                    "getEnabled: () => void;",
                    1,
                ),
                encoding="utf-8",
            )
            tests = brand_root / "react" / "CapabilitySwitchTemplate.test.tsx"
            tests.write_text(
                tests.read_text(encoding="utf-8").replace(
                    "autostart_switch_rolls_back_after_failure",
                    "autostart_switch_restores_previous_component_value",
                    1,
                ),
                encoding="utf-8",
            )
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                brand_root=brand_root,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertTrue(any("getEnabled" in error for error in errors), errors)
        self.assertTrue(
            any("autostart_switch_rolls_back_after_failure" in error for error in errors),
            errors,
        )

    def test_host_capability_switch_keeps_accessible_description(self) -> None:
        """拆分视觉标题和说明后，Switch 仍须保留程序化语义关联。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            brand_root = self._copy_brand_root(root)
            settings = brand_root / "react" / "SettingsPageTemplate.tsx"
            settings.write_text(
                settings.read_text(encoding="utf-8").replace(
                    "aria-describedby={descriptionId}",
                    "aria-label={title}",
                    1,
                ),
                encoding="utf-8",
            )
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                brand_root=brand_root,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertTrue(
            any("aria-describedby={descriptionId}" in error for error in errors),
            errors,
        )

    def test_video_autoplay_or_missing_transcript_contract_is_rejected(self) -> None:
        """视频模板不能自动播放，也不能删除文字稿字段。"""

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            brand_root = self._copy_brand_root(root)
            media = brand_root / "react" / "SupportMedia.tsx"
            media.write_text(
                media.read_text(encoding="utf-8")
                .replace("controls\n", "autoPlay\n        controls\n", 1)
                .replace("transcriptHref", "transcriptPath"),
                encoding="utf-8",
            )
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                brand_root=brand_root,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertTrue(any("autoPlay" in error for error in errors), errors)
        self.assertTrue(any("transcriptHref" in error for error in errors), errors)


if __name__ == "__main__":
    unittest.main()
