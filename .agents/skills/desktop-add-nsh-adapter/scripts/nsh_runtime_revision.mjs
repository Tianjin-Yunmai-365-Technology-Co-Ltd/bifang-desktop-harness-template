/** 当前仅支持正式发布的 NSH 0.4.0 运行时。 */
export const NSH_STABLE_REVISION = 'e626a8dd8f8d8b277b9507cfd5ac74d0e67020f3';
export const NSH_TARGETS = Object.freeze(['desktop', 'mobile', 'web']);

/** 校验受支持能力集合，并返回唯一正式工具链提交。 */
export function nshRevisionForTargets(targets) {
  if (!Array.isArray(targets) || targets.length === 0) throw new Error('NSH target selection missing');
  if (new Set(targets).size !== targets.length || targets.some(target => !NSH_TARGETS.includes(target))) throw new Error('invalid NSH targets');
  return NSH_STABLE_REVISION;
}
