import fs from "node:fs";
import path from "node:path";

import { ROOT, SKILLS_ROOT, fail, latestDatedFile, nodeSyntaxErrors, relativePath } from "./core.mjs";
import { validateAgentsEntrypoint } from "./governance.mjs";
import { PROJECT_TASK_SEQUENCE_REQUIRED_FRAGMENTS } from "./governance_policy.mjs";

function skill(name, ...segments) {
  return path.join(SKILLS_ROOT, name, ...segments);
}

const DEFAULT_PATHS = Object.freeze({
  agentsEntrypoint: path.join(ROOT, "AGENTS.md"),
  readme: path.join(ROOT, "README.md"),
  agentPolicy: path.join(ROOT, "docs", "AGENT_POLICY.md"),
  taskWorkflow: skill("desktop-task-workflow", "SKILL.md"),
  taskContract: skill("desktop-task-workflow", "references", "task-contract.md"),
  taskDescription: skill("desktop-task-workflow", "references", "task-description.md"),
  worktreeExecution: skill("desktop-task-workflow", "references", "worktree-execution.md"),
  engineeringRules: path.join(ROOT, "docs", "ENGINEERING_RULES.md"),
  productSpec: latestDatedFile(path.join(ROOT, "docs", "product_spec"), /^\d{8}_product_spec\.md$/u),
  rustBaseline: path.join(ROOT, "docs", "RUST_CLI_TEMPLATE.md"),
  release: path.join(ROOT, "docs", "RELEASE.md"),
  verification: path.join(ROOT, "docs", "VERIFICATION.md"),
  designIndex: path.join(ROOT, "docs", "design_standards", "README.md"),
  tauriGui: path.join(ROOT, "docs", "design_standards", "tauri_gui.md"),
  tauriSidebar: path.join(ROOT, "docs", "design_standards", "tauri_sidebar.md"),
  planSkill: skill("desktop-plan-change", "SKILL.md"),
  implementSkill: skill("desktop-implement-change", "SKILL.md"),
  handoffSkill: skill("desktop-handoff-project", "SKILL.md"),
  manageTasksSkill: skill("desktop-manage-user-tasks", "SKILL.md"),
  taskWorktreesSkill: skill("desktop-manage-task-worktrees", "SKILL.md"),
  configurePolicySkill: skill("desktop-configure-agent-policy", "SKILL.md"),
  initializeSkill: skill("desktop-initialize-rust-project", "SKILL.md"),
  instantiateSkill: skill("desktop-instantiate-project", "SKILL.md"),
  refactorSkill: skill("desktop-refactor-code", "SKILL.md"),
  environmentSkill: skill("desktop-check-development-environment", "SKILL.md"),
  guiIdentitySkill: skill("desktop-prepare-gui-app-identity", "SKILL.md"),
  guiSupportSkill: skill("desktop-prepare-gui-support-surfaces", "SKILL.md"),
  guiInitializationE2eSkill: skill("desktop-test-gui-initialization-e2e", "SKILL.md"),
  verifyDeliverySkill: skill("desktop-verify-delivery", "SKILL.md"),
  mcpSkill: skill("desktop-add-mcp-adapter", "SKILL.md"),
  guiAdapterSkill: skill("desktop-add-gui-adapter", "SKILL.md"),
  cliSkill: skill("desktop-add-cli-adapter", "SKILL.md"),
  tuiSkill: skill("desktop-add-tui-adapter", "SKILL.md"),
  e2eSkill: skill("desktop-test-final-artifact-e2e", "SKILL.md"),
  rustAssetLib: skill("desktop-initialize-rust-project", "assets", "rust-lib-cli", "example_tool_core", "src", "lib.rs"),
  parallelSkill: skill("desktop-run-parallel-worktrees", "SKILL.md"),
  parallelScript: skill("desktop-run-parallel-worktrees", "scripts", "parallel_worktrees.mjs"),
  parallelTests: skill("desktop-run-parallel-worktrees", "scripts", "parallel_worktrees.test.mjs"),
  configureCommitsSkill: skill("desktop-configure-git-commits", "SKILL.md"),
  gitLifecycleSkill: skill("desktop-manage-git-lifecycle", "SKILL.md"),
  gitLifecycleEntry: skill("desktop-manage-git-lifecycle", "scripts", "git_lifecycle.mjs"),
  gitLifecycleCore: skill("desktop-manage-git-lifecycle", "scripts", "git_lifecycle_core.mjs"),
  gitLifecyclePublication: skill("desktop-manage-git-lifecycle", "scripts", "git_lifecycle_publication.mjs"),
  gitLifecycleTests: skill("desktop-manage-git-lifecycle", "scripts", "git_lifecycle.test.mjs"),
  gitLifecycleReleaseTests: skill("desktop-manage-git-lifecycle", "scripts", "git_lifecycle_release.test.mjs"),
  gitPublicationTests: skill("desktop-manage-git-lifecycle", "scripts", "git_publication_test_cases.test.mjs"),
  switchPostReleaseSkill: skill("desktop-switch-post-release-action", "SKILL.md"),
  renameIdentitySkill: skill("desktop-rename-project-identity", "SKILL.md"),
  buildReleaseSkill: skill("desktop-build-rust-release", "SKILL.md"),
  tauriReleaseSkill: skill("desktop-build-tauri-release", "SKILL.md"),
  crossPlatformReleaseSkill: skill("desktop-prepare-cross-platform-release", "SKILL.md"),
  collectReleaseSkill: skill("desktop-collect-release-artifacts", "SKILL.md"),
  prepareReleaseSkill: skill("desktop-prepare-release", "SKILL.md"),
  upgradeSkill: skill("desktop-upgrade-harness", "SKILL.md"),
  upgradePolicy: skill("desktop-upgrade-harness", "references", "ownership-policy.md"),
});

function resolvedPaths(overrides = {}) {
  return { ...DEFAULT_PATHS, ...overrides };
}

function readRequired(errors, filePath, label) {
  try {
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("not a regular file");
    return new TextDecoder("utf-8", { fatal: true }).decode(fs.readFileSync(filePath));
  } catch {
    fail(errors, `${label}: ${relativePath(filePath)}`);
    return null;
  }
}

function checkEntries(errors, paths, entries, missingLabel, missingFragmentLabel) {
  const texts = new Map();
  for (const [key, fragments] of entries) {
    const filePath = paths[key];
    const text = readRequired(errors, filePath, missingLabel);
    if (text === null) continue;
    texts.set(key, text);
    for (const fragment of fragments) {
      if (!text.includes(fragment)) fail(errors, `${missingFragmentLabel} in ${relativePath(filePath)}: ${fragment}`);
    }
  }
  return texts;
}

const ENGINEERING_ENTRIES = [
  ["engineeringRules", [
    "当前规范根同时包含 Harness 专用 `Version.md`", "只接受 Harness 自身工程维护",
    "只能拒绝并要求用户在初始化完成、切换到唯一终端下游根目录后重新提出", "## 2. 文件、模块与依赖边界",
    "Rust 代码：400 行及以内", "800 行通过，801 行失败", "前端代码：500 行及以内", "1000 行通过，1001 行失败",
    "其他人工维护文本", "2000 行通过，2001 行失败", "<module>/mod.rs", "不强制 `index.ts` 桶文件",
    "高内聚、职责单一和职责相近性复核", "## 3. 中文代码注释", "### 3.4 机械存在性门禁",
    "check_rust_chinese_comments.mjs", "TypeScript Compiler AST", "不得自动生成或批量补入", "## 4. 文档规则",
    "## 5. 测试组织", "## 6. 规则例外", "## 7. 机械检查边界", "src-tauri/icons/32x32.png",
    "Tauri Builder `.setup(...)` 可达", "`.on_window_event(...)` 注册", "透明点击区域",
    "本身不触发 Product Spec、ADR、Product Status、Changelog 或 Verification",
    "任务被称为“修复”或“重构”不能绕过相应的安全、发布或记录要求", "`candidate-1`、`candidate-2`、`candidate-3`",
    "用户选择前不得验证格式、尺寸、色彩、像素、摘要或质量", "用户明确选择后只验证和按需标准化所选项",
    "缺失时安装官方当前最新兼容稳定版、可证明低于最低下界时受管升级",
    "持久去重 PATH，并在当前进程与只读取持久 PATH 的新 shell 绑定路径和版本实际复探",
    "已有有效身份保持，缺失字段只在独立目标仓库 local 作用域补齐", "Git common dir",
    "用户明确“发布”时只整理本次源码，普通合并登记分支到本地默认主分支并创建复读版本 tag，Git 发布到此结束",
    "候选事实只写入忽略的 `release/` 原子集合", "下一次开发从已发布的本地主分支/tag 建分支",
    "候选构建、E2E、完整验收和就绪复核不得为了留证污染已发布源码",
  ]],
  ["readme", [
    "docs/ENGINEERING_RULES.md", "## AI Agent 快速入口", ".agents/skills/desktop-instantiate-project/SKILL.md",
    ".agents/skills/desktop-instantiate-project/references/initialization-form.md", "用户确认完整汇总前保持零写入",
    "不要复制源 `.git`", "切换到该目录，再用 `$desktop-define-product`", "## 当前模板仓库的请求边界", "只接受两类信息",
    "必须在完成实例化并切换到唯一终端下游根目录后重新提出", "缺失时按当前平台的受管方式安装", "不修改全局 Git 设置",
    "`candidate-1` → `candidate-2` → `candidate-3`", "docs/design_standards/README.md",
    "先判断是否疑似新需求：疑似新需求优先按 `feature` 提升 Minor", "确认没有新需求的问题修复或用户可感知优化按新稳定 ID 的 `bug-fix` 提升 Patch", "日常只强制 Rust 800 行、前端 1000 行的硬上限",
    "其他人工维护文本也固定为 2000 行硬上限",
    "Rust 401–800、前端 501–1000、其他文本 501–2000 行的建议候选只在当次发布启用语义审查时集中提示", "<module>/mod.rs",
  ]],
  ["agentPolicy", [
    "schema_version: 5", "task_worktrees:", "superpowers:", "user_owned_tasks:", "推荐预设确定性物化六项", "parallel_worktree_subagents:", "acceptance_smoke:", "e2e_hint:",
    "post_release_action: pending", "`local_package`", "`push_release_branch`", "$desktop-switch-post-release-action",
    "日常开发直接实施", "显式发布候选构建必须为当前候选解析一次 E2E 选择",
    "`$desktop-prepare-release` 把本次版本、日期、默认主分支、预期 tag、源码身份和审查结果写入 `.harness/release-context.json`",
    "未来偏好保存在本文件；下游 Git 发布开始时将当次 `postReleaseAction` 冻结", "候选选择只进入候选证据，不反写已发布源码",
  ]],
  ["productSpec", [
    "docs/ENGINEERING_RULES.md", "HARNESS-FEAT-HARNESS-SOURCE-SCOPE-GATE", "HARNESS-FEAT-INITIALIZATION-GIT-BOOTSTRAP-RELEASE-AUTOCOMMIT",
    "HARNESS-FEAT-GUI-NOTIFICATION-AUTOSTART-CAPABILITIES",
    "系统通知在初始化阶段只验证默认关闭、串行 worker/权限状态机结构和失败可见性",
    "当前应用的 Notifications 设置跳转与真实投递只由满足签名前提的最终安装候选验收",
    "HARNESS-FIX-ATOMIC-CANDIDATE-EVIDENCE-LIFECYCLE", "HARNESS-FEAT-RUST-1-95-LATEST-STABLE-SELECTION",
    "HARNESS-FEAT-DEFERRED-LOGO-VALIDATION-STABLE-PREVIEW", "HARNESS-FEAT-BASE100-AUTO-VERSION-CARRY",
    "0.0.99 -> 0.1.0", "0.99.99 -> 1.0.0", "不把普通缺陷修复、纯重构、格式整理、测试补强或内部清理写成项目记忆流水账",
    "HARNESS-FEAT-TIERED-CODE-LINE-LIMITS", "HARNESS-FEAT-POST-RELEASE-ACTION-CHOICE",
    "Producer/collector 在仓库外同文件系统 sibling 暂存并验证精确集合后目录级原子提交",
    "候选和 ready 不自动写 tracked 记忆", "Rust 代码 400 行及以内", "前端代码 500 行及以内", "<module>/mod.rs",
  ]],
  ["rustBaseline", ["docs/ENGINEERING_RULES.md", "design_standards/README.md"]],
  ["designIndex", ["当前请求或产品 profile 中已批准的产品专属标准优先于 Harness 通用缺省", "不得自行发明数值", "tauri-gui-sidebar-compact-80-v1", "tauri-gui-sidebar-detailed-v1"]],
  ["tauriGui", ["adapter 的展示和纯交互层", "localStorageColorSchemeManager", "page → surface → section → field → action", "320 CSS px", "@tabler/icons-react", "i18next", "父容器不得代理子控件动作", 'role="alertdialog"', "WCAG 2.2 AA", "Testing Library"]],
  ["tauriSidebar", ["80px", "6px", "36px", "22px", "line-height: 1.25", "56px", "禁止 `em`/`ch` 固定占位盒", "navbar.width", "AppShell.Navbar", "248px", "76px", "APP_SIDEBAR_NAV_ICON_SIZE_PX = 22", "readDetailedSidebarCollapsed()", "detailedSidebarNavbarWidth(collapsed)", "data-navbar-width", 'data-testid="app-sidebar-collapse-toggle"', 'position="right"', "身份区父级点击不得切换状态"]],
  ["planSkill", ["docs/ENGINEERING_RULES.md"]],
  ["implementSkill", ["docs/ENGINEERING_RULES.md", "本次开发需要的相关非空单元/回归测试", "不得自动追加格式化、lint、静态"]],
  ["initializeSkill", ["docs/ENGINEERING_RULES.md", "docs/design_standards/README.md", "只运行初始化本身必需的非空测试", "不得在日常开发中自动运行这些全仓门禁", "日常/初始化门禁只分别强制 800、1000、2000 行硬上限", "建议候选只在当次发布启用语义审查时集中列出", "<module>/mod.rs"]],
  ["refactorSkill", ["Rust 401 至 800 行", "前端 501 至 1000 行", "<module>/mod.rs", "不强制创建 `index.ts` 桶文件"]],
  ["environmentSkill", ["docs/RUST_CLI_TEMPLATE.md"]],
  ["guiIdentitySkill", ["docs/ENGINEERING_RULES.md", "$desktop-add-gui-adapter", "tauri-gui-common-v1", "tauri-gui-sidebar-compact-80-v1"]],
  ["guiSupportSkill", ["docs/ENGINEERING_RULES.md", "docs/design_standards/README.md", "$desktop-implement-change", "秘密只能由已批准的安全运行时来源提供"]],
  ["guiInitializationE2eSkill", [
    "docs/ENGINEERING_RULES.md", "docs/design_standards/README.md", "真实本机调试二进制", "verify-gui-lifecycle-contract.mjs",
    "src-tauri/tauri.release.conf.json", "异步 `load_release_notes`", "loading/error/retry", "未选能力不是缺失证据",
    "`single_instance: enabled`", "第二进程 15 秒内退出", "`system_tray: enabled`", "icons/32x32.png",
    "非透明 `icons/32x32.png`/配置引用", "从 `.setup(...)` 可达", "真实非空图形", "空白点击区域", "退出项结束进程并移除图标", "close_last_window_exits_application",
  ]],
  ["verifyDeliverySkill", ["docs/ENGINEERING_RULES.md"]],
  ["instantiateSkill", ["docs/ENGINEERING_RULES.md"]],
  ["mcpSkill", ["docs/ENGINEERING_RULES.md"]],
  ["guiAdapterSkill", ["docs/ENGINEERING_RULES.md", "docs/design_standards/README.md", "check-typescript-chinese-comments.cjs", "mantine-ui-guidelines.md"]],
  ["cliSkill", ["docs/ENGINEERING_RULES.md"]],
  ["tuiSkill", ["工程规则"]],
  ["e2eSkill", ["docs/VERIFICATION.md"]],
  ["rustAssetLib", ["#![deny(missing_docs)]"]],
];

/** 校验工程规则唯一来源、关键入口和执行型 Skills 的确定性引用。 */
export function validateEngineeringContract(errors, options = {}) {
  const paths = resolvedPaths(options.paths);
  validateAgentsEntrypoint(errors, paths.agentsEntrypoint);
  checkEntries(errors, paths, ENGINEERING_ENTRIES, "missing engineering contract file", "engineering rule reference missing");
}

const TASK_SEQUENCE = PROJECT_TASK_SEQUENCE_REQUIRED_FRAGMENTS;
const STREAMLINED_ENTRIES = [
  ["taskWorkflow", ["默认 `disabled`", "自动创建左侧子会话的唯一项目开关", "不再把 BOUND", "当前宿主真实权限", "独立 Worktree", "实际 checkout", "短锁", "references/task-contract.md", "references/task-description.md", "references/worktree-execution.md"]],
  ["taskContract", ["`Task {序号} | {当前进度} | {单一结果}`","`已分配`、`运行中`、`检查中`、`已完成`","list_archived_threads","缺号不回填","SETUP_PENDING","真实 `threadId`","不等待新的审批口令","迁移链","重复创建","对每个结果只调用一次 `create_thread`","非 pinned","工具成功回执不能代替复读"]],
  ["taskDescription", ["目标", "范围", "授权", "完成"]],
  ["worktreeExecution", ["common-dir","guard","postflight","--write-target","--source-worktree","environment.type=local","Local 没有 `startingState` 参数","只读测试期间其他 Task 也不能改变被测 branch、HEAD 或文件","前序结束并交出可核对的提交后再开工","恢复漂移先复核实际输入","普通 `create_worktree`、`git worktree add` 或内部 Subagent 不能冒充其左侧身份"]],
  ["agentsEntrypoint", ["每次开工先读取用户级", "$desktop-task-workflow", "默认关闭"]],
  ["handoffSkill", ["用户级 `AGENTS.md`","$desktop-task-workflow","关闭时在当前聊天恢复","沿原身份、结果和冻结环境主动修复","无需重复人工审批"]],
  ["readme", ["日常开发直接使用 `$desktop-implement-change`","只增加并运行本次变更需要的单元/回归测试","不自动增加计划、全仓检查、构建、E2E 或验收","Git 发布只整理并提交代码、合并本地默认主分支及创建并复读 tag","发布开始时冻结已确认的 `post_release_action`","未来可用 `$desktop-switch-post-release-action` 切换","候选须运行全部非空单元测试","不自动更新项目记忆","## Task 与工作树","$desktop-task-workflow","只有项目开启才自动创建左侧 Task 子树","不改变永久选择","独立 Worktree","并行创建和执行","同一 Local cwd","不额外等待人工 BOUND 批准","gpui-kit-design-guides","本次另行解析 E2E 和适用签名选择，把选择与结果写入候选证据","普通 Windows 本地安装试包是开发制品","不要求发布日志或 clean HEAD","构建事实只写入适用产物位置和最终回复"]],
  ["agentPolicy", ["decision_mode: reuse_then_infer_then_ask","## 用户可见 Task 开关、粒度与创建门禁","$desktop-task-workflow","user_owned_tasks","task_worktrees","推荐预设","日常开发直接实施","显式发布候选构建必须为当前候选解析一次 E2E 选择","E2E 选择只对终端下游发布候选有效","本地开发试包不消费 E2E 选择","只写忽略的 `release/` 原子证据及最终回复","不得反向批准活动候选","未来偏好保存在本文件；下游 Git 发布开始时将当次 `postReleaseAction` 冻结","终端下游的候选构建复核已发布的本地主分支与 tag","候选选择只进入候选证据","## 开发分支与主分支发布生命周期","`feature-{ascii-kebab-summary}-{YYYYMMDD}`","`--also-remote`","允许普通 merge commit","Git common dir 下的 `agent-first-harness/git-lifecycle.json`","这里没有分支保护、活动叶子、分支级单写入者、严格线性历史、fast-forward-only、lease、atomic push","候选 E2E、完整验收、`pending` → `accepted` 和就绪复核","默认主分支与本地 tag 精确指向同一最终 HEAD 并复读成功","e2e_hint` 只提供建议默认值","用户明确说“发布”时","`pendingPublish` 中冻结的 HEAD、目标顺序与进度","多远端推送不是原子操作","推送失败也不撤销已完成的本地 Git 发布","小写 `release` 仅是 `push_release_branch` 后续路径的源码分支"]],
  ["planSkill", [
    "只在持久计划能解决真实协调问题时建立 Todo", "多步骤、多模块、中等风险、可并行或 Agent 偏好本身不构成准入",
    "日常开发直接交给 `$desktop-implement-change`", "日常计划不得自行增加这些步骤", "不得在执行时静默追加全仓检查、构建或验收",
  ]],
  ["implementSkill", [
    "业务资料阅读、插件探索、分析或设计", "先读取用户级 `AGENTS.md`", "不承担正式验收、发布或推送", "直接实现请求", "$desktop-task-workflow", "queued 或绑定失败保持零实现", "按真实转换同步",
    "只运行第 6 步的测试", "日常开发不得自动追加格式化、lint、静态", "普通构建也只新增全量非空单元测试和实际构建",
    "构建请求、执行和结果本身不触发 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification", "只更新被独立事件触发的记忆",
    "当前说明来自左侧 user-owned Task", "$desktop-add-file-operations", "$desktop-add-external-process",
    "$desktop-manage-git-lifecycle start", "合并登记分支到本地默认主分支",
    "`--release-context-sha256 <sha256>`", "不 fetch、push、打包或清理资源",
    "普通完成不自动推送、发布或删除登记资源", "随后必须按已确认的 `post_release_action`",
    "`push-release --remote <name>`", "复核真实制品或远端 refs 后才报告后续路径完成",
    "每完成一个逻辑闭环", "最终交付前确认测试、权威文档、适用提交与干净工作树",
    "用户明确要求发布时路由 `$desktop-prepare-release`",
  ]],
  ["manageTasksSkill", ["$desktop-task-workflow","references/task-contract.md","兼容"]],
  ["taskWorktreesSkill", ["$desktop-task-workflow","references/worktree-execution.md","兼容"]],
  ["configurePolicySkill", [
    "明确永久选择", "$desktop-switch-post-release-action", "--expected-value", "--confirmed-user-choice",
    "no-op", "共用策略锁", "保留其他字段及正文", "不重写已冻结发布",
  ]],
  ["parallelSkill", ["$desktop-task-workflow","references/worktree-execution.md","scripts/parallel_worktrees.mjs","兼容"]],
  ["initializeSkill", ["$desktop-task-workflow","user_owned_tasks","task_worktrees","message-check --message-file <file>","chore: 初始化项目","gpui-kit-design-guides","不复制编号、标题、权限、创建或交付合同"]],
  ["instantiateSkill", ["本项目已明确的 Task 选择","模板默认和推荐预设保持原值","$desktop-task-workflow","默认关闭","项目值、确认来源与有效执行行为","gpui-kit-design-guides","不复制编号、标题、权限、创建或交付合同"]],
  ["configureCommitsSkill", ["message-check --message-file <file>", "主题摘要和正文说明必须使用中文", "git log -1 --format=%B", "references/commit-convention.md", "commit.template", "commit.cleanup=strip", "commit.verbose=true", "core.commentChar=#", "git config --local", "install --replace", "用户没有要求创建提交时", "下一步将实际运行 `git commit`", "不得运行本 Skill 的身份/模板脚本命令或改写任何 Git 配置", "不得在初始化表单、复制、身份改写、环境门禁、脚手架编写或测试阶段提前运行"]],
  ["productSpec", [
    "HARNESS-FEAT-INDEPENDENT-TASK-WORKTREE-DELIVERY", "HARNESS-FIX-PROJECT-BOUND-TASK-AND-SUBAGENT-WORKTREE",
    "HARNESS-FEAT-HARNESS-SOURCE-SCOPE-GATE", "HARNESS-FEAT-INITIALIZATION-GIT-BOOTSTRAP-RELEASE-AUTOCOMMIT",
    "HARNESS-FEAT-DEFERRED-LOGO-VALIDATION-STABLE-PREVIEW", "HARNESS-CHANGE-SIMPLE-GIT-LIFECYCLE", "HARNESS-FEAT-OPTIONAL-USER-OWNED-TASKS",
    "`Task {序号} | {当前进度} | {单一结果}`", ...TASK_SEQUENCE, 'create_thread(title="Task {序号} | 已分配 | {单一结果}")',
    "一个 Task 固定一个可验收结果", "`clientThreadId` 只表示 setup", "Git 按有效 task_worktrees 选择 Worktree/Local，非 Git 使用 Local", "`codex/unit-*`",
    "发布开始时冻结 `post_release_action`，发布后按该次快照执行现有本地打包", "postflight",
  ]],
  ["parallelScript", [
    'runGit(root, "rev-parse", "--show-toplevel")', "function trackLifecycleWorktree", '"lifecycle_worktree_tracking_failed"',
    "project_root_not_primary_worktree", "source_repository_mismatch", "`codex/unit-${safeTask}-${safeUnit}`", "source_worktree_dirty",
    "ownership_overlap_across_units", "actual_change_outside_ownership", "worktree_path_exists", "worktree_branch_mismatch", "worktree_dirty",
    '"source-worktree": { type: "string" }', '["inspect", "create", "guard", "verify", "remove"]', "function removeUnit",
  ]],
  ["parallelTests", [
    "create_tracks_exact_worktree_in_current_release_cycle", "create_rolls_back_when_lifecycle_tracking_fails",
    "remove_retains_worktree_and_branch_for_separate_cleanup", "create_rejects_dirty_source_including_untracked_files",
    "create_accepts_local_primary_source_and_requires_exact_source_cwd", "create_rejects_source_from_another_repository",
    "create_rejects_symlinked_external_worktree_container", "create_requires_safe_non_root_ownership",
    "create_rejects_overlapping_ownership_within_and_across_units", "guard_accepts_registered_subpath_and_rejects_unregistered_target",
    "verify_rejects_committed_untracked_and_renamed_escape", "remove_rejects_dirty_but_accepts_clean_unmerged_unit",
    "remove_runs_postflight_before_clean_state_cleanup",
  ]],
  ["gitLifecycleSkill", [
    "name: desktop-manage-git-lifecycle", "创建本地分支不要求配置远端", "即使处于 detached HEAD 也可直接开始",
    "创建本地分支不要求配置远端", "--also-remote <name>", "`pendingPublish` 中临时保存冻结目标与确认进度",
    "不参与 fetch、merge、release、tag 或清理", "普通 `git merge --no-edit -m <中文合并消息>`", "`v{version}-{YYYYMMDD}`", "`release` 只在本地默认主分支", "不设置租约、原子推送或保护分支门禁",
    "本地 `refs/heads/release`", "远端 `refs/heads/release`",
  ]],
  ["switchPostReleaseSkill", [
    "name: desktop-switch-post-release-action", "`local_package`", "`push_release_branch`",
    "schema_version: 3", "schema_version: 4", "status: selection_required", "status: configured",
    "`docs/AGENT_POLICY.md` 是 protected 下游事实", "本地打包", "提交远程", "原子替换策略 frontmatter",
  ]],
  ["gitLifecycleEntry", ["commandStart", "commandTrackWorktree", "commandPublish", "commandRelease", "commandPushRelease", 'publish: new Set(["projectRoot", "remote", "alsoRemote"])']],
  ["gitLifecycleCore", ["function validatePendingPublish", "function resolveAdditionalRemoteTargets", "function commandStart", "function commandTrackWorktree"]],
  ["gitLifecyclePublication", [
    "function publish(", "function confirmPendingPublishTarget", "function completePendingPublish",
    "function commandRelease", "function commandPushRelease", "function completePendingRelease", "ensureLocalReleaseTag",
  ]],
  ["gitLifecycleTests", [
    "start_without_remote_is_idempotent_and_uses_common_dir_state", "publish_merges_current_remote_default_before_development_branches",
    "publish_refuses_missing_registered_branch", "publish_pushes_same_head_to_additional_remote_without_rebinding",
    "publish_rejects_invalid_additional_remote_sets_before_pushing",
  ]],
  ["gitLifecycleReleaseTests", ["--release-context-sha256", "release_merges_locally_tags_and_preserves_registered_resources_without_remote", "push-release"]],
  ["gitPublicationTests", [
    "publish_primary_only_failure_persists_and_resumes_frozen_head", "single_target_pending_errors_preserve_stable_codes",
    "additional_drift_reports_later_confirmed_targets", "additional_remote_rejection_preserves_prefix_and_retry_succeeds",
  ]],
  ["renameIdentitySkill", [
    "实例化身份重置", "现有产品改名", "必须先通过 `$desktop-define-product` 确认范围", "不自动创建 Work Plan、候选或完整验收步骤",
    "用户明确要求 Git 发布时才进入 `$desktop-prepare-release`", "在本地主分支合并并打 tag 后结束",
  ]],
  ["verifyDeliverySkill", ["当前构建已明确选择 E2E `enabled`", "没有 Work Plan 不阻断验收", "当前构建已经运行项目全部非空单元测试", "e2e_hint` 仅用于当时询问的建议默认值", "返回 `$desktop-implement-change` 修复并增加回归"]],
  ["e2eSkill", ["当前构建选择为 `enabled`", "e2e_hint` 不能替代当前构建选择", "完整真实最终产物", "没有 Work Plan 不阻断 E2E", "返回 `$desktop-implement-change` 增加回归测试"]],
  ["buildReleaseSkill", [
    "本次请求已明确 `enabled`/`disabled` 时直接复用", "否则在任何测试或编译前询问用户一次", "只强制运行项目全部非空单元测试",
    "cargo test --workspace --all-targets --all-features", "不得在构建名义下自动追加格式、lint、中文注释或其他开发门禁",
    "不得因显式构建、缺少/过期环境证据", "并重试原失败命令一次", "e2eSelection",
    "不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification", "最终字节和清单形成后立即交给 `$desktop-verify-delivery`",
  ]],
  ["tauriReleaseSkill", [
    "本次请求已明确 `enabled`/`disabled` 时直接复用", "否则在任何测试或编译前询问用户一次",
    "发布审查只从上下文读取", "当前候选目标包含 macOS 时 `macosSigningSelection` 必须精确为 `enabled | disabled`",
    "锁定为本次构建选择并在候选 manifest 中记录", "打包前只先运行项目全部非空单元测试",
    "cargo test --workspace --all-targets --all-features", "前端必须运行 `package.json` 声明的完整单元测试套件",
    "不得自动追加格式、lint、类型、中文注释、`dist` 扫描或其他开发门禁", "初始化后的构建不做例行环境预检",
    "只有某条命令已经失败", "并重试原命令一次", "e2eSelection",
    "不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification", "最终字节形成后立即交给 `$desktop-verify-delivery`",
  ]],
  ["crossPlatformReleaseSkill", ["e2e_selection", "cargo test --workspace --all-targets --all-features", "不得自动追加格式、lint 或其他开发门禁", "e2eSelection", "不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification", "矩阵本身不得运行 E2E"]],
  ["collectReleaseSkill", ["e2eSelection", "发布上下文 `verify`", "锁定 clean 当前 HEAD、`releaseContextSha256`", "候选选择则与原始构建 manifest 及声明的构建证据一致", "再次运行发布上下文 `verify`", "不重新构建、签名、执行或发布候选", "收集过程绝不得自行启动冒烟/E2E", "不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification"]],
  ["prepareReleaseSkill", ["本地默认主分支和版本 tag 指向同一最终提交后，Git 发布即结束", "上下文只冻结版本、日期、默认主分支、预期 tag、源码身份与审查结论", "不保存推送模式、远端、候选签名或打包选择", "不访问远端、不推送、不打包", "读取生命周期记录里该次冻结的 `postReleaseAction`，执行并检测后续路径"]],
  ["engineeringRules", [
    "### 5.3 开发、构建与完整验收", "日常开发统一直接实施，只运行本次变更需要的相关非空单元/回归测试",
    "显式发布候选构建在任何测试或编译前解析当前候选的 E2E 选择", "构建必须运行项目全部非空单元测试",
    "manifest 和最终回复是发布候选构建的记录出口", "本地开发试包只报告实际产物路径和风险",
    "不触发 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification",
    "自动增加 Work Plan、全仓测试、格式化、代码规范、静态、集成/契约、构建、冒烟、E2E、Verification 或人工复核",
    "普通构建不为它增加独立步骤",
  ]],
  ["release", [
    "## Git 发布后构建与完整验收", "随后必须按 `post_release_action` 完成被选中的本地打包或远端 `release` 分支推送",
    "读取本次发布冻结的 `postReleaseAction` 并执行所选后续路径", "该次构建单独解析 E2E 和 GUI 签名选择",
    "候选构建在清理目录、测试或编译前，以及写 manifest 前", "E2E 和适用签名选择在现有构建动作中解析并写入候选证据",
    "运行全部非空单元测试", "构建请求、执行、重试、测试结果、产物路径/摘要/签名状态",
    "就绪结论", "发布本身不打包、构建或推送", "下一开发分支须以该主分支/tag 的精确版本和 40 位 HEAD 调用 `finalize-release`",
  ]],
  ["rustBaseline", [
    "用户显式请求发布候选构建时逐次解析 E2E 选择", "Windows 本地开发试包不解析 E2E 选择", "只追加全量非空单元测试和实际构建",
    "不自动追加格式、lint、静态或其他开发门禁", "候选 E2E、完整验收、状态更新和就绪复核", "只写入忽略的 `release/` 原子集合",
    "每次明确的 Git 发布先由 `$desktop-prepare-release`", "本地默认主分支", "随后按 `post_release_action` 进入现有本地打包流程或 `push-release`",
  ]],
  ["verification", ["候选 E2E、完整验收、`pending` → `accepted` 状态更新和就绪复核", "仅写入忽略的 `release/` 原子候选集合", "本地主分支和本地版本 tag 指向同一提交", "独立回顾性人工复核或长期审计不得改写活动候选", "不得改写活动候选、覆盖历史失败或反向授予其 `accepted`/`ready`"]],
  ["upgradeSkill", ["不自动创建 Work Plan、Todo、并行 Worktree/Subagent 或完整验收步骤", "只有用户明确要求并行", "只运行本次升级实际影响的非空单元/回归测试", "不得因 Harness 升级自动追加全仓格式、lint、静态", "$desktop-manage-git-lifecycle", "$desktop-switch-post-release-action", "目标尚无该文件时保持缺席", "旧 schema 3 的 `selection_required` 必须询问用户", "`status: configured`"]],
  ["environmentSkill", ["只接受两类触发", "不得仅因首次修改代码、新任务、新会话、显式构建", "门禁成功后只重试原失败命令一次", "缺少环境证据或工具链版本可能变化而增加探测"]],
  ["upgradePolicy", ["managed", "managed-self", "merge-sections", "conditional", "protected", "tombstone", "`post_release_action` 也属于 protected 下游选择", "$desktop-switch-post-release-action"]],
];

function currentRuleFiles() {
  const fixed = [
    path.join(ROOT, "README.md"), path.join(ROOT, "AGENTS.md"), path.join(ROOT, "docs", "AGENT_POLICY.md"),
    path.join(ROOT, "docs", "ENGINEERING_RULES.md"), DEFAULT_PATHS.productSpec, path.join(ROOT, "docs", "RUST_CLI_TEMPLATE.md"),
    path.join(ROOT, "docs", "RELEASE.md"), path.join(ROOT, "docs", "VERIFICATION.md"), path.join(ROOT, "docs", "work_plan", "README.md"),
    ...["foundations.md", "agent_first_design.md", "project_lifecycle.md"].map((name) => path.join(ROOT, "docs", "harness_engineering", name)),
  ];
  let skills = [];
  try {
    skills = fs.readdirSync(SKILLS_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory()).map((entry) => path.join(SKILLS_ROOT, entry.name, "SKILL.md")).sort();
  } catch {
    // Missing Skills are reported by their explicit contracts; this scan stays bounded.
  }
  return [...fixed, ...skills];
}

/** 校验最小开发闭环、构建记录边界、全量构建单测和显式并行。 */
export function validateStreamlinedDevelopmentAndBuild(errors, options = {}) {
  const paths = resolvedPaths(options.paths);
  const texts = checkEntries(errors, paths, STREAMLINED_ENTRIES, "missing streamlined workflow contract file", "streamlined workflow rule missing");

  const lifecycleModules = ["gitLifecycleEntry", "gitLifecycleCore", "gitLifecyclePublication", "gitLifecycleTests", "gitLifecycleReleaseTests", "gitPublicationTests"]
    .filter((key) => texts.has(key))
    .map((key) => paths[key]);
  for (const [filePath, detail] of nodeSyntaxErrors(lifecycleModules)) {
    if (detail !== null) fail(errors, `invalid Git lifecycle Node module ${relativePath(filePath)}: ${detail}`);
  }

  const forbiddenTierFragments = ["每项任务使用一种路径", "快速路径", "标准路径", "里程碑路径", "当前任务路径", "推荐敏捷预设"];
  for (const filePath of options.currentRuleFiles ?? currentRuleFiles()) {
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(fs.readFileSync(filePath)); } catch { continue; }
    for (const fragment of forbiddenTierFragments) {
      if (text.includes(fragment)) fail(errors, `obsolete tiered workflow remains in ${relativePath(filePath)}: ${fragment}`);
    }
  }

  const helperText = (texts.get("parallelScript") ?? "").replace(
    /export function rollbackCreatedUnit\b[\s\S]*?(?=\nexport function inspectProject\b)/u,
    "",
  );
  for (const fragment of ["git stash", "git commit", "--force", '"branch", "-D"']) {
    if (helperText.includes(fragment)) fail(errors, `unsafe parallel helper behavior present: ${fragment}`);
  }
}

export { DEFAULT_PATHS };
