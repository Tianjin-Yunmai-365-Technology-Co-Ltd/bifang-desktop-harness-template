"""校验候选发布 workflow 的安全、验收与打包顺序契约。"""

from __future__ import annotations

from pathlib import Path

from .context import WORKFLOW, display_path, fail

def validate_workflow(errors: list[str], workflow: Path = WORKFLOW) -> None:
    """确认候选 workflow 保留三平台、手动验收和打包前阻断门禁。"""
    if not workflow.is_file():
        fail(errors, f"missing workflow asset: {display_path(workflow)}")
        return
    text = workflow.read_text(encoding="utf-8")
    lines = text.splitlines()

    def first_line_index(fragment: str) -> int:
        """返回首个片段所在行；缺失时用 -1 参与稳定的顺序检查。"""
        return next(
            (index for index, line in enumerate(lines) if fragment in line),
            -1,
        )

    required_fragments = (
        "workflow_dispatch:",
        "confirm_release:",
        "run_e2e:",
        "fail-fast: true",
        "os: [ubuntu-latest, macos-latest, windows-latest]",
        "contents: read",
        "rustup toolchain install 1.90.0",
        "--component rustfmt",
        "--component clippy",
        '"cargo", "metadata", "--locked"',
        "no tests discovered",
        "timeout=30",
        "cargo build --workspace --release --locked",
        "actions/upload-artifact@v4",
        '"sourceCommit"',
        '"sha256"',
        "status=passed",
        "status=not_run",
        "Validate heavy-check decision",
        "steps.heavy-checks-decision.outputs.status",
        "HEAVY_CHECK_PATH: .github/scripts/release-candidate-heavy-check.sh",
    )
    for fragment in required_fragments:
        if fragment not in text:
            fail(errors, f"workflow gate missing: {fragment}")

    forbidden_publishing_fragments = (
        "contents: write",
        "cargo publish",
        "gh release create",
        "git tag",
        "actions/create-release",
    )
    for fragment in forbidden_publishing_fragments:
        if fragment in text:
            fail(errors, f"workflow contains unauthorized publishing behavior: {fragment}")

    forbidden_gate_fragments = (
        "e2e_command",
        "E2E_COMMAND",
        "status=selected",
        '"selected"',
        "fail-fast: false",
    )
    for fragment in forbidden_gate_fragments:
        if fragment in text:
            fail(errors, f"workflow contains unsafe release-gate behavior: {fragment}")

    if "Validate heavy-check decision" not in text:
        fail(errors, "workflow missing heavy-check decision gate step")

    preflight_idx = first_line_index("Confirm authorized release preflight")
    checkout_idx = first_line_index("actions/checkout@v4")
    toolchain_idx = first_line_index("Select project MSRV")
    if preflight_idx == -1 or checkout_idx == -1 or toolchain_idx == -1:
        fail(errors, "workflow missing required preflight/checkout/toolchain steps")
    elif not (preflight_idx < checkout_idx < toolchain_idx):
        fail(errors, "release preflight must run before checkout and MSRV setup")

    heavy_idx = first_line_index("- name: Optional heavy checks")
    decision_idx = first_line_index("- name: Validate heavy-check decision")
    package_indices = tuple(
        idx
        for idx in (
            first_line_index("- name: Package Unix candidate"),
            first_line_index("- name: Package Windows candidate"),
        )
        if idx != -1
    )
    package_idx = min(package_indices) if package_indices else -1
    if heavy_idx == -1 or decision_idx == -1 or package_idx == -1:
        fail(errors, "workflow missing heavy-check gate, decision, or package boundary")
    elif not (heavy_idx < decision_idx < package_idx):
        fail(errors, "heavy-check decision gate must be placed between heavy checks and package")

    if (
        "- name: Optional heavy checks" in text
        and "HEAVY_CHECK_PATH: .github/scripts/release-candidate-heavy-check.sh" not in text
    ):
        fail(errors, "workflow heavy checks must call approved heavy-check script")

    def _step_block(name: str, *, uses: str | None = None) -> list[str]:
        """按 YAML 缩进提取一个命名步骤或 action 步骤，供局部门禁检查。"""
        if uses:
            for index, line in enumerate(lines):
                if line.strip() == f"- uses: {uses}":
                    start = index
                    break
            else:
                return []
        else:
            for index, line in enumerate(lines):
                if line.strip() == f"- name: {name}":
                    start = index
                    break
            else:
                return []

        base_indent = len(lines[start]) - len(lines[start].lstrip())
        next_index = start + 1
        while next_index < len(lines):
            line = lines[next_index]
            indent = len(line) - len(line.lstrip())
            if line.strip() == "":
                next_index += 1
                continue
            if indent <= base_indent:
                break
            next_index += 1
        return lines[start:next_index]

    package_unix_block = _step_block("Package Unix candidate")
    package_windows_block = _step_block("Package Windows candidate")
    for platform, block in (
        ("Unix", package_unix_block),
        ("Windows", package_windows_block),
    ):
        if not block:
            fail(errors, f"workflow {platform} package step not found")
        elif not any("if:" in line and "success()" in line for line in block):
            fail(errors, f"workflow {platform} package step should be guarded by success()")

    upload_block = _step_block("", uses="actions/upload-artifact@v4")
    if not upload_block:
        fail(errors, "workflow upload step not found")
    elif not any("if: success()" in line for line in upload_block):
        fail(errors, "workflow upload step should be guarded by success()")

    heavy_block = "\n".join(_step_block("Optional heavy checks"))
    heavy_failure_patterns = (
        'if [ ! -f "${HEAVY_CHECK_PATH}" ]; then',
        "except subprocess.TimeoutExpired:",
        'raise SystemExit("Heavy acceptance checks timed out")',
        "if result.returncode:",
        "Heavy acceptance checks failed",
    )
    for pattern in heavy_failure_patterns:
        if pattern not in heavy_block:
            fail(errors, f"workflow heavy-check failure gate missing: {pattern}")

    decision_guard_patterns = (
        'if [[ "${{ inputs.run_e2e }}" != "true" ]]; then',
        'status="${{ steps.heavy-checks.outputs.status }}"',
        'if [[ "${status}" != "passed" ]]; then',
    )
    decision_block = "\n".join(_step_block("Validate heavy-check decision"))
    for pattern in decision_guard_patterns:
        if pattern not in decision_block:
            fail(errors, f"workflow heavy-check decision logic missing: {pattern}")
