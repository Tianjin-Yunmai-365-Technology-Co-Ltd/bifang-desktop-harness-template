# 2026-11-07 变更记录

本文件完整承接前一日仍有效能力与历史绑定，加入 2026-11-07 的独立 TUI 退役、NSH 顶层分类和 Mixed 桌面接线；历史变化不重新声明为本日新增或重新验证。历史摘录、稳定标识及原始验证部分保留在 [历史记录](CHANGELOG_history.md)；归档边界与恢复方法见 [ADR-20261020-001](../adr/20261107_ADR.md)。

## 2026-11-07 移除

- `HARNESS-REMOVE-TUI`（`required_version = 202611070300`）：永久移除独立 Ratatui TUI 程序类型、适配器 Skill、依赖候选及构建/验收路由；顶层 `interfaces = ["tui"]` 仍非法。旧下游的 TUI 工程资产仍受保护，声明 TUI 的升级须先在目标项目单独迁移，不能静默删代码。NSH 内部 TUI 目标另受当前运行时不可用门禁，见 [ADR-20261107-001](../adr/20261107_ADR.md)。

## 2026-11-07 变化

- `HARNESS-SEC-NSH-LINUX-DEEP-LINK-ENTRY`（`required_version = 202611071243`）：新生成的 Linux NSH 深链接注册脚本改为先写同目录私有临时 desktop entry，再原子替换目标，避免已有条目是符号链接时覆盖其指向的同用户文件；增加符号链接、目录目标和失败清理回归。旧下游不会自动改写注册脚本，真实 Linux 宿主运行仍需单独验证。

- `HARNESS-FEAT-NSH-MIXED-DESKTOP`（`required_version = 202611071119`）：新 NSH 下游的桌面、移动和 Web 均创建 Mixed TSX UI + 共享 Rust core；桌面由自定义 AppKit/Win32/GTK 宿主固定提供多窗口，并将托盘、自启、单实例、深链接按九字段配置分别接线。深链接依赖单实例；系统通知与 OS 全局快捷键仍不可用。桌面开发和打包入口改为生成 bundle、编译原生宿主并装配资源；移动/Web 继续走官方 Mixed 宿主。初始化问询、能力引用、设计和技术知识已同步。真实目标平台行为仍须独立取证，既有 GUI/NSH 下游只读兼容。见 [ADR-20261107-003](../adr/20261107_ADR.md)。

- `HARNESS-CHANGE-NSH-TOP-LEVEL`（`required_version = 202611071119`）：NSH 以“下一代全平台开发框架”成为与 CLI、MCP、DESKTOP 平级的程序类型；新工程写 `interfaces = ["nsh"]`、`nsh-targets`、独立 `_nsh` 成员，桌面/移动/Web 子目标与具体平台对应。既有 NSH 九项配置归入桌面目标，未选桌面时不询问或生成该 profile。原 GUI/NSH 下游只读兼容。TUI 子目标在固定 NSH 0.4.0 暂不可创建、运行或打包，表单选择时失败关闭；此前删除的独立 TUI 适配器不恢复。相关接线与回归由本次交付报告确认，真实跨平台产物须另行验证。见 [ADR-20261107-002](../adr/20261107_ADR.md)。

- `HARNESS-CHANGE-NSH-WIRING`（`required_version = 202611070300`）：把 NSH 独立打包、真实渲染测试、发布日志按钮、双语分类内容和最终候选证据接入 Harness 硬契约；纠正 iOS 本地 `.app` 与正式 IPA 的边界。中性 macOS 与 Web 工程已完成真实本地打包、候选构建及最终产物界面 E2E；移动平台及正式产品候选仍按各自证据判断。

## 2026-11-06 新增

- `HARNESS-FEAT-DETERMINISTIC-INSTANTIATION`（`required_version = 202611061437`）：增加确认摘要绑定的工程层准备与检查后终端裁剪入口；固定 Git 可见源清单、重置双语身份与策略、保护许可证正文与第三方字节，独占写入并在失败时仅恢复可确认自有项。CLI/Tauri/GPUI/NSH 裁剪矩阵检查实际链接与导入；完整初始化、真实 GUI 检查和独立 Git 基线仍按原流程执行，真实下游及原生跨平台证据未执行。

- `HARNESS-FEAT-NSH`（`required_version = 202611061129`，既有正式发布绑定）：当时加入第三个 NSH GUI 选项及跨平台工程链路；当前顶层分类和 Mixed 接线以上述本日决定为准。NSH 支持桌面、Android、iOS 与 Web 目标；当时六项未接入的宿主能力不可用，tracked runtime 锁无法传递时阻断。提取工程知识并保留来源，未验证平台不报通过。

## 2026-11-05 移除

- `HARNESS-REMOVE-RETIRED-SERVICE-RESIDUE`（`required_version = 202611060921`，仅正式发布时取号）：清理退役服务执行合同、旧更新密钥门禁文字和远程追踪技术候选。升级器识别旧来源锁未登记的退役工程资产，首次询问并记忆本项目清理/保留选择；已选清理但未删除的文件不能记录为升级完成。历史裁剪与原文恢复依据见 [ADR-20261105-002](../adr/20261107_ADR.md)。

- `HARNESS-REMOVE-UPDATES-TELEMETRY`（`required_version = 202611051535`）：删除应用更新、强更与使用统计的专属 Skills、初始化基线、状态界面/翻译/媒体和候选制品门禁，同步依赖候选、升级传播与相关回归。关于页保留权威版本及本地双语发布日志；安装包代码签名和工程层升级继续按现行合同执行，既有下游产品实现受保护。本次正式发布将该变化绑定到上述所需版本，发布状态以 Git 引用复核为准。见 [ADR-20261105-001](../adr/20261107_ADR.md)。

## 2026-11-04 新增

- `HARNESS-FEAT-TECHNICAL-KNOWLEDGE`（`required_version = 202611041048`）：新增 `$desktop-extract-technical-docs`，从当前工作区提取技术选型、依赖、架构、文件结构与当前技术债，以 `knowledge/README.md` 为入口并调用 archify 生成交互架构图。缺少项目本地包时从现有完整 Skill 包安装，保留用户内容和原始权威记录；全接口保留提取入口，初始化排除已有快照与下载包，升级保护这些本地产物。本次正式发布将该变化绑定到上述所需版本，发布状态以 Git 引用复核为准。

## 2026-11-04 安全

- `HARNESS-SECURITY-LOCAL-SUPPORT-MEDIA`（`required_version = 202611041048`）：本地品牌媒体的绝对与相对路径拒绝 C0/DEL 控制字符，避免 URL 规范化后绕过仅本地加载边界；普通中文与空格资源名继续可用。真实源码执行回归覆盖原绕过、绝对 base 与相对路径，未触发外部加载。

## 2026-11-02 变化

- `HARNESS-CHANGE-INSTALLER-ARTIFACT-NAMING`（`required_version = 202611021437`）：Tauri/GPUI 的 Windows exe 与 macOS dmg 统一使用已确认展示名、无 v 原始版本、x64/arm64 架构及系统后缀；共用名称生成器拒绝非法路径字符，GPUI 本地与候选同步生成相邻校验和和 manifest，Tauri 在最终字节校验后复制命名。其他归档沿用原规则，收集不改写既有候选。见 [发布物命名](../RELEASE.md#发布物命名) 与 [ADR-20261102-001](../adr/20261107_ADR.md)。本次正式发布将该变化绑定到上述所需版本，发布状态以 Git 引用复核为准；未构建或验收真实产品。

## 2026-10-30 新增

- `HARNESS-FEAT-GRID-TYPOGRAPHY`（`required_version = 202610301829`）：统一 [通用 Grid](../design_standards/data_grid.md) 与 [字体排版基座](../design_standards/ui_foundation.md)，同步专项 Skill、检查项和 Tauri 中性资产。网格改用无横滚固定布局、列权重、可键盘查看完整值；选择支持单选/多选及跨页查询确认，刷新保留内容，按新鲜期查询并防重复重试。主题集中原生中文回退、标题/正文/辅助层级、等宽数字与亮暗文字语义。GPUI 补充原生规范，不注入 Web 依赖或网格。详见 [ADR-20261030-001](../adr/20261107_ADR.md)；本次正式发布将已完成变化绑定到上述所需版本，发布状态以 Git 引用复核为准。真实宿主字体、缩放、性能及 E2E 未验证。

## 2026-10-28 新增

- `HARNESS-FEAT-UNIFIED-UI-FOUNDATION`（`required_version = 202610282034`）：新增根 DESIGN.md 导航与受管 UI 统一设计基座，接入设计索引、Tauri/GPUI、日常实施、实例化/裁剪及升级候选；统一 Token、组件、样式层与反馈，视觉值统一收拢为中央 Token 并清理旧风格，保留列表数据合同、不增加默认业务能力或工具依赖。升级校验必需规范字节并保护项目自有 DESIGN.md；真实下游视觉、构建和 E2E 未执行。见 [UI 基座](../design_standards/ui_foundation.md) 与 [ADR-20261028-001](../adr/20261107_ADR.md)。本次正式发布将该变化绑定到上述所需版本，发布状态以 Git 引用复核为准。

- `HARNESS-CHANGE-CURRENT-DESIGN-ONLY`（`required_version = 202610282034`）：当前 UI 基座成为唯一视觉权威，清理旧侧栏像素硬锁、列表局部色板和重复设计治理；删除 taste 自动安装器、对应测试及完整 vendor 快照。Tauri/GPUI 模板实际消费中央展示 Token，强调色跟随主色；同步规格、初始化与回归合同，保留既有下游自有第三方资产与历史事实。见 [ADR-20261028-003](../adr/20261107_ADR.md)。真实下游窗口、构建和 E2E 未执行。

## 当前能力与契约

- 仓库边界与初始化：Harness 仅维护可复用工程及中性终端下游；CLI、MCP、DESKTOP、NSH 为顶层选择，默认 CLI，NSH 当前单独选择；先确认双语身份、唯一根、具体平台、NSH 子目标、策略和所选能力，再建立独立 Git 并裁剪派生入口。见 [项目入口](../../AGENTS.md) 与 [初始化 Skill](../../.agents/skills/desktop-instantiate-project/SKILL.md)。
- 核心与接口：领域规则、用例和权威状态在 core；CLI 非交互机器协议与 MCP stdio 各自薄适配，DESKTOP 按 Tauri/GPUI 分派，NSH 以独立薄适配器服务桌面、移动和 Web。文件/进程能力独立批准。见 [工程规则](../ENGINEERING_RULES.md)、[Rust 基线](../RUST_CLI_TEMPLATE.md) 和 [CLI 契约](../CLI_CONTRACT.md)。
- Task 与 Git：项目自动 Task 默认关闭，环境选择独立；真实身份、自主执行、所有权并行及 Local 串行遵守统一 Skill。Git 发布止于本地主分支/tag；冻结的发布后动作持续授权其所选后续路径，不恢复旧的双发布模式或自动资源清理。见 [Agent Policy](../AGENT_POLICY.md) 与 [Task 工作流](../../.agents/skills/desktop-task-workflow/SKILL.md)。
- 依赖与工程门禁：兼容下界、最小特性、真实最低版本验证及 ignored/tracked 锁策略分别判断；标准用户全局工具只按初始化或真实环境失败恢复，项目依赖保持本地；上游自动化使用 Node 标准库且不向下游传播 Python 禁令。文件规模、中文声明注释和按事件记忆均以 [工程规则](../ENGINEERING_RULES.md) 为准。
- GUI 与平台：Tauri/GPUI 按 DESKTOP 的 Cargo 框架隔离，NSH 由顶层 `nsh-targets` 选择桌面、移动、Web，三类均为 Mixed TSX UI + 共享 Rust core；九字段 profile 只在 DESKTOP 或 NSH 桌面存在。NSH 桌面固定多窗口，托盘、自启、单实例、深链接按选择生成，通知和 OS 全局快捷键不可用；TUI 子目标在当前固定运行时失败关闭。双语、三态主题、页面和品牌资源按实际目标装配。各平台依赖、能力及打包路径见 [GUI 工程索引](../GUI_ENGINEERING.md) 和 [设计标准](../design_standards/README.md)。
- 版本与候选：下游版本按周期和稳定 ID 管理，维护不升版；Harness 仅正式发布时取上海时间版本。双语日志保存最近十个真实发布版本、每类最多十条；候选只消费已发布源码，CLI 默认当前宿主，跨平台矩阵需明确请求。原子证据、当次 E2E/签名和真实最终产物验收见 [发布规则](../RELEASE.md) 与 [验证规则](../VERIFICATION.md)。
- 升级与知识：三方工程升级保护产品代码、身份、策略、记忆及本地决定；GPUI 知识资产条件传播，Kit API 知识与既有第三方本地资产的来源和许可可追溯；历史查询及本次记忆提炼不冒充真实产品验收。见 [升级 Skill](../../.agents/skills/desktop-upgrade-harness/SKILL.md) 与 [当前有效决定](../adr/20261107_ADR.md)。

## 2026-10-20 正式发布物化的既有变化

- `HARNESS-GPUI-ENGINEERING-KNOWLEDGE`（`required_version = 202610201054`）：保留旧快照已记录的 GPUI 依赖/兼容、性能与三平台打包知识分工及 Linux GNU 支持；实际入口见 [GUI 工程索引](../GUI_ENGINEERING.md)。2026-10-20 正式发布将既有变化绑定到该时间版本，未重写历史验证事实。

## 历史事件的版本绑定

以下仅承接机械门禁需要的稳定标识与原始最低版本，旧的被替代行为不因此恢复；其余原始标识均可在完整归档中检索。

- `HARNESS-FEAT-MANAGED-MULTI-REMOTE-PUBLISH`（`required_version = 202609141917`）：保留原事件的版本绑定；完整原文见归档，当前执行以本文件能力摘要及现行规范为准。
- `HARNESS-FEAT-OPTIONAL-REMOTE-GIT-RELEASE`（`required_version = 202609141917`）：保留原事件的版本绑定；完整原文见归档，当前执行以本文件能力摘要及现行规范为准。
- `HARNESS-CHANGE-MAINSTREAM-LTS-STANDARD-USER-ENVIRONMENT`（`required_version = 202609122231`）：保留原事件的版本绑定；完整原文见归档，当前执行以本文件能力摘要及现行规范为准。
- `HARNESS-FIX-HARNESS-SOURCE-GIT-ONLY-RELEASE`（`required_version = 202609122231`）：保留原事件的版本绑定；完整原文见归档，当前执行以本文件能力摘要及现行规范为准。
- `HARNESS-CHANGE-REMOVE-HISTORICAL-COMPATIBILITY`（`required_version = 202609111732`）：保留原事件的版本绑定；完整原文见归档，当前执行以本文件能力摘要及现行规范为准。
- `HARNESS-FEAT-OPTIONAL-USER-OWNED-TASKS`（`required_version = 202609102343`）：保留原事件的版本绑定；完整原文见归档，当前执行以本文件能力摘要及现行规范为准。
- `HARNESS-CHANGE-SIMPLE-GIT-LIFECYCLE`（`required_version = 202609101621`）：保留原事件的版本绑定；完整原文见归档，当前执行以本文件能力摘要及现行规范为准。
- `HARNESS-FIX-PROJECT-TASK-SEQUENCE-AUTO-INCREMENT`（`required_version = 202609101621`）：保留原事件的版本绑定；完整原文见归档，当前执行以本文件能力摘要及现行规范为准。
- `HARNESS-CHANGE-RELEASE-TIME-AND-REQUIREMENT-FIRST-VERSIONING`（`required_version = 202609281202`）：保留原事件的版本绑定；完整原文见归档，当前执行以本文件能力摘要及现行规范为准。

## 历史证据入口

- [历史“验证”原文](CHANGELOG_history.md#验证)：原测试命令、数量、宿主、跳过、失败及未执行范围原样保留；不因归档重跑或改写。
- [长期验证与人工复核](../VERIFICATION.md#证据分卷)：独立证据卷保持原路径与字节。
- 历史工程知识校正与记忆整理的结论保持原事件边界；本日实际检查在交付回复报告，不用旧证据证明当前平台、构建、签名或 E2E 已通过。
