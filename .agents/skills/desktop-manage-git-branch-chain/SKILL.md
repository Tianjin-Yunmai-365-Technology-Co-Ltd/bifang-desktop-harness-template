---
name: desktop-manage-git-branch-chain
description: 为下游项目建立并推送严格串行的 feature 分支链，并作为 desktop-prepare-release 的机械下游直接关闭整链到动态默认 main/master；开始需求或缺陷、推送活动叶子，或已进入显式发布准备时使用，不能单独发起正式发布。
---

# 管理 Git 分支链

使用标准库 helper 管理产品开发分支，不创建 Codex 左侧 Task，也不把 Task/Worktree 分支冒充产品 feature 分支。功能与缺陷统一使用 `feature-{ascii-kebab摘要}-{YYYYMMDD}`；日期取 Asia/Shanghai 当日，摘要由 Agent 先翻译或归一化为小写 ASCII kebab-case。

## 固定边界

- 远端 `HEAD` 动态解析出的默认分支必须精确为 `main` 或 `master`。它在日常 `start`、`integrate-task`、`publish` 和普通 Git 写入中只读；只有经 `$desktop-prepare-release` 明确授权的 `release` 原子事务可把它严格快进到 closing commit。helper 不创建或使用 `Release` 中转分支。
- 只对升级前已经存在、当前本地/远端完全推送且被活动链冻结为精确基线的 legacy `Release` 提供一次迁移：默认旧 OID 必须是该基线祖先，发布事务以精确旧 OID lease 同时推进默认分支并删除 legacy `Release` 与登记 feature refs；迁移后从默认分支继续。不得新建、更新或把 `Release` 用作候选分支。
- helper 运行时要求稳定 Git `>=2.36.0`，以使用 `git worktree list --porcelain -z`；低版本、`.rc` 预发布、版本不可解析或命令失败都停止，不尝试兼容降级。所有 Git 与提交门禁子进程固定 `GIT_TERMINAL_PROMPT=0`、`GCM_INTERACTIVE=Never`，不得等待凭据交互。
- remote 显式传入时只接受仓库已配置的安全名称；否则优先 `origin`，没有 `origin` 时只接受唯一且名称安全的 remote，零个或多个候选都停止。remote 必须只有一个相同的 fetch/push 目的地。
- 状态唯一写入 `<project-root>/.harness/git-branch-chain.json`。初始化不得预创建它；已有下游缺失时，只有首次 `start` 可按 `assets/git-branch-chain.json` 的 schema 创建。
- 分支链严格串行。没有活动链时，每条新链都从实时 `ls-remote --symref <remote> HEAD` 得到的默认分支及其精确 OID 建立，且当前本地同名默认分支/HEAD 必须一致；存在活动链时下一条只能从 active leaf 的当前 HEAD 建立，且父分支本地与远端 OID 必须完全一致。
- 一条 active feature leaf 同时最多只允许一个产品写入 `codex/task-*`；该 Task 不得再创建 sibling write `codex/unit-*`，只读 Subagent 可以并行。协调方必须从登记 active leaf Worktree 使用 `integrate-task` 把已冻结 Task OID 条件快进到本地叶子，再由 `publish` 完整推送；下一个写入 Task 只能从新的远端 active leaf HEAD 创建。
- 禁止 glob、前缀扫描、无精确期望 OID 的 force push、非快进、rebase、cherry-pick和隐式冲突处理。默认分支更新只能是发布事务内基于冻结旧 OID 的严格 fast-forward；唯一 force 形式是同一事务为删除 `.harness/git-branch-chain.json` 本轮精确登记的每个 feature ref 使用 `--force-with-lease=<ref>:<oid>`。不得枚举或删除 `codex/*`、Task/单元分支、未知 feature ref 或链外分支，也没有用户后续 Merge/PR 步骤。
- 所有写命令要求独立 Git 顶层、clean 工作树、可解析的具名分支和正常 hooks；实际创建提交的路径还要求有效提交身份及已安装且检查通过的受管提交模板。helper 只读复核适用前置并失败关闭，不自行配置身份或模板、不绕过 hooks、不创建 remote、不移除 Worktree。

## 命令

从项目根运行：

```text
python3 .agents/skills/desktop-manage-git-branch-chain/scripts/git_branch_chain.py inspect --project-root . [--remote <name>]
python3 .agents/skills/desktop-manage-git-branch-chain/scripts/git_branch_chain.py start --project-root . [--remote <name>] --summary <ascii-kebab>
python3 .agents/skills/desktop-manage-git-branch-chain/scripts/git_branch_chain.py integrate-task --project-root . [--remote <name>] --task-branch codex/task-<task-slug> --task-worktree <absolute-path> --task-head <40-lowercase-oid>
python3 .agents/skills/desktop-manage-git-branch-chain/scripts/git_branch_chain.py publish --project-root . [--remote <name>]
python3 .agents/skills/desktop-manage-git-branch-chain/scripts/git_branch_chain.py verify-release-review --project-root . [--remote <name>]
python3 .agents/skills/desktop-manage-git-branch-chain/scripts/git_branch_chain.py release --project-root . [--remote <name>] --review-selection <enabled|disabled> --review-status <passed|"Not run"> --review-source-head <40-lowercase-oid> [--reviewed-source-commit <same-oid> --review-check <check>... --review-evidence-summary <public-one-line> | --review-reason <public-one-line> --review-remaining-risk <public-one-line>] --performance-selection <enabled|disabled|not-applicable> --performance-source <source> [--performance-reason <public-one-line> --performance-remaining-risk <public-one-line>] --macos-signing-selection <enabled|disabled|not-applicable> --macos-signing-source <source> [--macos-signing-reason <public-one-line> --macos-signing-remaining-risk <public-one-line>]
```

### inspect

只读报告当前分支、HEAD、clean 状态、remote、动态默认分支及状态文件。不得据报告自动开始分支、发布或清理。

### start

`start` 将立即创建元数据提交；紧邻运行命令前必须调用 `$desktop-configure-git-commits`，依次执行 `identity-report`、必要时 `identity-bootstrap`、`identity-check`、`install`、`check`。任一报告、安装、冲突或复核失败都停止，不得仅检查身份便继续。

开始第一条时必须位于远端动态默认分支的精确本地基线；唯一升级兼容是位于前述完全推送且满足祖先条件的 legacy `Release`，该链负责在本轮发布中迁移并删除它。开始后续条目时必须位于 active leaf。helper 冻结 `remote`、`defaultBranch/defaultHead`、`baseBranch/baseHead`、`activeLeaf`、活动 phase 和每段父头，先证明父头已完整推送，再切出精确 feature 分支、原子写状态、用正常 `git commit` 提交元数据、无 force push并复读远端 OID。提交后必须证明 hook 未改变预期分支、父 OID、规范状态字节或夹带其他路径；push 后再次要求 clean 且分支/HEAD 未变。失败时保留可诊断状态，不谎报成功；已有 active leaf 可用 `publish` 重试推送。

### integrate-task

`integrate-task` 只能由协调方在登记 active leaf 的 Worktree 中调用；`--task-branch` 必须精确匹配由独立 ASCII `task-slug` 形成的 `codex/task-<task-slug>`，`--task-worktree` 必须是同一仓库登记且只检出该分支的另一个独立 Worktree，`--task-head` 必须是已选定的 40 位小写提交 OID。显示标题、返回的 thread id 和 Task 状态都不能代替这三个参数。

命令在写 ref 前同时要求协调与 Task Worktree clean、当前分支/本地 OID 精确等于活动叶子、活动叶子与登记远端 OID 完全一致、整条 feature 链父头和远端快照仍有效、Task ref 未出现在远端、Task HEAD 是活动叶子的非空严格线性后代且没有 merge、Task 范围内任一提交都未触碰 `.harness/git-branch-chain.json`（后续恢复原字节也不例外）。所有登记 feature refs 只能由当前协调 Worktree 占用活动叶子，目标 Task ref 只能由声明 Worktree 占用；任何其他已检出的 `codex/task-*`/`codex/unit-*` 或链内 feature ref 都阻断整合。任一名称、OID、祖先、状态、Worktree 登记或占用在前置检查中不符，都保持 active leaf 不变并失败关闭；写 ref 后发现 hook 或并发竞态则拒绝报告成功，并保证本命令没有改变远端。

通过全部前置后只执行 `git merge --ff-only <task-head>` 更新本地 active leaf，并复核分支、HEAD、两个 Worktree、完整状态、链内 refs、远端叶子和动态默认分支均未竞态漂移。命令绝不 push、不删除 Task Worktree/ref，也不改写状态 JSON；成功固定返回 `status: task-integrated`、旧/新 OID、`published: false` 和 `nextCommand: publish`。随后单独运行 `publish`，由它把登记 active leaf 快进到远端并复核活动状态；只有 publish 成功后才允许按 Task 清理规则移除对应 Worktree/ref或创建下一个写入 Task。

### publish

只允许推送 active leaf，包括由 `integrate-task` 完成的本地条件快进。要求 clean，远端缺失或是本地 HEAD 的祖先；远端领先或分叉时停止，不 pull、rebase、force 或改用其他分支。push 后必须复读并匹配精确 OID，再复核工作树 clean、当前分支、HEAD 与完整活动状态快照；hook 改变任一项都不得报告成功。

### verify-release-review

这是候选构建消费关闭状态前的只读入口。它要求当前分支精确为 clean 动态默认 `main`/`master`，HEAD 是 `lastClosedChain` 的唯一 closing commit，本地/远端默认 ref 均等于该提交，发布原子事务和本地登记 feature ref 清理都已完成，且 `releaseReview` 与 `candidateSelections` schema、祖先关系、逐提交后处理路径和范围 SHA-256 全部复算一致；成功返回 `release-review-verified`、`releaseBranch`、同一 `releaseHead` 与两份规范化信封。活动链、旧式无信封关闭提交、尚待远端更新或本地清理、状态/历史漂移都返回非零，构建 Skill 不得自行降级或改从对话参数取值。

### release

`release` 不是独立发布入口。任何正式发布请求必须先路由 `$desktop-prepare-release`，在任何发布提交前锁定本次 `reviewSelection`，并按选择形成当前已通过的审查证据或明确的 `Not run` 记录；只有该流程可把本命令作为下游 Git 机械 consumer 调用。仅命中本 Skill、用户泛称“合并到主分支”或具备 Git 条件，都不得单独执行 `release`；helper 本身不解析、补写或推断语义审查证据。

首次关闭必须显式传入完整审查信封与 `candidateSelections`，不能只给裸选择。审查两种选择都要求 `--review-status`、冻结链上的 `--review-source-head`；启用时状态精确为 `passed`，还要显式传入等于源码终点的 `--reviewed-source-commit`、五个且仅有五个 `--review-check`（`behavior-correctness`、`core-adapter-boundary`、`external-contracts`、`responsibility-and-size`、`temporary-markers`）和无秘密的单行 `--review-evidence-summary`，不得传 `Not run` 原因/风险；关闭时状态精确为 `Not run`，必须传入无秘密的单行 `--review-reason`/`--review-remaining-risk`，且不得传完成项、证据摘要或已审查提交。性能与 macOS 签名还必须分别给出选择/来源：不适用时两者都为 `not-applicable` 且无原因/风险；性能启用来源只接受 `requested|product-required|channel-required`，关闭只接受 `requested|not-requested` 并要求原因/风险；macOS 签名启用来源只接受 `configured|requested|channel-required`，关闭固定 `not-requested` 并要求原因/风险。所有公开说明去除首尾空白、禁止控制字符且不超过 500 字符。参数只表达 prepare-release 已经产生的结论；helper 只做 schema、Git 图和路径绑定校验，缺少、混合或矛盾字段一律在关闭提交前失败。

`release` 仅在 `activeChain` 存在的首次关闭路径创建关闭状态提交；紧邻该次命令前再次调用 `$desktop-configure-git-commits`，完整执行同一 `identity-report` → 必要 bootstrap → `identity-check` → `install` → `check` 顺序，不能复用较早结果。远端已完成后的幂等本地收尾不重复提交，也不要求或运行提交门禁。

首次关闭只允许 active leaf，要求 clean，且状态中的全部 feature 分支都存在、父链冻结点连续、本地/远端 OID 完全一致，冻结的默认分支旧 OID 仍精确匹配且是 closing commit 的祖先。已有关闭 manifest 的重试只允许位于 closing leaf 或同名默认分支；远端仍 pending 时重新复核完整本地 manifest 与冻结默认 ref 后才尝试同一原子事务，远端已 complete 时不得重复 push，只完成本地收尾。

helper 在叶子把 `activeChain` 关闭为不可变 `lastClosedChain` manifest，记录基线、有序分支、各自 `preCloseHead`、完整 `releaseReview` 与 `candidateSelections`，并把 `closingHead` 固定为 `null` 以避免提交 OID 自引用。审查信封保存选择/状态、基线、源码终点、固定树差异 SHA-256，以及启用时由调用方明确提交的完成项/证据摘要/已审查提交，或关闭时的 `Not run` 原因/风险；候选选择保存性能与 macOS 签名的适用性、选择、来源及关闭原因/风险。两者与链状态由同一个 closing commit 原子封存。helper 逐提交检查 `sourceHead..preCloseHead`，即使后续恢复最终树也不允许该区间触碰 `release-notes.json` 和日期 Changelog 以外的路径。真实 closing head 必须是该 manifest 提交的 OID，且是末尾 `preCloseHead` 的唯一直接非 merge 子提交。随后一次 `git push --atomic` 在默认分支冻结旧 OID 的 lease 下把 closing commit 严格快进到 `refs/heads/<defaultBranch>`，并以逐 ref `--force-with-lease` 删除状态中精确列出的远端 feature refs。唯一 legacy 迁移还以冻结旧 OID lease 删除状态基线指向的 `Release`，正常流程没有该 ref。远端成功后复核默认 ref 与精确待删 refs，再创建或切换本地同名默认分支、仅 fast-forward，并用单次 `git update-ref` CAS 事务完成同样的精确本地清理。

默认分支或任一登记 ref 的冲突/竞态、非快进、远端不支持原子事务，或相关分支被其他 Worktree 占用，都必须在受管远端事务变化前停止。正常路径不会发送针对缺失 `Release` 的删除 refspec，因为 Git 无法安全原子断言一个未参与更新的 ref 继续缺失；若它恰在远端广告后由外部并发创建，helper 保留该未知 ref，受管默认分支/feature 原子事务可能已经完成，但后置复核必须报告可恢复冲突而不能宣称完成，待外部按其所有权精确移除后只做幂等本地收尾。legacy 迁移中已冻结的 `Release` 若在失败事务后已被精确删除，则重试把该删除视为已完成，只推进默认分支并清理登记 feature；若期间重新出现则同样保留并报告冲突。远端受管事务已成功、但本地切换或清理因随后竞态失败时，再次运行同一 `release` 可从 closing leaf 或同名默认分支恢复 `lastClosedChain` 并幂等完成本地清理；重试可省略全部审查/候选选择参数，若重复传入则必须逐字段等于已封存信封。升级前缺少任一新信封的旧关闭提交只允许在旧式远端 `Release` 事务已经完整完成时执行 local-only 收尾，返回 `legacy-local-cleanup-complete` 且绝不能新推进远端默认分支；随后须从该 `Release` 开始一次迁移链。不得重写未知远端 ref 或把部分状态宣称为完成；删除后仍须复核当前默认分支、HEAD、clean 状态和完整关闭 manifest。

## 输出

解析单行 JSON。成功状态为 `inspected`、`started`、`task-integrated`、`published`、`already-published`、`legacy-local-cleanup-complete`、`release-review-verified` 或 `released`；失败输出 `status=error` 和脱敏原因并返回非零。报告实际 branch/OID、Task 是否仍待 publish，以及是否完成默认 ref 原子推进和远端/本地登记 feature 清理；`legacy-local-cleanup-complete` 只表示升级前旧事务的本地收尾完成且仍需迁移，只有 `released` 且远端默认 ref 复读到 closing commit 时才描述为 Git 默认分支发布完成，不能把本地整合、提交、活动叶 push、候选构建或部分收尾冒充这一结果。
