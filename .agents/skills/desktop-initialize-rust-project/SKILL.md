---
name: desktop-initialize-rust-project
description: 初始化一个中性的下游 Rust 项目并选择接口，随后永久删除仅用于初始化的能力，同时保留开发 Skills 和约束地图。
---

# 初始化 Rust 项目

创建可复用的共享核心，并且只创建用户选择的接口。CLI 是可选接口，但在用户未选择任何接口时，它是确定性的默认值。

## 工作流程

1. 读取存在时日期最新的产品状态，以及 `docs/AGENT_POLICY.md`、`docs/ENGINEERING_RULES.md` 和 `docs/RUST_CLI_TEMPLATE.md`。刚实例化的下游项目有意不包含产品规格、工作计划、ADR、变更记录或 `docs/VERIFICATION.md`；不得在中性初始化期间创建这些内容。只要求具备当前项目身份和 ASCII `snake_case` 标识；在执行 `$desktop-define-product` 前，产品事实必须保持未定义。
2. 将当前目录解析为唯一的下游项目根目录。如果当前目录是仅包含文档的 Harness 源项目，则必须停止、保留文件，并且绝不得创建替代项目目录。
3. 写入脚手架前必须要求 Git 可用。运行 `git --version`，随后判断 `git rev-parse --show-toplevel` 的规范化路径是否等于当前项目根目录。如果不相等，即使存在父级仓库，也必须在当前根目录运行 `git init --initial-branch=main .`。验证工作树内状态为 `true`、顶层目录等于当前项目根目录、初始分支为 `main`，并且 `git remote` 为空。不得创建脚手架前提交、标签、远端、推送、托管仓库、签名或全局 Git 配置。已经正确存在的独立仓库必须保持不变，直到最终干净状态验证。
4. 询问初始化需要哪些接口，只能从 `CLI`、`TUI`、`MCP` 和 `GUI` 中选择，并允许任意组合。如果用户没有作出选择，则记录 `CLI`。用户明确选择其他接口时，不得静默附加 CLI。
5. 直接调用本 Skill 且目标项目策略尚未解析时，先只让用户选择“推荐预设”或“自定义”。推荐预设须显式确认并展开为 `superpowers: disabled`、`parallel_worktree_subagents: enabled`、`milestone_smoke: enabled`、`milestone_e2e: disabled`；其中 Superpowers 默认关闭，只有自定义选择明确启用时才可使用，`milestone_e2e` 只作为以后构建询问时的建议默认值，绝不替代每次构建的当次选择。自定义只询问目标用户尚未明确提供的字段，每项至多一次。Harness 源字段值不是下游确认，不得据此跳过选择，也不得静默采用推荐值。全部四项、真实确认来源和日期收齐后，才以 `schema_version: 1` 和 `reuse_then_infer_then_ask` 一次原子写入，不新增预设字段且不遗留 `pending`。如果 `$desktop-instantiate-project` 已记录这些值，则只验证并复用，不再次询问。
6. 初始化是允许主动检查环境的唯一常规阶段。写入脚手架文件之前，使用已记录的接口选择调用一次 `$desktop-check-development-environment`：Rust 始终是必需项，Windows 仍需满足 Rust MSVC 前置条件，只有包含 `GUI` 的选择才增加阻断性的 Node.js 和 pnpm 门禁。记录当前宿主结果，并在任何必需工具受阻时停止；后续任务不得因新会话、显式构建或缺少环境证据重复执行本步骤，只能在真实命令已经出现受管环境错误后进入针对性恢复。
7. 使用中性资产创建根 Cargo 工作区和 `<project-id>_core`，不得引入业务假设。核心必须保持运行时中立，并且不得包含接口、进程、终端、协议、浏览器或桌面类型。Core-first 是永久硬规则：产品获批后，接口/宿主无关的领域类型、业务规则、语义校验、用例编排、状态转换和稳定错误都先在 core 中实现和测试，即使只选择一个适配器也同样适用。根 `[workspace.dependencies]` 必须始终是唯一依赖来源，成员清单必须使用 `workspace = true`；全部 registry 直接依赖使用完整三段 Cargo 兼容下界，禁止普通依赖的精确 `=`、通配符、tag、无下界范围或“最新”。根 `[workspace.package].version` 写为 `0.1.0` 后，立即调用 `$desktop-manage-version init --project-root .` 创建 `.harness/version-state.json`，并核对 Cargo 当前版本与状态目标一致；该文件是受保护的正式发布周期/去重状态，不是第二版本事实源。创建或更新项目根目录 `.gitignore`，使其恰好一次包含根锚定的 `/release/` 和 `/.release-clean.*` 条目；不得忽略根目录以外名称类似 release 的目录。
8. 将每个已记录接口分派给各自的 Skill：`$desktop-add-cli-adapter`、`$desktop-add-tui-adapter`、`$desktop-add-mcp-adapter` 或 `$desktop-add-gui-adapter`。每个已选 Skill 负责自己的薄适配器目录和测试，只拥有运行时装配、接口语法/协议结构、展示/纯交互状态、调用 core 和结果映射；单实例、系统托盘、窗口、终端恢复或 stdio 生命周期等机制留在所属适配器，但其业务动作仍调用 core。TUI 使用固定的 Ratatui + tui-realm + tui-realm-stdlib 技术栈；Tauri GUI 前端使用固定的 Vite + React + TypeScript + Mantine UI + `@tabler/icons-react` + TanStack Router 文件路由 + TanStack Query + Jotai，以及 ESLint/`typescript-eslint`、Prettier、Vitest 与 Testing Library 技术栈。自带的 `rust-lib-cli` 资产提供中性核心和可选的 CLI 实现；未选择 CLI 时不得复制其中的 CLI 成员。
   - 适配器只拒绝无法解析、缺少协议必填字段或违反宿主能力约束的输入；值域、跨字段关系、资源状态、业务权限、幂等性、可否执行以及影响业务结果的默认值由 core 判定并返回稳定领域错误。
   - 选择 `GUI` 时，在创建最终适配器图标前调用 `$desktop-prepare-gui-app-identity` 的初始化 Logo 模式：实际产出正好 3 个 1024×1024 PNG 候选并同时预览，等待用户明确选择，禁止静默默认或保留中性占位。选中候选固定写入 `<project-id>_gui/src-tauri/icons/app-icon-master.png`，逐字节复制到 `<project-id>_gui/public/app-identity/logo.png`，并由项目本地 Tauri `icon` 命令生成平台图标；`docs/GUI_APP_PROFILE.md` 记录三个候选与选择、路径和 SHA-256。该身份选择不推测产品业务，但缺少实际候选、用户选择或字节一致证据必须阻断初始化基线提交。
   - 选择 `GUI` 时，平台图标生成后还必须确认 `<project-id>_gui/src-tauri/icons/32x32.png` 是普通非符号链接、32×32 8-bit RGBA 非交错 PNG 且至少有一个非透明像素，并让 `tauri.conf.json` 的 `bundle.icon` 精确引用 `icons/32x32.png`。该文件是固定托盘的可见图标来源；缺失、全透明、格式不符或未引用都阻断初始化，不得继续创建空白托盘。
   - 选择 `GUI` 时，在删除本初始化 Skill 前，把 `.agents/skills/desktop-initialize-rust-project/assets/gui/macos-dmg-background.png` 逐字节复制为 `<project-id>_gui/src-tauri/dmg/background.png`。源文件和目标文件都必须是非符号链接的 660×400 PNG，复制后摘要必须一致；随后由 `$desktop-add-gui-adapter` 把 `tauri.conf.json` 的 `bundle.macOS.dmg.background` 固定引用为 `./dmg/background.png`，并使用与图片一致的 660×400 窗口、`appPosition: { x: 180, y: 220 }` 和 `applicationFolderPosition: { x: 480, y: 220 }`。该无产品身份的图片是可立即接线的中性初始化基线，不代表产品视觉已批准；首次真实 GUI 开发仍必须由 `$desktop-prepare-gui-app-identity` 预览后批准或在同一路径替换。
   - 选择 `GUI` 时，由 `$desktop-add-gui-adapter` 自动消费 `$desktop-prepare-gui-support-surfaces` 的固定本地基线。系统托盘是不可省略的初始化完成条件：根 Tauri 依赖必须启用 `tray-icon` feature，真实 Rust 源码必须创建使用应用图标的托盘，菜单稳定 ID 恰好为 `show_window` 和 `quit`，可见标签分别通过 `rust_i18n::t!("tray.show_window")` 与 `rust_i18n::t!("tray.quit")` 按当前规范化 locale 解析；中文精确为“显示窗口/退出”，英文精确为“Show Window/Quit”，未知 locale 回退英文，设置页运行时切换语言必须无需重启地刷新托盘，任何 `tray.*` 原始键不可见。主鼠标左键释放或 `show_window` 必须执行 `show`、取消最小化并聚焦，主窗口关闭只 `prevent_close()` 后隐藏且进程继续，只有 `quit` 显式退出。不得因 Product Spec 为 Draft、宿主托盘难以观察、页面简单或实现偏好省略/降级，当前宿主无法验证真实托盘时必须阻断基线提交。标题固定为 `{applicationName} {version} {contactChannel}:{contactValue}`。`tauri.conf.json` 的 `app.windows` 主窗口使用逻辑像素 `width: 1440`、`height: 900`、`minWidth: 960`、`minHeight: 640`、`center: true`、`preventOverflow: true`，确保默认尺寸能同时容纳固定 `136px` 侧栏和赞助页三张档位卡片；这与 660×400 的 DMG 安装卷窗口是两个独立配置。前端左侧菜单固定为 `136px` 单态且不得建立展开/折叠状态或开关，顶部始终显示 `56px` 的 `/app-identity/logo.png`，其下紧接权威当前版本。每个功能项和赞助/设置/关于固定项必须提供 `30px` 图标；图标在上、名称在下，名称使用 `11px` 字号、`10em` 行内宽度、水平居中和最多两行，并保留完整可访问名称，不得使用 Tooltip-only 名称。产品功能项从顶部向下增长，底部固定项按视觉顺序为赞助、设置、关于。直接建立 `/settings`、`/about`、`/sponsor`；Mantine 根以 `defaultColorScheme="auto"` 和显式 local-storage manager 同时打包亮色/暗色主题，分别定义页面背景、surface、主/次文字、边框与强调色。设置页只提供应用/版本、中英文和浅色/深色/跟随系统，不得包含隐私标题、统计同意、未配置占位或对应固定翻译键；主题偏好持久化在 GUI 设备级本地存储。关于页提供手动检查更新，未配置时更新显示 `NotConfigured`、按钮禁用并保持零出站。关于页还显示作者、作者联系方式和三段免责声明；赞助页使用已解析的当前主题选择叠层、surface 和对比色，复制完整 `media/sponsor/*` 并显示固定品牌内容。初始化不得加入自动启动、真实 updater/统计 endpoint、远程请求或支付自动化，也不得预创建 `docs/GUI_SUPPORT_SURFACES.md`；产品明确启用统计后才可另建产品级同意界面。
   - 选择 `GUI` 时，托盘安装函数必须由 Tauri Builder `.setup(...)` 实际调用，在同一实现中创建双项 `Menu` 并以 `.menu(&menu)` 绑定，把 `default_window_icon()` 当作必需值，随后 `.icon(...)` 且成功 `.build(app)`；图标缺失必须让初始化失败，禁止继续创建无图标托盘。主窗口 `CloseRequested` 处理还必须由 `.on_window_event(...)` 实际注册。该菜单绑定同时满足 Tauri 官方说明的 Linux 图标可见性要求，未调用的示例函数、只创建菜单项或只注册菜单事件都不算已安装托盘。
   - 选择 `GUI` 时，官方 `tauri-plugin-single-instance` 是与托盘同级的不可省略初始化条件：根 `[workspace.dependencies]` 声明其最低兼容稳定范围，GUI member 只以 `workspace = true` 继承，并把它作为 Tauri Builder 的首个 plugin 注册。同一用户会话再次启动相同应用身份时，第二进程必须在通知后退出，只复用 `restore_main_window` 恢复、取消最小化并聚焦既有 `main` 窗口，不得形成第二个长期应用主进程或主窗口。中性回调忽略且不记录第二次启动参数/工作目录，不触发业务；未来文件关联或深链必须另行批准并由 core 判定。Linux Snap/Flatpak 还要在对应渠道清单声明会话 DBus own/talk 权限并以真实沙箱候选验证。
9. Product Spec 不存在或仍为 `Draft` 时，每个已选接口只能公开中性脚手架状态，其中包含 `productDefinitionRequired=true` 或接口等价的可见状态。不得虚构业务命令、工具、数据或副作用。GUI 固定托盘/关闭隐藏、标题、侧栏、精简设置/关于/赞助页属于无业务副作用的初始化界面基线；关于页更新入口只显示未配置远端能力，不构成更新已可用，更不构成产品业务屏幕或交付证据。产品获批后，业务 core 或适配器变化都直接实施；首次建立公开业务命令、工具、页面或协议时，只有产品边界因此变化才更新 Product Spec，不自动创建 Work Plan、构建候选或完整验收记录。
10. 必须通过 Cargo 生成正常 `Cargo.lock`，并只运行初始化本身必需的非空测试：核心中性状态、每个已选适配器的可观察状态，以及对未批准业务行为的拒绝。对这组测试，还要在临时副本以 `direct-minimal-versions` 解析全部直接下界，并使用根 `rust-version` 声明的最低工具链运行；最低解析结果不得覆盖提交的正常锁文件。GUI 还必须以临时 `resolutionMode: lowest-direct` 和清单声明的最低 Node.js/pnpm 环境运行相关前端测试，正常 `pnpm-lock.yaml` 仍固定日常实际解析结果。GUI Rust 回归必须包含固定命名的 `single_instance_plugin_is_registered_first`、`second_launch_restores_existing_main_window`、`tray_show_restores_and_focuses_main_window`、`close_request_hides_without_exit`、`tray_quit_exits_application`、`tray_labels_resolve_for_supported_locales`、`tray_labels_fall_back_to_english`、`language_change_updates_tray_menu_labels`，并覆盖三候选选择事实与选中路径；前端回归同时覆盖侧栏 `136px` 单态、`56px` Logo 位于版本上方、`30px` Tabler 图标、图标上/`11px` `10em` 文字下且居中、无折叠状态/开关/Tooltip-only 名称、默认设置页无隐私/统计控件和翻译键、主窗口 1440×900/最小尺寸配置，以及赞助页在亮色和暗色方案下消费不同主题值。非 GUI 中性初始化不自动追加格式、lint、静态、全仓门禁、独立构建、冒烟或 E2E；GUI 初始化按下一条固定门禁执行一次单实例/托盘结构检查与本机 E2E。若用户另行显式请求发布构建，交给对应构建 Skill，由构建流程确认自己的最终候选 E2E 选择并全量运行单元测试。
11. 使用实际结果更新保留的产品状态、接口、策略和真实技术债；环境、测试、构建、Git 边界与未测试系统只汇总到本次完成输出，不创建或更新 `docs/VERIFICATION.md`。不得为中性初始化创建产品规格、工作计划、ADR 或变更记录，并明确脚手架不是可验收产品候选。如果选择 GUI，必须报告三个 Logo 候选、用户选择、母版/运行时 Logo/平台图标路径与摘要，已创建的 `<project-id>_gui/src-tauri/dmg/background.png`、尺寸、摘要和 Tauri 配置引用，以及它仍待完整身份模式批准或替换；同时报告主窗口与 DMG 窗口的独立尺寸、侧栏 `136px` 单态、Logo→版本顺序、`56px` Logo、`30px` 菜单图标、图标上/`11px` `10em` 文字下且居中、应用级亮色/暗色语义和主题三态、亮色/暗色赞助页、托盘中英文/英文回退/运行时刷新、关闭隐藏、动态标题、功能区和固定底部顺序、设置/关于/赞助路由、默认设置页无隐私/统计区块、关于页 `NotConfigured` 零出站、作者/联系人/免责声明和默认 sponsor 媒体。完整品牌源资产与更新/统计契约随 `$desktop-prepare-gui-support-surfaces` 保留；初始化不得预创建 `docs/GUI_SUPPORT_SURFACES.md`，也不得启用任何远程能力。
选择 GUI 时，必须在上述非空测试通过后、裁剪初始化能力和创建基线提交前调用一次 `$desktop-test-gui-initialization-e2e`。该固定门禁不读取或询问 `milestone_e2e`：它先运行 `verify-gui-lifecycle-contract.mjs` 对单实例依赖/首插件/回调、`tray-icon`、真实托盘源码、稳定 ID、`rust-i18n` 双语资源和八个有断言的命名回归失败关闭，再运行 `pnpm tauri build --debug --no-bundle` 并双启动本次生成的真实本机调试二进制。第二次启动必须自行退出，既有主进程与同一主窗口继续存在，窗口恢复、取消最小化并聚焦，宿主枚举只剩一个长期应用主进程和一个主窗口。Computer Use 还要验证可见主窗口、固定 `136px` 单态侧栏的 Logo/图标/文字尺寸与居中、默认设置页无隐私/统计区块、所有渲染菜单链接页面可达，并定位真实系统托盘，依次实测中文“显示窗口/退出”和英文“Show Window/Quit”可在不重启应用时刷新且无 `tray.*` 原始键，再验证原生关闭只隐藏且进程继续、托盘左键和本地化显示项均恢复并聚焦、本地化退出项结束进程并移除图标。失败、超时、取消、唯一性无法判定、无法观察或无法运行都阻断初始化；它不生成安装包、发布候选或 Verification 证据。最终回复必须报告宿主、结构检查结果、调试二进制路径、两次启动/PID/回收结果、单一主进程/同一主窗口证据、托盘双语刷新及完整生命周期结果、固定侧栏结果、设置页结果、逐菜单页面结果、截图和未验证平台。

结构检查器必须在构建前额外验证上述 32px 图标格式/非透明像素/配置引用，以及 `.setup`、Menu、icon、`.build(app)` 和 `.on_window_event` 的运行时接线；Computer Use 必须证明状态栏/通知区域出现可见非空图形，不能把空白点击区域、可打开菜单但无图形或未接线死代码判为通过。最终回复同时报告 32px 图标与真实托盘可见图形证据。

12. 只有全部脚手架检查完成后，才能收尾下游仓库：
    - 完整删除 `.agents/skills/desktop-instantiate-project/`、`.agents/skills/desktop-initialize-rust-project/` 和初始化专用的 `.agents/skills/desktop-test-gui-initialization-e2e/`；只有 GUI 初始化 E2E 已通过后才允许删除后者；
    - 删除模板专用的 `scripts/validate_harness.py`、`docs/HARNESS_ENGINEERING.md`、`docs/harness_engineering/`、初始化操作指南、初始化门禁描述、Harness 身份与历史，以及任何可以实例化或初始化另一个项目的入口；
    - 保留 `$desktop-rename-project-identity`、`$desktop-check-development-environment`、`$desktop-prepare-gui-app-identity`、`$desktop-upgrade-harness`、`$desktop-run-parallel-worktrees`、`$desktop-manage-version`，以及仍然适用的产品开发、适配器、验证和发布 Skills；必须保留 `$desktop-implement-change` 及其维护脚本和对应测试，但不得在日常开发中自动运行这些全仓门禁；版本 Skill 及其标准库 helper/测试必须完整保留，并把 `.harness/version-state.json` 列入约束地图的受保护状态；选择 GUI 时同时完整保留 `$desktop-prepare-gui-support-surfaces`（包括 `assets/brand-support/**`）、GUI 自有 TypeScript 注释门禁、其测试和 `$desktop-build-tauri-release`，未选择 GUI 时将全部 GUI 条件资产与 Skills 删除且不得要求 Node.js/pnpm；
    - 保留继承的两份非开源企业专有商业许可证文件 `LICENSE.zh-CN.md` 和 `LICENSE.en.md`，其中目标项目名称必须已由 `$desktop-rename-project-identity` 建立；如果任一文件缺失、仍包含旧 Harness 身份、在批准改名后发生其他修改，或被安排删除，则最终收尾必须失败；
    - 重写 `AGENTS.md`，同时保留非空的 `## Skills 地图` 和 `## 约束地图`。Skills 地图必须列出每个保留的 Skill，包括 `$desktop-run-parallel-worktrees` 和 `$desktop-upgrade-harness` 的持久策略用法。约束地图必须链接保留的规则并禁止下游继续派生；
    - 搜索下游根目录；如果历史证据之外仍存在对 `$desktop-instantiate-project`、`$desktop-initialize-rust-project`、其目录或仅用于初始化的门禁的活动引用，则最终收尾必须失败。
13. 裁剪完成后，如果本次运行由 `$desktop-instantiate-project` 发起，则确认 `docs/adr/`、`docs/changelog/`、`docs/product_spec/`、`docs/work_plan/`、`docs/VERIFICATION.md` 和 `docs/verification/` 仍然不存在。对于直接初始化的现有下游项目，必须保留已经存在的项目自有记忆与验证证据目录，绝不得为了满足此检查而删除它们。暂存完整的已初始化下游项目树，并使用用户现有 Git 身份创建恰好一个本地基线提交，提交消息必须为 `chore: initialize project`。如果作者身份不可用，必须停止并向用户请求；不得伪造身份或修改全局 Git 配置。
14. 创建基线提交之前，必须确认四项策略字段和确认元数据均不包含 `pending`。如果具备精确的源溯源和渲染后的保留工程层候选，则通过 `$desktop-upgrade-harness record --bootstrap` 建立 `.harness/upstream-lock.json`；否则必须记录首次升级所需的初始基线审计，不得虚构锁文件。验证已完成仓库的规范顶层目录、`main`、可解析的基线提交、无远端，以及空的 `git status --porcelain=v1 --untracked-files=all`。任何失败都必须阻断完成。
15. 下一步必须转到 `$desktop-define-product`。生成的下游项目是终端项目根目录，而不是另一个 Harness；绝不得根据脚手架声称产品已经交付。

## 架构不变量

- 当前项目根目录必须同时是唯一的下游根目录及其独立 Git 顶层目录；父级仓库绝不能替代它。
- 根 `Cargo.toml` 管理共享核心，并且只管理用户实际选择的适配器成员。
- Rust 与前端清单声明经过最低直接版本和项目最低工具链测试的兼容下界；`Cargo.lock`/`pnpm-lock.yaml` 只固定正常解析结果，普通依赖不得精确锁死或使用 `latest`、tag、通配符。
- 确定性目录为 `<project-id>_core`、`_cli`、`_tui`、`_mcp` 和 `_gui`。
- 每个适配器必须直接依赖核心，并且绝不得解析、启动、嵌入或要求另一个适配器。
- Core-first 按职责而非代码行数判断：领域规则、语义校验、业务默认值、用例编排、状态转换和稳定错误属于 core；适配器只拥有协议/展示/交互/宿主机制和映射。当前只有一个适配器不是例外，偏离只能按硬规则例外 ADR 处理。
- 所有人工或 Agent 维护的文本文件超过 500 行时必须复核高内聚、职责单一和职责相近性，不满足就拆分；超过 2000 行是独立于 core-first 语义判断的失败门禁，不能以 ADR、职责集中或测试夹具为由放宽。Rust 模块拆分使用目录/`mod.rs` 结构。
- 适配器只拒绝无法解析、缺少协议必填字段或违反宿主能力约束的输入；值域、跨字段关系、资源状态、业务权限、幂等性、可否执行以及影响业务结果的默认值由 core 判定并返回稳定领域错误。
- 每个适配器公开真实操作时必须记录“适配器操作 → core API → core 测试”；单实例、系统托盘等 adapter-only 机制必须记录其接口/宿主专属性，并把业务效果委托 core。中性单实例回调只恢复窗口，不产生业务效果。
- CLI、TUI 和 MCP 适配器默认使用 Tokio current-thread 异步入口；GUI 复用 Tauri 由 Tokio 支撑的异步运行时。所有 Rust 适配器工作优先采用异步 I/O 和等待。只有经过测量的 CPU 密集工作才可以进入有边界的线程边界；仅提供阻塞接口的依赖必须被替换，或通过范围与硬规则例外流程获得批准。除非已批准的领域需求另有要求，核心必须保持运行时中立。
- 已选 TUI 或 GUI 适配器即使处于 `Draft` 状态也必须应用固定技术栈；替换技术栈需要记录硬规则例外。
- 选择 GUI 时，初始化基线提交必须包含 `<project-id>_gui/src-tauri/dmg/background.png` 及引用它的 Tauri DMG 配置；初始化源 Skill 删除后不得留下对源资产路径的运行时依赖。
- 选择 GUI 时，初始化基线提交必须包含用户从正好三个候选中选择的 1024×1024 Logo 母版、逐字节一致的 `/app-identity/logo.png` 和真实平台图标；不得保留中性占位图或未选择状态。
- 选择 GUI 时，所有菜单、操作、状态和图表周边图标统一使用直接依赖 `@tabler/icons-react` 的命名组件；存在适用图标时不得改用其他图标库、内联 SVG、字符或 emoji。图表绘制能力不由图标库替代。
- 选择 GUI 时，初始化裁剪和基线提交前必须同时通过单实例/托盘结构检查与当前宿主真实本机调试二进制 E2E，证明应用可构建、第二次启动只唤醒既有窗口后退出、只剩一个长期应用主进程和同一主窗口、真实系统托盘及中英文精确双项菜单存在且可运行时刷新、关闭隐藏/两种恢复/退出生命周期可操作、固定单态侧栏的 Logo/图标/文字尺寸和居中正确、默认设置页无隐私/统计区块、所有渲染菜单页面可达。该门禁独立于 `milestone_e2e`，不构成最终候选验收；宿主无法判定单实例唯一性或观察/操作托盘同样阻断，不得静默降级。
- 选择 GUI 时，初始化基线提交必须包含首插件 `tauri-plugin-single-instance`、第二次启动只唤醒既有窗口的回调、`tray-icon`、稳定 ID 恰好为 `show_window`/`quit` 且可见标签由 `rust-i18n` 运行时解析和刷新的托盘、关闭隐藏生命周期、八个固定命名单实例/托盘生命周期与 i18n 回归、动态标题、`136px` 单态固定侧栏、顶部 `56px` Logo→当前版本顺序、顶部功能区、底部赞助/设置/关于、`/settings`/`/about`/`/sponsor`、中英文切换、浅色/深色/跟随系统、应用级亮色/暗色语义主题、每个菜单项的 `30px` 图标及下方 `11px`/`10em` 居中文字、同时可用的亮色/暗色赞助页、关于页更新入口、作者/联系方式/免责声明和完整 sponsor 本地媒体；默认设置页不得包含隐私/统计区块，主窗口默认 1440×900 且容纳固定侧栏与三张赞助档位卡。更新显示为未配置且不得产生默认网络请求；统计能力不进入默认界面。这些 adapter-only 展示/生命周期机制不得被误写入 core。
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

报告 Git 边界、基线和干净状态、环境门禁、已选接口、全部四项策略值、可选的 Harness 溯源锁或未来初始基线审计、已创建成员、本次必要测试、已排除的项目记忆流、已删除的初始化路径、保留的 `$desktop-upgrade-harness` 与 Skills/约束地图、未验证平台及 `productDefinitionRequired=true`。选择 GUI 时还报告三个 Logo 候选与用户选择、项目内母版/运行时 Logo/平台图标证据，DMG 背景路径、660×400 尺寸、SHA-256、Tauri 配置引用和待完整产品视觉批准状态，主窗口 1440×900 与最小尺寸、侧栏 `136px` 单态及 Logo→版本顺序、`56px` Logo、`30px` 菜单图标、图标上/`11px` `10em` 文字下且居中、默认设置页无隐私/统计区块、应用级亮色/暗色主题和浅色/深色/跟随系统偏好、赞助页亮色/暗色证据，以及单实例依赖与首插件顺序、两次启动/PID/回收、单一长期应用主进程/同一主窗口、第二次启动唤醒、托盘结构检查、中文/英文精确菜单与无重启刷新、无原始 key、关闭隐藏、左键恢复、本地化显示项恢复、本地化退出、标题公式、功能区与固定底部顺序、设置/关于/赞助路由、中英文、关于页更新 `NotConfigured`、固定品牌内容、默认 sponsor 媒体和零出站证据。GUI 初始化 E2E 是基线提交前强制门禁；非 GUI 或其他未显式构建范围的构建、冒烟和候选 E2E 才报告 `Not run`。
