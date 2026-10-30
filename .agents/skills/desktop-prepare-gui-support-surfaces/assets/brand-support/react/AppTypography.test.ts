import { DEFAULT_THEME, mergeMantineTheme } from "@mantine/core";
import { describe, expect, it } from "vitest";
import { APP_THEME } from "./AppThemeProviderTemplate";
import { resolveAppThemeTokens } from "./appDesignTokens";

/** 将主题中实际十六进制颜色转换为 WCAG 相对亮度。 */
function luminance(color: string): number {
  if (/^#[\da-f]{3}$/i.test(color)) color = "#" + [...color.slice(1)].map((digit) => digit + digit).join("");
  if (!/^#[\da-f]{6}$/i.test(color)) throw new Error(`Unsupported test color: ${color}`);
  const channel = (offset: number) => {
    const value = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** 比较真实主题输出，避免凭 Token 名称推定亮暗对比合格。 */
function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("neutral typography theme", () => {
  /** 普通及辅助文字在亮暗网格各行状态下达到 4.5:1。 */
  it("text_contrast_covers_light_dark_and_grid_states", () => {
    const theme = mergeMantineTheme(DEFAULT_THEME, APP_THEME);
    const resolved = resolveAppThemeTokens(theme);
    for (const scheme of [resolved.light, resolved.dark]) {
      for (const foreground of ["--app-text", "--app-text-muted", "--mantine-color-dimmed", "--mantine-color-placeholder"] as const) {
        for (const background of ["--app-background", "--app-surface", "--app-table-row", "--app-table-row-alternate", "--app-table-row-hover", "--app-table-row-selected"] as const) {
          const text = scheme[foreground];
          const surface = scheme[background];
          if (text === undefined || surface === undefined) throw new Error("Missing theme contrast token");
          expect(contrast(text, surface), `${foreground} ${background}: ${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});
