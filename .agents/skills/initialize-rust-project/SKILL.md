---
name: initialize-rust-project
description: 初始化一个中性的下游 Rust 项目并选择接口，随后永久删除仅用于初始化的能力，同时保留开发 Skills 和约束地图。
---

# 初始化 Rust 项目

创建可复用的共享核心，并且只创建用户选择的接口。CLI 是可选接口，但在用户未选择任何接口时，它是确定性的默认值。

## 工作流程

1. 读取存在时日期最新的产品状态，以及 `docs/AGENT_POLICY.md`、`docs/ENGINEERING_RULES.md` 和 `docs/RUST_CLI_TEMPLATE.md`。刚实例化的下游项目有意不包含产品规格、工作计划、ADR、变更记录或 `docs/VERIFICATION.md`；不得在中性初始化期间创建这些内容。只要求具备当前项目身份和 ASCII `snake_case` 标识；在执行 `$define-product` 前，产品事实必须保持未定义。
2. 将当前目录解析为唯一的下游项目根目录。如果当前目录是仅包含文档的 Harness 源项目，则必须停止、保留文件，并且绝不得创建替代项目目录。
3. 写入脚手架前必须要求 Git 可用。运行 `git --version`，随后判断 `git rev-parse --show-toplevel` 的规范化路径是否等于当前项目根目录。如果不相等，即使存在父级仓库，也必须在当前根目录运行 `git init --initial-branch=main .`。验证工作树内状态为 `true`、顶层目录等于当前项目根目录、初始分支为 `main`，并且 `git remote` 为空。不得创建脚手架前提交、标签、远端、推送、托管仓库、签名或全局 Git 配置。已经正确存在的独立仓库必须保持不变，直到最终干净状态验证。
4. 询问初始化需要哪些接口，只能从 `CLI`、`TUI`、`MCP` 和 `GUI` 中选择，并允许任意组合。如果用户没有作出选择，则记录 `CLI`。用户明确选择其他接口时，不得静默附加 CLI。
5. 直接调用本 Skill 且目标项目策略尚未解析时，先只让用户选择“推荐敏捷预设”或“自定义”。推荐路径须显式确认并展开为 `superpowers: enabled`、`parallel_worktree_subagents: enabled`、`milestone_smoke: enabled`、`milestone_e2e: disabled`；自定义只询问目标用户尚未明确提供的字段，每项至多一次。Harness 源字段值不是下游确认，不得据此跳过选择，也不得静默采用推荐值。全部四项、真实确认来源和日期收齐后，才以 `schema_version: 1` 和 `reuse_then_infer_then_ask` 一次原子写入，不新增预设字段且不遗留 `pending`。如果 `$instantiate-project` 已记录这些值，则只验证并复用，不再次询问。
6. 写入脚手架文件之前，使用已记录的接口选择调用 `$check-development-environment`。Rust 始终是必需项；Windows 仍需满足 Rust MSVC 前置条件。只有包含 `GUI` 的选择才增加阻断性的 Node.js 和 pnpm 门禁。记录当前宿主证据，并在任何必需工具受阻时停止。
7. 使用中性资产创建根 Cargo 工作区和 `<project-id>_core`，不得引入业务假设。核心必须保持运行时中立，并且不得包含接口、进程、终端、协议、浏览器或桌面类型。根 `[workspace.dependencies]` 必须始终是唯一依赖来源，成员清单必须使用 `workspace = true`。创建或更新项目根目录 `.gitignore`，使其恰好一次包含根锚定的 `/release/` 和 `/.release-clean.*` 条目；不得忽略根目录以外名称类似 release 的目录。
8. 将每个已记录接口分派给各自的 Skill：`$add-cli-adapter`、`$add-tui-adapter`、`$add-mcp-adapter` 或 `$add-gui-adapter`。每个已选 Skill 负责自己的适配器目录和测试。TUI 使用固定的 Ratatui + tui-realm + tui-realm-stdlib 技术栈；Tauri GUI 前端使用固定的 React + TypeScript + Mantine UI + TanStack Router + TanStack Query + Jotai 技术栈。自带的 `rust-lib-cli` 资产提供中性核心和可选的 CLI 实现；未选择 CLI 时不得复制其中的 CLI 成员。
9. Product Spec 不存在或仍为 `Draft` 时，每个已选接口只能公开中性脚手架状态，其中包含 `productDefinitionRequired=true` 或接口等价的可见状态。不得虚构业务命令、工具、屏幕、路由、数据或副作用。产品获批后，只实现尚未暴露的内部 core 行为可采用标准路径；任何适配器首次替换中性状态或建立公开命令、工具、页面、协议时都必须进入里程碑路径。后续局部、可逆且不改变公开契约的变更才可按快速/标准规则处理。
10. 必须通过 Cargo 生成 `Cargo.lock`。对每个已创建成员运行格式检查、代码规范检查、非空测试和锁定依赖构建；中性初始化期间不得运行冒烟或 E2E。测试必须覆盖核心中性状态、每个已选适配器的可观察状态，以及对未批准业务行为的拒绝。
11. 使用实际结果更新保留的产品状态、接口、策略和真实技术债；环境、测试、构建、Git 边界与未测试系统只汇总到本次完成输出，不创建或更新 `docs/VERIFICATION.md`。不得为中性初始化创建产品规格、工作计划、ADR 或变更记录，并明确脚手架不是里程碑产物。如果选择 GUI，必须记录 `$prepare-gui-app-identity` 是首次产品 GUI 开发前的强制步骤。
12. 只有全部脚手架检查完成后，才能收尾下游仓库：
    - 完整删除 `.agents/skills/instantiate-project/` 和 `.agents/skills/initialize-rust-project/`；
    - 删除模板专用的 `scripts/validate_harness.py`、`docs/HARNESS_ENGINEERING.md`、初始化操作指南、初始化门禁描述、Harness 身份与历史，以及任何可以实例化或初始化另一个项目的入口；
    - 保留 `$rename-project-identity`、`$check-development-environment`、`$prepare-gui-app-identity`、`$upgrade-harness`、`$run-parallel-worktrees`，以及仍然适用的产品开发、适配器、验证和发布 Skills；选择 GUI 时保留 `$build-tauri-release`，未选择 GUI 时将其作为不适用的条件 Skill 删除；
    - 保留继承的两份非开源企业专有商业许可证文件 `LICENSE.zh-CN.md` 和 `LICENSE.en.md`，其中目标项目名称必须已由 `$rename-project-identity` 建立；如果任一文件缺失、仍包含旧 Harness 身份、在批准改名后发生其他修改，或被安排删除，则最终收尾必须失败；
    - 重写 `AGENTS.md`，同时保留非空的 `## Skills 地图` 和 `## 约束地图`。Skills 地图必须列出每个保留的 Skill，包括 `$run-parallel-worktrees` 和 `$upgrade-harness` 的持久策略用法。约束地图必须链接保留的规则并禁止下游继续派生；
    - 搜索下游根目录；如果历史证据之外仍存在对 `$instantiate-project`、`$initialize-rust-project`、其目录或仅用于初始化的门禁的活动引用，则最终收尾必须失败。
13. 裁剪完成后，如果本次运行由 `$instantiate-project` 发起，则确认 `docs/adr/`、`docs/changelog/`、`docs/product_spec/`、`docs/work_plan/` 和 `docs/VERIFICATION.md` 仍然不存在。对于直接初始化的现有下游项目，必须保留已经存在的项目自有记忆，绝不得为了满足此检查而删除它们。暂存完整的已初始化下游项目树，并使用用户现有 Git 身份创建恰好一个本地基线提交，提交消息必须为 `chore: initialize project`。如果作者身份不可用，必须停止并向用户请求；不得伪造身份或修改全局 Git 配置。
14. 创建基线提交之前，必须确认四项策略字段和确认元数据均不包含 `pending`。如果具备精确的源溯源和渲染后的保留工程层候选，则通过 `$upgrade-harness record --bootstrap` 建立 `.harness/upstream-lock.json`；否则必须记录首次升级所需的初始基线审计，不得虚构锁文件。验证已完成仓库的规范顶层目录、`main`、可解析的基线提交、无远端，以及空的 `git status --porcelain=v1 --untracked-files=all`。任何失败都必须阻断完成。
15. 下一步必须转到 `$define-product`。生成的下游项目是终端项目根目录，而不是另一个 Harness；绝不得根据脚手架声称产品已经交付。

## 架构不变量

- 当前项目根目录必须同时是唯一的下游根目录及其独立 Git 顶层目录；父级仓库绝不能替代它。
- 根 `Cargo.toml` 管理共享核心，并且只管理用户实际选择的适配器成员。
- 确定性目录为 `<project-id>_core`、`_cli`、`_tui`、`_mcp` 和 `_gui`。
- 每个适配器必须直接依赖核心，并且绝不得解析、启动、嵌入或要求另一个适配器。
- CLI、TUI 和 MCP 适配器默认使用 Tokio current-thread 异步入口；GUI 复用 Tauri 由 Tokio 支撑的异步运行时。所有 Rust 适配器工作优先采用异步 I/O 和等待。只有经过测量的 CPU 密集工作才可以进入有边界的线程边界；仅提供阻塞接口的依赖必须被替换，或通过范围与硬规则例外流程获得批准。除非已批准的领域需求另有要求，核心必须保持运行时中立。
- 已选 TUI 或 GUI 适配器即使处于 `Draft` 状态也必须应用固定技术栈；替换技术栈需要记录硬规则例外。
- 只有选择 CLI 时，CLI 才遵守 `docs/CLI_CONTRACT.md`。
- `docs/AGENT_POLICY.md` 持久记录四项项目选择；后续 Agent 必须复用这些选择、推断适用性，并且只在问题未解决时询问。
- 产品规格、工作计划、ADR 和变更记录属于下游开发记忆，不属于初始化载荷。
- 完成收尾的下游项目不能从自身实例化或初始化另一个项目。
- 完成收尾的下游项目必须保留继承的两份专有商业许可证文件，并继续受其中终端下游限制约束。
- `AGENTS.md` 必须始终保留非空的 Skills 地图和约束地图；裁剪可以移除地图条目，但不得删除任一地图。
- 初始化只有在独立仓库中创建一个真实本地基线提交，并且 Git porcelain 状态为空时才算完成。
- 项目根目录 `.gitignore` 必须恰好一次包含 `/release/` 和 `/.release-clean.*`；构建流水线负责原子刷新的当前结果目录，以及同根目录中断后遗留的清理或候选暂存目录。

## 完成要求

报告 Git 边界、基线和干净状态、环境门禁、已选接口、全部四项策略值、可选的 Harness 溯源锁或未来初始基线审计、已创建成员、测试与构建证据、已排除的项目记忆流、已删除的初始化路径、保留的 `$upgrade-harness` 与 Skills/约束地图、未验证平台、`productDefinitionRequired=true`，以及标记为 `Not run`（非验证里程碑）的冒烟或 E2E。
