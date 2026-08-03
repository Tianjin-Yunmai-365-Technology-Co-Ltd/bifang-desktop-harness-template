# 2026-07-22 变更记录

本文件记录 2026-07-22 结束时仍有效的未发布变化；同日已被替代的中间描述已合并到最新状态。

## [Unreleased]

### 新增

- 新增 `$instantiate-project`、`$implement-change`、五类独立适配器 Skills、`$test-final-artifact-e2e`、当前平台 Rust CLI 构建、跨平台 Rust CLI 候选构建、制品收集和发布准备 Skills，项目 Skills 总数为 16。
- 新增 `docs/AGENT_POLICY.md`，持久保存 `superpowers: enabled/disabled`。
- 新增 `docs/ENGINEERING_RULES.md`，统一文件边界、中文业务注释、文档、测试、例外和机械检查规则。
- 新增按日 ADR 与变更记录目录，分别保存确认需求和实际变化。
- 新增不依赖第三方 Python 包的 `scripts/validate_harness.py`，检查必需文件、Skills、链接、当前描述、初始化门禁、工作区依赖和候选工作流。
- 新增 macOS/Linux POSIX Shell 与 Windows PowerShell 初始化门禁，以及 10 个隔离回归测试。
- 新增随附的 Rust 2024 共享核心 + CLI 中性资产，提供 `scaffold status` 和 `productDefinitionRequired=true`。
- 新增 Windows MSVC 构建工具官方签名校验、自动安装 C++ 工作负载与复探契约。
- 新增 Ratatui/tui-realm/tui-realm-stdlib、React 前端、Tauri GUI 和 Rust stdio MCP 参考资料。
- 新增保守 `.gitignore`，覆盖 Rust、Node、前端构建、覆盖率、环境和本机生成物，同时保留锁文件与项目记忆。

### 变更

- 下游接口统一为 CLI/TUI/MCP/GUI/WEB 独立可选；显式选择时只创建所选适配器，空选择时默认 CLI。CLI 契约仅在选择 CLI 时适用。
- 下游生命周期统一为“实例化并建立独立 Git 根 → 中性脚手架 → 定义产品 → 计划 → 实施 → 验证 → 人工复核”。
- `$instantiate-project` 要求用户提供完整目标目录，执行空目录、basename、祖先、符号链接、碰撞和递归复制检查，并在目标根初始化 `main` 分支独立 Git 仓库；不自动提交、remote、push、tag 或发布。
- 项目标识统一为 ASCII `snake_case`，核心与五类适配器使用 `_core/_cli/_tui/_mcp/_gui/_web` 确定性后缀。
- Rust 初始化固定为当前项目根的单一 Cargo 工作区；根 `[workspace.dependencies]` 统一第三方依赖和内部路径，成员只使用 `workspace = true`。
- Rust 适配器统一使用 Tokio 最小特性集，共享核心默认保持运行时中立。
- TUI 固定采用 Ratatui + tui-realm + tui-realm-stdlib；WEB 与 Tauri GUI 前端固定采用 React + TypeScript + Mantine UI + TanStack Router + TanStack Query + Jotai。
- 初始化把 Rust 与 Node.js 设为阻断门禁，Windows MSVC 构建工具同样阻断，Python 3 保持可选。
- 方法论文档、当前 ADR 和变更记录已移除 CLI 必选、旧混合命名、固定 Harness 子目录、禁止独立嵌套 Git 和旧 GUI 前端默认等失效描述。
- 发布能力边界已明确：现有 `$build-rust-release` 与 `$prepare-cross-platform-release` 只覆盖 Rust CLI；TUI/MCP/GUI/WEB 仍使用各适配器 Skill 的构建门槛，统一跨接口发布能力尚未实现。
- 同一未发布日期内允许把已完全替代且会污染检索的规范合并为最新有效描述；已发布事实、真实验证失败和人工复核记录仍不可改写。

### 修复

- 修正 `docs/HARNESS_ENGINEERING.md` 仍要求所有 Agent-first 项目证明 CLI 闭环的冲突，改为验证共享核心与实际所选接口的闭环。
- 修正 MCP 与其他接口的一致性描述，不再假设 MCP 必须与 CLI 同时存在。
- 为当前事实源增加旧接口、Git、目录和命名规则的回归检查，避免验证记录再次出现“当前事实无 CLI 必选”但方法论仍残留旧规则的假阳性。

### 已知问题

- 反馈入口、发布渠道和发布物格式仍待确定。
- 确定性实例化实现、真实完整下游流程和 TUI/MCP/GUI/WEB 中性脚手架尚未前向验证。
- Windows/Linux、真实 Windows MSVC 安装和远程三平台候选工作流仍为 `Unverified`；随附的 Rust 资产已在 macOS arm64 使用精确 Rust 1.85 验证。
- 固定 TUI/React 技术族尚未在真实下游解析和验证兼容版本。
- 统一的非 CLI 跨平台发布、下游 Harness 迁移、依赖维护和跨接口安全验收能力尚未实现。
