/** 左侧菜单底部固定项的视觉顺序；从底部向上读取为关于、设置、赞助。 */
export const FIXED_BOTTOM_NAVIGATION_ITEMS = [
  {
    id: "sponsor",
    labelKey: "navigation.sponsor",
    to: "/sponsor",
  },
  {
    id: "settings",
    labelKey: "navigation.settings",
    to: "/settings",
  },
  {
    id: "about",
    labelKey: "navigation.about",
    to: "/about",
  },
] as const;

/** 固定底部页面路由，供文件路由与菜单回归复用。 */
export type FixedBottomNavigationPath =
  (typeof FIXED_BOTTOM_NAVIGATION_ITEMS)[number]["to"];
