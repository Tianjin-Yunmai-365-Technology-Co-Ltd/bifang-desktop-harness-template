"""候选 workflow 验证测试的共享夹具。"""

from __future__ import annotations

import contextlib
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


class HarnessWorkflowTestCase(unittest.TestCase):
    """提供隔离 workflow、片段提取和脚本提取能力。"""

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

    @staticmethod
    def _run_script(contents: str, step_name: str) -> str:
        """提取受审 workflow 命名步骤的真实 run block，供前向 subprocess 测试。"""
        start = contents.index(f"      - name: {step_name}\n")
        end = contents.find("\n      - ", start + 1)
        if end == -1:
            end = len(contents)
        block = contents[start:end]
        marker = "        run: |\n"
        script_start = block.index(marker) + len(marker)
        return textwrap.dedent(block[script_start:])
