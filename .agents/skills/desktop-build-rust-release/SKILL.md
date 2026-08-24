---
name: desktop-build-rust-release
description: 构建下游 Rust CLI 候选；逐次解析 E2E 选择并全量运行非空 workspace 单元测试，再采用 Windows、macOS、Linux 原生路线或受限当前宿主回退，将结果写入项目根 release 目录。
---

# 构建 Rust 发布候选

将当前 Rust CLI 候选集构建到一个经过安全刷新的项目根 `release/` 目录中，同时严格区分构建证据和完整验收。

## 工作流程

1. 读取 `Cargo.toml`、`docs/RUST_CLI_TEMPLATE.md`、`docs/AGENT_POLICY.md`、`docs/RELEASE.md`，以及任何已批准的发布渠道或签名配置；只有 E2E、完整验收或发布被独立触发时才读取其相关验证记录。依据 Cargo 元数据和仓库事实确定软件包、二进制文件、版本、目标平台和产物名称。先解析当前构建的 E2E 选择：本次请求已明确 `enabled`/`disabled` 时直接复用，否则在任何测试或编译前询问用户一次；`milestone_e2e` 只作为建议默认值，选择只对本次构建有效且不得静默写回策略。
   若发现目标是 Tauri GUI 安装包，停止本 Skill 并转交 `$desktop-build-tauri-release`；不得用 CLI raw-binary 打包/签名模型处理 DMG、NSIS 或公证。
2. 要求本次构建已由用户显式请求，下游项目根同时是其独立 Git 顶层目录，并要求 `HEAD` 解析到真实源码提交。确认 `Cargo.lock`、`rust-version`、分支、未提交修改状态、宿主和架构；存在用户要求的活动 Todo 时不得构建尚未完成的范围，但 Work Plan 不是构建前置条件。
3. 将目标目录精确解析为 `<canonical-project-root>/release`。要求根 `.gitignore` 包含精确的根锚定 `/release/` 规则。遇到符号链接/重解析点、非目录、规范化后路径越界或目标等于项目根时必须拒绝。在执行任何单元测试或构建命令前，调用随附的 POSIX 或 PowerShell 辅助程序：把已有目录原子移动到同一文件系统中的唯一清理目录，创建并重新验证全新空 `release/`，随后仅删除已隔离的旧目录树且不得跟随重解析点。绝不得通过活动目标路径枚举并递归删除，也绝不得清理其他路径。
4. 默认通过 `$desktop-prepare-cross-platform-release` 构建 Windows、macOS 和 Linux 原生候选。只有仓库具有已复核的原生自动化、已配置的提供方和权限可用、三类原生运行器均可用，并且调用方能够取回已完成结果时，跨平台预检才算成功。调用本 Skill 只授权通过该既有配置路径构造候选，不授权发布。
5. 仅当跨平台预检在任何远端矩阵启动前证明上述编排前置条件不可用时，才回退当前宿主。记录精确回退原因，并将其他所有平台标记为 `Unverified`。不得把已启动矩阵的失败、测试失败、打包失败、签名失败、超时或取消视为回退条件；必须保留失败并拒绝多平台构建结果。不得把失败矩阵中的成功作业合并到调用方项目根 `release/`；目录完成初始清理后必须保持为空，并且只能从提供方构建日志或结果引用其部分证据。
6. 在发布编译前只强制运行项目全部非空单元测试。初始化后的构建不得因显式构建、缺少/过期环境证据或工具链可能变化而预先调用环境门禁；先用 `cargo test --workspace --all-targets --all-features --locked -- --list` 或等价机器检查运行真实命令并确认发现至少一个测试，再运行 `cargo test --workspace --all-targets --all-features --locked`。若真实测试或回退本地构建命令失败，只有命令、退出状态与脱敏诊断明确属于 `$desktop-check-development-environment` 管理的环境错误时，才调用该 Skill 并重试原失败命令一次；代码/测试、依赖解析、网络、配置或签名失败直接按原失败处理。不得用相关测试子集、单个 package 或缓存结果替代，也不得在构建名义下自动追加格式、lint、中文注释或其他开发门禁。任一测试失败或测试数为零时必须失败。回退本地构建使用仓库真实锁定命令；默认模板使用 `cargo build --release --locked --workspace`。必须从 Cargo 配置或 `CARGO_TARGET_DIR` 解析输出根，绝不得根据目录名称猜测。
7. 在打包和计算哈希前，为每个最终原生二进制文件评估签名条件。默认矩阵识别版本化项目钩子 `.release-signing/sign-candidate.sh` 和 `.release-signing/sign-candidate.ps1`；每个钩子接受 `probe`、`sign` 或 `verify`，后接二进制文件路径。`probe` 退出码 `3` 表示不可用；`sign` 就地修改二进制文件；`verify` 验证这些精确字节。钩子不得写入 `release/` 或输出凭据。已批准项目可以记录同样固定的适配器专用命令。只有钩子/命令、必需工具和已授权凭据均可无提示使用，并且目标平台/渠道策略允许该操作时，才视为签名条件存在。条件全部具备时，必须尝试签名并验证生成的签名。签名或验证尝试失败时，该平台构建必须失败；绝不得静默降级为 `unsigned`。条件不存在时，记录 `signingStatus: unsigned` 和精确原因；只有要求签名的渠道或产品才因此受阻。绝不得创建、索取、导出、输出或上传签名凭据。
8. 仅打包最终已签名或明确为 `unsigned` 的二进制文件。每次会改变字节的打包或签名操作完成后，必须计算 SHA-256。在项目根同级唯一暂存目录中创建归档或声明的二进制文件、相邻校验和及清单；不得把 Cargo 中间产物放入其中。验证暂存目录仅包含清单声明的普通文件，随后通过不跟随链接的目录级原子替换，把完整目录提交到项目根 `release/`。移动后重新验证最终路径和精确文件集。每份清单必须精确记录 `project`、`version`、`sourceCommit`、`buildRun`、`buildMode`、`platform`、`architecture`、`target`、`host`、`archive`、`sha256`、`tests`、`e2eSelection`、`signingStatus`、`signingReason`、结构化 `signingEvidence` 和 `milestoneAcceptance` 字段，其中状态值为 `pending`。对于默认就地钩子，证据记录固定钩子验证是否成功退出，并保持 `detachedFiles` 为空；`unsigned` 结果把验证记录为不适用。
9. 原生矩阵成功时，通过 `$desktop-collect-release-artifacts` 取回并验证每项已完成的提供方产物，把三个无文件名冲突的平台结果集合并到已经刷新的本地项目根 `release/`。提供方检出必须固定到明确批准的 40 字符源码提交，并且每个运行器在执行仓库自有签名钩子前都必须验证 `HEAD`。回退当前宿主时，在 `release/` 旁暂存完整声明结果集，并使用相同的目录级原子提交。重新枚举 `release/`，并要求其与全部清单精确相等；拒绝部分、过时、额外、空或冲突文件。
10. 在当前 `release/` manifest、其声明的相邻制品证据和最终回复中记录路线选择、清理、全量单元测试命令与数量、产物、大小、哈希、签名结果、源码提交、平台结果、本次 E2E 选择和未验证范围。不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification。编译、签名与打包期间不得启动二进制文件或混跑冒烟/E2E。若本次 E2E 为 `enabled` 或产品/渠道要求，最终字节和清单形成后立即交给 `$desktop-verify-delivery`；若为 `disabled`，只在 manifest 和最终回复记录 `Not run` 与剩余风险并结束构建。

## 边界

- `release/` 是当前构建结果目录，可以包含 `milestoneAcceptance: pending` 候选。目录存在绝不表示候选已验收、已就绪或可发布；全量单元测试通过也不能替代 E2E 或完整验收。
- 构建请求、执行、成功、失败、重试和结果本身不触发任何项目记忆；只有被独立触发的 E2E、完整验收、发布、人工复核或长期审计由对应 Skill 按自身规则留证。
- 本 Skill 不发布、不上传到发布渠道、不创建标签、不更改版本、不执行公证、不配置签名器，也不声称运行时行为。
- 默认三平台路线当前仅覆盖 Rust CLI 产物模型。在另行批准统一矩阵前，TUI、MCP 和 GUI 使用各自适配器专用的产物规则。
- Tauri GUI 的 macOS DMG 与 macOS→Windows NSIS 由 `$desktop-build-tauri-release` 处理；本 Skill 不解析 `pnpm`、`cargo-xwin` 或 Apple 公证状态。
- 改变候选字节的签名必须发生在完整验收前。此后任何改变字节的签名、公证或重新打包都会产生新候选，并且必须返回 `$desktop-verify-delivery`。

## 发布目录辅助程序

在执行任何构建命令前，使用与当前宿主匹配的辅助程序：

```text
# macOS / Linux
bash .agents/skills/desktop-build-rust-release/scripts/prepare-release-directory.sh <project-root>

# Windows PowerShell 5.1+
powershell -NoProfile -File .agents/skills/desktop-build-rust-release/scripts/prepare-release-directory.ps1 -ProjectRoot <project-root>
```
