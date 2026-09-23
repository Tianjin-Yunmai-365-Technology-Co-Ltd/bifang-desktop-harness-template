import fs from "node:fs";
import path from "node:path";

import { ROOT, SKILLS_ROOT, fail, readText, relativePath } from "./core.mjs";

const PRODUCT_SPEC_DIR = path.join(ROOT, "docs", "product_spec");
const PRODUCT_STATUS_DIR = path.join(ROOT, "docs", "project_status");
const WORK_PLAN_DIR = path.join(ROOT, "docs", "work_plan");
const ADR_DIR = path.join(ROOT, "docs", "adr");
const CHANGELOG_DIR = path.join(ROOT, "docs", "changelog");

function datedFiles(directory, pattern) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((name) => pattern.test(name))
    .sort()
    .map((name) => path.join(directory, name));
}

function latestDatedFile(directory, pattern) {
  return datedFiles(directory, pattern).at(-1) ?? path.join(directory, "__missing_latest__.md");
}

const PRODUCT_SPEC = latestDatedFile(PRODUCT_SPEC_DIR, /^\d{8}_product_spec\.md$/u);

/** 拒绝当前 Changelog 重新陈述已被新 Task 标题格式替代的历史规则。 */
export function validateCurrentChangelogContract(errors, changelog) {
  if (!fs.existsSync(changelog)) return;
  const text = readText(changelog);
  const deprecatedClaims = [
    "标题固定使用“动作 + 结果”",
    "当前显示标题固定使用 `{任务}-{ID}-{摘要}`",
    "普通单结果请求在当前调用 Session 完成授权结果和本次必需检查后、最终回复前，至多一次尝试使用",
    "调用后返回的 `threadId`/`clientThreadId` 和可变状态不再反填标题",
    "标题不再携带可变状态",
    "当前调用 Session 与用户可见的 Worktree/Local 左侧 Task 统一使用 `{Task}|{序号}|{功能摘要}{当前进度}`",
    "内部 agent 不套用",
    "普通当前 Session 没有可复用值时从 `1` 开始",
    "当前 Session 没有可复用序号时使用 `1`",
    "左侧 Task 与 Subagent 批次分别按派发顺序从 `1` 分配",
    "按当前协调批次分配稳定序号",
    "普通 Session 无既有值时从 `1` 开始",
    "左侧 Task 与 Subagent 各自按当前派发批次顺序从 `1` 分配",
  ];
  for (const claim of deprecatedClaims) {
    if (text.includes(claim)) fail(errors, `current Changelog contains superseded Task title contract in ${relativePath(changelog)}: ${claim}`);
  }
}

/** 拒绝当前事实源重新引入旧候选状态、tracked 证据或倒置发布顺序。 */
export function validateSupersededReleaseLifecycleFragments(errors, contracts = null) {
  const activeContracts = contracts ?? [
    [path.join(WORK_PLAN_DIR, "README.md"), ["存在非 `done` 项时不得把该计划范围标记为 `accepted`"]],
    [PRODUCT_SPEC, ["明确区分 `pending` 与 `ready`"]],
    [path.join(ROOT, "docs", "RUST_CLI_TEMPLATE.md"), ["`pending`/`ready` 状态转换", "发布准备仍只接受"]],
    [path.join(SKILLS_ROOT, "desktop-collect-release-artifacts", "SKILL.md"), ["发布准备仍要求匹配的"]],
    [path.join(ROOT, "docs", "harness_engineering", "project_lifecycle.md"), ["发布候选或用户明确要求完整验收时使用 `$desktop-verify-delivery`，发布再进入 `$desktop-prepare-release`"]],
    [path.join(ROOT, "docs", "harness_engineering", "foundations.md"), ["完整验收/发布证据和技术债必须保存在版本化仓库中"]],
    [path.join(ROOT, "docs", "harness_engineering", "agent_first_design.md"), ["当前版本发布或完整验收完成", "版本号、CHANGELOG、Git 标签和发布物一致"]],
    [path.join(ROOT, "docs", "RELEASE.md"), ["Git 标签和源码归档中的版本一致", "软件显示、Git 标签和发布物名称一致"]],
  ];
  for (const [filePath, fragments] of activeContracts) {
    if (!fs.existsSync(filePath)) continue;
    const text = readText(filePath);
    for (const fragment of fragments) {
      if (text.includes(fragment)) fail(errors, `superseded release lifecycle wording in ${relativePath(filePath)}: ${fragment}`);
    }
  }
}

/** 校验五类按日项目记忆的命名、索引、触发边界和当前事实源。 */
export function validateDailyProjectMemory(errors) {
  const forbiddenLegacyFiles = [
    path.join(ROOT, "CHANGELOG.md"),
    path.join(ROOT, "docs", "DECISIONS.md"),
    path.join(ROOT, "docs", "PRODUCT_SPEC.md"),
    path.join(ROOT, "docs", "PROJECT_STATUS.md"),
    path.join(ROOT, "docs", "WORK_PLAN.md"),
  ];
  for (const filePath of forbiddenLegacyFiles) {
    if (fs.existsSync(filePath)) fail(errors, `legacy growing log must be removed: ${relativePath(filePath)}`);
  }

  const productApproved = fs.existsSync(PRODUCT_SPEC) && /状态[：:]\s*Approved/u.test(readText(PRODUCT_SPEC));
  const contracts = [
    [PRODUCT_SPEC_DIR, /^\d{8}_product_spec\.md$/u, "Product Spec", true, null],
    [PRODUCT_STATUS_DIR, /^\d{8}_product_status\.md$/u, "Product Status", true, null],
    [WORK_PLAN_DIR, /^\d{8}_work_plan\.md$/u, "Work Plan", false, null],
    [ADR_DIR, /^\d{8}_ADR\.md$/u, "ADR", productApproved, /^ADR_history(?:_\d+)?\.md$/u],
    [CHANGELOG_DIR, /^\d{8}_CHANGELOG\.md$/u, "Changelog", false, /^CHANGELOG_history(?:_\d+)?\.md$/u],
  ];
  for (const [directory, filenamePattern, label, datedFileRequired, historyPattern] of contracts) {
    if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
      fail(errors, `missing daily ${label} directory: ${relativePath(directory)}`);
      continue;
    }
    const index = path.join(directory, "README.md");
    const indexText = fs.existsSync(index) ? readText(index) : "";
    if (!fs.existsSync(index)) fail(errors, `missing daily ${label} index: ${relativePath(index)}`);
    let datedCount = 0;
    for (const name of fs.readdirSync(directory).filter((entry) => entry.endsWith(".md")).sort()) {
      if (name === "README.md") continue;
      if (historyPattern?.test(name)) {
        if (!indexText.includes(name)) fail(errors, `${label} history archive missing from index: ${relativePath(path.join(directory, name))}`);
        continue;
      }
      if (!filenamePattern.test(name)) {
        fail(errors, `invalid daily ${label} filename: ${relativePath(path.join(directory, name))}`);
        continue;
      }
      datedCount += 1;
      if (!indexText.includes(name)) fail(errors, `daily ${label} file missing from index: ${relativePath(path.join(directory, name))}`);
    }
    if (datedFileRequired && datedCount === 0) fail(errors, `no dated ${label} file found in ${relativePath(directory)}`);
  }

  const currentChangelog = datedFiles(CHANGELOG_DIR, /^\d{8}_CHANGELOG\.md$/u).at(-1);
  if (currentChangelog) validateCurrentChangelogContract(errors, currentChangelog);
  validateSupersededReleaseLifecycleFragments(errors);

  const requiredFragments = new Map([
    [path.join(PRODUCT_SPEC_DIR, "README.md"), ["YYYYMMDD_product_spec.md", "同一天只维护一份产品规格", "读取前一份产品规格", "产品目标、边界、约束或成功标准变化时", "普通缺陷修复、纯重构、格式整理、测试补强和内部清理"]],
    [path.join(PRODUCT_STATUS_DIR, "README.md"), ["YYYYMMDD_product_status.md", "同一天只维护一份产品状态", "读取前一份产品状态", "真实渠道发布后的受管记录阶段、重要阻断、跨会话交接或用户要求", "候选构建、E2E、完整验收和就绪复核不写本目录", "`pending`/`accepted` 候选不触发 tracked 状态", "普通缺陷修复、纯重构、格式整理、测试补强和内部清理"]],
    [path.join(WORK_PLAN_DIR, "README.md"), ["YYYYMMDD_work_plan.md", "同一天只维护一份工作计划", "读取前一份工作计划", "日常开发不自动创建 Work Plan", "多步骤、多模块、中等风险或可并行本身都不要求 Work Plan", "持久计划至少包含精简 Todo", "候选构建、收集、E2E、验收状态或就绪结论不得回写 Work Plan", "候选事实只进入忽略的 `release/` 原子集合和最终回复", "没有 Work Plan 本身不阻断用户显式请求的构建或完整验收", "不自动触发其他项目记忆"]],
    [PRODUCT_SPEC, ["manifest 状态只使用 `pending`、`rejected` 或 `accepted`", "`ready` 仅是对完整 `accepted` 原子集合的纯只读就绪复核结论"]],
    [path.join(ADR_DIR, "README.md"), ["YYYYMMDD_ADR.md", "同一天不得新建第二个 ADR 文件", "长期重要、难以逆转的决定", "缺陷修复、纯重构、格式整理、测试补强、内部清理和实现细节不创建 ADR"]],
    [path.join(CHANGELOG_DIR, "README.md"), ["YYYYMMDD_CHANGELOG.md", "同一天的实际变化持续更新同一文件", "普通缺陷修复", "一律不进入 Changelog", "产品规格转为 `Approved` 本身"]],
    [path.join(SKILLS_ROOT, "desktop-define-product", "SKILL.md"), ["只在产品边界需要决定时", "不默认加载全部历史", "范围确认后直接交给 `$desktop-implement-change`", "普通缺陷修复、不改变可观察行为的纯重构"]],
    [path.join(SKILLS_ROOT, "desktop-plan-change", "SKILL.md"), ["只在持久计划能解决真实协调问题时建立 Todo", "多步骤、多模块、中等风险、可并行或 Agent 偏好本身不构成准入", "日常计划不得自行增加这些步骤", "计划存在和 Todo 完成都不自动触发 Product Spec、ADR、Product Status、Verification 或 Changelog"]],
    [path.join(SKILLS_ROOT, "desktop-implement-change", "SKILL.md"), ["直接实现用户请求", "纯文档、元数据、格式或不可合理单测", "只更新被独立事件触发的记忆", "未触发时不写占位"]],
    [path.join(SKILLS_ROOT, "desktop-verify-delivery", "SKILL.md"), ["没有 Work Plan 不阻断验收", "当前构建已经运行项目全部非空单元测试", "验收证据只写忽略的 `release/`", "不得在 tracked 源码中补写项目记忆或占位记录"]],
    [path.join(SKILLS_ROOT, "desktop-prepare-release", "SKILL.md"), ["Changelog 仅在独立规则触发时更新", "普通缺陷仍进入发布日志", "不为此制造 Changelog"]],
    [path.join(SKILLS_ROOT, "desktop-collect-release-artifacts", "SKILL.md"), ["发布就绪复核仍要求所有匹配 manifest 组成完整 `Milestone accepted` 原子集合"]],
    [path.join(ROOT, "docs", "RUST_CLI_TEMPLATE.md"), ["只使用 `pending`/`rejected`/`accepted` 的候选状态", "纯只读就绪复核"]],
    [path.join(ROOT, "docs", "harness_engineering", "project_lifecycle.md"), ["询问并锁定单次 `gitPublication: local | remote`", "本地模式只合并本地默认主分支、创建并复读本地版本 tag", "远端模式才推送并复读主分支/tag", "Harness 源在模式要求的 Git 引用与上下文复核后结束", "候选最终由 `$desktop-verify-delivery` 完整验收"]],
    [path.join(ROOT, "docs", "harness_engineering", "foundations.md"), ["活动候选的构建与完整验收证据只保存在忽略的 `release/` 原子集合和最终回复", "真实渠道发布成功后的发布证据"]],
    [path.join(ROOT, "docs", "harness_engineering", "agent_first_design.md"), ["当前候选完整验收完成", "正式候选必须先有本地版本 tag", "tag、默认主分支与 manifest `sourceCommit` 精确一致", "`gitPublication: remote` 时远端主分支与同名 tag 也必须一致", "源码归档只在获得独立授权并实际生成时核对", "真实渠道发布完成是候选验收之后的独立事件"]],
    [path.join(ROOT, "docs", "RELEASE.md"), ["版本变化与 Changelog 写入是独立门禁", "仅含普通缺陷修复或纯重构", "缺少 Changelog 不削弱候选证据", "manifest 状态只使用 `pending`、`rejected` 或 `accepted`", "本地 tag `v{版本}-{YYYYMMDD}` 已由正式发布生命周期创建", "远端模式还复核同名远端 tag"]],
  ]);
  for (const [filePath, fragments] of requiredFragments) {
    if (!fs.existsSync(filePath)) {
      fail(errors, `missing daily project-memory contract file: ${relativePath(filePath)}`);
      continue;
    }
    const text = readText(filePath);
    for (const fragment of fragments) {
      if (!text.includes(fragment)) fail(errors, `daily project-memory rule missing in ${relativePath(filePath)}: ${fragment}`);
    }
  }
}
