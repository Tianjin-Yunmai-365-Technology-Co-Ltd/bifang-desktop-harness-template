# Agent-first Harness 项目模板

一个让 AI Agent 帮你创建和维护跨平台小工具的工程模板。

你只需要告诉 Agent：项目叫什么、放在哪里、要支持哪些平台，以及需要 CLI、TUI、MCP、GUI 中的哪些界面。它会创建一个独立的 Git 项目，搭好共享核心、所选界面、开发规则和交付流程。之后你可以直接说要改什么，Agent 会完成实现并运行这次改动真正需要的测试。

这个仓库不是一款可以直接安装的应用，也不包含任何具体产品的业务代码。它更像一套已经整理好的“开工方式”，适合用 AI Agent 持续开发专有、可商业化的小工具。

## 能做什么

- 从一份简短的初始化表单创建全新的项目，不需要手动复制和改名。
- 在 CLI、TUI、MCP、GUI 中自由选择一种或多种界面；没有特别选择时默认使用 CLI。
- 默认使用 Rust 2024 和共享核心，让业务规则只写一次，再由不同界面调用。
- 为日常开发、测试、版本管理、构建和发布准备好对应的自动化流程（Skills）。
- 把独立工作拆成 Codex 左侧 Task，每个 Task 使用自己的工作目录（Worktree）、分支和可审查提交。
- 按明确发布请求自动形成可审计的本地提交并构建可追溯候选；GUI 在打包前还会检查启动、交互、CPU 与内存预算，没有真实验证过的平台会明确标为 `Unverified`。
- 把新版 Harness 的工程规则安全同步到已有项目，同时保护产品代码和本地决定。

日常开发不会因为任务看起来复杂，就自动增加长计划、全仓检查、构建或端到端测试（E2E）。只有你明确要求，或者任务确实碰到安全、数据迁移、凭据、发布等风险时，才会进入相应流程。

## 它不会替你决定什么

- 不会猜测产品要解决什么问题，也不会把中性脚手架当成已经完成的产品。
- 不会自动使用凭据、签名、推送、发布或操作生产环境。
- 不会为了“以后可能用到”预先加入业务、依赖或复杂架构。
- 不会绕过安全、隐私、商业许可和分发渠道的硬要求。

产品方向、关键取舍和最终发布仍由人决定；Agent 负责把已经确认的事情做完整、留下可检查的结果。

## 当前模板仓库的请求边界

打开本仓库时，Agent 只接受两类信息：Harness 自身的工程维护需求，以及创建终端下游所需的固定初始化字段和所选初始化路径精确要求的身份选择。产品目的、业务功能、产品专属页面/文案/数据、远程地址、凭据、产品构建或发布需求不会被写入或实现在本模板中；请先完成实例化，或切换到已经存在的终端下游项目根目录，再在那里定义和开发产品。

如果一条消息同时包含初始化字段和产品需求，Agent 只解析允许的初始化字段，并明确拒绝把产品部分保存到 Harness 或中性脚手架。产品部分必须在完成实例化并切换到唯一终端下游根目录后重新提出，避免模板项目与具体产品的事实混在一起。

## 第一次使用

1. 在 Codex 中打开这个仓库，然后告诉 Agent：

   ```text
   请使用 $desktop-instantiate-project 创建一个新项目。
   ```

2. Agent 会一次询问尚未确定的基础信息：中英文项目名、项目标识、保存路径、负责人、目标平台、界面组合和 Agent 策略。中英文名称至少提供一个，另一个可以由 Agent 翻译后一起确认。
3. 如果选择 GUI，Agent 还会逐项确认系统托盘、系统通知、开机自启、关于页、赞助页、单实例和侧栏样式，并按固定的 `candidate-1` → `candidate-2` → `candidate-3` 顺序展示 3 个未经验证或标准化的原始 Logo 候选。只有你选定其中一个后，Agent 才会验证并按需标准化所选项；未选项不会被额外处理。
4. 写入前，Agent 会展示完整汇总和最终项目路径。你确认后，它才会创建文件、检查所需环境并初始化项目。
5. 汇总确认后，Agent 会先检查 Git，缺失时按当前平台的受管方式安装；随后才写入脚手架。建立独立仓库时，若作者信息缺失，会只在这个仓库静默使用设备账户名的英文形式和 `<设备账户名>@gmail.com` 补齐，不修改全局 Git 设置。完成后会返回 Git 版本、是否安装、作者信息、来源、作用域和基线提交，并得到一个独立、无远端、带初始化提交的 Git 仓库。

## 下游项目日常怎么用

完成实例化并切换到终端下游根目录后，不需要记住整套流程，直接告诉 Agent 你想得到什么结果即可。例如：

- “实现这个功能”或“修复这个问题”：使用 `$desktop-implement-change` 直接开发，并运行相关测试。
- “先把产品范围说清楚”：使用 `$desktop-define-product` 整理目标、边界和成功标准。
- “构建 CLI 发布候选”：使用 `$desktop-build-rust-release`。
- “准备并构建发布”：使用 `$desktop-prepare-release`；这个明确发布请求会复核并本地提交范围内改动，然后直接构建，不再为提交或构建重复审批。普通“构建候选”不会自动提交。
- “构建桌面 GUI 发布候选”：使用 `$desktop-build-tauri-release`；GUI 正式发布还会固定运行 `$desktop-test-gui-release-performance`。
- “完整验收这个候选”：使用 `$desktop-verify-delivery` 检查真实产物。
- “把这个项目升级到新版 Harness”：使用 `$desktop-upgrade-harness`，先预览差异再应用。

如果一项工作需要单独审查，可以新建一个左侧 Task。一个 Task 只做一个明确结果，不直接修改主工作目录，也不会自行合并或发布。详细规则见 [Agent 运行策略](docs/AGENT_POLICY.md)。

## 开发与构建边界

日常开发直接使用 `$desktop-implement-change`，只增加并运行本次变更需要的单元/回归测试；普通缺陷修复、不改变可观察行为的纯重构、文档或内部清理不会自动升级版本，也不自动增加计划、全仓检查、构建、冒烟、发布候选 E2E 或验收步骤。

显式构建时，构建 Skill 只读校验并把同一日志打入候选，再解析本次是否启用 E2E，运行项目全部非空单元测试并构建。构建事实只写入 `release/` manifest 和最终回复，不创建或更新 ADR、Changelog、Product Status、Work Plan、Verification 等项目记忆。GUI 的活动选项卡、查询/筛选、排序和分页只在当前进程跨路由保留；只有成功查询的当前页大于 1 且为空时回退第 1 页。按钮、链接和开关由自身处理动作，父级容器不得代理子动作。

Core-first 是强制规则：值域、跨字段关系、业务默认值和可复用状态转换进入 shared core；CLI/TUI/MCP/GUI 只负责各自协议、展示和系统能力。系统托盘、窗口、通知和登录项等宿主机制留在 GUI adapter，但其业务效果仍调用 core。维护者可运行 `python3 -B -m unittest discover -s scripts` 验证 Harness 的非空回归。

依赖清单保存经过验证的最低兼容稳定版本范围和完整三段下界，锁文件保存当前实际解析结果；新加入依赖时优先选择 registry 当前最新兼容稳定版。Rust 最低版本为 1.95，更高兼容工具链直接通过。文件与测试组织遵守 [工程维护规则](docs/ENGINEERING_RULES.md) 和 [GUI 设计标准索引](docs/design_standards/README.md)：Rust 代码超过 400 行建议重构、超过 800 行强制拆分；前端代码超过 500 行建议重构、超过 1000 行强制拆分；Rust 模块拆分使用 `<module>/mod.rs`。

每次正式发布使用同一份双语 `release-notes.json`；每版两类各至多 10 个翻译对并只保留近 5 版。用户可见版本只显示一个小写 `v`，机器字段不带前缀。

## 开始一个左侧 Task

只有用户明确要求并行时才增加 Subagent/Worktree 协作。创建左侧 Task 前先确认主目录基线干净，为这个独立目标选择项目 Worktree 和 `codex/*` 分支；Task 在自己的 Worktree 完成一组可审查提交，不自行合并。主任务复核提交、测试证据和风险后负责整合。

## Skills 索引

初始化与接口：`$desktop-instantiate-project`、`$desktop-initialize-rust-project`、`$desktop-check-development-environment`、`$desktop-add-cli-adapter`、`$desktop-add-tui-adapter`、`$desktop-add-mcp-adapter`、`$desktop-add-gui-adapter`、`$desktop-add-gui-system-notifications`、`$desktop-add-gui-autostart`、`$desktop-prepare-gui-app-identity`、`$desktop-prepare-gui-support-surfaces`、`$desktop-rename-project-identity`、`$desktop-extract-i18n-strings`。

开发与治理：`$desktop-define-product`、`$desktop-plan-change`、`$desktop-implement-change`、`$desktop-refactor-code`、`$desktop-manage-version`、`$desktop-configure-git-commits`、`$desktop-run-parallel-worktrees`、`$desktop-curate-harness-memory`、`$desktop-upgrade-harness`。

构建与验收：`$desktop-prepare-release`、`$desktop-build-rust-release`、`$desktop-build-tauri-release`、`$desktop-prepare-cross-platform-release`、`$desktop-collect-release-artifacts`、`$desktop-test-gui-initialization-e2e`、`$desktop-test-gui-release-performance`、`$desktop-test-final-artifact-e2e`、`$desktop-verify-delivery`。

## 可以创建哪些界面

- **CLI**：适合脚本和 Agent 调用，支持非交互运行和统一 JSON 输出。
- **TUI**：适合在终端中用键盘操作，基于 Ratatui 与 tui-realm。
- **MCP**：提供 Rust stdio MCP 服务器，让其他 Agent 或 MCP 客户端调用共享能力。
- **GUI**：基于 Tauri 2、React 和 Mantine 的桌面界面，可按初始化选择加入托盘、系统通知、开机自启、单实例、关于页和赞助页。

这些界面可以单独使用，也可以组合使用。与界面无关的业务规则统一放在共享核心（shared core）中，界面只负责输入、展示和系统交互。

## 当前状态

- 维护状态：Active
- 中文名称：Agent-first Harness 项目模板
- English name: Agent-first Harness Template
- 当前版本：v202608281139
- 发布状态：Unreleased
- 产品规格：Approved
- 具体产品源码：不包含

版本的唯一事实来源是 [`Version.md`](Version.md)，采用上海时区 `YYYYMMDDHHMM`。模板版本和新项目自己的版本分开管理，不会互相覆盖。

## 项目结构

- `.agents/skills/`：创建项目、开发、测试、构建、验收和升级时使用的 Agent Skills。
- `docs/`：产品规格、工程规则、接口契约、设计标准和发布说明。
- `scripts/`：模板一致性与关键规则的检查工具。
- `AGENTS.md`：轻量启动门禁与任务路由；具体规则、门禁和 Skills 按当前任务渐进读取。

## 进一步了解

- [当前产品范围](docs/product_spec/README.md)
- [Agent 运行策略](docs/AGENT_POLICY.md)
- [工程维护规则](docs/ENGINEERING_RULES.md)
- [Rust 与各类界面的初始化基线](docs/RUST_CLI_TEMPLATE.md)
- [构建与发布规则](docs/RELEASE.md)
- [验证方式与证据入口](docs/VERIFICATION.md)

## 许可

本项目是专有商业软件，不是开源项目。使用、复制或分发前，请阅读[中文许可协议](LICENSE.zh-CN.md)或[英文许可协议](LICENSE.en.md)。
