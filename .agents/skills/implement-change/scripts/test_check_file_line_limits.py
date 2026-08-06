"""覆盖人工维护文本 500 行复核与 2000 行硬门禁的边界语义。"""

from __future__ import annotations

from contextlib import redirect_stderr, redirect_stdout
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock

from check_file_line_limits import HARD_LINE_LIMIT, REVIEW_THRESHOLD, inspect_repository, main


class RepositoryFixture(unittest.TestCase):
    """为每个场景建立独立 Git 根并提供可见文件写入辅助。"""

    def setUp(self) -> None:
        """创建不会依赖用户 Git 身份的临时仓库。"""

        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        subprocess.run(
            ["git", "init", "--quiet", "--initial-branch=main", "."],
            cwd=self.root,
            check=True,
        )

    def tearDown(self) -> None:
        """移除场景仓库和所有测试文件。"""

        self.temporary.cleanup()

    def write(self, relative: str, payload: str | bytes) -> Path:
        """写入一个文件；字符串固定使用 UTF-8。"""

        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(payload, bytes):
            path.write_bytes(payload)
        else:
            path.write_text(payload, encoding="utf-8")
        return path

    def track(self, *relative: str) -> None:
        """把指定路径加入索引而不创建提交。"""

        subprocess.run(["git", "add", "--", *relative], cwd=self.root, check=True)


class FileLineLimitTests(RepositoryFixture):
    """验证 500/501/2000/2001、Git 可见范围和封闭生成文件分类。"""

    def test_accepts_500_lines_with_or_without_final_newline(self) -> None:
        """恰好 500 行应通过且不进入复核候选，尾部换行不增加物理行。"""

        self.write("tracked.txt", "\n".join("x" for _ in range(REVIEW_THRESHOLD)))
        self.write("untracked.txt", "y\n" * REVIEW_THRESHOLD)
        self.track("tracked.txt")
        report = inspect_repository(self.root)
        self.assertTrue(report["ok"], report)
        self.assertEqual(report["checkedTextFiles"], 2)
        self.assertEqual(report["reviewCandidates"], [])

    def test_reports_501_through_2000_lines_without_hard_failure(self) -> None:
        """软阈值以上到硬上限的文件应通过机械检查并列为语义复核候选。"""

        self.write("tracked.md", "x\n" * (REVIEW_THRESHOLD + 1))
        self.write("nested/untracked.py", "x\n" * HARD_LINE_LIMIT)
        self.track("tracked.md")
        report = inspect_repository(self.root)
        self.assertTrue(report["ok"], report)
        self.assertEqual(
            [item["path"] for item in report["reviewCandidates"]],
            ["nested/untracked.py", "tracked.md"],
        )
        self.assertEqual(report["violations"], [])

    def test_rejects_2001_lines_for_tracked_and_untracked_text(self) -> None:
        """已跟踪和未忽略未跟踪文件超过 2000 行时都必须失败。"""

        payload = "\n".join("x" for _ in range(HARD_LINE_LIMIT + 1))
        self.write("tracked.md", payload)
        self.write("nested/untracked.py", payload)
        self.track("tracked.md")
        report = inspect_repository(self.root)
        self.assertFalse(report["ok"])
        self.assertEqual(
            [item["path"] for item in report["violations"]],
            ["nested/untracked.py", "tracked.md"],
        )

    def test_handles_hidden_spaces_and_newlines_in_paths(self) -> None:
        """NUL 清单必须无歧义处理隐藏、空格和换行文件名。"""

        payload = "x\n" * (HARD_LINE_LIMIT + 1)
        names = [".hidden file.md", "line\nbreak.txt"]
        for name in names:
            self.write(name, payload)
        self.track(*names)
        report = inspect_repository(self.root)
        self.assertEqual(
            [item["path"] for item in report["violations"]],
            sorted(names),
        )

    def test_ignored_binary_and_symlink_targets_do_not_bypass_or_expand_scope(self) -> None:
        """忽略文件、二进制和链接目标不参与人工维护文本计数。"""

        self.write(".gitignore", "ignored.txt\ntarget.txt\n")
        self.write("ignored.txt", "x\n" * (HARD_LINE_LIMIT + 1))
        self.write("binary.bin", b"header\0" + b"x\n" * (HARD_LINE_LIMIT + 1))
        self.write("target.txt", "x\n" * (HARD_LINE_LIMIT + 1))
        self.track(".gitignore", "binary.bin")
        link = self.root / "linked.txt"
        try:
            link.symlink_to(self.root / "target.txt")
        except (OSError, NotImplementedError):
            self.skipTest("当前平台不允许创建符号链接")
        self.track("linked.txt")
        report = inspect_repository(self.root)
        self.assertTrue(report["ok"], report)
        self.assertEqual(report["skippedBinaryFiles"], 1)
        self.assertEqual(report["skippedSymlinks"], 1)

    def test_deleted_tracked_file_is_skipped_as_absent_worktree_content(self) -> None:
        """索引中仍存在但工作树已删除的文件不应造成检查器运行错误。"""

        deleted = self.write("deleted.txt", "x\n" * (HARD_LINE_LIMIT + 1))
        self.track("deleted.txt")
        deleted.unlink()
        report = inspect_repository(self.root)
        self.assertTrue(report["ok"], report)
        self.assertEqual(report["skippedMissingFiles"], 1)

    def test_excludes_only_known_generated_lockfile_names(self) -> None:
        """工具锁文件按精确名称排除，相似人工文件仍会失败。"""

        payload = "x\n" * (HARD_LINE_LIMIT + 1)
        self.write("Cargo.lock", payload)
        self.write("Cargo.lock.notes", payload)
        self.track("Cargo.lock", "Cargo.lock.notes")
        report = inspect_repository(self.root)
        self.assertEqual(report["excludedGeneratedFiles"], ["Cargo.lock"])
        self.assertEqual(
            [item["path"] for item in report["violations"]],
            ["Cargo.lock.notes"],
        )

    def test_invalid_utf8_text_candidate_fails_closed(self) -> None:
        """无 NUL 且无法解码的文件不能静默伪装为二进制。"""

        self.write("unknown.dat", b"\xff\xfe\xfd")
        self.track("unknown.dat")
        report = inspect_repository(self.root)
        self.assertFalse(report["ok"])
        self.assertTrue(any("不是 UTF-8" in item for item in report["errors"]), report)


class FileLineLimitFailureTests(unittest.TestCase):
    """验证项目根、Git 失败和稳定 CLI 退出码。"""

    def test_non_git_directory_is_operational_failure(self) -> None:
        """缺少 Git 清单时必须返回检查器错误而不是空通过。"""

        with tempfile.TemporaryDirectory() as temporary:
            report = inspect_repository(Path(temporary))
        self.assertFalse(report["ok"])
        self.assertTrue(any("Git 文件枚举失败" in item for item in report["errors"]), report)

    def test_git_execution_error_fails_closed(self) -> None:
        """Git 无法启动时必须保留明确诊断。"""

        with tempfile.TemporaryDirectory() as temporary, mock.patch(
            "check_file_line_limits.subprocess.run",
            side_effect=OSError("missing git"),
        ):
            report = inspect_repository(Path(temporary))
        self.assertTrue(any("无法执行 Git" in item for item in report["errors"]), report)

    def test_json_cli_uses_zero_one_two_exit_contract(self) -> None:
        """JSON 入口分别用 0/1/2 表示通过、超限和运行错误。"""

        reports = (
            ({"ok": True, "errors": [], "reviewCandidates": [], "violations": []}, 0),
            ({"ok": False, "errors": [], "reviewCandidates": [], "violations": [{}]}, 1),
            ({"ok": False, "errors": ["failure"], "reviewCandidates": [], "violations": []}, 2),
        )
        for report, expected in reports:
            stdout = io.StringIO()
            stderr = io.StringIO()
            with self.subTest(expected=expected), mock.patch(
                "check_file_line_limits.inspect_repository",
                return_value=report,
            ), redirect_stdout(stdout), redirect_stderr(stderr):
                self.assertEqual(main(["--json"]), expected)
                self.assertEqual(json.loads(stdout.getvalue()), report)


if __name__ == "__main__":
    unittest.main()
