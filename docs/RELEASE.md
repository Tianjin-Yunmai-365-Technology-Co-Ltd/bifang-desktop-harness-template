# 版本与发布

## 当前状态

- 当前版本：[`Version.md`](../Version.md) 中记录的 `202609172303`（Released）
- 时间版本起始值：[`Version.md`](../Version.md) 中记录的 `202607301002`
- 模板版本事实来源：根目录 `Version.md`；本文件只维护版本与发布规则
- 下游 Rust 项目当前版本事实来源：根 `Cargo.toml` 的 `[workspace.package].version`；`.harness/version-state.json` 只保存正式发布周期、待发布变化和 `bug-fix` 稳定 ID 去重状态
- 发布渠道：待确定
- 发布物格式：待确定

## 版本规则

Harness 模板使用上海时区（`Asia/Shanghai`）的 12 位时间版本 `YYYYMMDDHHMM`：

- 版本值取项目负责人确认该版本时的本地年月日时分。
- 12 位数字按时间先后可直接排序；不包含秒、时区后缀或预发布后缀。
- 同一分钟内如需产生第二个不同版本，必须等待下一分钟，不得追加未约定字符。
- 不为任何更早标识保留兼容记录；当前版本就是唯一版本。
- Harness 时间版本一旦确认为 Released，必须在同一次原子变化中同步根 `Version.md`、README、最新 Product Spec 与本文件的当前版本镜像，并把本次发布源码已包含的 `required_version = pending` / “所需 Harness 版本 `pending`”记录物化为该版本；发布后产生的新变化继续保持 `pending`。提交前必须运行 `node scripts/validate_harness.mjs`，任一镜像或已登记发布记录未同步都不得提交版本变化。

下游产品使用无预发布/构建元数据的三段语义化版本，并由 `$desktop-manage-version` 执行以下确定性规则：

- 新生成的 Minor 与 Patch 使用 `0..99` 的 base-100 数位：Patch 从 99 再提升时进位 Minor 并归零，Minor 因功能提升或 Patch 进位越过 99 时进位 Major 并归零；例如 `0.0.99 -> 0.1.0`、`0.99.99 -> 1.0.0`。Major 不受 99/100 的业务上限约束，但必须处于 Cargo `u64` 范围 `0..18446744073709551615`；没有更高数位可承接的自动进位必须在写入前失败关闭。
- 显式 Major 只由用户决定是否提升及精确目标值。批准后写为 `N.0.0`，必须高于当前版本规范化后的 Major，并把该正式发布周期的首功能提升视为已经包含；Agent 不得推断。base-100 数值进位自然产生更高 Major 是自动版本计算的例外，不需要也不代表显式 Major 批准。
- 每个正式发布周期的第一个已完成新功能把当前版本提升一个 Minor 数位并把 Patch 归零，必要时按 base-100 进位 Major；同一周期后续功能只记录其所需版本，不再因功能重复提升。只有真实正式发布成功才解锁下一周期的首次功能提升。
- 每个具有新稳定 ID 的已完成问题修复或用户可感知优化统一使用机器分类 `bug-fix`，把 Patch 提升一个数位并按 base-100 自动进位；这一路径不受当前周期的功能提升锁影响。相同 ID 的重复处理、补充修改或重试不再提升；正式发布后确认的回归必须分配新的稳定 ID，才可提升。
- 查询、诊断、复现、未完成或重复处理，以及不改变可观察行为的重构、内部优化、测试补强、文档、格式和内部清理属于 `maintenance`，不提升任何版本；`check`、`plan` 和 `maintenance` 始终零写入。
- Minor/Patch 固定为 `0..99`，不兼容任何历史下位分量 `100`；Cargo、状态 `target_version` 或发布日志中任一出现 `100` 都由 `check`、`plan`、`apply` 与 `finalize-release` 一致拒绝，没有可读取的旧值例外，必须先手动修正到 `0..99` 才能继续。
- 版本只在合格变化已完成且本次相关测试通过后更新；普通构建、`pending` 候选、验收和失败发布只核对版本，不计算、不提升、不重置。
- 只有正式发布真实成功后，才清空待发布变化并开启下一功能周期；历史 `bug-fix` 稳定 ID 始终保留，以阻止同一 ID 在未来周期重复提升。

版本变化与 Changelog 写入是独立门禁。Product Spec、ADR、Changelog 或 Work Plan 只有按自身事件独立触发时，才记录相关稳定 `change_id` 及门禁返回的 `required_version`。版本提升不为普通缺陷修复、纯重构或其他排除项创建 Changelog/ADR；较早变化记录的是其最低所需版本，最终发布版本可以因后续合格变化更高。仅含 Changelog 排除项的候选仍必须具有版本、源码提交、原子候选清单、验收证据和适用人工签署；真实渠道发布成功后才在后续受管 feature 生命周期把这些事实追加为 tracked Verification/发布/Product Status 记录，缺少 Changelog 不削弱候选证据。

已发布版本不得静默覆盖。Harness 时间版本仍由用户决定；下游除 Major 以外的合格版本变化由上述门禁自动确定。版本门禁本身不执行发布；正式发布生命周期使用已经确定的版本创建规定的 Git tag。

## Git 发布生命周期与制品目录

项目根忽略的制品目录 `release/` 不是 Git 分支。新功能和独立 Bug 修复在首次写入前由 `$desktop-manage-git-lifecycle start` 自动创建本地 `feature-{ascii-kebab摘要}-{YYYYMMDD}` 分支；创建动作不要求远端。生命周期状态位于 Git common dir 的 `agent-first-harness/git-lifecycle.json`，当前 schema v2 只精确登记本次发布以来由 helper 创建或接管的分支、Worktree、适用的唯一主远端和可重试进度；pending/last release 保存 `gitPublication`、适用 remote 与 `releaseContextSha256`，pending 在任何 Git 发布副作用前落盘且 HEAD 冻结前可为 `null`，重试必须逐字段匹配。schema v1 不兼容且不自动迁移；既有合法 v2 状态缺少新增可空 `pendingPublish` 时按 `null` 兼容读取。状态不进入提交；未完成的 `publish` 才临时保存冻结 HEAD、有序目标和确认进度，全部确认后清除。

`--remote` 与 `state.remote` 始终表示唯一主远端。用户明确说“推送”时，helper 使用普通 merge 把登记开发分支合并到该远端的动态默认主分支，切换到主分支并推送、复读。只有用户对本次推送逐一明确授权其他已配置远端时，`publish` 才可重复接收 `--also-remote <name>`：首个 push 前解析全部目标及各自 advertised default branch，冻结合并后的同一最终 HEAD、目标顺序与确认进度，先推送并复读主远端，再按参数顺序非强制推送并逐个复读补充目标；每项确认后立即保存，全部确认才清除 `pendingPublish`。补充目标不 fetch、不 merge、不改绑，也不参与 release、tag 或清理。这次操作不创建 tag，也不清理分支或 Worktree；既有 `publish` 命令语义不因本地发布能力改变。

跨远端推送不是原子操作；后续目标失败时必须如实说明可能已经成功的前序范围、当前失败目标或阶段，以及后续目标可能尚未尝试，不能回滚或掩盖已经成功的远端。使用相同目标参数幂等重试时，只沿用 `pendingPublish` 中的冻结 HEAD 与进度，不重新解析默认分支、fetch、merge 或计算新 HEAD；已确认目标漂移会停止。push 非零退出只表示结果无法确认，除非远端复读已精确命中冻结 HEAD。流程不创建/配置远端或凭据。

用户明确说“发布”时，`$desktop-prepare-release` 先复用当前请求已经明确的选择，否则询问并锁定单次 `gitPublication: local | remote`；产品或渠道硬要求远端可获取源码或远程构建时必须选择 `remote`。随后提交源码/治理变化及已触发 Changelog 并锁定 `sourceHead`；在当前 HEAD 仍等于该值时生成双语 `release-notes.json` 与 `.harness/release-context.json`，再把且只把这两个文件放入同一个发布元数据提交。tracked 上下文记录 Git 发布位置、默认主分支和适用 remote，是 lifecycle 的唯一冻结选择；`release` 必须接收 `--release-context-sha256 <sha256>`。从关联 Task Worktree 发起时，先校验该调用 Worktree 当前 HEAD 中的上下文 blob 与 working bytes，再路由主 Worktree；任何 merge/fetch/push/tag 前继续核对摘要、version/date/expectedTag/defaultBranch/gitPublication/remote。整合得到 final HEAD 后、冻结 pending HEAD 或 push/tag 前，还必须确认 final HEAD 中同一路径 blob 的摘要未变。CLI 或上下文不一致零副作用失败，不能临时改变模式。`release` 不接受 `--also-remote <name>`，补充远端不参与 release、tag 或清理。

`gitPublication: local` 使用 `release --version <version> --date YYYYMMDD --release-context-sha256 <sha256> --local-only`，按以下顺序执行：

1. 普通合并全部登记开发分支，切换到本地默认主分支，把 final HEAD 写入 `pendingRelease.head`；不列举、fetch、push、复读或删除任何远端 ref。
2. 在当前主分支 HEAD 创建或复用轻量 tag `v{version}-{YYYYMMDD}`，日期取 `Asia/Shanghai` 自然日，并复读本地 tag。
3. 只有本地 tag 精确指向当前主分支 HEAD，才先删除状态登记的 Worktree，再删除对应本地分支；每项成功后立即保存进度，全部完成后清空本周期状态，并保持当前分支为主分支。

`gitPublication: remote` 使用 `release --version <version> --date YYYYMMDD --release-context-sha256 <sha256> --remote <remote>`，按以下顺序执行：

1. 首次执行只在本地 fetch 并普通合并主远端默认分支与全部登记开发分支；得到 final HEAD 后立即写入 `pendingRelease.head`，再推送并复读主分支。pending head 非空的重试绝不再次 fetch/merge 或吸收后来远端漂移，只重试同一固定 HEAD。
2. 在固定 HEAD 创建或复用同一轻量 tag，推送并复读主远端目标。
3. 只有主远端 tag 精确指向当前主分支 HEAD，才先删除状态登记的 Worktree，再删除对应主远端分支，最后删除对应本地分支。

同名本地 tag 等于当前 HEAD 时按幂等成功继续；远端模式还要求同名远端 tag 等于该 HEAD。任何同名目标不同或模式内 tag 门禁失败都停止且零清理。清理只接受状态精确登记的资源，禁止改变重试模式、按前缀或通配符扫描、强制删除 dirty Worktree，也不得删除主分支或未登记资源。部分清理中断后只继续同一模式与固定 HEAD 的未完成项。流程允许普通 merge commit，不设置保护分支、严格线性、active leaf、单写入者、fast-forward-only、lease、atomic push、审查路径白名单或其他分支门禁，也不存在任何发布中转分支及其识别、迁移、兼容或清理逻辑。

## 用户可见版本与更新日志

- Windows 原生本地安装试包不是发布候选，不进入本文件的更新日志、clean HEAD、manifest、E2E、签名或 `release/` 门禁。普通“构建/打包/首次安装试一下”由 `$desktop-build-tauri-local-install` 处理；只有用户明确要求发布候选或准备发布，才适用下列规则。该试包仍须明确标注未签名、未安装、未验收且不可分发。
- Harness 源正式发布同样使用根 `release-notes.json` 记录近 5 个模板版本的双语维护摘要，但它只是源码发布元数据，不是产品资源、候选 manifest 或产品验收证据。
- 所有面向用户显示的版本号统一使用且只使用一个小写 `v` 前缀，包括 GUI 页面、窗口标题、更新状态、强更提示、CLI `--version`、发布记录和更新日志。Cargo、`.harness/version-state.json`、候选 manifest 的机器版本字段、协议比较值和 SemVer 运算继续保存不带 `v` 的原始版本；展示边界负责先移除已有任意 `v`/`V` 前缀，再规范化为 `v<version>`。
- 下游在准备首个正式发布时创建根 `release-notes.json`。它是发布制品固定携带、并在 `about_page = enabled` 时由应用关于页通过固定 `load_release_notes` 窄命令复用的用户更新日志事实，使用整数 `schemaVersion: 2` 与非空、按最新在前的 `releases` 数组；每项字段固定为 `releaseDate`、带一个 `v` 的 `version`、`featureOptimizations` 和 `bugFixes`。两个分类中的每个逻辑条目都是键恰好为 `zh-CN` 与 `en-US` 的翻译对，两个值都必须是非空、无首尾空白且无边界 BOM 的字符串；任一翻译缺失或重复 JSON 字段都阻断。只读 `check` 必须拒绝需静默规范化的原文件，写入和读取均拒绝超过 1 MiB 的 UTF-8 资源，与关于页运行时上限一致。所有 GUI 初始化预置但不在调试构建使用 `src-tauri/tauri.release.conf.json`；正式候选构建显式 `--config` 合并该文件，把根日志唯一映射为候选逻辑资源 `release-notes.json`。
- 每次正式发布时，必须找到上一次真实正式发布的版本与 40 位源码提交；从该提交之后到当前发布源码的真实差异中语义筛选最重要内容，不得直接倾倒提交标题。首个正式发布以仓库起点到当前发布源码为范围。每版“功能优化”和“问题修复”各自最多 10 个逻辑条目，两类合计至少一条；每个条目同时提供中文与英文。Agent 可先整理其中一种语言并自动翻译另一种，但在写入前必须并排复核两种语言的语义对应关系。普通缺陷修复即使不触发按日 Changelog，也进入本次“问题修复”。终端下游随后把同一日志写入产品候选；Harness 源只把它作为 Git 源码发布元数据。
- 更新当前版本时先替换同版本条目，再置顶并截断为最近 5 个版本。使用 `$desktop-prepare-release` 携带的 Node 标准库脚本执行 `node .agents/skills/desktop-prepare-release/scripts/release_notes.mjs upsert ...`，通过配对的 `--feature-optimization-zh-cn`/`--feature-optimization-en-us` 与 `--bug-fix-zh-cn`/`--bug-fix-en-us` 按出现顺序传入每个翻译对，再运行更新日志脚本的 `check --expected-version` 校验，并分别运行 `render --locale zh-CN` 与 `render --locale en-US` 复核可见结果。文件是普通非符号链接 UTF-8 JSON，由脚本在同目录原子替换；Harness 升级将其视为 `protected`。
- 发布脚本的 `render` 命令按 locale 使用以下两套固定纯文本结构，供发布前复核；版本必须已经规范化为一个 `v` 前缀，空分类分别显示“无”或“None”，不得制造虚假条目。GUI 使用普通本地化标题，并以安全 Markdown 展示每条正文；当前语言以 `zh` 开头时选择 `zh-CN`，其他或未知语言回退 `en-US`——`release-notes.json` 目前只提供这两套翻译，`zh-TW`/`zh-HK`/`zh-Hant` 等其他中文变体按设计并入 `zh-CN` 内容而非另行回退英文，此为当前双语范围下的既定简化，不是未定义行为：

```text
-----------更新日志 {发布日期} {发布版本}----------

###功能优化

{不超过 10 条最重要优化内容}

###问题修复

{不超过 10 条最重要修复内容}
```

```text
-----------Release notes {release date} {release version}----------

###Feature optimizations

{up to 10 most important improvements}

###Bug fixes

{up to 10 most important fixes}
```

- `release-notes.json` 与 `docs/changelog/` 职责独立：前者是每次正式发布都必须更新的近五版双语摘要；终端下游还把它用于产品展示/打包，Harness 源只把它作为源码发布元数据。后者仍只记录其事件规则允许的按日项目变化。更新日志一旦变化就必须重新提交；终端下游的候选字节也随之变化，必须重新构建并验收，不能在候选 `accepted` 后原地修改；Harness 源则重新复核 Git 源码发布，不创建虚假候选。

## 发布物命名

Harness 模板只有在用户另行明确要求源码归档时才生成，命名使用：

`agent-first-harness-template-vYYYYMMDDHHMM.扩展名`

下游可执行产品在确定产品名和平台后使用：

`产品名-vMAJOR.MINOR.PATCH-平台-架构.扩展名`

Harness 源码归档只生成相邻 `<artifact>.sha256` 并核对归档来源提交、摘要与两份根许可证；它不是产品候选，不创建或套用产品 manifest。终端下游实际生成产品归档或安装包时同时生成相邻的 `<artifact>.sha256` 和 manifest。`pending` 产品候选清单至少包含项目、版本、批准的 40 位源码提交、预期 Git tag、发布上下文 SHA-256、明确的构建/运行身份、构建模式、平台、架构、目标、宿主、产物名、SHA-256、全量单元测试结果、当前 `e2eSelection`、当次 `reviewSelection: enabled | disabled`、对应 `reviewStatus: passed | Not run`、`releaseNotesVersion`、`releaseNotesSha256`、`releaseNotesPath: release-notes.json`、签名证据和 `milestoneAcceptance: pending`。`gitPublication` 由发布上下文统一保存和校验：`local` 只允许当前宿主本地候选，`remote` 才允许远程跨平台 provider 路线。发布审查启用时必须有结构化 `reviewEvidence` 并绑定当前发布上下文和源码 HEAD；关闭且无硬要求时必须记录非空 `reviewReason`、`reviewRemainingRisk` 并让 `reviewEvidence` 缺席。所有 Tauri GUI 清单还固定记录产品/发布事实 `updaterEnabled` 和实际 updater plugin/Tauri 版本：官方 updater Rust 插件是无条件安装基线，不受该布尔值或关于页控制；`false` 时插件与 `NotConfigured` 零出站回归仍保留，但 updater archive、`.sig` 和制品签名字段必须缺席，`bundle.createUpdaterArtifacts` 不得启用；`true` 时才要求受限 HTTPS endpoints、公钥、channel/target/arch、安全私钥来源、官方 updater archive/`.sig` 与应用公钥实际验签证据。macOS 安装包另记录 `macosSigningSelection: enabled | disabled` 与 `macosSigningSource: configured | requested | channel-required | not-requested`：只有已批准的持久签名/公证配置、本次用户主动要求或渠道硬要求才启用；本机恰好存在身份、工具或凭据不得自行启用。

候选构建在清理目录、测试或编译前，以及写 manifest 前，都必须只读校验 `.harness/release-context.json`。两次读取的文件 SHA-256、`sourceCommit`、`expectedTag`、`gitPublication`、`releaseReview` 和 `candidateSelections` 必须逐字段一致，并证明当前 clean 默认主分支与本地 tag 都指向同一 HEAD；`remote` 模式才额外要求远端主分支和远端 tag 一致，`local` 模式不得访问远端且只允许当前宿主本地候选。manifest 的审查证据或 `Not run` 原因/风险以及 macOS 签名选择/来源都从上下文原样复制，不得从对话补写或重新解释。E2E 仍在构建阶段按当前候选单独解析。

## 许可证与第三方声明

- Harness 源码归档必须包含根目录 `LICENSE.zh-CN.md` 与 `LICENSE.en.md`。
- 每个下游源码归档、安装包或其他分发物必须以适合其载体且用户可访问的方式携带两份企业专有商业许可证；两份许可证的适用项目名必须等于当前发布产品名，不得残留 Harness 身份，也不得因改名、打包、签名或商店分发而删除、摘要或弱化其他条款。
- 实际分发前必须生成并核对该版本的第三方依赖许可证与 NOTICE 清单。本项目的专有商业许可不替代、覆盖或限制第三方许可证依法授予的权利。
- 商业合同或订单负责确定客户、费用、期限、授权数量和特殊授权；发布物中的通用许可证不得被误报为双方已经签署的商业文件。

所有下游构建结果统一写入项目根 `release/`。该目录由初始化以精确 `/release/` 规则忽略，是“本次构建结果目录”而非历史归档或 `ready` 标志。每次构建在任何单元测试或构建命令前，必须验证规范化后的独立 Git 根目录，拒绝 `release` 符号链接/重解析点和路径越界，把旧目录原子移入同文件系统隔离位置，创建并复核全新空 `release/`，再只删除隔离旧树；不得通过活动目标目录原地递归删除。完成签名、公证与 stapling 后的最终归档或安装包、校验和与清单先在同根唯一暂存区中形成并验证精确的普通文件集合，再删除仍为空且不是重解析点的 `release/`，通过目录级原子重命名，将完整暂存区提交为 `release/`，并复核最终路径和文件集。只有 `gitPublication: remote` 可使用远程工作流；它必须检出并复核显式批准的 40 位提交，且每个运行器只能上传清单声明的三个精确路径。`local` 只形成当前宿主本地候选。结果取回不得依赖含糊提供方“最新”结果或修改时间，不得混入其他项目、旧版本、旧运行、未完成、重复、额外或来源不明文件。`release/` manifest 状态只使用 `pending`、`rejected` 或 `accepted`；`ready` 只是对完整 `accepted` 原子集合的纯只读就绪复核结论，不写回 manifest。

构建请求、执行、成功、失败、重试、全量单元测试结果、产物路径/摘要/签名状态，以及候选 E2E、完整验收、状态更新和就绪复核，都不创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan、Verification 或其他 tracked 项目记忆。候选流程只把这些事实写入忽略的 `release/` 原子集合、manifest 声明的相邻制品证据和最终回复；本地开发试包只写最终回复，不创建 manifest。不得把构建或验收日志复制到项目记忆。真实渠道发布成功后，发布执行方才从已发布且带版本 tag 的默认主分支开始下一次开发生命周期，追加 Verification/发布/Product Status 记录并执行版本周期 finalize；独立回顾性人工复核或长期审计不得反向批准活动候选。

发布审查启用时，manifest 另记录 `reviewedSourceCommit`，并要求它逐字段复制 `.harness/release-context.json` 的 `releaseReview.reviewedSourceCommit`，且该值等于上下文 `sourceHead`；最终构建 HEAD/manifest `sourceCommit` 是发布元数据提交和普通合并完成后由主分支与 tag 指向的候选提交，两者不要求相等，也不施加祖先或线性历史门禁。关闭审查时 `reviewedSourceCommit` 与 `reviewEvidence` 一并缺席。发布上下文只保存选择和结果，不设置审查后路径白名单。

## 构建、完整验收与发布顺序

E2E 选择只对终端下游发布候选有效；每次候选构建独立解析，当前请求未明确时询问一次，持久建议值不能静默代替。`gitPublication` 与 `reviewSelection` 只由 `$desktop-prepare-release` 在发布写入前解析：当前请求已明确时复用，否则分别询问一次；产品/渠道要求远端源码或远程构建时强制 `gitPublication: remote`，安全/隐私/不可逆操作/对外兼容契约或产品/渠道审查硬要求强制启用审查。同一发布修复重跑复用，新发布重新询问。prepare-release 首先以根 `Version.md` 和活动 `.agents/skills/desktop-instantiate-project/SKILL.md` 同时存在来识别 Harness 源；Harness 的 macOS 签名选择/来源固定为 `not-applicable`，不询问产品候选选择。终端下游 GUI 才按当前请求、产品事实与渠道要求锁定 macOS 签名选择；默认 macOS 签名为 `disabled/not-requested`，不运行可用性探测，只有已批准配置、本次主动要求或渠道硬要求才启用。`system_notification = enabled` 与关闭签名冲突时必须在任何提交前停止，不能由 E2E `disabled` 掩盖。prepare-release 将 Git 发布位置、结构化审查结论或 `Not run` 风险及候选选择写入 `.harness/release-context.json`；下游候选构建一律从带预期本地 tag 的 clean 默认主分支只读验证并消费，远端模式再复核远端 refs，本地模式不访问远端且只允许当前宿主候选。缺少当前上下文或入口条件时只报告候选未就绪。下游候选构建必须运行项目全部非空单元测试，失败或零测试时不得形成候选。明确“构建发布候选”“发布”或“准备并构建发布”请求本身授权本次适用的提交、普通 merge、主分支切换、版本 tag 创建和登记资源清理；仅 `gitPublication: remote` 授权主分支/tag push、远端复读和主远端分支清理。终端下游还授权适用候选构建，Harness 源则在 Git 发布与复核后结束且不创建产品候选。普通开发构建/本地试包不升级为候选，也不提交、推送或修改主分支。上传、商店提交和真实渠道发布仍需各自授权。

macOS 签名选择也在该入口按当前请求、产品事实与渠道要求锁定；本句只适用于终端下游，Harness 的对应值固定为 `not-applicable`。

步骤 1–2 是 Harness 源与终端下游的正式 Git 发布共享流程；Harness 在步骤 2 完成并复核 Git 引用后结束。步骤 3–7 仅适用于终端下游产品候选，Harness 不得进入这些构建、manifest、E2E、签名或验收步骤。

1. 明确正式发布请求后，`$desktop-prepare-release` 先判定 Harness 源或终端下游，并在任何写入前解析本次 `gitPublication` 与 `reviewSelection`；Harness 将产品候选的 macOS 签名选择固定为 `not-applicable`，终端下游目标含 macOS GUI 时再锁定 `macosSigningSelection`/来源。随后只读执行工作树、范围、缓存、疑似秘密和提交完整性检查。归属明确的已完成源码及本次独立事件已触发的 Changelog 必须在同一源码/治理提交中完成；无关/歧义改动、秘密、hook/签名交互或提交失败立即停止，禁止 `--no-verify`。clean 且无源码变化时不制造空提交。该提交完成后的 HEAD 锁定为 `sourceHead`，此后不得补写 Changelog。`reviewSelection: enabled` 时对上次正式发布 tag 到 `sourceHead` 的累计差异执行一次集中语义审查，发现问题回到当前开发分支修正；`disabled` 且无硬要求时显式形成 `Not run`、原因和风险。这里不检查或限制分支名称、父子形态、merge commit 或主分支写入历史。
2. 从 `sourceHead` 定位上一次真实正式发布边界，生成双语 `release-notes.json`，但先不提交；只有当前 HEAD 仍精确等于 `sourceHead` 时才能写入 `.harness/release-context.json`，其中包含 `gitPublication`、当前版本、上海日期、预期 tag、默认主分支、适用 remote、`sourceHead` 和审查/候选选择。随后把且只把 `release-notes.json` 与 `.harness/release-context.json` 作为同一个精确范围的发布元数据提交，不得混入 Changelog、源码或其他治理文件。两种模式都把精确 `--release-context-sha256 <sha256>` 传给 lifecycle，并在任何副作用前验证上下文与 CLI。远端模式调用 `release ... --release-context-sha256 <sha256> --remote <remote>`：首次只在本地 fetch/整合，冻结 final `pendingRelease.head` 后才允许主分支/tag push 与远端复读，之后按 Worktree、主远端分支、本地分支清理；pending head 非空重试只续跑同一固定 HEAD。本地模式调用 `release ... --release-context-sha256 <sha256> --local-only`，完全不访问远端，在本地 tag 复读后按 Worktree、本地分支清理。最终必须位于 clean 默认主分支，本地主分支和本地 tag 等于同一 40 位 `sourceCommit`，远端模式还要求远端主分支/tag 一致，发布上下文复算通过；`sourceHead` 保持源码/治理及审查输入身份，不要求等于 `sourceCommit`。Harness 至此结束本次正式源码 Git 发布。
3. 从上述 clean 默认主分支在清理目录、测试前只读校验发布上下文和模式适用的 tag/refs，消费其中的 Git 发布位置、审查与 macOS 签名选择，运行版本/更新日志/资源配置检查并只另外解析当前 E2E 选择，再运行项目全部非空单元测试。本地模式只允许当前宿主本地候选，远程跨平台 provider 只接受远端模式。
4. Rust CLI 默认走三平台原生矩阵；Tauri GUI 生成适用 DMG/NSIS，每个候选打入同一更新日志并逐字节比较。macOS 默认 `macosSigningSelection: disabled` 并直接使用 `--no-sign`，不探测本机身份或公证凭据；只有已批准持久配置、本次主动要求或渠道硬要求才启用并探测，启用后签名、公证、stapling 全有或全无，失败不得降级。`system_notification = enabled` 与 unsigned 的冲突按入口规则提前阻断，不得把通知已知不可用的包写成候选。任何路径都不得自动创建、索取或输出凭据。
5. `$desktop-verify-delivery` 在准入时和写最终验收状态前两次只读核对当前 clean 默认主分支、本地 tag、发布上下文与全部 manifest，并仅在 `gitPublication: remote` 时核对远端主分支/tag；对最终候选执行冒烟、当前 E2E 选择和产品/渠道硬要求后，再重新计算所有候选文件、相邻证据、资源和 manifest 声明的最终字节。发布审查关闭时确认 `Not run` 原因/风险且无证据，启用时确认累计差异证据绑定同一发布提交。任一字节、tag 或发布上下文在执行期间漂移都拒绝候选；只有全部复核通过，才在仓库外同文件系统暂存完整集合并以目录级原子替换一次性把所有 manifest 从 `pending` 更新为 `accepted`，不得逐文件暴露混合状态。
6. 所有 required/enabled 检查和本次候选需要的人工签署完成后才形成上述 `accepted` 原子集合；这些证据仍只存在于忽略的 `release/` 与最终回复。就绪复核是纯只读操作：检查当前分支为默认主分支、本地主分支/tag 与候选 `sourceCommit` 相同，远端模式再核对远端 refs，并验证版本、更新日志、选择/状态、最终哈希和签名一致，不得再改 manifest 或写 tracked 项目记忆。真实渠道发布成功后，才从该已发布且带 tag 的主分支开始下一次开发生命周期，追加 Verification/发布/Product Status 记录并以精确已发布版本和 40 位源码提交执行 `$desktop-manage-version finalize-release`。
7. 更新日志、签名、公证、stapling、重打包或渠道处理若改变运行字节、启动器、依赖或行为，结果成为新候选并回到步骤 3；所有旧验收证据都不得复用。渠道处理若在发布前改变字节，禁止先写 tracked 发布记录或 finalize。

## Harness 模板发布检查清单

本清单只在用户明确准备 Harness 发布时执行。日常开发只运行本次必要单元/回归测试；纯文档、元数据、格式与不可合理单测的机械变更只做最小解析或差异检查。正式源码发布必须重新复核累计差异、必要测试、发布上下文、本地 Git 引用和模式适用的远端引用，日常检查结果不能直接冒充该结论。

模板自身无应用代码，不使用下游的编译、单元测试、CLI 和二进制冒烟门槛。模板发布必须满足：

- [ ] 产品规格状态为 Approved。
- [ ] README、AGENTS、所有已触发的项目记忆文档和全部声明的项目 Skills 完整存在。
- [ ] `node scripts/validate_harness.mjs` 成功，且输出对应当前发布源码；当次 `reviewSelection: enabled` 时另执行 `node scripts/validate_harness.mjs --release-review` 并处理其集中提示，关闭时不得把提示伪装为已运行。
- [ ] 发布元数据写入前，当前 HEAD 精确等于包含全部源码/治理变化及已触发 Changelog 的 `sourceHead`；`releaseReview.reviewedSourceCommit` 绑定该 `sourceHead`。随后同一个精确发布元数据提交且只包含 `release-notes.json` 与 `.harness/release-context.json`。
- [ ] 生命周期完成后再次复算发布上下文字节与 SHA-256；最终 `sourceCommit`、clean 默认主分支和本地 `expectedTag` 一致，`gitPublication: remote` 时远端主分支/tag 也一致，`local` 时没有远端访问。`sourceHead` 仍是元数据提交前的审查输入，不要求等于 `sourceCommit`。
- [ ] Rust 初始化中性资产通过当前系统的格式、代码规范检查和非空测试；它是脚手架资产而非产品候选，不用冒烟证明产品交付。
- [ ] Rust 初始化中性资产在声明的最低 Rust 版本 1.98.1 上完成可用工具链验证；这不限制开发或运行环境使用更高稳定版。
- [ ] 候选工作流示例（`.agents/skills/desktop-prepare-cross-platform-release/assets/github-release-candidate.yml`，下游部署到 `.github/workflows/release-candidate.yml`）通过静态检查，只接受 `gitPublication: remote`，且只读检出发布上下文已批准的带远端 tag 提交，不自行修改 ref、创建 tag 或执行渠道发布。
- [ ] Harness 时间版本、下游自动版本 Skill/状态保护、Rust 默认值、四类独立适配器、默认 CLI、Agent 策略、构建 E2E 选择和验收适用性在事实来源中一致。
- [ ] Harness 源发布未冒充产品候选：产品构建、`release/` manifest、签名、公证、产品 E2E 与产品人工验收均为 `Not applicable`；只有用户另行明确要求源码归档时才生成并核对归档与相邻 `.sha256`，不创建产品 manifest。
- [ ] 若本次源码发布包含符合 Changelog 规则的变化，`Version.md` 与对应按日变更记录汇总的版本一致；否则已确认本次源码发布仅含 Changelog 排除项。本地 tag `v{版本}-{YYYYMMDD}` 已由正式发布生命周期创建并精确指向最终 `sourceCommit`；远端模式还复核同名远端 tag，源码归档只有实际生成时才核对。
- [ ] 若本次源码发布包含符合 Changelog 规则的变化，`docs/changelog/` 的日期文件中存在对应版本条目；仅含普通缺陷修复或纯重构时本项为 `Not applicable`，且未制造空记录。
- [ ] README 包含真实用途、维护状态和反馈入口。
- [ ] 若生成源码归档，其来源提交和 SHA-256 已记录。
- [ ] 已知重要问题已在 `docs/TECH_DEBT.md` 中公开。

Harness 根目录没有具体产品，因此下游产物、manifest、签名、公证、产品 E2E 与产品人工验收门槛不适用于模板源码发布，也不得为满足清单而创建虚假 `release/` 候选。Skill 中的 Rust 中性资产有独立的格式、代码规范检查和非空测试门槛，但不得把脚手架构建或启动冒烟当作产品验收。模板未来在根目录加入可执行产品时，应重新通过范围闸门并定义真实候选验收。

## 下游项目发布检查清单

本清单只接受已通过完整验收的真实候选。日常开发只运行本次必要单元测试；显式构建运行项目全部非空单元测试，E2E 只在最终候选形成后按当前选择执行。

- [ ] 项目根是独立 Git 顶层目录，工作树干净，当前发布源码已有 40 位提交；manifest `sourceCommit` 精确等于实际构建 HEAD，父仓库、尚无提交或未记录修改不得替代发布源码身份。
- [ ] 构建 HEAD 位于上下文默认主分支且本地 `v{版本}-{YYYYMMDD}` 等于 manifest `sourceCommit`。`gitPublication: local` 在本地 tag 复读后按 Worktree、本地分支清理且无远端访问，只形成当前宿主候选；`remote` 还要求远端主分支/tag 一致，并在远端 tag 复读后按 Worktree、主远端分支、本地分支清理。两者均未按前缀扫描或删除链外资源。
- [ ] 产品规格状态为 Approved。
- [ ] 中性 `scaffold status` 已由获批的真实业务命令和测试删除或替换，不再返回 `productDefinitionRequired=true`。
- [ ] 不存在已知未实现逻辑或未修复行为偏差；若用户要求的活动 Work Plan 存在，相关 Todo 全部为 `done`。
- [ ] 候选是完整、可运行、符合批准场景的真实产物，不是模拟实现、测试替身、占位、脚手架或开发预览。
- [ ] 当前构建的编译、项目全部非空单元测试、必要集成/契约和产物存在性均有通过证据。
- [ ] 单元测试覆盖核心成功路径和最高风险失败路径。
- [ ] 若选择 CLI，其统一 JSON 信封、错误结构、输出流和退出码契约验证通过；未选择时明确为不适用。
- [ ] Windows、macOS、Linux 各平台的实际验证状态已公开；未运行的平台明确标记为 `Unverified`。
- [ ] 适用的人类最终复核身份、日期和结论已绑定当前候选字节写入 `release/` 声明证据；候选阶段未写 tracked `docs/verification/human_review.md`。
- [ ] `$desktop-manage-version check --phase release` 通过，根 Cargo、`.harness/version-state.json` 目标、候选 manifest 与软件显示一致；本检查没有提升版本、重置周期或把候选版本回写到 tracked 项目记忆，既有项目记忆仍只遵循各自独立触发条件。
- [ ] 根 `release-notes.json` 已在候选构建前按上次正式发布提交到当前源码的差异更新；最新条目匹配当前版本，只保留近 5 版且每版两类各不超过 10 条，文件摘要和包内路径与 manifest 一致。
- [ ] 版本事实来源、软件显示、发布物名称和本地 tag 一致；所有用户可见版本只带一个小写 `v`，机器版本事实保持原始值；tag 精确为 `v{版本}-{YYYYMMDD}` 并指向候选 `sourceCommit`，远端模式还要求同名远端 tag，任一适用引用缺席或漂移都阻断候选。
- [ ] `$desktop-rename-project-identity` 残留扫描确认发布配置、Skills、文档、维护路径和两份许可证中没有旧产品身份。
- [ ] 候选包含符合 Changelog 规则的变化时，`docs/changelog/` 的日期文件中存在对应版本条目；仅含普通缺陷修复或纯重构时本项为 `Not applicable`。
- [ ] README 包含真实的用途、使用方式、维护状态和反馈入口。
- [ ] 发布物来自目标源码提交，且其 SHA-256 已记录。
- [ ] 每个平台归档、相邻 SHA-256 和清单一致，必需平台/架构恰好出现一次。
- [ ] GUI 正式构建使用发布专用 `--config`，构建后资源与根更新日志逐字节一致；macOS 最终 DMG 内唯一 `.app/Contents/Resources/release-notes.json` 已重新比较。含 GUI 且 `about_page = enabled` 时，关于页“检查更新”旁存在元素自身绑定的“更新日志”按钮，能够经固定资源命令查看近 5 版 schema v2 双语日志，中文/英文 locale 分别显示对应标题与正文、未知语言回退英文，加载失败可重试，且点击更新区父容器不会代理任一按钮动作；`about_page = disabled` 时页面、入口、命令、加载器与弹窗缺席，但固定 updater Rust 插件、`UpdateController` 和 `NotConfigured` 零出站基线仍存在。GUI manifest 始终记录 `updaterEnabled` 与 updater plugin/Tauri 版本；`false` 时无 updater archive/`.sig`/制品签名字段，`true` 时官方制品、配置和实际验签证据完整。
- [ ] 项目根 `release/` 已由 `$desktop-build-rust-release` 或 `$desktop-build-tauri-release` 在构建前安全刷新，并在本机构建或 `$desktop-collect-release-artifacts` 取回后只包含当前版本、源码提交和明确的构建批次候选；目录内容与清单精确一致且无历史文件。
- [ ] 每个平台清单的 `signingStatus` 与证据真实；macOS 同时记录签名选择和来源，`disabled/not-requested` 未运行可用性探测并显式 unsigned，只有 `configured`、`requested` 或 `channel-required` 才允许启用；已签名候选同时具有 `notarizationStatus: notarized-and-stapled` 和可复核证据。若 `system_notification = enabled`，本项同时拒绝 `disabled/not-requested` 或实际 unsigned，且不能由 E2E 关闭绕过。验收后若签名、公证、stapling 或重打包改变字节则已重新验收。
- [ ] macOS 多个签名启用来源同时存在时按 `channel-required > requested > configured > not-requested` 记录唯一 `macosSigningSource`；`disabled/not-requested` 的 `notarizationEvidence` 与探测派生签名证据缺席，通用 `signingEvidence` 只记录选择、来源、unsigned 结论和风险。
- [ ] macOS DMG 的最终签名/公证/stapled 字节已通过只读 Finder 布局检查；`.DS_Store`、本地背景、唯一 `.app` 与 `/Applications` 拖拽目标均真实存在，任何布局补写或重打包后已重做签名、公证、摘要和验收。
- [ ] macOS→Windows Tauri 候选只包含 x64 NSIS，清单记录 `buildMode: cross-compiled-xwin` 和 `runtimeVerification: Unverified`；未在真实 Windows 环境运行时没有声称原生验证通过。
- [ ] 完整验收根据候选冒烟策略、当前构建 E2E 选择、产品/渠道硬要求和适用性执行检查；所有 `required` 或 `enabled` 项通过，`disabled`/`Not run`/`Not applicable` 项及风险准确记录。
- [ ] 任一验收失败都曾返回开发循环并完成回归测试，没有以 `Partially verified` 代替仍缺失的批准逻辑。
- [ ] 已知重要问题已在 `docs/TECH_DEBT.md` 中向用户公开。
- [ ] 发布执行方已声明只有真实渠道发布成功后才从已发布且带版本 tag 的默认主分支开始下一次开发生命周期，以精确版本和 40 位发布源码调用 `finalize-release --release-succeeded` 并追加 tracked 记录；失败、取消、候选、tag 或上传尝试均不会重置版本周期。

Rust 下游项目默认使用 `docs/RUST_CLI_TEMPLATE.md` 中记录的工作区命令和发布产物布局；只有真实文件和命令存在后才能写入候选证据，tracked 验证记录仍须等真实渠道发布成功或独立回顾审计触发。候选矩阵生成不等于真实渠道发布；构建请求只允许使用已配置且已授权的签名条件，不授权创建凭据、GitHub Release、向软件包仓库发布或上传。

GUI 的本地生产构建和产物存在检查可在批准渠道允许时使用显式 `unsigned` 候选；完整验收执行启动冒烟时必须准确记录该状态。macOS 直接分发默认不签名、不公证并且不探测本机可用条件；只有已批准持久配置、本次用户主动要求或渠道硬要求时，才启用 Developer ID 签名、公证和 stapling，并且三者必须作为不可降级的完整阶段完成。App Store、Microsoft Store、要求避免 Windows SmartScreen 警告的下载渠道或 Tauri 更新器仍按各自真实渠道要求完成签名/公证/更新签名前不得宣布渠道发布就绪。Linux 普通部署不因缺少签名自动失败，除非项目批准的渠道另有要求。

## 发布记录模板

- 版本：Harness 使用 `vYYYYMMDDHHMM`；下游默认使用 `vX.Y.Z`
- 日期：YYYY-MM-DD
- 源码提交：待填写
- 发布物：待填写
- SHA-256：待填写
- 验证记录：`docs/VERIFICATION.md` 索引的对应证据卷条目
- 人工复核：复核人、日期和结论
- 已知问题：待填写
- 不适用项及理由：待填写
