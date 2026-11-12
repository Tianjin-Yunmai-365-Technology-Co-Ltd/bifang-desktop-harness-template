---
name: desktop-verify-delivery
description: 对发布候选、用户明确要求完整验收或当前构建启用 E2E 的最终真实产物进行验收；日常开发不得自动调用。
---

# 验证交付

验证完整真实候选，不把开发检查、模拟实现或目录存在误报为可用。

DESKTOP 候选使用 Tauri 的前端测试、资源定位及相应打包 helper。NSH 使用自己的构建与批次证据；本地试包与初始化调试程序不能进入候选验收。

下文“`release/` 精确集合”“全部 manifest”“整组同状态”和替换整个 `release/` 的步骤用于 CLI/Tauri 扁平候选。NSH 按目标批次保留目录，以下准入、二次上下文核对、真实产物和 E2E 门禁仍适用；凡通用步骤 2、7、8 与底部 NSH 路由对集合或状态写入的描述不同，均以 NSH 路由为准，只取显式选定的单个批次。不能让旧批次的 HEAD 或状态阻断当前批次，也不能把旧批次计入本次通过。

## 准入

1. 只接受发布/渠道要求、用户明确要求完整验收，或当前构建已明确选择 E2E `enabled` 的请求。读取 Product Spec、当前构建记录、`docs/AGENT_POLICY.md`、`docs/ENGINEERING_RULES.md`、相关 ADR、验证/发布规则和适用接口 Skill。
2. 要求存在与批准场景、40 字符源码提交、版本/构建标识和当前环境绑定的完整真实产物、校验和及 manifest。先运行发布上下文 `verify`，要求工作树 clean、当前具名分支是上下文默认主分支、本地主分支与 `expectedTag` 都指向当前 HEAD，且 tracked `.harness/release-context.json` 字节和 schema 有效。manifest `sourceCommit` 必须等于该 HEAD，`releaseContextSha256` 与发布审查字段必须逐字段来自上下文；E2E 和 macOS 签名选择必须来自本次构建的 manifest 及其证据，并在验收中保持不变。三平台提供方候选还要求其构建记录证明发布后独立推送已完成、远端小写 `release` 分支/tag 在构建时与源码提交一致；验收前再只读复核远端两条 ref。缺少上下文、HEAD/ref/tag 漂移或 manifest 自行改写选择都拒绝。随后运行版本检查，并要求候选/manifest/上下文版本相同；验收不得提升版本。该验证包含发布审查的来源与允许变化绑定，不额外要求线性历史或特定合并形态。
3. 当前存在用户要求的活动 Work Plan 时，相关 Todo 必须全部 `done`；没有 Work Plan 不阻断验收。

## 工作流程

1. 明确核心成功路径、最高风险失败路径、真实输入/输出和可观察结果，区分外部前置项与产品逻辑。
2. 核对当前构建已经运行项目全部非空单元测试。Rust 证据必须覆盖 workspace/all-targets/all-features 的完整测试；Tauri GUI 还必须覆盖完整前端单元测试套件。只有源码提交、候选构建身份与对应测试证据完全匹配时才复用该证据；任何变化都必须返回构建 Skill 重建，不在验收中重复一套隐式构建流程。
3. 运行候选自身所必需的真实产物存在性、接口/渠道和最终字节检查。所有 GUI 候选先核对 manifest 的 `releaseNotesVersion`、`releaseNotesSha256`、`releaseNotesPath: release-notes.json` 与根事实；Tauri 对可定位的实际应用资源运行 `node .agents/skills/desktop-build-tauri-release/scripts/verify_release_notes_resource.mjs bytes --source release-notes.json --bundled <discovered-resource>`。macOS Tauri DMG 必须针对 `release/` 中当前最终字节重新运行 `$desktop-build-tauri-release` 的 `scripts/verify-dmg-layout.sh <final-dmg> <project-root>/release-notes.json`，只读挂载并再次证明唯一 `.app/Contents/Resources/release-notes.json` 逐字节一致；不得自动接受软件许可或沿用旧 DMG 的布局证据，也不得沿用旧更新日志证据。xwin NSIS 保持 `runtimeVerification: Unverified`，不能据交叉构建成功或未安装资源目录检查推断 Windows 行为。
4. 解析运行时检查：产品/渠道/安全硬要求优先；冒烟读取 `acceptance_smoke`；E2E 只读取当前构建的明确选择，`e2e_hint` 仅用于当时询问的建议默认值，不能在此替代或反转选择。发布语义审查只读取 manifest 的当次 `reviewSelection`；不得在验收阶段补问、推断或把 `disabled` 静默翻转，任何硬要求与关闭选择冲突时拒绝候选并返回新构建。
5. 按每个 manifest 的 `reviewSelection` 核对发布语义审查，且机械安全门禁与最终人类签署不受该选择控制。
   - `enabled`：只接受 `reviewStatus: passed`、结构化 `reviewEvidence` 和 `reviewedSourceCommit`，且它们逐字段等于发布上下文。`sourceHead` 描述审查终点，manifest `sourceCommit` 描述合并后被主分支和 tag 指向的候选；核对 `sourceHead` 为候选 `sourceCommit` 的祖先，并确认审查后只改变两份冻结发布元数据；不要求线性历史或特定合并形态。
   - `disabled`：只有不存在安全、隐私、不可逆操作、对外兼容契约或产品/渠道审查硬要求时才接受 `reviewStatus: Not run`、非空 `reviewReason`/`reviewRemainingRisk`，并要求 `reviewEvidence` 与 `reviewedSourceCommit` 缺席。
6. E2E 为 `enabled` 或硬要求时调用 `$desktop-test-final-artifact-e2e`；含 GUI 且 `about_page = enabled` 时，必须从真实候选打开关于页和“更新日志”，对照已核验的候选资源确认当前版本、近十版、固定两类与单个小写 `v`，不能用注入数组或源码夹具代替；禁用时确认路由、入口与运行时命令缺席。E2E 为 `disabled` 时记录 `Not run` 和剩余风险。需要凭据、生产数据、支付、发布或不可逆副作用时仍须独立授权。
7. 全部真实检查、E2E 和必需人工结论完成后，先确定整组唯一结论，但在写入验收状态前再次运行发布上下文 `verify`；要求当前 HEAD、`releaseContextSha256`、`releaseReview` 与准入快照逐字段相等，且全部 manifest 的 `sourceCommit` 都等于 HEAD。三平台矩阵另复核远端小写 `release` 分支/tag；当前构建的 `e2eSelection` 和适用 `candidateSelections` 只与准入时已核验的构建证据比较，不能从发布上下文补取。然后重新计算全部最终制品、相邻摘要、manifest 声明、包内关键资源和 `release/` 精确集合。任一漂移都拒绝状态写入并返回重建/重验。

8. 只在以上尾检查通过后，于项目根同级、同一文件系统的唯一 staging 复制当前 `release/` 精确集合；在 staging 内原子写入全部 manifests 的同一整组 `milestoneAcceptance` 结论及结构化证据，再复算所有摘要、资源绑定和精确文件集。整组必须同为 `accepted`、`rejected` 或 `pending`，不得混合。复验成功后才目录级原子替换 `release/`；失败保留原集合。验收证据只写忽略的 `release/`，不得在 tracked 源码中补写项目记忆或占位记录。

   同一记录还必须包含 `reviewSelection`/`reviewStatus`、适用 `reviewEvidence` 或 `Not run` 原因/风险；macOS 候选必须核对 `macosSigningSelection`/`macosSigningSource`，多个来源按 `channel-required > requested > configured > not-requested` 唯一化，关闭时不得有探测派生证据或 `notarizationEvidence`，启用时只接受完整签名、公证和 stapling 证据。`system_notification = enabled` 的 macOS 候选若为 `disabled/not-requested` 或实际 unsigned，必须拒绝验收；这属于通知运行前提，不得由 E2E `disabled`、waiver 或 `Unverified` 绕过，也不得在验收阶段自动签名。

## 拒绝与修复

1. 产物缺失、不完整、不可运行、偏离批准场景，或任一必需/已启用检查失败、超时、取消或未执行时拒绝候选，并把证据按第 8 步随整组 `rejected` manifest 原子写入 `release/`；不得直接写 tracked `docs/verification/`。
2. 已批准范围内的实现偏差返回 `$desktop-implement-change` 修复并增加回归；该流程自动创建新开发分支，随后重新执行 Git 发布生命周期，形成新的 clean、被本地版本 tag 指向的默认分支 HEAD，再按独立构建请求生成完整候选。不得只重写 manifest。
3. 新产品边界转交 `$desktop-define-product`；破坏性操作或新的外部副作用必须请求批准。不得以 `Partially verified` 掩盖必需逻辑缺失。

## 结论

验收结论只能是以下三种之一：

- `Milestone accepted`：每个必需场景和已选门禁均通过；发布审查满足其 `passed`/`Not run` 契约；任何真正必需的人类签署已记录。
- `Awaiting human review`：自动证据通过，但必需人工结论尚未签署。
- `Milestone rejected`：一项必需条件失败，已记录修复回流路径。

`Awaiting human review` 保持整组 manifest `pending`；拒绝整组 `rejected`；只有接受才整组 `accepted`，并附 E2E、审查、冒烟、签名和适用公证证据。三种结论都必须走第 7/8 步的二次发布上下文/最终字节复算与 staging 原子替换。验收不授权创建或移动 tag、push、渠道发布、新签名、上传或额外清理。

### NSH 路由

根 Cargo `interfaces = ["nsh"]` 与 `nsh-targets` 独立使用 `$desktop-build-nsh-release`；旧 `interfaces = ["gui"]` 且 `gui-framework = "nsh"` 仅按既有工程读取。复用通用本地 Git 发布、版本、双语日志和 release 上下文。当前 helper 支持所选 desktop 原生包、Android 开发签名 APK、iOS 未签名设备 app/模拟器临时签名 app，以及 Web 完整静态目录，全部使用正式 0.4.0 固定 revision 与匹配 CLI。TUI 暂不可用，含 `tui` 的元数据、构建或候选请求失败关闭；历史预览程序或归档不能进入正式候选验收。正式 IPA 与渠道签名需要另行明确身份和官方流程。不得走 Tauri 前端/NSIS。本机不可构建目标如实阻断，不推断已验证。

NSH 最终候选证据在忽略的 release 批次目录，校验 manifest 列出的包、sidecar 日志和许可证字节及摘要；sidecar 不冒充内部资源。E2E 在最终包形成后使用真实目标宿主/设备或 Web 静态站点；每个目标独立取证，pending/Unverified 不能升级 accepted。初始化中性壳层测试不替代产品验收。

NSH 按每个目标独立复算 `manifest.json` 的 `artifact`、`checksum`、`files`、`sourceSnapshot`、`releaseNotesSha256` 和 `licenses`。新候选核对 `interface: nsh`、`nshTargets`、真实格式与签名状态；旧 GUI/NSH 候选按原 `guiFramework: nsh` 读取。`releaseNotesResourceVerification: sidecar-byte-identical` 只证明外层日志字节；选择桌面且启用关于页时，内容必须由真实窗口 E2E 观察。候选没有可证明的运行场景、目标宿主或必要渠道签名时维持 `pending`/`Unverified`，不签署 accepted。

NSH 验收开始前，依据当前构建返回的 `target` 与 `buildRun` 或用户明确提供的同一对值，精确选定一个 `release/<buildRun>/`；`buildRun` 本身须为 `nsh-<target>-<uuid>` 形式的完整目录名，不得再叠加目标前缀，不得选择名称像“最新”的目录、依赖 mtime 或把多个批次合并。要求规范项目根和 `release/`、批次均为普通非符号链接目录，批次名与其中唯一 `manifest.json` 的 `target`/`buildRun` 一致；该 manifest 的 `mode: candidate`、`sourceCommit`、发布上下文摘要、版本和选项须绑定当前本地主分支/tag/HEAD。仅枚举该批次的 manifest 声明文件、sidecar、校验和与验收证据，拒绝批次内部缺失、额外、重复或路径越界；其他批次可以保留不同 HEAD、版本或 `pending|rejected|accepted`，不参与本次判断。

第 7 步的二次上下文和最终字节复算只比较选定批次的当前证据；第 8 步在同一 `release/` 文件系统中为该批次建立唯一受限 staging，只复制该批次的精确集合并写入它自己的 `milestoneAcceptance` 与结构化证据。复算通过后以目录级原子重命名替换该批次，失败恢复原批次；其他批次逐字节保留。接受、拒绝或等待人工复核只改变本批次状态；就绪结论也只针对已选批次的目标和证据，不能由其他批次的 `accepted` 推断本目标通过。历史 TUI 本地预览始终不能被选择为正式候选。
