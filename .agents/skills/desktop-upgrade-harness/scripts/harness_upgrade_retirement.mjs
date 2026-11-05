/** 识别退役工程资产并校验下游已确认的清理选择，不操作产品实现。 */

import { UpgradeError } from "./harness_upgrade_safety.mjs";

export const RETIREMENT_SCOPE = "gui-update-statistics-v1";
/** 仅列已退役的 Harness 工程路径；不能按名称关键词扩展到产品目录。 */
export const RETIRED_ENGINEERING_PATHS = [
  ".agents/skills/desktop-enable-gui-updates",
  ".agents/skills/desktop-add-gui-telemetry",
  ".agents/skills/desktop-add-gui-updater",
  ".agents/skills/desktop-build-tauri-release/references/tauri-updater.md",
  ".agents/skills/desktop-prepare-gui-support-surfaces/references/update-and-telemetry.md",
  ".agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/media/updater",
  ...["BrandUpdaterBanner.tsx", "MandatoryUpdateGateTemplate.tsx", "updatePresentation.ts"].map(name => `.agents/skills/desktop-prepare-gui-support-surfaces/assets/brand-support/react/${name}`),
];

/** 匹配精确退役文件或目录后代，避免命中同名前缀的正常工程资产。 */
export function isRetiredEngineeringPath(relative) {
  return RETIRED_ENGINEERING_PATHS.some(root => relative === root || relative.startsWith(`${root}/`));
}

/** 读取可选的项目清理偏好；旧来源锁缺少字段时仍然可读，但不能推断选择。 */
export function validateRetirementPreference(value) {
  if (value === undefined) return null;
  if (!value || Array.isArray(value) || typeof value !== "object"
    || Object.keys(value).sort().join(",") !== "confirmed_at,scope,selection"
    || value.scope !== RETIREMENT_SCOPE || !["remove", "preserve"].includes(value.selection)
    || typeof value.confirmed_at !== "string" || !/^\d{4}-\d{2}-\d{2}T/u.test(value.confirmed_at)
    || !Number.isFinite(Date.parse(value.confirmed_at))) throw new UpgradeError("retirement_cleanup 清理选择非法，必须重新核对用户确认");
  return value;
}

/** 优先复用本次明确选择，其次读取项目记忆；不把普通升级授权当作清理同意。 */
export function retirementSelection(request, remembered) {
  if (request !== null && !["remove", "preserve"].includes(request)) throw new UpgradeError("--retirement-cleanup 必须为 remove 或 preserve");
  return { scope: RETIREMENT_SCOPE, selection: request ?? remembered?.selection ?? null, source: request !== null ? "request" : remembered ? "remembered" : "pending" };
}
