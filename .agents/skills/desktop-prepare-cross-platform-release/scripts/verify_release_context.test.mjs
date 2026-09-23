/** 验证跨平台发布上下文快照 helper 的真实 Git 边界。 */

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(SCRIPT_DIRECTORY, "verify_release_context.mjs");
const RELEASE_CONTEXT_SOURCE = resolve(
  SCRIPT_DIRECTORY,
  "../../desktop-prepare-release/scripts/release_context.mjs",
);

/** 在测试环境中运行命令并返回文本结果。 */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: options.env ?? process.env,
    cwd: options.cwd,
    input: "",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (options.check !== false && result.status !== 0) {
    assert.fail(`${command} ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result;
}

/** 建立带 trunk 远端、发布上下文和版本 tag 的隔离仓库。 */
function fixture() {
  const temporary = mkdtempSync(join(tmpdir(), "verify-release-context-"));
  const root = join(temporary, "project");
  const remote = join(temporary, "remote.git");
  mkdirSync(root);
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: join(temporary, "global.gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "Never",
  };
  const git = (...args) => run("git", ["-C", root, ...args], { env });
  run("git", ["init", "--quiet", "--bare", remote], { env });
  git("init", "--quiet", "--initial-branch=trunk");
  git("config", "--local", "user.name", "Matrix Test");
  git("config", "--local", "user.email", "matrix@example.com");
  const helper = join(root, ".agents/skills/desktop-prepare-release/scripts/release_context.mjs");
  mkdirSync(dirname(helper), { recursive: true });
  copyFileSync(RELEASE_CONTEXT_SOURCE, helper);
  writeFileSync(join(root, "source.txt"), "candidate\n", "utf8");
  git("add", ".agents", "source.txt");
  git("commit", "--quiet", "-m", "feat: candidate source");
  const sourceHead = git("rev-parse", "HEAD").stdout.trim();
  run("git", ["-C", remote, "symbolic-ref", "HEAD", "refs/heads/trunk"], { env });
  git("remote", "add", "origin", remote);
  git("push", "--quiet", "-u", "origin", "trunk");
  const context = run(process.execPath, [
    helper,
    "write",
    "--project-root", root,
    "--source-head", sourceHead,
    "--version", "1.2.3",
    "--release-date", "2026-09-09",
    "--remote", "origin",
    "--review-selection", "disabled",
    "--scope-base", sourceHead,
    "--scope-diff-sha256", "0".repeat(64),
    "--review-reason", "Optional semantic review was not requested.",
    "--review-remaining-risk", "Semantic issues outside required checks may remain.",
    "--macos-signing-selection", "not-applicable",
    "--macos-signing-source", "not-applicable",
  ], { env, cwd: root });
  assert.equal(context.status, 0, context.stderr);
  git("add", ".harness/release-context.json");
  git("commit", "--quiet", "-m", "chore(release): record context");
  const head = git("rev-parse", "HEAD").stdout.trim();
  git("push", "--quiet", "origin", "trunk");
  git("tag", "v1.2.3-20260909");
  git("push", "--quiet", "origin", "refs/tags/v1.2.3-20260909");
  const contextPath = join(root, ".harness/release-context.json");
  const digest = createHash("sha256").update(readFileSync(contextPath)).digest("hex");
  const snapshot = join(temporary, "snapshot.json");
  const invoke = (mode) => run(process.execPath, [
    SCRIPT,
    mode,
    "--project-root", root,
    "--source-commit", head,
    "--expected-context-sha256", digest,
    "--repository-default-branch", "trunk",
    "--snapshot", snapshot,
  ], { env, cwd: root, check: false });
  return { temporary, root, git, head, contextPath, snapshot, invoke, digest };
}

test("capture_and_verify_accept_non_main_default_branch", () => {
  const item = fixture();
  try {
    const captured = item.invoke("capture");
    assert.equal(captured.status, 0, captured.stderr);
    const snapshot = JSON.parse(readFileSync(item.snapshot, "utf8"));
    assert.equal(snapshot.gitPublication, "remote");
    assert.equal(snapshot.remote, "origin");
    assert.equal(snapshot.defaultBranch, "trunk");
    assert.equal(snapshot.expectedTag, "v1.2.3-20260909");
    assert.equal(item.invoke("verify").status, 0);
  } finally {
    rmSync(item.temporary, { recursive: true, force: true });
  }
});

test("missing_fetched_tag_is_rejected", () => {
  const item = fixture();
  try {
    item.git("tag", "-d", "v1.2.3-20260909");
    const result = item.invoke("capture");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /missing or invalid fetched ref/);
  } finally {
    rmSync(item.temporary, { recursive: true, force: true });
  }
});

test("snapshot_change_is_rejected_at_second_gate", () => {
  const item = fixture();
  try {
    assert.equal(item.invoke("capture").status, 0);
    const snapshot = JSON.parse(readFileSync(item.snapshot, "utf8"));
    snapshot.version = "9.9.9";
    writeFileSync(item.snapshot, JSON.stringify(snapshot), "utf8");
    const result = item.invoke("verify");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /changed between build checks/);
  } finally {
    rmSync(item.temporary, { recursive: true, force: true });
  }
});

test("local_only_context_is_rejected_by_provider_flow", () => {
  const item = fixture();
  try {
    const context = JSON.parse(readFileSync(item.contextPath, "utf8"));
    context.gitPublication = "local";
    context.remote = null;
    writeFileSync(item.contextPath, `${JSON.stringify(context, null, 2)}\n`, "utf8");
    item.git("add", ".harness/release-context.json");
    item.git("commit", "--quiet", "-m", "test: use local-only release context");
    const head = item.git("rev-parse", "HEAD").stdout.trim();
    const digest = createHash("sha256").update(readFileSync(item.contextPath)).digest("hex");
    const result = run(process.execPath, [
      SCRIPT, "capture", "--project-root", item.root, "--source-commit", head,
      "--expected-context-sha256", digest, "--repository-default-branch", "trunk",
      "--snapshot", item.snapshot,
    ], { cwd: item.root, check: false });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /cross-platform provider release requires remote gitPublication/);
  } finally {
    rmSync(item.temporary, { recursive: true, force: true });
  }
});
