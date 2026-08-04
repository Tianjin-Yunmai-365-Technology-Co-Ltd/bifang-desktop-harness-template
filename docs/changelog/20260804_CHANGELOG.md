# 2026-08-04 变更记录

## 新增

- 新增 `$build-tauri-release`：在 macOS 构建原生 Tauri DMG，并通过 `cargo-xwin` 与 NSIS 交叉构建 Windows x64 安装包；Windows 运行状态保持 `Unverified`，不生成 MSI。
- 新增按目标触发的 macOS xwin 环境门禁，在既有 Homebrew、Rust、Cargo 与 pnpm 条件下补齐 LLVM/LLD、NSIS、Windows Rust target 和 `cargo-xwin`，安装后逐项复探。
- 新增 macOS Developer ID 公证条件探测；条件齐全时签名、公证和 stapling 作为一个不可拆分阶段执行，条件不足且渠道允许时显式生成 unsigned 候选，禁止只签名中间态。

## 修复

- Harness 校验器现在把 Git 在 Windows 工作树中产生的 CRLF workflow 签出规范化为受审 LF 内容后再计算 SHA-256，避免把安全的行尾转换误判为模板篡改。
- Windows 上校验 Unix 环境门禁脚本时改读 Git 索引中的 `100755` 模式；macOS/Linux 仍检查真实文件系统执行位，跨平台来源门禁不再因 Windows 无法表示 POSIX 执行位而误报失败。

## 验证

- 新增 15 条隔离回归，覆盖 xwin 已有/缺失环境、安装复探、check-only、Homebrew/安装/宿主/target 失败，以及 Apple API/Apple ID、公证凭据缺失或歧义、私钥符号链接、Developer ID 身份和 `notarytool` 门禁。
- Harness 发布 validator 新增 xwin 精确命令、完整 PATH 前缀、NSIS/MSI 边界、签名公证一体化、最终字节摘要和 GUI-only release helper 独立性门禁，并增加两条负向 Skill 退化测试。
- 新增两条跨平台签出回归，覆盖 CRLF workflow 成功路径、Git 可执行位成功路径和普通非可执行文件失败路径。
- 完整 Harness 校验器、21 个 Skill 结构检查和 143 条 Python 回归均完成；140 条通过，3 条 Windows PowerShell 原生用例因当前 macOS 没有 `pwsh` 按既有规则跳过。
- 未运行真实 Tauri DMG/NSIS 构建、Windows 原生安装/运行、Developer ID 签名、公证、stapling、冒烟、E2E 或发布验收；这些范围继续明确为 `Unverified`。
