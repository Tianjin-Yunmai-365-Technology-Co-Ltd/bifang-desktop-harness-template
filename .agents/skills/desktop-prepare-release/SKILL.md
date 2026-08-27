---
name: desktop-prepare-release
description: 使用仓库声明的版本方案评估并准备可追溯发布。Harness 使用 Asia/Shanghai 时区的 YYYYMMDDHHMM 时间版本；除非已批准规格另有规定，下游产品使用语义化版本。
---

# 准备发布

准备发布元数据和证据；除非用户明确授权对应变更，否则不得发布或创建标签。

## 工作流程

1. 读取存在时的 `Version.md`、`docs/RELEASE.md`、日期最新的 Product Spec 和验证记录。`docs/changelog/README.md` 存在时读取其规则；下游尚未触发 Changelog 时，使用 `docs/ENGINEERING_RULES.md` 的 Changelog 触发规则，不得为读取规则而预建目录、索引或日期文件。确认用户确实要准备发布，并判断当前进入“候选前更新日志阶段”还是已有 `Milestone accepted` 候选后的“就绪复核阶段”。
2. 应用已声明的版本方案。Harness 模板使用根 `Version.md`，根据用户在 `Asia/Shanghai` 时区作出的版本决定使用 12 位 `YYYYMMDDHHMM`；下游不得继承 Harness `Version.md`，也不重新计算 SemVer，而在就绪复核调用 `$desktop-manage-version check --phase release` 使用开发阶段已经确定的目标版本。只有 Major 的精确目标需要用户批准，Minor/Patch 不在发布准备阶段补升。所有用户可见版本规范化为且只规范化为一个小写 `v`；Cargo、状态和 manifest 的机器版本字段保持原始值。

### 候选前更新日志阶段

3. 在运行候选构建前，要求独立 Git 顶层目录和可解析的当前 `HEAD`。初始化中尚未生成的 `HEAD` 不具备发布比较边界，必须声明 `Not ready`。从正式发布状态、标签及匹配 Verification 中找到上一次真实发布的版本和 40 位源码提交；不得把 `pending`/`accepted` 候选、标签创建尝试或目录修改时间当作正式发布。首个正式发布没有上次提交时，以仓库起点到当前 `HEAD` 为比较范围；如果历史证据冲突或无法界定比较范围，声明 `Not ready` 并停止，绝不猜测。
4. 审阅上次正式发布提交之后到当前发布源码的真实差异、已完成行为、适用按日 Changelog 和缺陷事实，语义筛选最重要的用户可见内容；不得直接倾倒提交标题、内部重构或构建流水账。当前版本固定使用两类：`功能优化` 不超过 10 条，`问题修复` 不超过 10 条，两类合计至少一条。普通缺陷修复即使按项目记忆规则不触发 Changelog，也必须进入本次发布的“问题修复”。
5. 使用本 Skill 的标准库脚本维护根 `release-notes.json`：

   ```text
   python3 .agents/skills/desktop-prepare-release/scripts/release_notes.py upsert --file release-notes.json --release-date YYYY-MM-DD --version <current-version> [--feature-optimization <text>]... [--bug-fix <text>]...
   python3 .agents/skills/desktop-prepare-release/scripts/release_notes.py check --file release-notes.json --expected-version <current-version>
   ```

   脚本必须拒绝符号链接/非普通文件、未知 schema、无效日期/版本、重复版本、空版本条目、任一分类超过 10 条或总版本超过 5 条；同版本替换后置顶，按最新在前原子写入并只保留最近 5 版。用户可见渲染必须保持 `-----------更新日志 {发布日期} {发布版本}----------`、`###功能优化`、`###问题修复`，其中发布版本带一个小写 `v`，空分类显示“无”。
6. 若 `release-notes.json` 发生变化，声明 `Not ready`，要求它与当前源码一起形成新提交后再构建；本阶段不得运行测试、构建、验收、签名、创建标签或上传，也不得把尚未形成的候选称为发布就绪。构建 Skill 只读校验并打包该文件，绝不得替发布准备阶段生成或改写它。

### 就绪复核阶段

7. 要求存在由 `$desktop-verify-delivery` 给出的 `Milestone accepted` 候选；开发证据、一次构建或 `pending` 候选均不充分。要求独立 Git 顶层目录和 `HEAD` 与已验收源码提交匹配，并运行更新日志脚本的只读 `check --expected-version`。此阶段绝不得修改 `release-notes.json`；任何字节变化都使现有候选与验收失效并返回候选前阶段。
8. 找到已声明的版本事实源，并比较每个含版本信息的位置。Harness 使用根 `Version.md`；下游以根 `Cargo.toml` 为当前版本唯一事实源，以 `.harness/version-state.json` 保存周期/去重状态。下游候选、manifest 机器版本、带 `v` 的 `releaseNotesVersion`、`releaseNotesSha256`、包内 `releaseNotesPath`、软件显示和适用 Changelog 必须一致；GUI 候选始终实际包含同一更新日志，`about_page = enabled` 时关于页必须消费它，disabled 时关于页、入口和组件必须缺席。状态缺失或不一致时停止。
9. 先判断候选是否包含符合 Changelog 规则的变化。存在时，才把对应日期文件中的有效 `Unreleased` 条目合并到带日期的版本章节；候选仅含普通缺陷修复或纯重构时，不创建、不补写也不汇总 Changelog，并把该门禁记录为 `Not applicable`。`release-notes.json` 每次正式发布都必须存在，不能因 Changelog 不适用而省略。
10. 要求 `$desktop-build-rust-release`、`$desktop-build-tauri-release` 或 `$desktop-collect-release-artifacts` 已针对精确构建标识安全刷新 `<project-root>/release`。验证归档/二进制/安装包、SHA-256、清单、版本、提交、构建、全量单元测试、`e2eSelection`、更新日志版本/摘要/包内路径、`signingStatus`、`signingReason`、结构化 `signingEvidence`、验收结论及适用冒烟/E2E 结果。Tauri GUI 还验证 `bundleFormat`、`runtimeVerification` 和公证字段；macOS 已签名直接分发候选只接受 `notarizationStatus: notarized-and-stapled`，xwin NSIS 只接受 `buildMode: cross-compiled-xwin` 和 `runtimeVerification: Unverified`。拒绝历史、过时、`pending`、`rejected`、外来、含糊或额外文件。目录存在绝不表示已满足发布就绪条件。
11. 使用证据和已知问题更新被独立事件触发的发布及项目状态记录。本 Skill 只准备发布，仍不得调用周期重置；只有真实渠道发布成功后，发布执行方才以精确版本和 40 位源码提交调用 `$desktop-manage-version finalize-release`。失败、取消、仅创建标签、`pending`/`accepted` 候选或上传尝试均不得重置。

## 发布门禁

只有满足 `docs/RELEASE.md` 中全部必需检查项时，才声明 `Ready`。否则必须声明 `Not ready` 并列出精确阻断项。

- 绝不得覆盖已发布版本。
- 绝不得编造标签、提交、校验和、产物、日期或验证结果。
- 绝不得仅因调用本 Skill 就发布、推送、创建标签或上传；必须取得用户明确授权。
- 绝不得把候选工作流成功或产物目录完整视为发布授权。
- 绝不得在发布准备中运行冒烟/E2E，也不得把未选择的检查视为通过。保留 `Not run` 及其剩余风险；项目策略、产品或渠道要求该检查时，必须阻断就绪状态。
- 不得在此运行任一测试；候选清单中的 `e2eSelection` 与全量单元测试结果只作为已形成候选的只读证据复核，不能在发布准备阶段补跑或改判。
- 不得在此重试或配置签名、公证或 stapling。渠道要求的签名与公证必须已经属于精确的已验收候选；macOS Tauri 候选不得以仅签名状态宣布就绪。后续改变字节的签名、公证、stapling 或重新打包必须把新字节交回 `$desktop-verify-delivery`。
- 绝不得仅因旧 `release/` 快照中的文件仍存在，就把它评估为当前结果；收集过程必须把它绑定到已选版本、源码提交和构建证据。
- 绝不得仅因下一 Harness 时间版本看似明显就更改它；Harness 版本与下游 Major 决定属于用户。下游 Minor/Patch 必须已经由 `$desktop-manage-version` 在合格变化完成后确定，发布准备不得另算或手工覆盖。
- 使用面向用户的语言描述变更，不得仅提供原始提交列表。
- 绝不得为了版本一致性检查，为仅含普通缺陷修复或纯重构的候选制造空 Changelog、`Not applicable` 占位日期文件或虚构用户变化。
- 候选前只允许用 `release_notes.py upsert` 更新发布日志；候选验收后只允许 `check`/`render` 读取。不得在已验收候选上补写、重排或润色更新日志。
