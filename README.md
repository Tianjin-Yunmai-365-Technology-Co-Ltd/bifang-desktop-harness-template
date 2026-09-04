# 毕方桌面应用Harness模版

Bifang Desktop Harness Template

这份 README 是给人读的入口：说明模板做什么、第一次怎么创建项目、下游日常怎么用、当前名称/版本/许可，以及本仓库现在不接受哪些产品需求。给 Agent 的启动门禁和任务路由见 [`AGENTS.md`](AGENTS.md)。

一个让 AI Agent 帮你创建和维护跨平台小工具的工程模板。

你只需要告诉 Agent：项目叫什么、放在哪里、要支持哪些平台，以及需要 CLI、TUI、MCP、GUI 中的哪些界面。它会创建一个独立的 Git 项目，搭好共享核心、所选界面、开发规则和交付流程。之后你可以直接说要改什么，Agent 会完成实现并运行这次改动真正需要的测试。

这个仓库不是一款可以直接安装的应用，也不包含任何具体产品的业务代码。它更像一套已经整理好的“开工方式”，适合用 AI Agent 持续开发专有、可商业化的小工具。

## 能做什么

- 从一份简短的初始化表单创建全新的项目，不需要手动复制和改名。
- 在 CLI、TUI、MCP、GUI 中自由选择一种或多种界面；没有特别选择时默认使用 CLI。
- 默认使用 Rust 2024 和共享核心，让业务规则只写一次，再由不同界面调用。
- 为日常开发、测试、版本管理、构建和发布准备好对应的自动化流程（Skills）。
- 按用户明确要求把独立结果创建为绑定保存项目的 Codex 左侧 Task；Git Task 使用自己的 Worktree、分支和可审查提交。
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
3. 如果选择 GUI，Agent 还会逐项确认系统托盘、系统通知、开机自启、关于页、赞助页、单实例、深链接、全局快捷键和侧栏样式；system-locale、updater、window-state、dialog 作为固定基线不额外询问。dialog 默认向主窗口开放全部官方对话框类型，但不授权通用文件读写。启用全局快捷键只安装能力，中性初始化不绑定默认按键或动作；产品动作、固定/可编辑策略和初始 chord 在终端下游完全按需求决定。随后按固定的 `candidate-1` → `candidate-2` → `candidate-3` 顺序展示 3 个未经验证或标准化的原始 Logo 候选。只有你选定其中一个后，Agent 才会验证并按需标准化所选项；未选项不会被额外处理。
4. 写入前，Agent 会展示完整汇总和最终项目路径。你确认后，它才会创建文件、检查所需环境并初始化项目。
5. 汇总确认后，Agent 会先检查 Git，缺失时按当前平台的受管方式安装；随后才写入脚手架。建立独立仓库时，若作者信息缺失，会只在这个仓库静默使用设备账户名的英文形式和 `<设备账户名>@gmail.com` 补齐，不修改全局 Git 设置。完成后会返回 Git 版本、是否安装、作者信息、来源、作用域和基线提交，并得到一个独立、无远端、带初始化提交的 Git 仓库。

## 下游项目日常怎么用

完成实例化并切换到终端下游根目录后，不需要记住整套流程，直接告诉 Agent 你想得到什么结果即可。例如：

- “实现这个功能”或“修复这个问题”：使用 `$desktop-implement-change` 直接开发，并运行相关测试。
- “先把产品范围说清楚”：使用 `$desktop-define-product` 整理目标、边界和成功标准。
- “在 Windows 上打一个本地安装试包”或普通“构建/打包”：使用 `$desktop-build-tauri-local-install`；它允许基于当前工作树生成未签名 NSIS，只供本机检查，不提交、不生成发布日志、不写 `release/`，也不询问 E2E 或性能选择。
- “构建 CLI 发布候选”：使用 `$desktop-build-rust-release`。
- “准备并构建发布”：使用 `$desktop-prepare-release`；这个明确发布请求会复核并本地提交范围内改动，然后直接构建，不再为提交或构建重复审批。普通“构建候选”不会自动提交。
- “构建桌面 GUI 发布候选”：使用 `$desktop-build-tauri-release`；每次 GUI 发布都会先询问本次是否运行 `$desktop-test-gui-release-performance`，当前请求已经明确时直接复用，不写入持久偏好。
- “完整验收这个候选”：使用 `$desktop-verify-delivery` 检查真实产物。
- “把这个项目升级到新版 Harness”：使用 `$desktop-upgrade-harness`，先预览差异再应用。

如果一项工作需要成为可独立进入和审查的结果，可以明确要求新建一个左侧 Task。诊断、实现、相关测试/review 和同范围修复不会仅因阶段变化被自动拆开；plan、Todo 和 Subagent 仍是当前 Task 的内部结构。详细规则见 [Agent 运行策略](docs/AGENT_POLICY.md)。

## 开发与构建边界

日常开发直接使用 `$desktop-implement-change`，只增加并运行本次变更需要的单元/回归测试；普通缺陷修复、不改变可观察行为的纯重构、文档或内部清理不会自动升级版本，也不自动增加计划、全仓检查、构建、冒烟、发布候选 E2E 或验收步骤。

显式“发布候选”构建时，构建 Skill 只读校验并把同一日志打入候选，再解析本次是否启用 E2E；GUI 候选还会解析本次是否采集性能指标。未明确时在任何测试或编译前询问一次，选择只对当前候选有效。性能选择关闭且没有产品/渠道硬要求时跳过耗时探针，在 manifest 和最终回复记录 `performanceStatus: Not run` 与剩余风险；选择开启时才运行现有定量门禁。随后运行项目全部非空单元测试并构建。普通 Windows 本地安装试包是开发制品，不进入上述候选流程，也不要求发布日志或 clean HEAD。构建事实只写入适用的产物位置和最终回复，不创建或更新 ADR、Changelog、Product Status、Work Plan、Verification 等项目记忆。GUI 的活动选项卡、查询/筛选、排序和分页只在当前进程跨路由保留；只有成功查询的当前页大于 1 且为空时回退第 1 页。按钮、链接和开关由自身处理动作，父级容器不得代理子动作。

Core-first 是强制规则：值域、跨字段关系、业务默认值和可复用状态转换进入 shared core；CLI/TUI/MCP/GUI 只负责各自协议、展示和系统能力。系统托盘、窗口、通知和登录项等宿主机制留在 GUI adapter，但其业务效果仍调用 core。维护者可运行 `python3 -B -m unittest discover -s scripts` 验证 Harness 的非空回归。

依赖清单保存经过验证的最低兼容稳定版本范围和完整三段下界，锁文件保存当前实际解析结果；新加入依赖时优先选择 registry 当前最新兼容稳定版。Rust 最低版本为 1.95，更高兼容工具链直接通过。文件与测试组织遵守 [工程维护规则](docs/ENGINEERING_RULES.md) 和 [GUI 设计标准索引](docs/design_standards/README.md)：Rust 代码超过 400 行建议重构、超过 800 行强制拆分；前端代码超过 500 行建议重构、超过 1000 行强制拆分；Rust 模块拆分使用 `<module>/mod.rs`。

每次正式发布使用同一份双语 `release-notes.json`；每版两类各至多 10 个翻译对并只保留近 5 版。用户可见版本只显示一个小写 `v`，机器字段不带前缀。

## 开始一个左侧 Task

只有用户明确要求新建左侧 Task 时才调用创建工具。创建者先用 `list_projects` 按完整路径锁定保存项目，再以精确 `projectId` 创建：Git 项目选择项目 Worktree，非 Git 项目选择 Local；项目工作禁止使用 projectless 目标。Worktree 物理目录可以位于保存项目之外，归属通过 `projectId`、相同 Git common dir 和仓库登记的 Worktree 共同确认。

创建接口返回真实 `threadId` 时 Task 已可管理；只返回 `clientThreadId` 时表示请求已接受但仍在 setup。创建者会报告 queued 状态后结束，不假设存在转换接口、不无限等待，也不重复创建。后续明确检查时再用 `list_threads` 对账；标题可能由应用规范化，状态保留在 Task 的实时状态中，不写进固定标题。

Ready Task 从用户明确起点或保存项目默认分支的已提交 HEAD 开始，在自己的 Worktree 和 `codex/task-*` 分支完成一组可审查提交，不自行合并。当前 Task 内部只有在用户明确要求并行且策略允许时，才使用 `$desktop-run-parallel-worktrees` 创建 `codex/unit-*` 单元和 Subagent；这些 agent thread 不是新的左侧 Task。

如果还使用全局 Task 提示词，可以继续保留“一结果一 Task、项目绑定、一次创建和不重复创建”，但不要再要求“生命周期阶段变化就拆 Task”“普通请求必须先建 Task0”“只拿到 `clientThreadId` 时无限等待”“Worktree 路径必须位于保存项目目录内”或“把实时状态写进固定标题”。这些规则会分别造成过度拆分、setup 死锁、合法 Worktree 误判和标题自相矛盾。

## Skills 索引

初始化与接口：`$desktop-instantiate-project`、`$desktop-initialize-rust-project`、`$desktop-check-development-environment`、`$desktop-add-cli-adapter`、`$desktop-add-tui-adapter`、`$desktop-add-mcp-adapter`、`$desktop-add-gui-adapter`、`$desktop-add-gui-system-locale`、`$desktop-add-gui-updater`、`$desktop-add-gui-window-state`、`$desktop-add-gui-dialog`、`$desktop-add-gui-system-tray`、`$desktop-add-gui-single-instance`、`$desktop-add-gui-deep-link`、`$desktop-add-gui-global-shortcut`、`$desktop-add-gui-system-notifications`、`$desktop-add-gui-autostart`、`$desktop-prepare-gui-app-identity`、`$desktop-prepare-gui-support-surfaces`、`$desktop-rename-project-identity`、`$desktop-extract-i18n-strings`。

开发与治理：`$desktop-define-product`、`$desktop-plan-change`、`$desktop-implement-change`、`$desktop-refactor-code`、`$desktop-manage-version`、`$desktop-configure-git-commits`、`$desktop-run-parallel-worktrees`、`$desktop-curate-harness-memory`、`$desktop-upgrade-harness`。

构建与验收：`$desktop-build-tauri-local-install`、`$desktop-prepare-release`、`$desktop-build-rust-release`、`$desktop-build-tauri-release`、`$desktop-prepare-cross-platform-release`、`$desktop-collect-release-artifacts`、`$desktop-test-gui-initialization-e2e`、`$desktop-test-gui-release-performance`、`$desktop-test-final-artifact-e2e`、`$desktop-verify-delivery`。

## 可以创建哪些界面

- **CLI**：适合脚本和 Agent 调用，支持非交互运行和统一 JSON 输出。
- **TUI**：适合在终端中用键盘操作，基于 Ratatui 与 tui-realm。
- **MCP**：提供 Rust stdio MCP 服务器，让其他 Agent 或 MCP 客户端调用共享能力。
- **GUI**：基于 Tauri 2、React 和 Mantine 的桌面界面，固定接入系统语言、窗口状态、updater 和原生 dialog 基线，并可按初始化选择加入托盘、单实例、深链接、全局快捷键、系统通知、开机自启、关于页和赞助页。

这些界面可以单独使用，也可以组合使用。与界面无关的业务规则统一放在共享核心（shared core）中，界面只负责输入、展示和系统交互。

## 当前状态

- 维护状态：Active
- 中文名称：毕方桌面应用Harness模版
- English name: Bifang Desktop Harness Template
- 当前版本：v202609020957
- 发布状态：Released
- 产品规格：Approved
- 具体产品源码：不包含

版本的唯一事实来源是 [`Version.md`](Version.md)，采用上海时区 `YYYYMMDDHHMM`。模板版本和新项目自己的版本分开管理，不会互相覆盖。这里的 `Released` 表示当前模板时间版本已作为可用模板快照记录；不表示已经创建 Git 标签、源码归档、签名候选或可安装应用。

## 项目结构

- `.agents/skills/`：创建项目、开发、测试、构建、验收和升级时使用的 Agent Skills。
- `docs/`：产品规格、工程规则、接口契约、设计标准和发布说明。
- `scripts/`：模板一致性与关键规则的检查工具。
- `Version.md`：Harness 模板当前时间版本与发布状态的唯一事实来源。
- `AGENTS.md`：轻量启动门禁与任务路由；具体规则、门禁和 Skills 按当前任务渐进读取。
- `LICENSE.zh-CN.md` / `LICENSE.en.md`：专有商业许可；适用项目名称与本 README 的中英文名称一致。

## 进一步了解

- [当前时间版本](Version.md)
- [Agent 启动规则](AGENTS.md)
- [当前产品范围](docs/product_spec/README.md)
- [Agent 运行策略](docs/AGENT_POLICY.md)
- [工程维护规则](docs/ENGINEERING_RULES.md)
- [Harness 方法论](docs/HARNESS_ENGINEERING.md)
- [Rust 与各类界面的初始化基线](docs/RUST_CLI_TEMPLATE.md)
- [构建与发布规则](docs/RELEASE.md)
- [验证方式与证据入口](docs/VERIFICATION.md)

## 许可

本项目是专有商业软件，不是开源项目。使用、复制或分发前，请阅读[中文许可协议](LICENSE.zh-CN.md)或[英文许可协议](LICENSE.en.md)。
