"""覆盖本地发布入口、成功证据和旧 CI 资产的升级隔离。"""

from __future__ import annotations

import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

from scripts.harness_validation import local_release, release, upgrade


class LocalReleaseTests(unittest.TestCase):
    """在隔离仓库验证发布边界，绝不触发构建或网络操作。"""

    def setUp(self) -> None:
        """复制最小规则文件，使每个负向场景独立。"""
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for relative in (
            "docs/RELEASE.md",
            ".agents/skills/desktop-prepare-release/SKILL.md",
            ".agents/skills/desktop-manage-version/SKILL.md",
        ):
            target = self.root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(local_release.ROOT / relative, target)

    def test_local_release_without_remote_or_workflow_passes(self) -> None:
        """仅有本地规则即可通过，不需要 remote、workflow 或远程回执。"""
        errors: list[str] = []
        local_release.validate_local_release(errors, self.root)
        self.assertEqual(errors, [])

    def test_retired_ci_entries_are_rejected(self) -> None:
        """模板资产和下游安装副本任何一个回流都必须阻断。"""
        for relative in local_release.RETIRED_CI_PATHS:
            with self.subTest(relative=relative):
                path = self.root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("name: release\non: workflow_dispatch\n", encoding="utf-8")
                errors: list[str] = []
                local_release.validate_local_release(errors, self.root)
                self.assertTrue(any(relative in error for error in errors), errors)
                path.unlink()

    def test_missing_local_delivery_evidence_is_rejected(self) -> None:
        """accepted 候选不能在缺少正式发布证据时重置版本周期。"""
        path = self.root / "docs/RELEASE.md"
        source = path.read_text(encoding="utf-8")
        anchor = "本地发布记录绑定精确版本、40 位源码提交、制品路径、摘要、验收及复核证据"
        self.assertIn(anchor, source)
        path.write_text(source.replace(anchor, "候选 accepted 即完成发布"), encoding="utf-8")
        errors: list[str] = []
        local_release.validate_local_release(errors, self.root)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_release_cannot_restore_remote_distribution(self) -> None:
        """取消明确禁止远程分发的入口文案必须失败。"""
        path = self.root / ".agents/skills/desktop-prepare-release/SKILL.md"
        source = path.read_text(encoding="utf-8")
        anchor = "不推送、不上传、不向 Git 或其他远端分发"
        self.assertIn(anchor, source)
        path.write_text(source.replace(anchor, "自动上传到远端"), encoding="utf-8")
        errors: list[str] = []
        local_release.validate_local_release(errors, self.root)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_collection_cannot_restore_provider_downloads(self) -> None:
        """移除收集器的本地目录和零传输边界必须失败。"""
        source = release.COLLECT_RELEASE_SKILL.read_text(encoding="utf-8")
        anchor = "只接受用户提供的本地结果目录，不连接 CI/CD、不下载远端制品、不上传"
        self.assertIn(anchor, source)
        path = self.root / "collect.md"
        path.write_text(source.replace(anchor, "从提供方下载最新制品"), encoding="utf-8")
        errors: list[str] = []
        release.validate_build_skill_contract(errors, collect_skill=path)
        self.assertTrue(any(anchor in error for error in errors), errors)

    def test_retired_entries_have_exact_tombstones(self) -> None:
        """只退役 Harness 旧入口，不把用户所有 workflow 一概归为删除项。"""
        rules = json.loads(upgrade.UPGRADE_OWNERSHIP.read_text(encoding="utf-8"))["rules"]
        for relative in local_release.RETIRED_CI_PATHS:
            self.assertIn({"pattern": relative, "mode": "tombstone"}, rules)
        self.assertFalse(any(
            item["mode"] == "tombstone" and item["pattern"] == ".github/workflows/**"
            for item in rules
        ))
        errors: list[str] = []
        upgrade.validate_upgrade_contract(errors)
        self.assertEqual(errors, [])

    def test_collection_must_preserve_sources_before_cleanup(self) -> None:
        """收集源与 release 重叠时必须先停止，防止清理后丢失源制品。"""
        source = release.COLLECT_RELEASE_SKILL.read_text(encoding="utf-8")
        for anchor in (
            "在任何目标目录清理前构建并验证完整源清单",
            "重叠时保持源和目标原样并停止",
            "只移除这个已验证的空目录",
            "失败不得提交部分集合",
        ):
            with self.subTest(anchor=anchor):
                self.assertIn(anchor, source)
                path = self.root / "collect.md"
                path.write_text(source.replace(anchor, "省略本地收集保护"), encoding="utf-8")
                errors: list[str] = []
                release.validate_build_skill_contract(errors, collect_skill=path)
                self.assertTrue(any(anchor in error for error in errors), errors)

    def test_production_ownership_preserves_user_workflows(self) -> None:
        """运行真实所有权解析，旧入口退役而其他 workflow 保持受保护。"""
        script_root = local_release.ROOT / ".agents/skills/desktop-upgrade-harness/scripts"
        result = subprocess.run(
            [sys.executable, "-B", "-c", (
                "import json, sys; from pathlib import Path; "
                "sys.path.insert(0, sys.argv[1]); "
                "from harness_upgrade_ownership import load_ownership, ownership_mode; "
                "default, rules = load_ownership(Path(sys.argv[2])); "
                "print(json.dumps([ownership_mode(p, default, rules) for p in sys.argv[3:]]))"
            ), str(script_root), str(upgrade.UPGRADE_OWNERSHIP),
             *local_release.RETIRED_CI_PATHS, ".github/workflows/user-checks.yml"],
            check=True, capture_output=True, text=True,
        )
        self.assertEqual(json.loads(result.stdout), ["tombstone", "tombstone", "protected"])


if __name__ == "__main__":
    unittest.main()
