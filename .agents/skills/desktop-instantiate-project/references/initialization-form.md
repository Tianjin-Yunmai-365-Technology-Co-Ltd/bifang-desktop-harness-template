# 下游项目初始化表单

本文件是两个初始化入口共用的交互合同。固定问句、选项和字段顺序只在 [initialization_questions.mjs](../scripts/initialization_questions.mjs) 维护；下一问、默认触发、组合校验和汇总摘要只由只读 [initialization_form.mjs](../scripts/initialization_form.mjs) 计算。README、Skill 和 `agents/openai.yaml` 只路由到这里，不再各自定义问询流程。已有项目的持久策略语义仍以 [Agent Policy](../../../../docs/AGENT_POLICY.md) 为准。

收到创建请求后先完成表单，再验证 Harness、安装环境或写入目标。用户已明确给出的合法字段直接复用，不重问。不同模型必须使用同一目录和解析器，不自行改写选项含义、调整顺序、扩大默认值或增加表单字段。

## 运行方式与状态

首次提问前读取完整合同，并运行只读目录命令：

```text
node .agents/skills/desktop-instantiate-project/scripts/initialization_form.mjs --catalog
```

每次收到用户回复后，把**允许的字段**归一化为下述 JSON，调用 `evaluateInitializationForm(input)`，或通过标准输入调用同一 CLI（不传 `--catalog`）。不把原始整段用户消息、产品内容、远程地址或凭据写进 JSON，不创建会话文件。使用工具的结构化字符串/标准输入传输；不得把用户文本拼进 shell 命令。JSON 只在当前聊天内维护，解析器不写文件、不安装工具、不创建 Git 状态。

规范输入示例（不是一次真实创建结果）：

```json
{
  "schemaVersion": 1,
  "entry": "instantiate",
  "harnessRoot": "/absolute/harness-root",
  "answers": {
    "name_zh": { "value": "示例工具", "source": "user:本次创建请求" },
    "name_en": { "value": "Example Tool", "source": "translation:由本次中文名翻译", "basedOn": "示例工具" },
    "interfaces": { "value": ["cli"], "source": "user:本轮选择" }
  }
}
```

- `entry` 为 `instantiate` 时由 `harnessRoot` 和路径 helper 解析新目标。`entry` 为 `initialize` 时必须提供已核实的绝对 `currentRoot`，它就是既定路径，不再询问路径，也不追加项目标识；显式提供另一项目路径会失败，Harness 源也不能直接初始化。
- `answers` 只保存用户已答字段和已确认项目事实。每项必须包含 `value` 与真实 `source`，前缀仅可为 `user:`、`project:`；只有双语名称允许 `translation:`。不得把源模板的值标成目标项目已确认事实。
- 实例化名称至少一个来自用户；直接初始化已有项目可以复用此前确认的项目名称。名称空白等同未提供；只有一个名称时，解析器返回 `translation`，Agent 自动翻译并补齐来源，不增加译名问题；翻译答案必须附 `basedOn` 原名，原名变化后解析器要求重译。两个都已提供时不改译。专有名词可采用音译、常见译名或保留原文，译名最终由用户确认。
- 枚举只使用 catalog 的 `values`；平台/接口为数组，输出按 catalog 固定顺序去重。自然语言和数字答案必须明确绑定当前题目后才能归一化；多题回复中的裸“1/默认/是”无法唯一对应字段时，只追问歧义字段，不猜测，也不向其他字段传播。
- 缺字段表示尚未答复，继续等待；**无新消息、遗漏答案、等待超时均不算默认或批准**。用户对当前字段明确“默认/跳过”时才传 `default`/`skip`；明确发送空白答复时才传空字符串。仅 catalog 声明默认值的字段接受默认/跳过；空字符串只用于框架和侧栏。程序类型的默认值为 CLI，但未答复仍待问。`task_worktrees` 推荐关闭，未回答不能视为确认关闭。
- 解析器输出的预设、不可用能力和默认结果不能整包抄回 `answers`；必须保留原始显式答案，否则框架/平台变化后旧派生值可能被误认为用户选择。
- 未知字段、非法状态结构或伪造来源直接报错，不能借完整汇总确认跳过校验。

| 输出 `stage` | Agent 唯一动作 |
|---|---|
| `base` | 一次展示 `questions` 中全部待补/待修正基础项，保留原编号；其余合法基础项不重问。 |
| `translation` | 自动补齐 `translate` 指定名称并重算，不向用户加问。 |
| `framework` / `policy` / `gui` / `assistance` | 本轮只展示返回的一个问题，含原有选项、说明和 `issue`；等待明确答复。 |
| `review` | 展示下文规定的完整汇总，只询问是否按此创建；记录 `summaryDigest`。 |
| `confirmed` | 仅说明当前汇总已有相匹配的显式确认；随后进入既有初始化门禁，不代表初始化成功。 |

问句、选项、说明与错误约束须完整展示；可适配宿主表单排版，不能删减其含义。目录命令失败时停止问询和写入，不临时另写一套表单。

## 首轮基础问题模板

从 catalog 的 `number = 1..9` 取原文，首次一次列出全部尚未解析的基础字段。中英文至少已有一个时不再向用户索要另一名称；直接初始化只因当前根已知而省略路径，**不得遗漏项目标识或负责人**。推荐预设问题须连同六项具体行为说明展示，不能只给“推荐/自定义”两个无解释标签。

用户一次给多字段时全部解析；基础缺失或非法集中修正，基础字段合法后才进入条件阶段。GUI 发布后动作在框架未解时可以暂待适用性校验，必须先进入框架单问，不能提前把 Linux GUI 判为不可本地打包而卡住。

## 字段阶段与顺序

唯一顺序由 catalog 与解析器执行：基础字段 → 缺失译名补齐 → GUI 框架 → 自定义六项策略 → GUI 九项配置 → 已启用桌面能力配置协助 → 路径检查与完整汇总 → 显式确认。路径安全属于基础校验，汇总和写入前会再次复核。

问题的技术字段依次为 `name_zh`、`name_en`、`project_id`、`project_path`、`owner`、`target_platforms`、`interfaces`、`policy_mode`、`post_release_action`；GUI 框架为 `gui_framework`。原文框架选项固定包含 `1. Tauri（默认）` 与 `2. GPUI`，写入 Cargo 的键仍为 `gui-framework`；非 GUI 不询问、不持久化框架。

推荐预设明确选择一次后由解析器展开六项。它不是额外持久字段；自定义按 `POLICY_FIELDS` 顺序逐项解析。推荐预设与用户主动给出的六项有冲突时，只追问策略模式：保留预设并撤回冲突值，或改为自定义并保留明确答案；不得静默覆盖。Agent Policy 的 `pending` 不构成确认，项目 Task、Task 独立工作树、内部并行各自独立。

发布后动作始终独立展示 `local_package`（本地打包，推荐默认）和 `push_release_branch`（提交远程）。纯 TUI/MCP 或不含 CLI 的仅 Linux Tauri GUI 时仍展示本地打包但标为不可用；纯 TUI/MCP 或不含 CLI 的仅 Linux Tauri GUI 必须为 `push_release_branch`。本地打包适用性由 `localPackageAvailability` 唯一计算；Linux GPUI 支持本地打包，不能在框架解析前套用 Tauri 限制。默认值须明确选择，初始化不执行发布后动作。

GUI 九项按 `GUI_FIELDS` 顺序解析并写入唯一 `gui-initialization-config`，框架不进入 profile。GPUI 的 `deep_link` 固定 `unavailable`/`disabled`；目标含 Linux 时 `system_tray`、`global_shortcut` 同样不可用。未提供这些不可用项时由能力限制派生关闭；用户显式启用必须纠正或修改框架/目标，不能静默关闭。其余 GUI 能力无默认开关，不从预设或漏答推断。

Tauri `deep_link = enabled` 必须同时 `single_instance = enabled`；冲突只请求用户明确修正，不自动开启单实例。全局快捷键中性合同为空动作、零默认键位、零 OS 注册，产品动作在下游确认。用户对 `sidebar_mode` 明确默认、跳过或空白答复才使用 `detailed`；未答继续等待，非法值重新询问。

九项完成后，两种 GUI 都仅汇总共同五项桌面能力中已启用项，并询问一次 `capability_setup_assistance`；全禁用跳过，已有合法回答复用。该移交意愿不加入九字段或 Agent Policy。具体配置由 Tauri 对应能力 Skill 或 GPUI [原生能力合同](../../desktop-add-gpui-adapter/references/native-capabilities.md) 在终端下游根目录继续，不能用最终创建确认代替此问题。

用户修改早先字段后重算全部状态，只重问当前缺失或变为非法的字段；明确移除 GUI 时撤下其旧条件答案，再计算非 GUI 汇总。翻译的原名改变时重译另一名称，不能复用旧译名。任何变化都会使旧汇总确认失效。

## 目标路径解析

实例化复用只读路径 helper，不另实现近似规则：

```text
node .agents/skills/desktop-instantiate-project/scripts/resolve_project_target.mjs --harness-root "<harness-root>" --project-path "<user-project-path>" --project-id "<project-id>"
```

输入末级名称与项目标识区分大小写地精确相等时使用输入路径，否则追加项目标识。相对输入以 Harness 根为基准；解析器拒绝 Harness 根及祖先、最终符号链接、非目录和非空最终目录。父目录可以非空，目标在 Harness 内时复制前仍须冻结源清单。helper 的 `targetRoot` 是唯一后续目标，不得在复制阶段重新猜测路径。路径错误先用 helper 查看诊断，保留用户文件，不创建目录来试探。

## 完整汇总与完成条件

`review` 时完整展示 `summary` 的双语名及来源、项目标识和 kebab 前缀、原始路径输入和唯一 `targetRoot`、负责人、平台/接口、框架和不可用能力、六项策略值及来源/有效行为、发布后动作、GUI 九项和配置移交意愿。完整展示解析器返回的 `summary.notices` 和 `reviewQuestion`，不能自行删减固定基线、框架打包边界、深链 URL、快捷键零注册或 Logo 执行阶段提示；这些提示与最终确认问句同样纳入摘要。模型只调整排版，不另造一份提示文案。

只有用户明确确认**最新完整汇总**后，才在输入中增加 `confirmation: { "digest": "<本次 summaryDigest>", "source": "user:<实际确认来源>" }` 再重算。未经用户答复不能自填确认。确认摘要不匹配返回 `review`；不允许靠 `confirmed: true`、预设选择、旧会话同意或超时绕过。解析器即使返回 `confirmed`，也不授权新增范围或跳过环境、路径复核、Logo 选择、脚手架检查和独立基线提交门禁。

所有适用值必须合法，无 `pending`；路径检查成功，最新汇总已确认后表单才完成。首次写入前须再次运行同一解析器复核目录仍安全、摘要仍匹配；变更则重新汇总。中性脚手架完成和候选可用仍分别由各自真实验证决定。

## 输入边界

Harness 源只接收本表固定初始化字段与所选路径精确要求的身份选择。产品目的、输入/输出、业务规则、成功标准、产品页面/文案/数据、风险、副作用、远程地址、凭据、反馈/发布渠道、产物格式和自定义发布要求不属于表单。即使同时提供，也不得解析、记录、复制或实施；只说明超出模板阶段，要求完成实例化并切换到唯一 `targetRoot` 后通过 `$desktop-define-product` 重新提出，不复述或保存具体内容。
