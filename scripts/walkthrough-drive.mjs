#!/usr/bin/env node
// Helpers for the competitor walk-through captures kept in Google Drive.
//
// The Drive connector returns a screenshot's pixels only through download_file_content, as base64 inside a JSON
// tool result. A screenshot is always too big to come back inline, so the harness saves the result to a file and
// prints its path. These commands turn those saved results into real files without a model re-typing anything.
//
//   node scripts/walkthrough-drive.mjs decode <outdir> <saved-result.txt>...
//       writes each result's `content` (base64) to <outdir>/<title>; prints title, bytes, PNG check
//   node scripts/walkthrough-drive.mjs inventory <out.json> <vendor> <saved-search-result.txt>...
//       merges search_files pages into <out.json> under <vendor> (dedupes by id; keeps id,title,mime,size)
//   node scripts/walkthrough-drive.mjs status <root>
//       per vendor: files in the inventory vs screenshots decoded on disk
import fs from 'node:fs'
import path from 'node:path'

const [cmd, ...args] = process.argv.slice(2)
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function readJson(file) {
  const raw = fs.readFileSync(file, 'utf8').trim()
  return JSON.parse(raw)
}

if (cmd === 'decode') {
  const [outdir, ...files] = args
  fs.mkdirSync(outdir, { recursive: true })
  for (const f of files) {
    const d = readJson(f)
    if (!d.content || !d.title) { console.log(`skip ${f}: no content/title`); continue }
    const buf = Buffer.from(d.content, 'base64')
    const title = path.basename(d.title)
    fs.writeFileSync(path.join(outdir, title), buf)
    const ok = d.mimeType !== 'image/png' || buf.subarray(0, 8).equals(PNG)
    console.log(`${title}\t${buf.length}\t${ok ? 'ok' : 'BAD-SIGNATURE'}`)
  }
} else if (cmd === 'inventory') {
  const [out, vendor, ...files] = args
  const inv = fs.existsSync(out) ? readJson(out) : {}
  const have = new Map((inv[vendor] || []).map(f => [f.id, f]))
  for (const f of files) {
    for (const x of readJson(f).files || []) {
      have.set(x.id, { id: x.id, title: x.title, mime: x.mimeType, size: Number(x.fileSize || 0), parent: x.parentId })
    }
  }
  inv[vendor] = [...have.values()].sort((a, b) => a.title.localeCompare(b.title))
  fs.writeFileSync(out, JSON.stringify(inv, null, 1) + '\n')
  const n = inv[vendor]
  console.log(`${vendor}: ${n.length} files (${n.filter(x => x.mime === 'image/png').length} png, ` +
    `${n.filter(x => x.mime === 'text/plain').length} txt, ${n.filter(x => x.mime.includes('folder')).length} folders)`)
} else if (cmd === 'status') {
  const [root] = args
  const inv = readJson(path.join(root, 'inventory.json'))
  for (const [vendor, files] of Object.entries(inv)) {
    const pngs = files.filter(x => x.mime === 'image/png')
    const dir = path.join(root, vendor, 'png')
    const onDisk = fs.existsSync(dir) ? new Set(fs.readdirSync(dir)) : new Set()
    const missing = pngs.filter(x => !onDisk.has(x.title)).map(x => x.title)
    console.log(`${vendor}: ${files.length} files, ${pngs.length} png, ${pngs.length - missing.length} decoded` +
      (missing.length ? `; missing: ${missing.join(', ')}` : ''))
  }
} else {
  console.log('usage: decode <outdir> <files...> | inventory <out.json> <vendor> <files...> | status <root>')
  process.exit(1)
}
