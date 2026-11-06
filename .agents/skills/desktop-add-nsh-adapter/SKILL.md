---
name: desktop-add-nsh-adapter
description: 为顶层 NSH 类型的共享 Rust core 增加 Native Shell 薄适配器，按桌面、移动和 Web 子目标生成，桌面按能力选择建立双语主题、侧栏和条件支持页。
---

# 增加 NSH 适配器

新项目的顶层 `interfaces = ["nsh"]` 专用；NSH 的说明为“下一代全平台开发框架”。`nsh-targets` 可选 desktop、mobile、web、tui，固定 NSH 0.4.0 尚无 tui 运行/打包目标，选中时失败关闭。具体平台仍记入 `target-platforms`；既有 `interfaces = ["gui"]`、`gui-framework = "nsh"` 只读兼容。初始化只复用唯一表单确认结果；已有下游新增接口先进入 `$desktop-implement-change`。不加载 Tauri、React、Mantine 或 GPUI Kit。

先读 `docs/design_standards/ui_foundation.md`、`docs/design_standards/nsh_gui.md` 与 [运行时与能力](references/runtime-and-capabilities.md)。维护打包再读 `$desktop-build-nsh-release`。本 Skill 和 helper 使用 Node 标准库，不依赖原移动客户端的工具脚本或机器路径。

生成器在写入前通过已选 Rust 工具链的 `rustfmt`（edition 2024）格式化完整 Rust 输出；该工具属于现有 Rust 开发工具链，不添加第三方 Node 依赖，失败保持零工作区写入。 只有真实失败证明缺少该组件时，按环境恢复流程为当前工具链执行 `rustup component add rustfmt`，再复读 `rustup which rustfmt` 与 `rustfmt --version` 并重试；不升级或替换工具链。

1. 复用身份、平台与 NSH 子目标。仅 desktop 子目标询问既有九字段 profile 和 Logo 选择；系统语言、三态主题、设置固定建立。六项桌面宿主能力当前均 unavailable/disabled；显式启用时停止并纠正，不用空函数或应用内按键冒充。mobile/Web 不询问桌面 profile。`nsh-desktop` 的自定义宿主不会由当前官方 Rust UI `nsh package` 装入；新增原生扩展必须先接通宿主和 Rust UI、替换适用打包路径，并有平台限制和真实宿主测试后才能更新能力表。
2. 运行 `scripts/add_nsh_adapter.mjs --root <已有共享core的根> --options <确认字段JSON文件>`。JSON 含 `projectId,nameZh,nameEn,owner,targetPlatforms,nshTargets`，desktop 时还含九字段 `profile` 和可选已选 `logo` 绝对 PNG 路径。路径/身份/依赖/已有接口冲突在写入前拒绝。NSH 适配器直接依赖 core；适配器只拥有界面状态与宿主机制。没有业务需求时不建立示例业务。
3. 默认使用 NSH Rust UI，`nsh.json` 的 `rust: "."` 与 `root: "App"` 挂载同一根组件；Rust UI 可编译为移动宿主和 WebAssembly。core 保持运行时中立。只把 NSH 所需 `nsh-core/nsh-base` 加入 workspace 依赖；Node.js 直接运行工程入口。
4. 条件页面和 sponsor 媒体只按 desktop 选择进入 NSH。正式 Logo 使用三原始候选与所选项流程；工程回归可使用明确标记的中性夹具，不能充当品牌确认。
5. 运行本次 Node 回归与非空 Rust workspace 测试、`nsh check`、`nsh test`。初次初始化必须在裁剪与唯一基线提交前调用 `$desktop-test-nsh-initialization-e2e`。后续开发不恢复初始化入口；打包调用独立 Skill。

生成器不覆盖 core，不创建 Git、策略、产品记忆、发布上下文或下游派生能力。完成初始化时保留本 Skill、知识引用、打包 Skill；删除初始化 wrapper/E2E，地图同步裁剪。报告声明平台与真实验证平台，不能把生成源码称为产品交付。
