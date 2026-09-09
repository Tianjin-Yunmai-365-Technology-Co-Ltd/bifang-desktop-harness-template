"""校验下游自动版本门禁在工程入口中的固定接线。"""

from __future__ import annotations

import json

from .context import *  # noqa: F403


def validate_product_versioning_contract(errors: list[str]) -> None:
    """确认分类、状态、开发提交、构建只读与发布重置形成闭环。"""
    requirements = {
        ROOT / "docs" / "RELEASE.md": (
            "新生成的 Minor 与 Patch 使用 `0..99` 的 base-100 数位",
            "第一个已完成新功能",
            "问题修复或用户可感知优化",
            "不受当前周期的功能提升锁影响",
            "`check`、`plan` 和 `maintenance` 始终零写入",
            "历史版本与受保护状态中的 Minor/Patch `100`",
            "$desktop-manage-version finalize-release",
        ),
        ROOT / "docs" / "RUST_CLI_TEMPLATE.md": (
            "$desktop-manage-version",
            ".harness/version-state.json",
            "首功能/周期升 Minor",
            "新生成 Minor/Patch 为 `0..99`",
            "用户可感知优化",
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
            "用户可感知优化",
            "base-100 自动进位",
        ),
        BUILD_RELEASE_SKILL: (
            "$desktop-manage-version check --phase build",
            "不调用 `finalize-release`",
        ),
        TAURI_RELEASE_SKILL: (
            "$desktop-manage-version check --phase build",
            "构建不得提升版本",
        ),
        PREPARE_RELEASE_SKILL: (
            "$desktop-manage-version check --phase release",
            "不在此补算 Minor/Patch",
            "finalize-release",
        ),
        VERSION_SKILL / "SKILL.md": (
            "一个正式发布周期内",
            "问题修复或用户可感知优化",
            "相同 ID",
            "不受功能锁影响",
            "维护不改变版本",
            "新生成的 Minor/Patch 数位在 `0..99`",
            "Major 不受 99/100 的业务上限约束",
            "Cargo `u64` 范围",
            "历史 Cargo 与状态 `target_version` 中的 Minor/Patch `100` 继续可读",
            "历史 `bug-fix` ID 被改作其他提升类别",
            "`plan` 绝不写入文件",
            "`init` 是唯一允许在独立 Git 建立前运行的命令",
        ),
        VERSION_GATE_HELPER: (
            'STATE_RELATIVE = Path(".harness/version-state.json")',
            'KINDS = ("feature", "bug-fix", "major", "maintenance")',
            "[1-9][0-9]*",
            "def normalized(self)",
            "def bump_minor(self)",
            "def bump_patch(self)",
            "CARGO_SEMVER_COMPONENT_MAX = (1 << 64) - 1",
            "def _decimal_is_at_most(",
            "major component exceeds Cargo u64::MAX",
            "automatic Major carry exceeds Cargo u64::MAX",
            "minor and patch components outside legacy-compatible range 0..100",
            "feature_bump_applied must match pending feature or major changes",
            "pending bug-fix IDs must exist in applied_bug_ids",
            "historical bug-fix IDs cannot be reused by another kind",
            "def _initialization_root(",
            "def finalize_release(",
        ),
        RELEASE_NOTES_HELPER: (
            "MAX_SEMVER_MAJOR = (1 << 64) - 1",
            'SEMVER = re.compile(r"^([0-9]+)',
            'HARNESS_VERSION = re.compile(r"^[0-9]{12}$")',
            "def _decimal_is_at_most(",
            "semantic version major must be within",
            "minor and patch components must be within 0..100",
        ),
        GUI_SUPPORT_BRAND_ROOT / "react" / "releaseNotesResource.ts": (
            'MAX_CARGO_SEMVER_MAJOR = "18446744073709551615"',
            "function isCargoSemverMajor(",
            "semantic.slice(2)",
        ),
        GUI_SUPPORT_BRAND_ROOT / "rust" / "release_notes.rs": (
            "components[0].parse::<u64>().is_ok()",
            "value <= 100",
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
