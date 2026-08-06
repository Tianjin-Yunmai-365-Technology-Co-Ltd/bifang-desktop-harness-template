# 项目状态

> 记忆日期：2026-08-06

## 当前阶段

- 产品规格：Approved；core-first、薄适配器、事件触发项目记忆、文件 500 行语义复核/2000 行硬门禁和 Rust 技术选型事实标准是当前产品与工程约束。
- 当前里程碑：Rust 技术选型源码候选 `f7b84169eea647f157d27a6dc579f61417001fd0` 已通过完整适用门禁并取得项目负责人最终复核，结论为 `Milestone accepted`；源码和验收记录已通过普通快进推送到服务器。
- 发布状态：`Unreleased`。本次文件规模治理调整不创建 tag、源码归档、签名、公证、发布渠道上传或正式发布。
- 当前计划：见 [`docs/work_plan/20260806_work_plan.md`](../work_plan/20260806_work_plan.md)；TODO-L01 至 TODO-L03 已完成，本次标准路径治理调整已收口。

## 已完成基线

- 所有接口无关业务、领域校验、用例编排和稳定错误由共享 core 实现并测试，CLI/TUI/MCP/GUI 只保留运行时、协议、展示、交互和结果映射职责。
- Harness validator、初始化、实施、验收和升级路径统一消费可传播的 core-first 与文件规模检查器。
- 升级器、Harness validator 回归、Verification 和方法论文档已按职责拆分，历史失败、人工签署、测试发现、路径安全和升级所有权事实保持完整。
- Harness 当前时间版本为 `202608051301`，起始值为 `202607301002`，状态为 `Unreleased`。
- Rust 技术选型固定为 Tokio、Axum、Clap、SeaORM、tracing、anyhow、thiserror、serde 与 jiff，并以能力触发避免中性 scaffold 预装未使用依赖。

## 当前自动证据

- 已完成的 Rust 技术选型候选在精确提交上通过默认 Python 回归、升级器隔离 Git 回归、Skill 结构、YAML/Python/Shell 解析、当时适用的文件行数门禁和完整 Harness validator。
- 中性 Rust 资产在精确 Rust 1.90.0 上通过格式、锁定依赖检查、Clippy、7/7 非空测试、release 构建和 core-first 依赖图检查。
- 里程碑验收前后候选提交未漂移且工作树为空；证据见 [`docs/verification/20260805_verification.md`](../verification/20260805_verification.md)。
- 本次 500/2000 文件规模治理通过 115/115 默认 Python 回归、完整 Harness validator、统一行数检查器和差异检查；当前没有 501 至 2000 行复核候选或 2001 行以上违规。

## 未运行与剩余风险

- 501 至 2000 行的保留依赖 Agent 对高内聚、职责单一和职责相近性的语义复核，机械检查器只负责稳定列出候选。
- 产品启动冒烟与 Computer Use E2E 对本次治理变更为 `Not applicable`，不运行且不记为通过。
- Windows/Linux、真实下游前向升级、远端三平台矩阵、签名、公证、发布归档和发布渠道保持 `Unverified` 或未执行。
- 当前没有 `release/` 归档、SHA-256、manifest 或 Git tag，不声明正式发布 `Ready`。

## 下一步

1. 在首个真实下游继续收集 core-first、技术选型、500/2000 文件规模治理和 Harness 升级的前向证据；未运行平台保持 `Unverified`。
2. 后续出现 501 至 2000 行文件时，必须记录高内聚、职责单一和职责相近性复核；任一项不满足时按职责拆分，Rust 使用目录/`mod.rs` 结构。
