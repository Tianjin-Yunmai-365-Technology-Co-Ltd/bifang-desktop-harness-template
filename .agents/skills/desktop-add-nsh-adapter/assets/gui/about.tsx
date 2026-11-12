import { appInfo, colorScheme, signal, Text, View } from "nsh";
import { Button as BaseButton } from "nsh/base";
import { Scaffold } from "__PROJECT_ID__/native";
import { tr, type Language } from "./translations";
import { palette, tokens } from "./tokens";

const CONTENT_ZH = __CONTENT_ZH__;
const CONTENT_EN = __CONTENT_EN__;

/** Bundled support copy is selected by language; release notes come from the paired Rust build. */
export function AboutPage(props: { language: Language }) {
  const notesOpen = signal(false);
  const colors = () => palette(colorScheme());
  const labels = () => props.language === "zh" ? CONTENT_ZH : CONTENT_EN;
  const cardStyle = () => ({
    width: "100%" as const,
    padding: tokens.cardPadding,
    gap: tokens.settingsGap,
    borderWidth: tokens.borderWidth,
    borderColor: colors().sidebarBorder,
    borderRadius: tokens.cardRadius,
    backgroundColor: colors().surface,
  });

  return (
    <View style={{ width: "100%", maxWidth: tokens.aboutMaxWidth, alignSelf: "center", gap: tokens.sectionGap }}>
      <View style={{ gap: tokens.optionGap }}>
        <Text style={{ color: colors().foreground, fontSize: tokens.title, fontWeight: "600" }}>{tr(props.language, "about")}</Text>
        <Text style={{ color: colors().muted, fontSize: tokens.body }}>v{appInfo().version}</Text>
      </View>

      <View style={cardStyle()}>
        <Text style={{ color: colors().foreground, fontSize: tokens.sectionTitle, fontWeight: "600" }}>{labels().contact}</Text>
        <View style={{ gap: tokens.optionGap }}>
          <Text style={{ color: colors().foreground, fontSize: tokens.body, fontWeight: "600", lineHeight: tokens.bodyLineHeight }}>{labels().owner}</Text>
          <Text style={{ color: colors().muted, fontSize: tokens.body, lineHeight: tokens.bodyLineHeight }}>{labels().contactDetail}</Text>
        </View>
        <Text style={{ color: colors().muted, fontSize: tokens.body, lineHeight: tokens.bodyLineHeight }}>{labels().thanks}</Text>
      </View>

      <View style={cardStyle()}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: tokens.settingsGap }}>
          <Text style={{ flex: 1, minWidth: 0, color: colors().foreground, fontSize: tokens.sectionTitle, fontWeight: "600" }}>{labels().releaseNotes}</Text>
          <BaseButton
            onPress={() => notesOpen.set(!notesOpen())}
            selected={notesOpen()}
            accessibilityLabel={labels().releaseNotes}
            style={{
              minHeight: tokens.controlHeight,
              paddingHorizontal: tokens.controlPaddingHorizontal,
              paddingVertical: tokens.controlPaddingVertical,
              borderWidth: tokens.borderWidth,
              borderColor: colors().selectedBorder,
              borderRadius: tokens.radius,
              backgroundColor: colors().selected,
            }}
          >
            <Text style={{ color: colors().foreground, fontSize: tokens.body }}>{labels().releaseNotes}</Text>
          </BaseButton>
        </View>
        {notesOpen() &&
          <View style={{ paddingTop: tokens.settingsGap, borderTopWidth: tokens.borderWidth, borderTopColor: colors().sidebarBorder }}>
            <Text style={{ color: colors().foreground, fontSize: tokens.body, lineHeight: tokens.bodyLineHeight }}>{Scaffold.releaseNotes(props.language === "zh")}</Text>
          </View>}
      </View>

      <View style={cardStyle()}>
        <Text style={{ color: colors().foreground, fontSize: tokens.sectionTitle, fontWeight: "600" }}>{labels().disclaimer}</Text>
        <View style={{ gap: tokens.settingsGap }}>
          {labels().disclaimerItems.map((item, index) =>
            <View style={{ flexDirection: "row", gap: tokens.optionGap }}>
              <Text style={{ color: colors().muted, fontSize: tokens.body, lineHeight: tokens.bodyLineHeight }}>{index + 1}.</Text>
              <Text style={{ flex: 1, minWidth: 0, color: colors().foreground, fontSize: tokens.body, lineHeight: tokens.bodyLineHeight }}>{item}</Text>
            </View>)}
        </View>
      </View>
    </View>
  );
}
