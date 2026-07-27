# 2026-07-27 Changelog

## Added

- 新增根 `Version.md`，将 Harness 模板当前版本、初始版本和发布状态集中记录为 `1.0.0`、`1.0.0`、`Unreleased`。
- 新增 `LICENSE.zh-CN.md` 与 `LICENSE.en.md` 两份企业专有商业许可证，覆盖项目与知识产权、有限付费授权、终端下游、禁止继续衍生、保密、第三方材料、终止、责任和争议边界。
- 新增 `$rename-project-identity`，支持预览后全量修改展示名、项目标识/前缀、项目自有配置、维护路径、文档、Skills 和 Licenses，并阻断覆盖与符号链接。

## Changed

- `docs/RELEASE.md` 改为只维护版本与发布规则，并链接根 `Version.md`；README、AGENTS、当前 Product Spec、工程规则、方法论、技术债和 `$prepare-release` 已同步新的版本事实边界。
- `$instantiate-project` 明确不把 Harness 专用 `Version.md` 复制到 Rust 下游，避免与下游根 `Cargo.toml` 形成冲突版本事实。
- 全部 Markdown 文档已纳入当前事实、链接、旧身份、已替代规则和本机路径残留审计；Harness validator 增加版本文件及同步契约门禁。
- `$instantiate-project` 现在先逐字节复制两份许可证，再只把双语适用项目名改为目标项目；全量身份重置成为派生必经门禁。
- `$initialize-rust-project` 的一次性裁剪现在必须保留改名 Skill 和已命名为目标项目的两份许可证，并在旧 Harness 身份残留、缺失、更改或计划删除时阻断完成。
- AGENTS、README、Product Spec、Product Status、Work Plan、ADR、RELEASE 和 Harness validator 已同步专有商业许可与下游继承边界。

## Verification boundary

- Harness 静态和负向门禁结果记录于 `docs/VERIFICATION.md`。
- 全部文档与版本门禁已通过；bundled Rust asset 仍有 LIM-020 所记录的 Rust 1.90 rustfmt 失败，因此总体为 `Partially verified`，`1.0.0` 保持 `Unreleased` / `Not ready`。
- 真实下游完整实例化、正式客户合同适用性和第三方依赖许可清单仍未验证；正式销售前需要专业律师复核。
