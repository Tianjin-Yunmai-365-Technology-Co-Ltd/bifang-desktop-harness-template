import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ROOT, readText } from "./core.mjs";
import {
  allocateProjectTaskSequences,
  isValidSessionProgressTitle,
  validateAgentPolicy,
  USER_HARD_RULE_REQUIRED_FRAGMENTS,
} from "./governance_policy.mjs";

function withPolicy(text, callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "harness-policy-"));
  const filePath = path.join(directory, "AGENT_POLICY.md");
  fs.writeFileSync(filePath, text);
  try {
    callback(filePath);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("current source policy satisfies full persistence contract", () => {
  const errors = [];
  validateAgentPolicy(errors, path.join(ROOT, "docs", "AGENT_POLICY.md"), { requireSourceDefaults: true });
  assert.deepEqual(errors, []);
});

test("policy validator uses runtime frontmatter syntax for LF and CRLF", () => {
  const source = readText(path.join(ROOT, "docs", "AGENT_POLICY.md"));
  withPolicy(source.replaceAll("\n", "\r\n"), (filePath) => {
    const errors = [];
    validateAgentPolicy(errors, filePath, { requireSourceDefaults: true });
    assert.deepEqual(errors, []);
  });
  for (const invalid of [
    source.replace("schema_version: 5", "schema_version : 5"),
    source.replace("schema_version: 5\n", "schema_version: 5\r\n"),
  ]) {
    withPolicy(invalid, (filePath) => {
      const errors = [];
      validateAgentPolicy(errors, filePath);
      assert.ok(errors.some((error) => error.includes("invalid Agent policy frontmatter")));
    });
  }
});

test("progress title accepts only exact legal shape", () => {
  assert.equal(isValidSessionProgressTitle("Task 8 | 运行中 | 左侧 Task 默认关闭并支持开关"), true);
  assert.equal(isValidSessionProgressTitle("Task 0 | 运行中 | 结果"), false);
  assert.equal(isValidSessionProgressTitle("Task 2 | blocked | 结果"), false);
  assert.equal(isValidSessionProgressTitle("Task 2 | 已完成 | 结果 | 多段"), false);
  assert.equal(isValidSessionProgressTitle("Task 2 | 已完成 |  结果"), false);
});

test("project sequence ignores foreign and malformed records without filling gaps", () => {
  const records = [
    { kind: "codex", hostId: "local", projectId: "p1", title: "Task 2 | 已完成 | A" },
    { kind: "codex", hostId: "local", projectId: "p1", title: "Task 9 | 运行中 | B" },
    { kind: "codex", hostId: "remote", projectId: "p1", title: "Task 30 | 已完成 | C" },
    { kind: "chatgpt", hostId: "local", projectId: "p1", title: "Task 40 | 已完成 | D" },
    { kind: "codex", hostId: "local", projectId: "p1", title: "legacy-50" },
  ];
  assert.deepEqual(allocateProjectTaskSequences(records, { hostId: "local", projectId: "p1", count: 3 }), [10, 11, 12]);
  assert.deepEqual(allocateProjectTaskSequences([], { hostId: "local", projectId: "p1" }), [1]);
});

test("project sequence rejects invalid allocation inputs", () => {
  assert.throws(() => allocateProjectTaskSequences([], { hostId: "", projectId: "p1" }), /hostId/u);
  assert.throws(() => allocateProjectTaskSequences([], { hostId: "local", projectId: " p1" }), /projectId/u);
  assert.throws(() => allocateProjectTaskSequences([], { hostId: "local", projectId: "p1", count: 0 }), /count/u);
});

test("policy rejects missing field, invalid preference, and duplicate field", () => {
  const source = readText(path.join(ROOT, "docs", "AGENT_POLICY.md"));
  const mutations = [
    source.replace(/^e2e_hint:.*\n/mu, ""),
    source.replace(/^e2e_hint:.*$/mu, "e2e_hint: sometimes"),
    source.replace(/^e2e_hint:.*$/mu, (line) => `${line}\n${line}`),
    source.replace(/^post_release_action:.*\n/mu, ""),
    source.replace(/^post_release_action:.*$/mu, "post_release_action: upload_everywhere"),
    source.replace(/^post_release_action:.*$/mu, (line) => `${line}\n${line}`),
    source.replace(/^task_worktrees:.*\n/mu, ""),
    source.replace(/^task_worktrees:.*$/mu, "task_worktrees: automatic"),
    source.replace(/^task_worktrees:.*$/mu, (line) => `${line}\n${line}`),
  ];
  for (const mutation of mutations) {
    withPolicy(mutation, (filePath) => {
      const errors = [];
      validateAgentPolicy(errors, filePath);
      assert.ok(errors.length > 0);
    });
  }
});

test("initialized downstream rejects pending and unresolved confirmation metadata", () => {
  const source = readText(path.join(ROOT, "docs", "AGENT_POLICY.md"));
  const pending = source
    .replace(/^e2e_hint:.*$/mu, "e2e_hint: pending")
    .replace(/^post_release_action:.*$/mu, "post_release_action: pending");
  withPolicy(pending, (filePath) => {
    const errors = [];
    validateAgentPolicy(errors, filePath, { allowPending: false });
    assert.ok(errors.some((error) => error.includes("resolve e2e_hint")));
    assert.ok(errors.some((error) => error.includes("resolve post_release_action")));
  });
  const unresolved = source
    .replace(/^confirmed_by:.*$/mu, "confirmed_by: pending")
    .replace(/^confirmed_at:.*$/mu, "confirmed_at: not-a-date");
  withPolicy(unresolved, (filePath) => {
    const errors = [];
    validateAgentPolicy(errors, filePath, { allowPending: false });
    assert.ok(errors.some((error) => error.includes("confirmed_by")));
    assert.ok(errors.some((error) => error.includes("confirmed_at")));
  });
});

test("initialized downstream accepts either confirmed post-release action", () => {
  const source = readText(path.join(ROOT, "docs", "AGENT_POLICY.md"));
  for (const action of ["local_package", "push_release_branch"]) {
    const resolved = source
      .replace(/^confirmed_by:.*$/mu, "confirmed_by: user form confirmation")
      .replace(/^confirmed_at:.*$/mu, "confirmed_at: 2026-09-28")
      .replace(/^post_release_action:.*$/mu, `post_release_action: ${action}`)
      .replace(/^(superpowers|user_owned_tasks|parallel_worktree_subagents|acceptance_smoke|e2e_hint): pending$/gmu, "$1: disabled");
    withPolicy(resolved, (filePath) => {
      const errors = [];
      validateAgentPolicy(errors, filePath, { allowPending: false, interfaces: ["cli"], targetPlatforms: ["macos"] });
      assert.deepEqual(errors, [], action);
    });
  }
});

test("TUI/MCP-only downstream rejects local packaging but accepts remote release", () => {
  const source = readText(path.join(ROOT, "docs", "AGENT_POLICY.md"));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "harness-policy-interfaces-"));
  const docs = path.join(directory, "docs");
  fs.mkdirSync(docs);
  const policyPath = path.join(docs, "AGENT_POLICY.md");
  const manifestPath = path.join(directory, "Cargo.toml");
  try {
    const check = (interfaces, action, platforms = ["macos"], framework = null) => {
      fs.writeFileSync(manifestPath, `[workspace.metadata.agent-first-harness]\ninterfaces = ${JSON.stringify(interfaces)}\ntarget-platforms = ${JSON.stringify(platforms)}\n${framework === null ? "" : `gui-framework = ${JSON.stringify(framework)}\n`}`);
      fs.writeFileSync(policyPath, source
        .replace(/^confirmed_by:.*$/mu, "confirmed_by: user form confirmation")
        .replace(/^confirmed_at:.*$/mu, "confirmed_at: 2026-09-28")
        .replace(/^post_release_action:.*$/mu, `post_release_action: ${action}`)
        .replace(/^(superpowers|user_owned_tasks|parallel_worktree_subagents|acceptance_smoke|e2e_hint): pending$/gmu, "$1: disabled"));
      const errors = [];
      validateAgentPolicy(errors, policyPath, { allowPending: false });
      return errors;
    };
    for (const interfaces of [["tui"], ["mcp"], ["tui", "mcp"]]) {
      assert.ok(check(interfaces, "local_package").some((error) => error.includes("local_package requires CLI or GUI with a macOS/Windows target")));
      assert.deepEqual(check(interfaces, "push_release_branch"), []);
    }
    assert.deepEqual(check(["gui"], "local_package", ["macos"], "gpui"), []);
    assert.deepEqual(check(["gui"], "local_package", ["windows"], "gpui"), []);
    assert.ok(check(["gui"], "local_package", ["linux"], "gpui").some((error) => error.includes("local_package requires")));
    assert.deepEqual(check(["cli", "gui"], "local_package", ["linux"], "gpui"), []);
    assert.deepEqual(check(["gui"], "push_release_branch", ["macos"], "gpui"), []);
    assert.deepEqual(check(["cli", "gui"], "local_package", ["macos"], "gpui"), []);
    for (const interfaces of [["cli"], ["gui"], ["cli", "tui"], ["gui", "mcp"]]) {
      assert.deepEqual(check(interfaces, "local_package"), []);
    }
    assert.ok(check(["gui"], "local_package", ["linux"]).some((error) => error.includes("local_package requires CLI or GUI with a macOS/Windows target")));
    assert.deepEqual(check(["gui"], "push_release_branch", ["linux"]), []);
    assert.ok(check([], "local_package").some((error) => error.includes("requires persisted interfaces and target-platforms")));
    fs.rmSync(manifestPath);
    const missingMetadata = [];
    validateAgentPolicy(missingMetadata, policyPath, { allowPending: false });
    assert.ok(missingMetadata.some((error) => error.includes("requires persisted interfaces and target-platforms")), "missing Cargo metadata must fail closed");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("policy validator keeps full Cargo syntax checks and shared metadata rules", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "harness-policy-cargo-"));
  const docs = path.join(directory, "docs");
  const policyPath = path.join(docs, "AGENT_POLICY.md");
  const manifestPath = path.join(directory, "Cargo.toml");
  const policy = readText(path.join(ROOT, "docs", "AGENT_POLICY.md"))
    .replace(/^confirmed_by:.*$/mu, "confirmed_by: user form confirmation")
    .replace(/^confirmed_at:.*$/mu, "confirmed_at: 2026-09-28")
    .replace(/^post_release_action:.*$/mu, "post_release_action: local_package")
    .replace(/^(superpowers|user_owned_tasks|parallel_worktree_subagents|acceptance_smoke|e2e_hint): pending$/gmu, "$1: disabled");
  const canonical = "[workspace.metadata.agent-first-harness]\ninterfaces = [\"cli\"]\ntarget-platforms = [\"macos\"]\n";
  try {
    fs.mkdirSync(docs);
    fs.writeFileSync(policyPath, policy);
    const check = (cargo) => {
      fs.writeFileSync(manifestPath, cargo);
      const errors = [];
      validateAgentPolicy(errors, policyPath, { allowPending: false });
      return errors;
    };
    assert.deepEqual(check(canonical), []);
    for (const invalid of [
      canonical.replace('["cli"]', "['cli']"),
      `${canonical}[workspace.metadata.agent-first-harness]\n`,
      `${canonical}interfaces = [\"cli\"]\n`,
      canonical.replace('["cli"]', "[]"),
      canonical.replace('["cli"]', '["unknown"]'),
    ]) {
      assert.ok(check(invalid).some((error) => error.includes("cannot inspect persisted interface/platform metadata")));
    }
    assert.ok(check(`${canonical}broken = ???\n`).some((error) => error.includes("cannot inspect persisted interface/platform metadata")));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("policy rejects schema version 3 after the release action becomes mandatory", () => {
  const source = readText(path.join(ROOT, "docs", "AGENT_POLICY.md"));
  const legacy = source.replace(/^schema_version:.*$/mu, "schema_version: 3").replace(/^task_worktrees:.*\n/mu, "").replace(/^post_release_action:.*\n/mu, "");
  withPolicy(legacy, (filePath) => {
    const errors = [];
    validateAgentPolicy(errors, filePath);
    assert.ok(errors.some((error) => error.includes("schema_version must be 5")));
  });
});

test("source defaults reject enabled automatic capabilities", () => {
  const source = readText(path.join(ROOT, "docs", "AGENT_POLICY.md"));
  for (const field of ["superpowers", "user_owned_tasks", "task_worktrees"]) {
    const mutation = source.replace(new RegExp(`^${field}:.*$`, "mu"), `${field}: enabled`);
    withPolicy(mutation, (filePath) => {
      const errors = [];
      validateAgentPolicy(errors, filePath, { requireSourceDefaults: true });
      assert.ok(errors.some((error) => error.includes(field)));
    });
  }
});

/** Task Tree、独立工作树与内部并行的合法组合均不相互推断。 */
test("independent_task_and_parallel_choices_allow_all_combinations", () => {
  const source = readText(path.join(ROOT, "docs", "AGENT_POLICY.md"))
    .replace(/^confirmed_by:.*$/mu, "confirmed_by: explicit-user")
    .replace(/^confirmed_at:.*$/mu, "confirmed_at: 2026-10-10")
    .replace(/^post_release_action:.*$/mu, "post_release_action: push_release_branch")
    .replace(/^(superpowers|acceptance_smoke|e2e_hint): pending$/gmu, "$1: disabled");
  for (const tasks of ["enabled", "disabled"]) for (const worktrees of ["enabled", "disabled"]) for (const parallel of ["enabled", "disabled"]) {
    const text = source.replace(/^user_owned_tasks:.*$/mu, `user_owned_tasks: ${tasks}`)
      .replace(/^task_worktrees:.*$/mu, `task_worktrees: ${worktrees}`)
      .replace(/^parallel_worktree_subagents:.*$/mu, `parallel_worktree_subagents: ${parallel}`);
    withPolicy(text, (filePath) => {
      const errors = [];
      validateAgentPolicy(errors, filePath, { allowPending: false });
      assert.deepEqual(errors, [], `${tasks}/${worktrees}/${parallel}`);
    });
  }
});

test("source defaults keep downstream confirmation fields pending", () => {
  const source = readText(path.join(ROOT, "docs", "AGENT_POLICY.md"));
  for (const [field, value] of [["post_release_action", "local_package"], ["confirmed_by", "maintainer"], ["confirmed_at", "2026-09-28"]]) {
    withPolicy(source.replace(new RegExp(`^${field}:.*$`, "mu"), `${field}: ${value}`), (filePath) => {
      const errors = [];
      validateAgentPolicy(errors, filePath, { requireSourceDefaults: true });
      assert.ok(errors.some((error) => error.includes(`leave ${field} pending`)), field);
    });
  }
});

test("policy body must satisfy the post_release_action helper", () => {
  const source = readText(path.join(ROOT, "docs", "AGENT_POLICY.md"));
  withPolicy(source.replaceAll("冻结已确认的 `post_release_action`", "冻结选择"), (filePath) => {
    const errors = [];
    validateAgentPolicy(errors, filePath);
    assert.ok(errors.some((error) => error.includes("rejected by the post_release_action helper")));
  });
});

test("policy rejects removal of persistent body semantics", () => {
  const source = readText(path.join(ROOT, "docs", "AGENT_POLICY.md"));
  const mutation = source.replaceAll("../.agents/skills/desktop-task-workflow/SKILL.md", "missing-workflow.md");
  withPolicy(mutation, (filePath) => {
    const errors = [];
    validateAgentPolicy(errors, filePath);
    assert.ok(errors.some((error) => error.includes("desktop-task-workflow/SKILL.md")));
  });
});

/** 用户硬规则正文不能因默认关闭或入口裁剪而丢失。 */
test("user hard-rule contract rejects each removed boundary without mutating policy", () => {
  const source = readText(path.join(ROOT, "docs", "AGENT_POLICY.md"));
  for (const fragment of USER_HARD_RULE_REQUIRED_FRAGMENTS) {
    assert.ok(source.includes(fragment), fragment);
    withPolicy(source.replaceAll(fragment, "已删除合同"), (filePath) => {
      const before = fs.readFileSync(filePath);
      const errors = [];
      validateAgentPolicy(errors, filePath, { requireSourceDefaults: true });
      assert.ok(errors.some((error) => error.includes(fragment)), fragment);
      assert.deepEqual(fs.readFileSync(filePath), before);
    });
  }
});

/** 长期恢复的当前、置顶和各归档页证据共享精确项目序列。 */
test("sequence allocation uses all enumerated pages and never another project's number", () => {
  const record = (number, extra = {}) => ({ kind: "codex", hostId: "local", projectId: "p1", title: `Task ${number} | 已完成 | 结果`, ...extra });
  const current = [record(3), record(7, { pinned: true })];
  const archivedPages = [[record(12)], [record(18)], [record(99, { projectId: "p2" })]];
  assert.deepEqual(allocateProjectTaskSequences([...current, ...archivedPages.flat()], { hostId: "local", projectId: "p1" }), [19]);
});
