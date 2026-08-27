/** GUI 初始化时对两个可选支持页面作出的显式选择。 */
export interface SupportPageSelection {
  aboutPage: boolean;
  sponsorPage: boolean;
}

/** 支持页面菜单项的稳定结构，设置页始终存在。 */
export interface SupportNavigationItem {
  id: "about" | "settings" | "sponsor";
  labelKey:
    | "navigation.about"
    | "navigation.settings"
    | "navigation.sponsor";
  to: "/about" | "/settings" | "/sponsor";
}

/** 全部可用支持页面；运行时只渲染初始化中明确选择的可选页面。 */
export const AVAILABLE_SUPPORT_NAVIGATION_ITEMS = {
  about: {
    id: "about",
    labelKey: "navigation.about",
    to: "/about",
  },
  settings: {
    id: "settings",
    labelKey: "navigation.settings",
    to: "/settings",
  },
  sponsor: {
    id: "sponsor",
    labelKey: "navigation.sponsor",
    to: "/sponsor",
  },
} as const satisfies Record<string, SupportNavigationItem>;

/** 按赞助、设置、关于的稳定视觉顺序组装本次已选页面。 */
export function buildSupportNavigationItems(
  selection: SupportPageSelection,
): readonly SupportNavigationItem[] {
  const items: SupportNavigationItem[] = [];
  if (selection.sponsorPage) {
    items.push(AVAILABLE_SUPPORT_NAVIGATION_ITEMS.sponsor);
  }
  items.push(AVAILABLE_SUPPORT_NAVIGATION_ITEMS.settings);
  if (selection.aboutPage) {
    items.push(AVAILABLE_SUPPORT_NAVIGATION_ITEMS.about);
  }
  return items;
}

/** 支持页面路由，供文件路由与菜单回归复用。 */
export type SupportNavigationPath = SupportNavigationItem["to"];
