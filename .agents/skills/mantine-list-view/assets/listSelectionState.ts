import type { BusinessId } from "./listPageState";

/** 单选替换当前项，多选只切换目标 id；始终返回新的受控集合。 */
export function toggleListSelection<TId extends BusinessId>(
  selectedIds: ReadonlySet<TId>,
  id: TId,
  cardinality: "single" | "multiple",
): ReadonlySet<TId> {
  if (cardinality === "single") return new Set([id]);
  const next = new Set(selectedIds);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** 汇总当前页全选与半选，跨页的其他选择不影响页头状态。 */
export function getPageSelectionState<TId extends BusinessId>(
  selectedIds: ReadonlySet<TId>,
  pageIds: readonly TId[],
): { all: boolean; some: boolean } {
  const count = pageIds.filter((id) => selectedIds.has(id)).length;
  return { all: pageIds.length > 0 && count === pageIds.length, some: count > 0 && count < pageIds.length };
}

/** 页头只切换当前页；跨页集合中其他页的 id 原样保留。 */
export function toggleListPageSelection<TId extends BusinessId>(
  selectedIds: ReadonlySet<TId>,
  pageIds: readonly TId[],
): ReadonlySet<TId> {
  const { all } = getPageSelectionState(selectedIds, pageIds);
  const next = new Set(selectedIds);
  for (const id of pageIds) {
    if (all) next.delete(id);
    else next.add(id);
  }
  return next;
}
