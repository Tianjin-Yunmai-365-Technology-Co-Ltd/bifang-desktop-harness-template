import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  DEFAULT_PATHS,
  validateEngineeringContract,
  validateStreamlinedDevelopmentAndBuild,
} from "./governance_contracts.mjs";

function withTemporaryDirectory(callback) {
  const directory = mkdtempSync(path.join(tmpdir(), "afh-governance-contracts-"));
  try { callback(directory); } finally { rmSync(directory, { force: true, recursive: true }); }
}

function mutatedCopy(directory, key, anchor, replacement) {
  const source = readFileSync(DEFAULT_PATHS[key], "utf8");
  assert.ok(source.includes(anchor), `${key} fixture must contain ${anchor}`);
  const target = path.join(directory, path.basename(DEFAULT_PATHS[key]));
  writeFileSync(target, source.replace(anchor, replacement));
  return target;
}

function expectError(errors, fragment) {
  assert.ok(errors.some((error) => error.includes(fragment)), `${fragment}\n${errors.join("\n")}`);
}

test("current engineering and streamlined workflow contracts pass", () => {
  const engineering = [];
  const streamlined = [];
  validateEngineeringContract(engineering);
  validateStreamlinedDevelopmentAndBuild(streamlined);
  assert.deepEqual(engineering, []);
  assert.deepEqual(streamlined, []);
});

test("engineering contract rejects a removed source-of-truth fragment", () => withTemporaryDirectory((directory) => {
  const anchor = "check_rust_chinese_comments.mjs";
  const engineeringRules = mutatedCopy(directory, "engineeringRules", anchor, "removed-comment-checker");
  const errors = [];
  validateEngineeringContract(errors, { paths: { engineeringRules } });
  expectError(errors, anchor);
}));

test("engineering contract fails closed when a referenced file is missing", () => withTemporaryDirectory((directory) => {
  const errors = [];
  validateEngineeringContract(errors, { paths: { rustAssetLib: path.join(directory, "missing.rs") } });
  expectError(errors, "missing engineering contract file");
}));

test("streamlined contract rejects branch-gate regression", () => withTemporaryDirectory((directory) => {
  const anchor = "不设置任何分支门禁";
  const gitLifecycleSkill = mutatedCopy(directory, "gitLifecycleSkill", anchor, "恢复严格线性分支门禁");
  const errors = [];
  validateStreamlinedDevelopmentAndBuild(errors, { paths: { gitLifecycleSkill } });
  expectError(errors, anchor);
}));

test("streamlined contract rejects automatic build checks", () => withTemporaryDirectory((directory) => {
  const anchor = "不得在构建名义下自动追加格式、lint、中文注释或其他开发门禁";
  const buildReleaseSkill = mutatedCopy(directory, "buildReleaseSkill", anchor, "构建时自动追加全部开发门禁");
  const errors = [];
  validateStreamlinedDevelopmentAndBuild(errors, { paths: { buildReleaseSkill } });
  expectError(errors, anchor);
}));

test("streamlined contract rejects obsolete tiered workflow language", () => withTemporaryDirectory((directory) => {
  const rule = path.join(directory, "rule.md");
  writeFileSync(rule, "# Rule\n快速路径\n");
  const errors = [];
  validateStreamlinedDevelopmentAndBuild(errors, { currentRuleFiles: [rule] });
  expectError(errors, "obsolete tiered workflow remains");
}));

test("streamlined contract rejects unsafe parallel helper behavior", () => withTemporaryDirectory((directory) => {
  const parallelScript = path.join(directory, "parallel_worktrees.mjs");
  writeFileSync(parallelScript, `${readFileSync(DEFAULT_PATHS.parallelScript, "utf8")}\n// git stash\n`);
  const errors = [];
  validateStreamlinedDevelopmentAndBuild(errors, { paths: { parallelScript } });
  expectError(errors, "unsafe parallel helper behavior present: git stash");
}));

test("streamlined contract validates active JavaScript syntax", () => withTemporaryDirectory((directory) => {
  const gitLifecycleEntry = path.join(directory, "git_lifecycle.mjs");
  writeFileSync(gitLifecycleEntry, `${readFileSync(DEFAULT_PATHS.gitLifecycleEntry, "utf8")}\nconst = ;\n`);
  const errors = [];
  validateStreamlinedDevelopmentAndBuild(errors, { paths: { gitLifecycleEntry } });
  expectError(errors, "invalid Git lifecycle Node module");
}));
