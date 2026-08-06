# 2026-08-06 变更记录

## 新增

- 新增异步优先、Tracing 落盘可读日志与产出物真实可用验收三项硬规则（ADR-20260806-002）：core 与全部 Rust 适配器只要涉及真实 I/O/等待/计时/进程/协议就默认使用异步，只有纯 CPU 密集且无等待点时才保留同步；已启用 tracing 的下游必须把结构化 event/span 同时落盘到人类可读、可滚动的本地日志文件，标准输出仍保持单一 JSON 信封；任一路径对产出物的完成/可用结论都必须以真实运行结果为依据，模拟实现、测试替身、占位页面不具备验收资格，同时明确保留既有测试隔离规则允许的受控替身范围。
- 固化 Tauri GUI 界面国际化（i18n）技术选型事实标准（ADR-20260806-001）：前端固定使用 `i18next` + `react-i18next`，Rust GUI 适配器层固定使用 `rust-i18n`，系统语言探测统一使用官方 `tauri-plugin-os` 的 `locale()` API。i18n 接入成为开发期硬性必选项，默认语言跟随系统语言并在缺少对应资源时回退英文，界面必须提供可发现的语言切换入口并持久化用户选择；core 保持语言无关。
- 新增 `$refactor-code` Skill：从单文件行数、文件组织结构（Rust `<module>/mod.rs`、前端不强制 `index.ts` 桶文件）、命名、常量提取、潜在性能与死锁风险、core-first 归属六个方面辅助行为保持的重构，复用统一文件规模与 core-first 检查器。
- 新增 `$extract-i18n-strings` Skill：把已选 GUI 适配器中硬编码的用户可见文案抽取为 `i18next`/`react-i18next` 与 `rust-i18n` 翻译键，不触碰共享 core，不臆造未批准语言的译文。

## 变更

- 文件规模治理由 400 行硬上限调整为两级规则：超过 500 行必须复核业务高内聚、职责单一和职责相近性，不满足即按职责重构；超过 2000 行由统一门禁强制拒绝并拆分。Rust 模块拆分继续使用目录/`mod.rs` 结构，统一检查器同步报告语义复核候选。
- `AGENTS.md`、`docs/RUST_CLI_TEMPLATE.md`、`docs/VERIFICATION.md`、最新 Product Spec 同步声明异步优先、tracing 落盘可读日志和产出物真实可用验收三项硬规则边界，并明确其与既有测试隔离规则、里程碑真实候选要求的关系。
- `docs/RUST_CLI_TEMPLATE.md`、`$add-gui-adapter` 的 GUI 基线与 React 前端基线、`AGENTS.md` 同步声明 i18n 技术栈、默认语言与语言切换入口的硬规则边界，并明确 core 只暴露语言中立的稳定标识供适配器本地化。
- ADR、Product Spec 五类按日项目记忆滚动到 2026-08-06：`docs/adr/20260805_ADR.md` 的四项仍生效决定原样迁入 `docs/adr/20260806_ADR.md` 并新增 ADR-20260806-001；`docs/product_spec/20260806_product_spec.md` 综合前一份仍有效事实并加入 i18n 约束与成功标准；两个 2026-08-05 日期文件按既有留存规则删除，历史由 Git 版本控制承担。

## 验证

- 文件规模治理调整后运行 `python3 scripts/validate_harness.py`：通过 88 个必需文件、23 个 Skills、Markdown 链接、500 行语义复核/2000 行硬门禁与 core-first 依赖边界检查，0 条非阻断审查警告。
- 文件规模治理调整后运行 `python3 -m unittest discover -s scripts`：115 条测试全部通过，包含 500/501/2000/2001 边界、候选提示、硬失败、Git 可见范围和 Harness 接线回归。
- 统一检查器扫描 162 个人工维护文本文件，当前没有 501 至 2000 行复核候选或超过 2000 行的违规文件。
- 新增三项硬规则文档改动后重跑 `python3 -m unittest discover -s scripts`：112 条测试全部通过，覆盖既有治理/发布/工作流门禁未退化。
- 未在真实下游落地异步默认签名、tracing 落盘日志或对应验收流程；这些范围保持 `Unverified`，留待真实下游首次出现对应实现路径时执行。
- 未生成或验证真实下游的 GUI i18n 页面、翻译资源或候选产物；这些范围保持 `Unverified`，留待真实产品出现具体页面后由 `$add-gui-adapter`、`$extract-i18n-strings` 和 `$refactor-code` 在下游执行。
