"""发布构建、上下文和 Git 生命周期 validator 的确定性回归。"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts.harness_validation import git_lifecycle, release


class ValidatorMutationTests(unittest.TestCase):
    """用单点破坏证明当前发布合同会失败关闭。"""

    @staticmethod
    def temporary_source(source: str, name: str = "SKILL.md"):
        """返回临时目录上下文与其中的 UTF-8 文件。"""
        directory = tempfile.TemporaryDirectory()
        path = Path(directory.name) / name
        path.write_text(source, encoding="utf-8")
        return directory, path

    @staticmethod
    def remove_fragment(path: Path, fragment: str) -> str:
        """从真实合同移除一个锚点，确保测试不是凭空构造。"""
        source = path.read_text(encoding="utf-8")
        if fragment not in source:
            raise AssertionError(f"fixture fragment is absent: {fragment}")
        return source.replace(fragment, "")

    def validate_mutation(self, validator, argument: str, path: Path, fragment: str) -> list[str]:
        """把单个合同文件替换为变异副本并返回错误。"""
        directory, mutated = self.temporary_source(self.remove_fragment(path, fragment), path.name)
        try:
            errors: list[str] = []
            validator(errors, **{argument: mutated})
            return errors
        finally:
            directory.cleanup()

    def test_current_release_contract_passes(self) -> None:
        """当前组合合同本身必须通过。"""
        errors: list[str] = []
        release.validate_release_contract(errors)
        self.assertEqual(errors, [])

    def test_current_git_lifecycle_contract_passes(self) -> None:
        """自动分支、主分支发布、tag 和精确清理合同必须通过。"""
        errors: list[str] = []
        git_lifecycle.validate_git_lifecycle_contract(errors)
        self.assertEqual(errors, [])

    def test_release_ignore_requires_exact_root_rules(self) -> None:
        """release 与隔离目录都只能使用唯一根锚定 ignore。"""
        cases = {
            "/target/\n/release/\n/.release-clean.*\n": False,
            "/release/\n/release/\n/.release-clean.*\n": True,
            "/release/\n/.release-clean.*\nrelease/\n": True,
            "/release/\n": True,
        }
        for contents, should_fail in cases.items():
            with self.subTest(contents=contents):
                directory, path = self.temporary_source(contents, ".gitignore")
                try:
                    errors: list[str] = []
                    release.validate_release_ignore(errors, path)
                    self.assertEqual(bool(errors), should_fail, errors)
                finally:
                    directory.cleanup()

    def test_rust_build_requires_context_before_tests(self) -> None:
        """Rust 候选不能跳过发布上下文只读校验。"""
        errors = self.validate_mutation(
            release.validate_release_selection_contract,
            "rust_skill",
            release.BUILD_RELEASE_SKILL,
            "release_context.py verify --project-root .",
        )
        self.assertTrue(any("release selection contract missing" in error for error in errors), errors)

    def test_rust_build_requires_per_candidate_e2e_choice(self) -> None:
        """E2E 选择必须逐候选解析。"""
        errors = self.validate_mutation(
            release.validate_build_skill_contract,
            "build_skill",
            release.BUILD_RELEASE_SKILL,
            "本次请求已明确 `enabled`/`disabled` 时直接复用",
        )
        self.assertTrue(any("release contract missing" in error for error in errors), errors)

    def test_cross_platform_workflow_requires_context_capture_and_verify(self) -> None:
        """远端 runner 必须在构建前捕获、manifest 前复核上下文。"""
        for fragment in ("verify_release_context.py capture", "verify_release_context.py verify"):
            with self.subTest(fragment=fragment):
                errors = self.validate_mutation(
                    release.validate_build_skill_contract,
                    "cross_platform_workflow",
                    release.CROSS_PLATFORM_RELEASE_WORKFLOW,
                    fragment,
                )
                self.assertTrue(any("release contract missing" in error for error in errors), errors)

    def test_cross_platform_context_rejects_worktree_byte_drift(self) -> None:
        """runner helper 必须把工作树上下文字节绑定到提交。"""
        errors = self.validate_mutation(
            release.validate_build_skill_contract,
            "cross_platform_context_helper",
            release.CROSS_PLATFORM_RELEASE_CONTEXT_HELPER,
            "working release context bytes do not match source_commit",
        )
        self.assertTrue(any("release contract missing" in error for error in errors), errors)

    def test_collection_requires_second_context_verification(self) -> None:
        """原子替换 release 前必须再次验证发布上下文。"""
        errors = self.validate_mutation(
            release.validate_build_skill_contract,
            "collect_skill",
            release.COLLECT_RELEASE_SKILL,
            "在触碰目标目录前第二次运行发布上下文 `verify`",
        )
        self.assertTrue(any("release contract missing" in error for error in errors), errors)

    def test_prepare_release_requires_lifecycle_release(self) -> None:
        """发布准备不能绕过统一 Git release 命令。"""
        errors = self.validate_mutation(
            release.validate_release_selection_contract,
            "prepare_skill",
            release.PREPARE_RELEASE_SKILL,
            "$desktop-manage-git-lifecycle release",
        )
        self.assertTrue(any("release selection contract missing" in error for error in errors), errors)

    def test_harness_source_release_requires_git_only_endpoint(self) -> None:
        """Harness 必须在共享 Git 步骤结束，不能落入产品候选链。"""
        errors = self.validate_mutation(
            release.validate_harness_source_release_contract,
            "release_doc",
            release.ROOT / "docs" / "RELEASE.md",
            "Harness 在步骤 2 完成并复核 Git 引用后结束",
        )
        self.assertTrue(any("Harness source release contract missing" in error for error in errors), errors)

    def test_candidate_steps_are_explicitly_downstream_only(self) -> None:
        """产品候选步骤 3–7 只能对终端下游生效。"""
        errors = self.validate_mutation(
            release.validate_harness_source_release_contract,
            "release_doc",
            release.ROOT / "docs" / "RELEASE.md",
            "步骤 3–7 仅适用于终端下游产品候选",
        )
        self.assertTrue(any("Harness source release contract missing" in error for error in errors), errors)

    def test_candidate_ready_review_is_explicitly_downstream_only(self) -> None:
        """Harness 完成 Git 发布后不能误入产品候选就绪复核。"""

        errors = self.validate_mutation(
            release.validate_harness_source_release_contract,
            "prepare_skill",
            release.PREPARE_RELEASE_SKILL,
            "以下就绪复核只适用于已经形成产品候选的终端下游",
        )
        self.assertTrue(any("Harness source release contract missing" in error for error in errors), errors)

    def test_prepare_release_entry_metadata_is_harness_git_only(self) -> None:
        """Skill 的 UI 入口不能把 Harness 源无条件导向产品候选。"""

        path = release.PREPARE_RELEASE_SKILL.parent / "agents" / "openai.yaml"
        errors = self.validate_mutation(
            release.validate_harness_source_release_contract,
            "prepare_openai",
            path,
            "Harness 源至此完成 Git 发布",
        )
        self.assertTrue(any("Harness source release contract missing" in error for error in errors), errors)

    def test_registered_remote_precedes_origin_in_policy(self) -> None:
        """已登记远端必须优先，不能因 origin 存在而在周期中途改绑。"""

        errors = self.validate_mutation(
            release.validate_harness_source_release_contract,
            "agent_policy",
            release.AGENT_POLICY,
            "当前发布周期已经登记远端时必须原样沿用",
        )
        self.assertTrue(any("Harness source release contract missing" in error for error in errors), errors)

    def test_release_metadata_commit_requires_notes_and_context_only(self) -> None:
        """第二提交必须同含日志和上下文，且不能混入 Changelog。"""
        errors = self.validate_mutation(
            release.validate_harness_source_release_contract,
            "prepare_skill",
            release.PREPARE_RELEASE_SKILL,
            "第二个精确范围提交只能同时包含 `release-notes.json` 与 `.harness/release-context.json`",
        )
        self.assertTrue(any("Harness source release contract missing" in error for error in errors), errors)

    def test_prepare_release_requires_explicit_lifecycle_remote(self) -> None:
        """发布上下文选择的远端必须显式传给生命周期 helper。"""
        errors = self.validate_mutation(
            release.validate_harness_source_release_contract,
            "prepare_skill",
            release.PREPARE_RELEASE_SKILL,
            "--remote <remote>",
        )
        self.assertTrue(any("Harness source release contract missing" in error for error in errors), errors)

    def test_release_context_write_requires_current_source_head(self) -> None:
        """上下文写入必须在元数据提交前绑定当前源码 HEAD。"""
        errors = self.validate_mutation(
            release.validate_harness_source_release_contract,
            "context_helper",
            release.RELEASE_CONTEXT_HELPER,
            "sourceHead must equal the current HEAD before metadata commit",
        )
        self.assertTrue(any("Harness source release contract missing" in error for error in errors), errors)

    def test_harness_candidate_selections_are_fixed_not_applicable(self) -> None:
        """Harness 不得询问或制造性能与签名候选选择。"""
        fragment = (
            "--performance-selection not-applicable --performance-source not-applicable "
            "--macos-signing-selection not-applicable --macos-signing-source not-applicable"
        )
        errors = self.validate_mutation(
            release.validate_harness_source_release_contract,
            "prepare_skill",
            release.PREPARE_RELEASE_SKILL,
            fragment,
        )
        self.assertTrue(any("Harness source release contract missing" in error for error in errors), errors)

    def test_optional_harness_archive_cannot_use_product_manifest(self) -> None:
        """可选源码归档只有摘要旁车，不得套用产品候选 manifest。"""
        errors = self.validate_mutation(
            release.validate_harness_source_release_contract,
            "release_doc",
            release.ROOT / "docs" / "RELEASE.md",
            "它不是产品候选，不创建或套用产品 manifest",
        )
        self.assertTrue(any("Harness source release contract missing" in error for error in errors), errors)

    def test_historical_review_rejects_deleted_daily_adr_path(self) -> None:
        """历史复核不得继续链接已合并删除的按日 ADR 文件。"""
        current = release.ROOT / "docs" / "verification" / "human_review.md"
        source = current.read_text(encoding="utf-8") + "\n`docs/adr/20260911_ADR.md`\n"
        directory, path = self.temporary_source(source, "human_review.md")
        try:
            errors: list[str] = []
            release.validate_harness_source_release_contract(errors, human_review=path)
            self.assertTrue(any("retains deleted 20260911 ADR path" in error for error in errors), errors)
        finally:
            directory.cleanup()

    def test_methodology_rejects_missing_release_tag_as_non_blocking(self) -> None:
        """方法论卷不得把正式候选的远程 tag 降级为可缺席证据。"""
        current = release.ROOT / "docs" / "harness_engineering" / "agent_first_design.md"
        source = current.read_text(encoding="utf-8")
        source = source.replace(
            "其缺席不代替或放宽 Git tag 门禁",
            "缺席不阻断候选验收或只读就绪复核",
            1,
        )
        directory, path = self.temporary_source(source, current.name)
        try:
            errors: list[str] = []
            release.validate_harness_source_release_contract(errors, methodology_doc=path)
            self.assertTrue(any("missing release tag" in error for error in errors), errors)
        finally:
            directory.cleanup()

    def test_changelog_must_precede_source_head_and_metadata(self) -> None:
        """Changelog 不能在 sourceHead 或发布元数据提交之后补写。"""
        source = release.PREPARE_RELEASE_SKILL.read_text(encoding="utf-8")
        fragment = "任何由独立事件真实触发的 Changelog"
        self.assertIn(fragment, source)
        directory, path = self.temporary_source(source.replace(fragment, "", 1) + f"\n{fragment}\n")
        try:
            errors: list[str] = []
            release.validate_harness_source_release_contract(errors, prepare_skill=path)
            self.assertTrue(any("contract order" in error for error in errors), errors)
        finally:
            directory.cleanup()

    def test_shared_steps_must_precede_downstream_candidate_steps(self) -> None:
        """Harness 终点必须在任何终端下游候选步骤之前。"""
        release_doc = release.ROOT / "docs" / "RELEASE.md"
        source = release_doc.read_text(encoding="utf-8")
        fragment = "步骤 1–2 是 Harness 源与终端下游的正式 Git 发布共享流程"
        self.assertIn(fragment, source)
        directory, path = self.temporary_source(source.replace(fragment, "", 1) + f"\n{fragment}\n")
        try:
            errors: list[str] = []
            release.validate_harness_source_release_contract(errors, release_doc=path)
            self.assertTrue(any("contract order" in error for error in errors), errors)
        finally:
            directory.cleanup()

    def test_release_doc_rejects_context_only_legacy_git_sequence(self) -> None:
        """Git 生命周期摘要也必须先锁 sourceHead，再同提交日志与上下文。"""

        current = release.ROOT / "docs" / "RELEASE.md"
        source = current.read_text(encoding="utf-8")
        current_fragment = (
            "先提交源码/治理变化及已触发 Changelog 并锁定 `sourceHead`；"
            "在当前 HEAD 仍等于该值时生成双语 `release-notes.json` 与 "
            "`.harness/release-context.json`，再把且只把这两个文件放入同一个发布元数据提交。"
        )
        self.assertIn(current_fragment, source)
        legacy_fragment = (
            "先把当前版本写入 `.harness/release-context.json` 并提交；随后 "
            "`release --version <version>`"
        )
        directory, path = self.temporary_source(source.replace(current_fragment, legacy_fragment, 1), current.name)
        try:
            errors: list[str] = []
            release.validate_harness_source_release_contract(errors, release_doc=path)
            self.assertTrue(
                any("stale context-only Git release" in error for error in errors),
                errors,
            )
        finally:
            directory.cleanup()

    def test_release_context_requires_all_selection_groups(self) -> None:
        """审查、性能和 macOS 签名选择必须同处一个上下文。"""
        for fragment in ('"releaseReview"', '"candidateSelections"'):
            with self.subTest(fragment=fragment):
                errors = self.validate_mutation(
                    release.validate_release_selection_contract,
                    "context_helper",
                    release.RELEASE_CONTEXT_HELPER,
                    fragment,
                )
                self.assertTrue(errors)

    def test_candidate_builds_must_consume_release_context(self) -> None:
        """CLI 与 GUI 构建都不能从对话补造发布选择。"""
        cases = (
            ("rust_skill", release.BUILD_RELEASE_SKILL),
            ("tauri_skill", release.TAURI_RELEASE_SKILL),
        )
        for argument, path in cases:
            with self.subTest(argument=argument):
                errors = self.validate_mutation(
                    release.validate_release_selection_contract,
                    argument,
                    path,
                    "release_context.py verify --project-root .",
                )
                self.assertTrue(any("release selection contract missing" in error for error in errors), errors)

    def test_delivery_rechecks_context_before_status_write(self) -> None:
        """最终验收状态写入前必须再次确认发布提交和选择未漂移。"""
        errors = self.validate_mutation(
            release.validate_release_selection_contract,
            "verify_skill",
            release.VERIFY_DELIVERY_SKILL,
            "在写入验收状态前再次运行发布上下文 `verify`",
        )
        self.assertTrue(any("release selection contract missing" in error for error in errors), errors)

    def test_git_release_requires_tag_before_cleanup(self) -> None:
        """tag 推送与复读必须出现在任一资源删除之前。"""
        source = release.GIT_LIFECYCLE_SCRIPT.read_text(encoding="utf-8")
        before = """    ensure_release_tag(repository, remote, pending[\"tag\"], pending[\"head\"])
    cleaned_worktrees = cleanup_worktrees(repository, state)
"""
        after = """    cleaned_worktrees = cleanup_worktrees(repository, state)
    ensure_release_tag(repository, remote, pending[\"tag\"], pending[\"head\"])
"""
        self.assertIn(before, source)
        directory, path = self.temporary_source(source.replace(before, after, 1), "git_lifecycle.py")
        try:
            errors: list[str] = []
            with mock.patch.object(git_lifecycle, "GIT_LIFECYCLE_SCRIPT", path):
                git_lifecycle.validate_git_lifecycle_contract(errors)
            self.assertTrue(any("tag-before-cleanup" in error for error in errors), errors)
        finally:
            directory.cleanup()

    def test_git_lifecycle_rejects_retired_branch_gates(self) -> None:
        """旧的线性、lease、atomic 或祖先门禁不能重新进入 helper。"""
        source = release.GIT_LIFECYCLE_SCRIPT.read_text(encoding="utf-8")
        for token in ('"--ff-only"', '"--force-with-lease', '"--atomic"', '"merge-base"'):
            with self.subTest(token=token):
                directory, path = self.temporary_source(source + f"\n# {token}\n", "git_lifecycle.py")
                try:
                    errors: list[str] = []
                    with mock.patch.object(git_lifecycle, "GIT_LIFECYCLE_SCRIPT", path):
                        git_lifecycle.validate_git_lifecycle_contract(errors)
                    self.assertTrue(any("branch gate remains" in error for error in errors), errors)
                finally:
                    directory.cleanup()

    def test_release_git_requires_exact_local_cleanup(self) -> None:
        """发布后精确登记分支必须删除，不能由祖先关系决定是否保留。"""
        errors = self.validate_mutation(
            release.validate_release_git_contract,
            "lifecycle_script",
            release.GIT_LIFECYCLE_SCRIPT,
            '["branch", "-D", "--", branch]',
        )
        self.assertTrue(any("release Git contract missing" in error for error in errors), errors)

    def test_tauri_candidate_requires_fixed_selection_contract(self) -> None:
        """GUI 候选必须锁定性能和签名选择。"""
        for validator, label, fragment in (
            (
                release.validate_gui_release_performance_contract,
                "GUI performance contract missing",
                "所有 GUI 候选的 `performanceSelection` 必须精确为 `enabled | disabled`",
            ),
            (
                release.validate_release_selection_contract,
                "release selection contract missing",
                "当前候选目标包含 macOS 时 `macosSigningSelection` 必须精确为 `enabled | disabled`",
            ),
        ):
            with self.subTest(fragment=fragment):
                errors = self.validate_mutation(
                    validator,
                    "tauri_skill",
                    release.TAURI_RELEASE_SKILL,
                    fragment,
                )
                self.assertTrue(any(label in error for error in errors), errors)

    def test_gui_performance_requires_v2_threshold_binding(self) -> None:
        """最终验收必须复核与探针证据相同的 v2 阈值。"""
        errors = self.validate_mutation(
            release.validate_gui_release_performance_contract,
            "verify_skill",
            release.VERIFY_DELIVERY_SKILL,
            "证据的 `thresholdProfile` 必须同为 `gui-release-v2`",
        )
        self.assertTrue(any("GUI performance contract missing" in error for error in errors), errors)

    def test_local_install_cannot_become_release_candidate(self) -> None:
        """普通本地试包必须保持开发制品边界。"""
        errors = self.validate_mutation(
            release.validate_tauri_local_install_contract,
            "local_skill",
            release.TAURI_LOCAL_INSTALL_SKILL,
            "releaseCandidate: false",
        )
        self.assertTrue(any("Tauri local install contract missing" in error for error in errors), errors)


if __name__ == "__main__":
    unittest.main()
