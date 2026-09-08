#!/usr/bin/env python3
"""验证默认分支租约竞态与关闭状态组合门禁。"""

from __future__ import annotations

import copy
import json
from pathlib import Path
import sys
import unittest


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import test_git_branch_chain as fixtures
from branch_chain_git import GitError, require_closed_history
from branch_chain_state import StateError, validate_state


class ReleaseLeaseRaceTests(unittest.TestCase):
    """覆盖 pending 后远端默认分支变化时的失败关闭。"""

    def test_default_race_uses_frozen_lease_and_preserves_feature_refs(self) -> None:
        """pre-push 推进默认分支后，冻结 lease 使整个远端事务零覆盖、零删除。"""

        case = fixtures.GitBranchChainTests()
        case.setUp()
        try:
            first, _, second, _ = case.prepare_two_branch_chain()
            active = json.loads(
                (case.root / ".harness" / "git-branch-chain.json").read_text(encoding="utf-8")
            )
            invalid_active = copy.deepcopy(active)
            invalid_active["activeChain"]["baseBranch"] = "unrelated"
            with self.assertRaises(StateError):
                validate_state(invalid_active)
            invalid_base = copy.deepcopy(active)
            invalid_base["activeChain"]["baseBranch"] = "main"
            invalid_base["activeChain"]["baseHead"] = "b" * 40
            invalid_base["activeChain"]["entries"][0].update(
                {"parent": "main", "parentHead": "b" * 40}
            )
            with self.assertRaises(StateError):
                validate_state(invalid_base)
            default_before = case.remote_oid("main")
            first_before = case.remote_oid(first)
            second_before = case.remote_oid(second)
            tree = case.git("show", "-s", "--format=%T", str(default_before)).stdout.strip()
            raced = case.git(
                "commit-tree", tree, "-p", str(default_before), "-m", "race: main moved"
            ).stdout.strip()
            case.git("push", "origin", f"{raced}:refs/heads/race-candidate")
            remote_path = str(case.remote).replace("\\", "/")
            case.install_hook(
                case.root,
                "pre-push",
                f'git --git-dir="{remote_path}" update-ref refs/heads/main '
                f'"{raced}" "{default_before}" || exit 31\nexit 0\n',
            )
            case.error(case.release())
            self.assertEqual(case.remote_oid("main"), raced)
            self.assertIsNone(case.remote_oid("Release"))
            self.assertEqual(case.remote_oid(first), first_before)
            self.assertEqual(case.remote_oid(second), second_before)
            closing_head = case.git("rev-parse", "HEAD").stdout.strip()
            with self.assertRaises(GitError):
                require_closed_history(
                    case.root, str(default_before), [str(first_before), raced], closing_head
                )
        finally:
            case.tearDown()

    def test_concurrent_release_creation_is_preserved_and_retryable(self) -> None:
        """并发创建的未知 Release 不被代删，移除竞态后可幂等收尾。"""

        case = fixtures.GitBranchChainTests()
        case.setUp()
        try:
            first, _, second, _ = case.prepare_two_branch_chain()
            default_before = case.remote_oid("main")
            remote_path = str(case.remote).replace("\\", "/")
            case.install_hook(
                case.root,
                "pre-push",
                f'git --git-dir="{remote_path}" update-ref refs/heads/Release '
                f'"{default_before}" "{'0' * 40}" || exit 37\nexit 0\n',
            )

            case.error(case.release())
            closing_head = case.remote_oid("main")

            self.assertNotEqual(closing_head, default_before)
            self.assertEqual(case.remote_oid("Release"), default_before)
            self.assertIsNone(case.remote_oid(first))
            self.assertIsNone(case.remote_oid(second))

            (case.root / ".git" / "hooks" / "pre-push").unlink()
            case.bare_git(
                "update-ref",
                "-d",
                "refs/heads/Release",
                str(default_before),
            )
            reject_push = case.install_hook(case.remote, "pre-receive", "exit 41\n")
            result = case.payload(case.release())
            reject_push.unlink()
            self.assertEqual(result["releaseHead"], closing_head)
            self.assertEqual(case.git("branch", "--show-current").stdout.strip(), "main")
            self.assertIsNone(case.local_oid(first))
            self.assertIsNone(case.local_oid(second))
        finally:
            case.tearDown()

    def test_local_cleanup_checkout_race_preserves_unknown_release(self) -> None:
        """本地收尾切换时并发出现未知 Release，必须报错且可重试。"""

        case = fixtures.GitBranchChainTests()
        case.setUp()
        try:
            first, _, second, _ = case.prepare_two_branch_chain()
            default_before = case.remote_oid("main")
            remote_path = str(case.remote).replace("\\", "/")
            hook = case.install_hook(
                case.root,
                "post-checkout",
                f'git --git-dir="{remote_path}" update-ref refs/heads/Release '
                f'"{default_before}" "{"0" * 40}" || exit 39\nexit 0\n',
            )

            error = case.error(case.release())
            closing_head = case.remote_oid("main")

            self.assertIn("raced state", str(error["error"]))
            self.assertNotEqual(closing_head, default_before)
            self.assertEqual(case.remote_oid("Release"), default_before)
            self.assertIsNone(case.remote_oid(first))
            self.assertIsNone(case.remote_oid(second))
            self.assertEqual(case.git("branch", "--show-current").stdout.strip(), "main")

            hook.unlink()
            case.bare_git(
                "update-ref",
                "-d",
                "refs/heads/Release",
                str(default_before),
            )
            result = case.payload(case.release())
            self.assertEqual(result["status"], "released")
            self.assertEqual(result["releaseHead"], closing_head)
            self.assertIsNone(case.local_oid(first))
            self.assertIsNone(case.local_oid(second))
        finally:
            case.tearDown()

    def test_legacy_release_deleted_during_push_is_retryable(self) -> None:
        """冻结的 legacy Release 已被精确删除时，重试可继续直发默认分支。"""

        case = fixtures.GitBranchChainTests()
        case.setUp()
        try:
            case.git("switch", "-c", "Release")
            case.git("push", "--set-upstream", "origin", "Release")
            started = case.start("legacy-delete-race")
            feature = str(started["branch"])
            source_head = case.commit_file("legacy-race.txt", "legacy race\n")
            case.payload(case.helper("publish"))
            default_before = case.remote_oid("main")
            release_before = case.remote_oid("Release")
            remote_path = str(case.remote).replace("\\", "/")
            hook = case.install_hook(
                case.root,
                "pre-push",
                f'git --git-dir="{remote_path}" update-ref -d refs/heads/Release '
                f'"{release_before}" || exit 43\nexit 0\n',
            )

            case.error(case.release(source_head=source_head))

            self.assertEqual(case.remote_oid("main"), default_before)
            self.assertIsNone(case.remote_oid("Release"))
            self.assertEqual(case.remote_oid(feature), source_head)
            hook.unlink()

            result = case.payload(case.release())
            self.assertEqual(case.remote_oid("main"), result["releaseHead"])
            self.assertIsNone(case.remote_oid("Release"))
            self.assertIsNone(case.local_oid("Release"))
            self.assertIsNone(case.remote_oid(feature))
            self.assertIsNone(case.local_oid(feature))
            self.assertEqual(case.git("branch", "--show-current").stdout.strip(), "main")
        finally:
            case.tearDown()

    def test_pre_commit_cannot_smuggle_paths_before_remote_deletion(self) -> None:
        """pre-commit 额外暂存文件时，提交后复核必须在任何远端变更前停止。"""

        case = fixtures.GitBranchChainTests()
        case.setUp()
        try:
            first, _, second, _ = case.prepare_two_branch_chain()
            default_before = case.remote_oid("main")
            first_before = case.remote_oid(first)
            second_before = case.remote_oid(second)
            case.install_hook(
                case.root,
                "pre-commit",
                "printf 'smuggled\\n' > smuggled.txt\n"
                "git add smuggled.txt\nexit 0\n",
            )
            case.error(case.release())
            self.assertEqual(case.remote_oid("main"), default_before)
            self.assertIsNone(case.remote_oid("Release"))
            self.assertEqual(case.remote_oid(first), first_before)
            self.assertEqual(case.remote_oid(second), second_before)
        finally:
            case.tearDown()

    def test_pre_commit_cannot_rewrite_expected_state_payload(self) -> None:
        """pre-commit 仅改写同一状态文件时，逐字节复核仍在远端删除前停止。"""

        case = fixtures.GitBranchChainTests()
        case.setUp()
        try:
            first, _, second, _ = case.prepare_two_branch_chain()
            refs_before = [case.remote_oid("main"), case.remote_oid(first), case.remote_oid(second)]
            case.install_hook(
                case.root,
                "pre-commit",
                "printf '\\n' >> .harness/git-branch-chain.json\n"
                "git add .harness/git-branch-chain.json\nexit 0\n",
            )
            case.error(case.release())
            self.assertEqual(
                [case.remote_oid("main"), case.remote_oid(first), case.remote_oid(second)],
                refs_before,
            )
        finally:
            case.tearDown()

    def test_pre_push_dirty_hook_prevents_false_start_success(self) -> None:
        """pre-push 制造 dirty 后即使远端 feature 已推进，start 也不得报告成功。"""

        case = fixtures.GitBranchChainTests()
        case.setUp()
        try:
            case.install_hook(case.root, "pre-push", "printf 'dirty\\n' > push-hook.txt\nexit 0\n")
            case.error(case.helper("start", "--summary", "hook-dirty"))
            state = json.loads(
                (case.root / ".harness" / "git-branch-chain.json").read_text(encoding="utf-8")
            )
            leaf = state["activeChain"]["activeLeaf"]
            self.assertEqual(case.remote_oid(leaf), case.local_oid(leaf))
            self.assertTrue(case.git("status", "--porcelain").stdout)
            self.assertEqual(case.git("branch", "--show-current").stdout.strip(), leaf)
        finally:
            case.tearDown()

    def test_pending_retry_rejects_local_manifest_drift_before_push(self) -> None:
        """远端仍 pending 时，本地祖先 ref 漂移必须先于原子远端事务失败。"""

        case = fixtures.GitBranchChainTests()
        case.setUp()
        try:
            first, _, second, _ = case.prepare_two_branch_chain()
            default_before = case.remote_oid("main")
            first_before = case.remote_oid(first)
            second_before = case.remote_oid(second)
            hook = case.install_hook(
                case.remote,
                "update",
                f'[ "$1" = "refs/heads/{first}" ] && [ "$3" = "{"0" * 40}" ] '
                "&& exit 17\nexit 0\n",
            )
            case.error(case.release())
            hook.unlink()
            closing_head = case.git("rev-parse", "HEAD").stdout.strip()
            case.git("update-ref", f"refs/heads/{first}", closing_head, str(first_before))
            error = case.error(case.release())
            self.assertIn("local manifest branch changed", str(error["error"]))
            self.assertEqual(case.remote_oid("main"), default_before)
            self.assertIsNone(case.remote_oid("Release"))
            self.assertEqual(case.remote_oid(first), first_before)
            self.assertEqual(case.remote_oid(second), second_before)
        finally:
            case.tearDown()

    def test_post_checkout_hook_stops_start_before_state_write(self) -> None:
        """post-checkout 制造 dirty 时，新分支写状态与远端创建都必须停止。"""

        case = fixtures.GitBranchChainTests()
        case.setUp()
        try:
            case.install_hook(
                case.root,
                "post-checkout",
                "printf 'dirty after checkout\\n' > checkout-dirty.txt\nexit 0\n",
            )
            case.error(case.helper("start", "--summary", "checkout-race"))
            branch = case.git("branch", "--show-current").stdout.strip()
            self.assertTrue(branch.startswith("feature-checkout-race-"))
            self.assertFalse((case.root / ".harness" / "git-branch-chain.json").exists())
            self.assertIsNone(case.remote_oid(branch))
        finally:
            case.tearDown()

    def test_start_rechecks_parent_after_commit_and_before_push(self) -> None:
        """pre-commit 移动父 ref 时，新 feature 不得先在远端出现。"""

        case = fixtures.GitBranchChainTests()
        case.setUp()
        try:
            default_before = case.remote_oid("main")
            tree = case.git("show", "-s", "--format=%T", str(default_before)).stdout.strip()
            raced = case.git(
                "commit-tree", tree, "-p", str(default_before), "-m", "race: local main"
            ).stdout.strip()
            case.install_hook(
                case.root,
                "pre-commit",
                f"git update-ref refs/heads/main {raced} {default_before} || exit 27\nexit 0\n",
            )
            error = case.error(case.helper("start", "--summary", "parent-race"))
            self.assertIn("parent branch changed", str(error["error"]))
            branch = case.git("branch", "--show-current").stdout.strip()
            self.assertIsNone(case.remote_oid(branch))
            self.assertEqual(case.local_oid("main"), raced)
            self.assertEqual(case.remote_oid("main"), default_before)
            self.assertIsNone(case.local_oid("Release"))
            self.assertIsNone(case.remote_oid("Release"))
        finally:
            case.tearDown()

    def test_duplicate_active_leaf_worktrees_block_release(self) -> None:
        """同一 leaf 被两个 Worktree 占用时，不得因路径覆盖而遗漏阻断。"""

        case = fixtures.GitBranchChainTests()
        case.setUp()
        try:
            first, _, second, _ = case.prepare_two_branch_chain()
            duplicate = Path(case.temporary.name) / "duplicate leaf"
            added = case.git("worktree", "add", "--force", str(duplicate), second, check=False)
            if added.returncode != 0:
                self.skipTest("当前 Git 不允许构造重复分支 Worktree")
            state_before = (case.root / ".harness" / "git-branch-chain.json").read_bytes()
            refs_before = [case.remote_oid("main"), case.remote_oid(first), case.remote_oid(second)]
            case.error(case.release())
            self.assertEqual(
                (case.root / ".harness" / "git-branch-chain.json").read_bytes(), state_before
            )
            self.assertEqual(
                [case.remote_oid("main"), case.remote_oid(first), case.remote_oid(second)],
                refs_before,
            )
        finally:
            case.tearDown()

    def test_pending_retry_rejects_local_default_drift_before_push(self) -> None:
        """远端 pending 时，本地默认分支漂移必须先于原子事务失败。"""

        case = fixtures.GitBranchChainTests()
        case.setUp()
        try:
            first, _, second, _ = case.prepare_two_branch_chain()
            default_before = case.remote_oid("main")
            refs_before = [default_before, case.remote_oid(first), case.remote_oid(second)]
            hook = case.install_hook(case.remote, "pre-receive", "exit 19\n")
            case.error(case.release())
            hook.unlink()
            tree = case.git("show", "-s", "--format=%T", str(default_before)).stdout.strip()
            raced = case.git(
                "commit-tree", tree, "-p", str(default_before), "-m", "race: local main"
            ).stdout.strip()
            case.git("update-ref", "refs/heads/main", raced, str(default_before))
            error = case.error(case.release())
            self.assertIn("local default branch changed", str(error["error"]))
            self.assertEqual(
                [case.remote_oid("main"), case.remote_oid(first), case.remote_oid(second)],
                refs_before,
            )
            self.assertIsNone(case.remote_oid("Release"))
        finally:
            case.tearDown()

    def test_complete_retry_from_base_default_skips_commit_gate_and_fast_forwards(self) -> None:
        """远端已完成后可从基线默认分支恢复状态并无提交地快进收尾。"""

        case = fixtures.GitBranchChainTests()
        case.setUp()
        try:
            first, _, second, _ = case.prepare_two_branch_chain()
            default_before = case.local_oid("main")
            hook = case.install_hook(
                case.root,
                "reference-transaction",
                "if [ \"$1\" = prepared ]; then\n"
                "  while read old new ref; do\n"
                "    [ \"$ref\" = refs/heads/main ] && exit 29\n"
                "  done\n"
                "fi\n"
                "exit 0\n",
            )
            case.error(case.release())
            closing_head = case.remote_oid("main")
            self.assertNotEqual(closing_head, default_before)
            self.assertEqual(case.local_oid("main"), default_before)
            hook.unlink()
            case.git("switch", "main")
            case.git("config", "--local", "--unset", "commit.template")
            reject_push = case.install_hook(case.remote, "pre-receive", "exit 31\n")
            result = case.payload(case.release())
            reject_push.unlink()
            self.assertEqual(result["releaseHead"], closing_head)
            self.assertEqual(result["releaseBranch"], "main")
            self.assertEqual(case.git("branch", "--show-current").stdout.strip(), "main")
            self.assertEqual(case.git("rev-parse", "HEAD").stdout.strip(), closing_head)
            self.assertIsNone(case.local_oid(first))
            self.assertIsNone(case.local_oid(second))
            self.assertIsNone(case.local_oid("Release"))
        finally:
            case.tearDown()

    def test_local_cleanup_hook_mutation_cannot_report_released(self) -> None:
        """本地 refs 删除 hook 改写状态后，最终后置条件必须拒绝成功。"""

        case = fixtures.GitBranchChainTests()
        case.setUp()
        try:
            first, _, second, _ = case.prepare_two_branch_chain()
            state_path = str(
                case.root / ".harness" / "git-branch-chain.json"
            ).replace("\\", "/")
            case.install_hook(
                case.root,
                "reference-transaction",
                "if [ \"$1\" = committed ]; then\n"
                "  while read old new ref; do\n"
                "    case \"$ref:$new\" in refs/heads/feature-*:0000000000000000000000000000000000000000) "
                f"printf '\\n' >> \"{state_path}\";; esac\n"
                "  done\n"
                "fi\n"
                "exit 0\n",
            )
            case.error(case.release())
            self.assertIsNone(case.remote_oid(first))
            self.assertIsNone(case.remote_oid(second))
            self.assertIsNone(case.local_oid(first))
            self.assertIsNone(case.local_oid(second))
            self.assertTrue(case.git("status", "--porcelain").stdout)
        finally:
            case.tearDown()


if __name__ == "__main__":
    unittest.main()
