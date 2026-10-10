---
name: desktop-manage-task-worktrees
description: 仅在 Git 左侧 Task 的有效或冻结 task_worktrees 为 enabled 时提供独立 Worktree 参数、绑定核对与原 Task 受支持恢复；默认关闭。
---

# 管理 Task 独立工作树

仅当前 Git Task 的有效选择或派发时冻结的 `task_worktrees: enabled` 才调用本技能。关闭时不调用；非 Git 使用所属项目 Local。详细环境合同唯一来自 `docs/AGENT_POLICY.md` 的字段语义、所选环境与创建状态机。Task Tree、自动 Task 与内部并行不能代替本项授权。

## 执行

1. 接收 `$desktop-manage-user-tasks` 已解析的精确项目、冻结选择来源、repository identity、起始 branch/SHA、前序输入 SHA 和固定阶段。缺失、非法或 `selection_required` 时保持零业务。
2. 向管理入口提供 `target.type=project`、精确 projectId 和 `environment.type=worktree`，起点仅使用明确授权或政策默认的已提交 HEAD。管理入口负责唯一一次 create_thread、编号、标题、真实身份和执行权；本技能不得另建第二个 Task。
3. 返回真实 threadId 后核对非 pinned、独立规范化路径，保存项目与 Task Worktree common-dir 相同，registry 精确登记当前顶层，起始提交正确且 clean。clientThreadId 仍是 SETUP_PENDING，不冒充 Ready/BOUND。
4. 原 Task 绑定异常仅通过受支持项目/置顶/handoff 工具恢复并有界复读；改变真实 ID 时保留工具证明的迁移链、Task key、编号和单一结果。不能凭相似标题接管，不重建替代 Task。
5. 只报告绑定证据，返回管理入口；全部门禁和明确执行权具备后才允许对应阶段开工。后续项目开关变化不迁移既有 Task，沿用原冻结选择。

## 边界

不使用普通 create_worktree、git worktree add 或内部 Subagent 替代用户可见 Task；不分配编号、不提前授予业务执行权、不启用内部并行。本技能不编辑业务、不运行 start、测试、提交、合并、发布、推送或清理资源。内部 codex/unit-* 仍仅由独立授权的 `$desktop-run-parallel-worktrees` 负责。

报告真实 ID 或 pending ID、精确项目/宿主、冻结选择、cwd、common-dir/registry/基线/clean 与未通过项；失败保留原 Task 和已分配状态。
