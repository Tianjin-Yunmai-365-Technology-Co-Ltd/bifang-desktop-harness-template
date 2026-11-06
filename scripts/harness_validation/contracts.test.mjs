/** 文档路由只绑定稳定引用和命令，允许等义措辞，非法文件与删除合同仍失败。 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOT } from './core.mjs';
import { validateGovernanceDocuments } from './contracts.mjs';

/** 两份副本只注入文档读取，其他安全扫描与 Skill 合同继续使用真实源。 */
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-contract-documents-'));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  const paths = { agentsPath: path.join(root, 'AGENTS.md'), engineeringRulesPath: path.join(root, 'ENGINEERING_RULES.md') };
  fs.copyFileSync(path.join(ROOT, 'AGENTS.md'), paths.agentsPath);
  fs.copyFileSync(path.join(ROOT, 'docs/ENGINEERING_RULES.md'), paths.engineeringRulesPath);
  return paths;
}

/** 相同语义以不同中文表达不改变本函数的路由与命令合同。 */
test('governance_documents_allow_equivalent_prose', t => {
  const paths = fixture(t);
  const edits = [
    ['agentsPath', '仅当前 Harness 上游工程的工程自动化使用 Node.js 标准库', '上游工程 helper 采用 Node.js 内置模块'],
    ['engineeringRulesPath', 'Core-first 是硬规则', '共享核心优先为强制架构约束'],
    ['engineeringRulesPath', 'Node.js 是所有接口组合的受管工程运行时', '各接口统一采用 Node.js 运行工程工具'],
    ['engineeringRulesPath', '仅 Harness 上游源树禁止 Python 源码、解释器、包管理器、虚拟环境、第三方包和 Python 运行步骤', 'Python 自动化禁令只约束当前上游源树'],
    ['engineeringRulesPath', '初始化和升级均不得把该检查器及上游专用禁令传播到终端下游', '下游创建与升级都排除此源专用检查器和限制'],
    ['engineeringRulesPath', 'Rust 代码：400 行', 'Rust 的建议阈值为 400 行'],
    ['engineeringRulesPath', '前端代码：500 行', '前端的建议阈值为 500 行'],
    ['engineeringRulesPath', '其他人工维护文本：500 行', '其他文本的建议阈值为 500 行'],
  ];
  for (const [key, before, after] of edits) {
    const source = fs.readFileSync(paths[key], 'utf8'); assert.ok(source.includes(before));
    fs.writeFileSync(paths[key], source.replaceAll(before, after));
  }
  const errors = []; validateGovernanceDocuments(errors, paths);
  assert.deepEqual(errors, []);
});

/** 事实源指针与实际检查命令仍不可从入口或规则中移除。 */
test('governance_documents_reject_missing_stable_contracts', t => {
  for (const [key, fragment] of [
    ['agentsPath', 'docs/AGENT_POLICY.md'], ['agentsPath', 'docs/ENGINEERING_RULES.md'],
    ['agentsPath', '$desktop-implement-change'], ['agentsPath', 'node scripts/run_harness_tests.mjs'],
    ['engineeringRulesPath', 'check_no_python.mjs --root .'], ['engineeringRulesPath', 'node scripts/validate_harness.mjs --release-review'],
  ]) {
    const paths = fixture(t); fs.writeFileSync(paths[key], fs.readFileSync(paths[key], 'utf8').replaceAll(fragment, 'removed'));
    const errors = []; validateGovernanceDocuments(errors, paths);
    assert.ok(errors.some(error => error.includes(fragment)), errors.join('\n'));
  }
});

/** 缺文件、链接、NUL 和坏编码都不能因文案宽松而绕过普通文本校验。 */
test('governance_documents_fail_closed_on_invalid_sources', t => {
  for (const malformed of ['missing', 'nul', 'utf8', 'symlink']) {
    const paths = fixture(t);
    if (malformed === 'missing') fs.unlinkSync(paths.agentsPath);
    if (malformed === 'nul') fs.writeFileSync(paths.agentsPath, Buffer.from([0]));
    if (malformed === 'utf8') fs.writeFileSync(paths.agentsPath, Buffer.from([0xc3, 0x28]));
    if (malformed === 'symlink') {
      fs.unlinkSync(paths.agentsPath);
      try { fs.symlinkSync(paths.engineeringRulesPath, paths.agentsPath); }
      catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.diagnostic(`符号链接能力不可用：${error.code}`); continue; } throw error; }
    }
    const errors = []; validateGovernanceDocuments(errors, paths); assert.ok(errors.length);
  }
});
