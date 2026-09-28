import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ROOT } from "./core.mjs";
import {
  OPTIONAL_REMOTE_ADR_SUPERSESSION_FRAGMENT,
  validateMaterializedChange,
  validatePendingHarnessChanges,
  validateReleaseBoundChange,
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

test("literal_released_status_is_rejected_before_git_release", () => {
  const errors = validateTemporaryVersion((source) => source.replace("发布状态：以适用 Git 引用复核结果为准", "发布状态：Released"));
  assert.ok(errors.some((error) => error.includes("发布状态：以适用 Git 引用复核结果为准")), errors.join("\n"));
});

test("remote_only_tag_contract_is_rejected", () => {
  const errors = validateTemporaryVersion((source) => source.replace(
    "本地 `v{版本}-{YYYYMMDD}` tag 创建并复读成功",
    "远端 tag 推送成功",
  ));
  assert.ok(errors.some((error) => error.includes("本地 `v{版本}-{YYYYMMDD}` tag 创建并复读成功")), errors.join("\n"));
});

test("Harness_version_requires_the_unique_Shanghai_release_clock", () => {
  const errors = validateTemporaryVersion((source) => source.replace(
    "仅在正式发布时按上海时区当前自然时间生成",
    "每次修改都按另一版本规则生成",
  ));
  assert.ok(errors.some((error) => error.includes("仅在正式发布时按上海时区当前自然时间生成")), errors.join("\n"));
});

test("archive_and_push_cannot_define_Git_release", () => {
  const errors = validateTemporaryVersion((source) => source.replace(
    "推送和源码归档分别由发布后的用户请求决定，不属于这一发布判定",
    "只有完成推送和源码归档才算发布",
  ));
  assert.ok(errors.some((error) => error.includes("不属于这一发布判定")), errors.join("\n"));
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

test("release_bound_change_allows_consistent_pending_before_tag", () => {
  const changeId = "HARNESS-CHANGE-RELEASE-TIME-AND-REQUIREMENT-FIRST-VERSIONING";
  temporaryFile("ADR.md", `- \`change_id = ${changeId}\`; \`required_version = pending\`\n`, (first) => {
    const other = path.join(path.dirname(first), "CHANGELOG.md");
    fs.writeFileSync(other, `- \`${changeId}\` (\`required_version = pending\`)\n`);
    const errors = [];
    validateReleaseBoundChange(errors, [first, other], changeId, "202609231754");
    assert.deepEqual(errors, []);
  });
});

test("release_bound_change_rejects_partial_materialization", () => {
  const changeId = "HARNESS-CHANGE-RELEASE-TIME-AND-REQUIREMENT-FIRST-VERSIONING";
  temporaryFile("ADR.md", `- \`change_id = ${changeId}\`; \`required_version = 202609281200\`\n`, (first) => {
    const other = path.join(path.dirname(first), "CHANGELOG.md");
    fs.writeFileSync(other, `- \`${changeId}\` (\`required_version = pending\`)\n`);
    const errors = [];
    validateReleaseBoundChange(errors, [first, other], changeId, "202609281200");
    assert.ok(errors.some((error) => error.includes("inconsistent required_version")), errors.join("\n"));
  });
});

test("release_bound_change_requires_target_version_after_clock_advances", () => {
  const changeId = "HARNESS-CHANGE-RELEASE-TIME-AND-REQUIREMENT-FIRST-VERSIONING";
  temporaryFile("ADR.md", `- \`change_id = ${changeId}\`; \`required_version = pending\`\n`, (first) => {
    const other = path.join(path.dirname(first), "CHANGELOG.md");
    fs.writeFileSync(other, `- \`${changeId}\` (\`required_version = pending\`)\n`);
    const errors = [];
    validateReleaseBoundChange(errors, [first, other], changeId, "202609281200", "202609231754");
    assert.ok(errors.some((error) => error.includes("inconsistent required_version")), errors.join("\n"));
  });
});

test("release_clock_requires_every_pending_memory_record_to_be_materialized", () => {
  temporaryFile("CHANGELOG.md", "- `HARNESS-FEAT-LATER`（`required_version = pending`）\n", (filePath) => {
    const beforeRelease = [];
    validatePendingHarnessChanges(beforeRelease, [filePath], "202609231754", "202609231754");
    assert.deepEqual(beforeRelease, []);

    const releaseTarget = [];
    validatePendingHarnessChanges(releaseTarget, [filePath], "202609281200", "202609231754");
    assert.ok(releaseTarget.some((error) => error.includes("pending Harness required_version")), releaseTarget.join("\n"));
  });
});
