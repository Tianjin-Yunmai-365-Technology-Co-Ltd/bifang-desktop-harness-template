import fs from "node:fs";
import path from "node:path";

import {
  ROOT,
  fail,
  readJson,
  readText,
  relativePath,
  run,
} from "./core.mjs";

export const UPGRADE_ROOT = path.join(ROOT, ".agents", "skills", "desktop-upgrade-harness");
export const UPGRADE_MANIFEST = path.join(UPGRADE_ROOT, "references", "ownership-manifest.json");

export const REQUIRED_UPGRADE_RULES = new Map([
  ["Version.md", "tombstone"],
  [".agents/skills/desktop-instantiate-project/**", "tombstone"],
  [".agents/skills/desktop-initialize-rust-project/**", "tombstone"],
  [".agents/skills/desktop-test-gui-initialization-e2e/**", "tombstone"],
  ["scripts/validate_harness.mjs", "tombstone"],
  ["scripts/agile_workflow.test.mjs", "tombstone"],
  ["scripts/harness_scope_and_initialization_boundaries.test.mjs", "tombstone"],
  ["scripts/validate_harness.test.mjs", "tombstone"],
  ["scripts/harness_validation/**", "tombstone"],
  ["docs/HARNESS_ENGINEERING.md", "tombstone"],
  ["docs/harness_engineering/**", "tombstone"],
  ["docs/AGENT_POLICY.md", "protected"],
  ["docs/GUI_SUPPORT_SURFACES.md", "protected"],
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
  ["Cargo.lock", "protected"],
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
  [".agents/skills/desktop-implement-change/scripts/check_rust_chinese_comments.mjs", "managed"],
  [".agents/skills/desktop-implement-change/scripts/check_rust_chinese_comments.test.mjs", "managed"],
  [".agents/skills/desktop-manage-git-lifecycle/**", "managed"],
  [".agents/skills/desktop-upgrade-harness/**", "managed-self"],
  [".agents/skills/desktop-add-cli-adapter/**", "conditional"],
  [".agents/skills/desktop-add-tui-adapter/**", "conditional"],
  [".agents/skills/desktop-add-mcp-adapter/**", "conditional"],
  [".agents/skills/desktop-add-gui-adapter/**", "conditional"],
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
  "managed",
  "managed-self",
  "merge-sections",
  "conditional",
  "protected",
  "tombstone",
]);

export const UPGRADE_MODULES = [
  "harness_upgrade.mjs",
  "harness_upgrade_core.mjs",
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
    [".agents/skills/desktop-upgrade-harness/**", "managed-self", "upgrade managed-self rule"],
    [".agents/skills/desktop-manage-git-lifecycle/**", "managed", "upgrade Git lifecycle managed rule"],
  ];
  for (const [pattern, mode, label] of orderedBeforeGeneric) {
    const index = ordered.findIndex(([candidate, candidateMode]) => candidate === pattern && candidateMode === mode);
    if (index >= 0 && generic >= 0 && index >= generic) fail(errors, `${label} must precede generic managed rule`);
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

  for (const [requiredPath, mode] of REQUIRED_UPGRADE_RULES) {
    if (mode !== "managed" || requiredPath.includes("*")) continue;
    if (effectiveMode(requiredPath, ordered, manifest.default_mode) !== "managed") {
      fail(errors, `required checker ownership must remain managed: ${requiredPath}`);
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
    ]],
    [path.join(UPGRADE_ROOT, "references", "ownership-policy.md"), [
      ".harness/version-state.json",
      "$desktop-manage-version init --migration-approved",
      "升级器本身不得调用或代写",
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

function validateModules(errors, modulePaths) {
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
    const result = run(process.execPath, ["--check", modulePath], { timeout: 30_000 });
    if (result.error || result.status !== 0) {
      const detail = (result.stderr || result.error?.message || "no diagnostic").trim();
      fail(errors, `invalid upgrade Node module ${relativePath(modulePath)}: ${detail}`);
    }
  }
}

/** Validate ownership floors, ordering, documentation, and every maintained upgrade module. */
export function validateUpgradeContract(
  errors,
  { manifestPath = UPGRADE_MANIFEST, modulePaths = UPGRADE_MODULES, validateDocs = true } = {},
) {
  const manifest = loadUpgradeManifest(errors, manifestPath);
  if (manifest) validateManifest(errors, manifest);
  if (validateDocs) validateDocumentation(errors);
  validateModules(errors, modulePaths);
}
