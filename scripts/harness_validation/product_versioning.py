"""校验下游自动版本门禁在工程入口中的固定接线。"""

from __future__ import annotations

import json

from .context import *  # noqa: F403


def validate_product_versioning_contract(errors: list[str]) -> None:
    """确认分类、状态、开发提交、构建只读与发布重置形成闭环。"""
    requirements = {
        ROOT / "AGENTS.md": (
            "$desktop-manage-version",
            ".harness/version-state.json",
            "查询、诊断、复现",
            "正式发布成功",
        ),
        ROOT / "docs" / "RELEASE.md": (
            "闭区间 `0..100`",
            "第一个已完成新功能",
            "新稳定缺陷 ID",
            "不提升任何版本",
            "$desktop-manage-version finalize-release",
        ),
        ROOT / "docs" / "RUST_CLI_TEMPLATE.md": (
            "$desktop-manage-version",
            ".harness/version-state.json",
            "首功能/周期升 Minor",
        ),
        SKILLS_ROOT / "desktop-initialize-rust-project" / "SKILL.md": (
            "$desktop-manage-version init --project-root .",
            ".harness/version-state.json",
            "版本 Skill 及其标准库 helper/测试必须完整保留",
        ),
        SKILLS_ROOT / "desktop-instantiate-project" / "SKILL.md": (
            "$desktop-manage-version init --project-root .",
            ".harness/version-state.json",
            "完整保留该版本 Skill、标准库 helper 和测试",
        ),
        SKILLS_ROOT / "desktop-implement-change" / "SKILL.md": (
            "$desktop-manage-version plan",
            "$desktop-manage-version apply",
            "required_version",
            "maintenance",
        ),
        BUILD_RELEASE_SKILL: (
            "$desktop-manage-version check --phase build",
            "不调用 `finalize-release`",
        ),
        TAURI_RELEASE_SKILL: (
            "$desktop-manage-version check --phase build",
            "不得计算、提升版本或重置正式发布周期",
        ),
        PREPARE_RELEASE_SKILL: (
            "$desktop-manage-version check --phase release",
            "$desktop-manage-version finalize-release",
            "发布准备不得另算或手工覆盖",
        ),
        VERSION_SKILL / "SKILL.md": (
            "一个正式发布周期内",
            "相同缺陷 ID",
            "维护不改变版本",
            "三个分量都在闭区间 `0..100`",
        ),
        VERSION_GATE_HELPER: (
            'STATE_RELATIVE = Path(".harness/version-state.json")',
            'KINDS = ("feature", "bug-fix", "major", "maintenance")',
            "def finalize_release(",
            "Minor overflow at 100",
            "Patch overflow at 100",
        ),
        UPGRADE_POLICY: (
            ".harness/version-state.json",
            "$desktop-manage-version",
        ),
    }
    for path, fragments in requirements.items():
        require_fragments(errors, path, fragments, label="product versioning contract")

    try:
        manifest = json.loads(UPGRADE_OWNERSHIP.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(errors, f"cannot parse upgrade ownership for version state: {exc}")
        return
    matching = [
        rule
        for rule in manifest.get("rules", [])
        if rule.get("pattern") == ".harness/version-state.json"
    ]
    if matching != [{"pattern": ".harness/version-state.json", "mode": "protected"}]:
        fail(
            errors,
            "upgrade ownership must explicitly protect .harness/version-state.json",
        )
