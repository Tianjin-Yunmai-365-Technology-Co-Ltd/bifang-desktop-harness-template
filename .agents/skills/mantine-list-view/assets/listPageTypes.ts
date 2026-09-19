import type { ReactNode } from "react";
import type { ListColumnSettingsMessages } from "./ListColumnSettings";
import type {
  BusinessId,
  ColumnPreferencesMigration,
  ListColumnContract,
  ListPageResponse,
  ListQueryState,
  ListStateCodec,
  PageSize,
  SortDirection,
} from "./listPageState";

/** 单元格渲染时可依赖的交互状态。 */
export interface ListCellRenderContext {
  interactive: boolean;
}

/** 列表展示列；responsiveRole 用于失败关闭窄屏关键内容丢失。 */
export interface ListColumn<
  TRow,
  TColumnId extends string,
  TSortField extends string,
> extends ListColumnContract<TColumnId, TSortField> {
  header: ReactNode;
  renderCell: (row: TRow, context: ListCellRenderContext) => ReactNode;
}

/** 列表选择策略；选中状态只保存稳定业务 id。 */
export type ListSelection<TId extends BusinessId> =
  | { mode: "none" }
  | {
      mode: "current-page";
      selectedIds: ReadonlySet<TId>;
      onChange: (ids: ReadonlySet<TId>) => void;
    }
  | {
      mode: "cross-page";
      selectedIds: ReadonlySet<TId>;
      onChange: (ids: ReadonlySet<TId>) => void;
      onQueryFingerprintChange: (nextFingerprint: string) => void;
    };

/** 列表错误的用户可见分型；终态错误不显示无意义的重试。 */
export interface ListErrorPresentation {
  title: string;
  description?: ReactNode;
  retryable: boolean;
}

/** 列表全部可见文案和可访问名称的 i18n 契约。 */
export interface ListPageMessages extends ListColumnSettingsMessages {
  caption: string;
  scrollRegion: string;
  loading: string;
  correctingLocation: string;
  noResults: string;
  noData: string;
  retry: string;
  refreshing: string;
  resetFilters: string;
  pageSize: string;
  pageSizeOption: (size: PageSize) => string;
  resultSummary: (start: number, end: number, total: number) => string;
  pagination: string;
  page: (page: number) => string;
  pageOf: (page: number, totalPages: number) => string;
  firstPage: string;
  previousPage: string;
  nextPage: string;
  lastPage: string;
  sortAscending: (column: string) => string;
  sortDescending: (column: string) => string;
  clearSort: (column: string) => string;
  activeSort: (column: string, direction: SortDirection) => string;
  selectCurrentPage: string;
  selectRow: (rowName: string) => string;
  clearSelection: string;
  selectionSummary: (
    mode: "current-page" | "cross-page",
    count: number,
  ) => string;
}

/** 由类型化路由实现的列表导航边界。 */
export interface ListNavigation<TSortField extends string, TFilters> {
  navigate(
    next: ListQueryState<TSortField, TFilters>,
    options: { replace: boolean },
  ): void;
}

/** 中性列表页模板的依赖与业务适配入口。 */
export interface ListPageProps<
  TRow,
  TId extends BusinessId,
  TColumnId extends string,
  TSortField extends string,
  TFilters,
> {
  appNamespace: string;
  listId: string;
  cacheScope: string;
  columnPreferenceScope: string;
  columnSchemaVersion: number;
  columnPreferenceLegacyKeys?: readonly string[];
  migrateColumnPreferences?: ColumnPreferencesMigration<TColumnId, TSortField>;
  /** 一个列表的规范业务 id 类型；所有页和选择状态必须一致。 */
  businessIdType: "string" | "number";
  state: ListQueryState<TSortField, TFilters>;
  codec: ListStateCodec<TSortField, TFilters>;
  navigation: ListNavigation<TSortField, TFilters>;
  columns: readonly ListColumn<TRow, TColumnId, TSortField>[];
  selection: ListSelection<TId>;
  getRowId: (row: TRow) => TId;
  getRowAccessibleName: (row: TRow) => string;
  fetchPage: (
    request: ListQueryState<TSortField, TFilters>,
    signal: AbortSignal,
  ) => Promise<ListPageResponse<TRow>>;
  renderFilters: (input: {
    filters: TFilters;
    apply: (filters: TFilters) => void;
    reset: () => void;
  }) => ReactNode;
  hasActiveFilters: (filters: TFilters) => boolean;
  renderNoDataAction?: () => ReactNode;
  renderSelectionActions?: (input: {
    selectedIds: ReadonlySet<TId>;
    disabled: boolean;
    clear: () => void;
  }) => ReactNode;
  getErrorPresentation: (
    error: Error,
    context: { background: boolean },
  ) => ListErrorPresentation;
  messages: ListPageMessages;
  tableMinWidth: number;
}
