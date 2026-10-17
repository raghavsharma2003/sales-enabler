const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await page.goto('https://www.leadsquared.com/integrations/',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(6000);
  for (const cat of ['Cloud Telephony','Messaging (SMS/ Chat/ Whatsapp)','Chatbot']) {
    try {
      await page.getByText(cat,{exact:true}).first().click({timeout:5000});
      await page.waitForTimeout(3000);
      const t = await page.evaluate(()=>document.body.innerText);
      const m = t.match(/Showing[^\n]*of\s*\d+/); 
      const names=[...t.matchAll(/CLOUD TELEPHONY\n([^\n]+)/g)].map(x=>x[1]).slice(0,20);
      console.log(cat, m?m[0]:'no count', names.join(' | '));
      await page.getByText(cat,{exact:true}).first().click({timeout:5000}); await page.waitForTimeout(1500);
    } catch(e){console.log(cat,'ERR',e.message.slice(0,100));}
  }
  await browser.close();
})();
