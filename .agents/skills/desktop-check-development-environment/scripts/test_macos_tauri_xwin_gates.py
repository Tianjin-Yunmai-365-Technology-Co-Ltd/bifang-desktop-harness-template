#!/usr/bin/env python3
from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("macos-tauri-xwin-gates.sh")


def posix_shell() -> str | None:
    """解析测试可用的 sh；Windows 优先复用已安装 Git for Windows 的 shell。"""
    shell = shutil.which("sh")
    if shell is not None or os.name != "nt":
        return shell
    program_files = os.environ.get("ProgramFiles")
    if program_files:
        candidate = Path(program_files) / "Git" / "bin" / "sh.exe"
        if candidate.is_file():
            return str(candidate)
    return None


def shell_path(path: Path) -> str:
    """把测试路径转换为当前 sh 可识别且不会被盘符冒号拆分的形式。"""
    resolved = path.resolve().as_posix()
    if os.name == "nt" and len(resolved) >= 3 and resolved[1:3] == ":/":
        return f"/{resolved[0].lower()}{resolved[2:]}"
    return resolved


def executable(path: Path, content: str) -> None:
    """创建隔离测试命令，不接触真实 Homebrew、Rust target 或 Cargo 安装目录。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    path.chmod(0o755)


def add_existing_environment(
    root: Path,
    *,
    include_cross_tools: bool,
    cargo_xwin_version: str = "0.23.1",
    installed_cargo_xwin_version: str = "0.23.1",
    cargo_install_exit: int = 0,
) -> Path:
    """建立常规 GUI 门禁已通过的最小工具集，并按场景加入现成交叉工具。"""
    probe = root / "probe"
    state = root / "state"
    state.mkdir(parents=True)
    executable(
        probe / "rustup",
        f"""#!/bin/sh
set -eu
if [ "${{1:-}}" = "--version" ]; then
  printf '%s\n' 'rustup 1.28.2'
elif [ "${{1:-}} ${{2:-}} ${{3:-}}" = "target list --installed" ]; then
  if [ -f "{shell_path(state / 'target')}" ]; then
    printf '%s\n' 'x86_64-pc-windows-msvc'
  fi
elif [ "$1 $2" = "target add" ]; then
  printf '%s\n' "${{RUSTUP_HOME:?}}" > "{shell_path(state / 'rustup-home')}"
  : > "{shell_path(state / 'target')}"
else
  exit 2
fi
""",
    )
    executable(
        probe / "cargo",
        f"""#!/bin/sh
set -eu
if [ "${{1:-}}" = "--version" ]; then
  printf '%s\n' 'cargo 1.98.1'
elif [ "${{1:-}} ${{2:-}} ${{3:-}} ${{4:-}} ${{5:-}}" = "install --locked --version >=0.23.1, <0.24.0 cargo-xwin" ]; then
  [ {cargo_install_exit} -eq 0 ] || exit {cargo_install_exit}
  printf '%s\n' "${{CARGO_HOME:?}}" > "{shell_path(state / 'cargo-home')}"
  mkdir -p "$CARGO_HOME/bin"
  printf '#!/bin/sh\nprintf "%%s\\n" "cargo-xwin {installed_cargo_xwin_version}"\n' > "$CARGO_HOME/bin/cargo-xwin"
  chmod +x "$CARGO_HOME/bin/cargo-xwin"
else
  exit 2
fi
""",
    )
    executable(probe / "pnpm", "#!/bin/sh\nprintf '%s\n' '12.4.1'\n")
    if include_cross_tools:
        (state / "target").touch()
        executable(probe / "llvm-rc", "#!/bin/sh\nprintf '%s\n' 'llvm-rc test'\n")
        executable(probe / "lld-link", "#!/bin/sh\nprintf '%s\n' 'lld-link test'\n")
        executable(probe / "makensis", "#!/bin/sh\nprintf '%s\n' 'NSIS test'\n")
        executable(
            probe / "cargo-xwin",
            f"#!/bin/sh\nprintf '%s\\n' 'cargo-xwin {cargo_xwin_version}'\n",
        )
    return probe


def add_fake_formula_tool(root: Path, formula: str, tool: str) -> None:
    """预置单个 Homebrew formula 工具，用于覆盖 LLVM 与 LLD 拆包场景。"""
    executable(root / "brew" / formula / "bin" / tool, "#!/bin/sh\nexit 0\n")


def add_fake_brew(root: Path, probe: Path, *, fail_formula: str | None = None) -> None:
    """提供只写隔离 prefix 的 Homebrew 替身，验证安装、失败和复探分支。"""
    brew_root = root / "brew"
    executable(
        probe / "brew",
        f"""#!/bin/sh
set -eu
root='{shell_path(brew_root)}'
if [ "$1" = "--prefix" ]; then
  [ -d "$root/$2" ] || exit 1
  printf '%s\n' "$root/$2"
elif [ "${{1:-}} ${{2:-}} ${{3:-}}" = "list --versions --formula" ]; then
  formula=$4
  [ -d "$root/$formula" ] || exit 1
  printf '%s\n' "$formula 1.0.0"
elif [ "$1" = "install" ]; then
  formula=$2
  [ "$formula" != "{fail_formula or ''}" ] || exit 9
  mkdir -p "$root/$formula/bin"
    case "$formula" in
    llvm)
      printf '#!/bin/sh\nprintf "%%s\\n" "Exactly one input file should be provided." >&2\nexit 1\n' > "$root/$formula/bin/llvm-rc"
      chmod +x "$root/$formula/bin/llvm-rc"
      ;;
    lld)
      printf '#!/bin/sh\nexit 0\n' > "$root/$formula/bin/lld-link"
      chmod +x "$root/$formula/bin/lld-link"
      ;;
    nsis)
      printf '#!/bin/sh\nexit 0\n' > "$root/$formula/bin/makensis"
      chmod +x "$root/$formula/bin/makensis"
      ;;
  esac
else
  exit 2
fi
""",
    )


def add_persisted_rust_home_login(root: Path) -> Path:
    """建立会从 profile 恢复自定义 Rust homes 的确定性 login shell 替身。"""
    home = root / "home"
    home.mkdir(parents=True, exist_ok=True)
    (home / ".profile").write_text(
        f"export CARGO_HOME='{shell_path(home / 'custom-cargo')}'\n"
        f"export RUSTUP_HOME='{shell_path(home / 'custom-rustup')}'\n",
        encoding="utf-8",
    )
    login_shell = root / "login-shell"
    executable(
        login_shell,
        "#!/bin/sh\n"
        '[ "${1:-}" = -l ] && [ "${2:-}" = -c ] || exit 90\n'
        '. "$HOME/.profile"\n'
        'exec /bin/sh -c "$3"\n',
    )
    return login_shell


class MacosTauriXwinGateTests(unittest.TestCase):
    """覆盖 macOS Tauri xwin 门禁的成功路径和最高风险安装失败路径。"""

    def run_gate(
        self,
        root: Path,
        probe: Path,
        *args: str,
        test_mode: bool = True,
        rust_home_mode: str = "test-overrides",
        **extra: str,
    ) -> subprocess.CompletedProcess[str]:
        """在伪造 macOS 与独立 HOME/Cargo 目录运行门禁，禁止真实环境修改。"""
        shell = posix_shell()
        if shell is None:
            self.skipTest("当前测试宿主没有可执行的 POSIX sh")
        env = os.environ.copy()
        env.update(
            {
                "AFH_PREREQ_PATH": shell_path(probe),
                "AFH_TEST_PLATFORM": "Darwin",
                "AFH_ALLOW_TEST_OVERRIDES": "1",
                "AFH_TEST_MODE": "1",
                "HOME": shell_path(root / "home"),
                "CARGO_HOME": shell_path(root / "project" / ".cargo"),
                "RUSTUP_HOME": shell_path(root / "project" / ".rustup"),
                "AFH_MANAGED_CARGO_HOME": shell_path(root / "cargo"),
                "AFH_MANAGED_RUSTUP_HOME": shell_path(root / "rustup"),
            }
        )
        if rust_home_mode == "standard":
            env["CARGO_HOME"] = shell_path(root / "home" / "custom-cargo")
            env["RUSTUP_HOME"] = shell_path(root / "home" / "custom-rustup")
            env.pop("AFH_MANAGED_CARGO_HOME", None)
            env.pop("AFH_MANAGED_RUSTUP_HOME", None)
        elif rust_home_mode == "defaults":
            for name in (
                "CARGO_HOME",
                "RUSTUP_HOME",
                "AFH_MANAGED_CARGO_HOME",
                "AFH_MANAGED_RUSTUP_HOME",
            ):
                env.pop(name, None)
        elif rust_home_mode != "test-overrides":
            raise ValueError(f"unknown rust_home_mode: {rust_home_mode}")
        if not test_mode:
            env.pop("AFH_TEST_MODE", None)
        env.update(extra)
        return subprocess.run(
            [shell, shell_path(SCRIPT), *args],
            text=True,
            capture_output=True,
            cwd=root,
            env=env,
            timeout=30,
            check=False,
        )

    def test_test_overrides_require_explicit_test_mode(self) -> None:
        """伪造宿主或探测路径必须同时显式启用统一测试模式。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = root / "probe"
            probe.mkdir()
            result = self.run_gate(root, probe, "--check-only", test_mode=False)
            self.assertEqual(result.returncode, 2)
            self.assertIn("仅在 AFH_TEST_MODE=1", result.stderr)

    def test_existing_environment_passes_without_installing(self) -> None:
        """全部工具与 target 已存在时必须无写入通过。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = add_existing_environment(root, include_cross_tools=True)
            result = self.run_gate(root, probe, "--install-missing")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("gate.tauri_windows_cross.status=passed", result.stdout)
            self.assertIn(
                "gate.cargo_xwin.requirement=>=0.23.1, <0.24.0",
                result.stdout,
            )
            self.assertIn("gate.cargo_xwin.version=0.23.1", result.stdout)
            self.assertIn("gate.changed=false", result.stdout)
            self.assertFalse((root / "cargo").exists())

    def test_missing_environment_is_installed_and_reprobed(self) -> None:
        """缺失交叉工具时通过既有包管理器安装，复探全部成功后才通过。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = add_existing_environment(root, include_cross_tools=False)
            add_fake_brew(root, probe)
            result = self.run_gate(root, probe, "--install-missing")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("gate.llvm.change=installed", result.stdout)
            self.assertIn("gate.lld.change=installed", result.stdout)
            self.assertIn("gate.nsis.change=installed", result.stdout)
            self.assertIn("gate.rust_target.change=installed", result.stdout)
            self.assertIn("gate.cargo_xwin.change=installed", result.stdout)
            self.assertIn(
                "gate.cargo_xwin.requirement=>=0.23.1, <0.24.0",
                result.stdout,
            )
            self.assertIn("gate.cargo_xwin.version=0.23.1", result.stdout)
            self.assertIn("gate.changed=true", result.stdout)
            self.assertTrue((root / "cargo" / "bin" / "cargo-xwin").is_file())
            self.assertFalse((root / "project").exists())

    def test_standard_cargo_and_rustup_homes_are_respected(self) -> None:
        """显式标准 Rust homes 必须用于安装，不得被 Harness 私有目录替换。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = add_existing_environment(root, include_cross_tools=False)
            add_fake_brew(root, probe)
            login_shell = add_persisted_rust_home_login(root)

            result = self.run_gate(
                root,
                probe,
                "--install-missing",
                rust_home_mode="standard",
                SHELL=shell_path(login_shell),
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            cargo_home = root / "home" / "custom-cargo"
            rustup_home = root / "home" / "custom-rustup"
            self.assertEqual(
                (root / "state" / "cargo-home").read_text(encoding="utf-8").strip(),
                shell_path(cargo_home),
            )
            self.assertEqual(
                (root / "state" / "rustup-home").read_text(encoding="utf-8").strip(),
                shell_path(rustup_home),
            )
            self.assertTrue((cargo_home / "bin" / "cargo-xwin").is_file())
            self.assertFalse((root / "cargo").exists())
            self.assertFalse((root / "rustup").exists())

    def test_process_only_custom_rust_homes_fail_before_xwin_install(self) -> None:
        """一次性非默认 Rust homes 不得接收 target 或 cargo-xwin 写入。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "home").mkdir()
            probe = add_existing_environment(root, include_cross_tools=False)
            add_fake_brew(root, probe)
            login_shell = root / "login-shell"
            executable(
                login_shell,
                "#!/bin/sh\n"
                '[ "${1:-}" = -l ] && [ "${2:-}" = -c ] || exit 90\n'
                'exec /bin/sh -c "$3"\n',
            )

            result = self.run_gate(
                root,
                probe,
                "--install-missing",
                rust_home_mode="standard",
                SHELL=shell_path(login_shell),
            )

            self.assertEqual(result.returncode, 36, result.stderr)
            self.assertIn("必须由新 login shell 持久恢复", result.stderr)
            self.assertFalse((root / "state" / "target").exists())
            self.assertFalse((root / "state" / "cargo-home").exists())
            self.assertFalse((root / "home" / "custom-cargo").exists())

    def test_standard_rust_home_rejects_symlinked_intermediate_component(self) -> None:
        """HOME 内自定义 Rust 根的任一中间组件为 symlink 时必须在安装前失败。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = add_existing_environment(root, include_cross_tools=False)
            add_fake_brew(root, probe)
            home = root / "home"
            home.mkdir()
            outside = root / "outside-rust-home"
            outside.mkdir()
            (home / "tools").symlink_to(outside, target_is_directory=True)

            result = self.run_gate(
                root,
                probe,
                "--install-missing",
                rust_home_mode="standard",
                CARGO_HOME=f"{shell_path(home)}/tools/cargo",
            )

            self.assertEqual(result.returncode, 36, result.stderr)
            self.assertIn("路径组件不能是符号链接", result.stderr)
            self.assertEqual(list(outside.iterdir()), [])

    def test_path_separator_in_home_or_rust_root_fails_before_probe_or_install(self) -> None:
        """HOME 或单一 Rust 根夹带冒号时不得扩张为额外探测路径。"""
        cases = (
            {"HOME": "{home}:{outside}"},
            {"AFH_MANAGED_CARGO_HOME": "{cargo}:{outside}"},
            {"AFH_MANAGED_RUSTUP_HOME": "{rustup}:{outside}"},
        )
        for overrides in cases:
            with self.subTest(overrides=overrides), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                (root / "home").mkdir()
                probe = add_existing_environment(root, include_cross_tools=False)
                values = {
                    name: template.format(
                        home=shell_path(root / "home"),
                        cargo=shell_path(root / "cargo"),
                        rustup=shell_path(root / "rustup"),
                        outside=shell_path(root / "outside"),
                    )
                    for name, template in overrides.items()
                }

                result = self.run_gate(root, probe, **values)

                self.assertEqual(result.returncode, 2, result.stderr)
                self.assertIn("PATH 分隔符冒号", result.stderr)
                self.assertFalse((root / "state" / "cargo-home").exists())
                self.assertFalse((root / "state" / "rustup-home").exists())

    def test_unset_standard_rust_homes_use_home_defaults(self) -> None:
        """未设置标准 Rust homes 时必须回退到 HOME 下的官方默认目录。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = add_existing_environment(root, include_cross_tools=False)
            add_fake_brew(root, probe)

            result = self.run_gate(
                root,
                probe,
                "--install-missing",
                rust_home_mode="defaults",
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            cargo_home = root / "home" / ".cargo"
            rustup_home = root / "home" / ".rustup"
            self.assertEqual(
                (root / "state" / "cargo-home").read_text(encoding="utf-8").strip(),
                shell_path(cargo_home),
            )
            self.assertEqual(
                (root / "state" / "rustup-home").read_text(encoding="utf-8").strip(),
                shell_path(rustup_home),
            )
            self.assertTrue((cargo_home / "bin" / "cargo-xwin").is_file())

    def test_install_path_output_drops_empty_and_duplicate_probe_segments(self) -> None:
        """安装分支必须清除探测 PATH 空段/重复项，输出也不得重新引入 cwd 语义。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = add_existing_environment(root, include_cross_tools=False)
            add_fake_brew(root, probe)
            probe_value = shell_path(probe)
            result = self.run_gate(
                root,
                probe,
                "--install-missing",
                AFH_PREREQ_PATH=f":{probe_value}::{probe_value}:",
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            path_line = next(
                line for line in result.stdout.splitlines() if line.startswith("gate.path.prepend=")
            )
            entries = path_line.removeprefix("gate.path.prepend=").split(":")
            self.assertNotIn("", entries)
            self.assertEqual(len(entries), len(dict.fromkeys(entries)))

    def test_literal_glob_probe_entry_is_never_expanded(self) -> None:
        """绝对 PATH 字面 glob 必须保持字面量，不能扫描 cwd 或匹配目录中的 shim。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = add_existing_environment(root, include_cross_tools=True)
            (probe / "cargo-xwin").unlink()
            glob_match = root / "glob-match"
            glob_match.mkdir()
            executable(glob_match / "cargo-xwin", '#!/bin/sh\nprintf "%s\\n" "cargo-xwin 0.23.1"\n')

            result = self.run_gate(
                root,
                probe,
                "--check-only",
                AFH_PREREQ_PATH=f"{shell_path(root)}/*:{shell_path(probe)}",
            )

            self.assertEqual(result.returncode, 20, result.stderr)
            self.assertIn("gate.cargo_xwin.status=missing", result.stdout)

    def test_higher_compatible_cargo_xwin_is_preserved(self) -> None:
        """0.23 系列中高于下界的稳定版本必须直接通过且不静默替换。"""

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = add_existing_environment(
                root, include_cross_tools=True, cargo_xwin_version="0.23.9"
            )
            result = self.run_gate(root, probe, "--install-missing")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("gate.cargo_xwin.version=0.23.9", result.stdout)
            self.assertIn("gate.cargo_xwin.change=existing", result.stdout)

    def test_failing_cargo_xwin_version_probe_is_rejected(self) -> None:
        """即使打印合法版本，cargo-xwin 非零退出也不得被判为通过。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = add_existing_environment(root, include_cross_tools=True)
            executable(
                probe / "cargo-xwin",
                "#!/bin/sh\nprintf '%s\\n' 'cargo-xwin 0.23.1'\nexit 9\n",
            )

            result = self.run_gate(root, probe, "--check-only")

            self.assertEqual(result.returncode, 36, result.stderr)
            self.assertIn("版本探测返回失败", result.stderr)
            self.assertNotIn("gate.tauri_windows_cross.status=passed", result.stdout)

    def test_failing_rustup_target_probe_is_rejected(self) -> None:
        """打印目标后失败的 rustup 不得借助管道末端 grep 假通过。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = add_existing_environment(root, include_cross_tools=True)
            executable(
                probe / "rustup",
                "#!/bin/sh\nprintf '%s\\n' 'x86_64-pc-windows-msvc'\nexit 9\n",
            )

            result = self.run_gate(root, probe, "--check-only")

            self.assertEqual(result.returncode, 36, result.stderr)
            self.assertIn("无法列出已安装 target", result.stderr)
            self.assertNotIn("gate.tauri_windows_cross.status=passed", result.stdout)

    def test_unrecognized_llvm_rc_failure_is_not_accepted(self) -> None:
        """llvm-rc 只允许官方无输入诊断的 exit 1，其他失败仍是缺失。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = add_existing_environment(root, include_cross_tools=True)
            executable(probe / "llvm-rc", "#!/bin/sh\nprintf '%s\\n' broken >&2\nexit 1\n")

            result = self.run_gate(root, probe, "--check-only")

            self.assertEqual(result.returncode, 20, result.stderr)
            self.assertIn("gate.llvm.status=missing", result.stdout)
            self.assertNotIn("gate.tauri_windows_cross.status=passed", result.stdout)

    def test_failing_base_tool_probe_is_not_accepted(self) -> None:
        """常规 GUI 门禁后工具若已损坏，xwin 不得只凭路径存在声称 base passed。"""
        for tool in ("cargo", "pnpm"):
            with self.subTest(tool=tool), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                probe = add_existing_environment(root, include_cross_tools=True)
                executable(probe / tool, "#!/bin/sh\nexit 9\n")

                result = self.run_gate(root, probe, "--check-only")

                self.assertEqual(result.returncode, 20, result.stderr)
                self.assertIn("gate.tauri_windows_cross.base=missing", result.stdout)
                self.assertNotIn("gate.tauri_windows_cross.status=passed", result.stdout)

    def test_outdated_cargo_xwin_is_upgraded_and_reprobed(self) -> None:
        """明确低于 0.23.1 的稳定版本必须安装受限新版，复探后标记 upgraded。"""
        for version in ("0.22.9", "0.23.0"):
            with self.subTest(version=version), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                probe = add_existing_environment(
                    root,
                    include_cross_tools=True,
                    cargo_xwin_version=version,
                )
                result = self.run_gate(root, probe, "--install-missing")
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn("gate.tauri_windows_cross.status=passed", result.stdout)
                self.assertIn("gate.cargo_xwin.status=passed", result.stdout)
                self.assertIn("gate.cargo_xwin.version=0.23.1", result.stdout)
                self.assertIn("gate.cargo_xwin.change=upgraded", result.stdout)
                self.assertIn("gate.changed=true", result.stdout)
                self.assertTrue((root / "cargo" / "bin" / "cargo-xwin").is_file())

    def test_check_only_reports_outdated_cargo_xwin_without_writes(self) -> None:
        """只读模式必须结构化报告 upgrade-required 并以 20 结束，不能写 Cargo 目录。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = add_existing_environment(
                root,
                include_cross_tools=True,
                cargo_xwin_version="0.23.0",
            )
            result = self.run_gate(root, probe, "--check-only")
            self.assertEqual(result.returncode, 20, result.stderr)
            self.assertIn("gate.tauri_windows_cross.status=upgrade-required", result.stdout)
            self.assertIn("gate.cargo_xwin.status=upgrade-required", result.stdout)
            self.assertIn("gate.cargo_xwin.version=0.23.0", result.stdout)
            self.assertFalse((root / "cargo").exists())

    def test_upgrade_failure_does_not_claim_success(self) -> None:
        """旧版本升级命令失败时必须保留安装错误，不能输出通过或 changed=true。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = add_existing_environment(
                root,
                include_cross_tools=True,
                cargo_xwin_version="0.23.0",
                cargo_install_exit=9,
            )
            result = self.run_gate(root, probe, "--install-missing")
            self.assertEqual(result.returncode, 36)
            self.assertIn("cargo-xwin 安装失败", result.stderr)
            self.assertNotIn("gate.tauri_windows_cross.status=passed", result.stdout)
            self.assertNotIn("gate.changed=true", result.stdout)

    def test_upgrade_reprobe_rejects_still_outdated_cargo_xwin(self) -> None:
        """升级命令即使返回成功，复探仍低于下界也必须阻断并报告 upgrade-required。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = add_existing_environment(
                root,
                include_cross_tools=True,
                cargo_xwin_version="0.22.9",
                installed_cargo_xwin_version="0.23.0",
            )
            result = self.run_gate(root, probe, "--install-missing")
            self.assertEqual(result.returncode, 37)
            self.assertIn("gate.cargo_xwin.status=upgrade-required", result.stdout)
            self.assertIn("gate.cargo_xwin.version=0.23.0", result.stdout)
            self.assertIn("安装后复探仍失败", result.stderr)

    def test_non_upgradeable_cargo_xwin_is_not_replaced(self) -> None:
        """过高、预发布或不可解析版本不是可证明的旧版，必须失败且不得降级。"""
        for version in ("0.24.0", "0.23.1-beta.1", "invalid"):
            with self.subTest(version=version), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                probe = add_existing_environment(
                    root,
                    include_cross_tools=True,
                    cargo_xwin_version=version,
                )
                result = self.run_gate(root, probe, "--install-missing")
                self.assertEqual(result.returncode, 36)
                self.assertIn("不满足兼容范围 >=0.23.1, <0.24.0", result.stderr)
                self.assertFalse((root / "cargo").exists())

    def test_check_only_reports_missing_without_writes(self) -> None:
        """只读模式必须报告缺失且不调用 Homebrew、rustup target add 或 cargo install。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = add_existing_environment(root, include_cross_tools=False)
            add_fake_brew(root, probe)
            result = self.run_gate(root, probe, "--check-only")
            self.assertEqual(result.returncode, 20)
            self.assertIn("gate.tauri_windows_cross.status=missing", result.stdout)
            self.assertFalse((root / "brew" / "llvm").exists())
            self.assertFalse((root / "state" / "target").exists())
            self.assertFalse((root / "cargo").exists())

    def test_missing_homebrew_blocks_install(self) -> None:
        """LLVM/NSIS 缺失且没有既有 Homebrew 时必须阻断，不能执行远程 shell 安装器。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = add_existing_environment(root, include_cross_tools=False)
            result = self.run_gate(root, probe, "--install-missing")
            self.assertEqual(result.returncode, 32)
            self.assertIn("不自动安装 Homebrew", result.stderr)

    def test_formula_install_failure_does_not_claim_success(self) -> None:
        """Homebrew 安装失败必须保留非零状态，不能跳过复探或继续构建。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = add_existing_environment(root, include_cross_tools=False)
            add_fake_brew(root, probe, fail_formula="llvm")
            result = self.run_gate(root, probe, "--install-missing")
            self.assertEqual(result.returncode, 33)
            self.assertIn("LLVM 安装失败", result.stderr)

    def test_split_llvm_install_adds_missing_lld_formula(self) -> None:
        """LLVM 已存在但 LLD 已拆包时必须安装独立 lld，并返回完整 PATH。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = add_existing_environment(root, include_cross_tools=False)
            add_fake_brew(root, probe)
            add_fake_formula_tool(root, "llvm", "llvm-rc")
            add_fake_formula_tool(root, "nsis", "makensis")
            (root / "state" / "target").touch()
            executable(
                probe / "cargo-xwin",
                "#!/bin/sh\nprintf '%s\\n' 'cargo-xwin 0.23.1'\n",
            )

            result = self.run_gate(root, probe, "--install-missing")

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("gate.llvm.change=existing", result.stdout)
            self.assertIn("gate.lld.change=installed", result.stdout)
            self.assertIn(shell_path(root / "brew" / "lld" / "bin"), result.stdout)

    def test_damaged_existing_lld_formula_is_not_silently_reinstalled(self) -> None:
        """已有 lld formula 缺少 lld-link 时必须失败关闭，避免静默改写用户工具链。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = add_existing_environment(root, include_cross_tools=False)
            add_fake_brew(root, probe)
            add_fake_formula_tool(root, "llvm", "llvm-rc")
            add_fake_formula_tool(root, "nsis", "makensis")
            (root / "brew" / "lld" / "bin").mkdir(parents=True)

            result = self.run_gate(root, probe, "--install-missing")

            self.assertEqual(result.returncode, 33)
            self.assertIn("既有 LLD 缺少 lld-link", result.stderr)

    def test_formula_root_without_bin_is_not_silently_reinstalled(self) -> None:
        """已登记 formula 即使 bin 目录也损坏缺失，仍必须在安装前失败。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = add_existing_environment(root, include_cross_tools=False)
            add_fake_brew(root, probe)
            (root / "brew" / "lld").mkdir(parents=True)
            add_fake_formula_tool(root, "llvm", "llvm-rc")
            add_fake_formula_tool(root, "nsis", "makensis")

            result = self.run_gate(root, probe, "--install-missing")

            self.assertEqual(result.returncode, 33, result.stderr)
            self.assertIn("既有 LLD 缺少 lld-link", result.stderr)
            self.assertFalse((root / "brew" / "lld" / "bin").exists())

    def test_all_formula_conflicts_are_preflighted_before_any_brew_install(self) -> None:
        """后项 formula 损坏时不得先安装前项，确保 Homebrew 变更原子起步。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = add_existing_environment(root, include_cross_tools=False)
            add_fake_brew(root, probe)
            (root / "brew" / "llvm" / "bin").mkdir(parents=True)
            add_fake_formula_tool(root, "nsis", "makensis")

            result = self.run_gate(root, probe, "--install-missing")

            self.assertEqual(result.returncode, 33, result.stderr)
            self.assertIn("既有 LLVM 缺少 llvm-rc", result.stderr)
            self.assertFalse((root / "brew" / "lld").exists())

    def test_non_macos_host_is_rejected(self) -> None:
        """专用门禁不得在非 macOS 宿主伪装可用。"""
        shell = posix_shell()
        if shell is None:
            self.skipTest("当前测试宿主没有可执行的 POSIX sh")
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = add_existing_environment(root, include_cross_tools=True)
            env = os.environ.copy()
            env.update(
                {
                    "AFH_PREREQ_PATH": shell_path(probe),
                    "AFH_TEST_PLATFORM": "Linux",
                    "AFH_ALLOW_TEST_OVERRIDES": "1",
                    "AFH_TEST_MODE": "1",
                }
            )
            result = subprocess.run(
                [shell, shell_path(SCRIPT), "--check-only"],
                text=True,
                capture_output=True,
                env=env,
                timeout=30,
                check=False,
            )
            self.assertEqual(result.returncode, 30)
            self.assertIn("requires-macos-host", result.stdout)

    def test_unsupported_target_is_rejected(self) -> None:
        """当前范围只允许 Windows x64 MSVC，其他目标不能被静默接受。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            probe = add_existing_environment(root, include_cross_tools=True)
            result = self.run_gate(
                root,
                probe,
                "--check-only",
                "--target",
                "aarch64-pc-windows-msvc",
            )
            self.assertEqual(result.returncode, 2)
            self.assertIn("不支持的 Tauri xwin 目标", result.stderr)


if __name__ == "__main__":
    unittest.main()
