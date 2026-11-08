#!/usr/bin/env node
/** 历史入口仅向旧工程报告暂不可用，不调用预览版工具链。 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** 所有旧入口共享同一明确失败结果。 */
function unavailable() { throw new Error('NSH TUI is temporarily unavailable in the released 0.4.0 toolchain'); }

/** 旧开发命令入口拒绝 TUI。 */
export function tuiDevCommands() { return unavailable(); }
/** 旧预览版校验入口拒绝 TUI。 */
export function requirePreviewToolchain() { return unavailable(); }
/** 旧参数生成入口拒绝 TUI。 */
export function tuiCliArgs() { return unavailable(); }
/** 旧运行入口拒绝 TUI。 */
export function runNshTui() { return unavailable(); }

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { runNshTui(); }
  catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
