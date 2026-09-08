---
name: desktop-prepare-release
description: 使用仓库声明的版本方案评估并准备可追溯发布。Harness 使用 Asia/Shanghai 时区的 YYYYMMDDHHMM 时间版本；除非已批准规格另有规定，下游产品使用语义化版本。
---

# 准备发布

准备发布元数据、自动形成可追溯提交、关闭活动 feature 分支链并从动态默认 `main`/`master` 的 closing commit 构建候选；用户明确提出发布时，该请求本身授权本次已完成范围的提交、活动叶 push、默认分支严格 fast-forward、状态登记 feature refs 精确清理和紧随其后的候选构建，不再追加提交或构建审批。普通构建不自动提交。该窄授权不包含配置 remote/凭据、无精确期望 OID 的 force push、标签、上传、渠道发布、历史改写或 merge commit；只允许关闭事务为精确删除登记 feature ref 使用逐 ref `--force-with-lease`，不得创建 `Release` 中转、扫描 `codex/*` 或代删链外分支。

## 工作流程

1. 读取存在时的 `Version.md`、`docs/RELEASE.md`、日期最新的 Product Spec 和验证记录。`docs/changelog/README.md` 存在时读取其规则；下游尚未触发 Changelog 时，使用 `docs/ENGINEERING_RULES.md` 的 Changelog 触发规则，不得为读取规则而预建目录、索引或日期文件。确认用户确实提出发布，并判断当前进入“候选前提交、更新日志与分支链关闭阶段”还是已有 `Milestone accepted` 候选后的“就绪复核阶段”。只有前者使用本节的自动提交、受管 push/清理与构建授权，并先调用 `$desktop-manage-git-branch-chain inspect`，要求当前是 `.harness/git-branch-chain.json` 登记的活动 feature 叶子。候选前阶段在任何提交或发布元数据写入前解析当次 `reviewSelection: enabled | disabled`：当前发布请求已经明确时直接复用；安全、隐私、不可逆操作、对外兼容契约或产品/渠道硬要求强制启用并记录来源；否则询问用户一次。含 GUI 时同轮解析 `performanceSelection: enabled | disabled` 及来源：当前请求已经明确时复用，产品/渠道硬要求强制启用，否则询问一次；关闭时同时形成公开原因和剩余风险，不含 GUI 时固定为 `not-applicable`。目标含 macOS GUI 时还在任何提交前按 `$desktop-build-tauri-release` 的同一优先级解析并锁定 `macosSigningSelection`/来源：没有批准配置、本次主动要求或渠道硬要求时默认 `disabled/not-requested`，同时形成公开原因和剩余风险且不做可用性探测；非 macOS GUI 固定为 `not-applicable`。若 macOS 同时 `system_notification = enabled` 且签名关闭，立即声明 `Not ready`，要求用户下一轮主动启用签名公证或先经产品变更关闭通知，不得先提交、关闭分支链、自动补签或用 E2E 关闭绕过。三项选择都不写入通用持久策略、不从 E2E 推断，但必须作为本次候选事实在关闭提交中封存；同一发布的修复或进程中断重跑复用原选择，新发布重新解析。
2. 应用已声明的版本方案。Harness 模板使用根 `Version.md`，根据用户在 `Asia/Shanghai` 时区作出的版本决定使用 12 位 `YYYYMMDDHHMM`；下游不得继承 Harness `Version.md`，也不重新计算 SemVer，而在就绪复核调用 `$desktop-manage-version check --phase release` 使用开发阶段已经确定的目标版本。只有 Major 的精确目标需要用户批准，Minor/Patch 不在发布准备阶段补升。所有用户可见版本规范化为且只规范化为一个小写 `v`；Cargo、状态和 manifest 的机器版本字段保持原始值。

### 候选前本地提交与更新日志阶段

3. 要求独立 Git 顶层目录、可解析的当前 `HEAD` 和活动 `feature-{ascii-kebab摘要}-{YYYYMMDD}` 叶子；初始化中尚未生成的 `HEAD`、动态默认主分支、`main`、`master`、detached HEAD 或状态文件未登记的分支都不具备候选前提交边界，必须声明 `Not ready`。先运行只读检查，并逐项查看 staged、unstaged、untracked 内容及真实 diff；检查结果中的 `branch` 与 `head` 都进入 `statusSha256`，复核后切分支或移动 HEAD 必须重新检查：

   ```text
   python3 .agents/skills/desktop-prepare-release/scripts/release_git.py inspect --project-root .
   ```

   只把已完成、范围明确且属于本次发布的源码/测试/版本/适用项目记录纳入第一个提交；此时 `release-notes.json` 必须未改动。这里的逐路径检查是提交范围与秘密防护硬门禁，不等于可关闭的语义审查。存在归属歧义、半成品、无法解释的 staged 内容、秘密/令牌/凭据/个人数据、临时调试、缓存或不应跟踪的生成物时立即停止并询问用户，不得猜测、隐藏或自动提交。不得把“明确发布”扩张为提交不明确或敏感内容。
4. 紧邻真实提交调用 `$desktop-configure-git-commits`：报告并检查有效身份，只在字段缺失时传入 Agent 已翻译/归一化的单一 ASCII 英文设备 username，由该 Skill 确定派生同名 Gmail 并只写仓库 local；安装并检查仓库模板。已有有效身份保持不变，绝不得写 global/system。然后重新运行 `release_git.py inspect` 获取绑定分支与 HEAD 的最新 `statusSha256`，把所有且仅有已复核源码路径作为重复 `--path` 传入：

   ```text
   python3 .agents/skills/desktop-prepare-release/scripts/release_git.py commit --project-root . --expected-status-sha256 <sha256-from-inspect> --message "<reviewed Conventional Commit message>" --path <reviewed-path> [--path <reviewed-path> ...]
   ```

   明确发布请求已经授权此提交，不再询问第二次审批。脚本使用 literal pathspec，只允许完整工作树范围，正常运行 hooks 且绝不传 `--no-verify`；状态在检查后变化、路径越界、暂存区夹带、范围不完整、身份/模板/签名错误、hook 或 `git commit` 失败都必须停止。工作树原本 clean 时不创建空源码提交，直接把现有 `HEAD` 作为源码提交。源码提交完成后必须 clean，再调用 `$desktop-manage-git-branch-chain publish`，只有远端叶子复读精确等于新的 40 位 `sourceHead` 才继续。
5. 在生成发布日志和关闭链前落实当次发布审查选择，并在内存中形成稍后原样封存的显式结构化信封。`reviewSelection: enabled` 时，以状态文件冻结的 `baseOid..sourceHead` 为唯一累计范围，集中审查行为正确性、core/adapter 边界、对外契约、职责/规模候选和审查器识别的未清理临时标记；Harness 源同时运行 `python3 -B scripts/validate_harness.py --release-review`。审查证据必须明确给出 `reviewStatus: passed`、基线、`sourceHead`、`reviewedSourceCommit = sourceHead`、上述五项完成声明、无秘密的单行证据摘要和结论；发现问题不得形成 `passed`，而要返回当前活动叶子修正、测试、提交、publish 后重新执行本步骤。`reviewSelection: disabled` 且无硬要求时不执行这些非必要语义检查，显式形成 `reviewStatus: Not run`、非空公开 `reviewReason` 与 `reviewRemainingRisk`，并禁止生成 `reviewEvidence`、完成声明或 `reviewedSourceCommit`。任何选择都不能关闭提交范围/秘密、必要测试、clean、祖先关系、OID、签名或渠道门禁。
6. 从正式发布状态、标签及匹配 Verification 中找到上一次真实发布的版本和 40 位源码提交，并以它到 `sourceHead` 为比较范围；不得把 `pending`/`accepted` 候选、标签创建尝试或目录修改时间当作正式发布。首个正式发布没有上次提交时，以仓库起点到 `sourceHead` 为比较范围；如果历史证据冲突或无法界定比较范围，声明 `Not ready` 并停止，绝不猜测。
7. 根据上次正式发布提交之后到 `sourceHead` 的真实差异、已完成行为、适用按日 Changelog 和缺陷事实，整理最重要的用户可见内容；这是生成必要发布元数据，不因 `reviewSelection: disabled` 而跳过，也不得借机扩张成通用代码审查。不得直接倾倒提交标题、内部重构或构建流水账。当前版本固定使用两类：`功能优化` 不超过 10 个逻辑条目，`问题修复` 不超过 10 个逻辑条目，两类合计至少一条。每个逻辑条目必须同时形成非空 `zh-CN` 和 `en-US` 文案；若只先整理一种语言，Agent 自动翻译另一种，并在写入前并排核对：两侧指向同一处代码事实、条目数量和顺序一致、无一侧遗漏或凭空新增要点、专有名词和版本号等标识符逐字相同；不一致时改正译文而非放宽结构校验，且不为翻译另行扩大比较范围。普通缺陷修复即使按项目记忆规则不触发 Changelog，也必须进入本次发布的“问题修复”。
8. 使用本 Skill 的标准库脚本维护根 `release-notes.json`：

   ```text
   python3 .agents/skills/desktop-prepare-release/scripts/release_notes.py upsert --file release-notes.json --release-date YYYY-MM-DD --version <current-version> [--feature-optimization-zh-cn <text> --feature-optimization-en-us <text>]... [--bug-fix-zh-cn <text> --bug-fix-en-us <text>]...
   python3 .agents/skills/desktop-prepare-release/scripts/release_notes.py check --file release-notes.json --expected-version <current-version>
   python3 .agents/skills/desktop-prepare-release/scripts/release_notes.py render --file release-notes.json --locale zh-CN
   python3 .agents/skills/desktop-prepare-release/scripts/release_notes.py render --file release-notes.json --locale en-US
   ```

   `--feature-optimization-zh-cn`/`--feature-optimization-en-us` 与 `--bug-fix-zh-cn`/`--bug-fix-en-us` 各自按出现顺序配对（第 1 个 `-zh-cn` 对应第 1 个 `-en-us`，以此类推），与命令行上是否相邻书写无关；两侧数量必须一致，顺序错位会导致翻译对语义错配却不被结构校验发现。脚本必须拒绝符号链接/非普通文件、非 `schemaVersion: 2`、无效日期/版本、重复版本、空版本条目、翻译对缺少 `zh-CN`/`en-US`、任一分类超过 10 条或总版本超过 5 条；配对参数数量不一致也必须失败。脚本把同版本替换后置顶，按最新在前原子写入并只保留最近 5 版。中文渲染保持 `-----------更新日志 {发布日期} {发布版本}----------`、`###功能优化`、`###问题修复` 与“无”；英文渲染保持 `-----------Release notes {release date} {release version}----------`、`###Feature optimizations`、`###Bug fixes` 与“None”；发布版本都带一个小写 `v`。
9. 同时判断本次源码是否触发 Changelog。触发时把有效 `Unreleased` 条目按现有规则整理为本次发布元数据；仅含普通缺陷修复或纯重构时，不创建、不补写也不汇总 Changelog，并把该门禁记录为 `Not applicable`。随后独立运行 `release_notes.py check` 与双语 `render`，重新运行 `release_git.py inspect`；除 `release-notes.json` 和确实被规则触发的 Changelog 文件外出现任何变化都停止。将这些发布日志作为第二个逻辑提交，例如 `chore(release): prepare vX.Y.Z candidate`。确有变化时，紧邻该提交再次调用 `$desktop-configure-git-commits` 完成有效身份与仓库 local 模板的 report/install/check；若更新命令字节幂等且没有任何发布元数据变化，不创建空提交。无论是否产生第二个提交，都再次调用 `$desktop-manage-git-branch-chain publish` 并复读远端叶子。
10. 第二个提交同样使用最新 `statusSha256` 和精确 `--path`，不再追加审批，且不得绕过 hooks。提交后运行 `release_git.py inspect`，要求 `status=clean`；紧邻即将由 helper 形成的关闭状态提交，再调用 `$desktop-configure-git-commits` 完成有效身份与仓库 local 模板的 report/install/check，然后运行 `$desktop-manage-git-branch-chain release`，把第 5 步审查信封以及第 1 步 `candidateSelections` 逐字段显式传入：审查两条分支都传选择、状态和 `sourceHead`；启用分支还传同一 `reviewedSourceCommit`、五项完成声明与公开证据摘要，关闭分支只传公开原因/风险。性能与 macOS 签名分别传选择、来源及关闭时的公开原因/风险；不适用项显式传 `not-applicable`。不得只传裸选择，也不得让 helper 补成 `passed` 或推断产品适用性。该命令只接受严格串行、父头冻结、全部远端 OID 已复读且无其他 Worktree 占用的登记链；它逐提交验证审查终点之后只改发布日志/被触发 Changelog，计算冻结范围树差异 SHA-256，并将完整 `releaseReview`、`candidateSelections` 与 `lastClosedChain` 在同一个 closing commit 中原子封存，然后以一次 atomic push 在冻结旧 OID lease 下把动态默认 `main`/`master` 严格快进到该提交，同时用逐 ref lease 删除状态文件本轮精确列出的远端 feature refs。即使某路径后来恢复原状，审查后曾触碰其他路径也必须停止并返回新链修正。默认分支、登记 feature 或冻结 legacy `Release` 的冲突/竞态、非快进及原子 push 失败都不得触发受管远端变化。正常路径不会更新或删除原本缺失的 `Release`；若它在远端广告后并发出现，helper 保留该未知 ref，默认/feature 原子事务可能已完成但命令必须报告可恢复冲突，待外部所有者精确移除后再幂等收尾。远端已经成功但本地切换/清理中断时也只允许同一命令按记录幂等收尾。命令成功后当前分支必须是同名默认分支、工作树 clean、本地/远端默认 ref 精确等于当前 40 位 `HEAD`，且状态登记的本地/远端 feature refs 均不存在；不得扫描 `codex/*` 或其他未登记分支。立即运行 `verify-release-review`，要求其返回的 `releaseBranch` 等于动态默认分支、`releaseReview`/`candidateSelections` 逐字段等于调用方信封且范围摘要复算通过；把 HEAD 记录为唯一 `releaseHead`。构建所用 `sourceCommit` 必须等于该 `releaseHead`，而不是源码提交、关闭前叶子或旧候选提交。审查启用时封存的 `reviewedSourceCommit` 必须是 `releaseHead` 的祖先，二者之间只允许发布日志、被触发 Changelog 与关闭状态提交。
11. 分支链关闭且最终 clean 后立即按已选接口调用 `$desktop-build-tauri-release`（含 GUI）或 `$desktop-build-rust-release`（无 GUI）；这是明确发布请求的一部分，不再询问是否提交或是否开始构建。构建 Skill 必须调用 `verify-release-review`，从当前 closing commit 的 `lastClosedChain.releaseReview` 与 `candidateSelections` 消费并复算第 1/5/10 步已经封存的审查、性能、macOS 签名选择和范围绑定，不能继续依赖对话内参数、重复询问这些选择或自行制造证据；进程在关闭链后中断时，同一默认分支 HEAD 上的重试也读取这份记录。没有当前信封、任一信封无效、HEAD 不是该 closing commit，旧记录尚未完成远端或本地收尾，或封存选择与当前产品/渠道硬要求冲突时一律 `Not ready`。构建只另外解析本次 E2E 选择、运行其规定测试并创建 `pending` 候选；本 Skill 不在构建外另行补跑测试。构建开始前、写 manifest 前均须复核当前分支精确为动态默认 `main`/`master`、clean 且 `HEAD == releaseHead`，任何漂移停止。GUI 性能选择 `enabled` 或产品/渠道硬要求时，才在 bundle 前调用 `$desktop-test-gui-release-performance`；封存为 `disabled` 且无硬要求时跳过探针并把同一原因和剩余风险写入 manifest。macOS GUI 只消费封存的 `macosSigningSelection`/来源且不得重新解释本机条件。已启用后的首次失败先返回开发循环尝试有界修复；修复必须作为新的需求/Bug 从当前已推送默认分支新建下一条 feature 链，不得直接修改或回退默认分支，原候选随即失效并从新链重新执行本流程。只有修复后仍失败时才能询问用户是否以保留原失败证据的 `performanceStatus: waived` 继续；未确认则停止。此授权仍不包含验收结论、签名补救、标签、上传或真实渠道发布。

### 就绪复核阶段

12. 要求存在由 `$desktop-verify-delivery` 给出的 `Milestone accepted` 候选；开发证据、一次构建或 `pending` 候选均不充分。要求独立 Git 顶层目录 clean，并再次运行 `$desktop-manage-git-branch-chain verify-release-review`：当前 `HEAD`、返回的 `releaseHead` 与候选 manifest 的已验收 `sourceCommit` 必须相同，两份封存信封与 manifest 字段必须逐字段一致。随后运行更新日志脚本的只读 `check --expected-version`，再分别 `render --locale zh-CN` 与 `render --locale en-US` 复核已验收字节中的两种可见版本。此阶段绝不得修改 `release-notes.json` 或 Changelog；任何字节变化都使现有候选与验收失效并返回候选前阶段。
13. 找到已声明的版本事实源，并比较每个含版本信息的位置。Harness 使用根 `Version.md`；下游以根 `Cargo.toml` 为当前版本唯一事实源，以 `.harness/version-state.json` 保存周期/去重状态。下游候选、manifest 机器版本、带 `v` 的 `releaseNotesVersion`、`releaseNotesSha256`、包内 `releaseNotesPath`、软件显示和适用 Changelog 必须一致；GUI 候选始终实际包含同一更新日志，`about_page = enabled` 时关于页必须消费它，disabled 时关于页、入口和组件必须缺席。状态缺失或不一致时停止。
14. 要求 `$desktop-build-rust-release`、`$desktop-build-tauri-release` 或 `$desktop-collect-release-artifacts` 已针对精确构建标识安全刷新 `<project-root>/release`。验证归档/二进制/安装包、SHA-256、清单、版本、提交、构建、全量单元测试、`e2eSelection`、`reviewSelection`/`reviewStatus` 及适用证据或 `Not run` 风险、更新日志版本/摘要/包内路径、`signingStatus`、`signingReason`、结构化 `signingEvidence`、验收结论及适用冒烟/E2E 结果。Tauri GUI 还验证 `bundleFormat`、`runtimeVerification`、公证字段和 `performanceSelection`/`performanceStatus` 组合：`enabled` 只接受原生 `passed | waived` 的完整证据，或未在真实原生平台运行时准确的 `Unverified`；`disabled` 且无硬要求只接受 `Not run`、非空原因/剩余风险和全部性能探针/证据/绑定字段缺席。产品/渠道要求性能时，`disabled`、`Not run` 或 `Unverified` 均阻断就绪。macOS 另核对 `macosSigningSelection` 与来源；只有启用时才允许已签名，且已签名直接分发候选只接受 `notarizationStatus: notarized-and-stapled`。xwin NSIS 只接受 `buildMode: cross-compiled-xwin` 和 `runtimeVerification: Unverified`。拒绝历史、过时、`pending`、`rejected`、外来、含糊或额外文件。目录存在绝不表示已满足发布就绪条件。
15. 就绪复核阶段保持纯只读：只根据同一 clean 默认分支 closing commit、原子验收后的 `release/` 精确集合和现有事实报告 `Ready`/`Not ready`，不得更新 tracked 发布记录、Verification、Changelog、Product Status、版本状态或其他项目记忆，也不得把后续文档提交混作当前候选。只有真实渠道发布成功后，发布执行方才从这个已发布默认分支 closing commit 新建后续独立受管 feature 生命周期，记录发布/Verification/项目状态事实，并以精确版本和当前候选的 40 位源码提交调用 `$desktop-manage-version finalize-release`；该留证提交不反向改变或批准旧候选。失败、取消、仅创建标签、`pending`/`accepted` 候选或上传尝试均不得重置。

## 发布门禁

只有满足 `docs/RELEASE.md` 中全部必需检查项时，才声明 `Ready`。否则必须声明 `Not ready` 并列出精确阻断项。

- 绝不得覆盖已发布版本。
- 绝不得编造标签、提交、校验和、产物、日期或验证结果。
- 明确发布只自动提交已完成且通过逐路径范围/秘密硬门禁的本地内容，并授权把活动 feature 叶子推到既有远端、把经冻结校验且满足当次发布审查选择的完整线性分支链原子严格快进到动态默认 `main`/`master`，以及按状态清单和逐 ref lease 原子删除远端登记 feature 链后删除对应本地链路。任何歧义、秘密、凭据、个人数据、不明暂存内容或 hook/签名/提交失败都必须停止，不得以关闭语义审查、跳过 hook、扩大 pathspec 或部分提交规避。
- 启动构建前必须位于动态默认 `main`/`master`，是 clean 40 位 `HEAD`，且本地/远端同名默认 ref 与该 HEAD 相等；manifest 的 `sourceCommit` 必须等于该 HEAD。构建期间 HEAD 或状态漂移立即作废本次候选。
- 此授权不包含远端配置、凭据处理、无精确期望 OID 的强制推送、merge commit、标签、上传或真实渠道发布；逐 ref lease 删除仍是关闭事务唯一允许的 force 形式，且只覆盖状态本轮精确登记的 feature refs。默认分支推进和精确清链已经是本次 Git 发布终态，不再保留 `Release` 中转或用户 Merge/PR 步骤。
- 绝不得把候选工作流成功或产物目录完整视为发布授权。
- 本 Skill 不得在已调用的构建/验收 Skill 之外另行运行冒烟/E2E，也不得把未选择的检查视为通过。保留 `Not run` 及其剩余风险；项目策略、产品或渠道要求该检查时，必须阻断就绪状态。
- 发布准备本身不得在此运行任一测试，绝不得在发布准备中运行冒烟/E2E；它只执行当次已启用的集中发布语义审查，解析并封存审查选择、GUI 性能选择与 macOS 签名选择，且只核对候选清单中的 `reviewSelection`、`e2eSelection`、`performanceSelection` 与 `macosSigningSelection`。测试、已启用 GUI 性能门禁和适用 E2E 均由被调用的专用 Skill 负责。
- 本 Skill 不得在构建 Skill 之外临时补跑或改判测试；候选构建所需全量单元测试、本次 `e2eSelection` 和当次 GUI 性能执行由对应构建 Skill 唯一负责，就绪阶段只读复核其证据或 `Not run` 风险。
- 不得在此重试或配置签名、公证或 stapling。渠道要求的签名与公证必须已经属于精确的已验收候选；macOS Tauri 候选不得以仅签名状态宣布就绪。后续改变字节的签名、公证、stapling 或重新打包必须把新字节交回 `$desktop-verify-delivery`。
- 绝不得仅因旧 `release/` 快照中的文件仍存在，就把它评估为当前结果；收集过程必须把它绑定到已选版本、源码提交和构建证据。
- 绝不得仅因下一 Harness 时间版本看似明显就更改它；Harness 版本与下游 Major 决定属于用户。下游 Minor/Patch 必须已经由 `$desktop-manage-version` 在合格变化完成后确定，发布准备不得另算或手工覆盖。
- 使用面向用户的语言描述变更，不得仅提供原始提交列表。
- 绝不得为了版本一致性检查，为仅含普通缺陷修复或纯重构的候选制造空 Changelog、`Not applicable` 占位日期文件或虚构用户变化。
- 候选前只允许用 `release_notes.py upsert` 更新发布日志；候选验收后只允许 `check`/`render` 读取。不得在已验收候选上补写、重排或润色更新日志。
