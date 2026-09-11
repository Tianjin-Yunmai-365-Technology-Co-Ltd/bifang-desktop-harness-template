# ADR 历史决定

本文件只追加、不重写、不删除，是从当前最新 ADR 文件迁出的完整过期条目原文，需配合 Git 历史使用，不是下游可继承的项目记忆。

## ADR-20260910-002：左侧 Git Task 环境成为独立可切换策略

- 日期：2026-09-10；状态：Accepted。
- 关联需求与根因：项目负责人指出初始化没有询问左侧 Git Task 是否使用 Worktree，而且现行规则把"左侧 Git Task 固定使用独立 Worktree"与"Task 内是否允许 Worktree + 写入型 Subagent 并行"混在一起解释。`parallel_worktree_subagents` 实际只负责后者，不能控制 Task 自身环境；根因是 Agent Policy schema 没有独立字段，创建契约又硬编码 Git 项目使用 Worktree。
- 变更标识与所需版本：`change_id = HARNESS-FEAT-LEFT-GIT-TASK-WORKTREE-TOGGLE`；`required_version = 202609102343`，但本决定在同一版本发布前已由 `HARNESS-FEAT-OPTIONAL-USER-OWNED-TASKS` 完整取代，仅保留决策历史，不代表独立开关进入发布行为。
- 初始化决定：Agent Policy 升级为 schema v2，新增 `left_git_task_worktree: enabled | disabled`。创建下游时它是首轮固定基础字段，无论选择推荐预设还是自定义策略都必须单独询问；推荐值为 `enabled`，但不得静默采用，也不得从接口组合、Harness 源值或 `parallel_worktree_subagents` 推断。完整汇总和原子持久化包含五项策略；既有四项推荐预设本身保持不变。
- 执行决定：`enabled` 让新建的用户可见 Git 左侧 Task 使用独立 Codex Worktree；`disabled` 让新 Task 使用保存项目 Local checkout。两者都必须绑定精确保存项目、独立结果、稳定 Task 身份、具名 `feature-*` 分支和可审查提交。Local 模式创建前及首次写入前必须证明保存 checkout 干净且没有另一个潜在写入者，无法证明时停止并要求完成现有写入或启用 Worktree；不得用关闭开关降低项目绑定、分支或提交门禁。非 Git Task 继续使用 Local，不受本字段控制。
- 独立并行决定：`parallel_worktree_subagents` 的现有语义不变，只在用户当前明确要求且所有权可安全拆分时控制 Task 内部 Worktree + 写入型 Subagent。内部并行 helper 接受当前 Task 的独立 Worktree或保存项目 Local checkout 作为 source，从该 source 的干净已提交具名 feature 分支创建 sibling 单元；因此四种开关组合均有明确语义，左侧 Task 环境不替代内部并行许可。
- 后续切换与迁移：用户可在已初始化下游明确说"开启左侧 Git Task Worktree"或"关闭左侧 Git Task Worktree"。值真实变化时只更新本字段及 `confirmed_by`/`confirmed_at`，并追加同日 ADR 记录前值、后值、原因、影响和恢复方式；同值请求幂等零写入。切换只影响成功切换后新创建的 Task，不移动、删除或中断既有 Task/Worktree；关闭不清理既有资源，开启也不自动创建 Task。历史 schema v1 缺失本字段按旧行为解释为 `enabled`，首次真实切换时迁移到 schema v2，其他四项保持原值。
- 取代范围：本决定取代 `HARNESS-FEAT-INDEPENDENT-TASK-WORKTREE-DELIVERY` 以及后续 Task 绑定 ADR 中"Git 左侧 Task 一律使用独立 Worktree"的固定环境子句；独立结果、保存项目绑定、setup 状态机、Git common-dir/registry 校验、生命周期登记、标题、提交、推送和 tag 后清理等其余决定继续有效。
- 风险与验证：主要风险是推荐预设再次代答、两个字段互相覆盖、Local checkout 被并发写入、切换追溯修改既有 Task、schema v1 下游被错误拒绝，或内部并行仍只接受独立 source Worktree。专项回归必须覆盖 schema v2 五字段、源 `pending`、初始化必问、推荐/自定义组合、手动切换语义、旧 schema 兼容声明、Local source 单元创建和 dirty/错误仓库/并发边界；Harness validator 锁定文档与 Skill 传播。
- 恢复或调整标准：若宿主未来提供按 Task 原子锁定 Local checkout 或动态移动 Task 环境的能力，可用新 ADR 放宽并发限制或增加显式迁移流程；在此之前不得把开关变化追溯应用到已创建 Task，也不得重新借用 `parallel_worktree_subagents` 表达 Task 自身环境。

## ADR-20260831-002：Git 只在下一步实际提交时即时检查和设置（已由 ADR-20260831-004 取代）

- 日期：2026-08-31；状态：Superseded by ADR-20260831-004。
- 关联需求：项目负责人明确要求 Git 应在用户实际需要提交代码前进行检查和设置，而不是在打开仓库、表单或脚手架早期预先配置。
- 变更标识与所需版本：`change_id = HARNESS-FEAT-JUST-IN-TIME-GIT-COMMIT-SETUP`；`required_version = 202608281139`。该值是当前 Harness 未发布时间版本，本决定不自动改变 `Version.md`。
- 背景：早期运行 Git 可用性、作者身份或提交模板检查，会在尚未形成提交意图时增加环境要求并修改仓库本地元数据。新下游仍需要独立仓库和唯一基线提交，但该事实不要求在表单、复制、测试或裁剪阶段提前准备 Git。
- 决定：只有用户明确请求配置 Git，或已授权工作流的下一项真实动作就是运行 `git commit` 时，才触发 `$desktop-configure-git-commits` 与相关 Git 可用性、版本、身份、仓库边界检查。打开/读取仓库、只读状态检查、诊断、编辑、测试、生成脚手架或未来可能提交都不触发配置脚本。为保护已有修改而进行的只读根、分支和状态检查继续允许，并与提交配置严格区分。
- 初始化时序：新下游完成全部脚手架检查、GUI 适用门禁和一次性裁剪后，下一步实际创建唯一基线提交时，才检查 `git --version` 与用户身份、建立或确认独立 `main` 仓库、验证无远端/无既有 HEAD、运行仓库本地 `install`/`check` 并提交。任何失败在提交前阻断，不得修改全局配置或伪造身份。
- 影响范围：AGENTS、README、工程规则、Rust 基线、实例化与初始化 Skills、Git 提交 Skill、初始化 validator、专项回归、Product Spec 和 Changelog。
- 理由：把副作用和依赖门禁紧邻其唯一消费者 `git commit`，可避免无提交任务被迫配置 Git，同时不削弱真正提交前的模板、身份和独立仓库保障。
- 风险：过度延迟可能在所有脚手架工作完成后才暴露 Git 缺失或身份不可用；这是有意的即时失败边界，保留全部目标文件并给出真实诊断即可恢复。不得以降低晚期失败概率为由重新提前设置。
- 验证：回归把初始化 Skill 按最终收尾步骤切分，证明此前不含 `git --version`、`git init` 或提交模板脚本，收尾段同时包含这些命令和实际基线提交条件；Git Skill 契约检查明确触发与非触发场景。规则实施阶段没有提前运行 Git 配置；项目负责人随后明确要求提交并推送全部变更，此时才按本决定即时运行仓库本地 `install`/`check` 并创建提交。
- 恢复或调整标准：只有真实工作流证明某个更早阶段必须消费具体 Git 能力，且项目负责人批准精确触发点、副作用和失败恢复方式时才能调整；只读安全检查不构成把提交配置提前的理由。
