# 版本与发布

## 当前状态

- 当前版本：[`Version.md`](../Version.md) 中记录的 `202608051301`（未发布）
- 时间版本起始值：[`Version.md`](../Version.md) 中记录的 `202607301002`
- 旧版本标识：[`Version.md`](../Version.md) 中记录的 `1.0.0`
- 模板版本事实来源：根目录 `Version.md`；本文件只维护版本与发布规则
- 下游 Rust 项目版本事实来源：根 `Cargo.toml` 的 `[workspace.package].version`
- 发布渠道：待确定
- 发布物格式：待确定

## 版本规则

Harness 模板使用上海时区（`Asia/Shanghai`）的 12 位时间版本 `YYYYMMDDHHMM`：

- 版本值取项目负责人确认该版本时的本地年月日时分。
- 12 位数字按时间先后可直接排序；不包含秒、时区后缀或预发布后缀。
- 同一分钟内如需产生第二个不同版本，必须等待下一分钟，不得追加未约定字符。
- `1.0.0` 只作为迁移前旧版本标识保留，不再用于新的 Harness 版本。

下游产品默认使用语义化版本规范 2.0.0：

- MAJOR：用户依赖的接口或行为存在不兼容变化。
- MINOR：向后兼容地增加能力。
- PATCH：向后兼容地修复缺陷或提升可靠性。

版本变化与 Changelog 写入是独立门禁。普通缺陷修复或纯重构仍可按实际兼容性形成 PATCH 版本，但不因此创建 Changelog；只有候选包含符合 `docs/changelog/README.md` 范围的变化时，才要求日期记录、汇总和版本一致性。仅含排除项的发布仍必须具有版本、源码提交、候选清单、Verification 和适用人工复核，缺少 Changelog 不削弱发布证据。

已发布版本不得静默覆盖。任何发布内容变化都必须产生新版本。

Agent 可以按对应方案建议 Harness 时间版本或下游 SemVer 变化，但是否改变版本以及最终值由用户决定。未经用户明确决定，不得修改版本、创建标签或把 `Unreleased` 条目移动到正式版本。

## 发布物命名

Harness 模板若发布源码归档，使用：

`agent-first-harness-template-vYYYYMMDDHHMM.扩展名`

下游可执行产品在确定产品名和平台后使用：

`产品名-vMAJOR.MINOR.PATCH-平台-架构.扩展名`

实际生成归档或安装包时同时生成相邻的 `<artifact>.sha256` 和清单。`pending` 候选清单至少包含项目、版本、批准的 40 位源码提交、明确的构建/运行身份、构建模式、平台、架构、目标、宿主、产物名、SHA-256、测试结果、`signingStatus`、`signingReason`、结构化 `signingEvidence` 和 `milestoneAcceptance: pending`。默认 CLI 原位钩子的证据记录固定钩子验证成功且 `detachedFiles` 为空；`unsigned` 记录验证不适用；项目声明独立签名证据时必须逐项引用。Tauri GUI 安装包还必须包含 `interface: gui`、`artifactKind: installer`、`bundleFormat: dmg | nsis`、`buildMode: native | cross-compiled-xwin`、`runtimeVerification`、`signingScope: bundle-or-installer`、`notarizationStatus`、`notarizationReason` 和结构化 `notarizationEvidence`。xwin 产物固定记录 `runtimeVerification: Unverified`；macOS 已签名候选只有完成公证和 stapling 后才可记录 `notarizationStatus: notarized-and-stapled`。转为 `ready`/发布归档时，清单还必须包含最终里程碑结论，以及根据策略、硬要求与适用性决定是否执行的冒烟/E2E 状态（含 `Not run` / `Not applicable`）。不得在发布物尚不存在时制造校验值或示例发布物。

## 许可证与第三方声明

- Harness 源码归档必须包含根目录 `LICENSE.zh-CN.md` 与 `LICENSE.en.md`。
- 每个下游源码归档、安装包或其他分发物必须以适合其载体且用户可访问的方式携带两份企业专有商业许可证；两份许可证的适用项目名必须等于当前发布产品名，不得残留 Harness 身份，也不得因改名、打包、签名或商店分发而删除、摘要或弱化其他条款。
- 实际分发前必须生成并核对该版本的第三方依赖许可证与 NOTICE 清单。本项目的专有商业许可不替代、覆盖或限制第三方许可证依法授予的权利。
- 商业合同或订单负责确定客户、费用、期限、授权数量和特殊授权；发布物中的通用许可证不得被误报为双方已经签署的商业文件。

所有下游构建结果统一写入项目根 `release/`。该目录由初始化以精确 `/release/` 规则忽略，是“本次构建结果目录”而非历史归档或 `ready` 标志。每次构建在任何格式、测试或构建命令前，必须验证规范化后的独立 Git 根目录，拒绝 `release` 符号链接/重解析点和路径越界，把旧目录原子移入同文件系统隔离位置，创建并复核全新空 `release/`，再只删除隔离旧树；不得通过活动目标目录原地递归删除。完成签名、公证与 stapling 后的最终归档或安装包、校验和与清单先在同根唯一暂存区中形成并验证精确的普通文件集合，再删除仍为空且不是重解析点的 `release/`，通过目录级原子重命名，将完整暂存区提交为 `release/`，并复核最终路径和文件集。远端工作流必须检出并复核显式批准的 40 位提交，且每个运行器只能上传清单声明的三个精确路径。结果取回不得依赖含糊提供方“最新”结果或修改时间，不得混入其他项目、旧版本、旧运行、未完成、重复、额外或来源不明文件。`release/` 可以包含 `pending`，是否 `ready` 只由清单与匹配验证证据决定。

## 里程碑验收与发布顺序

1. 工作计划当前批次全部 Todo 为 `done` 且非空单元测试、相关集成/契约检查通过后，才可生成完整真实里程碑候选。Rust CLI 由 `$desktop-build-rust-release` 默认先走 Windows、macOS、Linux 原生矩阵；Tauri GUI 由 `$desktop-build-tauri-release` 在 macOS 原生构建 DMG，并可使用 `pnpm tauri build --bundles nsis --runner cargo-xwin --target x86_64-pc-windows-msvc` 交叉构建 Windows x64 NSIS。macOS DMG 在 hash 前必须对最终字节只读验证 Finder `.DS_Store`、本地拖拽背景、唯一应用包与 Applications 链接；只检查 Tauri 配置或背景源文件不算通过。构建前按前述安全流程刷新根 `release/`，常规构建不运行冒烟/E2E。
2. 若 Rust CLI 项目已有批准的非交互签名钩子/命令、工具和已授权凭据，构建在归档/哈希前尝试签名并验证；失败会使对应平台构建失败。macOS Tauri 直接分发候选采用全有或全无规则：Developer ID Application 身份、`notarytool`、`stapler` 与一组完整 Apple 公证凭据齐备时，必须在 hash 前完成签名、公证和 stapling；不得生成仅签名候选，也不得使用 `--skip-stapling`。条件不足且渠道允许时才可显式 `--no-sign`；渠道要求时阻断；一旦签名或公证开始，失败不得降级。任何路径都不得自动创建、索取或输出凭据。
3. `$desktop-verify-delivery` 在验证里程碑针对 `release/` 中最终签名或明确为 `unsigned` 的候选字节，读取 `docs/AGENT_POLICY.md`、产品/渠道硬要求和适用性，记录冒烟/E2E 为 `required`、`enabled`、`disabled` 或 `Not applicable`。项目级选择跨任务复用；只有策略缺失/冲突、无法建立可运行性或需要新增外部授权时询问。
4. 对 `required` 或 `enabled` 的检查，在标记 `ready`、发布上传或正式发布前执行。构建与 CI 可先生成、收集或上传 `milestoneAcceptance: pending` 候选供跨平台验收，但不得把目录存在或提供方上传当作 `ready`。`Awaiting human review` 保持 `pending`；失败记录 `rejected` 并重开 Todo；只有完整通过和必需人工复核后才能把匹配的清单更新为 `accepted`。
5. 里程碑通过并取得项目要求的人工复核后，`$desktop-prepare-release` 才可准备版本和发布元数据。发布流程检查候选提交、版本、哈希、签名状态、清单与已验收产物一致，不自行运行冒烟/E2E 或重试签名。
6. 若验收后的签名、公证、stapling、重打包或渠道处理改变产物字节、启动器、依赖或运行行为，结果成为新的里程碑候选，必须回到步骤 3；不得用旧产物证据替代。xwin 交叉构建只能证明构建链完成，Windows 运行保持 `Unverified`，直至在批准的真实 Windows 环境中完成适用验收。

## Harness 模板发布检查清单

本清单在 Harness 维护 Todo 全部完成并进入验证里程碑后执行。普通代码或可执行逻辑开发运行相关非空单元/回归测试；纯文档、元数据、格式与不可合理单测的机械变更使用链接、解析、静态或差异检查等相称证据。两类普通开发都不运行冒烟/E2E，历史开发证据也不能替代当前候选的里程碑证据。

模板自身无应用代码，不使用下游的编译、单元测试、CLI 和二进制冒烟门槛。模板发布必须满足：

- [ ] 产品规格状态为 Approved。
- [ ] README、AGENTS、所有已触发的项目记忆文档和全部声明的项目 Skills 完整存在。
- [ ] `python3 scripts/validate_harness.py` 成功，且输出对应当前候选源码。
- [ ] Rust 初始化中性资产通过当前系统的格式、代码规范检查和非空测试；它是脚手架资产而非产品里程碑，不用冒烟证明产品交付。
- [ ] Rust 初始化中性资产在声明的最低 Rust 版本 1.90.0 上完成可用工具链验证，或明确阻止发布并保持 `Unverified`；这不限制开发或运行环境使用更高稳定版。
- [ ] 候选工作流示例通过静态检查，且不包含未经授权的标签、发布操作或写权限。
- [ ] 版本、Rust 默认值、四类独立适配器、默认 CLI、Agent 策略、Todo/里程碑和验收适用性在事实来源中一致。
- [ ] `docs/VERIFICATION.md` 索引的日期证据卷包含本次文档检查证据、未执行项和剩余风险。
- [ ] 验证里程碑已按持久策略记录冒烟/E2E 的 `required` / `enabled` / `disabled` / `Not applicable`；所有 `required` 或 `enabled` 项通过，未运行项和风险准确记录。
- [ ] `docs/verification/human_review.md` 包含真实的人类最终复核记录和结论。
- [ ] 若候选包含符合 Changelog 规则的变化，`Version.md`、对应按日变更记录汇总、Git 标签和源码归档中的版本一致；否则已确认候选仅含 Changelog 排除项。
- [ ] 若候选包含符合 Changelog 规则的变化，`docs/changelog/` 的日期文件中存在对应版本条目；仅含普通缺陷修复或纯重构时本项为 `Not applicable`，且未制造空记录。
- [ ] README 包含真实用途、维护状态和反馈入口。
- [ ] 若生成源码归档，其来源提交和 SHA-256 已记录。
- [ ] 已知重要问题已在 `docs/TECH_DEBT.md` 中公开。

Harness 根目录没有具体产品，因此下游产物门槛不适用于模板发布；理由必须记录。Skill 中的 Rust 中性资产有独立的格式、代码规范检查和非空测试门槛，但不得把脚手架构建或启动冒烟当作产品验收。模板未来在根目录加入可执行产品时，应重新通过范围闸门并定义真实里程碑。

## 下游项目发布检查清单

本清单只接受已通过验证里程碑的真实候选。普通实现、构建、收集和发布准备不运行冒烟/E2E；代码行为变化必须通过相关非空测试和必要验证，纯文档/元数据变化使用相称替代检查。

- [ ] 项目根是独立 Git 顶层目录，当前发布源码已有可解析提交；父仓库、尚无提交的 HEAD 或未记录的工作区修改不得替代发布源码身份。
- [ ] 产品规格状态为 Approved。
- [ ] 中性 `scaffold status` 已由获批的真实业务命令和测试删除或替换，不再返回 `productDefinitionRequired=true`。
- [ ] 工作计划当前批次全部 Todo 为 `done`，不存在已知未实现逻辑或未修复行为偏差。
- [ ] 候选是完整、可运行、符合批准场景的真实产物，不是模拟实现、测试替身、占位、脚手架或开发预览。
- [ ] Agent 当前系统的编译、非空单元测试、相关集成/契约和产物存在性均有通过证据。
- [ ] 单元测试覆盖核心成功路径和最高风险失败路径。
- [ ] 若选择 CLI，其统一 JSON 信封、错误结构、输出流和退出码契约验证通过；未选择时明确为不适用。
- [ ] Windows、macOS、Linux 各平台的实际验证状态已公开；未运行的平台明确标记为 `Unverified`。
- [ ] `docs/verification/human_review.md` 包含真实的人类最终复核记录和结论。
- [ ] 版本事实来源、软件显示、Git 标签和发布物名称一致；存在符合 Changelog 规则的变化时，按日汇总也与该版本一致。
- [ ] `$desktop-rename-project-identity` 残留扫描确认发布配置、Skills、文档、维护路径和两份许可证中没有旧产品身份。
- [ ] 候选包含符合 Changelog 规则的变化时，`docs/changelog/` 的日期文件中存在对应版本条目；仅含普通缺陷修复或纯重构时本项为 `Not applicable`。
- [ ] README 包含真实的用途、使用方式、维护状态和反馈入口。
- [ ] 发布物来自目标源码提交，且其 SHA-256 已记录。
- [ ] 每个平台归档、相邻 SHA-256 和清单一致，必需平台/架构恰好出现一次。
- [ ] 项目根 `release/` 已由 `$desktop-build-rust-release` 或 `$desktop-build-tauri-release` 在构建前安全刷新，并在本机构建或 `$desktop-collect-release-artifacts` 取回后只包含当前版本、源码提交和明确的构建批次候选；目录内容与清单精确一致且无历史文件。
- [ ] 每个平台清单的 `signingStatus` 与证据真实；macOS Tauri 已签名候选同时具有 `notarizationStatus: notarized-and-stapled` 和可复核证据，unsigned 路线只在渠道允许时存在；验收后若签名、公证、stapling 或重打包改变字节则已重新验收。
- [ ] macOS DMG 的最终签名/公证/stapled 字节已通过只读 Finder 布局检查；`.DS_Store`、本地背景、唯一 `.app` 与 `/Applications` 拖拽目标均真实存在，任何布局补写或重打包后已重做签名、公证、摘要和验收。
- [ ] macOS→Windows Tauri 候选只包含 x64 NSIS，清单记录 `buildMode: cross-compiled-xwin` 和 `runtimeVerification: Unverified`；未在真实 Windows 环境运行时没有声称原生验证通过。
- [ ] 验证里程碑根据持久策略、产品/渠道硬要求和适用性决定是否执行冒烟/E2E；所有 `required` 或 `enabled` 项通过，`disabled`/`Not applicable` 项及风险准确记录。
- [ ] 任一验收失败曾重开 Todo 返回编码并完成回归测试，没有以 `Partially verified` 代替仍缺失的批准逻辑。
- [ ] 已知重要问题已在 `docs/TECH_DEBT.md` 中向用户公开。

Rust 下游项目默认使用 `docs/RUST_CLI_TEMPLATE.md` 中记录的工作区命令和发布产物布局；只有真实文件和命令存在后才能写入验证记录。候选矩阵生成不等于正式发布；构建请求只允许使用已配置且已授权的签名条件，不授权创建凭据、标签、GitHub 发布、向软件包仓库发布或发布上传。

GUI 的本地生产构建和产物存在检查可在批准渠道允许时使用显式 `unsigned` 候选；验证里程碑按策略执行启动冒烟时必须准确记录该状态。macOS 直接分发不允许把“设备可完成公证”的候选停在仅签名状态：条件齐备时必须由 Tauri 构建完成 Developer ID 签名、公证和 stapling，条件缺失时只能生成明确 `--no-sign` 的本地候选或按渠道要求阻断。App Store、Microsoft Store、要求避免 Windows SmartScreen 警告的下载渠道或 Tauri 更新器仍按各自真实渠道要求完成签名/公证/更新签名前不得宣布渠道发布就绪。Linux 普通部署不因缺少签名自动失败，除非项目批准的渠道另有要求。

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
