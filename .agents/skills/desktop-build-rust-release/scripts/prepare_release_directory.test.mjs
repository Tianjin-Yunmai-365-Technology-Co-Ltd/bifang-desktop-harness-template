import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "prepare-release-directory.sh");
const POWERSHELL_SCRIPT = path.join(path.dirname(SCRIPT), "prepare-release-directory.ps1");
const SKILLS_ROOT = path.resolve(path.dirname(SCRIPT), "..", "..");
const TAURI_HELPER = path.join(SKILLS_ROOT, "desktop-build-tauri-release", "scripts", "prepare-release-directory.sh");
const TAURI_POWERSHELL_HELPER = path.join(SKILLS_ROOT, "desktop-build-tauri-release", "scripts", "prepare-release-directory.ps1");
const RUST_SKILL = path.join(SKILLS_ROOT, "desktop-build-rust-release", "SKILL.md");
const TAURI_SKILL = path.join(SKILLS_ROOT, "desktop-build-tauri-release", "SKILL.md");
const CROSS_PLATFORM_SKILL = path.join(SKILLS_ROOT, "desktop-prepare-cross-platform-release", "SKILL.md");

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: "utf8", ...options });
}

function withTemporaryParent(callback) {
  const parent = mkdtempSync(path.join(tmpdir(), "afh-release-dir-"));
  try { callback(parent); } finally { rmSync(parent, { recursive: true, force: true }); }
}

function gitRoot(parent) {
  const root = path.join(parent, "project");
  mkdirSync(root);
  assert.equal(run("git", ["init", "--initial-branch=main", root]).status, 0);
  assert.equal(run("git", ["-C", root, "config", "--local", "user.name", "Release Test"]).status, 0);
  assert.equal(run("git", ["-C", root, "config", "--local", "user.email", "release-test@example.com"]).status, 0);
  writeFileSync(path.join(root, ".gitignore"), "/release/\n/.release-clean.*\n");
  writeFileSync(path.join(root, "tracked.txt"), "baseline\n");
  assert.equal(run("git", ["-C", root, "add", ".gitignore", "tracked.txt"]).status, 0);
  assert.equal(run("git", ["-C", root, "commit", "--quiet", "-m", "chore: baseline"]).status, 0);
  return root;
}

function runHelper(root) {
  return run("bash", [SCRIPT, root]);
}

function runPowerShell(root) {
  return run("pwsh", ["-NoProfile", "-File", POWERSHELL_SCRIPT, "-ProjectRoot", root]);
}

function hasCommand(command) {
  return run(command, ["--version"]).status === 0;
}

function directoryLink(link, target) {
  if (hasCommand("cmd") && run("cmd", ["/c", "mklink", "/J", link, target]).status === 0) return;
  symlinkSync(target, link, "dir");
}

test("cleans every entry without deleting release directory", () => withTemporaryParent((parent) => {
  const root = gitRoot(parent);
  const release = path.join(root, "release");
  mkdirSync(path.join(release, "nested"), { recursive: true });
  writeFileSync(path.join(release, "old.txt"), "old");
  writeFileSync(path.join(release, ".hidden"), "old");
  writeFileSync(path.join(release, "nested", "old.txt"), "old");
  const external = path.join(parent, "external.txt");
  writeFileSync(external, "keep");
  symlinkSync(external, path.join(release, "external-link"));
  const result = runHelper(root);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readdirSync(release), []);
  assert.equal(readFileSync(external, "utf8"), "keep");
  assert.match(result.stdout, /release\.cleaned=true/);
  const head = run("git", ["-C", root, "rev-parse", "HEAD"]).stdout.trim();
  assert.match(result.stdout, new RegExp(`release\\.source_commit=${head}`));
}));

test("rejects dirty or untracked worktree before cleaning release", () => {
  for (const [relative, content] of [["tracked.txt", "changed\n"], ["untracked.txt", "new\n"]]) {
    withTemporaryParent((parent) => {
      const root = gitRoot(parent);
      const release = path.join(root, "release");
      mkdirSync(release);
      const marker = path.join(release, "old.txt");
      writeFileSync(marker, "keep until gate passes");
      writeFileSync(path.join(root, relative), content);
      const result = runHelper(root);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /工作树不干净/);
      assert.equal(readFileSync(marker, "utf8"), "keep until gate passes");
    });
  }
});

test("rejects release symlink without touching target", () => withTemporaryParent((parent) => {
  const root = gitRoot(parent);
  const external = path.join(parent, "external");
  mkdirSync(external);
  const marker = path.join(external, "keep.txt");
  writeFileSync(marker, "keep");
  symlinkSync(external, path.join(root, "release"), "dir");
  const result = runHelper(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /符号链接/);
  assert.equal(readFileSync(marker, "utf8"), "keep");
}));

test("rejects directory that is not Git top level", () => withTemporaryParent((parent) => {
  const root = gitRoot(parent);
  const nested = path.join(root, "nested");
  mkdirSync(nested);
  const result = runHelper(nested);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /独立 Git 顶层目录/);
  assert.equal(existsSync(path.join(nested, "release")), false);
}));

test("Windows helper keeps reparse and force-cleanup gates", () => {
  const content = readFileSync(POWERSHELL_SCRIPT, "utf8");
  for (const fragment of [
    "独立 Git 顶层目录",
    "[IO.FileAttributes]::ReparsePoint",
    "[IO.Directory]::Move",
    "[IO.Directory]::Delete($item.FullName, $false)",
    "[IO.File]::Delete($item.FullName)",
    "原子刷新期间 release 发生变化",
    "Remove-TreeWithoutFollowingReparsePoint",
    "release.cleaned=true",
    "HEAD^{commit}",
    "status --porcelain=v1 --untracked-files=all",
    "release.source_commit=$sourceCommit",
  ]) assert.ok(content.includes(fragment), fragment);
});

test("all build routes require clean HEAD and manifest sourceCommit", () => {
  assert.deepEqual(readFileSync(TAURI_HELPER), readFileSync(SCRIPT));
  assert.deepEqual(readFileSync(TAURI_POWERSHELL_HELPER), readFileSync(POWERSHELL_SCRIPT));
  for (const skill of [RUST_SKILL, TAURI_SKILL, CROSS_PLATFORM_SKILL]) {
    const content = readFileSync(skill, "utf8");
    for (const fragment of ["git status --porcelain=v1 --untracked-files=all", "普通构建", "自动", "sourceCommit", "HEAD"]) {
      assert.ok(content.includes(fragment), `${skill}: ${fragment}`);
    }
  }
});

test("Tauri Windows release route uses PowerShell helper", () => {
  const content = readFileSync(TAURI_SKILL, "utf8");
  assert.ok(content.includes("scripts/prepare-release-directory.ps1 -ProjectRoot <project-root>"));
  assert.ok(content.includes("Windows 原生路线不得调用 `.sh` helper"));
  assert.deepEqual(readFileSync(TAURI_POWERSHELL_HELPER), readFileSync(POWERSHELL_SCRIPT));
});

test("Windows helper cleans without following child reparse point", { skip: !hasCommand("pwsh") }, () => withTemporaryParent((parent) => {
  const root = gitRoot(parent);
  const release = path.join(root, "release");
  mkdirSync(release);
  writeFileSync(path.join(release, "old.txt"), "old");
  const external = path.join(parent, "external");
  mkdirSync(external);
  const marker = path.join(external, "keep.txt");
  writeFileSync(marker, "keep");
  directoryLink(path.join(release, "external-link"), external);
  const result = runPowerShell(root);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readdirSync(release), []);
  assert.equal(readFileSync(marker, "utf8"), "keep");
}));

test("Windows helper rejects root reparse point", { skip: !hasCommand("pwsh") }, () => withTemporaryParent((parent) => {
  const root = gitRoot(parent);
  const external = path.join(parent, "external");
  mkdirSync(external);
  const marker = path.join(external, "keep.txt");
  writeFileSync(marker, "keep");
  directoryLink(path.join(root, "release"), external);
  const result = runPowerShell(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /重解析点/);
  assert.equal(readFileSync(marker, "utf8"), "keep");
}));

test("Windows helper rejects non-Git top level", { skip: !hasCommand("pwsh") }, () => withTemporaryParent((parent) => {
  const root = gitRoot(parent);
  const nested = path.join(root, "nested");
  mkdirSync(nested);
  const result = runPowerShell(nested);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /独立 Git 顶层目录/);
  assert.equal(existsSync(path.join(nested, "release")), false);
}));
