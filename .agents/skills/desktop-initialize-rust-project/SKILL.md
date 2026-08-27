---
name: desktop-initialize-rust-project
description: 初始化一个中性的下游 Rust 项目并选择接口，随后永久删除仅用于初始化的能力，同时保留开发 Skills 和约束地图。
---

# 初始化 Rust 项目

创建可复用的共享核心，并且只创建用户选择的接口。CLI 是可选接口，但在用户未选择任何接口时，它是确定性的默认值。

## 工作流程

1. 读取存在时日期最新的产品状态，以及 `docs/AGENT_POLICY.md`、`docs/ENGINEERING_RULES.md`、`docs/RUST_CLI_TEMPLATE.md` 和 `docs/design_standards/README.md`。刚实例化的下游项目有意不包含产品规格、工作计划、ADR、变更记录或 `docs/VERIFICATION.md`；不得在中性初始化期间创建这些内容。只要求具备当前项目身份和 ASCII `snake_case` 标识；在执行 `$desktop-define-product` 前，产品事实必须保持未定义。
2. 将当前目录解析为唯一的下游项目根目录。如果当前目录是仅包含文档的 Harness 源项目，则必须停止、保留文件，并且绝不得创建替代项目目录。
3. 写入脚手架前必须要求 Git 可用。运行 `git --version`，随后判断 `git rev-parse --show-toplevel` 的规范化路径是否等于当前项目根目录。如果不相等，即使存在父级仓库，也必须在当前根目录运行 `git init --initial-branch=main .`。验证工作树内状态为 `true`、顶层目录等于当前项目根目录、初始分支为 `main`，并且 `git remote` 为空。不得创建脚手架前提交、标签、远端、推送、托管仓库、签名或全局 Git 配置。已经正确存在的独立仓库必须保持不变，直到最终干净状态验证。
4. 询问初始化需要哪些接口，只能从 `CLI`、`TUI`、`MCP` 和 `GUI` 中选择，并允许任意组合。如果用户没有作出选择，则记录 `CLI`。用户明确选择其他接口时，不得静默附加 CLI。
   - 只有选择包含 `GUI` 时，紧接着单独进行一轮 GUI 初始化配置询问。该轮必须逐项解析系统托盘、关于页、赞助页、单实例四项能力为 `enabled` 或 `disabled`，并向用户提供 `compact`（精简）与 `detailed`（详细）侧栏模式选择。四项能力不得根据 Harness 旧基线、推荐策略预设或未勾选状态静默推断；用户省略、留空或跳过侧栏选择时，未选择侧栏模式必须写入 `sidebar_mode = detailed`。用户明确选择 `compact` 或 `detailed` 时保持原值；显式非法值不得按未选择处理，必须重新确认。
   - 四项能力与归一化后的侧栏模式必须写入 `docs/GUI_APP_PROFILE.md` 的唯一 `gui-initialization-config` 围栏代码块，字段恰好为 `system_tray`、`about_page`、`sponsor_page`、`single_instance`、`sidebar_mode`，最终五项不得缺失或残留 `pending`。后续 GUI Skill、结构检查和 E2E 只复用该事实，不得重复询问、再次应用缺省值或擅自增减能力。
5. 直接调用本 Skill 且目标项目策略尚未解析时，先只让用户选择“推荐预设”或“自定义”。推荐预设须显式确认并展开为 `superpowers: disabled`、`parallel_worktree_subagents: enabled`、`milestone_smoke: enabled`、`milestone_e2e: disabled`；其中 Superpowers 默认关闭，只有自定义选择明确启用时才可使用，`milestone_e2e` 只作为以后构建询问时的建议默认值，绝不替代每次构建的当次选择。自定义只询问目标用户尚未明确提供的字段，每项至多一次。Harness 源字段值不是下游确认，不得据此跳过选择，也不得静默采用推荐值。全部四项、真实确认来源和日期收齐后，才以 `schema_version: 1` 和 `reuse_then_infer_then_ask` 一次原子写入，不新增预设字段且不遗留 `pending`。如果 `$desktop-instantiate-project` 已记录这些值，则只验证并复用，不再次询问。
6. 初始化是允许主动检查环境的唯一常规阶段。写入脚手架文件之前，使用已记录的接口选择调用一次 `$desktop-check-development-environment`：Rust 始终是必需项，Windows 仍需满足 Rust MSVC 前置条件，只有包含 `GUI` 的选择才增加阻断性的 Node.js 和 pnpm 门禁。记录当前宿主结果，并在任何必需工具受阻时停止；后续任务不得因新会话、显式构建或缺少环境证据重复执行本步骤，只能在真实命令已经出现受管环境错误后进入针对性恢复。
7. 使用中性资产创建根 Cargo 工作区和 `<project-id>_core`，不得引入业务假设。核心必须保持运行时中立，并且不得包含接口、进程、终端、协议、浏览器或桌面类型。Core-first 是永久硬规则：产品获批后，接口/宿主无关的领域类型、业务规则、语义校验、用例编排、状态转换和稳定错误都先在 core 中实现和测试，即使只选择一个适配器也同样适用。根 `[workspace.dependencies]` 必须始终是唯一依赖来源，成员清单必须使用 `workspace = true`；全部 registry 直接依赖使用完整三段 Cargo 兼容下界，禁止普通依赖的精确 `=`、通配符、tag、无下界范围或“最新”。根 `[workspace.package].version` 写为 `0.1.0` 后，立即调用 `$desktop-manage-version init --project-root .` 创建 `.harness/version-state.json`，并核对 Cargo 当前版本与状态目标一致；该文件是受保护的正式发布周期/去重状态，不是第二版本事实源。创建或更新项目根目录 `.gitignore`，使其恰好一次包含根锚定的 `/release/` 和 `/.release-clean.*` 条目；不得忽略根目录以外名称类似 release 的目录。
8. 将每个已记录接口分派给各自的 Skill：`$desktop-add-cli-adapter`、`$desktop-add-tui-adapter`、`$desktop-add-mcp-adapter` 或 `$desktop-add-gui-adapter`。每个已选 Skill 负责自己的薄适配器目录和测试，只拥有运行时装配、接口语法/协议结构、展示/纯交互状态、调用 core 和结果映射；单实例、系统托盘、窗口、终端恢复或 stdio 生命周期等机制留在所属适配器，但其业务动作仍调用 core。TUI 使用固定的 Ratatui + tui-realm + tui-realm-stdlib 技术栈；Tauri GUI 前端使用固定的 Vite + React + TypeScript + Mantine UI + `@tabler/icons-react` + TanStack Router 文件路由 + TanStack Query + Jotai，以及 ESLint/`typescript-eslint`、Prettier、Vitest 与 Testing Library 技术栈。自带的 `rust-lib-cli` 资产提供中性核心和可选的 CLI 实现；未选择 CLI 时不得复制其中的 CLI 成员。
   - 适配器只拒绝无法解析、缺少协议必填字段或违反宿主能力约束的输入；值域、跨字段关系、资源状态、业务权限、幂等性、可否执行以及影响业务结果的默认值由 core 判定并返回稳定领域错误。
   - 选择 `GUI` 时，在创建最终适配器图标前调用 `$desktop-prepare-gui-app-identity` 的初始化 Logo 模式：实际产出正好 3 个 1024×1024 PNG 候选并同时预览，等待用户明确选择，禁止静默默认或保留中性占位。选中候选固定写入 `<project-id>_gui/src-tauri/icons/app-icon-master.png`，逐字节复制到 `<project-id>_gui/public/app-identity/logo.png`，并由项目本地 Tauri `icon` 命令生成平台图标；`docs/GUI_APP_PROFILE.md` 记录三个候选与选择、路径和 SHA-256。该身份选择不推测产品业务，但缺少实际候选、用户选择或字节一致证据必须阻断初始化基线提交。
   - 选择 `GUI` 时，平台图标生成后还必须确认 `<project-id>_gui/src-tauri/icons/32x32.png` 是普通非符号链接、32×32 8-bit RGBA 非交错 PNG 且至少有一个非透明像素，并让 `tauri.conf.json` 的 `bundle.icon` 精确引用 `icons/32x32.png`。选择系统托盘时，该文件同时是托盘可见图标来源；格式不符或未引用都阻断初始化。
   - 选择 `GUI` 时，在删除本初始化 Skill 前，把 `.agents/skills/desktop-initialize-rust-project/assets/gui/macos-dmg-background.png` 逐字节复制为 `<project-id>_gui/src-tauri/dmg/background.png`。源文件和目标文件都必须是非符号链接的 660×400 PNG，复制后摘要必须一致；随后由 `$desktop-add-gui-adapter` 把 `tauri.conf.json` 的 `bundle.macOS.dmg.background` 固定引用为 `./dmg/background.png`，并使用与图片一致的 660×400 窗口、`appPosition: { x: 180, y: 220 }` 和 `applicationFolderPosition: { x: 480, y: 220 }`。该无产品身份的图片是可立即接线的中性初始化基线，不代表产品视觉已批准；首次真实 GUI 开发仍必须由 `$desktop-prepare-gui-app-identity` 预览后批准或在同一路径替换。
   - 选择 `GUI` 时，由 `$desktop-add-gui-adapter` 按 `docs/GUI_APP_PROFILE.md` 消费 `$desktop-prepare-gui-support-surfaces`。动态标题、设置页、i18n、三态主题和亮暗语义主题始终存在；关于页、赞助页及其路由/菜单/运行时资源只在对应能力为 `enabled` 时建立。底部支持项保持“已选赞助、设置、已选关于”的视觉顺序，未选页面不得留下空路由、占位入口或运行时媒体；关于页启用时保留本地更新日志与 `NotConfigured` 零出站，赞助页启用时才复制完整 `media/sponsor/*`。
   - 选择 GUI 时先按 `docs/design_standards/README.md` 解析设计标准；`docs/GUI_APP_PROFILE.md` 或当前请求中已批准的产品专属规则优先于 Harness 缺省。`compact` 精确命中 `tauri-gui-sidebar-compact-80-v1`：`80px` 栏宽、`6px` 内容内边距、`36px` Logo、`22px`/`1.75` 图标、`11px`/`1.25` 全宽居中名称、`56px` 菜单项、`4px` 图标名称间距和垂直 padding、`8px` 区间距；禁止固定 `em/ch` 名称盒和折叠按钮。`detailed` 精确命中 `tauri-gui-sidebar-detailed-v1`：默认 `248px` 展开、`72px` Logo、自身按钮收起为 `76px`/`44px` Logo、统一 `22px` 图标、icon-only + 右侧零延迟 Mantine `Tooltip` 与独立设备偏好。detailed AppShell 必须拥有折叠状态并同步 `navbar.width`/`data-navbar-width`，身份父级不得代理按钮。两种模式均保持 Logo→单 `v` 版本、完整可访问名称、功能区从顶部增长和已选支持页贴底。
   - compact 的实际 AppShell 必须保持 `mode="compact"`，使 `navbar.width` 直接引用精简栏宽常量、`AppShell.Navbar` padding 为 `0`；detailed 的实际 AppShell 必须保持 `mode="detailed"`，用 `readDetailedSidebarCollapsed()` 初始化并通过 `detailedSidebarNavbarWidth()` 同步 `navbar.width`/`data-navbar-width`，侧栏只从折叠 ActionIcon 调用 `onCollapsedChange`。中性功能菜单只包含使用 `IconHome` 和 i18n 文案的“首页”。侧栏 fixed/`100dvh`/右侧 `1px` 边框，功能区可滚动，底部支持区固定。模板可保留另一模式实现，但运行时不得偏离 profile。
   - 没有精确命中或用户要求像素/信息架构偏离时，必须在实现前取得明确批准并更新下游 `docs/GUI_APP_PROFILE.md` 与当日 ADR；尚无批准产品事实的中性初始化应停止偏离，不得自行发明新密度。
   - 仅当 `system_tray: enabled` 时启用 `tray-icon` feature、安装系统托盘并注册关闭隐藏：托盘菜单稳定 ID 恰好为 `show_window`/`quit`，可见标签由 `rust_i18n::t!("tray.show_window")` 与 `rust_i18n::t!("tray.quit")` 解析，中英文、英文回退和运行时刷新契约保持不变；托盘安装必须从 `.setup(...)` 可达并绑定必需图标/Menu/build，`CloseRequested` 从 `.on_window_event(...)` 可达并 `prevent_close()` 后隐藏。选择托盘时，当前宿主无法观察真实图标或生命周期必须阻断。`system_tray: disabled` 时不得启用 feature、创建托盘、调用 `prevent_close()` 或隐藏窗口；必须从 `.on_window_event(...)` 接线，在主窗口 `CloseRequested` 中显式调用 `AppHandle::exit(0)`，并以 `close_last_window_exits_application` 固定命名回归锁定。
   - 仅当 `single_instance: enabled` 时声明官方 `tauri-plugin-single-instance` 并作为首个 plugin 注册，保留两个固定命名回归和真实双启动唯一性验证；未选择时不得声明或注册该插件，也不得把多次启动静默改写为单实例。Linux Snap/Flatpak 的 DBus 权限只在选择单实例时适用。
   - 标题固定为 `{applicationName} v{version} {contactChannel}:{contactValue}`。`tauri.conf.json` 的 `app.windows` 主窗口使用 `width: 1440`、`height: 900`、`minWidth: 960`、`minHeight: 640`、`center: true`、`preventOverflow: true`，并与 660×400 DMG 窗口独立。设置页只含应用/版本、中英文与浅色/深色/跟随系统，不含隐私/统计；页面工作状态继续由应用根 Jotai store 仅在当前进程跨路由保留。初始化不得加入自动启动、真实 updater/统计 endpoint、远程请求或支付自动化，也不得预创建 `docs/GUI_SUPPORT_SURFACES.md`。
9. Product Spec 不存在或仍为 `Draft` 时，每个已选接口只能公开中性脚手架状态，其中包含 `productDefinitionRequired=true` 或接口等价的可见状态。不得虚构业务命令、工具、数据或副作用。GUI 标题、最终解析的侧栏、设置页及本轮明确选择的托盘/单实例/关于/赞助能力属于无业务副作用的初始化基线；未选能力不存在，关于页启用时的更新入口只显示未配置远端能力。产品获批后，业务 core 或适配器变化都直接实施；只有产品边界变化才更新 Product Spec。
10. 必须通过 Cargo 生成正常 `Cargo.lock`，并只运行初始化本身必需的非空测试。GUI 测试必须覆盖五项配置块无 `pending`、侧栏未选择时归一化为 `detailed`、显式非法侧栏值失败、两种侧栏模式、详细模式默认展开/身份父级无动作/按钮自身事件/AppShell 248→76 同步/持久恢复/折叠 Tooltip、精简模式持续名称，以及关于/赞助页面按选择出现或缺席。选择单实例时运行两个单实例回归；选择托盘时运行六个托盘生命周期/i18n 回归；未选择托盘时改为运行 `close_last_window_exits_application`。未选择的依赖、feature、路由、菜单和运行时媒体必须有拒绝回归。最低直接版本解析、锁文件与非 GUI 测试边界保持既有契约。
11. 使用实际结果更新保留事实，但不为中性初始化创建产品规格、计划、ADR、Changelog 或 Verification；不创建或更新 `docs/VERIFICATION.md`，也不自动创建 Work Plan、构建候选或完整验收记录。GUI 完成输出必须逐项报告四项能力和侧栏模式、侧栏来自用户选择还是 `detailed` 缺省、`docs/GUI_APP_PROFILE.md` 配置块、已选实现与未选能力缺席证据；托盘、关于、赞助和单实例的专属结果只在被选择时报告。
12. 选择 GUI 时，必须在非空测试通过后调用一次 `$desktop-test-gui-initialization-e2e`。结构检查器先读取配置块并条件验证：单实例启用时检查依赖/首插件/回调/两个回归，托盘启用时检查 feature、图标、运行时接线、六个回归和双语资源；托盘禁用时检查 feature/隐藏实现缺席、`CloseRequested → AppHandle::exit(0)` 实际接线及 `close_last_window_exits_application`。随后构建并启动真实本机调试二进制，始终验证所选侧栏模式、设置页和所有实际渲染菜单页面；仅对已选单实例执行双启动唯一性场景，仅对已选托盘执行关闭隐藏/恢复/退出与运行时 i18n 场景。未选托盘时必须真实关闭最后一个窗口并观察进程退出。关于/赞助菜单与页面必须分别按选择存在或缺席。任何已选能力无法观察或验证都阻断；未选能力不得被当作缺证据。

13. 只有全部脚手架检查完成后，才能收尾下游仓库：
    - 完整删除 `.agents/skills/desktop-instantiate-project/`、`.agents/skills/desktop-initialize-rust-project/` 和初始化专用的 `.agents/skills/desktop-test-gui-initialization-e2e/`；只有 GUI 初始化 E2E 已通过后才允许删除后者；
    - 删除模板专用的 `scripts/validate_harness.py`、`docs/HARNESS_ENGINEERING.md`、`docs/harness_engineering/`、初始化操作指南、初始化门禁描述、Harness 身份与历史，以及任何可以实例化或初始化另一个项目的入口；
    - 保留 `$desktop-rename-project-identity`、`$desktop-check-development-environment`、`$desktop-prepare-gui-app-identity`、`$desktop-upgrade-harness`、`$desktop-run-parallel-worktrees`、`$desktop-manage-version`，以及仍然适用的产品开发、适配器、验证和发布 Skills；必须保留 `$desktop-implement-change` 及其维护脚本和对应测试，但不得在日常开发中自动运行这些全仓门禁；版本 Skill 及其标准库 helper/测试必须完整保留，并把 `.harness/version-state.json` 列入约束地图的受保护状态；选择 GUI 时同时完整保留 `$desktop-prepare-gui-support-surfaces`（包括 `assets/brand-support/**`）、GUI 自有 TypeScript 注释门禁、其测试和 `$desktop-build-tauri-release`，未选择 GUI 时将全部 GUI 条件资产与 Skills 删除且不得要求 Node.js/pnpm；
    - 保留继承的两份非开源企业专有商业许可证文件 `LICENSE.zh-CN.md` 和 `LICENSE.en.md`，其中目标项目名称必须已由 `$desktop-rename-project-identity` 建立；如果任一文件缺失、仍包含旧 Harness 身份、在批准改名后发生其他修改，或被安排删除，则最终收尾必须失败；
    - 重写 `AGENTS.md`，同时保留非空的 `## Skills 地图` 和 `## 约束地图`。Skills 地图必须列出每个保留的 Skill，包括 `$desktop-run-parallel-worktrees` 和 `$desktop-upgrade-harness` 的持久策略用法。约束地图必须链接保留的规则并禁止下游继续派生；
    - 搜索下游根目录；如果历史证据之外仍存在对 `$desktop-instantiate-project`、`$desktop-initialize-rust-project`、其目录或仅用于初始化的门禁的活动引用，则最终收尾必须失败。
14. 裁剪完成后，如果本次运行由 `$desktop-instantiate-project` 发起，则确认 `docs/adr/`、`docs/changelog/`、`docs/product_spec/`、`docs/work_plan/`、`docs/VERIFICATION.md` 和 `docs/verification/` 仍然不存在。对于直接初始化的现有下游项目，必须保留已经存在的项目自有记忆与验证证据目录，绝不得为了满足此检查而删除它们。暂存完整的已初始化下游项目树，并使用用户现有 Git 身份创建恰好一个本地基线提交，提交消息必须为 `chore: initialize project`。如果作者身份不可用，必须停止并向用户请求；不得伪造身份或修改全局 Git 配置。
15. 创建基线提交之前，必须确认四项策略字段和确认元数据均不包含 `pending`。如果具备精确的源溯源和渲染后的保留工程层候选，则通过 `$desktop-upgrade-harness record --bootstrap` 建立 `.harness/upstream-lock.json`；否则必须记录首次升级所需的初始基线审计，不得虚构锁文件。验证已完成仓库的规范顶层目录、`main`、可解析的基线提交、无远端，以及空的 `git status --porcelain=v1 --untracked-files=all`。任何失败都必须阻断完成。
16. 下一步必须转到 `$desktop-define-product`。生成的下游项目是终端项目根目录，而不是另一个 Harness；绝不得根据脚手架声称产品已经交付。

## 架构不变量

- 当前项目根目录必须同时是唯一的下游根目录及其独立 Git 顶层目录；父级仓库绝不能替代它。
- 根 `Cargo.toml` 管理共享核心，并且只管理用户实际选择的适配器成员。
- Rust 与前端清单声明经过最低直接版本和项目最低工具链测试的兼容下界；`Cargo.lock`/`pnpm-lock.yaml` 只固定正常解析结果，普通依赖不得精确锁死或使用 `latest`、tag、通配符。
- 确定性目录为 `<project-id>_core`、`_cli`、`_tui`、`_mcp` 和 `_gui`。
- 每个适配器必须直接依赖核心，并且绝不得解析、启动、嵌入或要求另一个适配器。
- Core-first 按职责而非代码行数判断：领域规则、语义校验、业务默认值、用例编排、状态转换和稳定错误属于 core；适配器只拥有协议/展示/交互/宿主机制和映射。当前只有一个适配器不是例外，偏离只能按硬规则例外 ADR 处理。
- Rust 代码超过 400 行建议重构、超过 800 行强制拆分；前端代码超过 500 行建议重构、超过 1000 行强制拆分；其他人工或 Agent 维护文本继续使用 500 行复核与 2000 行硬上限。建议区间必须复核高内聚、职责单一和职责相近性；硬上限独立于 core-first 语义判断，不能以 ADR、职责集中或测试夹具为由放宽。Rust 多文件模块使用 `<module>/mod.rs` 目录结构，不得以同级文件加同名目录或空壳转发规避；前端按功能职责拆分且不强制 `index.ts` 桶文件。
- 适配器只拒绝无法解析、缺少协议必填字段或违反宿主能力约束的输入；值域、跨字段关系、资源状态、业务权限、幂等性、可否执行以及影响业务结果的默认值由 core 判定并返回稳定领域错误。
- 每个适配器公开真实操作时必须记录“适配器操作 → core API → core 测试”；单实例、系统托盘等 adapter-only 机制必须记录其接口/宿主专属性，并把业务效果委托 core。中性单实例回调只恢复窗口，不产生业务效果。
- CLI、TUI 和 MCP 适配器默认使用 Tokio current-thread 异步入口；GUI 复用 Tauri 由 Tokio 支撑的异步运行时。所有 Rust 适配器工作优先采用异步 I/O 和等待。只有经过测量的 CPU 密集工作才可以进入有边界的线程边界；仅提供阻塞接口的依赖必须被替换，或通过范围与硬规则例外流程获得批准。除非已批准的领域需求另有要求，核心必须保持运行时中立。
- 已选 TUI 或 GUI 适配器即使处于 `Draft` 状态也必须应用固定技术栈；替换技术栈需要记录硬规则例外。
- 选择 GUI 时，初始化基线提交必须包含 `<project-id>_gui/src-tauri/dmg/background.png` 及引用它的 Tauri DMG 配置；初始化源 Skill 删除后不得留下对源资产路径的运行时依赖。
- 选择 GUI 时，初始化基线提交必须包含用户从正好三个候选中选择的 1024×1024 Logo 母版、逐字节一致的 `/app-identity/logo.png` 和真实平台图标；不得保留中性占位图或未选择状态。
- 选择 GUI 时，所有菜单、操作、状态和图表周边图标统一使用直接依赖 `@tabler/icons-react` 的命名组件；存在适用图标时不得改用其他图标库、内联 SVG、字符或 emoji。图表绘制能力不由图标库替代。
- 选择 GUI 时，初始化裁剪和基线提交前必须通过配置感知的结构检查与真实本机调试 E2E。最终五项配置必须明确，其中侧栏可来自用户选择或 `detailed` 缺省；已选单实例/托盘能力按完整契约验证，未选托盘必须验证关闭最后窗口退出，关于/赞助与侧栏模式必须与配置一致。该门禁独立于 `milestone_e2e`，不构成最终候选验收；只有已选能力无法观察或判定时才阻断。
- 选择 GUI 时，初始化基线始终包含动态标题、设置页、i18n、主题、Logo→版本与最终侧栏模式。`compact` 按 `tauri-gui-sidebar-compact-80-v1` 建立 `80px` 全宽居中竖排菜单且不折叠；`detailed` 是侧栏未选择时的缺省值，并默认 `248px` 展开、`76px` 收起，按钮状态设备级持久化，收起时 Tooltip 显示名称。单实例、托盘、关于页、赞助页及 sponsor 运行时媒体只在配置启用时存在；未选能力不得留下依赖、feature、路由、入口、关闭拦截或运行时媒体。这些 adapter-only 展示/生命周期机制不得写入 core。
- Rust 能力按 `docs/RUST_CLI_TEMPLATE.md` 的事实标准选择：Tokio、Axum + Tower/Tower HTTP、Clap、SeaORM、config-rs、tracing + tracing-subscriber + tracing-appender、anyhow、thiserror、serde、jiff；OpenTelemetry 与协议/存储/认证候选只在对应能力获批后采用。只把当前已选接口或已批准真实能力需要的依赖加入根 `[workspace.dependencies]`；不得为中性状态预装未使用的 HTTP、ORM、配置、错误或可观测性依赖，偏离固定技术必须记录硬规则例外。
- 只有选择 CLI 时，CLI 才遵守 `docs/CLI_CONTRACT.md`。
- `docs/AGENT_POLICY.md` 持久记录四项项目选择；后续 Agent 必须复用这些选择、推断适用性，并且只在问题未解决时询问。
- 产品规格、工作计划、ADR 和变更记录属于下游开发记忆，不属于初始化载荷。
- 完成收尾的下游项目不能从自身实例化或初始化另一个项目。
- 完成收尾的下游项目必须保留继承的两份专有商业许可证文件，并继续受其中终端下游限制约束。
- `AGENTS.md` 必须始终保留非空的 Skills 地图和约束地图；裁剪可以移除地图条目，但不得删除任一地图。
- 初始化只有在独立仓库中创建一个真实本地基线提交，并且 Git porcelain 状态为空时才算完成。
- 项目根目录 `.gitignore` 必须恰好一次包含 `/release/` 和 `/.release-clean.*`；构建流水线负责原子刷新的当前结果目录，以及同根目录中断后遗留的清理或候选暂存目录。

## 完成要求

版本部分必须报告根 Cargo 初始版本与 `.harness/version-state.json` 一致、`$desktop-manage-version` 已保留且状态已列入约束地图。

报告 Git 边界、基线和干净状态、环境门禁、已选接口、全部四项策略值、已创建成员、本次必要测试、已删除初始化路径、保留 Skills/约束地图、未验证平台及 `productDefinitionRequired=true`。选择 GUI 时还报告三个 Logo 候选、图标与 DMG 证据、五项 GUI 初始化配置、侧栏模式及持久折叠测试、设置页与主题；对系统托盘、关于页、赞助页、单实例分别报告 `enabled`/`disabled`，启用项报告完整实现/E2E 证据，禁用项报告依赖/feature/路由/入口/媒体缺席和关闭最后窗口退出等对应证据。
