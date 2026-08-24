"""精简开发流程、初始化预设与按需 Work Plan 的回归测试。"""

from __future__ import annotations

import re
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.harness_validation import governance, initialization, repository
from scripts.harness_validation_test_support import (
    TODO_TOKEN as SHARED_TODO_TOKEN,
    read_repo_text,
    run_validator_on_tempfile,
)


class AgentPolicyTests(unittest.TestCase):
    """覆盖推荐预设与自定义选择对既有 schema v1 的物化。"""

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

    @classmethod
    def _resolved_policy(cls, values: dict[str, str]) -> str:
        """把 Harness 源策略物化为带真实确认元数据的下游策略。"""
        resolved = cls._current_policy()
        merged_fields = {
            "confirmed_by": "project-owner",
            "confirmed_at": "2026-08-03",
            **values,
        }
        for field, value in merged_fields.items():
            resolved, replacements = re.subn(
                rf"(?m)^{re.escape(field)}: (?:pending|enabled|disabled)$",
                f"{field}: {value}",
                resolved,
                count=1,
            )
            if replacements != 1:
                raise AssertionError(f"policy field was not replaced: {field}")
        return resolved

    def test_recommended_values_are_valid_schema_v1_policy(self) -> None:
        """推荐预设只物化现有四字段，并通过下游 fail-closed 校验。"""
        resolved = self._resolved_policy(
            {
                "superpowers": "enabled",
                "parallel_worktree_subagents": "enabled",
                "milestone_smoke": "enabled",
                "milestone_e2e": "disabled",
            }
        )
        self.assertEqual(self._validate(resolved, allow_pending=False), [])

    def test_custom_values_are_not_forced_to_recommended_values(self) -> None:
        """自定义选择可物化不同合法组合，不被推荐配方覆盖。"""
        resolved = self._resolved_policy(
            {
                "superpowers": "disabled",
                "parallel_worktree_subagents": "disabled",
                "milestone_smoke": "disabled",
                "milestone_e2e": "enabled",
            }
        )
        self.assertEqual(self._validate(resolved, allow_pending=False), [])

    def test_rejects_persisted_preset_field(self) -> None:
        """推荐预设只是输入快捷方式，不得扩张稳定 schema。"""
        mutated = self._current_policy().replace(
            "schema_version: 1\n", "schema_version: 1\npreset: agile\n", 1
        )
        errors = self._validate(mutated)
        self.assertTrue(any("fields mismatch" in error for error in errors), errors)

    def test_current_initialization_selection_contract_is_valid(self) -> None:
        """初始化入口必须同时保留推荐和自定义两种选择语义。"""
        errors: list[str] = []
        initialization.validate_initialization_contract(errors)
        self.assertEqual(errors, [])

    def test_neutral_initialization_does_not_create_verification_memory(self) -> None:
        """中性初始化只能返回环境证据，不能复制或新建验证历史。"""
        instantiate = read_repo_text(".agents/skills/desktop-instantiate-project/SKILL.md")
        initialize = read_repo_text(".agents/skills/desktop-initialize-rust-project/SKILL.md")
        environment = read_repo_text(".agents/skills/desktop-check-development-environment/SKILL.md")
        self.assertIn("历史验证正文", instantiate)
        self.assertIn("docs/verification/", instantiate)
        self.assertIn("不创建或更新 `docs/VERIFICATION.md`", initialize)
        self.assertIn("不得为普通开发预建 Verification", environment)

    def test_public_behavior_and_product_rename_use_direct_development(self) -> None:
        """公开行为和已批准改名都不能自动制造计划、构建或完整验收。"""
        initialize = read_repo_text(".agents/skills/desktop-initialize-rust-project/SKILL.md")
        rename = read_repo_text(".agents/skills/desktop-rename-project-identity/SKILL.md")
        self.assertIn("业务 core 或适配器变化都直接实施", initialize)
        self.assertIn("不自动创建 Work Plan、构建候选或完整验收记录", initialize)
        self.assertIn("现有产品改名", rename)
        self.assertIn("确认后直接实施", rename)
        self.assertIn("不自动创建 Work Plan、候选或完整验收步骤", rename)


class StreamlinedDevelopmentTests(unittest.TestCase):
    """覆盖直接实施、当前必要测试和显式并行边界。"""

    def test_implementation_only_runs_current_required_tests(self) -> None:
        """日常实现必须只运行当前必要测试，不扩张到全仓门禁。"""
        skill = read_repo_text(".agents/skills/desktop-implement-change/SKILL.md")
        self.assertIn("只运行第 6 步的测试", skill)
        self.assertIn("不得自动追加格式化、lint、静态、集成/契约、全仓测试、构建", skill)
        self.assertIn("未触发时不写占位", skill)

    def test_multistep_work_does_not_automatically_create_plan_or_subagents(self) -> None:
        """多步骤、多模块或可并行本身不能增加计划和 Subagent。"""
        skill = read_repo_text(".agents/skills/desktop-implement-change/SKILL.md")
        self.assertIn("不因多步骤、多模块、中等风险、可并行或 Agent 偏好", skill)
        self.assertIn("自动调用 `$desktop-plan-change`、创建 Work Plan、启动 Subagent", skill)

    def test_build_is_a_separate_explicit_flow(self) -> None:
        """普通开发只在用户显式要求构建时进入构建 Skill。"""
        skill = read_repo_text(".agents/skills/desktop-implement-change/SKILL.md")
        self.assertIn("普通构建也只新增全量非空单元测试和实际构建", skill)

    def test_build_does_not_create_project_memory(self) -> None:
        """构建事实只进入候选清单和最终回复，不形成项目记忆流水账。"""
        skill = read_repo_text(".agents/skills/desktop-implement-change/SKILL.md")
        rules = read_repo_text("docs/ENGINEERING_RULES.md")
        boundary = "构建请求、执行和结果本身不触发 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification"
        self.assertIn(boundary, skill)
        self.assertIn("构建事实只写入当前 `release/` manifest", rules)
        self.assertIn("不得复制到项目记忆", rules)


class WorkPlanTests(unittest.TestCase):
    """覆盖 Work Plan 的可选准入、精简 Todo 和验收状态隔离。"""

    TODO_TOKEN = SHARED_TODO_TOKEN

    @classmethod
    def _plan(cls, state: str = "pending") -> str:
        """返回不声明流程等级的最小按需计划。"""
        return f"""# 当前工作计划

## Todo 批次 A

### {cls.TODO_TOKEN}（{state}）：更新文档

- 预期行为：当前规则使用直接开发闭环。
- 影响边界：只修改规范文档。
- 验证：运行本次必要的解析检查。
"""

    @staticmethod
    def _validate(contents: str) -> list[str]:
        return run_validator_on_tempfile(
            repository.validate_work_plan_contract,
            "20260824_work_plan.md",
            contents,
        )

    def test_missing_plan_is_valid_by_default(self) -> None:
        """日常开发没有活动 Work Plan 时不应被全局门禁拒绝。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            errors: list[str] = []
            repository.validate_work_plan_contract(errors, Path(tmp_dir) / "missing.md")
        self.assertEqual(errors, [])

    def test_missing_plan_is_rejected_when_caller_explicitly_requires_one(self) -> None:
        """发布协调等调用方可以显式要求计划真实存在。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            errors: list[str] = []
            repository.validate_work_plan_contract(
                errors,
                Path(tmp_dir) / "missing.md",
                required=True,
            )
        self.assertTrue(any("missing active Work Plan" in error for error in errors), errors)

    def test_valid_opt_in_plan_needs_no_path_declaration(self) -> None:
        """用户按需创建的精简计划无需再声明流程等级。"""
        self.assertEqual(self._validate(self._plan()), [])

    def test_plan_does_not_trigger_other_memories(self) -> None:
        """持久计划存在不自动联动其他项目记忆。"""
        skill = read_repo_text(".agents/skills/desktop-plan-change/SKILL.md")
        self.assertIn(
            "计划存在和 Todo 完成都不自动触发 Product Spec、ADR、Product Status、Verification 或 Changelog",
            skill,
        )

    def test_rejects_todo_without_explicit_state(self) -> None:
        """Todo 标题缺少可机读状态时必须失败。"""
        mutated = self._plan().replace(f"{self.TODO_TOKEN}（pending）", self.TODO_TOKEN, 1)
        errors = self._validate(mutated)
        self.assertTrue(any("explicit state" in error for error in errors), errors)

    def test_optional_full_acceptance_contract_is_valid(self) -> None:
        """显式完整验收可附加真实候选与失败回流契约。"""
        acceptance = """

## 完整验收

- 进入条件：Todo 全部 `done`。
- 候选必须是完整真实产物，不接受模拟、桩、占位或脚手架。
- 失败时重开 Todo 并返回 `$desktop-implement-change`。
"""
        self.assertEqual(self._validate(self._plan(state="done") + acceptance), [])

    def test_rejects_acceptance_with_unfinished_todo(self) -> None:
        """任一 Todo 未完成时不得记录 accepted 或发布就绪。"""
        errors = self._validate(self._plan() + "\n验收状态：accepted\n")
        self.assertTrue(
            any("accepted or release-ready verdict" in error for error in errors),
            errors,
        )

    def test_rejects_duplicate_todo_id_and_missing_boundary(self) -> None:
        """Todo ID 必须唯一，且每项都拥有预期、边界和验证。"""
        duplicated = self._plan() + f"""

### {self.TODO_TOKEN}（done）：重复

- 预期行为：重复。
- 验证：重复。
"""
        errors = self._validate(duplicated)
        self.assertTrue(any("duplicate Todo IDs" in error for error in errors), errors)
        self.assertTrue(any("ownership/boundary" in error for error in errors), errors)


if __name__ == "__main__":
    unittest.main()
