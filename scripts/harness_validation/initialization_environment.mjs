import fs from "node:fs";

import { run } from "./core.mjs";

/** Check the executable bit stored by Git so Windows and POSIX hosts agree. */
export function sourceFileHasExecutableMode(filePath) {
  if (process.platform !== "win32") {
    try {
      return (fs.statSync(filePath).mode & 0o111) !== 0;
    } catch {
      return false;
    }
  }
  const result = run("git", ["ls-files", "--stage", "--", filePath]);
  if (result.error || result.status !== 0) return false;
  return result.stdout
    .split(/\r?\n/u)
    .filter(Boolean)
    .some((line) => line.startsWith("100755 "));
}
