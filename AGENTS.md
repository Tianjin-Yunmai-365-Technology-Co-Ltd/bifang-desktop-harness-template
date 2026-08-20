# AGENTS.md

## 项目使命

本仓库是 Agent-first 小工具的无代码 Harness 模板。AI Agent 是第一消费者，人类负责方向、审批和最终复核。下游可独立选择 CLI、TUI、MCP、GUI 接口并面向 Windows、macOS 和 Linux；未选择接口时默认 CLI。下游初始化默认采用 Rust，但模板自身不实现具体产品。

## 按任务读取

1. 始终先读 `README.md` 和 `docs/AGENT_POLICY.md`；若 `superpowers: disabled`，本次及后续工作不得调用任何 `superpowers:*` Skill。
2. 判断本次采用快速、标准还是里程碑路径，并用一句话说明。范围清楚、局部、可逆且无高风险触发器时默认快速；用户可以直接选择更严格路径。
3. 只读与任务相关的事实来源和 Skill：产品目标/边界变化才读最新 Product Spec；恢复进度、阻断或交接时读最新 Product Status；标准/里程碑且存在活动计划时读最新 Work Plan；涉及长期决定或硬规则例外时读最新 ADR。代码、测试或文档变更读 [`docs/ENGINEERING_RULES.md`](docs/ENGINEERING_RULES.md)。
4. CLI 任务读 `docs/CLI_CONTRACT.md`；Rust core/adapter 任务读 `docs/RUST_CLI_TEMPLATE.md`；里程碑、发布或历史证据相关任务先读 `docs/VERIFICATION.md`/`docs/RELEASE.md`，再按索引读取 `docs/verification/` 的相关证据卷。
5. 只有需要理解方法论时才读 `docs/HARNESS_ENGINEERING.md`，再按索引选择 `docs/harness_engineering/` 的相关主题卷。

不要为了“完整”一次性加载所有项目记忆。先按任务定位，再在发现冲突或缺失时扩展读取。

## 事实来源

| 事实 | 唯一来源 |
|---|---|
| 产品目标与范围 | `docs/product_spec/README.md` 与日期最新的 `YYYYMMDD_product_spec.md` |
| CLI 机器接口（仅选择 CLI 时） | `docs/CLI_CONTRACT.md` |
| Rust shared core、adapter、MSRV 与依赖 | `docs/RUST_CLI_TEMPLATE.md` |
| 当前进度与下一步 | `docs/project_status/README.md` 与日期最新的 `YYYYMMDD_product_status.md` |
| Harness 当前版本与发布状态 | `Version.md` |
| Agent 能力与里程碑验收偏好 | `docs/AGENT_POLICY.md` |
| 当前实施步骤 | `docs/work_plan/README.md` 与日期最新的 `YYYYMMDD_work_plan.md` |
| 文件、注释、文档、测试与例外规则 | [`docs/ENGINEERING_RULES.md`](docs/ENGINEERING_RULES.md) |
| 产品边界变化、长期决定与硬规则例外 | `docs/adr/README.md` 与当日 `docs/adr/YYYYMMDD_ADR.md` |
| 验证方式与结果 | `docs/VERIFICATION.md` 与其索引的 `docs/verification/*.md` |
| 已知限制与技术债 | `docs/TECH_DEBT.md` |
| 版本与发布要求 | `docs/RELEASE.md` |
| 用户和维护者可见变更 | `docs/changelog/README.md` 与当日 `docs/changelog/YYYYMMDD_CHANGELOG.md` |

如果事实来源之间冲突，先调查并修正文档；不要自行选择更方便的说法。

## 工作规则

- 下游初始化先让用户在“推荐敏捷预设”和“自定义”之间选择一次。推荐预设把 Superpowers、Worktree/Subagent 和适用冒烟设为 `enabled`，E2E 设为 `disabled`；只有选择自定义时才逐项询问。最终值写入 `docs/AGENT_POLICY.md`，不得在基线残留 `pending`。后续先复用策略，再判断适用性。
- `parallel_worktree_subagents: enabled` 时，编码任务可安全拆成至少两个独立写入范围才使用 `$desktop-run-parallel-worktrees`；否则 Agent 自行使用单 Agent，不重复询问。写入型 Subagent 各自使用独立 Git Worktree 和 `codex/` 分支，主 Agent 公开子任务、所有权、依赖与验证边界，并在启动、阻塞、阶段完成、整合和验证节点更新。写入前必须从精确单元 Worktree 调用 helper `guard` 并声明写入目标；主 Agent 同步等待全部必需结果，重叠写入转为串行。该门禁不替代宿主 sandbox。
- 每项任务使用一种路径：`快速`、`标准` 或 `里程碑`。用户可显式选择；未选择时 Agent 自适应并说明判断。发现更高风险时立即升档，安全/隐私、数据迁移、破坏性操作、生产/付费/凭据副作用、建立或改变对外兼容契约、渠道硬要求、签名/发布和跨平台最终候选不得降级。
- `快速`：范围清楚、局部、可逆且无上述触发器时直接从用户请求或简短内联清单进入 `$desktop-implement-change`；不强制 `$desktop-define-product`、`$desktop-plan-change`、持久 Work Plan、ADR、Product Status、Verification 或 `$desktop-verify-delivery`。
- `标准`：多步骤、多模块、需跨会话/交接、可安全并行或中等风险时使用 `$desktop-plan-change` 建立精简 Todo。只有产品目标、边界或成功标准变化时使用 `$desktop-define-product`；若真实交付需要或用户选择完整验收，先升为里程碑，再进入 `$desktop-verify-delivery`。
- `里程碑`：高风险触发器、发布级候选或用户明确要求完整验收时，必须使用持久 Todo 与真实候选；任一 Todo 非 `done` 时不得进入 `$desktop-verify-delivery`，只有该路径可产生 `Milestone accepted`、`ready` 或发布就绪结论。
- 不得把未来候选默认纳入当前版本。规格不明确且不同答案会改变产品边界时，停止实现并请求确认；普通实现细节不要求额外范围会议。
- `$desktop-implement-change` 可直接接受范围清楚的请求或活动计划。代码行为变化必须以相关非空测试覆盖核心成功路径和最高风险失败路径；纯文档、元数据、格式或不可合理单测的机械变更使用相称的链接、解析、静态、现有回归或差异检查，不为凑测试数量创建空洞测试或 ADR 例外。
- 模板约束默认是硬规则。确需例外时，在当日 `docs/adr/YYYYMMDD_ADR.md` 记录理由、风险、适用范围和恢复标准后方可继续。
- 优先最短可靠闭环，避免为假想未来增加抽象、接口或依赖。
- 文件组织、中文业务注释、文档职责、测试组织和规则例外统一遵守 `docs/ENGINEERING_RULES.md`。Rust 下游必须从 Cargo workspace 根运行 `check_rust_chinese_comments.py`；选择 GUI 时还必须在 `pnpm lint` 与项目 validator 中运行同源 TypeScript Compiler AST 注释门禁。机械检查只证明明确声明有紧邻中文注释，不替代语义复核，不得扩张到所有局部变量/匿名回调或自动生成套话；非 GUI 下游不适用 TypeScript 门禁。人工或 Agent 维护的文本文件超过 500 个物理行时必须复核业务是否高内聚、职责单一且职责相近，不满足则重构拆分；超过 2000 行必须强制拆分且门禁失败。Rust 模块拆分使用目录/`mod.rs` 结构；工具生成锁文件/生成物和原样内嵌第三方文件按封闭范围定义处理。
- 下游初始化必须询问用户选择 `CLI/TUI/MCP/GUI`，允许多选；无选择时默认 CLI。四类接口分别由 `$desktop-add-cli-adapter`、`$desktop-add-tui-adapter`、`$desktop-add-mcp-adapter`、`$desktop-add-gui-adapter` 独立实施，任何一种都不要求另一种存在。
- 下游 Product Spec 尚未创建或仍为 `Draft` 时允许先初始化中性 Rust workspace 与已选接口；此阶段只提供无业务副作用的 scaffold status，CLI JSON 明确返回 `productDefinitionRequired=true`，不得猜测业务逻辑、发布或声称产品交付完成。
- 下游项目初始化默认采用 `docs/RUST_CLI_TEMPLATE.md` 中的 Rust 2024 shared-core 与 adapter 基线。只有选中 CLI 时才应用 CLI 契约；选择其他语言或降低工具链约束必须通过范围闸门并记录决策。
- Core-first 是硬规则：接口/宿主无关的领域类型、业务规则、语义校验、默认值、用例编排、状态转换、稳定错误、平台无关权限、迁移和持久化策略必须在 core 中实现，即使当前只有一个 adapter 也同样适用。把这些业务逻辑混入 adapter 只能按硬规则例外 ADR 处理。
- CLI/TUI/MCP/GUI 必须是薄适配层，只负责运行时装配、接口语法/协议结构、展示和纯交互状态、调用 core，以及映射结果/错误。系统托盘、窗口/WebView、通知、自动启动、终端按键/恢复、MCP stdio 和 CLI 退出码等特有机制留在对应 adapter，但其触发的业务动作仍调用 core；薄层按职责而不是行数判断。
- 适配器只拒绝无法解析、缺少协议必填字段或违反宿主能力约束的输入；值域、跨字段关系、资源状态、业务权限、幂等性、可否执行以及影响业务结果的默认值由 core 判定并返回稳定领域错误。
- 下游 CLI、TUI、MCP 必须使用 Tokio current-thread async 入口；GUI 必须复用 Tauri 的 Tokio-backed async runtime 和 plain async commands，不创建嵌套 runtime。异步优先是硬规则：core 与全部 Rust adapter 只要涉及真实 I/O、等待、计时、进程、协议或跨边界调用，默认必须实现为异步，不是"可以选择异步"；只有测量确认的 CPU 密集工作才可考虑受控 `spawn_blocking`、专用线程或多线程 runtime，并记录任务所有权、取消、并发上限、资源预算和验证。每个 spawned task 必须有 owner、取消路径和关闭回收，禁止 detached task；timeout 不是业务成功，锁不得跨越不受控 `.await`。只有同步阻塞 API 的依赖不能成为启用线程的默认理由，应替换为异步能力或进入范围/例外确认。core 默认暴露 runtime-neutral 的 async API；只有真实业务需要 Tokio 原语时才增加 core 的 Tokio 生产依赖，不得默认使用 `full`（见 ADR-20260806-002）。
- 下游 TUI 固定使用 Ratatui、tui-realm 与 tui-realm-stdlib；Tauri GUI 前端固定使用执行时最新兼容稳定的 Vite + React + TypeScript、Mantine UI、TanStack Router 文件路由、TanStack Query、Jotai、ESLint/`typescript-eslint`、Prettier、Vitest 与 Testing Library。这些是硬规则；不得因 Draft、页面简单或 Agent 偏好省略，偏离必须记录硬规则例外。其他技术只在真实开发需要时结合项目推荐并通过依赖准入。
- 下游 Tauri GUI 的界面国际化（i18n）是开发期硬性必选项：前端固定使用 `i18next` + `react-i18next`，Rust 后端（GUI 适配器层）固定使用 `rust-i18n`，系统语言探测统一使用官方 `tauri-plugin-os` 的 `locale()` API；默认语言跟随系统语言，缺少对应翻译资源回退英文，界面必须提供可发现的语言切换入口并持久化用户选择。这是硬规则，core 必须保持语言无关；偏离必须记录硬规则例外，详细边界以 `docs/RUST_CLI_TEMPLATE.md` 与 `$desktop-add-gui-adapter` 基线为唯一来源（见 ADR-20260806-001）。
- 下游 Rust 技术选型固定为 Tokio 异步运行时、Axum + Tower/Tower HTTP 服务栈、Clap CLI、SeaORM 关系型数据库 ORM、config-rs 配置、tracing + tracing-subscriber + tracing-appender 本地可观测性、anyhow 应用边界错误上下文、thiserror 稳定类型化错误、serde 序列化和 jiff 日期时间。OpenTelemetry OTLP/HTTP、utoipa/Scalar、async-graphql、MongoDB/redis-rs 与 jsonwebtoken/Argon2id 只在对应能力和安全边界获批后引入。固定技术按已批准真实能力引入，不得为中性 scaffold 无条件安装全部依赖；偏离必须记录硬规则例外，详细边界以 `docs/RUST_CLI_TEMPLATE.md` 为唯一来源。
- 下游已启用 tracing 时，结构化 event/span 必须通过 tracing-subscriber + tracing-appender 同时落盘到本地滚动日志文件，不得只写标准错误或丢弃；日志格式至少包含时间戳、级别、target 和事件消息。OpenTelemetry 默认关闭且不替代本地日志。标准输出仍只用于 `docs/CLI_CONTRACT.md` 的单一 JSON 文档，不得被日志污染；日志不得记录密钥、令牌、个人数据或未脱敏业务载荷。详细边界以 `docs/RUST_CLI_TEMPLATE.md` 为唯一来源（见 ADR-20260806-002）。
- 下游依赖在已声明 MSRV、Windows/macOS/Linux、最小 feature 集和完整验证约束内优先采用 registry 中较新的稳定版本；`Cargo.toml` 保存兼容范围，根 `Cargo.lock` 固定实际解析结果。无法采用较新稳定版本时必须记录原因、影响和复核条件，不得以“最新版”为由静默提高 MSRV、采用预发布版或跳过验证。
- 下游首次实际代码开发、工具链变化或既有门禁证据失效时调用 `$desktop-check-development-environment`；纯文档/元数据任务跳过。一次成功证据在同一宿主、接口组合和工具链约束未变化时可复用，不逐任务重复探测。Rust 是代码开发阻断门禁，Windows 同时检查 MSVC Build Tools；仅 GUI 需要 Node.js 与 pnpm。只有明确选择 macOS→Windows Tauri xwin 构建目标时才执行专用门禁，安装并复探 LLVM、NSIS、`x86_64-pc-windows-msvc` target 与 `cargo-xwin`；不得自动安装 Homebrew。
- 开发环境门禁必须调用 `$desktop-check-development-environment` 自带的 POSIX shell 或 Windows PowerShell 脚本；不得以临时拼装安装命令替代制品校验、结构化输出和失败退出码。
- Cargo 根 `[workspace.dependencies]` 是 member 依赖版本、来源、内部路径和基线 feature 的唯一来源；所有子 crate 的生产、开发和构建依赖只使用 `workspace = true`。
- `$desktop-instantiate-project` 必须先要求用户提供完整目标项目目录路径；解析后的目录 basename 必须与项目标识一致，且目标必须不存在或为空。复制后该目录是初始化、代码修改、构建、验收和发布准备的唯一项目根目录。
- `$desktop-instantiate-project` 必须在目标根创建独立 Git 仓库并验证 top-level 精确等于项目根，初始分支为 `main`；目标位于父仓库内时也必须建立自己的边界。不得复制源 `.git`。Scaffold 验证和初始化能力裁剪完成后，必须使用用户现有 Git 身份创建唯一的本地初始化基线 commit，并验证无 remote 且 `git status --porcelain=v1 --untracked-files=all` 为空；不得 tag、配置 remote、push、伪造身份或修改全局 Git 配置。直接调用 `$desktop-initialize-rust-project` 时必须补建缺失边界并执行同一收尾门禁。
- 实例化不得迁移或预创建 `docs/adr/`、`docs/changelog/`、`docs/product_spec/`、`docs/work_plan/`、`docs/VERIFICATION.md` 或 `docs/verification/`。它们只在各自事件触发条件满足时按需创建；快速路径不得为了形式完整预建空记忆。
- 下游项目标识统一使用跨平台安全的 ASCII `snake_case`；core 与四类接口目录确定性派生为 `<项目标识>_core`、`_cli`、`_tui`、`_mcp`、`_gui`，不得另行配置。
- 下游 Rust 首次初始化必须在当前项目根目录创建 workspace `Cargo.toml`，登记 core 与用户实际选择的 adapter members，并持续纳管未来新增 crate；不得在其他目录创建替代 workspace。
- 选择 CLI 时必须支持完全非交互运行和 `--json`，并遵守 `docs/CLI_CONTRACT.md`；未选择 CLI 的项目不适用该契约。
- `$desktop-instantiate-project` 或直接调用的 `$desktop-initialize-rust-project` 必须通过一次推荐预设确认或自定义分支解析 Superpowers、Worktree/Subagent、里程碑冒烟和里程碑 E2E，原子写入 `docs/AGENT_POLICY.md` 并复用；下游基线 commit 前不得残留 `pending`。`superpowers: disabled` 时，后续 Agent 不得调用或遵循任何 `superpowers:*` Skill。
- 下游中性 scaffold 验证完成后必须删除 `$desktop-instantiate-project`、`$desktop-initialize-rust-project`、模板专用 validator/方法论文档及活动初始化入口；生成后的下游是终端项目根，不得继续派生项目。`$desktop-check-development-environment` 与 `$desktop-upgrade-harness` 必须保留。
- Harness 与下游采用非开源的企业专有商业许可。`$desktop-instantiate-project` 必须先逐字节复制根目录 `LICENSE.zh-CN.md` 与 `LICENSE.en.md`，再通过 `$desktop-rename-project-identity` 仅把两种语言的适用项目名改为目标项目；其余法律条款不得改变，初始化裁剪不得删除、弱化或替换。
- 派生下游时必须调用 `$desktop-rename-project-identity` 全量处理项目展示名、ASCII `snake_case` 标识、kebab-case 前缀、项目自有配置、维护路径、文档、Skills 和 Licenses；先预览、后显式应用，并对旧身份残留、路径碰撞和符号链接执行阻断检查。实例化身份重置属于中性初始化；现有产品改名必须通过产品范围闸门、里程碑计划和 `$desktop-verify-delivery`，不得以快速/标准路径完成。
- 若选择 GUI，首次真实 GUI 开发前必须调用 `$desktop-prepare-gui-app-identity`，由用户确认窗口名称等应用资料并选择自动生成图标、确定性 Plan B 或上传后标准化/高清处理。
- GUI 的关于/支持/赞助、动态标题、更新检查与遥测不是初始化默认能力。只有已批准产品真实需要其中一项时才调用 `$desktop-prepare-gui-support-surfaces`；逐项选择并按需创建下游 `docs/GUI_SUPPORT_SURFACES.md`，出站与遥测默认禁用，秘密只保存安全运行时来源引用且不得进入源码、文档、样例、日志或前端 bundle。该条件 Skill 必须完整保留产品家族共享的品牌文档/React/媒体依赖资产，包括固定赞助档位/价格、品牌联系人、支付二维码、更新 banner 与小图；只有已选界面所需文件才进入应用 bundle。不得带入来源下游产品名称/标识、产品路由、固定服务地址、秘密或遥测实例。跨接口资格、值域、默认值和状态转换仍属于 core，窗口/系统浏览器/平台元数据与纯展示属于 GUI adapter。
- 构建在项目已有批准的非交互签名 hook/命令、工具和已授权凭据时必须尝试签名并验证；尝试失败不得静默回退 unsigned。macOS Tauri 直接分发候选在设备、Developer ID、`notarytool`/`stapler` 和一组完整公证凭据齐备时必须完成签名、公证与 stapling，不得只签名或使用 `--skip-stapling`；条件缺失时只有产品/渠道允许才可显式 `--no-sign`，一旦签名或公证开始，任何失败均阻断。最终 DMG 必须在所有字节变更完成后只读验证 Finder `.DS_Store`、本地背景、唯一应用包和 `/Applications` 链接，里程碑验收再对当前候选重跑同一检查；不得自动接受软件许可或沿用旧候选证据。不得自动创建、索取、导出或输出签名/公证凭据；签名、公证、stapling 或重打包后必须针对最终字节重新计算 hash。
- macOS→Windows Tauri 构建必须使用 `pnpm tauri build --bundles nsis --runner cargo-xwin --target x86_64-pc-windows-msvc`，仅生成 Windows x64 NSIS；不得在 macOS 声称生成 MSI，不得把 xwin 成功解释为 Windows 原生运行通过，manifest 必须记录 `buildMode: cross-compiled-xwin` 与 `runtimeVerification: Unverified`。
- 初始化必须把 `/release/` 精确一次写入项目根 `.gitignore`。每次 `$desktop-build-rust-release` 或 `$desktop-build-tauri-release` 在任何构建命令前，必须先验证 canonical 独立 Git 根，拒绝 `release` 符号链接/reparse point 与路径越界，原子隔离旧目录并创建全新空目录；不得通过活动 destination 原地递归删除。签名、公证和 stapling 完成后的最终 archive/installer、hash、manifest 必须先在同根唯一 staging 形成精确文件集，再以不跟随链接的目录级原子替换提交到 `release/`。远端 workflow 必须绑定并复核 40 位 commit，只上传 manifest 声明的精确文件；`release/` 可包含 `pending` 候选，目录存在不代表 ready。
- 跨平台设计不得默认单一 Shell、路径分隔符、文件权限模型或仅在一个平台存在的系统能力。
- 仓库中没有明确命令时，不得虚构构建、测试或发布命令。
- Product Spec 只在产品目标、边界、约束或成功标准改变时更新；ADR 只记录长期重要、难以逆转的决定和硬规则例外；Product Status 只在里程碑、重要阻断、跨会话交接或用户要求时更新；Work Plan 只用于标准/里程碑路径或用户要求；`docs/VERIFICATION.md` 只保存里程碑、发布、人工复核或长期审计证据。
- 普通缺陷修复、不改变可观察行为的纯重构、格式整理、测试补强和内部清理本身不触发 Product Spec、ADR、Product Status、Changelog 或 Verification；结果只在最终回复和测试/CI 中报告。复杂度、风险、交接或用户要求仍可独立触发 Work Plan；产品边界、长期决定/硬规则例外、重要阻断/交接、发布/人工复核/长期审计、安全或渠道要求等独立事件仍按原规则记录，维护任务标签不得绕过门禁。
- Changelog 只记录已经发生、用户或维护者可感知且不属于上述普通维护排除的合格变化。未触发任何持久记忆时，最终回复概括变更、实际验证和未验证范围即可，不要求写“不适用”占位。
- 需要写日期快照时，同日更新现有文件；新自然日读取前一份并综合仍有效事实。开发或修改长期规则前读取最新 ADR，并只追溯其中明确引用的旧决定。
- 发现但不在当前范围内的问题写入 `docs/TECH_DEBT.md`，不要顺手扩张任务。
- 不覆盖或撤销用户已有修改；遇到重叠内容时基于现状继续。
- 每轮实现运行与变更相称的最小充分验证。代码行为变化运行相关非空单元/回归测试，并按风险选择格式、lint、静态和集成/契约检查；非代码变更运行相称的解析、链接、静态或差异检查。检查失败不得延迟，也不得把开发证据误报为里程碑已验收。
- 每轮实现还必须运行 `.agents/skills/desktop-implement-change/scripts/check_file_line_limits.py`；检查器列出 501 至 2000 行的语义复核候选，2000 行通过、2001 行失败。该门禁适用于全部人工维护文本，不只检查本次改动文件；候选只有在确认高内聚、职责单一且职责相近后才能保留。项目存在 Rust package/workspace 时同时运行 `check_rust_chinese_comments.py --root . --json`，选择 GUI 时同时运行前端 AST 注释门禁；任何运行错误或声明违规都阻断完成。
- 只有里程碑路径要求当前批次 Todo 全部为 `done` 后进入验收。候选必须绑定批准场景、源码 commit、运行环境和可观察结果；源码片段、Mock、stub、占位页面、中性 scaffold、开发预览或仅调用内部函数的结果不具备验收资格。
- 产出物验收以真实可用为准，非 Mock 是硬规则：无论快速、标准还是里程碑路径，对产出物给出"完成""可用""已验证"结论时都必须基于真实运行、真实调用产出物本身得到的可观察结果，不得以模拟实现、测试替身、占位页面或仅调用内部函数的结果冒充验收证据。这与测试隔离规则不冲突：单元/集成测试仍可对不可控外部依赖（网络、当前时间、随机性、用户主目录等）使用受控测试替身以保证确定性，但测试替身只证明代码单元内部正确性，不能被引用为"产出物已经真实可用"的依据。详细原则与里程碑范围以 `docs/VERIFICATION.md` 为唯一来源（见 ADR-20260806-002）。
- 冒烟与 E2E 只允许由 `$desktop-verify-delivery` 在验证里程碑读取 `milestone_smoke`、`milestone_e2e`、产品/渠道硬要求和实际适用性后决定。`disabled` 的可选项记录 `Not run` 与风险；硬要求不得跳过。需要凭据、生产数据、支付、发布或不可逆副作用时仍须独立授权。
- 验证里程碑必须重新执行基于当前候选源码的编译/构建、非空单元测试、相关集成/契约和真实产物存在性检查。Todo 全部完成后，构建可在条件具备时先签名，并把明确标记 `milestoneAcceptance: pending` 的候选放入根 `release/` 或上传用于验收传输；它不是 ready/发布物。按策略启用或硬要求的冒烟/E2E 必须针对这些最终字节执行，并在标记 ready、发布上传或正式发布前通过。
- 任一必需门禁或已启用冒烟/E2E 失败、超时、取消或未执行时，里程碑拒绝；保存证据，重开或新增具体 Todo，返回 `$desktop-implement-change` 实现缺失逻辑、修复偏差并增加回归测试。只有所有 Todo 再次 `done` 后才能重新验收完整里程碑。
- 发布、`ready` 或里程碑交付声明至少要求：全部批准 Todo 完成，完整真实候选存在，必需场景和已选门禁通过，并取得项目/渠道要求的人工复核。普通快速/标准任务只声明本次改动完成，不冒充发布就绪。
- 对代码行为变更，发现零个相关测试不得记为通过；测试至少覆盖核心成功路径和最高风险失败路径。纯文档、元数据、格式和不可合理单测的机械变更可以使用明确替代验证，无需为此建立 ADR 例外。
- 启动冒烟测试只在验证里程碑调用真实产物，使用适合已选接口的已记录只读入口，并在限定时间内以预期状态结束；不得产生业务副作用。
- Windows、macOS 和 Linux 是兼容目标；Todo 开发只验证变更相关的当前系统范围，验证里程碑重新验证当前系统完整闭环。其他平台必须明确标记为 `Unverified`，不得声称已通过。
- 必需检查失败时，Agent 可在原任务授权范围内诊断、重开 Todo、修复和重跑。破坏性操作、范围变化或新的外部副作用必须先请求人工审批。
- 最终发布、不可逆交付或项目/渠道明确要求的里程碑必须由人工复核；普通快速/标准任务不强制人工签署。需要人工复核时按 `docs/VERIFICATION.md` 路由写入 `docs/verification/human_review.md`，记录复核人、日期、范围、结论和剩余风险；Agent 不得代签。
- 人工审批只授权后续操作，不能把失败或未执行的检查改判为通过。
- 完成声明必须列出实际验证、未执行验证和剩余风险。

## Skills 地图

本节与后续“约束地图”是 `AGENTS.md` 的永久结构。模板实例化和下游裁剪只能删除不再适用的条目，不得删除整个章节，也不得保留指向已删除 Skill 的条目。

- 从本 Harness 建立新的完整下游仓库、重置模板身份与历史：使用 `$desktop-instantiate-project`。
- 派生时全量重置项目身份，或对现有项目执行已批准的产品改名：使用 `$desktop-rename-project-identity`。
- 新项目、需求模糊或产品目标/边界/成功标准变化：使用 `$desktop-define-product`；范围清楚的日常变更跳过。
- 标准/里程碑路径、跨会话交接或用户要求持久计划：使用 `$desktop-plan-change`；快速路径跳过。
- 范围清楚的直接请求或已有计划需要实施：使用 `$desktop-implement-change`。
- 行为保持的结构性清理（单文件行数、文件组织结构、命名、常量提取、潜在性能与死锁风险、core-first 归属）：使用 `$desktop-refactor-code`。
- 已选 GUI 适配器中出现硬编码用户可见文案需要迁移为 i18n 翻译键：使用 `$desktop-extract-i18n-strings`；不触碰共享 core。
- 项目策略允许且当前 Todo 可安全并行：使用 `$desktop-run-parallel-worktrees`。
- 里程碑/发布候选或用户明确要求完整验收：使用 `$desktop-verify-delivery`；普通快速/标准任务不自动调用。
- 需要定版本、更新变更记录或准备发布：使用 `$desktop-prepare-release`。
- 初始化 Rust 工具链、shared core、接口选择和四项持久 Agent 策略：使用 `$desktop-initialize-rust-project`。
- 下游首次开发或接口/宿主工具链变化时：使用 `$desktop-check-development-environment`；Rust 始终检查，GUI 额外检查 Node.js 与 pnpm，macOS xwin 发布目标再按需检查并安装 LLVM、NSIS、Windows Rust target 与 `cargo-xwin`。
- 选择 GUI 后首次真实 GUI 开发：使用 `$desktop-prepare-gui-app-identity` 补齐窗口资料并由用户选择图标路径。
- 已批准 GUI 产品需要关于/支持/赞助、动态标题、更新检查或遥测时：使用 `$desktop-prepare-gui-support-surfaces` 只实现被明确选择的界面，记录产品实例和最小出站边界；产品家族品牌依赖资产完整随 Skill 保留，中性 scaffold 不自动启用界面。
- 构建 Rust CLI 候选：使用 `$desktop-build-rust-release`；默认先走 Windows、macOS、Linux 原生矩阵，跨平台预检不可用才回退当前平台，并在构建前刷新根 `release/`、条件具备时尝试签名。其他接口当前按各自 adapter Skill 的构建与产物门槛执行。
- 构建 Tauri GUI 候选：使用 `$desktop-build-tauri-release`；macOS 原生输出 DMG，设备条件允许时完成 Developer ID 签名、公证和 stapling，macOS→Windows 只输出 x64 NSIS 并保持 Windows 运行状态 `Unverified`。
- 默认 Windows、macOS、Linux Rust CLI 候选矩阵：使用 `$desktop-prepare-cross-platform-release`；矩阵启动后的真实失败不得伪装成当前平台回退，其他接口的统一跨平台发布能力仍未完成。
- 提取和核验本次构建结果：使用 `$desktop-collect-release-artifacts`，保留 manifest 的 pending/rejected/accepted 状态，不凭目录存在判断 ready。
- 已初始化下游需要同步新版 Harness 工程规则或保留 Skills：使用 `$desktop-upgrade-harness`；默认 dry-run，保护项目事实和本地修改。
- 下游明确增加 stdio MCP 支持：使用 `$desktop-add-mcp-adapter`。
- 下游明确增加桌面 GUI 支持：使用 `$desktop-add-gui-adapter`。
- 下游明确增加 CLI 支持：使用 `$desktop-add-cli-adapter`。
- 下游明确增加 TUI 支持：使用 `$desktop-add-tui-adapter`。
- 仅在验证里程碑中，当项目策略启用或产品/渠道把它列为必需项时，对真实产物执行 Computer Use E2E：使用 `$desktop-test-final-artifact-e2e`。

项目 Skills 位于 `.agents/skills/`。只在对应任务触发时读取其完整内容。

## 约束地图

本节不得在模板实例化或下游裁剪时被完全删除。生成后的下游应保留仍适用的条目，并移除仅属于 Harness 初始化的条目。

| 约束领域 | 唯一来源或入口 |
|---|---|
| 产品目标、范围与成功标准 | `docs/product_spec/README.md` 与日期最新的 `YYYYMMDD_product_spec.md` |
| 文件、中文注释、文档、测试和例外 | [`docs/ENGINEERING_RULES.md`](docs/ENGINEERING_RULES.md) |
| Agent 能力与里程碑验收偏好 | `docs/AGENT_POLICY.md` |
| Rust shared core、adapter、MSRV 与依赖 | `docs/RUST_CLI_TEMPLATE.md` |
| CLI 机器接口（仅选择 CLI 时） | `docs/CLI_CONTRACT.md` |
| 持久实施与里程碑证据（按需） | `docs/work_plan/README.md`、日期最新的 `YYYYMMDD_work_plan.md`、`docs/VERIFICATION.md` |
| 并行协作偏好、Worktree 隔离与前台状态 | `docs/AGENT_POLICY.md`、`$desktop-run-parallel-worktrees` |
| 产品边界变化、长期决定与不可逆取舍 | `docs/adr/README.md` 与最新日期 ADR |
| 开发环境 | `$desktop-check-development-environment` |
| 下游派生边界 | Harness 可调用 `$desktop-instantiate-project` 一次；完成初始化的下游必须删除实例化/初始化能力并禁止继续派生 |
| 项目身份与前缀 | `$desktop-rename-project-identity`；覆盖项目自有配置、路径、文档、Skills 与两份许可证的项目名 |
| 可选 GUI 支持界面与出站事实 | `$desktop-prepare-gui-support-surfaces`；Skill 携带完整产品家族品牌依赖资产，终端下游按需创建的 `docs/GUI_SUPPORT_SURFACES.md` 是产品实例来源，Harness 不预创建或覆盖 |
| 下游 Harness 工程来源与升级 | `$desktop-upgrade-harness`、`.harness/upstream-lock.json` |
| 商业许可与知识产权 | 根目录 `LICENSE.zh-CN.md` 与 `LICENSE.en.md`；下游只替换适用项目名并保留其余条款 |

模板自身发生文档、Skill 或候选 workflow 变更时，通过当前平台可用的 Python 3 解释器运行 `scripts/validate_harness.py`。修改 Python 门禁行为时还必须以同一解释器运行 `-m unittest discover -s scripts`；该默认回归入口必须包含可复用检查器的专属测试，不依赖 Shell 引号或 POSIX 可执行位。上述命令成功不替代其他当前变更要求的代码测试，也不替代里程碑路径的真实下游验收或必要人工复核。

## 每次任务的最小闭环

1. 读取最少相关事实，检查工作区并保护既有修改。
2. 选择快速、标准或里程碑路径；用户未选择时说明自适应判断，高风险触发器自动升档。
3. 快速路径直接实施；标准/里程碑路径维护精简 Todo。运行与变更相称的检查并立即修复失败。
4. 只有里程碑路径构建和验收完整真实候选，并按策略/硬要求决定冒烟、E2E 与人工复核。
5. 仅更新被触发的项目记忆；最终报告变更、实际验证、未执行项和剩余风险。

## 当前限制

本模板的产品规格已于 2026-07-21 获得人工批准，2026-08-03 改为快速/标准/里程碑三档敏捷闭环。下游必须拥有独立 Git 根，可以先建立中性 Rust shared core 与所选 CLI/TUI/MCP/GUI 接口，再定义产品目的与核心输入输出，无选择时默认 CLI。模板根目录没有具体产品或发布物；`Version.md` 仅记录 Harness 模板版本，不替代下游 Cargo 版本，`.harness/upstream-lock.json` 也只记录工程来源。随附 core+CLI 资产只验证中性默认路径，不是可验收产品里程碑。
