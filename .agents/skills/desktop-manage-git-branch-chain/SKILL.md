---
name: desktop-manage-git-branch-chain
description: 为下游项目建立并发布严格串行、完整推送的 feature 分支链；仅在用户要求开始下一项功能或缺陷工作、推送当前叶子，或把整链发布到固定 Release 分支时使用。
---

# 管理 Git 分支链

使用标准库 helper 管理产品开发分支，不创建 Codex 左侧 Task，也不把 Task/Worktree 分支冒充产品 feature 分支。功能与缺陷统一使用 `feature-{ascii-kebab摘要}-{YYYYMMDD}`；日期取 Asia/Shanghai 当日，摘要由 Agent 先翻译或归一化为小写 ASCII kebab-case。

## 固定边界

- 集成分支精确为 `Release`。`main`、`master` 和远端动态默认分支永远只读；若 `Release` 是默认分支，立即停止。
- helper 运行时要求稳定 Git `>=2.36.0`，以使用 `git worktree list --porcelain -z`；低版本、`.rc` 预发布、版本不可解析或命令失败都停止，不尝试兼容降级。所有 Git 与提交门禁子进程固定 `GIT_TERMINAL_PROMPT=0`、`GCM_INTERACTIVE=Never`，不得等待凭据交互。
- remote 显式传入时只接受仓库已配置的安全名称；否则优先 `origin`，没有 `origin` 时只接受唯一且名称安全的 remote，零个或多个候选都停止。remote 必须只有一个相同的 fetch/push 目的地。
- 状态唯一写入 `<project-root>/.harness/git-branch-chain.json`。初始化不得预创建它；已有下游缺失时，只有首次 `start` 可按 `assets/git-branch-chain.json` 的 schema 创建。
- 分支链严格串行。远端已有 `Release` 时第一条从本地/远端一致的 `Release` 建立；首次尚无 `Release` 时，从实时 `ls-remote --symref <remote> HEAD` 得到的默认分支及其精确 OID 建立。下一条只能从 active leaf 的当前 HEAD 建立，且父分支本地与远端 OID 必须完全一致。
- 一条 active feature leaf 同时最多只允许一个产品写入 `codex/task-*`；该 Task 不得再创建 sibling write `codex/unit-*`，只读 Subagent 可以并行。下一个写入 Task 必须等待前一个结果以 `ff-only` 整合并由 `publish` 完整推送后，再从新的 active leaf HEAD 创建。
- 禁止 glob、无精确期望 OID 的 force push、非快进、rebase、cherry-pick、隐式冲突处理及对默认分支的任何写入；唯一 force 形式是发布原子事务为删除每个登记 feature ref 使用的精确 `--force-with-lease=<ref>:<oid>`。helper 永不提供或执行 `Release` 到默认分支的命令；只报告 `Release`，最终 Merge/PR 由用户自行操作。
- 所有写命令要求独立 Git 顶层、clean 工作树、可解析的具名分支和正常 hooks；实际创建提交的路径还要求有效提交身份及已安装且检查通过的受管提交模板。helper 只读复核适用前置并失败关闭，不自行配置身份或模板、不绕过 hooks、不创建 remote、不移除 Worktree。

## 命令

从项目根运行：

```text
python3 .agents/skills/desktop-manage-git-branch-chain/scripts/git_branch_chain.py inspect --project-root . [--remote <name>]
python3 .agents/skills/desktop-manage-git-branch-chain/scripts/git_branch_chain.py start --project-root . [--remote <name>] --summary <ascii-kebab>
python3 .agents/skills/desktop-manage-git-branch-chain/scripts/git_branch_chain.py publish --project-root . [--remote <name>]
python3 .agents/skills/desktop-manage-git-branch-chain/scripts/git_branch_chain.py release --project-root . [--remote <name>]
```

### inspect

只读报告当前分支、HEAD、clean 状态、remote、动态默认分支及状态文件。不得据报告自动开始分支、发布或清理。

### start

`start` 将立即创建元数据提交；紧邻运行命令前必须调用 `$desktop-configure-git-commits`，依次执行 `identity-report`、必要时 `identity-bootstrap`、`identity-check`、`install`、`check`。任一报告、安装、冲突或复核失败都停止，不得仅检查身份便继续。

开始第一条时必须位于上述 `Release` 或首发远端默认分支的精确基线；开始后续条目时必须位于 active leaf。helper 冻结 `remote`、`defaultBranch/defaultHead`、`baseBranch/baseHead`、`activeLeaf`、活动 phase 和每段父头，先证明父头已完整推送，再切出精确 feature 分支、原子写状态、用正常 `git commit` 提交元数据、无 force push并复读远端 OID。提交后必须证明 hook 未改变预期分支、父 OID、规范状态字节或夹带其他路径；push 后再次要求 clean 且分支/HEAD 未变。失败时保留可诊断状态，不谎报成功；已有 active leaf 可用 `publish` 重试推送。

### publish

只允许推送 active leaf。要求 clean，远端缺失或是本地 HEAD 的祖先；远端领先或分叉时停止，不 pull、rebase、force 或改用其他分支。push 后必须复读并匹配精确 OID，再复核工作树 clean、当前分支、HEAD 与完整活动状态快照；hook 改变任一项都不得报告成功。

### release

`release` 仅在 `activeChain` 存在的首次关闭路径创建关闭状态提交；紧邻该次命令前再次调用 `$desktop-configure-git-commits`，完整执行同一 `identity-report` → 必要 bootstrap → `identity-check` → `install` → `check` 顺序，不能复用较早结果。远端已完成后的幂等本地收尾不重复提交，也不要求或运行提交门禁。

首次关闭只允许 active leaf，要求 clean，且状态中的全部 feature 分支都存在、父链冻结点连续、本地/远端 OID 完全一致。本地 `Release` 若存在必须等于链 base，首发可不存在；远端 `Release` 必须等于该 base，首次发布可不存在。已有关闭 manifest 的重试只允许位于 closing leaf 或 `Release`；远端仍 pending 时重新复核完整本地 manifest 与冻结 `Release` 后才尝试同一原子事务，远端已 complete 时不得重复 push，只完成本地收尾。

helper 在叶子把 `activeChain` 关闭为不可变 `lastClosedChain` manifest，记录基线、有序分支及各自 `preCloseHead`，并把 `closingHead` 固定为 `null` 以避免提交 OID 自引用；真实 closing head 必须是该 manifest 提交的 OID，且是末尾 `preCloseHead` 的唯一直接非 merge 子提交。随后一次 `git push --atomic` 把该提交快进到 `refs/heads/Release`，并以逐 ref `--force-with-lease` 比较删除状态中精确列出的远端 feature refs。远端成功后复核 `Release`、feature refs 与默认分支 OID，再创建或切换本地 `Release`、仅 fast-forward，并用单次 `git update-ref` CAS 事务删除精确本地分支。

冲突、竞态、未知 ref、非快进、远端不支持原子事务或任何 feature/`Release` 被其他 Worktree 占用，都必须在远端删除前停止。若远端原子事务已成功、但本地切换或清理因随后发生的竞态失败，再次运行同一 `release` 可从关闭叶提交恢复 `lastClosedChain`，在叶子或基线 `Release` 上幂等完成本地清理；不得重写远端或把部分状态宣称为完成。删除后仍须复核当前 `Release`、HEAD、clean 状态和完整关闭 manifest。

## 输出

解析单行 JSON。成功状态为 `inspected`、`started`、`published`、`already-published` 或 `released`；失败输出 `status=error` 和脱敏原因并返回非零。报告实际 branch/OID 和是否完成远端、本地清理，不把提交、push、候选构建或 `Release` 更新描述为默认分支已发布。
