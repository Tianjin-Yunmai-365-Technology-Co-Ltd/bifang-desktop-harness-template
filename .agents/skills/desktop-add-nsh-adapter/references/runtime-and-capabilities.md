# NSH 0.5.0：运行时、目标与能力

以 [v0.5.0 发布](https://github.com/longbridge/nsh/releases/tag/v0.5.0) 为准：Cargo 依赖固定官方 Git 提交 `f4d68f7f9f31eb7b3ecc8a4cbc31096d5c6238a1`；全局 CLI 为 `nsh 0.5.0 (f4d68f7)`。官方安装器支持 `NSH_VERSION=v0.5.0`，平台运行时按 CLI 同版本安装组件。详见[安装](https://github.com/longbridge/nsh/blob/v0.5.0/website/docs/installation.md)。现有 0.4.0 自定义宿主项目保留原脚手架与构建链路，迁移须单独处理产品源码和 Cargo；Harness 升级不自动完成迁移。

| `nsh-targets` | `target-platforms` | 官方运行与打包 |
| --- | --- | --- |
| desktop | Windows、macOS、Linux | `nsh run`；对应平台上的 `nsh package --target macos\|windows\|linux` |
| mobile | Android、iOS | `nsh run --target android\|ios`；Android APK，iOS 模拟器或设备 app；正式 IPA 独立签名 |
| web | Web | `nsh run --target web`；`nsh package --target web` 输出静态站点 |
| tui | Windows、macOS、Linux 的终端 | `nsh run --target tui`、`nsh test --target tui`；0.5.0 没有 TUI 打包目标 |

TUI 和 desktop 并选时系统集合去重；仅 TUI 不询问桌面 profile 或 Logo。TUI 是 NSH 子目标，使用同一 Mixed UI、共享 core、键盘焦点及终端 Cell 布局。用 `platform.idiom === "terminal"` 区分终端；`platform.os` 仍是宿主系统。图形侧栏、托盘、窗口和移动状态栏不用于终端。0.5.0 在无状态栏配置时仍可能记录一次权限警告，终端测试和运行继续使用原有权限。用 [TUI 指南](https://github.com/longbridge/nsh/blob/v0.5.0/website/docs/tui.md) 验证窄终端、Tab/Enter、退出与终端恢复。各目标脚本按实际平台选择 `App.test.tsx` 运行共享回归；`App.platform.test.tsx` 中的宿主模拟由无目标参数的 headless 套件执行。专属测试可以直接将测试文件路径传给 `nsh test`。

Mixed 成员的 `nsh.json` 设置 `rust: "."`，不设置 `root`；`App.tsx` 使用 NSH 自身的 TSX 运行时，native module 将业务委托给 Rust core。选择 NSH 时自动把同版本官方 [nsh](https://github.com/longbridge/nsh/tree/v0.5.0/skills/nsh) 与 [nsh-design-guides](https://github.com/longbridge/nsh/tree/v0.5.0/skills/nsh-design-guides) 原样安装到项目的 `.agents/skills/`（保留引用与 Apache 许可证）。模板内固定发行版副本，初始化不调用 npm、不依赖用户目录的全局 Skill。用项目的 Skill 查类型、组件及设计规则。

| 桌面能力 | 0.5.0 模板接线 |
| --- | --- |
| 多窗口与应用菜单 | `nsh/desktop` 的 `Window.open`、`currentWindow`、`windows`、`Menu`、`Application.quit`；窗口能力只授予普通窗口和层级。主窗口拥有应用菜单，各窗口拥有独立页面状态。 |
| 托盘 | 选中才调用 `Tray.set`，主窗口关闭请求改为隐藏，托盘恢复或新建窗口，显式退出走 `Application.quit`。 |
| 单实例 | 选中才在 `nsh.json` 声明 `singleInstance: true`；Windows/Linux 打包应用由 NSH 处理再次启动；macOS 复用 Launch Services 的应用包行为。 |
| 深链接 | 仅 desktop 且启用单实例时声明 `schemes`，通过 `UrlScheme.on("open")` 处理；本模板只消费固定恢复 URL，无业务导航。 |
| 自启、通知、全局快捷键 | 中性模板的三项固定关闭：0.5.0 无官方开机自启；官方通知和全局快捷键 API 可在后续产品需求中按平台与权限独立接入。 |

桌面以[官方桌面模块](https://github.com/longbridge/nsh/blob/v0.5.0/website/modules/nsh-desktop.md)和 [URL Scheme](https://github.com/longbridge/nsh/blob/v0.5.0/website/modules/nsh.md#urlscheme)为准。由官方打包器产生声明，Windows/Linux 由官方应用注册；真实冷/热启动另在相应 OS 验证。移动的状态栏使用 `statusBar.foreground = "auto"` 和 `capabilities.statusBar = true`。组合工程打移动/Web 包时复制临时工作区布局及应用资源，移除桌面窗口配置、单实例和模板生成的恢复协议，保留显式空权限对象与产品自有协议。

从项目根使用 `npm run dev`，或者用 `dev:desktop`、`dev:android`、`dev:ios`、`dev:web`、`dev:tui` 指定已选开发目标。iOS 模拟器选择通过 `npm run dev:ios -- --device <名称或 UDID>`。用 `npm run nsh:check` 检查类型，`npm run nsh:build` 编译应用资源与字节码，`npm run nsh:test` 执行全套 headless 渲染测试；`nsh:test:<目标>` 使用目标运行器。NSH 的移动和 Web 开发服务可供局域网设备连接，在可信网络启动。

若 iOS 模拟器开发首次因 QuickJS bindgen 找不到 SDK 头文件失败，用 `xcrun --sdk iphonesimulator --show-sdk-path` 查找 SDK，在当前命令环境为 `BINDGEN_EXTRA_CLANG_ARGS_aarch64_apple_ios_sim` 设置 `-isysroot '<SDK 路径>'` 后重试。受管 iOS 打包入口会按目标补充该参数。

初始化派生的应用 ID 供工程试用。产品明确发布身份后，在 `nsh.json` 登记受控的反向域名 ID、应用图标和渠道 build 编号。项目版本门禁同步 Cargo 和 `nsh.json` 的版本。关于页通过 `appInfo().version` 读取运行时版本。

检查 Rust、`nsh check` 和非空 `nsh test`；TUI 另走官方终端渲染测试。源码与 headless 回归只证明各自范围，实际窗口、托盘、OS 事件、设备和签名按真实宿主分别取证。
