import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  REQUIRED_UPGRADE_RULES,
  UPGRADE_MANIFEST,
  UPGRADE_MODULES,
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

test("minimum protection cannot remove the Harness version tombstone", () => {
  withTemporaryDirectory((directory) => {
    const manifest = productionManifest();
    manifest.rules = manifest.rules.filter(({ pattern }) => pattern !== "Version.md");
    const errors = validateManifest(manifest, directory);
    assert.match(errors.join("\n"), /Version\.md must be tombstone/u);
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

test("specific checker paths cannot be shadowed by an earlier broad rule", () => {
  withTemporaryDirectory((directory) => {
    const manifest = productionManifest();
    const checker = ".agents/skills/desktop-implement-change/scripts/check_core_first.mjs";
    const checkerIndex = manifest.rules.findIndex(({ pattern }) => pattern === checker);
    manifest.rules.splice(checkerIndex, 0, {
      pattern: ".agents/skills/desktop-implement-change/**",
      mode: "protected",
    });
    const errors = validateManifest(manifest, directory);
    assert.match(errors.join("\n"), /required checker ownership must remain managed/u);
  });
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
