# 2026-07-29 Changelog

## Added

- 新增 `$run-parallel-worktrees` 项目 Skill：每个适用任务只有在用户当次明确同意后，才把可独立写入的工作单元分配给独立 Git Worktree 和 `codex/` 分支中的 Subagent。
- 新增确定性 Worktree 助手及 4 个隔离单元测试，支持只读检查、安全创建和仅对已整合干净单元的保守移除；自动 stash、commit、force remove 和删分支均不在能力范围内。
- Harness validator 新增逐任务授权、所有权隔离、前台状态节点、同步等待、安全清理和开发/发布分层验证契约。

## Changed

- Agent 在每个会修改仓库或执行交付工作的任务开始前询问一次是否启用并行模式；授权不跨任务继承。拒绝、未答复或不可安全拆分时继续单 Agent 当前工作树流程。
- Subagent 协作必须向用户公开工作单元、所有权、启动、阻塞、阶段完成、整合与验证状态，并同步等待全部必需结果；不再把整轮协作作为用户不可见的后台工作。
- 普通开发轮次继续运行非空单元测试和变更相关验证；最终产物构建、完整启动冒烟、跨平台候选、归档和人工最终复核延迟到用户发起构建或发布准备时，并在该阶段基于当前源码重新运行。
- Computer Use E2E 及同类重型、交互式或真实环境验收改为发布构建前逐项选择：只有用户当次启用或产品/渠道明确要求才运行；先构建最终产物，再在打包、上传、收集、签名或发布前执行。失败、超时、取消或选择后未执行都会阻断当前任务继续打包。
- 编译、非空单元测试、相关集成/契约、产物存在性和真实产物只读启动冒烟继续作为不可跳过的发布基础门禁；未启用且非硬要求的手动验收记录 `Not run` 与风险后可继续。
- `$instantiate-project`、`$initialize-rust-project` 明确保留下游并行协作 Skill 与逐任务授权入口；规划、实施、验收、发布、五类 adapter Skills、最终产物 E2E、工程规则、Rust 基线、验证和发布文档已同步上述边界。

## Verification boundary

- Worktree 助手 4 个隔离单元测试、20 个 Skills 的 Skill Creator 校验、Python 编译检查、Harness validator 正向检查和两项隔离负向契约检查已通过。
- 本轮不是发布准备；bundled Rust release build、最终产物启动冒烟、真实多 Subagent/Worktree E2E、跨平台候选和人工最终复核未运行，不构成 Harness 发布就绪证据。
- 本次发布构建前门禁变更的政策契约单元只执行文档语义审查和 `git diff --check`；相关 Skills、workflow/validator、整合单元测试与 Harness validator 结果待实际整合后记录，不提前声明通过。
