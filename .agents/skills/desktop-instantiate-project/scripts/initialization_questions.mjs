/** 初始化问句的唯一目录；选项值供解析器使用，中文文案直接供所有模型展示。 */
export const QUESTIONS = [
  { id: "name_zh", number: 1, title: "中文项目展示名称是什么？", alternateAction: { label: "改用英文名", value: "skip" }, help: "中英文至少提供一个；若只提供英文名，可点击“改用英文名”。另一名称由 Agent 翻译，在最终汇总中确认。" },
  { id: "name_en", number: 2, title: "英文项目展示名称是什么？", alternateAction: { label: "改用中文名", value: "skip" }, help: "中英文至少提供一个；若改为提供中文名，可点击“改用中文名”。另一名称由 Agent 翻译，在最终汇总中确认。" },
  { id: "project_id", number: 3, title: "项目标识是什么？", help: "ASCII snake_case，匹配 ^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$；建议值仍需你确认。" },
  { id: "project_path", number: 4, title: "项目放在哪里？", help: "提供最终项目根目录或父目录；相对路径以 Harness 根目录为基准。" },
  { id: "owner", number: 5, title: "项目负责人或责任主体是谁？" },
  { id: "interfaces", number: 6, title: "需要哪些程序类型？可多选。", inputMode: "multiple", options: ["命令行(CLI，默认)", "MCP", "桌面应用(DESKTOP，Tauri)", "NSH：下一代全平台开发框架"], values: ["cli", "mcp", "gui", "nsh"], defaultValue: ["cli"], help: "CLI、MCP 可互相组合，也可与 DESKTOP 组合；DESKTOP 与 NSH 互斥，NSH 只能单选。明确选择默认值或跳过才使用 CLI；未答复会继续等待，选择其他接口不会附加 CLI。CLI/MCP/DESKTOP 默认支持 Windows、macOS、Linux 全平台；NSH 另问能力并派生对应平台。" },
  { id: "nsh_targets", title: "NSH 要支持哪些能力？可多选。", inputMode: "multiple", options: ["桌面", "移动", "Web"], values: ["desktop", "mobile", "web"], help: "选择桌面即支持 Windows、macOS、Linux 全部系统；选择移动即支持 Android、iOS；选择 Web 即支持 Web。目标平台由本题自动确定并在最终汇总中确认。当前只使用正式发布的 NSH v0.4.0 工具链；TUI 暂不可用。" },
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

/** 固定初始化策略与 profile 顺序集中定义，避免入口各自展开。 */
export const POLICY_PRESET = Object.freeze({
  user_owned_tasks: "disabled", task_worktrees: "disabled", superpowers: "disabled",
  parallel_worktree_subagents: "disabled", acceptance_smoke: "enabled", e2e_hint: "disabled",
});
export const POLICY_FIELDS = Object.keys(POLICY_PRESET);
export const GUI_FIELDS = ["system_tray", "system_notification", "autostart", "about_page", "sponsor_page", "single_instance", "deep_link", "global_shortcut", "sidebar_mode"];
export const DESKTOP_FIELDS = ["system_tray", "system_notification", "autostart", "single_instance", "global_shortcut"];
export const BASE_FIELDS = QUESTIONS.slice(0, 6).map(({ id }) => id);
export const NSH_TARGETS = ["desktop", "mobile", "web"];
export const NSH_PLATFORM_ORDER = ["windows", "macos", "linux", "android", "ios", "web"];
export const NSH_TARGET_PLATFORMS = Object.freeze({
  desktop: ["windows", "macos", "linux"],
  mobile: ["android", "ios"],
  web: ["web"],
});

/** 最终确认同样使用固定问句，不把预设确认或超时解释为创建授权。 */
export const REVIEW_QUESTION = { id: "confirm_summary", title: "是否按以上完整汇总创建项目？", inputMode: "single", options: ["确认创建", "修改信息"] };

/** 为完整汇总生成当前路径必需提示；它们随汇总摘要绑定，模型只负责排版。 */
export function summaryNotices(values) {
  const notices = [
    "目标平台、接口与适用的 gui-framework 或 nsh-targets 写入根 Cargo metadata；六项 Agent 策略按固定默认值写入 Agent Policy，不单独询问。",
    "发布后动作在首次发布前询问并记录；初始化保持 pending，不打包、不访问远端、不配置远端或凭据。",
    "首次写入前重新校验目标与本次汇总确认；脚手架生成不代表产品已验收。",
  ];
  const gui = values.interfaces.includes("gui");
  const nsh = values.interfaces.includes("nsh");
  if (!nsh) notices.push("CLI/MCP/DESKTOP 默认声明支持 Windows、macOS、Linux 全部系统；请核对本汇总中的具体平台，实际构建和验证仍按目标分别执行。");
  if (!gui && !nsh) return notices;
  if (gui || values.nsh_targets?.includes("desktop")) notices.push("应用 Logo 在本汇总确认后的执行阶段选择：按 candidate-1 → candidate-2 → candidate-3 展示三个原始候选；选择后只验证和标准化所选项。");
  if (values.gui_framework === "tauri") {
    notices.push("Tauri 使用 desktop-add-gui-adapter 与 desktop-test-gui-initialization-e2e；system-locale/window-state/dialog 是三项固定基线，主窗口精确 dialog:default 不授权通用文件读写。发布候选打包使用 desktop-build-tauri-release。");
    if (values.deep_link === "enabled") notices.push(`深链接只恢复主窗口：app-${values.project_id.replaceAll("_", "-")}://restore；单实例已启用。`);
  } else if (nsh) {
    notices.push("NSH 目标平台仅由所选能力自动确定：桌面对应 Windows、macOS、Linux 全部系统，移动对应 Android、iOS，Web 对应 Web；请核对本汇总中的具体平台。TUI 暂不可用，所有已选能力使用正式 v0.4.0 工具链。");
    notices.push(`NSH 是独立程序类型；已选能力：${values.nsh_targets.join('、')}。TSX 界面通过 Mixed 原生模块调用共享 Rust core；初始化使用 desktop-add-nsh-adapter 与 desktop-test-nsh-initialization-e2e。`,
      "NSH 桌面由已选平台的自定义宿主打包，Android、iOS 与 Web 使用适用的 NSH runner；正式 IPA 须另行完成签名和渠道流程，原生工具链与真实设备验证分别按目标执行，不宣称跨平台已验证。");
    if (values.nsh_targets.includes("desktop")) notices.push("NSH 桌面默认提供多窗口；托盘、自启、单实例、深链接逐项确认，深链接依赖单实例。系统通知和 OS 全局快捷键当前 unavailable/disabled；应用菜单快捷键不能冒充系统热键。");
  }
  if (values.interfaces.includes("cli") && gui) notices.push("CLI 与 GUI 组合分别使用对应打包 Skill 生成真实产物，不互相冒充。");
  if (values.global_shortcut === "enabled") notices.push("全局快捷键只安装 Rust-only 能力；contract 为 actions = []，零默认 chord、零 OS 注册、零产品动作和占位界面。");
  if (gui || values.nsh_targets.includes("desktop")) notices.push("能力依赖只按选择建立；代码生成不证明宿主能力已验证。配置协助只记录移交意愿，不进入九字段 profile 或 Agent Policy；产品动作在终端下游确认。");
  return notices;
}

/** 返回独立问题副本，二态字段统一以启用/关闭展示，不允许调用方改动目录。 */
export function questionFor(id, issue) {
  const definition = QUESTIONS.find((question) => question.id === id);
  if (!definition) throw new Error(`未知初始化字段：${id}`);
  const question = structuredClone(definition);
  if (!question.options && GUI_FIELDS.slice(0, -1).includes(id)) {
    question.options = ["启用", "关闭"];
    question.values = ["enabled", "disabled"];
  }
  question.inputMode ??= question.options ? "single" : "text";
  if (issue) question.issue = issue;
  return question;
}
