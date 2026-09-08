# 验证记录

## 验证原则

- 只记录真实执行的命令、环境、结果和未覆盖范围。
- 产出物验收以真实可用为准，非 Mock：对产出物给出"完成""可用""已验证"结论必须以真实运行、真实调用产出物本身得到的可观察结果为依据；模拟实现、测试替身、占位页面、中性脚手架、开发预览、仅调用内部函数或仅展示 Mock 数据的结果不得作为验收证据。单元/集成测试仍可对不可控外部依赖使用受控替身，但只能证明代码单元内部正确性（见 ADR-20260806-002）。
- 日常开发只运行本次必要单元/回归测试并在最终回复或 CI 中概括；本索引及证据分卷只长期保存真实渠道发布后的发布事实，或在独立受管 feature 生命周期中执行的回顾性人工复核/长期审计。
- 构建请求、执行和结果，以及候选 E2E、完整验收、`pending` → `accepted` 状态更新和发布就绪复核，都不得创建或更新本索引、`docs/verification/` 或其他受 Git 跟踪的项目记忆；它们必须让当前分支保持 clean 的具名 `Release` 且 `HEAD == sourceCommit`，把全量单元测试、产物、摘要、签名状态、选择、人工签署和可观察结果仅写入忽略的 `release/` 原子候选集合、其 manifest 声明的相邻证据和最终回复。真实渠道发布成功后，发布执行方才从该已发布 `Release` 开始后续受管 feature 生命周期，追加 Verification/发布/Product Status 记录并执行版本周期 finalize；失败、取消、标签、上传尝试、`pending`/`accepted` 或就绪结论都不能触发这些 tracked 写入。独立回顾性人工复核或长期审计也必须使用自己的受管 feature 生命周期，且不得改写活动候选、覆盖历史失败或反向授予其 `accepted`/`ready`。
- 代码行为变化记录本次实际运行的相关非空单元/回归测试；纯文档、元数据、格式或不可合理单测的机械变更记录解析或差异完整性所必需的最小替代检查。
- 完整验收只接受绑定批准场景、源码提交、运行环境和可观察结果的最终真实产物。存在用户要求的活动 Work Plan 时相关 Todo 必须为 `done`；没有 Work Plan 不阻断验收。源码片段、模拟实现、桩、占位、中性脚手架、开发预览和仅内部函数证据不具备验收资格。
- macOS Tauri DMG 的布局证据必须来自对当前最终候选字节的只读挂载检查：非空 Finder `.DS_Store`、本地背景、唯一顶层应用包与 `/Applications` 链接缺一不可；不得只检查源码配置、沿用旧 DMG 证据或自动接受软件许可。任何布局补写、签名、公证、stapling 或重打包都会产生新候选并使旧证据失效。
- 完整验收按 `milestone_smoke` 决定候选冒烟；E2E 只由当前构建的明确选择或产品/渠道硬要求决定，持久 `milestone_e2e` 仅是构建询问时的建议默认值。产品定义、计划、日常开发、单元测试、编译、签名、打包、制品收集和发布元数据命令不得混跑二者。
- 非必要语义审查只读取当前发布 manifest 的 `reviewSelection`，但 manifest 不是选择事实源：候选构建、收集和验收都必须用 `verify-release-review` 证明当前 clean `Release` closing commit 已完成远端/本地收尾，并要求 manifest 的审查、性能及 macOS 签名字段逐字段来自其中原子封存的 `releaseReview`/`candidateSelections`。`enabled` 必须有 `reviewStatus: passed`、结构化 `reviewEvidence` 和等于累计差异终点的 `reviewedSourceCommit`；该提交必须是最终 `sourceCommit` 的祖先，二者之间只允许发布日志、被触发 Changelog 与分支链关闭状态路径。`disabled` 且无硬要求时只接受 `reviewStatus: Not run`、非空原因和剩余风险，并要求 `reviewEvidence`/`reviewedSourceCommit` 缺席。安全、隐私、不可逆操作、对外兼容契约或产品/渠道硬要求不能被关闭；验收阶段不得补问、反转或伪造当次选择。
- 唯一的前候选例外是含 GUI 下游的一次性初始化 E2E：相关非空单元测试通过后，检查器读取固定顺序的九项 profile，始终检查不询问、不进入 profile 的 system-locale/updater/window-state 三项 Rust-only 基线与 dialog 固定 WebView 基线，并对按 profile 启用的 system-tray/system-notifications/autostart/single-instance/deep-link/global-shortcut 检查完整依赖、运行时、资源与非空回归，对禁用能力检查无残留，再构建真实本机调试二进制。dialog 固定检查 root/member/前端依赖、Builder 唯一顺序、主窗口精确 `dialog:default` 以及零额外文件系统授权；同时始终验证系统语言、updater `NotConfigured` 零出站和窗口合法状态重启恢复/无效状态回退。按选择验证单实例、托盘、开机自启恢复、深链接宿主事件和全局快捷键触发/注销；托盘禁用时验证关闭最后窗口退出。系统通知只验证默认关闭的 Switch、失败可见性以及结构回归锁定的串行 worker/权限状态机，不用未签名调试二进制触发真实权限、设置跳转或投递。macOS 需安装包才能证明的通知宿主行为与自定义 scheme 注册在 debug no-bundle 阶段必须标为 `Not verified`。Computer Use 始终验证所选侧栏、设置页、实际菜单页面和未选页面缺席。任一适用场景失败、无法观察或状态无法恢复都会阻断初始化基线提交。
- GUI 发布性能是逐次选择且不受 `milestone_e2e` 影响。选择 `enabled` 或产品/渠道硬要求时，它成为本次发布的硬门禁，只接受绑定 clean HEAD、release profile、候选摘要、目标平台和整个 Tauri/WebView 进程树的真实测量；debug、旧候选、样本不足、只采父进程、无法观察或进程未回收均失败。`wholeProcessTree`、`probeBytesUnmodified`、`allProcessesRecovered` 任一不为 `true` 都进入 `nonWaivableFailures`，禁止 waiver。window-state 持久文件必须先精确快照，每次预热/冷启动前恢复同一隔离基线，并在成功、失败、超时或取消后恢复且复核原字节/原缺席状态；无法恢复同样不可豁免。其他纯指标失败先回开发循环；只有失败证据 `waiverAllowed: true` 时，用户显式继续只能记录 `performanceStatus: waived`，且不能改判为通过。选择 `disabled` 且无硬要求时允许 `performanceStatus: Not run`，必须记录原因和剩余风险，且不得伪造探针、性能证据或运行时绑定；渠道要求下 `Not run` 或 `Unverified` 都不能满足发布条件。
- updater 安装基线与 updater 制品验收必须分别判定：所有 GUI 都要有 Rust-only 官方插件、`UpdateController` 和未配置时 `NotConfigured`/零出站证据；产品/发布事实 `updaterEnabled = false` 只要求 updater archive/`.sig` 完全缺席，`true` 才要求配置、安全签名条件、官方制品和实际验签证据。
- 必需门禁或已启用的冒烟/E2E 失败、超时、取消或未执行时拒绝候选，保存证据并返回开发循环修复；只有用户要求的活动计划存在时才重开或新增 Todo。
- Harness 根目录没有具体下游产品；完整验收针对可执行治理闭环、校验器和维护脚本，不把随附的中性资产当作产品候选。真实下游产品与未运行平台按事实标为 `Unverified`。
- 对代码行为变化，零个相关测试不构成通过；非代码候选可以使用计划中声明的相称替代证据。
- 只对真实运行的系统和工具链给出通过结论；其他平台与宿主标记为 `Unverified`。
- 人工批准不能把失败或未执行的检查改判为通过；发布、不可逆交付或项目/渠道要求的复核只能由人类签署，日常开发不强制人工签名。

- 通知启用时，初始化结构回归必须锁定 macOS 的授权状态查询、仅 `NotDetermined` 时请求、复读、授权后持久化和拒绝/受限/仍未授权时固定 Notifications 系统设置恢复路径；调试 E2E 不污染真实授权，最终安装候选才验证实际设置跳转和失败可见性。`system_notification = enabled` 的 macOS 最终候选必须先证明 `.app` 已按 enabled 路线签名；`disabled/not-requested` 或实际 unsigned 是不可验收的运行前提冲突，不能被 E2E `disabled`、waiver 或 `Unverified` 掩盖，也不能在验收阶段补签。

## 模板验证矩阵

| 层级 | 方法 | 当前要求 |
|---|---|---|
| 文件、链接与行数 | 日常 `python3 scripts/validate_harness.py`；发布审查启用时追加 `--release-review` | 必需固定入口、日期记忆索引/正文和本地 Markdown 链接完整；401–800/501–1000/501–2000 行候选只在已启用发布审查中提示，801/1001/2001 行起始终失败；Rust 拆分使用 `<module>/mod.rs` |
| Skills | 硬契约校验；当次发布审查启用时再做语义审查 | Skills、UI 元数据、参考资料、脚本和资产与事实源一致；独立 WEB Skill 不得存在，`$desktop-upgrade-harness` 必须存在并保留 |
| 持久 Agent 策略 | 模式定义正负向单元测试 + 初始化契约 | 用户显式选择一次推荐预设或自定义；推荐预设默认 `superpowers: disabled`，最终四字段原子写入且不得残留 `pending`；每次构建仍单独解析 E2E |
| 收敛开发与按需计划 | 无计划日常开发、用户要求的精简 Todo、完整候选正负向单元测试 | 日常开发无 Work Plan；持久 Todo 只在明确协调需要时存在；有活动计划时非 `done` 项禁止进入 `accepted` |
| 并行协作 | Worktree 助手隔离单元测试 + 校验器契约检查 | 只有用户明确要求、持久策略启用且至少两个写入范围独立时采用；否则单 Agent |
| Task 条件整合 | 分支链裸远端回归 + `integrate-task`/`publish` 真实 OID 断言 | 只有 clean、登记 Worktree、精确 Task ref/40 位 OID、已推送活动叶子、严格线性无 merge、Task 范围逐提交未触碰受保护状态且无其他写入占用时才快进本地叶子；须覆盖远端 Task ref、冻结 OID/Worktree 错配与“修改后恢复原字节”，命令不 push，独立 `publish` 复读远端后才闭环 |
| Harness 版本 | 校验器正向与非法日期负向测试 | `Version.md` 的当前版本是上海时区合法 `YYYYMMDDHHMM`，当前摘要一致且下游 SemVer 不受污染 |
| 当前描述 | 校验器正向与隔离负向注入 | 已替代的接口、Git、目录、命名和前端默认不得回归 |
| 开发环境门禁 | 隔离测试 + Shell/PowerShell 静态或原生检查 | 只在中性初始化主动运行，或在真实测试/构建命令已出现受管环境错误后执行对应恢复与单次重试；不得由任务、构建或证据状态预触发。隔离覆盖 Git/Rust/Node.js/npm/pnpm 与适用 xwin 的缺失安装、低版本升级、同一 Rust stable、范围内复用、官方最新兼容稳定版，以及 Rust/Node/pnpm 当前用户受管全局根；继承的项目 Rust 根不得重定向写入。安装前验证普通非 symlink/reparse 安装根、profile/config/env/fish marker 与最终同根稳定链接，冲突零下载/零安装；Node marker 绑定已校验归档的精确版本/摘要，Unix profile 以随机临时文件和原字节快照 CAS 后原子替换。包括仅 Git 改变在内的任何变化都要求 Windows 新 PowerShell 从持久 User/Machine PATH、Unix 新登录 shell 从持久 profile/系统 PATH 绑定同一路径/版本实际执行全部适用工具。PATH 去除空/所有相对/cwd/重复项，POSIX 字面绝对 glob 不展开；危险覆盖仅显式测试模式可用，只读 `upgrade-required` 零写入，上界、预发布、无法解析、损坏状态失败关闭。Git/系统编译器仅在平台原生受信管理器要求时允许显式系统级/管理员边界，不得静默提权；MSVC、摘要与失败退出可审计，始终拒绝 WEB 参数 |
| Harness 升级 | 真实 CLI + 隔离 Git 测试夹具 | `plan`/`apply`/`record`、三方比较、引导、来源与控制状态绑定、权限、`protected`/`tombstone`；遇到符号链接与碰撞时默认拒绝，真实下游仍需前向证据 |
| Rust 资产 | 声明的 Rust 工具链 | 日常开发只运行本次必要单元测试；显式构建只追加 workspace 全量非空单元测试与实际构建，E2E 只在最终候选形成后按本次选择执行 |
| GUI 初始化 E2E | `verify-gui-lifecycle-contract.mjs` + `$desktop-test-gui-initialization-e2e` + Computer Use | 只在含 GUI 的一次性初始化提交前读取九项 profile；始终验证 system-locale/updater/window-state 三项 Rust-only 基线与 dialog 固定 WebView 基线（依赖、顺序、`dialog:default`、零额外文件系统授权），再按选择验证单实例、托盘、通知、自启恢复、深链接与全局快捷键回收，禁用能力无残留；所有组合验证侧栏、设置页、实际菜单页面并回收进程。需安装包的深链接场景明确 `Not verified`；无法观察或恢复即阻断，不作为候选验收证据 |
| GUI 发布性能 | 当次 `performanceSelection` + `$desktop-test-gui-release-performance` + release-profile 真实探针候选 | 每次发布先询问；`disabled` 且无硬要求时记录 `Not run`、原因和风险并跳过探针。`enabled` 或硬要求时先快照 window-state 原字节/原缺席状态，每次启动复用同一隔离基线且所有退出路径恢复并复核，再测 5 次冷启动、至少 20 次交互、整进程树 CPU/RSS、内存增长和退出回收；整进程树、探针字节、进程回收或窗口恢复失败均不可豁免，纯指标失败才可在 `waiverAllowed: true` 后显式 waiver；启用但仅有 xwin 时为 `Unverified` |
| 发布语义审查 | 当次 `reviewSelection` + 冻结基线到发布 HEAD 的累计差异 | 每次明确发布只解析一次；硬要求强制启用。`enabled` 记录绑定提交和差异范围的通过证据；`disabled` 且无硬要求时记录 `Not run`、原因和风险且不生成证据；日常 Task/Worktree 整合只保留机械安全门禁 |
| 发布刷新 | 辅助程序与发布校验器正负向测试 | 独立 Git 根、原子隔离旧目录、符号链接/重解析点、不跟随清理、精确忽略规则、默认矩阵和回退边界 |
| Tauri DMG 最终布局 | `scripts/verify-dmg-layout.sh <final-dmg>` + 只读候选证据 | 构建和完整验收都绑定当前最终字节，验证 `.DS_Store`、本地背景、唯一 `.app` 与 `/Applications` 链接；软件许可需独立人工授权，后处理后旧证据失效 |
| 最终候选运行验收 | 当前构建选择/硬要求解析 + 真实产物场景证据 | E2E 只在最终候选形成后按本次选择运行；失败、超时、取消或已选未执行会拒绝候选并回开发循环 |
| 工作流资产 | 全文件 SHA-256 + 独立 YAML 解析 + 步骤/输入/门禁契约 | 只生成三平台 `milestoneAcceptance: pending` 候选；检出并复核具名 `Release`、完整历史和只读 origin refs，关闭凭据持久化，以状态文件摘要为输入在测试前和 manifest 前离线复算完整 `releaseReview`/`candidateSelections` 双信封；使用不可变 Action 提交，依次刷新、非空测试/构建、条件签名、仓库外同根暂存、目录级原子提交和精确上传，禁止冒烟、E2E、发布和写权限提升 |
| 人工语义 | 文档与 Skill 契约矩阵 | 适用性、边界、状态和剩余风险无相互冲突的当前硬规则 |

## 证据分卷

- [2026-08-05](verification/20260805_verification.md)
- [2026-08-03 至 2026-08-04](verification/20260803-20260804_verification.md)
- [2026-07-27 至 2026-07-30](verification/20260727-20260730_verification.md)
- [2026-07-22 至 2026-07-23](verification/20260722-20260723_verification.md)
- [人工复核](verification/human_review.md)

真实渠道发布成功后，其发布、候选验收和适用人工签署证据才在后续受管 feature 生命周期中按日期追加到对应证据卷；独立回顾性长期审计同样在自己的受管 feature 生命周期追加，人工复核正文写入人工复核卷。候选构建、E2E、完整验收和就绪复核只更新忽略的 `release/` 原子证据集合，不写本索引或证据卷；普通缺陷修复、纯重构和内部维护也不因任务性质写入。
