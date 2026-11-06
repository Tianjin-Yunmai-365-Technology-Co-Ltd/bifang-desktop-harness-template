/** Linux deb 工具的有界 POSIX 进程组执行器；只回收本次启动的组，不按名称扫描进程。 */
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

/** 等待条件成立至固定截止；超时和权限未知都不能被解释为回收成功。 */
async function waitFor(check, timeoutMs) {
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    if (check()) return;
    if (performance.now() >= deadline) throw new Error('owned deb process cleanup remains unverified');
    await delay(10);
  }
}

/** 为固定 argv 启动独立组，限制累计输出和运行时间；失败后确认整组与标准流收尾。 */
export async function runOwnedCommand(command, args, {
  cwd, timeoutMs = 5 * 60_000, maxOutputBytes = 16 * 1024 * 1024, signal = null,
} = {}) {
  if (process.platform === 'win32') throw new Error('POSIX native process group required');
  if (typeof command !== 'string' || !command || command.includes('\0') || !Array.isArray(args)
      || args.some(arg => typeof arg !== 'string' || arg.includes('\0'))) throw new Error('command and argv must be explicit strings');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || !Number.isSafeInteger(maxOutputBytes) || maxOutputBytes <= 0) throw new Error('positive process budgets required');
  if (signal?.aborted) throw new Error('deb command cancelled before launch');
  const child = spawn(command, args, { cwd, shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let failure = null, groupGone = false, identityUncertain = false, closed = false, outputBytes = 0;
  let resolveClose, resolveFailure;
  const closeResult = new Promise(resolve => { resolveClose = resolve; });
  const failed = new Promise(resolve => { resolveFailure = resolve; });
  const stdout = [], stderr = [];

  /** 首次错误固定为本次失败原因，后续事件只继续排空，不无限保留输出。 */
  function fail(error) {
    if (!failure) { failure = error; resolveFailure(); }
  }

  /** ESRCH 一旦确认就不再向相同数字 PGID 发信号；其它错误保持未知。 */
  function observeGroup() {
    if (groupGone || !child.pid) return 'gone';
    try { process.kill(-child.pid, 0); return identityUncertain ? 'unknown' : 'present'; }
    catch (error) {
      if (error.code === 'ESRCH') { groupGone = true; return 'gone'; }
      identityUncertain = true;
      return 'unknown';
    }
  }

  /** 仅向本次仍可观察的组发信号，拒绝对未知或已消失的身份扩大终止范围。 */
  function signalGroup(value) {
    const state = observeGroup();
    if (state === 'gone') return;
    if (state !== 'present') throw new Error('owned deb group identity is uncertain');
    try { process.kill(-child.pid, value); }
    catch (error) { if (error.code === 'ESRCH') groupGone = true; else throw error; }
  }

  /** 直接子进程退出不能替代后代回收，TERM 后有界升级 KILL 并等待关闭。 */
  async function cleanup() {
    try {
      if (observeGroup() === 'unknown') {
        // 未知身份只等待明确 ESRCH，不因同数字 PGID 再出现恢复信号发送资格。
        await waitFor(() => observeGroup() === 'gone', 2500);
      } else {
        signalGroup('SIGTERM');
        const grace = performance.now() + 250;
        while (observeGroup() !== 'gone' && performance.now() < grace) await delay(10);
        if (observeGroup() === 'present') signalGroup('SIGKILL');
        await waitFor(() => observeGroup() === 'gone', 2500);
      }
      await waitFor(() => closed, 2500);
    } finally {
      // API/权限失败也不能让本地 pipe 或 child 引用无限保持 CLI 存活；这不表示后代已回收。
      child.stdout.destroy(); child.stderr.destroy(); child.unref();
    }
  }

  /** 两条标准流从启动起并发排空，共享累计字节预算，溢出不继续积累 Buffer。 */
  function capture(chunks, chunk) {
    outputBytes += chunk.length;
    if (outputBytes > maxOutputBytes) { fail(new Error('deb command output budget exceeded')); return; }
    if (!failure) chunks.push(chunk);
  }
  child.stdout.on('data', chunk => capture(stdout, chunk));
  child.stderr.on('data', chunk => capture(stderr, chunk));
  child.stdout.on('error', error => fail(new Error('deb stdout failed', { cause: error })));
  child.stderr.on('error', error => fail(new Error('deb stderr failed', { cause: error })));
  child.once('error', error => fail(new Error('could not start deb command', { cause: error })));
  child.once('close', (code, killedBy) => { closed = true; resolveClose({ code, signal: killedBy }); });
  const abort = () => fail(new Error('deb command cancelled'));
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(() => fail(new Error('deb command timed out')), timeoutMs);
  try {
    const result = await Promise.race([closeResult, failed.then(() => null)]);
    if (!failure && result?.code !== 0) fail(new Error(`deb command failed (${result?.code ?? result?.signal ?? 'unknown'})`));
    if (!failure) {
      const state = observeGroup();
      if (state === 'present') fail(new Error('deb command exited with live owned descendants'));
      else if (state === 'unknown') fail(new Error('owned deb process group state is unknown'));
    }
    if (failure) {
      try { await cleanup(); }
      catch (error) { throw new Error(`${failure.message}; owned deb process cleanup remains unverified (PID ${child.pid ?? 'unassigned'})`, { cause: error }); }
      throw failure;
    }
    return { stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'), code: 0 };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
