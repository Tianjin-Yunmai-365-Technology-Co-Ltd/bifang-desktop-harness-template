"""生成源码临时标记的非阻断审查提示。"""

from __future__ import annotations

import re
from pathlib import Path

from .context import ROOT, SKILLS_ROOT, display_path


def source_files_for_marker_review() -> list[Path]:
    """枚举本仓库人工维护的源码，用于临时标记审查。"""
    suffixes = {".py", ".ps1", ".rs", ".sh"}
    roots = (ROOT / "scripts", SKILLS_ROOT)
    return sorted(
        path
        for root in roots
        for path in root.rglob("*")
        if path.is_file() and path.suffix.lower() in suffixes
    )

def validate_soft_review_prompts(warnings: list[str]) -> None:
    """报告源码临时标记；分层建议阈值与硬上限由统一检查器负责。"""
    comment_marker = re.compile(r"^\s*(?://|#).*\b(TODO|FIXME|HACK)\b")
    for path in source_files_for_marker_review():
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        for number, line in enumerate(lines, start=1):
            if comment_marker.search(line):
                warnings.append(
                    f"temporary marker needs reason/removal review: {display_path(path)}:{number}"
                )
