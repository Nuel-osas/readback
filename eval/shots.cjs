const puppeteer = require('/Users/emmanuelosadebe/.npm/_npx/7d92d9a2d2ccc630/node_modules/puppeteer');
const url = process.argv[2] || 'http://127.0.0.1:4312/';
const out = process.argv[3] || '/private/tmp/claude-501/-Users-emmanuelosadebe-Downloads-projects-hackies/dd4ce2e3-d512-40aa-b36e-d72d16bc3589/scratchpad';
(async () => {
  const b = await puppeteer.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--hide-scrollbars'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await p.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 4200)); // let the strip reach its verdict
  await p.screenshot({ path: `${out}/l1.png` });
  const H = await p.evaluate(() => document.body.scrollHeight);
  let i = 2;
  for (let y = 900; y < H && i < 9; y += 900, i++) {
    await p.evaluate((y) => { window.scrollTo(0, y); document.querySelectorAll('.reveal').forEach((e) => e.classList.add('in')); }, y);
    await new Promise((r) => setTimeout(r, 900));
    await p.screenshot({ path: `${out}/l${i}.png` });
  }
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await p.evaluate(() => window.scrollTo(0, 0)); await new Promise((r) => setTimeout(r, 1500));
  await p.screenshot({ path: `${out}/mobile.png` });
  console.log('page height', H, 'shots', i - 1);
  await b.close();
})();
