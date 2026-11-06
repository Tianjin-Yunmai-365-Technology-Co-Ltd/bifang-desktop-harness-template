/** 验证真实触发的 iOS 名称冲突与身份保留，单测不冒充代码签名。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {iosPackagingIdentity,restoreIosPlist,restoreIosDisplayIdentity} from './nsh_ios_identity.mjs';

test('nsh_resource_name_collision_changes_only_temporary_packaging_name',()=>{
  assert.deepEqual(iosPackagingIdentity('NSH 工程验证'),{displayName:'NSH 工程验证',packageName:'NSH 工程验证 App',changed:true});
  for(const name of ['神谕','NSH Demo','Other App'])assert.equal(iosPackagingIdentity(name).changed,false);
  assert.throws(()=>iosPackagingIdentity('../escape'),/invalid/u);
});
test('plist_and_directory_restore_public_identity_without_changing_executable',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'nsh-ios-identity-'));
  try{
    const identity=iosPackagingIdentity('NSH & 神谕');const app=path.join(root,`${identity.packageName}.app`);fs.mkdirSync(app);
    const plist='<plist><dict><key>CFBundleName</key><string>temporary</string><key>CFBundleDisplayName</key><string>temporary</string><key>CFBundleExecutable</key><string>NSHApp</string></dict></plist>';
    fs.writeFileSync(path.join(app,'Info.plist'),plist);fs.writeFileSync(path.join(app,'NSHApp'),'test bytes');
    const restored=restoreIosDisplayIdentity(root,identity);
    assert.equal(path.basename(restored),'NSH & 神谕.app');assert.equal(fs.existsSync(app),false);
    const result=fs.readFileSync(path.join(restored,'Info.plist'),'utf8');assert.ok(result.includes('NSH &amp; 神谕'));assert.ok(result.includes('<string>NSHApp</string>'));
    assert.throws(()=>restoreIosPlist('<plist/>','name'),/exactly one/u);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
