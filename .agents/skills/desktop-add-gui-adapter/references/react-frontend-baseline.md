# Tauri GUI React 前端基线

这是 Tauri GUI 适配器的前端基线。

## 固定技术栈

- 使用 React 和 TypeScript 编写前端应用和组件代码。
- 使用 Vite 作为 Tauri 本地前端的开发与生产构建工具；不得把 Vite 开发服务器或远程页面作为打包运行时依赖。
- 使用 Mantine UI（`@mantine/core` 和 `@mantine/hooks`）作为组件和主题基础。只有已批准页面需要时才增加其他 Mantine 包。
- 使用 TanStack Router（`@tanstack/react-router`）及其 Vite 插件建立文件路由和自动 route code splitting；`src/routeTree.gen.ts` 是唯一生成路由树，必须提交但禁止手改，并在 ESLint、Prettier 与中文注释门禁中按根相对路径精确排除。
- 使用 TanStack Query（`@tanstack/react-query`）管理命令支撑及其他异步资源状态，包括请求生命周期、缓存和失效。
- 使用 Jotai（`jotai`）管理确实需要跨组件共享的纯客户端状态。
- 使用 `i18next` 与 `react-i18next` 作为界面文案国际化事实标准；初始化已经交付固定关于/赞助页面，因此中性 GUI 脚手架也必须立即接入（见 ADR-20260806-001）。
- 使用 ESLint + `typescript-eslint`、Prettier、Vitest、Testing Library、`jest-dom`、`user-event` 与 jsdom 形成固定静态和测试基线。

实施适配器时为每个直接包声明满足实际 API、Node.js、Tauri WebView、平台和安全约束的最低兼容稳定范围。`dependencies`/`devDependencies` 使用带完整三段下界的 caret（例如 `^1.2.3`），或上游官方明确支持的兼容范围；禁止裸精确版本、`latest`、tag、通配符和无下界范围。确需因上游缺陷或互操作约束精确固定时，先记录硬规则例外与解除条件。

`package.json` 必须以 `engines.node: "^20.19.0 || >=22.12.0"` 和 `engines.pnpm: ">=10.0.0"` 表达当前最低工具范围。不得把旧式精确 `packageManager` 字段当作兼容要求；若生成工具为 Corepack 溯源必须写入该字段，它只属于实际解析元数据，不能替代 `engines` 范围或下界验证。正常 `pnpm-lock.yaml` 固定当前解析版本，但不抬高清单下界。

新增或提高直接下界时，在临时副本的 `pnpm-workspace.yaml` 中设置 `resolutionMode: lowest-direct`，于声明的最低 Node.js/pnpm 环境运行受影响的类型检查、非空单元测试与生产构建。最低版本解析只用于证明下界，不覆盖提交的正常锁文件；正常安装可选择范围内较新的稳定版本。

## 状态所有权

| 状态 | 所有者 |
|---|---|
| URL、路由参数、已验证搜索参数和导航 | TanStack Router |
| 命令支撑的数据、请求状态、缓存、重试和失效 | TanStack Query |
| 仅限本地组件的交互 | React 组件状态 |
| 不具备核心权威性的跨组件客户端/交互状态 | Jotai，包括以 `DEFAULT_SIDEBAR_COLLAPSED = true` 初始化的侧栏折叠状态 |
| 当前 UI 语言与切换交互 | Jotai（消费 `i18next` 语言变化事件），持久化到 GUI 适配器本地偏好存储，不进入 Query 缓存或 core |
| 当前主题偏好与切换交互 | Mantine color-scheme context；`light`/`dark`/`auto` 由唯一 color-scheme manager 持久化到 GUI 设备级本地存储，不进入 Jotai、Query 或 core |
| 更新检查/安装请求状态 | TanStack Query；稳定更新语义来自 adapter/core，不在组件推导 |
| 统计上报同意 | GUI adapter 本地偏好；React 只展示并提交变更，默认 false |
| 领域规则、持久记录和权威应用状态 | Tauri 命令背后的共享核心/存储 |

不得把 Query 结果镜像到 Jotai，不得在 atom 中放置持久领域状态，也不得把路由状态用作第二持久层。视图必须从所有权来源派生。

## UI 与架构

- 完整遵守 [Mantine UI 设计规范](mantine-ui-guidelines.md)，每个 React 根只挂载一个 `MantineProvider`，主题和语义令牌只有一个入口。
- 优先使用 Mantine 组件、布局原语、焦点行为和主题令牌。自定义组件必须代表 Mantine 组合无法表达的已批准交互或样式需求。
- 保持路由定义和加载器轻量。当预取能防止瀑布请求时，将 TanStack Router 加载器与 TanStack Query 集成，但只保留一个 QueryClient/缓存。
- 只有本地组件状态或 URL/搜索状态不足时才使用 Jotai；atom 应保持小而且按用途命名。
- 前端代码使用窄而有类型的 Tauri 命令。它不包含业务规则、迁移、平台无关验证或第二套持久存储。
- React event handler、Router loader、Query mutation 和 atom 只管理导航、请求生命周期或纯交互状态；它们不得编排多个命令来决定业务结果。需要条件、重试或状态决策的工作流必须由单个 core 用例通过窄 Tauri 命令暴露。
- 在 Tauri 中打包本地前端资产。GUI 下游完整保留该 Skill 的品牌源资产；初始化固定建立默认收起的左侧菜单、`/settings`、`/about`、`/sponsor`。选中的本地 Logo 永远位于侧栏顶部，当前版本紧随其下，两者在侧栏两种状态都直接可见；每个功能项和固定项必须提供图标，折叠时显示图标与本地化 Tooltip，展开时显示图标与名称，两种状态均保留可访问名称。产品功能项从顶部向下增长，底部组按赞助、设置、关于渲染。Mantine provider 使用 `defaultColorScheme="auto"`、显式 local-storage manager 和唯一 CSS variables resolver，亮色/暗色分别定义页面背景、surface、主/次文字、边框与强调色；设置页提交 `light`/`dark`/`auto`，Sponsor 通过 `useComputedColorScheme` 适配运行时背景叠层、surface 与对比色。按 manifest 原样复制完整 sponsor 媒体并禁止优化支付二维码；关于页显示当前应用名/版本、手动检查更新、作者、联系方式和三段免责声明。未配置远端能力时关于页只显示 `NotConfigured`/禁用状态且零出站；真实更新、强更或统计上报只有经 `$desktop-prepare-gui-support-surfaces` 逐项批准后才接线。
- 应用启动时使用 Tauri `tauri-plugin-os` 的 `locale()` 探测系统语言初始化 `i18next`；缺少对应资源时回退英文。界面必须提供 Mantine 组件实现的可发现语言切换入口，切换后的选择通过 GUI 适配器的本地偏好存储持久化，不写入 core。
- 翻译资源按功能域拆分文件并使用稳定的层级 key（如 `settings.language.label`），不得在组件中拼接原始中文/英文字符串；核心领域错误标识作为 key 的一部分由前端映射为当前语言文案，业务判断本身不得放入翻译资源或组件。初始化把品牌包的中英文 JSON 注册为 `brandSupport` namespace，仍复用唯一 i18next 实例和语言偏好；缺少对应系统语言资源时回退英文。
- 更新展示只消费 `NotConfigured`、`Idle`、`Checking`、`UpToDate`、`OptionalUpdate`、`RequiredUpdate`、`Failed`。React 不解析远端版本策略、不验证签名、不从 `forcedUpdate` 等字段推导强更；根级 `RequiredUpdate` 分支不挂载普通功能，只呈现安装与退出。
- 统计同意开关初始为 false；未配置、未同意和撤回后都必须显示零出站语义。React 不收集设备标识、不组装 HTTP 请求，也不保存 endpoint 或客户端 secret。

## 工具链与质量门禁

- `tsconfig` 至少启用 `strict`、`noUncheckedIndexedAccess`、`noFallthroughCasesInSwitch` 和 `isolatedModules`；不得用大范围排除、`skip` 脚本或独立宽松配置绕过产品源码。
- ESLint 至少拒绝显式 `any`、非空断言和产品源码直接 `console.*`。确需桥接第三方无类型边界时先收窄为 `unknown` 并在单一边界验证；测试或统一日志 sink 的局部例外必须写成精确文件规则。
- 前端清单提供稳定的 `dev`、`build`、`test`、`typecheck`、`lint` 和 `format:check` 脚本；`lint` 必须同时运行 ESLint 与 [TypeScript AST 中文注释检查器](check-typescript-chinese-comments.cjs)，项目 validator 也独立调用同一检查器，避免只改脚本即可绕过。
- TypeScript Compiler AST 中文注释检查器及其 [专项测试](check-typescript-chinese-comments.test.ts) 是 GUI 下游保留的治理资产。复制到项目自有工具目录后只修改导入路径和扫描根，不扩张到局部变量/普通匿名回调，也不得增加自动批量注释功能。
- 门禁跟踪直接及后置命名/默认导出的箭头函数组件与 hook；`test`/`it` 只在 `.test.*`、`.spec.*`、`test/`、`tests/`、`__tests__/` 或显式从 `vitest` 导入的上下文中视为测试场景，避免业务同名调用误报。
- Testing Library 通过角色、可访问名称和用户交互验证可观察行为；不得用 DOM class、实现细节或大快照代替语义断言。测试运行环境使用 jsdom，并在需要 Mantine provider、Router、QueryClient 或 i18n 时装配真实最小 provider。初始化回归必须覆盖侧栏默认收起、Logo→版本 DOM 顺序及展开/折叠持续可见、展开图标+名称、折叠图标+Tooltip、功能区与固定底部顺序、设置/关于/赞助路由、浅色/深色/跟随系统回调及亮暗语义变量差异、Sponsor 亮色/暗色差异、语言回调、关于页 `NotConfigured` 零出站、强更门不可绕过、动态 `document.title`、作者/联系人/免责声明、固定价格/联系人、两张支付码 alt、响应式危险回归和本地媒体路径；视频模板测试必须覆盖 controls、无 autoplay、字幕与文字稿。

## 配置、日志与产物

- `development`、`test`、`release` 是统一逻辑 profile；只有真实下游需要前端公开配置时才建立对应受管配置。全部 Vite 前端变量都视为最终用户可读，禁止放入密钥、令牌、Cookie、密码或其他凭据。
- 已批准的前端配置必须经过类型和边界校验，汇总为只读/冻结的单一配置对象。组件、route、Query、atom 和业务模块不得直接散落读取 `import.meta.env`；没有真实配置项时不创建占位 BaseURL、超时或环境文件。
- 产品源码不直接使用 `console.*`。真实需要前端日志时，使用稳定的 `level/scope/event/context` 结构、严格字段 allowlist 和脱敏；Tauri 下游优先通过窄命令把清理后的诊断事件汇入 Rust `tracing` 文件日志，不建立浏览器端第二套持久日志，也不自动启用远程遥测。
- Release 前端构建必须拒绝 source map、开发/测试 endpoint、debug/info 哨兵、本机绝对路径、未脱敏秘密和未经批准的 `console.debug/info`。该静态扫描针对最终 `dist`，完成后才允许 Tauri 打包；它不替代日志行为测试、秘密扫描或真实产物验收。
- 前端不得持有远程服务或发布者长期秘密。可选支持能力只消费经 Tauri 窄命令映射的类型化结果；生产 `dist` 必须拒绝秘密实值、固定未批准 endpoint 和禁用能力的残留配置。

## 必需证据

- 使用 pnpm，记录 `engines` 兼容范围与实际运行版本，提交正常解析的 `pnpm-lock.yaml`；另保存最低直接版本解析及最低 Node.js/pnpm 环境通过相关检查的证据。
- 日常开发只运行本次前端变化需要的非空单元/回归测试。显式构建运行 `package.json` 与锁文件声明的完整非空单元测试套件和锁定 `pnpm build`；格式、类型、lint 和最终 `dist` 静态扫描只在本次变化需要、用户明确要求或发布/渠道硬要求时运行。
- 测试路由未找到/错误边界、Query 加载/错误/重新获取/失效、Jotai 转换、纯键盘使用和相关无障碍语义。
- 测试默认语言探测与回退、设置页语言/三态主题切换的渲染与持久化、侧栏图标/Tooltip/顺序与版本、设置/关于/赞助固定路由、关于页更新入口，以及缺失翻译 key 时不泄漏原始 key 给用户。
- 发布阶段验收期间，在已打包或发布模式 Tauri 应用中使用真实构建前端完成已批准关键流程。

## 推荐边界

固定技术栈同时固定 Vite、pnpm、ESLint/`typescript-eslint`、Prettier、Vitest 与 Testing Library。它不预选模式定义/验证库、表单库、图标、图表、网络 client、远程遥测或持久化方案。只有真实下游需求使选择成为必要时才推荐，并应用依赖准入和验证规则。

`i18next`/`react-i18next` 同属固定技术栈，不参与“是否采用”的推荐；只有具体已支持语言列表、翻译文案内容和资源目录组织是项目特定选择。

替换任何固定技术栈库都必须形成硬规则例外 ADR，其中包含未满足的约束、风险、范围、替代证据和恢复/迁移标准。
