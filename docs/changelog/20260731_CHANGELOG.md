# 2026-07-31 Changelog

## Added

- 新增并在终端下游永久保留 `$upgrade-harness`，提供默认只读计划、来源与目标 Git 状态绑定、`.harness/upstream-lock.json` 三方基线、bootstrap audit、逐文件显式应用和更新后复验。
- 新增 Harness 升级所有权清单与五类保护模型；`managed-self` 作为受管子模式保证 updater 普通模块先更新、入口脚本最后更新，`protected` 与 `tombstone` 内容不能被整体覆盖或回迁。
- 新增 27 个隔离 Git fixture 回归场景，覆盖来源伪造、控制文件漂移、双方修改、删除/新增、权限变化、保护清单弱化、符号链接/空目录 tombstone、部分应用和 updater 自更新顺序。
- 新增可解析的 `docs/AGENT_POLICY.md` 四项项目级策略：Superpowers、Worktree/Subagent、验证里程碑冒烟和验证里程碑 E2E。

## Changed

- Work Plan 统一为 Todo 批次与验证里程碑；每个 Todo 记录稳定 ID、预期行为、影响边界、验证方式和状态，整批未完成时持续编码与非空单元测试。
- 验收对象收紧为绑定批准场景和源码状态的完整真实可运行里程碑产物；Mock、stub、占位、中性 scaffold、开发预览和仅内部函数结果不能验收。
- 里程碑失败会重开或新增 Todo 并返回实现阶段修复缺失或偏差；只有 Todo 再次全部完成后才可重新验收。
- 冒烟与 E2E 只在验证里程碑由 `$verify-delivery` 按持久策略、硬要求和适用性决定；产品定义、计划、编码、普通验证、常规构建、收集和发布元数据流程不再调用二者。
- 下游初始化一次收集四项策略并固化；后续 Agent 先复用策略、再判断适用性，只有字段缺失、冲突或无法可靠判断时才询问。
- Harness validator 增加策略确认元数据、Todo/里程碑状态、升级器生产清单与模块、候选 workflow 全文件摘要和不可绕过负向契约。
- 跨平台候选 workflow 固定使用不可变的官方 action commit，只允许生成 `milestoneAcceptance: pending` 的候选传输包，不自行执行产物或宣告验收。

## Security

- 升级计划现在绑定来源版本/commit、目标 Git 状态、所有权清单和来源锁；apply/record 前重新校验整份计划，控制文件或任一受审节点漂移都会 fail closed。
- 文件更新使用不跟随符号链接的逐文件原子替换；拒绝特殊权限位、根外路径、路径祖先替换、弱化最低保护规则和未实际落地的人工新增。

## Verification boundary

- Todo 开发检查已通过，M1 维护候选等待提交后绑定精确源码 commit 复验；真实客户下游、Windows/Linux、PowerShell 原生执行、真实 GitHub runners 和长期升级仍为 `Unverified`。
- 本次维护里程碑不包含产品 GUI/TUI/MCP/CLI 最终产物，冒烟与 Computer Use E2E 判定为 `Not applicable`，没有执行。
- Harness 仍为 `202607301002` / `Unreleased`；本次不创建 release build、签名、tag、发布物或正式发布，人工最终复核仍待项目负责人明确签署。
