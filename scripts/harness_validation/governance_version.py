"""校验 Harness 时间版本事实源及其跨文档一致性。"""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

from .context import *  # noqa: F403


def validate_version_contract(errors: list[str], version_file: Path) -> None:
    """确认 Harness 时间版本合法、只有一个事实源且不污染下游版本。"""
    if not version_file.is_file():
        fail(errors, f"missing version contract file: {display_path(version_file)}")  # noqa: F405
        return

    version_text = version_file.read_text(encoding="utf-8")
    match = re.search(r"当前版本：`(\d{12})`", version_text)
    if not match:
        fail(errors, "Version.md current Harness version must be 12 digits in YYYYMMDDHHMM")  # noqa: F405
        current_version = "__invalid__"
    else:
        current_version = match.group(1)
        try:
            # 时间版本已经是用户确认的上海本地墙上时间；这里只校验数字是否构成
            # 真实公历日期和分钟，不做时区换算。Windows 的标准 Python 通常没有
            # 系统 IANA tzdata，因此不能为了纯格式校验加载 ZoneInfo。
            parsed = datetime.strptime(current_version, "%Y%m%d%H%M")
        except ValueError:
            fail(  # noqa: F405
                errors,
                "Version.md current Harness version is not a valid Shanghai datetime: "
                f"{current_version}",
            )
        else:
            if parsed.strftime("%Y%m%d%H%M") != current_version:
                fail(errors, f"Version.md current Harness version is not canonical: {current_version}")  # noqa: F405

    required_fragments = {
        version_file: (
            f"当前版本：`{current_version}`",
            "时间版本起始值：`202607301002`",
            "旧版本标识：`1.0.0`",
            "版本时区：`Asia/Shanghai`",
            "版本格式：`YYYYMMDDHHMM`",
            "发布状态：Released",
            "唯一事实来源",
            "docs/RELEASE.md",
        ),
        ROOT / "README.md": (  # noqa: F405
            "# 毕方桌面应用Harness模版",
            "Bifang Desktop Harness Template",
            "中文名称：毕方桌面应用Harness模版",
            "English name: Bifang Desktop Harness Template",
            f"当前版本：v{current_version}",
            "发布状态：Released",
            "上海时区 `YYYYMMDDHHMM`",
            "[`Version.md`](Version.md)",
        ),
        PRODUCT_SPEC: (  # noqa: F405
            f"当前版本：`{current_version}`",
            "上海时区格式为 `YYYYMMDDHHMM`",
            "唯一事实来源为根 `Version.md`",
        ),
        ROOT / "docs" / "RELEASE.md": (  # noqa: F405
            f"[`Version.md`](../Version.md) 中记录的 `{current_version}`",
            "`Asia/Shanghai`",
            "`YYYYMMDDHHMM`",
            "模板版本事实来源：根目录 `Version.md`",
            "本文件只维护版本与发布规则",
        ),
        PREPARE_RELEASE_SKILL: (  # noqa: F405
            "Harness 模板使用根 `Version.md`",
            "`YYYYMMDDHHMM`",
            "`Asia/Shanghai`",
            "不得继承 Harness `Version.md`",
        ),
        INSTANTIATE_SKILL: (  # noqa: F405
            "仅属于 Harness 的根目录 `Version.md`",
            "根 `Cargo.toml`",
        ),
    }
    for path, fragments in required_fragments.items():
        if not path.is_file():
            fail(errors, f"missing version contract file: {display_path(path)}")  # noqa: F405
            continue
        text = path.read_text(encoding="utf-8")
        for fragment in fragments:
            if fragment not in text:
                fail(  # noqa: F405
                    errors,
                    f"version contract missing in {display_path(path)}: {fragment}",
                )

    release_text = (ROOT / "docs" / "RELEASE.md").read_text(encoding="utf-8")  # noqa: F405
    if "模板版本事实来源：本文件" in release_text:
        fail(errors, "docs/RELEASE.md still claims to be the Harness version fact source")  # noqa: F405
