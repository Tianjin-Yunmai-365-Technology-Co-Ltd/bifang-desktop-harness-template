import {
  Badge,
  Box,
  Button,
  Group,
  List,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconHistory } from "@tabler/icons-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";

import {
  BRAND_SUPPORT_PROFILE,
  type BrandSupportContact,
} from "./brandSupportProfile";
import { formatDisplayVersion } from "./displayVersion";
import type { LocalizedReleaseNoteEntry } from "./releaseNotes";
import { loadBundledReleaseNotes } from "./releaseNotesResource";
import { ReleaseNotesDialogTemplate } from "./ReleaseNotesDialogTemplate";

const RELEASE_NOTES_LOAD_TIMEOUT_MS = 15_000;
type ReleaseNotesStatus = "idle" | "loading" | "ready" | "error";

/** 关于页的一个产品事实区块。 */
export interface AboutSection {
  id: string;
  title: string;
  body: ReactNode;
}

/** 关于页模板所需的当前产品事实和可选动作。 */
export interface AboutPageTemplateProps {
  productName: string;
  version: string;
  tagline?: string;
  sections?: AboutSection[];
  actions?: ReactNode;
  contact?: BrandSupportContact;
  releaseNotesLoader?: () => Promise<readonly LocalizedReleaseNoteEntry[]>;
}

/** 展示产品事实、本地发布日志、共享作者、联系方式和固定免责声明。 */
export function AboutPageTemplate({
  productName,
  version,
  tagline,
  sections = [],
  actions,
  contact = BRAND_SUPPORT_PROFILE.contacts.support,
  releaseNotesLoader = loadBundledReleaseNotes,
}: AboutPageTemplateProps): ReactElement {
  const { t } = useTranslation("brandSupport");
  const [releaseNotesOpened, setReleaseNotesOpened] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState<
    readonly LocalizedReleaseNoteEntry[]
  >([]);
  const [releaseNotesStatus, setReleaseNotesStatus] =
    useState<ReleaseNotesStatus>("idle");
  const releaseNotesStatusRef = useRef<ReleaseNotesStatus>("idle");
  const releaseNotesRequest = useRef(0);
  const releaseNotesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      releaseNotesRequest.current += 1;
      if (releaseNotesTimer.current !== null) {
        clearTimeout(releaseNotesTimer.current);
      }
    },
    [],
  );

  /** 只通过已注册的窄命令加载候选资源，并忽略卸载后的异步结果。 */
  const requestReleaseNotes = useCallback(() => {
    if (releaseNotesStatusRef.current === "loading") return;
    const request = releaseNotesRequest.current + 1;
    releaseNotesRequest.current = request;
    releaseNotesStatusRef.current = "loading";
    setReleaseNotesStatus("loading");
    const finish = (
      status: "ready" | "error",
      loaded: readonly LocalizedReleaseNoteEntry[],
    ) => {
      if (releaseNotesRequest.current !== request) return;
      if (releaseNotesTimer.current !== null) {
        clearTimeout(releaseNotesTimer.current);
        releaseNotesTimer.current = null;
      }
      releaseNotesStatusRef.current = status;
      setReleaseNotes(loaded);
      setReleaseNotesStatus(status);
    };
    releaseNotesTimer.current = setTimeout(() => {
      if (releaseNotesRequest.current !== request) return;
      releaseNotesRequest.current += 1;
      releaseNotesTimer.current = null;
      releaseNotesStatusRef.current = "error";
      setReleaseNotes([]);
      setReleaseNotesStatus("error");
    }, RELEASE_NOTES_LOAD_TIMEOUT_MS);
    void Promise.resolve()
      .then(releaseNotesLoader)
      .then(
        (loaded) => finish("ready", loaded),
        () => finish("error", []),
      );
  }, [releaseNotesLoader]);

  /** 打开弹窗时首次加载资源；已成功加载的同一候选内容在本页复用。 */
  const openReleaseNotes = useCallback(() => {
    setReleaseNotesOpened(true);
    if (releaseNotesStatusRef.current === "idle") requestReleaseNotes();
  }, [requestReleaseNotes]);

  return (
    <Stack data-testid="brand-about-page" gap="xl">
      <Paper p="lg" radius="lg" withBorder>
        <Stack gap="md">
          <Title order={2}>{productName}</Title>
          <Badge size="lg" variant="light">
            {t("about.version")} {formatDisplayVersion(version)}
          </Badge>
          {tagline ? (
            <Text c="dimmed" size="sm">
              {tagline}
            </Text>
          ) : null}
          {actions ? <Group gap="sm">{actions}</Group> : null}
          <Box>
            <Text fw={600} mb={4} size="sm">
              {t("about.contact_author_title")}
            </Text>
            <Text c="dimmed" size="sm">
              {t("about.studio")} ·{" "}
              {t("about.contact_label", { contact: contact.value })}
            </Text>
            <Text c="dimmed" size="sm">
              {t("about.support_thanks")}
            </Text>
          </Box>
        </Stack>
      </Paper>

      <Paper data-testid="about-release-notes-section" p="lg" radius="lg" withBorder>
        <Group justify="space-between" wrap="wrap">
          <Title order={3}>{t("about.release_notes")}</Title>
          <Button
            leftSection={<IconHistory aria-hidden="true" size={18} />}
            onClick={openReleaseNotes}
            variant="default"
          >
            {t("about.release_notes")}
          </Button>
        </Group>
      </Paper>

      <ReleaseNotesDialogTemplate
        onClose={() => setReleaseNotesOpened(false)}
        onRetry={requestReleaseNotes}
        opened={releaseNotesOpened}
        releases={releaseNotes}
        status={releaseNotesStatus}
      />

      <Paper p="lg" radius="lg" withBorder>
        <Title mb="md" order={3}>
          {t("about.disclaimer_title")}
        </Title>
        <List spacing="sm" type="ordered">
          <List.Item>{t("about.disclaimer_1")}</List.Item>
          <List.Item>{t("about.disclaimer_2")}</List.Item>
          <List.Item>{t("about.disclaimer_3")}</List.Item>
        </List>
      </Paper>

      {sections.map((section) => (
        <Paper key={section.id} p="lg" radius="lg" withBorder>
          <Title mb="md" order={3}>
            {section.title}
          </Title>
          <Box>{section.body}</Box>
        </Paper>
      ))}
    </Stack>
  );
}
