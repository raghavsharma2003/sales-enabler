// usage: node render.js URL OUTFILE [waitms] [clickText]
const { chromium } = require('playwright');
(async () => {
  const [url, out, waitms='6000', click] = process.argv.slice(2);
  const browser = await chromium.launch({ executablePath: undefined });
  const ctx = await browser.newContext({ locale: 'en-IN', timezoneId: 'Asia/Kolkata', geolocation:{latitude:12.97,longitude:77.59}, permissions:['geolocation'], userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36' });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(parseInt(waitms));
    if (click) { try { await page.getByText(click, {exact:false}).first().click({timeout:5000}); await page.waitForTimeout(3000);} catch(e){ console.error('click fail', e.message);} }
    const txt = await page.evaluate(() => document.body.innerText);
    require('fs').writeFileSync(out, txt);
    console.log('ok', url, txt.length);
  } catch (e) { console.error('ERR', e.message); }
  await browser.close();
})();
