const puppeteer = require('/Users/emmanuelosadebe/.npm/_npx/7d92d9a2d2ccc630/node_modules/puppeteer');
const fs = require('fs');
const out = '/private/tmp/claude-501/-Users-emmanuelosadebe-Downloads-projects-hackies/dd4ce2e3-d512-40aa-b36e-d72d16bc3589/scratchpad';
const ids = process.argv.slice(2);
(async () => {
  const b = await puppeteer.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const p = await b.newPage();
  await p.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36');
  await p.setViewport({ width: 1440, height: 1000 });
  for (const id of ids) {
    let api = null;
    const h = async (r) => { if (r.url().includes(`/api/`) && r.url().includes(String(id)) && !api) { try { const t = await r.text(); if (t.includes('"name"')) api = t; } catch {} } };
    p.on('response', h);
    await p.goto(`https://dorahacks.io/buidl/${id}`, { waitUntil: 'networkidle2', timeout: 90000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 3500));
    const text = await p.evaluate(() => document.body.innerText);
    const links = await p.evaluate(() => [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.href).filter((h) => /github|youtu|vimeo|loom|vercel|netlify|\.app|\.xyz|\.io|docs|blockscout|explorer/i.test(h) && !/dorahacks/.test(h)))]);
    fs.writeFileSync(`${out}/buidl-${id}.txt`, text);
    fs.writeFileSync(`${out}/buidl-${id}.json`, JSON.stringify({ links, api: api ? api.slice(0, 60000) : null }, null, 1));
    console.log(id, 'text', text.length, 'links', links.length, links.slice(0, 8));
    p.off('response', h);
  }
  await b.close();
})();
