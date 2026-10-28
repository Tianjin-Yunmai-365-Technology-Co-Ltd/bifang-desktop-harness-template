import assert from "node:assert/strict";
import test from "node:test";

import { APP_LAYOUT_TOKENS, resolveAppThemeTokens } from "../assets/brand-support/react/appDesignTokens.ts";

/** 独立主题夹具只提供色板事实，无需前端运行环境或全局第三方依赖。 */
function theme(primaryColor) {
  return {
    primaryColor,
    white: "#ffffff",
    colors: Object.fromEntries(["blue", "teal", "green", "gray", "dark"].map((name) => [
      name, Array.from({ length: 10 }, (_, index) => `${name}-${index}`),
    ])),
  };
}

/** 修改一次主色同时影响强调和表格选中，普通 surface 不随业务组件各自改色。 */
test("primary_color_updates_all_accent_consumers", () => {
  const before = resolveAppThemeTokens(theme("blue"));
  const after = resolveAppThemeTokens(theme("teal"));
  for (const mode of ["light", "dark"]) {
    for (const key of ["--app-accent", "--app-table-row-selected"]) {
      assert.notEqual(before[mode][key], after[mode][key]);
      assert.match(after[mode][key], /^teal-/u);
    }
    assert.equal(before[mode]["--app-surface"], after[mode]["--app-surface"]);
  }
});

/** 缺失主色色板时给出明确配置错误，避免读取未定义值或静默切回其他主色。 */
test("missing_primary_palette_reports_configuration_error", () => {
  assert.throws(() => resolveAppThemeTokens(theme("missing")), /应用主题缺少主色色板：missing/u);
});

/** 两态提供同一组非空语义 Token，暗色不会依赖页面再覆盖浅色。 */
test("light_and_dark_provide_complete_semantic_token_sets", () => {
  const result = resolveAppThemeTokens(theme("blue"));
  assert.deepEqual(Object.keys(result.light).sort(), Object.keys(result.dark).sort());
  for (const key of ["--app-surface", "--app-surface-muted", "--app-table-row", "--app-table-row-alternate", "--app-table-row-hover", "--app-sponsor-overlay"]) {
    assert.ok(result.light[key]);
    assert.ok(result.dark[key]);
    assert.notEqual(result.light[key], result.dark[key]);
  }
});

/** 侧栏尺寸随统一节奏生成，持续可见文字和交互目标保留可读下界。 */
test("sidebar_layout_uses_shared_grid_and_readable_targets", () => {
  const sidebar = APP_LAYOUT_TOKENS.sidebar;
  for (const size of [sidebar.compactPadding, sidebar.sectionGap, sidebar.navIconSize, sidebar.collapseIconSize, sidebar.menuGap, ...Object.values(sidebar.widths), ...Object.values(sidebar.logoSizes)]) {
    assert.equal(size % 4, 0);
  }
  assert.ok(sidebar.labelFontSize >= 12);
  assert.ok(sidebar.detailedItemMinHeight >= 24);
  assert.ok(sidebar.compactItemMinHeight >= 24);
});
