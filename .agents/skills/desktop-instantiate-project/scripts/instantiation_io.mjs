/** 只对精确文件清单执行无覆盖安装与身份核对后的自有资源回收。 */
import fs from 'node:fs';
import path from 'node:path';
import { assertOrdinaryPath, lstatOrNull, readRegular, safeRelative, sha256 } from './instantiation_files.mjs';

/** 创建缺失目录并登记真实身份；已存在路径只允许普通目录。 */
function ensureDirectory(directory, created) {
  const stat = lstatOrNull(directory);
  if (stat) {
    assertOrdinaryPath(directory);
    if (!stat.isDirectory()) throw new Error(`目标祖先不是目录：${directory}`);
    return;
  }
  ensureDirectory(path.dirname(directory), created);
  fs.mkdirSync(directory, { mode: 0o755 });
  const owned = fs.lstatSync(directory);
  created.push({ path: directory, dev: owned.dev, ino: owned.ino, mode: owned.mode & 0o777 });
}

/** 文件内容和 inode 都未漂移时才移除；未知变化留给调用方明确恢复。 */
function rollbackOwned(files, directories) {
  const retained = [];
  for (const owned of [...files].reverse()) {
    try {
      const stat = lstatOrNull(owned.path);
      if (!stat) continue;
      if (stat.dev !== owned.dev || stat.ino !== owned.ino || (stat.mode & 0o777) !== owned.mode || readRegular(owned.path).sha256 !== owned.sha256) { retained.push(owned.path); continue; }
      fs.unlinkSync(owned.path);
    } catch { retained.push(owned.path); }
  }
  for (const owned of [...directories].reverse()) {
    try {
      assertOrdinaryPath(owned.path);
      const stat = lstatOrNull(owned.path);
      if (!stat) continue;
      if (stat.dev !== owned.dev || stat.ino !== owned.ino || (stat.mode & 0o777) !== owned.mode || !stat.isDirectory()) { retained.push(owned.path); continue; }
      fs.rmdirSync(owned.path);
    } catch { retained.push(owned.path); }
  }
  return [...new Set(retained)].sort();
}

/** 空目标安装结束前核对完整集合；缓存或隐藏陌生项也不能冒充本次成功。 */
function verifyInstalledTree(root, expected, identity) {
  const directories = new Set();
  for (const relative of expected.keys()) {
    let parent = path.posix.dirname(relative);
    while (parent !== '.') { directories.add(parent); parent = path.posix.dirname(parent); }
  }
  const observed = new Set();
  const visit = relative => {
    const directory = path.join(root, relative);
    assertOrdinaryPath(directory);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const next = relative ? `${relative}/${entry.name}` : entry.name;
      const target = path.join(root, next);
      if (entry.isDirectory() && directories.has(next)) visit(next);
      else if (entry.isFile() && expected.has(next)) {
        const actual = readRegular(target);
        const intended = expected.get(next);
        if (actual.sha256 !== sha256(intended.bytes) || actual.mode !== intended.mode) throw new Error(`安装结束前文件已漂移：${next}`);
        observed.add(next);
      } else {
        const error = new Error(`目标出现计划外条目或链接：${next}`);
        error.unexpectedPaths = [target];
        throw error;
      }
    }
  };
  visit('');
  const actualRoot = fs.lstatSync(root);
  if (actualRoot.dev !== identity.dev || actualRoot.ino !== identity.ino || observed.size !== expected.size) throw new Error('安装目标身份或完整文件集合已漂移');
}

/** 安装固定内存快照，不重扫源树，不覆盖既有项；失败只回收仍可证明自有的未漂移字节。 */
export function installExclusive(root, files) {
  assertOrdinaryPath(root, true);
  const before = lstatOrNull(root);
  if (before && (!before.isDirectory() || fs.readdirSync(root).length)) throw new Error('目标必须缺失或为空普通目录');
  const createdDirectories = [];
  const createdFiles = [];
  try {
    ensureDirectory(root, createdDirectories);
    const rootIdentity = fs.lstatSync(root);
    if (fs.readdirSync(root).length) throw new Error('创建时目标已变化');
    for (const [relative, file] of files) {
      safeRelative(relative);
      const destination = path.join(root, relative);
      ensureDirectory(path.dirname(destination), createdDirectories);
      assertOrdinaryPath(path.dirname(destination));
      const fd = fs.openSync(destination, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0), file.mode);
      const stat = fs.fstatSync(fd);
      const owned = { path: destination, dev: stat.dev, ino: stat.ino, mode: stat.mode & 0o777, sha256: sha256(Buffer.alloc(0)) };
      createdFiles.push(owned);
      try {
        fs.writeFileSync(fd, file.bytes);
        fs.fchmodSync(fd, file.mode);
        owned.mode = file.mode;
        owned.sha256 = sha256(file.bytes);
      } finally { fs.closeSync(fd); }
      if (readRegular(destination).sha256 !== owned.sha256) throw new Error(`新文件写入后漂移：${relative}`);
    }
    verifyInstalledTree(root, files, rootIdentity);
    return [...files].map(([relative, file]) => ({ path: relative, sha256: sha256(file.bytes), mode: file.mode }));
  } catch (error) {
    error.recovery = { retainedPaths: [...new Set([...rollbackOwned(createdFiles, createdDirectories), ...(error.unexpectedPaths ?? [])])].sort(), note: '仅回收身份和字节未漂移的本次自有项；其它项保持原样。' };
    throw error;
  }
}

/** 枚举目标当前普通文件；缓存/构建产物不参与工程裁剪，也不沿链接扫描。 */
export function inventoryTarget(root, relative = '') {
  const files = new Map();
  assertOrdinaryPath(path.join(root, relative));
  for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
    const next = relative ? `${relative}/${entry.name}` : entry.name;
    if (['target', 'node_modules', 'dist', 'release', 'coverage', '.nsh'].includes(entry.name)) continue;
    if (entry.name === '.git') throw new Error('终端裁剪必须在独立 Git 基线之前执行');
    if (entry.isSymbolicLink()) throw new Error(`目标包含符号链接：${next}`);
    if (entry.isDirectory()) for (const [file, value] of inventoryTarget(root, next)) files.set(file, value);
    else files.set(next, readRegular(path.join(root, next)));
  }
  return files;
}
