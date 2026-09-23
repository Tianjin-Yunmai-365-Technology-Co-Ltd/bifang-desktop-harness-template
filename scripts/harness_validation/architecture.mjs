import fs from "node:fs";
import path from "node:path";

import { loadCargoMetadata, validateMetadata } from "../../.agents/skills/desktop-implement-change/scripts/check_core_first.mjs";
import { ROOT, SKILLS_ROOT, fail, readText, relativePath } from "./core.mjs";

const RUST_ASSET = path.join(SKILLS_ROOT, "desktop-initialize-rust-project", "assets", "rust-lib-cli");
const IMPLEMENT_CHANGE = path.join(SKILLS_ROOT, "desktop-implement-change", "scripts");
const MANTINE_ROOT = path.join(SKILLS_ROOT, "mantine-list-view");

function requirement(relative, fragments) {
  return [path.join(ROOT, relative), fragments];
}

/** 返回规则、Skills、提示与可执行检查器的稳定 core-first 片段矩阵。 */
export function coreFirstRequirements() {
  return new Map([
    requirement("docs/ENGINEERING_RULES.md", [
      "Core-first 是硬规则",
      "薄层按职责判断",
      "系统托盘",
      "适配器操作 → core 用例 API → core 测试",
      "workspace 可达闭包",
      "业务逻辑是否真正位于 core",
      "未命中 `$mantine-list-view` 的普通 GUI 页面",
      "业务行和总数只由 TanStack Query",
    ]),
    requirement("docs/RUST_CLI_TEMPLATE.md", [
      "Core-first 是四类接口共同的硬规则",
      "当前只有一个适配器",
      "违反宿主能力约束",
      "workspace 依赖路径",
      "scripts/check_core_first.mjs",
      "cargo metadata --no-deps --locked --format-version 1",
      "命中 `$mantine-list-view` 的列表页是封闭例外",
      "逐列表 schemaVersion 只保存在 payload",
    ]),
    requirement("README.md", [
      "Core-first 是强制规则",
      "系统托盘",
      "值域、跨字段关系",
      "node scripts/run_harness_tests.mjs",
    ]),
    [latestProductSpec(), ["Core-first 是强制架构约束", "当前只有一个接口", "系统托盘", "宿主能力约束"]],
    requirement(".agents/skills/desktop-define-product/SKILL.md", ["接口/宿主无关的业务结果", "业务效果仍委托 core"]),
    requirement(".agents/skills/desktop-plan-change/SKILL.md", ["对业务行为保持 core-first", "接口/宿主专属改动须记录其专属性理由"]),
    requirement(".agents/skills/desktop-implement-change/SKILL.md", ["Core-first 是硬规则", "适配器操作 → core API → core 测试", "违反宿主能力约束", "不得自动追加格式化、lint、静态"]),
    requirement(".agents/skills/desktop-initialize-rust-project/SKILL.md", ["Core-first 是永久硬规则", "adapter-only", "值域、跨字段关系", "必须保留 `$desktop-implement-change` 及其", "不得在日常开发中自动运行这些全仓门禁"]),
    requirement(".agents/skills/desktop-add-cli-adapter/SKILL.md", ["CLI 命令 → core API → core 测试", "当前只有 CLI"]),
    requirement(".agents/skills/desktop-add-tui-adapter/SKILL.md", ["TUI 消息 → core API → core 测试", "纯交互状态"]),
    requirement(".agents/skills/desktop-add-mcp-adapter/SKILL.md", ["MCP 工具 → core API → core 测试", "格式正确但业务无效"]),
    requirement(".agents/skills/desktop-add-gui-adapter/SKILL.md", ["GUI 事件/命令 → core API → core 测试", "平台机制本身无需 core-first 例外 ADR", "列表页及已有列表审查必须调用 `$mantine-list-view`"]),
    requirement(".agents/skills/desktop-prepare-gui-support-surfaces/SKILL.md", ["领域校验、跨接口可复用的资格判断", "进入 shared core", "属于 GUI adapter", "列表页改由 `$mantine-list-view` 约束"]),
    requirement(".agents/skills/desktop-add-tui-adapter/references/tui-baseline.md", ["纯界面应用状态", "当前只有 TUI"]),
    requirement(".agents/skills/desktop-add-mcp-adapter/references/mcp-baseline.md", ["格式正确但值域", "MCP 工具 → core API → core 测试"]),
    requirement(".agents/skills/desktop-add-gui-adapter/references/gui-baseline.md", ["系统托盘", "GUI 事件/命令 → core API → core 测试"]),
    requirement(".agents/skills/desktop-add-gui-adapter/references/react-frontend-baseline.md", ["不得编排多个命令来决定业务结果"]),
    [path.join(MANTINE_ROOT, "SKILL.md"), ["即使用户未写“表格”", "stickyHeaderOffset={GLOBAL_OFFSET}", "background-color: var(--mantine-color-body)", "asc → desc → none", "[10, 20, 50, 100]", "浅/深/浅/深", "必须显式设置 `required: true`", "placeholder 旧行是只读展示", "@mantine/core >=9.6.1 <10", "@tanstack/react-query >=5.102.8 <6", "@dnd-kit/core", "Required"]],
    requirement("docs/design_standards/mantine_list_view.md", ["standard_id = mantine-list-view-v2", "canonical URL 在首次查询前以一次 `replace` 写回", "服务端默认排序必须确定", "浅色主题：浅行为", "placeholder 旧行只能只读显示", "不透明语义背景", "分页使用 responsive layout", "@dnd-kit/sortable"]),
    [path.join(MANTINE_ROOT, "references", "offset-list-pattern.md"), ["resolveInitialListLocation", "mergeOwnedListSearch", "previousQuery.queryKey.slice(0, -1)", 'refetchOnMount: "always"', "服务端必须声明确定的默认顺序", "placeholder 行必须 `inert`", "data-row-tone", "ColumnPreferences"]],
    [path.join(MANTINE_ROOT, "references", "mantine-api.md"), ["@mantine/core >=9.6.1 <10", "@tanstack/react-query >=5.102.8 <6", "Table.ScrollContainer", 'layout="responsive"', "withEdges", "getControlProps", "placeholderData` 只在新 key pending 时提供旧值"]],
    [path.join(MANTINE_ROOT, "references", "checklist.md"), ["Required：数据与状态契约", "Conditional：选择和业务动作", "浅/深/浅/深交替", "placeholder 行 inert", "服务端对同值追加稳定业务 id tie-breaker", "N/A（理由 + 证据）"]],
    [path.join(MANTINE_ROOT, "assets", "ListPage.template.tsx"), ["stickyHeaderOffset={LIST_STICKY_HEADER_OFFSET}", "className={styles.tableHeader}", 'from "@tabler/icons-react"', "placeholderData:", "lastSortCorrection", 'data-row-tone={rowIndex % 2 === 0 ? "light" : "deep"}', "inert={query.isPlaceholderData || undefined}", 'scope="row"', 'role="region"', 'layout="responsive"', "withEdges", "getControlProps", "VisuallyHidden", "claimListCorrection", "backgroundErrorPresentation"]],
    [path.join(MANTINE_ROOT, "assets", "listPageState.ts"), ["PAGE_SIZES = [10, 20, 50, 100] as const", "Number.isSafeInteger", "resolveInitialListLocation", "mergeOwnedListSearch", "buildColumnPreferencesKey", "getBrowserListStorage", "schemaVersion 只属于 payload", "requires unique column ids", "exactly one primary business column", "page items exceed the remaining total", "validateBusinessIds", "pruneCurrentPageSelection", "claimListCorrection", "releaseListCorrection", "getEffectiveCurrentPageSelection", "buildListPageAnnouncement"]],
    [path.join(MANTINE_ROOT, "assets", "listPageTypes.ts"), ["responsiveRole 用于失败关闭窄屏关键内容丢失", "businessIdType", "getRowAccessibleName", "renderSelectionActions", "getErrorPresentation", "resultSummary"]],
    [path.join(MANTINE_ROOT, "assets", "ListColumnSettings.tsx"), ["KeyboardSensor", "onDragStart:", "onDragCancel:", "moveColumnLeft(props.label)", "moveColumnRight(props.label)", 'mah="60vh"', 'size="compact-sm"']],
    [path.join(MANTINE_ROOT, "assets", "ListPage.module.css"), [".tableHeader th", "background-color: var(--mantine-color-body)", 'data-row-tone="light"', 'data-row-tone="deep"', ".dataRow:hover", ".dataRow:focus-within", "--mantine-color-gray-3", "--mantine-color-dark-4", "forced-colors: active"]],
    [path.join(MANTINE_ROOT, "assets", "ListPage.module.css.d.ts"), ["readonly tableHeader: string", "readonly dataRow: string"]],
    [path.join(MANTINE_ROOT, "assets", "ListPage.contracts.test.ts"), ["resolveInitialListLocation", "mergeOwnedListSearch", "validatePageResponse", "validateBusinessIds", "pruneCurrentPageSelection", "claimListCorrection", "getEffectiveCurrentPageSelection", "mantine-list-view executable contracts passed"]],
    [path.join(IMPLEMENT_CHANGE, "check_core_first.mjs"), ["cargo metadata", "ADAPTER_SUFFIXES", "INTERFACE_CRATE_NAMES", "reachablePaths"]],
    [path.join(IMPLEMENT_CHANGE, "check_core_first.test.mjs"), ["rejects core reverse dependency in any scope", "rejects adapter-to-adapter dependency", "rejects registry crate with same name as workspace core", "rejects transitive interface framework from core", "rejects transitive adapter-to-adapter dependency", "CLI returns two for JSON and Cargo tool failures"]],
    requirement(".agents/skills/desktop-initialize-rust-project/agents/openai.yaml", ["core-first", "薄 adapter"]),
    requirement(".agents/skills/desktop-add-cli-adapter/agents/openai.yaml", ["薄适配器"]),
    requirement(".agents/skills/desktop-add-tui-adapter/agents/openai.yaml", ["薄适配器"]),
    requirement(".agents/skills/desktop-add-mcp-adapter/agents/openai.yaml", ["薄适配器"]),
    requirement(".agents/skills/desktop-add-gui-adapter/agents/openai.yaml", ["薄适配器", "业务效果回到 core"]),
  ]);
}

function latestProductSpec() {
  const directory = path.join(ROOT, "docs", "product_spec");
  const name = fs.readdirSync(directory).filter((entry) => /^\d{8}_product_spec\.md$/u.test(entry)).sort().at(-1);
  return name ? path.join(directory, name) : path.join(directory, "__missing_latest__.md");
}

/** 校验 core-first 文本事实与真实中性 Cargo metadata 依赖图。 */
export function validateCoreFirstContract(errors, requirements = coreFirstRequirements()) {
  for (const [filePath, fragments] of requirements) {
    if (!fs.existsSync(filePath)) {
      fail(errors, `missing core-first contract file: ${relativePath(filePath)}`);
      continue;
    }
    const text = readText(filePath);
    for (const fragment of fragments) {
      if (!text.includes(fragment)) fail(errors, `core-first contract missing in ${relativePath(filePath)}: ${fragment}`);
    }
  }
  try {
    const metadata = loadCargoMetadata(RUST_ASSET, { timeoutSeconds: 60 });
    for (const error of validateMetadata(metadata)) fail(errors, `core-first Rust asset: ${error}`);
  } catch (error) {
    fail(errors, `cannot validate core-first Rust asset: ${error.message}`);
  }
}
