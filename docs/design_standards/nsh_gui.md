# NSH GUI 标准

`standard_id = nsh-gui-common-v1`，新项目匹配根 Cargo `interfaces = ["nsh"]`；既有 `interfaces = ["gui"]`、`gui-framework = "nsh"` 保留读取兼容。`nsh-targets` 仅支持 desktop/mobile/web/tui；统一正式 0.5.0 固定提交 `f4d68f7f9f31eb7b3ecc8a4cbc31096d5c6238a1`。

desktop、mobile、Web 图形目标先应用 [共用基座](ui_foundation.md)。三类目标均使用 Mixed 模式：TSX 组件、NSH `nsh/base` 语义控件、reactive signal 和 Rust native module；共享业务规则留在 Rust core。颜色、字号、间距和断点集中在 TSX Token。TSX 是 NSH 自有运行时，不套用 Tauri CSS、Mantine、React hooks 合同。

TSX 根组件拥有页面会话，切页保留，退出重置；语言与三态主题使用独立 NSH Storage 偏好，desktop 详细侧栏折叠另存偏好，失败须可见。系统语言来自 `locale()`，用户选择优先，中文/英文和未知语言回退完整。界面文字进入同一翻译模块。控件自身拥有动作，周围容器不代理点击。

desktop 子目标使用左侧栏和固定多窗口，并处理九字段桌面 profile：系统托盘、系统通知、自启、关于页、赞助页、单实例、深链接、全局快捷键、侧栏模式。初始化按托盘、单实例、有条件的深链接、关于页、赞助页、侧栏模式逐项询问。托盘、单实例、深链接按选择接线，深链接依赖单实例。自启、系统通知和 OS 全局快捷键在中性模板固定关闭，由能力限制派生关闭。已选关于、赞助和侧栏模式只作用于 desktop。mobile/Web/TUI 不询问桌面 profile。mobile 无论屏幕宽度都采用竖向壳层：顶部只保留品牌标题，内容独立滚动，首页与设置用位于滚动区之后的固定底部导航切换，不在顶部重复菜单；两个等宽语义按钮使用至少 48 点触控高度、可访问名称及明显选中态。底栏消费 `safeArea().bottom/left/right`，内容不重复消费底部安全区；顶部标题消费 `safeArea().top`，横向内容也避开安全区。`nsh.json` 的 `statusBar.foreground = auto` 配合 `capabilities.statusBar = true` 让状态栏图标随应用主题切换。Web 继续按窗口宽度回流导航，不申请移动状态栏能力。中央 Token 管理宽窄变化。桌面侧栏分为品牌标题、主导航和底部辅助导航，功能项向下增长，底部按已选赞助、固定设置、已选关于排列；选中项同时使用形状标记和底色，并由语义按钮暴露选中与键盘焦点状态。compact 保留可访问名称；detailed 允许独立持久折叠，窄窗口回流时恢复完整产品名。固定设置显示语言与三态主题。禁用页面没有组件/菜单/资源。条件赞助页复用项目本地品牌媒体与声明，不能用标题占位冒充完整支持页。

desktop/mobile/Web 的设置页共用一致的页面宽度、节奏与语义控件：语言和主题分成有标题、说明的卡片区域，用 `nsh/base` 单选组呈现当前选择、键盘焦点及切换状态。桌面关于页按联系信息、更新日志和免责声明分区，保留多段声明与双语内容；更新日志折叠状态可操作。桌面赞助页按项目已有品牌资料、档位与支付媒体生成，档位突出插图、名称、价格和权益；内容宽度扣除侧栏及滚动容器内边距，随窗口在一至三列回流，二维码在窄窗口不被裁切。三页的字号、间距、圆角和断点由共用 Token 控制，不在页面里散布独立常数；生成的文案、作者、金额与媒体只取当前项目已确认资料，不把示例项目内容写入模板。

桌面多窗口与菜单使用官方 `nsh/desktop`，托盘关闭隐藏由 `WindowRef` 与 `Tray` 接线，单实例和 URL Scheme 由官方应用配置注册。深链接只消费固定恢复 URL，不承担产品导航。初始化用真实 Rust/NSH 测试及对应目标宿主验证。终端以 `platform.idiom === "terminal"` 进入紧凑布局，不应用桌面侧栏、菜单和 Logo；按项目官方 `nsh-design-guides` 与 [NSH TUI 指南](https://github.com/longbridge/nsh/blob/v0.5.0/website/docs/tui.md) 检查键盘操作和 Cell 布局。
