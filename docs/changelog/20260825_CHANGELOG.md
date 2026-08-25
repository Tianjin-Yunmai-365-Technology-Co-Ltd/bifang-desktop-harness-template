# 2026-08-25 变更记录

## 新增

- GUI 初始化新增应用 Logo 三选一：实际生成 3 个 1024×1024 PNG 候选并同时预览，必须由用户明确选择；选中母版逐字节接入运行时 `/app-identity/logo.png`，并由项目本地 Tauri 工具生成平台图标，候选/选择/摘要写入 `docs/GUI_APP_PROFILE.md`。
- GUI 主窗口新增独立的 1440×900 初始尺寸与 960×640 最小尺寸，居中并防止溢出；默认尺寸可同时展示展开的 248px 侧栏和三张赞助档位卡。既有 660×400 macOS DMG 安装卷窗口与落点保持独立。
- GUI 初始化新增固定桌面生命周期与本地支持界面基线：启用 Tauri `tray-icon`，托盘只含本地化“显示窗口/退出”，关闭主窗口只隐藏；标题按 `{applicationName} {version} {contactChannel}:{contactValue}` 从权威元数据动态组装；固定左侧菜单默认收起，Logo 永远在顶部、当前版本紧随其下并在展开/折叠状态都可见，产品功能从顶部向下，底部固定项按视觉顺序为赞助、设置、关于。应用直接建立 `/settings`、`/about` 与 `/sponsor`；设置页提供中英文切换、检查更新状态和统计同意，关于页包含固定作者、`QQ 2222980` 联系方式与三段中英文免责声明，赞助页默认打包完整 sponsor 媒体并同时适配亮色/暗色。真实更新 endpoint、统计传输、自动启动和支付自动化仍默认关闭。
- 新增 `AppSidebarTemplate`、`SettingsPageTemplate`、`MandatoryUpdateGateTemplate`、固定导航清单和更新展示状态模板，并补齐中文/英文资源。中性 GUI 的检查更新显示 `NotConfigured`、统计控件禁用且零出站；根级强更门只接受 core 已判定的 `RequiredUpdate`，不从远端布尔值自行推导。
- 新增更新/强更/统计专项参考：更新采用官方 Tauri updater 签名制品和公开验证密钥；强更使用经验证的 `minimumSupportedVersion` 与 core 严格 SemVer；统计默认关闭、明确同意，只允许 HTTPS JSON `POST` 的最小字段白名单，不包含稳定设备/安装标识，并使用有界内存队列、单飞请求、取消、超时、重试和关闭回收。
- 新增无产品身份的 660×400 macOS DMG 拖拽背景资产；GUI 初始化会把它写入 `<项目标识>_gui/src-tauri/dmg/background.png`，并把 Tauri 配置固定接到 `./dmg/background.png`。GUI 身份流程负责预览批准或同路径替换，Tauri 构建在测试前校验路径、尺寸、摘要与配置一致；新增 PNG 资产解析和构建引用负向回归。
- 为 `$desktop-prepare-gui-support-surfaces` 新增完整共享品牌依赖包：固定三档赞助价格、作者/联系人/免责声明、中英文文案、侧栏/设置/About/Sponsor/Media/Banner/强更 React/Mantine 模板及非空模板测试，以及 12 张赞助图片和 1 张更新 banner。两张支付二维码、当前未使用的箭头/图标/选中态小图均按原始字节保留，并由 manifest 记录 MIME、尺寸、字节数、SHA-256、用途、敏感性和内部专有复用边界。
- 新增关于/赞助页面实施参考与产品差异文档模板：关于页注入当前下游权威产品名/版本并固定展示作者、联系人和免责声明；赞助页消费固定品牌 profile，使用响应式列数、主题令牌、语义化图片替代文本和本地媒体路径。更新 banner 只提供视觉资产，不自动启用更新服务。
- 新增本地图片/视频统一组件契约：视频必须有 controls、字幕、文字稿、可选 poster、无 autoplay 和无远程追踪。来源没有已跟踪视频，因此本次没有伪造视频文件。
- 新增 `$desktop-prepare-gui-support-surfaces` Skill、支持界面所有权/出站参考和中性化 validator：GUI 下游自动消费固定本地标题、侧栏、设置/关于/赞助页面与品牌媒体，只为基线差异、额外界面或真实更新/统计出站记录产品实例与最小边界；模板不预创建实例文档，不携带固定远程地址或客户端秘密，非 GUI 下游在初始化时裁剪该能力。
- 新增 macOS DMG 最终字节只读布局检查器与 5 条专项回归，验证非空 Finder `.DS_Store`、本地背景、唯一顶层应用包和 `/Applications` 拖拽链接，并保证失败路径仍卸载挂载卷。
- 新增 workspace-aware Rust 中文声明注释检查器、专项回归和 Harness bridge：从 Cargo package/virtual workspace 根扫描全部成员的 `build.rs`/`src`/`tests`，覆盖 struct/enum/union/type/trait/具名函数与方法，支持直接与条件 doc attribute，提供精确位置、稳定 JSON 和 0/1/2 退出码，并对缺失 manifest、零受管声明、非法源码和不完整报告失败关闭。
- 新增 GUI TypeScript Compiler AST 中文注释门禁参考与 Vitest 专项测试：范围收敛为结构、具名函数/方法、直接或后置导出的组件/hooks，以及明确测试上下文中的场景；精确排除生成路由树，对语法/编码/符号链接/空扫描失败关闭，明确禁止业务同名调用误报、局部变量/普通回调全覆盖和自动批量套话。
- 新增 Tauri 专用 Mantine UI 设计规范，统一单 Provider/theme、语义令牌、样式优先级、页面层级、交互状态、窄窗口/文本缩放、键盘/焦点/live region 与 Testing Library 语义测试要求。
- 新增异步优先、Tracing 落盘可读日志与产出物真实可用验收三项硬规则（ADR-20260806-002）：core 与全部 Rust 适配器只要涉及真实 I/O/等待/计时/进程/协议就默认使用异步，只有纯 CPU 密集且无等待点时才保留同步；已启用 tracing 的下游必须把结构化 event/span 同时落盘到人类可读、可滚动的本地日志文件，标准输出仍保持单一 JSON 信封；任一路径对产出物的完成/可用结论都必须以真实运行结果为依据，模拟实现、测试替身、占位页面不具备验收资格，同时明确保留既有测试隔离规则允许的受控替身范围。
- 固化 Tauri GUI 界面国际化（i18n）技术选型事实标准（ADR-20260806-001）：前端固定使用 `i18next` + `react-i18next`，Rust GUI 适配器层固定使用 `rust-i18n`，系统语言探测统一使用官方 `tauri-plugin-os` 的 `locale()` API。i18n 接入成为开发期硬性必选项，默认语言跟随系统语言并在缺少对应资源时回退英文，界面必须提供可发现的语言切换入口并持久化用户选择；core 保持语言无关。
- 新增 `$desktop-refactor-code` Skill：从单文件行数、文件组织结构（Rust `<module>/mod.rs`、前端不强制 `index.ts` 桶文件）、命名、常量提取、潜在性能与死锁风险、core-first 归属六个方面辅助行为保持的重构，复用统一文件规模与 core-first 检查器。
- 新增 `$desktop-extract-i18n-strings` Skill：把已选 GUI 适配器中硬编码的用户可见文案抽取为 `i18next`/`react-i18next` 与 `rust-i18n` 翻译键，不触碰共享 core，不臆造未批准语言的译文。

## 变更

- GUI 固定支持界面重新整理：手动检查更新及其 `NotConfigured`/检查中/结果状态从设置页迁回关于页；设置页新增浅色、深色、跟随系统三态选择并持久化设备级偏好。初始化新增唯一 `AppThemeProviderTemplate`，为亮色与暗色分别定义页面背景、surface、主/次文字、边框和强调色，应用壳与赞助页消费运行时有效主题。
- 固定侧栏收起时现在强制保留每个功能项及赞助/设置/关于项的图标，并显示本地化 Tooltip 名称；展开时同时显示图标与名称。图标由下游显式注入且不再可选，两种状态继续提供可访问名称。
- Rust、前端依赖与 Node.js/pnpm/cargo-xwin 工具要求统一改为经过验证的最低兼容稳定版本范围：Cargo/前端清单保留完整兼容下界，锁文件只固定当前解析结果；新增 Rust `direct-minimal-versions`、前端 `lowest-direct`、项目最低工具链与环境范围门禁，其中 `cargo-xwin` 使用 `>=0.22.0, <0.24.0`，保留已观测可用的 0.22.0 下界而不追随较新发布；不再以精确依赖版本、`latest`、tag、通配符或“优先最新”表达兼容性。
- 固定侧栏现在默认收起，并把用户选中的本地 Logo 永久置于顶部、当前版本紧随其下；展开/折叠都保持 Logo 与版本可见。赞助页不再依赖单一主题或运行时 `light-dark()` 字符串，而是消费 Mantine 解析后的有效主题，为亮色/暗色分别选择背景叠层、surface 与对比色，并为不透明档位图提供稳定中性承载面。
- `$desktop-build-tauri-release` 新增 updater 候选门禁：启用时要求 `bundle.createUpdaterArtifacts: true`、受限 HTTPS endpoints、公开验证密钥和安全提供的签名私钥，收集并验证真实 archive/`.sig`，把版本、channel、target、arch、公钥指纹、路径、大小、摘要和验证结果写入 manifest。安装包签名/公证与 updater 签名相互独立；构建不创建 feed、不上传也不发布。
- 对参考下游的更新与统计实现完成安全抽取：保留 UI 信息架构，不传播硬编码客户端共享秘密、GET/query 统计、稳定设备标识、detached task、未经认证的 `forcedUpdate` 或宽松下载 URL；对应拒绝规则和回归已固化到 GUI 支持、GUI adapter 与 Tauri 构建 Skills。
- `$desktop-add-gui-adapter` 现在在中性 GUI 初始化中自动消费品牌支持 Skill；`docs/GUI_SUPPORT_SURFACES.md` 只在修改固定基线、增加其他支持界面或启用出站能力时按需创建。i18n 因默认页面和托盘文案前移到初始化阶段，固定中文/英文之外的系统语言继续回退英文；updater banner 未选择时不进入 bundle。
- Harness 源策略与初始化推荐预设现在默认 `superpowers: disabled`；只有自定义选择明确启用时，后续 Agent 才可调用 `superpowers:*` Skill。
- 开发环境门禁不再因新任务、新会话、显式构建或缺少环境证据例行运行：中性初始化仍主动检查一次，初始化后先执行真实测试/构建命令，只有已观察到受管环境错误时才做对应安装并单次重试；xwin 发布工具同样改为实际 xwin 命令失败后的针对性恢复。
- 日常开发流程收敛为直接实现、本次必要单元/回归测试和事件触发记录，不再因任务复杂度自动增加流程档位、持久计划、全仓检查、构建、冒烟、E2E 或验收步骤；安全、外部副作用与发布所需授权仍按实际风险保留。
- Rust CLI 与 Tauri GUI 显式构建现在必须在开始前逐次解析是否启用 E2E，并在编译前运行项目全部非空单元测试；持久 E2E 偏好只提供建议默认值，启用的 E2E 只在最终真实候选形成后执行。
- GUI 支持界面能力从纯中性模板扩展为产品家族共享品牌包：GUI 下游保留完整 Skill 源资产，完整 sponsor 媒体随固定赞助页进入应用 bundle，updater banner 仍只有明确选择时进入；来源下游产品名称/标识、固定服务地址、秘密和遥测实例仍被排除。静态支付码不授权订单、权益、账户、支付状态或自动支付逻辑。
- 初始化、GUI adapter 基线、Harness 升级所有权与 validator 同步识别品牌配置、i18n、React 模板、manifest 和全部媒体；非 GUI 初始化继续裁剪该能力，升级继续保护产品实例文档与下游本地决定。
- macOS→Windows xwin 环境门禁适配 Homebrew 将 LLD 从 LLVM 拆包的环境：分别探测、安装和复探 `llvm`/`lld`，对现有损坏 formula 失败关闭；新增 2 条针对拆包与损坏环境的回归。
- Apple 公证探测新增已授权 `notarytool` Keychain profile 模式，与两组环境凭据模式互斥；在线验证不输出 profile 名或秘密，并新增 profile 可用、不可用与混用拒绝回归。
- Tauri DMG 规则补齐 Finder 布局策略：交互式构建只在有界超时内使用 Tauri 的 Finder 路径，headless runner 不得盲目启用可能挂起的 AppleScript；任何布局后处理都要求重新签名、公证、stapling、摘要和验收。
- DMG 布局证据进一步贯通到 `$desktop-verify-delivery`、`docs/VERIFICATION.md` 与 `$desktop-prepare-release`：里程碑必须对 `release/` 中当前最终 DMG 重跑只读检查，不得沿用旧候选证据或自动接受软件许可。
- GUI 初始化、身份、适配器、工程规则、Rust 基线与 Harness 升级所有权同步接入固定本地支持基线及可选出站能力；Skill 工程层只随 GUI 条件传播，下游 `docs/GUI_SUPPORT_SURFACES.md` 明确保持 `protected`。
- Rust 能力事实扩展为 Axum + Tower/Tower HTTP、config-rs、tracing-subscriber/appender 与默认关闭的 OpenTelemetry OTLP/HTTP；utoipa/Scalar、async-graphql、MongoDB/redis-rs 和 jsonwebtoken/Argon2id 仅作为真实能力获批后的固定候选，不进入中性依赖。
- Tauri React 前端固定基线扩展为 Vite、TanStack 文件路由、严格 TypeScript、ESLint/`typescript-eslint`、Prettier、Vitest 与 Testing Library，并增加可选公开配置、结构化日志汇入 Rust tracing 和最终 `dist` 静态扫描边界；除固定本地关于/赞助页外不捆绑产品业务起始资产。
- 中文注释规则把“机械存在性/归属”与“业务语义质量”明确分层：Rust/GUI 门禁只检查稳定声明且必须失败关闭，字段/局部变量/闭包/普通回调保留有限豁免，语义质量继续由人工/Agent 复核。
- 文件规模治理由 400 行硬上限调整为两级规则：超过 500 行必须复核业务高内聚、职责单一和职责相近性，不满足即按职责重构；超过 2000 行由统一门禁强制拒绝并拆分。Rust 模块拆分继续使用目录/`mod.rs` 结构，统一检查器同步报告语义复核候选。
- `AGENTS.md`、`docs/RUST_CLI_TEMPLATE.md`、`docs/VERIFICATION.md`、最新 Product Spec 同步声明异步优先、tracing 落盘可读日志和产出物真实可用验收三项硬规则边界，并明确其与既有测试隔离规则、里程碑真实候选要求的关系。
- `docs/RUST_CLI_TEMPLATE.md`、`$desktop-add-gui-adapter` 的 GUI 基线与 React 前端基线、`AGENTS.md` 同步声明 i18n 技术栈、默认语言与语言切换入口的硬规则边界，并明确 core 只暴露语言中立的稳定标识供适配器本地化。

## 验证

- `python3 -m unittest discover -s scripts`：173 条测试全部通过，新增覆盖 Rust 清单完整兼容下界和 workflow 从根 `rust-version` 读取/规范化最低工具链；既有 GUI 初始化、环境、精简开发、逐次 E2E 构建、更新/强更/统计、updater、xwin、公证、DMG、升级和治理回归继续通过。
- `python3 .agents/skills/desktop-check-development-environment/scripts/test_development_environment_gates.py`：15 条隔离测试全部通过，覆盖 Node.js 20.19.0/22.12.0 分段下界、21.x 空档、范围内更高版本、pnpm 10.0.0 下界、缺失兼容范围安装和供应链失败。
- `python3 .agents/skills/desktop-check-development-environment/scripts/test_macos_tauri_xwin_gates.py`：10 条隔离测试全部通过，覆盖 `cargo-xwin >=0.22.0, <0.24.0` 范围安装/复探、0.22/0.23 既有版本复用，以及范围外和预发布版本拒绝；本机真实 `cargo-xwin 0.22.0` 的版本/帮助探测与 xwin `--check-only` 全门禁通过。
- 中性 Rust workspace 的正常锁文件测试通过 7 条非空测试；临时 `cargo +nightly update -Zdirect-minimal-versions` 将 6 个 registry 直接依赖解析到声明下界后，`cargo +1.90.0 test --workspace --all-targets --all-features --locked` 同样通过 7 条测试，且未覆盖提交的正常 `Cargo.lock`。
- `python3 scripts/validate_harness.py`：通过 137 个必需文件、24 个 Skills、最低兼容版本契约、动态 MSRV workflow、Markdown 链接、DMG 初始化背景 PNG、品牌 profile/manifest/图片完整性、托盘与关闭隐藏、侧栏/设置/固定底部顺序、双端 i18n、关于/赞助、更新/强更/统计和 Tauri updater 构建契约、500/2000 行、core-first、Rust workspace 中文注释与项目记忆契约；产生 1 条已复核的 690 行 Rust 检查器非阻断提示。
- 隔离前端严格 TypeScript、Prettier、TypeScript AST 中文注释门禁（11 个文件、57 个声明）和 Vitest/Testing Library（14/14）通过；13 张图片均可解码并完成视觉复核，12 张固定赞助资源与参考项目逐字节一致。
- Skill Creator quick validator 对本次修改的 4/4 个项目 Skills 全部通过；`git diff --check` 通过。
- Rust 中性 workspace 注释扫描覆盖 2 个 package、4 个文件和 24 个受管声明；metadata、core-first、`cargo fmt`、locked check、全 workspace/all-target/all-feature Clippy、7 条非空测试与锁定 release 构建均通过。
- 文件规模检查覆盖 197 个受维护文本，无 2001 行以上违规；690 行 Rust 检查器已复核为高内聚、单一职责且内部职责相近。
- 来源锁点前 84 个 Skill 文件均已收敛；锁点后 3 个 Skill 提交的 16 个文件在模板中 16/16 有对应落点。关于/赞助资源审计闭合为 13 张图片、0 个视频；来源工作树保持干净，多组来源产品身份、绝对路径、固定凭据和固定服务特征扫描均为零命中。
- 未真实生成或构建下游 GUI/DMG/NSIS，未运行冒烟/E2E、Windows/Linux 候选、签名、公证或发布；这些范围保持 `Unverified`，不得据此声明候选或发布就绪。
