"""复用下游 Rust 中文声明注释检查器，并把报告接入 Harness 门禁。"""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys

from .context import RUST_ASSET, RUST_COMMENT_CHECKER, display_path, fail


def _report_schema_errors(report: dict[str, object]) -> list[str]:
    """校验检查器报告的字段类型和成功态不变量。"""

    errors: list[str] = []
    if not isinstance(report.get("ok"), bool):
        errors.append("ok must be a boolean")
    if not isinstance(report.get("root"), str):
        errors.append("root must be a string")
    for field in ("checkedPackages", "checkedRustFiles", "checkedDeclarations"):
        value = report.get(field)
        if type(value) is not int or value < 0:
            errors.append(f"{field} must be a non-negative integer")
    report_errors = report.get("errors")
    if not isinstance(report_errors, list) or not all(
        isinstance(item, str) for item in report_errors
    ):
        errors.append("errors must be a string array")
    violations = report.get("violations")
    if not isinstance(violations, list):
        errors.append("violations must be an object array")
    else:
        required_types = {
            "path": str,
            "line": int,
            "column": int,
            "kind": str,
            "name": str,
            "reason": str,
        }
        for index, violation in enumerate(violations):
            if not isinstance(violation, dict):
                errors.append(f"violations[{index}] must be an object")
                continue
            for field, expected_type in required_types.items():
                value = violation.get(field)
                if type(value) is not expected_type:
                    errors.append(
                        f"violations[{index}].{field} must be {expected_type.__name__}"
                    )
    if not errors and report["ok"]:
        if report["errors"] or report["violations"]:
            errors.append("ok=true cannot contain errors or violations")
        if not all(
            report[field] > 0
            for field in ("checkedPackages", "checkedRustFiles", "checkedDeclarations")
        ):
            errors.append("ok=true requires non-empty package, file, and declaration counts")
    return errors


def validate_rust_chinese_comments(
    errors: list[str],
    *,
    root: Path = RUST_ASSET,
    checker: Path = RUST_COMMENT_CHECKER,
) -> None:
    """对完整 Cargo workspace 运行唯一检查器，并严格校验 JSON/退出码契约。"""

    if not checker.is_file():
        fail(errors, f"missing Rust Chinese-comment checker: {display_path(checker)}")
        return
    try:
        result = subprocess.run(
            [sys.executable, str(checker), "--root", str(root), "--json"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
            timeout=60,
        )
    except subprocess.TimeoutExpired:
        fail(errors, "Rust Chinese-comment checker timed out after 60 seconds")
        return
    except OSError as error:
        fail(errors, f"cannot execute Rust Chinese-comment checker: {error}")
        return

    try:
        report = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        fail(errors, f"invalid Rust Chinese-comment checker JSON: {error}")
        return
    if not isinstance(report, dict):
        fail(errors, "Rust Chinese-comment checker JSON must be an object")
        return

    schema_errors = _report_schema_errors(report)
    if schema_errors:
        for detail in schema_errors:
            fail(errors, f"invalid Rust Chinese-comment checker schema: {detail}")
        return

    for detail in report.get("errors", []):
        fail(errors, f"Rust Chinese-comment checker error: {detail}")
    for violation in report.get("violations", []):
        fail(
            errors,
            "Rust declaration lacks an adjacent Chinese doc comment: "
            f"{violation.get('path')}:{violation.get('line')}:{violation.get('column')} "
            f"{violation.get('kind')} {violation.get('name')}",
        )

    if result.returncode not in {0, 1, 2}:
        fail(errors, f"Rust Chinese-comment checker returned invalid exit code: {result.returncode}")
    elif result.returncode == 0 and not report.get("ok"):
        fail(errors, "Rust Chinese-comment checker returned success with ok=false")
    elif result.returncode != 0 and report.get("ok"):
        fail(errors, "Rust Chinese-comment checker returned failure with ok=true")
    elif result.returncode == 1 and not report.get("violations"):
        fail(errors, "Rust Chinese-comment checker returned violation status without violations")
    elif result.returncode == 2 and not report.get("errors"):
        fail(errors, "Rust Chinese-comment checker returned operational failure without errors")
