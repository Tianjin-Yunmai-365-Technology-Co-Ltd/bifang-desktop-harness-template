---
name: desktop-prepare-cross-platform-release
description: 在本地 Git 发布后、另行授权推送完成且用户明确请求三平台候选时，准备 Rust CLI 原生矩阵并验证远端分支、tag 与源码提交。
---

# 准备跨平台发布候选

为 `$desktop-build-rust-release` 的明确三平台构建请求生成原生平台 `pending` 候选。只有 Git 发布后另行授权的推送已完成，且远端小写 `release` 分支和版本 tag 都指向本地已发布的同一源码提交，才能进入。远端 advertised 默认分支可指向其他提交，不得因候选构建移动它。本 Skill 不执行推送或 Git 发布，也不设置保护分支、严格线性、fast-forward-only 或其他分支形态门禁。

## 工作流程

1. 读取产品规格、当前构建请求、`docs/AGENT_POLICY.md`、`docs/RUST_CLI_TEMPLATE.md`、`docs/RELEASE.md`、版本事实与签名配置。只有 E2E/完整验收被独立触发时读取对应记录。
2. 要求用户显式请求构建、项目根是独立 Git 顶层，并以 `git status --porcelain=v1 --untracked-files=all` 复核工作树 clean。普通构建不自动提交。运行：

   ```text
   node .agents/skills/desktop-prepare-release/scripts/release_context.mjs verify --project-root . --expected-version <version>
   ```

   随后锁定 40 位 `sourceCommit`、`releaseContextSha256`、本地默认分支、`expectedTag` 与 `releaseReview`。在派发前另用只读远端 ref 查询，证明用户独立授权推送后，远端 `refs/heads/release` 和发布 tag 都精确指向该提交；缺少任一 ref 或未获推送授权即停止，不自行推送。发布上下文只描述本地 Git 发布和审查事实，不包含远端模式、候选 E2E 或签名选择。
3. 准备以已验证的远端 `release` ref 派发手动提供方工作流，只接受固定 `confirm_candidate_build`、`version`、`source_commit`、`release_context_sha256` 和 `e2e_selection` 输入。摘要必须来自上一步；审查只能从已跟踪上下文读取，Rust CLI 的 macOS 签名选择由本次构建判定为 `not-applicable` 并写入候选 manifest。版本通过 `$desktop-manage-version check --phase build` 核对，更新日志只读检查并计算摘要。
4. GitHub 的 `workflow_dispatch` 还要求同一 workflow 文件已存在于远端 advertised 默认分支；发布后的 `release` 分支和 tag 齐备并不能代替此要求。真正派发前运行只读预检：

   ```text
   node .agents/skills/desktop-prepare-cross-platform-release/scripts/verify_dispatch_readiness.mjs --project-root . --remote <name>
   ```

   它核对下游 `.github/workflows/release-candidate.yml` 与本 Skill 的 [assets/github-release-candidate.yml](assets/github-release-candidate.yml) 逐字节相同，并用远端 advertised 默认分支的精确提交对象确认普通 workflow 文件及 `workflow_dispatch` 入口。缺少该文件、入口、可验证的默认分支提交对象，或预检期间远端默认分支漂移，都在矩阵启动前判定 provider unavailable；预检不 fetch、push 或移动默认分支。另确认提供方、固定 action SHA、原生运行器和结果取回能力可用；全部通过后才以 `ref: release` 派发。不可用时交回 `$desktop-build-rust-release` 走其受限本机回退；已启动作业失败不得改判为回退条件。
5. 每个运行器固定检出小写 `release` 分支并使用 full fetch、`persist-credentials: false`，再由固定 SHA 的官方 action 安装 Node.js `24.21.0` 并复核运行时不低于 `24.21.0`。运行器要求当前具名分支等于 `release`、`HEAD == source_commit`、`refs/remotes/origin/release` 与 `refs/tags/<expectedTag>` 都指向该提交、工作树 clean。远端 advertised 默认分支只保留其已有身份，不要求它指向该提交。
6. 在任何项目代码、测试、构建或签名钩子前，用 `scripts/verify_release_context.mjs capture` 验证：
   - `.harness/release-context.json` 是普通文件；工作树字节等于 `source_commit` 中的 Git blob；SHA-256 等于输入；
   - schema、版本、`expectedTag: v{version}-{YYYYMMDD}`、发布上下文中的本地默认分支、远端跟踪 `release` ref 与已 fetch tag 分别有效；后两者指向同一发布提交，本地默认分支名称可不同于 `release`；
   - 本地 Git 发布上下文未携带候选构建或远端发布模式选择。
   规范快照只能原子写到 runner 临时目录。
7. 安装项目声明 MSRV 后，由 `release_candidate_workflow.mjs check-lock-policy` 按根 Cargo 元数据调用共享 `assertDependencyLocks`，在任何 Cargo metadata、测试或构建前确定锁标志。缺省或 `ignored` 不要求 `Cargo.lock`，保持原有命令；显式 `tracked` 要求实际 workspace 锁文件受 Git 跟踪且未被忽略，Cargo metadata、列测试、全部非空 `cargo test --workspace --all-targets --all-features --locked` 和 release 构建均使用 `--locked`。安全刷新 `release/`，测试后复核 clean/HEAD，再运行 release 构建。不得启动二进制或混入格式/lint/E2E。
8. 按批准配置探测并执行非交互签名钩子。签名开始后失败必须失败；条件不存在且策略允许时记录 `unsigned` 与原因。不得暴露凭据或接受任意签名命令输入。
9. 在项目根同级安全暂存目录生成确定性归档、相邻 SHA-256 和 manifest；归档包含最终二进制与原样 `release-notes.json`。写 manifest 前调用 `verify_release_context.mjs verify`，逐字段比较捕获快照，证明 HEAD、clean、上下文 bytes/hash、远端 `release` ref 和版本 tag 未漂移。
10. manifest 至少记录 `project`、机器 `version`、`sourceCommit`、`releaseContextSha256`、`buildRun`/`buildMode`、平台/架构/target/host、归档/摘要、测试、当次构建 E2E 选择、完整 `releaseReview` 及其审查投影、更新日志版本/摘要/路径、签名状态/原因/证据和 `milestoneAcceptance: pending`。审查只从上下文复制；E2E 与签名事实来自本次构建输入和运行结果。
11. 验证暂存目录精确文件集后，以不跟随链接的目录级原子替换提交到项目根 `release/`，再上传三个明确文件路径。全部作业成功后由 `$desktop-collect-release-artifacts` 原子合并结果；不得逐个污染调用方 `release/`。

## 固定候选契约

- 本 Skill 是默认 `$desktop-build-rust-release` 路线，矩阵固定 `fail-fast: false`。在执行任何单元测试或构建命令前，必须先运行 `release_notes.mjs check --file release-notes.json --expected-version <version>`；本 Skill 不得生成或改写更新日志，也不得自动追加格式、lint 或其他开发门禁。
- 运行器使用 `fetch-depth: 0` 获得 fresh 全历史/全部 remote-tracking 分支快照，并保持凭据不持久化；这些数据只用来验证远端 `release` 分支和版本 tag，不检查祖先、线性或合并形态。候选派发前必须运行 `verify_dispatch_readiness.mjs`，只读确认远端默认分支已有可派发 workflow；不得为满足 GitHub 触发条件修改 ref、创建 tag、推送默认分支或执行渠道发布。
- 在测试和构建前原子隔离旧目录。签名条件成立时必须尝试签名并验证；条件不成立且策略允许时记录 `signingStatus: unsigned`、原因和结构化 `signingEvidence`，不得静默降级或输出凭据。
- Rust CLI 的 macOS GUI 签名选择不适用，不从发布上下文读取 `candidateSelections`。最终字节形成后且写 manifest 前，第二次校验发布上下文和已 fetch 远端 refs，完整规范化 `releaseReview`。manifest 的 `sourceCommit` 是实际构建 HEAD，绝不能写成审查 `sourceHead`；审查关闭时只复制 `reviewReason`/`reviewRemainingRisk`。
- manifest 还必须包含 `e2eSelection`、`releaseNotesVersion`、`releaseNotesSha256` 与 `releaseNotesPath: release-notes.json`。不能把暂存目录放进工作树或依赖 ignore 隐藏；完整精确集合验证后，把完整的项目根同级暂存目录原子重命名到其位置，并上传三个明确的归档/校验和/清单路径。
- 不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification；候选 E2E 与完整验收只把结构化证据和状态原子写入忽略的 `release/` manifest 及其声明证据，不得反向批准活动或历史候选。

## 失败条件

- 独立推送或三平台构建授权缺失、dirty、HEAD/source_commit 不同、上下文摘要/schema/版本不同、远端 `release` ref 或版本 tag 不指向提交、远端默认分支缺少可派发 workflow、MSRV/测试/构建/签名失败、候选缺失或取回不完整都必须失败。
- 不检查分支祖先、合并类型、线性历史、feature 分支是否仍存在，也不要求远端 advertised 默认分支指向发布提交；该分支只为 workflow_dispatch 可派发性做只读预检，不创建或移动它。
- 工作流不创建、移动或推送 branch/tag；它只验证 Git 发布后另行授权的推送已经使远端 `release` 分支和 tag 指向已发布源码。
- 矩阵只生成 `pending` 候选；矩阵本身不得运行 E2E、验收或渠道发布，也不更新项目记忆。

## 完成输出

报告本地 Git 发布和独立推送的 ref 复核、工作流路径与 action 固定引用、原生矩阵、`sourceCommit`、`releaseContextSha256`、版本/tag、全量非空单元测试、候选/摘要/manifest、签名、运行器结果、`pending` 状态与下一步；不更新项目记忆。
