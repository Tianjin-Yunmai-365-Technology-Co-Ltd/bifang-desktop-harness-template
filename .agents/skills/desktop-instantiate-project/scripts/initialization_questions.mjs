/** 初始化问句的唯一目录；选项值供解析器使用，中文文案直接供所有模型展示。 */
export const QUESTIONS = [
  { id: "name_zh", number: 1, title: "中文项目展示名称是什么？", help: "中英文至少提供一个；另一名称由 Agent 翻译，在最终汇总中确认。" },
  { id: "name_en", number: 2, title: "英文项目展示名称是什么？", help: "中英文至少提供一个；另一名称由 Agent 翻译，在最终汇总中确认。" },
  { id: "project_id", number: 3, title: "项目标识是什么？", help: "ASCII snake_case，匹配 ^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$；建议值仍需你确认。" },
  { id: "project_path", number: 4, title: "项目放在哪里？", help: "提供最终项目根目录或父目录；相对路径以 Harness 根目录为基准。" },
  { id: "owner", number: 5, title: "项目负责人或责任主体是谁？" },
  { id: "target_platforms", number: 6, title: "支持哪些目标平台？可多选。", options: ["Windows", "macOS", "Linux"], values: ["windows", "macos", "linux"] },
  { id: "interfaces", number: 7, title: "需要哪些程序类型？可多选。", options: ["命令行(CLI，默认)", "终端UI(TUI)", "MCP", "桌面应用(GUI)"], values: ["cli", "tui", "mcp", "gui"], defaultValue: ["cli"], help: "明确选择默认值或跳过才使用 CLI；未答复会继续等待，选择其他接口不会附加 CLI。" },
  { id: "policy_mode", number: 8, title: "使用哪种 Agent 策略？", options: ["推荐预设", "自定义"], values: ["recommended", "custom"], help: "推荐预设：自动 Task、Task 独立工作树、superpowers、内部并行关闭；候选验收冒烟允许；候选 E2E 建议关闭。自定义按此顺序逐项选择。发布后动作单独确认。" },
  { id: "post_release_action", number: 9, title: "未来 Git 发布完成后执行什么动作？", options: ["本地打包（推荐默认）", "提交远程"], values: ["local_package", "push_release_branch"], defaultValue: "local_package", help: "须明确选择或确认可执行的默认值；初始化只记录选择，不打包、不访问远端、不配置远端或凭据。" },
  { id: "gui_framework", title: "要创建哪种桌面应用？", options: ["1. Tauri（默认）", "2. GPUI"], values: ["tauri", "gpui"], defaultValue: "tauri" },
  { id: "user_owned_tasks", title: "是否按结果边界自动创建左侧 Task？", help: "推荐关闭；明确单次创建 Task 不改变永久开关。", defaultValue: "disabled" },
  { id: "task_worktrees", title: "是否为 Git 左侧 Task 使用独立工作树？", help: "推荐关闭；仅选择 Task 的 Worktree/Local 环境，不开启自动 Task 或内部并行。未回答不能视为确认关闭。", defaultValue: "disabled" },
  { id: "superpowers", title: "是否允许按任务需要使用 superpowers Skills？", help: "关闭时禁止调用或遵循 superpowers:*；开启只表示允许，不代表每次都执行。" },
  { id: "parallel_worktree_subagents", title: "是否允许在明确请求并行时使用内部写入型 Subagent Worktree？", help: "只控制当前结果内部并行，不开启左侧 Task 或 Task 独立工作树。" },
  { id: "acceptance_smoke", title: "是否允许在完整真实候选验收中执行适用的冒烟测试？", help: "只用于候选验收，不向日常开发追加测试。" },
  { id: "e2e_hint", title: "以后每次发布候选构建询问 E2E 时，是否建议启用？", help: "只是建议默认值；每次候选仍须明确选择，本地开发试包不使用此选择。" },
  { id: "system_tray", title: "是否安装系统托盘能力？", help: "中性菜单只含显示窗口/退出；启用后按框架合同处理关闭隐藏与恢复。" },
  { id: "system_notification", title: "是否安装系统通知能力？", help: "设置页提供默认关闭的开关；选择能力不授权发送通知或更改本机权限。" },
  { id: "autostart", title: "是否安装开机自启能力？", help: "设置页提供实际 OS 状态开关；初始化不替你注册登录项。" },
  { id: "about_page", title: "是否建立关于页？" },
  { id: "sponsor_page", title: "是否建立赞助页？", help: "启用后使用固定支持页与本地媒体；不授权自动支付。" },
  { id: "single_instance", title: "是否启用单实例？", help: "再次启动只恢复并聚焦已有主窗口，不转发业务载荷。" },
  { id: "deep_link", title: "是否启用只恢复主窗口的深链接？", help: "URL 为 app-<kebab-prefix>://restore；启用必须同时启用单实例。" },
  { id: "global_shortcut", title: "是否安装全局快捷键能力？", help: "只安装 Rust-only 能力；contract 为 actions = []，零默认 chord、零 OS 注册，不创建产品动作或占位界面。" },
  { id: "sidebar_mode", title: "使用哪种侧栏模式？", options: ["精简 compact", "详细 detailed（默认）"], values: ["compact", "detailed"], defaultValue: "detailed" },
  { id: "capability_setup_assistance", title: "初始化完成并切换到下游后，是否协助配置已启用的桌面能力？", options: ["需要", "暂不需要"], values: ["yes", "no"], help: "本阶段只记录移交意愿；通知事件、键位和额外菜单等产品内容在终端下游确认。此项不进入九字段 profile 或 Agent Policy。" },
];

/** 推荐预设、策略顺序与 profile 顺序集中定义，避免入口各自展开。 */
export const POLICY_PRESET = Object.freeze({
  user_owned_tasks: "disabled", task_worktrees: "disabled", superpowers: "disabled",
  parallel_worktree_subagents: "disabled", acceptance_smoke: "enabled", e2e_hint: "disabled",
});
export const POLICY_FIELDS = Object.keys(POLICY_PRESET);
export const GUI_FIELDS = ["system_tray", "system_notification", "autostart", "about_page", "sponsor_page", "single_instance", "deep_link", "global_shortcut", "sidebar_mode"];
export const DESKTOP_FIELDS = ["system_tray", "system_notification", "autostart", "single_instance", "global_shortcut"];
export const BASE_FIELDS = QUESTIONS.slice(0, 9).map(({ id }) => id);

/** 最终确认同样使用固定问句，不把预设确认或超时解释为创建授权。 */
export const REVIEW_QUESTION = { id: "confirm_summary", title: "是否按以上完整汇总创建项目？", options: ["确认创建", "修改信息"] };

/** 为完整汇总生成当前路径必需提示；它们随汇总摘要绑定，模型只负责排版。 */
export function summaryNotices(values) {
  const notices = [
    "目标平台、接口与适用的 gui-framework 写入根 Cargo metadata；六项策略及发布后动作写入 Agent Policy。",
    "发布后动作只记录未来 Git 发布后的选择；初始化不打包、不访问远端、不配置远端或凭据。",
    "首次写入前重新校验目标与本次汇总确认；脚手架生成不代表产品已验收。",
  ];
  if (!values.interfaces.includes("gui")) return notices;
  notices.push("GUI Logo 在本汇总确认后的执行阶段选择：按 candidate-1 → candidate-2 → candidate-3 展示三个原始候选；选择后只验证和标准化所选项。");
  if (values.gui_framework === "tauri") {
    notices.push("Tauri 使用 desktop-add-gui-adapter 与 desktop-test-gui-initialization-e2e；system-locale/updater/window-state/dialog 是四项固定基线，主窗口精确 dialog:default 不授权通用文件读写。发布候选打包使用 desktop-build-tauri-release。");
    if (values.deep_link === "enabled") notices.push(`深链接只恢复主窗口：app-${values.project_id.replaceAll("_", "-")}://restore；单实例已启用。`);
  } else {
    notices.push("GPUI 使用 Rust/gpui-kit、desktop-add-gpui-adapter 与 desktop-test-gpui-initialization-e2e，不接入 Tauri 专属基线；深链接 unavailable/disabled，目标含 Linux 时托盘与全局快捷键同样不可用。",
      "GPUI 本地候选由 desktop-build-gpui-release 构建 macOS app/DMG、Windows NSIS 或 Linux GNU x64/ARM64 deb/tar.gz；当前声明不代表跨平台结果已验证。");
  }
  if (values.interfaces.includes("cli")) notices.push("CLI 与 GUI 组合分别使用对应打包 Skill 生成真实产物，不互相冒充。");
  if (values.global_shortcut === "enabled") notices.push("全局快捷键只安装 Rust-only 能力；contract 为 actions = []，零默认 chord、零 OS 注册、零产品动作和占位界面。");
  notices.push("能力依赖只按选择建立；代码生成不证明宿主能力已验证。配置协助只记录移交意愿，不进入九字段 profile 或 Agent Policy；产品动作在终端下游确认。");
  return notices;
}

/** 返回独立问题副本，二态字段统一以启用/关闭展示，不允许调用方改动目录。 */
export function questionFor(id, issue) {
  const definition = QUESTIONS.find((question) => question.id === id);
  if (!definition) throw new Error(`未知初始化字段：${id}`);
  const question = structuredClone(definition);
  if (!question.options && [...POLICY_FIELDS, ...GUI_FIELDS.slice(0, -1)].includes(id)) {
    question.options = ["启用", "关闭"];
    question.values = ["enabled", "disabled"];
  }
  if (issue) question.issue = issue;
  return question;
}
