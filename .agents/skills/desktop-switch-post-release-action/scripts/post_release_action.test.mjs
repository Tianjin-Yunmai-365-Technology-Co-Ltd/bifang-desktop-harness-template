import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "post_release_action.mjs");
const V3 = [
  "---",
  "schema_version: 3",
  "confirmed_by: user",
  "confirmed_at: 2026-09-28",
  "decision_mode: reuse_then_infer_then_ask",
  "superpowers: disabled",
  "user_owned_tasks: disabled",
  "parallel_worktree_subagents: disabled",
  "acceptance_smoke: enabled",
  "e2e_hint: disabled",
  "---",
  "# 本地策略",
  "保留本地正文。",
  "- `post_release_action`：`local_package` 或 `push_release_branch`。",
  "发布后动作直接读取 `post_release_action`。",
  "随后必须执行 `post_release_action`。",
  "使用 `push-release --remote <name>`。",
  "",
].join("\n");

function fixture(t, contents = V3) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "post-release-action-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const initialized = spawnSync("git", ["-C", root, "init", "-q", "--initial-branch=main"], { encoding: "utf8" });
  assert.equal(initialized.status, 0, initialized.stderr);
  const docs = path.join(root, "docs");
  fs.mkdirSync(docs);
  fs.writeFileSync(path.join(root, "Cargo.toml"), "[workspace.metadata.agent-first-harness]\ntarget-platforms = [\"macos\"]\ninterfaces = [\"cli\"]\n");
  const policy = path.join(docs, "AGENT_POLICY.md");
  fs.writeFileSync(policy, contents);
  const run = (command, options = [], expectedStatus = 0) => {
    const result = spawnSync(process.execPath, [SCRIPT, command, "--project-root", root, ...options], { encoding: "utf8" });
    assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
    return JSON.parse(expectedStatus === 0 ? result.stdout : result.stderr);
  };
  return { root, docs, policy, run };
}

function setOptions(action, expected = "missing") {
  return ["--action", action, "--expected-action", expected, "--confirmed-user-choice"];
}

test("old downstream requires selection and migrates only after confirmed choice", (t) => {
  const f = fixture(t);
  assert.deepEqual(f.run("inspect"), { schema_version: 3, status: "selection_required", post_release_action: null });
  assert.match(f.run("check", [], 2).error, /尚未选择/u);
  const denied = f.run("set", ["--action", "local_package", "--expected-action", "missing"], 2);
  assert.match(denied.error, /confirmed-user-choice/u);
  assert.equal(fs.readFileSync(f.policy, "utf8"), V3);
  assert.deepEqual(f.run("set", setOptions("local_package")), {
    schema_version: 4, status: "configured", post_release_action: "local_package", changed: true, previous_action: "missing",
  });
  const written = fs.readFileSync(f.policy, "utf8");
  const expected = V3
    .replace("schema_version: 3", "schema_version: 4")
    .replace("e2e_hint: disabled\n---", "e2e_hint: disabled\npost_release_action: local_package\n---");
  assert.equal(written, expected, "迁移只允许改变 schema 并追加发布后选择，必须保留旧五项与确认元数据");
  assert.match(written, /^schema_version: 4$/mu);
  assert.match(written, /^post_release_action: local_package$/mu);
  assert.ok(written.includes("# 本地策略\n保留本地正文。\n"));
  assert.equal(f.run("check").post_release_action, "local_package");
  assert.deepEqual(fs.readdirSync(f.docs).sort(), ["AGENT_POLICY.md"]);
});

test("same choice is byte-identical no-op; future switch changes only action", (t) => {
  const f = fixture(t);
  f.run("set", setOptions("local_package"));
  const before = fs.readFileSync(f.policy);
  assert.equal(f.run("set", setOptions("local_package", "local_package")).changed, false);
  assert.ok(fs.readFileSync(f.policy).equals(before));
  const switched = f.run("set", setOptions("push_release_branch", "local_package"));
  assert.equal(switched.previous_action, "local_package");
  assert.equal(switched.post_release_action, "push_release_branch");
  assert.equal(fs.readFileSync(f.policy, "utf8"), before.toString("utf8").replace("post_release_action: local_package", "post_release_action: push_release_branch"));
  assert.match(f.run("set", setOptions("local_package", "local_package"), 2).error, /已变化/u);
});

test("invalid or incomplete schema cannot pass the completion check or be silently repaired", (t) => {
  const f = fixture(t, V3.replace("schema_version: 3", "schema_version: 4"));
  const before = fs.readFileSync(f.policy);
  assert.match(f.run("check", [], 2).error, /schema 或字段集合/u);
  assert.match(f.run("set", setOptions("local_package"), 2).error, /schema 或字段集合/u);
  assert.ok(fs.readFileSync(f.policy).equals(before));
  fs.writeFileSync(f.policy, V3.replace("schema_version: 3", "schema_version: 4").replace("e2e_hint: disabled", "e2e_hint: disabled\npost_release_action: remote_push"));
  assert.match(f.run("check", [], 2).error, /post_release_action/u);
});

test("unconfirmed legacy metadata and preferences do not become configured", (t) => {
  const f = fixture(t, V3.replace("confirmed_at: 2026-09-28", "confirmed_at: not-a-date"));
  assert.match(f.run("set", setOptions("local_package"), 2).error, /confirmed_at/u);
  fs.writeFileSync(f.policy, V3.replace("acceptance_smoke: enabled", "acceptance_smoke: pending"));
  assert.match(f.run("set", setOptions("local_package"), 2).error, /acceptance_smoke/u);
  assert.match(f.run("check", [], 2).error, /acceptance_smoke/u);
});

test("duplicate field, stale expected choice and invalid value fail without writes", (t) => {
  const f = fixture(t, V3.replace("e2e_hint: disabled", "e2e_hint: disabled\ne2e_hint: disabled"));
  assert.match(f.run("set", setOptions("local_package"), 2).error, /重复/u);
  fs.writeFileSync(f.policy, V3);
  const before = fs.readFileSync(f.policy);
  assert.match(f.run("set", setOptions("unknown"), 2).error, /--action/u);
  assert.match(f.run("set", setOptions("push_release_branch", "local_package"), 2).error, /已变化/u);
  assert.ok(fs.readFileSync(f.policy).equals(before));
});

test("existing writer lock fails closed without changing the protected policy", (t) => {
  const f = fixture(t);
  const lock = path.join(f.docs, ".AGENT_POLICY.post-release.lock");
  fs.writeFileSync(lock, "another writer");
  assert.match(f.run("set", setOptions("local_package"), 2).error, /正在被修改/u);
  assert.equal(fs.readFileSync(f.policy, "utf8"), V3);
  fs.rmSync(lock);
  assert.equal(f.run("set", setOptions("local_package")).post_release_action, "local_package");
});

test("CRLF policy remains CRLF and policy symlink is rejected", (t) => {
  const f = fixture(t, V3.replaceAll("\n", "\r\n"));
  f.run("set", setOptions("push_release_branch"));
  const written = fs.readFileSync(f.policy, "utf8");
  assert.equal(written.replaceAll("\r\n", "").includes("\n"), false);
  const real = path.join(f.docs, "actual.md");
  fs.renameSync(f.policy, real);
  try { fs.symlinkSync(real, f.policy); } catch (error) {
    if (process.platform === "win32" && error.code === "EPERM") { t.skip("symlink permission unavailable"); return; }
    throw error;
  }
  assert.match(f.run("check", [], 2).error, /普通非符号链接/u);
  assert.match(f.run("set", setOptions("local_package", "push_release_branch"), 2).error, /普通非符号链接/u);
  assert.ok(fs.readFileSync(real, "utf8").includes("post_release_action: push_release_branch"));
});

test("Harness source marker blocks setting a downstream choice", (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, "Version.md"), "template");
  const derived = path.join(f.root, ".agents", "skills", "desktop-instantiate-project");
  fs.mkdirSync(derived, { recursive: true });
  fs.writeFileSync(path.join(derived, "SKILL.md"), "template");
  assert.match(f.run("set", setOptions("local_package"), 2).error, /Harness 模板源/u);
  assert.equal(fs.readFileSync(f.policy, "utf8"), V3);
});

test("legacy policy body must be reconciled before a choice can be persisted", (t) => {
  const stale = V3.replace("发布后动作直接读取 `post_release_action`。", "推送与打包分别由发布后的用户请求决定。");
  const f = fixture(t, stale);
  assert.equal(f.run("inspect").status, "selection_required");
  assert.match(f.run("set", setOptions("local_package"), 2).error, /正文尚未合并/u);
  assert.equal(fs.readFileSync(f.policy, "utf8"), stale);
  fs.writeFileSync(f.policy, V3);
  assert.equal(f.run("set", setOptions("local_package")).status, "configured");
  fs.writeFileSync(f.policy, fs.readFileSync(f.policy, "utf8").replace("发布后动作直接读取 `post_release_action`。", "发布后是否推送、是否打包只由用户各自的明确请求决定。"));
  assert.match(f.run("check", [], 2).error, /正文尚未合并/u);
});

test("local package choice requires an existing CLI or supported GUI package route", (t) => {
  const f = fixture(t);
  const cargo = path.join(f.root, "Cargo.toml");
  fs.writeFileSync(cargo, "[workspace.metadata.agent-first-harness]\ntarget-platforms = [\"macos\"]\ninterfaces = [\"tui\", \"mcp\"]\n");
  assert.match(f.run("set", setOptions("local_package"), 2).error, /没有现有本地打包 Skill/u);
  assert.equal(f.run("set", setOptions("push_release_branch")).status, "configured");
  assert.match(f.run("set", setOptions("local_package", "push_release_branch"), 2).error, /没有现有本地打包 Skill/u);
  fs.writeFileSync(cargo, "[workspace.metadata.agent-first-harness]\ntarget-platforms = [\"macos\"]\ninterfaces = [\"gui\"]\n");
  assert.equal(f.run("set", setOptions("local_package", "push_release_branch")).status, "configured");
});
