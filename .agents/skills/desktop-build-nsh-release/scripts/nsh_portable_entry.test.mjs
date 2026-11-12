import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { prepareNshPortableEntry } from './nsh_portable_entry.mjs';

test('portable_entry_keeps_mixed_core_without_registering_desktop_schemes', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nsh-portable-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const gui = path.join(root, 'example_nsh');
  const stage = path.join(root, 'target', 'batch');
  fs.mkdirSync(path.join(gui, 'assets'), {recursive:true});
  fs.mkdirSync(stage, {recursive:true});
  const original = { name: 'Example', rust: '.', window: { closeOnPress: false },
    schemes: ['app-example','mobile-example'], singleInstance: true, icon: { default: 'assets/tray.svg' },
    capabilities: { windows: { kinds: ['normal'] } } };
  const app = 'import icon from ' + '"./assets/tray.svg";\n';
  fs.writeFileSync(path.join(gui, 'App.tsx'), app);
  fs.writeFileSync(path.join(gui, 'assets', 'tray.svg'), '<svg/>');
  fs.writeFileSync(path.join(root, 'Cargo.toml'), '[workspace]');
  fs.writeFileSync(path.join(gui, 'nsh.json'), JSON.stringify(original));
  const installed = path.join(root, 'node_modules', 'portable-fixture');
  fs.mkdirSync(installed, {recursive:true});
  fs.writeFileSync(path.join(installed, 'index.js'), 'export const ready = true;');
  if (process.platform !== 'win32') fs.symlinkSync('portable-fixture', path.join(installed, '..', 'linked-fixture'));
  const entry = prepareNshPortableEntry(root, gui, stage);
  const portable = JSON.parse(fs.readFileSync(path.join(entry, 'nsh.json'), 'utf8'));
  assert.deepEqual(portable, { name:'Example', rust:'.', icon:original.icon, schemes:['mobile-example'], capabilities:{} });
  assert.equal(fs.readFileSync(path.join(entry, 'App.tsx'), 'utf8'), app);
  assert.equal(fs.readFileSync(path.join(entry, 'assets', 'tray.svg'), 'utf8'), '<svg/>');
  assert.equal(fs.readFileSync(path.join(entry, '..', 'Cargo.toml'), 'utf8'), '[workspace]');
  assert.equal(fs.existsSync(path.join(entry, '..', 'target')), false);
  assert.equal(fs.readFileSync(path.join(entry, '..', 'node_modules/portable-fixture/index.js'), 'utf8'), 'export const ready = true;');
  if (process.platform !== 'win32') assert.equal(fs.readlinkSync(path.join(entry, '..', 'node_modules/linked-fixture')), 'portable-fixture');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(gui, 'nsh.json'), 'utf8')), original);
});
