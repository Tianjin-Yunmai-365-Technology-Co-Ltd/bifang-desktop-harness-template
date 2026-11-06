# 确定性工程层准备与终端裁剪

本合同只自动化固定复制、身份重置和检查后的终端裁剪。初始化表单、环境门禁、所选适配器、真实测试、GUI 初始化 E2E 和独立 Git 基线仍由既有初始化流程负责；本 helper 不创建业务、Git、发布上下文或验收结论。

## 确认后准备

完整表单已获真实用户确认、源验证和适用环境门禁通过后，从 Harness 源运行以下单行命令。JSON 通过标准输入传递，不拼接用户文本到 shell；不保存原始用户消息或另建表单会话文件。

```text
node .agents/skills/desktop-instantiate-project/scripts/instantiate_project.mjs plan
node .agents/skills/desktop-instantiate-project/scripts/instantiate_project.mjs prepare --plan-digest <plan 输出的 planDigest>
```

两条命令使用相同的 JSON 对象：`schemaVersion: 1`、`form`（唯一表单解析器已有的完整输入，含匹配最新汇总的真实 `confirmation`）以及 `confirmedAt`（实际收齐确认的 `YYYY-MM-DD`）。`form.entry` 必须为 `instantiate`。这不是额外用户确认；Agent 复核文件计划后消费其摘要即可，不自填用户确认来源。

`plan` 零写入。源文件列表由 Git 可见文件和固定允许范围共同确定，在创建目标前冻结：保留根工程入口、两份许可证、规范目录、适用工程 Skills 和中性资产，排除项目记忆、验证历史、Harness 时间版本、发布事实、缓存、其它项目与上游专用检查器。文件字节、权限、目标和已确认字段共同绑定计划摘要；执行时重算，不静默使用旧计划。

`prepare` 先复核同一确认、唯一目标及源摘要，再用独占新建写入固定集合。不覆盖非空目标、隐藏条目或符号链接；目标位于源内部时也不重新递归扫描源。许可证除对应语言的项目名称词元外保持原字节，第三方 vendor 原样保留；策略六项与确认事实来自同一已确认结果。失败只清理仍具有本次文件身份与字节的自有项，陌生内容或并发用户修改保留，并在错误 JSON 的 `recovery` 中列出恢复路径。

输出 `engineering-copy-prepared` 与准备清单，只表示工程层准备成功；`initializationComplete` 明确为 `false`。把该 JSON 结果保留在本次执行上下文，交给原中性初始化流程继续建立 core、所选成员、Cargo metadata、版本状态与适用 GUI profile，不创建原始表单的持久副本。

prepare 后的目标已包含工程规则，不能再调用只接受绝对空目标的 GPUI/NSH 全新 workspace wrapper 覆盖它。按原初始化流程先建立真实共享 core，再使用已有 core 的 add-only 路径；也可复用源专用纯 renderer 的确定性文件集合，在逐路径无覆盖检查后补齐所选中性成员。始终复用已确认选择，不为绕过空目录检查删除工程层或重建目标。

## 检查后裁剪

原流程完成相关非空测试、适用 GUI 实际构建与 Computer Use 初始化检查后，再运行源专用裁剪入口。目标此时必须仍为 pre-Git；位于父仓库内不影响这个边界。

```text
node .agents/skills/desktop-initialize-rust-project/scripts/finalize_instantiation.mjs plan
node .agents/skills/desktop-initialize-rust-project/scripts/finalize_instantiation.mjs apply --plan-digest <plan 输出的 planDigest>
```

标准输入对象为 `schemaVersion: 1`、`preparation`（真实 prepare 输出）；apply 还要求 `evidence`：

- `scopeDigest`：本次 plan 输出的当前工程快照摘要，必须与实际检查所对应的最终工程一致。
- `unitTests`：原流程真实相关非空测试的工具结果引用（`tool:`）或普通绝对日志文件路径。
- GUI 路径另有 `initializationBuild` 与 `computerUse`，分别引用原流程真实构建和实际宿主观察结果。

以上字段是**已有结果的引用**，不是新测试或额外用户审批。缺失引用、错误快照、未知字段或 `passed` 一类自填成功开关都拒绝；helper 只核对引用存在与工程绑定，不认证外部命令或 Computer Use 的成功。Agent 必须根据原流程实际结果决定能否进入此步骤，不能把任意非空字符串当通过证据。失败、未执行或无法观察仍遵守原初始化阻断规则。

裁剪先核对准备文件未漂移、真实 Cargo 身份/成员/直接核心依赖、已确认策略、GUI 九字段和一致的初始版本状态；GPUI 安装知识后的 AGENTS 只允许精确的两项本地知识地图追加，其余用户修改均停止。完整预检通过后，按固定清单移除初始化/派生入口和未选框架，保留通用版本、Git 生命周期、Task、升级能力及双语许可证；重建轻量 AGENTS，转换已删除入口的文档路由和链接，保留代码中用于拒绝恢复的 tombstone 数据。实际本地链接和相对模块 import 在写入前检查，第三方知识原文不改写。

裁剪删除和文档重写只作用于 prepare 清单中登记的工程文件。准备后新增的未知文件保持原字节；待裁目录中的未知内容或新增文档里的失效活动引用会阻断，不因重新预览自动获得删除或改写授权。成员包版本必须继承根版本或明确等于根版本。

每个被替换/删除原件先隔离到同文件系统的私有恢复目录，rename 后再次核对真实文件身份与字节，防止预检后抓到新用户文件。新内容独占安装，完成前复核全体工程输出。失败尽量恢复真实移动的原件；并发变化不覆盖，未能恢复的原件和路径由 `recovery` 返回。文件集合提交后的空目录或备份清理失败单独返回 `retainedDirectories`，不把已提交的字节伪报为可重试事务失败。该合同不宣称断电持久性或把文件操作当宿主沙箱。

输出 `terminal-pruning-complete` 仍保持 `initializationComplete: false`，回到原流程复探 Git、即时配置仓库本地身份与模板、建立独立唯一基线并复核干净状态。prepare、裁剪、完整初始化和候选验收始终分别报告。

本入口仅供 Harness 源实例化路径使用，直接初始化既有下游不得套用 prepare 清单或删除项目记忆。所有 helper 随一次性初始化目录裁掉；不随升级恢复派生能力。
