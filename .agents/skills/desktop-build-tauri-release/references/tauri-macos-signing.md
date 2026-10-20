> 官方资料核对日期：2026-09-04（沿用原参考核对日期；本次仅整理现有合同）

本文件是 [构建 Skill](../SKILL.md) 的条件执行合同；`scripts/` 路径均相对该 Skill 根目录。共享的选择冻结、版本、测试、锁策略、manifest 与原子提交仍按主流程执行。

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

## 已启用分支执行

- `enabled`：才运行 `scripts/probe-macos-notarization.sh`。只接受 `ready` 后才以同一已批准 Finder 布局策略运行 `CI=true TAURI_BUNDLER_DMG_IGNORE_CI=1 pnpm tauri build --bundles dmg --config src-tauri/tauri.release.conf.json`；`unavailable`、探测失败或条件不完整都阻断，不得切换为 unsigned。环境变量三元组模式不传 `--skip-stapling`，让 Tauri 完成 Developer ID 签名、公证、等待和 stapling；若探测返回 `notarytool-keychain-profile`，Tauri 先完成 Developer ID 签名与 DMG 打包，再立即使用已批准的 profile 调用 `notarytool submit --wait`，只接受 `Accepted`，然后对 app/DMG 执行适用 stapling 与验证。不得输出或记录秘密/profile 名。

8. 启用 macOS 签名后绝不得输出仅 Developer ID 签名但未公证/staple 的候选。签名、公证、stapling、Gatekeeper/ticket 验证任一步失败都使该候选失败；不得以 `--no-sign` 重试或静默降级。候选构建中禁止 `--skip-stapling`。关闭选择的 unsigned 路线不是失败降级，而是探测前已确定并写入清单的默认路线。
