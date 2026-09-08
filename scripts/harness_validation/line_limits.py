"""复用下游文件行数检查器，把报告转换为 Harness validator 错误。"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from .context import LINE_LIMIT_CHECKER, ROOT, display_path, fail


def validate_repository_line_limits(
    errors: list[str],
    *,
    warnings: list[str] | None = None,
    root: Path = ROOT,
    checker: Path = LINE_LIMIT_CHECKER,
) -> None:
    """运行唯一检查器；软候选按需返回，硬超限和运行错误始终阻断。"""

    if not checker.is_file():
        fail(errors, f"missing file line-limit checker: {display_path(checker)}")
        return
    try:
        result = subprocess.run(
            [sys.executable, str(checker), "--root", str(root), "--json"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
    except OSError as error:
        fail(errors, f"cannot execute file line-limit checker: {error}")
        return
    try:
        report = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        fail(errors, f"invalid file line-limit checker JSON: {error}")
        return
    if not isinstance(report, dict):
        fail(errors, "file line-limit checker JSON must be an object")
        return
    for detail in report.get("errors", []):
        fail(errors, f"file line-limit checker error: {detail}")
    for candidate in report.get("reviewCandidates", []):
        if not isinstance(candidate, dict):
            fail(errors, f"invalid file line-limit review candidate: {candidate!r}")
            continue
        if warnings is not None:
            warnings.append(
                f"{candidate.get('profile', 'maintained_text')} file exceeds its "
                f"{candidate.get('threshold')}-line refactor-review threshold: "
                f"{candidate.get('path')} ({candidate.get('lines')} lines, "
                f"hard limit {candidate.get('limit')})"
            )
    for violation in report.get("violations", []):
        if not isinstance(violation, dict):
            fail(errors, f"invalid file line-limit violation: {violation!r}")
            continue
        fail(
            errors,
            f"{violation.get('profile', 'maintained_text')} file exceeds its hard "
            f"{violation.get('limit')}-line limit: {violation.get('path')} "
            f"({violation.get('lines')} lines)",
        )
    if result.returncode not in {0, 1, 2}:
        fail(errors, f"file line-limit checker returned invalid exit code: {result.returncode}")
    elif result.returncode == 0 and not report.get("ok"):
        fail(errors, "file line-limit checker returned success with ok=false")
    elif result.returncode != 0 and report.get("ok"):
        fail(errors, "file line-limit checker returned failure with ok=true")
    elif result.returncode != 0 and not report.get("errors") and not report.get("violations"):
        fail(errors, "file line-limit checker failed without diagnostics")
