---
name: desktop-test-nsh-initialization-e2e
description: 在 NSH 中性下游基线前执行非空 Rust/NSH 测试、所选目标真实本机运行或打包与 Computer Use 初始化检查，完成后删除本入口。
---

# NSH 初始化真实检查

只在根 Cargo `interfaces = ["nsh"]` 且尚未裁剪/创建唯一基线时调用；旧 `interfaces = ["gui"]`、`gui-framework = "nsh"` 的既有下游按原事实读取。不消费候选 E2E 偏好，不生成产品验收结论。先读 `nsh-targets`、具体目标平台和 `$desktop-add-nsh-adapter` 的运行时引用；只有选择桌面时读取生成的 `docs/GUI_APP_PROFILE.md`。

1. `cargo test --workspace --all-targets --all-features` 必须非空；`nsh check` 与所选图形/Web/Mobile 目标的 `nsh test .` 必须通过。TSX 渲染测试还要调用 Mixed 原生模块的中性 core API；启用深链接时覆盖订阅前入队、通知与主动领取交错、窗口关闭后的未领取项转移和同一单实例请求重试不重复交付。`nsh/test` 的模拟 host handler 只证明协议映射，不证明 OS 宿主行为。选择 TUI 时先核对根 Cargo 的 `nsh-core`、`nsh-base` 官方 main 固定 revision 与 `nsh --version` 短 SHA 精确匹配；旧 0.4.0 或不匹配工具链立即失败关闭。然后从下游根目录执行生成的 `node .agents/skills/desktop-add-nsh-adapter/scripts/run_nsh_tui.mjs --root . --check` 和 `--test`（测试命令对应 `nsh:test:tui`）；测试须实际渲染并调用共享 Rust core 的 Mixed native module。用 `dev:tui` 在所选 macOS/Windows/Linux 真实终端启动，检查键盘交互、视图更新、退出后的终端恢复和错误路径。组合工程必须通过该 wrapper 在忽略的暂存入口剔除桌面 `capabilities.host`，并导入专用 `App.tui.tsx`；不得直接对原成员运行 TUI 命令。只有源码、模拟测试或空壳屏幕不能证明 TUI 初始化通过。
2. 选择桌面时使用 `$desktop-build-nsh-release` 的 `local` 模式构建本机 Mixed bundle 与自定义宿主并组包，启动该次真实 app；不能使用会生成单窗口 runner 的 `nsh package` 冒充当前桌面入口。使用 Computer Use 检查双语标题、设置、Light/Dark/System、侧栏、条件关于/赞助页面和禁用入口缺席；检查默认多窗口的新建、切换、显示全部、关闭与最后窗口生命周期，页面会话按窗口隔离，退出后重置，偏好保持。检查原生应用菜单动作与语言变化；应用菜单快捷键不算 OS 全局快捷键。点击控件周围不得触发。
3. 按桌面 profile 逐项实测：托盘启用时图标可见，关窗隐藏、菜单恢复和显式退出；托盘禁用时关最后窗口退出。单实例启用时二次启动转给原进程并恢复现有窗口，禁用时不安装该限制。深链接启用时从实际安装后的 OS scheme 冷/热启动只触发受限恢复动作，且单实例已启用；禁用时无 scheme 注册与监听。自启启用时读取真实 OS 状态、切换、失败回读并恢复测试前状态；禁用时无登录项操作和设置入口。目标宿主无法观察或恢复任一已启用能力时阻断初始化，不用源码和模拟 handler 代证。
4. 选择 Web 时经 `$desktop-build-nsh-release` 的 `local --target web` 入口构建实际官方宿主包，再用本地静态服务器和浏览器检查完整包、窄屏、按钮及主题。选择移动时以可用模拟器/设备执行真实构建与安装；不可用设备/宿主明确 Not verified，不能把桌面或 headless 测试当移动通过。组合工程的受管构建入口会在临时 Mixed 源入口剔除 `capabilities.host` 后调用官方 `nsh package`；直接以原桌面成员打移动/Web 包会携带桌面 host 声明，不符合隔离要求。mobile/Web 最终生成物不得注册桌面 host 方法或装入桌面菜单。用户要求全流程时持续修复可执行范围；不可得硬前置如签名/目标宿主如实报告。
5. 系统通知与 OS 全局快捷键保持 unavailable/disabled，不能把应用菜单快捷键算作全局注册；初始壳层不发送通知或注册 OS 热键。还原本次修改的偏好与自启状态，退出 owned 进程，保留脱敏的工程测试证据。测试专用夹具不得伪装正式品牌或产品。

初始化编排继续复制规范、保留适用 Skills、建立受保护版本状态、裁掉初始化目录和本 Skill，最后创建独立 main 唯一基线与 clean 工作树。官方 main 预览版没有 `nsh package --target tui` 或正式 terminal release runner；TUI 的 run/test 通过不等于候选包验收。缺少真实本机观察时不得宣称初始化 E2E 通过。后续最终候选使用 `$desktop-test-final-artifact-e2e`，TUI 候选须遵守构建 Skill 的当前门禁。
