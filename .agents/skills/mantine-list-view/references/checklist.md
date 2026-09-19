# Mantine 列表页交付自检

只有与当前任务相关的条目全部通过，才能声明交付完成。审查任务把失败项写成带文件/行号、影响和修复建议的发现；实现任务补齐测试并记录实际命令。

## 契约与状态

- [ ] `listId` 全应用唯一且稳定；每行有真实业务 id，所有 row key 都使用该 id。
- [ ] 排序字段是联合类型白名单；pageSize 只有 `10 | 20 | 50 | 100`，全局兜底 20，并尊重用户明确指定的合法初始值。
- [ ] URL、sessionStorage、localStorage 和网络输入均先解析，非法值不会进入运行时状态。
- [ ] 显式 URL 含任一列表 key 时只采用合法 URL 值并用默认值补齐；完全无列表 key 时才读 listId 会话快照，并用 replace 写回规范 URL。
- [ ] URL/session 只保存已应用查询控件；业务行、总数和请求结果只在 TanStack Query。
- [ ] Query key 包含 listId、非 PII 结果 scope、规范化搜索/筛选、sort、page、pageSize；翻页保留旧数据并重新获取。
- [ ] 敏感或不适合分享的筛选不进入 URL/sessionStorage。

## Table 与排序

- [ ] 使用 `<Table stickyHeader stickyHeaderOffset={共享常量}>`，没有手写 `position: sticky` 和 offset 字面量。
- [ ] 使用 `Table.ScrollContainer` 与 `minWidth`，页面根不横向滚动，并声明窄屏保留/隐藏规则。
- [ ] 每个排序字段只属于一个表头；排序严格按 asc→desc→none，任何排序变化原子重置 page=1。
- [ ] 可排序表头有真实 button、可见焦点和键盘路径；只有当前排序列有准确 `aria-sort`，none 时没有该属性。

## 分页与搜索

- [ ] 仅使用页码式 offset 分页和 Mantine Pagination；`total` 接收 totalPages，不是 totalCount。
- [ ] pageSize、搜索、筛选变化重置 page=1；page/pageSize/sort/已应用搜索筛选同步 URL。
- [ ] 成功时 page>totalPages 回末页，零结果回 page=1；pending/error/placeholder 不触发修正或循环。
- [ ] pageSize 选择器不可清空，四个白名单值、全局兜底 20 和用户指定初始值都有测试。

## 四态与刷新

- [ ] 首次加载恰好渲染 pageSize 行 Skeleton，槽位 key 稳定且不是 index。
- [ ] 空态说明原因/恢复动作，并通过 `aria-live` 或 `role="status"` 播报。
- [ ] 错误态说明影响并可重试；刷新失败时旧数据仍可见。
- [ ] 正常态、placeholder 和后台 fetching 可区分；翻页不会整页闪空。

## 选择与列

- [ ] 行选择明确声明 none/current-page/cross-page；翻页和查询条件变化行为与声明一致。
- [ ] 列有稳定 columnId；localStorage key 包含 app namespace、listId、非 PII 偏好 scope 和逐列表 schemaVersion，且 payload 不含行或查询状态。
- [ ] 读取列偏好会去掉未知/重复列、追加新列、恢复必显列；坏数据回退默认并可重置。
- [ ] 拖拽只依赖已声明的 `@dnd-kit/core`、`@dnd-kit/sortable`，包含 pointer/keyboard sensor、命名手柄及左移/右移等价动作。

## 验证

- [ ] 单元/组件测试覆盖排序三态、URL/session 优先级、非法值、分页越界、零结果、错误不回落、旧数据保留和四态。
- [ ] 测试覆盖列偏好迁移/损坏/重置、pointer 与 keyboard 重排、行选择声明和业务 id key。
- [ ] Testing Library 通过角色、名称和真实用户操作断言；不以 class、私有 DOM 或大快照代替行为。
- [ ] 至少一个主列为 `required: true` 且不设 `hideBelow`；检查 320 CSS px、200% 文本缩放、中英文、长内容、Tab/Enter/Space、可见焦点和 live region。
- [ ] 已运行项目声明的 lint、typecheck 和相关测试；未运行的真实浏览器、服务端或 E2E 验证明确列为剩余风险。

## 审查已有组件的最低报告

- [ ] 发现按“阻断交付 / 行为错误 / 无障碍或恢复风险 / 建议改进”分级，并引用最小准确代码行。
- [ ] 明确指出四态、存储边界、Query key、总页数、越界和列迁移中未实现或无法证实的部分。
- [ ] 不在仅授权审查时修改源码、依赖或持久状态。
