"""Harness 持久策略、Todo/里程碑与候选构建边界的确定性单元测试。"""

from __future__ import annotations

import contextlib
import json
import subprocess
import sys
import tempfile
import unittest
from collections.abc import Iterator
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import scripts.validate_harness as validate_harness
from scripts.harness_validation import governance, repository, upgrade


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
            "React and TypeScript",
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
        return (ROOT / "docs/AGENT_POLICY.md").read_text(encoding="utf-8")

    @staticmethod
    def _validate(contents: str, *, allow_pending: bool = True) -> list[str]:
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "AGENT_POLICY.md"
            path.write_text(contents, encoding="utf-8")
            errors: list[str] = []
            governance.validate_agent_policy(
                errors,
                path,
                allow_pending=allow_pending,
            )
            return errors

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

    TODO_TOKEN = "TO" + "DO-A01"

    @staticmethod
    def _valid_plan() -> str:
        todo_token = ValidateWorkPlanTests.TODO_TOKEN
        return f"""# 当前工作计划

## Todo 批次 A

### {todo_token}（pending）：实现行为

- 预期行为：实现批准行为。
- 影响边界：只修改受控范围。
- 完成验证：运行非空单元测试。
- 状态值包括 `pending`、`in_progress`、`blocked`、`done`。

## 验证里程碑 M1

- 进入条件：Todo 全部 `done`。
- 候选必须是完整真实产物，Mock 与 scaffold 不可验收。
- 失败时重开 Todo 并返回 `$implement-change`。
"""

    @staticmethod
    def _validate(contents: str) -> list[str]:
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "20260731_work_plan.md"
            path.write_text(contents, encoding="utf-8")
            errors: list[str] = []
            repository.validate_work_plan_contract(errors, path)
            return errors

    def test_valid_todo_and_milestone_plan(self) -> None:
        """带稳定状态和回流语义的活动计划应通过。"""
        self.assertEqual(self._validate(self._valid_plan()), [])

    def test_rejects_missing_milestone(self) -> None:
        """仅有 TodoList 而没有验证里程碑不是完整计划。"""
        mutated = self._valid_plan().replace("## 验证里程碑 M1", "## 验证阶段 M1", 1)
        errors = self._validate(mutated)
        self.assertTrue(any("## 验证里程碑" in error for error in errors), errors)

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


@contextlib.contextmanager
def _with_workflow(contents: str) -> Iterator[Path]:
    """把 validator 临时指向隔离 workflow，并在场景结束后恢复。"""
    with tempfile.TemporaryDirectory() as tmp_dir:
        path = Path(tmp_dir) / "workflow.yml"
        path.write_text(contents, encoding="utf-8")
        original = validate_harness.WORKFLOW
        validate_harness.WORKFLOW = path
        try:
            yield path
        finally:
            validate_harness.WORKFLOW = original


class ValidateHarnessWorkflowTests(unittest.TestCase):
    """覆盖候选构建正常契约及冒烟/E2E 越界回归。"""

    @staticmethod
    def _base_workflow() -> str:
        return validate_harness.WORKFLOW.read_text(encoding="utf-8")

    @staticmethod
    def _validate(contents: str) -> list[str]:
        errors: list[str] = []
        with _with_workflow(contents):
            validate_harness.validate_workflow(errors)
        return errors

    @staticmethod
    def _slice(contents: str, start_marker: str, end_marker: str) -> tuple[int, int, str]:
        start = contents.index(start_marker)
        end = contents.index(end_marker, start)
        return start, end, contents[start:end]

    def test_positive_workflow_is_valid(self) -> None:
        """当前标准 workflow 只构建 pending 候选并应通过。"""
        errors = self._validate(self._base_workflow())
        self.assertEqual(errors, [], "\n".join(errors))

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
            "      - name: Package Unix candidate",
            "      - name: Record candidate manifest",
        )
        errors = self._validate(base[:start] + base[end:])
        self.assertTrue(any("package" in error for error in errors), errors)

    def test_rejects_packaging_before_verification(self) -> None:
        """候选打包不得越过非空测试与构建验证。"""
        base = self._base_workflow()
        start, end, package_block = self._slice(
            base,
            "      - name: Package Unix candidate",
            "      - name: Record candidate manifest",
        )
        without_package = base[:start] + base[end:]
        insert_at = without_package.index("      - name: Verify candidate")
        errors = self._validate(
            without_package[:insert_at] + package_block + without_package[insert_at:]
        )
        self.assertTrue(any("must verify, package" in error for error in errors), errors)

    def test_rejects_disabled_matrix_fail_fast(self) -> None:
        """任一平台失败后不得显式要求其他平台继续候选流程。"""
        mutated = self._base_workflow().replace(
            "      fail-fast: true\n",
            "      fail-fast: false\n",
            1,
        )
        errors = self._validate(mutated)
        self.assertTrue(
            any("forbidden candidate behavior: fail-fast: false" in e for e in errors),
            errors,
        )

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

    def test_rejects_invalid_yaml_and_arbitrary_dispatch_input(self) -> None:
        """完整模板摘要必须拒绝非法 YAML 与未审输入。"""

        invalid_yaml = self._base_workflow() + "\n:\n"
        self.assertTrue(self._validate(invalid_yaml))
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


class ValidateUpgradeContractTests(unittest.TestCase):
    """覆盖生产 ownership 下限、规则顺序与 Python 语法。"""

    def test_production_upgrade_contract_is_valid(self) -> None:
        """当前生产清单和拆分后的 updater 模块应通过。"""

        errors: list[str] = []
        upgrade.validate_upgrade_contract(errors)
        self.assertEqual([], errors)

    def test_rejects_missing_tombstone_and_reordered_managed_self(self) -> None:
        """删除 tombstone 或把 self 规则放到兜底后都必须失败。"""

        source = json.loads(
            upgrade.UPGRADE_OWNERSHIP.read_text(encoding="utf-8")
        )
        source["rules"] = [
            item for item in source["rules"] if item["pattern"] != "Version.md"
        ]
        self_rule = next(
            item
            for item in source["rules"]
            if item["pattern"] == ".agents/skills/upgrade-harness/**"
        )
        source["rules"].remove(self_rule)
        source["rules"].append(self_rule)
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "ownership.json"
            path.write_text(json.dumps(source), encoding="utf-8")
            errors: list[str] = []
            upgrade.validate_upgrade_contract(errors, manifest_path=path)
        self.assertTrue(any("Version.md" in error for error in errors), errors)
        self.assertTrue(any("must precede" in error for error in errors), errors)

    def test_rejects_malformed_upgrade_python(self) -> None:
        """存在性不能替代生产 updater 模块的语法检查。"""

        with tempfile.TemporaryDirectory() as tmp_dir:
            broken = Path(tmp_dir) / "broken.py"
            broken.write_text("def broken(:\n", encoding="utf-8")
            errors: list[str] = []
            upgrade.validate_upgrade_contract(
                errors,
                python_paths=(broken,),
            )
        self.assertTrue(any("invalid upgrade Python module" in error for error in errors), errors)


if __name__ == "__main__":
    unittest.main()
