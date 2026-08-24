import { Badge, Button, Group, Paper, Stack, Text, Title } from "@mantine/core";
import type { ReactElement, ReactNode } from "react";
import { useTranslation } from "react-i18next";

import {
  requiresMandatoryUpdate,
  type UpdatePresentation,
} from "./updatePresentation";

/** 强更阻断页只允许安装更新或安全退出应用。 */
export interface MandatoryUpdateGateTemplateProps {
  update: UpdatePresentation;
  children: ReactNode;
  installing: boolean;
  onInstallUpdate: () => void;
  onExitApplication: () => void;
}

/** 用根级条件分支阻断普通功能，避免可关闭弹窗绕过已验证强更政策。 */
export function MandatoryUpdateGateTemplate({
  update,
  children,
  installing,
  onInstallUpdate,
  onExitApplication,
}: MandatoryUpdateGateTemplateProps): ReactElement {
  const { t } = useTranslation("brandSupport");

  if (!requiresMandatoryUpdate(update)) {
    return <>{children}</>;
  }

  return (
    <Paper
      aria-modal="true"
      data-testid="mandatory-update-gate"
      maw={640}
      mx="auto"
      my="xl"
      p="xl"
      radius="lg"
      role="alertdialog"
      shadow="md"
      withBorder
    >
      <Stack gap="lg">
        <Stack gap="xs">
          <Badge color="red" variant="light">
            {t("updater.required_badge")}
          </Badge>
          <Title order={2}>{t("updater.required_title")}</Title>
          <Text>{t("updater.required_description")}</Text>
          <Text c="dimmed" size="sm">
            {t("updater.version_transition", {
              current: update.currentVersion,
              available: update.availableVersion ?? "—",
            })}
          </Text>
          {update.releaseNotes ? (
            <Text style={{ whiteSpace: "pre-wrap" }}>
              {update.releaseNotes}
            </Text>
          ) : null}
        </Stack>
        <Group justify="flex-end">
          <Button onClick={onExitApplication} variant="default">
            {t("updater.exit_application")}
          </Button>
          <Button loading={installing} onClick={onInstallUpdate}>
            {t("updater.install_update")}
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
