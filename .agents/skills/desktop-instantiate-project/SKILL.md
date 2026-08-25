---
name: desktop-instantiate-project
description: 在用户提供的目标目录中创建干净的下游项目，包括安全检查、选择性复制规则、强制初始化独立 Git 仓库，以及移交给中性 Rust 初始化流程。
---

# 实例化项目

创建一个继承 Harness 长期规则、但不继承 Harness 项目身份、按日期保存的项目记忆、批准结论、验证声明或 Git 历史的下游仓库。

## 工作流程

1. 读取源项目的 `AGENTS.md`、`README.md`、`Version.md`、`docs/AGENT_POLICY.md`、`docs/ENGINEERING_RULES.md`、`docs/RELEASE.md`、两份许可证，以及 `$desktop-rename-project-identity`/`$desktop-initialize-rust-project` 的当前规则。实例化排除日期项目记忆，因此不默认加载 Harness 的历史 Product Status、Work Plan、Verification、ADR 或 Changelog 正文。
2. 确认下游项目展示名称、跨平台安全的 ASCII `snake_case` 项目标识、确定性派生的小写 kebab-case 前缀、完整目标项目目录路径、负责人和目标平台。目标目录是必填项。若用户尚未给出目标项目策略，先只选择“推荐预设”或“自定义”：推荐预设须显式确认并展开为 `superpowers: disabled`、`parallel_worktree_subagents: enabled`、`milestone_smoke: enabled`、`milestone_e2e: disabled`；其中 Superpowers 默认关闭，只有自定义选择明确启用时才可使用，`milestone_e2e` 只作为以后构建询问时的建议默认值。自定义只询问目标用户尚未明确提供的字段，每项至多一次。Harness 源字段值不是下游确认，不得据此跳过选择；也不得静默采用预设或遗留 `pending`。记录真实确认来源和最终收齐日期。产品目的、核心输入/输出、成功标准、风险、副作用和接口选择可以继续保持未确定。
3. 当 Python 3 可用时，在源项目根目录运行 Harness 验证命令；否则记录为 `Not run`（可选 Python 不可用）。随后在写入任何内容之前运行 `git --version`。Git 是阻断性前置条件，并且必须支持 `git init --initial-branch=main`。不得隐式安装或升级 Git；Git 缺失或不兼容时，必须携带观察到的失败停止执行。
4. 将当前 Harness 根目录和用户提供的目标目录解析为明确的绝对路径。相对目标路径必须相对于当前 Harness 根目录解析。解析后的目标目录基本名称必须等于 `<project-id>`。拒绝以 Harness 根目录自身、Harness 根目录的任何祖先目录，以及通过符号链接解析到任何禁止位置的路径作为目标。除这些限制外，目标可以位于 Harness 根目录内部或外部。
5. 写入前清点解析后的目标目录。目标必须不存在或为空，包括不存在任何隐藏条目；必须保留用户文件，并在发生任何冲突时停止。绝不为了让现有仓库看起来像模板而删除、合并写入或覆盖它。
6. 在创建或填充目标目录之前，对受维护的源文件列表生成快照；随后只复制该固定文件列表，不得再次递归遍历源目录，以免将 Harness 复制到其内部目标时发生递归。排除目标目录自身、其他下游项目、源 `.git`、构建输出、缓存、临时文件、`dist/`、本地工具状态、生成的证据，以及仅属于 Harness 的根目录 `Version.md`；初始化后的 Rust 下游项目从根 `Cargo.toml` 获取版本事实。还必须完整排除 `docs/adr/`、`docs/changelog/`、`docs/product_spec/`、`docs/work_plan/`、`docs/VERIFICATION.md` 和 `docs/verification/`：实例化期间不得复制其索引、日期文件或历史验证正文，也不得创建空白替代目录或文件。保留 `.gitignore`、长期规范性文档、项目 Skills、这些 Skills 有意保留的资产（包括 `.agents/skills/desktop-initialize-rust-project/assets/gui/macos-dmg-background.png`），以及根目录的两份许可证文件 `LICENSE.zh-CN.md` 和 `LICENSE.en.md`。初次传输时必须逐字节复制两份许可证文件；身份重置期间不得替换、削弱、概述或删除其中的法律条款。
7. 先以预览模式调用 `$desktop-rename-project-identity`，随后在整个受维护的目标树中应用复核后的映射。把 Harness 展示名称、snake_case 标识、kebab-case 前缀、示例包前缀、项目自有配置、保留的 Skills，以及根目录两份许可证中的 `Applicable Project Name` 替换为已确认的目标身份。许可证编辑仅限精确的双语项目名称词元；所有其他法律文本必须与复制后的源文件保持字节等价。继续之前必须解决每一个适用的身份残留，并保留 `$desktop-rename-project-identity` 供未来已批准的产品改名使用。
8. 四项策略与确认元数据全部收齐后才一次原子写入 `docs/AGENT_POLICY.md`；必须使用 `schema_version: 1`、`decision_mode: reuse_then_infer_then_ask`、真实的 `confirmed_by`/`confirmed_at`，且不得新增预设字段或存在 `pending`。把产品状态、接口选择、发布记录、技术债和 Harness 溯源重置为真实的下游起始状态，并确认验证历史和人工复核字段没有迁移。不得仅为实例化创建产品规格、工作计划、ADR、变更记录或 `docs/VERIFICATION.md`。
9. 在继承的规范性文档中保留基线约束，但不得把 Harness 的决策日期或批准结论表述为下游负责人作出的决定。重写下游 `AGENTS.md` 和保留的 Skills，使尚未产生的项目记忆目录被视为预期的初始状态，并且仅由各自负责的开发工作流在需要时创建。
10. 一致设置版本事实。仅当继承的基线适用且用户没有批准其他初始版本时使用 `0.1.0`。反馈渠道、发布渠道和产物格式尚未决定时，必须明确保持为未知。
11. 在目标目录中搜索残留的 Harness 身份、历史批准日期、已完成验证声明、源机器绝对路径，以及 `example-tool` 等示例标识。解决每一个适用命中，或者记录其有意保留的原因。两份许可证中的项目名称必须等于已确认的目标展示名称。`Software`、`Licensor`、`Licensee` 和 `Downstream Project` 的通用定义以及所有非身份法律条款都属于有意保留内容，除非具备资格的法律顾问批准替换商业许可证，否则必须保持不变。
12. 将工作目录切换到解析后的目标目录，并运行 `git init --initial-branch=main .`。即使父目录已经是 Git 仓库，此操作也必须执行：下游项目必须拥有独立的嵌套仓库边界。不得复制源历史，也不得创建标签、远端、托管仓库、推送、签名或全局 Git 配置。
13. 在执行任何下游操作之前验证新边界：`git rev-parse --is-inside-work-tree` 必须返回 `true`；`git rev-parse --show-toplevel` 返回的规范化路径必须等于解析后的目标目录；`git symbolic-ref --short HEAD` 必须返回 `main`；`git remote` 必须为空；`git rev-parse --verify HEAD` 必须失败，因为初始化基线提交只有在脚手架和一次性裁剪全部完成后才能创建。把 `git status --porcelain=v1 --untracked-files=all` 的结果记录为最终完成前的预期证据。
14. 不得在经过选择性复制的目标目录中运行模板级 Harness 验证器。验证目标目录清单、排除项、改写后的身份、保留链接和策略模式定义，随后使用 `$desktop-initialize-rust-project` 询问用户选择 `CLI/TUI/MCP/GUI`；验证并复用全部四项已记录策略，不得再次询问预设或各字段。仅当用户未选择任何接口时默认 CLI，并在 Product Spec 尚不存在时创建中性工作区。
15. 必须要求 `$desktop-initialize-rust-project` 在脚手架检查完成后收尾仓库：选择 GUI 时，先由 `$desktop-test-gui-initialization-e2e` 运行固定单实例/托盘结构检查器，验证非透明 `icons/32x32.png`/配置引用、`.setup`/Menu/icon/build/窗口事件真实接线、`rust-i18n` 标签解析和八个有断言的固定回归，再构建并双启动真实本机 Tauri 调试二进制；除验证 `136px` 单态侧栏的 `56px` Logo、`30px` 图标、图标上/`11px` `10em` 文字下且居中、默认设置页无隐私/统计区块和所有渲染菜单页面可达外，还必须验证第二次启动自行退出、既有主进程与同一主窗口继续存在并被恢复聚焦、只剩一个长期应用主进程和一个主窗口，以及状态栏/通知区域存在可见非空托盘图形、中文菜单精确为“显示窗口/退出”、英文精确为“Show Window/Quit”、运行时切换无需重启且无 `tray.*` 原始键、原生关闭只隐藏且进程继续、托盘左键和本地化显示项都能恢复并聚焦、本地化退出项结束进程并移除图标。缺少图标资产/配置引用/运行时接线、依赖/实现、首插件顺序、回归、资源或真实宿主证据，或者当前宿主无法判定进程/窗口唯一性、只能定位空白点击区域或无法观察托盘，均阻断收尾，不能降级。随后删除实例化、初始化和 GUI 初始化 E2E Skills、模板专用验证器/方法论文档以及活动初始化指令；保留 `$desktop-rename-project-identity`、`$desktop-check-development-environment`、`$desktop-upgrade-harness`、`$desktop-run-parallel-worktrees` 和仍适用的开发 Skills。在 `AGENTS.md` 中保留非空的 Skills/约束地图以及持久策略语义。如果本工作流能够取得精确渲染后的保留工程层候选以及源版本/提交，则使用 `$desktop-upgrade-harness record --bootstrap` 创建 `.harness/upstream-lock.json`；否则必须保持该文件不存在，并记录首次升级需要初始基线审计，不得伪造溯源。验证没有残留派生路径或策略 `pending`，创建恰好一个本地基线提交，并在进入 `$desktop-define-product` 前要求 Git 简洁状态为空。

## 重置不变量

- 绝不得把 Harness 中的 `Approved` 产品状态、人工复核人身份、验证结论、源码提交、校验和、发布日期或平台结果带入新的下游项目。
- 绝不得迁移或预创建 `docs/adr/`、`docs/changelog/`、`docs/product_spec/`、`docs/work_plan/`、`docs/VERIFICATION.md` 或 `docs/verification/`；这些内容只在各自事件触发条件满足时由负责的开发 Skill 创建。
- 绝不得声称示例资产产生的 Windows、macOS 或 Linux 证据属于下游产品。
- 绝不得复制源 `.git` 目录或伪造历史。必须始终在解析后的目标根目录创建新的独立仓库。
- 绝不得代替用户选择或派生目标位置。只有在解析并验证用户提供的目标路径后，才能向该路径写入。
- 绝不得把 Harness 根目录或其任何祖先目录作为目标，不得覆盖非空目录，不得接受基本名称与项目标识不同的目标，也不得跟随符号链接进入禁止位置。
- 完成移交后，必须把解析后的目标目录同时视为唯一项目根目录和 Git 顶层目录。不得继承父级 Git 边界，也不得在其他位置创建第二份项目树。
- 初始化请求仅授权在脚手架验证和裁剪成功后创建恰好一个本地基线提交。该请求不授权创建远端、推送、标签、发布、签名密钥、全局 Git 配置变更或托管仓库。
- 必须保留共享核心、已选接口、中文业务注释、文档、测试、验证、例外和人工复核规则，除非下游负责人批准并记录例外。
- 必须执行 `docs/AGENT_POLICY.md` 中全部四项策略值。后续工作必须复用这些值，并且仅在策略缺失/非法、需求冲突或无法判断适用性时询问。
- 生成的仓库是终端项目：不得保留 `$desktop-instantiate-project`、`$desktop-initialize-rust-project` 或任何其他活动的项目派生入口。
- 选择 GUI 时，唯一基线提交必须晚于一次成功的单实例/托盘结构检查和 GUI 初始化 E2E；结构检查必须锁定非透明 32px RGBA 图标/配置引用与运行时接线，后者必须包含同一真实二进制双启动、第二次启动退出并唤醒同一主窗口、单一长期应用主进程/主窗口，以及真实系统托盘的可见非空图形、精确菜单、关闭隐藏、两种恢复与退出生命周期，宿主无法判定、只能定位空白点击区域或无法观察也必须阻断。该本机调试检查不迁移为发布或完整验收结论。
- 生成的仓库必须包含 `LICENSE.zh-CN.md` 和 `LICENSE.en.md`；与源 Harness 相比，只有其中精确的双语 `Applicable Project Name` 可以不同，所有其他法律条款都必须保持不变。初始化裁剪不得删除或进一步修改任一文件。
- 裁剪后，`AGENTS.md` 必须继续保留非空的 Skills/约束地图、`$desktop-upgrade-harness` 以及持久策略决策规则。

## 完成要求

报告源根目录和目标根目录、复制和排除的文件、身份与历史重置、Git 边界、四项已确认策略值、可选的 Harness 溯源锁或未来必须执行的初始基线审计、基线提交、干净状态、尚未确定的产品事实、源 Harness 验证结果以及下一个 Skill。中性脚手架可以先于产品批准建立，但不是已验收产品。
