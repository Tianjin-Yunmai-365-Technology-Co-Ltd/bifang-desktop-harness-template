#!/usr/bin/env node
/** 确认后准备受管工程层；不创建 Rust 产品、Git、发布事实或任何验收结论。 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { evaluateInitializationForm } from './initialization_form.mjs';
import { resolveProjectTarget } from './resolve_project_target.mjs';
import { assertOrdinaryPath, readRegular, renderPreparedFiles, sha256, snapshotSource } from './instantiation_files.mjs';
import { installExclusive } from './instantiation_io.mjs';

/** 确认日期是本次实际收齐的日历日期；调用方不能附带其它自由配置。 */
function validateInput(input) {
  if (!input || input.schemaVersion !== 1 || !input.form || Object.keys(input).some(key => !['schemaVersion', 'form', 'confirmedAt'].includes(key))) throw new Error('实例化输入形状非法');
  const date = input.confirmedAt;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('须提供真实确认日期 confirmedAt');
  const evaluated = evaluateInitializationForm(input.form);
  if (input.form.entry !== 'instantiate' || evaluated.stage !== 'confirmed') throw new Error('必须先取得当前完整实例化汇总的真实用户确认');
  assertOrdinaryPath(evaluated.summary.target.projectPathInput, true);
  assertOrdinaryPath(evaluated.summary.target.targetRoot, true);
  return evaluated;
}

/** 重新核对确认、唯一目标、源快照和渲染结果，形成只读清单。 */
function build(input) {
  const evaluated = validateInput(input);
  const { values, target } = evaluated.summary;
  const source = snapshotSource(input.form.harnessRoot);
  const files = renderPreparedFiles(source, values, input.form.confirmation.source, input.confirmedAt);
  const manifest = [...files].map(([relative, file]) => ({ path: relative, sha256: sha256(file.bytes), mode: file.mode }));
  const body = { schemaVersion: 1, operation: 'engineering-copy', sourceRoot: source.root, sourceDigest: source.digest, summaryDigest: evaluated.summaryDigest, targetRoot: target.targetRoot, confirmedAt: input.confirmedAt, values, files: manifest };
  return { plan: { ...body, planDigest: sha256(JSON.stringify(body)) }, source, files };
}

/** 只输出待安装文件摘要，不创建目标或保存表单会话。 */
export function planInstantiation(input) { return build(input).plan; }

/** 以已复核摘要执行无覆盖安装；任一源漂移或目标变化均在相应写入前失败关闭。 */
export function prepareInstantiation(input, expectedPlanDigest) {
  const { plan, source, files } = build(input);
  if (typeof expectedPlanDigest !== 'string' || expectedPlanDigest !== plan.planDigest) throw new Error('实例化计划摘要不匹配，请重新预览');
  for (const entry of source.manifest) {
    const current = readRegular(path.join(source.root, entry.path));
    if (current.sha256 !== entry.sha256 || current.mode !== entry.mode) throw new Error(`源快照已漂移：${entry.path}`);
  }
  const values = plan.values;
  const target = resolveProjectTarget(source.root, input.form.answers.project_path.value, values.project_id);
  if (target.targetRoot !== plan.targetRoot) throw new Error('唯一目标在安装前已改变');
  const installed = installExclusive(plan.targetRoot, files);
  return { schemaVersion: 1, status: 'engineering-copy-prepared', targetRoot: plan.targetRoot, sourceDigest: plan.sourceDigest, summaryDigest: plan.summaryDigest, values, files: installed, next: '继续中性 Rust/所选适配器初始化、相关测试与适用 GUI E2E；随后终端裁剪并建立独立 Git 基线。', initializationComplete: false };
}

/** CLI 通过 stdin 读取原确认结构，不插值 shell，也不将用户原消息写入磁盘。 */
export function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args: argv, options: { 'plan-digest': { type: 'string' } }, allowPositionals: true, strict: true });
  if (positionals.length !== 1 || !['plan', 'prepare'].includes(positionals[0])) throw new Error('仅支持 plan 或 prepare');
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  return positionals[0] === 'plan' ? planInstantiation(input) : prepareInstantiation(input, values['plan-digest']);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.stdout.write(`${JSON.stringify(main())}\n`); }
  catch (error) { process.stderr.write(`${JSON.stringify({ status: 'error', code: 'instantiation_failed', message: error.message, ...(error.recovery ? { recovery: error.recovery } : {}) })}\n`); process.exitCode = 2; }
}
