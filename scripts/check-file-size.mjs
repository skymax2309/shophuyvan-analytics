import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LIMIT_BYTES = 30 * 1024
const SOURCE_ROOTS = ['apps/fe', 'apps/worker-api/src', 'scripts']
const EXTENSIONS = new Set(['.js', '.mjs', '.css', '.html', '.sql', '.md'])
const SKIP_DIRS = new Set(['node_modules', 'dist', '.wrangler', '.git'])
const SKIP_FILES = new Set(['package-lock.json'])

function collect(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(path.join(dir, entry.name), out)
      continue
    }
    if (!entry.isFile() || SKIP_FILES.has(entry.name)) continue
    if (EXTENSIONS.has(path.extname(entry.name).toLowerCase())) out.push(path.join(dir, entry.name))
  }
  return out
}

const files = SOURCE_ROOTS.flatMap(root => collect(path.join(ROOT, root)))
const oversized = files
  .map(file => ({ file, size: fs.statSync(file).size }))
  .filter(row => row.size > LIMIT_BYTES)
  .sort((a, b) => b.size - a.size)

if (oversized.length) {
  console.error('FAIL: source files over 30KB:')
  for (const row of oversized) {
    console.error(`- ${path.relative(ROOT, row.file).replace(/\\/g, '/')} ${(row.size / 1024).toFixed(1)}KB`)
  }
  process.exit(1)
}

console.log(`OK: ${files.length} source files are <= 30KB.`)

