# 关于页、赞助页与品牌媒体集成

本参考只适用于已选择 GUI 且产品明确选择关于、赞助或更新视觉的下游。`assets/brand-support/` 是产品家族共享品牌依赖，不是来源下游产品实例，也不是选择 GUI 后自动出现的页面。

## 资产包内容

| 路径 | 作用 | 进入应用 bundle 的条件 |
|---|---|---|
| `brand-support-profile.json` | 品牌名称、窗口/支持联系人、三档价格、支付码和资源相对路径 | 关于、赞助、标题或更新视觉任一被选时作为事实来源 |
| `media-manifest.json` | 13 个图片的 MIME、尺寸、字节数、SHA-256、用途和敏感性 | 不复制到运行时；构建前后用于核验 |
| `i18n/zh-CN.json`、`i18n/en-US.json` | 关于品牌字段、固定赞助文案、权益与媒体替代文本 | 注册所选页面需要的 `brandSupport` namespace |
| `react/AboutPageTemplate.tsx` | 注入当前产品名/版本/区块/动作，默认显示品牌支持联系人 | 选择关于页 |
| `react/SponsorPageTemplate.tsx` | 响应式展示固定品牌赞助内容与双支付码 | 选择赞助页 |
| `react/SupportMedia.tsx` | 统一本地图片与带字幕/文字稿的视频边界 | 页面需要媒体 |
| `react/BrandUpdaterBanner.tsx` | 只渲染本地品牌 banner | 选择更新视觉 |
| `react/SupportSurfaceTemplates.test.tsx` | 页面、支付码、响应式危险回归和视频约束的非空测试 | 复制模板后按项目测试结构迁移 |
| `media/sponsor/*` | 12 个原始赞助资源，含支付码和当前未引用小图 | 选择赞助页时整体复制 |
| `media/updater/banner.jpg` | 原始品牌更新 banner | 选择更新视觉时复制 |

不要修改 Skill 内原始媒体来适配某个产品。若品牌事实更新，必须由项目负责人确认后同步替换源文件、profile、manifest、翻译与测试；若只是产品页面布局变化，在下游组件中修改并保留品牌源资产。

## 集成步骤

1. 从 `GUI_SUPPORT_SURFACES.template.md` 创建产品实例文档，只保留已选择章节。模板根本身仍不得出现 `docs/GUI_SUPPORT_SURFACES.md`。
2. 把 `brand-support-profile.json` 作为唯一品牌结构事实；不得在 About、Sponsor、标题或其他组件各写一份联系人/价格常量。
3. 将所选页面的 React 文件复制到产品前端并调整项目内导入路径。保留 Mantine、响应式 `SimpleGrid`、本地路径校验、图片替代文本以及视频 captions/transcript 约束。
4. 把两份 JSON 合并或注册为既有 i18next 的 `brandSupport` namespace。默认语言仍来自 `tauri-plugin-os` 探测和用户持久语言偏好；不能建立第二套语言状态。
5. 选择赞助页时完整复制 `media/sponsor/*` 到前端 public 的 `/brand-support/sponsor/`，不优化、压缩、重绘或重编码支付二维码。选择更新视觉时复制 banner 到 `/brand-support/updater/banner.jpg`。
6. 使用 manifest 复核每个进入项目的文件。当前未引用的 arrow、icon1 至 icon4、select 也必须随赞助品牌源包保留，不能因 tree-shaking 或“清理未使用文件”从 Skill/下游品牌源目录删除。
7. 产品构建只纳入已选择表面的运行时媒体；未选择赞助页时不得因为 Skill 存在而把支付码打进最终应用，未选择更新视觉时不得打包 banner。
8. 运行模板非空测试、项目 i18n/主题/键盘测试、媒体摘要检查、生产构建和最终 `dist` 扫描。真实候选验收仍只在里程碑触发。

## 关于页约束

- 产品名称、版本、标语、功能、免责声明、许可、隐私和动作都来自当前下游权威事实。模板不含任何来源产品名称、功能清单或固定路由。
- 版本由当前打包元数据提供，不在组件或翻译文件中写死。检查更新、赞助、反馈、许可与隐私是独立可选动作；未选择时不渲染占位按钮。
- 默认联系人使用 profile 的 `contacts.support`；窗口标题若需要联系字段，使用独立的 `contacts.windowTitle`，不能混用。
- 外部链接经 Tauri 窄命令或系统浏览器打开并验证 scheme/host；模板本身不持有 endpoint、网络 client 或秘密。

## 赞助页约束

- 固定价格是 19、199、1999 CNY；档位名称、权益、支付说明和双支付码来自品牌 profile/i18n/媒体，不能静默改成某个产品的促销方案。
- 页面在窄窗单列、中宽双列、宽窗最多三列；不得使用固定 `minWidth: 800`、固定 `cols={3}`、固定 `minHeight: 600` 或全页 `pointerEvents: 'none'`。
- 支付二维码不是装饰图，必须分别使用明确支付方式的本地化 `alt`。页面需保留文本形式的联系人和支付说明，不能让二维码成为唯一信息渠道。
- 固定权益是用户可见承诺。发布前人工复核价格、权益、收款主体、联系人和说明仍有效；静态测试不能替代该业务复核。
- 携带或展示二维码不产生付款状态。任何订单、权益发放、账户、回调、自动支付或付款核验都需要新的产品、安全与外部副作用范围。

## 图片与视频约束

- 所有运行时媒体使用应用内本地绝对路径；拒绝远程 scheme、协议相对 URL、反斜杠和 `..` 跳转。更新 banner 也不能从远端动态替换。
- 语义图片必须有本地化替代文本；纯装饰图片显式使用空 alt。CSS 背景只能承载不影响理解的装饰。
- 视频必须由产品拥有或获得明确内部复用批准，使用本地 `src`/poster/captions/transcript，显示 controls，不设置 autoplay，并且页面不依赖动画传达唯一信息。
- 当前品牌包没有视频文件。不得用占位视频、远程演示地址或没有字幕/文字稿的素材冒充已集成资源。

## 最小回归

- 关于页：注入一个非来源产品名和动态版本；验证可选动作/区块的存在与缺失、品牌支持联系人、主题、键盘和翻译回退。
- 赞助页：验证 19/199/1999、品牌联系人、三张档位图、两张有 alt 的支付码、响应式列数，以及源码没有固定 800px/全页 pointer-events。
- 媒体：13 个源文件逐项核对路径、MIME、尺寸、字节数和 SHA-256；支付码必须逐字节相同，当前未引用小图必须存在。
- 视频组件：验证 controls 为 true、autoplay 为 false、captions track 和 transcript 链接存在，并拒绝远程/跳转路径。
- 更新 banner：只验证本地可访问图片；没有批准更新检查时网络请求计数保持为零。
