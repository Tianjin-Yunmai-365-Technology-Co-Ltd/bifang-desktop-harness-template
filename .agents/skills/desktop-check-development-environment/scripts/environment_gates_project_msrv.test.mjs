import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { fakeExistingTools, makeRustDist, runGate, WINDOWS_SCRIPT } from "./environment_gates_fixture.mjs";

const posixOnly = { skip: process.platform === "win32" };

/** 在临时 HOME 中模拟指定 Rust 版本，确保门槛复核不接触真实工具或用户配置。 */
function withRust(rust, run) {
  const root = mkdtempSync(path.join(tmpdir(), "afh-project-msrv-"));
  try {
    const probe = path.join(root, "probe");
    fakeExistingTools(probe, { rust });
    run(root, probe);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

/** 达到通用门槛的 1.95.0 与 1.98.0 都不能冒充项目 1.98.1 已满足。 */
test("project_msrv_is_enforced_above_the_generic_rust_minimum_without_writes", posixOnly, () => {
  for (const rust of ["1.95.0", "1.98.0"]) withRust(rust, (root, probe) => {
    const generic = runGate(root, ["--check-only"], { probe });
    assert.equal(generic.status, 0, generic.stderr);
    assert.match(generic.stdout, /gate\.rust\.requirement=>=1\.95\.0/u);
    const project = runGate(root, ["--check-only", "--rust-min-version", "1.98.1"], { probe });
    assert.equal(project.status, 20, project.stderr);
    assert.match(project.stdout, /gate\.rust\.status=upgrade-required/u);
    assert.match(project.stdout, /gate\.rust\.requirement=>=1\.98\.1/u);
    for (const entry of [".profile", ".cargo", ".local"]) assert.equal(existsSync(path.join(root, "home", entry)), false, entry);
  });
});

/** 精确项目下界及更高稳定版原样复用，不为满足当前模板重装已合格工具。 */
test("project_msrv_accepts_exact_and_newer_stable_rust_without_reinstalling", posixOnly, () => {
  for (const rust of ["1.98.1", "1.98.2", "1.99.0", "2.0.0"]) withRust(rust, (root, probe) => {
    const result = runGate(root, ["--install-missing", "--rust-min-version", "1.98.1"], { probe });
    assert.equal(result.status, 0, `${rust}: ${result.stderr}`);
    assert.match(result.stdout, /gate\.rust\.requirement=>=1\.98\.1/u);
    assert.match(result.stdout, /gate\.rust\.change=existing/u);
    assert.match(result.stdout, /gate\.changed=false/u);
    assert.equal(existsSync(path.join(root, "home", ".profile")), false);
  });
});

/** 更低的项目值不能降低通用基础门槛。 */
test("project_msrv_cannot_lower_the_generic_rust_requirement", posixOnly, () => withRust("1.94.9", (root, probe) => {
  const result = runGate(root, ["--check-only", "--rust-min-version", "1.80.0"], { probe });
  assert.equal(result.status, 20, result.stderr);
  assert.match(result.stdout, /gate\.rust\.requirement=>=1\.95\.0/u);
  assert.match(result.stdout, /gate\.rust\.status=upgrade-required/u);
}));

/** 非完整稳定值、溢出或重复参数必须在工具探测前拒绝。 */
test("invalid_project_msrv_parameters_fail_before_tool_probes", posixOnly, () => {
  const values = ["", "1.98", "1.98.1-beta", "1.98.1\n", "1.98.1+build", ">=1.98.1", "1.98.1;touch marker", "01.98.1", "1..1", "1.98.1.2", "1.9999999999.0"];
  for (const value of values) withRust("1.98.1", (root, probe) => {
    const result = runGate(root, ["--check-only", "--rust-min-version", value], { probe });
    assert.equal(result.status, 2, `${JSON.stringify(value)}: ${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.equal(existsSync(path.join(root, "marker")), false);
  });
  withRust("1.98.1", (root, probe) => {
    for (const args of [["--rust-min-version"], ["--rust-min-version", "1.98.1", "--rust-min-version", "1.98.1"]]) {
      const result = runGate(root, args, { probe });
      assert.equal(result.status, 2, result.stderr);
      assert.equal(result.stdout, "");
    }
  });
});

/** 达到通用门槛但低于项目值时仍走同一受管升级，并复核安装后的真实版本。 */
test("project_msrv_triggers_managed_upgrade_and_reprobe", posixOnly, () => withRust("1.95.0", (root, probe) => {
  const dist = makeRustDist(path.join(root, "rust-dist"), { installedVersion: "1.99.0" });
  const result = runGate(root, ["--install-missing", "--rust-min-version", "1.98.1"], {
    probe,
    extra: { AFH_ALLOW_FILE_URLS: "1", AFH_SKIP_PERSIST_PATH: "1", AFH_RUSTUP_DIST_BASE: dist },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /gate\.rust\.requirement=>=1\.98\.1/u);
  assert.match(result.stdout, /gate\.rust\.change=upgraded/u);
  assert.match(result.stdout, /gate\.rust\.version=rustc 1\.99\.0/u);
}));

/** Windows 在探测前验证输入并使用同一动态最低值；真实运行由原生夹具覆盖。 */
test("windows_project_msrv_parameter_matches_the_posix_contract", () => {
  const source = readFileSync(WINDOWS_SCRIPT, "utf8");
  assert.match(source, /\[string\]\$RustMinVersion = ""/u);
  assert.ok(source.includes("\\A(0|[1-9][0-9]{0,8})"));
  assert.ok(source.includes("\\z'"));
  assert.match(source, /\$PSBoundParameters\.ContainsKey\("RustMinVersion"\)/u);
  assert.match(source, /\$requestedRustMinimum -gt \[version\]"\$MinimumRustMajor\.\$MinimumRustMinor\.\$MinimumRustPatch"/u);
  assert.ok(source.indexOf('$RustMinVersion -notmatch') < source.indexOf('function Resolve-GateCommand'));
  assert.equal(source.split('gate.rust.requirement=>=$MinimumRustMajor.$MinimumRustMinor.$MinimumRustPatch').length - 1, 2);
});

/** 官方安装流程返回的 stable 仍不足项目要求时必须阻断，不能只复核通用最低值。 */
test("project_msrv_reprobe_rejects_a_still_insufficient_installed_stable", posixOnly, () => withRust("1.95.0", (root, probe) => {
  const dist = makeRustDist(path.join(root, "rust-dist"), { installedVersion: "1.97.0" });
  const result = runGate(root, ["--install-missing", "--rust-min-version", "1.98.1"], {
    probe,
    extra: { AFH_ALLOW_FILE_URLS: "1", AFH_SKIP_PERSIST_PATH: "1", AFH_RUSTUP_DIST_BASE: dist },
  });
  assert.equal(result.status, 22, result.stderr);
  assert.match(result.stderr, /Rust 安装或升级后仍/u);
  assert.doesNotMatch(result.stdout, /gate\.rust\.status=passed/u);
}));

/** Cargo 二段声明在调用端补零，恢复与人工接续命令不能遗漏项目参数。 */
test("recovery_contract_normalizes_two_part_cargo_msrv_before_invocation", () => {
  const skill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const instructions = readFileSync(path.join(skill, "SKILL.md"), "utf8");
  const reference = readFileSync(path.join(skill, "references/development-environment-gates.md"), "utf8");
  for (const source of [instructions, reference]) {
    assert.ok(source.includes("二段"));
    assert.ok(source.includes("`1.95` → `1.95.0`"));
    assert.ok(source.includes("workspace"));
    for (const command of source.matchAll(/`[^`]*development-environment-gates\.(sh|ps1) [^`]+`/gu)) {
      assert.ok(command[0].includes(command[1] === "sh" ? "--rust-min-version <project-msrv>" : "-RustMinVersion <project-msrv>"), command[0]);
    }
  }
});
