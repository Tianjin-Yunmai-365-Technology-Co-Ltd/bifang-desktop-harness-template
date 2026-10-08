---
schema_version: 4
confirmed_by: pending
confirmed_at: pending
decision_mode: reuse_then_infer_then_ask
superpowers: disabled
user_owned_tasks: disabled
parallel_worktree_subagents: pending
acceptance_smoke: pending
e2e_hint: pending
post_release_action: pending
---

# Agent 运行策略

本文件是下游项目 Agent 能力、用户可见 Task 自动拆分、候选冒烟偏好、构建 E2E 建议默认值和发布后动作的唯一持久事实来源。Harness 源允许尚待下游确认的字段使用 `pending`，但 `user_owned_tasks` 固定默认 `disabled`；完成初始化的下游五项能力选择只能是 `enabled` 或 `disabled`，`post_release_action` 必须是两项之一，且 `confirmed_by`、`confirmed_at` 必须记录真实确认来源和日期。Git 发布固定在本地默认主分支与 tag 完成；完成初始化的下游随后按已确认的发布后动作执行并复核。Harness 源的 `pending` 是待复制模板字段，不阻断 Harness 自身的 Git 发布。

GUI框架是根Cargo metadata的独立 `gui-framework` 事实，不增加本文件frontmatter策略字段或九字段profile。`tauri` 为默认且兼容既有GUI缺失值，`gpui` 分派 `$desktop-add-gpui-adapter`。下文Tauri插件、四项固定基线、前端、Tauri初始化E2E与GUI本地打包条件只适用于Tauri；GPUI使用Rust构建与Computer Use初始化检查，六项原生能力首版明确 `unavailable` 并保持 `disabled`。GPUI 本地候选由独立 `$desktop-build-gpui-release` 负责，原生 macOS/Windows 目标可确认 `local_package`；仅 Linux 且无 CLI 时仍须明确选 `push_release_branch`。两种 GUI 都要求 Node.js/pnpm 工程工具，GPUI 的项目根脚本用于验证、发布和原生打包。通用策略选择、零写入确认、独立仓库、版本和发布事实边界保持一致。

## 字段语义

- `superpowers`：`enabled` 允许按任务触发名称以 `superpowers:` 开头的 Skills；`disabled` 禁止后续规划、实现、验证和发布调用或遵循这些 Skills。
- `user_owned_tasks`：控制是否由 Agent 自动把新结果拆到 Codex 左侧菜单中用户可独立进入的 user-owned Task/thread。`disabled` 是默认值：不得自动创建或按阶段拆 Task，但用户明确要求创建时仍可执行；`enabled` 表示用户已经长期授权按本文件的结果边界自动创建，不得再次要求用户提醒。它不控制当前 Task 内部的 plan、Subagent 或单元 Worktree，也不替代 `parallel_worktree_subagents`。
- `parallel_worktree_subagents`：`enabled` 只表示用户明确要求并行时允许使用 Worktree + 写入型 Subagent；`disabled` 使用单 Agent 当前工作树。持久启用本身不能触发并行步骤；启用时仍须给每个写入单元分配不重叠的文件所有权，并把创建出的 Worktree 和分支登记到当前 Git 生命周期。
- `acceptance_smoke`：只在完整真实候选验收中，允许 Agent 对候选执行适用的冒烟测试。
- `e2e_hint`：仅作为每次显式发布候选构建询问 E2E 时展示的建议默认值；无论是 `enabled` 还是 `disabled`，都不能替代当前候选的明确选择，也不授权凭据、支付、生产数据、发布或不可逆副作用。
- `post_release_action`：`local_package` 表示 Git 发布后进入现有适用的本地打包流程；`push_release_branch` 表示把已发布的同一提交放到本地小写 `release` 分支，非强制推送远端默认主分支、同名 release 分支与发布 tag。初始化表单必须给出两项并以 `local_package` 为建议默认值；仅所选接口含 CLI，或含 GUI 且目标平台含 macOS/Windows 时，该默认项才可确认。纯 TUI/MCP 或仅 Linux GUI 须明确选择 `push_release_branch`，不得暗中应用不可执行的默认项。用户须明确选择或确认可执行的默认值。选择在未来发布中持续生效，可用 `$desktop-switch-post-release-action` 更改。
- `decision_mode: reuse_then_infer_then_ask`：复用能力偏好；对 E2E 则先读取建议默认值，再复用当前候选构建请求中已经明确的选择，否则在构建前询问一次。发布后动作直接读取 `post_release_action`，缺失、非法或 `pending` 都阻断后续流程完成。

`enabled` 表示“允许且适用时执行”，`disabled` 表示默认不启用可选能力。`user_owned_tasks: enabled` 是自动建 Task 的明确长期授权；`post_release_action` 是用户对未来 Git 发布后所选动作的长期授权，不授权配置远端、凭据、签名、渠道分发或绕过候选构建的当次 E2E 选择。安全、产品和渠道硬要求优先于项目偏好，不能用 `disabled` 绕过必需门禁；当前候选构建的 E2E 明确选择优先于 `e2e_hint` 建议值。需要远端源码或远程构建的渠道必须先走 `push_release_branch` 并复核远端 `release` 分支与 tag；该要求不改变 Git 发布完成条件。

除非用户明确说“当前 Task 内部步骤、plan 或 Subagent”，本文的 Task 一律指 Codex 左侧菜单中用户可独立进入的 user-owned Task/thread。plan、Todo、Subagent、agent thread、Worktree、brief、report、review、checkpoint 和内部单元都不是新的左侧 Task；不得用这些内部结构冒充 `create_thread` 创建的用户可见 Task。

用户可见 Task 的标题唯一使用 `{Task编号} | {当前进度} | {单一结果}`。`Task编号` 固定为 `Task ` 加无前导零的正十进制序号，例如 `Task 8 | 运行中 | 左侧 Task 默认关闭并支持开关`；两个 ASCII `|` 两侧各恰好一个 ASCII 空格。`单一结果` 必须非空、单行、首尾无空白且不含 `|`，开始后不得改变；`当前进度` 只取 `已分配`、`运行中`、`检查中`、`已完成`。调用后返回的 `threadId`/`clientThreadId`、Subagent 技术 `task_name` 和 Git ref 只用于真实身份或技术绑定，不得生成 Task 编号或反填标题。

同一 `hostId` 与精确 `projectId` 的用户可见 Task 共享递增序列。新结果先调用 `list_threads(limit=50)` 合并当前与 pinned Task，再沿同宿主 `list_archived_threads` 的 `nextCursor` 读完归档页；只接受 `kind=codex`、宿主/项目精确匹配且满足当前三字段标题的记录作为序号证据，然后分配最大有效序号加 1。空历史才从 1 开始，缺号不回填，同项目批量创建连续预留；不识别任何历史标题格式，不为已废弃的旧标题保留兼容或序号连续性。隐藏 Subagent、`projectId=null`、其他项目/宿主/kind 和不合规标题都不占用项目序列。宿主或历史无法可靠枚举时不得猜测 `1`，而是保留同一结果已有编号或在创建前阻断。

进度标题贯穿用户可见 Task。`create_thread` 使用 `Task {序号} | 已分配 | {单一结果}`；目标 Task 取得执行权后进入 `运行中`，真实进入本次必要测试、review 或 checkpoint 时进入 `检查中`，同范围返工时回到 `运行中`，完成全部结果、必需检查及要求的提交/推送/远端复读后才进入终态 `已完成`。每次真实转换至多尝试一次 `set_thread_title` 并省略 `threadId`，再用真实 `threadId` 调用 `list_threads` 有界复读。创建后首次核对中的标题不符是零写入阻断；后续进度更新失败只需如实报告，不创建替代 Task、不无限重试，也不推翻已经完成的工作。内部 Subagent 不使用本标题合同、不占用 Task 序号，内部单元 Worktree 本身没有左侧 Task 标题。

含 GUI 的一次性初始化 E2E 是脚手架完成门禁，不属于 `e2e_hint`。初始化器读取固定顺序的九项 GUI profile；同时始终验证不询问、不进入 profile 的 system-locale/updater/window-state 三项 Rust-only 固定基线与 dialog 固定 WebView 基线。dialog 必须证明固定 Rust/前端依赖、唯一有序注册、主窗口精确 `dialog:default` 和零额外文件系统授权。按 profile 分派的 system-tray/system-notifications/autostart/single-instance/deep-link/global-shortcut 六个独立 Skills 必须分别证明启用完整或禁用无残留，`deep_link = enabled` 必须同时有 `single_instance = enabled`；关于页、赞助页和侧栏仍按实际选择验证。单实例执行双启动，托盘执行可见托盘与关闭隐藏/恢复/退出，通知、自启与深链接宿主事件只在对应字段启用时执行；中性全局快捷键 contract 验证零默认注册与 owned 清理，只有 contract 明确提供安全可观察绑定时才触发实际 chord 并恢复原配置。macOS 需安装包注册才能证明的深链接场景在 debug no-bundle 阶段标为 `Not verified`。托盘禁用时必须实测关闭最后窗口退出。宿主无法判定/观察适用场景，或无法恢复自启、快捷键、窗口状态等被测宿主状态时，初始化必须阻断，不能用持久偏好跳过。

updater 插件基线不需要策略字段；每次发布候选构建从产品事实解析的 `updaterEnabled` 只控制是否生成和验签 updater archive/`.sig`，不控制是否安装插件。

`$desktop-prepare-release` 把本次版本、日期、默认主分支、预期 tag、源码身份和审查结果写入 `.harness/release-context.json`，与双语更新日志一同提交。未来偏好保存在本文件；下游 Git 发布开始时将当次 `postReleaseAction` 冻结在 Git common-dir 生命周期记录的 pending/last release 中，不写入 tracked 发布上下文。重试与恢复只消费该次冻结值，后续切换不改旧发布；签名和候选 E2E 仍按本次构建解析。终端下游的候选构建复核已发布的本地主分支与 tag；远程候选另复核远端 `release` 分支与 tag，这些候选选择只进入候选证据，不反写已发布源码。

## 开发分支与主分支发布生命周期

本节约束 Harness 源和完成初始化的终端下游。终端下游初始化仍可只在本地默认主分支建立中性基线；创建开发分支和 Git 发布均不依赖远端。用户明确要求发布时先执行本地 Git 流程：整理并提交本次源码，普通合并登记分支到本地默认主分支，创建并复读指向最终 HEAD 的版本 tag；这一步即完成 Git 发布。完成初始化的下游在开始该次 Git 发布前冻结已确认的 `post_release_action`，随后必须执行该次冻结的后续路径并检测其真实结果；路径未通过时保留已完成的 Git 发布事实，但不得宣称整个发布后流程完成。Harness 源可保留 `pending`，其 Git 发布后源码归档或推送仍由用户当次明确决定。流程不得替用户创建远端、填写地址或处理凭据。

- 新功能、独立 Bug 修复或其他用户可感知开发在首次写入前自动调用 `$desktop-manage-git-lifecycle start`，创建并切换到 `feature-{ascii-kebab-summary}-{YYYYMMDD}`。日期取 `Asia/Shanghai` 自然日；名称碰撞时由 helper 追加稳定递增后缀。当前分支已登记为同一工作时幂等复用；诊断、同范围实现、相关测试和返工不重复建分支。
- 生命周期状态只写入 Git common dir 下的 `agent-first-harness/git-lifecycle.json`，精确登记由 helper 创建或明确接管的开发分支、Worktree、待完成的 Git 发布、最近成功发布及独立推送进度。`release` 在任何 merge/tag 副作用前原子记录上下文摘要、tag、日期与版本；最终 HEAD 冻结后只沿用同一 HEAD 幂等重试。旧状态若含正在进行的双模式发布或推送，不能静默改写为新语义。所有写操作由同一 common-dir 短时互斥串行化；状态不进入源码提交，未登记资源不得被删除。
- `post_release_action: push_release_branch` 时，独立的 `push-release` 只接受最近发布记录中冻结的最终 HEAD 与 tag；每次调用先解析具名远端 advertised 默认主分支，缺失、无 symbolic HEAD 时零 push 失败；先创建或安全快进本地小写 `release` 分支到该 HEAD，再将远端默认主分支、`release` 分支和 tag 非强制推向一个已配置远端并逐项复读，远端默认主分支也必须同步到同一已发布 HEAD。只有一个已配置远端时可直接使用；多个远端须在本次动作前明确选定一个，缺少远端或必要凭据时保持后续流程未完成。Harness 源不冻结下游动作，只有用户当次要求推送且已发布提交的时间版本、`Version.md` 与活动实例化入口核对通过，才允许使用同一 `push-release`。已有的普通 `publish` 只处理发布前明确要求的主分支推送，不得冒充发布后推送或移动已发布 tag。
- 发布前 `publish` 的多远端推送不是原子操作：后续目标失败时如实报告已确认范围、失败目标及未尝试目标；重试沿用 `pendingPublish` 中冻结的 HEAD、目标顺序与进度，不重新 fetch、merge 或计算新 HEAD。发布后 `push-release` 每次只处理一个目标，同一已发布 HEAD/tag 可幂等重试；它没有多目标 journal，推送失败也不撤销已完成的本地 Git 发布。
- 用户明确说“发布”时，`$desktop-prepare-release` 先把源码/治理变化及已触发 Changelog 提交并锁定 `sourceHead`；只有当前 HEAD 仍等于该值时，才把且只把 `release-notes.json` 与 `.harness/release-context.json` 放进同一个发布元数据提交。tracked 上下文冻结版本、日期、默认主分支、预期 tag 与审查结论；`release` 必须传 `--release-context-sha256 <sha256>`。从关联 Task Worktree 发起时，helper 先核对该 Worktree 的上下文 blob 与工作字节，再路由到主 Worktree；合并前后均核对最终 HEAD 中的同一路径 blob。调用 `release --project-root . --version <version> --date YYYYMMDD --release-context-sha256 <sha256>` 只普通合并登记分支、切换本地默认主分支、创建并复读本地轻量 tag；同名 tag 指向固定 HEAD 时幂等复用，指向其他提交时停止。`sourceHead` 是元数据提交前的审查来源，最终 `sourceCommit` 是主分支/tag 指向的合并结果。
- 默认主分支与本地 tag 精确指向同一最终 HEAD 并复读成功，就是 Git 发布的结束条件。`release` 不在 tag 后执行推送、打包或资源删除。`local_package` 后续路径只调用现有适用打包 Skill 并复核其实际制品及证据；`push_release_branch` 后续路径要求本地 `release` 分支以及远端默认主分支、`release` 分支和 tag 都精确指向该 HEAD，复读通过才结束。已登记的临时分支和 Worktree 保留为可核查资源，后续清理只在用户独立要求且身份精确复核后执行。
- 这里没有分支保护、活动叶子、分支级单写入者、严格线性历史、fast-forward-only、lease、atomic push、审查后路径白名单或其他分支门禁；允许普通 merge commit。用户可见 Task 的“同一项目同时只允许一个写入型 active Task”是创建调度门禁，不是分支历史策略。工作树未提交、合并冲突和 tag 冲突按真实操作失败处理；未配置远端不阻断 Git 发布。这些是数据安全与可恢复性检查，不得扩展成分支策略。
- 小写 `release` 仅是 `push_release_branch` 后续路径的源码分支，不参与 Git 发布完成判定；不得创建或使用旧的大写 `Release` 分支。发布后的 tag 是源码版本锚点；候选验收、签名、上传与渠道分发仍由各自请求及硬要求决定。下游受跟踪版本状态的周期复位在下一次开发分支上复核已完成的主分支/tag 后执行，避免 tag 后写脏主分支。

## 用户可见 Task 开关、粒度与创建门禁

`user_owned_tasks: disabled` 是默认状态：普通请求直接在当前 Task 完成，Agent 不因结果或生命周期边界自动调用 `create_thread`。用户仍可明确要求创建左侧 Task；该次明确要求只授权对应结果，不自动永久开启本字段。`enabled` 是长期授权：当新结果超出当前 Task 的固定边界时，Agent 必须先结束或暂停当前 Task，再自动创建新的左侧 user-owned Task，不重复询问。用户明确说“不要创建新 Task”或“作为当前 Task 内部步骤”时，本次请求优先于长期开关。

一个用户可见 Task 只对应一个明确、可验收的结果、一个固定完成边界和一个独立工作区。标题、目标、实施范围、禁止范围和完成条件开始后固定。判断是否需要新 Task 只看结果是否变化，不看工作量；交付物类型变化、生命周期阶段变化、增加安装/发布/上传/远端/系统修改等外部副作用、触碰原 Task 禁止范围或验收责任变化，都属于新结果。设计到实现、诊断到修复、迁移到打包安装、实现到发布上传、构建通过到真实安装及人工测试交付是典型边界。用于证明当前结果的测试、review、checkpoint 和必要同范围缺陷修复仍留在当前 Task。

每个项目同一时间只允许一个写入型 active 用户可见 Task；Task0 可以协调和派发，但不得代替实施 Task 写入。`parallel_worktree_subagents` 只控制当前 Task 内部按用户明确要求创建的 Subagent Worktree，既不创建用户可见 Task，也不改变本节开关或粒度。

### 创建状态机

1. **RESOLVED**：依次调用 `list_projects` 和 `list_threads`。按规范化完整路径精确锁定项目名称、`projectId`、Git 状态与保存路径，确认本项目没有另一个写入型 active Task，并清点当前与归档标题分配序号。Git 项目固定选择 `target.type = project`、精确 `projectId` 和 `environment.type = worktree`；非 Git 项目固定使用同一 project target 与 `environment.type = local`。不得使用 projectless、其他项目或普通 Worktree 代替 user-owned Task。
2. **DISPATCHED**：对一个结果只调用一次 user-owned `create_thread`，显式传入 `title="Task {序号} | 已分配 | {单一结果}"`。返回真实 `threadId` 才能继续；只返回 `clientThreadId` 表示仍在 setup，必须报告 queued 并保持零实现，不得声称 Ready、把它传给要求 `threadId` 的工具、重复创建或在当前 Task/plan/Subagent 中代做。
3. **VERIFIED**：取得真实 `threadId` 后立即用 `list_threads` 精确核对该 id 的标题、`projectId`、cwd 和状态。目标 Task 可以已经合法进入 `运行中`，但 Task 编号与单一结果必须保持不变。左侧不可见、字段为空/错误、标题不合规或候选有歧义都立即阻断，禁止创建重复 Task 碰运气。
4. **BOUND**：首次写入前核对工作区干净及起始提交正确。Git Task 分别在保存项目和 Task Worktree 执行 `git rev-parse --path-format=absolute --git-common-dir`，确认两者 Git common dir 相同，并用 `git worktree list --porcelain` 确认当前顶层已登记；非 Git Task 的 cwd 必须等于保存项目完整路径。任一绑定、工作区或基线不符时保持零实现，不退化为 plan、Subagent、Local Git checkout 或普通 Worktree，也不要求用户重新解释规则。

### 命名、基线与分支

- 用户可见 Task 遵守 `Task {序号} | {当前进度} | {单一结果}`。创建后以真实 id、标题和 `projectId` 对账，标题不承担身份判断；`threadId`/`clientThreadId` 不生成序号。
- Task 描述记录稳定 Task 编号、单一结果、实施范围、禁止范围、完成条件、独立 ASCII `feature-summary`、目标 `projectId`、保存项目完整路径、Git repository identity 和起始分支/提交。显示标题与 Git 摘要互不推导。
- 只读或非产品写入 Task 在用户明确指定时按该 branch/ref 创建，否则使用保存项目默认主分支的已提交 HEAD，不硬编码 `main` 或 `master`，也不主动 fetch/pull。会形成产品变更的 Task 在首次写入前调用 `$desktop-manage-git-lifecycle start --summary <feature-summary>`；helper 从当前 HEAD 建立唯一 `feature-*` 分支，并在当前路径是非主 Worktree 时同时把分支和 Worktree 精确登记到本发布周期。并行 Task 只要求写入所有权不重叠，不因分支历史形态、活动叶子或单写入者规则拒绝。基线必须已有提交；除非用户明确要求从 working tree 状态开始，否则不得复制未提交修改。基线不明确、分叉或修改无法安全归属时停止创建。
- Codex 管理 Worktree 默认可能处于 detached HEAD。Ready Git Task 在首次编辑前以描述中的 ASCII `feature-summary` 调用生命周期 `start`；helper 从当前 HEAD 创建并切换到唯一 `feature-*` 分支，同时登记当前 Worktree。`feature-summary` 只服务安全分支命名，不是显示标题。非 Git Local Task 不执行 Git 分支步骤。

### 执行、提交与边界

- Git Task 只在自己的独立 Worktree 修改文件，不直接编辑 Local 主工作目录，也不进入、清理或复用其他 Task 的 Worktree。非 Git Task 只在绑定的 Local 项目目录修改。两者都保护已有修改且不得扩大固定范围。
- 每完成一个能够独立说明结果的逻辑闭环就提交一次。提交信息按 `$desktop-configure-git-commits` 表达已经得到的结果，例如 `feat: implement WeChat accessibility selectors`、`fix: reject stale accessibility identities` 或 `docs: record capability gate evidence`；简单变化可只写主题，非简单变化保留 Why/Changes/Impact/Test，未运行测试明确写 `Not run` 原因。不得把构建缓存、`target/`、`node_modules/`、`dist/`、`.cache/` 或其他忽略生成物加入提交。
- `feature-*` 和 `codex/unit-*` 是受管实施分支。Task 不自行覆盖最终应用、删除其他 Worktree、合并或推送默认主分支，也不执行未经任务授权的发布、签名或系统副作用。生命周期 helper 精确登记这些资源；Git 发布完成后保留登记清单，后续清理由用户独立要求触发并复核资源身份。
- 最终交付前必须确认任务要求的测试已经执行、相关权威文档已经同步、全部任务改动已经提交，并且 `git status --porcelain=v1 --untracked-files=all` 为空。适用目标必须编译并验证真实目标行为；任务没有可编译产物或完整候选不在范围内时，必须把该项明确报告为 `Not applicable` 或 `Not run`，不得伪造通过，也不得因此自动扩大为构建/E2E/完整验收。

### 协调方整合与清理

- Task 完成后只报告分支、提交哈希、实际验证、未执行项和剩余风险，不自行合并或推送默认主分支。协调 Task 或用户读取该报告后，只核对任务范围、疑似秘密、任务明确要求的测试、工作树 clean 以及分支/Worktree 的精确登记；用户明确说“推送”或“发布”时，由 `$desktop-manage-git-lifecycle` 以普通 merge 汇总这些登记分支。
- Task Worktree 和临时分支在整合后仍保留于生命周期清单。Git 发布仅以本地默认主分支合并和 tag 复读成功为终点，不自动删除 Worktree、本地分支或远端分支。Task 本身不得删除其他 Task 资源；后续清理须由独立请求精确指定。

### 统一 Task 描述模板

以下各节都是必填项。创建者必须把占位句替换为当前任务的真实事实；不适用项保留并明确标为 `Not applicable`，不得删节后让执行边界变得含糊。

```markdown
目标：
完成一个明确、可独立验收的结果。

Task 绑定：

- Task key：填写派发前分配的不可变技术标识；它不进入显示标题，也不得填写返回后的 `threadId` 或 `clientThreadId`。
- Task 编号：填写同一 `hostId`/`projectId` 下当前与归档有效标题最大序号加一所得正整数；同一结果全程不变，缺号不回填。
- 显示标题：填写按 `Task {序号} | 已分配 | {单一结果}` 形成并传给 `create_thread.title` 的完整字符串；后续只替换进度字段。
- Git feature summary：Git Task 填写独立 ASCII kebab-case `feature-summary`，供 `$desktop-manage-git-lifecycle start --summary` 使用；非 Git 时标记 `Not applicable`。
- Codex 项目：填写名称、`projectId` 和保存项目完整路径。
- Git 绑定：填写 repository identity、起始分支和起始提交；非 Git 时标记 `Not applicable`。

工作方式：

- Git 项目使用独立 Codex Worktree，并在首次写入前由生命周期 `start` 创建和登记 `feature-*` 分支；非 Git 项目使用绑定项目的 Local 环境。
- 同一项目不得与另一写入型 active 用户可见 Task 并发。
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

- `$desktop-instantiate-project` 把“推荐预设”或“自定义”、发布后动作与其他固定基础字段放在首轮一次询问；直接调用 `$desktop-initialize-rust-project` 时把策略模式、发布后动作与接口组合放在同一首轮。发布后动作固定提供“本地打包”和“提交远程”两项，建议默认“本地打包”；接口/平台没有现成本地打包 Skill 时标为不可用，用户必须明确选择“提交远程”，不能确认不可执行的默认项。其余情况仍须用户选择或确认。推荐预设必须显式确认一次；选择自定义后，每轮只询问一个尚未明确提供的条件字段，每项至多一次。
- 推荐预设确定性物化五项为 `user_owned_tasks: disabled`、`superpowers: disabled`、`parallel_worktree_subagents: disabled`、`acceptance_smoke: enabled`、`e2e_hint: disabled`。选择自定义时逐项询问五项；`user_owned_tasks` 的推荐/default 值都是 `disabled`。内部并行开关只控制当前 Task 的 `codex/unit-*` Worktree 与写入型 Subagent；用户明确新建的 Git 侧边 Task 仍使用独立 Worktree，`user_owned_tasks: enabled` 时仍可按结果边界自动创建。预设只是输入捷径，不新增持久字段，也不得在用户未确认时静默采用其他值。
- 五项能力值和发布后动作全部解析后才以 `schema_version: 4` 一次原子写入本文件；`confirmed_by` 记录真实确认来源，`confirmed_at` 记录最终收齐日期。由 `$desktop-instantiate-project` 进入 `$desktop-initialize-rust-project` 时只验证并复用，不重复询问。
- `pending` 仅允许存在于 Harness 源和初始化未完成的临时状态。创建下游初始化基线提交前，五项能力选择、发布后动作、`confirmed_by` 和 `confirmed_at` 都必须已解析，任何 `pending` 都阻断完成。
- 初始化首次写入发生在下游 ADR 尚未创建前，不要求预建 ADR。初始化后，用户可明确说“开启左侧 Task”“关闭左侧 Task”“开启自动 Task 拆分”或“关闭自动 Task 拆分”；Agent 更新 `user_owned_tasks`、`confirmed_by`、`confirmed_at`，并在当日 ADR 记录前后值、原因、影响和恢复条件。用户也可以手动完成同样编辑与 ADR。目标值相同时按幂等 no-op 报告，不重写元数据或 ADR。
- 切换 Task 开关只影响之后的结果边界判断，不迁移、中断、删除或改挂当前与既有 Task/Worktree。关闭后仍响应用户的显式建 Task 请求；开启后也只在出现新结果边界时自动创建。完成初始化的下游只接受 `schema_version: 4`。升级前已有合法 `schema_version: 3` 且仅缺 `post_release_action` 的旧策略由 `$desktop-upgrade-harness` 在工程升级后要求用户补选，并由 `$desktop-switch-post-release-action` 保留既有五项能力选择迁移到 v4；不得猜测旧项目选择。旧 Git 生命周期 v3 若有进行中的 `pendingRelease` 或 `pendingPublish`，先按旧流程恢复或人工核对，不自动迁移并把旧发布套用新选择。其他缺失或非法旧字段不能借此迁移，须按原有策略确认流程处理。
- 初始化后的用户可用 `$desktop-switch-post-release-action` 在 `local_package` 与 `push_release_branch` 之间切换；值相同时幂等无写入。切换只决定未来 Git 发布开始时冻结的动作；已开始/完成的发布仍使用其生命周期记录中的冻结值，不改写已完成发布、已生成制品或已推远端 refs。该 Skill 原子更新受保护的动作字段，保留原有能力选择与初始化确认元数据，并在当日 ADR 记录本次用户确认、前后值、原因、影响和恢复条件；升级补选同样遵守此门禁；迁移旧 schema 3 时 `confirmed_by`/`confirmed_at` 保留此前五项能力的原始确认事实，新动作的本次确认来源和日期记录在 ADR。
- 其他初始化后的永久策略变更同样必须由用户确认，并在当日 ADR 记录原因、影响和恢复条件。
- 临时任务约束可以记录在当前工作计划/验证记录中，但不得静默改写本文件。

## 开发与构建

- Tauri GUI 初始化在相关非空单元测试后固定调用 `$desktop-test-gui-initialization-e2e`，解析九项 profile，始终验证 system-locale/updater/window-state 三项 Rust-only 基线与 dialog 固定 WebView 基线，再按选择验证单实例、托盘、系统通知、自启、深链接、全局快捷键、页面和侧栏，拒绝禁用能力残留；它不询问 E2E 选择、不改写本文件，也不产生发布候选或 Verification。
- 日常开发直接实施，只运行本次变更需要的单元/回归测试，并只写被独立事件触发的记录；本文件不得成为自动增加 Work Plan、全仓检查、构建、冒烟、E2E 或验收的理由。
- GPUI 普通本地试包使用 `$desktop-build-gpui-release` 的 `local` 模式，写入忽略的 `target/gpui-packages/`，不消费候选 E2E、不要求发布上下文、不形成发布候选；明确候选请求或 Git 发布后的 `local_package` 使用该 Skill 的 `candidate` 模式，遵守下列通用候选门禁。
- Windows Tauri GUI 的普通“构建/打包/首次安装试包”默认是 `$desktop-build-tauri-local-install` 的本地开发制品，不是发布候选。它不要求 clean HEAD 或 `release-notes.json`，不调用发布准备、不写根 `release/`、不提交、不签名、不安装，也不询问 E2E；只有用户明确说“发布候选”或“准备并构建发布”才进入下列候选门禁。
- 显式发布候选构建必须为当前候选解析一次 E2E 选择。若当前请求已明确 `enabled`/`disabled`，直接复用且不重复询问；否则在任何测试或编译前询问一次，并可把 `e2e_hint` 作为建议默认选项展示。
- E2E 选择只对终端下游发布候选有效，不得静默改写本文件。选择启用或产品/渠道要求时，E2E 只在最终真实候选形成后运行；选择禁用时只在 `release/` manifest 和最终回复记录 `Not run` 与剩余风险。Harness 源发布不形成产品候选，因此本项为 `Not applicable`。
- 明确发布请求授权复核并提交本次范围和发布上下文，在任何生命周期副作用前将 tracked 上下文 SHA-256 传给 `$desktop-manage-git-lifecycle release`。唯一 `release` 路径普通合并登记分支到本地默认主分支，创建并复读 `v{版本}-{YYYYMMDD}`；主分支和 tag 指向同一最终 HEAD 即结束 Git 发布，不推送、打包或清理。完成初始化的下游随后读取该次发布冻结的 `postReleaseAction`：`local_package` 按现有本地打包 Skill 及其当次选择执行并验证真实制品；`push_release_branch` 调用 `push-release --remote <name>` 并复核远端默认主分支、`release` 分支和 tag。未完成选择、目标解析、打包或远端复读时，只报告 Git 发布已完成及后续路径阻断，不把整条后续流程报为完成。Harness 源的源码归档或远端动作仍由当次用户要求决定。发布前用户只说“推送”仍可执行 `publish`，并可在逐一授权后用 `--also-remote` 推向补充远端，但不创建 tag。普通构建不自动提交、推送或修改主分支。
- 构建请求、执行、候选 E2E、完整验收、`pending` → `accepted` 和就绪复核只写忽略的 `release/` 原子证据及最终回复，不自动创建或更新 tracked 项目记忆。Git 发布完成后，下一条开发分支在首个新改动前以精确版本、tag 和 40 位主分支 HEAD 调用 `finalize-release`，再进行新需求优先的版本分类；候选或渠道分发不重复重置版本周期。独立回顾性审计不得反向批准活动候选。
- 普通缺陷修复、纯重构等维护类型本身不创建 Product Spec、ADR、Status、Changelog 或 Verification；用户明确要求、跨会话交接、安全、发布和长期决定等独立事件仍按各自门禁记录。

## 执行优先级

1. 安全、批准产品范围和分发渠道硬要求。
2. 当前请求中用户明确给出的约束；发布候选构建请求中的 E2E 选择属于本级。
3. 本文件持久策略；`e2e_hint` 只提供建议默认值。
4. Agent 根据接口、真实产物和批准场景作出的适用性判断。
5. 发布候选构建请求尚未明确 E2E 时，在测试或编译前询问一次；其他事项仍无法可靠判断时再询问用户。

执行原则可概括为：能力偏好先复用；本地开发试包不消费 E2E 选择；发布候选 E2E 和适用 macOS 签名在每次独立候选构建前解析并封存到候选证据，后续构建和验收只读消费该次选择。

## 不受影响的能力

- 本文件不关闭 `.agents/skills/` 中的项目 Skills，也不关闭 Codex 基础工具或安全规则。
- 用户明确要求并行且 Worktree/Subagent 已启用时，仍必须满足独立 Git 根、干净已提交基线、文件所有权、`codex/` 分支、辅助程序 `guard`、前台状态和同步等待规则；多个 sibling 单元只需拥有互不重叠的写入范围，并把精确 Worktree/分支登记给 Git 生命周期。不得用活动叶子、单写入者、分支祖先关系或其他历史形态阻断并行。
- 除 `$desktop-test-gui-initialization-e2e` 的一次性 debug/no-bundle 门禁外，冒烟/E2E 不得在产品定义、计划、日常开发、单元测试、编译、签名、打包、制品收集或发布元数据命令中运行；启用的发布 E2E 只在最终真实候选形成后执行。
