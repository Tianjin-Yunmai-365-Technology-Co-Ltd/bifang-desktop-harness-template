import assert from "node:assert/strict";
import test from "node:test";

import { rustCommentReportSchemaErrors, validateRustChineseComments } from "./rust_comments.mjs";

const PASSING = {
  ok: true,
  root: "/fixture",
  checkedPackages: 1,
  checkedRustFiles: 2,
  checkedDeclarations: 3,
  errors: [],
  violations: [],
};

test("current Rust workspace Chinese-comment contract passes", () => {
  const errors = [];
  validateRustChineseComments(errors);
  assert.deepEqual(errors, []);
});

test("report schema accepts non-empty successful report", () => {
  assert.deepEqual(rustCommentReportSchemaErrors(PASSING), []);
});

test("report schema rejects malformed and inconsistent reports", () => {
  assert.ok(rustCommentReportSchemaErrors({ ...PASSING, ok: "yes" }).length > 0);
  assert.ok(rustCommentReportSchemaErrors({ ...PASSING, checkedDeclarations: 0 }).length > 0);
  assert.ok(rustCommentReportSchemaErrors({ ...PASSING, violations: [{}] }).length > 0);
  assert.ok(rustCommentReportSchemaErrors({ ...PASSING, errors: ["bad"] }).length > 0);
});

test("validator converts operational errors and declaration violations", () => {
  const report = {
    ok: false,
    root: "/fixture",
    checkedPackages: 1,
    checkedRustFiles: 1,
    checkedDeclarations: 1,
    errors: ["read failed"],
    violations: [{ path: "src/lib.rs", line: 2, column: 3, kind: "fn", name: "run", reason: "missing" }],
  };
  const errors = [];
  validateRustChineseComments(errors, "/fixture", () => report);
  assert.ok(errors.some((error) => error.includes("read failed")));
  assert.ok(errors.some((error) => error.includes("src/lib.rs:2:3")));
});

test("validator rejects a failure report without diagnostics", () => {
  const errors = [];
  validateRustChineseComments(errors, "/fixture", () => ({ ...PASSING, ok: false }));
  assert.ok(errors.some((error) => error.includes("failed without diagnostics")));
});
