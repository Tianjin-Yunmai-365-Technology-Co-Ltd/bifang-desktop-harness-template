/** 发布构建、上下文与 Git 发布边界的确定性 mutation 回归。 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { ROOT } from "./core.mjs";
import {
  AGENT_POLICY,
  BUILD_RELEASE_SKILL,
  COLLECT_RELEASE_SKILL,
  CROSS_PLATFORM_RELEASE_CONTEXT_HELPER,
  CROSS_PLATFORM_RELEASE_WORKFLOW,
  GIT_LIFECYCLE_PUBLICATION,
  GIT_LIFECYCLE_SKILL,
  PREPARE_RELEASE_SKILL,
  RELEASE_CONTEXT_HELPER,
  RELEASE_DOC,
  TAURI_LOCAL_INSTALL_SKILL,
  TAURI_RELEASE_SKILL,
  VERIFY_DELIVERY_SKILL,
  validateBuildSkillContract,
  validateHarnessSourceReleaseContract,
  validateReleaseContract,
  validateReleaseGitContract,
  validateReleaseIgnore,
  validateReleaseSelectionContract,
  validateTauriLocalInstallContract,
} from "./release.mjs";
import { mutateFile, validateMutation, withTemporaryFile } from "./release_test_support.mjs";

function expectErrors(errors, fragment) {
  assert.ok(errors.length > 0, "mutation unexpectedly passed");
  if (fragment) assert.ok(errors.some((error) => error.includes(fragment)), errors.join("\n"));
}

function validateContents(validator, option, sourcePath, contents) {
  return withTemporaryFile(contents, path.basename(sourcePath), (filePath) => {
    const errors = [];
    validator(errors, { [option]: filePath });
    return errors;
  });
}

test("current aggregate release contract passes", () => {
  const errors = [];
  validateReleaseContract(errors);
  assert.deepEqual(errors, []);
});

test("release ignore requires exact root-anchored rules", () => {
  const cases = [
    ["/target/\n/release/\n/.release-clean.*\n", false],
    ["/release/\n/release/\n/.release-clean.*\n", true],
    ["/release/\n/.release-clean.*\nrelease/\n", true],
    ["/release/\n", true],
  ];
  for (const [contents, shouldFail] of cases) {
    withTemporaryFile(contents, ".gitignore", (filePath) => {
      const errors = [];
      validateReleaseIgnore(errors, filePath);
      assert.equal(Boolean(errors.length), shouldFail, errors.join("\n"));
    });
  }
});

const buildCases = [
  ["per-candidate E2E choice", "buildSkill", BUILD_RELEASE_SKILL, "本次请求已明确 `enabled`/`disabled` 时直接复用"],
  ["workflow context capture", "crossPlatformWorkflow", CROSS_PLATFORM_RELEASE_WORKFLOW, "verify_release_context.mjs capture"],
  ["workflow context reverify", "crossPlatformWorkflow", CROSS_PLATFORM_RELEASE_WORKFLOW, "verify_release_context.mjs verify"],
  ["worktree byte binding", "crossPlatformContextHelper", CROSS_PLATFORM_RELEASE_CONTEXT_HELPER, "working release context bytes do not match source_commit"],
  ["remote publication mode", "crossPlatformContextHelper", CROSS_PLATFORM_RELEASE_CONTEXT_HELPER, 'normalized.gitPublication !== "remote"'],
  ["collection second context verification", "collectSkill", COLLECT_RELEASE_SKILL, "在触碰目标目录前第二次运行发布上下文 `verify`"],
];

for (const [name, option, source, fragment] of buildCases) {
  test(`release build rejects missing ${name}`, () => {
    expectErrors(validateMutation(validateBuildSkillContract, option, source, fragment), "release contract missing");
  });
}

const selectionCases = [
  ["lifecycle release invocation", "prepareSkill", PREPARE_RELEASE_SKILL, "$desktop-manage-git-lifecycle release"],
  ["Rust context verification", "rustSkill", BUILD_RELEASE_SKILL, "release_context.mjs verify --project-root ."],
  ["Tauri context verification", "tauriSkill", TAURI_RELEASE_SKILL, "release_context.mjs verify --project-root ."],
  ["delivery pre-status context verification", "verifySkill", VERIFY_DELIVERY_SKILL, "在写入验收状态前再次运行发布上下文 `verify`"],
  ["Tauri macOS signing selection", "tauriSkill", TAURI_RELEASE_SKILL, "当前候选目标包含 macOS 时 `macosSigningSelection` 必须精确为 `enabled | disabled`"],
];

for (const [name, option, source, fragment] of selectionCases) {
  test(`release selection rejects missing ${name}`, () => {
    expectErrors(validateMutation(validateReleaseSelectionContract, option, source, fragment), "release selection contract missing");
  });
}

test("release context requires publication, review, and candidate selection groups", () => {
  for (const fragment of [
    'value.gitPublication === "local"',
    "releaseReview: validateReleaseReview(value.releaseReview, sourceHead)",
    "candidateSelections: validateCandidateSelections(value.candidateSelections)",
  ]) {
    expectErrors(validateMutation(validateReleaseSelectionContract, "contextHelper", RELEASE_CONTEXT_HELPER, fragment));
  }
});

const harnessCases = [
  ["Harness Git-only endpoint", "releaseDoc", RELEASE_DOC, "Harness 在步骤 2 完成并复核 Git 引用后结束"],
  ["downstream-only candidate steps", "releaseDoc", RELEASE_DOC, "步骤 3–7 仅适用于终端下游产品候选"],
  ["downstream-only ready review", "prepareSkill", PREPARE_RELEASE_SKILL, "以下就绪复核只适用于已经形成产品候选的终端下游"],
  ["Harness entry metadata endpoint", "prepareOpenai", path.join(path.dirname(PREPARE_RELEASE_SKILL), "agents", "openai.yaml"), "Harness 源至此完成 Git 发布"],
  ["registered remote precedence", "agentPolicy", AGENT_POLICY, "当前发布周期已经登记该远端时必须原样沿用"],
  ["notes-and-context-only metadata commit", "prepareSkill", PREPARE_RELEASE_SKILL, "第二个精确范围提交只能同时包含 `release-notes.json` 与 `.harness/release-context.json`"],
  ["current sourceHead binding", "contextHelper", RELEASE_CONTEXT_HELPER, "sourceHead must equal the current HEAD before metadata commit"],
  ["Harness not-applicable signing", "prepareSkill", PREPARE_RELEASE_SKILL, "--macos-signing-selection not-applicable --macos-signing-source not-applicable"],
  ["Harness archive without product manifest", "releaseDoc", RELEASE_DOC, "它不是产品候选，不创建或套用产品 manifest"],
];

for (const [name, option, source, fragment] of harnessCases) {
  test(`Harness release rejects missing ${name}`, () => {
    expectErrors(validateMutation(validateHarnessSourceReleaseContract, option, source, fragment), "Harness source release contract missing");
  });
}

test("Harness release requires explicit local and remote publication modes", () => {
  for (const fragment of [
    "git_lifecycle.mjs release --project-root . --version <version> --date YYYYMMDD --release-context-sha256 <releaseContextSha256> --remote <remote>",
    "git_lifecycle.mjs release --project-root . --version <version> --date YYYYMMDD --release-context-sha256 <releaseContextSha256> --local-only",
  ]) {
    expectErrors(validateMutation(validateHarnessSourceReleaseContract, "prepareSkill", PREPARE_RELEASE_SKILL, fragment), "Harness source release contract missing");
  }
});

test("historical review rejects a deleted daily ADR path", () => {
  const current = path.join(ROOT, "docs", "verification", "human_review.md");
  const contents = `${fs.readFileSync(current, "utf8")}\n\`docs/adr/20260911_ADR.md\`\n`;
  expectErrors(validateContents(validateHarnessSourceReleaseContract, "humanReview", current, contents), "retains deleted 20260911 ADR path");
});

test("methodology may not make a missing release tag non-blocking", () => {
  const current = path.join(ROOT, "docs", "harness_engineering", "agent_first_design.md");
  const source = fs.readFileSync(current, "utf8");
  const contents = source.replace("其缺席不代替或放宽模式内 Git tag 门禁", "缺席不阻断候选验收或只读就绪复核");
  assert.notEqual(contents, source);
  expectErrors(validateContents(validateHarnessSourceReleaseContract, "methodologyDoc", current, contents), "allows a missing release tag");
});

test("triggered Changelog must precede sourceHead and metadata", () => {
  const source = fs.readFileSync(PREPARE_RELEASE_SKILL, "utf8");
  const fragment = "任何由独立事件真实触发的 Changelog";
  const contents = `${source.replace(fragment, "")}\n${fragment}\n`;
  expectErrors(validateContents(validateHarnessSourceReleaseContract, "prepareSkill", PREPARE_RELEASE_SKILL, contents), "contract order");
});

test("shared Git steps must precede downstream candidate steps", () => {
  const source = fs.readFileSync(RELEASE_DOC, "utf8");
  const fragment = "步骤 1–2 是 Harness 源与终端下游的正式 Git 发布共享流程";
  const contents = `${source.replace(fragment, "")}\n${fragment}\n`;
  expectErrors(validateContents(validateHarnessSourceReleaseContract, "releaseDoc", RELEASE_DOC, contents), "contract order");
});

test("release document rejects the context-only legacy Git sequence", () => {
  const source = fs.readFileSync(RELEASE_DOC, "utf8");
  const marker = "步骤 1–2 是 Harness 源与终端下游的正式 Git 发布共享流程";
  const legacy = "写入 `.harness/release-context.json` 并提交；随后 `release --version <version>`";
  expectErrors(validateContents(validateHarnessSourceReleaseContract, "releaseDoc", RELEASE_DOC, `${source}\n${marker}\n${legacy}\n`), "stale context-only Git release");
});

test("release Git contract requires exact local branch cleanup", () => {
  expectErrors(validateMutation(validateReleaseGitContract, "lifecycleScript", GIT_LIFECYCLE_PUBLICATION, '["branch", "-D", "--", branch]'), "release Git contract missing");
});

test("release Git contract requires additional remote publication semantics", () => {
  expectErrors(validateMutation(validateReleaseGitContract, "lifecycleSkill", GIT_LIFECYCLE_SKILL, "跨远端推送不是原子操作"), "release Git contract missing");
});

test("local install cannot become a release candidate", () => {
  const contents = mutateFile(TAURI_LOCAL_INSTALL_SKILL, "releaseCandidate: false");
  withTemporaryFile(contents, "SKILL.md", (filePath) => {
    const errors = [];
    validateTauriLocalInstallContract(errors, filePath);
    expectErrors(errors, "Tauri local install contract missing");
  });
});
