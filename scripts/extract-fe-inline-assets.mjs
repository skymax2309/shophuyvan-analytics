import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PAGES_DIR = path.join(ROOT, 'apps/fe/pages')
const CSS_ROOT = path.join(ROOT, 'apps/fe/css/features')
const JS_ROOT = path.join(ROOT, 'apps/fe/js/features')
const MAX_INLINE_LINES = 3

function slugFromPage(file) {
  return path.basename(file, '.html').replace(/[^a-z0-9-]+/gi, '-').toLowerCase()
}

function tagBody(tag) {
  return tag.replace(/^<[^>]+>/, '').replace(/<\/(?:script|style)>\s*$/i, '').trim()
}

function lineCount(text) {
  return text.split(/\r?\n/).filter(line => line.trim()).length
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function writeAsset(dir, name, body) {
  ensureDir(dir)
  fs.writeFileSync(path.join(dir, name), `${body.trim()}\n`, 'utf8')
}

for (const pageName of fs.readdirSync(PAGES_DIR).filter(name => name.endsWith('.html'))) {
  const pageFile = path.join(PAGES_DIR, pageName)
  const slug = slugFromPage(pageFile)
  let html = fs.readFileSync(pageFile, 'utf8')
  let styleIndex = 0
  let scriptIndex = 0

  html = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, tag => {
    const body = tagBody(tag)
    if (lineCount(body) <= MAX_INLINE_LINES) return tag
    styleIndex += 1
    const fileName = `${slug}-inline-${styleIndex}.css`
    writeAsset(path.join(CSS_ROOT, slug), fileName, body)
    return `<link rel="stylesheet" href="../css/features/${slug}/${fileName}?v=fe-split-20260514">`
  })

  html = html.replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, tag => {
    const body = tagBody(tag)
    if (lineCount(body) <= MAX_INLINE_LINES) return tag
    scriptIndex += 1
    const fileName = `${slug}-inline-${scriptIndex}.js`
    writeAsset(path.join(JS_ROOT, slug), fileName, body)
    return `<script src="../js/features/${slug}/${fileName}?v=fe-split-20260514"></script>`
  })

  if (styleIndex || scriptIndex) {
    fs.writeFileSync(pageFile, html, 'utf8')
    console.log(`${pageName}: extracted ${styleIndex} style block(s), ${scriptIndex} script block(s)`)
  }
}

