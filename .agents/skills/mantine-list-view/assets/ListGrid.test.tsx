import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ListPage } from "./ListPage.template";
import { ListTextCell } from "./ListTextCell";
import type { ListPageMessages, ListPageProps } from "./listPageTypes";

/** 中性网格夹具只有稳定 ID 与名称，不携带产品数据。 */
type Row = { id: string; name: string };
/** 测试列表的最小类型化查询和列模型。 */
type Props = ListPageProps<Row, string, "name" | "secondary", "name", { q: string }>;
const rows: Row[] = [{ id: "a", name: "Alpha 中文" }, { id: "b", name: "Beta 中文" }];
const messages: ListPageMessages = {
  caption: "Records", scrollRegion: "Record grid", loading: "Loading records", correctingLocation: "Correcting page",
  noResults: "No matching records", noData: "No records", retry: "Retry", refreshing: "Refreshing records", resetFilters: "Reset filters",
  pageSize: "Page size", pageSizeOption: String, resultSummary: (a, b, n) => `${a}–${b} of ${n}`,
  pagination: "Record pages", page: (n) => `Page ${n}`, pageOf: (n, total) => `${n} / ${total}`,
  firstPage: "First page", previousPage: "Previous page", nextPage: "Next page", lastPage: "Last page",
  sortAscending: (c) => `Sort ${c} ascending`, sortDescending: (c) => `Sort ${c} descending`, clearSort: (c) => `Clear ${c} sort`,
  activeSort: (c, d) => `${c} ${d}`, selectCurrentPage: "Select current page", selectionColumn: "Selection",
  viewRowDetails: (name) => `Details for ${name}`,
  selectionPending: "Confirming query selection", selectRow: (name) => `Select ${name}`, clearSelection: "Clear selection",
  selectionSummary: (mode, count) => `${mode}: ${count} selected`, columns: "Columns", resetColumns: "Reset columns",
  dragColumn: (c) => `Drag ${c}`, dragInstructions: "Move columns with arrow keys", dragStarted: (c) => `Moving ${c}`,
  dragCancelled: (c) => `Cancelled ${c}`, moveColumnLeft: (c) => `Move ${c} left`, moveColumnRight: (c) => `Move ${c} right`,
  columnPosition: (c, n, total) => `${c} ${n} of ${total}`,
};

/** 构造真实 Query 与列设置控件可使用的完整中性依赖。 */
function makeProps(overrides: Partial<Props> = {}): Props {
  return {
    appNamespace: "grid-test", listId: "records", cacheScope: "local", columnPreferenceScope: "device", columnSchemaVersion: 1,
    businessIdType: "string", state: { page: 1, pageSize: 20, sort: null, filters: { q: "" } },
    codec: {
      ownedKeys: ["q", "page", "pageSize", "sort"], defaults: { sort: null, filters: { q: "" } },
      parseUnknown: () => ({}), normalizeFilters: ({ q }) => ({ q: q.trim() }),
      serialize: (state) => ({ q: state.filters.q, page: String(state.page), pageSize: String(state.pageSize), sort: state.sort?.direction }),
    },
    navigation: { navigate: vi.fn() },
    columns: [{ id: "name", accessibleName: "Name", header: "Name", required: true, responsiveRole: "primary", sortField: "name", renderCell: (row) => row.name }],
    selection: { mode: "none" }, getRowId: (row) => row.id, getRowAccessibleName: (row) => row.name,
    fetchPage: vi.fn(async () => ({ items: rows, totalItems: rows.length })),
    renderFilters: ({ filters, apply }) => <button onClick={() => apply(filters)}>Apply unchanged filters</button>,
    hasActiveFilters: ({ q }) => q.length > 0, getFilterSummary: ({ q }) => `Search: ${q}`,
    renderSelectionActions: ({ disabled }) => <button disabled={disabled}>Use selection</button>,
    getErrorPresentation: () => ({ title: "Update failed", retryable: false }), messages, staleTimeMs: 60_000,
    ...overrides,
  };
}

/** 用真实 Provider 渲染；测试自行控制数据完成时机而不依赖真实网络。 */
function renderGrid(props: Props, controlledSelection?: "single" | "multiple") {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  /** 模拟调用者的受控 ID 集合，验证真实用户操作后的语义状态。 */
  function ControlledGrid() {
    const [selectedIds, onChange] = useState<ReadonlySet<string>>(new Set());
    return <ListPage {...props} selection={controlledSelection ? { mode: "current-page", cardinality: controlledSelection, selectedIds, onChange } : props.selection} />;
  }
  const view = render(<MantineProvider env="test"><QueryClientProvider client={client}><ControlledGrid /></QueryClientProvider></MantineProvider>);
  return { ...view, client };
}

/** 浏览器存储替身与真实用户数据隔离，也兼容未开放宿主存储的 jsdom。 */
function createTestStorage(): Storage {
  const values = new Map<string, string>();
  return {
    /** 返回当前测试存储中的条目数。 */
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

/** jsdom 没有真实布局，观察器只提供组件要求的生命周期接口。 */
class TestResizeObserver implements ResizeObserver {
  /** 接受观察请求，不模拟真实尺寸。 */
  observe(): void {}
  /** 停止指定观察请求，无宿主资源需要回收。 */
  unobserve(): void {}
  /** 结束测试观察器生命周期。 */
  disconnect(): void {}
}

beforeEach(() => {
  Object.defineProperty(window, "localStorage", { configurable: true, value: createTestStorage() });
  Object.defineProperty(window, "sessionStorage", { configurable: true, value: createTestStorage() });
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("neutral grid interactions", () => {
  /** 验证多选半选、页内全选、清空以及父行不代理选择。 */
  it("multiple_selection_preserves_native_controls_and_page_scope", async () => {
    renderGrid(makeProps(), "multiple");
    const second = await screen.findByRole("checkbox", { name: "Select Beta 中文" });
    // 通过实际控件建立半选，再确认父行不会代理控件动作。
    fireEvent.click(second);
    const page = screen.getByRole("checkbox", { name: "Select current page" });
    expect(page).toBePartiallyChecked();
    fireEvent.click(screen.getByRole("rowheader", { name: "Alpha 中文" }));
    expect(screen.getByRole("checkbox", { name: "Select Alpha 中文" })).not.toBeChecked();
    fireEvent.click(page);
    expect(page).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(page).not.toBeChecked();
    expect(second).not.toBeChecked();
  });

  /** 单选使用 Radio 且不产生全选入口，选择第二项替换第一项。 */
  it("single_selection_replaces_previous_id_without_select_all", async () => {
    renderGrid(makeProps(), "single");
    const second = await screen.findByRole("radio", { name: "Select Beta 中文" });
    expect(screen.queryByRole("checkbox", { name: "Select current page" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Select Alpha 中文" }));
    fireEvent.click(second);
    expect(second).toBeChecked();
    expect(screen.getByRole("radio", { name: "Select Alpha 中文" })).not.toBeChecked();
    expect(screen.getByText("current-page: 1 selected")).toBeVisible();
  });

  /** 跨页查询未确认时，旧 ID 和批量动作在首帧即失效且只请求一次确认。 */
  it("cross_page_selection_is_blocked_until_query_confirmation", async () => {
    const confirm = vi.fn();
    renderGrid(makeProps({ selection: { mode: "cross-page", cardinality: "multiple", queryFingerprint: "old-query", selectedIds: new Set(["a"]), onChange: vi.fn(), onQueryFingerprintChange: confirm } }));
    expect(await screen.findByRole("checkbox", { name: "Select Alpha 中文" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Use selection" })).toBeDisabled();
    expect(screen.getByText("Confirming query selection")).toBeVisible();
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  /** 相同条件不导航，刷新失败仍保留可见数据，终态错误不自动重试。 */
  it("unchanged_filters_do_not_navigate_and_background_error_retains_rows", async () => {
    const props = makeProps();
    const fetchPage = vi.fn().mockResolvedValueOnce({ items: rows, totalItems: 2 }).mockRejectedValue(new Error("terminal failure"));
    const { client } = renderGrid({ ...props, fetchPage });
    await screen.findByRole("rowheader", { name: "Alpha 中文" });
    fireEvent.click(screen.getByRole("button", { name: "Apply unchanged filters" }));
    expect(props.navigation.navigate).not.toHaveBeenCalled();
    await act(async () => { await client.invalidateQueries(); });
    expect(await screen.findByRole("alert")).toHaveTextContent("Update failed");
    expect(screen.getByRole("rowheader", { name: "Alpha 中文" })).toBeVisible();
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  /** 在后续页重复应用同条件保持当前位置，真实条件变化才重置首页。 */
  it("unchanged_filters_preserve_later_page_and_changes_reset_atomically", async () => {
    const defaults = makeProps();
    const props = makeProps({
      state: { ...defaults.state, page: 2 },
      fetchPage: vi.fn(async () => ({ items: rows, totalItems: 22 })),
      renderFilters: ({ filters, apply }) => <><button onClick={() => apply(filters)}>Apply unchanged filters</button><button onClick={() => apply({ q: "new" })}>Apply new filters</button></>,
    });
    renderGrid(props);
    await screen.findByRole("rowheader", { name: "Alpha 中文" });
    fireEvent.click(screen.getByRole("button", { name: "Apply unchanged filters" }));
    expect(props.navigation.navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Apply new filters" }));
    expect(props.navigation.navigate).toHaveBeenCalledExactlyOnceWith({ ...props.state, page: 1, filters: { q: "new" } }, { replace: false });
  });

  /** 可重试错误自动重试有界，重复点击手动恢复不会再发起请求。 */
  it("retry_deduplicates_rapid_clicks_and_keeps_existing_rows", async () => {
    let complete: ((value: { items: Row[]; totalItems: number }) => void) | undefined;
    const fetchPage = vi.fn().mockResolvedValueOnce({ items: rows, totalItems: 2 });
    fetchPage.mockRejectedValueOnce(new Error("temporary")).mockRejectedValueOnce(new Error("temporary")).mockRejectedValueOnce(new Error("temporary"));
    fetchPage.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    const { client } = renderGrid(makeProps({ fetchPage, getErrorPresentation: () => ({ title: "Update failed", retryable: true }) }));
    await screen.findByRole("rowheader", { name: "Alpha 中文" });
    await act(async () => { await client.invalidateQueries(); });
    const retry = await screen.findByRole("button", { name: "Retry" });
    fireEvent.click(retry);
    fireEvent.click(retry);
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(5));
    expect(retry).toBeDisabled();
    expect(screen.getByRole("rowheader", { name: "Alpha 中文" })).toBeVisible();
    await act(async () => { complete?.({ items: rows, totalItems: 2 }); });
  });

  /** 次要列响应式隐藏时仍能通过行详情取得完整信息。 */
  it("responsive_hidden_fields_remain_available_in_row_details", async () => {
    const props = makeProps();
    renderGrid({ ...props, columns: [...props.columns, { id: "secondary", accessibleName: "Identifier", header: "Identifier", responsiveRole: "secondary", hideBelow: "sm", renderCell: (row) => row.id }], renderRowDetails: (row) => <p>Identifier: {row.id}</p> });
    const details = await screen.findByRole("button", { name: "Details for Alpha 中文" });
    fireEvent.click(details);
    expect(within(await screen.findByRole("dialog")).getByText("Identifier: a")).toBeVisible();
  });

  /** 完整值通过键盘打开和关闭，焦点回到原触发器。 */
  it("truncated_value_has_keyboard_accessible_full_text", async () => {
    const user = userEvent.setup();
    render(<MantineProvider env="test"><ListTextCell value="完整中文 value with long content" truncate fullValueLabel="View full name" /></MantineProvider>);
    const trigger = screen.getByRole("button", { name: "完整中文 value with long content" });
    expect(trigger).toHaveAccessibleDescription("View full name");
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(within(await screen.findByRole("dialog")).getByText("完整中文 value with long content")).toBeVisible();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
