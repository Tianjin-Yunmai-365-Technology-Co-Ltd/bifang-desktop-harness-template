import {
  Alert, Button, Checkbox, Group, Pagination, Popover,
  Select, Skeleton, Stack, Table, Text, UnstyledButton,
} from "@mantine/core";
import {
  closestCenter, DndContext, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, verticalListSortingStrategy, sortableKeyboardCoordinates,
  SortableContext, useSortable,
} from "@dnd-kit/sortable";
import { IconArrowLeft, IconArrowRight, IconGripVertical } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import {
  useCallback, useEffect, useMemo, useRef, useState,
  type CSSProperties, type ReactNode,
} from "react";
// 替换为项目实际的共享 AppShell 布局常量；禁止在列表页声明 offset 字面量。
import { LIST_STICKY_HEADER_OFFSET } from "@/layout/constants";
export const PAGE_SIZES = [10, 20, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 20 satisfies PageSize;
const LIST_STATE_SCHEMA_VERSION = 1;
const SKELETON_ROW_IDS = Array.from({ length: 100 }, (_, slot) => `list-skeleton-row-${slot + 1}`);
const WRAPPING_BUTTON_STYLES = { label: { whiteSpace: "normal", overflowWrap: "anywhere" } } as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export type SortDirection = "asc" | "desc";
export type BusinessId = string | number;
export type SortState<TSortField extends string> = { field: TSortField; direction: SortDirection } | null;
export interface ListQueryState<TSortField extends string, TFilters> {
  page: number;
  pageSize: PageSize;
  sort: SortState<TSortField>;
  filters: TFilters;
}
export interface ListPageResponse<TRow> { items: readonly TRow[]; totalItems: number; }
export interface ListStateCodec<TSortField extends string, TFilters> {
  ownedKeys: readonly string[];
  defaults: Pick<ListQueryState<TSortField, TFilters>, "sort" | "filters"> & { pageSize?: PageSize };
  parseUnknown(value: unknown): Partial<ListQueryState<TSortField, TFilters>>;
  serialize(value: ListQueryState<TSortField, TFilters>): Readonly<Record<string, string | undefined>>;
  normalizeFilters(value: TFilters): TFilters;
}
export interface ListColumn<TRow, TColumnId extends string, TSortField extends string> {
  id: TColumnId;
  accessibleName: string;
  header: ReactNode;
  renderCell: (row: TRow) => ReactNode;
  sortField?: TSortField;
  required?: boolean;
  defaultVisible?: boolean;
  /** 窄于该 Mantine breakpoint 时隐藏；至少一个业务主列必须始终可见。 */
  hideBelow?: "xs" | "sm" | "md" | "lg" | "xl";
}
export interface ColumnPreferences<TColumnId extends string> {
  schemaVersion: number;
  order: readonly TColumnId[];
  hidden: readonly TColumnId[];
}
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
export interface ListPageMessages {
  caption: string;
  loading: string;
  correctingPage: string;
  empty: string;
  error: string;
  backgroundError: string;
  retry: string;
  refreshing: string;
  columns: string;
  resetColumns: string;
  resetFilters: string;
  pageSize: string;
  pageSizeOption: (size: PageSize) => string;
  sortAscending: (column: string) => string;
  sortDescending: (column: string) => string;
  clearSort: (column: string) => string;
  dragColumn: (column: string) => string;
  dragInstructions: string;
  dragStarted: (column: string) => string;
  dragCancelled: (column: string) => string;
  moveColumnLeft: (column: string) => string;
  moveColumnRight: (column: string) => string;
  selectCurrentPage: string;
  selectRow: (id: BusinessId) => string;
  selectionSummary: (mode: "current-page" | "cross-page", count: number) => string;
  columnPosition: (column: string, position: number, total: number) => string;
}
export interface ListNavigation<TSortField extends string, TFilters> {
  navigate(next: ListQueryState<TSortField, TFilters>, options: { replace: boolean }): void;
}
export interface ListPageProps<
  TRow, TId extends BusinessId, TColumnId extends string,
  TSortField extends string, TFilters
> {
  appNamespace: string;
  listId: string;
  cacheScope: string;
  columnPreferenceScope: string;
  columnSchemaVersion: number;
  state: ListQueryState<TSortField, TFilters>;
  codec: ListStateCodec<TSortField, TFilters>;
  navigation: ListNavigation<TSortField, TFilters>;
  columns: readonly ListColumn<TRow, TColumnId, TSortField>[];
  selection: ListSelection<TId>;
  getRowId: (row: TRow) => TId;
  fetchPage: (request: ListQueryState<TSortField, TFilters>, signal: AbortSignal) =>
    Promise<ListPageResponse<TRow>>;
  renderFilters: (input: {
    filters: TFilters;
    apply: (filters: TFilters) => void;
    reset: () => void;
  }) => ReactNode;
  messages: ListPageMessages;
  tableMinWidth: number;
}
export function parsePageSize(value: unknown): PageSize | undefined {
  const numeric = typeof value === "string" ? Number(value) : value;
  return PAGE_SIZES.find((size) => size === numeric);
}
export function parsePage(value: unknown): number | undefined {
  const numeric = typeof value === "string" ? Number(value) : value;
  return typeof numeric === "number" && Number.isInteger(numeric) && numeric >= 1
    ? numeric
    : undefined;
}
export function getCorrectedPage(page: number, totalPages: number): number | undefined {
  if (totalPages === 0) return page === 1 ? undefined : 1;
  return page > totalPages ? totalPages : undefined;
}
export function nextSort<TSortField extends string>(current: SortState<TSortField>, field: TSortField): SortState<TSortField> {
  if (current?.field !== field) return { field, direction: "asc" };
  if (current.direction === "asc") return { field, direction: "desc" };
  return null;
}
export function buildListSessionKey(appNamespace: string, listId: string, cacheScope: string): string {
  return `${appNamespace}:list-state:${encodeURIComponent(listId)}:${encodeURIComponent(cacheScope)}:v${LIST_STATE_SCHEMA_VERSION}`;
}
export function buildColumnPreferencesKey(
  appNamespace: string,
  listId: string,
  columnPreferenceScope: string,
  schemaVersion: number,
): string {
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new Error("columnSchemaVersion must be a positive integer");
  }
  return `${appNamespace}:list-columns:${encodeURIComponent(listId)}:${encodeURIComponent(columnPreferenceScope)}:v${schemaVersion}`;
}
export function hasOwnedUrlKey(rawUrlSearch: unknown, ownedKeys: readonly string[]): boolean {
  if (typeof rawUrlSearch !== "object" || rawUrlSearch === null) return false;
  return ownedKeys.some((key) => Object.prototype.hasOwnProperty.call(rawUrlSearch, key));
}
function normalizeListState<TSortField extends string, TFilters>(
  partial: Partial<ListQueryState<TSortField, TFilters>>,
  codec: ListStateCodec<TSortField, TFilters>,
): ListQueryState<TSortField, TFilters> {
  const filters = partial.filters ?? codec.defaults.filters;
  return {
    page: parsePage(partial.page) ?? 1,
    pageSize:
      parsePageSize(partial.pageSize) ?? codec.defaults.pageSize ?? DEFAULT_PAGE_SIZE,
    sort: partial.sort === undefined ? codec.defaults.sort : partial.sort,
    filters: codec.normalizeFilters(filters),
  };
}
function readListSessionState<TSortField extends string, TFilters>(
  key: string,
  codec: ListStateCodec<TSortField, TFilters>,
): Partial<ListQueryState<TSortField, TFilters>> | undefined {
  try {
    const serialized = window.sessionStorage.getItem(key);
    if (serialized === null) return undefined;
    const parsed: unknown = JSON.parse(serialized);
    return codec.parseUnknown(parsed);
  } catch {
    return undefined;
  }
}
export function resolveInitialListState<TSortField extends string, TFilters>(input: {
  rawUrlSearch: unknown;
  sessionKey: string;
  codec: ListStateCodec<TSortField, TFilters>;
}): ListQueryState<TSortField, TFilters> {
  const explicitUrl = hasOwnedUrlKey(input.rawUrlSearch, input.codec.ownedKeys);
  const partial = explicitUrl
    ? input.codec.parseUnknown(input.rawUrlSearch)
    : readListSessionState(input.sessionKey, input.codec) ?? {};
  return normalizeListState(partial, input.codec);
}
function writeListSessionState<TSortField extends string, TFilters>(
  key: string,
  state: ListQueryState<TSortField, TFilters>,
  codec: ListStateCodec<TSortField, TFilters>,
): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(codec.serialize(state)));
  } catch {
    // 存储不可用时仍允许列表工作；调用方可接入脱敏诊断日志。
  }
}
function defaultColumnPreferences<
  TRow, TColumnId extends string, TSortField extends string
>(
  columns: readonly ListColumn<TRow, TColumnId, TSortField>[],
  schemaVersion: number,
): ColumnPreferences<TColumnId> {
  if (columns.length === 0) throw new Error("ListPage requires at least one column");
  if (!columns.some((column) => column.required && column.hideBelow === undefined)) throw new Error("ListPage requires a required column that remains visible on narrow screens");
  const sortFields = columns.map((column) => column.sortField).filter((field) => field !== undefined);
  if (new Set(sortFields).size !== sortFields.length) throw new Error("ListPage requires each sort field to belong to exactly one column");
  const hidden = columns
    .filter((column) => column.defaultVisible === false && !column.required)
    .map((column) => column.id);
  if (hidden.length === columns.length) hidden.shift();
  return {
    schemaVersion,
    order: columns.map((column) => column.id),
    hidden,
  };
}
export function reconcileColumnPreferences<
  TRow, TColumnId extends string, TSortField extends string
>(
  raw: unknown,
  columns: readonly ListColumn<TRow, TColumnId, TSortField>[],
  schemaVersion: number,
): ColumnPreferences<TColumnId> {
  const defaults = defaultColumnPreferences(columns, schemaVersion);
  if (typeof raw !== "object" || raw === null) return defaults;
  const candidate = raw as {
    schemaVersion?: unknown;
    order?: unknown;
    hidden?: unknown;
  };
  if (candidate.schemaVersion !== schemaVersion) return defaults;
  const knownIds = new Set<string>(columns.map((column) => column.id));
  const requiredIds = new Set<string>(
    columns.filter((column) => column.required).map((column) => column.id),
  );
  const order = Array.isArray(candidate.order)
    ? candidate.order.filter(
        (id, position, all): id is TColumnId =>
          typeof id === "string" &&
          knownIds.has(id) &&
          all.indexOf(id) === position,
      )
    : [];
  for (const column of columns) {
    if (!order.includes(column.id)) order.push(column.id);
  }
  const hidden = Array.isArray(candidate.hidden)
    ? candidate.hidden.filter(
        (id, position, all): id is TColumnId =>
          typeof id === "string" &&
          knownIds.has(id) &&
          !requiredIds.has(id) &&
          all.indexOf(id) === position,
      )
    : [...defaults.hidden];
  if (hidden.length === columns.length) hidden.splice(0, 1);
  return {
    schemaVersion,
    order,
    hidden,
  };
}
function readColumnPreferences<
  TRow, TColumnId extends string, TSortField extends string
>(
  key: string,
  columns: readonly ListColumn<TRow, TColumnId, TSortField>[],
  schemaVersion: number,
): ColumnPreferences<TColumnId> {
  try {
    const serialized = window.localStorage.getItem(key);
    return reconcileColumnPreferences(
      serialized === null ? undefined : JSON.parse(serialized),
      columns,
      schemaVersion,
    );
  } catch {
    return defaultColumnPreferences(columns, schemaVersion);
  }
}
function writeColumnPreferences<TColumnId extends string>(
  key: string,
  value: ColumnPreferences<TColumnId>,
): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存储不可用时保留内存中的列设置，不阻断列表工作。
  }
}
function validatePageResponse<TRow, TId extends BusinessId>(
  response: ListPageResponse<TRow>,
  pageSize: PageSize,
  getRowId: (row: TRow) => TId,
): ListPageResponse<TRow> {
  if (!Number.isInteger(response.totalItems) || response.totalItems < 0) {
    throw new Error("Invalid list response: totalItems must be a non-negative integer");
  }
  if (response.items.length > pageSize) {
    throw new Error("Invalid list response: page contains more items than pageSize");
  }
  const ids = new Set<BusinessId>();
  for (const row of response.items) {
    const id = getRowId(row);
    if (ids.has(id)) throw new Error("Invalid list response: duplicate business id");
    ids.add(id);
  }
  return response;
}
function buildBaseQueryFingerprint<TSortField extends string, TFilters>(input: {
  listId: string;
  cacheScope: string;
  filters: TFilters;
  sort: SortState<TSortField>;
  pageSize: PageSize;
}): string {
  return JSON.stringify([
    "list",
    input.listId,
    input.cacheScope,
    input.filters,
    input.sort,
    input.pageSize,
  ]);
}
function getAriaSort<TSortField extends string>(
  sort: SortState<TSortField>,
  field: TSortField | undefined,
): "ascending" | "descending" | undefined {
  if (field === undefined || sort?.field !== field) return undefined;
  return sort.direction === "asc" ? "ascending" : "descending";
}
function SortableColumnOption<TColumnId extends string>(props: {
  id: TColumnId;
  label: string;
  visible: boolean;
  required: boolean;
  position: number;
  total: number;
  messages: ListPageMessages;
  onToggle: () => void;
  onMove: (delta: -1 | 1) => void;
}): ReactNode {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.id });
  const style: CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`
      : undefined,
    transition,
    opacity: isDragging ? 0.65 : 1,
  };
  return (
    <Group ref={setNodeRef} style={style} wrap="wrap" justify="space-between">
      <Button
        ref={setActivatorNodeRef}
        type="button"
        variant="subtle"
        size="compact-sm"
        aria-label={props.messages.dragColumn(props.label)}
        {...attributes}
        {...listeners}
      >
        <IconGripVertical aria-hidden="true" size={16} />
      </Button>
      <Checkbox
        style={{ flex: "1 1 8rem", minWidth: 0 }}
        checked={props.visible}
        disabled={props.required}
        label={<Text size="sm" style={{ overflowWrap: "anywhere" }}>{props.label}</Text>}
        onChange={props.onToggle}
      />
      <Group gap="xs" wrap="wrap">
        <Button
          type="button"
          variant="default"
          size="compact-xs"
          aria-label={props.messages.moveColumnLeft(props.label)}
          disabled={props.position === 0}
          onClick={() => props.onMove(-1)}
        >
          <IconArrowLeft aria-hidden="true" size={16} />
        </Button>
        <Button
          type="button"
          variant="default"
          size="compact-xs"
          aria-label={props.messages.moveColumnRight(props.label)}
          disabled={props.position === props.total - 1}
          onClick={() => props.onMove(1)}
        >
          <IconArrowRight aria-hidden="true" size={16} />
        </Button>
      </Group>
    </Group>
  );
}
export function ListPage<
  TRow, TId extends BusinessId, TColumnId extends string,
  TSortField extends string, TFilters
>(
  props: ListPageProps<TRow, TId, TColumnId, TSortField, TFilters>,
): ReactNode {
  const columnPreferencesKey = buildColumnPreferencesKey(
    props.appNamespace,
    props.listId,
    props.columnPreferenceScope,
    props.columnSchemaVersion,
  );
  return (
    <ListPageWithStableColumnKey
      key={columnPreferencesKey}
      {...props}
      columnPreferencesKey={columnPreferencesKey}
    />
  );
}
function ListPageWithStableColumnKey<
  TRow, TId extends BusinessId, TColumnId extends string,
  TSortField extends string, TFilters
>(
  props: ListPageProps<TRow, TId, TColumnId, TSortField, TFilters> & {
    columnPreferencesKey: string;
  },
): ReactNode {
  const normalizedFilters = useMemo(
    () => props.codec.normalizeFilters(props.state.filters),
    [props.codec, props.state.filters],
  );
  const normalizedState = useMemo(
    () => ({ ...props.state, filters: normalizedFilters }),
    [normalizedFilters, props.state],
  );
  const sessionKey = useMemo(
    () => buildListSessionKey(props.appNamespace, props.listId, props.cacheScope),
    [props.appNamespace, props.cacheScope, props.listId],
  );
  const columnKey = props.columnPreferencesKey;
  const [columnPreferences, setColumnPreferences] = useState(() =>
    readColumnPreferences(columnKey, props.columns, props.columnSchemaVersion),
  );
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const baseQueryFingerprint = useMemo(
    () =>
      buildBaseQueryFingerprint({
        listId: props.listId,
        cacheScope: props.cacheScope,
        filters: normalizedFilters,
        sort: props.state.sort,
        pageSize: props.state.pageSize,
      }),
    [
      normalizedFilters,
      props.cacheScope,
      props.listId,
      props.state.pageSize,
      props.state.sort,
    ],
  );
  const fullQueryFingerprint = `${baseQueryFingerprint}:${props.state.page}`;
  const queryKey = useMemo(
    () =>
      [
        "list",
        props.listId,
        props.cacheScope,
        normalizedFilters,
        props.state.sort,
        props.state.pageSize,
        props.state.page,
      ] as const,
    [
      normalizedFilters,
      props.cacheScope,
      props.listId,
      props.state.page,
      props.state.pageSize,
      props.state.sort,
    ],
  );
  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }) =>
      validatePageResponse(
        await props.fetchPage(normalizedState, signal),
        props.state.pageSize,
        props.getRowId,
      ),
    placeholderData: (previousData, previousQuery) => {
      if (previousQuery === undefined) return undefined;
      const previousKey = previousQuery.queryKey;
      const previousFingerprint = JSON.stringify(previousKey.slice(0, -1));
      return previousFingerprint === baseQueryFingerprint ? previousData : undefined;
    },
    refetchOnMount: "always",
  });
  const columnsById = useMemo(
    () => new Map(props.columns.map((column) => [column.id, column])),
    [props.columns],
  );
  const visibleColumns = useMemo(
    () =>
      columnPreferences.order
        .map((id) => columnsById.get(id))
        .filter(
          (
            column,
          ): column is ListColumn<TRow, TColumnId, TSortField> =>
            column !== undefined && !columnPreferences.hidden.includes(column.id),
        ),
    [columnPreferences, columnsById],
  );
  const getDraggedColumn = useCallback(
    (id: BusinessId) => props.columns.find((column) => column.id === id),
    [props.columns],
  );
  const announceColumnPosition = useCallback(
    (activeId: BusinessId, overId: BusinessId) => {
      const column = getDraggedColumn(activeId);
      const position = columnPreferences.order.findIndex((id) => id === overId);
      return column === undefined || position < 0
        ? ""
        : props.messages.columnPosition(
            column.accessibleName,
            position + 1,
            columnPreferences.order.length,
          );
    },
    [columnPreferences.order, getDraggedColumn, props.messages],
  );
  const hasSelection = props.selection.mode !== "none";
  const totalColumns = visibleColumns.length + (hasSelection ? 1 : 0);
  const totalPages = query.data ? Math.ceil(query.data.totalItems / props.state.pageSize) : 0;
  const correctedPage =
    query.isSuccess &&
    !query.isFetching &&
    !query.isPlaceholderData
      ? getCorrectedPage(props.state.page, totalPages)
      : undefined;
  const isCorrectingPage = correctedPage !== undefined;
  const previousFullFingerprint = useRef(fullQueryFingerprint);
  const previousBaseFingerprint = useRef(baseQueryFingerprint);
  useEffect(() => {
    writeListSessionState(sessionKey, normalizedState, props.codec);
  }, [normalizedState, props.codec, sessionKey]);
  useEffect(() => {
    setColumnPreferences((current) =>
      reconcileColumnPreferences(
        current,
        props.columns,
        props.columnSchemaVersion,
      ),
    );
  }, [props.columnSchemaVersion, props.columns]);
  useEffect(() => {
    writeColumnPreferences(columnKey, columnPreferences);
  }, [columnKey, columnPreferences]);
  useEffect(() => {
    if (correctedPage === undefined) return;
    props.navigation.navigate(
      { ...normalizedState, page: correctedPage },
      { replace: true },
    );
  }, [
    correctedPage,
    props.navigation,
    normalizedState,
  ]);
  useEffect(() => {
    if (
      props.selection.mode === "current-page" &&
      previousFullFingerprint.current !== fullQueryFingerprint
    ) {
      props.selection.onChange(new Set<TId>());
    }
    previousFullFingerprint.current = fullQueryFingerprint;
  }, [fullQueryFingerprint, props.selection]);
  useEffect(() => {
    if (
      props.selection.mode === "cross-page" &&
      previousBaseFingerprint.current !== baseQueryFingerprint
    ) {
      props.selection.onQueryFingerprintChange(baseQueryFingerprint);
    }
    previousBaseFingerprint.current = baseQueryFingerprint;
  }, [baseQueryFingerprint, props.selection]);
  const updateState = useCallback(
    (
      patch: Partial<ListQueryState<TSortField, TFilters>>,
      options: { replace?: boolean; resetPage?: boolean } = {},
    ) => {
      props.navigation.navigate(
        {
          ...normalizedState,
          ...patch,
          filters:
            patch.filters === undefined
              ? normalizedFilters
              : props.codec.normalizeFilters(patch.filters),
          page: options.resetPage ? 1 : (patch.page ?? props.state.page),
        },
        { replace: options.replace ?? false },
      );
    },
    [normalizedFilters, normalizedState, props.codec, props.navigation, props.state.page],
  );
  useEffect(() => {
    const sort = props.state.sort;
    if (sort === null) return;
    const hasVisibleSortColumn = props.columns.some((column) =>
      column.sortField === sort.field && !columnPreferences.hidden.includes(column.id));
    if (!hasVisibleSortColumn) {
      updateState({ sort: null }, { resetPage: true });
    }
  }, [columnPreferences.hidden, props.columns, props.state.sort?.field, updateState]);
  const moveColumn = useCallback((columnId: TColumnId, delta: -1 | 1) => {
    setColumnPreferences((current) => {
      const from = current.order.indexOf(columnId);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= current.order.length) return current;
      return { ...current, order: arrayMove([...current.order], from, to) };
    });
  }, []);
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    if (event.over === null || event.active.id === event.over.id) return;
    setColumnPreferences((current) => {
      const activeId = current.order.find((id) => id === event.active.id);
      const overId = current.order.find((id) => id === event.over?.id);
      if (activeId === undefined || overId === undefined) return current;
      const from = current.order.indexOf(activeId);
      const to = current.order.indexOf(overId);
      if (from < 0 || to < 0) return current;
      return { ...current, order: arrayMove([...current.order], from, to) };
    });
  }, []);
  const toggleColumn = useCallback(
    (column: ListColumn<TRow, TColumnId, TSortField>) => {
      if (column.required) return;
      const hiding = !columnPreferences.hidden.includes(column.id);
      if (hiding && visibleColumns.length <= 1) return;
      setColumnPreferences((current) => ({
        ...current,
        hidden: hiding
          ? [...current.hidden, column.id]
          : current.hidden.filter((id) => id !== column.id),
      }));
      if (
        hiding &&
        column.sortField !== undefined &&
        column.sortField === props.state.sort?.field &&
        !visibleColumns.some((candidate) =>
          candidate.id !== column.id && candidate.sortField === column.sortField)
      ) {
        updateState({ sort: null }, { resetPage: true });
      }
    },
    [columnPreferences.hidden, props.state.sort?.field, updateState, visibleColumns.length],
  );
  const resetColumns = useCallback(() => {
    const next = defaultColumnPreferences(props.columns, props.columnSchemaVersion);
    setColumnPreferences(next);
    const sort = props.state.sort;
    if (sort === null) return;
    const hasVisibleSortColumn = props.columns.some((column) =>
      column.sortField === sort.field && !next.hidden.includes(column.id));
    if (!hasVisibleSortColumn) {
      updateState({ sort: null }, { resetPage: true });
    }
  }, [props.columnSchemaVersion, props.columns, props.state.sort?.field, updateState]);
  const selectableRows = query.data !== undefined && !query.isPlaceholderData ? query.data.items : [];
  const selectableIds = selectableRows.map(props.getRowId);
  const selectedIds =
    props.selection.mode === "none"
      ? new Set<TId>()
      : props.selection.selectedIds;
  const selectedOnPage = selectableIds.filter((id) => selectedIds.has(id));
  const allOnPageSelected =
    selectableIds.length > 0 && selectedOnPage.length === selectableIds.length;
  const someOnPageSelected =
    selectedOnPage.length > 0 && !allOnPageSelected;
  const toggleCurrentPageSelection = useCallback(() => {
    if (props.selection.mode === "none") return;
    const next = new Set(props.selection.selectedIds);
    for (const id of selectableIds) {
      if (allOnPageSelected) next.delete(id);
      else next.add(id);
    }
    props.selection.onChange(next);
  }, [allOnPageSelected, props.selection, selectableIds]);
  const toggleRowSelection = useCallback(
    (id: TId) => {
      if (props.selection.mode === "none") return;
      const next = new Set(props.selection.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      props.selection.onChange(next);
    },
    [props.selection],
  );
  const renderBody = (): ReactNode => {
    if (query.isPending || isCorrectingPage) {
      const message = isCorrectingPage
        ? props.messages.correctingPage
        : props.messages.loading;
      return (
        <>
          <Table.Tr>
            <Table.Td colSpan={totalColumns}>
              <Text role="status" aria-live="polite" size="sm">
                {message}
              </Text>
            </Table.Td>
          </Table.Tr>
          {SKELETON_ROW_IDS.slice(0, props.state.pageSize).map((slotId) => (
            <Table.Tr key={slotId} aria-hidden="true">
              {hasSelection ? (
                <Table.Td><Skeleton height={18} width={18} /></Table.Td>
              ) : null}
              {visibleColumns.map((column) => (
                <Table.Td key={column.id} visibleFrom={column.hideBelow}>
                  <Skeleton height={18} />
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </>
      );
    }
    if (query.isError && query.data === undefined) {
      return (
        <Table.Tr>
          <Table.Td colSpan={totalColumns}>
            <Alert color="red" role="alert" title={props.messages.error}>
              <Button type="button" variant="light" onClick={() => void query.refetch()}>
                {props.messages.retry}
              </Button>
            </Alert>
          </Table.Td>
        </Table.Tr>
      );
    }
    if (!query.isPlaceholderData && query.data?.items.length === 0) {
      return (
        <Table.Tr>
          <Table.Td colSpan={totalColumns}>
            <Group justify="center">
              <Text role="status" aria-live="polite">{props.messages.empty}</Text>
              <Button type="button" variant="light" onClick={() =>
                updateState({ filters: props.codec.defaults.filters }, { resetPage: true })
              }>{props.messages.resetFilters}</Button>
            </Group>
          </Table.Td>
        </Table.Tr>
      );
    }
    return query.data?.items.map((row) => {
      const rowId = props.getRowId(row);
      return (
        <Table.Tr key={rowId}>
          {hasSelection ? (
            <Table.Td>
              <Checkbox
                aria-label={props.messages.selectRow(rowId)}
                checked={selectedIds.has(rowId)}
                disabled={query.isPlaceholderData}
                onChange={() => toggleRowSelection(rowId)}
              />
            </Table.Td>
          ) : null}
          {visibleColumns.map((column) => (
            <Table.Td key={column.id} visibleFrom={column.hideBelow}>
              {column.renderCell(row)}
            </Table.Td>
          ))}
        </Table.Tr>
      );
    });
  };
  return (
    <Stack gap="md">
      {props.renderFilters({
        filters: normalizedFilters,
        apply: (filters) => updateState({ filters }, { resetPage: true }),
        reset: () =>
          updateState(
            { filters: props.codec.defaults.filters },
            { resetPage: true },
          ),
      })}
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Select
          label={props.messages.pageSize}
          data={PAGE_SIZES.map((size) => ({
            value: String(size),
            label: props.messages.pageSizeOption(size),
          }))}
          value={String(props.state.pageSize)}
          allowDeselect={false}
          onChange={(value) => {
            const pageSize = parsePageSize(value);
            if (pageSize !== undefined) {
              updateState({ pageSize }, { resetPage: true });
            }
          }}
        />
        <Popover width="min(420px, calc(100vw - 32px))"
          position="bottom-end" withArrow shadow="md">
          <Popover.Target>
            <Button type="button" variant="default" h="auto" styles={WRAPPING_BUTTON_STYLES}>
              {props.messages.columns}
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack gap="sm">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
                accessibility={{
                  screenReaderInstructions: {
                    draggable: props.messages.dragInstructions,
                  },
                  announcements: {
                    onDragStart: ({ active }) => {
                      const column = getDraggedColumn(active.id);
                      return column === undefined
                        ? ""
                        : props.messages.dragStarted(column.accessibleName);
                    },
                    onDragOver: ({ active, over }) =>
                      over === null
                        ? ""
                        : announceColumnPosition(active.id, over.id),
                    onDragEnd: ({ active, over }) =>
                      over === null
                        ? ""
                        : announceColumnPosition(active.id, over.id),
                    onDragCancel: ({ active }) => {
                      const column = getDraggedColumn(active.id);
                      return column === undefined
                        ? ""
                        : props.messages.dragCancelled(column.accessibleName);
                    },
                  },
                }}
              >
                <SortableContext
                  items={[...columnPreferences.order]}
                  strategy={verticalListSortingStrategy}
                >
                  {columnPreferences.order.map((columnId, position) => {
                    const column = columnsById.get(columnId);
                    if (column === undefined) return null;
                    return (
                      <SortableColumnOption
                        key={column.id}
                        id={column.id}
                        label={column.accessibleName}
                        visible={!columnPreferences.hidden.includes(column.id)}
                        required={column.required === true}
                        position={position}
                        total={columnPreferences.order.length}
                        messages={props.messages}
                        onToggle={() => toggleColumn(column)}
                        onMove={(delta) => moveColumn(column.id, delta)}
                      />
                    );
                  })}
                </SortableContext>
              </DndContext>
              <Button
                type="button"
                variant="subtle" h="auto" styles={WRAPPING_BUTTON_STYLES}
                onClick={resetColumns}
              >
                {props.messages.resetColumns}
              </Button>
            </Stack>
          </Popover.Dropdown>
        </Popover>
      </Group>
      {props.selection.mode !== "none" ? (
        <Text size="sm">
          {props.messages.selectionSummary(props.selection.mode, selectedIds.size)}
        </Text>
      ) : null}
      {query.isFetching && !query.isPending ? (
        <Text role="status" aria-live="polite" size="sm">
          {props.messages.refreshing}
        </Text>
      ) : null}
      {query.isError && query.data !== undefined ? (
        <Alert color="red" role="alert" title={props.messages.backgroundError}>
          <Button type="button" variant="light" onClick={() => void query.refetch()}>
            {props.messages.retry}
          </Button>
        </Alert>
      ) : null}
      <Table.ScrollContainer minWidth={props.tableMinWidth}>
        <Table
          stickyHeader
          stickyHeaderOffset={LIST_STICKY_HEADER_OFFSET}
          aria-busy={query.isFetching}
        >
          <Table.Caption>{props.messages.caption}</Table.Caption>
          <Table.Thead>
            <Table.Tr>
              {hasSelection ? (
                <Table.Th scope="col">
                  <Checkbox
                    aria-label={props.messages.selectCurrentPage}
                    checked={allOnPageSelected}
                    indeterminate={someOnPageSelected}
                    disabled={selectableIds.length === 0 || query.isPlaceholderData}
                    onChange={toggleCurrentPageSelection}
                  />
                </Table.Th>
              ) : null}
              {visibleColumns.map((column) => {
                const sortField = column.sortField;
                const next = sortField
                  ? nextSort(props.state.sort, sortField)
                  : null;
                const sortLabel =
                  next === null
                    ? props.messages.clearSort(column.accessibleName)
                    : next.direction === "asc"
                      ? props.messages.sortAscending(column.accessibleName)
                      : props.messages.sortDescending(column.accessibleName);
                return (
                  <Table.Th
                    key={column.id}
                    scope="col"
                    visibleFrom={column.hideBelow}
                    aria-sort={getAriaSort(props.state.sort, sortField)}
                  >
                    {sortField ? (
                      <UnstyledButton
                        type="button"
                        aria-label={sortLabel}
                        onClick={() =>
                          updateState(
                            { sort: nextSort(props.state.sort, sortField) },
                            { resetPage: true },
                          )
                        }
                      >
                        {column.header}
                      </UnstyledButton>
                    ) : (
                      column.header
                    )}
                  </Table.Th>
                );
              })}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{renderBody()}</Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {totalPages > 0 && props.state.page <= totalPages ? (
        <Pagination
          total={totalPages}
          value={props.state.page}
          siblings={0}
          boundaries={1}
          disabled={query.isPlaceholderData}
          onChange={(page) => updateState({ page })}
        />
      ) : null}
    </Stack>
  );
}
