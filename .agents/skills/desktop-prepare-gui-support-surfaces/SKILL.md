---
name: desktop-prepare-gui-support-surfaces
description: 为已选 GUI 按九项初始化配置建立标题、侧栏、语言与主题设置，以及可选桌面能力、关于页、赞助页和后续安全支持能力。
---

# 准备 GUI 支持界面

选择 GUI 时由 `$desktop-add-gui-adapter` 自动消费本 Skill，但必须严格服从 `docs/GUI_APP_PROFILE.md` 的九项初始化配置。动态标题、Logo→当前版本、设置页、i18n、三态主题和亮暗语义主题始终存在；system-locale、updater、window-state 由各自固定 Skill 无条件接入，三项保持 Rust-only；dialog WebView 基线同样由独立固定 Skill 无条件接入且只授予精确 `dialog:default`，updater 未配置时保持 `NotConfigured` 且零出站。系统托盘、系统通知、开机自启、关于页、赞助页、单实例、深链接和全局快捷键只在对应能力为 `enabled` 时进入运行时。系统通知与开机自启提供条件 Switch；全局快捷键界面只按 contract 的非空固定/可编辑动作生成，空 contract 无占位；初始化设置页不得预置隐私区块或统计开关。

固定模板以 `@tabler/icons-react` 作为唯一图标库，并先按 [`docs/design_standards/README.md`](../../../docs/design_standards/README.md) 匹配标准。`compact` 精确实现 `tauri-gui-sidebar-compact-80-v1`：`80px` 栏宽、`6px` 内容内边距、`36px` Logo、`22px` 图标、全宽居中名称与 `56px` 菜单项，不使用固定 `em/ch` 盒且不折叠。`detailed` 精确实现 `tauri-gui-sidebar-detailed-v1`：`248px` 展开、`76px` 收起、`72px`/`44px` Logo 和统一 `22px` 图标，名称通过右侧零延迟 Mantine `Tooltip` 补充并使用独立 localStorage 键 `APP_SIDEBAR_COLLAPSED_STORAGE_KEY` 持久化。详细折叠状态由 AppShell 拥有，侧栏只从 ActionIcon 调用回调；AppShell 的 `navbar.width` 与 `data-navbar-width` 同源同步。两种模式都保留完整可访问名称，按钮事件绑定在按钮自身。

## 工作流程

1. 先判断调用模式。读取 `docs/ENGINEERING_RULES.md` 与 `docs/design_standards/README.md`；初始化中必须读取并校验 `docs/GUI_APP_PROFILE.md` 的唯一 `gui-initialization-config` 代码块，确认 `system_tray`、`system_notification`、`autostart`、`about_page`、`sponsor_page`、`single_instance`、`deep_link`、`global_shortcut` 八项能力为 `enabled`/`disabled`、`sidebar_mode` 为 `compact`/`detailed` 且无 `pending`；字段顺序固定，且深链接启用必须同时启用单实例。全局快捷键启用时还必须有唯一合法 contract；中性初始化的动作数组为空，禁用时 contract 缺席。侧栏未选择时的 `detailed` 缺省必须已由初始化器写入，本 Skill 不得重复询问、再次应用缺省值或以旧默认覆盖。精确命中的标准直接应用，已批准产品专属规则优先；无匹配或像素偏离必须先批准并更新产品 profile/ADR。初始化后增加能力时再读取 Product Spec/ADR 并先过相应范围门禁。未选择 GUI 时停止。
2. 固定本地基线包括标题公式 `{applicationName} v{version} {contactChannel}:{contactValue}`、本地 `/app-identity/logo.png`、设置页、i18n、三态主题与应用级亮暗语义；同时复用 `$desktop-add-gui-system-locale`、`$desktop-add-gui-updater`、`$desktop-add-gui-window-state` 与 `$desktop-add-gui-dialog` 的固定基线。dialog 使用前端官方包与主窗口精确 `dialog:default`，不连带文件系统权限，也不进入自有 `invoke_handler`。所有 GUI 复制 `tauri/tauri.release.conf.json` 作为正式构建专用合并配置，根级强更门随 updater 基线保留，不依赖关于页是否启用。侧栏保持既有合同；底部导航为已选赞助、固定设置、已选关于。通知/自启按各自 Skill 接入条件 prop；全局快捷键只对 contract 非空动作接入逐项真实状态，固定策略只读，可编辑策略使用 Rust 权威 load/save/capture 命令，空 contract 不传 prop 或复制翻译键。`/about` 与 `/sponsor` 只在对应配置启用时建立。页面会话状态继续使用应用根 Jotai store，不与宿主能力状态混用。
3. 初始化不得创建 `docs/GUI_SUPPORT_SURFACES.md`。只有产品要修改固定本地基线、增加其他支持界面或启用任一出站能力时，才按需从 `assets/brand-support/GUI_SUPPORT_SURFACES.template.md` 创建或更新该文件，记录差异、内容/资源来源、i18n 键、可访问名称、所有权、启用状态和未决项。该文件是下游产品事实，Harness 模板不得预创建；升级器必须将其视为 `protected`。详细字段与所有权矩阵见 [references/gui-support-surfaces.md](references/gui-support-surfaces.md)，关于/赞助模板与媒体集成见 [references/about-and-sponsor-pages.md](references/about-and-sponsor-pages.md)，更新、强更与统计上报的固定状态机和安全边界见 [references/update-and-telemetry.md](references/update-and-telemetry.md)。
4. 先划分职责再实现：
   - 当前产品名、版本、功能与宿主交互留在 GUI；标题固定使用当前应用展示名、权威打包版本和 profile 的 `contacts.windowTitle` 动态组装为 `{applicationName} v{version} {contactChannel}:{contactValue}`，展示边界保证仅一个小写 `v`，原生窗口标题与 `document.title` 必须一致，不写死一次构建版本。共享作者、联系方式和免责声明、赞助内容及媒体读取 `assets/brand-support/`，不得另建漂移副本；
   - 领域校验、跨接口可复用的资格判断、状态转换、默认值和稳定错误进入 shared core，并先覆盖成功路径与最高风险失败路径；
   - 窗口标题、系统浏览器、原生通知、平台元数据采集、Tauri 权限和 WebView 展示属于 GUI adapter；React 只拥有路由、展示和纯交互状态，语言与主题选择使用设备级本地偏好，不进入 core。活动选项卡、查询/筛选、排序、分页等页面工作状态由应用根 Jotai store 在本次进程内跨路由保存，退出后重置，禁止浏览器/Tauri/文件/数据库/URL 持久化和 Query/core 数据镜像；成功空页在当前页大于 1 时回退第 1 页，加载/错误不回退。交互 handler 绑定在实际拥有动作的按钮、链接、`Switch`、`Checkbox` 或菜单项本身，不得由 Card、`Table.Tr`、`Table.Td` 等父级代理；
   - 赞助若只展示本地内容可留在 GUI；一旦产生权益、订单、支付或账户状态，就是新的业务与外部副作用，必须另行定范围和授权。
5. 对任何更新检查、统计上报、远程帮助内容或其他出站能力逐项建立显式能力清单。未获批准时保持禁用且不得发请求。清单至少包含目的、触发器、HTTP 方法、允许的 origin/路径模板、请求字段、响应 schema、重定向范围、超时、响应大小、重试/并发上限、失败语义、日志脱敏、秘密来源引用，以及适用的同意、保留和删除政策。桌面 bundle 不能保密，不得把服务端 secret、共享口令或发布私钥放入 Rust/TypeScript、Tauri 配置或前端产物。
6. 秘密只能由已批准的安全运行时来源提供。不得把实值放入 Rust/TypeScript 源码、常量、文档、配置样例、测试夹具、日志或前端 bundle；产品事实只记录秘密引用名和归属。前端不得持有能代表服务端或发布者身份的长期秘密。
7. 更新能力按 `NotConfigured`、`Idle`、`Checking`、`UpToDate`、`OptionalUpdate`、`RequiredUpdate`、`Failed` 建模。启用时使用官方 Tauri updater 生成并验证签名制品，默认拒绝降级和 target/arch/channel 不匹配。强更只能由 adapter 验证过真实性和目标绑定的 `minimumSupportedVersion` 事实交给 core，以严格 SemVer 比较得出；不得信任远端 `forcedUpdate` 布尔值。`RequiredUpdate` 使用根级不可关闭门，普通功能不挂载，只允许安装签名更新或安全退出。检查、策略或网络失败默认 fail-open，且不得伪装为最新版；渠道确需 fail-closed 时必须单独批准离线与恢复风险。
8. 只有产品明确启用统计能力后才增加统计同意界面，并默认关闭且必须明确同意；该界面属于产品差异，不得复用或恢复初始化设置页中的固定隐私区块。启用后的能力只允许下一次符合条件时发送一次每进程 `app_started`，由 GUI Rust adapter 以 HTTPS JSON `POST` body 发送精确字段白名单；禁止 GET/query、自由文本、令牌、路径、业务载荷、稳定设备/安装标识、用户名或主机名。撤回同意立即取消在途请求、清空最多 32 条的内存队列并恢复零出站；任务、超时与至多两次重试必须有应用生命周期 owner，禁止 detached task，失败始终 fail-open。任何新增事件、字段、稳定标识符或持久队列都需重新批准产品、隐私和适用法律边界。
9. 用户可见文字必须在 GUI 初始化时接入 `i18next`/`react-i18next` 与 `rust-i18n`。两种侧栏模式、收起/展开 Tooltip、设置页和已选页面均提供中英文与英文回退。仅在托盘启用时复制/加载托盘原生文案；仅在系统通知启用时复制设置文案并保留供后续产品通知正文使用的 Rust locale 基础设施，但中性初始化不虚构通知标题/正文。未选能力不得因资源模板存在而接入运行时键。
10. GUI 下游完整保留 Skill 的 13 个源图片，但只有 `sponsor_page: enabled` 时才把 `media/sponsor/*` 复制进应用 public；未选赞助页时运行时 bundle 不得包含 sponsor 媒体。updater banner 仍只在产品明确选择更新视觉时复制。支付二维码不得优化、重绘或解码重建。
11. 使用 `$desktop-implement-change` 直接实施。非空回归必须覆盖九字段唯一配置块与深链交叉关系、三项 Rust-only 固定基线、dialog 固定 WebView 基线、发布专用资源映射、两个侧栏模式、条件支持菜单和设置/主题/i18n。dialog 覆盖固定依赖、有序唯一注册、精确 `dialog:default` 与零额外文件系统授权；通知与自启覆盖 Switch 状态机；全局快捷键空 contract 覆盖零 prop/UI，固定策略覆盖只读逐项真实状态，可编辑策略覆盖录制/取消/清空/失败恢复并拒绝 WebView 权威持久化；disabled 时对应 contract、prop、命令、翻译键与依赖缺席。关于、赞助和托盘继续覆盖启用/禁用合同。页面会话状态继续验证进程内保留和退出重置；侧栏折叠偏好使用独立 localStorage 键，宿主能力权威状态不得进入 UI 存储。

12. 日常实施不自动追加全仓格式、类型、lint、中文注释、生产构建、最终 `dist` 扫描或完整验收；媒体清单/摘要复核仅在本次复制品牌媒体时运行。只有独立事件触发时才更新 Product Status、ADR 或 Changelog。普通 GUI 本地试包走适用开发构建路线；用户明确请求正式发布候选时先交给 `$desktop-prepare-release`，由发布上下文锁定选择后再调用 `$desktop-build-tauri-release`，构建只另外确认 E2E 并全量运行单元测试；本 Skill 不发送真实遥测、调用生产更新服务、执行支付或发布。

## 边界

- 本 Skill 的标题、设置、i18n、主题和所选侧栏模式是 GUI 固定界面基线；system-locale、updater、window-state 是三项 Rust-only 固定宿主基线，dialog 是固定 WebView plugin 基线；托盘、系统通知、开机自启、关于页、赞助页、单实例、深链接和全局快捷键是初始化可选能力，不要求 CLI/TUI/MCP 存在。dialog 选择路径不授权读取或写入该路径，通知不批准产品内容，自启不表示已注册登录项，updater 基线不授权任何出站。
- `docs/GUI_APP_PROFILE.md` 继续拥有应用展示身份；`docs/GUI_SUPPORT_SURFACES.md` 只拥有对固定基线的已批准修改、额外支持界面与出站清单，两者不得互相覆盖。
- Harness 不保存来源下游产品名/标识、路由、固定 endpoint、秘密、版本、遥测实例或批准结论；产品家族共享的工作室品牌、联系人、固定赞助内容和 13 个媒体文件是 `assets/brand-support/` 的封闭例外。
- 本 Skill 在选择 GUI 的终端下游完整保留，包括品牌依赖资产；非 GUI 下游必须在初始化裁剪中删除。Harness 升级传播整个条件 Skill，但不覆盖产品实例文档。
- 支付二维码是敏感静态品牌材料。携带或展示它不授权订单、权益、账户、自动支付、支付回调或支付状态确认；真实交易副作用必须独立定范围和授权。

## 完成输出

报告九项 GUI 初始化配置、三项 Rust-only 固定宿主基线、dialog 固定 WebView 基线及精确 `dialog:default`、固定标题、图标来源、侧栏与折叠证据、Logo→版本、支持菜单、设置页与主题；六个条件宿主能力及关于/赞助分别报告启用实现或禁用缺席。自启、window-state 与快捷键报告恢复/回收证据；通知和需打包深链不把调试构建表述为最终原生证据。
