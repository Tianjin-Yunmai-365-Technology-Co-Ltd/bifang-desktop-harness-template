"""锁定本地发布边界，防止已移除的 CI 入口重新传播。"""

from __future__ import annotations

from pathlib import Path

from .context import ROOT, fail


RETIRED_CI_PATHS = (
    ".agents/skills/desktop-prepare-cross-platform-release/assets/github-release-candidate.yml",
    ".github/workflows/release-candidate.yml",
)


def validate_local_release(errors: list[str], root: Path = ROOT) -> None:
    """拒绝旧 CI 入口（含断链），并要求发布与周期收尾以本地证据为准。"""
    for relative in RETIRED_CI_PATHS:
        path = root / relative
        if path.exists() or path.is_symlink():
            fail(errors, f"retired release CI entry must be absent: {relative}")

    required = {
        "docs/RELEASE.md": (
            "不配置、触发或等待任何 CI/CD",
            "不执行 push、远程标签、GitHub/GitLab Release、软件包发布、部署或上传制品",
            "本地正式发布成功必须同时满足",
            "所有 required/enabled 验收和人工复核通过",
            "本地发布记录绑定精确版本、40 位源码提交、制品路径、摘要、验收及复核证据",
        ),
        ".agents/skills/desktop-prepare-release/SKILL.md": (
            "不配置、触发或等待任何 CI/CD",
            "不推送、不上传、不向 Git 或其他远端分发",
            "确认本地交付成功后",
            "只请求准备或构建时停在候选状态",
        ),
        ".agents/skills/desktop-manage-version/SKILL.md": (
            "完成本地正式发布记录与交付",
            "不得把 `finalize-release` 当作构建收尾",
        ),
    }
    for relative, fragments in required.items():
        path = root / relative
        try:
            source = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as error:
            fail(errors, f"cannot read local release contract {relative}: {error}")
            continue
        for fragment in fragments:
            if fragment not in source:
                fail(errors, f"local release contract missing in {relative}: {fragment}")
