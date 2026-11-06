/** 使用真实 Node 子进程覆盖有界执行和 POSIX 后代回收，不代替 Linux dpkg 或桌面验证。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { runOwnedCommand } from './tauri_deb_process.mjs';

const posix = { skip: process.platform === 'win32', timeout: 15_000 };

/** 正常 argv 保留空白与 Shell 元字符，标准流均实际捕获。 */
test('owned_command_preserves_arguments_and_captures_both_streams', posix, async () => {
  const args = ['中文 空格', '', '$(never-execute)&'];
  const result = await runOwnedCommand(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)));process.stderr.write("diagnostic")', ...args]);
  assert.deepEqual(JSON.parse(result.stdout), args);
  assert.equal(result.stderr, 'diagnostic');
});

/** 非零退出、缺失程序、输出溢出和已取消请求都不能返回成功。 */
test('owned_command_rejects_failure_overflow_missing_and_cancelled', posix, async () => {
  await assert.rejects(runOwnedCommand(process.execPath, ['-e', 'process.exit(7)']), /failed \(7\)/u);
  await assert.rejects(runOwnedCommand('/nonexistent/tauri-deb-program', []), /could not start/u);
  await assert.rejects(runOwnedCommand(process.execPath, ['-e', 'process.stdout.write("a".repeat(65536));setInterval(()=>{},1000)'], { maxOutputBytes: 1024 }), /output budget/u);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runOwnedCommand(process.execPath, ['-e', 'throw Error("must not run")'], { signal: controller.signal }), /cancelled before launch/u);
});

/** 不通过 PID 探测确认后代退出，而等待它持有的管道关闭，避免僵尸进程误判。 */
function workerProgram() {
  return 'process.on("SIGTERM",()=>{});process.stdout.write("ready\\n");setInterval(()=>{},1000)';
}

/** 超时在主进程仍活时回收同组后代，单独哨兵保持存活。 */
test('owned_command_timeout_reaps_descendants_without_killing_unrelated_sentinel', posix, async t => {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'tauri-deb-process-'));
  const sentinel = spawn(process.execPath, ['-e', 'process.stdout.write("ready\\n");setInterval(()=>{},1000)'], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { sentinel.kill('SIGKILL'); await once(sentinel, 'close'); fs.rmSync(directory, { recursive: true, force: true }); });
  await once(sentinel.stdout, 'data');
  const marker = path.join(directory, 'worker-closed');
  const launcher = `const fs=require('node:fs');const child=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(workerProgram())}],{stdio:['ignore','pipe','ignore']});child.stdout.on('data',()=>fs.writeFileSync(${JSON.stringify(marker)},'ready'));child.on('close',()=>fs.writeFileSync(${JSON.stringify(marker)},'closed'));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`;
  const start = performance.now();
  await assert.rejects(runOwnedCommand(process.execPath, ['-e', launcher], { timeoutMs: 500 }), /timed out/u);
  assert.ok(performance.now() - start < 7000);
  assert.equal(sentinel.exitCode, null);
  assert.equal(fs.readFileSync(marker, 'utf8'), 'ready');
});

/** leader 提前退出且后代不持有标准流时，组仍存在必须收尾而不是直接成功。 */
test('owned_command_detects_live_descendants_after_leader_exit', posix, async () => {
  const launcher = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(workerProgram())}],{stdio:'ignore'}).unref();`;
  await assert.rejects(runOwnedCommand(process.execPath, ['-e', launcher], { timeoutMs: 2000 }), /live owned descendants/u);
});

/** 编译或打包中取消走同一 owned 组停止路径，而不是只停止 leader。 */
test('owned_command_abort_during_execution_is_bounded', posix, async () => {
  const controller = new AbortController();
  const pending = runOwnedCommand(process.execPath, ['-e', 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'], { signal: controller.signal });
  const timer = setTimeout(() => controller.abort(), 100);
  try { await assert.rejects(pending, /cancelled/u); } finally { clearTimeout(timer); }
});

/** leader 退出后一次权限未知使身份失效，随后 present 也不恢复向数字 PGID 发信号资格。 */
test('unknown_then_present_group_never_restores_signal_authority_or_hangs', posix, async t => {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'tauri-deb-unknown-'));
  const marker = path.join(directory, 'leader.pid');
  const originalKill = process.kill;
  let observations = 0, signals = 0;
  const mocked = t.mock.method(process, 'kill', (pid, signal) => {
    if (pid < 0) {
      if (signal !== 0) { signals += 1; throw new Error('must not signal unknown group'); }
      if (++observations === 1) throw Object.assign(new Error('permission denied'), { code: 'EPERM' });
      return true;
    }
    return originalKill(pid, signal);
  });
  const launcher = `require('node:fs').writeFileSync(${JSON.stringify(marker)},String(process.pid));require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}).unref();`;
  const started = performance.now();
  try {
    await assert.rejects(runOwnedCommand(process.execPath, ['-e', launcher]), /cleanup remains unverified \(PID [0-9]+\)/u);
    assert.ok(performance.now() - started < 6000);
    assert.ok(observations > 1); assert.equal(signals, 0);
  } finally {
    mocked.mock.restore();
    if (fs.existsSync(marker)) {
      const pid = Number(fs.readFileSync(marker, 'utf8'));
      try { originalKill(-pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
