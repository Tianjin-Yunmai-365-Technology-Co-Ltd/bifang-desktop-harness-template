#!/usr/bin/env python3
"""离线验证原生矩阵检出的 closing commit，并封存候选清单输入。"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from typing import Any


OID_PATTERN = re.compile(r"[0-9a-f]{40}")
SHA256_PATTERN = re.compile(r"[0-9a-f]{64}")
STATE_RELATIVE_PATH = ".harness/git-branch-chain.json"
BRANCH_CHAIN_SCRIPTS = (
    Path(".agents") / "skills" / "desktop-manage-git-branch-chain" / "scripts"
)


class EnvelopeError(RuntimeError):
    """表示候选提交不能离线证明为完整的原子关闭状态。"""


def run_git(root: Path, arguments: list[str], *, check: bool = True) -> bytes:
    """运行不需要网络或凭据的 Git 读取命令。"""

    result = subprocess.run(
        ["git", "-C", str(root), *arguments],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if check and result.returncode != 0:
        raise EnvelopeError(
            f"git {' '.join(arguments)} failed: "
            f"{result.stderr.decode('utf-8', 'replace').strip()}"
        )
    return result.stdout


def resolve_ref(root: Path, reference: str, *, missing_ok: bool = False) -> str | None:
    """读取一个本地或 remote-tracking ref 的精确 OID。"""

    result = subprocess.run(
        ["git", "-C", str(root), "show-ref", "--verify", "--hash", reference],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        if missing_ok:
            return None
        raise EnvelopeError(f"missing required fetched ref: {reference}")
    oid = result.stdout.strip()
    if not OID_PATTERN.fullmatch(oid):
        raise EnvelopeError(f"fetched ref has an invalid OID: {reference}")
    return oid


def load_branch_chain_modules(root: Path) -> tuple[Any, Any, Any, Any]:
    """从被检出提交加载受维护的 schema 与纯离线 Git 图门禁。"""

    scripts = root / BRANCH_CHAIN_SCRIPTS
    if scripts.is_symlink() or not scripts.is_dir():
        raise EnvelopeError("branch-chain scripts directory is missing or symbolic")
    sys.path.insert(0, str(scripts))
    try:
        from branch_chain_git import require_clean, require_closed_history
        from branch_chain_operations import require_release_review_repository
        from branch_chain_state import read_state
    except ImportError as error:
        raise EnvelopeError("cannot load the protected branch-chain validators") from error
    return (read_state, require_closed_history, require_release_review_repository, require_clean)


def calculate_snapshot(
    root: Path,
    source_commit: str,
    expected_state_sha256: str,
    repository_default_branch: str,
) -> dict[str, Any]:
    """证明 fresh full-fetch 快照与 closing commit、状态字节和双信封一致。"""

    if not OID_PATTERN.fullmatch(source_commit):
        raise EnvelopeError("source_commit must be a lowercase 40-character OID")
    if not SHA256_PATTERN.fullmatch(expected_state_sha256):
        raise EnvelopeError("branch_chain_state_sha256 must be lowercase SHA-256")
    if repository_default_branch not in {"main", "master"}:
        raise EnvelopeError("repository default branch must be main or master")

    git_root = Path(
        run_git(root, ["rev-parse", "--show-toplevel"]).decode("utf-8").strip()
    ).resolve()
    if git_root != root:
        raise EnvelopeError("project root must be the independent Git top level")
    head = run_git(root, ["rev-parse", "--verify", "HEAD^{commit}"]).decode().strip()
    branch = run_git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]).decode().strip()
    if head != source_commit or branch != repository_default_branch:
        raise EnvelopeError(
            "runner must check out the named repository default branch at source_commit"
        )

    read_state, require_closed_history, require_release_review_repository, require_clean = (
        load_branch_chain_modules(root)
    )
    try:
        require_clean(root)
    except Exception as error:
        raise EnvelopeError("runner worktree must remain clean") from error

    state_path = root / STATE_RELATIVE_PATH
    if state_path.is_symlink() or not state_path.is_file():
        raise EnvelopeError("protected branch-chain state must be a regular file")
    committed_state_bytes = run_git(
        root, ["show", f"{source_commit}:{STATE_RELATIVE_PATH}"]
    )
    committed_blob_oid = run_git(
        root, ["rev-parse", f"{source_commit}:{STATE_RELATIVE_PATH}"]
    ).decode().strip()
    worktree_blob_oid = run_git(
        root, ["hash-object", f"--path={STATE_RELATIVE_PATH}", str(state_path)]
    ).decode().strip()
    if committed_blob_oid != worktree_blob_oid:
        raise EnvelopeError("protected state bytes do not match source_commit")
    state_sha256 = hashlib.sha256(committed_state_bytes).hexdigest()
    if state_sha256 != expected_state_sha256:
        raise EnvelopeError("protected state digest does not match the host-verified input")

    try:
        state = read_state(root)
    except Exception as error:
        raise EnvelopeError("protected branch-chain state failed schema validation") from error
    closed = state["lastClosedChain"]
    if state["activeChain"] is not None or closed is None:
        raise EnvelopeError("candidate source must contain one completed closed chain")
    if "releaseReview" not in closed or "candidateSelections" not in closed:
        raise EnvelopeError("legacy closing state without both sealed envelopes is forbidden")
    if closed.get("releaseTarget") != "default":
        raise EnvelopeError("closing state does not target the repository default branch")
    if closed["defaultBranch"] != repository_default_branch:
        raise EnvelopeError("GitHub default branch differs from the protected closing state")

    default_ref = f"refs/remotes/origin/{repository_default_branch}"
    if resolve_ref(root, default_ref) != source_commit:
        raise EnvelopeError("fresh origin default branch does not equal source_commit")
    if resolve_ref(root, "refs/remotes/origin/Release", missing_ok=True) is not None:
        raise EnvelopeError("legacy origin/Release must be absent for a direct-default release")
    for entry in closed["entries"]:
        feature_ref = f"refs/remotes/origin/{entry['branch']}"
        if resolve_ref(root, feature_ref, missing_ok=True) is not None:
            raise EnvelopeError("registered remote feature ref still exists in the fresh snapshot")

    try:
        require_closed_history(
            root,
            closed["baseHead"],
            [entry["preCloseHead"] for entry in closed["entries"]],
            source_commit,
        )
        require_release_review_repository(root, closed)
    except Exception as error:
        raise EnvelopeError("closing history or sealed review scope failed verification") from error

    selections = closed["candidateSelections"]
    expected_cli_selections = {
        "performanceSelection": "not-applicable",
        "performanceSource": "not-applicable",
        "performanceReason": None,
        "performanceRemainingRisk": None,
        "macosSigningSelection": "not-applicable",
        "macosSigningSource": "not-applicable",
        "macosSigningReason": None,
        "macosSigningRemainingRisk": None,
    }
    if selections != expected_cli_selections:
        raise EnvelopeError("Rust CLI candidate selections must be exactly not-applicable")

    return {
        "sourceCommit": source_commit,
        "branchChainStateSha256": state_sha256,
        "releaseTarget": closed["releaseTarget"],
        "defaultBranch": repository_default_branch,
        "releaseReview": closed["releaseReview"],
        "candidateSelections": selections,
    }


def read_snapshot(path: Path) -> dict[str, Any]:
    """读取先前捕获的普通 JSON 快照。"""

    if path.is_symlink() or not path.is_file():
        raise EnvelopeError("release envelope snapshot must be a regular file")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise EnvelopeError("release envelope snapshot is invalid") from error
    if not isinstance(value, dict):
        raise EnvelopeError("release envelope snapshot must be an object")
    return value


def write_snapshot(path: Path, value: dict[str, Any], root: Path) -> None:
    """在仓库外同目录原子写入规范快照，避免污染 clean 源码。"""

    resolved_parent = path.parent.resolve()
    if path.exists() or path.is_symlink():
        raise EnvelopeError("release envelope snapshot already exists")
    try:
        resolved_parent.relative_to(root)
    except ValueError:
        pass
    else:
        raise EnvelopeError("release envelope snapshot must be outside the repository")
    payload = json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n"
    temporary: Path | None = None
    try:
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{path.name}.", suffix=".tmp", dir=resolved_parent
        )
        temporary = Path(temporary_name)
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as output:
            output.write(payload)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def parse_arguments() -> argparse.Namespace:
    """解析 capture/verify 的同一组不可变绑定参数。"""

    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("capture", "verify"))
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--expected-state-sha256", required=True)
    parser.add_argument("--repository-default-branch", required=True)
    parser.add_argument("--snapshot", required=True)
    return parser.parse_args()


def main() -> int:
    """捕获首次快照，或在写 manifest 前重新计算并逐字段比较。"""

    arguments = parse_arguments()
    root = Path(arguments.project_root).resolve()
    snapshot_path = Path(arguments.snapshot)
    calculated = calculate_snapshot(
        root,
        arguments.source_commit,
        arguments.expected_state_sha256,
        arguments.repository_default_branch,
    )
    if arguments.mode == "capture":
        write_snapshot(snapshot_path, calculated, root)
    elif read_snapshot(snapshot_path) != calculated:
        raise EnvelopeError("release envelope changed between build gates")
    print(
        json.dumps(
            {
                "status": f"release-envelope-{arguments.mode}d",
                "sourceCommit": calculated["sourceCommit"],
                "branchChainStateSha256": calculated["branchChainStateSha256"],
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except EnvelopeError as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
