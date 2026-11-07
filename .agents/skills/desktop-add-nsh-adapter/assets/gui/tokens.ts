/** The neutral shell's theme values stay in one adapter module. */
export const tokens = {
  narrow: 680,
  sidebar: 244,
  sidebarCompact: 152,
  sidebarFallback: 228,
  sidebarPadding: 14,
  sidebarHeaderHeight: 64,
  sidebarHeaderInset: 6,
  sidebarHeaderGap: 10,
  sidebarHeaderTextGap: 2,
  sidebarHeaderBottom: 14,
  sidebarBrandMark: 34,
  sidebarBrandRadius: 10,
  sidebarBrandText: 15,
  sidebarEyebrow: 10,
  sidebarEyebrowSpacing: 0.8,
  sidebarItemHeight: 42,
  sidebarItemInset: 11,
  sidebarItemGap: 10,
  sidebarItemSpacing: 4,
  sidebarIndicatorWidth: 3,
  sidebarIndicatorHeight: 18,
  sidebarIndicatorRadius: 2,
  sidebarFooterTop: 12,
  sidebarToggleTop: 8,
  sidebarToggleHeight: 34,
  sidebarToggleText: 12,
  borderWidth: 1,
  controlHeight: 38,
  controlPaddingHorizontal: 14,
  controlPaddingVertical: 9,
  radius: 8,
  body: 14,
  title: 20,
  contentPadding: 24,
  contentGap: 16,
  settingsGap: 12,
  optionGap: 8,
} as const;

export function palette(scheme: "light" | "dark") {
  return scheme === "dark"
    ? {
      background: "#171b22", surface: "#232a34", sidebar: "#202833",
      sidebarBorder: "#364453", sidebarHover: "#2b3848", sidebarPressed: "#33465b",
      selected: "#34465e", selectedBorder: "#4c6788", accent: "#9ac5ff",
      focus: "#a8d1ff", foreground: "#f2f4f7",
      muted: "#c4cbd5", error: "#ffb4a8",
    }
    : {
      background: "#f5f7fa", surface: "#ffffff", sidebar: "#eef3f9",
      sidebarBorder: "#dce5ef", sidebarHover: "#e3ebf5", sidebarPressed: "#d9e5f3",
      selected: "#dce8f7", selectedBorder: "#bad2f1", accent: "#24549a",
      focus: "#24549a", foreground: "#182230",
      muted: "#526174", error: "#b42318",
    };
}
