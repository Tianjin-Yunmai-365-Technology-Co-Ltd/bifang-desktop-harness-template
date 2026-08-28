---
name: desktop-configure-git-commits
description: 为独立 Git 仓库安装、检查和使用仓库级提交消息模板；用于项目初始化、统一 Conventional Commit 主题与 Why/Changes/Impact/Test 正文，或修复本地 commit.template 配置。不得修改全局 Git 配置。
---

# 配置有意义的 Git 提交

让每个提交表达一个完整、独立、可解释的变化，并为半年后的排查保留修改原因、行为影响和真实验证结果。

## 适用模式

- **安装**：用户要求配置提交模板，或项目初始化正在建立新的独立 Git 仓库。
- **检查/修复**：模板没有出现、本地配置漂移，或受管模板升级后需要重新同步。
- **编写/复核**：准备提交、拆分逻辑提交，或检查现有提交消息是否准确。

仅编写或复核消息不授权修改 Git 配置。安装请求或项目初始化授权当前仓库的本地配置与 Git 元数据变更，但不授权全局配置、提交、推送、标签或历史改写。

## 工作流程

1. 读取项目 `AGENTS.md`、当前 Git 状态和本次变更事实，确认传入目录的规范化路径恰好等于 `git rev-parse --show-toplevel`。父仓库、裸仓库和非独立目录都停止处理。
2. 安装或修复时，先使用本 Skill 自带的标准库脚本。它把受管模板逐字节安装到当前仓库的 Git common dir，并只通过 `git config --local` 设置 `commit.template`、`commit.cleanup=strip`、`commit.verbose=true` 与 `core.commentChar=#`：

   ```text
   python3 .agents/skills/desktop-configure-git-commits/scripts/configure_git_commit.py install --project-root .
   python3 .agents/skills/desktop-configure-git-commits/scripts/configure_git_commit.py check --project-root .
   ```

3. 若任一受管键已有不同值，脚本必须在写入前失败并报告冲突。只有用户明确批准替换当前仓库配置时才重跑 `install --replace`；不得把 `--replace` 当作默认恢复手段。不得运行 `git config --global`、`git config --system`，也不得修改用户身份、签名、凭据、远端或 hooks。
4. 编写或复核提交信息时读取 [提交消息规范](references/commit-convention.md)。先检查暂存差异是否只包含一个逻辑结果；无关变化保持未暂存或拆成后续提交，不得擅自重写已有历史。
5. 简单且意图明确的维护变化可以只使用一行 Conventional Commit 主题。非简单变化必须填写 `Why`、`Changes`、`Impact`、`Test`；`Why` 解释动机或根因，`Changes` 描述行为变化，`Impact` 说明兼容/数据/性能/API 影响，`Test` 只记录实际执行的验证。未运行时写 `Not run: <原因>`，不得伪造通过。
6. 创建提交前复核主题和正文与实际 diff 一致，不包含秘密、令牌、个人数据、临时调试内容或未跟踪生成物。用户没有要求创建提交时，只返回建议消息，不执行 `git commit`。

## 初始化接入

新下游完成脚手架和一次性能力裁剪后、创建唯一基线提交前，必须保留本 Skill，运行 `install` 与 `check`，再使用用户现有 Git 身份创建 `chore: initialize project`。该基线属于规范允许的简单单行提交。任何配置冲突、模板字节不一致或检查失败都阻断初始化；不得通过修改全局 Git 配置绕过。

## 完成输出

报告模式、规范 Git 根、受管模板状态、本地四项配置、是否发生替换、建议或实际提交消息，以及未执行的提交/推送/历史操作。安装和检查通过只证明本地模板接线正确，不证明提交内容本身有意义。
