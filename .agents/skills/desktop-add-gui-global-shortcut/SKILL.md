---
name: desktop-add-gui-global-shortcut
description: 为已选择 GUI 全局快捷键能力的下游安装官方 global-shortcut 插件并固定最小权限边界；未选择时不得接入。
---

# 增加 GUI 全局快捷键

只在 `docs/GUI_APP_PROFILE.md` 的 `global_shortcut = enabled`，或初始化后产品范围明确批准全局快捷键时使用。

## 固定契约

1. 根 `[workspace.dependencies]` 声明 `tauri-plugin-global-shortcut = "2.3.2"`；GUI member 只以 `workspace = true` 继承。
2. 用户选择 `enabled` 的选项必须明确说明固定初始化绑定：`CommandOrControl+Shift+Space` 只调用 `restore_main_window`。该选择同时批准此按键与安全宿主动作；不得只安装插件而不注册，也不得猜测其他 chord 或业务动作。
3. 通过 Rust `GlobalShortcutExt` 注册，WebView 不安装 `@tauri-apps/plugin-global-shortcut`、不取得 `global-shortcut:*` ACL。回调只在 `ShortcutState::Pressed` 执行恢复，必须忽略 `Released` 以避免一次按键双重动作；不得直接承载业务规则，也不得在未聚焦时执行文件、网络、付费或其他高风险副作用。
4. 注册结果由应用拥有的 `GlobalShortcutStatus` 记录；设置页的窄命令必须通过 Rust `is_registered` 读取本应用当前真实注册状态，不得返回常量或 WebView 缓存。冲突、平台不支持或注册失败必须以稳定、脱敏状态可见，不能吞错。应用退出、初始化失败和 E2E 清理都必须注销本 Skill 拥有的 chord。
5. Wayland、沙箱桌面和平台占用可能阻止真实回调；初始化 E2E 必须实际触发固定 chord、验证同一主窗口恢复，再注销并确认键位释放。无法观察或冲突时，已选择能力的初始化阻断，不得用静态检查改判通过。
6. 运行 `global_shortcut_registers_fixed_restore_binding`、`global_shortcut_conflicts_are_observable`、`global_shortcut_restores_existing_main_window`、`global_shortcut_unregisters_on_shutdown` 四个非空回归。
7. 禁用时依赖、插件、注册、状态、设置文案、ACL 和测试残留都必须缺席。

## 完成输出

报告依赖下界、固定 chord/动作、注册状态、真实触发、注销回收和禁用缺席证据。
