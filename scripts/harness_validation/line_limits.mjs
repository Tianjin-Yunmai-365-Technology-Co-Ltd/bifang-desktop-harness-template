import path from "node:path";

import { inspectRepository } from "../../.agents/skills/desktop-implement-change/scripts/check_file_line_limits.mjs";
import {
  ROOT,
  decodeMaintainedText,
  fail,
  physicalLineCount,
  trackedFiles,
} from "./core.mjs";

const FRONTEND_SUFFIXES = new Set([
  ".astro", ".cjs", ".css", ".cts", ".html", ".js", ".jsx", ".less", ".mjs", ".mts",
  ".sass", ".scss", ".svelte", ".ts", ".tsx", ".vue",
]);
const GENERATED_NAMES = new Set([
  "Cargo.lock", "package-lock.json", "pnpm-lock.yaml", "yarn.lock",
]);

/** 按工程规则选择建议阈值与硬上限。 */
export function lineLimitProfile(relative) {
  const suffix = path.extname(relative).toLowerCase();
  if (suffix === ".rs") return { name: "Rust", review: 400, hard: 800 };
  if (FRONTEND_SUFFIXES.has(suffix)) return { name: "前端", review: 500, hard: 1000 };
  return { name: "人工维护文本", review: 500, hard: 2000 };
}

function shouldSkip(relative) {
  if (GENERATED_NAMES.has(path.posix.basename(relative))) return true;
  if (relative.startsWith(".git/") || relative.startsWith("release/") || relative.startsWith("node_modules/") || relative.startsWith("target/")) return true;
  return false;
}

/** 检查分层物理行数；建议区间仅在显式发布审查时产生提示。 */
export function validateLineLimits(
  errors,
  warnings,
  { releaseReview = false, files = null, inspect = inspectRepository, root = ROOT } = {},
) {
  if (files !== null) {
    // 单元测试可用精确文件集合验证 profile；仓库级门禁始终复用下游唯一检查器。
    let checked = 0;
    for (const relative of files) {
      if (shouldSkip(relative)) continue;
      const text = decodeMaintainedText(path.join(ROOT, relative));
      if (text === null) continue;
      checked += 1;
      const lines = physicalLineCount(text);
      const profile = lineLimitProfile(relative);
      if (lines > profile.hard) fail(errors, `${profile.name}文件超过 ${profile.hard} 行硬上限: ${relative} (${lines} 行)`);
      else if (releaseReview && lines > profile.review) warnings.push(`${profile.name}文件进入 ${profile.review + 1}-${profile.hard} 行语义复核区间: ${relative} (${lines} 行)`);
    }
    return { checked };
  }
  let report;
  try {
    report = inspect(root);
  } catch (error) {
    fail(errors, `cannot execute file line-limit checker: ${error.message}`);
    return { checked: 0 };
  }
  for (const detail of report.errors ?? []) fail(errors, `file line-limit checker error: ${detail}`);
  for (const candidate of report.reviewCandidates ?? []) {
    if (releaseReview) warnings.push(`${candidate.profile} file exceeds its ${candidate.threshold}-line refactor-review threshold: ${candidate.path} (${candidate.lines} lines, hard limit ${candidate.limit})`);
  }
  for (const violation of report.violations ?? []) {
    fail(errors, `${violation.profile} file exceeds its hard ${violation.limit}-line limit: ${violation.path} (${violation.lines} lines)`);
  }
  if (report.ok && ((report.errors?.length ?? 0) > 0 || (report.violations?.length ?? 0) > 0)) fail(errors, "file line-limit checker returned success with diagnostics");
  if (!report.ok && (report.errors?.length ?? 0) === 0 && (report.violations?.length ?? 0) === 0) fail(errors, "file line-limit checker failed without diagnostics");
  return { checked: report.checkedTextFiles ?? 0 };
}

/** 显式发布审查时报告临时标记，日常校验不产生噪声。 */
export function validateReviewMarkers(warnings, files = null) {
  const candidates = files ?? trackedFiles();
  const reviewSuffixes = new Set([".cjs", ".js", ".mjs", ".ps1", ".rs", ".sh", ".ts", ".tsx"]);
  const commentMarker = /^\s*(?:(?:\/\/)|#).*\b(?:TODO|FIXME|HACK)\b/u;
  for (const relative of candidates) {
    if (shouldSkip(relative)) continue;
    if (!relative.startsWith("scripts/") && !relative.startsWith(".agents/skills/")) continue;
    if (!reviewSuffixes.has(path.extname(relative).toLowerCase())) continue;
    const absolute = path.join(ROOT, relative);
    let text;
    try {
      text = decodeMaintainedText(absolute);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    if (text === null) continue;
    const lines = text.split(/\r\n|[\n\r]/u);
    lines.forEach((line, index) => {
      if (commentMarker.test(line)) {
        warnings.push(`临时标记需语义复核: ${relative}:${index + 1}`);
      }
    });
  }
}
