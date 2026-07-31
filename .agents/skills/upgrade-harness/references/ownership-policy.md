# Harness 升级所有权策略

## 目的

本策略说明 `$upgrade-harness` 如何区分可更新工程资产与下游项目事实。机器匹配规则位于同目录 `ownership-manifest.json`；两者冲突时先停止，不自行选择更宽松的一方。

## 五类主要所有权

- `managed`：由 Harness 维护且候选已经完成下游身份渲染的纯工程文件。只有既有文件仍等于旧基线时才能自动更新；新增和删除仍需人工逐项处理。
  - `managed-self` 是 `managed` 的机器子模式，不是第六类所有权；它表示升级器自身，必须在其他安全变更后最后应用并由新版复验。
- `merge-sections`：Harness 与下游共同拥有的文件，例如 `AGENTS.md`、README 和规范文档。必须按章节合并，禁止整文件覆盖。
- `conditional`：只在已选接口或已启用能力中存在的工程资产。先确认下游选择，再人工或由对应 adapter Skill 合并。
- `protected`：产品源码、项目记忆、策略、身份、许可证、版本、验证证据和未知本地文件。升级器只报告，不写入。
- `tombstone`：终端下游永久不应恢复的 Harness 初始化/派生能力和模板专用文件；来源候选必须排除，目标出现时阻断。

## 三方比较

`.harness/upstream-lock.json` 为每个受管路径保存旧候选摘要和旧下游摘要。

- 新候选变化、下游未变：既有文件生成可逐文件自动应用的 `update`；`add`/`manual_add`/`delete` 只生成待人工处理动作，处理后必须重新生成计划。
- 新候选未变、下游变化：生成 `preserve_local`，记录新来源时继续保留旧目标基线，使未来上游变化转为冲突。
- 两边都变化且字节不同：生成 `conflict`。
- 两边最终字节一致：生成 `converged`。
- 无旧基线且目标已存在：生成 `bootstrap_conflict` 或 `collision`。

旧下游首次升级不得把当前任一端当作共同祖先。完成逐项 bootstrap audit、使纯 managed 重叠完全收敛并显式确认 mixed 路径后，才可从一份重新生成且受审的计划建立首份 lock。Bootstrap 不得豁免符号链接、特殊文件、protected/tombstone 或路径问题。

## 候选树要求

候选树不是原始 Harness 根目录。它必须：

1. 只包含当前下游适用的工程文件。
2. 排除 protected 和 tombstone 源内容。
3. 使用下游展示名、snake/kebab 标识、crate 路径、接口选择和已批准例外完成渲染。
4. 来自通过自身 validator、Git 工作区干净且 `HEAD`/`Version.md` 与计划声明一致的明确 Harness 版本和 commit。
5. 位于目标仓库之外的任务专用目录，且不含符号链接或特殊文件。

## 永久保护

以下内容不得由升级自动覆盖：Product Spec、Status、Work Plan、ADR、Changelog、Verification、Tech Debt、业务源码和测试、Cargo 产品版本/锁定选择、项目与 GUI 身份、接口选择、`docs/AGENT_POLICY.md`、双语许可证、Git 历史与配置、未登记本地文件。

若新版 Harness 改变法律文本、产品边界或硬规则，升级计划只能报告并请求独立确认；不能把来源仓库的批准事实导入下游。

自动应用一次只替换一个受审路径，之后必须重新生成计划；普通 `managed` 完成后才进入 `managed-self`，升级入口脚本在 self-update 内最后替换。普通权限位参与三方比较，特殊权限位、符号链接、junction 和其他特殊节点 fail closed。
