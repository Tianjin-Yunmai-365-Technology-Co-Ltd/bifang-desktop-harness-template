#!/usr/bin/env node
/** 源专用中性 NSH 初始化 wrapper；初始化后删除，不能随升级传播。 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { assertNshPath } from '../../desktop-add-nsh-adapter/scripts/add_nsh_adapter.mjs';
import { normalizeNshOptions,nshDependencies,nshPackageScripts,renderNshAdapterFiles } from '../../desktop-add-nsh-adapter/scripts/nsh_adapter_files.mjs';

/** 初始化器仅在明确确认的空目标写入中性 core 与所选适配器。 */
export function createNshWorkspace(target,input) {
  if (!path.isAbsolute(target)) throw new Error('target must be absolute');
  assertNshPath(target);
  if (fs.existsSync(target) && (!fs.lstatSync(target).isDirectory() || fs.readdirSync(target).length)) throw new Error('target must be absent or empty');
  const options = normalizeNshOptions(input);
  const id = options.projectId;
  const files = renderNshAdapterFiles(options);
  files.set('Cargo.toml',`[workspace]\nresolver = "3"\nmembers = ["${id}_core", "${id}_nsh"]\n\n[workspace.package]\nversion = "0.1.0"\nedition = "2024"\nrust-version = "1.98.1"\nauthors = [${JSON.stringify(options.owner)}]\n\n[workspace.dependencies]\n${id}_core = { path = "${id}_core" }\n${nshDependencies()}\n\n[workspace.metadata.agent-first-harness]\nproject-id = "${id}"\ninterfaces = ["nsh"]\nnsh-targets = ${JSON.stringify(options.nshTargets)}\ntarget-platforms = ${JSON.stringify(options.targetPlatforms)}\nversion-mirrors = ["${id}_nsh/nsh.json"]\n`);
  files.set(`${id}_core/Cargo.toml`,`[package]\nname = "${id}_core"\nversion.workspace = true\nedition.workspace = true\n`);
  files.set(`${id}_core/src/lib.rs`,`//! 运行时中立共享核心；产品定义后在此建立领域规则。\n\n/// 工程身份，不承载界面语言或框架类型。\npub const PROJECT_ID: &str = ${JSON.stringify(id)};\n`);
  files.set('package.json',JSON.stringify({private:true,type:'module',engines:{node:'>=24.0.0'},scripts:nshPackageScripts(id)},null,2)+'\n');
  files.set('.gitignore','/target/\ntarget/\n/release/\n/.release-clean.*\n**/.nsh/\nCargo.lock\npnpm-lock.yaml\npnpm-package.lock\n/knowledge/\n/.harness/skills/archify/\n');
  const stage=fs.mkdtempSync(path.join(path.dirname(target),'.nsh-scaffold-'));
  try {
    for (const [relative,bytes] of files) { const file=path.join(stage,relative); fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,bytes,{flag:'wx'}); }
    assertNshPath(target);
    if (fs.existsSync(target)) { if (fs.readdirSync(target).length) throw new Error('target changed'); fs.rmdirSync(target); }
    fs.renameSync(stage,target);
  } catch (error) { fs.rmSync(stage,{recursive:true,force:true}); throw error; }
  return {target,interface:'nsh',nshTargets:options.nshTargets,files:[...files.keys()],productDefinitionRequired:true};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { const {values}=parseArgs({options:{target:{type:'string'},options:{type:'string'}}}); if (!values.target || !values.options) throw new Error('requires target/options'); process.stdout.write(JSON.stringify(createNshWorkspace(values.target,JSON.parse(fs.readFileSync(values.options,'utf8'))))+'\n'); }
  catch(error) { process.stderr.write(`NSH initialization: ${error.message}\n`);process.exitCode=1; }
}
