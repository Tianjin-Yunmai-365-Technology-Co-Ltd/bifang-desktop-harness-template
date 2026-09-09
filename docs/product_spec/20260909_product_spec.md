# Agent-first Harness 模板产品规格

> 记忆日期：2026-09-09
>
> 状态：Approved
>
> 初次批准日期：2026-07-21
>
> 最近范围确认：2026-09-09（自动开发分支、主分支推送、版本 tag 前置与发布周期资源清理见当日 ADR；此前仍有效决定已综合保留）

## 一句话目标

为以 AI Agent 为第一消费者、人类负责方向和关键审批的跨平台收费小工具，提供一个不实现具体业务、可一次性建立并持续维护终端下游项目的 Harness；当前模板源只接受 Harness 自身工程维护与创建下游所需的固定初始化信息，其他需求一律拒绝并要求切换到终端下游后重提；下游新功能和独立 Bug 修复自动建立本地开发分支，用户说“推送”时普通合并并切换主分支推送，说“发布”时在主分支推送后创建并推送版本 tag，再精确清理两次发布间登记的 Worktree 与分支；用户明确创建的左侧 Task 仍绑定保存项目，并用独立临时 Worktree/分支交付一个明确结果。

## 用户、场景与结果

- 核心用户：使用 AI Agent 创建、交付和维护企业收费小工具的项目负责人。
- 主要场景：Agent 直接完成当前批准范围，并只运行本次开发所需的相关单元/回归测试；除必要 ADR、Changelog 等事件触发记录外，不自动增加持久计划、全仓检查、构建、冒烟、E2E、验收或人工复核步骤。
- 失败闭环：开发单元测试失败时在当前授权范围内修复并重跑；发现产品边界、安全、破坏性操作、生产/付费/凭据副作用或发布授权缺失时，只增加解决该风险必需的确认或记录，不把它扩张成通用流程仪式。
- 维护场景：已有下游项目可从明确的新版 Harness 来源安全升级工程治理部分，同时保护业务源码、产品记忆、身份、项目策略、许可证和本地修改。
- Git 场景：新功能和独立 Bug 修复首次写入前自动建立本地 `feature-{ascii-kebab摘要}-{上海日期}`；用户明确“推送”时普通合并本周期登记分支、切换动态默认主分支并推送，明确“发布”时在主分支推送成功后创建并推送 `v{版本}-{YYYYMMDD}`，远端 tag 复读成功后才依次删除登记 Worktree、远端分支和本地分支。流程没有保护分支、严格线性、单写入者或其他分支门禁。
- Session 命名场景：普通当前 Session、Worktree/Local 左侧 Task 与内部 Subagent/agent thread 统一使用 `{序号}|{Task简述}|{当前进度} |{功能摘要}`，其中进度后固定一个 ASCII 空格再接第三个 `|`。序号、Task 简述和功能摘要三个字段在同一结果内稳定，进度只取 `已分配`、`运行中`、`检查中`、`已完成`，每次真实转换至多尝试一次更新；普通/左侧 Task 用 `list_threads`、隐藏 Subagent 用 `read_thread` 按真实 `threadId` 有界复读。返工后再次进入同名阶段属于新的真实转换。工具缺失、失败或未确认不推翻已经完成的任务结果，阻断时保留最后真实阶段且不得虚写完成；内部单元 Worktree 由绑定它的 Subagent 承载标题。
- Task 场景：只有用户明确要求新的左侧 Task 时，创建者才把独立结果绑定到按完整路径选中的保存项目；Git Worktree/Local Task 在派发前记录不可变 Task key、按当前协调批次分配稳定正整数序号，并以 `{序号}|{Task简述}|已分配 |{功能摘要}` 创建，目标 Task 自行推进第三个标题字段。Git Worktree Task 另记录独立 ASCII `feature-summary`，首次写入时由 `$desktop-manage-git-lifecycle start` 从具名或 detached HEAD 直接建立 `feature-*` 分支并自动登记当前非主 Worktree；非 Git Local Task 的 Git 摘要与绑定不适用。`clientThreadId` 表示已接受但仍 queued，创建者报告后返回，不等待不存在的同步晋升接口；允许按明确请求在 Task 内使用 `codex/unit-*` 与写入 Subagent，只要求写入所有权不重叠。Task/单元 Worktree 和分支精确登记到当前发布周期，成功发布 tag 后统一清理。内部 Subagent 的协调方在派发消息中记录统一格式的逻辑 `已分配` 标题，目标 Subagent 取得执行权后立即自行更新为 `运行中`；它仍不是左侧 Task，也不调用 `create_thread`。执行 Task 不直接修改保存项目 checkout 或自行合并、推送主分支。
- 决策场景：创建新下游时先完成写入前初始化表单。Agent 复用用户已明确给出的合法值，在首轮一次列出全部尚未解析的固定基础字段：中文展示名、英文展示名、标识、路径、负责人、平台、接口和策略模式；中英文至少一个由用户直接提供，只提供一种语言时自动翻译另一种并标记来源。基础字段收齐后，才根据自定义策略或 GUI 选择每轮补全一个条件字段。全部字段收齐后展示包含两个名称、各自来源与最终项目根目录的完整汇总并确认。若请求混入产品需求，只解析允许的初始化字段并明确拒绝产品部分，不存储、不推演、不实现。
- 输入：当前 Harness 源只接收 Harness 工程维护信息，或创建终端下游所需的中文项目展示名、英文项目展示名（至少直接提供一个）、ASCII `snake_case` 标识、项目路径、负责人、目标平台、接口组合和持久 Agent 策略；项目路径可以是最终根目录或父目录。选择 GUI 时还包括八项条件能力的启用/禁用与可选的精简/详细侧栏选择，省略侧栏选择表示使用详细模式；`os`（system-locale）、updater、window-state 是不询问的三项 Rust-only 固定基线，dialog 是不询问的固定 WebView 基线。产品目的、业务规则、产品专属 UI/文案/数据、远程地址、凭据、产品构建与发布不是 Harness 源输入，必须在初始化完成并切换到终端下游后重新提出。
- 输出：独立终端项目根、共享核心与所选适配器；GUI 下游另输出包含九项最终配置、三项 Rust-only 固定基线、dialog 固定 WebView 基线、所选生命周期/页面/侧栏且无禁用能力残留的适配器，其中未选择侧栏时 `sidebar_mode = detailed`。完成实现并提供本次必要单元测试证据；显式发布候选构建另输出经过全量单元测试的可追溯候选，并按本次选择决定是否进入 E2E 和非必要语义审查；Windows 本地开发试包只输出未签名非候选安装程序及风险；GUI 发布还按当次选择决定是否采集性能指标，macOS 默认 unsigned 且不探测签名条件，只有已配置、主动要求或渠道硬要求时才签名并公证。

## MVP 包含

### Harness 模板源请求边界

- 变更标识：`HARNESS-FEAT-HARNESS-SOURCE-SCOPE-GATE`；所需 Harness 版本：`202608281139`（当前未发布时间版本，本范围不自动改变 `Version.md`）。
- 同时包含 Harness 专用根 `Version.md` 与活动 `.agents/skills/desktop-instantiate-project/SKILL.md` 的规范根被确定性识别为当前模板源。它只接受 Harness 规则、Skills、中性资产、脚本、验证器、文档、许可证和发布工程等自身维护需求，以及实例化终端下游所需的固定表单与所选初始化路径身份信息。
- 产品目的、用户场景、业务输入输出、业务规则、成功标准、产品专属 UI/文案/数据、远程地址、凭据、产品构建、签名或发布需求均不得在模板源被接收、分析、记录、规划、实现或暂存。Agent 必须保留源仓库并明确拒绝，要求用户先实例化或切换到唯一终端下游根目录后重新提出。
- 混合请求只解析允许的 Harness 初始化字段；超出部分逐项拒绝并延后，不得因为其中含有合法字段而把产品需求写入 Product Spec、ADR、Changelog、代码、资产或临时计划。只读识别和拒绝不创建产品记忆。

### 初始化 Git 引导、开发分支与主分支发布

- 变更标识：`HARNESS-FEAT-INITIALIZATION-GIT-BOOTSTRAP-RELEASE-AUTOCOMMIT`；所需 Harness 版本：`202608281139`（当前未发布时间版本，本范围不自动改变 `Version.md`）。
- 完整表单确认后、首次脚手架写入前，环境门禁检查 Git：最低稳定版为 `2.36.0`，以覆盖Git 生命周期和并行任务使用的 `git worktree list --porcelain -z`；缺失时安装，可证明低于最低下界时按宿主受管路线升级，范围内稳定版原样复用。Git 仅在平台原生受信包管理器明确要求时进入系统级/管理员边界，权限需求必须显式可见且不得静默提权，无既有权限路线则停止。最终独立仓库建立后，已有有效身份保持不变；缺失字段只在该仓库 local 作用域补齐，名称来自设备账户名的英文翻译/转写，邮箱为 `<ascii-device-username>@gmail.com`。完成输出返回版本、安装/升级变化、身份、来源、作用域、仓库根、模板状态和基线提交。
- Git 生命周期变更标识：`HARNESS-CHANGE-SIMPLE-GIT-LIFECYCLE`；所需 Harness 版本：`pending`，等待下一次 Harness 时间版本发布物化。本条取代既有分支链、保护主分支、严格线性、原子 ref 事务和中转分支兼容决定。
- 初始化仍只创建无远端的本地主分支基线。远端由用户或外部系统另行配置，但新功能和独立 Bug 修复的本地开发分支创建不依赖远端。`$desktop-manage-git-lifecycle start` 自动建立并切换 `feature-{ascii-kebab-summary}-{YYYYMMDD}`，日期取 `Asia/Shanghai`，碰撞时追加稳定递增后缀，同一工作幂等复用。
- Git common dir 的 `agent-first-harness/git-lifecycle.json` 精确登记本发布周期由 helper 创建或接管的开发/Task/单元分支与 Worktree，以及主分支、tag 和逐项清理进度；同一 common-dir 的生命周期写入短时互斥，避免并行 Task 后写覆盖先写。状态不进入提交，不保存分支链、父子 OID、冻结远端或活动叶子。并行写入只要求文件所有权不重叠，允许普通 merge commit，没有保护分支、单写入者、线性、fast-forward-only、lease、atomic push 或审查路径等分支门禁。
- 用户明确“推送”时，helper 普通合并登记分支，切换动态默认主分支并推送复读，保留登记资源且不创建 tag。明确“发布”时，先执行相同的主分支合并/切换/推送，再在当前 HEAD 创建并推送 `v{版本}-{YYYYMMDD}`；只有远端 tag 复读精确成功，才按 Worktree、远端分支、本地分支顺序删除本周期登记资源。tag 冲突或失败零清理，部分清理逐项记录并可幂等续作，dirty Worktree 和未登记资源不得强制删除。流程没有发布中转分支，也没有任何旧中转分支识别、迁移、兼容或清理代码。

### GUI 官方插件 Skills、三项 Rust-only 固定基线与九字段选择

- 变更标识：`HARNESS-FEAT-GUI-PLUGIN-CAPABILITY-MODULES`；所需 Harness 版本：`202608281139`（当前未发布时间版本，本范围不自动改变 `Version.md`）。
- 所有 GUI 无条件通过独立 Skills 接入官方 `os`（system-locale）、updater 与 window-state 三项 Rust-only 基线，不单独询问，也不把开关写入 profile；三者不安装前端包且不开放 WebView ACL。system-locale 是 Rust/React 共用的系统语言来源；updater 在 endpoint、公钥、channel、target 和 arch 未全部获得批准时固定 `NotConfigured` 且零出站；window-state 只恢复尺寸、位置与最大化，并对缺失、损坏或离屏状态使用安全可找回回退。
- GUI 条件问询按固定顺序记录系统托盘、系统通知、开机自启、关于页、赞助页、单实例、深链接、全局快捷键八项 `enabled|disabled`，再记录 `sidebar_mode = compact|detailed`。九字段不得遗漏、推断或残留 `pending`；`deep_link = enabled` 必须同时有 `single_instance = enabled`。
- 系统托盘、单实例、深链接与全局快捷键分别由独立 Skill 拥有；系统通知和开机自启各由独立 Skill 管理，并继续复用既有契约。中性深链接只接受由项目标识派生的精确 `app-<kebab-project-id>://restore` 并只恢复主窗口；中性全局快捷键只建立 Rust-only 能力与空 action contract，不预设 chord、动作、OS 注册或界面。任一条件能力禁用时，其依赖、feature、插件/生命周期、command、ACL、UI/i18n 和专属测试都必须缺席。
- GUI adapter 统一拥有 `single-instance → deep-link → os → updater → window-state → dialog → notification → autostart → global-shortcut` 的稳定 Builder 顺序与唯一 command handler；托盘通过 setup/window event 接线而不是伪 plugin，dialog 不进入 `invoke_handler`。固定插件安装不授权真实更新网络、签名密钥、业务深链载荷、文件系统访问或其他产品副作用。

### GUI dialog 固定 WebView 基线与默认权限

- 变更标识：`HARNESS-FEAT-GUI-DIALOG-DEFAULT-PERMISSIONS`；所需 Harness 版本：`202608281139`（当前未发布时间版本，本范围不自动改变 `Version.md`）。
- 所有 GUI 无条件安装官方 dialog 插件且不增加初始化问询或 profile 字段。根 `[workspace.dependencies]` 精确声明 `tauri-plugin-dialog = "2.7.3"`，GUI member 精确以 `tauri-plugin-dialog = { workspace = true }` 继承，前端精确声明 `@tauri-apps/plugin-dialog = "^2.7.3"`，即 `@tauri-apps/plugin-dialog: "^2.7.3"`；dialog 按上述 Builder 顺序注册，但不增加 Rust command，也不进入唯一 `invoke_handler`。
- 只有主窗口 capability 获得精确 `dialog:default`，允许前端使用全部官方默认的 message、save、open 对话框类型。不得使用 permission wildcard、deprecated `ask`/`confirm` alias、任何 `dialog:deny-*` 项或额外 dialog 权限；不得向主窗口或其他窗口授予任何 filesystem 权限。open/save 只返回用户在原生对话框中选择的路径，不构成读取、写入、创建或删除文件的授权。
- `os`、updater、window-state 继续是 Rust-only 固定基线，不安装相应前端包、不开放 WebView ACL，也不因 dialog 基线改变其 IPC/生命周期边界。初始化结构门禁必须锁定三处依赖、Builder 相对顺序、主窗口精确 capability、默认 message/save/open 覆盖、无 forbidden permission/deny/filesystem 残留以及 dialog 不进入 `invoke_handler`；真实下游仍需在当前宿主观察原生对话框的打开、取消与路径返回，不得把静态 fixture 视为候选验收。

### GUI 全局快捷键按需求绑定

- 变更标识：`HARNESS-FEAT-DEMAND-DRIVEN-GLOBAL-SHORTCUT-BINDINGS`；所需 Harness 版本：`202608281139`（当前未发布时间版本，本范围不自动改变 `Version.md`）。
- `global_shortcut = enabled` 只表示官方 Rust-only 宿主能力存在，不表示任何 chord、动作、默认注册或界面已经获批。`docs/GUI_APP_PROFILE.md` 同时保存唯一 `gui-global-shortcut-contract`；中性初始化固定 `schemaVersion = 1`、`actions = []`，首次启动不占用任何系统键位。初始化后的产品动作、`fixed|user-configurable` 策略、可空初始 chord、typed dispatch 与界面位置完全由批准的 Product Spec/当前需求决定。
- 每个动作以稳定 ID 将快捷键映射到一个宿主动作或一个 core 用例；dispatch target 只使用稳定 ASCII snake_case/点分 snake_case 标识。Rust action 表必须与 profile 的动作数量、ID、策略、chord、dispatch 和 `e2eSafe` 逐字段一致，每个 target 都有明确 typed dispatcher 分支，不得以 wildcard/no-op 兜底。业务规则、权限和状态转换继续位于 core。固定策略只有明确需求提供 chord 时才注册且运行时不可修改；可编辑策略允许 `null` 表示未绑定，并将期望配置与逐项 OS 实际注册状态分开。WebView 不拥有持久化或插件 ACL。
- 非空 chord 使用官方解析器规范化，至少含一个修饰键且不得重复。完整绑定快照的 OS 注册与设备级原子持久化作为一个可回滚事务；只响应 `ShortcutState::Pressed`，录制会话以宿主 token 暂停分派，初始化失败/退出/E2E 只注销模块实际拥有的 chord。固定/可编辑界面与真实触发场景只在 contract 声明时存在；空 contract 不生成占位 UI。

### GUI 系统通知与开机自启条件能力

- 变更标识：`HARNESS-FEAT-GUI-NOTIFICATION-AUTOSTART-CAPABILITIES`；所需 Harness 版本：`202608281139`。
- macOS 通知权限恢复补充变更标识：`HARNESS-CHANGE-MACOS-NOTIFICATION-PERMISSION-RECOVERY`；所需 Harness 版本：`202609082335`，已由本次 Harness 时间版本发布物化。
- GUI profile 依次记录 `system_tray`、`system_notification`、`autostart`、`about_page`、`sponsor_page`、`single_instance`、`deep_link`、`global_shortcut` 与 `sidebar_mode`。前八项显式选择，侧栏未选时物化为 `detailed`；`os`（system-locale）、updater、window-state 三项 Rust-only 固定基线与 dialog 固定 WebView 基线都不进入 profile。
- 通知启用时由独立 Skill 安装 macOS modern User Notifications 与 Windows/Linux 官方 Tauri 路线，使用生命周期拥有的串行 worker、授权成功后才持久化的默认关闭设置、可见失败反馈和最小 WebView 权限。macOS 用户开启开关时先读取 `AuthorizationStatus`，只在 `NotDetermined` 请求并复读；仅 `Authorized`/`Provisional`/`Ephemeral` 可持久化。`Denied`、受限/未知或请求后仍无权限时保持关闭，并由只接收内部 `AppHandle` 的 Rust opener 使用当前 bundle identifier 打开该应用的 Notifications 系统设置；不得接受 WebView URL 或外部 identifier，打开失败必须可见。中性 scaffold 不定义产品触发点或文案。自启启用时由独立 Skill 安装官方插件和默认关闭设置，OS 登录项是权威状态，失败回滚；初始化 E2E 必须恢复执行前登录项。禁用能力不得残留依赖、插件、命令、设置或资源。

### GUI 发布性能按次选择与启用后门禁

- 性能能力变更标识：`HARNESS-FEAT-GUI-RELEASE-PERFORMANCE-GATE`；按次选择变更标识：`HARNESS-FEAT-GUI-PER-RELEASE-PERFORMANCE-SELECTION`；预算调整变更标识：`HARNESS-CHANGE-GUI-RELEASE-PERFORMANCE-BUDGET-V2`。前两者所需 Harness 版本为 `202608281139`；预算调整所需版本：`202609082335`，已由本次 Harness 时间版本发布物化。
- 每次 GUI 发布在任何本地发布提交、测试或编译前解析当次 `performanceSelection: enabled | disabled`。当前请求已经明确时直接复用，否则询问一次；同一发布的修复重跑复用原选择，新发布重新询问。该选择不进入 `docs/AGENT_POLICY.md` frontmatter、不从 `milestone_e2e` 推断，产品/渠道硬要求优先并强制启用。
- 选择 `enabled` 或存在硬要求时，在打包前以最终干净提交生成 release-profile 探针候选，测量启动、代表性交互、整进程树 CPU/RSS、重复操作内存增长与退出回收。`gui-release-v2` 预算为启动中位数 2.4 秒/最大 3.6 秒、交互 p95 120 毫秒且单次低于 240 毫秒、Long Task 单次低于 240 毫秒、空闲 CPU p95 单核 6%（隐藏/托盘 2.4%）、稳定 RSS 360 MiB、峰值 600 MiB、20 轮后增长不超过 `max(18%, 38.4 MiB)`。这些允许上限相对 v1 精确放宽 20%；预热、样本量、30 秒观察时长、20 轮循环和 50 毫秒 Long Task 记录下限不变，旧 v1 证据不得改标或复用为 v2。失败先修复、重建、重测；无法安全解决时才询问用户，明确继续只记录 `performanceStatus: waived` 和原失败证据。
- 选择 `disabled` 且无硬要求时跳过 no-bundle 性能探针、采样与运行时绑定，manifest 记录 `performanceStatus: Not run`、非空原因和剩余风险，并且不得生成或残留 `performanceEvidence`、`performanceProbe`、`performanceWaiver` 或 `performanceRuntimeBinding`。主动关闭不等于通过，也不能覆盖同一候选已产生的真实失败。

### 发布语义审查按次选择与审查后证据边界

- 变更标识：`HARNESS-CHANGE-PER-RELEASE-SEMANTIC-REVIEW`；所需 Harness 版本：`202609082335`，已由本次 Harness 时间版本发布物化。
- 每次显式发布在任何本地发布提交、测试或构建前解析当次 `reviewSelection: enabled | disabled`。当前请求已经明确时直接复用，否则询问一次；同一发布的修复重跑复用原选择，新发布重新询问。安全、隐私、不可逆副作用、对外兼容契约或渠道硬要求会强制启用，不能被普通偏好关闭。
- 日常开发与默认 Harness 校验只执行机械硬门禁和本次变化所需的相关回归，不自动列出软行数候选、扫描 `TODO`/`FIXME`/`HACK` 或增加通用人工审查。选择 `enabled` 时发布流程显式运行 `validate_harness.py --release-review`，并对当次发布范围完成语义审查；选择 `disabled` 且无硬要求时记录 `reviewStatus: Not run`、非空原因和剩余风险，不得生成或残留 `reviewEvidence`、`reviewedSourceCommit`。
- 启用审查时以发布元数据上下文写入前的源码 `sourceHead` 为审查对象，记录 `reviewEvidence` 与 `reviewedSourceCommit = sourceHead`。最终候选 `sourceCommit` 可因随后提交发布元数据及普通合并而不同，不对两者施加祖先、线性或允许路径门禁；若审查对象本身继续变化则必须重新审查。禁用不等于通过，也不能覆盖同一发布已产生的真实审查失败。
- 所有正式发布候选都先由 `$desktop-prepare-release` 把显式审查结果封装为 `releaseReview`，把适用的 GUI 性能与 macOS 签名选择封装为 `candidateSelections`，与版本、日期、预期 tag 和源码 HEAD 一起写入 `.harness/release-context.json` 并提交。生命周期 helper 随后普通合并、切换并推送主分支，推送版本 tag，成功后清理登记资源；构建开始前和写 manifest 前都只读校验发布上下文、主分支和远端 tag，不能由直接构建入口或对话补写，E2E 仍在构建阶段单独解析。

### 候选证据原子化与发布后 tracked 记录

- 变更标识：`HARNESS-FIX-ATOMIC-CANDIDATE-EVIDENCE-LIFECYCLE`；所需 Harness 版本：`202609082335`，已由本次 Harness 时间版本发布物化。
- 构建、收集、候选 E2E、完整验收、`pending` → `accepted` 和就绪复核必须始终保持 clean 动态默认主分支，其本地/远端同名 ref、远端版本 tag 与所有 manifest `sourceCommit` 精确相同。全部候选、摘要、选择、人工签署和运行证据只写入忽略的 `release/` 原子集合、manifest 声明的相邻证据和最终回复，不得修改 tracked Verification、Product Status 或版本状态。
- Producer/collector 在仓库外同文件系统 sibling 暂存和验证完整精确集合后，才以目录级原子替换提交；验收在准入和写状态前两次验证发布上下文与 tag，E2E/冒烟后复算全部最终字节，随后一次性原子提交所有 `accepted` manifest。就绪复核纯只读。真实渠道发布成功后，才从已发布且带版本 tag 的默认主分支开始下一次开发生命周期，追加 Verification/发布/Product Status 并 finalize 版本周期；独立回顾性人工复核/长期审计不能反向批准活动候选。

### 受管开发环境低于最低门禁时自动升级

- 变更标识：`HARNESS-CHANGE-DEVELOPMENT-ENVIRONMENT-AUTO-UPGRADE`；所需 Harness 版本：`202609082335`，已由本次 Harness 时间版本发布物化。
- 用户级全局开发环境恢复补充变更标识：`HARNESS-CHANGE-USER-GLOBAL-DEVELOPMENT-ENVIRONMENT-RECOVERY`；所需 Harness 版本：`202609082335`，已由本次 Harness 时间版本发布物化。
- 环境门禁触发范围不变：中性初始化在首次脚手架写入前主动执行一次；初始化完成后只在真实测试/构建命令已出现受管环境错误时针对性恢复并单次重试。写入模式对缺失适用工具安装官方当前最新且满足项目兼容范围的稳定版，对可证明低于最低下界的稳定工具按同一路线升级，对范围内稳定版原样复用。Node.js 25.x 按低于下一段允许下界 26.0.0 处理；`cargo-xwin` 低于 0.23.1 时升级，`>=0.24.0` 仍因越过显式上界而阻断。
- Rust、Node.js/npm 与 pnpm 必须落在当前用户受管全局根；Rust 固定使用用户 `.cargo`/`.rustup` 并忽略继承的项目内同名环境变量。写入前逐级拒绝安装根、profile/config/env/fish 的 symlink/reparse/非普通对象和错误 marker，稳定链接只有最终目标仍在同一受管根才可替换，冲突必须零下载、零安装失败。Node marker 绑定本次已校验归档的精确版本与摘要，复用和最终复探不得只满足宽泛兼容范围；Unix profile 使用同目录随机临时文件、原字节快照比较后原子替换。持久 PATH 删除空段、所有相对/cwd 段和重复项，POSIX 解析不展开绝对字面 glob；包括仅 Git 改变在内的任何变化，都要求 Windows 新 PowerShell 只从持久 User/Machine PATH、Unix 新登录 shell 从持久 profile/系统 PATH 解析同一路径与版本并实际执行全部适用工具。Git 与系统编译器仅在平台原生受信管理器要求时允许显式系统级/管理员边界。不得在项目目录放置 shim、复制工具或只修复当前会话；`--check-only` / `-CheckOnly` 保持零写入。高于显式上界、预发布、无法解析或损坏的现有工具继续失败关闭，不得降低门禁、回退依赖或寻找替代工具链。

### Rust 1.95 与最新兼容稳定选择

- 变更标识：`HARNESS-FEAT-RUST-1-95-LATEST-STABLE-SELECTION`；所需 Harness 版本：`202608281139`。
- Rust MSRV 提升为 1.95。清单继续表达经过验证的最低兼容范围，新增/主动更新依赖与缺失工具优先选择 registry 当前最新兼容稳定版，经 MSRV、peer、平台和 API/feature 验证后把通过版本写成完整下界；锁文件固定真实解析结果，清单不写 `latest`。已安装工具落入支持范围就直接通过，低于工具门禁下界时按 ADR-20260907-002 自动升级。
- GUI 当前工具范围是 Node.js `^24.15.0 || >=26.0.0` 与 pnpm `>=11.24.0`；Node.js 25.x 自动升级到下一允许段，预发布、无法解析、损坏状态或存在显式上界时越界的版本继续失败关闭。

### Logo 原始候选稳定预览与选择后处理

- 变更标识：`HARNESS-FEAT-DEFERRED-LOGO-VALIDATION-STABLE-PREVIEW`；所需 Harness 版本：`202608281139`（当前未发布时间版本，本范围不自动改变 `Version.md`）。
- 三个 Logo 生成请求在发起前按请求顺序绑定 `candidate-1`、`candidate-2`、`candidate-3`。生成结果始终绑定原请求标识，所有首次预览、重显、说明和选择问题都保持该顺序；单个请求失败只重试原标识，不移动或重编号其他候选。
- 用户选择前只保存和预览生成工具交付的原始候选。除预览所必需的读取外，不检查格式、尺寸、色彩、透明通道、像素、安全区、小尺寸辨识度、摘要或质量，也不执行转码、缩放、裁剪、补边、改色、压缩、去元数据、覆盖重命名或其他标准化。
- 用户明确选择后只验证和按需标准化所选项，拒绝项不补做处理。若标准化产生可见变化，重新预览并确认最终母版；随后才写入母版与运行时副本、生成平台图标并记录所选项的验证与摘要证据。

### Session、Worktree 与 Subagent 进度标题

- 变更标识：`HARNESS-CHANGE-UNIFIED-SESSION-TITLE-FORMAT`；所需 Harness 版本：`202609082335`，已由本次 Harness 时间版本发布物化。
- 所有拥有会话标题的普通当前 Session、Worktree/Local 左侧 Task 与内部 Subagent/agent thread 使用唯一格式 `{序号}|{Task简述}|{当前进度} |{功能摘要}`。四段使用 ASCII `|`，进度后固定恰好一个 ASCII 空格再接第三个分隔符；Task 简述与功能摘要非空、不含 `|`、必须单行且首尾无空白。序号是无前导零的正整数，同一结果复用，普通 Session 无既有值时从 `1` 开始、新独立结果在可确定时递增，左侧 Task 与 Subagent 各自按当前派发批次顺序从 `1` 分配；它不承诺跨 Session 全局唯一，也不能来自 `threadId`/`clientThreadId`、Subagent 技术 `task_name`、Git ref 或列表顺序。进度只能为 `已分配`、`运行中`、`检查中`、`已完成`。
- 左侧 Task 用 `create_thread(title="{序号}|{Task简述}|已分配 |{功能摘要}")` 创建，取得执行权后由目标 Task 自行把第三字段更新为 `运行中`；普通当前 Session 直接从 `运行中` 开始。内部 Subagent 因 `spawn_agent` 没有显示标题参数，由协调方在派发消息记录逻辑 `已分配` 标题，目标 Subagent 取得执行权后第一项 UI 动作是自行更新为 `运行中`；其受限技术 `task_name` 不承载显示标题。进入真实必要测试、review 或最小替代检查时更新为 `检查中`，检查失败返工时回到 `运行中` 并可再次进入 `检查中`；没有独立检查时可跳过。只有结果、必需检查及要求的提交、推送和远端复读全部完成后才更新为终态 `已完成`。内部单元 Worktree 本身没有独立 Session 标题，由绑定它的 Subagent 承载。
- 每次真实转换至多尝试一次；目标标题已匹配时只验证，否则调用 `set_thread_title` 时省略 `threadId` 以定位当前调用线程。普通 Session 与左侧 Task 用可用的真实 `threadId` 和 host/project 上下文通过 `list_threads` 有界复读宿主规范化标题；隐藏 Subagent 不在该列表时，改用更新响应返回的精确 `threadId` 调用 `read_thread` 有界复读一次。工具不可用、真实身份不可得、更新失败或后台结果未确认时必须如实报告，不创建替代 Task、不无限重试，也不改变实现和测试的完成结论；阻断时保留最后真实阶段，不新增状态或虚写 `已完成`。

### 左侧 Task 的独立 Worktree 交付

- 变更标识：`HARNESS-FEAT-INDEPENDENT-TASK-WORKTREE-DELIVERY`；所需 Harness 版本：`202608051301`（当前未发布时间版本，本范围不自动改变 `Version.md`）。
- 补充变更标识：`HARNESS-FIX-PROJECT-BOUND-TASK-AND-SUBAGENT-WORKTREE`；所需 Harness 版本：`202609082335`，已由本次 Harness 时间版本发布物化。
- Task 快进整合闭环补充变更标识：`HARNESS-FIX-FEATURE-TASK-INTEGRATION-CLOSURE`；所需 Harness 版本：`202609082335`，已由本次 Harness 时间版本发布物化。
- 一个左侧 Task 固定对应一个明确且可独立验收的结果、一个保存的 Codex 项目、Git 项目中的一个不与其他 Task 共用的 Codex 管理 Worktree、一个由统一生命周期 helper 创建并登记的 `feature-*` 分支和一组可审查提交。显示标题的稳定字段为序号、Task 简述和功能摘要，目标 Task 只更新第三个进度字段；序号与不可变 Task key 分别记录，返回的线程标识不能生成序号。显示标题与独立 ASCII `feature-summary` 是两个事实；描述还必须列出项目绑定、repository identity、基线、目标、范围、禁止事项、验收标准和交付要求。
- plan、Todo、brief、review、Subagent、agent thread 和内部单元 Worktree 不是左侧 Task。诊断、实现、相关测试/review 和同范围缺陷修复共同服务同一结果时留在一个 Task；只有用户明确要求创建新的左侧 Task，或已明确把当前 Task 设为多 Task 协调器并指定独立结果时，才调用 `create_thread`。
- 创建前用 `list_projects` 按规范化完整路径锁定保存项目；项目工作只允许 `target.type = project` 和精确 `projectId`，Git 项目用 Worktree，非 Git 项目用 Local，禁止 projectless/默认兜底/其他项目。一个结果只派发一次；左侧 Task 调用 `create_thread` 时显式传入 `title="{序号}|{Task简述}|已分配 |{功能摘要}"`。`threadId` 表示 Ready；`clientThreadId` 表示请求已接受但仍 `SETUP_PENDING`，创建者返回 queued 引用，不假设转换接口、不无限轮询、不重复创建，也不在协调 Task 或后台目录代替执行。后续明确检查才用 `list_threads` 以真实 id 与 `projectId` 对账；执行 Task 可能已推进合法进度，身份不靠标题判断。
- 只读 Task 可使用用户明确起始 branch/ref，否则使用保存项目默认主分支的已提交 HEAD，不硬编码 `main`/`master`、不自动 fetch/pull，也不复制未明确批准的 working-tree 修改。会形成产品写入的 Task 在自己的 Worktree 创建具名分支，并通过 `$desktop-manage-git-lifecycle track-worktree` 登记。Ready Task 首次写入前确认线程 `projectId`；Git Worktree 即使物理路径位于保存项目之外，也必须与保存项目根拥有相同规范化 Git common dir，并出现在其 `git worktree list --porcelain` 登记中，同时匹配预期起始提交。
- Task 只编辑自己的 Worktree，每个逻辑闭环使用结果导向提交；交付前完成任务要求的测试与文档同步、提交全部改动并保持 `git status` 干净，不提交缓存或生成物。Task 不覆盖最终应用、不删除其他 Worktree、不自行合并或推送主分支，也不执行发布或签名。协调方读取交付报告后只核对范围、疑似秘密、任务要求的测试、clean 与精确 Task ref/Worktree；用户明确推送或发布时由 lifecycle helper 普通合并登记结果。Task 资源保留到发布 tag 成功后统一清理。
- `parallel_worktree_subagents` 只控制当前左侧 Task 内部的 Subagent。内部单元使用 `codex/unit-<task>-<unit>` 分支；helper 绑定保存项目根与当前 Task source worktree 的同一 Git common dir，从 source HEAD 创建，并登记非重叠 repo-relative 所有权。guard 只接受登记范围，postflight 必须证明实际 committed/uncommitted/untracked 路径均在范围内；单元完成后不立即删除 Worktree 或分支，而是登记到当前发布周期并等待 tag 后清理。内部 agent thread 遵守统一会话标题格式，但不调用 `create_thread`，也不能替代左侧 Task；其技术 `task_name`、单元 Git ref 与显示标题分离。

### UI 设计标准目录与匹配路由

- 变更标识：`HARNESS-FEAT-UI-DESIGN-STANDARDS-CATALOG`；所需 Harness 版本：`202608051301`（当前未发布时间版本，本范围不自动改变 `Version.md`）。
- `docs/design_standards/README.md` 是用户可见布局、组件语义、交互、可访问性和视觉密度的唯一索引；Tauri GUI 通用规则与固定左侧栏分别由其索引文件维护。初始化或修改 GUI 时先读取 profile、当前请求和批准 ADR，再选择全部条件精确命中的标准。产品已批准标准优先于 Harness 通用缺省，旧模板不得覆盖。
- 没有精确命中或用户明确要求特殊设计时，必须先完成额外设计并取得批准。像素、密度或信息架构偏离同步更新下游 `docs/GUI_APP_PROFILE.md` 与当日 ADR；没有批准产品事实的中性初始化停止偏离，不自行发明新密度。设计规则只进入 GUI adapter 展示/纯交互层，不下沉到 shared core。
- `sidebar_mode = compact` 精确命中 `tauri-gui-sidebar-compact-80-v1`：`80px` 栏宽、`6px` 内容内边距、`36px` Logo、`22px`/`1.75` Tabler 图标、`11px`/`1.25` 全宽居中名称、`56px` 菜单项、`4px` 图标名称间距/垂直 padding 和 `8px` 区间距；禁止固定 `em/ch` 名称盒与折叠按钮。AppShell navbar 复用栏宽常量且 Navbar padding 为 `0`。`sidebar_mode = detailed` 精确命中 `tauri-gui-sidebar-detailed-v1`：固定 `248px`/`76px`、`72px`/`44px`、统一 `22px` 图标，展开横排名称，收起 icon-only + 右侧零延迟 Tooltip。

### GUI 初始化能力选择与侧栏模式

- 变更标识：`HARNESS-FEAT-GUI-INITIALIZATION-CAPABILITY-SELECTION`；所需 Harness 版本：`202608051301`（当前未发布时间版本，本范围不自动改变 `Version.md`）。
- 用户在首轮基础问题中选择 GUI 后，初始化器必须在基础字段全部解析后进入条件问询，逐项确认 `system_tray`、`system_notification`、`autostart`、`about_page`、`sponsor_page`、`single_instance`、`deep_link`、`global_shortcut` 为 `enabled` 或 `disabled`，并提供 `sidebar_mode` 的 `compact` 或 `detailed` 选择。八项能力不得推断；用户未选择侧栏模式时必须写入 `sidebar_mode = detailed`，显式非法值不得按未选择处理。归一化后的九项写入唯一 `gui-initialization-config` 代码块，基线提交前不得缺失或残留 `pending`；深链接启用时必须同时启用单实例。
- `system_tray = enabled` 时完整实现现有托盘图标、双项本地化菜单、关闭隐藏、两种恢复和退出生命周期；`disabled` 时不启用 `tray-icon`、不安装托盘、不保留托盘 locale/菜单资源或关闭隐藏处理，而由主窗口 `CloseRequested` 显式调用 `AppHandle::exit(0)`，确保关闭即退出。`single_instance = enabled` 时完整实现官方首插件、只恢复既有窗口的回调与真实双启动唯一性；`disabled` 时依赖、插件、回调和双启动场景都必须缺席。
- `/settings`、动态标题、语言/三态主题和亮暗语义主题仍是所有 GUI 的固定基线。`about_page`、`sponsor_page` 各自只控制相应路由、导航入口、组件和运行时资源；未选页面不得以隐藏路由、不可达组件或无入口媒体残留。选择赞助页时完整 sponsor 媒体进入 bundle，未选择时不得进入运行时 bundle。
- `compact` 侧栏只实现设计目录中的 `tauri-gui-sidebar-compact-80-v1`，名称始终可见、允许最多两行且不使用固定 `em/ch` 占位盒；`detailed` 侧栏首次默认 `248px` 展开，使用 `72px` Logo、`22px` 图标和图标+名称横排，自身 ActionIcon 可收起为 `76px`，收起后使用 `44px` Logo、只显示图标并以 Mantine Tooltip 显示名称。详细模式折叠状态通过独立 local-storage 键跨重挂载和下次启动恢复，由 AppShell 拥有并同源同步 `navbar.width`/`data-navbar-width`，不进入页面会话 Jotai store。
- 初始化结构检查和真实本机 E2E 读取同一 profile：启用能力必须完整通过硬门禁，禁用能力必须证明无残留；按选择验证双启动、托盘和开机自启切换/恢复，其中自启登录项必须恢复执行前状态，托盘禁用时实测关闭最后窗口退出。系统通知在初始化阶段只验证默认关闭、串行 worker/权限状态机结构和失败可见性，不以未签名调试二进制触发真实权限或投递；当前应用的 Notifications 设置跳转与真实投递只由满足签名前提的最终安装候选验收。所有组合都验证所选侧栏、设置页、实际菜单页面可达和未选页面缺席。

### 页面事件归属、发布日志与版本展示

- 变更标识：`HARNESS-FEAT-INTERACTION-RELEASE-NOTES-VERSION-DISPLAY`；所需 Harness 版本：`202608051301`（当前未发布时间版本，本范围不自动改变 `Version.md`）。
- 页面交互事件必须绑定到实际拥有动作的按钮、链接、`Switch`、`Checkbox` 或菜单项本身，Card、`Table.Tr`、`Table.Td` 等父级不得代理子控件动作。父级确有独立动作时只执行自身语义并隔离冲突传播；点击表格行或单元格不得切换其中的 `Switch`。回归分别点击控件和周围父级区域。
- 选择关于页时，其更新区在“检查更新”旁提供元素自身绑定的“更新日志”按钮；即使远程 updater 为 `NotConfigured`，本地日志入口仍可使用。弹窗从候选内同一 `release-notes.json` 按最新在前展示至多 5 个版本，每版“功能优化”和“问题修复”各至多 10 个中英文翻译对；当前语言以 `zh` 开头时选择 `zh-CN` 标题与正文，其他或未知语言选择 `en-US`。未选择关于页时不建立隐藏更新入口。
- 每次正式发布的候选构建前，`$desktop-prepare-release` 从上一次真实正式发布版本/40 位提交到当前发布源码筛选最重要的用户可见变化；首发从仓库起点计算，比较边界不可靠时失败关闭。根 `release-notes.json` 使用 `schemaVersion: 2`、原子更新、非符号链接普通文件和近 5 版上限；每个逻辑条目绑定非空 `zh-CN` 与 `en-US` 文案，任一语言缺失都失败关闭，每版两类合计至少一个翻译对。中文渲染使用 `更新日志/功能优化/问题修复/无`，英文渲染使用 `Release notes/Feature optimizations/Bug fixes/None`。候选构建只读校验当前版本与摘要并把同一字节打入归档/应用资源；候选形成后任何日志变化都要求重新提交、构建和验收。
- 所有用户可见版本号带且只带一个小写 `v`，覆盖窗口标题、侧栏、设置/关于页、更新状态、CLI `--version` 和更新日志。Cargo、JSON/协议、状态文件及 manifest 的机器 `version` 保持原始值；manifest 另以 `releaseNotesVersion`、`releaseNotesSha256`、`releaseNotesPath` 绑定展示版本与包内日志事实。

### GUI 进程内页面会话状态

- 变更标识：`HARNESS-FEAT-GUI-PROCESS-SESSION-STATE`；所需 Harness 版本：`202608051301`（当前未发布时间版本，本范围不自动改变 `Version.md`）。
- GUI 中用于继续页面工作的活动选项卡、已应用查询/筛选、排序、分页页码/每页数量及同类视图选择必须由应用根 Jotai store 的页面级模块 atom 持有，在当前程序进程内跨路由切换、route unmount/remount 以及已启用的关闭隐藏/单实例唤醒保持；真正退出后，新 store 从默认值开始。
- 页面会话状态不得接入 `atomWithStorage`、localStorage、sessionStorage、IndexedDB、Tauri Store、配置文件、数据库或 URL，不得把 TanStack Query 结果、core 权威状态或持久业务数据复制进 atom。语言、主题与详细侧栏折叠等已批准的设备级偏好按各自独立契约持久化，不受页面会话生命周期限制；侧栏折叠偏好不得进入页面会话 atom。
- 查询条件、活动数据范围或每页数量变化时页码重置为 1。路由返回后只在查询成功、当前页码大于 1 且该页结果为空时回退第 1 页，并由新 query key 触发一次查询；加载、取消、超时、错误和第 1 页空结果不得触发回退或循环。失效枚举选择按当前可用项回到安全默认。
- 回归必须用同一个应用根 store 证明页面控件跨 route unmount/remount 保留，用新 store 证明下一次程序运行恢复默认，并覆盖成功空页回退、加载/错误不回退和第 1 页不循环；测试不得以持久存储、URL 参数或 Query 数据镜像替代。

### 下游自动版本管理

- 变更标识：`HARNESS-FEAT-DOWNSTREAM-AUTO-VERSIONING`；所需 Harness 版本：`202608051301`（当前未发布时间版本，自动 SemVer 规则不适用于 Harness 自身）。
- 补充变更标识：`HARNESS-FEAT-BASE100-AUTO-VERSION-CARRY`；所需 Harness 版本：`202609082335`，已由本次 Harness 时间版本发布物化。
- 已初始化下游以根 `Cargo.toml` 的 `[workspace.package].version` 作为当前版本唯一事实源，并以受保护的 `.harness/version-state.json` 保存正式发布周期、待发布变化和已消费 `bug-fix` 稳定 ID；所有成员继续使用 workspace 版本。
- 版本固定为无预发布/构建元数据的 `MAJOR.MINOR.PATCH`。新生成的 Minor/Patch 数位为 `0..99` 并按 base-100 自动进位：`0.0.99 -> 0.1.0`、`0.99.99 -> 1.0.0`；Major 不受 99/100 的业务上限约束，但必须处于 Cargo `u64` 范围 `0..18446744073709551615`，越界进位在写入前失败关闭。显式 Major 只由用户批准精确目标且归零 Minor/Patch；自动进位到 Major 是数值计算例外，不需要也不代表该批准。
- 一个正式发布周期的首个已完成功能提升一个 Minor 数位并把 Patch 归零，必要时自动进位 Major；后续功能直到真实正式发布成功解锁前不再提升。每个具有新稳定 ID 的已完成问题修复或用户可感知优化统一使用机器分类 `bug-fix`，提升一个 Patch 数位且不受功能锁影响；重复 ID 不提升，发布后回归必须使用新的稳定 ID。
- 查询、诊断、复现、未完成或重复处理、行为保持重构、内部优化、测试补强、文档、格式和内部清理属于 `maintenance`，不提升版本。版本只在变化完成且本次相关测试通过后提交；`check`、`plan` 和 `maintenance` 对版本文件与状态零写入，普通构建、`pending` 候选、验收或失败发布也不能提升版本或重置周期。只有真实正式发布成功才重置首功能周期，同时保留历史稳定 ID。
- 历史 Cargo 与受保护状态中的 Minor/Patch `100` 继续可读，升级不得改写；只有下一次确实提升版本的 `feature`、`bug-fix` 或显式 `major` 才先规范化当前 Cargo 与状态 `target_version` 再应用变化，周期基线、最近发布和既有变化保留原始证据值。历史发布日志保留原始版本字节，读取器继续兼容 Minor/Patch `100`，版本门禁不得回写旧条目。
- Product Spec、ADR、Changelog 或 Work Plan 仅在其自身事件独立触发时记录稳定 `change_id` 与 `required_version`；版本变化不为普通缺陷或维护任务强制创建项目记忆。

### 分层代码行数治理

- 变更标识：`HARNESS-FEAT-TIERED-CODE-LINE-LIMITS`；所需 Harness 版本：`202608051301`（当前未发布时间版本，自动 SemVer 规则不适用于 Harness 自身）。
- Rust 代码 400 行及以内不因行数触发专项复核；401 至 800 行列为建议重构候选，800 行通过，801 行起由机械门禁拒绝并强制拆分。Rust 多文件模块统一使用 `<module>/mod.rs` 目录入口，把职责相近的子模块置于同一目录；不得以同级 `<module>.rs` 加同名目录、空壳转发或压缩可读性规避门禁。
- 前端代码 500 行及以内不因行数触发专项复核；501 至 1000 行列为建议重构候选，1000 行通过，1001 行起由机械门禁拒绝并强制拆分。前端按功能或页面职责建立高内聚目录，不强制 `index.ts` 桶文件，也不用 `export *` 隐藏真实来源。
- 其他人工维护文本继续使用 500 行建议阈值与 2000 行硬上限；工具生成且禁止手工编辑的锁文件/生成物和原样内嵌的第三方文件继续按封闭范围排除。建议区间只在当次发布启用语义审查时列出并复核高内聚、职责单一和职责相近性，任一项不满足即按真实职责拆分；日常校验不为建议区间制造审查步骤。
- 统一检查器按文件后缀确定配置，在结构化报告中携带 `profile`、建议阈值和硬上限；默认只让硬超限以非零状态失败，`--release-review` 才输出软阈值提示。Rust 硬超限诊断必须明确 `<module>/mod.rs` 目录组织要求。

### 下游实例化首轮基础表单、条件补全与目标路径归一化

- 变更标识：`HARNESS-FEAT-BATCHED-BASE-INITIALIZATION-FORM`；所需 Harness 版本：`202608281139`（当前未发布时间版本，本范围不自动改变 `Version.md`）。
- `$desktop-instantiate-project` 在任何目录创建、复制、环境安装或 Git 初始化前维护初始化表单。固定基础字段为中文项目展示名、英文项目展示名、ASCII `snake_case` 标识、项目路径、负责人、目标平台、接口组合和推荐/自定义 Agent 策略模式。中英文名称至少一个由用户直接提供；只缺一种语言时由 Agent 自动翻译并标记来源，两个都给出时保持原值。用户已给出的合法字段直接复用；首轮必须一次列出全部尚未解析的基础字段，不能拆成逐字段多轮。首轮存在缺失或非法值时只集中补齐这些基础字段，不重问合法值。
- 基础字段全部解析后才进入条件阶段。推荐策略一次确认后物化既有四字段；选择自定义时四个策略值每轮补全一个。选择 GUI 时，系统托盘、系统通知、开机自启、关于页、赞助页、单实例、深链接、全局快捷键和侧栏模式同样每轮补全一个；八项能力必须明确为 `enabled` 或 `disabled`，侧栏明确跳过时采用 `detailed`，显式非法值重新询问，深链接与单实例的非法组合必须重新确认。产品目的、核心输入输出、成功标准、风险、副作用和发布事实不属于中性实例化输入；即使用户同时给出也要拒绝并要求在终端下游重提。
- 项目路径输入允许是最终项目根目录或其父目录。规范化输入的末级名称与项目标识区分大小写地精确相等时，最终根就是输入路径；否则无论大小写、连字符/下划线、前后缀或相似度如何，最终根固定为 `<项目路径>/<项目标识>`。只有最终根必须不存在或为空，父目录可以存在且非空。
- 只读路径 helper 在表单阶段输出原始输入角色、规范化最终根和目标状态，并拒绝非 ASCII `snake_case`、最终根为 Harness/其祖先、符号链接、非目录或非空目录。Agent 在首次写入前展示包含中英文名称、各自来源、最终根与派生 kebab-case 前缀的完整表单汇总并取得确认；之后复制、开发、验证与发布准备只使用该唯一根目录，Git 初始化和提交配置延后到实际基线提交前。

### 初始化与发布日志双语 i18n

- 变更标识：`HARNESS-FEAT-BILINGUAL-INITIALIZATION-AND-RELEASE-NOTES`；所需 Harness 版本：`202608281139`（当前未发布时间版本，本范围不自动改变 `Version.md`）。
- 初始化必须在首次写入前得到非空中文与英文展示名称，且至少一个来自用户直接输入。只提供中文时自动生成英文译名，只提供英文时自动生成中文译名；自动生成值及来源进入同一最终汇总，由用户一次确认，不增加逐字段翻译问询。中文许可证和 `zh-CN` 资源使用中文名称，英文许可证和 `en-US` 资源使用英文名称，README 同时列出两者。
- 发布日志升级为 schema v2。`featureOptimizations` 与 `bugFixes` 中每个逻辑条目都是键恰好为 `zh-CN`/`en-US` 的翻译对，两种语言都非空、无首尾空白并在同分类内逐语言去重；任一语言缺失或参数配对数量不一致都阻断写入。发布准备可自动翻译缺失语言，但必须在写入前复核两种语言，并分别渲染 `zh-CN` 与 `en-US`。
- 关于页继续读取候选内同一字节；Rust 与 React 都验证 schema v2、五版/十条上限和完整翻译对。界面语言以 `zh` 开头时选择中文标题与正文，其余及未知语言回退英文。发布构建、摘要、候选资源和 DMG 字节一致门禁不因双语结构而放宽。

### Harness 与下游生命周期

- Harness 只提供文档、项目 Skills、中性资产和验证入口，不实现具体业务。
- `$desktop-instantiate-project` 只执行一次，并通过写入前首轮基础表单收齐中英文展示名（至少一个直接输入，另一个可自动翻译）、ASCII `snake_case` 标识、项目路径、负责人、目标平台、接口和 Agent 策略模式，再按实际选择逐项补全自定义策略与适用 GUI 配置。项目路径末级与标识精确一致时直接作为最终根，否则追加标识；只有解析后的最终根必须不存在或为空。用户确认后该目录是初始化、开发、验证和发布准备的唯一项目根目录。
- 下游在完整表单确认后、首次脚手架写入前检查并按需安装 Git；全部初始化验证与裁剪成功后建立独立 `main` 仓库并配置 local 身份/模板。`git rev-parse --show-toplevel` 精确等于项目根，初始分支为 `main`，无远端，并只创建一个本地基线提交；完成报告公开 Git 版本、安装变化、身份来源、作用域与提交。
- 下游默认采用 Rust 2024、Rust 1.95 MSRV（即 MSRV 1.95.0）、共享核心与用户从 CLI/TUI/MCP/GUI 独立选择的适配器；1.95.0 是最低兼容版本而非精确版本锁，未选择任何接口时默认 CLI。
- Core-first 是强制架构约束：凡不依赖某一具体接口或宿主才能成立的领域类型、业务规则、语义校验、业务默认值、用例编排、领域状态转换、稳定领域错误、平台无关权限与持久化策略，都必须在共享 core 中实现并通过明确 API 暴露；即使当前只选择一个适配器也同样适用。
- CLI、TUI、MCP、GUI 必须保持薄适配层，只负责运行时与依赖装配、接口语法/协议结构解析、展示和交互状态、调用 core，以及把 core 结果与错误映射为接口输出；不得复制、改写或另建业务规则、权威业务状态、迁移、权限策略或平台无关校验。
- 系统托盘、窗口/WebView 生命周期、通知、自动启动、终端焦点/按键/恢复、MCP stdio 传输和 CLI 参数/退出码等接口或平台机制留在对应适配器；它们触发的业务动作仍必须调用 core。真实边界需要时可由 core 定义运行时中立的能力接口并由适配器实现，但不得为假想需求预建抽象。
- TUI 固定采用 Ratatui、tui-realm 与 tui-realm-stdlib；Tauri GUI 固定采用 Vite、React、TypeScript、Mantine UI、`@tabler/icons-react`、TanStack Router 文件路由、TanStack Query、Jotai、ESLint/`typescript-eslint`、Prettier、Vitest 与 Testing Library。各直接依赖与受管工具必须声明满足已批准能力、平台、MSRV、Node.js 与 WebView 约束的最低兼容稳定版本范围，并在声明的最低工具链中通过最低版本解析和相关测试；锁文件只固定当前实际解析结果。偏离技术族或精确锁死普通依赖版本都必须形成硬规则例外 ADR。
- Tauri GUI 的界面国际化（i18n）是初始化硬性必选项，不是可选增强：前端固定采用 `i18next` 与 `react-i18next`，Rust 后端（GUI 适配器层）固定采用 `rust-i18n`，系统语言探测统一使用官方 `tauri-plugin-os` 的 `locale()` API。所有实际建立的界面提供中文/英文资源，缺失语言回退英文；未选页面或托盘不保留对应可见键、原生资源或运行时接线。GUI 必须在固定设置页提供可发现的中英文切换入口并持久化；选择托盘时，语言切换还要无需重启地刷新托盘菜单且不得泄漏 `tray.*` 原始键。core 保持语言无关。偏离必须形成硬规则例外 ADR。
- 仅当 `single_instance = enabled` 时使用官方 `tauri-plugin-single-instance`：根 `[workspace.dependencies]` 声明最低兼容稳定下界，GUI member 以 `workspace = true` 继承，且插件作为 Tauri Builder 首个 plugin 注册。第二进程只通知并恢复、取消最小化、聚焦既有 `main` 窗口后退出；回调不记录参数/工作目录或触发业务动作。两个固定命名回归和真实双启动唯一性证据缺一不可。Linux Snap/Flatpak 需声明并验证会话 DBus 权限。选择 `disabled` 时依赖、插件、回调与双启动场景必须缺席。
- Rust 技术选型固定为：Tokio 负责异步运行时；获批 HTTP 使用 Axum + Tower/Tower HTTP；Clap 负责 CLI；SeaORM 负责关系型 ORM；真实配置使用 config-rs，`notify` 仅用于批准的窄热重载；本地可观测性使用 tracing + tracing-subscriber + tracing-appender；稳定错误、应用上下文、序列化与日期时间分别使用 thiserror、anyhow、serde 与 jiff。OpenTelemetry OTLP/HTTP 只在产品、隐私、采样、endpoint 和失败行为获批后默认关闭地接入。偏离必须形成硬规则例外 ADR。
- 固定选型表示“能力出现时采用该技术”，不表示中性初始化无条件安装全部依赖。OpenAPI 使用 utoipa + utoipa-axum + Scalar code-first，GraphQL 使用兼容的 async-graphql + async-graphql-axum，非关系型能力优先官方 MongoDB async driver 与 redis-rs Tokio，本地认证优先 jsonwebtoken + Argon2id；这些组合全部只在真实消费者、数据或安全边界获批后引入。Axum 标准不恢复独立 WEB 适配器。
- 异步优先是硬约束：下游 core 与全部 Rust 适配器只要涉及真实 I/O、等待、计时、进程、协议或跨边界调用，默认必须实现为异步，只有确认调用链纯 CPU 密集、无等待点时才保留同步实现；每个 spawned task 必须有 owner、取消、并发上限和关闭回收，timeout 不是业务成功，锁不得跨越不受控 `.await`。core 默认暴露运行时中立的 async API，只有真实业务需要 Tokio 具体原语时才增加 Tokio 生产依赖（见 ADR-20260806-002）。
- 已启用 tracing 时，结构化 event/span 必须通过 tracing-subscriber + tracing-appender 同时落盘到本地可读、可滚动日志文件；OpenTelemetry 默认关闭且不替代本地日志。标准输出仍只用于统一 JSON 信封，日志不得记录密钥、令牌、个人数据或未脱敏业务载荷（见 ADR-20260806-002）。
- 产出物验收以真实可用为准：对产出物给出“完成”“可用”结论必须基于真实运行产出物本身得到的可观察结果，不得以模拟实现、测试替身、占位页面或仅调用内部函数的结果冒充验收证据；单元/集成测试仍可对不可控外部依赖使用受控测试替身保证确定性，但该替身证据不能替代产出物真实可用的验收依据（见 ADR-20260806-002）。
- 产品规格缺失或为 `Draft` 时仅允许无业务副作用的 `scaffold status`，CLI JSON 明确返回 `productDefinitionRequired=true`；它只能证明中性工程骨架，不是可验收的产品里程碑。
- 选择 GUI 时必须在中性初始化中调用 `$desktop-prepare-gui-app-identity` 的 Logo 模式：以 `candidate-1`、`candidate-2`、`candidate-3` 固定请求顺序展示三个原始候选，选择前不验证、不计算摘要且不标准化；用户明确选择后只处理所选项，再逐字节接入运行时 `/app-identity/logo.png` 并由项目本地 Tauri 工具生成平台图标。profile 记录稳定顺序、选择及所选项的后置证据，不记录未选项验证结果。不得以文字方案、静默默认或中性占位图完成初始化。首次真实产品 GUI 开发前再次进入完整身份模式并遵守同一时序。
- 选择 GUI 时，中性初始化必须从初始化 Skill 的受管资产创建项目内 `<项目标识>_gui/src-tauri/dmg/background.png`：它是无产品身份的 660×400 PNG，清楚表达把应用拖到 Applications 的动作；Tauri 配置固定通过 `./dmg/background.png` 引用，并使用应用 `(180, 220)`、Applications `(480, 220)` 落点。首次真实 GUI 开发必须预览批准该基线或在同一路径替换并记录 SHA-256；初始化 Skill 删除后，运行时与构建不得继续依赖其源资产。
- 仅当 `system_tray = enabled` 时启用 Tauri `tray-icon`。托盘使用应用图标、稳定 ID `show_window`/`quit` 和由 `rust-i18n` 解析的中英文标签；显示项与主鼠标左键恢复并聚焦主窗口，关闭主窗口只隐藏，退出项结束应用。启用时原有六个固定命名回归、结构检查与真实宿主生命周期仍是硬门禁；禁用时不得保留 feature、安装函数、菜单/locale 资源或关闭隐藏处理，必须从 `.on_window_event(...)` 接线并在主窗口 `CloseRequested` 中显式退出。
- GUI 固定建立 `{applicationName} v{version} {contactChannel}:{contactValue}` 动态标题、`/settings`、语言与三态主题及亮暗语义主题。侧栏严格按 `sidebar_mode` 使用精简或详细布局，底部导航按已选赞助、固定设置、已选关于生成；`/about` 与 `/sponsor` 未选时不建立路由、入口、组件或运行时资源。主应用窗口为 1440×900、最小 960×640并与 DMG 安装卷窗口独立。所选关于页包含 `NotConfigured` 检查更新、可用的近五版更新日志、作者/联系人/免责声明；所选赞助页使用运行时主题并打包完整 sponsor 媒体。Harness 保留完整品牌源资产但不预创建 `docs/GUI_SUPPORT_SURFACES.md`，产品运行时只纳入选择需要的内容。
- 选择系统托盘时，应用图标必须来自项目本地 Tauri `icon` 生成并由 `bundle.icon` 引用的非透明 `icons/32x32.png`；托盘安装从 `.setup(...)` 可达并绑定双项 `Menu`、必需应用图标和 `.build(app)`，关闭隐藏从 `.on_window_event(...)` 可达，真实 E2E 必须看见非空图形。Linux 还必须把菜单绑定到 tray builder。未选托盘时这些专属资产要求与运行时接线不适用且不得残留。
- GUI 图标统一使用直接依赖 `@tabler/icons-react` 的命名组件：菜单、操作、状态、空态和图表周边控件存在适用图标时优先从该包选择，不另装图标库，不用手写 SVG、字符或 emoji 替代；图表绘制库仍由真实数据可视化需求决定。所选侧栏中的 Logo、所有当前渲染图标和文字必须沿同一中心线且无裁切。
- 含 GUI 的下游在初始化单元测试通过后、裁剪初始化能力和创建唯一基线提交前，必须固定执行一次 `$desktop-test-gui-initialization-e2e`。结构检查解析九项 profile，始终验证 `os`（system-locale）、updater、window-state 三项 Rust-only 固定基线与 dialog 固定 WebView 基线，对启用条件能力验证完整契约、对禁用能力验证无残留；dialog 验证必须覆盖三处固定依赖、唯一有序注册、主窗口精确 `dialog:default`、全部官方默认 message/save/open 类型、无 wildcard/deprecated `ask`/`confirm` alias/`dialog:deny-*`/filesystem 权限且不进入 `invoke_handler`。真实二进制按选择验证单实例、托盘、开机自启、深链接和全局快捷键，自启、window-state 与快捷键必须恢复执行前状态；系统通知只验证默认关闭的 Switch、失败可见性和结构回归锁定的串行 worker/权限状态机，不以未签名调试二进制触发真实权限、设置跳转或投递。Computer Use 始终验证主窗口、所选侧栏、设置页、实际菜单页面可达及未选页面缺席。它独立于 `milestone_e2e`，任一适用场景失败或无法观察/恢复都阻断初始化；只能由打包应用证明的 macOS 通知宿主行为与静态 scheme 系统注册必须明确留待候选补验。
- 产品启用更新时必须使用官方 Tauri updater 的签名制品、公开验证密钥和受限 HTTPS endpoints，签名验证不可关闭，并拒绝降级以及 target、arch、channel 不匹配。检查状态固定为 `NotConfigured`、`Idle`、`Checking`、`UpToDate`、`OptionalUpdate`、`RequiredUpdate`、`Failed`，失败不得伪装为最新版。强更只由 adapter 验证过真实性和目标绑定的 `minimumSupportedVersion` 交给 core，以严格 SemVer 得出；不得信任远端 `forcedUpdate` 布尔值。`RequiredUpdate` 使用根级不可关闭门，只允许安装已验证签名更新或安全退出。任务必须由应用生命周期拥有并具备单飞、取消、超时和关闭回收；一般网络/策略失败默认 fail-open。真实远程能力未批准时保持禁用和零出站。
- 统计上报默认关闭且不进入初始化设置页。只有产品明确启用统计能力并建立受保护产品事实与独立产品级明确同意界面后，才允许每进程一次 `app_started`，由 Rust GUI adapter 以 HTTPS JSON `POST` body 发送文档声明的精确字段白名单；禁止 GET/query、自由文本、业务载荷、令牌、路径、用户名、主机名和稳定设备/安装标识。队列只驻留内存且最多 32 条，同一时刻最多一个在途请求，撤回同意立即取消并清空，任务与至多两次重试必须可关闭回收；任何新增事件、字段、稳定标识或持久队列都需重新批准。桌面客户端不得保存服务端共享秘密或发布私钥。更新 banner 只有产品选择时进入 bundle，真实 endpoint、统计接收方、公开 updater 配置与安全密钥引用只进入受保护产品事实。
- 初始化完成后删除实例化、初始化和模板专用派生入口，同时保留轻量 `AGENTS.md` 的非空 Skills 地图和约束地图，以及适用的开发、验证、发布、身份改名和 `$desktop-upgrade-harness` Skills；任务专属细节继续由唯一事实源和精确命中的 Skill 承载，不复制回根入口。
- Harness 自身通过 `$desktop-curate-harness-memory` 治理自己的 `docs/adr/`、`docs/changelog/` 历史：当前最新文件超过 500 行建议重构阈值或项目负责人明确要求时，把已被后续决定完全取代、不再被任何当前规范引用的过期条目原文迁移到同目录 `ADR_history.md`/`CHANGELOG_history.md` 永久追加保存，不确定的条目保守保留。该 Skill 与其产生的 `_history.md` 不加入 `$desktop-instantiate-project` 复制清单，不随下游派生；不适用 Work Plan、Product Status、Product Spec，三者继续按整篇重写快照、历史交给 Git。
- 文件、中文业务注释、文档、测试与例外统一遵守 `docs/ENGINEERING_RULES.md`。Rust 下游从 Cargo workspace 根运行中文声明注释检查器；GUI 下游另外通过 TypeScript Compiler AST 门禁检查明确声明并接入 lint/validator。机械门禁不检查全部字段、局部变量、闭包或普通匿名回调，不自动生成套话，且只证明注释存在；语义仍由人工/Agent 复核。非 GUI 下游不适用 TypeScript 门禁。
- 文件规模按上述分层门禁治理；Rust、前端和其他人工维护文本分别使用 400/800、500/1000、500/2000，具体后缀分类、职责复核和排除边界以 `docs/ENGINEERING_RULES.md` 为唯一详细来源。

### 收敛的开发与构建闭环

- 日常开发统一直接进入 `$desktop-implement-change`。Agent 只完成当前批准范围、增加或更新本次开发所需的相关单元/回归测试，并运行这些测试；不因改动多步骤、多模块、中等风险或可并行而自动增加 `$desktop-plan-change`、Work Plan、全仓测试、格式化、lint、静态检查、构建、冒烟、E2E、Verification 或人工复核。
- 产品目标、边界、约束或成功标准真实变化时仍更新 Product Spec；长期重要决定或硬规则例外写 ADR；符合资格的用户/维护者可感知变化写 Changelog。Product Status/Work Plan 只在用户明确要求、跨会话交接、重要阻断或真实渠道发布后的记录阶段写入；Verification 只在真实渠道发布后或独立回顾性审计生命周期写入。候选构建/E2E/验收/就绪只写忽略的 `release/` 原子证据，不为日常开发制造占位记录。
- 代码行为变化的本次必要测试至少覆盖核心成功路径和最高风险失败路径；缺陷修复增加回归测试。纯文档、元数据、格式或不可合理单测的机械变更不创建空洞测试，只做证明文件可解析或差异完整所必需的最小检查。
- 安全、隐私、数据迁移、破坏性操作、生产/付费/凭据副作用、对外兼容契约、签名、发布和渠道硬要求仍必须取得相应授权或满足硬门禁；这些是当前风险所必需的边界，不得扩张为每次开发的通用步骤。
- 构建只在用户显式请求时进入对应构建 Skill，不以日常开发完成为由自动触发。Windows GUI 普通“构建/打包/首次安装试包”进入本地开发试包路线：不提交、不生成发布日志、不写 `release/`，也不询问 E2E、性能或语义审查选择。用户明确提出“构建发布候选”或发布时统一先进入 `$desktop-prepare-release`：按当次选择完成或跳过非必要语义审查，提交范围明确改动、发布日志和 `.harness/release-context.json`；随后生命周期 helper 普通合并、切换并推送主分支，创建并推送版本 tag，tag 复读成功后才清理登记 Worktree 和分支，然后从 clean、已推送且带 tag 的主分支进入候选构建。构建 Skill 只另外解析 E2E，不现场解析或制造其他选择/证据；没有合格发布上下文时只报告未就绪。
- GUI 正式发布在开始前必须解析当次性能选择。选择启用或产品/渠道硬要求时，在完整打包前运行独立性能门禁；失败先修复、回归、重建并重测，仍无法解决时才允许询问用户是否以 `performanceStatus: waived` 继续，且 E2E `disabled` 不能跳过已启用门禁。选择关闭且无硬要求时记录 `performanceStatus: Not run` 与剩余风险并跳过耗时探针；`waived` 和主动关闭都不能伪装为通过。
- 每次构建必须运行项目全部单元测试并确认发现数量非零。Rust 构建运行 workspace 全成员、全 targets、全 features 的锁定测试；GUI 构建同时运行完整 Rust workspace 与前端单元测试套件。任何单元测试失败或零测试都阻断构建。
- 发布构建 E2E 不与单元测试或编译混跑。选择启用或产品/渠道硬要求时，只在完整最终候选存在后对该候选运行；选择禁用时记录 `Not run` 和剩余风险。唯一例外是 GUI 初始化专用的本机调试二进制 E2E，它是基线提交前的脚手架门禁，不消费构建选择，也不能产生候选验收、签名、发布或人工复核结论。

### 持久 Agent 策略

- `docs/AGENT_POLICY.md` 是下游项目 Agent 策略的唯一持久事实来源，使用可解析的模式定义分别记录 `superpowers`、`parallel_worktree_subagents`、`milestone_smoke` 和 `milestone_e2e`。
- 下游完成初始化前，用户可一次采用推荐预设（Superpowers 为 `disabled`，并行 Worktree/Subagent 与适用冒烟为 `enabled`，E2E 为 `disabled`），也可选择自定义后逐项确认；只有自定义选择明确启用时才可使用 Superpowers。最终四项必须固化为 `enabled` 或 `disabled`，`pending` 不得进入初始化基线提交。
- `enabled` 表示允许 Agent 在适用场景中自行采用，不表示无条件执行；`disabled` 表示跳过可选能力。产品、渠道、安全和外部副作用硬门禁优先于项目偏好。
- 写入型 Subagent 只有用户在当前请求中明确要求并行、并行偏好为 `enabled`、任务可安全拆成至少两个无重叠写入单元且 Worktree 数据安全检查通过时才使用；否则 Agent 自行采用单 Agent，不重复询问。不存在因开发分支状态或历史形态而禁用写入并行的分支门禁。
- 冒烟偏好只在完整候选验收时消费。`milestone_e2e` 是每次发布候选构建询问时展示的建议默认值；无论它是 `enabled` 还是 `disabled`，都不能替代当前发布候选的明确选择。若本次候选请求已明确选择则不重复询问，否则候选构建前询问一次；本地开发试包不消费该值。
- 初始化首次写入策略时允许尚无 ADR；后续永久变更策略必须由用户确认并记录当日 ADR。临时任务约束只写入计划/验证证据，不静默改写项目策略。
- `docs/AGENT_POLICY.md` 同时保存左侧 Task 的保存项目绑定、setup 状态机、独立 Worktree 交付契约和统一描述模板；该静态工作约定不新增 schema 字段，也不受 `parallel_worktree_subagents` 的启用/禁用切换。

### 下游 Harness 工程升级

- 新增并在下游永久保留 `$desktop-upgrade-harness`，用于从用户明确提供的 Harness 来源升级工程治理部分。
- 升级默认只生成试运行计划，要求来源 Harness Git 工作区干净并把来源 `Version.md`、`HEAD`、目标分支/提交/工作树脏状态摘要、路径和控制文件状态绑定到受审计划；未解决冲突前不得写入。
- 下游使用 `.harness/upstream-lock.json` 记录上次应用的 Harness 版本/来源和受管文件基线摘要；该文件不是产品版本事实源，不能替代根 `Cargo.toml`。
- 升级清单把内容分为 `managed`、`merge-sections`、`conditional`、`protected` 和 `tombstone` 五类；`managed-self` 是 `managed` 的机器子模式，用于保证更新器自身在普通受管文件后按稳定顺序更新。产品源码、测试、产品记忆、项目状态、技术债、身份、接口选择、持久 Agent 策略、许可证、根 `release-notes.json`、Git 历史和未登记本地文件均受保护；GUI 能力、支持界面、候选/性能 Skills 只随 GUI 条件传播，Windows 本地试包 Skill 还要求持久目标平台包含 Windows。通知/自启是否接线继续读取受保护 profile，终端下游的 `docs/GUI_SUPPORT_SURFACES.md` 始终受保护。
- `Version.md`、实例化/初始化 Skills、模板校验器、模板方法论文档和 Harness 日期记忆属于 `tombstone`，不得借升级重新进入终端下游。
- 有历史基线时使用三方比较：只有候选和目标均已存在、仅上游内容或普通权限位变化且目标仍匹配基线的 `update` 可逐文件自动应用；`add`、`manual_add` 和 `delete` 必须人工处理并重新生成计划；仅下游变化保留；两边都变化或新增碰撞必须阻断并请求合并决定。没有历史基线的旧下游先执行引导审计，所有重叠项默认冲突，不能猜测共同祖先。
- 用户批准候选后才逐文件应用并在每次写入后重新生成计划；普通 `managed` 完成后才处理 `managed-self`，入口脚本最后替换并用新版复验。升级后运行受影响的非空单元测试和相关验证，不把 Harness 模板校验器复制到下游。

### Rust CLI 与 Tauri GUI 候选构建及发布目录

- Windows 本地试包与正式候选分离变更标识：`HARNESS-FIX-WINDOWS-LOCAL-INSTALL-CANDIDATE-SEPARATION`；所需 Harness 版本：`202609082335`，已由本次 Harness 时间版本发布物化。
- `$desktop-build-rust-release` 继续专用于 Rust CLI：默认路线是 Windows、macOS、Linux 原生候选矩阵；只有提供方、权限、三类运行器或结果取回能力在派发前不可用时才回退当前宿主，并记录原因及其他平台 `Unverified`。矩阵一旦启动，任一平台失败、取消或超时都是真实失败。
- `$desktop-build-tauri-local-install` 专用于 Windows 原生 x64 NSIS 本地开发试包，允许基于 dirty 工作树构建，但固定为未签名、未安装、未验收、不可分发，不消费发布日志或候选状态。`$desktop-build-tauri-release` 专用于 Tauri 2 GUI 发布候选：macOS 宿主可构建原生 DMG，Windows 原生宿主可构建 x64 NSIS，项目批准 Windows x64 目标时仍可从 macOS 使用 `pnpm tauri build --bundles nsis --runner cargo-xwin --target x86_64-pc-windows-msvc` 交叉构建 NSIS；不得在 macOS 声称生成只支持 Windows 原生 WiX 的 MSI。
- macOS→Windows 路线只证明 Windows MSVC 目标可编译并生成 NSIS，不证明 Windows 原生运行、安装或签名成功。清单必须记录 `interface: gui`、`artifactKind: installer`、`bundleFormat`、`buildMode: cross-compiled-xwin`、宿主、目标和 `runtimeVerification: Unverified`；需要原生 Windows/渠道证据时仍使用批准的 Windows 运行器。
- Windows 原生候选固定使用 `pnpm tauri build --bundles nsis --target x86_64-pc-windows-msvc --config src-tauri/tauri.release.conf.json`，不传 `--runner cargo-xwin`，并记录 `buildMode: native`。编译成功仍不代替真实安装/运行；E2E 未执行前 `runtimeVerification: Unverified`。GUI-only 下游必须随 Tauri 发布 Skill 保留 PowerShell `release/` helper，不依赖已裁掉的 CLI Skill或 POSIX shell。
- 中性初始化在写入脚手架前主动运行一次已选接口环境门禁。初始化完成后的 Tauri 交叉构建先使用当前环境执行真实命令；只有该命令已经失败且诊断明确指向受管 xwin 工具时，`$desktop-check-development-environment` 才分别检查 Homebrew `llvm` 与可能拆分的 `lld` formula，并在安全条件具备时安装缺失的 LLVM、LLD、NSIS、`x86_64-pc-windows-msvc` Rust target 与兼容范围 `cargo-xwin >=0.23.1, <0.24.0`，或升级低于 0.23.1 的可解析稳定 `cargo-xwin`；写入后逐项复探并只重试原命令一次。显式构建、目标选择或缺少环境证据不得提前触发该流程；已存在但缺少必需命令的 formula 视为损坏并阻断，`cargo-xwin >=0.24.0`、预发布、无法解析或损坏状态同样失败关闭，不得通过降级、shim 或替代工具链继续；缺少既有 Homebrew、安装/升级失败、目标不兼容或复探失败时同样阻断。
- macOS 发布先解析 `macosSigningSelection: enabled | disabled`，默认 `disabled`，并记录来源优先级 `channel-required > requested > configured > not-requested`。只有渠道硬要求、用户本次主动要求，或项目存在已经批准的持久签名配置时才启用；默认与明确禁用都使用 `--no-sign`，不得探测 Developer ID 身份、凭据、Keychain profile 或公证服务，也不得因宿主恰好具备条件而自行升级为签名候选。
- macOS 签名意图优先补充变更标识：`HARNESS-CHANGE-MACOS-SIGNING-INTENT-FIRST`；所需 Harness 版本：`202609082335`，已由本次 Harness 时间版本发布物化。
- 启用 macOS 签名后，Developer ID 签名、公证和 ticket stapling 是一个不可拆分的候选阶段。只有 Apple 设备、Developer ID Application 身份、Tauri 支持的一组完整环境凭据或已授权且在线可用的 `notarytool` Keychain profile、`xcrun notarytool`/`stapler` 和批准授权均可用时，才运行不含 `--skip-stapling` 的 DMG 构建；不同凭据模式不得混用，探测不得输出 profile 名或秘密。任一必需条件缺失或执行失败都阻断，不得静默降级为 unsigned。
- macOS DMG 构建必须在测试前确认项目内 `<项目标识>_gui/src-tauri/dmg/background.png`、GUI 资料中的当前 SHA-256 与 `bundle.macOS.dmg.background: "./dmg/background.png"` 一致，再把该本地拖拽背景、应用与 `/Applications` 落点及 Finder 窗口状态写入真实卷；headless CI 不得无界等待 Finder AppleScript。所有布局写入、签名、公证和 stapling 完成后，构建与里程碑验收都针对当前最终 DMG 只读验证非空 `.DS_Store`、本地背景、唯一顶层应用包与 Applications 链接，随后才计算或接受 SHA-256；不得自动接受软件许可，任何后处理或重打包都使旧签名、摘要和验收证据失效。
- 条件只满足签名而不满足公证/stapling 时，不得输出“仅签名”的 Developer ID 候选。`macosSigningSelection: disabled` 时生成并记录 `unsigned`、`notarizationStatus: not-run`、非空原因与剩余分发风险；`notarizationEvidence` 及任何探测派生证据必须缺席。只有 ticket 已 stapled 且验证通过时才记录 `notarized-and-stapled`。
- Tauri 清单除通用构建字段外，必须记录 `macosSigningSelection`、`macosSigningSource`、`notarizationStatus`、`notarizationReason` 和最终签名作用域；仅在启用时记录结构化签名/公证证据。未公证的非 macOS 候选记录 `not-applicable`，默认 unsigned macOS 候选不能伪装为失败或已验证。
- 初始化使根 `.gitignore` 精确一次包含 `/release/`。CLI 与 Tauri 构建都在任何单元测试或构建命令前安全刷新该目录，并只提交清单声明的普通文件；`release/` 可以保存 `milestoneAcceptance: pending`，目录存在不代表 `ready`、已验收或可发布。
- 发布候选的构建、签名、公证与结果收集不把 E2E 混入编译或打包命令，也不授权创建或索取凭据、安装 Homebrew、创建标签、发布上传、商店提交或正式发布。候选构建前解析的 E2E 选择只在最终安装包字节和清单形成后消费；Windows 交叉候选不能用 macOS 宿主结果冒充 Windows 运行验收。
- CLI 与 GUI 候选构建在测试/编译前只读校验根 `release-notes.json` 的最新条目版本和 SHA-256；不得生成、补写、重排或截断。候选包必须包含相对路径 `release-notes.json` 的同一字节，清单记录带单个小写 `v` 的 `releaseNotesVersion`、摘要和包内路径；只有 `about_page = enabled` 时 GUI 关于页消费同一应用资源。

### 商业许可与既有工程边界

- Harness 与收费下游采用非开源企业专有商业许可；根 `LICENSE.zh-CN.md` 和 `LICENSE.en.md` 保持一致，升级不能自动改写法律文本。
- CLI/TUI/MCP 使用 Tokio current-thread 异步入口，GUI 复用 Tauri 的由 Tokio 支撑的异步运行时；核心默认保持运行时中立。
- 根 Cargo 工作区是依赖版本、来源、内部路径和基础特性的唯一来源；初始化把实际选择的非空目标平台与接口写入 `[workspace.metadata.agent-first-harness]`，供后续构建跨会话只读路由。Harness 能生成的目标平台集合为 Windows、macOS 和 Linux，不表示每个下游都默认选择三者。
- 固定 Rust 技术族只启用满足真实能力所需的最小 feature，并在 Rust 1.95 MSRV、三平台和锁定回归门禁内声明经最低直接版本解析与测试证明的兼容下界；新增或主动更新时优先选择经完整兼容验证的 registry 最新稳定版作为新下界，正常锁文件固定真实解析结果。anyhow 不得作为公开稳定领域错误契约，tracing 不得记录密钥、令牌、个人数据或未脱敏业务载荷。
- 选择 CLI 时遵守统一 JSON 信封、错误结构、输出流和退出码契约。

## 不包含

- 当前 Harness 模板源不接受或暂存任何具体产品需求；“先记下来”“顺便实现”“以后会复制到下游”都不能绕过源请求边界。产品需求必须在终端下游根目录重新提出。

- 不在 Harness 根实现具体产品、账户、支付、云托管、远程部署或业务命令。
- 不提供独立 WEB 适配器；Tauri GUI 的本地 WebView 与固定前端技术栈继续保留。
- 不把模拟实现、桩实现、占位实现、中性脚手架、代码片段、开发服务器预览或测试替身当作里程碑产物。
- 除固定 GUI 初始化 E2E 外，不允许在完整最终候选形成前执行 E2E；初始化 E2E 只能证明当前宿主的调试脚手架可构建并满足 profile 所选单实例/托盘/关闭语义、侧栏、设置页、所选页面与禁用能力缺席，不得用它或其他部分通过结果宣称项目已验收。
- 不为日常开发自动创建 Product Spec、Product Status、Work Plan、Verification 或人工复核记录；ADR 与 Changelog 也只按各自事件触发。
- 不把普通缺陷修复、纯重构、格式整理、测试补强或内部清理写成项目记忆流水账。
- 不把文档、元数据或纯机械变更强行包装成带空洞单元测试的发布级工作。
- 不在普通编码、单元测试、发布编译、打包、制品收集或发布元数据命令中混跑冒烟/E2E；显式启用的发布 E2E 只针对已形成的最终候选。GUI 初始化专用调试构建与 E2E 只在一次性初始化收尾门禁中运行。
- 不因项目偏好为 `enabled` 而跳过本次发布候选的 E2E 选择、强制不可拆任务并行，或授权凭据、支付、发布、生产数据和不可逆操作。
- 不把新版 Harness 整体覆盖到下游，不自动覆盖产品专属规则、本地修改、许可证、策略或项目记忆。
- 不自动创建或索取签名/公证凭据、配置签名身份、安装 Homebrew、配置远端、强制推送、商店提交、真实渠道发布或上传到发布渠道。新功能/Bug 自动创建本地开发分支；只有用户明确“推送”或“发布”才普通合并、切换并推送主分支，且“发布”按规定创建/推送版本 tag 后才清理登记资源。构建只可在既有批准的非交互条件与授权全部可用时执行对应平台的签名或签名公证一体化阶段。
- 不在 macOS 交叉生成 Windows MSI，不从 xwin 产物推断 Windows 原生运行/安装行为，也不在本轮增加 Linux GUI 交叉构建或统一 TUI/MCP 发布模型。
- 除固定侧栏/设置及用户选择的托盘、通知、自启、关于/赞助界面所需中文与英文外，不在本轮为具体产品预设额外语言或业务翻译文案；不为 CLI/TUI/MCP 适配器新增 i18n 义务。
- 不在中性 GUI 中配置或启用真实更新 endpoint、强更最低版本、统计接收方、远程帮助或其他出站能力，也不把来源下游的产品名称/标识、固定 endpoint、客户端共享秘密或遥测实例带入 Harness。通知和自启只安装用户明确选择的本地能力，默认均关闭，不能预设产品通知触发点。选择关于页时更新入口与状态机在未配置时保持 `NotConfigured`/禁用/零出站；默认设置页不包含隐私或统计控件。
- 不复制 Rust Server 的单 package/single-bin 架构、默认多线程 runtime 或整套 HTTP 资产；不复制 Web/Extension/Plasmo/Chrome 资产、浏览器数据协议、固定 API BaseURL 或具体依赖版本。
- 不机械要求全部局部变量、循环绑定和普通匿名回调逐项注释，也不自动批量生成“保存变量”“执行处理逻辑”等套话。

## 可靠性与风险约束

- 不覆盖用户修改；出现重叠写入、升级冲突或缺少共同基线时必须默认拒绝。
- 新增或修改业务行为时必须先识别或建立对应 core 用例及其成功/最高风险失败测试，再实现适配器映射；“当前只有一个接口”不构成把业务逻辑放入适配器的理由。适配器独有逻辑必须能够说明其依赖具体接口或宿主，真正偏离 core-first 的行为只能按硬规则例外记录。
- 输入检查必须区分接口语法/协议结构、宿主能力约束与领域语义：前两者属于适配器，值域、跨字段约束、资源状态、业务权限、幂等性和会改变业务结果的默认值属于 core，并在所有接口间保持同一稳定领域错误。
- 精简开发流程不得削弱安全、隐私、数据完整性、外部副作用、发布渠道或法律硬要求；只增加解决当前风险必需的确认和门禁。
- 用户明确要求持久 Todo 时，状态只能在实现和对应单元测试完成后变为 `done`；验收失败必须保留证据并回到编码循环。
- 里程碑必须绑定批准场景、真实产物身份、源码提交、运行环境和验证结果；历史产物或其他提交的证据不能复用。
- 持久 E2E 偏好与当前发布候选选择必须分离；Agent 对每个候选逐次解析选择并记录使用或不使用的理由，不把一次选择静默持久化；本地开发试包不解析该选择。
- Worktree 辅助程序校验保存项目根、当前 Task source worktree、Git common-dir、分支、登记 Worktree、非重叠所有权、实际变更路径和符号链接边界；它不替代宿主沙箱，也不能修复宿主级 Task setup。
- Harness 升级溯源不能污染下游产品版本；模板版本与下游 SemVer 始终分离。
- 其他目标平台未实际验证时标记为 `Unverified`，不得声称已通过。
- 统一文件行数、中文声明注释、lint、静态与架构检查保留为按需治理能力；只在本次变化需要、用户明确请求或发布/渠道硬要求时运行，日常开发和普通构建不为它们增加独立步骤。行数检查一旦运行，Rust 超过 800 行、前端超过 1000 行、其他人工维护文本超过 2000 行都必须拆分，不能用 ADR、计划说明或警告降级为通过。
- Rust 注释门禁必须解析 Cargo package/virtual workspace、扫描所有成员的 `build.rs`/`src`/`tests`、对非法 UTF-8/NUL/源码符号链接/语法残缺/空扫描失败关闭，并以稳定 JSON、精确行列和 0/1/2 退出码报告。GUI AST 门禁采用相同失败关闭与精确路径原则，生成路由树只按根相对精确路径排除。
- GUI 语言偏好是设备级展示偏好，不是权威业务状态；必须由 GUI 适配器自有的本地持久化位置保存，不得写入共享 core 的持久化层或另建第二套业务数据权威副本。

## 成功标准

- [x] 当前模板源只接受 Harness 工程维护和终端下游初始化所需信息；产品目的、业务规则、专属 UI/文案/数据、远程地址、凭据、产品构建与发布需求在任何写入前被拒绝，混合请求只保留合法初始化字段。
- [x] 完整初始化汇总确认后、首次写入前检查并按需安装 Git；最终独立仓库只在 local 作用域保留或补齐身份与提交模板，完成报告公开版本、安装变化、身份来源和基线提交。
- [x] 新功能和独立 Bug 修复自动创建本地开发分支且不要求远端；用户说“推送”时普通合并登记分支、切换并推送动态默认主分支且保留资源；说“发布”时先完成主分支推送，再创建并推送 `v{版本}-{YYYYMMDD}`，tag 复读成功后才按 Worktree、远端分支、本地分支顺序精确清理两次发布间登记资源。不存在保护分支、严格线性、active leaf、单写入者、fast-forward-only、lease、atomic push 或发布中转分支逻辑。
- [x] 三个 Logo 原始候选在选择前固定按 `candidate-1`、`candidate-2`、`candidate-3` 预览且不验证或标准化；选择后只处理所选项，可见变化重新确认，未选项不补做验证或摘要。

- 下游版本 helper 的回归必须证明首功能/周期只升一次 Minor 并锁到真实发布成功、Minor 归零 Patch、不同 `bug-fix` 稳定 ID（问题修复或用户可感知优化）各升一次 Patch 且不受功能锁影响、相同 ID 跨发布仍不重复且历史 `bug-fix` ID 不能改作其他提升分类、回归新 ID 可提升、显式 Major 需用户批准、维护不变、`0.0.99 -> 0.1.0` 与 `0.99.99 -> 1.0.0` 自动进位、Major 支持超过 100 但不得超过 Cargo `u64::MAX`、最高位自动进位越界零写入、历史 `*.100.*` 当前 Cargo/目标版本只在下一次真实提升时规范化且其他状态证据保留、历史发布日志继续可读且不回写，以及构建只读和正式发布后才重置；初始化、开发、构建、候选收集、验收、发布准备及 Harness 升级保护均由 validator 锁定。
- [x] 页面动作由语义控件自身拥有，点击父 Card/表格行/单元格不会触发子按钮或切换 `Switch`；选择关于页时，更新区父级同样不代理检查更新或更新日志动作。
- [x] 选择关于页时，“更新日志”可查看近 5 版 schema v2 中英文结构，每版功能优化/问题修复各至多 10 个完整翻译对，当前 i18n locale 选择对应标题与正文且未知语言回退英文；`NotConfigured` 只禁用远程检查，未选择关于页时没有隐藏入口、路由或运行时组件。
- [x] GUI 页面会话状态由应用根 Jotai store 在本次进程内跨路由保留，退出后恢复默认且不使用持久存储/URL；详细侧栏折叠偏好使用独立设备级存储而不进入页面会话 atom；成功空页从大于 1 的页码回退第 1 页，加载/错误和第 1 页空结果不循环。
- [x] 发布准备能从上次真实发布边界整理并原子维护 `release-notes.json`，构建/收集只读验证并把同一字节及其版本、摘要、路径绑定进候选，升级不会覆盖下游日志。
- [x] 发布日志每个逻辑条目同时包含非空 `zh-CN`/`en-US` 翻译，发布准备分别渲染两种语言，Rust/React 双层拒绝缺失翻译，关于页随当前 i18n locale 选择内容。
- [x] 所有用户可见版本恰有一个小写 `v`，机器版本字段保持无展示前缀的原始值。

- [x] 日常开发不再选择快速/标准/里程碑档位，统一直接实现并只运行本次必要的相关单元/回归测试。
- [x] 普通当前 Session、用户明确创建的 Worktree/Local 左侧 Task 与内部 Subagent/agent thread 统一使用 `{序号}|{Task简述}|{当前进度} |{功能摘要}`，按真实阶段更新四种固定进度；左侧 Task 以 `已分配` 派发，Subagent 在派发消息收到逻辑 `已分配` 标题并在取得执行权后自行进入 `运行中`。Git Worktree Task 另以独立 ASCII `feature-summary` 调用生命周期 `start`，直接建立 `feature-*` 并自动登记当前非主 Worktree；内部单元 Worktree 由绑定 Subagent 承载标题。任务精确绑定保存项目，`clientThreadId` 以有界 `SETUP_PENDING` 返回；Git Ready Task 用已登记 Worktree 和可审查提交交付。适用场景的 Task 内部 Subagent 单元以 `codex/unit-*`、非重叠所有权和 postflight 验证保持隔离，资源登记到当前发布周期并在 tag 成功后清理。
- [x] 日常开发不自动创建 Work Plan、Product Status、Verification、构建、全仓检查、冒烟、E2E 或人工复核步骤；显式请求和必要风险门禁仍可独立触发。
- [x] 代码行为变化的本次必要测试覆盖核心成功路径和最高风险失败路径；纯文档/元数据/机械变更可以使用最小替代检查而无需空洞测试。
- [x] Product Spec、ADR、Product Status、Work Plan、Changelog 和 Verification 只在各自触发条件满足时更新，不再每项需求全量联动。
- [x] 普通缺陷修复、纯重构、格式整理、测试补强和内部清理不再因任务类型写入项目记忆，独立治理与交付事件仍可追溯。
- [x] Harness 与下游日常校验只机械拒绝 Rust 801、前端 1001、其他人工维护文本 2001 行起的硬超限文件；仅在当次发布启用语义审查时列出 Rust 401–800、前端 501–1000、其他文本 501–2000 行的建议候选，并检查 `TODO`/`FIXME`/`HACK`。Rust 拆分规则固定为 `<module>/mod.rs` 目录结构，前端不强制 `index.ts` 桶文件。
- [x] 每次显式发布候选在开始前由 `$desktop-prepare-release` 解析 `reviewSelection`；无硬要求时用户可禁用并得到 `Not run`、原因和风险，硬风险强制启用。同一发布重跑复用选择，新发布重新询问；启用证据绑定最终 `sourceCommit`，源码后续变化必须重新审查，禁用时审查证据字段完全缺席。完整 `releaseReview` 与 GUI 适用的 `candidateSelections` 写入 `.harness/release-context.json`，构建两次只读验证后消费；任何直接候选入口都不得绕过或伪造生产者，也不得借审查设置分支或路径门禁。
- [x] 候选 producer/collector 使用仓库外同文件系统 sibling 暂存并目录级原子提交精确集合；验收在执行前后复核发布上下文并重算最终字节，所有 manifest 状态一次性从 `pending` 变为 `accepted`。候选和纯只读 ready 不写 tracked 记忆，只有真实渠道发布成功后才通过后续自动开发生命周期写 Verification/发布/Product Status 并 finalize。
- [x] 每次显式发布候选构建都在开始前解析一次当前 E2E 选择，且持久偏好不能替代这次选择；Windows 本地开发试包不解析 E2E/性能选择。
- [x] 每次构建都运行项目全部非空单元测试；Rust 覆盖 workspace/all-targets/all-features，GUI 同时覆盖完整 Rust 与前端单元测试套件。
- [x] 里程碑只接受完整、可运行、符合批准场景且不含模拟实现/占位逻辑的真实产物。
- [x] 验收发现缺失或偏差时返回开发循环、增加回归测试并重新验收；只有用户要求持久 Todo 时才重开或新增 Todo。
- [x] 下游初始化一次确认并持久化四项 Agent 策略；后续发布候选仍逐次确认 E2E，本地开发试包不消费该值，其他能力按策略和适用性判断。
- [x] 新下游创建在首次写入前用首轮表单一次问出全部尚未解析的基础字段；中英文展示名至少直接提供一个，缺少的另一个自动翻译并随完整汇总确认。基础字段完成后再按实际选择每轮补全一个条件字段；项目路径末级与标识精确一致时直接使用，否则固定追加标识，非空门禁只作用于最终项目根目录。
- [x] Harness 源和推荐预设都默认 `superpowers: disabled`；只有自定义选择明确启用后才允许调用 `superpowers:*` Skill。
- [x] 环境门禁只在中性初始化主动执行，或在初始化后真实测试/构建命令已经出现受管环境错误时用于对应安装/升级与单次重试；不满足时把官方最新兼容稳定 Rust/Node/npm/pnpm 安装到当前用户受管全局根并持久修复 PATH，Node 精确绑定已校验归档，当前进程与绑定持久路径/版本的新 shell 都实际复探成功，且仅 Git 改变也不跳过新会话。Git/系统编译器只在平台原生受信管理器要求时显式进入系统级/管理员边界。新任务、新会话、显式构建和环境证据状态都不会触发例行预检。
- [x] `$desktop-upgrade-harness` 提供试运行、来源/基线记录、三方差异、冲突阻断、保护清单、`tombstone` 和更新后验证闭环。
- [x] 旧下游没有基线时进入引导审计，不会把任一端误当共同祖先。
- [x] 规则、相关 Skills、校验器、README、AGENTS、项目记忆和验证文档保持一致。
- [x] Rust 1.95、前端依赖及 Node.js/pnpm/cargo-xwin 等受管工具统一表达为经过验证的最低兼容范围；缺失工具安装官方最新兼容稳定版，可证明低于最低下界的工具自动升级，范围内稳定版原样复用，只读模式零写入并报告 `upgrade-required`；受管安装全局复用且不在项目内注入 shim，不得降低门禁或回退依赖来适配旧环境，锁文件继续固定真实解析结果。
- [x] Rust CLI 构建默认选择 Windows、macOS、Linux 原生矩阵，只有派发前条件不可用才回退当前平台；已启动矩阵失败不会被回退掩盖。
- [x] 构建前原子隔离旧根 `release/` 并创建全新空目录，构建后目录只包含当前构建身份的候选、哈希和清单；manifest 状态只使用 `pending`、`rejected` 或 `accepted`，`ready` 仅是对完整 `accepted` 原子集合的纯只读就绪复核结论，不是可写状态。
- [x] macOS 发布在任何测试、可用性探测或 bundle 前锁定签名选择；默认 `macosSigningSelection: disabled`、`macosSigningSource: not-requested`，直接运行显式带 `--no-sign` 的 DMG 命令且不探测签名/公证条件；只有渠道硬要求、本次主动要求或已批准持久配置才启用，按 `channel-required > requested > configured > not-requested` 记录来源，并在探测通过后运行不含 `--no-sign` 的命令。唯一前置冲突是产品已经启用 macOS 系统通知：关闭签名时不自动升级来源，而是在测试/bundle 前阻断不可验收的 unsigned 候选，要求用户下一轮主动启用签名或先改变产品能力；E2E 关闭不能绕过。
- [x] Tauri GUI 合同区分 Windows 本地开发试包、Windows 原生 x64 NSIS 发布候选、macOS 原生 DMG 与 macOS→Windows xwin 候选；本地试包不触发发布授权，xwin 不冒充 Windows 原生证据，Windows 原生安装/运行仍待真实下游前向验证。
- [x] macOS Developer ID 直接分发候选只在签名选择启用且条件齐全时完成签名、公证、stapling 和验证后再计算摘要；启用后条件不全会阻断且禁止只签名中间态，禁用时明确 unsigned、记录风险并完全省略探测派生证据。
- [x] xwin 门禁能分别处理 Homebrew `llvm`/`lld` 拆包并拒绝损坏 formula；`cargo-xwin <0.23.1` 自动升级，`>=0.24.0`、预发布、无法解析或损坏状态阻断；公证探测能安全使用一组完整环境凭据或已授权 Keychain profile，且不输出 profile 名或秘密。
- [x] macOS DMG 构建规则要求最终字节具有真实 Finder 拖拽布局，并以只读挂载检查 `.DS_Store`、本地背景、唯一应用包和 `/Applications` 链接；所有后处理都要求重新签名、公证、摘要与验收。
- [x] GUI 初始化携带并创建无产品身份的 660×400 DMG 背景，项目配置固定引用项目内 `src-tauri/dmg/background.png`；GUI 身份流程负责正式批准或同路径替换，构建在测试前校验路径、尺寸、摘要与 Tauri 配置一致。
- [x] GUI 选择后必须完成八项条件能力与侧栏模式的九项专门问询并写入唯一 profile 代码块；`os`（system-locale）、updater、window-state 由独立 Skill 作为不询问的三项 Rust-only 固定基线，dialog 作为不询问且只向主窗口开放精确 `dialog:default` 的固定 WebView 基线，其他插件能力各由独立 Skill 管理，禁用时全部专属依赖与接线缺席。
- [x] `global_shortcut = enabled` 只建立能力与唯一 action contract；中性初始化固定空 actions、零默认 chord、零 OS 注册和零占位 UI。产品 fixed/user-configurable 动作完全来自需求，Rust action/typed dispatcher 与 contract 逐字段一致，空 contract 不允许隐藏注册或录制 runtime。
- [x] GUI 初始化生成 3 个 Logo 候选并由用户选择；托盘启用时完整实现非透明图标、本地化双项菜单、关闭隐藏、恢复与退出，托盘禁用时不保留 feature/运行时/资源且关闭最后窗口退出。关于页与赞助页的路由、导航、组件和媒体严格按选择存在或缺席，`/settings`、主题和 i18n 始终存在。
- [x] UI 设计目录以精确匹配解析通用/组件标准，产品已批准标准优先；无匹配或特殊像素先批准并更新 GUI profile/ADR，布局不进入 core。
- [x] 侧栏支持精简与详细两种初始化模式：compact 锁定 `80/6/36/22/11/1.25/56/4/8`、全宽居中名称、无固定 `em/ch` 盒/折叠按钮和 AppShell 零 padding 接线；detailed 首次默认 `248px` 展开显示 `22px` 图标+名称，身份父级不代理，自身按钮收起为 `76px` 后使用 icon-only + Tooltip，并通过独立 local-storage 键恢复折叠偏好；AppShell 的 `navbar.width` 与 `data-navbar-width` 始终同步。两种模式的 Logo、图标、文字都居中无裁切。
- [x] GUI 固定直接依赖 `@tabler/icons-react`，适用图标使用命名组件；所选侧栏的 Logo、全部渲染图标与文字沿同一中心线，图表周边图标优先使用 Tabler，图表绘制能力保持独立。
- [x] 含 GUI 的下游在唯一基线提交前固定通过九项 profile-aware 结构门禁与真实本机调试 E2E：三项 Rust-only 固定基线与 dialog 固定 WebView 基线始终验证；其余按选择运行双启动、托盘、自启、深链接和全局快捷键场景。系统通知初始化只实测默认关闭、Switch 自身交互与失败可见性，并由结构回归锁定先读权限、只对 `NotDetermined` 请求并复读，以及拒绝/受限/未知时保持关闭并打开当前应用 Notifications 设置的实现；真实权限、设置跳转和投递只在满足签名前提的最终安装候选中验收。全部场景还验证所选侧栏、设置页、实际菜单页面和禁用能力缺席。
- [x] 每次 GUI 正式发布在开始前解析当次性能选择；启用或产品/渠道要求时在打包前通过 release-profile 整进程树性能预算，超标先修复重建，只有用户显式 waiver 才能继续且失败证据不改判通过；关闭且无硬要求时记录 `Not run`、原因和风险并完全跳过探针链。
- [x] `$desktop-prepare-gui-support-surfaces` 固化官方签名 updater、认证最低支持版本 + core SemVer 强更、根级不可绕过更新门，以及默认关闭、明确同意、HTTPS JSON POST、无稳定标识、内存有界队列和生命周期回收的统计契约；`$desktop-build-tauri-release` 在启用 updater 时强制产出并验证 archive/`.sig`，安装包签名状态不能绕过更新制品签名。
- [x] 品牌包完整保存 13 项图片资源并以清单绑定尺寸、摘要、用途与支付敏感性，不含来源下游产品名称/标识、固定服务地址、客户端共享秘密或默认网络请求；非 GUI 下游不保留该 Skill。
- [x] CLI/TUI/MCP/GUI、独立 Git 根、一次性初始化裁剪、固定技术栈、双语许可证和版本边界等既有成功标准继续有效。
- [x] 工程规则、规划/实施/验收 Skills、四类适配器 Skills、中性资产和 Harness 回归门禁一致强制 core-first；每个公开业务操作都能追溯到 core API 与 core 测试，接口/平台特性边界不被误判为业务下沉。
- [x] Tauri GUI 的 i18n 技术选型（`react-i18next`/`i18next`、`rust-i18n`、`tauri-plugin-os` 语言探测）已固化为事实标准；默认语言跟随系统、界面提供语言切换入口，选择托盘时标签随切换刷新且不显示原始键，未选能力没有相应可见键或原生资源，core 保持语言无关。
- [x] 下游 core 与全部 Rust 适配器默认对真实 I/O/等待/计时/进程/协议路径使用异步实现，只有纯 CPU 密集且无等待点时保留同步签名；详细边界写入 `docs/RUST_CLI_TEMPLATE.md`，`AGENTS.md` 只在 Rust/adapter 任务中路由到该事实源。
- [x] 已启用 tracing 的下游把结构化 event/span 落盘到人类可读、可滚动的本地日志文件，标准输出仍保持单一 JSON 信封且日志不记录敏感信息；详细边界写入 `docs/RUST_CLI_TEMPLATE.md`，不在根入口重复。
- [x] 任一路径对产出物的完成/可用结论都以真实运行结果为依据而非 Mock，同时保留测试隔离规则允许的受控测试替身范围；详细验收规则写入 `docs/VERIFICATION.md`，`AGENTS.md` 只保留跨任务摘要和验证路由。
- [x] Rust 固定技术族已扩展为 Axum + Tower/Tower HTTP、config-rs、tracing-subscriber/appender 与按批准启用的 OpenTelemetry；OpenAPI、GraphQL、MongoDB/Redis 和认证组合保持能力触发，不进入中性依赖。
- [x] Tauri GUI 固定基线已扩展为 Vite 文件路由、严格 TypeScript、ESLint/Prettier、Vitest/Testing Library、Mantine 设计规范、可选公开配置、结构化日志与最终 `dist` 静态扫描；托盘、关于/赞助页和侧栏模式按初始化选择建立，不捆绑产品业务起始资产。
- [x] Rust workspace 中文声明注释检查器和 GUI TypeScript Compiler AST 参考门禁均具备精确范围、位置诊断、失败关闭、专项负例与执行/初始化/升级/验证传播；两者都禁止自动套话并保留语义复核责任。

## 当前版本与未来候选

- 当前版本：`202609082335`，`Released`；上海时区格式为 `YYYYMMDDHHMM`，唯一事实来源为根 `Version.md`；时间版本起始值仍为 `202607301002`，`1.0.0` 保留为迁移前旧版本标识。人类入口身份现为毕方桌面应用Harness模版 / Bifang Desktop Harness Template。未来成功执行正式发布生命周期时必须创建并推送 `v{版本}-{YYYYMMDD}`；源码归档、签名与渠道上传仍须各自真实发生。
- 维护状态：Active。
- 未来候选：至少两个真实下游的 Harness 升级前向证据、策略解析器跨平台封装、TUI/MCP 与 Linux GUI 的统一构建产物/签名清单、Tauri xwin/Keychain profile/最终 DMG Finder 布局的真实前向构建证据、宿主级 Worktree 写入强制、依赖供应链维护 Skill，以及首次真实 GUI 下游对九项初始化组合、三项 Rust-only 固定基线与 dialog 固定 WebView 基线（含 dialog 原生 message/save/open、精确主窗口 capability、零 filesystem 权限、托盘禁用关闭退出、通知授权/投递、自启登录项恢复、单实例/深链接组合、全局快捷键冲突与注销、window-state 安全恢复、页面缺席与详细侧栏持久折叠）、签名更新安装、强更离线恢复、产品级统计同意/撤回、Vite/AST 门禁和最终 dist 扫描的前向构建证据。
