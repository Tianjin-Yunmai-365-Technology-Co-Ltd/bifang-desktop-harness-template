# 客户端工程方案索引

NSH 专用路由：新下游顶层 `interfaces = ["nsh"]` 配合 `nsh-targets` 和具体 `target-platforms`，仅支持 desktop/mobile/web，并统一正式 v0.4.0 固定提交 `e626a8dd8f8d8b277b9507cfd5ac74d0e67020f3` 与匹配 CLI；TUI 暂不可用，声明或请求 `tui` 时失败关闭。旧 `interfaces = ["gui"]`、`gui-framework = "nsh"` 保留读取兼容。NSH 使用 `$desktop-add-nsh-adapter`、`docs/design_standards/nsh_gui.md` 与 `$desktop-build-nsh-release`；桌面九项配置仅适用于 desktop。能力与打包边界见 NSH Skill 的 `references/runtime-and-capabilities.md`。

本文按任务组织 DESKTOP 与 NSH 的依赖版本、实现方案、性能和打包知识。根 Cargo 决定实际框架/接口/目标/版本；中性 renderer、已有产品接线与目标运行证据分别判断。普通实现只读命中主题，不自动初始化、升级依赖、跑基准或构建。

| 任务 | 入口与事实 | 完成边界 |
| --- | --- | --- |
| Tauri 依赖、插件与既有 core 增加 GUI | [$desktop-add-gui-adapter](../.agents/skills/desktop-add-gui-adapter/SKILL.md)、[$desktop-manage-dependencies](../.agents/skills/desktop-manage-dependencies/SKILL.md) | 按已批准范围接线与验证 |
| Tauri 本地试包与发布候选 | [$desktop-build-tauri-local-install](../.agents/skills/desktop-build-tauri-local-install/SKILL.md)、[$desktop-build-tauri-release](../.agents/skills/desktop-build-tauri-release/SKILL.md) | 按平台与候选身份分派，具体路线见下表 |
| NSH 共享 core、Mixed 薄适配器与运行时能力 | [$desktop-add-nsh-adapter](../.agents/skills/desktop-add-nsh-adapter/SKILL.md)、[运行时边界](../.agents/skills/desktop-add-nsh-adapter/references/runtime-and-capabilities.md) | desktop/mobile/Web 均为 TSX UI + Rust native module 调用共享 core；桌面固定自定义多窗口宿主，四项能力按选择接线，两项仍不可用 |
| NSH 桌面、移动与 Web 打包 | [$desktop-build-nsh-release](../.agents/skills/desktop-build-nsh-release/SKILL.md) | 目标逐项打包与取证；本机无法构建的目标保留 `Unverified` |
| 最终候选验收 | [$desktop-verify-delivery](../.agents/skills/desktop-verify-delivery/SKILL.md)、[$desktop-test-final-artifact-e2e](../.agents/skills/desktop-test-final-artifact-e2e/SKILL.md) | 真实最终字节和目标宿主，构建通过不代替验收 |
| Linux 宿主、工具链及能力边界 | 下文 Linux 问题索引与对应 Skill 引用 | 区分中性生成、独立接线、协议回归与目标运行证据 |

## 各平台方案入口

下表记录现有工程路径，不能据此宣称目标平台已经运行通过。CLI/MCP 的共享核心、接口边界和工具链见 [Rust 基线](RUST_CLI_TEMPLATE.md)，CLI 候选默认只构建当前宿主；跨平台矩阵按 [构建 Skill](../.agents/skills/desktop-build-rust-release/SKILL.md) 的明确请求与远端来源门禁执行。NSH 单独按目标打包，不使用该 CLI 矩阵。

| 平台 | Tauri | NSH | 验证边界 |
| --- | --- | --- | --- |
| macOS | [原生 DMG、签名与公证](../.agents/skills/desktop-build-tauri-release/SKILL.md) | 原生 `.app` 归档 | 打包、签名、公证与真实窗口/安装行为分别取证 |
| Windows | [原生 x64 NSIS 试包](../.agents/skills/desktop-build-tauri-local-install/SKILL.md)、[正式候选及 macOS xwin](../.agents/skills/desktop-build-tauri-release/SKILL.md) | 原生 ZIP | xwin 不证明 Windows 安装/运行；UAC、通知和登录项按真实宿主验证 |
| Linux | [同架构 deb/AppImage 本地试包](../.agents/skills/desktop-build-tauri-local-install/references/tauri-linux.md)、[运行时](../.agents/skills/desktop-add-gui-adapter/references/linux-runtime.md) | 原生 tar.gz | Tauri 本地试包不升级为正式候选 |
| Android / iOS / Web | 不适用 | Android 开发签名 APK、iOS 本地 `.app`、Web 静态目录 | 渠道签名与目标设备/浏览器运行分别取证；本地 `.app` 不等于 IPA |

未执行的原生构建、托管矩阵、签名和目标桌面验收仍为 `Unverified`，既有证据缺口见 [技术债](TECH_DEBT.md)。

## Linux 问题索引

Linux 知识按既有 Skill 职责维护；只读取当前问题对应的引用，不自动安装、构建或运行验收。

| 问题 | 知识入口 | 判断边界 |
| --- | --- | --- |
| Tauri deb/AppImage、托盘运行库、非 ASCII 产品名派生的非法 Debian 包名 | [Tauri Linux 本地试包与宿主要点](../.agents/skills/desktop-build-tauri-local-install/references/tauri-linux.md) | 只规范安装标识并核对 payload 不变；本地试包不构成 Linux 候选证据 |
| Tauri 用户/XDG 目录、卷边界、发现测试与取消 | [Linux 运行时与测试边界](../.agents/skills/desktop-add-gui-adapter/references/linux-runtime.md) | 枚举省略不等于递归排除；策略与宿主 I/O 分开回归 |
| Tauri 托盘恢复、自启、WebView origin 与应用 command ACL | [Linux 桌面生命周期](../.agents/skills/desktop-add-gui-adapter/references/linux-runtime.md#托盘窗口与登录启动)、[WebView 与权限](../.agents/skills/desktop-add-gui-adapter/references/linux-runtime.md#webview-与-command-权限) | 菜单恢复不依赖 Linux 图标事件；ACL 与 origin 按项目实际配置判断 |

下游历史候选只证明其精确源码、最终字节、架构、桌面会话和场景；其它版本或平台不继承通过状态。产品能力矩阵及原始验收记录留在下游，Harness 只沉淀中性机制与取证要求。新增引用沿各框架对应的条件 Skill 传播，不把产品知识库、身份、业务参数或来源锁反向复制进模板。

## Skills 维护与传播

adapter 只负责装配，依赖 Skill 管版本/补丁，build Skill 管产物。平台是 build 的按需 reference，不另建重复生命周期的 Skill。只按下游实际接口传播适用的工程能力。共享规则通过索引引用，产品参数和历史性能证据留在产品文档。回流 Harness 定点合并中性工程，不覆盖产品源码/身份/策略或其他新工具，也不伪造完整升级来源锁。
