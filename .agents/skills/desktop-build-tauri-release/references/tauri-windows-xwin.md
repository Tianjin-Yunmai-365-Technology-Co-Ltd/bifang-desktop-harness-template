> 官方资料核对日期：2026-09-04（沿用原参考核对日期；本次仅整理现有合同）

本文件是 [构建 Skill](../SKILL.md) 的条件执行合同；`scripts/` 路径均相对该 Skill 根目录。共享的选择冻结、版本、测试、锁策略、manifest 与原子提交仍按主流程执行。

## macOS→Windows x64

- Tauri 官方把 Linux/macOS 上的 Windows 交叉构建定义为带限制的兜底路线；它只支持 NSIS，WiX/MSI 只能在 Windows 生成。
- macOS 需要 Homebrew 提供 NSIS 与 LLVM/LLD，并把 `$(brew --prefix llvm)/bin` 放入构建 PATH。
- Rust 目标是 `x86_64-pc-windows-msvc`，runner 是 `cargo-xwin`。
- 规范命令为：

```text
pnpm tauri build --bundles nsis --runner cargo-xwin --target x86_64-pc-windows-msvc
```

- 规范输出根是 `target/x86_64-pc-windows-msvc/release/bundle/nsis/`；真实文件名仍从 Tauri 输出/配置发现。
- 交叉生成安装包不证明 Windows 原生运行、安装、SmartScreen 或平台签名通过。

官方来源：

- [Tauri Windows Installer](https://v2.tauri.app/distribute/windows-installer/#build-windows-apps-on-linux-and-macos)
- [cargo-xwin](https://github.com/rust-cross/cargo-xwin)

## 执行候选构建

10. Windows x64 交叉候选只使用 `CI=true pnpm tauri build --bundles nsis --runner cargo-xwin --target x86_64-pc-windows-msvc --config src-tauri/tauri.release.conf.json`。首次尝试使用当前 PATH；只有该命令已经因受管 xwin 环境问题失败并由第 5 步门禁成功恢复时，才把门禁返回的完整 `gate.path.prepend` 原样前置到单次重试命令的 PATH，确保 LLVM、NSIS 与刚安装的 `cargo-xwin` 均可解析。拒绝 `msi` 或 `all`；WiX/MSI 只能在 Windows 原生宿主生成。输出必须来自 Tauri 报告或 Cargo 元数据解析的 `target/x86_64-pc-windows-msvc/release/bundle/nsis/`，不得猜测文件名。还必须从该次 Tauri 输出或 bundle 元数据定位未安装应用资源根的唯一 `release-notes.json`，使用 `node .agents/skills/desktop-build-tauri-release/scripts/verify_release_notes_resource.mjs bytes --source release-notes.json --bundled <discovered-resource>` 与根事实逐字节比较；这只证明交叉构建资源，不能提升 Windows `runtimeVerification`。

11. Windows 交叉安装包只有在项目已有批准的外部非交互签名命令、工具和凭据全部就绪时才尝试签名并验证；开始后失败必须停止。条件不足且渠道允许时记录 `unsigned`。无论编译是否成功，`runtimeVerification` 均为 `Unverified`。
