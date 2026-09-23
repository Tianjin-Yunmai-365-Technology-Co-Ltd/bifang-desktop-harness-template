/** 发布合同 mutation 回归的共享夹具。 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function withTemporaryFile(contents, name, callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "harness-release-"));
  const filePath = path.join(directory, name);
  fs.writeFileSync(filePath, contents, "utf8");
  try { return callback(filePath); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

export function mutateFile(sourcePath, fragment, replacement = "") {
  const source = fs.readFileSync(sourcePath, "utf8");
  if (!source.includes(fragment)) throw new Error(`fixture fragment is absent: ${fragment}`);
  return source.replace(fragment, replacement);
}

export function validateMutation(validator, option, sourcePath, fragment, replacement = "") {
  return withTemporaryFile(mutateFile(sourcePath, fragment, replacement), path.basename(sourcePath), (filePath) => {
    const errors = [];
    validator(errors, { [option]: filePath });
    return errors;
  });
}
