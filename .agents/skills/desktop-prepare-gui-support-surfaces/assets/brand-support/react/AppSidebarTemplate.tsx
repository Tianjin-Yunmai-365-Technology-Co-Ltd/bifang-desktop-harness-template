import {
  ActionIcon,
  Box,
  Divider,
  Group,
  Image,
  NavLink,
  ScrollArea,
  Stack,
  Text,
} from "@mantine/core";
import type { ReactElement, ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { FIXED_BOTTOM_NAVIGATION_ITEMS } from "./supportNavigation";
import { isLocalSupportPath } from "./brandSupportProfile";

/** 新 GUI 的侧栏先保持收起，用户仍可通过固定按钮展开。 */
export const DEFAULT_SIDEBAR_COLLAPSED = true;

/** 侧栏两种状态的固定宽度供应用壳层和内容偏移复用。 */
export const APP_SIDEBAR_WIDTHS = {
  collapsed: 76,
  expanded: 248,
} as const;

/** 产品功能菜单项由当前下游按显示顺序注入。 */
export interface FeatureNavigationItem {
  id: string;
  label: string;
  to: string;
  icon?: ReactNode;
}

/** 固定支持菜单可选的产品图标集合。 */
export interface FixedNavigationIcons {
  sponsor?: ReactNode;
  settings?: ReactNode;
  about?: ReactNode;
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
  fixedIcons?: FixedNavigationIcons;
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
  fixedIcons = {},
}: AppSidebarTemplateProps): ReactElement {
  const { t } = useTranslation("brandSupport");
  const width = collapsed
    ? APP_SIDEBAR_WIDTHS.collapsed
    : APP_SIDEBAR_WIDTHS.expanded;
  const logoSize = collapsed ? 44 : 72;

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
        background: "var(--mantine-color-body)",
        borderInlineEnd: "1px solid var(--mantine-color-default-border)",
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
        <Stack align="center" data-testid="app-sidebar-identity" gap="xs">
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
            <Text aria-hidden="true" fw={700} size="sm">
              {collapsed ? "›" : "‹"}
            </Text>
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
              <NavLink
                active={activePath === item.to}
                aria-label={item.label}
                component="button"
                key={item.id}
                label={collapsed ? undefined : item.label}
                leftSection={item.icon}
                onClick={() => onNavigate(item.to)}
                type="button"
                variant="light"
              />
            ))}
          </Stack>
        </ScrollArea>

        <Divider />

        <Stack data-testid="fixed-bottom-navigation" gap={4}>
          {FIXED_BOTTOM_NAVIGATION_ITEMS.map((item) => (
            <NavLink
              active={activePath === item.to}
              aria-label={t(item.labelKey)}
              component="button"
              key={item.id}
              label={collapsed ? undefined : t(item.labelKey)}
              leftSection={fixedIcons[item.id]}
              onClick={() => onNavigate(item.to)}
              type="button"
              variant="light"
            />
          ))}
        </Stack>
      </Stack>
    </Box>
  );
}
