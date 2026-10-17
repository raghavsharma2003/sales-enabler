import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');
const [,, outdir, maxPages, ...domains] = process.argv;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36' });
const page = await ctx.newPage();
for (const domain of domains) {
  const rows = []; let summary = null;
  for (let p = 1; p <= parseInt(maxPages); p++) {
    const url = `https://www.trustpilot.com/review/${domain}?page=${p}&sort=recency`;
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(2500);
      const data = await page.evaluate(() => {
        const nd = document.querySelector('#__NEXT_DATA__'); if (!nd) return null;
        try { const j = JSON.parse(nd.textContent); const pp = j.props.pageProps;
          return { summary: pp.businessUnit ? { name: pp.businessUnit.displayName, n: pp.businessUnit.numberOfReviews, score: pp.businessUnit.trustScore } : null,
            reviews: (pp.reviews || []).map(r => ({ date: r.dates && r.dates.publishedDate, stars: r.rating, title: r.title, text: r.text, country: r.consumer && r.consumer.countryCode })) };
        } catch (e) { return { err: e.message }; }
      });
      if (!data) { console.log('nodata', domain, resp && resp.status()); break; }
      if (p === 1) summary = data.summary;
      if (!data.reviews || !data.reviews.length) break;
      data.reviews.forEach(r => rows.push({ domain, url: `https://www.trustpilot.com/review/${domain}`, ...r }));
      if (data.reviews.length < 20) break;
    } catch (e) { console.log('ERR', domain, String(e).slice(0, 100)); break; }
  }
  fs.writeFileSync(`${outdir}/tp-${domain}.json`, JSON.stringify({ summary, rows }));
  console.log(domain, JSON.stringify(summary), rows.length);
}
await b.close();
