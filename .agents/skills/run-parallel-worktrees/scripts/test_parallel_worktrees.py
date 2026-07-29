#!/usr/bin/env python3
"""隔离验证并行 Worktree 助手的成功路径与数据安全阻断。"""

from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("parallel_worktrees.py")


class ParallelWorktreesTests(unittest.TestCase):
    """在临时 Git 仓库中验证脚本不会触碰真实用户工作树。"""

    def setUp(self) -> None:
        """建立包含一个可追踪基线提交的独立临时仓库。"""
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / "sample_project"
        self.root.mkdir()
        self.git("init", "-b", "main")
        self.git("config", "user.name", "Harness Test")
        self.git("config", "user.email", "harness-test@example.invalid")
        (self.root / "README.md").write_text("baseline\n", encoding="utf-8")
        self.git("add", "README.md")
        self.git("commit", "-m", "baseline")

    def tearDown(self) -> None:
        """清理测试拥有的临时仓库和外部 Worktree 目录。"""
        self.temp.cleanup()

    def git(self, *args: str, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
        """在测试仓库或指定 Worktree 执行 Git，并要求命令成功。"""
        return subprocess.run(
            ["git", "-C", str(cwd or self.root), *args],
            check=True,
            capture_output=True,
            text=True,
        )

    def helper(self, *args: str) -> tuple[subprocess.CompletedProcess[str], dict[str, object]]:
        """运行助手并解析其唯一 JSON 输出。"""
        result = subprocess.run(
            ["python3", str(SCRIPT), *args, "--project-root", str(self.root)],
            check=False,
            capture_output=True,
            text=True,
        )
        return result, json.loads(result.stdout)

    def test_create_and_remove_integrated_clean_worktree(self) -> None:
        """验证干净基线可创建单元，整合后只移除 Worktree 并保留分支。"""
        created, payload = self.helper("create", "--task", "feature", "--unit", "docs")
        self.assertEqual(created.returncode, 0, created.stderr)
        worktree = Path(str(payload["worktreePath"]))
        (worktree / "docs.txt").write_text("done\n", encoding="utf-8")
        self.git("add", "docs.txt", cwd=worktree)
        self.git("commit", "-m", "complete docs unit", cwd=worktree)
        self.git("merge", "--ff-only", "codex/feature/docs")

        removed, removal = self.helper(
            "remove",
            "--task",
            "feature",
            "--unit",
            "docs",
            "--integrated-into",
            "main",
        )

        self.assertEqual(removed.returncode, 0, removed.stderr)
        self.assertFalse(worktree.exists())
        self.assertTrue(removal["branchRetained"])
        self.git("show-ref", "--verify", "refs/heads/codex/feature/docs")

    def test_create_rejects_dirty_base_including_untracked_files(self) -> None:
        """验证未跟踪用户文件也会阻断创建，避免并行基线遗漏修改。"""
        (self.root / "local.txt").write_text("user work\n", encoding="utf-8")

        result, payload = self.helper("create", "--task", "feature", "--unit", "core")

        self.assertEqual(result.returncode, 4)
        self.assertEqual(payload["error"]["code"], "base_worktree_dirty")

    def test_create_rejects_unsafe_identifier_and_existing_path(self) -> None:
        """验证路径穿越标识与预先存在的目标目录都不会被覆盖。"""
        unsafe, unsafe_payload = self.helper("create", "--task", "../escape", "--unit", "core")
        self.assertEqual(unsafe.returncode, 2)
        self.assertEqual(unsafe_payload["error"]["code"], "invalid_identifier")

        target = self.root.parent / ".codex-worktrees" / self.root.name / "feature" / "core"
        target.mkdir(parents=True)
        existing, existing_payload = self.helper(
            "create", "--task", "feature", "--unit", "core"
        )
        self.assertEqual(existing.returncode, 4)
        self.assertEqual(existing_payload["error"]["code"], "worktree_path_exists")

    def test_remove_rejects_dirty_or_unintegrated_worktree(self) -> None:
        """验证脏 Worktree 和未整合提交均不能通过保守清理门禁。"""
        created, payload = self.helper("create", "--task", "feature", "--unit", "tests")
        self.assertEqual(created.returncode, 0)
        worktree = Path(str(payload["worktreePath"]))
        (worktree / "pending.txt").write_text("pending\n", encoding="utf-8")

        dirty, dirty_payload = self.helper(
            "remove",
            "--task",
            "feature",
            "--unit",
            "tests",
            "--integrated-into",
            "main",
        )
        self.assertEqual(dirty.returncode, 4)
        self.assertEqual(dirty_payload["error"]["code"], "worktree_dirty")

        self.git("add", "pending.txt", cwd=worktree)
        self.git("commit", "-m", "unintegrated work", cwd=worktree)
        unmerged, unmerged_payload = self.helper(
            "remove",
            "--task",
            "feature",
            "--unit",
            "tests",
            "--integrated-into",
            "main",
        )
        self.assertEqual(unmerged.returncode, 4)
        self.assertEqual(unmerged_payload["error"]["code"], "branch_not_integrated")
        self.assertTrue(worktree.exists())


if __name__ == "__main__":
    unittest.main()
