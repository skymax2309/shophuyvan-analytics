#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = findRepoRoot(process.cwd());
const handoffDir = path.join(repoRoot, 'docs', 'handoff');
const latestPath = path.join(handoffDir, 'LATEST.md');

function findRepoRoot(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, 'AGENTS.md')) && fs.existsSync(path.join(current, 'apps'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(process.cwd());
    }
    current = parent;
  }
}

function usage(exitCode = 0) {
  const text = [
    'Usage:',
    '  node skills/shophuyvan-progress-handoff/scripts/progress-handoff.mjs write --slug <slug> < handoff.json',
    '  node skills/shophuyvan-progress-handoff/scripts/progress-handoff.mjs latest',
    '  node skills/shophuyvan-progress-handoff/scripts/progress-handoff.mjs list',
    '',
    'JSON fields: title, status, summary[], next[], files[], tests[], verification[], blockers[].',
  ].join('\n');
  (exitCode ? console.error : console.log)(text);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = { command: argv[2], slug: '' };
  for (let i = 3; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--slug') {
      args.slug = argv[i + 1] || '';
      i += 1;
    }
  }
  return args;
}

function sanitizeSlug(value) {
  return String(value || 'handoff')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'handoff';
}

function asList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (value === undefined || value === null || value === '') return [];
  return [String(value)];
}

function assertSafeText(data) {
  const raw = JSON.stringify(data);
  const forbidden = [
    /cloudflare_api_token/i,
    /api[_-]?key/i,
    /secret/i,
    /cookie/i,
    /bearer\s+[a-z0-9._-]+/i,
    /cf-[a-z0-9_-]{20,}/i,
  ];
  const hit = forbidden.find((pattern) => pattern.test(raw));
  if (hit) {
    throw new Error(`handoff appears to contain secret-like text: ${hit}`);
  }
}

function formatBullets(items, emptyText = 'None') {
  const list = asList(items);
  if (!list.length) return `- ${emptyText}`;
  return list.map((item) => `- ${item.replace(/\r?\n/g, ' ')}`).join('\n');
}

function formatHandoff(data, meta) {
  const title = String(data.title || 'Untitled handoff');
  const status = String(data.status || 'in_progress');
  return [
    `# ${title}`,
    '',
    `- Status: ${status}`,
    `- Updated: ${meta.updatedAt}`,
    `- Repo: ${repoRoot}`,
    `- Source file: ${meta.fileName}`,
    '',
    '## Summary',
    formatBullets(data.summary, 'No summary recorded'),
    '',
    '## Next Actions',
    formatBullets(data.next, 'No next action recorded'),
    '',
    '## Files',
    formatBullets(data.files, 'No file recorded'),
    '',
    '## Tests',
    formatBullets(data.tests, 'No test recorded'),
    '',
    '## Verification',
    formatBullets(data.verification, 'No verification recorded'),
    '',
    '## Blockers',
    formatBullets(data.blockers),
    '',
    '## Resume Prompt',
    `Continue "${title}" from this handoff. Re-read AGENTS.md, the relevant ShopHuyVan guards, and verify any drift-prone facts before editing or reporting pass.`,
    '',
  ].join('\n');
}

function readStdin() {
  return fs.readFileSync(0, 'utf8').trim();
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
}

function writeHandoff(slug) {
  const input = readStdin();
  if (!input) throw new Error('write requires JSON from stdin');
  const data = JSON.parse(input);
  assertSafeText(data);
  fs.mkdirSync(handoffDir, { recursive: true });
  const fileName = `${timestamp()}-${sanitizeSlug(slug || data.title)}.md`;
  const target = path.join(handoffDir, fileName);
  const markdown = formatHandoff(data, {
    updatedAt: new Date().toISOString(),
    fileName,
  });
  fs.writeFileSync(target, markdown, 'utf8');
  fs.writeFileSync(latestPath, markdown, 'utf8');
  console.log(JSON.stringify({ ok: true, latest: latestPath, file: target }, null, 2));
}

function readLatest() {
  if (!fs.existsSync(latestPath)) {
    console.error(`No handoff found at ${latestPath}`);
    process.exit(1);
  }
  process.stdout.write(fs.readFileSync(latestPath, 'utf8'));
}

function listHandoffs() {
  if (!fs.existsSync(handoffDir)) {
    console.log('No handoff directory yet.');
    return;
  }
  const files = fs.readdirSync(handoffDir)
    .filter((name) => name.endsWith('.md') && name !== 'LATEST.md')
    .sort()
    .slice(-20)
    .reverse();
  if (!files.length) {
    console.log('No handoff files yet.');
    return;
  }
  console.log(files.join('\n'));
}

try {
  const args = parseArgs(process.argv);
  if (!args.command || args.command === 'help' || args.command === '--help') usage();
  if (args.command === 'write') writeHandoff(args.slug);
  else if (args.command === 'latest') readLatest();
  else if (args.command === 'list') listHandoffs();
  else usage(1);
} catch (error) {
  console.error(`[progress-handoff] ${error.message}`);
  process.exit(1);
}
