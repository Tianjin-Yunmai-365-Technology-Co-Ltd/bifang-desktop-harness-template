# UI 设计标准目录

本目录是 Harness 及其下游项目选择、实现和复核 UI 设计标准的唯一索引。技术栈、运行时与 core-first 边界仍分别由 `docs/RUST_CLI_TEMPLATE.md` 和 `docs/ENGINEERING_RULES.md` 管理；本目录只管理用户可见的布局、组件语义、交互、可访问性和视觉密度。

## 路由顺序

初始化或修改 UI 时按以下顺序解析，不得先套用旧模板再局部修补：

1. 读取 `docs/GUI_APP_PROFILE.md`、当前用户请求和已批准 ADR，确定接口、框架、壳层、`sidebar_mode`、已选支持页和产品专属约束。
2. 所有 GUI 先完整读取 [UI 统一设计基座](ui_foundation.md)，再从本索引选择所有前置条件都精确命中的框架和组件标准；只满足相似条件不算命中。根 `DESIGN.md` 仅作导航；既有下游没有此入口时直接使用本索引。
3. 当前 UI 基座是唯一视觉规则来源。框架、组件、第三方知识与旧 profile/ADR 只保留相容的实现和行为合同；发生冲突时修改或删除旧内容，不以“更具体”为由覆盖基座。用户之后明确批准的新设计仍可修订当前规则。
4. 现有框架标准未列出的页面直接按基座与真实需求设计；不为普通 Token 调整重开批准流程。只有改变已批准产品边界、信息架构或引入新的设计方向时确认并同步适用 profile/ADR；旧像素不再构成独立风格门禁。
5. 只把最终命中的规则下发到对应 adapter 展示层。UI 布局、主题和纯交互状态不得下沉到 shared core。

## 标准索引

| 匹配条件 | 标准 | 当前标识 |
|---|---|---|
| 所有 GUI 的页面、组件与展示层 | [UI 统一设计基座](ui_foundation.md) | `ui-foundation-v1` |
| 所有 GUI 中按行列浏览重复记录的数据网格 | [通用 Grid 数据网格标准](data_grid.md) | `data-grid-v1` |
| Tauri 2 + React + Mantine GUI | [Tauri GUI 通用设计标准](tauri_gui.md) | `tauri-gui-common-v1` |
| `gui-framework = "gpui"` + 原生 GPUI/gpui-kit GUI | [GPUI GUI 设计标准](gpui_gui.md)；托盘/通知/自启/单实例/热键的实现与平台限制另见 `$desktop-add-gpui-adapter` 的 `references/native-capabilities.md`，依赖选型见 `references/dependency-baseline.md` | `gpui-gui-common-v1` |
| React 19.2+ + TypeScript + Mantine UI 9.x + 重复记录检索/浏览/管理 | [Mantine 列表页设计标准](mantine_list_view.md) | `mantine-list-view-v2` |
| 上述 GUI + 固定左侧栏 + `sidebar_mode = compact` | [Tauri GUI 左侧栏标准](tauri_sidebar.md#精简模式) | `tauri-gui-sidebar-compact-80-v1` |
| 上述 GUI + 固定左侧栏 + `sidebar_mode = detailed` | [Tauri GUI 左侧栏标准](tauri_sidebar.md#详细模式) | `tauri-gui-sidebar-detailed-v1` |

所有界面先遵守共用基座；专项文档只映射相容的框架机制、组件行为和状态合同。Token 语义由基座定义，各应用的实际值只在中央主题 Token 模块维护，专项文档不再并列规定颜色、字号、圆角或展示尺寸。

桌面框架从根 Cargo metadata 的 `gui-framework` 读取，既有 GUI 缺失时按 `tauri` 兼容。GPUI 在共用基座之上只叠加 GPUI 专项标准；Tauri 的 AppShell、Mantine 列表、WebView、Tabler React 与 CSS 接线不因同属 GUI 而适用于 GPUI。

## 变更治理

- 当前基座中的复用、语义 Token、分层与一致性约束统一生效。控件事件所有权、可访问名称及必要无障碍数值继续是硬约束；模板展示尺寸是主题默认值，不再锁定为另一套风格。
- 用户明确改变产品设计方向或信息架构时，按真实事件记录 profile/ADR。Harness 源只维护中性规则、模板和传播入口，不创建虚假的产品 profile。
- 新标准应使用稳定标识，写清精确匹配条件、与其他标准的组合关系、实现边界和最小回归。不要用“更紧凑”“类似桌面应用”等无法机械复核的描述代替数值或语义。
- 其他规范、Skills 和模板只保留路由、技术补充或摘要，并链接回本目录；不要再复制一套可能漂移的 UI 像素事实。
