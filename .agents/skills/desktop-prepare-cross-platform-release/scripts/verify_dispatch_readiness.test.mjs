import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const DIRECTORY = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(DIRECTORY, "verify_dispatch_readiness.mjs");
const ASSET = readFileSync(resolve(DIRECTORY, "../assets/github-release-candidate.yml"));

function git(root, ...args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", input: "" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fixture(defaultWorkflow = ASSET) {
  const directory = mkdtempSync(join(tmpdir(), "harness-dispatch-ready-"));
  const remote = join(directory, "remote.git");
  const local = join(directory, "local");
  mkdirSync(local);
  git(directory, "init", "--bare", remote);
  git(remote, "symbolic-ref", "HEAD", "refs/heads/main");
  git(directory, "init", local);
  git(local, "config", "user.name", "Harness Test");
  git(local, "config", "user.email", "harness@example.invalid");
  git(local, "checkout", "-b", "main");
  if (defaultWorkflow !== null) {
    mkdirSync(join(local, ".github", "workflows"), { recursive: true });
    writeFileSync(join(local, ".github", "workflows", "release-candidate.yml"), defaultWorkflow);
  }
  writeFileSync(join(local, "README.md"), "default branch\n");
  git(local, "add", ".");
  git(local, "commit", "-m", "default");
  git(local, "remote", "add", "origin", remote);
  git(local, "push", "origin", "main");
  git(local, "checkout", "-b", "release");
  mkdirSync(join(local, ".github", "workflows"), { recursive: true });
  writeFileSync(join(local, ".github", "workflows", "release-candidate.yml"), ASSET);
  writeFileSync(join(local, "release.txt"), "release branch\n");
  git(local, "add", ".");
  git(local, "commit", "-m", "release");
  git(local, "push", "origin", "release");
  return { directory, remote, local };
}

function invoke(local) {
  return spawnSync(process.execPath, [SCRIPT, "--project-root", local, "--remote", "origin"], {
    encoding: "utf8", input: "",
  });
}

test("read-only preflight accepts dispatch workflow on unchanged remote default", () => {
  const item = fixture();
  try {
    const before = git(item.local, "ls-remote", "origin", "refs/heads/main");
    const head = git(item.local, "rev-parse", "HEAD");
    const result = invoke(item.local);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).defaultBranch, "main");
    assert.equal(git(item.local, "ls-remote", "origin", "refs/heads/main"), before);
    assert.equal(git(item.local, "rev-parse", "HEAD"), head);
    assert.equal(git(item.local, "status", "--porcelain=v1"), "");
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("read-only preflight rejects a release-only workflow", () => {
  const item = fixture(null);
  try {
    const result = invoke(item.local);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /远端默认分支缺少可派发的普通 workflow 文件/u);
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("read-only preflight rejects default workflow without dispatch trigger", () => {
  const item = fixture("name: Candidate\non:\n  push:\n");
  try {
    const result = invoke(item.local);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /workflow 未启用 workflow_dispatch/u);
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});

test("read-only preflight fails closed when remote default object is not local", () => {
  const item = fixture();
  const other = join(item.directory, "other");
  try {
    git(item.directory, "clone", item.remote, other);
    git(other, "config", "user.name", "Harness Test");
    git(other, "config", "user.email", "harness@example.invalid");
    writeFileSync(join(other, "README.md"), "new remote default\n");
    git(other, "add", "README.md");
    git(other, "commit", "-m", "move default");
    git(other, "push", "origin", "main");
    const result = invoke(item.local);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Git 只读查询失败: ls-tree/u);
    assert.equal(git(item.local, "status", "--porcelain=v1"), "");
  } finally {
    rmSync(item.directory, { recursive: true, force: true });
  }
});
