# 2026-08-06 变更记录

## 新增

- 固化 Tauri GUI 界面国际化（i18n）技术选型事实标准（ADR-20260806-001）：前端固定使用 `i18next` + `react-i18next`，Rust GUI 适配器层固定使用 `rust-i18n`，系统语言探测统一使用官方 `tauri-plugin-os` 的 `locale()` API。i18n 接入成为开发期硬性必选项，默认语言跟随系统语言并在缺少对应资源时回退英文，界面必须提供可发现的语言切换入口并持久化用户选择；core 保持语言无关。
- 新增 `$refactor-code` Skill：从单文件行数、文件组织结构（Rust `<module>/mod.rs`、前端不强制 `index.ts` 桶文件）、命名、常量提取、潜在性能与死锁风险、core-first 归属六个方面辅助行为保持的重构，复用既有 400 行与 core-first 检查器。
- 新增 `$extract-i18n-strings` Skill：把已选 GUI 适配器中硬编码的用户可见文案抽取为 `i18next`/`react-i18next` 与 `rust-i18n` 翻译键，不触碰共享 core，不臆造未批准语言的译文。

## 变更

- `docs/RUST_CLI_TEMPLATE.md`、`$add-gui-adapter` 的 GUI 基线与 React 前端基线、`AGENTS.md` 同步声明 i18n 技术栈、默认语言与语言切换入口的硬规则边界，并明确 core 只暴露语言中立的稳定标识供适配器本地化。
- ADR、Product Spec 五类按日项目记忆滚动到 2026-08-06：`docs/adr/20260805_ADR.md` 的四项仍生效决定原样迁入 `docs/adr/20260806_ADR.md` 并新增 ADR-20260806-001；`docs/product_spec/20260806_product_spec.md` 综合前一份仍有效事实并加入 i18n 约束与成功标准；两个 2026-08-05 日期文件按既有留存规则删除，历史由 Git 版本控制承担。

## 验证

- 默认 Harness Python 回归 112 条通过，覆盖新增两个 Skill 的结构契约、Rust 技术选型事实标准回归和既有治理/发布/工作流门禁。
- 完整 Harness validator 通过 88 个必需文件、23 个 Skills（含新增的 `refactor-code`、`extract-i18n-strings`）、Markdown 链接、400 行硬上限与 core-first 依赖边界检查，0 条非阻断审查警告。
- 未生成或验证真实下游的 GUI i18n 页面、翻译资源或候选产物；这些范围保持 `Unverified`，留待真实产品出现具体页面后由 `$add-gui-adapter`、`$extract-i18n-strings` 和 `$refactor-code` 在下游执行。
