# Mantine 9.x 精确 API

本参考在 2026-09-19 对照 Mantine `9.6.1` 官方文档复核。目标兼容范围是 Mantine UI `9.x`；复制模板前仍应按下游依赖策略验证其实际最低版本、peer 和锁文件，不要把 `9.6.1` 写成裸精确依赖。

## Table

官方文档：[Table](https://mantine.dev/core/table/)

```tsx
<Table.ScrollContainer minWidth={TABLE_MIN_WIDTH}>
  <Table stickyHeader stickyHeaderOffset={LIST_STICKY_HEADER_OFFSET}>
    <Table.Thead>{/* ... */}</Table.Thead>
    <Table.Tbody>{/* ... */}</Table.Tbody>
  </Table>
</Table.ScrollContainer>
```

- `stickyHeader` 让表头粘滞；`stickyHeaderOffset` 设置相对顶部偏移，适合固定 AppShell header。offset 由共享布局常量提供。
- `Table.ScrollContainer` 的 `minWidth` 是必需的最小表格宽度；低于该宽度时容器局部滚动。默认基于 Mantine ScrollArea，也可按已有产品约定选择 `type="native"`。
- 不给 `<thead>`、`<th>` 或 wrapper 增加 `position: sticky`。不要依赖 Mantine 私有 class 或 DOM 层级。
- `aria-sort` 属于原生 `<th>` 语义；当前排序列使用 `ascending | descending`。none 状态以及其他表头省略该属性，不要给每个未排序列批量写 `aria-sort="none"`。把可聚焦的排序 button 放入 `Table.Th`，不要让整个单元格靠 `onClick` 模拟按钮。

## Pagination

官方文档：[Pagination](https://mantine.dev/core/pagination/)

```tsx
<Pagination total={totalPages} value={page} onChange={setPage} />
```

- `total` 是总页数，不是总记录数。只有总条数时使用 `Math.ceil(totalCount / pageSize)`，零条结果得到 `0`。
- `value`/`onChange` 组成受控页码。业务状态仍须由类型化 URL 适配层拥有。
- 模板不使用 `layout="responsive"`，以免无意抬高 Mantine 9.x 的最低小版本；确需该能力时先核对下游已解析版本。
- 总页数为 `0` 时可不渲染 Pagination；状态中的 page 仍规范化为 `1`。

## Select

官方文档：[Select](https://mantine.dev/core/select/)

```tsx
<Select<PageSize>
  label={t("list.pageSize")}
  data={[10, 20, 50, 100]}
  value={pageSize}
  allowDeselect={false}
  onChange={(value) => value !== null && setPageSize(parsePageSize(value))}
/>
```

- Mantine 9.6.1 的 Select 支持 string、number、boolean 等 primitive 值和显式泛型；无论组件类型推断如何，URL/存储输入仍须经过 `parsePageSize` 白名单。
- 设置 `allowDeselect={false}`，避免页大小进入 `null`。
- 若下游的已验证 Mantine 9.x 下界只支持字符串值，则用 `'10' | '20' | '50' | '100'` 展示并在边界解析成 `PageSize`；不要放宽为任意 number。

## Skeleton、状态与按钮

官方文档：[Skeleton](https://mantine.dev/core/skeleton/)、[Button](https://mantine.dev/core/button/)、[ActionIcon](https://mantine.dev/core/action-icon/)

- Skeleton 没有列表行数属性；用稳定槽位 key 生成恰好 `pageSize` 个 `Table.Tr`。
- 纯图标 ActionIcon 必须有可访问名称。排序可使用可见文本 Button 或带 `aria-label` 的 ActionIcon。
- 空态和后台状态使用原生 `role="status"`/`aria-live`；错误重试使用真实 Button。

## Mantine 没有提供的能力

Mantine Table 不提供数据获取、服务端排序、URL 状态、列可见性或列拖拽模型。不要从表格 props 猜测这些能力：

- 获取和旧数据保留：TanStack Query。
- URL：项目固定的 TanStack Router 类型化 search schema。
- 列拖拽：用户批准的 `@dnd-kit/core` 与 `@dnd-kit/sortable`。参考 [Keyboard sensor](https://docs.dndkit.com/api-documentation/sensors/keyboard) 和 [Sortable](https://docs.dndkit.com/presets/sortable)。
- 不额外引入 `@dnd-kit/utilities`；简单 transform 可在本地安全格式化。若确需第三个包，先按下游依赖规则取得批准并声明。

所有新增前端直接依赖必须进入下游 `package.json` 和锁文件；禁止全局安装。
