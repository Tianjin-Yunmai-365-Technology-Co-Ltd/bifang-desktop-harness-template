# Harness 知识与规则索引

从 [Agent 启动路由](../AGENTS.md) 判断任务，再按下表读取命中的事实源。本页只说明资料的职责与传播范围；具体规则以链接的文件为准。

| 资料类型 | 入口 | 何时读取 | 下游传播 |
|---|---|---|---|
| 工程与交付规则 | [工程规则](ENGINEERING_RULES.md)、[Agent 策略](AGENT_POLICY.md)、[Rust 与接口基线](RUST_CLI_TEMPLATE.md)、[发布](RELEASE.md)、[验证](VERIFICATION.md) | 当前任务触及对应边界时 | 按实例化与升级的受管清单选择；策略和项目事实受保护 |
| 客户端专项标准 | [设计标准索引](design_standards/README.md)、[客户端工程索引](GUI_ENGINEERING.md) | 已选界面、框架或目标平台需要时 | 设计标准作为中性工程资料传播；不代表目标平台已验证 |
| 项目记忆 | [产品规格](product_spec/README.md)、[ADR](adr/README.md)、[变更记录](changelog/README.md)、[当前状态](project_status/README.md)、[工作计划](work_plan/README.md)、[验证历史](VERIFICATION.md) | 各自独立事件触发时，只读命中的索引与最新记录 | Harness 的历史记录不复制到新下游；下游自行生成并保护 |
| 能力操作与专项知识 | [Skills 分类索引](../.agents/skills/README.md)、各 Skill 的 `references/` | 选中具体任务和 Skill 后按需读取 | 仅保留适用 Skill；其引用随 Skill 保留 |
| Harness 方法论 | [方法论入口](HARNESS_ENGINEERING.md) | 理解设计方法或维护 Harness 时 | 仅上游保留，不作为下游产品事实 |
| 技术快照 | 工作区根 `knowledge/README.md`、[提取 Skill](../.agents/skills/desktop-extract-technical-docs/SKILL.md) | 明确提取或刷新时，先核对快照所列 HEAD 与日期 | 本地派生产物，Git 忽略；不随初始化或升级覆盖 |

## 创建与维护路线

- [创建终端下游的阶段图](PROJECT_CREATION.md)：本 Harness 上游的导航；表单、准备、初始化、裁剪和基线各有独立负责人。
- [下游升级 Skill](../.agents/skills/desktop-upgrade-harness/SKILL.md)：已有终端项目的工程层传播与受保护文件边界。
- [技术债](TECH_DEBT.md)：当前已知限制；不要用旧快照或未运行的平台声明替代实测证据。

`docs/` 保存当前规范与按事件形成的原始记录。`knowledge/` 只描述提取时的源码快照；两者内容冲突时回到当前源码及本页所指的权威来源核对。
