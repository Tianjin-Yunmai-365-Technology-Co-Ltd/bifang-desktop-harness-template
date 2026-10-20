# 2026-10-20 变更记录

本文件由负责人明确授权从旧快照提炼，汇总仍有效的能力，不把历史变化重新声明为本日新增或重新验证。完整旧条目、稳定标识及原始“验证”部分按原次序保留在 [历史原文](CHANGELOG_history.md)；本次归档边界、源码摘要和恢复方法见 [ADR-20261020-001](../adr/20261020_ADR.md)。

## 当前能力与契约

- 仓库边界与初始化：Harness 仅维护可复用工程及中性终端下游；四类接口可独立组合，默认 CLI；先确认双语身份、唯一根、平台、策略和所选能力，再建立独立 Git 并裁剪派生入口。见 [项目入口](../../AGENTS.md) 与 [初始化 Skill](../../.agents/skills/desktop-instantiate-project/SKILL.md)。
- 核心与接口：领域规则、用例和权威状态在 core；CLI 非交互机器协议、TUI 终端状态与 MCP stdio 各自薄适配，文件/进程能力独立批准。见 [工程规则](../ENGINEERING_RULES.md)、[Rust 基线](../RUST_CLI_TEMPLATE.md) 和 [CLI 契约](../CLI_CONTRACT.md)。
- Task 与 Git：项目自动 Task 默认关闭，环境选择独立；真实身份、自主执行、所有权并行及 Local 串行遵守统一 Skill。Git 发布止于本地主分支/tag；冻结的发布后动作持续授权其所选后续路径，不恢复旧的双发布模式或自动资源清理。见 [Agent Policy](../AGENT_POLICY.md) 与 [Task 工作流](../../.agents/skills/desktop-task-workflow/SKILL.md)。
- 依赖与工程门禁：兼容下界、最小特性、真实最低版本验证及 ignored/tracked 锁策略分别判断；标准用户全局工具只按初始化或真实环境失败恢复，项目依赖保持本地；上游自动化使用 Node 标准库且不向下游传播 Python 禁令。文件规模、中文声明注释和按事件记忆均以 [工程规则](../ENGINEERING_RULES.md) 为准。
- GUI 与平台：Tauri/GPUI 按 Cargo 框架隔离，九字段 profile、双语、三态主题、窗口与壳层由各自入口管理；桌面能力及品牌资源按选择生成，禁用无残留。普通进程状态与 Mantine 列表的 URL/session/Query/列偏好例外分开。各平台依赖、能力及打包路径见 [GUI 工程索引](../GUI_ENGINEERING.md) 和 [设计标准](../design_standards/README.md)。
- 版本与候选：下游版本按周期和稳定 ID 管理，维护不升版；Harness 仅正式发布时取上海时间版本。双语日志保存最近十个真实发布版本、每类最多十条；候选只消费已发布源码，CLI 默认当前宿主，跨平台矩阵需明确请求。原子证据、当次 E2E/签名和真实最终产物验收见 [发布规则](../RELEASE.md) 与 [验证规则](../VERIFICATION.md)。
- 升级与知识：三方工程升级保护产品代码、身份、策略、记忆及本地决定；GPUI 知识资产条件传播，taste/Kit 本地来源和许可可追溯；历史查询及本次记忆提炼不冒充真实产品验收。见 [升级 Skill](../../.agents/skills/desktop-upgrade-harness/SKILL.md) 与 [当前有效决定](../adr/20261020_ADR.md)。

## 仍待正式发布物化的既有变化

- `HARNESS-GPUI-ENGINEERING-KNOWLEDGE`（`required_version = pending`）：保留旧快照已记录的 GPUI 依赖/兼容、性能与三平台打包知识分工及 Linux GNU 支持；实际入口见 [GUI 工程索引](../GUI_ENGINEERING.md)。本次整理不提前物化 Harness 时间版本。

## 历史事件的版本绑定

以下仅承接机械门禁需要的稳定标识与原始最低版本，旧的被替代行为不因此恢复；其余原始标识均可在完整归档中检索。

- `HARNESS-FEAT-MANAGED-MULTI-REMOTE-PUBLISH`（`required_version = 202609141917`）：保留原事件的版本绑定；完整原文见归档，当前执行以本文件能力摘要及现行规范为准。
- `HARNESS-FEAT-OPTIONAL-REMOTE-GIT-RELEASE`（`required_version = 202609141917`）：保留原事件的版本绑定；完整原文见归档，当前执行以本文件能力摘要及现行规范为准。
- `HARNESS-CHANGE-MAINSTREAM-LTS-STANDARD-USER-ENVIRONMENT`（`required_version = 202609122231`）：保留原事件的版本绑定；完整原文见归档，当前执行以本文件能力摘要及现行规范为准。
- `HARNESS-FIX-HARNESS-SOURCE-GIT-ONLY-RELEASE`（`required_version = 202609122231`）：保留原事件的版本绑定；完整原文见归档，当前执行以本文件能力摘要及现行规范为准。
- `HARNESS-CHANGE-REMOVE-HISTORICAL-COMPATIBILITY`（`required_version = 202609111732`）：保留原事件的版本绑定；完整原文见归档，当前执行以本文件能力摘要及现行规范为准。
- `HARNESS-FEAT-OPTIONAL-USER-OWNED-TASKS`（`required_version = 202609102343`）：保留原事件的版本绑定；完整原文见归档，当前执行以本文件能力摘要及现行规范为准。
- `HARNESS-CHANGE-SIMPLE-GIT-LIFECYCLE`（`required_version = 202609101621`）：保留原事件的版本绑定；完整原文见归档，当前执行以本文件能力摘要及现行规范为准。
- `HARNESS-FIX-PROJECT-TASK-SEQUENCE-AUTO-INCREMENT`（`required_version = 202609101621`）：保留原事件的版本绑定；完整原文见归档，当前执行以本文件能力摘要及现行规范为准。
- `HARNESS-CHANGE-RELEASE-TIME-AND-REQUIREMENT-FIRST-VERSIONING`（`required_version = 202609281202`）：保留原事件的版本绑定；完整原文见归档，当前执行以本文件能力摘要及现行规范为准。

## 历史证据入口

- [历史“验证”原文](CHANGELOG_history.md#验证)：原测试命令、数量、宿主、跳过、失败及未执行范围原样保留；不因归档重跑或改写。
- [长期验证与人工复核](../VERIFICATION.md#证据分卷)：独立证据卷保持原路径与字节。
- 本次仅实施工程知识校正与记忆整理；本次实际检查在交付回复报告，不用旧证据证明当前平台、构建、签名或 E2E 已通过。
