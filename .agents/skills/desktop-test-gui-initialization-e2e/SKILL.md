---
name: desktop-test-gui-initialization-e2e
description: 在含 GUI 的下游初始化提交前，按已记录配置验证可选单实例、托盘、关于/赞助页、关闭行为和精简/详细侧栏，并运行真实本机 Tauri 调试 E2E。
---

# GUI 初始化 E2E

只用于 GUI 脚手架和相关非空单元测试完成后、裁剪初始化能力与创建基线提交前。它固定执行一次，不读取 `milestone_e2e`，不替代最终候选验收。

## 前置条件

1. 当前目录同时是下游项目根和独立 Git 顶层目录，GUI 目录精确为 `<project-id>_gui`。
2. 读取 `AGENTS.md`、Agent Policy、`docs/ENGINEERING_RULES.md`、`docs/design_standards/README.md`、精确命中的 UI 标准、Rust/GUI 基线及 `docs/GUI_APP_PROFILE.md`。资料必须有唯一 `gui-initialization-config` 围栏代码块，四项能力均为 `enabled`/`disabled`，侧栏模式为 `compact`/`detailed`，且无 `pending`。若用户未选择侧栏，初始化器应已写入 `detailed`；本 E2E 不补写或推断缺失字段，缺失仍阻断。
3. 读取并使用 `computer-use` Skill 操作真实桌面窗口。只允许本地调试构建和只读界面操作，不签名、不生成安装包、不写 `release/`、不启用远程能力。
4. 未选能力不是缺失证据；已选能力若当前宿主无法观察、操作或判定，则阻断初始化。

## 工作流程

1. 构建前运行 `node .agents/skills/desktop-test-gui-initialization-e2e/scripts/verify-gui-lifecycle-contract.mjs --root . --gui-dir <project-id>_gui`。检查器必须读取配置块并条件验证：
   - `single_instance: enabled`：根/member 依赖、首插件顺序、只恢复既有窗口的中性回调，以及 `single_instance_plugin_is_registered_first`、`second_launch_restores_existing_main_window` 两个有断言回归；disabled 时拒绝依赖与注册。
   - `system_tray: enabled`：`tray-icon` feature、非透明 `icons/32x32.png`/配置引用、从 `.setup(...)` 可达的 Menu/default icon/icon/build、从 `.on_window_event(...)` 可达的关闭隐藏、稳定 ID、`rust-i18n` 双语资源及六个托盘生命周期/i18n 回归；disabled 时拒绝 feature、托盘、`prevent_close` 与隐藏调用，要求从 `.on_window_event(...)` 可达的 `CloseRequested → AppHandle::exit(0)`，并要求 `close_last_window_exits_application` 有真实断言。
   - 更新日志：所有 GUI 都必须保留只含固定映射的 `src-tauri/tauri.release.conf.json`，但本次调试构建不传它；`about_page: enabled` 时要求 Tokio `fs`、异步 `load_release_notes`、`BaseDirectory::Resource`、handler 注册、Rust schema 回归、React IPC 解码及 loading/error/retry 回归，disabled 时拒绝命令、加载器、弹窗和文案。
   - 前端：`/settings` 与设置页组件始终存在；关于/赞助路由和运行时组件分别与选择一致，赞助启用时 `public/brand-support/sponsor/` 必须包含完整 12 个本地媒体、禁用时目录缺席；实际侧栏接线必须等于 `sidebar_mode`，且精简/详细结构分别满足固定尺寸、默认状态、按钮、Tooltip 与独立 localStorage 契约。
2. 在 GUI 目录运行 `pnpm tauri build --debug --no-bundle`。失败或零产物立即失败；只有诊断明确属于受管环境问题时才调用环境恢复并重试原命令一次。
3. 以 `cargo metadata --format-version 1 --no-deps` 推导本次真实本机调试二进制，拒绝旧产物、模糊 glob、符号链接或 `pnpm tauri dev`。
4. 启动并持有主进程句柄，最多等待 60 秒直到主窗口可见。使用 Computer Use 保存初始截图并验证：
   - Logo 位于单个小写 `v` 版本之前，设置页只含应用/版本、语言和三态主题且无隐私/统计区块；
   - `compact` 为 `80px`，使用 `6px` 内容内边距、`36px` Logo、`22px` 图标、全宽居中名称、`56px` 菜单项和固定 `4px`/`8px` 节奏，无固定 `em/ch` 名称盒或折叠按钮；AppShell navbar 复用宽度常量且 Navbar padding 为 `0`；
   - `detailed` 首次无偏好时以 `248px` 展开，使用 `22px` 图标并显示图标+名称；点击身份区父级不变化，点击自身 `ActionIcon` 后以 `76px` 收起，AppShell 主内容偏移同步扩展，只显示图标并通过 `position=right`、`openDelay=0` 的 Tooltip 显示完整名称。重启应用后恢复折叠偏好，再展开并确认偏好更新；
   - 可访问树中每个实际菜单页面非空可达；`/settings` 始终存在，`/about`、`/sponsor` 及入口分别与配置一致，未选页面不得出现占位、404 入口或运行时菜单。关于页启用时点击“更新日志”自身按钮；首次正式发布前根日志尚不存在是预期状态，必须显示本地读取失败与可操作重试且零出站，不得以编译时假数组伪装正式日志。本场景不证明发布候选已嵌入资源。
5. 仅当单实例启用时，第二次启动同一精确二进制。第二进程 15 秒内退出，原 PID/同一窗口持续且恢复聚焦，宿主只剩一个长期应用主进程和一个主窗口。未启用时不执行也不声称该场景。
6. 仅当托盘启用时，验证状态栏/通知区域的真实非空图形、中文“显示窗口/退出”和英文“Show Window/Quit”无重启刷新且无 `tray.*` 原始键；再验证原生关闭只隐藏、进程继续、托盘左键和显示项恢复聚焦、退出项结束进程并移除图标。空白点击区域、菜单不止两项或任一状态无法判定都失败。
7. 托盘未启用时，使用原生关闭控件关闭最后一个窗口，确认应用主进程在限定时间内退出；若窗口只隐藏、进程残留或存在托盘图标则失败。需要继续验证详细侧栏重启偏好时，先完成该场景再重新启动受管实例。
8. 无论成功、失败、超时或取消，都终止并等待回收本 Skill 拥有的全部进程，禁止遗留 detached task。

## 通过条件

- 配置块完整且实现、依赖、路由、资源与每个 enabled/disabled 选择一致；
- 本次调试二进制真实启动，所选侧栏模式、设置页和全部实际菜单页面通过；
- 已选单实例与托盘分别通过完整结构和真实宿主场景；未选托盘通过关闭最后窗口退出；
- 发布专用映射始终存在且未污染调试构建；关于页启用时命令/加载失败状态存在，禁用时运行时链路缺席；关于/赞助入口和页面按选择存在或缺席；
- 所有进程句柄已回收。

## 结果边界

初始化最终回复逐项报告五项配置、结构检查、构建、二进制路径、侧栏模式/持久折叠、设置页与逐菜单结果。单实例、托盘、关于、赞助只报告适用场景；未选项报告缺席证据。截图只覆盖最小必要证据。

本 Skill 不创建 Verification，不把调试二进制称为发布候选。通过后与初始化 Skill 一同删除；失败时保留现场且不得创建基线提交。
