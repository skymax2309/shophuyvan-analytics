import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PAGES_DIR = path.join(ROOT, 'apps/fe/pages')
const MAX_INLINE_LINES = 3
const MAX_STYLE_ATTRS = 100

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/')
}

function tagBody(tag) {
  return tag.replace(/^<[^>]+>/, '').replace(/<\/(?:script|style)>\s*$/i, '')
}

function lineCount(text) {
  return text.split(/\r?\n/).filter(line => line.trim()).length
}

function linkedPath(pageFile, src) {
  if (!src || /^(https?:)?\/\//i.test(src) || src.startsWith('data:')) return null
  return path.resolve(path.dirname(pageFile), src.split(/[?#]/)[0])
}

const errors = []
const warnings = []
const checkedJs = new Set()
const pages = fs.readdirSync(PAGES_DIR)
  .filter(name => name.endsWith('.html'))
  .map(name => path.join(PAGES_DIR, name))

function checkJsImports(file) {
  const realFile = path.resolve(file)
  if (checkedJs.has(realFile) || !realFile.endsWith('.js')) return
  checkedJs.add(realFile)
  const source = fs.readFileSync(realFile, 'utf8')
  const imports = [
    ...source.matchAll(/(?:from\s+|import\s*\()["']([^"']+)["']/g)
  ]
  for (const match of imports) {
    const spec = match[1]
    if (!spec.startsWith('.') || /^(https?:)?\/\//i.test(spec) || spec.startsWith('data:')) continue
    const target = path.resolve(path.dirname(realFile), spec.split(/[?#]/)[0])
    if (!fs.existsSync(target)) {
      errors.push(`${rel(realFile)} imports missing asset ${spec}.`)
      continue
    }
    checkJsImports(target)
  }
}

for (const page of pages) {
  const html = fs.readFileSync(page, 'utf8')
  const styleTags = html.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) || []
  for (const tag of styleTags) {
    if (lineCount(tagBody(tag)) > MAX_INLINE_LINES) {
      errors.push(`${rel(page)} contains a large inline <style> block.`)
    }
  }

  const inlineScripts = html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi) || []
  for (const tag of inlineScripts) {
    if (lineCount(tagBody(tag)) > MAX_INLINE_LINES) {
      errors.push(`${rel(page)} contains a large inline <script> block.`)
    }
  }

  const styleAttrs = html.match(/\sstyle\s*=/gi) || []
  if (styleAttrs.length > MAX_STYLE_ATTRS) {
    errors.push(`${rel(page)} has ${styleAttrs.length} inline style attributes.`)
  } else if (styleAttrs.length) {
    warnings.push(`${rel(page)} still has ${styleAttrs.length} small inline style attributes.`)
  }

  const assetTags = [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi)]
  for (const match of assetTags) {
    const target = linkedPath(page, match[1])
    if (target && !fs.existsSync(target)) {
      errors.push(`${rel(page)} links missing asset ${match[1]}.`)
    } else if (target && target.endsWith('.js')) {
      checkJsImports(target)
    }
  }
}

if (warnings.length) {
  console.warn('WARN: FE separation follow-up:')
  for (const item of warnings) console.warn(`- ${item}`)
}

if (errors.length) {
  console.error('FAIL: FE separation check failed:')
  for (const item of errors) console.error(`- ${item}`)
  process.exit(1)
}

console.log(`OK: checked ${pages.length} FE pages for large inline CSS/JS, broken links, and local JS imports.`)
