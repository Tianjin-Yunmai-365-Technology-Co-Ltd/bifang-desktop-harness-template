# 验证记录

## 验证原则

- 只记录真实执行的命令、环境、结果和未覆盖范围。
- Harness 根目录没有具体产品；下游产品的编译、业务测试、最终产品产物和业务验收为 `Not applicable`，但 bundled assets 的对应检查仍必须执行。
- 零测试不构成通过；测试必须覆盖核心成功路径和最高风险失败路径。
- 只对真实运行的系统和工具链给出通过结论；其他平台与宿主标记为 `Unverified`。
- 人工批准不能把失败或未执行的检查改判为通过；Agent 不代替人类签署最终复核。

## 模板验证矩阵

| 层级 | 方法 | 当前要求 |
|---|---|---|
| 文件与链接 | `python3 scripts/validate_harness.py` | 23 个必需固定入口、五类日期记忆正文/索引和本地 Markdown 链接完整 |
| Skills | validator + 逐份语义审查 | 18 个 Skills、UI 元数据、references、scripts 和 assets 与事实源一致 |
| 当前描述 | validator 正向与隔离负向注入 | 已替代的接口、Git、目录、命名和前端默认不得回归 |
| 开发环境门禁 | Python 11 个隔离测试 + shell/PowerShell 静态或原生检查 | Rust-only 与 GUI/WEB 条件下的 Rust/Node.js/pnpm/MSVC 状态、安装、校验和失败退出可审计 |
| Rust asset | 精确 Rust 1.90 | fmt、locked check、Clippy、7 个测试、locked release build、真实成功与失败冒烟 |
| Workflow asset | validator + YAML 解析 + 禁止行为扫描 | 三平台候选结构完整，不自动发布或提升写权限 |
| 人工语义 | 文档与 Skill 契约矩阵 | 适用性、边界、状态和剩余风险无相互冲突的当前硬规则 |

## 2026-07-23 Tokio 异步优先、GUI unsigned build 与根 release 刷新

### 实施与静态证据

- CLI、TUI、MCP Skills 与 baselines 强制 Tokio current-thread async 入口；GUI Skill 与 baseline 复用 Tauri 的 Tokio-backed singleton runtime 并使用 plain `async fn` commands，不创建嵌套 runtime。
- I/O、等待、计时、进程、协议和命令调用优先异步；只有测量确认的 CPU 密集任务才考虑 `spawn_blocking`、专用线程或 multi-thread runtime，同步阻塞依赖必须替换为异步能力或进入范围/硬规则例外确认。
- GUI build/test/artifact/smoke 明确不要求签名身份、证书、notarization 或 updater key；unsigned 状态必须记录，实际分发渠道要求的签名仍单独阻断发布。
- `$collect-release-artifacts` 只刷新 canonical 项目根下非 symlink 的 `release/`：先确定并验证当前项目、版本、源码 commit、build run 的完整来源清单，再清除历史内容并复制精确最新文件集合。初始化 Skill、Harness 根和 bundled asset `.gitignore` 均含 `/release/`。

### 自动检查证据

- 受影响的 9 个 Skills 通过 `quick_validate.py`：`add-cli-adapter`、`add-tui-adapter`、`add-mcp-adapter`、`add-gui-adapter`、`initialize-rust-project`、`collect-release-artifacts`、`build-rust-release`、`prepare-cross-platform-release`、`prepare-release`。
- `python3 -m py_compile scripts/validate_harness.py`：通过。
- `python3 scripts/validate_harness.py`：通过；检查 async/current-thread、GUI unsigned build、release 清理/选择、两份 `/release/` ignore 与旧 `dist/v<version>/`/multi-thread asset 回归。唯一软提示为 validator 1225 行，超过 800 行审查阈值。
- bundled asset 使用精确 Rust 1.90.0 完成 `cargo fmt --check`、locked Clippy `-D warnings`、locked workspace tests、非空测试枚举和 locked release build：全部通过。执行 CLI 黑盒 6 个、core 1 个测试；真实 binary `--version` 返回 `0.1.0`，`scaffold status --json` 返回 `productDefinitionRequired=true`，未批准 `execute --json` 返回预期退出码 2。临时构建目录移入系统废纸篓，可恢复。
- 隔离 release 刷新测试：在任务专用 Git 根创建含普通旧文件与隐藏旧文件的 `release/`，验证 canonical root 与非 symlink 后清出 2 个历史项，只复制 3 个当前 run 文件；最终旧文件不存在、文件数精确为 3、Git 确认 `release/` 被 ignore，并验证 symlink 可在清理前检出。测试目录移入系统废纸篓，可恢复。
- 当前入口残留扫描未发现 bundled asset 仍启用 `rt-multi-thread`、入口仍使用 `multi_thread`、收集 Skill 仍写 `dist/v<version>/` 或保留旧候选的活动语义。

### 官方依据与结论

- Tauri 官方 Rust API 说明其 singleton async runtime 基于 Tokio，并建议 custom command 使用 plain `async fn`；GUI Skill 因此复用 Tauri runtime，而不额外建立 Tokio runtime。
- Tauri 官方平台文档区分构建与分发签名：Windows 可运行 unsigned 应用但可能触发 SmartScreen，Linux 部署不强制签名；macOS 直接分发/App Store 和 updater 等渠道有独立签名要求。
- Agent 结论：`Partially verified`。Skills、Harness 门禁、current-thread Rust asset 和隔离 release 刷新语义通过；项目负责人已于 2026-07-23 完成人工复核，但真实下游和其他平台证据仍缺失。
- 真实 TUI/MCP/GUI 下游、GUI unsigned native build、各渠道签名/公证、Windows/Linux 以及用户实际构建结果的全量收集仍为 `Unverified`。

## 2026-07-23 下游独立 clean Git 与四类开发记忆延迟创建

### 实施与静态证据

- `$instantiate-project` 的固定复制清单现在完整排除 `docs/adr/`、`docs/changelog/`、`docs/product_spec/`、`docs/work_plan/`，不复制索引、日期正文或创建空占位。
- `$define-product`、`$plan-change`、`$implement-change` 分别在首项真实需求、首个真实计划、首次真实可见变更时创建其拥有的记忆目录、索引和当日正文。
- `$initialize-rust-project` 在 scaffold 验证和一次性裁剪后，使用用户已有 Git 身份创建唯一的 `chore: initialize project` 本地基线 commit；身份缺失时阻断，不伪造身份或修改全局 Git 配置。
- 最终 Git 门禁要求 inside-work-tree 为 `true`、top-level 精确等于项目根、分支为 `main`、`HEAD` 可解析、remote 为空且 `git status --porcelain=v1 --untracked-files=all` 无输出。

### 自动检查证据

- `/Users/manonloki/.codex/venvs/skill-creator/bin/python .../quick_validate.py`：`instantiate-project`、`initialize-rust-project`、`define-product`、`plan-change`、`implement-change` 五个受影响 Skill 均通过。
- `python3 -m py_compile scripts/validate_harness.py`：通过。
- `python3 scripts/validate_harness.py`：通过；检查 23 个必需固定入口、18 个 Skills、本地 Markdown 链接、五类 Harness 日期记忆、初始化 clean Git/记忆排除契约、工程规则、环境门禁、workspace 继承和候选 workflow。唯一软提示为 validator 1143 行，超过 800 行审查阈值。
- 隔离 Git 判定：在任务专用临时父 Git 仓库内创建独立子项目，复制一个受控文件，初始化 `main`，使用当前已有 Git 身份创建一个基线 commit；断言子项目 top-level 精确独立、分支为 `main`、commit 数为 1、remote 数为 0、porcelain 状态为空，且四类记忆目录均不存在。命令成功退出，测试目录随后移入系统废纸篓，可恢复。

### 结论与未验证范围

- Agent 结论：`Partially verified`。Skill 结构、Harness 契约、回归门禁和隔离 Git clean 判定通过；项目负责人已于 2026-07-23 完成人工复核，但真实下游前向证据仍缺失。
- 真实 `$instantiate-project` 的完整选择性复制、scaffold、裁剪、基线 commit、首次项目记忆创建以及 Windows/Linux Git 行为仍为 `Unverified`。
- 本次修改初始化与维护流程，不改变 bundled Rust asset、依赖或接口行为，因此 Rust 编译、单元测试、release build 和产物冒烟为 `Not applicable`，未重复执行。

## 2026-07-23 三类项目记忆按日完整快照迁移

### 实施与静态证据

- `docs/PRODUCT_SPEC.md`、`docs/PROJECT_STATUS.md`、`docs/WORK_PLAN.md` 已迁移为 `docs/product_spec/20260723_product_spec.md`、`docs/project_status/20260723_product_status.md`、`docs/work_plan/20260723_work_plan.md`，旧单文件不再存在。
- 三个目录均新增 `README.md`，明确小写 snake_case 日期命名、同日只维护一份、新日读取前一份并综合重写完整快照、最新日期文件为当前事实。
- `AGENTS.md`、README、工程规则、12 个直接受影响的项目 Skills、技术债入口和 Harness validator 已同步；当日 ADR 与 Changelog 已记录本次维护流程变化。

### 自动检查证据

- `python3 -m py_compile scripts/validate_harness.py`：通过。
- `python3 scripts/validate_harness.py`：通过；检查 23 个必需固定入口、18 个 Skills、本地 Markdown 链接、五类日期项目记忆、初始化/工程/依赖/workflow 门禁。
- 隔离负向检查：复制仓库到任务专用临时目录，将 Product Spec 改为错误的 `20260723_PRODUCT_SPEC.md` 并恢复旧 `docs/PROJECT_STATUS.md`；validator 返回非零，并分别报告旧单文件、错误日期命名和缺失合法 Product Spec 正文。隔离副本随后移入系统废纸篓，可恢复。
- 全仓旧路径扫描仅剩本次 Work Plan/ADR 对已删除路径的明确迁移说明，以及 ADR-20260723-001 的历史影响范围；当前入口、Skills 和事实源无旧路径引用。
- validator 唯一软提示：`scripts/validate_harness.py` 为 1123 行，超过 800 行原则拆分阈值。本次新增逻辑仍属于同一日期记忆一致性入口；该提示不影响硬门禁结论，后续新增大块契约前继续复核拆分。

### 结论与未验证范围

- Agent 结论：`Partially verified`。文档结构、索引、关键规则、正向校验和隔离负向校验均通过；项目负责人已于 2026-07-23 完成人工复核，但真实下游跨自然日前向证据仍缺失。
- 本次只改变 Harness 文档治理和 validator，不改变 bundled Rust asset、依赖、接口行为或最终产物，因此 Rust 编译、测试、release build 和产物冒烟为 `Not applicable`，未重复执行。
- 真实下游在跨自然日创建并综合三类新快照的前向行为仍为 `Unverified`；本次已通过索引、Skills 和 validator 固化规则，但尚无第二个自然日的真实执行证据。

## 2026-07-23 一次性下游裁剪、条件开发环境与 GUI identity

### 实施与静态证据

- 新增并纳入 validator 的项目 Skills：`$check-development-environment`、`$prepare-gui-app-identity`；当前共 18 个 Skills。
- 环境门禁脚本、参考和测试已从 `.agents/skills/initialize-rust-project/` 移至独立 `.agents/skills/check-development-environment/`，初始化裁剪不会删除它们。
- `AGENTS.md` 当前为 136 行，包含非空 `## Skills 地图` 与 `## 约束地图`；初始化 Skill 明确要求 scaffold 全部验证后删除实例化/初始化 Skills、模板 validator/方法论和活动派生入口，同时保留两张地图和适用开发 Skills。
- GUI identity Skill 明确收集显示名、主窗口标题、简述、应用标识和图标方向，并要求用户从自动生成、确定性 Plan B、用户上传标准化/高清三条路径中选择；真实应用资料和图标未在 Harness 根生成。

### 自动检查证据

- `python3 -m py_compile scripts/validate_harness.py .agents/skills/check-development-environment/scripts/test_development_environment_gates.py`：通过。
- `sh -n .agents/skills/check-development-environment/scripts/development-environment-gates.sh`：通过。
- `python3 .agents/skills/check-development-environment/scripts/test_development_environment_gates.py`：通过，11 个测试全部成功。覆盖 Rust-only 不探测 Node.js/pnpm、GUI 已有工具不修改、GUI 缺失 Rust/Node.js/pnpm 隔离安装、只读缺失、Rust 1.90 下限与更高 stable、Rust/Node 摘要失败和 Windows MSVC/pnpm 静态契约。
- `python3 scripts/validate_harness.py`：通过，检查 23 个必需文件、18 个 Skills、地图/裁剪契约、条件环境门禁、本地链接、日期记忆、工程规则、workspace 继承和 workflow 门禁。
- 使用任务专用临时 `CARGO_TARGET_DIR` 对 bundled core+CLI asset 运行 `cargo fmt --all -- --check`、locked Clippy `-D warnings`、locked workspace tests 和 locked release build：全部通过；共执行 CLI 黑盒 6 个、core 1 个测试。真实 release binary 的 `scaffold status --json` 返回 `productDefinitionRequired=true`，未批准 `execute --json` 返回预期退出码 2 与 `ok=false`；临时构建目录已由 trap 清理。
- 当前描述残留扫描未发现旧初始化门禁路径、`gate.python`、无条件 Rust+Node 阻断或旧 Python 可选门禁继续存在于当前入口、规范、Skills 或 validator。
- validator 唯一软提示：`scripts/validate_harness.py` 为 1051 行，超过 800 行原则拆分阈值；本次新增检查仍属于同一确定性 Harness 入口，未把软提示误判为通过或失败。

### 结论与未验证范围

- Agent 结论：`Partially verified`。当前 macOS arm64 的 POSIX 脚本语法、11 个隔离测试、Harness 结构和文档/Skill 契约通过。
- 当前宿主没有 `pwsh`，PowerShell 只完成 Python 静态片段检查；Windows 原生 MSVC、Node.js、pnpm 安装与复探为 `Unverified`。
- 真实下游初始化后自裁剪、下游地图内容、Linux 原生门禁、真实 npm registry pnpm 安装、GUI 三类图标路径与 Tauri 平台图标为 `Unverified`。
- Harness 根没有具体产品；下游编译、产品单元测试、最终产物和启动冒烟为 `Not applicable`。项目负责人已于 2026-07-23 完成人工复核。

## 2026-07-23 Rust 1.90 MSRV 同步与全量 Skill/文档复审

### 环境与范围

- 操作系统：macOS 26.5.2 arm64。
- 当前默认 Rust/Cargo：1.97.1；默认工具链未修改。
- 精确 MSRV：`rustc 1.90.0 (1159e78c4 2025-09-14)`、`cargo 1.90.0 (840b83a10 2025-07-30)`。
- Harness 根目录没有 `.git`，因此 branch、commit 与 dirty-worktree 证据为 `Not available`；本次未初始化 Git。
- 逐份复审 16 个项目 `SKILL.md`、16 个 `agents/openai.yaml`、全部 Skill references、所有 Markdown 文档、初始化脚本、bundled Rust asset 和候选 workflow。通用 Skills 均使用项目声明的 MSRV；硬编码下限只存在于需要统一版本的事实源和可执行资产中，并已全部改为 1.90。
- 2026-07-22 精确 Rust 1.85 的执行结果保留在下方历史段，仅证明当日旧基线曾通过，不再构成当前兼容性或发布证据。

### 自动检查证据

- `python3 -m py_compile scripts/validate_harness.py .agents/skills/initialize-rust-project/scripts/test_prerequisite_gates.py`：通过。
- `python3 .agents/skills/initialize-rust-project/scripts/test_prerequisite_gates.py`：通过，11 个测试全部成功；默认兼容 fixture 使用 1.90.0，最低版本失败 fixture 使用 1.89.0，并确认 1.91.0、1.97.1 与未来 2.0.0 stable 均满足最低版本门禁。
- `sh -n .agents/skills/initialize-rust-project/scripts/prerequisite-gates.sh`：通过。
- `python3 scripts/validate_harness.py`：通过，检查 23 个必需文件、16 个 Skills、本地链接、日期记忆、初始化门禁、工程规则、workspace 依赖继承、Rust 1.90 一致性和 workflow 门禁。
- validator 软提示：`scripts/validate_harness.py` 为 1012 行，超过 800 行原则拆分阈值。本轮新增 MSRV 一致性检查属于同一确定性 Harness 入口；为避免扩大兼容性变更，本次保留单文件，后续新增大块契约前必须复核拆分。
- 全仓 `1.85` 扫描：项目 Skills、references、脚本、Cargo assets 和候选 workflow 无旧版兼容声明；剩余命中仅限工作计划/当日 ADR 的迁移说明，以及 2026-07-22 的历史 ADR、Changelog 和真实验证证据。

### 精确 Rust 1.90 bundled asset 证据

- 首次 `rustup toolchain install 1.90.0` 与另一个正在运行的 `cargo +1.90.0 check` 并发，rustup 在恢复既有部分安装时报告目录冲突并自动回滚。只读复查确认 1.90.0、rustfmt 和 Clippy 随后均完整可用，未删除工具链；并发 check 结束后串行重跑正式验证。
- 使用独立临时 `CARGO_TARGET_DIR` 运行 `cargo +1.90.0 fmt --all -- --check`、locked workspace check、Clippy `-D warnings`、测试枚举、locked tests 和 locked release build：全部通过。
- 测试枚举和执行均发现 7 个测试：CLI 黑盒 6 个、core 1 个；不是零测试假阳性。
- 真实 release binary：`--version` 返回 `example_tool_cli 0.1.0`；`scaffold status --json` 返回成功信封并包含 `productDefinitionRequired=true`；未批准的 `execute --json` 返回退出码 2 和结构化失败信封。
- 构建目标位于任务专用临时目录并在验证结束后清理；未修改共享 Cargo target 或锁文件。

### 结论与未验证范围

- Agent 结论：`Partially verified`。当前 macOS arm64 的 Rust 1.90 规范一致性、门禁边界、bundled asset 和真实 CLI 冒烟均通过；项目负责人已于 2026-07-23 完成人工复核，但其他平台和真实下游证据仍缺失。
- Windows、Linux、PowerShell 原生执行、Windows MSVC 真实安装、远程三平台 workflow、TUI/MCP/GUI/WEB 真实下游兼容组合：`Unverified`。
- Harness 根产品四项门槛：`Not applicable`，因为根目录没有具体产品；bundled asset 的通过证据不能替代真实下游产品证据。

## 2026-07-22 Harness 整体验收与最新描述同步

> 以下内容是 2026-07-22 的历史验证事实，已由 ADR-20260723-001 的 Rust 1.90 当前基线替代，不代表继续兼容 Rust 1.85。

### 环境

- 操作系统：macOS 26.5.2 arm64。
- Git：Apple Git 2.50.1。
- Python：3.14.6。
- Node.js：26.5.0。
- 当前 Rust/Cargo：1.97.1。
- 精确 MSRV：`rustc 1.85.0 (4d91de4e4 2025-02-17)`，本机已安装并实际执行。
- Harness 根目录没有 `.git`，因此本次无法记录 branch、commit 或 dirty worktree；未对根目录执行 `git init`。

### 审查范围与结论

- 逐份读取 README、AGENTS、产品规格、状态、Agent policy、工程规则、CLI 契约、Rust 基线、计划、ADR、验证、技术债、发布、Changelog 和相关方法论章节。
- 逐份读取 16 个 `SKILL.md`、16 个 `agents/openai.yaml`、TUI/React/GUI/MCP/prerequisite/capability references、初始化脚本、bundled Rust asset 和候选 workflow。
- 确认当前接口规则为 CLI/TUI/MCP/GUI/WEB 独立可选，显式选择时只创建所选 adapters，空选择才默认 CLI；CLI 契约只对已选 CLI 生效。
- 确认 Draft 生命周期、独立 Git 根、ASCII `snake_case` 派生命名、workspace 依赖集中、Tokio adapter、固定 TUI/React 技术族、superpowers policy、E2E 与人工复核边界一致。

### 发现并同步的差异

1. `docs/HARNESS_ENGINEERING.md` 的实现顺序仍把 CLI 当作所有项目的固定步骤，并隐含 MCP 必须与 CLI 同时存在。已改为 Shared Core 与实际所选接口闭环，并为五类接口分别列出条件验收。
2. README 与 AGENTS 把 `$build-rust-release`、`$prepare-cross-platform-release` 描述成通用 Rust 产物能力，但两个 Skills 当前只实现 Rust CLI。已把入口、Rust 基线和 `$verify-delivery` 的适用性同步为 Rust CLI，其他接口继续使用各 adapter Skill 的构建门槛，统一发布缺口保留为 LIM-015。
3. `$instantiate-project` 已记录 superpowers 选择，随后 `$initialize-rust-project` 又无条件重复询问。已改为同一工作流复用并确认已记录值，直接初始化时才询问。
4. Python 3 是可选门禁，但 `$instantiate-project` 曾无条件要求运行 Python validator。已改为 Python 不可用时如实记录 `Not run` 并继续。
5. 当日 ADR、Changelog 和旧验证摘要同时保留多轮被替代规则，导致检索得到相反结论。依据用户明确决定新增 ADR-20260722-013，合并为最新有效描述，同时保留真实失败、未验证范围和人工复核事实。
6. validator 原先能通过上述方法论冲突。已新增当前描述回归门禁，并通过隔离负向注入证明旧规则会被拒绝。

### 自动检查证据

- `python3 -m py_compile scripts/validate_harness.py .agents/skills/initialize-rust-project/scripts/test_prerequisite_gates.py`：通过。
- 首次错误调用 `python3 -m unittest .agents/.../test_prerequisite_gates.py`：未运行测试；以点开头的路径被 `unittest` 解析为空模块名并返回 1。随后按脚本入口重跑。
- `python3 .agents/skills/initialize-rust-project/scripts/test_prerequisite_gates.py`：通过，10 个测试全部成功，覆盖既有工具不修改、空格路径、Python 可选缺失、Rust/Node 缺失安装、只读缺失、旧 Rust、安装器失败、Rust/Node 摘要失败和 Windows MSVC 契约。
- `python3 scripts/validate_harness.py`：通过，检查 23 个必需文件、16 个 Skills、本地链接、日期记忆、初始化门禁、工程规则、workspace 依赖继承和 workflow 门禁。
- validator 软提示：`scripts/validate_harness.py` 为 963 行，超过 800 行原则拆分阈值。本轮新增逻辑仍属于同一无第三方依赖的确定性校验入口，内部已按命名函数隔离；为避免在文档验收中混入结构重构，本次保留单文件并要求下次新增大块契约前拆分审查。
- 隔离负向检查：复制仓库到临时目录，在方法论文档注入已替代的固定 CLI 规则；validator 返回 1，并精确报告 `stale current description`。临时副本随后移入系统废纸篓，可恢复。
- `sh -n .agents/skills/initialize-rust-project/scripts/prerequisite-gates.sh` 与可执行位检查：通过。
- Ruby `YAML.safe_load` 解析候选 workflow：通过；禁止发布行为扫描确认无 `contents: write`、`cargo publish`、release 创建或 tag 命令。
- PowerShell AST/原生执行：`Not run`，当前宿主没有 `pwsh`；Windows 仍为 `Unverified`。

### Bundled Rust asset 证据

- 当前 stable 1.97.1：`cargo fmt --all -- --check`、Clippy `-D warnings`、locked tests、测试枚举和 locked release build 均通过。共发现并执行 7 个测试：CLI 黑盒 6 个、core 1 个。
- 首次 release 冒烟错误使用相对 `./target/release/example_tool_cli`，因本机 Cargo 配置把 target 目录设为共享路径而返回 127；构建本身已成功，资产未失败。随后按 Cargo metadata 解析真实 target directory 重跑。
- 当前 stable 真实产物 `/Users/manonloki/cargo-target/release/example_tool_cli`：`--version` 返回 `0.1.0`；`scaffold status --json` 返回成功信封和 `productDefinitionRequired=true`；未批准的 `execute --json` 返回退出码 2、stdout 为空、stderr 非空。
- `cargo update --workspace --dry-run`：报告锁定 0 个更新，当前 registry 解析下没有遗漏 Rust 1.85 兼容更新；未修改锁文件。
- 精确 Rust 1.85.0：locked check、Clippy `-D warnings`、7 个测试、locked release build 和相同成功/失败真实产物冒烟全部通过。macOS arm64 的声明 MSRV 证据因此为 `Passed`。

### 适用性与未验证范围

- Harness 根产品四项门槛：`Not applicable`，因为根目录没有具体产品；bundled Rust asset 已单独验证，不能替代真实下游产品证据。
- Windows、Linux、Windows MSVC 真实签名/提权/安装/3010/复探、远程三平台 candidate workflow：`Unverified`。
- 完整 `$instantiate-project` 复制与身份重置、父仓库内真实下游、符号链接和失败回滚：`Unverified`。
- TUI/MCP/GUI/WEB 中性 scaffold、多接口组合、固定技术族兼容版本、superpowers 跨会话执行和 Computer Use 最终产物 E2E：`Unverified`。
- 反馈入口、发布渠道和发布物格式仍待确定。

### Agent 验收结论

- 结论：`Partially verified`。
- 已通过：当前 macOS 的文档/Skill 一致性、当前描述正负向门禁、10 个 prerequisite 测试、workflow 静态检查、Rust stable 与精确 1.85 asset 完整验证。
- 未达到 `Verified` 的原因：真实下游和其他平台证据仍缺失。项目负责人已于 2026-07-23 完成人工复核，人工审批不替代这些技术证据。

## 2026-07-23 人工复核前完整验证重跑

### 环境与结果

- 操作系统：macOS 26.5.2 arm64。
- Harness 根目录没有 `.git`，因此 branch、commit 与 dirty-worktree 证据仍为 `Not available`；本次未初始化 Git。
- 18 个项目 Skills 全部通过 `quick_validate.py`。
- `python3 -m py_compile scripts/validate_harness.py .agents/skills/check-development-environment/scripts/test_development_environment_gates.py`、POSIX shell 语法检查、11 个开发环境隔离测试和 `python3 scripts/validate_harness.py` 全部通过。
- Harness validator 检查 23 个必需固定入口、18 个 Skills、本地 Markdown 链接、五类日期记忆、初始化门禁、工程规则、workspace 依赖继承和候选 workflow；唯一提示为 `scripts/validate_harness.py` 1225 行的非阻断拆分审查项。
- bundled core+CLI asset 使用精确 Rust 1.90.0 完成 fmt、locked workspace check、Clippy `-D warnings`、测试枚举、locked tests 和 locked release build；实际执行 CLI 黑盒 6 个、core 1 个测试，全部通过。
- 真实 release binary 的 `--version` 和 `scaffold status --json` 成功；未批准的 `execute --json` 返回退出码 2、stdout 单一 JSON 失败信封、`ok=false`、错误码 `INVALID_ARGUMENT`，stderr 为空。
- 首次负向冒烟包装脚本错误沿用了旧历史记录中的“JSON 错误写 stderr”假设，因此包装脚本以 1 退出；构建和二进制没有失败。依据当前 `docs/CLI_CONTRACT.md` 和现有 CLI 黑盒测试修正断言后重跑通过。

### 结论与边界

- Agent 结论：`Partially verified`。当前 macOS 的 Harness、Skills、开发环境隔离门禁和精确 Rust 1.90 bundled asset 闭环通过，且人工复核已完成。
- Windows、Linux、真实下游、非 CLI adapters、真实 GUI unsigned build、渠道签名、实际 release 收集和 Computer Use E2E 仍为 `Unverified`；人工批准没有将其改判为通过。
- 本次只记录人工复核与验证证据，不改变产品范围、代码、接口、发布状态或外部系统，因此 Product Spec、ADR 与 Changelog 的功能变更条目为 `Not applicable`。

## 2026-07-23 项目负责人外部设备验证声明

- 证据来源：项目负责人于本次会话明确确认“其他的我在其他设备上测试通过了”，并授权完成全部审批。
- 覆盖范围：此前列为其他设备、Windows/Linux、真实下游、非 CLI adapters、GUI unsigned build、实际构建结果收集和 Computer Use E2E 的可执行验证项。
- 人工报告结果：`Passed`。
- 证据边界：该结果来自项目负责人在仓库外设备上的真实执行声明；当前仓库未收到设备型号、操作系统版本、源码 commit、逐项命令、原始输出、截图或制品校验值，因此 Agent 没有将其改写为本机执行证据，也不能独立复现或审计这些细节。
- Agent 结论：`Partially verified`。当前 macOS 证据已在仓库内完整记录，其他设备由项目负责人报告通过且人工验收完成；若需要把总体结论提升为可独立审计的 `Verified`，仍需归档外部设备的环境与逐项结果。

## 人工复核

### 2026-07-23 项目负责人最终复核

- 复核人：项目负责人（本次人工确认）
- 日期：2026-07-23
- 人工确认：项目负责人明确要求“完成所有人工审批”，据此批准本节所列全部待复核范围，并确认知悉剩余风险。
- 补充确认：项目负责人进一步确认其余项目已在其他设备测试通过，并明确表示“都为我审批了吧，我授权了”；当前所有人工审批因此全部完成。
- 范围：ADR-20260722-013；ADR-20260723-001 至 ADR-20260723-005；最新文档与 18 个项目 Skills；Rust 1.90 MSRV、一次性下游裁剪、条件开发环境门禁、GUI identity、三类日期记忆、独立 clean Git、Tokio 异步边界、GUI unsigned build、根 `release/` 收集语义；本文件记录的当前 macOS 验证证据与未验证范围。
- 四项下游产品门槛：`Not applicable`（Harness 根目录没有具体产品；bundled asset 已单独验证）。
- 结论：`Approved`。
- 剩余风险：其他设备验证由项目负责人报告通过，但环境、命令、输出和制品校验值尚未归档；反馈入口与发布信息仍待确定；仓库外部旧路径引用无法由本仓库扫描覆盖。
- 审批边界：本次授权完成当前全部人工复核和验收，不自动授权发布、签名、上传、破坏性操作或新的外部副作用。
