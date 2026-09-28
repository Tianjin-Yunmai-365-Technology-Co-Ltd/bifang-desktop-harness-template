/** 校验构建路由、发布选择、条件签名与根 release 原子刷新契约。 */

import fs from "node:fs";
import path from "node:path";

import { ROOT, SKILLS_ROOT, fail, readText, nodeSyntaxError, relativePath } from "./core.mjs";

const skill = (name, ...parts) => path.join(SKILLS_ROOT, name, ...parts);
const latest = (directory, pattern) => fs.readdirSync(directory).filter((name) => pattern.test(name)).sort().at(-1);

export const GITIGNORE = path.join(ROOT, ".gitignore");
export const RUST_ASSET = skill("desktop-initialize-rust-project", "assets", "rust-lib-cli");
export const BUILD_RELEASE_SKILL = skill("desktop-build-rust-release", "SKILL.md");
export const CROSS_PLATFORM_RELEASE_SKILL = skill("desktop-prepare-cross-platform-release", "SKILL.md");
export const CROSS_PLATFORM_RELEASE_WORKFLOW = skill("desktop-prepare-cross-platform-release", "assets", "github-release-candidate.yml");
export const CROSS_PLATFORM_RELEASE_CONTEXT_HELPER = skill("desktop-prepare-cross-platform-release", "scripts", "verify_release_context.mjs");
export const COLLECT_RELEASE_SKILL = skill("desktop-collect-release-artifacts", "SKILL.md");
export const PREPARE_RELEASE_SKILL = skill("desktop-prepare-release", "SKILL.md");
export const RELEASE_NOTES_HELPER = skill("desktop-prepare-release", "scripts", "release_notes.mjs");
export const RELEASE_NOTES_HELPER_TESTS = skill("desktop-prepare-release", "scripts", "release_notes.test.mjs");
export const RELEASE_GIT_HELPER = skill("desktop-prepare-release", "scripts", "release_git.mjs");
export const RELEASE_GIT_HELPER_TESTS = skill("desktop-prepare-release", "scripts", "release_git.test.mjs");
export const RELEASE_CONTEXT_HELPER = skill("desktop-prepare-release", "scripts", "release_context.mjs");
export const RELEASE_CONTEXT_HELPER_TESTS = skill("desktop-prepare-release", "scripts", "release_context.test.mjs");
export const GIT_LIFECYCLE_SKILL = skill("desktop-manage-git-lifecycle", "SKILL.md");
export const GIT_LIFECYCLE_SCRIPT = skill("desktop-manage-git-lifecycle", "scripts", "git_lifecycle.mjs");
export const GIT_LIFECYCLE_CORE = skill("desktop-manage-git-lifecycle", "scripts", "git_lifecycle_core.mjs");
export const GIT_LIFECYCLE_PUBLICATION = skill("desktop-manage-git-lifecycle", "scripts", "git_lifecycle_publication.mjs");
export const GIT_LIFECYCLE_TESTS = skill("desktop-manage-git-lifecycle", "scripts", "git_lifecycle.test.mjs");
export const GIT_LIFECYCLE_RELEASE_TESTS = skill("desktop-manage-git-lifecycle", "scripts", "git_lifecycle_release.test.mjs");
export const GIT_PUBLICATION_TEST_CASES = skill("desktop-manage-git-lifecycle", "scripts", "git_publication_test_cases.test.mjs");
export const TAURI_LOCAL_INSTALL_SKILL = skill("desktop-build-tauri-local-install", "SKILL.md");
export const TAURI_RELEASE_SKILL = skill("desktop-build-tauri-release", "SKILL.md");
export const VERIFY_DELIVERY_SKILL = skill("desktop-verify-delivery", "SKILL.md");
export const E2E_SKILL = skill("desktop-test-final-artifact-e2e", "SKILL.md");
export const VERIFICATION_DOC = path.join(ROOT, "docs", "VERIFICATION.md");
export const AGENT_POLICY = path.join(ROOT, "docs", "AGENT_POLICY.md");
export const ENGINEERING_RULES = path.join(ROOT, "docs", "ENGINEERING_RULES.md");
export const RELEASE_DOC = path.join(ROOT, "docs", "RELEASE.md");
const productSpecDirectory = path.join(ROOT, "docs", "product_spec");
export const PRODUCT_SPEC = path.join(productSpecDirectory, latest(productSpecDirectory, /^\d{8}_product_spec\.md$/u));
export const BUILD_RELEASE_POSIX_HELPER = skill("desktop-build-rust-release", "scripts", "prepare-release-directory.sh");
export const BUILD_RELEASE_POWERSHELL_HELPER = skill("desktop-build-rust-release", "scripts", "prepare-release-directory.ps1");
export const BUILD_RELEASE_HELPER_TESTS = skill("desktop-build-rust-release", "scripts", "prepare_release_directory.test.mjs");
export const TAURI_RELEASE_DIRECTORY_HELPER = skill("desktop-build-tauri-release", "scripts", "prepare-release-directory.sh");
export const TAURI_RELEASE_POWERSHELL_HELPER = skill("desktop-build-tauri-release", "scripts", "prepare-release-directory.ps1");
export const TAURI_NOTARIZATION_HELPER = skill("desktop-build-tauri-release", "scripts", "probe-macos-notarization.sh");
export const TAURI_RELEASE_HELPER_TESTS = skill("desktop-build-tauri-release", "scripts", "tauri_release_gates.test.mjs");
export const TAURI_DMG_LAYOUT_HELPER = skill("desktop-build-tauri-release", "scripts", "verify-dmg-layout.sh");
export const TAURI_DMG_LAYOUT_TESTS = skill("desktop-build-tauri-release", "scripts", "verify_dmg_layout.test.mjs");
export const TAURI_RELEASE_NOTES_HELPER = skill("desktop-build-tauri-release", "scripts", "verify_release_notes_resource.mjs");
export const TAURI_RELEASE_NOTES_HELPER_TESTS = skill("desktop-build-tauri-release", "scripts", "verify_release_notes_resource.test.mjs");
export const MACOS_XWIN_GATE = skill("desktop-check-development-environment", "scripts", "macos-tauri-xwin-gates.sh");
export const MACOS_XWIN_GATE_TESTS = skill("desktop-check-development-environment", "scripts", "macos_tauri_xwin_gates.test.mjs");

export const EXACT_RELEASE_IGNORE = "/release/";
export const EXACT_CLEANUP_IGNORE = "/.release-clean.*";
export const UNSAFE_RELEASE_IGNORES = new Set([
  "release/", "**/release/", "/release", "release", "**/release", ".release-clean.*", "**/.release-clean.*",
]);

/** 要求根锚定 release ignore 恰好一次，并拒绝过宽近似规则。 */
export function validateReleaseIgnore(errors, filePath) {
  let text;
  try { text = readText(filePath); } catch (error) {
    fail(errors, `missing release ignore file: ${relativePath(filePath)} (${error.message})`);
    return;
  }
  const active = text.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  for (const rule of [EXACT_RELEASE_IGNORE, EXACT_CLEANUP_IGNORE]) {
    const count = active.filter((line) => line === rule).length;
    if (count !== 1) fail(errors, `release ignore rule ${rule} must appear exactly once in ${relativePath(filePath)}: observed ${count}`);
  }
  const unsafe = [...new Set(active.filter((line) => UNSAFE_RELEASE_IGNORES.has(line)))].sort();
  if (unsafe.length) fail(errors, `unsafe release ignore rule in ${relativePath(filePath)}: ${JSON.stringify(unsafe)}`);
}

/** 要求每个普通文件包含全部固定片段，并按需运行 Node 语法检查。 */
export function validateFragmentContract(errors, required, { label, syntaxCheck = [] } = {}) {
  const checked = new Set(syntaxCheck);
  for (const [filePath, fragments] of required) {
    let text;
    try {
      const metadata = fs.lstatSync(filePath);
      if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error("not a regular file");
      text = readText(filePath);
    } catch (error) {
      fail(errors, `missing ${label} file: ${relativePath(filePath)} (${error.message})`);
      continue;
    }
    for (const fragment of fragments) {
      if (!text.includes(fragment)) fail(errors, `${label} missing in ${relativePath(filePath)}: ${fragment}`);
    }
    if (checked.has(filePath)) {
      const detail = nodeSyntaxError(filePath);
      if (detail !== null) fail(errors, `invalid ${label} Node module ${relativePath(filePath)}: ${detail}`);
    }
  }
}

/** 仅在全部片段存在时检查顺序，避免重复噪声。 */
function validateOrder(errors, filePath, fragments, message) {
  if (!fs.existsSync(filePath)) return;
  const text = readText(filePath);
  const positions = fragments.map((fragment) => text.indexOf(fragment));
  if (positions.every((position) => position >= 0) && positions.some((position, index) => index && position < positions[index - 1])) {
    fail(errors, message);
  }
}

/** 锁定逐次 E2E、全量单测、构建记录边界和 pending 输出语义。 */
export function validateBuildSkillContract(errors, overrides = {}) {
  const paths = {
    buildSkill: BUILD_RELEASE_SKILL,
    crossPlatformSkill: CROSS_PLATFORM_RELEASE_SKILL,
    crossPlatformWorkflow: CROSS_PLATFORM_RELEASE_WORKFLOW,
    crossPlatformContextHelper: CROSS_PLATFORM_RELEASE_CONTEXT_HELPER,
    collectSkill: COLLECT_RELEASE_SKILL,
    ...overrides,
  };
  const required = new Map([
    [paths.buildSkill, [
      "`$desktop-prepare-cross-platform-release`", "明确请求远端矩阵时另复核已推送的主分支与 tag",
      "在执行任何单元测试或构建命令前", "release_notes.mjs check --file release-notes.json --expected-version",
      "不得计算、提升版本或重置正式发布周期", "本次请求已明确 `enabled`/`disabled` 时直接复用",
      "cargo test --workspace --all-targets --all-features --locked", "不得在构建名义下自动追加格式、lint",
      "必须尝试签名并验证生成的签名", "signingStatus: unsigned", "结构化 `signingEvidence`",
      "目录级原子替换", "项目根 `release/`", "milestoneAcceptance: pending", "e2eSelection",
      "releaseNotesVersion", "releaseNotesSha256", "releaseNotesPath: release-notes.json",
      "编译、签名与打包期间不得启动二进制文件或混跑冒烟/E2E",
    ]],
    [paths.crossPlatformSkill, [
      "默认 `$desktop-build-rust-release` 路线", "fail-fast: false", "release_notes.mjs check --file release-notes.json",
      "cargo test --workspace --all-targets --all-features --locked", "原子隔离旧目录", "必须尝试签名并验证",
      "固定 `confirm_candidate_build`、`version`、`source_commit`、`release_context_sha256` 和 `e2e_selection` 输入",
      "使用 `fetch-depth: 0`", "verify_release_context.mjs capture", "verify_release_context.mjs verify",
      "完整规范化 `releaseReview`", "上传三个明确的归档/校验和/清单路径",
      "milestoneAcceptance: pending", "矩阵本身不得运行 E2E",
    ]],
    [paths.crossPlatformWorkflow, [
      "release_context_sha256:", "RELEASE_CONTEXT_SHA256: ${{ inputs.release_context_sha256 }}",
      "ref: ${{ github.event.repository.default_branch }}", "fetch-depth: 0", "persist-credentials: false",
      "verify_release_context.mjs capture", "verify_release_context.mjs verify",
      "release_candidate_workflow.mjs write-manifest", "release_candidate_workflow.mjs commit-candidate",
      '${GITHUB_WORKSPACE}/../.${PRODUCT_NAME}.release-candidate.XXXXXX', "Split-Path -Parent $env:GITHUB_WORKSPACE",
    ]],
    [paths.crossPlatformContextHelper, [
      "export async function calculateSnapshot(", "runner must check out the named repository default branch at source_commit",
      "working release context bytes do not match source_commit", "release context digest does not match the host-verified input",
      "releaseDefaultBranch: normalized.defaultBranch", "fetched origin default branch does not equal source_commit",
      "defaultBranch: repositoryDefaultBranch", "`refs/remotes/origin/${repositoryDefaultBranch}`",
      "`refs/tags/${normalized.expectedTag}`",
      "sourceCommit", "releaseContextSha256: digest", "releaseReview", "defaultBranch: repositoryDefaultBranch",
      "release context changed between build checks",
    ]],
    [paths.collectSkill, [
      "releaseNotesVersion", "releaseNotesSha256", "releaseNotesPath", "不得改写发布上下文或更新日志",
      "在全部源结果通过前不得清理、移走或写入它", "在项目根同级、同一文件系统创建唯一且权限受限的 staging",
      "不得逐个平台直接复制到 `release/`", "在 staging 内重新计算每个最终归档或安装包的 SHA-256",
      "在触碰目标目录前第二次运行发布上下文 `verify`", "重新枚举 staging 并按全部清单复算精确集合",
      "把完整 staging 目录级原子替换为 `release/`", "任何前置失败都不得部分污染目标", "替换后只读重新枚举 `release/`",
    ]],
  ]);
  validateFragmentContract(errors, required, {
    label: "release contract", syntaxCheck: [paths.crossPlatformContextHelper],
  });
  validateOrder(errors, paths.crossPlatformWorkflow, [
    "verify_release_context.mjs capture", "cargo test --workspace --all-targets --all-features --locked",
    "cargo build --workspace --release --locked", "verify_release_context.mjs verify",
    "release_candidate_workflow.mjs write-manifest", "release_candidate_workflow.mjs commit-candidate",
  ], "release contract order: workflow must capture before tests, reverify before manifest, then atomically commit");
  validateOrder(errors, paths.collectSkill, [
    "在接触目标目录前运行发布上下文 `verify`", "在项目根同级、同一文件系统创建唯一且权限受限的 staging",
    "在 staging 内重新计算每个最终归档或安装包的 SHA-256", "在触碰目标目录前第二次运行发布上下文 `verify`",
    "重新枚举 staging 并按全部清单复算精确集合", "把完整 staging 目录级原子替换为 `release/`",
    "替换后只读重新枚举 `release/`",
  ], "release contract order: collection must validate staging before atomic replacement and read-only target check");
}

/** 锁定 Windows 本地试包与发布候选之间的授权边界。 */
export function validateTauriLocalInstallContract(errors, localSkill = TAURI_LOCAL_INSTALL_SKILL) {
  validateFragmentContract(errors, new Map([[localSkill, [
    "[workspace.metadata.agent-first-harness]", "target-platforms", "interfaces", "允许从 dirty 工作树生成本地试包",
    "不得调用 `$desktop-prepare-release`", "不得生成、读取、校验或改写 `release-notes.json`",
    "不得创建、刷新或写入项目根 `release/`", "cargo test --workspace --all-targets --all-features --locked",
    "pnpm tauri build --bundles nsis --target x86_64-pc-windows-msvc --no-sign", "artifactPurpose: local-install-test",
    "releaseCandidate: false", "signingStatus: unsigned", "本 Skill 不询问 E2E 开/关",
  ]]]), { label: "Tauri local install contract" });
}

/** 锁定 Tauri 原生/交叉候选、签名公证、资源和原子提交门禁。 */
export function validateTauriBuildSkillContract(errors, overrides = {}) {
  const paths = {
    tauriSkill: TAURI_RELEASE_SKILL, verifySkill: VERIFY_DELIVERY_SKILL, verificationDoc: VERIFICATION_DOC,
    xwinGate: MACOS_XWIN_GATE, notarizationHelper: TAURI_NOTARIZATION_HELPER, tauriTests: TAURI_RELEASE_HELPER_TESTS,
    dmgLayoutHelper: TAURI_DMG_LAYOUT_HELPER, dmgLayoutTests: TAURI_DMG_LAYOUT_TESTS,
    releaseNotesHelper: TAURI_RELEASE_NOTES_HELPER, releaseNotesTests: TAURI_RELEASE_NOTES_HELPER_TESTS,
    e2eSkill: E2E_SKILL, xwinTests: MACOS_XWIN_GATE_TESTS, ...overrides,
  };
  const required = new Map([
    [paths.tauriSkill, [
      "仅供本机安装检查的试包转到 `$desktop-build-tauri-local-install`", "release_notes.mjs check --file release-notes.json",
      "verify_release_notes_resource.mjs config", "--config src-tauri/tauri.release.conf.json", "不在构建中改写它",
      "scripts/prepare-release-directory.sh <project-root>", "scripts/prepare-release-directory.ps1 -ProjectRoot <project-root>",
      "Windows 原生路线不得调用 `.sh` helper", "scripts/macos-tauri-xwin-gates.sh --install-missing",
      "CI=true TAURI_BUNDLER_DMG_IGNORE_CI=1 pnpm tauri build --bundles dmg", "scripts/verify-dmg-layout.sh",
      "候选构建中禁止 `--skip-stapling`", "pnpm tauri build --bundles nsis --runner cargo-xwin",
      "所有会改变字节的布局写入、签名、公证和 stapling 完成后", "写完 manifest 后必须按每份 manifest 枚举并复算",
      "随后才以不跟随链接的目录级原子替换提交到 `release/`", "bundle.createUpdaterArtifacts: true",
      "官方 updater archive 与相邻 `.sig`", "`signatureVerification: passed`", "notarized-and-stapled",
      "cargo test --workspace --all-targets --all-features --locked", "e2eSelection", "releaseNotesVersion",
    ]],
    [paths.verifySkill, ["verify_release_notes_resource.mjs bytes", "releaseNotesPath: release-notes.json", "针对 `release/` 中当前最终字节重新运行"]],
    [paths.e2eSkill, ["GUI 更新日志", "release-notes.json", "最多五版", "各最多十条"]],
    [paths.verificationDoc, ["Tauri DMG 最终布局", "只读挂载检查"]],
    [paths.xwinGate, ["x86_64-pc-windows-msvc", '"$brew_path" install llvm', '"$brew_path" install lld',
      '"$brew_path" install nsis', "CARGO_XWIN_REQUIREMENT='>=0.23.1, <0.24.0'", "gate.path.prepend", "overall=upgrade-required"]],
    [paths.notarizationHelper, ["Developer ID Application", "notarytool", "stapler", "APPLE_API_ISSUER", "APPLE_ID", "APPLE_NOTARYTOOL_PROFILE"]],
    [TAURI_RELEASE_DIRECTORY_HELPER, ["独立 Git 顶层目录", "release 是符号链接", "原子刷新期间 release 发生变化", "release.cleaned=true"]],
    [TAURI_RELEASE_POWERSHELL_HELPER, ["独立 Git 顶层目录", "release 是重解析点", "[IO.FileAttributes]::ReparsePoint", "[IO.Directory]::Move", "release.cleaned=true"]],
    [paths.tauriTests, ["complete API credentials are ready without secret output", "complete Apple ID credentials are ready",
      "unavailable keychain profile is rejected", "partial or mixed credentials are rejected", "symlinked API key is rejected", "missing notarytool is unavailable"]],
    [paths.dmgLayoutHelper, ["attach -readonly -nobrowse -noautoopen", "finder-ds-store-missing", ".background/background.png",
      "applications-link-target-invalid", "release-notes-resource-mismatch", "cmp -s", "gate.macos_dmg_layout.status=passed"]],
    [paths.dmgLayoutTests, ["complete read-only volume layout passes and detaches", "missing .DS_Store fails closed and detaches",
      "wrong Applications link and multiple apps are rejected", "symlinked DMG is rejected before mount", "non-macOS host is not applicable"]],
    [paths.releaseNotesHelper, ["ROOT_CARGO_SOURCE_MAPPING", "CONVENTIONAL_CARGO_SOURCE_MAPPING", "RESOURCE_TARGET",
      "verifyConfig", "verifyBytes", "bundled release notes bytes do not match the source"]],
    [paths.releaseNotesTests, ["accepts fixed config and byte-identical bundled resource", "rejects missing or redirected resource mapping",
      "accepts conventional src-tauri Cargo root mapping", "rejects bundled bytes that differ from source", "rejects symlinked source or bundled resource"]],
    [paths.xwinTests, ["existing environment passes without installing", "missing environment is installed and reprobed",
      "higher compatible cargo-xwin is preserved", "outdated cargo-xwin is upgraded and reprobed", "non-macOS host and unsupported target are rejected"]],
  ]);
  validateFragmentContract(errors, required, {
    label: "Tauri release contract", syntaxCheck: [paths.tauriTests, paths.dmgLayoutTests, paths.releaseNotesHelper, paths.releaseNotesTests, paths.xwinTests],
  });
  validateOrder(errors, paths.tauriSkill, [
    "所有会改变字节的布局写入、签名、公证和 stapling 完成后", "随后才对最终 DMG/NSIS",
    "写 manifest 前再次运行发布上下文 `verify`", "manifest 必须记录", "写完 manifest 后必须按每份 manifest 枚举并复算",
    "随后才以不跟随链接的目录级原子替换提交到 `release/`", "重新枚举 `release/`",
  ], "Tauri release contract order: final bytes and hashes must precede verification, manifest, and atomic replacement");
  if (fs.existsSync(BUILD_RELEASE_POSIX_HELPER) && fs.existsSync(TAURI_RELEASE_DIRECTORY_HELPER) &&
      !fs.readFileSync(BUILD_RELEASE_POSIX_HELPER).equals(fs.readFileSync(TAURI_RELEASE_DIRECTORY_HELPER))) {
    fail(errors, "Tauri release directory helper must remain byte-identical to the tested CLI POSIX helper");
  }
  if (fs.existsSync(BUILD_RELEASE_POWERSHELL_HELPER) && fs.existsSync(TAURI_RELEASE_POWERSHELL_HELPER) &&
      !fs.readFileSync(BUILD_RELEASE_POWERSHELL_HELPER).equals(fs.readFileSync(TAURI_RELEASE_POWERSHELL_HELPER))) {
    fail(errors, "Tauri release directory helper must remain byte-identical to the tested CLI PowerShell helper");
  }
}

/** 锁定单次发布选择、上下文及构建/验收只读消费契约。 */
export function validateReleaseSelectionContract(errors, overrides = {}) {
  const paths = {
    prepareSkill: PREPARE_RELEASE_SKILL, lifecycleSkill: GIT_LIFECYCLE_SKILL,
    contextHelper: RELEASE_CONTEXT_HELPER, contextTests: RELEASE_CONTEXT_HELPER_TESTS,
    rustSkill: BUILD_RELEASE_SKILL, tauriSkill: TAURI_RELEASE_SKILL, collectSkill: COLLECT_RELEASE_SKILL,
    verifySkill: VERIFY_DELIVERY_SKILL, e2eSkill: E2E_SKILL, releaseDoc: RELEASE_DOC,
    verificationDoc: VERIFICATION_DOC, ...overrides,
  };
  const required = new Map([
    [paths.prepareSkill, [
      "`reviewSelection: enabled | disabled`", "node scripts/validate_harness.mjs --release-review",
      "`sourceHead`", "`releaseReview`", "release_context.mjs write",
      "release_context.mjs check", "release_context.mjs verify", "git_lifecycle.mjs release --project-root .",
      "--release-context-sha256 <releaseContextSha256>", "本地预期 tag 和上下文均精确一致",
      "不保存推送模式、远端、候选签名或打包选择",
    ]],
    [paths.lifecycleSkill, ["`publish` 要求可解析主远端", "`release` 必须接收 `--release-context-sha256 <sha256>`",
      "`v{version}-{YYYYMMDD}`", "tracked `.harness/release-context.json`", "任何合并或创建 tag 前", "不设置保护分支门禁"]],
    [paths.contextHelper, [
      'export const CONTEXT_RELATIVE_PATH = ".harness/release-context.json"', "value.schemaVersion !== 3",
      '"expectedTag", "defaultBranch", "releaseReview"', "const expectedTag = `v${value.version}-${compactDate}`",
      "releaseReview: validateReleaseReview(value.releaseReview, sourceHead)",
      "export function writeContext(", "export function checkContext(", "value.defaultBranch",
    ]],
    [paths.contextTests, ["write_derives_tag_and_canonical_context", "schema_v2_release_context_is_rejected_without_silent_migration",
      "write_uses_explicit_branch_without_accessing_remote", "verify_requires_clean_main_and_local_tag",
      "verify_succeeds_without_remote_access", "verify_rejects_missing_local_tag",
      "write_requires_default_branch_and_rejects_old_modes", "check_rejects_retired_publication_and_candidate_fields"]],
    [paths.rustSkill, ["release_context.mjs verify --project-root .", "锁定其 `sourceCommit`、`releaseContextSha256` 与 `releaseReview`",
      "审查选择、状态、范围摘要", "签名由本次构建的已批准配置"]],
    [paths.tauriSkill, ["release_context.mjs verify --project-root .", "`sourceCommit`、`releaseContextSha256` 与 `releaseReview`",
      "发布审查只从上下文读取", "当前候选目标包含 macOS 时 `macosSigningSelection` 必须精确为 `enabled | disabled`",
      "锁定为本次构建选择并在候选 manifest 中记录，不写入发布上下文",
      "不得以 `--no-sign` 重试或静默降级"]],
    [paths.collectSkill, ["发布上下文 `verify`", "各 manifest 的上下文摘要与审查字段逐字段匹配", "收集阶段不得补问、推断或改变构建选择", "不重新构建、签名、执行或发布候选"]],
    [paths.verifySkill, ["先运行发布上下文 `verify`", "manifest `sourceCommit` 必须等于该 HEAD", "`reviewStatus: passed`", "`reviewStatus: Not run`",
      "在写入验收状态前再次运行发布上下文 `verify`", "在 staging 内原子写入全部 manifests", "目录级原子替换 `release/`"]],
    [paths.e2eSkill, ["`disabled/not-requested` 或实际 unsigned 必须在读取权限前失败", "不能以 E2E `disabled` 或 `Unverified` 绕过", "不写 tracked Verification"]],
    [paths.releaseDoc, ["`.harness/release-context.json`", "重试必须沿用同一上下文及最终 HEAD", "macOS 默认 unsigned",
      "候选构建在清理目录、测试或编译前", "使用远程 provider 时另复核已明确推送的远端主分支/tag"]],
    [paths.verificationDoc, ["非必要语义审查只读取当前发布 manifest 的 `reviewSelection`", "安全、隐私、不可逆操作、对外兼容契约或产品/渠道硬要求不能被关闭"]],
  ]);
  validateFragmentContract(errors, required, { label: "release selection contract", syntaxCheck: [paths.contextHelper, paths.contextTests] });
  validateOrder(errors, paths.verifySkill, [
    "把这些值锁定为准入快照", "E2E 为 `enabled`", "在写入验收状态前再次运行发布上下文 `verify`",
    "重新计算全部最终制品", "于项目根同级、同一文件系统的唯一 staging", "在 staging 内原子写入全部 manifests", "目录级原子替换 `release/`",
  ], "release selection contract order: delivery verification must reverify context and bytes before atomic manifest replacement");
}

/** 锁定 Harness Git-only 终点、元数据提交顺序与逐次发布位置。 */
export function validateHarnessSourceReleaseContract(errors, overrides = {}) {
  const paths = {
    prepareSkill: PREPARE_RELEASE_SKILL, lifecycleSkill: GIT_LIFECYCLE_SKILL,
    contextHelper: RELEASE_CONTEXT_HELPER, contextTests: RELEASE_CONTEXT_HELPER_TESTS,
    agentPolicy: AGENT_POLICY, engineeringRules: ENGINEERING_RULES, releaseDoc: RELEASE_DOC,
    productSpec: PRODUCT_SPEC, humanReview: path.join(ROOT, "docs", "verification", "human_review.md"),
    agentsDoc: path.join(ROOT, "AGENTS.md"), methodologyDoc: path.join(ROOT, "docs", "harness_engineering", "agent_first_design.md"),
    prepareOpenai: skill("desktop-prepare-release", "agents", "openai.yaml"), ...overrides,
  };
  const required = new Map([
    [paths.prepareSkill, ["根同时包含 Harness `Version.md`", "harness_version_clock.mjs stamp --project-root .",
      "提交源码/治理变化及已独立触发的 Changelog", "此后不得补写 Changelog", "`write` 拒绝当前 HEAD 不等于 `sourceHead`",
      "把且只把 `release-notes.json` 与 `.harness/release-context.json` 放入同一发布元数据提交",
      "不保存推送模式、远端、候选签名或打包选择",
      "git_lifecycle.mjs release --project-root . --version <version> --date YYYYMMDD --release-context-sha256 <releaseContextSha256>",
      "报告 `Released` 并结束 Git 发布", "推送使用独立 `push-release --remote <name>`",
      "下游候选打包只按用户独立请求进入适用 Skill"]],
    [paths.prepareOpenai, ["合并本地默认主分支并创建、复读版本 tag", "Git 发布至此完成"]],
    [paths.lifecycleSkill, ["在 Harness 源或终端下游 Git 项目中登记开发分支"]],
    [paths.contextHelper, ["sourceHead must equal the current HEAD before metadata commit"]],
    [paths.contextTests, ["write_rejects_source_head_that_is_not_current_head"]],
    [paths.agentPolicy, ["本节约束 Harness 源和完成初始化的终端下游", "`pendingPublish`", "--also-remote",
      "`push-release` 只接受最近发布记录中冻结的最终 HEAD 与 tag", "--release-context-sha256 <sha256>",
      "默认主分支与本地 tag 精确指向同一最终 HEAD 并复读成功，就是 Git 发布的结束条件"]],
    [paths.engineeringRules, ["正式发布先把源码/治理变化与独立事件已触发的 Changelog 提交并锁定 `sourceHead`", "只有当前 HEAD 仍精确等于该值时",
      "把且只把根 `release-notes.json` 与 `.harness/release-context.json` 作为同一发布元数据提交", "Harness 源和终端下游的 Git 发布都在这一步结束"]],
    [paths.releaseDoc, ["Git 发布在本地默认主分支和版本 tag 指向同一最终 HEAD 时结束", "Harness 到此结束",
      "只有用户另行要求构建终端下游候选时", "提交源码/治理变化及已触发 Changelog",
      "`release --version <version> --date YYYYMMDD --release-context-sha256 <sha256>`",
      "把且只把这两个文件作为发布元数据提交", "Harness 源码归档只在 Git 发布完成后由用户另行决定",
      "不创建产品 manifest"]],
    [paths.productSpec, ["HARNESS-FIX-HARNESS-SOURCE-GIT-ONLY-RELEASE", "正式发布步骤 1–2 由 Harness 源和终端下游共用", "不创建或套用产品 manifest"]],
    [paths.agentsDoc, ["Harness 源与终端下游的新功能或独立 Bug 修复"]],
    [paths.methodologyDoc, ["正式候选必须先有本地版本 tag", "tag、本地默认主分支与 manifest `sourceCommit` 精确一致", "其缺席不代替或放宽 Git tag 门禁"]],
  ]);
  validateFragmentContract(errors, required, { label: "Harness source release contract", syntaxCheck: [paths.contextHelper, paths.contextTests] });
  if (fs.existsSync(paths.humanReview) && readText(paths.humanReview).includes("docs/adr/20260911_ADR.md")) fail(errors, "Harness source release contract retains deleted 20260911 ADR path");
  if (fs.existsSync(paths.methodologyDoc) && readText(paths.methodologyDoc).includes("缺席不阻断候选验收或只读就绪复核")) fail(errors, "Harness source release contract allows a missing release tag");
  if (fs.existsSync(paths.releaseDoc) && readText(paths.releaseDoc).includes("写入 `.harness/release-context.json` 并提交；随后 `release --version <version>`")) {
    fail(errors, "Harness source release contract retains stale context-only Git release");
  }
  validateOrder(errors, paths.prepareSkill, ["提交源码/治理变化及已独立触发的 Changelog", "提交后的 clean HEAD 是 `sourceHead`", "release_context.mjs write --project-root",
    "把且只把 `release-notes.json` 与 `.harness/release-context.json`", "git_lifecycle.mjs release --project-root", "报告 `Released` 并结束 Git 发布", "下游候选打包只按用户独立请求进入适用 Skill"],
  "Harness source release contract order: Changelog/sourceHead must precede metadata, release, Harness endpoint, and downstream candidate");
  validateOrder(errors, paths.releaseDoc, ["Git 发布在本地默认主分支和版本 tag 指向同一最终 HEAD 时结束",
    "\n1. 发布准备先判定", "\n2. 生成并复核", "Harness 到此结束", "\n3. 只有用户另行要求构建终端下游候选时"],
  "Harness source release contract order: shared steps and Harness endpoint must precede downstream candidate steps");
}

/** 锁定精确提交、上下文绑定、单一本地 tag 与独立发布后推送。 */
export function validateReleaseGitContract(errors, overrides = {}) {
  const paths = {
    prepareSkill: PREPARE_RELEASE_SKILL, lifecycleSkill: GIT_LIFECYCLE_SKILL,
    lifecycleScript: GIT_LIFECYCLE_PUBLICATION, lifecycleCore: GIT_LIFECYCLE_CORE,
    lifecycleTests: GIT_LIFECYCLE_TESTS, lifecycleReleaseTests: GIT_LIFECYCLE_RELEASE_TESTS,
    publicationTests: GIT_PUBLICATION_TEST_CASES, releaseDoc: RELEASE_DOC, readme: path.join(ROOT, "README.md"), ...overrides,
  };
  const required = new Map([
    [paths.prepareSkill, ["明确“发布”授权本次已复核源码的必要提交、普通合并、本地版本 tag 和精确复核",
      "不访问远端、不推送、不打包、不删除登记资源", "release_git.mjs inspect --project-root .",
      "release_git.mjs commit", "`statusSha256`", "literal `--path`", "不使用 `--no-verify`",
      "clean 且无源码变化时不创建空提交", "git_lifecycle.mjs release --project-root .",
      "--release-context-sha256 <releaseContextSha256>", "此时报告 `Released` 并结束 Git 发布"]],
    [RELEASE_GIT_HELPER, ["export function inspectRepository(", "export function commitApproved(", "statusSha256", "repositorySnapshotDigest",
      "working tree changed after review", "literalPathspecs", "index contains staged paths outside the reviewed scope",
      "reviewed paths do not cover the complete working tree", "potential secret detected in reviewed staged bytes", "hooks were not bypassed",
      "commit succeeded but working tree is not clean", "APPROVABLE_HARNESS_PATHS"]],
    [RELEASE_GIT_HELPER_TESTS, ["inspect_reports_exact_head_branch_and_dirty_snapshot", "commit_stages_only_reviewed_paths_and_finishes_clean",
      "commit_allows_any_named_branch_without_protection_rules", "only_release_context_and_upstream_lock_are_approvable_harness_metadata",
      "git_add_window_race_cannot_commit_unreviewed_bytes", "hooks_cannot_fail_or_smuggle_unreviewed_content", "high_confidence_secret_stops_without_advancing_head"]],
    [paths.lifecycleSkill, ["用户要求“发布”时运行 `release`", "push-release --project-root . --remote <name>", "--also-remote <name>", "唯一主远端",
      "`pendingPublish` 中临时保存冻结目标与确认进度", "跨远端推送不是原子操作", "相同目标参数进行幂等重试", "普通 `git merge --no-edit`",
      "`v{version}-{YYYYMMDD}`", "tracked `.harness/release-context.json`", "不删除登记分支或 Worktree", "不设置保护分支门禁"]],
    [paths.lifecycleScript, ["export function publish(", "function confirmPendingPublishTarget(", "function completePendingPublish(", "function ensureLocalReleaseTag(",
      "async function verifyHarnessVersionStamp(", "clock.readHarnessVersionStamp(repository.root, version)",
      "async function verifyFinalReleaseVersion(", 'gate.check(repository.root, "release")',
      "export async function commandRelease(", "await verifyHarnessVersionStamp(repository, identity.version)",
      "export function commandPushRelease(", "state.releasedResources.push({",
      'if (state.cycle === null && state.lastRelease !== null)', 'if (!validRemote(remote))',
      "confirmedDefault = remoteDefaultBranch(repository, remote)", "confirmedBranch = remoteBranchOid(repository, remote, branch)",
      "confirmedTag = remoteTagTarget(repository, remote, last.tag)",
      '["push", remote, last.head + ":refs/heads/" + branch]', '["push", remote, "refs/tags/" + last.tag + ":refs/tags/" + last.tag]']],
    [paths.lifecycleCore, ["export function resolveAdditionalRemoteTargets(", "export function mergeRegisteredBranches(", "export function remoteBranchOid(",
      'createHash("sha256").update(contextBlob.stdout).digest("hex") !== last.releaseContextSha256']],
    [paths.lifecycleTests, ["registered_remote_precedes_origin_and_conflicting_override_fails", "publish_merges_switches_and_pushes_without_tag_or_cleanup",
      "publish_merges_current_remote_default_before_development_branches", "publish_pushes_same_head_to_additional_remote_without_rebinding"]],
    [paths.lifecycleReleaseTests, ["release_merges_locally_tags_and_preserves_registered_resources_without_remote", "release_tag_conflict_keeps_registered_resources_and_pending_head",
      "harness_release_requires_managed_current_minute_stamp_before_merge_or_tag", "harness_release_accepts_managed_timestamp_stamp",
      "publish_after_release_requires_new_cycle_and_cannot_replace_push_release", "push_release_rechecks_branch_and_tag_together_after_tag_push",
      "push_release_rejects_option_like_remote_name",
      "dirty_registered_worktree_blocks_release_then_clean_retry_succeeds", "push_release_is_separate_explicit_idempotent_operation",
      "tag_push_failure_reports_partial_success_and_retry_keeps_release_complete"]],
    [paths.publicationTests, ["publish_primary_only_failure_persists_and_resumes_frozen_head", "single_target_pending_errors_preserve_stable_codes",
      "additional_remote_rejection_preserves_prefix_and_retry_succeeds"]],
    [paths.releaseDoc, ["## Git 发布生命周期与制品目录", "发布前用户明确要求“推送”时", "--also-remote", "`pendingPublish`", "`release` 必须传入精确 `--release-context-sha256 <sha256>`",
      "`release --version <version> --date YYYYMMDD --release-context-sha256 <sha256>`", "两者一致即完成 Git 发布", "全过程不 fetch、push、打包或删除登记分支和 Worktree",
      "`push-release --remote <name>`", "失败不撤销本地发布", "不设置保护分支、严格线性"]],
    [paths.readme, ["$desktop-manage-git-lifecycle", "自动创建本地开发分支", "合并本地默认主分支并创建、复读版本 tag",
      "推送、打包分别在发布后由你自行决定并单独提出", "发布后只有明确要求推送时才将同一已发布主分支 HEAD 与 tag 推到指定远端并复读"]],
  ]);
  validateFragmentContract(errors, required, {
    label: "release Git contract", syntaxCheck: [RELEASE_GIT_HELPER, RELEASE_GIT_HELPER_TESTS, paths.lifecycleScript, paths.lifecycleCore, paths.lifecycleTests, paths.lifecycleReleaseTests, paths.publicationTests],
  });
  for (const filePath of [paths.prepareSkill, paths.lifecycleSkill, paths.releaseDoc, paths.readme]) {
    if (!fs.existsSync(filePath)) continue;
    const contents = readText(filePath);
    for (const retired of ["gitPublication: local | remote", "--local-only", "--remote <remote> --release-context-sha256", "恰好一个模式参数"]) {
      if (contents.includes(retired)) fail(errors, `release Git contract retains retired release mode in ${relativePath(filePath)}: ${retired}`);
    }
  }
}

/** 汇总 release ignore、helper、构建、收集和 Git 发布契约。 */
export function validateReleaseContract(errors) {
  for (const filePath of [GITIGNORE, path.join(RUST_ASSET, ".gitignore")]) validateReleaseIgnore(errors, filePath);
  validateBuildSkillContract(errors);
  validateTauriLocalInstallContract(errors);
  validateTauriBuildSkillContract(errors);
  validateReleaseSelectionContract(errors);
  validateHarnessSourceReleaseContract(errors);
  validateReleaseGitContract(errors);
  const helpers = new Map([
    [BUILD_RELEASE_POSIX_HELPER, ["独立 Git 顶层目录", "release 是符号链接", "原子刷新期间 release 发生变化", "release.cleaned=true"]],
    [BUILD_RELEASE_POWERSHELL_HELPER, ["独立 Git 顶层目录", "[IO.FileAttributes]::ReparsePoint", "[IO.Directory]::Move", "Remove-TreeWithoutFollowingReparsePoint", "release.cleaned=true"]],
    [BUILD_RELEASE_HELPER_TESTS, ["cleans every entry without deleting release directory", "rejects release symlink without touching target", "rejects directory that is not Git top level", "Windows helper rejects root reparse point"]],
    [COLLECT_RELEASE_SKILL, ["milestoneAcceptance: pending", "目录存在绝不得提升该状态", "不得尝试新签名、公证或 stapling", "构建产物收集本身不触发任何项目记忆"]],
    [PREPARE_RELEASE_SKILL, ["## 正式发布流程", "release_git.mjs inspect --project-root .", "statusSha256", "release_git.mjs commit",
      "`release_notes.mjs upsert`", "`check --expected-version`", "两个 locale 的 `render`",
      "近五版双语 `release-notes.json`", "发布准备不运行构建、冒烟或 E2E", "此时报告 `Released` 并结束 Git 发布"]],
    [RELEASE_NOTES_HELPER, ["export const MAX_RELEASES = 5", "export const MAX_ITEMS_PER_SECTION = 10", "export const SCHEMA_VERSION = 2", 'export const SUPPORTED_LOCALES = ["zh-CN", "en-US"]',
      "pairLocalizedItems", "normalizeDisplayVersion", "validateDocument", "renameSync(temporary, path)", "featureOptimizationZhCn", "bugFixEnUs"]],
    [RELEASE_NOTES_HELPER_TESTS, ["upsert_normalizes_version_and_renders_exact_sections", "upsert_replaces_same_version_and_retains_latest_five", "rejects_item_overflow_empty_release_and_missing_translation", "rejects_symlinked_release_notes"]],
    [RELEASE_GIT_HELPER, ["statusSha256", "repositorySnapshotDigest", "literalPathspecs", "hooks were not bypassed", "potential secret detected", "working tree changed after review"]],
    [ENGINEERING_RULES, ["根 `release-notes.json` 是 Harness 源与终端下游共用的双语发布更新日志事实", "使用 `schemaVersion: 2`", "按最新在前只保留近 5 个版本", "Harness 源则重新执行 Git 源码发布复核"]],
    [RELEASE_DOC, ["## 用户可见版本与更新日志", "schemaVersion: 2", "--feature-optimization-zh-cn", "render --locale en-US", "releaseNotesVersion", "releaseNotesSha256", "releaseNotesPath"]],
  ]);
  validateFragmentContract(errors, helpers, {
    label: "release contract", syntaxCheck: [BUILD_RELEASE_HELPER_TESTS, RELEASE_NOTES_HELPER, RELEASE_NOTES_HELPER_TESTS, RELEASE_GIT_HELPER],
  });
}
