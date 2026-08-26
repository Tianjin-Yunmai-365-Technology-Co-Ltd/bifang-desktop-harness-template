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
            't("about.check_for_updates")',
            't("about.release_notes")',
            'update.status === "not-configured"',
            'data-testid="about-update-section"',
            "setReleaseNotesOpened(true)",
            "ReleaseNotesDialogTemplate",
            "releaseNotes?: readonly ReleaseNoteEntry[]",
            "actions ?",
        ),
        react_root / "ReleaseNotesDialogTemplate.tsx": (
            "selectVisibleReleaseNotes",
            "formatDisplayVersion(release.version)",
            't("release_notes.entry_title"',
            't("release_notes.feature_optimizations")',
            't("release_notes.bug_fixes")',
        ),
        react_root / "releaseNotes.ts": (
            "MAX_VISIBLE_RELEASE_NOTE_VERSIONS = 5",
            "MAX_VISIBLE_RELEASE_NOTE_ITEMS = 10",
            "releases.slice(0, MAX_VISIBLE_RELEASE_NOTE_VERSIONS)",
        ),
        react_root / "displayVersion.ts": (
            "formatDisplayVersion",
            'replace(/^[vV]+/, "")',
            "return `v${normalized}`",
        ),
        react_root / "pageSessionState.ts": (
            'from "jotai"',
            "createPageSessionState",
            "const stateAtom = atom(normalizedInitialState)",
            "setSelectionAtom",
            "query: selection.query,\n        page: 1,",
            "setPaginationAtom",
            "page: pageSize === current.pageSize ? page : 1",
            "reconcilePageAfterResultAtom",
            'result.status !== "success"',
            "current.page === 1",
            "set(stateAtom, { ...current, page: 1 })",
            "Object.freeze",
        ),
        react_root / "PageSessionState.test.ts": (
            'from "jotai/vanilla"',
            "keeps tabs queries and pagination when a route unmounts and remounts",
            "resets to page one when the page size changes",
            "resets to page one when the tab or query scope changes",
            "falls back to page one only after a successful empty page result",
            "does not treat loading errors or an empty first page as a stale page",
            "starts from defaults in a new application store",
        ),
        react_root / "SponsorPageTemplate.tsx": (
            "cols={{ base: 1, sm: 2, lg: 3 }}",
            "BRAND_SUPPORT_PROFILE",
            "profile.sponsor.payments.map",
            "SupportMedia",
            "useComputedColorScheme",
            "sponsorBackgroundImage(colorScheme, background)",
            'data-color-scheme={colorScheme}',
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
            "formatDisplayVersion(version)",
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
            "APP_SIDEBAR_WIDTH_PX = 136",
            "APP_SIDEBAR_LOGO_SIZE_PX = 56",
            "APP_SIDEBAR_NAV_ICON_SIZE_PX = 30",
            "APP_SIDEBAR_LABEL_WIDTH_CH = 10",
            "APP_SIDEBAR_LABEL_FONT_SIZE_PX = 11",
            "position: \"fixed\"",
            "featureItems.map",
            "FIXED_BOTTOM_NAVIGATION_ITEMS.map",
            "logoSrc: string",
            'data-testid="app-sidebar-logo"',
            'data-testid="app-sidebar-version"',
            'data-testid="fixed-bottom-navigation"',
            'data-layout="fixed-icon-above-label"',
            'data-navigation-layout="icon-above-label"',
            "data-label-width-ch={APP_SIDEBAR_LABEL_WIDTH_CH}",
            "inlineSize: `${APP_SIDEBAR_LABEL_WIDTH_CH}em`",
            'flexDirection: "column"',
            'textAlign: "center"',
            'from "@tabler/icons-react"',
            "type TablerIcon",
            "icon: TablerIcon",
            "FIXED_NAVIGATION_ICONS",
            'style={{ alignItems: "center", width: "100%" }}',
            "formatDisplayVersion(version)",
        ),
        react_root / "AppThemeProviderTemplate.tsx": (
            'AppColorScheme = "light" | "dark" | "auto"',
            "localStorageColorSchemeManager",
            'defaultColorScheme="auto"',
            "APP_THEME_CSS_VARIABLES",
            '"--app-background"',
            '"--app-surface"',
            '"--app-text"',
            '"--app-text-muted"',
            '"--app-border"',
            '"--app-accent"',
            'data-color-scheme={colorScheme}',
        ),
        react_root / "SettingsPageTemplate.tsx": (
            "SupportedInterfaceLanguage",
            't("settings.theme_light")',
            't("settings.theme_dark")',
            't("settings.theme_system")',
            "useMantineColorScheme",
            "setColorScheme(value)",
            "formatDisplayVersion(version)",
        ),
        react_root / "MandatoryUpdateGateTemplate.tsx": (
            "requiresMandatoryUpdate(update)",
            'role="alertdialog"',
            "onInstallUpdate",
            "onExitApplication",
            "普通功能",
            "formatDisplayVersion(update.currentVersion)",
        ),
        react_root / "SupportSurfaceTemplates.test.tsx": (
            "2222980",
            "免责声明",
            "显示窗口",
            "formats the fixed dynamic window title",
            "FIXED_BOTTOM_NAVIGATION_ITEMS",
            "fixed bottom order",
            "APP_SIDEBAR_WIDTH_PX",
            "APP_SIDEBAR_LABEL_WIDTH_CH",
            "visible version and fixed bottom order",
            "icon-above-label navigation",
            "without a privacy section",
            'from "@tabler/icons-react"',
            '"data-navigation-layout"',
            'alignItems: "center"',
            "distinct light and dark application theme variables",
            "inert update entry on About",
            "keeps update actions bound to their own controls",
            "MAX_VISIBLE_RELEASE_NOTE_VERSIONS",
            "MAX_VISIBLE_RELEASE_NOTE_ITEMS",
            "-----------更新日志 2026-08-26 v1.0.6----------",
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
    logo_position = sidebar_text.find('data-testid="app-sidebar-logo"')
    version_position = sidebar_text.find('data-testid="app-sidebar-version"')
    if logo_position < 0 or version_position < 0 or logo_position > version_position:
        fail(errors, "GUI sidebar logo must render above the current version")
    if sidebar_text.find("featureItems.map") > sidebar_text.find(
        "FIXED_BOTTOM_NAVIGATION_ITEMS.map"
    ):
        fail(errors, "GUI feature navigation must render above fixed bottom navigation")
    for forbidden in (
        "icon: ReactNode",
        "fixedIcons: FixedNavigationIcons",
        'collapsed ? "›" : "‹"',
        "DEFAULT_SIDEBAR_COLLAPSED",
        "onCollapsedChange",
        "IconChevronLeft",
        "IconChevronRight",
        "<Tooltip",
    ):
        if forbidden in sidebar_text:
            fail(errors, f"GUI sidebar restored forbidden icon contract: {forbidden}")
    settings_text = texts.get(react_root / "SettingsPageTemplate.tsx", "")
    for forbidden in (
        "usageReportingConfigured",
        "usageReportingConsent",
        "onUsageReportingConsentChange",
        't("settings.privacy_title")',
        "<Switch",
    ):
        if forbidden in settings_text:
            fail(errors, f"GUI default settings restored forbidden privacy surface: {forbidden}")
    about_text = texts.get(react_root / "AboutPageTemplate.tsx", "")
    if re.search(
        r'<Paper(?=[^>]*data-testid="about-update-section")[^>]*\bonClick=',
        about_text,
        re.DOTALL,
    ):
        fail(errors, "GUI About update section must not proxy child button actions")
    page_session_text = texts.get(react_root / "pageSessionState.ts", "")
    for forbidden in (
        "atomWithStorage",
        "localStorage",
        "sessionStorage",
        "indexedDB",
        "@tauri-apps/plugin-store",
        "window.location",
    ):
        if forbidden in page_session_text:
            fail(
                errors,
                "GUI page session state must remain process-memory only: "
                f"{forbidden}",
            )
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
            "侧栏固定为 `136px` 宽且没有展开/折叠状态或开关",
            'defaultColorScheme="auto"',
            "useComputedColorScheme",
            "图标在上、名称在下",
            "@tabler/icons-react",
            "水平居中",
            "浅色/深色/跟随系统",
            "手动检查更新固定在关于页",
            "旁边的“更新日志”按钮",
            "最近 5 个版本",
            "各最多 10 条",
            "一个小写 `v`",
            "父级代理",
            "pageSessionState.ts",
            "应用根 Jotai store",
            "成功空页",
            "AppThemeProviderTemplate.tsx",
            "底部固定项按视觉顺序为赞助、设置、关于",
            "`/settings`、`/about` 与 `/sponsor` 是固定路由",
            "三段免责声明",
            "docs/GUI_SUPPORT_SURFACES.md",
            "升级器必须将其视为 `protected`",
            "领域校验、跨接口可复用的资格判断",
            "默认 fail-open",
            "禁止 detached task",
            "秘密只能由已批准的安全运行时来源提供",
            "只有产品明确启用统计能力后才增加统计同意界面",
            '`rust_i18n::t!("tray.show_window")`',
            "任何 `tray.*` 原始键可见都失败",
            "不得信任远端 `forcedUpdate` 布尔值",
            "HTTPS JSON `POST` body",
            "13 个源图片",
            "支付二维码是敏感静态品牌材料",
            "$desktop-define-product",
        ),
        reference_path: (
            "## 所有权矩阵",
            "`{applicationName} v{version} {contactChannel}:{contactValue}`",
            "底部固定组按视觉顺序为赞助、设置、关于",
            "左侧菜单固定为 `136px` 宽的单一状态",
            "@tabler/icons-react",
            "水平居中",
            "浅色、深色、跟随系统",
            "关于页在手动检查更新旁提供",
            "更新日志”按钮",
            "最近 5 个版本",
            "各最多 10 条",
            "表格中的 `Switch` 不得因点击行或单元格而切换",
            "页面工作状态使用共享 `pageSessionState.ts`",
            "新 store 从默认值开始",
            "loading/error 不回退",
            "设置页只提供当前应用/版本、中英文和浅色/深色/跟随系统",
            "托盘 i18n",
            "每个远程能力单独记录",
            "生产地址默认 HTTPS",
            "禁用或未同意时请求计数为零",
            "未认证布尔值不能触发强更",
            "13 个源文件",
        ),
        pages_reference_path: (
            "## 资产包内容",
            "固定侧栏、设置页、关于页、赞助页及其应用导航入口随 GUI 初始化自动建立",
            "AppThemeProviderTemplate.tsx",
            "侧栏固定为 `136px` 单态",
            "设置页只保留应用/版本、语言与三态主题",
            "托盘 i18n",
            "手动检查更新和稳定状态固定存在",
            "ReleaseNotesDialog",
            "近 5 版固定结构",
            "父容器点击不代理两个按钮",
            "作者、联系人、三段免责声明",
            "固定价格是 19、199、1999 CNY",
            "不得使用固定 `minWidth: 800`",
            "当前品牌包没有视频文件",
            "13 个源文件逐项核对",
        ),
        update_reference_path: (
            "## 更新状态机",
            "手动“检查更新”和更新状态固定在 `/about`",
            "旁边的“更新日志”按钮",
            "最近 5 版",
            "各最多 10 条",
            "两个按钮的事件只绑定各自元素",
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
            "GUI 初始化已经包含固定动态标题、`136px` 单态图标上文字下的 Logo→版本侧栏",
            "同一产物同时支持亮色和暗色",
            "浅色、深色、跟随系统",
            "手动检查更新：入口固定存在",
            "更新日志：按钮紧邻“检查更新”且事件绑定在按钮自身",
            "最近 5 版",
            "各最多 10 条",
            "全部版本只带一个小写 `v`",
            "视觉顺序严格为赞助、设置、关于",
            "`NotConfigured`",
            "禁止远端布尔值直接触发",
            "初始化设置页不提供统计或隐私控件",
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
