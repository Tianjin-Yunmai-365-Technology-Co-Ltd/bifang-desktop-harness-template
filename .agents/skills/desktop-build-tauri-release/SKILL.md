---
name: desktop-build-tauri-release
description: 在 macOS 宿主构建下游 Tauri 2 GUI 里程碑候选，包括原生 macOS DMG、通过 cargo-xwin 交叉编译的 Windows x64 NSIS、条件 Developer ID 签名+公证+stapling，以及可审计清单；不运行冒烟/E2E。用于 GUI Todo 全部完成后生成候选、补齐 macOS xwin 环境、定位 Tauri 安装包或诊断签名公证状态时。
---

# 构建 Tauri 发布候选

为 Tauri GUI 生成可追溯安装包；不得把 macOS 交叉构建证据冒充 Windows 原生运行证据。

## 工作流程

1. 读取批准的 GUI 产品/应用资料、活动里程碑 Todo、`docs/AGENT_POLICY.md`、`docs/RELEASE.md`、Tauri 配置、根 Cargo/前端锁文件、验证记录和分发渠道要求。完整读取 [references/tauri-macos-windows.md](references/tauri-macos-windows.md)。
2. 要求 Todo 全部为 `done`，项目根是独立 Git 顶层目录，`HEAD` 是批准的 40 字符源码提交，工作区状态已记录，且真实 `<project-id>_gui`、`pnpm-lock.yaml` 和项目本地 Tauri CLI 存在。不得推断版本、bundle 名称、渠道或发布授权。
3. 在任何格式化、测试或构建命令前，调用本 Skill 随附的 `scripts/prepare-release-directory.sh <project-root>`，安全刷新项目根 `release/`。该 helper 与 `$desktop-build-rust-release` 的 POSIX helper 保持逐字节一致，复用相同的 Git 根、符号链接、原子隔离和同根暂存门禁，但不要求 GUI-only 项目保留 CLI 构建 Skill。
4. 在 macOS 上先调用 `$desktop-check-development-environment` 的常规 GUI 门禁；若目标含 Windows x64，再运行其 `scripts/macos-tauri-xwin-gates.sh --install-missing --target x86_64-pc-windows-msvc`。只消费结构化状态和 `gate.path.prepend`；任一必需门禁失败时停止，不临时拼装安装命令。
5. 运行仓库实际声明的 Rust/前端格式、严格类型、代码规范、workspace-aware Rust 中文注释检查器、前端 TypeScript AST 中文注释门禁、相关非空测试、Vite `dist` 静态扫描和锁定生产构建前检查。测试数为零、锁文件漂移、中文声明注释违规或任一必需检查失败时停止。不得启动安装包、应用或 Windows 二进制。
6. macOS 原生候选必须把 Finder 拖拽安装布局写入真实 DMG，而不是只在 Tauri 配置中声明背景和坐标。交互式 macOS 构建可使用 `CI=true TAURI_BUNDLER_DMG_IGNORE_CI=1 pnpm tauri build --bundles dmg`，但必须为 Finder AppleScript 设置有界超时；Tauri 官方已记录该开关在部分无交互 CI runner 上可能挂起，因此 headless runner 不得盲目启用。无可用 Finder 会话时，只能在签名/公证前使用项目自有、已测试且不含固定产品身份的确定性布局步骤，或者使构建失败；不得接受 `CI=true` 生成但缺少 `.DS_Store` 的空白 Finder 窗口。随后运行 `scripts/probe-macos-notarization.sh`，且只接受以下两条分支：
   - `ready` 且当前任务已授权使用既有签名/公证条件：环境变量三元组模式不传 `--skip-stapling`，让 Tauri 完成 Developer ID 签名、公证、等待和 stapling；随后验证签名、Gatekeeper 评估与 stapled ticket。若探测返回 `notarytool-keychain-profile`，Tauri 先完成 Developer ID 签名与 DMG 打包，随后必须立即使用已授权的 `APPLE_NOTARYTOOL_PROFILE` 调用 `notarytool submit --wait`，只接受 `Accepted`，再对 app/DMG 执行适用的 stapling 与验证；整个阶段结束前不得把仅签名中间态作为候选输出。
   - `unavailable` 且产品/渠道允许 unsigned：使用同一已批准 Finder 布局策略并显式传 `--no-sign`，记录 `unsigned` 与 `not-run` 原因。若渠道要求签名公证则停止。
7. 绝不得输出仅 Developer ID 签名但未公证/staple 的 macOS 候选。探测为 `ready` 后，签名、公证、stapling、验证任一步失败都使该候选失败；不得以 `--no-sign` 重试或静默降级。候选构建中禁止 `--skip-stapling`。
8. Windows x64 交叉候选只使用 `CI=true pnpm tauri build --bundles nsis --runner cargo-xwin --target x86_64-pc-windows-msvc`，并把门禁返回的完整 `gate.path.prepend` 原样前置到该命令的 PATH，确保 LLVM、NSIS 与刚安装的 `cargo-xwin` 均可解析。拒绝 `msi` 或 `all`；WiX/MSI 只能在 Windows 原生宿主生成。输出必须来自 Tauri 报告或 Cargo 元数据解析的 `target/x86_64-pc-windows-msvc/release/bundle/nsis/`，不得猜测文件名。
9. Windows 交叉安装包只有在项目已有批准的外部非交互签名命令、工具和凭据全部就绪时才尝试签名并验证；开始后失败必须停止。条件不足且渠道允许时记录 `unsigned`。无论编译是否成功，`runtimeVerification` 均为 `Unverified`，不能声称 Windows 安装或运行通过。
10. 对 macOS 最终 DMG，在所有会改变字节的布局写入、签名、公证和 stapling 完成后先运行 `scripts/verify-dmg-layout.sh <final-dmg>`；它必须只读挂载最终字节并确认非空 `.DS_Store`、`.background/background.png`、唯一顶层 `.app` 与指向 `/Applications` 的拖拽目标。若挂载要求接受 SLA，必须取得独立人工授权，helper 不得自动接受。检查失败时本次构建失败。随后才对每个最终 DMG/NSIS 计算 SHA-256，在项目根同级唯一暂存目录生成安装包、相邻校验和和 manifest 三件套，验证普通文件精确集合后，以不跟随链接的目录级原子替换提交到 `release/`。
11. manifest 必须记录通用字段及 `interface: gui`、`artifactKind: installer`、`bundleFormat`、`buildMode`、`host`、`platform`、`target`、`runtimeVerification`、签名作用域、`notarizationStatus`、`notarizationReason`、结构化 `notarizationEvidence` 和 `milestoneAcceptance: pending`。macOS 完整路径只在 ticket 验证成功时使用 `notarized-and-stapled`；Windows 使用 `not-applicable`。
12. 重新枚举 `release/`，要求文件集与所有 manifests 精确相等；记录环境变化、命令、测试数量、安装包、大小、摘要、签名/公证证据、源码提交、交叉构建限制和未验证平台。把精确最终字节交给 `$desktop-verify-delivery`，不得在本 Skill 中运行冒烟/E2E。

## 边界

- 当前受测路线只覆盖 macOS 原生 DMG 与 macOS→Windows x64 NSIS。Linux GUI、Windows MSI、Windows 原生运行/安装和其他架构保持 `Unverified`。
- 不自动安装 Homebrew，不创建、索取、导出、显示或上传签名/公证凭据，也不修改项目签名身份。
- 不创建标签、Releases、商店提交、更新器发布或正式发布；构建授权不等于发布授权。
- stapling 与最终只读 Finder 布局检查均通过后的字节才是候选。此后任何布局补写、签名、公证、stapling 或重打包都会产生新候选并返回 `$desktop-verify-delivery`。

## 完成输出

报告批准提交、bundle/target、环境安装与复探、真实命令、测试、候选/哈希/manifest、签名公证状态、`runtimeVerification`、`milestoneAcceptance: pending`、未运行的冒烟/E2E 和剩余风险。
