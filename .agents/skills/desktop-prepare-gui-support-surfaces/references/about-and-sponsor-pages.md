# 关于页、赞助页与品牌媒体集成

本参考适用于所有已选择 GUI 的下游。`assets/brand-support/` 是产品家族共享品牌依赖，不是来源下游产品实例；固定侧栏、设置页、关于页、赞助页及其应用导航入口随 GUI 初始化自动建立，更新视觉仍需独立选择。

## 资产包内容

| 路径 | 作用 | 进入应用 bundle 的条件 |
|---|---|---|
| `brand-support-profile.json` | 品牌名称、窗口/支持联系人、三档价格、支付码和资源相对路径 | GUI 初始化默认事实来源 |
| `media-manifest.json` | 13 个图片的 MIME、尺寸、字节数、SHA-256、用途和敏感性 | 不复制到运行时；构建前后用于核验 |
| `i18n/zh-CN.json`、`i18n/en-US.json` | 关于作者/联系人/免责声明、固定赞助文案、权益与媒体替代文本 | GUI 初始化注册 `brandSupport` namespace |
| `rust-i18n/zh-CN.yml`、`rust-i18n/en-US.yml` | 托盘“显示窗口/退出”原生文案 | GUI 初始化复制到 Rust locale 目录 |
| `react/AboutPageTemplate.tsx` | 注入当前产品名/版本/区块/动作，固定显示作者、联系方式和免责声明 | GUI 初始化默认页面 |
| `react/SponsorPageTemplate.tsx` | 响应式展示固定品牌赞助内容与双支付码 | GUI 初始化默认页面 |
| `react/SupportMedia.tsx` | 统一本地图片与带字幕/文字稿的视频边界 | 页面需要媒体 |
| `react/BrandUpdaterBanner.tsx` | 只渲染本地品牌 banner | 选择更新视觉 |
| `react/AppSidebarTemplate.tsx` | 默认收起的固定左侧菜单、顶部 Logo→版本、顶部功能区和贴底支持区 | GUI 初始化默认壳层 |
| `react/SettingsPageTemplate.tsx` | 当前版本、中英文、手动检查更新状态和统计同意 | GUI 初始化默认页面 |
| `react/MandatoryUpdateGateTemplate.tsx`、`react/updatePresentation.ts` | 根级强更门和稳定更新展示状态 | GUI 初始化保留；产品配置 updater 后接线 |
| `react/supportNavigation.ts` | 固定 `/sponsor`、`/settings`、`/about` 菜单项、翻译键和稳定 ID | GUI 初始化默认导航 |
| `react/SupportSurfaceTemplates.test.tsx` | 页面、支付码、响应式危险回归和视频约束的非空测试 | 复制模板后按项目测试结构迁移 |
| `media/sponsor/*` | 12 个原始赞助资源，含支付码和当前未引用小图 | GUI 初始化时整体复制 |
| `media/updater/banner.jpg` | 原始品牌更新 banner | 选择更新视觉时复制 |

不要修改 Skill 内原始媒体来适配某个产品。若品牌事实更新，必须由项目负责人确认后同步替换源文件、profile、manifest、翻译与测试；若只是产品页面布局变化，在下游组件中修改并保留品牌源资产。

## 集成步骤

1. GUI 初始化直接接入固定本地标题、可收起侧栏、设置页、关于页和赞助页，不创建产品实例文档。只有修改默认内容、增加其他界面或启用出站能力时，才从 `GUI_SUPPORT_SURFACES.template.md` 创建差异文档；模板根本身仍不得出现 `docs/GUI_SUPPORT_SURFACES.md`。
2. 把 `brand-support-profile.json` 作为唯一品牌结构事实；不得在 About、Sponsor、标题或其他组件各写一份联系人/价格常量。
3. 将 Sidebar、Settings、About、Sponsor、MandatoryUpdateGate 与更新展示类型复制到产品前端并建立 `/settings`、`/about`、`/sponsor` 文件路由。侧栏 Jotai 状态以 `DEFAULT_SIDEBAR_COLLAPSED = true` 初始化，顶部始终先渲染 GUI 身份流程选中的 `/app-identity/logo.png`、再渲染当前版本；功能项从顶部向下增长，固定底部按赞助、设置、关于渲染。展开和折叠时 Logo 与版本都直接可见。保留 Mantine、响应式 `SimpleGrid`、本地路径校验、图片替代文本以及视频 captions/transcript 约束。
4. 把两份 JSON 合并或注册为初始化 i18next 的 `brandSupport` namespace，并把两份 `rust-i18n/*.yml` 复制到 GUI adapter 的 locale 目录。默认语言仍来自 `tauri-plugin-os` 探测和用户持久语言偏好；Rust 托盘与 React 必须消费同一解析结果，不能建立第二套语言状态。
5. 初始化完整复制 `media/sponsor/*` 到前端 public 的 `/brand-support/sponsor/`，不优化、压缩、重绘或重编码支付二维码。只有选择更新视觉时才复制 banner 到 `/brand-support/updater/banner.jpg`。
6. 使用 manifest 复核每个进入项目的文件。当前未引用的 arrow、icon1 至 icon4、select 也必须随赞助品牌源包保留，不能因 tree-shaking 或“清理未使用文件”从 Skill/下游品牌源目录删除。
7. 产品构建默认纳入完整 sponsor 运行时媒体，但未选择更新视觉时不得打包 banner；静态支付材料不得被解释为订单、权益、账户或付款状态。
8. Mantine 根使用 `defaultColorScheme="auto"`，同时打包亮色和暗色 token；Sponsor 通过 `useComputedColorScheme` 选择明确的背景叠层、surface 与对比色，不依赖只在部分 WebView 生效的新 CSS 运行时函数，也不把初始化宿主的当前主题固化到产物。初始化运行模板非空测试、路由/导航、亮色/暗色、键盘和媒体摘要检查；生产构建和最终 `dist` 扫描只在显式构建或对应治理事件触发。真实候选验收仍只在里程碑触发。

## 关于页约束

- 产品名称、版本、标语、功能、许可、隐私和可选动作来自当前下游权威事实。固定作者、作者联系方式和免责声明来自品牌包；模板不含任何来源产品名称或功能清单，固定路由为 `/about`。
- 版本由当前打包元数据提供，不在组件或翻译文件中写死。检查更新、反馈、许可与隐私是独立可选动作；未选择时不渲染占位按钮。赞助入口由固定 `/sponsor` 路由和应用导航承载，不需要在关于页重复为按钮。
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

- 关于页：注入一个非来源产品名和动态版本；验证固定作者、联系人、三段免责声明、可选动作/区块的存在与缺失、主题、键盘和翻译回退。
- 赞助页：分别以亮色和暗色渲染，验证有效主题标记、不同背景/surface、19/199/1999、品牌联系人、三张档位图、两张有 alt 的支付码、响应式列数，以及源码没有固定 800px/全页 pointer-events。
- 媒体：13 个源文件逐项核对路径、MIME、尺寸、字节数和 SHA-256；支付码必须逐字节相同，当前未引用小图必须存在。
- 视频组件：验证 controls 为 true、autoplay 为 false、captions track 和 transcript 链接存在，并拒绝远程/跳转路径。
- 更新 banner：只验证本地可访问图片；没有批准更新检查时网络请求计数保持为零。
