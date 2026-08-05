"""校验跨平台里程碑候选 workflow 的完整性、安全边界与打包顺序。"""

from __future__ import annotations

import hashlib
from pathlib import Path
import re

from .context import WORKFLOW, display_path, fail
from .workflow_contract import (
    CHECKOUT_USE,
    EXPECTED_ACTION_STEPS,
    EXPECTED_INPUTS,
    EXPECTED_NAMED_STEPS,
    EXPECTED_WORKFLOW_SHA256,
    UPLOAD_USE,
)


def validate_workflow(errors: list[str], workflow: Path = WORKFLOW) -> None:
    """确认 workflow 是受审模板，只构建 pending 候选且不执行产品验收。"""

    if not workflow.is_file():
        fail(errors, f"missing workflow asset: {display_path(workflow)}")
        return
    try:
        payload = workflow.read_bytes()
        # Git 的受审对象统一使用 LF；Windows 的 core.autocrlf 可能只转换工作树字节。
        # 哈希和语义检查必须基于同一份规范内容，避免把安全的签出转换误判为篡改。
        canonical_payload = payload.replace(b"\r\n", b"\n")
        text = canonical_payload.decode("utf-8")
    except (OSError, UnicodeDecodeError) as error:
        fail(errors, f"cannot read workflow asset {display_path(workflow)}: {error}")
        return

    observed_digest = hashlib.sha256(canonical_payload).hexdigest()
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

    def first_named_step_index(name: str) -> int:
        """按完整步骤名返回首个活动 YAML 行，避免中文名称的前缀碰撞。"""

        expected = f"- name: {name}"
        return next(
            (
                index
                for index, line in enumerate(semantic_lines)
                if line.strip() == expected
            ),
            -1,
        )

    required_fragments = (
        "workflow_dispatch:",
        "fail-fast: false",
        "os: [ubuntu-latest, macos-latest, windows-latest]",
        "contents: read",
        "rustup toolchain install 1.90.0",
        "--component rustfmt",
        "--component clippy",
        '"cargo", "metadata", "--locked"',
        "未发现测试",
        "cargo test --workspace --all-targets --all-features --locked",
        "cargo build --workspace --release --locked",
        "prepare-release-directory.sh",
        "prepare-release-directory.ps1",
        ".release-signing/sign-candidate.sh",
        ".release-signing/sign-candidate.ps1",
        CHECKOUT_USE,
        UPLOAD_USE,
        "ref: ${{ inputs.source_commit }}",
        "persist-credentials: false",
        "source_commit 必须是由小写十六进制字符组成的 40 字符 SHA",
        "候选验证需要 Python 3 运行时",
        '"$PYTHON_COMMAND" -',
        "steps.candidate_artifact.outputs.archive_name",
        "最终候选文件集异常",
        "os.rename(stage.name, \"release\"",
        "已提交的发布文件集不是精确的普通文件候选集合",
        '"buildMode": "cross-platform-native"',
        '"sourceCommit"',
        '"sha256"',
        '"signingStatus"',
        '"signingEvidence"',
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
        "fail-fast: true",
        "continue-on-error:",
        "|| true",
        "dist/",
        "path: release/",
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

    preflight_idx = first_named_step_index("确认已授权候选预检")
    checkout_idx = first_line_index(CHECKOUT_USE)
    python_idx = first_named_step_index("选择 Python 运行时")
    source_verify_idx = first_named_step_index("验证已检出源码")
    toolchain_idx = first_named_step_index("选择项目 MSRV")
    if (
        preflight_idx == -1
        or checkout_idx == -1
        or python_idx == -1
        or source_verify_idx == -1
        or toolchain_idx == -1
    ):
        fail(errors, "workflow missing required candidate preflight/checkout/source/toolchain steps")
    elif not (preflight_idx < checkout_idx < python_idx < source_verify_idx < toolchain_idx):
        fail(errors, "candidate preflight, Python selection and pinned checkout verification must precede MSRV setup")

    def step_block(name: str = "", *, uses: str = "") -> list[str]:
        """按步骤缩进提取一个命名步骤或固定 SHA action 步骤。"""

        expected = f"- uses: {uses}" if uses else f"- name: {name}"
        start = next(
            (
                index
                for index, line in enumerate(semantic_lines)
                if (
                    re.fullmatch(
                        rf"{re.escape(expected)}(?:\s+#.*)?",
                        line.strip(),
                    )
                    if uses
                    else line.strip() == expected
                )
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

    checkout_block = {line.strip() for line in step_block(uses=CHECKOUT_USE)}
    for required in (
        "ref: ${{ inputs.source_commit }}",
        "fetch-depth: 1",
        "persist-credentials: false",
    ):
        if required not in checkout_block:
            fail(errors, f"workflow checkout must bind the approved source commit: {required}")

    python_block = "\n".join(step_block("选择 Python 运行时"))
    for required in ("command -v python3", "command -v python", "PYTHON_COMMAND", "GITHUB_ENV"):
        if required not in python_block:
            fail(errors, f"workflow Python runtime selection step missing: {required}")

    source_verify_block = "\n".join(step_block("验证已检出源码"))
    for required in (
        "[0-9a-f]{40}",
        'subprocess.check_output(["git", "rev-parse", "HEAD"]',
        "observed != expected",
    ):
        if required not in source_verify_block:
            fail(errors, f"workflow source verification step missing: {required}")
    if '"$PYTHON_COMMAND" -' not in source_verify_block:
        fail(errors, "workflow source verification must use the selected Python runtime")

    prepare_indices = (
        first_named_step_index("准备 Unix 发布目录"),
        first_named_step_index("准备 Windows 发布目录"),
    )
    verify_idx = first_named_step_index("验证候选")
    signing_indices = (
        first_named_step_index("尝试 Unix 签名"),
        first_named_step_index("尝试 Windows 签名"),
    )
    package_indices = (
        first_named_step_index("打包 Unix 候选"),
        first_named_step_index("打包 Windows 候选"),
    )
    resolve_idx = first_named_step_index("解析候选制品")
    manifest_idx = first_named_step_index("记录候选清单")
    commit_idx = first_named_step_index("提交候选制品集合")
    upload_idx = first_line_index(UPLOAD_USE)
    if (
        any(index == -1 for index in prepare_indices)
        or verify_idx == -1
        or any(index == -1 for index in signing_indices)
        or any(index == -1 for index in package_indices)
        or resolve_idx == -1
        or manifest_idx == -1
        or commit_idx == -1
        or upload_idx == -1
    ):
        fail(errors, "workflow missing verify/package/manifest/upload boundary")
    elif not (
        max(prepare_indices)
        < verify_idx
        < min(signing_indices)
        <= max(signing_indices)
        < min(package_indices)
        <= max(package_indices)
        < resolve_idx
        < manifest_idx
        < commit_idx
        < upload_idx
    ):
        fail(
            errors,
            "candidate workflow must clean release, verify, sign conditionally, package in staging, record a pending manifest, atomically commit the exact artifact set, then upload",
        )

    verify_block = "\n".join(step_block("验证候选"))
    for command in (
        "cargo test --workspace --all-targets --all-features --locked",
        "cargo build --workspace --release --locked",
    ):
        if command not in verify_block:
            fail(errors, f"workflow 的“验证候选”步骤缺少有效命令：{command}")

    manifest_block = "\n".join(step_block("记录候选清单"))
    if '"milestoneAcceptance": "pending"' not in manifest_block:
        fail(errors, "workflow manifest step must actively record pending acceptance")
    for field in (
        '"signingStatus"',
        '"signingReason"',
        '"signingEvidence"',
        '"buildRun"',
        '"target"',
    ):
        if field not in manifest_block:
            fail(errors, f"workflow manifest step missing candidate field: {field}")
    for fragment in (
        'archive_name = os.environ["CANDIDATE_ARCHIVE"]',
        "observed_before != expected_before",
        "observed_after != expected_after",
        "候选校验和与归档字节不匹配",
    ):
        if fragment not in manifest_block:
            fail(errors, f"workflow manifest step missing exact artifact-set gate: {fragment}")

    commit_block = "\n".join(step_block("提交候选制品集合"))
    for fragment in (
        "os.lstat(path)",
        "os.rmdir(\"release\", dir_fd=root_fd)",
        'os.rename(stage.name, "release", src_dir_fd=root_fd, dst_dir_fd=root_fd)',
        "os.rmdir(release)",
        "os.rename(stage, release)",
        "提交前候选暂存目录文件集发生变化",
        "已提交的发布文件集不是精确的普通文件候选集合",
    ):
        if fragment not in commit_block:
            fail(errors, f"workflow candidate commit step missing atomic boundary: {fragment}")

    for name in ("尝试 Unix 签名", "尝试 Windows 签名"):
        signing_block = "\n".join(step_block(name))
        for fragment in (
            "probe",
            "sign",
            "verify",
            "SIGNING_STATUS",
            "SIGNING_EVIDENCE",
            "unsigned",
        ):
            if fragment not in signing_block:
                fail(errors, f"workflow {name} step missing signing contract: {fragment}")

    expected_guards = {
        "准备 Unix 发布目录": "if: runner.os != 'Windows' && success()",
        "准备 Windows 发布目录": "if: runner.os == 'Windows' && success()",
        "尝试 Unix 签名": "if: runner.os != 'Windows' && success()",
        "尝试 Windows 签名": "if: runner.os == 'Windows' && success()",
        "打包 Unix 候选": "if: runner.os != 'Windows' && success()",
        "打包 Windows 候选": "if: runner.os == 'Windows' && success()",
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
    else:
        upload_lines = {line.strip() for line in upload_block}
        expected_uploads = {
            "release/${{ steps.candidate_artifact.outputs.archive_name }}",
            "release/${{ steps.candidate_artifact.outputs.archive_name }}.sha256",
            "release/${{ steps.candidate_artifact.outputs.archive_name }}.manifest.json",
        }
        if not expected_uploads.issubset(upload_lines):
            fail(errors, "workflow upload step must publish the exact declared archive/checksum/manifest paths")
