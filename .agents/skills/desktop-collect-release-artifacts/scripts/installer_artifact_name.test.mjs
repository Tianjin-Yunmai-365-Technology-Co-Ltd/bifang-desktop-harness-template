/** 安装包命名保留中文、空格与原始版本，拒绝路径注入及不支持的目标。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { installerArtifactName } from './installer_artifact_name.mjs';

/** 两种平台使用同一展示名，架构别名归一，版本不附加展示前缀。 */
test('installer_names_preserve_display_identity_and_normalize_architecture', () => {
  for (const arch of ['x86_64', 'x64', 'aarch64', 'arm64']) {
    const label = ['x86_64', 'x64'].includes(arch) ? 'x64' : 'arm64';
    for (const [platform, suffix] of [['windows', 'Windows.exe'], ['macos', 'macOS.dmg']]) {
      assert.equal(installerArtifactName({ productName: '测试应用 Desktop', version: '1.4.4', platform, arch }),
        `测试应用 Desktop_1.4.4_${label}-setup for ${suffix}`);
    }
  }
});

/** 拒绝会生成目录、非法 Windows 文件名、歧义版本或未知目标的输入。 */
test('invalid_installer_identity_version_and_target_fail_closed', () => {
  const valid = { productName: '测试应用', version: '1.4.4', platform: 'windows', arch: 'x86_64' };
  for (const productName of ['', ' App', 'App ', '../App', 'dir\\App', 'App:Name', 'App"Name', 'App\nName', 'App\0Name', '\ud800']) {
    assert.throws(() => installerArtifactName({ ...valid, productName }), /display name/);
  }
  for (const version of ['v1.4.4', '1.4', '01.4.4', '1.4.4-beta', '1.4.4\n', undefined]) {
    assert.throws(() => installerArtifactName({ ...valid, version }), /raw stable/);
  }
  for (const target of [{ platform: 'linux' }, { arch: 'unknown' }, { platform: undefined }, { arch: undefined }]) {
    assert.throws(() => installerArtifactName({ ...valid, ...target }), /unsupported/);
  }
});

/** argv 中的中文和空格完整往返；缺失参数时退出失败且不输出名称。 */
test('cli_returns_exact_json_filename_and_rejects_missing_arguments', () => {
  const script = fileURLToPath(new URL('./installer_artifact_name.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, '--product-name', '测试应用 Desktop', '--version', '1.4.4', '--platform', 'windows', '--arch', 'x86_64'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { filename: '测试应用 Desktop_1.4.4_x64-setup for Windows.exe' });
  const missing = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, '');
});
