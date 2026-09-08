#!/usr/bin/env python3
"""读取、验证并原子写入 Git 分支链状态。"""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import tempfile
from datetime import datetime
from typing import Any


OID_PATTERN = re.compile(r"^[0-9a-f]{40}$")
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
FEATURE_PATTERN = re.compile(
    r"^feature-[a-z0-9]+(?:-[a-z0-9]+)*-(?:19|20)\d{6}$"
)
RELEASE_REVIEW_CHECKS = [
    "behavior-correctness",
    "core-adapter-boundary",
    "external-contracts",
    "responsibility-and-size",
    "temporary-markers",
]
EMPTY_STATE: dict[str, Any] = {
    "schemaVersion": 1,
    "activeChain": None,
    "lastClosedChain": None,
}


class StateError(RuntimeError):
    """表示状态文件缺失、损坏或不符合稳定 schema。"""


def validate_oid(value: object, field: str) -> str:
    """要求字段是 40 位小写 Git OID。"""

    if not isinstance(value, str) or not OID_PATTERN.fullmatch(value):
        raise StateError(f"{field} must be a 40-character lowercase Git OID")
    return value


def validate_feature_name(value: object, field: str = "branch") -> str:
    """要求分支名满足固定 feature ASCII kebab 与日期格式。"""

    if not isinstance(value, str) or not FEATURE_PATTERN.fullmatch(value):
        raise StateError(f"{field} does not match feature-<ascii-kebab>-<YYYYMMDD>")
    try:
        datetime.strptime(value[-8:], "%Y%m%d")
    except ValueError as error:
        raise StateError(f"{field} contains an invalid calendar date") from error
    return value


def validate_active_chain(value: object) -> dict[str, Any] | None:
    """验证活动链的 remote、基线与有序冻结父头。"""

    if value is None:
        return None
    required = {
        "remote",
        "defaultBranch",
        "defaultHead",
        "baseBranch",
        "baseHead",
        "activeLeaf",
        "phase",
        "entries",
    }
    if not isinstance(value, dict) or set(value) != required:
        raise StateError("activeChain fields are invalid")
    remote = value["remote"]
    default_branch = value["defaultBranch"]
    base_branch = value["baseBranch"]
    entries = value["entries"]
    if not isinstance(remote, str) or not remote or any(char.isspace() for char in remote):
        raise StateError("activeChain.remote is invalid")
    if not isinstance(default_branch, str) or not default_branch:
        raise StateError("activeChain.defaultBranch is invalid")
    if not isinstance(base_branch, str) or not base_branch:
        raise StateError("activeChain.baseBranch is invalid")
    if default_branch == "Release" or base_branch not in {"Release", default_branch}:
        raise StateError("activeChain.baseBranch must be Release or the non-Release default")
    if value["phase"] != "active":
        raise StateError("activeChain.phase must be active")
    default_head = validate_oid(value["defaultHead"], "activeChain.defaultHead")
    base_head = validate_oid(value["baseHead"], "activeChain.baseHead")
    if base_branch == default_branch and base_head != default_head:
        raise StateError("activeChain default-branch base must equal defaultHead")
    if not isinstance(entries, list) or not entries:
        raise StateError("activeChain.entries must be a non-empty list")
    normalized_entries: list[dict[str, str]] = []
    previous_name = base_branch
    seen: set[str] = set()
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict) or set(entry) != {"branch", "parent", "parentHead"}:
            raise StateError(f"activeChain.entries[{index}] fields are invalid")
        branch = validate_feature_name(entry["branch"], f"activeChain.entries[{index}].branch")
        if branch in seen:
            raise StateError("activeChain contains a duplicate branch")
        parent = entry["parent"]
        parent_head = validate_oid(
            entry["parentHead"], f"activeChain.entries[{index}].parentHead"
        )
        if parent != previous_name or (index == 0 and parent_head != base_head):
            raise StateError("activeChain is not a continuous frozen parent chain")
        normalized_entries.append(
            {"branch": branch, "parent": parent, "parentHead": parent_head}
        )
        seen.add(branch)
        previous_name = branch
    if value["activeLeaf"] != normalized_entries[-1]["branch"]:
        raise StateError("activeChain.activeLeaf must equal the final entry")
    return {
        "remote": remote,
        "defaultBranch": default_branch,
        "defaultHead": default_head,
        "baseBranch": base_branch,
        "baseHead": base_head,
        "activeLeaf": normalized_entries[-1]["branch"],
        "phase": "active",
        "entries": normalized_entries,
    }


def validate_public_review_text(value: object, field: str) -> str:
    """要求写入 Git 的审查说明是简短、单行且无控制字符的公开文本。"""

    if (
        not isinstance(value, str)
        or value != value.strip()
        or not value
        or len(value) > 500
        or any(ord(character) < 32 or ord(character) == 127 for character in value)
    ):
        raise StateError(f"{field} must be 1-500 trimmed printable characters")
    return value


def validate_release_review(value: object) -> dict[str, Any]:
    """验证随关闭提交原子封存的单次发布审查信封。"""

    required = {
        "selection",
        "status",
        "scopeBase",
        "sourceHead",
        "scopeDiffSha256",
        "reviewedSourceCommit",
        "checks",
        "evidenceSummary",
        "reason",
        "remainingRisk",
    }
    if not isinstance(value, dict) or set(value) != required:
        raise StateError("lastClosedChain.releaseReview fields are invalid")
    selection = value["selection"]
    if selection not in {"enabled", "disabled"}:
        raise StateError("lastClosedChain.releaseReview.selection is invalid")
    scope_base = validate_oid(
        value["scopeBase"], "lastClosedChain.releaseReview.scopeBase"
    )
    source_head = validate_oid(
        value["sourceHead"], "lastClosedChain.releaseReview.sourceHead"
    )
    scope_digest = value["scopeDiffSha256"]
    if not isinstance(scope_digest, str) or not SHA256_PATTERN.fullmatch(scope_digest):
        raise StateError(
            "lastClosedChain.releaseReview.scopeDiffSha256 must be lowercase SHA-256"
        )
    if selection == "enabled":
        if (
            value["status"] != "passed"
            or value["reviewedSourceCommit"] != source_head
            or value["checks"] != RELEASE_REVIEW_CHECKS
            or value["evidenceSummary"] is None
            or value["reason"] is not None
            or value["remainingRisk"] is not None
        ):
            raise StateError("enabled lastClosedChain.releaseReview is inconsistent")
        reviewed_source_commit: str | None = source_head
        checks = list(RELEASE_REVIEW_CHECKS)
        evidence_summary: str | None = validate_public_review_text(
            value["evidenceSummary"],
            "lastClosedChain.releaseReview.evidenceSummary",
        )
        reason: str | None = None
        remaining_risk: str | None = None
    else:
        if (
            value["status"] != "Not run"
            or value["reviewedSourceCommit"] is not None
            or value["checks"] != []
            or value["evidenceSummary"] is not None
        ):
            raise StateError("disabled lastClosedChain.releaseReview is inconsistent")
        reviewed_source_commit = None
        checks = []
        evidence_summary = None
        reason = validate_public_review_text(
            value["reason"], "lastClosedChain.releaseReview.reason"
        )
        remaining_risk = validate_public_review_text(
            value["remainingRisk"],
            "lastClosedChain.releaseReview.remainingRisk",
        )
    return {
        "selection": selection,
        "status": value["status"],
        "scopeBase": scope_base,
        "sourceHead": source_head,
        "scopeDiffSha256": scope_digest,
        "reviewedSourceCommit": reviewed_source_commit,
        "checks": checks,
        "evidenceSummary": evidence_summary,
        "reason": reason,
        "remainingRisk": remaining_risk,
    }


def validate_candidate_selections(value: object) -> dict[str, Any]:
    """验证关闭提交封存的性能与 macOS 签名候选选择。"""

    required = {
        "performanceSelection",
        "performanceSource",
        "performanceReason",
        "performanceRemainingRisk",
        "macosSigningSelection",
        "macosSigningSource",
        "macosSigningReason",
        "macosSigningRemainingRisk",
    }
    if not isinstance(value, dict) or set(value) != required:
        raise StateError("lastClosedChain.candidateSelections fields are invalid")

    performance_selection = value["performanceSelection"]
    performance_source = value["performanceSource"]
    if performance_selection == "not-applicable":
        if (
            performance_source != "not-applicable"
            or value["performanceReason"] is not None
            or value["performanceRemainingRisk"] is not None
        ):
            raise StateError("not-applicable performance selection is inconsistent")
        performance_reason: str | None = None
        performance_risk: str | None = None
    elif performance_selection == "enabled":
        if (
            performance_source
            not in {"requested", "product-required", "channel-required"}
            or value["performanceReason"] is not None
            or value["performanceRemainingRisk"] is not None
        ):
            raise StateError("enabled performance selection is inconsistent")
        performance_reason = None
        performance_risk = None
    elif performance_selection == "disabled":
        if performance_source not in {"requested", "not-requested"}:
            raise StateError("disabled performance selection source is invalid")
        performance_reason = validate_public_review_text(
            value["performanceReason"],
            "lastClosedChain.candidateSelections.performanceReason",
        )
        performance_risk = validate_public_review_text(
            value["performanceRemainingRisk"],
            "lastClosedChain.candidateSelections.performanceRemainingRisk",
        )
    else:
        raise StateError("performance selection is invalid")

    signing_selection = value["macosSigningSelection"]
    signing_source = value["macosSigningSource"]
    if signing_selection == "not-applicable":
        if (
            signing_source != "not-applicable"
            or value["macosSigningReason"] is not None
            or value["macosSigningRemainingRisk"] is not None
        ):
            raise StateError("not-applicable macOS signing selection is inconsistent")
        signing_reason: str | None = None
        signing_risk: str | None = None
    elif signing_selection == "enabled":
        if (
            signing_source not in {"configured", "requested", "channel-required"}
            or value["macosSigningReason"] is not None
            or value["macosSigningRemainingRisk"] is not None
        ):
            raise StateError("enabled macOS signing selection is inconsistent")
        signing_reason = None
        signing_risk = None
    elif signing_selection == "disabled":
        if signing_source != "not-requested":
            raise StateError("disabled macOS signing selection source is invalid")
        signing_reason = validate_public_review_text(
            value["macosSigningReason"],
            "lastClosedChain.candidateSelections.macosSigningReason",
        )
        signing_risk = validate_public_review_text(
            value["macosSigningRemainingRisk"],
            "lastClosedChain.candidateSelections.macosSigningRemainingRisk",
        )
    else:
        raise StateError("macOS signing selection is invalid")

    return {
        "performanceSelection": performance_selection,
        "performanceSource": performance_source,
        "performanceReason": performance_reason,
        "performanceRemainingRisk": performance_risk,
        "macosSigningSelection": signing_selection,
        "macosSigningSource": signing_source,
        "macosSigningReason": signing_reason,
        "macosSigningRemainingRisk": signing_risk,
    }


def validate_closed_chain(value: object) -> dict[str, Any] | None:
    """验证最近关闭链及远端清理重试所需的比较值。"""

    if value is None:
        return None
    required = {
        "remote",
        "baseBranch",
        "baseHead",
        "defaultBranch",
        "defaultHead",
        "releaseHeadBefore",
        "closingHead",
        "entries",
    }
    extensions = {"releaseReview", "candidateSelections"}
    direct_release_extension = {"releaseTarget"}
    allowed_fields = (
        required,
        required | extensions,
        required | extensions | direct_release_extension,
    )
    if not isinstance(value, dict) or set(value) not in allowed_fields:
        raise StateError("lastClosedChain fields are invalid")
    remote = value["remote"]
    default_branch = value["defaultBranch"]
    base_branch = value["baseBranch"]
    entries = value["entries"]
    if not isinstance(remote, str) or not remote or any(char.isspace() for char in remote):
        raise StateError("lastClosedChain.remote is invalid")
    if not isinstance(default_branch, str) or not default_branch:
        raise StateError("lastClosedChain.defaultBranch is invalid")
    if not isinstance(base_branch, str) or not base_branch:
        raise StateError("lastClosedChain.baseBranch is invalid")
    if value["closingHead"] is not None:
        raise StateError("lastClosedChain.closingHead must be null to avoid a self-referential OID")
    base_head = validate_oid(value["baseHead"], "lastClosedChain.baseHead")
    default_head = validate_oid(value["defaultHead"], "lastClosedChain.defaultHead")
    release_head_before = value["releaseHeadBefore"]
    if release_head_before is not None:
        release_head_before = validate_oid(
            release_head_before, "lastClosedChain.releaseHeadBefore"
        )
    if default_branch == "Release" or base_branch not in {"Release", default_branch}:
        raise StateError("lastClosedChain.baseBranch is invalid")
    if base_branch == default_branch and base_head != default_head:
        raise StateError("lastClosedChain default-branch base must equal defaultHead")
    if (base_branch == "Release" and release_head_before != base_head) or (
        base_branch == default_branch and release_head_before is not None
    ):
        raise StateError("lastClosedChain Release base and prior head are inconsistent")
    if not isinstance(entries, list) or not entries:
        raise StateError("lastClosedChain.entries must be a non-empty list")
    normalized_entries: list[dict[str, str]] = []
    seen: set[str] = set()
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict) or set(entry) != {"branch", "preCloseHead"}:
            raise StateError(f"lastClosedChain.entries[{index}] fields are invalid")
        branch = validate_feature_name(entry["branch"], f"lastClosedChain.entries[{index}].branch")
        if branch in seen:
            raise StateError("lastClosedChain contains a duplicate branch")
        normalized_entries.append(
            {
                "branch": branch,
                "preCloseHead": validate_oid(
                    entry["preCloseHead"],
                    f"lastClosedChain.entries[{index}].preCloseHead",
                ),
            }
        )
        seen.add(branch)
    normalized: dict[str, Any] = {
        "remote": remote,
        "baseBranch": base_branch,
        "baseHead": base_head,
        "defaultBranch": default_branch,
        "defaultHead": default_head,
        "releaseHeadBefore": release_head_before,
        "closingHead": None,
        "entries": normalized_entries,
    }
    if "releaseReview" in value:
        release_review = validate_release_review(value["releaseReview"])
        if release_review["scopeBase"] != base_head:
            raise StateError(
                "lastClosedChain.releaseReview.scopeBase must equal lastClosedChain.baseHead"
            )
        normalized["releaseReview"] = release_review
        normalized["candidateSelections"] = validate_candidate_selections(
            value["candidateSelections"]
        )
    if "releaseTarget" in value:
        if value["releaseTarget"] != "default":
            raise StateError("lastClosedChain.releaseTarget must be default")
        normalized["releaseTarget"] = "default"
    return normalized


def validate_state(value: object) -> dict[str, Any]:
    """把 JSON 值验证并规范化为 schemaVersion 1 状态。"""

    if not isinstance(value, dict) or set(value) != {
        "schemaVersion",
        "activeChain",
        "lastClosedChain",
    }:
        raise StateError("branch-chain state fields are invalid")
    if value["schemaVersion"] != 1:
        raise StateError("branch-chain schemaVersion must be 1")
    active = validate_active_chain(value["activeChain"])
    closed = validate_closed_chain(value["lastClosedChain"])
    return {"schemaVersion": 1, "activeChain": active, "lastClosedChain": closed}


def state_path(root: Path) -> Path:
    """返回项目内固定状态路径。"""

    return root / ".harness" / "git-branch-chain.json"


def read_state(root: Path, *, allow_missing: bool = False) -> dict[str, Any]:
    """读取普通非符号链接状态文件；仅 start 可允许缺失。"""

    path = state_path(root)
    directory = path.parent
    if directory.is_symlink() or (directory.exists() and not directory.is_dir()):
        raise StateError(".harness must be a regular directory")
    if path.is_symlink():
        raise StateError("branch-chain state must be a regular non-symbolic-link file")
    if not path.exists():
        if allow_missing:
            return json.loads(json.dumps(EMPTY_STATE))
        raise StateError(".harness/git-branch-chain.json is missing")
    if not path.is_file():
        raise StateError("branch-chain state must be a regular non-symbolic-link file")
    try:
        return validate_state(json.loads(path.read_text(encoding="utf-8")))
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise StateError("branch-chain state is not valid UTF-8 JSON") from error


def discover_closed_retry_state(
    root: Path, *, release_target: str
) -> dict[str, Any] | None:
    """从唯一仍存在且目标匹配的关闭叶提交恢复本地收尾状态。"""

    from branch_chain_git import run_git

    if release_target not in {"default", "legacy"}:
        raise StateError("closed-chain discovery target is invalid")

    listing = run_git(
        root,
        ["for-each-ref", "--format=%(refname:short)%00%(objectname)", "refs/heads"],
    )
    candidates: list[dict[str, Any]] = []
    for line in listing.stdout.splitlines():
        fields = line.split("\0")
        if len(fields) != 2:
            raise StateError("local branch listing is malformed")
        branch, head = fields
        if not FEATURE_PATTERN.fullmatch(branch):
            continue
        if not OID_PATTERN.fullmatch(head):
            raise StateError("local feature branch OID is malformed")
        blob = run_git(
            root,
            ["show", f"{head}:.harness/git-branch-chain.json"],
            check=False,
            text=False,
        )
        if blob.returncode != 0:
            continue
        try:
            candidate = validate_state(json.loads(blob.stdout.decode("utf-8")))
        except (json.JSONDecodeError, UnicodeDecodeError, StateError):
            continue
        closed = candidate["lastClosedChain"]
        if (
            candidate["activeChain"] is None
            and closed is not None
            and closed["entries"][-1]["branch"] == branch
            and (
                "default" if closed.get("releaseTarget") == "default" else "legacy"
            )
            == release_target
        ):
            candidates.append(candidate)
    if len(candidates) > 1:
        raise StateError("multiple local closed-chain retry candidates exist")
    return candidates[0] if candidates else None


def write_state(root: Path, value: dict[str, Any]) -> bytes:
    """原子写入已验证状态，并返回供提交后逐字节复核的规范载荷。"""

    normalized = validate_state(value)
    path = state_path(root)
    directory = path.parent
    if directory.exists() and (directory.is_symlink() or not directory.is_dir()):
        raise StateError(".harness must be a regular directory")
    if path.is_symlink():
        raise StateError("branch-chain state must be a regular non-symbolic-link file")
    directory.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(normalized, ensure_ascii=False, indent=2) + "\n"
    expected_payload = payload.encode("utf-8")
    temporary_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="\n",
            dir=directory,
            prefix=".git-branch-chain.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temporary_name = handle.name
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_name, path)
        temporary_name = None
    finally:
        if temporary_name is not None:
            Path(temporary_name).unlink(missing_ok=True)
    return expected_payload
