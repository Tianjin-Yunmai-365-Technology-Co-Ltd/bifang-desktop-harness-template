#!/usr/bin/env python3
"""对 Git 生命周期 helper 执行隔离的真实仓库黑盒回归。"""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
import unittest


SCRIPT = Path(__file__).with_name("git_lifecycle.py")
SHANGHAI = timezone(timedelta(hours=8), name="Asia/Shanghai")


class GitLifecycleTests(unittest.TestCase):
    """在每个独立临时仓库中验证分支、标签、推送和精确清理行为。"""

    def setUp(self) -> None:
        """为每个场景建立自动回收的隔离文件系统根。"""
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)

    def tearDown(self) -> None:
        """回收测试仓库、远端和 Worktree，不触碰真实用户数据。"""
        self.temporary.cleanup()

    def git(
        self,
        cwd: Path,
        *arguments: str,
        check: bool = True,
    ) -> subprocess.CompletedProcess[str]:
        """以测试专用非交互环境执行 Git，并在意外失败时展示夹具诊断。"""
        environment = os.environ.copy()
        environment["GIT_TERMINAL_PROMPT"] = "0"
        environment["GCM_INTERACTIVE"] = "Never"
        result = subprocess.run(
            ["git", "-C", str(cwd), *arguments],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=environment,
            check=False,
        )
        if check and result.returncode != 0:
            self.fail(f"git {' '.join(arguments)} failed: {result.stderr}")
        return result

    def initialize_repository(self, *, remote: bool) -> tuple[Path, Path | None]:
        """创建带首个 main 提交的仓库，并按场景选择本地 bare 远端。"""
        repository = self.root / "repository"
        repository.mkdir()
        self.git(repository, "init", "-b", "main")
        self.git(repository, "config", "user.name", "Lifecycle Test")
        self.git(repository, "config", "user.email", "lifecycle@example.invalid")
        (repository / "base.txt").write_text("base\n", encoding="utf-8")
        self.git(repository, "add", "base.txt")
        self.git(repository, "commit", "-m", "initial")
        if not remote:
            return repository, None
        bare = self.root / "remote.git"
        bare.mkdir()
        self.git(bare, "init", "--bare")
        self.git(bare, "symbolic-ref", "HEAD", "refs/heads/main")
        self.git(repository, "remote", "add", "origin", str(bare))
        self.git(repository, "push", "-u", "origin", "main")
        return repository, bare

    def helper(
        self,
        repository: Path,
        *arguments: str,
        success: bool = True,
    ) -> tuple[dict[str, object], subprocess.CompletedProcess[str]]:
        """运行 helper，验证标准输出始终是唯一一行 JSON 和预期退出状态。"""
        result = subprocess.run(
            [sys.executable, str(SCRIPT), *arguments, "--project-root", str(repository)],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        self.assertEqual(result.stderr, "")
        self.assertEqual(len(result.stdout.splitlines()), 1, result.stdout)
        payload = json.loads(result.stdout)
        if success:
            self.assertEqual(result.returncode, 0, payload)
            self.assertNotEqual(payload.get("status"), "error")
        else:
            self.assertNotEqual(result.returncode, 0, payload)
            self.assertEqual(payload.get("status"), "error")
        return payload, result

    def commit_file(self, repository: Path, name: str, content: str) -> str:
        """在指定 Worktree 提交一个可观察文件并返回新提交 OID。"""
        (repository / name).write_text(content, encoding="utf-8")
        self.git(repository, "add", name)
        self.git(repository, "commit", "-m", f"add {name}")
        return self.git(repository, "rev-parse", "HEAD").stdout.strip()

    def state(self, repository: Path) -> dict[str, object]:
        """从 Git common-dir 读取 helper 的未跟踪生命周期状态。"""
        common = self.git(
            repository,
            "rev-parse",
            "--path-format=absolute",
            "--git-common-dir",
        ).stdout.strip()
        return json.loads((Path(common) / "agent-first-harness" / "git-lifecycle.json").read_text())

    def local_branch_exists(self, repository: Path, branch: str) -> bool:
        """精确判断本地分支是否存在。"""
        return self.git(
            repository,
            "show-ref",
            "--verify",
            "--quiet",
            f"refs/heads/{branch}",
            check=False,
        ).returncode == 0

    def remote_branch_exists(self, repository: Path, branch: str) -> bool:
        """精确判断 origin 上的分支是否存在。"""
        return bool(
            self.git(repository, "ls-remote", "--heads", "origin", f"refs/heads/{branch}").stdout.strip()
        )

    def install_hook(self, bare: Path, body: str) -> None:
        """安装测试专用 pre-receive hook，以观察标签和清理的远端顺序。"""
        hook = bare / "hooks" / "pre-receive"
        hook.write_text("#!/bin/sh\nset -eu\n" + body, encoding="utf-8")
        hook.chmod(0o755)

    def test_help_and_invalid_arguments_are_single_line_json(self) -> None:
        """验证帮助与参数错误也遵守单行 JSON，且不会向标准错误输出用法文本。"""
        for arguments, expected_code in ((["--help"], 0), ([], 1)):
            result = subprocess.run(
                [sys.executable, str(SCRIPT), *arguments],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
            )
            self.assertEqual(result.returncode, expected_code)
            self.assertEqual(result.stderr, "")
            self.assertEqual(len(result.stdout.splitlines()), 1)
            self.assertIsInstance(json.loads(result.stdout), dict)

    def test_start_without_remote_is_idempotent_and_uses_common_dir_state(self) -> None:
        """验证无远端也能开始开发，同摘要复用且状态不会写入项目目录。"""
        repository, _ = self.initialize_repository(remote=False)
        payload, _ = self.helper(repository, "start", "--summary", "offline-fix")
        branch = str(payload["branch"])
        self.assertRegex(branch, r"^feature-offline-fix-\d{8}$")
        self.assertEqual(payload["remote"], None)
        self.assertEqual(self.git(repository, "branch", "--show-current").stdout.strip(), branch)
        repeated, _ = self.helper(repository, "start", "--summary", "offline-fix")
        self.assertEqual(repeated["status"], "already-started")
        self.assertEqual(repeated["branch"], branch)
        common = Path(
            self.git(repository, "rev-parse", "--path-format=absolute", "--git-common-dir").stdout.strip()
        )
        self.assertTrue((common / "agent-first-harness" / "git-lifecycle.json").is_file())
        self.assertFalse((repository / ".harness" / "git-lifecycle.json").exists())

    def test_start_adds_numeric_suffix_for_local_name_collisions(self) -> None:
        """验证基础名和第二候选均碰撞时自动选取第三个唯一分支名。"""
        repository, _ = self.initialize_repository(remote=False)
        date = datetime.now(tz=SHANGHAI).strftime("%Y%m%d")
        base = f"feature-collision-{date}"
        self.git(repository, "branch", base)
        self.git(repository, "branch", f"{base}-2")
        payload, _ = self.helper(repository, "start", "--summary", "collision")
        self.assertEqual(payload["branch"], f"{base}-3")

    def test_concurrent_task_starts_preserve_both_branches_and_worktrees(self) -> None:
        """验证两个 Task 同时开始时共享清单串行更新且不会后写覆盖先写。"""
        repository, _ = self.initialize_repository(remote=False)
        worktrees = [self.root / "task-one", self.root / "task-two"]
        for worktree in worktrees:
            self.git(repository, "worktree", "add", "--detach", str(worktree), "HEAD")
        processes = [
            subprocess.Popen(
                [
                    sys.executable,
                    str(SCRIPT),
                    "start",
                    "--summary",
                    summary,
                    "--project-root",
                    str(worktree),
                ],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            for worktree, summary in zip(worktrees, ("parallel-one", "parallel-two"))
        ]
        payloads: list[dict[str, object]] = []
        for process in processes:
            stdout, stderr = process.communicate(timeout=15)
            self.assertEqual(process.returncode, 0, stdout)
            self.assertEqual(stderr, "")
            self.assertEqual(len(stdout.splitlines()), 1)
            payloads.append(json.loads(stdout))
        branches = {str(payload["branch"]) for payload in payloads}
        cycle = self.state(repository)["cycle"]
        self.assertEqual({entry["name"] for entry in cycle["branches"]}, branches)
        self.assertEqual(
            {entry["path"] for entry in cycle["worktrees"]},
            {str(worktree.resolve()) for worktree in worktrees},
        )

    def test_detached_task_worktree_start_is_registered_and_release_removes_it(self) -> None:
        """验证 detached Task 直接建立 feature 分支，发布后自动清理其分支与 Worktree。"""
        repository, _ = self.initialize_repository(remote=True)
        task_worktree = self.root / "task-worktree"
        self.git(repository, "worktree", "add", "--detach", str(task_worktree), "HEAD")

        inspected, _ = self.helper(task_worktree, "inspect")
        self.assertIsNone(inspected["branch"])
        started, _ = self.helper(task_worktree, "start", "--summary", "detached-task")
        feature = str(started["branch"])
        self.assertTrue(started["worktreeTracked"])
        self.assertRegex(feature, r"^feature-detached-task-\d{8}$")
        self.assertEqual(self.git(task_worktree, "branch", "--show-current").stdout.strip(), feature)
        cycle = self.state(task_worktree)["cycle"]
        self.assertEqual(
            cycle["worktrees"],
            [{"path": str(task_worktree.resolve()), "branch": feature}],
        )
        repeated, _ = self.helper(task_worktree, "start", "--summary", "detached-task")
        self.assertEqual(repeated["status"], "already-started")
        self.assertTrue(repeated["worktreeTracked"])
        self.assertEqual(self.state(task_worktree)["cycle"]["worktrees"], cycle["worktrees"])

        expected_head = self.commit_file(task_worktree, "task.txt", "task result\n")
        self.git(task_worktree, "push", "origin", f"refs/heads/{feature}:refs/heads/{feature}")
        released, _ = self.helper(
            task_worktree,
            "release",
            "--version",
            "1.2.3",
            "--date",
            "20260909",
        )
        self.assertEqual(released["head"], expected_head)
        self.assertEqual(released["tag"], "v1.2.3-20260909")
        self.assertEqual(released["worktree"], str(repository.resolve()))
        self.assertFalse(task_worktree.exists())
        self.assertFalse(self.local_branch_exists(repository, feature))
        self.assertFalse(self.remote_branch_exists(repository, feature))

    def test_publish_merges_switches_and_pushes_without_tag_or_cleanup(self) -> None:
        """验证 push 流程合并并停在 main，同时保留登记分支且不创建标签。"""
        repository, _ = self.initialize_repository(remote=True)
        started, _ = self.helper(repository, "start", "--summary", "publish-only")
        branch = str(started["branch"])
        expected_head = self.commit_file(repository, "published.txt", "published\n")
        self.git(repository, "push", "origin", f"refs/heads/{branch}:refs/heads/{branch}")
        payload, _ = self.helper(repository, "publish")
        self.assertEqual(payload["status"], "published")
        self.assertEqual(payload["branch"], "main")
        self.assertEqual(payload["head"], expected_head)
        self.assertFalse(payload["tagged"])
        self.assertFalse(payload["cleaned"])
        self.assertEqual(self.git(repository, "branch", "--show-current").stdout.strip(), "main")
        remote_main = self.git(repository, "ls-remote", "--heads", "origin", "refs/heads/main")
        self.assertTrue(remote_main.stdout.startswith(expected_head + "\t"))
        self.assertTrue(self.local_branch_exists(repository, branch))
        self.assertTrue(self.remote_branch_exists(repository, branch))
        self.assertEqual(self.git(repository, "tag", "--list").stdout, "")
        self.assertIsNotNone(self.state(repository)["cycle"])

    def test_publish_merges_current_remote_default_before_development_branches(self) -> None:
        """验证远端 main 已推进时先普通同步，再合并登记分支并推送共同结果。"""
        repository, bare = self.initialize_repository(remote=True)
        assert bare is not None
        started, _ = self.helper(repository, "start", "--summary", "remote-advance")
        feature = str(started["branch"])
        feature_head = self.commit_file(repository, "feature.txt", "feature\n")

        collaborator = self.root / "collaborator"
        self.git(self.root, "clone", str(bare), str(collaborator))
        self.git(collaborator, "config", "user.name", "Remote Collaborator")
        self.git(collaborator, "config", "user.email", "remote@example.invalid")
        remote_head = self.commit_file(collaborator, "remote.txt", "remote\n")
        self.git(collaborator, "push", "origin", "main")

        published, _ = self.helper(repository, "publish")
        published_head = str(published["head"])
        self.assertEqual(published["branch"], "main")
        self.assertEqual(
            self.git(repository, "merge-base", "--is-ancestor", remote_head, published_head).returncode,
            0,
        )
        self.assertEqual(
            self.git(repository, "merge-base", "--is-ancestor", feature_head, published_head).returncode,
            0,
        )
        self.assertTrue((repository / "remote.txt").is_file())
        self.assertTrue((repository / "feature.txt").is_file())
        self.assertTrue(
            self.git(repository, "ls-remote", "--heads", "origin", "refs/heads/main").stdout.startswith(
                published_head + "\t"
            )
        )
        self.assertTrue(self.local_branch_exists(repository, feature))

    def test_publish_refuses_to_omit_a_missing_registered_branch(self) -> None:
        """验证登记分支异常缺失时不会把不完整结果推到远端 main。"""
        repository, _ = self.initialize_repository(remote=True)
        remote_before = self.git(repository, "ls-remote", "--heads", "origin", "refs/heads/main").stdout
        started, _ = self.helper(repository, "start", "--summary", "missing-branch")
        feature = str(started["branch"])
        self.commit_file(repository, "missing.txt", "must not disappear\n")
        self.git(repository, "switch", "main")
        self.git(repository, "branch", "-D", "--", feature)

        blocked, _ = self.helper(repository, "publish", success=False)
        self.assertEqual(blocked["code"], "registered-branch-missing")
        self.assertEqual(
            self.git(repository, "ls-remote", "--heads", "origin", "refs/heads/main").stdout,
            remote_before,
        )

    def test_release_tag_rejection_leaves_resources_and_remote_drift_blocks_cleanup(self) -> None:
        """验证标签推送拒绝时不清理，远端主分支漂移后也不能清理。"""
        repository, bare = self.initialize_repository(remote=True)
        assert bare is not None
        started, _ = self.helper(repository, "start", "--summary", "tag-rejected")
        branch = str(started["branch"])
        self.commit_file(repository, "rejected.txt", "rejected\n")
        self.git(repository, "push", "origin", f"refs/heads/{branch}:refs/heads/{branch}")
        self.install_hook(
            bare,
            'while read old new ref; do\n  case "$ref" in refs/tags/*) exit 1 ;; esac\ndone\n',
        )
        rejected, _ = self.helper(
            repository,
            "release",
            "--version",
            "1.0.0",
            "--date",
            "20260909",
            success=False,
        )
        self.assertEqual(rejected["code"], "tag-push-failed")
        self.assertTrue(self.local_branch_exists(repository, branch))
        self.assertTrue(self.remote_branch_exists(repository, branch))
        pending = self.state(repository)["cycle"]["pendingRelease"]
        self.assertEqual(pending["tag"], "v1.0.0-20260909")

        detached = self.root / "pending-release-worktree"
        self.git(repository, "worktree", "add", "--detach", str(detached), "HEAD")
        blocked_start, _ = self.helper(
            detached,
            "start",
            "--summary",
            "must-wait",
            success=False,
        )
        self.assertEqual(blocked_start["code"], "release-in-progress")
        self.assertEqual(self.git(detached, "branch", "--show-current").stdout, "")
        self.git(repository, "worktree", "remove", "--", str(detached))

        self.install_hook(bare, "while read old new ref; do :; done\n")
        collaborator = self.root / "post-publish-collaborator"
        self.git(self.root, "clone", str(bare), str(collaborator))
        self.git(collaborator, "config", "user.name", "Remote Collaborator")
        self.git(collaborator, "config", "user.email", "remote@example.invalid")
        remote_after = self.commit_file(collaborator, "after.txt", "after pending release\n")
        self.git(collaborator, "push", "origin", "main")
        blocked, _ = self.helper(
            repository,
            "release",
            "--version",
            "1.0.0",
            "--date",
            "20260909",
            success=False,
        )
        self.assertEqual(blocked["code"], "remote-state-changed")
        self.assertTrue(
            self.git(repository, "ls-remote", "--heads", "origin", "refs/heads/main").stdout.startswith(
                remote_after + "\t"
            )
        )
        self.assertTrue(self.local_branch_exists(repository, branch))
        self.assertTrue(self.remote_branch_exists(repository, branch))
        self.assertEqual(
            self.git(repository, "ls-remote", "--tags", "origin", f"refs/tags/{pending['tag']}").stdout,
            "",
        )

    def test_release_tag_conflict_leaves_cycle_resources(self) -> None:
        """验证同名标签指向其他提交时停止发布且不清理登记资源。"""
        repository, _ = self.initialize_repository(remote=True)
        started, _ = self.helper(repository, "start", "--summary", "tag-conflict")
        branch = str(started["branch"])
        self.commit_file(repository, "conflict.txt", "conflict\n")
        self.git(repository, "push", "origin", f"refs/heads/{branch}:refs/heads/{branch}")
        initial = self.git(repository, "rev-list", "--max-parents=0", "HEAD").stdout.strip()
        conflict_tag = "v2.0.0-20260909"
        self.git(repository, "tag", conflict_tag, initial)
        self.git(repository, "push", "origin", f"refs/tags/{conflict_tag}:refs/tags/{conflict_tag}")
        self.git(repository, "tag", "-d", conflict_tag)
        conflicted, _ = self.helper(
            repository,
            "release",
            "--version",
            "2.0.0",
            "--date",
            "20260909",
            success=False,
        )
        self.assertEqual(conflicted["code"], "tag-conflict")
        self.assertTrue(self.local_branch_exists(repository, branch))
        self.assertTrue(self.remote_branch_exists(repository, branch))
        self.assertIsNotNone(self.state(repository)["cycle"])

    def test_release_preserves_dirty_worktree_and_resumes_after_it_is_clean(self) -> None:
        """验证主分支和标签写入前拒绝脏 Worktree，并能在用户清理数据后继续。"""
        repository, _ = self.initialize_repository(remote=True)
        remote_main_before = self.git(
            repository, "ls-remote", "--heads", "origin", "refs/heads/main"
        ).stdout
        started, _ = self.helper(repository, "start", "--summary", "dirty-worktree")
        feature = str(started["branch"])
        self.commit_file(repository, "feature.txt", "feature\n")
        self.git(repository, "push", "origin", f"refs/heads/{feature}:refs/heads/{feature}")
        tracked_worktree = self.root / "dirty-worktree"
        self.git(repository, "worktree", "add", "-b", "dirty-resource", str(tracked_worktree), feature)
        self.helper(repository, "track-worktree", "--worktree", str(tracked_worktree))
        dirty_file = tracked_worktree / "valuable-untracked.txt"
        dirty_file.write_text("do not discard\n", encoding="utf-8")

        blocked, _ = self.helper(
            repository,
            "release",
            "--version",
            "2.1.0",
            "--date",
            "20260909",
            success=False,
        )
        self.assertEqual(blocked["code"], "dirty-worktree")
        self.assertTrue(dirty_file.is_file())
        self.assertTrue(tracked_worktree.is_dir())
        self.assertTrue(self.local_branch_exists(repository, feature))
        self.assertTrue(self.local_branch_exists(repository, "dirty-resource"))
        tag = "v2.1.0-20260909"
        self.assertEqual(
            self.git(repository, "ls-remote", "--tags", "origin", f"refs/tags/{tag}").stdout,
            "",
        )
        self.assertEqual(
            self.git(repository, "ls-remote", "--heads", "origin", "refs/heads/main").stdout,
            remote_main_before,
        )
        self.assertIsNone(self.state(repository)["cycle"]["pendingRelease"])

        dirty_file.unlink()
        resumed, _ = self.helper(
            repository,
            "release",
            "--version",
            "2.1.0",
            "--date",
            "20260909",
        )
        self.assertEqual(resumed["status"], "released")
        self.assertFalse(tracked_worktree.exists())
        self.assertIsNone(self.state(repository)["cycle"])

    def test_release_persists_each_cleanup_item_and_resumes_after_remote_rejection(self) -> None:
        """验证中途远端删除失败时保留逐项进度，重试只完成尚未清理的登记项。"""
        repository, bare = self.initialize_repository(remote=True)
        assert bare is not None
        started, _ = self.helper(repository, "start", "--summary", "partial-cleanup")
        feature = str(started["branch"])
        self.commit_file(repository, "feature.txt", "feature\n")
        self.git(repository, "push", "origin", f"refs/heads/{feature}:refs/heads/{feature}")
        tracked_worktree = self.root / "partial-worktree"
        self.git(repository, "worktree", "add", "-b", "partial-resource", str(tracked_worktree), feature)
        self.commit_file(tracked_worktree, "partial.txt", "partial\n")
        self.git(
            tracked_worktree,
            "push",
            "origin",
            "refs/heads/partial-resource:refs/heads/partial-resource",
        )
        self.helper(repository, "track-worktree", "--worktree", str(tracked_worktree))
        zeros = "0" * 40
        self.install_hook(
            bare,
            "while read old new ref; do\n"
            f'  if [ "$new" = "{zeros}" ] && [ "$ref" = "refs/heads/partial-resource" ]; then exit 1; fi\n'
            "done\n",
        )

        blocked, _ = self.helper(
            repository,
            "release",
            "--version",
            "2.2.0",
            "--date",
            "20260909",
            success=False,
        )
        self.assertEqual(blocked["code"], "cleanup-failed")
        self.assertFalse(tracked_worktree.exists())
        self.assertFalse(self.remote_branch_exists(repository, feature))
        self.assertTrue(self.remote_branch_exists(repository, "partial-resource"))
        cycle = self.state(repository)["cycle"]
        self.assertEqual(cycle["worktrees"], [])
        progress = {item["name"]: item["remoteDeleted"] for item in cycle["branches"]}
        self.assertEqual(progress, {feature: True, "partial-resource": False})

        self.install_hook(bare, "while read old new ref; do :; done\n")
        resumed, _ = self.helper(
            repository,
            "release",
            "--version",
            "2.2.0",
            "--date",
            "20260909",
        )
        self.assertEqual(resumed["status"], "released")
        self.assertFalse(self.remote_branch_exists(repository, "partial-resource"))
        self.assertFalse(self.local_branch_exists(repository, feature))
        self.assertFalse(self.local_branch_exists(repository, "partial-resource"))
        self.assertIsNone(self.state(repository)["cycle"])

    def test_release_tags_before_exact_cleanup_and_retry_is_idempotent(self) -> None:
        """验证远端标签先于清理，登记资源删除、未登记资源保留且重试幂等。"""
        repository, bare = self.initialize_repository(remote=True)
        assert bare is not None
        keep_worktree = self.root / "keep-worktree"
        self.git(repository, "worktree", "add", "-b", "keep-resource", str(keep_worktree), "main")
        self.git(repository, "push", "origin", "refs/heads/keep-resource:refs/heads/keep-resource")

        started, _ = self.helper(repository, "start", "--summary", "release-cleanup")
        feature = str(started["branch"])
        self.commit_file(repository, "feature.txt", "feature\n")
        self.git(repository, "push", "origin", f"refs/heads/{feature}:refs/heads/{feature}")
        tracked_worktree = self.root / "tracked-worktree"
        self.git(repository, "worktree", "add", "-b", "tracked-resource", str(tracked_worktree), feature)
        expected_head = self.commit_file(tracked_worktree, "tracked.txt", "tracked\n")
        self.git(
            tracked_worktree,
            "push",
            "origin",
            "refs/heads/tracked-resource:refs/heads/tracked-resource",
        )
        tracked, _ = self.helper(
            repository,
            "track-worktree",
            "--worktree",
            str(tracked_worktree),
        )
        self.assertEqual(tracked["status"], "worktree-tracked")
        self.assertEqual(tracked["branch"], "tracked-resource")

        tag = "v3.4.5-20260909"
        zeros = "0" * 40
        self.install_hook(
            bare,
            "while read old new ref; do\n"
            f'  if [ "$new" = "{zeros}" ]; then git show-ref --verify --quiet "refs/tags/{tag}" || exit 1; fi\n'
            "done\n",
        )
        released, _ = self.helper(
            repository,
            "release",
            "--version",
            "3.4.5",
            "--date",
            "20260909",
        )
        self.assertEqual(released["status"], "released")
        self.assertEqual(released["branch"], "main")
        self.assertEqual(released["head"], expected_head)
        self.assertEqual(released["tag"], tag)
        self.assertEqual(self.git(repository, "branch", "--show-current").stdout.strip(), "main")
        self.assertFalse(tracked_worktree.exists())
        self.assertFalse(self.local_branch_exists(repository, feature))
        self.assertFalse(self.local_branch_exists(repository, "tracked-resource"))
        self.assertFalse(self.remote_branch_exists(repository, feature))
        self.assertFalse(self.remote_branch_exists(repository, "tracked-resource"))
        self.assertTrue(keep_worktree.exists())
        self.assertTrue(self.local_branch_exists(repository, "keep-resource"))
        self.assertTrue(self.remote_branch_exists(repository, "keep-resource"))
        remote_tag = self.git(repository, "ls-remote", "--tags", "origin", f"refs/tags/{tag}")
        self.assertTrue(remote_tag.stdout.startswith(expected_head + "\t"))
        state = self.state(repository)
        self.assertIsNone(state["cycle"])
        self.assertEqual(state["lastRelease"]["tag"], tag)

        repeated, _ = self.helper(
            repository,
            "release",
            "--version",
            "3.4.5",
            "--date",
            "20260909",
        )
        self.assertEqual(repeated["status"], "already-released")
        self.assertTrue(keep_worktree.exists())
        self.assertTrue(self.remote_branch_exists(repository, "keep-resource"))


if __name__ == "__main__":
    unittest.main()
