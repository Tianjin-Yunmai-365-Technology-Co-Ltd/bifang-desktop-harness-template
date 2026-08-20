# Agent-first Harness 项目模板

这是一个只包含工程 Harness 的空项目模板。它先建立中性工程骨架，再让日常改动按风险走快速、标准或里程碑路径：小改动保持短闭环，复杂与发布任务才增加持久计划、完整验收和人工复核。

## 当前状态

- 维护状态：Active
- 产品名称：Agent-first Harness 项目模板
- 产品规格：Approved（2026-07-21）
- 当前版本：202608051301（上海时区 `YYYYMMDDHHMM`，未发布；事实来源见 [`Version.md`](Version.md)）
- 源码：尚未创建
- 反馈入口：待确定

## 开始一个项目

1. 使用 `$desktop-instantiate-project` 提供项目身份、完整目标目录、负责人和目标平台，建立独立 Git 根并重置模板身份。
2. 使用 `$desktop-initialize-rust-project` 选择 CLI/TUI/MCP/GUI 接口；对 Agent 策略只需选择一次“推荐敏捷预设”或“自定义”。无接口选择时默认 CLI，策略不得在基线残留 `pending`。
3. 首次实际代码开发时运行 `$desktop-check-development-environment`；同一宿主和工具链未变化时复用成功证据，纯文档任务跳过。新产品、模糊需求或产品边界变化才使用 `$desktop-define-product`。
4. 每个任务选择一条路径：低风险且可逆的局部改动走快速路径，直接 `$desktop-implement-change`；多步骤/多模块/需交接的工作走标准路径，先 `$desktop-plan-change`；高风险、发布候选或用户明确要求时走里程碑路径并在 Todo 完成后 `$desktop-verify-delivery`。
5. 只运行与改动相称的验证：代码行为变化必须有相关非空测试；纯文档、元数据或机械变更使用链接、解析、静态或差异检查。只有里程碑路径考虑真实产物冒烟/E2E 和必要人工复核。
6. 已初始化下游需要接收新版工程规则时使用 `$desktop-upgrade-harness`：先 dry-run 和三方比较，显式批准后只更新安全受管文件。

用户可直接指定“快速/标准/里程碑”。未指定时 Agent 会说明自适应选择；安全、隐私、数据迁移、破坏性操作、凭据/生产/付费副作用、建立或改变对外兼容契约、渠道硬要求和发布不能降级。只修正文档对既有契约的描述不因此自动升档。

## 项目入口

| 文件 | 作用 |
|---|---|
| `AGENTS.md` | 编码代理的首要项目指引 |
| `Version.md` | Harness 模板当前时间版本、时间版本起始值、旧版本标识与发布状态的唯一事实来源 |
| `LICENSE.zh-CN.md` / `LICENSE.en.md` | 非开源的企业专有商业许可；覆盖项目、知识产权和终端下游限制 |
| `docs/product_spec/README.md` | Product Spec 按日完整快照规则与索引；当前规格取日期最新文件 |
| `docs/AGENT_POLICY.md` | Superpowers、Worktree/Subagent、里程碑冒烟和 E2E 的唯一持久策略 |
| [`docs/ENGINEERING_RULES.md`](docs/ENGINEERING_RULES.md) | 文件拆分、中文注释、文档、测试和例外规则 |
| `docs/CLI_CONTRACT.md` | 下游 CLI 的统一机器接口契约 |
| `docs/RUST_CLI_TEMPLATE.md` | 下游 Rust shared core 与可选 adapter 初始化基线 |
| `docs/project_status/README.md` | Product Status 按日完整快照规则与索引；当前状态取日期最新文件 |
| `docs/work_plan/README.md` | Work Plan 按日完整快照规则与索引；当前计划取日期最新文件 |
| `docs/VERIFICATION.md` | 验证原则、矩阵与证据分卷索引；正文位于 `docs/verification/` |
| `docs/adr/README.md` | 按日 ADR 索引；正文位于 `docs/adr/YYYYMMDD_ADR.md` |
| `docs/TECH_DEBT.md` | 已知限制和技术债 |
| `docs/RELEASE.md` | 版本与发布规则 |
| `docs/changelog/README.md` | 按日 Changelog 索引；正文位于 `docs/changelog/YYYYMMDD_CHANGELOG.md` |
| `docs/HARNESS_ENGINEERING.md` | 本模板方法论索引；主题正文位于 `docs/harness_engineering/` |

## 项目 Skills

- `$desktop-define-product`：只在新产品、模糊需求或产品目标/边界/成功标准变化时整理规格。
- `$desktop-instantiate-project`：从 Harness 建立干净下游仓库、初始化独立 Git 根并重置模板历史。
- `$desktop-rename-project-identity`：预览并统一修改项目展示名、标识前缀、配置、维护路径、Skills 与两份 License 的适用项目名；实例化重置保持中性，现有产品改名进入里程碑。
- `$desktop-plan-change`：为标准/里程碑路径或用户要求建立精简 Todo；快速路径不调用。
- `$desktop-implement-change`：直接执行范围清楚的请求或活动计划，并运行相称验证。
- `$desktop-refactor-code`：从单文件行数、文件组织结构（Rust `mod.rs`、前端非强制 `index.ts`）、命名、常量提取、潜在性能与死锁风险、core-first 归属六个方面辅助行为保持的重构。
- `$desktop-extract-i18n-strings`：把已选 GUI 适配器中硬编码的用户可见文案抽取为 `i18next`/`react-i18next` 与 `rust-i18n` 翻译键，不触碰共享 core。
- `$desktop-run-parallel-worktrees`：项目策略允许且当前任务可安全拆分时，用独立 Worktree/分支协调 Subagent，并以 helper `guard` 校验边界。
- `$desktop-initialize-rust-project`：确保独立 Git 根，收集接口组合，并通过一次推荐预设确认或自定义分支解析四项持久策略。
- `$desktop-check-development-environment`：首次实际代码开发或工具链变化时检查并自动补齐 Rust；GUI 额外处理 Node.js 与 pnpm，macOS 交叉构建 Windows Tauri 安装包时按目标补齐 LLVM、NSIS、Rust target 与 `cargo-xwin`。
- `$desktop-prepare-gui-app-identity`：GUI 首次真实开发前补齐窗口名称等资料，并让用户选择自动生成图标、确定性 Plan B 或上传后标准化/高清处理。
- `$desktop-prepare-gui-support-surfaces`：只在已批准 GUI 产品真实需要时，按需定义关于/支持/赞助、动态标题、更新检查或遥测，并固化 core/GUI 所有权、出站白名单与秘密隔离；Skill 携带产品家族共享的完整品牌页面/媒体依赖资产，只有所选界面实际需要时才进入应用 bundle。
- `$desktop-build-rust-release`：构建 Rust CLI 候选时默认采用 Windows、macOS、Linux 原生矩阵；跨平台预检不满足才回退当前平台。构建前安全清空根 `release/`，条件具备时尝试签名，最终候选、hash 与 manifest 统一写入该目录；本 Skill 不运行冒烟/E2E。
- `$desktop-build-tauri-release`：在 macOS 原生构建 Tauri DMG，并可通过 `pnpm tauri build --bundles nsis --runner cargo-xwin --target x86_64-pc-windows-msvc` 交叉构建 Windows x64 NSIS；macOS 直接分发签名采用“签名 + 公证 + stapling”一体门禁，构建与里程碑验收都对当前最终 DMG 只读复核真实 Finder 拖拽布局。
- `$desktop-verify-delivery`：只在里程碑/发布候选或用户明确要求时验收真实产物，并按策略/硬要求决定冒烟与 E2E。
- `$desktop-prepare-cross-platform-release`：提供默认 Windows、macOS、Linux 原生 Rust CLI 候选矩阵和逐平台清理/条件签名门禁。
- `$desktop-collect-release-artifacts`：提取并核验归档、SHA-256、签名状态、manifest 和平台证据，同时保留候选的 `pending`/`rejected`/`accepted` 状态。
- `$desktop-upgrade-harness`：以 dry-run、来源锁和三方比较安全更新下游 Harness 工程层。
- `$desktop-prepare-release`：检查版本一致性并准备可追溯发布。
- `$desktop-add-mcp-adapter`：仅在下游用户明确批准后，为现有 shared core 增加最小 Rust stdio MCP adapter。
- `$desktop-add-gui-adapter`：仅在下游用户明确批准后，为现有 shared core 增加最小 Tauri 2 桌面 GUI adapter。
- `$desktop-add-cli-adapter`：增加独立、非交互且 Agent-ready 的 CLI adapter。
- `$desktop-add-tui-adapter`：增加独立的键盘驱动终端 UI adapter。
- `$desktop-test-final-artifact-e2e`：仅在验证里程碑中，由持久策略启用或产品/渠道要求时，对真实产物执行可观察 E2E。

模板维护者可通过当前平台可用的 Python 3 解释器运行 `scripts/validate_harness.py`，自动检查必需文件、Skill 结构和声明、本地 Markdown 链接，以及候选 workflow 的关键安全与交付门禁。修改 Python 门禁行为时还必须以同一解释器运行 `-m unittest discover -s scripts`；该默认回归入口包含可复用 core-first 检查器的专属测试，不依赖 Shell 引号或 POSIX 可执行位。

本模板自身不实现具体产品。初始化 Skill 的中性 core+CLI 资产只证明默认骨架可创建，不是可验收里程碑；产品规格获批后，shared core 才承载真实业务逻辑。

## 已确认的基础约束

- AI Agent 是第一消费者，人类负责方向、关键取舍，以及发布/不可逆交付或项目明确要求的最终复核。
- 下游接口可从 CLI、TUI、MCP、GUI 独立选择和组合；未选择时默认 CLI。
- Rust 是下游项目的默认初始化语言；Tokio 是 Rust CLI 和后续 Rust adapter 的统一异步执行标准；模板自身仍不实现具体产品业务。
- TUI 技术族固定为 Ratatui + tui-realm + tui-realm-stdlib；Tauri GUI 前端固定为最新兼容稳定的 Vite + React + TypeScript、Mantine UI、TanStack Router 文件路由、TanStack Query、Jotai、ESLint/`typescript-eslint`、Prettier、Vitest 与 Testing Library。其他前后端技术在真实项目开发时按需求推荐。
- GUI 关于/支持/赞助、动态标题、更新检查和遥测都是独立可选产品能力；只有明确选择的界面才通过 `$desktop-prepare-gui-support-surfaces` 实施，出站与遥测默认禁用。因为 Harness 下游共享同一品牌，条件 Skill 保留固定赞助档位/价格、品牌联系人、支付二维码、更新 banner 和小图的完整品牌依赖包；它不携带某个来源下游的产品名称/标识、固定服务地址、秘密或默认网络请求。
- Rust 技术选型固定为 Tokio、Axum + Tower/Tower HTTP、Clap、SeaORM、config-rs、tracing 生态、anyhow、thiserror、serde 与 jiff；OpenTelemetry、OpenAPI、GraphQL、MongoDB/Redis 与认证组合只在对应能力获批后采用。固定技术在真实能力出现时按需引入，不给中性 scaffold 安装未使用依赖。
- Rust 下游从 Cargo workspace 根运行中文声明注释检查器；GUI 下游另外通过 TypeScript Compiler AST 门禁检查明确声明。两者都只证明紧邻中文注释存在，语义仍由人工/Agent 复核，并且禁止自动补入套话；非 GUI 下游不因此需要 Node.js 或 pnpm。
- 默认结构是可独立复用和测试的 core Lib + 所选 adapter；adapter 彼此独立并直接依赖 core。
- Core-first 是强制规则：所有接口/宿主无关的业务规则、领域校验、用例编排、状态转换和稳定错误都先由 core 实现和测试，即使项目当前只有一个接口也不能放进 adapter。
- CLI/TUI/MCP/GUI 只处理各自的参数/协议、展示、交互状态、运行时装配和结果映射。系统托盘、窗口、通知、终端恢复或 stdio 生命周期等特有机制留在所属 adapter，但由这些机制触发的业务行为仍调用 core；是否“薄”按职责判断，不按代码行数判断。
- 适配器只拒绝无法解析、缺少协议必填字段或违反宿主能力约束的输入；值域、跨字段关系、资源状态、业务权限、幂等性、可否执行以及影响业务结果的默认值由 core 判定并返回稳定领域错误。
- 下游人工维护的数据结构、接口、函数、方法和测试使用有业务意义的中文注释；文件拆分、文档与测试规则以 `docs/ENGINEERING_RULES.md` 为准。
- 所有人工或 Agent 维护的文本文件采用两级规模治理：超过 500 个物理行必须复核业务是否高内聚、职责单一且职责相近，不满足就按职责重构拆分；超过 2000 行机械门禁失败并强制拆分。Rust 模块拆分沿用目录/`mod.rs` 结构；Cargo/pnpm 等工具生成且禁止手工编辑的锁文件、生成物和原样内嵌第三方文件按封闭范围定义排除。
- CLI/TUI/MCP 使用 Tokio current-thread async 入口，GUI 复用 Tauri 的 Tokio async runtime；I/O 和等待型工作优先异步，只有测量确认的 CPU 密集工作才考虑受控多线程边界。同步阻塞依赖应替换为异步能力或进入范围/例外确认。core 可以提供 runtime-neutral 的 async API，只有真实业务需要 Tokio 原语时才直接依赖 Tokio；不默认启用 `full` feature。
- 下游依赖在 MSRV、目标平台、最小 feature 与验证约束内优先采用较新稳定版本，并以锁文件保证可复现；版本新不替代兼容与回归验证。
- 下游首次实际代码开发或工具链变化时检查环境；同一宿主、接口和约束未变化时复用成功证据，纯文档任务跳过。Rust 是代码开发门禁，Windows 同时检查 MSVC Build Tools；仅 GUI 需要 Node.js 与 pnpm。只有选择 macOS→Windows Tauri xwin 构建目标时才安装并复探 LLVM、NSIS、`x86_64-pc-windows-msvc` 与 `cargo-xwin`，且不会自动安装 Homebrew。
- scaffold 验证结束后，下游删除实例化/初始化能力及模板专用入口，不能继续派生；`AGENTS.md` 永久保留非空 Skills/约束地图和 `$desktop-upgrade-harness`。
- 模板及其收费下游采用企业专有商业许可而非开源协议；实例化先原样复制中英文两份许可证，再仅把适用项目名改为目标项目，其他法律条款保持不变并永久保留。
- 项目实例化必须询问完整目标项目目录路径；路径解析后 basename 必须与项目标识一致，目标可以位于 Harness 内或外，但必须不存在或为空，并通过覆盖、递归复制与符号链接安全检查。
- 每个下游项目必须初始化独立 Git 仓库并使用 `main` 初始分支；即使位于父仓库内，Git top-level 也必须是下游项目根。实例化不复制源历史；初始化收尾只创建一个本地基线 commit，随后验证无 remote 且 porcelain 状态为空，不自动 push 或 tag。
- 实例化完整排除 Harness 的 `docs/adr/`、`docs/changelog/`、`docs/product_spec/`、`docs/work_plan/`、`docs/VERIFICATION.md` 和 `docs/verification/`，不复制索引、日期正文、历史验证或空占位；对应项目记忆只在其触发条件首次满足时创建。
- 项目实例化阶段只要求身份、路径、负责人和目标平台；产品目的、核心输入输出、成功标准和风险可以留待已初始化项目中的 `$desktop-define-product` 完善。
- 项目标识使用 ASCII `snake_case`。core 与 CLI/TUI/MCP/GUI 目录分别派生为 `<项目标识>_core`、`_cli`、`_tui`、`_mcp`、`_gui`；根 workspace 只登记实际选择的 adapters。
- 初始化 Skill 携带 macOS/Linux shell 与 Windows PowerShell 门禁脚本；它们验证官方制品、复探安装结果并输出稳定 `gate.*` 状态。
- Rust CLI 构建会在项目已有批准的非交互签名 hook、工具和已授权凭据时尝试签名并验证；签名尝试失败会使该平台构建失败。macOS Tauri 直接分发候选在设备、Developer ID 与公证凭据齐备时必须完成签名、公证和 stapling，不能只签名；条件缺失时只有渠道允许才可显式生成 unsigned 候选，一旦签名或公证开始，失败不得降级。
- macOS 上的 Windows Tauri 交叉构建只生成 x64 NSIS，不生成 MSI，也不证明 Windows 原生运行；manifest 必须记录 `cross-compiled-xwin` 与 `runtimeVerification: Unverified`。
- 初始化把 `/release/` 精确一次写入根 `.gitignore`；每次 `$desktop-build-rust-release` 或 `$desktop-build-tauri-release` 在任何 build 命令前原子隔离旧目录并创建全新空目录，完成签名/公证/stapling 后的最终安装包、hash 与 manifest 先在同根 staging 形成完整三件套，再以目录级原子替换提交到 `release/`。远端 workflow 绑定批准的 40 位 commit，并只传输 manifest 声明的精确文件；目录存在不代表候选已验收或可发布。
- `Draft` 规格下的中性初始化不得推测业务、增加业务能力或作为产品交付证据；它只允许 `scaffold status`，并在 JSON 中返回 `productDefinitionRequired=true`。
- 根 Cargo workspace 统一声明第三方依赖和内部 crate 路径，所有 member 只通过 `workspace = true` 继承。
- 跨平台自动化默认只生成候选产物和证据；正式发布仍需独立授权。
- 目标平台为 Windows、macOS 和 Linux。
- 选择 CLI 时必须遵守统一 JSON 信封、错误结构、输出流和基础退出码契约。
- 快速路径不要求持久 Work Plan；标准路径使用精简 Todo；里程碑路径必须含 TodoList 与验收门禁，Todo 未全部完成时不得进入验收。
- 只有里程碑路径对完整、可运行、符合批准场景的真实产物给出验收结论；Mock、stub、占位、scaffold、开发预览和代码片段不能替代。
- 冒烟/E2E 只在验证里程碑按 `docs/AGENT_POLICY.md`、产品/渠道硬要求和适用性决定；失败会重开 Todo 返回编码，而不是以部分完成继续交付。
- 代码行为变化的相关非空测试必须覆盖核心成功路径和最高风险失败路径；纯文档、元数据、格式或不可合理单测的机械变更使用相称替代验证。
- 其他目标平台未实际验证时必须标记为 `Unverified`。
- 模板约束允许有审计记录的例外，记录必须包含理由、风险和恢复标准。
- Product Spec 只在产品目标/边界/约束/成功标准变化时更新；Product Status 只在里程碑、重要阻断、交接或用户要求时更新；Work Plan 只用于标准/里程碑路径或用户要求。
- ADR 只记录长期重要、难逆决定和硬规则例外；Changelog 只记录已经发生且用户或维护者可感知的变化；Verification 只保存里程碑、发布、人工复核或长期审计证据。
- 普通缺陷修复、不改变可观察行为的纯重构、格式整理、测试补强和内部清理不形成 Product Spec、ADR、Product Status、Changelog 或 Verification 流水账；复杂度仍可独立触发 Work Plan，安全、发布、长期决定等独立事件仍照常记录。
- Agent 可修复原任务范围内的普通失败；高风险、范围变化、新外部副作用和发布由人工审批。普通快速/标准任务不要求人工签署完成。
- 需要人工复核时必须写入仓库，Agent 不得代替人类签署。
- CLI、TUI、MCP、GUI 均有独立 adapter Skill；任何一种都不以另一 adapter 为前置条件。
- 初始化先让用户一次选择推荐敏捷预设或自定义；自定义才逐项询问四项策略，最终原子写入并复用。
- 里程碑验收中的实现缺失或行为偏差必须重开 Todo、修正、补回归测试并重新运行完整里程碑；快速/标准路径只重跑受影响检查。
- 写入型 Subagent 只有在项目策略启用且任务安全可拆时使用独立 Worktree，并在写入前通过 helper 边界检查；主 Agent 公开阶段状态并同步等待所有必需结果。
- 模板自身始终保持无具体业务代码。
