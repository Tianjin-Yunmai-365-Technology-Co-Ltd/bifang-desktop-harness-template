"""校验构建路由、条件签名与根 release 刷新契约。"""

from __future__ import annotations

from pathlib import Path

from .context import *  # noqa: F403

EXACT_RELEASE_IGNORE = "/release/"
EXACT_CLEANUP_IGNORE = "/.release-clean.*"
UNSAFE_RELEASE_IGNORES = {
    "release/",
    "**/release/",
    "/release",
    "release",
    "**/release",
    ".release-clean.*",
    "**/.release-clean.*",
}


def validate_release_ignore(errors: list[str], path: Path) -> None:
    """要求根锚定 release ignore 恰好一次，并拒绝过宽或不完整的近似规则。"""
    if not path.is_file():
        fail(errors, f"missing release ignore file: {display_path(path)}")  # noqa: F405
        return
    active_lines = [
        line.strip()
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    for rule in (EXACT_RELEASE_IGNORE, EXACT_CLEANUP_IGNORE):
        exact_count = active_lines.count(rule)
        if exact_count != 1:
            fail(  # noqa: F405
                errors,
                f"release ignore rule {rule} must appear exactly once in "
                f"{display_path(path)}: observed {exact_count}",  # noqa: F405
            )
    unsafe = sorted({line for line in active_lines if line in UNSAFE_RELEASE_IGNORES})
    if unsafe:
        fail(  # noqa: F405
            errors,
            f"unsafe release ignore rule in {display_path(path)}: {unsafe}",  # noqa: F405
        )


def validate_build_skill_contract(
    errors: list[str],
    build_skill: Path = BUILD_RELEASE_SKILL,  # noqa: F405
    cross_platform_skill: Path = CROSS_PLATFORM_RELEASE_SKILL,  # noqa: F405
) -> None:
    """锁定全平台优先、受限回退、条件签名和 pending 输出语义。"""
    required = {
        build_skill: (
            "默认通过 `$prepare-cross-platform-release` 构建 Windows、macOS 和 Linux 原生候选",
            "仅当跨平台预检在任何远端矩阵启动前证明上述编排前置条件不可用时，才回退当前宿主",
            "不得把已启动矩阵的失败、测试失败、打包失败、签名失败、超时或取消视为回退条件",
            "在执行任何格式化、测试或构建命令前",
            "把已有目录原子移动到同一文件系统中的唯一清理目录",
            "必须尝试签名并验证生成的签名",
            "signingStatus: unsigned",
            "结构化 `signingEvidence`",
            "明确批准的 40 字符源码提交",
            "目录级原子替换",
            "项目根 `release/`",
            "milestoneAcceptance: pending",
            "不得启动二进制文件或运行冒烟/E2E",
        ),
        cross_platform_skill: (
            "默认 `$build-rust-release` 路线",
            "fail-fast: false",
            "在执行任何格式化、测试或构建命令前",
            "原子隔离旧目录",
            "必须尝试签名并验证",
            "signingStatus: unsigned",
            "结构化 `signingEvidence`",
            "固定的 `confirm_candidate_build`、`version` 和 `source_commit` 输入",
            "把完整的项目根同级暂存目录原子重命名到其位置",
            "上传三个明确的归档/校验和/清单路径",
            "milestoneAcceptance: pending",
            "本工作流不得包含冒烟、E2E",
        ),
    }
    for path, fragments in required.items():
        if not path.is_file():
            fail(errors, f"missing release contract file: {display_path(path)}")  # noqa: F405
            continue
        text = path.read_text(encoding="utf-8")
        for fragment in fragments:
            if fragment not in text:
                fail(  # noqa: F405
                    errors,
                    f"release contract missing in {display_path(path)}: {fragment}",  # noqa: F405
                )


def validate_tauri_build_skill_contract(
    errors: list[str],
    tauri_skill: Path = TAURI_RELEASE_SKILL,  # noqa: F405
    xwin_gate: Path = MACOS_XWIN_GATE,  # noqa: F405
    notarization_helper: Path = TAURI_NOTARIZATION_HELPER,  # noqa: F405
    tauri_tests: Path = TAURI_RELEASE_HELPER_TESTS,  # noqa: F405
    xwin_tests: Path = MACOS_XWIN_GATE_TESTS,  # noqa: F405
) -> None:
    """锁定 Tauri xwin 安装链和 macOS 签名公证一体门禁。"""
    required = {
        tauri_skill: (
            "scripts/prepare-release-directory.sh <project-root>",
            "不要求 GUI-only 项目保留 CLI 构建 Skill",
            "scripts/macos-tauri-xwin-gates.sh --install-missing --target x86_64-pc-windows-msvc",
            "CI=true pnpm tauri build --bundles dmg --no-sign",
            "不得输出仅 Developer ID 签名但未公证/staple 的 macOS 候选",
            "候选构建中禁止 `--skip-stapling`",
            "CI=true pnpm tauri build --bundles nsis --runner cargo-xwin --target x86_64-pc-windows-msvc",
            "拒绝 `msi` 或 `all`",
            "`runtimeVerification` 均为 `Unverified`",
            "完整 `gate.path.prepend` 原样前置",
            "在所有会改变字节的签名、公证、stapling 和打包步骤完成后计算 SHA-256",
            "notarized-and-stapled",
            "不得在本 Skill 中运行冒烟/E2E",
        ),
        xwin_gate: (
            "x86_64-pc-windows-msvc",
            '"$brew_path" install llvm',
            '"$brew_path" install nsis',
            'target add "$TARGET"',
            "install --locked cargo-xwin",
            "本门禁不自动安装 Homebrew",
            "gate.path.prepend",
            "安装后复探仍失败",
        ),
        notarization_helper: (
            "Developer ID Application",
            "--find notarytool",
            "--find stapler",
            "APPLE_API_ISSUER",
            "APPLE_API_KEY_PATH",
            "APPLE_ID",
            "APPLE_PASSWORD",
            "APPLE_TEAM_ID",
            "notarization-credentials-incomplete-or-ambiguous",
        ),
        TAURI_RELEASE_DIRECTORY_HELPER: (  # noqa: F405
            "项目根目录不是独立 Git 顶层目录",
            "release 是符号链接",
            'mktemp -d "$canonical_root/.release-clean.XXXXXX"',
            'mv -- "$release_path" "$staging_parent/previous-release"',
            "原子刷新期间 release 发生变化",
            "release.cleaned=true",
        ),
        tauri_tests: (
            "test_complete_api_credentials_are_ready_without_secret_output",
            "test_complete_apple_id_credentials_are_ready",
            "test_missing_credentials_is_unavailable_not_partially_ready",
            "test_partial_or_mixed_credentials_are_rejected",
            "test_symlinked_api_key_is_rejected",
            "test_missing_notarytool_is_unavailable",
        ),
        xwin_tests: (
            "test_existing_environment_passes_without_installing",
            "test_missing_environment_is_installed_and_reprobed",
            "test_check_only_reports_missing_without_writes",
            "test_missing_homebrew_blocks_install",
            "test_formula_install_failure_does_not_claim_success",
            "test_non_macos_host_is_rejected",
            "test_unsupported_target_is_rejected",
        ),
    }
    for path, fragments in required.items():
        if not path.is_file():
            fail(errors, f"missing Tauri release contract file: {display_path(path)}")  # noqa: F405
            continue
        text = path.read_text(encoding="utf-8")
        for fragment in fragments:
            if fragment not in text:
                fail(  # noqa: F405
                    errors,
                    f"Tauri release contract missing in {display_path(path)}: {fragment}",  # noqa: F405
                )
    if BUILD_RELEASE_POSIX_HELPER.is_file() and TAURI_RELEASE_DIRECTORY_HELPER.is_file():  # noqa: F405
        if BUILD_RELEASE_POSIX_HELPER.read_bytes() != TAURI_RELEASE_DIRECTORY_HELPER.read_bytes():  # noqa: F405
            fail(
                errors,
                "Tauri release directory helper must remain byte-identical to the tested CLI POSIX helper",
            )


def validate_release_contract(errors: list[str]) -> None:
    """汇总 release ignore、helper 和构建/收集阶段的确定性契约。"""
    for path in (GITIGNORE, RUST_ASSET / ".gitignore"):  # noqa: F405
        validate_release_ignore(errors, path)
    validate_build_skill_contract(errors)
    validate_tauri_build_skill_contract(errors)

    helper_fragments = {
        BUILD_RELEASE_POSIX_HELPER: (  # noqa: F405
            "独立 Git 顶层目录",
            "release 是符号链接",
            'mktemp -d "$canonical_root/.release-clean.XXXXXX"',
            'mv -- "$release_path" "$staging_parent/previous-release"',
            'mkdir -- "$release_path"',
            "原子刷新期间 release 发生变化",
            "release.cleaned=true",
        ),
        BUILD_RELEASE_POWERSHELL_HELPER: (  # noqa: F405
            "独立 Git 顶层目录",
            "[IO.FileAttributes]::ReparsePoint",
            "[IO.Directory]::Move",
            "[IO.Directory]::Delete($item.FullName, $false)",
            "Remove-TreeWithoutFollowingReparsePoint",
            "原子刷新期间 release 发生变化",
            "release.cleaned=true",
        ),
        BUILD_RELEASE_HELPER_TESTS: (  # noqa: F405
            "test_cleans_every_entry_without_deleting_release_directory",
            "test_rejects_release_symlink_without_touching_target",
            "test_rejects_directory_that_is_not_git_top_level",
            "test_windows_helper_rejects_root_reparse_point",
            "test_windows_helper_rejects_non_git_top_level",
        ),
        COLLECT_RELEASE_SKILL: (  # noqa: F405
            "为 `$build-rust-release` 或 `$build-tauri-release` 收集构建结果时可以接受 `milestoneAcceptance: pending`",
            "目录存在绝不得提升该状态",
            "不得尝试新签名、公证或 stapling",
        ),
        PREPARE_RELEASE_SKILL: (  # noqa: F405
            "目录存在绝不表示已满足发布就绪条件",
            "结构化 `signingEvidence`",
            "不得在此重试或配置签名、公证或 stapling",
            "notarizationStatus: notarized-and-stapled",
        ),
    }
    for path, fragments in helper_fragments.items():
        if not path.is_file():
            fail(errors, f"missing release contract file: {display_path(path)}")  # noqa: F405
            continue
        text = path.read_text(encoding="utf-8")
        for fragment in fragments:
            if fragment not in text:
                fail(  # noqa: F405
                    errors,
                    f"release contract missing in {display_path(path)}: {fragment}",  # noqa: F405
                )
