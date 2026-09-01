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
            "固定的 `confirm_candidate_build`、`version`、`source_commit` 和 `e2e_selection` 输入",
            "把完整的项目根同级暂存目录原子重命名到其位置",
            "上传三个明确的归档/校验和/清单路径",
            "milestoneAcceptance: pending",
            "e2eSelection",
            "releaseNotesVersion",
            "releaseNotesSha256",
            "releaseNotesPath: release-notes.json",
            "矩阵本身不得运行 E2E",
            "不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification",
        ),
        collect_skill: (
            "releaseNotesVersion",
            "releaseNotesSha256",
            "releaseNotesPath",
            "不得在收集时改写",
            "只在当前 manifests、其声明的相邻制品证据和最终回复中记录",
            "不得创建或更新 Product Spec、ADR、Changelog、Product Status、Work Plan 或 Verification",
            "独立触发的验收或发布由对应 Skill 记录自身新增证据",
        ),
    }
    validate_fragment_contract(errors, required, label="release contract")


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
            "不要求 GUI-only 项目保留 CLI 构建 Skill",
            "scripts/macos-tauri-xwin-gates.sh --install-missing --target x86_64-pc-windows-msvc",
            "CI=true TAURI_BUNDLER_DMG_IGNORE_CI=1 pnpm tauri build --bundles dmg",
            "headless runner 不得盲目启用",
            "scripts/verify-dmg-layout.sh <final-dmg> <project-root>/release-notes.json",
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
            "随后才对最终 DMG/NSIS 及已启用 updater 的 archive/`.sig` 计算 SHA-256",
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
    if BUILD_RELEASE_POSIX_HELPER.is_file() and TAURI_RELEASE_DIRECTORY_HELPER.is_file():  # noqa: F405
        if BUILD_RELEASE_POSIX_HELPER.read_bytes() != TAURI_RELEASE_DIRECTORY_HELPER.read_bytes():  # noqa: F405
            fail(
                errors,
                "Tauri release directory helper must remain byte-identical to the tested CLI POSIX helper",
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
            "传给 `$desktop-build-tauri-release`",
            "同一发布的修复重跑复用原选择，新发布重新询问",
        ),
        tauri_skill: (
            "当次 `performanceSelection: enabled | disabled`",
            "产品/渠道硬要求强制为 `enabled` 并记录来源",
            "否则在任何测试或编译前询问用户一次，可与尚未解析的 E2E 选择同轮询问",
            "性能选择没有持久默认值",
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
            "performanceThresholdProfile: gui-release-v1",
            "performanceRuntimeBinding",
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
            "中位数不超过 2000 ms",
            "最大值不超过 3000 ms",
            "至少 20 次",
            "nearest-rank p95 不超过 100 ms",
            "任何一次必须小于 200 ms",
            "全部不短于 50 ms 的 Long Task",
            "任何 Long Task 必须小于 200 ms",
            "整棵进程树",
            "5%；启用托盘时",
            "不超过 2%",
            "稳态整棵进程树 RSS 不超过 300 MiB",
            "峰值不超过 500 MiB",
            "max(初始 RSS × 15%, 32 MiB)",
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
            '"coldStartMedianMsMaximum": 2000.0',
            '"coldStartMaximumMs": 3000.0',
            '"interactionSamplesMinimum": 20',
            '"interactionP95MsMaximum": 100.0',
            '"interactionSingleMsExclusiveMaximum": 200.0',
            '"longTaskMsMinimum": 50.0',
            '"longTaskMsExclusiveMaximum": 200.0',
            '"idleCpuP95PercentMaximum": 5.0',
            '"hiddenTrayCpuP95PercentMaximum": 2.0',
            '"steadyRssMiBMaximum": 300.0',
            '"peakRssMiBMaximum": 500.0',
            '"rssGrowthPercentMaximum": 15.0',
            '"rssGrowthMiBMinimumAllowance": 32.0',
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
            "performanceThresholdProfile: gui-release-v1",
            "performanceRuntimeBinding",
            "waived` 必须继续引用原始 `failed` 证据",
        ),
        verify_skill: (
            "按每个 GUI manifest 的 `performanceSelection` 条件复核性能",
            "`enabled`：复核打包前 `$desktop-test-gui-release-performance`",
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
            "GUI 性能选择也只对当前发布有效且没有持久默认值",
            "产品/渠道硬要求优先并强制启用",
            "performanceSelection",
            "performanceStatus: passed | waived | Not run | Unverified",
            "release-profile no-bundle 探针候选",
            "一次预热后 5 次冷启动中位数 ≤2 秒且最大 ≤3 秒",
            "至少 20 次代表性交互 p95 ≤100ms 且单次 <200ms",
            "稳定 RSS ≤300 MiB、峰值 ≤500 MiB",
            "仍无法安全解决时才询问",
            "选择 `disabled` 且无硬要求时不生成探针",
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


def validate_release_git_contract(errors: list[str]) -> None:
    """锁定明确发布的本地提交授权、精确范围和 clean HEAD 构建边界。"""
    required = {
        PREPARE_RELEASE_SKILL: (  # noqa: F405
            "用户明确提出发布时，该请求本身授权",
            "不再追加提交或构建审批",
            "不授权标签、推送、上传、渠道发布或历史改写",
            "release_git.py inspect --project-root .",
            "release_git.py commit --project-root .",
            "--expected-status-sha256",
            "--path <reviewed-path>",
            "明确发布请求已经授权此本地提交，不再询问第二次审批",
            "literal pathspec",
            "绝不传 `--no-verify`",
            "工作树原本 clean 时不创建空源码提交",
            "sourceCommit` 必须等于 `releaseHead`",
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
            'inspect.add_argument("--project-root"',
            'commit.add_argument("--expected-status-sha256"',
            'commit.add_argument("--path", action="append", required=True)',
        ),
        RELEASE_GIT_HELPER_TESTS: (  # noqa: F405
            "test_inspect_reports_exact_head_and_dirty_snapshot",
            "test_commit_stages_only_reviewed_paths_and_finishes_clean",
            "test_changed_snapshot_is_rejected_before_staging",
            "test_unreviewed_path_blocks_partial_commit",
            "test_existing_unreviewed_staged_path_is_rejected",
            "test_failing_hook_stops_without_advancing_head",
            "test_high_confidence_secret_stops_without_advancing_head",
            "test_unsafe_or_empty_commit_scope_is_rejected",
        ),
        ROOT / "docs" / "RELEASE.md": (  # noqa: F405
            "普通构建不自动提交",
            "明确“发布/准备并构建发布”请求本身授权",
            "不授权 tag、push、上传、商店提交或正式发布",
            "从新的源码 HEAD",
            "最终工作树必须干净",
            "sourceCommit` 精确等于 HEAD",
        ),
        ROOT / "README.md": (  # noqa: F405
            "明确发布请求自动形成可审计的本地提交",
            "不再为提交或构建重复审批",
            "普通“构建候选”不会自动提交",
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
    validate_tauri_build_skill_contract(errors)
    validate_gui_release_performance_contract(errors)
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
            "明确发布请求已经授权此本地提交",
            "literal pathspec",
            "正常运行 hooks 且绝不传 `--no-verify`",
            "工作树原本 clean 时不创建空源码提交",
            "`sourceCommit` 必须等于 `releaseHead`",
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
