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
            profile_path.write_text(json.dumps(profile), encoding="utf-8")
            errors: list[str] = []
            validate_gui_support_contract(
                errors,
                brand_root=brand_root,
                product_instance_path=root / "GUI_SUPPORT_SURFACES.md",
            )
        self.assertTrue(any("prices must remain" in error for error in errors), errors)
        self.assertTrue(any("support contact drifted" in error for error in errors), errors)

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
