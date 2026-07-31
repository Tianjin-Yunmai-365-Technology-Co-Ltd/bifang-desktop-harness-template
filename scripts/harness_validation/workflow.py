"""校验跨平台里程碑候选 workflow 的完整性、安全边界与打包顺序。"""

from __future__ import annotations

import hashlib
from pathlib import Path
import re

from .context import WORKFLOW, display_path, fail


CHECKOUT_USE = (
    "actions/checkout@11d5960a326750d5838078e36cf38b85af677262"
)
UPLOAD_USE = (
    "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02"
)
EXPECTED_WORKFLOW_SHA256 = (
    "8457d75d6e1f3664ab6d5e1cadf81c6dadceed0a630688f685a86c5554213a39"
)
EXPECTED_INPUTS = {"confirm_candidate_build", "version"}
EXPECTED_NAMED_STEPS = (
    "Confirm authorized candidate preflight",
    "Select project MSRV",
    "Validate candidate version",
    "Verify candidate",
    "Package Unix candidate",
    "Package Windows candidate",
    "Record candidate manifest",
)
EXPECTED_ACTION_STEPS = (CHECKOUT_USE, UPLOAD_USE)


def validate_workflow(errors: list[str], workflow: Path = WORKFLOW) -> None:
    """确认 workflow 是受审模板，只构建 pending 候选且不执行产品验收。"""

    if not workflow.is_file():
        fail(errors, f"missing workflow asset: {display_path(workflow)}")
        return
    try:
        payload = workflow.read_bytes()
        text = payload.decode("utf-8")
    except (OSError, UnicodeDecodeError) as error:
        fail(errors, f"cannot read workflow asset {display_path(workflow)}: {error}")
        return

    observed_digest = hashlib.sha256(payload).hexdigest()
    if observed_digest != EXPECTED_WORKFLOW_SHA256:
        fail(
            errors,
            "workflow asset differs from the fully reviewed candidate template: "
            f"expected {EXPECTED_WORKFLOW_SHA256}, got {observed_digest}",
        )

    lines = text.splitlines()
    semantic_lines = [
        "" if line.lstrip().startswith("#") else line
        for line in lines
    ]
    semantic_text = "\n".join(semantic_lines)

    def first_line_index(fragment: str) -> int:
        """返回活动 YAML 首个片段所在行；缺失时返回 -1。"""

        return next(
            (
                index
                for index, line in enumerate(semantic_lines)
                if fragment in line
            ),
            -1,
        )

    required_fragments = (
        "workflow_dispatch:",
        "fail-fast: true",
        "os: [ubuntu-latest, macos-latest, windows-latest]",
        "contents: read",
        "rustup toolchain install 1.90.0",
        "--component rustfmt",
        "--component clippy",
        '"cargo", "metadata", "--locked"',
        "no tests discovered",
        "cargo test --workspace --all-targets --all-features --locked",
        "cargo build --workspace --release --locked",
        CHECKOUT_USE,
        UPLOAD_USE,
        '"sourceCommit"',
        '"sha256"',
        '"milestoneAcceptance": "pending"',
    )
    for fragment in required_fragments:
        if fragment not in semantic_text:
            fail(errors, f"workflow candidate gate missing: {fragment}")

    forbidden_fragments = (
        "contents: write",
        "cargo publish",
        "gh release create",
        "git tag",
        "actions/create-release",
        "confirm_release:",
        "run_e2e:",
        "e2e_command",
        "E2E_COMMAND",
        "Smoke candidate",
        "smoke test",
        "Optional heavy checks",
        "HEAVY_CHECK",
        '"smoke"',
        '"heavyChecks"',
        '"milestoneAcceptance": "accepted"',
        "fail-fast: false",
    )
    for fragment in forbidden_fragments:
        if fragment in semantic_text:
            fail(errors, f"workflow contains forbidden candidate behavior: {fragment}")

    input_keys: set[str] = set()
    inputs_index = next(
        (
            index
            for index, line in enumerate(semantic_lines)
            if line == "    inputs:"
        ),
        -1,
    )
    if inputs_index == -1:
        fail(errors, "workflow_dispatch inputs block is missing")
    else:
        for line in semantic_lines[inputs_index + 1 :]:
            if line.strip() and len(line) - len(line.lstrip()) <= 4:
                break
            match = re.fullmatch(r" {6}([A-Za-z0-9_-]+):", line)
            if match:
                input_keys.add(match.group(1))
        if input_keys != EXPECTED_INPUTS:
            fail(
                errors,
                "workflow_dispatch inputs must be exactly "
                f"{sorted(EXPECTED_INPUTS)}, got {sorted(input_keys)}",
            )

    named_steps = tuple(
        match.group(1)
        for line in semantic_lines
        if (match := re.fullmatch(r" {6}- name: (.+)", line))
    )
    action_steps = tuple(
        match.group(1)
        for line in semantic_lines
        if (
            match := re.fullmatch(
                r" {6}- uses: (\S+)(?:\s+#\s*.+)?",
                line,
            )
        )
    )
    if named_steps != EXPECTED_NAMED_STEPS:
        fail(
            errors,
            "workflow named-step allowlist mismatch: "
            f"expected={EXPECTED_NAMED_STEPS}, got={named_steps}",
        )
    if action_steps != EXPECTED_ACTION_STEPS:
        fail(
            errors,
            "workflow action-step allowlist mismatch: "
            f"expected={EXPECTED_ACTION_STEPS}, got={action_steps}",
        )
    for action in action_steps:
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+@[0-9a-f]{40}", action):
            fail(errors, f"workflow action is not pinned to a full commit SHA: {action}")

    preflight_idx = first_line_index("Confirm authorized candidate preflight")
    checkout_idx = first_line_index(CHECKOUT_USE)
    toolchain_idx = first_line_index("Select project MSRV")
    if preflight_idx == -1 or checkout_idx == -1 or toolchain_idx == -1:
        fail(errors, "workflow missing required candidate preflight/checkout/toolchain steps")
    elif not (preflight_idx < checkout_idx < toolchain_idx):
        fail(errors, "candidate preflight must run before checkout and MSRV setup")

    def step_block(name: str = "", *, uses: str = "") -> list[str]:
        """按步骤缩进提取一个命名步骤或固定 SHA action 步骤。"""

        expected = f"- uses: {uses}" if uses else f"- name: {name}"
        start = next(
            (
                index
                for index, line in enumerate(semantic_lines)
                if line.strip().startswith(expected)
            ),
            -1,
        )
        if start == -1:
            return []
        base_indent = len(semantic_lines[start]) - len(
            semantic_lines[start].lstrip()
        )
        end = start + 1
        while end < len(semantic_lines):
            line = semantic_lines[end]
            indent = len(line) - len(line.lstrip())
            if line.strip() and indent <= base_indent:
                break
            end += 1
        return semantic_lines[start:end]

    verify_idx = first_line_index("- name: Verify candidate")
    package_indices = (
        first_line_index("- name: Package Unix candidate"),
        first_line_index("- name: Package Windows candidate"),
    )
    manifest_idx = first_line_index("- name: Record candidate manifest")
    upload_idx = first_line_index(UPLOAD_USE)
    if (
        verify_idx == -1
        or any(index == -1 for index in package_indices)
        or manifest_idx == -1
        or upload_idx == -1
    ):
        fail(errors, "workflow missing verify/package/manifest/upload boundary")
    elif not (
        verify_idx
        < min(package_indices)
        <= max(package_indices)
        < manifest_idx
        < upload_idx
    ):
        fail(
            errors,
            "candidate workflow must verify, package, record a pending manifest, then upload",
        )

    verify_block = "\n".join(step_block("Verify candidate"))
    for command in (
        "cargo test --workspace --all-targets --all-features --locked",
        "cargo build --workspace --release --locked",
    ):
        if command not in verify_block:
            fail(errors, f"workflow Verify candidate step missing active command: {command}")

    manifest_block = "\n".join(step_block("Record candidate manifest"))
    if '"milestoneAcceptance": "pending"' not in manifest_block:
        fail(errors, "workflow manifest step must actively record pending acceptance")

    expected_guards = {
        "Package Unix candidate": "if: runner.os != 'Windows' && success()",
        "Package Windows candidate": "if: runner.os == 'Windows' && success()",
    }
    for name, expected_guard in expected_guards.items():
        block = step_block(name)
        if not block:
            fail(errors, f"workflow {name} step not found")
        elif expected_guard not in {line.strip() for line in block}:
            fail(errors, f"workflow {name} must use exact guard: {expected_guard}")

    upload_block = step_block(uses=UPLOAD_USE)
    if not upload_block:
        fail(errors, "workflow upload step not found")
    elif "if: success()" not in {line.strip() for line in upload_block}:
        fail(errors, "workflow upload step must use exact if: success() guard")
