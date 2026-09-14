#!/usr/bin/env python3
"""对 Git 生命周期 helper 执行隔离的真实仓库黑盒回归。"""

from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
import unittest
from unittest import mock


SCRIPT = Path(__file__).with_name("git_lifecycle.py")
SHANGHAI = timezone(timedelta(hours=8), name="Asia/Shanghai")


def load_lifecycle_module() -> object:
    """加载被测 helper 模块，供无法由真实 Git 稳定制造的异常路径做受控注入。"""
    module_name = "_agent_first_git_lifecycle_test_target"
    specification = importlib.util.spec_from_file_location(module_name, SCRIPT)
    if specification is None or specification.loader is None:
        raise RuntimeError("Git lifecycle test module cannot be loaded.")
    module = importlib.util.module_from_spec(specification)
    sys.modules[module_name] = module
    specification.loader.exec_module(module)
    return module


LIFECYCLE = load_lifecycle_module()


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

    def add_bare_remote(self, repository: Path, name: str, default_branch: str) -> Path:
        """增加具有独立默认分支的真实 bare 远端，并以当前 main 初始化它。"""
        bare = self.root / f"{name}.git"
        bare.mkdir()
        self.git(bare, "init", "--bare")
        self.git(bare, "symbolic-ref", "HEAD", f"refs/heads/{default_branch}")
        self.git(repository, "remote", "add", name, str(bare))
        self.git(
            repository,
            "push",
            name,
            f"refs/heads/main:refs/heads/{default_branch}",
        )
        return bare

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

    def test_registered_remote_precedes_origin_and_conflicting_override_fails(self) -> None:
        """多远端仓库沿用已登记名称，并拒绝周期中途切换到 origin。"""

        repository, bare = self.initialize_repository(remote=True)
        assert bare is not None
        self.git(repository, "remote", "add", "github", str(bare))
        self.git(repository, "fetch", "github")
        self.git(repository, "remote", "set-head", "github", "--auto")

        started, _ = self.helper(
            repository,
            "start",
            "--summary",
            "stored-remote",
            "--remote",
            "github",
        )
        self.assertEqual(started["remote"], "github")
        inspected, _ = self.helper(repository, "inspect")
        self.assertEqual(inspected["remote"], "github")

        rejected, _ = self.helper(repository, "inspect", "--remote", "origin", success=False)
        self.assertEqual(rejected["code"], "remote-conflict")
        rejected_missing, _ = self.helper(
            repository,
            "inspect",
            "--remote",
            "not-configured",
            success=False,
        )
        self.assertEqual(rejected_missing["code"], "remote-conflict")

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

    def test_publish_pushes_same_head_to_additional_remote_without_rebinding(self) -> None:
        """验证双 bare 远端各用自己的默认分支接收同一 HEAD，主远端绑定保持不变。"""
        repository, github = self.initialize_repository(remote=True)
        assert github is not None
        self.git(repository, "remote", "rename", "origin", "github")
        self.add_bare_remote(repository, "origin", "stable")
        started, _ = self.helper(
            repository,
            "start",
            "--summary",
            "multi-remote",
            "--remote",
            "github",
        )
        self.assertEqual(started["remote"], "github")
        expected_head = self.commit_file(repository, "multi-remote.txt", "shared head\n")

        published, _ = self.helper(
            repository,
            "publish",
            "--also-remote",
            "origin",
        )

        self.assertEqual(published["remote"], "github")
        self.assertEqual(published["branch"], "main")
        self.assertEqual(published["head"], expected_head)
        self.assertEqual(
            published["publishedRemotes"],
            [
                {"remote": "github", "branch": "main"},
                {"remote": "origin", "branch": "stable"},
            ],
        )
        self.assertTrue(
            self.git(repository, "ls-remote", "--heads", "github", "refs/heads/main").stdout.startswith(
                expected_head + "\t"
            )
        )
        self.assertTrue(
            self.git(
                repository,
                "ls-remote",
                "--heads",
                "origin",
                "refs/heads/stable",
            ).stdout.startswith(expected_head + "\t")
        )
        state = self.state(repository)
        self.assertEqual(state["remote"], "github")
        self.assertEqual(state["defaultBranch"], "main")

    def test_publish_rejects_invalid_additional_remote_sets_before_pushing(self) -> None:
        """验证主远端重复、补充远端重复或未配置时，在任何合并与推送前拒绝。"""
        repository, github = self.initialize_repository(remote=True)
        assert github is not None
        self.git(repository, "remote", "rename", "origin", "github")
        self.add_bare_remote(repository, "origin", "stable")
        unborn = self.root / "unborn.git"
        unborn.mkdir()
        self.git(unborn, "init", "--bare")
        self.git(unborn, "symbolic-ref", "HEAD", "refs/heads/unborn")
        self.git(repository, "remote", "add", "unborn", str(unborn))
        started, _ = self.helper(
            repository,
            "start",
            "--summary",
            "invalid-remotes",
            "--remote",
            "github",
        )
        feature = str(started["branch"])
        self.commit_file(repository, "invalid-remotes.txt", "must not publish\n")
        github_before = self.git(
            repository,
            "ls-remote",
            "--heads",
            "github",
            "refs/heads/main",
        ).stdout
        origin_before = self.git(
            repository,
            "ls-remote",
            "--heads",
            "origin",
            "refs/heads/stable",
        ).stdout

        same_as_primary, _ = self.helper(
            repository,
            "publish",
            "--also-remote",
            "github",
            success=False,
        )
        self.assertEqual(same_as_primary["code"], "invalid-argument")
        duplicate, _ = self.helper(
            repository,
            "publish",
            "--also-remote",
            "origin",
            "--also-remote",
            "origin",
            success=False,
        )
        self.assertEqual(duplicate["code"], "invalid-argument")
        missing, _ = self.helper(
            repository,
            "publish",
            "--also-remote",
            "missing",
            success=False,
        )
        self.assertEqual(missing["code"], "remote-not-found")
        unresolved_default, _ = self.helper(
            repository,
            "publish",
            "--also-remote",
            "origin",
            "--also-remote",
            "unborn",
            success=False,
        )
        self.assertEqual(unresolved_default["code"], "remote-default-unavailable")
        conflicting_primary, _ = self.helper(
            repository,
            "publish",
            "--remote",
            "origin",
            success=False,
        )
        self.assertEqual(conflicting_primary["code"], "remote-conflict")
        self.assertEqual(self.git(repository, "branch", "--show-current").stdout.strip(), feature)
        self.assertEqual(
            self.git(repository, "ls-remote", "--heads", "github", "refs/heads/main").stdout,
            github_before,
        )
        self.assertEqual(
            self.git(repository, "ls-remote", "--heads", "origin", "refs/heads/stable").stdout,
            origin_before,
        )
        self.assertEqual(self.state(repository)["remote"], "github")

    def test_publish_primary_failure_context_keeps_additional_targets_unattempted(self) -> None:
        """验证有补充目标时主远端拒绝会点名主目标、结果和全部未尝试目标。"""
        repository, github = self.initialize_repository(remote=True)
        assert github is not None
        self.git(repository, "remote", "rename", "origin", "github")
        self.add_bare_remote(repository, "origin", "stable")
        self.helper(
            repository,
            "start",
            "--summary",
            "primary-rejected",
            "--remote",
            "github",
        )
        self.commit_file(repository, "primary-rejected.txt", "reject primary\n")
        primary_before = self.git(
            repository, "ls-remote", "--heads", "github", "refs/heads/main"
        ).stdout
        additional_before = self.git(
            repository, "ls-remote", "--heads", "origin", "refs/heads/stable"
        ).stdout
        self.install_hook(
            github,
            'while read old new ref; do\n  if [ "$ref" = "refs/heads/main" ]; then exit 1; fi\ndone\n',
        )

        rejected, _ = self.helper(
            repository,
            "publish",
            "--remote",
            "github",
            "--also-remote",
            "origin",
            success=False,
        )

        self.assertEqual(rejected["code"], "primary-push-rejected")
        self.assertIn("Primary Git remote 'github' branch 'main'", rejected["message"])
        self.assertIn("current target result is rejected", rejected["message"])
        self.assertIn("all additional targets were not attempted", rejected["message"])
        self.assertIn("remote 'origin' branch 'stable'", rejected["message"])
        self.assertIn("same arguments can be retried", rejected["message"])
        self.assertEqual(
            self.git(repository, "ls-remote", "--heads", "github", "refs/heads/main").stdout,
            primary_before,
        )
        self.assertEqual(
            self.git(repository, "ls-remote", "--heads", "origin", "refs/heads/stable").stdout,
            additional_before,
        )

    def test_primary_confirmed_push_contextualizes_local_verification_failure(self) -> None:
        """验证主远端复读已确认后，本地位置异常仍保留主成功与补充未尝试语义。"""
        repository = LIFECYCLE.Repository(root=self.root, common_dir=self.root)
        state = {"remote": None, "defaultBranch": None}
        targets = [{"remote": "origin", "branch": "stable"}]
        completed = subprocess.CompletedProcess(["git"], 0, "", "")
        with (
            mock.patch.object(LIFECYCLE, "run_git", return_value=completed),
            mock.patch.object(LIFECYCLE, "remote_branch_oid", return_value="a" * 40),
            mock.patch.object(
                LIFECYCLE,
                "verify_local_position",
                side_effect=LIFECYCLE.LifecycleError("local-state-changed", "local drift"),
            ),
            mock.patch.object(LIFECYCLE, "save_state") as save_state,
        ):
            with self.assertRaises(LIFECYCLE.LifecycleError) as raised:
                LIFECYCLE.publish_primary_remote(
                    repository,
                    state,
                    "github",
                    "main",
                    "a" * 40,
                    targets,
                )

        self.assertEqual(raised.exception.code, "primary-local-state-changed")
        self.assertIn("Primary Git remote 'github' branch 'main'", raised.exception.message)
        self.assertIn("current target is confirmed published", raised.exception.message)
        self.assertIn("all additional targets were not attempted", raised.exception.message)
        self.assertIn("remote 'origin' branch 'stable'", raised.exception.message)
        self.assertIn("same arguments can be retried", raised.exception.message)
        save_state.assert_not_called()

    def test_primary_uncertain_failures_contextualize_unattempted_targets(self) -> None:
        """验证主 push 传输或复读不确定时均保留目标、未尝试范围与重试语义。"""
        repository = LIFECYCLE.Repository(root=self.root, common_dir=self.root)
        targets = [{"remote": "origin", "branch": "stable"}]
        completed = subprocess.CompletedProcess(["git"], 0, "", "")

        def fail_with_requested_context(*_arguments, **keywords):
            raise LIFECYCLE.LifecycleError(keywords["code"], keywords["message"])

        cases = (
            (
                "transport",
                fail_with_requested_context,
                "d" * 40,
                "primary-push-failed",
            ),
            (
                "reread",
                completed,
                LIFECYCLE.LifecycleError("remote-read-failed", "read failure"),
                "primary-verification-failed",
            ),
        )
        for label, push_result, reread_result, expected_code in cases:
            with self.subTest(label=label):
                state = {"remote": None, "defaultBranch": None}
                run_effect = push_result if callable(push_result) else None
                reread_effect = reread_result if isinstance(reread_result, BaseException) else None
                with (
                    mock.patch.object(
                        LIFECYCLE,
                        "run_git",
                        return_value=None if run_effect is not None else push_result,
                        side_effect=run_effect,
                    ),
                    mock.patch.object(
                        LIFECYCLE,
                        "remote_branch_oid",
                        return_value=None if reread_effect is not None else reread_result,
                        side_effect=reread_effect,
                    ),
                    mock.patch.object(LIFECYCLE, "verify_local_position"),
                    mock.patch.object(LIFECYCLE, "save_state"),
                ):
                    with self.assertRaises(LIFECYCLE.LifecycleError) as raised:
                        LIFECYCLE.publish_primary_remote(
                            repository,
                            state,
                            "github",
                            "main",
                            "d" * 40,
                            targets,
                        )

                self.assertEqual(raised.exception.code, expected_code)
                self.assertIn("Primary Git remote 'github' branch 'main'", raised.exception.message)
                self.assertIn("current target outcome is uncertain", raised.exception.message)
                self.assertIn("all additional targets were not attempted", raised.exception.message)
                self.assertIn("remote 'origin' branch 'stable'", raised.exception.message)
                self.assertIn("same arguments can be retried", raised.exception.message)

    def test_primary_confirmed_push_contextualizes_state_save_failure(self) -> None:
        """验证主远端和本地位置均确认后，状态保存异常仍报告主成功与可重试范围。"""
        repository = LIFECYCLE.Repository(root=self.root, common_dir=self.root)
        state = {"remote": None, "defaultBranch": None}
        targets = [{"remote": "origin", "branch": "stable"}]
        completed = subprocess.CompletedProcess(["git"], 0, "", "")
        with (
            mock.patch.object(LIFECYCLE, "run_git", return_value=completed),
            mock.patch.object(LIFECYCLE, "remote_branch_oid", return_value="b" * 40),
            mock.patch.object(LIFECYCLE, "verify_local_position"),
            mock.patch.object(
                LIFECYCLE,
                "save_state",
                side_effect=LIFECYCLE.LifecycleError("state-write-failed", "state failure"),
            ),
        ):
            with self.assertRaises(LIFECYCLE.LifecycleError) as raised:
                LIFECYCLE.publish_primary_remote(
                    repository,
                    state,
                    "github",
                    "main",
                    "b" * 40,
                    targets,
                )

        self.assertEqual(raised.exception.code, "primary-state-write-failed")
        self.assertIn("Primary Git remote 'github' branch 'main'", raised.exception.message)
        self.assertIn("current target is confirmed published", raised.exception.message)
        self.assertIn("all additional targets were not attempted", raised.exception.message)
        self.assertIn("remote 'origin' branch 'stable'", raised.exception.message)
        self.assertIn("same arguments can be retried", raised.exception.message)

    def test_additional_confirmed_push_contextualizes_local_verification_failure(self) -> None:
        """验证补充远端复读确认后本地漂移会点名已成功当前目标和未尝试后续目标。"""
        repository = LIFECYCLE.Repository(root=self.root, common_dir=self.root)
        targets = [
            {"remote": "origin", "branch": "stable"},
            {"remote": "archive", "branch": "delivery"},
        ]
        completed = subprocess.CompletedProcess(["git"], 0, "", "")
        with (
            mock.patch.object(LIFECYCLE, "run_git", return_value=completed) as run_git,
            mock.patch.object(LIFECYCLE, "remote_branch_oid", return_value="c" * 40),
            mock.patch.object(
                LIFECYCLE,
                "verify_local_position",
                side_effect=LIFECYCLE.LifecycleError("local-state-changed", "local drift"),
            ),
        ):
            with self.assertRaises(LIFECYCLE.LifecycleError) as raised:
                LIFECYCLE.push_additional_remotes(
                    repository,
                    targets,
                    "main",
                    "c" * 40,
                )

        self.assertEqual(raised.exception.code, "additional-local-state-changed")
        self.assertIn("remote 'origin' branch 'stable'", raised.exception.message)
        self.assertIn("current target is confirmed published", raised.exception.message)
        self.assertIn("subsequent additional targets were not attempted", raised.exception.message)
        self.assertIn("remote 'archive' branch 'delivery'", raised.exception.message)
        self.assertIn("same arguments can be retried", raised.exception.message)
        self.assertEqual(run_git.call_count, 1)

    def test_additional_uncertain_failures_contextualize_partial_progress(self) -> None:
        """验证补充 push 传输或复读不确定时均披露前序成功与后续未尝试范围。"""
        repository = LIFECYCLE.Repository(root=self.root, common_dir=self.root)
        targets = [
            {"remote": "origin", "branch": "stable"},
            {"remote": "archive", "branch": "delivery"},
        ]
        completed = subprocess.CompletedProcess(["git"], 0, "", "")

        def fail_with_requested_context(*_arguments, **keywords):
            raise LIFECYCLE.LifecycleError(keywords["code"], keywords["message"])

        cases = (
            (
                "transport",
                fail_with_requested_context,
                "e" * 40,
                "additional-push-failed",
            ),
            (
                "reread",
                completed,
                LIFECYCLE.LifecycleError("remote-read-failed", "read failure"),
                "additional-verification-failed",
            ),
        )
        for label, push_result, reread_result, expected_code in cases:
            with self.subTest(label=label):
                run_effect = push_result if callable(push_result) else None
                reread_effect = reread_result if isinstance(reread_result, BaseException) else None
                with (
                    mock.patch.object(
                        LIFECYCLE,
                        "run_git",
                        return_value=None if run_effect is not None else push_result,
                        side_effect=run_effect,
                    ),
                    mock.patch.object(
                        LIFECYCLE,
                        "remote_branch_oid",
                        return_value=None if reread_effect is not None else reread_result,
                        side_effect=reread_effect,
                    ),
                    mock.patch.object(LIFECYCLE, "verify_local_position"),
                ):
                    with self.assertRaises(LIFECYCLE.LifecycleError) as raised:
                        LIFECYCLE.push_additional_remotes(
                            repository,
                            targets,
                            "main",
                            "e" * 40,
                        )

                self.assertEqual(raised.exception.code, expected_code)
                self.assertIn("remote 'origin' branch 'stable'", raised.exception.message)
                self.assertIn("primary target and earlier additional targets are confirmed published", raised.exception.message)
                self.assertIn("current target outcome is uncertain", raised.exception.message)
                self.assertIn("subsequent additional targets were not attempted", raised.exception.message)
                self.assertIn("remote 'archive' branch 'delivery'", raised.exception.message)
                self.assertIn("same arguments can be retried", raised.exception.message)

    def test_publish_additional_remote_rejection_preserves_primary_and_retry_succeeds(self) -> None:
        """验证三个补充目标按参数顺序推进，第二个拒绝后同参数重试可完整恢复。"""
        repository, github = self.initialize_repository(remote=True)
        assert github is not None
        self.git(repository, "remote", "rename", "origin", "github")
        origin = self.add_bare_remote(repository, "origin", "stable")
        backup = self.add_bare_remote(repository, "backup", "integration")
        self.add_bare_remote(repository, "archive", "delivery")
        self.helper(
            repository,
            "start",
            "--summary",
            "retry-additional",
            "--remote",
            "github",
        )
        expected_head = self.commit_file(repository, "retry-additional.txt", "retry me\n")
        backup_before = self.git(
            repository, "ls-remote", "--heads", "backup", "refs/heads/integration"
        ).stdout
        archive_before = self.git(
            repository, "ls-remote", "--heads", "archive", "refs/heads/delivery"
        ).stdout
        self.install_hook(
            backup,
            'while read old new ref; do\n  if [ "$ref" = "refs/heads/integration" ]; then exit 1; fi\ndone\n',
        )
        arguments = (
            "publish",
            "--remote",
            "github",
            "--also-remote",
            "origin",
            "--also-remote",
            "backup",
            "--also-remote",
            "archive",
        )

        rejected, _ = self.helper(repository, *arguments, success=False)

        self.assertEqual(rejected["code"], "additional-push-rejected")
        self.assertIn("remote 'backup' branch 'integration'", rejected["message"])
        self.assertIn("remote 'origin' branch 'stable'", rejected["message"])
        self.assertIn("remote 'archive' branch 'delivery'", rejected["message"])
        self.assertIn("current target result is rejected", rejected["message"])
        self.assertIn("subsequent additional targets were not attempted", rejected["message"])
        self.assertIn("same arguments can be retried", rejected["message"])
        self.assertTrue(
            self.git(repository, "ls-remote", "--heads", "github", "refs/heads/main").stdout.startswith(
                expected_head + "\t"
            )
        )
        self.assertTrue(
            self.git(repository, "ls-remote", "--heads", "origin", "refs/heads/stable").stdout.startswith(
                expected_head + "\t"
            )
        )
        self.assertEqual(
            self.git(repository, "ls-remote", "--heads", "backup", "refs/heads/integration").stdout,
            backup_before,
        )
        self.assertEqual(
            self.git(repository, "ls-remote", "--heads", "archive", "refs/heads/delivery").stdout,
            archive_before,
        )
        state = self.state(repository)
        self.assertEqual(state["remote"], "github")
        self.assertEqual(state["defaultBranch"], "main")
        self.install_hook(backup, "while read old new ref; do :; done\n")

        resumed, _ = self.helper(repository, *arguments)

        self.assertEqual(resumed["status"], "published")
        self.assertEqual(resumed["head"], expected_head)
        self.assertEqual(
            resumed["publishedRemotes"],
            [
                {"remote": "github", "branch": "main"},
                {"remote": "origin", "branch": "stable"},
                {"remote": "backup", "branch": "integration"},
                {"remote": "archive", "branch": "delivery"},
            ],
        )
        for remote, branch in (
            ("origin", "stable"),
            ("backup", "integration"),
            ("archive", "delivery"),
        ):
            self.assertTrue(
                self.git(
                    repository,
                    "ls-remote",
                    "--heads",
                    remote,
                    f"refs/heads/{branch}",
                ).stdout.startswith(expected_head + "\t")
            )
        self.assertEqual(self.state(repository)["remote"], "github")

    def test_release_excludes_additional_remotes_and_rejects_option(self) -> None:
        """验证 release 只推送、打标签并清理主远端，且参数层拒绝补充远端。"""
        repository, github = self.initialize_repository(remote=True)
        assert github is not None
        self.git(repository, "remote", "rename", "origin", "github")
        self.add_bare_remote(repository, "origin", "stable")
        started, _ = self.helper(
            repository,
            "start",
            "--summary",
            "release-isolation",
            "--remote",
            "github",
        )
        feature = str(started["branch"])
        expected_head = self.commit_file(repository, "release-isolation.txt", "main only\n")
        self.git(repository, "push", "github", f"refs/heads/{feature}:refs/heads/{feature}")
        self.git(repository, "push", "origin", f"refs/heads/{feature}:refs/heads/{feature}")
        additional_default_before = self.git(
            repository, "ls-remote", "--heads", "origin", "refs/heads/stable"
        ).stdout
        tag = "v4.5.6-20260914"

        invalid, _ = self.helper(
            repository,
            "release",
            "--version",
            "4.5.6",
            "--date",
            "20260914",
            "--remote",
            "github",
            "--also-remote",
            "origin",
            success=False,
        )
        self.assertEqual(invalid["code"], "invalid-argument")
        self.assertEqual(
            self.git(repository, "ls-remote", "--tags", "github", f"refs/tags/{tag}").stdout,
            "",
        )
        self.assertEqual(
            self.git(repository, "ls-remote", "--tags", "origin", f"refs/tags/{tag}").stdout,
            "",
        )

        released, _ = self.helper(
            repository,
            "release",
            "--version",
            "4.5.6",
            "--date",
            "20260914",
            "--remote",
            "github",
        )

        self.assertEqual(released["status"], "released")
        self.assertEqual(released["remote"], "github")
        self.assertEqual(released["head"], expected_head)
        self.assertTrue(
            self.git(repository, "ls-remote", "--heads", "github", "refs/heads/main").stdout.startswith(
                expected_head + "\t"
            )
        )
        self.assertTrue(
            self.git(repository, "ls-remote", "--tags", "github", f"refs/tags/{tag}").stdout.startswith(
                expected_head + "\t"
            )
        )
        self.assertEqual(
            self.git(repository, "ls-remote", "--heads", "github", f"refs/heads/{feature}").stdout,
            "",
        )
        self.assertEqual(
            self.git(repository, "ls-remote", "--heads", "origin", "refs/heads/stable").stdout,
            additional_default_before,
        )
        self.assertTrue(
            self.git(repository, "ls-remote", "--heads", "origin", f"refs/heads/{feature}").stdout.startswith(
                expected_head + "\t"
            )
        )
        self.assertEqual(
            self.git(repository, "ls-remote", "--tags", "origin", f"refs/tags/{tag}").stdout,
            "",
        )

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
