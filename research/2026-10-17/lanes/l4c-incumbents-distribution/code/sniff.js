const { chromium } = require('playwright');
(async () => {
  const [url] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await (await browser.newContext({locale:'en-IN'})).newPage();
  page.on('response', async r => { const u=r.url(); const ct=r.headers()['content-type']||''; if (/json|javascript/.test(ct) && /pric|plan|currency|geo|country/i.test(u)) console.log(r.status(), u.slice(0,200)); });
  await page.goto(url,{waitUntil:'networkidle',timeout:60000}).catch(e=>console.error(e.message));
  await browser.close();
})();
