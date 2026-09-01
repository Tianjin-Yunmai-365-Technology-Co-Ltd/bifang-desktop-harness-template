---
name: desktop-verify-delivery
description: 对发布候选、用户明确要求完整验收或当前构建启用 E2E 的最终真实产物进行验收；GUI 按当次性能选择条件复核门禁或 Not run 风险，日常开发不得自动调用。
---

# 验证交付

验证完整真实候选，不把开发检查、模拟实现或目录存在误报为可用。

## 准入

1. 只接受发布/渠道要求、用户明确要求完整验收，或当前构建已明确选择 E2E `enabled` 的请求。读取 Product Spec、当前构建记录、`docs/AGENT_POLICY.md`、`docs/ENGINEERING_RULES.md`、相关 ADR、验证/发布规则和适用接口 Skill。
2. 要求存在与批准场景、40 字符源码提交、版本/构建标识和当前环境绑定的完整真实产物、校验和及 manifest。下游同时运行 `$desktop-manage-version check --phase release`，并要求候选/manifest 版本精确等于当前目标；验收不得提升版本或重置周期。拒绝源码片段、模拟实现、桩、占位、中性脚手架、开发预览、推测路径和仅调用内部函数的证据。
3. 当前存在用户要求的活动 Work Plan 时，相关 Todo 必须全部 `done`；没有 Work Plan 不阻断验收。

## 工作流程

1. 明确核心成功路径、最高风险失败路径、真实输入/输出和可观察结果，区分外部前置项与产品逻辑。
2. 核对当前构建已经运行项目全部非空单元测试。Rust 证据必须覆盖 workspace/all-targets/all-features 的锁定测试；GUI 还必须覆盖完整前端单元测试套件。只有源码提交、锁文件和候选构建身份完全匹配时才复用该证据；任何变化都必须返回构建 Skill 重建，不在验收中重复一套隐式构建流程。
3. 运行候选自身所必需的真实产物存在性、接口/渠道和最终字节检查。所有 GUI 候选先核对 manifest 的 `releaseNotesVersion`、`releaseNotesSha256`、`releaseNotesPath: release-notes.json` 与根事实；对可定位的实际应用资源运行 `verify_release_notes_resource.py bytes`。macOS Tauri DMG 必须针对 `release/` 中当前最终字节重新运行 `$desktop-build-tauri-release` 的 `scripts/verify-dmg-layout.sh <final-dmg> <project-root>/release-notes.json`，只读挂载并再次证明唯一 `.app/Contents/Resources/release-notes.json` 逐字节一致；不得自动接受软件许可或沿用旧 DMG 的布局证据，也不得沿用旧更新日志证据。xwin NSIS 保持 `runtimeVerification: Unverified`，不能据交叉构建成功或未安装资源目录检查推断 Windows 行为。
4. 解析运行时检查：产品/渠道/安全硬要求优先；冒烟读取 `milestone_smoke`；E2E 只读取当前构建的明确选择，`milestone_e2e` 仅用于当时询问的建议默认值，不能在此替代或反转选择。GUI 性能只读取 manifest 的当次 `performanceSelection`，不得在验收阶段补问、推断或把 `disabled` 静默翻转；产品/渠道硬要求与 `disabled` 冲突时拒绝候选并返回新构建。
5. 按每个 GUI manifest 的 `performanceSelection` 条件复核性能，且 E2E 选择不能替代或改变该结论。
   - `enabled`：复核打包前 `$desktop-test-gui-release-performance` 的 no-bundle 探针证据，要求 `performanceStatus: passed`，或用户看过保留的失败指标后在当前请求明确批准且仍记录为 `waived`。证据中的 `performanceProbeSha256`、clean 40 位 `sourceCommit`、平台、架构、native buildMode 和 Release profile 必须与 manifest 一致，安装包 `sha256` 不能冒充探针摘要；`failed`、缺失、旧探针都阻断接受，`Unverified` 只准确描述未在真实目标平台运行且在产品/渠道要求性能时阻断。随后从最终 bundle 定位真实运行时，核对 `performanceRuntimeBinding`：打包前 staged unsigned runtime 与探针逐字节相同；未签名变换时最终 runtime 也逐字节相同，发生平台签名时则要求签名前相同摘要、签名后包内 runtime 摘要与签名验证全部匹配。重新编译、配置/依赖/启动器/行为变化或无法证明这一绑定时，废弃旧性能证据并返回同一 clean HEAD 的探针/打包流程；DMG/NSIS 容器摘要本身不构成运行时绑定。
   - `disabled`：只有不存在产品/渠道性能硬要求时才接受 `performanceStatus: Not run`，并要求非空 `performanceReason`、`performanceRemainingRisk`，同时要求 `performanceEvidence`、`performanceProbe`、`performanceProbeSha256`、`performanceThresholdProfile`、`performanceWaiver` 和 `performanceRuntimeBinding` 全部缺席。旧证据残留、状态不匹配、缺少原因或试图用 `Not run` 覆盖同一候选的真实失败都拒绝。
6. E2E 为 `enabled` 或硬要求时调用 `$desktop-test-final-artifact-e2e`；含 GUI 且 `about_page = enabled` 时，必须从真实候选打开关于页和“更新日志”，对照已核验的候选资源确认当前版本、近五版、固定两类与单个小写 `v`，不能用注入数组或源码夹具代替；禁用时确认路由、入口与运行时命令缺席。E2E 为 `disabled` 时记录 `Not run` 和剩余风险；GUI 性能仍按第 5 步的独立当次选择形成结论。需要凭据、生产数据、支付、发布或不可逆副作用时仍须独立授权。
7. 记录精确候选、平台、命令/场景、预期/观测结果、清理、跳过项、`runtimeVerification`、`performanceSelection`、`performanceStatus`、适用性能证据/豁免或 `Not run` 原因/剩余风险、签名/公证状态和未验证平台。确认被独立事件触发的 Product Spec、设计文档和 Changelog 与实际行为一致，不创建无触发原因的记忆占位。

## 拒绝与修复

1. 产物缺失、不完整、不可运行、偏离批准场景，或任一必需/已启用检查失败、超时、取消或未执行时拒绝候选并按 `docs/VERIFICATION.md` 保存证据。已启用的性能失败不得自动降级为警告、改成 `Not run` 或从 manifest 删除原始数值；当次明确关闭且无硬要求的 `Not run` 不是失败，但必须保留风险。
2. 已批准范围内的实现偏差或已启用性能超限立即返回 `$desktop-implement-change` 修复并增加本次回归测试，随后从新的 clean HEAD 重新生成 Release no-bundle 探针、性能证据和完整候选；包内运行时绑定失败同样不得只重写 manifest。只有用户要求的活动计划存在时才重开或新增 Todo。
3. 新产品边界转交 `$desktop-define-product`；破坏性操作或新的外部副作用必须请求批准。不得以 `Partially verified` 掩盖必需逻辑缺失。

## 结论

验收结论只能是以下三种之一：

- `Milestone accepted`：每个必需场景和已选门禁均通过；GUI 性能选择为 `enabled` 时状态为 `passed`，或保留失败证据且存在用户明确确认的 `waived`；选择为 `disabled` 且无硬要求时状态为 `Not run` 并保留原因和剩余风险；任何必需人工复核已记录。
- `Awaiting human review`：自动证据通过，但必需人工结论尚未签署。
- `Milestone rejected`：一项必需条件失败，已记录修复回流路径。

`Awaiting human review` 保持 manifest `milestoneAcceptance: pending`；拒绝记录 `rejected`；只有接受才记录 `accepted`，并附当前构建的 E2E 选择、GUI 性能选择与状态、适用证据/豁免或 `Not run` 原因/风险、冒烟、签名和适用公证证据。性能豁免不等于性能通过，主动关闭也不等于性能已验证。验收不授权 tag、push、发布、新签名工作、上传或破坏性清理。
