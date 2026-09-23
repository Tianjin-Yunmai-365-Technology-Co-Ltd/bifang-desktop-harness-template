import path from "node:path";

import { inspectProject } from "../../.agents/skills/desktop-implement-change/scripts/check_rust_chinese_comments.mjs";
import { SKILLS_ROOT, fail } from "./core.mjs";

const RUST_ASSET = path.join(SKILLS_ROOT, "desktop-initialize-rust-project", "assets", "rust-lib-cli");

/** 严格校验 Rust 中文声明注释检查器报告的类型与成功态不变量。 */
export function rustCommentReportSchemaErrors(report) {
  const errors = [];
  if (!report || typeof report !== "object" || Array.isArray(report)) return ["report must be an object"];
  if (typeof report.ok !== "boolean") errors.push("ok must be a boolean");
  if (typeof report.root !== "string") errors.push("root must be a string");
  for (const field of ["checkedPackages", "checkedRustFiles", "checkedDeclarations"]) {
    if (!Number.isInteger(report[field]) || report[field] < 0) errors.push(`${field} must be a non-negative integer`);
  }
  if (!Array.isArray(report.errors) || report.errors.some((item) => typeof item !== "string")) errors.push("errors must be a string array");
  if (!Array.isArray(report.violations)) {
    errors.push("violations must be an object array");
  } else {
    const types = { path: "string", line: "number", column: "number", kind: "string", name: "string", reason: "string" };
    report.violations.forEach((violation, index) => {
      if (!violation || typeof violation !== "object" || Array.isArray(violation)) {
        errors.push(`violations[${index}] must be an object`);
        return;
      }
      for (const [field, type] of Object.entries(types)) {
        if (typeof violation[field] !== type || (type === "number" && !Number.isInteger(violation[field]))) errors.push(`violations[${index}].${field} must be ${type === "number" ? "int" : type}`);
      }
    });
  }
  if (errors.length === 0 && report.ok) {
    if (report.errors.length > 0 || report.violations.length > 0) errors.push("ok=true cannot contain errors or violations");
    if (!["checkedPackages", "checkedRustFiles", "checkedDeclarations"].every((field) => report[field] > 0)) errors.push("ok=true requires non-empty package, file, and declaration counts");
  }
  return errors;
}

/** 对完整中性 Cargo workspace 运行唯一检查器，并把报告转换为 Harness 错误。 */
export function validateRustChineseComments(errors, root = RUST_ASSET, inspector = inspectProject) {
  let report;
  try {
    report = inspector(root);
  } catch (error) {
    fail(errors, `cannot execute Rust Chinese-comment checker: ${error.message}`);
    return;
  }
  const schemaErrors = rustCommentReportSchemaErrors(report);
  if (schemaErrors.length > 0) {
    for (const detail of schemaErrors) fail(errors, `invalid Rust Chinese-comment checker schema: ${detail}`);
    return;
  }
  for (const detail of report.errors) fail(errors, `Rust Chinese-comment checker error: ${detail}`);
  for (const violation of report.violations) {
    fail(errors, `Rust declaration lacks an adjacent Chinese doc comment: ${violation.path}:${violation.line}:${violation.column} ${violation.kind} ${violation.name}`);
  }
  if (report.ok && (report.errors.length > 0 || report.violations.length > 0)) fail(errors, "Rust Chinese-comment checker returned success with diagnostics");
  if (!report.ok && report.errors.length === 0 && report.violations.length === 0) fail(errors, "Rust Chinese-comment checker failed without diagnostics");
}
