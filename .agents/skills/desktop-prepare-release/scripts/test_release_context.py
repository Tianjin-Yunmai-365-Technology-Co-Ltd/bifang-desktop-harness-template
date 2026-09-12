#!/usr/bin/env python3
"""Regression tests for the tracked release-context helper."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("release_context.py")


class ReleaseContextTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name) / "project"
        self.remote = Path(self.temporary.name) / "remote.git"
        self.root.mkdir()
        self.env = os.environ.copy()
        self.env.update(
            {
                "GIT_CONFIG_GLOBAL": str(Path(self.temporary.name) / "global.gitconfig"),
                "GIT_CONFIG_NOSYSTEM": "1",
                "GIT_TERMINAL_PROMPT": "0",
                "GCM_INTERACTIVE": "Never",
            }
        )
        subprocess.run(
            ["git", "init", "--quiet", "--bare", str(self.remote)],
            check=True,
            env=self.env,
        )
        self.git("init", "--quiet", "--initial-branch=main")
        self.git("config", "--local", "user.name", "Release Context Test")
        self.git("config", "--local", "user.email", "release-context@example.com")
        (self.root / "README.md").write_text("baseline\n", encoding="utf-8")
        self.git("add", "README.md")
        self.git("commit", "--quiet", "-m", "chore: baseline")
        self.baseline = self.git("rev-parse", "HEAD").stdout.strip()
        subprocess.run(
            ["git", "-C", str(self.remote), "symbolic-ref", "HEAD", "refs/heads/main"],
            check=True,
            env=self.env,
        )
        self.git("remote", "add", "origin", str(self.remote))
        self.git("push", "--quiet", "-u", "origin", "main")
        self.git("switch", "--quiet", "-c", "feature-release-context-20260909")
        (self.root / "source.txt").write_text("ready\n", encoding="utf-8")
        self.git("add", "source.txt")
        self.git("commit", "--quiet", "-m", "feat: prepare source")
        self.source_head = self.git("rev-parse", "HEAD").stdout.strip()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def git(self, *arguments: str, check: bool = True) -> subprocess.CompletedProcess[str]:
        result = subprocess.run(
            ["git", "-C", str(self.root), *arguments],
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            env=self.env,
        )
        if check:
            self.assertEqual(result.returncode, 0, result.stderr)
        return result

    def run_script(self, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT), *arguments],
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            env=self.env,
        )

    def write_context(self, *extra: str) -> subprocess.CompletedProcess[str]:
        arguments = [
            "write",
            "--project-root",
            str(self.root),
            "--source-head",
            self.source_head,
            "--version",
            "1.2.3",
            "--release-date",
            "2026-09-09",
            "--remote",
            "origin",
            "--review-selection",
            "disabled",
            "--scope-base",
            self.baseline,
            "--scope-diff-sha256",
            "0" * 64,
            "--review-reason",
            "Optional semantic review was not requested.",
            "--review-remaining-risk",
            "Semantic issues outside required checks may remain.",
            "--performance-selection",
            "not-applicable",
            "--performance-source",
            "not-applicable",
            "--macos-signing-selection",
            "not-applicable",
            "--macos-signing-source",
            "not-applicable",
            *extra,
        ]
        return self.run_script(*arguments)

    def commit_publish_and_tag(self) -> tuple[str, str]:
        written = self.write_context()
        self.assertEqual(written.returncode, 0, written.stderr)
        digest = json.loads(written.stdout)["releaseContextSha256"]
        self.git("add", ".harness/release-context.json")
        self.git("commit", "--quiet", "-m", "chore(release): record release context")
        self.git("switch", "--quiet", "main")
        self.git("merge", "--quiet", "--no-edit", "feature-release-context-20260909")
        head = self.git("rev-parse", "HEAD").stdout.strip()
        self.git("push", "--quiet", "origin", "main")
        self.git("tag", "v1.2.3-20260909")
        self.git("push", "--quiet", "origin", "refs/tags/v1.2.3-20260909")
        return head, digest

    def test_write_derives_tag_and_canonical_context(self) -> None:
        result = self.write_context()
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["expectedTag"], "v1.2.3-20260909")
        check = self.run_script(
            "check",
            "--project-root",
            str(self.root),
            "--expected-version",
            "1.2.3",
            "--expected-sha256",
            payload["releaseContextSha256"],
        )
        self.assertEqual(check.returncode, 0, check.stderr)
        context = json.loads((self.root / ".harness/release-context.json").read_text())
        self.assertEqual(context["sourceHead"], self.source_head)
        self.assertEqual(context["defaultBranch"], "main")

    def test_write_rejects_source_head_that_is_not_current_head(self) -> None:
        (self.root / "drift.txt").write_text("later change\n", encoding="utf-8")
        self.git("add", "drift.txt")
        self.git("commit", "--quiet", "-m", "chore: drift after source review")

        result = self.write_context()

        self.assertEqual(result.returncode, 1)
        self.assertIn("sourceHead must equal the current HEAD before metadata commit", result.stderr)
        self.assertFalse((self.root / ".harness/release-context.json").exists())

    def test_verify_requires_clean_pushed_main_and_remote_tag(self) -> None:
        head, digest = self.commit_publish_and_tag()
        result = self.run_script(
            "verify",
            "--project-root",
            str(self.root),
            "--expected-head",
            head,
            "--expected-sha256",
            digest,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["sourceCommit"], head)
        self.assertEqual(payload["expectedTag"], "v1.2.3-20260909")

    def test_verify_rejects_missing_remote_tag(self) -> None:
        result = self.write_context()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.git("add", ".harness/release-context.json")
        self.git("commit", "--quiet", "-m", "chore(release): record release context")
        self.git("switch", "--quiet", "main")
        self.git("merge", "--quiet", "--no-edit", "feature-release-context-20260909")
        self.git("push", "--quiet", "origin", "main")
        verified = self.run_script("verify", "--project-root", str(self.root))
        self.assertEqual(verified.returncode, 1)
        self.assertIn("remote ref is missing", verified.stderr)

    def test_verify_rejects_dirty_or_untracked_context_bytes(self) -> None:
        _head, _digest = self.commit_publish_and_tag()
        (self.root / ".harness/release-context.json").write_text("{}\n", encoding="utf-8")
        result = self.run_script("verify", "--project-root", str(self.root))
        self.assertEqual(result.returncode, 1)
        self.assertIn("fields or schemaVersion", result.stderr)

    def test_write_rejects_inconsistent_disabled_selection(self) -> None:
        result = self.write_context(
            "--performance-selection",
            "disabled",
            "--performance-source",
            "not-requested",
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("performanceReason", result.stderr)


if __name__ == "__main__":
    unittest.main()
