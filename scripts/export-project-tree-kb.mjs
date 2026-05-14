import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNTIME_ROOT = process.env.SHOPHUYVAN_RUNTIME_DIR || 'E:\\shophuyvan-runtime';
const OUT_DIR = path.join(RUNTIME_ROOT, 'debug-payloads', 'project-tree');
const OUT_FILE = path.join(OUT_DIR, `project-tree-kb-${new Date().toISOString().slice(0, 10)}.txt`);
const WARN_BYTES = 28 * 1024;
const LIMIT_BYTES = 30 * 1024;
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

function shouldSkipDir(name) {
  return SKIP_DIRS.has(name) || name.startsWith('.codex-chrome-');
}

function sizeLabel(filePath) {
  const size = fs.statSync(filePath).size;
  const kb = (size / 1024).toFixed(1);
  if (size > LIMIT_BYTES) return `${kb}KB - Vượt ngưỡng 30KB`;
  if (size >= WARN_BYTES) return `${kb}KB - Cảnh báo 28KB`;
  return `${kb}KB`;
}

function groupLabel(relPath) {
  const normalized = relPath.replace(/\\/g, '/');
  if (normalized.startsWith('apps/worker-api/src/core/')) return 'Core';
  if (normalized.startsWith('apps/worker-api/src/routes/')) return 'Backend route/tính năng';
  if (normalized.startsWith('apps/worker-api/src/platforms/')) return 'Backend theo sàn';
  if (normalized.startsWith('apps/fe/js/dashboard/')) return 'Frontend dashboard/tính năng';
  if (normalized.startsWith('apps/fe/js/admin/shops/')) return 'Frontend shop/API';
  if (normalized.startsWith('apps/fe/js/admin/variations/')) return 'Frontend SKU đa sàn';
  if (normalized.startsWith('apps/fe/js/admin/sku')) return 'Frontend sản phẩm kho';
  if (normalized.startsWith('apps/fe/css/sku/')) return 'CSS sản phẩm kho';
  if (normalized.startsWith('apps/worker-api/src/shared/')) return 'Backend shared';
  if (normalized.startsWith('apps/fe/js/shared/')) return 'Frontend shared';
  return 'Khác';
}

function walk(dir, prefix = '', lines = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => !(entry.isDirectory() && shouldSkipDir(entry.name)))
    .sort((a, b) => Number(a.isFile()) - Number(b.isFile()) || a.name.localeCompare(b.name));

  entries.forEach((entry, index) => {
    const isLast = index === entries.length - 1;
    const pointer = isLast ? '`-- ' : '|-- ';
    const nextPrefix = prefix + (isLast ? '    ' : '|   ');
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      lines.push(`${prefix}${pointer}${entry.name}/`);
      walk(fullPath, nextPrefix, lines);
    } else if (entry.isFile()) {
      const rel = path.relative(ROOT, fullPath);
      lines.push(`${prefix}${pointer}${entry.name} (${sizeLabel(fullPath)}) [${groupLabel(rel)}]`);
    }
  });
  return lines;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const lines = [
  `ShopHuyVan source tree - ${new Date().toISOString()}`,
  'Ghi chú: bỏ qua .git, node_modules, .wrangler, profile/cache/log/runtime/artifacts để cây tập trung vào source vận hành.',
  '.',
  ...walk(ROOT)
];
fs.writeFileSync(OUT_FILE, lines.join('\n'), 'utf8');
console.log(OUT_FILE);
