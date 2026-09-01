---
name: desktop-add-gui-global-shortcut
description: 为已选择 GUI 全局快捷键能力的下游按明确需求建立固定或可编辑绑定；不预设按键、动作或默认注册，未选择时不得接入。
---

# 增加 GUI 全局快捷键

只在 `docs/GUI_APP_PROFILE.md` 的 `global_shortcut = enabled`，或初始化后产品范围明确批准全局快捷键时使用。完整读取并执行 [绑定契约](references/binding-contract.md)。

## 工作流程

1. 区分“中性初始化”与“产品实现”。中性初始化只建立 Rust-only 宿主能力，并把唯一 `gui-global-shortcut-contract` JSON 块写成 `schemaVersion = 1`、`actions = []`；这表示能力存在但没有产品动作、默认 chord、OS 注册或快捷键界面。产品实现只从已批准 Product Spec、当前请求和 GUI profile 取得动作、初始绑定、是否可编辑及安全验收事实，不得从 Harness 示例推断。
2. 根 `[workspace.dependencies]` 声明 `tauri-plugin-global-shortcut = "2.3.2"`；GUI member 只以 `workspace = true` 继承。通过 Rust `GlobalShortcutExt` 接线，WebView 不安装 `@tauri-apps/plugin-global-shortcut`、不取得 `global-shortcut:*` ACL。
3. `global_shortcut = enabled` 时 contract 块必须恰好一个，并与当前模式一致；`disabled` 时该块、依赖、插件、注册器、命令、配置文件、UI/i18n 与专属测试全部缺席。不得注入 `CommandOrControl+Shift+Space`、`restore_main_window` 或任何其他 fallback chord/action。
4. 产品动作使用稳定 ID 映射到编译期登记的宿主动作或单个 core 用例；Rust action 表必须与 profile contract 的数量、ID、策略、chord、dispatch 和 `e2eSafe` 逐字段一致，每个 target 都有明确 typed dispatcher 分支，禁止 wildcard/no-op 兜底。回调只在 `ShortcutState::Pressed` 分派，忽略 `Released`；不得动态执行脚本、Shell、URL、文件、网络、支付、删除或未批准命令。接口无关的业务动作、权限和状态转换继续由 core 拥有。
5. 配置文本、期望绑定与 OS 实际注册状态分开建模。未绑定使用 `null`/`Option::None`；逐项报告配置 chord、`registered` 与稳定脱敏错误码，不能用常量、WebView 缓存或“能力已启用”冒充真实注册。
6. 注册、持久化、可编辑录制、原子替换/回滚、模块所有权与生命周期清理遵守绑定契约。初始化失败、正常退出和 E2E 清理只注销本模块实际拥有的 chord，不调用可能影响其他模块的全局清空。
7. 只生成需求声明的界面：固定绑定显示只读 chord/动作/真实状态；可编辑绑定提供录制、取消与清空；空动作 contract 不生成占位界面。界面位置由批准的信息架构决定，不强制放在设置页。
8. 运行 contract 精确要求的非空 Rust/前端回归。中性初始化 E2E 证明启动时零绑定、零默认注册和清理无残留；存在明确非空动作时才按安全场景触发实际 chord，结束后恢复原配置并确认临时 chord 已释放。

## 完成输出

报告模式、contract 动作数、初始非空绑定、是否可编辑、逐项真实注册状态、回滚/持久化结果、回收后的 owned binding 数，以及禁用或空动作时的缺席/零注册证据。
