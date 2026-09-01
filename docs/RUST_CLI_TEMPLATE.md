# Rust 共享核心与可选适配器初始化基线

本文档定义下游项目初始化时采用的默认 Rust 技术基线。Harness 根目录不实现、接收或记录具体产品需求；中性初始化资产位于 `$desktop-initialize-rust-project` 的资产。下游可以在产品目的与核心输入输出尚未确定、规格仍为 `Draft` 时先建立工作区，但不得借初始化推测业务。即使用户在 Harness 源或中性初始化阶段同时提供产品目的、业务规则、专属 UI/数据、远程地址、凭据或发布需求，也必须拒绝并要求初始化完成、切换到唯一终端下游根目录后重新提出。若真实产品需要其他语言或不同架构，必须在终端下游先通过范围闸门并在当日 `docs/adr/YYYYMMDD_ADR.md` 记录理由、风险、适用范围和恢复或迁移标准。

通用工程规则以 [`docs/ENGINEERING_RULES.md`](ENGINEERING_RULES.md) 为唯一详细来源。本文件补充 Rust 工作区、共享核心、Tokio 与可选适配器；CLI 专属规则只在选择 CLI 时适用。

## 固定边界

- 初始化询问 CLI/TUI/MCP/GUI，允许组合；空选择默认 CLI，用户显式未选择 CLI 时不得额外创建 CLI。
- 默认使用一个 Cargo 工作区，至少包含独立核心库和实际选择的适配器成员。
- 产品规格为 `Draft` 时，核心与所选适配器只提供中性状态；CLI JSON 必须包含 `productDefinitionRequired=true`。
- Core-first 是四类接口共同的硬规则。接口/宿主无关的领域类型、业务规则、语义校验、默认值、用例编排、状态转换、稳定错误、平台无关权限、迁移和持久化策略全部属于核心；即使当前只有一个适配器也不得把这些行为放入适配器。
- CLI/TUI/MCP/GUI 只负责自身运行时与装配、语法或协议结构解析、展示和纯交互状态、调用核心，以及结果/错误映射。包含条件、重试或状态决策的多次核心调用必须提升为单个核心用例 API；薄层按职责而不是代码行数判断。
- 适配器可以拒绝无法解析、缺少协议字段或违反宿主能力约束的输入；值域、跨字段约束、资源状态、业务权限、幂等性、可否执行和影响业务结果的默认值由核心判定。格式正确但业务无效的输入必须进入核心，并由所有接口复用同一稳定领域错误。
- CLI 参数/标准流/退出码、MCP schema 注解/stdio 生命周期、TUI 焦点/选择/滚动/按键/终端恢复，以及 GUI 单实例/深链接/全局快捷键、路由/查询/交互状态、窗口状态/WebView/CSP/系统托盘/通知/自动启动留在对应适配器；这些机制触发的业务动作仍调用核心，中性单实例与深链接只恢复窗口，中性全局快捷键能力不预置动作、chord 或 OS 注册。
- 每个适配器必须以非可选普通生产依赖直接依赖核心；核心不得依赖任一适配器、clap、Ratatui/tui-realm、rmcp、Tauri、终端 I/O、进程状态或适配器特有序列化；适配器彼此不得依赖、启动或解析输出。
- CLI、TUI、MCP 使用 Tokio current-thread 异步入口；GUI 复用由 Tokio 支撑的单例异步运行时并使用普通 `async fn` 命令，不创建嵌套运行时。所有 Rust 适配器的 I/O、等待、计时、进程、协议与命令处理默认优先异步。
- 核心可以暴露不绑定具体运行时的 `async fn`。只有真实业务需要 Tokio 的 I/O、时间、同步、任务或进程原语时，核心才增加 Tokio 生产依赖。
- 文件系统、网络、外部进程和操作系统 API 的具体驱动位于适配器或职责明确的基础设施模块；调用策略和领域结果解释仍在核心。只有真实能力边界出现时才由核心定义运行时中立的 trait/port 并在适配器装配实现，不预建服务容器、注册器或假想抽象。
- TUI 固定使用 Ratatui + tui-realm + tui-realm-stdlib。Tauri GUI 前端固定使用 Vite + React + TypeScript + Mantine UI + `@tabler/icons-react` + TanStack Router 文件路由 + TanStack Query + Jotai，并使用 ESLint/`typescript-eslint`、Prettier、Vitest 与 Testing Library；这些技术族适用于 Draft 与 Approved 项目，偏离必须记录硬规则例外。
- Tauri GUI 的界面国际化是初始化硬性必选项：前端固定追加 `i18next` + `react-i18next`，Rust 后端（GUI 适配器层）固定追加 `rust-i18n`，系统语言探测统一使用官方 `tauri-plugin-os` 的 `locale()` API；默认语言跟随系统语言，界面必须提供语言切换入口，core 保持语言无关。实际建立的页面与原生界面提供中文/英文资源，其他缺失语言回退英文；未选能力不得保留对应可见键或原生资源。用户可见设计先按 [UI 设计标准目录](design_standards/README.md)精确匹配，技术细节见 [GUI 基线](../.agents/skills/desktop-add-gui-adapter/references/gui-baseline.md)与 [React 前端基线](../.agents/skills/desktop-add-gui-adapter/references/react-frontend-baseline.md)（见 ADR-20260806-001）。
- 选择 GUI 后无条件调用 `$desktop-add-gui-system-locale`、`$desktop-add-gui-updater` 与 `$desktop-add-gui-window-state`，不询问、不在 `gui-initialization-config` 中写开关。根 `[workspace.dependencies]` 固定声明 `tauri-plugin-os = "2.3.2"`、`tauri-plugin-updater = "2.11.0"`、`tauri-plugin-window-state = "2.4.1"`，GUI member 只以 `workspace = true` 继承；三项一律 Rust-only，不安装对应 JavaScript 包或授予 WebView ACL。updater 未获得完整产品配置时保持 `NotConfigured` 且零出站；window-state 显式只使用 `SIZE | POSITION | MAXIMIZED`，不恢复隐藏、最小化、全屏或装饰状态。中央 Builder 依次注册启用时的 single-instance、启用时的 deep-link、固定 os/updater/window-state、启用时的 notification/autostart/global-shortcut，每项恰好一次；托盘只从 `.setup(...)`/`.on_window_event(...)` 接线。
- GUI 交互事件必须绑定在拥有动作的按钮、链接、`Switch`、`Checkbox` 或菜单项本身，不得由 Card、`Table.Tr`、`Table.Td` 等父级代理。父级有独立动作时只能执行自身语义，并以分别点击控件和周围父级区域的回归证明互不串扰；表格中的 `Switch` 不得因点击行而切换。
- GUI 活动选项卡、查询/筛选、排序、分页页码/每页数量及同类页面工作状态必须由应用根 Jotai store 的模块级 atom 在本次应用进程内跨路由保留；route unmount 与已启用的关闭隐藏/单实例唤醒不能重置，退出后从默认值开始。页面会话 atom 不得使用 `atomWithStorage` 或浏览器/Tauri/文件/数据库/URL 持久化，不得镜像 TanStack Query 数据或 core 权威状态；语言、主题与详细侧栏折叠等明确批准的设备偏好按各自独立契约持久化，侧栏折叠偏好不得进入页面会话 store。查询范围或每页数量变化时页码重置为 1；路由返回后只有查询成功、当前页大于 1 且结果为空时才回退第 1 页并重查，加载/错误和第 1 页空结果不得触发循环。
- 选择 GUI 后必须先解析专门问询：由 `$desktop-instantiate-project` 发起时复用首次写入前表单；直接初始化时在首轮一并询问尚未解析的接口组合与 Agent 策略模式，基础决定完成后再每轮补全一个 GUI 条件字段。基础字段与接口选择必须在同一首轮一次询问；基础字段全部解析后，才按顺序每轮询问一个尚未解析的 GUI 条件字段，不得在复制后重复询问已确认值。把 `system_tray`、`system_notification`、`autostart`、`about_page`、`sponsor_page`、`single_instance`、`deep_link`、`global_shortcut` 的 `enabled|disabled` 与 `sidebar_mode` 的 `compact|detailed` 按该顺序写入 `docs/GUI_APP_PROFILE.md` 唯一 `gui-initialization-config` 代码块。八项条件能力不得缺失、推断或残留 `pending`；未选择侧栏模式时必须写入 `sidebar_mode = detailed`，显式非法值不得按未选择处理，必须报错并重新确认。最终九项配置不得缺失，且 `deep_link = enabled` 必须同时有 `single_instance = enabled`；不得将固定的 system-locale/updater/window-state 混入问卷或 profile。全局快捷键启用时另写唯一 `gui-global-shortcut-contract` JSON 块，中性初始化固定 `schemaVersion = 1` 与 `actions = []`，明确不绑定默认 chord、不注册 OS 键位、不引入产品动作；禁用时该块缺席。随后由 `$desktop-prepare-gui-app-identity` 的初始化模式在生成前按请求顺序绑定 `candidate-1`、`candidate-2`、`candidate-3`，并始终按该顺序同时展示三个原始候选。用户选择前不得验证格式、尺寸、色彩、像素、摘要或质量，也不得执行转码、缩放、裁剪、补边、改色、压缩、覆盖重命名或标准化；生成失败只重试原标识。用户明确选择后只验证和按需标准化所选项，拒绝项不补做处理。最终母版固定保存为 `<项目标识>_gui/src-tauri/icons/app-icon-master.png`，逐字节复制为 `<项目标识>_gui/public/app-identity/logo.png`，再用项目本地 Tauri `icon` 命令生成平台图标；profile 按稳定顺序记录三个候选标识与选择，只保存所选项的后置验证、路径和摘要。缺少配置、候选、稳定顺序、选择或最终字节一致证据不得完成初始化。
- 仅当 `single_instance = enabled` 时调用 `$desktop-add-gui-single-instance`：根 `[workspace.dependencies]` 声明 `tauri-plugin-single-instance = "2.4.4"`，GUI member 只使用 `workspace = true`，插件必须是 Tauri Builder 注册的首个 plugin。`deep_link = enabled` 时该根依赖还必须精确开启 `features = ["deep-link"]`，禁用深链接时不预开 feature。同一用户会话第二次启动相同应用身份时，第二进程必须通知后退出，只复用 `restore_main_window` 恢复、取消最小化并聚焦既有 `main` 窗口，不覆写合法持久几何。中性回调不记录或解析参数/工作目录，深链接 URL 只由深链接 Skill 处理；固定回归为 `single_instance_plugin_is_registered_first` 与 `second_launch_restores_existing_main_window`，真实 E2E 必须证明只剩一个长期应用主进程和同一主窗口。Linux Snap/Flatpak 需声明插件所需的会话 DBus 权限。选择 `disabled` 时不得声明依赖、注册插件、保留回调或运行双启动场景。
- 仅当 `system_tray = enabled` 时调用 `$desktop-add-gui-system-tray` 并启用 Tauri `tray-icon` feature：托盘菜单稳定 ID 恰好为 `show_window`/`quit`，可见标签由 `rust_i18n` 解析为中文“显示窗口/退出”或英文“Show Window/Quit”，未知 locale 回退英文，语言切换无需重启即可刷新。显示项与主鼠标左键恢复、取消最小化并聚焦主窗口；`CloseRequested` 只 `prevent_close()` 后隐藏，`quit` 显式结束应用。六个托盘固定命名回归、结构检查与真实宿主场景都是启用后的硬门禁。选择 `disabled` 时不得启用 feature、安装托盘、保留菜单/locale 资源、调用 `prevent_close()` 或隐藏窗口；必须由 `.on_window_event(...)` 接入主窗口 `CloseRequested` 并显式调用 `AppHandle::exit(0)`，再由 `close_last_window_exits_application` 回归及真实 E2E 锁定。
- 仅当 `system_notification = enabled` 时调用 `$desktop-add-gui-system-notifications`：Windows/Linux 使用官方 `tauri-plugin-notification = "2.4.0"` Rust API，macOS 使用 `mac-usernotifications = "0.3.1"` 的 modern User Notifications；这些版本是当前验证过的兼容下界。WebView 只调用 Rust command，不安装前端 notification 插件。权限和投递由生命周期拥有的串行 worker 处理，默认关闭，授权成功后才持久化，失败可见，关闭不伪造撤销 OS 权限。中性初始化不定义产品触发点或正文；`disabled` 时依赖、插件、worker、命令、设置、i18n 与事件全部缺席。
- 仅当 `autostart = enabled` 时调用 `$desktop-add-gui-autostart`：使用官方 `tauri-plugin-autostart = "2.5.1"` Rust 插件和 Rust command，该版本是当前验证过的兼容下界。设置默认关闭，以 OS 登录项为权威状态；切换失败必须返回稳定错误、重新读取实际状态并提供可访问反馈。未启用托盘时启动必须显示主窗口；初始化 E2E 必须恢复执行前登录项状态。`disabled` 时依赖、插件、命令、设置与权限全部缺席。
- 仅当 `deep_link = enabled` 时调用 `$desktop-add-gui-deep-link`：声明 `tauri-plugin-deep-link = "2.4.10"`，强制 `single_instance = enabled` 及其 `deep-link` feature，并在 single-instance 后紧接且唯一注册。中性初始化只接受身份派生的 `app-<kebab-id>://restore`，拒绝 query、fragment、userinfo、port 和其他 payload；Rust-only 冷启动 current URL 与热启动 `on_open_url` 共用校验后只恢复窗口。macOS debug no-bundle 不得冒充已验证安装包的 OS scheme 注册。`disabled` 时依赖、single-instance feature、配置、监听、ACL、文案和回归全部缺席。
- 仅当 `global_shortcut = enabled` 时调用 `$desktop-add-gui-global-shortcut`：声明 `tauri-plugin-global-shortcut = "2.3.2"`，读取唯一 `gui-global-shortcut-contract`，不预设 chord、动作、绑定策略或界面位置。配置以可空 `Option<String>` 表达未绑定，逐项区分期望配置与 OS 实际注册；非空绑定由官方解析器规范化并拒绝无修饰键/重复项，完整替换在注册或持久化失败时原子回滚。Rust action 表必须与 contract 的数量、ID、策略、chord、dispatch 与 `e2eSafe` 逐字段一致，target 只接受稳定 ASCII snake_case/点分 snake_case，并由无 wildcard/no-op 的 typed dispatcher 映射到宿主动作或单个 core 用例。回调只响应 `ShortcutState::Pressed`；退出、初始化失败和 E2E 清理只注销模块 owned chord。中性空 contract 启动不得注册或显示任何快捷键 runtime/UI/i18n；`disabled` 时 contract、依赖、插件、注册器、状态、配置、UI/i18n、ACL 和回归全部缺席。
- GUI 初始化固定建立动态标题、`/settings`、语言与三态主题和完整亮暗语义主题；`/about`、`/sponsor` 分别只在对应选择启用时建立，未选页面不得有路由、入口或运行时资源。初始化器先读取 [UI 设计标准目录](design_standards/README.md)，按 `sidebar_mode` 精确命中 [Tauri GUI 左侧栏标准](design_standards/tauri_sidebar.md)，不得让 Harness 旧默认覆盖已批准产品规则。compact 当前固定 `80px`、`6px` 内容内边距、`36px` Logo、`22px` 图标、`11px`/`1.25` 全宽居中名称、`56px` 菜单项和 `4px` 项内节奏，不使用固定 `em/ch` 盒且无折叠按钮；detailed 固定 `248px`/`76px`、`72px`/`44px`、`22px` 图标、展开横排与收起右侧零延迟 Tooltip。detailed AppShell 从独立 localStorage 偏好初始化，使用同一 helper 同步 fixed 侧栏、Mantine `navbar.width` 和 `data-navbar-width`；折叠状态不得进入 core、Jotai 页面会话 store、URL 或 Query。功能项从顶部向下增长，底部按已选赞助、固定设置、已选关于生成。主窗口首次启动或状态缺失/损坏/离屏时以 1440×900、最小 960×640、居中回退，后续仅恢复合法的尺寸/位置/最大化状态；托盘隐藏、自启默认可见和单实例/深链接恢复都不覆写几何或持久可见性。全局快捷键只有 contract 声明动作后才建立界面：固定策略显示只读 chord/真实状态，可编辑策略提供录制、取消和清空，具体页面由批准的信息架构决定；空 contract 不显示占位。所选关于页包含检查更新、更新日志、作者、联系方式和三段免责声明；关于页禁用不得移除 updater Rust 基线。更新日志采用 schema v2 中英文翻译对，标题与正文按当前 i18n locale 选择 `zh-CN`/`en-US`，未知语言回退英文。所选赞助页包含双主题布局与完整 `media/sponsor/*`。真实更新/强更/统计仍需独立产品批准，任务受生命周期拥有并回收，客户端不含 secret 或发布私钥。
- GUI 始终复制发布专用 `src-tauri/tauri.release.conf.json`，但只有正式候选构建以 `--config` 合并并把根 `release-notes.json` 唯一映射为候选 `BaseDirectory::Resource/release-notes.json`；中性调试构建不使用它。选择关于页时，根 Tokio 启用 `fs`，GUI member 以 `workspace = true` 继承 `tokio`/`serde`/`serde_json`，注册普通 async `load_release_notes` 窄命令并由 About 默认加载、失败可重试；Rust 与 React 都必须拒绝 schema 非 v2、缺少 `zh-CN`/`en-US` 的翻译对或越过五版/十条上限，不得使用通用 fs 插件、路径参数或同步读取。未选关于页时这些运行时实现缺席，发布候选资源仍按制品契约携带。
- 选择系统托盘时，可见图标来源固定为 Tauri `icon` 生成且由 `tauri.conf.json` 的 `bundle.icon` 引用的 `icons/32x32.png`；它必须是普通非符号链接、32×32 8-bit RGBA 非交错 PNG且含非透明像素。安装函数必须由 Tauri Builder `.setup(...)` 调用，在同一实现绑定双项 `Menu`、必需应用图标和 `.build(app)`，关闭隐藏由 `.on_window_event(...)` 注册；真实 E2E 必须看到非空托盘图形。Linux tray builder 必须绑定菜单。未选托盘时不得保留这些托盘专属实现。
- 固定基线始终保留 system-locale 的探测/归一化/回退/用户偏好优先回归，updater 的 `NotConfigured` 零出站/任务所有权回归，以及 window-state 的精确 flags/忽略可见性/无效或离屏回退/首次启动默认回归。托盘启用时的六个固定回归明确命名为 `tray_show_restores_and_focuses_main_window`、`close_request_hides_without_exit`、`tray_quit_exits_application`、`tray_labels_resolve_for_supported_locales`、`tray_labels_fall_back_to_english` 与 `language_change_updates_tray_menu_labels`；单实例启用时的两个固定回归为 `single_instance_plugin_is_registered_first` 与 `second_launch_restores_existing_main_window`。深链接保留自身四个固定回归；全局快捷键按 contract 的空动作、固定或可编辑模式运行 `$desktop-add-gui-global-shortcut` 声明的公共与条件回归；托盘禁用时改为 `close_last_window_exits_application`。只要求与 profile/contract 选择对应的条件回归，三项固定基线回归不得按 profile 裁掉。
- 选择 GUI 时，中性初始化必须把随 `$desktop-initialize-rust-project` 提供的无产品身份 660×400 PNG 逐字节复制为 `<项目标识>_gui/src-tauri/dmg/background.png`，并让 `tauri.conf.json` 的 `bundle.macOS.dmg.background` 固定引用 `./dmg/background.png`。DMG 安装卷窗口固定为 660×400，应用与 Applications 落点分别为 `(180, 220)` 和 `(480, 220)`；首次真实 GUI 开发由 `$desktop-prepare-gui-app-identity` 预览批准该基线或在同一路径替换，并记录当前 SHA-256。构建只消费项目内图片，不能依赖初始化结束后被删除的 Skill 资产；该安装卷窗口不得覆盖主应用窗口尺寸。
- 初始版本为 `0.1.0`；根 `Cargo.toml` 的 `[workspace.package].version` 是唯一当前版本事实来源，各成员使用 `version.workspace = true`。初始化同时由 `$desktop-manage-version` 创建 `.harness/version-state.json`；它只保存正式发布周期、待发布变化和缺陷 ID 去重状态，受保护且不得成为第二版本事实源。
- 脚手架直接写入当前项目根。核心与接口目录为 `<项目标识>_core`、`_cli`、`_tui`、`_mcp`、`_gui`。
- 首次脚手架在当前项目根创建 `Cargo.toml`，登记核心与实际选择的适配器；未来只扩展该根清单。
- GUI `package.json` 必须直接声明带完整三段兼容下界的 `@tabler/icons-react`，并以命名组件提供菜单、操作、状态、空态和图表周边图标；存在适用图标时不得引入其他图标库、手写 SVG、字符或 emoji。图表绘制库仍按真实可视化需求选择。所选侧栏的 Logo、所有当前渲染图标和文字必须显式沿同一中心线且无裁切。
- 含 GUI 的中性初始化必须在相关非空单元测试后、裁剪初始化能力和唯一基线提交前调用 `$desktop-test-gui-initialization-e2e`。先运行 `verify-gui-lifecycle-contract.mjs` 解析九项 profile，再以 `pnpm tauri build --debug --no-bundle` 形成真实本机调试二进制；始终验证 system-locale/updater/window-state 三项 Rust-only 基线、updater `NotConfigured` 零出站和窗口重启恢复/无效状态回退，按 profile 验证六项条件宿主能力的完整结构、命名回归与实际宿主行为或禁用无残留。单实例双启动、托盘生命周期、通知、自启恢复、深链接宿主事件和全局快捷键真实触发/注销只在对应字段启用时执行；macOS 自定义 scheme 的 OS 注册在 debug no-bundle 阶段明确为 `Not verified`。托盘禁用时实测关闭最后窗口退出。Computer Use 始终验证主窗口、所选侧栏、设置页、实际菜单页面和未选页面缺席；它不消费 `milestone_e2e`，不写 `release/` 或 Verification，任一适用场景失败、无法观察或无法恢复即阻断初始化。
- 完整表单确认后、首次脚手架写入前通过环境门禁检查并按需安装 Git。全部检查完成后创建独立 `main` 仓库，已有有效身份保持不变，缺失字段只在 local 作用域使用 Agent 已翻译/转写的 ASCII 设备账户名和 `<ascii-device-username>@gmail.com` 补齐，再运行仓库级提交模板 `install`/`check`。完成报告必须列出 Git 版本、安装变化、身份及来源/作用域、仓库根、模板状态与基线提交；不得修改 global/system、配置 remote 或把派生邮箱声称为真实账户。
- 中性脚手架的格式、测试和构建证据只证明工程骨架可用，不构成产品目的获批、业务实现完成或可验收产品候选。

## Rust 技术选型事实标准

下列技术族是下游 Rust 的固定事实标准。固定表示已批准能力出现时必须优先采用对应技术，不表示初始化时把所有依赖无条件写入清单；没有真实调用路径、数据模型或可观察目标时不得为占位引入依赖。偏离任一固定技术必须先记录硬规则例外 ADR，包含理由、影响、替代验证和恢复或迁移标准。

| 领域 | 固定技术 | 适用边界 |
|---|---|---|
| 异步运行时 | Tokio | CLI/TUI/MCP 使用 current-thread 入口，GUI 复用 Tauri 的 Tokio 运行时；仅启用真实 I/O、计时、同步或进程能力所需的最小 feature |
| HTTP 服务 | Axum + Tower/Tower HTTP | 仅在产品明确批准 Rust HTTP 服务时引入；Axum 负责路由/提取/响应，Tower 负责通用 middleware 与服务组合，Tower HTTP 只启用真实需要的 HTTP middleware；业务规则仍调用 core，且这不恢复独立 WEB 适配器 |
| CLI 命令行 | Clap | 仅在选择 CLI 时引入；负责参数、子命令、帮助与版本，不承担领域校验或业务默认值 |
| 关系型数据库 ORM | SeaORM | 仅在产品明确批准关系型持久化且 ORM 合适时引入；实体映射与驱动位于基础设施边界，迁移策略、事务语义和业务决策归 core |
| 配置 | config-rs | 仅在存在真实运行配置时引入；采用“编译默认 → 唯一显式配置文件 → 环境变量”的确定性覆盖，schema/语义错误在启动监听或执行副作用前失败关闭；`notify` 只用于明确批准的窄热重载 |
| 本地可观测性 | tracing + tracing-subscriber + tracing-appender | 使用结构化 event/span、可读 fmt layer 与有界滚动文件贯穿批准路径；不得记录密钥、令牌、个人数据或未脱敏业务载荷 |
| 远程追踪 | OpenTelemetry OTLP/HTTP | 只有产品、隐私、采样、endpoint 和失败行为均批准后才引入并默认关闭；未配置时不得产生网络传输，遥测失败不得伪装为业务成功 |
| 应用错误上下文 | anyhow | 仅用于二进制/适配器装配、启动和不可恢复的内部上下文传播；不得成为公开 API 或稳定领域错误类型 |
| 稳定类型化错误 | thiserror | 用于 core、库与可恢复边界错误的类型化定义，并保留可匹配的稳定语义 |
| 序列化 | serde | 用于批准的协议、配置、持久化 DTO 或稳定数据交换；领域类型只有在真实跨边界需要时派生序列化 |
| 日期与时间 | jiff | 负责日期、时间、时区、时间戳和时间跨度；业务规则必须明确时区、时钟来源及可测试边界 |

错误分层必须保持稳定：core 和可复用库用 thiserror 暴露可判定错误，适配器将其映射为接口结果；anyhow 只能在应用边界补充上下文并终止或上报，不能抹去需要跨接口复用的错误类别。tracing 记录错误时使用结构化、可脱敏字段，不以自由拼接的完整输入替代领域事件。

以下组合只作为能力触发后的固定候选，不进入中性依赖：

- HTTP OpenAPI 采用 `utoipa` + `utoipa-axum` + Scalar 的 code-first 路线；Rust 类型/路由是唯一事实源，不另行手写静态 OpenAPI JSON/YAML。
- GraphQL 采用同一兼容版本族的 `async-graphql` + `async-graphql-axum`，且只有批准的真实消费者存在时引入。
- 非关系型持久化分别优先官方 MongoDB async driver 与 redis-rs Tokio 路线；缓存、幂等、迁移和权威状态归属仍需在产品边界中批准。
- 本地身份认证优先 `jsonwebtoken` + Argon2id；只有身份模型、密钥/凭据生命周期、撤销与安全验收全部批准后才可实现，绝不作为脚手架默认能力。

## 初始化与错误恢复环境门禁

| 项目 | 默认值 | 约束 |
|---|---|---|
| Rust 语言版本 | `2024` | 稳定版 Rust；不使用 nightly 功能 |
| MSRV | `1.95.0` | 根工作区写入 `rust-version = "1.95"`，表示最低兼容版本；接受 1.95.0 及以上稳定版，不要求精确等于 1.95.0 |
| 包结构 | 工作区 | 当前根目录下的 `<项目标识>_core` + 所选适配器；当前根同时是独立 Git 顶层目录 |
| 初始版本 | `0.1.0` | 后续由 `$desktop-manage-version` 自动管理：首功能/周期升 Minor 并归零 Patch，独立缺陷 ID 升 Patch，Major 仅由用户批准；三个分量范围均为 `0..100` |
| 锁文件 | 提交根 `Cargo.lock` | 使用 Cargo 生成；不得手工编辑 |
| Git | 全部初始化：稳定版 | 完整表单确认后检查；缺失时按受管平台方式安装 registry/官方渠道当前稳定版并复探，现有可用稳定版直接通过 |
| Node.js | 仅 GUI：`^24.15.0 || >=26.0.0` | 当前完整前端技术族的最低兼容范围；缺失时安装当前受支持 LTS，非 GUI 为 `not-required` |
| pnpm | 仅 GUI：`>=11.24.0` | 缺失时解析并安装 registry 当前最新兼容稳定版；现有范围内稳定版直接通过，非 GUI 为 `not-required` |
| MSVC 构建工具 | Windows 缺失时自动安装 | 验证 Microsoft 签名，安装 C++ 工作负载并复探 |
| Linux 系统开发库（仅 GUI） | Tauri 2 依赖的 webkit2gtk（`webkit2gtk-4.1-dev` 或 `webkit2gtk-4.0-dev`，视发行版而定）、`libgtk-3-dev`、`librsvg2-dev`、`libayatana-appindicator3-dev` 等发行版对应的开发包 | 非 GUI 为 `not-required`；具体包名随发行版包管理器变化，需按目标发行版核对 |
| macOS Xcode Command Line Tools（仅 GUI） | 缺失时执行 `xcode-select --install` | 非 GUI 为 `not-required` |
| Python 3 | 可选 | 缺失时询问是否安装；跳过不阻断初始化，但 Python 检查记为未执行 |

初始化前运行只读探测：

```text
rustup --version
rustc --version
cargo --version
rustc -vV
git --version
# 仅 GUI
node --version
pnpm --version
```

中性初始化在写入脚手架前使用 `$desktop-check-development-environment` 主动运行一次完整适用门禁。初始化完成后，日常开发和显式构建都先运行本次真实测试/构建命令；只有命令已经失败，且命令、退出状态与脱敏诊断明确指向门禁管理的工具链、目标或系统依赖缺失/不兼容时，才运行对应门禁并重试原命令一次。不得仅因新任务、新会话、显式构建、缺少/过期环境证据、工具链要求或版本可能变化而预检。Rust 构建仍阻断于真实缺失工具链，Windows 同时要求 MSVC；只有 GUI 命令的环境恢复才增加 Node.js 与 pnpm，其他接口组合不得为此安装或升级二者。

初始化必须调用 Skill 自带入口；初始化后的错误恢复仍复用同一入口，不得临时重写安装命令：

```text
# macOS / Linux
.agents/skills/desktop-check-development-environment/scripts/development-environment-gates.sh --install-missing --interfaces <selection>

# Windows PowerShell 5.1+
.agents/skills/desktop-check-development-environment/scripts/development-environment-gates.ps1 -Interfaces <selection>
```

成功输出必须包含 `gate.git.status=passed` 与 `gate.rust.status=passed`；Rust 门禁接受 1.95.0 及以上稳定版。Windows 还必须包含 `gate.msvc.status=passed`。GUI 额外要求 `gate.node.requirement=^24.15.0 || >=26.0.0` 与 `gate.pnpm.requirement=>=11.24.0`；Node.js 25 等上游明确不支持的范围失败关闭，不能仅按数字大小通过。其他接口组合把 Node/pnpm 报为 `not-required`。缺失工具安装时选择当前最新兼容稳定版，现有范围内版本不重装。

## 默认依赖

根工作区统一所有成员使用的第三方依赖和工作区内 crate 路径：

```toml
[workspace]
members = ["example_tool_core", "example_tool_cli"]
resolver = "3"

[workspace.package]
version = "0.1.0"
edition = "2024"
rust-version = "1.95"

[workspace.dependencies]
assert_cmd = "2.2.2"
clap = { version = "4.6.6", features = ["derive"] }
example_tool_core = { path = "example_tool_core" }
jiff = "0.2.35"
serde = { version = "1.0.229", features = ["derive"] }
serde_json = "1.0.151"
tokio = { version = "1.53.1", default-features = false, features = ["macros", "rt"] }
```

- 根清单同时声明第三方依赖与工作区内 crate 的路径来源；例如 CLI 对核心的引用只在根清单写入一次。
- 核心默认不需要第三方依赖。只有核心闭环需要时才加入。
- CLI 使用 `clap` 解析参数，`serde`/`serde_json` 输出统一信封，`jiff` 生成带时区时间戳，Tokio 驱动异步入口。
- Tokio 显式关闭默认特性，中性 CLI 只启用 `macros` 和 `rt` 并使用 current-thread 运行时；不得为了方便启用 `rt-multi-thread`、`full` 或线程池。文件、网络、进程、时间、同步或信号特性只有对应能力通过范围闸门后才加入。
- 核心的异步测试可以通过开发依赖使用工作区 Tokio，但这不构成核心的生产运行时依赖。
- CLI 黑盒测试使用 `assert_cmd`；需要额外断言库时再加入。
- 不为中性脚手架默认增加 Axum/Tower、SeaORM、tracing 生态、OpenTelemetry、anyhow、thiserror、config-rs/notify、协议文档、GraphQL、MongoDB/Redis、认证、网络客户端、依赖注入或插件系统；对应能力获批并出现真实使用路径时，必须采用上述固定技术族并从根工作区按需加入。
- Ratatui、tui-realm、tui-realm-stdlib、React、TypeScript、Mantine UI、`@tabler/icons-react`、TanStack Router、TanStack Query 与 Jotai 只在对应适配器被选中时加入；根 Rust 工作区统一 Rust 依赖，前端包清单与锁文件统一 JavaScript/TypeScript 依赖。

## 依赖准入

### 最低兼容版本策略

- 创建下游、增加能力或主动变更依赖时，先查询官方 registry 当前最新的非预发布、非 yanked 候选，再验证实际 API/feature、Rust 1.95 MSRV、peer、Windows/macOS/Linux 与安全门槛；验证通过的最高兼容稳定版成为新的直接依赖下界。清单只表达兼容范围，不写字面量 `latest`。
- Rust registry 直接依赖必须写成包含完整三段下界的 Cargo 兼容要求，例如 `serde = "1.0.203"` 使用 Cargo 默认 caret 语义；普通依赖禁止精确 `=1.0.203`、`*`、无下界范围、tag 或未经批准的 Git revision。内部 path 依赖仍由根 workspace 统一声明，不虚构 registry 版本。
- 前端 `dependencies`/`devDependencies` 必须使用包含完整三段下界的 caret，或上游官方明确支持的兼容范围；禁止裸精确版本、`latest`、tag、通配符或无下界范围。Node.js/pnpm 的兼容事实写入 `engines` 范围；cargo-xwin 等带 SemVer 的受管工具同样使用包含完整下界的兼容范围。旧式精确 `packageManager` 字段不得充当兼容门禁。
- `Cargo.toml`/`package.json` 表达兼容下界，根锁文件固定正常解析得到的实际版本。锁文件由对应工具生成且提交，不得手工编辑；已安装工具处于支持范围内时直接复用，不因不是最新版而升级。
- 新增或提高 Rust 直接下界时，在临时副本中执行 `cargo +nightly update -Zdirect-minimal-versions`，再用根 `Cargo.toml` 声明的最低 Rust 工具链运行受影响的非空测试；该不稳定 Cargo 子命令只用于验证，不成为生产构建依赖。前端在临时配置中使用 pnpm `resolutionMode: lowest-direct`，并在声明的最低 Node.js/pnpm 环境运行类型检查、非空测试和生产构建。最低版本验证不能覆盖日常提交的正常锁文件。
- 只有使用到新 API/feature、修复安全或平台兼容问题，且提高后的下界通过相同验证时，才提高最低版本。日常任务不为追逐版本号自动改写已验证锁文件；依赖更新只运行本次必要单元/回归测试。用户显式请求构建时逐次解析 E2E 选择，只追加全量非空单元测试和实际构建，不自动追加格式、lint、静态或其他开发门禁。

新增或替换依赖前必须记录：

1. 它替代了哪部分复杂度，以及标准库或现有依赖为什么不足。
2. 需要启用的最小特性集，不得默认采用 `full` 或等价全集。
3. 对 Rust 1.95 MSRV、Windows、macOS、Linux 和最终产物体积的影响。
4. 缺失、初始化失败或运行失败时如何映射到稳定错误与退出码。
5. 对应的成功路径、最高风险失败路径和外部依赖失败测试。

固定 Rust、TUI 与 React 技术族不参与“是否采用其他框架”的推荐，只核验能力是否真实需要、哪个当前最新兼容稳定候选和最小特性/包集合能够通过验证。若最新候选无法满足 Rust 1.95、Node.js/pnpm、peer、目标 WebView、三平台或安全门槛，按版本从新到旧选择第一个通过的稳定版并记录原因；仍无组合时报告阻塞，不得盲装 registry latest 或静默换框架。

所有第三方依赖和工作区内 crate 路径都集中在根 `[workspace.dependencies]`，成员的生产、开发和构建依赖只使用 `workspace = true`，不得重复版本、软件包仓库/Git 来源、路径或基线特性。提交根 `Cargo.lock`，验证使用 `--locked`；不得仅凭较新 Rust 编译成功推断 MSRV 仍然成立。

## 推荐目录

```text
Cargo.toml                 初始化时创建的 workspace 根、版本、全部 members 和共享依赖
Cargo.lock
<项目标识>_core/
  Cargo.toml
  src/lib.rs               Draft 时为中性状态；获批实现后为业务规则、领域类型和领域错误
<项目标识>_cli/
  Cargo.toml
  src/main.rs              只委托给 adapter 并返回 ExitCode
  src/adapter.rs           参数、输出信封和退出码映射
  tests/cli.rs             真实二进制黑盒测试
```

只在真实复杂度出现时拆分核心模块或增加 crate。不得为了假想 MCP/GUI 建立接口注册器、服务容器或多层抽象；新适配器将来直接依赖核心即可。

Core-first 要求按职责放置已经存在的业务行为，不要求为未来接口预建 trait、目录层级或额外 crate；“避免过度抽象”也不能作为把接口无关业务留在适配器的理由。

`<项目标识>_cli/Cargo.toml` 示例（核心禁止引入 clap，此片段只属于 CLI 适配器）：

```toml
[dependencies]
clap.workspace = true
example_tool_core.workspace = true
```

目录和 crate 的演进规则：

- `<项目标识>_core/src/lib.rs` 初始化时保持中性单文件；产品定义获批并出现独立领域概念或文件已经难以独立审阅时再拆模块。
- Rust 人工维护的数据结构、trait、函数、方法和测试必须按工程规则提供符合业务逻辑的中文注释；公共 API 文档缺失可以由代码规范检查作为硬失败。
- 不默认创建 `domain`、`application`、`infrastructure` 等层级；边界必须来自已经存在的职责，而不是预期中的复杂度。
- `<项目标识>_cli/src/main.rs` 只建立 Tokio 运行时、委托适配器并返回 `ExitCode`。
- 只有出现独立发布、独立生命周期或 Cargo 强制要求的新依赖边界时才增加 crate。
- 新增每个 crate 时记录它为什么不能只是现有 crate 中的模块。

## 异步与运行时边界

- 核心操作只要涉及真实 I/O、等待、计时、进程、协议或跨边界调用，默认必须定义为运行时中立的 `async fn`，其中不出现 `tokio::runtime::Handle`、`JoinHandle`、Tokio 套接字、进程状态或适配器类型；只有确认调用链纯 CPU 密集、无等待点时才保留同步签名（见 ADR-20260806-002）。
- 适配器负责建立和关闭运行时；核心不创建嵌套运行时。
- 默认异步调用链保持顺序执行；I/O、等待、计时、进程和协议工作优先使用异步 API。只有真实并发需求才使用 `tokio::spawn`；每个任务必须有 owner、取消路径、异常传播、并发上限和关闭回收，禁止无人回收的 detached task。
- timeout 只表示等待边界到期，不能被映射为业务成功；锁不得跨越网络、进程、用户交互或其他不受控 `.await`。HTTP 服务必须在监听前完成必需配置/依赖检查，并在收到关闭信号时停止接收、取消/等待受管任务和有界释放资源。
- CPU 密集操作不得直接占用异步运行时。只有测量证明它属于 CPU 密集工作时，才考虑受控 `spawn_blocking`、专用线程或多线程运行时，并记录选择依据、任务所有权、取消语义、并发上限、资源预算和验证；普通 I/O 并发或只有同步 API 的依赖不构成启用线程的理由。对于后者，应换用具备异步 API 的依赖，或进入范围/硬规则例外确认。
- 核心确需 Tokio 原语时，只启用所需特性，并在当日 ADR 记录理由、适用范围和恢复标准。

## 进程与输出规则

- CLI/TUI/MCP `main` 使用 `#[tokio::main(flavor = "current_thread")]` 建立最小运行时，异步主入口返回适合该适配器的终止结果，不把 `std::process::exit` 用作常规控制流。GUI 使用 Tauri 已有 Tokio 异步运行时和普通异步命令，不另建运行时。
- clap 使用 `#[derive(Parser)]`，并以 `version = concat!("v", env!("CARGO_PKG_VERSION"))` 让 `--version` 从 Cargo 权威版本生成且只显示一个小写 `v` 前缀；机器 JSON、协议字段和 SemVer 比较仍使用不带 `v` 的原始 Cargo 版本。
- 路径参数使用 `PathBuf` 或 `OsString`，不假定 UTF-8 或手工拼接分隔符。
- 标准输出专用于 JSON；每次调用只序列化一个完整文档，以一个换行结束且无 BOM。
- 日志、警告和诊断只写标准错误；领域错误稳定映射到 `docs/CLI_CONTRACT.md` 的错误码和退出码。
- 已启用 tracing 时，结构化 event/span 必须通过 `tracing-subscriber` 的可读 `fmt` layer 与 `tracing-appender` 的有界滚动 writer 同时写入本地日志文件，不得只写标准错误或直接丢弃；日志格式至少包含时间戳、级别、target 和事件消息；标准输出仍只用于单一 JSON 文档，日志文件不得污染标准输出，也不得记录密钥、令牌、个人数据或未脱敏业务载荷。OpenTelemetry 仅在批准后追加独立 layer，默认关闭且不替代本地日志（见 ADR-20260806-002）。
- 破坏性操作要求显式确认参数；非交互模式不得自行确认。

## 初始化与当前平台验证

`assets/rust-lib-cli/` 是共享核心 + 默认 CLI 的中性验证资产。CLI 被选中或使用空选择默认值时可整体采用；显式未选 CLI 时只采用核心结构，并由各接口 Skill 创建所选成员。由 Cargo 生成锁文件。真实项目存在后运行：

```text
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-targets --all-features --locked
cargo build --workspace --release --locked
```

此外，发布候选必须用 `cargo test ... -- --list` 或等价的机器检查确认实际发现至少一个测试；仅执行返回零状态的 `cargo test` 不能证明非空测试门禁。声明 MSRV 兼容时，必须读取根 `Cargo.toml` 的 `rust-version`，并使用该声明的最低 Rust 工具链（当前模板为 1.95.0）实际执行至少锁定依赖检查、测试和发布构建；这是对最低版本的兼容证明，不表示运行或开发工具链必须固定为模板当前下界。较新编译器成功不能替代最低版本证据。

此外必须：

- 中性阶段确认测试数量非零，覆盖核心状态与每个所选适配器；选择 CLI 时覆盖 `productDefinitionRequired=true` 与拒绝未批准业务命令。
- 通过当前平台可用的 Python 3 解释器从 Cargo workspace 根运行 `.agents/skills/desktop-implement-change/scripts/check_rust_chinese_comments.py --root . --json`；它必须扫描所有 member 的 `build.rs`、`src/` 与 `tests/`，并以退出码 0/1/2 区分通过、声明违规和运行错误。非 GUI 项目不适用 TypeScript 注释门禁；GUI 项目还按 React 前端基线从 GUI 前端根运行 AST 门禁。
- 使用 `cargo metadata --no-deps --locked --format-version 1` 或项目保留的等价检查确认每个适配器直接依赖核心、核心不通过 workspace 依赖路径到达适配器或接口框架、适配器彼此不直接或间接依赖；Python 可用时通过当前平台可用的 Python 3 解释器运行 `.agents/skills/desktop-implement-change/scripts/check_core_first.py`，不得依赖 POSIX 可执行位；不可用时必须执行并记录等价的依赖图审查。
- 确认核心异步路径和 CLI Tokio 入口均被实际执行；不得只编译未调用的异步代码。
- 通过真实 CLI 黑盒测试验证 JSON 信封、标准输出/标准错误、退出码和非交互行为。
- 从 Cargo 元数据和配置解析二进制文件与目标目录，不根据仓库文件夹名猜测。
- Windows 二进制文件使用 `.exe`；当前平台成功不能推断其他平台已验证。

中性初始化验证完成后，首次业务实现必须通过 `$desktop-define-product` 明确产品目的、核心输入输出、成功标准和最高风险失败路径，随后直接交给 `$desktop-implement-change`。适配器首次替换 `scaffold status` 或建立公开命令、工具、页面、协议时仍需产品范围确认；构建和完整验收只有在用户显式请求或产品/渠道硬要求时单独触发。

## 按需能力配方

初始化默认不启用下列能力。真实需求通过范围闸门后，使用 `$desktop-implement-change` 对应参考资料：

- 文件读取或写入：`desktop-implement-change/references/capability-file-operations.md`
- 启动外部程序：`desktop-implement-change/references/capability-external-command.md`

配方是选择与验证规则，不是默认业务实现。只有至少两个真实下游项目证明存在稳定重复后，才把配方提升为可组合代码资产。

## 默认值的退出条件

- 共享核心 + 所选适配器：只有真实产品证明其他架构边界更可靠时，才能按硬规则例外 ADR 调整；“当前只有一个接口”、实现方便或避免增加核心 API 都不是可接受理由。
- Tokio：目标平台不支持、嵌入宿主强制其他运行时或实测资源约束不适用时，记录替代方案和迁移验证。
- 核心零生产依赖：标准库实现会显著增加正确性或可靠性风险时，按依赖准入规则增加依赖。
- 单个 Rust 适配器默认只有一个二进制文件：出现独立发布、权限或生命周期需求时才为该适配器增加二进制文件。
- 最小目录：职责已经无法通过当前文件清楚表达时主动拆分；Rust 代码超过 400 行建议重构并复核高内聚、职责单一和职责相近性，超过 800 行强制拆分。多文件模块使用 `<module>/mod.rs` 作为目录入口，把职责相近的子模块置于同一目录；不得保留同级 `<module>.rs` 与同名目录或创建空壳转发层。前端代码使用 500/1000，其他人工维护文本继续使用 500/2000，详细规则以 `docs/ENGINEERING_RULES.md` 为准。

## MCP 适配器硬规则

`$desktop-add-mcp-adapter` 只有在下游用户明确批准后才增加对应适配器；以下是最小可执行硬规则，完整背景与设计依据见 `docs/harness_engineering/agent_first_design.md` §15.5（MCP 契约）、§15.6（单一数据事实来源）与 §15.8（安全与可审计性）。

### MCP 硬规则

- 一个工具只完成一个清晰动作，名称使用稳定的动词和名词；输入参数具有严格模式定义、必填项、枚举、长度和格式约束。
- MCP 工具模式定义不得与其他适配器使用的同一份核心类型/校验规则静默分叉；模式定义字段、约束和错误码必须可追溯到核心的单一事实来源，核心变化后 MCP 模式定义必须同步更新，不允许 MCP 单独维护一份影子定义。
- 读取、写入、执行、破坏性操作采用不同审批级别；对能执行本机程序的工具，默认只允许启动已登记资源，新增路径、删除资源和危险参数须由宿主请求用户审批。

## 开发、构建、完整验收与结果文件

- 日常代码行为实现只运行本次需要的相关非空单元/回归测试；纯文档或元数据变更只做解析或差异完整性所必需的最小检查。不得自动追加格式、Clippy、静态、集成/契约、全仓测试、构建、冒烟、E2E 或完整验收，也不得把开发证据写成候选通过。
- GUI 初始化是上一条日常规则的唯一一次性例外：初始化器在相关单元测试后调用 `$desktop-test-gui-initialization-e2e` 构建并启动 debug/no-bundle 二进制；该结果只证明当前宿主的初始化脚手架，不等同最终候选验收。
- `$desktop-build-rust-release` 负责 Rust CLI 候选编排：默认先使用 Windows、macOS、Linux 原生矩阵；只有跨平台提供方、权限、运行器或结果取回条件在派发前不可用时才回退当前平台。矩阵启动后的测试、构建、签名、打包、超时或取消失败不得被本机成功掩盖；Tauri GUI 候选转交 `$desktop-build-tauri-release`，TUI/MCP 仍使用各自适配器 Skill 的构建与产物门槛。
- `$desktop-build-tauri-release` 在 macOS 上原生构建 DMG，并可使用 `pnpm tauri build --bundles nsis --runner cargo-xwin --target x86_64-pc-windows-msvc` 交叉构建 Windows x64 NSIS。macOS DMG 构建在测试前校验项目内 `<项目标识>_gui/src-tauri/dmg/background.png`、GUI 资料中的摘要和 `bundle.macOS.dmg.background: "./dmg/background.png"` 一致，并在最终字节上只读验证 `.DS_Store`、本地背景、唯一应用包与 Applications 拖拽目标；headless CI 不得无界等待 Finder AppleScript。xwin 路径不得生成或声称生成 MSI，也不得把交叉构建成功当作 Windows 原生运行验证。
- macOS Tauri 直接分发使用全有或全无门禁：设备具有 Developer ID Application 身份、`notarytool`、`stapler` 与一组完整 Apple 公证凭据时，正常 Tauri build 必须完成签名、公证和 stapling；条件缺失且渠道允许时才可显式 `--no-sign`。不得用 `--skip-stapling` 形成候选，一旦签名或公证开始，失败不得静默降级。
- 每次显式构建在任何测试或编译前解析当前 E2E 选择：当前请求已明确时复用，否则询问一次；`milestone_e2e` 只提供建议默认值。构建必须用 `cargo test --workspace --all-targets --all-features --locked -- --list` 或等价方式确认非空，再运行 `cargo test --workspace --all-targets --all-features --locked`；GUI 同时运行前端完整单元测试套件。失败或零测试阻断候选。
- 构建可在项目已有批准的非交互签名钩子、工具和已授权凭据时尝试签名并验证，再把明确标记 `milestoneAcceptance: pending` 的候选写入根 `release/`。条件缺失时记录 `signingStatus: unsigned` 与原因，条件满足后的签名失败则使平台构建失败；签名后计算最终 SHA-256。当前 E2E 选择为 `enabled` 或硬要求为 `required` 时，最终字节形成后交给 `$desktop-verify-delivery`，不得混入编译/打包命令。
- 构建请求、执行和结果本身不创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification；全量单元测试、候选、摘要、签名状态与本次 E2E 选择只写入 `release/` manifest、其声明的相邻制品证据和最终回复。独立触发的 E2E、完整验收或发布再由对应 Skill 按自身规则留证。
- `$desktop-prepare-cross-platform-release` 当前负责默认 Rust CLI Windows/macOS/Linux 原生候选矩阵；所有运行器使用 `fail-fast: false` 留下终态证据。其他接口的统一跨平台打包仍是已公开限制，默认不正式发布。
- `$desktop-collect-release-artifacts` 负责提取并核验平台归档、相邻 SHA-256、签名状态、清单和已有验收证据，不自行构建、签名或运行冒烟/E2E；为构建取回结果时可保留 `pending`，发布准备仍只接受与候选匹配的 `accepted` 证据。
- 初始化确保根 `.gitignore` 精确一次包含 `/release/`。`$desktop-build-rust-release` 与 `$desktop-build-tauri-release` 在任何单元测试或构建命令前先验证独立 Git 根，拒绝 `release` 符号链接/重解析点和路径越界，原子隔离旧目录并创建全新空目录，不通过活动目标目录原地递归删除；完成签名、公证和 stapling 后的最终归档/安装包、哈希、清单先在同根唯一暂存区形成精确普通文件集，再通过目录级原子重命名，将完整暂存区提交为 `release/`。远端工作流必须绑定并复核显式 40 位提交，只上传声明的精确制品集合。目录存在不代表 `ready`。
- `$desktop-prepare-release` 只在完整验收通过后负责版本、变更记录和发布就绪判断，不自动运行冒烟/E2E、创建标签或上传。
- `$desktop-add-mcp-adapter` 只在下游用户明确批准后增加依赖核心的 Rust stdio MCP 适配器；Skill 不自带实现资产。
- `$desktop-add-gui-adapter` 只在下游用户明确批准后增加依赖核心的 Tauri 2 桌面适配器；它自动消费三候选 Logo 与九项 GUI 最终初始化配置，无条件调用 system-locale/updater/window-state 三个固定 Skills，再按 profile 调用 system-tray/system-notifications/autostart/single-instance/deep-link/global-shortcut 六个条件 Skills，并建立选定的关于页、赞助页和精简/详细侧栏；始终建立动态标题、设置页、i18n 与亮暗主题，不自带产品业务实现。
- 三个固定 GUI Skills 的插件与回归不得被 profile、关于页或 `updaterEnabled` 裁掉。六个条件 GUI Skills 各自拥有依赖、运行时、禁用无残留与真实宿主场景；`deep_link = enabled` 额外强制 `single_instance = enabled`，但单实例回调仍不复制 URL 解析。
- `$desktop-prepare-gui-support-surfaces` 为全部 GUI 提供固定壳层和可选择的本地页面/媒体源资产；运行时只纳入 profile 选中的页面与资源。产品修改基线、增加其他支持界面或启用出站能力时再次按需调用；每项出站能力仍必须有精确能力清单、秘密运行时引用、隐私边界、owner/取消/超时和禁用时零请求测试。
- `$desktop-add-tui-adapter` 固定采用 Ratatui、tui-realm 与 tui-realm-stdlib；Tauri GUI 前端固定采用 Vite、React、TypeScript、Mantine UI、`@tabler/icons-react`、TanStack Router、TanStack Query、Jotai、ESLint/`typescript-eslint`、Prettier、Vitest 与 Testing Library。除 GUI profile 选择的本地生命周期和支持页面基线外，四类 adapter Skills 不自带页面/业务实现资产；调用时声明并验证最低兼容稳定范围，由锁文件固定实际解析结果，TypeScript 中文注释检查器作为治理参考随 GUI Skill 保留。
- `$desktop-add-cli-adapter`、`$desktop-add-tui-adapter`、`$desktop-add-mcp-adapter` 与 `$desktop-add-gui-adapter` 分别拥有对应接口边界。
- `$desktop-test-final-artifact-e2e` 只在当前构建明确启用或产品/渠道要求时，通过 Computer Use 验收最终真实产物；它不替代构建和全量单元测试，也不得仅凭持久偏好自动运行。
- `$desktop-test-gui-initialization-e2e` 只在含 GUI 的一次性初始化提交前按九项 profile 运行结构检查和真实本机调试二进制；三项固定基线不完整、启用能力不完整、禁用能力有残留、宿主状态无法观察或恢复、关闭语义或所选侧栏/页面不符都阻断。需安装包注册的深链接平台场景在 debug no-bundle 阶段必须标为 `Not verified`，不得误报通过。通过后随初始化能力删除，升级不得把它重新注入终端下游。
- 每次 GUI 发布在任何测试或编译前解析当次性能选择；选择启用或产品/渠道硬要求时，`$desktop-test-gui-release-performance` 才在正式打包前绑定干净 HEAD 的 release-profile 探针候选，快照并隔离 window-state 持久文件，在每次预热/冷启动前重置为同一基线，并在所有退出路径恢复原字节或原缺席状态后，再对启动、代表性交互、整个进程树 CPU/RSS、重复操作内存增长和进程回收作结论。它独立于 E2E；失败先回实现修复并重建，只有用户显式确认才允许以 `performanceStatus: waived` 保留失败证据后继续。选择关闭且无硬要求时记录 `performanceStatus: Not run` 与剩余风险，不生成探针、性能证据或运行时绑定。
- updater 插件的安装/`NotConfigured` 零出站基线与产品/发布 `updaterEnabled` 严格分离：`false` 只禁止生成和声明 updater archive/`.sig`，不得删除插件；`true` 才开启 endpoint/公钥/channel/target/arch、`bundle.createUpdaterArtifacts`、安全私钥来源、官方制品和实际验签门禁。

候选归档或安装包命名为 `<product>-v<version>-<platform>-<arch>.<ext>`，每个产物必须有相邻的 `<artifact>.sha256` 和清单。清单必需字段、`pending`/`ready` 状态转换、Tauri GUI 附加字段与 xwin/公证记录规则统一以 `docs/RELEASE.md`「发布物命名」为唯一权威来源，本文件不重复维护，避免两份清单说明漂移。

## 官方与主要资料

- [Rust 官方安装](https://rust-lang.org/tools/install/)
- [Cargo 工作区](https://doc.rust-lang.org/cargo/reference/workspaces.html)
- [Cargo 依赖版本要求](https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html)
- [Cargo `rust-version`](https://doc.rust-lang.org/cargo/reference/rust-version.html)
- [Cargo `direct-minimal-versions`](https://doc.rust-lang.org/cargo/reference/unstable.html#direct-minimal-versions)
- [Cargo 构建](https://doc.rust-lang.org/stable/cargo/commands/cargo-build.html)
- [Cargo 构建缓存与产物目录](https://doc.rust-lang.org/cargo/reference/build-cache.html)
- [Rust 标准库 `ExitCode`](https://doc.rust-lang.org/stable/std/process/struct.ExitCode.html)
- [Tokio 运行时](https://docs.rs/tokio/latest/tokio/runtime/)
- [Tokio 特性标志](https://docs.rs/tokio/latest/tokio/#feature-flags)
- [Rust CLI Book：输出](https://rust-cli.github.io/book/tutorial/output.html)
- [Rust CLI Book：测试](https://rust-cli.github.io/book/tutorial/testing.html)
- [GitHub Actions 工作流制品](https://docs.github.com/actions/using-workflows/storing-workflow-data-as-artifacts)
- [pnpm `package.json` 与 engines](https://pnpm.io/package_json)
- [pnpm `resolutionMode`](https://pnpm.io/settings/other)
- [Vite Node.js 要求](https://vite.dev/guide/)
- [`@tabler/icons-react`](https://www.npmjs.com/package/%40tabler/icons-react)
- [Tauri CLI build 参数](https://v2.tauri.app/reference/cli/)
