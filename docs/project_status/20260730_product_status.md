# 项目状态

> 记忆日期：2026-07-30

## 当前阶段

- 产品规格：Approved；2026-07-30 已批准移除独立 WEB 支持，同时保留 Tauri GUI 的 React、TypeScript、Mantine UI、TanStack Router、TanStack Query 与 Jotai 技术硬规则。
- Harness 版本：根 `Version.md` 记录 `202607301002` / `Unreleased`，`1.0.0` 仅保留为旧版本标识；模板没有具体产品业务代码或最终应用产物。
- 当前变更：独立 WEB 支持已从 Skills、初始化、环境门禁、发布/E2E入口、当前文档和 validator 移除；Tauri GUI 已自包含原有固定 Web 前端技术栈。非空单元测试、Python 编译、shell 语法和完整 Harness validator 已通过。不改变 Worktree 隔离、前台可见性、验证分层、下游 SemVer 或发布门禁。
- 当前计划：见 [`docs/work_plan/20260730_work_plan.md`](../work_plan/20260730_work_plan.md)。
- Git 状态：主实现提交 `daecc6c` 已推送到 `origin/master`；本次未创建 tag 或正式发布。

## 已完成且仍有效

- 独立下游 Git 根、一次性初始化裁剪、Rust 1.90、shared core、CLI/TUI/MCP/GUI 四类接口独立可选、条件开发环境、身份全量改名、按日项目记忆和双语企业专有许可继续有效。
- 并行模式仍需当前编码/实现任务明确授权，只在至少两个独立写入范围可安全拆分时使用；写入型 Subagent 仍使用独立 Worktree/分支和 helper `guard`。
- 主 Agent 仍须公开所有权与阶段状态、同步等待全部必需结果；重叠写入转为串行。
- 开发/发布验证分层和发布构建前手动验收门禁继续有效。
- 2026-07-29 技术债收口范围已获人工批准；LIM-020、LIM-022 已关闭，LIM-021 保持 `Mitigated`，Harness 整体仍为 `Partially verified`。
- 2026-07-30 当前变更范围已获项目负责人人工批准并达到 `Verified`；外部平台、真实下游、发布制品和开放技术债仍使 Harness 整体保持 `Partially verified` / `Unreleased`。

## 本次范围

- 删除独立 `$add-web-adapter` Skill、`WEB` 初始化选项、`<project-id>_web` 目录规则、WEB 专属构建/验收边界和对应 validator 契约。
- 把 GUI 仍需的 React 前端基线迁入 `$add-gui-adapter` 自有路径，保留 Tauri GUI 的 Node.js/pnpm 门禁与固定 React 技术栈。
- 同步 `AGENTS.md`、README、Rust/方法论文档、相关 Skills、validator、门禁测试和项目记忆。
- 历史日期文件保留当时事实；当前入口、最新事实源和可执行契约不得继续把 WEB 暴露为支持接口。

## 未完成与剩余风险

- Windows PowerShell 只完成静态契约检查，真实 Windows/Linux 门禁与真实 Tauri GUI 下游仍为 `Unverified`。
- 历史日期文件保留旧五接口事实；当前消费者必须按索引读取最新 Product Spec、Status、Plan 和 ADR，不得把历史快照当作当前入口。
- 阶段边界依赖 Agent 按任务目的判断；混合任务只在进入实际编码/实现前询问一次。
- 分钟级版本无法表达同一分钟内的多个不同版本，当前规则要求等待下一分钟。
- helper guard 不能阻止绕过 helper 的宿主写入，LIM-021 仍为 `Mitigated`。
- Windows/Linux、PowerShell 原生执行、非 CLI 下游和真实 GitHub runner 的既有 `Unverified` 边界继续存在。
- LIM-004、LIM-005、LIM-007 至 LIM-019 仍依赖外部前置条件。

## 下一步

1. 由项目负责人审查当前差异；若要求交付验收，再单独使用 `$verify-delivery`，不得把本轮开发检查冒充人工复核。
2. 在首个真实 Tauri GUI 下游验证固定技术栈、Node/pnpm、locked production build 与当前平台启动行为。
3. 后续接口扩展只允许 CLI/TUI/MCP/GUI；重新引入独立 Web 必须重新通过范围闸门和 ADR。
