import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { findPythonArtifacts, inspectProject, pythonArtifactKind, pythonReferenceViolations } from "./check_no_python.mjs";

function withTemporaryRoot(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "check-no-python-"));
  try { return callback(root); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}

function write(root, relative, content = "fixture\n") {
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  fs.writeFileSync(path.join(root, relative), content);
}

test("active_text_rejects_interpreter_entry_and_runtime_marker", () => {
  assert.deepEqual(
    pythonReferenceViolations("run python3 scripts/check.py with PYTHON_COMMAND"),
    ["Python 解释器命令", "Python 文件入口", "Python 运行时标识"],
  );
  assert.deepEqual(pythonReferenceViolations("不得引入 Python 运行步骤"), []);
});

test("historical_records_and_completed_work_plans_are_exempt", () => withTemporaryRoot((root) => {
  write(root, "docs/verification/20260805_verification.md", "python3 old.py\n");
  write(root, "docs/verification/run.sh", "python3 -c pass\n");
  write(root, "docs/work_plan/README.md", "- [2026-09-01](20260901_work_plan.md)（已完成）\n- [2026-09-02](20260902_work_plan.md)\n");
  write(root, "docs/work_plan/20260901_work_plan.md", "python3 -B old.py\n");
  write(root, "docs/work_plan/20260902_work_plan.md", "python3 -B new.py\n");
  const errors = inspectProject(root, {
    files: ["docs/verification/20260805_verification.md", "docs/verification/run.sh", "docs/work_plan/20260901_work_plan.md", "docs/work_plan/20260902_work_plan.md"],
    scanFilesystem: false,
  });
  assert.ok(errors.some((error) => error.endsWith("docs/verification/run.sh")), errors.join("\n"));
  assert.ok(errors.some((error) => error.endsWith("docs/work_plan/20260902_work_plan.md")), errors.join("\n"));
  assert.ok(!errors.some((error) => error.includes("20260805_verification") || error.includes("20260901_work_plan")), errors.join("\n"));
}));

test("paths_classify_sources_manifests_and_environment_artifacts", () => {
  for (const relative of ["tool.py", "__pycache__/tool.pyc", ".venv/bin/activate", "venv/bin/activate", "lib/example.dist-info/METADATA", "lib/site-packages/example"]) {
    assert.equal(pythonArtifactKind(relative), "runtime", relative);
  }
  for (const relative of ["pyproject.toml", "MANIFEST.in", "pyvenv.cfg", "requirements-dev.txt", "environment.yml", "conda-lock.yaml", "pixi.toml", "pixi.lock"]) {
    assert.equal(pythonArtifactKind(relative), "manifest", relative);
  }
  assert.equal(pythonArtifactKind("scripts/check.mjs"), null);
});

test("shell_package_manager_and_tool_commands_are_detected", () => {
  for (const command of [
    "python3.14 -V", "python.exe -V", "py -3", "pip install example", "pip3.exe install example",
    "uv run tool", "pdm install", "pytest -q", `["python3", "-c", "print(1)"]`, "'python3' -c 'print(1)'",
    `"pip" install example`, `py -3.14 -c "print(1)"`, "py -V", "py -c pass", "uvx black .", "uv tool install black",
    "#!/usr/bin/env python3", "python3 <<'SCRIPT'", "printf script | python3", `["python3"]`,
  ]) {
    assert.ok(pythonReferenceViolations(command).length > 0, command);
  }
});

test("redirect_comment_continuation_and_json_tails_are_detected", () => {
  for (const [command, violation] of [
    ["python3 >/dev/null", "Python 解释器命令"],
    ["python3 # wait", "Python 解释器命令"],
    ["python3\\\n -V", "Python 解释器命令"],
    ["pip >/dev/null", "Python 包管理命令"],
    ["pytest >/dev/null", "Python 工具命令"],
    [`{"command":"python3"}`, "Python 解释器命令"],
    [`{"command":"pip"}`, "Python 包管理命令"],
  ]) {
    assert.ok(pythonReferenceViolations(command).includes(violation), command);
  }
});

test("ignore_rules_env_variables_and_probes_are_detected", () => {
  for (const reference of ["pyproject.toml\nrequirements-dev.txt\n", "dependencies:\n  - python=3.14\n", "PYTHONPATH=/tmp/example", "command -v python3", "Get-Command python.exe"]) {
    assert.ok(pythonReferenceViolations(reference).length > 0, reference);
  }
});

test("filesystem_scan_finds_ignored_artifacts_without_entering_generated_trees", () => withTemporaryRoot((root) => {
  write(root, ".venv/marker");
  write(root, "pyproject.toml");
  write(root, "pyvenv.cfg");
  write(root, "node_modules/ignored/tool.py");
  assert.deepEqual(findPythonArtifacts(root), [".venv", "pyproject.toml", "pyvenv.cfg"]);
  const errors = inspectProject(root, { files: [] });
  assert.equal(errors.length, 3);
  assert.ok(errors.every((error) => error.includes("Git ignore")));
}));

test("listed_artifacts_are_reported_once_and_text_fails_closed", (t) => withTemporaryRoot((root) => {
  write(root, "pyproject.toml");
  write(root, "target.sh");
  try { fs.symlinkSync(path.join(root, "target.sh"), path.join(root, "linked.sh")); }
  catch (error) {
    if (process.platform === "win32" && error.code === "EPERM") return t.skip("当前 Windows 主机未授予创建符号链接的权限");
    throw error;
  }
  fs.writeFileSync(path.join(root, "invalid.sh"), Buffer.from([0xff, 0xfe]));
  fs.writeFileSync(path.join(root, "asset.png"), Buffer.from([0x00, 0xff]));
  const errors = inspectProject(root, { files: ["pyproject.toml", "linked.sh", "invalid.sh", "asset.png"] });
  assert.equal(errors.filter((error) => error.includes("pyproject.toml")).length, 1, errors.join("\n"));
  assert.ok(errors.some((error) => error.includes("普通非符号链接文件: linked.sh")), errors.join("\n"));
  assert.ok(errors.some((error) => error.includes("无法检查活动文件 invalid.sh")), errors.join("\n"));
  assert.ok(!errors.some((error) => error.includes("asset.png")), errors.join("\n"));
}));
