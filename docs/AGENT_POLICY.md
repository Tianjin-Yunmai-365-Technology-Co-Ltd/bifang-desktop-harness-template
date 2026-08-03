---
schema_version: 1
confirmed_by: pending
confirmed_at: pending
decision_mode: reuse_then_infer_then_ask
superpowers: enabled
parallel_worktree_subagents: pending
milestone_smoke: pending
milestone_e2e: pending
---

# Agent 运行策略

本文件是下游项目 Agent 能力与里程碑验收偏好的唯一持久事实来源。Harness 源允许使用 `pending` 表示等待下游用户首次确认；完成初始化的下游四项选择只能是 `enabled` 或 `disabled`，且 `confirmed_by`、`confirmed_at` 必须记录真实确认来源和日期。

## 字段语义

- `superpowers`：`enabled` 允许按任务触发名称以 `superpowers:` 开头的 Skills；`disabled` 禁止后续规划、实现、验证和发布调用或遵循这些 Skills。
- `parallel_worktree_subagents`：`enabled` 允许 Agent 在任务可安全拆成至少两个无重叠写入单元时自行使用 Worktree + 写入型 Subagent；`disabled` 使用单 Agent 当前工作树。启用不强迫不可拆任务并行。
- `milestone_smoke`：只在当前 Todo 批次全部完成后的验证里程碑中，允许 Agent 对真实里程碑产物执行适用的冒烟测试。
- `milestone_e2e`：只在验证里程碑中，允许 Agent 对真实里程碑产物执行适用的 E2E；它不授权凭据、支付、生产数据、发布或不可逆副作用。
- `decision_mode: reuse_then_infer_then_ask`：先复用本文件，再结合批准场景判断适用性；只有字段缺失/非法、规则冲突、产物可运行性无法建立或需要新的外部授权时才询问用户。

`enabled` 表示“允许且适用时优先”，不是无条件执行；`disabled` 表示跳过可选能力。安全、产品和渠道硬要求优先于项目偏好，不能用 `disabled` 绕过必需门禁。

## 初始化与持久化

- `$instantiate-project` 或直接调用的 `$initialize-rust-project` 先让用户选择“推荐敏捷预设”或“自定义”。推荐路径必须显式确认一次；自定义路径只询问目标用户尚未明确提供的项目，每项至多一次。Harness 源字段值不是下游确认，不能因源文件已有 `enabled` 或 `disabled` 而跳过目标用户选择。
- 推荐预设物化为 `superpowers: enabled`、`parallel_worktree_subagents: enabled`、`milestone_smoke: enabled`、`milestone_e2e: disabled`。预设只是输入捷径，不新增持久字段，也不得在用户未确认时静默采用。
- 四项值全部解析后才一次原子写入本文件；`confirmed_by` 记录真实确认来源，`confirmed_at` 记录最终收齐日期。由 `$instantiate-project` 进入 `$initialize-rust-project` 时只验证并复用，不重复询问。
- `pending` 仅允许存在于 Harness 源和初始化未完成的临时状态。创建下游初始化基线提交前，四项选择、`confirmed_by` 和 `confirmed_at` 都必须已解析，任何 `pending` 都阻断完成。
- 初始化首次写入发生在下游 ADR 尚未创建前，不要求为了引导预建 ADR。初始化后的永久策略变更必须由用户确认，并在当日 ADR 记录原因、影响和恢复条件。
- 临时任务约束可以记录在当前工作计划/验证记录中，但不得静默改写本文件。

## 任务路径

- 快速、标准和里程碑是当前任务的执行路径，不是新的持久策略字段。用户可逐任务选择；未选择时 Agent 按风险自适应判断。
- 快速路径不需要为了记录临时选择创建 Work Plan 或 Verification；标准/里程碑路径、重要阻断和跨会话交接才按项目规则持久化。
- 本文件中的冒烟/E2E 只在里程碑路径消费，不能把普通快速/标准任务自动升级为完整验收；产品、渠道或安全硬要求仍可强制升级。

## 执行优先级

1. 安全、批准产品范围和分发渠道硬要求。
2. 当前任务中用户明确给出的、更严格且不永久改写项目策略的约束。
3. 本文件持久策略。
4. Agent 根据任务拆分、接口、真实产物和批准场景作出的适用性判断。
5. 仍无法可靠判断时询问用户。

执行原则可概括为：先复用、再判断、最后询问。

## 不受影响的能力

- 本文件不关闭 `.agents/skills/` 中的项目 Skills，也不关闭 Codex 基础工具或安全规则。
- Worktree/Subagent 启用后仍必须满足独立 Git 根、干净已提交基线、文件所有权、`codex/` 分支、辅助程序 `guard`、前台状态和同步等待规则。
- 冒烟/E2E 不得在产品定义、计划、Todo 编码、普通静态复核、常规构建、制品收集或发布元数据流程中运行。
