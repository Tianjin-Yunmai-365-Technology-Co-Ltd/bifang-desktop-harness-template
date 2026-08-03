---
name: plan-change
description: 为标准或里程碑路径创建可直接实施的精简 Todo。用于多步骤、多模块、跨会话/交接、中等风险、高风险/发布候选，或用户明确要求持久计划；快速路径不调用。
---

# 规划变更

只为能降低协调或交付风险的任务建立持久计划。

## 工作流程

1. 规划期间在当前工作树工作，不编码、不创建写入 Worktree、不运行冒烟/E2E。
2. 确认任务采用 `标准` 或 `里程碑` 路径并说明原因。若范围仍会改变产品目标、边界或成功标准，先转 `$define-product`。
3. 按需读取最新 Product Spec、Agent Policy、`docs/ENGINEERING_RULES.md`、相关 ADR、受影响代码/测试和存在时的活动 Work Plan；Product Status、Verification 和 Release 只在本任务相关时读取。
4. 梳理当前行为、用户修改、依赖与风险，明确范围内/外边界和阻断项。
5. 按依赖顺序建立最少数量的 Todo。每项至少记录：
   - 稳定 ID 与 `pending`、`in_progress`、`blocked`、`done` 状态；
   - 一个可观察预期行为；
   - 精确文件/模块所有权或调查边界；
   - 依赖和主要风险；
   - 代码行为的相关非空测试，或非代码变更的相称替代验证；
   - 必要的静态、集成或契约检查。
6. 标准路径到此即可。只有真实交付目的、硬触发器或用户选择要求完整验收时，先把路径升级为里程碑，再增加验证里程碑，记录：全部 Todo 为 `done` 的准入、真实候选和源码提交、批准场景、编译/测试/产物证据、冒烟/E2E 解析及失败回流。
7. `parallel_worktree_subagents: enabled` 仅表示后续在至少两个无重叠写入范围且 Git 基线安全时可并行；否则单 Agent，不重复询问。
8. 创建或更新当天 Work Plan；新日从前一份综合仍有效的活动事项。只有重要阻断、交接或用户要求时才同步 Product Status；计划本身不触发 Product Spec、ADR、Verification 或 Changelog。

## 质量规则

- 使用仓库事实，不编造文件、命令、API、依赖或产物。
- 优先最少 Todo 和最短完整场景，不创建形式化的空批次。
- 标准路径不得宣称 `Milestone accepted`、`ready` 或发布就绪；里程碑路径仍拒绝模拟、桩、占位、脚手架和开发预览作为候选。
