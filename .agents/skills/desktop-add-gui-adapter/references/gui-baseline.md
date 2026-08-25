# Tauri 桌面 GUI 基线

仅在明确的下游请求通过 GUI 范围闸门后阅读本参考。同时阅读 GUI 所属的 [React 前端基线](react-frontend-baseline.md)。

## 固定默认值

- 将 Tauri 2 与现有 Rust 共享核心及 Tokio 适配器标准配合使用。
- 复用 Tauri 基于 Tokio 的单例异步运行时，并以普通 `async fn` 实现自定义命令；不得创建嵌套 Tokio 运行时。
- 使用 Vite、Mantine UI、`@tabler/icons-react`、TanStack Router 文件路由、TanStack Query 和 Jotai 打包本地 React + TypeScript 前端；使用 ESLint/`typescript-eslint`、Prettier、Vitest 与 Testing Library 作为固定质量工具链。
- 界面国际化是开发期硬性必选项，不是可选增强。Rust 后端（GUI 适配器层）固定使用 `rust-i18n` 输出系统托盘、原生窗口标题、系统通知等未经 React 渲染路径的用户可见文案；系统语言探测统一使用官方 Tauri 插件 `tauri-plugin-os` 的 `locale()` API，作为 Rust 与前端唯一共用的系统语言来源，不得分别使用平台专有 API 或环境变量（见 ADR-20260806-001）。
- GUI 强制使用官方 `tauri-plugin-single-instance`，并把它作为 Tauri Builder 的首个 plugin 注册。同一用户会话再次启动相同应用身份时，第二进程通知既有实例后退出；回调只复用 `restore_main_window` 恢复、取消最小化并聚焦既有 `main` 窗口，不得创建第二个主窗口。中性脚手架忽略且不记录第二次启动参数与工作目录，不借此触发业务动作；文件关联、深链或参数转发必须以后独立批准并交由 core 判定。Linux Snap/Flatpak 还必须在对应渠道清单声明官方插件要求的会话 DBus own/talk 权限，并在真实沙箱候选重验。
- Tauri `tauri` 依赖强制启用 `tray-icon` feature，系统托盘不是可选增强。项目本地 Tauri `icon` 命令必须产出普通非符号链接的 `src-tauri/icons/32x32.png`；它必须是 32×32、8-bit RGBA、非交错且至少含一个非透明像素，并被 `tauri.conf.json` 的 `bundle.icon` 精确引用。托盘安装函数必须由 Tauri Builder `.setup(...)` 实际调用；在同一实现中组装仅含 `show_window`/`quit` 的 `Menu`、以 `.menu(&menu)` 绑定、把 `default_window_icon()` 当作必需值（缺失即失败）、以 `.icon(...)` 绑定并成功 `.build(app)`，不得在图标缺失时继续创建无图标托盘。该菜单绑定也满足 Tauri 官方说明的 Linux 图标可见性要求。两项文案由 `rust-i18n` locale 资源提供“显示窗口”和“退出”：显示动作及主鼠标左键释放都复用 `restore_main_window` 执行主窗口 `show`、取消最小化并聚焦；主窗口 `WindowEvent::CloseRequested` 处理必须由 Builder `.on_window_event(...)` 实际注册，随后 `prevent_close()` 并隐藏且进程继续，只有 `quit` 显式结束应用。默认不加入自动启动、后台业务或其他托盘菜单项；不得因 Draft、宿主差异、页面简单或实现偏好省略，单实例/托盘的资产、配置引用、运行时接线、回归或真实宿主证据任一缺失都阻断初始化。
- GUI 初始化必须先实际生成正好 3 个 1024×1024 Logo 候选并由用户选择；选中母版、`/app-identity/logo.png`、可见的 `icons/32x32.png` 与平台图标共享同一来源和摘要证据，禁止中性占位图或全透明托盘图标进入基线提交。
- GUI 图标固定使用 `@tabler/icons-react` 的命名组件。存在适用图标时不得引入其他图标库、手写 SVG、字符或 emoji；图表相关操作、状态和空态优先使用 Tabler 图标，实际图表绘制库仍按产品需求选择。默认收起侧栏中的 Logo 与每一个当前渲染图标必须水平居中且无裁切。
- 初始化固定建立默认收起的左侧菜单与 `/settings`、`/about`、`/sponsor` 文件路由。侧栏顶部始终先显示选中 Logo、再紧接应用版本；Logo 与版本在展开/折叠状态及设置页直接可见。产品功能项和赞助/设置/关于固定项均必须提供图标；折叠时显示图标与本地化 Tooltip 名称，展开时显示图标与名称，并始终保留可访问名称。产品功能项从顶部向下增长，底部固定组按视觉顺序为赞助、设置、关于。设置页提供中英文、浅色/深色/跟随系统和统计同意；关于页提供手动检查更新，未配置远端能力时显示 `NotConfigured`/禁用状态并保持零出站。关于页还显示当前应用名、权威版本、作者、作者联系方式和三段免责声明；赞助页使用固定品牌档位、权益、双支付码和完整 sponsor 本地媒体。
- `tauri.conf.json` 的主应用窗口固定以逻辑像素初始化为 1440×900，最小 960×640，居中且 `preventOverflow: true`；默认尺寸确保展开 248px 侧栏时三张赞助档位卡仍同屏横向呈现，较小窗口由响应式布局降列。该窗口与 `bundle.macOS.dmg.windowSize` 的 660×400 安装卷窗口互不替代。
- Mantine provider 使用 `defaultColorScheme="auto"`、显式 local-storage color-scheme manager 和唯一 CSS variables resolver；亮色/暗色分别提供页面背景、surface、主/次文字、边框与强调色，设置页允许 `light`/`dark`/`auto` 并持久化。赞助页通过 `useComputedColorScheme` 使用运行时有效主题的明确背景叠层、surface 和对比色，不把初始化宿主主题冻结到产物。
- 原生窗口标题与 `document.title` 固定使用同一公式 `{applicationName} {version} {contactChannel}:{contactValue}`。应用名/版本来自权威 Tauri/打包元数据，联系字段来自品牌 profile 的 `contacts.windowTitle`，不得写死一次构建版本。
- 不得加载远程内容。
- 保持 Tauri Rust 边界轻薄：只验证反序列化、协议必填字段和调用 WebView 能力，随后调用一个核心用例并映射有类型的结果；值域、跨字段约束、资源状态和业务权限由核心验证。
- 调用时为 Tauri/前端直接依赖声明彼此兼容的最低稳定范围，使用最低直接版本解析验证 Rust MSRV、Node.js/pnpm 和目标平台 WebView，再由正常锁文件固定实际解析结果；不得用精确依赖版本或“最新”代替兼容下界。
- 使用 pnpm 作为前端包管理器。初始化阶段由 `$desktop-check-development-environment` 检查 Node.js 和 pnpm；初始化后不得因缺少当前宿主证据预检，先运行真实 pnpm 命令，只有该命令已因受管环境问题失败时才进入对应恢复并单次重试。
- 固定前端同时适用于中性 `Draft` 脚手架和已批准产品。不得根据页面数量把它替换为普通 HTML/ES 模块或其他框架。
- Mantine 主题、布局、状态、响应式与无障碍细节统一遵守 [Mantine UI 设计规范](mantine-ui-guidelines.md)。

## 必需设计输入

记录：

- `docs/GUI_APP_PROFILE.md` 中已批准的应用显示名称、主窗口标题、简短说明、应用标识符和用户选择的图标来源；
- 初始化资料还必须包含三个 Logo 候选的预览/摘要、用户选择、`<project-id>_gui/src-tauri/icons/app-icon-master.png`、`<project-id>_gui/public/app-identity/logo.png`、`<project-id>_gui/src-tauri/icons/32x32.png` 的格式/可见像素/配置引用及平台图标生成证据；
- 固定标题、侧栏、设置/关于/赞助页直接读取 `$desktop-prepare-gui-support-surfaces` 的 profile、翻译、React 模板和 sponsor 媒体，不要求 `docs/GUI_SUPPORT_SURFACES.md`；只有修改该基线、增加其他支持界面或启用出站能力时才读取下游实例文档，未选择的远程能力不得建立配置或请求；
- 选择 macOS 直接分发 DMG 时，初始化先把中性 660×400 PNG 写入 `<project-id>_gui/src-tauri/dmg/background.png`，`tauri.conf.json` 的 `bundle.macOS.dmg.background` 固定引用 `./dmg/background.png`，窗口与落点固定为 660×400、应用 `(180, 220)`、Applications `(480, 220)`；首次真实 GUI 开发必须记录对该图片的预览批准或同路径替换、SHA-256、文案语言，以及软件许可页是否由产品/渠道要求。背景不得含 Harness 或其他产品身份；
- 已批准的人类使用场景，以及选择桌面界面的原因；
- 固定主窗口 1440×900、最小 960×640，以及产品功能菜单项、页面、路由、导航和操作；
- 空、加载、成功、验证、冲突和失败状态；
- 键盘顺序、快捷键、焦点行为、标签和无障碍验收；
- 适用时的稳定 ID、选择语义、批处理范围、搜索、排序和分页；
- 刷新、并发修改、取消和恢复行为；
- 固定托盘/关闭隐藏之外，必需的文件系统、进程、通知、Shell、自动启动或 updater 访问；启用更新、强更或统计时还需完整产品 profile、签名/策略公钥、安全私钥引用、同意与保留边界；
- 当前平台打包目标，以及保持 `Unverified` 的其他平台。

## 界面国际化（i18n）

- 初始化已包含真实侧栏、设置/关于/赞助页面和托盘文案，因此必须在中性脚手架阶段接入完整 i18n 技术栈。
- 默认语言在应用启动时使用 `tauri-plugin-os` 的 `locale()` 探测系统语言；缺少对应翻译资源时回退英文，不得静默显示未翻译的原始 key 或英文与目标语言混排。
- `/settings` 必须提供可发现的中文/英文切换；用户手动切换后的选择必须持久化，并在后续启动时覆盖系统探测结果，直至用户重置。
- Rust 端 `rust-i18n` 只负责适配器自身产出的原生文案（托盘菜单、窗口标题、系统通知），不得承载业务规则、领域校验或业务默认值；翻译资源文件与业务代码分离存放。
- 用户的语言选择是 GUI 本地设备级展示偏好，使用 GUI 适配器自有的本地持久化位置保存，不得写入共享 core 的持久化层或借此新建第二套业务数据权威副本。

## 安全与架构规则

- 为打包内容定义明确 CSP。
- 只向命名窗口/WebView 授予能力，并且只包含必需权限和作用域。
- 保持禁用远程 URL 访问。
- 任何支持界面远程能力必须先通过 `$desktop-prepare-gui-support-surfaces` 记录独立能力清单；默认禁用，秘密仅由安全运行时来源提供且不进入前端，任务必须具有 owner、取消、超时和关闭回收。
- 更新启用后固定使用官方 Tauri updater 和签名制品，签名验证不可关闭；强更只由 adapter 验证的最低支持版本事实进入 core 作严格 SemVer 判定，React 不信任远端布尔字段。`RequiredUpdate` 使用不可关闭的根级门，只允许安装或安全退出。检查失败默认 fail-open 且不能伪装为最新版。
- 统计上报默认关闭，禁用或未同意时请求数为零；只由 GUI Rust adapter 使用 HTTPS JSON POST 发送固定 `app_started` 字段，禁止 GET/query、稳定设备/安装标识、自由文本和客户端 secret。撤回同意立即取消请求并清空有界内存队列，失败不阻断主流程。
- 赞助品牌包内支付二维码是敏感静态媒体，随固定赞助页进入应用 bundle，但不得被前端解释为订单、支付状态、权益或账户事实。更新 banner 仍只有选择更新视觉时才进入 bundle，且不授权网络更新能力。
- 窄 Rust 命令能够执行已批准操作时，不得公开通用文件系统或 Shell 访问。
- 持久数据、迁移、并发控制和业务验证必须由共享核心/存储层负责。
- 业务规则、默认值、领域状态转换和包含条件/重试/状态决策的调用编排必须位于核心；React 事件、Tauri command 和平台回调只调用核心并映射结果，即使当前只有 GUI 也同样适用。
- 固定单实例、系统托盘与关闭隐藏生命周期位于 GUI adapter；只有显式托盘退出结束应用，存在 owned task 时必须先取消并回收。实现必须包含 `single_instance_plugin_is_registered_first`、`second_launch_restores_existing_main_window`、`tray_show_restores_and_focuses_main_window`、`close_request_hides_without_exit`、`tray_quit_exits_application` 五个固定命名回归，并在初始化基线前通过 `verify-gui-lifecycle-contract.mjs` 对 32px RGBA 非透明资产/配置引用、`.setup`/菜单/图标/构建/窗口事件接线失败关闭，再通过真实宿主双启动/托盘 E2E 证明托盘有可见图形而非空白点击区域；宿主无法判定进程/窗口唯一性或观察托盘同样失败。通知、自动启动和快捷键等其他桌面机制仍需独立批准；它们触发的业务动作调用既有核心用例，不能直接修改权威业务状态。
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
- 三个 Logo 候选均有真实预览与摘要，用户选择后的母版、运行时 Logo 和平台图标可追溯；侧栏默认收起，Logo 位于版本上方且两种状态均可见。产品功能项向下增长，固定底部顺序为赞助、设置、关于；`/settings`、`/about`、`/sponsor` 存在，赞助页分别通过亮色/暗色渲染，关于页作者、联系方式和三段免责声明完整。未配置更新或统计时请求数为零；启用后测试允许地址/字段、策略与制品签名、SemVer 强更、同意撤回、响应、重定向、超时、取消和日志脱敏中的最高风险失败。
- GUI 生命周期结构检查证明单实例依赖与首插件顺序、只恢复既有窗口的回调、`tray-icon`、非透明 32px RGBA 应用图标及配置引用、从 `.setup` 可达且绑定 Menu/icon/build 的托盘安装、已注册的关闭事件、稳定 ID、双语资源和五个固定命名回归齐全；真实宿主 E2E 再证明第二次启动自行退出且只剩同一主进程/主窗口，状态栏/通知区域出现可见非空图形，菜单恰好只有显示/退出、主鼠标左键与显示菜单项都恢复并聚焦、关闭主窗口只隐藏且进程继续、托盘退出结束进程并移除图标。原生标题与 `document.title` 使用同一权威名称、版本和联系字段。
- 固定 sponsor 运行时媒体与品牌 manifest 的路径、MIME、尺寸、字节数和 SHA-256 一致；支付码有支付方式明确的本地化替代文本，当前未引用小图也进入下游 sponsor 媒体。更新 banner 未选择时不进入 bundle。
- GUI/其他适配器并发访问时观察到相同数据且不发生损坏。
- 日常开发只运行本次 GUI 变化所需的非空 Vitest/Testing Library 与 Rust 单元/回归测试。显式构建先逐次解析 E2E，运行完整非空 Rust 与前端单元测试套件，再执行锁定的 Vite/Tauri 构建；格式、lint、类型、中文注释和 `dist` 扫描不自动追加。
- 缺少签名身份、证书或公证凭据不阻断渠道允许的 unsigned 安装候选；使用 `--no-sign` 并记录 unsigned。启用 updater 时发布签名密钥缺失会阻断 updater 制品候选，不能用 unsigned 安装包绕过。macOS Developer ID 直接分发一旦签名，必须在候选摘要前完成公证与 ticket stapling；禁止只签名未公证的中间态。
- macOS 宿主的原生 DMG 与 Windows x64 NSIS 候选使用 `$desktop-build-tauri-release`。Windows 交叉路线只使用 cargo-xwin + NSIS，拒绝 MSI，并把 Windows runtime 保持为 `Unverified`。
- macOS DMG 必须在最终签名、公证与 stapling 字节上只读验证 `.DS_Store`、本地背景、唯一应用包与 Applications 拖拽目标；只检查配置或源码图片不构成 Finder 安装布局证据。headless CI 不得无界等待 Finder AppleScript。
- GUI 中性初始化结束前，必须先由 `verify-gui-lifecycle-contract.mjs` 通过结构门禁，再由 `$desktop-test-gui-initialization-e2e` 构建并双启动真实本机调试二进制，实测第二次启动只唤醒既有窗口后退出、单一长期主进程/主窗口、托盘精确菜单与关闭隐藏/两种恢复/退出生命周期，并验证收起侧栏居中和所有渲染菜单页面可达；任一失败或无法观察都阻断。真实打包应用或发布模式应用的最终候选验收仍是独立门禁。
- 每个声称支持的安装器或原生平台都有实际构建和完整验收证据。只有当前构建选择或产品/渠道硬要求启用冒烟/E2E 时才要求相应证据；否则记录 `Not run` 和风险。

## 例外与推荐边界

Tauri 2 和固定 React 前端技术栈是硬规则。替换它们必须记录硬规则例外，其中包含未满足的约束、风险、替代证据和恢复/迁移标准。

`react-i18next`/`i18next`、`rust-i18n` 与 `tauri-plugin-os` 的语言探测同样是硬规则。替换任一项、跳过语言切换入口或改为不跟随系统语言的默认值都必须记录硬规则例外；具体已支持的语言列表和翻译文案内容仍是项目特定选择。

单实例、固定两项托盘菜单、托盘左键显示、关闭隐藏和显式退出是不可省略的 GUI 初始化硬门禁；改变或移除它们必须先变更产品/平台范围并记录硬规则 ADR，不得以无法观察或 `Not run` 通过。可收起侧栏、版本展示、`@tabler/icons-react` 图标来源与设置/关于/赞助路由同属 GUI 基线。伴随进程、自动启动、真实 updater 配置、更宽泛的平台 API、表单/图表绘制包、网络 client 与统计传输仍是项目特定选择。Vite、pnpm、ESLint/`typescript-eslint`、Prettier、Vitest 和 Testing Library 属于固定前端基线；替换时必须记录硬规则例外。其他包只有存在已批准需求，并同步依赖、安全、打包和测试变更时，才能增加或推荐。

官方运行时和签名参考：

- [Tauri 系统托盘](https://v2.tauri.app/learn/system-tray/)
- [Tauri Single Instance 插件](https://v2.tauri.app/plugin/single-instance/)
- [Tauri `WindowEvent::CloseRequested`](https://docs.rs/tauri/latest/tauri/enum.WindowEvent.html)
- [Tauri 异步运行时](https://docs.rs/tauri/latest/tauri/async_runtime/)
- [Tauri updater](https://v2.tauri.app/plugin/updater/)
- [Tauri 分发与签名](https://v2.tauri.app/distribute/)
- [Tauri Windows 安装包与 macOS 交叉构建](https://v2.tauri.app/distribute/windows-installer/#build-windows-apps-on-linux-and-macos)
- [Tauri macOS 签名与公证](https://v2.tauri.app/distribute/sign/macos/)
- [Windows 签名行为](https://v2.tauri.app/distribute/sign/windows/)
- [Linux 签名行为](https://v2.tauri.app/distribute/sign/linux/)
