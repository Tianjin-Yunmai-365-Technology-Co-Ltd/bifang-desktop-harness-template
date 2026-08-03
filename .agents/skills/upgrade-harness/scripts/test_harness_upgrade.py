#!/usr/bin/env python3
"""使用隔离 Git 测试夹具验证 Harness 升级成功路径与保护绕过回归。"""

from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("harness_upgrade.py")
PRODUCTION_OWNERSHIP = SCRIPT.parents[1] / "references" / "ownership-manifest.json"
MANAGED = ".agents/skills/define-product/SKILL.md"
MANAGED_SECOND = ".agents/skills/plan-change/SKILL.md"
MANAGED_SELF = ".agents/skills/upgrade-harness/scripts/harness_upgrade.py"
MIXED = "AGENTS.md"
PROTECTED = "docs/AGENT_POLICY.md"
TOMBSTONE = "Version.md"


class HarnessUpgradeTests(unittest.TestCase):
    """每个测试使用生产所有权清单和独立候选/下游 Git 根。"""

    def setUp(self) -> None:
        """初始化隔离目录、真实控制路径和空来源锁。"""

        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.source = self.root / "source"
        self.candidate = self.root / "candidate"
        self.target = self.root / "target"
        self.source.mkdir()
        self.candidate.mkdir()
        self.target.mkdir()
        for repository in (self.source, self.target):
            subprocess.run(
                ["git", "init", "--initial-branch=main", str(repository)],
                check=True,
                capture_output=True,
                text=True,
            )
        self.source_version = "202607310001"
        self.write(
            self.source,
            "Version.md",
            f"# Harness 版本\n\n- 当前版本：`{self.source_version}`\n",
        )
        subprocess.run(
            ["git", "-C", str(self.source), "add", "Version.md"],
            check=True,
            capture_output=True,
            text=True,
        )
        for repository in (self.source, self.target):
            subprocess.run(
                [
                    "git",
                    "-C",
                    str(repository),
                    "-c",
                    "user.name=Harness Fixture",
                    "-c",
                    "user.email=harness-fixture@example.invalid",
                    "commit",
                    "--allow-empty",
                    "-m",
                    "fixture baseline",
                ],
                check=True,
                capture_output=True,
                text=True,
            )
        self.source_commit = subprocess.run(
            ["git", "-C", str(self.source), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        self.ownership = (
            self.target
            / ".agents/skills/upgrade-harness/references/ownership-manifest.json"
        )
        candidate_ownership = self.candidate / self.ownership.relative_to(self.target)
        self.ownership.parent.mkdir(parents=True)
        candidate_ownership.parent.mkdir(parents=True)
        shutil.copy2(PRODUCTION_OWNERSHIP, self.ownership)
        shutil.copy2(PRODUCTION_OWNERSHIP, candidate_ownership)
        self.lock = self.target / ".harness/upstream-lock.json"
        self.plan_counter = 0

    def tearDown(self) -> None:
        """清理测试独占目录，不接触真实工作区。"""

        self.temporary.cleanup()

    def write(self, root: Path, relative: str, content: str) -> None:
        """在测试夹具根目录内写普通文件。"""

        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def run_tool(self, *arguments: str, expected: int = 0) -> dict:
        """执行真实脚本、断言退出码并解析结构化输出。"""

        result = subprocess.run(
            [sys.executable, str(SCRIPT), *arguments],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(expected, result.returncode, result.stderr or result.stdout)
        payload = result.stdout if result.stdout.strip() else result.stderr
        return json.loads(payload)

    def shared_arguments(self, *, lock: Path | None = None) -> list[str]:
        """返回 plan 使用的显式候选、目标、生产清单和精确 lock 参数。"""

        return [
            "--source-root",
            str(self.source),
            "--source-version",
            self.source_version,
            "--source-commit",
            self.source_commit,
            "--candidate-root",
            str(self.candidate),
            "--target-root",
            str(self.target),
            "--ownership",
            str(self.ownership),
            "--lock",
            str(self.lock if lock is None else lock),
        ]

    def create_plan(self, *, expected: int = 0, name: str = "plan") -> tuple[dict, Path]:
        """在候选/目标之外独占创建计划。"""

        self.plan_counter += 1
        plan_path = self.root / f"{name}-{self.plan_counter}.json"
        plan = self.run_tool(
            "plan",
            *self.shared_arguments(),
            "--output",
            str(plan_path),
            expected=expected,
        )
        return plan, plan_path

    def bootstrap(self) -> None:
        """经显式审核计划建立测试夹具的首份共同基线。"""

        _, plan_path = self.create_plan(expected=2, name="bootstrap")
        self.run_tool(
            "record",
            "--plan",
            str(plan_path),
            "--source-version",
            self.source_version,
            "--source-commit",
            self.source_commit,
            "--bootstrap",
            "--approval",
            "bootstrap-verified-baseline",
        )

    def record(
        self,
        plan_path: Path,
        *,
        resolved_manual: tuple[str, ...] = (),
    ) -> dict:
        """记录一个非 bootstrap 受审计划。"""

        arguments = [
            "record",
            "--plan",
            str(plan_path),
            "--source-version",
            self.source_version,
            "--source-commit",
            self.source_commit,
            "--approval",
            "record-verified-baseline",
        ]
        for path in resolved_manual:
            arguments.extend(["--resolved-manual", path])
        return self.run_tool(*arguments)

    def plan(self, expected: int = 0) -> dict:
        """只在 stdout 生成计划。"""

        return self.run_tool("plan", *self.shared_arguments(), expected=expected)

    def classification(self, plan: dict, relative: str) -> str:
        """取得指定路径的唯一分类。"""

        matches = [item for item in plan["actions"] if item["path"] == relative]
        self.assertEqual(1, len(matches))
        return matches[0]["classification"]

    def test_upstream_only_change_can_apply_and_record(self) -> None:
        """上游单改可更新既有受管文件，并在重算计划后记录。"""

        self.write(self.candidate, MANAGED, "v1")
        self.write(self.target, MANAGED, "v1")
        self.bootstrap()
        self.write(self.candidate, MANAGED, "v2")
        plan, plan_path = self.create_plan()
        self.assertEqual("update", self.classification(plan, MANAGED))
        applied = self.run_tool(
            "apply",
            "--plan",
            str(plan_path),
            "--approval",
            "apply-managed-changes",
            "--path",
            MANAGED,
        )
        self.assertEqual([MANAGED], applied["applied"])
        self.assertEqual("v2", (self.target / MANAGED).read_text(encoding="utf-8"))
        _, converged_plan = self.create_plan(name="converged")
        self.record(converged_plan)

    def test_local_change_remains_protected_across_later_upstream_change(self) -> None:
        """preserve_local 记录后，上游下一次修改仍必须冲突而非覆盖。"""

        self.write(self.candidate, MANAGED, "v1")
        self.write(self.target, MANAGED, "v1")
        self.bootstrap()
        self.write(self.target, MANAGED, "local")
        plan, plan_path = self.create_plan()
        self.assertEqual("preserve_local", self.classification(plan, MANAGED))
        self.record(plan_path)
        self.write(self.candidate, MANAGED, "v2")
        later = self.plan(expected=2)
        self.assertEqual("conflict", self.classification(later, MANAGED))

    def test_local_delete_remains_protected_across_later_upstream_change(self) -> None:
        """本地删除不会在记录后被后续上游修改静默恢复。"""

        self.write(self.candidate, MANAGED, "v1")
        self.write(self.target, MANAGED, "v1")
        self.bootstrap()
        (self.target / MANAGED).unlink()
        plan, plan_path = self.create_plan()
        self.assertEqual("preserve_local", self.classification(plan, MANAGED))
        self.record(plan_path)
        self.write(self.candidate, MANAGED, "v2")
        later = self.plan(expected=2)
        self.assertEqual("conflict", self.classification(later, MANAGED))

    def test_both_sides_change_blocks(self) -> None:
        """候选和下游同时偏离共同基线时必须阻断。"""

        self.write(self.candidate, MANAGED, "v1")
        self.write(self.target, MANAGED, "v1")
        self.bootstrap()
        self.write(self.candidate, MANAGED, "upstream")
        self.write(self.target, MANAGED, "local")
        plan = self.plan(expected=2)
        self.assertEqual("conflict", self.classification(plan, MANAGED))

    def test_delete_requires_manual_resolution_before_record(self) -> None:
        """上游删除只生成手动动作，脚本不自动 unlink。"""

        self.write(self.candidate, MANAGED, "v1")
        self.write(self.target, MANAGED, "v1")
        self.bootstrap()
        (self.candidate / MANAGED).unlink()
        plan, plan_path = self.create_plan()
        self.assertEqual("delete", self.classification(plan, MANAGED))
        applied = self.run_tool(
            "apply",
            "--plan",
            str(plan_path),
            "--approval",
            "apply-managed-changes",
            "--path",
            MANAGED,
            expected=2,
        )
        self.assertFalse(applied["ok"])
        self.assertTrue((self.target / MANAGED).is_file())
        self.run_tool(
            "record",
            "--plan",
            str(plan_path),
            "--source-version",
            self.source_version,
            "--source-commit",
            self.source_commit,
            "--approval",
            "record-verified-baseline",
            expected=2,
        )
        (self.target / MANAGED).unlink()
        _, converged_plan = self.create_plan(name="delete-resolved")
        self.record(converged_plan)

    def test_new_managed_path_requires_manual_convergence(self) -> None:
        """新增文件先报告 add；目标逐项确认后相同才可记录。"""

        self.bootstrap()
        self.write(self.candidate, MANAGED, "new")
        plan = self.plan()
        self.assertEqual("add", self.classification(plan, MANAGED))
        self.write(self.target, MANAGED, "new")
        converged, plan_path = self.create_plan()
        self.assertEqual("converged", self.classification(converged, MANAGED))
        self.record(plan_path)

    def test_new_path_collision_blocks(self) -> None:
        """新增候选与同名本地文件字节不同时必须阻断。"""

        self.bootstrap()
        self.write(self.candidate, MANAGED, "upstream")
        self.write(self.target, MANAGED, "local")
        plan = self.plan(expected=2)
        self.assertEqual("collision", self.classification(plan, MANAGED))

    def test_protected_candidate_blocks_raw_source_tree(self) -> None:
        """候选包含策略/产品事实时不能被误当成已渲染工程候选。"""

        self.write(self.candidate, PROTECTED, "upstream")
        plan = self.plan(expected=2)
        self.assertEqual("protected_candidate", self.classification(plan, PROTECTED))

    def test_tombstone_in_candidate_or_target_blocks(self) -> None:
        """来源或目标出现终端下游禁回迁文件时都必须阻断。"""

        self.write(self.candidate, TOMBSTONE, "source")
        candidate_plan = self.plan(expected=2)
        self.assertEqual(
            "tombstone_candidate",
            self.classification(candidate_plan, TOMBSTONE),
        )
        (self.candidate / TOMBSTONE).unlink()
        self.write(self.target, TOMBSTONE, "target")
        target_plan = self.plan(expected=2)
        self.assertEqual("tombstone_present", self.classification(target_plan, TOMBSTONE))

    @unittest.skipIf(not hasattr(Path, "symlink_to"), "当前平台不支持符号链接")
    def test_target_tombstone_symlink_and_empty_directory_block(self) -> None:
        """tombstone 即使不是普通文件也必须阻断 bootstrap。"""

        outside = self.root / "outside-version.txt"
        outside.write_text("outside", encoding="utf-8")
        (self.target / TOMBSTONE).symlink_to(outside)
        plan = self.plan(expected=2)
        self.assertTrue(
            any("目标包含 tombstone 路径：Version.md" in item for item in plan["problems"]),
            plan,
        )
        (self.target / TOMBSTONE).unlink()
        (self.target / ".agents/skills/instantiate-project").mkdir(parents=True)
        plan = self.plan(expected=2)
        self.assertTrue(
            any("instantiate-project" in item for item in plan["problems"]),
            plan,
        )

    def test_manual_add_cannot_be_recorded_without_creating_target(self) -> None:
        """仅声明 resolved-manual 不得把仍缺失的 mixed 文件写入基线。"""

        self.write(self.candidate, MIXED, "candidate")
        plan, plan_path = self.create_plan(expected=2)
        self.assertEqual("manual_add", self.classification(plan, MIXED))
        self.run_tool(
            "record",
            "--plan",
            str(plan_path),
            "--source-version",
            self.source_version,
            "--source-commit",
            self.source_commit,
            "--resolved-manual",
            MIXED,
            "--bootstrap",
            "--approval",
            "bootstrap-verified-baseline",
            expected=2,
        )
        self.assertFalse(self.lock.exists())

    @unittest.skipIf(not hasattr(Path, "symlink_to"), "当前平台不支持符号链接")
    def test_candidate_symlink_blocks_plan_and_bootstrap_record(self) -> None:
        """候选符号链接既阻断计划，也不能被 bootstrap 常量绕过。"""

        outside = self.root / "outside.txt"
        outside.write_text("secret", encoding="utf-8")
        path = self.candidate / MANAGED
        path.parent.mkdir(parents=True, exist_ok=True)
        path.symlink_to(outside)
        _, plan_path = self.create_plan(expected=2)
        self.run_tool(
            "record",
            "--plan",
            str(plan_path),
            "--source-version",
            self.source_version,
            "--source-commit",
            self.source_commit,
            "--bootstrap",
            "--approval",
            "bootstrap-verified-baseline",
            expected=2,
        )
        self.assertFalse(self.lock.exists())

    def test_bootstrap_rejects_divergent_managed_overlap(self) -> None:
        """bootstrap 只能记录已逐项收敛的 managed 重叠。"""

        self.write(self.candidate, MANAGED, "upstream")
        self.write(self.target, MANAGED, "local")
        _, plan_path = self.create_plan(expected=2)
        self.run_tool(
            "record",
            "--plan",
            str(plan_path),
            "--source-version",
            self.source_version,
            "--source-commit",
            self.source_commit,
            "--bootstrap",
            "--approval",
            "bootstrap-verified-baseline",
            expected=2,
        )
        self.assertFalse(self.lock.exists())

    def test_bootstrap_rejects_tombstone(self) -> None:
        """bootstrap 不得豁免 tombstone_present。"""

        self.write(self.target, TOMBSTONE, "forbidden")
        _, plan_path = self.create_plan(expected=2)
        self.run_tool(
            "record",
            "--plan",
            str(plan_path),
            "--source-version",
            self.source_version,
            "--source-commit",
            self.source_commit,
            "--bootstrap",
            "--approval",
            "bootstrap-verified-baseline",
            expected=2,
        )
        self.assertFalse(self.lock.exists())

    def test_tampered_plan_cannot_overwrite_protected_file(self) -> None:
        """手工把策略伪装为 managed/update 时 apply 必须在写入前拒绝。"""

        self.write(self.candidate, MANAGED, "v1")
        self.write(self.target, MANAGED, "v1")
        self.write(self.target, PROTECTED, "keep")
        self.bootstrap()
        self.write(self.candidate, MANAGED, "v2")
        self.write(self.candidate, PROTECTED, "malicious")
        _, plan_path = self.create_plan(expected=2)
        payload = json.loads(plan_path.read_text(encoding="utf-8"))
        managed_item = next(item for item in payload["actions"] if item["path"] == MANAGED)
        managed_item["path"] = PROTECTED
        plan_path.write_text(json.dumps(payload), encoding="utf-8")
        self.run_tool(
            "apply",
            "--plan",
            str(plan_path),
            "--approval",
            "apply-managed-changes",
            "--path",
            PROTECTED,
            expected=2,
        )
        self.assertEqual("keep", (self.target / PROTECTED).read_text(encoding="utf-8"))

    @unittest.skipIf(not hasattr(Path, "symlink_to"), "当前平台不支持符号链接")
    def test_target_parent_symlink_after_plan_cannot_escape(self) -> None:
        """plan 后父目录被换成外链时，apply 不得修改仓库外文件。"""

        self.write(self.candidate, MANAGED, "v1")
        self.write(self.target, MANAGED, "v1")
        self.bootstrap()
        self.write(self.candidate, MANAGED, "v2")
        _, plan_path = self.create_plan()

        managed_parent = (self.target / MANAGED).parent
        shutil.rmtree(managed_parent)
        outside_parent = self.root / "outside-managed"
        outside_parent.mkdir()
        outside_file = outside_parent / Path(MANAGED).name
        outside_file.write_text("v1", encoding="utf-8")
        managed_parent.symlink_to(outside_parent, target_is_directory=True)

        self.run_tool(
            "apply",
            "--plan",
            str(plan_path),
            "--approval",
            "apply-managed-changes",
            "--path",
            MANAGED,
            expected=2,
        )
        self.assertEqual("v1", outside_file.read_text(encoding="utf-8"))

    def test_plan_output_cannot_overwrite_target_or_existing_file(self) -> None:
        """只读 plan 的输出必须在两棵树外独占创建。"""

        self.write(self.target, PROTECTED, "keep")
        self.run_tool(
            "plan",
            *self.shared_arguments(),
            "--output",
            str(self.target / PROTECTED),
            expected=2,
        )
        self.assertEqual("keep", (self.target / PROTECTED).read_text(encoding="utf-8"))
        existing = self.root / "existing.json"
        existing.write_text("keep", encoding="utf-8")
        self.run_tool(
            "plan",
            *self.shared_arguments(),
            "--output",
            str(existing),
            expected=2,
        )
        self.assertEqual("keep", existing.read_text(encoding="utf-8"))

    def test_lock_path_must_be_exact_control_path(self) -> None:
        """仓库外或产品目录内的伪 lock 都不能参与计划。"""

        self.run_tool(
            "plan",
            *self.shared_arguments(lock=self.root / "forged-lock.json"),
            expected=2,
        )
        self.run_tool(
            "plan",
            *self.shared_arguments(lock=self.target / "src/provenance.json"),
            expected=2,
        )

    def test_ownership_mode_drift_blocks(self) -> None:
        """lock 的旧 mode 与当前清单不一致时必须人工迁移。"""

        self.write(self.candidate, MANAGED, "v1")
        self.write(self.target, MANAGED, "v1")
        self.bootstrap()
        lock = json.loads(self.lock.read_text(encoding="utf-8"))
        lock["entries"][MANAGED]["mode"] = "merge-sections"
        self.lock.write_text(json.dumps(lock), encoding="utf-8")
        plan = self.plan(expected=2)
        self.assertTrue(any("所有权 mode 已变化" in item for item in plan["problems"]))

    def test_weakened_ownership_manifest_is_rejected(self) -> None:
        """生产最小 tombstone/protected/self-update 规则不得被下游清单弱化。"""

        manifest = json.loads(self.ownership.read_text(encoding="utf-8"))
        manifest["rules"] = [
            item for item in manifest["rules"] if item["pattern"] != "Version.md"
        ]
        self.ownership.write_text(json.dumps(manifest), encoding="utf-8")
        result = self.run_tool("plan", *self.shared_arguments(), expected=2)
        self.assertIn("削弱了必需保护", result["error"])

    def test_source_provenance_is_bound_to_clean_git_head(self) -> None:
        """plan 绑定真实来源 HEAD，record 不能改写，来源漂移会使计划失效。"""

        self.bootstrap()
        _, plan_path = self.create_plan()
        result = self.run_tool(
            "record",
            "--plan",
            str(plan_path),
            "--source-version",
            self.source_version,
            "--source-commit",
            "0" * 40,
            "--approval",
            "record-verified-baseline",
            expected=2,
        )
        self.assertIn("必须与已复核 plan 精确匹配", result["error"])
        self.write(self.source, "untracked.txt", "drift")
        result = self.run_tool("plan", *self.shared_arguments(), expected=2)
        self.assertIn("必须保持干净", result["error"])

    def test_control_file_drift_blocks_apply_before_write(self) -> None:
        """受审后 ownership 字节变化必须使计划失效且不修改目标。"""

        self.write(self.candidate, MANAGED, "v1")
        self.write(self.target, MANAGED, "v1")
        self.bootstrap()
        self.write(self.candidate, MANAGED, "v2")
        _, plan_path = self.create_plan()
        manifest = json.loads(self.ownership.read_text(encoding="utf-8"))
        self.ownership.write_text(
            json.dumps(manifest, indent=4) + "\n",
            encoding="utf-8",
        )
        self.run_tool(
            "apply",
            "--plan",
            str(plan_path),
            "--approval",
            "apply-managed-changes",
            "--path",
            MANAGED,
            expected=2,
        )
        self.assertEqual("v1", (self.target / MANAGED).read_text(encoding="utf-8"))

    @unittest.skipUnless(hasattr(os, "chmod"), "当前平台不支持 chmod")
    def test_permission_mode_changes_follow_three_way_rules(self) -> None:
        """上游 mode 单改可应用，本地 mode 单改必须保留。"""

        self.write(self.candidate, MANAGED, "v1")
        self.write(self.target, MANAGED, "v1")
        os.chmod(self.candidate / MANAGED, 0o644)
        os.chmod(self.target / MANAGED, 0o644)
        self.bootstrap()
        os.chmod(self.candidate / MANAGED, 0o755)
        plan, plan_path = self.create_plan()
        self.assertEqual("update", self.classification(plan, MANAGED))
        self.run_tool(
            "apply",
            "--plan",
            str(plan_path),
            "--approval",
            "apply-managed-changes",
            "--path",
            MANAGED,
        )
        self.assertEqual(0o755, (self.target / MANAGED).stat().st_mode & 0o777)
        _, converged_plan = self.create_plan(name="mode-converged")
        self.record(converged_plan)
        os.chmod(self.target / MANAGED, 0o700)
        plan = self.plan()
        self.assertEqual("preserve_local", self.classification(plan, MANAGED))

    @unittest.skipUnless(hasattr(os, "chmod"), "当前平台不支持 chmod")
    def test_special_permission_bits_are_rejected(self) -> None:
        """setuid/setgid/sticky 等特殊位不进入跨平台来源锁。"""

        self.write(self.candidate, MANAGED, "v1")
        os.chmod(self.candidate / MANAGED, 0o1755)
        observed_mode = stat.S_IMODE((self.candidate / MANAGED).stat().st_mode)
        if not observed_mode & ~0o777:
            self.skipTest("文件系统会清除特殊权限位")
        result = self.run_tool("plan", *self.shared_arguments(), expected=2)
        self.assertIn("不受支持的特殊权限位", result["error"])

    def test_full_preflight_prevents_partial_apply(self) -> None:
        """后项在 plan 后变化时，前项不得先被更新。"""

        for relative in (MANAGED, MANAGED_SECOND):
            self.write(self.candidate, relative, "v1")
            self.write(self.target, relative, "v1")
        self.bootstrap()
        for relative in (MANAGED, MANAGED_SECOND):
            self.write(self.candidate, relative, "v2")
        _, plan_path = self.create_plan()
        self.write(self.target, MANAGED_SECOND, "changed-after-plan")
        self.run_tool(
            "apply",
            "--plan",
            str(plan_path),
            "--approval",
            "apply-managed-changes",
            "--path",
            MANAGED,
            expected=2,
        )
        self.assertEqual("v1", (self.target / MANAGED).read_text(encoding="utf-8"))

    def test_manual_merge_must_be_named_before_record(self) -> None:
        """mixed-ownership 差异不能用固定 approval 静默吞掉。"""

        self.write(self.candidate, MIXED, "v1")
        self.write(self.target, MIXED, "v1")
        self.bootstrap()
        self.write(self.candidate, MIXED, "upstream")
        self.write(self.target, MIXED, "reviewed-local-merge")
        plan, plan_path = self.create_plan()
        self.assertEqual("manual_merge", self.classification(plan, MIXED))
        self.run_tool(
            "record",
            "--plan",
            str(plan_path),
            "--source-version",
            self.source_version,
            "--source-commit",
            self.source_commit,
            "--approval",
            "record-verified-baseline",
            expected=2,
        )
        result = self.record(plan_path, resolved_manual=(MIXED,))
        self.assertGreater(result["entries"], 0)

    def test_managed_self_updates_after_other_managed_files(self) -> None:
        """自更新组必须排在普通 managed 更新之后。"""

        for relative in (MANAGED, MANAGED_SELF):
            self.write(self.candidate, relative, "v1")
            self.write(self.target, relative, "v1")
        self.bootstrap()
        for relative in (MANAGED, MANAGED_SELF):
            self.write(self.candidate, relative, "v2")
        _, plan_path = self.create_plan()
        self.run_tool(
            "apply",
            "--plan",
            str(plan_path),
            "--approval",
            "apply-managed-changes",
            "--path",
            MANAGED_SELF,
            expected=2,
        )
        result = self.run_tool(
            "apply",
            "--plan",
            str(plan_path),
            "--approval",
            "apply-managed-changes",
            "--path",
            MANAGED,
        )
        self.assertEqual([MANAGED], result["applied"])
        _, self_plan = self.create_plan(name="managed-self")
        result = self.run_tool(
            "apply",
            "--plan",
            str(self_plan),
            "--approval",
            "apply-managed-changes",
            "--path",
            MANAGED_SELF,
        )
        self.assertEqual([MANAGED_SELF], result["applied"])


if __name__ == "__main__":
    unittest.main()
