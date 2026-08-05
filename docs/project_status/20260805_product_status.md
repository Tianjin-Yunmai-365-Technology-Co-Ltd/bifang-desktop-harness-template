# 项目状态

> 记忆日期：2026-08-05

## 当前阶段

- 产品规格：Approved；core-first、薄适配器、事件触发项目记忆、人工维护文本 400 行硬门禁和 Rust 技术选型事实标准已经成为当前产品与工程约束。
- 当前里程碑：Rust 技术选型源码候选 `f7b84169eea647f157d27a6dc579f61417001fd0` 已通过完整适用门禁并取得项目负责人最终复核，结论为 `Milestone accepted`；源码和验收记录已通过普通快进推送到服务器。
- 发布状态：`Unreleased`。本次只授权提交和推送 Git 源码与验收记录，不创建 tag、源码归档、签名、公证、发布渠道上传或正式发布。
- 当前计划：见 [`docs/work_plan/20260805_work_plan.md`](../work_plan/20260805_work_plan.md)；TODO-H01 至 H05 已完成，M2 已验收，源码和验收记录已推送到 `origin/master`。

## 本次完成

- 强制所有接口无关业务、领域校验、用例编排和稳定错误由共享 core 实现并测试，CLI/TUI/MCP/GUI 只保留运行时、协议、展示、交互和结果映射职责。
- 增加可传播的 core-first 和 400 行检查器；Harness validator、初始化、实施、验收和升级路径统一消费门禁。
- 拆分升级器、Harness validator 回归、Verification 和方法论文档，保持历史失败、人工签署、测试发现、路径安全和升级所有权事实完整。
- Harness 当前时间版本提升为 `202608051301`，起始值仍为 `202607301002`，状态仍为 `Unreleased`。
- 固定 Rust 技术选型为 Tokio、Axum、Clap、SeaORM、tracing、anyhow、thiserror、serde 与 jiff，并以能力触发避免中性 scaffold 预装未使用依赖。

## 当前自动证据

- 精确候选提交上默认 Python 回归 111/111、升级器隔离 Git 回归 28/28、21/21 Skill 结构、全部 YAML/Python/Shell 解析、196 文件行数门禁和完整 Harness validator 通过。
- 中性 Rust 资产在精确 Rust 1.90.0 上通过格式、锁定依赖检查、Clippy、7/7 非空测试、release 构建和 core-first 依赖图检查。
- 验收前后候选提交未漂移且工作树为空；证据见 [`docs/verification/20260805_verification.md`](../verification/20260805_verification.md)。
- 技术选型候选在精确提交上通过默认 Python 回归 112/112、198 文件行数门禁、完整 Harness validator 和差异检查。

## 未运行与剩余风险

- 产品启动冒烟与 Computer Use E2E 对 Harness 源码治理候选为 `Not applicable`，未运行且不记为通过。
- Windows/Linux、本轮真实下游前向升级、真实远端三平台矩阵、签名、公证、发布归档和发布渠道保持 `Unverified` 或未执行。
- 当前没有 `release/` 归档、SHA-256、manifest 或 Git tag，不声明正式发布 `Ready`。

## 下一步

1. 后续若需要标签、源码归档或正式发布，必须另行授权并按 `$prepare-release` 补齐发布物、哈希和渠道门禁。
2. 在首个真实下游继续收集 core-first、技术选型、400 行门禁和 Harness 升级的前向证据；未运行平台保持 `Unverified`。
