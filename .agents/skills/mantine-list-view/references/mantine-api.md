# Mantine 与 Query API 边界

本参考于 2026-09-19 对照 Mantine `9.6.1` 与 TanStack Query v5 文档复核。模板使用 `Pagination layout="responsive"`、`formatLabel`、`getItemProps`、`getControlProps` 和 Query v5 `placeholderData(previousData, previousQuery)`，因此直接复制的兼容下界是 `@mantine/core >=9.6.1 <10`、`@tanstack/react-query >=5.102.8 <6`。下游仍使用带完整三段下界的 caret 与锁文件；低于下界时必须先升级，或实现并测试语义等价 fallback。

## Table 与滚动区

官方文档：[Table](https://mantine.dev/core/table/)

```tsx
<Table.ScrollContainer
  minWidth={TABLE_MIN_WIDTH}
  type="native"
  role="region"
  aria-label={messages.scrollRegion}
  tabIndex={0}
>
  <Table stickyHeader stickyHeaderOffset={LIST_STICKY_HEADER_OFFSET}>
    {/* thead / tbody */}
  </Table>
</Table.ScrollContainer>
```

- `stickyHeaderOffset` 来自共享 AppShell 常量；不要给 wrapper、thead 或 th 手写 `position: sticky`。
- `minWidth` 按真实列宽声明。页面根不横向滚动；命名的 native scroll viewport 可由键盘进入并显示 focus ring。
- 唯一业务主列使用 `<Table.Th scope="row">`。列标题使用 `<Table.Th scope="col">`；当前排序列才设置 `aria-sort`。
- 真实数据行通过 CSS module 的 `data-row-tone="light|deep"` 交替着色，hover/`:focus-within` 提升对比，selected 与 forced-colors 保留独立非颜色反馈。

## Pagination

官方文档：[Pagination](https://mantine.dev/core/pagination/)

```tsx
<nav aria-label={messages.pagination}>
  <Pagination
    total={totalPages}
    value={page}
    withEdges
    layout="responsive"
    formatLabel={({ page, totalPages }) => messages.pageOf(page, totalPages)}
    getItemProps={(itemPage) => ({ "aria-label": messages.page(itemPage) })}
    getControlProps={(control) => ({
      "aria-label": controlLabels[control],
    })}
    onChange={setPage}
  />
</nav>
```

- `total` 是总页数，不是总条数；零条结果不渲染分页控件，状态 page 仍规范化为 1。
- 首末页控件只有在 `withEdges` 时渲染；使用首/末文案契约就必须同时启用该属性。
- `layout="responsive"` 在窄宽度收敛页码数量；landmark、首/末/前/后、页码和“第 x/y 页”全部本地化。
- 分页器之外显示“第 X–Y 条，共 Z 条”的可见 live summary；placeholder 或正在纠正非法页时不得播报伪范围。
- 若产品被固定在不支持 responsive layout 的旧 Mantine 9 小版本，采用 `withPages={false}` 的紧凑前后页 fallback 或分层回流，并在 320 CSS px/200% 下证明无页面级横向溢出。

## Select、Skeleton 与按钮

官方文档：[Select](https://mantine.dev/core/select/)、[Skeleton](https://mantine.dev/core/skeleton/)、[Button](https://mantine.dev/core/button/)

- pageSize 的展示值可用字符串，但进入状态前必须由 `parsePageSize` 收敛到 `10 | 20 | 50 | 100`；`allowDeselect={false}`。
- Skeleton 行数严格等于 pageSize；固定槽位 key 不用数组 index。
- 纯图标按钮必须有可访问名称。排序图标来自 `@tabler/icons-react` 且 `aria-hidden`，文字/`aria-sort` 承担语义。
- 列移动按钮至少使用 `compact-sm` 或更大尺寸；拖拽成功与按钮移动都复用同一位置 live announcement。

## TanStack Query v5

官方文档：[Paginated queries](https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries)

```ts
useQuery({
  queryKey,
  queryFn: ({ signal }) => fetchPage(state, signal),
  placeholderData: (previousData, previousQuery) =>
    sameBaseQuery(previousQuery?.queryKey, queryKey)
      ? previousData
      : undefined,
  refetchOnMount: "always",
});
```

- `placeholderData` 只在新 key pending 时提供旧值；新页请求进入 error 后 placeholder 会消失。因此换页错误展示新页的就地错误，只有同 key 后台 refresh error 保留当前数据。
- `isPlaceholderData` 为 true 时旧行只读：`inert`、选择禁用、行内动作尊重 `interactive=false`，分页也暂时禁用。
- Query 不负责 URL canonicalization、服务端稳定排序、响应运行时校验、列偏好或 DnD；这些由类型化 route adapter、API/core 和模板纯函数分别承担。

## 依赖

模板额外使用 `@tabler/icons-react`、`@dnd-kit/core` 和 `@dnd-kit/sortable`。只有实际生成列表页时才把所需直接依赖写入下游 `package.json` 与锁文件；禁止依赖全局安装或未声明的传递依赖，也不为简单 transform 增加 `@dnd-kit/utilities`。

`ListPage.contracts.test.ts` 使用 Node 原生 assert 与显式 `.ts` 导入，直接执行 `node --experimental-strip-types ListPage.contracts.test.ts`。若项目把该测试纳入 `tsc`，其测试 tsconfig 必须启用 `allowImportingTsExtensions`；产品源码 typecheck 与这条可执行契约都要运行。
