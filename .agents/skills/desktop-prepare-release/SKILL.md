---
name: desktop-prepare-release
description: 使用仓库声明的版本方案评估并准备可追溯发布。Harness 使用 Asia/Shanghai 时区的 YYYYMMDDHHMM 时间版本；除非已批准规格另有规定，下游产品使用语义化版本。
---

# 准备发布

准备发布元数据和证据；除非用户明确授权对应变更，否则不得发布或创建标签。

## 工作流程

1. 读取存在时的 `Version.md`、`docs/RELEASE.md`、日期最新的 Product Spec 和验证记录。`docs/changelog/README.md` 存在时读取其规则；下游尚未触发 Changelog 时，使用 `docs/ENGINEERING_RULES.md` 的 Changelog 触发规则，不得为读取规则而预建目录、索引或日期文件。只有候选包含符合规则的变化时才读取相应日期记录。
2. 确认用户确实要准备发布。要求存在由 `$desktop-verify-delivery` 给出的 `Milestone accepted` 候选；开发证据、一次构建或 `pending` 候选均不充分。要求独立 Git 顶层目录和 `HEAD` 与已验收源码提交匹配；尚未生成的 `HEAD` 无法标识发布源码。检查候选清单中的 `e2eSelection`、产品/渠道硬要求及对应执行结果，但不得在此运行任一测试。
3. 应用已声明的版本方案。对于 Harness，根据 `Asia/Shanghai` 时区的版本决定时间生成 12 位 `YYYYMMDDHHMM` 值；如果已有版本使用该分钟，必须等待下一分钟，不得编造后缀，且更改前必须取得用户版本决定。对于下游产品，不重新计算 SemVer；调用 `$desktop-manage-version check --phase release`，使用开发阶段已经自动确定的目标版本。只有 Major 的精确目标需要用户批准，Minor/Patch 不在发布准备阶段补升。
4. 找到已声明的版本事实源，并比较每个含版本信息的位置。Harness 模板使用根 `Version.md` 及其时间版本方案；下游 Rust 项目以根 `Cargo.toml` 为当前版本唯一事实源，以 `.harness/version-state.json` 保存周期/去重状态，并且不得继承 Harness `Version.md`。下游候选、清单、软件显示和适用 Changelog 必须等于门禁当前目标；状态缺失或不一致时停止。
5. 先判断候选是否包含符合 Changelog 规则的变化。存在时，才把对应日期文件中的有效 `Unreleased` 条目合并到带日期的版本章节，不得创建根级变更记录或在不同日期文件间重复条目；预计仍有后续合格变化时，在当天记录中保留全新的 `Unreleased` 章节。候选仅含普通缺陷修复或纯重构时，不创建、不补写也不汇总 Changelog，并在发布检查输出中把该门禁记录为 `Not applicable`。
6. 要求 `$desktop-build-rust-release`、`$desktop-build-tauri-release` 或 `$desktop-collect-release-artifacts` 已针对精确构建标识安全刷新 `<project-root>/release`。验证归档/二进制/安装包、SHA-256、清单、版本、提交、构建、全量单元测试、`e2eSelection`、`signingStatus`、`signingReason`、结构化 `signingEvidence`、验收结论，以及本次构建选择或产品/渠道要求的冒烟/E2E 结果。Tauri GUI 候选还必须验证 `bundleFormat`、`runtimeVerification` 和公证字段；macOS 已签名直接分发候选只接受 `notarizationStatus: notarized-and-stapled`，并要求匹配的 `Milestone accepted` 证据已经对当前最终 DMG 运行 `scripts/verify-dmg-layout.sh <final-dmg>`；xwin NSIS 只接受 `buildMode: cross-compiled-xwin` 和 `runtimeVerification: Unverified`。拒绝历史、过时、`pending`、`rejected`、外来、含糊或额外文件。目录存在绝不表示已满足发布就绪条件。
7. 使用证据和已知问题更新被触发的发布及项目状态记录。发布候选继续按完整验收/发布规则写 Verification；只有候选包含符合 Changelog 规则的变化时才更新 Changelog。本 Skill 只准备发布，仍不得调用周期重置；只有真实渠道发布成功后，发布执行方才以精确版本和 40 位源码提交调用 `$desktop-manage-version finalize-release`。失败、取消、仅创建标签、`pending`/`accepted` 候选或上传尝试均不得重置。

## 发布门禁

只有满足 `docs/RELEASE.md` 中全部必需检查项时，才声明 `Ready`。否则必须声明 `Not ready` 并列出精确阻断项。

- 绝不得覆盖已发布版本。
- 绝不得编造标签、提交、校验和、产物、日期或验证结果。
- 绝不得仅因调用本 Skill 就发布、推送、创建标签或上传；必须取得用户明确授权。
- 绝不得把候选工作流成功或产物目录完整视为发布授权。
- 绝不得在发布准备中运行冒烟/E2E，也不得把未选择的检查视为通过。保留 `Not run` 及其剩余风险；项目策略、产品或渠道要求该检查时，必须阻断就绪状态。
- 不得在此重试或配置签名、公证或 stapling。渠道要求的签名与公证必须已经属于精确的已验收候选；macOS Tauri 候选不得以仅签名状态宣布就绪。后续改变字节的签名、公证、stapling 或重新打包必须把新字节交回 `$desktop-verify-delivery`。
- 绝不得仅因旧 `release/` 快照中的文件仍存在，就把它评估为当前结果；收集过程必须把它绑定到已选版本、源码提交和构建证据。
- 绝不得仅因下一 Harness 时间版本看似明显就更改它；Harness 版本与下游 Major 决定属于用户。下游 Minor/Patch 必须已经由 `$desktop-manage-version` 在合格变化完成后确定，发布准备不得另算或手工覆盖。
- 使用面向用户的语言描述变更，不得仅提供原始提交列表。
- 绝不得为了版本一致性检查，为仅含普通缺陷修复或纯重构的候选制造空 Changelog、`Not applicable` 占位日期文件或虚构用户变化。
