#!/usr/bin/env node
/** 仅初始化源可用的全新 GPUI 工作区入口；终端下游必须裁掉此文件与 core 模板。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertRealPath, normalizeOptions, renderGpuiAdapterFiles } from './gpui_adapter_files.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

/** 初始化器组合完整工作区；纯适配器渲染库不创建或覆盖 core。 */
export function renderGpuiFiles(input) {
  const options = normalizeOptions(input);
  const { projectId, owner } = options;
  const files = renderGpuiAdapterFiles({ ...options, neutralCoreProbe: true });
  files.set('Cargo.toml', `[workspace]\nresolver = "3"\nmembers = ["${projectId}_core", "${projectId}_gui"]\n\n[workspace.package]\nversion = "0.1.0"\nedition = "2024"\nrust-version = "1.98.1"\nauthors = [${JSON.stringify(owner)}]\n\n[workspace.dependencies]\n${projectId}_core = { path = "${projectId}_core" }\ngpui-kit = "0.7.1"\nrust-i18n = "4.2.0"\nsys-locale = "0.3.2"\n\n[workspace.metadata.agent-first-harness]\nproject-id = "${projectId}"\ninterfaces = ["gui"]\ntarget-platforms = [${options.targetPlatforms.map(JSON.stringify).join(', ')}]\ngui-framework = "gpui"\n`);
  files.set(`${projectId}_core/Cargo.toml`, `[package]\nname = "${projectId}_core"\nversion.workspace = true\nedition.workspace = true\nrust-version.workspace = true\n`);
  files.set(`${projectId}_core/src/lib.rs`, fs.readFileSync(path.resolve(here, '../assets/core/src/lib.rs'), 'utf8'));
  files.set('.gitignore', '/target/\n/release/\n/.release-clean.*\nCargo.lock\npnpm-lock.yaml\npnpm-package.lock\n');
  return files;
}

/** 原子安装全新工作区，任何已有内容或路径符号链接都导致零覆盖失败。 */
export function createGpuiWorkspace(input) {
  if (typeof input.target !== 'string' || !path.isAbsolute(input.target)) throw new Error('target must be an explicit absolute path');
  const target = path.normalize(input.target);
  assertRealPath(target, true);
  const existing = fs.existsSync(target);
  if (existing && (!fs.lstatSync(target).isDirectory() || fs.readdirSync(target).length)) throw new Error('target must be an absent or empty ordinary directory');
  const files = renderGpuiFiles(input);
  const parent = path.dirname(target);
  if (!fs.existsSync(parent)) throw new Error('target parent must already exist');
  const stage = fs.mkdtempSync(path.join(parent, '.gpui-scaffold-'));
  try {
    for (const [relative, value] of files) {
      const file = path.join(stage, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, value, { flag: 'wx' });
    }
    assertRealPath(target, true);
    if (fs.existsSync(target)) {
      if (!existing || fs.readdirSync(target).length) throw new Error('target changed during generation');
      fs.rmdirSync(target);
    }
    fs.renameSync(stage, target);
  } catch (error) {
    fs.rmSync(stage, { recursive: true, force: true });
    if (existing && !fs.existsSync(target)) fs.mkdirSync(target);
    throw error;
  }
  return { target, files: [...files.keys()], guiFramework: 'gpui', nativeCapabilities: 'unavailable' };
}

/** 命令行只接收已确认的中性初始化字段，不猜测 Git 或策略确认来源。 */
function parseArguments(argv) {
  const known = new Map(['target', 'project-id', 'name-zh', 'name-en', 'owner', 'about-page', 'sponsor-page', 'sidebar-mode', 'logo', 'target-platforms', 'system-tray', 'system-notification', 'autostart', 'single-instance', 'deep-link', 'global-shortcut'].map(key => [key, key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())]));
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    if (!name?.startsWith('--') || !known.has(name.slice(2)) || argv[index + 1] === undefined || argv[index + 1].startsWith('--')) throw new Error(`unknown or incomplete argument: ${name}`);
    const key = known.get(name.slice(2));
    if (Object.hasOwn(options, key)) throw new Error(`duplicate argument: ${name}`);
    options[key] = key === 'targetPlatforms' ? argv[index + 1].split(',') : argv[index + 1];
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(JSON.stringify(createGpuiWorkspace(parseArguments(process.argv.slice(2))), null, 2) + '\n'); }
  catch (error) { process.stderr.write(`GPUI scaffold: ${error.message}\n`); process.exitCode = 1; }
}
