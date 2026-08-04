# Tauri macOS 与 Windows 候选参考

> 官方资料核对日期：2026-08-04

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

## macOS Developer ID 直接分发

- Tauri 要求在 Apple 设备上使用有效 Developer ID Application 身份；免费开发者账号不能完成可分发公证。
- 公证凭据只能选择一组完整方式：
  - App Store Connect API：`APPLE_API_ISSUER`、`APPLE_API_KEY`、`APPLE_API_KEY_PATH`；
  - Apple ID：`APPLE_ID`、`APPLE_PASSWORD`（app-specific password）、`APPLE_TEAM_ID`。
- `pnpm tauri build --bundles dmg` 在身份和凭据存在时执行签名与公证。候选不得使用 `--skip-stapling`，因为该选项会停止等待公证并跳过 ticket stapling。
- 缺少完整条件而允许 unsigned 时，显式使用 `--no-sign`，避免项目配置产生只签名的中间态。
- 最终顺序是：构建/签名 → 公证完成 → staple ticket → 验证 → SHA-256 → manifest → 里程碑验收。

官方来源：

- [Tauri macOS Code Signing](https://v2.tauri.app/distribute/sign/macos/)
- [Tauri CLI build/bundle options](https://v2.tauri.app/reference/cli/)
- [Apple: Notarizing macOS software before distribution](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- [Apple: Customizing the notarization workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow)

## 可用性与秘密边界

“设备情况允许”必须同时满足：

1. 当前宿主是 macOS/Apple 设备；
2. `security` 能发现明确的 Developer ID Application 身份；
3. `xcrun` 能发现 `notarytool` 与 `stapler`；
4. 上述一组公证凭据完整存在，私钥路径是可读普通文件；
5. 当前任务已有使用这些既存条件的授权。

探测只能报告状态与原因，不得输出身份私钥、密码、API key 内容或不必要的本机路径。网络/Apple 服务错误只能在真实尝试中得知；尝试开始后失败不得降级。
