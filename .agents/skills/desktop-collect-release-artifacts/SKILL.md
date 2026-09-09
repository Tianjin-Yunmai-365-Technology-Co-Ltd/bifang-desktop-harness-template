---
name: desktop-collect-release-artifacts
description: 在项目根 release 目录中取回、安全合并并验证当前下游项目已完成的本地、交叉编译或原生 CI 构建结果，同时保留每个候选的 pending、rejected 或 accepted 状态。用于本地或 CI 构建完成后、下载工作流产物时，或准备供人工复核的发布候选时。
---

# 收集发布产物

创建一个可复核的当前构建结果目录，不重新构建、签名、执行或发布候选。

## 工作流程

1. 读取 `docs/RELEASE.md`、活动构建请求、每个已完成构建 manifest 中的本次 E2E 选择，以及用户提供的每项结果；只有候选经过独立验收时才读取匹配证据。收集阶段不得补问、推断或改变选择，也不得在收集时改写发布上下文或更新日志。要求规范化 Git 顶层等于项目根；在接触目标目录前运行发布上下文 `verify`，锁定 clean 当前 HEAD、`releaseContextSha256`、远端动态默认分支、`expectedTag`、`releaseReview` 与 `candidateSelections`。远端默认分支与远端 tag、所有源 manifest 的 `sourceCommit` 必须等于当前 HEAD；各 manifest 的上下文摘要与选择必须逐字段匹配。不能用对话或单个 manifest 补齐缺失上下文。随后调用 `$desktop-manage-version check --phase build`；所有候选版本必须等于当前目标和上下文版本，收集不得提升版本。在接触目标前确定项目、版本、源码提交、平台矩阵、产物名称、校验和、构建标识、签名状态和候选状态。该检查只验证发布结果，不限制分支拓扑。
2. 通过仓库配置的提供方取回产物，或接受用户提供的本地结果目录。对于每个预期平台/架构和产物类别，选择与当前项目、版本、源码提交和明确构建标识匹配的已完成结果。绝不得把含糊的提供方“最新”结果、单独的文件系统修改时间（mtime）、其他项目/提交、不完整运行或未经验证的目录视为已选结果。
3. 复制前构建并验证完整源清单。要求每个源文件都存在、属于普通文件、位于目标目录之外，并匹配项目/版本/提交/构建。为 `$desktop-build-rust-release` 或 `$desktop-build-tauri-release` 收集构建结果时可以接受 `milestoneAcceptance: pending`。GUI 性能选择为 `enabled` 时，完整打包只允许在 no-bundle 探针性能 `passed` 或用户明确 `waived` 后发生；未在真实原生平台运行的 xwin 记录 `performanceStatus: Unverified`。选择为 `disabled` 且无产品/渠道硬要求时允许 `performanceStatus: Not run`，但必须有原因和剩余风险且没有探针/证据/绑定文件。`pending`、缺失或 `failed` 的已启用 GUI 性能状态不能伴随已打包候选被收集；`Not run` 也不能满足产品/渠道硬要求。必须保留原精确选择与状态，绝不得称其为已验证。发布就绪复核仍要求所有匹配 manifest 组成完整 `Milestone accepted` 原子集合。拒绝缺失、额外、重复、空、过时、跨项目或发生冲突的文件。
4. 将目标目录精确解析为 `<canonical-project-root>/release`，但在全部源结果通过前不得清理、移走或写入它。遇到目标或父目录为符号链接/重解析点、规范化后路径越界、目标非目录或目标等于项目根时必须拒绝。在项目根同级、同一文件系统创建唯一且权限受限的 staging，要求它是目标外普通目录；后续复制、展平和验证都只在 staging 完成，不得依赖 ignore 隐藏工作树内暂存项。
5. 仅把已选择的当前源清单文件复制到 staging。只有完成全局文件名冲突检查后，才可展平提供方包装目录。仅保留声明的最终用户二进制文件或归档、相邻校验和/签名文件、清单和明确要求的验证证据；绝不得复制 Cargo 中间产物，也不得逐个平台直接复制到 `release/`。
6. 在 staging 内重新计算每个最终归档或安装包的 SHA-256，并与相邻校验和及清单比较。验证各清单的 `project`、机器 `version`、`sourceCommit`、`releaseContextSha256`、`buildRun`、`buildMode`、平台/架构/target/host、制品/摘要、测试、E2E、审查、`releaseNotesVersion`、`releaseNotesSha256`、`releaseNotesPath`、签名与 `milestoneAcceptance` 字段一致；再次运行发布上下文 `verify`，要求 HEAD、上下文摘要、`releaseReview`、`candidateSelections` 与第 1 步及所有 manifest 逐字段相等。只读校验根更新日志及 staging 归档/应用资源内同一路径内容。要求每个预期平台/架构精确一次。GUI 清单继续验证 interface、artifactKind、bundleFormat、runtimeVerification、签名/公证、`performanceSelection` 与性能状态组合。
   - 发布审查 `enabled` 时要求 `reviewedSourceCommit`、`reviewEvidence` 与上下文字段一致；不对它与候选 `sourceCommit` 施加祖先、线性或允许路径门禁。审查 `disabled` 时两字段都必须缺席。
   - `enabled` 且原生测量时，要求结构化 `performanceEvidence`、`performanceProbe`、`performanceProbeSha256`、`performanceThresholdProfile: gui-release-v2` 和 `performanceRuntimeBinding`。探针证据必须是清单命名的普通相对文件，绑定 clean 默认分支 `sourceCommit`、平台、架构、native buildMode 与 release profile；不得把安装包 `sha256` 复制到探针字段或用它替代探针摘要。运行时绑定必须证明 staged unsigned runtime 与探针逐字节相同；未签名变换时包内 runtime 仍逐字节相同，签名改变 runtime 时则同时核对签名前摘要、签名后包内相对路径/摘要和签名证据。`waived` 必须继续引用原始 `failed` 证据并包含非空原因、确认时间、确认摘要、修复尝试和剩余风险，绝不能改写成 `passed`。
   - `disabled` 时只接受 `performanceStatus: Not run`、非空 `performanceReason` 与 `performanceRemainingRisk`，并要求 `performanceEvidence`、`performanceProbe`、`performanceProbeSha256`、`performanceThresholdProfile`、`performanceWaiver` 和 `performanceRuntimeBinding` 全部缺席。`dmg` 已签名时只接受 `notarized-and-stapled`；`nsis` xwin 时只接受 `buildMode: cross-compiled-xwin` 与 `runtimeVerification: Unverified`，性能启用时状态为 `Unverified`，关闭时为 `Not run`。不得尝试新签名、公证或 stapling。对于 CLI 就地签名，要求存在已记录的固定钩子验证结果，并要求 `detachedFiles` 列表为空；项目声明独立签名证据时，明确要求每个被引用的普通文件及其校验和存在。
7. 检查 staging 中全部归档内容但不得执行二进制文件；拒绝绝对路径、父目录穿越和非预期载荷。只有本次构建选择或产品/渠道硬要求启用了冒烟/E2E 时，才验证已有对应证据。GUI 性能独立于 E2E 选择：性能已启用时 `e2eSelection: disabled` 不能删除、跳过或伪造已经要求的性能状态；性能已关闭时不能残留旧证据或把 `Not run` 冒充通过。收集过程绝不得自行启动冒烟/E2E，也不得自行启动性能测量。
8. 在触碰目标目录前第二次运行发布上下文 `verify`，要求 HEAD、上下文摘要与选择逐字段等于第 1/6 步快照，且全部 manifest 的 `sourceCommit` 相同；重新枚举 staging 并按全部清单复算精确集合。只有全部成功，才在不跟随链接的同一提交临界区把完整 staging 目录级原子替换为 `release/`；提交失败必须恢复原目标，任何前置失败都不得部分污染目标。替换后只读重新枚举 `release/` 并复算。只在当前 manifests、其声明的相邻制品证据和最终回复中记录结果；不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification。独立触发的真实渠道发布成功或回顾审计由后续自动开发生命周期记录自身新增事实。

## 输出契约

项目根 `release/` 目录只能包含本次构建调用选中的以下文件：

- 每个成功构建的平台/架构对应一个归档、安装包或声明的二进制文件；
- 每个产物对应一个相邻的 `<artifact>.sha256` 校验和，以及任何声明的独立签名；
- 每个平台对应一个清单，或一个包含等价字段的聚合清单；
- 由清单命名并引用的可选测试/日志证据，以及仅在 GUI 当次性能启用时由清单命名的性能证据。

每个清单必须保留 `pending`、`rejected` 或 `accepted` 中的一种状态；目录存在绝不得提升该状态。GUI 的 `accepted` 在性能启用时只允许 `passed`，或携带原始失败证据和用户明确确认的 `waived`，并且包内 runtime/探针绑定已复核；在性能关闭且无产品/渠道硬要求时允许带完整原因和剩余风险的 `Not run`。`failed`、缺失以及被硬要求覆盖的 `Not run`/`Unverified` 都不能随收集升级。绝不得包含凭据、绝对本机路径、缓存或未遮盖的环境转储。

## 边界

- 收集不能证明构建可信，也不能替代 `$desktop-verify-delivery`。
- 构建产物收集本身不触发任何项目记忆，既有 `pending`、`rejected` 或 `accepted` 状态只能原样保留在 manifest 及其声明证据中。
- 不得构建、发布、上传到发布渠道、签名、公证、stapling、创建标签或更改版本文件。
- 除第 4–8 步声明的项目根同级、同一文件系统、唯一且权限受限的 sibling staging 外，不得在精确且非符号链接的 `<canonical-project-root>/release` 目录之外清理或写入；该 staging 只用于形成整组原子替换，失败时也只能清理已复核的本次 staging 精确路径。
- 原子提交会替换 `release/` 中的历史构建结果；只有完整 staging 已验证且提交临界区能够恢复原目标时才允许进入，不能逐文件删除或覆盖。
- 即使存在其他文件，缺失或不一致的必需结果、未通过的必需验收门禁仍必须阻断就绪状态。
