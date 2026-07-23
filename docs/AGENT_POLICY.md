# Agent 运行策略

本文件是下游项目 Agent 能力开关的唯一持久事实来源。

- `superpowers: enabled`

下游初始化后的合法值只有 `superpowers: enabled` 或 `superpowers: disabled`。

## 执行规则

- `$instantiate-project` 必须询问用户是否关闭 superpowers 并写入最终选择；同一工作流随后调用 `$initialize-rust-project` 时复用并确认该值，不重复询问。直接调用 `$initialize-rust-project` 时必须自行询问并写入。
- `enabled` 表示可以按任务触发名称以 `superpowers:` 开头的 Skills；它不要求必须使用。
- `disabled` 表示所有后续规划、实现、验证和发布工作均不得调用或遵循名称以 `superpowers:` 开头的 Skills，即使它们已安装或被自动推荐。
- 该开关不影响本仓库 `.agents/skills/` 中的项目 Skills，也不关闭 Codex 的基础工具或安全规则。
- 修改本字段属于用户策略决定，必须同步当日 ADR；Agent 不得自行翻转。
