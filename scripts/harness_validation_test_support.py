"""校验测试共享的临时文件读写与内容读取工具，避免各测试模块重复相同样板。"""

from __future__ import annotations

import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Callable

ROOT = Path(__file__).resolve().parents[1]

TODO_TOKEN = "TO" + "DO-A01"


@lru_cache(maxsize=None)
def read_repo_text(relative_path: str) -> str:
    """读取仓库根下的文本文件；同一路径跨测试方法只触发一次磁盘 I/O。"""
    return (ROOT / relative_path).read_text(encoding="utf-8")


def run_validator_on_tempfile(
    validator: Callable[..., None],
    filename: str,
    contents: str,
    **kwargs: object,
) -> list[str]:
    """把内容写入临时文件后调用 `validator(errors, path, **kwargs)`，返回收集的错误。"""
    with tempfile.TemporaryDirectory() as tmp_dir:
        path = Path(tmp_dir) / filename
        path.write_text(contents, encoding="utf-8")
        errors: list[str] = []
        validator(errors, path, **kwargs)
        return errors
