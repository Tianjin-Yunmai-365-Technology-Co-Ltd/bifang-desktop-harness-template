# 毕方桌面应用Harness模版

Bifang Desktop Harness Template

这份 README 是人和 AI 共享的入口：说明模板做什么、第一次怎么创建项目、下游日常怎么用、当前名称/版本/许可，以及本仓库现在不接受哪些产品需求。Agent 的完整启动门禁和任务路由见 [`AGENTS.md`](AGENTS.md)。

一个让 AI Agent 帮你创建和维护跨平台小工具的工程模板。

你只需要告诉 Agent：项目叫什么、放在哪里，以及需要 CLI、MCP、DESKTOP 或 NSH 中的哪些程序类型。CLI/MCP/DESKTOP 默认支持 Windows、macOS、Linux 全平台；选择 NSH 后只需选择桌面、移动、Web、TUI 能力。NSH 的说明是“下一代全平台开发框架”。它会创建一个独立的 Git 项目，搭好共享核心、所选接口、开发规则和交付流程。之后你可以直接说要改什么，Agent 会完成实现并运行这次改动真正需要的测试。

选择 DESKTOP 后，Agent 会继续询问：**1. Tauri（默认）：使用Web技术开发桌面客户端；2. GPUI：高性能原生客户端**。明确选择默认值或跳过框架时使用 Tauri，未答复则等待；选择 GPUI 则建立原生 Rust/gpui-kit 界面，复用共享核心、文件组织、双语与主题规则，并使用固化的设置、关于和赞助页模板。新 GPUI 项目默认包含 Linux，因此深链接、系统托盘和 OS 全局快捷键均派生为 `unavailable`/`disabled`；已初始化且不含 Linux 的旧项目仍按其受保护平台和 profile 判断托盘与快捷键。其余九字段配置复用统一表单，配置协助只记录移交意愿，具体产品动作在终端下游根目录确认。基础依赖选型见 [GPUI依赖标准](.agents/skills/desktop-add-gpui-adapter/references/dependency-baseline.md)。DESKTOP 框架选择记录在 Cargo `gui-framework`，既有 GUI 缺失时兼容 Tauri。

GPUI 初始化通过 `$desktop-test-gpui-initialization-e2e` 执行实际 Rust 构建与本机窗口检查；独立 `$desktop-build-gpui-release` 构建原生 macOS 应用包/DMG、Windows x64 NSIS，以及 Linux GNU x64/ARM64 deb/tar.gz。这些 GPUI 目标均可选择本地打包；仅 Linux Tauri 且无 CLI 时须选择提交远程。DESKTOP 使用 Node.js/pnpm 工程工具；GPUI 在项目根提供 `pnpm dev` 保存后自动重编译并重启、验证、发布检查与原生打包脚本；开发重启会重置进程内临时状态。React/Mantine、Tauri 插件和打包 helper 仍只适用于 Tauri。

选择 NSH 后，Agent 只询问桌面、移动、Web、TUI 四类能力：桌面或 TUI 对应全部 Windows/macOS/Linux，移动对应 Android/iOS，Web 对应 Web；对应平台会在最终汇总中确认。新 NSH 工程使用 Mixed TSX 界面，通过原生模块调用共享 Rust core；桌面另生成自定义原生宿主和默认多窗口能力。TUI 走固定官方 `main` 预览源码，在对应 macOS/Windows/Linux 终端运行与测试；受管构建器可制作仅供本机验证的 TUI 预览归档，正式 0.4.0 的 CLI 无 TUI 目标，预览版也尚无官方 `nsh package --target tui` 或正式候选。仅在选择桌面时逐项询问托盘、自启、单实例和深链接，并询问关于页、赞助页与侧栏；系统通知和 OS 全局快捷键仍不可用。`$desktop-test-nsh-initialization-e2e` 检查适用初始化路径，`$desktop-build-nsh-release` 按可打包目标处理。当前 NSH 单独选择，不与 CLI、MCP 或 DESKTOP 合并；精确支持范围见 [NSH 运行时与能力](.agents/skills/desktop-add-nsh-adapter/references/runtime-and-capabilities.md)。

这个仓库不是一款可以直接安装的应用，也不包含任何具体产品的业务代码。它更像一套已经整理好的“开工方式”，适合用 AI Agent 持续开发专有、可商业化的小工具。

## AI Agent 快速入口

如果你是第一次访问本仓库，请把它识别为 **Harness 源**，而不是待实现业务的产品仓库。根目录同时存在 [`Version.md`](Version.md) 和活动的 [`desktop-instantiate-project`](.agents/skills/desktop-instantiate-project/SKILL.md) 时，创建下游项目的唯一入口是 `$desktop-instantiate-project`。

创建各阶段的入口与产物见 [终端下游创建流程](docs/PROJECT_CREATION.md)；表单和执行门禁仍以对应 Skill 为准。

按以下顺序执行：

1. 先完整读取 [`AGENTS.md`](AGENTS.md)，再完整读取 [`desktop-instantiate-project/SKILL.md`](.agents/skills/desktop-instantiate-project/SKILL.md) 与它指定的 [`initialization-form.md`](.agents/skills/desktop-instantiate-project/references/initialization-form.md)；后续只按这些入口渐进读取精确命中的事实源和 Skills。
2. 按固定顺序逐项询问尚未确定的基础字段：中文展示名、英文展示名（至少一个由用户提供，另一个可自动翻译）、ASCII `snake_case` 项目标识、项目路径、负责人和程序类型（CLI / MCP / DESKTOP / NSH；明确默认或跳过才使用 CLI）。每轮只问一个字段，已有合法答案不重问；程序类型与 NSH 能力可多选，优先通过复选控件点击并确认，宿主仅支持单选时逐项点击选择/不选择并确认集合。CLI、MCP 可组合，也可与 DESKTOP 组合；NSH 单选。程序类型确定后，NSH 只问能力并派生平台，其他类型默认 Windows/macOS/Linux 全平台；DESKTOP 再按表单补充框架和桌面配置。六项 Agent 策略直接使用固定默认值，不单独询问。`post_release_action` 初始化时保持 `pending`，首次发布前再询问并记录。
3. 使用仓库提供的路径解析器确定唯一目标根目录，并把双语名称来源、最终路径、平台、程序类型、策略以及适用的 GUI 配置汇总给用户。**用户确认完整汇总前保持零写入**：不得创建目录、复制文件、安装环境或初始化 Git。
4. 确认后才验证 Harness 源、门禁 Git、按固定清单复制中性工程层、重写项目身份、安装所选接口、裁剪初始化专用入口，并在目标根建立新的独立 Git 仓库和唯一基线提交。不要复制源 `.git`、Harness 时间版本、历史 Product Spec/ADR/Changelog/Verification、远端或凭据。
5. 初始化完成后，把解析后的目标目录作为唯一项目根和 Git 顶层；切换到该目录，再用 `$desktop-define-product` 提交产品目标，用 `$desktop-implement-change` 开始开发。产品需求不得提前写入本 Harness 源或中性脚手架。

可以直接把下面这段交给另一个 AI：

```text
你当前位于 Bifang Desktop Harness Template 源仓库。请先完整读取 AGENTS.md、.agents/skills/desktop-instantiate-project/SKILL.md 及其 initialization-form.md，然后使用 $desktop-instantiate-project 创建终端下游。先收集并展示完整初始化汇总，在我确认前保持零写入；不要在 Harness 源中记录或实现产品需求。完成后返回唯一目标根、所选平台/接口、Git 门禁与独立基线提交结果，并要求我切换到下游根目录继续定义产品。
```

## 能做什么

- 从一份简短的初始化表单创建全新的项目，不需要手动复制和改名。
- GUI 统一设计从 [DESIGN.md](DESIGN.md) 进入：共用基座约束语义 Token、标准组件、样式分层及交互一致性，再叠加框架和组件标准；规范随下游创建与受管升级传播，既有项目自有设计受保护。
- 在 CLI、MCP、DESKTOP 中选择一种或多种接口，或单独选择 NSH 并指定子目标；明确选默认值或跳过时使用 CLI，漏答继续等待。
- 默认使用 Rust 2024 和共享核心，让业务规则只写一次，再由不同界面调用。
- 为日常开发、测试、版本管理、构建和发布准备好对应的自动化流程（Skills）。
- 可选地把新结果创建为绑定保存项目的 Codex 左侧 user-owned Task；自动拆分默认关闭，启用后按结果边界创建，Git Task 按 task_worktrees 选择独立 Worktree 或串行 Local，并使用可审查提交。
- 初始化固定关闭自动 Task、Task 工作树、superpowers 和内部并行，允许候选验收冒烟，并把候选 E2E 建议设为关闭；初始化后可明确调整持久能力偏好。
- 为新功能和独立 Bug 修复自动创建本地开发分支。明确“发布”时整理并提交当前代码，普通合并登记分支到本地默认主分支，创建并复读指向最终 HEAD 的 `v{版本}-{YYYYMMDD}`；Git 发布到此结束。首次发布前询问并记录发布后动作，随后按该次冻结选择执行并检测：在当前宿主按确定路由构建一个已选接口/目标的正式候选，或把同一提交放到小写 `release` 分支并同步远端默认主分支、release 与 tag。GUI 候选的真实启动和交互验证按当次 E2E 选择及硬要求执行，未真实验证的平台标为 `Unverified`。
- 把新版 Harness 的工程规则安全同步到已有项目，同时保护产品代码和本地决定。
- 使用 `$desktop-extract-technical-docs` 提取技术选型、依赖清单、项目架构、文件结构与当前技术债，以工作区根 `knowledge/README.md` 为入口，并通过 archify 生成可交互架构图；项目缺少 archify 时按需安装本地包。知识快照不随初始化复制，可在项目中按需刷新。

规则、事件记忆、Skill 引用和派生快照的关系见 [知识与规则索引](docs/README.md)。现有 `knowledge/` 内容只代表其中标明的提取日期和源码提交，不能直接当作当前 NSH 或创建流程的事实。

日常开发不会因为任务看起来复杂，就自动增加长计划、全仓检查、构建或端到端测试（E2E）。只有你明确要求，或者任务确实碰到安全、数据迁移、凭据、发布等风险时，才会进入相应流程。

## 它不会替你决定什么

- 不会猜测产品要解决什么问题，也不会把中性脚手架当成已经完成的产品。
- 不会创建或配置远端或凭据，不会强制推送、通配扫描分支、上传制品或操作生产环境。Git 发布命令不访问远端，也不删除登记的分支或 Worktree。发布后执行已确认的动作；选择提交远程时非强制同步目标远端默认主分支、小写 `release` 分支与同一 tag，并逐项及最终联合复读。发布前的普通 `publish` 仍可在你逐一授权后向多个已配置远端推送同一冻结 HEAD，它不创建 tag。
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

2. Agent 按 [唯一表单合同](.agents/skills/desktop-instantiate-project/references/initialization-form.md) 每轮只询问一个尚未确定的基础字段：中英文项目名、标识、路径、负责人和程序类型；随后 NSH 只问能力，其他类型默认 Windows/macOS/Linux 全平台。选项使用可点击控件；多选优先复选控件，不支持时逐项点击并确认集合，不要求手打选项。中英文至少提供一个，另一名称自动翻译并在汇总中确认。固定问句由 `initialization_form.mjs --catalog` 输出，其他模型也复用同一解析器。
3. 根据解析器的下一问补齐 DESKTOP 框架或 NSH 子目标、适用的桌面配置与配置协助意愿；每轮一个条件问题，明确给过的合法字段不重问。未回答不会自动采用默认值。具体产品配置在下游处理。
4. 写入前展示完整汇总与唯一目标根目录。确认绑定当前汇总；修改字段后重新确认。确认之前不生成 Logo、不安装环境、不写文件。
5. 汇总确认后才检查环境与 Git。GUI 的 Logo 在此执行阶段按固定的 `candidate-1` → `candidate-2` → `candidate-3` 顺序展示三个原始候选，选中后只验证和标准化所选项。Git：缺失时按当前平台的受管方式安装，可证明低于最低下界时自动升级，范围内版本原样复用；随后才写入脚手架。Windows 自动安装若受管理员权限、UAC 或组织策略阻断，Agent 会给出已证实缺失项的官方安装入口和诊断；用户安装并告知继续后，先在原宿主只读复探。建立独立仓库时，若作者信息缺失，会只在这个仓库静默使用设备账户名的英文形式和 `<设备账户名>@gmail.com` 补齐，不修改全局 Git 设置。完成后会返回 Git 版本、安装或升级变化、作者信息、来源、作用域和基线提交，并得到一个独立、无远端、带初始化提交的 Git 仓库。

## 下游项目日常怎么用

完成实例化并切换到终端下游根目录后，不需要记住整套流程，直接告诉 Agent 你想得到什么结果即可。例如：

- “实现这个功能”或“修复这个问题”：使用 `$desktop-implement-change` 直接开发，并运行相关测试。
- 新功能或独立 Bug 修复开始写入时：使用 `$desktop-manage-git-lifecycle` 在本地自动创建并切换到 `feature-{ASCII-kebab摘要}-{YYYYMMDD}`，名称碰撞自动追加后缀；不要求项目已经配置远端。同一结果的继续修改复用当前登记分支。
- “发布前推送开发进度”：使用 `publish` 普通合并本发布周期登记的开发分支，切换到动态默认主分支并推送；不创建 tag，也不清理登记资源。`--remote` 指定唯一主远端；只有你明确要求“也推送到某远端”时，才为该次 `publish` 增加一个可重复的 `--also-remote <name>`。所有目标会在首个 push 前解析；同一最终 HEAD、目标顺序和逐项确认进度只在未完成的 `pendingPublish` 中临时保存，成功即清除。补充远端不改绑，也不参与 release、tag 或清理。
- “先把产品范围说清楚”：使用 `$desktop-define-product` 整理目标、边界和成功标准。
- GPUI 的普通“构建/打包”：使用 `$desktop-build-gpui-release` 的 `local` 模式，生成当前工作树的开发试包；明确发布候选或 Git 发布后的本地打包才使用 `candidate` 模式。
- NSH 的普通“构建/打包”：使用 `$desktop-build-nsh-release` 的 `local` 模式，按已确认目标生成开发试包；发布候选使用 `candidate` 模式。
- Tauri 的“在 Windows 或 Linux 上打一个本地安装试包”或普通“构建/打包”：使用 `$desktop-build-tauri-local-install`；它允许基于当前工作树生成未签名 NSIS，或同架构 deb/AppImage，只供本机检查，不提交、不生成发布日志、不写 `release/`，也不询问 E2E 选择。
- “发布”：使用 `$desktop-prepare-release` 整理本次范围、按当前上海时间取得 Harness 版本（下游使用语义化版本门禁）、提交源码和发布上下文，再由 `$desktop-manage-git-lifecycle release` 合并本地默认主分支并创建、复读版本 tag。`--release-context-sha256 <sha256>` 绑定已跟踪上下文；Git 发布完成后执行并检测持久选择的后续动作。
- “提交远程”后续路径：使用 `push-release --remote <name>` 把已发布的固定 HEAD 放到本地小写 `release` 分支，依次同步远端 advertised 默认主分支、同名 release 分支和 tag，逐项及最终联合复读；即使已开始下一开发周期，也不重新合并或计算发布提交。
- “本地打包”后续路径：在已有 Git 发布完成后只对当前宿主确定的一个已选接口/目标使用 `$desktop-build-rust-release`、`$desktop-build-tauri-release`、`$desktop-build-gpui-release` 或 `$desktop-build-nsh-release`；构建入口只读消费发布上下文，在该次构建解析 E2E 和适用 macOS 签名选择。NSH 候选按目标保存在独立 `release/` 批次，其他目标另行构建与验收。跨平台远程 provider 另要求远端 `release` 分支与 tag 已复读为同一 HEAD。
- 普通“构建/打包/本地试包”不会自动升级为 Git 发布，不提交、推送或修改主分支；Git 发布后的所选动作仍单独遵守对应流程门禁。
- “完整验收这个候选”：使用 `$desktop-verify-delivery` 检查真实产物。
- “把这个项目升级到新版 Harness”：使用 `$desktop-upgrade-harness`，先预览差异再应用。
- “开启左侧 Task”/“开启自动 Task 拆分”或“关闭左侧 Task”/“关闭自动 Task 拆分”：更新 `docs/AGENT_POLICY.md` 的 `user_owned_tasks` 和确认元数据，并记录当日 ADR。默认关闭；切换只影响后续结果边界，不迁移或中断既有 Task/Worktree。

项目 `user_owned_tasks` 默认关闭；只有项目开启才自动创建左侧 Task 子树。用户明确要求单次创建可执行，但不改变永久选择。开启/关闭通过 `$desktop-configure-agent-policy` 记录字段和确认来源/日期；`task_worktrees` 单独决定 Git Task 使用 Worktree 或 Local。Task/工作树完整合同统一见 [$desktop-task-workflow](.agents/skills/desktop-task-workflow/SKILL.md)。

## 开发与构建边界

日常开发直接使用 `$desktop-implement-change`，只增加并运行本次变更需要的单元/回归测试；新功能或独立 Bug 修复首次写入前创建受管 feature 分支。Git 发布只整理并提交代码、合并本地默认主分支及创建并复读 tag。首次发布前先询问并记录 `post_release_action`，发布开始时冻结已确认选择，随后按本次快照对一个本机目标执行正式候选打包，或向远端默认主分支与 `release` 分支推送同一已发布提交及 tag，并检测所选路径；未来可用 `$desktop-switch-post-release-action` 切换，旧发布继续按旧快照。下游下一周期先从已发布主分支/tag 建新分支，并在首个新改动前调用 `finalize-release`。随后对新改动先判断是否疑似新需求：疑似新需求优先按 `feature` 提升 Minor；确认没有新需求的问题修复或用户可感知优化按新稳定 ID 的 `bug-fix` 提升 Patch；经证据确认的记录冲突使用 `record-reconciliation` 独立提升 Minor。行为保持的重构、文档和内部清理不提升版本，也不自动增加计划、全仓检查、构建、E2E 或验收。

显式候选构建只接受已有 clean 默认主分支和精确版本 tag；构建入口只读验证并消费 `.harness/release-context.json`，本次另行解析 E2E 和适用签名选择，把选择与结果写入候选证据。远程跨平台 provider 另要求远端 `release` 分支与 tag 已复读为同一已发布 HEAD。候选须运行全部非空单元测试。普通 Windows 本地安装试包是开发制品，不要求发布日志或 clean HEAD。构建事实只写入适用产物位置和最终回复，不自动更新项目记忆。普通 GUI 页面状态在当前进程跨路由保留；命中 `$mantine-list-view` 的列表页使用类型化 URL、当前标签页 sessionStorage、Query-only 行数据与本地列偏好，并按成功总页数纠正越界。按钮、链接和开关由自身处理动作，父级容器不得代理子动作。

Core-first 是强制规则：值域、跨字段关系、业务默认值和可复用状态转换进入 shared core；CLI/MCP/DESKTOP/NSH 只负责各自协议、展示和系统能力。系统托盘、窗口、通知和登录项等宿主机制留在适用 adapter，但其业务效果仍调用 core。维护者运行 `node scripts/run_harness_tests.mjs` 执行非空回归，并以 `node scripts/validate_harness.mjs` 检查 Harness 硬门禁。

依赖清单以完整三段的兼容下界为目标，Rust 验证复用已安装且满足项目下限的 stable。Harness 源和新建下游默认忽略 `Cargo.lock` 与 `pnpm-lock.yaml`；已有下游可在根 `Cargo.toml` 的 `[workspace.metadata.agent-first-harness]` 中显式设置 `dependency-lock-policy = "tracked"`，由本项目跟踪实际工作区的锁文件并使用冻结解析。缺省或 `ignored` 保持无锁门禁，其他值失败关闭；`pnpm-package.lock` 仍为非标准文件名且被忽略。新加入依赖时优先选择 registry 当前最新兼容稳定版。当前只有中性 Rust CLI fixture 的 Cargo 直接依赖已在 Rust 1.98.1 上完成最低直接版本解析、格式、Clippy 与非空测试；MCP、GUI/React 数值仍是经 registry metadata、peer 与 engine 筛选的候选，在真实下游完成正常解析、测试及适用构建前保持 `Unverified`。环境门禁当前要求 Git `>=2.36.0`、Rust 通用环境 `>=1.95.0`、所有接口组合的 Node.js `>=24.0.0`，GUI 另要求 pnpm `>=12.4.1`：已安装的更高稳定版本直接通过，只有缺失或可证明低于下界时才安装/升级。Node.js 安装选择官方当前最高 LTS 线的最新补丁；Rust 没有 LTS 通道，使用官方当前 stable。Rust/Node.js/pnpm 使用各平台标准的当前用户全局位置与 PATH，不创建 Harness 私有工具环境变量或私有全局前缀；`rustup-init` 使用 `--no-modify-path`，由门禁在完整预检后持久化标准 Cargo bin，这不改变标准安装根。非默认 Rust homes 必须能由新登录会话持久恢复，单一路径根不得夹带 PATH 分隔符，当前进程和新 shell 都必须复探。只读检查零写入并报告 `upgrade-required`；存在显式上界时高于上界仍阻断，预发布、无法解析或损坏的工具同样失败关闭。Agent 不会降低门禁、回退依赖、在项目内注入 shim 或改找替代工具链来迁就旧环境。文件与测试组织遵守 [工程维护规则](docs/ENGINEERING_RULES.md) 和 [GUI 设计标准索引](docs/design_standards/README.md)：日常只强制 Rust 800 行、前端 1000 行的硬上限，其他人工维护文本也固定为 2000 行硬上限；Rust 401–800、前端 501–1000、其他文本 501–2000 行的建议候选只在当次发布启用语义审查时集中提示。Rust 模块拆分使用 `<module>/mod.rs`。

每次正式发布使用同一份双语 `release-notes.json`；每版两类各至多 10 个翻译对，并保留包含当前发布版本在内的最近 10 个实际发布版本。用户可见版本只显示一个小写 `v`，机器字段不带前缀。

## Task 与工作树

使用 `$desktop-task-workflow` 按项目选择管理左侧 Task、独立工作树和内部并行。一个 Task 对应一个结果，必要阅读、实现、开发回归及同范围返工留在同一 Task；只有明确阶段隔离或结果边界变化才拆分。独立 Worktree 按非重叠文件所有权并行创建和执行；同一 Local cwd、短暂共享状态登记和最终整合串行。

派发已经包含范围内阅读、编辑、测试、修复和提交的授权。真实身份、工作区和基线自检通过即可继续，不额外等待人工 BOUND 批准；宿主权限不能靠 Skill 自授。序号、进度、原 Task 恢复和描述模板见统一 Skill 的按需引用，旧三个 Skill 名称保留兼容路由。

GPUI 新下游在初始化时离线安装项目本地 `$gpui-kit` 与 `$gpui-kit-design-guides`，保留固定上游 revision、文件摘要和 Apache-2.0 许可；Tauri/非 GUI 不安装。来源为 [longbridge/gpui-kit Skills](https://github.com/longbridge/gpui-kit/tree/main/skills)。

## Skills 索引

初始化与接口：`$desktop-instantiate-project`、`$desktop-initialize-rust-project`、`$desktop-check-development-environment`、`$desktop-add-cli-adapter`、`$desktop-add-file-operations`、`$desktop-add-external-process`、`$desktop-add-mcp-adapter`、`$desktop-add-gui-adapter`、`$desktop-add-gpui-adapter`、`$desktop-add-nsh-adapter`、`$desktop-add-gpui-autostart`、`$mantine-list-view`、`$desktop-add-gui-system-locale`、`$desktop-add-gui-window-state`、`$desktop-add-gui-dialog`、`$desktop-add-gui-system-tray`、`$desktop-add-gui-single-instance`、`$desktop-add-gui-deep-link`、`$desktop-add-gui-global-shortcut`、`$desktop-add-gui-system-notifications`、`$desktop-add-gui-autostart`、`$desktop-prepare-gui-app-identity`、`$desktop-prepare-gui-support-surfaces`、`$desktop-rename-project-identity`、`$desktop-extract-i18n-strings`。

开发与治理：`$desktop-extract-technical-docs`、`$desktop-manage-gpui-dependencies`、`$desktop-optimize-gpui-performance`、`$desktop-manage-dependencies`、`$desktop-review-core-boundaries`、`$desktop-record-adr`、`$desktop-handoff-project`、`$desktop-inspect-release-notes`、`$desktop-define-product`、`$desktop-plan-change`、`$desktop-implement-change`、`$desktop-refactor-code`、`$desktop-manage-version`、`$desktop-manage-git-lifecycle`、`$desktop-switch-post-release-action`、`$desktop-task-workflow`、`$desktop-manage-user-tasks`、`$desktop-manage-task-worktrees`、`$desktop-configure-agent-policy`、`$desktop-configure-git-commits`、`$desktop-run-parallel-worktrees`、`$desktop-summarize-development-history`、`$desktop-curate-harness-memory`、`$desktop-upgrade-harness`。

构建与验收：`$desktop-test-gpui-initialization-e2e`、`$desktop-test-nsh-initialization-e2e`、`$desktop-build-tauri-local-install`、`$desktop-prepare-release`、`$desktop-build-rust-release`、`$desktop-build-tauri-release`、`$desktop-build-gpui-release`、`$desktop-build-nsh-release`、`$desktop-prepare-cross-platform-release`、`$desktop-collect-release-artifacts`、`$desktop-test-gui-initialization-e2e`、`$desktop-test-final-artifact-e2e`、`$desktop-verify-delivery`。

其中 `$desktop-add-gui-*` 系列（系统语言、窗口状态、对话框、托盘、单实例、深链接、全局快捷键、通知、开机自启）与 `$mantine-list-view` 只适用于 Tauri GUI；`gui-framework = "gpui"` 的同类能力统一由 `$desktop-add-gpui-adapter` 及其 `references/native-capabilities.md` 承担。

## 规则的唯一来源

同一条规则只在一处完整表述，其余文档只放指针：版本分类、周期与 base-100 进位见 [`docs/RELEASE.md`](docs/RELEASE.md) 与 `$desktop-manage-version`；发布后动作与 Git 生命周期保证见 [`docs/AGENT_POLICY.md`](docs/AGENT_POLICY.md) 与 `$desktop-manage-git-lifecycle`；Task 编号、绑定、授权和工作树执行合同见 [`$desktop-task-workflow`](.agents/skills/desktop-task-workflow/SKILL.md)；Core-first 归属清单见 [`docs/ENGINEERING_RULES.md`](docs/ENGINEERING_RULES.md)；Git、Rust、Node.js、pnpm 下限数值见 [`docs/RUST_CLI_TEMPLATE.md`](docs/RUST_CLI_TEMPLATE.md) 的环境门禁表。`docs/TECH_DEBT.md` 只保留仍待处理的限制，已关闭条目由 Git 历史保存。

## 可以创建哪些界面

- **CLI**：适合脚本和 Agent 调用，支持非交互运行和统一 JSON 输出。
- **MCP**：提供 Rust stdio MCP 服务器，让其他 Agent 或 MCP 客户端调用共享能力。
- **DESKTOP**：Tauri（默认）使用 Tauri 2、React 和 Mantine；GPUI 使用原生 gpui-kit/Rust 与独立设置、关于和赞助模板，按选择加入五项桌面能力并遵守自含依赖标准。Tauri 路径固定接入系统语言、窗口状态和原生 dialog 基线，并可按初始化选择加入托盘、单实例、深链接、全局快捷键、系统通知、开机自启、关于页和赞助页。
- **NSH**：下一代全平台开发框架，子目标为桌面、移动、Web、TUI。选 TUI 的项目固定官方 `main` 预览提交；未选 TUI 的项目继续使用正式 v0.4.0 固定提交。TUI 在 macOS/Windows/Linux 终端运行与测试，可构建本机预览归档，官方正式 TUI 打包仍受限。现有 NSH 九项配置只属于桌面子目标。

CLI、MCP 与 DESKTOP 可以单独或组合使用；当前 NSH 独立选择。与接口无关的业务规则统一放在共享核心（shared core）中，接口只负责输入、展示和系统交互。

## 当前状态

- 维护状态：Active
- 中文名称：毕方桌面应用Harness模版
- English name: Bifang Desktop Harness Template
- 当前版本：v202611081358
- 发布状态：以适用 Git 引用复核结果为准
- 产品规格：Approved
- 具体产品源码：不包含

Harness 版本的唯一事实来源是 [`Version.md`](Version.md)：仅在正式发布时按当前上海时区取 `YYYYMMDDHHMM`，日常修改不提升。模板版本和下游产品版本分开管理。登记分支合并到本地默认主分支、该提交的 `v{版本}-{YYYYMMDD}` 创建并复读成功后才是 `Released`。终端下游的后续动作按初始化或切换时持久确认的选择执行并检测；Harness 源的后续源码归档或推送由用户当次决定。

## 项目结构

- `.agents/skills/`：创建项目、开发、测试、构建、验收和升级时使用的 Agent Skills。
- `docs/`：产品规格、工程规则、接口契约、设计标准和发布说明；按 [知识与规则索引](docs/README.md) 查找。
- `scripts/`：模板一致性与关键规则的检查工具。
- `Version.md`：Harness 模板当前时间版本的唯一事实来源；发布状态按适用 Git 引用复核。
- `AGENTS.md`：轻量启动门禁与任务路由；具体规则、门禁和 Skills 按当前任务渐进读取。
- `LICENSE.zh-CN.md` / `LICENSE.en.md`：专有商业许可；适用项目名称与本 README 的中英文名称一致。

## 进一步了解

- [当前时间版本](Version.md)
- [Agent 启动规则](AGENTS.md)
- [Skills 分类索引](.agents/skills/README.md)
- [知识与规则索引](docs/README.md)
- [终端下游创建流程](docs/PROJECT_CREATION.md)
- [当前产品范围](docs/product_spec/README.md)
- [Agent 运行策略](docs/AGENT_POLICY.md)
- [工程维护规则](docs/ENGINEERING_RULES.md)
- [Harness 方法论](docs/HARNESS_ENGINEERING.md)
- [Rust 与各类界面的初始化基线](docs/RUST_CLI_TEMPLATE.md)
- [构建与发布规则](docs/RELEASE.md)
- [验证方式与证据入口](docs/VERIFICATION.md)

## 许可

本项目是专有商业软件，不是开源项目。使用、复制或分发前，请阅读[中文许可协议](LICENSE.zh-CN.md)或[英文许可协议](LICENSE.en.md)。

客户端依赖、兼容、性能与平台打包知识按 [客户端工程索引](docs/GUI_ENGINEERING.md) 精确读取。

| 顶层类型与 DESKTOP 选项 | 说明 |
|---|---|
| Tauri（默认） | 使用Web技术开发桌面客户端 |
| GPUI | 高性能原生客户端 |
| NSH | 下一代全平台开发框架；下选桌面、移动、Web、TUI，TUI 使用官方 `main` 预览版的终端运行与测试能力 |

NSH 入口：`$desktop-add-nsh-adapter`；能力、平台、构建边界见该 Skill 的运行时引用。桌面、移动和 Web 的具体平台分别记录在 Cargo `target-platforms`，所选子目标记录在 `nsh-targets`；不把声明目标当已验证结果。
