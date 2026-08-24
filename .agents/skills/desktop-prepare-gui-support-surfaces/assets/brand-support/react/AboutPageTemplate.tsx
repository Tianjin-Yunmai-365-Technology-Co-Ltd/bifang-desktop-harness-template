import {
  Badge,
  Box,
  Group,
  List,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import type { ReactElement, ReactNode } from "react";
import { useTranslation } from "react-i18next";

import {
  BRAND_SUPPORT_PROFILE,
  type BrandSupportContact,
} from "./brandSupportProfile";

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
}

/** 展示当前下游产品名、权威版本、共享作者、联系方式和固定免责声明。 */
export function AboutPageTemplate({
  productName,
  version,
  tagline,
  sections = [],
  actions,
  contact = BRAND_SUPPORT_PROFILE.contacts.support,
}: AboutPageTemplateProps): ReactElement {
  const { t } = useTranslation("brandSupport");

  return (
    <Stack data-testid="brand-about-page" gap="xl">
      <Paper p="lg" radius="lg" withBorder>
        <Stack gap="md">
          <Title order={2}>{productName}</Title>
          <Badge size="lg" variant="light">
            {t("about.version")} {version}
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
