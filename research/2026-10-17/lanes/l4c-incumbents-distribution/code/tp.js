const { chromium } = require('playwright');
(async () => {
  const [domain, out, pages='3'] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await (await browser.newContext({userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'})).newPage();
  const rows=[];
  for (let p=1;p<=parseInt(pages);p++){
    const url=`https://www.trustpilot.com/review/${domain}?page=${p}&sort=recency`;
    try{
      const resp = await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
      await page.waitForTimeout(2500);
      const data = await page.evaluate(()=>{
        const nd=document.querySelector('#__NEXT_DATA__'); if(!nd) return null;
        try{const j=JSON.parse(nd.textContent); const pp=j.props.pageProps; 
          return {summary: pp.businessUnit? {name:pp.businessUnit.displayName, n:pp.businessUnit.numberOfReviews, score:pp.businessUnit.trustScore}:null,
           reviews:(pp.reviews||[]).map(r=>({date:r.dates&&r.dates.publishedDate, stars:r.rating, title:r.title, text:r.text, country:r.consumer&&r.consumer.countryCode}))};}catch(e){return {err:e.message}}
      });
      if(!data){console.error('no data',url, resp&&resp.status()); break;}
      if(p===1) console.log(domain, JSON.stringify(data.summary));
      if(!data.reviews||!data.reviews.length) break;
      data.reviews.forEach(r=>rows.push({domain,url,...r}));
    }catch(e){console.error('ERR',url,e.message.slice(0,80)); break;}
  }
  require('fs').writeFileSync(out, JSON.stringify(rows));
  console.log(domain,'reviews',rows.length);
  await browser.close();
})();
