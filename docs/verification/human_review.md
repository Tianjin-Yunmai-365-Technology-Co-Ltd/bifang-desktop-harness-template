# 人工复核记录

## 人工复核

### 2026-09-11 删除历史兼容层与 v202609111732 发布最终复核

- 复核人：项目负责人（当前用户，本次人工确认）。
- 日期：2026-09-11。
- 人工确认：项目负责人先明确要求删除 `1.0.0` 旧版本标识及一切历史兼容层，随后要求"继续处理残留问题并复核直到逻辑全部一致"，再要求"合并&清理今天之前的 ADR 等，并在完成后重新复核整个项目"，最后明确要求"走完发布流程"并声明"所有问题我现在告诉你都为批准"，据此批准本次发布的全部范围、已记录的迁移成本和剩余风险。
- 复核基线：`master` 源码候选提交 `41ba6eaaff0ece7df02451a997b541bf60b94814`；远端 tag `v202609111732-20260911` 已推送并复读确认与该提交一致。
- 范围：删除 `Version.md` 的 `1.0.0` 旧版本标识及反向门禁；用户可见 Task 序号不再识别历史四字段标题；下游自动 SemVer 门禁 Minor/Patch 严格固定 `0..99` 不兼容历史 `100`（Python/Rust/TypeScript 三端同步）；Agent Policy 升级 `schema_version: 3` 并把 `milestone_smoke`/`milestone_e2e` 改名为 `acceptance_smoke`/`e2e_hint`；`$desktop-curate-harness-memory` 机制首次实际验证可用，迁移 ADR-20260910-002 与 ADR-20260831-002 至 `docs/adr/ADR_history.md`，同时修复此前从未通过的 `docs/adr`/`docs/changelog` 按日文件名门禁；Harness 版本物化为 `202609111732`。
- 自动证据：`python3 -B scripts/validate_harness.py` 与 `--release-review`（35 条历史遗留非阻断行数提示，无新增，无 TODO/FIXME/HACK）均通过；`scripts/` 目录 264 个测试与仓库内全部 41 个 Skill 各自独立测试套件通过（唯一失败为 `desktop-check-development-environment` 工具链探测测试，属本机环境缺口，与本次改动无关，改动前后表现一致）；Rust 中性脚手架资产在声明的最低工具链 1.95.0 上 `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --workspace --all-targets --all-features --locked` 全部通过（7/7 测试）；`.harness/release-context.json` 经 `release_context.py check` 校验为 `valid`。
- 里程碑结论：`Milestone accepted`。
- 冒烟/E2E：Harness 根不是具体最终产品；产品启动冒烟和 Computer Use E2E 为 `Not applicable`，未运行且未记为通过。
- 已知并接受的剩余风险：已有下游项目若仍使用历史四字段 Task 标题、Minor/Patch 曾等于 `100`，或 Agent Policy 仍为 `schema_version: 1/2`，会在下一次校验时立即失败关闭，需要项目负责人手动迁移，详见 `docs/adr/20260912_ADR.md` 中保留的 ADR-20260911-001/002“风险与验证”；`docs/TECH_DEBT.md` 中其余 `Open`/`Mitigated` 条目未受本次改动影响，状态不变。
- 审批边界：本次明确授权提交、推送 `master` 到 `github` 远端，并创建、推送 `v202609111732-20260911` tag；不授权源码归档生成、签名、公证、上传、商店提交或其他真实渠道发布动作。
- 推送证据：`$desktop-manage-git-lifecycle release --version 202609111732 --date 20260911 --remote github` 返回 `status: released`；推送后本地 `HEAD`、远端跟踪分支 `github/master` 与远端 tag `v202609111732-20260911` 三者精确指向同一提交 `41ba6eaaff0ece7df02451a997b541bf60b94814`。

### 2026-08-05 Rust 技术选型事实标准最终复核

- 复核人：项目负责人（当前用户，本次人工确认）。
- 日期：2026-08-05。
- 人工确认：项目负责人在收到九项 Rust 技术选型、能力触发边界、112 个测试、完整 validator、198 文件行数门禁及未运行 Cargo/冒烟/E2E 的完成报告后，明确要求“推送服务端”。
- 复核基线：源码候选提交 `f7b84169eea647f157d27a6dc579f61417001fd0`；完整自动证据见 [`20260805_verification.md`](20260805_verification.md)。
- 范围：Tokio、Axum、Clap、SeaORM、tracing、anyhow、thiserror、serde、jiff 的长期事实标准、能力触发、错误分层、core/adapter 所有权、初始化/实施传播与机械门禁。
- 里程碑结论：`Milestone accepted`。
- 已知并接受的剩余风险：Windows/Linux、真实下游前向应用和九项依赖的具体版本组合仍为 `Unverified`；本轮不包含 Rust 运行代码、构建、产品冒烟或 E2E。
- 审批边界：授权提交并非强制快进推送当前源码、验收记录与状态同步到 `origin/master`；不授权创建 PR、标签、源码归档、发布物或正式发布。
- 推送证据：普通快进推送已把 `origin/master` 从 `8af68bafea831446aad7e1896e5ebe1bcd679112` 更新到验收记录提交 `3fc38ee1222d7195f3670a3c1f75e711a8c485d2`；本状态同步属于同一授权链，不扩大审批边界。

### 2026-08-05 core-first、400 行门禁与版本提升里程碑最终复核

- 复核人：项目负责人（当前用户，本次人工确认）。
- 日期：2026-08-05。
- 人工确认：项目负责人先要求“提升 Harness 工程版本，所有标记为已验收，提交到服务器”，随后对“把当前全部未提交变更纳入本次验收，并将 Harness 版本定为 `202608051301`”明确回复“确认”。
- 复核基线：源码候选提交 `10d6a2de608587af58370282adbb0373e17648fc`；验收前后工作树为空，完整自动证据见 [`20260805_verification.md`](20260805_verification.md)。
- 范围：core-first 与薄适配器硬规则、项目记忆事件触发、人工维护文本 400 行硬门禁、可传播检查器、升级器和长文档/测试拆分、中性 Rust 资产边界，以及 Harness 版本 `202608051301`。
- 自动证据：默认 Harness Python 回归 111/111、升级器隔离 Git 回归 28/28、21/21 Skill 结构、21 个 UI YAML、58 个 Python 和 5 个 Shell 文件解析、196 文件行数门禁、完整 Harness validator、精确 Rust 1.90.0 格式/Clippy/7 个非空测试/release 构建及 core-first 依赖检查全部通过。
- 里程碑结论：`Milestone accepted`。
- 冒烟/E2E：Harness 根不是具体最终产品；产品启动冒烟和 Computer Use E2E 为 `Not applicable`，未运行且未记为通过。
- 已知并接受的剩余风险：Windows/Linux、本轮真实下游前向升级、远端三平台候选矩阵、真实签名/公证和发布渠道仍为 `Unverified`；版本继续为 `Unreleased`。
- 审批边界：授权提交当前源码、验收记录并非强制推送到 `origin/master`；不授权标签、源码归档、签名、公证、发布渠道上传或正式发布。
- 推送证据：首轮 `git push origin master` 以非强制快进方式把服务器 `master` 从 `53ce2c60ec2061a351759eecd2a5b04fe2215e2a` 更新到验收记录提交 `631c91d61800889373c9b48bc5d73c5c27b86d74`；本状态同步属于同一已授权推送链，不扩大审批边界。

### 2026-08-03 构建 Skill 优化、Docs/Skills 中文化与待复核里程碑统一批准

- 复核人：项目负责人（当前用户，本次人工确认）。
- 日期：2026-08-03。
- 人工确认：项目负责人明确要求“将一切批准，并提交代码并推送”，据此批准当前全部待人工复核范围、已记录剩余风险，以及把审批记录提交并推送到 `origin/master`。
- 复核基线：`master` 源码候选提交 `d2cb44f293fec888d7e66c38345b4df8baa4ebaf`；提交后工作树为空，并在该精确提交上重新执行本文件 2026-08-03 两节所列完整自动检查。
- 范围：2026-08-03 构建 Skill 默认三平台/派发前回退、根 `release/` 安全刷新、条件签名与精确候选文件集；Docs 与 20 个项目 Skills 中文化；以及此前仍为 `Awaiting human review` 的 2026-07-31 Todo/里程碑闭环、持久策略与 Harness 升级能力 M1。
- 自动证据：Harness/发布单元回归 50/50；身份改名 4/4、开发环境 12/12、Harness 升级 27/27、并行 Worktree 10/10、发布目录当前可运行用例 4/4；20/20 Skill 结构；精确 Rust 1.90 格式、检查、Clippy、7/7 测试和发布配置构建；23 个 Python 文件语法、21 个 YAML 文件解析、全部 POSIX Shell 语法、PowerShell BOM、工作流摘要、完整 Harness 校验器、差异和干净工作树门禁均通过。
- 里程碑结论：2026-07-31 M1、2026-08-03 构建 Skill 优化 M1、2026-08-03 中文化 M2 均为 `Milestone accepted`。
- 冒烟/E2E：这些里程碑交付物是 Harness 源码、维护 CLI、Skills、校验器和文档，不是需要启动交互的最终产品；项目负责人同时批准其 `Not applicable` 判断。未运行产品冒烟或 Computer Use E2E，不将其记为通过。
- 已知并接受的剩余风险：当前 macOS 没有 `pwsh`，3 个 PowerShell 原生用例跳过；Windows/Linux、真实 GitHub 三平台运行器、提供方取回、真实签名钩子/凭据、TUI/MCP/GUI 统一跨平台候选和长期真实下游仍为 `Unverified`；完整 Harness 校验器的 8 个文件拆分提示继续为非阻断审查项。
- 审批边界：本次明确授权提交和推送当前源码及审批记录；不授权创建标签、修改 `Unreleased` 状态、触发远端矩阵、配置或使用真实签名凭据、公证、正式发布或发布上传。
- 推送证据：`git push origin master` 以非强制快进方式成功把 `origin/master` 从 `3f8f289` 更新到审批记录提交 `1fb3182b505e4b3befb6ec01efa281d74ad93222`；本状态同步记录属于同一已授权推送链，不扩大审批边界。

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
