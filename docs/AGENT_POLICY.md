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
- `parallel_worktree_subagents`：`enabled` 只表示用户明确要求并行时允许使用 Worktree + 写入型 Subagent；`disabled` 使用单 Agent 当前工作树。持久启用本身不能触发并行步骤；启用时仍须给每个写入单元分配不重叠的文件所有权，并把创建出的 Worktree 和分支登记到当前 Git 生命周期。
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

“不是持久偏好”不等于依赖对话内存：`$desktop-prepare-release` 必须把当次审查结果、GUI 性能选择和适用的 macOS 签名选择/来源写入当前发布的 `.harness/release-context.json`，使同一发布中断重试可复用；该文件必须随发布源码提交，且不得成为下一次发布的默认值。候选构建在清理、测试前和写 manifest 前只读验证并消费这份上下文，只另外解析当前候选的 E2E 选择。

## 开发分支与主分支发布生命周期

本节约束完成初始化的终端下游。初始化仍可只在本地默认主分支建立中性基线；创建开发分支不依赖远端。只有用户明确说“推送”或“发布”时才解析远端：优先使用 `origin`，没有 `origin` 时只接受唯一远端，其他情况由用户明确远端名。流程不得替用户创建远端、填写地址或处理凭据。

- 新功能、独立 Bug 修复或其他用户可感知开发在首次写入前自动调用 `$desktop-manage-git-lifecycle start`，创建并切换到 `feature-{ascii-kebab-summary}-{YYYYMMDD}`。日期取 `Asia/Shanghai` 自然日；名称碰撞时由 helper 追加稳定递增后缀。当前分支已登记为同一工作时幂等复用；诊断、同范围实现、相关测试和返工不重复建分支。
- 生命周期状态只写入 Git common dir 下的 `agent-first-harness/git-lifecycle.json`，精确登记本发布周期由 helper 创建或显式接管的开发分支、Task/单元分支及 Worktree。所有写操作由同一 common-dir 短时互斥串行化，避免并行 Task 相互覆盖登记。状态不进入提交，不保存远端冻结 OID，也不把分支排列成链。未登记资源永远不进入自动清理范围。
- 用户明确说“推送”时调用 `publish`：先在各登记分支形成范围明确的提交，再逐个使用普通 `git merge --no-edit` 合并到动态默认主分支，切换到该主分支，推送主分支并复读远端。合并冲突保持 Git 的普通可恢复状态并停止；成功后保留本周期登记的开发分支和 Worktree，不创建 tag，也不清理资源。
- 用户明确说“发布”时，`$desktop-prepare-release` 先形成并提交 `.harness/release-context.json`，再调用 `release --version <version>`。`release` 先执行与 `publish` 相同的合并、切换主分支、推送和远端复读；随后在当前主分支 HEAD 创建轻量 tag `v{version}-{YYYYMMDD}`，日期取 `Asia/Shanghai` 自然日，推送 tag 并复读其远端目标。已存在同名 tag 且本地、远端都指向当前 HEAD 时视为幂等成功；任何同名不同提交、tag 推送失败或远端复读不一致都停止，且不得开始任何删除。
- 只有主分支推送和 tag 推送均已确认成功，才按状态逐项删除本周期登记资源，固定顺序为：先删除登记 Worktree，再删除对应远端分支，最后删除对应本地分支。每个删除结果立即写回 common-dir 状态，允许中断后只继续未完成项；不得强制删除 dirty Worktree，不得删除当前默认主分支、未登记分支或未登记 Worktree，也不得按名称前缀或通配符扫描扩大范围。全部登记项完成后清空本周期状态，并保持当前分支为已推送且带 tag 的默认主分支。
- 这里没有分支保护、活动叶子、单写入者、严格线性历史、fast-forward-only、lease、atomic push、审查后路径白名单或其他分支门禁；允许普通 merge commit。工作树未提交、合并冲突、缺少实际推送所需的远端、tag 冲突和删除目标不属于登记所有权仍按真实操作失败处理，这些是数据安全与可恢复性检查，不得扩展成分支策略。
- 流程没有发布中转分支，也不包含任何旧中转分支的识别、迁移、兼容或清理逻辑。发布后的 tag 是源码版本锚点；上传制品、签名、渠道发布和版本周期最终化仍只在各自明确授权和真实成功条件下执行。

## 左侧 Task、项目绑定与独立 Worktree

本节只约束用户能从侧栏独立进入的 user-owned Task/thread。plan、Todo、brief、report、review、Subagent、agent thread 和内部单元 Worktree 都是当前 Task 的内部结构，不是新的左侧 Task，也不得通过 `create_thread` 伪装成左侧 Task；这项身份分层不豁免内部 Subagent/agent thread 遵守统一会话标题格式。`parallel_worktree_subagents` 只控制单个左侧 Task 内部的并行能力。

一个左侧 Task 固定对应一个明确且可独立验收的结果、一个保存的 Codex 项目、Git 项目中的一个不与其他 Task 共用的 Codex 管理 Worktree、一个由统一生命周期 helper 创建并登记的 `feature-*` 分支和一组可审查提交。诊断、实现、证明该结果所需的测试或 review，以及修复这些检查发现的同范围缺陷，仍属于同一结果；不得只因生命周期阶段变化自动拆 Task。只有用户明确要求创建新的左侧 Task，或用户已经明确把当前 Task 定义为多 Task 协调器并指定独立结果时，才调用 `create_thread`。普通单结果请求不先创建所谓 Task0，当前 Task 可以直接实施。

### 创建状态机

1. **RESOLVED**：调用 `list_projects`，按规范化完整路径精确选中保存项目并记录其真实 `projectId`、项目类型和 `isGitRepository`；同名标签、当前 cwd 或仓库名称都不能替代路径核对。调用 `create_thread` 时必须使用 `target.type = project` 和该 `projectId`。Git 项目使用 `environment.type = worktree`；非 Git 项目使用 `environment.type = local`。项目工作不得使用 `projectless`、临时目录、Task0 cwd、默认兜底项目或其他项目。
2. **DISPATCHED**：对一个结果只调用一次 `create_thread`。左侧 Task 必须在派发前记录不可变 Task key、分配稳定正整数序号，并显式传入 `title="{序号}|{Task简述}|已分配 |{功能摘要}"`；序号不得使用调用后才返回的 `threadId` 或 `clientThreadId`。返回 `threadId` 表示已得到可管理的 Ready Task；只返回 `clientThreadId` 表示创建请求已接受但仍为 `SETUP_PENDING`，不是失败，也不是可传给 `read_thread`、`wait_threads` 或其他要求 `threadId` 的标识。此时立即报告 queued Task 并返回对应的 created-thread UI 引用；不得假设存在 `clientThreadId → threadId` 桥、无限轮询、重复创建、把 pending 改称 Ready，或在当前 Task/后台目录代替新 Task 偷跑。
3. **RECONCILED**：已经取得真实 `threadId` 时立即用 `list_threads` 对账；只有 `clientThreadId` 时，则仅在用户随后明确要求检查先前 queued Task 后对账。以真实 id 和精确 `projectId` 为主键；标题使用工具返回的规范化标题原文，不因应用正常化措辞而误判。目标 Task 可能已经推进进度，因此只核对三个稳定字段与合法进度字段，不要求仍为 `已分配`。唯一候选尚未出现时保持 `SETUP_PENDING` 并结束本次检查；候选不唯一时报告 ambiguous；只有工具明确返回失败才记为 `SETUP_FAILED`。任何 pending/ambiguous 状态都禁止“再创建一个碰碰运气”。
4. **BOUND**：进入 Ready Task 后、首次写入前再次确认线程 `projectId` 精确匹配。Worktree 的物理路径通常位于保存项目目录之外，不能用字符串祖先关系判断归属；必须分别解析保存项目根与 Task Git 顶层的规范化 `git rev-parse --path-format=absolute --git-common-dir`，要求相同，并要求保存项目的 `git worktree list --porcelain` 已登记该 Task 顶层。非 Git Local Task 才要求 cwd 等于保存项目完整路径。`projectId` 为空/错误、Git common dir 不同、Worktree 未登记或起始提交不符时保持零写入并报告绑定错误；现有 Task 不能被仓库规则静默改挂到另一项目。

### 命名、基线与分支

- Git Worktree 与非 Git Local 左侧 Task 都遵守统一进度标题。调用 `create_thread` 时必须显式传入 `title="{序号}|{Task简述}|已分配 |{功能摘要}"`；目标 Task 取得执行权后按本文件的真实阶段只更新第三字段，三个稳定字段不得改变。不得把调用后才返回的 `threadId`/`clientThreadId` 写进序号或标题。创建后以真实 id 和 `projectId` 对账，并使用 `list_threads` 返回的规范化标题原文展示，不靠标题承担身份判断。
- Task 描述记录不可变的 Task key、稳定序号、Task 简述、功能摘要、派发时使用的完整 `已分配` 显示标题、独立的 ASCII `feature-summary`、目标 `projectId`、保存项目完整路径、Git repository identity、起始分支/提交和完成边界。显示标题与 Git 摘要是两个事实；不得把 `{序号}|{Task简述}|{当前进度} |{功能摘要}` 原样当作 Git ref，也不得根据返回 id 重新分配序号。未明确这些事实时不得用猜测值创建。
- 只读或非产品写入 Task 在用户明确指定时按该 branch/ref 创建，否则使用保存项目默认主分支的已提交 HEAD，不硬编码 `main` 或 `master`，也不主动 fetch/pull。会形成产品变更的 Task 在首次写入前调用 `$desktop-manage-git-lifecycle start --summary <feature-summary>`；helper 从当前 HEAD 建立唯一 `feature-*` 分支，并在当前路径是非主 Worktree 时同时把分支和 Worktree 精确登记到本发布周期。并行 Task 只要求写入所有权不重叠，不因分支历史形态、活动叶子或单写入者规则拒绝。基线必须已有提交；除非用户明确要求从 working tree 状态开始，否则不得复制未提交修改。基线不明确、分叉或修改无法安全归属时停止创建。
- Codex 管理 Worktree 默认可能处于 detached HEAD。Ready Task 在首次编辑前以描述中单独记录的 ASCII `feature-summary` 调用生命周期 `start`；helper 直接从 detached HEAD 创建并切换到唯一 `feature-*` 分支，同时登记当前非主 Worktree，无需预先建立其他 Task 分支或重复调用 `track-worktree`。`feature-summary` 只服务安全分支命名，不是显示标题。确认当前 Git 顶层就是该 Task Worktree，且不得让另一个 Task 使用同一 Worktree 或分支。

### 执行、提交与边界

- Task 只在自己的 Worktree 修改文件，不直接编辑 Local 主工作目录，也不进入、清理或复用其他 Task 的 Worktree。保护已有修改，不扩大任务说明中的允许范围。
- 每完成一个能够独立说明结果的逻辑闭环就提交一次。提交信息按 `$desktop-configure-git-commits` 表达已经得到的结果，例如 `feat: implement WeChat accessibility selectors`、`fix: reject stale accessibility identities` 或 `docs: record capability gate evidence`；简单变化可只写主题，非简单变化保留 Why/Changes/Impact/Test，未运行测试明确写 `Not run` 原因。不得把构建缓存、`target/`、`node_modules/`、`dist/`、`__pycache__/` 或其他忽略生成物加入提交。
- `feature-*` 和 `codex/unit-*` 是当前发布周期的临时实施分支。Task 不自行覆盖 `/Applications` 中的最终应用，不删除其他 Worktree，不合并或推送默认主分支，也不执行发布、签名或其他未在任务描述中明确授权的外部副作用；其资源由统一生命周期 helper 登记，待成功发布的 tag 已推送后统一清理。
- 最终交付前必须确认任务要求的测试已经执行、相关权威文档已经同步、全部任务改动已经提交，并且 `git status --porcelain=v1 --untracked-files=all` 为空。适用目标必须编译并验证真实目标行为；任务没有可编译产物或完整候选不在范围内时，必须把该项明确报告为 `Not applicable` 或 `Not run`，不得伪造通过，也不得因此自动扩大为构建/E2E/完整验收。

### 协调方整合与清理

- Task 完成后只报告分支、提交哈希、实际验证、未执行项和剩余风险，不自行合并或推送默认主分支。协调 Task 或用户读取该报告后，只核对任务范围、疑似秘密、任务明确要求的测试、工作树 clean 以及分支/Worktree 的精确登记；用户明确说“推送”或“发布”时，由 `$desktop-manage-git-lifecycle` 以普通 merge 汇总这些登记分支。
- Task Worktree 和临时分支在整合后仍保留于本周期登记清单。只有发布已完成主分支推送，且版本 tag 已创建、推送并复读成功，生命周期 helper 才按 Worktree、远端分支、本地分支的顺序精确清理；Task 本身不得提前删除自己的资源，也不得删除任何其他 Task 的资源。

### 统一 Task 描述模板

以下各节都是必填项。创建者必须把占位句替换为当前任务的真实事实；不适用项保留并明确标为 `Not applicable`，不得删节后让执行边界变得含糊。

```markdown
目标：
完成一个明确、可独立验收的结果。

Task 绑定：

- Task key：填写派发前分配的不可变技术标识；它不进入显示标题，也不得填写返回后的 `threadId` 或 `clientThreadId`。
- 标题序号：填写当前协调批次按派发顺序分配的正整数；同一结果全程不变，不从 Task key、宿主 id、列表顺序或 Git ref 推导。
- 显示标题：填写按 `{序号}|{Task简述}|已分配 |{功能摘要}` 形成并传给 `create_thread.title` 的完整字符串；同时单独记录序号、Task 简述和功能摘要三个稳定字段，供目标 Task 后续只替换第三个进度字段。
- Git feature summary：Git Worktree Task 填写独立的 ASCII kebab-case `feature-summary`，供 `$desktop-manage-git-lifecycle start --summary` 使用；不得复制显示标题，非 Git 时标记 `Not applicable`。
- Codex 项目：填写名称、`projectId` 和保存项目完整路径。
- Git 绑定：填写 repository identity、起始分支和起始提交；非 Git 时标记 `Not applicable`。

工作方式：

- Git 项目使用独立 Codex Worktree，并在首次写入前由生命周期 `start` 创建和登记 `feature-*` 分支；非 Git 项目使用绑定项目的 Local 环境。
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
- 每次 GUI 发布还必须独立解析当次性能选择。所有正式候选都先经过 `$desktop-prepare-release`：它复用当前请求的明确选择或询问一次，并把结果写入 `.harness/release-context.json` 的 `candidateSelections`；`$desktop-build-tauri-release` 只读消费该记录，缺失时失败关闭，不得从对话补写、兜底询问或静默沿用上次发布或 `milestone_e2e`。
- 明确发布请求本身授权流程复核并提交范围明确的开发结果与发布上下文，再调用 `$desktop-manage-git-lifecycle release`：普通合并登记分支，切换并推送动态默认主分支，创建并推送 `v{版本}-{YYYYMMDD}`，复读成功后按登记清单删除 Worktree、远端分支和本地分支，然后直接构建，无需再次询问是否执行这些发布步骤。用户只说“推送”时执行同样的主分支合并、切换和推送，但不创建 tag、不清理；普通构建不自动提交、推送、发布或修改主分支。
- GUI 性能与 E2E 选择相互独立。性能选择为 `enabled` 或产品/渠道要求时执行完整门禁；为 `disabled` 且无硬要求时允许以 `performanceStatus: Not run` 继续，但必须保留原因和剩余风险。已启用后只有安全修复尝试仍不达标时，才询问用户是否以可见 waiver 继续。
- 构建请求、执行和结果，以及候选 E2E、完整验收、`pending` → `accepted` 和就绪复核，都不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan、Verification 或其他 tracked 项目记忆；这些候选事实只进入忽略的 `release/` 原子集合、manifest 声明的相邻证据和最终回复，本地开发试包只进入最终回复。真实渠道发布成功后，才从已发布且带版本 tag 的默认主分支开始下一次开发生命周期，追加 Verification/发布/Product Status 记录并 finalize 版本周期；独立回顾性人工复核或长期审计不得反向批准活动候选。
- 普通缺陷修复、纯重构等维护类型本身不创建 Product Spec、ADR、Status、Changelog 或 Verification；用户明确要求、跨会话交接、安全、发布和长期决定等独立事件仍按各自门禁记录。

## 执行优先级

1. 安全、批准产品范围和分发渠道硬要求。
2. 当前请求中用户明确给出的约束；发布候选构建请求中的 E2E 选择和 GUI 发布性能选择属于本级。
3. 本文件持久策略；`milestone_e2e` 只提供建议默认值。
4. Agent 根据接口、真实产物和批准场景作出的适用性判断。
5. 发布候选构建请求尚未明确 E2E 时，在测试或编译前询问一次；GUI 发布尚未明确性能选择时，由 `$desktop-prepare-release` 在发布上下文形成前询问一次并封存，且不跨发布复用；其他事项仍无法可靠判断时再询问用户。

执行原则可概括为：能力偏好先复用；本地开发试包不消费 E2E/性能选择；发布候选 E2E 每次都必须有当前选择；GUI 性能与 macOS 签名选择由发布准备逐次解析并封存，构建只读消费。

## 不受影响的能力

- 本文件不关闭 `.agents/skills/` 中的项目 Skills，也不关闭 Codex 基础工具或安全规则。
- 用户明确要求并行且 Worktree/Subagent 已启用时，仍必须满足独立 Git 根、干净已提交基线、文件所有权、`codex/` 分支、辅助程序 `guard`、前台状态和同步等待规则；多个 sibling 单元只需拥有互不重叠的写入范围，并把精确 Worktree/分支登记给 Git 生命周期。不得用活动叶子、单写入者、分支祖先关系或其他历史形态阻断并行。
- 除 `$desktop-test-gui-initialization-e2e` 的一次性 debug/no-bundle 门禁外，冒烟/E2E 不得在产品定义、计划、日常开发、单元测试、编译、签名、打包、制品收集或发布元数据命令中运行；启用的发布 E2E 只在最终真实候选形成后执行。
