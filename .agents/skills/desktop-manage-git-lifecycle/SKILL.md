---
name: desktop-manage-git-lifecycle
description: 在 Harness 源或终端下游 Git 项目中开始开发分支、把登记分支合并并推送默认主分支，以及在发布标签成功后精确清理本发布周期登记的分支与 Worktree；开始修复或功能、用户要求推送或发布时使用。
---

# 管理 Git 生命周期

使用自包含标准库 helper 管理一次发布之间的 Git 资源。新功能、问题修复或其他会写入仓库的开发工作开始前运行 `start`；用户要求“推送”时运行 `publish`；用户要求“发布”时运行 `release`。

## 命令

从项目根运行：

```text
python3 .agents/skills/desktop-manage-git-lifecycle/scripts/git_lifecycle.py inspect --project-root . [--remote <name>]
python3 .agents/skills/desktop-manage-git-lifecycle/scripts/git_lifecycle.py start --project-root . --summary <ascii-kebab> [--remote <name>]
python3 .agents/skills/desktop-manage-git-lifecycle/scripts/git_lifecycle.py track-worktree --project-root . --worktree <absolute-path> [--remote <name>]
python3 .agents/skills/desktop-manage-git-lifecycle/scripts/git_lifecycle.py publish --project-root . [--remote <name>]
python3 .agents/skills/desktop-manage-git-lifecycle/scripts/git_lifecycle.py release --project-root . --version <version-without-v> [--date YYYYMMDD] [--remote <name>]
```

`start` 从当前 HEAD 创建并切换到 `feature-<summary>-<Asia/Shanghai YYYYMMDD>`。本地同名分支存在时依次尝试 `-2`、`-3`；当前已经位于本周期登记的同摘要分支时返回幂等结果。当前 Worktree 即使处于 detached HEAD 也可直接开始；若它不是主 Worktree，helper 会在创建分支后把该 Worktree 的规范化精确路径和新分支一起登记，无需预先建立另一层 Task 分支或再调用 `track-worktree`。创建本地分支不要求配置远端。

远端选择优先沿用当前发布周期已经登记的精确名称；显式传入不同名称会以 `remote-conflict` 失败，不能在周期中途静默改绑。没有登记值时才依次选择 `origin`、唯一已配置远端，仍有歧义的真实推送/发布要求显式指定。流程不创建远端、不填写地址，也不处理凭据。

`track-worktree` 用于后来显式创建的内部单元 Worktree；它自行读取指定 Worktree 的具名分支，要求绝对路径和相同 Git common-dir，并把精确路径与分支加入本周期清单。主 Worktree、默认分支、分离 HEAD、其他仓库或发生所有权冲突的登记都会失败。

`publish` 要求可解析远端，并在任何主分支写入前确认全部登记分支仍存在、全部登记 Worktree 都没有未提交数据。即使命令从关联 Task Worktree 发起，它也会依据同一 Git common-dir 自动转到主 Worktree 执行后续操作。它先获取并普通合并远端默认分支的当前提交，再按创建顺序对尚未合入的登记分支执行普通 `git merge --no-edit`，保持主 Worktree 切换在该默认分支，以非强制 push 推送并复读。登记分支缺失、脏工作区、合并冲突或远端拒绝都会停止，绝不静默漏掉数据。它不创建标签，也不清理任何资源。

`release` 无论从主 Worktree 还是关联 Task Worktree 发起，都会先转到主 Worktree 执行同一 publish 流程，把已由远端默认分支确认的 HEAD 作为待发布记录原子落盘，再创建轻量标签 `v{version}-{YYYYMMDD}`，推送并复读远端。远端标签成功确认之前不会开始清理；同名标签指向同一提交时可安全重试，指向不同提交时失败。标签推送或清理中断后的重试只续跑这一个固定 HEAD，不会再次发布后来推进的主分支。确认后依次移除精确登记且干净的 Worktree、精确登记的远端分支、精确登记的本地分支；不强制移除脏 Worktree，不扫描名称前缀，也不触碰默认分支、主 Worktree 或未登记资源。每个清理成功项都会立即持久化，允许从中断处继续。

整个流程不创建 `Release` 或其他中转分支，不要求线性历史、祖先形态、快进、冻结 OID、租约或原子 ref 更新，也不设置任何分支门禁。普通合并冲突、脏数据保护、远端拒绝和删除目标身份复核属于 Git 结果或破坏性操作安全检查，不把某种分支历史形态规定为准入条件。

## 状态与输出

状态只保存在 Git common-dir 下的 `agent-first-harness/git-lifecycle.json`，不会写入项目受跟踪目录。它记录 schema、remote、默认分支、本周期精确分支和 Worktree、待完成发布，以及最近一次成功发布的 tag/head/date/version。所有会改变分支、状态、远端或清理资源的命令使用同一 common-dir 短时互斥，多个 Task 同时开始也不会相互覆盖登记；`inspect` 只读取原子状态文件。

所有正常结果和错误都是单行 JSON。错误返回非零退出码及稳定 `code`，消息不包含 Git 标准错误、远端 URL 或凭据。Git 子进程固定为非交互模式。
