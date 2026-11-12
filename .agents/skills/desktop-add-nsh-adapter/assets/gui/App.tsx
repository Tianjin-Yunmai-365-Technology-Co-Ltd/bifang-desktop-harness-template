import { colorScheme, effect, locale, mount, platform, safeArea, Scroll, setColorScheme, signal, Storage, Text, View, windowSize, type JSX } from "nsh";
import { Button as BaseButton, Radio, RadioGroup } from "nsh/base";
import { Action, HomeContent, nativeDesktop } from "./App.shared";
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
const terminal = platform.idiom === "terminal";
const nativeMobile = platform.os === "ios" || platform.os === "android";

function SettingsSection(props: { title: string; description: string; children: JSX.Element }) {
  const colors = () => palette(colorScheme());
  return (
    <View style={{
      gap: tokens.settingsGap,
      padding: tokens.cardPadding,
      backgroundColor: colors().surface,
      borderWidth: tokens.borderWidth,
      borderColor: colors().sidebarBorder,
      borderRadius: tokens.cardRadius,
    }}>
      <Text style={{ color: colors().foreground, fontSize: tokens.sectionTitle, fontWeight: "600" }}>{props.title}</Text>
      <Text style={{ color: colors().muted, fontSize: tokens.body, lineHeight: tokens.bodyLineHeight }}>{props.description}</Text>
      {props.children}
    </View>
  );
}

function SettingsChoices<T extends string>(props: {
  groupLabel: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const colors = () => palette(colorScheme());
  return (
    <RadioGroup
      style={{
        width: "100%",
        maxWidth: tokens.settingsControlMaxWidth,
        height: tokens.segmentedHeight,
        flexDirection: "row",
        padding: tokens.segmentedInset,
        backgroundColor: colors().background,
        borderWidth: tokens.borderWidth,
        borderColor: colors().sidebarBorder,
        borderRadius: tokens.cardRadius,
      }}
    >
      {props.options.map((option) => (
        <Radio
          checked={props.value === option.value}
          onChange={() => props.onChange(option.value)}
          accessibilityLabel={`${props.groupLabel}: ${option.label}`}
          focusStyle={{ borderColor: colors().focus }}
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: tokens.borderWidth,
            borderColor: props.value === option.value ? colors().selectedBorder : "transparent",
            backgroundColor: props.value === option.value ? colors().selected : "transparent",
            borderRadius: tokens.radius,
          }}
        >
          <Text style={{ color: props.value === option.value ? colors().foreground : colors().muted, fontSize: tokens.body, fontWeight: props.value === option.value ? "600" : "400" }}>{option.label}</Text>
        </Radio>
      ))}
    </RadioGroup>
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

function MobileTabAction(props: { label: string; onPress: () => void; selected: boolean }) {
  const colors = () => palette(colorScheme());
  return (
    <BaseButton
      onPress={props.onPress}
      selected={props.selected}
      accessibilityLabel={props.label}
      focusStyle={{ borderColor: colors().focus }}
      style={{
        flex: 1,
        minHeight: tokens.mobileTabHeight,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: tokens.controlPaddingHorizontal,
        paddingVertical: tokens.controlPaddingVertical,
        borderWidth: tokens.borderWidth,
        borderColor: props.selected ? colors().selectedBorder : "transparent",
        borderRadius: tokens.radius,
        backgroundColor: props.selected ? colors().selected : "transparent",
      }}
    >
      <Text style={{ color: colors().foreground, fontSize: tokens.body, fontWeight: props.selected ? "600" : "400" }}>{props.label}</Text>
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

const language = signal<Language>("en");
const appearance = signal<"system" | "light" | "dark">("system");
const collapsed = signal(false);

function App(props: { secondary?: boolean } = {}) {
  const page = signal<Page>("home");
  const error = signal("");
  const narrow = () => terminal || windowSize().width < tokens.narrow;
  const desktopRail = () => nativeDesktop && !narrow();
  const shortBrand = () => desktopRail() && (COMPACT_SIDEBAR || collapsed());
  const sidebarWidth = () => {
    if (nativeMobile || narrow()) return "100%";
    if (!nativeDesktop) return tokens.sidebarFallback;
    return shortBrand() ? tokens.sidebarCompact : tokens.sidebar;
  };
  const title = () => language() === "zh" ? NAME_ZH : NAME_EN;
  const colors = () => palette(colorScheme());

  if (!props.secondary) {
    language.set(locale().startsWith("zh") ? "zh" : "en");
    effect(() => {
      let live = true;
      void Storage.getItem("interface-language").then(
        (saved) => { if (live && (saved === "zh" || saved === "en")) language.set(saved); },
        () => { if (live) error.set(tr(language(), "storage_error")); },
      );
      void Storage.getItem("appearance").then(
        (saved) => {
          if (live && (saved === "system" || saved === "light" || saved === "dark")) {
            appearance.set(saved);
            setColorScheme(saved);
          }
        },
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
  }

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
      setColorScheme(next);
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
    <View style={{ flex: 1, flexDirection: nativeMobile || narrow() ? "column" : "row", backgroundColor: colors().background }}>
      <View style={{
        width: sidebarWidth(),
        padding: tokens.sidebarPadding,
        paddingTop: tokens.sidebarPadding + (nativeMobile ? safeArea().top : 0),
        paddingRight: tokens.sidebarPadding + (nativeMobile ? safeArea().right : 0),
        paddingLeft: tokens.sidebarPadding + (nativeMobile ? safeArea().left : 0),
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
        {!nativeMobile && (desktopRail() ? <>
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
          </View>)}
      </View>
      <Scroll style={{ flex: 1, minHeight: 0 }} contentStyle={{
        padding: narrow() ? tokens.contentGap : tokens.contentPadding,
        paddingRight: (narrow() ? tokens.contentGap : tokens.contentPadding) + (nativeMobile ? safeArea().right : 0),
        paddingBottom: narrow() ? tokens.contentGap : tokens.contentPadding,
        paddingLeft: (narrow() ? tokens.contentGap : tokens.contentPadding) + (nativeMobile ? safeArea().left : 0),
        gap: tokens.contentGap,
      }}>
        {page() === "home" && <HomeContent language={language()} title={title()} />}
        __DESKTOP_PANEL__
        {page() === "settings" &&
          <View style={{ width: "100%", maxWidth: tokens.settingsMaxWidth, alignSelf: "center", gap: tokens.sectionGap }}>
            <View style={{ gap: tokens.optionGap }}>
              <Text style={{ color: colors().foreground, fontSize: tokens.title, fontWeight: "600" }}>{tr(language(), "settings")}</Text>
              <Text style={{ color: colors().muted, fontSize: tokens.body, lineHeight: tokens.bodyLineHeight }}>{tr(language(), "settings_description")}</Text>
            </View>
            <SettingsSection title={tr(language(), "language")} description={tr(language(), "language_description")}>
              <SettingsChoices
                groupLabel={tr(language(), "language")}
                options={[{ value: "zh", label: "中文" }, { value: "en", label: "English" }]}
                value={language()}
                onChange={(next) => { void saveLanguage(next); }}
              />
            </SettingsSection>
            <SettingsSection title={tr(language(), "appearance")} description={tr(language(), "appearance_description")}>
              <SettingsChoices
                groupLabel={tr(language(), "appearance")}
                options={[{ value: "system", label: tr(language(), "system") }, { value: "light", label: tr(language(), "light") }, { value: "dark", label: tr(language(), "dark") }]}
                value={appearance()}
                onChange={(next) => { void saveAppearance(next); }}
              />
            </SettingsSection>
          </View>}
        __ABOUT_PAGE__
        __SPONSOR_PAGE__
        {error() ? <Text style={{ color: colors().error }}>{error()}</Text> : null}
      </Scroll>
      {nativeMobile && <View testID="mobile-bottom-nav" style={{
        flexDirection: "row",
        gap: tokens.optionGap,
        paddingTop: tokens.optionGap,
        paddingBottom: tokens.optionGap + safeArea().bottom,
        paddingLeft: tokens.sidebarPadding + safeArea().left,
        paddingRight: tokens.sidebarPadding + safeArea().right,
        borderTopWidth: tokens.borderWidth,
        borderTopColor: colors().sidebarBorder,
        backgroundColor: colors().surface,
      }}>
        <MobileTabAction label={tr(language(), "home")} selected={page() === "home"} onPress={() => page.set("home")} />
        <MobileTabAction label={tr(language(), "settings")} selected={page() === "settings"} onPress={() => page.set("settings")} />
      </View>}
    </View>
  );
}

mount(App);
