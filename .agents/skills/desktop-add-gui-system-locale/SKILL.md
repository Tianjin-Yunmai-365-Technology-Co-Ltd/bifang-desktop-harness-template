---
name: desktop-add-gui-system-locale
description: 为所有 GUI 基线安装官方 os 插件并统一系统语言探测；这是固定能力，不单独询问用户。
---

# 增加 GUI 系统语言探测

该 Skill 是所有 Tauri GUI 的固定基线。它只负责安装并注册官方 `tauri-plugin-os = "2.3.2"`，把系统语言探测统一收口到 `locale()`，并为 GUI 的 i18n、托盘文案和后续原生能力提供同一 locale 来源。

## 工作流程

1. 只在已选择 GUI 的终端下游使用；初始化不询问该能力，`docs/GUI_APP_PROFILE.md` 也不记录开关。根 `[workspace.dependencies]` 声明 `tauri-plugin-os = "2.3.2"`，GUI member 只以 `workspace = true` 继承。
2. 在中央 Tauri Builder 顺序中恰好注册一次 `.plugin(tauri_plugin_os::init())`。该能力是 Rust-only：不得安装 `@tauri-apps/plugin-os`，不得给 WebView `os:*` ACL。
3. 启动时直接调用 `tauri_plugin_os::locale()`，只在一个 Rust helper 中完成 BCP-47 大小写/分隔符归一化。已保存的用户语言优先；没有偏好时使用规范化系统 locale，未知或空值回退 `en-US`。
4. React `i18next`、Rust `rust-i18n`、托盘、通知及其他原生文案只消费该 helper 的结果，不再分别读取浏览器语言、环境变量或平台专有 API；core 保持语言无关。
5. 运行 `system_locale_uses_tauri_plugin_os`、`system_locale_normalizes_bcp47_once`、`system_locale_falls_back_to_english`、`saved_language_precedes_system_locale` 四个非空回归。初始化 E2E 还要在真实进程中观察默认语言，并切换一次语言确认 React 与原生文案一致；当前宿主无法观察时阻断，不得伪称已验证。

## 边界

- 该 Skill 不批准额外语言、不引入业务翻译文案，也不向 WebView 暴露通用 OS 信息读取能力。
- 如果某产品明确要求偏离 `tauri-plugin-os`，必须记录 ADR；不能在日常实现中静默替换。

## 完成输出

报告依赖下界、Rust-only 注册、`locale()` 调用、归一化/回退/偏好优先回归，以及真实宿主中已观察或阻断的语言结果。
