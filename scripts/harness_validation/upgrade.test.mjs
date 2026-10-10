import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { MINIMUM_OWNERSHIP_RULES, VALID_MODES } from "../../.agents/skills/desktop-upgrade-harness/scripts/harness_upgrade_policy.mjs";
import {
  REQUIRED_POST_RELEASE_SWITCH_PATHS,
  REQUIRED_TASK_WORKTREE_PATHS,
  REQUIRED_UPGRADE_RULES,
  UPGRADE_MANIFEST,
  UPGRADE_MODULES,
  VALID_UPGRADE_MODES,
  loadUpgradeManifest,
  validateUpgradeContract,
} from "./upgrade.mjs";

function withTemporaryDirectory(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "harness-upgrade-validator-"));
  try {
    return callback(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function productionManifest() {
  return JSON.parse(fs.readFileSync(UPGRADE_MANIFEST, "utf8"));
}

function validateManifest(manifest, directory) {
  const manifestPath = path.join(directory, "ownership-manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const modulePath = path.join(directory, "valid.mjs");
  fs.writeFileSync(modulePath, "export const valid = true;\n", "utf8");
  const errors = [];
  validateUpgradeContract(errors, {
    manifestPath,
    modulePaths: [modulePath],
    validateDocs: false,
  });
  return errors;
}

test("production upgrade ownership and Node modules satisfy the contract", () => {
  const errors = [];
  validateUpgradeContract(errors);
  assert.deepEqual(errors, []);
});

test("manifest loader rejects malformed JSON without throwing", () => {
  withTemporaryDirectory((directory) => {
    const manifestPath = path.join(directory, "ownership-manifest.json");
    fs.writeFileSync(manifestPath, "{", "utf8");
    const errors = [];
    assert.equal(loadUpgradeManifest(errors, manifestPath), null);
    assert.match(errors.join("\n"), /invalid upgrade ownership manifest/u);
  });
});

/** 第三方知识资产的保护不得缺失，也不能被较早的通用 managed 规则遮蔽。 */
test("design_skill_protection_is_required_and_must_precede_generic_managed", () => {
  withTemporaryDirectory((directory) => {
    const manifest = productionManifest();
    const rule = manifest.rules.find(({ pattern }) => pattern === ".agents/skills/design-taste-frontend/**");
    manifest.rules = manifest.rules.filter((item) => item !== rule);
    assert.match(validateManifest(manifest, directory).join("\n"), /design-taste-frontend\/\*\* must be protected/u);
    manifest.rules.push(rule);
    assert.match(validateManifest(manifest, directory).join("\n"), /third-party design skill protected rule must precede/u);
  });
});

test("design_skill_protection_rejects_earlier_custom_rules_for_the_tree_and_nested_paths", () => {
  withTemporaryDirectory((directory) => {
    for (const pattern of [".agents/skills/design-*/**", ".agents/skills/design-taste-frontend/private/**", ".agents/skills/design-taste-frontend/SKILL.md"]) {
      const manifest = productionManifest();
      const rule = { pattern, mode: "managed" };
      manifest.rules.unshift(rule);
      assert.match(validateManifest(manifest, directory).join("\n"), /third-party design skill protected rule is shadowed/u);
      manifest.rules.shift();
      manifest.rules.push(rule);
      assert.deepEqual(validateManifest(manifest, directory), []);
    }
  });
});

test("minimum protection cannot remove the Harness version tombstone", () => {
  withTemporaryDirectory((directory) => {
    const manifest = productionManifest();
    manifest.rules = manifest.rules.filter(({ pattern }) => pattern !== "Version.md");
    const errors = validateManifest(manifest, directory);
    assert.match(errors.join("\n"), /Version\.md must be tombstone/u);
  });
});

test("validator independently anchors the runtime ownership boundary", () => {
  assert.notStrictEqual(REQUIRED_UPGRADE_RULES, MINIMUM_OWNERSHIP_RULES);
  assert.notStrictEqual(VALID_UPGRADE_MODES, VALID_MODES);
  assert.deepEqual(REQUIRED_UPGRADE_RULES, MINIMUM_OWNERSHIP_RULES);
  assert.deepEqual(VALID_UPGRADE_MODES, VALID_MODES);
  assert.equal(REQUIRED_UPGRADE_RULES.get("scripts/run_harness_tests.mjs"), "tombstone");
});

/** GPUI 工程目录保持 conditional，GUI profile 作为独立产品事实保护。 */
test("gpui_upgrade_assets_are_conditional_and_gui_profile_is_protected", () => {
  assert.equal(REQUIRED_UPGRADE_RULES.get(".agents/skills/desktop-add-gpui-adapter/**"), "conditional");
  assert.equal(REQUIRED_UPGRADE_RULES.get("docs/GUI_APP_PROFILE.md"), "protected");
  withTemporaryDirectory((directory) => {
    const manifest = productionManifest();
    manifest.rules = manifest.rules.filter(({ pattern }) => pattern !== ".agents/skills/desktop-add-gpui-adapter/**");
    assert.match(validateManifest(manifest, directory).join("\n"), /desktop-add-gpui-adapter\/\*\* must be conditional/u);
  });
});

/** 根 package 默认保护，独立迁移入口与验证工具只按 GPUI 条件同步。 */
test("gpui_node_tooling_retains_protected_package_and_conditional_helpers", () => {
  withTemporaryDirectory((directory) => {
    const manifest = productionManifest();
    manifest.rules.unshift({ pattern: "package.json", mode: "managed" });
    assert.match(validateManifest(manifest, directory).join("\n"), /root package\.json must remain protected/u);

    const shadowed = productionManifest();
    shadowed.rules.unshift({ pattern: ".agents/skills/desktop-add-gpui-adapter/scripts/gpui_*.mjs", mode: "tombstone" });
    assert.match(validateManifest(shadowed, directory).join("\n"), /retained GPUI Node tooling must remain conditional/u);
  });
});

/** GPUI 的精确初始化 tombstone 必须存在，并位于整个 GPUI conditional 目录之前。 */
test("gpui_initialization_only_tombstones_cannot_be_omitted_or_shadowed", () => {
  const patterns = [
    ".agents/skills/desktop-add-gpui-adapter/scripts/create_gpui_workspace.mjs",
    ".agents/skills/desktop-add-gpui-adapter/scripts/create_gpui_workspace.test.mjs",
    ".agents/skills/desktop-add-gpui-adapter/assets/core/**",
  ];
  withTemporaryDirectory((directory) => {
    for (const pattern of patterns) {
      assert.equal(REQUIRED_UPGRADE_RULES.get(pattern), "tombstone");
      const manifest = productionManifest();
      const rule = manifest.rules.find((item) => item.pattern === pattern);
      manifest.rules = manifest.rules.filter((item) => item !== rule);
      assert.match(validateManifest(manifest, directory).join("\n"), /must be tombstone/u);
      manifest.rules.push(rule);
      assert.match(validateManifest(manifest, directory).join("\n"), /GPUI initialization-only tombstone must precede/u);
    }
  });
});

test("minimum protection cannot remove the Harness test runner tombstone", () => {
  withTemporaryDirectory((directory) => {
    const manifest = productionManifest();
    manifest.rules = manifest.rules.filter(({ pattern }) => pattern !== "scripts/run_harness_tests.mjs");
    const errors = validateManifest(manifest, directory);
    assert.match(errors.join("\n"), /scripts\/run_harness_tests\.mjs must be tombstone/u);
  });
});

test("post-release switch skill remains managed before the generic rule", () => {
  withTemporaryDirectory((directory) => {
    const manifest = productionManifest();
    const switchRule = ".agents/skills/desktop-switch-post-release-action/**";
    manifest.rules = manifest.rules.filter(({ pattern }) => pattern !== switchRule);
    assert.match(validateManifest(manifest, directory).join("\n"), /post-release-action\/\*\* must be managed/u);

    const restored = productionManifest();
    const genericIndex = restored.rules.findIndex(({ pattern }) => pattern === ".agents/skills/**");
    const switchIndex = restored.rules.findIndex(({ pattern }) => pattern === switchRule);
    const [rule] = restored.rules.splice(switchIndex, 1);
    restored.rules.splice(genericIndex + 1, 0, rule);
    assert.match(validateManifest(restored, directory).join("\n"), /post-release switch managed rule must precede/u);
  });
});

test("managed-self and conditional rules must precede the generic skill rule", () => {
  withTemporaryDirectory((directory) => {
    const manifest = productionManifest();
    const genericIndex = manifest.rules.findIndex(({ pattern }) => pattern === ".agents/skills/**");
    const selfIndex = manifest.rules.findIndex(
      ({ pattern }) => pattern === ".agents/skills/desktop-upgrade-harness/**",
    );
    const [selfRule] = manifest.rules.splice(selfIndex, 1);
    manifest.rules.splice(genericIndex + 1, 0, selfRule);
    const errors = validateManifest(manifest, directory);
    assert.match(errors.join("\n"), /managed-self rule must precede/u);
  });
});

test("required checkers cannot be shadowed by an earlier broad rule", () => {
  for (const checker of [
    ".agents/skills/desktop-implement-change/scripts/check_core_first.mjs",
    ".agents/skills/desktop-implement-change/scripts/project_lock_policy.mjs",
  ]) {
    withTemporaryDirectory((directory) => {
      const manifest = productionManifest();
      const checkerIndex = manifest.rules.findIndex(({ pattern }) => pattern === checker);
      manifest.rules.splice(checkerIndex, 0, {
        pattern: ".agents/skills/desktop-implement-change/**",
        mode: "protected",
      });
      const errors = validateManifest(manifest, directory);
      assert.match(errors.join("\n"), /required checker ownership must remain managed/u);
    });
  }
});

test("duplicate patterns and unknown modes fail closed", () => {
  withTemporaryDirectory((directory) => {
    const manifest = productionManifest();
    manifest.rules.push({ ...manifest.rules[0] });
    manifest.rules[1] = { ...manifest.rules[1], mode: "overwrite" };
    const errors = validateManifest(manifest, directory);
    assert.match(errors.join("\n"), /duplicate upgrade ownership rule/u);
    assert.match(errors.join("\n"), /has invalid mode/u);
  });
});

test("malformed upgrade source syntax is rejected by Node", () => {
  withTemporaryDirectory((directory) => {
    const manifestPath = path.join(directory, "ownership-manifest.json");
    fs.copyFileSync(UPGRADE_MANIFEST, manifestPath);
    const brokenModule = path.join(directory, "broken.mjs");
    fs.writeFileSync(brokenModule, "export const broken = ;\n", "utf8");
    const errors = [];
    validateUpgradeContract(errors, {
      manifestPath,
      modulePaths: [brokenModule],
      validateDocs: false,
    });
    assert.match(errors.join("\n"), /invalid upgrade Node module/u);
  });
});

test("required GUI capabilities remain conditional and product facts remain protected", () => {
  const required = REQUIRED_UPGRADE_RULES;
  for (const capability of [
    ".agents/skills/desktop-add-gui-system-tray/**",
    ".agents/skills/desktop-add-gui-system-notifications/**",
    ".agents/skills/desktop-add-gui-autostart/**",
    ".agents/skills/desktop-add-gui-single-instance/**",
    ".agents/skills/desktop-add-gui-deep-link/**",
    ".agents/skills/desktop-add-gui-global-shortcut/**",
  ]) {
    assert.equal(required.get(capability), "conditional");
  }
  for (const protectedPath of [
    "docs/product_spec/**",
    "docs/project_status/**",
    ".harness/version-state.json",
    ".harness/release-context.json",
    "LICENSE.zh-CN.md",
    "LICENSE.en.md",
  ]) {
    assert.equal(required.get(protectedPath), "protected");
  }
});

test("complete Git lifecycle implementation is present in managed scope", () => {
  const lifecycleRoot = path.join(
    path.dirname(path.dirname(UPGRADE_MANIFEST)),
    "..",
    "desktop-manage-git-lifecycle",
  );
  const files = [
    "SKILL.md",
    "agents/openai.yaml",
    "scripts/git_lifecycle.mjs",
    "scripts/git_lifecycle_core.mjs",
    "scripts/git_lifecycle_publication.mjs",
    "scripts/git_publication_report.mjs",
    "scripts/git_lifecycle_test_support.mjs",
    "scripts/git_publication_test_cases.test.mjs",
    "scripts/git_lifecycle.test.mjs",
    "scripts/git_lifecycle_release.test.mjs",
  ];
  for (const relative of files) assert.equal(fs.existsSync(path.join(lifecycleRoot, relative)), true, relative);
  assert.equal(REQUIRED_UPGRADE_RULES.get(".agents/skills/desktop-manage-git-lifecycle/**"), "managed");
});

test("upgrade policy propagates every post-release switch source", () => {
  withTemporaryDirectory((directory) => {
    const sourcePath = path.join(path.dirname(UPGRADE_MANIFEST), "..", "scripts", "harness_upgrade_policy.mjs");
    const source = fs.readFileSync(sourcePath, "utf8");
    const missing = REQUIRED_POST_RELEASE_SWITCH_PATHS[2];
    assert.ok(source.includes(JSON.stringify(missing)));
    const policyModulePath = path.join(directory, "policy.mjs");
    fs.writeFileSync(policyModulePath, source.replace(JSON.stringify(missing), '"removed-switch-script"'));
    const errors = [];
    validateUpgradeContract(errors, {
      policyModulePath,
      modulePaths: [],
      validateDocs: false,
    });
    assert.match(errors.join("\n"), /must propagate post-release switch source/u);
  });
});

/** 关闭选择仍传播独立技能，受保护的策略文件不变成 managed。 */
test("task_worktree_skill_is_complete_managed_and_policy_stays_protected", () => {
  assert.equal(REQUIRED_UPGRADE_RULES.get(".agents/skills/desktop-manage-task-worktrees/**"), "managed");
  assert.equal(REQUIRED_UPGRADE_RULES.get("docs/AGENT_POLICY.md"), "protected");
  withTemporaryDirectory((directory) => {
    const manifest = productionManifest();
    manifest.rules = manifest.rules.filter(({ pattern }) => pattern !== ".agents/skills/desktop-manage-task-worktrees/**");
    assert.match(validateManifest(manifest, directory).join("\n"), /desktop-manage-task-worktrees\/\*\* must be managed/u);
    const policySource = fs.readFileSync(path.join(path.dirname(UPGRADE_MANIFEST), "..", "scripts", "harness_upgrade_policy.mjs"), "utf8");
    for (const missing of REQUIRED_TASK_WORKTREE_PATHS) {
      const policyModulePath = path.join(directory, "policy.mjs");
      fs.writeFileSync(policyModulePath, policySource.replace(JSON.stringify(missing), '"removed-worktree-source"'));
      const errors = [];
      validateUpgradeContract(errors, { policyModulePath, modulePaths: [], validateDocs: false });
      assert.ok(errors.some((error) => error.includes(missing)), missing);
    }
  });
});

test("initialization-only GUI lifecycle skill remains tombstoned", () => {
  assert.equal(
    REQUIRED_UPGRADE_RULES.get(".agents/skills/desktop-test-gui-initialization-e2e/**"),
    "tombstone",
  );
});

test("upgrade module inventory uses production modules and test suffixes", () => {
  assert.ok(UPGRADE_MODULES.some((file) => file.endsWith("harness_upgrade.mjs")));
  for (const file of UPGRADE_MODULES) {
    if (file.includes("test")) assert.match(file, /(?:\.test\.mjs|test_support\.mjs)$/u);
  }
});
