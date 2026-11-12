import { colorScheme, effect, Text, View, type JSX } from "nsh";
import { Application, currentWindow, Menu, Window, windows } from "nsh/desktop";
import { Action } from "./App.shared";
import { tr, type Language } from "./translations";
import { palette, tokens } from "./tokens";
__DESKTOP_OPTIONAL_IMPORTS__

let sequence = 0;

export function DesktopPanel(props: {
  language: Language;
  title: string;
  showControls: boolean;
  onSettings: () => void;
  renderWindow: () => JSX.Element;
}) {
  const win = currentWindow();
  const openWindow = () => Window.open(props.renderWindow, {
    id: `window-${++sequence}`,
    title: props.title,
    kind: "normal",
  });
  const showAll = () => {
    for (const window of windows()) window.show();
    win.focus();
  };
  const close = () => { __DESKTOP_CLOSE__ };
  const quit = () => Application.quit();
  effect(() => win.set({ title: win.main ? props.title : `${props.title} · ${win.id.slice("window-".length)}` }));

  if (win.main) {
    effect(() => Menu.setApplicationMenu([
      { label: props.title, submenu: [
        { label: tr(props.language, "new_window"), onSelect: openWindow },
        { label: tr(props.language, "show_all"), onSelect: showAll },
        { label: tr(props.language, "settings"), onSelect: () => { win.focus(); props.onSettings(); } },
        { type: "separator" },
        { label: tr(props.language, "quit"), onSelect: quit },
      ] },
    ]));
    __TRAY_SETUP__
  }
  __DEEP_LINK_SETUP__

  return (
    <>
      {props.showControls && <View style={{ gap: tokens.settingsGap }}>
        <Text style={{ color: palette(colorScheme()).foreground, fontSize: tokens.body }}>{tr(props.language, "windows")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tokens.optionGap }}>
          <Action label={tr(props.language, "new_window")} onPress={openWindow} />
          <Action label={tr(props.language, "show_all")} onPress={showAll} />
          <Action label={tr(props.language, "close_window")} onPress={close} />
          <Action label={tr(props.language, "quit")} onPress={quit} />
        </View>
        __DEEP_LINK_NODE__
      </View>}
    </>
  );
}
