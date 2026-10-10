# AGENTS.md

## 项目使命

本仓库是 Agent-first 小工具的无代码 Harness 模板。它只维护跨项目复用的规则、Skills、中性资产与交付工程，不实现任何具体产品；下游可独立选择 CLI、TUI、MCP、GUI，未选择接口时默认 CLI。

GUI 另按根 Cargo metadata 的 `gui-framework` 分派：`tauri`（缺省）走现有 Tauri/React/Mantine Skills，`gpui` 走 `$desktop-add-gpui-adapter` 与 `docs/design_standards/gpui_gui.md`。没有该字段的既有 GUI 按 Tauri 兼容；非 GUI 不写该字段。GPUI 不加载 Tauri 插件、前端、Mantine 列表、打包或初始化 E2E 专属规则。

## 启动门禁

1. 每次开工先读取用户级 `AGENTS.md`，执行其高于项目预设的长期硬规则，再读取本文件；用户长期硬规则或项目策略要求左侧 Task 时，业务阅读、插件探索、分析或设计前先按 `$desktop-manage-user-tasks` 完成真实 ID、精确项目、非 pinned 与工作区绑定。再读取 `docs/AGENT_POLICY.md` 的 YAML frontmatter 与字段语义；只有创建/执行左侧 Task、显式并行、构建或修改持久策略时，才继续读取该文件的对应章节。
2. 当前根同时包含 Harness 专用 `Version.md` 与活动 `.agents/skills/desktop-instantiate-project/SKILL.md` 时，先执行 Harness 源范围门禁：只接受 Harness 自身工程维护，以及创建终端下游所需的固定初始化字段和所选初始化路径精确要求的身份选择。产品目的、业务功能、产品专属 UI/文案/数据、远程地址、凭据、产品构建或发布需求一律不得在当前模板源中接收、分析、记录或实施；混合请求只解析允许的初始化字段，并要求用户完成实例化或切换到已存在终端下游的唯一根目录后重新提出其余内容。
3. 在写入前确认 Git 根、分支和工作区状态，保护用户已有修改；重叠内容无法安全处理时停止。仓库没有声明的命令、能力或验证结果不得虚构。
4. 先判定任务类型，再只读取下表命中的事实来源和 Skill。发现冲突或缺失时才扩大读取；不要为了“完整”加载全部项目记忆、设计标准、发布规则或 Skills。

## 按任务渐进读取

| 当前任务 | 读取内容 | 执行入口 |
|---|---|---|
| Harness 文档、规则、脚本或 Skill 维护 | `docs/ENGINEERING_RULES.md`；再读本次直接影响的事实源、脚本和测试 | `$desktop-implement-change`；行为保持的结构清理同时使用 `$desktop-refactor-code` |
| 创建新下游 | `README.md`、`$desktop-instantiate-project` 及其表单引用；由该 Skill 继续加载初始化所需资料 | `$desktop-instantiate-project` |
| 定义或改变产品目标、边界、约束、成功标准 | `docs/product_spec/README.md` 与最新 Product Spec；必要时读最新 ADR | `$desktop-define-product` |
| 范围清楚的日常实现、问题修复或用户可感知优化 | `docs/ENGINEERING_RULES.md`、所选接口事实；已初始化下游再读取版本门禁 | `$desktop-implement-change`、`$desktop-manage-version` |
| 新功能、Bug 修复、推送或发布的 Git 生命周期 | `docs/AGENT_POLICY.md` 的“开发分支与主分支发布生命周期”；发布时再读 `docs/RELEASE.md` | `$desktop-manage-git-lifecycle`；日常实现仍走 `$desktop-implement-change` |
| 切换未来发布后动作 | `docs/AGENT_POLICY.md` 的“初始化与持久化”和发布后动作字段；已有发布事实只读 | `$desktop-switch-post-release-action` |
| 依赖变更、core 边界专项审查或更新日志预览 | 精确命中的 Rust/工程/发布事实 | `$desktop-manage-dependencies`、`$desktop-review-core-boundaries` 或只读 `$desktop-inspect-release-notes` |
| GUI 远程更新、统计或 GPUI 自启 | 已批准产品能力、框架与受保护 profile | Tauri 按需 `$desktop-enable-gui-updates` / `$desktop-add-gui-telemetry`；GPUI 自启用 `$desktop-add-gpui-autostart`，初始化验收用 `$desktop-test-gpui-initialization-e2e` |
| 文件读写或外部程序能力 | 已批准范围、相关 Rust/接口事实 | `$desktop-add-file-operations` 或 `$desktop-add-external-process`，返回同一实施流程 |
| 永久 Agent 能力偏好变更 | Agent Policy 字段语义与初始化后变更规则 | `$desktop-configure-agent-policy`；发布后动作仍用专用 Skill |
| CLI 或 Rust core/adapter | `docs/CLI_CONTRACT.md`（仅 CLI）、`docs/RUST_CLI_TEMPLATE.md` | 对应 adapter Skill；实现仍走 `$desktop-implement-change` |
| GUI 展示、交互、初始化或桌面能力 | `docs/design_standards/README.md` 后只读精确命中的标准；再读 `docs/RUST_CLI_TEMPLATE.md`、存在时的 `docs/GUI_APP_PROFILE.md`；Tauri/Mantine 列表页、数据表格、后台列表、搜索结果页及已有列表审查另读 `$mantine-list-view` | 按 `gui-framework` 选择 GUI Skill（`gpui` 另读 `$desktop-add-gpui-adapter` 的 `references/native-capabilities.md` 与 `dependency-baseline.md`）；Tauri/Mantine 列表任务即使未明说表格也必须使用 `$mantine-list-view`；不得一次加载全部 GUI Skills |
| 创建或检查左侧 user-owned Task | `docs/AGENT_POLICY.md` 的“用户可见 Task 开关、粒度与创建门禁” | `$desktop-manage-user-tasks` 与 Codex 项目/Task 工具；`user_owned_tasks` 启用或用户明确要求时调用，Git 按 `task_worktrees` 选择 Worktree/Local，非 Git 使用 Local |
| 当前 Task 内部并行 Worktree/Subagent 或提交 | `docs/AGENT_POLICY.md` 的相关章节；提交时再读提交 Skill 的规范引用 | `$desktop-run-parallel-worktrees`、`$desktop-configure-git-commits`（按触发器） |
| 恢复进度、重要阻断或跨会话交接 | 最新 Product Status；用户要求持久计划或存在活动计划时再读最新 Work Plan | `$desktop-handoff-project`；持久计划另按触发调用 `$desktop-plan-change` |
| Windows Tauri GUI 本地安装试包 | 根 Cargo 持久目标平台/接口事实与本地构建 Skill；不读取发布记录 | `$desktop-build-tauri-local-install`；不得升级成发布候选 |
| 显式构建候选 | `docs/RELEASE.md`、Agent Policy 的构建段和所选构建 Skill；每次构建单独解析 E2E 选择 | `$desktop-build-rust-release`、`$desktop-build-tauri-release` 或 `$desktop-build-gpui-release` |
| 正式发布候选、完整验收、E2E 或历史证据核对 | `docs/RELEASE.md`、`docs/VERIFICATION.md`；活动候选读忽略的 `release/`，仅历史核对读索引的精确证据卷 | `$desktop-prepare-release`、`$desktop-verify-delivery` 或精确命中的测试 Skill |
| 长期决定、硬规则例外或 Harness 记忆治理 | `docs/adr/README.md` 与最新 ADR；只追溯其明确引用的旧事实 | `$desktop-record-adr`；Harness 历史整理使用 `$desktop-curate-harness-memory` |
| 只需理解 Harness 方法论 | `docs/HARNESS_ENGINEERING.md`，再按索引选择一个主题卷 | 不因阅读方法论自动进入计划、构建或验收 |
| 用户要求回顾开发沿革、决策变化或未来方向 | 当前项目对应记忆索引与最新文件；有 Git 时按范围查旧历史 | `$desktop-summarize-development-history`（只读） |
| 升级已初始化下游的 Harness 工程层 | 下游当前事实、源 Harness 版本与 `$desktop-upgrade-harness` 指定资料 | `$desktop-upgrade-harness`，默认先预览 |

## 始终生效的边界

- `superpowers: disabled` 时不得调用或遵循任何 `superpowers:*` Skill；其他持久能力只表示允许，不能替代当前任务的触发条件或授权。
- 日常开发直接实施，只增加并运行本次需要的相关非空单元/回归测试；纯文档、元数据或机械变更只做解析或差异完整性所需的最小检查。不得因任务复杂、多模块或 Agent 偏好自动增加持久计划、全仓检查、构建、冒烟、E2E、Verification 或人工复核。
- 除非用户明确说当前 Task 内部步骤、plan 或 Subagent，Task 一律指 Codex 左侧 user-owned Task；内部 plan、Subagent、Worktree、brief、report、review 和 checkpoint 不占用 Task 序号。用户可见 Task 使用 `Task {序号} | {当前进度} | {单一结果}`；同一 `hostId` 与精确 `projectId` 先用 `list_threads(limit=50)` 和同宿主逐页 `list_archived_threads` 清点当前与归档有效标题，再从最大有效序号继续递增，空历史才用 1、缺号不回填。进度只取 `已分配`、`运行中`、`检查中`、`已完成`，每次真实转换至多更新一次并按真实 `threadId` 用 `list_threads` 有界复读；失败必须报告但不阻断已经完成的任务结果，也不得虚写 `已完成`。
- 无更高优先级用户硬规则时，`user_owned_tasks: disabled` 时不得自动创建或拆分左侧 Task，但仍响应用户明确创建请求；`enabled` 时结果边界变化前自动创建。一个 Task 固定一个可验收结果、范围、禁止范围、完成条件和所选执行环境；交付物类型、生命周期阶段、外部副作用、禁止范围或验收责任变化都必须拆新 Task，证明同一结果的测试/review/checkpoint 和必要同范围修复不拆。每项目同一时间只允许一个写入型 active Task，Task0 只能协调；用户要求阶段隔离时，调研分析、方案设计、编码实现、正式测试验收、安装发布及独立推送分别建 Task，开发回归不能代替正式验收。任何创建先以 `list_projects` 核对项目路径和 Git 状态；Git 按有效 `task_worktrees` 选择 Worktree/Local，非 Git 使用 Local，并在真实 `threadId` 到手后用 `list_threads` 核对标题、`projectId`、cwd、状态、干净工作区和起始提交，否则保持零实现且不创建替代 Task。
- 安全/隐私、数据迁移、破坏性操作、生产/付费/凭据副作用、对外兼容契约、渠道硬要求、签名、发布和跨平台最终候选必须进入对应专用门禁；精简上下文不降低授权、失败关闭或真正不可逆交付所需的人工签署。非必要语义审查不得混入日常开发，明确发布时才按当次 `reviewSelection` 询问并执行。
- 规格不明确且不同答案会改变产品边界时停止并确认；普通实现细节不新增范围会议。模板硬规则确需例外时，按 `docs/ENGINEERING_RULES.md` 写入当日 ADR 后再继续。
- Core-first 是硬规则：接口/宿主无关的业务规则、值域、跨字段关系、状态转换与稳定错误属于 core；CLI/TUI/MCP/GUI 是薄层，薄层按职责判断。详细归属、依赖、异步、日志、GUI 交互和测试规则只在相关任务中读取 `docs/ENGINEERING_RULES.md` 与 `docs/RUST_CLI_TEMPLATE.md`。
- 已初始化下游的版本只通过 `$desktop-manage-version` 管理；根 `Cargo.toml` 是当前版本事实源，`.harness/version-state.json` 是受保护的周期/去重状态。分类（`feature`/`bug-fix`/`record-reconciliation`）、周期、`0..99` base-100 进位、Major 上限与含 `100` 值失败关闭的规则，唯一来源是 `docs/RELEASE.md` 与该 Skill。Harness 自身版本只取 `Version.md`，仅在正式发布时按上海时区 `YYYYMMDDHHMM` 确定；`Released` 只由登记分支合并后的默认主分支与本地 tag 精确复核判定。
- Harness 源与终端下游的新功能或独立 Bug 修复在写入前通过 `$desktop-manage-git-lifecycle` 自动创建并切换到独立 `feature-{ascii-kebab摘要}-{YYYYMMDD}` 分支。用户明确说“发布”时，受管流程复核并提交本次范围，把登记分支普通合并到本地默认主分支并创建复读 `v{版本}-{YYYYMMDD}`，即完成 Git 发布；`release` 必须传已跟踪发布上下文的 `--release-context-sha256 <sha256>`，不 fetch、push、打包或删除登记资源。下游在发布开始时冻结已确认的 `post_release_action` 并按快照执行；Harness 源的后续归档或推送由用户当次决定。`push_release_branch` 的路径、字段语义与“不设保护分支/线性/lease 门禁、不使用大写 `Release`”等负面保证，唯一来源是 `docs/AGENT_POLICY.md` 与该 Skill；后续失败不改变本地 Git 发布事实，流程不创建/配置远端或凭据。
- 对产出物声称“完成”“可用”或“已验证”必须基于真实产物的可观察结果；Mock、stub、源码片段、占位页面、中性 scaffold 或开发预览不能冒充候选验收。人工批准也不能把失败或未执行改判为通过。
- Product Spec、ADR、Changelog、Product Status、Work Plan 与 Verification 只由各自独立事件触发；Git 发布事实由本地主分支与 tag 复核，候选构建/E2E/验收/就绪复核只写忽略的 `release/` 原子证据，渠道分发或回顾审计各按独立事件写适用 tracked 记录。普通维护不写占位，范围外问题写入 `docs/TECH_DEBT.md`。
- 仅当前 Harness 上游工程的工程自动化使用 Node.js 标准库 `.mjs` helper，禁止 Python 源码、解释器、包管理器、虚拟环境、第三方包和运行步骤；新增或修改自动化、依赖清单、workflow 或环境门禁时运行 `node .agents/skills/desktop-implement-change/scripts/check_no_python.mjs --root .`。该禁令及检查器不得随创建或升级传播到终端下游；下游按自身需求选择脚本语言，并遵守项目本地显式依赖与不得假设全局第三方包的规则。
- 不覆盖或撤销用户已有修改，不为假想未来增加抽象、接口或依赖；跨平台实现不得默认单一 Shell、路径分隔符、权限模型或宿主能力。

## Skills 地图

项目 Skills 位于 `.agents/skills/`。先用任务路由选择最小集合；命中后必须完整读取对应 `SKILL.md` 及其要求的精确引用，不得预先加载同类全部 Skills。下游裁剪可以删除不适用条目，但必须让本节与实际保留的 Skills 一致。

- 初始化与接口：`$desktop-instantiate-project`、`$desktop-initialize-rust-project`、`$desktop-check-development-environment`、`$desktop-add-cli-adapter`、`$desktop-add-file-operations`、`$desktop-add-external-process`、`$desktop-add-tui-adapter`、`$desktop-add-mcp-adapter`、`$desktop-add-gui-adapter`、`$desktop-add-gpui-adapter`、`$desktop-enable-gui-updates`、`$desktop-add-gui-telemetry`、`$desktop-add-gpui-autostart`、`$mantine-list-view`、`$desktop-add-gui-system-locale`、`$desktop-add-gui-updater`、`$desktop-add-gui-window-state`、`$desktop-add-gui-dialog`、`$desktop-add-gui-system-tray`、`$desktop-add-gui-single-instance`、`$desktop-add-gui-deep-link`、`$desktop-add-gui-global-shortcut`、`$desktop-add-gui-system-notifications`、`$desktop-add-gui-autostart`、`$desktop-prepare-gui-app-identity`、`$desktop-prepare-gui-support-surfaces`、`$desktop-rename-project-identity`、`$desktop-extract-i18n-strings`。
- 开发与治理：`$desktop-manage-dependencies`、`$desktop-review-core-boundaries`、`$desktop-record-adr`、`$desktop-handoff-project`、`$desktop-inspect-release-notes`、`$desktop-define-product`、`$desktop-plan-change`、`$desktop-implement-change`、`$desktop-refactor-code`、`$desktop-manage-version`、`$desktop-manage-git-lifecycle`、`$desktop-switch-post-release-action`、`$desktop-manage-user-tasks`、`$desktop-manage-task-worktrees`、`$desktop-configure-agent-policy`、`$desktop-configure-git-commits`、`$desktop-run-parallel-worktrees`、`$desktop-summarize-development-history`、`$desktop-curate-harness-memory`、`$desktop-upgrade-harness`。
- 构建与验收：`$desktop-test-gpui-initialization-e2e`、`$desktop-build-tauri-local-install`、`$desktop-prepare-release`、`$desktop-build-rust-release`、`$desktop-build-tauri-release`、`$desktop-build-gpui-release`、`$desktop-prepare-cross-platform-release`、`$desktop-collect-release-artifacts`、`$desktop-test-gui-initialization-e2e`、`$desktop-test-final-artifact-e2e`、`$desktop-verify-delivery`。

## 约束地图

| 约束或事实 | 唯一来源 | 何时读取 |
|---|---|---|
| 产品目标、范围与成功标准 | `docs/product_spec/README.md` 与最新 Product Spec | 定义产品或改变边界 |
| Agent 能力、用户可见 Task 开关/标题/创建门禁、E2E 建议默认值与发布后动作 | `docs/AGENT_POLICY.md` | 启动时读策略头与字段语义；相关任务再读对应章节 |
| 文件、注释、文档、测试、记忆触发与例外 | `docs/ENGINEERING_RULES.md` | 代码、测试、文档、规则或 Skill 变更 |
| Rust core、adapter、MSRV、依赖与运行时 | `docs/RUST_CLI_TEMPLATE.md` | Rust 或接口实现/初始化 |
| 下游目标平台与接口组合 | 根 `Cargo.toml` 的 `[workspace.metadata.agent-first-harness]` | 初始化、构建或跨宿主判断 |
| CLI 机器接口 | `docs/CLI_CONTRACT.md` | 仅选择或修改 CLI 时 |
| UI 匹配、布局、组件语义与密度 | `docs/design_standards/README.md` 及精确命中标准 | GUI 展示、交互或初始化 |
| 当前进度与下一步 | `docs/project_status/README.md` 与最新 Product Status | 恢复、阻断、交接、发布/验收或用户要求 |
| 当前持久实施步骤 | `docs/work_plan/README.md` 与最新 Work Plan | 用户要求、活动计划、交接或高风险协调 |
| 长期决定与硬规则例外 | `docs/adr/README.md` 与最新 ADR | 相关决定或例外 |
| 构建、版本与发布 | `docs/RELEASE.md`；Harness 当前版本另取 `Version.md` | 显式构建或发布 |
| 验证方式、候选证据与人工复核 | `docs/VERIFICATION.md`；活动候选读 `release/`，已发布/回顾性事实才读精确证据卷 | E2E、完整验收、发布或审计 |
| Git 安装、local 身份、模板与提交消息 | `$desktop-check-development-environment`、`$desktop-configure-git-commits` 及其引用 | 环境失败恢复、初始化门禁或实际提交 |
| 开发分支、主分支推送、版本 tag、发布后 `release` 分支与已登记资源保留 | `docs/AGENT_POLICY.md`、Git common-dir 生命周期清单、`$desktop-manage-git-lifecycle` | 新功能/Bug 修复、用户明确推送或发布 |
| 已知限制与技术债 | `docs/TECH_DEBT.md` | 发现范围外问题或复核既有限制 |
| 下游 Harness 来源与升级 | `.harness/upstream-lock.json`、`$desktop-upgrade-harness` | 仅升级下游工程层 |
| 商业许可 | `LICENSE.zh-CN.md`、`LICENSE.en.md` | 实例化、身份改名、分发或许可任务 |

事实源冲突时先调查并修正，不自行选择更方便的说法。完成初始化的下游必须删除实例化/初始化专用入口并不得继续派生项目，同时保留仍适用的 Skills 地图、约束地图、`$desktop-upgrade-harness`、版本门禁和受保护状态入口。

## 每次任务的最小闭环

1. 判定仓库边界和任务类型，只读取路由命中的最少事实与 Skills。
2. 在授权范围内实施，保护既有修改，只运行本次变化需要的测试或最小替代检查。
3. 只更新被独立事件触发的权威记录；失败在当前范围内修复并重跑，新增副作用或范围变化先请求批准。
4. 完成时报告实际变化、实际验证、未执行项和剩余风险，不把日常实现描述成发布就绪。

Harness 自身的文档、Skill、脚本或候选 workflow 变化运行 `node scripts/validate_harness.mjs`；该日常入口只运行硬门禁。明确发布且当次 `reviewSelection: enabled` 时另运行 `node scripts/validate_harness.mjs --release-review` 收集非阻断语义/重构提示。修改 Node 门禁行为时还运行 `node scripts/run_harness_tests.mjs`。这些检查不替代真实下游构建、E2E、完整验收或真正必需的人工签署。
