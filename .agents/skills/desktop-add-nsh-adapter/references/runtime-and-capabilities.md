# NSH 运行时与能力

提取来源：本机 `nsh-desktop` 的 NSH 0.4.0 TSX 应用和自定义桌面宿主，以及 Native Shell 官方 v0.4.0 源码。只提取工程知识，不迁移示例产品逻辑、网络地址、凭据、签名或历史验证结论。

官方来源：[NSH](https://github.com/longbridge/nsh/tree/e626a8dd8f8d8b277b9507cfd5ac74d0e67020f3)、[发布](https://github.com/longbridge/nsh/releases/tag/v0.4.0)、[Rust](https://nsh.dev/docs/rust)、[安装](https://nsh.dev/docs/installation)。固定参考 revision `e626a8dd8f8d8b277b9507cfd5ac74d0e67020f3`。NSH 使用 Apache-2.0；本模板自行编写接线，不内嵌第三方源码。UI/API 以实际 CLI 和项目依赖为准，不自动升级。

NSH 是 Rust 原生渲染引擎；TSX 使用自己的 reactive/JS 模块，不是 React。`nsh` 是全局 CLI，Cargo 运行时依赖在项目本地。当前适配器采用 Rust UI，免装前端工具链。`nsh-core` 与 `nsh-base` 需与 CLI/runtime 同 revision：crates.io v0.4.0 的 iOS 包遗漏共享 speech 源文件，采用官方 v0.4.0 Git revision；不得把源机器 Cargo 缓存绝对路径写入下游。

应用标识由 snake_case 每段加 `p` 前缀后点分隔，例如 `sample_tool` 为 `com.psample.ptool.app`；同时满足 Android/Apple 字符要求，数字分段合法且不因去掉下划线而碰撞。不得复用含连字符的桌面专用 bundle 标识。

| 能力 | 当前模板 | 机制/边界 |
|---|---|---|
| 桌面、移动、Web | 支持生成 | AppKit/Win32/GTK、UIKit/Android、HTML + WASM；各目标独立构建和验证 |
| 语言 | 固定 | `locale().as_str()`，中文/英文与未知语言回退英文；用户选择优先 |
| 主题 | 固定 | `set_color_scheme(Appearance::System/Light/Dark)`，中央 theme 语义色 |
| 设置、侧栏、关于、赞助 | 固定/按选择 | UI adapter signal，界面偏好可用 NSH Storage；页面会话不持久化 |
| 窗口 | 桌面宿主 | 原生 title/frame；移动和 Web 不应用桌面尺寸；窗口恢复扩展须有真实验证 |
| 对话框 | 平台 API | NSH 原生 dialog/picker；不安装 Tauri plugin 或开放通用文件权限 |
| 托盘、系统通知、自启、单实例、深链接、系统热键 | unavailable/disabled | 当前无已接线的跨平台实现；菜单 shortcut/keymap 仅应用内，不能当系统热键 |

`nsh-desktop` 的托盘、单实例和深链接在 AppKit/Win32/GTK 自定义宿主中实现，自启另用各平台登录项；示例没有系统通知和 OS 全局热键。当前 Rust UI 的官方 `nsh package` 会生成自己的平台 runner，不会打包项目自定义 `src/main.rs`；Rust UI 也没有可供这些宿主调用的公开 `host.call` 桥接。因此不能仅复制示例源码或把 profile 改为 enabled。未来接入这些能力须先建立 Rust UI 与自定义宿主的明确接口、替换对应平台组包、实现注册和退出/恢复语义，并在真实目标宿主执行 E2E。NSH 应用内菜单和快捷键可以独立使用，但不得记为 `global_shortcut`。

最低平台参考：macOS 14、Windows 10 1809、Linux GTK 4.14、Android API 28、iOS 15、现代浏览器。最低版本是官方声明，不代表已逐台验证。Web core 不得无条件使用 native-only fs、进程、线程 API；真实业务按目标条件装配驱动。

命令：`nsh check`；`nsh test` 用 `nsh/test` 打开真实 Rust 根渲染树；`nsh run --target <目标>`；`nsh package --target macos|windows|linux|android|ios|ios-simulator|web --out <新目录>`。测试与打包共享 GUI `.nsh/`，串行执行。macOS/Windows/Linux 原生包分别是 `.app`、目录+zip、目录+tar.gz；Android 是 APK，iOS 未签名设备 app/已签名 IPA、模拟器 app；Web 是完整静态目录。包结构验证不证明实际启动。Android debug 签名不能冒充商店签名，iOS 真机与渠道签名留待明确身份和授权。

iOS 0.4.0 打包兼容：展示名过滤出的 ASCII 可执行名若恰为 nsh，在 macOS 大小写不敏感目录上会撞到资源目录。独立构建 Skill 已处理临时内部命名、公开身份恢复和模拟器重新签名；移动打包应走该 Skill 的 local/candidate 入口。Web 官方输出位于以展示名命名的子目录，manifest.webRoot 指向实际站点入口，不假定 index.html 在最外层。
