---
name: desktop-manage-user-tasks
description: 在 Codex 中创建、绑定或更新用户可见的左侧 Task；管理项目序号、真实线程身份和进度，不用于内部 plan、Subagent 或普通开发拆分。
---

# 管理用户可见 Task

每次开工先完整读取用户级 `AGENTS.md`，复用高于项目预设的长期硬规则。用户明确要求管理左侧 Task、用户长期 Task Tree 授权或项目持久策略允许自动创建时调用；不改写模板默认值或无关能力，不创建替代 Task 规避失败。

## 必需事实

读取 `docs/AGENT_POLICY.md` 的字段语义与“用户可见 Task 开关、粒度与创建门禁”，标题/序号规则和统一描述模板以该文件为唯一来源。项目入口只引用本 Skill，不复制整套状态机。当前宿主没有 Codex 项目/线程工具时报告能力缺失，不改用内部 Subagent 冒充。

## 创建与绑定

1. 确认单一结果、固定阶段、前序精确提交/证据、范围、允许副作用、禁止范围和完成条件。用户要求阶段隔离时，调研分析、方案设计、编码实现、正式测试验收、安装发布分别独立，发布和推送也分别独立；开发单元/回归和同范围返工留在实现阶段，不能承担正式验收。先复用用户硬规则与 `user_owned_tasks`，不静默改永久策略。
2. 按政策调用 `list_projects`、`list_threads(limit=50)` 与同宿主逐页 `list_archived_threads`，精确核对项目/宿主并计算最大有效序号加一；历史枚举不可靠时停止，不猜序号。
3. 用政策的完整描述模板准备真实基线、独立 ASCII feature summary 和项目绑定。Git 使用独立 Worktree，非 Git 使用 Local；只使用用户明确指定的起点或政策默认基线，不 fetch、不复制未授权的用户修改。
4. 对一个结果只调用一次 `create_thread`。保留返回的 hostId、clientThreadId 或 threadId、派发前 Task key、精确项目、标题与基线。返回 `clientThreadId` 时报告该 pending ID 和 `SETUP_PENDING`，保持零实现，不重试创建，不把它传给需要真实 `threadId` 的工具。
5. 取得真实 `threadId` 后按 RESOLVED → DISPATCHED → VERIFIED → BOUND 核对原描述 Task key、编号、标题、精确 projectId、非 pinned、cwd、状态、干净工作区和起始提交；Git 用相同 common-dir 与 worktree registry 证明独立 Task Worktree 绑定。业务资料阅读、插件探索、分析、设计、测试或写入之前全部通过；任一不符保持零业务执行。
6. 绑定通过后目标 Task 只执行描述中的固定阶段；写入按 `$desktop-implement-change` 和 `$desktop-manage-git-lifecycle` 接管。协调聊天仅做编号、创建、绑定、恢复与状态，禁止先做业务再补建 Task；不代做业务、提交、合并、推送或删除资源。

## 进度与恢复

- 只在真实进度转换时按政策尝试一次 `set_thread_title`，使用真实 `threadId` 有界复读；编号和单一结果固定。内部 Subagent 不使用标题合同。
- 检查失败返回同范围实施时恢复运行状态；全部要求的结果、验证和适用提交完成后才进入完成状态。标题更新失败如实报告，不推翻已完成结果或创建替代 Task。
- 用户已有长期恢复授权时主动对账原 pending Task，不重复要求授权；先读取已有记录。只有宿主提供可复核的 pending → 真实线程身份映射，或用户指出真实 threadId 且复读项目/原描述 Task key/基线精确一致时，才进入 VERIFIED/BOUND。宿主不能可靠对账时继续报告 pending，不凭相似标题接管，不重新创建或代做。
- 原 Task 项目归属、置顶、cwd 或真实 ID 异常先在授权范围使用受支持的 `move_thread_to_project`、`move_thread_to_sidebar_section` 和 `handoff_thread` 尽力修复，并有界复读。工具成功回执不能代替复读。handoff 改 ID 时记录工具证明的迁移链，保留 Task key、编号、单一结果；不写入个人路径/ID 或把临时 app-server 修复命令固化为通用流程。
- 其他任务问题阻断时在授权范围尽力修复并复读，不进入其未授权业务。失败保留原 Task、证据与“已分配”，保持零业务执行；禁止协调聊天、plan、内部业务 Subagent、普通 Worktree 或 Local Git checkout 代做。
- 长期停止后创建新结果仍完整清点同宿主/精确项目当前及逐页归档编号，从最大有效序号加一，不重复、不回填；恢复原结果保留编号，枚举不可靠时不猜号。

## 输出

报告真实 threadId，或 clientThreadId 与 SETUP_PENDING，以及项目/宿主、序号/标题、最后确认进度、工作区/基线绑定证据和未完成门禁。创建工具成功派发后按宿主要求输出 created-thread 展示指令：ready 使用 threadId，queued 使用 clientThreadId；展示 queued 不代表 Ready。
