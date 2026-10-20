> 官方资料核对日期：2026-09-04（沿用原参考核对日期；本次仅整理现有合同）

本文件是 [构建 Skill](../SKILL.md) 的条件执行合同；`scripts/` 路径均相对该 Skill 根目录。共享的选择冻结、版本、测试、锁策略、manifest 与原子提交仍按主流程执行。

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

## 布局、unsigned 与资源检查

7. 在任何 bundle、签名、公证或 stapling 前，再次要求工作树 clean、当前分支仍为上下文默认分支且 `HEAD == buildSourceCommit`。macOS 原生候选必须通过 `bundle.macOS.dmg.background: "./dmg/background.png"` 引用项目内背景，并把 Finder 拖拽安装布局写入真实 DMG，而不是只在 Tauri 配置中声明背景和坐标。第 1 步已经为本次候选锁定 `macosSigningSelection: enabled | disabled` 与来源：已批准的持久签名/公证配置为 `configured`，当前请求主动要求为 `requested`，渠道硬要求为 `channel-required`，其余固定为 `disabled/not-requested`；本阶段不得随后补解析或改变。交互式 macOS 构建的真实命令只允许来自下面对应选择分支，并必须为 Finder AppleScript 设置有界超时；Tauri 官方已记录布局开关在部分无交互 CI runner 上可能挂起，因此 headless runner 不得盲目启用。无可用 Finder 会话时，只能在签名/公证前使用项目自有、已测试且不含固定产品身份的确定性布局步骤，或者使构建失败；不得接受 `CI=true` 生成但缺少 `.DS_Store` 的空白 Finder 窗口。从 Tauri 真实输出定位唯一构建 `.app/Contents/Resources/release-notes.json`，立即运行 `node .agents/skills/desktop-build-tauri-release/scripts/verify_release_notes_resource.mjs bytes --source release-notes.json --bundled <discovered-resource>`；不得猜测 bundle 名称或只检查源配置。本机恰好存在身份、工具、环境变量或 Keychain profile 只表示可用性，绝不能自行改变选择。
   - 多个启用来源同时存在时，`macosSigningSource` 按 `channel-required > requested > configured > not-requested` 取最高优先级，使同一输入得到唯一可复核结果。
   - `disabled/not-requested`：不得运行 `scripts/probe-macos-notarization.sh`，直接以同一已批准 Finder 布局策略运行 `CI=true TAURI_BUNDLER_DMG_IGNORE_CI=1 pnpm tauri build --bundles dmg --no-sign --config src-tauri/tauri.release.conf.json`，记录 `signingStatus: unsigned`、`notarizationStatus: not-run` 和未签名风险；若渠道要求签名公证，此分支在解析阶段即被覆盖为 enabled。

签名选择为 `enabled` 时，在任何探测或构建前读取并执行 [签名与公证](tauri-macos-signing.md)，不得执行上述 unsigned 分支。

## 最终 DMG 检查

13. 对 macOS 最终 DMG，在所有会改变字节的布局写入、签名、公证和 stapling 完成后先运行 `scripts/verify-dmg-layout.sh <final-dmg> <project-root>/release-notes.json`；它必须只读挂载最终字节并确认非空 `.DS_Store`、`.background/background.png`、唯一顶层 `.app`、指向 `/Applications` 的拖拽目标，以及唯一 `.app/Contents/Resources/release-notes.json` 与根事实逐字节一致。若挂载要求接受 SLA，必须取得独立人工授权，helper 不得自动接受。检查失败时本次构建失败。
