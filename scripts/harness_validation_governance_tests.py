"""Harness 入口、策略和 Work Plan 治理回归。"""

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


class ValidateHarnessEntrypointTests(unittest.TestCase):
    """覆盖单一命令入口、当前接口集合与已淘汰治理语义。"""

    def test_direct_script_entrypoint_succeeds(self) -> None:
        """从仓库根直接执行历史命令时应完成全部领域校验并返回成功。"""
        result = subprocess.run(
            [sys.executable, "scripts/validate_harness.py"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Harness validation passed:", result.stdout)

    def test_standalone_web_is_removed_while_tauri_stack_remains(self) -> None:
        """独立 WEB Skill 必须消失，GUI 自有基线仍须声明固定前端技术栈。"""
        self.assertFalse((ROOT / ".agents/skills/add-web-adapter").exists())
        baseline = (
            ROOT / ".agents/skills/add-gui-adapter/references/react-frontend-baseline.md"
        ).read_text(encoding="utf-8")
        for fragment in (
            "React 和 TypeScript",
            "Mantine UI",
            "TanStack Router",
            "TanStack Query",
            "Jotai",
            "pnpm-lock.yaml",
            "WebView",
        ):
            self.assertIn(fragment, baseline)

    def test_rejects_obsolete_per_task_preference_prompt(self) -> None:
        """持久项目偏好不得退回每任务重新授权语义。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "policy.md"
            path.write_text("Worktree 授权只对当前任务有效。", encoding="utf-8")
            errors: list[str] = []
            governance.validate_stale_fragments(errors, (path,))
        self.assertTrue(any("stale current description" in error for error in errors), errors)

    def test_rejects_obsolete_all_task_parallel_prompt(self) -> None:
        """旧的全修改/交付任务询问规则重新出现时应被拒绝。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "policy.md"
            path.write_text(
                "每个会修改仓库或执行交付工作的任务都必须询问并行模式。",
                encoding="utf-8",
            )
            errors: list[str] = []
            governance.validate_stale_fragments(errors, (path,))
        self.assertTrue(any("stale current description" in error for error in errors), errors)

    def test_rejects_invalid_harness_datetime_version(self) -> None:
        """12 位但不是有效年月日时分的 Harness 版本必须被拒绝。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "Version.md"
            path.write_text("# 版本\n\n- 当前版本：`202613401299`\n", encoding="utf-8")
            original = governance.VERSION_FILE
            governance.VERSION_FILE = path
            try:
                errors: list[str] = []
                governance.validate_version_contract(errors)
            finally:
                governance.VERSION_FILE = original
        self.assertTrue(any("not a valid Shanghai datetime" in error for error in errors), errors)


class ValidateAgentPolicyTests(unittest.TestCase):
    """覆盖四项持久偏好的合法 schema 与初始化 fail-closed 语义。"""

    @staticmethod
    def _current_policy() -> str:
        return read_repo_text("docs/AGENT_POLICY.md")

    @staticmethod
    def _validate(contents: str, *, allow_pending: bool = True) -> list[str]:
        return run_validator_on_tempfile(
            governance.validate_agent_policy,
            "AGENT_POLICY.md",
            contents,
            allow_pending=allow_pending,
        )

    def test_source_policy_is_valid(self) -> None:
        """Harness 源可以保留尚待下游首次确认的 pending。"""
        self.assertEqual(self._validate(self._current_policy()), [])

    def test_rejects_missing_preference_field(self) -> None:
        """四项选择缺失任一字段都必须失败。"""
        mutated = self._current_policy().replace("milestone_e2e: pending\n", "", 1)
        errors = self._validate(mutated)
        self.assertTrue(any("fields mismatch" in error for error in errors), errors)

    def test_rejects_invalid_preference_value(self) -> None:
        """偏好值不得扩展为模糊的 ask 或 auto。"""
        mutated = self._current_policy().replace(
            "milestone_smoke: pending",
            "milestone_smoke: auto",
            1,
        )
        errors = self._validate(mutated)
        self.assertTrue(any("milestone_smoke must be" in error for error in errors), errors)

    def test_initialized_downstream_rejects_pending(self) -> None:
        """下游基线前必须解析所有 pending，而不是把选择留给后续任务。"""
        errors = self._validate(self._current_policy(), allow_pending=False)
        self.assertTrue(
            any("initialized downstream Agent policy must resolve" in error for error in errors),
            errors,
        )

    def test_resolved_downstream_rejects_pending_confirmation_metadata(self) -> None:
        """四项选择虽已解析，确认来源和日期仍不得保留占位值。"""

        resolved = self._current_policy()
        for field in (
            "superpowers",
            "parallel_worktree_subagents",
            "milestone_smoke",
            "milestone_e2e",
        ):
            resolved = resolved.replace(f"{field}: pending", f"{field}: disabled", 1)
        errors = self._validate(resolved, allow_pending=False)
        self.assertTrue(any("confirmed_by" in error for error in errors), errors)
        self.assertTrue(any("confirmed_at" in error for error in errors), errors)

    def test_resolved_downstream_rejects_invalid_confirmation_date(self) -> None:
        """确认日期必须是实际存在的 ISO 日期或 RFC3339 时间。"""

        resolved = self._current_policy().replace("confirmed_by: pending", "confirmed_by: owner", 1)
        resolved = resolved.replace("confirmed_at: pending", "confirmed_at: 2026-02-30", 1)
        for field in (
            "superpowers",
            "parallel_worktree_subagents",
            "milestone_smoke",
            "milestone_e2e",
        ):
            resolved = resolved.replace(f"{field}: pending", f"{field}: enabled", 1)
        errors = self._validate(resolved, allow_pending=False)
        self.assertTrue(any("calendar-valid" in error for error in errors), errors)


class ValidateWorkPlanTests(unittest.TestCase):
    """覆盖 Todo 状态、里程碑准入和未完成时禁止验收。"""

    TODO_TOKEN = SHARED_TODO_TOKEN

    @staticmethod
    def _valid_plan() -> str:
        todo_token = ValidateWorkPlanTests.TODO_TOKEN
        return f"""# 当前工作计划

- 当前任务路径：`里程碑`

## Todo 批次 A

### {todo_token}（pending）：实现行为

- 预期行为：实现批准行为。
- 影响边界：只修改受控范围。
- 完成验证：运行非空单元测试。
- 状态值包括 `pending`、`in_progress`、`blocked`、`done`。

## 验证里程碑 M1

- 进入条件：Todo 全部 `done`。
- 候选必须是完整真实产物，模拟实现与脚手架不可验收。
- 失败时重开 Todo 并返回 `$implement-change`。
"""

    @staticmethod
    def _validate(contents: str) -> list[str]:
        return run_validator_on_tempfile(
            repository.validate_work_plan_contract,
            "20260731_work_plan.md",
            contents,
        )

    def test_valid_todo_and_milestone_plan(self) -> None:
        """带稳定状态和回流语义的活动计划应通过。"""
        self.assertEqual(self._validate(self._valid_plan()), [])

    def test_rejects_missing_milestone(self) -> None:
        """显式里程碑路径缺少验收章节时必须失败。"""
        mutated = self._valid_plan().replace("## 验证里程碑 M1", "## 验证阶段 M1", 1)
        errors = self._validate(mutated)
        self.assertTrue(any("missing ## 验证里程碑" in error for error in errors), errors)

    def test_rejects_todo_without_explicit_state(self) -> None:
        """Todo 标题缺少可机读状态时必须失败。"""
        mutated = self._valid_plan().replace(
            f"{self.TODO_TOKEN}（pending）",
            self.TODO_TOKEN,
            1,
        )
        errors = self._validate(mutated)
        self.assertTrue(any("explicit state" in error for error in errors), errors)

    def test_rejects_accepted_milestone_with_pending_todo(self) -> None:
        """任一 Todo 未完成时不得把里程碑记为 accepted。"""
        mutated = self._valid_plan() + "\n里程碑状态：accepted\n"
        errors = self._validate(mutated)
        self.assertTrue(
            any("marks a milestone accepted while Todo remains non-done" in error for error in errors),
            errors,
        )

    def test_rejects_duplicate_todo_id_and_missing_per_item_field(self) -> None:
        """Todo ID 必须唯一，且每项都拥有预期、边界和验证。"""

        duplicated = self._valid_plan().replace(
            "## 验证里程碑 M1",
            f"### {self.TODO_TOKEN}（done）：重复\n\n- 预期行为：重复。\n"
            "- 完成验证：重复。\n\n## 验证里程碑 M1",
            1,
        )
        errors = self._validate(duplicated)
        self.assertTrue(any("duplicate Todo IDs" in error for error in errors), errors)
        self.assertTrue(any("ownership/boundary" in error for error in errors), errors)

    def test_rejects_chinese_pass_verdict_with_unfinished_todo(self) -> None:
        """常见中文“里程碑结论：通过”不能绕过未完成 Todo 门禁。"""

        errors = self._validate(self._valid_plan() + "\n里程碑结论：通过\n")
        self.assertTrue(
            any("marks a milestone accepted while Todo remains non-done" in error for error in errors),
            errors,
        )

    def test_allows_explicit_not_run_with_negative_acceptance_sentence(self) -> None:
        """否定句提到验收结论时，不得把未运行状态误判为已验收。"""

        plan = self._valid_plan() + (
            "\n- 当前状态：`Not run`；因此不产生 `Milestone accepted` 结论。\n"
        )
        self.assertEqual(self._validate(plan), [])

    def test_scopes_each_milestone_to_its_preceding_todo_batch(self) -> None:
        """前一批已验收时，后一批未完成 Todo 不得反向污染其结论。"""

        first_batch = self._valid_plan().replace("（pending）", "（done）", 1)
        first_batch += "\n- 里程碑状态：accepted\n\n"
        second_batch = f"""## Todo 批次 B

### TO{''}DO-B01（pending）：后续行为

- 预期行为：实现后续行为。
- 影响边界：只修改后续范围。
- 完成验证：运行非空单元测试。

## 验证里程碑 M2

- 当前状态：`Not run`。
- 候选必须是完整真实产物，模拟实现与脚手架不可验收。
- 失败时重开 Todo 并返回 `$implement-change`。
"""
        self.assertEqual(self._validate(first_batch + second_batch), [])


class ProjectMemoryTriggerTests(unittest.TestCase):
    """保护日常维护排除与独立发布证据边界。"""

    def test_current_project_memory_exclusions_are_valid(self) -> None:
        """当前索引和执行 Skills 应使用一致的事件触发规则。"""

        errors: list[str] = []
        repository.validate_daily_project_memory(errors)
        self.assertEqual(errors, [], "\n".join(errors))

    def test_rejects_obsolete_changelog_fix_category(self) -> None:
        """旧的通用修复分类不能回流当前事实源。"""

        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "current.md"
            path.write_text(
                "只记录已经发生的新增、变化、修复、移除、安全事项。",
                encoding="utf-8",
            )
            errors: list[str] = []
            governance.validate_stale_fragments(errors, (path,))
        self.assertTrue(any("stale current description" in item for item in errors))

    def test_release_contract_allows_fix_only_without_changelog(self) -> None:
        """仅修复 PATCH 仍有发布证据，但不得制造 Changelog。"""

        release = read_repo_text("docs/RELEASE.md")
        prepare = read_repo_text(".agents/skills/prepare-release/SKILL.md")
        self.assertIn("版本变化与 Changelog 写入是独立门禁", release)
        self.assertIn("缺少 Changelog 不削弱发布证据", release)
        self.assertIn("仅含普通缺陷修复或纯重构", prepare)
        self.assertIn("不创建、不补写也不汇总 Changelog", prepare)
