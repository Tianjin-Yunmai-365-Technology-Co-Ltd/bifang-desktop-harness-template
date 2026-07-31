# 项目状态

> 记忆日期：2026-07-31

## 当前阶段

- 产品规格：Approved；2026-07-31 已确认 TodoList/验证里程碑闭环、真实完整产物验收、失败回编码、下游 Harness 升级和四项项目级 Agent 策略。
- Harness 版本：根 `Version.md` 仍记录 `202607301002` / `Unreleased`；本轮尚未进入版本或发布准备。
- 当前变更阶段：TODO-A01 至 TODO-D03 已完成，开发检查通过，验证里程碑 M1 候选已就绪；提交后仍须把完整检查重新绑定到精确源码 commit，人工最终复核保持 `Awaiting human review`。
- 工作区现状：2026-07-30 独立 WEB 移除、GUI/环境门禁调整与 2026-07-31 治理/升级能力已在同一现有工作树完成；用户已授权全部检查通过后提交并推送当前 `master`，未授权 tag、发布或制品上传。
- 当前计划：见 [`docs/work_plan/20260731_work_plan.md`](../work_plan/20260731_work_plan.md)。

## 本次已交付

- `AGENTS.md`、工程/发布规则、README 与相关 Skills 已统一为“Todo 批次持续实现和非空单元测试 → 全部完成后验证完整真实里程碑产物 → 失败重开 Todo 回编码”。
- Mock、stub、占位页面、中性 scaffold、开发预览和仅内部函数结果已明确排除在验收候选之外；`Partially verified` 不能替代已批准范围内缺失逻辑的修复。
- `docs/AGENT_POLICY.md` 以可解析 schema 持久保存 Superpowers、Worktree/Subagent、里程碑冒烟和里程碑 E2E。Harness 源允许 `pending`，初始化后的下游禁止 `pending`；后续复用策略并自主判断适用性。
- `$upgrade-harness` 已实现真实 CLI、默认 dry-run、来源/目标 Git 绑定、所有权清单、三方 baseline、bootstrap audit、逐文件显式 apply、record 和 self-update 顺序；保护/禁回迁/路径漂移均 fail closed。
- validator 已拆分接入策略、Todo/里程碑、workflow 全文件摘要和升级器生产契约；候选 workflow 只产生 `milestoneAcceptance: pending` 传输包，并固定不可变 action commit。
- 独立 WEB 支持已从当前入口移除；Tauri GUI 的 React、TypeScript、Mantine UI、TanStack Router、TanStack Query、Jotai 与 GUI 条件 Node.js/pnpm 门禁继续保留。

## 自动证据

- `$upgrade-harness`：27 个隔离 Git fixture 全部通过；真实 subprocess CLI 覆盖 plan/apply/record、上游单改、下游保留、双方冲突、bootstrap、特殊权限、控制文件漂移、符号链接/空目录 tombstone 与 self-update。
- Harness validator：34 个正负向单元测试通过；覆盖策略占位元数据、重复/缺字段 Todo、未完成 Todo 伪验收、注释绕过、额外 workflow 输入/步骤、可变 action tag 与弱化 ownership。
- 相关既有回归：开发环境门禁 12 个、Worktree helper 10 个、身份改名 4 个测试全部通过；20 个项目 Skills 结构有效。
- 完整 Harness validator、Python 无缓存语法编译、POSIX shell 语法、workflow YAML 安全解析和 `git diff --check` 通过；完整命令和软提示记录在 `docs/VERIFICATION.md`。
- M1 不包含可交互产品最终产物，里程碑冒烟与 Computer Use E2E 均判定为 `Not applicable`，没有在开发或普通验证流程误运行；commit-bound 技术结论将在提交后复验并记录。

## 未完成与剩余风险

- 人工最终复核尚未由项目负责人明确签署；自动技术结论不能代替人类结论。
- `$upgrade-harness` 尚无真实客户下游共同基线；当前仅通过隔离 Git fixture 和生产 CLI 契约，真实身份渲染、mixed 章节合并与长期 self-update 保持 `Unverified`。
- 旧下游没有 `.harness/upstream-lock.json`，首次升级必须 bootstrap audit；该保守路径可能产生较多人工冲突。
- Windows/Linux、PowerShell 原生执行、真实 GitHub runners、非 CLI 下游、真实 Tauri GUI 和真实跨平台里程碑仍为 `Unverified`。
- LIM-016 因可执行升级器和 27 个隔离回归从开放缺口收敛为 `Mitigated`；LIM-004、LIM-005、LIM-007 至 LIM-015、LIM-017 至 LIM-019 及 LIM-021 仍按技术债表状态保留。
- 本轮没有运行 release build、产品冒烟、Computer Use E2E、跨平台候选、签名、tag、发布或制品上传；Harness 仍是 `Unreleased`。

## 下一步

1. 按用户已给出的授权提交当前工作树全部变更并推送当前 `master`；Git 提交/推送不等于人工里程碑签署或发布。
2. 项目负责人复核 `docs/VERIFICATION.md` 的范围、自动证据与剩余风险后，明确给出人工最终结论；届时再写入复核人、日期和结论。
3. 首个真实下游采用 `$upgrade-harness` 时记录有/无旧 lock 的前向证据；在 Windows/Linux 与真实 GitHub runners 补齐平台证据。
