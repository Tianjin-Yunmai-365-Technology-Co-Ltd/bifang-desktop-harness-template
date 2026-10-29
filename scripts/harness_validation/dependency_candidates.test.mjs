import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DEPENDENCY_CANDIDATES, coversContinuousNodeRange, validateDependencyCandidates } from "./dependency_candidates.mjs";

/** 用快照副本注入真实漂移，不修改工作树或访问网络。 */
function mutatedSnapshot(change, verify) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dependency-candidate-test-"));
  try {
    const value = JSON.parse(fs.readFileSync(DEPENDENCY_CANDIDATES, "utf8"));
    change(value);
    const catalogPath = path.join(root, "registry-candidates.json");
    fs.writeFileSync(catalogPath, JSON.stringify(value));
    const errors = [];
    validateDependencyCandidates(errors, { catalogPath });
    verify(errors);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test("registered_candidates_match_cli_gpui_and_frontend_sources", () => {
  const errors = [];
  validateDependencyCandidates(errors);
  assert.deepEqual(errors, []);
});

test("node_engine_admission_preserves_the_entire_supported_release_range", () => {
  for (const range of [null, ">=24", ">= 10", "^20.19.0 || >=22.12.0", "^20.0.0 || ^22.0.0 || >=24.0.0"]) assert.equal(coversContinuousNodeRange(range), true, range);
  for (const range of ["^22.12.0 || ^24.0.0 || >=26.0.0", "^22.22.2 || ^24.15.0 || >=26.0.0", ">=24.1.0", ">=26"]) assert.equal(coversContinuousNodeRange(range), false, range);
});

test("candidate_gate_rejects_node_exclusions_and_excessive_rust_msrv", () => mutatedSnapshot(value => {
  value.npm.vitest.nodeEngine = "^22.12.0 || ^24.0.0 || >=26.0.0";
  value.crates.tokio.declaredRustVersion = "1.99.0";
}, errors => {
  assert.match(errors.join("\n"), /excludes a supported Node release: vitest/u);
  assert.match(errors.join("\n"), /exceeds project MSRV: tokio/u);
}));

test("candidate_gate_rejects_stale_gpui_renderer_and_wrong_accesskit_family", () => mutatedSnapshot(value => {
  value.crates["gpui-kit"].version = "0.7.1";
  value.crates.accesskit_macos.version = "0.27.2";
}, errors => {
  assert.match(errors.join("\n"), /GPUI template dependency candidate drift: gpui-kit/u);
  assert.match(errors.join("\n"), /compatible accesskit_macos/u);
}));

test("candidate_gate_rejects_unregistered_frontend_versions_and_nonofficial_sources", () => mutatedSnapshot(value => {
  value.npm.react.version = "19.3.0";
  value.npm.react.source = "https://example.invalid/react/19.3.0";
}, errors => {
  assert.match(errors.join("\n"), /frontend dependency candidate drift: react/u);
  assert.match(errors.join("\n"), /official source: react/u);
}));
