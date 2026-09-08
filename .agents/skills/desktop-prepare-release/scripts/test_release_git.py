#!/usr/bin/env python3
"""验证发布本地提交助手的快照、精确路径、hooks 与 clean HEAD 门禁。"""

from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("release_git.py")


class ReleaseGitTests(unittest.TestCase):
    """在隔离仓库中覆盖两阶段发布提交的最高风险路径。"""

    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name) / "project"
        self.remote = Path(self.temporary.name) / "remote.git"
        self.root.mkdir()
        self.global_config = Path(self.temporary.name) / "global.gitconfig"
        self.env = os.environ.copy()
        self.env.update(
            {
                "GIT_CONFIG_GLOBAL": str(self.global_config),
                "GIT_CONFIG_NOSYSTEM": "1",
                "GIT_TERMINAL_PROMPT": "0",
                "GCM_INTERACTIVE": "Never",
            }
        )
        subprocess.run(
            ["git", "init", "--quiet", "--bare", str(self.remote)],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
            env=self.env,
        )
        self.git("init", "--quiet", "--initial-branch=main")
        self.git("config", "--local", "user.name", "Release Test")
        self.git("config", "--local", "user.email", "release-test@example.com")
        (self.root / "README.md").write_text("baseline\n", encoding="utf-8")
        self.git("add", "README.md")
        self.git("commit", "--quiet", "-m", "chore: baseline")
        self.baseline_head = self.git("rev-parse", "HEAD").stdout.strip()
        subprocess.run(
            ["git", "-C", str(self.remote), "symbolic-ref", "HEAD", "refs/heads/main"],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
            env=self.env,
        )
        self.git("remote", "add", "origin", str(self.remote))
        self.git("push", "--quiet", "-u", "origin", "main")
        self.git("switch", "--quiet", "-c", "feature-release-scope-20260907")
        state_directory = self.root / ".harness"
        state_directory.mkdir()
        (state_directory / "git-branch-chain.json").write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "activeChain": {
                        "remote": "origin",
                        "defaultBranch": "main",
                        "defaultHead": self.baseline_head,
                        "baseBranch": "main",
                        "baseHead": self.baseline_head,
                        "activeLeaf": "feature-release-scope-20260907",
                        "phase": "active",
                        "entries": [
                            {
                                "branch": "feature-release-scope-20260907",
                                "parent": "main",
                                "parentHead": self.baseline_head,
                            }
                        ],
                    },
                    "lastClosedChain": None,
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        self.git("add", ".harness/git-branch-chain.json")
        self.git("commit", "--quiet", "-m", "chore: register feature branch")
        self.git("push", "--quiet", "-u", "origin", "feature-release-scope-20260907")

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def git(self, *arguments: str, check: bool = True) -> subprocess.CompletedProcess[str]:
        result = subprocess.run(
            ["git", "-C", str(self.root), *arguments],
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            env=self.env,
        )
        if check:
            self.assertEqual(result.returncode, 0, result.stderr)
        return result

    def run_script(self, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT), *arguments],
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            env=self.env,
        )

    def inspect(self) -> dict[str, object]:
        result = self.run_script("inspect", "--project-root", str(self.root))
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def commit(self, snapshot: dict[str, object], *paths: str) -> subprocess.CompletedProcess[str]:
        arguments = [
            "commit",
            "--project-root",
            str(self.root),
            "--expected-status-sha256",
            str(snapshot["statusSha256"]),
            "--message",
            "feat: complete reviewed release scope",
        ]
        for path in paths:
            arguments.extend(("--path", path))
        return self.run_script(*arguments)

    def test_inspect_reports_exact_head_and_dirty_snapshot(self) -> None:
        (self.root / "source.txt").write_text("done\n", encoding="utf-8")
        payload = self.inspect()
        self.assertEqual(payload["status"], "dirty")
        self.assertEqual(payload["branch"], "feature-release-scope-20260907")
        self.assertRegex(payload["head"], r"^[0-9a-f]{40}$")
        self.assertRegex(payload["statusSha256"], r"^[0-9a-f]{64}$")
        self.assertTrue(any("source.txt" in record for record in payload["records"]))

    def test_commit_stages_only_reviewed_paths_and_finishes_clean(self) -> None:
        (self.root / "source.txt").write_text("done\n", encoding="utf-8")
        snapshot = self.inspect()
        result = self.commit(snapshot, "source.txt")
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertTrue(payload["clean"])
        self.assertNotEqual(payload["previousHead"], payload["head"])
        self.assertEqual(self.git("status", "--porcelain").stdout, "")
        self.assertEqual(self.git("show", "--format=", "--name-only", "HEAD").stdout.strip(), "source.txt")

    def test_changed_snapshot_is_rejected_before_staging(self) -> None:
        (self.root / "source.txt").write_text("one\n", encoding="utf-8")
        snapshot = self.inspect()
        (self.root / "source.txt").write_text("two\n", encoding="utf-8")
        result = self.commit(snapshot, "source.txt")
        self.assertEqual(result.returncode, 1)
        self.assertIn("changed after review", result.stderr)
        self.assertEqual(self.git("diff", "--cached", "--name-only").stdout, "")

    def test_git_add_window_race_cannot_commit_unreviewed_bytes(self) -> None:
        """真实 add 窗口中的并发改写必须与隔离 index 冻结 patch 不匹配。"""

        target = self.root / "source.txt"
        target.write_text("reviewed\n", encoding="utf-8")
        snapshot = self.inspect()
        before = self.git("rev-parse", "HEAD").stdout.strip()
        real_git = shutil.which("git", path=self.env.get("PATH"))
        self.assertIsNotNone(real_git)
        wrapper_directory = Path(self.temporary.name) / "git-wrapper"
        wrapper_directory.mkdir()
        wrapper = wrapper_directory / "git"
        wrapper.write_text(
            "#!/bin/sh\n"
            "if [ -z \"${GIT_INDEX_FILE:-}\" ] && [ \"${1:-}\" = -C ] && "
            "[ \"${3:-}\" = add ]; then\n"
            "  printf '%s\\n' raced > \"$AFH_RACE_TARGET\"\n"
            "fi\n"
            "exec \"$AFH_REAL_GIT\" \"$@\"\n",
            encoding="utf-8",
            newline="\n",
        )
        wrapper.chmod(0o755)
        self.env.update(
            {
                "AFH_RACE_TARGET": str(target),
                "AFH_REAL_GIT": str(real_git),
                "PATH": f"{wrapper_directory}{os.pathsep}{self.env.get('PATH', '')}",
            }
        )

        result = self.commit(snapshot, "source.txt")

        self.assertEqual(result.returncode, 1)
        self.assertIn("staged content changed after review", result.stderr)
        self.assertEqual(self.git("rev-parse", "HEAD").stdout.strip(), before)
        self.assertEqual(target.read_text(encoding="utf-8"), "raced\n")

    def test_frozen_patch_covers_tracked_untracked_mode_delete_and_rename(self) -> None:
        """隔离 index 与真实 add 对常见 Git 变化必须产生同一完整 patch。"""

        mode_path = self.root / "mode.txt"
        deleted_path = self.root / "deleted.txt"
        renamed_from = self.root / "renamed-from.txt"
        for path in (mode_path, deleted_path, renamed_from):
            path.write_text(f"{path.stem}\n", encoding="utf-8")
        self.git("add", "mode.txt", "deleted.txt", "renamed-from.txt")
        self.git("commit", "--quiet", "-m", "test: add patch fixtures")
        self.git("push", "--quiet", "origin", "feature-release-scope-20260907")

        (self.root / "README.md").write_text("tracked update\n", encoding="utf-8")
        (self.root / "untracked.txt").write_text("untracked\n", encoding="utf-8")
        mode_path.chmod(mode_path.stat().st_mode | 0o111)
        self.git("update-index", "--chmod=+x", "mode.txt")
        deleted_path.unlink()
        renamed_from.rename(self.root / "renamed-to.txt")
        snapshot = self.inspect()

        result = self.commit(
            snapshot,
            "README.md",
            "untracked.txt",
            "mode.txt",
            "deleted.txt",
            "renamed-from.txt",
            "renamed-to.txt",
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            self.git("show", "HEAD:README.md").stdout,
            "tracked update\n",
        )
        summary = self.git("diff", "--summary", "HEAD^", "HEAD").stdout
        self.assertIn("create mode 100644 untracked.txt", summary)
        self.assertIn("mode change 100644 => 100755 mode.txt", summary)
        self.assertIn("delete mode 100644 deleted.txt", summary)
        self.assertIn("rename renamed-from.txt => renamed-to.txt (100%)", summary)

    def test_branch_switch_invalidates_reviewed_snapshot(self) -> None:
        """即使工作树字节相同，复核后切换 feature 分支也必须拒绝提交。"""

        (self.root / "source.txt").write_text("one\n", encoding="utf-8")
        snapshot = self.inspect()
        self.git("switch", "--quiet", "-c", "feature-other-scope-20260907")
        result = self.commit(snapshot, "source.txt")
        self.assertEqual(result.returncode, 1)
        self.assertIn("changed after review", result.stderr)
        self.assertEqual(self.git("diff", "--cached", "--name-only").stdout, "")

    def test_commit_rejects_unregistered_feature_branch(self) -> None:
        """同格式链外分支也不得绕过活动叶子登记。"""

        self.git("switch", "--quiet", "-c", "feature-other-scope-20260907")
        (self.root / "source.txt").write_text("one\n", encoding="utf-8")
        snapshot = self.inspect()
        result = self.commit(snapshot, "source.txt")
        self.assertEqual(result.returncode, 1)
        self.assertIn("not the registered active leaf", result.stderr)
        self.assertEqual(self.git("diff", "--cached", "--name-only").stdout, "")

    def test_commit_rejects_remote_default_branch_drift(self) -> None:
        """远端默认分支在复核后漂移时必须在暂存前停止。"""

        (self.root / "source.txt").write_text("one\n", encoding="utf-8")
        snapshot = self.inspect()
        subprocess.run(
            [
                "git",
                "-C",
                str(self.remote),
                "symbolic-ref",
                "HEAD",
                "refs/heads/feature-release-scope-20260907",
            ],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
            env=self.env,
        )
        result = self.commit(snapshot, "source.txt")
        self.assertEqual(result.returncode, 1)
        self.assertIn("default branch or OID changed", result.stderr)
        self.assertEqual(self.git("diff", "--cached", "--name-only").stdout, "")

    def test_commit_rejects_protected_and_release_branches(self) -> None:
        """main、master 与 Release 只读，发布提交助手不得在其上写入。"""

        for branch in ("main", "master", "Release"):
            with self.subTest(branch=branch):
                self.git("switch", "--quiet", "-C", branch)
                (self.root / "source.txt").write_text(f"{branch}\n", encoding="utf-8")
                snapshot = self.inspect()
                before = self.git("rev-parse", "HEAD").stdout.strip()
                result = self.commit(snapshot, "source.txt")
                self.assertEqual(result.returncode, 1)
                self.assertIn("allowed only on the active feature", result.stderr)
                self.assertEqual(self.git("rev-parse", "HEAD").stdout.strip(), before)
                self.assertEqual(self.git("diff", "--cached", "--name-only").stdout, "")
                self.git("restore", "source.txt", check=False)
                (self.root / "source.txt").unlink(missing_ok=True)

    def test_unreviewed_path_blocks_partial_commit(self) -> None:
        (self.root / "source.txt").write_text("done\n", encoding="utf-8")
        (self.root / "secret.txt").write_text("must review\n", encoding="utf-8")
        before_count = self.git("rev-list", "--count", "HEAD").stdout.strip()
        snapshot = self.inspect()
        result = self.commit(snapshot, "source.txt")
        self.assertEqual(result.returncode, 1)
        self.assertIn("complete working tree", result.stderr)
        self.assertEqual(self.git("rev-list", "--count", "HEAD").stdout.strip(), before_count)

    def test_existing_unreviewed_staged_path_is_rejected(self) -> None:
        (self.root / "source.txt").write_text("done\n", encoding="utf-8")
        (self.root / "other.txt").write_text("staged\n", encoding="utf-8")
        self.git("add", "other.txt")
        snapshot = self.inspect()
        result = self.commit(snapshot, "source.txt")
        self.assertEqual(result.returncode, 1)
        self.assertIn("outside the reviewed scope", result.stderr)

    def test_failing_hook_stops_without_advancing_head(self) -> None:
        (self.root / "source.txt").write_text("done\n", encoding="utf-8")
        hook = self.root / ".git" / "hooks" / "pre-commit"
        hook.write_text("#!/bin/sh\nexit 17\n", encoding="utf-8")
        hook.chmod(0o755)
        before = self.git("rev-parse", "HEAD").stdout.strip()
        snapshot = self.inspect()
        result = self.commit(snapshot, "source.txt")
        self.assertEqual(result.returncode, 1)
        self.assertIn("hooks were not bypassed", result.stderr)
        self.assertEqual(self.git("rev-parse", "HEAD").stdout.strip(), before)

    def test_hook_cannot_smuggle_unreviewed_content_into_successful_commit(self) -> None:
        """正常运行的 hook 若改写 index，helper 必须在调用方 publish 前失败关闭。"""

        (self.root / "source.txt").write_text("done\n", encoding="utf-8")
        hook = self.root / ".git" / "hooks" / "pre-commit"
        hook.write_text(
            "#!/bin/sh\nprintf '%s\\n' injected > injected.txt\ngit add injected.txt\n",
            encoding="utf-8",
            newline="\n",
        )
        hook.chmod(0o755)
        remote_before = self.git("ls-remote", "origin", "refs/heads/feature-release-scope-20260907").stdout
        snapshot = self.inspect()

        result = self.commit(snapshot, "source.txt")

        self.assertEqual(result.returncode, 1)
        self.assertIn("hook changed the reviewed staged content", result.stderr)
        self.assertEqual(
            self.git("ls-remote", "origin", "refs/heads/feature-release-scope-20260907").stdout,
            remote_before,
        )

    def test_high_confidence_secret_stops_without_advancing_head(self) -> None:
        """即使路径已复核，私钥/令牌形态也必须在 commit 与 hooks 前失败关闭。"""

        (self.root / "secret.env").write_text(
            "API_TOKEN=sk-abcdefghijklmnopqrstuvwxyz123456\n", encoding="utf-8"
        )
        before = self.git("rev-parse", "HEAD").stdout.strip()
        snapshot = self.inspect()
        result = self.commit(snapshot, "secret.env")
        self.assertEqual(result.returncode, 1)
        self.assertIn("potential secret detected", result.stderr)
        self.assertNotIn("sk-abcdefghijklmnopqrstuvwxyz123456", result.stderr)
        self.assertEqual(self.git("rev-parse", "HEAD").stdout.strip(), before)

    def test_unsafe_or_empty_commit_scope_is_rejected(self) -> None:
        (self.root / "source.txt").write_text("done\n", encoding="utf-8")
        snapshot = self.inspect()
        for unsafe in (
            "../source.txt",
            ".git/config",
            ".harness",
            ".harness/git-branch-chain.json",
            "release/candidate.zip",
            ":(glob)*",
        ):
            with self.subTest(unsafe=unsafe):
                result = self.commit(snapshot, unsafe)
                self.assertEqual(result.returncode, 1)
                self.assertIn(
                    "cannot be approved"
                    if unsafe.startswith((".git", ".harness", "release"))
                    else "unsafe approved path",
                    result.stderr,
                )


if __name__ == "__main__":
    unittest.main()
