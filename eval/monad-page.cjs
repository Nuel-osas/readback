const puppeteer = require('/Users/emmanuelosadebe/.npm/_npx/7d92d9a2d2ccc630/node_modules/puppeteer');
const out = '/private/tmp/claude-501/-Users-emmanuelosadebe-Downloads-projects-hackies/dd4ce2e3-d512-40aa-b36e-d72d16bc3589/scratchpad';
(async () => {
  const b = await puppeteer.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 1000 });
  for (const [n, u] of [['metropolis', 'https://monad.xyz/developers/hackathons/metropolis'], ['hackathon', 'https://hackathon.monad.xyz/']]) {
    await p.goto(u, { waitUntil: 'networkidle2', timeout: 90000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 3000));
    // expand any accordions
    await p.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
    const t = await p.evaluate(() => document.body.innerText);
    require('fs').writeFileSync(`${out}/monad-${n}.txt`, t); console.log(n, t.length);
  }
  await b.close();
})();
