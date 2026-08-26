# 关于页、赞助页与品牌媒体集成

本参考适用于所有已选择 GUI 的下游。`assets/brand-support/` 是产品家族共享品牌依赖，不是来源下游产品实例；固定侧栏、设置页、关于页、赞助页及其应用导航入口随 GUI 初始化自动建立，更新视觉仍需独立选择。

## 资产包内容

| 路径 | 作用 | 进入应用 bundle 的条件 |
|---|---|---|
| `brand-support-profile.json` | 品牌名称、窗口/支持联系人、三档价格、支付码和资源相对路径 | GUI 初始化默认事实来源 |
| `media-manifest.json` | 13 个图片的 MIME、尺寸、字节数、SHA-256、用途和敏感性 | 不复制到运行时；构建前后用于核验 |
| `i18n/zh-CN.json`、`i18n/en-US.json` | 关于作者/联系人/免责声明、固定赞助文案、权益与媒体替代文本 | GUI 初始化注册 `brandSupport` namespace |
| `rust-i18n/zh-CN.yml`、`rust-i18n/en-US.yml` | 托盘“显示窗口/退出”原生文案 | GUI 初始化复制到 Rust locale 目录 |
| `react/AboutPageTemplate.tsx` | 注入当前产品名/版本/区块/动作、更新状态与发布日志，固定显示检查更新、更新日志、作者、联系方式和免责声明 | GUI 初始化默认页面 |
| `react/ReleaseNotesDialogTemplate.tsx`、`react/releaseNotes.ts` | 读取候选内同一发布事实，按固定结构展示最近 5 版且每类最多 10 条 | GUI 初始化默认页面 |
| `react/displayVersion.ts` | 把所有人类可见版本规范化为且只规范化为一个小写 `v` 前缀 | GUI 初始化默认展示边界 |
| `react/SponsorPageTemplate.tsx` | 响应式展示固定品牌赞助内容与双支付码 | GUI 初始化默认页面 |
| `react/SupportMedia.tsx` | 统一本地图片与带字幕/文字稿的视频边界 | 页面需要媒体 |
| `react/BrandUpdaterBanner.tsx` | 只渲染本地品牌 banner | 选择更新视觉 |
| `react/AppSidebarTemplate.tsx` | `136px` 单态固定左侧菜单、顶部 `56px` Logo→版本、`30px` 图标上方/`11px` `10em` 居中文字、顶部功能区和贴底支持区 | GUI 初始化默认壳层 |
| `react/AppThemeProviderTemplate.tsx` | 唯一 Mantine provider、三态本地偏好及亮暗背景/surface/文字/边框/强调色 | GUI 初始化默认根壳层 |
| `react/SettingsPageTemplate.tsx` | 当前版本、中英文和浅色/深色/跟随系统；不含隐私或统计区块 | GUI 初始化默认页面 |
| `react/MandatoryUpdateGateTemplate.tsx`、`react/updatePresentation.ts` | 根级强更门和稳定更新展示状态 | GUI 初始化保留；产品配置 updater 后接线 |
| `react/supportNavigation.ts` | 固定 `/sponsor`、`/settings`、`/about` 菜单项、翻译键和稳定 ID | GUI 初始化默认导航 |
| `react/SupportSurfaceTemplates.test.tsx` | 页面、支付码、响应式危险回归和视频约束的非空测试 | 复制模板后按项目测试结构迁移 |
| `media/sponsor/*` | 12 个原始赞助资源，含支付码和当前未引用小图 | GUI 初始化时整体复制 |
| `media/updater/banner.jpg` | 原始品牌更新 banner | 选择更新视觉时复制 |

不要修改 Skill 内原始媒体来适配某个产品。若品牌事实更新，必须由项目负责人确认后同步替换源文件、profile、manifest、翻译与测试；若只是产品页面布局变化，在下游组件中修改并保留品牌源资产。

## 集成步骤

1. GUI 初始化直接接入固定本地标题、单态侧栏、精简设置页、关于页和赞助页，不创建产品实例文档。只有修改默认内容、增加其他界面或启用出站能力时，才从 `GUI_SUPPORT_SURFACES.template.md` 创建差异文档；模板根本身仍不得出现 `docs/GUI_SUPPORT_SURFACES.md`。
2. 把 `brand-support-profile.json` 作为唯一品牌结构事实；不得在 About、Sponsor、标题或其他组件各写一份联系人/价格常量。
3. 将 ThemeProvider、Sidebar、Settings、About、ReleaseNotesDialog、Sponsor、MandatoryUpdateGate、展示版本 formatter 与更新展示类型复制到产品前端并建立 `/settings`、`/about`、`/sponsor` 文件路由。侧栏固定为 `136px` 单态，不建立 Jotai 折叠状态或切换按钮；顶部始终先渲染 GUI 身份流程选中的 `56px` `/app-identity/logo.png`、再渲染带一个小写 `v` 的当前版本；功能项从顶部向下增长，固定底部按赞助、设置、关于渲染。每项必须注入 `30px` 图标，并以图标在上、`11px` 文字在下的方式在 `10em` 行内宽度内居中显示，允许两行且始终保留完整可访问名称，不得用 Tooltip 代替可见名称。设置页只保留应用/版本、语言与三态主题，不得加入隐私或统计区块。关于页把“更新日志”按钮紧邻“检查更新”，从候选资源中的同一 `release-notes.json` 展示近 5 版固定结构。保留 Mantine、响应式 `SimpleGrid`、本地路径校验、图片替代文本以及视频 captions/transcript 约束。
4. 把两份 JSON 合并或注册为初始化 i18next 的 `brandSupport` namespace，并把两份 `rust-i18n/*.yml` 复制到 GUI adapter 的 locale 目录。默认语言仍来自 `tauri-plugin-os` 探测和用户持久语言偏好；Rust 托盘与 React 必须消费同一规范化 locale 结果，不能建立第二套语言状态。托盘可见标签必须用 `rust_i18n::t!("tray.show_window")` 与 `rust_i18n::t!("tray.quit")` 解析，稳定 ID 不得直接显示；中文为“显示窗口/退出”，英文为“Show Window/Quit”，未知 locale 回退英文，运行时语言切换必须刷新已安装菜单而无需重启。
5. 初始化完整复制 `media/sponsor/*` 到前端 public 的 `/brand-support/sponsor/`，不优化、压缩、重绘或重编码支付二维码。只有选择更新视觉时才复制 banner 到 `/brand-support/updater/banner.jpg`。
6. 使用 manifest 复核每个进入项目的文件。当前未引用的 arrow、icon1 至 icon4、select 也必须随赞助品牌源包保留，不能因 tree-shaking 或“清理未使用文件”从 Skill/下游品牌源目录删除。
7. 产品构建默认纳入完整 sponsor 运行时媒体，但未选择更新视觉时不得打包 banner；静态支付材料不得被解释为订单、权益、账户或付款状态。
8. Mantine 根使用 `defaultColorScheme="auto"`、显式 local-storage manager 和唯一 CSS variables resolver，同时为亮色和暗色定义页面背景、surface、主/次文字、边框与强调色；设置页提交 `light`/`dark`/`auto`。Sponsor 通过 `useComputedColorScheme` 选择明确的背景叠层、surface 与对比色，不依赖只在部分 WebView 生效的新 CSS 运行时函数，也不把初始化宿主的当前主题固化到产物。初始化运行模板非空测试、路由/导航、三态主题、亮色/暗色语义、键盘和媒体摘要检查；生产构建和最终 `dist` 扫描只在显式构建或对应治理事件触发。真实候选验收仍只在里程碑触发。

## 关于页约束

- 产品名称、版本、标语、功能、许可、隐私和可选动作来自当前下游权威事实。固定作者、作者联系方式和免责声明来自品牌包；模板不含任何来源产品名称或功能清单，固定路由为 `/about`。
- 版本由当前打包元数据提供，不在组件或翻译文件中写死；所有可见位置调用共享 formatter，先去除已有 `v`/`V` 再添加一个小写 `v`。手动检查更新和稳定状态固定存在；未配置时检查按钮禁用、状态为 `NotConfigured` 且零出站，本地更新日志按钮仍可用。更新日志按最新在前最多显示 5 版，每版“###功能优化”和“###问题修复”各最多 10 条且空分类显示“无”，标题固定为 `-----------更新日志 {发布日期} {发布版本}----------`。反馈、许可与隐私仍是独立可选动作，未选择时不渲染占位按钮。赞助入口由固定 `/sponsor` 路由和应用导航承载，不需要在关于页重复为按钮。
- “检查更新”和“更新日志”的事件只绑定各自 Button；更新区 Paper/Group 不代理动作。其他按钮、链接、`Switch`、`Checkbox` 同样绑定在自身，Card、`Table.Tr`、`Table.Td` 等父级不得代理；表格行点击不能切换行内 `Switch`。
- 作者显示名使用 `about.studio`，联系人使用 profile 的 `contacts.support`；窗口标题使用独立的 `contacts.windowTitle`，两个角色即使当前值相同也不能混用。
- 三段免责声明必须完整显示并接入中英文 `brandSupport` 翻译；不得因产品没有其他关于区块而隐藏或改成占位文案。
- 外部链接经 Tauri 窄命令或系统浏览器打开并验证 scheme/host；模板本身不持有 endpoint、网络 client 或秘密。

## 赞助页约束

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

- 关于页：注入一个非来源产品名、动态版本、更新状态与 6 版/11 条边界夹具；验证手动检查、`NotConfigured` 禁用、本地更新日志仍可用、只显示近 5 版/每类 10 条、版本恰有一个 `v`、父容器点击不代理两个按钮、固定作者、联系人、三段免责声明、可选动作/区块的存在与缺失、主题、键盘和翻译回退。
- 设置与壳层：验证中英文、浅色/深色/跟随系统回调与持久化、亮暗背景/文字/surface 差异，默认设置页没有隐私/统计控件或翻译键，以及侧栏 `136px` 单态、`56px` Logo、`30px` 图标、图标上/文字下、`11px`/`10em` 名称和独立可访问名称。
- 托盘 i18n：验证中英文精确标签、未知 locale 英文回退、运行时语言切换刷新，以及任何 `tray.*` 原始键都不能成为可见菜单文字。
- 赞助页：分别以亮色和暗色渲染，验证有效主题标记、不同背景/surface、19/199/1999、品牌联系人、三张档位图、两张有 alt 的支付码、响应式列数，以及源码没有固定 800px/全页 pointer-events。
- 媒体：13 个源文件逐项核对路径、MIME、尺寸、字节数和 SHA-256；支付码必须逐字节相同，当前未引用小图必须存在。
- 视频组件：验证 controls 为 true、autoplay 为 false、captions track 和 transcript 链接存在，并拒绝远程/跳转路径。
- 更新 banner：只验证本地可访问图片；没有批准更新检查时网络请求计数保持为零。
