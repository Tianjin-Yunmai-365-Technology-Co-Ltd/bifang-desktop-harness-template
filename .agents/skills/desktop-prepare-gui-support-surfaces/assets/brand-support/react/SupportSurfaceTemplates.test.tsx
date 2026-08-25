import { Button, MantineProvider, Text } from "@mantine/core";
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
  AppSidebarTemplate,
  DEFAULT_SIDEBAR_COLLAPSED,
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
import { FIXED_BOTTOM_NAVIGATION_ITEMS } from "./supportNavigation";
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
      "Example Utility 3.4.5 QQ:2222980",
    );
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
    expect(FIXED_BOTTOM_NAVIGATION_ITEMS).toEqual([
      { id: "sponsor", labelKey: "navigation.sponsor", to: "/sponsor" },
      { id: "settings", labelKey: "navigation.settings", to: "/settings" },
      { id: "about", labelKey: "navigation.about", to: "/about" },
    ]);
  });

  /** 侧栏保持功能项向下增长，并把赞助、设置、关于按固定顺序贴底。 */
  it("renders the collapsible sidebar with a visible version and fixed bottom order", async () => {
    const onCollapsedChange = vi.fn();
    const onNavigate = vi.fn();
    await renderTemplate(
      <AppSidebarTemplate
        activePath="/overview"
        applicationName="Example Utility"
        collapsed={false}
        featureItems={[
          {
            icon: <span data-testid="overview-icon">O</span>,
            id: "overview",
            label: "总览",
            to: "/overview",
          },
          {
            icon: <span data-testid="jobs-icon">J</span>,
            id: "jobs",
            label: "任务",
            to: "/jobs",
          },
        ]}
        fixedIcons={{
          about: <span data-testid="about-icon">A</span>,
          settings: <span data-testid="settings-icon">S</span>,
          sponsor: <span data-testid="sponsor-icon">¥</span>,
        }}
        logoSrc="/app-identity/logo.png"
        onCollapsedChange={onCollapsedChange}
        onNavigate={onNavigate}
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
    expect(screen.getByTestId("overview-icon")).toBeVisible();
    expect(screen.getByTestId("about-icon")).toBeVisible();
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
    fireEvent.click(screen.getByRole("button", { name: "收起侧栏" }));
    expect(onNavigate).toHaveBeenCalledWith("/jobs");
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });

  /** 折叠侧栏仍显示图标和版本，并通过 Tooltip 揭示菜单名称。 */
  it("keeps icons, tooltips, and the version visible when collapsed", async () => {
    expect(DEFAULT_SIDEBAR_COLLAPSED).toBe(true);
    await renderTemplate(
      <AppSidebarTemplate
        activePath="/about"
        applicationName="Example Utility"
        collapsed
        featureItems={[
          {
            icon: <span data-testid="overview-icon">O</span>,
            id: "overview",
            label: "Overview",
            to: "/",
          },
        ]}
        fixedIcons={{
          about: <span data-testid="about-icon">A</span>,
          settings: <span data-testid="settings-icon">S</span>,
          sponsor: <span data-testid="sponsor-icon">$</span>,
        }}
        logoSrc="/app-identity/logo.png"
        onCollapsedChange={vi.fn()}
        onNavigate={vi.fn()}
        version="9.8.7"
      />,
      "en-US",
    );

    expect(screen.getByTestId("app-sidebar-version")).toHaveTextContent(
      "v9.8.7",
    );
    expect(
      screen.getByRole("img", { name: "Example Utility application logo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Expand sidebar" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "About" })).toBeInTheDocument();
    expect(screen.getByTestId("overview-icon")).toBeVisible();
    expect(screen.getByTestId("about-icon")).toBeVisible();
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Overview" }));
    expect(
      await screen.findByRole("tooltip", { name: "Overview" }),
    ).toBeInTheDocument();
  });

  /** 设置页显示版本并把语言、三态主题与统计同意交给外层控制器。 */
  it("renders fixed language, theme, and privacy controls", async () => {
    const onLanguageChange = vi.fn();
    const onUsageReportingConsentChange = vi.fn();
    await renderAppThemeTemplate(
      <SettingsPageTemplate
        applicationName="Example Utility"
        language="zh-CN"
        onLanguageChange={onLanguageChange}
        onUsageReportingConsentChange={onUsageReportingConsentChange}
        usageReportingConfigured
        usageReportingConsent={false}
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
    fireEvent.click(
      screen.getByRole("switch", {
        name: /发送最小化匿名使用统计/,
      }),
    );
    expect(onLanguageChange).toHaveBeenCalledWith("en-US");
    expect(window.localStorage.getItem(APP_COLOR_SCHEME_STORAGE_KEY)).toBe(
      "auto",
    );
    expect(screen.getByRole("radio", { name: "跟随系统" })).toBeChecked();
    expect(screen.getByTestId("app-theme-surface")).toHaveAttribute(
      "data-color-scheme",
      "light",
    );
    expect(onUsageReportingConsentChange).toHaveBeenCalledWith(true);
  });

  /** 未配置统计能力时，设置页保留清晰状态但不会触发请求。 */
  it("disables usage reporting when the capability is not configured", async () => {
    await renderTemplate(
      <SettingsPageTemplate
        applicationName="Example Utility"
        language="en-US"
        onLanguageChange={vi.fn()}
        onUsageReportingConsentChange={vi.fn()}
        usageReportingConfigured={false}
        usageReportingConsent={false}
        version="1.0.0"
      />,
      "en-US",
    );

    expect(
      screen.getByRole("switch", {
        name: /Send minimal anonymous usage statistics/,
      }),
    ).toBeDisabled();
    expect(screen.getByText(/no data will be sent/i)).toBeInTheDocument();
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
      releaseNotes: "Security maintenance release",
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
        version="3.4.5"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Example Utility" }),
    ).toBeInTheDocument();
    expect(screen.getByText("版本 3.4.5")).toBeInTheDocument();
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
