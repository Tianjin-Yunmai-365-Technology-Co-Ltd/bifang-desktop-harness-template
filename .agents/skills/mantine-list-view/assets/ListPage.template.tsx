import {
  Alert,
  Button,
  Checkbox,
  Group,
  Pagination,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  UnstyledButton,
  VisuallyHidden,
} from "@mantine/core";
import {
  IconArrowDown,
  IconArrowsSort,
  IconArrowUp,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
// 替换为项目实际的共享 AppShell 布局常量；禁止在列表页声明 offset 字面量。
import { LIST_STICKY_HEADER_OFFSET } from "@/layout/constants";
import { ListColumnSettings } from "./ListColumnSettings";
import styles from "./ListPage.module.css";
import type {
  ListColumn,
  ListPageProps,
} from "./listPageTypes";
import {
  PAGE_SIZES,
  buildBaseQueryFingerprint,
  buildColumnPreferencesKey,
  buildListPageAnnouncement,
  buildListSessionKey,
  claimListCorrection,
  defaultColumnPreferences,
  getBrowserListStorage,
  getBusinessIdKey,
  getCorrectedPage,
  getEffectiveCurrentPageSelection,
  getResultRange,
  loadColumnPreferences,
  nextSort,
  parsePage,
  parsePageSize,
  pruneCurrentPageSelection,
  reconcileColumnPreferences,
  releaseListCorrection,
  validateBusinessIds,
  validatePageResponse,
  writeColumnPreferences,
  writeListSessionState,
  type BusinessId,
  type ListColumnContract,
  type ListQueryState,
  type SortState,
} from "./listPageState";

const SKELETON_ROW_IDS = Array.from(
  { length: 100 },
  (_, slot) => `list-skeleton-row-${slot + 1}`,
);

export {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  buildColumnPreferencesKey,
  buildListSessionKey,
  getBusinessIdKey,
  getCorrectedPage,
  nextSort,
  parsePage,
  parsePageSize,
  reconcileColumnPreferences,
  resolveInitialListLocation,
  resolveInitialListState,
  validatePageResponse,
} from "./listPageState";
export type {
  BusinessId,
  ColumnPreferences,
  ColumnPreferencesMigration,
  ListPageResponse,
  ListQueryState,
  ListStateCodec,
  PageSize,
  ResolvedInitialListState,
  SortDirection,
  SortState,
} from "./listPageState";
export type {
  ListCellRenderContext,
  ListColumn,
  ListErrorPresentation,
  ListNavigation,
  ListPageMessages,
  ListPageProps,
  ListSelection,
} from "./listPageTypes";

/** 仅在当前排序列返回原生 aria-sort 值。 */
function getAriaSort<TSortField extends string>(
  sort: SortState<TSortField>,
  field: TSortField | undefined,
): "ascending" | "descending" | undefined {
  if (field === undefined || sort?.field !== field) return undefined;
  return sort.direction === "asc" ? "ascending" : "descending";
}

/** 根据当前排序状态返回视力用户可见、辅助技术忽略的图标。 */
function SortIndicator<TSortField extends string>(props: {
  sort: SortState<TSortField>;
  field: TSortField;
}): ReactNode {
  if (props.sort?.field !== props.field) {
    return <IconArrowsSort aria-hidden="true" size={16} />;
  }
  return props.sort.direction === "asc" ? (
    <IconArrowUp aria-hidden="true" size={16} />
  ) : (
    <IconArrowDown aria-hidden="true" size={16} />
  );
}

/** 验证模板自身不可由 TypeScript 表达的跨字段展示契约。 */
function validateListPageProps<
  TRow,
  TId extends BusinessId,
  TColumnId extends string,
  TSortField extends string,
  TFilters,
>(
  props: ListPageProps<TRow, TId, TColumnId, TSortField, TFilters>,
): void {
  defaultColumnPreferences(props.columns, props.columnSchemaVersion);
  for (const [name, value] of [
    ["appNamespace", props.appNamespace],
    ["listId", props.listId],
    ["cacheScope", props.cacheScope],
    ["columnPreferenceScope", props.columnPreferenceScope],
  ] as const) {
    if (value.trim().length === 0) {
      throw new Error(`ListPage ${name} must not be blank`);
    }
  }
  if (
    props.codec.ownedKeys.length === 0 ||
    props.codec.ownedKeys.some((key) => key.trim().length === 0) ||
    new Set(props.codec.ownedKeys).size !== props.codec.ownedKeys.length
  ) {
    throw new Error("ListPage codec ownedKeys must be unique and non-empty");
  }
  if (parsePage(props.state.page) === undefined) {
    throw new Error("ListPage state.page must be a supported safe integer");
  }
  if (parsePageSize(props.state.pageSize) === undefined) {
    throw new Error("ListPage state.pageSize must belong to PAGE_SIZES");
  }
  if (props.messages.caption.trim().length === 0) {
    throw new Error("ListPage requires a non-empty table caption");
  }
  if (!Number.isFinite(props.tableMinWidth) || props.tableMinWidth <= 0) {
    throw new Error("ListPage tableMinWidth must be a positive finite number");
  }
  if (
    props.selection.mode !== "none" &&
    props.renderSelectionActions === undefined
  ) {
    throw new Error(
      "ListPage selection requires an accessible bulk actions renderer",
    );
  }
  if (props.selection.mode !== "none") {
    validateBusinessIds(props.selection.selectedIds, props.businessIdType);
  }
}

/** 以偏好键和 schema 作为 remount 边界，避免跨列表泄漏列状态。 */
export function ListPage<
  TRow,
  TId extends BusinessId,
  TColumnId extends string,
  TSortField extends string,
  TFilters,
>(
  props: ListPageProps<TRow, TId, TColumnId, TSortField, TFilters>,
): ReactNode {
  validateListPageProps(props);
  const columnPreferencesKey = buildColumnPreferencesKey(
    props.appNamespace,
    props.listId,
    props.columnPreferenceScope,
  );
  return (
    <ListPageWithStableColumnKey
      key={`${columnPreferencesKey}:schema-${props.columnSchemaVersion}`}
      {...props}
      columnPreferencesKey={columnPreferencesKey}
    />
  );
}

/** 在稳定列 schema 生命周期内拥有查询、选择和列面板的纯交互状态。 */
function ListPageWithStableColumnKey<
  TRow,
  TId extends BusinessId,
  TColumnId extends string,
  TSortField extends string,
  TFilters,
>(
  props: ListPageProps<TRow, TId, TColumnId, TSortField, TFilters> & {
    columnPreferencesKey: string;
  },
): ReactNode {
  const sessionStorage = getBrowserListStorage("session");
  const localStorage = getBrowserListStorage("local");
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
    loadColumnPreferences({
      storage: localStorage,
      key: columnKey,
      legacyKeys: props.columnPreferenceLegacyKeys,
      columns: props.columns,
      schemaVersion: props.columnSchemaVersion,
      migrate: props.migrateColumnPreferences,
    }),
  );
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
            column !== undefined &&
            !columnPreferences.hidden.includes(column.id),
        ),
    [columnPreferences, columnsById],
  );
  const sortNeedsCorrection =
    props.state.sort !== null &&
    !visibleColumns.some(
      (column) => column.sortField === props.state.sort?.field,
    );
  const queryState = useMemo(
    () => ({
      ...normalizedState,
      sort: sortNeedsCorrection ? null : normalizedState.sort,
    }),
    [normalizedState, sortNeedsCorrection],
  );
  const baseQueryFingerprint = useMemo(
    () =>
      buildBaseQueryFingerprint({
        listId: props.listId,
        cacheScope: props.cacheScope,
        filters: normalizedFilters,
        sort: queryState.sort,
        pageSize: queryState.pageSize,
      }),
    [
      normalizedFilters,
      props.cacheScope,
      props.listId,
      queryState.pageSize,
      queryState.sort,
    ],
  );
  const fullQueryFingerprint = `${baseQueryFingerprint}:${queryState.page}`;
  const queryKey = useMemo(
    () =>
      [
        "list",
        props.listId,
        props.cacheScope,
        normalizedFilters,
        queryState.sort,
        queryState.pageSize,
        queryState.page,
      ] as const,
    [
      normalizedFilters,
      props.cacheScope,
      props.listId,
      queryState.page,
      queryState.pageSize,
      queryState.sort,
    ],
  );
  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const response = await props.fetchPage(queryState, signal);
      const validated = validatePageResponse(
        response,
        queryState.page,
        queryState.pageSize,
        props.getRowId,
        props.businessIdType,
      );
      return validated;
    },
    placeholderData: (previousData, previousQuery) => {
      if (previousQuery === undefined) return undefined;
      const previousFingerprint = JSON.stringify(
        previousQuery.queryKey.slice(0, -1),
      );
      return previousFingerprint === baseQueryFingerprint
        ? previousData
        : undefined;
    },
    enabled: !sortNeedsCorrection,
    refetchOnMount: "always",
  });
  const hasSelection = props.selection.mode !== "none";
  const totalColumns = visibleColumns.length + (hasSelection ? 1 : 0);
  const totalPages = query.data
    ? Math.ceil(query.data.totalItems / queryState.pageSize)
    : 0;
  const correctedPage =
    !sortNeedsCorrection &&
    query.isSuccess &&
    !query.isFetching &&
    !query.isPlaceholderData
      ? getCorrectedPage(queryState.page, totalPages)
      : undefined;
  const isCorrectingPage = correctedPage !== undefined;
  const isCorrectingQueryState = sortNeedsCorrection || isCorrectingPage;
  const previousFullFingerprint = useRef(fullQueryFingerprint);
  const previousBaseFingerprint = useRef(baseQueryFingerprint);
  const pendingCurrentPageClear = useRef<string | undefined>(undefined);
  const lastSortCorrection = useRef<string | undefined>(undefined);
  const lastPageCorrection = useRef<
    { source: string; target: string } | undefined
  >(undefined);

  useEffect(() => {
    writeListSessionState(sessionStorage, sessionKey, queryState, props.codec);
  }, [props.codec, queryState, sessionKey, sessionStorage]);

  useEffect(() => {
    setColumnPreferences((current) =>
      reconcileColumnPreferences(
        current,
        props.columns,
        props.columnSchemaVersion,
        props.migrateColumnPreferences,
      ),
    );
  }, [
    props.columnSchemaVersion,
    props.columns,
    props.migrateColumnPreferences,
  ]);

  useEffect(() => {
    writeColumnPreferences(localStorage, columnKey, columnPreferences);
  }, [columnKey, columnPreferences, localStorage]);

  useEffect(() => {
    if (!sortNeedsCorrection) {
      lastSortCorrection.current = undefined;
      return;
    }
    const correctionFingerprint = JSON.stringify(
      props.codec.serialize(normalizedState),
    );
    if (lastSortCorrection.current === correctionFingerprint) return;
    lastSortCorrection.current = correctionFingerprint;
    props.navigation.navigate(
      { ...queryState, sort: null, page: 1 },
      { replace: true },
    );
  }, [
    normalizedState,
    props.codec,
    props.navigation,
    queryState,
    sortNeedsCorrection,
  ]);

  useEffect(() => {
    if (correctedPage === undefined) {
      lastPageCorrection.current = releaseListCorrection(
        lastPageCorrection.current,
        fullQueryFingerprint,
      );
      return;
    }
    const correction = claimListCorrection(
      lastPageCorrection.current,
      fullQueryFingerprint,
      String(correctedPage),
    );
    lastPageCorrection.current = correction.claim;
    if (!correction.shouldNavigate) return;
    props.navigation.navigate(
      { ...queryState, page: correctedPage },
      { replace: true },
    );
  }, [correctedPage, fullQueryFingerprint, props.navigation, queryState]);

  useEffect(() => {
    const queryChanged =
      previousFullFingerprint.current !== fullQueryFingerprint;
    previousFullFingerprint.current = fullQueryFingerprint;
    if (props.selection.mode !== "current-page") return;
    if (queryChanged) {
      pendingCurrentPageClear.current = fullQueryFingerprint;
      if (props.selection.selectedIds.size > 0) {
        props.selection.onChange(new Set<TId>());
      } else {
        pendingCurrentPageClear.current = undefined;
      }
      return;
    }
    if (pendingCurrentPageClear.current === fullQueryFingerprint) {
      if (props.selection.selectedIds.size === 0) {
        pendingCurrentPageClear.current = undefined;
      }
      return;
    }
    if (
      !query.isSuccess ||
      query.isPlaceholderData ||
      isCorrectingQueryState ||
      query.data === undefined
    ) {
      return;
    }
    const currentIds = query.data.items.map(props.getRowId);
    const next = pruneCurrentPageSelection(
      props.selection.selectedIds,
      currentIds,
    );
    if (next !== props.selection.selectedIds) {
      props.selection.onChange(next);
    }
  }, [
    fullQueryFingerprint,
    isCorrectingQueryState,
    props.getRowId,
    props.selection,
    query.data,
    query.dataUpdatedAt,
    query.isPlaceholderData,
    query.isSuccess,
  ]);

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
          ...queryState,
          ...patch,
          filters:
            patch.filters === undefined
              ? normalizedFilters
              : props.codec.normalizeFilters(patch.filters),
          page: options.resetPage ? 1 : (patch.page ?? queryState.page),
        },
        { replace: options.replace ?? false },
      );
    },
    [normalizedFilters, props.codec, props.navigation, queryState],
  );

  const toggleColumn = useCallback(
    (column: ListColumnContract<TColumnId, TSortField>) => {
      if (column.required) return;
      const hiding = !columnPreferences.hidden.includes(column.id);
      if (hiding && visibleColumns.length <= 1) return;
      setColumnPreferences((current) => ({
        ...current,
        hidden: hiding
          ? [...current.hidden, column.id]
          : current.hidden.filter((id) => id !== column.id),
      }));
    },
    [columnPreferences.hidden, visibleColumns.length],
  );

  const resetColumns = useCallback(() => {
    setColumnPreferences(
      defaultColumnPreferences(props.columns, props.columnSchemaVersion),
    );
  }, [props.columnSchemaVersion, props.columns]);

  const selectableRows =
    query.data !== undefined &&
    !query.isPlaceholderData &&
    !isCorrectingQueryState
      ? query.data.items
      : [];
  const selectableIds = selectableRows.map(props.getRowId);
  const rawSelectedIds =
    props.selection.mode === "none"
      ? new Set<TId>()
      : props.selection.selectedIds;
  const currentPageSelectionUnsafe =
    props.selection.mode === "current-page" &&
    (previousFullFingerprint.current !== fullQueryFingerprint ||
      pendingCurrentPageClear.current === fullQueryFingerprint ||
      query.isPlaceholderData ||
      isCorrectingQueryState ||
      query.data === undefined);
  const selectedIds =
    props.selection.mode === "current-page"
      ? getEffectiveCurrentPageSelection({
          selectedIds: rawSelectedIds,
          currentIds: query.data?.items.map(props.getRowId) ?? [],
          unsafe: currentPageSelectionUnsafe,
        })
      : rawSelectedIds;
  const selectedOnPage = selectableIds.filter((id) => selectedIds.has(id));
  const allOnPageSelected =
    selectableIds.length > 0 && selectedOnPage.length === selectableIds.length;
  const someOnPageSelected =
    selectedOnPage.length > 0 && !allOnPageSelected;

  const toggleCurrentPageSelection = useCallback(() => {
    if (props.selection.mode === "none") return;
    const next = new Set(selectedIds);
    for (const id of selectableIds) {
      if (allOnPageSelected) next.delete(id);
      else next.add(id);
    }
    props.selection.onChange(next);
  }, [allOnPageSelected, props.selection, selectableIds, selectedIds]);

  const toggleRowSelection = useCallback(
    (id: TId) => {
      if (props.selection.mode === "none") return;
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      props.selection.onChange(next);
    },
    [props.selection, selectedIds],
  );

  const clearSelection = useCallback(() => {
    if (props.selection.mode !== "none") {
      props.selection.onChange(new Set<TId>());
    }
  }, [props.selection]);

  const activeSortColumn =
    queryState.sort === null
      ? undefined
      : props.columns.find(
          (column) => column.sortField === queryState.sort?.field,
        );
  const resultRange =
    query.data !== undefined &&
    !query.isPlaceholderData &&
    !isCorrectingQueryState
      ? getResultRange({
          page: queryState.page,
          pageSize: queryState.pageSize,
          itemCount: query.data.items.length,
          totalItems: query.data.totalItems,
        })
      : undefined;
  const backgroundErrorPresentation =
    query.isError &&
    query.data !== undefined &&
    !isCorrectingQueryState
      ? props.getErrorPresentation(query.error, { background: true })
      : undefined;
  const hasActiveFilters = props.hasActiveFilters(normalizedFilters);
  const selectionActionsDisabled =
    selectedIds.size === 0 ||
    query.isPlaceholderData ||
    isCorrectingQueryState;
  const pageAnnouncement = buildListPageAnnouncement({
    isPending: query.isPending,
    isCorrecting: isCorrectingQueryState,
    isEmpty: !query.isPlaceholderData && query.data?.items.length === 0,
    hasActiveFilters,
    isFetching: query.isFetching,
    loading: props.messages.loading,
    correcting: props.messages.correctingLocation,
    noResults: props.messages.noResults,
    noData: props.messages.noData,
    refreshing: props.messages.refreshing,
    resultSummary:
      resultRange === undefined
        ? undefined
        : props.messages.resultSummary(
            resultRange.start,
            resultRange.end,
            resultRange.total,
          ),
    selectionSummary:
      props.selection.mode === "none"
        ? undefined
        : props.messages.selectionSummary(
            props.selection.mode,
            selectedIds.size,
          ),
  });

  /** 按互斥优先级渲染首次加载、错误、空和数据四态。 */
  const renderBody = (): ReactNode => {
    if (query.isPending || isCorrectingQueryState) {
      const message = isCorrectingQueryState
        ? props.messages.correctingLocation
        : props.messages.loading;
      return (
        <>
          <Table.Tr>
            <Table.Td colSpan={totalColumns}>
              <Text size="sm">{message}</Text>
            </Table.Td>
          </Table.Tr>
          {SKELETON_ROW_IDS.slice(0, queryState.pageSize).map((slotId) => (
            <Table.Tr key={slotId} aria-hidden="true">
              {hasSelection ? (
                <Table.Td>
                  <Skeleton height={18} width={18} />
                </Table.Td>
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
      const presentation = props.getErrorPresentation(query.error, {
        background: false,
      });
      return (
        <Table.Tr>
          <Table.Td colSpan={totalColumns}>
            <Alert color="red" role="alert" title={presentation.title}>
              {presentation.description}
              {presentation.retryable ? (
                <Button
                  type="button"
                  variant="light"
                  onClick={() => void query.refetch()}
                >
                  {props.messages.retry}
                </Button>
              ) : null}
            </Alert>
          </Table.Td>
        </Table.Tr>
      );
    }
    if (!query.isPlaceholderData && query.data?.items.length === 0) {
      return (
        <Table.Tr>
          <Table.Td colSpan={totalColumns}>
            <Group justify="center" wrap="wrap">
              <Text>
                {hasActiveFilters
                  ? props.messages.noResults
                  : props.messages.noData}
              </Text>
              {hasActiveFilters ? (
                <Button
                  type="button"
                  variant="light"
                  onClick={() =>
                    updateState(
                      { filters: props.codec.defaults.filters },
                      { resetPage: true },
                    )
                  }
                >
                  {props.messages.resetFilters}
                </Button>
              ) : (
                props.renderNoDataAction?.()
              )}
            </Group>
          </Table.Td>
        </Table.Tr>
      );
    }
    return query.data?.items.map((row, rowIndex) => {
      const rowId = props.getRowId(row);
      const rowName = props.getRowAccessibleName(row).trim();
      if (rowName.length === 0) {
        throw new Error("ListPage row accessible name must not be blank");
      }
      const selected = selectedIds.has(rowId);
      const interactive = !query.isPlaceholderData;
      return (
        <Table.Tr
          key={getBusinessIdKey(rowId)}
          className={styles.dataRow}
          data-row-tone={rowIndex % 2 === 0 ? "light" : "deep"}
          data-selected={selected || undefined}
          data-placeholder={query.isPlaceholderData || undefined}
          inert={query.isPlaceholderData || undefined}
          aria-disabled={query.isPlaceholderData || undefined}
        >
          {hasSelection ? (
            <Table.Td>
              <Checkbox
                aria-label={props.messages.selectRow(rowName)}
                checked={selected}
                disabled={!interactive}
                onChange={() => toggleRowSelection(rowId)}
              />
            </Table.Td>
          ) : null}
          {visibleColumns.map((column) =>
            column.responsiveRole === "primary" ? (
              <Table.Th
                key={column.id}
                scope="row"
                visibleFrom={column.hideBelow}
              >
                {column.renderCell(row, { interactive })}
              </Table.Th>
            ) : (
              <Table.Td key={column.id} visibleFrom={column.hideBelow}>
                {column.renderCell(row, { interactive })}
              </Table.Td>
            ),
          )}
        </Table.Tr>
      );
    });
  };

  return (
    <Stack gap="md">
      <VisuallyHidden role="status" aria-live="polite" aria-atomic="true">
        {pageAnnouncement}
      </VisuallyHidden>
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
          value={String(queryState.pageSize)}
          allowDeselect={false}
          onChange={(value) => {
            const pageSize = parsePageSize(value);
            if (pageSize !== undefined) {
              updateState({ pageSize }, { resetPage: true });
            }
          }}
        />
        <ListColumnSettings
          columns={props.columns}
          preferences={columnPreferences}
          messages={props.messages}
          onPreferencesChange={setColumnPreferences}
          onToggle={toggleColumn}
          onReset={resetColumns}
        />
      </Group>
      {activeSortColumn !== undefined && queryState.sort !== null ? (
        <Group wrap="wrap">
          <Text size="sm">
            {props.messages.activeSort(
              activeSortColumn.accessibleName,
              queryState.sort.direction,
            )}
          </Text>
          <Button
            type="button"
            variant="subtle"
            size="compact-sm"
            onClick={() => updateState({ sort: null }, { resetPage: true })}
          >
            {props.messages.clearSort(activeSortColumn.accessibleName)}
          </Button>
        </Group>
      ) : null}
      {props.selection.mode !== "none" ? (
        <Group wrap="wrap">
          <Text size="sm">
            {props.messages.selectionSummary(
              props.selection.mode,
              selectedIds.size,
            )}
          </Text>
          <Button
            type="button"
            variant="subtle"
            size="compact-sm"
            disabled={selectionActionsDisabled}
            onClick={clearSelection}
          >
            {props.messages.clearSelection}
          </Button>
          <fieldset
            className={styles.selectionActions}
            disabled={selectionActionsDisabled}
            inert={selectionActionsDisabled || undefined}
            aria-disabled={selectionActionsDisabled || undefined}
          >
            {props.renderSelectionActions?.({
              selectedIds,
              disabled: selectionActionsDisabled,
              clear: clearSelection,
            })}
          </fieldset>
        </Group>
      ) : null}
      {query.isFetching && !query.isPending ? (
        <Text size="sm">{props.messages.refreshing}</Text>
      ) : null}
      {backgroundErrorPresentation !== undefined ? (
        <Alert color="red" role="alert" title={backgroundErrorPresentation.title}>
          {backgroundErrorPresentation.description ?? null}
          {backgroundErrorPresentation.retryable ? (
            <Button
              type="button"
              variant="light"
              onClick={() => void query.refetch()}
            >
              {props.messages.retry}
            </Button>
          ) : null}
        </Alert>
      ) : null}
      <Table.ScrollContainer
        className={styles.scrollRegion}
        minWidth={props.tableMinWidth}
        type="native"
        role="region"
        aria-label={props.messages.scrollRegion}
        tabIndex={0}
      >
        <Table
          stickyHeader
          stickyHeaderOffset={LIST_STICKY_HEADER_OFFSET}
          aria-busy={query.isFetching || isCorrectingQueryState}
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
                    disabled={
                      selectableIds.length === 0 || query.isPlaceholderData
                    }
                    onChange={toggleCurrentPageSelection}
                  />
                </Table.Th>
              ) : null}
              {visibleColumns.map((column) => {
                const sortField = column.sortField;
                const next =
                  sortField === undefined
                    ? null
                    : nextSort(queryState.sort, sortField);
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
                    aria-sort={getAriaSort(queryState.sort, sortField)}
                  >
                    {sortField !== undefined ? (
                      <UnstyledButton
                        className={styles.sortButton}
                        type="button"
                        aria-label={sortLabel}
                        onClick={() =>
                          updateState(
                            { sort: nextSort(queryState.sort, sortField) },
                            { resetPage: true },
                          )
                        }
                      >
                        <span className={styles.sortLabel}>{column.header}</span>
                        <SortIndicator
                          sort={queryState.sort}
                          field={sortField}
                        />
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
      {resultRange !== undefined ? (
        <Text size="sm">
          {props.messages.resultSummary(
            resultRange.start,
            resultRange.end,
            resultRange.total,
          )}
        </Text>
      ) : null}
      {totalPages > 0 &&
      queryState.page <= totalPages &&
      !isCorrectingQueryState ? (
        <nav aria-label={props.messages.pagination}>
          <Pagination
            total={totalPages}
            value={queryState.page}
            withEdges
            layout="responsive"
            formatLabel={({ page, totalPages: pages }) =>
              props.messages.pageOf(page, pages)
            }
            siblings={0}
            boundaries={1}
            disabled={query.isPlaceholderData}
            getItemProps={(page) => ({
              "aria-label": props.messages.page(page),
            })}
            getControlProps={(control) => ({
              "aria-label":
                control === "first"
                  ? props.messages.firstPage
                  : control === "previous"
                    ? props.messages.previousPage
                    : control === "next"
                      ? props.messages.nextPage
                      : props.messages.lastPage,
            })}
            onChange={(page) => updateState({ page })}
          />
        </nav>
      ) : null}
    </Stack>
  );
}
