---
name: desktop-instantiate-project
description: 在用户提供的目标目录中创建干净的下游项目，包括安全检查、选择性复制规则、强制初始化独立 Git 仓库，以及移交给中性 Rust 初始化流程。
---

# 实例化项目

创建一个继承 Harness 长期规则、但不继承 Harness 项目身份、按日期保存的项目记忆、批准结论、验证声明或 Git 历史的下游仓库。

## 工作流程

1. 读取源项目的 `AGENTS.md`、`README.md`、`Version.md`、`docs/AGENT_POLICY.md`、`docs/ENGINEERING_RULES.md`、`docs/design_standards/README.md`、`docs/RELEASE.md`、两份许可证，以及 `$desktop-rename-project-identity`/`$desktop-initialize-rust-project` 的当前规则。实例化排除日期项目记忆，因此不默认加载 Harness 的历史 Product Status、Work Plan、Verification、ADR 或 Changelog 正文。
2. 确认下游项目展示名称、跨平台安全的 ASCII `snake_case` 项目标识、确定性派生的小写 kebab-case 前缀、完整目标项目目录路径、负责人和目标平台。目标目录是必填项。若用户尚未给出目标项目策略，先只选择“推荐预设”或“自定义”：推荐预设须显式确认并展开为 `superpowers: disabled`、`parallel_worktree_subagents: enabled`、`milestone_smoke: enabled`、`milestone_e2e: disabled`；其中 Superpowers 默认关闭，只有自定义选择明确启用时才可使用，`milestone_e2e` 只作为以后构建询问时的建议默认值。自定义只询问目标用户尚未明确提供的字段，每项至多一次。Harness 源字段值不是下游确认，不得据此跳过选择；也不得静默采用预设或遗留 `pending`。记录真实确认来源和最终收齐日期。产品目的、核心输入/输出、成功标准、风险、副作用和接口选择可以继续保持未确定。
3. 当 Python 3 可用时，在源项目根目录运行 Harness 验证命令；否则记录为 `Not run`（可选 Python 不可用）。随后在写入任何内容之前运行 `git --version`。Git 是阻断性前置条件，并且必须支持 `git init --initial-branch=main`。不得隐式安装或升级 Git；Git 缺失或不兼容时，必须携带观察到的失败停止执行。
4. 将当前 Harness 根目录和用户提供的目标目录解析为明确的绝对路径。相对目标路径必须相对于当前 Harness 根目录解析。解析后的目标目录基本名称必须等于 `<project-id>`。拒绝以 Harness 根目录自身、Harness 根目录的任何祖先目录，以及通过符号链接解析到任何禁止位置的路径作为目标。除这些限制外，目标可以位于 Harness 根目录内部或外部。
5. 写入前清点解析后的目标目录。目标必须不存在或为空，包括不存在任何隐藏条目；必须保留用户文件，并在发生任何冲突时停止。绝不为了让现有仓库看起来像模板而删除、合并写入或覆盖它。
6. 在创建或填充目标目录之前，对受维护的源文件列表生成快照；随后只复制该固定文件列表，不得再次递归遍历源目录，以免将 Harness 复制到其内部目标时发生递归。排除目标目录自身、其他下游项目、源 `.git`、构建输出、缓存、临时文件、`dist/`、本地工具状态、生成的证据，以及仅属于 Harness 的根目录 `Version.md`；初始化后的 Rust 下游项目从根 `Cargo.toml` 获取版本事实。还必须完整排除 `docs/adr/`、`docs/changelog/`、`docs/product_spec/`、`docs/work_plan/`、`docs/VERIFICATION.md`、`docs/verification/` 和 `.agents/skills/desktop-curate-harness-memory/`：实例化期间不得复制其索引、日期文件、历史验证正文或该 Skill 本身，也不得创建空白替代目录或文件。`desktop-curate-harness-memory` 只治理 Harness 自身的历史条目，下游没有可迁移的历史，不得保留或独立重建。保留 `.gitignore`、长期规范性文档、完整 `docs/design_standards/`、项目 Skills、这些 Skills 有意保留的资产（包括 `.agents/skills/desktop-initialize-rust-project/assets/gui/macos-dmg-background.png`），以及根目录的两份许可证文件 `LICENSE.zh-CN.md` 和 `LICENSE.en.md`。设计标准属于身份中立的工程规则；产品像素偏离记录在下游 GUI profile/ADR，不直接修改受管目录。初次传输时必须逐字节复制两份许可证文件；身份重置期间不得替换、削弱、概述或删除其中的法律条款。
7. 先以预览模式调用 `$desktop-rename-project-identity`，随后在整个受维护的目标树中应用复核后的映射。把 Harness 展示名称、snake_case 标识、kebab-case 前缀、示例包前缀、项目自有配置、保留的 Skills，以及根目录两份许可证中的 `Applicable Project Name` 替换为已确认的目标身份。许可证编辑仅限精确的双语项目名称词元；所有其他法律文本必须与复制后的源文件保持字节等价。继续之前必须解决每一个适用的身份残留，并保留 `$desktop-rename-project-identity` 供未来已批准的产品改名使用。
8. 四项策略与确认元数据全部收齐后才一次原子写入 `docs/AGENT_POLICY.md`；必须使用 `schema_version: 1`、`decision_mode: reuse_then_infer_then_ask`、真实的 `confirmed_by`/`confirmed_at`，且不得新增预设字段或存在 `pending`。把产品状态、接口选择、发布记录、技术债和 Harness 溯源重置为真实的下游起始状态，并确认验证历史和人工复核字段没有迁移。不得仅为实例化创建产品规格、工作计划、ADR、变更记录或 `docs/VERIFICATION.md`。
9. 在继承的规范性文档中保留基线约束，但不得把 Harness 的决策日期或批准结论表述为下游负责人作出的决定。重写下游 `AGENTS.md` 和保留的 Skills，使尚未产生的项目记忆目录被视为预期的初始状态，并且仅由各自负责的开发工作流在需要时创建。
10. 一致设置版本事实。仅当继承的基线适用且用户没有批准其他初始版本时使用 `0.1.0`。反馈渠道、发布渠道和产物格式尚未决定时，必须明确保持为未知。
11. 在目标目录中搜索残留的 Harness 身份、历史批准日期、已完成验证声明、源机器绝对路径，以及 `example-tool` 等示例标识。解决每一个适用命中，或者记录其有意保留的原因。两份许可证中的项目名称必须等于已确认的目标展示名称。`Software`、`Licensor`、`Licensee` 和 `Downstream Project` 的通用定义以及所有非身份法律条款都属于有意保留内容，除非具备资格的法律顾问批准替换商业许可证，否则必须保持不变。
12. 将工作目录切换到解析后的目标目录，并运行 `git init --initial-branch=main .`。即使父目录已经是 Git 仓库，此操作也必须执行：下游项目必须拥有独立的嵌套仓库边界。不得复制源历史，也不得创建标签、远端、托管仓库、推送、签名或全局 Git 配置。
13. 在执行任何下游操作之前验证新边界：`git rev-parse --is-inside-work-tree` 必须返回 `true`；`git rev-parse --show-toplevel` 返回的规范化路径必须等于解析后的目标目录；`git symbolic-ref --short HEAD` 必须返回 `main`；`git remote` 必须为空；`git rev-parse --verify HEAD` 必须失败，因为初始化基线提交只有在脚手架和一次性裁剪全部完成后才能创建。把 `git status --porcelain=v1 --untracked-files=all` 的结果记录为最终完成前的预期证据。
14. 不得在经过选择性复制的目标目录中运行模板级 Harness 验证器。验证目标目录清单、排除项、改写后的身份、保留链接和策略模式定义，随后使用 `$desktop-initialize-rust-project` 询问用户选择 `CLI/TUI/MCP/GUI`；验证并复用全部四项已记录策略，不得再次询问预设或各字段。仅当用户未选择任何接口时默认 CLI。若选择 GUI，必须另进行一轮 GUI 配置询问，逐项确定系统托盘、关于页、赞助页、单实例，并提供 `compact`/`detailed` 侧栏模式选择；四项能力必须明确，用户未选择侧栏模式时必须写入 `sidebar_mode = detailed`，显式非法值必须重新确认。把归一化后五项无 `pending` 事实写入 `docs/GUI_APP_PROFILE.md`。
15. 必须要求 `$desktop-initialize-rust-project` 在脚手架检查完成后收尾仓库：选择 GUI 时，由 `$desktop-test-gui-initialization-e2e` 先读取 GUI 配置并条件检查。单实例启用时才验证官方依赖、首插件、回调、两个回归和真实双启动唯一性；托盘启用时才验证 feature、非透明图标、运行时接线、六个回归、双语标签和关闭隐藏/恢复/退出；托盘禁用时必须证明没有 feature/托盘/关闭拦截且关闭最后窗口结束进程。E2E 始终验证所选侧栏模式、默认设置页、全部实际菜单页面，以及关于/赞助入口按选择存在或缺席。任何已选能力无法判定或观察都阻断，未选能力不作为缺证据。随后删除一次性初始化能力、保留开发 Skills/约束地图，并在无 `pending`、Git 干净且无远端时创建恰好一个本地基线提交。

初始化收尾还必须由 `$desktop-manage-version init --project-root .` 创建并核对受保护的 `.harness/version-state.json`，并在裁剪中完整保留该版本 Skill、标准库 helper 和测试；不得把 Harness 时间版本写入下游状态。

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
- 选择 GUI 时，唯一基线提交必须晚于一次成功的配置感知结构检查和 GUI 初始化 E2E。单实例/托盘完整场景只对已选能力执行；未选托盘固定执行关闭最后窗口退出场景；关于/赞助和侧栏模式必须与 `docs/GUI_APP_PROFILE.md` 一致。该本机调试检查不迁移为发布或完整验收结论。
- 生成的仓库必须包含 `LICENSE.zh-CN.md` 和 `LICENSE.en.md`；与源 Harness 相比，只有其中精确的双语 `Applicable Project Name` 可以不同，所有其他法律条款都必须保持不变。初始化裁剪不得删除或进一步修改任一文件。
- 裁剪后，`AGENTS.md` 必须继续保留非空的 Skills/约束地图、`$desktop-upgrade-harness`、`$desktop-manage-version`、`.harness/version-state.json` 保护规则以及持久策略决策规则。

## 完成要求

报告源根目录和目标根目录、复制和排除的文件、身份与历史重置、Git 边界、四项已确认策略值、可选的 Harness 溯源锁或未来必须执行的初始基线审计、基线提交、干净状态、尚未确定的产品事实、源 Harness 验证结果以及下一个 Skill。中性脚手架可以先于产品批准建立，但不是已验收产品。
