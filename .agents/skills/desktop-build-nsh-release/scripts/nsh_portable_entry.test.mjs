import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { prepareNshPortableEntry } from './nsh_portable_entry.mjs';

test('portable_entry_keeps_mixed_core_without_registering_desktop_schemes', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nsh-portable-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const gui = path.join(root, 'member');
  fs.mkdirSync(gui);
  const original = { name: 'Example', rust: '.', window: { closeOnPress: false },
    schemes: ['app-example'], singleInstance: true, capabilities: { windows: { kinds: ['normal'] }, statusBar: true } };
  fs.writeFileSync(path.join(gui, 'App.tsx'), 'mount(() => null);\n');
  fs.writeFileSync(path.join(gui, 'nsh.json'), JSON.stringify(original));
  const entry = prepareNshPortableEntry(gui, root);
  const portable = JSON.parse(fs.readFileSync(path.join(entry, 'nsh.json'), 'utf8'));
  assert.deepEqual(portable, { name: 'Example', rust: '../member', capabilities: { statusBar: true } });
  assert.equal(fs.readFileSync(path.join(entry, 'App.tsx'), 'utf8'), 'import "../member/App.tsx";\n');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(gui, 'nsh.json'), 'utf8')), original);
});
