/** GUI 可展示的更新检查状态；远程协议和状态判定由 Rust adapter 与 core 提供。 */
export type UpdateStatus =
  | "not-configured"
  | "idle"
  | "checking"
  | "up-to-date"
  | "optional-update"
  | "required-update"
  | "failed";

/** 设置页和强更门共用的只读更新结果。 */
export interface UpdatePresentation {
  status: UpdateStatus;
  currentVersion: string;
  availableVersion?: string;
  releaseNotes?: string;
}

/** 只接受 core 已判定的强更状态，前端不得从远端布尔值自行推导。 */
export function requiresMandatoryUpdate(update: UpdatePresentation): boolean {
  return update.status === "required-update";
}
