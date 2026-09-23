import fs from "node:fs";
import path from "node:path";

import { ROOT, SKILLS_ROOT, fail, readText, relativePath } from "./core.mjs";

function latest(directory, pattern) {
  if (!fs.existsSync(directory)) return path.join(directory, "__missing_latest__.md");
  const matches = fs.readdirSync(directory).filter((name) => pattern.test(name)).sort();
  return path.join(directory, matches.at(-1) ?? "__missing_latest__.md");
}

const skill = (name, ...parts) => path.join(SKILLS_ROOT, name, ...parts);
const docs = (...parts) => path.join(ROOT, "docs", ...parts);
const productSpecDirectory = docs("product_spec");
const productStatusDirectory = docs("project_status");
const workPlanDirectory = docs("work_plan");
const adrDirectory = docs("adr");
const changelogDirectory = docs("changelog");

export const PRODUCT_SPEC = latest(productSpecDirectory, /^\d{8}_product_spec\.md$/u);
export const PRODUCT_STATUS = latest(productStatusDirectory, /^\d{8}_product_status\.md$/u);
export const WORK_PLAN = latest(workPlanDirectory, /^\d{8}_work_plan\.md$/u);
export const TUI_SKILL = skill("desktop-add-tui-adapter", "SKILL.md");
export const TUI_BASELINE = skill("desktop-add-tui-adapter", "references", "tui-baseline.md");
export const MCP_SKILL = skill("desktop-add-mcp-adapter", "SKILL.md");
export const MCP_BASELINE = skill("desktop-add-mcp-adapter", "references", "mcp-baseline.md");
export const REACT_BASELINE = skill("desktop-add-gui-adapter", "references", "react-frontend-baseline.md");

const CLI_SKILL = skill("desktop-add-cli-adapter", "SKILL.md");
const GUI_SKILL = skill("desktop-add-gui-adapter", "SKILL.md");
const ENVIRONMENT_SKILL = skill("desktop-check-development-environment");
const PREREQUISITE_UNIX = path.join(ENVIRONMENT_SKILL, "scripts", "development-environment-gates.sh");
const PREREQUISITE_WINDOWS = path.join(ENVIRONMENT_SKILL, "scripts", "development-environment-gates.ps1");
const PREREQUISITE_FIXTURE = path.join(ENVIRONMENT_SKILL, "scripts", "environment_gates_fixture.mjs");
const PREREQUISITE_TESTS = path.join(ENVIRONMENT_SKILL, "scripts", "environment_gates_detection.test.mjs");
const PREREQUISITE_WINDOWS_TESTS = path.join(ENVIRONMENT_SKILL, "scripts", "environment_gates_windows.test.mjs");
const MACOS_XWIN_GATE = path.join(ENVIRONMENT_SKILL, "scripts", "macos-tauri-xwin-gates.sh");
const RUST_ASSET = skill("desktop-initialize-rust-project", "assets", "rust-lib-cli");
const WORKFLOW = skill("desktop-prepare-cross-platform-release", "assets", "github-release-candidate.yml");
const ENGINEERING_RULES = docs("ENGINEERING_RULES.md");
const AGENT_POLICY = docs("AGENT_POLICY.md");
const INSTANTIATE_FORM = skill("desktop-instantiate-project", "references", "initialization-form.md");

function display(filePath) {
  return relativePath(filePath);
}

function regularFile(filePath) {
  try {
    const stat = fs.lstatSync(filePath);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function sourceText(errors, filePath, missingMessage) {
  if (!regularFile(filePath)) {
    fail(errors, `${missingMessage}: ${display(filePath)}`);
    return null;
  }
  try {
    return readText(filePath);
  } catch (error) {
    fail(errors, `${missingMessage}: ${display(filePath)}: ${error.message}`);
    return null;
  }
}

/** 锁定 TUI/MCP/GUI 候选版本与真实下游验证证据的边界。 */
export function validateUnverifiedAdapterDependencyContract(errors, overrides = {}) {
  const paths = {
    tuiSkill: overrides.tuiSkill ?? TUI_SKILL,
    tuiBaseline: overrides.tuiBaseline ?? TUI_BASELINE,
    mcpSkill: overrides.mcpSkill ?? MCP_SKILL,
    mcpBaseline: overrides.mcpBaseline ?? MCP_BASELINE,
    reactBaseline: overrides.reactBaseline ?? REACT_BASELINE,
  };
  const required = new Map([
    [paths.tuiSkill, ["经 registry 元数据筛选的 TUI 候选完整三段下界", "在真实 TUI 下游完成最低直接版本解析和测试前保持 `Unverified`", "只有实际通过后才把候选称为项目兼容下界"]],
    [paths.tuiBaseline, ["经 registry 元数据筛选的候选组合", "在真实 TUI 下游完成最低直接版本解析和 Rust 1.98.1 测试前保持 `Unverified`", "只把实际验证通过的版本写成项目兼容下界"]],
    [paths.mcpSkill, ["经 registry 元数据筛选的 MCP 候选完整三段下界", "在真实 MCP 下游完成最低直接版本解析和 Rust 1.98.1 测试前保持 `Unverified`", "只有实际通过后才把候选称为项目 Cargo 兼容下界"]],
    [paths.mcpBaseline, ["经过 registry 元数据筛选的候选完整三段下界", "在真实 MCP 下游完成最低直接版本解析和 Rust 1.98.1 测试前保持 `Unverified`", "只有最低直接版本解析与 Rust 1.98.1 实测通过后才可作为项目 Cargo 兼容下界"]],
    [paths.reactBaseline, ["经 registry 元数据、peer 与 engine 筛选的 GUI 前端候选完整三段下界", "在真实 GUI 下游完成最低 Node.js/pnpm、lowest-direct 解析、类型检查、非空测试与生产构建前保持 `Unverified`", "实际通过后才可成为该项目的兼容下界"]],
  ]);
  for (const [filePath, fragments] of required) {
    const text = sourceText(errors, filePath, "missing adapter dependency evidence contract");
    if (text === null) continue;
    for (const fragment of fragments) {
      if (!text.includes(fragment)) fail(errors, `adapter dependency evidence contract missing in ${display(filePath)}: ${fragment}`);
    }
  }
  const superseded = new Map([
    [paths.tuiSkill, ["TUI 最低兼容稳定组合及当前完整三段下界为"]],
    [paths.tuiBaseline, ["上表是已验证的最低兼容稳定组合"]],
    [paths.mcpSkill, ["MCP 最低兼容稳定下界为"]],
    [paths.mcpBaseline, ["作为新的 Cargo 兼容下界"]],
    [paths.reactBaseline, ["当前已核定的 GUI 前端直接兼容下界如下"]],
  ]);
  for (const [filePath, fragments] of superseded) {
    if (!regularFile(filePath)) continue;
    const text = readText(filePath);
    for (const fragment of fragments) {
      if (text.includes(fragment)) fail(errors, `unverified adapter dependency baseline is overstated in ${display(filePath)}: ${fragment}`);
    }
  }
}

/** 区分已实测 CLI fixture 与仍待真实下游证明的候选下界。 */
export function validateDependencyEvidenceContract(errors, options = {}) {
  const productSpec = options.productSpec ?? PRODUCT_SPEC;
  const readme = options.readme ?? path.join(ROOT, "README.md");
  const engineeringRules = options.engineeringRules ?? ENGINEERING_RULES;
  const text = sourceText(errors, productSpec, "missing dependency evidence contract");
  if (text === null) return;
  const required = [
    "依赖清单以完整三段、可在项目最低工具链证明的兼容下界为目标",
    "中性 Rust CLI fixture 的 Cargo 直接依赖已经在 Rust `1.98.1` 上完成最低直接版本解析",
    "`rmcp 3.3.0`、TUI 和 GUI/React 的版本数值仅为截至 2026-09-12 经 registry metadata、peer 与 engine 筛选的候选完整三段下界",
    "继续保持 `Unverified`",
    "实例化真实下游时必须在项目最低 Rust/Node.js/pnpm 工具链执行最低直接版本解析",
    "成功后才能成为该项目的兼容下界",
    "中性 Rust CLI fixture 的 Cargo 依赖已在最低 Rust 工具链实测；TUI/MCP/GUI 数值仍为 `Unverified` 候选",
  ];
  for (const fragment of required) {
    if (!text.includes(fragment)) fail(errors, `dependency evidence contract missing in ${display(productSpec)}: ${fragment}`);
  }
  for (const fragment of [
    "本次在 Rust `1.98.1`、Node.js `>=24.21.0` 与 pnpm `>=12.4.1` 门禁下验证后，把 MCP",
    "前端/Rust 直接依赖统一表达为经过验证的最低兼容范围",
  ]) {
    if (text.includes(fragment)) fail(errors, `unverified dependency baseline is overstated in ${display(productSpec)}: ${fragment}`);
  }
  const heading = "### 主流环境下界、标准当前用户安装与最新兼容稳定选择";
  const start = text.indexOf(heading);
  const end = start >= 0 ? text.indexOf("\n### ", start + heading.length) : -1;
  const environmentText = start < 0 ? "" : text.slice(start, end >= 0 ? end : undefined);
  for (const fragment of ["经过验证", "本次验证后"]) {
    if (environmentText.includes(fragment)) fail(errors, `unverified dependency baseline is overstated in ${display(productSpec)}: ${fragment}`);
  }
  const positiveClaims = [
    /(?:rmcp|TUI|MCP|GUI(?:\/React)?).{0,100}(?:已经|均已|全部已|已完成).{0,16}(?:验证|实测|通过)/su,
    /(?:已经|均已|全部已|已完成).{0,16}(?:验证|实测|通过).{0,100}(?:rmcp|TUI|MCP|GUI(?:\/React)?)/su,
    /(?:所有|全部).{0,20}(?:直接依赖|依赖).{0,24}(?:已经|均已|全部已|已完成|已).{0,16}(?:验证|实测|通过)/su,
  ];
  for (const pattern of positiveClaims) {
    if (pattern.test(environmentText)) fail(errors, `unverified dependency baseline is overstated in ${display(productSpec)}: ${pattern.source}`);
  }
  const supporting = new Map([
    [readme, ["依赖清单以完整三段、可在项目最低工具链证明的兼容下界为目标", "当前只有中性 Rust CLI fixture 的 Cargo 直接依赖已在 Rust 1.98.1 上完成最低直接版本解析", "TUI、MCP、GUI/React 数值仍是经 registry metadata、peer 与 engine 筛选的候选", "保持 `Unverified`"]],
    [engineeringRules, ["只有这些真实项目检查通过后才可称为“经过验证”", "尚无真实下游的 TUI/MCP/GUI 模板数值只能作为 registry metadata、peer 与 engine 筛选后的候选并标记 `Unverified`"]],
  ]);
  const forbidden = new Map([
    [readme, ["依赖清单保存经过验证的最低兼容稳定版本范围"]],
    [engineeringRules, ["直接依赖和受管工具的清单必须表达经过验证的最低兼容范围"]],
  ]);
  for (const [filePath, fragments] of supporting) {
    const source = sourceText(errors, filePath, "missing dependency evidence contract");
    if (source === null) continue;
    for (const fragment of fragments) {
      if (!source.includes(fragment)) fail(errors, `dependency evidence contract missing in ${display(filePath)}: ${fragment}`);
    }
    for (const fragment of forbidden.get(filePath)) {
      if (source.includes(fragment)) fail(errors, `unverified dependency baseline is overstated in ${display(filePath)}: ${fragment}`);
    }
  }
}

const STALE_FRAGMENTS = [
  "每个会修改仓库或执行交付工作的任务", "Before substantive execution of each repository-changing or delivery task", "current repository-changing or delivery task",
  "仅在产品定义或范围设计、实施计划设计，以及代码或实现变更阶段", "仅在产品定义/范围设计、实施计划设计和代码/实现变更阶段", "Before substantive product/scope design, implementation planning, or code/implementation work",
  "授权只对当前任务有效", "选择只对当前任务有效", "不得跨任务继承", "最小只读冒烟", "所有 Agent-first 项目必须证明 CLI 闭环", "CLI 永远是最小 MVP", "CLI 不可替代",
  "建立可测试的 CLI 与结构化输出契约", "若包含 MCP，CLI 与 MCP 使用同一应用服务和错误模型", "实例化不得自动创建嵌套 Git", "Git 初始化是另行显式动作", "no-auto-commit", "do not create a commit", "初始化不得自动创建 commit",
  "当前 Harness 根目录的直接子文件夹", "<项目标识>-CLI", "<项目标识>-MCP", "<项目标识>-gui", "每份活动工作计划必须包含 `Todo` 批次和对应验证里程碑", "每轮 Todo 开发必须执行非空单元测试",
  "每个已确认需求形成当日独立 ADR 条目", "一次性要求用户分别为 Superpowers", "不得为缺失答案设置默认值或遗留 `pending`", "新增、变化、修复、移除、安全事项", "规格转为 `Approved` 前必须存在真实日期记录",
  "显式构建若缺少与当前接口、MSRV、前端策略、宿主和目标匹配的可复用证据", "显式构建需要不可复用的工具链证据", "显式构建的环境证据不可复用时才检查环境", "缺少可复用证据时才调用 `$desktop-check-development-environment`",
  "每次回复只询问一个最靠前的 `待询问`", "每轮只询问一个最靠前的未解析字段", "复用表单中已经按需逐项确认的五项值", "最终五项配置不得缺失或残留 `pending`", "五项初始化配置",
  "依次解析系统托盘、关于页、赞助页、单实例的启用/禁用", "表单、环境门禁、脚手架编写、测试和一次性裁剪阶段都不检查 Git", "Git 只在真实基线提交前即时检查和设置", "不会提前检查或设置 Git",
  "选择 GUI 时还包括六项能力", "GUI 下游另输出包含七项最终配置", "结构检查解析七项 profile", "GUI 选择后必须完成七项专门问询", "固定通过七项 profile-aware", "首次真实 GUI 下游对七项初始化组合",
  "{task}-{id}-{feature}", "{任务}-{ID}-{摘要}", "状态不得进入标题", "状态不入标题", "Session 收尾契约至多调用一次", "普通 Session 收尾命名", "{Task}|{序号}|{功能摘要}{当前进度}", "内部 agent 不套用",
  "内部 Subagent、agent thread 和内部单元 Worktree 不执行该操作", "只更新进度后缀", "稳定三部分与合法四态后缀", "普通当前 Session 没有可复用值时从 `1` 开始", "当前 Session 没有可复用序号时使用 `1`",
  "分别按该批次顺序从 `1` 分配", "左侧 Task 与 Subagent 批次分别按派发顺序从 `1` 分配", "按当前协调批次分配稳定序号", "普通 Session 无既有值时从 `1` 开始", "左侧 Task 与 Subagent 各自按当前派发批次顺序从 `1` 分配",
  "序号只在当前 Session 或同一协调/派发批次内稳定", "{序号}|{Task简述}|{当前进度} |{功能摘要}",
];

/** 拒绝旧接口、Git 或协作触发规则重新进入指定当前事实源。 */
export function validateStaleFragments(errors, paths) {
  for (const filePath of paths) {
    if (!regularFile(filePath)) continue;
    const text = readText(filePath);
    for (const fragment of STALE_FRAGMENTS) {
      if (text.includes(fragment)) fail(errors, `stale current description in ${display(filePath)}: ${fragment}`);
    }
  }
}

function markdownFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter((name) => name.endsWith(".md")).sort().map((name) => path.join(directory, name));
}

function currentSkillFiles() {
  const accepted = new Set([".md", ".yaml", ".yml", ".toml", ".mjs", ".cjs", ".js", ".ps1", ".sh"]);
  const output = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && accepted.has(path.extname(entry.name).toLowerCase())) output.push(absolute);
    }
  };
  visit(SKILLS_ROOT);
  return output.sort();
}

function validateFragmentMap(errors, entries, missingLabel, fragmentLabel) {
  for (const [filePath, fragments] of entries) {
    const text = sourceText(errors, filePath, missingLabel);
    if (text === null) continue;
    for (const fragment of fragments) {
      if (!text.includes(fragment)) fail(errors, `${fragmentLabel} in ${display(filePath)}: ${fragment}`);
    }
  }
}

/** 拒绝已被当前接口、Git 与治理规则替代的规范描述重新进入有效事实源。 */
export function validateCurrentDescriptions(errors, options = {}) {
  const reactBaseline = options.reactBaseline ?? REACT_BASELINE;
  validateDependencyEvidenceContract(errors, options);
  validateUnverifiedAdapterDependencyContract(errors, { ...options, reactBaseline });
  const currentFiles = [
    path.join(ROOT, "README.md"), path.join(ROOT, "AGENTS.md"), PRODUCT_SPEC, PRODUCT_STATUS,
    docs("RUST_CLI_TEMPLATE.md"), docs("HARNESS_ENGINEERING.md"), ...markdownFiles(docs("harness_engineering")),
    docs("RELEASE.md"), ENGINEERING_RULES, AGENT_POLICY, path.join(productSpecDirectory, "README.md"),
    path.join(productStatusDirectory, "README.md"), path.join(workPlanDirectory, "README.md"), path.join(adrDirectory, "README.md"),
    path.join(changelogDirectory, "README.md"), WORK_PLAN, INSTANTIATE_FORM,
    ...fs.readdirSync(SKILLS_ROOT, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => path.join(SKILLS_ROOT, entry.name, "SKILL.md")),
  ];
  validateStaleFragments(errors, currentFiles);

  const productText = sourceText(errors, PRODUCT_SPEC, "missing GUI plugin product contract");
  if (productText !== null) {
    for (const fragment of ["HARNESS-FEAT-GUI-PLUGIN-CAPABILITY-MODULES", "`os`（system-locale）、updater、window-state 是不询问的三项 Rust-only 固定基线，dialog 是不询问的固定 WebView 基线", "八项条件能力的启用/禁用", "包含九项最终配置、三项 Rust-only 固定基线、dialog 固定 WebView 基线", "`deep_link = enabled` 必须同时有 `single_instance = enabled`"]) {
      if (!productText.includes(fragment)) fail(errors, `GUI plugin product contract missing in ${display(PRODUCT_SPEC)}: ${fragment}`);
    }
  }

  const msrv = [
    [PRODUCT_SPEC, ["MSRV（即 MSRV 1.98.1）", "最低兼容版本而非精确版本锁", "Rust 1.98.1 MSRV"]],
    [docs("RUST_CLI_TEMPLATE.md"), ['| MSRV | `1.98.1` |', 'rust-version = "1.98.1"', "不要求精确等于 1.98.1", "使用该声明的最低 Rust 工具链"]],
    [docs("RELEASE.md"), ["最低 Rust 版本 1.98.1"]],
    [PREREQUISITE_UNIX, ["MIN_RUST_MAJOR=1", "MIN_RUST_MINOR=98", "MIN_RUST_PATCH=1"]],
    [PREREQUISITE_WINDOWS, ["$MinimumRustMajor = 1", "$MinimumRustMinor = 98", "$MinimumRustPatch = 1"]],
    [PREREQUISITE_FIXTURE, ['rust = "1.98.1"']],
    [PREREQUISITE_TESTS, ['rust: "1.98.0"', '"1.99.0"', '"2.0.0"']],
    [PREREQUISITE_WINDOWS_TESTS, ['rust = "1.98.1"', '["24.21.0", 0, "passed"]']],
    [path.join(RUST_ASSET, "Cargo.toml"), ['rust-version = "1.98.1"']],
    [WORKFLOW, ["读取项目最低 Rust 版本", "release_candidate_workflow.mjs read-msrv", 'rustup toolchain install "$RUSTUP_TOOLCHAIN"']],
  ];
  validateFragmentMap(errors, msrv, "missing MSRV contract file", "Rust 1.98.1 MSRV contract missing");

  const minimumVersions = [
    [ENGINEERING_RULES, ["完整三段表达可验证的兼容下界", "当前最新非预发布候选", "锁文件与兼容要求职责分离"]],
    [PRODUCT_SPEC, ["最新兼容稳定选择", "优先选择 registry 当前最新兼容稳定版"]],
    [docs("RUST_CLI_TEMPLATE.md"), ["最低兼容版本策略", "direct-minimal-versions", "resolutionMode: lowest-direct"]],
    [CLI_SKILL, ["完整三段 Cargo 兼容下界", "最低直接版本解析"]],
    [TUI_SKILL, ["TUI 候选完整三段下界", "direct-minimal-versions", "`Unverified`"]],
    [TUI_BASELINE, ["registry 元数据筛选的候选组合", "最低直接版本解析", "`Unverified`"]],
    [MCP_SKILL, ["MCP 候选完整三段下界", "最低直接版本解析", "`Unverified`"]],
    [MCP_BASELINE, ["候选完整三段下界", "最低直接版本解析", "`Unverified`"]],
    [GUI_SKILL, ["最低兼容稳定范围", "最低直接版本解析"]],
    [reactBaseline, ["GUI 前端候选完整三段下界", "`Unverified`", "engines.node", "engines.pnpm", "resolutionMode: lowest-direct"]],
    [path.join(ENVIRONMENT_SKILL, "SKILL.md"), [">=24.21.0", ">=12.4.1", "upgrade-required", "不得降低项目门槛"]],
    [path.join(ENVIRONMENT_SKILL, "references", "development-environment-gates.md"), [">=24.21.0", ">=12.4.1", ">=0.23.1, <0.24.0", "upgrade-required", "不得降低最低门禁"]],
    [PREREQUISITE_UNIX, ["NODE_REQUIREMENT='>=24.21.0'", "PNPM_REQUIREMENT='>=12.4.1'", "PNPM_INSTALL_REQUIREMENT='pnpm@>=12.4.1'"]],
    [PREREQUISITE_WINDOWS, ['$NodeRequirement = ">=24.21.0"', '$PnpmRequirement = ">=12.4.1"', '$PnpmInstallRequirement = "pnpm@>=12.4.1"']],
    [MACOS_XWIN_GATE, ["CARGO_XWIN_REQUIREMENT='>=0.23.1, <0.24.0'"]],
    [WORKFLOW, ["读取项目最低 Rust 版本", "release_candidate_workflow.mjs read-msrv"]],
  ];
  validateFragmentMap(errors, minimumVersions, "missing minimum-version contract file", "minimum-version contract missing");

  const dependencyFloors = [
    [path.join(RUST_ASSET, "Cargo.toml"), ['assert_cmd = "2.2.2"', 'clap = { version = "4.6.6"', 'jiff = "0.2.35"', 'serde = { version = "1.0.229"', 'serde_json = "1.0.151"', 'tokio = { version = "1.53.1"']],
    [MCP_SKILL, ["`rmcp 3.3.0`"]],
    [reactBaseline, ["`react` / `react-dom` | `^19.3.0`", "`@mantine/core` / `@mantine/hooks` | `^9.6.1`", "`@tanstack/react-router` | `^1.170.35`", "`@tanstack/router-plugin` | `^1.168.37`", "`i18next` | `^26.4.2`", "`react-i18next` | `^17.0.13`", "`vite` | `^8.3.0`", "`eslint` | `^10.10.0`", "`typescript-eslint` | `^8.70.0`", "`@types/node` | `^24.13.4`", "`@types/react` / `@types/react-dom` | `^19.3.0`", "`@testing-library/dom` | `^10.4.1`", "`@testing-library/user-event` | `^14.6.7`", "`jsdom` | `^29.0.1`", "不得升级到会重新排除 Node.js 25.x"]],
  ];
  validateFragmentMap(errors, dependencyFloors, "missing dependency-floor contract file", "dependency-floor contract missing");

  const superseded = ["pnpm@latest", "rustup toolchain install 1.90.0", "^20.19.0 || >=22.12.0", "pnpm@^10.0.0", ">=0.22.0, <0.24.0", "^30.0.1"];
  for (const [filePath] of minimumVersions) {
    if (!regularFile(filePath)) continue;
    const text = readText(filePath);
    for (const fragment of superseded) {
      if (text.includes(fragment)) fail(errors, `superseded exact/latest version rule remains in ${display(filePath)}: ${fragment}`);
    }
  }
  for (const filePath of currentSkillFiles()) {
    const text = fs.readFileSync(filePath, "utf8");
    if (text.includes("1.85")) fail(errors, `obsolete Rust 1.85 compatibility remains in current Skill content: ${display(filePath)}`);
  }
}
