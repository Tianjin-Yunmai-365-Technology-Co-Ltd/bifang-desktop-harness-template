# 版本与发布

## 当前状态

- 当前版本：[`Version.md`](../Version.md) 中记录的 `1.0.0`（未发布）
- 初始版本：[`Version.md`](../Version.md) 中记录的 `1.0.0`
- 模板版本事实来源：根目录 `Version.md`；本文件只维护版本与发布规则
- 下游 Rust 项目版本事实来源：根 `Cargo.toml` 的 `[workspace.package].version`
- 发布渠道：待确定
- 发布物格式：待确定

## 版本规则

使用 Semantic Versioning 2.0.0：

- MAJOR：用户依赖的接口或行为存在不兼容变化。
- MINOR：向后兼容地增加能力。
- PATCH：向后兼容地修复缺陷或提升可靠性。

已发布版本不得静默覆盖。任何发布内容变化都必须产生新版本。

Agent 可以根据上述语义建议版本变化，但是否提升版本以及提升到哪个版本由用户决定。未经用户明确决定，不得修改版本、创建 tag 或把 `Unreleased` 条目移动到正式版本。

## 发布物命名

Harness 模板若发布源码归档，使用：

`agent-first-harness-template-vMAJOR.MINOR.PATCH.扩展名`

下游可执行产品在确定产品名和平台后使用：

`产品名-vMAJOR.MINOR.PATCH-平台-架构.扩展名`

实际生成归档时同时生成相邻的 `<archive>.sha256` 和 manifest。manifest 至少包含版本、源码 commit、平台、架构或 target、归档名、SHA-256、测试结果和冒烟结果。不得在发布物尚不存在时制造校验值或示例发布物。

## 许可证与第三方声明

- Harness 源码归档必须包含根目录 `LICENSE.zh-CN.md` 与 `LICENSE.en.md`。
- 每个下游源码归档、安装包或其他分发物必须以适合其载体且用户可访问的方式携带两份企业专有商业许可证；两份许可证的适用项目名必须等于当前发布产品名，不得残留 Harness 身份，也不得因改名、打包、签名或商店分发而删除、摘要或弱化其他条款。
- 实际分发前必须生成并核对该版本的第三方依赖许可证与 NOTICE 清单。本项目的专有商业许可不替代、覆盖或限制第三方许可证依法授予的权利。
- 商业合同或订单负责确定客户、费用、期限、授权数量和特殊授权；发布物中的通用许可证不得被误报为双方已经签署的商业文件。

所有下游发布候选统一收集到项目根 `release/`。该目录是被 `.gitignore` 忽略的刷新目录，不是历史归档：每次收集前必须先验证 canonical 项目根、拒绝 `release` 符号链接和路径越界，完成当前项目/版本/源码 commit/build run 的来源清单后清空精确 `release/` 内既有内容，再只复制选定的最新已完成结果。不得依赖含糊的 provider “latest” 或单独依赖 mtime，不得混入其他项目、旧版本、旧 run、未完成、重复、额外或来源不明文件。

## Harness 模板发布检查清单

本清单只在用户明确准备 Harness 发布或要求交付验收时作为完整门禁执行。普通文档、Skill、脚本或 workflow 开发轮次只运行非空单元测试与变更相关验证，并把本清单中未运行项明确记录为 `Not run`；历史开发证据不能替代候选源码上的重新验收。

模板自身无应用代码，不使用下游的编译、单元测试、CLI 和二进制冒烟门槛。模板发布必须满足：

- [ ] 产品规格状态为 Approved。
- [ ] README、AGENTS、项目记忆文档和全部声明的项目 Skills 完整存在。
- [ ] `python3 scripts/validate_harness.py` 成功，且输出对应当前候选源码。
- [ ] Rust 初始化中性资产通过当前系统的格式、lint、非空测试、release 构建和真实二进制冒烟验证。
- [ ] Rust 初始化中性资产在声明的最低版本 Rust 1.90.0 上完成可用工具链验证，或明确阻止发布并保持 `Unverified`；这不限制开发或运行环境使用更高 stable。
- [ ] 候选 workflow 示例通过静态检查，且不包含未经授权的 tag、release、publish 或写权限。
- [ ] 版本、Rust 默认值、五类独立 adapter、默认 CLI、Agent policy、E2E 与验证适用性在事实来源中一致。
- [ ] `docs/VERIFICATION.md` 包含本次文档检查证据、未执行项和剩余风险。
- [ ] `docs/VERIFICATION.md` 包含真实的人类最终复核记录和结论。
- [ ] `Version.md`、按日 Changelog 汇总、Git tag 和源码归档中的版本一致。
- [ ] `docs/changelog/` 的日期文件中存在对应版本条目。
- [ ] README 包含真实用途、维护状态和反馈入口。
- [ ] 若生成源码归档，其来源 commit 和 SHA-256 已记录。
- [ ] 已知重要问题已在 `docs/TECH_DEBT.md` 中公开。

Harness 根目录没有具体产品，因此下游四项门槛不适用于模板发布；理由必须记录。Skill 中的 Rust 中性资产有独立的格式、lint、测试、构建和冒烟门槛，不能因其不是正式产品而跳过。模板未来在根目录加入可执行产品时，应重新通过范围闸门并增加相应门槛。

## 下游项目发布检查清单

本清单在用户明确准备发布或要求交付验收时触发，并基于当前源码重新执行。每轮普通开发不重复最终产物、完整启动冒烟、E2E、跨平台候选、归档和人工复核，但仍必须通过非空单元测试与变更相关验证。

- [ ] 项目根是独立 Git top-level，当前发布源码已有可解析 commit；父仓库、unborn HEAD 或未记录的工作区修改不得替代发布源码身份。
- [ ] 产品规格状态为 Approved。
- [ ] 中性 `scaffold status` 已由获批的真实业务命令和测试删除或替换，不再返回 `productDefinitionRequired=true`。
- [ ] 所有要求的验证已通过，未执行项和风险已记录。
- [ ] Agent 当前系统的编译、非空单元测试、产物存在性和最终产物启动冒烟测试均有通过证据。
- [ ] 单元测试覆盖核心成功路径和最高风险失败路径。
- [ ] 若选择 CLI，其统一 JSON 信封、错误结构、输出流和退出码契约验证通过；未选择时明确为不适用。
- [ ] Windows、macOS、Linux 各平台的实际验证状态已公开；未运行的平台明确标记为 `Unverified`。
- [ ] `docs/VERIFICATION.md` 包含真实的人类最终复核记录和结论。
- [ ] 版本事实来源、软件显示、按日 Changelog 汇总、Git tag 和发布物名称一致。
- [ ] `$rename-project-identity` 残留扫描确认发布配置、Skills、文档、维护路径和两份许可证中没有旧产品身份。
- [ ] `docs/changelog/` 的日期文件中存在对应版本条目。
- [ ] README 包含真实的用途、使用方式、维护状态和反馈入口。
- [ ] 发布物来自目标源码 commit，且其 SHA-256 已记录。
- [ ] 每个平台归档、相邻 SHA-256 和 manifest 一致，必需平台/架构恰好出现一次。
- [ ] 项目根 `release/` 已由 `$collect-release-artifacts` 为当前版本、源码 commit 和明确 build run 刷新，目录内容与选定来源 manifest 精确一致且无历史文件。
- [ ] 真实目标环境中的核心流程验收通过。
- [ ] 需要真实交互验收时，`$test-final-artifact-e2e` 已通过 Computer Use 操作最终产物并记录证据；未执行时公开原因和风险。
- [ ] 已知重要问题已在 `docs/TECH_DEBT.md` 中向用户公开。

Rust 下游项目默认使用 `docs/RUST_CLI_TEMPLATE.md` 中记录的 workspace 命令和 release 产物布局；只有真实文件和命令存在后才能写入验证记录。候选矩阵生成不等于正式发布；创建 tag、GitHub Release、registry publish、签名或上传仍需独立授权。

GUI 的本地 production build、产物存在和启动冒烟不要求签名身份、证书、notarization 或 updater key；缺失时把结果明确记录为 unsigned。若批准的分发渠道是 macOS 直接分发/App Store、Microsoft Store、要求避免 Windows SmartScreen 警告的下载渠道或 Tauri updater，则按该渠道真实要求完成签名/公证/更新签名前不得宣布渠道发布就绪。Linux 普通部署不因缺少签名自动失败，除非项目批准的渠道另有要求。

## 发布记录模板

- 版本：vX.Y.Z
- 日期：YYYY-MM-DD
- 源码 commit：待填写
- 发布物：待填写
- SHA-256：待填写
- 验证记录：`docs/VERIFICATION.md` 中的对应条目
- 人工复核：复核人、日期和结论
- 已知问题：待填写
- 不适用项及理由：待填写
