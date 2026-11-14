---
name: desktop-test-nsh-initialization-e2e
description: 在 NSH 中性下游基线前执行非空 Rust/NSH 测试与已选目标的实际运行检查，完成后删除本入口。
---

# NSH 初始化真实检查

仅用于尚未裁剪或创建唯一基线的顶层 NSH 下游。先读 Cargo `nsh-targets`、具体目标平台和 [$desktop-add-nsh-adapter](../desktop-add-nsh-adapter/SKILL.md) 的运行时引用；只有选择 desktop 才读生成的 `docs/GUI_APP_PROFILE.md`。此门禁独立于候选 E2E 偏好，不作产品验收结论。

1. 复核 CLI `nsh 0.5.1 (224d9a7)` 与 Cargo 固定提交、项目本地两份官方 Skill、非空 `cargo test --workspace --all-targets --all-features`、`nsh check` 和 `nsh test`。启用深链接时覆盖官方事件的启动与运行中交付；headless 测试不证明 OS 注册。
2. desktop 用 `$desktop-build-nsh-release` 的 `local` 模式生成官方本机包，启动该次应用并通过 Computer Use 检查多窗口、新建/显示全部/关闭与最后窗口生命周期、应用菜单、双语、三态主题、窄屏、侧栏及条件支持页。已选托盘验证关窗隐藏、菜单恢复与退出；单实例验证二次启动；深链接在官方声明或注册后分别验证冷/热启动。不验证或启用中性模板未接入的自启、通知和 OS 全局快捷键。
3. TUI 运行项目 `nsh:test:tui`，在真实终端通过 `dev:tui` 确认可见内容、窄终端、Tab/Enter 进入设置、切换语言或主题、退出和终端恢复。无需伪造打包步骤。
4. Web 通过 `local --target web` 构建官方静态站点，启动本机静态服务器，用浏览器检查实际包、窄屏、设置及主题。移动在所选模拟器/设备检查导航、安全区、语言和主题；macOS 可分别检查 Simulator.app 与 Device Hub，截图不能代替交互。组合项目通过受管打包入口隔离桌面窗口和协议声明。
5. 还原本次验证改动的偏好与宿主注册。精确报告已测与未测宿主、可观察结果及不能完成的门禁；未执行的桌面能力、设备或终端行为不能记作通过。

裁剪预览所需的 `unitTests` 引用绑定非空 Rust 与 NSH headless 结果。desktop 提供 `nshDesktopPackage` 和 `nshDesktopRun`，mobile 提供 `nshMobileRun` 并注明本次真实运行的移动平台、设备或模拟器，Web 提供 `nshWebPackage` 和 `nshWebRun`，TUI 提供 `nshTuiTests` 和 `nshTuiRun`。移动组至少实测当前宿主可用的一个平台，其他平台按实际验证状态报告。先取得真实结果，再使用同一工作区摘要提交这些引用。
