---
name: desktop-add-gui-adapter
description: 为已初始化的共享核心增加可选的 Tauri 2 GUI，并使用固定的 Vite、React、TypeScript、Mantine UI、TanStack Router/Query、Jotai、前端质量工具链，以及 i18next/react-i18next + rust-i18n 的界面国际化技术栈（开发期硬性必选，默认跟随系统语言）。在初始化时选择 GUI 或后续明确批准 GUI 时使用。
---

# 增加 GUI 适配器

直接在共享核心之上增加最小的已批准 Tauri 2 桌面接口。GUI 与 CLI、TUI 和 MCP 相互独立。

## 工作流程

1. 先判断调用模式。由 `$desktop-initialize-rust-project` 分派时是“中性初始化”，只读 `AGENTS.md`、Agent Policy、`docs/ENGINEERING_RULES.md` 和 Rust/GUI 基线，不要求 Product Spec、Work Plan、ADR 或 Verification；初始化后新增 GUI 只有在改变产品边界时才先更新 Product Spec，然后直接实施，不自动创建计划或验收记录。
2. 确认当前工作目录是真实下游 Rust 工作区，具有共享核心，且初始化选择或已批准产品范围中记录了 GUI。`Draft` 项目只能获得不含业务操作的中性脚手架状态 GUI。若当前目录只是文档 Harness，或缺少核心，则停止。不得要求另选目标目录，也不得要求 CLI。
3. 选择依赖或设计页面前，完整阅读 [references/gui-baseline.md](references/gui-baseline.md)、[references/react-frontend-baseline.md](references/react-frontend-baseline.md) 和 [references/mantine-ui-guidelines.md](references/mantine-ui-guidelines.md)。
4. 首次真实产品 GUI 开发任务前，要求存在由 `$desktop-prepare-gui-app-identity` 生成且已批准的 `docs/GUI_APP_PROFILE.md`。它必须覆盖应用显示名称、主窗口标题、说明、应用标识符和用户选择的图标路径；选择 macOS DMG 时还必须记录已批准的本地拖拽背景、尺寸、落点和文案语言。只有在明确阻断打包/发布时，临时中性脚手架图标才能解除非打包开发的阻断。
5. 关于/支持/赞助、动态标题、更新检查与遥测不属于本 Skill 的起始页面。只有产品明确批准对应能力时才调用 `$desktop-prepare-gui-support-surfaces`，并按其产品实例、core/adapter 所有权、共享品牌依赖、最小出站和秘密隔离边界实施；未选择的能力不得生成路由、运行时媒体、网络请求或占位配置。GUI 下游必须完整保留该条件 Skill 的品牌源资产，不能因中性初始化未使用就裁掉其内部文件。
6. 识别已批准的人类使用场景、最小页面和操作、状态与错误展示、键盘与无障碍要求、刷新/并发语义、平台集成、隐私边界、预期分发格式和 i18n 接入范围（默认语言探测、语言切换入口、需要覆盖的原生文案）。只询问会实质改变范围的缺失选择。
7. 中性初始化直接按接口选择建立无业务 GUI；初始化后新增真实 GUI 也直接实施。GUI 适配器必须与 CLI 解析和 MCP 协议代码相互独立。
8. 执行时检查官方软件包仓库和文档。使用满足 Rust MSRV、Node 与 pnpm 策略、目标 WebView/平台、安全和锁定验证门禁的最新兼容稳定 Tauri 2、Vite、React、TypeScript、Mantine UI、TanStack Router、TanStack Query、Jotai、ESLint/`typescript-eslint`、Prettier、Vitest 与 Testing Library 版本。这些技术对 `Draft` 和 `Approved` GUI 项目都是硬规则；技术栈不兼容时必须阻断实施，直到记录硬规则例外。
9. 在 `<project-id>_gui` 中增加桌面应用边界，并将该标识用于 Cargo 软件包、Rust crate 和真实应用二进制。不得要求独立二进制名称；面向用户的名称来自已批准 GUI 资料。复用 Tauri 基于 Tokio 的单例异步运行时；不得创建嵌套 Tokio 运行时。Tauri Rust 适配器可以依赖核心；核心不得依赖 Tauri、WebView、React、路由、查询、命令、窗口或前端状态类型。维护的 Rust/前端代码和测试必须遵守工程规则。
10. 公开窄而有类型的普通 `async fn` Tauri 命令，只验证反序列化、协议必填字段和调用窗口/WebView 能力，然后构造 core 请求、调用一个异步 core 用例并映射结果。值域、跨字段约束、资源状态、业务权限、默认值和包含条件/重试/状态决策的调用编排属于 core；Tauri Rust command 不得承载这些逻辑。I/O、等待、计时器和进程调用保持异步。只有测量确认的 CPU 密集工作才可考虑 Tauri 异步运行时的 `spawn_blocking` 或另行批准的线程边界，并记录所有权、取消、并发上限、资源预算和测试。仅支持阻塞调用的依赖应替换为异步能力，否则停止并进入范围或硬规则例外流程。为命名窗口/WebView 使用明确 CSP 及最小能力、权限和作用域集合。默认只加载打包的本地内容。
11. 只实现已批准管理闭环。使用 Mantine UI 负责组件/布局，TanStack Router 文件路由负责导航并生成唯一 `src/routeTree.gen.ts`，TanStack Query 负责命令支撑的异步状态，Jotai 只负责跨组件客户端交互状态。不得把 Query/核心/持久数据镜像到 atom 中，也不得在 React event handler、Router loader、Query mutation 或 atom 中实现业务规则和领域状态转换。
12. 稳定资源 ID 必须与视图位置分离，选择范围和批处理范围必须明确，真实展示空/加载/错误状态，并从共享核心/存储获取全部持久状态。
13. 在 GUI 前端项目自有工具目录复制 [TypeScript Compiler AST 中文注释检查器](references/check-typescript-chinese-comments.cjs) 与 [专项测试](references/check-typescript-chinese-comments.test.ts)，调整相对导入后同时接入 `pnpm lint` 和项目 validator。检查器必须识别直接及后置命名/默认导出的箭头组件与 hook，只在测试文件或显式 `vitest` 导入中识别 `test`/`it` 场景；精确排除 `src/routeTree.gen.ts`，对解析错误/非法 UTF-8/NUL/源码符号链接/空扫描失败关闭；禁止扩张到所有局部变量或普通匿名回调，禁止加入自动批量注释。
14. 先用 core 测试覆盖业务成功路径、最高风险领域失败和状态转换，再测试 Rust 异步命令映射、任务取消、路由、查询生命周期、Jotai 纯交互转换、前端交互、键盘导航、无障碍语义、能力拒绝、并发刷新/写入行为，以及版本/关于信息。布局属于验收范围时使用视觉质量检查。
15. 只有真实下游需要前端公开配置时，才建立 `development/test/release` 逻辑 profile 和类型化冻结配置对象；全部 Vite 变量视为用户可读，禁止凭据且产品模块不得散落读取 `import.meta.env`。真实需要前端日志时使用稳定、脱敏的结构化事件，优先通过窄 Tauri 命令汇入 Rust `tracing`；Release Vite `dist` 必须静态拒绝 source map、开发/测试 endpoint、debug/info 哨兵、本机路径和未经批准的 console 输出。
16. 中性初始化和后续开发只运行本次 GUI/core 变化必需的非空 Rust 与前端单元/回归测试；不自动追加全仓格式、lint、类型、静态扫描、生产构建、冒烟、E2E 或完整验收。只有用户显式请求构建时才调用 `$desktop-build-tauri-release`；构建流程必须先逐次确认 E2E，并在打包前运行完整 Rust 与前端单元测试套件，E2E 只在最终真实候选形成后按本次选择执行。
17. 缺少完整签名公证条件且渠道允许时，`$desktop-build-tauri-release` 显式生成 `unsigned` 候选；若 macOS Developer ID 直接分发条件齐全，则签名、公证与 stapling 必须作为一个阶段完成，禁止只签名中间态。渠道要求签名、公证、商店提交或签名更新器制品时，在独立渠道门禁通过前发布就绪保持受阻。
18. 只按 `docs/ENGINEERING_RULES.md` 的独立事件触发规则更新产品、状态、计划、决定、验证、发布说明和变更记录；普通缺陷修复、纯重构和内部清理本身不触发项目记忆。只有另行授权发布工作后才能增加发布自动化；不得声称已获人工批准。

## 硬边界

- GUI 必须保持独立，并通过相同核心和错误模型与每个已选适配器保持行为一致。
- 首次向用户交付的真实页面、命令结果或原生机制文案不得硬编码单一语言字符串；必须通过 `i18next`/`react-i18next`（前端）与 `rust-i18n`（Rust 原生文案）接入，默认语言跟随 `tauri-plugin-os` 探测到的系统语言，并提供可发现的语言切换入口，偏离需硬规则例外 ADR（见 ADR-20260806-001）。
- React 事件、Tauri command 和平台回调不得承载业务规则、领域校验、权威状态或跨 core 调用编排；当前只有 GUI 也不是例外。
- 绝不能从 GUI 自动操作 CLI 或解析 CLI 输出。
- 绝不能把业务规则、持久状态、迁移或平台无关验证放入 React 组件、路由、查询、atom 或事件处理器。
- 不得创建第二套存储或由前端拥有的权威数据副本。
- 不得仅因 GUI 较小或熟悉其他技术栈就替换任何固定 React 前端库。偏离必须形成硬规则例外 ADR。
- 未经批准的真实需要，不得启用远程 URL、宽泛 Tauri 权限、插件、伴随进程、托盘、自动启动、更新器或平台集成。
- 不得把来源下游产品名/标识、产品功能、路由、标题公式、更新协议、endpoint、秘密或遥测字段复制为 GUI 默认值；这些可选能力以 `$desktop-prepare-gui-support-surfaces` 为唯一入口。该 Skill 中经批准的产品家族品牌联系人、固定赞助内容、支付码、banner 与小图是封闭例外，必须按 manifest 完整保留但不自动启用页面。
- 已批准的系统托盘、窗口生命周期、通知、自动启动、快捷键和其他桌面机制在 GUI adapter 实现；其回调触发的业务动作必须调用既有 core 用例，不能直接修改权威业务状态。平台机制本身无需 core-first 例外 ADR。
- 没有真实项目需求时，不得增加其他路由器、服务器状态缓存、通用全局存储或可选前端包。
- 不得用宽泛目录名排除人工 TypeScript 源码，不得用自动生成套话代替业务注释；非 GUI 下游不适用 TypeScript 门禁，也不得因此要求 Node.js 或 pnpm。
- 不得用同步 I/O、休眠、进程等待或 CPU 密集命令阻塞 Tauri 的 Tokio 运行时，也不得创建嵌套运行时。
- 不得仅为编译、测试或构建允许 unsigned 的本地候选而要求签名材料；经批准的候选冒烟可以使用明确 unsigned 制品。Developer ID 直接分发一旦使用签名身份，就必须同时完成公证与 stapling，不能交付只签名制品。
- 不得在本 Skill 中捆绑页面、业务操作或产品状态等 GUI 起始资产；调用时应从真实下游产品契约派生页面。产品家族品牌支持资产只存在于独立的 `$desktop-prepare-gui-support-surfaces` 条件 Skill；随附中文注释检查器只属于治理工具参考，不是页面或业务资产。

## 完成输出

报告已解析的 Tauri/前端版本、页面和命令、Mantine 组件、Router/Query/Jotai 所有权，每个业务操作的“GUI 事件/命令 → core API → core 测试”映射，i18n 接入范围（默认语言探测、语言切换入口、Rust 原生文案覆盖）、TypeScript 中文注释门禁与最终 `dist` 扫描、adapter-only 平台机制理由、能力/CSP 边界、映射/交互/无障碍检查、运行过的命令、已验证平台、未验证范围和剩余风险。
