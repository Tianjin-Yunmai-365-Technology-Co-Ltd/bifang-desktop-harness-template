---
name: desktop-add-nsh-adapter
description: 为顶层 NSH 类型的共享 Rust core 增加 Native Shell 薄适配器，按桌面、移动和 Web 子目标生成，桌面按能力选择建立双语主题、侧栏和条件支持页。
---

# 增加 NSH 适配器

新项目的顶层 `interfaces = ["nsh"]` 专用；NSH 的说明为“下一代全平台开发框架”。`nsh-targets` 可选 desktop、mobile、web、tui，固定 NSH 0.4.0 尚无 tui 运行/打包目标，选中时失败关闭。具体平台仍记入 `target-platforms`；既有 `interfaces = ["gui"]`、`gui-framework = "nsh"` 只读兼容。初始化只复用唯一表单确认结果；已有下游新增接口先进入 `$desktop-implement-change`。不加载 Tauri、React、Mantine 或 GPUI Kit。

先读 `docs/design_standards/ui_foundation.md`、`docs/design_standards/nsh_gui.md` 与 [运行时与能力](references/runtime-and-capabilities.md)。维护打包再读 `$desktop-build-nsh-release`。本 Skill 和 helper 使用 Node 标准库，不依赖原移动客户端的工具脚本或机器路径。

生成器在写入前通过已选 Rust 工具链的 `rustfmt`（edition 2024）格式化完整 Rust 输出；该工具属于现有 Rust 开发工具链，不添加第三方 Node 依赖，失败保持零工作区写入。 只有真实失败证明缺少该组件时，按环境恢复流程为当前工具链执行 `rustup component add rustfmt`，再复读 `rustup which rustfmt` 与 `rustfmt --version` 并重试；不升级或替换工具链。

1. 复用身份、平台与 NSH 子目标。仅 desktop 子目标询问既有九字段 profile 和 Logo 选择；系统语言、三态主题、设置固定建立。桌面固定使用自定义多窗口宿主；`system_tray`、`single_instance`、`deep_link`、`autostart` 各自按选择接线，`deep_link` 依赖 `single_instance`。深链接必须先进入宿主待领取队列，通知 TSX 后由订阅者主动领取，不能只向尚未就绪的窗口发送一次性事件；单实例重试不得重复交付。`system_notification` 与 `global_shortcut` 仍 unavailable/disabled，显式启用时停止；应用菜单快捷键不得冒充系统全局快捷键。mobile/Web 不询问桌面 profile，继续由 NSH 官方宿主运行相同 Mixed UI。
2. 运行 `scripts/add_nsh_adapter.mjs --root <已有共享core的根> --options <确认字段JSON文件>`。JSON 含 `projectId,nameZh,nameEn,owner,targetPlatforms,nshTargets`，desktop 时还含九字段 `profile` 和可选已选 `logo` 绝对 PNG 路径。路径/身份/依赖/已有接口冲突在写入前拒绝。NSH 适配器直接依赖 core；适配器只拥有界面状态与宿主机制。没有业务需求时不建立示例业务。
3. 所有已选目标使用 NSH Mixed：`App.tsx` 是 TSX 根组件，`nsh.json` 设 `rust: "."`，不设置 Rust UI `root`；同成员的 native module 注册 Rust 导出，薄层调用共享 core。desktop 的自定义 AppKit/Win32/GTK 宿主以 `set_ui_sets` 注册 NSH 基座和成员 registry，以 `App::Js(bundle)` 加载 TSX bundle，仅声明已选 `host.call`。mobile/Web 使用 NSH 官方宿主。core 保持运行时中立；根 `[workspace.dependencies]` 是所有依赖版本和 features 的唯一来源，成员对桌面宿主依赖使用目标条件与 `workspace = true`。
4. 条件页面和 sponsor 媒体只按 desktop 选择进入 NSH。正式 Logo 使用三原始候选与所选项流程；工程回归可使用明确标记的中性夹具，不能充当品牌确认。
5. 运行本次 Node 回归与非空 Rust workspace 测试、`nsh check`、`nsh test`。desktop 开发入口先构建 TSX bundle，再运行自定义宿主；桌面打包由 `$desktop-build-nsh-release` 独立编译宿主并封装资源。组合工程的移动/Web 包必须经受管 build helper 的暂存 Mixed 入口调用官方包路径，剔除仅桌面有效的 `capabilities.host`；直接对原成员执行官方 `nsh package` 会携带桌面 host 声明。只对实际运行过的原生目标报告宿主验证；初次初始化在裁剪与唯一基线提交前调用 `$desktop-test-nsh-initialization-e2e`。

生成器不覆盖 core，不创建 Git、策略、产品记忆、发布上下文或下游派生能力。完成初始化时保留本 Skill、知识引用、打包 Skill；删除初始化 wrapper/E2E，地图同步裁剪。报告声明平台与真实验证平台，不能把生成源码称为产品交付。
