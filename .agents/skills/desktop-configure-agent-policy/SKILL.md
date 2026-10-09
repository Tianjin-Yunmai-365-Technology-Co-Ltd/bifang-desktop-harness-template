---
name: desktop-configure-agent-policy
description: 用户明确修改已初始化下游的永久 Agent 能力偏好时，校验并原子更新指定字段与确认事实；临时任务选择不触发，发布后动作使用其专用 Skill。
---

# 配置 Agent 能力偏好

只处理 `superpowers`、`user_owned_tasks`、`parallel_worktree_subagents`、`acceptance_smoke`、`e2e_hint` 的明确永久选择。读取 `docs/AGENT_POLICY.md` 的字段语义和“初始化与持久化”；Harness 源 pending 模板、初始化、schema 迁移与临时任务选择不由本入口写入。

## 执行

1. 确认目标是独立终端下游 Git 根，用户明确提供字段与 enabled/disabled 新值。`post_release_action` 委托 `$desktop-switch-post-release-action`；禁止借能力偏好绕过项目硬门禁。
2. 用 helper 的 `inspect` 只读获取当前值；缺失、非法或旧 schema 失败关闭，不填默认值、不迁移。
3. 新旧相同按 no-op 报告，不写确认元数据或 ADR。不同则复用本次用户确认来源/日期及原因，按 `$desktop-implement-change` 建立开发周期和必要下游版本分类。
4. 从项目根执行以下命令，绝对路径与参数使用本次真实事实：

   ```text
   node .agents/skills/desktop-configure-agent-policy/scripts/agent_policy.mjs inspect --project-root <absolute-root>
   node .agents/skills/desktop-configure-agent-policy/scripts/agent_policy.mjs set --project-root <absolute-root> --field <capability> --value <enabled|disabled> --expected-value <old-value> --confirmed-by <confirmation-source> --confirmed-at <ISO-date> --confirmed-user-choice
   ```

5. helper 与发布后动作 writer 共用策略锁，原子更新指定字段和 confirmed_by/confirmed_at，保留其他字段及正文。复读 `inspect` 确认结果；并发、路径、锁或旧值冲突停止，不用覆盖参数绕过。
6. 仅 `changed: true` 时调用 `$desktop-record-adr`，复用同一上下文记录确认来源、前后值、原因、影响、恢复条件及适用 change_id/required_version；完成必要相关验证与本地提交。helper 不伪造或自动批准 ADR。

## 边界与输出

开关只影响后续适用任务，不迁移、中断或删除既有 Task/Worktree，不重写已冻结发布，不立即运行所启用能力。报告 changed/no-op、指定字段前后值、确认事实、ADR/提交与实际检查；不暴露凭据或改变全局配置。
