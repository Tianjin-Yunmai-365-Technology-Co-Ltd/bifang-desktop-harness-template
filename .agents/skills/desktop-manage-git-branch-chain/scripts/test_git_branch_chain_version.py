#!/usr/bin/env python3
"""验证分支链 helper 的最低 Git 版本门禁。"""

from __future__ import annotations

from pathlib import Path
import subprocess
import sys
import unittest
from unittest import mock


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import branch_chain_git
import branch_chain_commit


class GitVersionGateTests(unittest.TestCase):
    """覆盖最低版本边界与错误输出脱敏。"""

    def test_git_2_35_8_is_rejected_without_stderr_leak(self) -> None:
        """Git 2.35.8 必须失败且不暴露命令 stderr 中的远端 URL。"""

        result = subprocess.CompletedProcess(
            ["git", "--version"],
            0,
            stdout="git version 2.35.8\n",
            stderr="https://user:secret@example.invalid/repository.git",
        )
        with mock.patch.object(branch_chain_git.subprocess, "run", return_value=result):
            with self.assertRaises(branch_chain_git.GitError) as raised:
                branch_chain_git.require_git_version()
        self.assertIn("2.36.0", str(raised.exception))
        self.assertNotIn("example.invalid", str(raised.exception))

    def test_git_2_36_0_is_accepted(self) -> None:
        """Git 2.36.0 精确最低边界必须通过。"""

        result = subprocess.CompletedProcess(
            ["git", "--version"], 0, stdout="git version 2.36.0\n", stderr=""
        )
        with mock.patch.object(
            branch_chain_git.subprocess, "run", return_value=result
        ) as invoked:
            branch_chain_git.require_git_version()
        environment = invoked.call_args.kwargs["env"]
        self.assertEqual(environment["GIT_TERMINAL_PROMPT"], "0")
        self.assertEqual(environment["GCM_INTERACTIVE"], "Never")

    def test_git_release_candidate_and_interactive_run_are_rejected(self) -> None:
        """Git .rc 预发布不可冒充稳定版，普通 Git 子进程也必须禁止凭据交互。"""

        prerelease = subprocess.CompletedProcess(
            [], 0, stdout="git version 2.36.0.rc1\n", stderr=""
        )
        with mock.patch.object(branch_chain_git.subprocess, "run", return_value=prerelease):
            with self.assertRaises(branch_chain_git.GitError):
                branch_chain_git.require_git_version()
        command = subprocess.CompletedProcess([], 0, stdout="", stderr="")
        with mock.patch.object(
            branch_chain_git.subprocess, "run", return_value=command
        ) as invoked:
            branch_chain_git.run_git(Path.cwd(), ["status"])
        environment = invoked.call_args.kwargs["env"]
        self.assertEqual(environment["GIT_TERMINAL_PROMPT"], "0")
        self.assertEqual(environment["GCM_INTERACTIVE"], "Never")

    def test_commit_prerequisites_require_identity_and_template_without_leak(self) -> None:
        """身份通过但模板失败时必须停止，且不转发检查器的敏感 stderr。"""

        accepted = subprocess.CompletedProcess([], 0, stdout="{}", stderr="")
        rejected = subprocess.CompletedProcess(
            [], 1, stdout="", stderr="https://user:secret@example.invalid/repository.git"
        )
        with mock.patch.object(
            branch_chain_commit.subprocess, "run", side_effect=[accepted, rejected]
        ) as invoked:
            with self.assertRaises(branch_chain_git.GitError) as raised:
                branch_chain_commit.require_commit_prerequisites(Path.cwd())
        self.assertEqual(invoked.call_count, 2)
        self.assertIn("check", str(raised.exception))
        self.assertNotIn("example.invalid", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
