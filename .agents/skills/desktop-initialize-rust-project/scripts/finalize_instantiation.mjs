#!/usr/bin/env node
/** 真实初始化检查后的终端裁剪；本 helper 不判定 Computer Use 或创建 Git 基线。 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { assertOrdinaryPath, lstatOrNull, readRegular, sha256 } from '../../desktop-instantiate-project/scripts/instantiation_files.mjs';
import { inventoryTarget } from '../../desktop-instantiate-project/scripts/instantiation_io.mjs';
import { renderPrunedFiles } from './instantiation_pruning.mjs';

/** 按稳定路径顺序绑定当前工程字节，不把构建缓存当作工程源。 */
function manifest(files) { return [...files].map(([relative, file]) => ({ path: relative, sha256: sha256(file.bytes), mode: file.mode })); }

/** 一次读取目标并生成完整待修改集合，所有检查在任何裁剪写入之前完成。 */
function build(preparation) {
  if (!preparation || typeof preparation.targetRoot !== 'string' || !path.isAbsolute(preparation.targetRoot)) throw new Error('缺少唯一绝对目标根');
  const root = assertOrdinaryPath(preparation.targetRoot);
  const current = inventoryTarget(root);
  const rendered = renderPrunedFiles(preparation, current);
  const scopeDigest = sha256(JSON.stringify(manifest(current)));
  const operations = [];
  for (const [relative, before] of current) {
    const after = rendered.files.get(relative);
    if (!after || after.mode !== before.mode || !after.bytes.equals(before.bytes)) operations.push({ path: relative, action: after ? 'replace' : 'remove', before: before.sha256, ...(after ? { after: sha256(after.bytes) } : {}) });
  }
  const requiredEvidence = ['unitTests'];
  if (rendered.selection.guiFramework) requiredEvidence.push('initializationBuild', 'computerUse');
  if (rendered.selection.nshTargets) {
    const references = {
      desktop: ['nshDesktopPackage', 'nshDesktopRun'],
      mobile: ['nshMobileRun'],
      web: ['nshWebPackage', 'nshWebRun'],
      tui: ['nshTuiTests', 'nshTuiRun'],
    };
    for (const target of rendered.selection.nshTargets) requiredEvidence.push(...references[target]);
  }
  const body = { schemaVersion: 1, targetRoot: root, summaryDigest: preparation.summaryDigest, scopeDigest, operations, retainedSkills: rendered.skills, requiredEvidence };
  return { root, current, rendered, plan: { ...body, planDigest: sha256(JSON.stringify(body)) } };
}

/** 预览终端裁剪及证据引用需求，不写日志、不删除文件。 */
export function planFinalization(preparation) { return build(preparation).plan; }

/** 外部检查由原初始化 Skill 执行；这里只核对引用与工程快照绑定，拒绝自填 passed 开关。 */
function checkEvidence(evidence, plan) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)
      || Object.keys(evidence).some(key => !['scopeDigest', ...plan.requiredEvidence].includes(key)) || evidence.scopeDigest !== plan.scopeDigest) throw new Error('初始化检查引用缺失、含非法成功开关或不绑定当前工程');
  for (const key of plan.requiredEvidence) {
    if (typeof evidence[key] !== 'string' || !/^(?:tool:|\/|[A-Za-z]:[\\/])\S/u.test(evidence[key]) || /[\x00-\x1f\x7f]/u.test(evidence[key])) throw new Error(`缺少真实外部检查引用：${key}`);
    if (path.isAbsolute(evidence[key])) readRegular(evidence[key]);
  }
}

/** 只恢复仍属于本次写入的内容；用户并发改动保持原样，原始字节保存在恢复目录中。 */
function restoreOriginals(root, stage, completed) {
  const unresolved = [];
  for (const item of [...completed].reverse()) {
    const target = path.join(root, item.path);
    const original = path.join(stage, item.path);
    try {
      assertOrdinaryPath(path.dirname(target));
      const stat = lstatOrNull(target);
      if (stat) {
        const current = readRegular(target);
        if (!item.installed || current.dev !== item.installed.dev || current.ino !== item.installed.ino || current.mode !== item.installed.mode || current.sha256 !== item.installed.sha256) { unresolved.push(item.path); continue; }
        fs.unlinkSync(target);
      }
      const saved = fs.lstatSync(original);
      if (!saved.isFile() || saved.isSymbolicLink()) { unresolved.push(item.path); continue; }
      fs.copyFileSync(original, target, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(target, saved.mode & 0o777);
      fs.unlinkSync(original);
    } catch { unresolved.push(item.path); }
  }
  return unresolved;
}

/** 精确文件事务先隔离原字节，再无覆盖安装新字节；失败时保留可恢复原件，不递归删除目标。 */
function applyOperations(root, current, rendered, operations) {
  const stage = fs.mkdtempSync(path.join(path.dirname(root), '.harness-prune-'));
  const completed = [];
  try {
    for (const operation of operations) {
      const target = path.join(root, operation.path);
      const before = current.get(operation.path);
      const actual = readRegular(target);
      if (actual.sha256 !== before.sha256 || actual.mode !== before.mode || actual.dev !== before.dev || actual.ino !== before.ino) throw new Error(`裁剪文件已漂移：${operation.path}`);
      const backup = path.join(stage, operation.path);
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.renameSync(target, backup);
      const record = { path: operation.path, mode: before.mode, installed: null };
      completed.push(record);
      // rename 可能抓到预检后被并发替换的文件；先核对真实移动字节，失败恢复这个真实原件。
      const moved = readRegular(backup);
      if (moved.sha256 !== before.sha256 || moved.mode !== before.mode || moved.dev !== before.dev || moved.ino !== before.ino) throw new Error(`隔离期间文件已漂移：${operation.path}`);
      const after = rendered.files.get(operation.path);
      if (after) {
        assertOrdinaryPath(path.dirname(target));
        const fd = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0), after.mode);
        const stat = fs.fstatSync(fd);
        record.installed = { dev: stat.dev, ino: stat.ino, mode: stat.mode & 0o777, sha256: sha256(Buffer.alloc(0)) };
        try { fs.writeFileSync(fd, after.bytes); fs.fchmodSync(fd, after.mode); record.installed.mode = after.mode; record.installed.sha256 = sha256(after.bytes); }
        finally { fs.closeSync(fd); }
      }
    }
    const actual = manifest(inventoryTarget(root));
    const expected = manifest(rendered.files);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('裁剪后工程文件集合或字节发生并发变化');
  } catch (error) {
    const unresolved = restoreOriginals(root, stage, completed);
    if (!unresolved.length) fs.rmSync(stage, { recursive: true });
    error.recovery = { unresolved, ...(unresolved.length ? { originalsDirectory: stage } : {}), note: '并发或部分写入变化不覆盖；未恢复原件保留供精确恢复。' };
    throw error;
  }
  // 文件集合已提交，空目录或备份清理失败不能反转为无恢复信息的失败状态。
  const retainedDirectories = [];
  try { fs.rmSync(stage, { recursive: true }); } catch { retainedDirectories.push(stage); }
  // 只移除本次明确裁掉文件的空祖先；构建产物和未知条目会让 rmdir 安全停止。
  const directories = new Set();
  for (const { path: relative, action } of operations) if (action === 'remove') {
    let directory = path.dirname(path.join(root, relative));
    while (directory !== root) { directories.add(directory); directory = path.dirname(directory); }
  }
  for (const directory of [...directories].sort((a, b) => b.length - a.length)) {
    try { assertOrdinaryPath(directory); fs.rmdirSync(directory); } catch (error) { if (error.code !== 'ENOENT') retainedDirectories.push(directory); }
  }
  return [...new Set(retainedDirectories)];
}

/** 调用方在原流程实际完成检查后提供对应引用，不新增用户确认，也不把裁剪结果升级为 E2E 通过。 */
export function finalizeInstantiation(preparation, expectedPlanDigest, evidence) {
  const { root, current, rendered, plan } = build(preparation);
  if (expectedPlanDigest !== plan.planDigest) throw new Error('终端裁剪计划摘要不匹配，请重新预览');
  checkEvidence(evidence, plan);
  const retainedDirectories = applyOperations(root, current, rendered, plan.operations);
  return { schemaVersion: 1, status: 'terminal-pruning-complete', targetRoot: root, planDigest: plan.planDigest, removedFiles: [...rendered.removedPaths], retainedSkills: rendered.skills, retainedDirectories, evidenceReferences: evidence, initializationComplete: false, next: '回到原初始化流程复探 Git，建立唯一独立基线并核对干净状态；本 helper 不认证外部测试或 Computer Use 结果。' };
}

/** CLI 输入仅包含准备结果和原流程的真实检查引用；源 helper 在目标自身删除后仍可完成返回。 */
export function main(argv = process.argv.slice(2)) {
  const { positionals, values } = parseArgs({ args: argv, options: { 'plan-digest': { type: 'string' } }, allowPositionals: true, strict: true });
  if (positionals.length !== 1 || !['plan', 'apply'].includes(positionals[0])) throw new Error('仅支持 plan 或 apply');
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (!input || input.schemaVersion !== 1 || Object.keys(input).some(key => !['schemaVersion', 'preparation', 'evidence'].includes(key))) throw new Error('终端裁剪输入形状非法');
  return positionals[0] === 'plan' ? planFinalization(input.preparation) : finalizeInstantiation(input.preparation, values['plan-digest'], input.evidence);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.stdout.write(`${JSON.stringify(main())}\n`); }
  catch (error) { process.stderr.write(`${JSON.stringify({ status: 'error', code: 'terminal_pruning_failed', message: error.message, ...(error.recovery ? { recovery: error.recovery } : {}) })}\n`); process.exitCode = 2; }
}
