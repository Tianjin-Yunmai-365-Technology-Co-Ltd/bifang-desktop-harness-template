---
name: desktop-add-gui-dialog
description: 为所有 GUI 基线安装官方 dialog 插件并向主 WebView 开放全部官方对话框类型；这是固定能力，不单独询问用户。
---

# 增加 GUI 原生对话框

该 Skill 是所有 Tauri GUI 的固定基线。它接入官方 `tauri-plugin-dialog`，让主窗口 WebView 可以使用官方默认集合中的全部对话框类型，同时把权限严格限制在 dialog 插件自身。

## 工作流程

1. 只在已选择 GUI 的终端下游使用；初始化不询问该能力，九字段 `docs/GUI_APP_PROFILE.md` 也不记录开关。根 `[workspace.dependencies]` 声明 `tauri-plugin-dialog = "2.7.3"`，GUI member 只以 `workspace = true` 继承。
2. GUI 前端的生产 `dependencies` 声明 `@tauri-apps/plugin-dialog = "^2.7.3"`；不得放入 `devDependencies`，也不得用浏览器文件选择器、手写 IPC 或其他包替代官方前端 API。
3. 在中央 Tauri Builder 中恰好注册一次 `.plugin(tauri_plugin_dialog::init())`。固定顺序是 window-state 注册之后、notification 注册之前；notification 未启用时仍保持 dialog 紧随 window-state，不为缺席的条件插件写占位注册。
4. 主窗口/WebView capability 的 `permissions` 数组以 `dialog:default` 作为唯一 dialog 权限项。该默认集合就是本基线批准的全部官方对话框类型；不得再展开子权限、单列已弃用的 ask/confirm 权限，也不得加入任何 `dialog:deny-*`。
5. dialog 返回的路径只代表用户在原生对话框中的选择结果。该权限不安装或授权 fs 插件，不授予通用文件读取、写入、枚举、删除或路径遍历能力；产品需要处理所选文件时，必须另走对应产品事实、最小文件能力和安全边界。
6. 运行 `dialog_dependencies_are_fixed`、`dialog_plugin_is_registered_once_in_fixed_order`、`dialog_default_permission_covers_all_dialog_types`、`dialog_baseline_does_not_grant_filesystem_access` 四个非空回归。初始化结构检查还必须确认生产依赖位置、主窗口 capability 精确权限和 Builder 顺序；不得用仅匹配某个依赖字符串代替完整契约。

## 边界

- 该 Skill 不创建产品专属打开、保存、消息或确认流程，也不推断默认目录、文件类型、文件名或业务副作用。
- `dialog:default` 只批准 dialog 插件的官方默认命令集合；它不扩大其他 Tauri 插件、WebView、操作系统或文件系统权限。
- 若产品需要收窄 dialog 类型或改变固定 Builder 顺序，必须记录批准的产品事实与硬规则例外，不能在初始化中静默偏离。

## 完成输出

报告 Rust 与前端依赖下界、GUI member 继承、唯一插件注册及顺序、主窗口 `dialog:default` capability、无 deny/独立 deprecated 权限，以及 fs/通用文件访问未授权证据。
