import fs from "node:fs";
import path from "node:path";

const RELEASE_CONFIG_PATH = path.join(
  "src-tauri",
  "tauri.release.conf.json",
);
const EXPECTED_RESOURCES = {
  "../../release-notes.json": "release-notes.json",
};

/** 读取普通非符号链接 UTF-8 文件。 */
function readTextFile(filePath) {
  const stats = fs.lstatSync(filePath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`必须是普通非符号链接文件：${filePath}`);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(
    fs.readFileSync(filePath),
  );
}

/** 验证发布专用合并配置只把根更新日志映射到固定资源路径。 */
function validateReleaseConfig(guiRoot, errors) {
  const configPath = path.join(guiRoot, RELEASE_CONFIG_PATH);
  try {
    const config = JSON.parse(readTextFile(configPath));
    const resources = config?.bundle?.resources;
    if (JSON.stringify(resources) !== JSON.stringify(EXPECTED_RESOURCES)) {
      errors.push(
        "tauri.release.conf.json 必须把 ../../release-notes.json 唯一映射为 release-notes.json",
      );
    }
  } catch (error) {
    errors.push(`缺少可解析的 Tauri 更新日志发布配置：${error.message}`);
  }
}

/** 验证关于页选择与 Rust/React 候选资源读取链路完全一致。 */
export function validateReleaseNotesRuntimeContract(
  guiRoot,
  aboutPage,
  rustSourceText,
  rustTestText,
  frontendSourceText,
  errors,
) {
  validateReleaseConfig(guiRoot, errors);
  const rustRequirements = [
    "#[tauri::command]",
    "async fn load_release_notes",
    "BaseDirectory::Resource",
    "RELEASE_NOTES_RESOURCE_PATH",
    "tokio::fs::symlink_metadata",
    "tokio::fs::read",
    "serde_json::from_slice",
    "RELEASE_NOTES_SCHEMA_VERSION: u8 = 2",
    "LocalizedReleaseNoteItem",
    "ReleaseNotesDocument",
    "ReleaseNotesLoadError",
  ];
  const frontendRequirements = [
    'LOAD_RELEASE_NOTES_COMMAND = "load_release_notes"',
    "invoke<unknown>(command)",
    "decodeReleaseNotesDocument",
    "value.schemaVersion !== 2",
    "resolveReleaseNotesLocale",
    "i18n.resolvedLanguage",
    "loadBundledReleaseNotes",
    "releaseNotesLoader = loadBundledReleaseNotes",
    "requestReleaseNotes",
    'status={releaseNotesStatus}',
    't("release_notes.load_failed")',
    't("release_notes.retry")',
  ];
  const rustTests = [
    "parses_valid_release_notes_resource",
    "rejects_invalid_release_notes_resource",
  ];
  const frontendTests = [
    "loads the packaged document through the narrow Tauri command",
    "shows a bounded release notes load failure and retries from its own control",
    "selects English release-note translations from the active locale",
  ];

  const combinedText = `${rustSourceText}\n${frontendSourceText}`;

  if (aboutPage) {
    const requiredGroups = [
      [rustSourceText, rustRequirements, "Rust 更新日志运行时接线"],
      [frontendSourceText, frontendRequirements, "前端更新日志运行时接线"],
      [rustTestText, rustTests, "Rust 更新日志回归"],
      [frontendSourceText, frontendTests, "前端更新日志回归"],
    ];
    for (const [text, fragments, label] of requiredGroups) {
      for (const fragment of fragments) {
        if (!text.includes(fragment)) {
          errors.push(`选择关于页时缺少${label}：${fragment}`);
        }
      }
    }
    if (!/generate_handler!\s*\[[^\]]*\bload_release_notes\b[^\]]*\]/su.test(rustSourceText)) {
      errors.push("选择关于页时合并的 generate_handler! 必须注册 load_release_notes");
    }
    for (const forbidden of ["std::fs::read", "@tauri-apps/plugin-fs"]) {
      if (combinedText.includes(forbidden)) {
        errors.push(`更新日志必须使用异步窄命令，不得恢复宽泛或同步文件读取：${forbidden}`);
      }
    }
    return;
  }

  for (const forbidden of [
    "load_release_notes",
    "loadBundledReleaseNotes",
    "releaseNotesLoader",
    "ReleaseNotesDialogTemplate",
  ]) {
    if (combinedText.includes(forbidden)) {
      errors.push(`未选择关于页时不得保留更新日志运行时实现：${forbidden}`);
    }
  }
}
