---
name: desktop-prepare-release
description: 使用仓库声明的版本方案评估并准备可追溯发布。Harness 使用 Asia/Shanghai 时区的 YYYYMMDDHHMM 时间版本；除非已批准规格另有规定，下游产品使用语义化版本。
---

# 准备发布

准备发布元数据、自动形成可追溯的本地提交并构建候选；用户明确提出发布时，该请求本身授权本次已完成范围的本地提交和紧随其后的候选构建，不再追加提交或构建审批。普通构建不自动提交。发布仅在本地完成；不配置、触发或等待任何 CI/CD，不推送、不上传、不向 Git 或其他远端分发，不要求 Git remote 或标签，也不改写历史。

## 工作流程

1. 读取存在时的 `Version.md`、`docs/RELEASE.md`、日期最新的 Product Spec 和验证记录。`docs/changelog/README.md` 存在时读取其规则；下游尚未触发 Changelog 时，使用 `docs/ENGINEERING_RULES.md` 的 Changelog 触发规则，不得为读取规则而预建目录、索引或日期文件。确认用户确实提出发布，并判断当前进入“候选前本地提交与更新日志阶段”还是已有 `Milestone accepted` 候选后的“就绪复核阶段”。只有前者使用本节的自动本地提交与构建授权。候选前阶段含 GUI 时，在任何本地提交或发布元数据写入前解析当次 `performanceSelection: enabled | disabled`：当前发布请求已经明确时直接复用；产品/渠道硬要求强制启用并记录来源；否则询问用户一次。该选择不写入持久策略，不从 E2E 推断；同一发布的修复重跑复用原选择，新发布重新询问，并把解析结果传给 `$desktop-build-tauri-release`，使构建不得重复询问。
2. 应用已声明的版本方案。Harness 模板使用根 `Version.md`，根据用户在 `Asia/Shanghai` 时区作出的版本决定使用 12 位 `YYYYMMDDHHMM`；下游不得继承 Harness `Version.md`，也不重新计算 SemVer，而在就绪复核调用 `$desktop-manage-version check --phase release` 使用开发阶段已经确定的目标版本。只有 Major 的精确目标需要用户批准，Minor/Patch 不在发布准备阶段补升。所有用户可见版本规范化为且只规范化为一个小写 `v`；Cargo、状态和 manifest 的机器版本字段保持原始值。

### 候选前本地提交与更新日志阶段

3. 要求独立 Git 顶层目录和可解析的当前 `HEAD`；初始化中尚未生成的 `HEAD` 不具备发布比较边界，必须声明 `Not ready`。先运行只读检查，并逐项查看 staged、unstaged、untracked 内容及真实 diff：

   ```text
   python3 .agents/skills/desktop-prepare-release/scripts/release_git.py inspect --project-root .
   ```

   只把已完成、范围明确、已复核且属于本次发布的源码/测试/版本/适用项目记录纳入第一个提交；此时 `release-notes.json` 必须未改动。存在归属歧义、半成品、无法解释的 staged 内容、秘密/令牌/凭据/个人数据、临时调试、缓存或不应跟踪的生成物时立即停止并询问用户，不得猜测、隐藏或自动提交。不得把“明确发布”扩张为提交不明确或敏感内容。
4. 紧邻真实提交调用 `$desktop-configure-git-commits`：报告并检查有效身份，只在字段缺失时传入 Agent 已翻译/归一化的单一 ASCII 英文设备 username，由该 Skill 确定派生同名 Gmail 并只写仓库 local；安装并检查仓库模板。已有有效身份保持不变，绝不得写 global/system。然后重新运行 `release_git.py inspect` 获取最新 `statusSha256`，把所有且仅有已复核源码路径作为重复 `--path` 传入：

   ```text
   python3 .agents/skills/desktop-prepare-release/scripts/release_git.py commit --project-root . --expected-status-sha256 <sha256-from-inspect> --message "<reviewed Conventional Commit message>" --path <reviewed-path> [--path <reviewed-path> ...]
   ```

   明确发布请求已经授权此本地提交，不再询问第二次审批。脚本使用 literal pathspec，只允许完整工作树范围，正常运行 hooks 且绝不传 `--no-verify`；状态在复核后变化、路径越界、暂存区夹带、范围不完整、身份/模板/签名错误、hook 或 `git commit` 失败都必须停止。工作树原本 clean 时不创建空源码提交，直接把现有 `HEAD` 作为源码提交。源码提交完成后必须 clean，再记录新的 40 位 `sourceHead`。
5. 从本地正式发布记录、版本状态及匹配 Verification 中找到上一次真实发布的版本和 40 位源码提交，并以它到 `sourceHead` 为比较范围；不得把 `pending`/`accepted` 候选、标签创建尝试或目录修改时间当作正式发布。首个正式发布没有上次提交时，以仓库起点到 `sourceHead` 为比较范围；如果历史证据冲突或无法界定比较范围，声明 `Not ready` 并停止，绝不猜测。
6. 审阅上次正式发布提交之后到 `sourceHead` 的真实差异、已完成行为、适用按日 Changelog 和缺陷事实，语义筛选最重要的用户可见内容；不得直接倾倒提交标题、内部重构或构建流水账。当前版本固定使用两类：`功能优化` 不超过 10 个逻辑条目，`问题修复` 不超过 10 个逻辑条目，两类合计至少一条。每个逻辑条目必须同时形成非空 `zh-CN` 和 `en-US` 文案；若只先整理一种语言，Agent 自动翻译另一种，并在写入前并排复核：两侧指向同一处代码事实、条目数量和顺序一致、无一侧遗漏或凭空新增要点、专有名词和版本号等标识符逐字相同；复核不通过时改正译文而非放宽结构校验，且不为翻译另行扩大比较范围。普通缺陷修复即使按项目记忆规则不触发 Changelog，也必须进入本次发布的“问题修复”。
7. 使用本 Skill 的标准库脚本维护根 `release-notes.json`：

   ```text
   python3 .agents/skills/desktop-prepare-release/scripts/release_notes.py upsert --file release-notes.json --release-date YYYY-MM-DD --version <current-version> [--feature-optimization-zh-cn <text> --feature-optimization-en-us <text>]... [--bug-fix-zh-cn <text> --bug-fix-en-us <text>]...
   python3 .agents/skills/desktop-prepare-release/scripts/release_notes.py check --file release-notes.json --expected-version <current-version>
   python3 .agents/skills/desktop-prepare-release/scripts/release_notes.py render --file release-notes.json --locale zh-CN
   python3 .agents/skills/desktop-prepare-release/scripts/release_notes.py render --file release-notes.json --locale en-US
   ```

   `--feature-optimization-zh-cn`/`--feature-optimization-en-us` 与 `--bug-fix-zh-cn`/`--bug-fix-en-us` 各自按出现顺序配对（第 1 个 `-zh-cn` 对应第 1 个 `-en-us`，以此类推），与命令行上是否相邻书写无关；两侧数量必须一致，顺序错位会导致翻译对语义错配却不被结构校验发现。脚本必须拒绝符号链接/非普通文件、非 `schemaVersion: 2`、无效日期/版本、重复版本、空版本条目、翻译对缺少 `zh-CN`/`en-US`、任一分类超过 10 条或总版本超过 5 条；配对参数数量不一致也必须失败。脚本把同版本替换后置顶，按最新在前原子写入并只保留最近 5 版。中文渲染保持 `-----------更新日志 {发布日期} {发布版本}----------`、`###功能优化`、`###问题修复` 与“无”；英文渲染保持 `-----------Release notes {release date} {release version}----------`、`###Feature optimizations`、`###Bug fixes` 与“None”；发布版本都带一个小写 `v`。
8. 同时判断本次源码是否触发 Changelog。触发时把有效 `Unreleased` 条目按现有规则整理为本次发布元数据；仅含普通缺陷修复或纯重构时，不创建、不补写也不汇总 Changelog，并把该门禁记录为 `Not applicable`。随后独立运行 `release_notes.py check` 与双语 `render`，重新运行 `release_git.py inspect`；除 `release-notes.json` 和确实被规则触发的 Changelog 文件外出现任何变化都停止。将这些发布日志作为第二个逻辑提交，例如 `chore(release): prepare vX.Y.Z candidate`。若更新命令字节幂等且没有任何发布元数据变化，不创建空提交。
9. 第二个提交同样使用最新 `statusSha256` 和精确 `--path`，不再追加审批，且不得绕过 hooks。提交后运行 `release_git.py inspect`，要求 `status=clean`，把其 40 位 `head` 记录为唯一 `releaseHead`；`git status --porcelain=v1 --untracked-files=all` 非空、提交失败或 HEAD 不可解析时停止。此时构建所用 `sourceCommit` 必须等于 `releaseHead`，而不是第一个源码提交或旧候选提交。
10. 最终 clean 后立即按已选接口调用 `$desktop-build-tauri-release`（含 GUI）或 `$desktop-build-rust-release`（无 GUI）；这是明确发布请求的一部分，不再询问是否提交或是否开始构建。构建 Skill 负责解析本次 E2E 选择、运行其规定测试并创建 `pending` 候选；本 Skill 不在构建外另行补跑测试。构建开始前、写 manifest 前均须复核 clean 且 `HEAD == releaseHead`，任何漂移停止。GUI 构建必须接收第 1 步解析的 `performanceSelection`：选择 `enabled` 或产品/渠道硬要求时，才在 bundle 前调用 `$desktop-test-gui-release-performance`；选择 `disabled` 且无硬要求时跳过探针并记录 `performanceStatus: Not run`、原因和剩余风险。已启用后的首次失败先返回开发循环尝试有界修复。修复改变源码时，本次 releaseHead 与候选失效，但原明确发布请求仍授权本 Skill 回到第 3 步复核并本地提交该范围、刷新发布日志提交，再从新的 clean `releaseHead` 以原性能选择重跑构建，不追加选择/提交/构建审批。只有修复后仍失败时才能询问用户是否以保留原失败证据的 `performanceStatus: waived` 继续；未确认则停止。此授权不替代验收结论或签名补救许可；标签、推送、上传和远程发布不属于本地发布流程。

### 就绪复核阶段

11. 要求存在由 `$desktop-verify-delivery` 给出的 `Milestone accepted` 候选；开发证据、一次构建或 `pending` 候选均不充分。要求独立 Git 顶层目录 clean，且 `HEAD` 与候选 manifest 的已验收 `sourceCommit` 匹配，并运行更新日志脚本的只读 `check --expected-version`，再分别 `render --locale zh-CN` 与 `render --locale en-US` 复核已验收字节中的两种可见版本。此阶段绝不得修改 `release-notes.json` 或 Changelog；任何字节变化都使现有候选与验收失效并返回候选前阶段。
12. 找到已声明的版本事实源，并比较每个含版本信息的位置。Harness 使用根 `Version.md`；下游以根 `Cargo.toml` 为当前版本唯一事实源，以 `.harness/version-state.json` 保存周期/去重状态。下游候选、manifest 机器版本、带 `v` 的 `releaseNotesVersion`、`releaseNotesSha256`、包内 `releaseNotesPath`、软件显示和适用 Changelog 必须一致；GUI 候选始终实际包含同一更新日志，`about_page = enabled` 时关于页必须消费它，disabled 时关于页、入口和组件必须缺席。状态缺失或不一致时停止。
13. 要求 `$desktop-build-rust-release`、`$desktop-build-tauri-release` 或 `$desktop-collect-release-artifacts` 已针对精确构建标识安全刷新 `<project-root>/release`。验证归档/二进制/安装包、SHA-256、清单、版本、提交、构建、全量单元测试、`e2eSelection`、更新日志版本/摘要/包内路径、`signingStatus`、`signingReason`、结构化 `signingEvidence`、验收结论及适用冒烟/E2E 结果。Tauri GUI 还验证 `bundleFormat`、`runtimeVerification`、公证字段和 `performanceSelection`/`performanceStatus` 组合：`enabled` 只接受原生 `passed | waived` 的完整证据，或未在真实原生平台运行时准确的 `Unverified`；`disabled` 且无硬要求只接受 `Not run`、非空原因/剩余风险和全部性能探针/证据/绑定字段缺席。产品/渠道要求性能时，`disabled`、`Not run` 或 `Unverified` 均阻断就绪。macOS 已签名直接分发候选只接受 `notarizationStatus: notarized-and-stapled`，xwin NSIS 只接受 `buildMode: cross-compiled-xwin` 和 `runtimeVerification: Unverified`。拒绝历史、过时、`pending`、`rejected`、外来、含糊或额外文件。目录存在绝不表示已满足发布就绪条件。
14. 用户明确要求正式发布时，在上述只读复核通过后，按 `docs/RELEASE.md` 写入完整本地正式发布记录：精确版本、40 位源码提交、最终制品本地路径与 SHA-256、验收和人工复核证据。重新核对文件可读且摘要匹配，确认本地交付成功后，下游才以该版本和源码提交调用 `$desktop-manage-version finalize-release --release-succeeded`；Harness 仅更新自身本地发布状态。只请求准备或构建时停在候选状态，不创建正式发布完成记录。失败、取消、仅创建标签、单独 `pending`/`accepted` 候选均不得重置，不等待远程渠道回执。

## 发布门禁

只有满足 `docs/RELEASE.md` 中全部必需检查项时，才声明 `Ready`。否则必须声明 `Not ready` 并列出精确阻断项。

- 绝不得覆盖已发布版本。
- 绝不得编造标签、提交、校验和、产物、日期或验证结果。
- 明确发布只自动提交已完成且经逐项复核的本地范围。任何歧义、秘密、凭据、个人数据、不明暂存内容或 hook/签名/提交失败都必须停止，不得以跳过 hook、扩大 pathspec 或部分提交规避。
- 启动构建前必须是 clean 40 位 `HEAD`；manifest 的 `sourceCommit` 必须等于该 HEAD。构建期间 HEAD 或状态漂移立即作废本次候选。
- 绝不得配置、触发或等待 CI/CD，或推送、创建远程标签、上传、部署与远程发布。本地正式发布仍须满足当前明确发布请求和完整交付证据。
- 绝不得把本地构建成功或产物目录完整视为发布成功。
- 本 Skill 不得在已调用的构建/验收 Skill 之外另行运行冒烟/E2E，也不得把未选择的检查视为通过。保留 `Not run` 及其剩余风险；项目策略、产品或渠道要求该检查时，必须阻断就绪状态。
- 发布准备本身不得在此运行任一测试，绝不得在发布准备中运行冒烟/E2E；它解析并传递当次 GUI 性能选择，只复核候选清单中的 `e2eSelection` 与 `performanceSelection`，测试、已启用 GUI 性能门禁和适用 E2E 均由被调用的专用 Skill 负责。
- 本 Skill 不得在构建 Skill 之外临时补跑或改判测试；候选构建所需全量单元测试、本次 `e2eSelection` 和当次 GUI 性能执行由对应构建 Skill 唯一负责，就绪阶段只读复核其证据或 `Not run` 风险。
- 不得在此重试或配置签名、公证或 stapling。渠道要求的签名与公证必须已经属于精确的已验收候选；macOS Tauri 候选不得以仅签名状态宣布就绪。后续改变字节的签名、公证、stapling 或重新打包必须把新字节交回 `$desktop-verify-delivery`。
- 绝不得仅因旧 `release/` 快照中的文件仍存在，就把它评估为当前结果；收集过程必须把它绑定到已选版本、源码提交和构建证据。
- 绝不得仅因下一 Harness 时间版本看似明显就更改它；Harness 版本与下游 Major 决定属于用户。下游 Minor/Patch 必须已经由 `$desktop-manage-version` 在合格变化完成后确定，发布准备不得另算或手工覆盖。
- 使用面向用户的语言描述变更，不得仅提供原始提交列表。
- 绝不得为了版本一致性检查，为仅含普通缺陷修复或纯重构的候选制造空 Changelog、`Not applicable` 占位日期文件或虚构用户变化。
- 候选前只允许用 `release_notes.py upsert` 更新发布日志；候选验收后只允许 `check`/`render` 读取。不得在已验收候选上补写、重排或润色更新日志。
