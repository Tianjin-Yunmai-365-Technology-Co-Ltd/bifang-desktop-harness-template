# Tauri macOS 与 Windows 候选参考

> 官方资料核对日期：2026-09-04

## Tauri updater 签名制品

- 官方 Tauri 2 updater 要求更新制品签名，签名验证不能关闭。`plugins.updater.pubkey` 可以安全进入应用配置；私钥必须留在发布环境，构建通常通过 `TAURI_SIGNING_PRIVATE_KEY` 和密钥实际需要的密码来源消费，不得写入仓库、日志或前端 bundle。
- `bundle.createUpdaterArtifacts: true` 让 bundler 为目标平台生成 updater archive 及相邻签名。真实扩展名和路径随平台/bundler 变化，必须从 Tauri 输出或 bundle 元数据发现，不得猜文件名。
- updater endpoints 支持 target、arch 和当前版本变量；生产使用 TLS。默认不允许降级。检查、下载和安装可以分阶段执行，Windows 在安装阶段可能退出应用。
- 安装包的 Developer ID/Authenticode/渠道代码签名与 updater archive 签名不是同一件事。允许 unsigned 安装包不能关闭 updater 签名；启用 updater 的候选缺少 archive、`.sig` 或公钥验证时必须失败。
- 本 Skill 只生成本次候选及可审计清单，不上传 update feed、不创建 release，也不持有发布私钥。强更的最低支持版本策略还需要应用层认证与 core 判定，不能由 updater manifest 中一个未认证布尔字段直接触发。

官方来源：

- [Tauri Updater](https://v2.tauri.app/plugin/updater/)
- [Tauri updater JavaScript API](https://v2.tauri.app/reference/javascript/updater/)

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

## Windows 原生 x64 NSIS

- Tauri 官方 Windows 安装器文档规定，在 Windows 原生宿主运行 `tauri build` 会构建并打包 Windows 应用；`--bundles nsis` 可把格式收窄为 NSIS，`--target x86_64-pc-windows-msvc` 明确绑定 x64 MSVC 目标。
- 原生路线直接使用项目本地 Tauri CLI，不传 `--runner cargo-xwin`。`cargo-xwin` 只属于 macOS/Linux 交叉回退，不能出现在 Windows 原生命令中。
- 发布候选必须显式合并 `src-tauri/tauri.release.conf.json`；仅供本机检查的开发试包则不合并发布配置，并显式使用 `--no-sign`，避免误用项目签名配置。
- Windows 原生编译成功不等于安装、SmartScreen、UAC、注册表、WebView2 或 GUI 交互已经通过。未真实安装和运行时，发布候选的 `runtimeVerification` 仍为 `Unverified`；本地试包固定为 `Not run`。
- Authenticode 只在项目已有批准的非交互签名配置、工具和凭据来源时执行；开始后失败必须停止。渠道允许 unsigned 时使用 `--no-sign` 并明确风险，不能索取、生成或打印证书私钥。

官方来源：

- [Tauri Windows Installer](https://v2.tauri.app/distribute/windows-installer/)
- [Tauri Windows Code Signing](https://v2.tauri.app/distribute/sign/windows/)
- [Tauri CLI build options](https://v2.tauri.app/reference/cli/)

## macOS Developer ID 直接分发

- 签名意图先于测试、可用性探测和 bundle。只有产品/渠道已有批准的持久签名与公证配置、用户在当前请求主动要求，或渠道明确要求时，`macosSigningSelection` 才为 `enabled`；其他情况固定为 `disabled/not-requested`，直接以显式 `--no-sign` DMG 命令打包且不得探测本机身份、凭据或 Keychain profile。机器上恰好存在条件不等于用户设置过签名。
- 多个启用来源同时存在时，`macosSigningSource` 固定按 `channel-required > requested > configured > not-requested` 选择，避免相同事实产生不同清单。
- Tauri 要求在 Apple 设备上使用有效 Developer ID Application 身份；免费开发者账号不能完成可分发公证。
- 公证凭据只能选择一组完整方式：
  - App Store Connect API：`APPLE_API_ISSUER`、`APPLE_API_KEY`、`APPLE_API_KEY_PATH`；
  - Apple ID：`APPLE_ID`、`APPLE_PASSWORD`（app-specific password）、`APPLE_TEAM_ID`。
- 已由用户授权且通过在线探测的本机 `notarytool` Keychain profile 可作为第三种互斥方式；它只用于手动 `notarytool submit --wait`，不得导出 profile 内的凭据、输出 profile 名或冒充 Tauri 环境变量三元组。
- 启用选择先探测为 `ready`，再运行不含 `--no-sign` 的 `pnpm tauri build --bundles dmg` 执行签名与公证；关闭选择的命令必须显式包含 `--no-sign`。候选不得使用 `--skip-stapling`，因为该选项会停止等待公证并跳过 ticket stapling。
- 已启用签名时才检查完整条件；缺少任一条件立即阻断，不得改用 `--no-sign`。关闭选择时显式使用 `--no-sign`，避免项目配置或本机残留条件产生只签名的中间态。
- `system_notification = enabled` 是例外的运行前提冲突，不是新的签名来源：若签名选择仍为 `disabled/not-requested`，在任何测试或 bundle 前停止并要求用户下一轮主动启用签名，或先通过产品变更关闭通知；不得暗中 ad-hoc 签名，也不得用 E2E `disabled` 掩盖不可验收组合。
- 最终顺序是：构建/签名 → 公证完成 → staple ticket → 验证 → SHA-256 → manifest → 里程碑验收。

官方来源：

- [Tauri macOS Code Signing](https://v2.tauri.app/distribute/sign/macos/)
- [Tauri CLI build/bundle options](https://v2.tauri.app/reference/cli/)
- [Apple: Notarizing macOS software before distribution](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- [Apple: Customizing the notarization workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow)

## DMG Finder 拖拽布局

- Tauri 的 DMG 配置支持本地 `background`、`windowSize`、`appPosition` 与 `applicationFolderPosition`。本 Harness 的 GUI 初始化把中性图片写入 `<project-id>_gui/src-tauri/dmg/background.png`，配置通过 `./dmg/background.png` 引用它，并固定采用 660×400、应用 `(180, 220)`、Applications `(480, 220)`；真实产品可在批准后替换同一路径字节。直接分发 DMG 必须使用 `docs/GUI_APP_PROFILE.md` 记录的当前路径与 SHA-256，明确展示把应用拖到 Applications 的动作，并让背景尺寸与落点坐标一致。
- Tauri 官方文档明确说明 CI/CD 上已知无法应用图标尺寸与位置。`CI=true` 可能让 bundler 跳过 Finder AppleScript，只复制背景而没有持久化 `.DS_Store`；只检查 `tauri.conf.json` 或背景文件存在不能证明最终安装窗口可见。
- 有交互 Finder 会话的 macOS 宿主可使用 `TAURI_BUNDLER_DMG_IGNORE_CI=1` 强制执行布局，但必须有超时和失败关闭。Tauri 官方 issue 已记录该开关在部分 headless runner 上会等待 AppleScript 超时，因此远端 CI 不得无条件使用。
- 无交互 Finder 会话时，项目必须在签名、公证与 stapling 前使用自身已测试的确定性布局步骤，或拒绝生成该候选。任何布局注入、压缩或重打包都会改变字节，必须重新执行签名、公证、stapling 和摘要。
- 最终 DMG 必须通过随 Skill 提供的 `scripts/verify-dmg-layout.sh`：只读挂载后存在非空 `.DS_Store`、`.background/background.png`、唯一顶层 `.app` 目录和指向 `/Applications` 的链接。helper 不自动接受软件许可或输出产品身份。

官方来源：

- [Tauri DMG 分发](https://v2.tauri.app/distribute/dmg/)
- [Tauri 配置 `DmgConfig`](https://v2.tauri.app/reference/config/#dmgconfig)
- [Tauri Action headless AppleScript 已知问题](https://github.com/tauri-apps/tauri-action/issues/1091)

## 选择、可用性与秘密边界

先按以下顺序解析非秘密意图并记录在 manifest：

1. 产品/渠道已批准的持久配置：`enabled/configured`；
2. 当前用户主动要求：`enabled/requested`；
3. 渠道硬要求：`enabled/channel-required`；
4. 以上均无：`disabled/not-requested`。

前三项才允许运行可用性探测；第四项必须跳过探测并生成明确 unsigned 候选。`configured` 指批准的产品/渠道配置事实，不是环境中偶然存在证书或凭据。

选择已启用后，“设备情况允许”必须同时满足：

1. 当前宿主是 macOS/Apple 设备；
2. `security` 能发现明确的 Developer ID Application 身份；
3. `xcrun` 能发现 `notarytool` 与 `stapler`；
4. 上述一组环境变量凭据完整存在且私钥路径是可读普通文件，或已授权 Keychain profile 通过 `notarytool history` 在线探测；
5. 选择来源已经记录为 `configured`、`requested` 或 `channel-required`。

关闭选择不得探测。启用后的探测只能报告状态与原因，不得输出身份私钥、密码、API key 内容、Keychain profile 名或不必要的本机路径。网络/Apple 服务错误只能在真实尝试中得知；尝试开始后失败不得降级。
