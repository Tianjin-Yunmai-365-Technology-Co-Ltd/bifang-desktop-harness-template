---
name: mantine-list-view
description: "Create, implement, refactor, or review React 19.2+ and Mantine UI 9.x list page / data table / admin list / search results（列表页 / 表格 / 后台列表 / 搜索结果页）with consistent behavior and delivery checks. 即使用户没有明说表格也要使用：只要任务实质上涉及重复记录的检索、浏览、管理，或审查已有列表组件，就调用本 Skill。"
---

# Mantine 列表页

## 触发条件

- 创建、修改、重构或审查 React 19.2+、TypeScript、Mantine UI 9.x 的列表页、数据表格、后台管理列表或搜索结果页时使用。
- 即使用户未写“表格”，只要页面实质上用于检索、浏览或管理重复记录，也必须使用。
- 审查已有列表组件时同样使用；不因任务只要求“看看问题”而跳过交付检查。
- 本 Skill 是 [Mantine 列表页设计标准](../../../docs/design_standards/mantine_list_view.md) 的执行入口；冲突时以用户已批准的产品事实和该标准为准。

## 开始前的三个决策问题

1. 这个列表的稳定 `listId`、业务行 `id`、总条数契约、可排序字段联合类型，以及允许进入 URL/sessionStorage 的已应用搜索与筛选字段分别是什么？
2. 行选择是禁用、仅当前页，还是跨页？若跨页，跨搜索/筛选/排序后如何失效或保留？
3. 哪些列必显、哪些列可隐藏、默认顺序和窄屏降级是什么？列偏好是设备级还是用户级，列 schema 版本如何迁移或重置？

不能从现有规格、类型或接口可靠回答时，先向用户确认；不得用无类型字符串或隐含选择语义继续实现。

## 约束清单

### 粘滞与滚动

- 只用 Mantine `<Table stickyHeader stickyHeaderOffset={GLOBAL_OFFSET}>`；offset 必须来自共享布局常量，禁止页面内字面量。
- 禁止手写 `position: sticky`；横向滚动只用 `Table.ScrollContainer`，并声明 `minWidth`。
- 明确窄屏降级：至少一个业务主列同时设为 `required: true` 且不设 `hideBelow`，必要动作仍可达；次要列允许隐藏，二维数据区局部滚动，页面本身不得横向滚动。

### 排序

- 只实现 `asc → desc → none` 三态；表头排序控件用原生 button 或 Mantine Button/ActionIcon/UnstyledButton，键盘可达。
- 每个排序字段只能对应一个表头；只在当前排序列的 `<th>` 设置准确的 `aria-sort`，none 状态不设置该属性，不可排序表头不伪装成可排序。
- 排序字段必须是联合类型白名单，禁止用裸 `string`；URL、存储和服务端返回值进入状态前都要解析并拒绝非法值。
- 任何排序变化都把页码重置为 `1`。

### 分页、查询与恢复

- 只支持页码式 offset 分页；用 Mantine `<Pagination>`，其 `total` 必须传总页数而不是总条数。
- `pageSize` 只允许 `[10, 20, 50, 100]`，全局兜底为 `20`；用户明确指定白名单值时作为该列表初始值，但选择器仍保留四项。搜索、筛选或 pageSize 变化把页码重置为 `1`。
- `page`、`pageSize`、`sort` 与已应用的搜索/筛选同步 URL query。显式 URL 一旦包含本列表任一参数，就只用合法 URL 值并以默认值补齐；URL 完全没有本列表参数时才从 `listId` 隔离的 sessionStorage 恢复，否则使用默认值。
- 当前页大于成功响应的末页时回落末页并重查；总页数为 `0` 时页码规范化为 `1`；加载或错误状态不得触发回落循环。
- 业务行数据只由 TanStack Query 缓存，不写入 Jotai、URL、sessionStorage 或 localStorage。query key 至少包含稳定 `listId`、不含 PII 的结果 scope、规范化搜索/筛选、排序、page 和 pageSize。
- 翻页使用 TanStack Query 的旧数据占位能力保留上一页，避免内容闪烁；恢复查询条件后按 query key 重新获取数据。

### 四态

- 首次加载：渲染 `pageSize` 行 Skeleton，Skeleton key 使用稳定槽位值，不用数组 index。
- 空：提供说明与恢复动作，并用 `aria-live` 或等价 live region 播报。
- 错误：说明影响并提供可重试动作；有旧数据时保留旧数据并将刷新错误就近呈现。
- 正常：展示真实数据；后台刷新保留内容并提供局部进度。四态缺一不可。

### 标识与行选择

- React row key 必须使用业务 `id`，禁止 index；业务接口缺少稳定 id 时先修正契约。
- 行选择必须公开声明为“仅当前页”或“跨页”，不能靠实现细节猜测；跨页选择使用业务 id，并定义查询条件变化后的失效规则。

### 自定义列

- 列必须使用稳定 `columnId`；可见性和顺序以 `app namespace + listId + 非 PII 偏好 scope + 逐列表 schemaVersion` 隔离后写入 localStorage，不得保存行数据、搜索词、分页或排序。
- 读取偏好时丢弃未知列、补入新增列、强制恢复必显列；损坏或不兼容数据回退默认配置，并提供“重置列”动作。
- 列拖拽使用 `@dnd-kit/core` 与 `@dnd-kit/sortable`；不得假设全局安装。实现 PointerSensor、KeyboardSensor 和键盘等价的左移/右移操作，拖拽手柄具有可访问名称。

## 生成步骤

1. 完整读取 [offset-list-pattern.md](references/offset-list-pattern.md) 和 [mantine-api.md](references/mantine-api.md)，再检查项目现有路由、API 类型、共享布局常量、QueryClient 与测试约定。
2. 从 [ListPage.template.tsx](assets/ListPage.template.tsx) 复制并适配，而不是逐字照搬；保留类型白名单、状态解析、缓存边界和可访问性契约。
3. 先建立类型化 URL/query 状态与存储恢复，再接 TanStack Query、四态、Mantine Table/Pagination，最后接列偏好、拖拽和声明过的行选择。
4. 用真实用户操作覆盖排序三态、分页/越界、恢复优先级、旧数据保留、四态、列迁移/重置、拖拽键盘路径与窄屏降级。
5. 审查模式先逐项报告违反约束的位置和影响；只有用户同时授权修改时才实施修复。

## 自检清单入口

交付前完整读取并逐项执行 [checklist.md](references/checklist.md)。任一必选项失败都不能声称列表页已通过验收；记录实际运行的检查和仍未执行的真实浏览器/服务端验证。
