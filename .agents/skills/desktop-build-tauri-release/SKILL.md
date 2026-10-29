---
name: desktop-build-tauri-release
description: 从 clean HEAD 构建下游 Tauri 2 GUI 发布候选；支持 macOS 原生 DMG、Windows 原生 x64 NSIS 与 macOS xwin NSIS，并按当次选择执行 E2E 门禁。
---

# 构建 Tauri 发布候选

为 Tauri GUI 生成可追溯发布候选；不得把普通本地试包升级为发布任务，也不得把 macOS 交叉构建证据冒充 Windows 原生运行证据。

仅供本机安装检查的试包转到 `$desktop-build-tauri-local-install`；已完成 Git 发布后，用户另行请求可分发候选打包，或本次发布冻结了用户已确认的 `post_release_action: local_package`，才进入本 Skill。正式候选的 E2E 选择在本次请求已明确 `enabled`/`disabled` 时直接复用，否则在任何测试或编译前询问用户一次；`e2e_hint` 只提供建议默认值。当前候选目标包含 macOS 时 `macosSigningSelection` 必须精确为 `enabled | disabled`；不含 macOS 时为 `not-applicable`。这些候选构建只核对既有版本，构建不得提升版本。

## 按需资料

先从根 Cargo 与当前请求确定实际候选目标和构建路线，仅读取命中行的引用；多路线取并集。签名适用性取决于候选目标，不能仅因宿主是 macOS 而启用。

| 路线或选择 | 必须读取 |
|---|---|
| macOS 原生 DMG（含 unsigned） | [macOS DMG](references/tauri-macos-dmg.md) |
| 目标含 macOS 且已解析签名 enabled | [macOS 签名与公证](references/tauri-macos-signing.md)，在任何测试或签名探测前读取 |
| Windows 原生 x64 NSIS | [Windows 原生候选](references/tauri-windows-native.md) |
| macOS→Windows x64 NSIS | [Windows xwin 候选](references/tauri-windows-xwin.md) |
| 已解析 updaterEnabled 为 true | [updater 制品](references/tauri-updater.md)，在任何测试前读取配置与密钥来源门禁 |

引用是对应分支的执行合同；旧 [平台索引](references/tauri-macos-windows.md) 只保留兼容导航，不要求整读全部平台资料。

## 工作流程

先从根 Cargo 元数据读取 `gui-root`（未声明时为 `<project-id>_gui`）和 `rust-test-manifests`（未声明时为根 `Cargo.toml`），以实际受 Git 跟踪的 Cargo/前端清单、Tauri 配置与本地 CLI 复核候选路线。既有 GUI 可使用仓库根作为 GUI 根，并逐一列出独立 Rust 工作区；命令在相应 GUI 根或测试清单所在工作区执行。首次接入的产品须在受保护 GUI 档案中写明实际实现和批准差异，不能用初始化九字段的近似值冒充已验证能力。

既有 GUI 若把 Tauri 配置或 Cargo 清单放在 GUI 根，而下列候选命令与更新日志资源校验仍使用固定 `src-tauri/tauri.release.conf.json`，须先按 `$desktop-upgrade-harness` 的既有工程接入指引适配该下游条件构建 Skill、发布配置路径与资源校验，并用实际非空测试验证。`post_release_action` 接受其基础清单布局，只证明本地打包路线可选；未完成这些适配时不得声称候选可构建。

1. 读取批准的 GUI 产品/应用资料、存在时受保护的 `docs/GUI_SUPPORT_SURFACES.md`、`docs/AGENT_POLICY.md`、`docs/RELEASE.md`、Tauri 配置、根 Cargo/前端清单和分发渠道要求；只有 E2E 或完整验收被独立触发时才读取相关验证记录。仅按上方路线表读取命中引用。从根 `Cargo.toml` 的 `[workspace.metadata.agent-first-harness]` 读取目标平台与接口。只有用户在 Git 发布完成后另行请求候选构建/可分发候选打包，或本次发布冻结了用户已确认的 `post_release_action: local_package`，才进入本 Skill；本地安装试包转到 `$desktop-build-tauri-local-install`。若作为该次发布冻结的 `local_package` 路径进入，先只读运行 `node .agents/skills/desktop-manage-git-lifecycle/scripts/git_lifecycle.mjs check-post-release --project-root . --action local_package`，确认发布 HEAD/tag 与冻结动作；独立候选构建请求不受该选择限制。在任何测试、编译或 `release/` 清理前运行 `node .agents/skills/desktop-prepare-release/scripts/release_context.mjs verify --project-root .`，只接受工作树 clean、当前具名分支等于上下文默认主分支、本地主分支与 `expectedTag` 都指向当前 HEAD，且 tracked 上下文字节、HEAD blob 与规范 schema 一致。锁定 `sourceCommit`、`releaseContextSha256` 与 `releaseReview`；发布审查只从上下文读取。随后单独解析本次 `e2eSelection`。在任何测试或签名探测前，按已批准产品/渠道配置、本次用户请求及硬要求确定当前候选的 `macosSigningSelection`/`macosSigningSource`，目标含 macOS 时为 `enabled | disabled`，否则为 `not-applicable`，锁定为本次构建选择并在候选 manifest 中记录，不写入发布上下文。`system_notification = enabled` 且 macOS 签名关闭时立即停止。构建 Skill 不自行执行发布语义审查，也不设置分支拓扑门禁。
2. 要求本次构建已由用户显式请求，或本次 Git 发布冻结的 `post_release_action: local_package` 构成持久构建授权；后一情形不重复索要打包许可。项目根是独立 Git 顶层目录。以 `git status --porcelain=v1 --untracked-files=all` 复核 clean，把当前 40 位 HEAD 锁定为 `buildSourceCommit`，要求等于上一步 `sourceCommit`，并锁定 `releaseContextSha256`；dirty、无 HEAD、本地主分支/tag 或上下文不一致时停止。普通构建不得自行 add/commit 或配置身份。真实 GUI 包、前端 `package.json` 和项目本地 Tauri CLI 必须存在。固定 os/updater/window-state/dialog 基线、权限和注册顺序继续按产品工程规则验证。先调用 `$desktop-manage-version check --phase build`，确认 Cargo 当前版本、版本状态和发布上下文版本一致；构建不得计算、提升版本或重置 Git 发布周期。随后只读运行 `node .agents/skills/desktop-inspect-release-notes/scripts/inspect_release_notes.mjs check --file release-notes.json --expected-version <version>` 和 `node .agents/skills/desktop-build-tauri-release/scripts/verify_release_notes_resource.mjs config --project-root . --gui-root <resolved-gui-root>`，计算摘要；缺失或漂移时报告已发布源码的记录不一致，不在构建中改写它。存在活动 Todo 时不得构建未完成范围。
   - 同一固定基线还必须包含 dialog：根 `tauri-plugin-dialog = "2.8.4"`、GUI member `workspace = true`、前端生产依赖 `@tauri-apps/plugin-dialog = "^2.8.4"`，中央 Builder 在 window-state 后、条件 notification/autostart/global-shortcut 前恰好注册一次。主窗口 capability 的 `dialog:*` 项必须精确为唯一 `dialog:default`，覆盖 message/open/save 全部官方对话框类型；禁止 wildcard、deprecated alias、deny 项和任何额外文件系统授权，dialog 不加入自有 `invoke_handler`。任一依赖、顺序或权限漂移都停止构建。
3. 从批准的产品事实解析 GUI profile 之外的 `updaterEnabled` 发布门，只控制是否生成、签名和声明更新制品，不控制固定插件安装。false 保留 `NotConfigured` 零出站基线，不启用 archive 生成配置或主动检查 endpoint/pubkey；true 在任何测试前按 [updater 制品](references/tauri-updater.md) 完成配置、公钥、HTTPS endpoints、channel/target/arch 与安全密钥来源门禁。条件缺失或分支配置混入均停止，不能临时改变选择。
4. 在任何单元测试或构建命令前，按当前宿主选择本 Skill 随附的 release helper：macOS/Linux 调用 `scripts/prepare-release-directory.sh <project-root>`，Windows PowerShell 调用 `scripts/prepare-release-directory.ps1 -ProjectRoot <project-root>`，安全刷新项目根 `release/`。两者分别与 `$desktop-build-rust-release` 的 POSIX/PowerShell helper 保持逐字节一致，复用相同的 Git 根、clean HEAD、符号链接或重解析点、原子隔离和同根暂存门禁；其 `release.source_commit` 必须等于 `buildSourceCommit`。Windows 原生路线不得调用 `.sh` helper；不要求 GUI-only 项目保留 CLI 构建 Skill。
5. 初始化后的构建不做例行环境预检：不得因显式构建、目标包含 Windows x64、缺少/过期环境证据或工具链可能变化而调用 `$desktop-check-development-environment`。先使用当前环境运行下述真实 Rust、前端或 Tauri 命令；只有某条命令已经失败，且命令、退出状态和脱敏诊断明确指向受管 GUI 工具链或 xwin 工具缺失/不兼容时，才调用对应的常规或 `scripts/macos-tauri-xwin-gates.sh --install-missing --target x86_64-pc-windows-msvc` 门禁，并重试原命令一次。代码/测试、依赖解析、网络、配置、凭据、updater 签名、安装包签名或公证失败不得误判为环境错误；任一门禁或单次重试失败时停止，不临时拼装安装命令。
6. 前端依赖尚未安装或 CI 新检出时，先从根 Cargo 元数据读取 `dependency-lock-policy` 并用 `project_lock_policy.mjs` 对实际 `rust-test-manifests` 与 `gui-root` 执行 `assertDependencyLocks`。缺省或 `ignored` 执行 `pnpm install --no-frozen-lockfile`，不要求项目锁文件；显式 `tracked` 要求实际 Cargo workspace 的 `Cargo.lock` 与 GUI 根的 `pnpm-lock.yaml` 为受 Git 跟踪且未被忽略的普通文件，并执行 `pnpm install --frozen-lockfile`。打包前只先运行项目全部非空单元测试。Rust 对 `rust-test-manifests` 的每个实际工作区分别确认并运行非空全量单元测试；默认根工作区使用 `cargo test --workspace --all-targets --all-features -- --list` 和 `cargo test --workspace --all-targets --all-features`，独立工作区使用对应 `--manifest-path <path>` 的等价命令；`tracked` 时每条 Cargo 命令追加 `--locked`，列测试时置于 `-- --list` 前；前端必须运行 `package.json` 声明的完整单元测试套件，不得使用文件过滤、单测试名、相关子集或 watch 模式，并须确认发现至少一个测试。完整前端套件始终覆盖所有可见版本恰有一个小写 `v`；`about_page = enabled` 时还必须覆盖 Rust 资源解析/畸形失败、handler 注册、前端固定 IPC 命令与解码、loading/error/retry、关于页“更新日志”按钮、近 10 版/每类 10 条上限和父容器不代理检查或日志按钮，disabled 时覆盖路由、命令、加载器、入口与运行时组件缺席。固定 updater 基线始终覆盖无发布配置时 `NotConfigured`、零出站、失败不伪报“已是最新”；`updaterEnabled: false` 还覆盖无 updater archive/签名生成配置，`updaterEnabled: true` 才另外要求更新状态、认证最低支持版本 SemVer 强更、签名/target/channel 拒绝和任务回收回归。另行启用统计时才要求产品级同意与零出站回归，默认设置页不得因此恢复隐私/统计区块。不得自动追加格式、lint、类型、中文注释、`dist` 扫描或其他开发门禁；任一单元测试失败或测试数为零时停止。测试完成后、任一正式 Tauri 编译前再次要求工作树 clean 且 `HEAD == buildSourceCommit`；测试产生变化时停止。不得启动安装包、应用或 Windows 二进制。
   上述 `tracked` 路线中，Cargo metadata 调用也必须追加 `--locked`；第 7、9、10 步的 Tauri build 命令统一在原有参数末尾追加 `-- --locked`，由 Tauri 传递给所选 Cargo runner。缺省或 `ignored` 不追加；若所选 runner 无法证明接受该参数则失败关闭，不把未锁定构建记为候选。[Tauri 2 CLI build](https://v2.tauri.app/reference/cli/#build) 将尾部参数传给 runner（核对日期：2026-09-29）。
7. 在任何 bundle、签名、公证或 stapling 前，再次要求工作树 clean、当前分支仍为上下文默认分支且 `HEAD == buildSourceCommit`。签名选择已在测试前冻结，`macosSigningSource` 采用 `channel-required > requested > configured > not-requested` 的唯一优先级，不能由机器可用性改变。macOS 原生候选按 [macOS DMG](references/tauri-macos-dmg.md) 执行已批准布局、对应签名分支、构建与实际应用资源更新日志逐字节检查。



8. macOS 签名关闭时不得探测身份、凭据或在线公证；启用时按 [macOS 签名与公证](references/tauri-macos-signing.md) 完整执行签名、公证、stapling 与验证，任一步失败都停止，不得以 `--no-sign` 重试或静默降级。候选构建中禁止 `--skip-stapling`。
9. Windows 原生 x64 候选按 [Windows 原生候选](references/tauri-windows-native.md) 构建 NSIS、执行适用签名及实际资源字节检查；禁止 cargo-xwin，固定记录 `buildMode: native`，真实安装与运行前保持 `runtimeVerification: Unverified`。
10. macOS→Windows x64 候选按 [Windows xwin 候选](references/tauri-windows-xwin.md) 执行固定 NSIS 构建与资源字节检查；不得猜测产物路径，不接受 MSI 或 all bundle。
11. Windows 交叉路线的签名、失败关闭和宿主运行限制继续按同一 xwin 引用执行；编译成功不能提升 Windows `runtimeVerification: Unverified`。
12. `updaterEnabled: true` 时按 [updater 制品](references/tauri-updater.md) 从真实输出定位 archive/`.sig`，实际公钥验签并核对版本、channel、target、arch；制品缺失或签名无法验证均失败。
13. 所有会改变字节的布局写入、签名、公证和 stapling 完成后，macOS 按 [macOS DMG](references/tauri-macos-dmg.md) 对当前最终 DMG 执行只读布局与包内更新日志字节检查；SLA 仍须独立授权。随后才对最终 DMG/NSIS 及已启用 updater 的 archive/`.sig` 计算 SHA-256，在项目根同级、同一文件系统的唯一暂存目录形成安装包、更新制品、签名和相邻校验和；此时不得先写入或替换项目根 `release/`。
14. 写 manifest 前再次运行发布上下文 `verify`，要求 `sourceCommit`、`releaseContextSha256`、`releaseReview` 逐字段等于第 1 步，重新执行 GUI/macOS 适用性检查，并要求本次构建的 `e2eSelection`、`macosSigningSelection`/`macosSigningSource` 与测试及签名开始前的快照一致。manifest 记录 `sourceCommit: <buildSourceCommit>`、`releaseContextSha256`、完整 `releaseReview` 及其既有投影、当前构建的 `candidateSelections`、原有平台、制品、更新日志、签名、公证和 `milestoneAcceptance: pending` 字段。发布审查启用时从上下文逐字段复制证据，关闭时只复制原因/风险且证据缺席；macOS 签名字段只从当前构建快照复制，不得由环境探测反向改变选择。
   - 公证证据字段受当前构建的 macOS 签名选择约束：`disabled/not-requested` 时 `notarizationEvidence` 与任何探测派生签名证据必须缺席，通用 `signingEvidence` 只能结构化记录选择、来源、unsigned 结论与风险；manifest 还必须精确记录 `releaseNotesVersion`、`releaseNotesSha256`、`releaseNotesPath: release-notes.json` 与 `releaseNotesResourceVerification: byte-identical`；`enabled` 时才要求完整签名、公证、stapling 和验证证据。
   - 另固定记录 `updaterEnabled` 与实际 updater plugin/Tauri 版本；启用时再记录 channel、target、arch、公开公钥指纹、archive/`.sig` 的相对路径、大小、SHA-256 和 `signatureVerification: passed`，但不记录任何私钥事实。macOS 完整路径只在 ticket 验证成功时使用 `notarized-and-stapled`；Windows 使用 `not-applicable`。

   所有条件分支完成后才把 manifest 写入同一暂存目录。写完 manifest 后必须按每份 manifest 枚举并复算安装包、更新制品、签名、校验和及适用证据的精确集合，要求全部为普通文件、无多余/缺失项且与最终摘要一致；随后才以不跟随链接的目录级原子替换提交到 `release/`。替换前的任何失败都不得在目标目录留下部分候选。
15. 重新枚举 `release/`，要求文件集与所有 manifests 精确相等。只在当前 `release/` manifest、其声明的相邻制品证据和最终回复中记录环境变化、命令、Rust/前端全量单元测试数量、安装包、updater archive/签名、大小、摘要、签名/公证证据、源码提交、本次 E2E 选择、交叉构建限制和未验证平台。不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification。编译、签名与打包期间不得混跑冒烟/E2E。若本次 E2E 为 `enabled` 或产品/渠道要求，最终字节形成后立即交给 `$desktop-verify-delivery`，否则只在 manifest 和最终回复记录 `E2E: Not run` 与剩余风险并结束构建。

   同一输出还必须记录当次 `reviewSelection`/`reviewStatus`、适用 `reviewEvidence` 或 `Not run` 原因/风险，以及 macOS `macosSigningSelection`/`macosSigningSource`；关闭的审查或签名分支不得残留对应探测与证据字段。

## 边界

- 当前合同覆盖 macOS 原生 DMG、Windows 原生 x64 NSIS 与 macOS→Windows x64 NSIS；真实前向证据仍只覆盖既有路线，Windows 原生安装/运行、Linux GUI、Windows MSI 和其他架构保持 `Unverified`，直到对应最终候选 E2E/验收实际通过。Linux 本地试包和宿主要点见 `$desktop-build-tauri-local-install` 的 `references/tauri-linux.md`，本地试包通过不构成 Linux 候选证据。
- 不自动安装 Homebrew，不创建、索取、导出、显示或上传安装包签名、公证或 updater 私钥凭据，也不修改项目签名身份。
- macOS 安装包签名意图与机器可用性严格分离：没有已批准持久配置、本次主动要求或渠道硬要求时固定 unsigned，并且不运行身份/凭据/在线公证探测；一旦明确启用则完整签名、公证、staple，任一步失败都阻断而不降级。
- 不创建标签、Releases、商店提交、更新 feed；也不移动标签、上传更新制品。始终只读验证已完成 Git 发布创建的本地版本 tag；远端候选仅在另行授权推送完成后验证已推送的远端 tag；构建授权不等于渠道发布授权。
- 不生成、补写、重排或截断 `release-notes.json`；构建只校验、打包并记录其摘要，任何内容变化都必须回到发布准备与新候选流程。
- 固定 updater 插件安装与 `updaterEnabled` 发布门是两件事：所有 GUI 保留 Rust-only 插件与 `NotConfigured` 零出站基线，只有 `updaterEnabled: true` 才生成、签名和声明更新 archive。安装包代码签名与 updater 制品签名是独立门禁；安装包公证另按渠道门禁执行。渠道允许安装包 `unsigned` 不代表 updater archive 可不签名；发布门启用后签名制品缺失或验证失败必须阻断。
- 构建请求、执行、成功、失败、重试和结果本身不触发任何项目记忆；候选 E2E 与完整验收只把结构化证据和状态原子写入忽略的 `release/` manifest 及其声明证据。渠道分发成功或独立回顾审计如触发后续 tracked 记录，必须作为独立事件处理，且不得反向批准活动或历史候选。
- 普通构建永不自动暂存或提交工作树；用户独立请求的候选构建只消费已发布的 clean 默认主分支和 tag。
- 普通 Windows/Linux 本地试包由 `$desktop-build-tauri-local-install` 独立处理；不得为了满足本 Skill 的 clean HEAD、更新日志或 E2E 门禁而询问是否把任务升级为发布。
- 本 Skill 不创建标签、Releases、商店提交或更新 feed；验证 Git 发布生命周期的本地主分支/tag；本 Skill 的 GUI 路线在当前宿主构建，不因仓库存在远端就自动调用 provider。
- stapling 与最终只读 Finder 布局检查均通过后的字节才是候选。此后任何布局补写、签名、公证、stapling 或重打包都会产生新候选并返回 `$desktop-verify-delivery`。

## 完成输出

报告 clean `buildSourceCommit`/HEAD、本地主分支/tag 复核、当次 `reviewSelection`/`reviewStatus` 及适用证据或 `Not run` 风险、固定 updater 插件基线与独立的 `updaterEnabled` 发布门；同时报告 bundle/target、环境安装与复探、真实命令、Rust/前端全量单元测试、安装候选/哈希/manifest、macOS `macosSigningSelection`/来源/签名公证状态，以及仅在 `updaterEnabled: true` 时存在的更新 archive/`.sig`/签名验证、`runtimeVerification`、`milestoneAcceptance: pending`、本次 E2E 选择/结果和剩余风险；不更新项目记忆。

现有发布日志只读复核使用 `$desktop-inspect-release-notes`；构建不整理或写入条目，内部直接复用原读取库的脚本保持原路径。
