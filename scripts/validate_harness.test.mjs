import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { parseFrontmatter, physicalLineCount } from "./harness_validation/core.mjs";
import { lineLimitProfile } from "./harness_validation/line_limits.mjs";
import { discoverTests } from "./run_harness_tests.mjs";
import { validateHarness } from "./validate_harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("physical_line_count_matches_splitlines_tail_semantics", () => {
  assert.equal(physicalLineCount(""), 0);
  assert.equal(physicalLineCount("one"), 1);
  assert.equal(physicalLineCount("one\n"), 1);
  assert.equal(physicalLineCount("one\r\ntwo\r\n"), 2);
  assert.equal(physicalLineCount("one\u2028two"), 2);
});

test("line_limit_profiles_keep_three_tiers", () => {
  assert.deepEqual(lineLimitProfile("src/lib.rs"), { name: "Rust", review: 400, hard: 800 });
  assert.deepEqual(lineLimitProfile("scripts/check.mjs"), { name: "前端", review: 500, hard: 1000 });
  assert.deepEqual(lineLimitProfile("docs/rules.md"), { name: "人工维护文本", review: 500, hard: 2000 });
});

test("frontmatter_parser_reads_policy_scalars", () => {
  assert.deepEqual(parseFrontmatter("---\nname: sample\ndescription: 'hello'\n---\n# Body\n"), {
    name: "sample",
    description: "hello",
  });
  assert.equal(parseFrontmatter("# no frontmatter\n"), null);
});

test("test_discovery_includes_root_and_skill_node_suites", () => {
  const tests = discoverTests();
  assert.ok(tests.some((file) => file.endsWith("scripts/validate_harness.test.mjs")));
  assert.ok(tests.some((file) => file.includes(`${path.sep}.agents${path.sep}skills${path.sep}`)));
});

test("validator_rejects_unknown_arguments", () => {
  const result = spawnSync(process.execPath, ["scripts/validate_harness.mjs", "--unknown"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown option|未知|unknown/iu);
});

test("current_harness_passes_node_only_validation", () => {
  const report = validateHarness();
  assert.deepEqual(report.errors, [], report.errors.join("\n"));
  assert.equal(report.ok, true);
  assert.ok(report.inventory.nodeTests > 0);
});
