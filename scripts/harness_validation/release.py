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
CROSS_PLATFORM_RELEASE_WORKFLOW = (
    CROSS_PLATFORM_RELEASE_SKILL.parent  # noqa: F405
    / "assets"
    / "github-release-candidate.yml"
)
CROSS_PLATFORM_RELEASE_ENVELOPE_HELPER = (
    CROSS_PLATFORM_RELEASE_SKILL.parent  # noqa: F405
    / "scripts"
    / "verify_release_envelope.py"
)


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


def validate_fragment_contract(
    errors: list[str],
    required: dict[Path, tuple[str, ...]],
    *,
    label: str,
    compile_check: tuple[Path, ...] = (),
) -> None:
    """要求每个路径存在并包含全部固定文本片段，对指定路径额外校验 Python 语法。"""
    for path, fragments in required.items():
        if not path.is_file():
            fail(errors, f"missing {label} file: {display_path(path)}")  # noqa: F405
            continue
        text = path.read_text(encoding="utf-8")
        for fragment in fragments:
            if fragment not in text:
                fail(  # noqa: F405
                    errors,
                    f"{label} missing in {display_path(path)}: {fragment}",  # noqa: F405
                )
        if path in compile_check:
            try:
                compile(text, str(path), "exec")
            except SyntaxError as error:
                fail(  # noqa: F405
                    errors,
                    f"invalid {label} Python module {display_path(path)}: {error}",  # noqa: F405
                )


def validate_build_skill_contract(
    errors: list[str],
    build_skill: Path = BUILD_RELEASE_SKILL,  # noqa: F405
    cross_platform_skill: Path = CROSS_PLATFORM_RELEASE_SKILL,  # noqa: F405
    cross_platform_workflow: Path = CROSS_PLATFORM_RELEASE_WORKFLOW,
    cross_platform_envelope_helper: Path = CROSS_PLATFORM_RELEASE_ENVELOPE_HELPER,
    collect_skill: Path = COLLECT_RELEASE_SKILL,  # noqa: F405
) -> None:
    """锁定逐次 E2E、全量单测、构建记录边界和 pending 输出语义。"""
    required = {
        build_skill: (
            "默认通过 `$desktop-prepare-cross-platform-release` 构建 Windows、macOS 和 Linux 原生候选",
            "仅当跨平台预检在任何远端矩阵启动前证明上述编排前置条件不可用时，才回退当前宿主",
            "不得把已启动矩阵的失败、测试失败、打包失败、签名失败、超时或取消视为回退条件",
            "在执行任何单元测试或构建命令前",
            "release_notes.py check --file release-notes.json --expected-version",
            "本 Skill 绝不得生成或改写更新日志",
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
            "releaseNotesVersion",
            "releaseNotesSha256",
            "releaseNotesPath: release-notes.json",
            "编译、签名与打包期间不得启动二进制文件或混跑冒烟/E2E",
            "不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification",
            "候选 E2E 与完整验收只把结构化证据和状态原子写入忽略的 `release/` manifest 及其声明证据",
            "只有真实渠道发布成功或独立回顾审计，才由后续受管 feature 生命周期写入 tracked 发布/Verification/项目状态事实",
            "不得反向批准活动或历史候选",
        ),
        cross_platform_skill: (
            "默认 `$desktop-build-rust-release` 路线",
            "fail-fast: false",
            "在执行任何单元测试或构建命令前",
            "release_notes.py check --file release-notes.json --expected-version",
            "不得生成或改写更新日志",
            "cargo test --workspace --all-targets --all-features --locked",
            "不得自动追加格式、lint 或其他开发门禁",
            "原子隔离旧目录",
            "必须尝试签名并验证",
            "signingStatus: unsigned",
            "结构化 `signingEvidence`",
            "固定的 `confirm_candidate_build`、`version`、`source_commit`、`branch_chain_state_sha256` 和 `e2e_selection` 输入",
            "在任何派发前先运行 `$desktop-manage-git-branch-chain verify-release-review`",
            "状态摘要只能来自上述机械复核，不接受对话补写的信封、摘要或选择",
            "候选阶段只能只读确认下游 `.github/workflows/release-candidate.yml` 与该资产逐字节一致",
            "不得在受保护的 clean `Release` closing commit 上安装、更新或改写 workflow",
            "使用 `fetch-depth: 0` 获得 fresh 全历史/全部 remote-tracking 分支快照",
            "用受维护的 `scripts/verify_release_envelope.py capture`",
            "Rust CLI 的 `candidateSelections` 精确不适用",
            "不能把暂存目录放进工作树或依赖 ignore 隐藏",
            "最终字节形成后且写 manifest 前",
            "再次用 `scripts/verify_release_envelope.py verify`",
            "完整规范化 `releaseReview`/`candidateSelections`",
            "绝不能写成审查 `sourceHead`",
            "审查关闭时只复制 `reviewReason`/`reviewRemainingRisk`",
            "把完整的项目根同级暂存目录原子重命名到其位置",
            "上传三个明确的归档/校验和/清单路径",
            "milestoneAcceptance: pending",
            "e2eSelection",
            "releaseNotesVersion",
            "releaseNotesSha256",
            "releaseNotesPath: release-notes.json",
            "矩阵本身不得运行 E2E",
            "不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification",
            "候选 E2E 与完整验收只把结构化证据和状态原子写入忽略的 `release/` manifest 及其声明证据",
            "不得反向批准活动或历史候选",
        ),
        cross_platform_workflow: (
            "branch_chain_state_sha256:",
            "BRANCH_CHAIN_STATE_SHA256: ${{ inputs.branch_chain_state_sha256 }}",
            "REPOSITORY_DEFAULT_BRANCH: ${{ github.event.repository.default_branch }}",
            "RELEASE_ENVELOPE_SNAPSHOT: ${{ runner.temp }}/release-envelope-snapshot.json",
            "ref: Release",
            "fetch-depth: 0",
            "persist-credentials: false",
            "git\", \"status\", \"--porcelain=v1\", \"--untracked-files=all",
            "verify_release_envelope.py capture",
            "verify_release_envelope.py verify",
            "${GITHUB_WORKSPACE}/../.${PRODUCT_NAME}.release-candidate.XXXXXX",
            "Split-Path -Parent $env:GITHUB_WORKSPACE",
            '"releaseReview": review,',
            '"candidateSelections": candidate_selections,',
            '"reviewSelection": review["selection"],',
            '"reviewStatus": review["status"],',
            'manifest["reviewEvidence"] = {',
            'manifest["reviewReason"] = review["reason"]',
            'manifest["reviewRemainingRisk"] = review["remainingRisk"]',
            "os.rename(stage, release)",
            "已提交的发布文件集不是精确的普通文件候选集合",
        ),
        cross_platform_envelope_helper: (
            "def calculate_snapshot(",
            "runner must check out the named Release at source_commit",
            "protected state bytes do not match source_commit",
            "protected state digest does not match the host-verified input",
            'resolve_ref(root, "refs/remotes/origin/Release")',
            "GitHub default branch differs from the protected closing state",
            "registered remote feature ref still exists in the fresh snapshot",
            "require_closed_history(",
            "require_release_review_repository(root, closed)",
            "legacy closing state without both sealed envelopes is forbidden",
            '"performanceSelection": "not-applicable"',
            '"macosSigningSelection": "not-applicable"',
            '"releaseReview": closed["releaseReview"]',
            '"candidateSelections": selections',
            "release envelope changed between build gates",
        ),
        collect_skill: (
            "releaseNotesVersion",
            "releaseNotesSha256",
            "releaseNotesPath",
            "不得在收集时改写",
            "在全部源结果通过前不得清理、移走或写入它",
            "在项目根同级、同一文件系统创建唯一且权限受限的 staging",
            "不得逐个平台直接复制到 `release/`",
            "在 staging 内重新计算每个最终归档或安装包的 SHA-256",
            "在触碰目标目录前执行第二次只读 `verify-release-review`",
            "重新枚举 staging 并按全部清单复算精确集合",
            "把完整 staging 目录级原子替换为 `release/`",
            "任何前置失败都不得部分污染目标",
            "替换后只读重新枚举 `release/`",
            "只在当前 manifests、其声明的相邻制品证据和最终回复中记录",
            "不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification",
            "独立触发的真实渠道发布成功或回顾审计由后续受管 feature 生命周期记录自身新增事实",
        ),
    }
    validate_fragment_contract(
        errors,
        required,
        label="release contract",
        compile_check=(cross_platform_envelope_helper,),
    )

    if cross_platform_workflow.is_file():
        workflow_text = cross_platform_workflow.read_text(encoding="utf-8")
        ordered = (
            "verify_release_envelope.py capture",
            "cargo test --workspace --all-targets --all-features --locked",
            "cargo build --workspace --release --locked",
            "verify_release_envelope.py verify",
            '          manifest = {\n',
            "os.rename(stage, release)",
            "已提交的发布文件集不是精确的普通文件候选集合",
        )
        positions = [workflow_text.find(fragment) for fragment in ordered]
        if all(position >= 0 for position in positions) and positions != sorted(positions):
            fail(  # noqa: F405
                errors,
                "release contract order: cross-platform workflow must capture before "
                "tests, reverify final bytes before manifest, then atomically commit and "
                "read-only verify the candidate set",
            )
    if collect_skill.is_file():
        collect_text = collect_skill.read_text(encoding="utf-8")
        ordered = (
            "在接触目标目录前先调用 `$desktop-manage-git-branch-chain verify-release-review`",
            "在项目根同级、同一文件系统创建唯一且权限受限的 staging",
            "仅把已选择的当前源清单文件复制到 staging",
            "在 staging 内重新计算每个最终归档或安装包的 SHA-256",
            "检查 staging 中全部归档内容",
            "在触碰目标目录前执行第二次只读 `verify-release-review`",
            "重新枚举 staging 并按全部清单复算精确集合",
            "把完整 staging 目录级原子替换为 `release/`",
            "替换后只读重新枚举 `release/`",
        )
        positions = [collect_text.find(fragment) for fragment in ordered]
        if all(position >= 0 for position in positions) and positions != sorted(positions):
            fail(  # noqa: F405
                errors,
                "release contract order: collection must validate a complete staging "
                "set and reverify sealed state before one atomic replacement, followed "
                "by a read-only target check",
            )


def validate_tauri_local_install_contract(
    errors: list[str],
    local_skill: Path = TAURI_LOCAL_INSTALL_SKILL,  # noqa: F405
) -> None:
    """锁定 Windows 本地试包与发布候选之间的最小授权边界。"""
    required = {
        local_skill: (
            "[workspace.metadata.agent-first-harness]",
            "target-platforms",
            "interfaces",
            "允许从 dirty 工作树生成本地试包",
            "不得调用 `$desktop-prepare-release`",
            "不得生成、读取、校验或改写 `release-notes.json`",
            "不得传 `--config src-tauri/tauri.release.conf.json`",
            "不得创建、刷新或写入项目根 `release/`",
            "不得计算或提升版本",
            "cargo test --workspace --all-targets --all-features --locked",
            "不得自动追加格式、lint、类型、全仓治理、冒烟、E2E 或性能测试",
            '$env:CI = "true"',
            "pnpm tauri build --bundles nsis --target x86_64-pc-windows-msvc --no-sign",
            "禁止 `cargo-xwin`、MSI、`all` bundle 和交叉宿主",
            "不得启动应用、运行安装程序、请求 UAC、修改注册表或写入系统目录",
            "artifactPurpose: local-install-test",
            "releaseCandidate: false",
            "signingStatus: unsigned",
            "本 Skill 不询问 E2E 开/关或性能测试开/关",
            "不得把普通本地试包称为任务升级",
        ),
    }
    validate_fragment_contract(errors, required, label="Tauri local install contract")


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
    release_notes_helper: Path = TAURI_RELEASE_NOTES_HELPER,  # noqa: F405
    release_notes_tests: Path = TAURI_RELEASE_NOTES_HELPER_TESTS,  # noqa: F405
    e2e_skill: Path = E2E_SKILL,  # noqa: F405
    xwin_tests: Path = MACOS_XWIN_GATE_TESTS,  # noqa: F405
) -> None:
    """锁定 Tauri xwin 安装链和 macOS 签名公证一体门禁。"""
    required = {
        tauri_skill: (
            "[workspace.metadata.agent-first-harness]",
            "普通“构建/打包/首次安装试包”转到 `$desktop-build-tauri-local-install`",
            "本次请求已明确 `enabled`/`disabled` 时直接复用，否则在任何测试或编译前询问用户一次；`milestone_e2e`",
            "初始化后的构建不做例行环境预检",
            "只有某条命令已经失败",
            "release_notes.py check --file release-notes.json --expected-version",
            "verify_release_notes_resource.py config",
            "--config src-tauri/tauri.release.conf.json",
            "verify_release_notes_resource.py bytes",
            "本 Skill 绝不得生成或改写它",
            "首次尝试使用当前 PATH",
            "单次重试命令的 PATH",
            "scripts/prepare-release-directory.sh <project-root>",
            "scripts/prepare-release-directory.ps1 -ProjectRoot <project-root>",
            "Windows 原生路线不得调用 `.sh` helper",
            "不要求 GUI-only 项目保留 CLI 构建 Skill",
            "scripts/macos-tauri-xwin-gates.sh --install-missing --target x86_64-pc-windows-msvc",
            "CI=true TAURI_BUNDLER_DMG_IGNORE_CI=1 pnpm tauri build --bundles dmg",
            "headless runner 不得盲目启用",
            "scripts/verify-dmg-layout.sh <final-dmg> <project-root>/release-notes.json",
            "<project-id>_gui/src-tauri/dmg/background.png",
            'bundle.macOS.dmg.background: "./dmg/background.png"',
            "非符号链接的 660×400 PNG",
            "非空 `.DS_Store`",
            "启用 macOS 签名后绝不得输出仅 Developer ID 签名但未公证/staple 的候选",
            "候选构建中禁止 `--skip-stapling`",
            "CI=true pnpm tauri build --bundles nsis --runner cargo-xwin --target x86_64-pc-windows-msvc",
            "pnpm tauri build --bundles nsis --target x86_64-pc-windows-msvc --config src-tauri/tauri.release.conf.json",
            "本分支禁止 `--runner cargo-xwin`",
            "buildMode: native",
            "在最终候选 E2E/验收真实执行安装和运行之前，固定记录 `runtimeVerification: Unverified`",
            "拒绝 `msi` 或 `all`",
            "`runtimeVerification` 均为 `Unverified`",
            "完整 `gate.path.prepend` 原样前置",
            "所有会改变字节的布局写入、签名、公证和 stapling 完成后",
            "随后才对最终 DMG/NSIS 及已启用 updater 的 archive/`.sig` 计算 SHA-256",
            "此时不得先写入或替换项目根 `release/`",
            "所有上述条件分支完成后才把 manifest 写入同一暂存目录",
            "写完 manifest 后必须按每份 manifest 枚举并复算",
            "随后才以不跟随链接的目录级原子替换提交到 `release/`",
            "替换前的任何失败都不得在目标目录留下部分候选",
            "bundle.createUpdaterArtifacts: true",
            "TAURI_SIGNING_PRIVATE_KEY",
            "安装包代码签名与 updater 制品签名是独立门禁",
            "官方 updater archive 与相邻 `.sig`",
            "使用配置中的公钥执行实际签名验证",
            "`updaterEnabled`",
            "`signatureVerification: passed`",
            "不创建标签、Releases、商店提交、更新 feed",
            "notarized-and-stapled",
            "cargo test --workspace --all-targets --all-features --locked",
            "完整单元测试套件",
            "不得自动追加格式、lint、类型、中文注释、`dist` 扫描或其他开发门禁",
            "e2eSelection",
            "releaseNotesVersion",
            "releaseNotesSha256",
            "releaseNotesPath",
            "releaseNotesResourceVerification: byte-identical",
            "编译、签名与打包期间不得混跑冒烟/E2E",
            "不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification",
            "候选 E2E 与完整验收只把结构化证据和状态原子写入忽略的 `release/` manifest 及其声明证据",
            "不得反向批准活动或历史候选",
        ),
        verify_skill: (
            "verify_release_notes_resource.py bytes",
            "releaseNotesPath: release-notes.json",
            "scripts/verify-dmg-layout.sh <final-dmg> <project-root>/release-notes.json",
            "针对 `release/` 中当前最终字节重新运行",
            "不得自动接受软件许可或沿用旧 DMG 的布局证据",
        ),
        e2e_skill: (
            "GUI 更新日志",
            "release-notes.json",
            "最多五版",
            "各最多十条",
            "about_page = enabled",
            "about_page = disabled",
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
            'install --locked --version "$CARGO_XWIN_REQUIREMENT" cargo-xwin',
            "CARGO_XWIN_REQUIREMENT='>=0.23.1, <0.24.0'",
            "gate.cargo_xwin.requirement=",
            "本门禁不自动安装 Homebrew",
            "gate.path.prepend",
            "xwin_upgrade_required=1",
            "overall=upgrade-required",
            "requested_xwin_change=upgraded",
            '[ "$xwin_upgrade_required" -eq 0 ] || exit 20',
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
        TAURI_RELEASE_POWERSHELL_HELPER: (  # noqa: F405
            "项目根目录不是独立 Git 顶层目录",
            "release 是重解析点",
            "[IO.FileAttributes]::ReparsePoint",
            "[IO.Directory]::Move",
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
            "release-notes-source-not-regular-file",
            "release-notes-resource-missing",
            "release-notes-resource-mismatch",
            "cmp -s",
            "release_notes=byte-identical",
            "gate.macos_dmg_layout.status=passed",
        ),
        dmg_layout_tests: (
            "test_complete_readonly_volume_layout_passes_and_detaches",
            "test_missing_ds_store_fails_closed_and_detaches",
            "test_wrong_applications_link_and_multiple_apps_are_rejected",
            "test_symlinked_dmg_is_rejected_before_mount",
            "test_missing_or_mismatched_release_notes_resource_is_rejected",
            "test_symlinked_release_notes_source_is_rejected_before_mount",
            "test_non_macos_host_is_not_applicable",
        ),
        release_notes_helper: (
            "ROOT_CARGO_SOURCE_MAPPING",
            "CONVENTIONAL_CARGO_SOURCE_MAPPING",
            "RESOURCE_TARGET",
            "_cargo_root_and_source_mapping",
            "verify_config",
            "verify_bytes",
            "release config resources must contain only the fixed release-notes mapping",
            "bundled release notes bytes do not match the source",
            'subparsers.add_parser("config")',
            'subparsers.add_parser("bytes")',
        ),
        release_notes_tests: (
            "test_accepts_fixed_config_and_byte_identical_bundled_resource",
            "test_accepts_conventional_src_tauri_cargo_root_mapping",
            "test_rejects_missing_or_ambiguous_cargo_manifest_root",
            "test_rejects_missing_or_redirected_resource_mapping",
            "test_rejects_bundled_bytes_that_differ_from_source",
            "test_rejects_symlinked_source_or_bundled_resource",
        ),
        xwin_tests: (
            "test_existing_environment_passes_without_installing",
            "test_missing_environment_is_installed_and_reprobed",
            "test_higher_compatible_cargo_xwin_is_preserved",
            "test_outdated_cargo_xwin_is_upgraded_and_reprobed",
            "test_check_only_reports_outdated_cargo_xwin_without_writes",
            "test_upgrade_failure_does_not_claim_success",
            "test_upgrade_reprobe_rejects_still_outdated_cargo_xwin",
            "test_non_upgradeable_cargo_xwin_is_not_replaced",
            "test_check_only_reports_missing_without_writes",
            "test_missing_homebrew_blocks_install",
            "test_formula_install_failure_does_not_claim_success",
            "test_split_llvm_install_adds_missing_lld_formula",
            "test_damaged_existing_lld_formula_is_not_silently_reinstalled",
            "test_non_macos_host_is_rejected",
            "test_unsupported_target_is_rejected",
        ),
    }
    validate_fragment_contract(
        errors,
        required,
        label="Tauri release contract",
        compile_check=(release_notes_helper, release_notes_tests),
    )
    if tauri_skill.is_file():
        tauri_text = tauri_skill.read_text(encoding="utf-8")
        ordered = (
            "所有会改变字节的布局写入、签名、公证和 stapling 完成后",
            "随后才对最终 DMG/NSIS 及已启用 updater 的 archive/`.sig` 计算 SHA-256",
            "写 manifest 前再次运行只读 `verify-release-review`",
            "manifest 必须记录",
            "所有上述条件分支完成后才把 manifest 写入同一暂存目录",
            "写完 manifest 后必须按每份 manifest 枚举并复算",
            "随后才以不跟随链接的目录级原子替换提交到 `release/`",
            "16. 重新枚举 `release/`",
        )
        positions = [tauri_text.find(fragment) for fragment in ordered]
        if all(position >= 0 for position in positions) and positions != sorted(positions):
            fail(  # noqa: F405
                errors,
                "Tauri release contract order: final bytes and hashes must precede "
                "the second envelope verification and manifest; exact staging must "
                "precede atomic release replacement and final read-only enumeration",
            )
    if BUILD_RELEASE_POSIX_HELPER.is_file() and TAURI_RELEASE_DIRECTORY_HELPER.is_file():  # noqa: F405
        if BUILD_RELEASE_POSIX_HELPER.read_bytes() != TAURI_RELEASE_DIRECTORY_HELPER.read_bytes():  # noqa: F405
            fail(
                errors,
                "Tauri release directory helper must remain byte-identical to the tested CLI POSIX helper",
            )
    if BUILD_RELEASE_POWERSHELL_HELPER.is_file() and TAURI_RELEASE_POWERSHELL_HELPER.is_file():  # noqa: F405
        if BUILD_RELEASE_POWERSHELL_HELPER.read_bytes() != TAURI_RELEASE_POWERSHELL_HELPER.read_bytes():  # noqa: F405
            fail(
                errors,
                "Tauri release directory helper must remain byte-identical to the tested CLI PowerShell helper",
            )


def validate_gui_release_performance_contract(
    errors: list[str],
    *,
    tauri_skill: Path = TAURI_RELEASE_SKILL,  # noqa: F405
    prepare_skill: Path = PREPARE_RELEASE_SKILL,  # noqa: F405
    performance_skill: Path = GUI_RELEASE_PERFORMANCE_SKILL,  # noqa: F405
    performance_reference: Path = GUI_RELEASE_PERFORMANCE_REFERENCE,  # noqa: F405
    performance_helper: Path = GUI_RELEASE_PERFORMANCE_HELPER,  # noqa: F405
    performance_tests: Path = GUI_RELEASE_PERFORMANCE_TESTS,  # noqa: F405
    collect_skill: Path = COLLECT_RELEASE_SKILL,  # noqa: F405
    verify_skill: Path = VERIFY_DELIVERY_SKILL,  # noqa: F405
    e2e_skill: Path = E2E_SKILL,  # noqa: F405
    release_doc: Path = ROOT / "docs" / "RELEASE.md",  # noqa: F405
    verification_doc: Path = VERIFICATION_DOC,  # noqa: F405
) -> None:
    """锁定逐次性能选择及启用、禁用、xwin 三条候选分支。"""
    required = {
        prepare_skill: (
            "`performanceSelection: enabled | disabled`",
            "当前发布请求已经明确时直接复用",
            "产品/渠道硬要求强制启用并记录来源",
            "否则询问用户一次",
            "必须作为本次候选事实在关闭提交中封存",
            "同一发布的修复或进程中断重跑复用原选择，新发布重新解析",
        ),
        tauri_skill: (
            "审查、性能和 macOS 签名选择及来源都只能从关闭状态读取",
            "所有 GUI 候选的 `performanceSelection` 必须精确为 `enabled | disabled`",
            "同一 closing commit 重跑复用，新发布重新由 prepare-release 解析",
            "只有 `performanceSelection: enabled` 或产品/渠道硬要求时",
            "性能已启用时，`milestone_e2e` 或本次 E2E 为 `disabled` 都不得跳过",
            "只在 `performanceSelection: enabled` 时记录 `performanceStatus: Unverified`",
            "选择 `disabled` 时使用下一条 `Not run` 契约",
            "选择 `performanceSelection: disabled` 且无产品/渠道硬要求时",
            "performanceStatus: Not run",
            "不创建 `performanceProbe`、`performanceEvidence`、`performanceThresholdProfile`、`performanceWaiver` 或 `performanceRuntimeBinding`",
            "非空 `performanceReason` 和 `performanceRemainingRisk`",
            "`performanceEvidence`、`performanceProbe`、`performanceProbeSha256`、`performanceThresholdProfile`、`performanceWaiver` 与 `performanceRuntimeBinding` 必须全部缺席",
            "性能选择为 `enabled` 时 `performanceStatus` 为 `Unverified`",
            "选择为 `disabled` 且无硬要求时记录 `performanceStatus: Not run`",
            "performanceStatus: passed | waived",
            "原生 macOS 且性能启用时记录 `performanceStatus: passed | waived`、`performanceThresholdProfile: gui-release-v2`",
            "performanceRuntimeBinding",
            "原生 Windows 且性能启用时使用相同的 `performanceStatus: passed | waived`",
            "原生 Windows 选择关闭时使用下一条 `Not run` 契约",
        ),
        performance_skill: (
            "同一 clean HEAD",
            "Release profile Tauri `--no-bundle`",
            "当次 `performanceSelection: enabled` 或产品/渠道硬要求时调用",
            "选择 `disabled` 且无硬要求时不得调用本 Skill",
            "性能已启用时，即使当前 E2E 为 `disabled` 仍必须执行",
            "manifest 明确包含 `performanceSelection: enabled`",
            "performanceProbeKind: tauri-no-bundle-executable",
            "performanceProbeBuildProfile: release",
            "sourceTreeState: clean",
            "恰好 5 次冷启动",
            "中位数不超过 2400 ms",
            "最大值不超过 3600 ms",
            "至少 20 次",
            "nearest-rank p95 不超过 120 ms",
            "任何一次必须小于 240 ms",
            "全部不短于 50 ms 的 Long Task",
            "任何 Long Task 必须小于 240 ms",
            "整棵进程树",
            "6%；启用托盘时",
            "不超过 2.4%",
            "稳态整棵进程树 RSS 不超过 360 MiB",
            "峰值不超过 600 MiB",
            "max(初始 RSS × 18%, 38.4 MiB)",
            "allProcessesRecovered",
            "performanceRuntimeBinding",
            "DMG/NSIS 容器摘要",
            "performanceStatus: failed",
            "performanceStatus: waived",
            "明确确认就必须停止",
            "本 Skill 不生成 `performanceStatus: Not run`",
        ),
        performance_reference: (
            '"performanceSelection": "enabled"',
            '"performanceProbeKind": "tauri-no-bundle-executable"',
            '"sourceTreeState": "clean"',
            '"probeBytesUnmodified": true',
            '"wholeProcessTree": true',
            '"allProcessesRecovered": true',
            '"performanceRuntimeBinding"',
            "verified-signing-transition",
            "容器 SHA-256 永远不能填入 `performanceProbeSha256`",
            "`performanceSelection: disabled`",
            "`performanceStatus: Not run`",
            "不得生成 `performanceProbe`、`performanceProbeSha256`、`performanceEvidence`、`performanceThresholdProfile`、`performanceWaiver` 或 `performanceRuntimeBinding`",
        ),
        performance_helper: (
            "THRESHOLDS = {",
            '"coldStartRuns": 5',
            '"coldStartMedianMsMaximum": 2400.0',
            '"coldStartMaximumMs": 3600.0',
            '"interactionSamplesMinimum": 20',
            '"interactionP95MsMaximum": 120.0',
            '"interactionSingleMsExclusiveMaximum": 240.0',
            '"longTaskMsMinimum": 50.0',
            '"longTaskMsExclusiveMaximum": 240.0',
            '"idleCpuP95PercentMaximum": 6.0',
            '"hiddenTrayCpuP95PercentMaximum": 2.4',
            '"steadyRssMiBMaximum": 360.0',
            '"peakRssMiBMaximum": 600.0',
            '"rssGrowthPercentMaximum": 18.0',
            '"rssGrowthMiBMinimumAllowance": 38.4',
            "def _nearest_rank_p95",
            'manifest.get("performanceSelection")',
            "manifest.performanceSelection must be 'enabled' for performance validation",
            '_expect_equal(evidence, "performanceSelection", "enabled"',
            "manifest.performanceProbe",
            "manifest.performanceProbeKind",
            "manifest.sourceTreeState",
            "probeBytesUnmodified",
            "wholeProcessTree",
            "allProcessesRecovered",
            "os.replace",
            'parser.add_argument("--probe"',
        ),
        performance_tests: (
            "test_threshold_boundaries_pass_with_e2e_disabled",
            "test_disabled_performance_selection_is_rejected",
            "test_debug_or_cross_compiled_probe_cannot_pass",
            "test_manifest_must_name_clean_head_no_bundle_probe",
            "test_rebuilding_probe_or_stale_source_binding_invalidates_evidence",
            "test_requires_five_starts_twenty_interactions_and_observation",
            "test_latency_and_long_task_fail_at_exclusive_limits",
            "test_cpu_rss_and_growth_budgets_are_independent",
            "test_tray_profile_controls_hidden_sampling",
            "test_parent_only_sampling_or_failed_cleanup_cannot_pass",
            "test_cli_preserves_failed_observations_and_never_implies_waiver",
        ),
        collect_skill: (
            "performanceSelection",
            "performanceStatus: Not run",
            "非空 `performanceReason` 与 `performanceRemainingRisk`",
            "`performanceEvidence`、`performanceProbe`、`performanceProbeSha256`、`performanceThresholdProfile`、`performanceWaiver` 和 `performanceRuntimeBinding` 全部缺席",
            "performanceStatus: Unverified",
            "performanceThresholdProfile: gui-release-v2",
            "performanceRuntimeBinding",
            "waived` 必须继续引用原始 `failed` 证据",
        ),
        verify_skill: (
            "按每个 GUI manifest 的 `performanceSelection` 条件复核性能",
            "`enabled`：复核打包前 `$desktop-test-gui-release-performance`",
            "performanceThresholdProfile: gui-release-v2",
            "证据的 `thresholdProfile` 必须同为 `gui-release-v2`",
            "`disabled`：只有不存在产品/渠道性能硬要求时才接受 `performanceStatus: Not run`",
            "非空 `performanceReason`、`performanceRemainingRisk`",
            "`performanceEvidence`、`performanceProbe`、`performanceProbeSha256`、`performanceThresholdProfile`、`performanceWaiver` 和 `performanceRuntimeBinding` 全部缺席",
            "performanceProbeSha256",
            "performanceRuntimeBinding",
            "DMG/NSIS 容器摘要本身不构成运行时绑定",
        ),
        e2e_skill: (
            "`$desktop-test-gui-release-performance`",
            "GUI 性能按 manifest 的当次 `performanceSelection` 独立处理",
            "选择 `enabled` 或产品/渠道硬要求时",
            "选择 `disabled` 且无硬要求时",
            "performanceStatus: Not run",
            "最终候选 E2E 通过也不能替代性能结论",
            "安装容器摘要不能冒充探针摘要",
        ),
        release_doc: (
            "GUI 性能和 macOS 签名选择也在该入口按当前请求、产品事实与渠道要求锁定",
            "产品或渠道硬要求强制启用",
            "performanceSelection",
            "performanceStatus: passed | waived | Not run | Unverified",
            "release-profile no-bundle 探针候选",
            "一次预热后 5 次冷启动中位数 ≤2.4 秒且最大 ≤3.6 秒",
            "至少 20 次代表性交互 p95 ≤120ms 且单次 <240ms",
            "稳定 RSS ≤360 MiB、峰值 ≤600 MiB",
            "仍无法安全解决时才询问",
            "封存为 `disabled` 且无硬要求时不生成探针",
            "没有探针、性能证据或运行时绑定字段",
        ),
        verification_doc: (
            "GUI 发布性能是逐次选择",
            "整个 Tauri/WebView 进程树",
            "用户显式继续只能记录 `performanceStatus: waived`",
            "选择 `disabled` 且无硬要求时允许 `performanceStatus: Not run`",
            "不得伪造探针、性能证据或运行时绑定",
            "渠道要求下 `Not run` 或 `Unverified` 都不能满足发布条件",
        ),
    }
    validate_fragment_contract(
        errors,
        required,
        label="GUI performance contract",
        compile_check=(performance_helper, performance_tests),
    )


def validate_release_selection_contract(
    errors: list[str],
    *,
    prepare_skill: Path = PREPARE_RELEASE_SKILL,  # noqa: F405
    branch_skill: Path = BRANCH_CHAIN_SKILL,  # noqa: F405
    branch_operations: Path = BRANCH_CHAIN_OPERATIONS,  # noqa: F405
    branch_state: Path = BRANCH_CHAIN_STATE,  # noqa: F405
    branch_cli: Path = BRANCH_CHAIN_SCRIPT,  # noqa: F405
    branch_tests: Path = BRANCH_CHAIN_TESTS,  # noqa: F405
    rust_skill: Path = BUILD_RELEASE_SKILL,  # noqa: F405
    tauri_skill: Path = TAURI_RELEASE_SKILL,  # noqa: F405
    collect_skill: Path = COLLECT_RELEASE_SKILL,  # noqa: F405
    verify_skill: Path = VERIFY_DELIVERY_SKILL,  # noqa: F405
    e2e_skill: Path = E2E_SKILL,  # noqa: F405
    release_doc: Path = ROOT / "docs" / "RELEASE.md",  # noqa: F405
    verification_doc: Path = VERIFICATION_DOC,  # noqa: F405
) -> None:
    """锁定发布选择与分支关闭状态同提交原子封存、只读消费契约。"""

    required = {
        prepare_skill: (
            "`reviewSelection: enabled | disabled`",
            "安全、隐私、不可逆操作、对外兼容契约或产品/渠道硬要求强制启用并记录来源",
            "否则询问用户一次",
            "必须作为本次候选事实在关闭提交中封存",
            "同一发布的修复或进程中断重跑复用原选择，新发布重新解析",
            "目标含 macOS GUI 时还在任何提交前按 `$desktop-build-tauri-release` 的同一优先级解析并锁定",
            "macOS 同时 `system_notification = enabled` 且签名关闭",
            "不得先提交、关闭分支链、自动补签或用 E2E 关闭绕过",
            "python3 -B scripts/validate_harness.py --release-review",
            "`reviewStatus: Not run`",
            "`reviewReason`",
            "`reviewRemainingRisk`",
            "禁止生成 `reviewEvidence`、完成声明或 `reviewedSourceCommit`",
            "`reviewedSourceCommit = sourceHead`",
            "不得只传裸选择，也不得让 helper 补成 `passed` 或推断产品适用性",
            "逐提交验证审查终点之后只改发布日志/被触发 Changelog",
            "即使某路径后来恢复原状",
            "完整 `releaseReview`、`candidateSelections` 与 `lastClosedChain` 在同一个关闭状态提交中原子封存",
            "verify-release-review",
            "不能继续依赖对话内参数、重复询问这些选择或自行制造证据",
            "构建开始前、写 manifest 前均须复核",
            "再次运行 `$desktop-manage-git-branch-chain verify-release-review`",
            "两份封存信封与 manifest 字段必须逐字段一致",
            "就绪复核阶段保持纯只读",
            "不得更新 tracked 发布记录、Verification、Changelog、Product Status、版本状态或其他项目记忆",
            "只有真实渠道发布成功后",
            "后续独立受管 feature 生命周期中记录发布/Verification/项目状态事实",
        ),
        branch_skill: (
            "任何正式发布请求必须先路由 `$desktop-prepare-release`",
            "在任何发布提交前锁定本次 `reviewSelection`",
            "只有该流程可把本命令作为下游 Git 机械 consumer 调用",
            "都不得单独执行 `release`",
            "helper 本身不解析、补写或推断语义审查证据",
            "首次关闭必须显式传入完整审查信封与 `candidateSelections`",
            "不得传 `Not run` 原因/风险",
            "关闭时状态精确为 `Not run`",
            "性能启用来源只接受 `requested|product-required|channel-required`",
            "macOS 签名启用来源只接受 `configured|requested|channel-required`",
            "不适用时两者都为 `not-applicable` 且无原因/风险",
            "helper 逐提交检查 `sourceHead..preCloseHead`",
            "即使后续恢复最终树",
            "verify-release-review",
            "重试可省略全部审查/候选选择参数，若重复传入则必须逐字段等于已封存信封",
            "旧关闭提交只允许在远端事务已经完成时做本地收尾",
            "绝不能新推进远端 `Release`",
        ),
        branch_state: (
            "def validate_release_review(value: object)",
            '"scopeDiffSha256",\n        "reviewedSourceCommit",\n        "checks",',
            'value["checks"] != RELEASE_REVIEW_CHECKS',
            'value["status"] != "Not run"',
            'value["reviewedSourceCommit"] is not None',
            "def validate_candidate_selections(value: object)",
            '"performanceReason",\n        "performanceRemainingRisk",\n        "macosSigningSelection",',
            '"macosSigningReason",\n        "macosSigningRemainingRisk",',
            'performance_source\n            not in {"requested", "product-required", "channel-required"}',
            'if performance_source not in {"requested", "not-requested"}:',
            'performance_source\n            not in '
            '{"requested", "product-required", "channel-required"}\n'
            '            or value["performanceReason"] is not None',
            'signing_source not in {"configured", "requested", "channel-required"}',
            'if signing_source != "not-requested":',
            'or value["macosSigningReason"] is not None',
            'extensions = {"releaseReview", "candidateSelections"}',
            "set(value) not in (required, required | extensions)",
        ),
        branch_operations: (
            "def release_post_review_paths(",
            '["rev-list", "--reverse", f"{source_head}..{pre_close_head}"]',
            '"--root",',
            '"--no-renames",',
            "post-review commits may change only release-notes.json and dated Changelog files",
            "def build_release_review(",
            "return validate_release_review(",
            "def build_candidate_selections(",
            "prepare-release 显式提交的候选选择，不做产品推断",
            "def require_retry_review_arguments_match(",
            "if supplied_selections != selections:",
            "retry candidate selections do not match the sealed release state",
            "def verify_release_review(",
            "current closing commit has no releaseReview",
            "release review verification requires a completed remote transaction",
            "release review verification requires completed local cleanup",
            '"releaseReview": review,',
            '"candidateSelections": closed["candidateSelections"],',
            '"releaseReview": release_review,',
            '"candidateSelections": candidate_selections,',
            'if "releaseReview" not in closed and remote_state == "pending":',
            "a legacy closing commit without releaseReview cannot update remote Release",
        ),
        branch_cli: (
            "verify_release_review,",
            '"verify-release-review", help="只读验证当前 Release 的封存审查信封"',
            'release.add_argument("--review-status", choices=("passed", "Not run"))',
            '"--performance-selection", choices=("enabled", "disabled", "not-applicable")',
            '"--macos-signing-selection",',
            'choices=("enabled", "disabled", "not-applicable"),',
            'elif arguments.command == "verify-release-review":',
            "result = verify_release_review(arguments.project_root, arguments.remote)",
        ),
        branch_tests: (
            "test_release_atomically_updates_release_and_cleans_two_branch_chain",
            "test_release_requires_review_envelope_before_creating_close_commit",
            "test_release_does_not_infer_enabled_review_evidence",
            "test_legacy_close_without_review_cannot_update_remote_release",
            "test_release_seals_disabled_review_as_not_run",
            "test_release_seals_gui_candidate_choices_with_review",
            "test_release_allows_only_release_metadata_after_review_source",
            "test_release_rejects_source_change_after_review_source",
            "test_release_rejects_post_review_source_change_then_revert",
            "test_candidate_selections_require_every_field",
            "test_candidate_selections_reject_invalid_source_and_reason_combinations",
            "test_release_retry_rejects_candidate_selection_mismatch",
            "test_remote_hook_rejection_keeps_atomic_refs_and_retry_reuses_close_commit",
            "test_remote_success_then_local_transaction_failure_is_retryable_without_push",
        ),
        rust_skill: (
            "在任何测试、编译或 `release/` 清理前先调用 `$desktop-manage-git-branch-chain verify-release-review`",
            "当前 clean `Release` closing commit",
            "`lastClosedChain.releaseReview` 与 `candidateSelections`",
            "Rust 非 GUI 候选要求后者的性能与 macOS 签名选择都精确为 `not-applicable`",
            "不能从对话参数补写、重新询问或推断",
            "同一 closing commit 重跑复用其信封",
            "构建 Skill 不自行执行发布语义审查",
            "要求它逐字等于上一步已验证的 `releaseHead`",
            "在写 manifest 前再次运行只读 `verify-release-review`",
            "要求返回的 `releaseHead`/完整信封逐字段等于第 1 步",
            "结构化 `reviewEvidence` 必须逐字段复制信封",
            "`reviewEvidence` 与 `reviewedSourceCommit` 都缺席",
        ),
        tauri_skill: (
            "在任何测试、编译或 `release/` 清理前先调用 `$desktop-manage-git-branch-chain verify-release-review`",
            "当前 clean `Release` closing commit",
            "`lastClosedChain.releaseReview` 与 `candidateSelections`",
            "审查、性能和 macOS 签名选择及来源都只能从关闭状态读取",
            "不能从对话参数补写、重新询问、改变或推断",
            "所有 GUI 候选的 `performanceSelection` 必须精确为 `enabled | disabled`",
            "当前候选目标包含 macOS 时 `macosSigningSelection` 必须精确为 `enabled | disabled`",
            "不含 macOS 时则必须精确为 `not-applicable`",
            "要求它逐字等于上一步已验证的 `releaseHead`",
            "写 manifest 前再次运行只读 `verify-release-review`",
            "`releaseHead`、`releaseReview` 与 `candidateSelections` 逐字段等于第 1 步",
            "结构化 `reviewEvidence` 必须逐字段复制信封",
            "`reviewEvidence`/`reviewedSourceCommit` 缺席",
            "`macosSigningSelection: enabled | disabled`",
            "其余固定为 `disabled/not-requested`",
            "`disabled/not-requested`：不得运行 `scripts/probe-macos-notarization.sh`",
            "`enabled`：才运行 `scripts/probe-macos-notarization.sh`",
            "`macosSigningSource` 按 `channel-required > requested > configured > not-requested`",
            "不得以 `--no-sign` 重试或静默降级",
            "本机恰好存在身份、工具、环境变量或 Keychain profile 只表示可用性，绝不能自行改变选择",
            "CI=true TAURI_BUNDLER_DMG_IGNORE_CI=1 pnpm tauri build --bundles dmg --no-sign --config src-tauri/tauri.release.conf.json",
            "只接受 `ready` 后才以同一已批准 Finder 布局策略运行 `CI=true TAURI_BUNDLER_DMG_IGNORE_CI=1 pnpm tauri build --bundles dmg --config src-tauri/tauri.release.conf.json`",
            "`system_notification = enabled` 而封存签名选择是 `disabled/not-requested`",
            "E2E `disabled` 也不能绕过",
        ),
        collect_skill: (
            "`reviewSelection`",
            "`reviewStatus`",
            "`macosSigningSelection`/`macosSigningSource`",
            "收集阶段不得补问、推断或改变任何选择",
            "在接触目标目录前先调用 `$desktop-manage-git-branch-chain verify-release-review`",
            "只接受当前 clean `Release` closing commit",
            "所有源 manifest 的 `sourceCommit` 必须等于该 `releaseHead`",
            "不能用活动请求、对话或单个提供方 manifest 补齐缺失记录",
            "再次只读运行 `verify-release-review`",
            "逐字段比对两份信封与 manifest",
            "`reviewedSourceCommit` 与 `reviewEvidence` 终点一致",
            "多个来源按 `channel-required > requested > configured > not-requested` 唯一化",
            "关闭时 `notarizationEvidence` 和探测派生签名证据必须缺席",
        ),
        verify_skill: (
            "先运行 `$desktop-manage-git-branch-chain verify-release-review`",
            "当前是完成远端和本地收尾的 clean `Release` closing commit",
            "把该 `releaseHead` 和两份规范信封锁定为准入快照",
            "manifest `sourceCommit` 等于返回的 `releaseHead`",
            "逐字段来自返回的 `releaseReview`/`candidateSelections`",
            "发布语义审查只读取 manifest 的当次 `reviewSelection`",
            "`reviewStatus: passed`",
            "`reviewStatus: Not run`",
            "`reviewEvidence` 与 `reviewedSourceCommit` 缺席",
            "它必须是 manifest `sourceCommit` 的祖先",
            "`macosSigningSelection`/`macosSigningSource`",
            "关闭时不得有探测派生证据或 `notarizationEvidence`",
            "多个来源按 `channel-required > requested > configured > not-requested` 唯一化",
            "`system_notification = enabled` 的 macOS 候选若为 `disabled/not-requested` 或实际 unsigned",
            "不得由 E2E `disabled`、waiver 或 `Unverified` 绕过",
            "在写入任何验收状态前再次只读运行 `verify-release-review`",
            "与准入快照逐字段相等",
            "重新计算全部最终制品、相邻摘要、manifest 声明、包内关键资源和当前 `release/` 精确集合",
            "不能只沿用 E2E 前的摘要",
            "于项目根同级、同一文件系统的唯一 staging 复制当前 `release/` 精确集合",
            "在 staging 内原子写入全部 manifests 的同一整组 `milestoneAcceptance` 结论",
            "绝不得产生 accepted/pending、accepted/rejected 或其他 mixed 状态",
            "把 staging 一次目录级原子替换为 `release/`",
            "替换后只读重新枚举并复算整组状态",
            "不得直接写 tracked `docs/verification/`",
        ),
        e2e_skill: (
            "`disabled/not-requested` 或实际 unsigned 必须在读取权限前失败",
            "不能以 E2E `disabled` 或 `Unverified` 绕过",
            "也不能由本 Skill 补签",
            "只把这些结果交回 `$desktop-verify-delivery` 作为待原子写入的候选证据",
            "不写 tracked Verification",
            "所有场景和清理结束时",
            "重新计算全部最终制品、相邻摘要、manifest 声明及适用包内关键资源",
            "不得只声称“字节变化会使证据失效”而跳过结束复算",
        ),
        release_doc: (
            "把显式 `releaseReview` 与 `candidateSelections` 和链关闭状态写入同一个 closing commit",
            "审查后的每个提交只能触碰发布日志或被触发 Changelog",
            "先改其他路径再恢复也阻断",
            "旧式无两份信封的关闭提交不能新推进远端 `Release`",
            "候选构建在清理目录、测试或编译前，以及写 manifest 前，都必须只读运行 `$desktop-manage-git-branch-chain verify-release-review`",
            "两次返回的 `releaseHead`、`releaseReview` 和 `candidateSelections` 必须逐字段一致",
            "都从封存字段原样复制，不得从对话补写或重新解释",
            "E2E 仍在构建阶段按当前候选单独解析",
            "同一发布修复重跑复用，新发布重新询问",
            "manifest 另记录 `reviewedSourceCommit`",
            "关闭审查时 `reviewedSourceCommit` 与 `reviewEvidence` 一并缺席",
            "macOS 默认 `macosSigningSelection: disabled`",
            "不探测本机身份或公证凭据",
            "只有已批准持久配置、本次主动要求或渠道硬要求才启用并探测",
            "macosSigningSource: configured | requested | channel-required | not-requested",
            "channel-required > requested > configured > not-requested",
            "候选构建一律从完成远端和本地收尾的 clean `Release` closing commit 只读验证并消费",
            "不能现场解析、补写或从对话恢复这些值",
            "`system_notification = enabled` 与关闭签名冲突时必须在任何提交前停止",
            "不能由 E2E `disabled` 掩盖",
        ),
        verification_doc: (
            "非必要语义审查只读取当前发布 manifest 的 `reviewSelection`",
            "安全、隐私、不可逆操作、对外兼容契约或产品/渠道硬要求不能被关闭",
            "等于累计差异终点的 `reviewedSourceCommit`",
            "日常 `python3 scripts/validate_harness.py`；发布审查启用时追加 `--release-review`",
            "`disabled/not-requested` 或实际 unsigned 是不可验收的运行前提冲突",
            "不能被 E2E `disabled`、waiver 或 `Unverified` 掩盖",
        ),
        ROOT / "AGENTS.md": (  # noqa: F405
            "非必要语义审查不得混入日常开发",
            "明确发布时才按当次 `reviewSelection` 询问并执行",
            "python3 -B scripts/validate_harness.py --release-review",
        ),
        TAURI_RELEASE_SKILL.parent / "references" / "tauri-macos-windows.md": (  # noqa: F405
            "签名意图先于测试、可用性探测和 bundle",
            "其他情况固定为 `disabled/not-requested`",
            "直接以显式 `--no-sign` DMG 命令打包且不得探测本机身份、凭据或 Keychain profile",
            "已启用签名时才检查完整条件",
            "`macosSigningSource` 固定按 `channel-required > requested > configured > not-requested`",
            "`system_notification = enabled` 是例外的运行前提冲突，不是新的签名来源",
            "不得暗中 ad-hoc 签名，也不得用 E2E `disabled` 掩盖不可验收组合",
        ),
    }
    validate_fragment_contract(
        errors,
        required,
        label="release selection contract",
        compile_check=(branch_operations, branch_state, branch_cli, branch_tests),
    )

    tauri_text = tauri_skill.read_text(encoding="utf-8") if tauri_skill.is_file() else ""
    early_intent = "审查、性能和 macOS 签名选择及来源都只能从关闭状态读取"
    first_dmg_build = "pnpm tauri build --bundles dmg"
    if (
        early_intent in tauri_text
        and first_dmg_build in tauri_text
        and tauri_text.index(early_intent) > tauri_text.index(first_dmg_build)
    ):
        errors.append(
            f"release selection contract: {tauri_skill} must lock macOS signing intent "
            "before the first DMG bundle command"
        )

    verify_text = verify_skill.read_text(encoding="utf-8") if verify_skill.is_file() else ""
    verify_order = (
        "把该 `releaseHead` 和两份规范信封锁定为准入快照",
        "7. E2E 为 `enabled` 或硬要求时调用 `$desktop-test-final-artifact-e2e`",
        "在写入任何验收状态前再次只读运行 `verify-release-review`",
        "重新计算全部最终制品、相邻摘要、manifest 声明、包内关键资源和当前 `release/` 精确集合",
        "于项目根同级、同一文件系统的唯一 staging 复制当前 `release/` 精确集合",
        "在 staging 内原子写入全部 manifests 的同一整组 `milestoneAcceptance` 结论",
        "把 staging 一次目录级原子替换为 `release/`",
        "替换后只读重新枚举并复算整组状态",
    )
    verify_positions = [verify_text.find(fragment) for fragment in verify_order]
    if all(position >= 0 for position in verify_positions) and verify_positions != sorted(
        verify_positions
    ):
        fail(  # noqa: F405
            errors,
            "release selection contract order: delivery verification must finish real "
            "checks, reverify the closing state and final bytes, then update the whole "
            "manifest group in staging before one atomic replacement and read-only check",
        )


def validate_release_git_contract(
    errors: list[str],
    *,
    prepare_skill: Path = PREPARE_RELEASE_SKILL,  # noqa: F405
    release_doc: Path = ROOT / "docs" / "RELEASE.md",  # noqa: F405
    readme: Path = ROOT / "README.md",  # noqa: F405
) -> None:
    """锁定明确发布的本地提交授权、精确范围和 clean HEAD 构建边界。"""
    required = {
        prepare_skill: (
            "用户明确提出发布时，该请求本身授权",
            "不再追加提交或构建审批",
            "活动链与 `Release` 的受管推送",
            "该窄授权不包含配置 remote/凭据、无精确期望 OID 的 force push、标签、上传、渠道发布、历史改写",
            "release_git.py inspect --project-root .",
            "release_git.py commit --project-root .",
            "--expected-status-sha256",
            "--path <reviewed-path>",
            "明确发布请求已经授权此提交，不再询问第二次审批",
            "literal pathspec",
            "绝不传 `--no-verify`",
            "工作树原本 clean 时不创建空源码提交",
            "$desktop-manage-git-branch-chain publish",
            "$desktop-manage-git-branch-chain release",
            "以一次 atomic push 把完整线性历史快进到精确 `Release`",
            "逐 ref lease 删除状态文件精确列出的远端 feature refs",
            "构建所用 `sourceCommit` 必须等于该 `releaseHead`",
            "从 `Release` 到 `main`、`master` 或动态远端默认分支",
            "始终由用户自行 Merge/PR",
            "不再询问是否提交或是否开始构建",
            "普通构建不自动提交",
        ),
        RELEASE_GIT_HELPER: (  # noqa: F405
            "statusSha256",
            "repository_snapshot_digest",
            "working tree changed after review",
            "literal_pathspecs",
            "index contains staged paths outside the reviewed scope",
            "reviewed paths do not cover the complete working tree",
            "potential secret detected in reviewed staged bytes",
            "hooks were not bypassed",
            "commit succeeded but working tree is not clean",
            "protected branch-chain state is missing or not a regular file",
            "release commit requires an active managed feature chain",
            "current feature branch is not the registered active leaf",
            "remote default branch or OID changed after the chain was registered",
            "main, master, the remote default branch, and Release are read-only here",
            'PurePosixPath(".harness"),',
            'PurePosixPath(".harness/git-branch-chain.json"),',
            'inspect.add_argument("--project-root"',
            'commit.add_argument("--expected-status-sha256"',
            'commit.add_argument("--path", action="append", required=True)',
        ),
        RELEASE_GIT_HELPER_TESTS: (  # noqa: F405
            "test_inspect_reports_exact_head_and_dirty_snapshot",
            "test_commit_stages_only_reviewed_paths_and_finishes_clean",
            "test_changed_snapshot_is_rejected_before_staging",
            "test_branch_switch_invalidates_reviewed_snapshot",
            "test_commit_rejects_unregistered_feature_branch",
            "test_commit_rejects_remote_default_branch_drift",
            "test_commit_rejects_protected_and_release_branches",
            "test_unreviewed_path_blocks_partial_commit",
            "test_existing_unreviewed_staged_path_is_rejected",
            "test_failing_hook_stops_without_advancing_head",
            "test_high_confidence_secret_stops_without_advancing_head",
            "test_unsafe_or_empty_commit_scope_is_rejected",
        ),
        release_doc: (
            "## 发布分支与制品目录",
            "明确“构建发布候选”“发布”或“准备并构建发布”请求本身授权",
            "普通开发构建/本地试包不升级为候选，也不提交或关闭链路",
            "不授权 tag、上传、商店提交、真实渠道发布或 `Release` 到默认分支",
            "从新的源码 HEAD",
            "以单次 atomic push 快进 `Release` 并按 lease 删除登记的远端链",
            "最终必须位于 clean `Release`",
            "构建 `sourceCommit` 固定等于该值",
            "`Release` 到默认分支的 Merge/PR 永远由用户自行完成",
        ),
        readme: (
            "$desktop-manage-git-branch-chain",
            "把登记的完整线性链快进到精确 `Release`",
            "以逐 ref lease 原子删除远端链路后清理本地链路",
            "从该关闭提交构建，不重复审批",
            "普通“构建/打包/本地试包”不会自动升级为发布候选、提交或关闭分支链",
            "`Release` 到默认分支的 Merge/PR 始终由你完成",
        ),
    }
    validate_fragment_contract(
        errors,
        required,
        label="release Git contract",
        compile_check=(RELEASE_GIT_HELPER, RELEASE_GIT_HELPER_TESTS),  # noqa: F405
    )


def validate_release_contract(errors: list[str]) -> None:
    """汇总 release ignore、helper 和构建/收集阶段的确定性契约。"""
    for path in (GITIGNORE, RUST_ASSET / ".gitignore"):  # noqa: F405
        validate_release_ignore(errors, path)
    validate_build_skill_contract(errors)
    validate_tauri_local_install_contract(errors)
    validate_tauri_build_skill_contract(errors)
    validate_gui_release_performance_contract(errors)
    validate_release_selection_contract(errors)
    validate_release_git_contract(errors)

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
            "### 候选前本地提交与更新日志阶段",
            "### 就绪复核阶段",
            "release_git.py inspect --project-root .",
            "statusSha256",
            "release_git.py commit --project-root . --expected-status-sha256",
            "明确发布请求已经授权此提交",
            "literal pathspec",
            "正常运行 hooks 且绝不传 `--no-verify`",
            "工作树原本 clean 时不创建空源码提交",
            "构建所用 `sourceCommit` 必须等于该 `releaseHead`",
            "release_notes.py upsert --file release-notes.json",
            "release_notes.py check --file release-notes.json --expected-version",
            "release_notes.py render --file release-notes.json --locale zh-CN",
            "release_notes.py render --file release-notes.json --locale en-US",
            "--feature-optimization-zh-cn",
            "--feature-optimization-en-us",
            "schemaVersion: 2",
            "-----------更新日志 {发布日期} {发布版本}----------",
            "###功能优化",
            "###问题修复",
            "-----------Release notes {release date} {release version}----------",
            "###Feature optimizations",
            "###Bug fixes",
            "只保留最近 5 版",
            "候选验收后只允许 `check`/`render` 读取",
            "目录存在绝不表示已满足发布就绪条件",
            "结构化 `signingEvidence`",
            "不得在此重试或配置签名、公证或 stapling",
            "notarizationStatus: notarized-and-stapled",
        ),
        RELEASE_NOTES_HELPER: (  # noqa: F405
            "MAX_RELEASES = 5",
            "MAX_ITEMS_PER_SECTION = 10",
            "SCHEMA_VERSION = 2",
            'SUPPORTED_LOCALES = ("zh-CN", "en-US")',
            "_pair_localized_items",
            "normalize_display_version",
            "validate_document",
            "os.replace(temporary_name, path)",
            '"title": "更新日志"',
            '"featureOptimizations": "功能优化"',
            '"bugFixes": "问题修复"',
            '"title": "Release notes"',
            '"featureOptimizations": "Feature optimizations"',
            '"bugFixes": "Bug fixes"',
            "--feature-optimization-zh-cn",
            "--feature-optimization-en-us",
            'subparsers.add_parser("check"',
            'subparsers.add_parser("render"',
            'subparsers.add_parser("upsert"',
        ),
        RELEASE_NOTES_HELPER_TESTS: (  # noqa: F405
            "test_upsert_normalizes_version_and_renders_exact_sections",
            "test_upsert_replaces_same_version_and_retains_latest_five",
            "test_rejects_more_than_ten_items_and_empty_release",
            "test_rejects_missing_translation_or_unknown_locale",
            "test_rejects_malformed_document_and_wrong_latest_version",
            "test_rejects_symlinked_release_notes",
        ),
        RELEASE_GIT_HELPER: (  # noqa: F405
            "statusSha256",
            "repository_snapshot_digest",
            "literal_pathspecs",
            "hooks were not bypassed",
            "potential secret detected",
            "project root must equal the independent Git top level",
            "release metadata or Git internals cannot be approved",
            "working tree changed after review",
        ),
        ENGINEERING_RULES: (  # noqa: F405
            "GUI 交互事件必须绑定在实际拥有该动作的语义元素本身",
            "表格中的 `Switch` 只能在用户操作该 `Switch` 时切换",
            "GUI 中用于恢复页面工作上下文的纯交互状态必须在当前应用进程内跨路由保留",
            "只有查询成功、当前页码大于 1 且该页结果为空时",
            "所有用户可见版本号必须在展示边界先移除已有 `v`/`V` 前缀",
            "根 `release-notes.json` 是下游面向最终用户的发布更新日志事实",
            "使用 `schemaVersion: 2`",
            "非空 `zh-CN` 与 `en-US` 文案绑定为一个翻译对",
            "按最新在前只保留近 5 个版本",
        ),
        ROOT / "docs" / "RELEASE.md": (  # noqa: F405
            "## 用户可见版本与更新日志",
            "所有面向用户显示的版本号统一使用且只使用一个小写 `v` 前缀",
            "-----------更新日志 {发布日期} {发布版本}----------",
            "###功能优化",
            "###问题修复",
            "schemaVersion: 2",
            "--feature-optimization-zh-cn",
            "render --locale en-US",
            "###Feature optimizations",
            "releaseNotesVersion",
            "releaseNotesSha256",
            "releaseNotesPath",
            "再运行更新日志脚本的 `check --expected-version`",
        ),
        ROOT / "docs" / "CLI_CONTRACT.md": (  # noqa: F405
            "`--version` 的人类可见输出",
            "一个小写 `v` 前缀",
            "JSON `meta`、协议字段和 SemVer 比较值继续使用不带 `v` 的机器版本",
        ),
        ROOT / "docs" / "RUST_CLI_TEMPLATE.md": (  # noqa: F405
            "GUI 交互事件必须绑定在拥有动作的按钮、链接、`Switch`、`Checkbox` 或菜单项本身",
            "表格中的 `Switch` 不得因点击行而切换",
            "GUI 活动选项卡、查询/筛选、排序、分页页码/每页数量",
            "加载/错误和第 1 页空结果不得触发循环",
            "所选关于页包含检查更新、更新日志",
            "schema v2 中英文翻译对",
            "version = concat!(\"v\", env!(\"CARGO_PKG_VERSION\"))",
        ),
        ROOT / "README.md": (  # noqa: F405
            "当前版本：v",
            "父级容器不得代理子动作",
            "GUI 的活动选项卡、查询/筛选、排序和分页",
            "成功查询的当前页大于 1 且为空",
            "每版两类各至多 10 个翻译对并只保留近 5 版",
        ),
        PRODUCT_SPEC: (  # noqa: F405
            "HARNESS-FEAT-INTERACTION-RELEASE-NOTES-VERSION-DISPLAY",
            "HARNESS-FEAT-BILINGUAL-INITIALIZATION-AND-RELEASE-NOTES",
            "页面交互事件必须绑定到实际拥有动作",
            "选择关于页时，其更新区在“检查更新”旁",
            "所有用户可见版本号带且只带一个小写 `v`",
            "HARNESS-FEAT-GUI-PROCESS-SESSION-STATE",
            "应用根 Jotai store 的页面级模块 atom",
            "查询成功、当前页码大于 1 且该页结果为空",
        ),
    }
    validate_fragment_contract(
        errors,
        helper_fragments,
        label="release contract",
        compile_check=(RELEASE_NOTES_HELPER, RELEASE_NOTES_HELPER_TESTS),  # noqa: F405
    )
