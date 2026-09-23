/** 候选 workflow 的结构、helper 与真实文件边界回归。 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";

import {
  CANDIDATE_WORKFLOW_HELPER,
  RELEASE_CONTEXT_HELPER,
  validateCandidateWorkflowHelper,
  validateReleaseContextHelper,
  validateWorkflow,
} from "./workflow.mjs";
import {
  baseWorkflow,
  cleanup,
  runCandidateHelper,
  temporaryDirectory,
  validateMutatedHelper,
  validateWorkflowText,
} from "./workflow_test_support.mjs";

function changed(source, fragment, replacement = "") {
  assert.ok(source.includes(fragment), `fixture fragment is absent: ${fragment}`);
  return source.replace(fragment, replacement);
}

function expectRejected(contents, fragment) {
  const errors = validateWorkflowText(contents);
  assert.ok(errors.length > 0, "mutation unexpectedly passed");
  if (fragment) assert.ok(errors.some((error) => error.includes(fragment)), errors.join("\n"));
}

function removeStep(source, startName, nextMarker) {
  const start = source.indexOf(`      - name: ${startName}\n`);
  const end = source.indexOf(nextMarker, start + 1);
  assert.ok(start >= 0 && end > start, `cannot slice step ${startName}`);
  return source.slice(0, start) + source.slice(end);
}

test("current reviewed workflow and helpers pass", () => {
  const errors = [];
  validateWorkflow(errors);
  assert.deepEqual(errors, []);
});

test("CRLF workflow bytes canonicalize to reviewed content", () => {
  assert.deepEqual(validateWorkflowText(baseWorkflow(), { crlf: true }), []);
});

const workflowMutations = [
  ["missing per-build E2E selection", "      e2e_selection:\n", "      retired_selection:\n", "e2e_selection"],
  ["non-disabled E2E default", "        default: disabled\n", "        default: enabled\n", "default: disabled"],
  ["arbitrary command input", "      version:\n", "      arbitrary_command:\n        type: string\n      version:\n", "inputs must be exactly"],
  ["matrix fail-fast enabled", "      fail-fast: false\n", "      fail-fast: true\n", "forbidden candidate behavior"],
  ["mutable checkout action", "actions/checkout@11d5960a326750d5838078e36cf38b85af677262", "actions/checkout@v4", "action-step allowlist"],
  ["checkout points at source input", "          ref: ${{ github.event.repository.default_branch }}\n", "          ref: ${{ inputs.source_commit }}\n", "forbidden candidate behavior"],
  ["shallow checkout", "          fetch-depth: 0\n", "          fetch-depth: 1\n", "fetch-depth: 0"],
  ["missing Node setup version", "          node-version: 24.21.0\n", "          node-version: 24.20.0\n", "runtime setup"],
  ["format gate injected into build", "          cargo test --workspace --all-targets --all-features --locked\n", "          cargo fmt --all -- --check\n          cargo test --workspace --all-targets --all-features --locked\n", "forbidden candidate behavior"],
  ["lint gate injected into build", "          cargo test --workspace --all-targets --all-features --locked\n", "          cargo clippy --workspace\n          cargo test --workspace --all-targets --all-features --locked\n", "forbidden candidate behavior"],
  ["Unix packaging loses success guard", "        if: runner.os != 'Windows' && success()\n", "        if: runner.os != 'Windows'\n", "exact guard"],
  ["Windows packaging loses success guard", "        if: runner.os == 'Windows' && success()\n", "        if: runner.os == 'Windows'\n", "exact guard"],
  ["upload loses success guard", "        if: success()\n        with:\n", "        with:\n", "upload step"],
  ["Unix package omits release notes", ' -C "$GITHUB_WORKSPACE" release-notes.json', "", "packaging gate"],
  ["Windows package omits release notes", '@($binary, "release-notes.json")', "@($binary)", "packaging gate"],
  ["signing failures may not be swallowed", "      - name: 尝试 Unix 签名\n", "      - name: 尝试 Unix 签名\n        continue-on-error: true\n", "forbidden candidate behavior"],
  ["upload path must remain exact", "            release/${{ steps.candidate_artifact.outputs.archive_name }}.sha256\n", "            output/${{ steps.candidate_artifact.outputs.archive_name }}.sha256\n", "upload missing exact"],
];

for (const [name, fragment, replacement, error] of workflowMutations) {
  test(`rejects ${name}`, () => expectRejected(changed(baseWorkflow(), fragment, replacement), error));
}

test("rejects missing package steps without throwing", () => {
  const mutated = removeStep(baseWorkflow(), "打包 Unix 候选", "      - name: 解析候选制品\n");
  expectRejected(mutated, "candidate workflow must checkout");
});

test("rejects missing release-notes validation", () => {
  const mutated = removeStep(baseWorkflow(), "验证发布更新日志", "      - name: 准备 Unix 发布目录\n");
  expectRejected(mutated, "release_notes.mjs check");
});

test("rejects missing first context capture", () => {
  const mutated = removeStep(baseWorkflow(), "捕获已发布上下文", "      - name: 读取项目最低 Rust 版本\n");
  expectRejected(mutated, "offline context helper exactly twice");
});

test("rejects missing second context verification", () => {
  const source = baseWorkflow();
  const call = "          node .agents/skills/desktop-prepare-cross-platform-release/scripts/verify_release_context.mjs verify \\\n";
  expectRejected(changed(source, call), "offline context helper exactly twice");
});

test("comments cannot mask active test, pending state, or upload guard", () => {
  const source = baseWorkflow();
  const mutations = [
    changed(source, "          cargo test --workspace --all-targets --all-features --locked\n", "          # cargo test --workspace --all-targets --all-features --locked\n"),
    changed(source, "        if: success()\n        with:\n", "        if: always() # if: success()\n        with:\n"),
    `${source}\n# cargo test --workspace --all-targets --all-features --locked\n`,
  ];
  for (const mutation of mutations) expectRejected(mutation);
});

const candidateHelperMutations = [
  ["manifest E2E projection", 'e2eSelection: environment("E2E_SELECTION")', "e2eChoice: null"],
  ["manifest release-context digest", "releaseContextSha256: snapshot.releaseContextSha256", "contextDigest: null"],
  ["manifest review projection", "releaseReview: review", "reviewProjection: review"],
  ["manifest candidate selections", "candidateSelections: snapshot.candidateSelections", "selections: snapshot.candidateSelections"],
  ["manifest signing evidence", 'signingEvidence: { verification: environment("SIGNING_EVIDENCE")', "signingEvidence: { verification: null"],
  ["post-test source recheck", "测试后源码提交或 clean 状态发生变化", "测试完成"],
  ["atomic directory rename", "renameSync(stage, releasePath)", "rmdirSync(stage)"],
  ["post-commit exact-set recheck", "已提交的发布文件集不是精确候选集合", "已提交"],
];

for (const [name, fragment, replacement] of candidateHelperMutations) {
  test(`candidate helper rejects missing ${name}`, () => {
    const errors = validateMutatedHelper(CANDIDATE_WORKFLOW_HELPER, fragment, replacement);
    assert.ok(errors.length > 0, `${name} mutation unexpectedly passed`);
  });
}

const contextHelperMutations = [
  ["named checkout", "runner must check out the named repository default branch at source_commit", "checkout accepted"],
  ["tracked context bytes", "working release context bytes do not match source_commit", "context accepted"],
  ["host-verified digest", "release context digest does not match the host-verified input", "digest accepted"],
  ["remote publication", 'normalized.gitPublication !== "remote"', 'normalized.gitPublication !== "local"'],
  ["remote default branch", "`refs/remotes/origin/${repositoryDefaultBranch}`", '"refs/remotes/origin/main"'],
  ["release tag", "`refs/tags/${normalized.expectedTag}`", '"refs/tags/latest"'],
];

for (const [name, fragment, replacement] of contextHelperMutations) {
  test(`release-context helper rejects weakened ${name}`, () => {
    const errors = validateMutatedHelper(RELEASE_CONTEXT_HELPER, fragment, replacement, "context");
    assert.ok(errors.length > 0, `${name} mutation unexpectedly passed`);
  });
}

test("helper validator rejects invalid JavaScript syntax", () => {
  const directory = temporaryDirectory();
  const helper = path.join(directory, "release_candidate_workflow.mjs");
  fs.writeFileSync(helper, "export function broken( {\n", "utf8");
  const errors = [];
  try { validateCandidateWorkflowHelper(errors, helper); } finally { cleanup(directory); }
  assert.ok(errors.some((error) => error.includes("cannot parse candidate workflow helper")), errors.join("\n"));
});

test("read-msrv normalizes workspace minimum and fails closed when absent", () => {
  const directory = temporaryDirectory();
  const githubEnv = path.join(directory, "github-env");
  try {
    fs.writeFileSync(path.join(directory, "Cargo.toml"), '[workspace]\nmembers = []\n\n[workspace.package]\nrust-version = "1.93"\n', "utf8");
    const accepted = runCandidateHelper(["read-msrv"], { cwd: directory, env: { GITHUB_ENV: githubEnv } });
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.equal(fs.readFileSync(githubEnv, "utf8"), "RUSTUP_TOOLCHAIN=1.93.0\n");
    fs.writeFileSync(path.join(directory, "Cargo.toml"), "[workspace]\nmembers = []\n", "utf8");
    const rejected = runCandidateHelper(["read-msrv"], { cwd: directory, env: { GITHUB_ENV: githubEnv } });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /缺少 \[workspace\.package\]/u);
  } finally { cleanup(directory); }
});

test("resolve-artifact accepts exactly one complete platform pair", () => {
  const directory = temporaryDirectory();
  const output = path.join(directory, "github-output");
  try {
    const accepted = runCandidateHelper(["resolve-artifact"], {
      cwd: directory,
      env: { GITHUB_OUTPUT: output, UNIX_ARCHIVE: "candidate.tar.gz", UNIX_STAGE: "/tmp/stage" },
    });
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.equal(fs.readFileSync(output, "utf8"), "archive_name=candidate.tar.gz\nstage_path=/tmp/stage\n");
    const rejected = runCandidateHelper(["resolve-artifact"], {
      cwd: directory,
      env: {
        GITHUB_OUTPUT: output,
        UNIX_ARCHIVE: "candidate.tar.gz", UNIX_STAGE: "/tmp/unix",
        WINDOWS_ARCHIVE: "candidate.zip", WINDOWS_STAGE: "/tmp/windows",
      },
    });
    assert.notEqual(rejected.status, 0);
  } finally { cleanup(directory); }
});

function candidateFixture(extra = false) {
  const sandbox = fs.realpathSync(temporaryDirectory("harness-candidate-"));
  const root = path.join(sandbox, "project");
  const release = path.join(root, "release");
  const stage = path.join(sandbox, ".example-tool.release-candidate.test");
  fs.mkdirSync(release, { recursive: true });
  fs.mkdirSync(stage);
  const archive = "example-tool-v1.2.3-linux-x64.tar.gz";
  for (const suffix of ["", ".sha256", ".manifest.json"]) fs.writeFileSync(path.join(stage, archive + suffix), "fixture", "utf8");
  if (extra) fs.writeFileSync(path.join(stage, "unexpected.txt"), "fixture", "utf8");
  return { sandbox, root, release, stage, archive };
}

function releaseNotesArchive(contents) {
  const header = Buffer.alloc(512);
  header.write("release-notes.json", 0, "utf8");
  const size = contents.length.toString(8).padStart(11, "0");
  header.write(`${size}\0`, 124, "ascii");
  header[156] = "0".charCodeAt(0);
  const padding = Buffer.alloc((512 - (contents.length % 512)) % 512);
  return gzipSync(Buffer.concat([header, contents, padding, Buffer.alloc(1024)]));
}

test("write-manifest binds real archive bytes, context, selections, and signing evidence", (context) => {
  const probe = runCandidateHelper(["check-node-runtime"]);
  assert.equal(probe.status, 0, probe.stderr);
  const fixture = candidateFixture();
  try {
    for (const name of fs.readdirSync(fixture.stage)) fs.rmSync(path.join(fixture.stage, name));
    const releaseNotes = Buffer.from('{"schemaVersion":2,"releases":[]}\n', "utf8");
    fs.writeFileSync(path.join(fixture.root, "release-notes.json"), releaseNotes);
    const archivePath = path.join(fixture.stage, fixture.archive);
    const archive = releaseNotesArchive(releaseNotes);
    fs.writeFileSync(archivePath, archive);
    const archiveDigest = createHash("sha256").update(archive).digest("hex");
    fs.writeFileSync(`${archivePath}.sha256`, `${archiveDigest}  ${fixture.archive}\n`, "ascii");
    const snapshot = path.join(fixture.sandbox, "release-context-snapshot.json");
    const contextDigest = "b".repeat(64);
    fs.writeFileSync(snapshot, `${JSON.stringify({
      sourceCommit: "a".repeat(40), releaseContextSha256: contextDigest,
      version: "1.2.3", expectedTag: "v1.2.3-20260923",
      releaseReview: { selection: "disabled", status: "Not run", reason: "fixture", remainingRisk: "fixture-risk" },
      candidateSelections: { macosSigningSelection: "not-applicable", macosSigningSource: "not-applicable" },
    })}\n`, "utf8");
    const result = runCandidateHelper(["write-manifest"], {
      cwd: fixture.root,
      env: {
        GITHUB_WORKSPACE: fixture.root, CANDIDATE_ARCHIVE: fixture.archive,
        CANDIDATE_STAGE: fixture.stage, PRODUCT_NAME: "example-tool", VERSION: "1.2.3",
        SOURCE_COMMIT: "a".repeat(40), BUILD_RUN_ID: "fixture-1", E2E_SELECTION: "disabled",
        RUNNER_OS: "Linux", RUNNER_ARCH: "X64", SIGNING_STATUS: "signed",
        SIGNING_REASON: "configured-hook-succeeded", SIGNING_EVIDENCE: "configured-hook-verify-exit-0",
        RELEASE_NOTES_SHA256: createHash("sha256").update(releaseNotes).digest("hex"),
        RELEASE_CONTEXT_SHA256: contextDigest, RELEASE_CONTEXT_SNAPSHOT: snapshot,
      },
    });
    if (result.stderr.includes("rustc is unavailable")) {
      context.skip("rustc is unavailable on this host");
      return;
    }
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(fs.readFileSync(`${archivePath}.manifest.json`, "utf8"));
    assert.equal(manifest.sha256, archiveDigest);
    assert.equal(manifest.releaseContextSha256, contextDigest);
    assert.equal(manifest.releaseTag, "v1.2.3-20260923");
    assert.equal(manifest.reviewStatus, "Not run");
    assert.equal(manifest.signingEvidence.verification, "configured-hook-verify-exit-0");
    assert.deepEqual(fs.readdirSync(fixture.stage).sort(), [fixture.archive, `${fixture.archive}.manifest.json`, `${fixture.archive}.sha256`].sort());
  } finally { cleanup(fixture.sandbox); }
});

test("commit-candidate atomically moves an exact three-file set", () => {
  const fixture = candidateFixture();
  try {
    const result = runCandidateHelper(["commit-candidate"], {
      cwd: fixture.root,
      env: {
        GITHUB_WORKSPACE: fixture.root, CANDIDATE_ARCHIVE: fixture.archive,
        CANDIDATE_STAGE: fixture.stage, PRODUCT_NAME: "example-tool",
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(fixture.stage), false);
    assert.deepEqual(fs.readdirSync(fixture.release).sort(), [fixture.archive, `${fixture.archive}.manifest.json`, `${fixture.archive}.sha256`].sort());
  } finally { cleanup(fixture.sandbox); }
});

test("commit-candidate rejects extra staging bytes before touching release", () => {
  const fixture = candidateFixture(true);
  try {
    const result = runCandidateHelper(["commit-candidate"], {
      cwd: fixture.root,
      env: {
        GITHUB_WORKSPACE: fixture.root, CANDIDATE_ARCHIVE: fixture.archive,
        CANDIDATE_STAGE: fixture.stage, PRODUCT_NAME: "example-tool",
      },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /提交前候选暂存目录文件集发生变化/u);
    assert.deepEqual(fs.readdirSync(fixture.release), []);
    assert.equal(fs.existsSync(fixture.stage), true);
  } finally { cleanup(fixture.sandbox); }
});

test("helper CLI rejects missing, unknown, or extra arguments with usage exit", () => {
  for (const args of [[], ["unknown"], ["read-msrv", "extra"]]) {
    const result = runCandidateHelper(args);
    assert.equal(result.status, 2, `${JSON.stringify(args)}: ${result.stderr}`);
  }
});

test("direct helper validators pass current files", () => {
  const errors = [];
  validateReleaseContextHelper(errors);
  validateCandidateWorkflowHelper(errors);
  assert.deepEqual(errors, []);
});
