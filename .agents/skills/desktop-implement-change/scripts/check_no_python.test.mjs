import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { findPythonArtifacts, inspectProject, pythonArtifactKind, pythonReferenceViolations } from "./check_no_python.mjs";

/** Rust 紧接括号的内边距方法不误报，普通文件引用仍保持阻断。 */
test("rust_padding_method_is_not_a_python_file_entry", () => {
  assert.deepEqual(pythonReferenceViolations("div().py(px(12.))"), []);
  assert.ok(pythonReferenceViolations("scripts/check.py").includes("Python 文件入口"));
  assert.equal(pythonArtifactKind("scripts/check.py"), "runtime");
});

/** 文件入口后出现空格或换行再跟说明括号时，不能被方法调用豁免吞掉。 */
test("python_file_references_before_spaced_or_newline_parentheses_are_rejected", () => {
  for (const text of ["scripts/check.py (legacy helper)", "scripts/check.py\n(next step)"]) {
    assert.ok(pythonReferenceViolations(text).includes("Python 文件入口"), text);
  }
});

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

/** 连字符连接的门禁名称属于说明文案，不应被识别成独立运行命令。 */
test("compound_gate_names_are_not_interpreter_or_tool_commands", () => {
  for (const text of [
    "Hard/release-review/no-Python gates passed.",
    "The no-python check passed.",
    "The no-pip checks passed.",
    "The no-pytest checks passed.",
    "The no-uv tool checks passed.",
  ]) {
    assert.deepEqual(pythonReferenceViolations(text), [], text);
  }
});

/** 发布上下文可以描述门禁名称，但同一路径中的真实解释器命令仍必须阻断。 */
test("release_context_gate_names_pass_but_real_commands_fail", () => withTemporaryRoot((root) => {
  const relative = ".harness/release-context.json";
  const evidenceSummary = "Hard/release-review/no-Python gates passed.";
  write(root, relative, JSON.stringify({ evidenceSummary }));
  assert.deepEqual(inspectProject(root, { files: [relative], scanFilesystem: false }), []);
  write(root, relative, JSON.stringify({ evidenceSummary, command: "python3" }));
  assert.deepEqual(inspectProject(root, { files: [relative], scanFilesystem: false }), [
    `活动文件不得保留 Python 解释器命令: ${relative}`,
  ]);
}));

/** 修正名称边界后，标准绝对路径、Shell 分隔符和赋值中的真实命令仍被识别。 */
test("real_commands_remain_detected_next_to_gate_names_and_shell_boundaries", () => {
  for (const command of [
    "/usr/bin/python3 -V",
    "no-Python gates passed; python3 -V",
    "- python3 -V",
    "command=python3 -V",
    "$(python3 -V)",
    "no-pip checks passed; pip install example",
    "no-pytest checks passed; pytest -q",
  ]) {
    assert.ok(pythonReferenceViolations(command).length > 0, command);
  }
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

test("published_release_notes_do_not_disable_active_command_checks", () => withTemporaryRoot((root) => {
  write(root, "release-notes.json", '{"en-US":"Fixed Python source restrictions leaking into existing downstream upgrades."}\n');
  write(root, "docs/current.md", "run python3 scripts/check\n");
  const errors = inspectProject(root, {
    files: ["release-notes.json", "docs/current.md"],
    scanFilesystem: false,
  });
  assert.deepEqual(errors, ["活动文件不得保留 Python 解释器命令: docs/current.md"]);
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
