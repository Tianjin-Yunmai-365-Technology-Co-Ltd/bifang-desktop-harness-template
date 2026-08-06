---
name: implement-change
description: 实施范围清楚的直接请求或活动 Work Plan，并运行与风险相称的验证。快速路径可直接调用；标准/里程碑路径执行精简 Todo，里程碑失败时回到本 Skill 修复。
---

# 实施变更

完成当前授权范围，不为了流程形式扩大工作。

## 工作流程

1. 确认路径：清楚、局部、可逆且无硬触发器时为 `快速`；有活动计划时按其 `标准`/`里程碑` 路径；发现安全/隐私、数据迁移、破坏性操作、凭据/生产/付费副作用、建立或改变对外兼容契约、渠道硬要求、签名/发布或跨平台最终候选时立即升为里程碑并补计划。只修正文档对既有契约的描述不视为契约变化。
2. 渐进读取事实：始终检查 `AGENTS.md`、Agent Policy、`docs/ENGINEERING_RULES.md`、Git 根/分支和工作区；只在相关时读取 Product Spec、活动 Work Plan、ADR、Verification、Technical Debt 及接口/能力参考。保留用户修改，重叠无法安全处理时停止。
3. 需要实际代码工具链且当前宿主/接口/约束没有可复用成功证据时，调用 `$check-development-environment`；纯文档/元数据任务跳过。
4. `parallel_worktree_subagents: enabled` 且至少有两个无重叠写入单元、干净已提交基线和 Worktree 门禁时可使用 `$run-parallel-worktrees`；否则直接单 Agent，不重复询问。
5. 快速路径直接实现请求中的最小完整行为。标准/里程碑路径选择依赖已满足的首个非 `done` Todo，标记 `in_progress`，完成后再推进下一项。
6. 追踪真实执行路径，不留下模拟实现、桩、占位或仅有源码的片段。Core-first 是硬规则：接口/宿主无关的领域类型、业务规则、语义校验、默认值、用例编排、状态转换、稳定错误、平台无关权限、迁移和持久化策略必须在 core 中实现，即使当前只有一个适配器。适配器只能拥有运行时装配、接口语法/协议结构、展示/纯交互状态、调用 core 和结果映射；包含条件、重试或状态决策的多次 core 调用必须提升为单个 core 用例 API。
   Rust 实现按 `docs/RUST_CLI_TEMPLATE.md` 采用固定技术族：Tokio、Axum、Clap、SeaORM、tracing、anyhow、thiserror、serde、jiff。只为已批准且存在真实使用路径的能力引入对应依赖；偏离固定技术必须先走硬规则例外 ADR，不能以个人偏好或已有熟悉度替换。
7. 修改 adapter 前先记录“适配器操作 → core API → core 测试”映射。若不存在可复用 core 用例，先实现 core；若本次只改布局、协议映射、系统托盘、窗口、终端恢复或 stdio 生命周期等接口/宿主机制，记录其专属性及为什么没有 core 变化。适配器只拒绝无法解析、缺少协议字段或违反宿主能力约束的输入；值域、跨字段约束、资源状态、业务权限和影响业务结果的默认值交给 core。
8. 代码行为变化新增或更新相关非空测试：业务行为先由 core 测试覆盖成功路径和最高风险领域失败，再由适配器测试覆盖映射与接口契约；缺陷修复增加回归测试。纯文档、元数据、格式或不可合理单测的机械变更使用链接、解析、静态、现有回归或差异检查，不创建空洞测试。
9. 从窄到宽运行最小充分验证：相关测试，以及按风险需要的格式、代码规范、静态、集成和契约检查。每次变更都必须通过当前平台可用的 Python 3 解释器运行 `.agents/skills/implement-change/scripts/check_file_line_limits.py`；对检查器列出的 501 至 2000 行候选，逐项复核业务是否高内聚、职责单一且职责相近，任一项不满足时按职责重构拆分；任一人工维护文本超过 2000 行时必须先拆分，不得以警告或 ADR 降级。Rust 模块拆分使用 `<module>/mod.rs` 目录结构。Rust core/adapter 变化时再运行 `.agents/skills/implement-change/scripts/check_core_first.py`；Python 不可用时，行数门禁阻断完成，core-first 则使用 `cargo metadata --no-deps --locked --format-version 1` 执行等价依赖图审查并记录结果。修复范围内失败并重跑；本 Skill 不运行冒烟/E2E。
10. 标准/里程碑 Todo 只有实现与必需检查通过后才标记 `done`；仍有可执行 Todo 时继续。快速路径无需为了状态管理创建 Work Plan。
11. 只更新被独立事件触发的记忆：产品边界变化转 `$define-product`；长期重要决定/硬规则例外写 ADR；里程碑、重要阻断、交接或用户要求更新 Product Status；符合 Changelog 索引范围的新增、行为/契约变化、移除、安全事项和重要已知问题写 Changelog；里程碑/发布/人工复核或长期审计证据写 Verification。普通缺陷修复、不改变可观察行为的纯重构、格式整理、测试补强和内部清理本身不触发 Product Spec、ADR、Product Status、Changelog 或 Verification，结果只在最终回复和测试/CI 中报告；复杂度仍可独立触发 Work Plan，安全、发布和其他硬门禁仍优先。未触发时不写“不适用”占位。
12. 里程碑路径在全部 Todo 为 `done` 后把完整真实候选交给 `$verify-delivery`；标准路径只有真实交付目的或用户选择时才升级。快速路径完成相关检查后直接报告结果。

## 边界与输出

- 实施授权不授权破坏性迁移、凭据使用、签名、发布或其他新外部副作用。
- 开发检查不代表里程碑验收或发布就绪。
- 报告所选路径、变更、每个公开操作的“适配器操作 → core API → core 测试”映射或 adapter-only 理由、测试/替代验证、已修复失败、未执行项和剩余风险；只有活动计划存在时报告 Todo 状态。
