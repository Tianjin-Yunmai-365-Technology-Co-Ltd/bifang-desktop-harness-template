import type { CSSVariablesResolver } from "@mantine/core";

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
    labelFontSize: 12,
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
export const resolveAppThemeTokens: CSSVariablesResolver = (theme) => ({
  variables: { "--app-control-compact-height": "2rem" },
  light: {
    "--app-accent": theme.colors[theme.primaryColor][7],
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
    "--app-table-row-selected": theme.colors[theme.primaryColor][0],
    "--app-sponsor-overlay": "linear-gradient(rgba(248, 250, 255, 0.68), rgba(248, 250, 255, 0.82))",
  },
  dark: {
    "--app-accent": theme.colors[theme.primaryColor][3],
    "--app-background": theme.colors.dark[9],
    "--app-border": theme.colors.dark[5],
    "--app-surface": theme.colors.dark[7],
    "--app-surface-muted": theme.colors.dark[6],
    "--app-text": theme.colors.gray[0],
    "--app-text-muted": theme.colors.dark[1],
    "--app-success": theme.colors.green[3],
    "--app-table-row": theme.colors.dark[7],
    "--app-table-row-alternate": theme.colors.dark[6],
    "--app-table-row-hover": theme.colors.dark[4],
    "--app-table-row-selected": theme.colors[theme.primaryColor][9],
    "--app-sponsor-overlay": "linear-gradient(rgba(9, 11, 18, 0.84), rgba(9, 11, 18, 0.92))",
  },
});
