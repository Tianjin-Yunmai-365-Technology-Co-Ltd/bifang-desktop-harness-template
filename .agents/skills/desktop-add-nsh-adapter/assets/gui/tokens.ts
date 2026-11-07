/** The neutral shell's theme values stay in one adapter module. */
export const tokens = {
  narrow: 680,
  sidebar: 228,
  sidebarCompact: 84,
  controlHeight: 38,
  radius: 8,
  body: 14,
  title: 20,
} as const;

export function palette(scheme: "light" | "dark") {
  return scheme === "dark"
    ? { background: "#171b22", surface: "#232a34", selected: "#34465e", foreground: "#f2f4f7", muted: "#c4cbd5", error: "#ffb4a8" }
    : { background: "#f5f7fa", surface: "#ffffff", selected: "#dce8f7", foreground: "#182230", muted: "#526174", error: "#b42318" };
}
