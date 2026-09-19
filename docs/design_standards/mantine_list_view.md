# Mantine 列表页设计标准

`standard_id = mantine-list-view-v1`

本标准在 React 19.2+、TypeScript、Mantine UI 9.x 页面用于检索、浏览或管理重复记录时命中，包括列表页、数据表格、后台管理列表和搜索结果页。它与 [Tauri GUI 通用设计标准](tauri_gui.md) 组合使用；本文件只覆盖列表页组件、查询状态和列偏好，未覆盖部分继续遵守通用标准。生成或审查实现时使用 `$mantine-list-view`。

## 状态所有权例外

列表页是普通页面工作状态规则的封闭例外：

- `page`、`pageSize`、排序和已应用的搜索/筛选以合法 URL query 为当前权威，使刷新、返回和可分享链接恢复同一视图。
- 当前会话另以稳定 `listId` 隔离写入 sessionStorage。只有 URL 完全没有本列表拥有的参数时才读取会话快照；显式 URL 中合法字段优先、缺失或非法字段用默认值补齐，禁止混入本机旧会话值，以保证同一分享链接在不同设备上确定一致。敏感、一次性或不适合出现在地址栏的值不得进入 URL 或会话存储。
- 业务行数据、总数和请求结果只由 TanStack Query 缓存，不写入 Jotai、URL、sessionStorage、localStorage、Tauri Store、文件或数据库。
- 列顺序与可见性属于设备偏好，以稳定 `app namespace + listId + 非 PII 偏好 scope + 逐列表 schemaVersion` 隔离写入 localStorage；不得在该记录中混入查询状态或业务行数据。
- 本例外不扩大到普通表单、详情页或其他页面状态；未命中本标准的页面继续使用应用根 Jotai process-session 规则。

## 表格与窄屏

- 表头粘滞只能用 Mantine `<Table stickyHeader stickyHeaderOffset={GLOBAL_OFFSET}>`。offset 从共享布局常量导入；禁止页内字面量和手写 `position: sticky`。
- 二维内容只在 `Table.ScrollContainer` 内横向滚动，并声明符合实际列宽的 `minWidth`。页面根不得出现横向滚动。
- 窄屏保留业务主键或名称、关键状态和必要动作；至少一个主列同时设为 `required: true` 且不设 `hideBelow`。次要列可隐藏或由用户配置，但不能导致可访问名称、排序状态或行操作丢失。
- 表格行 React key 使用业务 id，禁止 index；缺少稳定业务 id 是数据契约错误，不能在视图层伪造。

## 排序

- 排序循环固定为 `asc → desc → none`。字段是业务允许值组成的 TypeScript 联合类型，所有 URL、存储和网络输入都经白名单解析。
- 可排序表头内放置语义 button 或 Mantine Button/ActionIcon/UnstyledButton；支持 Tab、Enter 和 Space，保持可见焦点。
- 每个排序字段只能对应一个表头。只有当前排序列的 `<th>` 设置 `aria-sort`：升序 `ascending`、降序 `descending`；none 状态下整张表不设置该属性，不可排序列不提供排序控件。
- 排序字段或方向变化立即把页码重置为 `1`，再同步 URL 和会话状态。

## 页码式分页

- 只支持页码式 offset 分页；请求契约把 `page`、`pageSize` 转成 offset/limit，不引入 cursor 模式。
- 页大小白名单固定为 `10 | 20 | 50 | 100`，全局兜底为 `20`；用户明确指定白名单值时，该值是此列表的初始值，但选择器仍保留四项。pageSize、搜索或筛选变化把 page 重置为 `1`。
- Mantine `<Pagination total={totalPages}>` 的 `total` 是总页数，不是总条数。总页数由可信响应直接提供，或以 `Math.ceil(totalCount / pageSize)` 计算。
- 成功响应后，若 page 大于非零 totalPages，则替换为末页并重查；totalPages 为 `0` 时 page 规范化为 `1`。加载或错误不能触发回落。
- Query key 至少包含 `listId`、规范化搜索/筛选、排序、page 与 pageSize。翻页时保留旧数据；后台刷新不能把已有内容替换成整页 Skeleton。

## 页面四态

| 状态 | 必需表现 |
|---|---|
| 首次加载 | 接近真实行结构的 Skeleton，行数严格等于 pageSize，槽位 key 稳定且不是数组 index |
| 空 | 说明当前条件无结果，提供合理恢复动作，并用 `aria-live` 或 `role="status"` 播报 |
| 错误 | 说明失败范围，提供重试；已有旧数据时保留内容并就近显示刷新错误 |
| 正常 | 真实数据、总数和分页一致；后台刷新以局部进度表达 |

四态必须互斥且完整。第一页空结果不是错误；错误不得伪装为空态。

## 行选择

- 每个列表明确声明 `none`、`current-page` 或 `cross-page`，界面文案与行为一致。
- 当前页选择在翻页时清理；跨页选择只保存业务 id，并必须定义搜索、筛选或排序变化时清理还是保留。
- 跨页选择不能依赖已加载行对象；批量动作必须由服务端重新校验 id、权限和当前状态。

## 自定义列与拖拽

- 每列有稳定 `columnId`，列定义声明必显、默认可见、默认顺序、排序字段和窄屏优先级；前述主列的 `required`/`hideBelow` 契约由模板在运行时失败关闭。
- localStorage payload 包含 schema 版本、顺序和可见性。读取时丢弃未知 id、按默认顺序追加新列、强制恢复必显列；损坏或不兼容时删除该 payload 并回退默认值。
- 页面提供“重置列”动作。列配置变更只影响视图，不改变后端字段、业务权限或导出契约。
- 拖拽固定使用 `@dnd-kit/core` 与 `@dnd-kit/sortable`，同时配置 pointer 与 keyboard sensor。拖拽手柄具有可访问名称，并提供可发现的“左移/右移”键盘等价动作；不能把指针拖拽作为唯一入口。

## 最小回归

- 排序：三态顺序、联合类型拒绝非法字段、`aria-sort`、键盘触发、排序后 page=1。
- 查询：URL 优先级、非法 URL 降级、sessionStorage 隔离、刷新/返回恢复、Query key 完整、行数据不进入任何 Web Storage。
- 分页：四个 pageSize、`totalPages` 语义、搜索/pageSize 后 page=1、越界末页、零结果 page=1、错误不回落、旧数据保留。
- 状态：pageSize 行 Skeleton、live empty、retry error、正常与后台刷新。
- 列：坏数据回退、未知列丢弃、新列追加、必显恢复、重置、拖拽和键盘等价路径持久化。
- 响应式与无障碍：320 CSS px、200% 文本缩放、局部横向滚动、可见焦点、可访问名称和 live region。

完整生成与交付检查由 `$mantine-list-view` 的 `references/checklist.md` 执行。
