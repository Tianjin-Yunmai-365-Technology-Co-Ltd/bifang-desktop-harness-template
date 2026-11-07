/** Stable NSH remains the default; only projects selecting TUI use main preview. */
export const NSH_STABLE_REVISION = 'e626a8dd8f8d8b277b9507cfd5ac74d0e67020f3';
export const NSH_TUI_PREVIEW_REVISION = 'beeb9fc7707e0d4a195a4f7274f77b30e134c500';

export function nshRevisionForTargets(targets) {
  if (!Array.isArray(targets) || targets.length === 0) throw new Error('NSH target selection missing');
  return targets.includes('tui') ? NSH_TUI_PREVIEW_REVISION : NSH_STABLE_REVISION;
}
