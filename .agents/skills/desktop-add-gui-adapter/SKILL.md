---
name: desktop-add-gui-adapter
description: 为已初始化的共享核心增加可选 Tauri 2 GUI，采用固定 React/Mantine/Tabler/Router/Query/Jotai/i18n 技术栈，并按初始化配置建立可选单实例、托盘、关于/赞助页及精简或详细侧栏。
---

# 增加 GUI 适配器

直接在共享核心之上增加最小的已批准 Tauri 2 桌面接口。GUI 与 CLI、TUI 和 MCP 相互独立。

## 固定图标契约

- `package.json` 必须把 `@tabler/icons-react` 声明为直接生产依赖，使用经过最低直接版本验证的完整三段 caret 下界；所有图标使用命名导入，保留 tree-shaking。
- 菜单、操作、状态、空态及图表周边控件存在适用 Tabler 图标时，必须优先从该包选择；不得另装图标库，也不得改用手写 SVG、字符或 emoji。数据可视化图表本身仍按真实产品需求选择图表库。
- 功能菜单项以 `TablerIcon` 组件类型注入，设置与已选赞助/关于图标由模板提供。侧栏尺寸与排版只从 `docs/design_standards/tauri_sidebar.md` 取得：compact 为 `80px` 全宽居中竖排菜单且无折叠；detailed 为 `248px` 展开、`76px` 收起、统一 `22px` 图标和 Tooltip/设备级偏好，并由 AppShell 同源同步侧栏宽度与主内容偏移。
- 偏离上述包或图标来源属于固定技术栈硬规则例外，必须先记录 ADR。

## 工作流程

1. 先判断调用模式。由 `$desktop-initialize-rust-project` 分派时是“中性初始化”，只读 `AGENTS.md`、Agent Policy、`docs/ENGINEERING_RULES.md`、`docs/design_standards/README.md` 和 Rust/GUI 基线，不要求 Product Spec、Work Plan、ADR、Verification 或 `$desktop-manage-version`（初始版本由 `$desktop-initialize-rust-project` 统一建立）；初始化后新增 GUI 是新增用户可见能力，只有在改变产品边界时才先更新 Product Spec，再以 `--kind feature` 调用 `$desktop-manage-version plan` 取得稳定 `change_id` 与 `required_version`，然后直接实施，不自动创建计划或验收记录，并在本次相关测试通过后以相同参数调用 `apply`。
2. 确认当前工作目录是真实下游 Rust 工作区，具有共享核心，且初始化选择或已批准产品范围中记录了 GUI。`Draft` 项目只能获得不含业务操作的中性脚手架状态 GUI。若当前目录只是文档 Harness，或缺少核心，则停止。不得要求另选目标目录，也不得要求 CLI。
3. 选择依赖或设计页面前，先从 [`docs/design_standards/README.md`](../../../docs/design_standards/README.md) 精确匹配设计标准，再完整阅读 [references/gui-baseline.md](references/gui-baseline.md)、[references/react-frontend-baseline.md](references/react-frontend-baseline.md) 和 [references/mantine-ui-guidelines.md](references/mantine-ui-guidelines.md)。产品 profile/当前请求中已批准的专属标准优先于 Harness 通用缺省；无匹配或特殊需求先设计并取得批准，像素偏离更新产品 GUI profile 与 ADR。
4. 中性 GUI 初始化先要求 `$desktop-prepare-gui-app-identity` 已建立 `docs/GUI_APP_PROFILE.md`：正好 3 个 1024×1024 PNG Logo 候选均已预览且有摘要，用户明确选择一个，选中母版位于 `<project-id>_gui/src-tauri/icons/app-icon-master.png`，运行时副本位于 `<project-id>_gui/public/app-identity/logo.png` 且字节一致，平台图标来自项目本地 Tauri `icon` 命令。该资料还必须有唯一 `gui-initialization-config` 代码块，`system_tray`、`about_page`、`sponsor_page`、`single_instance` 均为 `enabled`/`disabled`，`sidebar_mode` 为 `compact`/`detailed`，不得有 `pending`；侧栏未选择时写入 `detailed` 的归一化只由初始化器完成，本 Skill 只复用最终值，不重复询问或推断。`<project-id>_gui/src-tauri/icons/32x32.png` 始终必须是普通非符号链接、32×32 8-bit RGBA 非交错 PNG 且至少含一个非透明像素，并由 `bundle.icon` 引用；托盘启用时它同时是托盘来源。首次真实产品 GUI 开发再补齐应用显示名称、固定标题公式、说明、应用标识符及 DMG 背景批准/替换证据，中性初始化不得以占位图代替用户选择。
5. 调用 `$desktop-prepare-gui-support-surfaces` 按配置消费固定本地基线：动态标题、本地 Logo→当前版本、`/settings`、i18n、三态主题与完整亮暗语义主题始终建立；关于/赞助只在启用时建立路由、入口和资源，组件也不得作为不可达残留。所有 GUI 都把品牌包的 `tauri/tauri.release.conf.json` 逐字节复制为 `<project-id>_gui/src-tauri/tauri.release.conf.json`，供正式构建通过 `--config` 合并并把根 `release-notes.json` 唯一映射为候选内 `release-notes.json`；中性初始化的调试构建不使用该发布配置，因此不提前创建更新日志事实。compact 必须实现 `tauri-gui-sidebar-compact-80-v1` 的 `80px` 栏宽、`6px` 内容内边距、`36px` Logo、`22px` 图标、全宽居中名称和 `56px` 菜单项，禁止固定 `em/ch` 名称盒与折叠按钮；AppShell 复用宽度常量且 Navbar padding 为 `0`。detailed 必须实现 `tauri-gui-sidebar-detailed-v1` 的 `248px`/`76px`、`72px`/`44px`、`22px` 图标、Tooltip 和独立持久化；AppShell 固定 detailed 并从同一状态更新 `navbar.width` 与 `data-navbar-width`。产品功能项向下增长，底部顺序为已选赞助、设置、已选关于。设置页不得包含隐私/统计区块；所选关于页保留 `NotConfigured` 零出站与本地更新日志；所选赞助页使用有效主题与完整 sponsor 媒体。初始化不预创建 `docs/GUI_SUPPORT_SURFACES.md`，GUI 下游保留 Skill 品牌源资产，但运行时只复制 profile 选中的内容；只有产品明确启用统计时才另建产品级同意界面。
6. 识别已批准的人类使用场景、产品功能菜单项、状态与错误展示、键盘与无障碍要求、刷新/并发语义、平台集成、隐私边界、预期分发格式和 i18n 接入范围（默认语言探测、设置页语言切换和需要覆盖的原生文案）。产品若配置更新、强更或统计上报，完整阅读 `$desktop-prepare-gui-support-surfaces` 的 `references/update-and-telemetry.md`，只询问会实质改变范围的缺失选择。
7. 中性初始化直接按接口选择建立无业务 GUI；初始化后新增真实 GUI 也直接实施。GUI 适配器必须与 CLI 解析和 MCP 协议代码相互独立。
8. 执行时检查官方软件包仓库和文档。为 Tauri 2、Vite、React、TypeScript、Mantine UI、TanStack Router、TanStack Query、Jotai、`i18next`、`react-i18next`、`rust-i18n`、`tauri-plugin-os`、ESLint/`typescript-eslint`、Prettier、Vitest 与 Testing Library 声明满足 Rust MSRV、Node.js/pnpm、目标 WebView/平台、安全与所用 API 的最低兼容稳定范围；Rust 使用完整三段 Cargo 兼容下界，前端使用完整三段 caret 或官方支持范围，禁止普通依赖的精确版本、`latest`、tag 和通配符。只有 `system_tray: enabled` 才给 Tauri 启用 `tray-icon` feature；只有 `single_instance: enabled` 才声明官方 `tauri-plugin-single-instance`；只有 `about_page: enabled` 才复制 `rust/release_notes.rs` 与 React 更新日志运行时，并让根 Tokio 增加 `fs` feature、GUI member 以 `workspace = true` 继承 `tokio`、`serde`、`serde_json`。根 `[workspace.dependencies]` 是版本、来源与基线 feature 的唯一事实源，GUI member 只使用 `workspace = true`。未选能力不得保留相应运行时依赖或 feature，项目其他已批准能力真实需要同一依赖时除外。以临时最低直接版本解析和项目最低工具链运行相关测试，再由正常 `Cargo.lock`/`pnpm-lock.yaml` 固定实际解析结果；不兼容时提高到首个通过的稳定下界，仍不兼容则停止并记录硬规则例外。
9. 在 `<project-id>_gui` 中增加桌面应用边界，并把该标识用于 Cargo 包、Rust crate 与真实应用二进制；面向用户名称来自 GUI 资料。主窗口固定 `width: 1440`、`height: 900`、`minWidth: 960`、`minHeight: 640`、`center: true`、`preventOverflow: true` 且可调整；独立 DMG 使用项目内 `./dmg/background.png`、660×400 窗口和 `(180, 220)`/`(480, 220)` 落点，不得引用初始化后删除的 Skill 资产。仅当单实例启用时，把官方插件作为首个 plugin 注册，也就是 Tauri Builder 首插件；第二进程通知后退出且回调忽略参数/工作目录、只调用共享 `restore_main_window` 恢复既有窗口；文件关联、深链或参数转发需另行批准并经 core 判定，Snap/Flatpak 还需声明并真实验证会话 DBus 权限。仅当托盘启用时，启用 feature，并从 `.setup(...)` 安装绑定必需 `default_window_icon()`、精确 `show_window`/`quit` 双项 Menu、`.icon(...)` 与 `.build(app)` 的托盘；标签必须经 `rust_i18n` 得到中英文及英文回退并支持无重启刷新，鼠标左键/显示项复用窗口恢复；从 `.setup(...)` 接线并注册 `CloseRequested` 的 `prevent_close()`+隐藏，关闭 handler 由 `.on_window_event(...)` 实际接入，只有 `quit` 在回收 owned task 后退出。未启用托盘时不得创建托盘、菜单或关闭隐藏实现；必须通过 `.on_window_event(...)` 接线，在主窗口 `CloseRequested` 中显式调用 `AppHandle::exit(0)`，不得 `prevent_close()` 或隐藏窗口。不得默认加入自动启动。复用 Tauri 的 Tokio-backed runtime，不创建嵌套 runtime；core 不得依赖 Tauri、WebView、React、路由、查询、窗口或前端状态类型。
10. 公开窄而有类型的普通 `async fn` Tauri 命令，只验证反序列化、协议必填字段和调用窗口/WebView 能力，然后构造 core 请求、调用一个异步 core 用例并映射结果。每条真实业务路径记录“GUI 事件/命令 → core API → core 测试”；值域、跨字段约束、资源状态、业务权限、默认值和包含条件/重试/状态决策的调用编排属于 core，Tauri Rust command 不得承载这些逻辑。单实例、托盘、窗口恢复等平台机制本身无需 core-first 例外 ADR；候选静态资源读取同属 adapter 机制。`about_page: enabled` 时复制 `rust/release_notes.rs`，在 `tauri::generate_handler![...]` 注册 `load_release_notes`，以 `BaseDirectory::Resource` + `tokio::fs` 异步读取固定 `release-notes.json`，验证 1 MiB、schema、近 5 版/每类 10 条、唯一版本、最新在前和单个小写 `v` 后才通过 IPC 返回；React 复制 `releaseNotesResource.ts`，默认由 `AboutPageTemplate` 加载并展示 loading/error/retry。不得为此启用 `@tauri-apps/plugin-fs`、宽泛 `$RESOURCE/**` 权限或同步 `std::fs`。I/O、等待、计时器和进程调用保持异步。只有测量确认的 CPU 密集工作才可考虑 Tauri 异步运行时的 `spawn_blocking` 或另行批准的线程边界，并记录所有权、取消、并发上限、资源预算和测试。仅支持阻塞调用的依赖应替换为异步能力，否则停止并进入范围或硬规则例外流程。为命名窗口/WebView 使用明确 CSP 及最小能力、权限和作用域集合。默认只加载打包的本地内容。
11. 使用 Mantine UI、TanStack Router 文件路由、TanStack Query 与应用根 Jotai store 建立壳层。侧栏按 `sidebar_mode` 选择：精简模式持续显示名称且不创建折叠控件；详细模式默认展开，折叠按钮自身更新并持久化 `APP_SIDEBAR_COLLAPSED_STORAGE_KEY`，折叠时只显示图标与 Tooltip。页面会话 Jotai 状态仍只在进程内；atom 在页面模块顶层稳定创建，只保存活动选项卡、已应用查询/筛选、排序、分页和同类视图选择。不得使用 `atomWithStorage`、local/session storage、IndexedDB、Tauri Store、文件/数据库或 URL，也不得复用侧栏设备偏好；不得把 Query/核心/持久数据镜像到 atom 中。查询范围或每页数量变化时页码回 1；只有成功查询、当前页大于 1 且结果为空时才回退第 1 页并以新 query key 重查一次，加载/错误/第 1 页空数据不回退。底部支持菜单按 profile 条件组装。Mantine 根使用唯一 Provider、`defaultColorScheme="auto"`、明确设备级颜色存储与完整亮暗语义变量。标题由权威元数据按 `{applicationName} v{version} {contactChannel}:{contactValue}` 同步到原生窗口与 `document.title`，版本先去除已有前缀再只加一个小写 `v`。React handler 必须绑定在实际拥有动作的按钮、链接、`Switch`、`Checkbox` 或菜单项本身，父级不得代理；事件、route、Query 与 atom 都不得承载领域规则。
12. 设置页始终只渲染当前应用名/带一个小写 `v` 的版本、语言与浅色/深色/跟随系统三态主题，不得渲染隐私、统计或未配置占位。只有 `about_page: enabled` 时建立关于页，在“检查更新”旁提供自身绑定的本地“更新日志”按钮，经 `load_release_notes` 从当前候选内固定资源读取并展示近 5 版、每类至多 10 条；读取失败显示本地错误与自身绑定的重试按钮，不显示陈旧或伪造内容。未配置更新时检查按钮为 `NotConfigured`/禁用且零出站。`about_page: disabled` 时路由、入口、Rust 命令、React 加载器/弹窗与文案都缺席，但正式 GUI 候选仍按发布契约携带更新日志资源。未来真实 updater 若需要其他入口必须另行批准界面范围。只有 `sponsor_page: enabled` 时建立赞助页并复制 sponsor 媒体，必须按 manifest 保留完整文件集；disabled 时不进入 runtime bundle。产品启用 updater 时才接入官方签名制品并验证 target/arch/channel，强更只由 core 对 adapter 已认证的 `minimumSupportedVersion` 作严格 SemVer 判定；产品启用统计时才另建明确同意界面，由 Rust adapter 以 HTTPS JSON POST 发送最小字段，禁止稳定标识符与内置 secret，撤回即取消请求并清空有界内存队列。全部远程任务有 owner、取消、超时、上限和关闭回收，失败默认 fail-open。
13. 稳定资源 ID 必须与视图位置分离，选择范围和批处理范围必须明确，真实展示空/加载/错误状态，并从共享核心/存储获取全部持久状态。
14. 在 GUI 前端项目自有工具目录复制 [TypeScript Compiler AST 中文注释检查器](references/check-typescript-chinese-comments.cjs) 与 [专项测试](references/check-typescript-chinese-comments.test.ts)，调整相对导入后同时接入 `pnpm lint` 和项目 validator。检查器必须识别直接及后置命名/默认导出的箭头组件与 hook，只在测试文件或显式 `vitest` 导入中识别 `test`/`it` 场景；精确排除 `src/routeTree.gen.ts`，对解析错误/非法 UTF-8/NUL/源码符号链接/空扫描失败关闭；禁止扩张到所有局部变量或普通匿名回调，禁止加入自动批量注释。
15. 测试必须锁定五项配置与未选能力缺席。单实例启用时运行两个固定回归；托盘启用时运行六个生命周期/i18n 回归；托盘禁用时运行 `close_last_window_exits_application`。所有 GUI 初始化检查发布专用资源映射存在且精确；关于页启用时还锁定 Rust 解析成功/畸形失败、命令注册、前端 IPC 解码、加载失败/重试与近 5 版/每类 10 条显示，禁用时锁定 Rust/React 运行时缺席。前端同时覆盖精简与详细模式、详细模式默认展开/折叠持久化/Tooltip、支持页条件入口，以及固定设置/主题/i18n。赞助内容与媒体测试仅在对应能力启用时要求。
16. 只有真实下游需要前端公开配置时，才建立 `development/test/release` 逻辑 profile 和类型化冻结配置对象；全部 Vite 变量视为用户可读，禁止凭据且产品模块不得散落读取 `import.meta.env`。真实需要前端日志时使用稳定、脱敏的结构化事件，优先通过窄 Tauri 命令汇入 Rust `tracing`；Release Vite `dist` 必须静态拒绝 source map、开发/测试 endpoint、debug/info 哨兵、本机路径和未经批准的 console 输出。
17. 本 Skill 只运行本次必要单元/回归测试。中性初始化随后固定调用 `$desktop-test-gui-initialization-e2e`，由其读取 profile 并只对已选单实例/托盘执行对应结构与真实宿主场景；未选托盘改验关闭最后窗口退出。E2E 始终验证所选侧栏模式、设置页、实际菜单，以及关于/赞助按选择存在或缺席。
18. 缺少完整签名公证条件且渠道允许时，`$desktop-build-tauri-release` 显式生成 `unsigned` 候选并标记其安装包作用域；若 macOS Developer ID 直接分发条件齐全，则签名、公证与 stapling 必须作为一个阶段完成，禁止只签名中间态。启用 updater 时，安装包签名与 updater 制品签名是不同门禁：每个平台候选还必须生成官方 updater 制品和 `.sig`，缺少发布私钥安全引用或签名验证时阻断该 updater 候选。渠道要求签名、公证、商店提交或签名更新器制品时，在独立渠道门禁通过前发布就绪保持受阻。
19. 只按 `docs/ENGINEERING_RULES.md` 的独立事件触发规则更新产品、状态、计划、决定、验证、发布说明和变更记录；普通缺陷修复、纯重构和内部清理本身不触发项目记忆。只有另行授权发布工作后才能增加发布自动化；不得声称已获人工批准。

## 硬边界

- GUI 必须保持独立，并通过相同核心和错误模型与每个已选适配器保持行为一致。
- GUI 初始化始终接入 `i18next`/`react-i18next` 与 `rust-i18n`；托盘原生文案只在托盘能力启用时接入运行时。默认语言、回退和可发现语言切换保持硬规则。
- React 事件、Tauri command 和平台回调不得承载业务规则、领域校验、权威状态或跨 core 调用编排；当前只有 GUI 也不是例外。
- 绝不能从 GUI 自动操作 CLI 或解析 CLI 输出。
- 绝不能把业务规则、持久状态、迁移或平台无关验证放入 React 组件、路由、查询、atom 或事件处理器。
- 不得创建第二套存储或由前端拥有的权威数据副本。
- 不得仅因 GUI 较小或熟悉其他技术栈就替换任何固定 React 前端库。偏离必须形成硬规则例外 ADR。
- `@tabler/icons-react` 是固定图标库；适用图标不得由其他库、手写 SVG、字符或 emoji 替代。图表相关控件优先使用 Tabler 图标，但该包不承担图表绘制。
- 未经批准不得启用远程 URL、宽泛权限、自动启动或 updater 网络。单实例、托盘、关于页和赞助页只由初始化配置启用；未选项不得接线。
- `/settings` 固定存在；`/about`、`/sponsor` 与品牌运行时内容是条件基线。未选页面没有路由或占位，更新 banner 未选择不进入 bundle。
- 已选单实例/托盘在 GUI adapter 内遵守各自完整硬契约；未选单实例不得声明插件，未选托盘不得启用 feature、安装托盘或关闭隐藏，必须由已接线的主窗口关闭 handler 显式退出。通知、自动启动、快捷键仍需单独批准。
- 没有真实项目需求时，不得增加其他路由器、服务器状态缓存、通用全局存储或可选前端包。
- 不得用宽泛目录名排除人工 TypeScript 源码，不得用自动生成套话代替业务注释；非 GUI 下游不适用 TypeScript 门禁，也不得因此要求 Node.js 或 pnpm。
- 不得用同步 I/O、休眠、进程等待或 CPU 密集命令阻塞 Tauri 的 Tokio 运行时，也不得创建嵌套运行时。
- 不得仅为编译、测试或构建允许 unsigned 的本地候选而要求签名材料；经批准的候选冒烟可以使用明确 unsigned 制品。Developer ID 直接分发一旦使用签名身份，就必须同时完成公证与 stapling，不能交付只签名制品。
- 除应用 Logo、标题、所选侧栏、设置页和明确启用的四项能力外，不得捆绑其他页面、业务操作或产品状态。

## 完成输出

报告五项 GUI 配置、所选侧栏模式与折叠持久化、Logo/标题/设置/主题固定基线、关于/赞助的条件路由与媒体，以及单实例/托盘各自的启用实现或禁用缺席证据。E2E 汇总只包含配置适用的真实场景；中性初始化不报告版本分类。
