import { Button, MantineProvider, Text } from "@mantine/core";
import { IconLayoutDashboard, IconListCheck } from "@tabler/icons-react";
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { createInstance, type i18n } from "i18next";
import type { ReactElement } from "react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import enUS from "../i18n/en-US.json";
import zhCN from "../i18n/zh-CN.json";
import { AboutPageTemplate } from "./AboutPageTemplate";
import {
  APP_SIDEBAR_COLLAPSED_STORAGE_KEY,
  APP_SIDEBAR_LABEL_FONT_SIZE_PX,
  APP_SIDEBAR_LABEL_WIDTH_CH,
  APP_SIDEBAR_LOGO_SIZES,
  APP_SIDEBAR_NAV_ICON_SIZE_PX,
  APP_SIDEBAR_WIDTHS,
  DEFAULT_DETAILED_SIDEBAR_COLLAPSED,
  AppSidebarTemplate,
} from "./AppSidebarTemplate";
import {
  APP_COLOR_SCHEME_STORAGE_KEY,
  APP_THEME,
  APP_THEME_CSS_VARIABLES,
  AppThemeProviderTemplate,
} from "./AppThemeProviderTemplate";
import { BrandUpdaterBanner } from "./BrandUpdaterBanner";
import { MandatoryUpdateGateTemplate } from "./MandatoryUpdateGateTemplate";
import { SettingsPageTemplate } from "./SettingsPageTemplate";
import { SponsorPageTemplate } from "./SponsorPageTemplate";
import { SupportMedia } from "./SupportMedia";
import {
  BRAND_SUPPORT_PROFILE,
  formatBrandWindowTitle,
  isLocalSupportPath,
  resolveBrandAssetPath,
} from "./brandSupportProfile";
import { formatDisplayVersion } from "./displayVersion";
import {
  MAX_VISIBLE_RELEASE_NOTE_ITEMS,
  MAX_VISIBLE_RELEASE_NOTE_VERSIONS,
} from "./releaseNotes";
import { buildSupportNavigationItems } from "./supportNavigation";
import { requiresMandatoryUpdate } from "./updatePresentation";

/** 为 jsdom 补齐 Mantine 布局组件依赖的只读观察器。 */
class TestResizeObserver implements ResizeObserver {
  /** 测试环境销毁观察器时不需要额外资源回收。 */
  disconnect(): void {}

  /** 测试环境只接受观察调用，不计算真实布局。 */
  observe(): void {}

  /** 测试环境允许组件停止观察指定元素。 */
  unobserve(): void {}
}

/** 创建只包含品牌支持 namespace 的真实 i18next 测试实例。 */
async function createTestI18n(locale: "zh-CN" | "en-US"): Promise<i18n> {
  const instance = createInstance();
  await instance.init({
    fallbackLng: "en-US",
    interpolation: { escapeValue: false },
    lng: locale,
    resources: {
      "en-US": { brandSupport: enUS },
      "zh-CN": { brandSupport: zhCN },
    },
  });
  return instance;
}

/** 使用真实 Mantine 与 i18next provider 渲染模板。 */
async function renderTemplate(
  node: ReactElement,
  locale: "zh-CN" | "en-US" = "zh-CN",
  colorScheme: "light" | "dark" = "light",
) {
  const instance = await createTestI18n(locale);
  return render(
    <I18nextProvider i18n={instance}>
      <MantineProvider forceColorScheme={colorScheme}>{node}</MantineProvider>
    </I18nextProvider>,
  );
}

/** 使用真实应用主题 provider 验证主题切换和设备级持久化。 */
async function renderAppThemeTemplate(node: ReactElement) {
  const instance = await createTestI18n("zh-CN");
  return render(
    <I18nextProvider i18n={instance}>
      <AppThemeProviderTemplate>{node}</AppThemeProviderTemplate>
    </I18nextProvider>,
  );
}

describe("shared brand support templates", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: TestResizeObserver,
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    cleanup();
  });

  /** 窗口标题始终使用当前应用名、版本和固定品牌联系字段。 */
  it("formats the fixed dynamic window title from authoritative inputs", () => {
    expect(formatBrandWindowTitle("Example Utility", "3.4.5")).toBe(
      "Example Utility v3.4.5 QQ:2222980",
    );
    expect(formatBrandWindowTitle("Example Utility", "vv3.4.5")).toBe(
      "Example Utility v3.4.5 QQ:2222980",
    );
    expect(formatDisplayVersion("V3.4.5")).toBe("v3.4.5");
    expect(() => formatBrandWindowTitle(" ", "3.4.5")).toThrow(
      /application name and version/,
    );
    expect(zhCN.navigation).toEqual({
      about: "关于",
      settings: "设置",
      sponsor: "赞助",
    });
    expect(zhCN.tray).toEqual({ quit: "退出", show_window: "显示窗口" });
    expect(enUS.navigation).toEqual({
      about: "About",
      settings: "Settings",
      sponsor: "Sponsor",
    });
    expect(enUS.tray).toEqual({ quit: "Quit", show_window: "Show Window" });
    expect(
      buildSupportNavigationItems({ aboutPage: true, sponsorPage: true }),
    ).toEqual([
      { id: "sponsor", labelKey: "navigation.sponsor", to: "/sponsor" },
      { id: "settings", labelKey: "navigation.settings", to: "/settings" },
      { id: "about", labelKey: "navigation.about", to: "/about" },
    ]);
    expect(
      buildSupportNavigationItems({ aboutPage: false, sponsorPage: false }),
    ).toEqual([
      { id: "settings", labelKey: "navigation.settings", to: "/settings" },
    ]);
  });

  /** 固定侧栏保持功能项向下增长，并把赞助、设置、关于按固定顺序贴底。 */
  it("renders the fixed sidebar with a visible version and fixed bottom order", async () => {
    const onNavigate = vi.fn();
    await renderTemplate(
      <AppSidebarTemplate
        activePath="/overview"
        applicationName="Example Utility"
        featureItems={[
          {
            icon: IconLayoutDashboard,
            id: "overview",
            label: "总览",
            to: "/overview",
          },
          {
            icon: IconListCheck,
            id: "jobs",
            label: "任务",
            to: "/jobs",
          },
        ]}
        logoSrc="/app-identity/logo.png"
        mode="compact"
        onNavigate={onNavigate}
        supportPages={{ aboutPage: true, sponsorPage: true }}
        version="3.4.5"
      />,
    );

    const identity = screen.getByTestId("app-sidebar-identity");
    const logo = screen.getByRole("img", {
      name: "Example Utility 应用 Logo",
    });
    const version = screen.getByTestId("app-sidebar-version");
    expect(identity.firstElementChild).toBe(logo);
    expect(logo.nextElementSibling).toBe(version);
    expect(logo).toHaveAttribute("src", "/app-identity/logo.png");
    expect(screen.getByTestId("app-sidebar-version")).toHaveTextContent(
      "v3.4.5",
    );
    expect(screen.getByTestId("navigation-icon-overview")).toBeVisible();
    expect(screen.getByTestId("navigation-icon-about")).toBeVisible();
    expect(
      within(screen.getByTestId("feature-navigation"))
        .getAllByRole("button")
        .map((item) => item.getAttribute("aria-label")),
    ).toEqual(["总览", "任务"]);
    expect(
      within(screen.getByTestId("fixed-bottom-navigation"))
        .getAllByRole("button")
        .map((item) => item.getAttribute("aria-label")),
    ).toEqual(["赞助", "设置", "关于"]);

    fireEvent.click(screen.getByRole("button", { name: "任务" }));
    expect(onNavigate).toHaveBeenCalledWith("/jobs");
  });

  /** 精简侧栏以大图标在上、十字宽度居中文字在下，且没有展开控件。 */
  it("keeps compact icon-above-label navigation centered and non-expandable", async () => {
    expect(APP_SIDEBAR_WIDTHS.compact).toBe(136);
    expect(APP_SIDEBAR_LOGO_SIZES.compact).toBe(56);
    expect(APP_SIDEBAR_NAV_ICON_SIZE_PX).toBe(30);
    expect(APP_SIDEBAR_LABEL_WIDTH_CH).toBe(10);
    expect(APP_SIDEBAR_LABEL_FONT_SIZE_PX).toBe(11);
    await renderTemplate(
      <AppSidebarTemplate
        activePath="/about"
        applicationName="Example Utility"
        featureItems={[
          {
            icon: IconLayoutDashboard,
            id: "overview",
            label: "一二三四五六七八九十",
            to: "/",
          },
        ]}
        logoSrc="/app-identity/logo.png"
        mode="compact"
        onNavigate={vi.fn()}
        supportPages={{ aboutPage: true, sponsorPage: true }}
        version="v9.8.7"
      />,
    );

    expect(screen.getByTestId("app-sidebar")).toHaveStyle({ width: "136px" });
    expect(screen.getByTestId("app-sidebar")).toHaveAttribute(
      "data-layout",
      "compact",
    );
    expect(screen.getByTestId("app-sidebar-version")).toHaveTextContent(
      "v9.8.7",
    );
    expect(
      screen.getByRole("img", { name: "Example Utility 应用 Logo" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/展开|收起|expand|collapse/i),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关于" })).toBeInTheDocument();
    expect(screen.getByTestId("app-sidebar-identity")).toHaveStyle({
      alignItems: "center",
      width: "100%",
    });
    for (const label of ["一二三四五六七八九十", "赞助", "设置", "关于"]) {
      const item = screen.getByRole("button", { name: label });
      expect(item).toHaveAttribute(
        "data-navigation-layout",
        "icon-above-label",
      );
      expect(item).toHaveAttribute("data-label-width-ch", "10");
    }
    expect(screen.getByTestId("navigation-icon-overview")).toBeVisible();
    expect(screen.getByTestId("navigation-icon-about")).toBeVisible();
    expect(screen.getByTestId("navigation-label-overview")).toHaveTextContent(
      "一二三四五六七八九十",
    );
    expect(screen.getByTestId("navigation-label-overview")).toHaveStyle({
      fontSize: "11px",
      inlineSize: "10em",
      textAlign: "center",
    });
  });

  /** 详细模式默认展开，并把用户点击按钮后的折叠状态持久化到设备偏好。 */
  it("persists the detailed sidebar collapse button and uses tooltips when hidden", async () => {
    expect(DEFAULT_DETAILED_SIDEBAR_COLLAPSED).toBe(false);
    expect(APP_SIDEBAR_WIDTHS.detailedExpanded).toBe(248);
    expect(APP_SIDEBAR_WIDTHS.detailedCollapsed).toBe(76);
    const sidebar = (
      <AppSidebarTemplate
        activePath="/overview"
        applicationName="Example Utility"
        featureItems={[
          {
            icon: IconLayoutDashboard,
            id: "overview",
            label: "总览",
            to: "/overview",
          },
        ]}
        logoSrc="/app-identity/logo.png"
        mode="detailed"
        onNavigate={vi.fn()}
        supportPages={{ aboutPage: false, sponsorPage: false }}
        version="1.2.3"
      />
    );

    const firstRender = await renderTemplate(sidebar);
    expect(screen.getByTestId("app-sidebar")).toHaveStyle({ width: "248px" });
    expect(screen.getByTestId("app-sidebar")).toHaveAttribute(
      "data-collapsed",
      "false",
    );
    expect(screen.getByTestId("navigation-label-overview")).toHaveTextContent(
      "总览",
    );

    fireEvent.click(screen.getByRole("button", { name: "收起侧栏" }));
    expect(window.localStorage.getItem(APP_SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe(
      "true",
    );
    expect(screen.getByTestId("app-sidebar")).toHaveStyle({ width: "76px" });
    expect(screen.getByTestId("app-sidebar")).toHaveAttribute(
      "data-collapsed",
      "true",
    );
    expect(screen.queryByTestId("navigation-label-overview")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "总览" })).toHaveAttribute(
      "data-navigation-layout",
      "icon-only",
    );
    fireEvent.mouseEnter(screen.getByRole("button", { name: "总览" }));
    expect(await screen.findByText("总览")).toBeVisible();

    firstRender.unmount();
    await renderTemplate(sidebar);
    expect(screen.getByTestId("app-sidebar")).toHaveStyle({ width: "76px" });
    fireEvent.click(screen.getByRole("button", { name: "展开侧栏" }));
    expect(window.localStorage.getItem(APP_SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe(
      "false",
    );
    expect(screen.getByTestId("app-sidebar")).toHaveStyle({ width: "248px" });
  });

  /** 设置页只显示版本、语言和三态主题，不预置隐私或统计区块。 */
  it("renders fixed language and theme controls without a privacy section", async () => {
    const onLanguageChange = vi.fn();
    await renderAppThemeTemplate(
      <SettingsPageTemplate
        applicationName="Example Utility"
        language="zh-CN"
        onLanguageChange={onLanguageChange}
        version="3.4.5"
      />,
    );

    expect(screen.getByText("Example Utility · v3.4.5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "English" }));
    fireEvent.click(screen.getByRole("radio", { name: "深色" }));
    expect(window.localStorage.getItem(APP_COLOR_SCHEME_STORAGE_KEY)).toBe(
      "dark",
    );
    expect(screen.getByRole("radio", { name: "深色" })).toBeChecked();
    expect(screen.getByTestId("app-theme-surface")).toHaveAttribute(
      "data-color-scheme",
      "dark",
    );
    fireEvent.click(screen.getByRole("radio", { name: "跟随系统" }));
    expect(onLanguageChange).toHaveBeenCalledWith("en-US");
    expect(window.localStorage.getItem(APP_COLOR_SCHEME_STORAGE_KEY)).toBe(
      "auto",
    );
    expect(screen.getByRole("radio", { name: "跟随系统" })).toBeChecked();
    expect(screen.getByTestId("app-theme-surface")).toHaveAttribute(
      "data-color-scheme",
      "light",
    );
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByText("隐私")).not.toBeInTheDocument();
    expect(screen.queryByText(/统计/)).not.toBeInTheDocument();
  });

  /** 初始化主题同时提供可区分的亮色与暗色背景、文字和表面令牌。 */
  it("defines distinct light and dark application theme variables", () => {
    const variables = APP_THEME_CSS_VARIABLES(APP_THEME);
    for (const name of [
      "--app-accent",
      "--app-background",
      "--app-border",
      "--app-surface",
      "--app-text",
      "--app-text-muted",
    ]) {
      expect(variables.light?.[name]).not.toBe(variables.dark?.[name]);
    }
  });

  /** 强更状态由 core 判定后，根级门会隐藏普通功能且只开放安装或退出。 */
  it("blocks product features for a core-classified mandatory update", async () => {
    const update = {
      availableVersion: "4.0.0",
      currentVersion: "3.4.5",
      status: "required-update" as const,
    };
    const onInstallUpdate = vi.fn();
    const onExitApplication = vi.fn();
    await renderTemplate(
      <MandatoryUpdateGateTemplate
        installing={false}
        onExitApplication={onExitApplication}
        onInstallUpdate={onInstallUpdate}
        update={update}
      >
        <Text>Product feature</Text>
      </MandatoryUpdateGateTemplate>,
      "en-US",
    );

    expect(requiresMandatoryUpdate(update)).toBe(true);
    expect(screen.queryByText("Product feature")).not.toBeInTheDocument();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("Current v3.4.5 → available v4.0.0")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Install update" }));
    fireEvent.click(screen.getByRole("button", { name: "Exit application" }));
    expect(onInstallUpdate).toHaveBeenCalledOnce();
    expect(onExitApplication).toHaveBeenCalledOnce();
  });

  /** 非强更状态不会包裹或替换普通功能。 */
  it("leaves product features available for optional updates", async () => {
    await renderTemplate(
      <MandatoryUpdateGateTemplate
        installing={false}
        onExitApplication={vi.fn()}
        onInstallUpdate={vi.fn()}
        update={{
          availableVersion: "3.5.0",
          currentVersion: "3.4.5",
          status: "optional-update",
        }}
      >
        <Text>Product feature</Text>
      </MandatoryUpdateGateTemplate>,
    );

    expect(screen.getByText("Product feature")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  /** 关于页从当前产品注入名称/版本，同时展示固定作者、联系人和免责声明。 */
  it("renders injected product facts and the approved brand contact", async () => {
    const onCheckForUpdates = vi.fn();
    await renderTemplate(
      <AboutPageTemplate
        actions={<Button>Optional action</Button>}
        onCheckForUpdates={onCheckForUpdates}
        productName="Example Utility"
        sections={[
          {
            body: <Text>Section body</Text>,
            id: "facts",
            title: "Product facts",
          },
        ]}
        tagline="A product-owned tagline"
        update={{ currentVersion: "3.4.5", status: "idle" }}
        version="v3.4.5"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Example Utility" }),
    ).toBeInTheDocument();
    expect(screen.getByText("版本 v3.4.5")).toBeInTheDocument();
    expect(screen.queryByText(/vv3\.4\.5/)).not.toBeInTheDocument();
    expect(screen.getByText(/守城工作室/)).toBeInTheDocument();
    expect(screen.getByText(/2222980/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "免责声明" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/用户在使用本软件\/服务过程中的所有行为/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Optional action" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "检查更新" }));
    expect(onCheckForUpdates).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("heading", { name: "Product facts" }),
    ).toBeInTheDocument();
  });

  /** 更新区容器不代理子按钮动作，且更新日志严格裁剪到五版和每类十条。 */
  it("keeps update actions bound to their own controls and limits release notes", async () => {
    const onCheckForUpdates = vi.fn();
    const releases = Array.from({ length: 6 }, (_, releaseIndex) => {
      const sequence = 6 - releaseIndex;
      return {
        bugFixes: [`版本 ${sequence} 修复`],
        featureOptimizations: Array.from(
          { length: 11 },
          (_, itemIndex) => `版本 ${sequence} 优化 ${itemIndex + 1}`,
        ),
        releaseDate: `2026-08-${20 + sequence}`,
        version: sequence === 6 ? `v1.0.${sequence}` : `1.0.${sequence}`,
      };
    });
    await renderTemplate(
      <AboutPageTemplate
        onCheckForUpdates={onCheckForUpdates}
        productName="Example Utility"
        releaseNotesLoader={async () => releases}
        update={{ currentVersion: "1.0.6", status: "idle" }}
        version="1.0.6"
      />,
    );

    expect(MAX_VISIBLE_RELEASE_NOTE_VERSIONS).toBe(5);
    expect(MAX_VISIBLE_RELEASE_NOTE_ITEMS).toBe(10);
    fireEvent.click(screen.getByTestId("about-update-section"));
    expect(onCheckForUpdates).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "检查更新" }));
    expect(onCheckForUpdates).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "更新日志" }));
    expect(screen.getByRole("dialog", { name: "更新日志" })).toBeInTheDocument();
    expect(
      await screen.findByText(
        "-----------更新日志 2026-08-26 v1.0.6----------",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("###功能优化")).toHaveLength(5);
    expect(screen.getAllByText("###问题修复")).toHaveLength(5);
    expect(screen.getByText("版本 6 优化 10")).toBeInTheDocument();
    expect(screen.queryByText("版本 6 优化 11")).not.toBeInTheDocument();
    expect(screen.queryByText(/v1\.0\.1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/vv1\.0\.6/)).not.toBeInTheDocument();
  });

  /** 候选资源读取失败时展示本地错误，并允许用户从按钮自身重试。 */
  it("shows a bounded release notes load failure and retries from its own control", async () => {
    const releases = [
      {
        bugFixes: ["修复候选资源读取"],
        featureOptimizations: [],
        releaseDate: "2026-08-27",
        version: "v1.0.7",
      },
    ];
    const releaseNotesLoader = vi
      .fn(async () => releases)
      .mockRejectedValueOnce(new Error("unavailable"));
    await renderTemplate(
      <AboutPageTemplate
        onCheckForUpdates={vi.fn()}
        productName="Example Utility"
        releaseNotesLoader={releaseNotesLoader}
        update={{ currentVersion: "1.0.7", status: "idle" }}
        version="1.0.7"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "更新日志" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "无法读取此候选内的更新日志",
    );
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(
      await screen.findByText(
        "-----------更新日志 2026-08-27 v1.0.7----------",
      ),
    ).toBeInTheDocument();
    expect(releaseNotesLoader).toHaveBeenCalledTimes(2);
  });

  /** 未配置更新时，关于页保留禁用入口且不虚构可用服务。 */
  it("keeps an inert update entry on About when updates are not configured", async () => {
    await renderTemplate(
      <AboutPageTemplate
        onCheckForUpdates={vi.fn()}
        productName="Example Utility"
        update={{ currentVersion: "1.0.0", status: "not-configured" }}
        version="1.0.0"
      />,
      "en-US",
    );

    expect(
      screen.getByRole("button", { name: "Check for updates" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Release notes" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Optional action" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading")).toHaveLength(3);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  /** 赞助页展示三档固定价格、品牌联系人、档位插图和两种支付码。 */
  it("renders the complete fixed sponsor profile with accessible payment images", async () => {
    await renderTemplate(<SponsorPageTemplate />);

    expect(screen.getByText("19")).toBeInTheDocument();
    expect(screen.getByText("199")).toBeInTheDocument();
    expect(screen.getByText("1999")).toBeInTheDocument();
    expect(screen.getAllByText(/2222980/).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("img", { name: "微信支付赞助二维码" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "支付宝赞助二维码" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(3);
    const pageStyle =
      screen.getByTestId("brand-sponsor-page").getAttribute("style") ?? "";
    expect(screen.getByTestId("brand-sponsor-page")).toHaveAttribute(
      "data-color-scheme",
      "light",
    );
    expect(pageStyle).not.toMatch(/min-width|pointer-events/i);
  });

  /** 英文深色方案复用同一品牌事实，并保持支付码可访问名称。 */
  it("renders the same sponsor profile in English and dark color scheme", async () => {
    await renderTemplate(<SponsorPageTemplate />, "en-US", "dark");

    expect(screen.getByTestId("brand-sponsor-page")).toHaveAttribute(
      "data-color-scheme",
      "dark",
    );
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(
      screen
        .getAllByRole("article")
        .every((card) => card.getAttribute("data-color-scheme") === "dark"),
    ).toBe(true);
    expect(
      screen.getByRole("heading", {
        name: "Freely Maintained by Shoucheng & Feiying Studio",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("CNY")).toHaveLength(3);
    expect(
      screen.getByRole("img", { name: "WeChat Pay sponsorship QR code" }),
    ).toBeInTheDocument();
    expect(screen.getByText("QQ 2222980")).toBeInTheDocument();
  });

  /** 本地视频始终带 controls、字幕和文字稿，且不会自动播放。 */
  it("renders a local video with captions and transcript without autoplay", async () => {
    await renderTemplate(
      <SupportMedia
        media={{
          captionsLabel: "简体中文字幕",
          captionsLanguage: "zh-CN",
          captionsSrc: "/brand-support/video/demo.zh-CN.vtt",
          kind: "video",
          poster: "/brand-support/video/demo.jpg",
          src: "/brand-support/video/demo.webm",
          title: "功能演示",
          transcriptHref: "/brand-support/video/demo.zh-CN.txt",
          transcriptLabel: "查看文字稿",
        }}
      />,
    );

    const video = screen.getByLabelText("功能演示") as HTMLVideoElement;
    expect(video.controls).toBe(true);
    expect(video.autoplay).toBe(false);
    expect(video.querySelector('track[kind="captions"]')).toHaveAttribute(
      "src",
      "/brand-support/video/demo.zh-CN.vtt",
    );
    expect(screen.getByRole("link", { name: "查看文字稿" })).toHaveAttribute(
      "href",
      "/brand-support/video/demo.zh-CN.txt",
    );
  });

  /** 远程媒体与路径跳转不能绕过本地打包边界。 */
  it("rejects remote or escaping media paths", () => {
    expect(isLocalSupportPath("https://media.invalid/demo.mp4")).toBe(false);
    expect(isLocalSupportPath("/brand-support/../secret")).toBe(false);
    expect(() =>
      resolveBrandAssetPath("/brand-support", "../secret"),
    ).toThrow();
  });

  /** 更新 banner 只是本地图片，不需要更新 endpoint 或网络 mock。 */
  it("renders the packaged updater banner as a local accessible image", async () => {
    await renderTemplate(<BrandUpdaterBanner alt="品牌更新提示横幅" />);

    expect(
      screen.getByRole("img", { name: "品牌更新提示横幅" }),
    ).toHaveAttribute("src", "/brand-support/updater/banner.jpg");
    expect(BRAND_SUPPORT_PROFILE.optionalAssets).toHaveLength(6);
  });
});
