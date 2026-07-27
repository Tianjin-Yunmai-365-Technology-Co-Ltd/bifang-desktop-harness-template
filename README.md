# Agent-first Harness 项目模板

这是一个只包含工程 Harness 的空项目模板，用来先建立可运行的中性工程骨架，再在已初始化的下游项目中固定产品意图、范围、验证方式和项目记忆。

## 当前状态

- 维护状态：Active
- 产品名称：Agent-first Harness 项目模板
- 产品规格：Approved（2026-07-21）
- 当前版本：1.0.0（未发布；事实来源见 [`Version.md`](Version.md)）
- 源码：尚未创建
- 反馈入口：待确定

## 开始一个项目

1. 使用 `$instantiate-project`，提供项目名称、ASCII `snake_case` 标识、完整目标目录、负责人和目标平台；流程调用 `$rename-project-identity` 全量重写项目自有配置、Skills、文档、路径和两份 License 的适用项目名，再建立以项目根为 top-level 的独立 Git 仓库，并排除 Harness 的 ADR、Changelog、Product Spec 与 Work Plan。
2. 进入目标目录并使用 `$initialize-rust-project`，选择需要的 CLI/TUI/MCP/GUI/WEB 接口并决定是否关闭 superpowers；无接口选择时默认 CLI。初始化创建 shared core 与所选接口的中性 scaffold status，验证后删除下游中的实例化/初始化 Skills、模板专用文档和门禁入口，创建一个本地初始化基线 commit，并验证独立 Git 无 remote、工作树干净。
3. 在已初始化的项目中先由 `$check-development-environment` 确认当前宿主工具链：始终检查 Rust，只有 GUI/WEB 项目额外检查 Node.js 与 pnpm。随后使用 `$define-product` 明确唯一目标、核心输入输出、范围、成功标准和最高风险失败路径。
4. 使用 `$plan-change` 建立可验证的执行计划，再使用 `$implement-change` 以真实业务命令替换中性 `scaffold status`，同步项目状态、ADR、验证与 Changelog。
5. 使用 `$verify-delivery` 验证真实产品；开发、验证和发布全过程遵循 `AGENTS.md` 及相应项目 Skill。

## 项目入口

| 文件 | 作用 |
|---|---|
| `AGENTS.md` | 编码代理的首要项目指引 |
| `Version.md` | Harness 模板当前版本、初始版本与发布状态的唯一事实来源 |
| `LICENSE.zh-CN.md` / `LICENSE.en.md` | 非开源的企业专有商业许可；覆盖项目、知识产权和终端下游限制 |
| `docs/product_spec/README.md` | Product Spec 按日完整快照规则与索引；当前规格取日期最新文件 |
| `docs/AGENT_POLICY.md` | superpowers 等 Agent 能力开关 |
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
- `$plan-change`：为已确认范围的变更建立执行计划。
- `$implement-change`：按已批准计划实施最小代码、测试和项目记忆变更。
- `$initialize-rust-project`：确保独立 Git 根，询问接口组合与 superpowers 策略，创建中性 scaffold，调用独立开发环境门禁并在验证后裁剪下游初始化能力。
- `$check-development-environment`：下游首次开发前检查并自动补齐 Rust；GUI/WEB 额外检查并补齐 Node.js 与 pnpm。该 Skill 在初始化裁剪后仍保留。
- `$prepare-gui-app-identity`：GUI 首次真实开发前补齐窗口名称等资料，并让用户选择自动生成图标、确定性 Plan B 或上传后标准化/高清处理。
- `$build-rust-release`：构建、定位并冒烟验证当前平台 Rust CLI 发布产物。
- `$verify-delivery`：执行发布前门槛并记录完成证据。
- `$prepare-cross-platform-release`：准备 Windows、macOS、Linux 原生 Rust CLI 候选构建矩阵。
- `$collect-release-artifacts`：提取并核验归档、SHA-256、manifest 和平台证据。
- `$prepare-release`：检查版本一致性并准备可追溯发布。
- `$add-mcp-adapter`：仅在下游用户明确批准后，为现有 shared core 增加最小 Rust stdio MCP adapter。
- `$add-gui-adapter`：仅在下游用户明确批准后，为现有 shared core 增加最小 Tauri 2 桌面 GUI adapter。
- `$add-cli-adapter`：增加独立、非交互且 Agent-ready 的 CLI adapter。
- `$add-tui-adapter`：增加独立的键盘驱动终端 UI adapter。
- `$add-web-adapter`：增加独立的本地优先 WEB adapter。
- `$test-final-artifact-e2e`：通过 Computer Use 对真实最终产物执行可观察 E2E 验收。

模板维护者可运行 `python3 scripts/validate_harness.py`，自动检查必需文件、Skill 结构和声明、本地 Markdown 链接，以及候选 workflow 的关键安全与交付门禁。

本模板自身不实现具体产品，但初始化 Skill 包含最小、可验证的中性 core+CLI 资产，用于证明默认 CLI 路径。下游只创建用户所选接口；产品规格获批后，shared core 才承载真实业务逻辑。

## 已确认的基础约束

- AI Agent 是第一消费者，人类负责方向、审批和最终复核。
- 下游接口可从 CLI、TUI、MCP、GUI、WEB 独立选择和组合；未选择时默认 CLI。
- Rust 是下游项目的默认初始化语言；Tokio 是 Rust CLI 和后续 Rust adapter 的统一异步执行标准；模板自身仍不实现具体产品业务。
- TUI 技术族固定为 Ratatui + tui-realm + tui-realm-stdlib；WEB 与 GUI 前端固定为最新兼容稳定的 React + TypeScript、Mantine UI、TanStack Router、TanStack Query 与 Jotai。其他前后端技术在真实项目开发时按需求推荐。
- 默认结构是可独立复用和测试的 core Lib + 所选 adapter；adapter 彼此独立并直接依赖 core。
- 下游人工维护的数据结构、接口、函数、方法和测试使用有业务意义的中文注释；文件拆分、文档与测试规则以 `docs/ENGINEERING_RULES.md` 为准。
- CLI/TUI/MCP 使用 Tokio current-thread async 入口，GUI 复用 Tauri 的 Tokio async runtime；I/O 和等待型工作优先异步，只有测量确认的 CPU 密集工作才考虑受控多线程边界。同步阻塞依赖应替换为异步能力或进入范围/例外确认。core 可以提供 runtime-neutral 的 async API，只有真实业务需要 Tokio 原语时才直接依赖 Tokio；不默认启用 `full` feature。
- 下游依赖在 MSRV、目标平台、最小 feature 与验证约束内优先采用较新稳定版本，并以锁文件保证可复现；版本新不替代兼容与回归验证。
- 下游开发环境把 Rust 作为始终阻断的门禁，Windows 同时检查 MSVC Build Tools；仅 GUI/WEB 把 Node.js 与 pnpm 加入阻断门禁。缺失项从约定官方来源自动安装并复验。
- scaffold 验证结束后，下游删除实例化/初始化能力及模板专用入口，不能继续派生；`AGENTS.md` 永久保留非空 Skills 地图与约束地图。
- 模板及其收费下游采用企业专有商业许可而非开源协议；实例化先原样复制中英文两份许可证，再仅把适用项目名改为目标项目，其他法律条款保持不变并永久保留。
- 项目实例化必须询问完整目标项目目录路径；路径解析后 basename 必须与项目标识一致，目标可以位于 Harness 内或外，但必须不存在或为空，并通过覆盖、递归复制与符号链接安全检查。
- 每个下游项目必须初始化独立 Git 仓库并使用 `main` 初始分支；即使位于父仓库内，Git top-level 也必须是下游项目根。实例化不复制源历史；初始化收尾只创建一个本地基线 commit，随后验证无 remote 且 porcelain 状态为空，不自动 push 或 tag。
- 实例化完整排除 Harness 的 `docs/adr/`、`docs/changelog/`、`docs/product_spec/`、`docs/work_plan/`，不复制索引、日期正文或空占位；对应项目记忆由下游开发流程首次真实使用时创建。
- 项目实例化阶段只要求身份、路径、负责人和目标平台；产品目的、核心输入输出、成功标准和风险可以留待已初始化项目中的 `$define-product` 完善。
- 项目标识使用 ASCII `snake_case`。core 与 CLI/TUI/MCP/GUI/WEB 目录分别派生为 `<项目标识>_core`、`_cli`、`_tui`、`_mcp`、`_gui`、`_web`；根 workspace 只登记实际选择的 adapters。
- 初始化 Skill 携带 macOS/Linux shell 与 Windows PowerShell 门禁脚本；它们验证官方制品、复探安装结果并输出稳定 `gate.*` 状态。
- GUI 无需签名材料即可完成本地构建、测试和启动验证；真实分发渠道需要签名时仍单独阻断发布。
- 初始化把 `/release/` 写入根 `.gitignore`；发布结果收集每次安全清空根 `release/` 历史内容，只保留当前项目、版本、源码 commit 和明确 build run 的最新已完成文件。
- `Draft` 规格下的中性初始化不得推测业务、增加业务能力或作为产品交付证据；它只允许 `scaffold status`，并在 JSON 中返回 `productDefinitionRequired=true`。
- 根 Cargo workspace 统一声明第三方依赖和内部 crate 路径，所有 member 只通过 `workspace = true` 继承。
- 跨平台自动化默认只生成候选产物和证据；正式发布仍需独立授权。
- 目标平台为 Windows、macOS 和 Linux。
- 选择 CLI 时必须遵守统一 JSON 信封、错误结构、输出流和基础退出码契约。
- 最低交付门槛是在当前系统完成编译、非空单元测试、最终产物存在检查和产物启动冒烟测试。
- 单元测试必须覆盖核心成功路径和最高风险失败路径。
- 其他目标平台未实际验证时必须标记为 `Unverified`。
- 模板约束允许有审计记录的例外，记录必须包含理由、风险和恢复标准。
- Product Spec、Product Status、Work Plan 各自按日保存完整当前快照；同日持续整理同一文件，新日从前一份综合重写。
- 每个已确认需求形成当日独立 ADR 条目；同一天共享并持续更新一个日期文件。代码和用户可见变更同步检查设计文档、验证证据与当日 Changelog。
- Agent 可修复原任务范围内的普通失败；高风险、范围变化和最终完成声明由人工审批或复核。
- 最终人工复核必须写入仓库，Agent 不得代替人类签署。
- CLI、TUI、MCP、GUI、WEB 均有独立 adapter Skill；任何一种都不以另一 adapter 为前置条件。
- 初始化会把 superpowers 选择写入 `docs/AGENT_POLICY.md`；关闭后，后续开发不得调用 `superpowers:*` Skills。
- 检查失败或需要人工判断时进入审批与人工复核，修正后重新运行验证循环。
- 模板自身始终保持无具体业务代码。
