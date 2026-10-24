// Static files (open.2026-10-24.static-cache-for-samples): hashed build assets are immutable; index.html, the samples
// manifest and every other file are revalidated (no-cache + ETag, 304 when unchanged); audio answers byte ranges (206)
// and refuses impossible ones (416). No database: the app is built with no modules and an unused pool.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { buildApp } from '../server/app.ts';

let root = '', base = '', close: () => Promise<void> = async () => {};
const clip = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'vp-static-'));
  await mkdir(join(root, 'assets', 'chunks'), { recursive: true });
  await mkdir(join(root, 'samples'));
  await writeFile(join(root, 'index.html'), '<!doctype html><title>VP</title>');
  await writeFile(join(root, 'assets', 'main-AWJYIGNI.js'), 'console.log(1)');
  await writeFile(join(root, 'assets', 'chunks', 'page-3F7Q2KXA.js'), 'console.log(2)');
  await writeFile(join(root, 'build.json'), '{}');
  await writeFile(join(root, 'samples', 'manifest.json'), '{"v2-flashlite":{}}');
  await writeFile(join(root, 'samples', 'v2-flashlite.ogg'), clip);
  const { server } = buildApp(new pg.Pool({ connectionString: 'postgresql://unused@/unused' }), [], { webRoot: root });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => new Promise(r => server.close(() => r()));
});
after(async () => { await close(); await rm(root, { recursive: true, force: true }); });

test('only hashed build assets are immutable; the manifest, samples, index and other files are revalidated', async () => {
  const cc = async (p: string) => (await fetch(base + p)).headers.get('cache-control');
  assert.equal(await cc('/assets/main-AWJYIGNI.js'), 'public, max-age=31536000, immutable');
  assert.equal(await cc('/assets/chunks/page-3F7Q2KXA.js'), 'public, max-age=31536000, immutable');
  assert.equal(await cc('/samples/manifest.json'), 'no-cache');
  assert.equal(await cc('/samples/v2-flashlite.ogg'), 'no-cache');
  assert.equal(await cc('/'), 'no-cache');
  assert.equal(await cc('/agents/some-page'), 'no-cache', 'the app shell for a route');
  assert.equal(await cc('/build.json'), 'no-cache', 'an unhashed file is never immutable');
  assert.equal((await fetch(base + '/samples/nope.ogg')).status, 404);
});

test('an unchanged file answers 304 to its ETag; a changed one is served again', async () => {
  const first = await fetch(base + '/samples/manifest.json');
  const etag = first.headers.get('etag')!;
  assert.match(etag, /^W\/"[0-9a-f]+-[0-9a-f]+"$/);
  const again = await fetch(base + '/samples/manifest.json', { headers: { 'if-none-match': etag } });
  assert.equal(again.status, 304);
  await new Promise(r => setTimeout(r, 20));
  await writeFile(join(root, 'samples', 'manifest.json'), '{"v2-flashlite":{},"v2-mai":{}}');
  const changed = await fetch(base + '/samples/manifest.json', { headers: { 'if-none-match': etag } });
  assert.equal(changed.status, 200, 'a re-written manifest is seen at once, with no query string');
  assert.deepEqual(Object.keys(await changed.json()), ['v2-flashlite', 'v2-mai']);
});

test('audio answers byte ranges: 206 with Content-Range, suffix ranges, and 416 for impossible ones', async () => {
  const full = await fetch(base + '/samples/v2-flashlite.ogg');
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('accept-ranges'), 'bytes');
  assert.equal(full.headers.get('content-length'), '1000');
  assert.equal(full.headers.get('content-type'), 'audio/ogg');

  const part = await fetch(base + '/samples/v2-flashlite.ogg', { headers: { range: 'bytes=100-199' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), 'bytes 100-199/1000');
  assert.equal(part.headers.get('content-length'), '100');
  assert.deepEqual(Buffer.from(await part.arrayBuffer()), clip.subarray(100, 200));

  const open = await fetch(base + '/samples/v2-flashlite.ogg', { headers: { range: 'bytes=900-' } });
  assert.equal(open.headers.get('content-range'), 'bytes 900-999/1000');
  const tail = await fetch(base + '/samples/v2-flashlite.ogg', { headers: { range: 'bytes=-10' } });
  assert.equal(tail.headers.get('content-range'), 'bytes 990-999/1000');
  assert.deepEqual(Buffer.from(await tail.arrayBuffer()), clip.subarray(990));
  const past = await fetch(base + '/samples/v2-flashlite.ogg', { headers: { range: 'bytes=5000-6000' } });
  assert.equal(past.status, 416);
  assert.equal(past.headers.get('content-range'), 'bytes */1000');
  const junk = await fetch(base + '/samples/v2-flashlite.ogg', { headers: { range: 'bytes=abc' } });
  assert.equal(junk.status, 416);
  const head = await fetch(base + '/samples/v2-flashlite.ogg', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), '1000');
});
