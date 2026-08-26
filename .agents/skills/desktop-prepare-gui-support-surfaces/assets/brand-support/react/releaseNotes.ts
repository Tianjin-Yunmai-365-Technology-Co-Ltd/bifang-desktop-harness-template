/** 关于页可展示的单个发布版本更新日志。 */
export interface ReleaseNoteEntry {
  releaseDate: string;
  version: string;
  featureOptimizations: readonly string[];
  bugFixes: readonly string[];
}

/** 关于页最多保留并展示最近五个正式发布版本。 */
export const MAX_VISIBLE_RELEASE_NOTE_VERSIONS = 5;

/** 每个版本的功能优化与问题修复各自最多展示十条。 */
export const MAX_VISIBLE_RELEASE_NOTE_ITEMS = 10;

/** 防御性裁剪已由发布门禁校验的数据，避免页面越过固定展示上限。 */
export function selectVisibleReleaseNotes(
  releases: readonly ReleaseNoteEntry[],
): ReleaseNoteEntry[] {
  return releases.slice(0, MAX_VISIBLE_RELEASE_NOTE_VERSIONS).map((release) => ({
    ...release,
    featureOptimizations: release.featureOptimizations.slice(
      0,
      MAX_VISIBLE_RELEASE_NOTE_ITEMS,
    ),
    bugFixes: release.bugFixes.slice(0, MAX_VISIBLE_RELEASE_NOTE_ITEMS),
  }));
}
