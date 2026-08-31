---
name: desktop-configure-git-commits
description: 仅在用户明确要求配置 Git，或下一步将实际创建提交时，为独立仓库即时安装、检查和使用仓库级提交消息模板；不得因打开、检查或编辑仓库而提前配置。
---

# 配置有意义的 Git 提交

让每个提交表达一个完整、独立、可解释的变化，并为半年后的排查保留修改原因、行为影响和真实验证结果。

## 适用模式

- **安装**：用户明确要求配置提交模板，或已授权流程的下一步将实际创建提交且当前仓库尚未安装受管模板。
- **检查/修复**：下一步将实际创建提交时发现模板没有出现、本地配置漂移，或用户明确要求修复受管模板。
- **编写/复核**：准备提交、拆分逻辑提交，或检查现有提交消息是否准确。

进入仓库、读取状态、诊断、编辑、运行测试、生成脚手架、仅编写/复核提交消息或“以后可能会提交”都不触发安装、检查或修复。没有即将发生的实际提交，也没有用户明确配置请求时，不得运行本 Skill 的脚本或改写任何 Git 配置。项目初始化只有在全部脚手架与一次性裁剪完成、下一步就是创建唯一基线提交时，才满足即时触发条件。安装请求或该次提交授权当前仓库的本地配置与 Git 元数据变更，但不授权全局配置、提交、推送、标签或历史改写。

## 工作流程

1. 先确认用户已明确要求配置 Git，或已授权流程的下一步将实际运行 `git commit`；否则停止且不读取或设置提交模板配置。满足触发条件后，读取项目 `AGENTS.md`、当前 Git 状态和本次变更事实，确认传入目录的规范化路径恰好等于 `git rev-parse --show-toplevel`。父仓库、裸仓库和非独立目录都停止处理。
2. 安装或修复时，先使用本 Skill 自带的标准库脚本。它把受管模板逐字节安装到当前仓库的 Git common dir，并只通过 `git config --local` 设置 `commit.template`、`commit.cleanup=strip`、`commit.verbose=true` 与 `core.commentChar=#`：

   ```text
   python3 .agents/skills/desktop-configure-git-commits/scripts/configure_git_commit.py install --project-root .
   python3 .agents/skills/desktop-configure-git-commits/scripts/configure_git_commit.py check --project-root .
   ```

3. 若任一受管键已有不同值，脚本必须在写入前失败并报告冲突。只有用户明确批准替换当前仓库配置时才重跑 `install --replace`；不得把 `--replace` 当作默认恢复手段。不得运行 `git config --global`、`git config --system`，也不得修改用户身份、签名、凭据、远端或 hooks。
4. 编写或复核提交信息时读取 [提交消息规范](references/commit-convention.md)。先检查暂存差异是否只包含一个逻辑结果；无关变化保持未暂存或拆成后续提交，不得擅自重写已有历史。
5. 简单且意图明确的维护变化可以只使用一行 Conventional Commit 主题。非简单变化必须填写 `Why`、`Changes`、`Impact`、`Test`；`Why` 解释动机或根因，`Changes` 描述行为变化，`Impact` 说明兼容/数据/性能/API 影响，`Test` 只记录实际执行的验证。未运行时写 `Not run: <原因>`，不得伪造通过。
6. 创建提交前复核主题和正文与实际 diff 一致，不包含秘密、令牌、个人数据、临时调试内容或未跟踪生成物。用户没有要求创建提交时，若当前工作流也不强制产生提交，只返回建议消息，不运行 `install`/`check`，也不执行 `git commit`。

## 初始化接入

新下游完成全部脚手架检查和一次性能力裁剪后，只有当下一步就是创建唯一基线提交时，才即时建立或确认独立 Git 边界、保留本 Skill 并运行 `install` 与 `check`，再使用用户现有 Git 身份创建 `chore: initialize project`。不得在初始化表单、复制、身份改写、环境门禁、脚手架编写或测试阶段提前运行。该基线属于规范允许的简单单行提交。任何配置冲突、模板字节不一致或检查失败都阻断初始化；不得通过修改全局 Git 配置绕过。

## 完成输出

报告模式、规范 Git 根、受管模板状态、本地四项配置、是否发生替换、建议或实际提交消息，以及未执行的提交/推送/历史操作。安装和检查通过只证明本地模板接线正确，不证明提交内容本身有意义。
