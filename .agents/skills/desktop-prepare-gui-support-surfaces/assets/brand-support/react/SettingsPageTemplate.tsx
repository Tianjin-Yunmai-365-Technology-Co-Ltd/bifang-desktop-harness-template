import {
  Badge,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  Title,
  useMantineColorScheme,
} from "@mantine/core";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";

import type { AppColorScheme } from "./AppThemeProviderTemplate";
import { formatDisplayVersion } from "./displayVersion";

/** 设置页固定支持的界面语言。 */
export type SupportedInterfaceLanguage = "zh-CN" | "en-US";

/** 固定设置页所需的应用事实和本地展示偏好。 */
export interface SettingsPageTemplateProps {
  applicationName: string;
  version: string;
  language: SupportedInterfaceLanguage;
  onLanguageChange: (language: SupportedInterfaceLanguage) => void;
}

/** 把 SegmentedControl 字符串收敛为固定语言枚举。 */
function isSupportedLanguage(
  value: string,
): value is SupportedInterfaceLanguage {
  return value === "zh-CN" || value === "en-US";
}

/** 把 SegmentedControl 字符串收敛为固定主题偏好枚举。 */
function isSupportedColorScheme(value: string): value is AppColorScheme {
  return value === "light" || value === "dark" || value === "auto";
}

/** 渲染固定设置页：只包含版本、语言和主题等本地展示偏好。 */
export function SettingsPageTemplate({
  applicationName,
  version,
  language,
  onLanguageChange,
}: SettingsPageTemplateProps): ReactElement {
  const { t } = useTranslation("brandSupport");
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  return (
    <Stack data-testid="settings-page" gap="lg">
      <Group justify="space-between" wrap="wrap">
        <Title order={2}>{t("settings.title")}</Title>
        <Badge size="lg" variant="light">
          {applicationName} · {formatDisplayVersion(version)}
        </Badge>
      </Group>

      <Paper p="lg" radius="lg" withBorder>
        <Stack gap="md">
          <Title order={3}>{t("settings.language_title")}</Title>
          <Text c="dimmed" size="sm">
            {t("settings.language_description")}
          </Text>
          <SegmentedControl
            aria-label={t("settings.language_title")}
            data={[
              { label: t("settings.language_zh_cn"), value: "zh-CN" },
              { label: t("settings.language_en_us"), value: "en-US" },
            ]}
            onChange={(value) => {
              if (isSupportedLanguage(value)) {
                onLanguageChange(value);
              }
            }}
            value={language}
          />
        </Stack>
      </Paper>

      <Paper p="lg" radius="lg" withBorder>
        <Stack gap="md">
          <Title order={3}>{t("settings.theme_title")}</Title>
          <Text c="dimmed" size="sm">
            {t("settings.theme_description")}
          </Text>
          <SegmentedControl
            aria-label={t("settings.theme_title")}
            data={[
              { label: t("settings.theme_light"), value: "light" },
              { label: t("settings.theme_dark"), value: "dark" },
              { label: t("settings.theme_system"), value: "auto" },
            ]}
            onChange={(value) => {
              if (isSupportedColorScheme(value)) {
                setColorScheme(value);
              }
            }}
            value={colorScheme}
          />
        </Stack>
      </Paper>
    </Stack>
  );
}
