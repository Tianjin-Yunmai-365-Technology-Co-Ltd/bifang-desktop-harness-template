import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ROOT } from "./core.mjs";
import {
  OPTIONAL_REMOTE_ADR_SUPERSESSION_FRAGMENT,
  validateMaterializedChange,
  validateVersionContract,
} from "./governance_version.mjs";

function temporaryFile(name, contents, callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "harness-version-"));
  const filePath = path.join(directory, name);
  try {
    fs.writeFileSync(filePath, contents, "utf8");
    return callback(filePath);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function validateTemporaryVersion(mutator) {
  const source = fs.readFileSync(path.join(ROOT, "Version.md"), "utf8");
  return temporaryFile("Version.md", mutator(source), (filePath) => {
    const errors = [];
    validateVersionContract(errors, filePath);
    return errors;
  });
}

test("current_version_contract_is_valid", () => {
  const errors = [];
  validateVersionContract(errors);
  assert.deepEqual(errors, []);
});

test("invalid_calendar_datetime_is_rejected", () => {
  const errors = validateTemporaryVersion((source) => source.replace(/\d{12}/u, "202613401299"));
  assert.ok(errors.some((error) => error.includes("not a valid Shanghai datetime")), errors.join("\n"));
});

test("unreleased_version_source_is_rejected", () => {
  const errors = validateTemporaryVersion((source) => source.replace("发布状态：Released", "发布状态：Unreleased"));
  assert.ok(errors.some((error) => error.includes("发布状态：Released")), errors.join("\n"));
});

test("remote_only_tag_contract_is_rejected", () => {
  const errors = validateTemporaryVersion((source) => source.replace(
    "当前主分支提交必须创建并复读本地 `v{版本}-{YYYYMMDD}`；只有当次选择远端发布时才推送并复读远端同名 tag。",
    "当前主分支提交必须创建并推送 `v{版本}-{YYYYMMDD}`。",
  ));
  assert.ok(errors.some((error) => error.includes("创建并复读本地")), errors.join("\n"));
});

test("materialized_change_rejects_pending_record", () => {
  temporaryFile("CHANGELOG.md", "- `HARNESS-CHANGE-SIMPLE-GIT-LIFECYCLE`（所需 Harness 版本 `pending`，等待发布）\n", (filePath) => {
    const errors = [];
    validateMaterializedChange(errors, filePath, "HARNESS-CHANGE-SIMPLE-GIT-LIFECYCLE", "202609101621");
    assert.ok(errors.some((error) => error.includes("stale required version")), errors.join("\n"));
  });
});

test("materialized_change_rejects_pending_duplicate", () => {
  const contents = [
    "- `HARNESS-CHANGE-SIMPLE-GIT-LIFECYCLE`（所需 Harness 版本 `202609101621`，已发布）",
    "- `HARNESS-CHANGE-SIMPLE-GIT-LIFECYCLE`（所需 Harness 版本 `pending`，等待发布）",
    "",
  ].join("\n");
  temporaryFile("CHANGELOG.md", contents, (filePath) => {
    const errors = [];
    validateMaterializedChange(errors, filePath, "HARNESS-CHANGE-SIMPLE-GIT-LIFECYCLE", "202609101621");
    assert.ok(errors.some((error) => error.includes("stale required version")), errors.join("\n"));
  });
});

test("cross_reference_does_not_impersonate_materialized_record", () => {
  const contents = [
    "- `HARNESS-CHANGE-SIMPLE-GIT-LIFECYCLE`（所需 Harness 版本 `202609101621`，已发布）",
    "- `HARNESS-FEAT-ANOTHER-CHANGE`（所需 Harness 版本 `202608281139`）：由 `HARNESS-CHANGE-SIMPLE-GIT-LIFECYCLE` 取代旧子句。",
    "",
  ].join("\n");
  temporaryFile("CHANGELOG.md", contents, (filePath) => {
    const errors = [];
    validateMaterializedChange(errors, filePath, "HARNESS-CHANGE-SIMPLE-GIT-LIFECYCLE", "202609101621");
    assert.deepEqual(errors, []);
  });
});

test("optional_remote_supersession_scope_remains_complete", () => {
  const adrDirectory = path.join(ROOT, "docs", "adr");
  const latestAdr = fs.readdirSync(adrDirectory).filter((name) => /^\d{8}_ADR\.md$/u.test(name)).sort().at(-1);
  const text = fs.readFileSync(path.join(adrDirectory, latestAdr), "utf8");
  assert.ok(text.includes(OPTIONAL_REMOTE_ADR_SUPERSESSION_FRAGMENT));
});
