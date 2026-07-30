# 项目状态

> 记忆日期：2026-07-30

## 当前阶段

- 产品规格：Approved；2026-07-30 已批准把并行 Worktree/Subagent 询问进一步收窄到代码/实现阶段，并批准 Harness 使用上海时区 `YYYYMMDDHHMM` 时间版本。
- Harness 版本：根 `Version.md` 记录 `202607301002` / `Unreleased`，`1.0.0` 仅保留为旧版本标识；模板没有具体产品业务代码或最终应用产物。
- 当前变更：协作询问、版本规则、相关 Skills、validator 和项目记忆已按单 Agent 当前工作树流程同步；本地必需检查全部通过，项目负责人已批准当前工作树全部变更。不改变 Worktree 隔离、前台可见性、验证分层、下游 SemVer 或发布门禁。
- 当前计划：见 [`docs/work_plan/20260730_work_plan.md`](../work_plan/20260730_work_plan.md)。
- Git 状态：主实现提交 `daecc6c` 已推送到 `origin/master`；本次未创建 tag 或正式发布。

## 已完成且仍有效

- 独立下游 Git 根、一次性初始化裁剪、Rust 1.90、shared core、五类接口独立可选、条件开发环境、身份全量改名、按日项目记忆和双语企业专有许可继续有效。
- 并行模式仍需当前编码/实现任务明确授权，只在至少两个独立写入范围可安全拆分时使用；写入型 Subagent 仍使用独立 Worktree/分支和 helper `guard`。
- 主 Agent 仍须公开所有权与阶段状态、同步等待全部必需结果；重叠写入转为串行。
- 开发/发布验证分层和发布构建前手动验收门禁继续有效。
- 2026-07-29 技术债收口范围已获人工批准；LIM-020、LIM-022 已关闭，LIM-021 保持 `Mitigated`，Harness 整体仍为 `Partially verified`。
- 2026-07-30 当前变更范围已获项目负责人人工批准并达到 `Verified`；外部平台、真实下游、发布制品和开放技术债仍使 Harness 整体保持 `Partially verified` / `Unreleased`。

## 本次范围

- 将协作询问触发条件从设计与编码阶段进一步收窄为仅代码/实现变更。
- 明确产品定义、范围设计、实施计划设计和其他非编码阶段不询问。
- 将 Harness 版本从旧 `1.0.0` 迁移为上海时区 `YYYYMMDDHHMM`，当前值为 `202607301002`；下游版本规则不变。
- 同步 `AGENTS.md`、README、相关 Skills、`Version.md`、发布规则和 Harness validator。
- 以 2026-07-30 Product Spec、Product Status、Work Plan、ADR、Verification 和 Changelog 保存当前事实与证据。

## 未完成与剩余风险

- 阶段边界依赖 Agent 按任务目的判断；混合任务只在进入实际编码/实现前询问一次。
- 分钟级版本无法表达同一分钟内的多个不同版本，当前规则要求等待下一分钟。
- helper guard 不能阻止绕过 helper 的宿主写入，LIM-021 仍为 `Mitigated`。
- Windows/Linux、PowerShell 原生执行、非 CLI 下游和真实 GitHub runner 的既有 `Unverified` 边界继续存在。
- LIM-004、LIM-005、LIM-007 至 LIM-019 仍依赖外部前置条件。

## 下一步

1. 后续观察实际任务中编码阶段判断是否稳定；若混合任务频繁产生歧义，以新 ADR 进一步明确优先级。
2. 用户发起构建或发布准备时，直接进入对应流程，不再询问并行模式；手动验收仍按发布构建前门禁单独选择。
3. 在真实编码与非编码任务中积累前向证据，复核 validator 的静态契约和时间版本排序是否与实际行为一致。
