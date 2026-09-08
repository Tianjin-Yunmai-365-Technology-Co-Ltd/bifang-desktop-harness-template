"""校验跨平台候选 workflow 的完整性、安全边界与打包顺序。"""

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

RELEASE_ENVELOPE_HELPER = (
    WORKFLOW.parent.parent / "scripts" / "verify_release_envelope.py"
)


def validate_release_envelope_helper(
    errors: list[str], helper: Path = RELEASE_ENVELOPE_HELPER
) -> None:
    """要求离线候选信封验证器证明直接默认分支发布的最终远端快照。"""

    if not helper.is_file():
        fail(errors, f"missing release envelope helper: {display_path(helper)}")
        return
    try:
        text = helper.read_text(encoding="utf-8")
        compile(text, str(helper), "exec")
    except (OSError, UnicodeDecodeError, SyntaxError) as error:
        fail(
            errors,
            f"cannot parse release envelope helper {display_path(helper)}: {error}",
        )
        return

    required_fragments = (
        'if repository_default_branch not in {"main", "master"}:',
        "if head != source_commit or branch != repository_default_branch:",
        'if closed.get("releaseTarget") != "default":',
        'if closed["defaultBranch"] != repository_default_branch:',
        'default_ref = f"refs/remotes/origin/{repository_default_branch}"',
        "if resolve_ref(root, default_ref) != source_commit:",
        'if resolve_ref(root, "refs/remotes/origin/Release", missing_ok=True) is not None:',
        'feature_ref = f"refs/remotes/origin/{entry[\'branch\']}"',
        "if resolve_ref(root, feature_ref, missing_ok=True) is not None:",
        '"releaseTarget": closed["releaseTarget"]',
        '"defaultBranch": repository_default_branch',
    )
    for fragment in required_fragments:
        if fragment not in text:
            fail(
                errors,
                "release envelope helper direct-default gate missing: " + fragment,
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
        "读取项目最低 Rust 版本",
        'r"(?ms)^\\[workspace\\.package\\]',
        'environment.write(f"RUSTUP_TOOLCHAIN={version}\\n")',
        'rustup toolchain install "$RUSTUP_TOOLCHAIN"',
        "e2e_selection:",
        "E2E_SELECTION: ${{ inputs.e2e_selection }}",
        "e2e_selection 必须是 enabled 或 disabled",
        "branch_chain_state_sha256:",
        "BRANCH_CHAIN_STATE_SHA256: ${{ inputs.branch_chain_state_sha256 }}",
        "REPOSITORY_DEFAULT_BRANCH: ${{ github.event.repository.default_branch }}",
        "RELEASE_ENVELOPE_SNAPSHOT: ${{ runner.temp }}/release-envelope-snapshot.json",
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
        "ref: ${{ github.event.repository.default_branch }}",
        "fetch-depth: 0",
        "persist-credentials: false",
        "source_commit 必须是由小写十六进制字符组成的 40 字符 SHA",
        'default_branch not in {"main", "master"}',
        "必须检出具名 GitHub 动态默认分支",
        "verify_release_envelope.py capture",
        "verify_release_envelope.py verify",
        "--expected-state-sha256 \"$BRANCH_CHAIN_STATE_SHA256\"",
        "--repository-default-branch \"$REPOSITORY_DEFAULT_BRANCH\"",
        "--snapshot \"$RELEASE_ENVELOPE_SNAPSHOT\"",
        "测试后源码提交或 clean 状态发生变化",
        "候选验证需要 Python 3 运行时",
        '"$PYTHON_COMMAND" -',
        "验证发布更新日志",
        ".agents/skills/desktop-prepare-release/scripts/release_notes.py check --file release-notes.json --expected-version \"$VERSION\"",
        "RELEASE_NOTES_SHA256",
        "release-notes.json 必须是非符号链接普通文件",
        'releaseNotesVersion',
        'releaseNotesSha256',
        'releaseNotesPath',
        'branchChainStateSha256',
        'releaseReview',
        'candidateSelections',
        'reviewSelection',
        'reviewStatus',
        'tarfile, zipfile',
        "归档内更新日志与源码事实不一致",
        "steps.candidate_artifact.outputs.archive_name",
        "最终候选文件集异常",
        "已提交的发布文件集不是精确的普通文件候选集合",
        '"buildMode": "cross-platform-native"',
        '"sourceCommit"',
        '"sha256"',
        '"e2eSelection"',
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
        "ref: ${{ inputs.source_commit }}",
        "ref: Release",
        "fetch-depth: 1",
        'mktemp -d "${GITHUB_WORKSPACE}/.release-clean.candidate.XXXXXX"',
        'Join-Path $env:GITHUB_WORKSPACE (".release-clean.candidate."',
        "cargo fmt",
        "cargo clippy",
        "--component rustfmt",
        "--component clippy",
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
        e2e_start = next(
            (
                index
                for index, line in enumerate(semantic_lines)
                if line == "      e2e_selection:"
            ),
            -1,
        )
        if e2e_start == -1:
            fail(errors, "workflow e2e_selection input is missing")
        else:
            e2e_end = e2e_start + 1
            while e2e_end < len(semantic_lines):
                line = semantic_lines[e2e_end]
                if line.strip() and len(line) - len(line.lstrip()) <= 6:
                    break
                e2e_end += 1
            e2e_block = {line.strip() for line in semantic_lines[e2e_start:e2e_end]}
            for required in (
                "required: true",
                "type: choice",
                "- disabled",
                "- enabled",
                "default: disabled",
            ):
                if required not in e2e_block:
                    fail(errors, f"workflow e2e_selection input contract missing: {required}")

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
    envelope_capture_idx = first_named_step_index("从 closing commit 捕获发布信封")
    toolchain_idx = first_named_step_index("选择项目 MSRV")
    if (
        preflight_idx == -1
        or checkout_idx == -1
        or python_idx == -1
        or source_verify_idx == -1
        or envelope_capture_idx == -1
        or toolchain_idx == -1
    ):
        fail(
            errors,
            "workflow missing required candidate preflight/checkout/source/envelope/toolchain steps",
        )
    elif not (
        preflight_idx
        < checkout_idx
        < python_idx
        < source_verify_idx
        < envelope_capture_idx
        < toolchain_idx
    ):
        fail(
            errors,
            "candidate preflight, named default-branch checkout and initial envelope capture must precede MSRV setup",
        )

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
        "ref: ${{ github.event.repository.default_branch }}",
        "fetch-depth: 0",
        "persist-credentials: false",
    ):
        if required not in checkout_block:
            fail(
                errors,
                "workflow checkout must use the dynamic named default branch with full "
                f"credential-free history: {required}",
            )

    python_block = "\n".join(step_block("选择 Python 运行时"))
    for required in ("command -v python3", "command -v python", "PYTHON_COMMAND", "GITHUB_ENV"):
        if required not in python_block:
            fail(errors, f"workflow Python runtime selection step missing: {required}")

    source_verify_block = "\n".join(step_block("验证已检出源码"))
    for required in (
        "[0-9a-f]{40}",
        'subprocess.check_output(["git", "rev-parse", "HEAD"]',
        "observed != expected",
        'default_branch = os.environ["REPOSITORY_DEFAULT_BRANCH"]',
        'default_branch not in {"main", "master"}',
        'subprocess.check_output(["git", "symbolic-ref", "--quiet", "--short", "HEAD"]',
        "branch != default_branch",
        '"status", "--porcelain=v1", "--untracked-files=all"',
        "if status:",
    ):
        if required not in source_verify_block:
            fail(errors, f"workflow source verification step missing: {required}")
    if '"$PYTHON_COMMAND" -' not in source_verify_block:
        fail(errors, "workflow source verification must use the selected Python runtime")

    preflight_block = "\n".join(step_block("确认已授权候选预检"))
    for required in (
        'inputs.confirm_candidate_build',
        '"$E2E_SELECTION" != "enabled"',
        '"$E2E_SELECTION" != "disabled"',
    ):
        if required not in preflight_block:
            fail(errors, f"workflow candidate preflight missing current E2E choice gate: {required}")

    envelope_helper = (
        ".agents/skills/desktop-prepare-cross-platform-release/scripts/"
        "verify_release_envelope.py"
    )
    helper_arguments = (
        '--project-root "$GITHUB_WORKSPACE"',
        '--source-commit "$SOURCE_COMMIT"',
        '--expected-state-sha256 "$BRANCH_CHAIN_STATE_SHA256"',
        '--repository-default-branch "$REPOSITORY_DEFAULT_BRANCH"',
        '--snapshot "$RELEASE_ENVELOPE_SNAPSHOT"',
    )
    capture_block = "\n".join(step_block("从 closing commit 捕获发布信封"))
    capture_command = f'"$PYTHON_COMMAND" {envelope_helper} capture'
    if capture_command not in capture_block:
        fail(errors, "workflow initial envelope step must run the offline capture helper")
    for argument in helper_arguments:
        if argument not in capture_block:
            fail(errors, f"workflow initial envelope capture missing immutable binding: {argument}")
    if semantic_text.count(envelope_helper) != 2:
        fail(errors, "workflow must invoke the offline envelope helper exactly twice")

    prepare_indices = (
        first_named_step_index("准备 Unix 发布目录"),
        first_named_step_index("准备 Windows 发布目录"),
    )
    candidate_version_idx = first_named_step_index("验证候选版本")
    release_notes_idx = first_named_step_index("验证发布更新日志")
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
        candidate_version_idx == -1
        or release_notes_idx == -1
        or any(index == -1 for index in prepare_indices)
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
        candidate_version_idx
        < release_notes_idx
        < min(prepare_indices)
        <= max(prepare_indices)
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
            "candidate workflow must validate release notes, clean release, verify, sign conditionally, package in staging, record a pending manifest, atomically commit the exact artifact set, then upload",
        )

    release_notes_block = "\n".join(step_block("验证发布更新日志"))
    for fragment in (
        "release_notes.py check --file release-notes.json --expected-version",
        "path.is_symlink() or not path.is_file()",
        "hashlib.sha256(path.read_bytes()).hexdigest()",
        "RELEASE_NOTES_SHA256",
    ):
        if fragment not in release_notes_block:
            fail(errors, f"workflow release-note validation step missing: {fragment}")

    verify_block = "\n".join(step_block("验证候选"))
    for command in (
        "cargo test --workspace --all-targets --all-features --locked",
        "cargo build --workspace --release --locked",
    ):
        if command not in verify_block:
            fail(errors, f"workflow 的“验证候选”步骤缺少有效命令：{command}")
    for forbidden in ("cargo fmt", "cargo clippy"):
        if forbidden in verify_block:
            fail(errors, f"workflow build must not add non-unit development gate: {forbidden}")
    post_test_fragments = (
        "cargo test --workspace --all-targets --all-features --locked",
        'head = subprocess.check_output(["git", "rev-parse", "HEAD"]',
        '["git", "status", "--porcelain=v1", "--untracked-files=all"]',
        'if head != os.environ["SOURCE_COMMIT"] or status:',
        "cargo build --workspace --release --locked",
    )
    post_test_indices = tuple(
        verify_block.find(fragment) for fragment in post_test_fragments
    )
    if any(index == -1 for index in post_test_indices) or post_test_indices != tuple(
        sorted(post_test_indices)
    ):
        fail(
            errors,
            "workflow must re-check HEAD and clean state after tests and before release build/signing",
        )

    manifest_block = "\n".join(step_block("记录候选清单"))
    verify_command = f'"$PYTHON_COMMAND" {envelope_helper} verify'
    if verify_command not in manifest_block:
        fail(errors, "workflow manifest step must repeat the offline envelope verification")
    for argument in helper_arguments:
        if argument not in manifest_block:
            fail(errors, f"workflow second envelope verification missing immutable binding: {argument}")
    embedded_manifest_idx = manifest_block.find('"$PYTHON_COMMAND" - <<\'PY\'')
    if (
        verify_command not in manifest_block
        or embedded_manifest_idx == -1
        or manifest_block.find(verify_command) > embedded_manifest_idx
    ):
        fail(errors, "workflow must verify the sealed envelopes immediately before manifest generation")
    if '"milestoneAcceptance": "pending"' not in manifest_block:
        fail(errors, "workflow manifest step must actively record pending acceptance")
    for field in (
        '"signingStatus"',
        '"signingReason"',
        '"signingEvidence"',
        '"buildRun"',
        '"target"',
        '"e2eSelection"',
        '"releaseNotesVersion"',
        '"releaseNotesSha256"',
        '"releaseNotesPath"',
        '"branchChainStateSha256": snapshot["branchChainStateSha256"]',
        '"releaseReview": review',
        '"candidateSelections": candidate_selections',
        '"reviewSelection": review["selection"]',
        '"reviewStatus": review["status"]',
    ):
        if field not in manifest_block:
            fail(errors, f"workflow manifest step missing candidate field: {field}")
    for fragment in (
        'snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))',
        'snapshot.get("sourceCommit") != os.environ["SOURCE_COMMIT"]',
        'snapshot.get("branchChainStateSha256") != os.environ["BRANCH_CHAIN_STATE_SHA256"]',
        'review = snapshot["releaseReview"]',
        'candidate_selections = snapshot["candidateSelections"]',
        'manifest["reviewedSourceCommit"] = review["reviewedSourceCommit"]',
        '"scopeBase": review["scopeBase"]',
        '"sourceHead": review["sourceHead"]',
        '"scopeDiffSha256": review["scopeDiffSha256"]',
        '"checks": review["checks"]',
        '"evidenceSummary": review["evidenceSummary"]',
        'manifest["reviewReason"] = review["reason"]',
        'manifest["reviewRemainingRisk"] = review["remainingRisk"]',
    ):
        if fragment not in manifest_block:
            fail(errors, f"workflow manifest step missing sealed-envelope projection: {fragment}")
    for fragment in (
        'archive_name = os.environ["CANDIDATE_ARCHIVE"]',
        "observed_before != expected_before",
        "observed_after != expected_after",
        "候选校验和与归档字节不匹配",
        'release_notes_digest != os.environ["RELEASE_NOTES_SHA256"]',
        "packaged_release_notes != release_notes_bytes",
    ):
        if fragment not in manifest_block:
            fail(errors, f"workflow manifest step missing exact artifact-set gate: {fragment}")

    for name, fragments in {
        "打包 Unix 候选": (
            'release-notes.json',
            'tar -czf',
            'mktemp -d "${GITHUB_WORKSPACE}/../.${PRODUCT_NAME}.release-candidate.XXXXXX"',
        ),
        "打包 Windows 候选": (
            'release-notes.json',
            'Compress-Archive',
            'Join-Path (Split-Path -Parent $env:GITHUB_WORKSPACE)',
            '.$env:PRODUCT_NAME.release-candidate.',
        ),
    }.items():
        package_block = "\n".join(step_block(name))
        for fragment in fragments:
            if fragment not in package_block:
                fail(errors, f"workflow {name} must package the root release notes: {fragment}")

    commit_block = "\n".join(step_block("提交候选制品集合"))
    for fragment in (
        "os.lstat(path)",
        "os.rmdir(release)",
        "os.rename(stage, release)",
        "stage.parent.resolve() != root.parent",
        "require_plain_directory(stage)",
        "require_plain_directory(release)",
        "release.resolve() != root / \"release\"",
        "提交前候选暂存目录文件集发生变化",
        "已提交的发布文件集不是精确的普通文件候选集合",
    ):
        if fragment not in commit_block:
            fail(errors, f"workflow candidate commit step missing atomic boundary: {fragment}")
    commit_sequence = (
        "require_plain_directory(release)",
        "require_plain_directory(stage)",
        "if any(release.iterdir()):",
        "if {path.name for path in stage.iterdir()} != expected:",
        "os.rmdir(release)",
        "os.rename(stage, release)",
        "require_plain_directory(release)",
        "if release.resolve() != root / \"release\":",
        "committed = list(release.iterdir())",
        "if {path.name for path in committed} != expected or any(",
    )
    cursor = -1
    for fragment in commit_sequence:
        cursor = commit_block.find(fragment, cursor + 1)
        if cursor == -1:
            fail(
                errors,
                f"workflow candidate commit step must atomically commit then exactly re-verify: {fragment}",
            )
            break

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

    validate_release_envelope_helper(errors)
