# NSH GUI 标准

`standard_id = nsh-gui-common-v1`，新项目匹配根 Cargo `interfaces = ["nsh"]`；既有 `interfaces = ["gui"]`、`gui-framework = "nsh"` 保留读取兼容。`nsh-targets` 决定 desktop/mobile/web/tui 子目标；TUI 仅使用固定官方 `main` 预览 revision，正式 NSH 0.4.0 不含此目标。

先应用 [共用基座](ui_foundation.md)。desktop、mobile、Web、TUI 均使用 Mixed 模式：TSX 组件、NSH `nsh/base` 语义控件、reactive signal 和 Rust native module；共享业务规则留在 Rust core。所有颜色、字号、间距和断点集中在 TSX Token。TSX 是 NSH 自有运行时，不套用 Tauri CSS、Mantine、React hooks 或 GPUI Entity 合同。

TSX 根组件拥有页面会话，切页保留，退出重置；语言、三态主题及详细侧栏折叠使用独立 NSH Storage 偏好，失败须可见。系统语言来自 `locale()`，用户选择优先，中文/英文和未知语言回退完整。界面文字进入同一翻译模块。控件自身拥有动作，周围容器不代理点击。

desktop 子目标使用左侧栏和固定多窗口，并处理九字段桌面 profile：系统托盘、系统通知、自启、关于页、赞助页、单实例、深链接、全局快捷键、侧栏模式。可选项按字段逐项询问；托盘、单实例、深链接、自启按选择接线，深链接依赖单实例；系统通知和 OS 全局快捷键仍 unavailable/disabled，由能力限制派生关闭。已选关于、赞助和侧栏模式只作用于 desktop。mobile/Web 不询问桌面 profile，消费安全区并允许窄屏导航回流；中央 Token 管理宽窄变化。功能项向下增长，底部按已选赞助、固定设置、已选关于排列。compact 保留可访问名称；detailed 允许独立持久折叠。固定设置显示语言与三态主题，只有选择自启时增加真实 OS 状态开关。禁用页面没有组件/菜单/资源。条件赞助页复用项目本地品牌媒体与声明，不能用标题占位冒充完整支持页。

desktop 的 `host.call` 只用于原生窗口、自启状态和已选深链接；单实例、托盘留在宿主，TSX 不复制 OS 状态机。macOS 应用菜单在当前所有者窗口设置并在关闭后移交；Windows/Linux 各窗口独立设置菜单。窗口列表与操作使用固定宿主协议；深链接先由宿主排队、通知可领取，再由 TSX 在订阅后主动领取，避免窗口刚创建时丢事件；已关闭窗口的未领取项转给存活窗口。深链接只恢复窗口，不承担产品路由。初始化用真实 Rust 测试、NSH Mixed 测试和当前宿主 Computer Use 检查菜单、主题、双语、侧栏、窄屏与关闭；Web 另外以实际静态包浏览器检查。不可把 headless 测试或 neutral scaffold 当产品候选验收。平台能力与打包边界见 `$desktop-add-nsh-adapter` 的运行时引用。

TUI 只在 macOS、Windows、Linux 终端使用同一 Mixed TSX 模板和共享 Rust core，`platform.idiom === "terminal"` 时不得调用桌面自定义宿主的窗口、托盘、自启或深链接协议。跨桌面、移动、Web 与终端共用的产品主视图和 Rust core 调用放在 `App.shared.tsx`；各入口导入该模块，后续共用内容只在此维护。与 desktop 同选时生成独立 `App.tui.tsx` 作为终端入口，源文件不包含 `nsh/desktop`、`host.call` 或桌面专属页面；受管暂存入口同时移除 `capabilities.host`。终端以字符 Cell 布局，键盘焦点、Tab/方向键、Enter/Escape 和可用鼠标输入遵循 [固定 main 提交的 TUI 指南](https://github.com/longbridge/nsh/blob/beeb9fc7707e0d4a195a4f7274f77b30e134c500/website/docs/tui.md)；颜色消费终端可表达的主题语义，不靠桌面像素尺寸或悬停完成关键任务。TUI-only 不创建九字段桌面 profile；原生桌面能力只在窗口宿主生效。TUI 的实际运行和终端恢复须在目标终端单独检查，headless 渲染测试不能代替交互验收。
