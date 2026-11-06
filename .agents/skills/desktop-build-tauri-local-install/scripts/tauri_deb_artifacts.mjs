/** deb 与相邻证据按完整目录提交；历史集合不覆盖，大文件摘要使用固定缓冲。 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

/** 逐级校验普通目录树，缺失目录只在显式允许时建立，拒绝符号链接祖先。 */
export function ordinaryDirectory(value, create = false) {
  const absolute = path.resolve(value);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current); }
    catch (error) {
      if (error.code !== 'ENOENT' || !create) throw error;
      fs.mkdirSync(current);
      stat = fs.lstatSync(current);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('artifact directory must be an ordinary path');
  }
  return absolute;
}

/** 以有界缓冲读取普通文件并核对 fd 身份及读期间变化，绝不跟随最终符号链接。 */
export function sha256File(file) {
  ordinaryDirectory(path.dirname(file));
  const before = fs.lstatSync(file);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error('hash input must be a regular file');
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  const hash = createHash('sha256');
  try {
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) throw new Error('hash file identity changed');
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let length;
    while ((length = fs.readSync(descriptor, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, length));
    const after = fs.fstatSync(descriptor);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw new Error('hash input changed while reading');
    return hash.digest('hex');
  } finally { fs.closeSync(descriptor); }
}

/** 只接受恰好三个非空普通成员，证据必须对应同一 deb 字节和最终绝对路径。 */
function verifyCollection(directory, filename, result) {
  const expected = [filename, `${filename}.sha256`, `${filename}.inspection.json`].sort();
  if (JSON.stringify(fs.readdirSync(directory).sort()) !== JSON.stringify(expected)) throw new Error('deb artifact file set is not exact');
  for (const name of expected) {
    const stat = fs.lstatSync(path.join(directory, name));
    if (!stat.isFile() || stat.isSymbolicLink() || !stat.size) throw new Error('deb artifact must be a nonempty regular file');
  }
  if (sha256File(path.join(directory, filename)) !== result.sha256
      || fs.statSync(path.join(directory, filename)).size !== result.bytes
      || fs.readFileSync(path.join(directory, `${filename}.sha256`), 'utf8') !== `${result.sha256}  ${filename}\n`
      || fs.readFileSync(path.join(directory, `${filename}.inspection.json`), 'utf8') !== `${JSON.stringify(result, null, 2)}\n`) throw new Error('deb artifact evidence does not match final bytes');
}

/** 目录身份保持不变时才移除本次私有 stage；漂移现场保留，不递归删除陌生目录。 */
export function removeOwnedDirectory(directory, identity) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.dev !== identity.dev || stat.ino !== identity.ino) throw new Error('owned artifact directory changed; cleanup remains unverified');
  fs.rmSync(directory, { recursive: true });
}

/** 解包工作区结束后只清理自有目录；清理失败不会覆盖真实命令错误或已提交产物终态。 */
export async function withDebWorkspace(outputRoot, operation) {
  const root = ordinaryDirectory(outputRoot, true);
  const staging = fs.mkdtempSync(path.join(root, '.deb-normalize-'));
  const identity = fs.lstatSync(staging);
  let result = null, failure = null, cleanupFailed = false;
  try { fs.chmodSync(staging, 0o700); result = await operation(staging); }
  catch (error) { failure = error; }
  finally {
    try { removeOwnedDirectory(staging, identity); } catch { cleanupFailed = true; }
  }
  if (cleanupFailed) {
    const previous = failure?.recovery ?? result ?? {};
    const cleanup = {
      retainedPaths: [...new Set([...(previous.retainedPaths ?? []), staging])],
      cleanupWarnings: [...(previous.cleanupWarnings ?? []), '本次解包工作区清理未完成；请按精确保留路径恢复。'],
    };
    if (failure) failure.recovery = { ...previous, ...cleanup };
    else result = { ...result, ...cleanup };
  }
  if (failure) throw failure;
  return result;
}

/** 保留旧集合，新集合在私有唯一容器内一次 rename 发布；返回前核对实际完整字节。 */
export function publishDebCollection(outputRoot, normalizedDeb, filename, details) {
  if (typeof filename !== 'string' || !/^[a-z0-9][a-z0-9.+-]*\.deb$/u.test(filename)) throw new Error('invalid deb artifact filename');
  const root = ordinaryDirectory(outputRoot, true);
  const digest = sha256File(normalizedDeb);
  const bytes = fs.statSync(normalizedDeb).size;
  if (!bytes) throw new Error('normalized deb must not be empty');
  const staging = fs.mkdtempSync(path.join(root, '.deb-artifacts-'));
  const stageIdentity = fs.lstatSync(staging);
  let container = null, containerIdentity = null, committed = false, result = null, failure = null;
  const retainedPaths = [], cleanupWarnings = [];
  try {
    container = fs.mkdtempSync(path.join(root, `${filename.slice(0, -4)}-`));
    containerIdentity = fs.lstatSync(container);
    fs.chmodSync(staging, 0o700); fs.chmodSync(container, 0o700);
    const publication = path.join(staging, 'publish');
    fs.mkdirSync(publication, { mode: 0o700 });
    const artifactDirectory = path.join(container, 'artifacts');
    result = { ...details, artifactDirectory, output: path.join(artifactDirectory, filename), sha256: digest, bytes };
    const destination = path.join(publication, filename);
    fs.copyFileSync(normalizedDeb, destination, fs.constants.COPYFILE_EXCL);
    fs.writeFileSync(`${destination}.sha256`, `${digest}  ${filename}\n`, { flag: 'wx' });
    fs.writeFileSync(`${destination}.inspection.json`, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
    verifyCollection(publication, filename, result);
    ordinaryDirectory(container);
    const actualContainer = fs.lstatSync(container);
    if (actualContainer.dev !== containerIdentity.dev || actualContainer.ino !== containerIdentity.ino || fs.readdirSync(container).length) throw new Error('deb publication container changed');
    // 容器由本次 mkdtemp 独占取得；不先删除既有目录为 rename 腾位置。
    fs.renameSync(publication, artifactDirectory);
    committed = true;
    verifyCollection(artifactDirectory, filename, result);
  } catch (error) {
    failure = error;
  } finally {
    try { removeOwnedDirectory(staging, stageIdentity); }
    catch { retainedPaths.push(staging); cleanupWarnings.push('本次私有 stage 清理未完成；已提交集合的字节与证据保持有效。'); }
    if (container && !committed) {
      try {
        const stat = fs.lstatSync(container);
        if (stat.dev !== containerIdentity.dev || stat.ino !== containerIdentity.ino || !stat.isDirectory() || stat.isSymbolicLink()) throw new Error('container changed');
        fs.rmdirSync(container);
      } catch { retainedPaths.push(container); cleanupWarnings.push('本次未提交容器保留；未知或并发内容不删除。'); }
    }
  }
  if (failure) {
    failure.recovery = { artifactDirectory: container, committed, retainedPaths, cleanupWarnings, note: '既有集合未覆盖；本次未确认的集合不得消费。' };
    throw failure;
  }
  return cleanupWarnings.length ? { ...result, retainedPaths, cleanupWarnings } : result;
}
