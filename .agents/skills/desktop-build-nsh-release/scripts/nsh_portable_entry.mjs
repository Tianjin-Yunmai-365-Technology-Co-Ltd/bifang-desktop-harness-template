/** 隔离组合项目的桌面配置，避免在移动/Web 注册桌面协议。 */
import fs from 'node:fs';
import path from 'node:path';

function ordinaryFile(file) {
  if (!fs.lstatSync(file).isFile()) throw new Error('expected an ordinary file: ' + file);
}

export function prepareNshPortableEntry(gui, stage) {
  const configFile = path.join(gui, 'nsh.json');
  const appFile = path.join(gui, 'App.tsx');
  ordinaryFile(configFile);
  ordinaryFile(appFile);
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  if (config.rust !== '.' || Object.hasOwn(config, 'root') || !config.capabilities ||
      typeof config.capabilities !== 'object' || Array.isArray(config.capabilities)) throw new Error('combined NSH project requires Mixed desktop metadata');
  const entry = path.join(stage, 'portable-entry');
  fs.mkdirSync(entry, { recursive: false });
  const relative = file => path.relative(entry, file).split(path.sep).join('/');
  config.rust = relative(gui);
  delete config.capabilities.windows;
  delete config.singleInstance;
  delete config.schemes;
  delete config.window;
  if (Object.keys(config.capabilities).length === 0) delete config.capabilities;
  if (config.icon !== undefined) {
    if (typeof config.icon !== 'string' || path.isAbsolute(config.icon)) throw new Error('invalid NSH icon');
    const icon = path.resolve(gui, config.icon);
    if (!icon.startsWith(gui + path.sep)) throw new Error('NSH icon escapes member');
    ordinaryFile(icon);
    const destination = path.join(entry, 'assets', 'logo.png');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(icon, destination);
    config.icon = 'assets/logo.png';
  }
  fs.writeFileSync(path.join(entry, 'nsh.json'), JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
  fs.writeFileSync(path.join(entry, 'App.tsx'), `import ${JSON.stringify(relative(appFile))};\n`, { flag: 'wx' });
  return entry;
}
