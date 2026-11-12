# 项目状态

> 记忆日期：2026-11-12
>
> 更新事件：本地发布后的受管开发阶段，核对 Harness 当前工程、创建和升级路径。

## 当前阶段

- Harness 源维护规则、Skills、工程工具和中性资产。下游可组合 CLI、MCP、DESKTOP，也可独立选择 NSH。DESKTOP 固定使用 Tauri。NSH 使用正式 0.4.0 工具链，支持桌面、移动和 Web。产品范围以 [Product Spec](../product_spec/README.md) 为准。
- 本地默认主分支 `master` 与 tag `v202611082001-20261108` 均指向 `76f520202802a217d10d028ed410a0dd1d2a7230`。tag 中的发布上下文记录相同版本、默认主分支和 tag 名。时间版本继续以 [Version.md](../../Version.md) 为准。
- `25e32ad` 在下一开发周期从 DESKTOP 摘除 GPUI 工具链。当前工程梳理延续该提交，核对 Skills 导航、下游表单、准备、裁剪及升级边界。当前实现以受管分支和 Git 提交为准。

## 工程入口

- [项目创建](../PROJECT_CREATION.md) 连接表单、环境门禁、工程准备、中性初始化、真实脚手架检查、裁剪和独立基线。产品定义随后在终端下游进行。
- [Skills 索引](../../.agents/skills/README.md) 按职责定位执行入口。[知识索引](../README.md) 指向当前规范、接口资料及原始记忆。工作区的 `knowledge/` 保存带源码身份的本地技术快照。
- [升级 Skill](../../.agents/skills/desktop-upgrade-harness/SKILL.md) 按目标 Cargo 选择和所有权清单检查候选。新下游的 schema 5 可以保留 `post_release_action: pending` 至首次发布。

## 待补证据

- 创建和升级已有隔离回归，真实下游的完整原生创建、跨平台运行和真实项目升级证据仍按 [技术债](../TECH_DEBT.md) 各项追踪。
- 下游候选按实际接口、目标、版本和最终制品取证。下一次 Harness Git 发布须独立触发，以当次默认主分支、发布上下文和 tag 复核。
