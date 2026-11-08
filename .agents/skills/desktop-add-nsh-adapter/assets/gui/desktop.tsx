import { colorScheme, effect, host, signal, Text, View } from "nsh";
import { Button as BaseButton } from "nsh/base";
__AUTOSTART_IMPORT__
import { isAvailable as desktopAvailable, Menu } from "nsh/desktop";
import { tr, type Language } from "./translations";
import { palette, tokens } from "./tokens";

interface WindowInfo {
  id: number;
  title: string;
}

function Action(props: { label: string; onPress: () => void }) {
  const colors = () => palette(colorScheme());
  return (
    <BaseButton
      onPress={props.onPress}
      accessibilityLabel={props.label}
      style={{ minHeight: tokens.controlHeight, paddingHorizontal: tokens.controlPaddingHorizontal, paddingVertical: tokens.controlPaddingVertical, borderRadius: tokens.radius, backgroundColor: colors().surface }}
    >
      <Text style={{ color: colors().foreground }}>{props.label}</Text>
    </BaseButton>
  );
}

/** Keep the desktop menu mounted across pages so language changes update the active window. */
export function DesktopPanel(props: { language: Language; title: string; showControls: boolean; onSettings: () => void }) {
  const windows = signal<WindowInfo[]>([]);
  const error = signal("");
  const windowId = typeof host.params.windowId === "number" ? host.params.windowId : 0;
  const menuOwner = signal(host.params.menuGlobal !== true || host.params.menuOwner === true);
  __DEEP_LINK_STATE__

  async function invoke<T = unknown>(name: string, data?: unknown): Promise<T | undefined> {
    try {
      error.set("");
      return await host.call<T>(name, data);
    } catch {
      error.set(tr(props.language, "window_error"));
      return undefined;
    }
  }

  __DEEP_LINK_DRAIN__

  effect(() => {
    if (!host.available()) return;
    const stop = host.on<WindowInfo[]>("windows", (items) => windows.set(items));
    const stopMenuOwner = host.on<boolean>("menu.owner", (owner) => menuOwner.set(owner));
    void invoke<WindowInfo[]>("window.list").then((items) => { if (items) windows.set(items); });
    __DEEP_LINK_INIT__
    return () => { stop(); stopMenuOwner(); __DEEP_LINK_CLEANUP__ };
  });

  let lastTitle: string | null = null;
  effect(() => {
    if (!desktopAvailable || !host.available()) return;
    const title = windowId > 1 ? `${props.title} · ${windowId}` : props.title;
    if (title === lastTitle) return;
    lastTitle = title;
    void invoke<boolean>("window.setTitle", { title });
  });

  effect(() => {
    if (!desktopAvailable || !host.available() || !menuOwner()) return;
    Menu.setApplicationMenu([
      { label: props.title, submenu: [
        { label: tr(props.language, "new_window"), onSelect: () => { void invoke("window.open"); } },
        { label: tr(props.language, "show_all"), onSelect: () => { void invoke("window.showAll"); } },
        { label: tr(props.language, "settings"), onSelect: props.onSettings },
        { type: "separator" },
        { label: tr(props.language, "quit"), onSelect: () => { void invoke("app.quit"); } },
      ] },
      { label: tr(props.language, "windows"), submenu: [
        { label: tr(props.language, "close_window"), onSelect: () => { void invoke("window.close", { id: windowId }); } },
        ...windows().map((item) => ({ label: item.title, onSelect: () => { void invoke("window.focus", { id: item.id }); } })),
      ] },
    ]);
  });

  if (!host.available()) return null;
  return (
    <>
      {props.showControls && <View style={{ gap: tokens.settingsGap }}>
        <Text style={{ color: palette(colorScheme()).foreground, fontSize: tokens.body }}>{tr(props.language, "windows")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tokens.optionGap }}>
          <Action label={tr(props.language, "new_window")} onPress={() => { void invoke("window.open"); }} />
          <Action label={tr(props.language, "show_all")} onPress={() => { void invoke("window.showAll"); }} />
          <Action label={tr(props.language, "close_window")} onPress={() => { void invoke("window.close", { id: windowId }); }} />
          <Action label={tr(props.language, "quit")} onPress={() => { void invoke("app.quit"); }} />
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tokens.optionGap }}>
          {windows().map((item) => <Action label={item.title} onPress={() => { void invoke("window.focus", { id: item.id }); }} />)}
        </View>
        __DEEP_LINK_NODE__
      </View>}
      {error() ? <Text style={{ color: palette(colorScheme()).error }}>{error()}</Text> : null}
    </>
  );
}

__AUTOSTART_IMPL__
