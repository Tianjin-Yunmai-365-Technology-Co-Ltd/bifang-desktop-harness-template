import { colorScheme, effect, platform, signal, Text, View } from "nsh";
import { Button as BaseButton } from "nsh/base";
import { Scaffold } from "__PROJECT_ID__/native";
import { tr, type Language } from "./translations";
import { palette, tokens } from "./tokens";

export const nativeDesktop = platform.idiom !== "terminal" && (platform.os === "macos" || platform.os === "windows" || platform.os === "linux");

export function Action(props: { label: string; onPress: () => void; selected?: boolean }) {
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

/** Shared product view: desktop, mobile, Web, and terminal entries render this module. */
export function HomeContent(props: { language: Language; title: string }) {
  const coreStatus = signal<"loading" | "ready" | "uninitialized" | "error">("loading");
  effect(() => {
    let live = true;
    void Scaffold.status().then(
      (initialized) => { if (live) coreStatus.set(initialized ? "ready" : "uninitialized"); },
      () => { if (live) coreStatus.set("error"); },
    );
    return () => { live = false; };
  });

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: palette(colorScheme()).foreground, fontSize: tokens.title }}>{props.title}</Text>
      <Text style={{ color: palette(colorScheme()).muted, fontSize: tokens.body }}>
        {tr(props.language, coreStatus() === "loading" ? "status_loading" : coreStatus() === "ready" ? "neutral" : coreStatus() === "uninitialized" ? "status_uninitialized" : "status_error")}
      </Text>
    </View>
  );
}
