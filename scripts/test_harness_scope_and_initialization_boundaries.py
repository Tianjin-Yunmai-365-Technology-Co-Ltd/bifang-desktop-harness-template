"""Harness 源范围、Git 即时设置与 Logo 候选时序回归。"""

from __future__ import annotations

import sys
import tomllib
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.harness_validation_test_support import read_repo_text


class HarnessScopeAndInitializationBoundaryTests(unittest.TestCase):
    """锁定三项跨 Skills、文档与初始化入口的长期边界。"""

    def test_logo_candidates_keep_raw_order_until_user_selection(self) -> None:
        """候选顺序必须稳定，且平台图标处理只能出现在用户选择之后。"""
        identity = read_repo_text(
            ".agents/skills/desktop-prepare-gui-app-identity/SKILL.md"
        )
        initialize = read_repo_text(
            ".agents/skills/desktop-initialize-rust-project/SKILL.md"
        )
        gui_adapter = read_repo_text(
            ".agents/skills/desktop-add-gui-adapter/SKILL.md"
        )

        candidate_positions = [
            identity.index(candidate)
            for candidate in ("`candidate-1`", "`candidate-2`", "`candidate-3`")
        ]
        self.assertEqual(candidate_positions, sorted(candidate_positions))
        self.assertIn("后续重显、说明和选择问题必须保持同一顺序", identity)
        self.assertIn("某个候选生成失败时只重试原标识", identity)

        before_selection, after_selection = identity.split(
            "4. 用户明确选择后", maxsplit=1
        )
        self.assertIn("3. 用户选择前", before_selection)
        self.assertIn("不得检查文件类型、尺寸、色彩空间", before_selection)
        self.assertIn("不得转码、缩放、裁剪、补边", before_selection)
        self.assertNotIn("icons/32x32.png", before_selection)
        self.assertNotIn("app-icon-master.png", before_selection)
        self.assertIn("只对所选候选执行验证和标准化", after_selection)
        self.assertIn("拒绝的候选不得补做检查或处理", after_selection)
        self.assertIn("用户选择前不得验证格式", initialize)
        self.assertIn("只记录所选项的后置验证", initialize)
        self.assertIn("`candidate-1` → `candidate-2` → `candidate-3`", gui_adapter)
        self.assertIn("只为所选项记录后置验证/标准化", gui_adapter)

    def test_git_installation_happens_before_scaffold_and_identity_waits_for_commit(self) -> None:
        """表单确认后先检查/安装 Git，可写仓库身份和模板仍只在基线提交前执行。"""
        instantiate = read_repo_text(
            ".agents/skills/desktop-instantiate-project/SKILL.md"
        )
        initialize = read_repo_text(
            ".agents/skills/desktop-initialize-rust-project/SKILL.md"
        )
        git_skill = read_repo_text(
            ".agents/skills/desktop-configure-git-commits/SKILL.md"
        )

        self.assertNotIn("configure_git_commit.py identity-bootstrap", instantiate)
        self.assertIn(
            "不执行 Git 可用性、版本、身份、提交模板或仓库配置检查",
            instantiate,
        )
        self.assertIn("表单完成与最终汇总确认前不检查、安装或升级 Git", initialize)
        self.assertIn("Git 与 Rust 始终是必需项", initialize)
        before_commit, commit_step = initialize.split("14. 裁剪完成后", maxsplit=1)
        self.assertIn("$desktop-check-development-environment", before_commit)
        self.assertIn("git init --initial-branch=main .", commit_step)
        self.assertIn("identity-report", commit_step)
        self.assertIn("identity-bootstrap", commit_step)
        self.assertIn("identity-check", commit_step)
        self.assertIn("configure_git_commit.py install --project-root .", commit_step)
        self.assertIn("下一步就是实际创建基线提交时", commit_step)
        self.assertIn("下一步将实际运行 `git commit`", git_skill)
        self.assertIn("都不触发安装、检查或修复", git_skill)
        self.assertIn("不得运行本 Skill 的脚本或改写任何 Git 配置", git_skill)

    def test_harness_source_rejects_product_requirements_before_writes(self) -> None:
        """模板源只解析 Harness 工程/初始化信息，产品部分必须去下游重提。"""
        agents = read_repo_text("AGENTS.md")
        readme = read_repo_text("README.md")
        form = read_repo_text(
            ".agents/skills/desktop-instantiate-project/references/initialization-form.md"
        )
        define_product = read_repo_text(
            ".agents/skills/desktop-define-product/SKILL.md"
        )
        implement = read_repo_text(
            ".agents/skills/desktop-implement-change/SKILL.md"
        )

        for text in (agents, define_product, implement):
            self.assertIn("Version.md", text)
            self.assertIn("$desktop-instantiate-project", text)
        self.assertIn("只接受 Harness 自身工程维护", agents)
        self.assertIn("一律不得在当前模板源中接收、分析、记录或实施", agents)
        self.assertIn("当前 Harness 源只接收创建终端下游所必需的本表字段", form)
        self.assertIn("即使用户主动提供，也不得把这些内容解析为表单字段", form)
        self.assertIn("必须在读取、整理或写入任何产品需求前停止", define_product)
        self.assertIn("必须在写入前拒绝", implement)
        self.assertIn("只解析允许的初始化字段", readme)
        self.assertIn("切换到唯一终端下游根目录后重新提出", readme)

    def test_target_platform_and_interfaces_become_persistent_cargo_facts(self) -> None:
        """表单选择必须落入根 Cargo，后续构建不能依赖会话记忆猜测。"""
        manifest_path = (
            ROOT
            / ".agents/skills/desktop-initialize-rust-project/assets/rust-lib-cli/Cargo.toml"
        )
        manifest = tomllib.loads(manifest_path.read_text(encoding="utf-8"))
        metadata = manifest["workspace"]["metadata"]["agent-first-harness"]
        self.assertEqual(metadata, {"target-platforms": [], "interfaces": []})

        initialize = read_repo_text(
            ".agents/skills/desktop-initialize-rust-project/SKILL.md"
        )
        instantiate = read_repo_text(
            ".agents/skills/desktop-instantiate-project/SKILL.md"
        )
        for text in (initialize, instantiate):
            self.assertIn("[workspace.metadata.agent-first-harness]", text)
            self.assertIn("target-platforms", text)
            self.assertIn("interfaces", text)
        self.assertIn("不得从当前宿主或对话重新推断", initialize)
        self.assertIn("不得遗留空数组或根据新会话重新猜测", instantiate)


if __name__ == "__main__":
    unittest.main()
