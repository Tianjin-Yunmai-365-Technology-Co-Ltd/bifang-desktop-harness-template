---
name: desktop-initialize-rust-project
description: 只解析 Harness 所需初始化选择并建立中性 Rust 下游；写入前由环境门禁检查、安装或升级 Git，仓库边界、local 身份与模板只在真实基线提交前即时设置。
---

# 初始化 Rust 项目

创建可复用的共享核心，并且只创建用户选择的接口。CLI 是可选接口；默认值仅按唯一表单合同中的显式答复触发，漏答继续等待。

生成的轻量 `AGENTS.md` 必须保留 `## Skills 地图` 与 `## 约束地图`。Task 与工作树统一路由到 `$desktop-task-workflow`；项目 `user_owned_tasks` 是自动创建左侧 Task 的唯一开关，默认 `disabled`，仅本项目明确选择启用后记录并创建。内部 Subagent 不占用左侧 Task 序号。

六项策略中 `task_worktrees` 紧接 `user_owned_tasks`，推荐关闭，独立决定已创建 Git Task 的 Worktree/Local 环境；不能从 Task Tree 或内部并行推断。合法明确答案直接复用，未回答不算确认。最终汇总列出项目开关和实际行为。新下游即使关闭也完整保留 `$desktop-task-workflow` 的 SKILL、references、metadata，以及兼容的 `$desktop-manage-user-tasks`、`$desktop-manage-task-worktrees`、`$desktop-run-parallel-worktrees`；初始化不创建 Task Worktree。详细创建、编号、绑定、权限和完成合同只由统一 Skill 承载。

## 用户规则优先

先读取用户级 `AGENTS.md` 并执行当前用户指令。Task 自动创建复用本项目已确认的 `user_owned_tasks`，不由跨项目偏好覆盖默认关闭；已有下游的明确项目选择和确认元数据保持。范围内的实现、检查、常规修复和提交直接执行，不因拆分反复审批。仅用户明确要求阶段隔离时拆分调研、设计、实现、正式验收等阶段；开发回归属于实现闭环。同一 Local cwd 串行，独立且不重叠的 Worktree 可按已启用并行策略执行。生成的启动入口只保留统一 Skill 路由和项目开关指针。

## 工作流程

所有接口组合完整保留 `$desktop-manage-dependencies`、`$desktop-review-core-boundaries`、`$desktop-record-adr`、`$desktop-handoff-project`、`$desktop-inspect-release-notes`、`$desktop-add-file-operations`、`$desktop-add-external-process`、`$desktop-task-workflow`、兼容 Task Skills 和 `$desktop-configure-agent-policy` 的知识、metadata、references 与 helper/测试；保留不代表初始化启用能力。Tauri GUI 完整保留 `$desktop-enable-gui-updates` 和 `$desktop-add-gui-telemetry`；GPUI GUI 完整保留 `$desktop-add-gpui-autostart`，不交叉传播或启用。

### GUI 框架分派（先于下述 Tauri 专属步骤）

接口含 GUI 时，严格复用 [唯一表单合同](../desktop-instantiate-project/references/initialization-form.md) 与 `initialization_form.mjs` 的结果；本入口不另定义提问顺序或默认触发。新初始化将已确认框架写入根 Cargo `gui-framework`，非 GUI 不写，旧 GUI 缺失时兼容 Tauri；框架不进入九字段 profile。

- `tauri`：执行下述既有 GUI 依赖、插件、Logo/DMG、支持页、已确认九项配置和 Tauri 初始化 E2E；现有行为保持。
- `gpui`：分派 `$desktop-add-gpui-adapter`，使用 `gpui-kit = "0.7.1"` 与 `rust-i18n = "4.2.0"` 的根 workspace 兼容下界，GUI member 只 `workspace = true`，直接依赖同一 core。不引入 Tauri/React/Mantine；同样要求 Node.js/pnpm，并生成项目根工程脚本入口。GPUI 复用统一表单已确认的九字段配置；仅深链接为 `unavailable`/`disabled`。当前托盘与后台热键模板限 macOS/Windows，含 Linux 的目标组合不能启用这两项。配置协助只复用统一表单中的移交意愿，具体产品动作在终端下游根目录确认。必须完整读取 GPUI Skill 的 `references/dependency-baseline.md` 与 `references/native-capabilities.md`，前者固定示例库的基础技术选型、最小 features 和启用条件，后者拥有配置移交及官方 API 限制。三候选 Logo 选择规则通用，GPUI 的资源路径与图标由新 Skill 负责，不运行 Tauri icon 或 DMG 复制。只有用户明确授权的工程验证临时项目可使用参考中性图，输出必须说明并不得作为正式身份验收。
- GPUI 初始化由 `$desktop-test-gpui-initialization-e2e` 运行非空 Rust测试、实际 `cargo build` 和真实 Computer Use，验证本机窗口、侧栏、设置、语言/主题、条件关于/赞助和五项已选能力；托盘成功才关闭隐藏，失败/禁用则关闭退出；自启操作必须恢复原状态，空热键合同证明零注册，通知横幅依赖打包与授权时如实待验证，并回收隔离偏好和进程；不调用 Tauri 插件结构检查或 `$desktop-test-gui-initialization-e2e`，不产生候选验收声明。
- 全新 GPUI 工作区使用源专用 `node .agents/skills/desktop-add-gpui-adapter/scripts/create_gpui_workspace.mjs --target <已确认的绝对空目标> --project-id <id> --name-zh <中文名> --name-en <英文名> --owner <负责人> --system-tray <enabled|disabled> --system-notification <enabled|disabled> --autostart <enabled|disabled> --single-instance <enabled|disabled> --global-shortcut <enabled|disabled> --about-page <enabled|disabled> --sponsor-page <enabled|disabled> --sidebar-mode <compact|detailed> --target-platforms <逗号分隔平台> --logo <已选择PNG>`。此 wrapper 只创建中性 core/GUI、Cargo/profile 与无 npm 第三方依赖的根 package.json 工程入口，不设置 Git、策略或产品需求；仍由本流程完成其余门禁。工程验证只有已明确批准中性图标时才可省略 `--logo`。已有共享 core 时调用新 Skill 的 add-only 入口，不能整包覆盖。终端裁剪必须删除 wrapper、`create_gpui_workspace.test.mjs` 和 `assets/core/`；保留无 core 派生能力的 renderer、add-only helper 与回归，升级按对应 tombstone 禁止恢复。
- GPUI 裁剪完整保留 `$desktop-add-gpui-adapter`、`$desktop-build-gpui-release`、项目本地 `$gpui-kit` 与 `$gpui-kit-design-guides`、通用工程 Skills 与框架适用的身份规则；删除 `$desktop-add-gui-adapter`、全部 Tauri能力/支持页/打包/初始化E2E Skills、`$mantine-list-view` 与 React/TypeScript专属门禁。Tauri 路径删除不适用的 GPUI adapter、GPUI 打包 Skill 和两套 GPUI Kit 知识资产；非 GUI 删除两条 GUI 路径及各自专属打包 Skill。
- `local_package` 只在含 CLI，或已选 GPUI GUI（含 Linux GNU x64/ARM64），或 Tauri GUI 目标含 macOS/Windows 时合法；不含 CLI 的仅 Linux Tauri GUI 必须明确选 `push_release_branch`。GPUI 由 `$desktop-build-gpui-release` 独立生成本机 macOS `.app`/DMG、Windows NSIS 或 Linux GNU deb/tar.gz；CLI 组合保留各接口独立打包边界，不把 GUI 包冒充 CLI 产物。初始化只保留打包能力，不执行候选构建。

以下“GUI”中的插件、WebView、React/Mantine/Jotai、Tauri图标/DMG、Tauri E2E 与 Tauri Skill保留要求均只针对 `gui-framework = "tauri"`；core-first、九字段结构、目标/接口事实、独立仓库、身份选择、版本和无业务边界适用于两条路径。GPUI 的框架专属规则以新 Skill 与 `docs/design_standards/gpui_gui.md` 为准。

1. 读取存在时日期最新的产品状态，以及 `docs/AGENT_POLICY.md`、`docs/ENGINEERING_RULES.md`、`docs/RUST_CLI_TEMPLATE.md` 和 `docs/design_standards/README.md`。刚实例化的下游项目有意不包含产品规格、工作计划、ADR、变更记录或 `docs/VERIFICATION.md`；不得在中性初始化期间创建这些内容。只要求具备当前中英文项目展示名称和 ASCII `snake_case` 标识；中英文至少一个由用户直接提供，只提供其中一个时自动翻译另一个并在首次写入前的完整汇总中确认。`LICENSE.zh-CN.md` 使用确认后的中文名称，`LICENSE.en.md` 使用确认后的英文名称。产品目的、核心输入/输出、业务规则、成功标准、风险、副作用、产品专属页面/文案/数据、远程地址、凭据、产品发布渠道、产物格式和自定义发布需求即使同时提供，也不得在 Harness 源或中性初始化阶段接收、分析、记录或实现；唯一允许的发布相关选择是表单中的 `post_release_action`；必须等初始化结束并切换到唯一终端下游根目录后，再通过 `$desktop-define-product` 重新提出。
2. 将当前目录解析为唯一的下游项目根目录。如果当前目录是包含根 `Version.md` 与活动 `$desktop-instantiate-project` 的 Harness 源项目，则必须停止、保留文件，并且绝不得创建替代项目目录或接收任何产品业务需求；Harness 源只处理自身工程维护和创建下游所需的固定初始化信息。
3. 表单完成与最终汇总确认前不检查、安装或升级 Git。确认后、写入脚手架前的环境门禁负责检查 Git 可用性/版本：缺失时按受管路线安装，可证明低于最低下界时按同一路线升级，范围内版本原样复用，随后复探；这个早期门禁不初始化仓库、不读取或设置作者身份/提交模板/仓库配置。独立仓库边界、repo-local 身份补齐和提交模板只在全部初始化检查成功、下一步确实将创建唯一基线提交时按第 14 步即时处理；未来会提交不构成提前创建仓库或写 Git 配置的理由。
4. 初始化输入全部复用 [唯一表单合同](../desktop-instantiate-project/references/initialization-form.md)。由实例化发起时只验证并复用当前已确认快照，不重复询问；直接调用时以 `entry = initialize` 和已核实的 `currentRoot` 运行同一 `initialization_form.mjs`，既定路径不重问，缺失项目标识、负责人及其余基础字段按 catalog 集中首轮补齐。随后只按解析器返回的问题推进，禁止另起 GUI 或策略问询。当前已确认平台/接口/框架分别持久写入 Cargo metadata，九项写入唯一 `gui-initialization-config`；`global_shortcut = enabled` 时另写唯一空 action contract。直接初始化在首次写入前再次计算，必须匹配最新 `summaryDigest` 且返回 `confirmed`。实例化已经完成首次复制时，继承复制前冻结并确认的快照，只核对目标身份与本次实际创建内容；不得再把已填充目标当空目录重跑实例化表单，也不得换成另一 entry 重新要确认。
5. 六项策略、独立的 `post_release_action`、真实确认来源与日期收齐后，以 `schema_version: 5` 和 `reuse_then_infer_then_ask` 一次原子写入 `docs/AGENT_POLICY.md`。预设展开与自定义问询只由统一表单解析器负责；Harness 源的 `pending` 不代表下游确认。实例化已写入时验证并复用，不再次询问或应用默认值。
6. 初始化是允许主动检查环境的唯一常规阶段。完整表单确认后、首次脚手架写入前，使用已记录的接口选择调用一次 `$desktop-check-development-environment`：Git、Rust 与 Node.js/npm 始终是必需项，Windows 仍需满足 Rust MSVC 前置条件，只有包含 `GUI` 的选择才另外增加阻断性的 pnpm 门禁。解析并保留 `gate.git.status/version/change`；适用工具缺失时必须由该 Skill 安装到宿主标准当前用户位置，可证明低于最低下界时自动升级并报告 `change=upgraded`，范围内稳定版原样复用。Rust 通用环境最低稳定版为 `1.95.0`，项目 `rust-version` 仍独立校验；缺失或过低时安装官方最新 stable，Node.js 使用连续下界 `>=24.0.0`，pnpm 使用 `>=12.4.1`；任何更高正式稳定版本直接通过，缺失或过低的 Node.js 安装官方索引中最高 LTS 系列的最新稳定补丁。安装必须尊重安全的标准 `CARGO_HOME`/`RUSTUP_HOME`，不得建立 Harness 私有持久环境变量、专用全局前缀或项目内工具链。存在显式上界的工具高于上界，或任何现有版本为预发布、无法解析、损坏状态时失败关闭。不得降低门禁、回退依赖、注入 shim 或寻找替代工具链来适配旧环境。记录当前宿主结果，并在任何必需工具受阻时停止；后续任务不得因新会话、显式构建或缺少环境证据重复执行本步骤，只能在真实命令已经出现受管环境错误后进入针对性恢复。
7. 使用中性资产创建根 Cargo 工作区和 `<project-id>_core`，不得引入业务假设。核心必须保持运行时中立，并且不得包含接口、进程、终端、协议、浏览器或桌面类型。Core-first 是永久硬规则（归属清单见 `docs/ENGINEERING_RULES.md`）：产品获批后，接口/宿主无关内容都先在 core 中实现和测试，即使只选择一个适配器也同样适用。根 `[workspace.dependencies]` 必须始终是唯一依赖来源，成员清单必须使用 `workspace = true`；全部 registry 直接依赖使用完整三段 Cargo 兼容下界，禁止普通依赖的精确 `=`、通配符、tag、无下界范围或“最新”。把已确认目标平台规范化为小写 `windows`/`macos`/`linux`，把接口规范化为小写 `cli`/`tui`/`mcp`/`gui`，按固定顺序、去重后写入根 `Cargo.toml` 的 `[workspace.metadata.agent-first-harness]` 下 `target-platforms` 和 `interfaces`；中性资产里的空数组只是写入前占位，任何空数组、`pending` 或未知值都阻断初始化基线。该 metadata 是后续构建唯一持久平台/接口事实，不得从当前宿主或对话重新推断。新建项目的依赖锁策略固定为缺省 `ignored`，不写 `dependency-lock-policy`；只有完成初始化的目标项目可在自己的根 Cargo 元数据中显式选择 `"tracked"`，其他值失败关闭。根 `[workspace.package].version` 写为 `0.1.0` 后，立即调用 `$desktop-manage-version init --project-root .` 创建 `.harness/version-state.json`，并核对 Cargo 当前版本与状态目标一致；该文件是受保护的正式发布周期/去重状态，不是第二版本事实源。创建或更新项目根目录 `.gitignore`，使其恰好一次包含根锚定的 `/release/` 和 `/.release-clean.*` 条目，并按新建项目的缺省策略忽略任意层级的 `Cargo.lock`、`pnpm-lock.yaml` 与 `pnpm-package.lock`；不得忽略根目录以外名称类似 release 的目录。
7.1. 仅 `interfaces` 含 `gui` 且 `gui-framework = "gpui"` 时，在接口实现前执行 `node .agents/skills/desktop-initialize-rust-project/scripts/ensure_gpui_kit_skills.mjs --project-root "<downstream-root>"`。安装器只读固定官方快照，不访问网络、不全局安装、不执行远程代码；将 `$gpui-kit`、`$gpui-kit-design-guides` 的全部原样 SKILL/references、Apache-2.0 许可、固定 revision 与逐文件大小/SHA-256 放入项目本地 `.agents/skills/`。相同内容复用；冲突或来源漂移保留原内容并报错，两个 Skill 共同预检，不能静默覆盖。安装完成后按 [GPUI 标准](../../../docs/design_standards/gpui_gui.md) 使用，并把两者加入下游 Skills 地图；其它框架或接口不安装。知识安装不增加表单字段或运行时依赖。
8. 将每个已记录接口分派给对应薄适配器 Skill：`$desktop-add-cli-adapter`、`$desktop-add-tui-adapter`、`$desktop-add-mcp-adapter`；GUI 依据已确认框架分派 `$desktop-add-gui-adapter` 或 `$desktop-add-gpui-adapter`。每个适配器直接依赖同一 core，只拥有接口语法/协议、展示/纯交互、宿主机制和结果映射；语义校验、业务编排及稳定领域错误由 core 负责。
   - Tauri GUI 完整读取 [Tauri 初始化接线](references/tauri-initialization.md)，由 GUI adapter 编排 Logo、平台图标、`macos-dmg-background.png` 的 660×400 中性背景复制、所选侧栏和支持界面；具体像素、实现与回归归相应能力 Skill 和设计标准，不在中央入口重复维护。
   - Tauri 固定调用 `$desktop-add-gui-system-locale`、`$desktop-add-gui-updater`、`$desktop-add-gui-window-state`、`$desktop-add-gui-dialog`；其余能力只按九字段 profile 分派，中央入口复核启用完整/禁用缺席，不复制实现。
   - GPUI 的资源、视图、能力和零出站边界由其 adapter Skill 承载，不读取上述 Tauri 引用。未选 CLI 时不复制中性资产中的 CLI 成员。

9. Product Spec 不存在或仍为 `Draft` 时，每个已选接口只能公开中性脚手架状态，其中包含 `productDefinitionRequired=true` 或接口等价的可见状态。不得虚构业务命令、工具、数据或副作用。GUI 标题、最终解析的侧栏、设置页、四项固定宿主基线及本轮明确选择的六个条件宿主能力和关于/赞助页面属于无业务副作用的初始化基线；通知与自启只提供默认关闭的设置能力，深链接只执行已确认的主窗口恢复动作，全局快捷键只有空 action contract 和零 OS 注册，updater 保持 `NotConfigured` 与零出站，dialog 不创建产品动作也不授予 fs 权限。未选能力不存在。产品获批后，业务 core 或适配器变化都直接实施；只有产品边界变化才更新 Product Spec。
10. 缺省锁策略下，Cargo 正常解析可在本地生成由 Git 忽略的 `Cargo.lock`，初始化不要求该文件存在或受跟踪，并只运行初始化本身必需的非空测试。GUI 测试必须覆盖唯一九字段配置块、`deep_link => single_instance`、侧栏缺省/非法值、所选侧栏和页面存在/缺席；四项固定基线与每个已选独立能力还必须运行其 Skill 规定的全部固定非空回归，未选能力运行依赖、feature、配置、命令、状态/UI/i18n 与测试无残留回归。测试不得用 `assert!(true)` 或字面量自比较占位。最低直接版本解析与非 GUI 测试边界保持既有契约。
11. 使用实际结果更新保留事实，但不为中性初始化创建产品规格、计划、ADR、Changelog 或 Verification；不创建或更新 `docs/VERIFICATION.md`，也不自动创建 Work Plan、构建候选或完整验收记录。GUI 完成输出必须逐项报告八项能力和侧栏模式、四项固定 GUI 基线、侧栏来自用户选择还是 `detailed` 缺省、`docs/GUI_APP_PROFILE.md` 配置块、已选实现与未选能力缺席证据；托盘、系统通知、开机自启、关于、赞助、单实例、深链接和全局快捷键的专属结果只在被选择时报告。
12. 选择 GUI 时，必须在非空测试通过后按框架调用一次初始化 E2E：GPUI 使用 `$desktop-test-gpui-initialization-e2e`；Tauri 使用 `$desktop-test-gui-initialization-e2e`。下述插件结构只适用于 Tauri。结构检查器先验证唯一九字段、组合约束、四项固定基线和每个独立能力的启用完整/禁用无残留，再构建并启动真实本机调试二进制，执行所选侧栏、设置页、页面、窗口状态、单实例、托盘、通知、自启、深链接、快捷键及关闭语义中的全部适用场景。dialog 固定结构检查必须覆盖 Rust/前端依赖、唯一 Builder 顺序、主窗口 `dialog:default` 和无 fs 授权。所有由测试创建的登录项、window-state 数据、快捷键注册和进程必须恢复/回收；需要打包安装才能证明的静态 scheme 系统注册（macOS/Windows/Linux）明确留给最终安装候选补验，其余已选能力无法观察或验证都阻断，未选能力不得被当作缺证据。

13. 只有全部脚手架检查完成后，才能收尾下游仓库：
    - 仅 GPUI GUI 完整保留 `.agents/skills/gpui-kit/` 与 `.agents/skills/gpui-kit-design-guides/`，包含原始 SKILL/references、Apache 许可、来源摘要和 `HARNESS-INTEGRATION.md`；两套上游原文及许可不参与身份替换。初始化目录内 GPUI Kit installer、测试与 vendor 快照随初始化收尾删除，已安装知识资产不依赖这些源路径。通用 Harness 升级保护已安装第三方内容，不覆盖本地改动；
    - 把 `$desktop-manage-git-lifecycle` 作为所有终端下游的固定工程能力完整保留，不得按接口或平台删除其 `SKILL.md`、`agents/openai.yaml`、`scripts/git_lifecycle.mjs`、`scripts/git_lifecycle_core.mjs`、`scripts/git_lifecycle_publication.mjs`、`scripts/git_publication_report.mjs`、`scripts/git_lifecycle_test_support.mjs`、`scripts/git_publication_test_cases.test.mjs`、`scripts/git_lifecycle.test.mjs` 和 `scripts/git_lifecycle_release.test.mjs`；初始化只复制 Skill 与 helper，不运行 `start`、`publish` 或 `release`，Git common-dir 中的生命周期清单只在初始化后首次真实开发时由 helper 创建；
    - 完整删除 `.agents/skills/desktop-instantiate-project/`、`.agents/skills/desktop-initialize-rust-project/` 和初始化专用的 `.agents/skills/desktop-test-gui-initialization-e2e/`、`.agents/skills/desktop-test-gpui-initialization-e2e/`；只有所选框架初始化 E2E 已通过后才允许删除对应入口；
    - 删除模板专用的 `scripts/validate_harness.mjs`、`scripts/run_harness_tests.mjs`、`scripts/harness_validation/`、`docs/HARNESS_ENGINEERING.md`、`docs/harness_engineering/`、初始化操作指南、初始化门禁描述、Harness 身份与历史，以及任何可以实例化或初始化另一个项目的入口；
    - 保留 `$desktop-rename-project-identity`、`$desktop-check-development-environment`、`$desktop-prepare-gui-app-identity`、`$desktop-upgrade-harness`、`$desktop-run-parallel-worktrees`、`$desktop-summarize-development-history`、`$desktop-manage-version`、`$desktop-configure-git-commits`，以及仍然适用的产品开发、适配器、验证和发布 Skills；必须保留 `$desktop-implement-change` 及其适用于下游的维护脚本和对应测试，但须删除上游专用的 `check_no_python.mjs` 与 `check_no_python.test.mjs`，不得在日常开发中自动运行这些全仓门禁；版本 Skill 及其 Node 标准库 helper/测试必须完整保留，并把 `.harness/version-state.json` 列入约束地图的受保护状态；选择 GUI 时同时完整保留 `$mantine-list-view` 全目录、`$desktop-prepare-gui-support-surfaces`（包括 `assets/brand-support/**`）、`$desktop-add-gui-dialog`、GUI 自有 TypeScript 注释门禁、其测试和 `$desktop-build-tauri-release`，但不得因此生成列表页或预装 dnd-kit；目标平台包含 Windows 或 Linux 时还必须保留 `$desktop-build-tauri-local-install`，使普通本地试包不进入发布流程。按固定能力顺序核对时，选择 GUI 时同时完整保留 `$desktop-add-gui-dialog`、`$desktop-prepare-gui-support-surfaces`（包括 `assets/brand-support/**`）与 `$mantine-list-view`；未选择 GUI 时将全部 GUI 条件资产与 Skills 删除且不得要求 pnpm 或前端依赖，Node.js 作为所有接口的 helper 运行时继续保留；
    - 保留继承的两份非开源企业专有商业许可证文件 `LICENSE.zh-CN.md` 和 `LICENSE.en.md`，其中中文目标项目名称和英文目标项目名称必须分别已由 `$desktop-rename-project-identity` 建立；如果任一文件缺失、名称语言错配、仍包含旧 Harness 身份、在批准改名后发生其他修改，或被安排删除，则最终收尾必须失败；
    - 把 `AGENTS.md` 重写为 UTF-8 不超过 20,000 字节且不超过 120 行的轻量启动路由器，保留现有 Harness helper 的 Node.js 运行要求，不带入上游专用 Python 禁令或检查器；Task 只保留 `$desktop-task-workflow` 路由及项目 `user_owned_tasks` 默认关闭、用户明确选择后持久记录的指针，不复制编号、标题、权限、创建或交付合同。Git Task 环境由独立 `task_worktrees` 选择；同一 Local cwd 串行，独立 Worktree 按明确并行授权分工；
    - 还必须保留 `docs/AGENT_POLICY.md` 的项目开关与确认事实，以及 `$desktop-task-workflow` 的完整 SKILL、references 和 metadata；统一描述模板及具体创建/交付合同只在该 Skill 保存；
    - 搜索下游根目录；如果历史证据之外仍存在对 `$desktop-instantiate-project`、`$desktop-initialize-rust-project`、其目录或仅用于初始化的门禁的活动引用，则最终收尾必须失败。
14. 裁剪完成后，如果本次运行由 `$desktop-instantiate-project` 发起，则确认 `docs/adr/`、`docs/changelog/`、`docs/product_spec/`、`docs/work_plan/`、`docs/VERIFICATION.md` 和 `docs/verification/` 仍然不存在。对于直接初始化的现有下游项目，必须保留已经存在的项目自有记忆与验证证据目录，绝不得为了满足此检查而删除它们。只有全部脚手架检查和裁剪已经成功、下一步就是实际创建基线提交时（即紧邻真实初始化基线提交时），才重新运行 `git --version`，并要求结果仍满足且与第 6 步的 `gate.git` 结论一致；缺失、漂移或不兼容时携带真实诊断停止，不在此临时安装或升级。随后判断 `git rev-parse --show-toplevel` 的规范化路径是否等于当前项目根目录；不相等时即使存在父级仓库，也在当前根运行 `git init --initial-branch=main .`，相等时保留既有独立仓库。验证工作树内状态为 `true`、顶层目录等于当前根、分支为 `main`、`git remote` 为空且提交前 `HEAD` 不存在。此时才调用 `$desktop-configure-git-commits`：先执行 `identity-report`；若 `user.name` 或 `user.email` 缺失，Agent 读取设备用户名，非英文时翻译并归一化为单一安全 ASCII username/slug，再把这一个值传给 `identity-bootstrap --fallback-username`，由 helper 确定派生同名 `user.name` 与 `<asciiDeviceUsername>@gmail.com` 并只补齐缺失字段；身份 bootstrap 只写当前仓库 local 配置，底层只允许 `git config --local`。随后执行 `identity-check`。已有有效身份保持不变；已有无效字段、无法得到安全 ASCII username、写入或复探失败都停止，不得猜测翻译算法、接受独立邮箱输入或修改 global/system。身份通过后依次运行 `node .agents/skills/desktop-configure-git-commits/scripts/configure_git_commit.mjs install --project-root .` 与 `node .agents/skills/desktop-configure-git-commits/scripts/configure_git_commit.mjs check --project-root .`；已有冲突模板配置必须停止，只有用户明确批准后才可使用 `--replace`。检查通过后以 `chore: 初始化项目` 准备 UTF-8 消息文件，运行 `configure_git_commit.mjs message-check --message-file <file>`，复核消息与差异后暂存完整项目树并创建恰好一个本地基线提交；提交后用 `git log -1 --format=%B` 复读实际中文消息，异常阻断完成。
15. 创建基线提交之前，必须确认六项策略字段和确认元数据均不包含 `pending`，且 `post_release_action` 精确等于 `local_package` 或 `push_release_branch`；缺失、非法值或 `pending` 必须阻断完成。再次读取根 Cargo metadata 的规范化 `interfaces` 与持久动作交叉校验：`local_package` 在含 `cli`、已选 GPUI GUI，或 Tauri GUI 目标含 `macos`/`windows` 时合法；纯 `tui`/`mcp` 或仅 Linux Tauri GUI 必须为 `push_release_branch`，冲突时不得创建基线提交。如果具备精确的源溯源和渲染后的保留工程层候选，则通过 `$desktop-upgrade-harness record --bootstrap` 建立 `.harness/upstream-lock.json`；否则必须记录首次升级所需的初始基线审计，不得虚构锁文件。验证已完成仓库的规范顶层目录、`main`、可解析的基线提交、无远端，以及空的 `git status --porcelain=v1 --untracked-files=all`。任何失败都必须阻断完成。
16. 下一步必须转到 `$desktop-define-product`。生成的下游项目是终端项目根目录，而不是另一个 Harness；绝不得根据脚手架声称产品已经交付。

Windows 环境门禁的自动安装若因管理员权限、UAC、组织策略或当前宿主无法运行安装器而阻断，按 `$desktop-check-development-environment` 的人工接续方案提供已证实缺失项的官方入口，保留已确认表单并停止写入。用户自行安装并告知继续后，在原目标和接口选择下只读复探，通过后从中断点继续，不重复询问或重建项目。

## 架构不变量

- 最终裁剪保留根 `DESIGN.md` 和完整 `docs/design_standards/`（含 `ui_foundation.md`）；下游 `AGENTS.md` 的 GUI 路由要求从设计索引先读共用基座，再按 Cargo 框架命中专项标准。直接初始化遇到自有 `DESIGN.md` 时保留其内容，只按真实范围接入索引。非 GUI 可保留设计资料，但不得因此要求 GUI、pnpm 或前端依赖。

- 完成收尾的下游项目必须完整保留 `$desktop-manage-git-lifecycle`；它统一创建/登记 Task 的 `feature-*`，并与只供内部单元使用的 `codex/unit-*` 分层保持独立，但不自动创建左侧 Task。初始化不得运行 `start`、`publish` 或 `release`，不得创建开发分支、tag 或 Git common-dir 生命周期清单，也不得预创建 `.harness/release-context.json`；无 remote 的独立 `main` 基线仍是唯一初始结果。
- 当前项目根目录必须同时是唯一的下游根目录及其独立 Git 顶层目录；父级仓库绝不能替代它。
- 根 `Cargo.toml` 管理共享核心，并且只管理用户实际选择的适配器成员。
- Rust 与前端清单声明经过最低直接版本和项目最低工具链测试的兼容下界；新建项目缺省忽略 `Cargo.lock`/`pnpm-lock.yaml`，可将其作为本地解析结果，不以两者或 `pnpm-package.lock` 作初始化门禁；完成初始化后才可由目标项目显式选择 `tracked`，普通依赖不得精确锁死或使用 `latest`、tag、通配符。
- 确定性目录为 `<project-id>_core`、`_cli`、`_tui`、`_mcp` 和 `_gui`。
- 每个适配器必须直接依赖核心，并且绝不得解析、启动、嵌入或要求另一个适配器。
- Core-first 按职责而非代码行数判断：领域规则、语义校验、业务默认值、用例编排、状态转换和稳定错误属于 core；适配器只拥有协议/展示/交互/宿主机制和映射。当前只有一个适配器不是例外，偏离只能按硬规则例外 ADR 处理。
- Rust、前端、其他人工维护文本的日常/初始化门禁只分别强制 800、1000、2000 行硬上限；400、500、500 行起的建议候选只在当次发布启用语义审查时集中列出并复核高内聚、职责单一和职责相近性。硬上限独立于 core-first 语义判断，不能以 ADR、职责集中或测试夹具为由放宽。Rust 多文件模块使用 `<module>/mod.rs` 目录结构，不得以同级文件加同名目录或空壳转发规避；前端按功能职责拆分且不强制 `index.ts` 桶文件。
- 适配器只拒绝无法解析、缺少协议必填字段或违反宿主能力约束的输入；值域、跨字段关系、资源状态、业务权限、幂等性、可否执行以及影响业务结果的默认值由 core 判定并返回稳定领域错误。
- 每个适配器公开真实操作时必须记录“适配器操作 → core API → core 测试”；单实例、系统托盘等 adapter-only 机制必须记录其接口/宿主专属性，并把业务效果委托 core。中性单实例回调只恢复窗口，不产生业务效果。
- CLI、TUI 和 MCP 适配器默认使用 Tokio current-thread 异步入口；GUI 复用 Tauri 由 Tokio 支撑的异步运行时。所有 Rust 适配器工作优先采用异步 I/O 和等待。只有经过测量的 CPU 密集工作才可以进入有边界的线程边界；仅提供阻塞接口的依赖必须被替换，或通过范围与硬规则例外流程获得批准。除非已批准的领域需求另有要求，核心必须保持运行时中立。
- 已选 TUI 或 GUI 适配器即使处于 `Draft` 状态也必须应用固定技术栈；替换技术栈需要记录硬规则例外。
- Rust 能力按 `docs/RUST_CLI_TEMPLATE.md` 的事实标准选择：Tokio、Axum + Tower/Tower HTTP、Clap、SeaORM、config-rs、tracing + tracing-subscriber + tracing-appender、anyhow、thiserror、serde、jiff；OpenTelemetry 与协议/存储/认证候选只在对应能力获批后采用。只把当前已选接口或已批准真实能力需要的依赖加入根 `[workspace.dependencies]`；不得为中性状态预装未使用的 HTTP、ORM、配置、错误或可观测性依赖，偏离固定技术必须记录硬规则例外。
- 只有选择 CLI 时，CLI 才遵守 `docs/CLI_CONTRACT.md`。
- `docs/AGENT_POLICY.md` 持久记录六项项目选择和 `post_release_action`；后续 Agent 必须复用这些选择、推断适用性，并且只在策略缺失/非法、用户明确要求手动切换或问题仍未解决时询问。
- `docs/AGENT_POLICY.md` 保存 `user_owned_tasks` 默认关闭、仅本项目明确选择后的确认事实、独立 `task_worktrees` 和 `parallel_worktree_subagents` 开关；Task 详细合同统一由 `$desktop-task-workflow` 承载，内部 Subagent 不占用用户可见 Task 序号。保留 Skill 不等于启用开关。
- 产品规格、工作计划、ADR 和变更记录属于下游开发记忆，不属于初始化载荷。
- 完成收尾的下游项目不能从自身实例化或初始化另一个项目。
- 完成收尾的下游项目必须保留继承的两份专有商业许可证文件，并继续受其中终端下游限制约束。
- `AGENTS.md` 必须始终保持轻量渐进读取结构，并保留非空的 Skills 地图和约束地图；裁剪可以移除不适用条目，但不得删除任一地图或把任务专属细节重新内联。
- 初始化只有在独立仓库中创建一个真实本地基线提交，并且 Git porcelain 状态为空时才算完成。
- Git 可用性与版本只在表单汇总确认后、脚手架写入前由初始化环境门禁检查：缺失时按宿主受支持路线安装，可证明低于最低下界时升级，范围内或更高稳定版本原样复用，随后复探；Rust、Node.js 与 pnpm 由门禁安装时只使用操作系统惯例下的当前用户标准全局根，不建立 Harness 私有持久环境、专用前缀或项目工具链。作者身份、独立仓库边界和提交模板仍只在全部初始化工作完成、紧邻真实基线提交时检查或设置。基线提交前必须通过 `$desktop-configure-git-commits` 的身份 report/bootstrap/check 与模板 `install`/`check`；缺失身份只从 Agent 提供的单一 ASCII 英文设备 username 派生并写当前仓库 local，受管模板和四项模板设置也只属于当前仓库，绝不得修改 global/system。
- 项目根目录 `.gitignore` 必须恰好一次包含 `/release/` 和 `/.release-clean.*`，按缺省策略忽略任意层级的 `Cargo.lock`、`pnpm-lock.yaml` 与 `pnpm-package.lock`；构建流水线负责原子刷新的当前结果目录，以及同根目录中断后遗留的清理或候选暂存目录。
- 根 `Cargo.toml` 的 `[workspace.metadata.agent-first-harness]` 必须持久保存非空 `target-platforms` 与 `interfaces`；后续构建只读消费，不能因换会话或换宿主重新猜测。

## 完成要求


GPUI Kit 部分仅在选择 GPUI GUI 时报告 `ensure_gpui_kit_skills.mjs` 的实际 `installed|reused`、两个项目本地目录、固定 revision、Apache 许可/来源/逐文件摘要、Skills 地图及原始跨 Skill/仓库引用的 `HARNESS-INTEGRATION.md` 映射。其它框架报告未安装；快照存在不代表下游已安装，安装冲突不能报成功。

版本部分必须报告根 Cargo 初始版本与 `.harness/version-state.json` 一致、`$desktop-manage-version` 已保留且状态已列入约束地图。Git 生命周期部分必须报告 `$desktop-manage-git-lifecycle` 已完整保留、未运行 `start|publish|release`、未创建 common-dir 生命周期清单、未预创建 `.harness/release-context.json`，且基线仍是无 remote 的独立 `main` 提交。

报告写入前环境门禁的 `gate.git.status/version/change`、基线前复探到的最终 Git 版本、最终 Git 边界、有效 `user.name`/`user.email` 及各自 scope/origin/source、是否由单一 ASCII 设备 username 派生并写入 local、提交模板本地配置与检查结果、基线和干净状态，以及已选接口、全部六项策略值（单列 `user_owned_tasks`）、`post_release_action`、已创建成员、本次必要测试、已删除初始化路径、保留 Skills/约束地图、未验证平台及 `productDefinitionRequired=true`。选择 GUI 时还报告三个原始 Logo 候选的稳定预览顺序、用户选择、仅对所选项执行的后置验证/标准化、图标与 DMG 证据、九项 GUI 初始化配置、侧栏模式及持久折叠测试、设置页与主题；system-locale、updater、window-state、dialog 分别报告固定基线与零出站/恢复/权限边界证据；对系统托盘、系统通知、开机自启、关于页、赞助页、单实例、深链接、全局快捷键分别报告 `enabled`/`disabled`。全局快捷键启用时另报告 contract 动作数、初始非空 binding 数、实际注册数和 owned 清理；其他启用项报告完整实现/E2E 或需打包验证的明确边界，禁用项报告依赖/feature/插件/命令/Switch/状态/翻译键/路由/入口/媒体缺席和关闭最后窗口退出等对应证据。

GPUI 初始化完成时完整保留 `$desktop-manage-gpui-dependencies`、`$desktop-optimize-gpui-performance` 和中性 `docs/GUI_ENGINEERING.md`；Tauri 与非 GUI 裁掉这些专属知识，不遗留失效链接。Linux GPUI 打包保留环境 Skill 的 linux-gpui-dependencies.sh 与回归，按需调用，不自动安装或放开未实现的桌面能力。

非 GPUI 初始化裁剪上述两项 Skill 和索引时，同步移除 AGENTS、README、ENGINEERING_RULES、RUST_CLI_TEMPLATE 中指向它们的路由及链接；保留 Tauri/非 GUI 原有入口。
