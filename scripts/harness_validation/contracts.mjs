import fs from "node:fs";
import path from "node:path";

import {
  ROOT,
  fail,
  readText,
  requireFragments,
  run,
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

const NODE_RUNTIME_RULE = "Node.js 是所有接口组合的受管工程运行时";
const PYTHON_POLICY_RULE = "只有开发者在当前请求中主动明确要求时才可例外";

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
  ], "AGENTS.md");
  const bytes = Buffer.byteLength(agents, "utf8");
  const lines = agents ? agents.replaceAll("\r\n", "\n").split("\n").length - (agents.endsWith("\n") ? 1 : 0) : 0;
  if (bytes > 20_000) fail(errors, `AGENTS.md 超过 20,000 UTF-8 字节预算: ${bytes}`);
  if (lines > 120) fail(errors, `AGENTS.md 超过 120 行预算: ${lines}`);

  requireFragments(errors, path.join(ROOT, "docs", "ENGINEERING_RULES.md"), [
    "Core-first 是硬规则",
    NODE_RUNTIME_RULE,
    "不得引入 Python 源码、解释器、包管理器、虚拟环境、第三方包或 Python 运行步骤",
    PYTHON_POLICY_RULE,
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

/** 验证各固定 Node helper 已随下游传播且没有回退成空壳。 */
export function validateNodeHelperInventory(errors) {
  const required = [
    ".agents/skills/desktop-configure-git-commits/scripts/configure_git_commit.mjs",
    ".agents/skills/desktop-instantiate-project/scripts/resolve_project_target.mjs",
    ".agents/skills/desktop-manage-git-lifecycle/scripts/git_lifecycle.mjs",
    ".agents/skills/desktop-manage-version/scripts/version_gate.mjs",
    ".agents/skills/desktop-prepare-release/scripts/release_context.mjs",
    ".agents/skills/desktop-prepare-release/scripts/release_git.mjs",
    ".agents/skills/desktop-prepare-release/scripts/release_notes.mjs",
    ".agents/skills/desktop-prepare-cross-platform-release/scripts/verify_release_context.mjs",
    ".agents/skills/desktop-run-parallel-worktrees/scripts/parallel_worktrees.mjs",
    ".agents/skills/desktop-rename-project-identity/scripts/rename_project_identity.mjs",
    ".agents/skills/desktop-upgrade-harness/scripts/harness_upgrade.mjs",
    ".agents/skills/desktop-implement-change/scripts/check_core_first.mjs",
    ".agents/skills/desktop-implement-change/scripts/check_file_line_limits.mjs",
    ".agents/skills/desktop-implement-change/scripts/check_rust_chinese_comments.mjs",
    ".agents/skills/desktop-build-tauri-release/scripts/verify_release_notes_resource.mjs",
  ];
  for (const relative of required) {
    const absolute = path.join(ROOT, relative);
    if (!fs.existsSync(absolute)) {
      fail(errors, `缺少 Node helper: ${relative}`);
      continue;
    }
    const text = readText(absolute);
    if (Buffer.byteLength(text, "utf8") < 200) fail(errors, `Node helper 内容异常为空: ${relative}`);
  }
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
  for (const relative of scripts) {
    const result = run(process.execPath, ["--check", path.join(ROOT, relative)], { timeout: 30_000 });
    if (result.error || result.status !== 0) {
      const detail = (result.stderr || result.error?.message || "无诊断").trim();
      fail(errors, `Node 语法检查失败 ${relative}: ${detail}`);
    }
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
  validateAgentPolicy(errors);
  validateAgentsEntrypoint(errors);
  validateEngineeringContract(errors);
  validateStreamlinedDevelopmentAndBuild(errors);
  validateCurrentDescriptions(errors);
  validateVersionContract(errors);
  validateProductVersioningContract(errors);
  validateGovernanceDocuments(errors);
  validateNodeHelperInventory(errors);
  const nodeInventory = validateNodeSyntaxAndTests(errors);
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
