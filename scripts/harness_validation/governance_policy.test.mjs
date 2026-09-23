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
  const pending = source.replace(/^e2e_hint:.*$/mu, "e2e_hint: pending");
  withPolicy(pending, (filePath) => {
    const errors = [];
    validateAgentPolicy(errors, filePath, { allowPending: false });
    assert.ok(errors.some((error) => error.includes("resolve e2e_hint")));
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

test("source defaults reject enabled automatic capabilities", () => {
  const source = readText(path.join(ROOT, "docs", "AGENT_POLICY.md"));
  for (const field of ["superpowers", "user_owned_tasks"]) {
    const mutation = source.replace(new RegExp(`^${field}:.*$`, "mu"), `${field}: enabled`);
    withPolicy(mutation, (filePath) => {
      const errors = [];
      validateAgentPolicy(errors, filePath, { requireSourceDefaults: true });
      assert.ok(errors.some((error) => error.includes(field)));
    });
  }
});

test("policy rejects removal of persistent body semantics", () => {
  const source = readText(path.join(ROOT, "docs", "AGENT_POLICY.md"));
  const mutation = source.replaceAll("缺号不回填", "缺失序号可复用");
  withPolicy(mutation, (filePath) => {
    const errors = [];
    validateAgentPolicy(errors, filePath);
    assert.ok(errors.some((error) => error.includes("缺号不回填")));
  });
});
