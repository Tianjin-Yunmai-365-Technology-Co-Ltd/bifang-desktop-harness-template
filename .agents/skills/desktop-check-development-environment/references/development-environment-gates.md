# 开发环境门禁

只在中性初始化主动门禁，或初始化后真实测试/构建命令已经因受管环境问题失败时使用本参考。它独立于初始化流程，并且在仅用于初始化的 Skills 和文档被删除后继续保留；显式构建、缺少环境证据、新任务或新会话本身都不得触发它。

## 触发与恢复闭环

- 初始化阶段在写入脚手架前对已选接口运行一次常规门禁，允许安装缺失的适用工具。
- 初始化完成后先运行真实测试或构建命令。只有保存的命令、退出状态与脱敏诊断明确指向本参考管理的工具链、目标或系统依赖时，才选择对应门禁；代码错误、测试断言、普通依赖解析/网络、产品配置、凭据或签名失败不适用。
- 门禁成功后只重试原失败命令一次。重试仍失败时停止并同时报告原错误与恢复结果，不循环安装、不扩大到无关门禁。
- macOS→Windows x64 专用门禁只在实际失败命令就是已批准的 xwin 构建且错误属于该工具集合时运行；不得仅因选择了该目标或缺少历史证据提前安装。

## 可执行入口

- macOS/Linux：`scripts/development-environment-gates.sh --install-missing --interfaces <comma-separated-selection>`。
- Windows PowerShell 5.1 或更高版本：`scripts/development-environment-gates.ps1 -Interfaces <selection>`。
- 仅在只读审计时使用 `--check-only` 或 `-CheckOnly`。退出码 `20` 表示至少缺少一个必需工具。
- 解析稳定的 `gate.<environment>.<field>=<value>` 行。Rust 始终为必需项。Windows 还必须具备 MSVC Build Tools。仅当选择包含 `GUI` 时才需要 Node.js 和 pnpm；否则两者都必须为 `not-required`。
- macOS Tauri Windows x64 候选在常规 GUI 门禁成功后，额外运行 `scripts/macos-tauri-xwin-gates.sh --install-missing --target x86_64-pc-windows-msvc`。只读审计使用 `--check-only`；退出码 `20` 表示缺失，`30` 表示非 macOS。

## 探测矩阵

| 环境 | 适用条件 | 探测命令 | 缺失时行为 |
|---|---|---|---|
| Rust | 始终 | `rustup --version`、`rustc --version`、`cargo --version`、`rustc -vV` | 从已验证的官方 rustup 制品安装稳定版 Rust，然后重复全部探测。 |
| MSVC Build Tools | Windows Rust 目标 | `cl`，随后使用 `vswhere` 查找 VC 工具组件 | 安装 Microsoft 已签名的 Visual Studio Build Tools C++ 工作负载，然后重新探测。 |
| Node.js | 已选择 `GUI` | `node --version` | 要求 `^20.19.0 || >=22.12.0`；缺失时从官方提供且已验证校验和的宿主归档安装范围内受支持的 Node.js LTS，然后重新探测。 |
| pnpm | 已选择 `GUI` | `pnpm --version` | 要求 `>=10.0.0`；缺失时使用 Node.js 的 npm 客户端，从官方 npm 软件包仓库把兼容范围 `pnpm@^10.0.0` 安装到用户级前缀目录，然后重新探测。 |
| LLVM/LLD | macOS Tauri→Windows x64 | `llvm-rc`、`lld-link` | 使用既有 Homebrew 分别安装 `llvm` 与 `lld`，把两个 formula 的 `bin` 目录加入当前构建 PATH，然后复探；兼容 Homebrew 将 LLD 从 LLVM 拆包。 |
| NSIS | macOS Tauri→Windows x64 | `makensis` | 使用既有 Homebrew 安装 `nsis`，然后复探；macOS 不支持生成 WiX/MSI。 |
| Windows Rust target | macOS Tauri→Windows x64 | `rustup target list --installed` | 运行 `rustup target add x86_64-pc-windows-msvc` 并复探。 |
| cargo-xwin | macOS Tauri→Windows x64 | `cargo-xwin --version` | 要求稳定版 `>=0.22.0, <0.24.0`；缺失时运行 `cargo install --locked --version '>=0.22.0, <0.24.0' cargo-xwin` 并复探。 |

低于 MSRV 或使用预发布通道的现有 Rust 工具链属于不兼容，而不是缺失。必须停止，绝不得静默替换。现有 Node.js 必须落入 `^20.19.0 || >=22.12.0`（21.x 和 22.12.0 以下不兼容），pnpm 必须为 10.0.0 及以上稳定版，`cargo-xwin` 必须为 `>=0.22.0, <0.24.0` 范围内的稳定版；仅检测到工具存在不证明版本兼容，更不证明单元测试或构建已经通过。

## 安装安全措施

- Rust 使用来自 `https://static.rust-lang.org/rustup/dist`、与架构/libc 匹配的 `rustup-init`，验证相邻的 SHA-256 文件，安装最小稳定版配置档，然后重新探测。
- Node.js 使用来自 `https://nodejs.org/dist` 的受支持 LTS 归档，验证 `SHASUMS256.txt`，安装到用户级目录，然后重新探测。
- pnpm 仅在 GUI 项目中通过 Node.js 附带的 npm 客户端安装 `pnpm@^10.0.0`。npm 必须验证软件包仓库完整性元数据；门禁绝不得执行下载的文本、禁用 TLS、使用 `latest` 或选择预发布版 pnpm。
- Windows MSVC 使用 `https://aka.ms/vs/17/release/vs_BuildTools.exe`，要求有效的 Microsoft Authenticode 签名，安装 `Microsoft.VisualStudio.Workload.VCTools`，然后重新探测。
- Tauri xwin 只在 macOS、GUI 已选且 Windows x64 NSIS 已批准时触发。LLVM、LLD 与 NSIS 使用既有 Homebrew，但只作为宿主能力探测，不把 formula 当前解析版本写成项目兼容契约；Rust target 使用 rustup，`cargo-xwin` 使用 Cargo 的 `--locked --version '>=0.22.0, <0.24.0'` 安装。缺少 Homebrew 时阻断并报告，不执行远程 shell 安装器。已存在但缺失必需命令的 formula 或范围外 `cargo-xwin` 视为损坏或不兼容，必须阻断，不得静默升级、替换或重装。
- 不得静默升级现有工具。安装程序、校验和、签名、提权、重启、策略、链接器、软件包仓库完整性或安装后探测发生失败时，必须阻断开发。

## 证据记录

记录宿主、已选接口/发布目标、工具需求状态、探测命令、观测版本或 `Missing`、安装来源和变更、安装后探测、最终结果，并将其他平台标记为 `Unverified`。xwin 成功仍把 Windows runtime 记为 `Unverified`。遮盖令牌和不必要的用户主目录路径。该证据不得替代项目构建、测试、产物、冒烟、E2E 或人工复核证据。
