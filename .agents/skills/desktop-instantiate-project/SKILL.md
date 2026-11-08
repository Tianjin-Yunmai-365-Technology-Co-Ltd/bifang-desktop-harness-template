---
name: desktop-instantiate-project
description: 只收集 Harness 创建终端下游所需的固定初始化信息，拒绝产品业务需求；表单确认后先门禁 Git，完成中性脚手架后再建立独立仓库与 local 身份。
---

# 实例化项目

创建一个继承 Harness 长期规则、但不继承 Harness 项目身份、按日期保存的项目记忆、批准结论、验证声明或 Git 历史的下游仓库。

## DESKTOP 框架与 NSH 路由

顶层选择 DESKTOP（Cargo `gui`）或 NSH 后，严格复用 [唯一表单合同](references/initialization-form.md) 与 `initialization_form.mjs` 的下一问；不在本入口定义默认或重新询问。DESKTOP 已确认框架写入 Cargo `gui-framework`，仅有 Tauri/GPUI 两项，旧 GUI 缺失时兼容 Tauri。NSH 写入顶层 `interfaces = ["nsh"]`、`nsh-targets` 和具体 `target-platforms`，不写 `gui-framework`；旧 GUI/NSH 元数据只读兼容。九字段 profile 对 DESKTOP 始终适用，对 NSH 仅随 desktop 子目标适用。

本 Skill 下文关于 Tauri 图标/DMG、三项固定插件、六项宿主能力、Mantine/React 与 `$desktop-test-gui-initialization-e2e` 的要求只适用于 Tauri 路径。GPUI 由 `$desktop-add-gpui-adapter` 创建原生 gpui-kit/Rust GUI。新 GPUI 项目默认含 Linux，深链接、系统托盘和 OS 全局快捷键均由能力限制派生为 `unavailable`/`disabled`；旧项目不含 Linux 时仍按其受保护平台和 profile 判断托盘与快捷键。其余九字段配置复用统一表单，配置协助只记录移交意愿，具体产品动作在终端下游根目录确认。DESKTOP 要求 Node.js/pnpm，顶层 NSH 仅要求 Node.js 工程工具，GPUI 在项目根提供 Node 验证与发布/打包脚本。GPUI 使用自己的模板、Logo 路径、Rust 测试、实际构建与 Computer Use 初始化检查，不调用 Tauri 能力 Skill。

发布后动作不在初始化表单中选择；首次发布前按已持久化的接口、框架、NSH 子目标与平台校验：接口含 CLI 或 NSH，或已选 GPUI GUI（含 Linux GNU x64/ARM64），或 Tauri GUI 目标含 macOS/Windows 时可明确选择 `local_package`；不含 CLI 的仅 Linux Tauri GUI 必须明确选择 `push_release_branch`。GPUI GUI 候选由独立 `$desktop-build-gpui-release` 生成本机 macOS `.app`/DMG、Windows NSIS 或 Linux GNU deb/tar.gz，不借用 CLI 或 Tauri 打包。GPUI 终端下游完整保留该打包 Skill、新 adapter Skill 与通用规则，裁掉 Tauri/Mantine/React专属 Skills；Tauri、NSH 和非 GUI 下游裁掉 GPUI 专属打包 Skill。不再自动安装第三方风格 Skill。GPUI 初始化由 `$desktop-initialize-rust-project` 在删除初始化目录前安装本地 `$gpui-kit` 与 `$gpui-kit-design-guides`，上游快照与许可不参与身份替换；Tauri/NSH/非 GUI 不安装。

六项 Agent 策略直接使用固定默认值，不单独询问。`task_worktrees` 与 `user_owned_tasks` 均默认关闭，不能从 Task Tree 或内部并行推断。最终汇总逐项列出默认值、来源与有效行为。新下游即使关闭也完整保留 `$desktop-task-workflow` 的 SKILL、references、metadata 和地图；初始化不创建 Task Worktree。项目选择以 Agent Policy 为事实源，执行合同统一使用 `$desktop-task-workflow`。

## 用户规则优先

先读取用户级 `AGENTS.md`，用户已确认的长期硬规则优先于项目偏好。新项目使用固定策略默认值；已有下游偏好及确认元数据原样保留。汇总分别列出项目值、确认来源与有效执行行为，不启用未授权的其他能力。生成的启动入口必须保留用户规则优先、项目默认关闭、启用时绑定/非 pinned/主动恢复及显式阶段隔离指针。

## 工作流程

固定复制、身份重置和已确认策略写入统一使用 [确定性工程层入口](references/deterministic-instantiation.md) 的 `instantiate_project.mjs plan/prepare`。完整读取该合同，复用已有真实确认；在以下源验证与环境门禁之后才执行 prepare。不要另写临时复制/批量替换脚本。下列第 6–9 项是 helper 维持的不变量，prepare 已完成时只复核输出，不重复手工复制、改名或写策略。prepare 只返回工程层准备清单，不替代后续中性初始化、真实测试、GUI 初始化 E2E、终端裁剪或 Git 基线。

固定复制快照须包含根 `DESIGN.md` 与 `docs/design_standards/ui_foundation.md`，并完整保留设计标准目录。根文件仅作导航，共用规则只在受管设计目录维护；不得把附件样例色值写成新下游的产品品牌事实。

1. 读取源项目的 `AGENTS.md`、`README.md`、`Version.md`、`docs/AGENT_POLICY.md`、`docs/ENGINEERING_RULES.md`、`docs/design_standards/README.md`、`docs/RELEASE.md`、两份许可证，以及 `$desktop-rename-project-identity`/`$desktop-initialize-rust-project`/`$desktop-manage-git-lifecycle` 的当前规则。收到任何创建新下游项目的请求时，还必须先完整读取并执行 [`references/initialization-form.md`](references/initialization-form.md)。实例化排除日期项目记忆，因此不默认加载 Harness 的历史 Product Status、Work Plan、Verification、ADR 或 Changelog 正文。
2. 完整读取并执行 [唯一表单合同](references/initialization-form.md)，运行只读 `initialization_form.mjs --catalog`，每次回复后由解析器计算下一问，每轮只问当前一个字段。基础字段依次包括中文项目展示名称、英文项目展示名称、ASCII `snake_case` 项目标识、项目路径、负责人和程序类型；程序类型收齐后，NSH 只问能力并派生平台，CLI/MCP/DESKTOP 默认 Windows/macOS/Linux 全平台，不再单问系统平台。选项须由用户点击确认；程序类型与 NSH 能力优先使用复选控件，宿主仅有单选控件时逐项点击选择/不选择并确认集合，不能把手打选项当成默认交互。CLI、MCP 可组合并可与 DESKTOP 组合，NSH 单选。问句、默认触发、框架分派、能力限制与配置协助不在此复制。用户对最新完整汇总的确认必须匹配 `summaryDigest`；首次写入前重新计算并确认仍为 `confirmed`。不得接收、分析、记录到源仓库或脚手架的产品需求，要求切换唯一下游根目录后重新提出。
3. 在源项目根目录使用 Node.js >= 24.0.0 运行 `node scripts/validate_harness.mjs`；Node.js 缺失或版本不足时失败关闭，不得改用其他运行时。本阶段只验证 Harness 源，不执行 Git 可用性、版本、身份、提交模板或仓库配置检查，也不安装、升级或初始化 Git。完整表单汇总确认后，由 `$desktop-initialize-rust-project` 在任何脚手架写入前调用环境门禁检查 Git，缺失时按受管路线安装并复探；仓库初始化、作者身份与模板仍统一推迟到全部脚手架和一次性裁剪完成、下一步将实际创建基线提交时即时执行。
4. 收齐项目标识和项目路径后，运行只读 `node .agents/skills/desktop-instantiate-project/scripts/resolve_project_target.mjs --harness-root "<harness-root>" --project-path "<user-project-path>" --project-id "<project-id>"`。相对输入以当前 Harness 根目录为基准；规范化输入路径的最后一个名称与 `<project-id>` 区分大小写地精确相等时，最终项目根目录就是输入路径，否则固定为 `<项目路径>/<project-id>`。不得用大小写、连字符/下划线转换、前后缀或相似度把不同名称视为相同。helper 输出的 `targetRoot` 必须显示在完整表单汇总中，并在用户确认后成为唯一项目根目录。拒绝以 Harness 根目录自身、Harness 根目录的任何祖先目录，以及通过符号链接解析到任何禁止位置的路径作为最终项目根目录。除这些限制外，目标可以位于 Harness 根目录内部或外部。
5. 写入前清点解析后的最终项目根目录。只有最终项目根目录必须不存在或为空，包括不存在任何隐藏条目；当用户输入的是父目录时，该父目录可以存在且非空。必须保留用户文件，并在最终目标为符号链接、非目录、非空或发生任何冲突时停止。绝不为了让现有仓库看起来像模板而删除、合并写入或覆盖它。
6. 在创建或填充目标目录之前，对受维护的源文件列表生成快照；随后只复制该固定文件列表，不得再次递归遍历源目录，以免将 Harness 复制到其内部目标时发生递归。排除根 `knowledge/`、`.harness/skills/archify/`、目标目录自身、其他下游项目、源 `.git`、构建输出、缓存、临时文件、`dist/`、本地工具状态、生成的证据，以及仅属于 Harness 的根目录 `Version.md`；初始化后的 Rust 下游项目从根 `Cargo.toml` 获取版本事实。还必须排除上游专用的 `check_no_python.mjs` 与 `check_no_python.test.mjs`，不在下游重建；还必须完整排除 `docs/adr/`、`docs/changelog/`、`docs/product_spec/`、`docs/work_plan/`、`docs/VERIFICATION.md`、`docs/verification/` 和 `.agents/skills/desktop-curate-harness-memory/`：实例化期间不得复制其索引、日期文件、历史验证正文或该 Skill 本身，也不得创建空白替代目录或文件。`desktop-curate-harness-memory` 只治理 Harness 自身的历史条目，下游没有可迁移的历史，不得保留或独立重建。保留 `.gitignore`、长期规范性文档、完整 `docs/design_standards/`、项目 Skills、这些 Skills 有意保留的资产（包括 `.agents/skills/desktop-initialize-rust-project/assets/gui/macos-dmg-background.png`），以及根目录的两份许可证文件 `LICENSE.zh-CN.md` 和 `LICENSE.en.md`。`$desktop-manage-git-lifecycle` 是所有终端下游都必须保留的身份中立工程能力；其完整 Skill 目录、helper 和回归测试必须进入固定快照并经过后续裁剪，不得按接口或平台删除。Git common-dir 生命周期清单不是 tracked 资产，`.harness/release-context.json` 也只能在未来一次真实发布准备中产生，二者都不得进入中性初始化快照。设计标准属于身份中立的工程规则；产品像素偏离记录在下游 GUI profile/ADR，不直接修改受管目录。初次传输时必须逐字节复制两份许可证文件；身份重置期间不得替换、削弱、概述或删除其中的法律条款。
7. 先以预览模式调用 `$desktop-rename-project-identity`，随后在整个受维护的目标树中应用复核后的映射。向脚本同时传入已确认的中英文展示名称，把 Harness 的两种展示名称、snake_case 标识、kebab-case 前缀、示例包前缀、项目自有配置和保留 Skills 替换为目标身份；`LICENSE.zh-CN.md` 的 `适用项目名称` 精确使用中文名称，`LICENSE.en.md` 的 `Applicable Project Name` 精确使用英文名称；同理，按 locale 拆分的双语 GUI 资源文件（如 `i18n/zh-CN.json`、`rust-i18n/zh-CN.yml` 及其 `en-US` 对应文件）中，凡以字面文本写入项目展示名称的位置，`zh-CN` 文件使用中文名称、`en-US` 文件使用英文名称；运行时以单一 `applicationName` 变量注入并跟随界面语言切换的位置不在本条替换范围内。许可证编辑仅限精确的项目名称词元；所有其他法律文本必须与复制后的源文件保持字节等价。继续之前必须解决每一个适用的身份残留，并保留 `$desktop-rename-project-identity` 供未来已批准的产品改名使用。
8. 六项固定默认策略、`post_release_action: pending` 与完整汇总的确认元数据收齐后才一次原子写入 `docs/AGENT_POLICY.md`；必须使用 `schema_version: 5`、`decision_mode: reuse_then_infer_then_ask`、真实的 `confirmed_by`/`confirmed_at`，且不得新增预设字段；仅发布后动作可保持 `pending`。把产品状态、接口选择、发布记录、技术债和 Harness 溯源重置为真实的下游起始状态，并确认验证历史和人工复核字段没有迁移。不得仅为实例化创建产品规格、工作计划、ADR、变更记录或 `docs/VERIFICATION.md`。
9. 在继承的规范性文档中保留基线约束，但从下游 `AGENTS.md` 与 `docs/ENGINEERING_RULES.md` 删除仅属上游的 Python 禁令和检查命令，不得把 Harness 的决策日期或批准结论表述为下游负责人作出的决定。把下游 `AGENTS.md` 重写为不超过 20,000 UTF-8 字节和 120 行的轻量路由器；Task 只保留 `$desktop-task-workflow` 路由及项目 `user_owned_tasks` 默认关闭、用户明确选择后持久记录的指针，不复制编号、标题、权限、创建或交付合同。必须完整保留 `$desktop-task-workflow` 的 SKILL、metadata 与 references（含左侧 Task 描述模板）及旧入口兼容路由。`task_worktrees` 仅选择 Git Task 环境，`parallel_worktree_subagents` 仅控制内部并行；具体绑定、编号与并行合同在统一 Skill 保存。保留 `$desktop-manage-git-lifecycle`、Git common-dir 生命周期清单和 `.harness/release-context.json` 的事实来源入口。
   用户可见 Task 标题是非阻断 UI 闭环，不能取代描述模板、真实身份或初始派发门禁。
10. 一致设置版本事实。仅当继承的基线适用且用户没有批准其他初始版本时使用 `0.1.0`。反馈渠道、发布渠道和产物格式尚未决定时，必须明确保持为未知。
11. 在目标目录中搜索残留的 Harness 中英文身份、历史批准日期、已完成验证声明、源机器绝对路径，以及 `example-tool` 等示例标识。解决每一个适用命中，或者记录其有意保留的原因。中文许可证中的项目名称必须等于已确认的中文名称，英文许可证中的项目名称必须等于已确认的英文名称；README 的身份摘要也必须同时列出这两个名称。`Software`、`Licensor`、`Licensee` 和 `Downstream Project` 的通用定义以及所有非身份法律条款都属于有意保留内容，除非具备资格的法律顾问批准替换商业许可证，否则必须保持不变。
12. 不得在经过选择性复制的目标目录中运行模板级 Harness 验证器。验证目标目录清单、排除项、改写后的身份、保留链接和固定策略定义，随后把初始化表单中已确认的目标平台与 `CLI/MCP/DESKTOP/NSH` 接口选择交给 `$desktop-initialize-rust-project`；验证并复用全部六项固定策略与 `post_release_action: pending`，不得再次询问目标平台、策略、发布后动作或接口。用户在表单中明确选择默认接口时使用 CLI，仅持久化明确选中的接口，不隐式附加 CLI。初始化器必须把规范化后的目标平台和接口分别持久写入根 `Cargo.toml` 的 `[workspace.metadata.agent-first-harness]` 下 `target-platforms` 与 `interfaces`，供后续构建只读使用，不得遗留空数组或根据新会话重新猜测。若选择 DESKTOP 或 NSH desktop 子目标，复用表单在基础字段解析后按需逐项确认的系统托盘、系统通知、开机自启、关于页、赞助页、单实例、深链接、全局快捷键和 `compact`/`detailed` 侧栏模式，不得在复制后重新发起一轮问询；八项能力必须明确，用户跳过侧栏模式时必须已归一化为 `sidebar_mode = detailed`，显式非法值必须在表单阶段重新确认。`deep_link = enabled` 必须同时满足 `single_instance = enabled`；派生 restore URL 与全局快捷键启用时的空 action/零默认绑定边界必须已在汇总确认。把归一化后九项无 `pending` 事实按 `system_tray`、`system_notification`、`autostart`、`about_page`、`sponsor_page`、`single_instance`、`deep_link`、`global_shortcut`、`sidebar_mode` 的固定顺序写入 `docs/GUI_APP_PROFILE.md`；全局快捷键启用时另写唯一空 `gui-global-shortcut-contract`，禁用时不得写该块。
13. 必须要求 `$desktop-initialize-rust-project` 在完整表单确认后、脚手架写入前保存 `$desktop-check-development-environment` 返回的 `gate.git.status/version/change`；选择 GUI 时，GPUI 使用 `$desktop-test-gpui-initialization-e2e` 执行原生初始化检查；下述插件合同仅适用于 Tauri，由 `$desktop-test-gui-initialization-e2e` 在脚手架检查完成后先读取 GUI 配置并条件检查。system-locale、window-state、dialog 三项固定基线始终验证版本/member 继承、唯一插件注册、locale、安全窗口恢复，以及主窗口 `dialog:default` 与无 fs 授权；dialog 固定在 window-state 后、notification 前。单实例、托盘、系统通知、开机自启、深链接与全局快捷键只在启用时执行各自结构/宿主场景；深链接同时验证单实例 feature、身份派生 restore URL 与冷/热事件，中性全局快捷键验证 contract 唯一、动作数组为空、启动零注册、无占位 UI 与 owned 清理。托盘禁用时必须证明没有 feature/托盘/关闭拦截且关闭最后窗口结束进程；开机自启、window-state 与全局快捷键在 E2E 后恢复执行前状态。E2E 始终验证所选侧栏模式、设置页、全部实际菜单页面，以及关于/赞助入口按选择存在或缺席。除各平台需打包安装才能证明的静态 scheme 系统注册与系统 URL 唤起外，任何已选能力无法判定或观察都阻断；该例外仍须通过解析器、冷/热分发及窗口恢复回归，当前调试程序可观察的宿主事件继续实测，未证明部分明确为 Not verified 并由最终安装候选补验，未选能力不作为缺证据。全部检查和一次性裁剪完成、下一步确实将创建唯一基线提交时，才复探 Git、建立并验证独立仓库边界，使用 `$desktop-configure-git-commits` 先报告身份；已有有效身份原样保留，缺失字段由 Agent 提供的单一 ASCII 英文设备 username 派生同名 `user.name` 与 Gmail 并只写 repo-local，随后检查身份、安装和检查仓库本地提交模板。已有无效身份、无法安全翻译/归一化设备名、identity/template 检查失败都阻断；九项桌面配置无 `pending`、六项 Agent 策略已确认且 Git 干净、无远端时创建恰好一个本地基线提交；`post_release_action: pending` 保留至首次发布前。不得提前初始化仓库或设置身份/模板，不得修改全局 Git 配置，也不得修改 system Git 配置。

初始化收尾还必须由 `$desktop-manage-version init --project-root .` 创建并核对受保护的 `.harness/version-state.json`，并在裁剪中完整保留该版本 Skill、标准库 helper 和测试；不得把 Harness 时间版本写入下游状态。

初始化只复制并完整保留 `$desktop-manage-git-lifecycle` 的 `SKILL.md`、`agents/openai.yaml`、`scripts/git_lifecycle.mjs`、`scripts/git_lifecycle_core.mjs`、`scripts/git_lifecycle_publication.mjs`、`scripts/git_publication_report.mjs`、`scripts/git_lifecycle_test_support.mjs`、`scripts/git_publication_test_cases.test.mjs`、`scripts/git_lifecycle.test.mjs` 和 `scripts/git_lifecycle_release.test.mjs`，不运行 `start`、`publish` 或 `release`。Git common-dir 生命周期清单只能在初始化完成后的首次真实开发中由该 Skill 创建；`.harness/release-context.json` 只能在未来一次真实发布准备中创建，中性初始化不得预创建二者。

## 重置不变量

- 绝不得把 Harness 中的 `Approved` 产品状态、人工复核人身份、验证结论、源码提交、校验和、发布日期或平台结果带入新的下游项目。
- 绝不得迁移或预创建 `docs/adr/`、`docs/changelog/`、`docs/product_spec/`、`docs/work_plan/`、`docs/VERIFICATION.md` 或 `docs/verification/`；这些内容只在各自事件触发条件满足时由负责的开发 Skill 创建。
- 绝不得声称示例资产产生的 Windows、macOS 或 Linux 证据属于下游产品。
- 绝不得复制源 `.git` 目录或伪造历史。必须始终在解析后的目标根目录创建新的独立仓库。
- 绝不得代替用户选择项目路径输入。只能按已确认表单中的确定性规则解析最终项目根目录：末级名称与项目标识精确相等时直接使用，否则追加项目标识；解析结果必须在首次写入前展示并确认。
- 绝不得把 Harness 根目录或其任何祖先目录作为最终目标，不得覆盖非空最终目录，也不得跟随符号链接进入禁止位置。父目录输入可以非空；安全门禁始终应用于解析后的最终项目根目录。
- 完成移交后，必须把解析后的目标目录同时视为唯一项目根目录和 Git 顶层目录。不得继承父级 Git 边界，也不得在其他位置创建第二份项目树。
- 初始化请求仅授权在脚手架验证和裁剪成功后创建恰好一个本地基线提交。该请求不授权创建远端、推送、标签、发布、签名密钥、全局 Git 配置变更或托管仓库。
- 初始化不运行 `$desktop-manage-git-lifecycle start|publish|release`，不创建或推送开发分支和 tag，不创建 common-dir 生命周期清单，也不预创建 `.harness/release-context.json`；无 remote 的独立 `main` 基线仍是唯一初始结果。
- Git 可用性与版本只允许在完整表单确认后、脚手架写入前的初始化环境门禁检查；缺失时受管安装并复探。独立边界、作者身份和提交模板仍只允许紧邻真实基线提交检查或设置；复制、身份改写、脚手架编写和测试均不得以未来会提交为由提前初始化仓库或写 Git 配置。
- 必须保留共享核心、已选接口、中文业务注释、文档、测试、验证、例外和人工复核规则，除非下游负责人批准并记录例外。
- 必须执行 `docs/AGENT_POLICY.md` 中全部六项固定策略值；`post_release_action` 留待首次发布前确认。后续工作必须复用这些值，并且仅在策略缺失/非法、用户明确要求手动切换、需求冲突或无法判断适用性时询问。
- 生成的仓库是终端项目：不得保留 `$desktop-instantiate-project`、`$desktop-initialize-rust-project` 或任何其他活动的项目派生入口。
- 选择 GUI 时，唯一基线提交必须晚于一次成功的配置感知结构检查和 GUI 初始化 E2E。三项固定插件基线始终验证；单实例、托盘、系统通知、开机自启、深链接与全局快捷键完整场景只对已选能力执行；未选托盘固定执行关闭最后窗口退出场景；开机自启、window-state 和快捷键 E2E 必须恢复原状态；关于/赞助和侧栏模式必须与 `docs/GUI_APP_PROFILE.md` 一致。该本机调试检查不迁移为发布或完整验收结论，macOS 静态 scheme 的最终系统注册仍由已打包候选补验。
- 生成的仓库必须包含 `LICENSE.zh-CN.md` 和 `LICENSE.en.md`；与源 Harness 相比，只有其中精确的双语 `Applicable Project Name` 可以不同，所有其他法律条款都必须保持不变。初始化裁剪不得删除或进一步修改任一文件。
- 裁剪后，`AGENTS.md` 必须继续保留轻量渐进读取结构、非空的 Skills/约束地图、`$desktop-upgrade-harness`、`$desktop-manage-version`、`$desktop-manage-git-lifecycle`、`.harness/version-state.json`、common-dir 生命周期清单和发布上下文的事实来源入口以及持久策略决策入口；不得把已由事实源或 Skill 承载的实现细节复制进去。

## 完成要求

报告初始化表单的最终字段、用户输入的项目路径、解析后的唯一目标根目录、源根目录、复制和排除的文件、身份与历史重置、写入前 `gate.git.status/version/change`、最终 Git 版本与独立边界、有效作者身份及每个字段的 scope/origin/source/derivation、是否只写 repo-local、提交模板本地配置与检查结果、六项固定策略值（单列 `user_owned_tasks` 与 `task_worktrees`）和待首次发布选择的 `post_release_action: pending`、可选的 Harness 溯源锁或未来必须执行的初始基线审计、基线提交、干净状态、是否拒绝过超范围产品输入（不得复述或保存其具体内容）、源 Harness 验证结果以及下一个 Skill。中性脚手架可以先于产品批准建立，但不是已验收产品。

GPUI 初始化完成时完整保留 `$desktop-manage-gpui-dependencies`、`$desktop-optimize-gpui-performance` 和中性 `docs/GUI_ENGINEERING.md`；Tauri 与非 GUI 裁掉这些专属知识，不遗留失效链接。Linux GPUI 打包保留环境 Skill 的 linux-gpui-dependencies.sh 与回归，按需调用，不自动安装或放开未实现的桌面能力。

非 GPUI 初始化裁剪上述两项 Skill 和索引时，同步移除 AGENTS、README、ENGINEERING_RULES、RUST_CLI_TEMPLATE 中指向它们的路由及链接；保留 Tauri/非 GUI 原有入口。

## 顶层 NSH 初始化分派

NSH：下一代全平台开发框架，是与 CLI、MCP、DESKTOP 平级的单独接口。表单只问 desktop/mobile/web/tui 能力，并自动派生对应的完整系统平台集合；TUI 使用固定官方 main 预览 revision，正式 0.4.0 或不匹配运行时失败关闭。NSH 使用 `$desktop-add-nsh-adapter`，先读其运行时引用；新工程采用 Mixed TSX 界面调用共享 Rust core。仅 desktop 子目标复用九字段桌面 profile，固定支持多窗口，托盘、自启、单实例、深链接按表单逐项询问，深链接要求单实例；系统通知与 OS 全局快捷键仍须明确 disabled，关于/赞助/侧栏按选择询问。TUI 派生 macOS/Windows/Linux 终端目标，不询问桌面 profile；mobile 派生 Android/iOS，web 派生 Web，不混用其他接口。

中性 core 建立后运行 add-only helper；纯净工程回归可调用初始化器 `scripts/create_nsh_workspace.mjs`（仅源专用 wrapper，不能代替完整实例化的复制/重置/策略/Git 收尾）。选择 NSH desktop 时复用选定 Logo；工程临时夹具标记中性。运行非空 Rust workspace、所选目标的 NSH check/test（TUI 走固定预览包装器）与 `$desktop-test-nsh-initialization-e2e` 后才裁剪：保留 NSH adapter/build，仅 desktop 保留共享支持页资产，删除 Tauri/Mantine/GPUI 专属 Skills；保留全部通用生命周期、版本、发布、制品收集与升级规则。删除初始化器及本次 NSH 初始化 E2E，改写地图与失效引用，再创建独立 main 唯一基线。不得把 NSH runner 的临时嵌套 workspace 当产品根。

未选 TUI 的 NSH 项目在首次发布前可选择 local_package；含 TUI 时只能选择 `push_release_branch`，当前 TUI 支持本地预览运行、测试及受管本机预览归档，正式候选仍失败关闭。`$desktop-build-nsh-release` 分目标构建，签名/移动设备/目标宿主仍是独立事实。不生成 Tauri 配置、前端或 GPUI Kit，不使用两者的初始化 E2E。初始化完成的终端下游不得保留 create_nsh_workspace 或继续派生。
