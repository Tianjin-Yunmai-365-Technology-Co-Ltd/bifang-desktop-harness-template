# Tauri GUI 侧栏实现合同

本合同叠加于 [UI 统一设计基座](ui_foundation.md) 与 [Tauri GUI 实现](tauri_gui.md)，只定义壳层模式、导航语义和状态同步。侧栏属于 GUI adapter；旧的独立像素表与密度硬锁已移除。

## 视觉唯一来源

`react/appDesignTokens.ts` 中的 `APP_LAYOUT_TOKENS.sidebar` 集中定义宽度、Logo、图标、名称排版、间距和交互尺寸。`AppSidebarTemplate` 只导出这些 Token 的具名引用，AppShell 与测试消费同一来源；普通主题调整不要求为旧像素另建例外。颜色由根主题 CSS 语义 Token 提供，不在侧栏独立选色。

## 共同结构

从上到下为应用身份与版本、分隔线、可滚动产品功能区、分隔线和固定支持区。中性脚手架只有本地化首页；支持菜单顺序为已选赞助 → 固定设置 → 已选关于。未选页面不得出现。

- 侧栏 fixed、高度 `100dvh`、语义边框；AppShell 的 `navbar.width` 与侧栏宽度来自同一状态。Navbar padding 为零，内容不叠加第二份宽度偏移。
- 使用 `@tabler/icons-react` 命名图标与真实 NavLink/button；所有文案进入 i18n，当前路由由导航项自身的 active 表达，完整名称可被辅助技术读取。
- Logo 来自已选本地身份，版本通过统一展示函数输出；事件只由实际控件拥有，身份区不能代理折叠或导航。

## 精简模式

`standard_id = tauri-gui-sidebar-compact-80-v1`

`sidebar_mode = compact`：图标在上、名称在下，名称持续可见且居中自然换行。身份、图标和名称共用中心线，不使用固定 `em/ch` 名称占位盒，不裁切文本。此模式无折叠状态、按钮或持久化。

实际 AppShell 传入 `mode="compact"`，宽度读取 `APP_SIDEBAR_WIDTHS.compact`。菜单 body/label 使用可用全宽、允许换行；left section 的附加横向间距归零，不能挤歪中心线。

## 详细模式

`standard_id = tauri-gui-sidebar-detailed-v1`

`sidebar_mode = detailed`：展开时图标与名称横排；收起时隐藏可见名称，以右侧 Tooltip 补充并始终保留可访问名称。展开/收起宽度和 Logo 来自当前 Token，不借用精简模式尺寸。

- `DEFAULT_DETAILED_SIDEBAR_COLLAPSED = false`；独立 `APP_SIDEBAR_COLLAPSED_STORAGE_KEY` 只保存设备展示偏好。缺失、非法或不可读取时安全展开，不进入 core、页面会话 store、URL 或 Query。
- AppShell 以 `readDetailedSidebarCollapsed()` 初始化状态，并使用 `detailedSidebarNavbarWidth(collapsed)` 同时驱动侧栏、`navbar.width` 与 `data-navbar-width`。
- 侧栏只接收 `detailedCollapsed` 和 `onCollapsedChange`；折叠 ActionIcon 发出变化，AppShell 更新状态并调用 `persistDetailedSidebarCollapsed`。父级身份区不能代理此动作。
- 展开态 `data-navigation-layout="icon-with-label"`，收起态 `icon-only`；只在隐藏名称时使用 Tooltip，延时来自主题 Token。

## 最小检查

按真实变更验证 Token 引用、当前模式、同源宽度、父容器事件隔离、支持项顺序、键盘焦点、名称和长文案回流。组件测试从 Token 取得期望尺寸，不能把已退役的像素表重新写成门禁。

真实初始化检查仍按所选 GUI 初始化流程执行；源码合同和模板测试不能代替可见窗口验证。产品信息架构或新的设计方向改变时，才按设计索引处理相应确认与记录。
