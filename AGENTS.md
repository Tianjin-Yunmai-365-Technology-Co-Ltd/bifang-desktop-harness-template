# AGENTS.md

## 项目使命

本仓库是 Agent-first 小工具的无代码 Harness 模板。AI Agent 是第一消费者，人类负责方向、审批和最终复核。下游可独立选择 CLI、TUI、MCP、GUI、WEB 接口并面向 Windows、macOS 和 Linux；未选择接口时默认 CLI。下游初始化默认采用 Rust，但模板自身不实现具体产品。

## 首次进入时的阅读顺序

1. `README.md`
2. `docs/product_spec/README.md` 与其中日期最新的 Product Spec
3. `docs/project_status/README.md` 与其中日期最新的 Product Status
4. `docs/AGENT_POLICY.md`；若 `superpowers: disabled`，本次及后续工作不得调用任何 `superpowers:*` Skill
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
| Agent 能力开关 | `docs/AGENT_POLICY.md` |
| 当前实施步骤 | `docs/work_plan/README.md` 与日期最新的 `YYYYMMDD_work_plan.md` |
| 文件、注释、文档、测试与例外规则 | [`docs/ENGINEERING_RULES.md`](docs/ENGINEERING_RULES.md) |
| 已确认需求与重要取舍 | `docs/adr/README.md` 与当日 `docs/adr/YYYYMMDD_ADR.md` |
| 验证方式与结果 | `docs/VERIFICATION.md` |
| 已知限制与技术债 | `docs/TECH_DEBT.md` |
| 版本与发布要求 | `docs/RELEASE.md` |
| 用户和维护者可见变更 | `docs/changelog/README.md` 与当日 `docs/changelog/YYYYMMDD_CHANGELOG.md` |

如果事实来源之间冲突，先调查并修正文档；不要自行选择更方便的说法。

## 工作规则

- 项目身份、路径、负责人和目标平台确认后，可以先执行不含业务假设的中性结构初始化；唯一用户目标、核心输入输出、成功标准和风险必须在任何业务设计或实现前由 `$define-product` 确认。
- 所有需求必须通过范围闸门；不得把未来候选默认纳入当前版本。
- 模板约束默认是硬规则。确需例外时，在当日 `docs/adr/YYYYMMDD_ADR.md` 记录理由、风险、适用范围和恢复标准后方可继续。
- 规格不明确且不同选择会改变产品边界时，停止实现并请求确认。
- 优先最短可靠闭环，避免为假想未来增加抽象、接口或依赖。
- 文件组织、中文业务注释、文档职责、测试组织和规则例外统一遵守 `docs/ENGINEERING_RULES.md`；软行数阈值只触发审查，不自动判定失败。
- 下游初始化必须询问用户选择 `CLI/TUI/MCP/GUI/WEB`，允许多选；无选择时默认 CLI。五类接口分别由 `$add-cli-adapter`、`$add-tui-adapter`、`$add-mcp-adapter`、`$add-gui-adapter`、`$add-web-adapter` 独立实施，任何一种都不要求另一种存在。
- 下游 Product Spec 尚未创建或仍为 `Draft` 时允许先初始化中性 Rust workspace 与已选接口；此阶段只提供无业务副作用的 scaffold status，CLI JSON 明确返回 `productDefinitionRequired=true`，不得猜测业务逻辑、发布或声称产品交付完成。
- 下游项目初始化默认采用 `docs/RUST_CLI_TEMPLATE.md` 中的 Rust 2024 shared-core 与 adapter 基线。只有选中 CLI 时才应用 CLI 契约；选择其他语言、把业务逻辑混入 adapter 或降低工具链约束必须通过范围闸门并记录决策。
- 下游 CLI、TUI、MCP 必须使用 Tokio current-thread async 入口；GUI 必须复用 Tauri 的 Tokio-backed async runtime 和 plain async commands，不创建嵌套 runtime。所有 Rust adapter 开发默认优先异步 I/O、等待、计时、进程、协议和命令调用；只有测量确认的 CPU 密集工作才可考虑受控 `spawn_blocking`、专用线程或多线程 runtime，并记录任务所有权、取消、并发上限、资源预算和验证。只有同步阻塞 API 的依赖不能成为启用线程的默认理由，应替换为异步能力或进入范围/例外确认。core 可以暴露 runtime-neutral 的 async API；只有真实业务需要 Tokio 原语时才增加 core 的 Tokio 生产依赖，不得默认使用 `full`。
- 下游 TUI 固定使用 Ratatui、tui-realm 与 tui-realm-stdlib；WEB 与 GUI 前端固定使用执行时最新兼容稳定的 React + TypeScript、Mantine UI、TanStack Router、TanStack Query 与 Jotai。这些是硬规则；不得因 Draft、页面简单或 Agent 偏好省略，偏离必须记录硬规则例外。其他技术只在真实开发需要时结合项目推荐并通过依赖准入。
- 下游依赖在已声明 MSRV、Windows/macOS/Linux、最小 feature 集和完整验证约束内优先采用 registry 中较新的稳定版本；`Cargo.toml` 保存兼容范围，根 `Cargo.lock` 固定实际解析结果。无法采用较新稳定版本时必须记录原因、影响和复核条件，不得以“最新版”为由静默提高 MSRV、采用预发布版或跳过验证。
- 下游首次代码开发前必须调用 `$check-development-environment`。Rust 始终是阻断门禁，Windows 同时检查 Rust MSVC 所需 Build Tools；仅当接口选择包含 GUI 或 WEB 时，Node.js 与 pnpm 才是阻断门禁。缺失项按 Skill 的官方来源规则自动安装并复验。
- 开发环境门禁必须调用 `$check-development-environment` 自带的 POSIX shell 或 Windows PowerShell 脚本；不得以临时拼装安装命令替代制品校验、结构化输出和失败退出码。
- Cargo 根 `[workspace.dependencies]` 是 member 依赖版本、来源、内部路径和基线 feature 的唯一来源；所有子 crate 的生产、开发和构建依赖只使用 `workspace = true`。
- `$instantiate-project` 必须先要求用户提供完整目标项目目录路径；解析后的目录 basename 必须与项目标识一致，且目标必须不存在或为空。复制后该目录是初始化、代码修改、构建、验收和发布准备的唯一项目根目录。
- `$instantiate-project` 必须在目标根创建独立 Git 仓库并验证 top-level 精确等于项目根，初始分支为 `main`；目标位于父仓库内时也必须建立自己的边界。不得复制源 `.git`。Scaffold 验证和初始化能力裁剪完成后，必须使用用户现有 Git 身份创建唯一的本地初始化基线 commit，并验证无 remote 且 `git status --porcelain=v1 --untracked-files=all` 为空；不得 tag、配置 remote、push、伪造身份或修改全局 Git 配置。直接调用 `$initialize-rust-project` 时必须补建缺失边界并执行同一收尾门禁。
- 实例化不得迁移或预创建 `docs/adr/`、`docs/changelog/`、`docs/product_spec/`、`docs/work_plan/`、`docs/VERIFICATION.md`；它们分别在下游首次确认产品需求、建立实施计划、发生真实可见变更和进行首次人工复核时由对应开发 Skill 自然创建。初始化不得为了记录中性 scaffold 而提前生成这些内容。
- 下游项目标识统一使用跨平台安全的 ASCII `snake_case`；core 与五类接口目录确定性派生为 `<项目标识>_core`、`_cli`、`_tui`、`_mcp`、`_gui`、`_web`，不得另行配置。
- 下游 Rust 首次初始化必须在当前项目根目录创建 workspace `Cargo.toml`，登记 core 与用户实际选择的 adapter members，并持续纳管未来新增 crate；不得在其他目录创建替代 workspace。
- 选择 CLI 时必须支持完全非交互运行和 `--json`，并遵守 `docs/CLI_CONTRACT.md`；未选择 CLI 的项目不适用该契约。
- `$instantiate-project` 或 `$initialize-rust-project` 必须询问是否关闭 superpowers，并将最终值写入 `docs/AGENT_POLICY.md`。值为 `disabled` 时，后续 Agent 不得调用或遵循任何 `superpowers:*` Skill。
- 下游中性 scaffold 验证完成后必须删除 `$instantiate-project`、`$initialize-rust-project`、模板专用 validator/方法论文档及活动初始化入口；生成后的下游是终端项目根，不得继续派生项目。`$check-development-environment` 必须保留。
- 若选择 GUI，首次真实 GUI 开发前必须调用 `$prepare-gui-app-identity`，由用户确认窗口名称等应用资料并选择自动生成图标、确定性 Plan B 或上传后标准化/高清处理。
- GUI 的本地构建、测试、产物存在与启动冒烟不得强制要求签名身份、证书、notarization 或 updater key；无签名结果必须明确标记。用户选择的实际分发渠道若要求签名，仍作为独立发布阻断门禁。
- 初始化必须把 `/release/` 写入项目根 `.gitignore`。`$collect-release-artifacts` 每次收集前必须只清理 canonical 项目根下非符号链接的精确 `release/` 内容，再仅复制属于当前项目、当前版本、当前源码 commit 与明确 build run 的最新已完成结果；不得混入其他项目、旧版本、旧 run、未完成或来源不明文件。
- 跨平台设计不得默认单一 Shell、路径分隔符、文件权限模型或仅在一个平台存在的系统能力。
- 仓库中没有明确命令时，不得虚构构建、测试或发布命令。
- 每次需求确认后，在当日 `docs/adr/YYYYMMDD_ADR.md` 增加独立 ADR 条目；同一天共享并持续更新同一文件，同时检查当日 Product Spec、Product Status 和 Work Plan 是否需要同步。三者在新自然日首次写入时必须读取各自前一份并综合重写完整当前快照。
- 每次代码、用户可见行为或维护流程变更时，检查相关设计文档、测试、验证记录和当日 `docs/changelog/YYYYMMDD_CHANGELOG.md`；无需更新时记录不适用理由。
- 重要且难以逆转的决定也写入当日 ADR。开发或修改前先读取 ADR 索引和最新日期 ADR，再按其中引用追溯仍有效的历史决定。
- 发现但不在当前范围内的问题写入 `docs/TECH_DEBT.md`，不要顺手扩张任务。
- 不覆盖或撤销用户已有修改；遇到重叠内容时基于现状继续。
- 下游项目的交付完成声明至少要求在 Agent 当前实际运行的系统中：代码成功编译、非空单元测试套件通过、约定的最终产物确实存在、产物通过启动冒烟测试。
- 单元测试数量为零时不得记为通过。测试至少覆盖核心成功路径和最高风险失败路径；没有适用单元测试的例外必须按决策记录流程说明理由、风险和替代验证。
- 启动冒烟测试必须调用真实最终产物，使用适合已选接口的已记录只读入口，并在限定时间内以预期状态结束；不得产生业务副作用。
- Windows、macOS 和 Linux 是兼容目标，但一次任务只强制验证当前系统。其他平台必须明确标记为 `Unverified`，不得声称已通过。
- 必需检查失败时，Agent 可在原任务授权范围内诊断、修复和重跑。破坏性操作、范围变化或新的外部副作用必须先请求人工审批。
- 最终完成声明必须由人工复核；复核前重新运行当前系统的完整验证循环。
- 人工复核必须写入 `docs/VERIFICATION.md`，记录复核人、日期、范围、结论和剩余风险；Agent 不得代替人类签署。
- 人工审批只授权后续操作，不能把失败或未执行的检查改判为通过。
- 完成声明必须列出实际验证、未执行验证和剩余风险。

## Skills 地图

本节与后续“约束地图”是 `AGENTS.md` 的永久结构。模板实例化和下游裁剪只能删除不再适用的条目，不得删除整个章节，也不得保留指向已删除 Skill 的条目。

- 从本 Harness 建立新的完整下游仓库、重置模板身份与历史：使用 `$instantiate-project`。
- 新项目、需求模糊、范围变化：使用 `$define-product`。
- 已确认需求，需要拆解实现：使用 `$plan-change`。
- 已有批准计划，需要实施代码、测试和项目记忆变更：使用 `$implement-change`。
- 需要验收、复核完成状态：使用 `$verify-delivery`。
- 需要定版本、更新变更记录或准备发布：使用 `$prepare-release`。
- 初始化 Rust 工具链、shared core、接口选择和 superpowers 策略：使用 `$initialize-rust-project`。
- 下游首次开发或接口/宿主工具链变化时：使用 `$check-development-environment`；Rust 始终检查，GUI/WEB 额外检查 Node.js 与 pnpm。
- 选择 GUI 后首次真实 GUI 开发：使用 `$prepare-gui-app-identity` 补齐窗口资料并由用户选择图标路径。
- 构建当前平台 Rust CLI release 产物：使用 `$build-rust-release`；其他接口当前按各自 adapter Skill 的构建与产物门槛执行。
- 准备 Windows、macOS、Linux Rust CLI 候选构建矩阵：使用 `$prepare-cross-platform-release`；其他接口的跨平台发布能力仍未统一。
- 提取和核验发布结果文件：使用 `$collect-release-artifacts`。
- 下游明确增加 stdio MCP 支持：使用 `$add-mcp-adapter`。
- 下游明确增加桌面 GUI 支持：使用 `$add-gui-adapter`。
- 下游明确增加 CLI 支持：使用 `$add-cli-adapter`。
- 下游明确增加 TUI 支持：使用 `$add-tui-adapter`。
- 下游明确增加 WEB 支持：使用 `$add-web-adapter`。
- 对真实最终产物执行 Computer Use E2E：使用 `$test-final-artifact-e2e`。

项目 Skills 位于 `.agents/skills/`。只在对应任务触发时读取其完整内容。

## 约束地图

本节不得在模板实例化或下游裁剪时被完全删除。生成后的下游应保留仍适用的条目，并移除仅属于 Harness 初始化的条目。

| 约束领域 | 唯一来源或入口 |
|---|---|
| 产品目标、范围与成功标准 | `docs/product_spec/README.md` 与日期最新的 `YYYYMMDD_product_spec.md` |
| 文件、中文注释、文档、测试和例外 | [`docs/ENGINEERING_RULES.md`](docs/ENGINEERING_RULES.md) |
| Agent 能力开关 | `docs/AGENT_POLICY.md` |
| Rust shared core、adapter、MSRV 与依赖 | `docs/RUST_CLI_TEMPLATE.md` |
| CLI 机器接口（仅选择 CLI 时） | `docs/CLI_CONTRACT.md` |
| 当前实施与验证证据 | `docs/work_plan/README.md`、日期最新的 `YYYYMMDD_work_plan.md`、`docs/VERIFICATION.md` |
| 已确认需求与不可逆取舍 | `docs/adr/README.md` 与最新日期 ADR |
| 开发环境 | `$check-development-environment` |
| 下游派生边界 | Harness 可调用 `$instantiate-project` 一次；完成初始化的下游必须删除实例化/初始化能力并禁止继续派生 |

模板自身发生文档、Skill 或候选 workflow 变更时，运行 `python3 scripts/validate_harness.py`。该命令成功不替代 Rust asset 验证、真实下游验收或人工最终复核。

## 每次任务的最小闭环

1. 读取相关事实来源并确认当前边界。
2. 检查工作区现状，保护既有修改。
3. 仅修改完成目标所需的最小文件集合。
4. 执行与风险相称的验证。
5. 更新受影响的项目记忆。
6. 报告变更、证据、遗漏项和下一步。

## 当前限制

本模板的产品规格已于 2026-07-21 获得人工批准，并于 2026-07-22 确认下游必须拥有独立 Git 根、可以先建立中性 Rust shared core 与所选接口，再定义产品目的与核心输入输出；接口可从 CLI/TUI/MCP/GUI/WEB 独立选择，无选择时默认 CLI。模板根目录没有具体产品、版本 manifest 或发布物；bundled core+CLI 资产仅验证默认 CLI 路径，不构成对所有下游的 CLI 强制。中性脚手架证据不等同于下游产品交付证据。
