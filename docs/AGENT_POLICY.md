---
schema_version: 1
confirmed_by: pending
confirmed_at: pending
decision_mode: reuse_then_infer_then_ask
superpowers: disabled
parallel_worktree_subagents: pending
milestone_smoke: pending
milestone_e2e: pending
---

# Agent 运行策略

本文件是下游项目 Agent 能力、候选冒烟偏好和构建 E2E 建议默认值的唯一持久事实来源。Harness 源允许使用 `pending` 表示等待下游用户首次确认；完成初始化的下游四项选择只能是 `enabled` 或 `disabled`，且 `confirmed_by`、`confirmed_at` 必须记录真实确认来源和日期。GUI 发布性能选择刻意不进入本文件，每次发布重新解析。

## 字段语义

- `superpowers`：`enabled` 允许按任务触发名称以 `superpowers:` 开头的 Skills；`disabled` 禁止后续规划、实现、验证和发布调用或遵循这些 Skills。
- `parallel_worktree_subagents`：`enabled` 只表示用户明确要求并行时允许使用 Worktree + 写入型 Subagent；`disabled` 使用单 Agent 当前工作树。持久启用本身不能触发并行步骤。
- `milestone_smoke`：只在完整真实候选验收中，允许 Agent 对候选执行适用的冒烟测试。
- `milestone_e2e`：仅作为每次显式构建询问 E2E 时展示的建议默认值；无论是 `enabled` 还是 `disabled`，都不能替代当前构建的明确选择，也不授权凭据、支付、生产数据、发布或不可逆副作用。
  （`milestone_smoke`、`milestone_e2e` 字段名保留历史 `milestone` 前缀以维持既有 schema 兼容，语义已收敛为完整验收冒烟偏好与构建级 E2E 建议默认值，与已废弃的“快速/标准/里程碑”任务分级模型无关，不得据字段名推断存在任务分级。）
- `decision_mode: reuse_then_infer_then_ask`：复用能力偏好；对 E2E 则先读取建议默认值，再复用当前构建请求中已经明确的选择，否则在构建前询问一次。GUI 发布性能不得从持久字段推断，只复用当前发布请求已经明确的选择，否则在本次发布开始前询问一次。

`enabled` 表示“允许且适用时优先”，不是无条件执行；`disabled` 表示默认不启用可选能力。安全、产品和渠道硬要求优先于项目偏好，不能用 `disabled` 绕过必需门禁；当前构建的 E2E 明确选择优先于 `milestone_e2e` 建议值。

含 GUI 的一次性初始化 E2E 是脚手架完成门禁，不属于 `milestone_e2e`。初始化器读取固定顺序的九项 GUI profile；同时始终验证不询问、不进入 profile 的 system-locale/updater/window-state 三项 Rust-only 固定基线。按 profile 分派的 system-tray/system-notifications/autostart/single-instance/deep-link/global-shortcut 六个独立 Skills 必须分别证明启用完整或禁用无残留，`deep_link = enabled` 必须同时有 `single_instance = enabled`；关于页、赞助页和侧栏仍按实际选择验证。单实例执行双启动，托盘执行可见托盘与关闭隐藏/恢复/退出，通知、自启与深链接宿主事件只在对应字段启用时执行；中性全局快捷键 contract 验证零默认注册与 owned 清理，只有 contract 明确提供安全可观察绑定时才触发实际 chord 并恢复原配置。macOS 需安装包注册才能证明的深链接场景在 debug no-bundle 阶段标为 `Not verified`。托盘禁用时必须实测关闭最后窗口退出。宿主无法判定/观察适用场景，或无法恢复自启、快捷键、窗口状态等被测宿主状态时，初始化必须阻断，不能用持久偏好跳过。

GUI 正式发布性能同样不是持久偏好。每次 GUI 发布开始前解析当次 `performanceSelection: enabled | disabled`：当前请求已经明确时直接复用，否则询问一次；修复后重跑同一发布时复用原选择，新发布必须重新询问。选择 `enabled` 或产品/渠道硬要求时，才由 `$desktop-test-gui-release-performance` 对 release-profile 探针候选执行；它必须隔离 window-state 持久数据，让每次启动使用同一测试基线，并在成功、失败、超时或取消后恢复且复核原字节/原缺席状态。选择 `disabled` 且没有硬要求时跳过探针，在 manifest 和最终回复记录 `performanceStatus: Not run`、原因与剩余风险，并且不得生成 `performanceEvidence`、`performanceProbe` 或 `performanceRuntimeBinding`。已启用后的性能失败仍先回实现修复和重建；用户显式继续只能记录 `performanceStatus: waived` 与原失败证据，不能把它改判为通过，也不能用 `waived` 冒充预先关闭。updater 插件基线不需要策略字段；每次构建从产品事实解析的 `updaterEnabled` 只控制是否生成和验签 updater archive/`.sig`，不控制是否安装插件。

## 左侧 Task 与独立 Worktree

本节约束 Codex 项目中用户可见的左侧 Task，不改变 `parallel_worktree_subagents` 对单个 Task 内部并行 Subagent 的独立开关。核心关系固定为：一个左侧 Task = 一个明确且可独立验收的目标 + 一个不与其他 Task 共用的 Worktree + 一个 `codex/*` 分支 + 一组可审查提交。

### 创建与命名

- 用户要求新建左侧 Task 处理仓库变更时，默认在该项目的 Codex 管理 Worktree 中创建，不直接复用 Local 主工作目录。每个 Task 只处理一个可独立验收的结果；标题使用简短的“动作 + 结果”，例如“实现微信七项真实能力适配”，不得使用“继续处理”“做一下优化”等无法从侧栏判断结果的标题。
- 新 Task 固定从主任务已经同步并确认的最新本地 `main` HEAD 创建。项目存在远端时，主任务先获取远端引用并完成需要的安全快进，使本地 `main` 成为本次集成基线；没有 `main`、存在分叉或无法确认基线时停止创建，不静默改用当前分支、`master` 或带未提交修改的工作树。
- 主工作目录存在已跟踪或未跟踪修改时，主任务必须先检查差异，排除秘密和生成缓存，并把已经确认属于当前基线的修改提交为可审查基线；无法安全归属或提交时阻断新 Task。不得让 Codex 通过“从带本地修改的分支创建”把未提交状态隐式复制进 Worktree。
- Codex 管理 Worktree 默认可能处于 detached HEAD。新 Task 在首次编辑前必须创建并切换到唯一 `codex/<task-slug>` 分支，确认当前 Git 顶层目录就是该 Task 的 Worktree，且不得让另一个 Task 使用同一 Worktree 或分支。

### 执行、提交与边界

- Task 只在自己的 Worktree 修改文件，不直接编辑 Local 主工作目录，也不进入、清理或复用其他 Task 的 Worktree。保护已有修改，不扩大任务说明中的允许范围。
- 每完成一个能够独立说明结果的逻辑闭环就提交一次。提交信息按 `$desktop-configure-git-commits` 表达已经得到的结果，例如 `feat: implement WeChat accessibility selectors`、`fix: reject stale accessibility identities` 或 `docs: record capability gate evidence`；简单变化可只写主题，非简单变化保留 Why/Changes/Impact/Test，未运行测试明确写 `Not run` 原因。不得把构建缓存、`target/`、`node_modules/`、`dist/`、`__pycache__/` 或其他忽略生成物加入提交。
- Task 不自行覆盖 `/Applications` 中的最终应用，不删除其他 Worktree，不合并 `main`，也不执行推送、发布、签名或其他未在任务描述中明确授权的外部副作用。
- 最终交付前必须确认任务要求的测试已经执行、相关权威文档已经同步、全部任务改动已经提交，并且 `git status --porcelain=v1 --untracked-files=all` 为空。适用目标必须编译并验证真实目标行为；任务没有可编译产物或完整候选不在范围内时，必须把该项明确报告为 `Not applicable` 或 `Not run`，不得伪造通过，也不得因此自动扩大为构建/E2E/完整验收。

### 主任务整合与清理

- Task 完成后只报告分支、提交哈希、实际验证、未执行项和剩余风险，不自行合并 `main`。主任务复核提交、测试证据、文档差异和剩余风险后，才按项目策略把该分支整合进 `main`。
- 只有整合完成、主任务确认没有未提交文件且分支提交已包含在 `main` 后，主任务才移除对应 Worktree，再以安全删除方式删除对应 `codex/*` 分支。Task 本身不得提前删除自己的 Worktree/分支，也不得删除任何其他 Task 的资源。

### 统一 Task 描述模板

以下各节都是必填项。创建者必须把占位句替换为当前任务的真实事实；不适用项保留并明确标为 `Not applicable`，不得删节后让执行边界变得含糊。

```markdown
目标：
完成一个明确、可独立验收的结果。

工作方式：

- 使用独立 Git Worktree 和 `codex/*` 分支。
- 只在当前 Worktree 修改文件。
- 先读取 `AGENTS.md` 及相关事实来源。
- 保护已有修改，不扩大范围。

当前事实：

- 列出已经确认的状态、版本、路径和阻断原因。

必须阅读的项目文档：

- 列出 `AGENTS.md`、`docs/AGENT_POLICY.md` 及本目标精确命中的事实来源。

实施范围：

- 列出允许修改的模块和预期结果。

禁止事项：

- 列出不可覆盖、不可删除、不可合并、不可发布和不可声明通过的内容。

验收标准：

- 编译通过；没有可编译目标时明确标记 `Not applicable`。
- 非空测试套件通过。
- 真实最终产物或目标行为已按任务范围验证。
- 文档与验证记录同步。
- 所有改动已提交。
- `git status` 干净。

交付：
报告分支、提交哈希、实际验证、未执行项和剩余风险；不要自行合并 `main`。
```

## 初始化与持久化

- `$desktop-instantiate-project` 把“推荐预设”或“自定义”与其他固定基础字段放在首轮一次询问；直接调用 `$desktop-initialize-rust-project` 时，则把该策略模式与接口组合放在同一首轮。推荐预设必须显式确认一次；选择自定义后，每轮只询问一个目标用户尚未明确提供的条件字段，每项至多一次。Harness 源字段值不是下游确认，不能因源文件已有 `enabled` 或 `disabled` 而跳过目标用户选择。
- 推荐预设物化为 `superpowers: disabled`、`parallel_worktree_subagents: enabled`、`milestone_smoke: enabled`、`milestone_e2e: disabled`。Superpowers 默认关闭，只有自定义选择明确启用时才可使用；最后一项只是后续构建询问时的建议默认值。预设只是输入捷径，不新增持久字段，也不得在用户未确认时静默采用。
- 四项值全部解析后才一次原子写入本文件；`confirmed_by` 记录真实确认来源，`confirmed_at` 记录最终收齐日期。由 `$desktop-instantiate-project` 进入 `$desktop-initialize-rust-project` 时只验证并复用，不重复询问。
- `pending` 仅允许存在于 Harness 源和初始化未完成的临时状态。创建下游初始化基线提交前，四项选择、`confirmed_by` 和 `confirmed_at` 都必须已解析，任何 `pending` 都阻断完成。
- 初始化首次写入发生在下游 ADR 尚未创建前，不要求为了引导预建 ADR。初始化后的永久策略变更必须由用户确认，并在当日 ADR 记录原因、影响和恢复条件。
- 临时任务约束可以记录在当前工作计划/验证记录中，但不得静默改写本文件。

## 开发与构建

- GUI 初始化在相关非空单元测试后固定调用 `$desktop-test-gui-initialization-e2e`，解析九项 profile，始终验证 system-locale/updater/window-state 三项 Rust-only 基线，再按选择验证单实例、托盘、系统通知、自启、深链接、全局快捷键、页面和侧栏，拒绝禁用能力残留；它不询问 E2E 选择、不改写本文件，也不产生发布候选或 Verification。
- 日常开发直接实施，只运行本次变更需要的单元/回归测试，并只写被独立事件触发的记录；本文件不得成为自动增加 Work Plan、全仓检查、构建、冒烟、E2E 或验收的理由。
- 显式构建必须为当前构建解析一次 E2E 选择。若当前请求已明确 `enabled`/`disabled`，直接复用且不重复询问；否则在任何测试或编译前询问一次，并可把 `milestone_e2e` 作为建议默认选项展示。
- E2E 选择只对当前构建有效，不得静默改写本文件。选择启用或产品/渠道要求时，E2E 只在最终真实候选形成后运行；选择禁用时只在 `release/` manifest 和最终回复记录 `Not run` 与剩余风险。
- 每次 GUI 发布还必须独立解析当次性能选择。`$desktop-prepare-release` 在发布入口复用当前请求的明确选择或询问一次，再把结果传给 `$desktop-build-tauri-release`；直接调用 GUI 构建且没有携带选择时，由构建 Skill 在任何测试或编译前兜底询问一次。两条入口都不得静默沿用上次发布或 `milestone_e2e`。
- 明确发布请求本身授权流程复核并本地提交范围明确的已完成改动，然后直接构建，无需再次询问是否提交或是否构建；普通构建不自动提交，tag、push、上传和正式发布仍需各自授权。
- GUI 性能与 E2E 选择相互独立。性能选择为 `enabled` 或产品/渠道要求时执行完整门禁；为 `disabled` 且无硬要求时允许以 `performanceStatus: Not run` 继续，但必须保留原因和剩余风险。已启用后只有安全修复尝试仍不达标时，才询问用户是否以可见 waiver 继续。
- 构建请求、执行和结果本身不创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification；构建事实只进入当前 `release/` manifest、其声明的相邻制品证据和最终回复。独立触发的 E2E、完整验收、发布、人工复核或长期审计仍由对应流程按自身规则留证。
- 普通缺陷修复、纯重构等维护类型本身不创建 Product Spec、ADR、Status、Changelog 或 Verification；用户明确要求、跨会话交接、安全、发布和长期决定等独立事件仍按各自门禁记录。

## 执行优先级

1. 安全、批准产品范围和分发渠道硬要求。
2. 当前请求中用户明确给出的约束；构建请求中的 E2E 选择和 GUI 发布性能选择属于本级。
3. 本文件持久策略；`milestone_e2e` 只提供建议默认值。
4. Agent 根据接口、真实产物和批准场景作出的适用性判断。
5. 构建请求尚未明确 E2E 时，在测试或编译前询问一次；GUI 发布尚未明确性能选择时同样询问一次，且不跨发布复用；其他事项仍无法可靠判断时再询问用户。

执行原则可概括为：能力偏好先复用；E2E 每次构建都必须有当前选择；GUI 性能每次发布都必须有当次选择。

## 不受影响的能力

- 本文件不关闭 `.agents/skills/` 中的项目 Skills，也不关闭 Codex 基础工具或安全规则。
- 用户明确要求并行且 Worktree/Subagent 已启用时，仍必须满足独立 Git 根、干净已提交基线、文件所有权、`codex/` 分支、辅助程序 `guard`、前台状态和同步等待规则。
- 除 `$desktop-test-gui-initialization-e2e` 的一次性 debug/no-bundle 门禁外，冒烟/E2E 不得在产品定义、计划、日常开发、单元测试、编译、签名、打包、制品收集或发布元数据命令中运行；启用的发布 E2E 只在最终真实候选形成后执行。
