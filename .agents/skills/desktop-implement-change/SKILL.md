---
name: desktop-implement-change
description: 直接实施范围清楚的请求，只运行本次开发需要的单元/回归测试并更新被真实事件触发的记录；不得自动追加计划、全仓检查、构建或验收。
---

# 实施变更

完成当前授权范围。已初始化、已有可访问远端的终端下游以“受管 feature 分支 + 实现 + 本次必要单元测试 + 事件触发记录 + 提交并推送”为日常开发闭环；Harness 源维护仍使用调用任务已经安全建立的非保护工作分支，不在模板根创建下游运行时状态。

## 工作流程

1. 检查 `AGENTS.md`、`docs/AGENT_POLICY.md`、`docs/ENGINEERING_RULES.md`、Git 根/分支和工作区，只读取当前变更直接需要的 Product Spec、ADR、接口或技术事实。若规范根同时包含 Harness 专用 `Version.md` 和活动 `$desktop-instantiate-project`，只允许修改 Harness 自身规则、Skills、中性资产、脚本、验证器、文档或其交付工程；任何产品目的、业务功能、产品专属 UI/文案/数据、远程地址、凭据、构建或发布需求都必须在写入前拒绝，并要求用户切换到终端下游后重新提出。Harness 源维护不得创建根 `.harness/git-branch-chain.json` 或假装执行下游生命周期。保护用户已有修改，重叠无法安全处理时停止。只有已初始化的终端下游且已有可访问远端，收到新需求、独立 Bug 或独立维护写入时，才在任何项目文件写入前调用 `$desktop-manage-git-branch-chain`：新需求及独立维护使用 `feature` 分类，Bug 使用 `bug` 分类但同样生成 `feature-{ascii-kebab摘要}-{YYYYMMDD}`；继续同一需求/Bug 时只验证当前分支仍是状态文件登记的活动叶子，不重复建分支。`start` 会形成并推送分支状态提交，因此紧邻调用前必须先按 `$desktop-configure-git-commits` 检查身份和模板。remote 无法唯一解析、无凭据、网络失败、工作树不干净、同名 ref 或父叶未完整推送时都保持零源码写入，不自动配置 remote、凭据或 force push。`main`、`master` 与动态默认主分支均不得作为日常写入分支；只有显式发布经 `$desktop-prepare-release` 才拥有一次原子严格快进默认分支并精确清理登记 feature refs 的窄例外，本 Skill 不自行调用该例外。

   若当前说明来自左侧 Task 模板或当前环境是 Codex 管理 Worktree，首次编辑前核对描述中的 Task key、保存项目完整路径、`projectId`、repository identity、起始分支和起始提交；可读取线程元数据时，`projectId` 必须精确匹配。Git Worktree 可以位于保存项目路径之外，但保存项目根与当前 Task 顶层的规范化 `git rev-parse --path-format=absolute --git-common-dir` 必须相同，且保存项目的 `git worktree list --porcelain` 必须登记当前顶层。随后确认当前分支为唯一 `codex/task-*` 分支且 HEAD 从已声明的活动 feature 叶子派生；detached HEAD 必须先创建该分支。同一活动叶子同一时刻最多一个产品写入 Task；该 Task 必须用单 Agent 串行写入，不创建 sibling `codex/unit-*`，只读 Subagent 可并行。协调方读取交付报告后只机械核对范围、疑似秘密、任务要求的测试、clean、Worktree/ref/OID/祖先、受保护状态与唯一写入占用，不得借整合追加非必要语义审查；随后只用 `$desktop-manage-git-branch-chain integrate-task` 条件快进到原活动叶子，再以独立 `publish` 推送复读。下一个写入 Task 只能从新的远端 OID 创建。项目绑定、repository identity、Worktree 登记、唯一写入者或基线任一不符都保持零写入，不退化到 Local 主目录、其他 Task 或内部 Subagent 继续实施。
   Git Worktree/Local 左侧 Task 还必须核对描述中分别记录的不可变 Task key、稳定正整数序号，以及派发时显式传给 `create_thread` 的 `title="{Task}|{序号}|{功能摘要}已分配"`。恢复中的 Task 可以已经处于其他合法进度，但 `{Task}|{序号}|{功能摘要}` 必须与描述一致，后缀只能是 `已分配`、`运行中`、`检查中`、`已完成`；序号不能来自调用后返回的 `threadId`/`clientThreadId`。可读取线程元数据时，仍以真实 id 和 `projectId` 对账并展示工具返回的规范化标题原文，不靠标题判断身份。只有 Git Worktree Task 另行核对描述中的独立 ASCII `task-slug`，并要求当前分支精确为 `codex/task-<task-slug>`；非 Git Local Task 的 `task-slug`、Git 绑定与分支门禁均为 `Not applicable`。显示标题不得直接作为 Git ref。
   对用户可见的当前调用 Session 或已经通过上述绑定门禁的左侧 Task，统一格式为 `{Task}|{序号}|{功能摘要}{当前进度}`；形成稳定三部分并实际开始处理时，按 `docs/AGENT_POLICY.md` 尝试更新为 `{Task}|{序号}|{功能摘要}运行中`。当前 Session 没有可复用序号时使用 `1`，同一结果全程复用。目标已匹配则只验证，否则省略 `threadId` 调用 `set_thread_title`，再按真实 `threadId` 和可用项目上下文有界复读一次。内部 Subagent、agent thread 和单元 Worktree 不执行标题更新。
2. 对已初始化下游先调用 `$desktop-manage-version plan` 只读分类并取得 `required_version`：新功能使用 `feature`，新稳定缺陷 ID 的真实修复使用 `bug-fix`，用户批准的 Major 使用 `major`；查询、诊断、复现、未完成/重复修复尝试、行为保持重构、测试补强、文档、格式和内部清理使用 `maintenance`。分类存在会改变产品范围或版本的二义性时先询问用户；不得为维护任务或失败尝试提升版本。随后直接实现用户请求，不因多步骤、多模块、中等风险、可并行或 Agent 偏好自动调用 `$desktop-plan-change`、创建 Work Plan、启动 Subagent、构建候选或完整验收。用户明确要求持久计划/并行、跨会话交接或发布/高风险协调确有必要时，才进入对应专用能力。
3. 日常开发先直接运行本次必要测试，不做环境预检。只有真实测试命令已经失败，且命令、退出状态和脱敏诊断明确表明缺少或不兼容的受管工具链/系统依赖时，才调用 `$desktop-check-development-environment`，成功后重试原命令一次；不得因新任务、新会话、首次代码修改、显式构建或缺少环境证据主动探测。纯文档/元数据任务不增加环境步骤。
4. 追踪真实执行路径，不留下模拟实现、桩、占位或仅有源码的片段。Core-first 是硬规则：接口/宿主无关的领域类型、业务规则、语义校验、默认值、用例编排、状态转换、稳定错误、平台无关权限、迁移和持久化策略必须在 core；adapter 只拥有装配、接口语法/协议、展示/纯交互状态、调用 core 和结果映射。适配器只拒绝无法解析、缺少协议必填字段或违反宿主能力约束的输入；值域、跨字段关系和其他业务有效性由 core 判定。GUI 交互 handler 必须绑定在实际拥有动作的按钮、链接、`Switch`、`Checkbox` 或菜单项本身，不得由 Card、`Table.Tr`、`Table.Td` 等父级代理；父级有独立动作时只执行自身语义并隔离传播冲突。选项卡、查询/筛选、排序和分页等可恢复页面工作状态使用应用根 Jotai store 的模块级 atom 在当前进程内跨路由保留，不得持久化或镜像 Query/core 数据；成功空页从大于 1 的页码回退第 1 页，加载/错误不回退。
5. 修改 adapter 前确认“适配器操作 → core API → core 测试”映射；仅修改布局、协议映射、系统托盘、窗口、终端恢复或 stdio 生命周期等接口/宿主机制时，记录其专属性理由。
6. 代码行为变化增加或更新本次开发需要的相关非空单元/回归测试：业务行为先覆盖 core 的核心成功路径和最高风险失败路径，再覆盖本次实际修改的适配器单元映射；缺陷修复增加能复现问题的回归测试。GUI 行内交互分别点击语义控件与周围父级区域，证明父级不会代理子控件动作；表格中的 `Switch` 不得因点击行或单元格而切换。GUI 页面会话状态使用同一根 store 验证跨 route unmount/remount 保留、使用新 store 验证退出后默认值，并覆盖成功空页回退、加载/错误不回退和第 1 页空数据不循环。
7. 只运行第 6 步的测试并立即修复失败。真实进入这些测试、review 或最小替代检查前，用户可见的当前 Session/左侧 Task 尝试把同一稳定三部分更新为 `检查中`；检查失败并返回同范围修复时更新为 `运行中`，再次进入检查时再更新为 `检查中`。每次真实转换至多尝试一次，目标已匹配时只验证；没有独立检查的任务不虚构该阶段。纯文档、元数据、格式或不可合理单测的机械变更不创建空洞测试，只运行证明解析成功或差异完整所必需的最小检查。
8. 日常开发不得自动追加格式化、lint、静态、集成/契约、全仓测试、构建、文件行数、Rust/TypeScript 中文声明注释、core-first 机械门禁、冒烟、E2E、Verification 或人工复核。普通构建也只新增全量非空单元测试和实际构建，构建事实只进入 `release/` manifest、其声明的相邻制品证据和最终回复；其他治理检查仅在本次变化需要、用户明确请求或发布/渠道硬要求时运行。任一已运行检查失败仍必须在当前授权范围内修复并重跑。
9. 第 7 步的本次相关测试或最小替代检查通过、变化确实完成后，使用与第 2 步相同的参数调用 `$desktop-manage-version apply`。功能在同一正式发布周期只由首个功能提升一次 Minor，独立缺陷 ID 每个提升一次 Patch；重复 ID 返回幂等结果。不得在测试失败、实现未完成、查询/诊断/复现或其他 `maintenance` 情况提前提交版本。
10. 只更新被独立事件触发的记忆：产品目标/边界/约束/成功标准变化更新 Product Spec；长期重要决定/硬规则例外写 ADR；合格的可感知变化写 Changelog；重要阻断/交接、发布/完整验收/审计或用户要求再写 Product Status、Work Plan 或 Verification。Product Spec、ADR、Changelog 或 Work Plan 一旦独立触发，必须记录稳定 `change_id` 与版本门禁返回的 `required_version`；版本变化本身不触发任何记忆。构建请求、执行和结果本身不触发 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification；未触发时不写占位。
11. 若用户提供了活动计划，只更新其中与本次实现直接对应的 Todo；计划不得改变本 Skill 的最小开发闭环或静默增加检查。
12. 每完成一个逻辑闭环，都紧邻真实提交调用 `$desktop-configure-git-commits`，以表达结果的提交信息把当前范围的精确路径创建为可审查提交，正常运行 hooks 且不得使用 `--no-verify`。已初始化下游的普通活动 feature 叶子随后立即调用 `$desktop-manage-git-branch-chain publish`，要求 clean、本地没有落后或分叉、远端同名 ref 精确等于当前 HEAD；任何 push 失败都阻断完成，不 force、不换 remote，也不隐瞒未推送提交。Harness 源维护不调用该下游 helper，只在当前请求已经建立并授权的非保护 feature 分支上按同样的非强制、精确 ref 和远端复读边界提交/推送，且不写下游状态。左侧 Task 只提交到自己的 `codex/task-*`，由协调方以精确 Task ref/Worktree/40 位 OID 调用 `integrate-task`，成功后再调用 `publish`；只有远端复读新 OID 后才能清理或创建下一写入 Task。最终交付前确认任务要求的测试已执行、权威文档已同步、所有任务改动已提交并推送，且 `git status --porcelain=v1 --untracked-files=all` 为空；随后报告 feature 分支、提交哈希、远端复读结果、实际验证、未执行项和剩余风险。Task 不自行合并默认分支。Task 不自行操作默认主分支，也不覆盖 `/Applications`、删除 Worktree/分支或执行发布；协调方只按分支链与发布 Skill 负责后续整合和精确清理。
13. 第 12 步要求的结果、验证、文档、提交、推送、远端复读与 clean 门禁全部完成后、发送最终回复前，用户可见的当前 Session 或左侧 Task 才尝试把同一稳定三部分更新为终态 `已完成`，再按真实 `threadId` 用 `list_threads` 做一次有界复读；`已完成` 不得回退。内部 Subagent/agent thread/单元 Worktree 不执行。任何阶段的 UI 工具不可用、更新失败或无法复读时，不创建替代 Task、不在同一阶段无限重试、不阻断已经完成的任务结果，并在最终回复报告最后确认的标题状态和原因；任务被阻断时保留最后真实进度，不能虚写 `已完成`。

## 边界与输出

- 用户批准的分支链契约只持续授权活动 feature 的普通 push，以及显式发布时在冻结 OID 下对动态默认 `main`/`master` 的原子严格快进与状态登记 feature refs 精确清理；不授权配置 remote/凭据、无精确 lease 的 force push、merge commit、标签、上传、签名、渠道发布、扫描 `codex/*` 或删除链外分支。
- 单元测试只证明本次代码单元行为，不代表真实候选可用、完整验收或发布就绪。
- 报告变更分类、稳定 `change_id`、`required_version`、是否实际提升及幂等原因、本次实际运行的单元测试/最小替代检查、未执行项、剩余风险和适用的 Session/Worktree 进度标题状态；左侧 Task 另报告分支、提交哈希和干净状态，只有用户要求的活动计划存在时报告 Todo 状态。
