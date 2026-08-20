# Rust 共享核心与可选适配器初始化基线

本文档定义下游项目初始化时采用的默认 Rust 技术基线。Harness 根目录不实现具体产品；中性初始化资产位于 `$desktop-initialize-rust-project` 的资产。下游可以在产品目的与核心输入输出尚未确定、规格仍为 `Draft` 时先建立工作区，但不得借初始化推测业务。若真实产品需要其他语言或不同架构，必须先通过范围闸门并在当日 `docs/adr/YYYYMMDD_ADR.md` 记录理由、风险、适用范围和恢复或迁移标准。

通用工程规则以 [`docs/ENGINEERING_RULES.md`](ENGINEERING_RULES.md) 为唯一详细来源。本文件补充 Rust 工作区、共享核心、Tokio 与可选适配器；CLI 专属规则只在选择 CLI 时适用。

## 固定边界

- 初始化询问 CLI/TUI/MCP/GUI，允许组合；空选择默认 CLI，用户显式未选择 CLI 时不得额外创建 CLI。
- 默认使用一个 Cargo 工作区，至少包含独立核心库和实际选择的适配器成员。
- 产品规格为 `Draft` 时，核心与所选适配器只提供中性状态；CLI JSON 必须包含 `productDefinitionRequired=true`。
- Core-first 是四类接口共同的硬规则。接口/宿主无关的领域类型、业务规则、语义校验、默认值、用例编排、状态转换、稳定错误、平台无关权限、迁移和持久化策略全部属于核心；即使当前只有一个适配器也不得把这些行为放入适配器。
- CLI/TUI/MCP/GUI 只负责自身运行时与装配、语法或协议结构解析、展示和纯交互状态、调用核心，以及结果/错误映射。包含条件、重试或状态决策的多次核心调用必须提升为单个核心用例 API；薄层按职责而不是代码行数判断。
- 适配器可以拒绝无法解析、缺少协议字段或违反宿主能力约束的输入；值域、跨字段约束、资源状态、业务权限、幂等性、可否执行和影响业务结果的默认值由核心判定。格式正确但业务无效的输入必须进入核心，并由所有接口复用同一稳定领域错误。
- CLI 参数/标准流/退出码、MCP schema 注解/stdio 生命周期、TUI 焦点/选择/滚动/按键/终端恢复，以及 GUI 路由/查询/交互状态、窗口/WebView/CSP/系统托盘/通知/自动启动留在对应适配器；这些机制触发的业务动作仍调用核心。
- 每个适配器必须以非可选普通生产依赖直接依赖核心；核心不得依赖任一适配器、clap、Ratatui/tui-realm、rmcp、Tauri、终端 I/O、进程状态或适配器特有序列化；适配器彼此不得依赖、启动或解析输出。
- CLI、TUI、MCP 使用 Tokio current-thread 异步入口；GUI 复用由 Tokio 支撑的单例异步运行时并使用普通 `async fn` 命令，不创建嵌套运行时。所有 Rust 适配器的 I/O、等待、计时、进程、协议与命令处理默认优先异步。
- 核心可以暴露不绑定具体运行时的 `async fn`。只有真实业务需要 Tokio 的 I/O、时间、同步、任务或进程原语时，核心才增加 Tokio 生产依赖。
- 文件系统、网络、外部进程和操作系统 API 的具体驱动位于适配器或职责明确的基础设施模块；调用策略和领域结果解释仍在核心。只有真实能力边界出现时才由核心定义运行时中立的 trait/port 并在适配器装配实现，不预建服务容器、注册器或假想抽象。
- TUI 固定使用 Ratatui + tui-realm + tui-realm-stdlib。Tauri GUI 前端固定使用 Vite + React + TypeScript + Mantine UI + TanStack Router 文件路由 + TanStack Query + Jotai，并使用 ESLint/`typescript-eslint`、Prettier、Vitest 与 Testing Library；这些技术族适用于 Draft 与 Approved 项目，偏离必须记录硬规则例外。
- Tauri GUI 的界面国际化是开发期硬性必选项：前端固定追加 `i18next` + `react-i18next`，Rust 后端（GUI 适配器层）固定追加 `rust-i18n`，系统语言探测统一使用官方 `tauri-plugin-os` 的 `locale()` API；默认语言跟随系统语言，界面必须提供语言切换入口，core 保持语言无关。详细规则见 [GUI 基线](../.agents/skills/desktop-add-gui-adapter/references/gui-baseline.md)与 [React 前端基线](../.agents/skills/desktop-add-gui-adapter/references/react-frontend-baseline.md)（见 ADR-20260806-001）。
- 关于/支持/赞助、动态标题、更新检查与遥测不属于 GUI 中性基线。已批准产品需要其中一项时使用 `$desktop-prepare-gui-support-surfaces` 逐项定义；模板不预创建 `docs/GUI_SUPPORT_SURFACES.md`。该条件 Skill 完整携带产品家族共享的固定赞助档位/价格、品牌联系人、支付二维码、更新 banner、小图及页面依赖资产，GUI 下游保留这些源资产，但只有已选界面所需文件才进入应用 bundle。它不提供来源下游产品名称/标识、产品路由、固定 endpoint、秘密或遥测实例。远程能力默认禁用，跨接口业务语义进入 core，窗口/系统浏览器/平台元数据和纯展示留在 GUI adapter。
- 初始版本为 `0.1.0`；根 `Cargo.toml` 的 `[workspace.package].version` 是唯一版本事实来源，各成员使用 `version.workspace = true`。
- 脚手架直接写入当前项目根。核心与接口目录为 `<项目标识>_core`、`_cli`、`_tui`、`_mcp`、`_gui`。
- 首次脚手架在当前项目根创建 `Cargo.toml`，登记核心与实际选择的适配器；未来只扩展该根清单。
- 当前项目根必须同时是独立 Git 顶层目录；若 `$desktop-initialize-rust-project` 被直接调用且边界缺失，必须在写入脚手架前初始化 `main` 分支仓库并验证，不能继承父仓库边界。
- 中性脚手架的格式、测试和构建证据只证明工程骨架可用，不构成产品目的获批、业务实现完成或可验收产品里程碑。

## Rust 技术选型事实标准

下列技术族是下游 Rust 的固定事实标准。固定表示已批准能力出现时必须优先采用对应技术，不表示初始化时把所有依赖无条件写入清单；没有真实调用路径、数据模型或可观察目标时不得为占位引入依赖。偏离任一固定技术必须先记录硬规则例外 ADR，包含理由、影响、替代验证和恢复或迁移标准。

| 领域 | 固定技术 | 适用边界 |
|---|---|---|
| 异步运行时 | Tokio | CLI/TUI/MCP 使用 current-thread 入口，GUI 复用 Tauri 的 Tokio 运行时；仅启用真实 I/O、计时、同步或进程能力所需的最小 feature |
| HTTP 服务 | Axum + Tower/Tower HTTP | 仅在产品明确批准 Rust HTTP 服务时引入；Axum 负责路由/提取/响应，Tower 负责通用 middleware 与服务组合，Tower HTTP 只启用真实需要的 HTTP middleware；业务规则仍调用 core，且这不恢复独立 WEB 适配器 |
| CLI 命令行 | Clap | 仅在选择 CLI 时引入；负责参数、子命令、帮助与版本，不承担领域校验或业务默认值 |
| 关系型数据库 ORM | SeaORM | 仅在产品明确批准关系型持久化且 ORM 合适时引入；实体映射与驱动位于基础设施边界，迁移策略、事务语义和业务决策归 core |
| 配置 | config-rs | 仅在存在真实运行配置时引入；采用“编译默认 → 唯一显式配置文件 → 环境变量”的确定性覆盖，schema/语义错误在启动监听或执行副作用前失败关闭；`notify` 只用于明确批准的窄热重载 |
| 本地可观测性 | tracing + tracing-subscriber + tracing-appender | 使用结构化 event/span、可读 fmt layer 与有界滚动文件贯穿批准路径；不得记录密钥、令牌、个人数据或未脱敏业务载荷 |
| 远程追踪 | OpenTelemetry OTLP/HTTP | 只有产品、隐私、采样、endpoint 和失败行为均批准后才引入并默认关闭；未配置时不得产生网络传输，遥测失败不得伪装为业务成功 |
| 应用错误上下文 | anyhow | 仅用于二进制/适配器装配、启动和不可恢复的内部上下文传播；不得成为公开 API 或稳定领域错误类型 |
| 稳定类型化错误 | thiserror | 用于 core、库与可恢复边界错误的类型化定义，并保留可匹配的稳定语义 |
| 序列化 | serde | 用于批准的协议、配置、持久化 DTO 或稳定数据交换；领域类型只有在真实跨边界需要时派生序列化 |
| 日期与时间 | jiff | 负责日期、时间、时区、时间戳和时间跨度；业务规则必须明确时区、时钟来源及可测试边界 |

错误分层必须保持稳定：core 和可复用库用 thiserror 暴露可判定错误，适配器将其映射为接口结果；anyhow 只能在应用边界补充上下文并终止或上报，不能抹去需要跨接口复用的错误类别。tracing 记录错误时使用结构化、可脱敏字段，不以自由拼接的完整输入替代领域事件。

以下组合只作为能力触发后的固定候选，不进入中性依赖：

- HTTP OpenAPI 采用 `utoipa` + `utoipa-axum` + Scalar 的 code-first 路线；Rust 类型/路由是唯一事实源，不另行手写静态 OpenAPI JSON/YAML。
- GraphQL 采用同一兼容版本族的 `async-graphql` + `async-graphql-axum`，且只有批准的真实消费者存在时引入。
- 非关系型持久化分别优先官方 MongoDB async driver 与 redis-rs Tokio 路线；缓存、幂等、迁移和权威状态归属仍需在产品边界中批准。
- 本地身份认证优先 `jsonwebtoken` + Argon2id；只有身份模型、密钥/凭据生命周期、撤销与安全验收全部批准后才可实现，绝不作为脚手架默认能力。

## 初始化环境门禁

| 项目 | 默认值 | 约束 |
|---|---|---|
| Rust 语言版本 | `2024` | 稳定版 Rust；不使用 nightly 功能 |
| MSRV | `1.90.0` | 根工作区写入 `rust-version = "1.90"`，表示最低兼容版本；接受 1.90.0 及以上稳定版，不要求精确等于 1.90.0 |
| 包结构 | 工作区 | 当前根目录下的 `<项目标识>_core` + 所选适配器；当前根同时是独立 Git 顶层目录 |
| 初始版本 | `0.1.0` | 后续提升由用户明确决定 |
| 锁文件 | 提交根 `Cargo.lock` | 使用 Cargo 生成；不得手工编辑 |
| Node.js | 仅 GUI：已安装环境；缺失时安装当前受支持 LTS | 非 GUI 为 `not-required` |
| pnpm | 仅 GUI：稳定版且可调用 | 前端固定包管理器；非 GUI 为 `not-required` |
| MSVC 构建工具 | Windows 缺失时自动安装 | 验证 Microsoft 签名，安装 C++ 工作负载并复探 |
| Linux 系统开发库（仅 GUI） | Tauri 2 依赖的 webkit2gtk（`webkit2gtk-4.1-dev` 或 `webkit2gtk-4.0-dev`，视发行版而定）、`libgtk-3-dev`、`librsvg2-dev`、`libayatana-appindicator3-dev` 等发行版对应的开发包 | 非 GUI 为 `not-required`；具体包名随发行版包管理器变化，需按目标发行版核对 |
| macOS Xcode Command Line Tools（仅 GUI） | 缺失时执行 `xcode-select --install` | 非 GUI 为 `not-required` |
| Python 3 | 可选 | 缺失时询问是否安装；跳过不阻断初始化，但 Python 检查记为未执行 |

初始化前运行只读探测：

```text
rustup --version
rustc --version
cargo --version
rustc -vV
# 仅 GUI
node --version
pnpm --version
```

首次开发或工具链要求变化时使用 `$desktop-check-development-environment`。Rust 始终是阻断门禁；Windows MSVC 构建工具同样阻断。只有 GUI 选择才增加 Node.js 与 pnpm 阻断门禁；其他接口组合不得为该门禁安装或升级二者。

首次开发必须调用 Skill 自带入口，不得临时重写安装命令：

```text
# macOS / Linux
.agents/skills/desktop-check-development-environment/scripts/development-environment-gates.sh --install-missing --interfaces <selection>

# Windows PowerShell 5.1+
.agents/skills/desktop-check-development-environment/scripts/development-environment-gates.ps1 -Interfaces <selection>
```

成功输出必须包含 `gate.rust.status=passed`；Rust 门禁按版本顺序接受 1.90.0 及以上稳定版，而不是只接受精确 1.90.0。Windows 还必须包含 `gate.msvc.status=passed`。GUI 额外要求 `gate.node.status=passed` 与 `gate.pnpm.status=passed`；其他接口组合必须把二者报告为 `not-required`。

## 默认依赖

根工作区统一所有成员使用的第三方依赖和工作区内 crate 路径：

```toml
[workspace]
members = ["example_tool_core", "example_tool_cli"]
resolver = "3"

[workspace.package]
version = "0.1.0"
edition = "2024"
rust-version = "1.90"

[workspace.dependencies]
assert_cmd = "2"
clap = { version = "4.6", features = ["derive"] }
example_tool_core = { path = "example_tool_core" }
jiff = "0.2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", default-features = false, features = ["macros", "rt"] }
```

- 根清单同时声明第三方依赖与工作区内 crate 的路径来源；例如 CLI 对核心的引用只在根清单写入一次。
- 核心默认不需要第三方依赖。只有核心闭环需要时才加入。
- CLI 使用 `clap` 解析参数，`serde`/`serde_json` 输出统一信封，`jiff` 生成带时区时间戳，Tokio 驱动异步入口。
- Tokio 显式关闭默认特性，中性 CLI 只启用 `macros` 和 `rt` 并使用 current-thread 运行时；不得为了方便启用 `rt-multi-thread`、`full` 或线程池。文件、网络、进程、时间、同步或信号特性只有对应能力通过范围闸门后才加入。
- 核心的异步测试可以通过开发依赖使用工作区 Tokio，但这不构成核心的生产运行时依赖。
- CLI 黑盒测试使用 `assert_cmd`；需要额外断言库时再加入。
- 不为中性脚手架默认增加 Axum/Tower、SeaORM、tracing 生态、OpenTelemetry、anyhow、thiserror、config-rs/notify、协议文档、GraphQL、MongoDB/Redis、认证、网络客户端、依赖注入或插件系统；对应能力获批并出现真实使用路径时，必须采用上述固定技术族并从根工作区按需加入。
- Ratatui、tui-realm、tui-realm-stdlib、React、TypeScript、Mantine UI、TanStack Router、TanStack Query 与 Jotai 只在对应适配器被选中时加入；根 Rust 工作区统一 Rust 依赖，前端包清单与锁文件统一 JavaScript/TypeScript 依赖。

## 依赖准入

### 版本新鲜度策略

- 在创建下游项目、准备模板发布或主动变更依赖时，查询软件包仓库的当前稳定版本，并优先采用满足 Rust 1.90 MSRV、Windows/macOS/Linux、所需最小特性集和现有验证门槛的较新版本。
- “尽量新”不表示无条件采用预发布版、提高 MSRV、扩大特性集或跳过回归验证。较新的起点可以缩短后续升级距离，但不构成未来版本兼容保证。
- `Cargo.toml` 表达经过批准的兼容版本范围，根 `Cargo.lock` 固定实际解析版本。初始化或依赖维护后必须重新生成或更新锁文件，并使用 `--locked` 完成验证。
- 若较新稳定版本因 MSRV、平台、行为回归、供应链风险或特性变化未被采用，必须记录被评估版本、阻塞原因、影响和下次复核条件；不得静默保留陈旧版本。
- 日常任务不为追逐版本号而自动改写已验证锁文件。依赖更新是显式维护 Todo，并须重跑格式、代码规范检查、非空测试和相关构建/契约检查；Todo 全部完成后进入验证里程碑时，才按持久策略、硬要求和适用性决定真实产物冒烟/E2E。

新增或替换依赖前必须记录：

1. 它替代了哪部分复杂度，以及标准库或现有依赖为什么不足。
2. 需要启用的最小特性集，不得默认采用 `full` 或等价全集。
3. 对 Rust 1.90 MSRV、Windows、macOS、Linux 和最终产物体积的影响。
4. 缺失、初始化失败或运行失败时如何映射到稳定错误与退出码。
5. 对应的成功路径、最高风险失败路径和外部依赖失败测试。

固定 Rust、TUI 与 React 技术族不参与“是否采用其他框架”的推荐，只核验能力是否真实需要、采用哪个最新兼容稳定版本和最小特性/包集合。若当前稳定组合无法满足 Rust 1.90、Node 策略、目标 WebView、Windows/macOS/Linux、安全或验证门槛，必须报告阻塞并记录硬规则例外，不得静默换成其他框架。固定技术族之外的依赖才在真实开发时根据产品需求推荐。

所有第三方依赖和工作区内 crate 路径都集中在根 `[workspace.dependencies]`，成员的生产、开发和构建依赖只使用 `workspace = true`，不得重复版本、软件包仓库/Git 来源、路径或基线特性。提交根 `Cargo.lock`，验证使用 `--locked`；不得仅凭较新 Rust 编译成功推断 MSRV 仍然成立。

## 推荐目录

```text
Cargo.toml                 初始化时创建的 workspace 根、版本、全部 members 和共享依赖
Cargo.lock
<项目标识>_core/
  Cargo.toml
  src/lib.rs               Draft 时为中性状态；获批实现后为业务规则、领域类型和领域错误
<项目标识>_cli/
  Cargo.toml
  src/main.rs              只委托给 adapter 并返回 ExitCode
  src/adapter.rs           参数、输出信封和退出码映射
  tests/cli.rs             真实二进制黑盒测试
```

只在真实复杂度出现时拆分核心模块或增加 crate。不得为了假想 MCP/GUI 建立接口注册器、服务容器或多层抽象；新适配器将来直接依赖核心即可。

Core-first 要求按职责放置已经存在的业务行为，不要求为未来接口预建 trait、目录层级或额外 crate；“避免过度抽象”也不能作为把接口无关业务留在适配器的理由。

`<项目标识>_cli/Cargo.toml` 示例（核心禁止引入 clap，此片段只属于 CLI 适配器）：

```toml
[dependencies]
clap.workspace = true
example_tool_core.workspace = true
```

目录和 crate 的演进规则：

- `<项目标识>_core/src/lib.rs` 初始化时保持中性单文件；产品定义获批并出现独立领域概念或文件已经难以独立审阅时再拆模块。
- Rust 人工维护的数据结构、trait、函数、方法和测试必须按工程规则提供符合业务逻辑的中文注释；公共 API 文档缺失可以由代码规范检查作为硬失败。
- 不默认创建 `domain`、`application`、`infrastructure` 等层级；边界必须来自已经存在的职责，而不是预期中的复杂度。
- `<项目标识>_cli/src/main.rs` 只建立 Tokio 运行时、委托适配器并返回 `ExitCode`。
- 只有出现独立发布、独立生命周期或 Cargo 强制要求的新依赖边界时才增加 crate。
- 新增每个 crate 时记录它为什么不能只是现有 crate 中的模块。

## 异步与运行时边界

- 核心操作只要涉及真实 I/O、等待、计时、进程、协议或跨边界调用，默认必须定义为运行时中立的 `async fn`，其中不出现 `tokio::runtime::Handle`、`JoinHandle`、Tokio 套接字、进程状态或适配器类型；只有确认调用链纯 CPU 密集、无等待点时才保留同步签名（见 ADR-20260806-002）。
- 适配器负责建立和关闭运行时；核心不创建嵌套运行时。
- 默认异步调用链保持顺序执行；I/O、等待、计时、进程和协议工作优先使用异步 API。只有真实并发需求才使用 `tokio::spawn`；每个任务必须有 owner、取消路径、异常传播、并发上限和关闭回收，禁止无人回收的 detached task。
- timeout 只表示等待边界到期，不能被映射为业务成功；锁不得跨越网络、进程、用户交互或其他不受控 `.await`。HTTP 服务必须在监听前完成必需配置/依赖检查，并在收到关闭信号时停止接收、取消/等待受管任务和有界释放资源。
- CPU 密集操作不得直接占用异步运行时。只有测量证明它属于 CPU 密集工作时，才考虑受控 `spawn_blocking`、专用线程或多线程运行时，并记录选择依据、任务所有权、取消语义、并发上限、资源预算和验证；普通 I/O 并发或只有同步 API 的依赖不构成启用线程的理由。对于后者，应换用具备异步 API 的依赖，或进入范围/硬规则例外确认。
- 核心确需 Tokio 原语时，只启用所需特性，并在当日 ADR 记录理由、适用范围和恢复标准。

## 进程与输出规则

- CLI/TUI/MCP `main` 使用 `#[tokio::main(flavor = "current_thread")]` 建立最小运行时，异步主入口返回适合该适配器的终止结果，不把 `std::process::exit` 用作常规控制流。GUI 使用 Tauri 已有 Tokio 异步运行时和普通异步命令，不另建运行时。
- clap 使用 `#[derive(Parser)]` 和 `#[command(version, about, long_about = None)]`，让 `--version` 来自 Cargo 版本。
- 路径参数使用 `PathBuf` 或 `OsString`，不假定 UTF-8 或手工拼接分隔符。
- 标准输出专用于 JSON；每次调用只序列化一个完整文档，以一个换行结束且无 BOM。
- 日志、警告和诊断只写标准错误；领域错误稳定映射到 `docs/CLI_CONTRACT.md` 的错误码和退出码。
- 已启用 tracing 时，结构化 event/span 必须通过 `tracing-subscriber` 的可读 `fmt` layer 与 `tracing-appender` 的有界滚动 writer 同时写入本地日志文件，不得只写标准错误或直接丢弃；日志格式至少包含时间戳、级别、target 和事件消息；标准输出仍只用于单一 JSON 文档，日志文件不得污染标准输出，也不得记录密钥、令牌、个人数据或未脱敏业务载荷。OpenTelemetry 仅在批准后追加独立 layer，默认关闭且不替代本地日志（见 ADR-20260806-002）。
- 破坏性操作要求显式确认参数；非交互模式不得自行确认。

## 初始化与当前平台验证

`assets/rust-lib-cli/` 是共享核心 + 默认 CLI 的中性验证资产。CLI 被选中或使用空选择默认值时可整体采用；显式未选 CLI 时只采用核心结构，并由各接口 Skill 创建所选成员。由 Cargo 生成锁文件。真实项目存在后运行：

```text
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-targets --all-features --locked
cargo build --workspace --release --locked
```

此外，发布候选必须用 `cargo test ... -- --list` 或等价的机器检查确认实际发现至少一个测试；仅执行返回零状态的 `cargo test` 不能证明非空测试门禁。声明 MSRV 兼容时，必须使用精确 Rust 1.90.0 工具链实际执行至少锁定依赖检查、测试和发布构建；这是对最低版本的兼容证明，不表示运行或开发工具链必须精确等于 1.90.0。较新编译器成功不能替代最低版本证据。

此外必须：

- 中性阶段确认测试数量非零，覆盖核心状态与每个所选适配器；选择 CLI 时覆盖 `productDefinitionRequired=true` 与拒绝未批准业务命令。
- 通过当前平台可用的 Python 3 解释器从 Cargo workspace 根运行 `.agents/skills/desktop-implement-change/scripts/check_rust_chinese_comments.py --root . --json`；它必须扫描所有 member 的 `build.rs`、`src/` 与 `tests/`，并以退出码 0/1/2 区分通过、声明违规和运行错误。非 GUI 项目不适用 TypeScript 注释门禁；GUI 项目还按 React 前端基线从 GUI 前端根运行 AST 门禁。
- 使用 `cargo metadata --no-deps --locked --format-version 1` 或项目保留的等价检查确认每个适配器直接依赖核心、核心不通过 workspace 依赖路径到达适配器或接口框架、适配器彼此不直接或间接依赖；Python 可用时通过当前平台可用的 Python 3 解释器运行 `.agents/skills/desktop-implement-change/scripts/check_core_first.py`，不得依赖 POSIX 可执行位；不可用时必须执行并记录等价的依赖图审查。
- 确认核心异步路径和 CLI Tokio 入口均被实际执行；不得只编译未调用的异步代码。
- 通过真实 CLI 黑盒测试验证 JSON 信封、标准输出/标准错误、退出码和非交互行为。
- 从 Cargo 元数据和配置解析二进制文件与目标目录，不根据仓库文件夹名猜测。
- Windows 二进制文件使用 `.exe`；当前平台成功不能推断其他平台已验证。

中性初始化验证完成后，首次业务实现必须通过 `$desktop-define-product` 明确产品目的、核心输入输出、成功标准和最高风险失败路径。只实现尚未暴露的内部 core 行为可采用标准路径；任何适配器首次替换 `scaffold status` 或建立公开命令、工具、页面、协议时都必须进入里程碑路径，构建并验收最终真实候选。后续局部、可逆且不改变公开契约的变更才可直接 `$desktop-implement-change`。

## 按需能力配方

初始化默认不启用下列能力。真实需求通过范围闸门后，使用 `$desktop-implement-change` 对应参考资料：

- 文件读取或写入：`desktop-implement-change/references/capability-file-operations.md`
- 启动外部程序：`desktop-implement-change/references/capability-external-command.md`

配方是选择与验证规则，不是默认业务实现。只有至少两个真实下游项目证明存在稳定重复后，才把配方提升为可组合代码资产。

## 默认值的退出条件

- 共享核心 + 所选适配器：只有真实产品证明其他架构边界更可靠时，才能按硬规则例外 ADR 调整；“当前只有一个接口”、实现方便或避免增加核心 API 都不是可接受理由。
- Tokio：目标平台不支持、嵌入宿主强制其他运行时或实测资源约束不适用时，记录替代方案和迁移验证。
- 核心零生产依赖：标准库实现会显著增加正确性或可靠性风险时，按依赖准入规则增加依赖。
- 单个 Rust 适配器默认只有一个二进制文件：出现独立发布、权限或生命周期需求时才为该适配器增加二进制文件。
- 最小目录：职责已经无法通过当前文件清楚表达时主动拆分；人工维护文本超过 500 行时必须复核高内聚、职责单一和职责相近性，不满足则拆分，超过 2000 行强制拆分。Rust 模块拆分使用 `<module>/mod.rs` 目录结构，详细规则以 `docs/ENGINEERING_RULES.md` 为准。

## MCP 适配器硬规则

`$desktop-add-mcp-adapter` 只有在下游用户明确批准后才增加对应适配器；以下是最小可执行硬规则，完整背景与设计依据见 `docs/harness_engineering/agent_first_design.md` §15.5（MCP 契约）、§15.6（单一数据事实来源）与 §15.8（安全与可审计性）。

### MCP 硬规则

- 一个工具只完成一个清晰动作，名称使用稳定的动词和名词；输入参数具有严格模式定义、必填项、枚举、长度和格式约束。
- MCP 工具模式定义不得与其他适配器使用的同一份核心类型/校验规则静默分叉；模式定义字段、约束和错误码必须可追溯到核心的单一事实来源，核心变化后 MCP 模式定义必须同步更新，不允许 MCP 单独维护一份影子定义。
- 读取、写入、执行、破坏性操作采用不同审批级别；对能执行本机程序的工具，默认只允许启动已登记资源，新增路径、删除资源和危险参数须由宿主请求用户审批。

## 构建、验证里程碑与结果文件

- 代码行为实现轮次运行相关非空单元/回归测试，并按风险选择格式、Clippy、静态和集成/契约检查；纯文档或元数据变更使用相称替代验证。快速/标准路径不运行冒烟/E2E，也不得把开发证据写成里程碑通过。
- `$desktop-build-rust-release` 负责 Rust CLI 候选编排：默认先使用 Windows、macOS、Linux 原生矩阵；只有跨平台提供方、权限、运行器或结果取回条件在派发前不可用时才回退当前平台。矩阵启动后的测试、构建、签名、打包、超时或取消失败不得被本机成功掩盖；Tauri GUI 候选转交 `$desktop-build-tauri-release`，TUI/MCP 仍使用各自适配器 Skill 的构建与产物门槛。
- `$desktop-build-tauri-release` 在 macOS 上原生构建 DMG，并可使用 `pnpm tauri build --bundles nsis --runner cargo-xwin --target x86_64-pc-windows-msvc` 交叉构建 Windows x64 NSIS。macOS DMG 必须在最终字节上只读验证 `.DS_Store`、本地背景、唯一应用包与 Applications 拖拽目标；headless CI 不得无界等待 Finder AppleScript。xwin 路径不得生成或声称生成 MSI，也不得把交叉构建成功当作 Windows 原生运行验证。
- macOS Tauri 直接分发使用全有或全无门禁：设备具有 Developer ID Application 身份、`notarytool`、`stapler` 与一组完整 Apple 公证凭据时，正常 Tauri build 必须完成签名、公证和 stapling；条件缺失且渠道允许时才可显式 `--no-sign`。不得用 `--skip-stapling` 形成候选，一旦签名或公证开始，失败不得静默降级。
- 只有里程碑/发布候选或用户明确要求完整验收时，当前批次 Todo 全部完成后才调用 `$desktop-verify-delivery`：重新执行编译、非空单元测试、相关集成/契约和产物存在性，并根据 `docs/AGENT_POLICY.md`、产品/渠道硬要求和适用性决定是否执行冒烟/E2E。
- Todo 全部完成后，构建可在项目已有批准的非交互签名钩子、工具和已授权凭据时尝试签名并验证，再把明确标记 `milestoneAcceptance: pending` 的候选写入根 `release/`；远端构建随后上传与清单精确一致的文件集以供传输。条件缺失时记录 `signingStatus: unsigned` 与原因，条件满足后的签名失败则使平台构建失败；签名之后计算最终归档 SHA-256。`milestone_smoke`/`milestone_e2e` 为 `enabled` 或硬要求为 `required` 时，必须针对这些最终字节执行，并在标记 `ready`、发布上传或正式发布前通过。
- `$desktop-prepare-cross-platform-release` 当前负责默认 Rust CLI Windows/macOS/Linux 原生候选矩阵；所有运行器使用 `fail-fast: false` 留下终态证据。其他接口的统一跨平台打包仍是已公开限制，默认不正式发布。
- `$desktop-collect-release-artifacts` 负责提取并核验平台归档、相邻 SHA-256、签名状态、清单和已有里程碑证据，不自行构建、签名或运行冒烟/E2E；为构建取回结果时可保留 `pending`，发布准备仍只接受与候选匹配的 `accepted` 证据。
- 初始化确保根 `.gitignore` 精确一次包含 `/release/`。`$desktop-build-rust-release` 与 `$desktop-build-tauri-release` 在任何格式、测试或构建命令前先验证独立 Git 根，拒绝 `release` 符号链接/重解析点和路径越界，原子隔离旧目录并创建全新空目录，不通过活动目标目录原地递归删除；完成签名、公证和 stapling 后的最终归档/安装包、哈希、清单先在同根唯一暂存区形成精确普通文件集，再通过目录级原子重命名，将完整暂存区提交为 `release/`。远端工作流必须绑定并复核显式 40 位提交，只上传声明的精确制品集合。目录存在不代表 `ready`。
- `$desktop-prepare-release` 只在里程碑通过后负责版本、变更记录和发布就绪判断，不自动运行冒烟/E2E、创建标签或上传。
- `$desktop-add-mcp-adapter` 只在下游用户明确批准后增加依赖核心的 Rust stdio MCP 适配器；Skill 不自带实现资产。
- `$desktop-add-gui-adapter` 只在下游用户明确批准后增加依赖核心的 Tauri 2 桌面适配器；Skill 不自带实现资产。
- `$desktop-prepare-gui-support-surfaces` 只在 GUI 产品明确需要支持界面时按需启用；它完整携带产品家族品牌页面/媒体依赖资产，每项出站能力仍必须有精确能力清单、秘密运行时引用、隐私边界、owner/取消/超时和禁用时零请求测试，不得扩张中性 scaffold。
- `$desktop-add-tui-adapter` 固定采用 Ratatui、tui-realm 与 tui-realm-stdlib；Tauri GUI 前端固定采用 Vite、React、TypeScript、Mantine UI、TanStack Router、TanStack Query、Jotai、ESLint/`typescript-eslint`、Prettier、Vitest 与 Testing Library。四类 adapter Skills 不自带页面/业务实现资产；可选 GUI 支持界面 Skill 的品牌依赖资产是唯一按需例外。实际版本在调用时核验并锁定；TypeScript 中文注释检查器作为治理参考随 GUI Skill 保留。
- `$desktop-add-cli-adapter`、`$desktop-add-tui-adapter`、`$desktop-add-mcp-adapter` 与 `$desktop-add-gui-adapter` 分别拥有对应接口边界。
- `$desktop-test-final-artifact-e2e` 只在验证里程碑通过 Computer Use 验收真实产物，不替代构建和单元测试，也不得脱离持久项目策略或产品/渠道硬要求自动运行。

候选归档或安装包命名为 `<product>-v<version>-<platform>-<arch>.<ext>`。每个产物必须有 `<artifact>.sha256` 和清单；`pending` 清单至少包含 `project`、`version`、批准的 40 位 `sourceCommit`、`buildRun`、`buildMode`、`platform`、`architecture`、`target`、`host`、`archive` 或 `installer`、`sha256`、`tests`、`signingStatus`、`signingReason`、结构化 `signingEvidence` 和 `milestoneAcceptance: pending`。Tauri GUI 清单还必须包含 `interface: gui`、`artifactKind: installer`、`bundleFormat: dmg | nsis`、`runtimeVerification`、`signingScope: bundle-or-installer`、`notarizationStatus`、`notarizationReason` 与结构化 `notarizationEvidence`；xwin 必须记录 `buildMode: cross-compiled-xwin` 和 `runtimeVerification: Unverified`，macOS 已签名候选只有在公证且 stapled 后才可记录 `notarizationStatus: notarized-and-stapled`。默认 CLI 原地钩子的证据记录固定钩子验证成功且 `detachedFiles` 为空；`unsigned` 记录验证不适用。只有转为 `ready`/发布归档时，清单才必须再包含最终里程碑状态以及冒烟/E2E 的策略判断及实际结果。

## 官方与主要资料

- [Rust 官方安装](https://rust-lang.org/tools/install/)
- [Cargo 工作区](https://doc.rust-lang.org/cargo/reference/workspaces.html)
- [Cargo `rust-version`](https://doc.rust-lang.org/cargo/reference/rust-version.html)
- [Cargo 构建](https://doc.rust-lang.org/stable/cargo/commands/cargo-build.html)
- [Cargo 构建缓存与产物目录](https://doc.rust-lang.org/cargo/reference/build-cache.html)
- [Rust 标准库 `ExitCode`](https://doc.rust-lang.org/stable/std/process/struct.ExitCode.html)
- [Tokio 运行时](https://docs.rs/tokio/latest/tokio/runtime/)
- [Tokio 特性标志](https://docs.rs/tokio/latest/tokio/#feature-flags)
- [Rust CLI Book：输出](https://rust-cli.github.io/book/tutorial/output.html)
- [Rust CLI Book：测试](https://rust-cli.github.io/book/tutorial/testing.html)
- [GitHub Actions 工作流制品](https://docs.github.com/actions/using-workflows/storing-workflow-data-as-artifacts)
