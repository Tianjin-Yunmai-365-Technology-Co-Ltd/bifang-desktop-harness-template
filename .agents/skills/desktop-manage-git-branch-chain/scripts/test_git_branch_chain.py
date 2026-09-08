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
from branch_chain_state import (
    EMPTY_STATE,
    RELEASE_REVIEW_CHECKS,
    StateError,
    read_state,
    validate_candidate_selections,
    validate_state,
)


class GitBranchChainTests(unittest.TestCase):
    """覆盖真实本地仓库、bare remote、hooks、Worktree 与引用竞态。"""

    def setUp(self) -> None:
        """建立仅含 main 动态默认分支的隔离仓库。"""

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

    def use_master_default(self) -> None:
        """把尚未开始分支链的隔离仓库改为 master 动态默认分支。"""

        self.git("branch", "-m", "main", "master")
        self.git("push", "--set-upstream", "origin", "master")
        self.bare_git("symbolic-ref", "HEAD", "refs/heads/master")
        self.git("push", "origin", "--delete", "main")
        self.default_head = self.remote_oid("master")

    def commit_file(self, name: str, contents: str) -> str:
        """在当前分支创建一个普通业务提交并返回 HEAD。"""

        (self.root / name).write_text(contents, encoding="utf-8")
        self.git("add", name)
        self.git("commit", "-m", f"feat: update {name}")
        return self.git("rev-parse", "HEAD").stdout.strip()

    def worktree_git(
        self, worktree: Path, *arguments: str, check: bool = True
    ) -> subprocess.CompletedProcess[str]:
        """在登记的临时 Worktree 中运行隔离 Git 命令。"""

        return self.run_external(
            "git", "-C", str(worktree), *arguments, check=check
        )

    def add_task_worktree(
        self,
        branch: str = "codex/task-primary",
        *,
        start_point: str = "HEAD",
    ) -> Path:
        """从精确起点建立一个真实左侧 Task 形状的登记 Worktree。"""

        worktree = Path(self.temporary.name) / branch.replace("/", "-")
        self.git("worktree", "add", "-b", branch, str(worktree), start_point)
        return worktree

    def commit_task_file(self, worktree: Path, name: str = "task.txt") -> str:
        """在 Task Worktree 创建普通线性提交并返回冻结 OID。"""

        (worktree / name).write_text("task result\n", encoding="utf-8")
        self.worktree_git(worktree, "add", name)
        self.worktree_git(worktree, "commit", "-m", f"feat: update {name}")
        return self.worktree_git(worktree, "rev-parse", "HEAD").stdout.strip()

    def integrate_task(
        self, task_branch: str, task_worktree: Path, task_head: str
    ) -> subprocess.CompletedProcess[str]:
        """通过公开 CLI 请求一次冻结 Task 提交的条件快进。"""

        return self.helper(
            "integrate-task",
            "--task-branch",
            task_branch,
            "--task-worktree",
            str(task_worktree),
            "--task-head",
            task_head,
        )

    def release(
        self,
        *,
        selection: str = "enabled",
        source_head: str | None = None,
        reason: str | None = None,
        remaining_risk: str | None = None,
        performance_selection: str = "not-applicable",
        performance_source: str = "not-applicable",
        performance_reason: str | None = None,
        performance_remaining_risk: str | None = None,
        macos_signing_selection: str = "not-applicable",
        macos_signing_source: str = "not-applicable",
        macos_signing_reason: str | None = None,
        macos_signing_remaining_risk: str | None = None,
    ) -> subprocess.CompletedProcess[str]:
        """初次关闭传入审查信封；已封存重试直接复用状态。"""

        state_file = self.root / ".harness" / "git-branch-chain.json"
        try:
            state = json.loads(state_file.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError, UnicodeDecodeError):
            state = {}
        if state.get("activeChain") is None:
            return self.helper("release")
        resolved_source_head = source_head or self.git(
            "rev-parse", "HEAD"
        ).stdout.strip()
        arguments = [
            "--review-selection",
            selection,
            "--review-status",
            "passed" if selection == "enabled" else "Not run",
            "--review-source-head",
            resolved_source_head,
            "--performance-selection",
            performance_selection,
            "--performance-source",
            performance_source,
            "--macos-signing-selection",
            macos_signing_selection,
            "--macos-signing-source",
            macos_signing_source,
        ]
        if selection == "enabled":
            arguments.extend(
                (
                    "--reviewed-source-commit",
                    resolved_source_head,
                    "--review-evidence-summary",
                    "Concentrated release review completed with no blocking findings.",
                )
            )
            for check in RELEASE_REVIEW_CHECKS:
                arguments.extend(("--review-check", check))
        if reason is not None:
            arguments.extend(("--review-reason", reason))
        if remaining_risk is not None:
            arguments.extend(("--review-remaining-risk", remaining_risk))
        if performance_reason is not None:
            arguments.extend(("--performance-reason", performance_reason))
        if performance_remaining_risk is not None:
            arguments.extend(
                ("--performance-remaining-risk", performance_remaining_risk)
            )
        if macos_signing_reason is not None:
            arguments.extend(("--macos-signing-reason", macos_signing_reason))
        if macos_signing_remaining_risk is not None:
            arguments.extend(
                ("--macos-signing-remaining-risk", macos_signing_remaining_risk)
            )
        return self.helper("release", *arguments)

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
                "baseBranch": "main",
                "baseHead": "a" * 40,
                "activeLeaf": "feature-impossible-20260230",
                "phase": "active",
                "entries": [
                    {
                        "branch": "feature-impossible-20260230",
                        "parent": "main",
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
        self.assertEqual(result["branch"], "main")
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

    def test_start_creates_state_commit_from_default_and_pushes_exact_feature_ref(self) -> None:
        """首条 feature 从动态默认分支建立，元数据提交与远端 OID 完全一致。"""

        result = self.start("bug-crash")
        branch = str(result["branch"])
        self.assertRegex(branch, r"^feature-bug-crash-\d{8}$")
        self.assertEqual(self.local_oid(branch), result["head"])
        self.assertEqual(self.remote_oid(branch), result["head"])
        self.assertEqual(self.remote_oid("main"), self.default_head)
        self.assertIsNone(self.local_oid("Release"))
        self.assertIsNone(self.remote_oid("Release"))
        state = json.loads(
            (self.root / ".harness" / "git-branch-chain.json").read_text(encoding="utf-8")
        )
        self.assertEqual(state["activeChain"]["baseBranch"], "main")
        self.assertEqual(state["activeChain"]["entries"][0]["parent"], "main")

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

    def test_integrate_task_fast_forwards_locally_then_publish_updates_remote(self) -> None:
        """Task 只条件快进到本地 active leaf，后续 publish 才更新远端。"""

        started = self.start("task-integration")
        leaf = str(started["branch"])
        leaf_head = str(started["head"])
        state_before = (self.root / ".harness" / "git-branch-chain.json").read_bytes()
        task_branch = "codex/task-task-key"
        task_worktree = self.add_task_worktree(task_branch)
        task_head = self.commit_task_file(task_worktree)

        integrated = self.payload(
            self.integrate_task(task_branch, task_worktree, task_head)
        )
        self.assertEqual(integrated["status"], "task-integrated")
        self.assertEqual(integrated["branch"], leaf)
        self.assertEqual(integrated["previousHead"], leaf_head)
        self.assertEqual(integrated["head"], task_head)
        self.assertEqual(integrated["remoteHead"], leaf_head)
        self.assertFalse(integrated["published"])
        self.assertEqual(integrated["nextCommand"], "publish")
        self.assertEqual(self.local_oid(leaf), task_head)
        self.assertEqual(self.local_oid(task_branch), task_head)
        self.assertEqual(self.remote_oid(leaf), leaf_head)
        self.assertIsNone(self.remote_oid(task_branch))
        self.assertEqual(
            (self.root / ".harness" / "git-branch-chain.json").read_bytes(),
            state_before,
        )

        published = self.payload(self.helper("publish"))
        self.assertEqual(published["status"], "published")
        self.assertEqual(self.remote_oid(leaf), task_head)
        self.assertEqual(
            (self.root / ".harness" / "git-branch-chain.json").read_bytes(),
            state_before,
        )

    def test_integrate_task_requires_clean_coordinator_and_task_worktrees(self) -> None:
        """任一参与 Worktree dirty 时都必须在 active leaf 移动前停止。"""

        started = self.start("task-clean")
        leaf = str(started["branch"])
        leaf_head = str(started["head"])
        task_branch = "codex/task-clean"
        task_worktree = self.add_task_worktree(task_branch)

        coordinator_dirty = self.root / "coordinator-dirty.txt"
        coordinator_dirty.write_text("dirty\n", encoding="utf-8")
        self.error(self.integrate_task(task_branch, task_worktree, leaf_head))
        self.assertEqual(self.local_oid(leaf), leaf_head)
        coordinator_dirty.unlink()

        task_dirty = task_worktree / "task-dirty.txt"
        task_dirty.write_text("dirty\n", encoding="utf-8")
        self.error(self.integrate_task(task_branch, task_worktree, leaf_head))
        self.assertEqual(self.local_oid(leaf), leaf_head)
        self.assertEqual(self.remote_oid(leaf), leaf_head)

    def test_integrate_task_requires_the_current_active_leaf(self) -> None:
        """协调 Worktree 位于其他具名分支时不得更新登记 active leaf。"""

        started = self.start("task-active-leaf")
        leaf = str(started["branch"])
        leaf_head = str(started["head"])
        task_branch = "codex/task-active-leaf"
        task_worktree = self.add_task_worktree(task_branch)
        task_head = self.commit_task_file(task_worktree)
        self.git("switch", "-c", "coordinator-wrong-branch", leaf_head)

        error = self.error(self.integrate_task(task_branch, task_worktree, task_head))
        self.assertIn("active leaf worktree", str(error["error"]))
        self.assertEqual(self.local_oid(leaf), leaf_head)
        self.assertEqual(self.remote_oid(leaf), leaf_head)

    def test_integrate_task_rejects_remote_active_leaf_drift(self) -> None:
        """远端 leaf 不再等于本地冻结基线时不得整合 Task。"""

        started = self.start("task-remote-drift")
        leaf = str(started["branch"])
        leaf_head = str(started["head"])
        task_branch = "codex/task-remote-drift"
        task_worktree = self.add_task_worktree(task_branch)
        task_head = self.commit_task_file(task_worktree)
        self.git("push", "origin", f"{task_head}:refs/heads/{leaf}")

        self.error(self.integrate_task(task_branch, task_worktree, task_head))
        self.assertEqual(self.local_oid(leaf), leaf_head)
        self.assertEqual(self.remote_oid(leaf), task_head)

    def test_integrate_task_rejects_remote_task_ref(self) -> None:
        """临时 Task ref 一旦出现在远端就不得整合。"""

        started = self.start("task-remote-ref")
        leaf = str(started["branch"])
        leaf_head = str(started["head"])
        task_branch = "codex/task-remote-ref"
        task_worktree = self.add_task_worktree(task_branch)
        task_head = self.commit_task_file(task_worktree)
        self.worktree_git(
            task_worktree,
            "push",
            "origin",
            f"{task_head}:refs/heads/{task_branch}",
        )

        error = self.error(self.integrate_task(task_branch, task_worktree, task_head))
        self.assertIn("must not exist on the remote", str(error["error"]))
        self.assertEqual(self.local_oid(leaf), leaf_head)
        self.assertEqual(self.remote_oid(leaf), leaf_head)
        self.assertEqual(self.remote_oid(task_branch), task_head)

    def test_integrate_task_rejects_invalid_or_mismatched_frozen_oid(self) -> None:
        """冻结 OID 必须是 40 位小写且精确匹配本地 Task ref。"""

        started = self.start("task-frozen-oid")
        leaf = str(started["branch"])
        leaf_head = str(started["head"])
        task_branch = "codex/task-frozen-oid"
        task_worktree = self.add_task_worktree(task_branch)
        self.commit_task_file(task_worktree)

        for invalid_oid in ("abc123", "A" * 40):
            with self.subTest(task_head=invalid_oid):
                error = self.error(
                    self.integrate_task(task_branch, task_worktree, invalid_oid)
                )
                self.assertIn("40-character lowercase Git OID", str(error["error"]))
                self.assertEqual(self.local_oid(leaf), leaf_head)

        mismatch = self.error(
            self.integrate_task(task_branch, task_worktree, leaf_head)
        )
        self.assertIn("local task branch does not match", str(mismatch["error"]))
        self.assertEqual(self.local_oid(leaf), leaf_head)
        self.assertEqual(self.remote_oid(leaf), leaf_head)

    def test_integrate_task_rejects_mismatched_task_worktree(self) -> None:
        """声明 Worktree 必须实际检出目标 Task 分支与冻结 HEAD。"""

        started = self.start("task-worktree-mismatch")
        leaf = str(started["branch"])
        leaf_head = str(started["head"])
        task_branch = "codex/task-worktree-match"
        task_worktree = self.add_task_worktree(task_branch)
        task_head = self.commit_task_file(task_worktree)
        wrong_worktree = self.add_task_worktree(
            "codex/task-worktree-wrong", start_point=leaf
        )

        error = self.error(self.integrate_task(task_branch, wrong_worktree, task_head))
        self.assertIn("branch or HEAD does not match", str(error["error"]))
        self.assertEqual(self.local_oid(leaf), leaf_head)
        self.assertEqual(self.remote_oid(leaf), leaf_head)

    def test_integrate_task_rejects_non_descendant_history(self) -> None:
        """Task 不是当前 leaf 的后代时不得条件快进。"""

        started = self.start("task-diverged-history")
        leaf = str(started["branch"])
        leaf_head = str(started["head"])
        task_branch = "codex/task-diverged"
        task_worktree = self.add_task_worktree(task_branch, start_point="main")
        state_copy = self.root / ".harness" / "git-branch-chain.json"
        task_state = task_worktree / ".harness" / "git-branch-chain.json"
        task_state.parent.mkdir()
        task_state.write_bytes(state_copy.read_bytes())
        (task_worktree / "diverged.txt").write_text("diverged\n", encoding="utf-8")
        self.worktree_git(
            task_worktree,
            "add",
            ".harness/git-branch-chain.json",
            "diverged.txt",
        )
        self.worktree_git(task_worktree, "commit", "-m", "feat: diverge task")
        task_head = self.worktree_git(task_worktree, "rev-parse", "HEAD").stdout.strip()

        self.error(self.integrate_task(task_branch, task_worktree, task_head))
        self.assertEqual(self.local_oid(leaf), leaf_head)
        self.assertEqual(self.remote_oid(leaf), leaf_head)

    def test_integrate_task_rejects_merge_history(self) -> None:
        """Task 含 merge commit 时不得绕过严格线性历史。"""

        started = self.start("task-merge-history")
        leaf = str(started["branch"])
        leaf_head = str(started["head"])
        task_branch = "codex/task-merge-history"
        task_worktree = self.add_task_worktree(task_branch)
        self.commit_task_file(task_worktree, "linear.txt")
        self.worktree_git(task_worktree, "switch", "-c", "task-side", leaf)
        (task_worktree / "side.txt").write_text("side\n", encoding="utf-8")
        self.worktree_git(task_worktree, "add", "side.txt")
        self.worktree_git(task_worktree, "commit", "-m", "feat: side task")
        self.worktree_git(task_worktree, "switch", task_branch)
        self.worktree_git(
            task_worktree,
            "merge",
            "--no-ff",
            "task-side",
            "-m",
            "merge: forbidden task history",
        )
        task_head = self.worktree_git(task_worktree, "rev-parse", "HEAD").stdout.strip()

        self.error(self.integrate_task(task_branch, task_worktree, task_head))
        self.assertEqual(self.local_oid(leaf), leaf_head)
        self.assertEqual(self.remote_oid(leaf), leaf_head)

    def test_integrate_task_requires_safe_task_ref(self) -> None:
        """非 ASCII kebab 的临时 Task ref 必须在读取 ref 前失败。"""

        started = self.start("task-ref")
        leaf = str(started["branch"])
        leaf_head = str(started["head"])
        task_branch = "codex/task_invalid"
        task_worktree = self.add_task_worktree(task_branch)
        task_head = self.commit_task_file(task_worktree)

        error = self.error(self.integrate_task(task_branch, task_worktree, task_head))
        self.assertIn("codex/task-<ascii-kebab-task-slug>", str(error["error"]))
        self.assertEqual(self.local_oid(leaf), leaf_head)
        self.assertEqual(self.remote_oid(leaf), leaf_head)

    def test_integrate_task_rejects_protected_state_changes(self) -> None:
        """Task 提交不得以语义等价的字节漂移改写受保护链状态。"""

        started = self.start("task-protected-state")
        leaf = str(started["branch"])
        leaf_head = str(started["head"])
        task_branch = "codex/task-protected-state"
        task_worktree = self.add_task_worktree(task_branch)
        state_path = task_worktree / ".harness" / "git-branch-chain.json"
        state_path.write_text(
            state_path.read_text(encoding="utf-8") + "\n", encoding="utf-8"
        )
        self.worktree_git(task_worktree, "add", ".harness/git-branch-chain.json")
        self.worktree_git(task_worktree, "commit", "-m", "chore: alter state bytes")
        task_head = self.worktree_git(task_worktree, "rev-parse", "HEAD").stdout.strip()

        self.error(self.integrate_task(task_branch, task_worktree, task_head))
        self.assertEqual(self.local_oid(leaf), leaf_head)
        self.assertEqual(self.remote_oid(leaf), leaf_head)

    def test_integrate_task_rejects_protected_state_change_then_revert(self) -> None:
        """中间提交触碰状态后再恢复原字节也不得绕过逐提交门禁。"""

        started = self.start("task-state-revert")
        leaf = str(started["branch"])
        leaf_head = str(started["head"])
        task_branch = "codex/task-state-revert"
        task_worktree = self.add_task_worktree(task_branch)
        state_path = task_worktree / ".harness" / "git-branch-chain.json"
        original_state = state_path.read_bytes()
        state_path.write_bytes(original_state + b"\n")
        self.worktree_git(task_worktree, "add", ".harness/git-branch-chain.json")
        self.worktree_git(task_worktree, "commit", "-m", "chore: alter protected state")
        state_path.write_bytes(original_state)
        self.worktree_git(task_worktree, "add", ".harness/git-branch-chain.json")
        self.worktree_git(task_worktree, "commit", "-m", "chore: restore protected state")
        task_head = self.worktree_git(task_worktree, "rev-parse", "HEAD").stdout.strip()

        error = self.error(self.integrate_task(task_branch, task_worktree, task_head))
        self.assertIn("task commits must not change", str(error["error"]))
        self.assertEqual(state_path.read_bytes(), original_state)
        self.assertEqual(self.local_oid(leaf), leaf_head)
        self.assertEqual(self.remote_oid(leaf), leaf_head)

    def test_integrate_task_rejects_other_task_worktree_occupancy(self) -> None:
        """整合窗口只允许 active leaf 协调 Worktree 与目标 Task Worktree。"""

        started = self.start("task-occupancy")
        leaf = str(started["branch"])
        leaf_head = str(started["head"])
        task_branch = "codex/task-selected"
        task_worktree = self.add_task_worktree(task_branch)
        task_head = self.commit_task_file(task_worktree)
        self.add_task_worktree("codex/task-other", start_point=leaf)

        error = self.error(self.integrate_task(task_branch, task_worktree, task_head))
        self.assertIn("another Task or unit Worktree", str(error["error"]))
        self.assertEqual(self.local_oid(leaf), leaf_head)
        self.assertEqual(self.remote_oid(leaf), leaf_head)

    def test_start_rejects_release_as_remote_default(self) -> None:
        """单阶段发布只接受 main/master，Release 不能伪装成动态默认分支。"""

        before = self.git("rev-parse", "HEAD").stdout.strip()
        self.bare_git("update-ref", "refs/heads/Release", before)
        self.bare_git("symbolic-ref", "HEAD", "refs/heads/Release")
        self.error(self.helper("start", "--summary", "forbidden-release"))
        self.assertEqual(self.git("branch", "--show-current").stdout.strip(), "main")
        self.assertEqual(self.git("rev-parse", "HEAD").stdout.strip(), before)
        self.assertFalse((self.root / ".harness" / "git-branch-chain.json").exists())

    def test_start_rejects_non_main_master_default_without_ref_changes(self) -> None:
        """动态 HEAD 指向其他名称时，在创建状态或 feature ref 前失败关闭。"""

        self.git("branch", "-m", "main", "trunk")
        self.git("push", "--set-upstream", "origin", "trunk")
        self.bare_git("symbolic-ref", "HEAD", "refs/heads/trunk")
        self.git("push", "origin", "--delete", "main")
        local_before = self.git(
            "for-each-ref", "--format=%(refname)%00%(objectname)", "refs/heads"
        ).stdout
        remote_before = self.git("ls-remote", "--heads", "origin").stdout

        error = self.error(self.helper("start", "--summary", "unsupported-default"))

        self.assertIn("main or master", str(error["error"]))
        self.assertEqual(
            self.git("for-each-ref", "--format=%(refname)%00%(objectname)", "refs/heads").stdout,
            local_before,
        )
        self.assertEqual(self.git("ls-remote", "--heads", "origin").stdout, remote_before)
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
        self.error(self.release())
        self.assertEqual(self.remote_oid(branch), self.local_oid(branch))
        self.assertEqual(self.remote_oid("main"), changed_default)

    def test_release_atomically_updates_default_and_cleans_exact_two_branch_chain(self) -> None:
        """关闭提交直接进入默认分支，只清理 manifest 精确登记的 feature refs。"""

        first, first_head, second, second_head = self.prepare_two_branch_chain()
        unregistered = "feature-unregistered-20260908"
        self.git("branch", unregistered, self.default_head)
        self.git("push", "origin", f"{unregistered}:refs/heads/{unregistered}")
        result = self.payload(self.release())
        release_head = str(result["releaseHead"])
        self.assertEqual(result["releaseBranch"], "main")
        self.assertEqual(result["defaultBranch"], "main")
        self.assertEqual(self.remote_oid("main"), release_head)
        self.assertEqual(self.local_oid("main"), release_head)
        self.assertIsNone(self.remote_oid("Release"))
        self.assertIsNone(self.local_oid("Release"))
        self.assertIsNone(self.remote_oid(first))
        self.assertIsNone(self.remote_oid(second))
        self.assertIsNone(self.local_oid(first))
        self.assertIsNone(self.local_oid(second))
        self.assertEqual(self.remote_oid(unregistered), self.default_head)
        self.assertEqual(self.local_oid(unregistered), self.default_head)
        self.assertEqual(self.git("branch", "--show-current").stdout.strip(), "main")
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
        review = state["lastClosedChain"]["releaseReview"]
        self.assertEqual(review["selection"], "enabled")
        self.assertEqual(review["status"], "passed")
        self.assertEqual(review["sourceHead"], second_head)
        self.assertEqual(review["reviewedSourceCommit"], second_head)
        self.assertRegex(review["scopeDiffSha256"], r"^[0-9a-f]{64}$")
        selections = state["lastClosedChain"]["candidateSelections"]
        self.assertEqual(selections["performanceSelection"], "not-applicable")
        self.assertEqual(selections["macosSigningSelection"], "not-applicable")
        verified = self.payload(self.helper("verify-release-review"))
        self.assertEqual(verified["status"], "release-review-verified")
        self.assertEqual(verified["releaseHead"], release_head)
        self.assertEqual(verified["releaseReview"], review)
        self.assertEqual(verified["candidateSelections"], selections)

    def test_release_supports_master_as_dynamic_default(self) -> None:
        """仓库以 master 为默认分支时，发布直接推进并切回 master。"""

        self.use_master_default()
        started = self.start("master-default")
        feature = str(started["branch"])
        source_head = self.commit_file("master.txt", "master\n")
        self.payload(self.helper("publish"))

        result = self.payload(self.release(source_head=source_head))

        self.assertEqual(result["releaseBranch"], "master")
        self.assertEqual(result["defaultBranch"], "master")
        self.assertEqual(self.remote_oid("master"), result["releaseHead"])
        self.assertEqual(self.local_oid("master"), result["releaseHead"])
        self.assertEqual(self.git("branch", "--show-current").stdout.strip(), "master")
        self.assertIsNone(self.local_oid(feature))
        self.assertIsNone(self.remote_oid(feature))
        self.assertIsNone(self.local_oid("Release"))
        self.assertIsNone(self.remote_oid("Release"))

    def test_existing_release_is_migrated_to_default_and_deleted(self) -> None:
        """升级前遗留 Release 只作一次迁移基线，成功后本地远端均精确删除。"""

        self.git("switch", "-c", "Release")
        self.git("push", "--set-upstream", "origin", "Release")
        started = self.start("migrate-release")
        feature = str(started["branch"])
        source_head = self.commit_file("migration.txt", "migrated\n")
        self.payload(self.helper("publish"))

        result = self.payload(self.release(source_head=source_head))

        self.assertEqual(result["releaseBranch"], "main")
        self.assertEqual(self.remote_oid("main"), result["releaseHead"])
        self.assertEqual(self.local_oid("main"), result["releaseHead"])
        self.assertIsNone(self.remote_oid("Release"))
        self.assertIsNone(self.local_oid("Release"))
        self.assertIsNone(self.remote_oid(feature))
        self.assertIsNone(self.local_oid(feature))
        self.assertEqual(self.git("branch", "--show-current").stdout.strip(), "main")

    def test_release_requires_review_envelope_before_creating_close_commit(self) -> None:
        """活动链缺少当次审查选择与源码终点时不得先形成关闭提交。"""

        started = self.start("review-required")
        leaf = str(started["branch"])
        source_head = self.commit_file("reviewed.txt", "reviewed\n")
        self.payload(self.helper("publish"))
        state_before = (self.root / ".harness" / "git-branch-chain.json").read_bytes()

        error = self.error(self.helper("release"))
        self.assertIn("--review-selection", str(error["error"]))
        self.assertEqual(self.local_oid(leaf), source_head)
        self.assertEqual(self.remote_oid(leaf), source_head)
        self.assertEqual(
            (self.root / ".harness" / "git-branch-chain.json").read_bytes(),
            state_before,
        )

    def test_release_does_not_infer_enabled_review_evidence(self) -> None:
        """裸启用选择不能让 helper 自行补成 passed 或预设完成项。"""

        started = self.start("review-explicit")
        leaf = str(started["branch"])
        source_head = self.commit_file("explicit.txt", "explicit\n")
        self.payload(self.helper("publish"))
        error = self.error(
            self.helper(
                "release",
                "--review-selection",
                "enabled",
                "--review-source-head",
                source_head,
            )
        )
        self.assertIn("enabled lastClosedChain.releaseReview", str(error["error"]))
        self.assertEqual(self.local_oid(leaf), source_head)
        self.assertEqual(self.remote_oid(leaf), source_head)

    def test_legacy_close_without_review_cannot_update_remote_default(self) -> None:
        """旧关闭提交只可收尾已完成远端事务，不能新推进默认分支。"""

        started = self.start("legacy-review")
        leaf = str(started["branch"])
        pre_close_head = self.commit_file("legacy.txt", "legacy\n")
        self.payload(self.helper("publish"))
        active = read_state(self.root)["activeChain"]
        default_before = self.remote_oid("main")
        legacy_state = {
            "schemaVersion": 1,
            "activeChain": None,
            "lastClosedChain": {
                "remote": active["remote"],
                "baseBranch": active["baseBranch"],
                "baseHead": active["baseHead"],
                "defaultBranch": active["defaultBranch"],
                "defaultHead": active["defaultHead"],
                "releaseHeadBefore": None,
                "closingHead": None,
                "entries": [
                    {"branch": leaf, "preCloseHead": pre_close_head}
                ],
            },
        }
        state_path = self.root / ".harness" / "git-branch-chain.json"
        state_path.write_text(
            json.dumps(legacy_state, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        self.git("add", ".harness/git-branch-chain.json")
        self.git("commit", "-m", "chore(git): close legacy branch chain")

        error = self.error(self.release())
        self.assertIn("legacy closing", str(error["error"]))
        self.assertEqual(self.remote_oid("main"), default_before)
        self.assertIsNone(self.remote_oid("Release"))
        self.assertEqual(self.remote_oid(leaf), pre_close_head)

    def test_legacy_remote_complete_allows_local_cleanup_only(self) -> None:
        """旧远端 Release 事务已完成时只恢复本地收尾，不推进默认分支。"""

        started = self.start("legacy-complete")
        leaf = str(started["branch"])
        pre_close_head = self.commit_file("legacy-complete.txt", "legacy\n")
        self.payload(self.helper("publish"))
        active = read_state(self.root)["activeChain"]
        default_before = self.remote_oid("main")
        legacy_state = {
            "schemaVersion": 1,
            "activeChain": None,
            "lastClosedChain": {
                "remote": active["remote"],
                "baseBranch": active["baseBranch"],
                "baseHead": active["baseHead"],
                "defaultBranch": active["defaultBranch"],
                "defaultHead": active["defaultHead"],
                "releaseHeadBefore": None,
                "closingHead": None,
                "entries": [
                    {"branch": leaf, "preCloseHead": pre_close_head}
                ],
            },
        }
        state_path = self.root / ".harness" / "git-branch-chain.json"
        state_path.write_text(
            json.dumps(legacy_state, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        self.git("add", ".harness/git-branch-chain.json")
        self.git("commit", "-m", "chore(git): close legacy branch chain")
        closing_head = self.git("rev-parse", "HEAD").stdout.strip()
        self.git(
            "push",
            "--atomic",
            "--force-with-lease=refs/heads/Release:",
            f"--force-with-lease=refs/heads/{leaf}:{pre_close_head}",
            "origin",
            f"{closing_head}:refs/heads/Release",
            f":refs/heads/{leaf}",
        )

        result = self.payload(self.release())

        self.assertEqual(result["status"], "legacy-local-cleanup-complete")
        self.assertTrue(result["migrationRequired"])
        self.assertFalse(result["remoteDefaultAdvanced"])
        self.assertEqual(result["releaseBranch"], "Release")
        self.assertEqual(self.remote_oid("main"), default_before)
        self.assertEqual(self.remote_oid("Release"), closing_head)
        self.assertEqual(self.local_oid("Release"), closing_head)
        self.assertIsNone(self.remote_oid(leaf))
        self.assertIsNone(self.local_oid(leaf))
        self.assertEqual(self.git("branch", "--show-current").stdout.strip(), "Release")
        next_chain = self.start("migrate-recovered-release")
        self.assertEqual(next_chain["parent"], "Release")
        self.assertEqual(next_chain["parentHead"], closing_head)

    def test_legacy_cleanup_recovers_from_release_base_without_push(self) -> None:
        """从仍在旧基线的本地 Release 发现 closing leaf，并只做本地收尾。"""

        started = self.start("legacy-release-base")
        leaf = str(started["branch"])
        pre_close_head = self.commit_file("legacy-release-base.txt", "legacy\n")
        self.payload(self.helper("publish"))
        active = read_state(self.root)["activeChain"]
        default_before = self.remote_oid("main")
        legacy_state = {
            "schemaVersion": 1,
            "activeChain": None,
            "lastClosedChain": {
                "remote": active["remote"],
                "baseBranch": active["baseBranch"],
                "baseHead": active["baseHead"],
                "defaultBranch": active["defaultBranch"],
                "defaultHead": active["defaultHead"],
                "releaseHeadBefore": None,
                "closingHead": None,
                "entries": [
                    {"branch": leaf, "preCloseHead": pre_close_head}
                ],
            },
        }
        state_path = self.root / ".harness" / "git-branch-chain.json"
        state_path.write_text(
            json.dumps(legacy_state, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        self.git("add", ".harness/git-branch-chain.json")
        self.git("commit", "-m", "chore(git): close legacy branch chain")
        closing_head = self.git("rev-parse", "HEAD").stdout.strip()
        self.git(
            "push",
            "--atomic",
            "--force-with-lease=refs/heads/Release:",
            f"--force-with-lease=refs/heads/{leaf}:{pre_close_head}",
            "origin",
            f"{closing_head}:refs/heads/Release",
            f":refs/heads/{leaf}",
        )
        self.git("branch", "Release", str(active["baseHead"]))
        self.git("switch", "Release")
        self.assertEqual(self.local_oid("Release"), active["baseHead"])
        self.assertEqual(self.local_oid(leaf), closing_head)
        self.install_hook(self.remote, "pre-receive", "exit 47\n")

        result = self.payload(self.release())

        self.assertEqual(result["status"], "legacy-local-cleanup-complete")
        self.assertFalse(result["remoteDefaultAdvanced"])
        self.assertEqual(result["releaseBranch"], "Release")
        self.assertEqual(result["releaseHead"], closing_head)
        self.assertEqual(self.remote_oid("main"), default_before)
        self.assertEqual(self.remote_oid("Release"), closing_head)
        self.assertIsNone(self.remote_oid(leaf))
        self.assertEqual(self.local_oid("main"), default_before)
        self.assertEqual(self.local_oid("Release"), closing_head)
        self.assertIsNone(self.local_oid(leaf))
        self.assertEqual(self.git("branch", "--show-current").stdout.strip(), "Release")

    def test_release_seals_disabled_review_as_not_run(self) -> None:
        """无硬要求时关闭审查也必须原子保存公开原因与剩余风险。"""

        self.start("review-disabled")
        source_head = self.commit_file("disabled.txt", "disabled\n")
        self.payload(self.helper("publish"))
        result = self.payload(
            self.release(
                selection="disabled",
                source_head=source_head,
                reason="Semantic review was explicitly disabled for this release.",
                remaining_risk="Nonessential semantic defects may remain undiscovered.",
            )
        )
        review = result["releaseReview"]
        self.assertEqual(review["selection"], "disabled")
        self.assertEqual(review["status"], "Not run")
        self.assertIsNone(review["reviewedSourceCommit"])
        self.assertEqual(review["checks"], [])
        self.assertEqual(
            review["reason"],
            "Semantic review was explicitly disabled for this release.",
        )
        self.assertEqual(
            review["remainingRisk"],
            "Nonessential semantic defects may remain undiscovered.",
        )

    def test_release_seals_gui_candidate_choices_with_review(self) -> None:
        """性能与 macOS 签名选择和原因在同一关闭提交中持久化。"""

        self.start("candidate-selections")
        source_head = self.commit_file("candidate.txt", "candidate\n")
        self.payload(self.helper("publish"))
        result = self.payload(
            self.release(
                source_head=source_head,
                performance_selection="disabled",
                performance_source="requested",
                performance_reason="Performance measurement was explicitly disabled.",
                performance_remaining_risk="Release performance remains unmeasured.",
                macos_signing_selection="disabled",
                macos_signing_source="not-requested",
                macos_signing_reason="No signing source was requested for this release.",
                macos_signing_remaining_risk="The macOS candidate will be unsigned.",
            )
        )
        selections = result["candidateSelections"]
        self.assertEqual(selections["performanceSelection"], "disabled")
        self.assertEqual(selections["performanceSource"], "requested")
        self.assertEqual(selections["macosSigningSelection"], "disabled")
        self.assertEqual(selections["macosSigningSource"], "not-requested")
        self.assertEqual(
            self.payload(self.helper("verify-release-review"))["candidateSelections"],
            selections,
        )

    def test_release_allows_only_release_metadata_after_review_source(self) -> None:
        """审查终点后可追加双语发布日志与日期 Changelog，不可夹带源码。"""

        self.start("review-metadata")
        source_head = self.commit_file("source.txt", "source\n")
        self.payload(self.helper("publish"))
        (self.root / "release-notes.json").write_text("{}\n", encoding="utf-8")
        changelog = self.root / "docs" / "changelog" / "20260908_CHANGELOG.md"
        changelog.parent.mkdir(parents=True)
        changelog.write_text("# Changelog\n", encoding="utf-8")
        self.git("add", "release-notes.json", "docs/changelog/20260908_CHANGELOG.md")
        self.git("commit", "-m", "docs(release): record notes")
        self.payload(self.helper("publish"))

        result = self.payload(self.release(source_head=source_head))
        self.assertEqual(result["releaseReview"]["sourceHead"], source_head)
        self.assertEqual(
            result["releaseReview"]["reviewedSourceCommit"], source_head
        )

    def test_release_rejects_source_change_after_review_source(self) -> None:
        """审查终点后的任意非发布元数据路径使关闭操作失败。"""

        started = self.start("review-drift")
        leaf = str(started["branch"])
        source_head = self.commit_file("source.txt", "source\n")
        self.payload(self.helper("publish"))
        drift_head = self.commit_file("late-source.txt", "late\n")
        self.payload(self.helper("publish"))

        error = self.error(self.release(source_head=source_head))
        self.assertIn("post-review commits", str(error["error"]))
        self.assertEqual(self.local_oid(leaf), drift_head)
        self.assertEqual(self.remote_oid(leaf), drift_head)

    def test_release_rejects_post_review_source_change_then_revert(self) -> None:
        """审查后先改非元数据再恢复最终树也不能绕过逐提交检查。"""

        started = self.start("review-revert")
        leaf = str(started["branch"])
        source_head = self.commit_file("source.txt", "source\n")
        self.payload(self.helper("publish"))
        self.commit_file("temporary-source.txt", "must remain visible in history\n")
        self.git("rm", "temporary-source.txt")
        self.git("commit", "-m", "revert: remove temporary source")
        reverted_head = self.git("rev-parse", "HEAD").stdout.strip()
        self.payload(self.helper("publish"))
        self.assertEqual(
            self.git("diff", "--name-only", source_head, reverted_head).stdout,
            "",
        )

        error = self.error(self.release(source_head=source_head))
        self.assertIn("post-review commits", str(error["error"]))
        self.assertEqual(self.local_oid(leaf), reverted_head)
        self.assertEqual(self.remote_oid(leaf), reverted_head)

    def test_next_chain_starts_from_published_default_without_release_branch(self) -> None:
        """发布停在默认分支且不创建 Release，下一条链直接从该默认 HEAD 开始。"""

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
        released = self.payload(self.release())
        self.assertEqual(self.remote_oid("main"), released["releaseHead"])
        self.assertEqual(self.local_oid("main"), released["releaseHead"])
        self.assertIsNone(self.remote_oid(feature))
        self.assertIsNone(self.local_oid(feature))
        self.assertIsNone(self.remote_oid("Release"))
        self.assertIsNone(self.local_oid("Release"))
        self.assertEqual(self.git("branch", "--show-current").stdout.strip(), "main")

        next_started = self.start("next-release")
        next_feature = str(next_started["branch"])
        next_state = read_state(self.root)["activeChain"]
        self.assertEqual(next_state["baseBranch"], "main")
        self.assertEqual(next_state["baseHead"], released["releaseHead"])
        self.assertEqual(next_state["entries"][0]["parent"], "main")
        self.assertEqual(self.local_oid(next_feature), next_started["head"])
        self.assertEqual(self.remote_oid(next_feature), next_started["head"])
        self.assertIsNone(self.remote_oid("Release"))

    def test_release_rejects_frozen_parent_ref_drift_without_deleting_refs(self) -> None:
        """父分支在子分支建立后移动时，release 不接受漂移或删除远端链。"""

        first, first_head, second, second_head = self.prepare_two_branch_chain()
        default_before = self.remote_oid("main")
        self.git("update-ref", f"refs/heads/{first}", second_head, first_head)
        self.bare_git("update-ref", f"refs/heads/{first}", second_head, first_head)
        self.error(self.release())
        self.assertEqual(self.remote_oid("main"), default_before)
        self.assertIsNone(self.remote_oid("Release"))
        self.assertEqual(self.remote_oid(first), second_head)
        self.assertEqual(self.remote_oid(second), second_head)

    def test_release_rejects_merge_history_without_deleting_remote_leaf(self) -> None:
        """active leaf 即使完整推送，只要含 merge 历史也不得关闭或删除。"""

        leaf = str(self.start("merge-history")["branch"])
        default_before = self.remote_oid("main")
        self.git("switch", "-c", "side-history")
        self.commit_file("side.txt", "side\n")
        self.git("switch", leaf)
        self.git("merge", "--no-ff", "side-history", "-m", "merge: forbidden history")
        merge_head = self.git("rev-parse", "HEAD").stdout.strip()
        self.payload(self.helper("publish"))
        self.error(self.release())
        self.assertEqual(self.remote_oid("main"), default_before)
        self.assertIsNone(self.remote_oid("Release"))
        self.assertEqual(self.remote_oid(leaf), merge_head)

    def test_remote_hook_rejection_keeps_atomic_refs_and_retry_reuses_close_commit(self) -> None:
        """远端拒绝一个删除时不部分更新；重试复用同一关闭提交。"""

        first, _, second, _ = self.prepare_two_branch_chain()
        default_before = self.remote_oid("main")
        first_before = self.remote_oid(first)
        second_before = self.remote_oid(second)
        hook = self.install_hook(
            self.remote,
            "update",
            f'[ "$1" = "refs/heads/{first}" ] && [ "$3" = "{'0' * 40}" ] && exit 17\nexit 0\n',
        )
        failed = self.release()
        self.error(failed)
        closing_head = self.git("rev-parse", "HEAD").stdout.strip()
        sealed_review = read_state(self.root)["lastClosedChain"]["releaseReview"]
        self.assertEqual(self.remote_oid("main"), default_before)
        self.assertIsNone(self.remote_oid("Release"))
        self.assertEqual(self.remote_oid(first), first_before)
        self.assertEqual(self.remote_oid(second), second_before)
        hook.unlink()
        result = self.payload(self.release())
        self.assertEqual(result["releaseHead"], closing_head)
        self.assertEqual(result["releaseReview"], sealed_review)
        self.assertEqual(self.remote_oid("main"), closing_head)
        self.assertIsNone(self.remote_oid("Release"))

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
        failed = self.release()
        self.error(failed)
        closing_head = self.remote_oid("main")
        sealed_review = read_state(self.root)["lastClosedChain"]["releaseReview"]
        self.assertIsNotNone(closing_head)
        self.assertIsNone(self.remote_oid(first))
        self.assertIsNone(self.remote_oid(second))
        self.assertIsNotNone(self.local_oid(first))
        self.assertIsNotNone(self.local_oid(second))
        hook.unlink()
        reject_push = self.install_hook(self.remote, "pre-receive", "exit 23\n")
        result = self.payload(self.release())
        self.assertEqual(result["releaseHead"], closing_head)
        self.assertEqual(result["releaseReview"], sealed_review)
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
        self.error(self.release())
        self.assertEqual(self.git("rev-parse", "HEAD").stdout.strip(), head_before)
        self.assertEqual(
            (self.root / ".harness" / "git-branch-chain.json").read_bytes(), state_before
        )
        self.assertEqual(self.remote_oid(first), self.local_oid(first))
        self.assertEqual(self.remote_oid(second), second_head)
        self.assertEqual(self.remote_oid("main"), self.default_head)

    def test_default_branch_worktree_occupancy_blocks_before_close_commit(self) -> None:
        """另一 Worktree 占用默认分支时，发布不得先推进远端或形成关闭提交。"""

        first, _, second, second_head = self.prepare_two_branch_chain()
        default_worktree = Path(self.temporary.name) / "default worktree"
        self.git("worktree", "add", str(default_worktree), "main")
        state_path = self.root / ".harness" / "git-branch-chain.json"
        state_before = state_path.read_bytes()
        head_before = self.git("rev-parse", "HEAD").stdout.strip()
        default_before = self.remote_oid("main")

        error = self.error(self.release())

        self.assertIn("checked out by another worktree", str(error["error"]))
        self.assertEqual(self.git("rev-parse", "HEAD").stdout.strip(), head_before)
        self.assertEqual(state_path.read_bytes(), state_before)
        self.assertEqual(self.remote_oid("main"), default_before)
        self.assertEqual(self.remote_oid(first), self.local_oid(first))
        self.assertEqual(self.remote_oid(second), second_head)
        self.assertIsNone(self.remote_oid("Release"))

    def test_remote_without_atomic_capability_never_falls_back(self) -> None:
        """远端不支持 atomic 时保留默认分支与全部 feature refs，不顺序降级。"""

        first, _, second, _ = self.prepare_two_branch_chain()
        default_before = self.remote_oid("main")
        first_before = self.remote_oid(first)
        second_before = self.remote_oid(second)
        self.bare_git("config", "receive.advertiseAtomic", "false")
        self.error(self.release())
        self.assertEqual(self.remote_oid("main"), default_before)
        self.assertIsNone(self.remote_oid("Release"))
        self.assertEqual(self.remote_oid(first), first_before)
        self.assertEqual(self.remote_oid(second), second_before)


class CandidateSelectionStateTests(unittest.TestCase):
    """锁定 closing commit 候选选择字段和重试逐字段一致性。"""

    @staticmethod
    def valid_selections() -> dict[str, str | None]:
        """返回一个完整且可独立变异的 GUI 候选选择信封。"""

        return {
            "performanceSelection": "disabled",
            "performanceSource": "requested",
            "performanceReason": "Performance measurement was explicitly disabled.",
            "performanceRemainingRisk": "Release performance remains unmeasured.",
            "macosSigningSelection": "disabled",
            "macosSigningSource": "not-requested",
            "macosSigningReason": "No signing source was requested for this release.",
            "macosSigningRemainingRisk": "The macOS candidate will be unsigned.",
        }

    def test_candidate_selections_require_every_field(self) -> None:
        """缺少任一字段都不能形成可写入关闭提交的信封。"""

        selections = self.valid_selections()
        del selections["macosSigningRemainingRisk"]
        with self.assertRaisesRegex(StateError, "candidateSelections fields are invalid"):
            validate_candidate_selections(selections)

    def test_candidate_selections_reject_invalid_source_and_reason_combinations(self) -> None:
        """选择、来源、原因和风险必须属于同一规范分支。"""

        mutations = (
            ("performanceSource", "channel-required"),
            ("performanceReason", None),
            ("macosSigningSource", "requested"),
        )
        for field, value in mutations:
            with self.subTest(field=field, value=value):
                selections = self.valid_selections()
                selections[field] = value
                with self.assertRaises(StateError):
                    validate_candidate_selections(selections)

        selections = self.valid_selections()
        selections.update(
            {
                "performanceSelection": "enabled",
                "performanceSource": "requested",
            }
        )
        with self.assertRaisesRegex(StateError, "enabled performance selection is inconsistent"):
            validate_candidate_selections(selections)

    def test_release_retry_rejects_candidate_selection_mismatch(self) -> None:
        """显式重传的候选选择若有一项漂移，重试必须停止。"""

        source_head = "2" * 40
        review = {
            "selection": "enabled",
            "status": "passed",
            "sourceHead": source_head,
            "reviewedSourceCommit": source_head,
            "checks": list(RELEASE_REVIEW_CHECKS),
            "evidenceSummary": "Concentrated release review completed.",
            "reason": None,
            "remainingRisk": None,
        }
        selections = self.valid_selections()
        with self.assertRaisesRegex(
            branch_chain_operations.GitError,
            "retry candidate selections do not match the sealed release state",
        ):
            branch_chain_operations.require_retry_review_arguments_match(
                {"releaseReview": review, "candidateSelections": selections},
                "enabled",
                "passed",
                source_head,
                source_head,
                list(RELEASE_REVIEW_CHECKS),
                "Concentrated release review completed.",
                None,
                None,
                "disabled",
                "requested",
                "Performance measurement was explicitly disabled.",
                "Release performance remains unmeasured.",
                "enabled",
                "requested",
                None,
                None,
            )


if __name__ == "__main__":
    unittest.main()
