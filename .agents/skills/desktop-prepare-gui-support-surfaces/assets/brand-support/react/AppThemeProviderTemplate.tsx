import {
  Box,
  MantineProvider,
  createTheme,
  localStorageColorSchemeManager,
  useComputedColorScheme,
} from "@mantine/core";
import type { ReactElement, ReactNode } from "react";

import { resolveAppThemeTokens } from "./appDesignTokens";

/** 设置页支持的主题偏好；auto 表示跟随系统。 */
export type AppColorScheme = "light" | "dark" | "auto";

/** 主题偏好只保存在当前设备，不进入共享 core。 */
export const APP_COLOR_SCHEME_STORAGE_KEY = "application-color-scheme";

/** GUI 初始化统一使用这一份 Mantine 主题定义。 */
export const APP_THEME = createTheme({
  defaultRadius: "md",
  primaryColor: "blue",
  spacing: { xs: "0.25rem", sm: "0.5rem", md: "1rem", lg: "1.5rem", xl: "2rem" },
});

/** 亮色和暗色分别声明页面背景、表面、文字、边框与强调色。 */
export const APP_THEME_CSS_VARIABLES = resolveAppThemeTokens;

const appColorSchemeManager = localStorageColorSchemeManager({
  key: APP_COLOR_SCHEME_STORAGE_KEY,
});

/** 把运行时解析后的主题应用到整个应用背景和默认文字。 */
function AppThemeSurface({ children }: { children: ReactNode }): ReactElement {
  const colorScheme = useComputedColorScheme("light");

  return (
    <Box
      data-color-scheme={colorScheme}
      data-testid="app-theme-surface"
      mih="100dvh"
      style={{
        backgroundColor: "var(--app-background)",
        color: "var(--app-text)",
      }}
    >
      {children}
    </Box>
  );
}

/** 应用根 Provider 默认跟随系统，并允许设置页切换为固定亮色或暗色。 */
export function AppThemeProviderTemplate({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return (
    <MantineProvider
      colorSchemeManager={appColorSchemeManager}
      cssVariablesResolver={APP_THEME_CSS_VARIABLES}
      defaultColorScheme="auto"
      theme={APP_THEME}
    >
      <AppThemeSurface>{children}</AppThemeSurface>
    </MantineProvider>
  );
}
