---
name: desktop-instantiate-project
description: 只收集 Harness 创建终端下游所需的固定初始化信息，拒绝产品业务需求；表单确认后先门禁 Git，完成中性脚手架后再建立独立仓库与 local 身份。
---

# 实例化项目

创建一个继承 Harness 长期规则、但不继承 Harness 项目身份、按日期保存的项目记忆、批准结论、验证声明或 Git 历史的下游仓库。

## 工作流程

1. 读取源项目的 `AGENTS.md`、`README.md`、`Version.md`、`docs/AGENT_POLICY.md`、`docs/ENGINEERING_RULES.md`、`docs/design_standards/README.md`、`docs/RELEASE.md`、两份许可证，以及 `$desktop-rename-project-identity`/`$desktop-initialize-rust-project` 的当前规则。收到任何创建新下游项目的请求时，还必须先完整读取并执行 [`references/initialization-form.md`](references/initialization-form.md)。实例化排除日期项目记忆，因此不默认加载 Harness 的历史 Product Status、Work Plan、Verification、ADR 或 Changelog 正文。
2. 在任何写入或环境安装前完成初始化表单。首轮一次询问全部尚未解析的基础字段：中文项目展示名称、英文项目展示名称、跨平台安全的 ASCII `snake_case` 项目标识、项目路径、负责人、目标平台、接口组合和 Agent 策略模式；必须使用清晰编号，不能拆成逐字段多轮，也不能用一次模糊问询代替。中英文名称至少一个由用户直接提供；只提供其中一个时，Agent 自动翻译并补齐另一个，不增加独立问询，把译名及其来源放入最终汇总等待确认；两个都由用户提供时不得自行改译。用户已明确提供的合法字段直接复用；首轮回复中缺失或非法的基础字段集中列出约束后补齐，不重问合法字段。基础字段全部解析后，才按实际选择逐步补全其他问题：自定义策略的四项值和 GUI 的八项能力与侧栏模式每轮只询问一个当前适用的条件字段。小写 kebab-case 前缀由项目标识确定性派生。深链启用时强制单实例启用并派生 `app-<kebab-prefix>://restore`；全局快捷键启用只批准 Rust-only 能力，中性初始化写空 action contract，不绑定 chord、不注册键位、不推断产品动作。所有字段收齐后展示包含中英文名称、各自来源、最终项目根目录、GUI 固定基线及上述派生/空绑定边界的完整汇总，并在用户确认前禁止创建目录、复制、安装环境、初始化 Git 或修改文件。推荐预设须显式确认并展开为 `superpowers: disabled`、`parallel_worktree_subagents: enabled`、`milestone_smoke: enabled`、`milestone_e2e: disabled`。Harness 源字段值不是下游确认，不得静默采用预设或遗留 `pending`。记录真实确认来源和最终收齐日期。产品目的、核心输入/输出、业务规则、成功标准、风险、副作用、产品专属页面/文案/数据、远程地址、凭据和发布需求不属于 Harness 源初始化输入；即使用户同时提供，也不得接收、分析、记录到源仓库、复制到脚手架或提前实现，只能明确说明这些需求要在初始化完成并切换到唯一终端下游根目录后，通过 `$desktop-define-product` 重新提出。
3. 当 Python 3 可用时，在源项目根目录运行 Harness 验证命令；否则记录为 `Not run`（可选 Python 不可用）。本阶段只验证 Harness 源，不执行 Git 可用性、版本、身份、提交模板或仓库配置检查，也不安装、升级或初始化 Git。完整表单汇总确认后，由 `$desktop-initialize-rust-project` 在任何脚手架写入前调用环境门禁检查 Git，缺失时按受管路线安装并复探；仓库初始化、作者身份与模板仍统一推迟到全部脚手架和一次性裁剪完成、下一步将实际创建基线提交时即时执行。
4. 收齐项目标识和项目路径后，运行只读 `scripts/resolve_project_target.py`。相对输入以当前 Harness 根目录为基准；规范化输入路径的最后一个名称与 `<project-id>` 区分大小写地精确相等时，最终项目根目录就是输入路径，否则固定为 `<项目路径>/<project-id>`。不得用大小写、连字符/下划线转换、前后缀或相似度把不同名称视为相同。helper 输出的 `targetRoot` 必须显示在完整表单汇总中，并在用户确认后成为唯一项目根目录。拒绝以 Harness 根目录自身、Harness 根目录的任何祖先目录，以及通过符号链接解析到任何禁止位置的路径作为最终项目根目录。除这些限制外，目标可以位于 Harness 根目录内部或外部。
5. 写入前清点解析后的最终项目根目录。只有最终项目根目录必须不存在或为空，包括不存在任何隐藏条目；当用户输入的是父目录时，该父目录可以存在且非空。必须保留用户文件，并在最终目标为符号链接、非目录、非空或发生任何冲突时停止。绝不为了让现有仓库看起来像模板而删除、合并写入或覆盖它。
6. 在创建或填充目标目录之前，对受维护的源文件列表生成快照；随后只复制该固定文件列表，不得再次递归遍历源目录，以免将 Harness 复制到其内部目标时发生递归。排除目标目录自身、其他下游项目、源 `.git`、构建输出、缓存、临时文件、`dist/`、本地工具状态、生成的证据，以及仅属于 Harness 的根目录 `Version.md`；初始化后的 Rust 下游项目从根 `Cargo.toml` 获取版本事实。还必须完整排除 `docs/adr/`、`docs/changelog/`、`docs/product_spec/`、`docs/work_plan/`、`docs/VERIFICATION.md`、`docs/verification/` 和 `.agents/skills/desktop-curate-harness-memory/`：实例化期间不得复制其索引、日期文件、历史验证正文或该 Skill 本身，也不得创建空白替代目录或文件。`desktop-curate-harness-memory` 只治理 Harness 自身的历史条目，下游没有可迁移的历史，不得保留或独立重建。保留 `.gitignore`、长期规范性文档、完整 `docs/design_standards/`、项目 Skills、这些 Skills 有意保留的资产（包括 `.agents/skills/desktop-initialize-rust-project/assets/gui/macos-dmg-background.png`），以及根目录的两份许可证文件 `LICENSE.zh-CN.md` 和 `LICENSE.en.md`。设计标准属于身份中立的工程规则；产品像素偏离记录在下游 GUI profile/ADR，不直接修改受管目录。初次传输时必须逐字节复制两份许可证文件；身份重置期间不得替换、削弱、概述或删除其中的法律条款。
7. 先以预览模式调用 `$desktop-rename-project-identity`，随后在整个受维护的目标树中应用复核后的映射。向脚本同时传入已确认的中英文展示名称，把 Harness 的两种展示名称、snake_case 标识、kebab-case 前缀、示例包前缀、项目自有配置和保留 Skills 替换为目标身份；`LICENSE.zh-CN.md` 的 `适用项目名称` 精确使用中文名称，`LICENSE.en.md` 的 `Applicable Project Name` 精确使用英文名称；同理，按 locale 拆分的双语 GUI 资源文件（如 `i18n/zh-CN.json`、`rust-i18n/zh-CN.yml` 及其 `en-US` 对应文件）中，凡以字面文本写入项目展示名称的位置，`zh-CN` 文件使用中文名称、`en-US` 文件使用英文名称；运行时以单一 `applicationName` 变量注入并跟随界面语言切换的位置不在本条替换范围内。许可证编辑仅限精确的项目名称词元；所有其他法律文本必须与复制后的源文件保持字节等价。继续之前必须解决每一个适用的身份残留，并保留 `$desktop-rename-project-identity` 供未来已批准的产品改名使用。
8. 四项策略与确认元数据全部收齐后才一次原子写入 `docs/AGENT_POLICY.md`；必须使用 `schema_version: 1`、`decision_mode: reuse_then_infer_then_ask`、真实的 `confirmed_by`/`confirmed_at`，且不得新增预设字段或存在 `pending`。把产品状态、接口选择、发布记录、技术债和 Harness 溯源重置为真实的下游起始状态，并确认验证历史和人工复核字段没有迁移。不得仅为实例化创建产品规格、工作计划、ADR、变更记录或 `docs/VERIFICATION.md`。
9. 在继承的规范性文档中保留基线约束，但不得把 Harness 的决策日期或批准结论表述为下游负责人作出的决定。把下游 `AGENTS.md` 重写为轻量启动路由器：保留范围门禁、按任务渐进读取、跨任务摘要、非空 Skills/约束地图和最小闭环，任务专属初始化、GUI、构建与发布细节只链接到保留的唯一事实源和精确 Skill，不得复制回根入口；UTF-8 字节数不得超过 20,000，行数不得超过 120。尚未产生的项目记忆目录是预期初始状态，仅由各自工作流按事件创建。必须完整保留 `docs/AGENT_POLICY.md` 的左侧 Task 描述模板及“精确保存项目/`projectId` + `SETUP_PENDING` 有界返回 + 一项结果 + 独立 Worktree + `codex/task-*` 分支 + 可审查提交”约定，同时保留 Task 内部 `codex/unit-*` Subagent 分层，并让重写后的 `AGENTS.md` 继续把它作为 Task 创建、交付、协调方整合和清理的入口。
10. 一致设置版本事实。仅当继承的基线适用且用户没有批准其他初始版本时使用 `0.1.0`。反馈渠道、发布渠道和产物格式尚未决定时，必须明确保持为未知。
11. 在目标目录中搜索残留的 Harness 中英文身份、历史批准日期、已完成验证声明、源机器绝对路径，以及 `example-tool` 等示例标识。解决每一个适用命中，或者记录其有意保留的原因。中文许可证中的项目名称必须等于已确认的中文名称，英文许可证中的项目名称必须等于已确认的英文名称；README 的身份摘要也必须同时列出这两个名称。`Software`、`Licensor`、`Licensee` 和 `Downstream Project` 的通用定义以及所有非身份法律条款都属于有意保留内容，除非具备资格的法律顾问批准替换商业许可证，否则必须保持不变。
12. 不得在经过选择性复制的目标目录中运行模板级 Harness 验证器。验证目标目录清单、排除项、改写后的身份、保留链接和策略模式定义，随后把初始化表单中已确认的 `CLI/TUI/MCP/GUI` 接口组合交给 `$desktop-initialize-rust-project`；验证并复用全部四项已记录策略，不得再次询问预设、策略或接口。用户在表单中明确选择默认接口时使用 CLI，选择其他接口时不得附加 CLI。若选择 GUI，复用表单在基础字段解析后按需逐项确认的系统托盘、系统通知、开机自启、关于页、赞助页、单实例、深链接、全局快捷键和 `compact`/`detailed` 侧栏模式，不得在复制后重新发起一轮问询；八项能力必须明确，用户跳过侧栏模式时必须已归一化为 `sidebar_mode = detailed`，显式非法值必须在表单阶段重新确认。`deep_link = enabled` 必须同时满足 `single_instance = enabled`；派生 restore URL 与全局快捷键启用时的空 action/零默认绑定边界必须已在汇总确认。把归一化后九项无 `pending` 事实按 `system_tray`、`system_notification`、`autostart`、`about_page`、`sponsor_page`、`single_instance`、`deep_link`、`global_shortcut`、`sidebar_mode` 的固定顺序写入 `docs/GUI_APP_PROFILE.md`；全局快捷键启用时另写唯一空 `gui-global-shortcut-contract`，禁用时不得写该块。
13. 必须要求 `$desktop-initialize-rust-project` 在完整表单确认后、脚手架写入前保存 `$desktop-check-development-environment` 返回的 `gate.git.status/version/change`；选择 GUI 时，由 `$desktop-test-gui-initialization-e2e` 在脚手架检查完成后先读取 GUI 配置并条件检查。system-locale、updater、window-state、dialog 四项固定基线始终验证版本/member 继承、唯一插件注册、locale、`NotConfigured` 零出站、安全窗口恢复，以及主窗口 `dialog:default` 与无 fs 授权；dialog 固定在 window-state 后、notification 前。单实例、托盘、系统通知、开机自启、深链接与全局快捷键只在启用时执行各自结构/宿主场景；深链接同时验证单实例 feature、身份派生 restore URL 与冷/热事件，中性全局快捷键验证 contract 唯一、动作数组为空、启动零注册、无占位 UI 与 owned 清理。托盘禁用时必须证明没有 feature/托盘/关闭拦截且关闭最后窗口结束进程；开机自启、window-state 与全局快捷键在 E2E 后恢复执行前状态。E2E 始终验证所选侧栏模式、设置页、全部实际菜单页面，以及关于/赞助入口按选择存在或缺席。除只能由 macOS 已打包应用证明的静态 scheme 系统注册外，任何已选能力无法判定或观察都阻断；该例外仍须通过解析器/宿主事件并留下候选补验边界，未选能力不作为缺证据。全部检查和一次性裁剪完成、下一步确实将创建唯一基线提交时，才复探 Git、建立并验证独立仓库边界，使用 `$desktop-configure-git-commits` 先报告身份；已有有效身份原样保留，缺失字段由 Agent 提供的单一 ASCII 英文设备 username 派生同名 `user.name` 与 Gmail 并只写 repo-local，随后检查身份、安装和检查仓库本地提交模板。已有无效身份、无法安全翻译/归一化设备名、identity/template 检查失败都阻断；无 `pending`、Git 干净且无远端时创建恰好一个本地基线提交。不得提前初始化仓库或设置身份/模板，不得修改全局 Git 配置，也不得修改 system Git 配置。

初始化收尾还必须由 `$desktop-manage-version init --project-root .` 创建并核对受保护的 `.harness/version-state.json`，并在裁剪中完整保留该版本 Skill、标准库 helper 和测试；不得把 Harness 时间版本写入下游状态。

## 重置不变量

- 绝不得把 Harness 中的 `Approved` 产品状态、人工复核人身份、验证结论、源码提交、校验和、发布日期或平台结果带入新的下游项目。
- 绝不得迁移或预创建 `docs/adr/`、`docs/changelog/`、`docs/product_spec/`、`docs/work_plan/`、`docs/VERIFICATION.md` 或 `docs/verification/`；这些内容只在各自事件触发条件满足时由负责的开发 Skill 创建。
- 绝不得声称示例资产产生的 Windows、macOS 或 Linux 证据属于下游产品。
- 绝不得复制源 `.git` 目录或伪造历史。必须始终在解析后的目标根目录创建新的独立仓库。
- 绝不得代替用户选择项目路径输入。只能按已确认表单中的确定性规则解析最终项目根目录：末级名称与项目标识精确相等时直接使用，否则追加项目标识；解析结果必须在首次写入前展示并确认。
- 绝不得把 Harness 根目录或其任何祖先目录作为最终目标，不得覆盖非空最终目录，也不得跟随符号链接进入禁止位置。父目录输入可以非空；安全门禁始终应用于解析后的最终项目根目录。
- 完成移交后，必须把解析后的目标目录同时视为唯一项目根目录和 Git 顶层目录。不得继承父级 Git 边界，也不得在其他位置创建第二份项目树。
- 初始化请求仅授权在脚手架验证和裁剪成功后创建恰好一个本地基线提交。该请求不授权创建远端、推送、标签、发布、签名密钥、全局 Git 配置变更或托管仓库。
- Git 可用性与版本只允许在完整表单确认后、脚手架写入前的初始化环境门禁检查；缺失时受管安装并复探。独立边界、作者身份和提交模板仍只允许紧邻真实基线提交检查或设置；复制、身份改写、脚手架编写和测试均不得以未来会提交为由提前初始化仓库或写 Git 配置。
- 必须保留共享核心、已选接口、中文业务注释、文档、测试、验证、例外和人工复核规则，除非下游负责人批准并记录例外。
- 必须执行 `docs/AGENT_POLICY.md` 中全部四项策略值。后续工作必须复用这些值，并且仅在策略缺失/非法、需求冲突或无法判断适用性时询问。
- 生成的仓库是终端项目：不得保留 `$desktop-instantiate-project`、`$desktop-initialize-rust-project` 或任何其他活动的项目派生入口。
- 选择 GUI 时，唯一基线提交必须晚于一次成功的配置感知结构检查和 GUI 初始化 E2E。四项固定插件基线始终验证；单实例、托盘、系统通知、开机自启、深链接与全局快捷键完整场景只对已选能力执行；未选托盘固定执行关闭最后窗口退出场景；开机自启、window-state 和快捷键 E2E 必须恢复原状态；关于/赞助和侧栏模式必须与 `docs/GUI_APP_PROFILE.md` 一致。该本机调试检查不迁移为发布或完整验收结论，macOS 静态 scheme 的最终系统注册仍由已打包候选补验。
- 生成的仓库必须包含 `LICENSE.zh-CN.md` 和 `LICENSE.en.md`；与源 Harness 相比，只有其中精确的双语 `Applicable Project Name` 可以不同，所有其他法律条款都必须保持不变。初始化裁剪不得删除或进一步修改任一文件。
- 裁剪后，`AGENTS.md` 必须继续保留轻量渐进读取结构、非空的 Skills/约束地图、`$desktop-upgrade-harness`、`$desktop-manage-version`、`.harness/version-state.json` 保护规则以及持久策略决策入口；不得把已由事实源或 Skill 承载的实现细节复制进去。

## 完成要求

报告初始化表单的最终字段、用户输入的项目路径、解析后的唯一目标根目录、源根目录、复制和排除的文件、身份与历史重置、写入前 `gate.git.status/version/change`、最终 Git 版本与独立边界、有效作者身份及每个字段的 scope/origin/source/derivation、是否只写 repo-local、提交模板本地配置与检查结果、四项已确认策略值、可选的 Harness 溯源锁或未来必须执行的初始基线审计、基线提交、干净状态、是否拒绝过超范围产品输入（不得复述或保存其具体内容）、源 Harness 验证结果以及下一个 Skill。中性脚手架可以先于产品批准建立，但不是已验收产品。
