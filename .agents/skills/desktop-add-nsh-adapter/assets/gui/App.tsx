import { colorScheme, effect, locale, mount, platform, Scroll, setColorScheme, signal, Storage, Text, View, windowSize } from "nsh";
import { Button as BaseButton } from "nsh/base";
import { HomeContent } from "./App.shared";
import { tr, type Language } from "./translations";
import { palette, tokens } from "./tokens";
__DESKTOP_IMPORT__
__ABOUT_IMPORT__
__SPONSOR_IMPORT__
__LOGO_IMPORT__

type Page = "home" | "settings" | "about" | "sponsor";
const COMPACT_SIDEBAR = __COMPACT__;
const NAME_ZH = __NAME_ZH__;
const NAME_EN = __NAME_EN__;
const nativeDesktop = platform.idiom !== "terminal" && (platform.os === "macos" || platform.os === "windows" || platform.os === "linux");

function Action(props: { label: string; onPress: () => void; selected?: boolean }) {
  const colors = () => palette(colorScheme());
  return (
    <BaseButton
      onPress={props.onPress}
      selected={props.selected}
      accessibilityLabel={props.label}
      focusStyle={nativeDesktop ? { borderColor: colors().focus } : undefined}
      style={{
        minHeight: tokens.controlHeight,
        paddingHorizontal: tokens.controlPaddingHorizontal,
        paddingVertical: tokens.controlPaddingVertical,
        borderWidth: nativeDesktop ? tokens.borderWidth : 0,
        borderColor: "transparent",
        borderRadius: tokens.radius,
        backgroundColor: props.selected ? colors().selected : colors().surface,
      }}
    >
      <Text style={{ color: colors().foreground, fontSize: tokens.body }}>{props.label}</Text>
    </BaseButton>
  );
}

function NavAction(props: { label: string; onPress: () => void; selected: boolean; rail: boolean }) {
  const colors = () => palette(colorScheme());
  if (!props.rail) return <Action label={props.label} selected={props.selected} onPress={props.onPress} />;
  return (
    <BaseButton
      onPress={props.onPress}
      selected={props.selected}
      accessibilityLabel={props.label}
      hoverStyle={props.selected ? undefined : { backgroundColor: colors().sidebarHover }}
      activeStyle={{ backgroundColor: colors().sidebarPressed }}
      focusStyle={{ borderColor: colors().focus }}
      style={{
        minHeight: tokens.sidebarItemHeight,
        flexDirection: "row",
        alignItems: "center",
        gap: tokens.sidebarItemGap,
        paddingHorizontal: tokens.sidebarItemInset,
        borderRadius: tokens.radius,
        borderWidth: tokens.borderWidth,
        borderColor: props.selected ? colors().selectedBorder : "transparent",
        backgroundColor: props.selected ? colors().selected : "transparent",
      }}
    >
      <View style={{
        width: tokens.sidebarIndicatorWidth,
        height: tokens.sidebarIndicatorHeight,
        borderRadius: tokens.sidebarIndicatorRadius,
        backgroundColor: props.selected ? colors().accent : "transparent",
      }} />
      <Text style={{
        flex: 1,
        numberOfLines: 1,
        color: colors().foreground,
        fontSize: tokens.body,
        fontWeight: props.selected ? "600" : "400",
      }}>{props.label}</Text>
    </BaseButton>
  );
}

function SidebarToggle(props: { label: string; onPress: () => void }) {
  const colors = () => palette(colorScheme());
  return (
    <BaseButton
      onPress={props.onPress}
      accessibilityLabel={props.label}
      hoverStyle={{ backgroundColor: colors().sidebarHover }}
      focusStyle={{ borderColor: colors().focus }}
      style={{
        minHeight: tokens.sidebarToggleHeight,
        marginTop: tokens.sidebarToggleTop,
        paddingHorizontal: tokens.sidebarItemInset,
        borderWidth: tokens.borderWidth,
        borderColor: "transparent",
        borderRadius: tokens.radius,
      }}
    >
      <Text style={{ color: colors().muted, fontSize: tokens.sidebarToggleText }}>{props.label}</Text>
    </BaseButton>
  );
}

function App() {
  const page = signal<Page>("home");
  const language = signal<Language>(locale().startsWith("zh") ? "zh" : "en");
  const appearance = signal<"system" | "light" | "dark">("system");
  const collapsed = signal(false);
  const error = signal("");
  const narrow = () => windowSize().width < tokens.narrow;
  const desktopRail = () => nativeDesktop && !narrow();
  const shortBrand = () => desktopRail() && (COMPACT_SIDEBAR || collapsed());
  const sidebarWidth = () => {
    if (narrow()) return "100%";
    if (!nativeDesktop) return tokens.sidebarFallback;
    return shortBrand() ? tokens.sidebarCompact : tokens.sidebar;
  };
  const title = () => language() === "zh" ? NAME_ZH : NAME_EN;
  const colors = () => palette(colorScheme());

  effect(() => {
    let live = true;
    void Storage.getItem("interface-language").then(
      (saved) => { if (live && (saved === "zh" || saved === "en")) language.set(saved); },
      () => { if (live) error.set(tr(language(), "storage_error")); },
    );
    void Storage.getItem("appearance").then(
      (saved) => { if (live && (saved === "system" || saved === "light" || saved === "dark")) appearance.set(saved); },
      () => { if (live) error.set(tr(language(), "storage_error")); },
    );
    if (nativeDesktop && !COMPACT_SIDEBAR) {
      void Storage.getItem("sidebar-collapsed").then(
        (saved) => { if (live) collapsed.set(saved === "true"); },
        () => { if (live) error.set(tr(language(), "storage_error")); },
      );
    }
    return () => { live = false; };
  });

  effect(() => setColorScheme(appearance()));

  async function saveLanguage(next: Language) {
    try {
      await Storage.setItem("interface-language", next);
      language.set(next);
      error.set("");
    } catch {
      error.set(tr(language(), "storage_error"));
    }
  }

  async function saveAppearance(next: "system" | "light" | "dark") {
    try {
      await Storage.setItem("appearance", next);
      appearance.set(next);
      error.set("");
    } catch {
      error.set(tr(language(), "storage_error"));
    }
  }

  async function toggleSidebar() {
    const next = !collapsed();
    try {
      await Storage.setItem("sidebar-collapsed", String(next));
      collapsed.set(next);
      error.set("");
    } catch {
      error.set(tr(language(), "storage_error"));
    }
  }

  const primaryNavigation = (rail: boolean) => (
    <NavAction label={tr(language(), "home")} selected={page() === "home"} rail={rail} onPress={() => page.set("home")} />
  );

  const secondaryNavigation = (rail: boolean) => (
    <>
      __SPONSOR_NAV__
      <NavAction label={tr(language(), "settings")} selected={page() === "settings"} rail={rail} onPress={() => page.set("settings")} />
      __ABOUT_NAV__
    </>
  );

  return (
    <View style={{ flex: 1, flexDirection: narrow() ? "column" : "row", backgroundColor: colors().background }}>
      <View style={{
        width: sidebarWidth(),
        padding: tokens.sidebarPadding,
        gap: desktopRail() ? 0 : tokens.settingsGap,
        backgroundColor: desktopRail() ? colors().sidebar : colors().surface,
        borderRightWidth: desktopRail() ? tokens.borderWidth : 0,
        borderRightColor: colors().sidebarBorder,
      }}>
        <View style={{
          minHeight: desktopRail() ? tokens.sidebarHeaderHeight : undefined,
          flexDirection: "row",
          alignItems: "center",
          gap: tokens.sidebarHeaderGap,
          paddingHorizontal: desktopRail() ? tokens.sidebarHeaderInset : 0,
          paddingBottom: desktopRail() ? tokens.sidebarHeaderBottom : 0,
          borderBottomWidth: desktopRail() ? tokens.borderWidth : 0,
          borderBottomColor: colors().sidebarBorder,
        }}>
          __LOGO_NODE__
          <View style={{ flex: 1, minWidth: 0, gap: tokens.sidebarHeaderTextGap }}>
            {desktopRail() && !shortBrand() &&
              <Text style={{ color: colors().muted, fontSize: tokens.sidebarEyebrow, fontWeight: "600", letterSpacing: tokens.sidebarEyebrowSpacing }}>NSH</Text>}
            <Text style={{ color: colors().foreground, fontSize: desktopRail() ? tokens.sidebarBrandText : tokens.title, fontWeight: "600", numberOfLines: 1 }}>
              {shortBrand() ? "NSH" : title()}
            </Text>
          </View>
        </View>
        {desktopRail() ? <>
          <View style={{ flex: 1, paddingTop: tokens.sidebarFooterTop, gap: tokens.sidebarItemSpacing }}>
            {primaryNavigation(true)}
          </View>
          <View style={{ borderTopWidth: tokens.borderWidth, borderTopColor: colors().sidebarBorder, paddingTop: tokens.sidebarFooterTop, gap: tokens.sidebarItemSpacing }}>
            {secondaryNavigation(true)}
            {!COMPACT_SIDEBAR && <SidebarToggle label={tr(language(), collapsed() ? "expand" : "collapse")} onPress={() => void toggleSidebar()} />}
          </View>
        </> :
          <View style={{ flexDirection: narrow() ? "row" : "column", flexWrap: "wrap", gap: tokens.optionGap }}>
            {primaryNavigation(false)}
            {secondaryNavigation(false)}
          </View>}
      </View>
      <Scroll style={{ flex: 1 }} contentStyle={{ padding: tokens.contentPadding, gap: tokens.contentGap }}>
        {page() === "home" && <HomeContent language={language()} title={title()} />}
        __DESKTOP_PANEL__
        {page() === "settings" &&
          <View style={{ gap: tokens.settingsGap }}>
            <Text style={{ color: colors().foreground, fontSize: tokens.title }}>{tr(language(), "settings")}</Text>
            <Text style={{ color: colors().muted }}>{tr(language(), "language")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tokens.optionGap }}>
              <Action label="中文" onPress={() => void saveLanguage("zh")} />
              <Action label="English" onPress={() => void saveLanguage("en")} />
            </View>
            <Text style={{ color: colors().muted }}>{tr(language(), "appearance")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tokens.optionGap }}>
              <Action label={tr(language(), "system")} onPress={() => void saveAppearance("system")} />
              <Action label={tr(language(), "light")} onPress={() => void saveAppearance("light")} />
              <Action label={tr(language(), "dark")} onPress={() => void saveAppearance("dark")} />
            </View>
            __AUTOSTART_SETTING__
          </View>}
        __ABOUT_PAGE__
        __SPONSOR_PAGE__
        {error() ? <Text style={{ color: colors().error }}>{error()}</Text> : null}
      </Scroll>
    </View>
  );
}

mount(App);
