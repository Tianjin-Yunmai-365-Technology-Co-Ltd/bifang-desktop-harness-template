# 版本与发布

## 当前状态

- 当前版本：[`Version.md`](../Version.md) 中记录的 `202609020957`（Released）
- 时间版本起始值：[`Version.md`](../Version.md) 中记录的 `202607301002`
- 旧版本标识：[`Version.md`](../Version.md) 中记录的 `1.0.0`
- 模板版本事实来源：根目录 `Version.md`；本文件只维护版本与发布规则
- 下游 Rust 项目当前版本事实来源：根 `Cargo.toml` 的 `[workspace.package].version`；`.harness/version-state.json` 只保存正式发布周期、待发布变化和 `bug-fix` 稳定 ID 去重状态
- 发布渠道：待确定
- 发布物格式：待确定

## 版本规则

Harness 模板使用上海时区（`Asia/Shanghai`）的 12 位时间版本 `YYYYMMDDHHMM`：

- 版本值取项目负责人确认该版本时的本地年月日时分。
- 12 位数字按时间先后可直接排序；不包含秒、时区后缀或预发布后缀。
- 同一分钟内如需产生第二个不同版本，必须等待下一分钟，不得追加未约定字符。
- `1.0.0` 只作为迁移前旧版本标识保留，不再用于新的 Harness 版本。

下游产品使用无预发布/构建元数据的三段语义化版本，并由 `$desktop-manage-version` 执行以下确定性规则：

- 新生成的 Minor 与 Patch 使用 `0..99` 的 base-100 数位：Patch 从 99 再提升时进位 Minor 并归零，Minor 因功能提升或 Patch 进位越过 99 时进位 Major 并归零；例如 `0.0.99 -> 0.1.0`、`0.99.99 -> 1.0.0`。Major 不受 99/100 的业务上限约束，但必须处于 Cargo `u64` 范围 `0..18446744073709551615`；没有更高数位可承接的自动进位必须在写入前失败关闭。
- 显式 Major 只由用户决定是否提升及精确目标值。批准后写为 `N.0.0`，必须高于当前版本规范化后的 Major，并把该正式发布周期的首功能提升视为已经包含；Agent 不得推断。base-100 数值进位自然产生更高 Major 是自动版本计算的例外，不需要也不代表显式 Major 批准。
- 每个正式发布周期的第一个已完成新功能把当前版本提升一个 Minor 数位并把 Patch 归零，必要时按 base-100 进位 Major；同一周期后续功能只记录其所需版本，不再因功能重复提升。只有真实正式发布成功才解锁下一周期的首次功能提升。
- 每个具有新稳定 ID 的已完成问题修复或用户可感知优化统一使用机器分类 `bug-fix`，把 Patch 提升一个数位并按 base-100 自动进位；这一路径不受当前周期的功能提升锁影响。相同 ID 的重复处理、补充修改或重试不再提升；正式发布后确认的回归必须分配新的稳定 ID，才可提升。
- 查询、诊断、复现、未完成或重复处理，以及不改变可观察行为的重构、内部优化、测试补强、文档、格式和内部清理属于 `maintenance`，不提升任何版本；`check`、`plan` 和 `maintenance` 始终零写入。
- 兼容读取历史版本与受保护状态中的 Minor/Patch `100`，升级不得改写它们。只有下一次确实提升版本的 `feature`、`bug-fix` 或显式 `major` 才先按 base-100 规范化当前 Cargo 与状态 `target_version`，再应用本次提升；周期基线、最近发布与既有变化继续保留原始证据值，纯检查、计划和维护不能借机迁移状态。历史发布日志同样保留原始版本字节，读取器继续兼容 Minor/Patch `100`，不得借版本提升回写历史条目。
- 版本只在合格变化已完成且本次相关测试通过后更新；普通构建、`pending` 候选、验收和失败发布只核对版本，不计算、不提升、不重置。
- 只有正式发布真实成功后，才清空待发布变化并开启下一功能周期；历史 `bug-fix` 稳定 ID 始终保留，以阻止同一 ID 在未来周期重复提升。

版本变化与 Changelog 写入是独立门禁。Product Spec、ADR、Changelog 或 Work Plan 只有按自身事件独立触发时，才记录相关稳定 `change_id` 及门禁返回的 `required_version`。版本提升不为普通缺陷修复、纯重构或其他排除项创建 Changelog/ADR；较早变化记录的是其最低所需版本，最终发布版本可以因后续合格变化更高。仅含 Changelog 排除项的候选仍必须具有版本、源码提交、原子候选清单、验收证据和适用人工签署；真实渠道发布成功后才在后续受管 feature 生命周期把这些事实追加为 tracked Verification/发布/Product Status 记录，缺少 Changelog 不削弱候选证据。

已发布版本不得静默覆盖。Harness 时间版本仍由用户决定；下游除 Major 以外的合格版本变化由上述门禁自动确定。版本门禁不授权创建标签、移动 `Unreleased` 条目或正式发布。

## 发布分支与制品目录

项目根忽略的制品目录 `release/` 不是 Git 分支。下游不创建名为 `Release` 的候选中转分支；日常需求、Bug 与维护只写入 `$desktop-manage-git-branch-chain` 登记的串行 `feature-{ascii-kebab摘要}-{YYYYMMDD}` 链。每次新链从已推送并复读的动态远端默认 `main`/`master` 精确提交开始，链内后续节点从当前已推送叶子继续。默认分支禁止日常直接写入，明确发布的受管严格快进是唯一窄例外。

只为迁移本决定生效前已经存在的旧式 `Release` 提供一次兼容路径：它必须同时是当前完全推送的具名分支、活动链冻结的精确基线，且远端默认旧 OID 是该 `Release` OID 的祖先；否则停止。该轮仍在 feature 叶子形成新的 closing commit，并在同一次原子事务中以默认分支、旧 `Release` 和全部登记 feature refs 的精确旧 OID 为 lease，严格快进默认分支并删除旧 `Release` 与登记链；随后切回默认分支并用 CAS 完成本地同样的精确清理。此路径不把旧 `Release` 作为候选中转，不允许新建、更新或在后续链复用它；迁移完成后所有新链一律从默认分支开始。

明确程序发布授权 `$desktop-prepare-release` 推送活动叶子的完整提交，并在严格父子链、冻结 OID、干净工作树、Worktree 占用检查及本次审查/性能/macOS 签名选择全部满足后，把显式 `releaseReview`、`candidateSelections` 和链关闭状态写入同一个 closing commit。随后一次 atomic push 以冻结默认分支 OID 作为 lease，将完整线性历史严格 fast-forward 到动态默认 `main`/`master`，同时按状态清单和逐 ref lease 删除精确远端 feature refs；远端完成后受管切换或快进本地同名默认分支，再以精确 OID 删除对应本地 refs。审查后的每个提交只能触碰发布日志或被触发 Changelog，先改其他路径再恢复也阻断。原子操作失败不得推进默认分支或删除任何 ref；远端已成功而本地切换/清理中断时只允许按关闭状态幂等收尾。禁止 wildcard、无精确期望 OID 的 force、非快进、merge commit、rebase、cherry-pick 和链外删除；唯一 force 形式是上述逐 ref `--force-with-lease` 删除。正常流程只删除状态精确登记的本轮 feature refs，不扫描 `feature-*` 或 `codex/*`，也不创建或保留 `Release` 中转分支；唯一额外删除项是上一段一次性迁移中已由状态冻结旧 OID 的 legacy `Release`。正常路径不会为原本缺失的 `Release` 发送删除 refspec：若外部在远端广告后并发创建它，Git 无法在不冒险代删未知 ref 的前提下把“仍缺失”纳入同一事务，因此 helper 保留它；默认分支/feature 原子事务可能已经完成，但命令必须在后置复核报告可恢复冲突，待外部所有者精确移除后再幂等收尾。迁移路径中被冻结的 legacy `Release` 若在失败事务后已经精确缺失，重试视其删除为已完成；若重新出现未知值则同样保留并停止。

## 用户可见版本与更新日志

- Windows 原生本地安装试包不是发布候选，不进入本文件的更新日志、clean HEAD、manifest、E2E、性能、签名或 `release/` 门禁。普通“构建/打包/首次安装试一下”由 `$desktop-build-tauri-local-install` 处理；只有用户明确要求发布候选或准备发布，才适用下列规则。该试包仍须明确标注未签名、未安装、未验收且不可分发。
- 所有面向用户显示的版本号统一使用且只使用一个小写 `v` 前缀，包括 GUI 页面、窗口标题、更新状态、强更提示、CLI `--version`、发布记录和更新日志。Cargo、`.harness/version-state.json`、候选 manifest 的机器版本字段、协议比较值和 SemVer 运算继续保存不带 `v` 的原始版本；展示边界负责先移除已有任意 `v`/`V` 前缀，再规范化为 `v<version>`。
- 下游在准备首个正式发布时创建根 `release-notes.json`。它是发布制品固定携带、并在 `about_page = enabled` 时由应用关于页通过固定 `load_release_notes` 窄命令复用的用户更新日志事实，使用 `schemaVersion: 2` 与按最新在前的 `releases` 数组；每项字段固定为 `releaseDate`、带一个 `v` 的 `version`、`featureOptimizations` 和 `bugFixes`。两个分类中的每个逻辑条目都是键恰好为 `zh-CN` 与 `en-US` 的翻译对，两个值都必须是非空、无首尾空白的字符串；任一翻译缺失都阻断。所有 GUI 初始化预置但不在调试构建使用 `src-tauri/tauri.release.conf.json`；正式候选构建显式 `--config` 合并该文件，把根日志唯一映射为候选逻辑资源 `release-notes.json`。
- 每次形成发布候选前，必须找到上一次真实正式发布的版本与 40 位源码提交；从该提交之后到当前发布源码的真实差异中语义筛选最重要内容，不得直接倾倒提交标题。首个正式发布以仓库起点到当前发布源码为范围。每版“功能优化”和“问题修复”各自最多 10 个逻辑条目，两类合计至少一条；每个条目同时提供中文与英文。Agent 可先整理其中一种语言并自动翻译另一种，但在写入前必须并排复核两种语言的语义对应关系。普通缺陷修复即使不触发按日 Changelog，也进入本次“问题修复”。
- 更新当前版本时先替换同版本条目，再置顶并截断为最近 5 个版本。使用 `$desktop-prepare-release` 携带的标准库脚本执行 `python3 .agents/skills/desktop-prepare-release/scripts/release_notes.py upsert ...`，通过配对的 `--feature-optimization-zh-cn`/`--feature-optimization-en-us` 与 `--bug-fix-zh-cn`/`--bug-fix-en-us` 按出现顺序传入每个翻译对，再运行更新日志脚本的 `check --expected-version` 校验，并分别运行 `render --locale zh-CN` 与 `render --locale en-US` 复核可见结果。文件是普通非符号链接 UTF-8 JSON，由脚本在同目录原子替换；Harness 升级将其视为 `protected`。
- 用户可见渲染按当前 i18n locale 使用以下两套固定结构；版本必须已经规范化为一个 `v` 前缀，空分类分别显示“无”或“None”，不得制造虚假条目。GUI 当前语言以 `zh` 开头时选择 `zh-CN`，其他或未知语言回退 `en-US`——`release-notes.json` 目前只提供这两套翻译，`zh-TW`/`zh-HK`/`zh-Hant` 等其他中文变体按设计并入 `zh-CN` 内容而非另行回退英文，此为当前双语范围下的既定简化，不是未定义行为：

```text
-----------更新日志 {发布日期} {发布版本}----------

###功能优化

{不超过 10 条最重要优化内容}

###问题修复

{不超过 10 条最重要修复内容}
```

```text
-----------Release notes {release date} {release version}----------

###Feature optimizations

{up to 10 most important improvements}

###Bug fixes

{up to 10 most important fixes}
```

- `release-notes.json` 与 `docs/changelog/` 职责独立：前者是每次正式发布都必须更新且供产品展示/打包的近五版用户摘要；后者仍只记录其事件规则允许的按日项目变化。更新日志一旦变化，源码提交和候选字节也发生变化，必须重新构建并验收，不能在候选 `accepted` 后原地修改。

## 发布物命名

Harness 模板若发布源码归档，使用：

`agent-first-harness-template-vYYYYMMDDHHMM.扩展名`

下游可执行产品在确定产品名和平台后使用：

`产品名-vMAJOR.MINOR.PATCH-平台-架构.扩展名`

实际生成归档或安装包时同时生成相邻的 `<artifact>.sha256` 和清单。`pending` 候选清单至少包含项目、版本、批准的 40 位源码提交、明确的构建/运行身份、构建模式、平台、架构、目标、宿主、产物名、SHA-256、全量单元测试结果、当前 `e2eSelection`、当次 `reviewSelection: enabled | disabled`、对应 `reviewStatus: passed | Not run`、`releaseNotesVersion`、`releaseNotesSha256`、`releaseNotesPath: release-notes.json`、签名证据和 `milestoneAcceptance: pending`。发布审查启用时必须有结构化 `reviewEvidence`，绑定冻结基线、活动叶子/发布 HEAD 与累计差异；关闭且无硬要求时必须记录非空 `reviewReason`、`reviewRemainingRisk` 并让 `reviewEvidence` 缺席。Tauri GUI 还必须包含当次 `performanceSelection: enabled | disabled` 与 `performanceStatus: passed | waived | Not run | Unverified`。选择 `enabled` 或产品/渠道硬要求，且已在目标平台原生测量时，清单必须包含绑定探针候选、提交和平台的结构化 `performanceEvidence`、`performanceProbe*` 与 `performanceRuntimeBinding`；`waived` 必须保存原始失败指标、诊断/修复尝试、风险、原因和用户确认，且原始性能证据必须有 `waiverAllowed: true`，不能改判为通过。选择 `disabled` 且无硬要求时，状态固定为 `Not run`，记录非空原因和剩余风险，并省略所有探针、证据与运行时绑定字段。xwin 只有在性能选择启用但未在真实 Windows 原生运行时记录 `performanceStatus: Unverified`且不伪造原生证据；主动关闭时仍记录 `Not run`。产品/渠道硬要求下，`Unverified` 候选不得进入 `accepted`。所有 Tauri GUI 清单还固定记录产品/发布事实 `updaterEnabled` 和实际 updater plugin/Tauri 版本：官方 updater Rust 插件是无条件安装基线，不受该布尔值、关于页或性能选择控制；`false` 时插件与 `NotConfigured` 零出站回归仍保留，但 updater archive、`.sig` 和制品签名字段必须缺席，`bundle.createUpdaterArtifacts` 不得启用；`true` 时才要求受限 HTTPS endpoints、公钥、channel/target/arch、安全私钥来源、官方 updater archive/`.sig` 与应用公钥实际验签证据。macOS 安装包另记录 `macosSigningSelection: enabled | disabled` 与 `macosSigningSource: configured | requested | channel-required | not-requested`：只有已批准的持久签名/公证配置、本次用户主动要求或渠道硬要求才启用；本机恰好存在身份、工具或凭据不得自行启用。

候选构建在清理目录、测试或编译前，以及写 manifest 前，都必须只读运行 `$desktop-manage-git-branch-chain verify-release-review`。两次返回的 `releaseHead`、`releaseReview` 和 `candidateSelections` 必须逐字段一致且绑定当前 clean 动态默认分支 closing commit；manifest 的审查证据或 `Not run` 原因/风险、性能选择/关闭风险和 macOS 签名选择/来源都从封存字段原样复制，不得从对话补写或重新解释。E2E 仍在构建阶段按当前候选单独解析。

## 许可证与第三方声明

- Harness 源码归档必须包含根目录 `LICENSE.zh-CN.md` 与 `LICENSE.en.md`。
- 每个下游源码归档、安装包或其他分发物必须以适合其载体且用户可访问的方式携带两份企业专有商业许可证；两份许可证的适用项目名必须等于当前发布产品名，不得残留 Harness 身份，也不得因改名、打包、签名或商店分发而删除、摘要或弱化其他条款。
- 实际分发前必须生成并核对该版本的第三方依赖许可证与 NOTICE 清单。本项目的专有商业许可不替代、覆盖或限制第三方许可证依法授予的权利。
- 商业合同或订单负责确定客户、费用、期限、授权数量和特殊授权；发布物中的通用许可证不得被误报为双方已经签署的商业文件。

所有下游构建结果统一写入项目根 `release/`。该目录由初始化以精确 `/release/` 规则忽略，是“本次构建结果目录”而非历史归档或 `ready` 标志。每次构建在任何单元测试或构建命令前，必须验证规范化后的独立 Git 根目录，拒绝 `release` 符号链接/重解析点和路径越界，把旧目录原子移入同文件系统隔离位置，创建并复核全新空 `release/`，再只删除隔离旧树；不得通过活动目标目录原地递归删除。完成签名、公证与 stapling 后的最终归档或安装包、校验和与清单先在同根唯一暂存区中形成并验证精确的普通文件集合，再删除仍为空且不是重解析点的 `release/`，通过目录级原子重命名，将完整暂存区提交为 `release/`，并复核最终路径和文件集。远端工作流必须检出并复核显式批准的 40 位提交，且每个运行器只能上传清单声明的三个精确路径。结果取回不得依赖含糊提供方“最新”结果或修改时间，不得混入其他项目、旧版本、旧运行、未完成、重复、额外或来源不明文件。`release/` manifest 状态只使用 `pending`、`rejected` 或 `accepted`；`ready` 只是对完整 `accepted` 原子集合的纯只读就绪复核结论，不写回 manifest。

构建请求、执行、成功、失败、重试、全量单元测试结果、产物路径/摘要/签名状态，以及候选 E2E、完整验收、状态更新和就绪复核，都不创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan、Verification 或其他 tracked 项目记忆。候选流程只把这些事实写入忽略的 `release/` 原子集合、manifest 声明的相邻制品证据和最终回复；本地开发试包只写最终回复，不创建 manifest。不得把构建或验收日志复制到项目记忆。真实渠道发布成功后，发布执行方才从已发布的默认分支 closing commit 开始后续受管 feature 生命周期，追加 Verification/发布/Product Status 记录并执行版本周期 finalize；独立回顾性人工复核或长期审计也必须使用自己的受管 feature 生命周期，且不得反向批准活动候选。

发布审查启用时，manifest 另记录 `reviewedSourceCommit`：它等于集中审查的活动叶子源码终点，而最终 `sourceCommit` 等于分支链关闭后的 `releaseHead`。前者必须是后者祖先，二者之间只允许 `release-notes.json`、被触发的 Changelog 和 `.harness/git-branch-chain.json` 关闭状态路径；关闭审查时 `reviewedSourceCommit` 与 `reviewEvidence` 一并缺席。这样发布元数据和关闭状态不会伪装成已做语义审查，也不会让确定性后处理无故使证据失效。

## 构建、完整验收与发布顺序

E2E 选择只对当前发布候选有效；每次候选构建在关闭链后独立解析，当前请求未明确时询问一次，持久建议值不能静默代替。`reviewSelection` 只由 `$desktop-prepare-release` 在关闭链前解析：当前请求已明确时复用，安全/隐私/不可逆操作/对外兼容契约或产品/渠道硬要求强制启用，否则询问一次；同一发布修复重跑复用，新发布重新询问。GUI 性能和 macOS 签名选择也在该入口按当前请求、产品事实与渠道要求锁定；默认 macOS 签名为 `disabled/not-requested`，不运行可用性探测，只有已批准配置、本次主动要求或渠道硬要求才启用。`system_notification = enabled` 与关闭签名冲突时必须在任何提交前停止，不能由 E2E `disabled` 掩盖。prepare-release 将结构化审查结论或 `Not run` 风险、性能选择/关闭风险和 macOS 签名选择/来源作为 `releaseReview`/`candidateSelections` 与链关闭状态原子封存；候选构建一律从完成远端和本地收尾的 clean 动态默认分支 closing commit 只读验证并消费，不能现场解析、补写或从对话恢复这些值。缺少当前信封或入口条件时只报告候选未就绪。候选构建必须运行项目全部非空单元测试，失败或零测试时不得形成候选。明确“构建发布候选”“发布”或“准备并构建发布”请求本身授权下列 feature 提交/推送、默认分支受限原子 fast-forward、登记链路清理和构建步骤，不再重复审批；普通开发构建/本地试包不升级为候选，也不提交、关闭链路或修改默认分支。任何请求都不授权 tag、上传、商店提交或真实渠道发布。

1. 明确发布候选请求后，`$desktop-prepare-release` 先确定接口并在任何写入前解析本次 `reviewSelection`；含 GUI 时同轮解析 `performanceSelection`，目标含 macOS GUI 时再锁定 `macosSigningSelection`/来源。随后要求当前分支精确为登记的活动 feature 叶子，只读执行链状态、工作树、范围、缓存、疑似秘密、祖先关系和 OID 等机械门禁。归属明确的已完成源码按逻辑提交并用 `$desktop-manage-git-branch-chain publish` 推送、复读；无关/歧义改动、秘密、hook/签名交互、提交或 push 失败立即停止，禁止 `--no-verify`。clean 且无源码变化时不制造空提交。`reviewSelection: enabled` 时，在关闭链前对冻结基线到活动叶子的累计差异执行一次集中语义审查，发现问题返回当前叶子修正并重新形成候选；`disabled` 且无硬要求时不做该审查，显式形成 `Not run`、原因和风险。三类候选选择都形成来源/适用性明确的结构化信封，且不能跳过上述机械安全门禁。
2. 从新的源码 HEAD 定位上一次真实正式发布边界，生成双语 `release-notes.json`；文件有变化时形成独立发布元数据提交，无变化时不制造空提交。再次推送并复读活动叶子后，调用 `$desktop-manage-git-branch-chain release`，显式传入完整审查信封与候选选择。helper 严格校验冻结默认分支基线、节点父子、全部远端 OID，以及审查终点后每个提交只触碰发布日志/被触发 Changelog；随后把 `releaseReview`、`candidateSelections` 与链关闭状态写入同一 closing commit，以单次 atomic push 严格快进动态默认 `main`/`master` 并按 lease 删除登记的远端链，再切回/快进本地默认分支并精确清理本地链。最终必须位于 clean 默认分支，本地/远端同名 ref 等于同一 40 位 `releaseHead`，且 `verify-release-review` 复算通过；构建 `sourceCommit` 固定等于该值。
3. 从上述 clean 默认分支在清理、测试前调用 `verify-release-review`，只读消费封存的审查、性能与 macOS 签名选择，运行版本/更新日志/资源配置检查并只另外解析当前 E2E 选择，再运行项目全部非空单元测试。GUI 封存性能选择为 `enabled` 或产品/渠道硬要求时，从同一 clean HEAD 生成 release-profile no-bundle 探针候选并调用 `$desktop-test-gui-release-performance`：先精确快照 window-state 原字节或原缺席状态，以一个脱敏种子在每次预热和 5 次冷启动前分别重置并验证，且在成功、失败、超时和取消路径恢复并复核原字节/原缺席；隔离完成后按 `gui-release-v2` 执行，一次预热后 5 次冷启动中位数 ≤2.4 秒且最大 ≤3.6 秒；至少 20 次代表性交互 p95 ≤120ms 且单次 <240ms；不短于 50ms 的 Long Task 必须记录且单次 <240ms；30 秒整进程树空闲 CPU p95 ≤6% 单核，适用隐藏/托盘 ≤2.4%；稳定 RSS ≤360 MiB、峰值 ≤600 MiB；20 轮后增长 ≤`max(18%, 38.4 MiB)`，退出后全部进程回收。v2 相对 v1 只把性能允许上限放宽 20%，预热、样本量、观察时长、循环次数和 Long Task 记录下限不变，旧 v1 证据不得改标或复用。指标失败必须从当前已推送的默认分支建立一条新的 feature 链修复、推送并重新关闭链路后重建；仍无法安全解决时才询问，但只有 `wholeProcessTree`、`probeBytesUnmodified`、`allProcessesRecovered` 均为 `true`、原窗口状态已恢复验证且证据为 `waiverAllowed: true`，才能接受明确继续并记为 `waived`，否则停止。封存为 `disabled` 且无硬要求时不生成探针，并原样记录同一 `Not run` 原因和剩余风险。
4. 性能已启用时只有 `passed`，或原始失败证据明确 `waiverAllowed: true` 后获用户显式 `waived`，才能进入完整打包。`wholeProcessTree`、`probeBytesUnmodified`、`allProcessesRecovered` 任一不为 `true`，或窗口状态恢复未验证时，helper 必须输出 `waiverAllowed: false` 与不可豁免失败，必须先修复并重新验证。性能已关闭且无硬要求时以 `Not run` 继续。Rust CLI 默认走三平台原生矩阵；Tauri GUI 生成适用 DMG/NSIS，每个候选打入同一更新日志并逐字节比较。macOS 默认 `macosSigningSelection: disabled` 并直接使用 `--no-sign`，不探测本机身份或公证凭据；只有已批准持久配置、本次主动要求或渠道硬要求才启用并探测，启用后签名、公证、stapling 全有或全无，失败不得降级。`system_notification = enabled` 与 unsigned 的冲突按入口规则提前阻断，不得把通知已知不可用的包写成候选。任何路径都不得自动创建、索取或输出凭据。
5. `$desktop-verify-delivery` 在准入时和写最终验收状态前两次只读核对当前 clean 具名动态默认分支、本地/远端提交、完整 `releaseReview`/`candidateSelections` 与全部 manifest；对最终候选执行冒烟、当前 E2E 选择和产品/渠道硬要求后，再重新计算所有候选文件、相邻证据、资源和 manifest 声明的最终字节。发布审查关闭时确认 `Not run` 原因/风险且无证据，启用时确认累计差异证据绑定同一发布提交；性能启用时证据仍须绑定同一提交和运行字节，三项完整性标记必须为 `true` 且 window-state 原状态恢复已经验证；`waived` 还必须引用 `waiverAllowed: true` 的原始失败证据并保持可见风险，不能变成 `passed`。性能关闭时确认 `Not run` 的原因/风险和性能字段缺席。Windows xwin 只有在启用性能但缺少原生测量时保持 `Unverified`。任一字节或仓库信封在执行期间漂移都拒绝候选；只有全部复核通过，才在仓库外同文件系统暂存完整集合并以目录级原子替换一次性把所有 manifest 从 `pending` 更新为 `accepted`，不得逐文件暴露混合状态。
6. 所有 required/enabled 检查和本次候选需要的人工签署完成后才形成上述 `accepted` 原子集合；这些证据仍只存在于忽略的 `release/` 与最终回复。就绪复核是纯只读操作：检查当前分支精确为动态默认 `main`/`master`、本地/远端提交与候选 `sourceCommit` 相同，以及版本、更新日志、选择/状态、最终哈希和签名一致，不得再改 manifest 或写 tracked 项目记忆；默认分支已经由受管发布事务完成严格快进，不再等待额外 Merge/PR。真实渠道发布成功后，才从该已发布 closing commit 开始后续受管 feature 生命周期，追加 Verification/发布/Product Status 记录并以精确已发布版本和 40 位源码提交执行 `$desktop-manage-version finalize-release`。
7. 更新日志、签名、公证、stapling、重打包或渠道处理若改变运行字节、启动器、依赖或行为，结果成为新候选并回到步骤 3；当次选择启用时旧性能证据与运行时绑定不得复用，所有候选的旧验收证据都不得复用。渠道处理若在发布前改变字节，禁止先写 tracked 发布记录或 finalize。

## Harness 模板发布检查清单

本清单只在用户明确准备 Harness 发布时执行。日常开发只运行本次必要单元/回归测试；纯文档、元数据、格式与不可合理单测的机械变更只做最小解析或差异检查。开发证据不能替代当前候选的完整验收证据。

模板自身无应用代码，不使用下游的编译、单元测试、CLI 和二进制冒烟门槛。模板发布必须满足：

- [ ] 产品规格状态为 Approved。
- [ ] README、AGENTS、所有已触发的项目记忆文档和全部声明的项目 Skills 完整存在。
- [ ] `python3 scripts/validate_harness.py` 成功，且输出对应当前候选源码；当次 `reviewSelection: enabled` 时另执行 `python3 scripts/validate_harness.py --release-review` 并处理其集中提示，关闭时不得把提示伪装为已运行。
- [ ] 候选构建前及写 manifest 前的 `verify-release-review` 都成功；两次均绑定当前 clean 动态默认分支 closing commit，且 `releaseReview`/`candidateSelections` 逐字段一致。缺少信封、远端或本地收尾未完成、逐提交后处理越界或范围摘要不一致均阻断。
- [ ] Rust 初始化中性资产通过当前系统的格式、代码规范检查和非空测试；它是脚手架资产而非产品候选，不用冒烟证明产品交付。
- [ ] Rust 初始化中性资产在声明的最低 Rust 版本 1.95.0 上完成可用工具链验证，或明确阻止发布并保持 `Unverified`；这不限制开发或运行环境使用更高稳定版。
- [ ] 候选工作流示例（`.agents/skills/desktop-prepare-cross-platform-release/assets/github-release-candidate.yml`，下游部署到 `.github/workflows/release-candidate.yml`）通过静态检查，且不包含未经授权的标签、发布操作或写权限。
- [ ] Harness 时间版本、下游自动版本 Skill/状态保护、Rust 默认值、四类独立适配器、默认 CLI、Agent 策略、构建 E2E 选择和验收适用性在事实来源中一致。
- [ ] 当前 `release/` 原子候选集合包含本次检查证据、未执行项和剩余风险；候选阶段未修改 `docs/VERIFICATION.md` 或 `docs/verification/`。
- [ ] 完整验收已按候选冒烟策略、当前构建 E2E 选择和硬要求记录 `required` / `enabled` / `disabled` / `Not applicable`；所有 `required` 或 `enabled` 项通过。
- [ ] 适用的人类最终复核身份、日期和结论已绑定当前候选字节写入 `release/` 声明证据；失败或未签署没有被自动批准。
- [ ] 若候选包含符合 Changelog 规则的变化，`Version.md` 与对应按日变更记录汇总的版本一致；否则已确认候选仅含 Changelog 排除项。Git 标签和源码归档只有获得独立授权并实际生成时才核对版本与源码提交，缺席不阻断候选 `accepted` 或只读就绪复核。
- [ ] 若候选包含符合 Changelog 规则的变化，`docs/changelog/` 的日期文件中存在对应版本条目；仅含普通缺陷修复或纯重构时本项为 `Not applicable`，且未制造空记录。
- [ ] README 包含真实用途、维护状态和反馈入口。
- [ ] 若生成源码归档，其来源提交和 SHA-256 已记录。
- [ ] 已知重要问题已在 `docs/TECH_DEBT.md` 中公开。

Harness 根目录没有具体产品，因此下游产物门槛不适用于模板发布；理由必须记录。Skill 中的 Rust 中性资产有独立的格式、代码规范检查和非空测试门槛，但不得把脚手架构建或启动冒烟当作产品验收。模板未来在根目录加入可执行产品时，应重新通过范围闸门并定义真实候选验收。

## 下游项目发布检查清单

本清单只接受已通过完整验收的真实候选。日常开发只运行本次必要单元测试；显式构建运行项目全部非空单元测试，E2E 只在最终候选形成后按当前选择执行。

- [ ] 项目根是独立 Git 顶层目录，工作树干净，当前发布源码已有 40 位提交；manifest `sourceCommit` 精确等于实际构建 HEAD，父仓库、尚无提交或未记录修改不得替代发布源码身份。
- [ ] 构建 HEAD 位于动态默认 `main`/`master`，本地与登记远端同名默认分支均等于 manifest `sourceCommit`；feature 链已经按状态清单和逐 ref lease 在同一原子事务中严格快进默认分支并精确删除，本地已切回默认分支，且没有创建 `Release` 中转或扫描删除链外/`codex/*` refs。
- [ ] 产品规格状态为 Approved。
- [ ] 中性 `scaffold status` 已由获批的真实业务命令和测试删除或替换，不再返回 `productDefinitionRequired=true`。
- [ ] 不存在已知未实现逻辑或未修复行为偏差；若用户要求的活动 Work Plan 存在，相关 Todo 全部为 `done`。
- [ ] 候选是完整、可运行、符合批准场景的真实产物，不是模拟实现、测试替身、占位、脚手架或开发预览。
- [ ] 当前构建的编译、项目全部非空单元测试、必要集成/契约和产物存在性均有通过证据。
- [ ] 单元测试覆盖核心成功路径和最高风险失败路径。
- [ ] 若选择 CLI，其统一 JSON 信封、错误结构、输出流和退出码契约验证通过；未选择时明确为不适用。
- [ ] Windows、macOS、Linux 各平台的实际验证状态已公开；未运行的平台明确标记为 `Unverified`。
- [ ] 适用的人类最终复核身份、日期和结论已绑定当前候选字节写入 `release/` 声明证据；候选阶段未写 tracked `docs/verification/human_review.md`。
- [ ] `$desktop-manage-version check --phase release` 通过，根 Cargo、`.harness/version-state.json` 目标、候选 manifest 与软件显示一致；本检查没有提升版本、重置周期或把候选版本回写到 tracked 项目记忆，既有项目记忆仍只遵循各自独立触发条件。
- [ ] 根 `release-notes.json` 已在候选构建前按上次正式发布提交到当前源码的差异更新；最新条目匹配当前版本，只保留近 5 版且每版两类各不超过 10 条，文件摘要和包内路径与 manifest 一致。
- [ ] 版本事实来源、软件显示和发布物名称一致；所有用户可见版本只带一个小写 `v`，机器版本事实保持原始值；存在符合 Changelog 规则的变化时，按日汇总也与该版本一致。Git 标签只有获得独立授权并实际创建时才核对，缺席不阻断候选 `accepted` 或只读就绪复核。
- [ ] `$desktop-rename-project-identity` 残留扫描确认发布配置、Skills、文档、维护路径和两份许可证中没有旧产品身份。
- [ ] 候选包含符合 Changelog 规则的变化时，`docs/changelog/` 的日期文件中存在对应版本条目；仅含普通缺陷修复或纯重构时本项为 `Not applicable`。
- [ ] README 包含真实的用途、使用方式、维护状态和反馈入口。
- [ ] 发布物来自目标源码提交，且其 SHA-256 已记录。
- [ ] 每个平台归档、相邻 SHA-256 和清单一致，必需平台/架构恰好出现一次。
- [ ] GUI 正式构建使用发布专用 `--config`，构建后资源与根更新日志逐字节一致；macOS 最终 DMG 内唯一 `.app/Contents/Resources/release-notes.json` 已重新比较。含 GUI 且 `about_page = enabled` 时，关于页“检查更新”旁存在元素自身绑定的“更新日志”按钮，能够经固定资源命令查看近 5 版 schema v2 双语日志，中文/英文 locale 分别显示对应标题与正文、未知语言回退英文，加载失败可重试，且点击更新区父容器不会代理任一按钮动作；`about_page = disabled` 时页面、入口、命令、加载器与弹窗缺席，但固定 updater Rust 插件、`UpdateController` 和 `NotConfigured` 零出站基线仍存在。GUI manifest 始终记录 `updaterEnabled` 与 updater plugin/Tauri 版本；`false` 时无 updater archive/`.sig`/制品签名字段，`true` 时官方制品、配置和实际验签证据完整。
- [ ] GUI manifest 记录本次 `performanceSelection`。选择启用或产品/渠道要求时，在打包前对同一 clean HEAD 的 release-profile 探针候选完成整进程树性能门禁，并证明探针字节未变、全部进程已回收、window-state 同一种子逐次重置与原状态恢复：`passed` 有完整原始指标；`waived` 只引用三项完整性标记均为 `true`、窗口恢复已验证且 `waiverAllowed: true` 的原始失败证据，并有失败指标、修复尝试、风险和用户确认；任一完整性标记不为 `true` 或原状态恢复未验证时 `waiverAllowed: false` 且不可豁免；`Unverified` 只用于已启用但未在真实目标平台运行的候选且不得冒充通过。选择关闭且无硬要求时记录 `performanceStatus: Not run`、原因和剩余风险，且没有探针、性能证据或运行时绑定字段。
- [ ] 项目根 `release/` 已由 `$desktop-build-rust-release` 或 `$desktop-build-tauri-release` 在构建前安全刷新，并在本机构建或 `$desktop-collect-release-artifacts` 取回后只包含当前版本、源码提交和明确的构建批次候选；目录内容与清单精确一致且无历史文件。
- [ ] 每个平台清单的 `signingStatus` 与证据真实；macOS 同时记录签名选择和来源，`disabled/not-requested` 未运行可用性探测并显式 unsigned，只有 `configured`、`requested` 或 `channel-required` 才允许启用；已签名候选同时具有 `notarizationStatus: notarized-and-stapled` 和可复核证据。若 `system_notification = enabled`，本项同时拒绝 `disabled/not-requested` 或实际 unsigned，且不能由 E2E 关闭绕过。验收后若签名、公证、stapling 或重打包改变字节则已重新验收。
- [ ] macOS 多个签名启用来源同时存在时按 `channel-required > requested > configured > not-requested` 记录唯一 `macosSigningSource`；`disabled/not-requested` 的 `notarizationEvidence` 与探测派生签名证据缺席，通用 `signingEvidence` 只记录选择、来源、unsigned 结论和风险。
- [ ] macOS DMG 的最终签名/公证/stapled 字节已通过只读 Finder 布局检查；`.DS_Store`、本地背景、唯一 `.app` 与 `/Applications` 拖拽目标均真实存在，任何布局补写或重打包后已重做签名、公证、摘要和验收。
- [ ] macOS→Windows Tauri 候选只包含 x64 NSIS，清单记录 `buildMode: cross-compiled-xwin` 和 `runtimeVerification: Unverified`；未在真实 Windows 环境运行时没有声称原生验证通过。
- [ ] 完整验收根据候选冒烟策略、当前构建 E2E 选择、GUI 当次性能选择、产品/渠道硬要求和适用性执行检查；所有 `required` 或 `enabled` 项通过，`disabled`/`Not run`/`Not applicable` 项及风险准确记录。
- [ ] 任一验收失败都曾返回开发循环并完成回归测试，没有以 `Partially verified` 代替仍缺失的批准逻辑。
- [ ] 已知重要问题已在 `docs/TECH_DEBT.md` 中向用户公开。
- [ ] 发布执行方已声明只有真实渠道发布成功后才从已发布的默认分支 closing commit 开始后续受管 feature 生命周期，以精确版本和 40 位发布源码调用 `finalize-release --release-succeeded` 并追加 tracked 记录；失败、取消、候选、标签或上传尝试均不会重置。

Rust 下游项目默认使用 `docs/RUST_CLI_TEMPLATE.md` 中记录的工作区命令和发布产物布局；只有真实文件和命令存在后才能写入候选证据，tracked 验证记录仍须等真实渠道发布成功或独立回顾审计触发。候选矩阵生成不等于正式发布；构建请求只允许使用已配置且已授权的签名条件，不授权创建凭据、标签、GitHub 发布、向软件包仓库发布或发布上传。

GUI 的本地生产构建和产物存在检查可在批准渠道允许时使用显式 `unsigned` 候选；完整验收执行启动冒烟时必须准确记录该状态。macOS 直接分发默认不签名、不公证并且不探测本机可用条件；只有已批准持久配置、本次用户主动要求或渠道硬要求时，才启用 Developer ID 签名、公证和 stapling，并且三者必须作为不可降级的完整阶段完成。App Store、Microsoft Store、要求避免 Windows SmartScreen 警告的下载渠道或 Tauri 更新器仍按各自真实渠道要求完成签名/公证/更新签名前不得宣布渠道发布就绪。Linux 普通部署不因缺少签名自动失败，除非项目批准的渠道另有要求。

## 发布记录模板

- 版本：Harness 使用 `vYYYYMMDDHHMM`；下游默认使用 `vX.Y.Z`
- 日期：YYYY-MM-DD
- 源码提交：待填写
- 发布物：待填写
- SHA-256：待填写
- 验证记录：`docs/VERIFICATION.md` 索引的对应证据卷条目
- 人工复核：复核人、日期和结论
- 已知问题：待填写
- 不适用项及理由：待填写
