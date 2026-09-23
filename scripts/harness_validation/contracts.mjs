import path from "node:path";

import {
  ROOT,
  SKILLS_ROOT,
  checkNodeSyntax,
  fail,
  readText,
  requireFragments,
  relativePath,
  trackedFiles,
} from "./core.mjs";
import { validateCoreFirstContract } from "./architecture.mjs";
import { validateAgentPolicy as validatePersistentAgentPolicy } from "./governance_policy.mjs";
import { validateVersionContract } from "./governance_version.mjs";
import { validateRustChineseComments } from "./rust_comments.mjs";
import { validateProductVersioningContract } from "./product_versioning.mjs";
import { validateAgentsEntrypoint } from "./governance.mjs";
import {
  validateEngineeringContract,
  validateStreamlinedDevelopmentAndBuild,
} from "./governance_contracts.mjs";
import { validateCurrentDescriptions } from "./governance_descriptions.mjs";
import { validateGuiSupportContract } from "./gui_support.mjs";
import { validateInitializationContract } from "./initialization.mjs";
import { validateUpgradeContract } from "./upgrade.mjs";
import { validateReleaseContract } from "./release.mjs";
import { validateGitLifecycleContract } from "./git_lifecycle.mjs";
import { validateWorkflow } from "./workflow.mjs";

/** 验证 Agent 策略字段及 Harness 源默认值。 */
export function validateAgentPolicy(errors) {
  validatePersistentAgentPolicy(errors, path.join(ROOT, "docs", "AGENT_POLICY.md"), {
    allowPending: true,
    requireSourceDefaults: true,
  });
}

/** 验证根入口预算、Node 命令与无 Python 默认规则。 */
export function validateGovernanceDocuments(errors) {
  const agentsPath = path.join(ROOT, "AGENTS.md");
  const agents = requireFragments(errors, agentsPath, [
    "docs/AGENT_POLICY.md",
    "$desktop-implement-change",
    "$desktop-refactor-code",
    "node scripts/validate_harness.mjs",
    "node scripts/run_harness_tests.mjs",
    "工程自动化只使用 Node.js 标准库",
    "check_no_python.mjs --root .",
  ], "AGENTS.md");
  requireFragments(errors, path.join(SKILLS_ROOT, "desktop-check-development-environment", "SKILL.md"), [
    "受管工具集合固定为",
    "不得探测、安装、升级或建议集合外的解释器",
  ], "$desktop-check-development-environment");
  const environmentSkillPrefix = ".agents/skills/desktop-check-development-environment/";
  try {
    for (const relative of trackedFiles().filter((file) => file.startsWith(environmentSkillPrefix))) {
      if (/python/iu.test(readText(path.join(ROOT, relative)))) fail(errors, `环境检查不得提及 Python: ${relative}`);
    }
  } catch (error) {
    fail(errors, `无法检查环境 Skill 文件: ${error.message}`);
  }
  for (const skillName of ["desktop-initialize-rust-project", "desktop-upgrade-harness"]) {
    requireFragments(errors, path.join(SKILLS_ROOT, skillName, "SKILL.md"), ["check_no_python.mjs"], skillName);
  }
  const bytes = Buffer.byteLength(agents, "utf8");
  const lines = agents ? agents.replaceAll("\r\n", "\n").split("\n").length - (agents.endsWith("\n") ? 1 : 0) : 0;
  if (bytes > 20_000) fail(errors, `AGENTS.md 超过 20,000 UTF-8 字节预算: ${bytes}`);
  if (lines > 120) fail(errors, `AGENTS.md 超过 120 行预算: ${lines}`);

  requireFragments(errors, path.join(ROOT, "docs", "ENGINEERING_RULES.md"), [
    "Core-first 是硬规则",
    "Node.js 是所有接口组合的受管工程运行时",
    "不得引入 Python 源码、解释器、包管理器、虚拟环境、第三方包或 Python 运行步骤",
    "只有开发者在当前请求中主动明确要求时才可例外",
    "check_no_python.mjs --root .",
    "node scripts/validate_harness.mjs --release-review",
    "Rust 代码：400 行",
    "前端代码：500 行",
    "其他人工维护文本：500 行",
  ], "docs/ENGINEERING_RULES.md");

  requireFragments(errors, path.join(ROOT, "README.md"), [
    "node scripts/run_harness_tests.mjs",
    "node scripts/validate_harness.mjs",
  ], "README.md");
  requireFragments(errors, path.join(ROOT, "docs", "VERIFICATION.md"), [
    "node scripts/validate_harness.mjs",
    "--release-review",
  ], "docs/VERIFICATION.md");
  requireFragments(errors, path.join(ROOT, "docs", "RUST_CLI_TEMPLATE.md"), [
    "Node.js",
    "所有接口",
    "pnpm",
  ], "docs/RUST_CLI_TEMPLATE.md");
}

/** 对全部 JavaScript 运行 Node 语法检查，并要求存在非空 Node 回归。 */
export function validateNodeSyntaxAndTests(errors) {
  let files;
  try {
    files = trackedFiles();
  } catch (error) {
    fail(errors, error.message);
    return { scripts: 0, tests: 0 };
  }
  const scripts = files.filter((relative) => /\.(?:mjs|cjs|js)$/u.test(relative));
  const tests = files.filter((relative) => /\.test\.(?:mjs|cjs|js)$/u.test(relative));
  if (tests.length === 0) fail(errors, "未发现 Node 回归测试");
  let results;
  try {
    results = checkNodeSyntax(scripts.map((relative) => path.join(ROOT, relative)));
  } catch (error) {
    fail(errors, error.message);
    return { scripts: scripts.length, tests: tests.length };
  }
  for (const [absolute, detail] of results) {
    if (detail !== null) fail(errors, `Node 语法检查失败 ${relativePath(absolute)}: ${detail}`);
  }
  return { scripts: scripts.length, tests: tests.length };
}

/** 验证中性 Rust fixture 仍体现 core-first，不需要 Node 解析完整 TOML。 */
export function validateNeutralRustArchitecture(errors) {
  const fixture = path.join(ROOT, ".agents", "skills", "desktop-initialize-rust-project", "assets", "rust-lib-cli");
  const rootManifest = requireFragments(errors, path.join(fixture, "Cargo.toml"), [
    "example_tool_core",
    "example_tool_cli",
    "[workspace]",
  ], "中性 Rust workspace");
  const coreManifest = requireFragments(errors, path.join(fixture, "example_tool_core", "Cargo.toml"), [
    "name = \"example_tool_core\"",
  ], "中性 core manifest");
  const cliManifest = requireFragments(errors, path.join(fixture, "example_tool_cli", "Cargo.toml"), [
    "name = \"example_tool_cli\"",
    "example_tool_core",
  ], "中性 CLI manifest");
  if (!rootManifest || !coreManifest || !cliManifest) return;
  if (/\b(?:clap|ratatui|tauri|rmcp)\b/u.test(coreManifest)) {
    fail(errors, "中性 core 不得依赖接口框架");
  }
}

/** 组合运行策略、规则、Node helper、workflow 与中性架构契约。 */
export function validateContracts(errors) {
  // 先批量并发解析全部模块；顺序只影响速度，后续契约校验命中同一缓存。
  const nodeInventory = validateNodeSyntaxAndTests(errors);
  validateAgentPolicy(errors);
  validateAgentsEntrypoint(errors);
  validateEngineeringContract(errors);
  validateStreamlinedDevelopmentAndBuild(errors);
  validateCurrentDescriptions(errors);
  validateVersionContract(errors);
  validateProductVersioningContract(errors);
  validateGovernanceDocuments(errors);
  validateWorkflow(errors);
  validateReleaseContract(errors);
  validateGitLifecycleContract(errors);
  validateUpgradeContract(errors);
  validateInitializationContract(errors);
  validateGuiSupportContract(errors);
  validateNeutralRustArchitecture(errors);
  validateCoreFirstContract(errors);
  validateRustChineseComments(errors);
  return nodeInventory;
}
