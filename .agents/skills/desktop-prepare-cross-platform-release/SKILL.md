---
name: desktop-prepare-cross-platform-release
description: 为 Rust CLI 候选准备 Windows、macOS、Linux 原生矩阵，验证已推送主分支、版本 tag 与发布上下文，但不执行渠道发布或验收。
---

# 准备跨平台发布候选

为 `$desktop-build-rust-release` 生成原生平台 `pending` 候选。只验证发布结果，不设置保护分支、严格线性、fast-forward-only 或任何其他分支形态门禁。

## 工作流程

1. 读取产品规格、当前构建请求、`docs/AGENT_POLICY.md`、`docs/RUST_CLI_TEMPLATE.md`、`docs/RELEASE.md`、版本事实与签名配置。只有 E2E/完整验收被独立触发时读取对应记录。
2. 要求用户显式请求构建、项目根是独立 Git 顶层，并以 `git status --porcelain=v1 --untracked-files=all` 复核工作树 clean。普通构建不自动提交。运行：

   ```text
   python3 .agents/skills/desktop-prepare-release/scripts/release_context.py verify --project-root . --expected-version <version>
   ```

   锁定返回的 40 位 `sourceCommit`、`releaseContextSha256`、远端动态默认分支、`expectedTag`、`releaseReview` 与 `candidateSelections`。Rust CLI 的性能与 macOS 签名选择必须精确为 `not-applicable`。上下文只描述审查/构建选择；它不限制提交拓扑。
3. 手动提供方工作流只接受固定 `confirm_candidate_build`、`version`、`source_commit`、`release_context_sha256` 和 `e2e_selection` 输入。摘要必须来自上一步；审查/性能/签名选择不能作为 workflow input 或由对话补齐。版本通过 `$desktop-manage-version check --phase build` 核对，更新日志只读检查并计算摘要。
4. 派发前只读确认下游 `.github/workflows/release-candidate.yml` 与本 Skill 的 [assets/github-release-candidate.yml](assets/github-release-candidate.yml) 逐字节相同，并确认提供方、固定 action SHA、原生运行器和结果取回能力可用。缺失或漂移在矩阵启动前判定 provider unavailable，交回 `$desktop-build-rust-release` 走其受限本机回退；已启动作业失败不得改判为回退条件。
5. 每个运行器固定检出提供方动态默认分支并使用 full fetch、`persist-credentials: false`。运行器要求当前具名分支等于提供方默认分支、`HEAD == source_commit`、`refs/remotes/origin/<default>` 与 `refs/tags/<expectedTag>` 都指向该提交、工作树 clean。默认分支名称不限于 `main/master`。
6. 在任何项目代码、测试、构建或签名钩子前，用 `scripts/verify_release_context.py capture` 验证：
   - `.harness/release-context.json` 是普通文件；工作树字节等于 `source_commit` 中的 Git blob；SHA-256 等于输入；
   - schema、版本、`expectedTag: v{version}-{YYYYMMDD}`、默认分支、远端跟踪 ref 与已 fetch tag 一致；
   - CLI 候选选择精确不适用。
   规范快照只能原子写到 runner 临时目录。
7. 安装项目声明 MSRV，安全刷新 `release/`，运行全部非空 `cargo test --workspace --all-targets --all-features --locked`，测试后复核 clean/HEAD，再运行锁定 release 构建。不得启动二进制或混入格式/lint/E2E。
8. 按批准配置探测并执行非交互签名钩子。签名开始后失败必须失败；条件不存在且策略允许时记录 `unsigned` 与原因。不得暴露凭据或接受任意签名命令输入。
9. 在项目根同级安全暂存目录生成确定性归档、相邻 SHA-256 和 manifest；归档包含最终二进制与原样 `release-notes.json`。写 manifest 前调用 `verify_release_context.py verify`，逐字段比较捕获快照，证明 HEAD、clean、上下文 bytes/hash、默认分支 ref 和版本 tag 未漂移。
10. manifest 至少记录 `project`、机器 `version`、`sourceCommit`、`releaseContextSha256`、`buildRun`/`buildMode`、平台/架构/target/host、归档/摘要、测试、E2E 选择、完整 `releaseReview`/`candidateSelections` 及其审查投影、更新日志版本/摘要/路径、签名状态/原因/证据和 `milestoneAcceptance: pending`。所有选择只从上下文复制。
11. 验证暂存目录精确文件集后，以不跟随链接的目录级原子替换提交到项目根 `release/`，再上传三个明确文件路径。全部作业成功后由 `$desktop-collect-release-artifacts` 原子合并结果；不得逐个污染调用方 `release/`。

## 固定候选契约

- 本 Skill 是默认 `$desktop-build-rust-release` 路线，矩阵固定 `fail-fast: false`。在执行任何单元测试或构建命令前，必须先运行 `release_notes.py check --file release-notes.json --expected-version <version>`；本 Skill 不得生成或改写更新日志，也不得自动追加格式、lint 或其他开发门禁。
- 运行器使用 `fetch-depth: 0` 获得 fresh 全历史/全部 remote-tracking 分支快照，并保持凭据不持久化；这些数据只用来验证动态默认主分支和版本 tag，不检查祖先、线性或合并形态。候选阶段只能只读确认下游 `.github/workflows/release-candidate.yml` 与该资产逐字节一致，不得修改 ref、创建 tag 或执行渠道发布。
- 在测试和构建前原子隔离旧目录。签名条件成立时必须尝试签名并验证；条件不成立且策略允许时记录 `signingStatus: unsigned`、原因和结构化 `signingEvidence`，不得静默降级或输出凭据。
- Rust CLI 的 `candidateSelections` 精确不适用。最终字节形成后且写 manifest 前，第二次校验发布上下文，完整规范化 `releaseReview`/`candidateSelections`。manifest 的 `sourceCommit` 是实际构建 HEAD，绝不能写成审查 `sourceHead`；审查关闭时只复制 `reviewReason`/`reviewRemainingRisk`。
- manifest 还必须包含 `e2eSelection`、`releaseNotesVersion`、`releaseNotesSha256` 与 `releaseNotesPath: release-notes.json`。不能把暂存目录放进工作树或依赖 ignore 隐藏；完整精确集合验证后，把完整的项目根同级暂存目录原子重命名到其位置，并上传三个明确的归档/校验和/清单路径。
- 不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification；候选 E2E 与完整验收只把结构化证据和状态原子写入忽略的 `release/` manifest 及其声明证据，不得反向批准活动或历史候选。

## 失败条件

- 授权缺失、dirty、HEAD/source_commit 不同、上下文摘要/schema/版本不同、远端默认 ref 或版本 tag 不指向提交、MSRV/测试/构建/签名失败、候选缺失或取回不完整都必须失败。
- 不检查分支祖先、合并类型、线性历史、feature 分支是否仍存在，也不检查或创建名为 `Release` 的分支。
- 工作流不创建、移动或推送 tag；它只验证发布生命周期已经成功推送的 tag。
- 矩阵只生成 `pending` 候选；矩阵本身不得运行 E2E、验收或渠道发布，也不更新项目记忆。

## 完成输出

报告工作流路径与 action 固定引用、原生矩阵、`sourceCommit`、`releaseContextSha256`、版本/tag、全量非空单元测试、候选/摘要/manifest、签名、运行器结果、`pending` 状态与下一步；不更新项目记忆。
