---
name: desktop-test-gui-initialization-e2e
description: 在含 GUI 的下游初始化提交前，按九项配置验证桌面能力、支持页、关闭行为和侧栏，并运行真实本机 Tauri 调试 E2E。
---

# GUI 初始化 E2E

只用于 GUI 脚手架和相关非空单元测试完成后、裁剪初始化能力与创建基线提交前。它固定执行一次，不读取 `milestone_e2e`，不替代最终候选验收。

## 前置条件

1. 当前目录是已规范化的唯一终端下游项目根，GUI 目录精确为 `<project-id>_gui`。新实例化目标在本 E2E 阶段不得提前 `git init`；当前根若已经存在自身 `.git`，其规范化 Git 顶层必须精确等于当前目录，父级仓库不得视为目标自身的 Git 边界。独立 `main` 仓库仍由初始化器在本 E2E 与裁剪成功后、紧邻唯一基线提交时建立。
2. 读取 `AGENTS.md`、Agent Policy、`docs/ENGINEERING_RULES.md`、`docs/design_standards/README.md`、精确命中的 UI 标准、Rust/GUI 基线及 `docs/GUI_APP_PROFILE.md`。资料必须有且只有一个 `gui-initialization-config` 围栏代码块，字段按固定顺序恰好为 `system_tray`、`system_notification`、`autostart`、`about_page`、`sponsor_page`、`single_instance`、`deep_link`、`global_shortcut`、`sidebar_mode`；八项能力均为 `enabled`/`disabled`，侧栏模式为 `compact`/`detailed`，且无 `pending`。`deep_link = enabled` 必须同时满足 `single_instance = enabled`。`global_shortcut = enabled` 时还必须有唯一合法 `gui-global-shortcut-contract` JSON 块，中性初始化的 `actions` 必须为空；禁用时该块必须缺席。若用户未选择侧栏，初始化器应已写入 `detailed`；本 E2E 不补写或推断缺失字段。
3. 读取并使用 `computer-use` Skill 操作真实桌面窗口。只允许本地调试构建和只读界面操作，不签名、不生成安装包、不写 `release/`、不启用远程能力。
4. 未选能力不是缺失证据；已选能力若当前宿主无法观察、操作或判定，则阻断初始化。唯一例外是 macOS 只能由已打包应用证明的自定义 scheme 系统注册：初始化仍须通过解析器、冷/热事件与窗口恢复边界，并把最终系统注册明确标为 `Not verified` 留给候选验收，不能用该例外跳过其余深链接场景。

## 工作流程

1. 构建前运行 `node .agents/skills/desktop-test-gui-initialization-e2e/scripts/verify-gui-lifecycle-contract.mjs --root . --gui-dir <project-id>_gui`。检查器必须读取配置块并条件验证：
   - 固定基线：所有 GUI 都验证 `$desktop-add-gui-system-locale`、`$desktop-add-gui-updater`、`$desktop-add-gui-window-state` 三项 Rust-only 基线的版本/member 继承、无 JS/ACL、唯一稳定顺序注册、`locale()` 归一化/回退、中性 `plugins.updater = { endpoints: [], pubkey: "" }` 的可启动 `NotConfigured` 零出站配置和 single-flight/回收，以及只恢复 `SIZE | POSITION | MAXIMIZED`、无效/越界状态回退首次窗口尺寸；同时验证 `$desktop-add-gui-dialog` 固定 WebView 基线：根/member 固定 `tauri-plugin-dialog = "2.7.3"`、前端生产直依赖 `@tauri-apps/plugin-dialog = "^2.7.3"`、中央 Builder 在 window-state 后且条件 notification/autostart/global-shortcut 前恰好注册一次，主窗口的 `dialog:*` 权限精确为唯一 `dialog:default` 以覆盖 message/open/save，并且不安装 `@tauri-apps/plugin-fs`、不授予 `fs:*` 或其他文件系统权限。`get_app_metadata`、`get_system_locale`、`set_interface_language` 三个窄 Tauri command 必须始终存在，并与已启用的条件命令恰好进入一个无缺失、无重复、无额外项的合并 `invoke_handler`；任何固定基线缺失都失败。
   - `single_instance: enabled`：根/member 依赖、首插件顺序、只恢复既有窗口的中性回调，以及 `single_instance_plugin_is_registered_first`、`second_launch_restores_existing_main_window` 两个有断言回归；disabled 时拒绝依赖与注册。
   - `deep_link: enabled`：强制单实例与 `deep-link` feature，身份派生 `app-<kebab-id>://restore`、配置 scheme、冷热启动事件、先验证后恢复和四个固定回归；disabled 时拒绝依赖、feature、配置、监听、JS/ACL 与测试残留。
   - `global_shortcut: enabled`：唯一 contract、Rust-only 插件、可空绑定/逐项真实状态、Pressed-only typed dispatch、注册与持久化原子回滚、录制 token 及 owned 清理按 contract 模式成立；Rust action 表与 contract 的数量、ID、策略、chord、dispatch、`e2eSafe` 逐字段一致，每个 target 有明确非 wildcard/no-op 分支。中性空 contract 必须零默认 chord、零 OS 注册、零占位 UI，且没有启动注册调用或前端快捷键 runtime/i18n。disabled 时 contract 与全部专属实现缺席。
   - `system_tray: enabled`：`tray-icon` feature、非透明 `icons/32x32.png`/配置引用、从 `.setup(...)` 可达的 Menu/default icon/icon/build、从 `.on_window_event(...)` 可达的关闭隐藏、稳定 ID、`rust-i18n` 双语资源及六个托盘生命周期/i18n 回归；disabled 时拒绝 feature、托盘、`prevent_close` 与隐藏调用，要求从 `.on_window_event(...)` 可达的 `CloseRequested → AppHandle::exit(0)`，并要求 `close_last_window_exits_application` 有真实断言。
   - `system_notification: enabled`：根/member 最低下界、macOS target-only `mac-usernotifications`、单实例之后的官方通知插件、Rust-only command、MPSC/oneshot 串行 worker、权限先于偏好持久化、退出回收、失败可见、默认关闭的设置项 Switch 和固定回归；macOS 还必须先读 `AuthorizationStatus`，只在 `NotDetermined` 请求并复读，只有 `Authorized`/`Provisional`/`Ephemeral` 可持久化，`Denied`/受限或复读仍无权时通过只接收内部 `AppHandle`、不接收 WebView URL/bundle identifier 的 Rust-only 固定 opener，把 `app.config().identifier` 追加到固定 Notifications 设置前缀并打开当前应用设置，且保持偏好关闭；opener 失败可观察；disabled 时拒绝依赖、插件、worker、命令、WebView ACL、Switch、翻译键与测试残留。
   - `autostart: enabled`：`tauri-plugin-autostart = "2.5.1"`、`MacosLauncher::LaunchAgent`、无隐藏参数、Rust `ManagerExt` command、OS 权威状态、初始化不 `enable()`、失败回滚、Switch 和固定回归；disabled 时拒绝依赖、插件、command、WebView ACL、Switch、翻译键与启动参数残留。
   - 更新日志：所有 GUI 都必须保留只含固定映射的 `src-tauri/tauri.release.conf.json`，但本次调试构建不传它；`about_page: enabled` 时要求 Tokio `fs`、异步 `load_release_notes`、`BaseDirectory::Resource`、handler 注册、Rust schema v2 与完整 `zh-CN`/`en-US` 翻译对回归、React IPC 解码、当前 i18n locale 内容选择及 loading/error/retry 回归，disabled 时拒绝命令、加载器、弹窗和文案。
   - 前端：`/settings` 与设置页组件始终存在；通知/自启 Switch 及 i18n 严格按选择存在。全局快捷键空 contract 不得保留状态、保存、录制、编辑器或翻译键；固定动作只读显示需求 chord/逐项真实状态，可编辑动作才提供录制、取消、清空和 Rust 权威 load/save/capture；不得通过 localStorage/sessionStorage、Jotai atom 或 TanStack Query 建立绑定或能力状态的第二权威副本。关于/赞助路由和运行时组件分别与选择一致；实际侧栏接线必须等于 `sidebar_mode`。
2. 在 GUI 目录运行 `pnpm tauri build --debug --no-bundle`。失败或零产物立即失败；只有诊断明确属于受管环境问题时才调用环境恢复并重试原命令一次。
3. 以 `cargo metadata --format-version 1 --no-deps` 推导本次真实本机调试二进制，拒绝旧产物、模糊 glob、符号链接或 `pnpm tauri dev`。
4. 在隔离的 window-state 数据目录启动并持有主进程句柄，最多等待 60 秒直到主窗口可见。使用 Computer Use 保存初始截图并验证：
   - Logo 位于单个小写 `v` 版本之前；设置页固定含应用/版本、语言和三态主题且无隐私/统计区块，系统通知/开机自启 Switch 严格按配置出现，默认不产生权限请求或登录项注册；
   - `compact` 为 `80px`，使用 `6px` 内容内边距、`36px` Logo、`22px` 图标、全宽居中名称、`56px` 菜单项和固定 `4px`/`8px` 节奏，无固定 `em/ch` 名称盒或折叠按钮；AppShell navbar 复用宽度常量且 Navbar padding 为 `0`；
   - `detailed` 首次无偏好时以 `248px` 展开，使用 `22px` 图标并显示图标+名称；点击身份区父级不变化，点击自身 `ActionIcon` 后以 `76px` 收起，AppShell 主内容偏移同步扩展，只显示图标并通过 `position=right`、`openDelay=0` 的 Tooltip 显示完整名称。重启应用后恢复折叠偏好，再展开并确认偏好更新；
   - 可访问树中每个实际菜单页面非空可达；`/settings` 始终存在，`/about`、`/sponsor` 及入口分别与配置一致，未选页面不得出现占位、404 入口或运行时菜单。关于页启用时点击“更新日志”自身按钮；首次正式发布前根日志尚不存在是预期状态，必须显示本地读取失败与可操作重试且零出站，不得以编译时假数组伪装正式日志。本场景不证明发布候选已嵌入资源。
5. 先改变主窗口尺寸/位置并正常重启，确认固定 window-state 只恢复尺寸、位置和最大化；隐藏/全屏/装饰状态不恢复，损坏或移到不可见屏幕的隔离状态文件后回退 1440×900、居中、最小 960×640。完成后恢复或删除本 Skill 创建的隔离状态。仅当单实例启用时，再第二次启动同一精确二进制；第二进程 15 秒内退出，原 PID/同一窗口持续且恢复聚焦，宿主只剩一个长期应用主进程和一个主窗口。
6. 仅当托盘启用时，验证状态栏/通知区域的真实非空图形、中文“显示窗口/退出”和英文“Show Window/Quit”无重启刷新且无 `tray.*` 原始键；再验证原生关闭只隐藏、进程继续、托盘左键和显示项恢复聚焦、退出项结束进程并移除图标。空白点击区域、菜单不止两项或任一状态无法判定都失败。
7. 仅当系统通知启用时，确认设置 Switch 初始关闭、点击周围 Paper 不触发命令、pending/拒绝/失败可见；结构检查和非空回归必须证明 macOS 的查询→条件请求→复读→授权持久化或固定系统设置恢复路径。初始化调试二进制不得实际发送产品通知，不得为测试污染真实授权决定或无条件打开系统设置，也不得作为 macOS 已安装签名候选的权限弹窗、设置跳转或横幅证据；这些宿主行为留给最终安装候选验证。
8. 仅当开机自启启用时，先读取并记录 OS 登录项状态，再通过 Switch 切换并重读实际状态；随后立即恢复执行前的 OS 登录项状态并再次确认。所有成功、失败、超时、取消和清理路径都必须执行恢复；恢复失败阻断并报告人工恢复步骤。
9. 仅当深链接启用时，在当前宿主可真实注册自定义 scheme 的前提下分别触发冷启动与热启动 `app-<kebab-id>://restore`，确认非法 scheme/query/fragment 不产生动作、合法 URL 只恢复同一主窗口且热启动事件不丢；macOS debug no-bundle 无法证明 Launch Services 注册时明确记录 `Not verified`，由最终打包候选阻断式补验，不能把解析器单测冒充 OS 深链通过。
10. 仅当全局快捷键启用时读取 contract 与逐项真实状态。中性空 contract 必须确认启动/重启都没有 active binding，且不存在旧 Harness fallback chord。非空 contract 只触发 `e2eSafe = true` 的实际非空 binding；可编辑且初始 `null` 时先快照完整配置，通过正式窄命令临时保存一个可成功注册的 probe chord，再触发并恢复原快照。固定或 probe 注册失败必须以稳定状态可见。随后确认本轮 owned chord 全部释放；没有安全可观察动作时不得随意触发业务或把静态检查报告为真实通过。托盘未启用时另用原生关闭控件确认最后窗口关闭即退出。
11. 无论成功、失败、超时或取消，都先恢复本 Skill 修改的开机自启状态、window-state 数据、全局快捷键配置和 owned registry，再终止并等待回收本 Skill 拥有的全部进程，禁止遗留 detached task、测试登录项、状态文件、录制 token 或 chord。

## 通过条件

- 九字段唯一配置块完整、交叉关系合法，且实现、依赖、设置、路由、资源与每个 enabled/disabled 选择一致；
- system-locale、updater、window-state 三项 Rust-only 固定基线结构与可观察宿主场景通过，dialog 固定 WebView 基线的依赖、唯一有序注册、主窗口 `dialog:default` 全类型覆盖和零文件系统授权通过；updater 未配置时确认为 `NotConfigured` 且零出站；
- 本次调试二进制真实启动，所选侧栏模式、设置页和全部实际菜单页面通过；
- 已选单实例、托盘、系统通知、开机自启、深链接与全局快捷键分别通过适用结构和可执行宿主场景；中性快捷键空 contract 证明零注册，非空 contract 只触发安全动作；需要打包的 macOS 深链接明确留作阻断式后续验证；自启、窗口状态、快捷键配置与 owned registry 均已恢复；
- 发布专用映射始终存在且未污染调试构建；关于页启用时命令/加载失败状态存在，禁用时运行时链路缺席；关于/赞助入口和页面按选择存在或缺席；
- 所有进程句柄已回收。

## 结果边界

初始化最终回复逐项报告九项配置、三项 Rust-only 固定基线、dialog 固定 WebView 基线、结构检查、构建、二进制路径、侧栏模式/持久折叠、设置页与逐菜单结果。六个条件宿主能力及关于/赞助只报告适用场景；全局快捷键另报告 contract 动作数、初始非空 binding 数、实际注册/触发范围及恢复后的配置/owned registry，开机自启和 window-state 报告恢复后状态，系统通知/需打包深链明确标记未在此证明的边界；未选项报告缺席证据。

本 Skill 不创建 Verification，不把调试二进制称为发布候选。通过后与初始化 Skill 一同删除；失败时保留现场且不得创建基线提交。
