---
name: desktop-run-parallel-worktrees
description: 在用户明确要求且策略允许时，将当前已绑定的左侧 Task 拆为具有非重叠写入所有权的内部 Subagent Git Worktree；通过项目/source 绑定、guard、postflight 和保守清理阻止越界。
---

# 运行并行 Worktree

将一个左侧 Task 内部的写入批次拆为可见进度、隔离工作树和可审查结果，不得丢失用户修改，也不得把必需工作留在后台。

本 Skill 只管理单个左侧 user-owned Task 内部的 Subagent 单元。它不调用 `create_thread`，不创建新的左侧 Task，也不替代 `docs/AGENT_POLICY.md` 的保存项目/`projectId`、setup、Git Worktree Task 的 `{任务}-{ID}-{摘要}` 显示标题和 `codex/task-*` 交付门禁。内部 agent thread 与单元 Worktree 仍属于当前 Task；它们只能使用宿主允许的技术标识并在提示或状态中引用父 Task，不得冒充新的左侧 Task 或声称自身满足该显示标题契约。不得把两个左侧 Task 安排进同一 Worktree，也不得用 `codex/unit-*` 替代 Task 自身的 `codex/task-*` 分支。

## 策略与适用性

1. 读取 `docs/AGENT_POLICY.md`。只有用户在当前请求中明确要求并行 Subagent/Worktree，且 `parallel_worktree_subagents: enabled` 时才继续；日常开发不得仅因持久策略启用而自动增加并行步骤。值为 `disabled` 时使用单 Agent。
2. `enabled` 表示许可，不表示执行请求。用户已明确要求并行时，仍只有至少两个写入单元具备不重叠所有权、明确整合顺序和干净且已提交的 Git 基线才使用本 Skill；否则解释原因并使用单 Agent。
3. source Worktree 的 `.harness/git-branch-chain.json` 声明 `schemaVersion: 1` 且 `activeChain` 非空时，严格线性的 `feature-*` 发布链与从同一叶派生 sibling `codex/unit-*` 不兼容：禁止创建写入单元，改由单 Agent 在当前叶串行写入。只读 Subagent 仍可并行，但不得创建或写入 sibling unit Worktree；状态文件损坏、不安全或 schema 无效时失败关闭。
4. 产品定义、规划、只读调查、普通证据复核、构建、收集和发布元数据工作，不会仅因偏好已启用而自动并行。
5. 只有当前左侧 Task 已通过 Agent Policy 的 BOUND 门禁才继续：线程绑定正确 `projectId`；保存项目根和当前 Task source Worktree 都是独立 Git 顶层，拥有相同规范化 Git common-dir；source 出现在保存项目的 Worktree registry 中，当前分支精确为 `codex/task-<task>`。这里的 `<task>` 是描述中独立记录的 ASCII `task-slug`，不是 `{任务}-{ID}-{摘要}` 显示标题。Worktree 可以物理位于保存项目目录之外，不能用路径祖先关系代替这些事实。
6. 策略许可不授权原任务以外的提交、合并、删除、推送、发布、凭据或外部副作用。

## 准备

1. 读取用户要求并行的任务说明、Agent Policy、工程规则和相关文件；只有用户已要求持久计划且确实存在时才读取 Work Plan，只有产品边界或长期决定相关时才读取 Product Spec/ADR。
2. 为每个单元定义稳定的 ASCII task/unit 技术标识、结果、一个或多个非空 repo-relative 写入所有权、依赖、验证和整合顺序。task 标识必须等于父 Task 描述中的独立 `task-slug`；不得把 `{任务}-{ID}-{摘要}` 显示标题原样传给 `--task`、`--unit` 或 Git ref。`.`、绝对/越界路径、符号链接逃逸、同一单元内冗余祖先/后代，以及不同活动单元间任何相同或祖先/后代所有权都失败关闭；需要重叠的工作改为串行执行。
3. 记录两个不同路径：`--project-root` 是 Codex 保存项目的 primary checkout；`--source-worktree` 是当前左侧 Task 的实际 Git 顶层。所有非 `inspect` 命令都同时提供二者。task 标识 `<task>` 对应 source 分支 `codex/task-<task>`，每个单元分支为 `codex/unit-<task>-<unit>`，两套命名空间不得混用。
4. 从当前 source Worktree 的精确 cwd 为每个单元运行一次 `create`，每个所有权重复传入 `--write-target`：

   ```text
   python3 <absolute-project-root>/.agents/skills/desktop-run-parallel-worktrees/scripts/parallel_worktrees.py create --project-root <absolute-project-root> --source-worktree <absolute-source-worktree> --task <task> --unit <unit> --write-target <owned-path> [--write-target <owned-path> ...]
   ```

   helper 在建立任何目录或登记状态前，先失败关闭地读取 source 的可选分支链状态；活动链以稳定错误码 `managed_feature_chain_active` 拒绝创建，损坏或非法状态以 `git_branch_chain_state_invalid` 拒绝创建。随后要求保存项目 primary、source registry/branch、common-dir、外部普通目录容器和干净且已提交的 source HEAD 全部匹配；从 source HEAD 创建单元并把不可变身份、基线和所有权登记在 Git common-dir。绝不得自动暂存、贮藏或提交用户修改。
5. 把 `create` 返回的精确 `worktreePath` 和 ownership 交给对应内部 Subagent。Agent 不是独占仓库；它必须把所有文件命令和编辑限定在该 Worktree，保留其他 Agent 的改动，不扩大所有权。在任何编辑、暂存或提交前，从单元精确 cwd 运行：

   ```text
   python3 <absolute-project-root>/.agents/skills/desktop-run-parallel-worktrees/scripts/parallel_worktrees.py guard --project-root <absolute-project-root> --source-worktree <absolute-source-worktree> --task <task> --unit <unit> --write-target <intended-path> [--write-target <intended-path> ...]
   ```

   guard 只接受创建时已登记 ownership 的相同路径或子路径，并先检查此前所有实际改动；它不能替代宿主沙箱。Subagent 必须返回变更文件、开发检查、阻断项和整合说明。

## 可见执行与整合

1. 在开始、阻断、单元完成、整合和验证节点公开简洁状态。同步等待每个必需结果；内部 agent thread 只报告自己的技术标识和父 Task，不得把自己称为新的左侧 Task，也不得为它调用 `create_thread` 或套用左侧 Task 显示标题冒充独立会话。
2. 范围、所有权或安全假设变化时，停止或重新分派相关单元。不得静默创建替代 Agent。
3. Subagent 完成后、整合前，从其单元精确 cwd 运行 postflight：

   ```text
   python3 <absolute-project-root>/.agents/skills/desktop-run-parallel-worktrees/scripts/parallel_worktrees.py verify --project-root <absolute-project-root> --source-worktree <absolute-source-worktree> --task <task> --unit <unit>
   ```

   postflight 必须证明从登记 `baseHead` 到当前 HEAD 的 committed 路径，以及 staged、unstaged、untracked 和 rename 的源/目标路径都在 ownership 内。任何越界先由对应单元修复；不得在协调 source 中掩盖或手工忽略。
4. 检查每项差异和证据，拒绝无关编辑、缺失测试、过时注释、敏感信息、绝对本机路径和无证据支持的声明。按依赖顺序使用可逆 Git 操作把已验证提交串行整合到 source 分支，并让每个单元分支成为 source 分支的祖先；squash/cherry-pick 不满足 helper 的可证明清理条件。语义冲突由协调方处理，绝不得让多个 Subagent 竞态修改。
5. 整合后只运行本次变化必需的非空单元/回归测试；非代码变更只运行必要替代验证。不得因并行本身追加格式、lint、静态、构建、冒烟、E2E 或完整验收。
6. 只有整合后的必要测试通过，才能把存在的 Todo 标记为 `done`。随后返回 `$desktop-implement-change` 收口；普通构建保持开发流程，用户另行明确请求正式发布候选时才先经 `$desktop-prepare-release` 封存范围并进入候选构建。

## 保守清理

清理前从保存项目 primary 的精确 cwd 检查：

```text
python3 .agents/skills/desktop-run-parallel-worktrees/scripts/parallel_worktrees.py inspect --project-root <absolute-project-root>
```

只移除由本工作流拥有、postflight 通过、状态干净，而且单元分支已经是创建时登记的 source 分支祖先的精确 Worktree。从 source Worktree 的精确 cwd 运行，`--integrated-into` 必须逐字等于 `codex/task-<task>`，不能传单元自身或任意 ref 自证整合：

```text
python3 <absolute-project-root>/.agents/skills/desktop-run-parallel-worktrees/scripts/parallel_worktrees.py remove --project-root <absolute-project-root> --source-worktree <absolute-source-worktree> --task <task> --unit <unit> --integrated-into codex/task-<task>
```

helper 删除状态登记但保留单元分支。绝不得强制移除状态不干净、身份/所有权缺失或不匹配、越界、未整合的单元，也不得手工删除 common-dir 中的登记来绕过检查。
