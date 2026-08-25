# Agent-first Harness 项目模板

这是一个只包含工程 Harness 的空项目模板。它先建立中性工程骨架，再让日常开发直接完成实现和本次必要单元测试；只有显式构建、发布或真实风险需要时才进入对应专用流程。

## 当前状态

- 维护状态：Active
- 产品名称：Agent-first Harness 项目模板
- 产品规格：Approved（2026-07-21）
- 当前版本：202608051301（上海时区 `YYYYMMDDHHMM`，未发布；事实来源见 [`Version.md`](Version.md)）
- 源码：尚未创建
- 反馈入口：待确定

## 开始一个项目

1. 使用 `$desktop-instantiate-project` 提供项目身份、完整目标目录、负责人和目标平台，建立独立 Git 根并重置模板身份。
2. 使用 `$desktop-initialize-rust-project` 选择 CLI/TUI/MCP/GUI 接口；对 Agent 策略只需选择一次“推荐预设”或“自定义”。无接口选择时默认 CLI，策略不得在基线残留 `pending`；选择 GUI 时会实际生成 3 个 Logo 候选并等待用户选择，同时创建项目内 660×400 macOS DMG 拖拽背景，并初始化托盘显示/退出、关闭隐藏、动态标题、图标/Tooltip 完整且默认收起的 Logo→版本侧栏、三态主题设置、应用级亮暗主题以及应用导航中的关于/赞助页。
3. 初始化时运行一次 `$desktop-check-development-environment`；初始化完成后先直接执行真实测试/构建命令，只有命令已因受管环境问题失败时才做对应检查、安装并重试一次。不得因新任务、显式构建或缺少环境证据重复预检。新产品、模糊需求或产品边界变化才使用 `$desktop-define-product`。
4. 日常开发直接使用 `$desktop-implement-change`，只增加并运行本次变更需要的单元/回归测试；除事件触发的 ADR、Changelog 等记录外，不自动增加计划、全仓检查、构建、冒烟、E2E 或验收步骤。
5. 用户显式请求构建时，构建 Skill 先解析本次是否启用 E2E，再运行项目全部非空单元测试并构建候选；构建事实只写入 `release/` manifest 和最终回复，不创建或更新 ADR、Changelog、Product Status、Work Plan、Verification 等项目记忆，启用的 E2E 只在最终真实候选形成后执行。
6. 已初始化下游需要接收新版工程规则时使用 `$desktop-upgrade-harness`：先 dry-run 和三方比较，显式批准后只更新安全受管文件。

安全、隐私、数据迁移、破坏性操作、凭据/生产/付费副作用、对外兼容契约、渠道要求和发布仍保留解决当前风险所必需的确认与门禁；精简开发流程不授权绕过这些边界。

## 项目入口

| 文件 | 作用 |
|---|---|
| `AGENTS.md` | 编码代理的首要项目指引 |
| `Version.md` | Harness 模板当前时间版本、时间版本起始值、旧版本标识与发布状态的唯一事实来源 |
| `LICENSE.zh-CN.md` / `LICENSE.en.md` | 非开源的企业专有商业许可；覆盖项目、知识产权和终端下游限制 |
| `docs/product_spec/README.md` | Product Spec 按日完整快照规则与索引；当前规格取日期最新文件 |
| `docs/AGENT_POLICY.md` | Superpowers、Worktree/Subagent、候选冒烟和构建时 E2E 建议默认值的唯一持久策略 |
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
- `$desktop-rename-project-identity`：预览并统一修改项目展示名、标识前缀、配置、维护路径、Skills 与两份 License 的适用项目名；现有产品改名先确认产品范围并记录必要 ADR/Changelog，构建或完整验收只按用户显式请求执行。
- `$desktop-plan-change`：只在用户明确要求持久计划、跨会话交接或发布/高风险协调确有必要时建立精简 Todo；日常开发不自动调用。
- `$desktop-implement-change`：直接执行范围清楚的请求，只运行本次开发需要的单元/回归测试和最小必要替代检查。
- `$desktop-refactor-code`：从单文件行数、文件组织结构（Rust `mod.rs`、前端非强制 `index.ts`）、命名、常量提取、潜在性能与死锁风险、core-first 归属六个方面辅助行为保持的重构。
- `$desktop-extract-i18n-strings`：把已选 GUI 适配器中硬编码的用户可见文案抽取为 `i18next`/`react-i18next` 与 `rust-i18n` 翻译键，不触碰共享 core。
- `$desktop-run-parallel-worktrees`：只有用户明确要求并行、项目策略允许且写入范围可安全拆分时，用独立 Worktree/分支协调 Subagent，并以 helper `guard` 校验边界。
- `$desktop-initialize-rust-project`：确保独立 Git 根，收集接口组合，并通过一次推荐预设确认或自定义分支解析四项持久策略；选择 GUI 时把中性 DMG 背景写入 `<项目标识>_gui/src-tauri/dmg/background.png`，并建立固定本地 GUI 生命周期与支持页面基线。
- `$desktop-check-development-environment`：只在初始化阶段，或初始化后真实测试/构建命令已因受管环境问题失败时检查并补齐对应工具；不得因显式构建或缺少环境证据预跑。GUI 可处理 Node.js 与 pnpm，实际失败的 macOS→Windows Tauri 路径可补齐 LLVM、NSIS、Rust target 与 `cargo-xwin`。
- `$desktop-prepare-gui-app-identity`：GUI 初始化时生成 3 个 1024×1024 Logo 候选并由用户选择；首次真实开发前再补齐窗口名称等资料，并预览批准或替换初始化生成的 DMG 背景。
- `$desktop-prepare-gui-support-surfaces`：为所有 GUI 初始化提供动态标题、图标/Tooltip 完整且默认收起的 Logo→版本侧栏、浅色/深色/跟随系统设置、全局亮暗语义主题、含更新入口的关于页、双主题赞助页和完整 sponsor 品牌媒体；真实更新、强更或统计上报启用时，再固化签名、core/GUI 所有权、同意、出站白名单与秘密隔离。
- `$desktop-build-rust-release`：构建 Rust CLI 候选时先逐次解析 E2E 选择并全量运行 workspace 单元测试，再默认采用 Windows、macOS、Linux 原生矩阵；跨平台预检不满足才回退当前平台。构建前安全清空根 `release/`，条件具备时尝试签名，最终候选、hash 与 manifest 统一写入该目录。
- `$desktop-build-tauri-release`：先校验 GUI 资料、DMG 背景和逐次 E2E 选择并运行完整 Rust/前端单元测试；随后构建 macOS DMG 或 Windows x64 NSIS。macOS 直接分发采用“签名 + 公证 + stapling”一体门禁；产品启用 updater 时还必须生成官方更新 archive/`.sig`、用公开密钥验证并纳入精确 manifest，不能以 unsigned 安装包绕过 updater 签名。
- `$desktop-verify-delivery`：只在发布候选、用户明确要求完整验收或本次构建启用 E2E 时验收真实产物。
- `$desktop-prepare-cross-platform-release`：提供默认 Windows、macOS、Linux 原生 Rust CLI 候选矩阵和逐平台清理/条件签名门禁。
- `$desktop-collect-release-artifacts`：提取并核验归档、SHA-256、签名状态、manifest 和平台证据，同时保留候选的 `pending`/`rejected`/`accepted` 状态，不把收集结果写入项目记忆。
- `$desktop-upgrade-harness`：以 dry-run、来源锁和三方比较安全更新下游 Harness 工程层。
- `$desktop-prepare-release`：检查版本一致性并准备可追溯发布。
- `$desktop-add-mcp-adapter`：仅在下游用户明确批准后，为现有 shared core 增加最小 Rust stdio MCP adapter。
- `$desktop-add-gui-adapter`：仅在下游用户明确批准后，为现有 shared core 增加最小 Tauri 2 桌面 GUI adapter。
- `$desktop-add-cli-adapter`：增加独立、非交互且 Agent-ready 的 CLI adapter。
- `$desktop-add-tui-adapter`：增加独立的键盘驱动终端 UI adapter。
- `$desktop-test-final-artifact-e2e`：仅在本次构建明确启用或产品/渠道要求时，对已形成的真实最终产物执行可观察 E2E。

模板维护者可通过当前平台可用的 Python 3 解释器运行 `scripts/validate_harness.py`，自动检查必需文件、Skill 结构和声明、本地 Markdown 链接，以及候选 workflow 的关键安全与交付门禁。修改 Python 门禁行为时还必须以同一解释器运行 `-m unittest discover -s scripts`；该默认回归入口包含可复用 core-first 检查器的专属测试，不依赖 Shell 引号或 POSIX 可执行位。

本模板自身不实现具体产品。初始化 Skill 的中性 core+CLI 资产只证明默认骨架可创建，不是可验收产品候选；产品规格获批后，shared core 才承载真实业务逻辑。

## 已确认的基础约束

- AI Agent 是第一消费者，人类负责方向、关键取舍，以及发布/不可逆交付或项目明确要求的最终复核。
- 下游接口可从 CLI、TUI、MCP、GUI 独立选择和组合；未选择时默认 CLI。
- Rust 是下游项目的默认初始化语言；Tokio 是 Rust CLI 和后续 Rust adapter 的统一异步执行标准；模板自身仍不实现具体产品业务。
- TUI 技术族固定为 Ratatui + tui-realm + tui-realm-stdlib；Tauri GUI 前端固定为满足已批准能力、目标平台、MSRV、Node.js 与 WebView 约束的最低兼容稳定 Vite + React + TypeScript、Mantine UI、TanStack Router 文件路由、TanStack Query、Jotai、ESLint/`typescript-eslint`、Prettier、Vitest 与 Testing Library 组合。其他前后端技术在真实项目开发时按需求推荐。
- GUI 初始化实际生成 3 个 1024×1024 Logo 候选并等待用户选择，选中母版同时用于平台图标和 `/app-identity/logo.png`。GUI 默认启用 `tray-icon`，托盘只含本地化“显示窗口”和“退出”；主窗口关闭只隐藏，不退出应用。初始化固定建立 `{applicationName} {version} {contactChannel}:{contactValue}` 动态标题和默认收起的左侧菜单，Logo 永远在顶部、当前版本紧随其下，展开/折叠及设置页直接可见；每个功能项与固定项都有图标，折叠时显示图标和 Tooltip 名称，展开时显示图标与名称。功能从顶部向下增长，底部固定为赞助、设置、关于，并建立 `/settings`、`/about`、`/sponsor`。主应用窗口默认 1440×900、最小 960×640，展开侧栏后仍可横向展示三张赞助档位卡；Mantine 初始化包含背景、surface、文字、边框和强调色的亮色/暗色语义主题，设置页提供浅色、深色、跟随系统三态选择并持久化，赞助页按运行时有效主题适配。设置页同时提供中英文和默认关闭的统计同意；检查更新入口迁回关于页，产品未配置时显示 `NotConfigured`/禁用并零出站。关于页还显示作者、联系方式与免责声明，赞助页打包完整品牌媒体。真实 updater/强更/统计传输需产品配置：updater 必须验证签名制品，强更由 core 对已认证最低支持版本作 SemVer 判定，统计只在明确同意后以最小 POST 字段发送且可撤回。品牌包不携带来源产品服务地址、客户端 secret 或默认网络请求。
- GUI 中性初始化提供无产品身份的 660×400 macOS DMG 拖拽背景，固定写入 `<项目标识>_gui/src-tauri/dmg/background.png` 并由 Tauri 配置以 `./dmg/background.png` 引用；首次真实 GUI 开发仍须预览批准或同路径替换，初始化资产本身不构成正式视觉批准。
- Rust 技术选型固定为 Tokio、Axum + Tower/Tower HTTP、Clap、SeaORM、config-rs、tracing 生态、anyhow、thiserror、serde 与 jiff；OpenTelemetry、OpenAPI、GraphQL、MongoDB/Redis 与认证组合只在对应能力获批后采用。固定技术在真实能力出现时按需引入，不给中性 scaffold 安装未使用依赖。
- Rust 下游从 Cargo workspace 根运行中文声明注释检查器；GUI 下游另外通过 TypeScript Compiler AST 门禁检查明确声明。两者都只证明紧邻中文注释存在，语义仍由人工/Agent 复核，并且禁止自动补入套话；非 GUI 下游不因此需要 Node.js 或 pnpm。
- 默认结构是可独立复用和测试的 core Lib + 所选 adapter；adapter 彼此独立并直接依赖 core。
- Core-first 是强制规则：所有接口/宿主无关的业务规则、领域校验、用例编排、状态转换和稳定错误都先由 core 实现和测试，即使项目当前只有一个接口也不能放进 adapter。
- CLI/TUI/MCP/GUI 只处理各自的参数/协议、展示、交互状态、运行时装配和结果映射。系统托盘、窗口、通知、终端恢复或 stdio 生命周期等特有机制留在所属 adapter，但由这些机制触发的业务行为仍调用 core；是否“薄”按职责判断，不按代码行数判断。
- 适配器只拒绝无法解析、缺少协议必填字段或违反宿主能力约束的输入；值域、跨字段关系、资源状态、业务权限、幂等性、可否执行以及影响业务结果的默认值由 core 判定并返回稳定领域错误。
- 下游人工维护的数据结构、接口、函数、方法和测试使用有业务意义的中文注释；文件拆分、文档与测试规则以 `docs/ENGINEERING_RULES.md` 为准。
- 所有人工或 Agent 维护的文本文件采用两级规模治理：超过 500 个物理行必须复核业务是否高内聚、职责单一且职责相近，不满足就按职责重构拆分；超过 2000 行机械门禁失败并强制拆分。Rust 模块拆分沿用目录/`mod.rs` 结构；Cargo/pnpm 等工具生成且禁止手工编辑的锁文件、生成物和原样内嵌第三方文件按封闭范围定义排除。
- CLI/TUI/MCP 使用 Tokio current-thread async 入口，GUI 复用 Tauri 的 Tokio async runtime；I/O 和等待型工作优先异步，只有测量确认的 CPU 密集工作才考虑受控多线程边界。同步阻塞依赖应替换为异步能力或进入范围/例外确认。core 可以提供 runtime-neutral 的 async API，只有真实业务需要 Tokio 原语时才直接依赖 Tokio；不默认启用 `full` feature。
- 下游直接依赖与受管工具声明可验证的最低兼容稳定版本范围：Rust 与前端清单保留下界兼容范围，Node.js/pnpm/cargo-xwin 等带 SemVer 的受管工具也使用范围；`Cargo.lock`/`pnpm-lock.yaml` 只固定当前解析结果。最低下界必须在项目声明的最低工具链中经过最低版本解析和相关测试，不能用精确依赖版本、`latest`、tag 或通配符替代兼容性声明。
- 初始化主动检查一次环境；初始化后不得按任务或构建例行检查，而是先运行真实命令，仅在已观察到受管环境错误后做对应安装并重试一次。纯文档任务跳过。Windows Rust 需要 MSVC Build Tools，仅 GUI 需要 Node.js 与 pnpm；只有实际失败命令属于 macOS→Windows Tauri xwin 路径时才安装并复探 LLVM、NSIS、`x86_64-pc-windows-msvc` 与 `cargo-xwin`，且不会自动安装 Homebrew。
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
- 日常开发不要求持久 Work Plan；只有用户明确要求、跨会话交接或发布/高风险协调确有必要时才维护 Todo。
- 只有完整、可运行、符合批准场景的真实产物可以获得验收结论；Mock、stub、占位、scaffold、开发预览和代码片段不能替代。
- 每次构建都逐次解析 E2E 选择并全量运行非空单元测试；构建事实只进入 `release/` manifest 和最终回复，不写入项目记忆；E2E 只针对构建完成后的最终真实候选，失败返回开发循环而不是以部分完成继续交付。
- 代码行为变化的本次必要单元/回归测试必须覆盖核心成功路径和最高风险失败路径；纯文档、元数据、格式或不可合理单测的机械变更只做最小必要替代检查。
- 其他目标平台未实际验证时必须标记为 `Unverified`。
- 模板约束允许有审计记录的例外，记录必须包含理由、风险和恢复标准。
- Product Spec 只在产品目标/边界/约束/成功标准变化时更新；Product Status 只在重要阻断、交接、发布/验收或用户要求时更新；Work Plan 只在用户明确要求、跨会话交接或发布/高风险协调确有必要时使用。
- ADR 只记录长期重要、难逆决定和硬规则例外；Changelog 只记录已经发生且用户或维护者可感知的变化；Verification 只保存发布、完整验收、人工复核或长期审计证据。
- 普通缺陷修复、不改变可观察行为的纯重构、格式整理、测试补强和内部清理不形成 Product Spec、ADR、Product Status、Changelog 或 Verification 流水账；安全、发布、长期决定等独立事件仍照常记录。
- Agent 可修复原任务范围内的普通失败；高风险、范围变化、新外部副作用和发布由人工审批。日常开发不要求人工签署完成。
- 需要人工复核时必须写入仓库，Agent 不得代替人类签署。
- CLI、TUI、MCP、GUI 均有独立 adapter Skill；任何一种都不以另一 adapter 为前置条件。
- 初始化先让用户一次选择推荐预设或自定义；推荐预设默认禁用 Superpowers，自定义才逐项询问四项策略，最终原子写入并复用。
- 验收中的实现缺失或行为偏差必须回到开发循环修正、补回归测试并重新验收；只有存在用户要求的持久计划时才重开 Todo。
- 写入型 Subagent 只有在用户明确要求并行、项目策略启用且任务安全可拆时使用独立 Worktree，并在写入前通过 helper 边界检查；主 Agent 公开阶段状态并同步等待所有必需结果。
- 模板自身始终保持无具体业务代码。
