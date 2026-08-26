---
name: desktop-add-cli-adapter
description: 为已初始化的下游项目增加可选的非交互式 CLI 适配器。在初始化时选择 CLI 或后续明确批准 CLI 时使用；选择其他接口时不得要求同时存在 CLI。
---

# 增加 CLI 适配器

在共享核心之上增加最小且适合 Agent 使用的命令接口。只有初始化未收到任何接口选择时才默认使用 CLI；明确选择 TUI、MCP 或 GUI 时，绝不静默附加 CLI。

## 工作流程

1. 先判断调用模式。由 `$desktop-initialize-rust-project` 分派时是“中性初始化”，只读 `AGENTS.md`、Agent Policy、`docs/ENGINEERING_RULES.md`、CLI 契约和 Rust 基线，不要求 Product Spec、Work Plan、ADR、Verification 或 `$desktop-manage-version`（初始版本由 `$desktop-initialize-rust-project` 统一建立）；初始化后新增 CLI 是新增用户可见能力，只有在改变产品边界时才先更新 Product Spec，再以 `--kind feature` 调用 `$desktop-manage-version plan` 取得稳定 `change_id` 与 `required_version`，然后直接实施，不自动创建 Work Plan 或完整验收记录，并在本次相关测试通过后以相同参数调用 `apply`。
2. 确认已记录的接口选择包含 CLI。只能在当前项目根目录中工作，并确定性派生 `<project-id>_cli`；绝不要求另选目录或二进制名称。
3. 要求已存在初始化完成的共享核心。`Draft` 产品只能获得中性的 `scaffold status` 适配器，并返回 `productDefinitionRequired=true`；已批准产品只能获得计划内命令。
   每个已批准命令必须先映射到一个既有或本次先实现的 core 用例 API 及其 core 成功/最高风险失败测试。当前只有 CLI 也不得把业务规则、语义校验、默认值或调用编排放入 CLI。
4. 使用 Tokio current-thread 异步入口，并只启用最低所需特性。新增 registry 直接依赖必须声明完整三段 Cargo 兼容下界，以临时最低直接版本解析和项目最低 MSRV 工具链运行相关测试，再由正常 `Cargo.lock` 固定实际解析结果；不得使用精确 `=`、通配符、tag 或“最新”替代兼容下界。I/O、等待、计时器、进程及其他延迟型工作从命令到核心的路径默认保持异步；不得仅因使用 Tokio 就启用 `rt-multi-thread`。只有测量确认的 CPU 密集工作才可考虑 `spawn_blocking`、专用线程或多线程运行时，并记录所有权、取消、并发上限、资源预算和测试。仅支持阻塞调用的依赖应替换为异步能力，否则停止并进入范围或硬规则例外流程；不得静默用线程包裹。
5. 完整实现 `docs/CLI_CONTRACT.md` 规定的非交互行为和 `--json` 行为。CLI 只处理参数是否可解析、协议必填项、标准流和退出码；值域、跨字段约束、资源状态、业务权限和影响业务结果的默认值必须交给 core。不得把 TUI 代码路径作为调用核心操作的唯一方式。
6. 先测试 core 成功路径和最高风险领域失败，再测试真实二进制的命令到 core 映射、JSON 解析、标准输出/标准错误分离、退出码、`--help`/`--version`，以及拒绝等待输入。处于 `Draft` 时还要拒绝未批准的业务命令。
7. 实现期间只运行本次 CLI/core 变化必需的非空单元与回归测试；不因新增适配器自动追加全仓格式、lint、静态、构建、冒烟、E2E 或完整验收。真实二进制黑盒检查仅在它是本次接口变化最高风险失败路径的必要回归，或用户明确要求构建/验收时运行。
8. 中性初始化完成本次必要测试后返回 `$desktop-initialize-rust-project`。初始化后新增真实 CLI 也直接收口；只有用户另行显式请求构建时才调用 `$desktop-build-rust-release`，由构建流程先逐次确认 E2E 并全量运行单元测试。记录实际验证平台，其他平台标记为 `Unverified`。

## 边界

- CLI 依赖核心；核心绝不依赖 CLI、clap、终端 I/O 或进程退出状态。
- CLI handler 只构造 core 请求、调用一个 core 用例并映射结果；若需要以条件、重试或状态决策编排多个 core 调用，必须把编排提升到 core。
- 明确选择接口后，CLI 是可选项；不得仅为满足旧 Harness 规则而增加 CLI。
- 不得解析其他适配器的输出，也不得重复或首次实现业务规则；“当前只有 CLI”不是例外。
- 不得用同步 I/O、休眠、进程等待或 CPU 密集循环阻塞异步运行时。线程边界必须有测量确认的 CPU 密集工作依据；仅支持阻塞调用的依赖必须替换，或按例外获得批准。
- 随附的 `rust-lib-cli` 资产是中性 CLI 验证资产，不是选择其他接口的项目必须具备的内容。

## 完成输出

报告每个命令的“CLI 命令 → core API → core 测试”映射、输出契约、本次实际运行的测试、已验证平台、未验证平台和剩余风险；未显式构建时不得虚构制品路径或发布结论。初始化后新增时还报告 `change_id`、`required_version` 与是否实际提升；中性初始化不报告版本分类。
