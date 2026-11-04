/** 直接执行模板路径函数并使用浏览器 URL 语义复验，不加载网络或第三方运行时。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/brand-support/react/brandSupportProfile.ts', import.meta.url), 'utf8');
const executable = stripTypeScriptTypes(source).replace(/^import[^\n]*\n/gmu, '').replace(/^export /gmu, '');
const profileJson = JSON.parse(fs.readFileSync(new URL('../assets/brand-support/brand-support-profile.json', import.meta.url), 'utf8'));
const { isLocalSupportPath, resolveBrandAssetPath } = vm.runInNewContext(
  `${executable}\n;({ isLocalSupportPath, resolveBrandAssetPath });`, { profileJson },
);

// 普通根路径、中文及空格名称仍保持同源，避免把修复扩张为文件名限制。
test('ordinary_support_paths_stay_local', () => {
  for (const value of ['/brand-support/banner.png', '/本地资源/封面.png', '/brand assets/banner.png']) {
    assert.equal(isLocalSupportPath(value), true);
    assert.equal(new URL(value, 'https://app.example/').origin, 'https://app.example');
  }
  assert.equal(resolveBrandAssetPath('/brand-support/', 'banner.png'), '/brand-support/banner.png');
});

// C0 与 DEL 不能被 URL 解析器删除后把本地路径变成远程 authority。
test('control_characters_cannot_turn_support_media_into_remote_urls', () => {
  for (const control of ['\0', '\t', '\n', '\r', '\x1f', '\x7f']) {
    const absolute = `/${control}/example.invalid/picture.png`;
    assert.equal(isLocalSupportPath(absolute), false, JSON.stringify(absolute));
    assert.throws(() => resolveBrandAssetPath(absolute, 'picture.png'), /local absolute path/u);
    assert.throws(() => resolveBrandAssetPath('/', `${control}/example.invalid/picture.png`), /safe relative path/u);
  }
  assert.equal(new URL('/\t/example.invalid/picture.png', 'https://app.example/').origin, 'https://example.invalid');
});
