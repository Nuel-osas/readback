const puppeteer = require('/Users/emmanuelosadebe/.npm/_npx/7d92d9a2d2ccc630/node_modules/puppeteer');
const dir = '/Users/emmanuelosadebe/Downloads/projects/hackies/hackathons/assemblyai-voice/readback/submission';
(async () => {
  const b = await puppeteer.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const p = await b.newPage();
  await p.setViewport({ width: 1920, height: 1080 });
  await p.goto(`file://${dir}/deck.html`, { waitUntil: 'networkidle0' });
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: `${dir}/readback-deck.pdf`, width: '1920px', height: '1080px', printBackground: true, pageRanges: '1-10' });
  // also a PNG of each slide for review
  const n = await p.evaluate(() => document.querySelectorAll('.s').length);
  for (let i = 0; i < n; i++) { const el = (await p.$$('.s'))[i]; await el.screenshot({ path: `/private/tmp/claude-501/-Users-emmanuelosadebe-Downloads-projects-hackies/dd4ce2e3-d512-40aa-b36e-d72d16bc3589/scratchpad/deck${i + 1}.png` }); }
  console.log('slides', n); await b.close();
})();
