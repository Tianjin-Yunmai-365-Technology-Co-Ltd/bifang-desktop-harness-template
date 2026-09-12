# 毕方桌面应用Harness模版

Bifang Desktop Harness Template

这份 README 是人和 AI 共享的入口：说明模板做什么、第一次怎么创建项目、下游日常怎么用、当前名称/版本/许可，以及本仓库现在不接受哪些产品需求。Agent 的完整启动门禁和任务路由见 [`AGENTS.md`](AGENTS.md)。

一个让 AI Agent 帮你创建和维护跨平台小工具的工程模板。

你只需要告诉 Agent：项目叫什么、放在哪里、要支持哪些平台，以及需要 CLI、TUI、MCP、GUI 中的哪些界面。它会创建一个独立的 Git 项目，搭好共享核心、所选界面、开发规则和交付流程。之后你可以直接说要改什么，Agent 会完成实现并运行这次改动真正需要的测试。

这个仓库不是一款可以直接安装的应用，也不包含任何具体产品的业务代码。它更像一套已经整理好的“开工方式”，适合用 AI Agent 持续开发专有、可商业化的小工具。

## AI Agent 快速入口

如果你是第一次访问本仓库，请把它识别为 **Harness 源**，而不是待实现业务的产品仓库。根目录同时存在 [`Version.md`](Version.md) 和活动的 [`desktop-instantiate-project`](.agents/skills/desktop-instantiate-project/SKILL.md) 时，创建下游项目的唯一入口是 `$desktop-instantiate-project`。

按以下顺序执行：

1. 先完整读取 [`AGENTS.md`](AGENTS.md)，再完整读取 [`desktop-instantiate-project/SKILL.md`](.agents/skills/desktop-instantiate-project/SKILL.md) 与它指定的 [`initialization-form.md`](.agents/skills/desktop-instantiate-project/references/initialization-form.md)；后续只按这些入口渐进读取精确命中的事实源和 Skills。
2. 首轮集中收集尚未确定的基础字段：中文展示名、英文展示名（至少一个由用户提供）、ASCII `snake_case` 项目标识、项目路径、负责人、目标平台、接口组合（CLI/TUI/MCP/GUI）、Agent 策略模式，以及左侧 Git Task 是否使用独立 Worktree。最后一项必须由用户单独选择，不能由推荐预设或 Task 内部并行策略代答。选择 GUI 或自定义策略后，再按表单每轮补充一个适用的条件字段。
3. 使用仓库提供的路径解析器确定唯一目标根目录，并把双语名称来源、最终路径、平台、接口、策略以及适用的 GUI 配置汇总给用户。**用户确认完整汇总前保持零写入**：不得创建目录、复制文件、安装环境或初始化 Git。
4. 确认后才验证 Harness 源、门禁 Git、按固定清单复制中性工程层、重写项目身份、安装所选接口、裁剪初始化专用入口，并在目标根建立新的独立 Git 仓库和唯一基线提交。不要复制源 `.git`、Harness 时间版本、历史 Product Spec/ADR/Changelog/Verification、远端或凭据。
5. 初始化完成后，把解析后的目标目录作为唯一项目根和 Git 顶层；切换到该目录，再用 `$desktop-define-product` 提交产品目标，用 `$desktop-implement-change` 开始开发。产品需求不得提前写入本 Harness 源或中性脚手架。

可以直接把下面这段交给另一个 AI：

```text
你当前位于 Bifang Desktop Harness Template 源仓库。请先完整读取 AGENTS.md、.agents/skills/desktop-instantiate-project/SKILL.md 及其 initialization-form.md，然后使用 $desktop-instantiate-project 创建终端下游。先收集并展示完整初始化汇总，在我确认前保持零写入；不要在 Harness 源中记录或实现产品需求。完成后返回唯一目标根、所选平台/接口、Git 门禁与独立基线提交结果，并要求我切换到下游根目录继续定义产品。
```

## 能做什么

- 从一份简短的初始化表单创建全新的项目，不需要手动复制和改名。
- 在 CLI、TUI、MCP、GUI 中自由选择一种或多种界面；没有特别选择时默认使用 CLI。
- 默认使用 Rust 2024 和共享核心，让业务规则只写一次，再由不同界面调用。
- 为日常开发、测试、版本管理、构建和发布准备好对应的自动化流程（Skills）。
- 可选地把新结果创建为绑定保存项目的 Codex 左侧 user-owned Task；自动拆分默认关闭，启用后按结果边界创建，Git Task 使用独立 Worktree 和可审查提交。
- 初始化的推荐策略将自动 Task 保持关闭；自定义策略可以开启。初始化后也可明确开启或关闭，切换只影响后续结果边界，不移动或删除已有 Task/Worktree。
- 为新功能和独立 Bug 修复自动创建本地开发分支；你明确说“推送”时，普通合并登记分支、切换并推送动态默认主分支；你明确说“发布”时，在主分支推送后创建并推送 `v{版本}-{YYYYMMDD}`，tag 成功后才删除两次发布之间登记的 Worktree、远端分支和本地分支。GUI 在打包前还会检查启动、交互、CPU 与内存预算，没有真实验证过的平台会明确标为 `Unverified`。
- 把新版 Harness 的工程规则安全同步到已有项目，同时保护产品代码和本地决定。

日常开发不会因为任务看起来复杂，就自动增加长计划、全仓检查、构建或端到端测试（E2E）。只有你明确要求，或者任务确实碰到安全、数据迁移、凭据、发布等风险时，才会进入相应流程。

## 它不会替你决定什么

- 不会猜测产品要解决什么问题，也不会把中性脚手架当成已经完成的产品。
- 不会配置远端或凭据，不会强制推送、通配扫描分支、上传制品、发布到渠道或操作生产环境；只有你明确说“推送”或“发布”时才更新主分支，且只有“发布”会创建版本 tag 并在 tag 推送成功后精确清理登记资源。流程没有保护分支、严格线性、原子 ref 事务或发布中转分支等分支门禁。
- 不会为了“以后可能用到”预先加入业务、依赖或复杂架构。
- 不会绕过安全、隐私、商业许可和分发渠道的硬要求。

产品方向、关键取舍和最终发布仍由人决定；Agent 负责把已经确认的事情做完整、留下可检查的结果。

## 当前模板仓库的请求边界

打开本仓库时，Agent 只接受两类信息：Harness 自身的工程维护需求，以及创建终端下游所需的固定初始化字段和所选初始化路径精确要求的身份选择。产品目的、业务功能、产品专属页面/文案/数据、远程地址、凭据、产品构建或发布需求不会被写入或实现在本模板中；请先完成实例化，或切换到已经存在的终端下游项目根目录，再在那里定义和开发产品。

如果一条消息同时包含初始化字段和产品需求，Agent 只解析允许的初始化字段，并明确拒绝把产品部分保存到 Harness 或中性脚手架。产品部分必须在完成实例化并切换到唯一终端下游根目录后重新提出，避免模板项目与具体产品的事实混在一起。

## 第一次使用

1. 在 Codex 中打开这个仓库，然后告诉 Agent：

   ```text
   请使用 $desktop-instantiate-project 创建一个新项目。
   ```

2. Agent 会一次询问尚未确定的基础信息：中英文项目名、项目标识、保存路径、负责人、目标平台、界面组合和 Agent 策略。推荐策略包含默认关闭的自动左侧 Task；选择自定义时可逐项开启。中英文名称至少提供一个，另一个可以由 Agent 翻译后一起确认。
3. 如果选择 GUI，Agent 还会逐项确认系统托盘、系统通知、开机自启、关于页、赞助页、单实例、深链接、全局快捷键和侧栏样式；system-locale、updater、window-state、dialog 作为固定基线不额外询问。dialog 默认向主窗口开放全部官方对话框类型，但不授权通用文件读写。启用全局快捷键只安装能力，中性初始化不绑定默认按键或动作；产品动作、固定/可编辑策略和初始 chord 在终端下游完全按需求决定。随后按固定的 `candidate-1` → `candidate-2` → `candidate-3` 顺序展示 3 个未经验证或标准化的原始 Logo 候选。只有你选定其中一个后，Agent 才会验证并按需标准化所选项；未选项不会被额外处理。
4. 写入前，Agent 会展示完整汇总和最终项目路径。你确认后，它才会创建文件、检查所需环境并初始化项目。
5. 汇总确认后，Agent 会先检查 Git：缺失时按当前平台的受管方式安装，可证明低于最低下界时自动升级，范围内版本原样复用；随后才写入脚手架。建立独立仓库时，若作者信息缺失，会只在这个仓库静默使用设备账户名的英文形式和 `<设备账户名>@gmail.com` 补齐，不修改全局 Git 设置。完成后会返回 Git 版本、安装或升级变化、作者信息、来源、作用域和基线提交，并得到一个独立、无远端、带初始化提交的 Git 仓库。

## 下游项目日常怎么用

完成实例化并切换到终端下游根目录后，不需要记住整套流程，直接告诉 Agent 你想得到什么结果即可。例如：

- “实现这个功能”或“修复这个问题”：使用 `$desktop-implement-change` 直接开发，并运行相关测试。
- 新功能或独立 Bug 修复开始写入时：使用 `$desktop-manage-git-lifecycle` 在本地自动创建并切换到 `feature-{ASCII-kebab摘要}-{YYYYMMDD}`，名称碰撞自动追加后缀；不要求项目已经配置远端。同一结果的继续修改复用当前登记分支。
- “推送”：普通合并本发布周期登记的开发分支，切换到动态默认主分支并推送；不创建 tag，也不清理登记资源。
- “先把产品范围说清楚”：使用 `$desktop-define-product` 整理目标、边界和成功标准。
- “在 Windows 上打一个本地安装试包”或普通“构建/打包”：使用 `$desktop-build-tauri-local-install`；它允许基于当前工作树生成未签名 NSIS，只供本机检查，不提交、不生成发布日志、不写 `release/`，也不询问 E2E 或性能选择。
- “构建 CLI 发布候选”或“准备并构建发布”：先使用 `$desktop-prepare-release` 记录本次选择并提交发布上下文，再由 `$desktop-manage-git-lifecycle release` 合并并推送主分支、创建并推送 `v{版本}-{YYYYMMDD}`，tag 复读成功后依次清理登记 Worktree、远端分支和本地分支，最后由 `$desktop-build-rust-release` 从带该 tag 的 clean 主分支构建。
- “构建桌面 GUI 发布候选”：同样先使用 `$desktop-prepare-release`，在 `.harness/release-context.json` 中记录本次审查、性能与 macOS 签名选择，再由 `$desktop-build-tauri-release` 只读消费；当前请求已经明确时直接复用，不写入通用持久偏好。
- 普通“构建/打包/本地试包”不会自动升级为发布候选、提交、推送或修改主分支；只有明确发布会自动执行 tag 前主分支推送和 tag 后精确清理。
- “完整验收这个候选”：使用 `$desktop-verify-delivery` 检查真实产物。
- “把这个项目升级到新版 Harness”：使用 `$desktop-upgrade-harness`，先预览差异再应用。
- “开启左侧 Task”/“开启自动 Task 拆分”或“关闭左侧 Task”/“关闭自动 Task 拆分”：更新 `docs/AGENT_POLICY.md` 的 `user_owned_tasks` 和确认元数据，并记录当日 ADR。默认关闭；切换只影响后续结果边界，不迁移或中断既有 Task/Worktree。

即使自动 Task 关闭，用户仍可明确要求为一个结果新建左侧 Task。启用后，交付物类型、生命周期阶段、外部副作用、禁止范围或验收责任发生变化时会自动创建下一 Task；证明同一结果所需的测试、review、checkpoint 和必要同范围修复仍留在当前 Task。plan、Todo、Subagent 和 Worktree 都不是左侧 Task。详细规则见 [Agent 运行策略](docs/AGENT_POLICY.md)。

用户可见 Task 使用 `Task {序号} | {当前进度} | {单一结果}`，例如 `Task 8 | 运行中 | 左侧 Task 默认关闭并支持开关`。单一结果固定，进度只取 `已分配`、`运行中`、`检查中`、`已完成`。当前及归档 Task 的有效标题共同决定下一序号；不识别任何历史标题格式。内部 Subagent 不使用本标题合同，也不占用项目 Task 序号。

## 开发与构建边界

日常开发直接使用 `$desktop-implement-change`，只增加并运行本次变更需要的单元/回归测试；新功能或独立 Bug 修复首次写入前自动创建并切换到本周期登记的 feature 分支，用户明确说“推送”或“发布”时才统一普通合并并推送动态默认主分支。新功能在当前正式发布周期首次完成时自动提升 Minor 并把 Patch 归零，直到真实发布成功前不再因功能重复提升；每个具有新稳定 ID 的问题修复或用户可感知优化都沿用 `bug-fix` 分类自动提升 Patch，且不受功能锁影响。不改变可观察行为的纯重构、文档或内部清理不会自动升级版本，也不自动增加计划、全仓检查、构建、冒烟、发布候选 E2E 或验收步骤。

显式“发布候选”请求先由发布准备解析当次语义审查选择；GUI 同轮解析性能与 macOS 签名选择，并把它们写入 `.harness/release-context.json`。发布生命周期完成主分支/tag 推送和登记资源清理后，构建 Skill 只读校验并消费这些记录、把同一日志打入候选，只另外解析本次是否启用 E2E；记录缺失或适用性不符时失败关闭，不从对话补写或兜底询问。性能选择关闭且没有产品/渠道硬要求时跳过耗时探针，在 manifest 和最终回复记录 `performanceStatus: Not run` 与剩余风险；选择开启时才运行现有定量门禁。随后运行项目全部非空单元测试并构建。普通 Windows 本地安装试包是开发制品，不进入上述候选流程，也不要求发布日志或 clean HEAD。构建事实只写入适用的产物位置和最终回复，不创建或更新 ADR、Changelog、Product Status、Work Plan、Verification 等项目记忆。GUI 的活动选项卡、查询/筛选、排序和分页只在当前进程跨路由保留；只有成功查询的当前页大于 1 且为空时回退第 1 页。按钮、链接和开关由自身处理动作，父级容器不得代理子动作。

Core-first 是强制规则：值域、跨字段关系、业务默认值和可复用状态转换进入 shared core；CLI/TUI/MCP/GUI 只负责各自协议、展示和系统能力。系统托盘、窗口、通知和登录项等宿主机制留在 GUI adapter，但其业务效果仍调用 core。维护者可运行 `python3 -B -m unittest discover -s scripts` 验证 Harness 的非空回归。

依赖清单以完整三段、可在项目最低工具链证明的兼容下界为目标，锁文件保存当前实际解析结果；新加入依赖时优先选择 registry 当前最新兼容稳定版。当前只有中性 Rust CLI fixture 的 Cargo 直接依赖已在 Rust 1.98.1 上完成最低直接版本解析、格式、Clippy 与非空测试；TUI、MCP、GUI/React 数值仍是经 registry metadata、peer 与 engine 筛选的候选，在真实下游完成最低工具链解析、测试及适用构建前保持 `Unverified`。环境门禁当前要求 Git `>=2.36.0`、Rust `>=1.98.1`、GUI 的 Node.js `>=24.21.0` 与 pnpm `>=12.4.1`：已安装的更高稳定版本直接通过，只有缺失或可证明低于下界时才安装/升级。Node.js 安装选择官方当前最高 LTS 线的最新补丁；Rust 没有 LTS 通道，使用官方当前 stable。Rust/Node.js/pnpm 使用各平台标准的当前用户全局位置与 PATH，不创建 Harness 私有工具环境变量或私有全局前缀；`rustup-init` 使用 `--no-modify-path`，由门禁在完整预检后持久化标准 Cargo bin，这不改变标准安装根。非默认 Rust homes 必须能由新登录会话持久恢复，单一路径根不得夹带 PATH 分隔符，当前进程和新 shell 都必须复探。只读检查零写入并报告 `upgrade-required`；存在显式上界时高于上界仍阻断，预发布、无法解析或损坏的工具同样失败关闭。Agent 不会降低门禁、回退依赖、在项目内注入 shim 或改找替代工具链来迁就旧环境。文件与测试组织遵守 [工程维护规则](docs/ENGINEERING_RULES.md) 和 [GUI 设计标准索引](docs/design_standards/README.md)：日常只强制 Rust 800 行、前端 1000 行的硬上限，其他人工维护文本也固定为 2000 行硬上限；Rust 401–800、前端 501–1000、其他文本 501–2000 行的建议候选只在当次发布启用语义审查时集中提示。Rust 模块拆分使用 `<module>/mod.rs`。

每次正式发布使用同一份双语 `release-notes.json`；每版两类各至多 10 个翻译对并只保留近 5 版。用户可见版本只显示一个小写 `v`，机器字段不带前缀。

## 开始一个左侧 Task

`user_owned_tasks: disabled` 时只响应用户明确的新建请求；`enabled` 时还会在新结果超出当前 Task 固定边界时自动创建。创建者先用 `list_projects` 核对项目名称、完整路径和 Git 状态，并用 `list_threads` 确认同项目没有另一个写入型 active Task。Git 项目选择独立 Worktree，非 Git 项目选择 Local，始终绑定精确 `projectId`，禁止 projectless。清点同项目当前与归档标题后分配最大序号加一，再以 `title="Task {序号} | 已分配 | {单一结果}"` 调用一次 user-owned `create_thread`。

序号清点固定使用同一 `hostId` 与精确 `projectId`：先读 `list_threads(limit=50)`，再按 `nextCursor` 逐页读完 `list_archived_threads`，从最大有效序号继续递增；空历史才从 1 开始，缺号不回填。内部 Subagent 不使用标题合同，也不进入这套序号分配。

只有返回真实 `threadId` 才能继续；仅有 `clientThreadId` 表示仍在 setup，必须保持零实现且不得重复创建。取得真实 id 后用 `list_threads` 核对标题、`projectId`、cwd 和状态，并在首次写入前核对干净工作区和起始提交。任一事实为空或不符都阻断，不退化为 plan、Subagent、Local Git checkout 或普通 Worktree。

Git Task 从用户明确起点或保存项目默认主分支的已提交 HEAD 建立，在自己的 Worktree 首次写入前调用 `$desktop-manage-git-lifecycle start` 创建并登记唯一 `feature-*` 分支；非 Git Task 使用绑定的 Local 项目目录。内部并行仍由独立的 `parallel_worktree_subagents` 控制，只在用户明确要求时创建 `codex/unit-*` sibling Worktree，不调用 `create_thread`。显示标题与 Git ref 分离，登记资源只在正式发布 tag 推送成功后统一清理。

如果还使用全局 Task 提示词，应保留“一结果一 Task、项目绑定、一次创建、不重复创建、真实 `threadId` 与零写入门禁”。Task0 只能协调；`clientThreadId` 不是 Ready；Git Worktree 的物理路径无需位于保存项目目录内，但必须属于同一 Git common dir 并登记在 worktree 列表中。

## Skills 索引

初始化与接口：`$desktop-instantiate-project`、`$desktop-initialize-rust-project`、`$desktop-check-development-environment`、`$desktop-add-cli-adapter`、`$desktop-add-tui-adapter`、`$desktop-add-mcp-adapter`、`$desktop-add-gui-adapter`、`$desktop-add-gui-system-locale`、`$desktop-add-gui-updater`、`$desktop-add-gui-window-state`、`$desktop-add-gui-dialog`、`$desktop-add-gui-system-tray`、`$desktop-add-gui-single-instance`、`$desktop-add-gui-deep-link`、`$desktop-add-gui-global-shortcut`、`$desktop-add-gui-system-notifications`、`$desktop-add-gui-autostart`、`$desktop-prepare-gui-app-identity`、`$desktop-prepare-gui-support-surfaces`、`$desktop-rename-project-identity`、`$desktop-extract-i18n-strings`。

开发与治理：`$desktop-define-product`、`$desktop-plan-change`、`$desktop-implement-change`、`$desktop-refactor-code`、`$desktop-manage-version`、`$desktop-manage-git-lifecycle`、`$desktop-configure-git-commits`、`$desktop-run-parallel-worktrees`、`$desktop-curate-harness-memory`、`$desktop-upgrade-harness`。

构建与验收：`$desktop-build-tauri-local-install`、`$desktop-prepare-release`、`$desktop-build-rust-release`、`$desktop-build-tauri-release`、`$desktop-prepare-cross-platform-release`、`$desktop-collect-release-artifacts`、`$desktop-test-gui-initialization-e2e`、`$desktop-test-gui-release-performance`、`$desktop-test-final-artifact-e2e`、`$desktop-verify-delivery`。

## 可以创建哪些界面

- **CLI**：适合脚本和 Agent 调用，支持非交互运行和统一 JSON 输出。
- **TUI**：适合在终端中用键盘操作，基于 Ratatui 与 tui-realm。
- **MCP**：提供 Rust stdio MCP 服务器，让其他 Agent 或 MCP 客户端调用共享能力。
- **GUI**：基于 Tauri 2、React 和 Mantine 的桌面界面，固定接入系统语言、窗口状态、updater 和原生 dialog 基线，并可按初始化选择加入托盘、单实例、深链接、全局快捷键、系统通知、开机自启、关于页和赞助页。

这些界面可以单独使用，也可以组合使用。与界面无关的业务规则统一放在共享核心（shared core）中，界面只负责输入、展示和系统交互。

## 当前状态

- 维护状态：Active
- 中文名称：毕方桌面应用Harness模版
- English name: Bifang Desktop Harness Template
- 当前版本：v202609122231
- 发布状态：Released
- 产品规格：Approved
- 具体产品源码：不包含

版本的唯一事实来源是 [`Version.md`](Version.md)，采用上海时区 `YYYYMMDDHHMM`。模板版本和新项目自己的版本分开管理，不会互相覆盖。成功执行新的正式发布生命周期时会为该版本主分支提交创建并推送 `v{版本}-{YYYYMMDD}`；源码归档、签名候选和可安装应用仍须各自真实形成后才能声称存在。

## 项目结构

- `.agents/skills/`：创建项目、开发、测试、构建、验收和升级时使用的 Agent Skills。
- `docs/`：产品规格、工程规则、接口契约、设计标准和发布说明。
- `scripts/`：模板一致性与关键规则的检查工具。
- `Version.md`：Harness 模板当前时间版本与发布状态的唯一事实来源。
- `AGENTS.md`：轻量启动门禁与任务路由；具体规则、门禁和 Skills 按当前任务渐进读取。
- `LICENSE.zh-CN.md` / `LICENSE.en.md`：专有商业许可；适用项目名称与本 README 的中英文名称一致。

## 进一步了解

- [当前时间版本](Version.md)
- [Agent 启动规则](AGENTS.md)
- [当前产品范围](docs/product_spec/README.md)
- [Agent 运行策略](docs/AGENT_POLICY.md)
- [工程维护规则](docs/ENGINEERING_RULES.md)
- [Harness 方法论](docs/HARNESS_ENGINEERING.md)
- [Rust 与各类界面的初始化基线](docs/RUST_CLI_TEMPLATE.md)
- [构建与发布规则](docs/RELEASE.md)
- [验证方式与证据入口](docs/VERIFICATION.md)

## 许可

本项目是专有商业软件，不是开源项目。使用、复制或分发前，请阅读[中文许可协议](LICENSE.zh-CN.md)或[英文许可协议](LICENSE.en.md)。
