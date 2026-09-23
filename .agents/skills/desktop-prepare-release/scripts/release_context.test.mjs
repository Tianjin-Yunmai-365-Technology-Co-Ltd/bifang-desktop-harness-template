/** 发布上下文 helper 的真实 Git 回归。 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(SCRIPT_DIRECTORY, "release_context.mjs");

/** 执行子进程并保留退出码、stdout 与 stderr。 */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: "utf8",
    input: "",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (options.check !== false && result.status !== 0) {
    assert.fail(`${command} ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result;
}

/** 建立有主远端和待发布功能分支的隔离仓库。 */
function fixture() {
  const temporary = mkdtempSync(join(tmpdir(), "release-context-"));
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
  const invoke = (...args) => run(process.execPath, [SCRIPT, ...args], {
    env,
    cwd: root,
    check: false,
  });
  run("git", ["init", "--quiet", "--bare", remote], { env });
  git("init", "--quiet", "--initial-branch=main");
  git("config", "--local", "user.name", "Release Context Test");
  git("config", "--local", "user.email", "release-context@example.com");
  writeFileSync(join(root, "README.md"), "baseline\n", "utf8");
  git("add", "README.md");
  git("commit", "--quiet", "-m", "chore: baseline");
  const baseline = git("rev-parse", "HEAD").stdout.trim();
  run("git", ["-C", remote, "symbolic-ref", "HEAD", "refs/heads/main"], { env });
  git("remote", "add", "origin", remote);
  git("push", "--quiet", "-u", "origin", "main");
  git("switch", "--quiet", "-c", "feature-release-context-20260909");
  writeFileSync(join(root, "source.txt"), "ready\n", "utf8");
  git("add", "source.txt");
  git("commit", "--quiet", "-m", "feat: prepare source");
  const sourceHead = git("rev-parse", "HEAD").stdout.trim();
  const writeContext = (extra = [], publication = ["--remote", "origin"]) => invoke(
    "write",
    "--project-root", root,
    "--source-head", sourceHead,
    "--version", "1.2.3",
    "--release-date", "2026-09-09",
    ...publication,
    "--review-selection", "disabled",
    "--scope-base", baseline,
    "--scope-diff-sha256", "0".repeat(64),
    "--review-reason", "Optional semantic review was not requested.",
    "--review-remaining-risk", "Semantic issues outside required checks may remain.",
    "--macos-signing-selection", "not-applicable",
    "--macos-signing-source", "not-applicable",
    ...extra,
  );
  const commitAndTag = ({ publication = ["--remote", "origin"], push = true } = {}) => {
    const written = writeContext([], publication);
    assert.equal(written.status, 0, written.stderr);
    const digest = JSON.parse(written.stdout).releaseContextSha256;
    git("add", ".harness/release-context.json");
    git("commit", "--quiet", "-m", "chore(release): record release context");
    git("switch", "--quiet", "main");
    git("merge", "--quiet", "--no-edit", "feature-release-context-20260909");
    const head = git("rev-parse", "HEAD").stdout.trim();
    if (push) git("push", "--quiet", "origin", "main");
    git("tag", "v1.2.3-20260909");
    if (push) git("push", "--quiet", "origin", "refs/tags/v1.2.3-20260909");
    return { head, digest };
  };
  return {
    temporary, root, remote, git, invoke, writeContext, commitAndTag, baseline, sourceHead,
  };
}

/** 确保每个 Git fixture 都在测试完成后精确清理。 */
function withFixture(name, callback) {
  test(name, () => {
    const item = fixture();
    try {
      callback(item);
    } finally {
      rmSync(item.temporary, { recursive: true, force: true });
    }
  });
}

withFixture("write_derives_tag_and_canonical_context", (item) => {
  const result = item.writeContext();
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.expectedTag, "v1.2.3-20260909");
  const checked = item.invoke(
    "check", "--project-root", item.root,
    "--expected-version", "1.2.3",
    "--expected-sha256", payload.releaseContextSha256,
  );
  assert.equal(checked.status, 0, checked.stderr);
  const context = JSON.parse(readFileSync(join(item.root, ".harness/release-context.json"), "utf8"));
  assert.equal(context.schemaVersion, 2);
  assert.equal(context.gitPublication, "remote");
  assert.equal(context.remote, "origin");
  assert.equal(context.sourceHead, item.sourceHead);
  assert.equal(context.defaultBranch, "main");
});

withFixture("verify_accepts_clean_crlf_checkout_of_canonical_context", (item) => {
  item.git("config", "--local", "core.autocrlf", "true");
  const { head, digest } = item.commitAndTag();
  const path = join(item.root, ".harness/release-context.json");
  const canonical = readFileSync(path).toString("utf8").replaceAll("\r\n", "\n");
  writeFileSync(path, canonical.replaceAll("\n", "\r\n"), "utf8");
  item.git("add", ".harness/release-context.json");
  assert.equal(item.git("status", "--porcelain").stdout, "");
  const verified = item.invoke(
    "verify", "--project-root", item.root,
    "--expected-version", "1.2.3",
    "--expected-sha256", digest,
    "--expected-head", head,
  );
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).sourceCommit, head);
});

withFixture("schema_v1_release_context_is_rejected", (item) => {
  assert.equal(item.writeContext().status, 0);
  const path = join(item.root, ".harness/release-context.json");
  const context = JSON.parse(readFileSync(path, "utf8"));
  context.schemaVersion = 1;
  writeFileSync(path, `${JSON.stringify(context)}\n`, "utf8");
  const rejected = item.invoke("check", "--project-root", item.root);
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /fields or schemaVersion/);
});

withFixture("local_write_uses_explicit_branch_without_accessing_remote", (item) => {
  renameSync(item.remote, `${item.remote}.offline`);
  const result = item.writeContext([], ["--local-only", "--default-branch", "main"]);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.gitPublication, "local");
  assert.equal(payload.remote, null);
  const context = JSON.parse(readFileSync(join(item.root, ".harness/release-context.json"), "utf8"));
  assert.equal(context.defaultBranch, "main");
});

withFixture("write_rejects_source_head_that_is_not_current_head", (item) => {
  writeFileSync(join(item.root, "drift.txt"), "later change\n", "utf8");
  item.git("add", "drift.txt");
  item.git("commit", "--quiet", "-m", "chore: drift after source review");
  const result = item.writeContext();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /sourceHead must equal the current HEAD before metadata commit/);
});

withFixture("verify_requires_clean_pushed_main_and_remote_tag", (item) => {
  const { head, digest } = item.commitAndTag();
  const result = item.invoke(
    "verify", "--project-root", item.root,
    "--expected-head", head, "--expected-sha256", digest,
  );
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.sourceCommit, head);
  assert.equal(payload.expectedTag, "v1.2.3-20260909");
  assert.equal(payload.gitPublication, "remote");
});

withFixture("local_verify_requires_only_local_branch_head_context_and_tag", (item) => {
  const { head, digest } = item.commitAndTag({
    publication: ["--local-only", "--default-branch", "main"],
    push: false,
  });
  renameSync(item.remote, `${item.remote}.offline`);
  const result = item.invoke(
    "verify", "--project-root", item.root,
    "--expected-head", head, "--expected-sha256", digest,
  );
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, "released");
  assert.equal(payload.gitPublication, "local");
  assert.equal(payload.remote, null);
});

withFixture("local_verify_rejects_missing_local_tag", (item) => {
  assert.equal(item.writeContext([], ["--local-only", "--default-branch", "main"]).status, 0);
  item.git("add", ".harness/release-context.json");
  item.git("commit", "--quiet", "-m", "chore(release): record release context");
  item.git("switch", "--quiet", "main");
  item.git("merge", "--quiet", "--no-edit", "feature-release-context-20260909");
  renameSync(item.remote, `${item.remote}.offline`);
  const result = item.invoke("verify", "--project-root", item.root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /local ref is missing or invalid/);
});

withFixture("verify_rejects_missing_remote_tag", (item) => {
  assert.equal(item.writeContext().status, 0);
  item.git("add", ".harness/release-context.json");
  item.git("commit", "--quiet", "-m", "chore(release): record release context");
  item.git("switch", "--quiet", "main");
  item.git("merge", "--quiet", "--no-edit", "feature-release-context-20260909");
  item.git("push", "--quiet", "origin", "main");
  item.git("tag", "v1.2.3-20260909");
  const result = item.invoke("verify", "--project-root", item.root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /remote ref is missing/);
});

withFixture("verify_rejects_dirty_or_untracked_context_bytes", (item) => {
  item.commitAndTag();
  writeFileSync(join(item.root, ".harness/release-context.json"), "{}\n", "utf8");
  const result = item.invoke("verify", "--project-root", item.root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /fields or schemaVersion/);
});

withFixture("write_rejects_inconsistent_disabled_selection", (item) => {
  const result = item.writeContext([
    "--macos-signing-selection", "disabled",
    "--macos-signing-source", "not-requested",
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /macosSigningReason/);
});

withFixture("write_requires_strict_publication_argument_combinations", (item) => {
  const missingBranch = item.writeContext([], ["--local-only"]);
  assert.equal(missingBranch.status, 1);
  assert.match(missingBranch.stderr, /--default-branch is required/);
  const remoteWithBranch = item.writeContext([], ["--remote", "origin", "--default-branch", "main"]);
  assert.equal(remoteWithBranch.status, 1);
  assert.match(remoteWithBranch.stderr, /--default-branch is only valid/);
  const both = item.writeContext([], ["--remote", "origin", "--local-only"]);
  assert.equal(both.status, 2);
  assert.match(both.stderr, /not allowed with argument/);
});

withFixture("local_default_branch_rejects_ambiguous_ref_syntax", (item) => {
  for (const branch of ["main^{}", "HEAD", "@"]) {
    const rejected = item.writeContext([], ["--local-only", "--default-branch", branch]);
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /must name one safe Git branch/);
  }
  assert.equal(item.writeContext([], ["--local-only", "--default-branch", "main"]).status, 0);
  const path = join(item.root, ".harness/release-context.json");
  const context = JSON.parse(readFileSync(path, "utf8"));
  for (const branch of ["main^{}", "HEAD", "@"]) {
    context.defaultBranch = branch;
    writeFileSync(path, `${JSON.stringify(context, null, 2)}\n`, "utf8");
    const rejected = item.invoke("check", "--project-root", item.root);
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /defaultBranch is invalid/);
  }
});

withFixture("check_rejects_publication_mode_and_remote_mismatch", (item) => {
  assert.equal(item.writeContext().status, 0);
  const path = join(item.root, ".harness/release-context.json");
  const context = JSON.parse(readFileSync(path, "utf8"));
  context.remote = null;
  writeFileSync(path, `${JSON.stringify(context, null, 2)}\n`, "utf8");
  const invalidRemote = item.invoke("check", "--project-root", item.root);
  assert.equal(invalidRemote.status, 1);
  assert.match(invalidRemote.stderr, /remote gitPublication requires a valid remote/);
  context.gitPublication = "local";
  context.remote = "origin";
  writeFileSync(path, `${JSON.stringify(context, null, 2)}\n`, "utf8");
  const invalidLocal = item.invoke("check", "--project-root", item.root);
  assert.equal(invalidLocal.status, 1);
  assert.match(invalidLocal.stderr, /local gitPublication requires remote to be null/);
});

withFixture("check_rejects_invalid_utf8", (item) => {
  assert.equal(item.writeContext().status, 0);
  writeFileSync(join(item.root, ".harness/release-context.json"), Buffer.from([0xff, 0xfe]));
  const result = item.invoke("check", "--project-root", item.root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /valid UTF-8 JSON/);
});
