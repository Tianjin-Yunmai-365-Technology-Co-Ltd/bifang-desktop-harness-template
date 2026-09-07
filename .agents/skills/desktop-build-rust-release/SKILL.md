---
name: desktop-build-rust-release
description: 构建下游 Rust CLI 候选；逐次解析 E2E 选择并全量运行非空 workspace 单元测试，再直接在当前宿主本地构建，其他平台按明确需求收集本地结果，将结果写入项目根 release 目录。
---

# 构建 Rust 发布候选

将当前 Rust CLI 候选集构建到一个经过安全刷新的项目根 `release/` 目录中，同时严格区分构建证据和完整验收。

## 工作流程

1. 读取 `Cargo.toml`、`docs/RUST_CLI_TEMPLATE.md`、`docs/AGENT_POLICY.md`、`docs/RELEASE.md`，以及任何已批准的发布渠道或签名配置；只有 E2E、完整验收或发布被独立触发时才读取其相关验证记录。依据 Cargo 元数据和仓库事实确定软件包、二进制文件、版本、目标平台和产物名称。先解析当前构建的 E2E 选择：本次请求已明确 `enabled`/`disabled` 时直接复用，否则在任何测试或编译前询问用户一次；`milestone_e2e` 只作为建议默认值，选择只对本次构建有效且不得静默写回策略。
   若发现目标是 Tauri GUI 安装包，停止本 Skill 并转交 `$desktop-build-tauri-release`；不得用 CLI raw-binary 打包/签名模型处理 DMG、NSIS 或公证。
2. 要求本次构建已由用户显式请求，下游项目根同时是其独立 Git 顶层目录。立即把 `git rev-parse --verify HEAD^{commit}` 的 40 位小写结果锁定为 `buildSourceCommit`，确认 `HEAD` 解析到真实源码提交，并要求 `git status --porcelain=v1 --untracked-files=all` 为空；dirty、无 HEAD 或符号提交歧义都停止。普通构建只报告“请先提交或改用明确发布流程”，绝不得自行调用 `git add`/`git commit`、身份 bootstrap 或提交模板配置。先调用 `$desktop-manage-version check --phase build`，确认根 Cargo 当前版本与 `.harness/version-state.json` 目标一致；构建不得计算、提升版本或重置正式发布周期。随后在任何测试或编译前只读运行 `python3 .agents/skills/desktop-prepare-release/scripts/release_notes.py check --file release-notes.json --expected-version <Cargo-version>`，并计算该普通非符号链接文件的 SHA-256；缺失、不一致、超过近 5 版/每类 10 条或格式无效时停止并要求先执行 `$desktop-prepare-release` 的候选前本地提交与更新日志阶段，本 Skill 绝不得生成或改写更新日志。确认 `Cargo.lock`、`rust-version`、分支、宿主和架构；存在用户要求的活动 Todo 时不得构建尚未完成的范围，但 Work Plan 不是构建前置条件。
3. 将目标目录精确解析为 `<canonical-project-root>/release`。要求根 `.gitignore` 包含精确的根锚定 `/release/` 规则。遇到符号链接/重解析点、非目录、规范化后路径越界或目标等于项目根时必须拒绝。在执行任何单元测试或构建命令前，调用随附的 POSIX 或 PowerShell 辅助程序：helper 在移动旧目录前再次拒绝 dirty/无 HEAD，返回的 `release.source_commit` 必须精确等于 `buildSourceCommit`；随后把已有目录原子移动到同一文件系统中的唯一清理目录，创建并重新验证全新空 `release/`，仅删除已隔离的旧目录树且不得跟随重解析点。绝不得通过活动目标路径枚举并递归删除，也绝不得清理其他路径。
4. 默认直接在当前宿主本地构建，不配置、触发或等待任何 CI/CD，不要求提供方、运行器、Git remote 或远程凭据。当前宿主属于已声明目标时直接进入下列测试与构建，不先尝试远端路线。
5. 只有当前请求明确需要其他原生平台时，才调用 `$desktop-prepare-cross-platform-release` 组织对应宿主的本地构建和用户提供的本地结果目录。当前宿主不匹配目标时停止，或使用已有适配器明确支持的本地交叉编译路线。其他未构建平台标记为 `Unverified`；必需平台缺失、失败、超时或取消必须阻断对应交付，不得用本机成功掩盖，也不得为补齐平台转入 CI/CD。
6. 在发布编译前只强制运行项目全部非空单元测试。初始化后的构建不得因显式构建、缺少/过期环境证据或工具链可能变化而预先调用环境门禁；先用 `cargo test --workspace --all-targets --all-features --locked -- --list` 或等价机器检查运行真实命令并确认发现至少一个测试，再运行 `cargo test --workspace --all-targets --all-features --locked`。选择 CLI 时完整测试必须证明 `--version` 的用户可见输出恰有一个小写 `v` 前缀，机器 JSON 版本保持原始值。测试完成后、实际编译前再次要求工作树 clean 且 `HEAD == buildSourceCommit`；测试或 hook 产生任何变化都停止。若真实测试或本地构建命令失败，只有命令、退出状态与脱敏诊断明确属于 `$desktop-check-development-environment` 管理的环境错误时，才调用该 Skill 并重试原失败命令一次；代码/测试、依赖解析、网络、配置或签名失败直接按原失败处理。不得用相关测试子集、单个 package 或缓存结果替代，也不得在构建名义下自动追加格式、lint、中文注释或其他开发门禁。任一测试失败或测试数为零时必须失败。本地构建使用仓库真实锁定命令；默认模板使用 `cargo build --release --locked --workspace`。必须从 Cargo 配置或 `CARGO_TARGET_DIR` 解析输出根，绝不得根据目录名称猜测。
7. 在打包和计算哈希前，为每个最终原生二进制文件评估签名条件。本地原生路线识别版本化项目钩子 `.release-signing/sign-candidate.sh` 和 `.release-signing/sign-candidate.ps1`；每个钩子接受 `probe`、`sign` 或 `verify`，后接二进制文件路径。`probe` 退出码 `3` 表示不可用；`sign` 就地修改二进制文件；`verify` 验证这些精确字节。钩子不得写入 `release/` 或输出凭据。已批准项目可以记录同样固定的适配器专用命令。只有钩子/命令、必需工具和已授权凭据均可无提示使用，并且目标平台/渠道策略允许该操作时，才视为签名条件存在。条件全部具备时，必须尝试签名并验证生成的签名。签名或验证尝试失败时，该平台构建必须失败；绝不得静默降级为 `unsigned`。条件不存在时，记录 `signingStatus: unsigned` 和精确原因；只有要求签名的渠道或产品才因此受阻。绝不得创建、索取、导出、输出或上传签名凭据。
8. 仅打包最终已签名或明确为 `unsigned` 的二进制文件，并把项目根 `release-notes.json` 以相对路径 `release-notes.json` 原样纳入同一归档；若原产物模型是裸二进制，必须改用包含二进制与更新日志的确定性归档，不能把更新日志作为 `release/` 中第四个旁路文件。每次会改变字节的打包或签名操作完成后，必须计算 SHA-256。在写 manifest 前再次要求工作树 clean 且 `HEAD == buildSourceCommit`。在项目根同级唯一暂存目录中创建归档、相邻校验和及清单；不得把 Cargo 中间产物放入其中。验证暂存目录仅包含清单声明的三个普通文件。单平台构建随后通过不跟随链接的目录级原子替换，把完整目录提交到项目根 `release/`，移动后重新验证最终路径和精确文件集。多平台收集时，当前宿主候选继续保存在目标 `release/` 之外的唯一暂存目录，直到第 9 步完成整个集合的收集；不得提前把它放进随后会刷新的目标目录。每份清单必须精确记录 `project`、机器 `version`、`sourceCommit`（值必须等于 `buildSourceCommit`/当前 `HEAD`）、`buildRun`、`buildMode`、`platform`、`architecture`、`target`、`host`、`archive`、`sha256`、`tests`、`e2eSelection`、带一个小写 `v` 的 `releaseNotesVersion`、`releaseNotesSha256`、`releaseNotesPath: release-notes.json`、`signingStatus`、`signingReason`、结构化 `signingEvidence` 和 `milestoneAcceptance` 字段，其中状态值为 `pending`。对于默认就地钩子，证据记录固定钩子验证是否成功退出，并保持 `detachedFiles` 为空；`unsigned` 结果把验证记录为不适用。
9. 单平台结果由第 8 步完成目录级原子提交。若已明确要求多个原生平台，将第 8 步保留的当前宿主暂存目录与用户提供的其他宿主本地结果目录一起交给 `$desktop-collect-release-artifacts` 验证用户提供的每项已完成本地结果；要求绑定同一明确批准的 40 字符源码提交，再合并无文件名冲突的平台结果集。重新枚举 `release/`，并要求其与全部清单精确相等；拒绝部分、过时、额外、空或冲突文件，不上传或下载远端制品。
10. 在当前 `release/` manifest、其声明的相邻制品证据和最终回复中记录路线选择、清理、全量单元测试命令与数量、产物、大小、哈希、签名结果、源码提交、平台结果、本次 E2E 选择和未验证范围。不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification。编译、签名与打包期间不得启动二进制文件或混跑冒烟/E2E。若本次 E2E 为 `enabled` 或产品/渠道要求，最终字节和清单形成后立即交给 `$desktop-verify-delivery`；若为 `disabled`，只在 manifest 和最终回复记录 `Not run` 与剩余风险并结束构建。

## 边界

- `release/` 是当前构建结果目录，可以包含 `milestoneAcceptance: pending` 候选。目录存在绝不表示候选已验收、已就绪或可发布；全量单元测试通过也不能替代 E2E 或完整验收。
- 构建请求、执行、成功、失败、重试和结果本身不触发任何项目记忆；只有被独立触发的 E2E、完整验收、发布、人工复核或长期审计由对应 Skill 按自身规则留证。
- 本 Skill 不发布、不上传到发布渠道、不创建标签、不更改版本、不改写 `release-notes.json`、不调用 `finalize-release`、不执行公证、不配置签名器，也不声称运行时行为。
- 普通构建永不自动暂存或提交工作树；只有用户明确提出发布时，才由 `$desktop-prepare-release` 先完成受控本地提交，再把 clean HEAD 交给本 Skill。
- 本地原生多平台路线当前仅覆盖 Rust CLI 产物模型。在另行批准统一产物模型前，TUI、MCP 和 GUI 使用各自适配器专用的产物规则。
- Tauri GUI 的 macOS DMG 与 macOS→Windows NSIS 由 `$desktop-build-tauri-release` 处理；本 Skill 不解析 `pnpm`、`cargo-xwin` 或 Apple 公证状态。
- GUI 专用 `$desktop-test-gui-release-performance` 只由 `$desktop-build-tauri-release` 在当次性能选择启用或产品/渠道硬要求时，对原生 Release no-bundle 探针调用；普通 Rust CLI 构建不得触发、伪造或记录 GUI `performanceSelection`/`performanceStatus`/`performanceRuntimeBinding`。
- 改变候选字节的签名必须发生在完整验收前。此后任何改变字节的签名、公证或重新打包都会产生新候选，并且必须返回 `$desktop-verify-delivery`。

## 发布目录辅助程序

在执行任何构建命令前，使用与当前宿主匹配的辅助程序：

```text
# macOS / Linux
bash .agents/skills/desktop-build-rust-release/scripts/prepare-release-directory.sh <project-root>

# Windows PowerShell 5.1+
powershell -NoProfile -File .agents/skills/desktop-build-rust-release/scripts/prepare-release-directory.ps1 -ProjectRoot <project-root>
```
