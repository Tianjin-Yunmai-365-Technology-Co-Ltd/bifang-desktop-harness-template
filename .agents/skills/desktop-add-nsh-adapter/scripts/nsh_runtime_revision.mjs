/** 当前仅支持正式发布的 NSH 0.5.0 运行时。 */
export const NSH_STABLE_REVISION = 'f4d68f7f9f31eb7b3ecc8a4cbc31096d5c6238a1';
export const NSH_TARGETS = Object.freeze(['desktop', 'mobile', 'web', 'tui']);

/** 校验受支持能力集合，并返回唯一正式工具链提交。 */
export function nshRevisionForTargets(targets) {
  if (!Array.isArray(targets) || targets.length === 0) throw new Error('NSH target selection missing');
  if (new Set(targets).size !== targets.length || targets.some(target => !NSH_TARGETS.includes(target))) throw new Error('invalid NSH targets');
  return NSH_STABLE_REVISION;
}
