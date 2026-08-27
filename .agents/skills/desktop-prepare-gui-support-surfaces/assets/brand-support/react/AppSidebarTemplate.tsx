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
import { useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";

import {
  buildSupportNavigationItems,
  type SupportPageSelection,
  type SupportNavigationItem,
} from "./supportNavigation";
import { isLocalSupportPath } from "./brandSupportProfile";
import { formatDisplayVersion } from "./displayVersion";

/** GUI 初始化可选择持续显示名称的精简模式或可收起的详细模式。 */
export type AppSidebarMode = "compact" | "detailed";

/** 详细模式首次启动默认展开，之后恢复设备级折叠偏好。 */
export const DEFAULT_DETAILED_SIDEBAR_COLLAPSED = false;

/** 详细模式折叠状态使用独立设备偏好键，不与页面会话状态混用。 */
export const APP_SIDEBAR_COLLAPSED_STORAGE_KEY =
  "app.sidebar.detailed.collapsed";

/** 两种模式及详细模式两种状态的固定宽度。 */
export const APP_SIDEBAR_WIDTHS = {
  compact: 136,
  detailedCollapsed: 76,
  detailedExpanded: 248,
} as const;

/** 精简和详细模式各状态使用的 Logo 尺寸。 */
export const APP_SIDEBAR_LOGO_SIZES = {
  compact: 56,
  detailedCollapsed: 44,
  detailedExpanded: 72,
} as const;

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
  mode: AppSidebarMode;
  supportPages: SupportPageSelection;
  activePath: string;
  onNavigate: (path: string) => void;
}

/** 固定支持菜单只使用统一的 Tabler 图标组件。 */
const FIXED_NAVIGATION_ICONS: Record<
  SupportNavigationItem["id"],
  TablerIcon
> = {
  sponsor: IconHeart,
  settings: IconSettings,
  about: IconInfoCircle,
};

/** 读取详细模式折叠偏好；缺失、不可用或非法值都回到默认展开。 */
function readDetailedSidebarCollapsed(): boolean {
  if (typeof window === "undefined") {
    return DEFAULT_DETAILED_SIDEBAR_COLLAPSED;
  }
  try {
    return (
      window.localStorage.getItem(APP_SIDEBAR_COLLAPSED_STORAGE_KEY) === "true"
    );
  } catch {
    return DEFAULT_DETAILED_SIDEBAR_COLLAPSED;
  }
}

/** 保存详细模式折叠偏好；存储不可用时仍保留本次运行内状态。 */
function persistDetailedSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      APP_SIDEBAR_COLLAPSED_STORAGE_KEY,
      String(collapsed),
    );
  } catch {
    // 设备级存储不可用时，当前 React 状态仍然有效。
  }
}

/** 根据所选模式渲染精简竖排菜单或详细横排/折叠菜单。 */
function SidebarNavigationItem({
  active,
  collapsed,
  icon,
  id,
  label,
  mode,
  onClick,
}: {
  active: boolean;
  collapsed: boolean;
  icon: TablerIcon;
  id: string;
  label: string;
  mode: AppSidebarMode;
  onClick: () => void;
}): ReactElement {
  const IconComponent = icon;
  const compact = mode === "compact";
  const iconOnly = mode === "detailed" && collapsed;
  const navigation = (
    <NavLink
      active={active}
      aria-label={label}
      component="button"
      data-label-width-ch={compact ? APP_SIDEBAR_LABEL_WIDTH_CH : undefined}
      data-navigation-layout={
        compact ? "icon-above-label" : iconOnly ? "icon-only" : "icon-with-label"
      }
      label={
        iconOnly ? undefined : compact ? (
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
        ) : (
          <Text data-testid={`navigation-label-${id}`} lineClamp={2}>
            {label}
          </Text>
        )
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
      px={compact || iconOnly ? 0 : "sm"}
      styles={{
        body: {
          flex: compact || iconOnly ? "0 0 auto" : "1 1 auto",
          width: compact ? "100%" : undefined,
        },
        root: {
          alignItems: "center",
          flexDirection: compact ? "column" : "row",
          gap: compact ? 4 : undefined,
          justifyContent: compact || iconOnly ? "center" : "flex-start",
          minHeight: compact ? 72 : 44,
          paddingBlock: compact ? 8 : undefined,
          paddingInline: compact || iconOnly ? 0 : undefined,
        },
        section: {
          marginInlineEnd: compact || iconOnly ? 0 : undefined,
        },
      }}
      type="button"
      variant="light"
    />
  );
  return iconOnly ? (
    <Tooltip label={label} position="right" withArrow>
      {navigation}
    </Tooltip>
  ) : (
    navigation
  );
}

/** 渲染所选侧栏模式，功能从上向下增长且已选支持页面固定贴底。 */
export function AppSidebarTemplate({
  applicationName,
  logoSrc,
  version,
  featureItems,
  mode,
  supportPages,
  activePath,
  onNavigate,
}: AppSidebarTemplateProps): ReactElement {
  const { t } = useTranslation("brandSupport");
  const displayVersion = formatDisplayVersion(version);
  const [detailedCollapsed, setDetailedCollapsed] = useState(
    readDetailedSidebarCollapsed,
  );
  const collapsed = mode === "detailed" && detailedCollapsed;
  const sizeKey =
    mode === "compact"
      ? "compact"
      : collapsed
        ? "detailedCollapsed"
        : "detailedExpanded";
  const width = APP_SIDEBAR_WIDTHS[sizeKey];
  const logoSize = APP_SIDEBAR_LOGO_SIZES[sizeKey];
  const supportNavigationItems = buildSupportNavigationItems(supportPages);

  if (!isLocalSupportPath(logoSrc)) {
    throw new Error("application logo must use a packaged local path");
  }

  return (
    <Box
      aria-label={t("sidebar.application_navigation")}
      component="nav"
      data-collapsed={collapsed}
      data-layout={mode === "compact" ? "compact" : "detailed"}
      data-mode={mode}
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
            h={logoSize}
            src={logoSrc}
            w={logoSize}
          />
          <Text
            aria-label={`${applicationName} ${t("sidebar.version", { version: displayVersion })}`}
            c="dimmed"
            data-testid="app-sidebar-version"
            fw={600}
            lineClamp={1}
            size="xs"
            ta="center"
          >
            {displayVersion}
          </Text>
          {mode === "detailed" ? (
            <ActionIcon
              aria-label={
                collapsed ? t("sidebar.expand") : t("sidebar.collapse")
              }
              data-testid="app-sidebar-collapse-toggle"
              onClick={() => {
                const nextCollapsed = !collapsed;
                setDetailedCollapsed(nextCollapsed);
                persistDetailedSidebarCollapsed(nextCollapsed);
              }}
              variant="subtle"
            >
              {collapsed ? (
                <IconChevronRight aria-hidden="true" size={18} stroke={1.75} />
              ) : (
                <IconChevronLeft aria-hidden="true" size={18} stroke={1.75} />
              )}
            </ActionIcon>
          ) : null}
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
                collapsed={collapsed}
                icon={item.icon}
                id={item.id}
                key={item.id}
                label={item.label}
                mode={mode}
                onClick={() => onNavigate(item.to)}
              />
            ))}
          </Stack>
        </ScrollArea>

        <Divider />

        <Stack data-testid="fixed-bottom-navigation" gap={4}>
          {supportNavigationItems.map((item) => {
            const label = t(item.labelKey);
            return (
              <SidebarNavigationItem
                active={activePath === item.to}
                collapsed={collapsed}
                icon={FIXED_NAVIGATION_ICONS[item.id]}
                id={item.id}
                key={item.id}
                label={label}
                mode={mode}
                onClick={() => onNavigate(item.to)}
              />
            );
          })}
        </Stack>
      </Stack>
    </Box>
  );
}
