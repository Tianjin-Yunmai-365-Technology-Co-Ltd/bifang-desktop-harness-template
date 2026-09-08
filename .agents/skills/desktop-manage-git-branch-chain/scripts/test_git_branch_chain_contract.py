#!/usr/bin/env python3
"""验证远端单快照、remote 名称与状态路径安全契约。"""

from __future__ import annotations

from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import branch_chain_git
import branch_chain_remote
import branch_chain_checks
from branch_chain_state import EMPTY_STATE, StateError, read_state, write_state


class RemoteSnapshotTests(unittest.TestCase):
    """覆盖一次性 refs 读取及严格结果解析。"""

    def test_remote_heads_use_one_snapshot_for_all_requested_refs(self) -> None:
        """Release 与 feature refs 必须在一次 ls-remote 调用中读取。"""

        release = "a" * 40
        feature = "b" * 40
        result = subprocess.CompletedProcess(
            [],
            0,
            stdout=(
                f"{feature}\trefs/heads/feature-one-20260907\n"
                f"{release}\trefs/heads/Release\n"
            ),
            stderr="",
        )
        with mock.patch.object(branch_chain_remote, "run_git", return_value=result) as invoked:
            snapshot = branch_chain_remote.remote_heads(
                Path.cwd(), "origin", ["Release", "feature-one-20260907"]
            )
        self.assertEqual(invoked.call_count, 1)
        self.assertEqual(snapshot, {"Release": release, "feature-one-20260907": feature})

    def test_remote_heads_reject_duplicate_and_unknown_results(self) -> None:
        """重复或请求范围外的 ref 结果必须失败关闭。"""

        duplicate = subprocess.CompletedProcess(
            [],
            0,
            stdout=(f"{'a' * 40}\trefs/heads/Release\n" * 2),
            stderr="",
        )
        unknown = subprocess.CompletedProcess(
            [], 0, stdout=f"{'b' * 40}\trefs/heads/unexpected\n", stderr=""
        )
        for result in (duplicate, unknown):
            with self.subTest(stdout=result.stdout):
                with mock.patch.object(branch_chain_remote, "run_git", return_value=result):
                    with self.assertRaises(branch_chain_git.GitError):
                        branch_chain_remote.remote_heads(Path.cwd(), "origin", ["Release"])


class LocalBoundaryTests(unittest.TestCase):
    """覆盖 remote 自动选择与状态路径的本地失败关闭。"""

    def test_unique_remote_must_have_a_safe_name_before_url_queries(self) -> None:
        """唯一 remote 也必须先通过名称白名单，不能切分支后才失败。"""

        with mock.patch.object(
            branch_chain_git, "configured_remotes", return_value=["unsafe/name"]
        ), mock.patch.object(branch_chain_git, "require_single_push_destination") as destination:
            with self.assertRaises(branch_chain_git.GitError):
                branch_chain_git.select_remote(Path.cwd(), None)
        destination.assert_not_called()

    def test_dangling_state_symlink_is_never_treated_as_missing_or_replaced(self) -> None:
        """悬空状态符号链接在读取和写入时都必须拒绝。"""

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            directory = root / ".harness"
            directory.mkdir()
            path = directory / "git-branch-chain.json"
            try:
                path.symlink_to(directory / "missing-target.json")
            except OSError as error:
                self.skipTest(f"当前宿主不允许创建符号链接: {error}")
            with self.assertRaises(StateError):
                read_state(root, allow_missing=True)
            with self.assertRaises(StateError):
                write_state(root, EMPTY_STATE)

    def test_success_postcondition_compares_the_full_state_snapshot(self) -> None:
        """分支与 HEAD 正确也不能掩盖操作期间发生的状态篡改。"""

        expected = {"schemaVersion": 1, "activeChain": {"sentinel": "expected"}}
        actual = {"schemaVersion": 1, "activeChain": {"sentinel": "changed"}}
        with mock.patch.object(branch_chain_checks, "require_branch_head_clean"), mock.patch.object(
            branch_chain_checks, "read_state", return_value=actual
        ):
            with self.assertRaises(branch_chain_git.GitError):
                branch_chain_checks.require_state_postcondition(
                    Path.cwd(), "feature-one-20260907", "a" * 40, expected
                )


if __name__ == "__main__":
    unittest.main()
