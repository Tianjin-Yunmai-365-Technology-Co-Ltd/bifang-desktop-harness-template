# GUI 支持界面扩展实例

> GUI 初始化已经包含动态标题、所选精简/详细 Logo→版本侧栏、不含隐私/统计区块的语言与三态主题设置及应用级亮暗语义主题；系统托盘、系统通知、开机自启、关于页、赞助页和单实例由 `docs/GUI_APP_PROFILE.md` 逐项选择。仅在产品要修改该基线、增加界面或配置出站能力后，把本文件复制为 `docs/GUI_SUPPORT_SURFACES.md`。

## 文档状态

- 状态：Draft
- 产品规格：待填写
- GUI 应用资料：`docs/GUI_APP_PROFILE.md`
- 确认人和日期：待填写
- 默认基线差异或新增能力：待填写

## 产品家族品牌包

- 品牌事实：复用 `brand-support-profile.json`；固定品牌联系人、三档赞助价格与支付材料只有项目负责人重新确认后才能修改。
- 媒体事实：复用 `media-manifest.json`；GUI Skill 完整保留 13 个源文件，应用 bundle 只在 `sponsor_page = enabled` 时复制完整 sponsor 媒体，updater banner 只在明确选择更新视觉时复制。
- 支付边界：支付二维码是敏感静态品牌材料。展示它不授权订单、权益、账户、自动支付、支付回调或付款状态确认。
- 更新 banner：只是一张本地品牌图片，不代表更新检查、下载、强制更新、服务地址或秘密已获批准。
- 视频：当前品牌包没有视频文件。未来新增时必须记录来源/内部复用批准、poster、字幕、文字稿、体积和打包路径。

## 窗口标题

- 默认：enabled
- 模板：`{applicationName} v{version} {contactChannel}:{contactValue}`；产品展示名与版本必须来自权威 Tauri/打包元数据，展示边界保证只有一个小写 `v`。
- 品牌联系字段：固定使用 profile 的 `contacts.windowTitle`，不得误用 `contacts.support`。
- 原生/前端一致性：原生窗口标题与 `document.title` 必须一致。
- 本节只记录已批准差异：待填写
- Rust/React 所有权：待填写
- i18n 键与失败行为：待填写

## 左侧菜单、Logo 与版本

- 模式来源：`docs/GUI_APP_PROFILE.md` 的 `sidebar_mode`，只能为 `compact` 或 `detailed`。
- 精简：匹配 `tauri-gui-sidebar-compact-80-v1`，`80px` 栏宽、`6px` 内容内边距、`36px` Logo、`22px` 图标、`11px`/`1.25` 全宽居中名称、`56px` 菜单项与 `4px`/`8px` 节奏；不使用固定 `em/ch` 名称盒或折叠按钮。
- 详细：首次默认 `248px` 展开，使用 `22px` 图标并显示图标+名称；自身按钮收起为 `76px` 后只显示图标并通过右侧零延迟 Tooltip 显示名称。折叠状态使用 `APP_SIDEBAR_COLLAPSED_STORAGE_KEY` 设备级持久化，由 AppShell 拥有并同步 `navbar.width`/`data-navbar-width`，不进入页面会话 Jotai store。
- Logo 与版本：选中的本地 Logo 永远位于最顶部，带一个小写 `v` 的当前权威版本紧随其下。
- 功能区：当前产品功能项按下游提供的顺序从顶部向下增长，并在独立滚动区中展示。
- 固定底部组：视觉顺序为已选赞助、设置、已选关于；未选页面不得有入口或路由。
- 主题、窄窗、文本缩放、键盘、焦点和可访问名称：待填写

## 设置页

- 默认：enabled；入口或路由为 `/settings`。
- 应用事实：显示当前应用名和权威打包版本。
- 语言：固定提供中文与英文；选择保存在 GUI adapter 本地偏好中并覆盖系统语言探测，shared core 不保存该偏好。
- 主题：固定提供浅色、深色、跟随系统；选择由 Mantine color-scheme manager 保存在 GUI adapter 设备级本地存储，应用根同时保留亮色/暗色背景、surface、文字、边框与强调色。
- 默认隐私/统计界面：不存在；不得加入隐私标题、统计同意开关、未配置占位或对应固定翻译键。产品明确启用统计能力时，必须在本文件的“统计上报”章节记录并另建产品级同意界面。
- i18n、键盘、焦点、live region 与错误状态：待填写

## 关于页

- enabled：读取 GUI 初始化配置；默认不得推断。
- 入口或路由：`/about`，并在应用导航显示。
- 产品名与版本来源：当前 Tauri/打包元数据。
- 手动检查更新：入口固定存在；产品 profile 不完整时状态为 `NotConfigured`、按钮禁用、请求数为零。
- 更新日志：按钮紧邻“检查更新”且事件绑定在按钮自身；从候选内同一 schema v2 `release-notes.json` 展示最近 5 版，每版功能优化/问题修复各最多 10 个 `zh-CN`/`en-US` 翻译对，标题与正文跟随当前 i18n locale，全部版本只带一个小写 `v`。更新区父容器不得代理两个按钮动作。
- 固定内容：`about.studio` 作者、profile 的 `contacts.support`、三段本地化免责声明。
- 标语、功能、许可与隐私区块：按需填写；不得从来源下游复制产品功能文案。
- 可选动作：反馈、许可、隐私逐项填写；未选动作不得留下占位按钮。赞助由固定导航承载，检查更新是本页固定入口。
- 键盘、焦点、文本缩放、主题与可访问名称：待填写

## 赞助页

- enabled：读取 GUI 初始化配置；默认不得推断。
- 入口或路由：`/sponsor`，并在应用导航显示。
- 固定品牌内容：使用 profile、`i18n/zh-CN.json` 和 `i18n/en-US.json`；价格、权益、联系人或支付码变更需项目负责人重新确认。
- 进入应用 bundle 的媒体：仅在本页启用时完整复制 `media/sponsor/*`，包含背景、三张档位图、两张支付码和当前未引用小图。
- 响应式边界：窄窗单列、中宽双列、宽窗最多三列；不得恢复固定 `min-width: 800px` 或全页 `pointer-events: none`。
- 主题：同一产物同时支持亮色和暗色；运行时有效主题分别选择背景叠层、surface 与对比色，不得只保留初始化机器当时的主题。
- 支付说明人工复核：待填写；确认收款主体、价格、权益、联系渠道和用户可见免责声明仍有效。
- 订单/权益/账户/支付状态：默认不存在；需要时另建产品与外部副作用范围。

## 更新、签名制品与强更策略

- enabled：默认 false；未启用时保留关于页 `NotConfigured` 状态和零出站。
- banner enabled/alt：待填写；只在选择视觉时进入 bundle 并接入 i18n。
- 触发器：手动 / 每进程一次启动检查；并发检查必须单飞。
- channel、允许 HTTPS origin/路径、target/arch 表：待填写。
- 当前版本来源：Tauri/打包元数据；严格 SemVer、降级和预发布策略：待填写。
- 官方 Tauri updater 制品公钥：待填写公开值或受管配置来源；发布私钥安全运行时引用名：待填写，绝不写实值。
- 强更策略认证公钥/机制：待填写；`minimumSupportedVersion` 发布权限、有效期、失效和回滚流程：待填写。
- 响应 schema、内容类型、最大字节、未知字段、连接/总超时、重定向、重试：待填写。
- 状态：`NotConfigured` / `Idle` / `Checking` / `UpToDate` / `OptionalUpdate` / `RequiredUpdate` / `Failed`。
- 失败语义：默认 fail-open 且不能伪装为最新版；若渠道要求 fail-closed，记录独立批准、离线风险和恢复路径。
- 强更门：只能由 core 对已认证 `minimumSupportedVersion` 进行 SemVer 比较后进入；普通功能不挂载，只允许安装签名更新或安全退出，禁止远端布尔值直接触发。
- 平台制品生成、签名、安装、重启/退出和真实候选验证状态：待填写。

## 统计上报

- enabled：默认 false；初始化设置页不提供统计或隐私控件。明确启用后必须另建产品级同意界面，用户同意默认 false，未同意和撤回后请求数必须为零。
- 目的、接收方、隐私责任人、适用法律依据、用户可见说明：待填写。
- 唯一固定事件：`app_started`，每进程最多一次且不回补同意前事件。
- JSON POST body 字段：`schemaVersion`、`eventName`、`applicationCode`、`applicationVersion`、`osFamily`、`architecture`、`locale`、`distributionChannel`、`occurredAtUtc`。
- 禁止：GET/query、稳定设备/安装 ID、用户名、主机名、精确系统版本、路径、文件名、窗口标题、命令参数、账号、令牌、业务载荷和自由文本。
- HTTPS origin/固定路径、公开 `applicationCode`、distribution channel、内容类型：待填写；客户端不得保存服务端 secret。
- 生命周期：一个发送任务、一个在途请求、最多 32 条内存事件、不落盘、连接最多 5 秒、总耗时最多 10 秒、最多重试 2 次（1 秒/4 秒有界退避）。
- 撤回与关闭：立即取消在途请求、清空内存队列、阻止后续入队；统计失败始终 fail-open。
- 服务端保留/删除期限、退出/删除路径、日志 allowlist：待填写。

## 本地视频

| 字段 | 值 |
|---|---|
| enabled | false |
| 本地文件与 poster | 待填写 |
| 字幕轨语言/路径 | 待填写 |
| 文字稿路径 | 待填写 |
| 权利与内部复用批准 | 待填写 |
| autoplay | 禁止 |
| 远程资源或追踪 | 禁止 |

## 验证

- [ ] 侧栏与 `sidebar_mode` 及 `docs/design_standards/tauri_sidebar.md` 一致：compact 为 `80px` 全宽居中持续名称、AppShell navbar 复用宽度常量且 Navbar padding 为 `0`；detailed 默认 `248px` 展开、`76px` 收起、统一 `22px` 图标，身份父级不代理按钮，`navbar.width`/`data-navbar-width` 同步，按钮状态持久化且收起 Tooltip 可发现名称。
- [ ] 设置页固定含应用/版本、语言与三态主题；只为 profile 已启用能力加入宿主开关，且没有隐私/统计控件、未配置占位或禁用能力翻译键。
- [ ] 托盘中文精确显示“显示窗口/退出”，英文精确显示“Show Window/Quit”，未知 locale 回退英文，运行时语言切换无需重启即可刷新；任何 `tray.*` 原始键不可见。
- [ ] `/settings` 固定存在；系统通知/开机自启 Switch、全局快捷键状态、`/about`、`/sponsor` 及运行时媒体严格按九项初始化选择存在或缺席。
- [ ] 原生窗口标题与 `document.title` 都符合 `{applicationName} v{version} {contactChannel}:{contactValue}`，且所有用户可见版本只有一个小写 `v`。
- [ ] 关于页完整显示作者、作者联系方式和三段免责声明。
- [ ] 更新未配置时显示 `NotConfigured` 且零出站；updater 等未选择媒体没有进入最终应用 bundle。
- [ ] 关于页更新日志按钮可查看近 5 版 schema v2 双语日志，每版两类各不超过 10 个 `zh-CN`/`en-US` 翻译对，标题与正文跟随当前 i18n locale、未知语言回退英文；点击更新区父容器不触发检查或打开日志。
- [ ] 品牌包 13 个源文件与 `media-manifest.json` 的尺寸、字节数和 SHA-256 一致。
- [ ] 产品名、版本和产品功能来自当前下游权威事实，而不是来源项目。
- [ ] 赞助价格、权益、联系人、收款码与支付说明经过人工复核。
- [ ] 图片有语义化替代文本或显式装饰声明；视频有 controls、字幕与文字稿且没有 autoplay。
- [ ] 远程能力禁用、统计未同意或撤回后请求数为零，生产 `dist` 不含秘密或未批准服务地址。
- [ ] 强更只由 core 对已认证最低支持版本作 SemVer 判定，未认证布尔字段、检查失败或网络失败不能触发；强更门不可关闭或绕过。
- [ ] updater 制品签名、target/arch/channel、降级、取消和关闭回收有非空测试；真实安装只以最终候选验证结论为准。
- [ ] 统计只使用 JSON POST 固定字段，无稳定标识符；撤回同意会取消请求和清空队列，重试与队列均有界。
- [ ] 赞助页分别通过亮色/暗色渲染；窄窗、文本缩放、键盘、焦点与 i18n 回退均有可观察证据。
