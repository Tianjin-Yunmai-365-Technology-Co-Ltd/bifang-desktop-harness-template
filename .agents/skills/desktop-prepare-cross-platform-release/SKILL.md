---
name: desktop-prepare-cross-platform-release
description: 按明确的平台范围组织 Rust CLI 的原生宿主本地构建，接收当次 E2E 选择并收集本地结果；不使用 CI/CD，只生成 pending 候选。
---

# 准备本地跨平台发布候选

只有明确需要其他原生平台时，才扩展默认当前宿主的 `$desktop-build-rust-release` 路线。Windows、macOS 和 Linux 分别在对应原生宿主本地构建，不配置、触发或等待任何 CI/CD，不推送、不上传、不下载远端制品。

## 工作流程

1. 读取当前明确构建请求、`docs/AGENT_POLICY.md`、`docs/RUST_CLI_TEMPLATE.md`、`docs/RELEASE.md`、根 Cargo 平台/版本事实及适用签名配置。确认实际需要的平台和架构，不因可跨平台就强制三平台；本 Skill 不提供远程构建或传输通道。
2. 每个原生宿主必须使用独立 Git 顶层目录，要求 `git status --porcelain=v1 --untracked-files=all` 为空，并固定同一明确批准的 40 位 `source_commit`。本地已有精确源码才能构建；不 fetch、push、创建 remote 或下载 CI 产物。普通构建不得暂存、提交或配置身份，只有明确发布流程可先受控本地提交。
3. 调用 `$desktop-manage-version check --phase build`，固定 `version`、`source_commit`、本地 `buildRun` 和 `e2e_selection`。E2E 只接受调用方已经为当前候选解析的 `enabled`/`disabled`；不重新询问、不继承旧选择。每个宿主在测试前只读运行 `python3 .agents/skills/desktop-prepare-release/scripts/release_notes.py check --file release-notes.json --expected-version <version>` 并计算摘要；不得生成或改写更新日志，也不提升版本或重置周期。
4. 每个宿主只执行 `$desktop-build-rust-release` 的本地测试、构建、签名及打包步骤，不递归调用多平台编排。在执行任何单元测试或构建命令前，使用它的对应 POSIX/PowerShell helper 原子隔离旧目录，验证全新空 `release/`，只删除已隔离旧树。缺少平台、工具或源码时记录准确状态，不设置提供方或托管运行器。
5. 读取项目声明的 `rust-version` 和真实锁定命令，复用本机兼容工具链。使用 `cargo test --workspace --all-targets --all-features --locked -- --list` 确认非空，再运行 `cargo test --workspace --all-targets --all-features --locked`；不得自动追加格式、lint 或其他开发门禁。测试后再次确认 clean 且 `HEAD == source_commit`，再执行 `cargo build --release --locked --workspace` 或真实项目锁定命令。任何必需平台缺失、测试失败、编译失败、超时或取消均阻断对应交付，不得改用本机成功掩盖。环境恢复只在真实命令已因受管环境问题失败后进入对应 Skill。
6. 使用已记录的 `.release-signing/sign-candidate.sh` 或 `.release-signing/sign-candidate.ps1` 的 `probe`/`sign`/`verify` 固定协议；条件齐备且已有授权时必须尝试签名并验证，失败不得降级。条件缺失且允许未签名时记录 `signingStatus: unsigned` 与原因。签名钩子不得上传、写 `release/` 或输出凭据；任何外部公证必须遵循独立授权，不能借本 Skill 自动发起。
7. 按 `<product>-v<version>-<platform>-<arch>.<ext>` 打包最终二进制及原样 `release-notes.json`。在唯一暂存目录形成归档、相邻校验和、清单三个普通文件，复核摘要和精确文件集。清单包含 `project`、机器 `version`、`sourceCommit`、本地 `buildRun`、`buildMode`、`platform`、`architecture`、`target`、`host`、`archive`、`sha256`、非空 `tests`、`e2eSelection`、`releaseNotesVersion`、`releaseNotesSha256`、`releaseNotesPath: release-notes.json`、`signingStatus`、`signingReason`、结构化 `signingEvidence` 和 `milestoneAcceptance: pending`。
8. 写清单前再次要求 clean 且 `HEAD == source_commit`；重新验证 `release/` 为空且不是重解析点，只移除这个已验证的空目录，再把完整的项目根同级暂存目录原子重命名到其位置，复核最终精确文件集。不上传制品，输出本地目录与摘要供用户收集。若当前宿主也是最终收集目标，则遵循调用方的多平台分支，把本宿主候选留在目标之外的唯一暂存目录，不能提前落入随后会刷新的 `release/`。
9. 只有用户提供了各平台的本地结果目录，才调用 `$desktop-collect-release-artifacts` 校验并合并。缺失平台标记 `Unverified`，必需平台缺失或失败不得交付完整多平台集合。本 Skill 不接受提供方“最新”结果，不运行 E2E；最终候选形成后由调用方按本次选择交给 `$desktop-verify-delivery`。

## 边界与输出

- 本地原生多平台构建只产生 `pending` 候选；不得从编译、其他平台或交叉编译推断原生运行行为。
- 不安装或更新 `.github/workflows/release-candidate.yml`，不创建 CI/CD 配置、标签、Release、软件包发布或部署；Git remote 不属于前置条件。
- 构建请求、执行和结果本身不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification；独立触发的验收或正式本地发布由对应 Skill 留证。
- 报告实际宿主、源码提交、版本、本地构建批次、非空测试、目录清理、制品/哈希/清单、签名结果、`pending` 状态、当前 E2E 选择、未验证平台及下一步。只在 manifest、其声明证据和最终回复保存构建事实。
