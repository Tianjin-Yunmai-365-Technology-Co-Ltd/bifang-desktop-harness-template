"""候选 workflow 结构和执行边界回归。"""

from __future__ import annotations

import contextlib
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from collections.abc import Iterator
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import scripts.validate_harness as validate_harness
from scripts.harness_validation import governance, repository, upgrade
from scripts.harness_validation_test_support import (
    TODO_TOKEN as SHARED_TODO_TOKEN,
    read_repo_text,
    run_validator_on_tempfile,
)


from harness_workflow_test_support import HarnessWorkflowTestCase


class ValidateHarnessWorkflowExecutionTests(HarnessWorkflowTestCase):
    """对真实 run block 和 workflow 字节约束执行前向回归。"""

    def test_project_msrv_step_reads_and_normalizes_workspace_minimum(self) -> None:
        """候选 workflow 必须读取项目下界，不能恢复模板硬编码工具链。"""
        script = self._run_script(self._base_workflow(), "读取项目最低 Rust 版本")
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            environment_file = root / "github-env"
            (root / "Cargo.toml").write_text(
                '[workspace]\nmembers = []\n\n[workspace.package]\nrust-version = "1.93"\n',
                encoding="utf-8",
            )
            env = os.environ.copy()
            env.update(
                {
                    "GITHUB_ENV": str(environment_file),
                    "PYTHON_COMMAND": sys.executable,
                }
            )
            result = subprocess.run(
                ["bash", "-c", script],
                cwd=root,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(
                environment_file.read_text(encoding="utf-8"),
                "RUSTUP_TOOLCHAIN=1.93.0\n",
            )

            (root / "Cargo.toml").write_text(
                "[workspace]\nmembers = []\n",
                encoding="utf-8",
            )
            rejected = subprocess.run(
                ["bash", "-c", script],
                cwd=root,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertNotEqual(rejected.returncode, 0)
            self.assertIn("缺少 [workspace.package]", rejected.stderr)

    def test_manifest_and_atomic_commit_run_against_real_files(self) -> None:
        """真实执行 workflow 内嵌脚本，覆盖三件套成功路径与结构化签名证据。"""
        workflow = self._base_workflow()
        manifest_script = self._run_script(workflow, "记录候选清单")
        commit_script = self._run_script(workflow, "提交候选制品集合")
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            release = root / "release"
            release.mkdir()
            stage = root / ".release-clean.candidate.test"
            stage.mkdir()
            archive_name = "example-tool-v1.2.3-linux-x64.tar.gz"
            archive = stage / archive_name
            archive.write_bytes(b"candidate-bytes")
            digest = hashlib.sha256(archive.read_bytes()).hexdigest()
            (stage / f"{archive_name}.sha256").write_text(
                f"{digest}  {archive_name}\n",
                encoding="ascii",
            )
            env = os.environ.copy()
            env.update(
                {
                    "GITHUB_WORKSPACE": str(root),
                    "CANDIDATE_ARCHIVE": archive_name,
                    "CANDIDATE_STAGE": str(stage),
                    "PRODUCT_NAME": "example-tool",
                    "VERSION": "1.2.3",
                    "SOURCE_COMMIT": "a" * 40,
                    "BUILD_RUN_ID": "fixture-1",
                    "E2E_SELECTION": "disabled",
                    "RUNNER_OS": "Linux",
                    "RUNNER_ARCH": "X64",
                    "SIGNING_STATUS": "signed",
                    "SIGNING_REASON": "configured-hook-succeeded",
                    "SIGNING_EVIDENCE": "configured-hook-verify-exit-0",
                    "PYTHON_COMMAND": sys.executable,
                }
            )

            manifest_result = subprocess.run(
                ["bash", "-c", manifest_script],
                cwd=root,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(manifest_result.returncode, 0, manifest_result.stderr)
            manifest = json.loads(
                (stage / f"{archive_name}.manifest.json").read_text(encoding="utf-8")
            )
            self.assertEqual(manifest["sha256"], digest)
            self.assertEqual(manifest["e2eSelection"], "disabled")
            self.assertEqual(
                manifest["signingEvidence"]["verification"],
                "configured-hook-verify-exit-0",
            )

            commit_result = subprocess.run(
                ["bash", "-c", commit_script],
                cwd=root,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(commit_result.returncode, 0, commit_result.stderr)
            self.assertFalse(stage.exists())
            self.assertEqual(
                {path.name for path in release.iterdir()},
                {archive_name, f"{archive_name}.sha256", f"{archive_name}.manifest.json"},
            )

    def test_atomic_commit_rejects_extra_staging_file_before_replacing_release(self) -> None:
        """staging 多出文件时必须在删除空 release 前失败。"""
        script = self._run_script(self._base_workflow(), "提交候选制品集合")
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            release = root / "release"
            release.mkdir()
            stage = root / ".release-clean.candidate.test"
            stage.mkdir()
            archive_name = "example-tool-v1.2.3-linux-x64.tar.gz"
            for name in (
                archive_name,
                f"{archive_name}.sha256",
                f"{archive_name}.manifest.json",
                "unexpected.txt",
            ):
                (stage / name).write_text("fixture", encoding="utf-8")
            env = os.environ.copy()
            env.update(
                {
                    "GITHUB_WORKSPACE": str(root),
                    "CANDIDATE_ARCHIVE": archive_name,
                    "CANDIDATE_STAGE": str(stage),
                    "PYTHON_COMMAND": sys.executable,
                }
            )

            result = subprocess.run(
                ["bash", "-c", script],
                cwd=root,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("提交前候选暂存目录文件集发生变化", result.stderr)
            self.assertTrue(release.is_dir())
            self.assertEqual(list(release.iterdir()), [])
            self.assertTrue(stage.is_dir())

    def test_rejects_commented_out_test_command(self) -> None:
        """注释中保留命令文本不能冒充活动的 cargo test。"""

        mutated = self._base_workflow().replace(
            "          cargo test --workspace --all-targets --all-features --locked\n",
            "          # cargo test --workspace --all-targets --all-features --locked\n",
            1,
        )
        errors = self._validate(mutated)
        self.assertTrue(errors)

    def test_rejects_pending_comment_masking_accepted_manifest(self) -> None:
        """accepted 状态不能靠旁边 pending 注释绕过。"""

        mutated = self._base_workflow().replace(
            '              "milestoneAcceptance": "pending",\n',
            '              "milestoneAcceptance": "accepted",  # '
            '"milestoneAcceptance": "pending"\n',
            1,
        )
        errors = self._validate(mutated)
        self.assertTrue(errors)

    def test_rejects_success_comment_masking_always_upload(self) -> None:
        """always() 上传不能靠同一行 success 注释绕过。"""

        mutated = self._base_workflow().replace(
            "        if: success()\n        with:\n",
            "        if: always() # if: success()\n        with:\n",
            1,
        )
        errors = self._validate(mutated)
        self.assertTrue(errors)

    def test_rejects_unreviewed_workflow_bytes_and_arbitrary_dispatch_input(self) -> None:
        """全文件摘要必须拒绝未审字节与未审 dispatch 输入。"""

        unreviewed_bytes = self._base_workflow() + "\n:\n"
        self.assertTrue(self._validate(unreviewed_bytes))
        marker = "      version:\n"
        extra_input = "      arbitrary_command:\n        type: string\n"
        self.assertTrue(
            self._validate(
                self._base_workflow().replace(
                    marker,
                    extra_input + marker,
                    1,
                )
            )
        )

    def test_rejects_extra_runtime_step_and_mutable_action_tag(self) -> None:
        """候选 workflow 不得加入真实产物执行，也不得恢复可变 action tag。"""

        extra_step = (
            "\n      - name: Run candidate binary\n"
            "        run: ./target/release/example-tool --version\n"
        )
        self.assertTrue(self._validate(self._base_workflow() + extra_step))
        mutable = self._base_workflow().replace(
            "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
            "actions/checkout@v4",
            1,
        )
        self.assertTrue(self._validate(mutable))
