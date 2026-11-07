import { colorScheme, effect, signal, Text, View } from "nsh";
import { Scaffold } from "__PROJECT_ID__/native";
import { tr, type Language } from "./translations";
import { palette, tokens } from "./tokens";

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
