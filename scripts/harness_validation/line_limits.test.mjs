import assert from "node:assert/strict";
import test from "node:test";

import { validateLineLimits } from "./line_limits.mjs";

function validateReport(report, { releaseReview = false } = {}) {
  const errors = [];
  const warnings = [];
  validateLineLimits(errors, warnings, {
    releaseReview,
    inspect: () => structuredClone(report),
    root: "/unused-test-root",
  });
  return { errors, warnings };
}

test("successful line-limit report is accepted", () => {
  const result = validateReport({
    ok: true,
    checkedTextFiles: 12,
    errors: [],
    reviewCandidates: [],
    violations: [],
  });
  assert.deepEqual(result, { errors: [], warnings: [] });
});

test("review candidates are opt-in and never become hard failures", () => {
  const report = {
    ok: true,
    errors: [],
    reviewCandidates: [{
      path: "screen.tsx",
      lines: 501,
      profile: "frontend",
      threshold: 500,
      limit: 1000,
    }],
    violations: [],
  };
  assert.deepEqual(validateReport(report), { errors: [], warnings: [] });
  const reviewed = validateReport(report, { releaseReview: true });
  assert.deepEqual(reviewed.errors, []);
  assert.match(reviewed.warnings.join("\n"), /screen\.tsx \(501 lines, hard limit 1000\)/u);
});

test("checker errors and hard violations become concrete Harness failures", () => {
  const result = validateReport({
    ok: false,
    errors: ["git failed"],
    reviewCandidates: [],
    violations: [{ path: "lib.rs", lines: 801, profile: "rust", limit: 800 }],
  });
  assert.match(result.errors.join("\n"), /git failed/u);
  assert.match(result.errors.join("\n"), /lib\.rs \(801 lines\)/u);
  assert.match(result.errors.join("\n"), /hard 800-line limit/u);
});

test("inconsistent checker status fails closed", () => {
  let result = validateReport({
    ok: true,
    errors: ["unexpected"],
    reviewCandidates: [],
    violations: [],
  });
  assert.match(result.errors.join("\n"), /returned success with diagnostics/u);

  result = validateReport({
    ok: false,
    errors: [],
    reviewCandidates: [],
    violations: [],
  });
  assert.match(result.errors.join("\n"), /failed without diagnostics/u);
});

test("checker exceptions fail closed with an operational diagnostic", () => {
  const errors = [];
  validateLineLimits(errors, [], {
    inspect: () => { throw new Error("fixture exploded"); },
    root: "/unused-test-root",
  });
  assert.match(errors.join("\n"), /cannot execute file line-limit checker: fixture exploded/u);
});
