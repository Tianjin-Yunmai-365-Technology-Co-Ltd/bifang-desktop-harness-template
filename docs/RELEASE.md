# 版本与发布

GUI 候选路线先读根 Cargo metadata 的 `gui-framework`，缺失时兼容 `tauri`。Tauri 配置、pnpm/前端、updater、图标及 Tauri 打包 helper 只适用于 Tauri。GPUI 使用独立 `$desktop-build-gpui-release` 的 Rust/cargo-packager 管线，原生 macOS 应用包/DMG 与 Windows x64 NSIS 可选择 `local_package`；仅 Linux 且无 CLI 时必须选择 `push_release_branch`。Git 本地主分支/tag、SemVer、当次 E2E/签名选择、真实候选与证据边界适用于两种框架；开发试包不冒充候选。

## GPUI 构建路由

GPUI 的可执行命令、固定 cargo-packager 版本、项目本地工具安装、配置字段、原生产物和资源校验，以 [`desktop-build-gpui-release`](../.agents/skills/desktop-build-gpui-release/SKILL.md) 为唯一实现来源。生成器直接接入可维护的 `packaging/gpui.json`；身份、版本与 GUI 二进制来自当前下游和 Cargo metadata。`local` 模式输出忽略的 `target/gpui-packages/` 开发试包；`candidate` 模式复核已发布的 clean 默认主分支/tag/上下文，运行完整非空 Rust workspace 测试，打包两份许可证与同字节更新日志，再形成忽略的 `release/` 原子证据集合。

不使用 Tauri frontend、插件、配置或 helper。不把 cargo-packager 的安装假设为全局能力；工具按固定版本隔离在项目 target 中。当前只支持原生 macOS 和 Windows x64，Linux 包与跨宿主路线失败关闭。签名启用时必须满足该 Skill 的实际签名/公证/验证门禁，不能降级为 unsigned 成功；关闭时明确记录原因与剩余风险。候选仍为 `pending`，须以最终字节和实际运行场景完成所选验收。

## 当前状态

- 当前版本：[`Version.md`](../Version.md) 中记录的 `202610081442`（发布状态以适用 Git 引用复核结果为准）
- 时间版本起始值：[`Version.md`](../Version.md) 中记录的 `202607301002`
- 模板版本事实来源：根目录 `Version.md`；本文件只维护版本与发布规则
- 下游 Rust 项目当前版本事实来源：根 `Cargo.toml` 的 `[workspace.package].version`；`.harness/version-state.json` 保存正式发布周期、待发布变化及稳定 ID 去重状态
- 既有下游若由 `tauri.conf.json`、`package.json` 等 JSON 文件决定安装包版本，在根 Cargo 元数据声明实际 `version-mirrors`；版本门禁检查漂移，并在提升根版本时同步声明的镜像
- Git 发布完成条件：登记分支合并到本地默认主分支，且版本 tag 创建、复读并指向最终 HEAD
- 发布后动作：完成初始化的下游按本次冻结的 `post_release_action` 本地打包或推送 `release` 分支；Harness 源按用户当次要求处理。这些动作不参与 Git 发布完成判定或下游 SemVer 周期。

## 版本规则

Harness 模板使用上海时区（`Asia/Shanghai`）的 12 位时间版本 `YYYYMMDDHHMM`：

- 只在正式发布开始并复核工作区后，由 `harness_version_clock.mjs stamp` 以当前上海时区的年月日时分直接写入 `Version.md` 作为本次版本；日常规则或代码修改不改变 Harness 版本，也不另设版本来源。
- 取号 helper 在 Git common-dir 留下受管凭证，绑定取号时刻、版本和 `Version.md` 精确字节；发布上下文写入和生命周期 `release` 在副作用前复核它，手填时间版本不能冒充正式取号。
- 12 位数字按时间先后可直接排序；不包含秒、时区后缀或预发布后缀。
- 同一分钟内如需产生第二个不同版本，必须等待下一分钟，不得追加未约定字符。
- 不为任何更早标识保留兼容记录；当前版本就是唯一版本。
- 本次正式发布取定时间版本后，必须在同一次源码/治理提交中同步根 `Version.md`、README、最新 Product Spec 与本文件的当前版本镜像，并把本次发布源码已包含的 `required_version = pending` / “所需 Harness 版本 `pending`”记录物化为该版本；发布后产生的新变化继续保持 `pending`。提交前必须运行 `node scripts/validate_harness.mjs`，任一镜像或已登记发布记录未同步都不得提交版本变化。文件中的版本是本次发布目标；只有登记分支合并到本地默认主分支、该提交的版本 tag 创建并复读成功后，才判定 `Released`。

下游产品使用无预发布/构建元数据的三段语义化版本，并由 `$desktop-manage-version` 执行以下确定性规则：

- 新生成的 Minor 与 Patch 使用 `0..99` 的 base-100 数位：Patch 从 99 再提升时进位 Minor 并归零，Minor 因功能提升或 Patch 进位越过 99 时进位 Major 并归零；例如 `0.0.99 -> 0.1.0`、`0.99.99 -> 1.0.0`。Major 不受 99/100 的业务上限约束，但必须处于 Cargo `u64` 范围 `0..18446744073709551615`；没有更高数位可承接的自动进位必须在写入前失败关闭。
- 显式 Major 只由用户决定是否提升及精确目标值。批准后写为 `N.0.0`，必须高于当前版本规范化后的 Major，并把该正式发布周期的首功能提升视为已经包含；Agent 不得推断。base-100 数值进位自然产生更高 Major 是自动版本计算的例外，不需要也不代表显式 Major 批准。
- 上一发布周期完成并确认 tag 后，新改动先判断是否疑似新需求；疑似新需求优先分类为 `feature`，完成实现并通过本次相关测试后按本周期功能规则计算版本，确认不属于新需求才考虑 `bug-fix`/Patch。每个正式发布周期的第一个已完成新功能把当前版本提升一个 Minor 数位并把 Patch 归零，必要时按 base-100 进位 Major；同一周期后续功能只记录其所需版本，不再因功能重复提升。只有真实正式发布成功才解锁下一周期的首次功能提升。
- 每个具有新稳定 ID 的已完成问题修复或用户可感知优化统一使用机器分类 `bug-fix`，把 Patch 提升一个数位并按 base-100 自动进位；这一路径不受当前周期的功能提升锁影响。相同 ID 的重复处理、补充修改或重试不再提升；正式发布后确认的回归必须分配新的稳定 ID，才可提升。
- 同一事件或权威记录出现经确认的矛盾时，使用稳定纠错 ID 和两端证据进入 `record-reconciliation`；本发布周期首次纠错统一提升 Minor 并将 Patch 归零，不受功能锁影响。相同 ID 与证据跨周期重试不重复提升；证据不同或未经确认即失败关闭。记录修正和相应验证须在下一次真实下游升级中完成，Harness 只提供并验证这条门禁。
- 查询、诊断、复现、未完成或重复处理，以及不改变可观察行为的重构、内部优化、测试补强、文档、格式和内部清理属于 `maintenance`，不提升任何版本；`check`、`plan` 和 `maintenance` 始终零写入。
- 较早变化记录的最低 `required_version` 低于最终发布版本是合法历史，不算记录不一致；同一事件、Cargo/周期状态或 Git 发布事实互相矛盾才属于需要调查的真实冲突。
- Minor/Patch 固定为 `0..99`，不兼容任何历史下位分量 `100`；Cargo、状态 `target_version` 或 `last_release` 中任一出现 `100` 都由 `check`、`plan`、`apply` 与 `finalize-release` 一致拒绝，发布日志 `release-notes.json` 中的 `100` 由更新日志 helper 与 `release` 的最终日志核对拒绝，没有可读取的旧值例外，必须先手动修正到 `0..99` 才能继续。
- 版本只在合格变化已完成且本次相关测试通过后更新；普通构建、`pending` 候选、验收和失败发布只核对版本，不计算、不提升、不重置。
- 只有 Git 发布真实成功后，在下一开发分支调用 `finalize-release` 复核默认主分支和 tag 后，才清空待发布变化并开启下一功能周期；本次发布后本地打包或远端推送尚未执行、失败或待复核，都不阻断该复位，也不另切分功能周期。历史 `bug-fix` 与纠错稳定 ID 始终保留，以阻止同一 ID 在未来周期重复提升。

版本变化与 Changelog 写入是独立门禁。Product Spec、ADR、Changelog 或 Work Plan 只有按自身事件独立触发时，才记录相关稳定 `change_id` 及门禁返回的 `required_version`。版本提升不为普通缺陷修复、纯重构或其他排除项创建 Changelog/ADR；较早变化记录的是其最低所需版本，最终发布版本可以因后续合格变化更高。真实记录冲突须先收集证据并确认，下一次下游升级时统一 Minor、修正记录、运行适用验证并完成 Git 发布；不能把低于最终版本的历史 `required_version` 当作冲突。

已发布版本不得静默覆盖。Harness 时间版本只在正式发布时按当前上海时区 `YYYYMMDDHHMM` 确定；下游除显式 Major 以外的合格版本变化由上述门禁自动确定。版本门禁本身不执行发布；正式发布生命周期使用本次确定的版本创建规定的 Git tag。

## Git 发布生命周期与制品目录

项目根忽略的制品目录 `release/` 不是 Git 分支。新功能和独立 Bug 修复在首次写入前由 `$desktop-manage-git-lifecycle start` 自动创建本地 `feature-{ascii-kebab摘要}-{YYYYMMDD}` 分支；创建动作不要求远端。生命周期状态位于 Git common dir 的 `agent-first-harness/git-lifecycle.json`，schema v4 精确登记受管分支、Worktree、未完成操作、最近一次发布的版本/tag/最终 HEAD/默认主分支/冻结发布后动作及发布后保留的资源清单。合法且静止的 v2/v3 状态可安全迁移；有未完成远端发布或推送的旧状态失败关闭。状态不进入提交。

发布前用户明确要求“推送”时，`publish` 保留原有开发分支合并与推送语义：解析唯一主远端及动态默认分支，普通合并登记分支，推送并复读；只有用户逐一指定补充远端时才使用 `--also-remote <name>`。首个 push 前冻结最终 HEAD、目标和顺序，逐项复读并保存进度；补充远端不改绑主远端。该命令不创建版本 tag，也不完成 Git 发布。

跨远端推送不是原子操作；后续目标失败时必须如实说明可能已经成功的前序范围、当前失败目标或阶段，以及后续目标可能尚未尝试，不能回滚或掩盖已经成功的远端。使用相同目标参数幂等重试时，只沿用 `pendingPublish` 中的冻结 HEAD 与进度，不重新解析默认分支、fetch、merge 或计算新 HEAD；已确认目标漂移会停止。push 非零退出只表示结果无法确认，除非远端复读已精确命中冻结 HEAD。流程不创建/配置远端或凭据。

用户明确说“发布”时，`$desktop-prepare-release` 复核本次源码、测试和必要记录，提交源码/治理变化及已触发 Changelog，冻结 `sourceHead`。在当前 HEAD 仍等于该值时生成双语 `release-notes.json` 与 `.harness/release-context.json`，把且只把这两个文件作为发布元数据提交。上下文固定 `sourceHead`、版本、上海日期、预期 tag、默认主分支和审查结论；`release` 必须传入精确 `--release-context-sha256 <sha256>`，并在任何 Git 副作用前校验调用 Worktree 中的文件字节与提交 blob。整合得到最终 HEAD 后、创建 tag 前再次校验上下文 blob 和版本事实：Harness 的 `Version.md` 须匹配受管取号凭证，下游 Cargo 与受保护周期目标须匹配上下文版本，防止后继分支覆盖已冻结版本。

`release --version <version> --date YYYYMMDD --release-context-sha256 <sha256>` 普通合并全部登记分支到本地默认主分支，冻结最终 HEAD，创建或复用 `v{version}-{YYYYMMDD}`，并复读 tag 与主分支 HEAD。两者一致即完成 Git 发布。全过程不 fetch、push、打包或删除登记分支和 Worktree；登记资源保留以便用户决定后续处理。同名 tag 指向其他提交、脏工作区、缺失分支、合并冲突或上下文漂移都会失败关闭；重试必须沿用同一上下文及最终 HEAD。

完成初始化的下游在 Git 发布开始前读取已确认的 `docs/AGENT_POLICY.md` 中 `post_release_action`，将当次值冻结在 Git common-dir 生命周期记录；发布后只消费该次冻结值，切换仅影响后续发布。旧发布没有冻结值时不得用升级后的新偏好补推或补打包。`local_package` 沿用适用的本地打包 Skill 及其当次 E2E、签名和产物门禁；`push_release_branch` 另行使用 `push-release --remote <name>`，把上次已发布的同一 HEAD 放到本地小写 `release` 分支，再非强制推到远端 advertised 默认主分支、同名 release 分支并推送同一 tag，逐项复读确认。只有一个已配置远端时可直接选择，多个远端须先明确目标；不创建远端或凭据。后续路径失败不撤销本地 Git 发布，但不得宣称发布后流程完成，也不重新 fetch、merge、计算 HEAD。Harness 源的待确认模板值不阻断自身 Git 发布；用户当次授权推送后，`push-release --remote <name>` 须从已发布提交核对 Harness 身份，再执行相同的分支和 tag 安全复读。流程允许普通 merge commit，不设置保护分支、严格线性、active leaf、单写入者、fast-forward-only、lease 或 atomic push。

发布上下文记录的本地默认主分支与远端 `release` 分支职责不同；后续远程候选分别验证本地主分支/tag 与远端 `release` 分支/tag，均须指向同一已发布 HEAD。远端 advertised 默认分支也必须与同一已发布 HEAD 一致。

本次 `reviewSelection: enabled` 时，`sourceHead` 必须包含所有登记分支的当前 HEAD；未纳入的分支先在本地普通整合并重新审查。生命周期合并后还须证明最终 HEAD 相对 `sourceHead` 仅改变被冻结的 `release-notes.json` 与 `.harness/release-context.json`，拒绝审查后新合入的源码或冲突解决差异。审查关闭且无强制要求时，仍以实际合并、tag 和版本事实复核决定 Git 发布。

启用审查的 `scopeDiffSha256` 是 `scopeBase..sourceHead` 固定 Git binary diff 原始字节的 SHA-256，写入发布上下文、本地复核、生命周期发布和远端候选捕获时复算；`scopeBase` 必须是 `sourceHead` 的祖先。具体字节参数由 `release_context.mjs verifyReviewScope` 固定，不能以任意 64 位十六进制文本代替审查范围证据。

## 用户可见版本与更新日志

- Windows 原生本地安装试包不是发布候选，不进入本文件的更新日志、clean HEAD、manifest、E2E、签名或 `release/` 门禁。普通“构建/打包/首次安装试一下”由 `$desktop-build-tauri-local-install` 处理；只有用户明确要求发布候选或准备发布，才适用下列规则。该试包仍须明确标注未签名、未安装、未验收且不可分发。
- Harness 源正式发布同样使用根 `release-notes.json` 记录最近 10 个实际发布模板版本的双语维护摘要，但它只是源码发布元数据，不是产品资源、候选 manifest 或产品验收证据。
- 所有面向用户显示的版本号统一使用且只使用一个小写 `v` 前缀，包括 GUI 页面、窗口标题、更新状态、强更提示、CLI `--version`、发布记录和更新日志。Cargo、`.harness/version-state.json`、候选 manifest 的机器版本字段、协议比较值和 SemVer 运算继续保存不带 `v` 的原始版本；展示边界负责先移除已有任意 `v`/`V` 前缀，再规范化为 `v<version>`。
- 下游在准备首个正式发布时创建根 `release-notes.json`。它是发布制品固定携带的用户更新日志事实；`about_page = enabled` 时 Tauri 通过固定 `load_release_notes` 窄命令复用，GPUI 由构建 helper 校验后编译嵌入同字节日志与双语条目，在原生关于页按 locale 展示，窗口线程不读文件，使用整数 `schemaVersion: 2` 与非空、按最新在前的 `releases` 数组；每项字段固定为 `releaseDate`、带一个 `v` 的 `version`、`featureOptimizations` 和 `bugFixes`。两个分类中的每个逻辑条目都是键恰好为 `zh-CN` 与 `en-US` 的翻译对，两个值都必须是非空、无首尾空白且无边界 BOM 的字符串；任一翻译缺失或重复 JSON 字段都阻断。只读 `check` 必须拒绝需静默规范化的原文件，写入和读取均拒绝超过 1 MiB 的 UTF-8 资源，与关于页运行时上限一致。Tauri GUI 初始化预置但不在调试构建使用 `src-tauri/tauri.release.conf.json`；正式候选构建显式 `--config` 合并该文件，把根日志唯一映射为候选逻辑资源 `release-notes.json`。
- 每次正式发布时，必须找到上一次真实正式发布的版本与 40 位源码提交；从该提交之后到当前发布源码的真实差异中语义筛选最重要内容，不得直接倾倒提交标题。首个正式发布以仓库起点到当前发布源码为范围。每版“功能优化”和“问题修复”各自最多 10 个逻辑条目，两类合计至少一条；每个条目同时提供中文与英文。Agent 可先整理其中一种语言并自动翻译另一种，但在写入前必须并排复核两种语言的语义对应关系。普通缺陷修复即使不触发按日 Changelog，也进入本次“问题修复”。终端下游随后把同一日志写入产品候选；Harness 源只把它作为 Git 源码发布元数据。
- 更新当前版本时先替换同版本条目，再置顶并截断为包含当前发布版本在内的最近 10 个实际发布版本条目；按已有发布记录取舍，不按 SemVer 数值补齐跳过的版本。使用 `$desktop-prepare-release` 携带的 Node 标准库脚本执行 `node .agents/skills/desktop-prepare-release/scripts/release_notes.mjs upsert ...`，通过配对的 `--feature-optimization-zh-cn`/`--feature-optimization-en-us` 与 `--bug-fix-zh-cn`/`--bug-fix-en-us` 按出现顺序传入每个翻译对，再运行更新日志脚本的 `check --expected-version` 校验，并分别运行 `render --locale zh-CN` 与 `render --locale en-US` 复核可见结果。文件是普通非符号链接 UTF-8 JSON，由脚本在同目录原子替换；Harness 升级将其视为 `protected`。
- 发布脚本的 `render` 命令按 locale 使用以下两套固定纯文本结构，供发布前复核；版本必须已经规范化为一个 `v` 前缀，空分类分别显示“无”或“None”，不得制造虚假条目。GUI 使用普通本地化标题；Tauri 以安全 Markdown 展示每条正文，GPUI 使用编译期静态原生文本且不执行 HTML 或加载远程媒体；当前语言以 `zh` 开头时选择 `zh-CN`，其他或未知语言回退 `en-US`——`release-notes.json` 目前只提供这两套翻译，`zh-TW`/`zh-HK`/`zh-Hant` 等其他中文变体按设计并入 `zh-CN` 内容而非另行回退英文，此为当前双语范围下的既定简化，不是未定义行为：

```text
-----------更新日志 {发布日期} {发布版本}----------

###功能优化

{不超过 10 条最重要优化内容}

###问题修复

{不超过 10 条最重要修复内容}
```

```text
-----------Release notes {release date} {release version}----------

###Feature optimizations

{up to 10 most important improvements}

###Bug fixes

{up to 10 most important fixes}
```

- `release-notes.json` 与 `docs/changelog/` 职责独立：前者是每次正式发布都必须更新的最近 10 个实际发布版本双语摘要；终端下游还把它用于产品展示/打包，Harness 源只把它作为源码发布元数据。后者仍只记录其事件规则允许的按日项目变化。更新日志一旦变化就必须重新提交；终端下游的候选字节也随之变化，必须重新构建并验收，不能在候选 `accepted` 后原地修改；Harness 源则重新复核 Git 源码发布，不创建虚假候选。

## 发布物命名

Harness Git 发布完成后询问用户是否继续生成源码归档；只有用户另行明确要求时才沿用现有方式生成。归档不参与 `Released` 判定，命名使用：

`agent-first-harness-template-vYYYYMMDDHHMM.扩展名`

下游可执行产品在确定产品名和平台后使用：

`产品名-vMAJOR.MINOR.PATCH-平台-架构.扩展名`

Harness 源码归档在用户另行要求生成时，只创建相邻 `<artifact>.sha256` 并核对来源提交、摘要与两份根许可证，不创建产品 manifest。终端下游实际生成产品归档或安装包时同时生成相邻 `.sha256` 和 manifest。`pending` 产品候选清单至少包含项目、版本、已发布的 40 位源码提交、预期 Git tag、发布上下文 SHA-256、明确的构建/运行身份、构建模式、平台、架构、目标、宿主、产物名、SHA-256、全量单元测试结果、当前 `e2eSelection`、`reviewSelection`/`reviewStatus`、`releaseNotesVersion`/`releaseNotesSha256`/`releaseNotesPath`、签名选择与证据及 `milestoneAcceptance: pending`。跨平台 provider 只在远端 `release` 分支/tag 与本地已发布 HEAD 一致后使用。审查启用时须有绑定上下文与源码 HEAD 的结构化证据；关闭且无硬要求时须记录非空原因和风险且不附审查证据。Tauri GUI 清单还记录 `updaterEnabled`、实际 updater plugin/Tauri 版本；启用 updater 时须有安全配置和实际验签证据。macOS 安装包另记录 `macosSigningSelection`/`macosSigningSource`；仅已批准配置、本次主动要求或渠道硬要求可启用签名，不因本机恰好存在身份、工具或凭据自行启用。

候选构建在清理目录、测试或编译前，以及写 manifest 前，均须只读校验 `.harness/release-context.json` 与本地默认主分支/tag。两次读取的文件 SHA-256、`sourceCommit`、`expectedTag` 和 `releaseReview` 必须一致；manifest 的审查证据或 `Not run` 原因/风险从上下文原样复制。E2E 和适用签名选择在现有构建动作中解析并写入候选证据；使用远程 provider 时另复核已推送的远端 `release` 分支/tag。

## 许可证与第三方声明

- Harness 源码归档必须包含根目录 `LICENSE.zh-CN.md` 与 `LICENSE.en.md`。
- 每个下游源码归档、安装包或其他分发物必须以适合其载体且用户可访问的方式携带两份企业专有商业许可证；两份许可证的适用项目名必须等于当前发布产品名，不得残留 Harness 身份，也不得因改名、打包、签名或商店分发而删除、摘要或弱化其他条款。
- 实际分发前必须生成并核对该版本的第三方依赖许可证与 NOTICE 清单。本项目的专有商业许可不替代、覆盖或限制第三方许可证依法授予的权利。
- 商业合同或订单负责确定客户、费用、期限、授权数量和特殊授权；发布物中的通用许可证不得被误报为双方已经签署的商业文件。

所有下游构建结果统一写入项目根忽略的 `release/`，它是本次构建结果目录而非历史归档或 `ready` 标志。每次构建先验证独立 Git 根，拒绝目录重解析和路径越界，原子隔离旧目录并创建全新空目录；最终文件、摘要与 manifest 先在同根暂存区验证，再以目录级原子重命名提交。远程工作流必须先证明用户已另行推送同一已发布 HEAD 和 tag，检出并复核显式批准的 40 位提交，且只上传 manifest 声明的精确文件；本机构建无需远端。结果取回不得混入其他项目、旧版本、旧运行、未完成、重复、额外或来源不明文件。manifest 状态仅用 `pending`、`rejected`、`accepted`；`ready` 是纯只读就绪结论。

构建请求、执行、重试、测试结果、产物路径/摘要/签名状态，以及候选 E2E、完整验收和就绪复核，均只进入忽略的 `release/` 原子证据及最终回复，不自动写入 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification。Git 发布已在合并主分支并创建 tag 时结束；下一开发分支须以该主分支/tag 的精确版本和 40 位 HEAD 调用 `finalize-release`，恢复版本周期。真实渠道分发或独立回顾审计可按其独立触发条件追加记录，但不得反向批准活动候选。

发布审查启用时，manifest 另记录 `reviewedSourceCommit`，并要求它逐字段复制 `.harness/release-context.json` 的 `releaseReview.reviewedSourceCommit`，且该值等于上下文 `sourceHead`；最终构建 HEAD/manifest `sourceCommit` 是发布元数据提交和普通合并完成后由主分支与 tag 指向的候选提交，两者不要求相等，但已审查 `sourceHead` 必须是最终提交的祖先；启用审查时最终提交相对它只能改变被冻结的两份发布元数据，不要求线性历史。关闭审查时 `reviewedSourceCommit` 与 `reviewEvidence` 一并缺席。发布上下文保存审查选择、结果和可复算的范围摘要，后续候选只读复核这些事实。

## Git 发布后构建与完整验收

Git 发布在本地默认主分支和版本 tag 指向同一最终 HEAD 时结束。发布本身不打包、构建或推送；完成初始化的下游随后必须按 `post_release_action` 完成被选中的本地打包或远端 `release` 分支推送并检测实际结果。Harness 源的后续动作仍由用户当次决定。完整候选验收与渠道分发仍各自承担门禁与证据。

1. 发布准备先判定 Harness 源或终端下游，复核工作树、范围、疑似秘密和提交完整性。提交源码及已触发记录并冻结 `sourceHead`；按当次 `reviewSelection` 对累计差异执行审查或记录 `Not run` 原因与风险。Harness 版本此时从当前上海时区分钟直接取值。
2. 生成并复核双语 `release-notes.json` 与仅含 Git 发布身份和审查结论的 `.harness/release-context.json`，只提交这两份发布元数据。生命周期以精确上下文 SHA-256 普通合并登记分支至本地默认主分支，创建并复读版本 tag；最终主分支、tag 和上下文一致即完成 Git 发布。
3. 完成初始化的下游读取本次发布冻结的 `postReleaseAction` 并执行所选后续路径。`local_package` 从 clean 且带已发布 tag 的默认主分支进入原有本地打包 Skill；该次构建单独解析 E2E 和 GUI 签名选择，运行全部非空单元测试，并把选择、构建事实和产物写入忽略的 `release/`。`push_release_branch` 推送并复读远端默认主分支、`release` 分支和 tag，三者必须等于同一已发布 HEAD。缺失选择或任何检查失败时报告 Git 发布事实和后续路径阻断。Harness 源按当次用户要求处理源码归档或远端动作。
4. 候选使用相同更新日志并逐字节比较。macOS 默认 unsigned；已批准配置、当前请求或渠道硬要求才启用签名、公证和 stapling。`system_notification = enabled` 与 unsigned 冲突须在构建前阻断。任何路径不得自动创建、索取或输出凭据。
5. `$desktop-verify-delivery` 在准入和最终状态写入前两次只读核对 clean 默认主分支、tag、发布上下文和全部 manifest；远程候选另外复核远端 refs。按冒烟、当前 E2E 选择和产品/渠道硬要求验收，并重新计算最终产物及证据的字节。只有全部通过，才原子地把整组 manifest 从 `pending` 变为 `accepted`。
6. 就绪复核只读检查 `accepted` 集合、Git 引用、版本、更新日志、最终哈希和签名，不改写 manifest 或 tracked 项目记忆。后续渠道分发按用户独立要求执行；渠道处理若改变候选字节，须重新构建和验收。

## Harness 模板发布检查清单

本清单只在用户明确准备 Harness 发布时执行。日常开发只运行本次必要的单元或回归测试。正式源码发布复核累计差异、必要测试、发布上下文和本地 Git 引用；推送与打包须另行请求。

模板自身无应用代码，不使用下游的编译、单元测试、CLI 和二进制冒烟门槛。模板发布必须满足：

- [ ] 产品规格状态为 Approved。
- [ ] README、AGENTS、所有已触发的项目记忆文档和全部声明的项目 Skills 完整存在。
- [ ] `node scripts/validate_harness.mjs` 成功，且输出对应当前发布源码；当次 `reviewSelection: enabled` 时另执行 `node scripts/validate_harness.mjs --release-review` 并处理其集中提示，关闭时不得把提示伪装为已运行。
- [ ] 发布元数据写入前，当前 HEAD 精确等于包含全部源码/治理变化及已触发 Changelog 的 `sourceHead`；`releaseReview.reviewedSourceCommit` 绑定该 `sourceHead`。随后同一个精确发布元数据提交且只包含 `release-notes.json` 与 `.harness/release-context.json`。
- [ ] 生命周期完成后再次复算发布上下文字节与 SHA-256；最终 `sourceCommit`、clean 默认主分支和本地 `expectedTag` 一致。`sourceHead` 是元数据提交前的审查输入，不要求等于 `sourceCommit`。
- [ ] Rust 初始化中性资产通过当前系统的格式、代码规范检查和非空测试；它是脚手架资产而非产品候选，不用冒烟证明产品交付。
- [ ] Rust 初始化中性资产在声明的最低 Rust 版本 1.98.1 上完成可用工具链验证；这不限制开发或运行环境使用更高稳定版。
- [ ] 候选工作流示例通过静态检查；仅在远端 `release` 分支/tag 已精确复核时，才能只读检出批准的提交并形成远程候选。工作流不修改 ref、创建 tag 或执行渠道分发。
- [ ] Harness 时间版本、下游自动版本 Skill/状态保护、Rust 默认值、四类独立适配器、默认 CLI、Agent 策略、构建 E2E 选择和验收适用性在事实来源中一致。
- [ ] Harness 源发布未冒充产品候选：产品构建、`release/` manifest、签名、公证、产品 E2E 与产品人工验收均为 `Not applicable`；Git 发布后的源码归档或远端推送只按用户当次要求进入并单独复核。
- [ ] 若本次源码发布包含符合 Changelog 规则的变化，`Version.md` 与对应按日记录的版本一致；仅含排除项时不制造空记录。本地 tag `v{版本}-{YYYYMMDD}` 精确指向最终 `sourceCommit`。
- [ ] 若本次源码发布包含符合 Changelog 规则的变化，`docs/changelog/` 的日期文件中存在对应版本条目；仅含普通缺陷修复或纯重构时本项为 `Not applicable`，且未制造空记录。
- [ ] README 包含真实用途、维护状态和反馈入口。
- [ ] 若生成源码归档，其来源提交和 SHA-256 已记录。
- [ ] 已知重要问题已在 `docs/TECH_DEBT.md` 中公开。

Harness 根目录没有具体产品，因此下游产物、manifest、签名、公证、产品 E2E 与产品人工验收门槛不适用于模板源码发布，也不得为满足清单而创建虚假 `release/` 候选。Skill 中的 Rust 中性资产有独立的格式、代码规范检查和非空测试门槛，但不得把脚手架构建或启动冒烟当作产品验收。模板未来在根目录加入可执行产品时，应重新通过范围闸门并定义真实候选验收。

## 下游项目发布检查清单

本清单只接受已通过完整验收的真实候选。日常开发只运行本次必要单元测试；显式构建运行项目全部非空单元测试，E2E 只在最终候选形成后按当前选择执行。

- [ ] 项目根是独立 Git 顶层目录，工作树干净，当前发布源码已有 40 位提交；manifest `sourceCommit` 精确等于实际构建 HEAD，父仓库、尚无提交或未记录修改不得替代发布源码身份。
- [ ] 构建 HEAD 位于上下文默认主分支，本地 `v{版本}-{YYYYMMDD}` 等于 manifest `sourceCommit`；远程 provider 另要求远端 `release` 分支与 tag 同时等于该 HEAD。发布流程不清理登记分支或 Worktree，也不按前缀扫描链外资源。
- [ ] 产品规格状态为 Approved。
- [ ] 中性 `scaffold status` 已由获批的真实业务命令和测试删除或替换，不再返回 `productDefinitionRequired=true`。
- [ ] 不存在已知未实现逻辑或未修复行为偏差；若用户要求的活动 Work Plan 存在，相关 Todo 全部为 `done`。
- [ ] 候选是完整、可运行、符合批准场景的真实产物，不是模拟实现、测试替身、占位、脚手架或开发预览。
- [ ] 当前构建的编译、项目全部非空单元测试、必要集成/契约和产物存在性均有通过证据。
- [ ] 单元测试覆盖核心成功路径和最高风险失败路径。
- [ ] 若选择 CLI，其统一 JSON 信封、错误结构、输出流和退出码契约验证通过；未选择时明确为不适用。
- [ ] Windows、macOS、Linux 各平台的实际验证状态已公开；未运行的平台明确标记为 `Unverified`。
- [ ] 适用的人类最终复核身份、日期和结论已绑定当前候选字节写入 `release/` 声明证据；候选阶段未写 tracked `docs/verification/human_review.md`。
- [ ] `$desktop-manage-version check --phase release` 通过，根 Cargo、`.harness/version-state.json` 目标、候选 manifest 与软件显示一致；本检查没有提升版本、重置周期或把候选版本回写到 tracked 项目记忆，既有项目记忆仍只遵循各自独立触发条件。
- [ ] 根 `release-notes.json` 已在候选构建前按上次正式发布提交到当前源码的差异更新；最新条目匹配当前版本，只保留包含当前版本在内的最近 10 个实际发布版本且每版两类各不超过 10 条，文件摘要和包内路径与 manifest 一致。
- [ ] 版本事实来源、软件显示、发布物名称和本地 tag 一致；用户可见版本只带一个小写 `v`，机器版本事实保持原始值。tag 精确为 `v{版本}-{YYYYMMDD}` 并指向候选 `sourceCommit`；远程候选还要求同名远端 tag 一致。
- [ ] `$desktop-rename-project-identity` 残留扫描确认发布配置、Skills、文档、维护路径和两份许可证中没有旧产品身份。
- [ ] 候选包含符合 Changelog 规则的变化时，`docs/changelog/` 的日期文件中存在对应版本条目；仅含普通缺陷修复或纯重构时本项为 `Not applicable`。
- [ ] README 包含真实的用途、使用方式、维护状态和反馈入口。
- [ ] 发布物来自目标源码提交，且其 SHA-256 已记录。
- [ ] 每个平台归档、相邻 SHA-256 和清单一致，必需平台/架构恰好出现一次。
- [ ] GUI 正式构建使用发布专用 `--config`，构建后资源与根更新日志逐字节一致；macOS 最终 DMG 内唯一 `.app/Contents/Resources/release-notes.json` 已重新比较。含 GUI 且 `about_page = enabled` 时，关于页“检查更新”旁存在元素自身绑定的“更新日志”按钮，能够经固定资源命令查看最近 10 版 schema v2 双语日志，中文/英文 locale 分别显示对应标题与正文、未知语言回退英文，加载失败可重试，且点击更新区父容器不会代理任一按钮动作；`about_page = disabled` 时页面、入口、命令、加载器与弹窗缺席，但固定 updater Rust 插件、`UpdateController` 和 `NotConfigured` 零出站基线仍存在。GUI manifest 始终记录 `updaterEnabled` 与 updater plugin/Tauri 版本；`false` 时无 updater archive/`.sig`/制品签名字段，`true` 时官方制品、配置和实际验签证据完整。
- [ ] 项目根 `release/` 已由 `$desktop-build-rust-release` 或 `$desktop-build-tauri-release` 在构建前安全刷新，并在本机构建或 `$desktop-collect-release-artifacts` 取回后只包含当前版本、源码提交和明确的构建批次候选；目录内容与清单精确一致且无历史文件。
- [ ] 每个平台清单的 `signingStatus` 与证据真实；macOS 同时记录签名选择和来源，`disabled/not-requested` 未运行可用性探测并显式 unsigned，只有 `configured`、`requested` 或 `channel-required` 才允许启用；已签名候选同时具有 `notarizationStatus: notarized-and-stapled` 和可复核证据。若 `system_notification = enabled`，本项同时拒绝 `disabled/not-requested` 或实际 unsigned，且不能由 E2E 关闭绕过。验收后若签名、公证、stapling 或重打包改变字节则已重新验收。
- [ ] macOS 多个签名启用来源同时存在时按 `channel-required > requested > configured > not-requested` 记录唯一 `macosSigningSource`；`disabled/not-requested` 的 `notarizationEvidence` 与探测派生签名证据缺席，通用 `signingEvidence` 只记录选择、来源、unsigned 结论和风险。
- [ ] macOS DMG 的最终签名/公证/stapled 字节已通过只读 Finder 布局检查；`.DS_Store`、本地背景、唯一 `.app` 与 `/Applications` 拖拽目标均真实存在，任何布局补写或重打包后已重做签名、公证、摘要和验收。
- [ ] macOS→Windows Tauri 候选只包含 x64 NSIS，清单记录 `buildMode: cross-compiled-xwin` 和 `runtimeVerification: Unverified`；未在真实 Windows 环境运行时没有声称原生验证通过。
- [ ] 完整验收根据候选冒烟策略、当前构建 E2E 选择、产品/渠道硬要求和适用性执行检查；所有 `required` 或 `enabled` 项通过，`disabled`/`Not run`/`Not applicable` 项及风险准确记录。
- [ ] 任一验收失败都曾返回开发循环并完成回归测试，没有以 `Partially verified` 代替仍缺失的批准逻辑。
- [ ] 已知重要问题已在 `docs/TECH_DEBT.md` 中向用户公开。
- [ ] 下一开发分支从已发布且带版本 tag 的本地默认主分支 HEAD 开始；在首个新改动前，以精确版本和 40 位发布 HEAD 执行 `finalize-release`，再按新需求优先规则分类并计划。候选、上传或渠道分发不重复重置版本周期。

Rust 下游项目默认使用 `docs/RUST_CLI_TEMPLATE.md` 中记录的工作区命令和候选产物布局；只有真实文件和命令存在后才能写入候选证据。Git 发布事实由默认主分支和 tag 验证，候选构建/验收事实由忽略的 `release/` 验证，渠道分发与回顾审计各按独立事件写入适用 tracked 记录。候选矩阵生成不等于渠道分发；构建请求不授权创建凭据、GitHub Release、软件包仓库发布或上传。

GUI 的本地生产构建和产物存在检查可在批准渠道允许时使用显式 `unsigned` 候选；完整验收执行启动冒烟时必须准确记录该状态。macOS 直接分发默认不签名、不公证并且不探测本机可用条件；只有已批准持久配置、本次用户主动要求或渠道硬要求时，才启用 Developer ID 签名、公证和 stapling，并且三者必须作为不可降级的完整阶段完成。App Store、Microsoft Store、要求避免 Windows SmartScreen 警告的下载渠道或 Tauri 更新器仍按各自真实渠道要求完成签名/公证/更新签名前不得宣布渠道发布就绪。Linux 普通部署不因缺少签名自动失败，除非项目批准的渠道另有要求。

## 发布记录模板

- 版本：Harness 使用 `vYYYYMMDDHHMM`；下游默认使用 `vX.Y.Z`
- 日期：YYYY-MM-DD
- 源码提交：待填写
- 发布物：待填写
- SHA-256：待填写
- 验证记录：`docs/VERIFICATION.md` 索引的对应证据卷条目
- 人工复核：复核人、日期和结论
- 已知问题：待填写
- 不适用项及理由：待填写
