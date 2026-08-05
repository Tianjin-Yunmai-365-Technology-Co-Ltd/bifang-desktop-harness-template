"""风险分级敏捷流程、初始化预设与精简计划的回归测试。"""

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


class AgileAgentPolicyTests(unittest.TestCase):
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
        """自定义路径可物化不同合法组合，不被推荐配方覆盖。"""
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
        instantiate = read_repo_text(".agents/skills/instantiate-project/SKILL.md")
        initialize = read_repo_text(".agents/skills/initialize-rust-project/SKILL.md")
        environment = read_repo_text(".agents/skills/check-development-environment/SKILL.md")
        self.assertIn("历史验证正文", instantiate)
        self.assertIn("docs/verification/", instantiate)
        self.assertIn("不创建或更新 `docs/VERIFICATION.md`", initialize)
        self.assertIn("绝不得创建或更新验证索引/证据卷", environment)

    def test_public_scaffold_replacement_and_product_rename_are_milestones(self) -> None:
        """首次公开接口和现有产品改名不能从标准路径绕过验收。"""
        initialize = read_repo_text(".agents/skills/initialize-rust-project/SKILL.md")
        rename = read_repo_text(".agents/skills/rename-project-identity/SKILL.md")
        self.assertIn("任何适配器首次替换中性状态", initialize)
        self.assertIn("都必须进入里程碑路径", initialize)
        self.assertIn("现有产品改名", rename)
        self.assertIn("不得以快速或标准路径完成", rename)
        self.assertIn("交给 `$verify-delivery` 验收", rename)


class AgileWorkPlanTests(unittest.TestCase):
    """覆盖快速无计划、标准精简计划与里程碑声明隔离。"""

    TODO_TOKEN = SHARED_TODO_TOKEN

    @classmethod
    def _standard_plan(cls) -> str:
        """返回不含发布级里程碑的最小标准路径计划。"""
        return f"""# 当前工作计划

- 当前任务路径：`标准`

## Todo 批次 A

### {cls.TODO_TOKEN}（pending）：更新文档

- 预期行为：当前规则使用分级路径。
- 影响边界：只修改规范文档。
- 验证：运行链接、解析、静态和差异检查。
"""

    @staticmethod
    def _validate(contents: str) -> list[str]:
        return run_validator_on_tempfile(
            repository.validate_work_plan_contract,
            "20260803_work_plan.md",
            contents,
        )

    def test_missing_plan_is_valid_for_quick_path(self) -> None:
        """快速路径没有活动 Work Plan 时不应被全局门禁拒绝。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            errors: list[str] = []
            repository.validate_work_plan_contract(errors, Path(tmp_dir) / "missing.md")
        self.assertEqual(errors, [])

    def test_missing_plan_is_rejected_when_caller_requires_one(self) -> None:
        """里程碑准入方可以显式要求计划存在，不能把可选默认当成降级。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            errors: list[str] = []
            repository.validate_work_plan_contract(
                errors,
                Path(tmp_dir) / "missing.md",
                required=True,
            )
        self.assertTrue(any("missing active Work Plan" in error for error in errors), errors)

    def test_valid_standard_plan_needs_no_milestone(self) -> None:
        """标准路径可只保留精简 Todo 和非代码替代验证。"""
        self.assertEqual(self._validate(self._standard_plan()), [])

    def test_standard_fix_may_use_work_plan_when_complexity_requires_it(self) -> None:
        """维护标签不禁止复杂修复采用标准路径计划。"""

        plan = self._standard_plan().replace("更新文档", "跨模块缺陷修复", 1)
        self.assertEqual(self._validate(plan), [])

    def test_quick_fix_does_not_require_persisted_plan(self) -> None:
        """普通快速修复可以没有 Work Plan。"""

        with tempfile.TemporaryDirectory() as tmp_dir:
            errors: list[str] = []
            repository.validate_work_plan_contract(
                errors,
                Path(tmp_dir) / "quick-fix-missing.md",
            )
        self.assertEqual(errors, [])

    def test_work_plan_does_not_trigger_other_memories(self) -> None:
        """持久计划存在不自动联动其他项目记忆。"""

        skill = read_repo_text(".agents/skills/plan-change/SKILL.md")
        self.assertIn(
            "不自动触发 Product Spec、ADR、Product Status、Verification 或 Changelog",
            skill,
        )

    def test_existing_plan_must_declare_its_path(self) -> None:
        """持久计划必须说明标准或里程碑，避免校验器猜测验收强度。"""
        mutated = self._standard_plan().replace("- 当前任务路径：`标准`\n\n", "", 1)
        errors = self._validate(mutated)
        self.assertTrue(any("must declare" in error for error in errors), errors)

    def test_rejects_persisted_quick_plan(self) -> None:
        """快速路径应直接实施，不能制造形式化活动计划。"""
        mutated = self._standard_plan().replace("`标准`", "`快速`", 1)
        errors = self._validate(mutated)
        self.assertTrue(any("quick path" in error for error in errors), errors)

    def test_standard_plan_cannot_claim_milestone_acceptance(self) -> None:
        """标准路径没有完整候选时不得声称里程碑已通过。"""
        errors = self._validate(self._standard_plan() + "\n里程碑状态：accepted\n")
        self.assertTrue(any("only a milestone path" in error for error in errors), errors)

    def test_standard_plan_cannot_contain_verification_milestone(self) -> None:
        """需要完整验收时必须先升档，不能在标准计划中暗加里程碑。"""
        mutated = self._standard_plan() + """

## 验证里程碑 M1

- 候选：完整真实产物，不接受模拟或脚手架。
- 准入：Todo 全部 `done`，失败返回 `$implement-change`。
"""
        errors = self._validate(mutated)
        self.assertTrue(any("may contain" in error for error in errors), errors)

    def test_standard_plan_cannot_claim_release_readiness(self) -> None:
        """标准路径的完成检查不得越权声称候选已经可发布。"""
        errors = self._validate(self._standard_plan() + "\n发布就绪：ready\n")
        self.assertTrue(any("only a milestone path" in error for error in errors), errors)


if __name__ == "__main__":
    unittest.main()
