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


def make_file_symlink(link: Path, target: Path) -> bool:
    """使用 Windows 原生命令建立文件 symlink；宿主策略不允许时由用例跳过。"""
    link.parent.mkdir(parents=True, exist_ok=True)
    created = subprocess.run(
        ["cmd", "/c", "mklink", str(link), str(target)],
        text=True,
        capture_output=True,
        check=False,
    )
    return created.returncode == 0


def add_base_tools(
    probe: Path,
    *,
    git: str = "2.50.0",
    rust: str = "1.98.1",
    node: str | None = None,
    pnpm: str | None = None,
) -> None:
    """建立满足门禁或由状态标记升级的 Windows 工具夹具。"""
    command(probe / "cl.cmd", "exit /b 0")
    command(probe / "git.cmd", f"echo git version {git}")
    command(
        probe / "rustc.cmd",
        f'if "%1"=="-vV" (echo rustc {rust} ^(test^) & echo host: x86_64-pc-windows-msvc & echo release: {rust} & exit /b 0)\r\n'
        f"echo rustc {rust} (test)",
    )
    command(probe / "cargo.cmd", f"echo cargo {rust} (test)")
    command(probe / "rustup.cmd", "echo rustup 1.28.2 (test)")
    if node is not None:
        command(probe / "node.cmd", f"echo v{node}")
        command(probe / "npm.cmd", "echo 11.6.0")
    if pnpm is not None:
        command(probe / "pnpm.cmd", f"echo {pnpm}")


def make_node_dist(root: Path, *, extra_files: dict[str, str] | None = None) -> str:
    """生成带摘要的 Windows Node LTS 本地镜像，验证只选择 LTS。"""
    version = "v24.21.1"
    archive_name = f"node-{version}-win-x64.zip"
    release = root / version
    release.mkdir(parents=True)
    (root / "index.json").write_text(
        json.dumps(
            [
                {"version": "v24.21.0", "lts": "Krypton"},
                {"version": "v26.8.2", "lts": False},
                {"version": version, "lts": "Krypton"},
                {"version": "v24.22.0-rc.1", "lts": "Krypton"},
            ]
        ),
        encoding="utf-8",
    )
    archive = release / archive_name
    with zipfile.ZipFile(archive, "w") as bundle:
        bundle.writestr(f"node-{version}-win-x64/node.cmd", f"@echo off\r\necho {version}\r\n")
        bundle.writestr(
            f"node-{version}-win-x64/npm.cmd",
            "@echo off\r\n"
            "if \"%~1\"==\"--version\" echo 11.6.0\r\n"
            "if \"%~1\"==\"--version\" exit /b 0\r\n"
            "if not \"%~1\"==\"install\" exit /b 91\r\n"
            "if not \"%~3\"==\"--prefix\" exit /b 92\r\n"
            "if not \"%~5\"==\"pnpm@>=12.4.1\" exit /b 93\r\n"
            "if not \"%~6\"==\"--registry\" exit /b 94\r\n"
            "set \"expected_registry=https://registry.npmjs.org/\"\r\n"
            "if defined AFH_PNPM_REGISTRY set \"expected_registry=%AFH_PNPM_REGISTRY%\"\r\n"
            "if not \"%~7\"==\"%expected_registry%\" exit /b 95\r\n"
            "if not \"%~8\"==\"--ignore-scripts\" exit /b 96\r\n"
            "if not exist \"%~4\" mkdir \"%~4\"\r\n"
            "> \"%~4\\pnpm.cmd\" echo @echo off\r\n"
            ">> \"%~4\\pnpm.cmd\" echo echo 12.4.1\r\n"
            "exit /b 0\r\n",
        )
        for relative_path, body in (extra_files or {}).items():
            bundle.writestr(f"node-{version}-win-x64/{relative_path}", body)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (release / "SHASUMS256.txt").write_text(
        f"{digest}  {archive_name}\n", encoding="utf-8"
    )
    return root.as_uri()


@unittest.skipUnless(os.name == "nt" and POWERSHELL, "requires Windows PowerShell")
class WindowsPrerequisiteGateTests(unittest.TestCase):
    """验证 Windows 门禁会升级低版本并在复探失败时阻断。"""

    def run_gate(
        self,
        root: Path,
        probe: Path,
        *arguments: str,
        test_mode: bool = True,
        **extra: str,
    ) -> subprocess.CompletedProcess[str]:
        """在隔离路径运行 PowerShell 门禁并禁用用户 PATH 持久化。"""
        (root / "home").mkdir(parents=True, exist_ok=True)
        environment = os.environ.copy()
        environment.update(
            {
                "AFH_TEST_USER_PROFILE_ROOT": str(root / "home"),
                "AFH_TEST_LOCAL_APPDATA_ROOT": str(root / "local-app-data"),
                "AFH_TEST_ROAMING_APPDATA_ROOT": str(root / "roaming-app-data"),
                "AFH_PREREQ_PATH": str(probe),
                "AFH_NODE_HOME": str(root / "node-home"),
                "AFH_PNPM_HOME": str(root / "pnpm-home"),
                "AFH_SKIP_PERSIST_PATH": "1",
                "AFH_TEST_MODE": "1",
                "AFH_TEST_MACHINE_PATH": str(probe),
                "CARGO_HOME": str(root / "home" / "custom-cargo"),
                "RUSTUP_HOME": str(root / "home" / "custom-rustup"),
                "AFH_TEST_USER_CARGO_HOME": str(root / "home" / "custom-cargo"),
                "AFH_TEST_USER_RUSTUP_HOME": str(root / "home" / "custom-rustup"),
                "USERPROFILE": str(root / "home"),
            }
        )
        if not test_mode:
            environment.pop("AFH_TEST_MODE", None)
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
            add_base_tools(probe, git="2.35.8")
            command(probe / "winget.cmd", 'type nul > "%~dp0winget-called"')

            result = self.run_gate(root, probe, "-CheckOnly", "-Interfaces", "CLI")

            self.assertEqual(result.returncode, 20, result.stderr)
            self.assertIn("gate.git.status=upgrade-required", result.stdout)
            self.assertIn("gate.git.version=git version 2.35.8", result.stdout)
            self.assertFalse((probe / "winget-called").exists())

    def test_missing_rustup_blocks_even_when_rustc_and_cargo_exist(self) -> None:
        """Windows 门禁必须把 rustup 作为 Rust 工具链的必需组成，而不是只看编译器。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            add_base_tools(probe)
            (probe / "rustup.cmd").unlink()
            result = self.run_gate(root, probe, "-CheckOnly", "-Interfaces", "CLI")
            self.assertEqual(result.returncode, 20, result.stderr)
            self.assertIn("gate.rust.status=missing", result.stdout)
            self.assertIn("gate.rust.rustup_version=Missing", result.stdout)

    def test_rustc_verbose_release_mismatch_fails_closed(self) -> None:
        """Windows rustc -vV 的 release 不一致时必须按损坏工具链阻断。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            add_base_tools(probe)
            command(
                probe / "rustc.cmd",
                'if "%1"=="-vV" (echo rustc 1.98.1 ^(test^) & echo host: x86_64-pc-windows-msvc & echo release: 1.94.0 & exit /b 0)\r\n'
                "echo rustc 1.98.1 (test)",
            )
            result = self.run_gate(root, probe, "-CheckOnly", "-Interfaces", "CLI")
            self.assertEqual(result.returncode, 21)
            self.assertIn("release 与 rustc --version 不一致", result.stderr)

    def test_cargo_below_msrv_cannot_pass_with_new_rustc(self) -> None:
        """新 rustc 混入旧 cargo 时必须按损坏工具链失败关闭，不能判为通过。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            add_base_tools(probe, rust="1.99.0")
            command(probe / "cargo.cmd", "echo cargo 1.97.9 (test)")

            result = self.run_gate(root, probe, "-CheckOnly", "-Interfaces", "CLI")

            self.assertEqual(result.returncode, 21, result.stderr)
            self.assertIn("不属于同一 stable 工具链", result.stderr)

    def test_rust_version_uses_full_three_part_minimum_and_accepts_newer_releases(self) -> None:
        """Rust 只拒绝低于 1.98.1 的版本，补丁、次版本和主版本更高都直接通过。"""
        cases = (
            ("1.98.0", 20, "upgrade-required"),
            ("1.98.1", 0, "passed"),
            ("1.98.2", 0, "passed"),
            ("1.99.0", 0, "passed"),
            ("2.0.0", 0, "passed"),
        )
        for version, expected_code, expected_status in cases:
            with self.subTest(version=version), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                probe = root / "probe"
                add_base_tools(probe, rust=version)

                result = self.run_gate(root, probe, "-CheckOnly", "-Interfaces", "CLI")

                self.assertEqual(result.returncode, expected_code, result.stderr)
                self.assertIn(f"gate.rust.status={expected_status}", result.stdout)

    def test_node_version_is_a_continuous_minimum_not_an_even_major_allowlist(self) -> None:
        """Node 24.21.0 为连续下界，25、26 与未来正式版本无需安装即可通过。"""
        cases = (
            ("24.20.9", 20, "upgrade-required"),
            ("24.21.0", 0, "passed"),
            ("24.21.1", 0, "passed"),
            ("25.0.0", 0, "passed"),
            ("26.0.0", 0, "passed"),
            ("99.0.0", 0, "passed"),
        )
        for version, expected_code, expected_status in cases:
            with self.subTest(version=version), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                probe = root / "probe"
                add_base_tools(probe, node=version, pnpm="12.4.1")

                result = self.run_gate(root, probe, "-CheckOnly", "-Interfaces", "GUI")

                self.assertEqual(result.returncode, expected_code, result.stderr)
                self.assertIn(f"gate.node.status={expected_status}", result.stdout)

    def test_pnpm_version_uses_full_three_part_minimum_and_accepts_newer_releases(self) -> None:
        """pnpm 只拒绝低于 12.4.1 的版本，所有更高正式版本直接通过。"""
        cases = (
            ("12.4.0", 20, "upgrade-required"),
            ("12.4.1", 0, "passed"),
            ("12.4.2", 0, "passed"),
            ("12.5.0", 0, "passed"),
            ("13.0.0", 0, "passed"),
        )
        for version, expected_code, expected_status in cases:
            with self.subTest(version=version), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                probe = root / "probe"
                add_base_tools(probe, node="24.21.0", pnpm=version)

                result = self.run_gate(root, probe, "-CheckOnly", "-Interfaces", "GUI")

                self.assertEqual(result.returncode, expected_code, result.stderr)
                self.assertIn(f"gate.pnpm.status={expected_status}", result.stdout)

    def test_standard_rust_homes_are_respected_without_private_overrides(self) -> None:
        """标准 CARGO_HOME/RUSTUP_HOME 必须直达 Rust 命令，且不创建 Harness 私有根。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            log = root / "rust-env.log"
            add_base_tools(probe, rust="1.98.0")
            prefix = f'>> "{log}" echo %CARGO_HOME%^|%RUSTUP_HOME%\r\n'
            command(
                probe / "rustup.cmd",
                prefix
                + 'if "%1"=="toolchain" (type nul > "%~dp0rust-upgraded" & exit /b 0)\r\n'
                + 'if "%1"=="default" exit /b 0\r\n'
                + "echo rustup 1.28.2 (test)",
            )
            command(
                probe / "rustc.cmd",
                prefix
                + 'set "rust_version=1.98.0"\r\n'
                + 'if exist "%~dp0rust-upgraded" set "rust_version=1.98.1"\r\n'
                + 'if "%1"=="-vV" (echo rustc %rust_version% ^(test^) & echo host: x86_64-pc-windows-msvc & echo release: %rust_version% & exit /b 0)\r\n'
                + "echo rustc %rust_version% (test)",
            )
            command(
                probe / "cargo.cmd",
                prefix
                + 'if exist "%~dp0rust-upgraded" (echo cargo 1.98.1 (test^)) else (echo cargo 1.98.0 (test^))',
            )

            user_path_file = root / "user-path.txt"
            user_path_file.write_text(str(probe), encoding="utf-8")
            result = self.run_gate(
                root,
                probe,
                "-Interfaces",
                "CLI",
                AFH_SKIP_PERSIST_PATH="0",
                AFH_TEST_USER_PATH_FILE=str(user_path_file),
                AFH_TEST_MACHINE_PATH="",
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            expected = f"{root / 'home' / 'custom-cargo'}|{root / 'home' / 'custom-rustup'}".casefold()
            rows = [row.strip().casefold() for row in log.read_text(encoding="utf-8").splitlines() if row.strip()]
            self.assertTrue(rows)
            self.assertTrue(all(row == expected for row in rows), rows)
            self.assertTrue((root / "home" / "custom-cargo").is_dir())
            self.assertTrue((root / "home" / "custom-rustup").is_dir())
            self.assertFalse((root / "home" / "AgentFirstHarness").exists())
            self.assertIn("gate.fresh_shell.status=passed", result.stdout)

    def test_process_only_or_mismatched_custom_rust_homes_fail_before_install(self) -> None:
        """一次性或与 User 作用域不一致的 Rust home 不得被安装器当作可持久环境。"""
        cases = (
            ("", "", "只存在于当前进程"),
            ("persisted-cargo", "persisted-rustup", "不一致"),
        )
        for persisted_cargo, persisted_rustup, expected in cases:
            with self.subTest(expected=expected), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                probe = root / "probe"
                add_base_tools(probe, rust="1.98.0")
                command(
                    probe / "rustup.cmd",
                    'if "%1"=="toolchain" type nul > "%~dp0rust-install-called"\r\n'
                    "echo rustup 1.28.2 (test)",
                )
                result = self.run_gate(
                    root,
                    probe,
                    "-Interfaces",
                    "CLI",
                    AFH_TEST_USER_CARGO_HOME=(
                        str(root / "home" / persisted_cargo) if persisted_cargo else ""
                    ),
                    AFH_TEST_USER_RUSTUP_HOME=(
                        str(root / "home" / persisted_rustup) if persisted_rustup else ""
                    ),
                )

                self.assertEqual(result.returncode, 24, result.stderr)
                self.assertIn(expected, result.stderr)
                self.assertFalse((probe / "rust-install-called").exists())

    def test_path_separator_in_standard_or_managed_user_root_fails_before_install(self) -> None:
        """单一路径根夹带分号时不得被持久 PATH 拆成额外目录。"""
        cases = (
            {"AFH_TEST_USER_PROFILE_ROOT": f"{{root}};{{root}}\\foreign"},
            {"CARGO_HOME": f"{{root}}\\home\\cargo;{{root}}\\foreign"},
        )
        for overrides in cases:
            with self.subTest(overrides=overrides), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                probe = root / "probe"
                add_base_tools(probe, rust="1.98.0")
                command(
                    probe / "rustup.cmd",
                    'if "%1"=="toolchain" type nul > "%~dp0rust-install-called"\r\n'
                    "echo rustup 1.28.2 (test)",
                )
                expanded = {
                    name: value.format(root=root)
                    for name, value in overrides.items()
                }

                result = self.run_gate(root, probe, "-Interfaces", "CLI", **expanded)

                self.assertEqual(result.returncode, 24, result.stderr)
                self.assertIn("PATH 分隔符", result.stderr)
                self.assertFalse((probe / "rust-install-called").exists())

    def test_drive_or_root_relative_user_root_fails_before_install(self) -> None:
        """Windows drive-relative 与单斜杠 root-relative 根都不能被 cwd 吸收。"""
        for cargo_home in ("C:relative-cargo", "\\root-relative-cargo"):
            with self.subTest(cargo_home=cargo_home), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                probe = root / "probe"
                add_base_tools(probe, rust="1.98.0")
                command(
                    probe / "rustup.cmd",
                    'if "%1"=="toolchain" type nul > "%~dp0rust-install-called"\r\n'
                    "echo rustup 1.28.2 (test)",
                )

                result = self.run_gate(
                    root,
                    probe,
                    "-Interfaces",
                    "CLI",
                    CARGO_HOME=cargo_home,
                )

                self.assertEqual(result.returncode, 24, result.stderr)
                self.assertIn("完整绝对路径", result.stderr)
                self.assertFalse((probe / "rust-install-called").exists())

    def test_default_rust_homes_are_used_when_standard_variables_are_absent(self) -> None:
        """没有 CARGO_HOME/RUSTUP_HOME 时安装落在当前用户默认目录，而非 Harness 私有根。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            add_base_tools(probe, rust="1.98.0")
            command(
                probe / "rustc.cmd",
                'set "rust_version=1.98.0"\r\n'
                'if exist "%~dp0rust-upgraded" set "rust_version=1.98.1"\r\n'
                'if "%1"=="-vV" (echo rustc %rust_version% ^(test^) & echo host: x86_64-pc-windows-msvc & echo release: %rust_version% & exit /b 0)\r\n'
                "echo rustc %rust_version% (test)",
            )
            command(
                probe / "cargo.cmd",
                'if exist "%~dp0rust-upgraded" (echo cargo 1.98.1 (test^)) else (echo cargo 1.98.0 (test^))',
            )
            command(
                probe / "rustup.cmd",
                'if "%1"=="toolchain" (type nul > "%~dp0rust-upgraded" & exit /b 0)\r\n'
                'if "%1"=="default" exit /b 0\r\n'
                "echo rustup 1.28.2 (test)",
            )

            result = self.run_gate(
                root,
                probe,
                "-Interfaces",
                "CLI",
                CARGO_HOME="",
                RUSTUP_HOME="",
                AFH_TEST_USER_CARGO_HOME="",
                AFH_TEST_USER_RUSTUP_HOME="",
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue((root / "home" / ".cargo").is_dir())
            self.assertTrue((root / "home" / ".rustup").is_dir())

    def test_higher_installed_versions_pass_without_installation(self) -> None:
        """全部工具已高于门禁时不触发安装、PATH 持久化或 changed 状态。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            add_base_tools(probe, git="2.55.0", rust="2.0.0", node="26.8.2", pnpm="13.0.0")
            command(probe / "winget.cmd", 'type nul > "%~dp0unexpected-install"')

            result = self.run_gate(root, probe, "-Interfaces", "GUI")

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("gate.git.change=existing", result.stdout)
            self.assertIn("gate.rust.change=existing", result.stdout)
            self.assertIn("gate.node.change=existing", result.stdout)
            self.assertIn("gate.pnpm.change=existing", result.stdout)
            self.assertIn("gate.changed=false", result.stdout)
            self.assertFalse((probe / "unexpected-install").exists())

    def test_below_minimum_git_is_upgraded_and_reprobed(self) -> None:
        """旧 Git 通过唯一 winget 路线升级，复探达标后才返回成功。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            add_base_tools(probe, git="2.35.8")
            command(
                probe / "git.cmd",
                'if exist "%~dp0git-upgraded" (echo git version 2.51.0) else (echo git version 2.35.8)',
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
            add_base_tools(probe, git="2.35.8")
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
            add_base_tools(probe, rust="1.98.0")
            command(
                probe / "rustc.cmd",
                'set "rust_version=1.98.0"\r\n'
                'if exist "%~dp0rust-upgraded" set "rust_version=1.98.1"\r\n'
                'if "%1"=="-vV" (echo rustc %rust_version% ^(test^) & echo host: x86_64-pc-windows-msvc & echo release: %rust_version% & exit /b 0)\r\n'
                "echo rustc %rust_version% (test)",
            )
            command(
                probe / "cargo.cmd",
                'if exist "%~dp0rust-upgraded" (echo cargo 1.98.1 (test^)) else (echo cargo 1.98.0 (test^))',
            )
            command(
                probe / "rustup.cmd",
                'if "%1"=="toolchain" (type nul > "%~dp0rust-upgraded" & exit /b 0)\r\n'
                'if "%1"=="default" exit /b 0\r\n'
                "echo rustup 1.28.2 (test)",
            )

            user_path_file = root / "user-path.txt"
            drive_root = Path(root.anchor)
            unc_root = "\\\\server\\share\\"
            user_path_file.write_text(
                f";bin;..\\evil;.;C:relative;{drive_root};{probe};{unc_root};{drive_root};{probe};;",
                encoding="utf-8",
            )
            result = self.run_gate(
                root,
                probe,
                "-Interfaces",
                "CLI",
                AFH_SKIP_PERSIST_PATH="0",
                AFH_TEST_USER_PATH_FILE=str(user_path_file),
                AFH_TEST_MACHINE_PATH="",
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("gate.rust.version=rustc 1.98.1 (test)", result.stdout)
            self.assertIn("gate.rust.change=upgraded", result.stdout)
            self.assertIn("gate.changed=true", result.stdout)
            persisted_entries = [entry for entry in user_path_file.read_text(encoding="utf-8").split(";") if entry]
            self.assertEqual(persisted_entries, [str(probe), str(drive_root), unc_root])
            self.assertIn("gate.fresh_shell.status=passed", result.stdout)

    def test_machine_rust_shadow_is_rejected_before_user_upgrade(self) -> None:
        """Machine PATH 的旧 Rust 会遮蔽用户级升级目标，必须在 rustup 写入前停止。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            add_base_tools(probe, rust="1.98.0")
            command(
                probe / "rustup.cmd",
                'if "%1"=="toolchain" type nul > "%~dp0rust-install-called"\r\n'
                "echo rustup 1.28.2 (test)",
            )
            user_path_file = root / "user-path.txt"
            user_path_file.write_text("", encoding="utf-8")

            result = self.run_gate(
                root,
                probe,
                "-Interfaces",
                "CLI",
                AFH_SKIP_PERSIST_PATH="0",
                AFH_TEST_USER_PATH_FILE=str(user_path_file),
                AFH_TEST_MACHINE_PATH=str(probe),
            )

            self.assertEqual(result.returncode, 24, result.stderr)
            self.assertIn("Machine PATH 中的 rustup 会遮蔽", result.stderr)
            self.assertFalse((probe / "rust-install-called").exists())
            self.assertEqual(user_path_file.read_text(encoding="utf-8"), "")

    def test_only_git_change_requires_exact_fresh_powershell_discovery(self) -> None:
        """仅 Git 待升级时，已通过工具先预检持久身份，安装后再做完整新会话复探。"""
        for globally_visible in (True, False):
            with self.subTest(globally_visible=globally_visible), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                probe = root / "probe"
                add_base_tools(probe, git="2.35.8")
                command(
                    probe / "git.cmd",
                    'if exist "%~dp0git-upgraded" (echo git version 2.51.0) else (echo git version 2.35.8)',
                )
                command(probe / "winget.cmd", 'type nul > "%~dp0git-upgraded"')
                user_path_file = root / "user-path.txt"
                user_path_file.write_text("", encoding="utf-8")

                result = self.run_gate(
                    root,
                    probe,
                    "-Interfaces",
                    "CLI",
                    AFH_SKIP_PERSIST_PATH="0",
                    AFH_TEST_USER_PATH_FILE=str(user_path_file),
                    AFH_TEST_MACHINE_PATH=str(probe) if globally_visible else "relative\\probe",
                )

                if globally_visible:
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertIn("gate.git.change=upgraded", result.stdout)
                    self.assertIn("gate.fresh_shell.status=passed", result.stdout)
                else:
                    self.assertEqual(result.returncode, 24, result.stderr)
                    self.assertIn("持久 User/Machine PATH 无法解析当前已通过的 rustup", result.stderr)
                    self.assertFalse((probe / "git-upgraded").exists())

    def test_rust_upgrade_persists_all_split_tool_directories(self) -> None:
        """rustup、rustc、cargo 分处不同目录时也必须全部进入 User PATH 并可由新进程发现。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            add_base_tools(probe)
            for name in ("rustup.cmd", "rustc.cmd", "cargo.cmd"):
                (probe / name).unlink()
            rustup_bin = root / "rustup-bin"
            rustc_bin = root / "rustc-bin"
            cargo_bin = root / "cargo-bin"
            state = root / "rust-upgraded"
            command(
                rustup_bin / "rustup.cmd",
                f'if "%1"=="toolchain" (type nul > "{state}" & exit /b 0)\r\n'
                'if "%1"=="default" exit /b 0\r\n'
                "echo rustup 1.28.2 (test)",
            )
            command(
                rustc_bin / "rustc.cmd",
                'set "rust_version=1.98.0"\r\n'
                f'if exist "{state}" set "rust_version=1.98.1"\r\n'
                'if "%1"=="-vV" (echo rustc %rust_version% ^(test^) & echo host: x86_64-pc-windows-msvc & echo release: %rust_version% & exit /b 0)\r\n'
                "echo rustc %rust_version% (test)",
            )
            command(
                cargo_bin / "cargo.cmd",
                f'if exist "{state}" (echo cargo 1.98.1 (test^)) else (echo cargo 1.98.0 (test^))',
            )
            user_path_file = root / "user-path.txt"
            user_path_file.write_text(";;", encoding="utf-8")
            tool_probe = ";".join(map(str, (probe, rustup_bin, rustc_bin, cargo_bin)))
            result = self.run_gate(
                root,
                probe,
                "-Interfaces",
                "CLI",
                AFH_PREREQ_PATH=tool_probe,
                AFH_SKIP_PERSIST_PATH="0",
                AFH_TEST_USER_PATH_FILE=str(user_path_file),
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            persisted = user_path_file.read_text(encoding="utf-8").split(";")
            self.assertEqual(persisted, [str(rustup_bin), str(rustc_bin), str(cargo_bin)])
            self.assertIn("gate.fresh_shell.status=passed", result.stdout)

    def test_below_minimum_node_is_upgraded_from_verified_archive(self) -> None:
        """GUI 的旧 Node 使用当前 Windows 官方形态制品升级并通过摘要复探。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            add_base_tools(probe, node="22.16.0", pnpm="12.4.1")
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
            self.assertIn("gate.node.version=v24.21.1", result.stdout)
            self.assertIn("gate.node.change=upgraded", result.stdout)
            self.assertIn("gate.changed=true", result.stdout)

    def test_existing_selected_node_directory_must_match_verified_version(self) -> None:
        """带匹配摘要 marker 的 LTS 目录若实际版本不同，必须在归档下载前失败。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            add_base_tools(probe, node="22.16.0", pnpm="12.4.1")
            dist_root = root / "node-dist"
            node_dist = make_node_dist(dist_root)
            archive = next((dist_root / "v24.21.1").glob("*.zip"))
            digest = hashlib.sha256(archive.read_bytes()).hexdigest()
            archive.unlink()
            install = root / "node-home" / "v24.21.1"
            command(install / "node.cmd", "echo v24.21.0")
            command(install / "npm.cmd", "echo 11.6.0")
            (install / ".agent-first-harness-managed").write_text(
                "managed by agent-first-harness development environment gate\n"
                "node.version=v24.21.1\n"
                f"node.archive.sha256={digest}\n",
                encoding="utf-8",
            )

            result = self.run_gate(
                root,
                probe,
                "-Interfaces",
                "GUI",
                AFH_ALLOW_FILE_URLS="1",
                AFH_NODE_DIST_BASE=node_dist,
            )

            self.assertEqual(result.returncode, 26, result.stderr)
            self.assertIn("版本与已选择稳定版不一致", result.stderr)

    def test_below_minimum_pnpm_is_upgraded_and_reprobed(self) -> None:
        """GUI 的旧 pnpm 通过当前 Node 的 npm 升级并重新探测。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            add_base_tools(probe, node="26.0.0", pnpm="11.23.9")
            command(
                probe / "pnpm.cmd",
                'if exist "%~dp0pnpm-upgraded" (echo 12.4.1) else (echo 11.23.9)',
            )
            command(
                probe / "npm.cmd",
                'if "%~1"=="--version" echo 11.6.0\r\n'
                'if "%~1"=="--version" exit /b 0\r\n'
                'if not "%~5"=="pnpm@>=12.4.1" exit /b 91\r\n'
                'if not "%~6"=="--registry" exit /b 92\r\n'
                'if not "%~7"=="%AFH_PNPM_REGISTRY%" exit /b 93\r\n'
                'if not "%~8"=="--ignore-scripts" exit /b 94\r\n'
                'if not exist "%~4" mkdir "%~4"\r\n'
                '> "%~4\\pnpm.cmd" echo @echo off\r\n'
                '>> "%~4\\pnpm.cmd" echo echo 12.4.1\r\n'
                'type nul > "%~dp0pnpm-upgraded"',
            )

            result = self.run_gate(
                root,
                probe,
                "-Interfaces",
                "GUI",
                AFH_PNPM_REGISTRY="https://registry.example.invalid/",
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("gate.pnpm.version=12.4.1", result.stdout)
            self.assertIn("gate.pnpm.change=upgraded", result.stdout)
            self.assertIn("gate.changed=true", result.stdout)
            self.assertFalse((root / "12.4.1").exists())
            self.assertFalse((root / "=12.4.1").exists())

    def test_node_and_pnpm_are_discoverable_from_persisted_user_path(self) -> None:
        """缺失前端工具安装后，新 PowerShell 会话必须仅靠持久用户 PATH 发现它们。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            add_base_tools(probe)
            node_dist = make_node_dist(root / "node-dist")
            foreign_node_bin = root / "node-home" / "foreign-version"
            foreign_node_bin.mkdir(parents=True)
            user_path_file = root / "user-path.txt"
            user_path_file.write_text(f";{foreign_node_bin};;", encoding="utf-8")

            result = self.run_gate(
                root,
                probe,
                "-Interfaces",
                "GUI",
                AFH_ALLOW_FILE_URLS="1",
                AFH_NODE_DIST_BASE=node_dist,
                AFH_SKIP_PERSIST_PATH="0",
                AFH_TEST_USER_PATH_FILE=str(user_path_file),
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            persisted_entries = [entry for entry in user_path_file.read_text(encoding="utf-8").split(";") if entry]
            self.assertEqual(len(persisted_entries), len({entry.casefold() for entry in persisted_entries}))
            self.assertTrue(any(entry.endswith("node-home\\v24.21.1") for entry in persisted_entries))
            self.assertTrue(any(entry.endswith("pnpm-home") for entry in persisted_entries))
            self.assertIn(str(foreign_node_bin), persisted_entries)
            self.assertIn("gate.fresh_shell.status=passed", result.stdout)

    def test_machine_path_old_node_cannot_be_hidden_by_user_first_probe_order(self) -> None:
        """Machine PATH 的旧 Node 会在真实新会话中遮蔽用户安装，门禁必须失败而非假通过。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            add_base_tools(probe, node="22.16.0", pnpm="12.4.1")
            node_dist = make_node_dist(root / "node-dist")
            user_path_file = root / "user-path.txt"
            user_path_file.write_text("", encoding="utf-8")

            result = self.run_gate(
                root,
                probe,
                "-Interfaces",
                "GUI",
                AFH_ALLOW_FILE_URLS="1",
                AFH_NODE_DIST_BASE=node_dist,
                AFH_SKIP_PERSIST_PATH="0",
                AFH_TEST_USER_PATH_FILE=str(user_path_file),
                AFH_TEST_MACHINE_PATH=str(probe),
            )

            self.assertEqual(result.returncode, 24, result.stderr)
            self.assertIn("Machine PATH 中的 node 会遮蔽", result.stderr)
            self.assertFalse((root / "node-home").exists())
            self.assertEqual(user_path_file.read_text(encoding="utf-8"), "")

    def test_existing_node_machine_shadow_is_preflighted_when_only_pnpm_changes(self) -> None:
        """当前进程 Node 通过也不能掩盖持久 Machine PATH 的另一份旧 Node。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            add_base_tools(probe, node="26.0.0")
            machine = root / "machine"
            command(machine / "node.cmd", "echo v22.16.0")
            command(machine / "npm.cmd", "echo 10.0.0")
            user_path_file = root / "user-path.txt"
            user_path_file.write_text(str(probe), encoding="utf-8")

            result = self.run_gate(
                root,
                probe,
                "-Interfaces",
                "GUI",
                AFH_SKIP_PERSIST_PATH="0",
                AFH_TEST_USER_PATH_FILE=str(user_path_file),
                AFH_TEST_MACHINE_PATH=str(machine),
            )

            self.assertEqual(result.returncode, 24, result.stderr)
            self.assertIn("持久 User/Machine PATH 解析的 node", result.stderr)
            self.assertFalse((root / "pnpm-home").exists())
            self.assertEqual(user_path_file.read_text(encoding="utf-8"), str(probe))

    def test_each_passed_tool_must_be_identical_on_persisted_path_before_install(self) -> None:
        """瞬时探测路径中的已通过工具不能为另一项安装提供虚假的持久环境。"""
        for transient_name in ("git", "rustup", "rustc", "cargo", "node", "npm", "pnpm"):
            with self.subTest(tool=transient_name), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                persisted = root / "persisted"
                transient = root / "transient"
                transient.mkdir(parents=True)
                add_base_tools(persisted, node="26.0.0", pnpm="12.4.1")
                unexpected_install = root / "unexpected-install"
                command(
                    persisted / "npm.cmd",
                    'if "%~1"=="--version" (echo 11.6.0 & exit /b 0)\r\n'
                    f'type nul > "{unexpected_install}"',
                )

                if transient_name == "pnpm":
                    command(persisted / "git.cmd", "echo git version 2.35.8")
                    command(persisted / "winget.cmd", f'type nul > "{unexpected_install}"')
                else:
                    (persisted / "pnpm.cmd").unlink()

                (persisted / f"{transient_name}.cmd").replace(
                    transient / f"{transient_name}.cmd"
                )
                user_path_file = root / "user-path.txt"
                user_path_file.write_text(str(persisted), encoding="utf-8")
                probe_path = f"{persisted};{transient}"

                result = self.run_gate(
                    root,
                    persisted,
                    "-Interfaces",
                    "GUI",
                    AFH_PREREQ_PATH=probe_path,
                    AFH_SKIP_PERSIST_PATH="0",
                    AFH_TEST_USER_PATH_FILE=str(user_path_file),
                    AFH_TEST_MACHINE_PATH="",
                )

                self.assertEqual(result.returncode, 24, result.stderr)
                self.assertIn(f"当前已通过的 {transient_name}", result.stderr)
                self.assertFalse(unexpected_install.exists())
                self.assertFalse((root / "pnpm-home").exists())
                self.assertEqual(user_path_file.read_text(encoding="utf-8"), str(persisted))

    def test_missing_current_tool_rejects_persisted_existing_identity_before_install(self) -> None:
        """当前探测缺失但持久 PATH 已有工具时，不能忽略现有高版本后另装一份。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            persisted = root / "persisted"
            add_base_tools(probe, node="26.0.0")
            command(persisted / "pnpm.cmd", "echo 13.0.0")
            unexpected_install = root / "unexpected-install"
            command(
                probe / "npm.cmd",
                'if "%~1"=="--version" (echo 11.6.0 & exit /b 0)\r\n'
                f'type nul > "{unexpected_install}"\r\n'
                "exit /b 98",
            )
            user_path_file = root / "user-path.txt"
            original_user_path = f"{probe};{persisted}"
            user_path_file.write_text(original_user_path, encoding="utf-8")

            result = self.run_gate(
                root,
                probe,
                "-Interfaces",
                "GUI",
                AFH_SKIP_PERSIST_PATH="0",
                AFH_TEST_USER_PATH_FILE=str(user_path_file),
                AFH_TEST_MACHINE_PATH="",
            )

            self.assertEqual(result.returncode, 24, result.stderr)
            self.assertIn("当前探测未找到 pnpm，但持久 User/Machine PATH 已解析到现有工具", result.stderr)
            self.assertFalse(unexpected_install.exists())
            self.assertFalse((root / "pnpm-home").exists())
            self.assertEqual(user_path_file.read_text(encoding="utf-8"), original_user_path)

    def test_pending_current_tool_rejects_different_persisted_identity_before_install(self) -> None:
        """当前低版本与持久 PATH 高版本路径不同时，不能安装并前置另一版本。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            persisted = root / "persisted"
            add_base_tools(probe, node="26.0.0", pnpm="11.23.9")
            command(persisted / "pnpm.cmd", "echo 13.0.0")
            unexpected_install = root / "unexpected-install"
            command(
                probe / "npm.cmd",
                'if "%~1"=="--version" (echo 11.6.0 & exit /b 0)\r\n'
                f'type nul > "{unexpected_install}"\r\n'
                "exit /b 98",
            )
            user_path_file = root / "user-path.txt"
            original_user_path = f"{persisted};{probe}"
            user_path_file.write_text(original_user_path, encoding="utf-8")

            result = self.run_gate(
                root,
                probe,
                "-Interfaces",
                "GUI",
                AFH_SKIP_PERSIST_PATH="0",
                AFH_TEST_USER_PATH_FILE=str(user_path_file),
                AFH_TEST_MACHINE_PATH="",
            )

            self.assertEqual(result.returncode, 24, result.stderr)
            self.assertIn("持久 User/Machine PATH 解析的待恢复 pnpm 与当前探测工具路径不一致", result.stderr)
            self.assertFalse(unexpected_install.exists())
            self.assertFalse((root / "pnpm-home").exists())
            self.assertEqual(user_path_file.read_text(encoding="utf-8"), original_user_path)

    def test_projected_pnpm_path_cannot_shadow_passed_node_before_npm_install(self) -> None:
        """标准 pnpm 前缀将遮蔽已通过 Node 时，必须在 npm 写入前失败。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            add_base_tools(probe, node="26.0.0")
            command(root / "pnpm-home" / "node.cmd", "echo v24.21.0")
            unexpected_install = root / "unexpected-install"
            command(
                probe / "npm.cmd",
                'if "%~1"=="--version" (echo 11.6.0 & exit /b 0)\r\n'
                f'type nul > "{unexpected_install}"\r\n'
                "exit /b 98",
            )
            user_path_file = root / "user-path.txt"
            original_user_path = str(probe)
            user_path_file.write_text(original_user_path, encoding="utf-8")

            result = self.run_gate(
                root,
                probe,
                "-Interfaces",
                "GUI",
                AFH_SKIP_PERSIST_PATH="0",
                AFH_TEST_USER_PATH_FILE=str(user_path_file),
                AFH_TEST_MACHINE_PATH="",
            )

            self.assertEqual(result.returncode, 24, result.stderr)
            self.assertIn("pnpm 当前用户全局前缀包含意外的 node", result.stderr)
            self.assertFalse(unexpected_install.exists())
            self.assertEqual(user_path_file.read_text(encoding="utf-8"), original_user_path)

    def test_projected_pnpm_path_rejects_foreign_node_when_node_is_also_pending(self) -> None:
        """Node 与 pnpm 同时待处理时，pnpm 前缀夹带的 Node 也必须在任何安装前阻断。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            add_base_tools(probe, node="22.16.0")
            command(root / "pnpm-home" / "node.cmd", "echo v24.21.0")
            unexpected_install = root / "unexpected-install"
            command(
                probe / "npm.cmd",
                'if "%~1"=="--version" (echo 11.6.0 & exit /b 0)\r\n'
                f'type nul > "{unexpected_install}"\r\n'
                "exit /b 98",
            )
            user_path_file = root / "user-path.txt"
            original_user_path = str(probe)
            user_path_file.write_text(original_user_path, encoding="utf-8")

            result = self.run_gate(
                root,
                probe,
                "-Interfaces",
                "GUI",
                AFH_ALLOW_FILE_URLS="1",
                AFH_NODE_DIST_BASE=(root / "unreachable-node-dist").as_uri(),
                AFH_SKIP_PERSIST_PATH="0",
                AFH_TEST_USER_PATH_FILE=str(user_path_file),
                AFH_TEST_MACHINE_PATH="",
            )

            self.assertEqual(result.returncode, 24, result.stderr)
            self.assertIn("pnpm 当前用户全局前缀包含意外的 node", result.stderr)
            self.assertFalse(unexpected_install.exists())
            self.assertFalse((root / "node-home").exists())
            self.assertEqual(user_path_file.read_text(encoding="utf-8"), original_user_path)

    def test_projected_rust_upgrade_paths_are_checked_before_rustup_runs(self) -> None:
        """Rust 升级会持久化既有 rustup 目录，目录内的 Node 遮蔽必须在 rustup 前发现。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            rustup_bin = root / "rustup-bin"
            rustc_bin = root / "rustc-bin"
            cargo_bin = root / "cargo-bin"
            add_base_tools(probe, rust="1.97.0", node="26.0.0", pnpm="12.4.1")
            for tool_name, destination in (
                ("rustup", rustup_bin),
                ("rustc", rustc_bin),
                ("cargo", cargo_bin),
            ):
                destination.mkdir()
                (probe / f"{tool_name}.cmd").replace(destination / f"{tool_name}.cmd")
            unexpected_rustup = root / "unexpected-rustup"
            command(
                rustup_bin / "rustup.cmd",
                'if "%~1"=="--version" (echo rustup 1.28.2 ^(test^) & exit /b 0)\r\n'
                f'type nul > "{unexpected_rustup}"\r\n'
                "exit /b 98",
            )
            command(rustc_bin / "node.cmd", "echo v24.21.0")
            user_path_file = root / "user-path.txt"
            original_user_path = str(probe)
            user_path_file.write_text(original_user_path, encoding="utf-8")

            result = self.run_gate(
                root,
                probe,
                "-Interfaces",
                "GUI",
                AFH_PREREQ_PATH=";".join(
                    map(str, (probe, rustup_bin, rustc_bin, cargo_bin))
                ),
                AFH_SKIP_PERSIST_PATH="0",
                AFH_TEST_USER_PATH_FILE=str(user_path_file),
                AFH_TEST_MACHINE_PATH="",
            )

            self.assertEqual(result.returncode, 24, result.stderr)
            self.assertIn("Rust 持久 PATH 目录包含意外的 node", result.stderr)
            self.assertFalse(unexpected_rustup.exists())
            self.assertEqual(user_path_file.read_text(encoding="utf-8"), original_user_path)

    def test_projected_new_node_path_cannot_shadow_passed_pnpm_or_rust(self) -> None:
        """新 Node 版本目录若夹带同名工具，不得在 User PATH 前置后遮蔽既有 pnpm/Rust。"""
        cases = (
            ("pnpm.cmd", "echo 99.0.0", "pnpm"),
            ("cargo.cmd", "echo cargo 99.0.0 (test)", "cargo"),
        )
        for wrapper_name, wrapper_body, tool_name in cases:
            with self.subTest(tool=tool_name), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                probe = root / "probe"
                add_base_tools(probe, node="22.16.0", pnpm="12.4.1")
                original_tool_bytes = (probe / f"{tool_name}.cmd").read_bytes()
                node_dist = make_node_dist(
                    root / "node-dist",
                    extra_files={wrapper_name: f"@echo off\r\n{wrapper_body}\r\n"},
                )
                user_path_file = root / "user-path.txt"
                original_user_path = str(probe)
                user_path_file.write_text(original_user_path, encoding="utf-8")

                result = self.run_gate(
                    root,
                    probe,
                    "-Interfaces",
                    "GUI",
                    AFH_ALLOW_FILE_URLS="1",
                    AFH_NODE_DIST_BASE=node_dist,
                    AFH_SKIP_PERSIST_PATH="0",
                    AFH_TEST_USER_PATH_FILE=str(user_path_file),
                    AFH_TEST_MACHINE_PATH="",
                )

                self.assertEqual(result.returncode, 24, result.stderr)
                self.assertIn(
                    f"按即将写入的 User PATH 顺序，{tool_name} 将不再解析到当前已通过工具",
                    result.stderr,
                )
                self.assertFalse((root / "node-home" / "v24.21.1").exists())
                self.assertEqual((probe / f"{tool_name}.cmd").read_bytes(), original_tool_bytes)
                self.assertEqual(user_path_file.read_text(encoding="utf-8"), original_user_path)

    def test_managed_node_npm_reparse_wrapper_is_rejected_before_pnpm_install(self) -> None:
        """实际优先解析的 npm.ps1 若越界，必须在 npm install 前失败且不改外部目标。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            node_version = root / "node-home" / "v26.0.0"
            add_base_tools(probe)
            command(node_version / "node.cmd", "echo v26.0.0")
            command(node_version / "npm.cmd", "echo 11.6.0")
            (node_version / ".agent-first-harness-managed").write_text(
                "managed by agent-first-harness development environment gate\n"
                "node.version=v26.0.0\n"
                f"node.archive.sha256={'0' * 64}\n",
                encoding="utf-8",
            )
            external_npm = root / "outside" / "npm.ps1"
            external_npm.parent.mkdir(parents=True)
            external_npm.write_text(
                "if ($args.Count -eq 1 -and $args[0] -eq '--version') { Write-Output '11.6.0'; exit 0 }\n"
                "Add-Content -LiteralPath $PSCommandPath -Value '# mutated'\n"
                "exit 98\n",
                encoding="utf-8",
            )
            original_external_bytes = external_npm.read_bytes()
            if not make_file_symlink(node_version / "npm.ps1", external_npm):
                self.skipTest("当前 Windows 宿主不能建立测试文件 symlink")
            user_path_file = root / "user-path.txt"
            probe_path = f"{node_version};{probe}"
            user_path_file.write_text(probe_path, encoding="utf-8")

            result = self.run_gate(
                root,
                probe,
                "-Interfaces",
                "GUI",
                AFH_PREREQ_PATH=probe_path,
                AFH_ALLOW_FILE_URLS="1",
                AFH_SKIP_PERSIST_PATH="0",
                AFH_TEST_USER_PATH_FILE=str(user_path_file),
                AFH_TEST_MACHINE_PATH="",
            )

            self.assertEqual(result.returncode, 26, result.stderr)
            self.assertRegex(
                result.stderr,
                r"npm wrapper (?:必须是非 reparse point 的普通文件|不在受管目录内)",
            )
            self.assertIn("npm.ps1", result.stderr)
            self.assertEqual(external_npm.read_bytes(), original_external_bytes)
            self.assertFalse((root / "pnpm-home").exists())
            self.assertEqual(user_path_file.read_text(encoding="utf-8"), probe_path)

    def test_pnpm_prefix_reparse_wrappers_are_rejected_before_npm_install(self) -> None:
        """pnpm/pnpx 的执行或覆盖 wrapper 越界时必须零写入失败关闭。"""
        for wrapper_name in ("pnpm.ps1", "pnpx.cmd"):
            with self.subTest(wrapper=wrapper_name), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                probe = root / "probe"
                add_base_tools(probe, node="26.0.0")
                unexpected_install = root / "unexpected-install"
                command(
                    probe / "npm.cmd",
                    'if "%~1"=="--version" (echo 11.6.0 & exit /b 0)\r\n'
                    f'type nul > "{unexpected_install}"\r\n'
                    "exit /b 98",
                )
                external_wrapper = root / "outside" / wrapper_name
                external_wrapper.parent.mkdir(parents=True)
                external_wrapper.write_bytes(b"protected external wrapper\r\n")
                original_external_bytes = external_wrapper.read_bytes()
                managed_wrapper = root / "pnpm-home" / wrapper_name
                if not make_file_symlink(managed_wrapper, external_wrapper):
                    self.skipTest("当前 Windows 宿主不能建立测试文件 symlink")
                user_path_file = root / "user-path.txt"
                user_path_file.write_text(str(probe), encoding="utf-8")

                result = self.run_gate(
                    root,
                    probe,
                    "-Interfaces",
                    "GUI",
                    AFH_SKIP_PERSIST_PATH="0",
                    AFH_TEST_USER_PATH_FILE=str(user_path_file),
                    AFH_TEST_MACHINE_PATH="",
                )

                self.assertEqual(result.returncode, 28, result.stderr)
                self.assertIn(f"pnpm 用户级 wrapper {wrapper_name}", result.stderr)
                self.assertIn("非 reparse point 的普通文件", result.stderr)
                self.assertEqual(external_wrapper.read_bytes(), original_external_bytes)
                self.assertFalse(unexpected_install.exists())
                self.assertEqual(user_path_file.read_text(encoding="utf-8"), str(probe))

    def test_persisted_rust_host_is_reprobed_before_another_tool_is_installed(self) -> None:
        """路径相同也要从持久 PATH 重跑 rustc -vV，host 变化必须零副作用失败。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            marker = root / "current-marker"
            marker.mkdir()
            add_base_tools(probe, node="26.0.0")
            command(
                probe / "rustc.cmd",
                'set "rust_host=aarch64-pc-windows-msvc"\r\n'
                'if not "%PATH:current-marker=%"=="%PATH%" set "rust_host=x86_64-pc-windows-msvc"\r\n'
                'if "%1"=="-vV" (echo rustc 1.98.1 ^(test^) & echo host: %rust_host% & echo release: 1.98.1 & exit /b 0)\r\n'
                "echo rustc 1.98.1 (test)",
            )
            unexpected_install = root / "unexpected-install"
            command(
                probe / "npm.cmd",
                'if "%~1"=="--version" (echo 11.6.0 & exit /b 0)\r\n'
                f'type nul > "{unexpected_install}"',
            )
            user_path_file = root / "user-path.txt"
            user_path_file.write_text(str(probe), encoding="utf-8")

            result = self.run_gate(
                root,
                probe,
                "-Interfaces",
                "GUI",
                PATH=f"{marker};{os.environ.get('PATH', '')}",
                AFH_SKIP_PERSIST_PATH="0",
                AFH_TEST_USER_PATH_FILE=str(user_path_file),
                AFH_TEST_MACHINE_PATH="",
            )

            self.assertEqual(result.returncode, 24, result.stderr)
            self.assertIn("rustc release 或 host", result.stderr)
            self.assertFalse(unexpected_install.exists())
            self.assertFalse((root / "pnpm-home").exists())
            self.assertEqual(user_path_file.read_text(encoding="utf-8"), str(probe))

    def test_persisted_version_is_reprobed_before_another_tool_is_installed(self) -> None:
        """路径相同但依赖瞬时 PATH 才呈现当前版本时，也必须在安装前失败。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            marker = root / "current-marker"
            marker.mkdir()
            add_base_tools(probe, node="26.0.0")
            command(
                probe / "npm.cmd",
                'if not "%PATH:current-marker=%"=="%PATH%" (echo 11.6.0 & exit /b 0)\r\n'
                'if "%~1"=="--version" (echo 11.5.0 & exit /b 0)\r\n'
                f'type nul > "{root / "unexpected-install"}"',
            )
            user_path_file = root / "user-path.txt"
            user_path_file.write_text(str(probe), encoding="utf-8")

            result = self.run_gate(
                root,
                probe,
                "-Interfaces",
                "GUI",
                PATH=f"{marker};{os.environ.get('PATH', '')}",
                AFH_SKIP_PERSIST_PATH="0",
                AFH_TEST_USER_PATH_FILE=str(user_path_file),
                AFH_TEST_MACHINE_PATH="",
            )

            self.assertEqual(result.returncode, 24, result.stderr)
            self.assertIn("npm 版本与当前已通过版本不一致", result.stderr)
            self.assertFalse((root / "unexpected-install").exists())
            self.assertFalse((root / "pnpm-home").exists())
            self.assertEqual(user_path_file.read_text(encoding="utf-8"), str(probe))

    def test_malformed_managed_node_version_is_rejected_before_index_download(self) -> None:
        """版本形态目录缺少 marker 时必须在读取远端索引及任何其他安装前失败。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            add_base_tools(probe, node="22.16.0", pnpm="12.4.1")
            install = root / "node-home" / "v24.21.1"
            command(install / "node.cmd", "echo v24.21.1")
            command(install / "npm.cmd", "echo 11.6.0")

            result = self.run_gate(
                root,
                probe,
                "-Interfaces",
                "GUI",
                AFH_ALLOW_FILE_URLS="1",
                AFH_NODE_DIST_BASE=(root / "unreachable-node-dist").as_uri(),
            )

            self.assertEqual(result.returncode, 26, result.stderr)
            self.assertIn("缺少有效受管所有权标记", result.stderr)

    def test_selected_node_marker_is_verified_before_archive_download(self) -> None:
        """结构合法但摘要不符的已选目标必须在下载缺失归档前失败。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            add_base_tools(probe, node="22.16.0", pnpm="12.4.1")
            dist_root = root / "node-dist"
            node_dist = make_node_dist(dist_root)
            next((dist_root / "v24.21.1").glob("*.zip")).unlink()
            install = root / "node-home" / "v24.21.1"
            command(install / "node.cmd", "echo v24.21.1")
            command(install / "npm.cmd", "echo 11.6.0")
            (install / ".agent-first-harness-managed").write_text(
                "managed by agent-first-harness development environment gate\n"
                "node.version=v24.21.1\n"
                f"node.archive.sha256={'0' * 64}\n",
                encoding="utf-8",
            )

            result = self.run_gate(
                root,
                probe,
                "-Interfaces",
                "GUI",
                AFH_ALLOW_FILE_URLS="1",
                AFH_NODE_DIST_BASE=node_dist,
            )

            self.assertEqual(result.returncode, 26, result.stderr)
            self.assertIn("缺少有效受管所有权标记", result.stderr)

    def test_node_reparse_root_fails_before_archive_download(self) -> None:
        """Node 当前用户安装根若是 junction，必须在任何下载前失败关闭。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            add_base_tools(probe, node="22.0.0", pnpm="12.4.1")
            outside = root / "outside"
            outside.mkdir()
            junction = root / "node-home"
            created = subprocess.run(
                ["cmd", "/c", "mklink", "/J", str(junction), str(outside)],
                text=True,
                capture_output=True,
                check=False,
            )
            if created.returncode != 0:
                self.skipTest("当前 Windows 宿主不能建立测试 junction")

            result = self.run_gate(
                root,
                probe,
                "-Interfaces",
                "GUI",
                AFH_NODE_DIST_BASE=(root / "unreachable-node-dist").as_uri(),
                AFH_ALLOW_FILE_URLS="1",
            )

            self.assertEqual(result.returncode, 24, result.stderr)
            self.assertIn("reparse point", result.stderr)
            self.assertEqual(list(outside.iterdir()), [])

    def test_user_path_write_broadcasts_windows_environment_change(self) -> None:
        """真实 User PATH 写入必须广播 WM_SETTINGCHANGE，避免新桌面会话继承旧 PATH。"""
        source = SCRIPT.read_text(encoding="utf-8")
        self.assertIn("SendMessageTimeout", source)
        self.assertIn('"Environment"', source)
        self.assertIn("0x001A", source)
        self.assertIn("function Test-FreshPowerShellToolDiscovery", source)
        self.assertIn('[Environment]::GetEnvironmentVariable("Path", "Machine")', source)
        self.assertIn('foreach (`$pathValue in @(`$machinePath, `$userPath))', source)
        self.assertIn("-EncodedCommand", source)
        self.assertIn("-not [IO.Path]::IsPathRooted", source)
        self.assertNotIn("[string[]]$OwnedRoots", source)

    def test_test_overrides_require_explicit_test_mode(self) -> None:
        """未显式启用 AFH_TEST_MODE 时，探测/下载覆盖必须在执行工具前被拒绝。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            result = self.run_gate(root, probe, "-CheckOnly", test_mode=False)
            self.assertEqual(result.returncode, 2)
            self.assertIn("仅在 AFH_TEST_MODE=1", result.stderr)

    def test_empty_probe_path_segment_never_resolves_cwd_shim(self) -> None:
        """Windows 探测 PATH 的空段不得执行当前目录同名包装器，且重复项会被消除。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            add_base_tools(probe)
            (probe / "git.cmd").unlink()
            command(root / "git.cmd", "echo git version 2.50.0")
            result = self.run_gate(
                root,
                probe,
                "-CheckOnly",
                "-Interfaces",
                "CLI",
                AFH_PREREQ_PATH=f";{probe};;{probe};",
            )
            self.assertEqual(result.returncode, 20, result.stderr)
            self.assertIn("gate.git.status=missing", result.stdout)

    def test_windows_wrapper_precedes_extensionless_posix_shim(self) -> None:
        """npm/pnpm 同目录含 POSIX shim 时，Windows 门禁仍必须选择 cmd 包装器。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            add_base_tools(probe, node="26.0.0", pnpm="12.4.1")
            (probe / "pnpm").write_text("#!/bin/sh\nexit 99\n", encoding="utf-8")

            result = self.run_gate(root, probe, "-CheckOnly", "-Interfaces", "GUI")

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("gate.pnpm.status=passed", result.stdout)
            self.assertIn("gate.pnpm.version=12.4.1", result.stdout)

    def test_npm_ps1_uses_powershells_real_command_precedence(self) -> None:
        """同目录 npm.ps1 应按 PowerShell 实际规则优先于 npm.cmd，而非手写扩展顺序。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            add_base_tools(probe, node="26.0.0", pnpm="12.4.1")
            (probe / "npm.ps1").write_text("Write-Output '99.0.0'\nexit 9\n", encoding="utf-8")

            result = self.run_gate(root, probe, "-CheckOnly", "-Interfaces", "GUI")

            self.assertEqual(result.returncode, 23, result.stderr)
            self.assertIn("npm 探测失败", result.stderr)


class WindowsPrerequisiteGateStaticTests(unittest.TestCase):
    """在非 Windows 宿主也核对 PowerShell 门禁的稳定契约。"""

    def test_current_minimums_and_standard_user_install_roots_are_declared(self) -> None:
        source = SCRIPT.read_text(encoding="utf-8-sig")
        self.assertIn("$MinimumRustMajor = 1", source)
        self.assertIn("$MinimumRustMinor = 98", source)
        self.assertIn("$MinimumRustPatch = 1", source)
        self.assertIn('$NodeRequirement = ">=24.21.0"', source)
        self.assertIn('$PnpmRequirement = ">=12.4.1"', source)
        self.assertIn('$GitRequirement = ">=2.36.0"', source)
        self.assertIn('Join-Path $LocalAppDataRoot "Programs\\nodejs"', source)
        self.assertIn('Join-Path $RoamingAppDataRoot "npm"', source)

    def test_rust_uses_standard_environment_without_private_injection(self) -> None:
        source = SCRIPT.read_text(encoding="utf-8-sig")
        self.assertIn("function Assert-SinglePathRootValue", source)
        self.assertIn("function Get-FinalExistingPath", source)
        self.assertIn("GetFinalPathNameByHandle", source)
        self.assertIn("function Assert-ManagedCommandWrapper", source)
        self.assertIn("function Resolve-ManagedCommandWrapper", source)
        self.assertIn("function Assert-ManagedPnpmWrapperInventory", source)
        self.assertIn('Resolve-ManagedCommandWrapper "npm" $entry.FullName', source)
        self.assertIn('Resolve-ManagedCommandWrapper "pnpm" $script:ManagedPnpmHome', source)
        pnpm_install = source[source.index("function Install-MissingPnpm") :]
        self.assertLess(
            pnpm_install.index("Assert-ManagedPnpmWrapperInventory"),
            pnpm_install.index("& $npm install"),
        )
        self.assertIn('Assert-SinglePathRootValue $userInstallRoot "当前用户安装根"', source)
        self.assertIn("'^[A-Za-z]:(?![\\\\/])'", source)
        self.assertIn("'^[\\\\/](?![\\\\/])'", source)
        self.assertIn("drive-relative 或 root-relative", source)
        self.assertIn("function Assert-NoMachinePathCommandShadow", source)
        self.assertIn("function Assert-MachinePathCommandAlignment", source)
        self.assertIn("function Resolve-PathCommand", source)
        self.assertIn("Get-Command -Name $Name -CommandType Application,ExternalScript -All", source)
        self.assertIn("function Resolve-AfhFreshCommand", source)
        self.assertIn("Get-Command -Name `$Name -CommandType Application,ExternalScript -All", source)
        self.assertNotIn('("$Name.com", "$Name.exe", "$Name.cmd", "$Name.bat", "$Name.ps1")', source)
        self.assertIn("function Get-PersistedCombinedPath", source)
        self.assertIn("function Assert-PersistedCommandIdentity", source)
        self.assertIn("function Assert-PendingPersistedCommandIdentity", source)
        self.assertIn("function Assert-ProjectedPersistedToolIdentities", source)
        self.assertIn("function Assert-ProjectedPathDirectoryOwnership", source)
        self.assertIn("function Assert-PersistedRustHostIdentity", source)
        for name in ("git", "rustup", "rustc", "cargo", "node", "npm", "pnpm"):
            self.assertIn(f'Assert-PersistedCommandIdentity -Name "{name}"', source)
            self.assertIn(f'Assert-PendingPersistedCommandIdentity -Name "{name}"', source)
        self.assertIn('Assert-MachinePathCommandAlignment -Name "node"', source)
        self.assertIn('Assert-NoMachinePathCommandShadow -Names @("node", "npm")', source)
        self.assertLess(source.index("Assert-NoMachinePathCommandShadow -Names"), source.index("Install-MissingNode $change"))
        persist_writer = source[source.index("function Add-PersistedUserPathEntries") :]
        self.assertLess(
            persist_writer.index("Assert-ProjectedPersistedToolIdentities"),
            persist_writer.index("Set-PersistedUserPath"),
        )
        node_installer = source[source.index("function Install-MissingNode") :]
        self.assertLess(
            node_installer.index("Assert-ProjectedPersistedToolIdentities -PrependedUserEntries @($extracted)"),
            node_installer.index("Move-Item -LiteralPath $extracted"),
        )
        self.assertIn('[void]$plannedPrependedUserEntries.Add($script:ManagedPnpmHome)', source)
        self.assertIn(
            'Assert-ProjectedPersistedToolIdentities -PrependedUserEntries @($plannedPrependedUserEntries)',
            source,
        )
        self.assertIn('Assert-ProjectedPathDirectoryOwnership $script:ManagedPnpmHome @("pnpm")', source)
        self.assertIn('foreach ($toolPath in @($rustup, $rustc, $cargo))', source)
        self.assertIn('$script:ProcessCargoHome = [Environment]::GetEnvironmentVariable("CARGO_HOME", "Process")', source)
        self.assertIn('$script:PersistedCargoHome = Get-PersistedUserEnvironmentValue "CARGO_HOME"', source)
        self.assertIn("function Assert-DurableRustHomes", source)
        self.assertIn('SetEnvironmentVariable($name, $effective, "Process")', source)
        self.assertIn("只存在于当前进程", source)
        self.assertNotIn('$env:CARGO_HOME =', source)
        self.assertNotIn('$env:RUSTUP_HOME =', source)
        self.assertNotIn("Invoke-ManagedRustCommand", source)
        self.assertIn(
            '@("-y", "--profile", "minimal", "--default-toolchain", "stable", "--no-modify-path")',
            source,
        )

    def test_node_installer_selects_lts_but_detection_accepts_any_higher_stable(self) -> None:
        source = SCRIPT.read_text(encoding="utf-8-sig")
        self.assertIn("$compatible = $major -gt 24", source)
        self.assertIn("$_.lts", source)
        self.assertIn("Sort-Object -Property SortVersion -Descending", source)
        self.assertIn("LTS 稳定版", source)
        self.assertIn("function Assert-ManagedNodeRootInventory", source)
        self.assertLess(
            source.index("        Assert-ManagedNodeRootInventory"),
            source.index("        Install-MissingNode $change"),
        )


if __name__ == "__main__":
    unittest.main()
