import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIMIT_BYTES = 30 * 1024;
const WARN_BYTES = 28 * 1024;
const CODE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.css', '.html', '.py', '.ps1']);
const SKIP_DIRS = new Set([
  '.git',
  '.wrangler',
  'node_modules',
  '__pycache__',
  '.pytest_cache',
  '.browser-profiles',
  'profiles',
  'browser',
  'tmp',
  'cache',
  'logs',
  'runtime',
  'runtime_jobs',
  'desktop_archive',
  'artifacts',
  'auto',
  'auto OMS Python',
  'shophuyvan-runtime',
  'shophuyvan-python-automation'
]);

function toDisplayPath(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function shouldSkipDir(name) {
  return SKIP_DIRS.has(name) || name.startsWith('.codex-chrome-');
}

function collectFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!shouldSkipDir(entry.name)) collectFiles(path.join(dir, entry.name), out);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (CODE_EXTENSIONS.has(ext)) out.push(path.join(dir, entry.name));
  }
  return out;
}

const files = collectFiles(ROOT);
const oversized = files
  .map(file => ({ file, size: fs.statSync(file).size }))
  .filter(row => row.size > LIMIT_BYTES)
  .sort((a, b) => b.size - a.size);

const warnings = files
  .map(file => ({ file, size: fs.statSync(file).size }))
  .filter(row => row.size > WARN_BYTES && row.size <= LIMIT_BYTES)
  .sort((a, b) => b.size - a.size);

if (!oversized.length) {
  if (warnings.length) {
    console.warn('WARN: code files over 28KB should be split before they reach 30KB:');
    for (const row of warnings) {
      console.warn(`- ${toDisplayPath(row.file)} ${(row.size / 1024).toFixed(1)}KB`);
    }
  }
  console.log('OK: no code file exceeds 30KB.');
  process.exit(0);
}

console.error('FAIL: code files over 30KB:');
for (const row of oversized) {
  console.error(`- ${toDisplayPath(row.file)} ${(row.size / 1024).toFixed(1)}KB`);
}
process.exit(1);
