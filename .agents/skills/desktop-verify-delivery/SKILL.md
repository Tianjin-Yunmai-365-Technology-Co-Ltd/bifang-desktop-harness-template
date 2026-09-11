---
name: desktop-verify-delivery
description: 对发布候选、用户明确要求完整验收或当前构建启用 E2E 的最终真实产物进行验收；GUI 按当次性能选择条件复核门禁或 Not run 风险，日常开发不得自动调用。
---

# 验证交付

验证完整真实候选，不把开发检查、模拟实现或目录存在误报为可用。

## 准入

1. 只接受发布/渠道要求、用户明确要求完整验收，或当前构建已明确选择 E2E `enabled` 的请求。读取 Product Spec、当前构建记录、`docs/AGENT_POLICY.md`、`docs/ENGINEERING_RULES.md`、相关 ADR、验证/发布规则和适用接口 Skill。
2. 要求存在与批准场景、40 字符源码提交、版本/构建标识和当前环境绑定的完整真实产物、校验和及 manifest。先运行发布上下文 `verify`，要求工作树 clean、当前具名分支是远端动态默认分支、远端主分支与上下文 `expectedTag` 都指向当前 HEAD，且 tracked `.harness/release-context.json` 字节和 schema 有效。manifest `sourceCommit` 必须等于该 HEAD，`releaseContextSha256`、审查、性能与 macOS 签名字段必须逐字段来自上下文；把这些值锁定为准入快照。缺少上下文、HEAD/ref/tag 漂移或 manifest 自行改写选择都拒绝。随后运行版本检查，并要求候选/manifest/上下文版本相同；验收不得提升版本。该验证不检查分支祖先、合并类型或线性历史。
3. 当前存在用户要求的活动 Work Plan 时，相关 Todo 必须全部 `done`；没有 Work Plan 不阻断验收。

## 工作流程

1. 明确核心成功路径、最高风险失败路径、真实输入/输出和可观察结果，区分外部前置项与产品逻辑。
2. 核对当前构建已经运行项目全部非空单元测试。Rust 证据必须覆盖 workspace/all-targets/all-features 的锁定测试；GUI 还必须覆盖完整前端单元测试套件。只有源码提交、锁文件和候选构建身份完全匹配时才复用该证据；任何变化都必须返回构建 Skill 重建，不在验收中重复一套隐式构建流程。
3. 运行候选自身所必需的真实产物存在性、接口/渠道和最终字节检查。所有 GUI 候选先核对 manifest 的 `releaseNotesVersion`、`releaseNotesSha256`、`releaseNotesPath: release-notes.json` 与根事实；对可定位的实际应用资源运行 `verify_release_notes_resource.py bytes`。macOS Tauri DMG 必须针对 `release/` 中当前最终字节重新运行 `$desktop-build-tauri-release` 的 `scripts/verify-dmg-layout.sh <final-dmg> <project-root>/release-notes.json`，只读挂载并再次证明唯一 `.app/Contents/Resources/release-notes.json` 逐字节一致；不得自动接受软件许可或沿用旧 DMG 的布局证据，也不得沿用旧更新日志证据。xwin NSIS 保持 `runtimeVerification: Unverified`，不能据交叉构建成功或未安装资源目录检查推断 Windows 行为。
4. 解析运行时检查：产品/渠道/安全硬要求优先；冒烟读取 `acceptance_smoke`；E2E 只读取当前构建的明确选择，`e2e_hint` 仅用于当时询问的建议默认值，不能在此替代或反转选择。发布语义审查只读取 manifest 的当次 `reviewSelection`，GUI 性能只读取 `performanceSelection`；不得在验收阶段补问、推断或把 `disabled` 静默翻转，任何硬要求与关闭选择冲突时拒绝候选并返回新构建。
5. 按每个 manifest 的 `reviewSelection` 核对发布语义审查，且机械安全门禁与最终人类签署不受该选择控制。
   - `enabled`：只接受 `reviewStatus: passed`、结构化 `reviewEvidence` 和 `reviewedSourceCommit`，且它们逐字段等于发布上下文。`sourceHead` 描述审查终点，manifest `sourceCommit` 描述合并后被主分支和 tag 指向的候选；不对两者施加祖先、线性或允许路径门禁。
   - `disabled`：只有不存在安全、隐私、不可逆操作、对外兼容契约或产品/渠道审查硬要求时才接受 `reviewStatus: Not run`、非空 `reviewReason`/`reviewRemainingRisk`，并要求 `reviewEvidence` 与 `reviewedSourceCommit` 缺席。
6. 按每个 GUI manifest 的 `performanceSelection` 条件复核性能，且 E2E 选择不能替代或改变该结论。
   - `enabled`：复核打包前 `$desktop-test-gui-release-performance` 的 no-bundle 探针证据，要求 `performanceStatus: passed`，或用户看过失败指标后明确批准且仍记录为 `waived`；后一种情况还必须记录 `waiverAllowed: true`。manifest 必须记录 `performanceThresholdProfile: gui-release-v2`，证据的 `thresholdProfile` 必须同为 `gui-release-v2`；探针摘要、clean `sourceCommit`、平台、架构、native buildMode、release profile 与运行时绑定必须一致。DMG/NSIS 容器摘要本身不构成运行时绑定，也不能冒充探针摘要。重新编译、配置/依赖/启动器/行为变化或无法证明绑定时，废弃旧证据并返回同一 clean、已推送且被版本 tag 指向的默认分支 HEAD 重建。
   - `disabled`：只有不存在产品/渠道性能硬要求时才接受 `performanceStatus: Not run`，并要求非空 `performanceReason`、`performanceRemainingRisk`，同时要求 `performanceEvidence`、`performanceProbe`、`performanceProbeSha256`、`performanceThresholdProfile`、`performanceWaiver` 和 `performanceRuntimeBinding` 全部缺席。旧证据残留、状态不匹配、缺少原因或试图用 `Not run` 覆盖同一候选的真实失败都拒绝。
7. E2E 为 `enabled` 或硬要求时调用 `$desktop-test-final-artifact-e2e`；含 GUI 且 `about_page = enabled` 时，必须从真实候选打开关于页和“更新日志”，对照已核验的候选资源确认当前版本、近五版、固定两类与单个小写 `v`，不能用注入数组或源码夹具代替；禁用时确认路由、入口与运行时命令缺席。E2E 为 `disabled` 时记录 `Not run` 和剩余风险；GUI 性能仍按第 6 步的独立当次选择形成结论。需要凭据、生产数据、支付、发布或不可逆副作用时仍须独立授权。
8. 全部真实检查、E2E 和必需人工结论完成后，先确定整组唯一结论，但在写入验收状态前再次运行发布上下文 `verify`；要求当前 HEAD、`releaseContextSha256`、`releaseReview`、`candidateSelections` 与准入快照逐字段相等，且全部 manifest 的 `sourceCommit` 都等于 HEAD。然后重新计算全部最终制品、相邻摘要、manifest 声明、包内关键资源和 `release/` 精确集合。任一漂移都拒绝状态写入并返回重建/重验。

9. 只在以上尾检查通过后，于项目根同级、同一文件系统的唯一 staging 复制当前 `release/` 精确集合；在 staging 内原子写入全部 manifests 的同一整组 `milestoneAcceptance` 结论及结构化证据，再复算所有摘要、资源绑定和精确文件集。整组必须同为 `accepted`、`rejected` 或 `pending`，不得混合。复验成功后才目录级原子替换 `release/`；失败保留原集合。验收证据只写忽略的 `release/`，不得在 tracked 源码中补写项目记忆或占位记录。

   同一记录还必须包含 `reviewSelection`/`reviewStatus`、适用 `reviewEvidence` 或 `Not run` 原因/风险；macOS 候选必须核对 `macosSigningSelection`/`macosSigningSource`，多个来源按 `channel-required > requested > configured > not-requested` 唯一化，关闭时不得有探测派生证据或 `notarizationEvidence`，启用时只接受完整签名、公证和 stapling 证据。`system_notification = enabled` 的 macOS 候选若为 `disabled/not-requested` 或实际 unsigned，必须拒绝验收；这属于通知运行前提，不得由 E2E `disabled`、waiver 或 `Unverified` 绕过，也不得在验收阶段自动签名。

## 拒绝与修复

1. 产物缺失、不完整、不可运行、偏离批准场景，或任一必需/已启用检查失败、超时、取消或未执行时拒绝候选，并把证据按第 9 步随整组 `rejected` manifest 原子写入 `release/`；不得直接写 tracked `docs/verification/`。已启用的性能失败不得自动降级为警告、改成 `Not run` 或从 manifest 删除原始数值；当次明确关闭且无硬要求的 `Not run` 不是失败，但必须保留风险。
2. 已批准范围内的实现偏差或已启用性能超限返回 `$desktop-implement-change` 修复并增加回归；该流程自动创建新开发分支，随后重新执行发布生命周期，形成新的 clean、已推送且被版本 tag 指向的默认分支 HEAD，再重新生成探针、证据和完整候选。不得只重写 manifest。
3. 新产品边界转交 `$desktop-define-product`；破坏性操作或新的外部副作用必须请求批准。不得以 `Partially verified` 掩盖必需逻辑缺失。

## 结论

验收结论只能是以下三种之一：

- `Milestone accepted`：每个必需场景和已选门禁均通过；发布审查与 GUI 性能选择分别满足其 `passed`/`waived`/`Not run` 契约；任何真正必需的人类签署已记录。
- `Awaiting human review`：自动证据通过，但必需人工结论尚未签署。
- `Milestone rejected`：一项必需条件失败，已记录修复回流路径。

`Awaiting human review` 保持整组 manifest `pending`；拒绝整组 `rejected`；只有接受才整组 `accepted`，并附 E2E、审查、性能、冒烟、签名和适用公证证据。三种结论都必须走第 8/9 步的二次发布上下文/最终字节复算与 staging 原子替换。性能豁免不等于通过，主动关闭不等于已验证。验收不授权创建或移动 tag、push、渠道发布、新签名、上传或额外清理。
