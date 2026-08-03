# Agent-first Harness 项目模板

这是一个只包含工程 Harness 的空项目模板，用来先建立中性工程骨架，再在已初始化的下游项目中固定产品意图、TodoList、验证里程碑、Agent 策略和项目记忆，并安全同步后续 Harness 工程改进。

## 当前状态

- 维护状态：Active
- 产品名称：Agent-first Harness 项目模板
- 产品规格：Approved（2026-07-21）
- 当前版本：202607301002（上海时区 `YYYYMMDDHHMM`，未发布；事实来源见 [`Version.md`](Version.md)）
- 源码：尚未创建
- 反馈入口：待确定

## 开始一个项目

1. 使用 `$instantiate-project`，提供项目名称、ASCII `snake_case` 标识、完整目标目录、负责人和目标平台；流程调用 `$rename-project-identity` 全量重写项目自有配置、Skills、文档、路径和两份 License 的适用项目名，再建立以项目根为 top-level 的独立 Git 仓库，并排除 Harness 的 ADR、Changelog、Product Spec 与 Work Plan。
2. 进入目标目录并使用 `$initialize-rust-project`，选择 CLI/TUI/MCP/GUI 接口，并一次确认 Superpowers、Worktree/Subagent、验证里程碑冒烟和验证里程碑 E2E；无接口选择时默认 CLI。四项策略固化到 `docs/AGENT_POLICY.md`，初始化创建中性 scaffold status，裁剪实例化/初始化能力后提交本地基线。
3. 在已初始化的项目中先由 `$check-development-environment` 确认当前宿主工具链：始终检查 Rust，只有 GUI 项目额外检查 Node.js 与 pnpm。随后使用 `$define-product` 明确唯一目标、核心输入输出、范围、成功标准和最高风险失败路径。
4. 使用 `$plan-change` 把批准范围拆成 Todo 批次和验证里程碑。Agent 读取持久策略判断是否适合 `$run-parallel-worktrees`；策略和事实足够时不重复询问。
5. 使用 `$implement-change` 持续完成当前批次 Todo，并运行非空单元测试和变更相关检查。任一 Todo 未完成时不进入里程碑，也不运行冒烟/E2E。
6. 当前批次 Todo 全部完成后使用 `$verify-delivery` 验收完整、可运行、符合批准场景的真实里程碑产物。Mock、占位或 scaffold 会被拒绝；缺失和偏差会重开 Todo 返回编码。冒烟/E2E 只在这里按持久策略、硬要求和适用性决定。
7. 已初始化下游需要接收新版工程规则或保留 Skills 时使用 `$upgrade-harness`：先 dry-run 和三方比较，显式批准后只更新安全受管文件，保护产品事实、策略、身份、许可证和本地修改。

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
| `docs/VERIFICATION.md` | 验证命令、场景和证据 |
| `docs/adr/README.md` | 按日 ADR 索引；正文位于 `docs/adr/YYYYMMDD_ADR.md` |
| `docs/TECH_DEBT.md` | 已知限制和技术债 |
| `docs/RELEASE.md` | 版本与发布规则 |
| `docs/changelog/README.md` | 按日 Changelog 索引；正文位于 `docs/changelog/YYYYMMDD_CHANGELOG.md` |
| `docs/HARNESS_ENGINEERING.md` | 本模板的完整方法论依据 |

## 项目 Skills

- `$define-product`：把真实需求整理为有边界的 MVP 规格。
- `$instantiate-project`：从 Harness 建立干净下游仓库、初始化独立 Git 根并重置模板历史。
- `$rename-project-identity`：预览并统一修改项目展示名、标识前缀、配置、维护路径、Skills 与两份 License 的适用项目名。
- `$plan-change`：把已确认范围拆成带状态的 TodoList 和验证里程碑。
- `$implement-change`：持续完成当前 Todo 批次，以非空单元测试闭环；失败里程碑会回到这里修复。
- `$run-parallel-worktrees`：项目策略允许且当前任务可安全拆分时，用独立 Worktree/分支协调 Subagent，并以 helper `guard` 校验边界。
- `$initialize-rust-project`：确保独立 Git 根，一次收集接口组合与四项持久策略，创建中性 scaffold，并在验证后裁剪初始化能力。
- `$check-development-environment`：下游首次开发前检查并自动补齐 Rust；GUI 额外检查并补齐 Node.js 与 pnpm。该 Skill 在初始化裁剪后仍保留。
- `$prepare-gui-app-identity`：GUI 首次真实开发前补齐窗口名称等资料，并让用户选择自动生成图标、确定性 Plan B 或上传后标准化/高清处理。
- `$build-rust-release`：构建 Rust CLI 候选时默认采用 Windows、macOS、Linux 原生矩阵；跨平台预检不满足才回退当前平台。构建前安全清空根 `release/`，条件具备时尝试签名，最终候选、hash 与 manifest 统一写入该目录；本 Skill 不运行冒烟/E2E。
- `$verify-delivery`：只在 Todo 批次完成后验收真实里程碑产物，并按持久策略/硬要求决定冒烟与 E2E；失败时重开 Todo。
- `$prepare-cross-platform-release`：提供默认 Windows、macOS、Linux 原生 Rust CLI 候选矩阵和逐平台清理/条件签名门禁。
- `$collect-release-artifacts`：提取并核验归档、SHA-256、签名状态、manifest 和平台证据，同时保留候选的 `pending`/`rejected`/`accepted` 状态。
- `$upgrade-harness`：以 dry-run、来源锁和三方比较安全更新下游 Harness 工程层。
- `$prepare-release`：检查版本一致性并准备可追溯发布。
- `$add-mcp-adapter`：仅在下游用户明确批准后，为现有 shared core 增加最小 Rust stdio MCP adapter。
- `$add-gui-adapter`：仅在下游用户明确批准后，为现有 shared core 增加最小 Tauri 2 桌面 GUI adapter。
- `$add-cli-adapter`：增加独立、非交互且 Agent-ready 的 CLI adapter。
- `$add-tui-adapter`：增加独立的键盘驱动终端 UI adapter。
- `$test-final-artifact-e2e`：仅在验证里程碑中，由持久策略启用或产品/渠道要求时，对真实产物执行可观察 E2E。

模板维护者可运行 `python3 scripts/validate_harness.py`，自动检查必需文件、Skill 结构和声明、本地 Markdown 链接，以及候选 workflow 的关键安全与交付门禁。

本模板自身不实现具体产品。初始化 Skill 的中性 core+CLI 资产只证明默认骨架可创建，不是可验收里程碑；产品规格获批后，shared core 才承载真实业务逻辑。

## 已确认的基础约束

- AI Agent 是第一消费者，人类负责方向、审批和最终复核。
- 下游接口可从 CLI、TUI、MCP、GUI 独立选择和组合；未选择时默认 CLI。
- Rust 是下游项目的默认初始化语言；Tokio 是 Rust CLI 和后续 Rust adapter 的统一异步执行标准；模板自身仍不实现具体产品业务。
- TUI 技术族固定为 Ratatui + tui-realm + tui-realm-stdlib；Tauri GUI 前端固定为最新兼容稳定的 React + TypeScript、Mantine UI、TanStack Router、TanStack Query 与 Jotai。其他前后端技术在真实项目开发时按需求推荐。
- 默认结构是可独立复用和测试的 core Lib + 所选 adapter；adapter 彼此独立并直接依赖 core。
- 下游人工维护的数据结构、接口、函数、方法和测试使用有业务意义的中文注释；文件拆分、文档与测试规则以 `docs/ENGINEERING_RULES.md` 为准。
- CLI/TUI/MCP 使用 Tokio current-thread async 入口，GUI 复用 Tauri 的 Tokio async runtime；I/O 和等待型工作优先异步，只有测量确认的 CPU 密集工作才考虑受控多线程边界。同步阻塞依赖应替换为异步能力或进入范围/例外确认。core 可以提供 runtime-neutral 的 async API，只有真实业务需要 Tokio 原语时才直接依赖 Tokio；不默认启用 `full` feature。
- 下游依赖在 MSRV、目标平台、最小 feature 与验证约束内优先采用较新稳定版本，并以锁文件保证可复现；版本新不替代兼容与回归验证。
- 下游开发环境把 Rust 作为始终阻断的门禁，Windows 同时检查 MSVC Build Tools；仅 GUI 把 Node.js 与 pnpm 加入阻断门禁。缺失项从约定官方来源自动安装并复验。
- scaffold 验证结束后，下游删除实例化/初始化能力及模板专用入口，不能继续派生；`AGENTS.md` 永久保留非空 Skills/约束地图和 `$upgrade-harness`。
- 模板及其收费下游采用企业专有商业许可而非开源协议；实例化先原样复制中英文两份许可证，再仅把适用项目名改为目标项目，其他法律条款保持不变并永久保留。
- 项目实例化必须询问完整目标项目目录路径；路径解析后 basename 必须与项目标识一致，目标可以位于 Harness 内或外，但必须不存在或为空，并通过覆盖、递归复制与符号链接安全检查。
- 每个下游项目必须初始化独立 Git 仓库并使用 `main` 初始分支；即使位于父仓库内，Git top-level 也必须是下游项目根。实例化不复制源历史；初始化收尾只创建一个本地基线 commit，随后验证无 remote 且 porcelain 状态为空，不自动 push 或 tag。
- 实例化完整排除 Harness 的 `docs/adr/`、`docs/changelog/`、`docs/product_spec/`、`docs/work_plan/`，不复制索引、日期正文或空占位；对应项目记忆由下游开发流程首次真实使用时创建。
- 项目实例化阶段只要求身份、路径、负责人和目标平台；产品目的、核心输入输出、成功标准和风险可以留待已初始化项目中的 `$define-product` 完善。
- 项目标识使用 ASCII `snake_case`。core 与 CLI/TUI/MCP/GUI 目录分别派生为 `<项目标识>_core`、`_cli`、`_tui`、`_mcp`、`_gui`；根 workspace 只登记实际选择的 adapters。
- 初始化 Skill 携带 macOS/Linux shell 与 Windows PowerShell 门禁脚本；它们验证官方制品、复探安装结果并输出稳定 `gate.*` 状态。
- 构建会在项目已有批准的非交互签名 hook、工具和已授权凭据时尝试签名并验证；签名尝试失败会使该平台构建失败。条件不满足时记录 unsigned，只有真实分发渠道要求签名才阻断发布。
- 初始化把 `/release/` 精确一次写入根 `.gitignore`；每次构建在任何 build 命令前原子隔离旧目录并创建全新空目录，签名后的 archive/hash/manifest 先在同根 staging 形成完整三件套，再以目录级原子替换提交到 `release/`。远端 workflow 绑定批准的 40 位 commit，并只传输 manifest 声明的精确文件；目录存在不代表候选已验收或可发布。
- `Draft` 规格下的中性初始化不得推测业务、增加业务能力或作为产品交付证据；它只允许 `scaffold status`，并在 JSON 中返回 `productDefinitionRequired=true`。
- 根 Cargo workspace 统一声明第三方依赖和内部 crate 路径，所有 member 只通过 `workspace = true` 继承。
- 跨平台自动化默认只生成候选产物和证据；正式发布仍需独立授权。
- 目标平台为 Windows、macOS 和 Linux。
- 选择 CLI 时必须遵守统一 JSON 信封、错误结构、输出流和基础退出码契约。
- Work Plan 必须含 TodoList 与验证里程碑；Todo 未全部完成时持续实现、运行非空单元测试及相关格式、lint、静态、集成/契约检查，不运行冒烟/E2E。
- 只有完整、可运行、符合批准场景的真实产物能进入里程碑验收；Mock、stub、占位、scaffold、开发预览和代码片段不能验收。
- 冒烟/E2E 只在验证里程碑按 `docs/AGENT_POLICY.md`、产品/渠道硬要求和适用性决定；失败会重开 Todo 返回编码，而不是以部分完成继续交付。
- 单元测试必须覆盖核心成功路径和最高风险失败路径。
- 其他目标平台未实际验证时必须标记为 `Unverified`。
- 模板约束允许有审计记录的例外，记录必须包含理由、风险和恢复标准。
- Product Spec、Product Status、Work Plan 各自按日保存完整当前快照；同日持续整理同一文件，新日从前一份综合重写。
- 每个已确认需求形成当日独立 ADR 条目；同一天共享并持续更新一个日期文件。代码和用户可见变更同步检查设计文档、验证证据与当日 Changelog。
- Agent 可修复原任务范围内的普通失败；高风险、范围变化和最终完成声明由人工审批或复核。
- 最终人工复核必须写入仓库，Agent 不得代替人类签署。
- CLI、TUI、MCP、GUI 均有独立 adapter Skill；任何一种都不以另一 adapter 为前置条件。
- 初始化一次写入四项持久策略；后续 Agent 先复用再判断，只有缺失、冲突或无法判断时询问。
- 验收中的实现缺失或行为偏差必须重开 Todo、修正、补回归测试并重新运行完整里程碑。
- 写入型 Subagent 只有在项目策略启用且任务安全可拆时使用独立 Worktree，并在写入前通过 helper 边界检查；主 Agent 公开阶段状态并同步等待所有必需结果。
- 模板自身始终保持无具体业务代码。
