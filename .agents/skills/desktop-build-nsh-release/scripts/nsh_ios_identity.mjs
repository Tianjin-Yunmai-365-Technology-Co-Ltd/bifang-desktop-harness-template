/** NSH 0.5.0 iOS 的执行文件与资源目录在大小写不敏感宿主上的冲突修复。 */
import fs from 'node:fs';
import path from 'node:path';

/** 只改变 CLI 的临时内部名称，公开名称随后逐字恢复。 */
export function iosPackagingIdentity(name) {
  if(typeof name!=='string' || !name.trim() || name!==name.trim() || /[\\/:*?"<>|\x00-\x1f\x7f]/u.test(name)) throw new Error('invalid iOS display name');
  const executable=name.replace(/[^A-Za-z0-9]/gu,'') || 'App';
  return {displayName:name,packageName:executable.toLowerCase()==='nsh'?`${name} App`:name,changed:executable.toLowerCase()==='nsh'};
}
/** 写入 XML 文本值，保持 executable、identifier 与其他元数据原样。 */
export function restoreIosPlist(source,name) {
  const escaped=name.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
  for(const key of ['CFBundleName','CFBundleDisplayName']) {
    const pattern=new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`,'gu');
    if([...source.matchAll(pattern)].length!==1) throw new Error(`requires exactly one XML ${key}`);
    source=source.replace(pattern,(_,start,end)=>`${start}${escaped}${end}`);
  }
  return source;
}
/** 仅处理本次官方工具生成的普通 bundle；签名由调用方在此后执行。 */
export function restoreIosDisplayIdentity(packageRoot,identity) {
  const source=path.join(packageRoot,`${identity.packageName}.app`),destination=path.join(packageRoot,`${identity.displayName}.app`);
  if(!identity.changed)return destination;
  const stat=fs.lstatSync(source),plist=path.join(source,'Info.plist');
  if(!stat.isDirectory() || stat.isSymbolicLink() || !fs.lstatSync(plist).isFile() || fs.lstatSync(plist).isSymbolicLink() || fs.existsSync(destination)) throw new Error('iOS generated bundle identity conflict');
  const original=fs.readFileSync(plist,'utf8');
  fs.writeFileSync(plist,restoreIosPlist(original,identity.displayName));
  fs.renameSync(source,destination);return destination;
}
