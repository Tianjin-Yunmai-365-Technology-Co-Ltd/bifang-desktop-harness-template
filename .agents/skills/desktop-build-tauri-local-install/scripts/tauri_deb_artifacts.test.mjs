/** 真实临时文件集合覆盖 deb 证据提交、失败隔离和有界摘要。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ordinaryDirectory, publishDebCollection, sha256File, withDebWorkspace } from './tauri_deb_artifacts.mjs';

/** 每例独立普通目录，输出保留原始源文件以核对失败不覆盖。 */
function fixture(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'tauri-deb-artifacts-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'normalized.deb');
  fs.writeFileSync(source, 'trusted-local-deb-bytes');
  return { root, source, output: path.join(root, 'artifacts'), name: 'example-v1.2.3-linux-arm64-local.deb', details: { artifactPurpose: 'local-install-test', releaseCandidate: false, signingStatus: 'unsigned' } };
}

/** 返回集合恰好三个成员且摘要/inspection一致，第二次执行保留第一套全部字节。 */
test('publishes_complete_matching_sets_without_overwriting_previous_results', t => {
  const f = fixture(t);
  const first = publishDebCollection(f.output, f.source, f.name, f.details);
  const files = fs.readdirSync(first.artifactDirectory).sort();
  assert.deepEqual(files, [f.name, `${f.name}.inspection.json`, `${f.name}.sha256`].sort());
  const before = files.map(name => fs.readFileSync(path.join(first.artifactDirectory, name)));
  assert.equal(first.sha256, sha256File(first.output));
  assert.deepEqual(JSON.parse(fs.readFileSync(`${first.output}.inspection.json`, 'utf8')), first);
  fs.writeFileSync(f.source, 'different-current-deb');
  const second = publishDebCollection(f.output, f.source, f.name, f.details);
  assert.notEqual(first.artifactDirectory, second.artifactDirectory);
  assert.deepEqual(files.map(name => fs.readFileSync(path.join(first.artifactDirectory, name))), before);
});

/** 侧车写入失败时没有可消费的新集合，也不会改变旧集合。 */
test('sidecar_write_failure_preserves_previous_set_and_removes_own_stage', t => {
  const f = fixture(t), previous = publishDebCollection(f.output, f.source, f.name, f.details);
  const existing = fs.readdirSync(f.output).sort();
  const original = fs.writeFileSync;
  t.mock.method(fs, 'writeFileSync', (file, ...args) => {
    if (typeof file === 'string' && file.endsWith('.inspection.json')) throw Object.assign(new Error('write denied'), { code: 'EACCES' });
    return original(file, ...args);
  });
  assert.throws(() => publishDebCollection(f.output, f.source, f.name, f.details), /write denied/u);
  assert.deepEqual(fs.readdirSync(f.output).sort(), existing);
  assert.equal(sha256File(previous.output), previous.sha256);
});

/** 单次集合 rename 失败不能留下半套文件，stage清理后旧证据仍匹配。 */
test('directory_commit_failure_does_not_publish_partial_files', t => {
  const f = fixture(t), previous = publishDebCollection(f.output, f.source, f.name, f.details);
  const existing = fs.readdirSync(f.output).sort();
  t.mock.method(fs, 'renameSync', () => { throw Object.assign(new Error('rename denied'), { code: 'EPERM' }); });
  assert.throws(() => publishDebCollection(f.output, f.source, f.name, f.details), /rename denied/u);
  assert.deepEqual(fs.readdirSync(f.output).sort(), existing);
  assert.equal(sha256File(previous.output), previous.sha256);
});

/** 完整集合提交后非关键 stage 清理失败仍报告已提交终态和保留路径。 */
test('post_commit_cleanup_failure_reports_committed_set_and_retained_stage', t => {
  const f = fixture(t), remove = fs.rmSync;
  const mocked = t.mock.method(fs, 'rmSync', (directory, ...args) => {
    if (typeof directory === 'string' && path.basename(directory).startsWith('.deb-artifacts-')) throw new Error('cleanup denied');
    return remove(directory, ...args);
  });
  const result = publishDebCollection(f.output, f.source, f.name, f.details);
  mocked.mock.restore();
  assert.equal(sha256File(result.output), result.sha256);
  assert.equal(result.retainedPaths.length, 1);
  assert.equal(result.cleanupWarnings.length, 1);
  assert.ok(fs.statSync(result.retainedPaths[0]).isDirectory());
  const evidence = JSON.parse(fs.readFileSync(`${result.output}.inspection.json`, 'utf8'));
  assert.equal(evidence.output, result.output);
  assert.equal(evidence.sha256, result.sha256);
});

/** 初始写入失败与清理失败并存时原错误保持可见，恢复信息列出私有 stage。 */
test('cleanup_failure_does_not_replace_original_publication_error', t => {
  const f = fixture(t), write = fs.writeFileSync, remove = fs.rmSync;
  const mockedWrite = t.mock.method(fs, 'writeFileSync', (file, ...args) => {
    if (typeof file === 'string' && file.endsWith('.inspection.json')) throw new Error('original sidecar failure');
    return write(file, ...args);
  });
  const mockedRemove = t.mock.method(fs, 'rmSync', (directory, ...args) => {
    if (typeof directory === 'string' && path.basename(directory).startsWith('.deb-artifacts-')) throw new Error('cleanup failure');
    return remove(directory, ...args);
  });
  assert.throws(() => publishDebCollection(f.output, f.source, f.name, f.details), error => {
    assert.match(error.message, /original sidecar failure/u);
    assert.equal(error.recovery.committed, false);
    assert.equal(error.recovery.retainedPaths.length, 1);
    return true;
  });
  mockedWrite.mock.restore(); mockedRemove.mock.restore();
});

/** 外层解包目录清理失败既不掩盖已提交集合，也不替换先前命令错误。 */
test('workspace_cleanup_reports_preserved_state_without_masking_operation_result', async t => {
  const f = fixture(t), remove = fs.rmSync;
  const mocked = t.mock.method(fs, 'rmSync', (directory, ...args) => {
    if (typeof directory === 'string' && path.basename(directory).startsWith('.deb-normalize-')) throw new Error('workspace cleanup denied');
    return remove(directory, ...args);
  });
  const result = await withDebWorkspace(f.output, async () => publishDebCollection(f.output, f.source, f.name, f.details));
  assert.equal(sha256File(result.output), result.sha256);
  assert.equal(result.retainedPaths.length, 1);
  assert.equal(result.cleanupWarnings.length, 1);
  await assert.rejects(withDebWorkspace(f.output, async () => { throw new Error('original dpkg failure'); }), error => {
    assert.equal(error.message, 'original dpkg failure');
    assert.equal(error.recovery.retainedPaths.length, 1);
    return true;
  });
  mocked.mock.restore();
});

/** 输出路径祖先有链接时拒绝，不能先 mkdir 穿过链接再报告错误。 */
test('output_symlink_ancestor_is_rejected_before_creating_children', t => {
  const f = fixture(t), outside = path.join(f.root, 'outside'); fs.mkdirSync(outside);
  const link = path.join(f.root, 'linked');
  try { fs.symlinkSync(outside, link, 'dir'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip(`symlink unavailable: ${error.code}`); return; } throw error; }
  assert.throws(() => publishDebCollection(path.join(link, 'new'), f.source, f.name, f.details), /ordinary path/u);
  assert.deepEqual(fs.readdirSync(outside), []);
});

/** 流式 hash 跨多个缓冲块正确，读取异常时 fd 必须关闭。 */
test('hash_streams_large_files_and_closes_descriptor_on_failure', t => {
  const f = fixture(t), bytes = Buffer.alloc(3 * 1024 * 1024 + 19, 0x5a); fs.writeFileSync(f.source, bytes);
  assert.equal(sha256File(f.source), createHash('sha256').update(bytes).digest('hex'));
  const close = fs.closeSync; let closed = 0;
  t.mock.method(fs, 'closeSync', fd => { closed += 1; return close(fd); });
  t.mock.method(fs, 'readSync', () => { throw new Error('read failed'); });
  assert.throws(() => sha256File(f.source), /read failed/u);
  assert.equal(closed, 1);
});

/** 普通目录与相对文件名约束避免调用者把提交写到计划外位置。 */
test('rejects_invalid_artifact_names_and_non_directory_ancestors', t => {
  const f = fixture(t);
  for (const name of ['../escape.deb', '/absolute.deb', 'bad_name.deb', '']) assert.throws(() => publishDebCollection(f.output, f.source, name, f.details), /filename/u);
  assert.throws(() => ordinaryDirectory(path.join(f.source, 'child'), true), /ordinary path/u);
});
