---
name: desktop-build-tauri-release
description: 在 macOS 宿主构建下游 Tauri 2 GUI 候选；全量测试后生成 DMG/Windows NSIS、条件签名公证，并在启用 updater 时产出官方签名更新制品与清单。
---

# 构建 Tauri 发布候选

为 Tauri GUI 生成可追溯安装包；不得把 macOS 交叉构建证据冒充 Windows 原生运行证据。

## 工作流程

1. 读取批准的 GUI 产品/应用资料、存在时受保护的 `docs/GUI_SUPPORT_SURFACES.md`、`docs/AGENT_POLICY.md`、`docs/RELEASE.md`、Tauri 配置、根 Cargo/前端锁文件和分发渠道要求；只有 E2E、完整验收或发布被独立触发时才读取其相关验证记录。完整读取 [references/tauri-macos-windows.md](references/tauri-macos-windows.md)。先解析当前构建的 E2E 选择：本次请求已明确 `enabled`/`disabled` 时直接复用，否则在任何测试或编译前询问用户一次；`milestone_e2e` 只作为建议默认值，选择只对本次构建有效且不得静默写回策略。
2. 要求本次构建已由用户显式请求，项目根是独立 Git 顶层目录，`HEAD` 是批准的 40 字符源码提交，工作区状态已记录，且真实 `<project-id>_gui`、`pnpm-lock.yaml` 和项目本地 Tauri CLI 存在。macOS DMG 目标还必须在任何测试前确认 `<project-id>_gui/src-tauri/dmg/background.png` 是非符号链接的 660×400 PNG，`docs/GUI_APP_PROFILE.md` 已批准该路径与当前 SHA-256，并且 `tauri.conf.json` 的 `bundle.macOS.dmg.background` 精确引用 `./dmg/background.png`，窗口与应用/Applications 落点分别为 660×400、`(180, 220)`、`(480, 220)`；缺失、摘要漂移或配置不一致都必须停止。构建只消费项目内图片，不得引用已在初始化收尾时删除的 Skill 资产路径。存在用户要求的活动 Todo 时不得构建尚未完成的范围，但 Work Plan 不是构建前置条件。不得推断版本、bundle 名称、渠道或发布授权。
3. 从批准的产品事实解析 `updaterEnabled`。若为 false，不生成或伪造更新制品；若为 true，在任何测试前要求：Tauri 配置启用 `bundle.createUpdaterArtifacts: true`，官方 updater 插件具有非空公钥和受限 HTTPS endpoints，产品文档记录 channel/target/arch 与强更策略认证边界，源码/配置/前端不含服务端 secret 或发布私钥。构建运行时必须存在已批准的 `TAURI_SIGNING_PRIVATE_KEY` 安全来源及该密钥实际需要的密码来源；只探测存在性/可用性，不输出值、路径正文或派生私钥。任一条件缺失都阻断 updater 候选，不得通过关闭签名验证、临时改回 `updaterEnabled: false` 或把外部浏览器下载冒充自更新来继续。
4. 在任何单元测试或构建命令前，调用本 Skill 随附的 `scripts/prepare-release-directory.sh <project-root>`，安全刷新项目根 `release/`。该 helper 与 `$desktop-build-rust-release` 的 POSIX helper 保持逐字节一致，复用相同的 Git 根、符号链接、原子隔离和同根暂存门禁，但不要求 GUI-only 项目保留 CLI 构建 Skill。
5. 初始化后的构建不做例行环境预检：不得因显式构建、目标包含 Windows x64、缺少/过期环境证据或工具链可能变化而调用 `$desktop-check-development-environment`。先使用当前环境运行下述真实 Rust、前端或 Tauri 命令；只有某条命令已经失败，且命令、退出状态和脱敏诊断明确指向受管 GUI 工具链或 xwin 工具缺失/不兼容时，才调用对应的常规或 `scripts/macos-tauri-xwin-gates.sh --install-missing --target x86_64-pc-windows-msvc` 门禁，并重试原命令一次。代码/测试、依赖解析、网络、配置、凭据、updater 签名、安装包签名或公证失败不得误判为环境错误；任一门禁或单次重试失败时停止，不临时拼装安装命令。
6. 打包前只先运行项目全部非空单元测试。Rust 必须以 `cargo test --workspace --all-targets --all-features --locked -- --list` 或等价方式确认非空，再运行 `cargo test --workspace --all-targets --all-features --locked`；前端必须运行 `package.json` 与锁文件实际声明的完整单元测试套件，不得使用文件过滤、单测试名、相关子集或 watch 模式，并须确认发现至少一个测试。启用 updater 时，完整套件必须含更新状态、认证最低支持版本 SemVer 强更、签名/target/channel 拒绝和任务回收回归；另行启用统计时才要求产品级同意与零出站回归，默认设置页不得因此恢复隐私/统计区块。不得自动追加格式、lint、类型、中文注释、`dist` 扫描或其他开发门禁；任一单元测试失败或测试数为零时停止。不得启动安装包、应用或 Windows 二进制。
7. macOS 原生候选必须通过上一步的 `bundle.macOS.dmg.background: "./dmg/background.png"` 引用项目内背景，并把 Finder 拖拽安装布局写入真实 DMG，而不是只在 Tauri 配置中声明背景和坐标。交互式 macOS 构建可使用 `CI=true TAURI_BUNDLER_DMG_IGNORE_CI=1 pnpm tauri build --bundles dmg`，但必须为 Finder AppleScript 设置有界超时；Tauri 官方已记录该开关在部分无交互 CI runner 上可能挂起，因此 headless runner 不得盲目启用。无可用 Finder 会话时，只能在签名/公证前使用项目自有、已测试且不含固定产品身份的确定性布局步骤，或者使构建失败；不得接受 `CI=true` 生成但缺少 `.DS_Store` 的空白 Finder 窗口。随后运行 `scripts/probe-macos-notarization.sh`，且只接受以下两条分支：
   - `ready` 且当前任务已授权使用既有签名/公证条件：环境变量三元组模式不传 `--skip-stapling`，让 Tauri 完成 Developer ID 签名、公证、等待和 stapling；随后验证签名、Gatekeeper 评估与 stapled ticket。若探测返回 `notarytool-keychain-profile`，Tauri 先完成 Developer ID 签名与 DMG 打包，随后必须立即使用已授权的 `APPLE_NOTARYTOOL_PROFILE` 调用 `notarytool submit --wait`，只接受 `Accepted`，再对 app/DMG 执行适用的 stapling 与验证；整个阶段结束前不得把仅签名中间态作为候选输出。
   - `unavailable` 且产品/渠道允许 unsigned：使用同一已批准 Finder 布局策略并显式传 `--no-sign`，记录 `unsigned` 与 `not-run` 原因。若渠道要求签名公证则停止。
8. 绝不得输出仅 Developer ID 签名但未公证/staple 的 macOS 候选。探测为 `ready` 后，签名、公证、stapling、验证任一步失败都使该候选失败；不得以 `--no-sign` 重试或静默降级。候选构建中禁止 `--skip-stapling`。
9. Windows x64 交叉候选只使用 `CI=true pnpm tauri build --bundles nsis --runner cargo-xwin --target x86_64-pc-windows-msvc`。首次尝试使用当前 PATH；只有该命令已经因受管 xwin 环境问题失败并由第 5 步门禁成功恢复时，才把门禁返回的完整 `gate.path.prepend` 原样前置到单次重试命令的 PATH，确保 LLVM、NSIS 与刚安装的 `cargo-xwin` 均可解析。拒绝 `msi` 或 `all`；WiX/MSI 只能在 Windows 原生宿主生成。输出必须来自 Tauri 报告或 Cargo 元数据解析的 `target/x86_64-pc-windows-msvc/release/bundle/nsis/`，不得猜测文件名。
10. Windows 交叉安装包只有在项目已有批准的外部非交互签名命令、工具和凭据全部就绪时才尝试签名并验证；开始后失败必须停止。条件不足且渠道允许时记录 `unsigned`。无论编译是否成功，`runtimeVerification` 均为 `Unverified`，不能声称 Windows 安装或运行通过。
11. `updaterEnabled: true` 时，从每次 Tauri 构建的真实输出或 bundle 元数据发现当前 platform/target 的官方 updater archive 与相邻 `.sig`，不得猜测文件名或用安装包 checksum 代替 updater 签名。要求 archive/签名均为非空普通文件，使用配置中的公钥执行实际签名验证，并确认版本、channel、target、arch 与安装包一致；缺失、重复、无法验证或签名不匹配都使该平台 updater 候选失败。不得把 `TAURI_SIGNING_PRIVATE_KEY`、密码、私钥路径或私钥派生内容写入 manifest、日志或制品。
12. 对 macOS 最终 DMG，在所有会改变字节的布局写入、签名、公证和 stapling 完成后先运行 `scripts/verify-dmg-layout.sh <final-dmg>`；它必须只读挂载最终字节并确认非空 `.DS_Store`、`.background/background.png`、唯一顶层 `.app` 与指向 `/Applications` 的拖拽目标。若挂载要求接受 SLA，必须取得独立人工授权，helper 不得自动接受。检查失败时本次构建失败。随后才对最终 DMG/NSIS 及已启用 updater 的 archive/`.sig` 计算 SHA-256，在项目根同级唯一暂存目录形成 manifest 声明的安装包、更新制品、签名和相邻校验和精确集合，验证全部是普通文件且无多余项后，以不跟随链接的目录级原子替换提交到 `release/`。
13. manifest 必须记录通用字段及 `e2eSelection`、`interface: gui`、`artifactKind: installer`、`bundleFormat`、`buildMode`、`host`、`platform`、`target`、`runtimeVerification`、签名作用域、`notarizationStatus`、`notarizationReason`、结构化 `notarizationEvidence` 和 `milestoneAcceptance: pending`。另固定记录 `updaterEnabled`；启用时记录 updater plugin/Tauri 版本、channel、target、arch、公开公钥指纹、archive/`.sig` 的相对路径、大小、SHA-256 和 `signatureVerification: passed`，但不记录任何私钥事实。macOS 完整路径只在 ticket 验证成功时使用 `notarized-and-stapled`；Windows 使用 `not-applicable`。
14. 重新枚举 `release/`，要求文件集与所有 manifests 精确相等；只在当前 `release/` manifest、其声明的相邻制品证据和最终回复中记录环境变化、命令、Rust/前端全量单元测试数量、安装包、updater archive/签名、大小、摘要、签名/公证证据、源码提交、本次 E2E 选择、交叉构建限制和未验证平台。不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification。编译、签名与打包期间不得混跑冒烟/E2E；若本次 E2E 为 `enabled` 或产品/渠道要求，最终字节形成后立即交给 `$desktop-verify-delivery`，否则只在 manifest 和最终回复记录 `Not run` 与剩余风险并结束构建。

## 边界

- 当前受测路线只覆盖 macOS 原生 DMG 与 macOS→Windows x64 NSIS。Linux GUI、Windows MSI、Windows 原生运行/安装和其他架构保持 `Unverified`。
- 不自动安装 Homebrew，不创建、索取、导出、显示或上传安装包签名、公证或 updater 私钥凭据，也不修改项目签名身份。
- 不创建标签、Releases、商店提交、更新 feed、上传更新制品或正式发布；构建授权不等于发布授权。
- 安装包代码签名与 updater 制品签名是独立门禁；安装包公证另按渠道门禁执行。渠道允许安装包 `unsigned` 不代表 updater 可不签名；启用 updater 后签名制品缺失或验证失败必须阻断。
- 构建请求、执行、成功、失败、重试和结果本身不触发任何项目记忆；只有被独立触发的 E2E、完整验收、发布、人工复核或长期审计由对应 Skill 按自身规则留证。
- stapling 与最终只读 Finder 布局检查均通过后的字节才是候选。此后任何布局补写、签名、公证、stapling 或重打包都会产生新候选并返回 `$desktop-verify-delivery`。

## 完成输出

报告批准提交、bundle/target、环境安装与复探、真实命令、Rust/前端全量单元测试、安装候选/哈希/manifest、`updaterEnabled` 与更新 archive/`.sig`/签名验证、安装包签名公证状态、`runtimeVerification`、`milestoneAcceptance: pending`、本次 E2E 选择/结果和剩余风险；不更新项目记忆。
