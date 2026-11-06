/** Windows 开发进程由独立 Job supervisor 持有所有权，主进程退出不丢弃后代。 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';

const SUPERVISOR = fileURLToPath(new URL('../assets/windows_job_supervisor.ps1', import.meta.url));
const MAX_FRAME_BYTES = 64 * 1024;
const MAX_REQUEST_BYTES = 1024 * 1024;

/** 在启动监督器之前验证所有缓冲/截止参数；非法选项不创建悬挂的 stdin 读取进程。 */
export function validateWindowsJobOptions({ startupMs = 45_000, stopMs = 10_000, maxStdoutBytes = Infinity, maxLineBytes = Infinity } = {}) {
  for (const value of [startupMs, stopMs]) if (!Number.isInteger(value) || value <= 0 || value > 2_147_483_647) throw new Error('Windows Job deadlines must be positive timer integers');
  for (const value of [maxStdoutBytes, maxLineBytes]) if (value !== Infinity && (!Number.isSafeInteger(value) || value <= 0)) throw new Error('Windows Job output limits must be positive byte integers');
  return { startupMs, stopMs, maxStdoutBytes, maxLineBytes };
}

/** 按 Windows CRT argv 规则引用一个参数；不调用 Shell，也不展开元字符。 */
export function quoteWindowsArgument(value) {
  if (typeof value !== 'string' || value.includes('\0')) throw new Error('Windows arguments must be strings without NUL');
  let quoted = '"', slashes = 0;
  for (const character of value) {
    if (character === '\\') { slashes += 1; continue; }
    quoted += '\\'.repeat(character === '"' ? slashes * 2 + 1 : slashes) + character;
    slashes = 0;
  }
  return quoted + '\\'.repeat(slashes * 2) + '"';
}

/** 显式 exe 与参数独立引用，拒绝超过 CreateProcessW UTF-16 上限的命令行。 */
export function windowsCommandLine(executable, args) {
  if (!Array.isArray(args)) throw new Error('Windows arguments must be an array');
  const line = [executable, ...args].map(quoteWindowsArgument).join(' ');
  if (line.length > 32_766) throw new Error('Windows command line exceeds CreateProcessW limit');
  return line;
}

/** 只解析原生 exe；Cargo 通过 PATH 查找，不回退 cmd、脚本宿主或当前目录。 */
function resolveExecutable(command, environment) {
  const candidates = path.win32.isAbsolute(command)
    ? [command]
    : /[\\/]/u.test(command) ? [] : String(environment.PATH ?? environment.Path ?? '').split(';')
      .filter(directory => path.win32.isAbsolute(directory))
      .map(directory => path.win32.join(directory, command.toLowerCase().endsWith('.exe') ? command : command + '.exe'));
  for (const file of candidates) {
    try { if (fs.statSync(file).isFile() && file.toLowerCase().endsWith('.exe')) return fs.realpathSync(file); }
    catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error; }
  }
  throw new Error('Could not resolve the selected Windows executable');
}

/** 控制事件严格限定键和顺序，产品字节只通过有界 base64 帧传输。 */
function exactKeys(frame, names) {
  if (!frame || typeof frame !== 'object' || Array.isArray(frame)
      || Object.keys(frame).sort().join(',') !== [...names].sort().join(',')) throw new Error('Invalid Windows Job supervisor frame');
}

/** 为已启动的专用 supervisor 建立协议；调用方保有输入验证失败前的 child 所有权，生产入口先验证再启动。 */
export function connectWindowsJob(supervisor, request, {
  startupMs = 45_000, stopMs = 10_000, maxStdoutBytes = Infinity, maxLineBytes = Infinity,
} = {}) {
  const encoded = JSON.stringify(request) + '\n';
  if (Buffer.byteLength(encoded) > MAX_REQUEST_BYTES) throw new Error('Windows Job request exceeds 1 MiB');
  validateWindowsJobOptions({ startupMs, stopMs, maxStdoutBytes, maxLineBytes });
  const stdout = new PassThrough({ highWaterMark: 16 * 1024 });
  const stderr = new PassThrough({ highWaterMark: 16 * 1024 });
  const parsingController = new AbortController();
  // 协议错误由 done 传播；流销毁不能另造无人接收的 error 事件。
  stdout.on('error', () => {}); stderr.on('error', () => {});
  let resolveReady, rejectReady, resolveLeader, rejectLeader, resolveDone, rejectDone;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const leader = new Promise((resolve, reject) => { resolveLeader = resolve; rejectLeader = reject; });
  const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  ready.catch(() => {}); leader.catch(() => {}); done.catch(() => {});
  let started = false, leaderResult = null, empty = false, failure = null, closed = false;
  let stopping = false, stopTimer = null, exitTimer = null, stdoutBytes = 0, lineBytes = 0, diagnosticsBytes = 0;
  const startupTimer = setTimeout(() => fail(new Error('Windows Job supervisor startup timed out')), startupMs);

  /** 控制 EOF 与 stop 使用同一条路径；截止时只杀本次 supervisor，Job 最后句柄关闭负责兜底。 */
  function requestStop() {
    if (stopping || closed) return;
    stopping = true;
    clearTimeout(startupTimer);
    supervisor.stdin.end('stop\n');
    stopTimer = setTimeout(() => {
      failure ??= new Error('Windows Job cleanup remains unverified after timeout');
      parsingController.abort(failure);
      supervisor.kill();
      stdout.destroy(failure); stderr.destroy(failure);
      supervisor.stdout.destroy();
      rejectReady(failure); rejectLeader(failure); rejectDone(failure);
    }, stopMs);
  }

  /** 不把协议、API 或输出错误当作清理成功；保留首个失败并请求 owned Job 收尾。 */
  function fail(error) {
    failure ??= error;
    parsingController.abort(failure);
    rejectReady(failure);
    if (!leaderResult) rejectLeader(failure);
    requestStop();
  }

  /** 按流背压排空，任何一行或累计 metadata 超限都终止同一 owned Job。 */
  async function output(frame) {
    exactKeys(frame, ['type', 'stream', 'data']);
    if (!started || empty || !['stdout', 'stderr'].includes(frame.stream) || typeof frame.data !== 'string') throw new Error('Invalid Windows Job output frame');
    const bytes = Buffer.from(frame.data, 'base64');
    if (bytes.length > 4096 || bytes.toString('base64') !== frame.data) throw new Error('Invalid Windows Job output encoding');
    if (frame.stream === 'stdout') {
      stdoutBytes += bytes.length;
      if (stdoutBytes > maxStdoutBytes) throw new Error('Cargo metadata exceeds 16 MiB');
      for (const byte of bytes) {
        lineBytes = byte === 10 ? 0 : lineBytes + 1;
        if (lineBytes > maxLineBytes) throw new Error('Cargo output line exceeds 16 MiB');
      }
    }
    const stream = frame.stream === 'stdout' ? stdout : stderr;
    if (!stream.write(bytes)) await waitForDrain(stream, parsingController.signal);
  }

  /** leader 退出只完成 leader Promise；只有 Job empty 与 supervisor 正常退出共同完成 done。 */
  async function event(frame) {
    if (failure) return;
    if (frame?.type === 'output') return output(frame);
    if (frame?.type === 'ready') {
      exactKeys(frame, ['type', 'pid']);
      if (started || !Number.isInteger(frame.pid) || frame.pid < 1 || frame.pid > 0xffff_ffff) throw new Error('Invalid Windows Job ready event');
      started = true; clearTimeout(startupTimer); resolveReady({ pid: frame.pid });
    } else if (frame?.type === 'leader-exited') {
      exactKeys(frame, ['type', 'code']);
      if (!started || leaderResult || !Number.isInteger(frame.code) || frame.code < 0 || frame.code > 0xffff_ffff) throw new Error('Invalid Windows Job leader exit event');
      leaderResult = { code: frame.code, signal: null }; resolveLeader(leaderResult);
    } else if (frame?.type === 'job-empty') {
      exactKeys(frame, ['type']);
      if (!leaderResult || empty) throw new Error('Invalid Windows Job empty event');
      empty = true;
    } else if (frame?.type === 'error') {
      exactKeys(frame, ['type', 'stage', 'win32']);
      if (typeof frame.stage !== 'string' || !/^[a-z-]{1,64}$/u.test(frame.stage) || !Number.isInteger(frame.win32) || frame.win32 < 0) throw new Error('Invalid Windows Job error event');
      throw new Error('Windows Job supervisor failed at ' + frame.stage + ' (Win32 ' + frame.win32 + ')');
    } else throw new Error('Unknown Windows Job supervisor event');
  }

  /** 异步逐帧消费保留背压；尾帧、巨型帧或协议混流均失败关闭。 */
  async function readFrames() {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let partial = '';
    for await (const chunk of supervisor.stdout) {
      partial += decoder.decode(chunk, { stream: true });
      let newline;
      while ((newline = partial.indexOf('\n')) !== -1) {
        const line = partial.slice(0, newline); partial = partial.slice(newline + 1);
        if (Buffer.byteLength(line) > MAX_FRAME_BYTES) throw new Error('Windows Job protocol frame exceeds 64 KiB');
        await event(JSON.parse(line));
      }
      if (Buffer.byteLength(partial) > MAX_FRAME_BYTES) throw new Error('Windows Job protocol frame exceeds 64 KiB');
    }
    partial += decoder.decode();
    if (partial) throw new Error('Windows Job protocol ended with a partial frame');
  }

  const parsing = readFrames().catch(error => { fail(error); });
  supervisor.stdin.on('error', error => { if (!closed) fail(new Error('Windows Job control pipe failed', { cause: error })); });
  supervisor.stderr.on('data', chunk => {
    diagnosticsBytes += chunk.length;
    if (diagnosticsBytes > 64 * 1024) fail(new Error('Windows Job supervisor diagnostics exceed 64 KiB'));
  });
  supervisor.once('error', error => { fail(new Error('Could not start Windows Job supervisor', { cause: error })); });
  supervisor.once('exit', () => {
    // ChildProcess.close 等待读取管道，不能用它启动背压截止；exit 不受输出消费状态影响。
    exitTimer = setTimeout(() => fail(new Error('Windows Job output drain remains unverified after supervisor exit')), stopMs);
  });
  supervisor.once('close', async (code, signal) => {
    await parsing;
    clearTimeout(exitTimer);
    closed = true; clearTimeout(startupTimer); clearTimeout(stopTimer);
    stdout.end(); stderr.end();
    if (!failure && (!started || !leaderResult || !empty || code !== 0 || signal)) failure = new Error('Windows Job supervisor exited without confirming complete cleanup');
    if (failure) { rejectReady(failure); rejectLeader(failure); rejectDone(failure); }
    else resolveDone(leaderResult);
  });
  supervisor.stdin.write(encoded);
  return { supervisor, ready, leader, done, stdout, stderr, stop: () => { requestStop(); return done; } };
}

/** 流关闭、协议失败与清理截止都会结束背压等待，不遗留永远等不到的 drain Promise。 */
function waitForDrain(stream, signal) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      stream.off('drain', drain); stream.off('error', failed); stream.off('close', closed);
      signal.removeEventListener('abort', aborted);
    };
    const drain = () => { cleanup(); resolve(); };
    const failed = error => { cleanup(); reject(error); };
    const closed = () => failed(new Error('Windows Job output stream closed before drain'));
    const aborted = () => failed(signal.reason ?? new Error('Windows Job output cancelled'));
    stream.once('drain', drain); stream.once('error', failed); stream.once('close', closed);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted();
    else if (stream.destroyed) closed();
  });
}

/** 仅 Windows 原生宿主启动固定桥接文件；不修改执行策略或安装额外运行时。 */
export function startWindowsJob(command, args, { cwd, keepDescendants = false, ...limits } = {}) {
  const validatedLimits = validateWindowsJobOptions(limits);
  if (typeof keepDescendants !== 'boolean') throw new Error('Windows Job keepDescendants must be boolean');
  if (process.platform !== 'win32') throw new Error('Windows native Job host required');
  const environment = process.env;
  const systemRoot = environment.SystemRoot;
  if (!systemRoot || !path.win32.isAbsolute(systemRoot)) throw new Error('Windows SystemRoot is unavailable');
  const executable = resolveExecutable(command, environment);
  const request = { schemaVersion: 1, executable, commandLine: windowsCommandLine(executable, args), cwd: fs.realpathSync(cwd), keepDescendants };
  if (Buffer.byteLength(JSON.stringify(request) + '\n') > MAX_REQUEST_BYTES) throw new Error('Windows Job request exceeds 1 MiB');
  const powershell = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const supervisor = spawn(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', SUPERVISOR], {
    cwd, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  try { return connectWindowsJob(supervisor, request, validatedLimits); }
  catch (error) { supervisor.stdin.destroy(); supervisor.kill(); throw error; }
}
