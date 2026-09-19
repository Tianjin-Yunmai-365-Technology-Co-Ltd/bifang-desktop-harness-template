# Mantine 列表页交付自检

逐项记录 `Pass`、`Fail` 或 `N/A（理由 + 证据）`。`Required` 始终适用；`Conditional` 在括号条件成立时必选，否则才可记 N/A。已触发项失败时不得声称交付通过。列表专项检查不能代替 Tauri GUI 通用标准中的 i18n、对比度、焦点恢复、reduced motion、Popover 键盘路径和事件归属检查。

## Required：数据与状态契约

- [ ] `listId` 全应用唯一稳定；`businessIdType` 显式声明且业务 id 类型在所有页与选择状态中一致。React key 使用带类型前缀的业务 id，不用 index。
- [ ] 默认排序确定；每个允许排序字段是非空联合类型，服务端对同值追加稳定业务 id tie-breaker，防止 offset 跨页重复/遗漏。
- [ ] page、pageSize、total、schemaVersion、响应行数都验证为安全整数；pageSize 只允许 `10 | 20 | 50 | 100`，兜底 20。
- [ ] 成功响应验证 `items.length <= pageSize`、`items.length <= totalItems`、id/key 唯一、页码与可信总数一致；矛盾响应进入契约错误，不伪装成空态。
- [ ] URL/session/localStorage/网络 parser 即使收到恶意对象也不抛出到渲染层，非法值不会进入运行时状态。

## Required：路由、查询与分页

- [ ] 原始 URL 含任一 owned key 时只采用合法 URL 值并补默认；完全无 owned key 时才读 listId 会话快照。`URLSearchParams` 与 typed router raw-presence 路径都有测试。
- [ ] canonical URL 在首次请求前只 replace 一次并保留无关 query；筛选/排序/pageSize 原子更新且 page=1；自动清除隐藏排序和越界页只 replace，不污染 Back 历史或双请求。
- [ ] Query key 包含 listId、非 PII scope、规范化筛选、sort、pageSize、page；业务行、总数和请求结果只在 TanStack Query v5。
- [ ] 只在纯 page 变化 pending 时保留 placeholder；placeholder 行 inert 且所有选择/行内副作用不可执行。换页失败显示新页错误，同 key refresh 失败保留当前数据。
- [ ] Mantine Pagination 的 `total` 接收 totalPages；成功非 placeholder 响应才纠正越界，零结果回 page=1，pending/error/placeholder 不循环。
- [ ] Pagination 使用 responsive layout 或已证明等价 fallback，有本地化 navigation landmark、首末前后、页码和当前页名称；可见 live summary 显示 X–Y/总数。

## Required：Table、排序与逐行视觉

- [ ] 使用 `<Table stickyHeader stickyHeaderOffset={共享常量}>`，没有手写 sticky 或 offset 字面量。
- [ ] `Table.ScrollContainer` 有真实 `minWidth`、本地化区域名称、键盘入口、可见焦点；页面根不横向滚动。
- [ ] 数据行严格浅/深/浅/深交替；light 为 `white`/`gray-1`，dark 为 `dark-7`/`dark-6`；hover 和 `:focus-within` 使用更强 `gray-3`/`dark-4` 高亮，焦点/forced-colors 不只靠颜色。
- [ ] 排序按 asc→desc→none；每个字段只属于一列。当前列同时有可见方向图标和准确 `aria-sort`，none 时不设置；图标对辅助技术隐藏。
- [ ] 唯一 `primary`、声明存在的关键 `status`/`actions` 都显式设置 `required: true`，且它们和所有 required 列都不设置 `hideBelow`；窄屏仍显示当前排序摘要和清除入口。
- [ ] 行选择名称使用可理解业务名称而非仅 UUID；唯一主列为 `th scope="row"`，caption 非空且本地化。

## Required：四态与反馈

- [ ] 首次加载恰好 pageSize 行 Skeleton，槽位 key 稳定且不是 index；纠页期间 `aria-busy` 仍为 true。
- [ ] 无筛选且全局无数据与筛选无结果使用不同文案；只有后者显示有效“重置筛选”，前者动作由业务提供或不显示。
- [ ] 错误由业务分型；403/终态契约错误不显示无效 retry，可重试网络错误有真实按钮；正常/placeholder/background fetching 可区分。
- [ ] 结果范围、刷新、空、错误、选择和列移动反馈使用稳定 live region，且不会因同时挂载多个重复播报相互覆盖。

## Required：列偏好

- [ ] `columnId` 唯一；偏好 key 为 app namespace + listId + 非 PII scope，schemaVersion 只在 payload。
- [ ] 兼容升级使用显式 migration；旧 key 被精确清理，损坏/不兼容 payload 重写默认。未知/重复列删除、新列追加、必显列恢复。
- [ ] 列面板可滚动且键盘可达；pointer/keyboard sensor、命名手柄、至少 24px 左移/右移按钮、位置播报和重置列都通过真实操作测试。

## Conditional：选择和业务动作

- [ ] （selection != none）有可访问批量 action bar、选择摘要和显式清空；不允许只有复选框而没有下一步。
- [ ] （current-page）翻页/查询组合变化清空；同 key 成功刷新后裁剪已消失 id；全选只覆盖当前真实响应。
- [ ] （cross-page）只保存业务 id，并明确查询变化后清空/保留策略及可见范围说明。
- [ ] （任何批量动作）服务端重新校验 id、权限和当前状态；客户端选择不当授权。
- [ ] （行内或父行动作）分别点击行内控件与父行，证明事件不会误代理、冒泡触发重复动作；placeholder 期间都不可执行。

## Conditional：验证范围

- [ ] （实现或修改模板）运行项目 lint/typecheck、相关非空测试，并迁移/运行 `ListPage.contracts.test.ts`；Testing Library 用角色、名称和真实 user-event，不用大快照代替行为。
- [ ] （实际 GUI 交付、E2E 被产品/构建要求启用）在真实浏览器/Tauri 验证 320 CSS px、200% 文本缩放、中英文、长值、Tab/Enter/Space、横向键盘滚动、hover/focus、Back/Forward/refresh 与服务端错误。
- [ ] （仅审查）按“阻断交付 / 行为错误 / 无障碍或恢复风险 / 建议改进”分级，提供最小文件/行号证据；不修改源码或持久状态。

## 交付记录

- 实际命令与结果：
- Conditional/N/A 及理由：
- 未运行的浏览器、服务端或 E2E：
- 剩余风险：
