#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path


SCRIPT = Path(__file__).with_name("development-environment-gates.ps1")
POWERSHELL = shutil.which("powershell") or shutil.which("pwsh")


def command(path: Path, body: str) -> None:
    """写入隔离测试命令，使 PowerShell 门禁不读取真实宿主工具。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"@echo off\r\n{body}\r\n", encoding="utf-8")


def add_base_tools(
    probe: Path,
    *,
    git: str = "2.50.0",
    rust: str = "1.95.0",
    node: str | None = None,
    pnpm: str | None = None,
) -> None:
    """建立满足门禁或由状态标记升级的 Windows 工具夹具。"""
    command(probe / "cl.cmd", "exit /b 0")
    command(probe / "git.cmd", f"echo git version {git}")
    command(probe / "rustc.cmd", f"echo rustc {rust} (test)")
    command(probe / "cargo.cmd", f"echo cargo {rust} (test)")
    command(probe / "rustup.cmd", "echo rustup 1.28.2 (test)")
    if node is not None:
        command(probe / "node.cmd", f"echo v{node}")
    if pnpm is not None:
        command(probe / "pnpm.cmd", f"echo {pnpm}")


def make_node_dist(root: Path) -> str:
    """生成带摘要的 Windows Node 本地镜像，验证低版本升级与复探。"""
    version = "v26.0.0"
    archive_name = f"node-{version}-win-x64.zip"
    release = root / version
    release.mkdir(parents=True)
    (root / "index.json").write_text(
        json.dumps([{"version": version}]), encoding="utf-8"
    )
    archive = release / archive_name
    with zipfile.ZipFile(archive, "w") as bundle:
        bundle.writestr(f"node-{version}-win-x64/node.cmd", "@echo off\r\necho v26.0.0\r\n")
        bundle.writestr(f"node-{version}-win-x64/npm.cmd", "@echo off\r\nexit /b 0\r\n")
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (release / "SHASUMS256.txt").write_text(
        f"{digest}  {archive_name}\n", encoding="utf-8"
    )
    return root.as_uri()


@unittest.skipUnless(os.name == "nt" and POWERSHELL, "requires Windows PowerShell")
class WindowsPrerequisiteGateTests(unittest.TestCase):
    """验证 Windows 门禁会升级低版本并在复探失败时阻断。"""

    def run_gate(
        self, root: Path, probe: Path, *arguments: str, **extra: str
    ) -> subprocess.CompletedProcess[str]:
        """在隔离路径运行 PowerShell 门禁并禁用用户 PATH 持久化。"""
        environment = os.environ.copy()
        environment.update(
            {
                "AFH_PREREQ_PATH": str(probe),
                "AFH_NODE_HOME": str(root / "node-home"),
                "AFH_PNPM_HOME": str(root / "pnpm-home"),
                "AFH_SKIP_PERSIST_PATH": "1",
                "CARGO_HOME": str(root / "cargo"),
                "USERPROFILE": str(root / "home"),
            }
        )
        environment.update(extra)
        return subprocess.run(
            [
                str(POWERSHELL),
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(SCRIPT),
                *arguments,
            ],
            text=True,
            capture_output=True,
            cwd=root,
            env=environment,
            timeout=30,
            check=False,
        )

    def test_check_only_reports_upgrade_required_without_writes(self) -> None:
        """只读检查发现旧 Git 时报告待升级，且不调用 winget。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            add_base_tools(probe, git="1.9.5")
            command(probe / "winget.cmd", 'type nul > "%~dp0winget-called"')

            result = self.run_gate(root, probe, "-CheckOnly", "-Interfaces", "CLI")

            self.assertEqual(result.returncode, 20, result.stderr)
            self.assertIn("gate.git.status=upgrade-required", result.stdout)
            self.assertIn("gate.git.version=git version 1.9.5", result.stdout)
            self.assertFalse((probe / "winget-called").exists())

    def test_below_minimum_git_is_upgraded_and_reprobed(self) -> None:
        """旧 Git 通过唯一 winget 路线升级，复探达标后才返回成功。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            add_base_tools(probe, git="1.9.5")
            command(
                probe / "git.cmd",
                'if exist "%~dp0git-upgraded" (echo git version 2.51.0) else (echo git version 1.9.5)',
            )
            command(probe / "winget.cmd", 'type nul > "%~dp0git-upgraded"')

            result = self.run_gate(root, probe, "-Interfaces", "CLI")

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("gate.git.version=git version 2.51.0", result.stdout)
            self.assertIn("gate.git.change=upgraded", result.stdout)
            self.assertIn("gate.changed=true", result.stdout)

    def test_git_upgrade_that_remains_old_is_rejected(self) -> None:
        """升级命令返回成功但版本仍低于下界时不得宣称门禁通过。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            add_base_tools(probe, git="1.9.5")
            command(probe / "winget.cmd", "exit /b 0")

            result = self.run_gate(root, probe, "-Interfaces", "CLI")

            self.assertEqual(result.returncode, 29)
            self.assertIn("安装或升级后仍不满足", result.stderr)
            self.assertNotIn("gate.git.status=passed", result.stdout)

    def test_below_msrv_rust_is_upgraded_with_existing_rustup(self) -> None:
        """低于 MSRV 的 Rust 通过既有 rustup 升级 stable 并重新探测。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            add_base_tools(probe, rust="1.94.9")
            command(
                probe / "rustc.cmd",
                'if exist "%~dp0rust-upgraded" (echo rustc 1.96.0 (test^)) else (echo rustc 1.94.9 (test^))',
            )
            command(
                probe / "cargo.cmd",
                'if exist "%~dp0rust-upgraded" (echo cargo 1.96.0 (test^)) else (echo cargo 1.94.9 (test^))',
            )
            command(
                probe / "rustup.cmd",
                'if "%1"=="toolchain" (type nul > "%~dp0rust-upgraded" & exit /b 0)\r\n'
                'if "%1"=="default" exit /b 0\r\n'
                "echo rustup 1.28.2 (test)",
            )

            result = self.run_gate(root, probe, "-Interfaces", "CLI")

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("gate.rust.version=rustc 1.96.0 (test)", result.stdout)
            self.assertIn("gate.rust.change=upgraded", result.stdout)
            self.assertIn("gate.changed=true", result.stdout)

    def test_below_minimum_node_is_upgraded_from_verified_archive(self) -> None:
        """GUI 的旧 Node 使用当前 Windows 官方形态制品升级并通过摘要复探。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            add_base_tools(probe, node="22.16.0", pnpm="11.24.0")
            node_dist = make_node_dist(root / "node-dist")

            result = self.run_gate(
                root,
                probe,
                "-Interfaces",
                "GUI",
                AFH_ALLOW_FILE_URLS="1",
                AFH_NODE_DIST_BASE=node_dist,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("gate.node.version=v26.0.0", result.stdout)
            self.assertIn("gate.node.change=upgraded", result.stdout)
            self.assertIn("gate.changed=true", result.stdout)

    def test_below_minimum_pnpm_is_upgraded_and_reprobed(self) -> None:
        """GUI 的旧 pnpm 通过当前 Node 的 npm 升级并重新探测。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            add_base_tools(probe, node="26.0.0", pnpm="11.23.9")
            command(
                probe / "pnpm.cmd",
                'if exist "%~dp0pnpm-upgraded" (echo 12.1.0) else (echo 11.23.9)',
            )
            command(
                probe / "npm.cmd",
                'if not "%~5"=="pnpm@>=11.24.0" exit /b 91\r\n'
                'type nul > "%~dp0pnpm-upgraded"',
            )

            result = self.run_gate(root, probe, "-Interfaces", "GUI")

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("gate.pnpm.version=12.1.0", result.stdout)
            self.assertIn("gate.pnpm.change=upgraded", result.stdout)
            self.assertIn("gate.changed=true", result.stdout)
            self.assertFalse((root / "11.24.0").exists())
            self.assertFalse((root / "=11.24.0").exists())

    def test_windows_wrapper_precedes_extensionless_posix_shim(self) -> None:
        """npm/pnpm 同目录含 POSIX shim 时，Windows 门禁仍必须选择 cmd 包装器。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            add_base_tools(probe, node="26.0.0", pnpm="11.24.0")
            (probe / "pnpm").write_text("#!/bin/sh\nexit 99\n", encoding="utf-8")

            result = self.run_gate(root, probe, "-CheckOnly", "-Interfaces", "GUI")

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("gate.pnpm.status=passed", result.stdout)
            self.assertIn("gate.pnpm.version=11.24.0", result.stdout)


if __name__ == "__main__":
    unittest.main()
