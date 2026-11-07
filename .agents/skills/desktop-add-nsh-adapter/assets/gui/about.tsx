import { colorScheme, signal, Text, View } from "nsh";
import { Button as BaseButton } from "nsh/base";
import { Scaffold } from "__PROJECT_ID__/native";
import { tr, type Language } from "./translations";
import { palette, tokens } from "./tokens";

const CONTENT_ZH = __CONTENT_ZH__;
const CONTENT_EN = __CONTENT_EN__;
const VERSION = __VERSION__;

/** The support copy is bundled; release notes come from the paired Rust build. */
export function AboutPage(props: { language: Language }) {
  const notesOpen = signal(false);
  const colors = () => palette(colorScheme());
  return (
    <View style={{ gap: tokens.settingsGap }}>
      <Text style={{ color: colors().foreground, fontSize: tokens.title }}>{tr(props.language, "about")}</Text>
      <Text style={{ color: colors().muted }}>v{VERSION}</Text>
      <Text style={{ color: colors().foreground }}>{props.language === "zh" ? CONTENT_ZH : CONTENT_EN}</Text>
      <BaseButton
        onPress={() => notesOpen.set(!notesOpen())}
        accessibilityLabel={props.language === "zh" ? "更新日志" : "Release notes"}
        style={{ minHeight: tokens.controlHeight, paddingHorizontal: tokens.controlPaddingHorizontal, paddingVertical: tokens.controlPaddingVertical, borderRadius: tokens.radius, backgroundColor: colors().surface }}
      >
        <Text style={{ color: colors().foreground }}>{props.language === "zh" ? "更新日志" : "Release notes"}</Text>
      </BaseButton>
      {notesOpen() && <Text style={{ color: colors().foreground }}>{Scaffold.releaseNotes(props.language === "zh")}</Text>}
    </View>
  );
}
