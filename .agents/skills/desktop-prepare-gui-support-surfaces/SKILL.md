---
name: desktop-prepare-gui-support-surfaces
description: 为所有已选 GUI 提供固定动态标题、默认收起的 Logo→版本侧栏、设置/关于页、亮暗双主题赞助页与品牌资源，并为产品配置签名更新、强更和默认关闭的统计上报能力。
---

# 准备 GUI 支持界面

选择 GUI 时由 `$desktop-add-gui-adapter` 自动消费本 Skill 的固定本地基线；初始化后，只有修改该基线、增加其他支持界面或配置出站能力时才再次调用。动态标题、顶部固定 Logo→当前版本且默认收起的左侧菜单、设置页、关于页与同时支持亮色/暗色的赞助页默认成组存在；设置页始终提供语言切换和手动检查更新入口，但没有完整产品 profile 时显示 `NotConfigured` 且零出站。真实更新服务、强更策略和统计传输仍需产品批准与配置，统计同意默认关闭。

## 工作流程

1. 先判断调用模式。由 `$desktop-add-gui-adapter` 在初始化中调用时，只读取 `AGENTS.md`、`docs/ENGINEERING_RULES.md`、GUI/Rust 基线和本 Skill 资产，不要求 Product Spec、`docs/GUI_APP_PROFILE.md` 或产品实例文档；初始化后修改默认界面或增加能力时，再读取最新 Product Spec、相关 ADR、已批准的 `docs/GUI_APP_PROFILE.md` 和现有 GUI 实现。新增能力若改变产品边界、隐私承诺或对外协议，先转 `$desktop-define-product`。未选择 GUI 时停止。
2. 固定本地基线包括：标题公式 `{applicationName} {version} {contactChannel}:{contactValue}`；由 GUI 身份流程注入的本地 `/app-identity/logo.png`；默认收起的固定左侧菜单，其顶部先显示 Logo、下一项紧接持续可见的权威版本；产品功能项从顶部向下增长；底部固定项按视觉顺序为赞助、设置、关于，即从底部向上为关于、设置、赞助；固定 `/settings`、`/about`、`/sponsor` 路由；设置页的中英文切换、手动检查更新状态和统计上报同意；关于页的当前应用名、权威版本、作者、作者联系方式与固定免责声明；赞助页的三档价格/权益、支付说明、双支付码和完整 sponsor 媒体。Mantine 根以 `defaultColorScheme="auto"` 同时提供亮色和暗色，赞助页从 `useComputedColorScheme` 获取有效主题并使用不同背景叠层、surface 和对比色，不能把初始化机器当时的主题固化为唯一版本。应用名、版本、Logo 与功能项由当前下游注入，品牌内容读取 `assets/brand-support/`。未配置远端能力时更新为 `NotConfigured`、统计开关禁用且零出站；自动启动、远程帮助、外部链接、订单、权益发放、账户和支付状态不属于默认基线。
3. 初始化不得创建 `docs/GUI_SUPPORT_SURFACES.md`。只有产品要修改固定本地基线、增加其他支持界面或启用任一出站能力时，才按需从 `assets/brand-support/GUI_SUPPORT_SURFACES.template.md` 创建或更新该文件，记录差异、内容/资源来源、i18n 键、可访问名称、所有权、启用状态和未决项。该文件是下游产品事实，Harness 模板不得预创建；升级器必须将其视为 `protected`。详细字段与所有权矩阵见 [references/gui-support-surfaces.md](references/gui-support-surfaces.md)，关于/赞助模板与媒体集成见 [references/about-and-sponsor-pages.md](references/about-and-sponsor-pages.md)，更新、强更与统计上报的固定状态机和安全边界见 [references/update-and-telemetry.md](references/update-and-telemetry.md)。
4. 先划分职责再实现：
   - 当前产品名、版本、功能与宿主交互留在 GUI；标题固定使用当前应用展示名、权威打包版本和 profile 的 `contacts.windowTitle` 动态组装为 `{applicationName} {version} {contactChannel}:{contactValue}`，原生窗口标题与 `document.title` 必须一致，不写死一次构建版本。共享作者、联系人、免责声明、赞助内容和媒体读取 `assets/brand-support/`，不得另建漂移副本；
   - 领域校验、跨接口可复用的资格判断、状态转换、默认值和稳定错误进入 shared core，并先覆盖成功路径与最高风险失败路径；
   - 窗口标题、系统浏览器、原生通知、平台元数据采集、Tauri 权限和 WebView 展示属于 GUI adapter；React 只拥有路由、展示和纯交互状态；
   - 赞助若只展示本地内容可留在 GUI；一旦产生权益、订单、支付或账户状态，就是新的业务与外部副作用，必须另行定范围和授权。
5. 对任何更新检查、统计上报、远程帮助内容或其他出站能力逐项建立显式能力清单。未获批准时保持禁用且不得发请求。清单至少包含目的、触发器、HTTP 方法、允许的 origin/路径模板、请求字段、响应 schema、重定向范围、超时、响应大小、重试/并发上限、失败语义、日志脱敏、秘密来源引用，以及适用的同意、保留和删除政策。桌面 bundle 不能保密，不得把服务端 secret、共享口令或发布私钥放入 Rust/TypeScript、Tauri 配置或前端产物。
6. 秘密只能由已批准的安全运行时来源提供。不得把实值放入 Rust/TypeScript 源码、常量、文档、配置样例、测试夹具、日志或前端 bundle；产品事实只记录秘密引用名和归属。前端不得持有能代表服务端或发布者身份的长期秘密。
7. 更新能力按 `NotConfigured`、`Idle`、`Checking`、`UpToDate`、`OptionalUpdate`、`RequiredUpdate`、`Failed` 建模。启用时使用官方 Tauri updater 生成并验证签名制品，默认拒绝降级和 target/arch/channel 不匹配。强更只能由 adapter 验证过真实性和目标绑定的 `minimumSupportedVersion` 事实交给 core，以严格 SemVer 比较得出；不得信任远端 `forcedUpdate` 布尔值。`RequiredUpdate` 使用根级不可关闭门，普通功能不挂载，只允许安装签名更新或安全退出。检查、策略或网络失败默认 fail-open，且不得伪装为最新版；渠道确需 fail-closed 时必须单独批准离线与恢复风险。
8. 统计上报默认关闭且必须明确同意。固定基线只允许下一次符合条件时发送一次每进程 `app_started`，由 GUI Rust adapter 以 HTTPS JSON `POST` body 发送精确字段白名单；禁止 GET/query、自由文本、令牌、路径、业务载荷、稳定设备/安装标识、用户名或主机名。撤回同意立即取消在途请求、清空最多 32 条的内存队列并恢复零出站；任务、超时与至多两次重试必须有应用生命周期 owner，禁止 detached task，失败始终 fail-open。任何新增事件、字段、稳定标识符或持久队列都需重新批准产品、隐私和适用法律边界。
9. 用户可见文字必须在 GUI 初始化时接入 `i18next`/`react-i18next` 与 `rust-i18n`，跟随主题、键盘导航和无障碍语义。前端注册 `i18n/*.json`，Rust GUI adapter 复制并加载 `rust-i18n/*.yml` 的托盘文案，两者使用同一 locale 解析结果。当前产品名、版本、Logo、功能和可选动作仍由下游注入；固定侧栏使用 `AppSidebarTemplate.tsx` 与 `DEFAULT_SIDEBAR_COLLAPSED = true`，Logo 在 DOM 中位于版本之前，折叠后仍直接显示两者；`/settings`、`/about` 与 `/sponsor` 是固定路由，底部菜单严格按赞助、设置、关于渲染。设置页使用 `SettingsPageTemplate.tsx`；强更使用根级 `MandatoryUpdateGateTemplate.tsx`。关于页固定展示 `about.studio` 表示的作者、profile 联系方式和三段免责声明；赞助页固定复用品牌包的三档价格/权益、支付码与视觉资源，并以运行时有效主题渲染。赞助布局不得恢复固定 800px、固定三栏或全页 `pointer-events: none`。
10. 对品牌包执行默认本地打包：GUI 下游完整保留 Skill 的 13 个源图片，并在初始化时把 `media/sponsor/*` 全部复制到应用 public 的 `/brand-support/sponsor/`，包括当前未引用小图；只有产品选择更新视觉时才复制 `media/updater/banner.jpg`。禁止优化、重绘或解码重建支付二维码；复制后以 `media-manifest.json` 的字节数和 SHA-256 复核。固定页面在未配置远端能力时不得发起网络请求，静态支付材料也不授权任何支付自动化。
11. 使用 `$desktop-implement-change` 直接实施。初始化至少以非空单元/回归测试覆盖动态标题、侧栏默认收起、Logo→版本顺序及展开/折叠持续可见、功能区与固定底部顺序、`/settings`/`/about`/`/sponsor`、语言切换、`NotConfigured` 零出站、作者/联系人/免责声明、赞助页亮色/暗色差异、赞助价格与支付码替代文本、响应式布局和媒体摘要。启用更新时再覆盖 core SemVer 强更边界、策略与制品签名、target/channel、取消回收、单飞、不可绕过强更门和失败语义；启用统计时覆盖默认/未同意/撤回零出站、POST 字段白名单、禁止稳定标识、队列/重试上限和关闭回收。不得用 mock 网络或组件单测声称真实更新、安装或上报可用。
12. 日常实施不自动追加全仓格式、类型、lint、中文注释、生产构建、最终 `dist` 扫描或完整验收；媒体清单/摘要复核仅在本次复制品牌媒体时运行。只有独立事件触发时才更新 Product Status、ADR 或 Changelog。用户显式请求构建时交给 `$desktop-build-tauri-release`，由构建流程逐次确认 E2E 并全量运行单元测试；本 Skill 不发送真实遥测、调用生产更新服务、执行支付或发布。

## 边界

- 本 Skill 的固定侧栏、设置/关于/赞助页面和品牌资产是 GUI 初始化基线，但不要求 CLI/TUI/MCP 存在；设置页的本地入口不授权任何出站，真实更新、强更策略与统计传输仍必须由产品范围单独批准。
- `docs/GUI_APP_PROFILE.md` 继续拥有应用展示身份；`docs/GUI_SUPPORT_SURFACES.md` 只拥有对固定基线的已批准修改、额外支持界面与出站清单，两者不得互相覆盖。
- Harness 不保存来源下游产品名/标识、路由、固定 endpoint、秘密、版本、遥测实例或批准结论；产品家族共享的工作室品牌、联系人、固定赞助内容和 13 个媒体文件是 `assets/brand-support/` 的封闭例外。
- 本 Skill 在选择 GUI 的终端下游完整保留，包括品牌依赖资产；非 GUI 下游必须在初始化裁剪中删除。Harness 升级传播整个条件 Skill，但不覆盖产品实例文档。
- 支付二维码是敏感静态品牌材料。携带或展示它不授权订单、权益、账户、自动支付、支付回调或支付状态确认；真实交易副作用必须独立定范围和授权。

## 完成输出

报告固定标题、侧栏默认收起及 Logo→版本顺序、设置/关于/赞助路由及顺序、赞助页亮色/暗色证据、默认打包媒体、产品事实文档位置（若有）、更新/强更/统计状态与 GUI/core 所有权、出站清单、签名/秘密是否只使用安全引用、同意默认值、运行过的检查、未验证平台和剩余隐私/发布风险。
