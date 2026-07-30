"""候选发布工作流手动验收与打包阻断门禁的确定性单元测试。"""

from __future__ import annotations

import contextlib
import subprocess
import sys
import tempfile
import unittest
from collections.abc import Iterator
from pathlib import Path

import scripts.validate_harness as validate_harness
from scripts.harness_validation import governance


class ValidateHarnessEntrypointTests(unittest.TestCase):
    """覆盖拆分后单一命令入口的真实导入路径与稳定成功输出。"""

    def test_direct_script_entrypoint_succeeds(self) -> None:
        """从仓库根直接执行历史命令时应完成全部领域校验并返回成功。"""
        result = subprocess.run(
            [sys.executable, "scripts/validate_harness.py"],
            cwd=Path(__file__).resolve().parents[1],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Harness validation passed:", result.stdout)

    def test_rejects_obsolete_all_task_parallel_prompt(self) -> None:
        """旧的全修改/交付任务询问规则重新出现时应被当前描述门禁拒绝。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "policy.md"
            path.write_text(
                "每个会修改仓库或执行交付工作的任务都必须询问并行模式。",
                encoding="utf-8",
            )
            errors: list[str] = []
            governance.validate_stale_fragments(errors, (path,))
        self.assertTrue(any("stale current description" in error for error in errors), errors)

    def test_rejects_obsolete_design_stage_parallel_prompt(self) -> None:
        """设计与计划阶段重新进入并行询问范围时应被当前描述门禁拒绝。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "policy.md"
            path.write_text(
                "仅在产品定义或范围设计、实施计划设计，以及代码或实现变更阶段询问。",
                encoding="utf-8",
            )
            errors: list[str] = []
            governance.validate_stale_fragments(errors, (path,))
        self.assertTrue(any("stale current description" in error for error in errors), errors)

    def test_rejects_invalid_harness_datetime_version(self) -> None:
        """12 位但不是有效年月日时分的 Harness 版本必须被拒绝。"""
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "Version.md"
            path.write_text(
                "# 版本\n\n- 当前版本：`202613401299`\n",
                encoding="utf-8",
            )
            original = governance.VERSION_FILE
            governance.VERSION_FILE = path
            try:
                errors: list[str] = []
                governance.validate_version_contract(errors)
            finally:
                governance.VERSION_FILE = original
        self.assertTrue(any("not a valid Shanghai datetime" in error for error in errors), errors)


@contextlib.contextmanager
def _with_workflow(contents: str) -> Iterator[Path]:
    """把 validator 临时指向隔离 workflow，并在场景结束后恢复真实入口。"""
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
    """覆盖候选 workflow 的正常契约和最高风险门禁回归。"""

    @staticmethod
    def _base_workflow() -> str:
        """读取仓库当前标准 workflow，确保正负场景共享真实基线。"""
        return validate_harness.WORKFLOW.read_text(encoding="utf-8")

    @staticmethod
    def _validate(contents: str) -> list[str]:
        """在隔离文件上运行 workflow validator 并返回全部稳定错误。"""
        errors: list[str] = []
        with _with_workflow(contents):
            validate_harness.validate_workflow(errors)
        return errors

    @staticmethod
    def _slice(contents: str, start_marker: str, end_marker: str) -> tuple[int, int, str]:
        """按稳定步骤标记提取连续区块，供删除或顺序回归场景使用。"""
        start = contents.index(start_marker)
        end = contents.index(end_marker, start)
        return start, end, contents[start:end]

    def test_positive_workflow_is_valid(self) -> None:
        """当前标准 workflow 应当通过全部发布门禁。"""
        errors = self._validate(self._base_workflow())
        self.assertEqual(errors, [], "\n".join(errors))

    def test_rejects_injected_e2e_command_input(self) -> None:
        """禁止 workflow_dispatch 恢复可注入的任意 E2E 命令输入。"""
        marker = "      version:\n"
        injected = (
            "      e2e_command:\n"
            '        description: "Injected command"\n'
            "        required: false\n"
            "        type: string\n"
        )
        mutated = self._base_workflow().replace(marker, injected + marker, 1)
        errors = self._validate(mutated)
        self.assertTrue(
            any("unsafe release-gate behavior: e2e_command" in error for error in errors),
            errors,
        )

    def test_rejects_missing_heavy_check_decision(self) -> None:
        """缺少独立决策步骤时，已选择但未执行的验收不能越过打包门禁。"""
        base = self._base_workflow()
        start, end, _ = self._slice(
            base,
            "      - name: Validate heavy-check decision",
            "      - name: Package Unix candidate",
        )
        errors = self._validate(base[:start] + base[end:])
        self.assertTrue(
            any("heavy-check decision" in error for error in errors),
            errors,
        )

    def test_rejects_decision_after_packaging(self) -> None:
        """决策步骤被移到打包之后时必须返回顺序错误而不是跳过测试。"""
        base = self._base_workflow()
        start, end, decision_block = self._slice(
            base,
            "      - name: Validate heavy-check decision",
            "      - name: Package Unix candidate",
        )
        without_decision = base[:start] + base[end:]
        insert_at = without_decision.index("      - name: Record candidate manifest")
        mutated = without_decision[:insert_at] + decision_block + without_decision[insert_at:]
        errors = self._validate(mutated)
        self.assertTrue(
            any("must be placed between heavy checks and package" in error for error in errors),
            errors,
        )

    def test_rejects_each_package_step_without_success_guard(self) -> None:
        """Unix 或 Windows 任一打包步骤丢失 success() 都必须独立失败。"""
        cases = {
            "Unix": "        if: runner.os != 'Windows' && success()\n",
            "Windows": "        if: runner.os == 'Windows' && success()\n",
        }
        for platform, guard in cases.items():
            with self.subTest(platform=platform):
                mutated = self._base_workflow().replace(guard, "", 1)
                errors = self._validate(mutated)
                self.assertTrue(
                    any(
                        f"workflow {platform} package step should be guarded by success()"
                        in error
                        for error in errors
                    ),
                    errors,
                )

    def test_rejects_upload_without_success_guard(self) -> None:
        """上传步骤不得在前序测试或手动验收失败后继续运行。"""
        mutated = self._base_workflow().replace(
            "      - uses: actions/upload-artifact@v4\n        if: success()\n",
            "      - uses: actions/upload-artifact@v4\n",
            1,
        )
        errors = self._validate(mutated)
        self.assertTrue(
            any("workflow upload step should be guarded by success()" in error for error in errors),
            errors,
        )

    def test_rejects_missing_package_steps_without_crashing(self) -> None:
        """两个打包步骤同时缺失时应累计门禁错误，不得由 min() 抛出异常。"""
        base = self._base_workflow()
        start, end, _ = self._slice(
            base,
            "      - name: Package Unix candidate",
            "      - name: Record candidate manifest",
        )
        errors = self._validate(base[:start] + base[end:])
        self.assertTrue(any("package" in error for error in errors), errors)

    def test_rejects_selected_as_terminal_manifest_status(self) -> None:
        """`selected` 不能作为可上传候选的最终手动验收状态。"""
        mutated = self._base_workflow() + '\n# forbidden regression: "selected"\n'
        errors = self._validate(mutated)
        self.assertTrue(
            any('unsafe release-gate behavior: "selected"' in error for error in errors),
            errors,
        )

    def test_rejects_disabled_matrix_fail_fast(self) -> None:
        """矩阵任一平台失败后不得显式要求其他平台继续候选流程。"""
        mutated = self._base_workflow().replace(
            "      fail-fast: true\n",
            "      fail-fast: false\n",
            1,
        )
        errors = self._validate(mutated)
        self.assertTrue(
            any("unsafe release-gate behavior: fail-fast: false" in error for error in errors),
            errors,
        )

    def test_rejects_removed_heavy_check_failure_branch(self) -> None:
        """固定验收脚本返回非零时必须保留显式失败分支并阻断打包。"""
        mutated = self._base_workflow().replace(
            '          if result.returncode:\n              print("heavy-check stdout:")\n',
            '          if False:\n              print("heavy-check stdout:")\n',
            1,
        )
        errors = self._validate(mutated)
        self.assertTrue(
            any(
                "heavy-check failure gate missing: if result.returncode:" in error
                for error in errors
            ),
            errors,
        )


if __name__ == "__main__":
    unittest.main()
