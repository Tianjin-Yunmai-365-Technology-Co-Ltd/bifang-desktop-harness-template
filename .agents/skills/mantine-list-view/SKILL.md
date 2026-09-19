---
name: mantine-list-view
description: "Create, implement, refactor, or review React 19.2+ and Mantine UI 9.x list page / data table / admin list / search results（列表页 / 表格 / 后台列表 / 搜索结果页）with consistent behavior and delivery checks. 即使用户没有明说表格也要使用：只要任务实质上涉及重复记录的检索、浏览、管理，或审查已有列表组件，就调用本 Skill。"
---

# Mantine 列表页

## 何时使用

- 创建、修改、重构或审查 React、TypeScript、Mantine 的列表页、表格、后台列表或搜索结果页时使用。
- 即使用户未写“表格”，只要页面实质用于检索、浏览或管理重复记录，也必须使用。
- 本 Skill 执行 [Mantine 列表页设计标准](../../../docs/design_standards/mantine_list_view.md)，并与 [Tauri GUI 通用设计标准](../../../docs/design_standards/tauri_gui.md) 组合；产品已批准事实优先。

## 开始前必须确定

1. 稳定 `listId`、显式 `businessIdType`（`string | number`）单一规范业务 id 类型、总数契约、默认确定性排序、允许的排序字段，以及同值记录的稳定业务 id tie-breaker。
2. 哪些已应用筛选可进入 URL/sessionStorage；原始 URL key 所有权、类型化路由 adapter、非列表 query 参数保留方式和首次 canonical replace 时机。
3. 选择是 none/current-page/cross-page；若启用，批量动作、清空入口和服务端 id/权限/状态重验分别是什么。
4. 哪一列是唯一 `primary`，哪些是关键 `status`/`actions`；必显、默认顺序、窄屏降级、偏好 scope、schema 迁移和旧 key 清理是什么。

答案会改变产品边界且无法从规格、类型或接口确认时停止询问；普通实现细节按本标准推进。

## 不可省略的行为契约

### 表格、行与窄屏

- 只用 `<Table stickyHeader stickyHeaderOffset={GLOBAL_OFFSET}>` 与 `Table.ScrollContainer`；offset 来自共享布局常量，禁止手写 sticky。滚动区必须可聚焦、有本地化名称和可见焦点。
- 每个真实数据行固定浅/深/浅/深交替；浅色主题使用 `white`/`gray-1`，深色主题使用 `dark-7`/`dark-6`。鼠标 hover 或任一行内控件 `:focus-within` 时用更强的 `gray-3`/`dark-4` 高亮；键盘焦点另有清晰轮廓，forced-colors 仍可见。不要只靠颜色表达选择或状态。
- 唯一 `primary` 列以 `th scope="row"` 渲染，并由业务提供非空行名称。`primary`、声明存在的 `status`/`actions` 必须显式设置 `required: true`，且它们和所有 required 列都不得设置 `hideBelow`；次要列才可隐藏。
- placeholder 旧行是只读展示：整行 inert、选择和行内副作用禁用，`renderCell` 必须尊重 `interactive=false`。

### 排序、分页与路由

- 排序严格 `asc → desc → none`；字段是非空联合类型白名单。当前列同时有可见 Tabler 图标与准确 `aria-sort`，图标 `aria-hidden`；窄屏仍显示当前排序摘要和清除入口。
- 服务端默认排序必须确定；所有可排序字段在同值时追加稳定业务 id tie-breaker。排序、搜索、筛选或 pageSize 变化原子重置 page=1。
- 只支持 offset 分页；pageSize 固定 `[10, 20, 50, 100]`、兜底 20。Mantine Pagination 的 `total` 是总页数，使用 responsive layout、本地化 landmark/首末前后/页码名称，并显示当前范围与总数。
- 原始 URL 含任一 owned key 时只采用合法 URL 值并以默认值补齐；完全无 owned key 时才读 listId 隔离的 sessionStorage。canonicalization 和自动纠正只 `replace` 一次、保留无关 query 参数并在首次请求前完成。
- page、total、schemaVersion 与响应计数必须是安全整数。成功响应验证行数/总数/页码一致性；越界页只在成功、非 placeholder、非 fetching 时 replace 到末页，零结果回 page=1。

### 查询、四态与选择

- 业务行、总数和请求结果只由 TanStack Query v5 缓存；query key 包含 listId、非 PII scope、规范化筛选、sort、pageSize、page。只在纯页码变化的 pending 阶段显示旧页 placeholder；换页失败显示该页错误，不伪装成旧页结果。同 key 后台刷新失败保留当前数据。
- 首次 loading 为恰好 pageSize 行 Skeleton；空态区分“当前筛选无结果”和“全局无数据”；错误由业务分型并只为可重试错误显示 retry；正常态显示结果范围、后台进度和 live feedback。
- current-page 选择在查询组合变化时清空，并在同 key 成功刷新后裁剪已消失 id；cross-page 只保存 id 并执行声明的失效策略。启用选择必须同时提供摘要、清空与可访问批量动作。

### 列偏好

- 列 id 唯一；每个排序字段只属于一列。偏好 key 固定为 app namespace + listId + 非 PII scope，schemaVersion 只放 payload，避免每次升级遗留新 key。
- 加载时校验 payload、显式迁移兼容旧 schema、清理登记的旧 key、丢弃未知/重复列、追加新列、恢复必显列；损坏或无法迁移时重写默认。始终提供重置列。
- 拖拽只用项目内声明的 `@dnd-kit/core` 与 `@dnd-kit/sortable`；同时有 pointer/keyboard sensor、命名手柄、至少 24px 左移/右移按钮和成功位置播报。

## 实施步骤

1. 完整读取 [offset-list-pattern.md](references/offset-list-pattern.md)、[mantine-api.md](references/mantine-api.md)、[checklist.md](references/checklist.md) 与通用 GUI 标准，只检查本次命中的项目事实。
2. 确认下游实际使用 React 19.2+、`@mantine/core >=9.6.1 <10`、`@tanstack/react-query >=5.102.8 <6`；若低于下界，先升级或实现并测试等价 fallback，不能直接复制不兼容 API。
3. 复制并共同适配 `assets/` 中 `ListPage.template.tsx`、`listPageState.ts`、`listPageTypes.ts`、`ListColumnSettings.tsx`、CSS module 及声明；契约测试作为下游测试起点，不当成产品测试替代品。
4. 先接类型化路由 adapter 和服务端稳定排序，再接 Query/四态/Table/Pagination，最后按真实需求接选择和列偏好；不为未选能力留下假按钮。
5. 运行项目的 typecheck、相关单元/组件测试和 `node --experimental-strip-types ListPage.contracts.test.ts`；若把契约测试纳入 `tsc`，测试 tsconfig 启用 `allowImportingTsExtensions`。真实浏览器、服务端或 E2E 未运行时明确列为未验证。

## 交付判定

按 [checklist.md](references/checklist.md) 逐项记录 `Required`、`Conditional` 或带理由的 `N/A`。任何 Required 或已触发 Conditional 项失败，都不能声称列表页通过；纯审查只报告证据，不修改实现。
