---
name: desktop-verify-delivery
description: 对发布候选、用户明确要求完整验收或当前构建启用 E2E 的最终真实产物进行验收；日常开发不得自动调用。
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
3. 运行候选自身所必需的真实产物存在性、接口/渠道和最终字节检查。macOS Tauri DMG 必须针对 `release/` 中当前最终字节重新运行 `$desktop-build-tauri-release` 的 `scripts/verify-dmg-layout.sh <final-dmg>`；不得自动接受软件许可或沿用旧 DMG 的布局证据。xwin NSIS 保持 `runtimeVerification: Unverified`，不能据交叉构建成功推断 Windows 行为。
4. 解析运行时检查：产品/渠道/安全硬要求优先；冒烟读取 `milestone_smoke`；E2E 只读取当前构建的明确选择，`milestone_e2e` 仅用于当时询问的建议默认值，不能在此替代或反转选择。
5. E2E 为 `enabled` 或硬要求时调用 `$desktop-test-final-artifact-e2e`；为 `disabled` 时记录 `Not run` 和剩余风险。需要凭据、生产数据、支付、发布或不可逆副作用时仍须独立授权。
6. 记录精确候选、平台、命令/场景、预期/观测结果、清理、跳过项、`runtimeVerification`、签名/公证状态和未验证平台。确认被独立事件触发的 Product Spec、设计文档和 Changelog 与实际行为一致，不创建无触发原因的记忆占位。

## 拒绝与修复

1. 产物缺失、不完整、不可运行、偏离批准场景，或任一必需/已启用检查失败、超时、取消或未执行时拒绝候选并按 `docs/VERIFICATION.md` 保存证据。
2. 已批准范围内的实现偏差立即返回 `$desktop-implement-change` 修复并增加本次回归测试，随后重新构建完整候选。只有用户要求的活动计划存在时才重开或新增 Todo。
3. 新产品边界转交 `$desktop-define-product`；破坏性操作或新的外部副作用必须请求批准。不得以 `Partially verified` 掩盖必需逻辑缺失。

## 结论

验收结论只能是以下三种之一：

- `Milestone accepted`：每个必需场景和已选门禁均通过，任何必需人工复核已记录。
- `Awaiting human review`：自动证据通过，但必需人工结论尚未签署。
- `Milestone rejected`：一项必需条件失败，已记录修复回流路径。

`Awaiting human review` 保持 manifest `milestoneAcceptance: pending`；拒绝记录 `rejected`；只有接受才记录 `accepted`，并附当前构建的 E2E 选择、冒烟、签名和适用公证证据。验收不授权 tag、push、发布、新签名工作、上传或破坏性清理。
