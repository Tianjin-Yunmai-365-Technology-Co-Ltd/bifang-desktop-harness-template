"""初始化验证使用的宿主文件模式辅助函数。"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

from .context import ROOT


def source_file_has_executable_mode(path: Path) -> bool:
    """按宿主可观测语义确认 Unix 脚本的可执行位。"""

    if os.name != "nt":
        return bool(path.stat().st_mode & 0o111)

    try:
        relative_path = path.resolve().relative_to(ROOT.resolve()).as_posix()  # noqa: F405
    except (OSError, ValueError):
        return False

    result = subprocess.run(
        ["git", "ls-files", "--stage", "--", relative_path],
        cwd=ROOT,  # noqa: F405
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode != 0:
        return False
    entries = [line for line in result.stdout.splitlines() if line.strip()]
    return len(entries) == 1 and entries[0].split(maxsplit=1)[0] == "100755"
