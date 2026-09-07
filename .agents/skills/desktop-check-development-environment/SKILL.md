---
name: desktop-check-development-environment
description: 仅在中性初始化阶段，或初始化后真实测试/构建命令已因受管环境问题失败时检查并安装缺失工具、升级低于最低门槛的工具；不得按任务、会话、显式构建或环境证据状态例行执行。
---

# 检查开发环境

在初始化或观察到真实环境错误后建立、恢复开发工具链：缺失时安装，已确认低于最低下界时按当前宿主的受管路线升级，不依赖生成下游项目后会被删除的初始化 Skills。

## 工作流程

1. 读取 `AGENTS.md`、Agent Policy、`docs/RUST_CLI_TEMPLATE.md` 和已选接口记录；只在发布、完整验收、长期审计或用户明确要求持久证据时读取适用 Verification。既有环境证据可以提供诊断上下文，但其缺失、过期或指纹变化绝不是调用本 Skill 的触发器。
2. 只接受两类触发：由中性 `$desktop-initialize-rust-project` 在写入脚手架前主动调用；或初始化完成后，本次真实测试/构建命令已经失败，且保存的命令、退出状态和脱敏诊断明确指向门禁管理的工具链、目标或系统依赖缺失/不兼容。不得仅因首次修改代码、新任务、新会话、显式构建、缺少环境证据或工具链版本可能变化而增加探测。
3. 非初始化触发必须先排除代码编译错误、测试断言失败、普通依赖解析/网络失败、产品配置错误、凭据/签名失败和其他非环境原因。确认属于受管环境错误后，读取 [references/development-environment-gates.md](references/development-environment-gates.md)，选择与失败命令对应的常规或 xwin 门禁；不得为了“顺便检查”运行无关门禁。
4. 常规门禁在 macOS/Linux 上运行 `scripts/development-environment-gates.sh --install-missing --interfaces <comma-separated-selection>`，在 Windows 上运行 `scripts/development-environment-gates.ps1 -Interfaces <selection>`。`--install-missing` 是保留的兼容入口名：写入模式同时安装缺失适用项、升级可证明低于最低下界的适用项；`--check-only` / `-CheckOnly` 保持零写入，并将后者报告为 `upgrade-required`。初始化阶段允许完整检查已选接口；错误恢复阶段只因已观察到的常规工具链错误进入该门禁。
5. Git 与 Rust 始终是常规阻断门禁；初始化在任何脚手架写入前先完成 Git 可用性检查。Git 要求稳定版 `>=2.0.0`，Rust 要求当前 MSRV 或更高稳定版；范围内工具原样复用，缺失时安装，已确认低于下界时升级并将变化报告为 `upgraded`。Git 在 macOS/Linux 只使用既有受支持系统包管理器，Windows 只使用既有 `winget` 的 `Git.Git`；Rust 只使用门禁编码的已验证官方 rustup 来源。门禁不安装新的包管理器，也不得降低项目门槛、回退依赖、注入 shim 或寻找替代工具链来迁就旧环境。Windows 上 Rust 目标所需的 MSVC C++ 工作负载同样是阻断门禁。预发布、无法解析或损坏的现有工具不属于“可证明低于下界”，必须失败关闭。
6. 仅当已记录的接口选择包含 `GUI` 时，Node.js 和 pnpm 才是常规阻断门禁。Node.js 必须满足 `^24.15.0 || >=26.0.0`，pnpm 必须满足 `>=11.24.0`；现有范围内稳定版本继续使用。Node.js 低于 24.15.0 时升级；25.x 被视为低于下一段允许下界 26.0.0，同样升级；pnpm 低于 11.24.0 时升级。缺失或需升级的 Node.js 从官方倒序索引选择第一个满足门禁的当前稳定版，pnpm 以 `pnpm@>=11.24.0` 让 npm 解析当前稳定版；均不得改用更旧“兼容版”、固定追逐某个 major、使用 `latest` tag 或选择预发布版。对于不含 GUI 的项目，必须把两者都报告为 `not-required`，并且不得探测、安装、升级或添加它们。
7. 初始化完成后，只有失败命令本身属于 macOS 上已批准的 Windows x64 NSIS 交叉构建，且诊断指向该路径的受管工具时，才运行 `scripts/macos-tauri-xwin-gates.sh --install-missing`。该门禁检查并按需安装缺失的 LLVM/LLD、NSIS、`x86_64-pc-windows-msvc` Rust target 与 cargo-xwin，或升级低于 0.23.1 的可解析稳定 cargo-xwin；其允许范围固定为 `>=0.23.1, <0.24.0`。普通 GUI 开发、尚未失败的构建或仅缺少 xwin 环境证据不得触发这些发布专用安装或升级。
8. xwin 门禁只能使用既有 Homebrew、rustup、Cargo 和 pnpm。它不自动安装 Homebrew；既有 `cargo-xwin` 必须为满足 `>=0.23.1, <0.24.0` 的稳定版本，低于 0.23.1 的可解析稳定版在写入模式下升级并复探；`>=0.24.0`、预发布、无法解析或残缺工具仍失败关闭，不得通过降级、shim 或其他兼容方案继续。门禁不接受非 macOS 宿主或其他 Windows target，安装或升级后必须逐项复探，并把 `gate.path.prepend` 仅用于重试当前失败的 Tauri 构建命令。
9. 门禁成功后只重试原失败命令一次；重试成功才继续原任务，重试仍失败则保留两个结果并停止。错误不在门禁支持范围内时报告精确阻断，不得临时拼装安装/升级命令或把非环境失败改判为环境问题。
10. 把触发类型、原失败命令/退出状态的脱敏摘要、已选接口、宿主、`gate.git.*` 在内的观测版本、`missing` / `upgrade-required` 判定、`installed` / `upgraded` 变更、复探、单次重试结果和未验证平台返回当前任务输出；只有发布、完整验收、长期审计或用户明确要求持久环境证据时才按 `docs/VERIFICATION.md` 写入日期证据卷。由中性 `$desktop-initialize-rust-project` 调用时同样只返回结构化结果。不得为普通开发预建 Verification，也不得记录不必要的用户主目录路径或敏感信息。
11. 必需门禁受阻时必须停止开发/构建任务。门禁成功只授权单次重试，不构成构建、测试、产物、验收或人工复核证据。

## 持久不变量

- 本 Skill 及其脚本在下游初始化后必须保留。
- 即使 `$desktop-instantiate-project` 和 `$desktop-initialize-rust-project` 已被删除，`AGENTS.md` 仍必须在真实测试/构建命令已因受管环境错误失败时路由到本 Skill，并禁止基于构建类型或证据状态预先调用。
- 环境结果与当前宿主及已选接口指纹绑定；不得把该结果推断到未经检查的 Windows、macOS 或 Linux 宿主。
- xwin 发布能力结果还与 `x86_64-pc-windows-msvc` 目标绑定，且只证明交叉工具可用，不证明 Windows 运行时。

## 完成输出

报告触发类型、原失败命令与退出状态的脱敏摘要（初始化时为 `not-applicable`）、已选接口/发布能力、目标、Git/Rust 等必需和 `not-required` 工具、观测版本、`upgrade-required`、自动安装/升级、复探与单次重试结果、阻断失败，以及未验证平台。初始化调用方必须保留 `gate.git.status/version/change` 并在初始化完成报告中复述 Git 结果。
