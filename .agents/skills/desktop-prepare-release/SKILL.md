---
name: desktop-prepare-release
description: 使用仓库声明的版本方案准备发布元数据、发布上下文、主分支版本 tag 与候选；仅在用户明确发布时使用。
---

# 准备发布

把已完成范围提交，生成双语更新日志与可复核发布上下文，然后调用 `$desktop-manage-git-lifecycle release`。该生命周期先把本周期登记分支普通合并到远端动态默认分支、切换并推送主分支，再创建并推送 `v{版本}-{YYYYMMDD}`，远端 tag 复读成功后才精确删除本周期登记的 Worktree、远端分支和本地分支。

用户明确说“发布”即授权本次已复核范围的本地提交、主分支推送、版本 tag 推送、登记资源清理和紧随其后的候选构建；不授权配置 remote/凭据、历史改写、渠道上传、商店提交或未登记资源删除。流程不创建或使用 `Release` 分支，也不设置保护分支、严格线性、fast-forward-only、lease 或 atomic push 门禁。

## 候选前流程

1. 读取 `docs/RELEASE.md`、版本事实源、最新 Product Spec，以及真实存在且与本次发布有关的 Changelog/Verification。确认用户明确提出发布。调用 `$desktop-manage-git-lifecycle inspect` 读取本周期登记资源；状态只用于精确合并与清理，不限制当前分支形态。
2. 在任何提交或发布元数据写入前解析当次 `reviewSelection: enabled | disabled`，并锁定本次全部选择：
   - `reviewSelection: enabled | disabled`：当前发布请求已经明确时直接复用；安全、隐私、不可逆操作、对外兼容契约或产品/渠道硬要求强制启用并记录来源；否则询问用户一次。
   - 含 GUI 时同轮解析 `performanceSelection: enabled | disabled` 及来源；当前发布请求已经明确时直接复用，产品/渠道硬要求强制启用并记录来源，否则询问用户一次；非 GUI 为 `not-applicable`。
   - 含 macOS GUI 的 `macosSigningSelection: enabled | disabled` 及来源；不适用时为 `not-applicable`。签名关闭时不得探测本机签名条件。`system_notification = enabled` 且签名关闭时立即 `Not ready`。
   这些选择属于单次发布，写入 `.harness/release-context.json`，不修改通用策略。同一发布的中断重试复用已提交上下文，新发布重新解析。
3. 使用已声明版本方案。Harness 版本来自 `Version.md`，按 `Asia/Shanghai` 的 `YYYYMMDDHHMM` 时间版本；下游不得继承 Harness `Version.md`，而是通过 `$desktop-manage-version check --phase release` 使用开发阶段已确定的语义化目标版本。发布准备不在此补算 Minor/Patch，也不得另算、手工覆盖或重置正式发布周期。机器版本不带 `v`，可见版本只带一个小写 `v`。
4. 要求项目根是独立 Git 顶层目录并存在可解析的当前 HEAD；初始化中尚未生成的 `HEAD` 必须声明 `Not ready`，不能伪造提交。运行只读检查，并逐项查看 staged、unstaged、untracked 与真实 diff：

   ```text
   python3 .agents/skills/desktop-prepare-release/scripts/release_git.py inspect --project-root .
   ```

   只提交已完成、范围明确、无秘密且属于本次发布的路径。归属歧义、半成品、无法解释的 staged 内容、令牌/凭据/个人数据、临时调试、缓存或不应跟踪的生成物都必须停止。分支名不构成提交门禁；快照中的 branch/HEAD 只用于阻止复核后切换或并发改写。
5. 紧邻真实提交调用 `$desktop-configure-git-commits`，只补仓库 local 身份和模板。用最新 `statusSha256` 与所有已复核路径提交源码；helper 使用 literal pathspec、运行正常 hooks、拒绝部分工作树、秘密和 hook 改写：

   ```text
   python3 .agents/skills/desktop-prepare-release/scripts/release_git.py commit --project-root . --expected-status-sha256 <sha256> --message "<Conventional Commit>" --path <reviewed-path> [--path <reviewed-path> ...]
   ```

   明确发布请求已经授权此提交，不再询问第二次审批。脚本使用 literal pathspec，正常运行 hooks 且绝不传 `--no-verify`。工作树原本 clean 时不创建空源码提交。提交后的 clean HEAD 记为 `sourceHead`。
6. 按选择形成 `releaseReview`：
   - `enabled`：以最近一次真实发布提交到 `sourceHead` 为范围，完成行为正确性、core/adapter 边界、对外契约、职责/规模、临时标记五项检查；Harness 源另运行 `python3 -B scripts/validate_harness.py --release-review`。只有全部通过才记录 `passed`、五项固定检查、`reviewedSourceCommit = sourceHead` 与公开摘要。
   - `disabled`：记录 `reviewStatus: Not run`、公开原因与剩余风险，不生成审查证据。
   提交范围、秘密、必要测试、签名和渠道要求不受该选择影响。`scopeBase`/`scopeDiffSha256` 只描述审查范围，不用来约束分支拓扑。
7. 从真实发布 tag/记录找到上一次发布到 `sourceHead` 的变化范围。首发使用仓库起点；历史冲突时停止，不猜测。整理两类双语更新日志：`功能优化` 与 `问题修复` 各不超过 10 项、总计至少一项、`zh-CN`/`en-US` 数量顺序和事实一致。用标准库 helper 原子维护并双语渲染复核：

   ```text
   python3 .agents/skills/desktop-prepare-release/scripts/release_notes.py upsert --file release-notes.json --release-date YYYY-MM-DD --version <version> [--feature-optimization-zh-cn <text> --feature-optimization-en-us <text>]... [--bug-fix-zh-cn <text> --bug-fix-en-us <text>]...
   python3 .agents/skills/desktop-prepare-release/scripts/release_notes.py check --file release-notes.json --expected-version <version>
   python3 .agents/skills/desktop-prepare-release/scripts/release_notes.py render --file release-notes.json --locale zh-CN
   python3 .agents/skills/desktop-prepare-release/scripts/release_notes.py render --file release-notes.json --locale en-US
   ```

   文件固定使用 `schemaVersion: 2` 并只保留最近 5 版。中文渲染保持 `-----------更新日志 {发布日期} {发布版本}----------`、`###功能优化`、`###问题修复`；英文渲染保持 `-----------Release notes {release date} {release version}----------`、`###Feature optimizations`、`###Bug fixes`。Changelog 仅在独立规则触发时更新；普通缺陷仍进入发布日志，但不为此制造 Changelog。
8. 用同一远端、版本、日期、`sourceHead`、`releaseReview` 和候选选择生成规范上下文。`releaseDate` 使用 `YYYY-MM-DD`，helper 自动派生 `expectedTag: v{version}-{YYYYMMDD}` 和远端动态默认分支：

   ```text
   python3 .agents/skills/desktop-prepare-release/scripts/release_context.py write --project-root . --source-head <sourceHead> --version <version> --release-date YYYY-MM-DD --remote <remote> --review-selection <enabled|disabled> --scope-base <oid> --scope-diff-sha256 <sha256> <review arguments> <candidate selection arguments>
   python3 .agents/skills/desktop-prepare-release/scripts/release_context.py check --project-root . --expected-version <version> --expected-sha256 <releaseContextSha256>
   ```

   `.harness/release-context.json` 必须与发布日志及确实触发的 Changelog 一起作为第二个精确范围提交。再次运行 `release_git.py inspect`、配置提交身份并用 `release_git.py commit` 提交所有变化；无变化不创建空提交。
9. 要求最终工作树 clean，调用：

   ```text
   python3 .agents/skills/desktop-manage-git-lifecycle/scripts/git_lifecycle.py release --project-root . --version <version> --date YYYYMMDD
   ```

   helper 必须先普通合并本周期登记分支，切到动态默认分支并推送；再创建/复用仅在同一提交上的轻量 tag、推送并复读远端 tag；最后按清单依次删除登记 Worktree、远端分支和本地分支。tag 创建、推送或复读失败时不得开始任何删除。清理可按资源幂等重试，但不得扫描前缀、删除主分支或未登记资源。
10. 生命周期成功后锁定当前 40 位 HEAD 为候选 `sourceCommit`，并验证发布上下文的 tracked 字节、摘要、版本、clean 当前分支、远端默认分支和远端 tag 都指向该 HEAD：

   ```text
   python3 .agents/skills/desktop-prepare-release/scripts/release_context.py verify --project-root . --expected-version <version> --expected-sha256 <releaseContextSha256> --expected-head <sourceCommit>
   ```

   `sourceHead` 是审查/发布日志来源提交，`sourceCommit` 是完成普通合并后被主分支和 tag 同时指向的候选提交；两者不要求相等，也不施加线性历史或只允许特定提交形态的门禁。
11. 按接口调用 `$desktop-build-tauri-release` 或 `$desktop-build-rust-release`。构建只另外解析本次 E2E 选择，并从已提交的发布上下文读取审查、性能和签名选择；构建前与写 manifest 前均重新运行发布上下文 `verify`。修复候选问题时通过 `$desktop-implement-change` 自动建立新开发分支，重新提交并执行本流程。

发布准备只形成提交、更新日志、上下文和 Git 发布结果，不得在此运行任一测试，绝不得在发布准备中运行冒烟/E2E；真实候选构建负责全量测试。候选验收后只允许 `check`/`render` 读取发布日志，任何字节变化都必须形成新提交并重走发布生命周期。`release/` 目录存在绝不表示已满足发布就绪条件。

## 就绪复核

1. 只接受 `$desktop-verify-delivery` 给出的完整 `Milestone accepted` 候选。运行发布上下文 `verify`，要求候选 manifest 的 `sourceCommit`、版本、`releaseContextSha256`、`releaseReview`、`candidateSelections` 与当前上下文逐字段一致。
2. 只读检查更新日志、版本事实、制品、摘要、manifest、测试、E2E、审查、性能、签名/公证和验收状态。任何 tracked 字节或候选字节变化都使原候选失效。
3. 报告 `Ready`/`Not ready`。tag 已由 Git 发布生命周期在清理前完成；本阶段不再创建 tag、推送、清理或上传渠道，也不把候选成功误报为渠道发布成功。

## 边界

- 绝不覆盖已发布版本或把同名 tag 移到另一提交；同名 tag 已在同一提交可幂等复用，指向不同提交必须停止。
- 不编造 tag、提交、摘要、候选、日期或验证结果。
- 普通构建不自动提交；只有明确发布由本 Skill 提交精确已复核范围。
- 构建/收集/验收只读发布上下文，不设置分支保护、线性、fast-forward-only、lease、atomic push 或 `Release` 分支规则。
- 就绪复核要求 manifest 保存结构化 `signingEvidence`；macOS 选择启用时还必须具有 `notarizationStatus: notarized-and-stapled`。本 Skill 不得在此重试或配置签名、公证或 stapling。
- 候选构建、验收与渠道发布是不同事件；只有真实渠道发布成功后才按记录规则写入 tracked 发布事实并调用 `$desktop-manage-version finalize-release`。
