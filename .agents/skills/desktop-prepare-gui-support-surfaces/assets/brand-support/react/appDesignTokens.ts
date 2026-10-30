import type { CSSVariablesResolver } from "@mantine/core";

/** 原生无衬线与中文回退共用一处定义；只消费已安装字体，不请求远程字体。 */
export const APP_TYPOGRAPHY = {
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", "WenQuanYi Micro Hei", sans-serif',
  fontFamilyMonospace: 'ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", "Noto Sans Mono CJK SC", "Microsoft YaHei", "PingFang SC", monospace',
  fontSizes: { xs: "0.8125rem", sm: "0.875rem", md: "1rem", lg: "1.125rem", xl: "1.25rem" },
  lineHeights: { xs: "1.5", sm: "1.5", md: "1.6", lg: "1.5", xl: "1.4" },
  weight: { regular: 400, emphasis: 600 },
  letterSpacing: "normal",
  headings: {
    h1: { fontSize: "1.5rem", lineHeight: "1.35" },
    h2: { fontSize: "1.25rem", lineHeight: "1.4" },
    h3: { fontSize: "1.125rem", lineHeight: "1.45" },
    h4: { fontSize: "1rem", lineHeight: "1.5" },
    h5: { fontSize: "0.875rem", lineHeight: "1.5" },
    h6: { fontSize: "0.8125rem", lineHeight: "1.5" },
  },
  grid: { fontSize: "0.875rem", lineHeight: "1.5", paddingBlock: "0.375rem", paddingInline: "0.5rem", selectionWidth: "3rem" },
} as const;

/** 应用展示尺寸集中定义；页面和壳层只消费语义字段，不另存一份数值。 */
export const APP_LAYOUT_TOKENS = {
  sidebar: {
    widths: { compact: 80, detailedCollapsed: 76, detailedExpanded: 248 },
    logoSizes: { compact: 36, detailedCollapsed: 44, detailedExpanded: 72 },
    compactPadding: 8,
    sectionGap: 8,
    navIconSize: 24,
    iconStroke: 2,
    detailedItemMinHeight: 44,
    collapseIconSize: 20,
    tooltipDelay: 0,
    menuGap: 4,
    labelFontSize: 14,
    labelLineHeight: 1.5,
    compactItemMinHeight: 56,
    compactItemPadding: 4,
    compactItemGap: 4,
  },
  sponsor: {
    contentMaxWidth: 1180,
    illustrationSize: 88,
    priceFontSize: "3rem",
    paymentImageMaxWidth: 160,
    benefitIconSize: 20,
  },
} as const;

/** 所有展示层颜色只从当前主题生成；主色变更同时影响强调、表格和支持页。 */
export const resolveAppThemeTokens: CSSVariablesResolver = (theme) => {
  const primaryColors = theme.colors[theme.primaryColor];
  if (!primaryColors) {
    throw new Error(`应用主题缺少主色色板：${theme.primaryColor}`);
  }
  return {
    variables: {
      "--app-control-compact-height": "2rem",
      "--app-font-weight-regular": String(APP_TYPOGRAPHY.weight.regular),
      "--app-font-weight-emphasis": String(APP_TYPOGRAPHY.weight.emphasis),
      "--app-letter-spacing": APP_TYPOGRAPHY.letterSpacing,
      "--app-grid-font-size": APP_TYPOGRAPHY.grid.fontSize,
      "--app-grid-line-height": APP_TYPOGRAPHY.grid.lineHeight,
      "--app-grid-padding-block": APP_TYPOGRAPHY.grid.paddingBlock,
      "--app-grid-padding-inline": APP_TYPOGRAPHY.grid.paddingInline,
      "--app-grid-selection-width": APP_TYPOGRAPHY.grid.selectionWidth,
    },
    light: {
      "--mantine-color-dimmed": theme.colors.gray[7],
      "--mantine-color-placeholder": theme.colors.gray[7],
      "--app-accent": primaryColors[7],
      "--app-background": theme.colors.gray[0],
      "--app-border": theme.colors.gray[3],
      "--app-surface": theme.white,
      "--app-surface-muted": theme.colors.gray[0],
      "--app-text": theme.colors.dark[9],
      "--app-text-muted": theme.colors.gray[7],
      "--app-success": theme.colors.green[7],
      "--app-table-row": theme.white,
      "--app-table-row-alternate": theme.colors.gray[1],
      "--app-table-row-hover": theme.colors.gray[3],
      "--app-table-row-selected": primaryColors[0],
      "--app-sponsor-overlay": "linear-gradient(rgba(248, 250, 255, 0.68), rgba(248, 250, 255, 0.82))",
    },
    dark: {
      "--mantine-color-dimmed": theme.colors.gray[2],
      "--mantine-color-placeholder": theme.colors.gray[2],
      "--app-accent": primaryColors[3],
      "--app-background": theme.colors.dark[9],
      "--app-border": theme.colors.dark[5],
      "--app-surface": theme.colors.dark[7],
      "--app-surface-muted": theme.colors.dark[6],
      "--app-text": theme.colors.gray[0],
      "--app-text-muted": theme.colors.gray[2],
      "--app-success": theme.colors.green[3],
      "--app-table-row": theme.colors.dark[7],
      "--app-table-row-alternate": theme.colors.dark[6],
      "--app-table-row-hover": theme.colors.dark[4],
      "--app-table-row-selected": primaryColors[9],
      "--app-sponsor-overlay": "linear-gradient(rgba(9, 11, 18, 0.84), rgba(9, 11, 18, 0.92))",
    },
  };
};
