import {
  ActionIcon,
  Box,
  Divider,
  Image,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconChevronLeft,
  IconChevronRight,
  IconHeart,
  IconInfoCircle,
  IconSettings,
  type TablerIcon,
} from "@tabler/icons-react";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";

import { FIXED_BOTTOM_NAVIGATION_ITEMS } from "./supportNavigation";
import { isLocalSupportPath } from "./brandSupportProfile";

/** 新 GUI 的侧栏先保持收起，用户仍可通过固定按钮展开。 */
export const DEFAULT_SIDEBAR_COLLAPSED = true;

/** 侧栏两种状态的固定宽度供应用壳层和内容偏移复用。 */
export const APP_SIDEBAR_WIDTHS = {
  collapsed: 76,
  collapsedLogo: 44,
  expanded: 248,
  expandedLogo: 72,
} as const;

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
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
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

/** 折叠时只显示图标并用 Tooltip 揭示名称，展开时同时显示图标和名称。 */
function SidebarNavigationItem({
  active,
  collapsed,
  icon,
  id,
  label,
  onClick,
}: {
  active: boolean;
  collapsed: boolean;
  icon: TablerIcon;
  id: string;
  label: string;
  onClick: () => void;
}): ReactElement {
  const IconComponent = icon;
  return (
    <Tooltip disabled={!collapsed} label={label} position="right" withArrow>
      <NavLink
        active={active}
        aria-label={label}
        component="button"
        data-icon-alignment={collapsed ? "center" : "start"}
        label={collapsed ? undefined : label}
        leftSection={
          <IconComponent
            aria-hidden="true"
            data-testid={`navigation-icon-${id}`}
            size={20}
            stroke={1.75}
          />
        }
        onClick={onClick}
        px={collapsed ? 0 : "sm"}
        styles={{
          body: { flex: collapsed ? "0 0 auto" : "1 1 auto" },
          root: { justifyContent: collapsed ? "center" : "flex-start" },
          section: { marginInlineEnd: collapsed ? 0 : undefined },
        }}
        type="button"
        variant="light"
      />
    </Tooltip>
  );
}

/** 渲染可收起固定侧栏：功能从上向下增长，赞助/设置/关于固定贴底。 */
export function AppSidebarTemplate({
  applicationName,
  logoSrc,
  version,
  featureItems,
  activePath,
  collapsed,
  onCollapsedChange,
  onNavigate,
}: AppSidebarTemplateProps): ReactElement {
  const { t } = useTranslation("brandSupport");
  const width = collapsed
    ? APP_SIDEBAR_WIDTHS.collapsed
    : APP_SIDEBAR_WIDTHS.expanded;
  const logoSize = collapsed
    ? APP_SIDEBAR_WIDTHS.collapsedLogo
    : APP_SIDEBAR_WIDTHS.expandedLogo;

  if (!isLocalSupportPath(logoSrc)) {
    throw new Error("application logo must use a packaged local path");
  }

  return (
    <Box
      aria-label={t("sidebar.application_navigation")}
      component="nav"
      data-collapsed={collapsed}
      data-testid="app-sidebar"
      style={{
        background: "var(--app-surface)",
        borderInlineEnd: "1px solid var(--app-border)",
        height: "100dvh",
        insetBlock: 0,
        insetInlineStart: 0,
        position: "fixed",
        transition: "width 160ms ease",
        width,
        zIndex: 100,
      }}
    >
      <Stack gap="sm" h="100%" p="sm">
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
            h={logoSize}
            src={logoSrc}
            w={logoSize}
          />
          <Text
            aria-label={`${applicationName} ${t("sidebar.version", { version })}`}
            c="dimmed"
            data-testid="app-sidebar-version"
            fw={600}
            lineClamp={1}
            size="xs"
            ta={collapsed ? "center" : "start"}
          >
            v{version}
          </Text>
          <ActionIcon
            aria-label={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
            onClick={() => onCollapsedChange(!collapsed)}
            variant="subtle"
          >
            {collapsed ? (
              <IconChevronRight aria-hidden="true" size={18} stroke={1.75} />
            ) : (
              <IconChevronLeft aria-hidden="true" size={18} stroke={1.75} />
            )}
          </ActionIcon>
        </Stack>

        <Divider />

        <ScrollArea
          data-testid="feature-navigation"
          style={{ flex: 1, minHeight: 0 }}
          type="auto"
        >
          <Stack gap={4}>
            {collapsed ? null : (
              <Text c="dimmed" fw={600} px="sm" size="xs">
                {t("sidebar.features")}
              </Text>
            )}
            {featureItems.map((item) => (
              <SidebarNavigationItem
                active={activePath === item.to}
                collapsed={collapsed}
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
                collapsed={collapsed}
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
