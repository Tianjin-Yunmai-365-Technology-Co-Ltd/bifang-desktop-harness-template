import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  SCRIPT,
  WINDOWS_SCRIPT,
  executable,
  fakeExistingTools,
  fakeFrontendTools,
  runGate,
} from "./environment_gates_fixture.mjs";

function withTemporaryRoot(callback) {
  const root = mkdtempSync(path.join(tmpdir(), "afh-env-detect-"));
  try { callback(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

test("Rust-only project requires Node but not pnpm", () => withTemporaryRoot((root) => {
  const probe = path.join(root, "probe");
  fakeExistingTools(probe);
  const result = runGate(root, ["--install-missing"], { probe });
  assert.equal(result.status, 0, result.stderr);
  for (const fragment of [
    "gate.rust.change=existing", "gate.git.status=passed", "gate.git.change=existing",
    "gate.node.status=passed", "gate.pnpm.status=not-required", "gate.changed=false",
  ]) assert.ok(result.stdout.includes(fragment), fragment);
}));

test("rustup installer cannot mutate unmanaged shell profiles", () => {
  const source = readFileSync(SCRIPT, "utf8");
  assert.ok(source.includes('"$installer_path" -y --profile minimal --default-toolchain stable --no-modify-path'));
});

test("missing rustup blocks even when rustc and cargo exist", () => withTemporaryRoot((root) => {
  const probe = path.join(root, "probe");
  fakeExistingTools(probe);
  unlinkSync(path.join(probe, "rustup"));
  const result = runGate(root, ["--check-only"], { probe });
  assert.equal(result.status, 20, result.stderr);
  assert.match(result.stdout, /gate\.rust\.status=missing/);
  assert.match(result.stdout, /gate\.rust\.rustup_version=Missing/);
}));

test("rustc verbose release mismatch fails closed", () => withTemporaryRoot((root) => {
  const probe = path.join(root, "probe");
  fakeExistingTools(probe);
  executable(path.join(probe, "rustc"), `#!/bin/sh
if [ "\${1:-}" = -vV ]; then
  printf '%s\n' 'rustc 1.98.1 (test)' 'host: x86_64-unknown-linux-gnu' 'release: 1.98.0'
else printf '%s\n' 'rustc 1.98.1 (test)'; fi
`);
  const result = runGate(root, ["--check-only"], { probe });
  assert.equal(result.status, 21);
  assert.match(result.stderr, /release 与 rustc --version 不一致/);
}));

test("Rust tool names and verbose host are strict", () => {
  for (const scenario of ["wrong-tool", "duplicate-host"]) withTemporaryRoot((root) => {
    const probe = path.join(root, "probe");
    fakeExistingTools(probe);
    if (scenario === "wrong-tool") executable(path.join(probe, "rustup"), "#!/bin/sh\nprintf '%s\n' 'cargo 1.28.0 (test)'\n");
    else executable(path.join(probe, "rustc"), `#!/bin/sh
if [ "\${1:-}" = -vV ]; then
  printf '%s\n' 'rustc 1.98.1 (test)' 'host: x86_64-unknown-linux-gnu' 'host: injected' 'release: 1.98.1'
else printf '%s\n' 'rustc 1.98.1 (test)'; fi
`);
    const result = runGate(root, ["--check-only"], { probe });
    assert.equal(result.status, 21);
    assert.match(result.stderr, /错误：/);
  });
});

test("cargo must match rustc stable line", () => withTemporaryRoot((root) => {
  const probe = path.join(root, "probe");
  fakeExistingTools(probe, { rust: "1.99.0" });
  executable(path.join(probe, "cargo"), "#!/bin/sh\nprintf '%s\n' 'cargo 1.98.1 (test)'\n");
  const result = runGate(root, ["--check-only"], { probe });
  assert.equal(result.status, 21, result.stderr);
  assert.match(result.stderr, /不属于同一 stable 工具链/);
}));

test("unsupported login shell fails before installation", () => withTemporaryRoot((root) => {
  const probe = path.join(root, "probe");
  mkdirSync(probe);
  const unsupported = path.join(root, "unsupported-shell");
  executable(unsupported, "#!/bin/sh\nexit 0\n");
  const result = runGate(root, ["--install-missing", "--interfaces", "GUI"], { probe, extra: { SHELL: unsupported } });
  assert.equal(result.status, 24);
  assert.match(result.stderr, /不支持自动持久化 PATH/);
  assert.equal(existsSync(path.join(root, "home", ".cargo")), false);
  assert.equal(existsSync(path.join(root, "home", ".local", "lib", "nodejs")), false);
}));

test("empty and literal-glob probe entries never resolve project shims", () => {
  for (const mode of ["empty", "glob"]) withTemporaryRoot((root) => {
    const probe = path.join(root, "probe");
    fakeExistingTools(probe, { includeGit: false });
    if (mode === "empty") executable(path.join(root, "git"), "#!/bin/sh\nprintf '%s\n' 'git version 9.9.9'\n");
    else executable(path.join(root, "glob-match", "git"), "#!/bin/sh\nprintf '%s\n' 'git version 9.9.9'\n");
    const value = mode === "empty" ? `:${probe}` : `${root}/*:${probe}`;
    const result = runGate(root, ["--check-only"], { probe, extra: { AFH_PREREQ_PATH: value } });
    assert.equal(result.status, 20, result.stderr);
    assert.match(result.stdout, /gate\.git\.status=missing/);
  });
});

test("test overrides require explicit test mode", () => withTemporaryRoot((root) => {
  const result = runGate(root, ["--check-only"], { testMode: false });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /仅在 AFH_TEST_MODE=1/);
}));

test("existing tools support spaces in probe path", () => withTemporaryRoot((root) => {
  const probe = path.join(root, "probe with spaces");
  fakeExistingTools(probe);
  const result = runGate(root, ["--install-missing"], { probe });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /gate\.changed=false/);
}));

test("newer stable Rust and Git versions satisfy continuous minimums", () => {
  for (const rust of ["1.98.1", "1.98.2", "1.99.0", "2.0.0"]) withTemporaryRoot((root) => {
    const probe = path.join(root, "probe");
    fakeExistingTools(probe, { rust });
    const result = runGate(root, ["--check-only"], { probe });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes(`rustc ${rust} (test)`));
  });
  for (const git of ["2.36.0", "2.39.0", "2.51.0", "3.0.0"]) withTemporaryRoot((root) => {
    const probe = path.join(root, "probe");
    fakeExistingTools(probe, { git });
    const result = runGate(root, ["--check-only"], { probe });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /gate\.git\.requirement=>=2\.36\.0/);
    assert.ok(result.stdout.includes(`gate.git.version=git version ${git}`));
  });
});

test("Git below worktree NUL support requires upgrade in check-only", () => withTemporaryRoot((root) => {
  const probe = path.join(root, "probe");
  fakeExistingTools(probe, { git: "2.35.8" });
  const result = runGate(root, ["--check-only"], { probe });
  assert.equal(result.status, 20, result.stderr);
  assert.match(result.stdout, /gate\.git\.status=upgrade-required/);
  assert.match(result.stdout, /gate\.git\.version=git version 2\.35\.8/);
  assert.equal(result.stderr, "");
}));

test("existing GUI tools are preserved", () => withTemporaryRoot((root) => {
  const probe = path.join(root, "probe");
  fakeExistingTools(probe);
  fakeFrontendTools(probe);
  const result = runGate(root, ["--install-missing", "--interfaces", "GUI"], { probe });
  assert.equal(result.status, 0, result.stderr);
  for (const fragment of [
    "gate.rust.status=passed", "gate.node.status=passed", "gate.node.requirement=>=24.21.0",
    "gate.pnpm.status=passed", "gate.pnpm.requirement=>=12.4.1", "gate.changed=false",
  ]) assert.ok(result.stdout.includes(fragment), fragment);
}));

test("newer compatible frontend tools are preserved", () => {
  for (const [node, pnpm] of [["24.21.0", "12.4.1"], ["25.9.0", "13.0.0"], ["26.7.0", "13.1.0"]]) {
    withTemporaryRoot((root) => {
      const probe = path.join(root, "probe");
      fakeExistingTools(probe);
      fakeFrontendTools(probe, { node, pnpm });
      const result = runGate(root, ["--install-missing", "--interfaces", "GUI"], { probe });
      assert.equal(result.status, 0, result.stderr);
      assert.ok(result.stdout.includes(`gate.node.version=v${node}`));
      assert.ok(result.stdout.includes(`gate.pnpm.version=${pnpm}`));
      assert.match(result.stdout, /gate\.changed=false/);
    });
  }
});

test("lower Node and pnpm versions require upgrade in check-only", () => {
  for (const node of ["23.11.9", "24.20.9"]) withTemporaryRoot((root) => {
    const probe = path.join(root, "probe");
    fakeExistingTools(probe);
    fakeFrontendTools(probe, { node });
    const result = runGate(root, ["--check-only", "--interfaces", "GUI"], { probe });
    assert.equal(result.status, 20, result.stderr);
    assert.match(result.stdout, /gate\.node\.status=upgrade-required/);
    assert.match(result.stdout, /gate\.pnpm\.status=passed/);
  });
  withTemporaryRoot((root) => {
    const probe = path.join(root, "probe");
    fakeExistingTools(probe);
    fakeFrontendTools(probe, { pnpm: "12.4.0" });
    const result = runGate(root, ["--check-only", "--interfaces", "GUI"], { probe });
    assert.equal(result.status, 20, result.stderr);
    assert.match(result.stdout, /gate\.node\.status=passed/);
    assert.match(result.stdout, /gate\.pnpm\.status=upgrade-required/);
  });
});

test("check-only aggregates all lower versions without installing", () => withTemporaryRoot((root) => {
  const probe = path.join(root, "probe");
  fakeExistingTools(probe, { rust: "1.98.0", git: "1.99.9" });
  fakeFrontendTools(probe, { node: "24.20.9", pnpm: "12.4.0" });
  const result = runGate(root, ["--check-only", "--interfaces", "GUI"], { probe });
  assert.equal(result.status, 20, result.stderr);
  for (const tool of ["git", "rust", "node", "pnpm"]) assert.match(result.stdout, new RegExp(`gate\\.${tool}\\.status=upgrade-required`));
  assert.equal(existsSync(path.join(root, "home", ".cargo")), false);
}));

test("prerelease and unparseable versions are rejected without upgrade", () => {
  const cases = [
    ["git", "2.50.0.rc1", 29], ["rust", "1.98.1-nightly", 21], ["node", "24.21.0-rc.1", 23], ["pnpm", "12.4.1-beta.1", 28],
    ["git", "unknown", 29], ["rust", "unknown", 21], ["node", "unknown", 23], ["node", "24.21.0.1", 23], ["pnpm", "unknown", 28], ["pnpm", "12.4.1.1", 28],
  ];
  for (const [tool, version, expected] of cases) withTemporaryRoot((root) => {
    const probe = path.join(root, "probe");
    fakeExistingTools(probe, { rust: tool === "rust" ? version : "1.98.1", git: tool === "git" ? version : "2.39.0" });
    const args = ["--install-missing"];
    if (tool === "node" || tool === "pnpm") {
      fakeFrontendTools(probe, { node: tool === "node" ? version : "24.21.0", pnpm: tool === "pnpm" ? version : "12.4.1" });
      args.push("--interfaces", "GUI");
    }
    const result = runGate(root, args, { probe });
    assert.equal(result.status, expected, `${tool} ${version}: ${result.stderr}`);
    assert.ok(result.stderr.includes("错误：") || result.stderr.includes("识别"));
  });
});

test("check-only reports missing without installing", () => withTemporaryRoot((root) => {
  const result = runGate(root, ["--check-only"]);
  assert.equal(result.status, 20);
  assert.match(result.stdout, /gate\.rust\.status=missing/);
  assert.match(result.stdout, /gate\.git\.status=missing/);
  assert.match(result.stdout, /gate\.node\.status=missing/);
  assert.equal(existsSync(path.join(root, "home", ".cargo")), false);
}));

test("removed WEB interface is rejected", () => withTemporaryRoot((root) => {
  const result = runGate(root, ["--check-only", "--interfaces", "WEB"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /不支持的接口：WEB/);
}));

test("Windows gate retains signed MSVC and current runtime contracts", () => {
  const source = readFileSync(WINDOWS_SCRIPT, "utf8");
  for (const fragment of [
    "https://aka.ms/vs/17/release/vs_BuildTools.exe", "Get-AuthenticodeSignature", "Microsoft Corporation",
    "Microsoft.VisualStudio.Workload.VCTools", "Install-MissingMsvc", "[string[]]$Interfaces",
    "Install-MissingPnpm", "Install-MissingGit", "Test-GitVersion", "Git.Git",
    '"gate.git.status=passed"', '"gate.git.change=$GitChange"', "if (-not (Test-MsvcPrerequisite))",
    '"gate.msvc.status=passed"', '"gate.msvc.change=$MsvcChange"', '@("CLI", "TUI", "MCP", "GUI")',
    '$PnpmRequired = $NormalizedInterfaces -contains "GUI"', "$MinimumRustMinor = 98", "$MinimumRustPatch = 1",
    '$NodeRequirement = ">=24.21.0"', '$PnpmRequirement = ">=12.4.1"', '$PnpmInstallRequirement = "pnpm@>=12.4.1"',
    "Test-NodeVersion", "Test-PnpmVersion",
  ]) assert.ok(source.includes(fragment), fragment);
  assert.equal(source.includes("pnpm@latest"), false);
});
