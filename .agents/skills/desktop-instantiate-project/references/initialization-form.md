# 下游项目初始化表单

收到创建新下游项目的请求后，先完成本表单，再执行 Harness 验证、环境安装、目录创建、复制、Git 初始化或其他写操作。用户已经在当前请求或后续回复中明确给出的合法字段直接记为已解析，不得重复询问。

## 桌面框架分派

程序类型包含桌面应用(GUI) 时，在其他 GUI 条件问题之前单独询问：“要创建哪种桌面应用？1. Tauri（默认）；2. GPUI”。`gui_framework` 规范化为 `tauri` 或 `gpui`；用户未回答、留空、跳过或选择默认值时取 `tauri`，显式非法值重新询问，已给出合法框架不重问。此默认只补全本字段，不视为用户已经确认其余必填项或最终汇总，也不因等待时间经过而授权写入。非 GUI 时字段为 `不适用`，不得询问或持久化。

框架是独立初始化事实，GUI 选中时写入根 Cargo metadata 的 `gui-framework`，不增减 `gui-initialization-config` 九字段。没有该 metadata 字段的既有 GUI 按 Tauri 兼容，新初始化必须明确写入。

- Tauri 复用本文既有九项 GUI 问询、四项插件基线与各能力合同。
- GPUI 使用 `$desktop-add-gpui-adapter`；按同一九字段顺序逐项询问五项桌面能力、关于页、赞助页和侧栏。仅 `deep_link` 当前 unavailable，必须为 disabled；目标含 Linux 时托盘与后台全局快捷键不可用，显式启用须确认禁用或改变目标，不能静默归一化。系统通知复用 GPUI Kit 官方 API；提交不证明权限或送达，自启只提供 OS 状态开关而不自动注册，单实例只恢复窗口，全局快捷键空合同保持零默认注册。实际技术选型读取 GPUI Skill 的 `references/dependency-baseline.md` 与 `references/native-capabilities.md`。不接入 Tauri 固定插件、React/Mantine 或 Tauri 初始化 E2E。
- `local_package` 适用于接口含 CLI，或 GUI 目标含 macOS/Windows 的组合。Tauri 使用 `$desktop-build-tauri-release`，GPUI 使用独立 `$desktop-build-gpui-release`，后者覆盖本机 macOS `.app`/DMG 与 Windows NSIS；不含 CLI 的仅 Linux GUI 必须明确选择 `push_release_branch`。CLI 与 GUI 组合仍分别生成对应接口的真实产物，不互相冒充。

GUI 的基础发布后动作可以先记录用户选择，框架解析后再完成适用性校验；其余基础字段全部合法后即可进入框架单项问询，不能因动作适用性尚待框架而形成循环。框架改变后只重问不再合法的动作或能力，不重问已解析的合法字段。最终汇总必须单列框架、来源、能力可用性、所用模板/E2E 与本地打包边界；以下提到的 Tauri 固定基线和深链提示只在 Tauri 路径适用，全局快捷键空合同边界适用于两种 GUI。

## 用户规则优先

先读取用户级 `AGENTS.md`，用户已确认的长期硬规则优先于项目偏好。模板默认和推荐预设保持原值；已有下游既有偏好及确认元数据原样保留。自定义模式直接复用本项目已明确的 Task 选择，不重复询问；汇总分别列出项目值、确认来源与有效执行行为，不启用未授权的其他能力。生成的启动入口必须保留用户规则优先、项目默认关闭、启用时绑定/非 pinned/主动恢复及显式阶段隔离指针。

## 交互规则

- 维护字段状态：`待首轮询问`、`待条件询问`、`待校验`、`已解析`、`不适用`。中文项目展示名称、英文项目展示名称、`project_id`、项目路径、负责人、目标平台、程序类型、Agent 策略模式和发布后动作是固定基础字段；首次问询必须用一份清晰编号的表单，一次列出其中全部尚未解析字段，不得拆成逐字段多轮，也不得用“请提供初始化所需信息”这种无字段提示代替。
- 中英文项目展示名称至少由用户直接提供一个。只提供中文时，Agent 在本轮解析中自动翻译并补齐英文；只提供英文时自动翻译并补齐中文，不为译名增加单独问询。原名称含难以直译的专有名词、品牌词或造词时，补齐的另一语言名称允许采用音译、约定俗成译名或保留原文形式，不强求逐字语义翻译，只要在目标语言中可读、不产生歧义即可。两个名称都由用户提供时保持原值，不自行改译；两个都未提供时在首轮同时询问。自动翻译得到的名称必须标记来源，并与用户原始名称一起进入最终完整汇总；用户对汇总的确认同时构成对译名的确认，确认前仍不得写入。
- 首轮回复后先校验全部基础字段。若其中有缺失或非法值，只集中列出仍需修正的基础字段、各自约束和原值问题；已经合法的基础字段继续复用，不得重问。除GUI发布后动作的框架适用性可暂待校验外，基础字段全部解析前不得进入条件问询。
- `user_owned_tasks` 与 `parallel_worktree_subagents` 是两项独立事实：前者决定是否按结果边界自动创建左侧 user-owned Task，后者只决定当前 Task 内部能否按明确请求并行拆分。不得用其中一项回答、推断或覆盖另一项。
- `post_release_action` 是独立于 Agent 策略预设的必选事实，提供“本地打包”(`local_package`，推荐默认) 与“提交远程”(`push_release_branch`) 两项。表单始终展示本地打包默认项；不含 CLI 的组合若为纯 TUI/MCP 或仅 Linux GUI，须标为不可用，因为现有本地候选打包 Skill 只覆盖 CLI 或 macOS/Windows GUI，并明确要求用户选择 `push_release_branch`。用户明确选择默认值时，仅在已选接口包含 CLI，或包含 GUI 且目标平台含 macOS/Windows 时解析为 `local_package`；其余组合的“使用默认值”或显式本地打包都是非法基础字段，必须说明原因并重新确认提交远程。没有答复不能静默填入默认值。它只规定未来 Git 发布完成后的动作，不在初始化时执行打包、建立 release 分支或访问远端。
- 基础字段解析后（GUI 发布后动作的框架适用性可暂待校验），先完成桌面框架分派，再按实际选择逐步补全条件字段：选择自定义策略时依次解析六项策略，Tauri 依次解析八项能力和侧栏模式，GPUI 依次解析五项桌面能力、关于页、赞助页和侧栏，深链接标为 unavailable/disabled，托盘与热键按目标平台处理。每次回复只询问一个当前适用且尚未解析的条件字段；推荐预设或非 GUI 使相应字段直接成为 `不适用`，不得制造多余问询。
- 用户主动一次提供多个字段时全部解析并记录来源；合法字段不得为了遵守顺序而重问。字段非法时只说明该字段的约束并重新询问同一项。
- 所有必填和条件字段收齐后，展示一份完整汇总，其中必须包含中英文项目展示名称及各自来源、用户输入的项目路径、解析后的最终项目根目录、派生的 kebab-case 前缀、目标平台、程序类型、GUI 框架及其来源、六项 Agent 策略、已确认的 `post_release_action` 及适用的 GUI 九项配置；并说明目标平台、接口与适用的 `gui-framework` 将在根 `Cargo.toml` 的 `[workspace.metadata.agent-first-harness]` 中持久保存，发布后动作将在 `docs/AGENT_POLICY.md` 中持久保存，供未来发布流程使用。Tauri GUI 汇总同时说明 system-locale、updater、window-state、dialog 是不询问且不进入九字段 profile 的固定基线，dialog 以主窗口 `dialog:default` 开放全部官方对话框类型但不授权通用文件读写；深链启用时展示派生 URL `app-<kebab-prefix>://restore`；全局快捷键启用时明确说明只安装 Rust-only 能力，初始化 contract 为 `actions = []`，不绑定默认 chord、不注册 OS 键位、不创建产品动作或占位界面。GPUI 汇总列出实际六项能力选择、深链接 unavailable/disabled、平台限制、按需依赖、配置协助移交，以及 Rust/gpui-kit 模板、本机初始化检查和当前本地候选打包边界，不宣称具有 Tauri 固定插件。本轮只询问是否按该汇总创建。
- 五项桌面能力选完后、最终创建汇总前，必须询问是否帮助配置已选能力，复用已有回答且跳过禁用项；没有启用项则跳过。Harness 源只确认中性行为与移交意愿，具体通知事件、键位、额外菜单等产品内容在实例化完成并切换到唯一终端下游根目录后询问和实施；不能用最终创建确认代替配置问询。Tauri 使用对应能力 Skill，GPUI 使用 `references/native-capabilities.md` 的逐项问题。
- 在用户确认完整汇总前，只允许读取规则、检查已有路径和运行只读解析；不得创建目录、复制文件、安装环境、初始化 Git 或修改任何文件。
- 当前 Harness 源只接收创建终端下游所必需的本表字段，以及所选 GUI 初始化路径精确要求的身份选择；`post_release_action` 只记录两种固定工程流程中的一项。不接收产品目的、核心输入/输出、业务规则、成功标准、风险、副作用、产品专属页面/文案/数据、远程地址、凭据、反馈渠道、产品发布渠道、产物格式或自定义发布需求。即使用户主动提供，也不得把这些内容解析为表单字段、写入 Harness 源、复制到中性脚手架或提前实现；只说明它们已超出当前模板阶段，并要求初始化完成、工作目录切换到 helper 返回的唯一 `targetRoot` 后，再通过 `$desktop-define-product` 重新提出。

## 首轮基础问题模板

首次问询只列出用户尚未明确提供的基础字段，并保持以下编号和约束可见：

1. 中文项目展示名称：面向中文用户显示；中英文至少提供一个，缺少另一个时自动翻译。
2. 英文项目展示名称：面向英文用户显示；中英文至少提供一个，缺少另一个时自动翻译。
3. `project_id`：ASCII `snake_case` 标识。
4. 项目路径：最终项目根目录或父目录。
5. 负责人：真实负责人或明确的责任主体。
6. 目标平台：Windows、macOS、Linux，可多选。
7. 程序类型：命令行(CLI) / 终端UI(TUI) / MCP / 桌面应用(GUI)，可多选；可明确选择默认 CLI。
8. Agent 策略模式：推荐预设或自定义。
9. 发布后动作：本地打包（`local_package`，推荐默认）或提交远程（`push_release_branch`）；纯 TUI/MCP 或不含 CLI 的仅 Linux GUI 时仍展示本地打包但标为不可用，须明确选择提交远程；只有接口含 CLI，或 GUI 目标含 macOS/Windows 时明确答复“使用默认值”才表示选择本地打包。

用户已在创建请求中合法提供的基础字段不再显示；其余基础字段必须在这一轮全部显示。

## 字段阶段与顺序

| 顺序 | 阶段 | 字段 | 解析规则 |
|---|---|---|---|
| 1 | 首轮基础 | 中文项目展示名称 | 中英文至少一个由用户直接提供；只缺中文时由 Agent 从英文自动翻译，记录为自动翻译并等待最终汇总确认。 |
| 2 | 首轮基础 | 英文项目展示名称 | 中英文至少一个由用户直接提供；只缺英文时由 Agent 从中文自动翻译，记录为自动翻译并等待最终汇总确认。 |
| 3 | 首轮基础 | `project_id` | 必填；必须匹配 ASCII `snake_case`：`^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$`。可以提供建议值，但必须由用户确认。 |
| 4 | 首轮基础 | 项目路径 | 必填；允许输入最终项目根目录或其父目录，允许绝对路径或相对 Harness 根目录的路径。按“目标路径解析”计算最终项目根目录。 |
| 5 | 首轮基础 | 负责人 | 必填；记录真实负责人或用户明确指定的责任主体。 |
| 6 | 首轮基础 | 目标平台 | 必填；从 Windows、macOS、Linux 中选择一个或多个，不推断未选择的平台已经验证。 |
| 7 | 首轮基础 | 程序类型 | 从命令行(CLI)、终端UI(TUI)、MCP、桌面应用(GUI) 中选择任意组合；分别映射为内部标识 `CLI`、`TUI`、`MCP`、`GUI`，继续持久化到 Cargo `interfaces`。用户明确选择“使用默认值”或明确跳过时解析为仅 CLI；选择其他接口时不得附加 CLI。 |
| 8 | 首轮基础 | Agent 策略模式 | 必须选择“推荐预设”或“自定义”。不得从 Harness 源策略推断用户选择。 |
| 9 | 首轮基础 | `post_release_action` | 必须从 `local_package`（本地打包，推荐默认）或 `push_release_branch`（提交远程）中明确选择；纯 TUI/MCP 或不含 CLI 的仅 Linux GUI 时本地打包不可用，须明确选择提交远程；只有接口含 CLI，或含 GUI 且目标平台含 macOS/Windows 时明确选用默认值才取 `local_package`，不得从 Harness 源 `pending` 或未答复推断选择。 |
| 10 | 条件补全 | `gui_framework` | 仅 GUI；先询问 1. Tauri（默认）/ 2. GPUI。未答、留空、跳过或默认取 `tauri`，合法答案复用，非法值重问；写入 Cargo `gui-framework`，与九字段 profile 分开，再复核发布后动作。 |
| 11 | 条件补全 | `user_owned_tasks` | 仅自定义策略；复用用户对本项目已明确的 Task 选择，不重问；其余逐项选择 `enabled` 或 `disabled`，推荐和默认均为 `disabled`。启用表示按结果边界自动创建左侧 user-owned Task；关闭时不自动创建；用户明确单次创建不改变永久选择。 |
| 12 | 条件补全 | `task_worktrees` | 仅自定义策略；询问“是否为 Git 左侧 Task 使用独立工作树”，推荐关闭。明确合法答案直接复用；未回答不能视为确认关闭，不从 Task Tree、自动 Task 或内部并行推断。 |
| 13 | 条件补全 | `superpowers` | 仅自定义策略；逐项选择 `enabled` 或 `disabled`。 |
| 14 | 条件补全 | `parallel_worktree_subagents` | 仅自定义策略；逐项选择 `enabled` 或 `disabled`；此项只控制当前 Task 内部 `codex/unit-*` Worktree 与写入型 Subagent，与 `task_worktrees` 独立。 |
| 15 | 条件补全 | `acceptance_smoke` | 仅自定义策略；逐项选择 `enabled` 或 `disabled`。 |
| 16 | 条件补全 | `e2e_hint` | 仅自定义策略；逐项选择 `enabled` 或 `disabled`，并说明它只是在以后每次发布候选构建询问时的建议默认值，不适用于本地开发试包。 |
| 17 | 条件补全 | `system_tray` | 两种 GUI 均询问；GPUI 目标含 Linux 时 unavailable/disabled；逐项选择 `enabled` 或 `disabled`。 |
| 18 | 条件补全 | `system_notification` | 两种 GUI 均询问；询问是否安装系统通知能力并在设置页提供默认关闭的开关，逐项选择 `enabled` 或 `disabled`。 |
| 19 | 条件补全 | `autostart` | 两种 GUI 均询问；询问是否安装开机自启能力并在设置页提供实际 OS 状态开关，默认不注册，逐项选择 `enabled` 或 `disabled`；选择能力不表示替用户注册登录项。 |
| 20 | 条件补全 | `about_page` | 仅选择 GUI 时必填；逐项选择 `enabled` 或 `disabled`。 |
| 21 | 条件补全 | `sponsor_page` | 仅选择 GUI 时必填；逐项选择 `enabled` 或 `disabled`。 |
| 22 | 条件补全 | `single_instance` | 两种 GUI 均询问；逐项选择 `enabled` 或 `disabled`。 |
| 23 | 条件补全 | `deep_link` | 仅 Tauri GUI 时询问；GPUI 为 unavailable/disabled；`enabled` 表示启用身份派生的 `app-<kebab-prefix>://restore`，只恢复主窗口，并强制 `single_instance = enabled`。若单实例已禁用，必须请用户在“启用两者”与“保持两者禁用”之间修正，不得生成无效组合。 |
| 24 | 条件补全 | `global_shortcut` | 两种 GUI 均询问；GPUI 目标含 Linux 时 unavailable/disabled；`enabled` 表示安装 Rust-only 全局快捷键能力，并在中性 profile 写入空 `gui-global-shortcut-contract`，初始不绑定 chord、不注册 OS 键位，也不推断动作或界面；`disabled` 时 contract、依赖、插件及全部专属实现缺席。产品动作、固定/可编辑策略与初始 chord 只能在终端下游由明确需求决定。 |
| 25 | 条件补全 | `sidebar_mode` | 仅选择 GUI 时询问 `compact` 或 `detailed`；用户明确留空、跳过或选择默认值时解析为 `detailed`，显式非法值必须重新询问。 |

推荐预设一次确认后确定性物化为：

```yaml
user_owned_tasks: disabled
task_worktrees: disabled
superpowers: disabled
parallel_worktree_subagents: disabled
acceptance_smoke: enabled
e2e_hint: disabled
```

推荐预设包含以上全部六项；选择自定义时逐项确认，不能从 Harness 源当前值推断用户选择。最终汇总需说明 `parallel_worktree_subagents: disabled` 只关闭当前 Task 内部并行；`user_owned_tasks` 的自动创建开关与用户明确新建的侧边 Task 独立。
发布后动作不属于这六项预设；无论选择推荐预设还是自定义，都必须单独确认 `post_release_action`。

最终汇总列出六项项目值、确认来源与有效行为。`task_worktrees` 默认关闭；仅开启后调用 `$desktop-manage-task-worktrees`。初始化不创建 Task Worktree；即使关闭，也完整保留该技能与地图，供以后手动启用。

## 目标路径解析

收齐 `project_id` 与项目路径后，运行只读 helper：

```text
node .agents/skills/desktop-instantiate-project/scripts/resolve_project_target.mjs --harness-root "<harness-root>" --project-path "<user-project-path>" --project-id "<project-id>"
```

解析规则固定如下：

1. 相对项目路径以当前 Harness 根目录为基准转为绝对路径，并规范化 `.`、`..` 与已存在的符号链接祖先。
2. 规范化输入路径的最后一个名称与 `project_id` **区分大小写地精确相等**时，最终项目根目录就是该输入路径。
3. 最后一个名称不精确相等时，最终项目根目录为 `<项目路径>/<project_id>`。不得用大小写、连字符/下划线转换、前后缀或相似度把不同名称视为相同；例如 `sample-tool` 与 `sample_tool` 不相等，结果为 `sample-tool/sample_tool`。
4. “不存在或为空”只约束最终项目根目录；作为父目录输入的项目路径可以已经存在并包含其他项目或文件。最终根目录若为符号链接、非目录或非空目录，必须停止且不得覆盖。
5. 最终项目根目录不得是 Harness 根目录或其任何祖先。通过已存在符号链接解析后再次执行同一检查；目标位于 Harness 内部时仍须在复制前冻结源文件清单并排除目标，以阻止递归复制。
6. helper 输出的 `targetRoot` 是后续复制、Git 初始化、开发、验证、构建和发布准备唯一使用的规范化项目根目录。完成表单汇总时同时显示原始输入与该值。

## 完成条件

只有以下事实同时成立，表单才算完成：

- 所有必填字段均为 `已解析`，所有条件字段均为 `已解析` 或 `不适用`；
- 中英文项目展示名称都为非空已解析值，且至少一个来自用户直接输入；自动翻译的另一名称已列入完整汇总；
- 推荐预设或六项自定义策略已全部解析，六项最终策略均无 `pending`；
- `post_release_action` 已由用户明确选择；若选用默认值，须确认接口含 CLI，或含 GUI 且目标平台含 macOS/Windows。最终值只能是 `local_package` 或 `push_release_branch`，且已列入完整汇总；纯 TUI/MCP 或不含 CLI 的仅 Linux GUI 必须为 `push_release_branch`，写入前再次交叉校验接口组合与动作；
- GUI 被选择时八项能力与侧栏模式已全部解析，无 `pending`；
- GUI 框架已解析为 `tauri` 或 `gpui`，来源已进入汇总，非 GUI 时该字段不适用；GPUI 深链接为 unavailable/disabled，其余八项已经确认且托盘/热键符合平台范围，已完成所选五项能力的配置协助询问或合法跳过，且未调用 Tauri 专属基线；
- 最终发布后动作已按框架复核：GPUI 的 macOS/Windows GUI 本地包使用 `$desktop-build-gpui-release`；不含 CLI 的仅 Linux GUI 必须明确选 `push_release_branch`，CLI 与 GUI 组合按各自打包 Skill 执行；
- Tauri GUI 中 `deep_link = enabled` 时 `single_instance = enabled`，派生 restore URL 已进入最终汇总；两种 GUI 中 `global_shortcut = enabled` 时空 action contract、零默认 chord、零 OS 注册边界已进入最终汇总；
- 路径 helper 成功，最终项目根目录通过空目录、路径类型和禁止位置检查；
- 用户已经确认包含最终项目根目录的完整汇总。
- 完整汇总只含本表允许的 Harness 初始化事实；任何同时提供的产品业务需求都已明确拒绝并延后到终端下游，不存在被静默保存或实施的内容。
