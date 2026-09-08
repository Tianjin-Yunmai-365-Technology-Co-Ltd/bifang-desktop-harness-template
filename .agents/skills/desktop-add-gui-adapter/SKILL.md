---
name: desktop-add-gui-adapter
description: 为已初始化的共享核心增加可选 Tauri 2 GUI，采用固定前端技术栈，并按九项初始化配置建立桌面能力、支持页及精简或详细侧栏。
---

# 增加 GUI 适配器

直接在共享核心之上增加最小的已批准 Tauri 2 桌面接口。固定 React/Mantine/Tabler/Router/Query/Jotai/i18n 技术栈是 GUI 硬规则；GUI 与 CLI、TUI 和 MCP 相互独立，业务效果回到 core。

## 固定图标契约

- `package.json` 必须把 `@tabler/icons-react` 声明为直接生产依赖，使用经过最低直接版本验证的完整三段 caret 下界；所有图标使用命名导入，保留 tree-shaking。
- 菜单、操作、状态、空态及图表周边控件存在适用 Tabler 图标时，必须优先从该包选择；不得另装图标库，也不得改用手写 SVG、字符或 emoji。数据可视化图表本身仍按真实产品需求选择图表库。
- 功能菜单项以 `TablerIcon` 组件类型注入，设置与已选赞助/关于图标由模板提供。侧栏尺寸与排版只从 `docs/design_standards/tauri_sidebar.md` 取得：compact 为 `80px` 全宽居中竖排菜单且无折叠；detailed 为 `248px` 展开、`76px` 收起、统一 `22px` 图标和 Tooltip/设备级偏好，并由 AppShell 同源同步侧栏宽度与主内容偏移。
- 偏离上述包或图标来源属于固定技术栈硬规则例外，必须先记录 ADR。

## 工作流程

1. 先判断调用模式。由 `$desktop-initialize-rust-project` 分派时是“中性初始化”，只读 `AGENTS.md`、Agent Policy、`docs/ENGINEERING_RULES.md`、`docs/design_standards/README.md` 和 Rust/GUI 基线，不要求 Product Spec、Work Plan、ADR、Verification 或 `$desktop-manage-version`（初始版本由 `$desktop-initialize-rust-project` 统一建立）；初始化后新增 GUI 是新增用户可见能力，只有在改变产品边界时才先更新 Product Spec，再以 `--kind feature` 调用 `$desktop-manage-version plan` 取得稳定 `change_id` 与 `required_version`，然后直接实施，不自动创建计划或验收记录，并在本次相关测试通过后以相同参数调用 `apply`。
2. 确认当前工作目录是真实下游 Rust 工作区，具有共享核心，且初始化选择或已批准产品范围中记录了 GUI。`Draft` 项目只能获得不含业务操作的中性脚手架状态 GUI。若当前目录只是文档 Harness，或缺少核心，则停止。不得要求另选目标目录，也不得要求 CLI。
3. 选择依赖或设计页面前，先从 [`docs/design_standards/README.md`](../../../docs/design_standards/README.md) 精确匹配设计标准，再完整阅读 [references/gui-baseline.md](references/gui-baseline.md)、[references/react-frontend-baseline.md](references/react-frontend-baseline.md) 和 [references/mantine-ui-guidelines.md](references/mantine-ui-guidelines.md)。产品 profile/当前请求中已批准的专属标准优先于 Harness 通用缺省；无匹配或特殊需求先设计并取得批准，像素偏离更新产品 GUI profile 与 ADR。
4. 中性 GUI 初始化先要求 `$desktop-prepare-gui-app-identity` 已建立 `docs/GUI_APP_PROFILE.md`：三个原始 Logo 候选曾按 `candidate-1` → `candidate-2` → `candidate-3` 稳定顺序预览，用户明确选择一个，且选择前没有格式/尺寸/色彩/像素/摘要验证或标准化；profile 只为所选项记录后置验证/标准化、路径和摘要。最终母版位于 `<project-id>_gui/src-tauri/icons/app-icon-master.png`，运行时副本位于 `<project-id>_gui/public/app-identity/logo.png` 且字节一致，平台图标来自项目本地 Tauri `icon` 命令。该资料还必须有唯一 `gui-initialization-config` 代码块，字段按固定顺序恰好为 `system_tray`、`system_notification`、`autostart`、`about_page`、`sponsor_page`、`single_instance`、`deep_link`、`global_shortcut`、`sidebar_mode`；八项能力为 `enabled`/`disabled`，`sidebar_mode` 为 `compact`/`detailed`，不得有 `pending`，且深链接启用必须同时启用单实例。全局快捷键启用时还必须有唯一 `gui-global-shortcut-contract`，中性初始化的 `actions` 必须为空；禁用时该块缺席。侧栏未选择时写入 `detailed` 的归一化只由初始化器完成，本 Skill 只复用最终值，不重复询问或推断。`<project-id>_gui/src-tauri/icons/32x32.png` 始终必须是普通非符号链接、32×32 8-bit RGBA 非交错 PNG 且至少含一个非透明像素，并由 `bundle.icon` 引用；托盘启用时它同时是托盘来源。首次真实产品 GUI 开发再补齐应用显示名称、固定标题公式、说明、应用标识符及 DMG 背景批准/替换证据，中性初始化不得以占位图代替用户选择。
5. 调用 `$desktop-prepare-gui-support-surfaces` 按配置消费固定本地基线：动态标题、本地 Logo→当前版本、`/settings`、i18n、三态主题与完整亮暗语义主题始终建立；系统通知/开机自启只在启用时增加设置 Switch，关于/赞助只在启用时建立路由、入口和资源，组件也不得作为不可达残留。所有 GUI 都把品牌包的 `tauri/tauri.release.conf.json` 逐字节复制为 `<project-id>_gui/src-tauri/tauri.release.conf.json`，供正式构建通过 `--config` 合并并把根 `release-notes.json` 唯一映射为候选内 `release-notes.json`；中性初始化的调试构建不使用该发布配置，因此不提前创建更新日志事实。compact 必须实现 `tauri-gui-sidebar-compact-80-v1` 的 `80px` 栏宽、`6px` 内容内边距、`36px` Logo、`22px` 图标、全宽居中名称和 `56px` 菜单项，禁止固定 `em/ch` 名称盒与折叠按钮；AppShell 复用宽度常量且 Navbar padding 为 `0`。detailed 必须实现 `tauri-gui-sidebar-detailed-v1` 的 `248px`/`76px`、`72px`/`44px`、`22px` 图标、Tooltip 和独立持久化；AppShell 固定 detailed 并从同一状态更新 `navbar.width` 与 `data-navbar-width`。产品功能项向下增长，底部顺序为已选赞助、设置、已选关于。设置页不得包含隐私/统计区块；所选关于页保留 `NotConfigured` 零出站与本地更新日志；所选赞助页使用有效主题与完整 sponsor 媒体。初始化不预创建 `docs/GUI_SUPPORT_SURFACES.md`，GUI 下游保留 Skill 品牌源资产，但运行时只复制 profile 选中的内容；只有产品明确启用统计时才另建产品级同意界面。
6. 识别已批准的人类使用场景、产品功能菜单项、状态与错误展示、键盘与无障碍要求、刷新/并发语义、平台集成、隐私边界、预期分发格式和 i18n 接入范围（默认语言探测、设置页语言切换和需要覆盖的原生文案）。产品若配置更新、强更或统计上报，完整阅读 `$desktop-prepare-gui-support-surfaces` 的 `references/update-and-telemetry.md`，只询问会实质改变范围的缺失选择。
7. 中性初始化直接按接口选择建立无业务 GUI；初始化后新增真实 GUI 也直接实施。GUI 适配器必须与 CLI 解析和 MCP 协议代码相互独立。
8. 执行时检查官方软件包仓库和文档。为 Tauri 2、固定 React 技术栈及各能力声明满足 Rust MSRV、Node.js/pnpm、目标 WebView/平台、安全与所用 API 的最低兼容稳定范围；Rust 使用完整三段 Cargo 兼容下界，前端使用完整三段 caret 或官方支持范围。所有 GUI 无条件调用 `$desktop-add-gui-system-locale`、`$desktop-add-gui-updater`、`$desktop-add-gui-window-state` 与 `$desktop-add-gui-dialog`，固定声明 `tauri-plugin-os = "2.3.2"`、`tauri-plugin-updater = "2.11.0"`、`tauri-plugin-window-state = "2.4.1"`、`tauri-plugin-dialog = "2.7.3"` 和前端生产依赖 `@tauri-apps/plugin-dialog = "^2.7.3"`。再按 profile 分派 `$desktop-add-gui-system-tray`、`$desktop-add-gui-system-notifications`、`$desktop-add-gui-autostart`、`$desktop-add-gui-single-instance`、`$desktop-add-gui-deep-link` 与 `$desktop-add-gui-global-shortcut`；它们分别拥有依赖、运行时、回归和禁用无残留。只有 `about_page: enabled` 才复制 release-notes Rust/React 运行时，并让根 Tokio 增加 `fs` feature、GUI member 继承 `tokio`、`serde`、`serde_json`。根 `[workspace.dependencies]` 是 Rust 版本、来源与 feature 的唯一事实源，GUI member 只用 `workspace = true`；前端清单直接声明固定 dialog 包。以临时最低直接版本解析和项目最低工具链运行相关测试，再由正常 lockfile 固定实际解析结果；不兼容时提高到首个通过的稳定下界，仍不兼容则停止并记录硬规则例外。
9. 在 `<project-id>_gui` 中增加桌面应用边界，并把该标识用于 Cargo 包、Rust crate 与真实应用二进制；面向用户名称来自 GUI 资料。主窗口首次/状态无效时使用 `width: 1440`、`height: 900`、`minWidth: 960`、`minHeight: 640`、`center: true`、`preventOverflow: true` 且可调整，随后仅恢复 `SIZE | POSITION | MAXIMIZED`。独立 DMG 使用项目内 `./dmg/background.png`、660×400 窗口和固定落点。中央 plugin 顺序固定为：启用时的 single-instance 首位、启用时的 deep-link 次位、固定 os、固定 updater、固定 window-state、固定 dialog、启用时的 notification、autostart、global-shortcut；每项恰好注册一次。dialog 通过 `tauri_plugin_dialog::init()` 注册，不加入自有 `invoke_handler`。single-instance 回调只恢复窗口；deep-link 只接受身份派生的 `app-<kebab-id>://restore`；global-shortcut 只按唯一 contract 注册非空 binding，并把已声明动作映射到宿主动作或单个 core 用例，空 contract 零注册。三者都不得承载未批准业务。托盘通过独立 Skill 从 `.setup(...)`/`.on_window_event(...)` 接线。复用 Tauri 的 Tokio-backed runtime，不创建嵌套 runtime；core 不得依赖 Tauri、WebView、React、路由、查询、窗口或前端状态类型。
10. 公开窄而有类型的普通 `async fn` Tauri 命令，只验证反序列化、协议必填字段和调用窗口/WebView 能力，然后构造 core 请求、调用一个异步 core 用例并映射结果。所有 GUI 始终用窄 `get_app_metadata` 命令向 React 返回权威打包名称、版本、标题联系人和中性产品定义状态，并与 system-locale 的两个固定命令注册到唯一合并的 `invoke_handler`；dialog 使用官方 guest plugin 命令，不加入该 handler。主窗口 capability 只为固定 dialog 基线精确加入 `dialog:default`，以官方默认权限集开放 message、open、save 全部对话框类型；不得使用 wildcard、deprecated `ask`/`confirm` alias、`dialog:deny-*` 或额外文件系统授权。不得在前端写死或从浏览器环境猜测这些事实。每条真实业务路径记录“GUI 事件/命令 → core API → core 测试”；值域、跨字段约束、资源状态、业务权限、默认值和包含条件/重试/状态决策的调用编排属于 core，Tauri Rust command 不得承载这些逻辑。单实例、托盘、窗口恢复等平台机制本身无需 core-first 例外 ADR；候选静态资源读取同属 adapter 机制。`about_page: enabled` 时复制 `rust/release_notes.rs`，在 `tauri::generate_handler![...]` 注册 `load_release_notes`，以 `BaseDirectory::Resource` + `tokio::fs` 异步读取固定 `release-notes.json`，验证 1 MiB、`schemaVersion: 2`、完整 `zh-CN`/`en-US` 翻译对、近 5 版/每类 10 个逻辑条目、唯一版本、最新在前和单个小写 `v` 后才通过 IPC 返回；React 复制 `releaseNotesResource.ts`，再次收窄同一 schema，默认由 `AboutPageTemplate` 加载并展示 loading/error/retry。不得为此启用 `@tauri-apps/plugin-fs`、宽泛 `$RESOURCE/**` 权限或同步 `std::fs`。I/O、等待、计时器和进程调用保持异步。只有测量确认的 CPU 密集工作才可考虑 Tauri 异步运行时的 `spawn_blocking` 或另行批准的线程边界，并记录所有权、取消、并发上限、资源预算和测试。仅支持阻塞调用的依赖应替换为异步能力，否则停止并进入范围或硬规则例外流程。除固定 `dialog:default` 外，为命名窗口/WebView 使用明确 CSP 及最小能力、权限和作用域集合。默认只加载打包的本地内容。
11. 使用 Mantine UI、TanStack Router 文件路由、TanStack Query 与应用根 Jotai store 建立壳层。侧栏按 `sidebar_mode` 选择：精简模式持续显示名称且不创建折叠控件；详细模式默认展开/折叠持久化/Tooltip，折叠按钮自身更新并持久化 `APP_SIDEBAR_COLLAPSED_STORAGE_KEY`，折叠时只显示图标与 Tooltip。页面会话 Jotai 状态仍只在进程内；atom 在页面模块顶层稳定创建，只保存活动选项卡、已应用查询/筛选、排序、分页和同类视图选择。不得使用 `atomWithStorage`、local/session storage、IndexedDB、Tauri Store、文件/数据库或 URL，也不得复用侧栏设备偏好；不得把 Query/核心/持久数据镜像到 atom 中。查询范围或每页数量变化时页码回 1；只有成功查询、当前页大于 1 且结果为空时才回退第 1 页并以新 query key 重查一次，加载/错误/第 1 页空数据不回退。底部支持菜单按 profile 条件组装。Mantine 根使用唯一 Provider、`defaultColorScheme="auto"`、明确设备级颜色存储与完整亮暗语义变量。标题由权威元数据按 `{applicationName} v{version} {contactChannel}:{contactValue}` 同步到原生窗口与 `document.title`，版本先去除已有前缀再只加一个小写 `v`。React handler 必须绑定在实际拥有动作的按钮、链接、`Switch`、`Checkbox` 或菜单项本身，父级不得代理；事件、route、Query 与 atom 都不得承载领域规则。
12. 设置页固定区始终只渲染当前应用名/带一个小写 `v` 的版本、语言与浅色/深色/跟随系统三态主题，不得渲染隐私、统计或未配置占位。系统通知/开机自启按各自 Skill 增加默认关闭 Switch。全局快捷键空 contract 不增加占位；固定 binding 只读显示 chord/动作/逐项真实状态；`user-configurable` 才增加录制、取消和清空，具体页面按批准的信息架构建立且不得以 WebView 状态作为绑定权威。只有 `about_page: enabled` 时建立关于页，在“检查更新”旁提供本地“更新日志”按钮；updater 未配置时检查按钮读取固定基线的 `NotConfigured` 并保持零出站。关于页禁用不裁掉 updater Rust 基线或根级强更门，只移除页面、命令/React 加载器和文案。赞助页仍严格条件建立。真实 endpoint、公钥、channel、target/arch 与 updater 制品只由产品/发布门禁批准；全部远程任务有 owner、取消、超时、上限和关闭回收，失败默认 fail-open。
13. 稳定资源 ID 必须与视图位置分离，选择范围和批处理范围必须明确，真实展示空/加载/错误状态，并从共享核心/存储获取全部持久状态。
14. 在 GUI 前端项目自有工具目录复制 [TypeScript Compiler AST 中文注释检查器](references/check-typescript-chinese-comments.cjs) 与 [专项测试](references/check-typescript-chinese-comments.test.ts)，调整相对导入后同时接入 `pnpm lint` 和项目 validator。检查器必须识别直接及后置命名/默认导出的箭头组件与 hook，只在测试文件或显式 `vitest` 导入中识别 `test`/`it` 场景；精确排除 `src/routeTree.gen.ts`，对解析错误/非法 UTF-8/NUL/源码符号链接/空扫描失败关闭；禁止扩张到所有局部变量或普通匿名回调，禁止加入自动批量注释。
15. 测试必须锁定九项配置、唯一 profile 块、深链/单实例交叉关系、三项 Rust-only 固定基线、dialog 固定 WebView 基线与未选能力缺席。每个独立能力 Skill 的固定命名回归都必须含非平凡断言；dialog 还固定覆盖依赖、唯一有序注册、`dialog:default` 全部官方对话框类型与零额外文件系统授权。单实例缺失注册、错误依赖 target、重复 `.invoke_handler(...)`、disabled 通用依赖残留与 `assert!(true)` 都要有负向回归。初始化检查始终验证 locale/updater/window-state/dialog；条件验证托盘、通知、自启、单实例、深链接和全局快捷键。所有 GUI 继续检查发布资源映射、前端侧栏/设置/i18n 与条件支持页。
16. 只有真实下游需要前端公开配置时，才建立 `development/test/release` 逻辑 profile 和类型化冻结配置对象；全部 Vite 变量视为用户可读，禁止凭据且产品模块不得散落读取 `import.meta.env`。真实需要前端日志时使用稳定、脱敏的结构化事件，优先通过窄 Tauri 命令汇入 Rust `tracing`；Release Vite `dist` 必须静态拒绝 source map、开发/测试 endpoint、debug/info 哨兵、本机路径和未经批准的 console 输出。
17. 本 Skill 只运行本次必要单元/回归测试。中性初始化随后固定调用 `$desktop-test-gui-initialization-e2e`：三项 Rust-only 固定基线与 dialog 固定 WebView 基线始终验证；单实例、托盘、系统通知、开机自启、深链接和全局快捷键只执行配置适用场景。未选托盘改验关闭最后窗口退出，自启恢复原登录项；中性全局快捷键验证空 contract 零注册与 owned 清理，非空 contract 才触发明确安全 chord 并恢复原配置。需要打包才能证明的 macOS 深链明确标为 `Not verified` 并留给最终候选，不得误报通过。
18. macOS 发布默认由 `$desktop-prepare-release` 把 `macosSigningSelection = disabled`、`macosSigningSource = not-requested` 解析并封存进 closing commit 的 `candidateSelections`，再由 `$desktop-build-tauri-release` 只读消费、使用 `--no-sign`，且不得探测本机身份、凭据或 profile；只有用户已配置过、当次主动要求或渠道硬要求时才启用。启用后签名、公证与 stapling 必须作为一个不可降级阶段完成，任一步缺失或失败都阻断候选。updater 制品签名是独立门禁：启用 updater 时每个平台候选仍必须生成官方 updater 制品和 `.sig`，缺少发布私钥安全引用或签名验证时阻断该 updater 候选。渠道要求商店提交或签名更新器制品时，在独立渠道门禁通过前发布就绪保持受阻。
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
- 未经批准不得启用远程 URL、宽泛权限、自动启动注册或 updater 网络。os/updater/window-state 三项固定插件保持 Rust-only；dialog 是唯一固定 guest plugin 例外，只授予精确 `dialog:default` 且不连带文件系统权限。updater 无配置时 `NotConfigured` 且零出站。八项条件能力只由初始化配置启用；未选项不得接线。`autostart: enabled` 只提供默认关闭开关，不授权初始化时替用户开启。
- `/settings` 固定存在；`/about`、`/sponsor` 与品牌运行时内容是条件基线。未选页面没有路由或占位，更新 banner 未选择不进入 bundle。
- 已选单实例、托盘、系统通知、开机自启、深链接与全局快捷键必须调用各自独立 Skill；未选能力不得留下依赖、feature、配置、插件、命令、Switch/状态、翻译键或运行时接线。未选托盘必须由已接线的主窗口关闭 handler 显式退出。
- 没有真实项目需求时，不得增加其他路由器、服务器状态缓存、通用全局存储或可选前端包。
- 不得用宽泛目录名排除人工 TypeScript 源码，不得用自动生成套话代替业务注释；非 GUI 下游不适用 TypeScript 门禁，也不得因此要求 Node.js 或 pnpm。
- 不得用同步 I/O、休眠、进程等待或 CPU 密集命令阻塞 Tauri 的 Tokio 运行时，也不得创建嵌套运行时。
- 不得仅为编译、测试或默认 macOS 发布而探测或要求签名材料；默认关闭签名并使用明确 unsigned 制品。只有配置、主动要求或渠道硬要求使签名启用时，才读取相关条件；Developer ID 直接分发一旦启用签名，就必须同时完成公证与 stapling，不能交付只签名制品或回退 unsigned。
- 除应用 Logo、标题、所选侧栏、设置页和明确启用的八项能力外，不得捆绑其他页面、业务操作或产品状态。

## 完成输出

报告九项 GUI 配置、system-locale/updater/window-state 三项 Rust-only 固定基线、dialog 固定 WebView 基线及精确 `dialog:default`、所选侧栏、Logo/标题/设置/主题，以及六个条件宿主能力各自的启用实现或禁用缺席。E2E 汇总报告真实执行场景、自启恢复、快捷键注销和需要打包后验证的深链边界；中性初始化不报告版本分类。
