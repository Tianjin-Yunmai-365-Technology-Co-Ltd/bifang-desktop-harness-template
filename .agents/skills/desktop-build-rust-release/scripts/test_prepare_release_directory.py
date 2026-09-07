"""验证 POSIX 发布目录清理辅助程序的路径边界与完整刷新行为。"""

from __future__ import annotations

import subprocess
import shutil
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("prepare-release-directory.sh")
POWERSHELL_SCRIPT = Path(__file__).with_name("prepare-release-directory.ps1")
SKILLS_ROOT = SCRIPT.parents[2]
TAURI_HELPER = SKILLS_ROOT / "desktop-build-tauri-release" / "scripts" / "prepare-release-directory.sh"
TAURI_POWERSHELL_HELPER = (
    SKILLS_ROOT / "desktop-build-tauri-release" / "scripts" / "prepare-release-directory.ps1"
)
RUST_SKILL = SKILLS_ROOT / "desktop-build-rust-release" / "SKILL.md"
TAURI_SKILL = SKILLS_ROOT / "desktop-build-tauri-release" / "SKILL.md"
CROSS_PLATFORM_SKILL = SKILLS_ROOT / "desktop-prepare-cross-platform-release" / "SKILL.md"


class PrepareReleaseDirectoryTests(unittest.TestCase):
    """覆盖精确根目录清理、符号链接拒绝和 Git 边界拒绝。"""

    def _git_root(self, parent: Path) -> Path:
        """建立带 clean HEAD 的独立 Git 根，供破坏性清理测试隔离使用。"""
        root = parent / "project"
        root.mkdir()
        subprocess.run(
            ["git", "init", "--initial-branch=main", str(root)],
            check=True,
            capture_output=True,
            text=True,
        )
        subprocess.run(
            ["git", "-C", str(root), "config", "--local", "user.name", "Release Test"],
            check=True,
        )
        subprocess.run(
            ["git", "-C", str(root), "config", "--local", "user.email", "release-test@example.com"],
            check=True,
        )
        (root / ".gitignore").write_text("/release/\n/.release-clean.*\n", encoding="utf-8")
        (root / "tracked.txt").write_text("baseline\n", encoding="utf-8")
        subprocess.run(["git", "-C", str(root), "add", ".gitignore", "tracked.txt"], check=True)
        subprocess.run(
            ["git", "-C", str(root), "commit", "--quiet", "-m", "chore: baseline"],
            check=True,
        )
        return root

    def _run(self, root: Path) -> subprocess.CompletedProcess[str]:
        """调用 POSIX 辅助程序并返回完整结果，便于同时断言成功与失败。"""
        return subprocess.run(
            ["bash", str(SCRIPT), str(root)],
            check=False,
            capture_output=True,
            text=True,
        )

    def _run_powershell(self, root: Path) -> subprocess.CompletedProcess[str]:
        """在可用宿主上调用 PowerShell 辅助程序。"""
        return subprocess.run(
            [
                "pwsh",
                "-NoProfile",
                "-File",
                str(POWERSHELL_SCRIPT),
                "-ProjectRoot",
                str(root),
            ],
            check=False,
            capture_output=True,
            text=True,
        )

    def _directory_link(self, link: Path, target: Path) -> None:
        """创建不需要管理员权限的 Windows 目录联接，其他系统创建目录符号链接。"""
        if shutil.which("cmd") and subprocess.run(
            ["cmd", "/c", "mklink", "/J", str(link), str(target)],
            check=False,
            capture_output=True,
            text=True,
        ).returncode == 0:
            return
        link.symlink_to(target, target_is_directory=True)

    def test_cleans_every_entry_without_deleting_release_directory(self) -> None:
        """普通、隐藏、嵌套和内部符号链接条目都应清除，外部目标保持不变。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            parent = Path(tmp_dir)
            root = self._git_root(parent)
            release = root / "release"
            release.mkdir()
            (release / "old.txt").write_text("old", encoding="utf-8")
            (release / ".hidden").write_text("old", encoding="utf-8")
            (release / "nested").mkdir()
            (release / "nested" / "old.txt").write_text("old", encoding="utf-8")
            external = parent / "external.txt"
            external.write_text("keep", encoding="utf-8")
            (release / "external-link").symlink_to(external)

            result = self._run(root)

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(release.is_dir())
            self.assertEqual(list(release.iterdir()), [])
            self.assertEqual(external.read_text(encoding="utf-8"), "keep")
            self.assertIn("release.cleaned=true", result.stdout)
            expected_head = subprocess.run(
                ["git", "-C", str(root), "rev-parse", "HEAD"],
                check=True,
                capture_output=True,
                text=True,
            ).stdout.strip()
            self.assertIn(f"release.source_commit={expected_head}", result.stdout)

    def test_rejects_dirty_or_untracked_worktree_before_cleaning_release(self) -> None:
        """普通构建不得自动提交；任一 tracked/untracked 变化都在清理候选前阻断。"""

        for relative, content in (("tracked.txt", "changed\n"), ("untracked.txt", "new\n")):
            with self.subTest(relative=relative), tempfile.TemporaryDirectory() as tmp_dir:
                root = self._git_root(Path(tmp_dir))
                release = root / "release"
                release.mkdir()
                marker = release / "old.txt"
                marker.write_text("keep until gate passes", encoding="utf-8")
                (root / relative).write_text(content, encoding="utf-8")

                result = self._run(root)

                self.assertNotEqual(result.returncode, 0)
                self.assertIn("工作树不干净", result.stderr)
                self.assertEqual(marker.read_text(encoding="utf-8"), "keep until gate passes")

    def test_rejects_release_symlink_without_touching_target(self) -> None:
        """根 release 指向外部目录时必须在删除前失败并保留目标内容。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            parent = Path(tmp_dir)
            root = self._git_root(parent)
            external = parent / "external"
            external.mkdir()
            marker = external / "keep.txt"
            marker.write_text("keep", encoding="utf-8")
            (root / "release").symlink_to(external, target_is_directory=True)

            result = self._run(root)

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("符号链接", result.stderr)
            self.assertEqual(marker.read_text(encoding="utf-8"), "keep")

    def test_rejects_directory_that_is_not_git_top_level(self) -> None:
        """父仓库内子目录不能冒充规范化项目根并获得清理权限。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = self._git_root(Path(tmp_dir))
            nested = root / "nested"
            nested.mkdir()

            result = self._run(nested)

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("独立 Git 顶层目录", result.stderr)
            self.assertFalse((nested / "release").exists())

    def test_windows_helper_keeps_reparse_and_force_cleanup_gates(self) -> None:
        """无法在当前 macOS 原生执行 PowerShell 时，仍锁定 Windows 高风险门禁文本。"""
        text = POWERSHELL_SCRIPT.read_text(encoding="utf-8")
        for fragment in (
            "独立 Git 顶层目录",
            "[IO.FileAttributes]::ReparsePoint",
            "[IO.Directory]::Move",
            "[IO.Directory]::Delete($item.FullName, $false)",
            "[IO.File]::Delete($item.FullName)",
            "原子刷新期间 release 发生变化",
            "Remove-TreeWithoutFollowingReparsePoint",
            "release.cleaned=true",
            "HEAD^{commit}",
            "status --porcelain=v1 --untracked-files=all",
            "release.source_commit=$sourceCommit",
        ):
            self.assertIn(fragment, text)

    def test_all_build_routes_require_clean_head_and_manifest_source_commit(self) -> None:
        """普通 Rust/Tauri/矩阵构建都拒绝 dirty，且不得自动提交或漂移 sourceCommit。"""

        self.assertEqual(TAURI_HELPER.read_bytes(), SCRIPT.read_bytes())
        self.assertEqual(TAURI_POWERSHELL_HELPER.read_bytes(), POWERSHELL_SCRIPT.read_bytes())
        for skill_path in (RUST_SKILL, TAURI_SKILL, CROSS_PLATFORM_SKILL):
            with self.subTest(skill=skill_path.name, parent=skill_path.parent.name):
                text = skill_path.read_text(encoding="utf-8")
                self.assertIn("git status --porcelain=v1 --untracked-files=all", text)
                self.assertIn("普通构建", text)
                self.assertIn("自动", text)
                self.assertIn("sourceCommit", text)
                self.assertIn("HEAD", text)

    def test_tauri_windows_release_route_uses_powershell_helper(self) -> None:
        """GUI-only Windows 候选必须保留经过同一测试的 PowerShell release helper。"""

        tauri_text = TAURI_SKILL.read_text(encoding="utf-8")
        self.assertIn("scripts/prepare-release-directory.ps1 -ProjectRoot <project-root>", tauri_text)
        self.assertIn("Windows 原生路线不得调用 `.sh` helper", tauri_text)
        self.assertEqual(TAURI_POWERSHELL_HELPER.read_bytes(), POWERSHELL_SCRIPT.read_bytes())

    def test_gui_performance_selection_is_tauri_only_and_conditionally_bound(self) -> None:
        """Tauri 逐次选择性能；只有启用分支建立探针和包内运行时绑定。"""

        tauri_text = TAURI_SKILL.read_text(encoding="utf-8")
        for fragment in (
            "performanceSelection: enabled | disabled",
            "产品/渠道硬要求强制为 `enabled`",
            "否则在任何测试或编译前询问用户一次",
            "$desktop-test-gui-release-performance",
            "pnpm tauri build --no-bundle",
            "HEAD == buildSourceCommit",
            "$desktop-implement-change",
            "performanceStatus: waived",
            "performanceThresholdProfile: gui-release-v2",
            "performanceRuntimeBinding",
            "binding: byte-identical",
            "binding: verified-signing-transition",
            "performanceStatus: Not run",
            "performanceReason",
            "performanceRemainingRisk",
            "不创建 `performanceProbe`、`performanceEvidence`、`performanceThresholdProfile`、`performanceWaiver` 或 `performanceRuntimeBinding`",
            "性能选择为 `enabled` 时 `performanceStatus` 为 `Unverified`",
        ):
            self.assertIn(fragment, tauri_text)
        rust_text = RUST_SKILL.read_text(encoding="utf-8")
        self.assertIn("普通 Rust CLI 构建不得触发", rust_text)
        self.assertNotIn("pnpm tauri build --no-bundle", rust_text)

    @unittest.skipUnless(shutil.which("pwsh"), "当前环境没有可用的 pwsh")
    def test_windows_helper_cleans_without_following_child_reparse_point(self) -> None:
        """PowerShell 实际执行时应原子刷新目录且不触及子级链接目标。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            parent = Path(tmp_dir)
            root = self._git_root(parent)
            release = root / "release"
            release.mkdir()
            (release / "old.txt").write_text("old", encoding="utf-8")
            external = parent / "external"
            external.mkdir()
            marker = external / "keep.txt"
            marker.write_text("keep", encoding="utf-8")
            self._directory_link(release / "external-link", external)

            result = self._run_powershell(root)

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(list(release.iterdir()), [])
            self.assertEqual(marker.read_text(encoding="utf-8"), "keep")

    @unittest.skipUnless(shutil.which("pwsh"), "当前环境没有可用的 pwsh")
    def test_windows_helper_rejects_root_reparse_point(self) -> None:
        """PowerShell 实际执行时应拒绝根发布目录联接或符号链接。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            parent = Path(tmp_dir)
            root = self._git_root(parent)
            external = parent / "external"
            external.mkdir()
            marker = external / "keep.txt"
            marker.write_text("keep", encoding="utf-8")
            self._directory_link(root / "release", external)

            result = self._run_powershell(root)

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("重解析点", result.stderr)
            self.assertEqual(marker.read_text(encoding="utf-8"), "keep")

    @unittest.skipUnless(shutil.which("pwsh"), "当前环境没有可用的 pwsh")
    def test_windows_helper_rejects_non_git_top_level(self) -> None:
        """PowerShell 实际执行时不能清理父仓库内的普通子目录。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = self._git_root(Path(tmp_dir))
            nested = root / "nested"
            nested.mkdir()

            result = self._run_powershell(nested)

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("独立 Git 顶层目录", result.stderr)
            self.assertFalse((nested / "release").exists())


if __name__ == "__main__":
    unittest.main()
