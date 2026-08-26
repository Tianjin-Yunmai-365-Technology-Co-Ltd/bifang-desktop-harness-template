---
name: desktop-prepare-gui-support-surfaces
description: 为所有已选 GUI 提供固定动态标题、单态图标+文字 Logo→版本侧栏、语言与三态主题设置、含更新入口的关于页、全局亮暗主题、赞助页与品牌资源，并为产品配置签名更新、强更和可选统计上报能力。
---

# 准备 GUI 支持界面

选择 GUI 时由 `$desktop-add-gui-adapter` 自动消费本 Skill 的固定本地基线；初始化后，只有修改该基线、增加其他支持界面或配置出站能力时才再次调用。动态标题、顶部固定 Logo→当前版本的单态图标+文字左侧菜单、设置页、关于页与赞助页默认成组存在；设置页只提供应用/版本、语言和浅色/深色/跟随系统，手动检查更新固定在关于页，旁边的“更新日志”按钮从候选内同一 `release-notes.json` 查看最近 5 个版本。应用根同时携带完整亮色/暗色语义主题；没有完整产品 profile 时关于页检查更新显示 `NotConfigured` 且零出站，本地更新日志仍可打开。真实更新服务、强更策略和统计传输仍需产品批准与配置；只有产品明确启用统计时才增加独立的产品级同意界面，初始化设置页不得预置隐私区块、统计开关或相应占位文案。

固定模板以 `@tabler/icons-react` 作为唯一图标库：功能项注入 `TablerIcon` 组件，固定项使用包内命名组件。存在适用图标时不得使用其他图标库、手写 SVG、字符或 emoji；图表相关操作、状态和空态也优先使用 Tabler 图标，但图表绘制不属于该图标包。侧栏固定为 `136px` 宽且没有展开/折叠状态或开关；Logo 为 `56px`，菜单图标为 `30px`，文字位于图标下方、以 `11px` 字号在 `10em` 行内宽度内水平居中，允许两行但不能裁掉完整可访问名称。

## 工作流程

1. 先判断调用模式。由 `$desktop-add-gui-adapter` 在初始化中调用时，只读取 `AGENTS.md`、`docs/ENGINEERING_RULES.md`、GUI/Rust 基线和本 Skill 资产，不要求 Product Spec、`docs/GUI_APP_PROFILE.md` 或产品实例文档；初始化后修改默认界面或增加能力时，再读取最新 Product Spec、相关 ADR、已批准的 `docs/GUI_APP_PROFILE.md` 和现有 GUI 实现。新增能力若改变产品边界、隐私承诺或对外协议，先转 `$desktop-define-product`。未选择 GUI 时停止。
2. 固定本地基线包括：标题公式 `{applicationName} v{version} {contactChannel}:{contactValue}`；由 GUI 身份流程注入的本地 `/app-identity/logo.png`；固定 `136px` 宽的单态左侧菜单，其顶部先显示 `56px` Logo、下一项紧接持续可见且只带一个小写 `v` 的权威版本；产品功能项从顶部向下增长；底部固定项按视觉顺序为赞助、设置、关于，即从底部向上为关于、设置、赞助；固定 `/settings`、`/about`、`/sponsor` 路由。每个功能项和固定项必须由下游注入 `30px` 图标，图标在上、名称在下，名称使用 `11px` 字号、`10em` 行内宽度、居中和最多两行，并始终保留完整可访问名称；不得建立 `collapsed` 状态、展开/折叠按钮或用 Tooltip 代替可见名称。设置页只包含当前应用/版本、中英文和浅色/深色/跟随系统，不包含隐私标题、统计同意或未配置占位；关于页包含当前应用名、权威版本、手动检查更新状态、作者、作者联系方式与固定免责声明，并在“检查更新”旁提供元素自身绑定的“更新日志”按钮。该按钮从候选内同一 `release-notes.json` 展示最近 5 版，每版“功能优化”和“问题修复”各最多 10 条，发布日期/版本使用固定结构且版本只带一个小写 `v`。赞助页包含三档价格/权益、支付说明、双支付码和完整 sponsor 媒体。共享 React 资产还包含 `pageSessionState.ts` 与 `PageSessionState.test.ts`：页面模块在顶层创建 Jotai atom，应用根 store 在当前程序进程内跨路由保留活动选项卡、查询/筛选、排序、分页等工作状态；不得接入持久存储/URL或镜像 Query/core 数据，成功空页只在页码大于 1 时回退第 1 页。Mantine 根通过唯一 `AppThemeProviderTemplate.tsx` 以 `defaultColorScheme="auto"` 同时提供亮色和暗色，并分别定义页面背景、surface、主/次文字、边框与强调色；主题选择由显式 local-storage manager 持久化，赞助页从 `useComputedColorScheme` 获取有效主题并使用不同背景叠层、surface 和对比色，不能把初始化机器当时的主题固化为唯一版本。应用名、版本、Logo、图标与功能项由当前下游注入，品牌内容读取 `assets/brand-support/`。未配置远端能力时关于页检查更新为 `NotConfigured` 且零出站，本地更新日志仍可用；自动启动、统计同意、远程帮助、外部链接、订单、权益发放、账户和支付状态不属于默认基线。
3. 初始化不得创建 `docs/GUI_SUPPORT_SURFACES.md`。只有产品要修改固定本地基线、增加其他支持界面或启用任一出站能力时，才按需从 `assets/brand-support/GUI_SUPPORT_SURFACES.template.md` 创建或更新该文件，记录差异、内容/资源来源、i18n 键、可访问名称、所有权、启用状态和未决项。该文件是下游产品事实，Harness 模板不得预创建；升级器必须将其视为 `protected`。详细字段与所有权矩阵见 [references/gui-support-surfaces.md](references/gui-support-surfaces.md)，关于/赞助模板与媒体集成见 [references/about-and-sponsor-pages.md](references/about-and-sponsor-pages.md)，更新、强更与统计上报的固定状态机和安全边界见 [references/update-and-telemetry.md](references/update-and-telemetry.md)。
4. 先划分职责再实现：
   - 当前产品名、版本、功能与宿主交互留在 GUI；标题固定使用当前应用展示名、权威打包版本和 profile 的 `contacts.windowTitle` 动态组装为 `{applicationName} v{version} {contactChannel}:{contactValue}`，展示边界保证仅一个小写 `v`，原生窗口标题与 `document.title` 必须一致，不写死一次构建版本。共享作者、联系人、免责声明、赞助内容和媒体读取 `assets/brand-support/`，不得另建漂移副本；
   - 领域校验、跨接口可复用的资格判断、状态转换、默认值和稳定错误进入 shared core，并先覆盖成功路径与最高风险失败路径；
   - 窗口标题、系统浏览器、原生通知、平台元数据采集、Tauri 权限和 WebView 展示属于 GUI adapter；React 只拥有路由、展示和纯交互状态，语言与主题选择使用设备级本地偏好，不进入 core。活动选项卡、查询/筛选、排序、分页等页面工作状态由应用根 Jotai store 在本次进程内跨路由保存，退出后重置，禁止浏览器/Tauri/文件/数据库/URL 持久化和 Query/core 数据镜像；成功空页在当前页大于 1 时回退第 1 页，加载/错误不回退。交互 handler 绑定在实际拥有动作的按钮、链接、`Switch`、`Checkbox` 或菜单项本身，不得由 Card、`Table.Tr`、`Table.Td` 等父级代理；
   - 赞助若只展示本地内容可留在 GUI；一旦产生权益、订单、支付或账户状态，就是新的业务与外部副作用，必须另行定范围和授权。
5. 对任何更新检查、统计上报、远程帮助内容或其他出站能力逐项建立显式能力清单。未获批准时保持禁用且不得发请求。清单至少包含目的、触发器、HTTP 方法、允许的 origin/路径模板、请求字段、响应 schema、重定向范围、超时、响应大小、重试/并发上限、失败语义、日志脱敏、秘密来源引用，以及适用的同意、保留和删除政策。桌面 bundle 不能保密，不得把服务端 secret、共享口令或发布私钥放入 Rust/TypeScript、Tauri 配置或前端产物。
6. 秘密只能由已批准的安全运行时来源提供。不得把实值放入 Rust/TypeScript 源码、常量、文档、配置样例、测试夹具、日志或前端 bundle；产品事实只记录秘密引用名和归属。前端不得持有能代表服务端或发布者身份的长期秘密。
7. 更新能力按 `NotConfigured`、`Idle`、`Checking`、`UpToDate`、`OptionalUpdate`、`RequiredUpdate`、`Failed` 建模。启用时使用官方 Tauri updater 生成并验证签名制品，默认拒绝降级和 target/arch/channel 不匹配。强更只能由 adapter 验证过真实性和目标绑定的 `minimumSupportedVersion` 事实交给 core，以严格 SemVer 比较得出；不得信任远端 `forcedUpdate` 布尔值。`RequiredUpdate` 使用根级不可关闭门，普通功能不挂载，只允许安装签名更新或安全退出。检查、策略或网络失败默认 fail-open，且不得伪装为最新版；渠道确需 fail-closed 时必须单独批准离线与恢复风险。
8. 只有产品明确启用统计能力后才增加统计同意界面，并默认关闭且必须明确同意；该界面属于产品差异，不得复用或恢复初始化设置页中的固定隐私区块。启用后的能力只允许下一次符合条件时发送一次每进程 `app_started`，由 GUI Rust adapter 以 HTTPS JSON `POST` body 发送精确字段白名单；禁止 GET/query、自由文本、令牌、路径、业务载荷、稳定设备/安装标识、用户名或主机名。撤回同意立即取消在途请求、清空最多 32 条的内存队列并恢复零出站；任务、超时与至多两次重试必须有应用生命周期 owner，禁止 detached task，失败始终 fail-open。任何新增事件、字段、稳定标识符或持久队列都需重新批准产品、隐私和适用法律边界。
9. 用户可见文字必须在 GUI 初始化时接入 `i18next`/`react-i18next` 与 `rust-i18n`，跟随主题、键盘导航和无障碍语义。前端注册 `i18n/*.json`，Rust GUI adapter 复制并加载 `rust-i18n/*.yml` 的托盘文案，两者使用同一规范化 locale 结果。托盘稳定 ID 只能用于事件分派；可见菜单标签必须在创建或更新菜单时通过 `rust_i18n::t!("tray.show_window")` 与 `rust_i18n::t!("tray.quit")` 解析，中文精确显示“显示窗口/退出”，英文精确显示“Show Window/Quit”，不支持的 locale 回退英文，运行时切换语言必须在不重启应用的情况下刷新既有托盘标签，任何 `tray.*` 原始键可见都失败。当前产品名、版本、Logo、功能、菜单图标和可选动作仍由下游注入；所有人类可见版本由共享 formatter 规范化为一个小写 `v`，机器版本不改。固定侧栏使用 `AppSidebarTemplate.tsx` 的 `136px` 单态布局，Logo 在 DOM 中位于版本之前，菜单以 `30px` 图标在上、`11px` 名称在下的方式居中显示，名称预留 `10em` 宽度并保留完整可访问名称；不得创建折叠状态、切换按钮或 Tooltip-only 名称。`/settings`、`/about` 与 `/sponsor` 是固定路由，底部菜单严格按赞助、设置、关于渲染。应用根使用 `AppThemeProviderTemplate.tsx`；设置页使用 `SettingsPageTemplate.tsx` 并把三态选择接到 Mantine color-scheme context，且不得增加默认隐私/统计区块；强更使用根级 `MandatoryUpdateGateTemplate.tsx`。关于页固定展示检查更新、更新日志、`about.studio` 表示的作者、profile 联系方式和三段免责声明；赞助页固定复用品牌包的三档价格/权益、支付码与视觉资源，并以运行时有效主题渲染。赞助布局不得恢复固定 800px、固定三栏或全页 `pointer-events: none`。
10. 对品牌包执行默认本地打包：GUI 下游完整保留 Skill 的 13 个源图片，并在初始化时把 `media/sponsor/*` 全部复制到应用 public 的 `/brand-support/sponsor/`，包括当前未引用小图；只有产品选择更新视觉时才复制 `media/updater/banner.jpg`。禁止优化、重绘或解码重建支付二维码；复制后以 `media-manifest.json` 的字节数和 SHA-256 复核。固定页面在未配置远端能力时不得发起网络请求，静态支付材料也不授权任何支付自动化。
11. 使用 `$desktop-implement-change` 直接实施。初始化至少以非空单元/回归测试覆盖动态标题、侧栏固定 `136px` 单态、Logo→版本顺序、`56px` Logo、`30px` 图标、图标上/文字下、`11px` 字号、`10em` 名称宽度、无折叠状态/切换按钮/Tooltip-only 名称、功能区与固定底部顺序、`/settings`/`/about`/`/sponsor`、默认设置页没有隐私/统计控件与翻译键、语言与主题三态切换/持久化、亮暗背景/文字/surface 差异、关于页 `NotConfigured` 零出站、更新日志五版/十条上限、全部可见版本单个 `v`、更新区父容器不代理两个按钮、作者/联系人/免责声明、赞助页亮色/暗色差异、赞助价格与支付码替代文本、响应式布局和媒体摘要。所有行内按钮、链接、`Switch`、`Checkbox` 分别点击控件和周围父级区域，证明父级不代理子动作。页面会话状态使用同一应用根 store 证明选项卡/查询/排序/分页跨 route unmount/remount 保留，使用新 store 证明退出后默认值，并覆盖成功空页回退、加载/错误不回退和第 1 页不循环；不得通过持久存储、URL 或 Query 数据镜像通过。托盘另以固定命名回归 `tray_labels_resolve_for_supported_locales`、`tray_labels_fall_back_to_english`、`language_change_updates_tray_menu_labels` 覆盖中英文精确标签、英文回退和运行时刷新；启用更新时再覆盖 core SemVer 强更边界、策略与制品签名、target/channel、取消回收、单飞、不可绕过强更门和失败语义；启用统计时覆盖默认/未同意/撤回零出站、POST 字段白名单、禁止稳定标识、队列/重试上限和关闭回收。不得用 mock 网络或组件单测声称真实更新、安装或上报可用。
初始化的非空回归必须覆盖 `@tabler/icons-react` 命名组件接线和上述单态侧栏尺寸/排列；真实启动、语言切换后的真实托盘标签和全菜单可达由初始化器后续调用的 `$desktop-test-gui-initialization-e2e` 验证。

12. 日常实施不自动追加全仓格式、类型、lint、中文注释、生产构建、最终 `dist` 扫描或完整验收；媒体清单/摘要复核仅在本次复制品牌媒体时运行。只有独立事件触发时才更新 Product Status、ADR 或 Changelog。用户显式请求构建时交给 `$desktop-build-tauri-release`，由构建流程逐次确认 E2E 并全量运行单元测试；本 Skill 不发送真实遥测、调用生产更新服务、执行支付或发布。

## 边界

- 本 Skill 的固定侧栏、设置/关于/赞助页面和品牌资产是 GUI 初始化基线，但不要求 CLI/TUI/MCP 存在；关于页的本地更新入口不授权任何出站，真实更新、强更策略与统计传输仍必须由产品范围单独批准。
- `docs/GUI_APP_PROFILE.md` 继续拥有应用展示身份；`docs/GUI_SUPPORT_SURFACES.md` 只拥有对固定基线的已批准修改、额外支持界面与出站清单，两者不得互相覆盖。
- Harness 不保存来源下游产品名/标识、路由、固定 endpoint、秘密、版本、遥测实例或批准结论；产品家族共享的工作室品牌、联系人、固定赞助内容和 13 个媒体文件是 `assets/brand-support/` 的封闭例外。
- 本 Skill 在选择 GUI 的终端下游完整保留，包括品牌依赖资产；非 GUI 下游必须在初始化裁剪中删除。Harness 升级传播整个条件 Skill，但不覆盖产品实例文档。
- 支付二维码是敏感静态品牌材料。携带或展示它不授权订单、权益、账户、自动支付、支付回调或支付状态确认；真实交易副作用必须独立定范围和授权。

## 完成输出

报告固定标题、`@tabler/icons-react` 依赖与组件来源、侧栏 `136px` 单态及 Logo→版本顺序、`56px` Logo、`30px` 图标、图标上/文字下和 `11px`/`10em` 名称约束、设置/关于/赞助路由及顺序、默认设置页无隐私/统计区块、三态主题偏好和应用级亮色/暗色语义、托盘中英文/回退/运行时刷新状态、关于页更新入口、赞助页亮色/暗色证据、默认打包媒体、产品事实文档位置（若有）、更新/强更/统计状态与 GUI/core 所有权、出站清单、签名/秘密是否只使用安全引用、可选同意界面状态、运行过的检查、未验证平台和剩余隐私/发布风险。
