"""候选 workflow 结构和执行边界回归。"""

from __future__ import annotations

import contextlib
import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import textwrap
import unittest
from collections.abc import Iterator
from pathlib import Path
from unittest import mock

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

    def _bash(self) -> str:
        """解析可执行 Bash；宿主没有该运行时能力时只跳过执行型用例。"""

        candidates = [shutil.which("bash")]
        for environment_name in ("ProgramFiles", "ProgramFiles(x86)"):
            program_files = os.environ.get(environment_name)
            if program_files:
                candidates.append(str(Path(program_files) / "Git" / "bin" / "bash.exe"))
        for candidate in candidates:
            if candidate and Path(candidate).is_file():
                return candidate
        self.skipTest("Bash is unavailable on this host")

    @staticmethod
    def _release_envelope_module():
        """按文件路径加载候选信封 helper，避免依赖全局 Python 包。"""

        path = (
            ROOT
            / ".agents"
            / "skills"
            / "desktop-prepare-cross-platform-release"
            / "scripts"
            / "verify_release_envelope.py"
        )
        specification = importlib.util.spec_from_file_location(
            "harness_test_verify_release_envelope", path
        )
        if specification is None or specification.loader is None:
            raise AssertionError("cannot load verify_release_envelope.py")
        module = importlib.util.module_from_spec(specification)
        specification.loader.exec_module(module)
        return module

    def test_release_envelope_requires_completed_direct_default_snapshot(self) -> None:
        """Runner 只接受具名默认分支上的 direct-default closing commit。"""

        helper = self._release_envelope_module()
        source_commit = "a" * 40
        base_head = "b" * 40
        feature_head = "c" * 40
        state = {
            "schemaVersion": 1,
            "activeChain": None,
            "lastClosedChain": {
                "remote": "github",
                "baseBranch": "main",
                "baseHead": base_head,
                "defaultBranch": "main",
                "defaultHead": base_head,
                "releaseHeadBefore": None,
                "closingHead": None,
                "releaseTarget": "default",
                "entries": [
                    {
                        "branch": "feature-direct-release-20260908",
                        "preCloseHead": feature_head,
                    }
                ],
                "releaseReview": {"selection": "enabled"},
                "candidateSelections": {
                    "performanceSelection": "not-applicable",
                    "performanceSource": "not-applicable",
                    "performanceReason": None,
                    "performanceRemainingRisk": None,
                    "macosSigningSelection": "not-applicable",
                    "macosSigningSource": "not-applicable",
                    "macosSigningReason": None,
                    "macosSigningRemainingRisk": None,
                },
            },
        }
        state_bytes = json.dumps(state, sort_keys=True).encode("utf-8")
        state_digest = hashlib.sha256(state_bytes).hexdigest()
        blob_oid = "d" * 40
        checked_out_head = {"oid": source_commit}
        checked_out_branch = {"name": "main"}

        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir).resolve()
            state_path = root / ".harness" / "git-branch-chain.json"
            state_path.parent.mkdir()
            state_path.write_bytes(state_bytes)

            def fake_run_git(_root, arguments, *, check=True):
                del check
                values = {
                    ("rev-parse", "--show-toplevel"): f"{root}\n".encode(),
                    ("rev-parse", "--verify", "HEAD^{commit}"): (
                        f"{checked_out_head['oid']}\n".encode()
                    ),
                    ("symbolic-ref", "--quiet", "--short", "HEAD"): (
                        f"{checked_out_branch['name']}\n".encode()
                    ),
                    (
                        "show",
                        f"{source_commit}:.harness/git-branch-chain.json",
                    ): state_bytes,
                    (
                        "rev-parse",
                        f"{source_commit}:.harness/git-branch-chain.json",
                    ): f"{blob_oid}\n".encode(),
                    (
                        "hash-object",
                        "--path=.harness/git-branch-chain.json",
                        str(state_path),
                    ): f"{blob_oid}\n".encode(),
                }
                try:
                    return values[tuple(arguments)]
                except KeyError as error:
                    raise AssertionError(f"unexpected git arguments: {arguments!r}") from error

            refs = {
                "refs/remotes/origin/main": source_commit,
                "refs/remotes/origin/Release": None,
                "refs/remotes/origin/feature-direct-release-20260908": None,
            }

            def fake_resolve_ref(_root, reference, *, missing_ok=False):
                value = refs[reference]
                if value is None and not missing_ok:
                    raise helper.EnvelopeError(f"missing required fetched ref: {reference}")
                return value

            validators = (
                lambda _root: state,
                lambda *_arguments: None,
                lambda *_arguments: None,
                lambda *_arguments: None,
            )
            with (
                mock.patch.object(helper, "run_git", side_effect=fake_run_git),
                mock.patch.object(helper, "resolve_ref", side_effect=fake_resolve_ref),
                mock.patch.object(helper, "load_branch_chain_modules", return_value=validators),
            ):
                snapshot = helper.calculate_snapshot(
                    root, source_commit, state_digest, "main"
                )
                self.assertEqual(snapshot["releaseTarget"], "default")
                self.assertEqual(snapshot["defaultBranch"], "main")

                state["lastClosedChain"].pop("releaseTarget")
                with self.assertRaisesRegex(helper.EnvelopeError, "does not target"):
                    helper.calculate_snapshot(root, source_commit, state_digest, "main")
                state["lastClosedChain"]["releaseTarget"] = "default"

                refs["refs/remotes/origin/Release"] = source_commit
                with self.assertRaisesRegex(helper.EnvelopeError, "origin/Release"):
                    helper.calculate_snapshot(root, source_commit, state_digest, "main")
                refs["refs/remotes/origin/Release"] = None

                refs["refs/remotes/origin/main"] = base_head
                with self.assertRaisesRegex(helper.EnvelopeError, "default branch"):
                    helper.calculate_snapshot(root, source_commit, state_digest, "main")
                refs["refs/remotes/origin/main"] = source_commit

                refs["refs/remotes/origin/feature-direct-release-20260908"] = feature_head
                with self.assertRaisesRegex(helper.EnvelopeError, "feature ref"):
                    helper.calculate_snapshot(root, source_commit, state_digest, "main")
                refs["refs/remotes/origin/feature-direct-release-20260908"] = None

                checked_out_branch["name"] = "feature-direct-release-20260908"
                with self.assertRaisesRegex(helper.EnvelopeError, "named repository default"):
                    helper.calculate_snapshot(root, source_commit, state_digest, "main")
                checked_out_branch["name"] = "main"

                checked_out_head["oid"] = base_head
                with self.assertRaisesRegex(helper.EnvelopeError, "named repository default"):
                    helper.calculate_snapshot(root, source_commit, state_digest, "main")
                checked_out_head["oid"] = source_commit

                state["lastClosedChain"]["baseBranch"] = "Release"
                state["lastClosedChain"]["releaseHeadBefore"] = base_head
                migrated_snapshot = helper.calculate_snapshot(
                    root, source_commit, state_digest, "main"
                )
                self.assertEqual(migrated_snapshot["releaseTarget"], "default")

                with self.assertRaisesRegex(helper.EnvelopeError, "main or master"):
                    helper.calculate_snapshot(root, source_commit, state_digest, "trunk")

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
                [self._bash(), "-c", script],
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
                [self._bash(), "-c", script],
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
            sandbox = Path(tmp_dir)
            root = sandbox / "project"
            root.mkdir()
            release = root / "release"
            release.mkdir()
            stage = sandbox / ".example-tool.release-candidate.test"
            stage.mkdir()
            archive_name = "example-tool-v1.2.3-linux-x64.tar.gz"
            archive = stage / archive_name
            release_notes = root / "release-notes.json"
            release_notes.write_text(
                '{"schemaVersion":2,"releases":[{"releaseDate":"2026-08-26",'
                '"version":"v1.2.3","featureOptimizations":[{"zh-CN":"夹具","en-US":"fixture"}],'
                '"bugFixes":[]}]}\n',
                encoding="utf-8",
            )
            binary = root / "example-tool"
            binary.write_bytes(b"candidate-binary")
            with tarfile.open(archive, "w:gz") as package:
                package.add(binary, arcname="example-tool")
                package.add(release_notes, arcname="release-notes.json")
            digest = hashlib.sha256(archive.read_bytes()).hexdigest()
            (stage / f"{archive_name}.sha256").write_text(
                f"{digest}  {archive_name}\n",
                encoding="ascii",
            )
            helper = (
                root
                / ".agents"
                / "skills"
                / "desktop-prepare-cross-platform-release"
                / "scripts"
                / "verify_release_envelope.py"
            )
            helper.parent.mkdir(parents=True)
            helper.write_text(
                "import sys\n"
                "if len(sys.argv) < 2 or sys.argv[1] != 'verify':\n"
                "    raise SystemExit('expected verify mode')\n",
                encoding="utf-8",
            )
            state_digest = "b" * 64
            release_review = {
                "selection": "disabled",
                "status": "not-run",
                "source": "explicit-user-selection",
                "reason": "fixture-disabled",
                "remainingRisk": "fixture-risk",
            }
            candidate_selections = {
                "performanceSelection": "not-applicable",
                "performanceSource": "not-applicable",
                "performanceReason": None,
                "performanceRemainingRisk": None,
                "macosSigningSelection": "not-applicable",
                "macosSigningSource": "not-applicable",
                "macosSigningReason": None,
                "macosSigningRemainingRisk": None,
            }
            snapshot = sandbox / "release-envelope-snapshot.json"
            snapshot.write_text(
                json.dumps(
                    {
                        "sourceCommit": "a" * 40,
                        "branchChainStateSha256": state_digest,
                        "releaseTarget": "default",
                        "defaultBranch": "main",
                        "releaseReview": release_review,
                        "candidateSelections": candidate_selections,
                    }
                )
                + "\n",
                encoding="utf-8",
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
                    "RELEASE_NOTES_SHA256": hashlib.sha256(
                        release_notes.read_bytes()
                    ).hexdigest(),
                    "BRANCH_CHAIN_STATE_SHA256": state_digest,
                    "REPOSITORY_DEFAULT_BRANCH": "main",
                    "RELEASE_ENVELOPE_SNAPSHOT": str(snapshot),
                    "PYTHON_COMMAND": sys.executable,
                }
            )

            manifest_result = subprocess.run(
                [self._bash(), "-c", manifest_script],
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
            self.assertEqual(manifest["releaseNotesVersion"], "v1.2.3")
            self.assertEqual(
                manifest["releaseNotesSha256"], env["RELEASE_NOTES_SHA256"]
            )
            self.assertEqual(manifest["releaseNotesPath"], "release-notes.json")
            self.assertEqual(manifest["branchChainStateSha256"], state_digest)
            self.assertEqual(manifest["releaseReview"], release_review)
            self.assertEqual(manifest["candidateSelections"], candidate_selections)
            self.assertEqual(manifest["reviewSelection"], "disabled")
            self.assertEqual(manifest["reviewStatus"], "not-run")
            self.assertEqual(manifest["reviewReason"], "fixture-disabled")
            self.assertEqual(manifest["reviewRemainingRisk"], "fixture-risk")
            self.assertEqual(
                manifest["signingEvidence"]["verification"],
                "configured-hook-verify-exit-0",
            )

            commit_result = subprocess.run(
                [self._bash(), "-c", commit_script],
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
            sandbox = Path(tmp_dir)
            root = sandbox / "project"
            root.mkdir()
            release = root / "release"
            release.mkdir()
            stage = sandbox / ".example-tool.release-candidate.test"
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
                    "PRODUCT_NAME": "example-tool",
                    "PYTHON_COMMAND": sys.executable,
                }
            )

            result = subprocess.run(
                [self._bash(), "-c", script],
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
