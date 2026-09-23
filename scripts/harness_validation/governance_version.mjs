import fs from "node:fs";
import path from "node:path";

import { ROOT, SKILLS_ROOT, fail, readText, relativePath } from "./core.mjs";

function latest(directory, pattern) {
  const name = fs.readdirSync(directory).filter((entry) => pattern.test(entry)).sort().at(-1);
  return name ? path.join(directory, name) : path.join(directory, "__missing_latest__.md");
}

const ADR_DIR = path.join(ROOT, "docs", "adr");
const CHANGELOG_DIR = path.join(ROOT, "docs", "changelog");
const PRODUCT_SPEC_DIR = path.join(ROOT, "docs", "product_spec");
const LATEST_ADR = latest(ADR_DIR, /^\d{8}_ADR\.md$/u);
const LATEST_CHANGELOG = latest(CHANGELOG_DIR, /^\d{8}_CHANGELOG\.md$/u);
const PRODUCT_SPEC = latest(PRODUCT_SPEC_DIR, /^\d{8}_product_spec\.md$/u);

export const MATERIALIZED_CHANGE_RECORDS = new Map([
  ["HARNESS-FEAT-MANAGED-MULTI-REMOTE-PUBLISH", ["202609141917", [relativePath(LATEST_CHANGELOG), relativePath(PRODUCT_SPEC)]]],
  ["HARNESS-FEAT-OPTIONAL-REMOTE-GIT-RELEASE", ["202609141917", null]],
  ["HARNESS-CHANGE-MAINSTREAM-LTS-STANDARD-USER-ENVIRONMENT", ["202609122231", null]],
  ["HARNESS-FIX-HARNESS-SOURCE-GIT-ONLY-RELEASE", ["202609122231", null]],
  ["HARNESS-CHANGE-REMOVE-HISTORICAL-COMPATIBILITY", ["202609111732", null]],
  ["HARNESS-FEAT-OPTIONAL-USER-OWNED-TASKS", ["202609102343", null]],
  ["HARNESS-CHANGE-SIMPLE-GIT-LIFECYCLE", ["202609101621", null]],
  ["HARNESS-FIX-PROJECT-TASK-SEQUENCE-AUTO-INCREMENT", ["202609101621", null]],
]);

export const OPTIONAL_REMOTE_ADR_SUPERSESSION_FRAGMENT = "同时取代 ADR-20260908-013“正式候选必须从已推送、带远端 tag 的提交构建”、ADR-20260908-007“本地/远端默认主分支与远端 tag 必须无条件一致”，以及 ADR-20260908-006“生命周期必须完成远端 push、构建只复核远端 tag”的远端强制子句";

function validWallClockTimestamp(value) {
  if (!/^\d{12}$/u.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(8, 10));
  const minute = Number(value.slice(10, 12));
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    && date.getUTCHours() === hour
    && date.getUTCMinutes() === minute;
}

export function validateMaterializedChange(errors, filePath, changeId, requiredVersion) {
  if (!fs.existsSync(filePath)) {
    fail(errors, `missing version contract file: ${relativePath(filePath)}`);
    return;
  }
  const lines = readText(filePath).split(/\r?\n/u).filter((line) => {
    const declared = /HARNESS-[A-Z0-9-]+/u.exec(line)?.[0];
    return declared === changeId && (line.includes("所需 Harness 版本") || line.includes("required_version"));
  });
  if (lines.length === 0) {
    fail(errors, `materialized Harness change missing in ${relativePath(filePath)}: ${changeId}`);
  } else if (lines.some((line) => !line.includes(requiredVersion) || /\bpending\b/u.test(line))) {
    fail(errors, `materialized Harness change has stale required version in ${relativePath(filePath)}: ${changeId} must be ${requiredVersion}`);
  }
}

/** 确认 Harness 时间版本合法、镜像一致且已发布变更均已物化。 */
export function validateVersionContract(errors, versionFile = path.join(ROOT, "Version.md")) {
  if (!fs.existsSync(versionFile)) {
    fail(errors, `missing version contract file: ${relativePath(versionFile)}`);
    return;
  }
  const versionText = readText(versionFile);
  const currentVersion = /当前版本：`(\d{12})`/u.exec(versionText)?.[1] ?? "__invalid__";
  if (currentVersion === "__invalid__") {
    fail(errors, "Version.md current Harness version must be 12 digits in YYYYMMDDHHMM");
  } else if (!validWallClockTimestamp(currentVersion)) {
    fail(errors, `Version.md current Harness version is not a valid Shanghai datetime: ${currentVersion}`);
  }

  const requirements = new Map([
    [versionFile, [`当前版本：\`${currentVersion}\``, "时间版本起始值：`202607301002`", "版本时区：`Asia/Shanghai`", "版本格式：`YYYYMMDDHHMM`", "发布状态：Released", "唯一事实来源", "docs/RELEASE.md", "创建并复读本地 `v{版本}-{YYYYMMDD}`", "只有当次选择远端发布时才推送并复读远端同名 tag"]],
    [path.join(ROOT, "README.md"), ["# 毕方桌面应用Harness模版", "Bifang Desktop Harness Template", "中文名称：毕方桌面应用Harness模版", "English name: Bifang Desktop Harness Template", `当前版本：v${currentVersion}`, "发布状态：Released", "上海时区 `YYYYMMDDHHMM`", "[`Version.md`](Version.md)"]],
    [PRODUCT_SPEC, [`当前版本：\`${currentVersion}\``, "上海时区格式为 `YYYYMMDDHHMM`", "唯一事实来源为根 `Version.md`"]],
    [path.join(ROOT, "docs", "RELEASE.md"), [`[\`Version.md\`](../Version.md) 中记录的 \`${currentVersion}\``, "`Asia/Shanghai`", "`YYYYMMDDHHMM`", "模板版本事实来源：根目录 `Version.md`", "本文件只维护版本与发布规则", "必须在同一次原子变化中同步根 `Version.md`、README、最新 Product Spec 与本文件", "发布后产生的新变化继续保持 `pending`", "node scripts/validate_harness.mjs"]],
    [path.join(SKILLS_ROOT, "desktop-prepare-release", "SKILL.md"), ["Harness 版本来自 `Version.md`", "$desktop-manage-version check --phase release", "机器版本不带 `v`"]],
    [path.join(SKILLS_ROOT, "desktop-instantiate-project", "SKILL.md"), ["仅属于 Harness 的根目录 `Version.md`", "根 `Cargo.toml"]],
  ]);
  const texts = new Map();
  for (const [filePath, fragments] of requirements) {
    if (!fs.existsSync(filePath)) {
      fail(errors, `missing version contract file: ${relativePath(filePath)}`);
      continue;
    }
    const text = readText(filePath);
    texts.set(filePath, text);
    for (const fragment of fragments) {
      if (!text.includes(fragment)) fail(errors, `version contract missing in ${relativePath(filePath)}: ${fragment}`);
    }
  }
  const releasePath = path.join(ROOT, "docs", "RELEASE.md");
  if (texts.get(releasePath)?.includes("模板版本事实来源：本文件")) fail(errors, "docs/RELEASE.md still claims to be the Harness version fact source");
  for (const filePath of [versionFile, releasePath, PRODUCT_SPEC]) {
    if (texts.get(filePath)?.includes("旧版本标识")) fail(errors, `legacy version identifier must not be reintroduced in ${relativePath(filePath)}`);
  }
  const defaultPaths = [relativePath(LATEST_CHANGELOG), relativePath(LATEST_ADR), relativePath(PRODUCT_SPEC)];
  for (const [changeId, [requiredVersion, declaredPaths]] of MATERIALIZED_CHANGE_RECORDS) {
    for (const relative of declaredPaths ?? defaultPaths) validateMaterializedChange(errors, path.join(ROOT, relative), changeId, requiredVersion);
  }
  if (!fs.existsSync(LATEST_ADR)) {
    fail(errors, `missing optional remote ADR: ${relativePath(LATEST_ADR)}`);
  } else if (!readText(LATEST_ADR).includes(OPTIONAL_REMOTE_ADR_SUPERSESSION_FRAGMENT)) {
    fail(errors, `optional remote ADR does not supersede every remote-only candidate contract in ${relativePath(LATEST_ADR)}`);
  }
}
