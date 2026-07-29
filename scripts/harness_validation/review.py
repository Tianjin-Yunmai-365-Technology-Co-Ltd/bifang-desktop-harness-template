"""生成源码与文档软阈值、临时标记的非阻断审查提示。"""

from __future__ import annotations

import re
from pathlib import Path

from .context import ROOT, SKILLS_ROOT, display_path

def source_files_for_soft_review() -> list[Path]:
    """枚举本仓库人工维护的源码，用于非阻断行数和临时标记审查。"""
    suffixes = {".py", ".ps1", ".rs", ".sh"}
    roots = (ROOT / "scripts", SKILLS_ROOT)
    return sorted(
        path
        for root in roots
        for path in root.rglob("*")
        if path.is_file() and path.suffix.lower() in suffixes
    )

def validate_soft_review_prompts(warnings: list[str]) -> None:
    """报告已批准的软阈值与源码临时标记，但不把人工判断伪装成失败门禁。"""
    entry_limits = {ROOT / "AGENTS.md": (200, 300), ROOT / "README.md": (200, 300)}
    for path, (review_limit, split_limit) in entry_limits.items():
        if not path.is_file():
            continue
        line_count = len(path.read_text(encoding="utf-8").splitlines())
        if line_count > split_limit:
            warnings.append(
                f"entry document should normally be split: {display_path(path)} ({line_count} lines)"
            )
        elif line_count > review_limit:
            warnings.append(
                f"entry document needs split review: {display_path(path)} ({line_count} lines)"
            )

    for path in sorted((ROOT / "docs").rglob("*.md")):
        if path == ROOT / "docs" / "HARNESS_ENGINEERING.md":
            continue
        line_count = len(path.read_text(encoding="utf-8").splitlines())
        if line_count > 800:
            warnings.append(
                f"reference document should normally be split: {display_path(path)} ({line_count} lines)"
            )
        elif line_count > 500:
            warnings.append(
                f"reference document needs split review: {display_path(path)} ({line_count} lines)"
            )

    comment_marker = re.compile(r"^\s*(?://|#).*\b(TODO|FIXME|HACK)\b")
    for path in source_files_for_soft_review():
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        if len(lines) > 800:
            warnings.append(
                f"source file should normally be split: {display_path(path)} ({len(lines)} lines)"
            )
        elif len(lines) > 400:
            warnings.append(
                f"source file needs split review: {display_path(path)} ({len(lines)} lines)"
            )
        for number, line in enumerate(lines, start=1):
            if comment_marker.search(line):
                warnings.append(
                    f"temporary marker needs reason/removal review: {display_path(path)}:{number}"
                )
