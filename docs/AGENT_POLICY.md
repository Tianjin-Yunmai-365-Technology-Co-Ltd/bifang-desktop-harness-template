---
schema_version: 1
confirmed_by: pending
confirmed_at: pending
decision_mode: reuse_then_infer_then_ask
superpowers: disabled
parallel_worktree_subagents: pending
milestone_smoke: pending
milestone_e2e: pending
---

# Agent 运行策略

本文件是下游项目 Agent 能力、候选冒烟偏好和构建 E2E 建议默认值的唯一持久事实来源。Harness 源允许使用 `pending` 表示等待下游用户首次确认；完成初始化的下游四项选择只能是 `enabled` 或 `disabled`，且 `confirmed_by`、`confirmed_at` 必须记录真实确认来源和日期。

## 字段语义

- `superpowers`：`enabled` 允许按任务触发名称以 `superpowers:` 开头的 Skills；`disabled` 禁止后续规划、实现、验证和发布调用或遵循这些 Skills。
- `parallel_worktree_subagents`：`enabled` 只表示用户明确要求并行时允许使用 Worktree + 写入型 Subagent；`disabled` 使用单 Agent 当前工作树。持久启用本身不能触发并行步骤。
- `milestone_smoke`：只在完整真实候选验收中，允许 Agent 对候选执行适用的冒烟测试。
- `milestone_e2e`：仅作为每次显式构建询问 E2E 时展示的建议默认值；无论是 `enabled` 还是 `disabled`，都不能替代当前构建的明确选择，也不授权凭据、支付、生产数据、发布或不可逆副作用。
  （`milestone_smoke`、`milestone_e2e` 字段名保留历史 `milestone` 前缀以维持既有 schema 兼容，语义已收敛为完整验收冒烟偏好与构建级 E2E 建议默认值，与已废弃的“快速/标准/里程碑”任务分级模型无关，不得据字段名推断存在任务分级。）
- `decision_mode: reuse_then_infer_then_ask`：复用能力偏好；对 E2E 则先读取建议默认值，再复用当前构建请求中已经明确的选择，否则在构建前询问一次。

`enabled` 表示“允许且适用时优先”，不是无条件执行；`disabled` 表示默认不启用可选能力。安全、产品和渠道硬要求优先于项目偏好，不能用 `disabled` 绕过必需门禁；当前构建的 E2E 明确选择优先于 `milestone_e2e` 建议值。

含 GUI 的一次性初始化 E2E 是脚手架完成门禁，不属于 `milestone_e2e` 管理的发布候选 E2E。无论持久值为何，初始化器都必须在 GUI 唯一基线提交前执行一次真实本机调试二进制检查；非 GUI 初始化不执行该门禁。

## 初始化与持久化

- `$desktop-instantiate-project` 或直接调用的 `$desktop-initialize-rust-project` 先让用户选择“推荐预设”或“自定义”。推荐预设必须显式确认一次；自定义只询问目标用户尚未明确提供的项目，每项至多一次。Harness 源字段值不是下游确认，不能因源文件已有 `enabled` 或 `disabled` 而跳过目标用户选择。
- 推荐预设物化为 `superpowers: disabled`、`parallel_worktree_subagents: enabled`、`milestone_smoke: enabled`、`milestone_e2e: disabled`。Superpowers 默认关闭，只有自定义选择明确启用时才可使用；最后一项只是后续构建询问时的建议默认值。预设只是输入捷径，不新增持久字段，也不得在用户未确认时静默采用。
- 四项值全部解析后才一次原子写入本文件；`confirmed_by` 记录真实确认来源，`confirmed_at` 记录最终收齐日期。由 `$desktop-instantiate-project` 进入 `$desktop-initialize-rust-project` 时只验证并复用，不重复询问。
- `pending` 仅允许存在于 Harness 源和初始化未完成的临时状态。创建下游初始化基线提交前，四项选择、`confirmed_by` 和 `confirmed_at` 都必须已解析，任何 `pending` 都阻断完成。
- 初始化首次写入发生在下游 ADR 尚未创建前，不要求为了引导预建 ADR。初始化后的永久策略变更必须由用户确认，并在当日 ADR 记录原因、影响和恢复条件。
- 临时任务约束可以记录在当前工作计划/验证记录中，但不得静默改写本文件。

## 开发与构建

- GUI 初始化在相关非空单元测试后固定调用 `$desktop-test-gui-initialization-e2e`，验证调试二进制可构建启动、收起侧栏 Logo/全部图标居中和全部渲染菜单页面可达。它不询问 E2E 选择、不改写本文件，也不产生发布候选或 Verification。
- 日常开发直接实施，只运行本次变更需要的单元/回归测试，并只写被独立事件触发的记录；本文件不得成为自动增加 Work Plan、全仓检查、构建、冒烟、E2E 或验收的理由。
- 显式构建必须为当前构建解析一次 E2E 选择。若当前请求已明确 `enabled`/`disabled`，直接复用且不重复询问；否则在任何测试或编译前询问一次，并可把 `milestone_e2e` 作为建议默认选项展示。
- E2E 选择只对当前构建有效，不得静默改写本文件。选择启用或产品/渠道要求时，E2E 只在最终真实候选形成后运行；选择禁用时只在 `release/` manifest 和最终回复记录 `Not run` 与剩余风险。
- 构建请求、执行和结果本身不创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification；构建事实只进入当前 `release/` manifest、其声明的相邻制品证据和最终回复。独立触发的 E2E、完整验收、发布、人工复核或长期审计仍由对应流程按自身规则留证。
- 普通缺陷修复、纯重构等维护类型本身不创建 Product Spec、ADR、Status、Changelog 或 Verification；用户明确要求、跨会话交接、安全、发布和长期决定等独立事件仍按各自门禁记录。

## 执行优先级

1. 安全、批准产品范围和分发渠道硬要求。
2. 当前请求中用户明确给出的约束；构建请求中的 E2E 选择属于本级。
3. 本文件持久策略；`milestone_e2e` 只提供建议默认值。
4. Agent 根据接口、真实产物和批准场景作出的适用性判断。
5. 构建请求尚未明确 E2E 时，在测试或编译前询问一次；其他事项仍无法可靠判断时再询问用户。

执行原则可概括为：能力偏好先复用；E2E 每次构建都必须有当前选择。

## 不受影响的能力

- 本文件不关闭 `.agents/skills/` 中的项目 Skills，也不关闭 Codex 基础工具或安全规则。
- 用户明确要求并行且 Worktree/Subagent 已启用时，仍必须满足独立 Git 根、干净已提交基线、文件所有权、`codex/` 分支、辅助程序 `guard`、前台状态和同步等待规则。
- 除 `$desktop-test-gui-initialization-e2e` 的一次性 debug/no-bundle 门禁外，冒烟/E2E 不得在产品定义、计划、日常开发、单元测试、编译、签名、打包、制品收集或发布元数据命令中运行；启用的发布 E2E 只在最终真实候选形成后执行。
