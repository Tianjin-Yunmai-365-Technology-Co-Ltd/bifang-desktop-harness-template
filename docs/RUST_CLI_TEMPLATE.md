# Rust Shared Core 与可选 Adapter 初始化基线

本文档定义下游项目初始化时采用的默认 Rust 技术基线。Harness 根目录不实现具体产品；中性初始化资产位于 `$initialize-rust-project` 的 assets。下游可以在产品目的与核心输入输出尚未确定、规格仍为 `Draft` 时先建立 workspace，但不得借初始化推测业务。若真实产品需要其他语言或不同架构，必须先通过范围闸门并在当日 `docs/adr/YYYYMMDD_ADR.md` 记录理由、风险、适用范围和恢复或迁移标准。

通用工程规则以 [`docs/ENGINEERING_RULES.md`](ENGINEERING_RULES.md) 为唯一详细来源。本文件补充 Rust workspace、shared core、Tokio 与可选 adapters；CLI 专属规则只在选择 CLI 时适用。

## 固定边界

- 初始化询问 CLI/TUI/MCP/GUI/WEB，允许组合；空选择默认 CLI，显式非 CLI 选择不得被附加 CLI。
- 默认使用一个 Cargo workspace，至少包含独立 core library 和实际选择的 adapter members。
- 产品规格为 `Draft` 时，core 与所选 adapters 只提供中性状态；CLI JSON 必须包含 `productDefinitionRequired=true`。
- 全部业务规则、领域类型和领域错误属于 core；CLI 只解析输入、调用 core、渲染输出并映射退出状态。
- CLI 可以依赖 core；core 不得依赖 CLI、clap、终端 I/O、进程状态或 adapter 特有序列化。
- CLI、TUI、MCP 使用 Tokio current-thread async 入口；GUI 复用 Tauri 的 Tokio-backed singleton async runtime 并使用普通 `async fn` commands，不创建嵌套 runtime。所有 Rust adapter 的 I/O、等待、计时、进程、协议与命令处理默认优先异步。
- core 可以暴露不绑定具体 runtime 的 `async fn`。只有真实业务需要 Tokio 的 I/O、时间、同步、任务或进程原语时，core 才增加 Tokio 生产依赖。
- CLI/TUI/MCP/GUI/WEB 分别由独立 Skill 创建并直接依赖 core；任何 adapter 都不依赖另一 adapter。
- TUI 固定使用 Ratatui + tui-realm + tui-realm-stdlib。WEB 与 Tauri GUI 前端固定使用 React + TypeScript + Mantine UI + TanStack Router + TanStack Query + Jotai；这些技术族适用于 Draft 与 Approved 项目，偏离必须记录硬规则例外。
- 初始版本为 `0.1.0`；根 `Cargo.toml` 的 `[workspace.package].version` 是唯一版本事实来源，各 member 使用 `version.workspace = true`。
- scaffold 直接写入当前项目根。core 与接口目录为 `<项目标识>_core`、`_cli`、`_tui`、`_mcp`、`_gui`、`_web`。
- 首次 scaffold 在当前项目根创建 `Cargo.toml`，登记 core 与实际选择的 adapters；未来只扩展该根 manifest。
- 当前项目根必须同时是独立 Git top-level；若 `$initialize-rust-project` 被直接调用且边界缺失，必须在写入 scaffold 前初始化 `main` 分支仓库并验证，不能继承父仓库边界。
- 中性 scaffold 的格式、测试、构建和冒烟证据只证明工程骨架可用，不构成产品目的获批、业务实现完成或产品可发布的证据。

## 初始化环境门禁

| 项目 | 默认值 | 约束 |
|---|---|---|
| Rust edition | `2024` | 稳定版 Rust；不使用 nightly 功能 |
| MSRV | `1.90.0` | 根 workspace 写入 `rust-version = "1.90"`，表示最低兼容版本；接受 1.90.0 及以上 stable，不要求精确等于 1.90.0 |
| 包结构 | workspace | 当前根目录下的 `<项目标识>_core` + 所选 adapters；当前根同时是独立 Git top-level |
| 初始版本 | `0.1.0` | 后续提升由用户明确决定 |
| 锁文件 | 提交根 `Cargo.lock` | 使用 Cargo 生成；不得手工编辑 |
| Node.js | 仅 GUI/WEB：已安装环境；缺失时安装当前受支持 LTS | 非 GUI/WEB 为 `not-required` |
| pnpm | 仅 GUI/WEB：稳定版且可调用 | 前端固定包管理器；非 GUI/WEB 为 `not-required` |
| MSVC Build Tools | Windows 缺失时自动安装 | 验证 Microsoft 签名，安装 C++ workload 并复探 |
| Linux 系统开发库（仅 GUI） | Tauri 2 依赖的 webkit2gtk（`webkit2gtk-4.1-dev` 或 `webkit2gtk-4.0-dev`，视发行版而定）、`libgtk-3-dev`、`librsvg2-dev`、`libayatana-appindicator3-dev` 等发行版对应的开发包 | 非 GUI 为 `not-required`；具体包名随发行版包管理器变化，需按目标发行版核对 |
| macOS Xcode Command Line Tools（仅 GUI） | 缺失时执行 `xcode-select --install` | 非 GUI 为 `not-required` |
| Python 3 | 可选 | 缺失时询问是否安装；跳过不阻断初始化，但 Python 检查记为未执行 |

初始化前运行只读探测：

```text
rustup --version
rustc --version
cargo --version
rustc -vV
# 仅 GUI/WEB
node --version
pnpm --version
```

首次开发或工具链要求变化时使用 `$check-development-environment`。Rust 是始终阻断的门禁；Windows MSVC Build Tools 同样阻断。只有 GUI/WEB 选择才增加 Node.js 与 pnpm 阻断门禁；其他接口组合不得为该门禁安装或升级二者。

首次开发必须调用 Skill 自带入口，不得临时重写安装命令：

```text
# macOS / Linux
.agents/skills/check-development-environment/scripts/development-environment-gates.sh --install-missing --interfaces <selection>

# Windows PowerShell 5.1+
.agents/skills/check-development-environment/scripts/development-environment-gates.ps1 -Interfaces <selection>
```

成功输出必须包含 `gate.rust.status=passed`；Rust 门禁按版本顺序接受 1.90.0 及以上 stable，而不是只接受精确 1.90.0。Windows 还必须包含 `gate.msvc.status=passed`。GUI/WEB 额外要求 `gate.node.status=passed` 与 `gate.pnpm.status=passed`；其他接口组合必须把二者报告为 `not-required`。

## 默认依赖

根 workspace 统一所有 member 使用的第三方依赖和 workspace 内 crate 路径：

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

- root 同时声明第三方依赖与 workspace 内 crate 的路径来源；例如 CLI 对 core 的引用只在根 manifest 写入一次。
- core 默认不需要第三方依赖。只有核心闭环需要时才加入。
- CLI 使用 `clap` 解析参数，`serde`/`serde_json` 输出统一信封，`jiff` 生成带时区时间戳，Tokio 驱动 async 入口。
- Tokio 显式关闭 default features，中性 CLI 只启用 `macros` 和 `rt` 并使用 current-thread runtime；不得为了方便启用 `rt-multi-thread`、`full` 或线程池。文件、网络、进程、时间、同步或 signal feature 只有对应能力通过范围闸门后才加入。
- core 的 async 测试可以通过 dev dependency 使用 workspace Tokio，但这不构成 core 的生产 runtime 依赖。
- CLI 黑盒测试使用 `assert_cmd`；需要额外断言库时再加入。
- 不默认增加日志/配置框架、数据库、网络客户端、依赖注入或插件系统。
- Ratatui、tui-realm、tui-realm-stdlib、React、TypeScript、Mantine UI、TanStack Router、TanStack Query 与 Jotai 只在对应 adapter 被选中时加入；根 Rust workspace 统一 Rust 依赖，前端 package manifest 与锁文件统一 JavaScript/TypeScript 依赖。

## 依赖准入

### 版本新鲜度策略

- 在创建下游项目、准备模板发布或主动变更依赖时，查询 registry 的当前稳定版本，并优先采用满足 Rust 1.90 MSRV、Windows/macOS/Linux、所需最小 feature 集和现有验证门槛的较新版本。
- “尽量新”不表示无条件采用预发布版、提高 MSRV、扩大 feature 集或跳过回归验证。较新的起点可以缩短后续升级距离，但不构成未来版本兼容保证。
- `Cargo.toml` 表达经过批准的兼容版本范围，根 `Cargo.lock` 固定实际解析版本。初始化或依赖维护后必须重新生成或更新锁文件，并使用 `--locked` 完成验证。
- 若较新稳定版本因 MSRV、平台、行为回归、供应链风险或 feature 变化未被采用，必须记录被评估版本、阻塞原因、影响和下次复核条件；不得静默保留陈旧版本。
- 日常任务不为追逐版本号而自动改写已验证锁文件。依赖更新是显式维护动作，并须重跑格式、lint、非空测试、release 构建和真实产物冒烟。

新增或替换依赖前必须记录：

1. 它替代了哪部分复杂度，以及标准库或现有依赖为什么不足。
2. 需要启用的最小 feature 集，不得默认采用 `full` 或等价全集。
3. 对 Rust 1.90 MSRV、Windows、macOS、Linux 和最终产物体积的影响。
4. 缺失、初始化失败或运行失败时如何映射到稳定错误与退出码。
5. 对应的成功路径、最高风险失败路径和外部依赖失败测试。

固定 TUI/React 技术族不参与“是否采用”的推荐，只核验采用哪个最新兼容稳定版本和最小 feature/package 集。若当前稳定组合无法满足 Rust 1.90、Node policy、目标浏览器/WebView、Windows/macOS/Linux、安全或验证门槛，必须报告阻塞并记录硬规则例外，不得静默换成其他框架。固定技术族之外的依赖才在真实开发时根据产品需求推荐。

所有第三方依赖和 workspace 内 crate 路径都集中在根 `[workspace.dependencies]`，member 的生产、开发和构建依赖只使用 `workspace = true`，不得重复版本、registry/Git 来源、路径或基线 feature。提交根 `Cargo.lock`，验证使用 `--locked`；不得仅凭较新 Rust 编译成功推断 MSRV 仍然成立。

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

只在真实复杂度出现时拆分 core 模块或增加 crate。不得为了假想 MCP/GUI 建立接口注册器、服务容器或多层抽象；新 adapter 将来直接依赖 core 即可。

`<项目标识>_cli/Cargo.toml` 示例（core 禁止引入 clap，此片段只属于 CLI adapter）：

```toml
[dependencies]
clap.workspace = true
example_tool_core.workspace = true
```

目录和 crate 的演进规则：

- `<项目标识>_core/src/lib.rs` 初始化时保持中性单文件；产品定义获批并出现独立领域概念或文件已经难以独立审阅时再拆模块。
- Rust 人工维护的数据结构、trait、函数、方法和测试必须按工程规则提供符合业务逻辑的中文注释；公共 API 文档缺失可以由 lint 作为硬失败。
- 不默认创建 `domain`、`application`、`infrastructure` 等层级；边界必须来自已经存在的职责，而不是预期中的复杂度。
- `<项目标识>_cli/src/main.rs` 只建立 Tokio runtime、委托 adapter 并返回 `ExitCode`。
- 只有出现独立发布、独立生命周期或 Cargo 需要强制的新依赖边界时才增加 crate。
- 新增每个 crate 时记录它为什么不能只是现有 crate 中的模块。

## Async 与 runtime 边界

- 默认 core 操作可以定义为 runtime-neutral 的 `async fn`，其中不出现 `tokio::runtime::Handle`、`JoinHandle`、Tokio socket、进程状态或 adapter 类型。
- adapter 负责建立和关闭 runtime；core 不创建嵌套 runtime。
- 默认 async 调用链保持顺序执行；I/O、等待、计时、进程和协议工作优先使用异步 API。只有真实并发需求才使用 `tokio::spawn`；调用方必须定义任务所有权、取消、panic 和关闭行为。
- CPU 密集操作不得直接占用 async runtime。只有测量证明它属于 CPU 密集工作时，才考虑受控 `spawn_blocking`、专用线程或多线程 runtime，并记录选择依据、任务所有权、取消语义、并发上限、资源预算和验证；普通 I/O 并发或只有同步 API 的依赖不构成启用线程的理由，后者必须替换为异步能力或进入范围/硬规则例外确认。
- core 确需 Tokio 原语时，只启用所需 feature，并在当日 ADR 记录理由、适用范围和恢复标准。

## 进程与输出规则

- CLI/TUI/MCP `main` 使用 `#[tokio::main(flavor = "current_thread")]` 建立最小 runtime，async main 返回适合该 adapter 的终止结果，不把 `std::process::exit` 用作常规控制流。GUI 使用 Tauri 已有 Tokio async runtime 和 plain async commands，不另建 runtime。
- clap 使用 `#[derive(Parser)]` 和 `#[command(version, about, long_about = None)]`，让 `--version` 来自 Cargo 版本。
- 路径参数使用 `PathBuf` 或 `OsString`，不假定 UTF-8 或手工拼接分隔符。
- JSON 写入锁定 stdout；每次调用只序列化一个完整文档，以一个换行结束且无 BOM。
- 日志、警告和诊断只写 stderr；领域错误稳定映射到 `docs/CLI_CONTRACT.md` 的错误码和退出码。
- 破坏性操作要求显式确认参数；非交互模式不得自行确认。

## 初始化与当前平台验证

`assets/rust-lib-cli/` 是 shared core + 默认 CLI 的中性验证 asset。CLI 被选中或使用空选择默认值时可整体采用；显式未选 CLI 时只采用 core 结构，并由各接口 Skill 创建所选 members。由 Cargo 生成锁文件。真实项目存在后运行：

```text
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-targets --all-features --locked
cargo build --workspace --release --locked
```

此外，发布候选必须用 `cargo test ... -- --list` 或等价的机器检查确认实际发现至少一个测试；仅执行返回零状态的 `cargo test` 不能证明非空测试门禁。声明 MSRV 兼容时，必须使用精确 Rust 1.90.0 工具链实际执行至少 locked check、测试和 release build；这是对最低版本的兼容证明，不表示运行或开发工具链必须精确等于 1.90.0。较新编译器成功不能替代最低版本证据。

此外必须：

- 中性阶段确认测试数量非零，覆盖 core 状态与每个所选 adapter；选择 CLI 时覆盖 `productDefinitionRequired=true` 与拒绝未批准业务命令。
- 确认 core async 路径和 CLI Tokio 入口均被实际执行；不得只编译未调用的 async 代码。
- 通过真实 CLI 黑盒测试验证 JSON 信封、stdout/stderr、退出码和非交互行为。
- 调用真实 release binary 的 `--version` 或 `--help` 做有限时只读冒烟。
- 从 Cargo metadata 和配置解析 binary 与 target 目录，不根据仓库文件夹名猜测。
- Windows binary 使用 `.exe`；当前平台成功不能推断其他平台已验证。

中性初始化验证完成后，下一步必须是 `$define-product`。产品目的、核心输入输出、成功标准和最高风险失败路径获批后，使用 `$plan-change` 与 `$implement-change` 删除或替换 `scaffold status`，并重新执行真实产品的完整交付验证。

## 按需能力配方

初始化默认不启用下列能力。真实需求通过范围闸门后，使用 `$initialize-rust-project` 对应 reference：

- 文件读取或写入：`implement-change/references/capability-file-operations.md`
- 启动外部程序：`implement-change/references/capability-external-command.md`

配方是选择与验证规则，不是默认业务实现。只有至少两个真实下游项目证明存在稳定重复后，才把配方提升为可组合代码资产。

## 默认值的退出条件

- shared core + 所选 adapters：真实产品证明不同边界更可靠时，经范围闸门调整。
- Tokio：目标平台不支持、嵌入宿主强制其他 runtime 或实测资源约束不适用时，记录替代方案和迁移验证。
- core 零生产依赖：标准库实现会显著增加正确性或可靠性风险时，按依赖准入规则增加依赖。
- 单个 Rust adapter 默认只有一个 binary：出现独立发布、权限或生命周期需求时才为该 adapter 增加 binary。
- 最小目录：职责已经无法通过当前文件清楚表达时才拆分，不以行数作为唯一依据。

## MCP 与 WEB adapter 硬规则

`$add-mcp-adapter` 与 `$add-web-adapter` 只有在下游用户明确批准后才增加对应 adapter；以下是这两类 adapter 的最小可执行硬规则，完整背景与设计依据见 `docs/HARNESS_ENGINEERING.md` §15.5（MCP 契约）、§15.6（单一数据事实来源）与 §15.8（安全与可审计性）。

### MCP 硬规则

- 一个工具只完成一个清晰动作，名称使用稳定的动词和名词；输入参数具有严格 Schema、必填项、枚举、长度和格式约束。
- MCP 工具 Schema 不得与其他 adapter 使用的同一份 core 类型/校验规则静默分叉；Schema 字段、约束和错误码必须可追溯到 core 的单一事实来源，core 变化后 MCP Schema 必须同步更新，不允许 MCP 单独维护一份影子定义。
- 读取、写入、执行、破坏性操作采用不同审批级别；对能执行本机程序的工具，默认只允许启动已登记资源，新增路径、删除资源和危险参数须由宿主请求用户审批。

### WEB 硬规则

- WEB adapter 默认绑定 loopback（`127.0.0.1`），不得默认监听所有网卡或 `0.0.0.0`。
- 选择 WEB 作为接口本身不构成公网部署的授权；任何面向公网暴露的决定，都必须像其他硬规则例外一样，先通过范围闸门并在当日 `docs/adr/YYYYMMDD_ADR.md` 记录理由、风险、适用范围和恢复标准。
- 统一数据事实来源规则同样适用于 WEB：WEB 与其他已选 adapter 必须通过同一 Store/Repository 读取同一份数据，不维护独立配置副本。

## 构建、候选发布与结果文件

- 普通实现轮次运行非空单元测试与变更相关的格式、Clippy、check、集成/契约或最小只读冒烟；不得把该证据写成发布就绪。
- `$build-rust-release` 当前负责 Rust CLI 在当前平台的 locked release 构建、产物定位和冒烟证据；TUI/MCP/GUI/WEB 使用各自 adapter Skill 的构建与产物门槛。
- 用户发起最终产物构建或发布准备时，`$verify-delivery` 在首次 release build 前逐项询问本次手动验收选择，再重新执行不可跳过的编译、非空单元测试、相关集成/契约、最终产物存在性和真实产物只读启动冒烟门禁；普通交付状态复核不自动触发构建或 E2E。
- 用户当次启用或产品/渠道要求的 `$test-final-artifact-e2e` 在 release 产物构建后、任何打包/收集/签名/上传/发布前执行；失败、超时、取消或选择后未执行均阻断后续动作。未启用且非硬要求时记录 `Not run` 与风险。
- `$prepare-cross-platform-release` 当前负责 Rust CLI 的 Windows/macOS/Linux 原生候选矩阵；其他接口的统一跨平台打包仍是已公开限制，默认不正式发布。
- `$collect-release-artifacts` 负责提取并核验平台归档、相邻 SHA-256、manifest 和验证证据。
- `$collect-release-artifacts` 每次先安全清理精确的项目根 `release/` 历史内容，再只复制当前项目、版本、源码 commit 与明确 build run 对应的最新已完成结果；初始化确保 `/release/` 已写入根 `.gitignore`。
- `$prepare-release` 负责版本、CHANGELOG 和发布就绪判断，不自动 tag 或上传。
- `$add-mcp-adapter` 只在下游用户明确批准后增加依赖 core 的 Rust stdio MCP adapter；Skill 不自带实现 asset。
- `$add-gui-adapter` 只在下游用户明确批准后增加依赖 core 的 Tauri 2 桌面 adapter；Skill 不自带实现 asset。
- `$add-tui-adapter` 固定采用 Ratatui、tui-realm 与 tui-realm-stdlib；`$add-web-adapter` 和 Tauri GUI 前端固定采用 React、TypeScript、Mantine UI、TanStack Router、TanStack Query 与 Jotai。Skills 不自带实现 asset，实际版本在调用时核验并锁定。
- `$add-cli-adapter`、`$add-tui-adapter` 与 `$add-web-adapter` 分别拥有对应接口边界。
- `$test-final-artifact-e2e` 通过 Computer Use 验收真实最终产物，不替代构建和单元测试，也不得脱离本次构建/发布任务的用户选择或产品/渠道硬要求自动运行。

候选归档命名为 `<product>-v<version>-<platform>-<arch>.<ext>`。每个归档必须有 `<archive>.sha256` 和 manifest；manifest 至少包含 version、source commit、平台、架构/target、归档名、SHA-256、测试和冒烟结果。

## 官方与主要资料

- [Rust 官方安装](https://rust-lang.org/tools/install/)
- [Cargo workspace](https://doc.rust-lang.org/cargo/reference/workspaces.html)
- [Cargo `rust-version`](https://doc.rust-lang.org/cargo/reference/rust-version.html)
- [Cargo build](https://doc.rust-lang.org/stable/cargo/commands/cargo-build.html)
- [Cargo build cache 与产物目录](https://doc.rust-lang.org/cargo/reference/build-cache.html)
- [Rust 标准库 `ExitCode`](https://doc.rust-lang.org/stable/std/process/struct.ExitCode.html)
- [Tokio runtime](https://docs.rs/tokio/latest/tokio/runtime/)
- [Tokio feature flags](https://docs.rs/tokio/latest/tokio/#feature-flags)
- [Rust CLI Book：输出](https://rust-cli.github.io/book/tutorial/output.html)
- [Rust CLI Book：测试](https://rust-cli.github.io/book/tutorial/testing.html)
- [GitHub Actions workflow artifacts](https://docs.github.com/actions/using-workflows/storing-workflow-data-as-artifacts)
