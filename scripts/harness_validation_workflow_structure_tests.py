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
from scripts.harness_validation import governance, repository, upgrade, workflow
from scripts.harness_validation_test_support import (
    TODO_TOKEN as SHARED_TODO_TOKEN,
    read_repo_text,
    run_validator_on_tempfile,
)


from harness_workflow_test_support import HarnessWorkflowTestCase


class ValidateHarnessWorkflowStructureTests(HarnessWorkflowTestCase):
    """验证 workflow 步骤、顺序、守卫、签名和候选状态。"""

    def test_positive_workflow_is_valid(self) -> None:
        """当前标准 workflow 只构建 pending 候选并应通过。"""
        errors = self._validate(self._base_workflow())
        self.assertEqual(errors, [], "\n".join(errors))

    def test_rejects_missing_per_build_e2e_selection(self) -> None:
        """候选构建必须接收一次明确的 enabled/disabled 选择。"""
        block = """      e2e_selection:
        description: "当前候选构建完成后是否启用 E2E"
        required: true
        type: choice
        options:
          - disabled
          - enabled
        default: disabled
"""
        base = self._base_workflow()
        self.assertIn(block, base)
        errors = self._validate(base.replace(block, "", 1))
        self.assertTrue(any("e2e_selection" in error for error in errors), errors)

    def test_rejects_non_choice_e2e_default(self) -> None:
        """当次 E2E 输入必须是必填 choice，且建议默认值为 disabled。"""
        base = self._base_workflow()
        mutated = base.replace("        default: disabled\n", "        default: enabled\n", 1)
        self.assertNotEqual(mutated, base)
        errors = self._validate(mutated)
        self.assertTrue(any("default: disabled" in error for error in errors), errors)

    def test_rejects_manifest_without_e2e_selection(self) -> None:
        """构建选择必须写入候选清单，供后续 E2E 阶段消费。"""
        base = self._base_workflow()
        mutated = base.replace('              "e2eSelection": os.environ["E2E_SELECTION"],\n', "", 1)
        self.assertNotEqual(mutated, base)
        errors = self._validate(mutated)
        self.assertTrue(any("e2eSelection" in error for error in errors), errors)

    def test_rejects_format_or_lint_added_to_build(self) -> None:
        """普通候选构建不得把格式或 lint 重新塞入验证步骤。"""
        base = self._base_workflow()
        marker = "          cargo test --workspace --all-targets --all-features --locked\n"
        self.assertIn(marker, base)
        for command in ("cargo fmt --all -- --check", "cargo clippy --workspace"):
            with self.subTest(command=command):
                mutated = base.replace(marker, f"          {command}\n" + marker, 1)
                errors = self._validate(mutated)
                self.assertTrue(any("non-unit development gate" in error for error in errors), errors)

    def test_rejects_injected_e2e_command_input(self) -> None:
        """候选 workflow 不得恢复任意 E2E 命令输入。"""
        marker = "      version:\n"
        injected = (
            "      e2e_command:\n"
            '        description: "Injected command"\n'
            "        required: false\n"
            "        type: string\n"
        )
        errors = self._validate(self._base_workflow().replace(marker, injected + marker, 1))
        self.assertTrue(any("forbidden candidate behavior: e2e_command" in e for e in errors), errors)

    def test_rejects_injected_smoke_step(self) -> None:
        """构建候选时插入冒烟步骤必须失败。"""
        mutated = self._base_workflow() + "\n# smoke test\n"
        errors = self._validate(mutated)
        self.assertTrue(errors)

    def test_rejects_accepted_manifest(self) -> None:
        """构建 workflow 只能记录 pending，不能自行宣告里程碑通过。"""
        mutated = self._base_workflow().replace(
            '"milestoneAcceptance": "pending"',
            '"milestoneAcceptance": "accepted"',
            1,
        )
        errors = self._validate(mutated)
        self.assertTrue(
            any('forbidden candidate behavior: "milestoneAcceptance": "accepted"' in e for e in errors),
            errors,
        )

    def test_rejects_each_package_step_without_success_guard(self) -> None:
        """Unix 或 Windows 任一打包步骤丢失 success() 都必须失败。"""
        cases = {
            "Unix": "        if: runner.os != 'Windows' && success()\n",
            "Windows": "        if: runner.os == 'Windows' && success()\n",
        }
        for platform, guard in cases.items():
            with self.subTest(platform=platform):
                errors = self._validate(self._base_workflow().replace(guard, "", 1))
                self.assertTrue(errors, platform)

    def test_rejects_upload_without_success_guard(self) -> None:
        """上传不得在前序构建或打包失败后继续。"""
        mutated = self._base_workflow().replace(
            "        if: success()\n        with:\n",
            "        with:\n",
            1,
        )
        errors = self._validate(mutated)
        self.assertTrue(errors)

    def test_rejects_missing_package_steps_without_crashing(self) -> None:
        """打包步骤同时缺失时应返回错误而不是抛异常。"""
        base = self._base_workflow()
        start, end, _ = self._slice(
            base,
            "      - name: 打包 Unix 候选",
            "      - name: 记录候选清单",
        )
        errors = self._validate(base[:start] + base[end:])
        self.assertTrue(any("package" in error for error in errors), errors)

    def test_rejects_packaging_before_verification(self) -> None:
        """候选打包不得越过非空测试与构建验证。"""
        base = self._base_workflow()
        start, end, package_block = self._slice(
            base,
            "      - name: 打包 Unix 候选",
            "      - name: 记录候选清单",
        )
        without_package = base[:start] + base[end:]
        insert_at = without_package.index("      - name: 验证候选\n")
        errors = self._validate(
            without_package[:insert_at] + package_block + without_package[insert_at:]
        )
        self.assertTrue(any("must validate release notes" in error for error in errors), errors)

    def test_rejects_enabled_matrix_fail_fast(self) -> None:
        """默认三平台构建必须收集每个平台终态，不能首错即取消其余平台。"""
        mutated = self._base_workflow().replace(
            "      fail-fast: false\n",
            "      fail-fast: true\n",
            1,
        )
        errors = self._validate(mutated)
        self.assertTrue(
            any("forbidden candidate behavior: fail-fast: true" in e for e in errors),
            errors,
        )

    def test_rejects_release_cleanup_after_build_or_missing(self) -> None:
        """两个平台清理步骤都必须位于测试和 release build 之前。"""
        base = self._base_workflow()
        start, end, cleanup_block = self._slice(
            base,
            "      - name: 准备 Unix 发布目录",
            "      - name: 验证候选",
        )
        without_cleanup = base[:start] + base[end:]
        errors = self._validate(without_cleanup)
        self.assertTrue(any("release" in error for error in errors), errors)

        insert_at = without_cleanup.index("      - name: 尝试 Unix 签名")
        errors = self._validate(
            without_cleanup[:insert_at] + cleanup_block + without_cleanup[insert_at:]
        )
        self.assertTrue(any("must validate release notes" in error for error in errors), errors)

    def test_rejects_missing_or_late_release_notes_validation(self) -> None:
        """更新日志必须在清理、测试和编译前只读校验。"""

        base = self._base_workflow()
        start, end, notes_block = self._slice(
            base,
            "      - name: 验证发布更新日志",
            "      - name: 准备 Unix 发布目录",
        )
        without_notes = base[:start] + base[end:]
        errors = self._validate(without_notes)
        self.assertTrue(any("release-note" in error or "更新日志" in error for error in errors), errors)

        insert_at = without_notes.index("      - name: 验证候选\n")
        errors = self._validate(
            without_notes[:insert_at] + notes_block + without_notes[insert_at:]
        )
        self.assertTrue(any("must validate release notes" in error for error in errors), errors)

    def test_rejects_release_notes_omitted_from_package_or_manifest(self) -> None:
        """归档字节和候选清单都必须绑定同一份根更新日志。"""

        base = self._base_workflow()
        cases = {
            "unix package": base.replace(
                ' -C "$GITHUB_WORKSPACE" release-notes.json', "", 1
            ),
            "windows package": base.replace(
                '@($binary, "release-notes.json")', "@($binary)", 1
            ),
            "manifest digest": base.replace(
                '              "releaseNotesSha256": release_notes_digest,\n',
                "",
                1,
            ),
        }
        for label, mutated in cases.items():
            with self.subTest(label=label):
                self.assertNotEqual(mutated, base)
                errors = self._validate(mutated)
                self.assertTrue(errors, label)

    def test_rejects_missing_conditional_signing_and_manifest_status(self) -> None:
        """构建成功后必须评估签名，并在 manifest 保留签名状态。"""
        base = self._base_workflow()
        start, end, _ = self._slice(
            base,
            "      - name: 尝试 Unix 签名",
            "      - name: 打包 Unix 候选",
        )
        errors = self._validate(base[:start] + base[end:])
        self.assertTrue(any("sign" in error for error in errors), errors)

        without_status = base.replace('              "signingStatus": os.environ["SIGNING_STATUS"],\n', "", 1)
        errors = self._validate(without_status)
        self.assertTrue(any("signingStatus" in error for error in errors), errors)

    def test_rejects_swallowed_signing_failure_and_non_release_upload(self) -> None:
        """签名错误不能被软化，上传也必须使用精确 release 文件白名单。"""
        swallowed = self._base_workflow().replace(
            "      - name: 尝试 Unix 签名\n",
            "      - name: 尝试 Unix 签名\n        continue-on-error: true\n",
            1,
        )
        errors = self._validate(swallowed)
        self.assertTrue(any("continue-on-error" in error for error in errors), errors)

        wrong_path = self._base_workflow().replace(
            "            release/${{ steps.candidate_artifact.outputs.archive_name }}.sha256\n",
            "            output/${{ steps.candidate_artifact.outputs.archive_name }}.sha256\n",
            1,
        )
        errors = self._validate(wrong_path)
        self.assertTrue(any("exact declared" in error for error in errors), errors)

    def test_rejects_checkout_outside_dynamic_default_branch(self) -> None:
        """候选必须检出 GitHub 动态默认分支，再核对批准提交。"""
        base = self._base_workflow()
        expected = "          ref: ${{ github.event.repository.default_branch }}\n"
        self.assertIn(expected, base)
        for replacement in (
            "          ref: ${{ inputs.source_commit }}\n",
            "          ref: Release\n",
            "          ref: main\n",
            "          ref: master\n",
        ):
            with self.subTest(replacement=replacement.strip()):
                errors = self._validate(base.replace(expected, replacement, 1))
                self.assertTrue(
                    any("default branch" in error or "ref:" in error for error in errors),
                    errors,
                )

        without_verification = base.replace("      - name: 验证已检出源码\n", "      - name: 观察已检出源码\n", 1)
        errors = self._validate(without_verification)
        self.assertTrue(any("source" in error for error in errors), errors)

    def test_rejects_weakened_dynamic_default_source_verification(self) -> None:
        """源码预检必须同时锁定 main/master 值域、HEAD 输入和具名分支。"""

        base = self._base_workflow()
        cases = {
            "default allowlist": (
                'default_branch not in {"main", "master"}',
                "not default_branch",
            ),
            "source commit": ("observed != expected", "not observed"),
            "named branch": ('branch != default_branch', 'branch != "main"'),
        }
        for label, (required, replacement) in cases.items():
            with self.subTest(label=label):
                self.assertIn(required, base)
                errors = self._validate(base.replace(required, replacement, 1))
                self.assertTrue(
                    any("source verification" in error for error in errors),
                    errors,
                )

    def test_rejects_weakened_direct_default_envelope_helper(self) -> None:
        """离线 helper 不得放松默认 ref、Release 缺失或发布目标证明。"""

        helper = workflow.RELEASE_ENVELOPE_HELPER
        source = helper.read_text(encoding="utf-8")
        cases = {
            "default allowlist": (
                'if repository_default_branch not in {"main", "master"}:',
                "if not repository_default_branch:",
            ),
            "named source": (
                "if head != source_commit or branch != repository_default_branch:",
                "if head != source_commit:",
            ),
            "release target": (
                'if closed.get("releaseTarget") != "default":',
                'if closed.get("releaseTarget") is None:',
            ),
            "closed default": (
                'if closed["defaultBranch"] != repository_default_branch:',
                'if closed["defaultBranch"] != "main":',
            ),
            "remote default": (
                "if resolve_ref(root, default_ref) != source_commit:",
                'if resolve_ref(root, default_ref) != closed["defaultHead"]:',
            ),
            "Release absence": (
                'if resolve_ref(root, "refs/remotes/origin/Release", missing_ok=True) is not None:',
                'if resolve_ref(root, "refs/remotes/origin/Release", missing_ok=True) is None:',
            ),
        }
        for label, (required, replacement) in cases.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as tmp_dir:
                self.assertIn(required, source)
                candidate = Path(tmp_dir) / "verify_release_envelope.py"
                candidate.write_text(source.replace(required, replacement, 1), encoding="utf-8")
                errors: list[str] = []
                workflow.validate_release_envelope_helper(errors, candidate)
                self.assertTrue(
                    any("direct-default gate missing" in error for error in errors),
                    errors,
                )

    def test_rejects_shallow_checkout(self) -> None:
        """远端分支删除和 closing history 复核要求完整 fresh fetch。"""

        base = self._base_workflow()
        mutated = base.replace("          fetch-depth: 0\n", "          fetch-depth: 1\n", 1)
        self.assertNotEqual(mutated, base)
        errors = self._validate(mutated)
        self.assertTrue(any("fetch-depth: 0" in error for error in errors), errors)

    def test_rejects_missing_first_or_second_envelope_verification(self) -> None:
        """测试前捕获与 manifest 前复核必须消费同一份离线双信封。"""

        base = self._base_workflow()
        capture_start, capture_end, _ = self._slice(
            base,
            "      - name: 从 closing commit 捕获发布信封",
            "      - name: 读取项目最低 Rust 版本",
        )
        without_capture = base[:capture_start] + base[capture_end:]
        errors = self._validate(without_capture)
        self.assertTrue(any("envelope" in error for error in errors), errors)

        verify_call = """          \"$PYTHON_COMMAND\" .agents/skills/desktop-prepare-cross-platform-release/scripts/verify_release_envelope.py verify \\
            --project-root \"$GITHUB_WORKSPACE\" \\
            --source-commit \"$SOURCE_COMMIT\" \\
            --expected-state-sha256 \"$BRANCH_CHAIN_STATE_SHA256\" \\
            --repository-default-branch \"$REPOSITORY_DEFAULT_BRANCH\" \\
            --snapshot \"$RELEASE_ENVELOPE_SNAPSHOT\"
"""
        self.assertIn(verify_call, base)
        errors = self._validate(base.replace(verify_call, "", 1))
        self.assertTrue(any("repeat the offline envelope" in error for error in errors), errors)

    def test_rejects_worktree_internal_staging(self) -> None:
        """Unix 与 Windows 候选 staging 都必须位于 Git 根同级。"""

        base = self._base_workflow()
        cases = {
            "Unix": base.replace(
                '${GITHUB_WORKSPACE}/../.${PRODUCT_NAME}.release-candidate.XXXXXX',
                '${GITHUB_WORKSPACE}/.${PRODUCT_NAME}.release-candidate.XXXXXX',
                1,
            ),
            "Windows": base.replace(
                "Join-Path (Split-Path -Parent $env:GITHUB_WORKSPACE)",
                "Join-Path $env:GITHUB_WORKSPACE",
                1,
            ),
        }
        for platform, mutated in cases.items():
            with self.subTest(platform=platform):
                self.assertNotEqual(mutated, base)
                errors = self._validate(mutated)
                self.assertTrue(any(platform in error for error in errors), errors)

    def test_rejects_manifest_without_either_sealed_envelope(self) -> None:
        """manifest 必须逐项保留已复核的 review 与 candidate selections。"""

        base = self._base_workflow()
        cases = {
            "releaseReview": '              "releaseReview": review,\n',
            "candidateSelections": '              "candidateSelections": candidate_selections,\n',
        }
        for field, line in cases.items():
            with self.subTest(field=field):
                self.assertIn(line, base)
                errors = self._validate(base.replace(line, "", 1))
                self.assertTrue(any(field in error for error in errors), errors)

    def test_rejects_missing_post_test_head_and_clean_recheck(self) -> None:
        """测试完成后必须在 build 与签名前重新绑定 HEAD 和 clean。"""

        base = self._base_workflow()
        start = base.index('          "$PYTHON_COMMAND" - <<\'PY\'\n', base.index("          cargo test --workspace"))
        end = base.index("          cargo build --workspace --release --locked\n", start)
        mutated = base[:start] + base[end:]
        errors = self._validate(mutated)
        self.assertTrue(any("after tests" in error for error in errors), errors)

    def test_rejects_missing_post_commit_exact_reverification(self) -> None:
        """目录原子替换后必须重新验证路径和精确普通文件集合。"""

        base = self._base_workflow()
        marker = """          require_plain_directory(release)
          if release.resolve() != root / "release":
              raise SystemExit("已提交的发布目录越出项目根目录")
          committed = list(release.iterdir())
          if {path.name for path in committed} != expected or any(path.is_symlink() or not path.is_file() for path in committed):
              raise SystemExit("已提交的发布文件集不是精确的普通文件候选集合")
"""
        self.assertIn(marker, base)
        errors = self._validate(base.replace(marker, "", 1))
        self.assertTrue(any("atomically commit then exactly re-verify" in error for error in errors), errors)

    def test_rejects_missing_signing_evidence_and_exact_artifact_set_gate(self) -> None:
        """manifest 不能只信任签名状态，也不能从 release 中猜测候选文件。"""
        base = self._base_workflow()
        without_evidence = base.replace(
            '              "signingEvidence": {\n',
            '              "omittedEvidence": {\n',
            1,
        )
        errors = self._validate(without_evidence)
        self.assertTrue(any("signingEvidence" in error for error in errors), errors)

        without_exact_set = base.replace(
            "          if observed_after != expected_after:\n",
            "          if False:\n",
            1,
        )
        errors = self._validate(without_exact_set)
        self.assertTrue(any("exact artifact-set" in error for error in errors), errors)

    def test_rejects_missing_atomic_candidate_commit(self) -> None:
        """staging 结果必须以不跟随 release 链接的目录级原子提交收口。"""
        base = self._base_workflow()
        start, end, _ = self._slice(
            base,
            "      - name: 提交候选制品集合",
            "      - uses: actions/upload-artifact",
        )
        errors = self._validate(base[:start] + base[end:])
        self.assertTrue(any("commit" in error or "atomic" in error for error in errors), errors)
