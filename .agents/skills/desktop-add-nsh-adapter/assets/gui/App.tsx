import { colorScheme, effect, locale, mount, platform, Scroll, setColorScheme, signal, Storage, Text, View, windowSize } from "nsh";
import { Button as BaseButton } from "nsh/base";
import { Scaffold } from "__PROJECT_ID__/native";
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
const desktopOnly = platform.os === "macos" || platform.os === "windows" || platform.os === "linux";

function Action(props: { label: string; onPress: () => void; selected?: boolean }) {
  const colors = palette(colorScheme());
  return (
    <BaseButton
      onPress={props.onPress}
      accessibilityLabel={props.label}
      style={{
        minHeight: tokens.controlHeight,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: tokens.radius,
        backgroundColor: props.selected ? colors.selected : colors.surface,
      }}
    >
      <Text style={{ color: colors.foreground, fontSize: tokens.body }}>{props.label}</Text>
    </BaseButton>
  );
}

function App() {
  const page = signal<Page>("home");
  const language = signal<Language>(locale().startsWith("zh") ? "zh" : "en");
  const appearance = signal<"system" | "light" | "dark">("system");
  const collapsed = signal(false);
  const error = signal("");
  const coreStatus = signal<"loading" | "ready" | "uninitialized" | "error">("loading");
  const narrow = () => windowSize().width < tokens.narrow;
  const title = () => language() === "zh" ? NAME_ZH : NAME_EN;
  const colors = () => palette(colorScheme());

  effect(() => {
    let live = true;
    void Scaffold.status().then(
      (initialized) => { if (live) coreStatus.set(initialized ? "ready" : "uninitialized"); },
      () => { if (live) coreStatus.set("error"); },
    );
    return () => { live = false; };
  });

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
    if (!COMPACT_SIDEBAR) {
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

  const navigation = () => (
    <View style={{ flexDirection: narrow() ? "row" : "column", flexWrap: "wrap", gap: 8 }}>
      <Action label={tr(language(), "home")} selected={page() === "home"} onPress={() => page.set("home")} />
      __SPONSOR_NAV__
      <Action label={tr(language(), "settings")} selected={page() === "settings"} onPress={() => page.set("settings")} />
      __ABOUT_NAV__
    </View>
  );

  return (
    <View style={{ flex: 1, flexDirection: narrow() ? "column" : "row", backgroundColor: colors().background }}>
      <View style={{
        width: narrow() ? "100%" : COMPACT_SIDEBAR || collapsed() ? tokens.sidebarCompact : tokens.sidebar,
        padding: 14,
        gap: 12,
        backgroundColor: colors().surface,
      }}>
        __LOGO_NODE__
        <Text style={{ color: colors().foreground, fontSize: tokens.title, fontWeight: "600" }}>
          {COMPACT_SIDEBAR || collapsed() ? "NSH" : title()}
        </Text>
        {navigation()}
        {!COMPACT_SIDEBAR && !narrow() &&
          <Action label={tr(language(), collapsed() ? "expand" : "collapse")} onPress={() => void toggleSidebar()} />}
      </View>
      <Scroll style={{ flex: 1 }} contentStyle={{ padding: 24, gap: 16 }}>
        {page() === "home" &&
          <View style={{ gap: 12 }}>
            <Text style={{ color: colors().foreground, fontSize: tokens.title }}>{title()}</Text>
            <Text style={{ color: colors().muted, fontSize: tokens.body }}>
              {tr(language(), coreStatus() === "loading" ? "status_loading" : coreStatus() === "ready" ? "neutral" : coreStatus() === "uninitialized" ? "status_uninitialized" : "status_error")}
            </Text>
            __DESKTOP_PANEL__
          </View>}
        {page() === "settings" &&
          <View style={{ gap: 12 }}>
            <Text style={{ color: colors().foreground, fontSize: tokens.title }}>{tr(language(), "settings")}</Text>
            <Text style={{ color: colors().muted }}>{tr(language(), "language")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Action label="中文" onPress={() => void saveLanguage("zh")} />
              <Action label="English" onPress={() => void saveLanguage("en")} />
            </View>
            <Text style={{ color: colors().muted }}>{tr(language(), "appearance")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
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
