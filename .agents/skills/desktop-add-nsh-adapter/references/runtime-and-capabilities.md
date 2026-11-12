# NSH 运行时与能力

提取来源：本机 `nsh-desktop` 的 NSH 0.4.0 TSX 应用和自定义桌面宿主，以及 Native Shell 官方 v0.4.0 文档。只提取工程知识，不迁移示例产品逻辑、网络地址、凭据、签名或历史验证结论。

官方来源：[v0.4.0 发布](https://github.com/longbridge/nsh/releases/tag/v0.4.0)、[Rust](https://nsh.dev/docs/rust)、[安装](https://nsh.dev/docs/installation)。正式版 CLI 应显示 `nsh 0.4.0 (e626a8d)`，全部 NSH Cargo Git 依赖固定提交 `e626a8dd8f8d8b277b9507cfd5ac74d0e67020f3`。NSH 使用 Apache-2.0；本模板自行编写接线，不内嵌第三方源码。既有下游不自动升级。

NSH 是 Rust 原生渲染引擎；TSX 使用自己的 reactive/JS 模块，不是 React。新下游把 NSH 作为与 CLI、MCP、DESKTOP 平级的接口：Cargo `interfaces = ["nsh"]`，`nsh-targets` 只记录 desktop/mobile/web，`target-platforms` 记录具体系统。新实例化按能力派生完整平台集合：desktop 对应 Windows、macOS、Linux，mobile 对应 Android、iOS，web 对应 Web；已有下游 add-only 接入尊重受保护的既有平台。既有 `interfaces = ["gui"]`、`gui-framework = "nsh"` 只读兼容。`nsh` 是全局 CLI，Cargo 运行时依赖在项目本地。全部可用目标均采用 Mixed：TSX 根组件配合 Rust native module 导出，薄模块调用共享 core。`nsh-core`、`nsh-base` 及桌面宿主的 NSH crate 与 CLI/runtime 固定同一正式 Git revision：crates.io v0.4.0 的 iOS 包遗漏共享 speech 源文件；不得把源机器 Cargo 缓存绝对路径写入下游。

应用标识由 snake_case 每段加 `p` 前缀后点分隔，例如 `sample_tool` 为 `com.psample.ptool.app`；同时满足 Android/Apple 字符要求，数字分段合法且不因去掉下划线而碰撞。不得复用含连字符的桌面专用 bundle 标识。

| 能力 | 当前模板 | 机制/边界 |
|---|---|---|
| desktop、mobile、web | 支持生成 | AppKit/Win32/GTK、UIKit/Android、HTML + WASM；各目标独立构建和验证 |
| 语言 | 固定 | TSX `locale()` 初始化中文/英文，未知语言回退英文，用户选择优先；偏好经 NSH Storage 保存 |
| 主题 | 固定 | TSX `setColorScheme("system"/"light"/"dark")`，中央 Token 统一语义色；mobile 状态栏使用 `auto` 前景和 `statusBar` capability 随应用外观更新 |
| 设置、侧栏、关于、赞助 | 固定/桌面按选择 | TSX signal 管页面会话，NSH Storage 保存语言、主题与详细侧栏折叠；九项 profile 只在 desktop 子目标询问 |
| 窗口 | desktop 固定多窗口 | AppKit/Win32/GTK 自定义宿主，每个窗口独立加载同一 TSX bundle；`window.list/open/focus/showAll/close` 与 `windows` 事件；移动/Web 不应用桌面尺寸 |
| 对话框 | 平台 API | NSH 原生 dialog/picker；不安装 Tauri plugin 或开放通用文件权限 |
| 系统托盘 | desktop 可选 | macOS NSStatusItem、Windows Shell_NotifyIcon、Linux StatusNotifierItem；未选时不生成宿主代码和依赖。Linux watcher 的上下线通知异步到达，执行保活变更前须复查最新状态；显式退出先释放桌面状态借用再调用 GTK `quit` |
| 单实例 | desktop 可选 | macOS 用户锁和 Unix socket、Windows 命名互斥与窗口消息、Linux GApplication；未选时允许独立进程 |
| 深链接 | desktop 可选且依赖单实例 | 仅 `app-<project-id-with-hyphens>://restore`，宿主恢复窗口并排队待领取链接，向 TSX 发送 `deepLink.available`，由 `deepLink.takePending` 一次性领取；不映射产品路由。macOS plist 注册，Windows/Linux 随包提供当前用户注册脚本；Linux 在解压包根运行 `sh register-deeplink-linux.sh` |
| 开机自启 | desktop 可选 | macOS 登录项、Windows 当前用户 Run 项、Linux XDG autostart；`autostart.get/set` 读取真实状态与错误，未选时无设置入口 |
| 系统通知、OS 全局快捷键 | desktop unavailable/disabled | 当前无接线，显式启用失败关闭；NSH 菜单与 shortcut 仅在应用内生效 |

支持页的 NSH TSX 实现：desktop/mobile/Web 共用设置页卡片分区，并以 `nsh/base` 的 `RadioGroup`/`Radio` 显示语言与主题选择。仅已选 desktop 自启项使用 `Switch`；开关只在宿主状态明确时可操作，请求中的禁用态、读取/写入错误及重试由界面显示，不能用本地 signal 推断 OS 已切换。关于页消费生成器给出的结构化中英文字段，联系信息、更新日志和免责声明分别成区，免责声明逐段渲染。赞助页由 `nsh_support_pages.mjs` 从项目资料生成档位与支付媒体，按窗口可用宽度减去侧栏和内容内边距计算一至三列；共用 Token 管制图片、卡片、排版与控件尺寸。关于、赞助、自启仅属 desktop 的条件能力；禁用时须从生成结果完全裁剪。

Mixed 的 `nsh.json` 设置 `rust: "."`，不设置 Rust UI `root`；`App.tsx` 是入口。mobile 同时设置 `statusBar: { foreground: "auto" }` 与 `capabilities.statusBar: true`，使应用内浅深色偏好切换后状态栏图标保持可见；仅配置 `auto` 而未授予 capability 不会生效。移动根布局固定竖向：顶部品牌标题用 `safeArea().top` 避开状态栏，滚动内容只消费横向安全区，独立的底部导航消费 `safeArea().bottom/left/right`，首页/设置按钮等宽且至少 48 点高；手机或平板宽度均不显示顶部菜单，Web 和桌面仍保留各自导航。桌面宿主调用 `set_ui_sets(vec![nsh_base::registry(), <member>::registry()])` 并以 `App::Js(bundle)` 装载 TSX。每个窗口仅注册清单声明的方法：固定 `window.list/setTitle/open/focus/showAll/close`、`app.quit`，按选择增加 `autostart.get/set` 和 `deepLink.takePending`；托盘和单实例仅由宿主处理。深链接先进入宿主待领取队列，再发送 `deepLink.available`；TSX 订阅后主动领取并串行处理，目标窗口关闭时将未领取项转给仍存活的窗口。macOS 单实例请求重试须使用同一请求标识去重。macOS 应用菜单为进程全局，由 `menuOwner` 与 `menu.owner` 事件转交所有权；Windows/Linux 菜单在各窗口中，应用菜单快捷键不构成 OS 全局快捷键。

桌面发布路径先 `nsh build` 生成 bundle，再分别编译自定义宿主并封装 `bundle.js`、`app.json`、`capabilities.json`、assets；官方 `nsh package` 不能替代这一步。移动/Web 继续用 NSH 官方宿主与官方包路径，但仍加载同一 Mixed TSX/native module。组合工程的移动/Web 必须经受管 build helper 的暂存 Mixed 入口，移除仅桌面有效的 `capabilities.host`；直接对原成员运行官方 `nsh package` 会携带桌面 host 声明。macOS 登录项要在真实 `.app` 中测试；Windows/Linux 深链接脚本需要当前用户执行并验证协议处理器，Linux 脚本先写同目录临时 desktop entry、再原子替换已有条目，避免跟随旧符号链接；解压包根须用 `sh register-deeplink-linux.sh` 调用，复制脚本本身不是注册成功。平台源码生成、编译、打包、真实运行和候选验收应分别记录，不因示例曾运行就推断本模板已验证。

最低平台参考：macOS 14、Windows 10 1809、Linux GTK 4.14、Android API 28、iOS 15、现代浏览器。最低版本是官方声明，不代表已逐台验证。Web core 不得无条件使用 native-only fs、进程、线程 API；真实业务按目标条件装配驱动。

命令：`nsh check`；`nsh test` 检查 Mixed TSX 和 Rust native module；desktop 开发脚本先 `nsh build` 再运行自定义宿主；只选择移动/Web 的工程可直接使用正式 0.4.0 CLI 的 `nsh run --target <目标>`。桌面构建走本项目 `$desktop-build-nsh-release`；移动/Web 包由同一 Skill 调用官方 `nsh package --target android|ios|ios-simulator|web --out <新目录>`，组合工程必须使用暂存入口隔离桌面 host 声明。测试与打包共享 NSH `.nsh/`，串行执行。macOS/Windows/Linux 原生包分别是 `.app`、目录+zip、目录+tar.gz；Android 是 APK，iOS 未签名设备 app/已签名 IPA、模拟器 app；Web 是完整静态目录。包结构验证不证明实际启动。Android debug 签名不能冒充商店签名，iOS 真机与渠道签名留待明确身份和授权。

iOS 0.4.0 打包兼容：展示名过滤出的 ASCII 可执行名若恰为 nsh，在 macOS 大小写不敏感目录上会撞到资源目录。独立构建 Skill 已处理临时内部命名、公开身份恢复和模拟器重新签名；移动打包应走该 Skill 的 local/candidate 入口。Web 官方输出位于以展示名命名的子目录，manifest.webRoot 指向实际站点入口，不假定 index.html 在最外层。
