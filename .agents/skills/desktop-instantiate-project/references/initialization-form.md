# 下游项目初始化表单

本文件是两个初始化入口共用的交互合同。固定问句、选项和字段顺序只在 [initialization_questions.mjs](../scripts/initialization_questions.mjs) 维护；下一问、默认触发、组合校验和汇总摘要只由只读 [initialization_form.mjs](../scripts/initialization_form.mjs) 计算。README、Skill 和 `agents/openai.yaml` 只路由到这里，不再各自定义问询流程。已有项目的持久策略语义仍以 [Agent Policy](../../../../docs/AGENT_POLICY.md) 为准。

收到创建请求后先完成表单，再验证 Harness、安装环境或写入目标。用户已明确给出的合法非平台字段直接复用，不重问。CLI/MCP/DESKTOP 默认声明 Windows/macOS/Linux 全平台；NSH 的具体平台由能力选择派生。旧表单的平台答案只作为兼容输入被忽略，不参与任何汇总。不同模型必须使用同一目录和解析器，不自行改写选项含义、调整顺序、扩大默认值或增加表单字段。

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
- 枚举只使用 catalog 的 `values`；接口和 NSH 能力为数组，输出按 catalog 固定顺序去重。用户已在消息中明确给出的多个合法字段可一并复用；自然语言和数字答案必须明确绑定对应题目后才能归一化，裸“1/默认/是”有歧义时只重问当前字段。
- 缺字段表示尚未答复，继续等待；**无新消息、遗漏答案、等待超时均不算默认或批准**。用户对当前字段明确“默认/跳过”时才传 `default`/`skip`；明确发送空白答复时才传空字符串。仅 catalog 声明默认值的字段接受默认/跳过，名称题例外：点击“改用英文名/改用中文名”写入来源为 `user:` 的 `skip`，使下一轮询问另一语言；切换回原语言时先撤下该语言原有的 `skip`，两种名称都跳过时必须重新询问，不能继续。空字符串只用于框架和侧栏。程序类型的默认值为 CLI，但未答复仍待问。六项 Agent 策略由固定初始化默认值派生，不作为表单问题或答案。
- 解析器输出的预设、不可用能力、目标平台和默认结果不能整包抄回 `answers`；必须保留原始显式答案，否则框架或能力变化后旧派生值可能被误认为用户选择。旧版 `target_platforms` 答案可留在输入以便恢复会话，但不再产生问题，也不影响结果；新表单不得主动收集该字段。
- 未知字段、非法状态结构或伪造来源直接报错，不能借完整汇总确认跳过校验。

| 输出 `stage` | Agent 唯一动作 |
|---|---|
| `base` | 只展示 `questions` 中当前一个待补/待修正基础项，保留原编号；其余合法基础项不重问。 |
| `translation` | 自动补齐 `translate` 指定名称并重算，不向用户加问。 |
| `nsh` / `gui` / `assistance` | 本轮只展示返回的一个问题，含原有选项、说明和 `issue`；等待明确答复。 |
| `review` | 展示下文规定的完整汇总，只询问是否按此创建；记录 `summaryDigest`。 |
| `confirmed` | 仅说明当前汇总已有相匹配的显式确认；随后进入既有初始化门禁，不代表初始化成功。 |

每次只向用户发起当前 `questions` 中的一个字段；`reviewQuestion` 是独立的最终汇总确认。问句、选项、说明与错误约束须完整展示，不能删减其含义。目录命令失败时停止问询和写入，不临时另写一套表单。

### 选项控件与确认

解析器给每题标记 `inputMode`：`text` 为自由文本，`single` 为单选，`multiple` 为多选；`interfaces` 与 `nsh_targets` 必须是 `multiple`。存在宿主交互式问询工具时，文本题使用输入框，单选题使用可点击选项；两道名称题的 `alternateAction` 同时提供可点击的语言切换，不把跳过当成已提供名称。多选题优先在同一复选控件中勾选多项，再由用户点击确认。选项标签与技术值必须逐项对应，不能要求用户自行输入选项编号、名称或 JSON 数组，也不能由 Agent 代替用户确认。

若宿主只有可点击的单选工具而没有复选控件，当前多选题的每个选项依目录顺序分别弹出“选择/不选择”，形成非空集合后再展示已选标签并弹出“确认所选/重新选择”；确认后才把数组写入 `answers` 并请求下一题。这是单选工具的明确回退，不得声称已弹出复选框。没有任何可点击选项工具且用户尚未明确提供答案时，说明当前宿主不能提供所需选择控件并等待可用输入方式，不改用让用户手打枚举值。已明确给出的合法字段直接复用，不为了展示控件而重问。选项提交和最终完整汇总确认都是显式用户动作；未响应、预选项或超时均不是确认。

## 逐项基础问题模板

从 catalog 的 `number = 1..6` 取原文，每轮只问当前一个尚未解析的基础字段，修正非法值时也只重问该字段。空表单先问中文名；只提供英文名时可点击“改用英文名”，下一轮才问英文名。中英文至少已有一个时不再向用户索要另一名称；直接初始化只因当前根已知而省略路径，**不得遗漏项目标识或负责人**。第 6 项程序类型收齐后，NSH 只问 `nsh_targets`；DESKTOP 直接进入桌面配置；纯 CLI/MCP 可进入汇总。任何路径都不再询问系统平台。

用户提前一次给出多个字段时全部解析；只把仍缺失或非法的首个字段交给当前一轮问询，基础字段合法后才进入适用的条件阶段。CLI、MCP 可互相组合，也可与 DESKTOP 组合；NSH 必须单选，与 DESKTOP 及其他接口互斥。

## 字段阶段与顺序

唯一顺序由 catalog 与解析器执行：基础身份及程序类型 → 缺失译名补齐 → NSH 的桌面、移动、Web、TUI 能力（仅 NSH） → 适用的桌面条件问题 → 已启用桌面能力配置协助 → 路径检查与完整汇总 → 显式确认。非 NSH 的全平台默认值和 NSH 的平台映射在汇总前计算。路径安全属于基础校验，汇总和写入前会再次复核。

基础字段顺序依次为 `name_zh`、`name_en`、`project_id`、`project_path`、`owner`、`interfaces`；已确认一个展示名称时，另一个自动翻译并在汇总确认。程序类型选项为 CLI、MCP、DESKTOP（技术值 `gui`）、NSH，NSH 展示说明固定为“下一代全平台开发框架”。CLI/MCP/DESKTOP 的 `target_platforms` 固定派生为 `windows, macos, linux`，来源 `default:all_desktop_platforms`；NSH 只问 `nsh_targets` 并派生平台，不写入 `gui-framework`。DESKTOP 的汇总固定派生 `gui_framework: tauri`（来源 `derived:desktop`），写入 Cargo 的 `gui-framework`。不询问框架；旧表单的合法 Tauri 答案只作兼容输入，其他显式框架值失败关闭。

`nsh_targets` 为可多选的 `desktop`、`mobile`、`web`、`tui`，是 NSH 平台选择的唯一输入。`desktop` 和 `tui` 都派生完整 Windows/macOS/Linux 集合；`mobile` 派生 Android/iOS，`web` 派生 Web。派生的非空 `target_platforms` 与来源 `derived:nsh_targets` 进入完整汇总，确认后才写入 Cargo。若旧一轮已提供显式 `target_platforms`，任何程序类型都忽略旧答案并按当前默认或能力重新计算，不再展示系统平台问题。全部 NSH 依赖使用正式 v0.5.0 固定提交 `f4d68f7f9f31eb7b3ecc8a4cbc31096d5c6238a1` 与匹配 CLI。NSH 当前只支持单独选择，不能与 CLI、MCP 或 DESKTOP 同时实例化。

NSH 的双语展示名要能作为官方包文件名，长度、保留名称和路径字符在汇总前检查。项目标识最多 64 个 ASCII 字符，负责人最多 200 个字符，身份字段首尾不得留空白。

六项 Agent 策略直接由解析器的 `POLICY_PRESET` 固定派生：自动 Task、Task 工作树、superpowers 与内部并行关闭，候选验收冒烟允许，候选 E2E 建议关闭。初始化不问策略模式或六项单独选择，也不把派生值放回 `answers`；完整汇总显示具体值及 `default:initialization` 来源。初始化后的明确变更走 `$desktop-configure-agent-policy`。

初始化将 `post_release_action: pending` 写入 schema 5 策略，完整汇总明确显示首次发布前再选择。`pending` 不影响中性基线；首次发布前由 `$desktop-prepare-release` 调用 `$desktop-switch-post-release-action`，展示本地打包与提交远程并记录用户明确选择。适用性由该发布动作 Skill 按已持久化接口、平台、框架或 NSH 子目标校验；纯 MCP、仅 Linux Tauri GUI 只能选择 `push_release_branch`。未选择时不得启动 Git 发布，也不得暗用本地打包默认值。

DESKTOP 保持原有九项问询。选了 NSH desktop 时按托盘 → 单实例 → 深链接（仅单实例启用时）→ 关于页 → 赞助页 → 侧栏模式询问。单实例关闭时，未回答的深链接派生为关闭。显式冲突只在对应问题纠正。自启、通知和 OS 全局快捷键在中性模板固定关闭，旧启用答案须明确纠正。两条路线仍按原有 `GUI_FIELDS` 顺序写入唯一九字段 `gui-initialization-config`。非桌面 NSH 无这些问题和 Logo。

Tauri 与 NSH desktop 的 `deep_link = enabled` 必须同时 `single_instance = enabled`；冲突只请求用户明确修正，不自动开启单实例。全局快捷键中性合同为空动作、零默认键位、零 OS 注册，产品动作在下游确认。用户对 `sidebar_mode` 明确默认、跳过或空白答复才使用 `detailed`；未答继续等待，非法值重新询问。

适用问题完成后，汇总已启用的宿主能力（NSH 包含深链接），并询问一次 `capability_setup_assistance`；全禁用跳过，已有合法回答复用。该移交意愿不加入九字段或 Agent Policy。具体配置由 Tauri 对应能力 Skill 或 NSH 适用能力合同在终端下游根目录继续，不能用最终创建确认代替此问题。

用户修改早先字段后重算全部状态，只重问当前缺失或变为非法的字段；明确移除 DESKTOP/NSH 或 NSH 桌面目标时撤下其旧条件答案，再计算新汇总。翻译的原名改变时重译另一名称，不能复用旧译名。有效汇总值、来源或合同变化会使旧确认失效；被忽略的旧平台答案变化不改变汇总。

## 目标路径解析

实例化复用只读路径 helper，不另实现近似规则：

```text
node .agents/skills/desktop-instantiate-project/scripts/resolve_project_target.mjs --harness-root "<harness-root>" --project-path "<user-project-path>" --project-id "<project-id>"
```

输入末级名称与项目标识区分大小写地精确相等时使用输入路径，否则追加项目标识。相对输入以 Harness 根为基准；解析器拒绝 Harness 根及祖先、最终符号链接、非目录和非空最终目录。父目录可以非空，目标在 Harness 内时复制前仍须冻结源清单。helper 的 `targetRoot` 是唯一后续目标，不得在复制阶段重新猜测路径。路径错误先用 helper 查看诊断，保留用户文件，不创建目录来试探。

## 完整汇总与完成条件

`review` 时完整展示 `summary` 的双语名及来源、项目标识和 kebab 前缀、原始路径输入和唯一 `targetRoot`、负责人、具体平台/程序类型、适用的框架或 NSH 目标类别、不可用能力、六项固定策略默认值及来源/有效行为、`post_release_action: pending` 与首次发布补选时点、适用的桌面九项和配置移交意愿。非 NSH 的具体平台必须标明全平台默认，NSH 的具体平台必须标明由所选能力派生，并请用户在这一处核对。完整展示解析器返回的 `summary.notices` 和 `reviewQuestion`，通过可点击单选控件确认或修改；不能自行删减固定基线、框架打包边界、深链 URL、快捷键零注册或 Logo 执行阶段提示。这些提示与最终确认问句同样纳入摘要。模型只调整排版，不另造一份提示文案。

只有用户明确确认**最新完整汇总**后，才在输入中增加 `confirmation: { "digest": "<本次 summaryDigest>", "source": "user:<实际确认来源>" }` 再重算。未经用户答复不能自填确认。确认摘要不匹配返回 `review`；不允许靠 `confirmed: true`、预设选择、旧会话同意或超时绕过。解析器即使返回 `confirmed`，也不授权新增范围或跳过环境、路径复核、Logo 选择、脚手架检查和独立基线提交门禁。

除延后的 `post_release_action: pending` 外，所有适用值必须合法且无 `pending`；路径检查成功，最新汇总已确认后表单才完成。首次写入前须再次运行同一解析器复核目录仍安全、摘要仍匹配；变更则重新汇总。中性脚手架完成和候选可用仍分别由各自真实验证决定。

## 输入边界

Harness 源只接收本表固定初始化字段与所选路径精确要求的身份选择。产品目的、输入/输出、业务规则、成功标准、产品页面/文案/数据、风险、副作用、远程地址、凭据、反馈/发布渠道、产物格式和自定义发布要求不属于表单。即使同时提供，也不得解析、记录、复制或实施；只说明超出模板阶段，要求完成实例化并切换到唯一 `targetRoot` 后通过 `$desktop-define-product` 重新提出，不复述或保存具体内容。

NSH 扩展：顶层第四项为 `NSH：下一代全平台开发框架`，下设桌面、移动、Web、TUI；DESKTOP 固定派生 Tauri。仅 desktop 询问九项桌面 profile：官方多窗口固定提供；托盘、单实例、深链接按选择接入，深链接要求单实例；自启、通知与 OS 全局快捷键在中性模板固定关闭。选择 NSH 时，官方 `nsh`、`nsh-design-guides` 随脚手架自动安装到项目 `.agents/skills/`。TUI 无桌面 profile、Logo 或官方打包目标。
