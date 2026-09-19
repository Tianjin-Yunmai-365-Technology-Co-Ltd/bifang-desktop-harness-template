# Offset 列表页模式

本文件给出列表页的状态边界和实现骨架。先用真实 API/路由类型替换示例命名，再复制 `../assets/ListPage.template.tsx`；不要为迎合模板而修改业务接口。

## 1. 数据契约

```ts
export type PageSize = 10 | 20 | 50 | 100;
export type SortDirection = "asc" | "desc";
export type OrderSortField = "amount" | "createdAt";

export interface SortState<TField extends string> {
  field: TField;
  direction: SortDirection;
}

export interface ListRequest<TField extends string, TFilters> {
  page: number;
  pageSize: PageSize;
  sort: SortState<TField> | null;
  filters: TFilters;
}

export interface ListResponse<TRow> {
  rows: TRow[];
  totalCount: number;
}
```

- `TRow` 必须有稳定业务 `id`。不要用本页位置、请求 offset 或随机值补 id。
- 排序字段与筛选结构由具体业务声明。只有服务端允许的字段才能进入联合类型。
- 页码从 `1` 开始；请求 adapter 在最后一层换算 `offset = (page - 1) * pageSize`。

## 2. 查询状态恢复

每个列表声明跨版本稳定且全应用唯一的 `listId`，例如 `orders.list.v1`。会话键建议为 `app:list-state:${listId}:v1`。

恢复顺序按一次导航整体执行：

1. 检查原始 URL 是否包含本列表拥有的任一 query key。只要包含，就进入显式 URL 模式：合法字段采用，缺失或非法字段用默认值补齐，绝不混入本机旧会话快照。
2. URL 完全没有本列表 query key 时，读取当前标签页的 sessionStorage。解析失败、schema 不匹配或 storage 异常时忽略。
3. 没有合法会话快照时使用默认值：`page=1`、`sort=null` 和业务筛选默认值；`pageSize` 的全局兜底是 `20`，用户明确指定的合法初始值优先。
4. 用 `replace` 把规范化结果写回 URL，避免刷新后恢复出另一组状态；随后写入 sessionStorage。

只保存“已应用”的搜索/筛选，输入框草稿留在组件本地。搜索提交、清空、筛选、排序或 pageSize 变化时，把 page 设置为 `1`，再进行一次原子 URL 更新。不要先写 page 再写其他字段造成两次请求。

URL 和 sessionStorage 都不是安全存储。令牌、秘密、个人敏感值、长文本草稿或一次性输入不得进入其中；出现此类筛选时先改为不持久化并向用户说明。

## 3. Query key 与旧数据

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
  queryFn: ({ signal }) => fetchPage({ page, pageSize, sort, filters, signal }),
  placeholderData: (previousData, previousQuery) =>
    previousQuery &&
    JSON.stringify(previousQuery.queryKey.slice(0, -1)) ===
      JSON.stringify(queryKey.slice(0, -1))
      ? previousData
      : undefined,
  refetchOnMount: "always",
});
```

- `normalizeFilters` 必须产生确定性、可序列化值；排序无关的对象键应固定，不把函数、Date 实例或未应用草稿放进 key。
- `cacheScope` 是不含 PII 的租户/用户数据边界；身份不会改变结果时可用固定公共值，但不得省略结果隔离维度。
- 不把 `query.data` 复制到 Jotai、Web Storage 或组件外数组。每个分页组合自然有自己的 Query key 与缓存项。
- `placeholderData` 只在除末尾 page 外的 key 完全相同时返回旧数据；排序、搜索、筛选或 pageSize 改变时不得显示不相干旧结果。用 `isPlaceholderData` 或 `isFetching` 表达局部更新，并可在需要时禁用连续翻页。
- 重新访问页面时先恢复查询控件，再由完整 key 命中缓存并以 `refetchOnMount: "always"` 重新请求；不能用 Web Storage 快照代替服务端获取。Query 缓存可按项目 `gcTime` 正常回收，不承诺把业务行永久留在内存。

## 4. 越界处理

只在请求成功且响应总数可信时执行：

```ts
const totalPages = Math.ceil(totalCount / pageSize);

if (totalPages === 0 && page !== 1) {
  replaceQuery({ ...query, page: 1 });
} else if (totalPages > 0 && page > totalPages) {
  replaceQuery({ ...query, page: totalPages });
}
```

加载、错误或 placeholder data 期间不修正 page。修正必须用 URL `replace`，防止浏览器后退在非法页和末页之间循环。后端能直接返回可信 `totalPages` 时优先使用该字段，并验证它是非负整数。

## 5. 排序三态

```ts
function nextSort<TField extends string>(
  current: SortState<TField> | null,
  field: TField,
): SortState<TField> | null {
  if (current?.field !== field) return { field, direction: "asc" };
  if (current.direction === "asc") return { field, direction: "desc" };
  return null;
}
```

点击或键盘激活同一个真实 button 调用该函数，并原子更新 `{ sort: next, page: 1 }`。`Table.Th` 使用：

```ts
const ariaSort =
  sort?.field !== field
    ? undefined
    : sort.direction === "asc"
      ? "ascending"
      : "descending";
```

只把 `ariaSort` 传给当前排序列；none 状态下整张表不设置 `aria-sort`。

## 6. 四态顺序

1. 没有可展示数据且首次 pending：`pageSize` 行 Skeleton。
2. 没有可展示数据且 error：错误说明 + 重试。
3. 成功且 rows 为空：live empty。
4. 其余：真实或 placeholder rows；后台 fetching/error 在表格附近显示，不清空行。

Skeleton 槽位 key 用固定值集合（例如四个预定义前缀与序号组成的字符串）而不是 `key={index}`。真正数据始终 `key={row.id}`。

## 7. 行选择

在组件 props 或页面常量中公开声明：

```ts
type SelectionScope = "none" | "current-page" | "cross-page";
```

- `current-page`：翻页或查询条件变化清空；全选只覆盖当前响应 rows。
- `cross-page`：状态只保存业务 id，必须显示已选范围；查询条件变化执行已声明的清空或保留策略。
- 服务端批量动作重新校验 id，不把客户端选择当作授权。

## 8. 列偏好与迁移

```ts
interface ColumnPreferences<TColumnId extends string> {
  schemaVersion: number;
  order: TColumnId[];
  hidden: TColumnId[];
}
```

localStorage key 建议为 `app:list-columns:${listId}:${nonPiiPreferenceScope}:v${columnSchemaVersion}`；`columnSchemaVersion` 是每个列表显式传入的版本，不是所有列表共享的模板常量。读取后依次：

1. 验证对象形状和 schemaVersion。
2. 只保留当前定义存在的 columnId，并去重。
3. 按默认顺序追加新列。
4. 从 hidden 移除必显列和未知列。
5. 解析失败时移除坏值、回退默认，并保持页面可用。

列菜单使用 Checkbox 控制可见性；必显列显示但禁用或不提供隐藏入口，且始终保留至少一个业务列。提供“重置列”；重置或隐藏当前排序列时同时清除排序并回第 1 页。

## 9. 列拖拽

使用 `DndContext`、`SortableContext`、`PointerSensor`、`KeyboardSensor`、`sortableKeyboardCoordinates`、`verticalListSortingStrategy` 和 `arrayMove`。列设置面板按当前列顺序纵向展示可调整项；必显不等于不可排序，是否锁位要单独声明。

每个拖拽手柄都有包含列名的可访问名称。除了 dnd-kit 键盘传感器，再提供可见或菜单内的“左移/右移”动作，复用同一个 `moveColumn(columnId, delta)`，确保触控、键盘和辅助技术均能完成排序。每次合法变更后持久化规范化偏好。

不要引入 `@dnd-kit/utilities` 只为格式化 transform；可直接根据 `transform.x/y/scaleX/scaleY` 生成安全 style 字符串。确需其他依赖时先批准。

## 10. 窄屏降级

- 用列元数据声明 `narrowPriority` 或 Mantine `visibleFrom` 所消费的 `hideBelow`，而不是依赖 DOM 第几个子元素；至少一个业务主列同时设为 `required: true` 且不设 `hideBelow`。
- 主键/名称、关键状态和必要动作始终可达；次要列可默认隐藏但仍能从列菜单恢复。
- 只有 `Table.ScrollContainer` 滚动；搜索区、分页器和页面容器回流。
- 在 320 CSS px、200% 文本缩放、中英文和长业务值下验证。不要用固定高度截断状态或操作。
