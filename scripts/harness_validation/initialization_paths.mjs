import fs from "node:fs";
import path from "node:path";

import { ROOT, SKILLS_ROOT } from "./core.mjs";

function skill(name) {
  return path.join(SKILLS_ROOT, name);
}

function latestDatedFile(directory, suffix) {
  let names = [];
  try {
    names = fs.readdirSync(directory);
  } catch {
    return path.join(directory, `00000000_${suffix}`);
  }
  const match = names
    .filter((name) => /^\d{8}_.+\.md$/u.test(name) && name.endsWith(suffix))
    .sort()
    .at(-1);
  return path.join(directory, match ?? `00000000_${suffix}`);
}

export const INSTANTIATE_ROOT = skill("desktop-instantiate-project");
export const INSTANTIATE_SKILL = path.join(INSTANTIATE_ROOT, "SKILL.md");
export const INSTANTIATE_FORM = path.join(INSTANTIATE_ROOT, "references", "initialization-form.md");
export const INSTANTIATE_TARGET_RESOLVER = path.join(INSTANTIATE_ROOT, "scripts", "resolve_project_target.mjs");
export const INSTANTIATE_TARGET_RESOLVER_TESTS = path.join(
  INSTANTIATE_ROOT,
  "scripts",
  "resolve_project_target.test.mjs",
);

export const INITIALIZE_ROOT = skill("desktop-initialize-rust-project");
export const INITIALIZE_SKILL = path.join(INITIALIZE_ROOT, "SKILL.md");
export const RUST_ASSET = path.join(INITIALIZE_ROOT, "assets", "rust-lib-cli");
export const MACOS_DMG_BACKGROUND = path.join(INITIALIZE_ROOT, "assets", "gui", "macos-dmg-background.png");

export const ENVIRONMENT_ROOT = skill("desktop-check-development-environment");
export const ENVIRONMENT_SKILL = path.join(ENVIRONMENT_ROOT, "SKILL.md");
export const ENVIRONMENT_REFERENCE = path.join(
  ENVIRONMENT_ROOT,
  "references",
  "development-environment-gates.md",
);
export const PREREQUISITE_UNIX = path.join(ENVIRONMENT_ROOT, "scripts", "development-environment-gates.sh");
export const PREREQUISITE_WINDOWS = path.join(ENVIRONMENT_ROOT, "scripts", "development-environment-gates.ps1");
export const MACOS_XWIN_GATE = path.join(ENVIRONMENT_ROOT, "scripts", "macos-tauri-xwin-gates.sh");
export const ENVIRONMENT_TESTS = [
  "environment_gates_detection.test.mjs",
  "environment_gates_install.test.mjs",
  "environment_gates_security.test.mjs",
  "environment_gates_windows.test.mjs",
  "macos_tauri_xwin_gates.test.mjs",
].map((name) => path.join(ENVIRONMENT_ROOT, "scripts", name));

export const RENAME_ROOT = skill("desktop-rename-project-identity");
export const RENAME_SCRIPT = path.join(RENAME_ROOT, "scripts", "rename_project_identity.mjs");
export const RENAME_TESTS = path.join(RENAME_ROOT, "scripts", "rename_project_identity.test.mjs");

export const GIT_LIFECYCLE_ROOT = skill("desktop-manage-git-lifecycle");
export const VERSION_GATE = path.join(skill("desktop-manage-version"), "scripts", "version_gate.mjs");
export const CORE_FIRST_CHECKER = path.join(skill("desktop-implement-change"), "scripts", "check_core_first.mjs");
export const LINE_LIMIT_CHECKER = path.join(
  skill("desktop-implement-change"),
  "scripts",
  "check_file_line_limits.mjs",
);
export const RUST_COMMENT_CHECKER = path.join(
  skill("desktop-implement-change"),
  "scripts",
  "check_rust_chinese_comments.mjs",
);

export const GUI_E2E_ROOT = skill("desktop-test-gui-initialization-e2e");
export const GUI_E2E_SCRIPTS = path.join(GUI_E2E_ROOT, "scripts");
export const GUI_ADAPTER_SKILL = path.join(skill("desktop-add-gui-adapter"), "SKILL.md");
export const GUI_SUPPORT_SKILL = path.join(skill("desktop-prepare-gui-support-surfaces"), "SKILL.md");
export const GUI_IDENTITY_SKILL = path.join(skill("desktop-prepare-gui-app-identity"), "SKILL.md");
export const GUI_DIALOG_SKILL = path.join(skill("desktop-add-gui-dialog"), "SKILL.md");
export const MCP_SKILL = path.join(skill("desktop-add-mcp-adapter"), "SKILL.md");
export const CLI_SKILL = path.join(skill("desktop-add-cli-adapter"), "SKILL.md");
export const TUI_SKILL = path.join(skill("desktop-add-tui-adapter"), "SKILL.md");
export const E2E_SKILL = path.join(skill("desktop-test-final-artifact-e2e"), "SKILL.md");

export const TAURI_RELEASE_ROOT = skill("desktop-build-tauri-release");
export const TAURI_NOTARIZATION_HELPER = path.join(TAURI_RELEASE_ROOT, "scripts", "probe-macos-notarization.sh");
export const TAURI_RELEASE_DIRECTORY_HELPER = path.join(
  TAURI_RELEASE_ROOT,
  "scripts",
  "prepare-release-directory.sh",
);
export const TAURI_DMG_LAYOUT_HELPER = path.join(TAURI_RELEASE_ROOT, "scripts", "verify-dmg-layout.sh");

export const AGENT_POLICY = path.join(ROOT, "docs", "AGENT_POLICY.md");
export const ENGINEERING_RULES = path.join(ROOT, "docs", "ENGINEERING_RULES.md");
export const RUST_BASELINE = path.join(ROOT, "docs", "RUST_CLI_TEMPLATE.md");
export const GITIGNORE = path.join(ROOT, ".gitignore");
export const PRODUCT_SPEC = latestDatedFile(path.join(ROOT, "docs", "product_spec"), "product_spec.md");
export const PRODUCT_STATUS = latestDatedFile(path.join(ROOT, "docs", "project_status"), "product_status.md");
export const WORK_PLAN = latestDatedFile(path.join(ROOT, "docs", "work_plan"), "work_plan.md");
