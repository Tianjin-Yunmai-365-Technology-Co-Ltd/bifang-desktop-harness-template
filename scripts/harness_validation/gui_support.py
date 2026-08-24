"""校验可选 GUI 支持界面、共享品牌内容与页面模板契约。"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from .context import (
    GUI_SUPPORT_BRAND_ROOT,
    GUI_SUPPORT_METADATA,
    GUI_SUPPORT_PAGES_REFERENCE,
    GUI_SUPPORT_REFERENCE,
    GUI_SUPPORT_SKILL,
    GUI_SUPPORT_UPDATE_REFERENCE,
    ROOT,
    display_path,
    fail,
)
from .gui_support_assets import (
    validate_brand_media_manifest,
    validate_brand_profile,
    validate_brand_translations,
)


FIXED_REMOTE_URI = re.compile(r"(?i)\b(?:https?|wss?)://[^\s<>()]+")


def _read_text(errors: list[str], path: Path) -> str | None:
    """读取 UTF-8 文本并把缺失或解析失败转换为稳定错误。"""

    if not path.is_file() or path.is_symlink():
        fail(errors, f"missing or unsafe GUI support contract file: {display_path(path)}")
        return None
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as error:
        fail(errors, f"cannot read GUI support contract {display_path(path)}: {error}")
        return None


def _read_json(errors: list[str], path: Path) -> dict[str, Any] | None:
    """解析 JSON 对象并拒绝数组或标量根。"""

    text = _read_text(errors, path)
    if text is None:
        return None
    try:
        value = json.loads(text)
    except json.JSONDecodeError as error:
        fail(errors, f"invalid GUI support JSON in {display_path(path)}: {error}")
        return None
    if not isinstance(value, dict):
        fail(errors, f"GUI support JSON root must be an object: {display_path(path)}")
        return None
    return value


def _validate_react_assets(errors: list[str], *, brand_root: Path) -> None:
    """检查模板的响应式、可访问媒体和本地路径失败关闭约束。"""

    react_root = brand_root / "react"
    required = {
        react_root / "AboutPageTemplate.tsx": (
            "productName: string",
            "version: string",
            "BRAND_SUPPORT_PROFILE.contacts.support",
            't("about.disclaimer_title")',
            't("about.disclaimer_1")',
            't("about.disclaimer_2")',
            't("about.disclaimer_3")',
            "actions ?",
        ),
        react_root / "SponsorPageTemplate.tsx": (
            "cols={{ base: 1, sm: 2, lg: 3 }}",
            "BRAND_SUPPORT_PROFILE",
            "profile.sponsor.payments.map",
            "SupportMedia",
        ),
        react_root / "SupportMedia.tsx": (
            "controls",
            'kind="captions"',
            "transcriptHref",
            "requireLocalPath",
        ),
        react_root / "BrandUpdaterBanner.tsx": (
            "resolveBrandAssetPath",
            "BRAND_SUPPORT_PROFILE.updater.banner",
            "不启用更新检查",
        ),
        react_root / "brandSupportProfile.ts": (
            "formatBrandWindowTitle",
            "BRAND_SUPPORT_PROFILE.contacts.windowTitle",
            "isLocalSupportPath",
            "resolveBrandAssetPath",
            'value.includes("://")',
        ),
        react_root / "supportNavigation.ts": (
            "FIXED_BOTTOM_NAVIGATION_ITEMS",
            'to: "/settings"',
            'to: "/about"',
            'to: "/sponsor"',
            'labelKey: "navigation.settings"',
            'labelKey: "navigation.about"',
            'labelKey: "navigation.sponsor"',
        ),
        react_root / "updatePresentation.ts": (
            '"not-configured"',
            '"optional-update"',
            '"required-update"',
            "requiresMandatoryUpdate",
            "前端不得从远端布尔值自行推导",
        ),
        react_root / "AppSidebarTemplate.tsx": (
            "position: \"fixed\"",
            "featureItems.map",
            "FIXED_BOTTOM_NAVIGATION_ITEMS.map",
            'data-testid="app-sidebar-version"',
            'data-testid="fixed-bottom-navigation"',
            "onCollapsedChange(!collapsed)",
        ),
        react_root / "SettingsPageTemplate.tsx": (
            "SupportedInterfaceLanguage",
            't("settings.check_for_updates")',
            "usageReportingConsent",
            'update.status === "not-configured"',
            "onUsageReportingConsentChange",
        ),
        react_root / "MandatoryUpdateGateTemplate.tsx": (
            "requiresMandatoryUpdate(update)",
            'role="alertdialog"',
            "onInstallUpdate",
            "onExitApplication",
            "普通功能",
        ),
        react_root / "SupportSurfaceTemplates.test.tsx": (
            "2222980",
            "免责声明",
            "显示窗口",
            "formats the fixed dynamic window title",
            "FIXED_BOTTOM_NAVIGATION_ITEMS",
            "fixed bottom order",
            "keeps the version visible",
            "capabilities are not configured",
            "core-classified mandatory update",
            "video.controls",
            "video.autoplay",
            "payment images",
            "optionalAssets",
        ),
    }
    texts: dict[Path, str] = {}
    for path, fragments in required.items():
        text = _read_text(errors, path)
        if text is None:
            continue
        texts[path] = text
        for fragment in fragments:
            if fragment not in text:
                fail(
                    errors,
                    f"GUI brand React template missing in {display_path(path)}: {fragment}",
                )

    sponsor_text = texts.get(react_root / "SponsorPageTemplate.tsx", "")
    for pattern in (
        "minWidth: 800",
        "minHeight: 600",
        "cols={3}",
        "pointerEvents: 'none'",
    ):
        if pattern in sponsor_text:
            fail(errors, f"brand sponsor template restored unsafe fixed layout: {pattern}")
    media_text = texts.get(react_root / "SupportMedia.tsx", "")
    if re.search(r"\bautoPlay\b", media_text):
        fail(errors, "brand support video template must not enable autoPlay")
    navigation_text = texts.get(react_root / "supportNavigation.ts", "")
    fixed_order = [
        navigation_text.find('id: "sponsor"'),
        navigation_text.find('id: "settings"'),
        navigation_text.find('id: "about"'),
    ]
    if any(position < 0 for position in fixed_order) or fixed_order != sorted(fixed_order):
        fail(errors, "GUI fixed bottom navigation must be sponsor/settings/about")
    sidebar_text = texts.get(react_root / "AppSidebarTemplate.tsx", "")
    if sidebar_text.find("featureItems.map") > sidebar_text.find(
        "FIXED_BOTTOM_NAVIGATION_ITEMS.map"
    ):
        fail(errors, "GUI feature navigation must render above fixed bottom navigation")
    for path, text in texts.items():
        if path.name.endswith(".test.tsx"):
            continue
        uri = FIXED_REMOTE_URI.search(text)
        if uri:
            fail(
                errors,
                f"GUI brand runtime template contains a fixed remote URI: {display_path(path)}",
            )


def validate_gui_support_contract(
    errors: list[str],
    *,
    skill_path: Path = GUI_SUPPORT_SKILL,
    reference_path: Path = GUI_SUPPORT_REFERENCE,
    pages_reference_path: Path = GUI_SUPPORT_PAGES_REFERENCE,
    update_reference_path: Path = GUI_SUPPORT_UPDATE_REFERENCE,
    metadata_path: Path = GUI_SUPPORT_METADATA,
    brand_root: Path = GUI_SUPPORT_BRAND_ROOT,
    product_instance_path: Path = ROOT / "docs" / "GUI_SUPPORT_SURFACES.md",
) -> None:
    """确保共享品牌资源完整，同时隔离来源下游实例和远程能力。"""

    required = {
        skill_path: (
            "动态标题、可收起左侧菜单、设置页、关于页与赞助页默认成组存在",
            "底部固定项按视觉顺序为赞助、设置、关于",
            "`/settings`、`/about` 与 `/sponsor` 是固定路由",
            "三段免责声明",
            "docs/GUI_SUPPORT_SURFACES.md",
            "升级器必须将其视为 `protected`",
            "领域校验、跨接口可复用的资格判断",
            "默认 fail-open",
            "禁止 detached task",
            "秘密只能由已批准的安全运行时来源提供",
            "统计上报默认关闭",
            "不得信任远端 `forcedUpdate` 布尔值",
            "HTTPS JSON `POST` body",
            "13 个源图片",
            "支付二维码是敏感静态品牌材料",
            "$desktop-define-product",
        ),
        reference_path: (
            "## 所有权矩阵",
            "`{applicationName} {version} {contactChannel}:{contactValue}`",
            "底部固定组按视觉顺序为赞助、设置、关于",
            "每个远程能力单独记录",
            "生产地址默认 HTTPS",
            "禁用或未同意时请求计数为零",
            "未认证布尔值不能触发强更",
            "13 个源文件",
        ),
        pages_reference_path: (
            "## 资产包内容",
            "固定侧栏、设置页、关于页、赞助页及其应用导航入口随 GUI 初始化自动建立",
            "作者、联系人、三段免责声明",
            "固定价格是 19、199、1999 CNY",
            "不得使用固定 `minWidth: 800`",
            "当前品牌包没有视频文件",
            "13 个源文件逐项核对",
        ),
        update_reference_path: (
            "## 更新状态机",
            "`NotConfigured`",
            "`RequiredUpdate`",
            "minimumSupportedVersion",
            "React 不比较 SemVer、不读取远端布尔字段",
            "签名验证不可关闭",
            "强更不是远端一个 `forcedUpdate` 布尔值",
            "普通功能导航和业务页面不挂载",
            "## 统计上报同意与固定最小事件",
            "JSON `POST` body",
            "禁止使用 GET/query",
            "不落盘",
            "撤回同意",
            "最多一个发送任务、一个在途请求和 32 条内存事件",
        ),
        metadata_path: (
            "准备 GUI 支持界面",
            "$desktop-prepare-gui-support-surfaces",
        ),
        brand_root / "rust-i18n" / "zh-CN.yml": (
            "tray:",
            "show_window: 显示窗口",
            "quit: 退出",
        ),
        brand_root / "rust-i18n" / "en-US.yml": (
            "tray:",
            "show_window: Show Window",
            "quit: Quit",
        ),
        brand_root / "GUI_SUPPORT_SURFACES.template.md": (
            "GUI 初始化已经包含固定动态标题、可收起左侧菜单、设置页、关于页和赞助页",
            "视觉顺序严格为赞助、设置、关于",
            "`NotConfigured`",
            "禁止远端布尔值直接触发",
            "用户同意默认 false",
            "JSON POST body",
            "支付二维码是敏感静态品牌材料",
            "autoplay | 禁止",
            "13 个源文件",
        ),
    }
    for path, fragments in required.items():
        text = _read_text(errors, path)
        if text is None:
            continue
        for fragment in fragments:
            if fragment not in text:
                fail(errors, f"GUI support contract missing in {display_path(path)}: {fragment}")
        uri = FIXED_REMOTE_URI.search(text)
        if uri:
            fail(
                errors,
                f"GUI support Harness text contains a fixed remote URI in {display_path(path)}",
            )

    profile_path = brand_root / "brand-support-profile.json"
    manifest_path = brand_root / "media-manifest.json"
    zh_path = brand_root / "i18n" / "zh-CN.json"
    en_path = brand_root / "i18n" / "en-US.json"
    profile = _read_json(errors, profile_path)
    manifest = _read_json(errors, manifest_path)
    zh = _read_json(errors, zh_path)
    en = _read_json(errors, en_path)
    if profile is not None:
        validate_brand_profile(errors, profile, profile_path)
    if manifest is not None:
        validate_brand_media_manifest(
            errors, manifest, brand_root=brand_root, path=manifest_path
        )
    if zh is not None and en is not None:
        validate_brand_translations(
            errors,
            zh=zh,
            en=en,
            zh_path=zh_path,
            en_path=en_path,
        )
    _validate_react_assets(errors, brand_root=brand_root)

    if product_instance_path.exists():
        fail(
            errors,
            "Harness template must not precreate downstream GUI support facts: "
            f"{display_path(product_instance_path)}",
        )
