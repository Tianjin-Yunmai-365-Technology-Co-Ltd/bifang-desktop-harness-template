"""Unit tests for :mod:`scripts.validate_harness` workflow validation helpers."""

from __future__ import annotations

import contextlib
import tempfile
import unittest
from pathlib import Path

import scripts.validate_harness as validate_harness


@contextlib.contextmanager
def _with_workflow(contents: str):
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
    """Cover the positive/negative cases that keep release gates deterministic."""

    @staticmethod
    def _base_workflow() -> str:
        return validate_harness.WORKFLOW.read_text(encoding="utf-8")

    @staticmethod
    def _validate(contents: str) -> list[str]:
        errors: list[str] = []
        with _with_workflow(contents):
            validate_harness.validate_workflow(errors)
        return errors

    def test_positive_workflow_is_valid(self) -> None:
        """当前标准 workflow 应当通过 validator。"""
        errors = self._validate(self._base_workflow())
        self.assertEqual(errors, [], "\n".join(errors))

    def test_rejects_injected_e2e_command_input(self) -> None:
        """禁止把 e2e_command 作为可注入参数带入轻量检验。"""
        mutated = self._base_workflow().replace(
            '      run_e2e:\n        description: "Run user-approved heavy acceptance checks (for example e2e) during this candidate build"\n        required: false\n        type: boolean\n        default: false\n',
            '      run_e2e:\n'
            '        description: "Run user-approved heavy acceptance checks (for example e2e) during this candidate build"\n'
            '        required: false\n'
            '        type: boolean\n'
            '        default: false\n'
            '      e2e_command:\n'
            '        description: "Injected command run when enabled"\n'
            '        required: false\n'
            '        type: string\n',
        )
        mutated += "\n      - name: Optional heavy checks\n        if: ${{ inputs.run_e2e == true }}\n        shell: bash\n        env:\n          E2E_COMMAND: ${{ inputs.e2e_command }}\n        run: |\n          bash -lc \"${E2E_COMMAND}\"\n"
        errors = self._validate(mutated)
        self.assertTrue(any("workflow contains unauthorized publishing behavior: e2e_command" in e for e in errors))

    def test_rejects_missing_heavy_check_decision(self) -> None:
        """缺少 heavy-check decision 步骤会导致验证失败。"""
        marker = "      - name: Validate heavy-check decision"
        start = self._base_workflow().index(marker)
        package_marker = "      - name: Package Unix candidate"
        end = self._base_workflow().index(package_marker)
        mutated = self._base_workflow().replace(
            self._base_workflow()[start:end],
            "",
        )
        errors = self._validate(mutated)
        self.assertTrue(
            any("heavy-check decision gate must be placed between heavy checks and package" in e for e in errors)
            or any("workflow missing heavy-check decision gate step" in e for e in errors),
        )

    def test_rejects_decision_after_packaging(self) -> None:
        """decision 步骤移到打包之后时应被拒绝。"""
        base = self._base_workflow()
        moved_block = (
            "      - name: Validate heavy-check decision\n"
            "        id: heavy-checks-decision\n"
            "        shell: bash\n"
            "        run: |\n"
            "          echo \"status=passed\" >> \"${GITHUB_OUTPUT}\"\n"
            "\n"
        )
        if moved_block not in base:
            self.skipTest("expected decision block not found")
        without_decision = base.replace(moved_block, "", 1)
        insert_at = without_decision.index("      - name: Record candidate manifest")
        mutated = without_decision[:insert_at] + moved_block + without_decision[insert_at:]
        errors = self._validate(mutated)
        self.assertTrue(any("heavy-check decision gate must be placed between heavy checks and package" in e for e in errors))

    def test_rejects_package_or_upload_without_success_guard(self) -> None:
        """没有 success() 时，打包或上传步骤不能通过审核。"""
        mutated = self._base_workflow().replace("        if: runner.os != 'Windows' && success()\n", "")
        mutated = mutated.replace("        if: runner.os == 'Windows' && success()\n", "")
        mutated = mutated.replace("        if: success()\n", "", 1)
        errors = self._validate(mutated)
        self.assertTrue(
            any("workflow package steps should be guarded by success()" in e for e in errors)
            or any("workflow upload step should be guarded by success()" in e for e in errors),
        )


if __name__ == "__main__":
    unittest.main()
