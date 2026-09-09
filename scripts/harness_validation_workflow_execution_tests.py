"""候选 workflow 真实脚本与不可绕过边界回归。"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from harness_workflow_test_support import HarnessWorkflowTestCase


class ValidateHarnessWorkflowExecutionTests(HarnessWorkflowTestCase):
    """执行受审 workflow 的关键 run block，并验证注释不能伪装活动约束。"""

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
            environment = os.environ.copy()
            environment.update(
                {"GITHUB_ENV": str(environment_file), "PYTHON_COMMAND": sys.executable}
            )
            result = subprocess.run(
                [self._bash(), "-c", script],
                cwd=root,
                env=environment,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(environment_file.read_text(encoding="utf-8"), "RUSTUP_TOOLCHAIN=1.93.0\n")

            (root / "Cargo.toml").write_text("[workspace]\nmembers = []\n", encoding="utf-8")
            rejected = subprocess.run(
                [self._bash(), "-c", script],
                cwd=root,
                env=environment,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertNotEqual(rejected.returncode, 0)
            self.assertIn("缺少 [workspace.package]", rejected.stderr)

    def test_manifest_and_atomic_commit_run_against_real_files(self) -> None:
        """真实执行 manifest 与目录提交，绑定发布上下文、tag 和精确三件套。"""

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
                '{"schemaVersion":2,"releases":[{"releaseDate":"2026-09-09",'
                '"version":"v1.2.3","featureOptimizations":[{"zh-CN":"夹具",'
                '"en-US":"fixture"}],"bugFixes":[]}]}\n',
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
                / "verify_release_context.py"
            )
            helper.parent.mkdir(parents=True)
            helper.write_text(
                "import sys\n"
                "if len(sys.argv) < 2 or sys.argv[1] != 'verify':\n"
                "    raise SystemExit('expected verify mode')\n",
                encoding="utf-8",
            )
            context_digest = "b" * 64
            release_review = {
                "selection": "disabled",
                "status": "Not run",
                "scopeBase": "c" * 40,
                "sourceHead": "c" * 40,
                "scopeDiffSha256": "d" * 64,
                "reviewedSourceCommit": None,
                "checks": [],
                "evidenceSummary": None,
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
            snapshot = sandbox / "release-context-snapshot.json"
            snapshot.write_text(
                json.dumps(
                    {
                        "sourceCommit": "a" * 40,
                        "releaseContextSha256": context_digest,
                        "defaultBranch": "trunk",
                        "version": "1.2.3",
                        "expectedTag": "v1.2.3-20260909",
                        "releaseReview": release_review,
                        "candidateSelections": candidate_selections,
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            environment = os.environ.copy()
            environment.update(
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
                    "RELEASE_NOTES_SHA256": hashlib.sha256(release_notes.read_bytes()).hexdigest(),
                    "RELEASE_CONTEXT_SHA256": context_digest,
                    "REPOSITORY_DEFAULT_BRANCH": "trunk",
                    "RELEASE_CONTEXT_SNAPSHOT": str(snapshot),
                    "PYTHON_COMMAND": sys.executable,
                }
            )

            manifest_result = subprocess.run(
                [self._bash(), "-c", manifest_script],
                cwd=root,
                env=environment,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(manifest_result.returncode, 0, manifest_result.stderr)
            manifest = json.loads(
                (stage / f"{archive_name}.manifest.json").read_text(encoding="utf-8")
            )
            self.assertEqual(manifest["sha256"], digest)
            self.assertEqual(manifest["releaseContextSha256"], context_digest)
            self.assertEqual(manifest["releaseTag"], "v1.2.3-20260909")
            self.assertEqual(manifest["releaseReview"], release_review)
            self.assertEqual(manifest["candidateSelections"], candidate_selections)
            self.assertEqual(manifest["reviewStatus"], "Not run")
            self.assertEqual(
                manifest["signingEvidence"]["verification"],
                "configured-hook-verify-exit-0",
            )

            commit_result = subprocess.run(
                [self._bash(), "-c", commit_script],
                cwd=root,
                env=environment,
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
            environment = os.environ.copy()
            environment.update(
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
                env=environment,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("提交前候选暂存目录文件集发生变化", result.stderr)
            self.assertEqual(list(release.iterdir()), [])
            self.assertTrue(stage.is_dir())

    def test_comments_cannot_mask_required_test_status_or_upload_guards(self) -> None:
        """注释不得冒充活动测试、pending 状态或 success 上传守卫。"""

        base = self._base_workflow()
        mutations = (
            base.replace(
                "          cargo test --workspace --all-targets --all-features --locked\n",
                "          # cargo test --workspace --all-targets --all-features --locked\n",
                1,
            ),
            base.replace(
                '              "milestoneAcceptance": "pending",\n',
                '              "milestoneAcceptance": "accepted",  # '
                '"milestoneAcceptance": "pending"\n',
                1,
            ),
            base.replace(
                "        if: success()\n        with:\n",
                "        if: always() # if: success()\n        with:\n",
                1,
            ),
        )
        for mutated in mutations:
            self.assertTrue(self._validate(mutated))

    def test_unreviewed_bytes_inputs_steps_and_mutable_actions_are_rejected(self) -> None:
        """完整摘要拒绝额外输入/步骤、任意字节和可变 action tag。"""

        base = self._base_workflow()
        mutations = (
            base + "\n:\n",
            base.replace("      version:\n", "      arbitrary_command:\n        type: string\n      version:\n", 1),
            base + "\n      - name: Run candidate binary\n        run: ./target/release/example-tool --version\n",
            base.replace(
                "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
                "actions/checkout@v4",
                1,
            ),
        )
        for mutated in mutations:
            self.assertTrue(self._validate(mutated))
