#!/usr/bin/env node
/** 既有工作区 add-only 接线；冲突时不改 core 或已有文件。 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { normalizeNshOptions, nshDependencies, nshPackageScripts, renderNshAdapterFiles } from './nsh_adapter_files.mjs';

/** 拒绝目标及父级符号链接，避免写入范围逃逸。 */
export function assertNshPath(file) {
  for (let current = path.resolve(file); ; current = path.dirname(current)) {
    try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error('symbolic link path is not allowed'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (path.dirname(current) === current) break;
  }
}

/** Cargo 自己解析已有工作区；只支持可安全定点合并的清单。 */
export function addNshAdapter(root, input) {
  root = path.resolve(root);
  assertNshPath(root);
  const options = normalizeNshOptions(input);
  const command = spawnSync('cargo',['metadata','--format-version','1','--no-deps'],{cwd:root,encoding:'utf8'});
  if (command.status !== 0) throw new Error('cargo metadata failed for existing workspace');
  const metadata = JSON.parse(command.stdout);
  const facts = metadata.metadata?.['agent-first-harness'];
  if (path.resolve(metadata.workspace_root) !== root || facts?.['project-id'] !== options.projectId || !Array.isArray(facts.interfaces) || facts.interfaces.length) throw new Error('requires matching core-only workspace without an interface');
  if (JSON.stringify([...facts['target-platforms']].sort()) !== JSON.stringify([...options.targetPlatforms].sort())) throw new Error('target-platforms mismatch');
  if (Object.hasOwn(facts,'nsh-targets')) throw new Error('existing NSH targets conflict');
  const core = metadata.packages.find(pkg => pkg.name === `${options.projectId}_core` && metadata.workspace_members.includes(pkg.id));
  if (!core || path.dirname(core.manifest_path) !== path.join(root,`${options.projectId}_core`)) throw new Error('direct shared core member missing');
  const coreSourcePath = path.join(root,`${options.projectId}_core`,'src','lib.rs');
  assertNshPath(coreSourcePath);
  const coreSource = fs.readFileSync(coreSourcePath,'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu,'');
  const statusType = coreSource.match(/\bpub\s+struct\s+ScaffoldStatus\s*\{([^}]*)\}/u)?.[1] ?? '';
  if (!/\bpub\s+async\s+fn\s+scaffold_status\s*\(\s*\)\s*->\s*ScaffoldStatus\s*\{/u.test(coreSource) ||
      !/\bpub\s+initialized\s*:\s*bool\s*[,}]/u.test(statusType) ||
      !/\bpub\s+product_definition_required\s*:\s*bool\s*[,}]/u.test(statusType)) {
    throw new Error('existing core must export pub async fn scaffold_status() -> ScaffoldStatus with public initialized and product_definition_required bool fields');
  }
  if(fs.existsSync(path.join(root,`${options.projectId}_nsh`))) throw new Error('NSH directory already exists');
  const cargoPath = path.join(root,'Cargo.toml');
  for (const file of [cargoPath,path.join(root,'package.json'),core.manifest_path]) assertNshPath(file);
  let cargo = fs.readFileSync(cargoPath,'utf8');
  const originalCargo = cargo;
  if (/gui-framework\s*=/u.test(cargo)) throw new Error('existing NSH dependencies/framework conflict');
  const newDependencies = nshDependencies(options);
  for (const line of newDependencies.split('\n')) {
    const name = line.split(' = ')[0];
    if (new RegExp(`^${name}\\s*=`, 'mu').test(cargo)) throw new Error(`existing NSH dependency conflict: ${name}`);
  }
  if ((cargo.match(/^members\s*=\s*\[[^\n]*\]/gmu) ?? []).length !== 1 || (cargo.match(/^interfaces\s*=\s*\[[^\n]*\]/gmu) ?? []).length !== 1) throw new Error('requires single-line members and interfaces arrays');
  cargo = cargo.replace(/^members\s*=\s*\[[^\n]*\]/mu,`members = ${JSON.stringify([...metadata.workspace_members.map(member=>metadata.packages.find(pkg=>pkg.id===member)).map(pkg=>path.relative(root,path.dirname(pkg.manifest_path)).split(path.sep).join('/')),`${options.projectId}_nsh`])}`);
  cargo = cargo.replace(/^interfaces\s*=\s*\[[^\n]*\]/mu,`interfaces = ["nsh"]\nnsh-targets = ${JSON.stringify(options.nshTargets)}`);
  if (!new RegExp(`^${options.projectId}_core\\s*=`, 'mu').test(cargo)) cargo = cargo.replace('[workspace.dependencies]',`[workspace.dependencies]\n${options.projectId}_core = { path = "${options.projectId}_core" }`);
  cargo = cargo.includes('[workspace.dependencies]') ? cargo.replace('[workspace.dependencies]',`[workspace.dependencies]\n${newDependencies}`) : `${cargo}\n[workspace.dependencies]\n${newDependencies}\n`;
  if (!new RegExp(`^${options.projectId}_core\\s*=`, 'mu').test(cargo)) cargo = cargo.replace('[workspace.dependencies]',`[workspace.dependencies]\n${options.projectId}_core = { path = "${options.projectId}_core" }`);
  const mirrors = facts['version-mirrors'] ?? [];
  if(!Array.isArray(mirrors) || mirrors.some(value=>typeof value!=='string') || new Set(mirrors).size!==mirrors.length) throw new Error('invalid version mirrors');
  const nextMirrors = [...new Set([...mirrors, `${options.projectId}_nsh/nsh.json`])];
  if(nextMirrors.length>10) throw new Error('too many version mirrors');
  const declarations=[...originalCargo.matchAll(/^version-mirrors\s*=/gmu)];
  if(Object.hasOwn(facts,'version-mirrors')) {
    if(declarations.length!==1 || !/^version-mirrors\s*=\s*\[[^\n]*\]\s*$/mu.test(originalCargo)) throw new Error('requires one single-line version-mirrors declaration');
    cargo=cargo.replace(/^version-mirrors\s*=\s*\[[^\n]*\]/mu, `version-mirrors = ${JSON.stringify(nextMirrors)}`);
  }
  else if(declarations.length) throw new Error('ambiguous version-mirrors declaration');
  else cargo=cargo.replace(`nsh-targets = ${JSON.stringify(options.nshTargets)}`, `nsh-targets = ${JSON.stringify(options.nshTargets)}\nversion-mirrors = ${JSON.stringify(nextMirrors)}`);
  const files = renderNshAdapterFiles(options,core.version);
  const packagePath = path.join(root,'package.json');
  const originalPackage = fs.existsSync(packagePath) ? fs.readFileSync(packagePath,'utf8') : null;
  const packageJson = originalPackage === null ? {private:true,type:'module',engines:{node:'>=24.0.0'}} : JSON.parse(originalPackage);
  const scripts = nshPackageScripts(options.projectId, options.nshTargets, options.targetPlatforms);
  for (const key of Object.keys(scripts)) if (packageJson.scripts?.[key] && packageJson.scripts[key] !== scripts[key]) throw new Error(`package script conflict: ${key}`);
  for (const relative of files.keys()) { assertNshPath(path.join(root,relative)); if (fs.existsSync(path.join(root,relative))) throw new Error(`refusing existing file: ${relative}`); }
  const written=[];
  try {
    if(fs.readFileSync(cargoPath,'utf8')!==originalCargo || (fs.existsSync(packagePath)?fs.readFileSync(packagePath,'utf8'):null)!==originalPackage) throw new Error('workspace changed during planning');
    for (const [relative,bytes] of files) { const file = path.join(root,relative); fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,bytes,{flag:'wx'}); written.push(file); }
    fs.writeFileSync(cargoPath,cargo);
    fs.writeFileSync(packagePath,JSON.stringify({...packageJson,scripts:{...packageJson.scripts,...scripts}},null,2)+'\n');
  } catch(error) {
    for(const file of written.reverse()) fs.rmSync(file);
    if(fs.readFileSync(cargoPath,'utf8')===cargo) fs.writeFileSync(cargoPath,originalCargo);
    throw error;
  }
  return {interface:'nsh',nshTargets:options.nshTargets,corePreserved:true,files:[...files.keys(),'Cargo.toml','package.json']};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { const {values} = parseArgs({options:{root:{type:'string'},options:{type:'string'}}}); if (!values.root || !values.options) throw new Error('requires --root and --options'); process.stdout.write(JSON.stringify(addNshAdapter(values.root,JSON.parse(fs.readFileSync(values.options,'utf8'))))+'\n'); }
  catch (error) { process.stderr.write(`NSH adapter: ${error.message}\n`); process.exitCode=1; }
}
