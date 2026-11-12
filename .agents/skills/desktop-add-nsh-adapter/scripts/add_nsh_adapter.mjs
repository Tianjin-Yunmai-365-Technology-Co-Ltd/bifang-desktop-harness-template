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

function readManifest(file) {
  try {
    if (!fs.lstatSync(file).isFile()) throw new Error('expected an ordinary manifest: ' + file);
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

/** 同目录暂存完整清单，已有清单保留权限，新清单禁止覆盖竞争写入。 */
function replaceManifest(file, original, content, retainedDirectories) {
  const stage = fs.mkdtempSync(path.join(path.dirname(file), '.nsh-manifest-'));
  try {
    const candidate = path.join(stage, 'manifest');
    const mode = original === null ? 0o644 : fs.lstatSync(file).mode & 0o777;
    fs.writeFileSync(candidate, content, {flag:'wx', mode});
    if (original !== null) fs.chmodSync(candidate, mode);
    const installed = fs.lstatSync(candidate);
    if (readManifest(file) !== original) throw new Error('workspace manifest changed: ' + file);
    if (original === null) fs.linkSync(candidate, file);
    else fs.renameSync(candidate, file);
    return installed;
  } finally {
    try { fs.rmSync(stage, {recursive:true, force:true}); }
    catch { retainedDirectories.push(stage); }
  }
}

/** 逐层创建目录，只登记本次成功创建的 inode。 */
function createOwnedDirectories(directory, root, owned) {
  if (directory === root) return;
  createOwnedDirectories(path.dirname(directory), root, owned);
  assertNshPath(directory);
  try {
    fs.mkdirSync(directory);
    owned.push({file:directory, stat:fs.lstatSync(directory)});
  } catch (error) {
    if (error.code !== 'EEXIST' || !fs.lstatSync(directory).isDirectory()) throw error;
  }
}

function sameInode(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
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
      !/\bpub\s+initialized\s*:\s*bool\s*(?:,|$)/u.test(statusType) ||
      !/\bpub\s+product_definition_required\s*:\s*bool\s*(?:,|$)/u.test(statusType)) {
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
  const originalPackage = readManifest(packagePath);
  const packageJson = originalPackage === null ? {private:true,type:'module',engines:{node:'>=24.0.0'}} : JSON.parse(originalPackage);
  if (!packageJson || typeof packageJson !== 'object' || Array.isArray(packageJson) ||
      (Object.hasOwn(packageJson, 'scripts') && (!packageJson.scripts || typeof packageJson.scripts !== 'object' || Array.isArray(packageJson.scripts)))) {
    throw new Error('package.json and its scripts must be objects');
  }
  const scripts = nshPackageScripts(options.projectId, options.nshTargets, options.targetPlatforms);
  for (const key of Object.keys(scripts)) if (Object.hasOwn(packageJson.scripts ?? {}, key) && packageJson.scripts[key] !== scripts[key]) throw new Error(`package script conflict: ${key}`);
  for (const relative of files.keys()) { assertNshPath(path.join(root,relative)); if (fs.existsSync(path.join(root,relative))) throw new Error(`refusing existing file: ${relative}`); }
  const written = [];
  const ownedDirectories = [];
  const retainedDirectories = [];
  let installedCargo;
  try {
    if (readManifest(cargoPath) !== originalCargo || readManifest(packagePath) !== originalPackage) throw new Error('workspace changed during planning');
    for (const [relative, bytes] of files) {
      const file = path.join(root, relative);
      createOwnedDirectories(path.dirname(file), root, ownedDirectories);
      assertNshPath(file);
      const fd = fs.openSync(file, 'wx');
      try {
        const record = {file, bytes:Buffer.from(bytes), stat:fs.fstatSync(fd), complete:false};
        written.push(record);
        fs.writeFileSync(fd, record.bytes);
        record.complete = true;
      } finally { fs.closeSync(fd); }
    }
    installedCargo = replaceManifest(cargoPath, originalCargo, cargo, retainedDirectories);
    replaceManifest(packagePath, originalPackage, JSON.stringify({...packageJson,scripts:{...packageJson.scripts,...scripts}},null,2)+'\n', retainedDirectories);
  } catch(error) {
    const failures = [error];
    for (const {file, bytes, stat, complete} of written.reverse()) {
      try {
        assertNshPath(file);
        const current = fs.lstatSync(file);
        if (!current.isFile() || !sameInode(stat, current) || current.mode !== stat.mode) continue;
        const actual = fs.readFileSync(file);
        if (actual.equals(complete ? bytes : bytes.subarray(0, actual.length))) fs.unlinkSync(file);
      } catch (rollback) { if (rollback.code !== 'ENOENT') failures.push(rollback); }
    }
    for (const {file, stat} of ownedDirectories.reverse()) {
      try {
        assertNshPath(file);
        const current = fs.lstatSync(file);
        if (current.isDirectory() && sameInode(stat, current) && current.mode === stat.mode) fs.rmdirSync(file);
      } catch (rollback) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(rollback.code)) failures.push(rollback); }
    }
    try {
      if (installedCargo) {
        assertNshPath(cargoPath);
        const current = fs.lstatSync(cargoPath);
        if (current.isFile() && sameInode(installedCargo, current) && current.mode === installedCargo.mode &&
            readManifest(cargoPath) === cargo) {
          replaceManifest(cargoPath, cargo, originalCargo, retainedDirectories);
        }
      }
    }
    catch (rollback) { failures.push(rollback); }
    if (retainedDirectories.length) failures.push(new Error('retained manifest stage: ' + retainedDirectories.join(', ')));
    if (failures.length > 1) throw new AggregateError(failures, 'NSH adapter rollback could not restore all files');
    throw error;
  }
  return {interface:'nsh',nshTargets:options.nshTargets,corePreserved:true,files:[...files.keys(),'Cargo.toml','package.json'],
    ...(retainedDirectories.length ? {retainedDirectories} : {})};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { const {values} = parseArgs({options:{root:{type:'string'},options:{type:'string'}}}); if (!values.root || !values.options) throw new Error('requires --root and --options'); process.stdout.write(JSON.stringify(addNshAdapter(values.root,JSON.parse(fs.readFileSync(values.options,'utf8'))))+'\n'); }
  catch (error) { process.stderr.write(`NSH adapter: ${error.message}\n`); process.exitCode=1; }
}
