import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');
const [,, outdir, listfile] = process.argv;
const urls = fs.readFileSync(listfile, 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36', locale: 'en-IN' });
const page = await ctx.newPage();
for (const u of urls) {
  const id = (u.match(/comments\/([a-z0-9]+)/) || [])[1] || 'x';
  const fn = `${outdir}/${id}.json`;
  if (fs.existsSync(fn)) continue;
  try {
    await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3500);
    await page.mouse.wheel(0, 5000); await page.waitForTimeout(1500); await page.waitForTimeout(20000);
    const d = await page.evaluate(() => {
      const post = document.querySelector('shreddit-post');
      const title = post ? post.getAttribute('post-title') : document.title;
      const created = post ? post.getAttribute('created-timestamp') : null;
      const sub = post ? post.getAttribute('subreddit-prefixed-name') : null;
      const score = post ? post.getAttribute('score') : null;
      const bodyEl = document.querySelector('shreddit-post [slot="text-body"]');
      const body = bodyEl ? bodyEl.innerText : '';
      const comments = [];
      document.querySelectorAll('shreddit-comment').forEach(c => {
        const t = c.querySelector('[slot="comment"]');
        comments.push({ depth: c.getAttribute('depth'), score: c.getAttribute('score'), created: c.querySelector('time') ? c.querySelector('time').getAttribute('datetime') : null, text: t ? t.innerText.trim().slice(0, 1500) : '' });
      });
      return { title, created, sub, score, body: body.slice(0, 5000), comments };
    });
    d.url = u;
    fs.writeFileSync(fn, JSON.stringify(d));
    console.log(id, (d.title || '').slice(0, 60), d.comments.length);
  } catch (e) { console.log('ERR', u, String(e).slice(0, 100)); }
}
await b.close();
