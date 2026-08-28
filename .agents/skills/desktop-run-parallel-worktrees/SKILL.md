---
name: desktop-run-parallel-worktrees
description: 使用隔离的 Git Worktree 和 codex/ 分支，在可见 Subagent 之间协调一个实施 Todo 批次。用于下游项目的持久策略启用 Worktree/Subagent 执行，且至少两个写入范围可安全独立时；也用于检查或保守清理由本工作流创建的 Worktree。
---

# 运行并行 Worktree

将一个 Todo 批次作为可见且隔离的工作单元执行，不得丢失用户修改，也不得把必需工作留在后台。

本 Skill 只管理单个左侧 Task 内部、由用户明确要求的并行写入单元；左侧 Task 自身的一目标一 Worktree、`codex/*` 分支、描述模板、提交、主任务整合与清理契约以 `docs/AGENT_POLICY.md` 为准。不得把两个左侧 Task 安排进同一 Worktree，也不得用本 Skill 的 `codex/<task>/<unit>` 临时分支替代每个左侧 Task 自己的 `codex/*` 交付分支。

## 策略与适用性

1. 读取 `docs/AGENT_POLICY.md`。只有用户在当前请求中明确要求并行 Subagent/Worktree，且 `parallel_worktree_subagents: enabled` 时才继续；日常开发不得仅因持久策略启用而自动增加并行步骤。值为 `disabled` 时使用单 Agent。
2. `enabled` 表示许可，不表示执行请求。用户已明确要求并行时，仍只有至少两个写入单元具备不重叠所有权、明确整合顺序和干净且已提交的 Git 基线才使用本 Skill；否则解释原因并使用单 Agent。
3. 产品定义、规划、只读调查、普通证据复核、构建、收集和发布元数据工作，不会仅因偏好已启用而自动并行。
4. 策略许可不授权原任务以外的提交、合并、删除、推送、发布、凭据或外部副作用。

## 准备

1. 读取用户要求并行的任务说明、Agent Policy、工程规则和相关文件；只有用户已要求持久计划且确实存在时才读取 Work Plan，只有产品边界或长期决定相关时才读取 Product Spec/ADR。
2. 为每个单元定义 Todo 编号、结果、负责的文件或模块、依赖、验证和整合顺序。将重叠写入改为串行执行。
3. 创建之前公开单元地图和拟使用的 `codex/<task>/<unit>` 分支。
4. 从精确项目根目录运行辅助脚本：

   ```text
   python3 .agents/skills/desktop-run-parallel-worktrees/scripts/parallel_worktrees.py create --project-root <absolute-project-root> --task <task> --unit <unit>
   ```

   辅助脚本要求独立 Git 顶层目录和干净且已提交的基线。绝不得自动暂存或自动提交用户修改。
5. 在写入型 Subagent 编辑或暂存之前，从其精确 Worktree 运行：

   ```text
   python3 <absolute-project-root>/.agents/skills/desktop-run-parallel-worktrees/scripts/parallel_worktrees.py guard --project-root <absolute-project-root> --task <task> --unit <unit> --write-target <owned-path>
   ```

   每个负责路径都必须重复传入 `--write-target`。门禁会检查当前目录、Git 根目录、已登记 Worktree、分支和解析后的目标边界，但不能替代宿主沙箱。
6. 告知每个写入型 Subagent：其他 Agent 正在同时工作；它只能负责已声明路径；必须保留他人修改、不得扩张范围，并且必须返回变更文件、开发检查、阻断项和整合说明。

## 可见执行与整合

1. 在开始、阻断、阶段完成、整合和验证节点公开简洁状态。同步等待每个必需结果。
2. 范围、所有权或安全假设变化时，停止或重新分派相关单元。不得静默创建替代 Agent。
3. 检查每项差异和证据。拒绝无关编辑、缺失测试、过时注释、敏感信息、绝对本机路径和无证据支持的声明。
4. 按依赖顺序使用可逆 Git 操作进行整合。以串行方式解决语义冲突；绝不得让多个 Subagent 竞态修改。
5. 整合后只运行本次变化必需的非空单元/回归测试；非代码变更只运行其必要替代验证。不得因并行本身追加格式、lint、静态、构建、冒烟、E2E 或完整验收。
6. 只有整合后的必要测试通过，才能把存在的 Todo 标记为 `done`。随后返回 `$desktop-implement-change` 收口；用户另行显式请求构建时才进入构建流程。

## 保守清理

清理前先检查：

```text
python3 .agents/skills/desktop-run-parallel-worktrees/scripts/parallel_worktrees.py inspect --project-root <absolute-project-root>
```

只移除由本工作流拥有、状态干净，并且其分支已经是指定整合引用祖先的精确 Worktree：

```text
python3 .agents/skills/desktop-run-parallel-worktrees/scripts/parallel_worktrees.py remove --project-root <absolute-project-root> --task <task> --unit <unit> --integrated-into <ref>
```

辅助脚本会保留分支。绝不得强制移除状态不干净、缺失、不匹配或尚未整合的单元。
