import { Alert, Button, Checkbox, Group, Popover, Radio, Skeleton, Table, Text, UnstyledButton, VisuallyHidden } from "@mantine/core";
import { IconArrowDown, IconArrowsSort, IconArrowUp } from "@tabler/icons-react";
import type { UseQueryResult } from "@tanstack/react-query";
import { useId, type ReactNode } from "react";
// 替换为项目共享 AppShell 布局常量，不在列表中另写 offset。
import { LIST_STICKY_HEADER_OFFSET } from "@/layout/constants";
import type { ListColumn, ListPageProps } from "./listPageTypes";
import { getBusinessIdKey, nextSort, type BusinessId, type ListPageResponse, type ListQueryState, type SortState } from "./listPageState";
import styles from "./ListPage.module.css";

const SKELETON_ROW_IDS = Array.from({ length: 100 }, (_, slot) => `list-skeleton-row-${slot + 1}`);

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


/** 只负责语义表格、原生控件和四态呈现；查询与选择仍由列表页持有。 */
export function ListDataTable<TRow, TId extends BusinessId, TColumnId extends string, TSortField extends string, TFilters>(
  props: ListPageProps<TRow, TId, TColumnId, TSortField, TFilters> & {
    query: UseQueryResult<ListPageResponse<TRow>, Error>;
    queryState: ListQueryState<TSortField, TFilters>;
    visibleColumns: readonly ListColumn<TRow, TColumnId, TSortField>[];
    isCorrectingQueryState: boolean;
    selectedIds: ReadonlySet<TId>;
    selectableIds: readonly TId[];
    allOnPageSelected: boolean;
    someOnPageSelected: boolean;
    selectionUnconfirmed: boolean;
    filtersActive: boolean;
    retry: () => void;
    toggleRowSelection: (id: TId) => void;
    toggleCurrentPageSelection: () => void;
    updateState: (patch: Partial<ListQueryState<TSortField, TFilters>>, options?: { replace?: boolean; resetPage?: boolean }) => void;
  },
): ReactNode {
  const { query, queryState, visibleColumns, isCorrectingQueryState, selectedIds, selectableIds,
    allOnPageSelected, someOnPageSelected, selectionUnconfirmed, filtersActive: hasActiveFilters, retry,
    toggleRowSelection, toggleCurrentPageSelection, updateState } = props;
  const hasSelection = props.selection.mode !== "none";
  const totalColumns = visibleColumns.length + (hasSelection ? 1 : 0);
  const totalWeight = visibleColumns.reduce((sum, column) => sum + (column.widthWeight ?? 1), 0);
  const radioName = useId();
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
                  disabled={query.isFetching}
                  onClick={retry}
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
              {props.selection.mode !== "none" && props.selection.cardinality === "single" ? (
                <Radio name={radioName} aria-label={props.messages.selectRow(rowName)} checked={selected}
                  disabled={!interactive || selectionUnconfirmed} onChange={() => toggleRowSelection(rowId)} />
              ) : (
                <Checkbox aria-label={props.messages.selectRow(rowName)} checked={selected}
                  disabled={!interactive || selectionUnconfirmed} onChange={() => toggleRowSelection(rowId)} />
              )}
            </Table.Td>
          ) : null}
          {visibleColumns.map((column) =>
            column.responsiveRole === "primary" ? (
              <Table.Th
                key={column.id}
                scope="row"
                className={column.numeric ? styles.numeric : undefined}
                visibleFrom={column.hideBelow}
              >
                <div className={styles.cellContent}>{column.renderCell(row, { interactive })}</div>
                {props.renderRowDetails ? (
                  <Popover withinPortal trapFocus returnFocus closeOnEscape position="bottom-start">
                    <Popover.Target><Button type="button" variant="subtle" size="compact-sm" disabled={!interactive}>{props.messages.viewRowDetails(rowName)}</Button></Popover.Target>
                    <Popover.Dropdown className={styles.fullValue} tabIndex={0} data-autofocus aria-label={props.messages.viewRowDetails(rowName)}>
                      {props.renderRowDetails(row, { interactive })}
                    </Popover.Dropdown>
                  </Popover>
                ) : null}
              </Table.Th>
            ) : (
              <Table.Td key={column.id} visibleFrom={column.hideBelow} className={column.numeric ? styles.numeric : undefined}>
                <div className={styles.cellContent}>{column.renderCell(row, { interactive })}</div>
              </Table.Td>
            ),
          )}
        </Table.Tr>
      );
    });
  };

  return (
        <Table
          className={styles.table}
          layout="fixed"
          stickyHeader
          stickyHeaderOffset={LIST_STICKY_HEADER_OFFSET}
          aria-busy={query.isFetching || isCorrectingQueryState}
        >
          <Table.Caption>{props.messages.caption}</Table.Caption>
          <Table.Thead className={styles.tableHeader}>
            <Table.Tr>
              {hasSelection ? (
                <Table.Th scope="col" w="var(--app-grid-selection-width)">
                  {props.selection.mode !== "none" && props.selection.cardinality === "multiple" ? (
                  <Checkbox
                    aria-label={props.messages.selectCurrentPage}
                    checked={allOnPageSelected}
                    indeterminate={someOnPageSelected}
                    disabled={
                      selectableIds.length === 0 || query.isPlaceholderData || selectionUnconfirmed
                    }
                    onChange={toggleCurrentPageSelection}
                  />
                  ) : <VisuallyHidden>{props.messages.selectionColumn}</VisuallyHidden>}
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
                    className={column.numeric ? styles.numeric : undefined}
                    w={`calc(${hasSelection ? "(100% - var(--app-grid-selection-width))" : "100%"} * ${column.widthWeight ?? 1} / ${totalWeight})`}
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
  );
}
