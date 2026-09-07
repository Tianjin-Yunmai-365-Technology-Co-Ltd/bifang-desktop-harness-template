#!/usr/bin/env python3
"""使用隔离 bare remote 验证严格 Git 分支链的完整状态机。"""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


SCRIPT_DIR = Path(__file__).resolve().parent
SCRIPT = SCRIPT_DIR / "git_branch_chain.py"
COMMIT_CONFIG_SCRIPT = (
    SCRIPT_DIR.parents[1] / "desktop-configure-git-commits" / "scripts" / "configure_git_commit.py"
)
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import branch_chain_operations
from branch_chain_state import EMPTY_STATE, StateError, read_state, validate_state


class GitBranchChainTests(unittest.TestCase):
    """覆盖真实本地仓库、bare remote、hooks、Worktree 与引用竞态。"""

    def setUp(self) -> None:
        """建立带 main 默认分支和独立 Release 分支的隔离仓库。"""

        self.temporary = tempfile.TemporaryDirectory()
        temporary_root = Path(self.temporary.name)
        self.root = temporary_root / "project"
        self.remote = temporary_root / "remote.git"
        self.global_config = temporary_root / "global.gitconfig"
        self.env = os.environ.copy()
        self.env.update(
            {
                "GIT_CONFIG_GLOBAL": str(self.global_config),
                "GIT_CONFIG_NOSYSTEM": "1",
                "GIT_TERMINAL_PROMPT": "0",
            }
        )
        self.run_external("git", "init", "--bare", "--initial-branch=main", str(self.remote))
        self.run_external("git", "init", "--initial-branch=main", str(self.root))
        self.git("config", "--local", "user.name", "Branch Chain Test")
        self.git("config", "--local", "user.email", "branch-chain@example.com")
        self.run_external(
            sys.executable,
            "-B",
            str(COMMIT_CONFIG_SCRIPT),
            "install",
            "--project-root",
            str(self.root),
        )
        (self.root / "README.md").write_text("baseline\n", encoding="utf-8")
        self.git("add", "README.md")
        self.git("commit", "-m", "chore: baseline")
        self.git("remote", "add", "origin", str(self.remote))
        self.git("push", "--set-upstream", "origin", "main")
        self.git("switch", "-c", "Release")
        self.git("push", "--set-upstream", "origin", "Release")
        self.default_head = self.remote_oid("main")

    def tearDown(self) -> None:
        """清理隔离仓库与所有临时 Worktree。"""

        self.temporary.cleanup()

    def run_external(self, *arguments: str, check: bool = True) -> subprocess.CompletedProcess[str]:
        """用隔离 Git 配置运行仓库外命令。"""

        result = subprocess.run(
            list(arguments),
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            env=self.env,
        )
        if check:
            self.assertEqual(result.returncode, 0, result.stderr)
        return result

    def git(self, *arguments: str, check: bool = True) -> subprocess.CompletedProcess[str]:
        """在工作仓库运行 Git 并默认断言成功。"""

        return self.run_external("git", "-C", str(self.root), *arguments, check=check)

    def bare_git(self, *arguments: str, check: bool = True) -> subprocess.CompletedProcess[str]:
        """在 bare remote 运行 Git 并默认断言成功。"""

        return self.run_external("git", "-C", str(self.remote), *arguments, check=check)

    def helper(self, command: str, *arguments: str) -> subprocess.CompletedProcess[str]:
        """通过公开 CLI 执行一个分支链命令。"""

        return self.run_external(
            sys.executable,
            "-B",
            str(SCRIPT),
            command,
            "--project-root",
            str(self.root),
            *arguments,
            check=False,
        )

    def payload(self, result: subprocess.CompletedProcess[str]) -> dict[str, object]:
        """断言命令成功并解析标准 JSON。"""

        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def error(self, result: subprocess.CompletedProcess[str]) -> dict[str, object]:
        """断言命令失败并解析脱敏错误 JSON。"""

        self.assertEqual(result.returncode, 1, result.stdout)
        return json.loads(result.stderr)

    def remote_oid(self, branch: str) -> str | None:
        """读取 bare remote 的一个精确 heads ref。"""

        result = self.bare_git("rev-parse", "--verify", f"refs/heads/{branch}", check=False)
        return result.stdout.strip() if result.returncode == 0 else None

    def local_oid(self, branch: str) -> str | None:
        """读取工作仓库的一个精确 heads ref。"""

        result = self.git("rev-parse", "--verify", f"refs/heads/{branch}", check=False)
        return result.stdout.strip() if result.returncode == 0 else None

    def start(self, summary: str) -> dict[str, object]:
        """开始并返回一条已推送 feature 分支。"""

        return self.payload(self.helper("start", "--summary", summary))

    def commit_file(self, name: str, contents: str) -> str:
        """在当前分支创建一个普通业务提交并返回 HEAD。"""

        (self.root / name).write_text(contents, encoding="utf-8")
        self.git("add", name)
        self.git("commit", "-m", f"feat: update {name}")
        return self.git("rev-parse", "HEAD").stdout.strip()

    def install_hook(self, repository: Path, name: str, body: str) -> Path:
        """安装一个由 Git for Windows 或 POSIX Git 执行的隔离 hook。"""

        hooks = repository / "hooks" if repository == self.remote else repository / ".git" / "hooks"
        hook = hooks / name
        hook.write_text("#!/bin/sh\n" + body, encoding="utf-8", newline="\n")
        hook.chmod(0o755)
        return hook

    def prepare_two_branch_chain(self) -> tuple[str, str, str, str]:
        """建立两段均含业务提交且已完整推送的严格父子链。"""

        first = str(self.start("first-change")["branch"])
        first_head = self.commit_file("first.txt", "first\n")
        self.payload(self.helper("publish"))
        second = str(self.start("second-change")["branch"])
        second_head = self.commit_file("second.txt", "second\n")
        self.payload(self.helper("publish"))
        return first, first_head, second, second_head

    def test_asset_and_calendar_validation_are_strict(self) -> None:
        """空模板可通过 schema，非法日历日期不能伪装 YYYYMMDD。"""

        asset = SCRIPT_DIR.parent / "assets" / "git-branch-chain.json"
        self.assertEqual(json.loads(asset.read_text(encoding="utf-8")), EMPTY_STATE)
        invalid = {
            "schemaVersion": 1,
            "activeChain": {
                "remote": "origin",
                "defaultBranch": "main",
                "defaultHead": "a" * 40,
                "baseBranch": "Release",
                "baseHead": "a" * 40,
                "activeLeaf": "feature-impossible-20260230",
                "phase": "active",
                "entries": [
                    {
                        "branch": "feature-impossible-20260230",
                        "parent": "Release",
                        "parentHead": "a" * 40,
                    }
                ],
            },
            "lastClosedChain": None,
        }
        with self.assertRaises(StateError):
            validate_state(invalid)
        with mock.patch.object(branch_chain_operations, "current_date", return_value="20260907"):
            self.assertEqual(
                branch_chain_operations.feature_branch_name("safe-summary"),
                "feature-safe-summary-20260907",
            )

    def test_inspect_uses_live_remote_default_and_does_not_create_state(self) -> None:
        """inspect 读取远端 HEAD 而不创建状态文件或改变默认分支。"""

        result = self.payload(self.helper("inspect"))
        self.assertEqual(result["branch"], "Release")
        self.assertEqual(result["remoteDefaultBranch"], "main")
        self.assertEqual(result["remoteDefaultHead"], self.default_head)
        self.assertEqual(result["stateFile"], "missing")
        self.assertFalse((self.root / ".harness" / "git-branch-chain.json").exists())

    def test_multiple_push_destinations_fail_closed_without_leaking_urls(self) -> None:
        """同一 remote 的多个 push URL 在任何操作前失败且错误不泄漏路径。"""

        second = Path(self.temporary.name) / "credential-like-secret.git"
        self.git("remote", "set-url", "--add", "--push", "origin", str(self.remote))
        self.git("remote", "set-url", "--add", "--push", "origin", str(second))
        error = self.error(self.helper("inspect"))
        self.assertIn("one identical fetch and push destination", str(error["error"]))
        self.assertNotIn(str(self.remote), str(error))
        self.assertNotIn(str(second), str(error))

    def test_state_reader_rejects_symlinked_harness_directory(self) -> None:
        """状态读取不得经由符号链接父目录信任仓库外 manifest。"""

        external = Path(self.temporary.name) / "external-harness"
        external.mkdir()
        (external / "git-branch-chain.json").write_text(
            json.dumps(EMPTY_STATE), encoding="utf-8"
        )
        link = self.root / ".harness"
        try:
            os.symlink(external, link, target_is_directory=True)
        except OSError as error:
            self.skipTest(f"directory symlink unavailable: {error.__class__.__name__}")
        with self.assertRaises(StateError):
            read_state(self.root)

    def test_start_creates_state_commit_and_pushes_exact_feature_ref(self) -> None:
        """首条 feature 从 Release 建立，元数据提交与远端 OID 完全一致。"""

        result = self.start("bug-crash")
        branch = str(result["branch"])
        self.assertRegex(branch, r"^feature-bug-crash-\d{8}$")
        self.assertEqual(self.local_oid(branch), result["head"])
        self.assertEqual(self.remote_oid(branch), result["head"])
        self.assertEqual(self.remote_oid("main"), self.default_head)
        state = json.loads(
            (self.root / ".harness" / "git-branch-chain.json").read_text(encoding="utf-8")
        )
        self.assertEqual(state["activeChain"]["entries"][0]["parent"], "Release")

    def test_second_start_requires_fully_pushed_parent_and_freezes_tip(self) -> None:
        """未推送父提交阻断下一条；publish 后精确父头进入第二条状态。"""

        first = str(self.start("parent-change")["branch"])
        parent_head = self.commit_file("parent.txt", "pending\n")
        failed = self.helper("start", "--summary", "child-change")
        self.assertIn("fully pushed", str(self.error(failed)["error"]))
        self.assertEqual(self.git("branch", "--show-current").stdout.strip(), first)
        self.payload(self.helper("publish"))
        second = self.start("child-change")
        state = json.loads(
            (self.root / ".harness" / "git-branch-chain.json").read_text(encoding="utf-8")
        )
        self.assertEqual(state["activeChain"]["entries"][1]["parent"], first)
        self.assertEqual(state["activeChain"]["entries"][1]["parentHead"], parent_head)
        self.assertEqual(self.remote_oid(str(second["branch"])), second["head"])

    def test_publish_fast_forwards_but_rejects_remote_ahead_or_diverged(self) -> None:
        """publish 只快进 active leaf，远端领先或分叉时不 pull、不 force。"""

        branch = str(self.start("publish-change")["branch"])
        local_head = self.commit_file("publish.txt", "local\n")
        published = self.payload(self.helper("publish"))
        self.assertEqual(published["status"], "published")
        self.assertEqual(self.remote_oid(branch), local_head)

        competitor = Path(self.temporary.name) / "competitor"
        self.run_external("git", "clone", str(self.remote), str(competitor))
        self.run_external("git", "-C", str(competitor), "config", "user.name", "Competitor")
        self.run_external(
            "git", "-C", str(competitor), "config", "user.email", "competitor@example.com"
        )
        self.run_external("git", "-C", str(competitor), "switch", branch)
        (competitor / "remote.txt").write_text("remote\n", encoding="utf-8")
        self.run_external("git", "-C", str(competitor), "add", "remote.txt")
        self.run_external("git", "-C", str(competitor), "commit", "-m", "feat: remote")
        self.run_external("git", "-C", str(competitor), "push", "origin", branch)
        remote_ahead = self.remote_oid(branch)
        failed_ahead = self.helper("publish")
        self.error(failed_ahead)
        self.assertEqual(self.remote_oid(branch), remote_ahead)
        self.commit_file("local-only.txt", "local-only\n")
        failed_diverged = self.helper("publish")
        self.error(failed_diverged)
        self.assertEqual(self.remote_oid(branch), remote_ahead)
        self.assertEqual(self.remote_oid("main"), self.default_head)

    def test_start_rejects_default_branch_and_release_as_remote_default(self) -> None:
        """main/master/动态默认分支只读，Release 成为默认分支时全部写入停止。"""

        self.git("switch", "main")
        before = self.git("rev-parse", "HEAD").stdout.strip()
        self.error(self.helper("start", "--summary", "forbidden-main"))
        self.assertEqual(self.git("rev-parse", "HEAD").stdout.strip(), before)
        self.assertFalse((self.root / ".harness" / "git-branch-chain.json").exists())
        self.git("switch", "Release")
        self.bare_git("symbolic-ref", "HEAD", "refs/heads/Release")
        self.error(self.helper("start", "--summary", "forbidden-release"))
        self.assertFalse((self.root / ".harness" / "git-branch-chain.json").exists())

    def test_active_chain_rejects_changed_remote_default_snapshot(self) -> None:
        """活动链期间默认分支 OID 变化时 publish 与 release 都失败关闭。"""

        branch = str(self.start("freeze-default")["branch"])
        competitor = Path(self.temporary.name) / "default-writer"
        self.run_external("git", "clone", str(self.remote), str(competitor))
        self.run_external("git", "-C", str(competitor), "config", "user.name", "Writer")
        self.run_external(
            "git", "-C", str(competitor), "config", "user.email", "writer@example.com"
        )
        (competitor / "default.txt").write_text("changed\n", encoding="utf-8")
        self.run_external("git", "-C", str(competitor), "add", "default.txt")
        self.run_external("git", "-C", str(competitor), "commit", "-m", "docs: change main")
        self.run_external("git", "-C", str(competitor), "push", "origin", "main")
        changed_default = self.remote_oid("main")
        self.error(self.helper("publish"))
        self.error(self.helper("release"))
        self.assertEqual(self.remote_oid(branch), self.local_oid(branch))
        self.assertEqual(self.remote_oid("main"), changed_default)

    def test_release_atomically_updates_release_and_cleans_two_branch_chain(self) -> None:
        """关闭提交一次进入 Release，远端和本地精确 feature refs 全部清理。"""

        first, first_head, second, second_head = self.prepare_two_branch_chain()
        result = self.payload(self.helper("release"))
        release_head = str(result["releaseHead"])
        self.assertEqual(self.remote_oid("Release"), release_head)
        self.assertEqual(self.local_oid("Release"), release_head)
        self.assertIsNone(self.remote_oid(first))
        self.assertIsNone(self.remote_oid(second))
        self.assertIsNone(self.local_oid(first))
        self.assertIsNone(self.local_oid(second))
        self.assertEqual(self.git("branch", "--show-current").stdout.strip(), "Release")
        self.assertEqual(self.remote_oid("main"), self.default_head)
        self.assertEqual(
            self.git("merge-base", "--is-ancestor", first_head, release_head).returncode,
            0,
        )
        state = json.loads(
            (self.root / ".harness" / "git-branch-chain.json").read_text(encoding="utf-8")
        )
        self.assertIsNone(state["activeChain"])
        self.assertEqual(
            [entry["preCloseHead"] for entry in state["lastClosedChain"]["entries"]],
            [first_head, second_head],
        )

    def test_first_chain_without_release_uses_live_default_and_creates_release(self) -> None:
        """首发无 Release 时冻结实时默认头，发布后安全建立本地与远端 Release。"""

        release_head = self.local_oid("Release")
        self.assertIsNotNone(release_head)
        self.git("switch", "main")
        self.bare_git("update-ref", "-d", "refs/heads/Release", str(release_head))
        self.git("update-ref", "-d", "refs/heads/Release", str(release_head))
        started = self.start("initial-release")
        feature = str(started["branch"])
        state = json.loads(
            (self.root / ".harness" / "git-branch-chain.json").read_text(encoding="utf-8")
        )
        self.assertEqual(state["activeChain"]["baseBranch"], "main")
        self.assertEqual(state["activeChain"]["baseHead"], self.default_head)
        self.assertEqual(state["activeChain"]["defaultHead"], self.default_head)
        self.commit_file("initial.txt", "initial\n")
        self.payload(self.helper("publish"))
        released = self.payload(self.helper("release"))
        self.assertEqual(self.remote_oid("Release"), released["releaseHead"])
        self.assertEqual(self.local_oid("Release"), released["releaseHead"])
        self.assertIsNone(self.remote_oid(feature))
        self.assertIsNone(self.local_oid(feature))
        self.assertEqual(self.remote_oid("main"), self.default_head)

    def test_release_rejects_frozen_parent_ref_drift_without_deleting_refs(self) -> None:
        """父分支在子分支建立后移动时，release 不接受漂移或删除远端链。"""

        first, first_head, second, second_head = self.prepare_two_branch_chain()
        release_before = self.remote_oid("Release")
        self.git("update-ref", f"refs/heads/{first}", second_head, first_head)
        self.bare_git("update-ref", f"refs/heads/{first}", second_head, first_head)
        self.error(self.helper("release"))
        self.assertEqual(self.remote_oid("Release"), release_before)
        self.assertEqual(self.remote_oid(first), second_head)
        self.assertEqual(self.remote_oid(second), second_head)

    def test_release_rejects_merge_history_without_deleting_remote_leaf(self) -> None:
        """active leaf 即使完整推送，只要含 merge 历史也不得关闭或删除。"""

        leaf = str(self.start("merge-history")["branch"])
        release_before = self.remote_oid("Release")
        self.git("switch", "-c", "side-history")
        self.commit_file("side.txt", "side\n")
        self.git("switch", leaf)
        self.git("merge", "--no-ff", "side-history", "-m", "merge: forbidden history")
        merge_head = self.git("rev-parse", "HEAD").stdout.strip()
        self.payload(self.helper("publish"))
        self.error(self.helper("release"))
        self.assertEqual(self.remote_oid("Release"), release_before)
        self.assertEqual(self.remote_oid(leaf), merge_head)

    def test_remote_hook_rejection_keeps_atomic_refs_and_retry_reuses_close_commit(self) -> None:
        """远端拒绝一个删除时不部分更新；重试复用同一关闭提交。"""

        first, _, second, _ = self.prepare_two_branch_chain()
        release_before = self.remote_oid("Release")
        first_before = self.remote_oid(first)
        second_before = self.remote_oid(second)
        hook = self.install_hook(
            self.remote,
            "update",
            f'[ "$1" = "refs/heads/{first}" ] && [ "$3" = "{'0' * 40}" ] && exit 17\nexit 0\n',
        )
        failed = self.helper("release")
        self.error(failed)
        closing_head = self.git("rev-parse", "HEAD").stdout.strip()
        self.assertEqual(self.remote_oid("Release"), release_before)
        self.assertEqual(self.remote_oid(first), first_before)
        self.assertEqual(self.remote_oid(second), second_before)
        hook.unlink()
        result = self.payload(self.helper("release"))
        self.assertEqual(result["releaseHead"], closing_head)
        self.assertEqual(self.remote_oid("Release"), closing_head)

    def test_remote_success_then_local_transaction_failure_is_retryable_without_push(self) -> None:
        """远端完成但本地 ref 事务失败时保留整链，重试不再次 push。"""

        first, _, second, _ = self.prepare_two_branch_chain()
        hook = self.install_hook(
            self.root,
            "reference-transaction",
            "if [ \"$1\" = prepared ]; then\n"
            "  while read old new ref; do\n"
            "    case \"$ref:$new\" in refs/heads/feature-*:0000000000000000000000000000000000000000) exit 19;; esac\n"
            "  done\n"
            "fi\n"
            "exit 0\n",
        )
        failed = self.helper("release")
        self.error(failed)
        closing_head = self.remote_oid("Release")
        self.assertIsNotNone(closing_head)
        self.assertIsNone(self.remote_oid(first))
        self.assertIsNone(self.remote_oid(second))
        self.assertIsNotNone(self.local_oid(first))
        self.assertIsNotNone(self.local_oid(second))
        hook.unlink()
        reject_push = self.install_hook(self.remote, "pre-receive", "exit 23\n")
        result = self.payload(self.helper("release"))
        self.assertEqual(result["releaseHead"], closing_head)
        self.assertIsNone(self.local_oid(first))
        self.assertIsNone(self.local_oid(second))
        reject_push.unlink()

    def test_other_worktree_occupancy_blocks_before_close_commit_or_remote_delete(self) -> None:
        """其他 Worktree 占用链内 ref 时，关闭状态和远端引用保持原样。"""

        first, _, second, second_head = self.prepare_two_branch_chain()
        worktree = Path(self.temporary.name) / "occupied worktree"
        self.git("worktree", "add", str(worktree), first)
        state_before = (self.root / ".harness" / "git-branch-chain.json").read_bytes()
        head_before = self.git("rev-parse", "HEAD").stdout.strip()
        self.error(self.helper("release"))
        self.assertEqual(self.git("rev-parse", "HEAD").stdout.strip(), head_before)
        self.assertEqual(
            (self.root / ".harness" / "git-branch-chain.json").read_bytes(), state_before
        )
        self.assertEqual(self.remote_oid(first), self.local_oid(first))
        self.assertEqual(self.remote_oid(second), second_head)
        self.assertEqual(self.remote_oid("main"), self.default_head)

    def test_remote_without_atomic_capability_never_falls_back(self) -> None:
        """远端不支持 atomic 时保留 Release 与全部 feature refs，不顺序降级。"""

        first, _, second, _ = self.prepare_two_branch_chain()
        release_before = self.remote_oid("Release")
        first_before = self.remote_oid(first)
        second_before = self.remote_oid(second)
        self.bare_git("config", "receive.advertiseAtomic", "false")
        self.error(self.helper("release"))
        self.assertEqual(self.remote_oid("Release"), release_before)
        self.assertEqual(self.remote_oid(first), first_before)
        self.assertEqual(self.remote_oid(second), second_before)


if __name__ == "__main__":
    unittest.main()
