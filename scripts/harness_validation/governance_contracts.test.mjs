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
  writeFileSync(target, source.replaceAll(anchor, replacement));
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

test("engineering contract requires the post-release policy field", () => withTemporaryDirectory((directory) => {
  const anchor = "post_release_action: pending";
  const agentPolicy = mutatedCopy(directory, "agentPolicy", anchor, "removed-post-release-selection");
  const errors = [];
  validateEngineeringContract(errors, { paths: { agentPolicy } });
  expectError(errors, anchor);
}));

test("engineering contract fails closed when a referenced file is missing", () => withTemporaryDirectory((directory) => {
  const errors = [];
  validateEngineeringContract(errors, { paths: { rustAssetLib: path.join(directory, "missing.rs") } });
  expectError(errors, "missing engineering contract file");
}));

test("streamlined contract rejects branch-gate regression", () => withTemporaryDirectory((directory) => {
  const anchor = "不设置租约、原子推送或保护分支门禁";
  const gitLifecycleSkill = mutatedCopy(directory, "gitLifecycleSkill", anchor, "恢复严格线性分支门禁");
  const errors = [];
  validateStreamlinedDevelopmentAndBuild(errors, { paths: { gitLifecycleSkill } });
  expectError(errors, anchor);
}));

test("streamlined contract requires the action-switch skill", () => withTemporaryDirectory((directory) => {
  const anchor = "name: desktop-switch-post-release-action";
  const switchPostReleaseSkill = mutatedCopy(directory, "switchPostReleaseSkill", anchor, "name: removed-switch-skill");
  const errors = [];
  validateStreamlinedDevelopmentAndBuild(errors, { paths: { switchPostReleaseSkill } });
  expectError(errors, anchor);
}));

/** 默认关闭路径与开启技能职责各自受门禁约束，不能退回无条件工作树。 */
test("task_environment_contract_rejects_each_missing_binding_boundary", () => withTemporaryDirectory((directory) => {
  for (const [key, anchors] of [
    ["manageTasksSkill", ["仅开启时", "environment.type=local", "Local 没有 startingState", "只读期间", "前序须 idle/completed", "恢复漂移不自动 checkout/stash"]],
    ["taskWorktreesSkill", ["关闭时不调用", "唯一一次 create_thread", "不得另建第二个 Task", "冻结选择", "不使用普通 create_worktree"]],
  ]) for (const anchor of anchors) {
    const changed = mutatedCopy(directory, key, anchor, "已删除边界");
    const errors = [];
    validateStreamlinedDevelopmentAndBuild(errors, { paths: { [key]: changed } });
    expectError(errors, anchor);
  }
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

/** 业务前绑定与真实消息复读必须同时留在可执行 Skill 入口。 */
test("streamlined contract rejects lost task or Chinese commit entry points", () => withTemporaryDirectory((directory) => {
  for (const [key, anchor] of [
    ["agentsEntrypoint", "每次开工先读取用户级"],
    ["implementSkill", "不承担正式验收、发布或推送"],
    ["handoffSkill", "主动修复原 Task"],
    ["initializeSkill", "自定义模式直接复用已明确的 Task 启用授权"],
    ["instantiateSkill", "汇总分别列出项目值、用户级强制规则与有效执行行为"],
    ["manageTasksSkill", "业务资料阅读、插件探索、分析、设计"],
    ["manageTasksSkill", "工具成功回执不能代替复读"],
    ["manageTasksSkill", "非 pinned"],
    ["configureCommitsSkill", "message-check --message-file <file>"],
    ["configureCommitsSkill", "git log -1 --format=%B"],
    ["gitLifecycleSkill", "普通 `git merge --no-edit -m <中文合并消息>`"],
  ]) {
    const target = mutatedCopy(directory, key, anchor, "已删除合同");
    const errors = [];
    validateStreamlinedDevelopmentAndBuild(errors, { paths: { [key]: target } });
    expectError(errors, anchor);
  }
}));
