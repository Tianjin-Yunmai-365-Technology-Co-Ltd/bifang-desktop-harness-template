# 关于页、赞助页与品牌媒体集成

本参考适用于所有已选择 GUI 的下游。`assets/brand-support/` 是产品家族共享品牌依赖，不是来源下游产品实例；设置页与全局主题固定建立，关于页、赞助页、系统托盘、系统通知、开机自启、单实例、深链接、全局快捷键和侧栏模式则严格消费 GUI 初始化专门问询写入 `docs/GUI_APP_PROFILE.md` 的九项选择。system-locale、updater、window-state 三项 Rust-only 基线与 dialog WebView 基线不询问且始终接入；dialog 只授予精确 `dialog:default`，真实更新视觉仍需独立产品选择。

## 资产包内容

| 路径 | 作用 | 进入应用 bundle 的条件 |
|---|---|---|
| `brand-support-profile.json` | 品牌名称、窗口/支持联系人、三档价格、支付码和资源相对路径 | GUI 初始化默认事实来源 |
| `react/brandSupportProfile.ts` | 把 `brand-support-profile.json` 解析为类型化 `BrandSupportProfile`，并提供窗口标题与本地支持路径校验 helper | GUI 初始化默认导入；供 About/Sponsor/Updater/SupportMedia 消费，是本表其余 React 模板读取品牌事实的唯一入口 |
| `media-manifest.json` | 13 个图片的 MIME、尺寸、字节数、SHA-256、用途和敏感性 | 不复制到运行时；构建前后用于核验 |
| `i18n/zh-CN.json`、`i18n/en-US.json` | 壳层、关于作者/联系人/免责声明、赞助文案、权益与媒体替代文本 | GUI 初始化注册 `brandSupport` namespace；未选页面不注册对应路由 |
| `rust-i18n/zh-CN.yml`、`rust-i18n/en-US.yml` | 托盘“显示窗口/退出”原生文案 | 仅选择系统托盘时复制到 Rust locale 目录 |
| `rust/release_notes.rs`、`react/releaseNotesResource.ts`、`react/AboutPageTemplate.tsx` | 从候选固定资源异步读取并双层校验发布日志，显示 loading/error/retry、检查更新、更新日志、作者、联系方式和免责声明 | 仅选择关于页时复制并注册窄命令/建立路由 |
| `tauri/tauri.release.conf.json` | 正式构建以 `--config` 合并，把根更新日志唯一映射到候选资源根 | 所有 GUI 保留；中性调试构建不使用 |
| `react/ReleaseNotesDialogTemplate.tsx`、`react/releaseNotes.ts` | 读取候选内同一双语发布事实，按当前 i18n locale 展示最近 5 版且每类最多 10 个翻译对 | 仅选择关于页时进入运行时 |
| `react/displayVersion.ts` | 把所有人类可见版本规范化为且只规范化为一个小写 `v` 前缀 | GUI 初始化默认展示边界 |
| `react/SponsorPageTemplate.tsx` | 响应式展示固定品牌赞助内容与双支付码 | 仅选择赞助页时建立路由 |
| `react/SupportMedia.tsx` | 统一本地图片与带字幕/文字稿的视频边界 | 页面需要媒体 |
| `react/BrandUpdaterBanner.tsx` | 只渲染本地品牌 banner | 选择更新视觉 |
| `react/AppSidebarTemplate.tsx` | compact `80px` 全宽居中竖排菜单，或 detailed 默认 `248px` 展开、可收起为 `76px`；顶部 Logo→版本、顶部功能区和按所选页面生成的贴底支持区 | GUI 初始化按 `sidebar_mode` 与统一侧栏标准建立壳层 |
| `react/AppShellTemplate.tsx` | detailed AppShell 读取独立折叠偏好，并同步 fixed 侧栏、Mantine `navbar.width` 与 `data-navbar-width` | 仅在 `sidebar_mode = detailed` 的运行时接入；compact 不得使用此固定 detailed 壳层 |
| `react/AppThemeProviderTemplate.tsx` | 唯一 Mantine provider、三态本地偏好及亮暗背景/surface/文字/边框/强调色 | GUI 初始化默认根壳层 |
| `react/SettingsPageTemplate.tsx` | 当前版本、中英文和三态主题；按 profile 接入系统通知/开机自启异步 Switch，不含隐私或统计区块 | GUI 初始化默认页面；两个 Switch 仅随对应能力进入运行时 |
| `react/MandatoryUpdateGateTemplate.tsx`、`react/updatePresentation.ts` | 根级强更门和稳定更新展示状态 | 所有 GUI 随 updater 固定基线保留；产品配置真实 updater 后接线 |
| `react/supportNavigation.ts` | 根据选择生成 `/sponsor`、固定 `/settings` 与 `/about` 菜单项、翻译键和稳定 ID | GUI 初始化导航 |
| `react/SupportSurfaceTemplates.test.tsx` | 页面、支付码、响应式危险回归和视频约束的非空测试 | 复制模板后按项目测试结构迁移 |
| `media/sponsor/*` | 12 个原始赞助资源，含支付码和当前未引用小图 | 仅选择赞助页时整体复制 |
| `media/updater/banner.jpg` | 原始品牌更新 banner | 选择更新视觉时复制 |

不要修改 Skill 内原始媒体来适配某个产品。若品牌事实更新，必须由项目负责人确认后同步替换源文件、profile、manifest、翻译与测试；若只是产品页面布局变化，在下游组件中修改并保留品牌源资产。

## 集成步骤

1. GUI 初始化直接接入固定本地标题、按 `sidebar_mode` 选择的侧栏和设置页；`system_notification = enabled`、`autostart = enabled` 时分别接入对应 Switch，未选时从运行时源码与翻译中裁剪；仅为 `about_page = enabled`、`sponsor_page = enabled` 建立相应页面与导航，不创建产品实例文档。
2. 把 `brand-support-profile.json` 作为唯一品牌结构事实；不得在 About、Sponsor、标题或其他组件各写一份联系人/价格常量。
3. 将 ThemeProvider、Sidebar、Settings 与展示版本 formatter 复制到产品前端并固定建立 `/settings`，所有 GUI 同时复制发布专用 `src-tauri/tauri.release.conf.json`。设置页始终保留应用/版本、语言与三态主题；系统通知/开机自启能力启用时分别把 Rust command 状态接到模板可选 prop，禁用时不得复制对应 prop、Switch 或翻译键；不得加入隐私或统计区块。About/ReleaseNotes 只随关于页进入运行时，Sponsor 只随赞助页进入运行时；侧栏继续严格消费统一标准。
4. 把两份 JSON 合并或注册为初始化 i18next 的 `brandSupport` namespace。仅当 `system_tray = enabled` 时，把两份 `rust-i18n/*.yml` 复制到 GUI adapter 的 locale 目录；默认语言仍来自 `tauri-plugin-os` 探测和用户持久语言偏好，Rust 托盘与 React 必须消费同一规范化 locale 结果。托盘可见标签必须用 `rust_i18n::t!("tray.show_window")` 与 `rust_i18n::t!("tray.quit")` 解析，稳定 ID 不得直接显示；中文为“显示窗口/退出”，英文为“Show Window/Quit”，未知 locale 回退英文，运行时语言切换必须刷新已安装菜单而无需重启。
5. 仅当 `sponsor_page = enabled` 时完整复制 `media/sponsor/*` 到前端 public 的 `/brand-support/sponsor/`，不优化、压缩、重绘或重编码支付二维码。只有选择更新视觉时才复制 banner 到 `/brand-support/updater/banner.jpg`。
6. 使用 manifest 复核每个实际进入项目的文件。选择赞助页时，当前未引用的 arrow、icon1 至 icon4、select 也必须随赞助品牌源包保留，不能因 tree-shaking 或“清理未使用文件”从 Skill/下游品牌源目录删除；未选择时不得把 sponsor 媒体复制进运行时 bundle。
7. 选择赞助页的产品构建纳入完整 sponsor 运行时媒体；未选择更新视觉时不得打包 banner。静态支付材料不得被解释为订单、权益、账户或付款状态。
8. Mantine 根使用 `defaultColorScheme="auto"`、显式 local-storage manager 和唯一 CSS variables resolver，同时为亮色和暗色定义页面背景、surface、主/次文字、边框与强调色；设置页提交 `light`/`dark`/`auto`。Sponsor 通过 `useComputedColorScheme` 选择明确的背景叠层、surface 与对比色，不依赖只在部分 WebView 生效的新 CSS 运行时函数，也不把初始化宿主的当前主题固化到产物。初始化运行模板非空测试、路由/导航、三态主题、亮色/暗色语义、键盘和媒体摘要检查；生产构建和最终 `dist` 扫描只在显式构建或对应治理事件触发。真实候选验收仍只在里程碑触发。

## 关于页约束（仅在选择关于页时）

- 产品名称、版本、标语、功能、许可、隐私和可选动作来自当前下游权威事实。固定作者、作者联系方式和免责声明来自品牌包；模板不含任何来源产品名称或功能清单，所选路由为 `/about`。
- 版本由当前打包元数据提供，不在组件或翻译文件中写死；所有可见位置调用共享 formatter，先去除已有 `v`/`V` 再添加一个小写 `v`。手动检查更新和稳定状态随关于页存在；未配置时检查按钮禁用、状态为 `NotConfigured` 且零出站，本地更新日志按钮仍可用。它默认调用 `load_release_notes`，由 Rust 以 `BaseDirectory::Resource` + `tokio::fs` 读取固定资源并验证，React 再从 `unknown` 收窄；禁止路径参数、通用文件系统权限和同步读取。更新日志按最新在前最多显示 5 版，每版两个分类各最多 10 个完整 `zh-CN`/`en-US` 翻译对。中文界面显示“更新日志/功能优化/问题修复/无”，英文或未知语言显示“Release notes/Feature optimizations/Bug fixes/None”，正文也只选择对应 locale；任一翻译缺失必须在 Rust/React 边界失败关闭。反馈、许可与隐私仍是独立可选动作，未选择时不渲染占位按钮。若赞助页已选，其入口由 `/sponsor` 路由和应用导航承载，不在关于页重复为按钮。
- Rust 中包含本地化文本的测试夹具必须用 UTF-8 `str` 后接 `.as_bytes()`，不得使用拒绝非 ASCII 内容的 raw byte string。
- “检查更新”和“更新日志”的事件只绑定各自 Button；更新区 Paper/Group 不代理动作。其他按钮、链接、`Switch`、`Checkbox` 同样绑定在自身，Card、`Table.Tr`、`Table.Td` 等父级不得代理；表格行点击不能切换行内 `Switch`。
- 作者显示名使用 `about.studio`，联系人使用 profile 的 `contacts.support`；窗口标题使用独立的 `contacts.windowTitle`，两个角色即使当前值相同也不能混用。
- 三段免责声明必须完整显示并接入中英文 `brandSupport` 翻译；不得因产品没有其他关于区块而隐藏或改成占位文案。
- 外部链接经 Tauri 窄命令或系统浏览器打开并验证 scheme/host；模板本身不持有 endpoint、网络 client 或秘密。

## 赞助页约束（仅在选择赞助页时）

- 固定价格是 19、199、1999 CNY；档位名称、权益、支付说明和双支付码来自品牌 profile/i18n/媒体，不能静默改成某个产品的促销方案。
- 页面在窄窗单列、中宽双列、宽窗最多三列；不得使用固定 `minWidth: 800`、固定 `cols={3}`、固定 `minHeight: 600` 或全页 `pointerEvents: 'none'`。
- 同一产物必须同时支持亮色与暗色：有效主题来自 Mantine provider，页面背景叠层、卡片 surface、标题/强调色和非透明档位插图承载面分别选择可读值。不得只换文字颜色、只生成一种主题资源或用初始化机器主题决定最终产物。
- 支付二维码不是装饰图，必须分别使用明确支付方式的本地化 `alt`。页面需保留文本形式的联系人和支付说明，不能让二维码成为唯一信息渠道。
- 固定权益是用户可见承诺。发布前人工复核价格、权益、收款主体、联系人和说明仍有效；静态测试不能替代该业务复核。
- 携带或展示二维码不产生付款状态。任何订单、权益发放、账户、回调、自动支付或付款核验都需要新的产品、安全与外部副作用范围。

## 图片与视频约束

- 所有运行时媒体使用应用内本地绝对路径；拒绝远程 scheme、协议相对 URL、反斜杠和 `..` 跳转。更新 banner 也不能从远端动态替换。
- 语义图片必须有本地化替代文本；纯装饰图片显式使用空 alt。CSS 背景只能承载不影响理解的装饰。
- 视频必须由产品拥有或获得明确内部复用批准，使用本地 `src`/poster/captions/transcript，显示 controls，不设置 autoplay，并且页面不依赖动画传达唯一信息。
- 当前品牌包没有视频文件。不得用占位视频、远程演示地址或没有字幕/文字稿的素材冒充已集成资源。

## 最小回归

- 关于页：仅在选择关于页时，除 6 版/11 条防御性显示夹具外，还验证 Rust 资源解析成功/畸形与缺失翻译拒绝、命令注册、前端固定命令名与 IPC 解码、loading/error/retry；再验证手动检查、`NotConfigured` 禁用、本地更新日志仍可用、只显示近 5 版/每类 10 个翻译对、中文与英文 locale 各选择对应正文和标题、未知语言英文回退、版本恰有一个 `v`、父容器点击不代理两个按钮、固定作者、联系人、三段免责声明、可选动作/区块的存在与缺失、主题和键盘。未选择时验证路由、导航、命令、加载器与运行时组件缺席。
- 设置与壳层：验证中英文、浅色/深色/跟随系统回调与持久化、亮暗背景/文字/surface 差异，默认设置页没有隐私/统计控件；系统通知/开机自启分别按选择验证 Switch 自身事件、父级不代理、pending 禁用、成功和失败回滚，未选时控件与翻译键缺席。compact/detailed 继续验证各自完整侧栏合同。
- 托盘 i18n：仅在选择系统托盘时验证中英文精确标签、未知 locale 英文回退、运行时语言切换刷新，以及任何 `tray.*` 原始键都不能成为可见菜单文字；未选择时验证 tray feature、依赖、安装源码和关闭隐藏接线缺席。
- 赞助页：仅在选择赞助页时分别以亮色和暗色渲染，验证有效主题标记、不同背景/surface、19/199/1999、品牌联系人、三张档位图、两张有 alt 的支付码、响应式列数，以及源码没有固定 800px/全页 pointer-events；未选择时验证路由、导航和运行时媒体缺席。
- 媒体：选择赞助页时对 13 个源文件逐项核对路径、MIME、尺寸、字节数和 SHA-256；支付码必须逐字节相同，当前未引用小图必须存在。
- 视频组件：验证 controls 为 true、autoplay 为 false、captions track 和 transcript 链接存在，并拒绝远程/跳转路径。
- 更新 banner：只验证本地可访问图片；没有批准更新检查时网络请求计数保持为零。
