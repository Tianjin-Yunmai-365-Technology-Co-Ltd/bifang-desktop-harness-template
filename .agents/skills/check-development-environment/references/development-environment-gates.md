# 开发环境门禁

在生成的下游项目首次修改代码的任务前使用本参考。它独立于初始化流程，并且在仅用于初始化的 Skills 和文档被删除后继续保留。

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
| Node.js | 已选择 `GUI` | `node --version` | 从官方提供且已验证校验和的宿主归档安装受支持的 Node.js LTS，然后重新探测。 |
| pnpm | 已选择 `GUI` | `pnpm --version` | 使用 Node.js 的 npm 客户端，从官方 npm 软件包仓库把稳定版 `pnpm@latest` 安装到用户级前缀目录，然后重新探测。 |
| LLVM/LLD | macOS Tauri→Windows x64 | `llvm-rc`、`lld-link` | 使用既有 Homebrew 安装 `llvm`，把 formula 的 `bin` 目录加入当前构建 PATH，然后复探。 |
| NSIS | macOS Tauri→Windows x64 | `makensis` | 使用既有 Homebrew 安装 `nsis`，然后复探；macOS 不支持生成 WiX/MSI。 |
| Windows Rust target | macOS Tauri→Windows x64 | `rustup target list --installed` | 运行 `rustup target add x86_64-pc-windows-msvc` 并复探。 |
| cargo-xwin | macOS Tauri→Windows x64 | `cargo-xwin --version` | 运行 `cargo install --locked cargo-xwin` 并复探。 |

低于 MSRV 或使用预发布通道的现有 Rust 工具链属于不兼容，而不是缺失。必须停止，绝不得静默替换。现有 Node.js 或 pnpm 版本也必须满足真实前端计划；仅检测到工具存在只代表通过首次开发环境门禁的第一步。

## 安装安全措施

- Rust 使用来自 `https://static.rust-lang.org/rustup/dist`、与架构/libc 匹配的 `rustup-init`，验证相邻的 SHA-256 文件，安装最小稳定版配置档，然后重新探测。
- Node.js 使用来自 `https://nodejs.org/dist` 的受支持 LTS 归档，验证 `SHASUMS256.txt`，安装到用户级目录，然后重新探测。
- pnpm 仅在 GUI 项目中通过 Node.js 附带的 npm 客户端安装。npm 必须验证软件包仓库完整性元数据；门禁绝不得执行下载的文本、禁用 TLS 或选择预发布版 pnpm。
- Windows MSVC 使用 `https://aka.ms/vs/17/release/vs_BuildTools.exe`，要求有效的 Microsoft Authenticode 签名，安装 `Microsoft.VisualStudio.Workload.VCTools`，然后重新探测。
- Tauri xwin 只在 macOS、GUI 已选且 Windows x64 NSIS 已批准时触发。LLVM/NSIS 使用既有 Homebrew，Rust target 使用 rustup，`cargo-xwin` 使用 Cargo 的 `--locked` 安装；缺少 Homebrew 时阻断并报告，不执行远程 shell 安装器。
- 不得静默升级现有工具。安装程序、校验和、签名、提权、重启、策略、链接器、软件包仓库完整性或安装后探测发生失败时，必须阻断开发。

## 证据记录

记录宿主、已选接口/发布目标、工具需求状态、探测命令、观测版本或 `Missing`、安装来源和变更、安装后探测、最终结果，并将其他平台标记为 `Unverified`。xwin 成功仍把 Windows runtime 记为 `Unverified`。遮盖令牌和不必要的用户主目录路径。该证据不得替代项目构建、测试、产物、冒烟、E2E 或人工复核证据。
