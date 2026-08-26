---
name: desktop-prepare-cross-platform-release
description: 准备并验证 $desktop-build-rust-release 使用的 Windows、macOS、Linux 原生 Rust CLI 候选路线；接收本次 E2E 选择并在各运行器全量执行非空 workspace 单元测试，但只生成 pending 候选。
---

# 准备跨平台发布候选

为默认 `$desktop-build-rust-release` 路线生成原生平台候选和证据，不执行发布或运行时验收。

## 工作流程

1. 读取已批准的产品规格、用户显式请求的当前构建、`docs/AGENT_POLICY.md`、`docs/RUST_CLI_TEMPLATE.md`、`docs/RELEASE.md`、当前版本事实源，以及任何已批准的签名钩子配置；只有 E2E、完整验收或发布被独立触发时才读取其验证记录，只有用户要求的活动 Work Plan 存在时才读取它。
2. 确认当前构建由用户显式请求、仓库根是独立 Git 顶层目录，并且请求授权一个精确的 40 字符源码提交。手动提供方工作流保留固定的 `confirm_candidate_build`、`version`、`source_commit` 和 `e2e_selection` 输入。调用 `$desktop-manage-version check --phase build`，并要求固定 `version` 输入精确等于门禁返回的当前目标；任何运行器都不得提升版本或重置周期。在派发前及每个原生运行器的任何测试/编译前，只读运行 `python3 .agents/skills/desktop-prepare-release/scripts/release_notes.py check --file release-notes.json --expected-version <version>` 并计算 SHA-256；缺失、不一致或格式无效时失败，本 Skill 不得生成或改写更新日志。`e2e_selection` 只接受 `enabled`/`disabled`，由 `$desktop-build-rust-release` 完成逐次解析后提供。存在用户要求的活动 Todo 时不得构建尚未完成的范围，但 Work Plan 不是前置条件。必须在禁用凭据持久化的情况下检出该提交，并在执行仓库代码或签名钩子前验证 `HEAD`。不得推断发布授权。
3. 确定软件包/二进制文件名称、MSRV、目标平台和真实命令。声称三平台支持时，必须使用原生 Windows、macOS 和 Linux 运行器。使用 `fail-fast: false`，确保每个原生作业都到达可观察的终态；任何失败、取消或超时的作业都必须使整个矩阵失败。
4. 派发前，必须证明提供方访问、已复核且不可变的工作流/GitHub Action 固定引用、全部运行器类型和结果取回能力均可用。如果预检在派发前失败，向 `$desktop-build-rust-release` 返回结构化的不可用原因，以便其回退当前宿主。派发一旦开始，绝不得把平台失败重新分类为预检不可用。
5. 仅授予最小只读仓库权限。不得接受任意命令输入。第三方 action 必须固定到已复核且不可变的完整提交 SHA。
6. 在每个原生运行器上检出精确源码，选择可用的 Python 3 命令（先 `python3`，再 `python`），安装声明的 MSRV/组件并验证版本。缺少 Python 3 时必须明确使运行器失败。随后使用随附的平台辅助程序拒绝不安全的项目根 `release/`，原子隔离旧目录，创建并重新验证全新空目录，并且在执行任何单元测试或构建命令前，仅删除已隔离的旧目录树。
7. 在每个原生运行器上只先强制项目全部非空单元测试：使用 `cargo test --workspace --all-targets --all-features --locked -- --list` 或等价机器检查确认发现至少一个测试，再运行 `cargo test --workspace --all-targets --all-features --locked`；不得使用单 package、相关子集或缓存结果替代，也不得自动追加格式、lint 或其他开发门禁。随后运行锁定发布构建并要求真实二进制文件存在。不得启动该二进制文件。
8. 为原生二进制文件评估项目记录的非交互签名钩子。默认工作流识别 `.release-signing/sign-candidate.sh` 或 `.release-signing/sign-candidate.ps1`；每个钩子接收 `probe`、`sign` 或 `verify`，后接二进制文件路径。`probe` 退出码 `3` 表示不可用；`sign` 必须就地修改二进制文件；`verify` 验证这些精确字节；钩子不得写入 `release/` 或输出凭据。如果钩子及其已授权工具/凭据报告就绪，必须尝试签名并验证；尝试失败时作业必须失败。否则仅在签名为可选项时继续，并记录 `signingStatus: unsigned` 及其原因。绝不得暴露敏感信息，也不得通过工作流输入接受签名命令。
9. 把最终候选按 `<product>-v<version>-<platform>-<arch>.<ext>` 打包到项目根同级唯一暂存目录，归档内同时包含最终二进制和原样的根 `release-notes.json`；不得把日志作为 `release/` 第四个旁路文件。随后生成相邻 SHA-256 和清单。清单必须精确包含 `project`、机器 `version`、`sourceCommit`、`buildRun`、`buildMode`、`platform`、`architecture`、`target`、`host`、`archive`、`sha256`、`tests`、`e2eSelection`、带一个小写 `v` 的 `releaseNotesVersion`、`releaseNotesSha256`、`releaseNotesPath: release-notes.json`、`signingStatus`、`signingReason`、结构化 `signingEvidence` 和 `milestoneAcceptance` 字段，其中必须记录 `milestoneAcceptance: pending`。默认就地钩子必须记录固定钩子验证且不包含独立签名文件；`unsigned` 候选把验证记录为不适用。要求暂存目录文件名集合精确等于这三个普通文件。
10. 重新验证运行器上为空且不是重解析点的 `release/`，在不跟随链接的情况下移除该目录，并把完整的项目根同级暂存目录原子重命名到其位置。重新验证已提交路径和精确文件集，随后上传三个明确的归档/校验和/清单路径，不得上传目录或使用通配符。全部作业成功后，`$desktop-build-rust-release` 下载、验证并合并三个平台结果集，写入调用方项目已经清理的根 `release/`。不得创建标签、Releases、软件包仓库发布或部署。
11. 对工作流运行本地静态/契约检查，并只在候选 manifest、其声明的相邻制品证据和最终回复中记录本次 E2E 选择与未验证的运行器行为。不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification。矩阵本身不得运行 E2E；全部结果取回并形成最终候选后，由 `$desktop-build-rust-release` 根据本次选择决定是否交给 `$desktop-verify-delivery`。目录存在和提供方上传均不表示就绪。

## 门禁

- 缺少构建授权、MSRV 设置失败、测试缺失或失败、构建失败、已启动原生作业失败、候选缺失、版本不匹配、条件签名失败、校验和生成失败或结果取回不完整时，必须失败。
- 本工作流不得把冒烟、E2E、真实宿主交互或 Computer Use 混入平台测试/编译/打包作业；`e2e_selection` 只是向最终候选阶段传递当前选择。
- 不得从编译、打包、其他平台、模拟或交叉编译推断原生运行时行为。
- 打包只产生 `pending` 传输候选。此后任何改变字节的签名、公证或重新打包都会产生需要重新验收的新候选。
- 矩阵构建请求、执行和结果本身不触发任何项目记忆；只有被独立触发的 E2E、完整验收、发布、人工复核或长期审计由对应 Skill 按自身规则留证。
- 矩阵只读校验并打包 `release-notes.json`；任何生成、补写、重排或截断都必须回到 `$desktop-prepare-release` 的候选前阶段。

## 完成输出

报告工作流路径、权限/GitHub Action 固定引用、原生矩阵、源码提交/版本、全量非空单元测试、release 目录清理、候选/哈希/清单、签名结果、里程碑状态 `pending`、本次 E2E 选择、运行器结果和最终候选阶段的下一项操作；不更新项目记忆。
