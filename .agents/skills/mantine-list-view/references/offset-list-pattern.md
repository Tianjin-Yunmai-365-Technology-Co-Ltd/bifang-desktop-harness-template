# Offset 列表页模式

复制 `../assets/` 的完整资产集，再用真实路由、API、i18n 和列定义适配。不要只复制组件主文件，也不要为迎合模板放宽业务接口。

## 1. 服务端数据与稳定排序

```ts
type PageSize = 10 | 20 | 50 | 100;
type SortDirection = "asc" | "desc";
type OrderSortField = "amount" | "createdAt";

interface ListRequest<TFilters> {
  page: number;
  pageSize: PageSize;
  sort: { field: OrderSortField; direction: SortDirection } | null;
  filters: TFilters;
}

interface ListResponse<TRow> {
  items: readonly TRow[];
  totalItems: number;
}
```

- 页码从 1 开始；adapter 最后一层才计算 `offset = (page - 1) * pageSize`，并拒绝非安全整数。
- 每行使用真实稳定业务 id，由 `businessIdType: "string" | "number"` 显式声明并在所有页、选择状态和响应校验中保持同一类型。视图用 `string:`/`number:` 前缀生成 React key，避免 `1` 与 `"1"` 碰撞。
- 服务端必须声明确定的默认顺序。任何用户排序都在同值时追加稳定业务 id 作为最终 tie-breaker，例如 `ORDER BY created_at DESC, id ASC`；否则 offset 翻页可能重复或漏行。
- 成功响应进入 UI 前验证 items 数组、非负安全总数、行数不超过 pageSize/total/剩余范围、当前可信有效页不为空、业务 key 不重复。矛盾响应是契约错误，不是空态。

## 2. 类型化路由 adapter

每个列表有全应用唯一稳定 `listId` 和 owned search keys。TanStack Router 的 validateSearch 可能已经补默认值，因此“URL 是否显式拥有 key”必须读取原始 search（普通对象或 `URLSearchParams`），不能从补默认后的对象猜。

```ts
const resolved = resolveInitialListLocation({
  rawUrlPresence,
  urlSearch: validatedSearch,
  sessionStorage,
  sessionKey,
  codec,
});

const canonical = mergeOwnedListSearch(
  currentSearch,
  codec.ownedKeys,
  resolved.canonicalSearch,
);

if (
  !isOwnedListSearchCanonical(
    currentSearch,
    codec.ownedKeys,
    resolved.canonicalSearch,
  )
) {
  navigate({ search: canonical, replace: true });
}
```

恢复顺序只执行一次：

1. 原始 URL 含任一 owned key：合法字段采用，缺失/非法字段补默认，绝不混入旧会话值。
2. URL 完全没有 owned key：读取 `app namespace + listId + non-PII scope + schema` 隔离的 sessionStorage；损坏或 parser 抛错时删除/忽略。
3. 没有合法快照：page=1、业务默认 sort/filter、产品合法初始 pageSize 或全局 20。
4. 在首次 Query 请求前，用单次 `replace` 写入 canonical search；`mergeOwnedListSearch` 保留同一路由其他功能的参数。自动清除隐藏排序与越界纠页也用 replace，并以纠正指纹抑制重复 effect。

只有已应用的搜索/筛选进入 URL/session；输入草稿留在本地。搜索提交、清空、筛选、sort、pageSize 变化用一次 navigation 原子写入并 page=1。令牌、秘密、PII、长文本或一次性值不得持久化。

## 3. Query v5 与 placeholder

```ts
const queryKey = [
  "list",
  listId,
  cacheScope,
  normalizeFilters(filters),
  sort,
  pageSize,
  page,
] as const;

const query = useQuery({
  queryKey,
  queryFn: ({ signal }) => fetchPage({ page, pageSize, sort, filters }, signal),
  placeholderData: (previousData, previousQuery) =>
    previousQuery &&
    JSON.stringify(previousQuery.queryKey.slice(0, -1)) ===
      JSON.stringify(queryKey.slice(0, -1))
      ? previousData
      : undefined,
  refetchOnMount: "always",
});
```

- `cacheScope` 是不含 PII 的结果隔离边界；filters 先规范成确定、可序列化值。行/总数不复制到 Jotai、Web Storage 或组件外数组。
- `previousQuery.queryKey.slice(0, -1)` 使 placeholder 只用于纯 page 变化。sort/filter/pageSize 变化不能显示无关旧行。
- TanStack Query v5 的 placeholder 只存在于 pending 阶段。新页 error 后显示该页错误；同 key background error 才保留当前数据。
- placeholder 行必须 `inert` 且 `aria-disabled`，选择、分页、批量和行内动作禁用；业务 `renderCell(row, { interactive })` 不得忽略 false。

## 4. 页码纠正与四态

只在成功、非 fetching、非 placeholder 且响应已通过校验时计算：

```ts
const totalPages = Math.ceil(totalItems / pageSize);
const correctedPage = getCorrectedPage(page, totalPages);
if (correctedPage !== undefined) {
  navigate({ ...state, page: correctedPage }, { replace: true });
}
```

修正中保持 `aria-busy=true` 并显示 Skeleton；loading/error/placeholder 不纠页。四态顺序为：

1. 首次 pending 或纠页：状态文案 + 恰好 pageSize 行稳定槽位 Skeleton。
2. 无数据且 error：业务 `getErrorPresentation` 决定描述和是否 retry；403/终态契约错误不显示重试。
3. 成功空：有已应用筛选时显示“无结果”与有效重置；默认筛选空时显示“无数据”及业务提供的可选下一步。
4. 数据：真实行或只读 placeholder；同 key background fetching/error 就近显示，成功后播报“第 X–Y 条，共 Z 条”。

## 5. 排序与逐行视觉

- `nextSort` 固定 asc→desc→none，并与 page=1 原子更新。`aria-sort` 只在当前 th；可见 Tabler icon 与状态一致且 `aria-hidden`。
- 当前排序摘要放在表格外，即使列因响应式隐藏也能感知和清除；primary/status/actions 必须设置 `required: true`，本身不允许响应式隐藏。
- 数据行用 `data-row-tone` 交替 light/deep。light scheme 为 `white`/`gray-1`，dark scheme 为 `dark-7`/`dark-6`；hover/`:focus-within` 强化为 `gray-3`/`dark-4`，focus ring 和 forced-colors 独立可见。
- 行本身不因视觉高亮自动变成可点击或可聚焦；只有真实语义控件进入 Tab 顺序。唯一 primary 单元格使用 `th scope="row"`，选择名称来自 `getRowAccessibleName`。

## 6. 选择

```ts
type SelectionScope = "none" | "current-page" | "cross-page";
```

- 启用选择必须提供摘要、清空和可访问 action bar；不能只渲染复选框。
- current-page 在 full query fingerprint 变化时清空；同 key 成功刷新时把集合裁剪到当前 id。
- cross-page 只保存 id，并由产品声明 base query 变化时清空/保留策略和范围文案。
- 批量提交时服务端重新校验 id、权限和当前状态；客户端集合不是授权。行内控件与父行不得互相代理或冒泡成重复动作。

## 7. 列偏好和拖拽

稳定 localStorage key 不含 schemaVersion：

```ts
interface ColumnPreferences<TColumnId extends string> {
  schemaVersion: number;
  order: readonly TColumnId[];
  hidden: readonly TColumnId[];
}
```

读取顺序：验证当前/登记的 legacy key → 必要时调用显式 migration → reconcile 唯一已知 id → 追加新列 → 移除必显列的 hidden → 写回稳定 key → 清理 legacy key。坏 JSON、迁移异常或版本仍不匹配时回退并重写默认。

列 schema 运行时失败关闭：columnId 与可访问名称非空、columnId 唯一、sortField 非空且唯一、恰好一个 primary；primary 与存在的 status/actions 必须 `required: true`，并和其他 required 列一样不得 `hideBelow`。列设置使用 bounded scroll area；pointer/keyboard DnD 与左移/右移复用同一更新逻辑并播报新位置。

## 8. 窄屏和验证

- `Table.ScrollContainer type="native" role="region" aria-label=... tabIndex={0}` 提供局部横向键盘滚动；搜索、结果摘要、分页和页面壳回流。
- Pagination 优先 `layout="responsive"`；旧版本 fallback 必须在 320 CSS px/200% 下证明等价。所有控制名和可见文案走 i18n。
- 纯函数契约从 `ListPage.contracts.test.ts` 开始；项目组件测试另覆盖角色/名称、真实点击/键盘、placeholder inert、四态、分页标签、选择、列移动和逐行 hover/focus。真实浏览器或服务端未运行时不可冒充验证完成。
