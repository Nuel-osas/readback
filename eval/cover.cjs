const puppeteer = require('/Users/emmanuelosadebe/.npm/_npx/7d92d9a2d2ccc630/node_modules/puppeteer');
(async () => {
  const b = await puppeteer.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--hide-scrollbars'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await p.goto('https://readback-phi.vercel.app/', { waitUntil: 'networkidle2' });
  // wait for the hero strip to reach a STOP verdict, the brand's defining moment
  await p.waitForFunction(() => document.querySelector('.strip .verdict.stop'), { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));
  await p.screenshot({ path: 'submission/cover.png' });
  await b.close();
})();
