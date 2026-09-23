import fs from "node:fs";
import path from "node:path";

import {
  ROOT,
  SKILLS_ROOT,
  fail,
  parseFrontmatter,
  readText,
  relativePath,
  resolveInsideRoot,
  trackedFiles,
} from "./core.mjs";
import { inspectProject as inspectNoPython } from "../../.agents/skills/desktop-implement-change/scripts/check_no_python.mjs";
import { validateDailyProjectMemory } from "./repository_memory.mjs";
import { REQUIRED_ROOT_FILES } from "./repository_required_files.mjs";

/** Harness 当前必须保留的 42 个项目 Skill。 */
export const EXPECTED_SKILLS = new Set([
  "desktop-add-cli-adapter",
  "desktop-add-gui-adapter",
  "desktop-add-gui-autostart",
  "desktop-add-gui-deep-link",
  "desktop-add-gui-dialog",
  "desktop-add-gui-global-shortcut",
  "desktop-add-gui-single-instance",
  "desktop-add-gui-system-locale",
  "desktop-add-gui-system-notifications",
  "desktop-add-gui-system-tray",
  "desktop-add-gui-updater",
  "desktop-add-gui-window-state",
  "desktop-add-mcp-adapter",
  "desktop-add-tui-adapter",
  "desktop-build-rust-release",
  "desktop-build-tauri-local-install",
  "desktop-build-tauri-release",
  "desktop-check-development-environment",
  "desktop-collect-release-artifacts",
  "desktop-configure-git-commits",
  "desktop-curate-harness-memory",
  "desktop-define-product",
  "desktop-extract-i18n-strings",
  "desktop-implement-change",
  "desktop-initialize-rust-project",
  "desktop-instantiate-project",
  "desktop-manage-git-lifecycle",
  "desktop-manage-version",
  "desktop-plan-change",
  "desktop-prepare-cross-platform-release",
  "desktop-prepare-gui-app-identity",
  "desktop-prepare-gui-support-surfaces",
  "desktop-prepare-release",
  "desktop-refactor-code",
  "desktop-rename-project-identity",
  "desktop-run-parallel-worktrees",
  "desktop-summarize-development-history",
  "desktop-test-final-artifact-e2e",
  "desktop-test-gui-initialization-e2e",
  "desktop-upgrade-harness",
  "desktop-verify-delivery",
  "mantine-list-view",
]);

/** 验证固定入口、许可证、事实源和 Node 校验入口存在。 */
export function validateRequiredFiles(errors) {
  for (const relative of REQUIRED_ROOT_FILES) {
    const filePath = path.join(ROOT, relative);
    if (!fs.existsSync(filePath)) {
      fail(errors, `缺少必需文件: ${relative}`);
      continue;
    }
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      fail(errors, `必需路径必须是普通非符号链接文件: ${relative}`);
    }
  }
}

/** 验证 Skill 集合、frontmatter 与元数据入口保持一一对应。 */
export function validateSkills(errors) {
  let entries = [];
  try {
    entries = fs.readdirSync(SKILLS_ROOT, { withFileTypes: true });
  } catch (error) {
    fail(errors, `无法枚举项目 Skills: ${error.message}`);
    return;
  }
  const actual = new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name));
  let readme = "";
  let agents = "";
  try {
    readme = readText(path.join(ROOT, "README.md"));
    agents = readText(path.join(ROOT, "AGENTS.md"));
  } catch (error) {
    fail(errors, error.message);
  }
  for (const name of EXPECTED_SKILLS) {
    if (!actual.has(name)) fail(errors, `缺少预期 Skill: ${name}`);
  }
  for (const name of actual) {
    if (!EXPECTED_SKILLS.has(name)) fail(errors, `Skills 地图未登记目录: ${name}`);
  }
  for (const name of EXPECTED_SKILLS) {
    const skillFile = path.join(SKILLS_ROOT, name, "SKILL.md");
    const metadataFile = path.join(SKILLS_ROOT, name, "agents", "openai.yaml");
    if (!fs.existsSync(skillFile)) {
      fail(errors, `Skill 缺少 SKILL.md: ${name}`);
      continue;
    }
    try {
      const frontmatter = parseFrontmatter(readText(skillFile));
      if (!frontmatter) {
        fail(errors, `Skill 缺少合法 frontmatter: ${name}`);
      } else {
        const keys = Object.keys(frontmatter).sort();
        if (keys.join("\0") !== ["description", "name"].join("\0")) {
          fail(errors, `Skill frontmatter 只能包含 name/description: ${name}`);
        }
        if (frontmatter.name !== name) fail(errors, `Skill name 与目录不一致: ${name}`);
        if (!frontmatter.description?.trim()) fail(errors, `Skill description 不能为空: ${name}`);
      }
      const skillText = readText(skillFile);
      if (skillText.includes("TODO")) fail(errors, `Skill 含未解决 TODO: ${name}`);
      if (name === "mantine-list-view" && skillText.replaceAll("\r\n", "\n").split("\n").length > 201) {
        fail(errors, `mantine-list-view SKILL.md 超过 200 行`);
      }
    } catch (error) {
      fail(errors, error.message);
    }
    if (!fs.existsSync(metadataFile)) {
      fail(errors, `Skill 缺少 agents/openai.yaml: ${name}`);
    } else {
      try {
        const metadata = readText(metadataFile);
        const yamlString = (key) => new RegExp(`^\\s*${key}:\\s*"([^"]*)"\\s*$`, "mu").exec(metadata)?.[1] ?? null;
        const displayName = yamlString("display_name");
        const shortDescription = yamlString("short_description");
        const defaultPrompt = yamlString("default_prompt");
        if (!displayName) fail(errors, `Skill metadata 缺少 display_name: ${name}`);
        if (!shortDescription || shortDescription.length < 25 || shortDescription.length > 64) {
          fail(errors, `Skill metadata short_description 长度必须为 25-64: ${name}`);
        }
        if (!defaultPrompt?.includes(`$${name}`)) fail(errors, `Skill metadata default_prompt 必须提及 $${name}`);
      } catch (error) {
        fail(errors, error.message);
      }
    }
    if (!readme.includes(`\`${name}\``) && !readme.includes(`\`$${name}\``)) fail(errors, `README 未声明 Skill: ${name}`);
    if (!agents.includes(`$${name}`)) fail(errors, `AGENTS 路由未提及 Skill: ${name}`);
  }
}

/** 校验可选精简 Work Plan 的 Todo 状态、逐项字段和候选事实隔离。 */
export function validateWorkPlanContract(errors, planPath = null, { required = false } = {}) {
  const workPlanDirectory = path.join(ROOT, "docs", "work_plan");
  const selected = planPath ?? fs.readdirSync(workPlanDirectory)
    .filter((name) => /^\d{8}_work_plan\.md$/u.test(name))
    .sort()
    .map((name) => path.join(workPlanDirectory, name))
    .at(-1);
  if (!selected || !fs.existsSync(selected)) {
    if (required) fail(errors, `missing active Work Plan: ${selected ? relativePath(selected) : "docs/work_plan/__missing_latest__.md"}`);
    return;
  }
  const text = readText(selected);
  if (!text.includes("## Todo")) fail(errors, `active Work Plan has no Todo section: ${relativePath(selected)}`);
  const headings = [...text.matchAll(/^###\s+(TODO-[A-Z0-9-]+)(.*?)$/gmu)];
  const todoIds = headings.map((match) => match[1]);
  if (todoIds.length === 0) fail(errors, `active Work Plan has no stable Todo IDs: ${relativePath(selected)}`);
  const duplicates = [...new Set(todoIds.filter((id, index) => todoIds.indexOf(id) !== index))].sort();
  if (duplicates.length > 0) fail(errors, `active Work Plan contains duplicate Todo IDs: ${duplicates.join(", ")}`);
  for (const [index, match] of headings.entries()) {
    const states = [...match[2].matchAll(/[（(](pending|in_progress|blocked|done)[）)]/gu)];
    if (states.length !== 1) fail(errors, `Todo ${match[1]} heading must carry exactly one explicit state`);
    const blockEnd = headings[index + 1]?.index ?? text.length;
    const block = text.slice((match.index ?? 0) + match[0].length, blockEnd);
    const fields = [
      ["expected behavior", /(?:预期行为|Expected behavior)\s*[：:]/iu],
      ["ownership/boundary", /(?:影响边界|Ownership\/Boundary)\s*[：:]/iu],
      ["verification", /(?:完成验证|验证|Verification)\s*[：:]/iu],
    ];
    for (const [label, pattern] of fields) {
      if (!pattern.test(block)) fail(errors, `Todo ${match[1]} is missing per-item ${label}`);
    }
  }
  for (const acceptance of text.matchAll(/^##\s+(?:验证里程碑|完整验收)\b.*$/gmu)) {
    const block = text.slice((acceptance.index ?? 0) + acceptance[0].length);
    for (const fragment of ["候选", "`done`", "$desktop-implement-change"]) {
      if (!block.includes(fragment)) fail(errors, `Work Plan acceptance contract missing in ${relativePath(selected)}: ${fragment}`);
    }
    if (!/完整(?:真实| Harness|源树|产物)/u.test(block)) fail(errors, `Work Plan acceptance lacks a complete real candidate: ${relativePath(selected)}`);
    if (!/模拟|桩|占位|脚手架|开发预览|单段文案/u.test(block)) fail(errors, `Work Plan acceptance lacks substitute rejection: ${relativePath(selected)}`);
  }
  const evidencePatterns = [
    /^\s*(?:[-*]\s*)?(?:(?:当前)?(?:里程碑|验收|技术验收)?(?:状态|结论)|(?:Milestone|Acceptance)\s+(?:status|verdict))\s*[：:]\s*`?(?:Technically\s+accepted|Milestone\s+accepted|accepted|passed|已验收|通过)\b/imu,
    /^\s*(?:[-*]\s*)?(?:(?:发布|候选)(?:状态|结论)|发布就绪|Release\s+readiness)\s*[：:]\s*`?(?:ready|已就绪|可发布)\b/imu,
    /^\s*(?:[-*]\s*)?(?:milestoneAcceptance|sourceCommit|buildRun|buildMode|runtimeVerification|signingStatus|notarizationStatus|sha256)\s*[：:]/imu,
    /^\s*(?:[-*]\s*)?(?:(?:候选|构建|E2E)(?:状态|结论)|Candidate\s+(?:status|verdict))\s*[：:]\s*`?(?:pending|rejected|accepted|passed|failed|waived|Unverified)\b/imu,
  ];
  if (evidencePatterns.some((pattern) => pattern.test(text))) {
    fail(errors, "active Work Plan must not record candidate evidence or an acceptance/readiness verdict");
  }
}

/** 解析本地 Markdown 链接并验证目标存在、未越过仓库根。 */
export function validateMarkdownLinks(errors, files = trackedFiles()) {
  const markdownFiles = files.filter((relative) => relative.endsWith(".md"));
  const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/gu;
  for (const relative of markdownFiles) {
    const filePath = path.join(ROOT, relative);
    let text;
    try {
      text = readText(filePath);
    } catch (error) {
      fail(errors, error.message);
      continue;
    }
    for (const match of text.matchAll(linkPattern)) {
      let target = match[1].trim();
      if (!target || target.startsWith("#") || /^(?:https?:|mailto:|data:|app:|plugin:|codex:)/iu.test(target)) continue;
      if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1);
      target = target.split("#", 1)[0].split("?", 1)[0];
      if (!target) continue;
      try {
        target = decodeURIComponent(target);
        const resolved = resolveInsideRoot(path.dirname(filePath), target);
        if (!fs.existsSync(resolved)) {
          fail(errors, `失效本地 Markdown 链接: ${relative} -> ${target}`);
        }
      } catch (error) {
        fail(errors, `${relative} 的本地链接无效: ${error.message}`);
      }
    }
  }
}

/** 验证日期记忆索引只指向实际存在的最新快照。 */
export function validateMemoryIndexes(errors) {
  const configurations = [
    ["docs/product_spec", /^(\d{8})_product_spec\.md$/u],
    ["docs/project_status", /^(\d{8})_product_status\.md$/u],
    ["docs/work_plan", /^(\d{8})_work_plan\.md$/u],
    ["docs/adr", /^(\d{8})_ADR\.md$/u],
    ["docs/changelog", /^(\d{8})_CHANGELOG\.md$/u],
  ];
  for (const [directory, pattern] of configurations) {
    const absolute = path.join(ROOT, directory);
    const files = fs.readdirSync(absolute).filter((name) => pattern.test(name)).sort();
    if (files.length !== 1) {
      fail(errors, `${directory} 必须只保留一个日期最新正文，实际 ${files.length} 个`);
      continue;
    }
    const index = readText(path.join(absolute, "README.md"));
    if (!index.includes(`(${files[0]})`)) {
      fail(errors, `${directory}/README.md 未索引当前正文 ${files[0]}`);
    }
  }
}

/** 执行仓库结构、链接、记忆与无 Python 依赖的完整检查。 */
export function validateRepository(errors) {
  let files;
  try {
    files = trackedFiles();
  } catch (error) {
    fail(errors, error.message);
    return;
  }
  validateRequiredFiles(errors);
  validateDailyProjectMemory(errors);
  validateWorkPlanContract(errors);
  validateSkills(errors);
  validateMarkdownLinks(errors, files);
  validateMemoryIndexes(errors);
  for (const error of inspectNoPython(ROOT, { files })) fail(errors, `Harness ${error}`);
}
