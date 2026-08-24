# Tauri 桌面 GUI 基线

仅在明确的下游请求通过 GUI 范围闸门后阅读本参考。同时阅读 GUI 所属的 [React 前端基线](react-frontend-baseline.md)。

## 固定默认值

- 将 Tauri 2 与现有 Rust 共享核心及 Tokio 适配器标准配合使用。
- 复用 Tauri 基于 Tokio 的单例异步运行时，并以普通 `async fn` 实现自定义命令；不得创建嵌套 Tokio 运行时。
- 使用 Vite、Mantine UI、TanStack Router 文件路由、TanStack Query 和 Jotai 打包本地 React + TypeScript 前端；使用 ESLint/`typescript-eslint`、Prettier、Vitest 与 Testing Library 作为固定质量工具链。
- 界面国际化是开发期硬性必选项，不是可选增强。Rust 后端（GUI 适配器层）固定使用 `rust-i18n` 输出系统托盘、原生窗口标题、系统通知等未经 React 渲染路径的用户可见文案；系统语言探测统一使用官方 Tauri 插件 `tauri-plugin-os` 的 `locale()` API，作为 Rust 与前端唯一共用的系统语言来源，不得分别使用平台专有 API 或环境变量（见 ADR-20260806-001）。
- 不得加载远程内容。
- 保持 Tauri Rust 边界轻薄：只验证反序列化、协议必填字段和调用 WebView 能力，随后调用一个核心用例并映射有类型的结果；值域、跨字段约束、资源状态和业务权限由核心验证。
- 调用时解析并锁定最新、彼此兼容的稳定 Tauri/前端版本；验证 Rust MSRV、Node/pnpm 策略和目标平台 WebView。
- 使用 pnpm 作为前端包管理器，并要求存在 `$desktop-check-development-environment` 提供的当前宿主 Node.js 和 pnpm 证据。
- 固定前端同时适用于中性 `Draft` 脚手架和已批准产品。不得根据页面数量把它替换为普通 HTML/ES 模块或其他框架。
- Mantine 主题、布局、状态、响应式与无障碍细节统一遵守 [Mantine UI 设计规范](mantine-ui-guidelines.md)。

## 必需设计输入

记录：

- `docs/GUI_APP_PROFILE.md` 中已批准的应用显示名称、主窗口标题、简短说明、应用标识符和用户选择的图标来源；
- 只有产品明确选择关于/支持/赞助、动态标题、更新检查或遥测时，才读取 `$desktop-prepare-gui-support-surfaces` 创建的 `docs/GUI_SUPPORT_SURFACES.md`；GUI 下游完整保留该 Skill 的产品家族品牌源资产，但未选择时不得建立占位路由、运行时媒体、网络配置或请求；
- 选择 macOS 直接分发 DMG 时，初始化先把中性 660×400 PNG 写入 `<project-id>_gui/src-tauri/dmg/background.png`，`tauri.conf.json` 的 `bundle.macOS.dmg.background` 固定引用 `./dmg/background.png`，窗口与落点固定为 660×400、应用 `(180, 220)`、Applications `(480, 220)`；首次真实 GUI 开发必须记录对该图片的预览批准或同路径替换、SHA-256、文案语言，以及软件许可页是否由产品/渠道要求。背景不得含 Harness 或其他产品身份；
- 已批准的人类使用场景，以及选择桌面界面的原因；
- 最小窗口、页面、路由、导航和操作；
- 空、加载、成功、验证、冲突和失败状态；
- 键盘顺序、快捷键、焦点行为、标签和无障碍验收；
- 适用时的稳定 ID、选择语义、批处理范围、搜索、排序和分页；
- 刷新、并发修改、取消和恢复行为；
- 必需的文件系统、进程、通知、Shell、托盘、启动或更新器访问；
- 当前平台打包目标，以及保持 `Unverified` 的其他平台。

## 界面国际化（i18n）

- 首次向用户交付真实页面、命令结果或原生机制文案时必须已接入 i18n 技术栈；中性脚手架阶段允许暂不接入。
- 默认语言在应用启动时使用 `tauri-plugin-os` 的 `locale()` 探测系统语言；缺少对应翻译资源时回退英文，不得静默显示未翻译的原始 key 或英文与目标语言混排。
- 界面必须提供可发现的语言切换入口（设置页或菜单）；用户手动切换后的选择必须持久化，并在后续启动时覆盖系统探测结果，直至用户重置。
- Rust 端 `rust-i18n` 只负责适配器自身产出的原生文案（托盘菜单、窗口标题、系统通知），不得承载业务规则、领域校验或业务默认值；翻译资源文件与业务代码分离存放。
- 用户的语言选择是 GUI 本地设备级展示偏好，使用 GUI 适配器自有的本地持久化位置保存，不得写入共享 core 的持久化层或借此新建第二套业务数据权威副本。

## 安全与架构规则

- 为打包内容定义明确 CSP。
- 只向命名窗口/WebView 授予能力，并且只包含必需权限和作用域。
- 保持禁用远程 URL 访问。
- 任何支持界面远程能力必须先通过 `$desktop-prepare-gui-support-surfaces` 记录独立能力清单；默认禁用，秘密仅由安全运行时来源提供且不进入前端，任务必须具有 owner、取消、超时和关闭回收。
- 赞助品牌包内支付二维码是敏感静态媒体；只有选择赞助页后才进入应用 bundle，不得被前端解释为订单、支付状态、权益或账户事实。更新 banner 同样不授权网络更新能力。
- 窄 Rust 命令能够执行已批准操作时，不得公开通用文件系统或 Shell 访问。
- 持久数据、迁移、并发控制和业务验证必须由共享核心/存储层负责。
- 业务规则、默认值、领域状态转换和包含条件/重试/状态决策的调用编排必须位于核心；React 事件、Tauri command 和平台回调只调用核心并映射结果，即使当前只有 GUI 也同样适用。
- 系统托盘、窗口生命周期、通知、自动启动和快捷键等桌面机制位于 GUI adapter；它们触发的业务动作调用既有核心用例，不能直接修改权威业务状态。
- 使用 TanStack Query 负责有类型的异步命令结果和失效；Jotai 只负责跨组件共享的客户端交互。绝不能把 Query/核心数据复制到 atom 中。
- 前端公开配置只在真实需要时建立，并集中为类型化、冻结对象；所有 Vite 构建变量均视为用户可读，禁止秘密、令牌和凭据，产品模块不得直接散落读取 `import.meta.env`。
- 产品源码不得直接调用 `console.*`。真实需要前端诊断时使用稳定、脱敏的结构化事件，并优先通过窄 Tauri 命令汇入 Rust `tracing` 文件日志；远程遥测仍需独立范围批准。
- 从真实应用状态展示权威版本、状态、时间戳和错误。
- 翻译文案、语言判断和区域化格式化规则必须在 GUI 适配器完成；core 保持语言无关，只暴露稳定、语言中立的领域错误标识、结构化数据和机器可读时间戳，由适配器使用 `i18next`/`rust-i18n` 映射为当前语言的展示文案。
- 提交前明确展示破坏性操作和批处理操作范围。
- I/O、等待、计时器、进程和命令到核心的调用保持异步。只有测量确认的 CPU 密集工作才可考虑 `tauri::async_runtime::spawn_blocking` 或其他已批准线程边界，并提供明确的所有权、取消、并发上限和资源预算证据。仅支持阻塞调用的依赖应替换为异步能力，否则停止并进入范围或硬规则例外流程。

## 最低证据

- Rust 命令测试覆盖核心成功路径和最高风险失败路径。
- 每个业务操作具有“GUI 事件/命令 → core API → core 测试”映射；核心测试先覆盖领域行为，GUI 测试只补命令、视图和平台机制映射。
- 前端测试覆盖 Mantine 交互、文件路由与生成路由树边界、查询生命周期、Jotai 转换和真实失败展示。
- 检查纯键盘使用和适用的无障碍语义。
- 默认语言探测、缺失资源回退英文、语言切换入口和切换后持久化都有测试或人工核对证据；Rust 端原生文案（托盘/通知/窗口标题）本地化同样有证据。
- 能力/权限配置拒绝未经批准的 WebView 调用。
- 可选支持界面只覆盖已选择项；远程能力在禁用或未同意时请求数为零，并测试允许地址/字段、响应、重定向、超时、取消和日志脱敏中的最高风险失败。
- 选择赞助或更新视觉时，运行时媒体与品牌 manifest 的路径、MIME、尺寸、字节数和 SHA-256 一致；支付码有支付方式明确的本地化替代文本，当前未引用小图仍完整保留在 Skill 品牌源目录。
- GUI/其他适配器并发访问时观察到相同数据且不发生损坏。
- 日常开发只运行本次 GUI 变化所需的非空 Vitest/Testing Library 与 Rust 单元/回归测试。显式构建先逐次解析 E2E，运行完整非空 Rust 与前端单元测试套件，再执行锁定的 Vite/Tauri 构建；格式、lint、类型、中文注释和 `dist` 扫描不自动追加。
- 缺少签名身份、证书、公证凭据或更新器密钥不阻断允许 unsigned 的本地构建或候选冒烟；使用 `--no-sign` 并记录 unsigned。macOS Developer ID 直接分发一旦签名，必须在候选摘要前完成公证与 ticket stapling；禁止只签名未公证的中间态。
- macOS 宿主的原生 DMG 与 Windows x64 NSIS 候选使用 `$desktop-build-tauri-release`。Windows 交叉路线只使用 cargo-xwin + NSIS，拒绝 MSI，并把 Windows runtime 保持为 `Unverified`。
- macOS DMG 必须在最终签名、公证与 stapling 字节上只读验证 `.DS_Store`、本地背景、唯一应用包与 Applications 拖拽目标；只检查配置或源码图片不构成 Finder 安装布局证据。headless CI 不得无界等待 Finder AppleScript。
- 真实打包应用或发布模式应用能在当前平台启动并渲染关键路由。
- 每个声称支持的安装器或原生平台都有实际构建和完整验收证据。只有当前构建选择或产品/渠道硬要求启用冒烟/E2E 时才要求相应证据；否则记录 `Not run` 和风险。

## 例外与推荐边界

Tauri 2 和固定 React 前端技术栈是硬规则。替换它们必须记录硬规则例外，其中包含未满足的约束、风险、替代证据和恢复/迁移标准。

`react-i18next`/`i18next`、`rust-i18n` 与 `tauri-plugin-os` 的语言探测同样是硬规则。替换任一项、跳过语言切换入口或改为不跟随系统语言的默认值都必须记录硬规则例外；具体已支持的语言列表和翻译文案内容仍是项目特定选择。

插件、伴随进程、托盘行为、自动启动、更新器、更宽泛的平台 API、表单/图标/图表包、网络 client 与远程遥测仍是项目特定选择。Vite、pnpm、ESLint/`typescript-eslint`、Prettier、Vitest 和 Testing Library 属于固定前端基线；替换时必须记录硬规则例外。其他包只有存在已批准需求，并同步依赖、安全、打包和测试变更时，才能增加或推荐。

官方运行时和签名参考：

- [Tauri 异步运行时](https://docs.rs/tauri/latest/tauri/async_runtime/)
- [Tauri 分发与签名](https://v2.tauri.app/distribute/)
- [Tauri Windows 安装包与 macOS 交叉构建](https://v2.tauri.app/distribute/windows-installer/#build-windows-apps-on-linux-and-macos)
- [Tauri macOS 签名与公证](https://v2.tauri.app/distribute/sign/macos/)
- [Windows 签名行为](https://v2.tauri.app/distribute/sign/windows/)
- [Linux 签名行为](https://v2.tauri.app/distribute/sign/linux/)
