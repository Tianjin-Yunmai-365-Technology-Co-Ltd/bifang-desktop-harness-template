import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { parseFrontmatter, physicalLineCount } from "./harness_validation/core.mjs";
import { lineLimitProfile } from "./harness_validation/line_limits.mjs";
import { findPythonArtifacts, pythonReferenceViolations, validateNoPythonRuntime } from "./harness_validation/repository.mjs";
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

test("python_runtime_references_are_rejected_only_in_active_contracts", () => {
  const interpreter = `${"py"}thon3`;
  const sourceEntry = `check.${"py"}`;
  const runtimeMarker = `PY${"THON_COMMAND"}`;
  assert.deepEqual(
    pythonReferenceViolations("AGENTS.md", `run ${interpreter} scripts/${sourceEntry} with ${runtimeMarker}`),
    ["Python 解释器命令", "Python 文件入口", "Python 运行时标识"],
  );
  assert.deepEqual(
    pythonReferenceViolations("docs/verification/20260805_verification.md", `${interpreter} old.${"py"}`),
    [],
  );
  assert.deepEqual(
    pythonReferenceViolations("docs/verification/run.sh", `${interpreter} -c pass`),
    ["Python 解释器命令"],
  );
  assert.deepEqual(
    pythonReferenceViolations("docs/ENGINEERING_RULES.md", "不得引入 Python 运行步骤"),
    [],
  );
});

test("python_runtime_gate_rejects_source_manifests_and_environment_artifacts", () => {
  const source = `tool.${"py"}`;
  const manifest = `${"py"}project.toml`;
  const cache = `__${"py"}cache__/tool.${"py"}c`;
  const virtualEnvironment = `.${"venv"}/bin/activate`;
  const packageMetadata = `lib/example.${"dist-info"}/METADATA`;
  const standardVirtualEnvironment = `${"venv"}/bin/activate`;
  const packagingManifest = `${"MANIFEST"}.in`;
  const runtimeConfiguration = `${"py"}${"venv"}.cfg`;
  const sitePackages = `lib/${"site-packages"}/example`;
  for (const relative of [source, manifest, cache, virtualEnvironment, standardVirtualEnvironment, packagingManifest, runtimeConfiguration, packageMetadata, sitePackages]) {
    const errors = [];
    validateNoPythonRuntime(errors, [relative]);
    assert.ok(errors.length > 0, `${relative} must be rejected`);
  }
});

test("python_runtime_gate_detects_shell_and_package_manager_commands", () => {
  const interpreter = `${"py"}thon3.14 -V`;
  const windowsInterpreter = `${"py"}thon.exe -V`;
  const launcher = `${"p"}y -3`;
  const packageManager = `${"p"}ip install example`;
  const windowsPackageManager = `${"p"}ip3.exe install example`;
  const uvRunner = `${"u"}v run tool`;
  const projectManager = `${"p"}dm install`;
  const testRunner = `${"py"}test -q`;
  const jsonInterpreter = `["${"py"}thon3", "-c", "print(1)"]`;
  const quotedInterpreter = `'${"py"}thon3' -c 'print(1)'`;
  const quotedPackageManager = `"${"pip"}" install example`;
  const versionedLauncher = `${"p"}y -3.14 -c "print(1)"`;
  const launcherVersion = `${"p"}y -V`;
  const launcherCode = `${"p"}y -c pass`;
  const uvxRunner = `${"u"}vx black .`;
  const uvTool = `${"u"}v tool install black`;
  const shebang = `#!/usr/bin/env ${"py"}thon3`;
  const heredoc = `${"py"}thon3 <<'SCRIPT'`;
  const pipedInterpreter = `printf script | ${"py"}thon3`;
  const bareJsonInterpreter = `["${"py"}thon3"]`;
  for (const command of [interpreter, windowsInterpreter, launcher, packageManager, windowsPackageManager, uvRunner, projectManager, testRunner, jsonInterpreter, quotedInterpreter, quotedPackageManager, versionedLauncher, launcherVersion, launcherCode, uvxRunner, uvTool, shebang, heredoc, pipedInterpreter, bareJsonInterpreter]) {
    assert.ok(pythonReferenceViolations(".github/workflows/build.yml", command).length > 0, command);
  }
});

test("python_runtime_gate_detects_redirect_comment_and_continuation_tails", () => {
  const interpreter = `${"py"}thon3`;
  const packageManager = `${"p"}ip`;
  const testRunner = `${"py"}test`;
  const cases = [
    [`${interpreter} >/dev/null`, "Python 解释器命令"],
    [`${interpreter} # wait`, "Python 解释器命令"],
    [`${interpreter}\\\n -V`, "Python 解释器命令"],
    [`${packageManager} >/dev/null`, "Python 包管理命令"],
    [`${testRunner} >/dev/null`, "Python 工具命令"],
    [`{"command":"${interpreter}"}`, "Python 解释器命令"],
    [`{"command":"${packageManager}"}`, "Python 包管理命令"],
  ];
  for (const [command, violation] of cases) {
    assert.ok(pythonReferenceViolations("scripts/check.sh", command).includes(violation), command);
  }
});

test("python_runtime_gate_rejects_ignored_dependency_manifests", () => {
  const manifest = `${"py"}project.toml`;
  const requirements = `${"require"}ments-${"dev"}.txt`;
  assert.ok(pythonReferenceViolations(".gitignore", `${manifest}\n${requirements}\n`).length > 0);
  const environmentManifest = `${"environment"}.yml`;
  const condaLock = `${"conda"}-lock.yaml`;
  const pixiManifest = `${"pixi"}.toml`;
  const pixiLock = `${"pixi"}.lock`;
  for (const relative of [environmentManifest, condaLock, pixiManifest, pixiLock]) {
    const errors = [];
    validateNoPythonRuntime(errors, [relative]);
    assert.ok(errors.some((error) => error.includes("依赖清单")), errors.join("\n"));
  }
  assert.ok(pythonReferenceViolations("tooling.yml", `dependencies:\n  - ${"py"}thon=3.14\n`).length > 0);
});

test("python_runtime_gate_rejects_environment_variables_and_tool_probes", () => {
  const environmentVariable = `PY${"THON"}PATH=/tmp/example`;
  const unixProbe = `command -v ${"py"}thon3`;
  const windowsProbe = `Get-Command ${"py"}thon.exe`;
  for (const reference of [environmentVariable, unixProbe, windowsProbe]) {
    assert.ok(pythonReferenceViolations("scripts/check.sh", reference).length > 0, reference);
  }
});

test("filesystem_scan_finds_ignored_python_artifacts_without_entering_generated_trees", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "harness-no-python-"));
  try {
    fs.mkdirSync(path.join(directory, `.${"venv"}`), { recursive: true });
    fs.writeFileSync(path.join(directory, `.${"venv"}`, "marker"), "fixture\n");
    fs.writeFileSync(path.join(directory, `${"py"}project.toml`), "fixture\n");
    fs.writeFileSync(path.join(directory, `${"py"}${"venv"}.cfg`), "fixture\n");
    fs.mkdirSync(path.join(directory, "node_modules", "ignored"), { recursive: true });
    fs.writeFileSync(path.join(directory, "node_modules", "ignored", `tool.${"py"}`), "fixture\n");
    assert.deepEqual(findPythonArtifacts(directory), [`.${"venv"}`, `${"py"}project.toml`, `${"py"}${"venv"}.cfg`]);
    const errors = [];
    validateNoPythonRuntime(errors, [], { root: directory, scanFilesystem: true });
    assert.equal(errors.length, 3);
    assert.ok(errors.every((error) => error.includes("Git ignore")));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("active_reference_scan_fails_closed_on_symlink_and_invalid_text", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "harness-no-python-text-"));
  try {
    fs.writeFileSync(path.join(directory, "target.sh"), "fixture\n");
    fs.symlinkSync(path.join(directory, "target.sh"), path.join(directory, "linked.sh"));
    fs.writeFileSync(path.join(directory, "invalid.sh"), Buffer.from([0xff, 0xfe]));
    fs.writeFileSync(path.join(directory, "asset.png"), Buffer.from([0x00, 0xff]));
    const errors = [];
    validateNoPythonRuntime(errors, ["linked.sh", "invalid.sh", "asset.png"], { root: directory, scanFilesystem: false });
    assert.ok(errors.some((error) => error.includes("普通非符号链接文件: linked.sh")), errors.join("\n"));
    assert.ok(errors.some((error) => error.includes("无法检查活动文件 invalid.sh")), errors.join("\n"));
    assert.ok(!errors.some((error) => error.includes("asset.png")), errors.join("\n"));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
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
