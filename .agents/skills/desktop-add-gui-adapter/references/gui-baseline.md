# Tauri 桌面 GUI 基线

仅在明确的下游请求通过 GUI 范围闸门后阅读本参考。同时阅读 GUI 所属的 [React 前端基线](react-frontend-baseline.md)。

## 固定默认值

- 将 Tauri 2 与现有 Rust 共享核心及 Tokio 适配器标准配合使用。
- 复用 Tauri 基于 Tokio 的单例异步运行时，并以普通 `async fn` 实现自定义命令；不得创建嵌套 Tokio 运行时。
- 使用 Vite、Mantine UI、`@tabler/icons-react`、TanStack Router 文件路由、TanStack Query 和 Jotai 打包本地 React + TypeScript 前端；使用 ESLint/`typescript-eslint`、Prettier、Vitest 与 Testing Library 作为固定质量工具链。
- 界面国际化是开发期硬性必选项，不是可选增强。Rust 后端（GUI 适配器层）固定使用 `rust-i18n` 输出系统托盘、原生窗口标题、系统通知等未经 React 渲染路径的用户可见文案。所有 GUI 无条件调用 `$desktop-add-gui-system-locale`，以 `tauri-plugin-os = "2.3.2"` 的 `locale()` 作为 Rust 与前端唯一共用系统语言来源；该能力 Rust-only，不安装 `@tauri-apps/plugin-os`、不授予 `os:*` ACL，不得分别使用平台专有 API、环境变量或浏览器语言（见 ADR-20260806-001）。
- GUI 初始化在接口选择后必须进行专门问询，并按固定顺序把 `system_tray`、`system_notification`、`autostart`、`about_page`、`sponsor_page`、`single_instance`、`deep_link`、`global_shortcut` 的 `enabled|disabled` 与 `sidebar_mode` 的 `compact|detailed` 写入 `docs/GUI_APP_PROFILE.md` 唯一 `gui-initialization-config` 代码块。八项条件能力不得缺失、推断或残留 `pending`；未选择侧栏模式时必须写入 `sidebar_mode = detailed`，明确选择保持原值，显式非法值不得按未选择处理。最终九项配置不得缺失或残留 `pending`，后续消费者不得再次应用缺省值。`deep_link = enabled` 必须同时有 `single_instance = enabled`；非法组合必须重新确认，不得自动修正。`global_shortcut = enabled` 时另有唯一 JSON contract，中性初始化固定空 `actions`；禁用时 contract 缺席。system-locale/updater/window-state 是不询问、不进入 profile 的固定 GUI 基线。
- 所有 GUI 还无条件调用 `$desktop-add-gui-updater` 与 `$desktop-add-gui-window-state`，在根 `[workspace.dependencies]` 声明 `tauri-plugin-updater = "2.11.0"` 和 `tauri-plugin-window-state = "2.4.1"`，GUI member 只用 `workspace = true`。两者都是 Rust-only：不安装对应 JavaScript 包，不授予 `updater:*`/`window-state:*` ACL。中性 `tauri.conf.json` 显式配置 `plugins.updater = { endpoints: [], pubkey: "" }`，避免缺席配置被反序列化为 `null` 而阻断真实启动，同时保持无 endpoint、无签名事实与零出站。`UpdateController` 在 endpoint、公钥、channel、target 和 arch 未全部批准时固定返回 `NotConfigured`，不调用 `.check()` 且保持零出站；window-state 只持久 `SIZE | POSITION | MAXIMIZED`，明确忽略 `VISIBLE`、`DECORATIONS`、`FULLSCREEN` 与最小化状态。
- 中央 Tauri Builder 的唯一稳定 plugin 顺序是：启用时的 single-instance 首位、启用时的 deep-link 次位、固定 os、固定 updater、固定 window-state、启用时的 notification、autostart、global-shortcut，每项恰好注册一次。任一独立 Skill 只负责自己的相对顺序与接线，不能自称“首个 plugin”；托盘不是 plugin，只从 `.setup(...)`/`.on_window_event(...)` 接线。
- 仅当 `single_instance = enabled` 时调用 `$desktop-add-gui-single-instance`，声明 `tauri-plugin-single-instance = "2.4.4"` 并把它作为 Builder 首个 plugin 注册。同一用户会话再次启动相同应用身份时，第二进程通知既有实例后退出；回调只复用 `restore_main_window` 恢复、取消最小化并聚焦既有 `main` 窗口，不覆写合法持久几何、不创建第二个主窗口。中性脚手架不记录或解析第二次启动参数/工作目录；同时启用深链接时，根依赖精确开启 `features = ["deep-link"]`，但 URL 只由深链接 Skill 处理。Linux Snap/Flatpak 还必须在对应渠道清单声明官方插件要求的会话 DBus own/talk 权限，并在真实沙箱候选重验。选择禁用时不得声明该依赖、feature、注册插件或保留伪回调。
- 仅当 `deep_link = enabled` 时调用 `$desktop-add-gui-deep-link`，声明 `tauri-plugin-deep-link = "2.4.10"`，强制 `single_instance = enabled` 及上述 `deep-link` feature，并紧随 single-instance 唯一注册。中性初始化从 `project_id` 确定性派生小写 `app-<kebab-id>://restore`，只接受该精确 URL，拒绝 query、fragment、userinfo、port 与其他 payload。Rust-only 冷启动 current URL 与热启动 `on_open_url` 共用校验后只恢复窗口；需要业务路由、app/universal links 或 OAuth 时另行批准并把语义验证下沉 core。macOS 自定义 scheme 的 OS 注册只能由打包应用验证，debug no-bundle 不得冒充。禁用时依赖、single-instance feature、配置、监听、ACL、文案与专属测试全部缺席。
- 仅当 `system_tray = enabled` 时调用 `$desktop-add-gui-system-tray`，并在 Tauri `tauri` 依赖启用 `tray-icon` feature。项目本地 Tauri `icon` 命令必须产出普通非符号链接的 `src-tauri/icons/32x32.png`；它必须是 32×32、8-bit RGBA、非交错且至少含一个非透明像素，并被 `tauri.conf.json` 的 `bundle.icon` 精确引用。托盘安装函数必须由 Tauri Builder `.setup(...)` 实际调用；在同一实现中组装仅含稳定 ID `show_window`/`quit` 的 `Menu`、以 `.menu(&menu)` 绑定、把 `default_window_icon()` 当作必需值、以 `.icon(...)` 绑定并成功 `.build(app)`。可见标签通过 `rust_i18n::t!("tray.show_window")` 与 `rust_i18n::t!("tray.quit")` 按固定 system-locale helper 解析；中文精确为“显示窗口/退出”，英文精确为“Show Window/Quit”，未知 locale 回退英文，运行时切换语言无需重启即可刷新。显示动作及主鼠标左键释放复用 `restore_main_window`；主窗口 `CloseRequested` 由 `.on_window_event(...)` 注册并 `prevent_close()` 后隐藏，只有 `quit` 显式结束应用。选择禁用时不得启用 feature、安装托盘、保留菜单资源、调用 `prevent_close()` 或隐藏窗口；必须由 `.on_window_event(...)` 实际注册主窗口关闭处理，并在 `CloseRequested` 中显式调用 `AppHandle::exit(0)`，由 `close_last_window_exits_application` 回归锁定。
- 仅当 `system_notification = enabled` 时调用 `$desktop-add-gui-system-notifications`。最低直接下界为 `tauri-plugin-notification = "2.4.0"` 与 macOS target-only `mac-usernotifications = "0.3.1"`；macOS 使用现代异步 User Notifications，Windows/Linux 使用官方插件 Rust API。WebView 不安装通知 JS 插件或 ACL。应用偏好默认关闭，开启时权限成功后才持久化；串行 worker 由应用拥有并在退出时回收，失败必须可见。中性 scaffold 不生成产品通知正文或触发器。
- 仅当 `autostart = enabled` 时调用 `$desktop-add-gui-autostart`。最低直接下界为 `tauri-plugin-autostart = "2.5.1"`，Rust command 通过 `ManagerExt` 读取/修改 OS 登录项，使用 `MacosLauncher::LaunchAgent` 且不传隐藏参数。初始化只安装能力，不调用 `enable()`；Switch 以 OS 状态为权威并在失败后回滚。默认启动始终显示主窗口，不从 window-state 恢复隐藏/最小化；真实宿主 E2E 必须恢复执行前的登录项状态。
- 仅当 `global_shortcut = enabled` 时调用 `$desktop-add-gui-global-shortcut`，声明 `tauri-plugin-global-shortcut = "2.3.2"` 并消费唯一 `gui-global-shortcut-contract`。中性初始化 contract 的 `actions` 固定为空，不注册默认 chord；产品模式才按明确需求声明固定或可编辑动作、可空初始 binding 与 typed dispatch。只使用 Rust `GlobalShortcutExt`，不安装 JS 插件或授予 ACL；逐项真实状态、原子替换/回滚、录制 token 与 owned 清理由该 Skill 负责。禁用时 contract、依赖、插件、注册器、状态、配置、UI/i18n、ACL 与专属测试全部缺席。
- 三项固定基线必须保留各自 Skill 命名的非空回归。单实例固定命名回归为 `single_instance_plugin_is_registered_first` 与 `second_launch_restores_existing_main_window`。托盘固定命名回归为 `tray_show_restores_and_focuses_main_window`、`close_request_hides_without_exit`、`tray_quit_exits_application`、`tray_labels_resolve_for_supported_locales`、`tray_labels_fall_back_to_english` 与 `language_change_updates_tray_menu_labels`；深链接保留自身四个回归，全局快捷键按 contract 模式运行其公共与条件回归。只要求 profile/contract 启用的条件能力对应回归；固定基线回归不得按 profile 裁掉。
- GUI 初始化必须先生成三个目标为 1024×1024 PNG 的 Logo 候选，并在生成前绑定 `candidate-1`、`candidate-2`、`candidate-3`；所有预览和选择始终保持该请求顺序。用户选择前禁止格式/尺寸/色彩/像素/摘要验证及任何标准化；选择后只处理所选项，拒绝项不补做处理。最终选中母版、`/app-identity/logo.png` 与平台图标共享同一来源和摘要证据。选择托盘时，`icons/32x32.png` 还必须可见且可追溯，禁止中性占位图或全透明图标进入基线提交。
- GUI 图标固定使用 `@tabler/icons-react` 的命名组件。存在适用图标时不得引入其他图标库、手写 SVG、字符或 emoji；图表相关操作、状态和空态优先使用 Tabler 图标，实际图表绘制库仍按产品需求选择。所选侧栏模式中的 Logo 与每一个当前渲染图标必须沿同一中心线且无裁切。
- 初始化固定建立 `/settings`，`/about` 与 `/sponsor` 分别只在相应选择启用时建立。用户可见布局先按 [`docs/design_standards/README.md`](../../../../docs/design_standards/README.md) 匹配；固定侧栏只消费 [`docs/design_standards/tauri_sidebar.md`](../../../../docs/design_standards/tauri_sidebar.md)。compact 当前为 `80px`、`6px` 内容内边距、`36px` Logo、`22px` 图标、全宽居中名称和 `56px` 菜单项，不折叠且不使用固定 `em/ch` 名称盒；detailed 为 `248px`/`76px`、`72px`/`44px`、统一 `22px` 图标、Tooltip 和独立持久化，由 AppShell 同源同步 `navbar.width`/`data-navbar-width`。功能项从顶部向下增长，底部按已选赞助、固定设置、已选关于的视觉顺序生成。设置页始终提供应用/带一个小写 `v` 的版本、中英文和浅色/深色/跟随系统；仅在 `system_notification`/`autostart` 启用时增加对应默认关闭的异步 Switch，set 成功用返回的最终权威布尔值同步，失败通过 get 重读实际状态而不是恢复组件旧值。全局快捷键空 contract 不显示占位；固定 binding 显示只读 chord/动作/真实状态，可编辑 binding 才按批准页面提供录制/取消/清空。所选关于页包含固定 updater 基线的 `NotConfigured`/零出站检查、更新日志、作者、联系方式和三段免责声明；所选赞助页使用固定品牌档位、权益、双支付码和完整 sponsor 本地媒体。未选条件能力不得存在依赖、feature、插件/生命周期、配置、命令、ACL、Switch/状态、翻译键、路由、入口、运行时资源或专属测试；尤其未选页面不得存在路由、入口或运行时资源。
- 所有 GUI 初始化都复制 `src-tauri/tauri.release.conf.json` 发布专用合并配置，但中性调试构建不使用它。正式候选构建必须显式传 `--config src-tauri/tauri.release.conf.json`，把根 `release-notes.json` 唯一映射为 `BaseDirectory::Resource` 下的 `release-notes.json`；这样不会为了初始化提前创建发布事实。`about_page = enabled` 时注册异步 `load_release_notes` 窄命令，使用 `tokio::fs` 读取且由 Rust/React 双边验证 schema、1 MiB、近 5 版/每类 10 条、最新在前和单个小写 `v`，About 页展示 loading/error/retry；不得授予通用文件系统权限。`about_page = disabled` 时命令、React 加载器、弹窗和文案缺席，但 updater Rust 基线与根级强更门仍保留，正式候选也仍携带该发布事实供 manifest 与制品核验。
- `tauri.conf.json` 的主应用窗口把 1440×900 逻辑像素、最小 960×640、居中与 `preventOverflow: true` 作为首次启动和持久状态缺失/损坏/离屏的回退；合法状态才恢复尺寸、位置与最大化，并必须夹取到当前可见工作区。不恢复隐藏、最小化、全屏或装饰，避免与托盘关闭隐藏、自启默认可见、单实例/深链接恢复及需求声明的快捷键宿主动作冲突。回退尺寸容纳详细展开侧栏，选择赞助页时还应让三张档位卡同屏横向呈现，较小窗口由响应式布局降列。该窗口与 `bundle.macOS.dmg.windowSize` 的 660×400 安装卷窗口互不替代。
- Mantine provider 使用 `defaultColorScheme="auto"`、显式 local-storage color-scheme manager 和唯一 CSS variables resolver；亮色/暗色分别提供页面背景、surface、主/次文字、边框与强调色，设置页允许 `light`/`dark`/`auto` 并持久化。选择赞助页时通过 `useComputedColorScheme` 使用运行时有效主题的明确背景叠层、surface 和对比色，不把初始化宿主主题冻结到产物。
- 原生窗口标题与 `document.title` 固定使用同一公式 `{applicationName} v{version} {contactChannel}:{contactValue}`。应用名/版本来自权威 Tauri/打包元数据，展示边界先去除已有 `v`/`V` 前缀，再规范化为只带一个小写 `v`，联系字段来自品牌 profile 的 `contacts.windowTitle`，不得写死一次构建版本。
- 活动选项卡、已应用查询/筛选、排序、分页页码/每页数量及同类可恢复页面工作状态固定由应用根 Jotai store 的模块级 atom 持有，只在当前程序进程内跨路由以及已启用的关闭隐藏/单实例唤醒过程保留；真正退出后回到默认值。不得使用浏览器/Tauri/文件/数据库/URL 持久化，不得把 TanStack Query 结果或 core 权威状态镜像进 atom。window-state 只持久原生窗口几何与最大化，不得借此保存页面或业务上下文。详细侧栏折叠偏好是单独允许的设备级 UI 偏好。查询范围或每页数量变化时页码归 1；只有成功返回的当前页大于 1 且为空时才回退第 1 页并重查，加载/错误和第 1 页空结果不循环。
- 不得加载远程内容。
- 保持 Tauri Rust 边界轻薄：只验证反序列化、协议必填字段和调用 WebView 能力，随后调用一个核心用例并映射有类型的结果；值域、跨字段约束、资源状态和业务权限由核心验证。
- 调用时为 Tauri/前端直接依赖声明彼此兼容的最低稳定范围，使用最低直接版本解析验证 Rust MSRV、Node.js/pnpm 和目标平台 WebView，再由正常锁文件固定实际解析结果；不得用精确依赖版本或“最新”代替兼容下界。
- 使用 pnpm 作为前端包管理器。初始化阶段由 `$desktop-check-development-environment` 检查 Node.js 和 pnpm；初始化后不得因缺少当前宿主证据预检，先运行真实 pnpm 命令，只有该命令已因受管环境问题失败时才进入对应恢复并单次重试。
- 固定前端同时适用于中性 `Draft` 脚手架和已批准产品。不得根据页面数量把它替换为普通 HTML/ES 模块或其他框架。
- Mantine 主题、布局、状态、响应式与无障碍细节统一遵守 [Mantine UI 设计规范](mantine-ui-guidelines.md)。

## 必需设计输入

记录：

- `docs/GUI_APP_PROFILE.md` 中已批准的应用显示名称、主窗口标题、简短说明、应用标识符、用户选择的图标来源，以及九项完整 GUI 初始化选择；
- 初始化资料还必须包含三个原始 Logo 候选按 `candidate-1` → `candidate-2` → `candidate-3` 的稳定预览顺序、用户选择、仅针对所选项的后置验证/标准化证据、`<project-id>_gui/src-tauri/icons/app-icon-master.png`、`<project-id>_gui/public/app-identity/logo.png` 及平台图标生成证据；不得为未选候选补写摘要或验证结果。选择托盘时还必须记录最终 `icons/32x32.png` 的格式、可见像素和配置引用；
- 固定标题、所选侧栏、设置页及所选关于/赞助页直接读取 `$desktop-prepare-gui-support-surfaces` 的 profile、翻译、React 模板和相应媒体，不要求 `docs/GUI_SUPPORT_SURFACES.md`；只有修改该基线、增加其他支持界面或启用出站能力时才读取下游实例文档，未选择的本地或远程能力不得建立配置、路由、资源或请求；
- 选择 macOS 直接分发 DMG 时，初始化先把中性 660×400 PNG 写入 `<project-id>_gui/src-tauri/dmg/background.png`，`tauri.conf.json` 的 `bundle.macOS.dmg.background` 固定引用 `./dmg/background.png`，窗口与落点固定为 660×400、应用 `(180, 220)`、Applications `(480, 220)`；首次真实 GUI 开发必须记录对该图片的预览批准或同路径替换、SHA-256、文案语言，以及软件许可页是否由产品/渠道要求。背景不得含 Harness 或其他产品身份；
- 已批准的人类使用场景，以及选择桌面界面的原因；
- 主窗口首次/无效状态的 1440×900、最小 960×640 居中回退，后续尺寸/位置/最大化恢复与屏幕/DPI 变化后的可见工作区夹取，以及所选侧栏模式、产品功能菜单项、页面、路由、导航和操作；
- 空、加载、成功、验证、冲突和失败状态；
- 键盘顺序、快捷键、焦点行为、标签和无障碍验收；
- 适用时的稳定 ID、选择语义、批处理范围、搜索、排序和分页；
- 刷新、并发修改、取消和恢复行为；
- 按 profile 所选托盘/通知/开机自启/单实例/深链接/全局快捷键/关闭生命周期之外，必需的文件系统、进程、Shell 或 updater 访问；固定 updater 基线不授权出站，启用真实更新、强更或统计时还需完整产品 profile、endpoint、channel/target/arch、签名/策略公钥、安全私钥引用、同意与保留边界；
- 当前平台打包目标，以及保持 `Unverified` 的其他平台。

## 界面国际化（i18n）

- 初始化已包含真实侧栏与设置页，并可能包含关于页、赞助页和托盘文案，因此必须在中性脚手架阶段接入完整 i18n 技术栈；未选页面或托盘不保留对应可见键和原生资源。
- 默认语言在应用启动时使用 `tauri-plugin-os` 的 `locale()` 探测系统语言；缺少对应翻译资源时回退英文，不得静默显示未翻译的原始 key 或英文与目标语言混排。
- `/settings` 必须提供可发现的中文/英文切换；用户手动切换后的选择必须持久化，并在后续启动时覆盖系统探测结果，直至用户重置。选择系统托盘时，切换事件必须同时刷新当前托盘菜单标签，不得要求重启。
- Rust 端 `rust-i18n` 只负责适配器自身产出的原生文案（托盘菜单、窗口标题、系统通知），不得承载业务规则、领域校验或业务默认值；翻译资源文件与业务代码分离存放。
- 用户的语言选择是 GUI 本地设备级展示偏好，使用 GUI 适配器自有的本地持久化位置保存，不得写入共享 core 的持久化层或借此新建第二套业务数据权威副本。

## 安全与架构规则

- 为打包内容定义明确 CSP。
- 只向命名窗口/WebView 授予能力，并且只包含必需权限和作用域。
- 保持禁用远程 URL 访问。
- 任何支持界面远程能力必须先通过 `$desktop-prepare-gui-support-surfaces` 记录独立能力清单；默认禁用，秘密仅由安全运行时来源提供且不进入前端，任务必须具有 owner、取消、超时和关闭回收。
- 官方 Tauri updater 插件与 `NotConfigured` 零出站状态是始终安装的 Rust 基线，不受 `about_page` 或产品/发布事实 `updaterEnabled` 控制。`updaterEnabled = false` 只使本次候选不生成或声明 updater archive/`.sig`；`true` 才要求受限 HTTPS endpoint、公钥、channel/target/arch、安全签名条件和官方签名制品，且签名验证不可关闭。强更只由 adapter 对认证元数据验证后的最低支持版本进入 core 作严格 SemVer 判定，React 不信任远端布尔字段。`RequiredUpdate` 使用不可关闭的根级门，只允许安装或安全退出。检查失败默认 fail-open 且不能伪装为最新版。
- 统计上报默认关闭且初始化设置页不提供隐私/统计控件；只有产品明确启用并另建产品级同意界面后，才由 GUI Rust adapter 使用 HTTPS JSON POST 发送固定 `app_started` 字段。禁用或未同意时请求数为零；禁止 GET/query、稳定设备/安装标识、自由文本和客户端 secret。撤回同意立即取消请求并清空有界内存队列，失败不阻断主流程。
- 赞助品牌包内支付二维码是敏感静态媒体，仅随所选赞助页进入应用 bundle，且不得被前端解释为订单、支付状态、权益或账户事实。未选择赞助页时这些媒体不得进入运行时 bundle。更新 banner 仍只有选择更新视觉时才进入 bundle，且不授权网络更新能力。
- 窄 Rust 命令能够执行已批准操作时，不得公开通用文件系统或 Shell 访问。
- 候选静态更新日志只允许通过 `load_release_notes` 读取固定 `BaseDirectory::Resource/release-notes.json`；禁止 `@tauri-apps/plugin-fs`、`$RESOURCE/**` 通配权限、路径参数和同步 `std::fs`。
- 持久数据、迁移、并发控制和业务验证必须由共享核心/存储层负责。
- 业务规则、默认值、领域状态转换和包含条件/重试/状态决策的调用编排必须位于核心；React 事件、Tauri command 和平台回调只调用核心并映射结果，即使当前只有 GUI 也同样适用。
- React 交互 handler 必须绑定在实际拥有动作的按钮、链接、`Switch`、`Checkbox` 或菜单项，不得由 Card、`Table.Tr`、`Table.Td` 等父级代理；父级确有独立动作时只执行自身语义并隔离冲突传播。测试分别点击控件与周围父级区域，表格行点击不得切换行内 `Switch`。
- 三项固定 GUI 插件与按 profile 启用的单实例、深链接、系统托盘、系统通知、开机自启和全局快捷键生命周期都位于 GUI adapter。单实例、托盘与深链接保留各自独立 Skill 的固定命名回归；全局快捷键按 contract 模式保留公共/条件回归；系统通知保留权限先于持久化、串行 worker、owned task、macOS 现代 API 和失败可见回归；开机自启保留 OS 权威状态、幂等、失败回滚和恢复原登录项回归。初始化基线前，`verify-gui-lifecycle-contract.mjs` 必须始终验证 system-locale/updater/window-state 依赖与注册、Rust-only 边界和非空回归，再按 profile/contract 对选中能力验证依赖、plugin 顺序/feature、资产、运行时接线和有断言回归，对未选能力验证彻底缺席。真实宿主 E2E 始终覆盖 locale 同源、updater 零出站和窗口重启恢复，再只执行适用的条件场景；通知 debug E2E 不冒充已安装候选投递证据，自启必须恢复原状态，全局快捷键必须恢复配置并注销 owned chord，需安装包注册的 macOS 深链场景明确为 `Not verified`。
- 使用 TanStack Query 负责有类型的异步命令结果和失效；Jotai 只负责跨组件共享的客户端交互。绝不能把 Query/核心数据复制到 atom 中。
- 前端公开配置只在真实需要时建立，并集中为类型化、冻结对象；所有 Vite 构建变量均视为用户可读，禁止秘密、令牌和凭据，产品模块不得直接散落读取 `import.meta.env`。
- 产品源码不得直接调用 `console.*`。真实需要前端诊断时使用稳定、脱敏的结构化事件，并优先通过窄 Tauri 命令汇入 Rust `tracing` 文件日志；远程遥测仍需独立范围批准。
- 从真实应用状态展示权威版本、状态、时间戳和错误。
- 翻译文案、语言判断和区域化格式化规则必须在 GUI 适配器完成；core 保持语言无关，只暴露稳定、语言中立的领域错误标识、结构化数据和机器可读时间戳，由适配器使用 `i18next`/`rust-i18n` 映射为当前语言的展示文案。
- 提交前明确展示破坏性操作和批处理操作范围。
- I/O、等待、计时器、进程和命令到核心的调用保持异步。只有测量确认的 CPU 密集工作才可考虑 `tauri::async_runtime::spawn_blocking` 或其他已批准线程边界，并提供明确的所有权、取消、并发上限和资源预算证据。仅支持阻塞调用的依赖应替换为异步能力，否则停止并进入范围或硬规则例外流程。

## 最低证据

- Rust 命令测试覆盖核心成功路径和最高风险失败路径。
- 每个业务操作具有“GUI 事件/命令 → core API → core 测试”映射；核心测试先覆盖领域行为，GUI 测试只补命令、视图和平台机制映射。
- 前端测试覆盖 Mantine 交互、文件路由与生成路由树边界、查询生命周期、Jotai 转换和真实失败展示。
- 检查纯键盘使用和适用的无障碍语义。
- 固定 system-locale 基线必须有 `locale()` 调用、BCP-47 只归一化一次、缺失/未知资源回退英文、已保存用户偏好优先、语言切换入口和切换后持久化证据；React、Rust 原生文案（托盘/通知/窗口标题）和其他能力不得出现第二个系统 locale 来源。
- 能力/权限配置拒绝未经批准的 WebView 调用。
- 三个原始 Logo 候选始终按 `candidate-1` → `candidate-2` → `candidate-3` 真实预览，用户选择前没有验证或标准化，选择后只有所选项的母版、运行时 Logo、平台图标和摘要可追溯；侧栏严格匹配所选模式：compact 为 `80px` 全宽居中持续名称且无折叠按钮/固定 `em/ch` 盒，detailed 为默认 `248px` 展开、统一 `22px` 图标、可收起 `76px`、折叠偏好持久化并用 Tooltip 补充 icon-only 名称。AppShell navbar 复用侧栏宽度常量且 Navbar padding 为 `0`；detailed 还必须证明父级不代理、ActionIcon 回调及 `data-navbar-width` 同步。产品功能项向下增长，底部只渲染已选赞助、固定设置、已选关于；`/settings` 固定存在，`/about`、`/sponsor` 按选择存在或缺席。默认设置页没有隐私/统计控件或翻译键；所选赞助页通过亮色/暗色渲染，所选关于页作者、联系方式和三段免责声明完整。未配置更新或统计时请求数为零。
- GUI 生命周期结构检查始终证明：os/updater/window-state 在根依赖与 member 继承、中央 plugin 顺序、Rust-only 无 JS/ACL 和各自非空回归都完整，updater 无配置时 `NotConfigured` 且零出站，window-state 只恢复尺寸/位置/最大化并对离屏状态回退。再按 profile 证明单实例、托盘、系统通知、开机自启、深链接与全局快捷键的独立 Skill 合同：深链接强制单实例/feature/顺序、冷热分发和精确 restore URL；全局快捷键强制 contract 与动作映射一致、空值不注册、逐项真实状态、Pressed-only、原子回滚和 owned 注销；其他能力保留既有依赖、生命周期、状态与回收门禁。禁用时对应实现彻底缺席。原生标题与 `document.title` 使用同一权威名称、版本和联系字段。
- GUI 初始化结构检查还必须证明发布专用资源映射精确存在；选择关于页时证明 Rust 命令、handler、Tokio `fs`、IPC 解码、加载失败/重试和回归齐全，禁用时证明这些运行时实现缺席。正式构建在打包前校验映射与源摘要，打包后逐字节比较候选资源；macOS 最终 DMG 再从唯一 `.app/Contents/Resources/release-notes.json` 与根事实比较。
- 选择赞助页时，运行时媒体与品牌 manifest 的路径、MIME、尺寸、字节数和 SHA-256 一致，支付码有支付方式明确的本地化替代文本，当前未引用小图也进入下游 sponsor 媒体；未选择时运行时 bundle 不含 sponsor 媒体。更新 banner 未选择时不进入 bundle。
- GUI/其他适配器并发访问时观察到相同数据且不发生损坏。
- 日常开发只运行本次 GUI 变化所需的非空 Vitest/Testing Library 与 Rust 单元/回归测试。显式构建先逐次解析 E2E，运行完整非空 Rust 与前端单元测试套件，再执行锁定的 Vite/Tauri 构建；格式、lint、类型、中文注释和 `dist` 扫描不自动追加。
- 缺少签名身份、证书或公证凭据不阻断渠道允许的 unsigned 安装候选；使用 `--no-sign` 并记录 unsigned。构建每次从已批准产品事实解析 `updaterEnabled`；`false` 时固定 updater 插件/`NotConfigured` 基线仍在，但 archive/`.sig` 必须缺席；`true` 时发布签名密钥缺失会阻断 updater 制品候选，不能用 unsigned 安装包绕过。macOS Developer ID 直接分发一旦签名，必须在候选摘要前完成公证与 ticket stapling；禁止只签名未公证的中间态。
- macOS 宿主的原生 DMG 与 Windows x64 NSIS 候选使用 `$desktop-build-tauri-release`。Windows 交叉路线只使用 cargo-xwin + NSIS，拒绝 MSI，并把 Windows runtime 保持为 `Unverified`。
- macOS DMG 必须在最终签名、公证与 stapling 字节上只读验证 `.DS_Store`、本地背景、唯一应用包与 Applications 拖拽目标；只检查配置或源码图片不构成 Finder 安装布局证据。headless CI 不得无界等待 Finder AppleScript。
- GUI 中性初始化结束前，必须先由 `verify-gui-lifecycle-contract.mjs` 按九项 profile 及条件 shortcut contract 通过结构门禁，再由 `$desktop-test-gui-initialization-e2e` 构建真实本机调试二进制。system-locale/updater/window-state 始终验证；单实例/托盘/系统通知/开机自启/深链接/全局快捷键只执行 profile 适用场景，托盘禁用实测关闭最后窗口退出，自启恢复原登录项；快捷键空 contract 证明零注册，非空时只触发明确安全 binding 并恢复原配置/owned registry；窗口状态恢复原几何/原缺席。macOS 需打包才能证明的深链接 OS 注册标为 `Not verified`。始终验证所选侧栏、设置页无隐私区块和所有实际菜单页面可达，且未选能力实现缺席；任一适用场景失败、无法观察或无法恢复都阻断。
- 每个声称支持的安装器或原生平台都有实际构建和完整验收证据。只有当前构建选择或产品/渠道硬要求启用冒烟/E2E 时才要求相应证据；否则记录 `Not run` 和风险。

## 例外与推荐边界

Tauri 2 和固定 React 前端技术栈是硬规则。替换它们必须记录硬规则例外，其中包含未满足的约束、风险、替代证据和恢复/迁移标准。

`react-i18next`/`i18next`、`rust-i18n` 与 system-locale/updater/window-state 三项官方 Rust-only 固定基线同样是硬规则。替换任一项、把固定基线改为问询/profile 开关、跳过语言切换入口或改为不跟随系统语言的默认值都必须记录硬规则例外；具体已支持的语言列表和翻译文案内容仍是项目特定选择。

九项 GUI 初始化选择本身是硬门禁：启用的单实例、深链接、全局快捷键、系统托盘、系统通知、开机自启、关于页或赞助页必须完整满足对应契约，禁用的条件能力必须从依赖、feature、运行时、配置、ACL、设置、路由、资源和专属测试中缺席；深链接强制单实例，侧栏必须精确实现所选精简或详细模式。system-locale/updater/window-state、版本展示、`@tabler/icons-react` 图标来源、设置页与 i18n 仍是所有 GUI 的固定基线。伴随进程、真实 updater 配置与制品开关、更宽泛的平台 API、业务深链接/快捷键动作、表单/图表绘制包、网络 client 与统计传输仍是项目特定选择。

官方运行时和签名参考：

- [Tauri 系统托盘](https://v2.tauri.app/learn/system-tray/)
- [Tauri OS 插件](https://v2.tauri.app/plugin/os/)
- [Tauri Single Instance 插件](https://v2.tauri.app/plugin/single-instance/)
- [Tauri Deep Link 插件](https://v2.tauri.app/plugin/deep-linking/)
- [Tauri Global Shortcut 插件](https://v2.tauri.app/plugin/global-shortcut/)
- [Tauri Notifications 插件](https://v2.tauri.app/plugin/notification/)
- [Tauri Autostart 插件](https://v2.tauri.app/plugin/autostart/)
- [Tauri Window State 插件](https://v2.tauri.app/plugin/window-state/)
- [Tauri `WindowEvent::CloseRequested`](https://docs.rs/tauri/latest/tauri/enum.WindowEvent.html)
- [Tauri 异步运行时](https://docs.rs/tauri/latest/tauri/async_runtime/)
- [Tauri 附加资源](https://v2.tauri.app/develop/resources/)
- [Tauri 配置合并](https://v2.tauri.app/develop/configuration-files/)
- [Tauri updater](https://v2.tauri.app/plugin/updater/)
- [Tauri 分发与签名](https://v2.tauri.app/distribute/)
- [Tauri Windows 安装包与 macOS 交叉构建](https://v2.tauri.app/distribute/windows-installer/#build-windows-apps-on-linux-and-macos)
- [Tauri macOS 签名与公证](https://v2.tauri.app/distribute/sign/macos/)
- [Windows 签名行为](https://v2.tauri.app/distribute/sign/windows/)
- [Linux 签名行为](https://v2.tauri.app/distribute/sign/linux/)
