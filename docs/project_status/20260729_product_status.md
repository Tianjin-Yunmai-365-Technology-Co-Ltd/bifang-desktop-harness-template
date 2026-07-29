# 项目状态

> 记忆日期：2026-07-29

## 当前阶段

- 产品规格：Approved；2026-07-29 已批准逐任务授权的并行 Worktree/Subagent 前台协作、开发/发布验证分层，以及发布构建前逐项选择的手动验收门禁。
- Harness 版本：根 `Version.md` 记录 `1.0.0` / `Unreleased`；模板没有具体产品业务代码或最终应用产物。
- 当前变更：技术债收口任务已完成本地可执行范围。LIM-020 与 LIM-022 已关闭；LIM-021 已在 Worktree helper 范围内机械缓解，但宿主级绕过仍未解决，保持 `Mitigated`。外部前置条件未满足的债项继续开放；版本保持 `Unreleased`。
- 当前计划：见 [`docs/work_plan/20260729_work_plan.md`](../work_plan/20260729_work_plan.md)。

## 已完成且仍有效

- 独立下游 Git 根、一次性初始化裁剪、Rust 1.90、shared core、五类接口独立可选、条件开发环境、身份全量改名、按日项目记忆和双语企业专有许可继续有效。
- 2026-07-28 的开源/闭源商业化调研报告已经生成并验证；它们仍是内部策略研究，不改变当前许可、产品范围或发布状态。
- 当前 macOS 的历史 Harness、Skills、bundled core+CLI 和身份改名证据继续保留，但不能替代本次变更后的发布前重新验收。

## 最近已完成

- 明确每个适用任务的并行授权不跨任务继承；纯问答、只读调查与即时安全处置不触发询问。
- 明确写入型 Subagent 使用独立 Worktree/分支，主 Agent 公开所有权和阶段状态并同步等待；不可安全拆分时退回单 Agent。
- 明确日常开发仍执行非空单元测试及变更相关验证；最终产物、完整冒烟、跨平台与人工复核默认延迟到构建或发布准备，E2E 按本次手动选择或硬要求执行。
- 确认 Computer Use E2E 等重型、交互式或真实环境验收只能在用户发起构建/发布任务时，于首次发布构建前逐项选择；产品/渠道硬要求不能跳过。
- 确认基础编译、非空单元测试、相关集成/契约、产物存在性和只读启动冒烟仍为不可跳过门禁；已启用手动验收在产物构建后、打包前失败、超时、取消或未执行都会阻断打包。
- 当天完整 Product Spec 和四个独立 ADR 条目已纳入当前有效需求与取舍。
- 新增 `$run-parallel-worktrees`、安全 Worktree 助手、4 个隔离单元测试和 UI 元数据；20 个项目 Skills 全部通过 Skill Creator 校验。
- AGENTS、README、实例化/初始化、规划/实施/验收/发布和五类 adapter Skills 已同步任务级授权、下游保留、可见状态、同步等待与拒绝回退。
- 工程规则、Rust 基线、验证、发布和 validator 已同步开发门禁与发布门禁分层；正向 validator 和两项隔离负向回归通过。
- 14 个直接相关 Skills 已统一为“证据复核不自动构建/E2E；只在用户发起构建或发布准备时逐项选择”；全部 20 个项目 Skills 再次通过 Skill Creator 校验。
- 候选 workflow 只接受手动 dispatch 和显式构建确认；可选重型验收使用仓库维护的固定入口，禁止 dispatch 任意命令输入，缺失入口时 fail closed。选择后未通过、基础门禁失败或矩阵任一平台失败都会阻止对应打包/上传路径继续。
- 新增 10 个 workflow validator 单元测试，覆盖正向契约、命令注入、决策缺失/错序、Unix/Windows 打包与上传门禁、打包步骤缺失、非法终态、矩阵继续运行和重型检查非零失败；另有 Worktree 4 项、环境 11 项、身份改名 4 项测试通过。
- Harness validator 已通过 31 个必需文件、20 个 Skills、五类日期记忆和手动验收/打包门禁；YAML 解析、Python 编译与空白检查通过。
- Bundled CLI 的 5 处 Rust 1.90 rustfmt 差异已机械修复；精确 Rust 1.90 fmt、locked check、Clippy `-D warnings` 和 7 个非空测试通过。
- Harness validator 已保留 68 行单一入口并拆为 6 个领域模块；11 个入口/正负向测试和完整 validator 通过，最大模块 682 行，仅保留非阻断职责审查提示。
- Worktree helper 新增 `guard`，机械校验实际 cwd、Git 根、登记 Worktree、分支和解析后写入目标；10 个成功/故意越界测试通过，能力边界明确不替代宿主 sandbox。
- 本次三个 Subagent 单元已完成 guard 复核、整合与总验证；三个 Worktree 和对应临时分支已清理，无必需 Subagent 留在后台。

## 未完成与剩余风险

- 尚未在真实 Codex Subagent 宿主中执行一次多 Worktree 前台协作 E2E；不同宿主的状态展示能力仍可能不同。
- 本轮观察到一个 Subagent 两次绕过声明的 Worktree 所有权直接提交主分支；提交均在范围内并经主 Agent 审查、修复和复验，但当前宿主尚未机械强制写入边界，见 LIM-021。
- 上一发布门禁任务的三个 Worktree 均干净，但因主分支采用 cherry-pick 或串行替代提交，其分支不是 `master` 的祖先；按保守清理规则没有自动移除，后续需由项目负责人单独决定如何收口。
- Windows/Linux、PowerShell 原生执行和非 CLI 下游的既有 `Unverified` 边界继续存在。
- 候选 workflow 只完成静态、单元和 YAML 解析验证，尚未在真实 GitHub 三平台 runner 或真实下游固定重型验收脚本上执行。
- `scripts/harness_validation/initialization.py` 为 682 行，低于 800 行原则拆分阈值但超过 400 行主动职责审查阈值；当前职责仍围绕初始化契约，后续实质扩展时继续复核。
- helper guard 不能阻止绕过 helper 的宿主写入；LIM-021 仅为 `Mitigated`，不同 Codex 宿主的全局写入隔离仍为 `Unverified`。
- LIM-004、LIM-005、LIM-007 至 LIM-019 的开放或缓解项仍依赖反馈入口、真实下游、外部平台、runner、渠道或采用数据，本地仓库修改不能替代这些证据。

## 下一步

1. 项目负责人依据 `docs/VERIFICATION.md` 的实际证据签署或拒绝本次最终人工审批；Agent 不代签。
2. 后续在 Codex 宿主或 sandbox 层强制 Subagent 可写根，复验绕过 helper 的越界场景后再决定是否关闭 LIM-021。
3. 在真实下游、Windows/Linux 和 GitHub runner 条件具备时，分别建立任务处理仍开放的外部证据债项。
4. 用户发起构建或发布准备时，重新选择本次手动验收项并执行不可跳过的完整发布基础闭环。
