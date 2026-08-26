import { List, Modal, Paper, Stack, Text, Title } from "@mantine/core";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";

import { formatDisplayVersion } from "./displayVersion";
import {
  selectVisibleReleaseNotes,
  type ReleaseNoteEntry,
} from "./releaseNotes";

/** 更新日志弹窗所需的本地发布事实和关闭交互。 */
export interface ReleaseNotesDialogTemplateProps {
  opened: boolean;
  releases: readonly ReleaseNoteEntry[];
  onClose: () => void;
}

/** 按固定结构展示最多五个版本、每类最多十条的更新日志。 */
export function ReleaseNotesDialogTemplate({
  opened,
  releases,
  onClose,
}: ReleaseNotesDialogTemplateProps): ReactElement {
  const { t } = useTranslation("brandSupport");
  const visibleReleases = selectVisibleReleaseNotes(releases);

  return (
    <Modal
      onClose={onClose}
      opened={opened}
      size="lg"
      title={t("release_notes.dialog_title")}
    >
      {visibleReleases.length === 0 ? (
        <Text c="dimmed">{t("release_notes.empty")}</Text>
      ) : (
        <Stack data-testid="release-notes-list" gap="lg">
          {visibleReleases.map((release) => (
            <Paper key={release.version} p="md" radius="md" withBorder>
              <Stack gap="sm">
                <Title order={3} size="h4">
                  {t("release_notes.entry_title", {
                    date: release.releaseDate,
                    version: formatDisplayVersion(release.version),
                  })}
                </Title>
                <Title order={4} size="h5">
                  {t("release_notes.feature_optimizations")}
                </Title>
                {release.featureOptimizations.length > 0 ? (
                  <List spacing="xs">
                    {release.featureOptimizations.map((item) => (
                      <List.Item key={item}>{item}</List.Item>
                    ))}
                  </List>
                ) : (
                  <Text c="dimmed">{t("release_notes.none")}</Text>
                )}
                <Title order={4} size="h5">
                  {t("release_notes.bug_fixes")}
                </Title>
                {release.bugFixes.length > 0 ? (
                  <List spacing="xs">
                    {release.bugFixes.map((item) => (
                      <List.Item key={item}>{item}</List.Item>
                    ))}
                  </List>
                ) : (
                  <Text c="dimmed">{t("release_notes.none")}</Text>
                )}
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
    </Modal>
  );
}
