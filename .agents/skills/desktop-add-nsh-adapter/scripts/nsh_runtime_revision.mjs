/** 当前仅支持正式发布的 NSH 0.4.0 运行时。 */
export const NSH_STABLE_REVISION = 'e626a8dd8f8d8b277b9507cfd5ac74d0e67020f3';
/** 历史预览提交只保留供迁移诊断，不是可用目标。 */
export const NSH_TUI_PREVIEW_REVISION = 'beeb9fc7707e0d4a195a4f7274f77b30e134c500';

/** 校验受支持能力集合，并返回唯一正式工具链提交。 */
export function nshRevisionForTargets(targets) {
  if (!Array.isArray(targets) || targets.length === 0 || new Set(targets).size !== targets.length) throw new Error('NSH target selection missing');
  if (targets.includes('tui')) throw new Error('NSH TUI is temporarily unavailable in the released 0.4.0 toolchain');
  if (targets.some(target => !['desktop', 'mobile', 'web'].includes(target))) throw new Error('invalid NSH targets');
  return NSH_STABLE_REVISION;
}
