# AGENTS.md

## 项目使命

本仓库是 Agent-first 小工具的无代码 Harness 模板。AI Agent 是第一消费者，人类负责方向、审批和最终复核。下游可独立选择 CLI、TUI、MCP、GUI 接口并面向 Windows、macOS 和 Linux；未选择接口时默认 CLI。下游初始化默认采用 Rust，但模板自身不实现具体产品。

## 首次进入时的阅读顺序

1. `README.md`
2. `docs/product_spec/README.md` 与其中日期最新的 Product Spec
3. `docs/project_status/README.md` 与其中日期最新的 Product Status
4. `docs/AGENT_POLICY.md`；读取四项持久策略，若 `superpowers: disabled`，本次及后续工作不得调用任何 `superpowers:*` Skill；字段为 `pending`、缺失或非法时按文件规则处理
5. 涉及代码、测试或文档变更时读取 [`docs/ENGINEERING_RULES.md`](docs/ENGINEERING_RULES.md)
6. 与任务相关的项目 Skill
7. CLI 相关任务读取 `docs/CLI_CONTRACT.md`
8. Rust core 或 adapter 初始化与实现任务读取 `docs/RUST_CLI_TEMPLATE.md`
9. `docs/work_plan/README.md` 与其中日期最新的 Work Plan、`docs/VERIFICATION.md` 或 `docs/RELEASE.md`
10. 需要理解方法论时再读 `docs/HARNESS_ENGINEERING.md`

不要默认一次性加载所有文档。按任务渐进读取。

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
| 已确认需求与重要取舍 | `docs/adr/README.md` 与当日 `docs/adr/YYYYMMDD_ADR.md` |
| 验证方式与结果 | `docs/VERIFICATION.md` |
| 已知限制与技术债 | `docs/TECH_DEBT.md` |
| 版本与发布要求 | `docs/RELEASE.md` |
| 用户和维护者可见变更 | `docs/changelog/README.md` 与当日 `docs/changelog/YYYYMMDD_CHANGELOG.md` |

如果事实来源之间冲突，先调查并修正文档；不要自行选择更方便的说法。

## 工作规则

- 下游初始化时一次确认并在 `docs/AGENT_POLICY.md` 固化 Superpowers、Worktree/Subagent、验证里程碑冒烟和验证里程碑 E2E。后续任务先复用该策略，再由 Agent 判断当前场景是否适用；只有字段缺失/非法、规则冲突、产物可运行性无法建立或需要新的外部授权时才询问。Harness 源的 `pending` 表示尚未完成下游选择，不得进入下游初始化基线。
- `parallel_worktree_subagents: enabled` 时，编码任务可安全拆成至少两个独立写入范围才使用 `$run-parallel-worktrees`；否则 Agent 自行使用单 Agent，不重复询问。写入型 Subagent 各自使用独立 Git Worktree 和 `codex/` 分支，主 Agent 公开子任务、所有权、依赖与验证边界，并在启动、阻塞、阶段完成、整合和验证节点更新。写入前必须从精确单元 Worktree 调用 helper `guard` 并声明写入目标；主 Agent 同步等待全部必需结果，重叠写入转为串行。该门禁不替代宿主 sandbox。
- 项目身份、路径、负责人和目标平台确认后，可以先执行不含业务假设的中性结构初始化；唯一用户目标、核心输入输出、成功标准和风险必须在任何业务设计或实现前由 `$define-product` 确认。
- 所有需求必须通过范围闸门；不得把未来候选默认纳入当前版本。
- `$plan-change` 必须把批准范围拆成 Todo 批次和验证里程碑；每个 Todo 记录稳定 ID、预期行为、影响边界、验证方式和 `pending`、`in_progress`、`blocked`、`done` 状态。任一 Todo 非 `done` 时不得进入对应验证里程碑。
- `$implement-change` 必须持续实现当前批次未完成 Todo，并以非空单元测试覆盖核心成功路径和最高风险失败路径。Todo 只有实现与对应检查通过后才能标记 `done`。
- 模板约束默认是硬规则。确需例外时，在当日 `docs/adr/YYYYMMDD_ADR.md` 记录理由、风险、适用范围和恢复标准后方可继续。
- 规格不明确且不同选择会改变产品边界时，停止实现并请求确认。
- 优先最短可靠闭环，避免为假想未来增加抽象、接口或依赖。
- 文件组织、中文业务注释、文档职责、测试组织和规则例外统一遵守 `docs/ENGINEERING_RULES.md`；软行数阈值只触发审查，不自动判定失败。
- 下游初始化必须询问用户选择 `CLI/TUI/MCP/GUI`，允许多选；无选择时默认 CLI。四类接口分别由 `$add-cli-adapter`、`$add-tui-adapter`、`$add-mcp-adapter`、`$add-gui-adapter` 独立实施，任何一种都不要求另一种存在。
- 下游 Product Spec 尚未创建或仍为 `Draft` 时允许先初始化中性 Rust workspace 与已选接口；此阶段只提供无业务副作用的 scaffold status，CLI JSON 明确返回 `productDefinitionRequired=true`，不得猜测业务逻辑、发布或声称产品交付完成。
- 下游项目初始化默认采用 `docs/RUST_CLI_TEMPLATE.md` 中的 Rust 2024 shared-core 与 adapter 基线。只有选中 CLI 时才应用 CLI 契约；选择其他语言、把业务逻辑混入 adapter 或降低工具链约束必须通过范围闸门并记录决策。
- 下游 CLI、TUI、MCP 必须使用 Tokio current-thread async 入口；GUI 必须复用 Tauri 的 Tokio-backed async runtime 和 plain async commands，不创建嵌套 runtime。所有 Rust adapter 开发默认优先异步 I/O、等待、计时、进程、协议和命令调用；只有测量确认的 CPU 密集工作才可考虑受控 `spawn_blocking`、专用线程或多线程 runtime，并记录任务所有权、取消、并发上限、资源预算和验证。只有同步阻塞 API 的依赖不能成为启用线程的默认理由，应替换为异步能力或进入范围/例外确认。core 可以暴露 runtime-neutral 的 async API；只有真实业务需要 Tokio 原语时才增加 core 的 Tokio 生产依赖，不得默认使用 `full`。
- 下游 TUI 固定使用 Ratatui、tui-realm 与 tui-realm-stdlib；Tauri GUI 前端固定使用执行时最新兼容稳定的 React + TypeScript、Mantine UI、TanStack Router、TanStack Query 与 Jotai。这些是硬规则；不得因 Draft、页面简单或 Agent 偏好省略，偏离必须记录硬规则例外。其他技术只在真实开发需要时结合项目推荐并通过依赖准入。
- 下游依赖在已声明 MSRV、Windows/macOS/Linux、最小 feature 集和完整验证约束内优先采用 registry 中较新的稳定版本；`Cargo.toml` 保存兼容范围，根 `Cargo.lock` 固定实际解析结果。无法采用较新稳定版本时必须记录原因、影响和复核条件，不得以“最新版”为由静默提高 MSRV、采用预发布版或跳过验证。
- 下游首次代码开发前必须调用 `$check-development-environment`。Rust 始终是阻断门禁，Windows 同时检查 Rust MSVC 所需 Build Tools；仅当接口选择包含 GUI 时，Node.js 与 pnpm 才是阻断门禁。缺失项按 Skill 的官方来源规则自动安装并复验。
- 开发环境门禁必须调用 `$check-development-environment` 自带的 POSIX shell 或 Windows PowerShell 脚本；不得以临时拼装安装命令替代制品校验、结构化输出和失败退出码。
- Cargo 根 `[workspace.dependencies]` 是 member 依赖版本、来源、内部路径和基线 feature 的唯一来源；所有子 crate 的生产、开发和构建依赖只使用 `workspace = true`。
- `$instantiate-project` 必须先要求用户提供完整目标项目目录路径；解析后的目录 basename 必须与项目标识一致，且目标必须不存在或为空。复制后该目录是初始化、代码修改、构建、验收和发布准备的唯一项目根目录。
- `$instantiate-project` 必须在目标根创建独立 Git 仓库并验证 top-level 精确等于项目根，初始分支为 `main`；目标位于父仓库内时也必须建立自己的边界。不得复制源 `.git`。Scaffold 验证和初始化能力裁剪完成后，必须使用用户现有 Git 身份创建唯一的本地初始化基线 commit，并验证无 remote 且 `git status --porcelain=v1 --untracked-files=all` 为空；不得 tag、配置 remote、push、伪造身份或修改全局 Git 配置。直接调用 `$initialize-rust-project` 时必须补建缺失边界并执行同一收尾门禁。
- 实例化不得迁移或预创建 `docs/adr/`、`docs/changelog/`、`docs/product_spec/`、`docs/work_plan/`、`docs/VERIFICATION.md`；它们分别在下游首次确认产品需求、建立实施计划、发生真实可见变更和进行首次人工复核时由对应开发 Skill 自然创建。初始化不得为了记录中性 scaffold 而提前生成这些内容。
- 下游项目标识统一使用跨平台安全的 ASCII `snake_case`；core 与四类接口目录确定性派生为 `<项目标识>_core`、`_cli`、`_tui`、`_mcp`、`_gui`，不得另行配置。
- 下游 Rust 首次初始化必须在当前项目根目录创建 workspace `Cargo.toml`，登记 core 与用户实际选择的 adapter members，并持续纳管未来新增 crate；不得在其他目录创建替代 workspace。
- 选择 CLI 时必须支持完全非交互运行和 `--json`，并遵守 `docs/CLI_CONTRACT.md`；未选择 CLI 的项目不适用该契约。
- `$instantiate-project` 或直接调用的 `$initialize-rust-project` 必须一次收集 Superpowers、Worktree/Subagent、里程碑冒烟和里程碑 E2E，原子写入 `docs/AGENT_POLICY.md` 并复用；下游基线 commit 前不得残留 `pending`。`superpowers: disabled` 时，后续 Agent 不得调用或遵循任何 `superpowers:*` Skill。
- 下游中性 scaffold 验证完成后必须删除 `$instantiate-project`、`$initialize-rust-project`、模板专用 validator/方法论文档及活动初始化入口；生成后的下游是终端项目根，不得继续派生项目。`$check-development-environment` 与 `$upgrade-harness` 必须保留。
- Harness 与下游采用非开源的企业专有商业许可。`$instantiate-project` 必须先逐字节复制根目录 `LICENSE.zh-CN.md` 与 `LICENSE.en.md`，再通过 `$rename-project-identity` 仅把两种语言的适用项目名改为目标项目；其余法律条款不得改变，初始化裁剪不得删除、弱化或替换。
- 派生下游时必须调用 `$rename-project-identity` 全量处理项目展示名、ASCII `snake_case` 标识、kebab-case 前缀、项目自有配置、维护路径、文档、Skills 和 Licenses；先预览、后显式应用，并对旧身份残留、路径碰撞和符号链接执行阻断检查。该 Skill 在下游保留，现有产品后续改名仍须先通过产品范围与计划闸门。
- 若选择 GUI，首次真实 GUI 开发前必须调用 `$prepare-gui-app-identity`，由用户确认窗口名称等应用资料并选择自动生成图标、确定性 Plan B 或上传后标准化/高清处理。
- 构建在项目已有批准的非交互签名 hook/命令、工具和已授权凭据时必须尝试签名并验证；尝试失败不得静默回退 unsigned。条件缺失时明确记录 unsigned，只有产品或渠道要求签名才阻断。不得自动创建、索取、导出或输出签名凭据；签名后再次改变字节的公证或重打包仍生成新的验收候选。
- 初始化必须把 `/release/` 精确一次写入项目根 `.gitignore`。每次 `$build-rust-release` 在任何构建命令前，必须先验证 canonical 独立 Git 根，拒绝 `release` 符号链接/reparse point 与路径越界，原子隔离旧目录并创建全新空目录；不得通过活动 destination 原地递归删除。签名后的 archive/hash/manifest 必须先在同根唯一 staging 形成精确文件集，再以不跟随链接的目录级原子替换提交到 `release/`。远端 workflow 必须绑定并复核 40 位 commit，只上传 manifest 声明的精确文件；`release/` 可包含 `pending` 候选，目录存在不代表 ready。
- 跨平台设计不得默认单一 Shell、路径分隔符、文件权限模型或仅在一个平台存在的系统能力。
- 仓库中没有明确命令时，不得虚构构建、测试或发布命令。
- 每次需求确认后，在当日 `docs/adr/YYYYMMDD_ADR.md` 增加独立 ADR 条目；同一天共享并持续更新同一文件，同时检查当日 Product Spec、Product Status 和 Work Plan 是否需要同步。三者在新自然日首次写入时必须读取各自前一份并综合重写完整当前快照。
- 每次代码、用户可见行为或维护流程变更时，检查相关设计文档、测试、验证记录和当日 `docs/changelog/YYYYMMDD_CHANGELOG.md`；无需更新时记录不适用理由。
- 重要且难以逆转的决定也写入当日 ADR。开发或修改前先读取 ADR 索引和最新日期 ADR，再按其中引用追溯仍有效的历史决定。
- 发现但不在当前范围内的问题写入 `docs/TECH_DEBT.md`，不要顺手扩张任务。
- 不覆盖或撤销用户已有修改；遇到重叠内容时基于现状继续。
- 每轮 Todo 开发必须执行非空单元测试和变更相关的必要验证；按风险选择格式、lint、静态检查和目标集成/契约测试。Todo 开发、普通验证、常规构建、制品收集和发布元数据流程不得运行冒烟或 E2E。检查失败不得延迟到下一轮，也不得把开发证据误报为里程碑已验收。
- 当前批次 Todo 全部为 `done` 且开发检查通过后，才可进入验证里程碑。候选必须是绑定批准场景、源码 commit、运行环境和可观察结果的完整真实产物；源码片段、Mock、stub、占位页面、中性 scaffold、开发预览或仅调用内部函数的结果不具备验收资格。
- 冒烟与 E2E 只允许由 `$verify-delivery` 在验证里程碑读取 `milestone_smoke`、`milestone_e2e`、产品/渠道硬要求和实际适用性后决定。`disabled` 的可选项记录 `Not run` 与风险；硬要求不得跳过。需要凭据、生产数据、支付、发布或不可逆副作用时仍须独立授权。
- 验证里程碑必须重新执行基于当前候选源码的编译/构建、非空单元测试、相关集成/契约和真实产物存在性检查。Todo 全部完成后，构建可在条件具备时先签名，并把明确标记 `milestoneAcceptance: pending` 的候选放入根 `release/` 或上传用于验收传输；它不是 ready/发布物。按策略启用或硬要求的冒烟/E2E 必须针对这些最终字节执行，并在标记 ready、发布上传或正式发布前通过。
- 任一必需门禁或已启用冒烟/E2E 失败、超时、取消或未执行时，里程碑拒绝；保存证据，重开或新增具体 Todo，返回 `$implement-change` 实现缺失逻辑、修复偏差并增加回归测试。只有所有 Todo 再次 `done` 后才能重新验收完整里程碑。
- 发布或交付完成声明至少要求：全部批准 Todo 完成，完整真实里程碑产物存在，必需场景证据通过，按策略/硬要求选择的里程碑检查通过，并取得项目规定的人工最终复核。
- 单元测试数量为零时不得记为通过。测试至少覆盖核心成功路径和最高风险失败路径；没有适用单元测试的例外必须按决策记录流程说明理由、风险和替代验证。
- 启动冒烟测试只在验证里程碑调用真实产物，使用适合已选接口的已记录只读入口，并在限定时间内以预期状态结束；不得产生业务副作用。
- Windows、macOS 和 Linux 是兼容目标；Todo 开发只验证变更相关的当前系统范围，验证里程碑重新验证当前系统完整闭环。其他平台必须明确标记为 `Unverified`，不得声称已通过。
- 必需检查失败时，Agent 可在原任务授权范围内诊断、重开 Todo、修复和重跑。破坏性操作、范围变化或新的外部副作用必须先请求人工审批。
- 最终发布或交付完成声明必须由人工复核；复核前重新运行当前系统的完整验证循环。
- 人工复核必须写入 `docs/VERIFICATION.md`，记录复核人、日期、范围、结论和剩余风险；Agent 不得代替人类签署。
- 人工审批只授权后续操作，不能把失败或未执行的检查改判为通过。
- 完成声明必须列出实际验证、未执行验证和剩余风险。

## Skills 地图

本节与后续“约束地图”是 `AGENTS.md` 的永久结构。模板实例化和下游裁剪只能删除不再适用的条目，不得删除整个章节，也不得保留指向已删除 Skill 的条目。

- 从本 Harness 建立新的完整下游仓库、重置模板身份与历史：使用 `$instantiate-project`。
- 派生时全量重置项目身份，或对现有项目执行已批准的产品改名：使用 `$rename-project-identity`。
- 新项目、需求模糊、范围变化：使用 `$define-product`。
- 已确认需求，需要拆解实现：使用 `$plan-change`。
- 已有批准计划，需要实施代码、测试和项目记忆变更：使用 `$implement-change`。
- 项目策略允许且当前 Todo 可安全并行：使用 `$run-parallel-worktrees`。
- 当前 Todo 批次完成，需要验收真实里程碑产物：使用 `$verify-delivery`；失败时重开 Todo 返回实现。
- 需要定版本、更新变更记录或准备发布：使用 `$prepare-release`。
- 初始化 Rust 工具链、shared core、接口选择和四项持久 Agent 策略：使用 `$initialize-rust-project`。
- 下游首次开发或接口/宿主工具链变化时：使用 `$check-development-environment`；Rust 始终检查，GUI 额外检查 Node.js 与 pnpm。
- 选择 GUI 后首次真实 GUI 开发：使用 `$prepare-gui-app-identity` 补齐窗口资料并由用户选择图标路径。
- 构建 Rust CLI 候选：使用 `$build-rust-release`；默认先走 Windows、macOS、Linux 原生矩阵，跨平台预检不可用才回退当前平台，并在构建前刷新根 `release/`、条件具备时尝试签名。其他接口当前按各自 adapter Skill 的构建与产物门槛执行。
- 默认 Windows、macOS、Linux Rust CLI 候选矩阵：使用 `$prepare-cross-platform-release`；矩阵启动后的真实失败不得伪装成当前平台回退，其他接口的统一跨平台发布能力仍未完成。
- 提取和核验本次构建结果：使用 `$collect-release-artifacts`，保留 manifest 的 pending/rejected/accepted 状态，不凭目录存在判断 ready。
- 已初始化下游需要同步新版 Harness 工程规则或保留 Skills：使用 `$upgrade-harness`；默认 dry-run，保护项目事实和本地修改。
- 下游明确增加 stdio MCP 支持：使用 `$add-mcp-adapter`。
- 下游明确增加桌面 GUI 支持：使用 `$add-gui-adapter`。
- 下游明确增加 CLI 支持：使用 `$add-cli-adapter`。
- 下游明确增加 TUI 支持：使用 `$add-tui-adapter`。
- 仅在验证里程碑中，当项目策略启用或产品/渠道把它列为必需项时，对真实产物执行 Computer Use E2E：使用 `$test-final-artifact-e2e`。

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
| 当前实施与验证证据 | `docs/work_plan/README.md`、日期最新的 `YYYYMMDD_work_plan.md`、`docs/VERIFICATION.md` |
| 并行协作偏好、Worktree 隔离与前台状态 | `docs/AGENT_POLICY.md`、`$run-parallel-worktrees` |
| 已确认需求与不可逆取舍 | `docs/adr/README.md` 与最新日期 ADR |
| 开发环境 | `$check-development-environment` |
| 下游派生边界 | Harness 可调用 `$instantiate-project` 一次；完成初始化的下游必须删除实例化/初始化能力并禁止继续派生 |
| 项目身份与前缀 | `$rename-project-identity`；覆盖项目自有配置、路径、文档、Skills 与两份许可证的项目名 |
| 下游 Harness 工程来源与升级 | `$upgrade-harness`、`.harness/upstream-lock.json` |
| 商业许可与知识产权 | 根目录 `LICENSE.zh-CN.md` 与 `LICENSE.en.md`；下游只替换适用项目名并保留其余条款 |

模板自身发生文档、Skill 或候选 workflow 变更时，运行 `python3 scripts/validate_harness.py`。该命令成功不替代 Rust asset 验证、真实下游验收或人工最终复核。

## 每次任务的最小闭环

1. 读取相关事实来源并确认当前边界。
2. 读取 `docs/AGENT_POLICY.md` 并判断当前任务的并行适用性；只有策略缺失/冲突或无法判断时询问。
3. 将批准范围拆成 Todo 批次和验证里程碑，检查工作区并保护既有修改。
4. 持续实现未完成 Todo，执行非空单元测试和变更相关检查；Todo 阶段不运行冒烟/E2E。
5. 当前批次 Todo 全部完成后才进入验证里程碑；只验收完整真实产物，并按策略/硬要求决定冒烟/E2E。
6. 验收失败时重开 Todo 返回编码；通过后更新受影响的项目记忆。
7. 报告变更、证据、未执行检查、未验证范围和下一步。

## 当前限制

本模板的产品规格已于 2026-07-21 获得人工批准，2026-07-30 移除独立 WEB 并保留 Tauri GUI Web 技术栈，2026-07-31 确认 Todo/里程碑闭环、真实产物验收、持久 Agent 策略和 `$upgrade-harness`。下游必须拥有独立 Git 根，可以先建立中性 Rust shared core 与所选 CLI/TUI/MCP/GUI 接口，再定义产品目的与核心输入输出，无选择时默认 CLI。模板根目录没有具体产品或发布物；`Version.md` 仅记录 Harness 模板版本，不替代下游 Cargo 版本，`.harness/upstream-lock.json` 也只记录工程来源。bundled core+CLI 资产只验证中性默认路径，不是可验收产品里程碑。
