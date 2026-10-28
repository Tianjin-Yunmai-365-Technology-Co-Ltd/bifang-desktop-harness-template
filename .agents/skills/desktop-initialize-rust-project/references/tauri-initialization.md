# Tauri 初始化接线

仅在初始化已选择 GUI 且 `gui-framework = "tauri"`（既有 GUI 缺失值兼容 Tauri）时完整读取。中央初始化器拥有阶段顺序与完成门禁；下面的能力 Skill、GUI adapter 和设计标准拥有各自唯一实施合同。GPUI 不读取本引用。

## 身份与初始化源资产

1. 创建最终图标前，调用 [应用身份 Skill](../../desktop-prepare-gui-app-identity/SKILL.md) 的初始化 Logo 模式。由其执行三个原始候选的稳定顺序展示、用户选择、选择后验证/标准化与平台图标生成；不得把未选候选或占位图当作已完成身份。该 Skill 同时负责母版与运行时 Logo 的逐字节一致证据。
2. 平台图标生成后，由 [GUI adapter](../../desktop-add-gui-adapter/SKILL.md) 和启用时的 [系统托盘 Skill](../../desktop-add-gui-system-tray/SKILL.md) 核对 `icons/32x32.png` 的非透明 RGBA 图形、配置引用和可见托盘接线；固定图标校验不因托盘禁用而省略。
3. 删除初始化 Skill 前，把 [中性 DMG 背景](../assets/gui/macos-dmg-background.png) 逐字节复制为 `<project-id>_gui/src-tauri/dmg/background.png`。源与目标均须为非符号链接的 660×400 PNG，摘要一致；GUI adapter 将 `bundle.macOS.dmg.background` 设为 `./dmg/background.png`，DMG 窗口为 660×400，`appPosition: { x: 180, y: 220 }`，`applicationFolderPosition: { x: 480, y: 220 }`。它是无产品身份的初始化资产，首次真实 GUI 开发仍交应用身份 Skill 预览批准或同路径替换。裁剪后不得依赖源 Skill 的运行时路径。

## 能力与界面委托

从已确认的 `docs/GUI_APP_PROFILE.md` 读取唯一九字段配置块，不重新提问或推断；深链接交叉关系和全局快捷键空 action contract 按 GUI adapter 校验。

| 条件 | 唯一实施入口 |
|---|---|
| 所有 Tauri GUI | [system-locale](../../desktop-add-gui-system-locale/SKILL.md)、[updater](../../desktop-add-gui-updater/SKILL.md)、[window-state](../../desktop-add-gui-window-state/SKILL.md)、[dialog](../../desktop-add-gui-dialog/SKILL.md) |
| `system_tray = enabled` | [系统托盘](../../desktop-add-gui-system-tray/SKILL.md) |
| `system_notification = enabled` | [系统通知](../../desktop-add-gui-system-notifications/SKILL.md) |
| `autostart = enabled` | [开机自启](../../desktop-add-gui-autostart/SKILL.md) |
| `single_instance = enabled` | [单实例](../../desktop-add-gui-single-instance/SKILL.md) |
| `deep_link = enabled` | [受限深链接](../../desktop-add-gui-deep-link/SKILL.md) |
| `global_shortcut = enabled` | [全局快捷键](../../desktop-add-gui-global-shortcut/SKILL.md) |
| 标题、侧栏、设置、语言/主题，以及已选关于/赞助 | [GUI 支持界面](../../desktop-prepare-gui-support-surfaces/SKILL.md) |

GUI adapter 负责中央 Builder 与唯一 invoke handler 的装配；各能力 Skill 独占依赖、feature、权限、运行时、UI/i18n、固定回归和禁用无残留合同。禁用时仍执行相应缺席检查。固定 Rust-only 三项与 dialog WebView 基线不写 profile 开关；dialog 的 `dialog:default` 不授予通用文件读写，updater 未配置时为 `NotConfigured` 且零出站。

先按 [设计标准索引](../../../../docs/design_standards/README.md) 选择标准，再按 [Tauri 侧栏标准](../../../../docs/design_standards/tauri_sidebar.md) 将已确认模式接到实际 AppShell。侧栏展示值只来自中央 Token，折叠状态所有权与 `navbar.width`/`data-navbar-width` 同源关系由侧栏合同维护；不得由模板存在反推另一运行时模式。当前基座统一视觉规则；旧像素不再独立优先，新的产品设计方向或信息架构变化才处理确认与 profile/ADR。

设置、标题、窗口回退、i18n、主题、菜单和页面状态由支持界面/GUI adapter 负责；所有图标按其固定 Tabler 合同。初始化不生成列表页或预装 dnd-kit，仅保留 `$mantine-list-view` 知识。不得预创建 `docs/GUI_SUPPORT_SURFACES.md`，不得注入产品更新/统计 endpoint、远程请求或支付自动化；未选能力不得留下运行时入口、媒体或专属资源。

## 返回中央流程前

完成接线后返回中央初始化流程，由其第 10 步汇总完成非空测试，包括唯一九字段、深链交叉关系、所选侧栏及页面、全部固定能力回归和条件能力启用/禁用证据；不能以断言占位替代。第 12 步统一调用一次 [Tauri 初始化 E2E](../../desktop-test-gui-initialization-e2e/SKILL.md)，本引用不提前调用。由该阶段验证真实调试程序并恢复登录项、窗口状态、快捷键和进程；打包后才能证明的静态 scheme 注册明确保留为未验证。

返回主流程时提供所选 Logo 字节/路径、图标/DMG 复制证据、profile 与侧栏来源、各能力接线与实际单元回归结果；E2E 结果由中央流程统一汇总。任何门禁失败都不得裁剪对应初始化入口或创建基线提交；本流程不形成发布候选验收。
