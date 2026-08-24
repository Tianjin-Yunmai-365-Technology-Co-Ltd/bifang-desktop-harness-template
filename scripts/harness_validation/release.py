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
    collect_skill: Path = COLLECT_RELEASE_SKILL,  # noqa: F405
) -> None:
    """锁定逐次 E2E、全量单测、构建记录边界和 pending 输出语义。"""
    required = {
        build_skill: (
            "默认通过 `$desktop-prepare-cross-platform-release` 构建 Windows、macOS 和 Linux 原生候选",
            "仅当跨平台预检在任何远端矩阵启动前证明上述编排前置条件不可用时，才回退当前宿主",
            "不得把已启动矩阵的失败、测试失败、打包失败、签名失败、超时或取消视为回退条件",
            "在执行任何单元测试或构建命令前",
            "本次请求已明确 `enabled`/`disabled` 时直接复用",
            "否则在任何测试或编译前询问用户一次",
            "cargo test --workspace --all-targets --all-features --locked",
            "不得在构建名义下自动追加格式、lint、中文注释或其他开发门禁",
            "把已有目录原子移动到同一文件系统中的唯一清理目录",
            "必须尝试签名并验证生成的签名",
            "signingStatus: unsigned",
            "结构化 `signingEvidence`",
            "明确批准的 40 字符源码提交",
            "目录级原子替换",
            "项目根 `release/`",
            "milestoneAcceptance: pending",
            "e2eSelection",
            "编译、签名与打包期间不得启动二进制文件或混跑冒烟/E2E",
            "不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification",
        ),
        cross_platform_skill: (
            "默认 `$desktop-build-rust-release` 路线",
            "fail-fast: false",
            "在执行任何单元测试或构建命令前",
            "cargo test --workspace --all-targets --all-features --locked",
            "不得自动追加格式、lint 或其他开发门禁",
            "原子隔离旧目录",
            "必须尝试签名并验证",
            "signingStatus: unsigned",
            "结构化 `signingEvidence`",
            "固定的 `confirm_candidate_build`、`version`、`source_commit` 和 `e2e_selection` 输入",
            "把完整的项目根同级暂存目录原子重命名到其位置",
            "上传三个明确的归档/校验和/清单路径",
            "milestoneAcceptance: pending",
            "e2eSelection",
            "矩阵本身不得运行 E2E",
            "不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification",
        ),
        collect_skill: (
            "只在当前 manifests、其声明的相邻制品证据和最终回复中记录",
            "不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification",
            "独立触发的验收或发布由对应 Skill 记录自身新增证据",
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
    verify_skill: Path = VERIFY_DELIVERY_SKILL,  # noqa: F405
    verification_doc: Path = VERIFICATION_DOC,  # noqa: F405
    xwin_gate: Path = MACOS_XWIN_GATE,  # noqa: F405
    notarization_helper: Path = TAURI_NOTARIZATION_HELPER,  # noqa: F405
    tauri_tests: Path = TAURI_RELEASE_HELPER_TESTS,  # noqa: F405
    dmg_layout_helper: Path = TAURI_DMG_LAYOUT_HELPER,  # noqa: F405
    dmg_layout_tests: Path = TAURI_DMG_LAYOUT_TESTS,  # noqa: F405
    xwin_tests: Path = MACOS_XWIN_GATE_TESTS,  # noqa: F405
) -> None:
    """锁定 Tauri xwin 安装链和 macOS 签名公证一体门禁。"""
    required = {
        tauri_skill: (
            "本次请求已明确 `enabled`/`disabled` 时直接复用",
            "否则在任何测试或编译前询问用户一次",
            "scripts/prepare-release-directory.sh <project-root>",
            "不要求 GUI-only 项目保留 CLI 构建 Skill",
            "scripts/macos-tauri-xwin-gates.sh --install-missing --target x86_64-pc-windows-msvc",
            "CI=true TAURI_BUNDLER_DMG_IGNORE_CI=1 pnpm tauri build --bundles dmg",
            "headless runner 不得盲目启用",
            "scripts/verify-dmg-layout.sh <final-dmg>",
            "<project-id>_gui/src-tauri/dmg/background.png",
            'bundle.macOS.dmg.background: "./dmg/background.png"',
            "非符号链接的 660×400 PNG",
            "非空 `.DS_Store`",
            "不得输出仅 Developer ID 签名但未公证/staple 的 macOS 候选",
            "候选构建中禁止 `--skip-stapling`",
            "CI=true pnpm tauri build --bundles nsis --runner cargo-xwin --target x86_64-pc-windows-msvc",
            "拒绝 `msi` 或 `all`",
            "`runtimeVerification` 均为 `Unverified`",
            "完整 `gate.path.prepend` 原样前置",
            "所有会改变字节的布局写入、签名、公证和 stapling 完成后",
            "随后才对每个最终 DMG/NSIS 计算 SHA-256",
            "notarized-and-stapled",
            "cargo test --workspace --all-targets --all-features --locked",
            "完整单元测试套件",
            "不得自动追加格式、lint、类型、中文注释、`dist` 扫描或其他开发门禁",
            "e2eSelection",
            "编译、签名与打包期间不得混跑冒烟/E2E",
            "不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification",
        ),
        verify_skill: (
            "scripts/verify-dmg-layout.sh <final-dmg>",
            "针对 `release/` 中当前最终字节重新运行",
            "不得自动接受软件许可或沿用旧 DMG 的布局证据",
        ),
        verification_doc: (
            "Tauri DMG 最终布局",
            "只读挂载检查",
            "不得只检查源码配置、沿用旧 DMG 证据或自动接受软件许可",
        ),
        xwin_gate: (
            "x86_64-pc-windows-msvc",
            '"$brew_path" install llvm',
            '"$brew_path" install lld',
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
            "APPLE_NOTARYTOOL_PROFILE",
            "notarytool history",
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
            "test_authorized_keychain_profile_is_ready_without_profile_output",
            "test_unavailable_keychain_profile_is_rejected",
            "test_keychain_profile_cannot_be_mixed_with_environment_credentials",
            "test_missing_credentials_is_unavailable_not_partially_ready",
            "test_partial_or_mixed_credentials_are_rejected",
            "test_symlinked_api_key_is_rejected",
            "test_missing_notarytool_is_unavailable",
        ),
        dmg_layout_helper: (
            "attach -readonly -nobrowse -noautoopen",
            "finder-ds-store-missing",
            ".background/background.png",
            "applications-link-target-invalid",
            "app-bundle-count-invalid",
            "gate.macos_dmg_layout.status=passed",
        ),
        dmg_layout_tests: (
            "test_complete_readonly_volume_layout_passes_and_detaches",
            "test_missing_ds_store_fails_closed_and_detaches",
            "test_wrong_applications_link_and_multiple_apps_are_rejected",
            "test_symlinked_dmg_is_rejected_before_mount",
            "test_non_macos_host_is_not_applicable",
        ),
        xwin_tests: (
            "test_existing_environment_passes_without_installing",
            "test_missing_environment_is_installed_and_reprobed",
            "test_check_only_reports_missing_without_writes",
            "test_missing_homebrew_blocks_install",
            "test_formula_install_failure_does_not_claim_success",
            "test_split_llvm_install_adds_missing_lld_formula",
            "test_damaged_existing_lld_formula_is_not_silently_reinstalled",
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
            "为 `$desktop-build-rust-release` 或 `$desktop-build-tauri-release` 收集构建结果时可以接受 `milestoneAcceptance: pending`",
            "目录存在绝不得提升该状态",
            "不得尝试新签名、公证或 stapling",
            "构建产物收集本身不触发任何项目记忆",
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
