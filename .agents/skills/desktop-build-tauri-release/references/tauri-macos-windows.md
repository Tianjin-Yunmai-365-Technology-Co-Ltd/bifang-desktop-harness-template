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
- 已由用户授权且通过在线探测的本机 `notarytool` Keychain profile 可作为第三种互斥方式；它只用于手动 `notarytool submit --wait`，不得导出 profile 内的凭据、输出 profile 名或冒充 Tauri 环境变量三元组。
- `pnpm tauri build --bundles dmg` 在身份和凭据存在时执行签名与公证。候选不得使用 `--skip-stapling`，因为该选项会停止等待公证并跳过 ticket stapling。
- 缺少完整条件而允许 unsigned 时，显式使用 `--no-sign`，避免项目配置产生只签名的中间态。
- 最终顺序是：构建/签名 → 公证完成 → staple ticket → 验证 → SHA-256 → manifest → 里程碑验收。

## DMG Finder 拖拽布局

- Tauri 的 DMG 配置支持本地 `background`、`windowSize`、`appPosition` 与 `applicationFolderPosition`；直接分发 DMG 必须使用已批准的本地背景，明确展示把应用拖到 Applications 的动作，并让背景尺寸与落点坐标一致。
- Tauri 官方文档明确说明 CI/CD 上已知无法应用图标尺寸与位置。`CI=true` 可能让 bundler 跳过 Finder AppleScript，只复制背景而没有持久化 `.DS_Store`；只检查 `tauri.conf.json` 或背景文件存在不能证明最终安装窗口可见。
- 有交互 Finder 会话的 macOS 宿主可使用 `TAURI_BUNDLER_DMG_IGNORE_CI=1` 强制执行布局，但必须有超时和失败关闭。Tauri 官方 issue 已记录该开关在部分 headless runner 上会等待 AppleScript 超时，因此远端 CI 不得无条件使用。
- 无交互 Finder 会话时，项目必须在签名、公证与 stapling 前使用自身已测试的确定性布局步骤，或拒绝生成该候选。任何布局注入、压缩或重打包都会改变字节，必须重新执行签名、公证、stapling 和摘要。
- 最终 DMG 必须通过随 Skill 提供的 `scripts/verify-dmg-layout.sh`：只读挂载后存在非空 `.DS_Store`、`.background/background.png`、唯一顶层 `.app` 目录和指向 `/Applications` 的链接。helper 不自动接受软件许可或输出产品身份。

官方来源：

- [Tauri DMG 分发](https://v2.tauri.app/distribute/dmg/)
- [Tauri 配置 `DmgConfig`](https://v2.tauri.app/reference/config/#dmgconfig)
- [Tauri Action headless AppleScript 已知问题](https://github.com/tauri-apps/tauri-action/issues/1091)

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
4. 上述一组环境变量凭据完整存在且私钥路径是可读普通文件，或已授权 Keychain profile 通过 `notarytool history` 在线探测；
5. 当前任务已有使用这些既存条件的授权。

探测只能报告状态与原因，不得输出身份私钥、密码、API key 内容或不必要的本机路径。网络/Apple 服务错误只能在真实尝试中得知；尝试开始后失败不得降级。
