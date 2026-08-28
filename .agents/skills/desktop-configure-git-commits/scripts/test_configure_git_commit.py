#!/usr/bin/env python3
"""验证 Git 提交模板配置器的真实仓库本地行为。"""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("configure_git_commit.py")
SOURCE_TEMPLATE = SCRIPT.parent.parent / "assets" / "commit-template.txt"


class ConfigureGitCommitTests(unittest.TestCase):
    """在隔离临时仓库中覆盖安装、幂等、冲突、替换和漂移检查。"""

    def setUp(self) -> None:
        """为每个场景创建没有提交、身份或外部状态依赖的独立仓库。"""

        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name) / "project"
        self.root.mkdir()
        self._git("init", "--quiet", "--initial-branch=main")

    def tearDown(self) -> None:
        """删除隔离仓库，确保测试不保留 Git 配置或模板状态。"""

        self.temporary.cleanup()

    def _git(self, *arguments: str, check: bool = True) -> subprocess.CompletedProcess[str]:
        """在隔离临时仓库内运行 Git，集中子进程调用约定。"""

        result = subprocess.run(
            ["git", "-C", str(self.root), *arguments],
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        if check:
            self.assertEqual(result.returncode, 0, result.stderr)
        return result

    def run_script(self, *arguments: str) -> subprocess.CompletedProcess[str]:
        """通过真实 CLI 运行配置器，以覆盖参数解析、退出码和 JSON 输出。"""

        return subprocess.run(
            [sys.executable, str(SCRIPT), *arguments],
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )

    def git_values(self, key: str) -> list[str]:
        """读取临时仓库的全部本地配置值，不回退到用户全局配置。"""

        result = self._git("config", "--local", "--get-all", key, check=False)
        if result.returncode == 1:
            return []
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout.splitlines()

    def set_local(self, key: str, value: str) -> None:
        """为冲突场景写入精确的仓库本地配置，不影响用户或其他仓库。"""

        self._git("config", "--local", key, value)

    def install(self, *extra: str) -> subprocess.CompletedProcess[str]:
        """以临时仓库为精确项目根执行安装模式。"""

        return self.run_script("install", "--project-root", str(self.root), *extra)

    def check(self) -> subprocess.CompletedProcess[str]:
        """以临时仓库为精确项目根执行检查模式。"""

        return self.run_script("check", "--project-root", str(self.root))

    def test_install_configures_local_template_and_check_passes(self) -> None:
        """首次安装应复制可信模板、设置四项本地配置，并通过独立检查。"""

        result = self.install()
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        template = Path(payload["templatePath"])
        self.assertEqual(template.read_bytes(), SOURCE_TEMPLATE.read_bytes())
        self.assertEqual(self.git_values("commit.template"), [str(template)])
        self.assertEqual(self.git_values("commit.cleanup"), ["strip"])
        self.assertEqual(self.git_values("commit.verbose"), ["true"])
        self.assertEqual(self.git_values("core.commentChar"), ["#"])
        checked = self.check()
        self.assertEqual(checked.returncode, 0, checked.stderr)
        self.assertEqual(json.loads(checked.stdout)["status"], "ok")

    def test_repeated_install_is_idempotent(self) -> None:
        """相同模板和配置重复安装不得报告额外变化或制造重复键。"""

        first = self.install()
        self.assertEqual(first.returncode, 0, first.stderr)
        second = self.install()
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertFalse(json.loads(second.stdout)["changed"])
        self.assertEqual(len(self.git_values("commit.template")), 1)

    def test_conflicting_setting_fails_without_mutation(self) -> None:
        """既有不同模板配置必须在写入受管文件前失败并保持原值。"""

        self.set_local("commit.template", "/existing/template.txt")
        result = self.install()
        self.assertEqual(result.returncode, 1)
        self.assertIn("conflicting local Git settings", result.stderr)
        self.assertEqual(self.git_values("commit.template"), ["/existing/template.txt"])
        common = self._git("rev-parse", "--git-common-dir").stdout.strip()
        self.assertFalse((self.root / common / "harness").exists())

    def test_replace_requires_flag_and_normalizes_all_settings(self) -> None:
        """明确 replace 后才可替换冲突，并把全部受管设置恢复为规范值。"""

        self.set_local("commit.template", "/existing/template.txt")
        self.set_local("commit.cleanup", "verbatim")
        self.set_local("commit.verbose", "false")
        self.set_local("core.commentChar", ";")
        result = self.install("--replace")
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertTrue(payload["replacedConflicts"])
        self.assertEqual(self.git_values("commit.cleanup"), ["strip"])
        self.assertEqual(self.git_values("commit.verbose"), ["true"])
        self.assertEqual(self.git_values("core.commentChar"), ["#"])

    def test_check_rejects_tampered_installed_template(self) -> None:
        """Git common dir 中模板字节被修改后，检查必须失败而不能静默接受。"""

        installed = self.install()
        self.assertEqual(installed.returncode, 0, installed.stderr)
        template = Path(json.loads(installed.stdout)["templatePath"])
        template.write_text("# tampered\n", encoding="utf-8")
        checked = self.check()
        self.assertEqual(checked.returncode, 1)
        self.assertIn("differs from the tracked source", checked.stderr)

    def test_nested_directory_is_not_accepted_as_project_root(self) -> None:
        """父仓库中的普通子目录不能冒充独立项目根并接收本地设置。"""

        nested = self.root / "nested"
        nested.mkdir()
        result = self.run_script("install", "--project-root", str(nested))
        self.assertEqual(result.returncode, 1)
        self.assertIn("must equal the independent Git top level", result.stderr)


if __name__ == "__main__":
    unittest.main()
