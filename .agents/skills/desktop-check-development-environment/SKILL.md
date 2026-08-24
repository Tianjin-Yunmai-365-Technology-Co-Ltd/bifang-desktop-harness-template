---
name: desktop-check-development-environment
description: 仅在中性初始化阶段，或初始化后真实测试/构建命令已因受管环境问题失败时检查并安装对应工具；不得按任务、会话、显式构建或环境证据状态例行执行。
---

# 检查开发环境

在初始化或观察到真实环境错误后建立、恢复开发工具链，不依赖生成下游项目后会被删除的初始化 Skills。

## 工作流程

1. 读取 `AGENTS.md`、Agent Policy、`docs/RUST_CLI_TEMPLATE.md` 和已选接口记录；只在发布、完整验收、长期审计或用户明确要求持久证据时读取适用 Verification。既有环境证据可以提供诊断上下文，但其缺失、过期或指纹变化绝不是调用本 Skill 的触发器。
2. 只接受两类触发：由中性 `$desktop-initialize-rust-project` 在写入脚手架前主动调用；或初始化完成后，本次真实测试/构建命令已经失败，且保存的命令、退出状态和脱敏诊断明确指向门禁管理的工具链、目标或系统依赖缺失/不兼容。不得仅因首次修改代码、新任务、新会话、显式构建、缺少环境证据或工具链版本可能变化而增加探测。
3. 非初始化触发必须先排除代码编译错误、测试断言失败、普通依赖解析/网络失败、产品配置错误、凭据/签名失败和其他非环境原因。确认属于受管环境错误后，读取 [references/development-environment-gates.md](references/development-environment-gates.md)，选择与失败命令对应的常规或 xwin 门禁；不得为了“顺便检查”运行无关门禁。
4. 常规门禁在 macOS/Linux 上运行 `scripts/development-environment-gates.sh --install-missing --interfaces <comma-separated-selection>`，在 Windows 上运行 `scripts/development-environment-gates.ps1 -Interfaces <selection>`。初始化阶段允许完整检查已选接口；错误恢复阶段只因已观察到的常规工具链错误进入该门禁，脚本只安装探测为缺失的适用项。
5. Rust 始终是常规阻断门禁。在 Windows 上，Rust 目标所需的 MSVC C++ 工作负载同样是阻断门禁。缺失的前置项必须从门禁编码的已验证官方来源安装，然后重新探测；绝不得静默替换现有的不兼容工具链。
6. 仅当已记录的接口选择包含 `GUI` 时，Node.js 和 pnpm 才是常规阻断门禁。对于不含 GUI 的项目，必须把两者都报告为 `not-required`，并且不得探测、安装、升级或添加它们。
7. 初始化完成后，只有失败命令本身属于 macOS 上已批准的 Windows x64 NSIS 交叉构建，且诊断指向该路径的受管工具时，才运行 `scripts/macos-tauri-xwin-gates.sh --install-missing`。该门禁检查并按需安装 LLVM/LLD、NSIS、`x86_64-pc-windows-msvc` Rust target 与 `cargo-xwin`；普通 GUI 开发、尚未失败的构建或仅缺少 xwin 环境证据不得触发这些发布专用安装。
8. xwin 门禁只能使用既有 Homebrew、rustup、Cargo 和 pnpm。它不自动安装 Homebrew，不静默升级已有不兼容/残缺工具，不接受非 macOS 宿主或其他 Windows target；安装后必须逐项复探，并把 `gate.path.prepend` 仅用于重试当前失败的 Tauri 构建命令。
9. 门禁成功后只重试原失败命令一次；重试成功才继续原任务，重试仍失败则保留两个结果并停止。错误不在门禁支持范围内时报告精确阻断，不得临时拼装安装命令或把非环境失败改判为环境问题。
10. 把触发类型、原失败命令/退出状态的脱敏摘要、已选接口、宿主、观测版本、安装变更、复探、单次重试结果和未验证平台返回当前任务输出；只有发布、完整验收、长期审计或用户明确要求持久环境证据时才按 `docs/VERIFICATION.md` 写入日期证据卷。由中性 `$desktop-initialize-rust-project` 调用时同样只返回结构化结果。不得为普通开发预建 Verification，也不得记录不必要的用户主目录路径或敏感信息。
11. 必需门禁受阻时必须停止开发/构建任务。门禁成功只授权单次重试，不构成构建、测试、产物、验收或人工复核证据。

## 持久不变量

- 本 Skill 及其脚本在下游初始化后必须保留。
- 即使 `$desktop-instantiate-project` 和 `$desktop-initialize-rust-project` 已被删除，`AGENTS.md` 仍必须在真实测试/构建命令已因受管环境错误失败时路由到本 Skill，并禁止基于构建类型或证据状态预先调用。
- 环境结果与当前宿主及已选接口指纹绑定；不得把该结果推断到未经检查的 Windows、macOS 或 Linux 宿主。
- xwin 发布能力结果还与 `x86_64-pc-windows-msvc` 目标绑定，且只证明交叉工具可用，不证明 Windows 运行时。

## 完成输出

报告触发类型、原失败命令与退出状态的脱敏摘要（初始化时为 `not-applicable`）、已选接口/发布能力、目标、必需和 `not-required` 工具、观测版本、自动安装、复探与单次重试结果、阻断失败，以及未验证平台。
