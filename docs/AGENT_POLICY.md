---
schema_version: 5
confirmed_by: pending
confirmed_at: pending
decision_mode: reuse_then_infer_then_ask
superpowers: disabled
user_owned_tasks: disabled
task_worktrees: disabled
parallel_worktree_subagents: disabled
acceptance_smoke: enabled
e2e_hint: disabled
post_release_action: pending
---

# Agent 运行策略

NSH 专用路由：新项目的根 Cargo `interfaces = ["nsh"]` 与 `nsh-targets` 记录桌面、移动、Web、TUI 子目标，全部 NSH 依赖固定到正式 v0.5.0 提交 `f4d68f7f9f31eb7b3ecc8a4cbc31096d5c6238a1`，全局 CLI 须匹配短 SHA `f4d68f7`。NSH 使用 `$desktop-add-nsh-adapter`、`docs/design_standards/nsh_gui.md` 与 `$desktop-build-nsh-release`；既有 `interfaces = ["gui"]`、`gui-framework = "nsh"` 保留读取兼容。仅桌面子目标保存九字段桌面配置，问询由统一表单派生；能力边界以 NSH Skill 的 `references/runtime-and-capabilities.md` 为准。

本文件是下游项目 Agent 能力、用户可见 Task 自动拆分、候选冒烟偏好、构建 E2E 建议默认值和发布后动作的唯一持久事实来源。新初始化固定物化六项能力默认值，不单独询问；完成初始化的下游六项能力选择只能是 `enabled` 或 `disabled`，`confirmed_by`、`confirmed_at` 记录完整汇总的真实确认来源和日期。新下游的 schema 5 允许 `post_release_action: pending` 留到首次发布前明确选择并记录；未选择时 Git 发布门禁失败关闭。Git 发布固定在本地默认主分支与 tag 完成；下游随后按当次已冻结的发布后动作执行并复核。Harness 源的 `pending` 不阻断 Harness 自身的 Git 发布。

DESKTOP 固定使用 Tauri；新项目直接派生根 Cargo metadata 的 `gui-framework = "tauri"`，既有 GUI 缺失值也按 Tauri 读取。顶层 NSH 不写该字段。DESKTOP 要求 Node.js/pnpm，顶层 NSH 只要求 Node.js 工程工具。桌面九项配置复用统一表单；配置协助只记录移交意愿，具体产品动作在终端下游根目录确认。

## 用户要求与项目选择

每次开工先完整读取用户级 `AGENTS.md`，再读取项目入口，复用当前请求已确认的授权。用户最新要求明确修订旧规则时采用新规则；自动创建左侧子会话只取本项目已记录的 `user_owned_tasks`，默认关闭，不再用历史全局 Task Tree 要求绕过项目选择。永久选择由现有策略 writer 记录，未记录的旧全局偏好不视为本项目已启用。Task 和工作树详细合同统一位于 [$desktop-task-workflow](../.agents/skills/desktop-task-workflow/SKILL.md)。

向用户补问时每轮只呈现一个待决字段，并复用用户已经明确给出的合法答案。单选题使用宿主可点击选项；多选题优先使用可勾选多个选项并提交的控件，再明确确认所选集合。若宿主问询工具只能单选，就把同一多选题的各选项依次呈现为“选择/不选择”可点击问题，收齐后用可点击选项确认完整集合，再归一化为一个数组答案；不能把未答、超时或预选项当成确认。没有可点击选择工具时如实说明限制，不要求用户手打选项标签、编号或技术值，也不宣称已显示复选框。文本字段仍按其原有输入和来源规则处理；安全、发布、签名等独立批准门禁不因这种呈现方式合并或跳过。

中文 Git 提交合同由 `$desktop-configure-git-commits` 的提交规范承载：主题摘要和正文说明使用中文，保留 Conventional Commit 类型、scope、技术标识符和必要 Git 语义；机械检查只拒绝确定格式问题，表达质量与差异一致性仍须复核。

## 字段语义

- `superpowers`：`enabled` 允许按任务触发名称以 `superpowers:` 开头的 Skills；`disabled` 禁止后续规划、实现、验证和发布调用或遵循这些 Skills。
- `user_owned_tasks`：是项目唯一自动建 Task 开关，默认 `disabled`。关闭时普通工作在当前聊天完成，不自动创建左侧子树；用户明确新建一个 Task 时只授权该结果，不永久开启。`enabled` 长期授权按结果边界自动创建，已有选择不重复询问。用户选择后通过 `$desktop-configure-agent-policy` 原子记录该字段与确认事实。
- `task_worktrees`：仅选择 Git Task 环境，默认 `disabled`；开启用精确项目的 `environment.type=worktree`，关闭或非 Git 用 `environment.type=local`，不触发 Task 创建。派发冻结环境，后续切换不迁移既有 Task。详细执行见统一 Skill 的 [工作树执行](../.agents/skills/desktop-task-workflow/references/worktree-execution.md)。
- `parallel_worktree_subagents`：只控制当前结果内部的写入型 Subagent Worktree；许可加本次明确并行授权才执行，不创建左侧 Task、不占项目编号、不改变其他开关。所有权明确的独立单元并行创建和执行，同一共享状态写入用短锁。
- `acceptance_smoke`：只在完整真实候选验收中，允许 Agent 对候选执行适用的冒烟测试。
- `e2e_hint`：仅作为每次显式发布候选构建询问 E2E 时展示的建议默认值；无论是 `enabled` 还是 `disabled`，都不能替代当前候选的明确选择，也不授权凭据、支付、生产数据、发布或不可逆副作用。
- `post_release_action`：`local_package` 表示 Git 发布后在当前宿主生成并校验**一个**已选接口/目标的正式本地候选，允许候选保持 `pending`，不代表其他接口或平台已打包、运行或验收；`push_release_branch` 表示把已发布的同一提交放到本地小写 `release` 分支，非强制推送远端默认主分支、同名 release 分支与发布 tag。新下游初始化保持 `pending`；首次发布前由 `$desktop-switch-post-release-action` 呈现两项并记录明确选择。仅所选接口含 CLI、未使用受跟踪锁策略且包含 desktop、mobile 或 web 的 NSH，或含 Tauri GUI 且目标平台含 macOS/Windows 时，才可选 `local_package`。接口和目标须符合 Cargo 允许范围。NSH 的 `dependency-lock-policy = "tracked"` 因生成的运行时 workspace 尚不能传播锁，也须选择远端动作；纯 TUI 的 NSH、纯 MCP 或仅 Linux Tauri GUI 同样须选此项。`pending` 不授权发布，也不隐含本地打包默认值。选择在未来发布中持续生效，可用该 Skill 更改。
- `decision_mode: reuse_then_infer_then_ask`：复用能力偏好；对 E2E 则先读取建议默认值，再复用当前候选构建请求中已经明确的选择，否则在构建前询问一次。发布后动作直接读取 `post_release_action`；首次发布前未明确选择时先补选，缺失、非法或 `pending` 都阻断 Git 发布与后续流程完成。

`enabled` 表示“允许且适用时执行”，`disabled` 表示默认不启用可选能力。`user_owned_tasks: enabled` 是自动建 Task 的明确长期授权；`post_release_action` 是用户对未来 Git 发布后所选动作的长期授权，不授权配置远端、凭据、签名、渠道分发或绕过候选构建的当次 E2E 选择。安全、产品和渠道硬要求优先于项目偏好，不能用 `disabled` 绕过必需门禁；当前候选构建的 E2E 明确选择优先于 `e2e_hint` 建议值。需要远端源码或远程构建的渠道必须先走 `push_release_branch` 并复核远端 `release` 分支与 tag；该要求不改变 Git 发布完成条件。

含 DESKTOP 或 NSH 的一次性初始化 E2E 是脚手架完成门禁，不属于 `e2e_hint`。NSH 的桌面九项 profile 仅在选择桌面子目标时存在；以下 system-locale/window-state、dialog 和六个 Tauri 插件 Skill 的合同只约束 Tauri GUI。Tauri 初始化器读取固定顺序的九项 GUI profile；同时始终验证不询问、不进入 profile 的 system-locale/window-state 两项 Rust-only 固定基线与 dialog 固定 WebView 基线。dialog 必须证明固定 Rust/前端依赖、唯一有序注册、主窗口精确 `dialog:default` 和零额外文件系统授权。按 profile 分派的 system-tray/system-notifications/autostart/single-instance/deep-link/global-shortcut 六个独立 Skills 必须分别证明启用完整或禁用无残留，`deep_link = enabled` 必须同时有 `single_instance = enabled`；关于页、赞助页和侧栏仍按实际选择验证。单实例执行双启动，托盘执行可见托盘与关闭隐藏/恢复/退出，通知、自启与深链接宿主事件只在对应字段启用时执行；中性全局快捷键 contract 验证零默认注册与 owned 清理，只有 contract 明确提供安全可观察绑定时才触发实际 chord 并恢复原配置。需打包安装才能证明的深链接 OS scheme 注册场景（macOS/Windows/Linux）在 debug no-bundle 阶段标为 `Not verified`。托盘禁用时必须实测关闭最后窗口退出。宿主无法判定/观察适用场景，或无法恢复自启、快捷键、窗口状态等被测宿主状态时，初始化必须阻断，不能用持久偏好跳过。

`$desktop-prepare-release` 把本次版本、日期、默认主分支、预期 tag、源码身份和审查结果写入 `.harness/release-context.json`，与双语更新日志一同提交。未来偏好保存在本文件；下游 Git 发布开始时将当次 `postReleaseAction` 冻结在 Git common-dir 生命周期记录的 pending/last release 中，不写入 tracked 发布上下文。重试与恢复只消费该次冻结值，后续切换不改旧发布；签名和候选 E2E 仍按本次构建解析。终端下游的候选构建复核已发布的本地主分支与 tag；远程候选另复核远端 `release` 分支与 tag，这些候选选择只进入候选证据，不反写已发布源码。

## 开发分支与主分支发布生命周期

本节约束 Harness 源和完成初始化的终端下游。终端下游初始化仍可只在本地默认主分支建立中性基线；创建开发分支和 Git 发布均不依赖远端。用户明确要求发布时先执行本地 Git 流程：整理并提交本次源码，普通合并登记分支到本地默认主分支，创建并复读指向最终 HEAD 的版本 tag；这一步即完成 Git 发布。完成初始化的下游在开始该次 Git 发布前冻结已确认的 `post_release_action`，随后必须执行该次冻结的后续路径并检测其真实结果；路径未通过时保留已完成的 Git 发布事实，但不得宣称整个发布后流程完成。Harness 源可保留 `pending`，其 Git 发布后源码归档或推送仍由用户当次明确决定。流程不得替用户创建远端、填写地址或处理凭据。

- 新功能、独立 Bug 修复或其他用户可感知开发在首次写入前自动调用 `$desktop-manage-git-lifecycle start`，创建并切换到 `feature-{ascii-kebab-summary}-{YYYYMMDD}`。日期取 `Asia/Shanghai` 自然日；名称碰撞时由 helper 追加稳定递增后缀。当前分支已登记为同一工作时幂等复用；诊断、同范围实现、相关测试和返工不重复建分支。
- 生命周期状态只写入 Git common dir 下的 `agent-first-harness/git-lifecycle.json`，精确登记由 helper 创建或明确接管的开发分支、Worktree、待完成的 Git 发布、最近成功发布及独立推送进度。`release` 在任何 merge/tag 副作用前原子记录上下文摘要、tag、日期与版本；最终 HEAD 冻结后只沿用同一 HEAD 幂等重试。旧状态若含正在进行的双模式发布或推送，不能静默改写为新语义。所有写操作由同一 common-dir 短时互斥串行化；状态不进入源码提交，未登记资源不得被删除。
- `post_release_action: push_release_branch` 时，独立的 `push-release` 只接受最近发布记录中冻结的最终 HEAD 与 tag；每次调用先解析具名远端 advertised 默认主分支，缺失、无 symbolic HEAD 时零 push 失败；先创建或安全快进本地小写 `release` 分支到该 HEAD，再将远端默认主分支、`release` 分支和 tag 非强制推向一个已配置远端并逐项复读，远端默认主分支也必须同步到同一已发布 HEAD。只有一个已配置远端时可直接使用；多个远端须在本次动作前明确选定一个，缺少远端或必要凭据时保持后续流程未完成。Harness 源不冻结下游动作，只有用户当次要求推送且已发布提交的时间版本、`Version.md` 与活动实例化入口核对通过，才允许使用同一 `push-release`。已有的普通 `publish` 只处理发布前明确要求的主分支推送，不得冒充发布后推送或移动已发布 tag。
- 发布前 `publish` 的多远端推送不是原子操作：后续目标失败时如实报告已确认范围、失败目标及未尝试目标；重试沿用 `pendingPublish` 中冻结的 HEAD、目标顺序与进度，不重新 fetch、merge 或计算新 HEAD。发布后 `push-release` 每次只处理一个目标，同一已发布 HEAD/tag 可幂等重试；它没有多目标 journal，推送失败也不撤销已完成的本地 Git 发布。
- 用户明确说“发布”时，`$desktop-prepare-release` 先把源码/治理变化及已触发 Changelog 提交并锁定 `sourceHead`；只有当前 HEAD 仍等于该值时，才把且只把 `release-notes.json` 与 `.harness/release-context.json` 放进同一个发布元数据提交。tracked 上下文冻结版本、日期、默认主分支、预期 tag 与审查结论；`release` 必须传 `--release-context-sha256 <sha256>`。从关联 Task Worktree 发起时，helper 先核对该 Worktree 的上下文 blob 与工作字节，再路由到主 Worktree；合并前后均核对最终 HEAD 中的同一路径 blob。调用 `release --project-root . --version <version> --date YYYYMMDD --release-context-sha256 <sha256>` 只普通合并登记分支、切换本地默认主分支、创建并复读本地轻量 tag；同名 tag 指向固定 HEAD 时幂等复用，指向其他提交时停止。`sourceHead` 是元数据提交前的审查来源，最终 `sourceCommit` 是主分支/tag 指向的合并结果。
- 默认主分支与本地 tag 精确指向同一最终 HEAD 并复读成功，就是 Git 发布的结束条件。`release` 不在 tag 后执行推送、打包或资源删除。`local_package` 后续路径先运行生命周期 `check-post-release --action local_package`，再运行 `$desktop-switch-post-release-action` 的只读 `route`，以当前宿主和持久接口/目标选择一个正式候选：本机 GUI 或 NSH desktop 优先，其次 CLI，再到 NSH iOS（仅 macOS）、Android、Web；构建失败时保持后续动作阻断，不自动改选。只有用户明确要求另一个受支持目标时才以 `route --interface <接口> --target <目标>` 重新选择；已存在候选仅在同一发布 HEAD、上下文摘要、目标和清单证据全部复核通过时可复用。成功生成并复核该候选及其清单即完成本次本地打包动作，验收 `accepted`、其余平台构建和渠道分发仍各有门禁。`push_release_branch` 后续路径要求本地 `release` 分支以及远端默认主分支、`release` 分支和 tag 都精确指向该 HEAD，复读通过才结束。已登记的临时分支和 Worktree 保留为可核查资源，后续清理只在用户独立要求且身份精确复核后执行。
- 这里没有分支保护、活动叶子、分支级单写入者、严格线性历史、fast-forward-only、lease、atomic push、审查后路径白名单或其他分支门禁；允许普通 merge commit。Task 调度按实际环境处理：同一 Local cwd 串行，独立 Worktree 按不重叠所有权并行，不设每项目单一写入型 active Task 限制。工作树未提交、合并冲突和 tag 冲突按真实操作失败处理；未配置远端不阻断 Git 发布。这些是数据安全与可恢复性检查，不得扩展成分支策略。
- 小写 `release` 仅是 `push_release_branch` 后续路径的源码分支，不参与 Git 发布完成判定；不得创建或使用旧的大写 `Release` 分支。发布后的 tag 是源码版本锚点；候选验收、签名、上传与渠道分发仍由各自请求及硬要求决定。下游受跟踪版本状态的周期复位在下一次开发分支上复核已完成的主分支/tag 后执行，避免 tag 后写脏主分支。

## 用户可见 Task 开关、粒度与创建门禁

本文件只保存项目开关及确认事实；标题、序号、结果边界、描述模板、创建绑定、恢复、授权继承与并行操作的唯一详细合同见 [$desktop-task-workflow](../.agents/skills/desktop-task-workflow/SKILL.md) 及其 [Task 合同](../.agents/skills/desktop-task-workflow/references/task-contract.md)。兼容入口只路由，不复制合同。

`user_owned_tasks: disabled` 是默认状态；只有项目记录为 `enabled` 才自动创建左侧子树。明确的新建请求仅创建对应结果。普通诊断、局部设计、实现和开发回归留在同一结果；阶段隔离仅用户明确要求时执行。正式验收不能由开发回归冒充。

### 所选环境与 Local 串行交接

`task_worktrees` 仅选择环境；派发冻结环境。同一 Local cwd 串行，独立 Worktree 按不重叠所有权并行。schema 3/4 缺少选择时为 `selection_required`，新 Git 环境须明确补选；既有 Task 沿原冻结环境恢复。详情见 [工作树执行](../.agents/skills/desktop-task-workflow/references/worktree-execution.md)。

已授权范围自主实施、修复、检查和适用本地提交，绑定和自检自动完成，无需重复人工审批；只有实质超范围、未授权不可逆副作用或新增凭据/权限操作需要决定。不能伪造宿主批准、提权或绕过工具拒绝。

## 初始化与持久化

- 两种初始化入口的首轮、条件问询、默认触发、冲突修正与最终确认统一由 [唯一表单合同](../.agents/skills/desktop-instantiate-project/references/initialization-form.md) 及其只读解析器执行。本文件只定义持久字段的语义和写入规则，不另维护一套提问顺序；合法已有选择不重问，非法或冲突值仍须修正。
- 固定初始化默认值确定性物化六项；唯一组合由表单的 `initialization_questions.mjs` 提供，不在本文件复制数值。初始化不单独询问 Agent 策略；完整汇总显示六项值，用户确认整个初始化汇总后写入。三个 Task/工作树/内部并行开关独立，语义见上文。
- 六项能力值和 `post_release_action: pending` 以 `schema_version: 5` 一次原子写入本文件；`confirmed_by` 记录完整汇总的真实确认来源，`confirmed_at` 记录确认日期。由 `$desktop-instantiate-project` 进入 `$desktop-initialize-rust-project` 时只验证并复用，不重复询问。
- 创建下游初始化基线提交前，六项能力选择、`confirmed_by` 和 `confirmed_at` 都必须已解析；只有 `post_release_action` 可以保持 `pending`。首次发布开始前必须明确选择并记录该动作，随后才能冻结当次值。schema 4 的动作仍须是两项已选值，其他字段 `pending` 阻断完成。
- 初始化首次写入发生在下游 ADR 尚未创建前，不要求预建 ADR。初始化后，用户可明确说“开启左侧 Task”“关闭左侧 Task”“开启自动 Task 拆分”或“关闭自动 Task 拆分”；Agent 更新 `user_owned_tasks`、`confirmed_by`、`confirmed_at`，并在当日 ADR 记录前后值、原因、影响和恢复条件。用户也可以手动完成同样编辑与 ADR。目标值相同时按幂等 no-op 报告，不重写元数据或 ADR。
- 切换 Task 开关只影响之后的结果边界；切换 `task_worktrees` 只影响后续 Git Task 环境，不迁移、中断、删除或改挂既有 Task/Worktree。新初始化使用 schema 5；合法 schema 3/4 保持严格读取兼容，缺失、额外、重复或非法字段失败关闭，不补默认值。schema 3 的发布动作仍由专用 Skill 补选并只迁移到 schema 4，不顺便选择工作树。schema 4 原五项能力配置与发布动作读写继续工作，工作树为 `selection_required`；不得猜测旧项目选择，只阻断新 Git 环境分配，既有 Task 恢复与发布动作不受影响。
- 明确“开启/关闭 Task 独立工作树”由 `$desktop-configure-agent-policy` 映射到 `task_worktrees`，与“开启/关闭左侧 Task”的 `user_owned_tasks` 分开。schema 5 正常切换只修改指定字段及本次确认元数据；同值保持策略字节、mtime、权限、确认事实和 ADR 不变。
- schema 4 → 5 只在用户明确补选后使用 `migrate-task-worktrees`；先按受保护章节合并正文，消除无条件 Worktree 规则，再在共享锁内核对完整合法 schema 4 和预期 SHA-256。只改 schema 并增加明确选择，逐字保留原五项、发布动作、原确认元数据及正文；新选择来源/日期/影响写当日 ADR。已为 schema 5 且同值 no-op，不同值走正常切换。升级器不写策略选择或用户级规则，不迁移/清理既有资源。旧 Git 生命周期 v3 的进行中发布/推送仍按原恢复门禁，不套用新选择。
- 初始化后的用户可用 `$desktop-switch-post-release-action` 在 `local_package` 与 `push_release_branch` 之间切换；值相同时幂等无写入。切换只决定未来 Git 发布开始时冻结的动作；已开始/完成的发布仍使用其生命周期记录中的冻结值，不改写已完成发布、已生成制品或已推远端 refs。该 Skill 原子更新受保护的动作字段，保留原有能力选择与初始化确认元数据，并在当日 ADR 记录本次用户确认、前后值、原因、影响和恢复条件；升级补选同样遵守此门禁；迁移旧 schema 3 时 `confirmed_by`/`confirmed_at` 保留此前五项能力的原始确认事实，新动作的本次确认来源和日期记录在 ADR。
- 其他初始化后的永久能力偏好变更由 `$desktop-configure-agent-policy` 执行；同样必须由用户确认，并在当日 ADR 记录原因、影响和恢复条件。
- 临时任务约束可以记录在当前工作计划/验证记录中，但不得静默改写本文件。

## 开发与构建

- Tauri GUI 初始化在相关非空单元测试后固定调用 `$desktop-test-gui-initialization-e2e`，解析九项 profile，始终验证 system-locale/window-state 两项 Rust-only 基线与 dialog 固定 WebView 基线，再按选择验证单实例、托盘、系统通知、自启、深链接、全局快捷键、页面和侧栏，拒绝禁用能力残留；它不询问 E2E 选择、不改写本文件，也不产生发布候选或 Verification。
- 日常开发直接实施，只运行本次变更需要的单元/回归测试，并只写被独立事件触发的记录；本文件不得成为自动增加 Work Plan、全仓检查、构建、冒烟、E2E 或验收的理由。
- Windows Tauri GUI 的普通“构建/打包/首次安装试包”默认是 `$desktop-build-tauri-local-install` 的本地开发制品，不是发布候选。它不要求 clean HEAD 或 `release-notes.json`，不调用发布准备、不写根 `release/`、不提交、不签名、不安装，也不询问 E2E；只有用户明确说“发布候选”或“准备并构建发布”才进入下列候选门禁。
- 显式发布候选构建必须为当前候选解析一次 E2E 选择。若当前请求已明确 `enabled`/`disabled`，直接复用且不重复询问；否则在任何测试或编译前询问一次，并可把 `e2e_hint` 作为建议默认选项展示。
- E2E 选择只对终端下游发布候选有效，不得静默改写本文件。选择启用或产品/渠道要求时，E2E 只在最终真实候选形成后运行；选择禁用时只在 `release/` manifest 和最终回复记录 `Not run` 与剩余风险。Harness 源发布不形成产品候选，因此本项为 `Not applicable`。
- 明确发布请求授权复核并提交本次范围和发布上下文，在任何生命周期副作用前将 tracked 上下文 SHA-256 传给 `$desktop-manage-git-lifecycle release`。唯一 `release` 路径普通合并登记分支到本地默认主分支，创建并复读 `v{版本}-{YYYYMMDD}`；主分支和 tag 指向同一最终 HEAD 即结束 Git 发布，不推送、打包或清理。完成初始化的下游随后读取该次发布冻结的 `postReleaseAction`：`local_package` 按上一节的只读路由选一个当前宿主候选，以对应本地打包 Skill 和当次选择执行并复核真实制品及清单；`push_release_branch` 调用 `push-release --remote <name>` 并复核远端默认主分支、`release` 分支和 tag。未完成选择、目标解析、打包或远端复读时，只报告 Git 发布已完成及后续路径阻断，不把整条后续流程报为完成。Harness 源的源码归档或远端动作仍由当次用户要求决定。发布前用户只说“推送”仍可执行 `publish`，并可在逐一授权后用 `--also-remote` 推向补充远端，但不创建 tag。普通构建不自动提交、推送或修改主分支。
- 构建请求、执行、候选 E2E、完整验收、`pending` → `accepted` 和就绪复核只写忽略的 `release/` 原子证据及最终回复，不自动创建或更新 tracked 项目记忆。Git 发布完成后，下一条开发分支在首个新改动前以精确版本、tag 和 40 位主分支 HEAD 调用 `finalize-release`，再进行新需求优先的版本分类；候选或渠道分发不重复重置版本周期。独立回顾性审计不得反向批准活动候选。
- 普通缺陷修复、纯重构等维护类型本身不创建 Product Spec、ADR、Status、Changelog 或 Verification；用户明确要求、跨会话交接、安全、发布和长期决定等独立事件仍按各自门禁记录。

## 执行优先级

1. 安全、批准产品范围和分发渠道硬要求。
2. 当前请求和用户级 `AGENTS.md` 中已确认的长期硬规则；发布候选构建请求中的 E2E 选择属于本级。
3. 本文件持久策略；`e2e_hint` 只提供建议默认值。
4. Agent 根据接口、真实产物和批准场景作出的适用性判断。
5. 发布候选构建请求尚未明确 E2E 时，在测试或编译前询问一次；其他事项仍无法可靠判断时再询问用户。

执行原则可概括为：能力偏好先复用；本地开发试包不消费 E2E 选择；发布候选 E2E 和适用 macOS 签名在每次独立候选构建前解析并封存到候选证据，后续构建和验收只读消费该次选择。

## 不受影响的能力

- 本文件不关闭 `.agents/skills/` 中的项目 Skills，也不关闭 Codex 基础工具或安全规则。
- 已授权的内部并行按 `$desktop-task-workflow` 执行；保留原 helper 路径。独立 Worktree 按所有权并行创建和执行，编号/所有权预留及生命周期共享状态用短锁；不因活动叶子、分支祖先关系或每项目单写入限制阻断。
- 除 `$desktop-test-gui-initialization-e2e` 或 `$desktop-test-nsh-initialization-e2e` 一次性本机调试门禁外，冒烟/E2E 不得在产品定义、计划、日常开发、单元测试、编译、签名、打包、制品收集或发布元数据命令中运行；启用的发布 E2E 只在最终真实候选形成后执行。

NSH 工程选择：新下游以顶层 `interfaces = ["nsh"]` 和 `nsh-targets` 保存 desktop/mobile/web/tui 子目标；包含 desktop、mobile 或 web 且锁策略不为 `tracked` 时可选择 local_package，并保留 adapter/build 专用 Skills、运行时知识和共享支持页资产。受跟踪锁策略的 NSH 只能选择远端动作，直到运行时锁传播受支持。旧 `interfaces = ["gui"]`、`gui-framework = "nsh"` 只读兼容。未选 NSH 时裁掉专属能力。NSH 初始化 E2E 和初始化 wrapper 不传播；受保护 Cargo、仅桌面适用的 profile、策略、产品源码及签名仍按既有保护规则保留。升级不会把声明支持改写为验证通过。
