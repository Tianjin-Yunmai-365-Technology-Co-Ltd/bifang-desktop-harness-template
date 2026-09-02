# 版本与发布

## 当前状态

- 当前版本：[`Version.md`](../Version.md) 中记录的 `202609020957`（Released）
- 时间版本起始值：[`Version.md`](../Version.md) 中记录的 `202607301002`
- 旧版本标识：[`Version.md`](../Version.md) 中记录的 `1.0.0`
- 模板版本事实来源：根目录 `Version.md`；本文件只维护版本与发布规则
- 下游 Rust 项目当前版本事实来源：根 `Cargo.toml` 的 `[workspace.package].version`；`.harness/version-state.json` 只保存正式发布周期、待发布变化和缺陷 ID 去重状态
- 发布渠道：待确定
- 发布物格式：待确定

## 版本规则

Harness 模板使用上海时区（`Asia/Shanghai`）的 12 位时间版本 `YYYYMMDDHHMM`：

- 版本值取项目负责人确认该版本时的本地年月日时分。
- 12 位数字按时间先后可直接排序；不包含秒、时区后缀或预发布后缀。
- 同一分钟内如需产生第二个不同版本，必须等待下一分钟，不得追加未约定字符。
- `1.0.0` 只作为迁移前旧版本标识保留，不再用于新的 Harness 版本。

下游产品使用无预发布/构建元数据的三段语义化版本，并由 `$desktop-manage-version` 执行以下确定性规则：

- MAJOR、MINOR、PATCH 都支持闭区间 `0..100`；任何下一值将超过 100 时停止并询问用户，绝不自动进位。
- MAJOR 只由用户决定是否提升及精确目标值。批准后写为 `N.0.0`，必须高于当前 Major，并把该正式发布周期的首功能提升视为已经包含；Agent 不得推断。
- 每个正式发布周期的第一个已完成新功能把当前版本提升为 `MAJOR.(MINOR+1).0`；同一周期后续功能只记录其所需版本，不再因功能重复提升。Minor 提升总是把 Patch 归零。
- 每个具有新稳定缺陷 ID 的已完成缺陷修复把 Patch 提升 1。相同缺陷 ID 的重复处理、补充修改或重试不再提升；正式发布后确认的回归必须分配新的回归缺陷 ID，才可提升。
- 缺陷查询、诊断、复现、未完成或重复修复尝试，以及不改变需求/修复结果的重构、测试补强、文档、格式和内部清理不提升任何版本。
- 版本只在合格变化已完成且本次相关测试通过后更新；普通构建、`pending` 候选、验收和失败发布只核对版本，不计算、不提升、不重置。
- 只有正式发布真实成功后，才清空待发布变化并开启下一功能周期；历史缺陷 ID 始终保留，以阻止同一 ID 在未来周期重复提升。

版本变化与 Changelog 写入是独立门禁。Product Spec、ADR、Changelog 或 Work Plan 只有按自身事件独立触发时，才记录相关稳定 `change_id` 及门禁返回的 `required_version`。版本提升不为普通缺陷修复、纯重构或其他排除项创建 Changelog/ADR；较早变化记录的是其最低所需版本，最终发布版本可以因后续合格变化更高。仅含 Changelog 排除项的发布仍必须具有版本、源码提交、候选清单、Verification 和适用人工复核，缺少 Changelog 不削弱发布证据。

已发布版本不得静默覆盖。Harness 时间版本仍由用户决定；下游除 Major 以外的合格版本变化由上述门禁自动确定。版本门禁不授权创建标签、移动 `Unreleased` 条目或正式发布。

## 用户可见版本与更新日志

- 所有面向用户显示的版本号统一使用且只使用一个小写 `v` 前缀，包括 GUI 页面、窗口标题、更新状态、强更提示、CLI `--version`、发布记录和更新日志。Cargo、`.harness/version-state.json`、候选 manifest 的机器版本字段、协议比较值和 SemVer 运算继续保存不带 `v` 的原始版本；展示边界负责先移除已有任意 `v`/`V` 前缀，再规范化为 `v<version>`。
- 下游在准备首个正式发布时创建根 `release-notes.json`。它是发布制品固定携带、并在 `about_page = enabled` 时由应用关于页通过固定 `load_release_notes` 窄命令复用的用户更新日志事实，使用 `schemaVersion: 2` 与按最新在前的 `releases` 数组；每项字段固定为 `releaseDate`、带一个 `v` 的 `version`、`featureOptimizations` 和 `bugFixes`。两个分类中的每个逻辑条目都是键恰好为 `zh-CN` 与 `en-US` 的翻译对，两个值都必须是非空、无首尾空白的字符串；任一翻译缺失都阻断。所有 GUI 初始化预置但不在调试构建使用 `src-tauri/tauri.release.conf.json`；正式候选构建显式 `--config` 合并该文件，把根日志唯一映射为候选逻辑资源 `release-notes.json`。
- 每次形成发布候选前，必须找到上一次真实正式发布的版本与 40 位源码提交；从该提交之后到当前发布源码的真实差异中语义筛选最重要内容，不得直接倾倒提交标题。首个正式发布以仓库起点到当前发布源码为范围。每版“功能优化”和“问题修复”各自最多 10 个逻辑条目，两类合计至少一条；每个条目同时提供中文与英文。Agent 可先整理其中一种语言并自动翻译另一种，但在写入前必须并排复核两种语言的语义对应关系。普通缺陷修复即使不触发按日 Changelog，也进入本次“问题修复”。
- 更新当前版本时先替换同版本条目，再置顶并截断为最近 5 个版本。使用 `$desktop-prepare-release` 携带的标准库脚本执行 `python3 .agents/skills/desktop-prepare-release/scripts/release_notes.py upsert ...`，通过配对的 `--feature-optimization-zh-cn`/`--feature-optimization-en-us` 与 `--bug-fix-zh-cn`/`--bug-fix-en-us` 按出现顺序传入每个翻译对，再运行更新日志脚本的 `check --expected-version` 校验，并分别运行 `render --locale zh-CN` 与 `render --locale en-US` 复核可见结果。文件是普通非符号链接 UTF-8 JSON，由脚本在同目录原子替换；Harness 升级将其视为 `protected`。
- 用户可见渲染按当前 i18n locale 使用以下两套固定结构；版本必须已经规范化为一个 `v` 前缀，空分类分别显示“无”或“None”，不得制造虚假条目。GUI 当前语言以 `zh` 开头时选择 `zh-CN`，其他或未知语言回退 `en-US`——`release-notes.json` 目前只提供这两套翻译，`zh-TW`/`zh-HK`/`zh-Hant` 等其他中文变体按设计并入 `zh-CN` 内容而非另行回退英文，此为当前双语范围下的既定简化，不是未定义行为：

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

- `release-notes.json` 与 `docs/changelog/` 职责独立：前者是每次正式发布都必须更新且供产品展示/打包的近五版用户摘要；后者仍只记录其事件规则允许的按日项目变化。更新日志一旦变化，源码提交和候选字节也发生变化，必须重新构建并验收，不能在候选 `accepted` 后原地修改。

## 发布物命名

Harness 模板若发布源码归档，使用：

`agent-first-harness-template-vYYYYMMDDHHMM.扩展名`

下游可执行产品在确定产品名和平台后使用：

`产品名-vMAJOR.MINOR.PATCH-平台-架构.扩展名`

实际生成归档或安装包时同时生成相邻的 `<artifact>.sha256` 和清单。`pending` 候选清单至少包含项目、版本、批准的 40 位源码提交、明确的构建/运行身份、构建模式、平台、架构、目标、宿主、产物名、SHA-256、全量单元测试结果、当前 `e2eSelection`、`releaseNotesVersion`、`releaseNotesSha256`、`releaseNotesPath: release-notes.json`、签名证据和 `milestoneAcceptance: pending`。Tauri GUI 还必须包含当次 `performanceSelection: enabled | disabled` 与 `performanceStatus: passed | waived | Not run | Unverified`。选择 `enabled` 或产品/渠道硬要求，且已在目标平台原生测量时，清单必须包含绑定探针候选、提交和平台的结构化 `performanceEvidence`、`performanceProbe*` 与 `performanceRuntimeBinding`；`waived` 必须保存原始失败指标、诊断/修复尝试、风险、原因和用户确认，且原始性能证据必须有 `waiverAllowed: true`，不能改判为通过。选择 `disabled` 且无硬要求时，状态固定为 `Not run`，记录非空原因和剩余风险，并省略所有探针、证据与运行时绑定字段。xwin 只有在性能选择启用但未在真实 Windows 原生运行时记录 `performanceStatus: Unverified`且不伪造原生证据；主动关闭时仍记录 `Not run`。产品/渠道硬要求下，`Unverified` 候选不得进入 `accepted`。所有 Tauri GUI 清单还固定记录产品/发布事实 `updaterEnabled` 和实际 updater plugin/Tauri 版本：官方 updater Rust 插件是无条件安装基线，不受该布尔值、关于页或性能选择控制；`false` 时插件与 `NotConfigured` 零出站回归仍保留，但 updater archive、`.sig` 和制品签名字段必须缺席，`bundle.createUpdaterArtifacts` 不得启用；`true` 时才要求受限 HTTPS endpoints、公钥、channel/target/arch、安全私钥来源、官方 updater archive/`.sig` 与应用公钥实际验签证据。

## 许可证与第三方声明

- Harness 源码归档必须包含根目录 `LICENSE.zh-CN.md` 与 `LICENSE.en.md`。
- 每个下游源码归档、安装包或其他分发物必须以适合其载体且用户可访问的方式携带两份企业专有商业许可证；两份许可证的适用项目名必须等于当前发布产品名，不得残留 Harness 身份，也不得因改名、打包、签名或商店分发而删除、摘要或弱化其他条款。
- 实际分发前必须生成并核对该版本的第三方依赖许可证与 NOTICE 清单。本项目的专有商业许可不替代、覆盖或限制第三方许可证依法授予的权利。
- 商业合同或订单负责确定客户、费用、期限、授权数量和特殊授权；发布物中的通用许可证不得被误报为双方已经签署的商业文件。

所有下游构建结果统一写入项目根 `release/`。该目录由初始化以精确 `/release/` 规则忽略，是“本次构建结果目录”而非历史归档或 `ready` 标志。每次构建在任何单元测试或构建命令前，必须验证规范化后的独立 Git 根目录，拒绝 `release` 符号链接/重解析点和路径越界，把旧目录原子移入同文件系统隔离位置，创建并复核全新空 `release/`，再只删除隔离旧树；不得通过活动目标目录原地递归删除。完成签名、公证与 stapling 后的最终归档或安装包、校验和与清单先在同根唯一暂存区中形成并验证精确的普通文件集合，再删除仍为空且不是重解析点的 `release/`，通过目录级原子重命名，将完整暂存区提交为 `release/`，并复核最终路径和文件集。远端工作流必须检出并复核显式批准的 40 位提交，且每个运行器只能上传清单声明的三个精确路径。结果取回不得依赖含糊提供方“最新”结果或修改时间，不得混入其他项目、旧版本、旧运行、未完成、重复、额外或来源不明文件。`release/` 可以包含 `pending`，是否 `ready` 只由清单与匹配验证证据决定。

构建请求、执行、成功、失败、重试、全量单元测试结果、产物路径/摘要/签名状态、本次 E2E 选择和 GUI 性能选择本身不创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification。普通构建只把这些事实写入当前 `release/` manifest、其声明的相邻制品证据和最终回复；不得把构建日志复制到项目记忆。若 E2E、完整验收、发布、人工复核或长期审计被独立请求或硬要求触发，由对应 Skill 只记录自身新增的结论和证据。

## 构建、完整验收与发布顺序

E2E 选择只对当前构建有效；每次显式构建都独立解析，当前请求未明确时询问一次，持久建议值不能静默代替。GUI 性能选择也只对当前发布有效且没有持久默认值：明确发布在入口复用当前请求已经给出的选择，否则询问一次；直接构建 GUI 候选时由构建 Skill 在任何测试或编译前作同样的兜底解析。构建必须运行项目全部非空单元测试，失败或零测试时不得形成候选。普通构建不自动提交；明确“发布/准备并构建发布”请求本身授权下列本地提交和构建步骤，不再为二者重复审批，但不授权 tag、push、上传、商店提交或正式发布。

1. 明确发布请求后，`$desktop-prepare-release` 先确定接口；含 GUI 时，在任何本地提交或发布元数据写入前解析本次 `performanceSelection`，当前请求已明确时复用，否则询问一次，产品/渠道硬要求优先并强制启用。随后只读复核工作树、范围、缓存和疑似秘密。归属明确的已完成源码按逻辑提交；无关/歧义改动、秘密、hook/签名交互或提交失败立即停止，禁止 `--no-verify`。clean 且无源码变化时不制造空提交。
2. 从新的源码 HEAD 定位上一次真实正式发布边界，生成双语 `release-notes.json`；文件有变化时形成独立发布元数据提交，无变化时不制造空提交。随后要求独立仓库、无 remote 变更；最终工作树必须干净，且 `sourceCommit` 精确等于 HEAD。构建 Skill 对 dirty 状态失败关闭。
3. 运行版本/更新日志/资源配置检查并解析当前 E2E 选择，再运行项目全部非空单元测试。GUI 性能选择为 `enabled` 或产品/渠道硬要求时，从同一 clean HEAD 生成 release-profile no-bundle 探针候选并调用 `$desktop-test-gui-release-performance`：先精确快照 window-state 原字节或原缺席状态，以一个脱敏种子在每次预热和 5 次冷启动前分别重置并验证，且在成功、失败、超时和取消路径恢复并复核原字节/原缺席；隔离完成后，一次预热后 5 次冷启动中位数 ≤2 秒且最大 ≤3 秒；至少 20 次代表性交互 p95 ≤100ms 且单次 <200ms；30 秒整进程树空闲 CPU p95 ≤5% 单核，适用隐藏/托盘 ≤2%；稳定 RSS ≤300 MiB、峰值 ≤500 MiB；20 轮后增长 ≤`max(15%, 32 MiB)`，退出后全部进程回收。指标失败先修复并从新提交重建；仍无法安全解决时才询问，但只有 `wholeProcessTree`、`probeBytesUnmodified`、`allProcessesRecovered` 均为 `true`、原窗口状态已恢复验证且证据为 `waiverAllowed: true`，才能接受明确继续并记为 `waived`，否则停止。选择 `disabled` 且无硬要求时不生成探针，记录 `Not run`、原因和剩余风险。
4. 性能已启用时只有 `passed`，或原始失败证据明确 `waiverAllowed: true` 后获用户显式 `waived`，才能进入完整打包。`wholeProcessTree`、`probeBytesUnmodified`、`allProcessesRecovered` 任一不为 `true`，或窗口状态恢复未验证时，helper 必须输出 `waiverAllowed: false` 与不可豁免失败，必须先修复并重新验证。性能已关闭且无硬要求时以 `Not run` 继续。Rust CLI 默认走三平台原生矩阵；Tauri GUI 生成适用 DMG/NSIS，每个候选打入同一更新日志并逐字节比较。签名条件和全有或全无规则保持；任何路径都不得自动创建、索取或输出凭据。
5. `$desktop-verify-delivery` 对最终候选执行冒烟、当前 E2E 选择、产品/渠道硬要求，并按 `performanceSelection` 条件复核性能：启用时证据仍须绑定同一提交和运行字节，三项完整性标记必须为 `true` 且 window-state 原状态恢复已经验证；`waived` 还必须引用 `waiverAllowed: true` 的原始失败证据并保持可见风险，不能变成 `passed`。关闭时确认 `Not run` 的原因/风险和性能字段缺席。Windows xwin 只有在启用性能但缺少原生测量时保持 `Unverified`。
6. 所有 required/enabled 检查和人工复核完成后才把 `pending` 转为 `accepted`。就绪复核只读检查候选提交、版本、更新日志、当次性能选择/状态、哈希和签名一致；真实渠道发布成功后才执行 `$desktop-manage-version finalize-release`。
7. 更新日志、签名、公证、stapling、重打包或渠道处理若改变运行字节、启动器、依赖或行为，结果成为新候选并回到步骤 3；当次选择启用时旧性能证据与运行时绑定不得复用，所有候选的旧验收证据都不得复用。

## Harness 模板发布检查清单

本清单只在用户明确准备 Harness 发布时执行。日常开发只运行本次必要单元/回归测试；纯文档、元数据、格式与不可合理单测的机械变更只做最小解析或差异检查。开发证据不能替代当前候选的完整验收证据。

模板自身无应用代码，不使用下游的编译、单元测试、CLI 和二进制冒烟门槛。模板发布必须满足：

- [ ] 产品规格状态为 Approved。
- [ ] README、AGENTS、所有已触发的项目记忆文档和全部声明的项目 Skills 完整存在。
- [ ] `python3 scripts/validate_harness.py` 成功，且输出对应当前候选源码。
- [ ] Rust 初始化中性资产通过当前系统的格式、代码规范检查和非空测试；它是脚手架资产而非产品候选，不用冒烟证明产品交付。
- [ ] Rust 初始化中性资产在声明的最低 Rust 版本 1.95.0 上完成可用工具链验证，或明确阻止发布并保持 `Unverified`；这不限制开发或运行环境使用更高稳定版。
- [ ] 候选工作流示例（`.agents/skills/desktop-prepare-cross-platform-release/assets/github-release-candidate.yml`，下游部署到 `.github/workflows/release-candidate.yml`）通过静态检查，且不包含未经授权的标签、发布操作或写权限。
- [ ] Harness 时间版本、下游自动版本 Skill/状态保护、Rust 默认值、四类独立适配器、默认 CLI、Agent 策略、构建 E2E 选择和验收适用性在事实来源中一致。
- [ ] `docs/VERIFICATION.md` 索引的日期证据卷包含本次文档检查证据、未执行项和剩余风险。
- [ ] 完整验收已按候选冒烟策略、当前构建 E2E 选择和硬要求记录 `required` / `enabled` / `disabled` / `Not applicable`；所有 `required` 或 `enabled` 项通过。
- [ ] `docs/verification/human_review.md` 包含真实的人类最终复核记录和结论。
- [ ] 若候选包含符合 Changelog 规则的变化，`Version.md`、对应按日变更记录汇总、Git 标签和源码归档中的版本一致；否则已确认候选仅含 Changelog 排除项。
- [ ] 若候选包含符合 Changelog 规则的变化，`docs/changelog/` 的日期文件中存在对应版本条目；仅含普通缺陷修复或纯重构时本项为 `Not applicable`，且未制造空记录。
- [ ] README 包含真实用途、维护状态和反馈入口。
- [ ] 若生成源码归档，其来源提交和 SHA-256 已记录。
- [ ] 已知重要问题已在 `docs/TECH_DEBT.md` 中公开。

Harness 根目录没有具体产品，因此下游产物门槛不适用于模板发布；理由必须记录。Skill 中的 Rust 中性资产有独立的格式、代码规范检查和非空测试门槛，但不得把脚手架构建或启动冒烟当作产品验收。模板未来在根目录加入可执行产品时，应重新通过范围闸门并定义真实候选验收。

## 下游项目发布检查清单

本清单只接受已通过完整验收的真实候选。日常开发只运行本次必要单元测试；显式构建运行项目全部非空单元测试，E2E 只在最终候选形成后按当前选择执行。

- [ ] 项目根是独立 Git 顶层目录，工作树干净，当前发布源码已有 40 位提交；manifest `sourceCommit` 精确等于实际构建 HEAD，父仓库、尚无提交或未记录修改不得替代发布源码身份。
- [ ] 产品规格状态为 Approved。
- [ ] 中性 `scaffold status` 已由获批的真实业务命令和测试删除或替换，不再返回 `productDefinitionRequired=true`。
- [ ] 不存在已知未实现逻辑或未修复行为偏差；若用户要求的活动 Work Plan 存在，相关 Todo 全部为 `done`。
- [ ] 候选是完整、可运行、符合批准场景的真实产物，不是模拟实现、测试替身、占位、脚手架或开发预览。
- [ ] 当前构建的编译、项目全部非空单元测试、必要集成/契约和产物存在性均有通过证据。
- [ ] 单元测试覆盖核心成功路径和最高风险失败路径。
- [ ] 若选择 CLI，其统一 JSON 信封、错误结构、输出流和退出码契约验证通过；未选择时明确为不适用。
- [ ] Windows、macOS、Linux 各平台的实际验证状态已公开；未运行的平台明确标记为 `Unverified`。
- [ ] `docs/verification/human_review.md` 包含真实的人类最终复核记录和结论。
- [ ] `$desktop-manage-version check --phase release` 通过，根 Cargo、`.harness/version-state.json` 目标、候选、manifest、软件显示与适用项目记忆版本一致；本检查没有提升版本或重置周期。
- [ ] 根 `release-notes.json` 已在候选构建前按上次正式发布提交到当前源码的差异更新；最新条目匹配当前版本，只保留近 5 版且每版两类各不超过 10 条，文件摘要和包内路径与 manifest 一致。
- [ ] 版本事实来源、软件显示、Git 标签和发布物名称一致；所有用户可见版本只带一个小写 `v`，机器版本事实保持原始值；存在符合 Changelog 规则的变化时，按日汇总也与该版本一致。
- [ ] `$desktop-rename-project-identity` 残留扫描确认发布配置、Skills、文档、维护路径和两份许可证中没有旧产品身份。
- [ ] 候选包含符合 Changelog 规则的变化时，`docs/changelog/` 的日期文件中存在对应版本条目；仅含普通缺陷修复或纯重构时本项为 `Not applicable`。
- [ ] README 包含真实的用途、使用方式、维护状态和反馈入口。
- [ ] 发布物来自目标源码提交，且其 SHA-256 已记录。
- [ ] 每个平台归档、相邻 SHA-256 和清单一致，必需平台/架构恰好出现一次。
- [ ] GUI 正式构建使用发布专用 `--config`，构建后资源与根更新日志逐字节一致；macOS 最终 DMG 内唯一 `.app/Contents/Resources/release-notes.json` 已重新比较。含 GUI 且 `about_page = enabled` 时，关于页“检查更新”旁存在元素自身绑定的“更新日志”按钮，能够经固定资源命令查看近 5 版 schema v2 双语日志，中文/英文 locale 分别显示对应标题与正文、未知语言回退英文，加载失败可重试，且点击更新区父容器不会代理任一按钮动作；`about_page = disabled` 时页面、入口、命令、加载器与弹窗缺席，但固定 updater Rust 插件、`UpdateController` 和 `NotConfigured` 零出站基线仍存在。GUI manifest 始终记录 `updaterEnabled` 与 updater plugin/Tauri 版本；`false` 时无 updater archive/`.sig`/制品签名字段，`true` 时官方制品、配置和实际验签证据完整。
- [ ] GUI manifest 记录本次 `performanceSelection`。选择启用或产品/渠道要求时，在打包前对同一 clean HEAD 的 release-profile 探针候选完成整进程树性能门禁，并证明探针字节未变、全部进程已回收、window-state 同一种子逐次重置与原状态恢复：`passed` 有完整原始指标；`waived` 只引用三项完整性标记均为 `true`、窗口恢复已验证且 `waiverAllowed: true` 的原始失败证据，并有失败指标、修复尝试、风险和用户确认；任一完整性标记不为 `true` 或原状态恢复未验证时 `waiverAllowed: false` 且不可豁免；`Unverified` 只用于已启用但未在真实目标平台运行的候选且不得冒充通过。选择关闭且无硬要求时记录 `performanceStatus: Not run`、原因和剩余风险，且没有探针、性能证据或运行时绑定字段。
- [ ] 项目根 `release/` 已由 `$desktop-build-rust-release` 或 `$desktop-build-tauri-release` 在构建前安全刷新，并在本机构建或 `$desktop-collect-release-artifacts` 取回后只包含当前版本、源码提交和明确的构建批次候选；目录内容与清单精确一致且无历史文件。
- [ ] 每个平台清单的 `signingStatus` 与证据真实；macOS Tauri 已签名候选同时具有 `notarizationStatus: notarized-and-stapled` 和可复核证据，unsigned 路线只在渠道允许时存在；验收后若签名、公证、stapling 或重打包改变字节则已重新验收。
- [ ] macOS DMG 的最终签名/公证/stapled 字节已通过只读 Finder 布局检查；`.DS_Store`、本地背景、唯一 `.app` 与 `/Applications` 拖拽目标均真实存在，任何布局补写或重打包后已重做签名、公证、摘要和验收。
- [ ] macOS→Windows Tauri 候选只包含 x64 NSIS，清单记录 `buildMode: cross-compiled-xwin` 和 `runtimeVerification: Unverified`；未在真实 Windows 环境运行时没有声称原生验证通过。
- [ ] 完整验收根据候选冒烟策略、当前构建 E2E 选择、GUI 当次性能选择、产品/渠道硬要求和适用性执行检查；所有 `required` 或 `enabled` 项通过，`disabled`/`Not run`/`Not applicable` 项及风险准确记录。
- [ ] 任一验收失败都曾返回开发循环并完成回归测试，没有以 `Partially verified` 代替仍缺失的批准逻辑。
- [ ] 已知重要问题已在 `docs/TECH_DEBT.md` 中向用户公开。
- [ ] 发布执行方已声明只有真实正式发布成功后才以精确版本和 40 位源码提交调用 `finalize-release --release-succeeded`；失败、取消、候选或标签阶段均不会重置。

Rust 下游项目默认使用 `docs/RUST_CLI_TEMPLATE.md` 中记录的工作区命令和发布产物布局；只有真实文件和命令存在后才能写入验证记录。候选矩阵生成不等于正式发布；构建请求只允许使用已配置且已授权的签名条件，不授权创建凭据、标签、GitHub 发布、向软件包仓库发布或发布上传。

GUI 的本地生产构建和产物存在检查可在批准渠道允许时使用显式 `unsigned` 候选；完整验收执行启动冒烟时必须准确记录该状态。macOS 直接分发不允许把“设备可完成公证”的候选停在仅签名状态：条件齐备时必须由 Tauri 构建完成 Developer ID 签名、公证和 stapling，条件缺失时只能生成明确 `--no-sign` 的本地候选或按渠道要求阻断。App Store、Microsoft Store、要求避免 Windows SmartScreen 警告的下载渠道或 Tauri 更新器仍按各自真实渠道要求完成签名/公证/更新签名前不得宣布渠道发布就绪。Linux 普通部署不因缺少签名自动失败，除非项目批准的渠道另有要求。

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
