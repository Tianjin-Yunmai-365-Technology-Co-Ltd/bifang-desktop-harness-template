"""覆盖构建路由与 release ignore 的确定性 validator 回归。"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts.harness_validation import release


class ReleaseIgnoreValidationTests(unittest.TestCase):
    """验证 release ignore 只接受精确且唯一的根锚定规则。"""

    def _validate(self, contents: str) -> list[str]:
        """在隔离文件上运行 ignore 门禁并返回所有稳定错误。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / ".gitignore"
            path.write_text(contents, encoding="utf-8")
            errors: list[str] = []
            release.validate_release_ignore(errors, path)
            return errors

    def test_accepts_one_exact_root_anchored_rule(self) -> None:
        """结果目录与清理 staging 的两个根锚定规则各一个时应通过。"""
        self.assertEqual(
            self._validate("/target/\n/release/\n/.release-clean.*\n"),
            [],
        )

    def test_rejects_duplicate_exact_rule(self) -> None:
        """重复规则会掩盖初始化漂移，必须拒绝。"""
        errors = self._validate("/release/\n/release/\n/.release-clean.*\n")
        self.assertTrue(any("exactly once" in error for error in errors), errors)

    def test_rejects_unanchored_or_overbroad_rule(self) -> None:
        """子目录通配和非根锚定规则不能替代精确项目根目录。"""
        for unsafe in ("release/", "**/release/", "/release"):
            with self.subTest(unsafe=unsafe):
                errors = self._validate(f"/release/\n/.release-clean.*\n{unsafe}\n")
                self.assertTrue(any("unsafe release ignore" in error for error in errors), errors)

    def test_rejects_missing_or_unanchored_cleanup_staging_rule(self) -> None:
        """原子刷新中断遗留物必须只在项目根被忽略。"""
        missing = self._validate("/release/\n")
        self.assertTrue(any("/.release-clean.*" in error for error in missing), missing)
        unsafe = self._validate("/release/\n/.release-clean.*\n.release-clean.*\n")
        self.assertTrue(any("unsafe release ignore" in error for error in unsafe), unsafe)


class BuildSkillValidationTests(unittest.TestCase):
    """验证逐次 E2E、全量单测和全平台路由不能被静默弱化。"""

    @staticmethod
    def _validate_build(source: str) -> list[str]:
        """只替换 Rust 构建 Skill，保留真实跨平台 Skill。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "SKILL.md"
            path.write_text(source, encoding="utf-8")
            errors: list[str] = []
            release.validate_build_skill_contract(
                errors,
                build_skill=path,
                cross_platform_skill=release.CROSS_PLATFORM_RELEASE_SKILL,
            )
            return errors

    @staticmethod
    def _validate_cross_platform(source: str) -> list[str]:
        """只替换跨平台 Skill，保留真实 Rust 构建 Skill。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "SKILL.md"
            path.write_text(source, encoding="utf-8")
            errors: list[str] = []
            release.validate_build_skill_contract(
                errors,
                build_skill=release.BUILD_RELEASE_SKILL,
                cross_platform_skill=path,
            )
            return errors

    @staticmethod
    def _validate_cross_platform_workflow(source: str) -> list[str]:
        """只替换原生矩阵 workflow，验证执行层信封门禁。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "github-release-candidate.yml"
            path.write_text(source, encoding="utf-8")
            errors: list[str] = []
            release.validate_build_skill_contract(
                errors,
                cross_platform_workflow=path,
            )
            return errors

    @staticmethod
    def _validate_cross_platform_helper(source: str) -> list[str]:
        """只替换离线 closing-envelope helper，保留真实 workflow。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "verify_release_envelope.py"
            path.write_text(source, encoding="utf-8")
            errors: list[str] = []
            release.validate_build_skill_contract(
                errors,
                cross_platform_envelope_helper=path,
            )
            return errors

    @staticmethod
    def _validate_collect(source: str) -> list[str]:
        """只替换制品收集 Skill，保留真实 Rust 与跨平台构建 Skill。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "SKILL.md"
            path.write_text(source, encoding="utf-8")
            errors: list[str] = []
            release.validate_build_skill_contract(errors, collect_skill=path)
            return errors

    def test_rejects_missing_default_cross_platform_route(self) -> None:
        """删除三平台默认句后，即使其他构建文本仍在也必须失败。"""
        source = release.BUILD_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "默认通过 `$desktop-prepare-cross-platform-release` 构建 Windows、macOS 和 Linux 原生候选"
        mutated = source.replace(anchor, "优先构建可用目标", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_build(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)
    def test_rejects_missing_started_matrix_failure_boundary(self) -> None:
        """矩阵真实失败不得通过本机回退被伪装成整体成功。"""
        source = release.BUILD_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "不得把已启动矩阵的失败、测试失败、打包失败、签名失败、超时或取消视为回退条件"
        mutated = source.replace(anchor, "可以把矩阵失败视为回退条件", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_build(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_missing_per_build_e2e_question(self) -> None:
        """没有当次明确选择时，Rust 构建必须在测试和编译前询问一次。"""
        source = release.BUILD_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "否则在任何测试或编译前询问用户一次"
        mutated = source.replace(anchor, "沿用项目历史偏好", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_build(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_missing_full_workspace_unit_test_command(self) -> None:
        """Rust 构建不得把全量 workspace 单测缩小成包级测试。"""
        source = release.BUILD_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "cargo test --workspace --all-targets --all-features --locked"
        mutated = source.replace(anchor, "cargo test -p example")
        self.assertNotEqual(mutated, source)
        errors = self._validate_build(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_automatic_extra_build_gates(self) -> None:
        """普通构建契约必须明确拒绝自动追加格式、lint 和开发门禁。"""
        source = release.BUILD_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "不得在构建名义下自动追加格式、lint、中文注释或其他开发门禁"
        mutated = source.replace(anchor, "构建前运行全部治理门禁", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_build(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_rust_build_project_memory_writes(self) -> None:
        """Rust 构建结果不得被复制进 ADR、Changelog 或其他项目记忆。"""
        source = release.BUILD_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification"
        mutated = source.replace(anchor, "同步更新项目记忆", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_build(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_cross_platform_contract_requires_e2e_selection_manifest(self) -> None:
        """远端矩阵必须接收当次 E2E 选择并传播进候选清单。"""
        source = release.CROSS_PLATFORM_RELEASE_SKILL.read_text(encoding="utf-8")
        for anchor in ("e2e_selection", "e2eSelection"):
            with self.subTest(anchor=anchor):
                mutated = source.replace(anchor, "omittedE2E", 1)
                self.assertNotEqual(mutated, source)
                errors = self._validate_cross_platform(mutated)
                self.assertTrue(any(anchor in error for error in errors), errors)

    def test_cross_platform_contract_requires_host_verified_closing_envelope(self) -> None:
        """派发端不能把对话中的选择或摘要冒充 closing commit 事实。"""
        source = release.CROSS_PLATFORM_RELEASE_SKILL.read_text(encoding="utf-8")
        anchors = (
            "在任何派发前先运行 `$desktop-manage-git-branch-chain verify-release-review`",
            "状态摘要只能来自上述机械复核，不接受对话补写的信封、摘要或选择",
            "Rust CLI 的 `candidateSelections` 精确不适用",
        )
        for anchor in anchors:
            with self.subTest(anchor=anchor):
                mutated = source.replace(anchor, "信任调用对话补齐候选选择", 1)
                self.assertNotEqual(mutated, source)
                errors = self._validate_cross_platform(mutated)
                self.assertTrue(any(anchor in error for error in errors), errors)

    def test_cross_platform_candidate_cannot_rewrite_drifted_workflow(self) -> None:
        """clean 默认分支候选预检只能报告 provider unavailable，不能现场修 workflow。"""
        source = release.CROSS_PLATFORM_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "不得在受保护的 clean 默认分支 closing commit 上安装、更新或改写 workflow"
        mutated = source.replace(anchor, "缺失时直接安装 workflow 后继续", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_cross_platform(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_cross_platform_workflow_requires_full_named_default_checkout(self) -> None:
        """detached shallow checkout 不能证明关闭历史或远端默认分支快照。"""
        source = release.CROSS_PLATFORM_RELEASE_WORKFLOW.read_text(encoding="utf-8")
        cases = (
            (
                "ref: ${{ github.event.repository.default_branch }}",
                "ref: ${{ inputs.source_commit }}",
            ),
            ('default_branch not in {"main", "master"}', "default_branch == 'Release'"),
            ("fetch-depth: 0", "fetch-depth: 1"),
        )
        for anchor, replacement in cases:
            with self.subTest(anchor=anchor):
                mutated = source.replace(anchor, replacement, 1)
                self.assertNotEqual(mutated, source)
                errors = self._validate_cross_platform_workflow(mutated)
                self.assertTrue(any(anchor in error for error in errors), errors)

    def test_cross_platform_workflow_requires_two_ordered_envelope_gates(self) -> None:
        """首次捕获和最终字节后的 manifest 前复核缺一或倒序都必须失败。"""
        source = release.CROSS_PLATFORM_RELEASE_WORKFLOW.read_text(encoding="utf-8")
        verify = "verify_release_envelope.py verify"
        missing = source.replace(verify, "verify_release_envelope.py omitted", 1)
        self.assertNotEqual(missing, source)
        errors = self._validate_cross_platform_workflow(missing)
        self.assertTrue(any(verify in error for error in errors), errors)

        without_verify = source.replace(verify, "verify_release_envelope.py delayed", 1)
        atomic_commit = "          os.rename(stage, release)"
        moved = without_verify.replace(
            atomic_commit,
            f"{atomic_commit}\n          # {verify}",
            1,
        )
        self.assertNotEqual(moved, source)
        errors = self._validate_cross_platform_workflow(moved)
        self.assertTrue(any("release contract order" in error for error in errors), errors)

    def test_cross_platform_workflow_manifest_projects_both_envelopes(self) -> None:
        """矩阵 manifest 不能只写 sourceCommit/E2E 而遗失关闭信封与条件审查字段。"""
        source = release.CROSS_PLATFORM_RELEASE_WORKFLOW.read_text(encoding="utf-8")
        anchors = (
            '"releaseReview": review,',
            '"candidateSelections": candidate_selections,',
            'manifest["reviewEvidence"] = {',
            'manifest["reviewReason"] = review["reason"]',
        )
        for anchor in anchors:
            with self.subTest(anchor=anchor):
                mutated = source.replace(anchor, "# omitted sealed field", 1)
                self.assertNotEqual(mutated, source)
                errors = self._validate_cross_platform_workflow(mutated)
                self.assertTrue(any(anchor in error for error in errors), errors)

    def test_cross_platform_workflow_stages_outside_clean_worktree(self) -> None:
        """manifest 前的 untracked-inclusive clean 复核不能被工作树内 staging 自我破坏。"""
        source = release.CROSS_PLATFORM_RELEASE_WORKFLOW.read_text(encoding="utf-8")
        anchor = "${GITHUB_WORKSPACE}/../.${PRODUCT_NAME}.release-candidate.XXXXXX"
        mutated = source.replace(anchor, "${GITHUB_WORKSPACE}/.release-candidate.XXXXXX", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_cross_platform_workflow(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_cross_platform_helper_fails_closed_on_state_or_applicability_drift(self) -> None:
        """runner 必须从提交字节复核完整信封，并拒绝 GUI-only 选择。"""
        source = release.CROSS_PLATFORM_RELEASE_ENVELOPE_HELPER.read_text(encoding="utf-8")
        anchors = (
            'if repository_default_branch not in {"main", "master"}:',
            "runner must check out the named repository default branch at source_commit",
            "protected state bytes do not match source_commit",
            "protected state digest does not match the host-verified input",
            "legacy closing state without both sealed envelopes is forbidden",
            'if closed.get("releaseTarget") != "default":',
            'if closed["defaultBranch"] != repository_default_branch:',
            "if resolve_ref(root, default_ref) != source_commit:",
            "legacy origin/Release must be absent for a direct-default release",
            '"sourceCommit": source_commit',
            '"releaseTarget": closed["releaseTarget"]',
            '"defaultBranch": repository_default_branch',
            '"performanceSelection": "not-applicable"',
            '"macosSigningSelection": "not-applicable"',
            "release envelope changed between build gates",
        )
        for anchor in anchors:
            with self.subTest(anchor=anchor):
                mutated = source.replace(anchor, "weakened-envelope-gate", 1)
                self.assertNotEqual(mutated, source)
                errors = self._validate_cross_platform_helper(mutated)
                self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_cross_platform_project_memory_writes(self) -> None:
        """原生矩阵的构建事实也只能进入 manifest 和最终回复。"""
        source = release.CROSS_PLATFORM_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification"
        mutated = source.replace(anchor, "同步更新项目记忆", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_cross_platform(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_artifact_collection_project_memory_writes(self) -> None:
        """制品收集不得恢复向 Verification 日期卷写构建流水账的旧行为。"""
        source = release.COLLECT_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification"
        mutated = source.replace(anchor, "按日期更新 Verification", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_collect(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_collection_requires_target_external_atomic_staging(self) -> None:
        """三平台结果不能逐个进入 release 并在失败时留下部分集合。"""
        source = release.COLLECT_RELEASE_SKILL.read_text(encoding="utf-8")
        anchors = (
            "在项目根同级、同一文件系统创建唯一且权限受限的 staging",
            "不得逐个平台直接复制到 `release/`",
            "任何前置失败都不得部分污染目标",
            "替换后只读重新枚举 `release/`",
        )
        for anchor in anchors:
            with self.subTest(anchor=anchor):
                mutated = source.replace(anchor, "逐个复制并在末尾检查", 1)
                self.assertNotEqual(mutated, source)
                errors = self._validate_collect(mutated)
                self.assertTrue(any(anchor in error for error in errors), errors)

    def test_collection_rejects_atomic_commit_before_second_envelope_check(self) -> None:
        """staging 必须先通过尾端双信封/精确集合门禁，再一次替换目标。"""
        source = release.COLLECT_RELEASE_SKILL.read_text(encoding="utf-8")
        atomic = "把完整 staging 目录级原子替换为 `release/`"
        second_verify = "在触碰目标目录前执行第二次只读 `verify-release-review`"
        without_atomic = source.replace(atomic, "延后原子替换", 1)
        mutated = without_atomic.replace(second_verify, f"{atomic}；{second_verify}", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_collect(mutated)
        self.assertTrue(any("release contract order" in error for error in errors), errors)


class ReleaseNotesContractValidationTests(unittest.TestCase):
    """锁定发布日志 helper 的五版/十条、原子写入和固定格式。"""

    def test_rejects_weakened_release_notes_retention(self) -> None:
        """helper 把近五版上限放宽时，Harness 总验证必须失败。"""

        source = release.RELEASE_NOTES_HELPER.read_text(encoding="utf-8")
        mutated = source.replace("MAX_RELEASES = 5", "MAX_RELEASES = 6", 1)
        self.assertNotEqual(mutated, source)
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "release_notes.py"
            path.write_text(mutated, encoding="utf-8")
            errors: list[str] = []
            with mock.patch.object(release, "RELEASE_NOTES_HELPER", path):
                release.validate_release_contract(errors)
        self.assertTrue(any("MAX_RELEASES = 5" in error for error in errors), errors)


class ReleaseBranchChainContractValidationTests(unittest.TestCase):
    """锁定 feature 链直接关闭到动态默认分支的自动发布边界。"""

    @staticmethod
    def _validate_mutation(source: str, *, parameter: str) -> list[str]:
        """只替换一个发布契约来源，其余文件继续使用真实仓库内容。"""

        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "contract.md"
            path.write_text(source, encoding="utf-8")
            errors: list[str] = []
            release.validate_release_git_contract(errors, **{parameter: path})
            return errors

    def test_rejects_release_flow_without_managed_atomic_chain_close(self) -> None:
        """发布准备不能跳过受管默认分支快进和逐 ref lease 精确清理。"""

        source = release.PREPARE_RELEASE_SKILL.read_text(encoding="utf-8")
        for anchor in (
            "$desktop-manage-git-branch-chain release",
            "以一次 atomic push 在冻结旧 OID lease 下把动态默认 `main`/`master` 严格快进到该提交",
            "同时用逐 ref lease 删除状态文件本轮精确列出的远端 feature refs",
            "命令成功后当前分支必须是同名默认分支",
            "不得创建 `Release` 中转、扫描 `codex/*` 或代删链外分支",
        ):
            with self.subTest(anchor=anchor):
                mutated = source.replace(anchor, "省略受管链路关闭", 1)
                self.assertNotEqual(mutated, source)
                errors = self._validate_mutation(mutated, parameter="prepare_skill")
                self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_manual_merge_pr_after_direct_default_release(self) -> None:
        """受管事务已经发布默认分支，不能恢复额外人工 Merge/PR 中转。"""

        source = (release.ROOT / "docs" / "RELEASE.md").read_text(encoding="utf-8")
        anchor = "默认分支已经由受管发布事务完成严格快进，不再等待额外 Merge/PR"
        mutated = source.replace(anchor, "等待用户把 `Release` Merge/PR 到默认分支", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutation(mutated, parameter="release_doc")
        self.assertTrue(any(anchor in error for error in errors), errors)


class ReleaseSelectionContractValidationTests(unittest.TestCase):
    """锁定发布期审查选择和 macOS 签名意图先行分支。"""

    @staticmethod
    def _validate_mutation(source: str, *, parameter: str) -> list[str]:
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "contract.md"
            path.write_text(source, encoding="utf-8")
            errors: list[str] = []
            release.validate_release_selection_contract(
                errors,
                **{parameter: path},
            )
            return errors

    def test_rejects_release_review_that_is_not_sealed_for_interrupted_retry(self) -> None:
        source = release.PREPARE_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "同一发布的修复或进程中断重跑复用原选择，新发布重新解析"
        mutated = source.replace(anchor, "中断后从对话历史猜测选择", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutation(mutated, parameter="prepare_skill")
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_branch_chain_release_as_an_independent_release_entrypoint(self) -> None:
        source = release.BRANCH_CHAIN_SKILL.read_text(encoding="utf-8")
        anchor = "任何正式发布请求必须先路由 `$desktop-prepare-release`"
        mutated = source.replace(anchor, "可以直接从分支链 Skill 发起正式发布", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutation(mutated, parameter="branch_skill")
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_disabled_review_that_leaves_review_evidence(self) -> None:
        source = release.PREPARE_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "禁止生成 `reviewEvidence`、完成声明或 `reviewedSourceCommit`"
        mutated = source.replace(anchor, "可以保留旧审查证据", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutation(mutated, parameter="prepare_skill")
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_macos_default_that_probes_before_signing_intent(self) -> None:
        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "`disabled/not-requested`：不得运行 `scripts/probe-macos-notarization.sh`"
        mutated = source.replace(anchor, "`disabled/not-requested`：先探测再决定", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutation(mutated, parameter="tauri_skill")
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_macos_signing_intent_after_first_bundle_command(self) -> None:
        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "审查、性能和 macOS 签名选择及来源都只能从关闭状态读取"
        mutated = source.replace(anchor, "构建时再从对话解释签名选择", 1)
        mutated += f"\n{anchor}\n"
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutation(mutated, parameter="tauri_skill")
        self.assertTrue(any("before the first DMG bundle command" in error for error in errors), errors)

    def test_rejects_candidate_build_without_closing_commit_consumer(self) -> None:
        cases = (
            (
                "rust_skill",
                release.BUILD_RELEASE_SKILL,
                "`lastClosedChain.releaseReview` 与 `candidateSelections`",
            ),
            (
                "tauri_skill",
                release.TAURI_RELEASE_SKILL,
                "审查、性能和 macOS 签名选择及来源都只能从关闭状态读取",
            ),
        )
        for parameter, skill, anchor in cases:
            with self.subTest(parameter=parameter, anchor=anchor):
                source = skill.read_text(encoding="utf-8")
                mutated = source.replace(anchor, "构建时从对话补齐候选选择", 1)
                self.assertNotEqual(mutated, source)
                errors = self._validate_mutation(mutated, parameter=parameter)
                self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_candidate_build_without_pre_and_post_manifest_verification(self) -> None:
        cases = (
            (
                "rust_skill",
                release.BUILD_RELEASE_SKILL,
                (
                    "在任何测试、编译或 `release/` 清理前先调用 "
                    "`$desktop-manage-git-branch-chain verify-release-review`"
                ),
                "在写 manifest 前再次运行只读 `verify-release-review`",
            ),
            (
                "tauri_skill",
                release.TAURI_RELEASE_SKILL,
                (
                    "在任何测试、编译或 `release/` 清理前先调用 "
                    "`$desktop-manage-git-branch-chain verify-release-review`"
                ),
                "写 manifest 前再次运行只读 `verify-release-review`",
            ),
        )
        for parameter, skill, before_anchor, manifest_anchor in cases:
            source = skill.read_text(encoding="utf-8")
            for anchor in (before_anchor, manifest_anchor):
                with self.subTest(parameter=parameter, anchor=anchor):
                    mutated = source.replace(anchor, "省略关闭提交复核", 1)
                    self.assertNotEqual(mutated, source)
                    errors = self._validate_mutation(mutated, parameter=parameter)
                    self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_collection_or_acceptance_without_closing_state_verification(self) -> None:
        """收集与验收不能把 manifest 自己当作发布选择事实源。"""

        cases = (
            (
                "collect_skill",
                release.COLLECT_RELEASE_SKILL,
                "在接触目标目录前先调用 `$desktop-manage-git-branch-chain verify-release-review`",
            ),
            (
                "collect_skill",
                release.COLLECT_RELEASE_SKILL,
                "再次只读运行 `verify-release-review`",
            ),
            (
                "verify_skill",
                release.VERIFY_DELIVERY_SKILL,
                "先运行 `$desktop-manage-git-branch-chain verify-release-review`",
            ),
        )
        for parameter, skill, anchor in cases:
            with self.subTest(parameter=parameter, anchor=anchor):
                source = skill.read_text(encoding="utf-8")
                mutated = source.replace(anchor, "只信任候选 manifest", 1)
                self.assertNotEqual(mutated, source)
                errors = self._validate_mutation(mutated, parameter=parameter)
                self.assertTrue(any(anchor in error for error in errors), errors)

    def test_delivery_requires_tail_envelope_and_final_byte_reverification(self) -> None:
        """E2E/清理后不能沿用准入时摘要直接写 accepted。"""
        source = release.VERIFY_DELIVERY_SKILL.read_text(encoding="utf-8")
        anchors = (
            "在写入任何验收状态前再次只读运行 `verify-release-review`",
            "与准入快照逐字段相等",
            "重新计算全部最终制品、相邻摘要、manifest 声明、包内关键资源和当前 `release/` 精确集合",
            "不能只沿用 E2E 前的摘要",
        )
        for anchor in anchors:
            with self.subTest(anchor=anchor):
                mutated = source.replace(anchor, "沿用准入时检查结果", 1)
                self.assertNotEqual(mutated, source)
                errors = self._validate_mutation(mutated, parameter="verify_skill")
                self.assertTrue(any(anchor in error for error in errors), errors)

    def test_delivery_requires_atomic_whole_manifest_group_transition(self) -> None:
        """多平台验收状态只能在 staging 内整组一致地提交。"""
        source = release.VERIFY_DELIVERY_SKILL.read_text(encoding="utf-8")
        anchors = (
            "在 staging 内原子写入全部 manifests 的同一整组 `milestoneAcceptance` 结论",
            "绝不得产生 accepted/pending、accepted/rejected 或其他 mixed 状态",
            "把 staging 一次目录级原子替换为 `release/`",
            "替换后只读重新枚举并复算整组状态",
        )
        for anchor in anchors:
            with self.subTest(anchor=anchor):
                mutated = source.replace(anchor, "逐个更新 manifest", 1)
                self.assertNotEqual(mutated, source)
                errors = self._validate_mutation(mutated, parameter="verify_skill")
                self.assertTrue(any(anchor in error for error in errors), errors)

    def test_delivery_rejects_status_write_before_tail_envelope_check(self) -> None:
        """状态 staging/回写必须发生在真实检查和二次 closing-state 复核之后。"""
        source = release.VERIFY_DELIVERY_SKILL.read_text(encoding="utf-8")
        staging = "于项目根同级、同一文件系统的唯一 staging 复制当前 `release/` 精确集合"
        second_verify = "在写入任何验收状态前再次只读运行 `verify-release-review`"
        without_staging = source.replace(staging, "延后创建 staging", 1)
        mutated = without_staging.replace(second_verify, f"{staging}；{second_verify}", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutation(mutated, parameter="verify_skill")
        self.assertTrue(any("release selection contract order" in error for error in errors), errors)

    def test_e2e_requires_end_of_run_candidate_byte_recalculation(self) -> None:
        """E2E 结束不能只声明变化会失效，必须实际复算最终集合。"""
        source = release.E2E_SKILL.read_text(encoding="utf-8")
        anchors = (
            "所有场景和清理结束时",
            "重新计算全部最终制品、相邻摘要、manifest 声明及适用包内关键资源",
            "不得只声称“字节变化会使证据失效”而跳过结束复算",
        )
        for anchor in anchors:
            with self.subTest(anchor=anchor):
                mutated = source.replace(anchor, "只声明字节变化会失效", 1)
                self.assertNotEqual(mutated, source)
                errors = self._validate_mutation(mutated, parameter="e2e_skill")
                self.assertTrue(any(anchor in error for error in errors), errors)

    def test_prepare_ready_stage_is_read_only(self) -> None:
        """accepted 候选的 ready 复核不能 dirty 已发布的默认分支。"""
        source = release.PREPARE_RELEASE_SKILL.read_text(encoding="utf-8")
        anchors = (
            "就绪复核阶段保持纯只读",
            "不得更新 tracked 发布记录、Verification、Changelog、Product Status、版本状态或其他项目记忆",
            "只有真实渠道发布成功后，发布执行方才从这个已发布默认分支 closing commit 新建后续独立受管 feature 生命周期",
        )
        for anchor in anchors:
            with self.subTest(anchor=anchor):
                mutated = source.replace(anchor, "直接在默认分支更新项目记忆", 1)
                self.assertNotEqual(mutated, source)
                errors = self._validate_mutation(mutated, parameter="prepare_skill")
                self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_missing_atomic_release_review_field(self) -> None:
        source = release.BRANCH_CHAIN_STATE.read_text(encoding="utf-8")
        anchor = '"scopeDiffSha256",\n        "reviewedSourceCommit",\n        "checks",'
        mutated = source.replace(
            anchor,
            '"scopeDiffSha256",\n        "checks",',
            1,
        )
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutation(mutated, parameter="branch_state")
        self.assertTrue(any("reviewedSourceCommit" in error for error in errors), errors)

    def test_rejects_missing_atomic_candidate_selection_field(self) -> None:
        source = release.BRANCH_CHAIN_STATE.read_text(encoding="utf-8")
        anchor = (
            '"performanceReason",\n        "performanceRemainingRisk",\n'
            '        "macosSigningSelection",'
        )
        mutated = source.replace(
            anchor,
            '"performanceReason",\n        "macosSigningSelection",',
            1,
        )
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutation(mutated, parameter="branch_state")
        self.assertTrue(any("performanceRemainingRisk" in error for error in errors), errors)

    def test_rejects_closed_state_without_direct_default_target(self) -> None:
        """新 closing state 必须显式封存 releaseTarget=default。"""

        source = release.BRANCH_CHAIN_STATE.read_text(encoding="utf-8")
        anchors = (
            'direct_release_extension = {"releaseTarget"}',
            'if value["releaseTarget"] != "default":',
            'raise StateError("lastClosedChain.releaseTarget must be default")',
        )
        for anchor in anchors:
            with self.subTest(anchor=anchor):
                mutated = source.replace(anchor, "# omitted direct-default target", 1)
                self.assertNotEqual(mutated, source)
                errors = self._validate_mutation(mutated, parameter="branch_state")
                self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_illegal_candidate_source_or_reason_combinations(self) -> None:
        source = release.BRANCH_CHAIN_STATE.read_text(encoding="utf-8")
        mutations = (
            (
                'performance_source\n            not in '
                '{"requested", "product-required", "channel-required"}',
                'performance_source\n            not in '
                '{"requested", "product-required", "channel-required", "configured"}',
            ),
            (
                'performance_source\n            not in '
                '{"requested", "product-required", "channel-required"}\n'
                '            or value["performanceReason"] is not None',
                'performance_source\n            not in '
                '{"requested", "product-required", "channel-required"}\n'
                '            and value["performanceReason"] is not None',
            ),
            (
                'signing_source not in {"configured", "requested", "channel-required"}',
                'signing_source not in '
                '{"configured", "requested", "channel-required", "not-requested"}',
            ),
        )
        for anchor, replacement in mutations:
            with self.subTest(anchor=anchor):
                mutated = source.replace(anchor, replacement, 1)
                self.assertNotEqual(mutated, source)
                errors = self._validate_mutation(mutated, parameter="branch_state")
                self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_retry_that_accepts_candidate_selection_mismatch(self) -> None:
        source = release.BRANCH_CHAIN_OPERATIONS.read_text(encoding="utf-8")
        anchor = "if supplied_selections != selections:"
        mutated = source.replace(anchor, "if supplied_selections == selections:", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutation(mutated, parameter="branch_operations")
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_post_review_tree_only_check_that_hides_change_then_revert(self) -> None:
        source = release.BRANCH_CHAIN_OPERATIONS.read_text(encoding="utf-8")
        anchor = '["rev-list", "--reverse", f"{source_head}..{pre_close_head}"]'
        mutated = source.replace(
            anchor,
            '["diff", "--name-only", source_head, pre_close_head]',
            1,
        )
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutation(mutated, parameter="branch_operations")
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_legacy_closing_state_that_can_advance_default(self) -> None:
        """旧 closing state 不能借重试路径推进远端默认分支。"""

        source = release.BRANCH_CHAIN_OPERATIONS.read_text(encoding="utf-8")
        anchor = "legacy closing state cannot update the remote default branch"
        mutated = source.replace(anchor, "legacy closing state may update the remote default branch", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutation(mutated, parameter="branch_operations")
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_release_remote_without_atomic_exact_leases(self) -> None:
        """默认分支推进、legacy Release 和登记 feature 删除必须同一原子事务。"""

        source = release.BRANCH_CHAIN_REMOTE.read_text(encoding="utf-8")
        anchors = (
            '"--atomic",',
            'f"--force-with-lease=refs/heads/{default_branch}:{default_before}"',
            'f"--force-with-lease=refs/heads/{entry[\'branch\']}:{entry[\'preCloseHead\']}"',
            'f"{closing_head}:refs/heads/{default_branch}"',
            'if release_before is not None:',
            'f":refs/heads/{entry[\'branch\']}"',
            'return "pending-release-missing"',
            "def require_legacy_remote_complete(",
        )
        for anchor in anchors:
            with self.subTest(anchor=anchor):
                mutated = source.replace(anchor, "# weakened release transaction")
                self.assertNotEqual(mutated, source)
                errors = self._validate_mutation(mutated, parameter="branch_remote")
                self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_missing_direct_default_release_regressions(self) -> None:
        """main/master、迁移、清理、Worktree、重试和下一链回归必须持续存在。"""

        cases = (
            (
                "branch_tests",
                release.BRANCH_CHAIN_TESTS,
                (
                    "test_start_rejects_non_main_master_default_without_ref_changes",
                    "test_release_atomically_updates_default_and_cleans_exact_two_branch_chain",
                    "test_release_supports_master_as_dynamic_default",
                    "test_existing_release_is_migrated_to_default_and_deleted",
                    "test_legacy_remote_complete_allows_local_cleanup_only",
                    "test_next_chain_starts_from_published_default_without_release_branch",
                    "test_default_branch_worktree_occupancy_blocks_before_close_commit",
                ),
            ),
            (
                "branch_race_tests",
                release.BRANCH_CHAIN_RACE_TESTS,
                (
                    "test_default_race_uses_frozen_lease_and_preserves_feature_refs",
                    "test_concurrent_release_creation_is_preserved_and_retryable",
                    "test_legacy_release_deleted_during_push_is_retryable",
                    "test_complete_retry_from_base_default_skips_commit_gate_and_fast_forwards",
                ),
            ),
            (
                "branch_contract_tests",
                release.BRANCH_CHAIN_CONTRACT_TESTS,
                (
                    "test_push_transaction_updates_default_and_deletes_only_registered_refs",
                    "test_push_transaction_never_creates_release_when_it_was_absent",
                ),
            ),
        )
        for parameter, path, anchors in cases:
            source = path.read_text(encoding="utf-8")
            for anchor in anchors:
                with self.subTest(parameter=parameter, anchor=anchor):
                    mutated = source.replace(anchor, "test_removed_direct_default_regression", 1)
                    self.assertNotEqual(mutated, source)
                    errors = self._validate_mutation(mutated, parameter=parameter)
                    self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_missing_verify_release_review_cli_route(self) -> None:
        source = release.BRANCH_CHAIN_SCRIPT.read_text(encoding="utf-8")
        anchor = 'elif arguments.command == "verify-release-review":'
        mutated = source.replace(anchor, 'elif arguments.command == "verify-review":', 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutation(mutated, parameter="branch_cli")
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_missing_change_then_revert_branch_regression(self) -> None:
        source = release.BRANCH_CHAIN_TESTS.read_text(encoding="utf-8")
        anchor = "test_release_rejects_post_review_source_change_then_revert"
        mutated = source.replace(anchor, "test_release_allows_post_review_revert", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutation(mutated, parameter="branch_tests")
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_rust_or_gui_candidate_applicability_mismatch(self) -> None:
        cases = (
            (
                "rust_skill",
                release.BUILD_RELEASE_SKILL,
                "Rust 非 GUI 候选要求后者的性能与 macOS 签名选择都精确为 `not-applicable`",
            ),
            (
                "tauri_skill",
                release.TAURI_RELEASE_SKILL,
                "所有 GUI 候选的 `performanceSelection` 必须精确为 `enabled | disabled`",
            ),
            (
                "tauri_skill",
                release.TAURI_RELEASE_SKILL,
                "不含 macOS 时则必须精确为 `not-applicable`",
            ),
        )
        for parameter, skill, anchor in cases:
            with self.subTest(parameter=parameter, anchor=anchor):
                source = skill.read_text(encoding="utf-8")
                mutated = source.replace(anchor, "允许不匹配接口或目标平台的选择", 1)
                self.assertNotEqual(mutated, source)
                errors = self._validate_mutation(mutated, parameter=parameter)
                self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_unsigned_macos_notification_candidate(self) -> None:
        cases = (
            (
                "prepare_skill",
                release.PREPARE_RELEASE_SKILL,
                "macOS 同时 `system_notification = enabled` 且签名关闭",
            ),
            (
                "tauri_skill",
                release.TAURI_RELEASE_SKILL,
                "`system_notification = enabled` 而封存签名选择是 `disabled/not-requested`",
            ),
            (
                "verify_skill",
                release.VERIFY_DELIVERY_SKILL,
                "`system_notification = enabled` 的 macOS 候选若为 `disabled/not-requested` 或实际 unsigned",
            ),
            (
                "e2e_skill",
                release.E2E_SKILL,
                "`disabled/not-requested` 或实际 unsigned 必须在读取权限前失败",
            ),
        )
        for parameter, skill, anchor in cases:
            with self.subTest(parameter=parameter):
                source = skill.read_text(encoding="utf-8")
                mutated = source.replace(anchor, "允许 unsigned 通知候选继续", 1)
                self.assertNotEqual(mutated, source)
                errors = self._validate_mutation(mutated, parameter=parameter)
                self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_enabled_macos_signing_that_can_fall_back_unsigned(self) -> None:
        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "不得以 `--no-sign` 重试或静默降级"
        mutated = source.replace(anchor, "失败后可以 unsigned 重试", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutation(mutated, parameter="tauri_skill")
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_ambiguous_macos_signing_source_precedence(self) -> None:
        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "`macosSigningSource` 按 `channel-required > requested > configured > not-requested`"
        mutated = source.replace(anchor, "`macosSigningSource` 取任意可用来源", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutation(mutated, parameter="tauri_skill")
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_review_evidence_without_post_review_commit_boundary(self) -> None:
        source = release.PREPARE_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "`reviewedSourceCommit = sourceHead`"
        mutated = source.replace(anchor, "审查证据直接绑定最终构建提交", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutation(mutated, parameter="prepare_skill")
        self.assertTrue(any(anchor in error for error in errors), errors)


class TauriLocalInstallSkillValidationTests(unittest.TestCase):
    """锁定本地 Windows 试包不被升级为发布候选。"""

    @staticmethod
    def _validate(source: str) -> list[str]:
        """在隔离 Skill 上运行本地试包静态合同。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "SKILL.md"
            path.write_text(source, encoding="utf-8")
            errors: list[str] = []
            release.validate_tauri_local_install_contract(errors, local_skill=path)
            return errors

    def test_rejects_local_build_that_enters_release_preparation(self) -> None:
        """本地试包不得要求提交或生成正式发布说明。"""
        source = release.TAURI_LOCAL_INSTALL_SKILL.read_text(encoding="utf-8")
        for anchor in (
            "不得调用 `$desktop-prepare-release`",
            "不得生成、读取、校验或改写 `release-notes.json`",
            "不得创建、刷新或写入项目根 `release/`",
        ):
            with self.subTest(anchor=anchor):
                mutated = source.replace(anchor, "允许进入发布准备", 1)
                self.assertNotEqual(mutated, source)
                errors = self._validate(mutated)
                self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_local_build_that_asks_release_test_choices(self) -> None:
        """E2E/性能选择只属于候选，不得污染普通本地试包。"""
        source = release.TAURI_LOCAL_INSTALL_SKILL.read_text(encoding="utf-8")
        anchor = "本 Skill 不询问 E2E 开/关或性能测试开/关"
        mutated = source.replace(anchor, "本 Skill 每次询问测试选择", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_local_build_without_exact_native_unsigned_command(self) -> None:
        """Windows 试包必须原生、NSIS、x64 且显式不签名。"""
        source = release.TAURI_LOCAL_INSTALL_SKILL.read_text(encoding="utf-8")
        anchor = "pnpm tauri build --bundles nsis --target x86_64-pc-windows-msvc --no-sign"
        mutated = source.replace(anchor, "pnpm tauri build --bundles all", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)


class GuiPerformanceContractValidationTests(unittest.TestCase):
    """锁定每次性能选择以及启用、关闭和 xwin 分支的静态契约。"""

    @staticmethod
    def _validate_mutation(
        source: str,
        *,
        parameter: str,
    ) -> list[str]:
        """只替换一个性能契约来源，其余路径继续使用仓库真实文件。"""

        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "contract.md"
            path.write_text(source, encoding="utf-8")
            errors: list[str] = []
            release.validate_gui_release_performance_contract(
                errors,
                **{parameter: path},
            )
            return errors

    def test_rejects_missing_per_release_performance_question(self) -> None:
        """明确发布未携带选择时，发布入口必须询问一次且不得复用历史值。"""

        source = release.PREPARE_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "产品/渠道硬要求强制启用并记录来源；否则询问用户一次"
        mutated = source.replace(anchor, "沿用上次发布选择", 1)
        self.assertNotEqual(mutated, source)

        errors = self._validate_mutation(mutated, parameter="prepare_skill")

        self.assertTrue(any("否则询问用户一次" in error for error in errors), errors)

    def test_rejects_gui_build_that_accepts_not_applicable_performance(self) -> None:
        """GUI 构建只能消费关闭提交中明确启用或关闭的性能选择。"""

        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "所有 GUI 候选的 `performanceSelection` 必须精确为 `enabled | disabled`"
        mutated = source.replace(anchor, "GUI 候选也可使用 `not-applicable`", 1)
        self.assertNotEqual(mutated, source)

        errors = self._validate_mutation(mutated, parameter="tauri_skill")

        self.assertTrue(
            any(anchor in error for error in errors),
            errors,
        )

    def test_rejects_disabled_branch_that_leaves_performance_artifacts(self) -> None:
        """关闭分支必须省略探针、证据、豁免和运行时绑定字段。"""

        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = (
            "不创建 `performanceProbe`、`performanceEvidence`、"
            "`performanceThresholdProfile`、`performanceWaiver` 或 "
            "`performanceRuntimeBinding`"
        )
        mutated = source.replace(anchor, "保留旧性能证据以便复用", 1)
        self.assertNotEqual(mutated, source)

        errors = self._validate_mutation(mutated, parameter="tauri_skill")

        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_disabled_branch_without_reason_and_remaining_risk(self) -> None:
        """Not run 必须携带明确关闭原因和剩余性能风险。"""

        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "非空 `performanceReason` 和 `performanceRemainingRisk`"
        mutated = source.replace(anchor, "可省略性能关闭原因与风险", 1)
        self.assertNotEqual(mutated, source)

        errors = self._validate_mutation(mutated, parameter="tauri_skill")

        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_enabled_branch_without_probe_runtime_binding(self) -> None:
        """启用分支必须保留阈值、探针证据及包内运行时绑定。"""

        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = (
            "原生 macOS 且性能启用时记录 `performanceStatus: passed | waived`、"
            "`performanceThresholdProfile: gui-release-v2`"
        )
        mutated = source.replace(anchor, "原生 macOS 直接进入打包", 1)
        self.assertNotEqual(mutated, source)

        errors = self._validate_mutation(mutated, parameter="tauri_skill")

        self.assertTrue(
            any("performanceThresholdProfile: gui-release-v2" in error for error in errors),
            errors,
        )

    def test_rejects_xwin_enabled_branch_that_claims_verified_performance(self) -> None:
        """xwin 在性能启用时仍必须保持 Unverified，不能借用 macOS 采样。"""

        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "性能选择为 `enabled` 时 `performanceStatus` 为 `Unverified`"
        mutated = source.replace(anchor, "性能选择为 `enabled` 时记录为 `passed`", 1)
        self.assertNotEqual(mutated, source)

        errors = self._validate_mutation(mutated, parameter="tauri_skill")

        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_missing_native_windows_performance_branch(self) -> None:
        """Windows 原生候选必须能运行真实探针，不能沿用 xwin 的 Unverified。"""
        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "原生 Windows 且性能启用时使用相同的 `performanceStatus: passed | waived`"
        mutated = source.replace(anchor, "Windows 原生性能固定 Unverified", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutation(mutated, parameter="tauri_skill")
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_unconditional_xwin_unverified_status(self) -> None:
        """xwin 只有在性能启用时才是 Unverified，关闭时必须保持 Not run。"""

        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = (
            "只在 `performanceSelection: enabled` 时记录 "
            "`performanceStatus: Unverified`"
        )
        mutated = source.replace(
            anchor,
            "固定记录 `performanceStatus: Unverified`",
            1,
        )
        self.assertNotEqual(mutated, source)

        errors = self._validate_mutation(mutated, parameter="tauri_skill")

        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_removing_product_or_channel_performance_priority(self) -> None:
        """产品或渠道硬要求必须覆盖用户关闭选择并强制执行门禁。"""

        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "只有 `performanceSelection: enabled` 或产品/渠道硬要求时"
        mutated = source.replace(anchor, "产品/渠道要求可以忽略", 1)
        self.assertNotEqual(mutated, source)

        errors = self._validate_mutation(mutated, parameter="tauri_skill")

        self.assertTrue(any(anchor in error for error in errors), errors)


class TauriBuildSkillValidationTests(unittest.TestCase):
    """验证 macOS xwin 精确路由和签名公证一体语义不能被弱化。"""

    def _validate_mutated_skill(self, source: str) -> list[str]:
        """只替换 Tauri Skill，其他 helper 使用仓库真实文件。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "SKILL.md"
            path.write_text(source, encoding="utf-8")
            errors: list[str] = []
            release.validate_tauri_build_skill_contract(errors, tauri_skill=path)
            return errors

    def _validate_mutated_verify_skill(self, source: str) -> list[str]:
        """只替换交付验收 Skill，确认最终字节复核不能从传播链消失。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "SKILL.md"
            path.write_text(source, encoding="utf-8")
            errors: list[str] = []
            release.validate_tauri_build_skill_contract(errors, verify_skill=path)
            return errors

    def test_rejects_missing_exact_macos_xwin_route(self) -> None:
        """删掉 cargo-xwin、目标三元组或 NSIS 任一部分都必须失败。"""
        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = (
            "CI=true pnpm tauri build --bundles nsis --runner cargo-xwin "
            "--target x86_64-pc-windows-msvc"
        )
        mutated = source.replace(anchor, "CI=true pnpm tauri build", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutated_skill(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_missing_exact_native_windows_route(self) -> None:
        """Windows 原生候选不得退化成 xwin 或无目标的模糊命令。"""
        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = (
            "pnpm tauri build --bundles nsis --target x86_64-pc-windows-msvc "
            "--config src-tauri/tauri.release.conf.json"
        )
        mutated = source.replace(anchor, "pnpm tauri build --runner cargo-xwin", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutated_skill(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_native_windows_route_that_claims_runtime_verified(self) -> None:
        """原生编译成功不能代替真实安装和运行验收。"""
        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = (
            "在最终候选 E2E/验收真实执行安装和运行之前，固定记录 "
            "`runtimeVerification: Unverified`"
        )
        mutated = source.replace(anchor, "构建成功后固定记录 `runtimeVerification: passed`", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutated_skill(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_missing_windows_powershell_release_helper(self) -> None:
        """Windows GUI-only 下游不能依赖已裁掉的 CLI Skill 或 POSIX shell。"""
        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "scripts/prepare-release-directory.ps1 -ProjectRoot <project-root>"
        mutated = source.replace(anchor, "scripts/prepare-release-directory.sh <project-root>", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutated_skill(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_missing_updater_artifact_generation_gate(self) -> None:
        """启用 updater 时不能省略官方制品生成和发布私钥安全来源门禁。"""

        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        for anchor in (
            "bundle.createUpdaterArtifacts: true",
            "TAURI_SIGNING_PRIVATE_KEY",
            "官方 updater archive 与相邻 `.sig`",
        ):
            with self.subTest(anchor=anchor):
                mutated = source.replace(anchor, "omitted-updater-gate")
                self.assertNotEqual(mutated, source)
                errors = self._validate_mutated_skill(mutated)
                self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_treating_unsigned_installers_as_unsigned_updater_artifacts(self) -> None:
        """安装包 unsigned 许可不能弱化 updater archive 签名验证。"""

        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "安装包代码签名与 updater 制品签名是独立门禁"
        mutated = source.replace(anchor, "安装包和更新制品共用 unsigned 结论", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutated_skill(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_missing_all_or_none_notarization_rule(self) -> None:
        """macOS 候选若允许停在仅签名状态，门禁必须确定性失败。"""
        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "启用 macOS 签名后绝不得输出仅 Developer ID 签名但未公证/staple 的候选"
        mutated = source.replace(anchor, "允许输出仅签名候选", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutated_skill(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_missing_final_dmg_layout_verification(self) -> None:
        """只声明背景而不检查最终卷时，构建 Skill 必须确定性失败。"""
        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "scripts/verify-dmg-layout.sh <final-dmg>"
        mutated = source.replace(anchor, "只检查 Tauri 配置", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutated_skill(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_tauri_atomic_commit_before_manifest_envelope_recheck(self) -> None:
        """GUI 候选必须在 staging 内完成二次信封复核与 manifest 后才能提交。"""
        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        atomic = "随后才以不跟随链接的目录级原子替换提交到 `release/`"
        verify = "写 manifest 前再次运行只读 `verify-release-review`"
        without_atomic = source.replace(atomic, "延后原子提交", 1)
        mutated = without_atomic.replace(verify, f"{atomic}；{verify}", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutated_skill(mutated)
        self.assertTrue(any("Tauri release contract order" in error for error in errors), errors)

    def test_rejects_tauri_final_enumeration_before_atomic_commit(self) -> None:
        """最终 release 枚举只能检查已经原子替换后的完整集合。"""
        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        enumeration = "16. 重新枚举 `release/`"
        atomic = "随后才以不跟随链接的目录级原子替换提交到 `release/`"
        without_enumeration = source.replace(enumeration, "16. 完成候选", 1)
        mutated = without_enumeration.replace(atomic, f"{enumeration}；{atomic}", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutated_skill(mutated)
        self.assertTrue(any("Tauri release contract order" in error for error in errors), errors)

    def test_rejects_missing_project_dmg_background_reference(self) -> None:
        """构建不能回退为隐式或初始化 Skill 内的背景路径。"""
        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "<project-id>_gui/src-tauri/dmg/background.png"
        mutated = source.replace(anchor, "自动寻找任意背景图", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutated_skill(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_missing_bounded_interactive_dmg_strategy(self) -> None:
        """删除 CI/Finder 策略会重新允许空白安装窗口，必须失败。"""
        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "CI=true TAURI_BUNDLER_DMG_IGNORE_CI=1 pnpm tauri build --bundles dmg"
        mutated = source.replace(anchor, "CI=true pnpm tauri build --bundles dmg")
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutated_skill(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_missing_per_build_e2e_question(self) -> None:
        """Tauri 构建也必须在测试和编译前解析当次 E2E 选择。"""
        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "否则在任何测试或编译前询问用户一次"
        mutated = source.replace(anchor, "沿用项目历史偏好", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutated_skill(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_missing_complete_frontend_unit_suite(self) -> None:
        """GUI 候选不能只跑筛选后的前端测试。"""
        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "完整单元测试套件"
        mutated = source.replace(anchor, "筛选后的单元测试", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutated_skill(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_tauri_build_project_memory_writes(self) -> None:
        """Tauri 构建结果不得被复制进 ADR、Changelog 或其他项目记忆。"""
        source = release.TAURI_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification"
        mutated = source.replace(anchor, "同步更新项目记忆", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutated_skill(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_rejects_missing_milestone_dmg_reverification(self) -> None:
        """里程碑若不重验当前 DMG，旧布局证据可能错误绑定到新字节。"""
        source = release.VERIFY_DELIVERY_SKILL.read_text(encoding="utf-8")
        anchor = "针对 `release/` 中当前最终字节重新运行"
        mutated = source.replace(anchor, "可以沿用构建阶段的历史布局记录", 1)
        self.assertNotEqual(mutated, source)
        errors = self._validate_mutated_verify_skill(mutated)
        self.assertTrue(any(anchor in error for error in errors), errors)

if __name__ == "__main__":
    unittest.main()
