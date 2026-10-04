const puppeteer = require('/Users/emmanuelosadebe/.npm/_npx/7d92d9a2d2ccc630/node_modules/puppeteer');
const out = '/private/tmp/claude-501/-Users-emmanuelosadebe-Downloads-projects-hackies/dd4ce2e3-d512-40aa-b36e-d72d16bc3589/scratchpad';
(async () => {
  const b = await puppeteer.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--hide-scrollbars'] });
  const p = await b.newPage();
  await p.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36');
  await p.setViewport({ width: 1440, height: 1000 });
  const api = [];
  p.on('response', async (r) => { const u = r.url(); if (/api/.test(u) && /winner|prize|award|result/i.test(u)) { try { api.push({ u, body: (await r.text()).slice(0, 20000) }); } catch {} } });
  for (const tab of ['winner', 'detail']) {
    await p.goto(`https://dorahacks.io/hackathon/buidl-ctc-2026-fall/${tab}`, { waitUntil: 'networkidle2', timeout: 90000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 4000));
    const text = await p.evaluate(() => document.body.innerText);
    require('fs').writeFileSync(`${out}/dora-${tab}.txt`, text);
    await p.screenshot({ path: `${out}/dora-${tab}.png`, fullPage: true });
    console.log(tab, 'chars', text.length);
  }
  require('fs').writeFileSync(`${out}/dora-api.json`, JSON.stringify(api, null, 1));
  console.log('api hits', api.length, api.map((a) => a.u).slice(0, 6));
  await b.close();
})();
