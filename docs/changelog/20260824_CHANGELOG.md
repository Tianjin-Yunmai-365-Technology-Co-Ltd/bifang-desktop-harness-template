# 2026-08-24 变更记录

## 新增

- 新增无产品身份的 660×400 macOS DMG 拖拽背景资产；GUI 初始化会把它写入 `<项目标识>_gui/src-tauri/dmg/background.png`，并把 Tauri 配置固定接到 `./dmg/background.png`。GUI 身份流程负责预览批准或同路径替换，Tauri 构建在测试前校验路径、尺寸、摘要与配置一致；新增 PNG 资产解析和构建引用负向回归。
- 为 `$desktop-prepare-gui-support-surfaces` 新增完整共享品牌依赖包：固定三档赞助价格、品牌联系人、中英文文案、About/Sponsor/Media/Banner React/Mantine 模板、7 条非空模板测试，以及 12 张赞助图片和 1 张更新 banner。两张支付二维码、当前未使用的箭头/图标/选中态小图均按原始字节保留，并由 manifest 记录 MIME、尺寸、字节数、SHA-256、用途、敏感性和内部专有复用边界。
- 新增关于/赞助页面实施参考与产品实例文档模板：关于页注入当前下游权威产品名/版本并复用品牌联系人；赞助页消费固定品牌 profile，使用响应式列数、主题令牌、语义化图片替代文本和本地媒体路径。更新 banner 只提供视觉资产，不自动启用更新服务。
- 新增本地图片/视频统一组件契约：视频必须有 controls、字幕、文字稿、可选 poster、无 autoplay 和无远程追踪。来源没有已跟踪视频，因此本次没有伪造视频文件。
- 新增 `$desktop-prepare-gui-support-surfaces` 条件 Skill、支持界面所有权/出站参考和中性化 validator：GUI 下游可只为明确选择的关于/支持/赞助、动态标题、更新检查或遥测记录产品实例与最小边界；模板不预创建实例文档，不携带固定远程地址或秘密，非 GUI 下游在初始化时裁剪该能力。
- 新增 macOS DMG 最终字节只读布局检查器与 5 条专项回归，验证非空 Finder `.DS_Store`、本地背景、唯一顶层应用包和 `/Applications` 拖拽链接，并保证失败路径仍卸载挂载卷。
- 新增 workspace-aware Rust 中文声明注释检查器、专项回归和 Harness bridge：从 Cargo package/virtual workspace 根扫描全部成员的 `build.rs`/`src`/`tests`，覆盖 struct/enum/union/type/trait/具名函数与方法，支持直接与条件 doc attribute，提供精确位置、稳定 JSON 和 0/1/2 退出码，并对缺失 manifest、零受管声明、非法源码和不完整报告失败关闭。
- 新增 GUI TypeScript Compiler AST 中文注释门禁参考与 Vitest 专项测试：范围收敛为结构、具名函数/方法、直接或后置导出的组件/hooks，以及明确测试上下文中的场景；精确排除生成路由树，对语法/编码/符号链接/空扫描失败关闭，明确禁止业务同名调用误报、局部变量/普通回调全覆盖和自动批量套话。
- 新增 Tauri 专用 Mantine UI 设计规范，统一单 Provider/theme、语义令牌、样式优先级、页面层级、交互状态、窄窗口/文本缩放、键盘/焦点/live region 与 Testing Library 语义测试要求。
- 新增异步优先、Tracing 落盘可读日志与产出物真实可用验收三项硬规则（ADR-20260806-002）：core 与全部 Rust 适配器只要涉及真实 I/O/等待/计时/进程/协议就默认使用异步，只有纯 CPU 密集且无等待点时才保留同步；已启用 tracing 的下游必须把结构化 event/span 同时落盘到人类可读、可滚动的本地日志文件，标准输出仍保持单一 JSON 信封；任一路径对产出物的完成/可用结论都必须以真实运行结果为依据，模拟实现、测试替身、占位页面不具备验收资格，同时明确保留既有测试隔离规则允许的受控替身范围。
- 固化 Tauri GUI 界面国际化（i18n）技术选型事实标准（ADR-20260806-001）：前端固定使用 `i18next` + `react-i18next`，Rust GUI 适配器层固定使用 `rust-i18n`，系统语言探测统一使用官方 `tauri-plugin-os` 的 `locale()` API。i18n 接入成为开发期硬性必选项，默认语言跟随系统语言并在缺少对应资源时回退英文，界面必须提供可发现的语言切换入口并持久化用户选择；core 保持语言无关。
- 新增 `$desktop-refactor-code` Skill：从单文件行数、文件组织结构（Rust `<module>/mod.rs`、前端不强制 `index.ts` 桶文件）、命名、常量提取、潜在性能与死锁风险、core-first 归属六个方面辅助行为保持的重构，复用统一文件规模与 core-first 检查器。
- 新增 `$desktop-extract-i18n-strings` Skill：把已选 GUI 适配器中硬编码的用户可见文案抽取为 `i18next`/`react-i18next` 与 `rust-i18n` 翻译键，不触碰共享 core，不臆造未批准语言的译文。

## 变更

- Harness 源策略与初始化推荐预设现在默认 `superpowers: disabled`；只有自定义选择明确启用时，后续 Agent 才可调用 `superpowers:*` Skill。
- 开发环境门禁不再因新任务、新会话、显式构建或缺少环境证据例行运行：中性初始化仍主动检查一次，初始化后先执行真实测试/构建命令，只有已观察到受管环境错误时才做对应安装并单次重试；xwin 发布工具同样改为实际 xwin 命令失败后的针对性恢复。
- 日常开发流程收敛为直接实现、本次必要单元/回归测试和事件触发记录，不再因任务复杂度自动增加流程档位、持久计划、全仓检查、构建、冒烟、E2E 或验收步骤；安全、外部副作用与发布所需授权仍按实际风险保留。
- Rust CLI 与 Tauri GUI 显式构建现在必须在开始前逐次解析是否启用 E2E，并在编译前运行项目全部非空单元测试；持久 E2E 偏好只提供建议默认值，启用的 E2E 只在最终真实候选形成后执行。
- GUI 支持界面能力从纯中性模板扩展为产品家族共享品牌条件包：GUI 下游保留完整 Skill 源资产，只有明确选择的界面资源进入应用 bundle；来源下游产品名称/标识、产品路由、固定服务地址、秘密和遥测实例仍被排除。静态支付码不授权订单、权益、账户、支付状态或自动支付逻辑。
- 初始化、GUI adapter 基线、Harness 升级所有权与 validator 同步识别品牌配置、i18n、React 模板、manifest 和全部媒体；非 GUI 初始化继续裁剪该能力，升级继续保护产品实例文档与下游本地决定。
- macOS→Windows xwin 环境门禁适配 Homebrew 将 LLD 从 LLVM 拆包的环境：分别探测、安装和复探 `llvm`/`lld`，对现有损坏 formula 失败关闭；新增 2 条针对拆包与损坏环境的回归。
- Apple 公证探测新增已授权 `notarytool` Keychain profile 模式，与两组环境凭据模式互斥；在线验证不输出 profile 名或秘密，并新增 profile 可用、不可用与混用拒绝回归。
- Tauri DMG 规则补齐 Finder 布局策略：交互式构建只在有界超时内使用 Tauri 的 Finder 路径，headless runner 不得盲目启用可能挂起的 AppleScript；任何布局后处理都要求重新签名、公证、stapling、摘要和验收。
- DMG 布局证据进一步贯通到 `$desktop-verify-delivery`、`docs/VERIFICATION.md` 与 `$desktop-prepare-release`：里程碑必须对 `release/` 中当前最终 DMG 重跑只读检查，不得沿用旧候选证据或自动接受软件许可。
- GUI 初始化、身份、适配器、工程规则、Rust 基线与 Harness 升级所有权同步接入可选支持界面能力；Skill 工程层只随 GUI 条件传播，下游 `docs/GUI_SUPPORT_SURFACES.md` 明确保持 `protected`。
- Rust 能力事实扩展为 Axum + Tower/Tower HTTP、config-rs、tracing-subscriber/appender 与默认关闭的 OpenTelemetry OTLP/HTTP；utoipa/Scalar、async-graphql、MongoDB/redis-rs 和 jsonwebtoken/Argon2id 仅作为真实能力获批后的固定候选，不进入中性依赖。
- Tauri React 前端固定基线扩展为 Vite、TanStack 文件路由、严格 TypeScript、ESLint/`typescript-eslint`、Prettier、Vitest 与 Testing Library，并增加可选公开配置、结构化日志汇入 Rust tracing 和最终 `dist` 静态扫描边界；仍不捆绑页面或业务起始资产。
- 中文注释规则把“机械存在性/归属”与“业务语义质量”明确分层：Rust/GUI 门禁只检查稳定声明且必须失败关闭，字段/局部变量/闭包/普通回调保留有限豁免，语义质量继续由人工/Agent 复核。
- 文件规模治理由 400 行硬上限调整为两级规则：超过 500 行必须复核业务高内聚、职责单一和职责相近性，不满足即按职责重构；超过 2000 行由统一门禁强制拒绝并拆分。Rust 模块拆分继续使用目录/`mod.rs` 结构，统一检查器同步报告语义复核候选。
- `AGENTS.md`、`docs/RUST_CLI_TEMPLATE.md`、`docs/VERIFICATION.md`、最新 Product Spec 同步声明异步优先、tracing 落盘可读日志和产出物真实可用验收三项硬规则边界，并明确其与既有测试隔离规则、里程碑真实候选要求的关系。
- `docs/RUST_CLI_TEMPLATE.md`、`$desktop-add-gui-adapter` 的 GUI 基线与 React 前端基线、`AGENTS.md` 同步声明 i18n 技术栈、默认语言与语言切换入口的硬规则边界，并明确 core 只暴露语言中立的稳定标识供适配器本地化。

## 验证

- `python3 -m unittest discover -s scripts`：163 条测试全部通过，包含 Superpowers 默认关闭及源字段漂移拒绝、环境门禁仅限初始化/观察错误后单次恢复、旧构建预检描述拒绝、精简开发闭环、按需 Work Plan、逐次 E2E 构建选择、全量构建单测、候选清单传播、DMG 初始化背景资产/构建引用，以及既有 xwin、公证、DMG 布局、GUI 品牌资源、升级传播、治理与初始化回归。
- `python3 scripts/validate_harness.py`：通过 129 个必需文件、24 个 Skills、Markdown 链接、DMG 初始化背景 PNG、品牌 profile/manifest/图片完整性、500/2000 行、core-first、Rust workspace 中文注释与项目记忆契约；产生 1 条已复核的 690 行 Rust 检查器非阻断提示。
- 隔离前端严格 TypeScript、Prettier、TypeScript AST 中文注释门禁（6 个文件、31 个声明）和 Vitest/Testing Library（7/7）通过；13 张图片均可解码并完成视觉复核，目标与来源逐字节一致。
- Skill Creator quick validator 对 24/24 项目 Skills 全部通过；Shell 语法、ownership JSON、TypeScript 检查器 Node 语法和 `git diff --check` 通过。
- Rust 中性 workspace 注释扫描覆盖 2 个 package、4 个文件和 24 个受管声明；metadata、core-first、`cargo fmt`、locked check、全 workspace/all-target/all-feature Clippy、7 条非空测试与锁定 release 构建均通过。
- 文件规模检查覆盖 189 个受维护文本，无 2001 行以上违规；690 行 Rust 检查器已复核为高内聚、单一职责且内部职责相近。
- 来源锁点前 84 个 Skill 文件均已收敛；锁点后 3 个 Skill 提交的 16 个文件在模板中 16/16 有对应落点。关于/赞助资源审计闭合为 13 张图片、0 个视频；来源工作树保持干净，多组来源产品身份、绝对路径、固定凭据和固定服务特征扫描均为零命中。
- 未真实生成或构建下游 GUI/DMG/NSIS，未运行冒烟/E2E、Windows/Linux 候选、签名、公证或发布；这些范围保持 `Unverified`，不得据此声明候选或发布就绪。
