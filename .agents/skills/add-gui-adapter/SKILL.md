---
name: add-gui-adapter
description: 为已初始化的共享核心增加可选的 Tauri 2 GUI，并使用固定的 React、TypeScript、Mantine UI、TanStack Router/Query 和 Jotai 前端技术栈。在初始化时选择 GUI 或后续明确批准 GUI 时使用。
---

# 增加 GUI 适配器

直接在共享核心之上增加最小的已批准 Tauri 2 桌面接口。GUI 与 CLI、TUI 和 MCP 相互独立。

## 工作流程

1. 先判断调用模式。由 `$initialize-rust-project` 分派时是“中性初始化”，只读 `AGENTS.md`、Agent Policy、`docs/ENGINEERING_RULES.md` 和 Rust/GUI 基线，不要求 Product Spec、Work Plan、ADR 或 Verification；初始化后新增 GUI 是公开接口、权限和分发边界变更，进入里程碑路径并按需读取当前产品事实和计划。
2. 确认当前工作目录是真实下游 Rust 工作区，具有共享核心，且初始化选择或已批准产品范围中记录了 GUI。`Draft` 项目只能获得不含业务操作的中性脚手架状态 GUI。若当前目录只是文档 Harness，或缺少核心，则停止。不得要求另选目标目录，也不得要求 CLI。
3. 选择依赖或设计页面前，完整阅读 [references/gui-baseline.md](references/gui-baseline.md) 和 [references/react-frontend-baseline.md](references/react-frontend-baseline.md)。
4. 首次真实产品 GUI 开发任务前，要求存在由 `$prepare-gui-app-identity` 生成且已批准的 `docs/GUI_APP_PROFILE.md`。它必须覆盖应用显示名称、主窗口标题、说明、应用标识符和用户选择的图标路径。只有在明确阻断打包/发布时，临时中性脚手架图标才能解除非打包开发的阻断。
5. 识别已批准的人类使用场景、最小页面和操作、状态与错误展示、键盘与无障碍要求、刷新/并发语义、平台集成、隐私边界和预期分发格式。只询问会实质改变范围的缺失选择。
6. 中性初始化直接按接口选择建立无业务 GUI，不创建 Work Plan；初始化后新增真实 GUI 时编辑前使用 `$plan-change`。GUI 适配器必须与 CLI 解析和 MCP 协议代码相互独立。
7. 执行时检查官方软件包仓库和文档。使用满足 Rust MSRV、Node 与 pnpm 策略、目标 WebView/平台、安全和锁定验证门禁的最新兼容稳定 Tauri 2、React、TypeScript、Mantine UI、TanStack Router、TanStack Query 与 Jotai 版本。这些技术对 `Draft` 和 `Approved` GUI 项目都是硬规则；技术栈不兼容时必须阻断实施，直到记录硬规则例外。
8. 在 `<project-id>_gui` 中增加桌面应用边界，并将该标识用于 Cargo 软件包、Rust crate 和真实应用二进制。不得要求独立二进制名称；面向用户的名称来自已批准 GUI 资料。复用 Tauri 基于 Tokio 的单例异步运行时；不得创建嵌套 Tokio 运行时。Tauri Rust 适配器可以依赖核心；核心不得依赖 Tauri、WebView、React、路由、查询、命令、窗口或前端状态类型。维护的 Rust/前端代码和测试必须遵守工程规则。
9. 公开窄而有类型的普通 `async fn` Tauri 命令，用于验证输入、调用异步核心 API 并映射结果。I/O、等待、计时器和进程调用保持异步。只有测量确认的 CPU 密集工作才可考虑 Tauri 异步运行时的 `spawn_blocking` 或另行批准的线程边界，并记录所有权、取消、并发上限、资源预算和测试。仅支持阻塞调用的依赖应替换为异步能力，否则停止并进入范围或硬规则例外流程。为命名窗口/WebView 使用明确 CSP 及最小能力、权限和作用域集合。默认只加载打包的本地内容。
10. 只实现已批准管理闭环。使用 Mantine UI 负责组件/布局，TanStack Router 负责导航，TanStack Query 负责命令支撑的异步状态，Jotai 只负责跨组件客户端交互状态。不得把 Query/核心/持久数据镜像到 atom 中。
11. 稳定资源 ID 必须与视图位置分离，选择范围和批处理范围必须明确，真实展示空/加载/错误状态，并从共享核心/存储获取全部持久状态。
12. 测试 Rust 异步命令映射、任务取消、核心成功路径、最高风险失败、路由、查询生命周期、Jotai 转换、前端交互、键盘导航、无障碍语义、能力拒绝、并发刷新/写入行为，以及版本/关于信息。布局属于验收范围时使用视觉质量检查。
13. 中性初始化运行 Rust/前端格式、类型、代码规范、非空测试和相关构建后返回 `$initialize-rust-project`，不调用 `$verify-delivery`。初始化后 Todo 全部 `done` 时创建锁定的桌面生产制品并使用 `$verify-delivery`；只有该里程碑决定启动冒烟和界面 E2E。缺少签名身份、证书或公证凭据不阻断本地里程碑验证，将制品记录为 `unsigned`；只能验证有真实证据的平台。
14. 若已批准分发目标要求签名、公证、商店提交或签名更新器制品，在独立渠道门禁通过前，发布就绪状态必须保持受阻。不得把 `unsigned` 构建成功转化为分发就绪。
15. 只更新被触发的产品、状态、计划、决定、验证、发布说明和变更记录。只有另行授权发布工作后才能增加发布自动化；不得声称已获人工批准。

## 硬边界

- GUI 必须保持独立，并通过相同核心和错误模型与每个已选适配器保持行为一致。
- 绝不能从 GUI 自动操作 CLI 或解析 CLI 输出。
- 绝不能把业务规则、持久状态、迁移或平台无关验证放入 React 组件、路由、查询、atom 或事件处理器。
- 不得创建第二套存储或由前端拥有的权威数据副本。
- 不得仅因 GUI 较小或熟悉其他技术栈就替换任何固定 React 前端库。偏离必须形成硬规则例外 ADR。
- 未经批准的真实需要，不得启用远程 URL、宽泛 Tauri 权限、插件、伴随进程、托盘、自动启动、更新器或平台集成。
- 没有真实项目需求时，不得增加其他路由器、服务器状态缓存、通用全局存储或可选前端包。
- 不得用同步 I/O、休眠、进程等待或 CPU 密集命令阻塞 Tauri 的 Tokio 运行时，也不得创建嵌套运行时。
- 不得仅为编译、测试或构建本地里程碑候选而要求签名材料；里程碑冒烟可以使用 unsigned 制品。分发渠道签名要求仍是独立发布门禁。
- 不得在本 Skill 中捆绑 GUI 起始资产；调用时应从真实下游产品契约派生页面。

## 完成输出

报告已解析的 Tauri/前端版本、页面和命令、Mantine 组件、Router/Query/Jotai 所有权、核心映射、能力/CSP 边界、交互/无障碍检查、运行过的命令、已验证平台、未验证范围和剩余风险。
