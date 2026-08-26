# Agent-first Harness 模板产品规格

> 记忆日期：2026-08-26
>
> 状态：Approved
>
> 初次批准日期：2026-07-21
>
> 最近范围确认：2026-08-26（GUI 进程内页面会话状态与空分页回退见 ADR-20260826-004；页面事件归属、近五版发布日志与统一 `v` 展示见 ADR-20260826-003；Rust/前端分层代码行数门禁与目录组织见 ADR-20260826-002；下游自动语义化版本、正式发布周期与重复缺陷去重门禁见 ADR-20260826-001；此前仍有效决定已综合保留）

## 一句话目标

为以 AI Agent 为第一消费者、人类负责方向和关键审批的跨平台收费小工具，提供一个不实现具体业务、可一次性建立并持续维护终端下游项目的 Harness；Superpowers 默认关闭，日常开发只执行实现、本次必要单元测试和事件触发记录，环境门禁只在初始化或真实环境错误恢复时运行，显式构建统一执行全量单元测试并逐次确认是否启用 E2E。

## 用户、场景与结果

- 核心用户：使用 AI Agent 创建、交付和维护企业收费小工具的项目负责人。
- 主要场景：Agent 直接完成当前批准范围，并只运行本次开发所需的相关单元/回归测试；除必要 ADR、Changelog 等事件触发记录外，不自动增加持久计划、全仓检查、构建、冒烟、E2E、验收或人工复核步骤。
- 失败闭环：开发单元测试失败时在当前授权范围内修复并重跑；发现产品边界、安全、破坏性操作、生产/付费/凭据副作用或发布授权缺失时，只增加解决该风险必需的确认或记录，不把它扩张成通用流程仪式。
- 维护场景：已有下游项目可从明确的新版 Harness 来源安全升级工程治理部分，同时保护业务源码、产品记忆、身份、项目策略、许可证和本地修改。
- 决策场景：初始化默认只询问是否采用推荐策略预设；显式构建时必须为当前构建解析一次 E2E 选择，持久 `milestone_e2e` 仅提供建议默认值，不能替代本次选择。
- 输入：项目身份、目标目录、接口组合、产品意图、持久 Agent 策略、实现、当前开发所需单元测试、构建路由/签名公证条件、本次 E2E 选择、验证证据、Harness 升级来源、商业授权和人工审批。
- 输出：独立终端项目根、共享核心与所选适配器、完成的实现和本次必要单元测试证据；显式构建另输出经过全量单元测试的可追溯候选，并按本次选择决定是否进入 E2E。

## MVP 包含

### 页面事件归属、发布日志与版本展示

- 变更标识：`HARNESS-FEAT-INTERACTION-RELEASE-NOTES-VERSION-DISPLAY`；所需 Harness 版本：`202608051301`（当前未发布时间版本，本范围不自动改变 `Version.md`）。
- 页面交互事件必须绑定到实际拥有动作的按钮、链接、`Switch`、`Checkbox` 或菜单项本身，Card、`Table.Tr`、`Table.Td` 等父级不得代理子控件动作。父级确有独立动作时只执行自身语义并隔离冲突传播；点击表格行或单元格不得切换其中的 `Switch`。回归分别点击控件和周围父级区域。
- GUI 关于页的更新区在“检查更新”旁固定提供元素自身绑定的“更新日志”按钮；即使远程 updater 为 `NotConfigured`，本地日志入口仍可使用。弹窗从候选内同一 `release-notes.json` 按最新在前展示至多 5 个版本，每版“功能优化”和“问题修复”各至多 10 条。
- 每次正式发布的候选构建前，`$desktop-prepare-release` 从上一次真实正式发布版本/40 位提交到当前发布源码筛选最重要的用户可见变化；首发从仓库起点计算，比较边界不可靠时失败关闭。根 `release-notes.json` 采用固定 schema、原子更新、非符号链接普通文件和近 5 版上限，每版两类合计至少一条，固定渲染为 `-----------更新日志 {发布日期} {发布版本}----------`、`###功能优化`、`###问题修复`，空分类显示“无”。候选构建只读校验当前版本与摘要并把同一字节打入归档/应用资源；候选形成后任何日志变化都要求重新提交、构建和验收。
- 所有用户可见版本号带且只带一个小写 `v`，覆盖窗口标题、侧栏、设置/关于页、更新状态、CLI `--version` 和更新日志。Cargo、JSON/协议、状态文件及 manifest 的机器 `version` 保持原始值；manifest 另以 `releaseNotesVersion`、`releaseNotesSha256`、`releaseNotesPath` 绑定展示版本与包内日志事实。

### GUI 进程内页面会话状态

- 变更标识：`HARNESS-FEAT-GUI-PROCESS-SESSION-STATE`；所需 Harness 版本：`202608051301`（当前未发布时间版本，本范围不自动改变 `Version.md`）。
- GUI 中用于继续页面工作的活动选项卡、已应用查询/筛选、排序、分页页码/每页数量及同类视图选择必须由应用根 Jotai store 的页面级模块 atom 持有，在当前程序进程内跨路由切换、route unmount/remount、关闭隐藏和单实例唤醒保持；真正退出后，新 store 从默认值开始。
- 页面会话状态不得接入 `atomWithStorage`、localStorage、sessionStorage、IndexedDB、Tauri Store、配置文件、数据库或 URL，不得把 TanStack Query 结果、core 权威状态或持久业务数据复制进 atom。语言与主题等已批准的设备级偏好继续按各自独立契约持久化，不受本页面会话生命周期限制。
- 查询条件、活动数据范围或每页数量变化时页码重置为 1。路由返回后只在查询成功、当前页码大于 1 且该页结果为空时回退第 1 页，并由新 query key 触发一次查询；加载、取消、超时、错误和第 1 页空结果不得触发回退或循环。失效枚举选择按当前可用项回到安全默认。
- 回归必须用同一个应用根 store 证明页面控件跨 route unmount/remount 保留，用新 store 证明下一次程序运行恢复默认，并覆盖成功空页回退、加载/错误不回退和第 1 页不循环；测试不得以持久存储、URL 参数或 Query 数据镜像替代。

### 下游自动版本管理

- 变更标识：`HARNESS-FEAT-DOWNSTREAM-AUTO-VERSIONING`；所需 Harness 版本：`202608051301`（当前未发布时间版本，自动 SemVer 规则不适用于 Harness 自身）。
- 已初始化下游以根 `Cargo.toml` 的 `[workspace.package].version` 作为当前版本唯一事实源，并以受保护的 `.harness/version-state.json` 保存正式发布周期、待发布变化和已消费缺陷 ID；所有成员继续使用 workspace 版本。
- 版本固定为无预发布/构建元数据的 `MAJOR.MINOR.PATCH`，每个分量支持闭区间 `0..100`，溢出时停止并询问用户，不自动进位。Major 只由用户批准精确目标且提升后 Minor/Patch 归零；一个正式发布周期的首个已完成功能提升一次 Minor 并把 Patch 归零，后续功能不因功能再次提升；每个新稳定缺陷 ID 的已完成修复提升一次 Patch，重复 ID 不提升，发布后回归必须使用新的回归缺陷 ID。
- 缺陷查询、诊断、复现、未完成或重复修复尝试、行为保持重构、测试补强、文档、格式和内部清理不提升版本。版本只在变化完成且本次相关测试通过后提交；普通构建、`pending` 候选、验收或失败发布只校验一致性，只有真实正式发布成功才重置首功能周期，同时保留历史缺陷 ID。
- Product Spec、ADR、Changelog 或 Work Plan 仅在其自身事件独立触发时记录稳定 `change_id` 与 `required_version`；版本变化不为普通缺陷或维护任务强制创建项目记忆。

### 分层代码行数治理

- 变更标识：`HARNESS-FEAT-TIERED-CODE-LINE-LIMITS`；所需 Harness 版本：`202608051301`（当前未发布时间版本，自动 SemVer 规则不适用于 Harness 自身）。
- Rust 代码 400 行及以内不因行数触发专项复核；401 至 800 行列为建议重构候选，800 行通过，801 行起由机械门禁拒绝并强制拆分。Rust 多文件模块统一使用 `<module>/mod.rs` 目录入口，把职责相近的子模块置于同一目录；不得以同级 `<module>.rs` 加同名目录、空壳转发或压缩可读性规避门禁。
- 前端代码 500 行及以内不因行数触发专项复核；501 至 1000 行列为建议重构候选，1000 行通过，1001 行起由机械门禁拒绝并强制拆分。前端按功能或页面职责建立高内聚目录，不强制 `index.ts` 桶文件，也不用 `export *` 隐藏真实来源。
- 其他人工维护文本继续使用 500 行复核与 2000 行硬上限；工具生成且禁止手工编辑的锁文件/生成物和原样内嵌的第三方文件继续按封闭范围排除。所有建议区间都必须复核高内聚、职责单一和职责相近性，任一项不满足即按真实职责拆分。
- 统一检查器按文件后缀确定配置，在结构化报告中携带 `profile`、建议阈值和硬上限；软阈值只产生可见提示，硬超限以非零状态失败。Rust 硬超限诊断必须明确 `<module>/mod.rs` 目录组织要求。

### Harness 与下游生命周期

- Harness 只提供文档、项目 Skills、中性资产和验证入口，不实现具体业务。
- `$desktop-instantiate-project` 只执行一次，要求展示名、ASCII `snake_case` 标识、完整目标项目目录路径、负责人和目标平台。解析后的目标目录基本名称必须与项目标识一致；目标必须不存在或为空，复制后该目录是初始化、开发、验证和发布准备的唯一项目根目录。
- 下游必须建立独立 Git 仓库，`git rev-parse --show-toplevel` 精确等于项目根，初始分支为 `main`，无远端，并在初始化裁剪后只创建一个本地基线提交。
- 下游默认采用 Rust 2024、Rust 1.90 MSRV（即 MSRV 1.90.0）、共享核心与用户从 CLI/TUI/MCP/GUI 独立选择的适配器；1.90.0 是最低兼容版本而非精确版本锁，未选择任何接口时默认 CLI。
- Core-first 是强制架构约束：凡不依赖某一具体接口或宿主才能成立的领域类型、业务规则、语义校验、业务默认值、用例编排、领域状态转换、稳定领域错误、平台无关权限与持久化策略，都必须在共享 core 中实现并通过明确 API 暴露；即使当前只选择一个适配器也同样适用。
- CLI、TUI、MCP、GUI 必须保持薄适配层，只负责运行时与依赖装配、接口语法/协议结构解析、展示和交互状态、调用 core，以及把 core 结果与错误映射为接口输出；不得复制、改写或另建业务规则、权威业务状态、迁移、权限策略或平台无关校验。
- 系统托盘、窗口/WebView 生命周期、通知、自动启动、终端焦点/按键/恢复、MCP stdio 传输和 CLI 参数/退出码等接口或平台机制留在对应适配器；它们触发的业务动作仍必须调用 core。真实边界需要时可由 core 定义运行时中立的能力接口并由适配器实现，但不得为假想需求预建抽象。
- TUI 固定采用 Ratatui、tui-realm 与 tui-realm-stdlib；Tauri GUI 固定采用 Vite、React、TypeScript、Mantine UI、`@tabler/icons-react`、TanStack Router 文件路由、TanStack Query、Jotai、ESLint/`typescript-eslint`、Prettier、Vitest 与 Testing Library。各直接依赖与受管工具必须声明满足已批准能力、平台、MSRV、Node.js 与 WebView 约束的最低兼容稳定版本范围，并在声明的最低工具链中通过最低版本解析和相关测试；锁文件只固定当前实际解析结果。偏离技术族或精确锁死普通依赖版本都必须形成硬规则例外 ADR。
- Tauri GUI 的界面国际化（i18n）是初始化硬性必选项，不是可选增强：前端固定采用 `i18next` 与 `react-i18next`，Rust 后端（GUI 适配器层）固定采用 `rust-i18n`，系统语言探测统一使用官方 `tauri-plugin-os` 的 `locale()` API 作为前后端唯一探测来源。默认语言必须跟随首次启动时探测到的系统语言，固定托盘、侧栏、设置、关于与赞助资源提供中文与英文，缺少对应翻译资源时回退英文；GUI 必须在固定设置页提供可发现的中英文切换入口，用户手动切换后的选择必须持久化并覆盖系统探测结果，同时无需重启地刷新 Rust 托盘菜单。托盘稳定 ID 不得成为可见文字，任何未翻译的 `tray.*` 原始键都阻断初始化。core 保持语言无关，只暴露语言中立的稳定标识供适配器本地化。偏离必须形成硬规则例外 ADR（详见 ADR-20260806-001 与 ADR-20260825-008）。
- GUI 初始化强制使用官方 `tauri-plugin-single-instance`：根 `[workspace.dependencies]` 声明经过最低直接版本验证的兼容稳定下界，GUI member 只以 `workspace = true` 继承，且该插件必须是 Tauri Builder 注册的首个 plugin。同一用户会话再次启动相同应用身份时，第二进程必须通知既有实例后退出，只复用 `restore_main_window` 恢复、取消最小化并聚焦既有 `main` 窗口，不得创建第二个长期应用主进程或主窗口。中性脚手架回调忽略且不得记录启动参数和工作目录，不把它们解释为产品动作；文件关联、深链或参数转发需另行批准并由 core 判定。必须包含 `single_instance_plugin_is_registered_first`、`second_launch_restores_existing_main_window` 两个固定命名回归，并在真实宿主双启动同一精确二进制，证明第二次启动退出、既有 PID/同一窗口持续且只剩一个长期应用主进程/主窗口；缺少依赖、首插件顺序、回调、回归或唯一性证据都阻断初始化。Linux Snap/Flatpak 渠道还必须声明官方插件所需的会话 DBus own/talk 权限并在真实沙箱候选验证。
- Rust 技术选型固定为：Tokio 负责异步运行时；获批 HTTP 使用 Axum + Tower/Tower HTTP；Clap 负责 CLI；SeaORM 负责关系型 ORM；真实配置使用 config-rs，`notify` 仅用于批准的窄热重载；本地可观测性使用 tracing + tracing-subscriber + tracing-appender；稳定错误、应用上下文、序列化与日期时间分别使用 thiserror、anyhow、serde 与 jiff。OpenTelemetry OTLP/HTTP 只在产品、隐私、采样、endpoint 和失败行为获批后默认关闭地接入。偏离必须形成硬规则例外 ADR。
- 固定选型表示“能力出现时采用该技术”，不表示中性初始化无条件安装全部依赖。OpenAPI 使用 utoipa + utoipa-axum + Scalar code-first，GraphQL 使用兼容的 async-graphql + async-graphql-axum，非关系型能力优先官方 MongoDB async driver 与 redis-rs Tokio，本地认证优先 jsonwebtoken + Argon2id；这些组合全部只在真实消费者、数据或安全边界获批后引入。Axum 标准不恢复独立 WEB 适配器。
- 异步优先是硬约束：下游 core 与全部 Rust 适配器只要涉及真实 I/O、等待、计时、进程、协议或跨边界调用，默认必须实现为异步，只有确认调用链纯 CPU 密集、无等待点时才保留同步实现；每个 spawned task 必须有 owner、取消、并发上限和关闭回收，timeout 不是业务成功，锁不得跨越不受控 `.await`。core 默认暴露运行时中立的 async API，只有真实业务需要 Tokio 具体原语时才增加 Tokio 生产依赖（见 ADR-20260806-002）。
- 已启用 tracing 时，结构化 event/span 必须通过 tracing-subscriber + tracing-appender 同时落盘到本地可读、可滚动日志文件；OpenTelemetry 默认关闭且不替代本地日志。标准输出仍只用于统一 JSON 信封，日志不得记录密钥、令牌、个人数据或未脱敏业务载荷（见 ADR-20260806-002）。
- 产出物验收以真实可用为准：对产出物给出“完成”“可用”结论必须基于真实运行产出物本身得到的可观察结果，不得以模拟实现、测试替身、占位页面或仅调用内部函数的结果冒充验收证据；单元/集成测试仍可对不可控外部依赖使用受控测试替身保证确定性，但该替身证据不能替代产出物真实可用的验收依据（见 ADR-20260806-002）。
- 产品规格缺失或为 `Draft` 时仅允许无业务副作用的 `scaffold status`，CLI JSON 明确返回 `productDefinitionRequired=true`；它只能证明中性工程骨架，不是可验收的产品里程碑。
- 选择 GUI 时必须在中性初始化中调用 `$desktop-prepare-gui-app-identity` 的 Logo 模式：实际生成正好 3 个 1024×1024 PNG 候选并同时展示，等待用户明确选择；选中母版逐字节复制为运行时 `/app-identity/logo.png` 并由项目本地 Tauri 工具生成平台图标，三个候选与选择、路径、摘要记录在 `docs/GUI_APP_PROFILE.md`。不得以文字方案、静默默认或中性占位图完成初始化。首次真实产品 GUI 开发前再次进入完整身份模式，补齐窗口身份、应用说明与分发资料。
- 选择 GUI 时，中性初始化必须从初始化 Skill 的受管资产创建项目内 `<项目标识>_gui/src-tauri/dmg/background.png`：它是无产品身份的 660×400 PNG，清楚表达把应用拖到 Applications 的动作；Tauri 配置固定通过 `./dmg/background.png` 引用，并使用应用 `(180, 220)`、Applications `(480, 220)` 落点。首次真实 GUI 开发必须预览批准该基线或在同一路径替换并记录 SHA-256；初始化 Skill 删除后，运行时与构建不得继续依赖其源资产。
- GUI 初始化强制启用 Tauri `tray-icon`，系统托盘不是可选增强：托盘使用应用图标，菜单稳定 ID 恰好为 `show_window` 与 `quit`，可见标签必须通过 `rust_i18n::t!("tray.show_window")` 与 `rust_i18n::t!("tray.quit")` 按当前规范化 locale 解析；中文精确显示“显示窗口/退出”，英文精确显示“Show Window/Quit”，未知 locale 回退英文，设置页运行时语言切换必须无需重启地刷新既有托盘标签，任何 `tray.*` 原始键可见都失败。显示动作与主鼠标左键释放恢复、取消最小化并聚焦主窗口，主窗口关闭只 `prevent_close()` 后隐藏且进程继续，只有 `quit` 显式结束应用，默认不加入自动启动。初始化完成必须同时有结构检查、三个托盘生命周期回归、`tray_labels_resolve_for_supported_locales`/`tray_labels_fall_back_to_english`/`language_change_updates_tray_menu_labels` 三个托盘 i18n 回归和真实宿主生命周期证据；不得因 Draft、宿主差异、页面简单或实现偏好省略/降级，宿主无法观察托盘同样阻断基线提交。初始化同时建立 `{applicationName} v{version} {contactChannel}:{contactValue}` 动态标题和 `136px` 固定单态左侧菜单，不得提供展开/折叠状态或开关；选中的 `56px` 应用 Logo 永远位于侧栏顶部，带一个小写 `v` 的权威当前版本紧随其下。每个产品功能项和赞助/设置/关于固定项必须提供 `30px` 图标，固定图标在上、名称在下，名称使用 `11px` 字号、`10em` 行内宽度、水平居中和最多两行，并保留完整可访问名称，不得使用 Tooltip-only 名称。产品功能从顶部向下注入，底部固定组按视觉顺序为赞助、设置、关于，即从窗口底部向上为关于、设置、赞助，固定路由为 `/sponsor`、`/settings`、`/about`。主应用窗口在 Tauri `app.windows` 中使用 1440×900 逻辑像素、最小 960×640、居中且防止溢出；默认尺寸可同时横向显示固定侧栏和三张赞助档位卡，并与 660×400 的 DMG 安装卷窗口保持独立。Mantine 根默认跟随系统并通过唯一主题模块同时提供亮色/暗色的页面背景、surface、主/次文字、边框和强调色；设置页只展示应用/版本、中英文切换和浅色/深色/跟随系统三态并以 GUI adapter 的设备级本地存储持久化，不得包含隐私标题、统计同意、未配置占位或对应固定翻译键。赞助页依据运行时有效主题选择背景叠层、surface 和对比色，不把初始化宿主主题冻结进产物。手动检查更新入口及其状态位于关于页，旁边固定提供本地“更新日志”按钮并从候选资源展示近 5 版。关于页同时展示当前应用名/权威版本、作者、作者联系方式和三段免责声明；赞助页展示三档品牌内容并打包完整 sponsor 媒体。`$desktop-prepare-gui-support-surfaces` 携带这些共享品牌资产与模板。Harness 仍不预创建 `docs/GUI_SUPPORT_SURFACES.md`；没有完整产品出站配置时关于页更新显示 `NotConfigured`、检查按钮禁用、日志按钮可用，固定界面保持零出站。只有产品明确启用统计时才另建产品级明确同意界面。
- GUI 托盘的应用图标必须来自项目本地 Tauri `icon` 生成并由 `bundle.icon` 引用的 `icons/32x32.png`；该文件必须是普通非符号链接、32×32 8-bit RGBA 非交错 PNG，且至少一个像素非透明。托盘安装从 Tauri Builder `.setup(...)` 可达，在同一实现绑定双项 `Menu`、必需的 `default_window_icon()`、`.icon(...)` 并成功 `.build(app)`，默认图标缺失即失败；关闭隐藏处理从 `.on_window_event(...)` 可达。结构检查验证这些资产/配置/运行时接线，真实 E2E 必须看见非空托盘图形；透明点击区域、仅能打开菜单的不可见占位和未调用死代码都不构成完成。Linux 还必须实际把菜单绑定到 tray builder。
- GUI 图标统一使用直接依赖 `@tabler/icons-react` 的命名组件：菜单、操作、状态、空态和图表周边控件存在适用图标时优先从该包选择，不另装图标库，不用手写 SVG、字符或 emoji 替代；图表绘制库仍由真实数据可视化需求决定。固定单态侧栏中的 Logo、所有当前渲染图标和下方文字必须沿同一中心线水平居中且无裁切。
- 含 GUI 的下游在初始化单元测试通过后、裁剪初始化能力和创建唯一基线提交前，必须固定执行一次 `$desktop-test-gui-initialization-e2e`：先以 `verify-gui-lifecycle-contract.mjs` 检查单实例依赖/首插件/回调、托盘 feature、非透明 32px RGBA 图标/配置引用、从 `.setup` 可达的 Menu/icon/build/关闭事件接线、稳定 ID、`rust-i18n` 标签解析、双语资源和八个有断言固定命名回归，再以 `pnpm tauri build --debug --no-bundle` 生成并双启动本次真实本机调试二进制。第二次启动必须自行退出，既有主进程与同一主窗口持续且窗口恢复、取消最小化并聚焦，宿主枚举只剩一个长期应用主进程/主窗口。Computer Use 还必须实测真实托盘存在可见非空图形、中文“显示窗口/退出”与英文“Show Window/Quit”可无重启刷新且无 `tray.*` 原始键、原生关闭只隐藏且进程继续、左键与显示项均恢复聚焦、退出项结束进程并移除图标，同时验证主窗口可见、固定单态侧栏尺寸/排列/居中、默认设置页无隐私/统计区块、可访问树中所有当前渲染菜单页面均可达。它独立于 `milestone_e2e`，失败/超时/取消/唯一性无法判定/只能定位空白点击区域/无法观察/无法执行均阻断初始化；它不生成 release 候选、不写 Verification，也不替代最终候选 E2E。
- 产品启用更新时必须使用官方 Tauri updater 的签名制品、公开验证密钥和受限 HTTPS endpoints，签名验证不可关闭，并拒绝降级以及 target、arch、channel 不匹配。检查状态固定为 `NotConfigured`、`Idle`、`Checking`、`UpToDate`、`OptionalUpdate`、`RequiredUpdate`、`Failed`，失败不得伪装为最新版。强更只由 adapter 验证过真实性和目标绑定的 `minimumSupportedVersion` 交给 core，以严格 SemVer 得出；不得信任远端 `forcedUpdate` 布尔值。`RequiredUpdate` 使用根级不可关闭门，只允许安装已验证签名更新或安全退出。任务必须由应用生命周期拥有并具备单飞、取消、超时和关闭回收；一般网络/策略失败默认 fail-open。真实远程能力未批准时保持禁用和零出站。
- 统计上报默认关闭且不进入初始化设置页。只有产品明确启用统计能力并建立受保护产品事实与独立产品级明确同意界面后，才允许每进程一次 `app_started`，由 Rust GUI adapter 以 HTTPS JSON `POST` body 发送文档声明的精确字段白名单；禁止 GET/query、自由文本、业务载荷、令牌、路径、用户名、主机名和稳定设备/安装标识。队列只驻留内存且最多 32 条，同一时刻最多一个在途请求，撤回同意立即取消并清空，任务与至多两次重试必须可关闭回收；任何新增事件、字段、稳定标识或持久队列都需重新批准。桌面客户端不得保存服务端共享秘密或发布私钥。更新 banner 只有产品选择时进入 bundle，真实 endpoint、统计接收方、公开 updater 配置与安全密钥引用只进入受保护产品事实。
- 初始化完成后删除实例化、初始化和模板专用派生入口，同时保留非空 Skills 地图和约束地图，以及适用的开发、验证、发布、身份改名和 `$desktop-upgrade-harness` Skills。
- 文件、中文业务注释、文档、测试与例外统一遵守 `docs/ENGINEERING_RULES.md`。Rust 下游从 Cargo workspace 根运行中文声明注释检查器；GUI 下游另外通过 TypeScript Compiler AST 门禁检查明确声明并接入 lint/validator。机械门禁不检查全部字段、局部变量、闭包或普通匿名回调，不自动生成套话，且只证明注释存在；语义仍由人工/Agent 复核。非 GUI 下游不适用 TypeScript 门禁。
- 文件规模按上述分层门禁治理；Rust、前端和其他人工维护文本分别使用 400/800、500/1000、500/2000，具体后缀分类、职责复核和排除边界以 `docs/ENGINEERING_RULES.md` 为唯一详细来源。

### 收敛的开发与构建闭环

- 日常开发统一直接进入 `$desktop-implement-change`。Agent 只完成当前批准范围、增加或更新本次开发所需的相关单元/回归测试，并运行这些测试；不因改动多步骤、多模块、中等风险或可并行而自动增加 `$desktop-plan-change`、Work Plan、全仓测试、格式化、lint、静态检查、构建、冒烟、E2E、Verification 或人工复核。
- 产品目标、边界、约束或成功标准真实变化时仍更新 Product Spec；长期重要决定或硬规则例外写 ADR；符合资格的用户/维护者可感知变化写 Changelog。Product Status、Work Plan 和 Verification 只在用户明确要求、跨会话交接、发布/审计或对应事实确有必要时写入，不为日常开发制造占位记录。
- 代码行为变化的本次必要测试至少覆盖核心成功路径和最高风险失败路径；缺陷修复增加回归测试。纯文档、元数据、格式或不可合理单测的机械变更不创建空洞测试，只做证明文件可解析或差异完整所必需的最小检查。
- 安全、隐私、数据迁移、破坏性操作、生产/付费/凭据副作用、对外兼容契约、签名、发布和渠道硬要求仍必须取得相应授权或满足硬门禁；这些是当前风险所必需的边界，不得扩张为每次开发的通用步骤。
- 构建只在用户显式请求时进入对应构建 Skill，不以日常开发完成为由自动触发。每次构建在执行测试或编译前，都必须解析当前构建是否启用 E2E：若用户已在本次请求中明确 `enabled`/`disabled` 则直接复用，否则必须询问一次；持久偏好只作为建议默认值。
- 每次构建必须运行项目全部单元测试并确认发现数量非零。Rust 构建运行 workspace 全成员、全 targets、全 features 的锁定测试；GUI 构建同时运行完整 Rust workspace 与前端单元测试套件。任何单元测试失败或零测试都阻断构建。
- 发布构建 E2E 不与单元测试或编译混跑。选择启用或产品/渠道硬要求时，只在完整最终候选存在后对该候选运行；选择禁用时记录 `Not run` 和剩余风险。唯一例外是 GUI 初始化专用的本机调试二进制 E2E，它是基线提交前的脚手架门禁，不消费构建选择，也不能产生候选验收、签名、发布或人工复核结论。

### 持久 Agent 策略

- `docs/AGENT_POLICY.md` 是下游项目 Agent 策略的唯一持久事实来源，使用可解析的模式定义分别记录 `superpowers`、`parallel_worktree_subagents`、`milestone_smoke` 和 `milestone_e2e`。
- 下游完成初始化前，用户可一次采用推荐预设（Superpowers 为 `disabled`，并行 Worktree/Subagent 与适用冒烟为 `enabled`，E2E 为 `disabled`），也可选择自定义后逐项确认；只有自定义选择明确启用时才可使用 Superpowers。最终四项必须固化为 `enabled` 或 `disabled`，`pending` 不得进入初始化基线提交。
- `enabled` 表示允许 Agent 在适用场景中自行采用，不表示无条件执行；`disabled` 表示跳过可选能力。产品、渠道、安全和外部副作用硬门禁优先于项目偏好。
- 写入型 Subagent 只有用户在当前请求中明确要求并行、并行偏好为 `enabled`、任务可安全拆成至少两个无重叠写入单元且 Worktree 门禁通过时才使用；否则 Agent 自行采用单 Agent，不重复询问。
- 冒烟偏好只在完整候选验收时消费。`milestone_e2e` 是每次构建询问时展示的建议默认值；无论它是 `enabled` 还是 `disabled`，都不能替代当前构建的明确选择。若本次构建请求已明确选择则不重复询问，否则构建前询问一次。
- 初始化首次写入策略时允许尚无 ADR；后续永久变更策略必须由用户确认并记录当日 ADR。临时任务约束只写入计划/验证证据，不静默改写项目策略。

### 下游 Harness 工程升级

- 新增并在下游永久保留 `$desktop-upgrade-harness`，用于从用户明确提供的 Harness 来源升级工程治理部分。
- 升级默认只生成试运行计划，要求来源 Harness Git 工作区干净并把来源 `Version.md`、`HEAD`、目标分支/提交/工作树脏状态摘要、路径和控制文件状态绑定到受审计划；未解决冲突前不得写入。
- 下游使用 `.harness/upstream-lock.json` 记录上次应用的 Harness 版本/来源和受管文件基线摘要；该文件不是产品版本事实源，不能替代根 `Cargo.toml`。
- 升级清单把内容分为 `managed`、`merge-sections`、`conditional`、`protected` 和 `tombstone` 五类；`managed-self` 是 `managed` 的机器子模式，用于保证更新器自身在普通受管文件后按稳定顺序更新。产品源码、测试、产品记忆、项目状态、技术债、身份、接口选择、持久 Agent 策略、许可证、根 `release-notes.json`、Git 历史和未登记本地文件均受保护；GUI 支持界面 Skill 只随 GUI 条件传播，终端下游的 `docs/GUI_SUPPORT_SURFACES.md` 始终受保护。
- `Version.md`、实例化/初始化 Skills、模板校验器、模板方法论文档和 Harness 日期记忆属于 `tombstone`，不得借升级重新进入终端下游。
- 有历史基线时使用三方比较：只有候选和目标均已存在、仅上游内容或普通权限位变化且目标仍匹配基线的 `update` 可逐文件自动应用；`add`、`manual_add` 和 `delete` 必须人工处理并重新生成计划；仅下游变化保留；两边都变化或新增碰撞必须阻断并请求合并决定。没有历史基线的旧下游先执行引导审计，所有重叠项默认冲突，不能猜测共同祖先。
- 用户批准候选后才逐文件应用并在每次写入后重新生成计划；普通 `managed` 完成后才处理 `managed-self`，入口脚本最后替换并用新版复验。升级后运行受影响的非空单元测试和相关验证，不把 Harness 模板校验器复制到下游。

### Rust CLI 与 Tauri GUI 候选构建及发布目录

- `$desktop-build-rust-release` 继续专用于 Rust CLI：默认路线是 Windows、macOS、Linux 原生候选矩阵；只有提供方、权限、三类运行器或结果取回能力在派发前不可用时才回退当前宿主，并记录原因及其他平台 `Unverified`。矩阵一旦启动，任一平台失败、取消或超时都是真实失败。
- 新增 `$desktop-build-tauri-release` 专用于 Tauri 2 GUI 安装包。macOS 宿主可构建原生 macOS DMG，并在项目批准 Windows x64 目标时使用 `pnpm tauri build --bundles nsis --runner cargo-xwin --target x86_64-pc-windows-msvc` 交叉构建 Windows NSIS；不得在 macOS 声称生成只支持 Windows 原生 WiX 的 MSI。
- macOS→Windows 路线只证明 Windows MSVC 目标可编译并生成 NSIS，不证明 Windows 原生运行、安装或签名成功。清单必须记录 `interface: gui`、`artifactKind: installer`、`bundleFormat`、`buildMode: cross-compiled-xwin`、宿主、目标和 `runtimeVerification: Unverified`；需要原生 Windows/渠道证据时仍使用批准的 Windows 运行器。
- 中性初始化在写入脚手架前主动运行一次已选接口环境门禁。初始化完成后的 Tauri 交叉构建先使用当前环境执行真实命令；只有该命令已经失败且诊断明确指向受管 xwin 工具时，`$desktop-check-development-environment` 才分别检查 Homebrew `llvm` 与可能拆分的 `lld` formula，并在安全条件具备时安装缺失的 LLVM、LLD、NSIS、`x86_64-pc-windows-msvc` Rust target 与兼容范围 `cargo-xwin >=0.22.0, <0.24.0`，安装后逐项复探并只重试原命令一次。显式构建、目标选择或缺少环境证据不得提前触发该流程；已存在但缺少必需命令的 formula 或范围外 `cargo-xwin` 视为损坏或不兼容并阻断，不静默替换/重装，缺少既有 Homebrew、安装失败、目标不兼容或复探失败时同样阻断。
- 对 macOS 直接分发的 Developer ID 候选，签名、公证和 ticket stapling 是一个不可拆分的候选阶段。只有 Apple 设备、Developer ID Application 身份、Tauri 支持的一组完整环境凭据或已授权且在线可用的 `notarytool` Keychain profile、`xcrun notarytool`/`stapler` 和批准授权均可用时，才运行不含 `--skip-stapling` 的 DMG 构建；不同凭据模式不得混用，探测不得输出 profile 名或秘密。
- macOS DMG 构建必须在测试前确认项目内 `<项目标识>_gui/src-tauri/dmg/background.png`、GUI 资料中的当前 SHA-256 与 `bundle.macOS.dmg.background: "./dmg/background.png"` 一致，再把该本地拖拽背景、应用与 `/Applications` 落点及 Finder 窗口状态写入真实卷；headless CI 不得无界等待 Finder AppleScript。所有布局写入、签名、公证和 stapling 完成后，构建与里程碑验收都针对当前最终 DMG 只读验证非空 `.DS_Store`、本地背景、唯一顶层应用包与 Applications 链接，随后才计算或接受 SHA-256；不得自动接受软件许可，任何后处理或重打包都使旧签名、摘要和验收证据失效。
- 条件只满足签名而不满足公证/stapling 时，不得输出“仅签名”的 Developer ID 候选。签名公证为可选项时，显式使用 `--no-sign` 生成并记录 `unsigned`；产品或渠道要求签名公证时阻断。任一签名、公证、stapling 或验证尝试开始后失败，必须使 macOS 候选失败，绝不得静默降级。
- Tauri 清单除通用构建字段外，必须记录 `notarizationStatus`、`notarizationReason`、结构化 `notarizationEvidence` 和最终签名作用域。未公证的非 macOS 候选记录 `not-applicable`；macOS unsigned 候选记录 `not-run` 及原因；只有 ticket 已 stapled 且验证通过时记录 `notarized-and-stapled`。
- 初始化使根 `.gitignore` 精确一次包含 `/release/`。CLI 与 Tauri 构建都在任何单元测试或构建命令前安全刷新该目录，并只提交清单声明的普通文件；`release/` 可以保存 `milestoneAcceptance: pending`，目录存在不代表 `ready`、已验收或可发布。
- 构建、签名、公证与结果收集不把 E2E 混入编译或打包命令，也不授权创建或索取凭据、安装 Homebrew、创建标签、发布上传、商店提交或正式发布。构建前解析的 E2E 选择只在最终安装包字节和清单形成后消费；Windows 交叉候选不能用 macOS 宿主结果冒充 Windows 运行验收。
- CLI 与 GUI 候选构建在测试/编译前只读校验根 `release-notes.json` 的最新条目版本和 SHA-256；不得生成、补写、重排或截断。候选包必须包含相对路径 `release-notes.json` 的同一字节，清单记录带单个小写 `v` 的 `releaseNotesVersion`、摘要和包内路径；GUI 关于页消费同一应用资源。

### 商业许可与既有工程边界

- Harness 与收费下游采用非开源企业专有商业许可；根 `LICENSE.zh-CN.md` 和 `LICENSE.en.md` 保持一致，升级不能自动改写法律文本。
- CLI/TUI/MCP 使用 Tokio current-thread 异步入口，GUI 复用 Tauri 的由 Tokio 支撑的异步运行时；核心默认保持运行时中立。
- 根 Cargo 工作区是依赖版本、来源、内部路径和基础特性的唯一来源；目标平台为 Windows、macOS 和 Linux。
- 固定 Rust 技术族只启用满足真实能力所需的最小 feature，并在 Rust 1.90 MSRV、三平台和锁定回归门禁内声明经最低直接版本解析与测试证明的兼容下界；正常锁文件可以解析到范围内较新的稳定版本。anyhow 不得作为公开稳定领域错误契约，tracing 不得记录密钥、令牌、个人数据或未脱敏业务载荷。
- 选择 CLI 时遵守统一 JSON 信封、错误结构、输出流和退出码契约。

## 不包含

- 不在 Harness 根实现具体产品、账户、支付、云托管、远程部署或业务命令。
- 不提供独立 WEB 适配器；Tauri GUI 的本地 WebView 与固定前端技术栈继续保留。
- 不把模拟实现、桩实现、占位实现、中性脚手架、代码片段、开发服务器预览或测试替身当作里程碑产物。
- 除固定 GUI 初始化 E2E 外，不允许在完整最终候选形成前执行 E2E；初始化 E2E 只能证明当前宿主的调试脚手架可构建并满足单实例双启动唯一性、强制托盘完整生命周期与运行时 i18n、固定侧栏、精简设置页和菜单页面可达，不得用它或其他部分通过结果宣称项目已验收。
- 不为日常开发自动创建 Product Spec、Product Status、Work Plan、Verification 或人工复核记录；ADR 与 Changelog 也只按各自事件触发。
- 不把普通缺陷修复、纯重构、格式整理、测试补强或内部清理写成项目记忆流水账。
- 不把文档、元数据或纯机械变更强行包装成带空洞单元测试的发布级工作。
- 不在普通编码、单元测试、发布编译、打包、制品收集或发布元数据命令中混跑冒烟/E2E；显式启用的发布 E2E 只针对已形成的最终候选。GUI 初始化专用调试构建与 E2E 只在一次性初始化收尾门禁中运行。
- 不因项目偏好为 `enabled` 而跳过本次构建的 E2E 选择、强制不可拆任务并行，或授权凭据、支付、发布、生产数据和不可逆操作。
- 不把新版 Harness 整体覆盖到下游，不自动覆盖产品专属规则、本地修改、许可证、策略或项目记忆。
- 不自动创建或索取签名/公证凭据、配置签名身份、安装 Homebrew、创建标签、配置远端、推送、商店提交、正式发布或上传到发布渠道；构建只可在既有批准的非交互条件与授权全部可用时执行对应平台的签名或签名公证一体化阶段。
- 不在 macOS 交叉生成 Windows MSI，不从 xwin 产物推断 Windows 原生运行/安装行为，也不在本轮增加 Linux GUI 交叉构建或统一 TUI/MCP 发布模型。
- 除固定托盘/侧栏/设置/关于/赞助基线使用的中文与英文外，不在本轮为具体产品预设额外语言或业务翻译文案；不为 CLI/TUI/MCP 适配器新增 i18n 义务。
- 不在中性 GUI 中配置或启用真实更新 endpoint、强更最低版本、统计接收方、自动启动、远程帮助或其他出站能力，也不把来源下游的产品名称/标识、固定 endpoint、客户端共享秘密或遥测实例带入 Harness。固定关于页更新入口与更新状态机在未配置时保持 `NotConfigured`/禁用/零出站；默认设置页不包含隐私或统计控件。经项目负责人确认的作者/联系人/免责声明、固定赞助档位/价格、支付码、更新 banner 与小图是产品家族品牌资产包的显式例外。携带静态支付材料不授权真实交易、订单、权益或账户实现。
- 不复制 Rust Server 的单 package/single-bin 架构、默认多线程 runtime 或整套 HTTP 资产；不复制 Web/Extension/Plasmo/Chrome 资产、浏览器数据协议、固定 API BaseURL 或具体依赖版本。
- 不机械要求全部局部变量、循环绑定和普通匿名回调逐项注释，也不自动批量生成“保存变量”“执行处理逻辑”等套话。

## 可靠性与风险约束

- 不覆盖用户修改；出现重叠写入、升级冲突或缺少共同基线时必须默认拒绝。
- 新增或修改业务行为时必须先识别或建立对应 core 用例及其成功/最高风险失败测试，再实现适配器映射；“当前只有一个接口”不构成把业务逻辑放入适配器的理由。适配器独有逻辑必须能够说明其依赖具体接口或宿主，真正偏离 core-first 的行为只能按硬规则例外记录。
- 输入检查必须区分接口语法/协议结构、宿主能力约束与领域语义：前两者属于适配器，值域、跨字段约束、资源状态、业务权限、幂等性和会改变业务结果的默认值属于 core，并在所有接口间保持同一稳定领域错误。
- 精简开发流程不得削弱安全、隐私、数据完整性、外部副作用、发布渠道或法律硬要求；只增加解决当前风险必需的确认和门禁。
- 用户明确要求持久 Todo 时，状态只能在实现和对应单元测试完成后变为 `done`；验收失败必须保留证据并回到编码循环。
- 里程碑必须绑定批准场景、真实产物身份、源码提交、运行环境和验证结果；历史产物或其他提交的证据不能复用。
- 持久 E2E 偏好与当前构建选择必须分离；Agent 逐次解析选择并记录使用或不使用的理由，不把一次选择静默持久化。
- Worktree 辅助程序继续校验 cwd、Git 根、分支、登记 Worktree、写入目标和符号链接边界；它不替代宿主沙箱。
- Harness 升级溯源不能污染下游产品版本；模板版本与下游 SemVer 始终分离。
- 其他目标平台未实际验证时标记为 `Unverified`，不得声称已通过。
- 统一文件行数、中文声明注释、lint、静态与架构检查保留为按需治理能力；只在本次变化需要、用户明确请求或发布/渠道硬要求时运行，日常开发和普通构建不为它们增加独立步骤。行数检查一旦运行，Rust 超过 800 行、前端超过 1000 行、其他人工维护文本超过 2000 行都必须拆分，不能用 ADR、计划说明或警告降级为通过。
- Rust 注释门禁必须解析 Cargo package/virtual workspace、扫描所有成员的 `build.rs`/`src`/`tests`、对非法 UTF-8/NUL/源码符号链接/语法残缺/空扫描失败关闭，并以稳定 JSON、精确行列和 0/1/2 退出码报告。GUI AST 门禁采用相同失败关闭与精确路径原则，生成路由树只按根相对精确路径排除。
- GUI 语言偏好是设备级展示偏好，不是权威业务状态；必须由 GUI 适配器自有的本地持久化位置保存，不得写入共享 core 的持久化层或另建第二套业务数据权威副本。

## 成功标准

- 下游版本 helper 的回归必须证明首功能/周期只升一次 Minor、Minor 归零 Patch、不同缺陷 ID 各升一次 Patch、相同 ID 跨发布仍不重复、回归新 ID 可提升、Major 需用户批准、维护不变、`0..100` 溢出失败关闭、构建只读和正式发布后才重置；初始化、开发、构建、候选收集、验收、发布准备及 Harness 升级保护均由 validator 锁定。
- [x] 页面动作由语义控件自身拥有，点击父 Card/表格行/单元格不会触发子按钮或切换 `Switch`；关于页更新区父级同样不代理检查更新或更新日志动作。
- [x] 关于页“更新日志”可查看近 5 版固定中文结构，每版功能优化/问题修复各至多 10 条；`NotConfigured` 只禁用远程检查，不禁用本地日志。
- [x] GUI 页面会话状态由应用根 Jotai store 在本次进程内跨路由保留，退出后恢复默认且不使用持久存储/URL；成功空页从大于 1 的页码回退第 1 页，加载/错误和第 1 页空结果不循环。
- [x] 发布准备能从上次真实发布边界整理并原子维护 `release-notes.json`，构建/收集只读验证并把同一字节及其版本、摘要、路径绑定进候选，升级不会覆盖下游日志。
- [x] 所有用户可见版本恰有一个小写 `v`，机器版本字段保持无展示前缀的原始值。

- [x] 日常开发不再选择快速/标准/里程碑档位，统一直接实现并只运行本次必要的相关单元/回归测试。
- [x] 日常开发不自动创建 Work Plan、Product Status、Verification、构建、全仓检查、冒烟、E2E 或人工复核步骤；显式请求和必要风险门禁仍可独立触发。
- [x] 代码行为变化的本次必要测试覆盖核心成功路径和最高风险失败路径；纯文档/元数据/机械变更可以使用最小替代检查而无需空洞测试。
- [x] Product Spec、ADR、Product Status、Work Plan、Changelog 和 Verification 只在各自触发条件满足时更新，不再每项需求全量联动。
- [x] 普通缺陷修复、纯重构、格式整理、测试补强和内部清理不再因任务类型写入项目记忆，独立治理与交付事件仍可追溯。
- [x] Harness 与下游可按文件类型机械列出 Rust 401–800 行、前端 501–1000 行、其他人工维护文本 501–2000 行的建议重构/语义复核候选，并分别拒绝 801、1001、2001 行起的硬超限文件；Rust 拆分规则固定为 `<module>/mod.rs` 目录结构，前端不强制 `index.ts` 桶文件。
- [x] 每次显式构建都在开始前解析一次当前 E2E 选择，且持久偏好不能替代这次选择。
- [x] 每次构建都运行项目全部非空单元测试；Rust 覆盖 workspace/all-targets/all-features，GUI 同时覆盖完整 Rust 与前端单元测试套件。
- [x] 里程碑只接受完整、可运行、符合批准场景且不含模拟实现/占位逻辑的真实产物。
- [x] 验收发现缺失或偏差时返回开发循环、增加回归测试并重新验收；只有用户要求持久 Todo 时才重开或新增 Todo。
- [x] 下游初始化一次确认并持久化四项 Agent 策略；后续构建仍逐次确认 E2E，其他能力按策略和适用性判断。
- [x] Harness 源和推荐预设都默认 `superpowers: disabled`；只有自定义选择明确启用后才允许调用 `superpowers:*` Skill。
- [x] 环境门禁只在中性初始化主动执行，或在初始化后真实测试/构建命令已经出现受管环境错误时用于对应安装与单次重试；新任务、新会话、显式构建和环境证据状态都不会触发例行预检。
- [x] `$desktop-upgrade-harness` 提供试运行、来源/基线记录、三方差异、冲突阻断、保护清单、`tombstone` 和更新后验证闭环。
- [x] 旧下游没有基线时进入引导审计，不会把任一端误当共同祖先。
- [x] 规则、相关 Skills、校验器、README、AGENTS、项目记忆和验证文档保持一致。
- [x] Rust、前端依赖及 Node.js/pnpm/cargo-xwin 等带 SemVer 的受管工具要求统一表达为经过验证的最低兼容稳定版本范围；Cargo/pnpm 锁文件只固定当前解析结果，最低版本解析和项目最低工具链测试共同证明下界。
- [x] Rust CLI 构建默认选择 Windows、macOS、Linux 原生矩阵，只有派发前条件不可用才回退当前平台；已启动矩阵失败不会被回退掩盖。
- [x] 构建前原子隔离旧根 `release/` 并创建全新空目录，构建后目录只包含当前构建身份的候选、哈希和清单，并明确区分 `pending` 与 `ready`。
- [x] 已配置且条件可用的非交互签名会被尝试并验证，失败使平台构建失败；签名条件不具备时真实记录 `unsigned`，不获取或泄露凭据。
- [x] Tauri GUI 在 macOS 宿主可通过受测环境门禁构建原生 DMG 与 Windows x64 NSIS 交叉候选，且清单不会把 xwin 结果误报为 Windows 原生运行证据。
- [x] macOS Developer ID 直接分发候选在条件齐全时完成签名、公证、stapling 和验证后再计算摘要；条件不全时禁止只签名中间态，并按渠道要求选择明确 unsigned 或阻断。
- [x] xwin 门禁能分别处理 Homebrew `llvm`/`lld` 拆包并拒绝损坏 formula；公证探测能安全使用一组完整环境凭据或已授权 Keychain profile，且不输出 profile 名或秘密。
- [x] macOS DMG 构建规则要求最终字节具有真实 Finder 拖拽布局，并以只读挂载检查 `.DS_Store`、本地背景、唯一应用包和 `/Applications` 链接；所有后处理都要求重新签名、公证、摘要与验收。
- [x] GUI 初始化携带并创建无产品身份的 660×400 DMG 背景，项目配置固定引用项目内 `src-tauri/dmg/background.png`；GUI 身份流程负责正式批准或同路径替换，构建在测试前校验路径、尺寸、摘要与 Tauri 配置一致。
- [x] GUI 初始化把官方 `tauri-plugin-single-instance` 作为首个 Tauri plugin，第二次启动只唤醒、取消最小化并聚焦既有主窗口后退出，不留下第二个长期应用主进程或主窗口；依赖/首插件/回调结构、两个固定命名回归和真实双启动唯一性证据共同阻止多实例进入基线。
- [x] GUI 初始化实际生成 3 个 1024×1024 Logo 候选并由用户选择，选中母版可追溯到运行时 Logo 与平台图标；强制建立使用应用图标、稳定 ID 恰好为 `show_window`/`quit` 且可见标签由 `rust-i18n` 运行时解析的双语托盘，以及关闭隐藏、两种恢复聚焦与退出生命周期，并以结构检查、六个托盘生命周期/i18n 命名回归和真实宿主 E2E 三层证据阻止托盘再次丢失或泄漏原始翻译键。初始化同时建立带单个小写 `v` 版本的权威动态标题和 `136px` 单态左侧菜单，`56px` Logo 永远在顶部且带 `v` 当前版本紧随其下。每个功能/固定菜单项都有 `30px` 图标，并以图标在上、`11px` 文字在下的方式在 `10em` 宽度内居中显示；没有展开/折叠控件。主应用窗口默认 1440×900、最小 960×640并与 660×400 DMG 安装卷窗口独立；应用根同时提供完整亮色/暗色语义主题，设置页可选浅色、深色、跟随系统并持久化，赞助页在同一产物中分别适配亮色/暗色。功能项从顶部向下，底部固定项的视觉顺序为赞助、设置、关于；固定 `/settings`、`/about`、`/sponsor` 路由，设置页提供中英文切换且不包含隐私/统计区块，关于页提供 `NotConfigured` 检查更新、可用的近 5 版更新日志并显示作者/联系人/免责声明，赞助页默认打包完整 sponsor 媒体。
- [x] GUI 固定直接依赖 `@tabler/icons-react`，适用图标使用命名组件；固定单态侧栏的 Logo、全部渲染图标与下方文字沿同一中心线水平居中且无裁切，图表周边图标优先使用 Tabler，图表绘制能力保持独立。
- [x] 含 GUI 的下游在唯一基线提交前固定通过单实例/托盘结构门禁和一次真实本机调试二进制 E2E，证明当前项目可编译并双启动、第二次启动退出且同一主进程/主窗口被唤醒、只剩一个长期应用主进程/主窗口、真实托盘中英文精确标签可无重启刷新且无原始 key、关闭隐藏/恢复/退出生命周期可操作、固定单态侧栏尺寸/排列/居中、默认设置页无隐私区块、全部渲染菜单页面可达；任一失败或宿主无法判定/观察都阻断，该结果不冒充发布候选或完整验收。
- [x] `$desktop-prepare-gui-support-surfaces` 固化官方签名 updater、认证最低支持版本 + core SemVer 强更、根级不可绕过更新门，以及默认关闭、明确同意、HTTPS JSON POST、无稳定标识、内存有界队列和生命周期回收的统计契约；`$desktop-build-tauri-release` 在启用 updater 时强制产出并验证 archive/`.sig`，安装包签名状态不能绕过更新制品签名。
- [x] 品牌包完整保存 13 项图片资源并以清单绑定尺寸、摘要、用途与支付敏感性，不含来源下游产品名称/标识、固定服务地址、客户端共享秘密或默认网络请求；非 GUI 下游不保留该 Skill。
- [x] CLI/TUI/MCP/GUI、独立 Git 根、一次性初始化裁剪、固定技术栈、双语许可证和版本边界等既有成功标准继续有效。
- [x] 工程规则、规划/实施/验收 Skills、四类适配器 Skills、中性资产和 Harness 回归门禁一致强制 core-first；每个公开业务操作都能追溯到 core API 与 core 测试，接口/平台特性边界不被误判为业务下沉。
- [x] Tauri GUI 的 i18n 技术选型（`react-i18next`/`i18next`、`rust-i18n`、`tauri-plugin-os` 语言探测）已固化为事实标准并写入 GUI 相关 Skills 与基线；默认语言跟随系统语言、界面提供语言切换入口、托盘标签随运行时切换刷新且不显示原始键，core 保持语言无关。
- [x] 下游 core 与全部 Rust 适配器默认对真实 I/O/等待/计时/进程/协议路径使用异步实现，只有纯 CPU 密集且无等待点时保留同步签名，且该边界已写入 `AGENTS.md` 与 `docs/RUST_CLI_TEMPLATE.md`。
- [x] 已启用 tracing 的下游把结构化 event/span 落盘到人类可读、可滚动的本地日志文件，标准输出仍保持单一 JSON 信封，日志不记录敏感信息，且该边界已写入 `AGENTS.md` 与 `docs/RUST_CLI_TEMPLATE.md`。
- [x] 任一路径对产出物的完成/可用结论都以真实运行结果为依据而非 Mock，同时保留测试隔离规则允许的受控测试替身范围，且该边界已写入 `docs/VERIFICATION.md` 与 `AGENTS.md`。
- [x] Rust 固定技术族已扩展为 Axum + Tower/Tower HTTP、config-rs、tracing-subscriber/appender 与按批准启用的 OpenTelemetry；OpenAPI、GraphQL、MongoDB/Redis 和认证组合保持能力触发，不进入中性依赖。
- [x] Tauri GUI 固定基线已扩展为 Vite 文件路由、严格 TypeScript、ESLint/Prettier、Vitest/Testing Library、Mantine 设计规范、可选公开配置、结构化日志与最终 `dist` 静态扫描；除固定本地托盘/关于/赞助支持基线外，不捆绑产品业务起始资产。
- [x] Rust workspace 中文声明注释检查器和 GUI TypeScript Compiler AST 参考门禁均具备精确范围、位置诊断、失败关闭、专项负例与执行/初始化/升级/验证传播；两者都禁止自动套话并保留语义复核责任。

## 当前版本与未来候选

- 当前版本：`202608051301`，`Unreleased`；上海时区格式为 `YYYYMMDDHHMM`，唯一事实来源为根 `Version.md`；时间版本起始值仍为 `202607301002`，`1.0.0` 保留为迁移前旧版本标识。项目负责人于 2026-08-05 明确确认本次版本值；该决定不自动授权标签、源码归档或正式发布。
- 维护状态：Active。
- 未来候选：至少两个真实下游的 Harness 升级前向证据、策略解析器跨平台封装、TUI/MCP 与 Linux GUI 的统一构建产物/签名清单、Tauri xwin/Keychain profile/最终 DMG Finder 布局的真实前向构建证据、宿主级 Worktree 写入强制、依赖供应链维护 Skill，以及首次真实 GUI 下游对单实例双启动、托盘运行时 i18n/关闭隐藏、动态标题、固定单态侧栏/精简设置/关于/赞助页、签名更新安装、强更离线恢复、产品级统计同意/撤回、Vite/AST 门禁和最终 dist 扫描的前向构建证据。
