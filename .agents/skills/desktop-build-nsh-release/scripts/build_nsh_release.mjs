#!/usr/bin/env node
/** NSH 真实构建与不可覆盖的批次证据；不执行发布、安装或 E2E。 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { checkContext } from '../../desktop-prepare-release/scripts/release_context.mjs';
import { loadDocument } from '../../desktop-prepare-release/scripts/release_notes.mjs';
import { check as checkVersion } from '../../desktop-manage-version/scripts/version_gate.mjs';
import { readDependencyLockPolicy } from '../../desktop-implement-change/scripts/project_lock_policy.mjs';
import { iosPackagingIdentity,restoreIosDisplayIdentity } from './nsh_ios_identity.mjs';

const targets = ['macos','windows','linux','android','ios','ios-simulator','web'];
/** 输出只能落在真实项目目录，拒绝链接目录和已有批次覆盖。 */
export function safeOutputPath(root,file) {
  const absolute=path.resolve(file);
  if(!absolute.startsWith(root+path.sep)) throw new Error('output escaped project root');
  for(let current=absolute;current!==root;current=path.dirname(current)) {
    try{if(fs.lstatSync(current).isSymbolicLink()) throw new Error('output path contains symlink');}catch(error){if(error.code!=='ENOENT') throw error;}
  }
  return absolute;
}
/** 真实子进程参数数组，无 shell 或任意 hook。 */
function run(command,args,cwd,env=process.env,capture=false) {
  const result=spawnSync(command,args,{cwd,env,encoding:'utf8',stdio:capture?'pipe':'inherit',maxBuffer:32*1024*1024});
  if(result.status!==0 && capture && result.stderr) process.stderr.write(result.stderr.slice(-12000));
  if (result.status !== 0) throw new Error(`${command} failed (${result.status ?? result.error?.code ?? 'unknown'})`);
  return result.stdout?.trim();
}
/** 产物目录拒绝链接；签名 bundle 内的框架链接只由官方打包器拥有。 */
export function inventory(directory) {
  const files=[];
  const walk=(current,relative='')=>{
    for(const name of fs.readdirSync(current).sort()) {
      const file=path.join(current,name), key=path.posix.join(relative,name), stat=fs.lstatSync(file);
      if(stat.isSymbolicLink()) {
        const link=fs.readlinkSync(file),resolved=fs.realpathSync(file);
        if(path.isAbsolute(link) || !resolved.startsWith(fs.realpathSync(directory)+path.sep)) throw new Error('artifact link escapes package');
        files.push({path:key,link}); continue;
      }
      if(stat.isDirectory()) walk(file,key);
      else if(stat.isFile()) files.push({path:key,size:stat.size,sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')});
      else throw new Error('unsupported artifact type');
    }
  };
  walk(directory);return files;
}
/** 校验官方输出的真实入口与文件头，不按文件名子串判成功。 */
export function validateNshArtifacts(directory,target) {
  const files=inventory(directory).filter(file=>file.sha256);
  const bytes=file=>fs.readFileSync(path.join(directory,file.path));
  const one=(list,label)=>{if(list.length!==1) throw new Error(`expected exactly one ${label}`);return list[0];};
  const zipped=file=>{const data=bytes(file);if(data.length<22 || data.readUInt32LE(0)!==0x04034b50) throw new Error('invalid ZIP/APK header');};
  if(target==='web') {
    one(files.filter(file=>path.posix.basename(file.path)==='index.html'),'Web index');
    if(!files.some(file=>file.path.endsWith('.wasm') && bytes(file).subarray(0,8).equals(Buffer.from([0,97,115,109,1,0,0,0]))) || !files.some(file=>file.path.endsWith('.js') && file.size>0)) throw new Error('Web runtime is incomplete');
  } else if(target==='android') zipped(one(files.filter(file=>file.path.endsWith('.apk')),'APK'));
  else if(target==='windows') {
    zipped(one(files.filter(file=>file.path.endsWith('.zip')),'Windows ZIP'));
    const exe=one(files.filter(file=>file.path.endsWith('.exe')),'Windows executable');if(bytes(exe).subarray(0,2).toString()!=='MZ') throw new Error('invalid PE executable');
  } else if(target==='linux') {
    const archive=one(files.filter(file=>file.path.endsWith('.tar.gz')),'Linux archive');if(!bytes(archive).subarray(0,2).equals(Buffer.from([31,139]))) throw new Error('invalid gzip archive');
    if(!files.some(file=>bytes(file).subarray(0,4).equals(Buffer.from([127,69,76,70])))) throw new Error('Linux ELF executable missing');
  } else {
    const executables=files.filter(file=>(target==='macos'?/^[^/]+\.app\/Contents\/MacOS\/[^/]+$/u:/^[^/]+\.app\/[^/]+$/u).test(file.path)).filter(file=>['cffaedfe','cefaedfe','feedfacf','cafebabe','bebafeca'].includes(bytes(file).subarray(0,4).toString('hex')));
    one(executables,'Mach-O app executable');
  }
  return files;
}
/** 源、GUI 资源与受管文档按字节绑定，缓存和输出不进入快照。 */
export function sourceSnapshot(root) {
  const hash=createHash('sha256');
  const walk=(directory)=>{
    for(const name of fs.readdirSync(directory).sort()) {
      if(['.git','.nsh','target','release','node_modules'].includes(name)) continue;
      const file=path.join(directory,name), stat=fs.lstatSync(file);
      if(['Cargo.lock','pnpm-lock.yaml','pnpm-package.lock'].includes(name)) continue;
      if(stat.isSymbolicLink()) throw new Error('source symlink is unsupported');
      if(stat.isDirectory()) walk(file);
      else if(stat.isFile()) hash.update(path.relative(root,file)).update('\0').update(fs.readFileSync(file)).update('\0');
    }
  };
  walk(root);return hash.digest('hex');
}
/** 只读校验持久框架、版本与选择目标，不能把 CLI 当 NSH 打包。 */
export function packageFacts(root,metadata,target) {
  const facts=metadata.metadata?.['agent-first-harness'];
  if(path.resolve(metadata.workspace_root)!==root || facts?.['gui-framework']!=='nsh' || !facts.interfaces?.includes('gui')) throw new Error('requires NSH workspace');
  if(!targets.includes(target) || !facts['target-platforms']?.includes(target==='ios-simulator'?'ios':target)) throw new Error('target is not selected');
  if(facts['target-platforms'].some(platform=>['android','ios','web'].includes(platform)) && (facts.interfaces.length!==1 || facts.interfaces[0]!=='gui')) throw new Error('mobile/Web NSH targets require GUI-only interfaces');
  const id=facts['project-id'];
  if(!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u.test(id)) throw new Error('invalid project-id');
  const pkg=metadata.packages.find(value=>value.name===`${id}_gui` && metadata.workspace_members.includes(value.id));
  if(!pkg || path.dirname(pkg.manifest_path)!==path.join(root,`${id}_gui`)) throw new Error('GUI member missing');
  return {gui:path.join(root,`${id}_gui`),version:pkg.version,policy:facts};
}
/** 构建前解析候选选择，测试和封包不掺入运行验收。 */
export function buildNshRelease({root,mode='local',target,e2e,e2eReason,e2eRisk}) {
  root=fs.realpathSync(root);
  if(!['local','candidate'].includes(mode)) throw new Error('mode must be local or candidate');
  if(mode==='candidate' && !['enabled','disabled'].includes(e2e)) throw new Error('candidate requires explicit e2e');
  if(mode==='candidate' && e2e==='disabled' && [e2eReason,e2eRisk].some(value=>typeof value!=='string' || !value.trim())) throw new Error('disabled E2E requires reason and remaining risk');
  if(readDependencyLockPolicy(root)==='tracked') throw new Error('NSH 0.4.0 does not propagate tracked locks to its generated runtime workspace; packaging is blocked until a frozen resolution route is implemented');
  safeOutputPath(root,path.join(root,'target'));safeOutputPath(root,path.join(root,'release'));
  const metadata=JSON.parse(run('cargo',['metadata','--no-deps','--format-version','1'],root,process.env,true));
  const facts=packageFacts(root,metadata,target);
  const nativeHost={macos:'darwin',windows:'win32',linux:'linux',ios:'darwin','ios-simulator':'darwin'}[target];
  if(nativeHost && nativeHost!==process.platform) throw new Error('target requires its native host');
  const version=run('nsh',['--version'],root,process.env,true);
  if(!/^nsh 0\.4\.0 \(e626a8d\)/u.test(version)) throw new Error('NSH CLI must match the declared v0.4.0 runtime revision');
  const lockArgs=[];
  let context=null,notes=null;
  if(fs.existsSync(path.join(root,'.harness/version-state.json'))) checkVersion(root,'build');
  if(mode==='candidate') {
    context=checkContext({projectRoot:root},{published:true});
    notes=loadDocument(path.join(root,'release-notes.json'));
    if(!notes || context.version!==facts.version || notes.releases[0].version!==`v${facts.version}`) throw new Error('candidate version mismatch');
  }
  const before=sourceSnapshot(root);
  const tests=run('cargo',['test','--workspace','--all-targets','--all-features',...lockArgs,'--','--list'],root,process.env,true);
  if(!/^.+: test$/mu.test(tests)) throw new Error('nonempty workspace tests required');
  run('cargo',['test','--workspace','--all-targets','--all-features',...lockArgs],root);
  run('nsh',['check'],facts.gui);
  run('nsh',['test','.'],facts.gui);
  if(sourceSnapshot(root)!==before) throw new Error('source changed during tests');
  const batch=`nsh-${target}-${randomUUID()}`;
  const parent=path.join(root,mode==='candidate'?'release':'target/nsh-packaging');
  safeOutputPath(root,parent);
  fs.mkdirSync(parent,{recursive:true});
  fs.mkdirSync(path.join(root,'target'),{recursive:true});
  const stage=fs.mkdtempSync(path.join(root,'target/.nsh-package-'));
  const formattedNotes=locale=>notes.releases.map(release=>[release.version,release.releaseDate,...release.featureOptimizations.map(item=>item[locale]),...release.bugFixes.map(item=>item[locale])].join('\n')).join('\n\n');
  const env={...process.env,...(mode==='candidate'?{HARNESS_RELEASE_NOTES:fs.readFileSync(path.join(root,'release-notes.json'),'utf8'),HARNESS_RELEASE_NOTES_ZH:formattedNotes('zh-CN'),HARNESS_RELEASE_NOTES_EN:formattedNotes('en-US')}:{})};
  const iosIdentity=['ios','ios-simulator'].includes(target)?iosPackagingIdentity(JSON.parse(fs.readFileSync(path.join(facts.gui,'nsh.json'),'utf8')).name):null;
  run('nsh',['package','--target',target,'--out',path.join(stage,'package'),'--app-version',facts.version,...(iosIdentity?.changed?['--name',iosIdentity.packageName]:[])],facts.gui,env);
  if(iosIdentity?.changed) {
    const app=restoreIosDisplayIdentity(path.join(stage,'package'),iosIdentity);
    if(target==='ios-simulator'){run('codesign',['--force','--sign','-','--timestamp=none',app],root);run('codesign',['--verify','--deep','--strict',app],root);}
  }
  const artifacts=validateNshArtifacts(path.join(stage,'package'),target);
  if(mode==='candidate') for(const name of ['release-notes.json','LICENSE.zh-CN.md','LICENSE.en.md']) fs.copyFileSync(path.join(root,name),path.join(stage,name));
  // 使用平台自带归档器，保留官方生成的完整目录及签名 app。
  const primary=target==='web'?'web.tar.gz':target==='macos' || target.startsWith('ios') ? 'application.tar.gz' : artifacts.find(file=>file.path.endsWith({windows:'.zip',linux:'.tar.gz',android:'.apk'}[target]))?.path;
  if(['web','macos','ios','ios-simulator'].includes(target)) run('tar',['-czf',path.join(stage,primary),'-C',path.join(stage,'package'),'.'],root);
  const artifact=['web','macos','ios','ios-simulator'].includes(target)?primary:path.posix.join('package',primary);
  const artifactSha=createHash('sha256').update(fs.readFileSync(path.join(stage,artifact))).digest('hex');
  fs.writeFileSync(path.join(stage,`${artifact}.sha256`),`${artifactSha}  ${path.basename(artifact)}\n`);
  if(sourceSnapshot(root)!==before) throw new Error('source changed during packaging');
  if(mode==='candidate') checkContext({projectRoot:root,expectedSha256:context.releaseContextSha256},{published:true});
  const format={macos:'app.tar.gz',windows:'zip',linux:'tar.gz',android:'apk',ios:'app.tar.gz','ios-simulator':'app.tar.gz',web:'web.tar.gz'}[target];
  const signing=target==='android'?'development-key':target==='ios'?'unsigned-device':target==='macos'||target==='ios-simulator'?'ad-hoc':'not-applicable';
  const manifest={schemaVersion:1,project:facts.policy['project-id'],interface:'gui',guiFramework:'nsh',mode,target,platform:target==='ios-simulator'?'ios':target,host:process.platform,arch:process.arch,buildMode:'native',buildRun:batch,bundleFormat:format,artifactKind:target==='web'?'web-archive':target==='android'?'installer':'application-archive',artifact,sha256:artifactSha,checksum:`${artifact}.sha256`,version:facts.version,sourceCommit:context?.sourceCommit??null,sourceSnapshot:before,tool:version,e2eSelection:mode==='candidate'?e2e:'not-applicable',e2eStatus:mode==='candidate'&&e2e==='enabled'?'pending':'Not run',...(e2e==='disabled'?{e2eReason,e2eRemainingRisk:e2eRisk}:{}),signingSelection:signing,signingSource:'official-local-packaging-default',unitTests:{status:'passed',testCases:tests.split('\n').filter(line=>line.endsWith(': test')).length,nshRenderTests:'passed'},milestoneAcceptance:'pending',runtimeVerification:'Unverified',files:inventory(stage)};
  manifest.hostArch=process.arch;
  manifest.arch=target==='web'?'wasm32':target==='android'?'universal':target==='ios'?'arm64':process.arch;
  manifest.buildMode=['web','android','ios','ios-simulator'].includes(target)?'cross':'native';
  if(target==='web') manifest.webRoot=path.posix.join('package',path.posix.dirname(artifacts.find(file=>path.posix.basename(file.path)==='index.html').path));
  if(context) Object.assign(manifest,{expectedTag:context.expectedTag,releaseContextSha256:context.releaseContextSha256,releaseReview:context.releaseReview,reviewSelection:context.releaseReview.selection,reviewStatus:context.releaseReview.status,candidateSelections:{e2eSelection:e2e,signingSelection:signing,signingSource:manifest.signingSource},releaseNotesVersion:notes.releases[0].version,releaseNotesSha256:createHash('sha256').update(fs.readFileSync(path.join(stage,'release-notes.json'))).digest('hex'),releaseNotesPath:'release-notes.json',releaseNotesResourceVerification:'sidecar-byte-identical',licenses:['LICENSE.zh-CN.md','LICENSE.en.md']});
  if(context) manifest.sourceCommit=run('git',['rev-parse','HEAD'],root,process.env,true);
  fs.writeFileSync(path.join(stage,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  const output=safeOutputPath(root,path.join(parent,batch));fs.renameSync(stage,output);
  return {output,manifest:path.join(output,'manifest.json'),...manifest};
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {const {values}=parseArgs({options:{root:{type:'string',default:'.'},mode:{type:'string',default:'local'},target:{type:'string'},e2e:{type:'string'},'e2e-reason':{type:'string'},'e2e-risk':{type:'string'}}});const result=buildNshRelease({...values,e2eReason:values['e2e-reason'],e2eRisk:values['e2e-risk']});process.stdout.write(JSON.stringify({output:result.output,manifest:result.manifest,mode:result.mode,target:result.target,version:result.version,artifact:result.artifact,sha256:result.sha256,unitTests:result.unitTests})+'\n');}
  catch(error){process.stderr.write(`NSH build: ${error.message}\n`);process.exitCode=1;}
}
