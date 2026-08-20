---
name: desktop-prepare-cross-platform-release
description: 准备并验证 $desktop-build-rust-release 使用的默认 Windows、macOS 和 Linux 原生 Rust CLI 候选路线，包括各运行器的 release 清理和条件签名；绝不运行冒烟或 E2E，也绝不把候选标记为已验收。用于增加 CI 构建矩阵，或生成带编译与非空测试证据的平台候选归档时。
---

# 准备跨平台发布候选

为默认 `$desktop-build-rust-release` 路线生成原生平台候选和证据，不执行发布或里程碑运行时验收。

## 工作流程

1. 读取已批准的产品规格、活动 Todo/里程碑工作计划、`docs/AGENT_POLICY.md`、`docs/RUST_CLI_TEMPLATE.md`、`docs/RELEASE.md`、当前版本事实源、验证记录，以及任何已批准的签名钩子配置。
2. 确认当前批次中的每个 Todo 均为 `done`、仓库根是独立 Git 顶层目录，并且当前构建请求授权一个精确的 40 字符源码提交。手动提供方工作流可以保留固定的 `confirm_candidate_build`、`version` 和 `source_commit` 输入；`$desktop-build-rust-release` 在预检后提供这些值。必须在禁用凭据持久化的情况下检出该提交，并在执行仓库代码或签名钩子前验证 `HEAD`。不得推断发布授权。
3. 确定软件包/二进制文件名称、MSRV、目标平台和真实命令。声称三平台支持时，必须使用原生 Windows、macOS 和 Linux 运行器。使用 `fail-fast: false`，确保每个原生作业都到达可观察的终态；任何失败、取消或超时的作业都必须使整个矩阵失败。
4. 派发前，必须证明提供方访问、已复核且不可变的工作流/GitHub Action 固定引用、全部运行器类型和结果取回能力均可用。如果预检在派发前失败，向 `$desktop-build-rust-release` 返回结构化的不可用原因，以便其回退当前宿主。派发一旦开始，绝不得把平台失败重新分类为预检不可用。
5. 仅授予最小只读仓库权限。不得接受任意命令输入。第三方 action 必须固定到已复核且不可变的完整提交 SHA。
6. 在每个原生运行器上检出精确源码，选择可用的 Python 3 命令（先 `python3`，再 `python`），安装声明的 MSRV/组件并验证版本。缺少 Python 3 时必须明确使运行器失败。随后使用随附的平台辅助程序拒绝不安全的项目根 `release/`，原子隔离旧目录，创建并重新验证全新空目录，并且在执行任何格式化、测试或构建命令前，仅删除已隔离的旧目录树。
7. 按适用性运行格式化/代码规范检查，通过机器门禁强制非空单元测试套件，运行锁定的发布构建并要求真实二进制文件存在。不得启动该二进制文件。
8. 为原生二进制文件评估项目记录的非交互签名钩子。默认工作流识别 `.release-signing/sign-candidate.sh` 或 `.release-signing/sign-candidate.ps1`；每个钩子接收 `probe`、`sign` 或 `verify`，后接二进制文件路径。`probe` 退出码 `3` 表示不可用；`sign` 必须就地修改二进制文件；`verify` 验证这些精确字节；钩子不得写入 `release/` 或输出凭据。如果钩子及其已授权工具/凭据报告就绪，必须尝试签名并验证；尝试失败时作业必须失败。否则仅在签名为可选项时继续，并记录 `signingStatus: unsigned` 及其原因。绝不得暴露敏感信息，也不得通过工作流输入接受签名命令。
9. 把最终候选按 `<product>-v<version>-<platform>-<arch>.<ext>` 打包到项目根同级唯一暂存目录，随后生成相邻 SHA-256 和清单。清单必须精确包含 `project`、`version`、`sourceCommit`、`buildRun`、`buildMode`、`platform`、`architecture`、`target`、`host`、`archive`、`sha256`、`tests`、`signingStatus`、`signingReason`、结构化 `signingEvidence` 和 `milestoneAcceptance` 字段，其中必须记录 `milestoneAcceptance: pending`。默认就地钩子必须记录固定钩子验证且不包含独立签名文件；`unsigned` 候选把验证记录为不适用。要求暂存目录文件名集合精确等于这三个普通文件。
10. 重新验证运行器上为空且不是重解析点的 `release/`，在不跟随链接的情况下移除该目录，并把完整的项目根同级暂存目录原子重命名到其位置。重新验证已提交路径和精确文件集，随后上传三个明确的归档/校验和/清单路径，不得上传目录或使用通配符。全部作业成功后，`$desktop-build-rust-release` 下载、验证并合并三个平台结果集，写入调用方项目已经清理的根 `release/`。不得创建标签、Releases、软件包仓库发布或部署。
11. 对工作流运行本地静态/契约检查，并记录未验证的运行器行为。只有存在匹配的 `$desktop-verify-delivery` 证据时，候选才可视为就绪；目录存在和提供方上传均不充分。

## 门禁

- 缺少构建授权、MSRV 设置失败、测试缺失或失败、构建失败、已启动原生作业失败、候选缺失、版本不匹配、条件签名失败、校验和生成失败或结果取回不完整时，必须失败。
- 本工作流不得包含冒烟、E2E、真实宿主交互或 Computer Use 步骤。
- 不得从编译、打包、其他平台、模拟或交叉编译推断原生运行时行为。
- 打包只产生 `pending` 传输候选。此后任何改变字节的签名、公证或重新打包都会产生需要里程碑验收的新候选。

## 完成输出

报告工作流路径、权限/GitHub Action 固定引用、原生矩阵、源码提交/版本、非空测试、release 目录清理、候选/哈希/清单、签名结果、里程碑状态 `pending`、未运行的冒烟/E2E、运行器结果和下一项 `$desktop-verify-delivery` 操作。
