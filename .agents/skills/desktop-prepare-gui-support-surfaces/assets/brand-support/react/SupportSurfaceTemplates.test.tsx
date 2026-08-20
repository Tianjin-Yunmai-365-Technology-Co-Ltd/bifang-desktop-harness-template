import { Button, MantineProvider, Text } from "@mantine/core";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createInstance, type i18n } from "i18next";
import type { ReactElement } from "react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import enUS from "../i18n/en-US.json";
import zhCN from "../i18n/zh-CN.json";
import { AboutPageTemplate } from "./AboutPageTemplate";
import { BrandUpdaterBanner } from "./BrandUpdaterBanner";
import { SponsorPageTemplate } from "./SponsorPageTemplate";
import { SupportMedia } from "./SupportMedia";
import {
  BRAND_SUPPORT_PROFILE,
  isLocalSupportPath,
  resolveBrandAssetPath,
} from "./brandSupportProfile";

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

describe("shared brand support templates", () => {
  beforeEach(() => {
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

  /** 关于页从当前产品注入名称/版本，同时复用固定品牌联系人和可选动作。 */
  it("renders injected product facts and the approved brand contact", async () => {
    await renderTemplate(
      <AboutPageTemplate
        actions={<Button>Optional action</Button>}
        productName="Example Utility"
        sections={[
          {
            body: <Text>Section body</Text>,
            id: "facts",
            title: "Product facts",
          },
        ]}
        tagline="A product-owned tagline"
        version="3.4.5"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Example Utility" }),
    ).toBeInTheDocument();
    expect(screen.getByText("版本 3.4.5")).toBeInTheDocument();
    expect(screen.getByText(/2222980/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Optional action" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Product facts" }),
    ).toBeInTheDocument();
  });

  /** 未提供动作或区块时，关于页不制造占位入口。 */
  it("omits unselected about actions and sections", async () => {
    await renderTemplate(
      <AboutPageTemplate productName="Example Utility" version="1.0.0" />,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading")).toHaveLength(1);
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
    expect(pageStyle).not.toMatch(/min-width|pointer-events/i);
  });

  /** 英文深色方案复用同一品牌事实，并保持支付码可访问名称。 */
  it("renders the same sponsor profile in English and dark color scheme", async () => {
    await renderTemplate(<SponsorPageTemplate />, "en-US", "dark");

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
