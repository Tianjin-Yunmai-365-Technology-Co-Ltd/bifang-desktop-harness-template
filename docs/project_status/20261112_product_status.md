# 项目状态

> 记忆日期：2026-11-12
>
> 更新事件：`v202611121721-20261112` 发布后的首个受管开发周期。

## 当前阶段

- Harness 源维护规则、Skills、工程工具和中性资产。下游可组合 CLI、MCP、DESKTOP，也可独立选择 NSH。DESKTOP 固定使用 Tauri。NSH 使用正式 0.4.0 工具链，支持桌面、移动和 Web。产品范围以 [Product Spec](../product_spec/README.md) 为准。
- 上次本地 Git 发布的 `master` 和 tag `v202611121721-20261112` 均已复核指向 `5c71d55cceb1c12f3d916ca02a04ecd1f09ae998`。时间版本继续以 [Version.md](../../Version.md) 为准。
- 当前受管开发周期清理退役接口的工程入口与知识，核对下游创建、升级、运行和打包路由。范围与旧工程边界见 [ADR-20261112-002](../adr/20261112_ADR.md)。

## 工程入口

- [项目创建](../PROJECT_CREATION.md) 连接表单、环境门禁、工程准备、中性初始化、真实脚手架检查、裁剪和独立基线。产品定义随后在终端下游进行。
- [Skills 索引](../../.agents/skills/README.md) 按职责定位执行入口。[知识索引](../README.md) 指向当前规范、接口资料及原始记忆。工作区的 `knowledge/` 保存带源码身份的本地技术快照。
- [升级 Skill](../../.agents/skills/desktop-upgrade-harness/SKILL.md) 按目标 Cargo 选择和所有权清单检查候选。新下游的 schema 5 可以保留 `post_release_action: pending` 至首次发布。

## 待补证据

- 创建和升级已有隔离回归，真实下游的完整原生创建、跨平台运行和真实项目升级证据仍按 [技术债](../TECH_DEBT.md) 各项追踪。
- 下游候选按实际接口、目标、版本和最终制品取证。下一次 Harness Git 发布须独立触发，以当次默认主分支、发布上下文和 tag 复核。
