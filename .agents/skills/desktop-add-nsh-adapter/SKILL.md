---
name: desktop-add-nsh-adapter
description: 为顶层 NSH 类型的共享 Rust core 增加 Native Shell Mixed 薄适配器，按桌面、移动和 Web 子目标生成；TUI 暂不可用。
---

# 增加 NSH 适配器

新项目的顶层 `interfaces = ["nsh"]` 专用；NSH 的说明为“下一代全平台开发框架”。`nsh-targets` 仅可选 desktop、mobile、web，全部 NSH Cargo 依赖固定到正式 v0.4.0 Git 提交 `e626a8dd8f8d8b277b9507cfd5ac74d0e67020f3`，并要求全局 `nsh` CLI 匹配 `nsh 0.4.0 (e626a8d)`。TUI 暂不可用，选择或保留 `tui` 时失败关闭；旧下游不自动升级。新实例化按唯一表单从能力派生完整系统集合：desktop 对应 Windows、macOS、Linux，mobile 对应 Android、iOS，web 对应 Web；确认后写入 `target-platforms`。已有下游 add-only 接入按其受保护 Cargo 平台执行，不扩大旧项目的平台声明。既有 `interfaces = ["gui"]`、`gui-framework = "nsh"` 只读兼容，独立 `interfaces = ["tui"]` 仍拒绝。初始化只复用唯一表单确认结果；已有下游新增接口先进入 `$desktop-implement-change`。不加载 Tauri、React、Mantine 或 GPUI Kit。

先读 `docs/design_standards/ui_foundation.md`，再读 `docs/design_standards/nsh_gui.md` 与 [运行时与能力](references/runtime-and-capabilities.md)；维护打包再读 `$desktop-build-nsh-release`。本 Skill 和 helper 使用 Node 标准库，不依赖原移动客户端的工具脚本或机器路径。

生成器在写入前通过已选 Rust 工具链的 `rustfmt`（edition 2024）格式化完整 Rust 输出；该工具属于现有 Rust 开发工具链，不添加第三方 Node 依赖，失败保持零工作区写入。 只有真实失败证明缺少该组件时，按环境恢复流程为当前工具链执行 `rustup component add rustfmt`，再复读 `rustup which rustfmt` 与 `rustfmt --version` 并重试；不升级或替换工具链。

1. 复用身份、平台与 NSH 子目标。仅 desktop 子目标处理既有九字段 profile 并选择 Logo；可选字段逐项询问，`system_notification` 与 `global_shortcut` 由能力限制派生 disabled，显式启用时停止。系统语言、三态主题、设置固定建立。桌面固定使用自定义多窗口宿主；`system_tray`、`single_instance`、`deep_link`、`autostart` 各自按选择接线，`deep_link` 依赖 `single_instance`。深链接必须先进入宿主待领取队列，通知 TSX 后由订阅者主动领取，不能只向尚未就绪的窗口发送一次性事件；单实例重试不得重复交付。应用菜单快捷键不得冒充系统全局快捷键。mobile/Web 不单独询问桌面 profile，继续由对应 NSH 官方宿主运行相同 Mixed UI。
2. 运行 `scripts/add_nsh_adapter.mjs --root <已有共享core的根> --options <确认字段JSON文件>`。JSON 含 `projectId,nameZh,nameEn,owner,targetPlatforms,nshTargets`，desktop 时还含九字段 `profile` 和可选已选 `logo` 绝对 PNG 路径。路径/身份/依赖/已有接口冲突在写入前拒绝。NSH 适配器直接依赖 core；适配器只拥有界面状态与宿主机制。没有业务需求时不建立示例业务。
3. 所有已选目标使用 NSH Mixed：`App.tsx` 是常规 TSX 根组件，跨端产品主视图和 Rust core 调用放在 `App.shared.tsx`，各入口导入该共享模块；`nsh.json` 设 `rust: "."`，不设置 Rust UI `root`；同成员的 native module 注册 Rust 导出，薄层调用共享 core。desktop 的自定义 AppKit/Win32/GTK 宿主以 `set_ui_sets` 注册 NSH 基座和成员 registry，以 `App::Js(bundle)` 加载 TSX bundle，仅声明已选 `host.call`。mobile/Web 使用对应 NSH 官方宿主；mobile 入口通过 `safeArea()` 避开系统栏，`nsh.json` 设状态栏 `foreground: auto` 并授予 `capabilities.statusBar: true`，使图标随应用浅深色切换。core 保持运行时中立；根 `[workspace.dependencies]` 是所有依赖版本和 features 的唯一来源，成员对桌面宿主依赖使用目标条件与 `workspace = true`。
4. 条件页面和 sponsor 媒体只按 desktop 选择进入 NSH。设置页在 desktop/mobile/Web 共用卡片分区与语言/主题可访问单选组；仅已选 desktop 自启增加读取真实宿主状态的语义开关。mobile 顶部只显示品牌标题，首页/设置使用滚动内容之外的固定底栏，不因平板宽度恢复侧栏；底栏消费系统底部和横向安全区，两个等宽按钮至少 48 点高，Web 仍按宽度回流。关于和赞助页遵守 `docs/design_standards/nsh_gui.md` 的支持页结构：关于页保留结构化双语声明与更新日志，赞助档位随可用内容宽度回流并保留支付媒体。文案、作者、档位、金额与图片来自当前项目的已确认资料，未选能力不留入口或资源。正式 Logo 使用三原始候选与所选项流程；工程回归可使用明确标记的中性夹具，不能充当品牌确认。
5. 运行本次 Node 回归与非空 Rust workspace 测试、`nsh check`、`nsh test`。先核对全局 CLI 的 `nsh --version` 为 `nsh 0.4.0 (e626a8d)`，且根 Cargo 全部 NSH 依赖固定到同一正式提交。desktop 开发入口先构建 TSX bundle，再运行自定义宿主；桌面打包由 `$desktop-build-nsh-release` 独立编译宿主并封装资源。组合工程的移动/Web 包必须经受管 build helper 的暂存 Mixed 入口调用官方包路径，剔除仅桌面有效的 `capabilities.host`；直接对原成员执行官方 `nsh package` 会携带桌面 host 声明。只对实际运行过的原生目标报告宿主验证；初次初始化在裁剪与唯一基线提交前调用 `$desktop-test-nsh-initialization-e2e`。

生成器不覆盖 core，不创建 Git、策略、产品记忆、发布上下文或下游派生能力。完成初始化时保留本 Skill、知识引用、打包 Skill；删除初始化 wrapper/E2E，地图同步裁剪。报告声明平台与真实验证平台，不能把生成源码称为产品交付。
