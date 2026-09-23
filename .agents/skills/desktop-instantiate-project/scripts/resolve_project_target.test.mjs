#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveProjectTarget } from "./resolve_project_target.mjs";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "resolve_project_target_"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const harness = path.join(root, "harness");
  fs.mkdirSync(harness);
  return { root: fs.realpathSync(root), harness: fs.realpathSync(harness) };
}

test("exact_final_name_reuses_input_path", (t) => {
  const { root, harness } = fixture(t);
  const supplied = path.join(root, "sample_tool");
  const result = resolveProjectTarget(harness, supplied, "sample_tool");
  assert.equal(result.inputKind, "target-root");
  assert.equal(result.targetRoot, supplied);
  assert.equal(result.targetState, "missing");
});

test("parent_path_appends_project_id_even_when_parent_is_nonempty", (t) => {
  const { root, harness } = fixture(t);
  const parent = path.join(root, "projects");
  fs.mkdirSync(parent);
  fs.writeFileSync(path.join(parent, "existing-project.txt"), "kept");
  const result = resolveProjectTarget(harness, parent, "sample_tool");
  assert.equal(result.inputKind, "parent-directory");
  assert.equal(result.targetRoot, path.join(parent, "sample_tool"));
  assert.equal(result.targetState, "missing");
});

test("similar_but_not_equal_final_name_still_appends_project_id", (t) => {
  const { root, harness } = fixture(t);
  const supplied = path.join(root, "sample-tool");
  assert.equal(resolveProjectTarget(harness, supplied, "sample_tool").targetRoot, path.join(supplied, "sample_tool"));
});

test("relative_project_path_is_based_on_harness_root", (t) => {
  const { harness } = fixture(t);
  assert.equal(resolveProjectTarget(harness, "children", "sample_tool").targetRoot, path.join(harness, "children", "sample_tool"));
});

test("existing_empty_final_target_is_allowed", (t) => {
  const { root, harness } = fixture(t);
  const target = path.join(root, "sample_tool");
  fs.mkdirSync(target);
  assert.equal(resolveProjectTarget(harness, target, "sample_tool").targetState, "empty");
});

test("existing_nonempty_final_target_is_rejected", (t) => {
  const { root, harness } = fixture(t);
  const target = path.join(root, "sample_tool");
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, "keep.txt"), "keep");
  assert.throws(() => resolveProjectTarget(harness, target, "sample_tool"), /不是空目录/);
});

test("parent_input_that_is_a_file_is_rejected", (t) => {
  const { root, harness } = fixture(t);
  const parent = path.join(root, "projects");
  fs.writeFileSync(parent, "not a directory");
  assert.throws(() => resolveProjectTarget(harness, parent, "sample_tool"), /不是目录/);
});

test("final_target_symlink_is_rejected", (t) => {
  const { root, harness } = fixture(t);
  const destination = path.join(root, "destination");
  fs.mkdirSync(destination);
  const target = path.join(root, "sample_tool");
  try { fs.symlinkSync(destination, target, "dir"); } catch (error) { t.skip(`当前平台不能创建测试符号链接：${error.message}`); }
  assert.throws(() => resolveProjectTarget(harness, target, "sample_tool"), /不得是符号链接/);
});

test("harness_root_or_ancestor_is_rejected", (t) => {
  const { root } = fixture(t);
  const ancestor = path.join(root, "ancestor_root");
  const harness = path.join(ancestor, "harness");
  fs.mkdirSync(harness, { recursive: true });
  assert.throws(() => resolveProjectTarget(harness, harness, "harness"), /Harness 根目录或其祖先/);
  assert.throws(() => resolveProjectTarget(harness, ancestor, "ancestor_root"), /Harness 根目录或其祖先/);
});

test("invalid_project_id_is_rejected", (t) => {
  const { root, harness } = fixture(t);
  assert.throws(() => resolveProjectTarget(harness, path.join(root, "target"), "Sample-Tool"), /ASCII snake_case/);
});
