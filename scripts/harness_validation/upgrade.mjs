import fs from "node:fs";
import path from "node:path";

import {
  ROOT,
  fail,
  readJson,
  readText,
  relativePath,
  nodeSyntaxErrors,
} from "./core.mjs";

export const UPGRADE_ROOT = path.join(ROOT, ".agents", "skills", "desktop-upgrade-harness");
export const UPGRADE_MANIFEST = path.join(UPGRADE_ROOT, "references", "ownership-manifest.json");

// This validator intentionally owns an independent copy of the minimum rules.
// Sharing the runtime map would let a change to both the runtime and manifest
// silently weaken the ownership boundary.
export const REQUIRED_UPGRADE_RULES = new Map([
  [".agents/skills/desktop-task-workflow/**", "managed"],
  [".agents/skills/gpui-kit/**", "protected"],
  [".agents/skills/gpui-kit-design-guides/**", "protected"],
  [".agents/skills/desktop-manage-task-worktrees/**", "managed"],
  [".agents/skills/desktop-manage-dependencies/**", "managed"],
  [".agents/skills/desktop-review-core-boundaries/**", "managed"],
  [".agents/skills/desktop-record-adr/**", "managed"],
  [".agents/skills/desktop-handoff-project/**", "managed"],
  [".agents/skills/desktop-inspect-release-notes/**", "managed"],
  [".agents/skills/desktop-enable-gui-updates/**", "conditional"],
  [".agents/skills/desktop-add-gui-telemetry/**", "conditional"],
  [".agents/skills/desktop-add-gpui-autostart/**", "conditional"],
  [".agents/skills/desktop-test-gpui-initialization-e2e/**", "tombstone"],
  ["Version.md", "tombstone"],
  [".agents/skills/desktop-instantiate-project/**", "tombstone"],
  [".agents/skills/desktop-initialize-rust-project/**", "tombstone"],
  [".agents/skills/desktop-test-gui-initialization-e2e/**", "tombstone"],
  [".agents/skills/desktop-add-gpui-adapter/scripts/create_gpui_workspace.mjs", "tombstone"],
  [".agents/skills/desktop-add-gpui-adapter/scripts/create_gpui_workspace.test.mjs", "tombstone"],
  [".agents/skills/desktop-add-gpui-adapter/assets/core/**", "tombstone"],
  ["scripts/validate_harness.mjs", "tombstone"],
  ["scripts/run_harness_tests.mjs", "tombstone"],
  ["scripts/agile_workflow.test.mjs", "tombstone"],
  ["scripts/harness_scope_and_initialization_boundaries.test.mjs", "tombstone"],
  ["scripts/validate_harness.test.mjs", "tombstone"],
  ["scripts/harness_validation/**", "tombstone"],
  ["docs/HARNESS_ENGINEERING.md", "tombstone"],
  ["docs/harness_engineering/**", "tombstone"],
  [".agents/skills/design-taste-frontend/**", "protected"],
  ["docs/AGENT_POLICY.md", "protected"],
  ["docs/GUI_SUPPORT_SURFACES.md", "protected"],
  ["docs/GUI_APP_PROFILE.md", "protected"],
  ["docs/product_spec/**", "protected"],
  ["docs/project_status/**", "protected"],
  ["docs/work_plan/**", "protected"],
  ["docs/adr/**", "protected"],
  ["docs/changelog/**", "protected"],
  ["docs/VERIFICATION.md", "protected"],
  ["docs/verification/**", "protected"],
  ["docs/TECH_DEBT.md", "protected"],
  [".harness/version-state.json", "protected"],
  [".harness/release-context.json", "protected"],
  ["release-notes.json", "protected"],
  ["LICENSE.zh-CN.md", "protected"],
  ["LICENSE.en.md", "protected"],
  ["Cargo.toml", "protected"],
  [".gitignore", "protected"],
  ["AGENTS.md", "merge-sections"],
  ["README.md", "merge-sections"],
  ["docs/ENGINEERING_RULES.md", "merge-sections"],
  ["docs/RUST_CLI_TEMPLATE.md", "merge-sections"],
  ["docs/CLI_CONTRACT.md", "merge-sections"],
  ["docs/RELEASE.md", "merge-sections"],
  ["docs/design_standards/**", "managed"],
  [".agents/skills/desktop-implement-change/scripts/check_file_line_limits.mjs", "managed"],
  [".agents/skills/desktop-implement-change/scripts/check_file_line_limits.test.mjs", "managed"],
  [".agents/skills/desktop-implement-change/scripts/check_core_first.mjs", "managed"],
  [".agents/skills/desktop-implement-change/scripts/check_core_first.test.mjs", "managed"],
  [".agents/skills/desktop-implement-change/scripts/project_lock_policy.mjs", "managed"],
  [".agents/skills/desktop-implement-change/scripts/project_lock_policy.test.mjs", "managed"],
  [".agents/skills/desktop-implement-change/scripts/check_rust_chinese_comments.mjs", "managed"],
  [".agents/skills/desktop-implement-change/scripts/check_rust_chinese_comments.test.mjs", "managed"],
  [".agents/skills/desktop-implement-change/scripts/check_no_python.mjs", "managed"],
  [".agents/skills/desktop-implement-change/scripts/check_no_python.test.mjs", "managed"],
  [".agents/skills/desktop-manage-git-lifecycle/**", "managed"],
  [".agents/skills/desktop-switch-post-release-action/**", "managed"],
  [".agents/skills/desktop-upgrade-harness/**", "managed-self"],
  [".agents/skills/desktop-add-cli-adapter/**", "conditional"],
  [".agents/skills/desktop-add-tui-adapter/**", "conditional"],
  [".agents/skills/desktop-add-mcp-adapter/**", "conditional"],
  [".agents/skills/desktop-add-gui-adapter/**", "conditional"],
  [".agents/skills/desktop-add-gpui-adapter/**", "conditional"],
  [".agents/skills/desktop-build-gpui-release/**", "conditional"],
  [".agents/skills/mantine-list-view/**", "conditional"],
  [".agents/skills/desktop-add-gui-system-locale/**", "conditional"],
  [".agents/skills/desktop-add-gui-updater/**", "conditional"],
  [".agents/skills/desktop-add-gui-window-state/**", "conditional"],
  [".agents/skills/desktop-add-gui-dialog/**", "conditional"],
  [".agents/skills/desktop-add-gui-system-tray/**", "conditional"],
  [".agents/skills/desktop-add-gui-single-instance/**", "conditional"],
  [".agents/skills/desktop-add-gui-deep-link/**", "conditional"],
  [".agents/skills/desktop-add-gui-global-shortcut/**", "conditional"],
  [".agents/skills/desktop-add-gui-system-notifications/**", "conditional"],
  [".agents/skills/desktop-add-gui-autostart/**", "conditional"],
  [".agents/skills/desktop-prepare-gui-app-identity/**", "conditional"],
  [".agents/skills/desktop-prepare-gui-support-surfaces/**", "conditional"],
  [".agents/skills/desktop-prepare-cross-platform-release/**", "conditional"],
  [".agents/skills/desktop-build-tauri-local-install/**", "conditional"],
  [".agents/skills/desktop-build-tauri-release/**", "conditional"],
  [".agents/skills/**", "managed"],
]);

export const VALID_UPGRADE_MODES = new Set([
  "managed", "managed-self", "merge-sections", "conditional", "protected", "tombstone",
]);

export const UPGRADE_MODULES = [
  "harness_upgrade.mjs",
  "harness_upgrade_core.mjs",
  "harness_upgrade_interfaces.mjs",
  "harness_upgrade_interfaces.test.mjs",
  "harness_upgrade_mutation.mjs",
  "harness_upgrade_mutation.test.mjs",
  "harness_upgrade_ownership.mjs",
  "harness_upgrade_plan.test.mjs",
  "harness_upgrade_policy.mjs",
  "harness_upgrade_preflight.mjs",
  "harness_upgrade_record.mjs",
  "harness_upgrade_safety.mjs",
  "harness_upgrade_test_support.mjs",
].map((name) => path.join(UPGRADE_ROOT, "scripts", name));

export const REQUIRED_POST_RELEASE_SWITCH_PATHS = [
  ".agents/skills/desktop-switch-post-release-action/SKILL.md",
  ".agents/skills/desktop-switch-post-release-action/agents/openai.yaml",
  ".agents/skills/desktop-switch-post-release-action/scripts/post_release_action.mjs",
  ".agents/skills/desktop-switch-post-release-action/scripts/post_release_action.test.mjs",
];

export const REQUIRED_TASK_WORKTREE_PATHS = [
  ".agents/skills/desktop-manage-task-worktrees/SKILL.md",
  ".agents/skills/desktop-manage-task-worktrees/agents/openai.yaml",
];

/** Parse the upgrade ownership manifest while converting all read failures to diagnostics. */
export function loadUpgradeManifest(errors, manifestPath = UPGRADE_MANIFEST) {
  try {
    const value = readJson(manifestPath);
    if (!value || Array.isArray(value) || typeof value !== "object") {
      fail(errors, "upgrade ownership manifest must contain a JSON object");
      return null;
    }
    return value;
  } catch (error) {
    fail(errors, `invalid upgrade ownership manifest ${relativePath(manifestPath)}: ${error.message}`);
    return null;
  }
}

function effectiveMode(candidate, ordered, defaultMode) {
  for (const [pattern, mode] of ordered) {
    if (path.matchesGlob(candidate, pattern)) return mode;
  }
  return defaultMode;
}

function validateManifest(errors, manifest) {
  if (manifest.schema_version !== 1) {
    fail(errors, "upgrade ownership manifest schema_version must be 1");
  }
  if (manifest.default_mode !== "protected") {
    fail(errors, "upgrade ownership manifest default_mode must be protected");
  }
  if (!Array.isArray(manifest.rules) || manifest.rules.length === 0) {
    fail(errors, "upgrade ownership manifest rules must be a non-empty list");
    return;
  }

  const ordered = [];
  const seen = new Set();
  manifest.rules.forEach((item, index) => {
    if (!item || Array.isArray(item) || typeof item !== "object"
        || Object.keys(item).sort().join(",") !== "mode,pattern") {
      fail(errors, `upgrade ownership rule ${index} must contain only pattern/mode`);
      return;
    }
    const { pattern, mode } = item;
    if (typeof pattern !== "string" || pattern.length === 0) {
      fail(errors, `upgrade ownership rule ${index} has invalid pattern`);
      return;
    }
    if (seen.has(pattern)) fail(errors, `duplicate upgrade ownership rule: ${pattern}`);
    seen.add(pattern);
    if (!VALID_UPGRADE_MODES.has(mode)) {
      fail(errors, `upgrade ownership rule ${pattern} has invalid mode`);
      return;
    }
    ordered.push([pattern, mode]);
  });

  const observed = new Map(ordered);
  for (const [pattern, expectedMode] of REQUIRED_UPGRADE_RULES) {
    if (observed.get(pattern) !== expectedMode) {
      fail(errors, `upgrade ownership minimum protection missing: ${pattern} must be ${expectedMode}`);
    }
  }

  const generic = ordered.findIndex(([pattern, mode]) => pattern === ".agents/skills/**" && mode === "managed");
  const orderedBeforeGeneric = [
    [".agents/skills/design-taste-frontend/**", "protected", "third-party design skill protected rule"],
    [".agents/skills/desktop-upgrade-harness/**", "managed-self", "upgrade managed-self rule"],
    [".agents/skills/desktop-manage-git-lifecycle/**", "managed", "upgrade Git lifecycle managed rule"],
    [".agents/skills/desktop-switch-post-release-action/**", "managed", "upgrade post-release switch managed rule"],
    [".agents/skills/desktop-manage-task-worktrees/**", "managed", "upgrade Task worktree managed rule"],
  ];
  for (const [pattern, mode, label] of orderedBeforeGeneric) {
    const index = ordered.findIndex(([candidate, candidateMode]) => candidate === pattern && candidateMode === mode);
    if (index >= 0 && generic >= 0 && index >= generic) fail(errors, `${label} must precede generic managed rule`);
  }
  const designIndex = ordered.findIndex(([pattern, mode]) => pattern === ".agents/skills/design-taste-frontend/**" && mode === "protected");
  const designScope = ".agents/skills/design-taste-frontend";
  if (designIndex >= 0) for (const [pattern, mode] of ordered.slice(0, designIndex)) {
    if (mode === "protected") continue;
    const wildcard = [...pattern].findIndex((character) => "*?[".includes(character));
    const prefix = (wildcard < 0 ? pattern : pattern.slice(0, wildcard)).replace(/\/$/u, "");
    if (!prefix || designScope === prefix || designScope.startsWith(`${prefix}/`)
        || prefix.startsWith(`${designScope}/`) || (wildcard >= 0 && designScope.startsWith(prefix))) {
      fail(errors, `third-party design skill protected rule is shadowed by earlier ownership rule: ${pattern}`);
    }
  }
  if (generic >= 0) {
    for (const [pattern, mode] of REQUIRED_UPGRADE_RULES) {
      if (mode !== "conditional") continue;
      const index = ordered.findIndex(([candidate, candidateMode]) => candidate === pattern && candidateMode === mode);
      if (index >= generic) {
        fail(errors, `upgrade conditional rule must precede generic managed rule: ${pattern}`);
      }
    }
  }

  const gpuiIndex = ordered.findIndex(([pattern]) => pattern === ".agents/skills/desktop-add-gpui-adapter/**");
  for (const [pattern, mode] of REQUIRED_UPGRADE_RULES) {
    if (mode !== "tombstone" || !pattern.startsWith(".agents/skills/desktop-add-gpui-adapter/")) continue;
    const index = ordered.findIndex(([candidate]) => candidate === pattern);
    const probe = pattern.endsWith("/**") ? `${pattern.slice(0, -3)}/__harness_node_probe__` : pattern;
    if (index >= gpuiIndex || effectiveMode(probe, ordered, manifest.default_mode) !== "tombstone") {
      fail(errors, `GPUI initialization-only tombstone must precede GPUI conditional rule without shadowing: ${pattern}`);
    }
  }

  for (const [requiredPath, mode] of REQUIRED_UPGRADE_RULES) {
    if (mode !== "managed" || requiredPath.includes("*")) continue;
    if (effectiveMode(requiredPath, ordered, manifest.default_mode) !== "managed") {
      fail(errors, `required checker ownership must remain managed: ${requiredPath}`);
    }
  }
  if (effectiveMode("package.json", ordered, manifest.default_mode) !== "protected") {
    fail(errors, "root package.json must remain protected; GPUI tooling merge requires its explicit migration command");
  }
  for (const file of ["gpui_node_tooling.mjs", "gpui_dev.mjs", "gpui_validate.mjs", "merge_gpui_node_tooling.mjs"]) {
    const candidate = `.agents/skills/desktop-add-gpui-adapter/scripts/${file}`;
    if (effectiveMode(candidate, ordered, manifest.default_mode) !== "conditional") {
      fail(errors, `retained GPUI Node tooling must remain conditional: ${candidate}`);
    }
  }
}

function validateDocumentation(errors) {
  const contracts = new Map([
    [path.join(UPGRADE_ROOT, "SKILL.md"), [
      "Windows PowerShell",
      "Node.js >= 24.21",
      "所有操作命令均使用 `node` 且保持单行",
      "--migration-approved",
      "unrecoverable-pre-migration-history",
      "不得声称整个升级闭环完成",
      "所有终端下游还必须同步 `$desktop-switch-post-release-action`",
      "旧 `schema_version: 3` 且缺少 `post_release_action`",
      "旧 schema 3 的 `selection_required` 必须询问用户",
      "post_release_action.mjs check --project-root",
      "`status: configured`",
      "`gui-framework = \"gpui\"`",
      "`gui-framework` 的旧 GUI 下游兼容为 `tauri`",
      "完整 `$desktop-build-gpui-release`",
      "Tauri 与非 GUI 下游不得接收 GPUI 打包 Skill",
      "`scripts/create_gpui_workspace.mjs`",
      "`assets/core/**`",
    ]],
    [path.join(UPGRADE_ROOT, "references", "ownership-policy.md"), [
      ".harness/version-state.json",
      "$desktop-manage-version init --migration-approved",
      "升级器本身不得调用或代写",
      "`post_release_action` 也属于 protected 下游选择",
      "`plan|apply|record` 均不得设置默认值或代写该字段",
      "`$desktop-switch-post-release-action`",
      "`$desktop-add-gpui-adapter` 与 `$desktop-build-gpui-release` 只适用于 `gui-framework = \"gpui\"`",
      "`scripts/create_gpui_workspace.mjs`",
      "`assets/core/**`",
      "升级计划绑定受保护 Cargo 清单的完整快照",
    ]],
  ]);
  for (const [filePath, fragments] of contracts) {
    let source;
    try {
      source = readText(filePath);
    } catch (error) {
      fail(errors, `cannot read upgrade documentation contract ${relativePath(filePath)}: ${error.message}`);
      continue;
    }
    for (const fragment of fragments) {
      if (!source.includes(fragment)) {
        fail(errors, `upgrade documentation contract missing from ${relativePath(filePath)}: ${fragment}`);
      }
    }
    if (filePath.endsWith("SKILL.md")) {
      for (const action of ["plan", "apply", "record"]) {
        if (source.includes(`harness_upgrade.mjs ${action} \\\n`)) {
          fail(errors, `upgrade command examples must not use POSIX line continuation: ${action}`);
        }
      }
    }
  }
}

function validatePostReleaseSwitchPropagation(errors, policyModulePath) {
  let source;
  try {
    source = readText(policyModulePath);
  } catch (error) {
    fail(errors, `cannot read upgrade policy module ${relativePath(policyModulePath)}: ${error.message}`);
    return;
  }
  if (!source.includes("export const REQUIRED_MANAGED_SOURCE_PATHS")) {
    fail(errors, "upgrade policy must export required managed source paths");
  }
  for (const relative of [...REQUIRED_POST_RELEASE_SWITCH_PATHS, ...REQUIRED_TASK_WORKTREE_PATHS]) {
    const absolute = path.join(ROOT, relative);
    if (!fs.existsSync(absolute)) {
      fail(errors, `missing post-release switch source: ${relative}`);
    }
    if (!source.includes(JSON.stringify(relative))) {
      fail(errors, `upgrade policy must propagate post-release switch source: ${relative}`);
    }
  }
  if (!source.includes('[' + JSON.stringify(".agents/skills/desktop-switch-post-release-action/**") + ', "managed"]')) {
    fail(errors, "upgrade policy must keep post-release switch skill managed");
  }
}

function validateModules(errors, modulePaths) {
  const regularModules = [];
  for (const modulePath of modulePaths) {
    let stat;
    try {
      stat = fs.lstatSync(modulePath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        fail(errors, `missing upgrade Node module: ${relativePath(modulePath)}`);
        continue;
      }
      fail(errors, `cannot inspect upgrade Node module ${relativePath(modulePath)}: ${error.message}`);
      continue;
    }
    if (!stat.isFile() || stat.isSymbolicLink()) {
      fail(errors, `missing upgrade Node module: ${relativePath(modulePath)}`);
      continue;
    }
    regularModules.push(modulePath);
  }
  for (const [modulePath, detail] of nodeSyntaxErrors(regularModules)) {
    if (detail !== null) fail(errors, `invalid upgrade Node module ${relativePath(modulePath)}: ${detail}`);
  }
}

/** Validate ownership floors, ordering, documentation, and every maintained upgrade module. */
export function validateUpgradeContract(
  errors,
  {
    manifestPath = UPGRADE_MANIFEST,
    modulePaths = UPGRADE_MODULES,
    policyModulePath = path.join(UPGRADE_ROOT, "scripts", "harness_upgrade_policy.mjs"),
    validateDocs = true,
    validatePropagation = true,
  } = {},
) {
  const manifest = loadUpgradeManifest(errors, manifestPath);
  if (manifest) validateManifest(errors, manifest);
  if (validateDocs) validateDocumentation(errors);
  if (validatePropagation) validatePostReleaseSwitchPropagation(errors, policyModulePath);
  validateModules(errors, modulePaths);
}
