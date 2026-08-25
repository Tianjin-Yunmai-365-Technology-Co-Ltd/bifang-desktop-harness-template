import {
  Box,
  Divider,
  Image,
  NavLink,
  ScrollArea,
  Stack,
  Text,
} from "@mantine/core";
import {
  IconHeart,
  IconInfoCircle,
  IconSettings,
  type TablerIcon,
} from "@tabler/icons-react";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";

import { FIXED_BOTTOM_NAVIGATION_ITEMS } from "./supportNavigation";
import { isLocalSupportPath } from "./brandSupportProfile";

/** 固定侧栏宽度为约十个中文字符及两侧留白提供稳定空间。 */
export const APP_SIDEBAR_WIDTH_PX = 136;

/** 固定侧栏中的应用 Logo 使用比旧收起态更清晰的尺寸。 */
export const APP_SIDEBAR_LOGO_SIZE_PX = 56;

/** 菜单图标采用易识别且不会挤压下方文字的固定尺寸。 */
export const APP_SIDEBAR_NAV_ICON_SIZE_PX = 30;

/** 菜单文字每行预留约十个全角中文字符的宽度。 */
export const APP_SIDEBAR_LABEL_WIDTH_CH = 10;

/** 稍小字号让十个中文字符能在固定侧栏内完整排布。 */
export const APP_SIDEBAR_LABEL_FONT_SIZE_PX = 11;

/** 产品功能菜单项由当前下游按显示顺序注入。 */
export interface FeatureNavigationItem {
  id: string;
  label: string;
  to: string;
  icon: TablerIcon;
}

/** 固定左侧菜单所需的当前应用事实和纯交互回调。 */
export interface AppSidebarTemplateProps {
  applicationName: string;
  logoSrc: string;
  version: string;
  featureItems: FeatureNavigationItem[];
  activePath: string;
  onNavigate: (path: string) => void;
}

/** 固定支持菜单只使用统一的 Tabler 图标组件。 */
const FIXED_NAVIGATION_ICONS: Record<
  (typeof FIXED_BOTTOM_NAVIGATION_ITEMS)[number]["id"],
  TablerIcon
> = {
  sponsor: IconHeart,
  settings: IconSettings,
  about: IconInfoCircle,
};

/** 以图标在上、居中文字在下的固定结构渲染一个菜单项。 */
function SidebarNavigationItem({
  active,
  icon,
  id,
  label,
  onClick,
}: {
  active: boolean;
  icon: TablerIcon;
  id: string;
  label: string;
  onClick: () => void;
}): ReactElement {
  const IconComponent = icon;
  return (
    <NavLink
      active={active}
      aria-label={label}
      component="button"
      data-label-width-ch={APP_SIDEBAR_LABEL_WIDTH_CH}
      data-navigation-layout="icon-above-label"
      label={
        <Text
          data-testid={`navigation-label-${id}`}
          lineClamp={2}
          style={{
            fontSize: APP_SIDEBAR_LABEL_FONT_SIZE_PX,
            inlineSize: `${APP_SIDEBAR_LABEL_WIDTH_CH}em`,
            lineHeight: 1.2,
            maxInlineSize: "100%",
            overflowWrap: "anywhere",
            textAlign: "center",
          }}
        >
          {label}
        </Text>
      }
      leftSection={
        <IconComponent
          aria-hidden="true"
          data-testid={`navigation-icon-${id}`}
          size={APP_SIDEBAR_NAV_ICON_SIZE_PX}
          stroke={1.75}
        />
      }
      onClick={onClick}
      styles={{
        body: { flex: "0 0 auto", width: "100%" },
        root: {
          alignItems: "center",
          flexDirection: "column",
          gap: 4,
          justifyContent: "center",
          minHeight: 72,
          paddingBlock: 8,
          paddingInline: 0,
        },
        section: { marginInlineEnd: 0 },
      }}
      type="button"
      variant="light"
    />
  );
}

/** 渲染不可展开的固定侧栏：功能从上向下增长，赞助/设置/关于固定贴底。 */
export function AppSidebarTemplate({
  applicationName,
  logoSrc,
  version,
  featureItems,
  activePath,
  onNavigate,
}: AppSidebarTemplateProps): ReactElement {
  const { t } = useTranslation("brandSupport");

  if (!isLocalSupportPath(logoSrc)) {
    throw new Error("application logo must use a packaged local path");
  }

  return (
    <Box
      aria-label={t("sidebar.application_navigation")}
      component="nav"
      data-layout="fixed-icon-above-label"
      data-testid="app-sidebar"
      style={{
        background: "var(--app-surface)",
        borderInlineEnd: "1px solid var(--app-border)",
        height: "100dvh",
        insetBlock: 0,
        insetInlineStart: 0,
        position: "fixed",
        width: APP_SIDEBAR_WIDTH_PX,
        zIndex: 100,
      }}
    >
      <Stack gap="sm" h="100%" p="xs">
        <Stack
          align="center"
          data-icon-alignment="center"
          data-testid="app-sidebar-identity"
          gap="xs"
          style={{ alignItems: "center", width: "100%" }}
        >
          <Image
            alt={t("sidebar.logo_alt", { applicationName })}
            data-testid="app-sidebar-logo"
            fit="contain"
            h={APP_SIDEBAR_LOGO_SIZE_PX}
            src={logoSrc}
            w={APP_SIDEBAR_LOGO_SIZE_PX}
          />
          <Text
            aria-label={`${applicationName} ${t("sidebar.version", { version })}`}
            c="dimmed"
            data-testid="app-sidebar-version"
            fw={600}
            lineClamp={1}
            size="xs"
            ta="center"
          >
            v{version}
          </Text>
        </Stack>

        <Divider />

        <ScrollArea
          data-testid="feature-navigation"
          style={{ flex: 1, minHeight: 0 }}
          type="auto"
        >
          <Stack gap={4}>
            {featureItems.map((item) => (
              <SidebarNavigationItem
                active={activePath === item.to}
                icon={item.icon}
                id={item.id}
                key={item.id}
                label={item.label}
                onClick={() => onNavigate(item.to)}
              />
            ))}
          </Stack>
        </ScrollArea>

        <Divider />

        <Stack data-testid="fixed-bottom-navigation" gap={4}>
          {FIXED_BOTTOM_NAVIGATION_ITEMS.map((item) => {
            const label = t(item.labelKey);
            return (
              <SidebarNavigationItem
                active={activePath === item.to}
                icon={FIXED_NAVIGATION_ICONS[item.id]}
                id={item.id}
                key={item.id}
                label={label}
                onClick={() => onNavigate(item.to)}
              />
            );
          })}
        </Stack>
      </Stack>
    </Box>
  );
}
