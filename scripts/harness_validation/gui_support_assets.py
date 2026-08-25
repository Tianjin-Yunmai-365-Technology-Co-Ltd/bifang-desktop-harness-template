"""校验共享 GUI 品牌 profile、翻译清单与原始图片字节。"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any

from .context import display_path, fail


SAFE_RELATIVE_PATH = re.compile(r"^[A-Za-z0-9._/-]+$")

EXPECTED_MEDIA = {
    "media/sponsor/arrow.png": "brand-optional-currently-unreferenced",
    "media/sponsor/bg.jpg": "brand-presentation",
    "media/sponsor/icon1.png": "brand-optional-currently-unreferenced",
    "media/sponsor/icon2.png": "brand-optional-currently-unreferenced",
    "media/sponsor/icon3.png": "brand-optional-currently-unreferenced",
    "media/sponsor/icon4.png": "brand-optional-currently-unreferenced",
    "media/sponsor/img1.png": "brand-presentation",
    "media/sponsor/img2.png": "brand-presentation",
    "media/sponsor/img3.png": "brand-presentation",
    "media/sponsor/pay1.png": "sensitive-payment-qr",
    "media/sponsor/pay2.png": "sensitive-payment-qr",
    "media/sponsor/select.png": "brand-optional-currently-unreferenced",
    "media/updater/banner.jpg": "brand-presentation",
}

EXPECTED_ABOUT_KEYS = {
    "version",
    "contact_author_title",
    "support_thanks",
    "studio",
    "contact_label",
    "update_title",
    "check_for_updates",
    "disclaimer_title",
    "disclaimer_1",
    "disclaimer_2",
    "disclaimer_3",
}

EXPECTED_ABOUT_COPY = {
    "zh-CN": {
        "studio": "守城工作室",
        "disclaimer_title": "免责声明",
        "disclaimer_1": "本软件/服务仅供学习研究和合法合规使用，严禁用于任何违反中华人民共和国法律法规的活动",
        "disclaimer_2": "用户在使用本软件/服务过程中的所有行为及其后果由用户自行承担全部法律责任，与开发者、运营方无关",
        "disclaimer_3": "您下载、安装、使用本软件/服务即视为已充分阅读、理解并同意接受本声明的全部内容",
    },
    "en-US": {
        "studio": "Shoucheng Studio",
        "disclaimer_title": "Disclaimer",
        "disclaimer_1": "This software/service is for learning, research, and lawful use only. Any activity that violates the laws of the People’s Republic of China is strictly prohibited.",
        "disclaimer_2": "Users are solely responsible for all actions taken while using this software/service and their consequences. The developers and operators bear no legal liability.",
        "disclaimer_3": "Downloading, installing, or using this software/service means you have read, understood, and accepted this disclaimer in full.",
    },
}

EXPECTED_LOCAL_UI_COPY = {
    "zh-CN": {
        "navigation": {"about": "关于", "settings": "设置", "sponsor": "赞助"},
        "tray": {"show_window": "显示窗口", "quit": "退出"},
    },
    "en-US": {
        "navigation": {
            "about": "About",
            "settings": "Settings",
            "sponsor": "Sponsor",
        },
        "tray": {"show_window": "Show Window", "quit": "Quit"},
    },
}

EXPECTED_FIXED_UI_KEYS = {
    "sidebar": {
        "application_navigation",
        "logo_alt",
        "version",
    },
    "settings": {
        "title",
        "language_title",
        "language_description",
        "language_zh_cn",
        "language_en_us",
        "theme_title",
        "theme_description",
        "theme_light",
        "theme_dark",
        "theme_system",
    },
    "updater": {
        "banner_alt",
        "status_not_configured",
        "status_idle",
        "status_checking",
        "status_up_to_date",
        "status_optional_update",
        "status_required_update",
        "status_failed",
        "current_version",
        "available_version",
        "required_badge",
        "required_title",
        "required_description",
        "version_transition",
        "install_update",
        "exit_application",
    },
}

FORBIDDEN_PRODUCT_KEYS = {
    "appCode",
    "appId",
    "app_name",
    "app_tagline",
    "baseUrl",
    "endpoint",
    "productId",
    "productName",
    "route",
    "secret",
    "telemetry",
}


def _walk_keys(value: Any) -> set[str]:
    """递归收集 JSON 字段名以拒绝来源产品实例结构。"""

    if isinstance(value, dict):
        keys = set(value)
        for child in value.values():
            keys.update(_walk_keys(child))
        return keys
    if isinstance(value, list):
        keys: set[str] = set()
        for child in value:
            keys.update(_walk_keys(child))
        return keys
    return set()


def _jpeg_dimensions(data: bytes) -> tuple[int, int]:
    """从 JPEG SOF 段读取宽高，不依赖宿主图像库。"""

    position = 2
    sof_markers = {
        0xC0,
        0xC1,
        0xC2,
        0xC3,
        0xC5,
        0xC6,
        0xC7,
        0xC9,
        0xCA,
        0xCB,
        0xCD,
        0xCE,
        0xCF,
    }
    while position + 4 <= len(data):
        if data[position] != 0xFF:
            position += 1
            continue
        while position < len(data) and data[position] == 0xFF:
            position += 1
        if position >= len(data):
            break
        marker = data[position]
        position += 1
        if marker in {0x01, *range(0xD0, 0xD9)}:
            continue
        if position + 2 > len(data):
            break
        segment_length = int.from_bytes(data[position : position + 2], "big")
        if segment_length < 2 or position + segment_length > len(data):
            break
        if marker in sof_markers and segment_length >= 7:
            height = int.from_bytes(data[position + 3 : position + 5], "big")
            width = int.from_bytes(data[position + 5 : position + 7], "big")
            return width, height
        position += segment_length
    raise ValueError("JPEG has no readable SOF dimensions")


def _image_facts(path: Path) -> dict[str, Any]:
    """计算图片 MIME、尺寸、字节数和 SHA-256。"""

    data = path.read_bytes()
    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
        mime_type = "image/png"
        width = int.from_bytes(data[16:20], "big")
        height = int.from_bytes(data[20:24], "big")
    elif data.startswith(b"\xff\xd8"):
        mime_type = "image/jpeg"
        width, height = _jpeg_dimensions(data)
    else:
        raise ValueError("unsupported or corrupt image signature")
    return {
        "height": height,
        "mimeType": mime_type,
        "sha256": hashlib.sha256(data).hexdigest(),
        "sizeBytes": len(data),
        "width": width,
    }


def _safe_manifest_path(value: Any) -> bool:
    """判断 manifest 路径是否为品牌根内的规范相对路径。"""

    return (
        isinstance(value, str)
        and bool(SAFE_RELATIVE_PATH.fullmatch(value))
        and not value.startswith("/")
        and ".." not in Path(value).parts
        and "\\" not in value
    )


def validate_brand_profile(
    errors: list[str], profile: dict[str, Any], path: Path
) -> None:
    """锁定项目负责人批准的品牌联系人、价格和资源结构。"""

    if (
        profile.get("schemaVersion") != 1
        or profile.get("scope") != "shared-product-family-brand"
    ):
        fail(errors, f"brand support profile schema/scope drifted: {display_path(path)}")
    if profile.get("publicBasePath") != "/brand-support":
        fail(errors, f"brand support public base path drifted: {display_path(path)}")

    contacts = profile.get("contacts")
    if not isinstance(contacts, dict):
        fail(errors, f"brand support contacts are missing: {display_path(path)}")
    else:
        expected_contacts = {"windowTitle": "2222980", "support": "2222980"}
        for role, expected in expected_contacts.items():
            contact = contacts.get(role)
            if (
                not isinstance(contact, dict)
                or contact.get("channel") != "QQ"
                or contact.get("value") != expected
            ):
                fail(errors, f"brand support {role} contact drifted: {display_path(path)}")

    sponsor = profile.get("sponsor")
    if not isinstance(sponsor, dict):
        fail(errors, f"brand sponsor profile is missing: {display_path(path)}")
        return
    tiers = sponsor.get("tiers")
    prices = (
        [tier.get("price") for tier in tiers if isinstance(tier, dict)]
        if isinstance(tiers, list)
        else []
    )
    if prices != [19, 199, 1999]:
        fail(errors, f"brand sponsor prices must remain 19/199/1999: {display_path(path)}")
    payments = sponsor.get("payments")
    payment_paths = (
        [item.get("image") for item in payments if isinstance(item, dict)]
        if isinstance(payments, list)
        else []
    )
    if payment_paths != ["sponsor/pay1.png", "sponsor/pay2.png"]:
        fail(errors, f"brand sponsor payment QR mapping drifted: {display_path(path)}")
    if sponsor.get("background") != "sponsor/bg.jpg":
        fail(errors, f"brand sponsor background mapping drifted: {display_path(path)}")

    optional_assets = profile.get("optionalAssets")
    expected_optional = {
        "sponsor/arrow.png",
        "sponsor/icon1.png",
        "sponsor/icon2.png",
        "sponsor/icon3.png",
        "sponsor/icon4.png",
        "sponsor/select.png",
    }
    if not isinstance(optional_assets, list) or set(optional_assets) != expected_optional:
        fail(errors, f"brand support optional small-image set is incomplete: {display_path(path)}")
    updater = profile.get("updater")
    if not isinstance(updater, dict) or updater.get("banner") != "updater/banner.jpg":
        fail(errors, f"brand updater banner mapping drifted: {display_path(path)}")

    forbidden = sorted(_walk_keys(profile) & FORBIDDEN_PRODUCT_KEYS)
    if forbidden:
        fail(
            errors,
            f"brand profile contains downstream product fields {forbidden}: {display_path(path)}",
        )


def validate_brand_translations(
    errors: list[str],
    *,
    zh: dict[str, Any],
    en: dict[str, Any],
    zh_path: Path,
    en_path: Path,
) -> None:
    """确保品牌文案完整且关于页没有来源产品名或功能字段。"""

    for locale, value, path, title, payment in (
        ("zh-CN", zh, zh_path, "软件免费由守城工作室&飞鹰工作室维护", "2222980"),
        ("en-US", en, en_path, "Freely Maintained by Shoucheng & Feiying Studio", "2222980"),
    ):
        about = value.get("about")
        sponsor = value.get("sponsor")
        if not isinstance(about, dict) or set(about) != EXPECTED_ABOUT_KEYS:
            fail(errors, f"brand about copy must contain only shared fields: {display_path(path)}")
        elif any(
            about.get(key) != expected
            for key, expected in EXPECTED_ABOUT_COPY[locale].items()
        ):
            fail(errors, f"brand author or disclaimer copy drifted: {display_path(path)}")
        for section, expected in EXPECTED_LOCAL_UI_COPY[locale].items():
            if value.get(section) != expected:
                fail(errors, f"brand {section} copy drifted: {display_path(path)}")
        for section, expected_keys in EXPECTED_FIXED_UI_KEYS.items():
            copy = value.get(section)
            if not isinstance(copy, dict) or set(copy) != expected_keys:
                fail(
                    errors,
                    f"brand {section} fixed UI keys drifted: {display_path(path)}",
                )
        if not isinstance(sponsor, dict):
            fail(errors, f"brand sponsor translations are missing: {display_path(path)}")
            continue
        if sponsor.get("title") != title or payment not in str(
            sponsor.get("payment_instructions", "")
        ):
            fail(errors, f"brand sponsor title/contact drifted: {display_path(path)}")
        required_keys = {
            "payment_wechat_alt",
            "payment_alipay_alt",
            "tier1_name",
            "tier2_name",
            "tier3_name",
            "tier1_b1",
            "tier2_b1",
            "tier3_b1",
        }
        if not required_keys.issubset(sponsor):
            fail(errors, f"brand sponsor translations are incomplete: {display_path(path)}")
        if _walk_keys(value) & FORBIDDEN_PRODUCT_KEYS:
            fail(errors, f"brand translations contain downstream product fields: {display_path(path)}")


def validate_brand_media_manifest(
    errors: list[str], manifest: dict[str, Any], *, brand_root: Path, path: Path
) -> None:
    """逐项核对 manifest 与原始品牌图片字节。"""

    if manifest.get("schemaVersion") != 1 or manifest.get("assetCount") != 13:
        fail(errors, f"brand media manifest schema/count drifted: {display_path(path)}")
    approval = manifest.get("sourceApproval")
    if (
        not isinstance(approval, dict)
        or approval.get("approvedUse")
        != "internal-proprietary-harness-product-family"
    ):
        fail(errors, f"brand media internal reuse approval is missing: {display_path(path)}")
    bundle_policy = manifest.get("bundlePolicy")
    if (
        not isinstance(bundle_policy, dict)
        or bundle_policy.get("guiSkillPropagation") != "complete"
        or bundle_policy.get("applicationBundle") != "gui-default-local-surfaces"
        or bundle_policy.get("defaultMediaSets") != ["sponsor"]
        or bundle_policy.get("optionalMediaSets") != ["updater"]
        or bundle_policy.get("paymentAutomationAuthorized") is not False
        or bundle_policy.get("remoteLoadingAllowed") is not False
    ):
        fail(errors, f"brand media bundle policy is unsafe: {display_path(path)}")

    assets = manifest.get("assets")
    if not isinstance(assets, list):
        fail(errors, f"brand media manifest assets must be a list: {display_path(path)}")
        return
    by_path: dict[str, dict[str, Any]] = {}
    for entry in assets:
        if not isinstance(entry, dict) or not _safe_manifest_path(entry.get("sourcePath")):
            fail(errors, f"brand media manifest has an unsafe asset path: {display_path(path)}")
            continue
        source_path = str(entry["sourcePath"])
        if source_path in by_path:
            fail(errors, f"brand media manifest duplicates {source_path}: {display_path(path)}")
            continue
        by_path[source_path] = entry

    if set(by_path) != set(EXPECTED_MEDIA):
        missing = sorted(set(EXPECTED_MEDIA) - set(by_path))
        extra = sorted(set(by_path) - set(EXPECTED_MEDIA))
        fail(errors, f"brand media manifest set mismatch; missing={missing}, extra={extra}")

    media_root = brand_root / "media"
    actual_paths = (
        {
            item.relative_to(brand_root).as_posix()
            for item in media_root.rglob("*")
            if item.is_file() or item.is_symlink()
        }
        if media_root.is_dir()
        else set()
    )
    if actual_paths != set(EXPECTED_MEDIA):
        missing = sorted(set(EXPECTED_MEDIA) - actual_paths)
        extra = sorted(actual_paths - set(EXPECTED_MEDIA))
        fail(errors, f"brand media file set mismatch; missing={missing}, extra={extra}")

    for source_path, classification in EXPECTED_MEDIA.items():
        entry = by_path.get(source_path)
        media_path = brand_root / source_path
        if entry is None:
            continue
        if media_path.is_symlink() or not media_path.is_file():
            fail(errors, f"missing or unsafe brand media file: {display_path(media_path)}")
            continue
        if entry.get("classification") != classification:
            fail(errors, f"brand media classification drifted for {source_path}")
        expected_bundle = source_path.removeprefix("media/")
        if entry.get("bundlePath") != expected_bundle:
            fail(errors, f"brand media bundle path drifted for {source_path}")
        try:
            facts = _image_facts(media_path)
        except (OSError, ValueError) as error:
            fail(errors, f"cannot inspect brand media {display_path(media_path)}: {error}")
            continue
        for field, actual in facts.items():
            if entry.get(field) != actual:
                fail(errors, f"brand media {field} mismatch for {source_path}")
