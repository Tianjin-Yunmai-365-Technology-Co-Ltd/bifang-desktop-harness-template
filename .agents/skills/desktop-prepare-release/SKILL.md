---
name: desktop-prepare-release
description: 使用仓库声明的版本方案锁定单次本地或远端 Git 发布、准备发布元数据与主分支版本 tag，并仅为终端下游继续形成适用候选；只在用户明确发布时使用。
---

# 准备发布

本 Skill 的维护 helper 只使用 Node.js `>=24.21.0` 标准库，不依赖其他脚本运行时或第三方包。

把已完成范围提交，生成双语更新日志与可复核发布上下文，然后按已锁定的 `gitPublication: local | remote` 调用 `$desktop-manage-git-lifecycle release`。本地模式只把本周期登记分支普通合并到本地默认主分支、创建并复读本地 `v{版本}-{YYYYMMDD}`，成功后删除登记 Worktree/本地分支；远端模式才推送并复读主分支和 tag，并在成功后额外删除登记的主远端分支。

用户明确说“发布”即授权本次已复核范围的本地提交、版本 tag 与登记资源清理，并触发一次 Git 发布位置选择；只有 `gitPublication: remote` 才授权主分支/tag 推送和远端复读/清理，终端下游还授权紧随其后的适用候选构建。Harness 源根只执行源码 Git 发布，不把中性脚手架当作产品候选；仅当用户另行明确要求源码归档时才生成归档。不授权配置 remote/凭据、历史改写、渠道上传、商店提交或未登记资源删除。流程不创建或使用 `Release` 分支，也不设置保护分支、严格线性、fast-forward-only、lease 或 atomic push 门禁。

## 正式发布共享流程

1. 读取 `docs/RELEASE.md`、版本事实源、最新 Product Spec，以及真实存在且与本次发布有关的 Changelog/Verification。确认用户明确提出发布。调用 `$desktop-manage-git-lifecycle inspect` 读取本周期登记资源；状态只用于精确合并与清理，不限制当前分支形态，也不能替代本次 Git 发布位置选择。
2. 先判定当前根是否同时包含 Harness 专用 `Version.md` 与活动 `.agents/skills/desktop-instantiate-project/SKILL.md`。该条件为真就是 Harness 源发布，否则是终端下游发布。完成判定后，在任何提交或发布元数据写入前解析当次 Git 发布位置与 `reviewSelection: enabled | disabled`，并锁定本次全部选择：
   - `gitPublication: local | remote`：当前发布请求已经明确时直接复用，否则询问一次；产品/渠道明确要求远端可获取源码或远程构建时强制 `remote` 并记录来源。`local` 不选择 remote，必须确定当前仓库的本地默认主分支；`remote` 才要求选择唯一主远端的精确名称。两种模式都属于真实 Git 发布，不把本地模式描述为 waiver 或降级。
   - `reviewSelection: enabled | disabled`：当前发布请求已经明确时直接复用；安全、隐私、不可逆操作、对外兼容契约或产品/渠道硬要求强制启用并记录来源；否则询问用户一次。
   - Harness 源的 `macosSigningSelection`/`macosSigningSource` 固定为 `not-applicable`，原因/风险字段缺席，不询问产品候选选择。终端下游含 macOS GUI 时解析 `macosSigningSelection: enabled | disabled` 及来源；不适用时为 `not-applicable`。签名关闭时不得探测本机签名条件。`system_notification = enabled` 且签名关闭时立即 `Not ready`。
   这些选择属于单次发布，写入 `.harness/release-context.json`，不修改通用策略。同一发布的中断重试复用已提交上下文且不得改变 Git 发布位置，新发布重新解析。
3. 使用已声明版本方案。Harness 版本来自 `Version.md`，按 `Asia/Shanghai` 的 `YYYYMMDDHHMM` 时间版本；下游不得继承 Harness `Version.md`，而是通过 `$desktop-manage-version check --phase release` 使用开发阶段已确定的语义化目标版本。发布准备不在此补算 Minor/Patch，也不得另算、手工覆盖或重置正式发布周期。机器版本不带 `v`，可见版本只带一个小写 `v`。
4. 要求项目根是独立 Git 顶层目录并存在可解析的当前 HEAD；初始化中尚未生成的 `HEAD` 必须声明 `Not ready`，不能伪造提交。运行只读检查，并逐项查看 staged、unstaged、untracked 与真实 diff：

   ```text
   node .agents/skills/desktop-prepare-release/scripts/release_git.mjs inspect --project-root .
   ```

   只提交已完成、范围明确、无秘密且属于本次发布的路径。归属歧义、半成品、无法解释的 staged 内容、令牌/凭据/个人数据、临时调试、缓存或不应跟踪的生成物都必须停止。分支名不构成提交门禁；快照中的 branch/HEAD 只用于阻止复核后切换或并发改写。
5. 紧邻真实提交调用 `$desktop-configure-git-commits`，只补仓库 local 身份和模板。任何由独立事件真实触发的 Changelog 必须已经写入并纳入这次源码/治理提交；不得在锁定 `sourceHead` 后再补写 Changelog。用最新 `statusSha256` 与所有已复核路径提交源码；helper 使用 literal pathspec、运行正常 hooks、拒绝部分工作树、秘密和 hook 改写：

   ```text
   node .agents/skills/desktop-prepare-release/scripts/release_git.mjs commit --project-root . --expected-status-sha256 <sha256> --message "<Conventional Commit>" --path <reviewed-path> [--path <reviewed-path> ...]
   ```

   明确发布请求已经授权此提交，不再询问第二次审批。脚本使用 literal pathspec，正常运行 hooks 且绝不传 `--no-verify`。已完成并验证的 Harness 升级所维护的 tracked `.harness/upstream-lock.json` 属于本步骤可复核的源码/治理路径；除此之外的 `.harness/*` 仍不得获批，发布元数据步骤也仍只允许日志与 context。工作树原本 clean 时不创建空源码提交。提交后的 clean HEAD 记为 `sourceHead`。
6. 按选择形成 `releaseReview`：
   - `enabled`：以最近一次真实发布提交到 `sourceHead` 为范围，完成行为正确性、core/adapter 边界、对外契约、职责/规模、临时标记五项检查；Harness 源另运行 `node scripts/validate_harness.mjs --release-review`。只有全部通过才记录 `passed`、五项固定检查、`reviewedSourceCommit = sourceHead` 与公开摘要。
   - `disabled`：记录 `reviewStatus: Not run`、公开原因与剩余风险，不生成审查证据。
   提交范围、秘密、必要测试、签名和渠道要求不受该选择影响。`scopeBase`/`scopeDiffSha256` 只描述审查范围，不用来约束分支拓扑。
7. 从真实发布 tag/记录找到上一次发布到 `sourceHead` 的变化范围。首发使用仓库起点；历史冲突时停止，不猜测。整理两类双语更新日志：`功能优化` 与 `问题修复` 各不超过 10 项、总计至少一项、`zh-CN`/`en-US` 数量顺序和事实一致。用标准库 helper 原子维护并双语渲染复核：

   ```text
   node .agents/skills/desktop-prepare-release/scripts/release_notes.mjs upsert --file release-notes.json --release-date YYYY-MM-DD --version <version> [--feature-optimization-zh-cn <text> --feature-optimization-en-us <text>]... [--bug-fix-zh-cn <text> --bug-fix-en-us <text>]...
   node .agents/skills/desktop-prepare-release/scripts/release_notes.mjs check --file release-notes.json --expected-version <version>
   node .agents/skills/desktop-prepare-release/scripts/release_notes.mjs render --file release-notes.json --locale zh-CN
   node .agents/skills/desktop-prepare-release/scripts/release_notes.mjs render --file release-notes.json --locale en-US
   ```

   文件固定使用 `schemaVersion: 2` 并只保留最近 5 版。只读检查拒绝原文件中需静默规范化的版本或文案、边界 BOM 与超过 1 MiB 的资源；`upsert` 对命令输入继续规范化并在原子写入前检查 UTF-8 字节上限。中文 `render` 命令保持 `-----------更新日志 {发布日期} {发布版本}----------`、`###功能优化`、`###问题修复`；英文 `render` 命令保持 `-----------Release notes {release date} {release version}----------`、`###Feature optimizations`、`###Bug fixes`。Changelog 仅在独立规则触发时更新，且必须已在步骤 5 的源码/治理提交中完成；本步骤不得新建或修改 Changelog。普通缺陷仍进入发布日志，但不为此制造 Changelog。
8. 用同一 `gitPublication`、版本、日期、`sourceHead`、`releaseReview` 和候选选择生成规范上下文。`releaseDate` 使用 `YYYY-MM-DD`，helper 自动派生 `expectedTag: v{version}-{YYYYMMDD}`；远端模式从精确 remote 派生动态默认分支，本地模式使用显式本地默认主分支且不访问远端：

   ```text
   # gitPublication: remote
   node .agents/skills/desktop-prepare-release/scripts/release_context.mjs write --project-root . --source-head <sourceHead> --version <version> --release-date YYYY-MM-DD --remote <remote> --review-selection <enabled|disabled> --scope-base <oid> --scope-diff-sha256 <sha256> <review arguments> <candidate selection arguments>
   # gitPublication: local
   node .agents/skills/desktop-prepare-release/scripts/release_context.mjs write --project-root . --source-head <sourceHead> --version <version> --release-date YYYY-MM-DD --local-only --default-branch <local-default-branch> --review-selection <enabled|disabled> --scope-base <oid> --scope-diff-sha256 <sha256> <review arguments> <candidate selection arguments>
   node .agents/skills/desktop-prepare-release/scripts/release_context.mjs check --project-root . --expected-version <version> --expected-sha256 <releaseContextSha256>
   ```

   Harness 源必须把候选参数固定传为 `--macos-signing-selection not-applicable --macos-signing-source not-applicable`。`release_context.mjs write` 会拒绝 `sourceHead` 不等于写入时当前 HEAD 的请求；该前置条件确保发布日志仍未提交、源码/治理提交也未漂移。第二个精确范围提交只能同时包含 `release-notes.json` 与 `.harness/release-context.json`；不得混入 Changelog、源码或其他治理文件。再次运行 `release_git.mjs inspect`、配置提交身份并用 `release_git.mjs commit` 提交这两个路径；无变化不创建空提交。
9. 要求最终工作树 clean，按上下文中已锁定的唯一模式调用且不得同时传入两个位置参数：

   ```text
   # gitPublication: remote
   node .agents/skills/desktop-manage-git-lifecycle/scripts/git_lifecycle.mjs release --project-root . --version <version> --date YYYYMMDD --release-context-sha256 <releaseContextSha256> --remote <remote>
   # gitPublication: local
   node .agents/skills/desktop-manage-git-lifecycle/scripts/git_lifecycle.mjs release --project-root . --version <version> --date YYYYMMDD --release-context-sha256 <releaseContextSha256> --local-only
   ```

   tracked `.harness/release-context.json` 是 lifecycle 的唯一冻结选择；从关联 Task Worktree 调用时，helper 先验证该调用 Worktree 当前 HEAD 中的上下文 blob 与 working bytes，再路由主 Worktree。它必须在任何 merge/fetch/push/tag 前核对传入摘要与上下文的 version/date/expectedTag/defaultBranch/gitPublication/remote，初始校验任一不一致零副作用失败；本地整合后、冻结 pending HEAD 或 push/tag 前还要确认 final HEAD 中同一路径 blob 仍等于该摘要，若整合覆盖或漂移则在后续阶段前停止。本地模式合并登记分支、切到上下文默认主分支并把 final HEAD 写入 `pendingRelease.head`，再创建/复用本地 tag，复读后按登记 Worktree→本地分支清理。远端模式首次执行先只在本地 fetch/整合，得到 final HEAD 后立即冻结 `pendingRelease.head`，之后才允许 push/远端复读/tag；pending head 非空的重试不得再次 fetch/merge 或吸收远端漂移，随后按登记 Worktree→主远端分支→本地分支清理。模式内 tag 创建、推送或复读失败时不得开始任何删除。清理可按资源幂等重试，但不得改变模式、扫描前缀、删除主分支或未登记资源。
10. 生命周期成功后锁定当前 40 位 HEAD 为最终 `sourceCommit`，并验证发布上下文的 tracked 字节、摘要、版本、clean 当前默认主分支和本地 tag 都指向该 HEAD；只有 `gitPublication: remote` 才额外验证远端默认分支和远端 tag：

   ```text
   node .agents/skills/desktop-prepare-release/scripts/release_context.mjs verify --project-root . --expected-version <version> --expected-sha256 <releaseContextSha256> --expected-head <sourceCommit>
   ```

   `sourceHead` 是审查/发布日志来源提交，`sourceCommit` 是完成普通合并后被主分支和 tag 同时指向的最终 Git 发布提交；在终端下游它也作为候选源码提交。两者不要求相等，也不施加线性历史或只允许特定提交形态的门禁。
11. 若步骤 2 已判定为 Harness 源，完成上一步即结束本次源码 Git 发布：产品构建、`release/` manifest、签名、公证、产品 E2E 与产品人工验收全部为 `Not applicable`，不得调用下游构建或验收 Skill。只有用户另行明确要求源码归档时才按 `docs/RELEASE.md` 生成并核对源码归档及其相邻 `.sha256`；归档必须包含两份根许可证，但不得创建或套用产品候选 manifest。终端下游才按接口调用 `$desktop-build-tauri-release` 或 `$desktop-build-rust-release`；下游构建只另外解析本次 E2E 选择，并从已提交的发布上下文读取 Git 发布位置、审查和签名选择，构建前与写 manifest 前均重新运行发布上下文 `verify`。`gitPublication: local` 只允许当前宿主本地候选，不得调用远程跨平台 provider；该 provider 路线仅接受 `remote`。修复候选问题时通过 `$desktop-implement-change` 自动建立新开发分支，重新提交并执行本流程。

发布准备只形成提交、更新日志、上下文和 Git 发布结果，不得在此运行任一测试，绝不得在发布准备中运行冒烟/E2E；终端下游由真实候选构建负责全量测试，Harness 源的中性资产和验证器测试必须已在进入发布准备前通过。候选验收后只允许 `check`/`render` 读取发布日志，任何字节变化都必须形成新提交并重走发布生命周期。`release/` 目录存在绝不表示已满足发布就绪条件。

## 就绪复核

以下就绪复核只适用于已经形成产品候选的终端下游；Harness 源没有产品候选，步骤 10 复核成功后不进入本节。

1. 只接受 `$desktop-verify-delivery` 给出的完整 `Milestone accepted` 候选。运行发布上下文 `verify`，要求候选 manifest 的 `sourceCommit`、版本、`releaseContextSha256`、`releaseReview`、`candidateSelections` 与当前上下文逐字段一致，并按 `gitPublication` 只要求适用的本地或远端 refs。
2. 只读检查更新日志、版本事实、制品、摘要、manifest、测试、E2E、审查、签名/公证和验收状态。任何 tracked 字节或候选字节变化都使原候选失效。
3. 报告 `Ready`/`Not ready`。本地 tag 已由 Git 发布生命周期在清理前完成；只有远端模式才已有远端 tag。本阶段不再创建 tag、推送、清理或上传渠道，也不把候选成功误报为渠道发布成功。

## 边界

- 绝不覆盖已发布版本或把同名 tag 移到另一提交；同名 tag 已在同一提交可幂等复用，指向不同提交必须停止。
- 不编造 tag、提交、摘要、候选、日期或验证结果。
- 普通构建不自动提交；只有明确发布由本 Skill 提交精确已复核范围。
- 构建/收集/验收只读发布上下文，不设置分支保护、线性、fast-forward-only、lease、atomic push 或 `Release` 分支规则。
- 就绪复核要求 manifest 保存结构化 `signingEvidence`；macOS 选择启用时还必须具有 `notarizationStatus: notarized-and-stapled`。本 Skill 不得在此重试或配置签名、公证或 stapling。
- 候选构建、验收与渠道发布是不同事件；只有真实渠道发布成功后才按记录规则写入 tracked 发布事实并调用 `$desktop-manage-version finalize-release`。
