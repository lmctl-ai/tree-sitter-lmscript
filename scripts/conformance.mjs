#!/usr/bin/env node
/** Parse every tracked .lms in the configured mono and skills roots. */
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const cli = process.env.TREE_SITTER ?? join(root, 'node_modules', '.bin', 'tree-sitter');
const mono = resolve(process.env.MONO_ROOT ?? join(root, '..', 'lmctl-mono-v6entries'));
const skills = resolve(process.env.SKILLS_ROOT ?? join(root, '..', '..', 'skills-scripts'));
const monoExamples = join(mono, 'lmscript', 'examples');
const dirs = [monoExamples, ...['lms-driven', 'lms-lib', 'lms-adhoc', 'quickrun', 'tests'].map(name => join(skills, name))];
const files = [];
function visit(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (entry.isFile() && file.endsWith('.lms')) files.push(file);
  }
}
for (const dir of dirs) visit(dir);
files.sort();
if (!files.length) throw new Error(`no .lms files found; set MONO_ROOT and SKILLS_ROOT (looked in ${dirs.join(', ')})`);
const failures = [];
const library = process.env.TREE_SITTER_LIB ?? join(root, '.build', 'parser.so');
if (!process.env.TREE_SITTER_LIB) {
  const generated = spawnSync(cli, ['generate'], { cwd: root, encoding: 'utf8' });
  if (generated.status !== 0) throw new Error(generated.stderr || 'tree-sitter generate failed');
  const built = spawnSync(cli, ['build', '--output', library], { cwd: root, encoding: 'utf8' });
  if (built.status !== 0) throw new Error(built.stderr || 'tree-sitter build failed');
}
for (const file of files) {
  const result = spawnSync(cli, ['parse', '--xml', '--no-ranges', '-l', library, '--lang-name', 'lmscript', file], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const output = result.stdout ?? '';
  // XML is used instead of matching human pretty output, so literal text containing ERROR is harmless.
  const bad = /<ERROR(?:\s|>)/.test(output) || /<MISSING(?:\s|>)/.test(output);
  if (result.error) failures.push({ file, status: null, error: result.error.message });
  if (result.status !== 0 || bad) failures.push({ file, status: result.status, error: bad ? 'ERROR/MISSING node' : (result.stderr || `exit ${result.status}`) });
}
const manifest = files.map(file => ({ file: relative(process.cwd(), file), sha256: createHash('sha256').update(readFileSync(file)).digest('hex') }));
if (process.env.WRITE_MANIFEST) {
  const out = resolve(process.env.WRITE_MANIFEST);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(out, JSON.stringify({ mono, skills, files: manifest }, null, 2) + '\n');
}
console.log(`Parsed ${files.length} .lms files`);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure.file}: ${failure.error}`);
  process.exit(1);
}
console.log('PASS zero ERROR/MISSING nodes');
