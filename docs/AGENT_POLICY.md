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
- `parallel_worktree_subagents`：`enabled` 只表示用户明确要求并行时允许使用 Worktree + 写入型 Subagent；`disabled` 使用单 Agent 当前工作树。持久启用本身不能触发并行步骤；受管 feature 链处于 active 时，为保持可发布的严格线性历史，产品写入仍必须串行，只有只读 Subagent 可并行。
- `milestone_smoke`：只在完整真实候选验收中，允许 Agent 对候选执行适用的冒烟测试。
- `milestone_e2e`：仅作为每次显式发布候选构建询问 E2E 时展示的建议默认值；无论是 `enabled` 还是 `disabled`，都不能替代当前候选的明确选择，也不授权凭据、支付、生产数据、发布或不可逆副作用。
  （`milestone_smoke`、`milestone_e2e` 字段名保留历史 `milestone` 前缀以维持既有 schema 兼容，语义已收敛为完整验收冒烟偏好与构建级 E2E 建议默认值，与已废弃的“快速/标准/里程碑”任务分级模型无关，不得据字段名推断存在任务分级。）
- `decision_mode: reuse_then_infer_then_ask`：复用能力偏好；对 E2E 则先读取建议默认值，再复用当前发布候选请求中已经明确的选择，否则在候选构建前询问一次。GUI 发布性能不得从持久字段推断，只复用当前发布请求已经明确的选择，否则在本次发布开始前询问一次。

`enabled` 表示“允许且适用时优先”，不是无条件执行；`disabled` 表示默认不启用可选能力。安全、产品和渠道硬要求优先于项目偏好，不能用 `disabled` 绕过必需门禁；当前发布候选的 E2E 明确选择优先于 `milestone_e2e` 建议值。

所有拥有可更新会话标题的普通当前 Session、Git Worktree/非 Git Local 左侧 user-owned Task，以及内部 Subagent/agent thread（包括绑定内部单元 Worktree 的执行线程），都使用同一显示标题：`{序号}|{Task简述}|{当前进度} |{功能摘要}`。四段使用 ASCII `|` 分隔，`当前进度` 后与第三个 `|` 前固定恰好一个 ASCII 空格；`Task简述` 是稳定、非空且不含 `|` 的任务短语，`功能摘要` 是不含 `|` 的非空单一结果简述；`Task简述` 与 `功能摘要` 都必须单行、首尾无空白。`当前进度` 只能是 `已分配`、`运行中`、`检查中`、`已完成` 之一。`序号` 是无前导零的正十进制整数，优先复用当前说明或同一结果既有合规标题中的序号；普通当前 Session 没有可复用值时从 `1` 开始，同一 Session 明确开始新独立结果时在可确定的前序号上加 `1`；协调方创建一组左侧 Task 或派发一组内部 Subagent 时，分别按该批次顺序从 `1` 分配。`序号`、`Task简述` 和 `功能摘要` 在同一结果内保持不变，只更新第三字段，例如 `4|统一Session标题格式|运行中 |统一普通会话、Worktree与Subagent命名`。序号只在当前 Session 或协调/派发批次内稳定，不承诺跨 Session 的全局唯一性；调用后返回的 `threadId`/`clientThreadId`、Subagent 技术 `task_name` 和 Git ref 只用于真实身份或技术绑定，不得生成序号或反填显示标题，标题也不承担唯一身份。

进度标题是贯穿会话的非阻断 UI 元数据闭环。Git Worktree 或 Local 左侧 Task 在 `create_thread` 派发时使用 `{序号}|{Task简述}|已分配 |{功能摘要}`；目标 Task 开始处理后自行把第三字段更新为 `运行中`。普通当前 Session 在首次形成三个稳定字段并开始处理时直接更新为 `运行中`。内部 Subagent 的协调方必须在调用 `spawn_agent` 前分配序号、Task 简述和功能摘要，并把完整的 `已分配` 标题写进派发消息；由于 `spawn_agent` 不提供显示标题参数且技术 `task_name` 只接受受限标识，内部 Subagent 取得执行权后的第一项 UI 动作是自行把当前会话标题更新为 `运行中`，不得把显示标题塞入 `task_name`。实现结束并真实进入本次必要测试、review 或最小替代检查前把第三字段更新为 `检查中`；没有独立检查的任务可以跳过该阶段。检查发现同范围问题并返回修复时重新更新为 `运行中`，再次进入检查时再更新为 `检查中`。只有授权结果、全部必需检查，以及请求或流程要求的提交、推送和远端复读都已完成，才在最终回复前更新为 `已完成`；`已完成` 是终态，不得回退。恢复会话时可以跳过已经真实经过的阶段；遇到阻断时保留最后真实阶段并在正文报告，不得虚写 `已完成` 或创造第五种状态。内部单元 Worktree 本身没有独立 Session 标题，由实际绑定该 Worktree 的 Subagent/agent thread 承载标题生命周期。

每次真实进度转换至多尝试一次标题更新；目标标题已经精确匹配时只验证，否则当前 Session、左侧 Task 或内部 Subagent 都调用 `set_thread_title` 并省略 `threadId`，使宿主只重命名当前调用线程。普通 Session 与左侧 Task 随后用调用环境已提供、重命名响应返回或更新前对账得到的真实 `threadId` 调用 `list_threads` 做一次有界复读，同时核对可用的 `hostId`/`projectId`，并按同一真实 id 比较宿主返回的规范化标题原文；隐藏 Subagent 不出现在 `list_threads` 时改用 `read_thread`，具体只使用 `set_thread_title` 响应返回的精确 `threadId` 有界复读一次，不创建可见替代 Task。创建者只负责 `create_thread.title` 的 `已分配` 初始值；内部 Subagent 的协调方只负责把逻辑 `已分配` 标题写入派发消息，后续转换一律由目标线程自身执行。工具不可用、真实 id 不可得、候选有歧义、更新失败或两种适用复读方式仍未反映时，不得创建替代 Task、回退状态或无限重试，也不得推翻已经完成的任务结果；最终回复明确报告“已更新并验证”“已请求但未验证”或“更新失败”及原因。

含 GUI 的一次性初始化 E2E 是脚手架完成门禁，不属于 `milestone_e2e`。初始化器读取固定顺序的九项 GUI profile；同时始终验证不询问、不进入 profile 的 system-locale/updater/window-state 三项 Rust-only 固定基线与 dialog 固定 WebView 基线。dialog 必须证明固定 Rust/前端依赖、唯一有序注册、主窗口精确 `dialog:default` 和零额外文件系统授权。按 profile 分派的 system-tray/system-notifications/autostart/single-instance/deep-link/global-shortcut 六个独立 Skills 必须分别证明启用完整或禁用无残留，`deep_link = enabled` 必须同时有 `single_instance = enabled`；关于页、赞助页和侧栏仍按实际选择验证。单实例执行双启动，托盘执行可见托盘与关闭隐藏/恢复/退出，通知、自启与深链接宿主事件只在对应字段启用时执行；中性全局快捷键 contract 验证零默认注册与 owned 清理，只有 contract 明确提供安全可观察绑定时才触发实际 chord 并恢复原配置。macOS 需安装包注册才能证明的深链接场景在 debug no-bundle 阶段标为 `Not verified`。托盘禁用时必须实测关闭最后窗口退出。宿主无法判定/观察适用场景，或无法恢复自启、快捷键、窗口状态等被测宿主状态时，初始化必须阻断，不能用持久偏好跳过。

GUI 正式发布性能同样不是持久偏好。每次 GUI 发布开始前解析当次 `performanceSelection: enabled | disabled`：当前请求已经明确时直接复用，否则询问一次；修复后重跑同一发布时复用原选择，新发布必须重新询问。选择 `enabled` 或产品/渠道硬要求时，才由 `$desktop-test-gui-release-performance` 对 release-profile 探针候选执行；它必须隔离 window-state 持久数据，让每次启动使用同一测试基线，并在成功、失败、超时或取消后恢复且复核原字节/原缺席状态。选择 `disabled` 且没有硬要求时跳过探针，在 manifest 和最终回复记录 `performanceStatus: Not run`、原因与剩余风险，并且不得生成 `performanceEvidence`、`performanceProbe` 或 `performanceRuntimeBinding`。已启用后的性能失败仍先回实现修复和重建；用户显式继续只能记录 `performanceStatus: waived` 与原失败证据，不能把它改判为通过，也不能用 `waived` 冒充预先关闭。updater 插件基线不需要策略字段；每次发布候选构建从产品事实解析的 `updaterEnabled` 只控制是否生成和验签 updater archive/`.sig`，不控制是否安装插件。

“不是持久偏好”不等于依赖对话内存：`$desktop-prepare-release` 必须把当次审查结果、GUI 性能选择和适用的 macOS 签名选择/来源封存在当前链 closing commit 的 `releaseReview`/`candidateSelections`，使同一发布中断重试可复用；它们不得写入 frontmatter 或成为下一次发布默认值。候选构建在清理、测试前和写 manifest 前只读验证并消费这两份信封，只在关闭链后另行解析 E2E。

## 产品 feature 分支链与默认分支发布

本节只约束完成初始化且已经存在可访问 Git 远端的终端下游。初始化仍在本地 `main` 上建立唯一中性基线且不配置远端；在用户或外部系统后来配置远端之前，产品开发必须因缺少安全发布目标而停止，不得由 Agent 创建远端、填写地址或处理凭据。远端优先使用精确 `origin`；没有 `origin` 时只接受唯一远端，零个或多个候选都失败，除非用户在当前请求明确给出远端名。

- 新需求、Bug 修复或其他会写入仓库的维护工作开始前，调用 `$desktop-manage-git-branch-chain start`。分支名固定为 `feature-{ascii-kebab-summary}-{YYYYMMDD}`：摘要由需求或 Bug 的最短可辨识语义转为小写 ASCII kebab，日期取 `Asia/Shanghai` 自然日；Bug 同样使用 `feature-` 前缀。命名为空、碰撞、工作树/暂存区不干净、远端不可读写或分支已被其他 Worktree 占用时失败关闭，不猜测后缀、不覆盖 ref。
- 分支链严格串行。第一条链和每次成功发布后的新链都从已推送并复读的动态远端默认 `main`/`master` 精确提交开始；链已活动时，每个真正的新需求/Bug 从当前已推送叶子的精确提交创建下一节点。同一需求的诊断、实现、相关测试、review 和同范围修正继续使用同一叶子，不重复建节点，不创建 `Release` 中转分支。
- 唯一迁移兼容是本规则生效前已存在、当前本地/远端完全推送并已被活动链冻结为精确基线的 legacy `Release`：冻结默认旧 OID 必须是该基线祖先；该轮发布在同一 atomic push 中以精确 lease 推进默认分支并删除 legacy `Release` 与登记 feature refs，随后切回默认分支完成本地 CAS 清理。不得新建、更新或把它用作候选分支；迁移完成后新链只能从默认分支开始。
- 一条 active feature 叶子同一时刻最多承载一个产品写入 `codex/task-*`，且该 Task 不得再创建 sibling 写入 `codex/unit-*`；只读 Task/Subagent 仍可并行。协调方只能在登记 active feature 叶子的 Worktree 中调用 `$desktop-manage-git-branch-chain integrate-task`，显式传入匹配 `codex/task-<task-slug>` 的 Task ref、该 ref 唯一登记的独立 Worktree 和已经选定的 40 位小写 Task OID；工具要求两个 Worktree clean、叶子本地/远端 OID 一致、Task 是叶子的严格非 merge 线性后代、Task 范围内任一提交都未触碰受保护链状态（后续恢复原字节也不例外），且链内 feature refs、目标 Task ref 和其他 `codex/task-*`/`codex/unit-*` 没有冲突占用，才以 `git merge --ff-only <task-head>` 只更新本地叶子。命令不得自动 push 或清理 Task；后续 `publish` 成功把新叶子 OID 推送并复核活动状态后，才能清理并从新的远端 OID 创建下一个写入 Task。不得用 merge commit、rebase、cherry-pick 或 squash 拼接并行 sibling 历史来绕过严格线性发布门禁。
- `.harness/git-branch-chain.json` 是受保护的当前链状态。活动链记录 schema、远端、默认分支与冻结 OID、基线 ref/OID、节点顺序、每节点父 ref/OID、活动叶子和 `active` 阶段；关闭提交把活动链转为含发布前默认分支 OID、每节点关闭前 OID、`releaseReview` 和 `candidateSelections` 的不可变 `lastClosedChain`。审查终点后的提交按提交逐个检查，改后恢复也不能夹带非发布元数据路径；两份信封和关闭状态在一个提交中原子封存。关闭提交自身 OID 不可能自引用写入其 tree，固定以 `closingHead: null` 表示并由“当前提交的唯一直接父等于关闭前叶子”推导；每次 `start`/`publish`/`release` 都实时复读实际远端 OID，不把它伪造为持久字段。`start` 必须先形成仅含该状态变化的提交，再以非强制 push 创建远端节点并复读；失败时不得开始产品源码写入。不得手改状态伪造链路或删除范围。
- 每个日常逻辑闭环都按 `$desktop-configure-git-commits` 形成归属明确的提交，随后调用 `$desktop-manage-git-branch-chain publish`，只用显式完整 refspec 把登记活动叶子非强制快进到登记远端并复读 40 位 OID。普通 Task、构建、诊断或状态检查不扩大此授权；不得自动配置远端/凭据、强推、rebase、cherry-pick、打标签或上传制品。
- 精确 `main`、`master` 与动态解析出的远端默认分支在日常流程中是保护分支：Agent 可以只读解析或把它作为合格基线，但日常实现和普通 Git 命令不得在其上写文件、暂存、提交、合并、推送或删除。唯一写入例外是下一条规定的 `$desktop-manage-git-branch-chain release` 原子事务对动态默认 `main`/`master` 的受限严格快进；不得由此放宽其他主分支操作。工具必须在写入前和提交/推送前后复核当前分支、HEAD、远端 OID 与工作树，detached HEAD 或任何漂移都失败关闭。
- 用户明确要求程序发布候选时，`$desktop-prepare-release` 先把活动叶子的源码与发布元数据提交全部推送，再把显式完整的审查/候选选择信封传给 `$desktop-manage-git-branch-chain release`。只有登记节点构成从冻结默认分支基线到活动叶子的严格父子线性历史、父 OID 未漂移、全部本地/远端 OID 一致、工作树干净且无其他 Worktree 占用时，才在叶子提交关闭状态，并用一次 atomic push 把动态默认 `main`/`master` 从冻结 OID 严格快进到关闭提交，同时以每个登记远端 feature ref 的旧 OID 作为 lease 删除整链；禁止通配符、无精确期望 OID 的强制更新、非快进、merge commit、rebase、cherry-pick 或删除链外 ref，逐 ref lease 删除是唯一允许的 force 形式。任何正式候选构建都必须先用 `verify-release-review` 证明当前 clean 默认分支正是已完成远端/本地收尾且信封有效的关闭提交。
- atomic push 失败时默认分支和所有远端 feature ref 都必须保持原状；远端成功后复读确认默认分支精确等于关闭提交，再受管切换或严格快进本地同名默认分支，并按状态清单删除精确本地 feature refs。若只在本地切换或清理阶段中断，保留可幂等重试的关闭状态，不得重做远端发布或扩大删除范围。成功后当前分支是 clean 的动态默认 `main`/`master`，本地/远端默认分支与关闭提交相同，链状态回到空闲。
- 原本缺失的 `Release` 不进入正常 push refspec，因为 Git 不能在不更新该 ref 的同时安全原子断言它在远端广告后仍缺失。若外部恰在该窗口创建它，helper 必须保留未知 ref；默认分支/登记 feature 的原子事务可能已完成，但后置复核仍返回可恢复冲突，外部所有者精确移除该 ref 后重试只完成本地收尾。legacy 迁移中冻结的 `Release` 若在失败事务后已缺失，重试可把该精确删除视为完成并继续；任何重新出现的未知值都不得代删。
- 正常 `release` 只删除 `.harness/git-branch-chain.json` 精确登记且 OID/lease 匹配的本轮 feature refs；唯一额外删除项是上述迁移路径中以冻结旧 OID 明确绑定的 legacy `Release`。不得按前缀或通配符扫描删除 `feature-*`、`codex/task-*`、`codex/unit-*`、其他分支或 Worktree。临时 Task/单元分支继续由各自既有整合与清理流程负责。默认分支自动快进、切换和登记链清理不等于真实渠道发布成功，不能自行触发版本周期重置、标签、上传或渠道副作用。

## 左侧 Task、项目绑定与独立 Worktree

本节只约束用户能从侧栏独立进入的 user-owned Task/thread。plan、Todo、brief、report、review、Subagent、agent thread 和内部单元 Worktree 都是当前 Task 的内部结构，不是新的左侧 Task，也不得通过 `create_thread` 伪装成左侧 Task；这项身份分层不豁免内部 Subagent/agent thread 遵守统一会话标题格式。`parallel_worktree_subagents` 只控制单个左侧 Task 内部的并行能力。

一个左侧 Task 固定对应一个明确且可独立验收的结果、一个保存的 Codex 项目、Git 项目中的一个不与其他 Task 共用的 Codex 管理 Worktree、一个 `codex/task-*` 分支和一组可审查提交。诊断、实现、证明该结果所需的测试或 review，以及修复这些检查发现的同范围缺陷，仍属于同一结果；不得只因生命周期阶段变化自动拆 Task。只有用户明确要求创建新的左侧 Task，或用户已经明确把当前 Task 定义为多 Task 协调器并指定独立结果时，才调用 `create_thread`。普通单结果请求不先创建所谓 Task0，当前 Task 可以直接实施。

### 创建状态机

1. **RESOLVED**：调用 `list_projects`，按规范化完整路径精确选中保存项目并记录其真实 `projectId`、项目类型和 `isGitRepository`；同名标签、当前 cwd 或仓库名称都不能替代路径核对。调用 `create_thread` 时必须使用 `target.type = project` 和该 `projectId`。Git 项目使用 `environment.type = worktree`；非 Git 项目使用 `environment.type = local`。项目工作不得使用 `projectless`、临时目录、Task0 cwd、默认兜底项目或其他项目。
2. **DISPATCHED**：对一个结果只调用一次 `create_thread`。左侧 Task 必须在派发前记录不可变 Task key、分配稳定正整数序号，并显式传入 `title="{序号}|{Task简述}|已分配 |{功能摘要}"`；序号不得使用调用后才返回的 `threadId` 或 `clientThreadId`。返回 `threadId` 表示已得到可管理的 Ready Task；只返回 `clientThreadId` 表示创建请求已接受但仍为 `SETUP_PENDING`，不是失败，也不是可传给 `read_thread`、`wait_threads` 或其他要求 `threadId` 的标识。此时立即报告 queued Task 并返回对应的 created-thread UI 引用；不得假设存在 `clientThreadId → threadId` 桥、无限轮询、重复创建、把 pending 改称 Ready，或在当前 Task/后台目录代替新 Task 偷跑。
3. **RECONCILED**：已经取得真实 `threadId` 时立即用 `list_threads` 对账；只有 `clientThreadId` 时，则仅在用户随后明确要求检查先前 queued Task 后对账。以真实 id 和精确 `projectId` 为主键；标题使用工具返回的规范化标题原文，不因应用正常化措辞而误判。目标 Task 可能已经推进进度，因此只核对三个稳定字段与合法进度字段，不要求仍为 `已分配`。唯一候选尚未出现时保持 `SETUP_PENDING` 并结束本次检查；候选不唯一时报告 ambiguous；只有工具明确返回失败才记为 `SETUP_FAILED`。任何 pending/ambiguous 状态都禁止“再创建一个碰碰运气”。
4. **BOUND**：进入 Ready Task 后、首次写入前再次确认线程 `projectId` 精确匹配。Worktree 的物理路径通常位于保存项目目录之外，不能用字符串祖先关系判断归属；必须分别解析保存项目根与 Task Git 顶层的规范化 `git rev-parse --path-format=absolute --git-common-dir`，要求相同，并要求保存项目的 `git worktree list --porcelain` 已登记该 Task 顶层。非 Git Local Task 才要求 cwd 等于保存项目完整路径。`projectId` 为空/错误、Git common dir 不同、Worktree 未登记或起始提交不符时保持零写入并报告绑定错误；现有 Task 不能被仓库规则静默改挂到另一项目。

### 命名、基线与分支

- Git Worktree 与非 Git Local 左侧 Task 都遵守统一进度标题。调用 `create_thread` 时必须显式传入 `title="{序号}|{Task简述}|已分配 |{功能摘要}"`；目标 Task 取得执行权后按本文件的真实阶段只更新第三字段，三个稳定字段不得改变。不得把调用后才返回的 `threadId`/`clientThreadId` 写进序号或标题。创建后以真实 id 和 `projectId` 对账，并使用 `list_threads` 返回的规范化标题原文展示，不靠标题承担身份判断。
- Task 描述记录不可变的 Task key、稳定序号、Task 简述、功能摘要、派发时使用的完整 `已分配` 显示标题、独立的 ASCII `task-slug`、目标 `projectId`、保存项目完整路径、Git repository identity、起始分支/提交和完成边界。显示标题与 Git slug 是两个事实；不得把 `{序号}|{Task简述}|{当前进度} |{功能摘要}` 原样当作 Git ref，也不得根据返回 id 重新分配序号。未明确这些事实时不得用猜测值创建。
- 只读或非产品写入 Task 在用户明确指定时按该 branch/ref 创建，否则使用保存项目的默认分支 HEAD，不硬编码 `main` 或 `master`，也不主动 fetch/pull。会形成产品变更的 Task 必须从已推送的活动 feature 叶子创建；若它本身代表新需求/Bug且尚无活动链，协调方先在保存项目按上一节建立叶子，再把精确 OID 作为 Task 起点。同一活动叶子已有未整合的写入 Task 时不得再创建第二个写入 Task；必须等前者 fast-forward 整合并推送后从新 OID 创建。基线必须已有提交；除非用户明确要求从 working tree 状态开始且不违反分支链保护，否则不得复制未提交修改。基线不明确、分叉或修改无法安全归属时停止创建。
- Codex 管理 Worktree 默认可能处于 detached HEAD。Ready Task 在首次编辑前使用描述中单独记录的 ASCII `task-slug` 创建并切换到唯一 `codex/task-<task-slug>` 分支；`task-slug` 只服务路径和 Git ref 安全，不是显示标题。确认当前 Git 顶层就是已登记的该 Task Worktree，且不得让另一个 Task 使用同一 Worktree 或分支。

### 执行、提交与边界

- Task 只在自己的 Worktree 修改文件，不直接编辑 Local 主工作目录，也不进入、清理或复用其他 Task 的 Worktree。保护已有修改，不扩大任务说明中的允许范围。
- 每完成一个能够独立说明结果的逻辑闭环就提交一次。提交信息按 `$desktop-configure-git-commits` 表达已经得到的结果，例如 `feat: implement WeChat accessibility selectors`、`fix: reject stale accessibility identities` 或 `docs: record capability gate evidence`；简单变化可只写主题，非简单变化保留 Why/Changes/Impact/Test，未运行测试明确写 `Not run` 原因。不得把构建缓存、`target/`、`node_modules/`、`dist/`、`__pycache__/` 或其他忽略生成物加入提交。
- `codex/task-*` 和 `codex/unit-*` 是临时实施分支，不是 feature 链节点。Task 不自行覆盖 `/Applications` 中的最终应用，不删除其他 Worktree，不合并保存项目的默认/集成分支或活动 feature 叶子，也不执行推送、发布、签名或其他未在任务描述中明确授权的外部副作用。
- 最终交付前必须确认任务要求的测试已经执行、相关权威文档已经同步、全部任务改动已经提交，并且 `git status --porcelain=v1 --untracked-files=all` 为空。适用目标必须编译并验证真实目标行为；任务没有可编译产物或完整候选不在范围内时，必须把该项明确报告为 `Not applicable` 或 `Not run`，不得伪造通过，也不得因此自动扩大为构建/E2E/完整验收。

### 协调方整合与清理

- Task 完成后只报告分支、提交哈希、实际验证、未执行项和剩余风险，不自行合并默认/集成分支或活动 feature 叶子。协调 Task 或用户读取该报告后，只机械核对任务范围、疑似秘密、任务明确要求的测试、工作树 clean、分支/Worktree/OID/祖先、受保护状态和唯一写入占用；不得借整合执行非必要语义审查。门禁通过后用 `integrate-task` 把提交快进到创建时登记的活动 feature 叶子，再由该叶子执行 `publish`。
- 只有整合完成、确认没有未提交文件且 Task 提交已包含在登记的活动 feature 叶子后，协调方才移除对应 Worktree，再安全删除对应 `codex/task-*` 分支。Task 本身不得提前删除自己的 Worktree/分支，也不得删除任何其他 Task 的资源。

### 统一 Task 描述模板

以下各节都是必填项。创建者必须把占位句替换为当前任务的真实事实；不适用项保留并明确标为 `Not applicable`，不得删节后让执行边界变得含糊。

```markdown
目标：
完成一个明确、可独立验收的结果。

Task 绑定：

- Task key：填写派发前分配的不可变技术标识；它不进入显示标题，也不得填写返回后的 `threadId` 或 `clientThreadId`。
- 标题序号：填写当前协调批次按派发顺序分配的正整数；同一结果全程不变，不从 Task key、宿主 id、列表顺序或 Git ref 推导。
- 显示标题：填写按 `{序号}|{Task简述}|已分配 |{功能摘要}` 形成并传给 `create_thread.title` 的完整字符串；同时单独记录序号、Task 简述和功能摘要三个稳定字段，供目标 Task 后续只替换第三个进度字段。
- Git task slug：Git Worktree Task 填写独立的 ASCII `task-slug`，供 `codex/task-<task-slug>` 使用；不得复制显示标题，非 Git 时标记 `Not applicable`。
- Codex 项目：填写名称、`projectId` 和保存项目完整路径。
- Git 绑定：填写 repository identity、起始分支和起始提交；非 Git 时标记 `Not applicable`。

工作方式：

- Git 项目使用独立、已登记的 Codex Worktree 和 `codex/task-*` 分支；非 Git 项目使用绑定项目的 Local 环境。
- 只在当前 Worktree 修改文件。
- 先读取 `AGENTS.md` 及相关事实来源。
- 保护已有修改，不扩大范围。

当前事实：

- 列出已经确认的版本、环境和阻断原因；创建者只报告真实 `threadId` 或 `SETUP_PENDING`，不得伪造 Ready。

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
报告分支、提交哈希、实际验证、未执行项和剩余风险；不要自行合并默认/集成分支。
```

## 初始化与持久化

- `$desktop-instantiate-project` 把“推荐预设”或“自定义”与其他固定基础字段放在首轮一次询问；直接调用 `$desktop-initialize-rust-project` 时，则把该策略模式与接口组合放在同一首轮。推荐预设必须显式确认一次；选择自定义后，每轮只询问一个目标用户尚未明确提供的条件字段，每项至多一次。Harness 源字段值不是下游确认，不能因源文件已有 `enabled` 或 `disabled` 而跳过目标用户选择。
- 推荐预设物化为 `superpowers: disabled`、`parallel_worktree_subagents: enabled`、`milestone_smoke: enabled`、`milestone_e2e: disabled`。Superpowers 默认关闭，只有自定义选择明确启用时才可使用；最后一项只是后续构建询问时的建议默认值。预设只是输入捷径，不新增持久字段，也不得在用户未确认时静默采用。
- 四项值全部解析后才一次原子写入本文件；`confirmed_by` 记录真实确认来源，`confirmed_at` 记录最终收齐日期。由 `$desktop-instantiate-project` 进入 `$desktop-initialize-rust-project` 时只验证并复用，不重复询问。
- `pending` 仅允许存在于 Harness 源和初始化未完成的临时状态。创建下游初始化基线提交前，四项选择、`confirmed_by` 和 `confirmed_at` 都必须已解析，任何 `pending` 都阻断完成。
- 初始化首次写入发生在下游 ADR 尚未创建前，不要求为了引导预建 ADR。初始化后的永久策略变更必须由用户确认，并在当日 ADR 记录原因、影响和恢复条件。
- 临时任务约束可以记录在当前工作计划/验证记录中，但不得静默改写本文件。

## 开发与构建

- GUI 初始化在相关非空单元测试后固定调用 `$desktop-test-gui-initialization-e2e`，解析九项 profile，始终验证 system-locale/updater/window-state 三项 Rust-only 基线与 dialog 固定 WebView 基线，再按选择验证单实例、托盘、系统通知、自启、深链接、全局快捷键、页面和侧栏，拒绝禁用能力残留；它不询问 E2E 选择、不改写本文件，也不产生发布候选或 Verification。
- 日常开发直接实施，只运行本次变更需要的单元/回归测试，并只写被独立事件触发的记录；本文件不得成为自动增加 Work Plan、全仓检查、构建、冒烟、E2E 或验收的理由。
- Windows GUI 的普通“构建/打包/首次安装试包”默认是 `$desktop-build-tauri-local-install` 的本地开发制品，不是发布候选。它不要求 clean HEAD 或 `release-notes.json`，不调用发布准备、不写根 `release/`、不提交、不签名、不安装，也不询问 E2E 或性能选择；只有用户明确说“发布候选”或“准备并构建发布”才进入下列候选门禁。
- 显式发布候选构建必须为当前候选解析一次 E2E 选择。若当前请求已明确 `enabled`/`disabled`，直接复用且不重复询问；否则在任何测试或编译前询问一次，并可把 `milestone_e2e` 作为建议默认选项展示。
- E2E 选择只对当前发布候选有效，不得静默改写本文件。选择启用或产品/渠道要求时，E2E 只在最终真实候选形成后运行；选择禁用时只在 `release/` manifest 和最终回复记录 `Not run` 与剩余风险。
- 每次 GUI 发布还必须独立解析当次性能选择。所有正式候选都先经过 `$desktop-prepare-release`：它在关闭链前复用当前请求的明确选择或询问一次，并把结果封存进 closing commit 的 `candidateSelections`；`$desktop-build-tauri-release` 只读消费该记录，缺失时失败关闭，不得从对话补写、兜底询问或静默沿用上次发布或 `milestone_e2e`。
- 明确发布请求本身授权流程复核并提交、推送范围明确的活动 feature 叶子，以原子操作把登记链严格快进到动态默认 `main`/`master`，切回本地默认分支并精确清理状态登记的本地/远端 feature refs，然后直接构建，无需再次询问是否提交、是否执行该受限分支操作或是否构建；普通构建不自动提交、关闭链路或修改默认分支，tag、上传和真实渠道发布仍需各自授权。
- GUI 性能与 E2E 选择相互独立。性能选择为 `enabled` 或产品/渠道要求时执行完整门禁；为 `disabled` 且无硬要求时允许以 `performanceStatus: Not run` 继续，但必须保留原因和剩余风险。已启用后只有安全修复尝试仍不达标时，才询问用户是否以可见 waiver 继续。
- 构建请求、执行和结果，以及候选 E2E、完整验收、`pending` → `accepted` 和就绪复核，都不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan、Verification 或其他 tracked 项目记忆；这些候选事实只进入忽略的 `release/` 原子集合、manifest 声明的相邻证据和最终回复，本地开发试包只进入最终回复。真实渠道发布成功后，才从已发布的默认分支 closing commit 开始后续受管 feature 生命周期，追加 Verification/发布/Product Status 记录并 finalize 版本周期；独立回顾性人工复核或长期审计也必须使用自己的受管 feature 生命周期，且不得反向批准活动候选。
- 普通缺陷修复、纯重构等维护类型本身不创建 Product Spec、ADR、Status、Changelog 或 Verification；用户明确要求、跨会话交接、安全、发布和长期决定等独立事件仍按各自门禁记录。

## 执行优先级

1. 安全、批准产品范围和分发渠道硬要求。
2. 当前请求中用户明确给出的约束；发布候选构建请求中的 E2E 选择和 GUI 发布性能选择属于本级。
3. 本文件持久策略；`milestone_e2e` 只提供建议默认值。
4. Agent 根据接口、真实产物和批准场景作出的适用性判断。
5. 发布候选构建请求尚未明确 E2E 时，在测试或编译前询问一次；GUI 发布尚未明确性能选择时，由 `$desktop-prepare-release` 在关闭链前询问一次并封存，且不跨发布复用；其他事项仍无法可靠判断时再询问用户。

执行原则可概括为：能力偏好先复用；本地开发试包不消费 E2E/性能选择；发布候选 E2E 每次都必须有当前选择；GUI 性能与 macOS 签名选择由发布准备逐次解析并封存，构建只读消费。

## 不受影响的能力

- 本文件不关闭 `.agents/skills/` 中的项目 Skills，也不关闭 Codex 基础工具或安全规则。
- 用户明确要求并行且 Worktree/Subagent 已启用时，仍必须满足独立 Git 根、干净已提交基线、文件所有权、`codex/` 分支、辅助程序 `guard`、前台状态和同步等待规则；活动受管 feature 链中的产品写入例外固定使用单 Agent/单写入 Task，helper 必须在创建 sibling 单元前失败关闭。
- 除 `$desktop-test-gui-initialization-e2e` 的一次性 debug/no-bundle 门禁外，冒烟/E2E 不得在产品定义、计划、日常开发、单元测试、编译、签名、打包、制品收集或发布元数据命令中运行；启用的发布 E2E 只在最终真实候选形成后执行。
