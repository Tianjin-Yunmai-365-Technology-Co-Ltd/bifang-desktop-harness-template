# 验证记录

## 验证原则

- 只记录真实执行的命令、环境、结果和未覆盖范围。
- Todo 开发轮次记录非空单元/回归测试和变更相关验证；任一 Todo 非 `done` 时持续实现，不进入验证里程碑，不运行冒烟/E2E，也不产生已验收结论。
- 只有当前批次 Todo 全部 `done` 后，才能对绑定批准场景、源码提交、运行环境和可观察结果的完整真实产物执行验证里程碑。源码片段、模拟实现、桩实现、占位、中性脚手架、开发预览和仅内部函数证据不具备验收资格。
- 验证里程碑按 `docs/AGENT_POLICY.md` 的持久 `milestone_smoke`/`milestone_e2e`、产品/渠道硬要求和实际适用性决定冒烟/E2E。产品定义、计划、Todo 编码、普通静态复核、常规构建、制品收集和发布元数据流程不得运行二者。
- 必需门禁或已启用的冒烟/E2E 失败、超时、取消或未执行时拒绝里程碑，保存证据，重开或新增具体 Todo 并返回编码修复；只有全部 Todo 再次 `done` 才能重跑完整里程碑。
- Harness 根目录没有具体下游产品；维护里程碑验收的是可执行治理闭环、校验器和维护脚本，不把随附的中性资产当作产品里程碑。真实下游产品与未运行平台按事实标为 `Unverified`。
- 零测试不构成通过；测试必须覆盖核心成功路径和最高风险失败路径。
- 只对真实运行的系统和工具链给出通过结论；其他平台与宿主标记为 `Unverified`。
- 人工批准不能把失败或未执行的检查改判为通过；Agent 不代替人类签署最终复核。

## 模板验证矩阵

| 层级 | 方法 | 当前要求 |
|---|---|---|
| 文件与链接 | `python3 scripts/validate_harness.py` | 43 个必需固定入口、五类日期记忆正文/索引和本地 Markdown 链接完整 |
| Skills | 校验器 + Skill Creator 校验 + 逐份语义审查 | 20 个 Skills、UI 元数据、参考资料、脚本和资产与事实源一致；独立 WEB Skill 不得存在，`$upgrade-harness` 必须存在并保留 |
| 持久 Agent 策略 | 模式定义正负向单元测试 + 初始化契约 | Superpowers、Worktree/Subagent、里程碑冒烟/E2E 一次写入；下游基线不得残留 `pending`；后续先复用、再判断、最后询问 |
| Todo 与里程碑 | 工作计划结构门禁 + 状态正负向单元测试 | Todo 有稳定 ID/状态，任一非 `done` 项禁止进入 `accepted` 里程碑；失败重开 Todo 返回实现 |
| 并行协作 | Worktree 助手 10 个隔离单元测试 + 校验器契约检查 | 持久策略启用且至少两个独立写入范围时自主采用；否则单 Agent；独立 Worktree/分支、写入目标门禁、前台状态、同步等待与保守清理 |
| Harness 版本 | 校验器正向与非法日期负向测试 | `Version.md` 的当前版本是上海时区合法 `YYYYMMDDHHMM`，当前摘要一致且下游 SemVer 不受污染 |
| 当前描述 | 校验器正向与隔离负向注入 | 已替代的接口、Git、目录、命名和前端默认不得回归 |
| 开发环境门禁 | Python 12 个隔离测试 + Shell/PowerShell 静态或原生检查 | 仅 Rust 与 GUI 条件下的 Rust/Node.js/pnpm/MSVC 状态、安装、校验和失败退出可审计；始终拒绝 WEB 参数 |
| Harness 升级 | 真实 CLI + 27 个基于隔离 Git 测试夹具的单元测试 | `plan`/`apply`/`record`、三方比较、引导、来源与控制状态绑定、权限、`protected`/`tombstone`；遇到符号链接与碰撞时默认拒绝，真实下游仍需前向证据 |
| Rust 资产 | 精确 Rust 1.90 | 仅在对应 Todo/里程碑或发布范围需要时执行 fmt、锁定依赖检查、Clippy、非空测试与构建；冒烟/E2E 仍只属于验证里程碑 |
| 发布刷新 | 辅助程序 7 个用例 + 发布校验器 6 个正负向测试 | 独立 Git 根、原子隔离旧目录、符号链接/重解析点、不跟随清理、精确 `/release/` 与 `/.release-clean.*` 忽略规则、默认矩阵和回退边界；无 `pwsh` 时 Windows 运行用例明确跳过 |
| 里程碑运行验收 | 持久策略/硬要求解析 + 真实产物场景证据 | 只在 Todo 全部完成后考虑冒烟/E2E；失败、超时、取消或已选未执行会拒绝里程碑并回编码 |
| 工作流资产 | 全文件 SHA-256 + 独立 YAML 解析 + 步骤/输入/门禁契约 | 只生成三平台 `milestoneAcceptance: pending` 候选；绑定批准源码提交，使用不可变 Action 提交，依次刷新、非空测试/构建、条件签名、暂存区打包/清单、目录级原子提交和精确上传，禁止冒烟、E2E、发布和写权限提升 |
| 人工语义 | 文档与 Skill 契约矩阵 | 适用性、边界、状态和剩余风险无相互冲突的当前硬规则 |

## 2026-08-03 构建 Skill 默认三平台、条件签名与根发布刷新

### 范围、环境与授权边界

- 当前宿主：macOS 26.5.2（构建 25F84），arm64；Git 顶层目录为 Harness 根，分支为 `master`，开发基线提交为 `3f8f2895cc48529ce9b62133be73ebe8de3b9c31`。本轮保护既有工作树，没有执行 `git reset`、`git stash`，也没有覆盖不相关修改。
- 用户批准的是构建 Skill 行为：条件具备时尝试签名、默认全平台且前置条件不足时回退当前平台、构建前清理并把结果放入根 `release/`，初始化时忽略该目录。本轮不授权创建/读取真实签名凭据、触发远端矩阵、创建标签、发布或正式上传。
- 当前统一构建模型只覆盖 Rust CLI；TUI/MCP/GUI 仍按适配器特有规则处理。Harness 源的并行、冒烟和 E2E 策略仍等待未来下游初始化，本轮使用当前工作树实现并以只读 Subagent 做文档、差异和安全审计。

### Todo 开发检查与失败修复

- `python3 -B .agents/skills/build-rust-release/scripts/test_prepare_release_directory.py -v`：7 个用例中当前可执行的 4 个通过；覆盖普通/隐藏/嵌套/子级符号链接清理、根 `release` 符号链接拒绝、非独立 Git 根拒绝和 PowerShell 高风险静态门禁。当前宿主没有 `pwsh`，PowerShell 普通清理、根重解析点和非 Git 根 3 个真实运行用例为 `skipped`，不据此推断 Windows 通过。
- 安全审计指出旧辅助程序在校验后原地递归删除存在并发替换窗口。实现改为把旧 `release/` 原子重命名到同文件系统唯一隔离目录、创建并复核全新空目录，再以不跟随重解析点的方式清理隔离树；候选目录级提交前后都复核活动目录不是符号链接/重解析点。
- 工作流安全审计指出原实现从目录中猜测归档并上传整个 `release/`，还未显式绑定审批源码；第二轮又指出校验后直接向 `release/` 写归档仍有并发替换窗口。修复后必填 40 位 `source_commit`，检出使用该提交、`fetch-depth: 1`、`persist-credentials: false` 并复核 `HEAD`；归档/校验和/清单在同根唯一暂存区中形成精确普通文件集，再通过不跟随链接的目录级原子重命名，将完整暂存区提交为 `release/`，上传也只列出这三个路径。
- 签名审计指出状态字符串不足以满足后续验证契约。清单现同时记录 `signingStatus`、`signingReason` 与结构化 `signingEvidence`；默认原地钩子成功记录 `configured-hook-verify-exit-0` 和空 `detachedFiles`，`unsigned` 记录验证不适用。签名或验证失败仍直接失败，不降级。
- `python3 -B -m unittest scripts.test_validate_harness.ValidateHarnessWorkflowTests -v`：22 个工作流正负向/真实文件测试通过，覆盖 Python 3 运行时选择、三平台 `fail-fast: false`、源码固定、刷新/原子候选提交顺序、条件签名/证据、签名失败不吞掉、精确制品集合、`pending` 清单、上传成功条件门禁、不可变 Action 和禁止运行产物/E2E。新增真实脚本用例首次因当前宿主没有 `python` 命令而失败；工作流随后增加 `python3` 优先、`python` 回退的显式选择，成功三件套与额外文件拒绝场景重跑通过。
- `python3 -B -m unittest scripts.test_release_validation -v`：6 个发布校验器测试通过，覆盖 `/release/` 与 `/.release-clean.*` 各精确一次、重复/过宽忽略规则拒绝、默认三平台路由和矩阵启动后失败不回退。
- `python3 -B -m unittest scripts.test_validate_harness scripts.test_release_validation -v`：最终 48 个测试全部通过。首次较早完整回归因校验器仍检查被新原子刷新措辞替代的旧短语而失败；最终 48 项首次运行又因跨平台 Skill 重写后校验器仍保留旧的 `Upload those three explicit paths` 字面量而出现 47/48，通过把门禁更新为当前精确三件套契约后重跑 48/48。两次均保留失败、修正规则并完整重跑，没有把失败改判为通过。
- `python3 -B scripts/validate_harness.py`：通过，检查 43 个必需文件、20 个 Skills、本地 Markdown 链接、五类日期记忆和全部当前门禁。7 个非阻断软审查提示涉及本验证文档、升级器模块/测试、治理、初始化与校验器测试，未发现本轮新增的职责硬失败。
- Skill Creator 虚拟环境的 `quick_validate.py` 对 `.agents/skills/*` 全量检查：20 个项目 Skills 全部通过。首次用系统 Python 运行校验器因缺少 PyYAML 非零退出，改用现有 Skill Creator 虚拟环境后成功；失败调用未写入文件。
- `/Users/manonloki/.codex/venvs/skill-creator/bin/python` 的 `yaml.safe_load` 解析候选工作流：通过；`sh -n` 检查 POSIX 辅助程序：通过；变更 Python 使用任务专用 `PYTHONPYCACHEPREFIX` 的 `py_compile`：通过；`git diff --check`：通过。当前宿主没有 `actionlint`，因此其原生检查为 `Not run`。
- 候选工作流最终 SHA-256 为 `3be180561e4d2addd7cf075ee61b6a1bc2749a67b7df9bd49dddb33042cad977`；检出 Action 固定 `11d5960a326750d5838078e36cf38b85af677262`，制品上传 Action 固定 `ea165f8d65b6e75b540449e92b4886f43607fa02`。

### 前向行为推演与结论边界

- 三个独立只读前向场景已复核：派发前提供方不可用时选择 macOS 回退并把 Windows/Linux 标为 `Unverified`；矩阵启动后 Windows 失败时整体失败且不合并 macOS/Linux 部分结果；签名探测就绪后签名返回非零时平台失败、目录保持空且不生成候选清单/校验和。三者均符合新契约，但不是实际提供方或签名工具运行证据。
- Todo 开发阶段没有运行产品冒烟或 Computer Use E2E。本任务不产生可交互最终产品，且当前尚无绑定本轮完整变更的源码提交，因此没有进入 M1 里程碑验收，也没有记录 `Milestone accepted`。
- 未运行真实 Rust 发布构建、GitHub Windows/macOS/Linux 运行器、提供方制品取回、PowerShell 辅助程序、真实签名钩子/凭据、签名后平台验证、公证、创建标签、发布或上传。Windows/Linux、真实三平台、签名成功/失败通路和 TUI/MCP/GUI 构建均为 `Unverified`。
- 人工最终复核：`Awaiting human review`。Agent 自动检查与当前实现完成不代替项目负责人签署。

## 2026-08-03 Docs 与 Skills 中文化

### 范围与词元边界

- `docs/` 与 `.agents/skills/` 中面向读者或 Agent 的英文自然语言已翻译为中文，包括标题、说明、参考资料、Skill 界面元数据、工作流展示标签、脚本诊断和中性 Rust 资产展示文本。
- 命令、代码、路径、文件名、配置键、协议字段、枚举、固定状态值、测试标识符、版本、摘要、第三方产品名和技术缩写保持精确原值；这些受保护词元不是遗漏翻译。
- 两轮独立只读语义审计均未发现仍可翻译的完整英文自然语言。审计同时修正了“模式定义”、规范化路径、目录级原子重命名、语义化版本规范等中文表述，避免本地化削弱原契约。

### 自动检查证据

- `python3 -B -m unittest scripts.test_validate_harness scripts.test_release_validation -v`：50/50 通过，覆盖持久策略、Todo/里程碑、升级器、发布目录和候选工作流的正负向契约。
- Skill Creator 虚拟环境的 `quick_validate.py` 对 `.agents/skills/*` 全量执行：20 个项目 Skills 全部通过。
- 五组 Skill 辅助程序回归：身份改名 4/4、开发环境 12/12、Harness 升级 27/27、并行 Worktree 10/10、发布目录当前可运行用例 4/4 通过；发布目录另有 3 个 PowerShell 原生用例因当前 macOS 没有 `pwsh` 明确跳过。
- 随附的核心+CLI 资产使用精确 Rust 1.90.0 完成格式检查、锁定依赖工作区检查、Clippy `-D warnings`、非空测试枚举、锁定依赖测试和锁定依赖发布配置构建；实际执行 CLI 黑盒 6 个、核心 1 个测试，共 7/7 通过。
- 23 个 Python 文件通过内存语法编译；21 个 YAML 文件解析通过；全部项目 Skill POSIX Shell 文件通过 `sh -n`；两份 PowerShell 文件保留 UTF-8 BOM；`git diff --check` 通过。
- `python3 -B scripts/validate_harness.py`：通过，检查 43 个必需文件、20 个 Skills、本地 Markdown 链接、五类日期项目记忆及全部当前门禁；8 个提示均为非阻断文件拆分审查。
- 候选工作流当前 SHA-256 为 `64eeaf240ff2403ffe5efee156a59a65c744f2480287b0cfa320b25b66501b50`。

### 结论与未运行范围

- 自动技术结论：`Passed`；M2 当前为 `Awaiting human review`，Agent 不代替项目负责人签署翻译质量的人工最终复核。
- 本次表达层变更不产生可交互产品产物，里程碑冒烟与 E2E 均为 `Not applicable`，未运行。没有触发真实 Windows/macOS/Linux 远端矩阵、真实 PowerShell、签名、公证、标签、正式发布或上传。
- Windows PowerShell 原生运行仍为 `Unverified`；固定英文机器词元继续存在是维护可执行性和历史事实精确性的必要边界，不应机械替换。

## 2026-07-31 Todo/里程碑闭环、持久策略与 Harness 升级能力

### 范围、候选与环境

- 当前宿主：macOS 26.5.2（构建 25F84），arm64；Git 顶层目录为 Harness 根，分支为 `master`。当前工作树同时包含 2026-07-30 独立 WEB 移除与 GUI/环境门禁调整，以及 2026-07-31 的治理、策略、升级器和校验器变更；本轮基于现状继续，没有重置、执行 `git stash` 或覆盖既有修改。
- Harness 源的四项策略保持 `pending`，因为它们只等待未来下游初始化一次确认；本次不把 Harness 源误当成已初始化下游，也不重复询问逐任务策略。现有脏基线不能安全拆为继承精确状态的独立写入 Worktree，因此当前工作树串行实施，三个只读 Subagent 分别审计文档、升级器和校验器。
- 验证对象是完整 Harness 维护候选：统一 Todo/里程碑规则、可解析 Agent 策略、全部相关 Skills、真实 `$upgrade-harness` CLI、生产所有权/锁协议、候选工作流与完整校验器。它不是具体下游产品，不以随附的脚手架、模拟实现或 Markdown 声明单独作为验收产物。

### Todo 开发检查与失败修复

- `python3 -B .agents/skills/upgrade-harness/scripts/test_harness_upgrade.py -v`：最终 27 个隔离 Git 测试夹具全部通过。测试通过子进程实际调用 `plan`、`apply`、`record`，覆盖上游单改、本地保留、双方冲突、引导、人工新增/合并、删除、来源/目标 Git 漂移、控制文件漂移、权限模式、保护清单弱化、符号链接/空目录 `tombstone`、全量预检与自更新顺序。
- 特殊权限新用例首次使用 setuid 位时，macOS 文件系统清除了该位，测试没有实际触发生产门禁；改用可观察 sticky 位并增加文件系统能力判断后，针对性重跑与最终 27/27 均通过。该失败属于夹具可观察性，不是把失败门禁改判为通过。
- `python3 -B -m unittest scripts.test_validate_harness -v`：34 个正负向测试全部通过。新增覆盖无效/占位策略确认元数据、重复或缺字段 Todo、未完成 Todo 伪验收、注释伪装命令/门禁、额外工作流输入与步骤、非法 YAML、可变 Action 标签、`accepted` 清单和弱化升级所有权。
- `python3 -B .agents/skills/check-development-environment/scripts/test_development_environment_gates.py -v`：12 个测试通过；仅 Rust、GUI 条件 Node.js/pnpm、校验失败、Windows 静态契约和已移除 WEB 参数保持有效。
- `python3 -B .agents/skills/run-parallel-worktrees/scripts/test_parallel_worktrees.py -v`：10 个测试通过；`python3 -B .agents/skills/rename-project-identity/scripts/test_rename_project_identity.py -v`：4 个测试通过。
- `$upgrade-harness` 生产实现按职责拆为入口、核心、变更和策略模块，分别为 96、760、558、69 行，均未超过 800 行硬阈值；测试夹具 753 行。校验器的升级领域独立检查生产语法、清单最低保护与 `managed-self` 规则顺序。
- 候选工作流全文件 SHA-256 固定为 `8457d75d6e1f3664ab6d5e1cadf81c6dadceed0a630688f685a86c5554213a39`；检出 Action 固定到 `11d5960a326750d5838078e36cf38b85af677262`，制品上传 Action 固定到 `ea165f8d65b6e75b540449e92b4886f43607fa02`。校验器在解析 YAML 后校验精确输入、步骤、顺序、门禁、权限和 `pending` 清单，不能由注释或附加运行步骤绕过。
- Skill Creator 虚拟环境的 `quick_validate.py` 对 `.agents/skills/*` 全量运行：20 个项目 Skills 全部通过。系统 Python 不作为本轮结构结论来源。
- 对 `scripts/` 与 `.agents/skills/` 下 20 个 Python 文件使用无字节码 `compile(..., "exec")`：通过；Ruby `YAML.safe_load` 解析候选工作流：通过；全部 POSIX `.sh` 执行 `sh -n`：通过。
- 当前宿主没有 `pwsh`，所以 PowerShell 原生解析为 `Not run`；开发环境 12 个测试中的 Windows 静态契约仍通过，但不能替代真实 Windows 运行。
- `python3 -B scripts/validate_harness.py`：通过，检查 38 个必需文件、20 个 Skills、本地 Markdown 链接、五类日期记忆和全部当前门禁。7 个非阻断职责审查提示涉及验证记录、升级器核心/变更/测试、治理、初始化和校验器测试；生产模块均低于 800 行硬阈值，集中测试/证据文档当前也没有新的独立职责要求拆分。
- `git diff --check`：通过；候选工作流实测 SHA-256 与受审常量一致。提交前状态只包含本轮与上一批已记录变更，没有生成缓存、构建产物、发布、标签或外部制品。

### M1 入口与未运行范围

- TODO-A01 至 TODO-D03 已全部完成；开发阶段只运行非空单元/回归、结构、语法、静态与契约检查，没有运行冒烟或 E2E。
- 首次源码候选提交为 `d9e7e81bbb9c77ce7542902010c54f413f836faa`。提交后确认工作树为空，并在该精确提交上重新执行升级器 27 个、校验器 34 个、环境 12 个、Worktree 辅助程序 10 个、身份改名 4 个测试，以及 20 个 Skills、20 个 Python 文件、完整 Harness 校验器、工作流 YAML、全部 POSIX Shell、`git diff --check` 和干净工作树门禁；全部通过。
- 与提交绑定的 M1 自动技术结论：`Technically accepted`。候选包含真实维护 CLI 与实际通过子进程调用 `plan`/`apply`/`record` 的场景，不以模拟实现、内部函数调用或中性脚手架代替；如果后续生产逻辑变化，必须建立新候选并重新执行完整 M1。
- M1 的交付物是维护 CLI、校验器、Skills 和可执行治理规则，不存在需要启动交互的 GUI/TUI/MCP/CLI 产品最终产物；`milestone_smoke` 与 Computer Use E2E 在进入里程碑后判定为 `Not applicable`，记录为 `Not run`。27 个真实子进程 CLI 测试夹具是维护场景功能证据，不被改名为冒烟或 E2E。
- PowerShell 可执行文件在当前 macOS 宿主不可用，原生 PowerShell 检查为 `Not run`；Windows 行为仅有 Python 回归和脚本文本契约。Windows/Linux、真实 GitHub 运行器、真实客户下游、非 CLI 适配器、Tauri 构建与长期升级仍为 `Unverified`。
- 没有执行 Rust 发布构建、跨平台候选运行、`ready` 制品收集、签名、创建标签、发布或上传。用户授权提交和推送当前源码，不等于人工最终复核或正式发布授权。
- 人工最终复核：`Awaiting human review`。项目负责人尚未为本里程碑明确签署复核人、日期和结论，Agent 不代签。

## 2026-07-30 移除独立 WEB 并保留 Tauri GUI Web 技术栈

### 范围与环境

- 当前宿主：macOS，arm64；Git 顶层目录为 Harness 根，分支为 `master`。编码前已询问本任务是否启用并行 Worktree + Subagent，未收到授权，因此按规则使用单 Agent 当前工作树流程。
- 当前接口集合从 CLI/TUI/MCP/GUI/WEB 收缩为 CLI/TUI/MCP/GUI；删除独立 `$add-web-adapter`、`_web` 命名、初始化分派、环境触发和发布/E2E入口。
- Tauri GUI 保留 React、TypeScript、Mantine UI、TanStack Router、TanStack Query、Jotai、pnpm、锁文件、Node/WebView 兼容、CSP/能力最小化、非空测试和生产构建契约；原共享 React 基线已迁入 GUI Skill 自有参考资料。

### 已执行检查与失败修复

- `python3 .agents/skills/check-development-environment/scripts/test_development_environment_gates.py`：12 个测试全部通过。覆盖仅 Rust、GUI 已有/缺失工具、校验失败、Windows 静态契约，以及已移除 `WEB` 参数返回退出码 2 的最高风险回归。
- `python3 scripts/test_validate_harness.py`：15 个测试全部通过。新增正向场景确认独立 WEB Skill 不存在，同时 GUI 自有基线仍包含固定六项技术栈、`pnpm-lock.yaml` 与 WebView 约束。
- `python3 scripts/validate_harness.py`：通过，检查 31 个必需文件、19 个 Skills、本地 Markdown 链接、五类日期项目记忆、初始化/工程/并行/分层验证/环境/工作区/工作流契约；非阻断提示为 `scripts/harness_validation/initialization.py` 699 行的职责审查，以及更新验证证据后 `docs/VERIFICATION.md` 514 行的文档拆分审查，两者均未超过 800 行原则拆分阈值。
- Skill Creator `quick_validate.py` 首次使用系统 Python 时因缺少 PyYAML 返回 1，未形成 Skill 结构结论；改用现有 `/Users/manonloki/.codex/venvs/skill-creator/bin/python` 后对 `.agents/skills/*` 全量运行，19 个现存 Skills 全部通过。
- `sh -n .agents/skills/check-development-environment/scripts/development-environment-gates.sh`：通过。
- 首次 Python 编译使用默认缓存路径时，沙箱拒绝写入 `.agents/.../__pycache__` 并返回 1；改用 `PYTHONPYCACHEPREFIX=/private/tmp/agent-first-harness-pycache` 后，对校验器入口、领域模块、校验器测试和环境门禁测试执行 `py_compile` 通过。失败属于缓存写入边界，不是源码语法失败。
- 首次完整校验器准确报告删除后的空 WEB Skill 目录、旧 Skill 清单和 GUI 基线文本断言；已删除空目录、更新 Skill 集合/基线路径与断言后重跑通过。

### 开发结论与未运行范围

- 开发证据证明当前可执行入口、Skills、当前事实源和校验器不再支持独立 WEB，同时 Tauri GUI 的固定 Web 前端技术栈与 Node.js/pnpm 门禁仍有直接正向契约与单元测试保护。
- 历史日期产品规格、产品状态、ADR、变更记录和验证记录保留当时支持五接口的真实记录；它们不是当前入口。ADR-20260730-004 与最新产品规格是移除决定的当前事实。
- 本次不是最终产物构建或发布准备；发布构建、最终产物存在性/启动冒烟、Computer Use E2E、真实 Tauri 构建、Windows/Linux 原生脚本、跨平台候选、打包、签名、创建标签和发布均为 `Not run` 或 `Unverified`。
- 本节是 Agent 开发验证记录，不是人工最终复核；项目版本仍为 `202607301002` / `Unreleased`。

## 2026-07-30 Harness 时间版本与仅编码阶段并行规则

### 范围与环境

- 当前宿主：macOS，arm64；Git 顶层目录为 Harness 根，分支为 `master`，变更基于工作树中上一轮尚未提交的协作规则改动继续完成，没有重置、执行 `git stash`、覆盖或拆分用户已有修改。
- 项目负责人在本次会话明确拒绝并行模式，要求今后只在编码时使用 Worktree + Subagent，并批准 Harness 采用 `YYYYMMDDHHMM` 日期时间版本；本次使用单 Agent 当前工作树流程。
- Harness 当前版本确定为上海时区 `202607301002`，`1.0.0` 仅保留为迁移前旧版本标识；下游 Rust 项目继续使用根 `Cargo.toml` 的独立 SemVer。

### 已执行检查

- `PYTHONPYCACHEPREFIX=/private/tmp/codex-harness-version-pycache python3 -m unittest scripts.test_validate_harness`：14 个测试通过；覆盖完整入口、候选工作流、旧全任务并行规则、旧设计阶段并行规则和非法时间版本负向场景。
- `PYTHONPYCACHEPREFIX=/private/tmp/codex-harness-version-pycache python3 -m py_compile scripts/validate_harness.py scripts/harness_validation/*.py scripts/test_validate_harness.py`：通过。
- Skill Creator 现有虚拟环境的 `quick_validate.py` 检查 `.agents/skills/*`：20 个项目 Skills 全部通过。
- `python3 .agents/skills/run-parallel-worktrees/scripts/test_parallel_worktrees.py`：10 个测试通过。
- `python3 .agents/skills/check-development-environment/scripts/test_development_environment_gates.py`：11 个测试通过。
- `python3 .agents/skills/rename-project-identity/scripts/test_rename_project_identity.py`：4 个测试通过。
- `python3 scripts/validate_harness.py`：通过，检查 31 个必需文件、20 个 Skills、本地 Markdown 链接、五类日期项目记忆和全部当前门禁；唯一非阻断提示为 `scripts/harness_validation/initialization.py` 682 行，继续接受 >400 行职责审查。
- `git diff --check`：通过；当前事实源残留扫描只在校验器拒绝列表与负向测试中保留旧规则文字。

### 人工复核与结论

- 复核人：项目负责人（本次会话用户，未提供个人姓名）。
- 复核日期：2026-07-30。
- 复核范围：当前工作树全部变更，包括上一轮协作触发规则、此次仅编码阶段收窄、Harness 时间版本规则、相关 Skills、校验器、项目记忆和验证边界。
- 人工结论：`Approved`。该结论由用户明确表示“所有部分人工审核通过”，本记录仅转录用户结论，不由 Agent 代签。
- 当前范围结论：`Verified`。所有本地必需单元、结构、静态和 Harness 契约检查通过，并已有真实人工批准记录。
- Harness 整体结论：`Partially verified`。Windows/Linux、真实下游、非 CLI 适配器、真实 GitHub 运行器、发布制品和仍开放技术债所需的外部证据不因本次人工批准而自动变为通过。

### 未运行范围

- 本次授权提交并推送当前源码，但没有发起最终产物构建或正式发布准备；发布构建、最终产物存在性/启动冒烟、Computer Use E2E、跨平台候选、打包、产物收集、签名、创建标签和正式发布均为 `Not run`。
- `202607301002` 仍为 `Unreleased`；推送 Git 提交不等于创建标签、发布物或发布版本。

## 2026-07-30 并行协作询问收窄至设计与编码阶段

### 范围与环境

- 当前宿主：macOS，arm64；Git 顶层目录为 Harness 根，分支为 `master`。用户明确拒绝本任务使用并行 Worktree + Subagent，因此全程使用单 Agent 当前工作树流程。
- 本次修改协作政策、相关 Skills、校验器回归和项目记忆，不修改业务代码、随附的 Rust 资产、依赖、接口行为、发布工作流或许可证。
- 触发范围确定为产品/范围设计、实施计划设计和代码/实现变更；纯文档维护、问答、只读调查、验证复核、构建、发布准备、交付工作和即时安全处置不询问。

### 已执行检查

- `PYTHONPYCACHEPREFIX=/private/tmp/codex-stage-gate-pycache python3 -m unittest scripts.test_validate_harness`：12 个测试通过；新增负向场景证明旧的“所有仓库修改或交付任务”规则重新进入当前事实源时会被拒绝。
- `PYTHONPYCACHEPREFIX=/private/tmp/codex-stage-gate-pycache python3 -m py_compile scripts/validate_harness.py scripts/harness_validation/*.py scripts/test_validate_harness.py`：通过。
- 使用 Skill Creator 现有虚拟环境的 `quick_validate.py` 检查 `.agents/skills/*`：20 个项目 Skills 全部通过。
- `python3 scripts/validate_harness.py`：通过，检查 31 个必需文件、20 个 Skills、本地 Markdown 链接、五类日期项目记忆和全部当前门禁；唯一非阻断提示为 `scripts/harness_validation/initialization.py` 682 行，继续接受 >400 行职责审查。
- `git diff --check`：通过；当前事实源扫描未发现旧触发语句残留，校验器中的同文字面量仅用于回归拒绝列表。

### 结论与未运行范围

- 开发结论：设计/编码阶段触发及其他阶段排除规则已在政策、Skills、当前项目记忆和机械检查中一致落实；这不是人工最终复核或发布就绪结论。
- 发布构建、最终产物存在性/启动冒烟、Computer Use E2E、真实多 Worktree/Subagent 前向协作、Windows/Linux、真实 GitHub 运行器、打包、签名、上传、创建标签和发布均为 `Not run` 或 `Unverified`。
- 混合任务仍依赖 Agent 按任务目的识别尚未完成的设计/编码阶段；若出现重复歧义，应通过新 ADR 细化，而不是重新按任意仓库写入触发。

## 2026-07-29 当前技术债收口与证据复核

### 范围、整合与环境

- 当前宿主：macOS 26.5.2（构建 25F84），arm64；Git 顶层目录为 Harness 根，分支为 `master`。用户批准本任务使用并行 Worktree + Subagent，并要求结束后清理。
- 三个独立单元分别提交随附的 Rust 格式 `b303e1e`、校验器拆分 `027a2ce`、Worktree 辅助程序 `772e6ff` + `09cdb01`；主分支先 `git cherry-pick` 已审查的提交，再以无内容差异合并保留单元祖先关系。
- 三个单元在整合后的辅助程序上再次通过实际 cwd、Git 根、登记 Worktree、分支和声明目标门禁；随后均按保守门禁移除 Worktree 并删除对应临时分支。上一任务的三个干净 Worktree 因分支祖先条件仍不满足而保留，未强制删除。
- 本轮是 Harness 维护与证据复核，不是最终产物构建或发布准备；没有授权发布构建、最终产物冒烟、Computer Use E2E、打包、产物收集、签名、上传、创建标签或发布。

### 已执行检查与修复

- 精确 Rust 1.90：`cargo fmt --all -- --check`、锁定依赖工作区检查、Clippy `-D warnings` 全部通过；测试枚举确认 CLI 6 个、核心 1 个，共 7 个非空测试，锁定依赖测试 7/7 通过。构建缓存使用任务专用 `/private/tmp` 目录并在命令结束时清理。
- `python3 -m unittest scripts.test_validate_harness`：11 个测试通过，覆盖真实直接命令入口以及候选工作流的成功和最高风险失败路径。
- `python3 .agents/skills/run-parallel-worktrees/scripts/test_parallel_worktrees.py`：10 个测试通过，覆盖创建/清理、脏基线、项目当前目录错误、正确门禁路径、空目标、单元当前目录错误、Git 根、HEAD 分离状态、绝对越界与符号链接逃逸。
- 开发环境门禁 11 个测试、身份改名 4 个测试全部通过；Skill Creator 虚拟环境的 `quick_validate.py` 对 20 个项目 Skills 全量通过。
- Python 编译首轮因沙箱禁止写入 `.agents/.../__pycache__` 非零失败；设置 `PYTHONPYCACHEPREFIX=/private/tmp/codex-tech-debt-pycache` 后对入口、领域模块和 Worktree 辅助程序/测试重跑通过，任务缓存随后删除。
- `python3 scripts/validate_harness.py`：通过，检查 31 个必需文件、20 个 Skills、本地链接、五类日期记忆及全部当前门禁；唯一非阻断提示为 `scripts/harness_validation/initialization.py` 682 行，低于 800 行原则拆分阈值但保留 >400 行职责审查。
- `git diff --check`：通过。整合审查未发现敏感信息、占位符、不相关修改、行为性 Rust 差异或新增第三方依赖。

### 技术债结论与未运行范围

- LIM-020：`Closed`。原 5 处 Rust 1.90 rustfmt 失败已修复，并有格式/检查/Clippy/7 个测试证据。
- LIM-022：`Closed`。单一入口从 1622 行降至 68 行，最大领域模块 682 行，入口/正负向测试和完整校验器通过。
- LIM-021：`Mitigated`。辅助程序范围内的 cwd、Git、分支和目标越界已机械阻断；绕过辅助程序的 Codex 宿主写入仍不能由仓库脚本禁止，不能标为 `Closed`。
- LIM-004、LIM-005、LIM-007 至 LIM-019 仍受反馈入口、真实下游、Windows/Linux、GitHub 运行器、非 CLI 产物、渠道/合同或采用数据等原处理条件阻断，本地文档或单元测试不能替代。
- 本次技术债收口交付结论：`Verified`。本地可执行的代码、格式、静态、单元、Skill 与 Harness 契约检查通过，且项目负责人已在本文件 2026-07-29 人工复核记录中明确批准当前范围。
- Harness 整体结论：`Partially verified`。人工批准不替代仍开放技术债所需的外部平台、真实下游或发布级技术证据。
- 发布构建、最终产物存在性/启动冒烟、Computer Use E2E、真实 GitHub Windows/macOS/Linux 候选、非 CLI 下游、打包、签名、上传、创建标签和发布仍为 `Not run` 或 `Unverified`；`1.0.0` 继续为 `Unreleased`。

## 2026-07-29 发布构建前手动验收门禁（整合实现）

### 范围与环境

- 当前宿主：macOS 26.5.2（构建 25F84），arm64；最终开发检查基于干净的 `master` 提交 `a7312bbc42db4a2aeb43bfd5d315c5afdc181dd6`。
- 用户要求先保存既有工作，基线提交为 `2468641`；政策、Skills 与工作流/校验器单元随后完成整合。政策 Worktree 提交 `0b0855e` 以 `5224ece` 合入，Skills Worktree 提交 `ba70172` 以 `be1c716` 合入，工作流/校验器由主分支审查修复后形成 `27e4ef8` 与 `a7312bb`。
- 用户没有发起最终产物构建或发布准备，因此本轮没有出现发布构建前的验收选择提示，也没有运行 E2E、发布构建或打包；这与 ADR-20260729-003 的触发边界一致。
- 三个任务 Worktree 和对应分支均保持干净；因 `git cherry-pick` 或串行替代提交，它们不是 `master` 的祖先，按保守清理规则没有自动移除。
- 一个 Subagent 两次绕过声明的 Worktree 所有权直接提交主分支；相关差异已逐项审查、修复和复验，宿主缺少机械隔离的问题登记为 LIM-021。

### 已执行检查

- 使用 Skill Creator 虚拟环境的 `quick_validate.py` 对 `.agents/skills/*` 全量运行：20 个项目 Skills 全部通过。
- `python3 -m unittest scripts.test_validate_harness`：通过，10 个测试全部成功。覆盖正向工作流、任意命令输入、验收决策缺失/错序、Unix/Windows 各自的打包保护、上传保护、打包步骤缺失、非法 `selected` 终态、`fail-fast: false` 和重型验收非零失败分支。
- `python3 .agents/skills/run-parallel-worktrees/scripts/test_parallel_worktrees.py`：通过，4 个隔离测试全部成功。
- `python3 .agents/skills/check-development-environment/scripts/test_development_environment_gates.py`：通过，11 个隔离测试全部成功。
- `python3 .agents/skills/rename-project-identity/scripts/test_rename_project_identity.py`：通过，4 个测试全部成功。
- 相关 Python 文件使用 `PYTHONPYCACHEPREFIX=/private/tmp/...` 执行 `py_compile`：通过；候选工作流使用 Ruby `YAML.safe_load`：通过。
- `python3 scripts/validate_harness.py`：通过，检查 31 个必需文件、20 个 Skills、本地链接、日期记忆和手动验收/打包门禁；唯一非阻断提示为校验器 1622 行，已登记 LIM-022。
- `git diff --check` 与 `git status --short`：通过；最终开发检查时主工作树干净。
- 验证过程中的失败均已修复并重跑：首次 Python 编译因默认缓存目录权限失败，改用任务临时缓存后通过；最初工作流测试存在跳过和弱断言，补强为 10 个真实正负向场景；整合后校验器指出的 10 处旧契约残留已同步更新；新增失败传播测试曾修改错误分支，修正注入位置后通过。

### 结论与未运行范围

- 开发结论：政策、Skills、工作流/校验器和机械回归的整合检查通过；这证明当前 Harness 契约与静态候选流程已落实门禁，但不等同于发布就绪。
- 发布构建、最终产物存在性/启动冒烟、Computer Use E2E、真实 GitHub Windows/macOS/Linux 候选、真实下游固定重型验收入口、打包、产物收集、签名、上传、创建标签、发布与人工最终复核均为 `Not run`；版本仍为 `1.0.0` / `Unreleased`。
- Windows、Linux、真实 GitHub 运行器、非 CLI 下游和 Subagent 宿主级写入隔离仍为 `Unverified`；三个干净但未被祖先关系证明已整合的任务 Worktree 继续保留，等待用户决定收口方式。

## 2026-07-29 并行 Worktree/Subagent 与分层验证门禁

### 范围与环境

- 当前宿主：macOS 26.5.2（构建 25F84），arm64；Git 顶层目录为 Harness 根，分支为 `master`，HEAD 为 `98d672073fdb5b2f137cf4cc5b616eeecc4cad0f`。
- 开始与结束检查均确认工作树包含项目负责人此前未提交的 2026-07-28 项目记忆、两份 DOCX 和共享入口修改；本次基于现状继续，没有重置、执行 `git stash`、自动提交、分支切换、Worktree 创建、远端、标签或发布操作。
- 本轮是 Harness Skill、脚本、文档与校验器开发，不是发布准备或交付整体验收；验证范围按 ADR-20260729-002 限定为单元测试与变更相关检查。

### 自动检查证据

- `python3 .agents/skills/run-parallel-worktrees/scripts/test_parallel_worktrees.py`：通过，4 个隔离测试全部成功。覆盖干净基线创建与已整合清理、脏基线（含未跟踪文件）阻断、路径穿越与既有目标阻断、脏或未整合 Worktree 阻断；成功清理故意保留分支。
- `python3 -m py_compile scripts/validate_harness.py .agents/skills/run-parallel-worktrees/scripts/parallel_worktrees.py .agents/skills/run-parallel-worktrees/scripts/test_parallel_worktrees.py`：通过。
- Skill Creator `quick_validate.py` 首次分别使用系统 Python 与 Codex 随附的工作区 Python，均因缺少 PyYAML 失败，未形成 Skill 结构结论；随后使用现有 Skill Creator 虚拟环境 Python 对 `.agents/skills/*` 全量运行，20 个项目 Skills 全部通过。
- `python3 scripts/validate_harness.py` 首轮非零退出，准确指出新 2026-07-29 产品规格过度压缩并遗漏 20 项仍有效初始化/技术栈事实；补齐完整快照后重跑通过，检查 30 个必需文件、20 个 Skills、本地链接、五类日期记忆、初始化、工程、并行 Worktree、分层验证、环境、工作区与工作流门禁。
- Harness 校验器隔离负向检查：在 `TemporaryDirectory` 副本中分别删除同步等待关键契约、把当前验证矩阵从 20 个 Skills 退回 19 个；两次均非零退出并报告对应缺失片段，临时副本由受控生命周期自动清理。
- `python3 .agents/skills/run-parallel-worktrees/scripts/parallel_worktrees.py inspect --project-root <Harness 根>`：成功返回当前 `master`、上述 HEAD、`clean=false` 和仅主工作树；只读检查没有创建 Worktree。

### 结论与未运行范围

- 开发结论：本轮单元测试与变更相关验证通过；校验器唯一非阻断提示为 `scripts/validate_harness.py` 1473 行，超过 800 行软拆分阈值。本轮新增逻辑仍属于同一确定性 Harness 契约入口，未把结构重构扩大进当前能力变更。
- 发布级检查 `Not run`：精确 Rust 1.90 随附资产的完整格式/检查/Clippy/发布构建/真实二进制冒烟、Computer Use E2E、真实多 Subagent/Worktree 前台协作、跨平台候选、归档和人工最终复核。本轮不得据此声称 `Verified` 或发布就绪。
- Windows、Linux、非 CLI 下游、不同 Codex 宿主的 Subagent 状态展示、长期 Worktree 残留管理和真实并行整合冲突仍为 `Unverified`。

## 2026-07-28 开源与闭源商业化调研报告

### 范围与来源

- 当前宿主：macOS，arm64；调研核对日期为 2026-07-28。
- 资料范围包括 Stack Overflow 2025 Developer Survey、JetBrains 2026 AI 开发工具调查、Anthropic 软件开发研究，以及 GitHub Spec Kit、OpenSpec、Agent OS、Claude Code memory、cargo-generate、Cookiecutter、Copier、create-tauri-app、Electron、Deskfast、Electron Starter Template 和 Tauri 的官方资料。
- 根目录产出 `Agent-first_Harness_开源路线商业化调研报告.docx` 与 `Agent-first_Harness_闭源路线商业化调研报告.docx`。报告将公开事实、分析推断、实验价格和法律边界分别标记，未把竞品宣传内容当作本项目已验证需求。

### 文档结构与视觉证据

- `unzip -t` 分别检查两份 DOCX：均报告 `No errors detected in compressed data`。
- 使用 Documents Skill 的 `a11y_audit.py` 检查两份 DOCX：高等级 0、中等级 0、低等级 15。全部低等级项均为来源章节直接显示完整 URL；为保证打印版和脱离超链接后的证据可核验而有意保留。
- 使用 LibreOffice 和 Noto Sans CJK SC 渲染检查：开源报告 9 页、闭源报告 11 页。逐页以原始分辨率检查封面、正文、表格、编号、页眉页脚、来源超链接和免责声明，未发现文本截断、表格越界、重叠、空白异常或编号跨章节串联。
- 初次渲染发现运行环境缺少可用 CJK 字体、步骤编号在不同章节间延续；补充任务专用字体配置并为每组步骤创建独立编号后重新生成、重新渲染和完整复查，最终文件通过上述检查。

### 仓库验证、结论与边界

- `python3 scripts/validate_harness.py`：通过；检查 28 个必需文件、19 个 Skills、本地 Markdown 链接、五类日期记忆、初始化/工程/环境/工作区/工作流门禁。唯一非阻断提示为校验器 1350 行，超过 800 行原则拆分阈值；本次未修改该脚本。
- `git diff --check`：通过，未发现 Markdown 空白错误。
- Agent 结论：`Partially verified`。两份研究文档的结构、可访问性和 macOS 渲染闭环已检查；用户尚未完成内容与商业假设的人工最终复核。
- Harness 根产品编译、业务单元测试、最终应用产物和启动冒烟：`Not applicable`。本次只新增策略研究 DOCX 和项目记忆，不修改产品代码、Rust 资产、接口或运行行为。
- Windows Word、其他办公套件、打印机输出、真实客户付费、价格弹性、退款率、支持成本、合同适用性和私有组件实现均为 `Unverified`。正式销售前需要在目标环境复核文件并由专业律师审核许可与交易文件。

## 2026-07-27 全部文档审计与 Harness 1.0.0 版本事实

### 审计范围与修复

- 当前宿主：macOS 26.5.2（构建 25F84），arm64；Git 顶层目录为当前 Harness 根，分支为 `master`，审计起点提交为 `f04d8de04bf184ec4ef5c7bc6d812d2e3645a441`，工作树包含项目负责人此前未提交的许可证、身份改名 Skill 与当日项目记忆变更，本次全部基于现状继续且未回退。
- 使用包含隐藏目录的文件枚举审计 56 份 Markdown，覆盖根入口、双语许可证、全部当前/历史项目记忆、工程与发布规则，以及 `.agents/skills` 下全部 `SKILL.md` 和参考文档。
- 修复当前版本冲突：新增根 `Version.md`，将 Harness 当前版本、初始版本与发布状态设为 `1.0.0`、`1.0.0`、`Unreleased`；`docs/RELEASE.md` 只保留版本/发布规则，README、AGENTS、当前产品规格、工程规则、方法论、技术债、`$prepare-release` 和变更记录均链接或摘要该唯一事实。
- 修复下游继承冲突：`$instantiate-project` 明确读取但不复制 Harness 专用 `Version.md`，初始化后的 Rust 下游继续只使用根 `Cargo.toml`；校验器同时检查版本文件、当前摘要、发布 Skill 和实例化排除契约。
- 当前规则残留扫描覆盖旧 CLI 强制、旧 Git 无提交/无嵌套仓库、旧命名格式、旧版本事实源和“无版本清单”描述，未发现仍有效文档残留。唯一旧“禁止自动提交”语义命中位于历史 ADR 对被替代规则的风险说明；三处本机绝对路径位于既有真实验证证据。两类均按历史事实不可改写规则保留。
- 历史产品规格、ADR、变更记录和验证中的 `0.1.0` 保留为当时 Harness 或随附的 Rust 资产的真实事实；`docs/RUST_CLI_TEMPLATE.md` 与 `$instantiate-project` 中的下游 `0.1.0` 也是独立 Cargo 基线，不被错误提升为 Harness `1.0.0`。

### 自动检查证据

- 使用 Skill Creator 自带 Python 环境逐项运行 `quick_validate.py .agents/skills/<skill>`：19 个项目 Skills 全部通过。
- `python3 .agents/skills/rename-project-identity/scripts/test_rename_project_identity.py`：4 个隔离测试全部通过。
- `python3 .agents/skills/check-development-environment/scripts/test_development_environment_gates.py`：11 个隔离测试全部通过。
- `python3 -m py_compile scripts/validate_harness.py .agents/skills/rename-project-identity/scripts/rename_project_identity.py .agents/skills/rename-project-identity/scripts/test_rename_project_identity.py`：通过。
- `python3 scripts/validate_harness.py`：通过；检查 28 个必需文件、19 个 Skills、全部本地 Markdown 链接、五类日期记忆和初始化/版本/工程/环境/工作区/工作流门禁。唯一软提示为校验器 1350 行，超过 800 行拆分审查阈值；本次只增加同一确定性契约检查，未把脚本结构重构混入文档审计。
- `git diff --check`：通过。
- 版本门禁隔离负向测试：在两个不含 `.git` 的任务临时副本中分别移走 `Version.md`、把其中 `1.0.0` 机械替换为 `1.0.1`；校验器均返回 1，并分别报告缺失必需文件和精确版本契约缺失。临时副本未写入仓库。

### 随附的 Rust 资产与结论

- 精确 Rust 1.90.0 的 `cargo fmt --all -- --check`：失败，仍为 `example_tool_cli/tests/cli.rs` 的 5 处既存链式调用换行差异，与 LIM-020 完全一致；本次未修改非文档资产或扩大范围。
- 使用独立临时 `CARGO_TARGET_DIR` 在精确 Rust 1.90.0 运行锁定依赖工作区检查、Clippy `-D warnings`、测试枚举、7 个非空测试、锁定依赖发布构建和真实二进制冒烟：全部通过。`--version` 返回 `example_tool_cli 0.1.0`；中性状态返回 `productDefinitionRequired=true`；未批准的 `run --json` 返回退出码 2 和 `INVALID_ARGUMENT`。
- Agent 结论：`Partially verified`。56 份 Markdown 的链接和当前规则审计、19 个 Skill 结构、版本正负向门禁、开发环境与改名测试、除既存 rustfmt 外的随附的资产闭环均有通过证据；LIM-020、真实下游、Windows/Linux 和本次人工最终复核仍阻止 `Verified`。
- 发布就绪：`Not ready`。`1.0.0` 仍为 `Unreleased`；本次没有创建标签、发布物、签名或发布，且 Harness 发布清单中的 rustfmt、当前人工最终复核、发布渠道/反馈入口和候选制品证据尚未全部满足。

## 2026-07-27 企业专有商业许可、下游命名与全量改名

### 实施与静态证据

- 根目录新增 `LICENSE.zh-CN.md` 与 `LICENSE.en.md`。两份文件均明确不是开源许可证，覆盖项目与知识产权、有限付费授权、终端下游与禁止继续衍生、源码保密、第三方材料、终止、责任和争议解决；冲突时中文优先，签署的商业文件只对明确冲突事项优先。
- 审计结论：旧 `$instantiate-project` 只强制重写 README/保留项目记忆并搜索残留 Harness 身份；Skills、配置和路径缺少统一执行器，两份许可证更被要求保持与 Harness 完全相同，因此并非所有位置都强制使用目标项目名。
- `$rename-project-identity` 现在以展示名、`snake_case` 标识、kebab-case 前缀和额外精确映射统一处理维护文本与路径，覆盖配置、文档、Skills 和许可证；默认预览，`--apply` 后复扫旧身份，并拒绝目标碰撞和符号链接。
- `$instantiate-project` 要求先把两份许可证逐字节复制到下游根，再只替换双语适用项目名；`$initialize-rust-project` 要求裁剪后保留改名 Skill 和已命名为目标项目的两份文件，旧 Harness 身份、缺失、后续更改或计划删除均阻断。
- AGENTS、README、产品规格、产品状态、工作计划、ADR、发布、校验器和变更记录已同步全量身份与商业许可边界。

### 自动检查证据

- 当前宿主：macOS 26.5.2（构建 25F84），arm64。
- `python3 -m py_compile scripts/validate_harness.py .agents/skills/rename-project-identity/scripts/rename_project_identity.py .agents/skills/rename-project-identity/scripts/test_rename_project_identity.py`：通过。
- 使用 Skill Creator 自带 Python 环境运行 `quick_validate.py .agents/skills/rename-project-identity`：通过。系统 `python3` 和工作区随附的 Python 均因缺少 PyYAML 首次无法执行该校验，随后在 Skill Creator 环境成功重跑；Skill 本身未发生结构失败。
- 使用同一 Skill Creator Python 对 `.agents/skills/*` 逐项运行 `quick_validate.py`：19 个项目 Skills 全部通过。
- `python3 .agents/skills/rename-project-identity/scripts/test_rename_project_identity.py`：4 个测试全部通过，覆盖预览不写盘后全量应用、许可证/Skill/配置/路径同步改名与可执行位保留、目标路径碰撞不覆盖、符号链接写入前阻断，以及显式项目根改名。
- `python3 scripts/validate_harness.py`：通过；检查 27 个必需文件、19 个 Skills、本地 Markdown 链接、五类日期记忆、初始化/身份改名/工程/环境/工作区/工作流门禁和两份许可证关键条款。唯一软提示为校验器 1294 行，超过 800 行审查阈值。
- 随附的核心+CLI 在精确 Rust 1.90.0 下的锁定依赖检查、Clippy `-D warnings`、测试枚举、7 个非空测试、锁定依赖测试、发布构建和真实二进制成功/失败冒烟均通过；`--version` 返回 `example_tool_cli 0.1.0`，`scaffold status --json` 返回 `productDefinitionRequired=true`，未批准的 `run --json` 返回退出码 2 和结构化 `INVALID_ARGUMENT`。
- `rustup run 1.90.0 cargo fmt --all -- --check`：失败。`example_tool_cli/tests/cli.rs` 有 5 处既存链式调用换行与 Rust 1.90 rustfmt 结果不一致；本次改名任务未修改该文件，因此未扩张范围修复，已登记 LIM-020。该失败使 Harness 整体验收不能标记为 `Verified`。
- 缺失文件负向测试：在任务专用隔离副本把 `LICENSE.en.md` 移出原路径，校验器非零退出，并报告 `missing required file: LICENSE.en.md` 与 `missing initialization contract file: LICENSE.en.md`。
- 关键条款负向测试：在另一个隔离副本移除英文标题 `Terminal Downstream Project; No Further Derivation`，校验器非零退出，并精确报告缺失条款。
- 两个隔离副本验证后移入当前用户废纸篓，可恢复；未修改真实下游、远端、标签、发布物或第三方依赖。

### 结论与未验证范围

- Agent 结论：`Partially verified`。许可证文本、项目记忆、实例化/初始化/全量改名契约、Skill 隔离测试、结构校验、正向校验器、既有许可证隔离负向门禁及除格式外的 Rust 资产检查通过；精确 Rust 1.90 rustfmt 存量失败和真实下游证据缺失阻止 `Verified`。
- 通用许可证尚未由许可方律师针对真实公司主体、客户和目标司法辖区复核，不能替代签署的商业合同或法律意见。
- 真实 `$instantiate-project` 的复制后全量改名、未显式前缀映射、裁剪后保留、最终安装包携带，以及实际第三方依赖许可证/NOTICE 清单仍为 `Unverified`。
- 本次不改变随附的 Rust 资产、依赖或接口运行行为；为完整 Harness 复核仍重跑其门槛并如实记录上述格式失败，未把无关修复混入改名范围。

## 2026-07-23 Tokio 异步优先、GUI `unsigned` 构建与根发布刷新

### 实施与静态证据

- CLI、TUI、MCP Skills 与基线强制使用 Tokio current-thread 异步入口；GUI Skill 与基线复用 Tauri 的由 Tokio 支撑的单例运行时并使用普通 `async fn` 命令，不创建嵌套运行时。
- I/O、等待、计时、进程、协议和命令调用优先异步；只有测量确认的 CPU 密集任务才考虑 `spawn_blocking`、专用线程或 multi-thread 运行时，同步阻塞依赖必须替换为异步能力或进入范围/硬规则例外确认。
- GUI 构建/测试/产物/冒烟明确不要求签名身份、证书、公证或更新器密钥；`unsigned` 状态必须记录，实际分发渠道要求的签名仍单独阻断发布。
- `$collect-release-artifacts` 只刷新规范化后的项目根下非符号链接的 `release/`：先确定并验证当前项目、版本、源码提交、明确的构建/运行身份的完整来源清单，再清除历史内容并复制与已选清单精确一致的当前文件集合。初始化 Skill、Harness 根和随附的资产 `.gitignore` 均含 `/release/`。

### 自动检查证据

- 受影响的 9 个 Skills 通过 `quick_validate.py`：`add-cli-adapter`、`add-tui-adapter`、`add-mcp-adapter`、`add-gui-adapter`、`initialize-rust-project`、`collect-release-artifacts`、`build-rust-release`、`prepare-cross-platform-release`、`prepare-release`。
- `python3 -m py_compile scripts/validate_harness.py`：通过。
- `python3 scripts/validate_harness.py`：通过；检查异步/current-thread、GUI `unsigned` 构建、发布清理/选择、两份 `/release/` 忽略规则与旧 `dist/v<version>/`/多线程资产回归。唯一软提示为校验器 1225 行，超过 800 行审查阈值。
- 随附的资产使用精确 Rust 1.90.0 完成 `cargo fmt --check`、锁定依赖下的 Clippy `-D warnings`、锁定依赖工作区测试、非空测试枚举和锁定依赖发布构建：全部通过。执行 CLI 黑盒 6 个、核心 1 个测试；真实二进制文件的 `--version` 返回 `0.1.0`，`scaffold status --json` 返回 `productDefinitionRequired=true`，未批准 `execute --json` 返回预期退出码 2。临时构建目录移入系统废纸篓，可恢复。
- 隔离发布刷新测试：在任务专用 Git 根创建含普通旧文件与隐藏旧文件的 `release/`，验证规范化后的根目录与非符号链接后清除 2 个历史项，只复制 3 个与本次运行对应的文件；最终旧文件不存在、文件数精确为 3、Git 确认 `release/` 被忽略，并验证符号链接可在清理前检出。测试目录移入系统废纸篓，可恢复。
- 当前入口残留扫描未发现随附的资产仍启用 `rt-multi-thread`、入口仍使用 `multi_thread`、收集 Skill 仍写 `dist/v<version>/` 或保留旧候选的活动语义。

### 官方依据与结论

- Tauri 官方 Rust API 说明其单例异步运行时基于 Tokio，并建议自定义命令使用普通 `async fn`；GUI Skill 因此复用 Tauri 运行时，而不额外建立 Tokio 运行时。
- Tauri 官方平台文档区分构建与分发签名：Windows 可运行 `unsigned` 应用但可能触发 SmartScreen，Linux 部署不强制签名；macOS 直接分发/App Store 和更新器等渠道有独立签名要求。
- Agent 结论：`Partially verified`。Skills、Harness 门禁、current-thread Rust 资产和隔离发布刷新语义通过；项目负责人已于 2026-07-23 完成人工复核，但真实下游和其他平台证据仍缺失。
- 真实 TUI/MCP/GUI 下游、GUI 原生 `unsigned` 构建、各渠道签名/公证、Windows/Linux 以及用户实际构建结果的全量收集仍为 `Unverified`。

## 2026-07-23 下游独立、干净的 Git 状态与四类开发记忆延迟创建

### 实施与静态证据

- `$instantiate-project` 的固定复制清单现在完整排除 `docs/adr/`、`docs/changelog/`、`docs/product_spec/`、`docs/work_plan/`，不复制索引、日期正文或创建空占位。
- `$define-product`、`$plan-change`、`$implement-change` 分别在首项真实需求、首个真实计划、首次真实可见变更时创建其拥有的记忆目录、索引和当日正文。
- `$initialize-rust-project` 在脚手架验证和一次性裁剪后，使用用户已有 Git 身份创建唯一的 `chore: initialize project` 本地基线提交；身份缺失时阻断，不伪造身份或修改全局 Git 配置。
- 最终 Git 门禁要求 `inside-work-tree` 为 `true`、顶层目录精确等于项目根、分支为 `main`、`HEAD` 可解析、远端为空且 `git status --porcelain=v1 --untracked-files=all` 无输出。

### 自动检查证据

- 使用 Skill Creator 自带 Python 环境运行 `quick_validate.py`：`instantiate-project`、`initialize-rust-project`、`define-product`、`plan-change`、`implement-change` 五个受影响 Skill 均通过。
- `python3 -m py_compile scripts/validate_harness.py`：通过。
- `python3 scripts/validate_harness.py`：通过；检查 23 个必需固定入口、18 个 Skills、本地 Markdown 链接、五类 Harness 日期记忆、初始化后的干净 Git 状态/记忆排除契约、工程规则、环境门禁、工作区继承和候选工作流。唯一软提示为校验器 1143 行，超过 800 行审查阈值。
- 隔离 Git 判定：在任务专用临时父 Git 仓库内创建独立子项目，复制一个受控文件，初始化 `main`，使用当前已有 Git 身份创建一个基线提交；断言子项目的 Git 顶层目录精确等于子项目根目录且与父仓库独立、分支为 `main`、提交数为 1、远端数为 0、简洁状态为空，且四类记忆目录均不存在。命令成功退出，测试目录随后移入系统废纸篓，可恢复。

### 结论与未验证范围

- Agent 结论：`Partially verified`。Skill 结构、Harness 契约、回归门禁和隔离环境中的干净 Git 状态判定通过；项目负责人已于 2026-07-23 完成人工复核，但真实下游前向证据仍缺失。
- 真实 `$instantiate-project` 的完整选择性复制、脚手架、裁剪、基线提交、首次项目记忆创建以及 Windows/Linux Git 行为仍为 `Unverified`。
- 本次修改初始化与维护流程，不改变随附的 Rust 资产、依赖或接口行为，因此 Rust 编译、单元测试、发布构建和产物冒烟为 `Not applicable`，未重复执行。

## 2026-07-23 三类项目记忆按日完整快照迁移

### 实施与静态证据

- `docs/PRODUCT_SPEC.md`、`docs/PROJECT_STATUS.md`、`docs/WORK_PLAN.md` 已迁移为 `docs/product_spec/20260723_product_spec.md`、`docs/project_status/20260723_product_status.md`、`docs/work_plan/20260723_work_plan.md`，旧单文件不再存在。
- 三个目录均新增 `README.md`，明确小写 snake_case 日期命名、同日只维护一份、新日读取前一份并综合重写完整快照、最新日期文件为当前事实。
- `AGENTS.md`、README、工程规则、12 个直接受影响的项目 Skills、技术债入口和 Harness 校验器已同步；当日 ADR 与变更记录已记录本次维护流程变化。

### 自动检查证据

- `python3 -m py_compile scripts/validate_harness.py`：通过。
- `python3 scripts/validate_harness.py`：通过；检查 23 个必需固定入口、18 个 Skills、本地 Markdown 链接、五类日期项目记忆、初始化/工程/依赖/工作流门禁。
- 隔离负向检查：复制仓库到任务专用临时目录，将产品规格改为错误的 `20260723_PRODUCT_SPEC.md` 并恢复旧 `docs/PROJECT_STATUS.md`；校验器返回非零，并分别报告旧单文件、错误日期命名和缺失合法产品规格正文。隔离副本随后移入系统废纸篓，可恢复。
- 全仓旧路径扫描仅剩本次工作计划/ADR 对已删除路径的明确迁移说明，以及 ADR-20260723-001 的历史影响范围；当前入口、Skills 和事实源无旧路径引用。
- 校验器唯一软提示：`scripts/validate_harness.py` 为 1123 行，超过 800 行原则拆分阈值。本次新增逻辑仍属于同一日期记忆一致性入口；该提示不影响硬门禁结论，后续新增大块契约前继续复核拆分。

### 结论与未验证范围

- Agent 结论：`Partially verified`。文档结构、索引、关键规则、正向校验和隔离负向校验均通过；项目负责人已于 2026-07-23 完成人工复核，但真实下游跨自然日前向证据仍缺失。
- 本次只改变 Harness 文档治理和校验器，不改变随附的 Rust 资产、依赖、接口行为或最终产物，因此 Rust 编译、测试、发布构建和产物冒烟为 `Not applicable`，未重复执行。
- 真实下游在跨自然日创建并综合三类新快照的前向行为仍为 `Unverified`；本次已通过索引、Skills 和校验器固化规则，但尚无第二个自然日的真实执行证据。

## 2026-07-23 一次性下游裁剪、条件开发环境与 GUI 身份

### 实施与静态证据

- 新增并纳入校验器的项目 Skills：`$check-development-environment`、`$prepare-gui-app-identity`；当前共 18 个 Skills。
- 环境门禁脚本、参考和测试已从 `.agents/skills/initialize-rust-project/` 移至独立 `.agents/skills/check-development-environment/`，初始化裁剪不会删除它们。
- `AGENTS.md` 当前为 136 行，包含非空 `## Skills 地图` 与 `## 约束地图`；初始化 Skill 明确要求脚手架全部验证后删除实例化/初始化 Skills、模板校验器/方法论和活动派生入口，同时保留两张地图和适用开发 Skills。
- GUI 身份 Skill 明确收集显示名、主窗口标题、简述、应用标识和图标方向，并要求用户从自动生成、确定性备用方案、用户上传标准化/高清三条路径中选择；真实应用资料和图标未在 Harness 根生成。

### 自动检查证据

- `python3 -m py_compile scripts/validate_harness.py .agents/skills/check-development-environment/scripts/test_development_environment_gates.py`：通过。
- `sh -n .agents/skills/check-development-environment/scripts/development-environment-gates.sh`：通过。
- `python3 .agents/skills/check-development-environment/scripts/test_development_environment_gates.py`：通过，11 个测试全部成功。覆盖仅 Rust 时不探测 Node.js/pnpm、GUI 已有工具不修改、GUI 缺失 Rust/Node.js/pnpm 隔离安装、只读模式报告工具缺失且不安装、Rust 1.90 下限与更高稳定版、Rust/Node 摘要失败和 Windows MSVC/pnpm 静态契约。
- `python3 scripts/validate_harness.py`：通过，检查 23 个必需文件、18 个 Skills、地图/裁剪契约、条件环境门禁、本地链接、日期记忆、工程规则、工作区继承和工作流门禁。
- 使用任务专用临时 `CARGO_TARGET_DIR` 对随附的核心+CLI 资产运行 `cargo fmt --all -- --check`、锁定依赖下的 Clippy `-D warnings`、锁定依赖工作区测试和锁定依赖发布构建：全部通过；共执行 CLI 黑盒 6 个、核心 1 个测试。真实发布二进制文件的 `scaffold status --json` 返回 `productDefinitionRequired=true`，未批准 `execute --json` 返回预期退出码 2 与 `ok=false`；临时构建目录已由 trap 清理。
- 当前描述残留扫描未发现旧初始化门禁路径、`gate.python`、无条件 Rust+Node 阻断或旧 Python 可选门禁继续存在于当前入口、规范、Skills 或校验器。
- 校验器唯一软提示：`scripts/validate_harness.py` 为 1051 行，超过 800 行原则拆分阈值；本次新增检查仍属于同一确定性 Harness 入口，未把软提示误判为通过或失败。

### 结论与未验证范围

- Agent 结论：`Partially verified`。当前 macOS arm64 的 POSIX 脚本语法、11 个隔离测试、Harness 结构和文档/Skill 契约通过。
- 当前宿主没有 `pwsh`，PowerShell 只完成 Python 静态片段检查；Windows 原生 MSVC、Node.js、pnpm 安装与复探为 `Unverified`。
- 真实下游初始化后自裁剪、下游地图内容、Linux 原生门禁、真实 npm 软件包仓库 pnpm 安装、GUI 三类图标路径与 Tauri 平台图标为 `Unverified`。
- Harness 根没有具体产品；下游编译、产品单元测试、最终产物和启动冒烟为 `Not applicable`。项目负责人已于 2026-07-23 完成人工复核。

## 2026-07-23 Rust 1.90 MSRV 同步与全量 Skill/文档复审

### 环境与范围

- 操作系统：macOS 26.5.2 arm64。
- 当前默认 Rust/Cargo：1.97.1；默认工具链未修改。
- 精确 MSRV：`rustc 1.90.0 (1159e78c4 2025-09-14)`、`cargo 1.90.0 (840b83a10 2025-07-30)`。
- Harness 根目录没有 `.git`，因此分支、提交与脏工作树证据为 `Not available`；本次未初始化 Git。
- 逐份复审 16 个项目 `SKILL.md`、16 个 `agents/openai.yaml`、全部 Skill 参考资料、所有 Markdown 文档、初始化脚本、随附的 Rust 资产和候选工作流。通用 Skills 均使用项目声明的 MSRV；硬编码下限只存在于需要统一版本的事实源和可执行资产中，并已全部改为 1.90。
- 2026-07-22 精确 Rust 1.85 的执行结果保留在下方历史段，仅证明当日旧基线曾通过，不再构成当前兼容性或发布证据。

### 自动检查证据

- `python3 -m py_compile scripts/validate_harness.py .agents/skills/initialize-rust-project/scripts/test_prerequisite_gates.py`：通过。
- `python3 .agents/skills/initialize-rust-project/scripts/test_prerequisite_gates.py`：通过，11 个测试全部成功；默认兼容测试夹具使用 1.90.0，最低版本失败测试夹具使用 1.89.0，并确认 1.91.0、1.97.1 与未来 2.0.0 稳定版均满足最低版本门禁。
- `sh -n .agents/skills/initialize-rust-project/scripts/prerequisite-gates.sh`：通过。
- `python3 scripts/validate_harness.py`：通过，检查 23 个必需文件、16 个 Skills、本地链接、日期记忆、初始化门禁、工程规则、工作区依赖继承、Rust 1.90 一致性和工作流门禁。
- 校验器软提示：`scripts/validate_harness.py` 为 1012 行，超过 800 行原则拆分阈值。本轮新增 MSRV 一致性检查属于同一确定性 Harness 入口；为避免扩大兼容性变更，本次保留单文件，后续新增大块契约前必须复核拆分。
- 全仓 `1.85` 扫描：项目 Skills、参考资料、脚本、Cargo 资产和候选工作流无旧版兼容声明；剩余命中仅限工作计划/当日 ADR 的迁移说明，以及 2026-07-22 的历史 ADR、变更记录和真实验证证据。

### 精确 Rust 1.90 随附的资产证据

- 首次 `rustup toolchain install 1.90.0` 与另一个正在运行的 `cargo +1.90.0 check` 并发，rustup 在恢复既有部分安装时报告目录冲突并自动回滚。只读复查确认 1.90.0、rustfmt 和 Clippy 随后均完整可用，未删除工具链；并发检查结束后串行重跑正式验证。
- 使用独立临时 `CARGO_TARGET_DIR` 运行 `cargo +1.90.0 fmt --all -- --check`、锁定依赖工作区检查、Clippy `-D warnings`、测试枚举、锁定依赖测试和锁定依赖发布构建：全部通过。
- 测试枚举和执行均发现 7 个测试：CLI 黑盒 6 个、核心 1 个；不是零测试假阳性。
- 真实发布二进制文件：`--version` 返回 `example_tool_cli 0.1.0`；`scaffold status --json` 返回成功信封并包含 `productDefinitionRequired=true`；未批准的 `execute --json` 返回退出码 2 和结构化失败信封。
- 构建目标位于任务专用临时目录并在验证结束后清理；未修改共享 Cargo 目标目录或锁文件。

### 结论与未验证范围

- Agent 结论：`Partially verified`。当前 macOS arm64 的 Rust 1.90 规范一致性、门禁边界、随附的资产和真实 CLI 冒烟均通过；项目负责人已于 2026-07-23 完成人工复核，但其他平台和真实下游证据仍缺失。
- Windows、Linux、PowerShell 原生执行、Windows MSVC 真实安装、远程三平台工作流、TUI/MCP/GUI/WEB 真实下游兼容组合：`Unverified`。
- Harness 根产品四项门槛：`Not applicable`，因为根目录没有具体产品；随附的资产的通过证据不能替代真实下游产品证据。

## 2026-07-22 Harness 整体验收与最新描述同步

> 以下内容是 2026-07-22 的历史验证事实，已由 ADR-20260723-001 的 Rust 1.90 当前基线替代，不代表继续兼容 Rust 1.85。

### 环境

- 操作系统：macOS 26.5.2 arm64。
- Git：Apple Git 2.50.1。
- Python：3.14.6。
- Node.js：26.5.0。
- 当前 Rust/Cargo：1.97.1。
- 精确 MSRV：`rustc 1.85.0 (4d91de4e4 2025-02-17)`，本机已安装并实际执行。
- Harness 根目录没有 `.git`，因此本次无法记录分支、提交或脏工作树；未对根目录执行 `git init`。

### 审查范围与结论

- 逐份读取 README、AGENTS、产品规格、状态、Agent 策略、工程规则、CLI 契约、Rust 基线、计划、ADR、验证、技术债、发布、变更记录和相关方法论章节。
- 逐份读取 16 个 `SKILL.md`、16 个 `agents/openai.yaml`、TUI/React/GUI/MCP/前置条件/能力参考资料、初始化脚本、随附的 Rust 资产和候选工作流。
- 确认当前接口规则为 CLI/TUI/MCP/GUI/WEB 独立可选，显式选择时只创建所选适配器，空选择才默认 CLI；CLI 契约只对已选 CLI 生效。
- 确认 `Draft` 生命周期、独立 Git 根、ASCII `snake_case` 派生命名、工作区依赖集中、Tokio 适配器、固定 TUI/React 技术族、superpowers 策略、E2E 与人工复核边界一致。

### 发现并同步的差异

1. `docs/HARNESS_ENGINEERING.md` 的实现顺序仍把 CLI 当作所有项目的固定步骤，并隐含 MCP 必须与 CLI 同时存在。已改为共享核心与实际所选接口闭环，并为五类接口分别列出条件验收。
2. README 与 AGENTS 把 `$build-rust-release`、`$prepare-cross-platform-release` 描述成通用 Rust 产物能力，但两个 Skills 当前只实现 Rust CLI。已把入口、Rust 基线和 `$verify-delivery` 的适用性同步为 Rust CLI，其他接口继续使用各适配器 Skill 的构建门槛，统一发布缺口保留为 LIM-015。
3. `$instantiate-project` 已记录 superpowers 选择，随后 `$initialize-rust-project` 又无条件重复询问。已改为同一工作流复用并确认已记录值，直接初始化时才询问。
4. Python 3 是可选门禁，但 `$instantiate-project` 曾无条件要求运行 Python 校验器。已改为 Python 不可用时如实记录 `Not run` 并继续。
5. 当日 ADR、变更记录和旧验证摘要同时保留多轮被替代规则，导致检索得到相反结论。依据用户明确决定新增 ADR-20260722-013，合并为最新有效描述，同时保留真实失败、未验证范围和人工复核事实。
6. 校验器原先能通过上述方法论冲突。已新增当前描述回归门禁，并通过隔离负向注入证明旧规则会被拒绝。

### 自动检查证据

- `python3 -m py_compile scripts/validate_harness.py .agents/skills/initialize-rust-project/scripts/test_prerequisite_gates.py`：通过。
- 首次错误调用 `python3 -m unittest .agents/.../test_prerequisite_gates.py`：未运行测试；以点开头的路径被 `unittest` 解析为空模块名并返回 1。随后按脚本入口重跑。
- `python3 .agents/skills/initialize-rust-project/scripts/test_prerequisite_gates.py`：通过，10 个测试全部成功，覆盖既有工具不修改、空格路径、Python 可选缺失、Rust/Node 缺失安装、只读模式报告工具缺失且不安装、旧 Rust、安装器失败、Rust/Node 摘要失败和 Windows MSVC 契约。
- `python3 scripts/validate_harness.py`：通过，检查 23 个必需文件、16 个 Skills、本地链接、日期记忆、初始化门禁、工程规则、工作区依赖继承和工作流门禁。
- 校验器软提示：`scripts/validate_harness.py` 为 963 行，超过 800 行原则拆分阈值。本轮新增逻辑仍属于同一无第三方依赖的确定性校验入口，内部已按命名函数隔离；为避免在文档验收中混入结构重构，本次保留单文件并要求下次新增大块契约前拆分审查。
- 隔离负向检查：复制仓库到临时目录，在方法论文档注入已替代的固定 CLI 规则；校验器返回 1，并精确报告 `stale current description`。临时副本随后移入系统废纸篓，可恢复。
- `sh -n .agents/skills/initialize-rust-project/scripts/prerequisite-gates.sh` 与可执行位检查：通过。
- Ruby `YAML.safe_load` 解析候选工作流：通过；禁止发布行为扫描确认无 `contents: write`、`cargo publish`、发布创建或标签命令。
- PowerShell AST/原生执行：`Not run`，当前宿主没有 `pwsh`；Windows 仍为 `Unverified`。

### 随附的 Rust 资产证据

- 当前稳定版 1.97.1：`cargo fmt --all -- --check`、Clippy `-D warnings`、锁定依赖测试、测试枚举和锁定依赖发布构建均通过。共发现并执行 7 个测试：CLI 黑盒 6 个、核心 1 个。
- 首次发布冒烟错误使用相对 `./target/release/example_tool_cli`，因本机 Cargo 配置把目标目录设为共享路径而返回 127；构建本身已成功，资产未失败。随后按 Cargo 元数据解析真实目标目录重跑。
- 当前稳定版真实产物（路径由 Cargo 元数据解析）：`--version` 返回 `0.1.0`；`scaffold status --json` 返回成功信封和 `productDefinitionRequired=true`；未批准的 `execute --json` 返回退出码 2、标准输出为空、标准错误非空。
- `cargo update --workspace --dry-run`：报告锁定 0 个更新，当前软件包仓库解析下没有遗漏 Rust 1.85 兼容更新；未修改锁文件。
- 精确 Rust 1.85.0：锁定依赖检查、Clippy `-D warnings`、7 个测试、锁定依赖发布构建和相同成功/失败真实产物冒烟全部通过。macOS arm64 的声明 MSRV 证据因此为 `Passed`。

### 适用性与未验证范围

- Harness 根产品四项门槛：`Not applicable`，因为根目录没有具体产品；随附的 Rust 资产已单独验证，不能替代真实下游产品证据。
- Windows、Linux、Windows MSVC 真实签名/提权/安装/3010/复探、远程三平台候选工作流：`Unverified`。
- 完整 `$instantiate-project` 复制与身份重置、父仓库内真实下游、符号链接和失败回滚：`Unverified`。
- TUI/MCP/GUI/WEB 中性脚手架、多接口组合、固定技术族兼容版本、superpowers 跨会话执行和 Computer Use 最终产物 E2E：`Unverified`。
- 反馈入口、发布渠道和发布物格式仍待确定。

### Agent 验收结论

- 结论：`Partially verified`。
- 已通过：当前 macOS 的文档/Skill 一致性、当前描述正负向门禁、10 个前置条件测试、工作流静态检查、Rust 稳定版与精确 1.85 资产完整验证。
- 未达到 `Verified` 的原因：真实下游和其他平台证据仍缺失。项目负责人已于 2026-07-23 完成人工复核，人工审批不替代这些技术证据。

## 2026-07-23 人工复核前完整验证重跑

### 环境与结果

- 操作系统：macOS 26.5.2 arm64。
- Harness 根目录没有 `.git`，因此分支、提交与脏工作树证据仍为 `Not available`；本次未初始化 Git。
- 18 个项目 Skills 全部通过 `quick_validate.py`。
- `python3 -m py_compile scripts/validate_harness.py .agents/skills/check-development-environment/scripts/test_development_environment_gates.py`、POSIX Shell 语法检查、11 个开发环境隔离测试和 `python3 scripts/validate_harness.py` 全部通过。
- Harness 校验器检查 23 个必需固定入口、18 个 Skills、本地 Markdown 链接、五类日期记忆、初始化门禁、工程规则、工作区依赖继承和候选工作流；唯一提示为 `scripts/validate_harness.py` 1225 行的非阻断拆分审查项。
- 随附的核心+CLI 资产使用精确 Rust 1.90.0 完成 fmt、锁定依赖工作区检查、Clippy `-D warnings`、测试枚举、锁定依赖测试和锁定依赖发布构建；实际执行 CLI 黑盒 6 个、核心 1 个测试，全部通过。
- 真实发布二进制文件的 `--version` 和 `scaffold status --json` 成功；未批准的 `execute --json` 返回退出码 2、标准输出为单一 JSON 失败信封、`ok=false`、错误码 `INVALID_ARGUMENT`，标准错误为空。
- 首次负向冒烟包装脚本错误沿用了旧历史记录中的“JSON 错误写 stderr”假设，因此包装脚本以 1 退出；构建和二进制没有失败。依据当前 `docs/CLI_CONTRACT.md` 和现有 CLI 黑盒测试修正断言后重跑通过。

### 结论与边界

- Agent 结论：`Partially verified`。当前 macOS 的 Harness、Skills、开发环境隔离门禁和精确 Rust 1.90 随附的资产闭环通过，且人工复核已完成。
- Windows、Linux、真实下游、非 CLI 适配器、真实 GUI `unsigned` 构建、渠道签名、实际发布收集和 Computer Use E2E 仍为 `Unverified`；人工批准没有将其改判为通过。
- 本次只记录人工复核与验证证据，不改变产品范围、代码、接口、发布状态或外部系统，因此产品规格、ADR 与变更记录的功能变更条目为 `Not applicable`。

## 2026-07-23 项目负责人外部设备验证声明

- 证据来源：项目负责人于本次会话明确确认“其他的我在其他设备上测试通过了”，并授权完成全部审批。
- 覆盖范围：此前列为其他设备、Windows/Linux、真实下游、非 CLI 适配器、GUI `unsigned` 构建、实际构建结果收集和 Computer Use E2E 的可执行验证项。
- 人工报告结果：`Passed`。
- 证据边界：该结果来自项目负责人在仓库外设备上的真实执行声明；当前仓库未收到设备型号、操作系统版本、源码提交、逐项命令、原始输出、截图或制品校验值，因此 Agent 没有将其改写为本机执行证据，也不能独立复现或审计这些细节。
- Agent 结论：`Partially verified`。当前 macOS 证据已在仓库内完整记录，其他设备由项目负责人报告通过且人工验收完成；若需要把总体结论提升为可独立审计的 `Verified`，仍需归档外部设备的环境与逐项结果。

## 人工复核

### 2026-07-29 当前技术债收口最终复核

- 复核人：项目负责人（当前用户，本次人工确认）
- 日期：2026-07-29
- 人工确认：项目负责人明确声明已完成全部人工复核、结果通过并授权提交，据此记录其已完成本次范围的人工复核并批准提交。
- 复核基线：`master` 提交 `30425b952bad114d52caa94026cbbd02ece7566b`，以及本文件“2026-07-29 当前技术债收口与证据复核”所列命令、结果、失败重跑和清理证据。
- 范围：LIM-020 Rust 1.90 格式修复、LIM-022 校验器领域拆分、LIM-021 辅助程序层机械缓解、相关测试与文档同步、本次 Worktree/临时分支清理，以及仍开放或缓解技术债和未运行发布检查的准确披露。
- 结论：`Approved`；本次技术债收口交付在上述范围内为 `Verified`。
- 已知并接受的剩余风险：LIM-021 仍为 `Mitigated`；LIM-004、LIM-005、LIM-007 至 LIM-019 保持原状态；Windows/Linux、真实 GitHub 运行器、非 CLI 下游和宿主级写入隔离仍缺可独立审计证据；上一发布门禁任务的三个 Worktree 仍受保守祖先门禁阻断；`initialization.py` 的 682 行职责审查提示继续保留。
- 审批边界：本次人工批准不把未执行检查改写为通过，不改变 `1.0.0` 的 `Unreleased` 状态，也不授权发布构建、Computer Use E2E、打包、签名、上传、创建标签、发布、强制 Worktree 删除或其他新的外部副作用。

### 2026-07-23 项目负责人最终复核

- 复核人：项目负责人（本次人工确认）
- 日期：2026-07-23
- 人工确认：项目负责人明确要求“完成所有人工审批”，据此批准本节所列全部待复核范围，并确认知悉剩余风险。
- 补充确认：项目负责人进一步确认其余项目已在其他设备测试通过，并明确表示“都为我审批了吧，我授权了”；当前所有人工审批因此全部完成。
- 范围：ADR-20260722-013；ADR-20260723-001 至 ADR-20260723-005；最新文档与 18 个项目 Skills；Rust 1.90 MSRV、一次性下游裁剪、条件开发环境门禁、GUI 身份、三类日期记忆、独立、干净的 Git 状态、Tokio 异步边界、GUI `unsigned` 构建、根 `release/` 收集语义；本文件记录的当前 macOS 验证证据与未验证范围。
- 四项下游产品门槛：`Not applicable`（Harness 根目录没有具体产品；随附的资产已单独验证）。
- 结论：`Approved`。
- 剩余风险：其他设备验证由项目负责人报告通过，但环境、命令、输出和制品校验值尚未归档；反馈入口与发布信息仍待确定；仓库外部旧路径引用无法由本仓库扫描覆盖。
- 审批边界：本次授权完成当前全部人工复核和验收，不自动授权发布、签名、上传、破坏性操作或新的外部副作用。
