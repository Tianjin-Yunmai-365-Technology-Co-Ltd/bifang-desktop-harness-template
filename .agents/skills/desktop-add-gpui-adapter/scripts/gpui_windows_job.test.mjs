/** 协议使用真实 Node 子进程验证；Win32 所有权只在 Windows 原生用例中取证。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { quoteWindowsArgument, windowsCommandLine, connectWindowsJob, startWindowsJob } from './gpui_windows_job.mjs';

/** 专用假 supervisor 只用于协议故障，不执行 Windows API 或冒充原生清理证据。 */
function protocol(script, limits = {}) {
  const source = `const rl=require('node:readline').createInterface({input:process.stdin}); const send=x=>process.stdout.write(JSON.stringify(x)+'\\n'); let request=false; rl.on('line',line=>{if(!request){request=true; ${script}}});`;
  const child = spawn(process.execPath, ['-e', source], { stdio: ['pipe', 'pipe', 'pipe'] });
  return connectWindowsJob(child, { schemaVersion: 1 }, { startupMs: 1000, stopMs: 250, ...limits });
}

/** 空参数、引号、尾反斜杠和 Shell 字符均按 CRT 数据引用，不作命令解释。 */
test('quotes_windows_arguments_without_rescanning_shell_characters', () => {
  assert.equal(quoteWindowsArgument(''), '""');
  assert.equal(quoteWindowsArgument('中文 $(safe) & spaces'), '"中文 $(safe) & spaces"');
  assert.equal(quoteWindowsArgument('a"b'), '"a\\"b"');
  assert.equal(quoteWindowsArgument('end\\'), '"end\\\\"');
  assert.equal(windowsCommandLine('C:\\Program Files\\app.exe', ['', 'x']), '"C:\\Program Files\\app.exe" "" "x"');
  assert.throws(() => quoteWindowsArgument('\0'), /NUL/u);
  assert.throws(() => windowsCommandLine('a.exe', ['x'.repeat(32767)]), /limit/u);
});

/** 非法截止/预算在平台探测和 spawn 之前拒绝，不能留下一直等 stdin 的监督器。 */
test('invalid_limits_never_start_a_supervisor', t => {
  let launches = 0;
  t.mock.method(childProcess, 'spawn', () => { launches += 1; throw new Error('unexpected spawn'); });
  syncBuiltinESMExports();
  try {
    for (const limits of [{ stopMs: 0 }, { startupMs: Infinity }, { stopMs: 2 ** 31 }, { maxLineBytes: '10' }, { maxStdoutBytes: -1 }]) {
      assert.throws(() => startWindowsJob('cargo', [], { cwd: os.tmpdir(), ...limits }), /Windows Job (?:deadlines|output limits)/u);
    }
    assert.equal(launches, 0);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
});

/** leader 完成后 Job 仍未清空，重复 stop 共用同一清理结果。 */
test('leader_exit_preserves_job_until_explicit_empty_and_output_is_complete', { timeout: 5000 }, async () => {
  const job = protocol(`send({type:'ready',pid:123}); send({type:'output',stream:'stdout',data:Buffer.from('中文\\n').toString('base64')}); send({type:'leader-exited',code:0}); rl.on('line',()=>{send({type:'job-empty'}); process.exit(0);});`);
  let output = ''; job.stdout.setEncoding('utf8'); job.stdout.on('data', chunk => { output += chunk; }); job.stderr.resume();
  await job.ready; assert.equal((await job.leader).code, 0);
  let done = false; job.done.then(() => { done = true; });
  await delay(30); assert.equal(done, false);
  const first = job.stop(); assert.equal(job.stop(), first);
  await first; assert.equal(output, '中文\n');
});

/** 只有 leader-exit、缺 empty 或错误顺序都不能被当作完整清理。 */
test('protocol_rejects_missing_empty_invalid_order_and_partial_frames', { timeout: 5000 }, async () => {
  for (const script of [
    `send({type:'ready',pid:1});send({type:'leader-exited',code:0});process.exit(0);`,
    `send({type:'job-empty'});process.exit(0);`,
    `process.stdout.write('{');process.exit(0);`,
    `send({type:'ready',pid:1});send({type:'ready',pid:2});process.exit(0);`,
    `send({type:'ready',pid:1});send({type:'output',stream:'stdout',data:'***'});process.exit(0);`,
  ]) {
    const job = protocol(script); job.stdout.resume(); job.stderr.resume();
    await assert.rejects(job.done, /Windows Job|JSON/u);
  }
});

/** 未就绪时取消、控制 EOF 和监督器死亡均有界失败，不伪造原生清理结果。 */
test('startup_cancellation_and_unexpected_supervisor_exit_are_bounded', { timeout: 5000 }, async () => {
  const job = protocol('setInterval(()=>{},1000);', { startupMs: 100, stopMs: 100 });
  job.stdout.resume(); job.stderr.resume();
  const result = job.stop();
  await assert.rejects(result, /cleanup remains unverified/u);
  const dying = protocol('process.exit(3);'); dying.stdout.resume(); dying.stderr.resume();
  await assert.rejects(dying.done, /without confirming/u);
});

/** 无消费者导致背压时仍可取消；关闭事件不会永久等待 drain。 */
test('blocked_output_is_cancelled_when_supervisor_closes_or_stop_times_out', { timeout: 5000 }, async () => {
  for (const closeAfter of [false, true]) {
    const job = protocol(`send({type:'ready',pid:1}); for(let n=0;n<64;n++)send({type:'output',stream:'stdout',data:Buffer.alloc(4096,65).toString('base64')}); ${closeAfter ? "send({type:'leader-exited',code:0});send({type:'job-empty'});process.exit(0);" : 'setInterval(()=>{},1000);'}`, { stopMs: 100 });
    await job.ready;
    await delay(30);
    await assert.rejects(closeAfter ? job.done : job.stop(), /unverified/u);
  }
});

/** metadata 和单行上限触发相同 owned 清理，不无限保留输出。 */
test('metadata_and_line_limits_reject_overflow', { timeout: 5000 }, async () => {
  for (const limits of [{ maxStdoutBytes: 10 }, { maxLineBytes: 10 }]) {
    const job = protocol(`send({type:'ready',pid:1});send({type:'output',stream:'stdout',data:Buffer.alloc(100,65).toString('base64')});rl.on('line',()=>process.exit(0));`, limits);
    job.stdout.resume(); job.stderr.resume();
    await assert.rejects(job.done, /exceeds 16 MiB/u);
  }
});

/** 有界等待真实子进程状态；失败不把 PID 不可观察误报已回收。 */
async function until(check) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) { if (check()) return; await delay(20); }
  assert.fail('native process condition timed out');
}

/** 只检查本测试实际创建的进程，权限错误不等同不存在。 */
function alive(pid) {
  try { process.kill(Number(pid), 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}

/** Windows 原生调用证明 Unicode argv、空值和元字符穿过固定 PowerShell 桥接后字节一致。 */
test('native_windows_job_preserves_argv_and_drains_both_streams', { timeout: 60_000, skip: process.platform !== 'win32' && 'Windows native Job API required' }, async () => {
  const args = ['', '中文 spaces', 'a"b', 'trail\\', 'literal $(safe) &'];
  const job = startWindowsJob(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)));process.stderr.write("diagnostic");', ...args], { cwd: os.tmpdir() });
  let output = '', diagnostic = ''; job.stdout.on('data', value => { output += value; }); job.stderr.on('data', value => { diagnostic += value; });
  assert.equal((await job.done).code, 0);
  assert.deepEqual(JSON.parse(output), args); assert.equal(diagnostic, 'diagnostic');
});

/** leader 主动结束且后代关闭标准流后仍属于 Job；无关进程不受 stop 影响。 */
test('native_windows_job_reaps_descendants_after_leader_exit_without_touching_sentinel', { timeout: 60_000, skip: process.platform !== 'win32' && 'Windows native Job API required' }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'job-native-'));
  const pidFile = path.join(root, 'worker.pid');
  const sentinel = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  let job;
  try {
    const worker = `require('node:fs').writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000);`;
    const leader = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(worker)},process.argv[1]],{stdio:'ignore'}).unref();`;
    job = startWindowsJob(process.execPath, ['-e', leader, pidFile], { cwd: root, keepDescendants: true });
    job.stdout.resume(); job.stderr.resume(); await job.leader;
    await until(() => fs.existsSync(pidFile)); const pid = fs.readFileSync(pidFile, 'utf8'); assert.equal(alive(pid), true);
    await job.stop(); await until(() => !alive(pid)); assert.equal(alive(sentinel.pid), true);
  } finally {
    try { await job?.stop(); }
    finally {
      const sentinelDone = new Promise(resolve => sentinel.once('close', resolve)); sentinel.kill(); await sentinelDone;
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

/** 控制 EOF 与监督器异常终止都回收同一 Job；异常退出仍不能冒充协议确认通过。 */
test('native_windows_control_eof_and_supervisor_death_release_owned_descendants', { timeout: 60_000, skip: process.platform !== 'win32' && 'Windows native Job API required' }, async () => {
  for (const abrupt of [false, true]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'job-eof-'));
    const pidFile = path.join(root, 'worker.pid');
    let job;
    try {
      const code = `require('node:fs').writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000);`;
      job = startWindowsJob(process.execPath, ['-e', code, pidFile], { cwd: root, keepDescendants: true });
      job.stdout.resume(); job.stderr.resume(); await job.ready;
      await until(() => fs.existsSync(pidFile)); const pid = fs.readFileSync(pidFile, 'utf8');
      if (abrupt) { job.supervisor.kill(); await assert.rejects(job.done, /without confirming/u); }
      else { job.supervisor.stdin.end(); await job.done; }
      await until(() => !alive(pid));
    } finally {
      try { await job?.stop(); } catch { /* 原始异常已断言；Job 原生回收由上面的真实进程探测证明。 */ }
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});
