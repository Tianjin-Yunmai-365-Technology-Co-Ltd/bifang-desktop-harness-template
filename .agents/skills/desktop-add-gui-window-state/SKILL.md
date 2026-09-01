---
name: desktop-add-gui-window-state
description: 为所有 GUI 基线接入官方 window-state 插件并恢复主窗口尺寸与位置；这是固定能力，不单独询问用户。
---

# 增加 GUI 窗口状态恢复

该 Skill 是所有桌面 GUI 的固定基线。它把官方 `tauri-plugin-window-state = "2.4.1"` 接入主窗口生命周期，使窗口尺寸和位置在重启后恢复，同时不把页面业务状态混入窗口持久化。

## 工作流程

1. 只在已选择 GUI 的终端下游使用；初始化不询问该能力，profile 不记录开关。根 `[workspace.dependencies]` 声明 `tauri-plugin-window-state = "2.4.1"`，GUI member 只以 `workspace = true` 继承。
2. 在中央 Builder 顺序中恰好注册一次 `tauri_plugin_window_state::Builder`，并显式使用 `StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED`。禁止 `Builder::default()` 的全量状态语义，明确排除 `VISIBLE`、`DECORATIONS`、`FULLSCREEN` 与最小化状态，避免恢复成隐藏托盘窗口或不可达窗口。
3. 该能力是 Rust-only：不得安装 `@tauri-apps/plugin-window-state`，不得给 WebView `window-state:*` ACL。
4. 官方插件在状态文件缺失/损坏时使用空状态，并且不恢复与任一当前显示器都不相交的位置；这些官方行为本身不足以证明 Harness 的精确回退值。GUI adapter 必须另提供 `saved_window_geometry_is_recoverable` 与 `ensure_main_window_is_recoverable`，在 plugin 恢复后从 Builder `.setup(...)` 实际调用：尺寸小于 `960×640`、与所有显示器都无交集，或 DPI/显示器变化导致几何无效时，显式设为 `1440×900` 并居中，同时恢复最小 `960×640`；合法状态不得被覆写。`preventOverflow: true` 与实际显示器交集检查共同保证可找回性。
5. 页面会话状态继续按 Jotai 进程内契约处理，不能借该插件跨进程持久化筛选、分页或业务上下文。托盘隐藏和单实例唤醒只恢复窗口，不覆写已保存几何。
6. 运行 `window_state_restores_size_position_and_maximized`、`window_state_ignores_saved_visibility`、`window_state_falls_back_for_invalid_or_offscreen_state`、`window_state_preserves_first_launch_defaults` 四个非空回归；后两个必须调用上述几何判定，不得用布尔常量或只比较固定数字代替。初始化 E2E 要分别使用合法状态、损坏 JSON、超远离屏坐标和首启空状态真实重启验证；性能探针必须隔离并恢复状态文件。

## 边界

- 该 Skill 不批准多窗口产品架构、额外窗口持久化策略或业务态恢复。
- 若产品需要偏离默认恢复窗口集合，必须在产品事实中明确，不得由初始化猜测。

## 完成输出

报告依赖下界、精确 `StateFlags`、首次/无效状态回退、真实重启恢复和性能测试隔离结果。
