---
name: desktop-verify-delivery
description: 在里程碑/发布候选或用户明确要求完整验收时，使用批准场景和持久冒烟/E2E 策略验收或拒绝完整真实产物。快速和普通标准任务不调用。
---

# 验证交付

验证完整里程碑产物，不验证部分实现或一组通过的检查。

## 准入门禁

1. 确认任务已进入里程碑路径。按需读取最新 Product Spec、Agent Policy、活动 Work Plan、相关 ADR、`docs/ENGINEERING_RULES.md`、验证记录和适用接口/构建规则；不得为快速/标准任务临时制造里程碑结论。
2. 要求候选批次中的每个 Todo 均为 `done`。代码行为具有相关非空单元/回归测试，纯文档/元数据治理候选具有计划中声明的相称替代验证。存在任何非 `done` Todo 时停止并返回 `$desktop-implement-change`；不得运行冒烟/E2E。
3. 要求存在与已批准里程碑、源码提交、版本/构建标识和当前环境绑定的完整真实产物。拒绝源码片段、模拟实现、桩实现、占位内容、中性脚手架、开发预览、推测的产物路径和仅调用内部函数的证据。

## 里程碑工作流程

1. 说明已批准的核心成功路径、最高风险失败路径、真实输入/输出和可观察验收结果。区分外部前置项与产品逻辑。
2. 发现仓库真实命令和产物位置；绝不得编造。在构建 Skill 中不得运行冒烟/E2E，只构建或定位候选。验证由当前构建标识放入项目根 `release/` 的精确最终字节、校验和及清单。macOS Tauri 已签名直接分发候选必须同时记录 `notarizationStatus: notarized-and-stapled`；仅签名候选不具备验收资格。xwin NSIS 必须记录 `runtimeVerification: Unverified`，不能据交叉构建成功推断 Windows 行为。
3. 针对当前候选重新运行适用的编译/构建、相关非空单元/回归测试、必需集成/契约和产物存在性检查，并通过当前平台可用的 Python 3 解释器运行 `.agents/skills/desktop-implement-change/scripts/check_file_line_limits.py` 与 Rust workspace 的 `check_rust_chinese_comments.py --root . --json`；逐项复核 501 至 2000 行候选的高内聚、职责单一和职责相近性，任一项不满足、任一人工维护文本超过 2000 行或 Rust 声明注释违规时拒绝候选。GUI 候选还必须由前端 `pnpm lint` 与项目 validator 运行同源 TypeScript AST 注释门禁。macOS Tauri DMG 必须针对 `release/` 中当前最终字节重新运行 `$desktop-build-tauri-release` 的 `scripts/verify-dmg-layout.sh <final-dmg>`，以只读挂载确认 Finder 布局；检查需要接受软件许可时必须取得独立人工授权，不得自动接受或沿用旧 DMG 的布局证据。业务行为必须有 core 成功/最高风险领域失败测试和适配器映射/接口契约测试；仅有 adapter 测试时拒绝。Rust core/adapter 候选还必须运行 `check_core_first.py`；Python 不可用时，行数和 Rust 注释门禁阻断验收，只有 core-first 可以执行并记录等价 `cargo metadata` 依赖图检查。非代码治理候选执行已声明的解析、链接、静态、现有回归或差异检查；代码行为测试数为零或缺少必需覆盖时拒绝里程碑。若批准场景要求 Windows 原生运行，macOS xwin 候选必须转交真实 Windows 环境完成对应检查，不能以 `Unverified` 验收该场景。
4. 按以下顺序解析可选运行时检查：
   - 产品、渠道和安全硬要求；
   - 当前任务中更严格的用户约束；
   - `docs/AGENT_POLICY.md` 中的 `milestone_smoke` 和 `milestone_e2e`；
   - 对真实接口和产物的适用性。
5. `enabled` 表示适用时必须运行；`disabled` 表示记录 `Not run` 和剩余风险，除非硬要求覆盖该值。策略为 `pending`、缺失或非法，要求发生冲突，无法确认产物可运行，或需要新的凭据、生产环境或不可逆操作授权时，必须请求用户输入。
6. 仅通过有边界的只读入口，对真实产物运行适用冒烟。只有在 E2E 已启用或为必需项且真实产物存在时，才可在此调用 `$desktop-test-final-artifact-e2e`。已标记为 `milestoneAcceptance: pending` 的构建结果可以仅为进入本里程碑而存在于项目根 `release/`；必须在把它标记为就绪、上传到发布渠道或发布前执行已选检查。后续签名、公证或重新打包改变字节或运行时行为时，必须把结果视为新候选并重新执行本里程碑。
7. 记录精确候选、平台、命令/场景、预期/观测结果、清理、跳过的检查、`runtimeVerification`、签名/公证状态和未验证平台。不得推断跨平台成功。
8. 按文件边界、中文业务注释和 core-first 规则复核人工维护代码。逐项确认“适配器操作 → core API → core 测试”：领域校验、业务状态和包含条件/重试/状态决策的编排不得留在 adapter；系统托盘、窗口、终端恢复或 stdio 等机制可留在对应 adapter，但其业务效果必须调用 core。确认被独立事件触发的 Product Spec、设计文档和 Changelog 与实际行为一致；普通缺陷修复或纯重构不得反向生成 Product Spec、ADR 或 Changelog。本流程写入 Verification 是因为里程碑、发布或人工复核的审计触发器，而不是因为发生了修复；未触发的记忆不创建占位。

## 拒绝与修复循环

1. 产物缺失、不完整、不可运行，仍包含模拟/脚手架行为，偏离已批准场景，或任何必需/已启用检查失败、超时、取消或未执行时，必须拒绝里程碑。
2. 按 `docs/VERIFICATION.md` 的写入路由在日期证据卷中保留失败证据。
3. 对已批准范围内的实现缺口，重开或新增一个包含预期行为和回归测试的具体 Todo，把里程碑标记为已拒绝，并立即返回 `$desktop-implement-change`。修复后，要求完整批次重新达到 `done`，并重新运行完整里程碑。
4. 新发现的产品边界必须转交 `$desktop-define-product`；破坏性操作或新的外部副作用必须请求批准。只有不可用的外部平台不属于当前里程碑必需范围时，才可以保持 `Unverified`。
5. 必需产品逻辑仍然缺失或错误时，绝不得使用 `Partially verified` 作为验收结论。

## 结论

只能使用以下一种里程碑结论：

- `Milestone accepted`：每个必需场景和已选门禁均已通过，并且任何必需人工复核均已记录。
- `Awaiting human review`：自动证据已通过，但项目要求的人工结论尚未签署。
- `Milestone rejected`：一项必需条件失败；已记录重开的 Todo 和修复回流路径。

在不改变产物字节的情况下，保持每份匹配的 `release/` 清单同步：`Awaiting human review` 必须保持 `milestoneAcceptance: pending` 并引用自动证据；`Milestone rejected` 必须记录 `rejected` 及其失败证据；只有 `Milestone accepted` 才能记录 `accepted`，并附带已解析的冒烟/E2E、签名和适用的公证证据。绝不得根据目录存在推断状态转换。

验收不授权创建 tag、push、发布、新签名工作、上传或破坏性清理。
