// A two-turn conversation in a real browser. The simulated microphone is a live MediaStream
// that stays silent until the harness makes it "say" a clip, exactly when a person would:
// after the question, and again after the verdict asks for confirmation.
const puppeteer = require('/Users/emmanuelosadebe/.npm/_npx/7d92d9a2d2ccc630/node_modules/puppeteer');
const fs = require('fs');
const [scene, first, second, shot] = process.argv.slice(2);
const out = '/private/tmp/claude-501/-Users-emmanuelosadebe-Downloads-projects-hackies/dd4ce2e3-d512-40aa-b36e-d72d16bc3589/scratchpad';
(async () => {
  const b = await puppeteer.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'] });
  const p = await b.newPage();
  const clips = { '/__a.wav': fs.readFileSync(first), '/__b.wav': second ? fs.readFileSync(second) : null };
  await p.setRequestInterception(true);
  p.on('request', (r) => { const k = Object.keys(clips).find((c) => r.url().endsWith(c)); k && clips[k] ? r.respond({ status: 200, contentType: 'audio/wav', body: clips[k] }) : r.continue(); });
  await p.evaluateOnNewDocument(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext(); await ctx.resume();
      const dest = ctx.createMediaStreamDestination();
      const hum = ctx.createConstantSource(); hum.offset.value = 0; hum.connect(dest); hum.start(); // keep the track alive
      window.__say = async (url) => { const buf = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer()); const s = ctx.createBufferSource(); s.buffer = buf; s.connect(dest); s.start(); return buf.duration; };
      return dest.stream;
    };
  });
  await p.setViewport({ width: 1440, height: 1100 });
  await p.goto('http://127.0.0.1:4311/app', { waitUntil: 'networkidle2' });
  const idx = { swap: 0, airdrop: 1, 'safe-send': 2, 'safe-bybit': 3 }[scene];
  const t0 = Date.now();
  await (await p.$$('.scene'))[idx].click();
  const status = () => p.evaluate(() => document.querySelector('.status')?.innerText || '');
  const until = async (re, ms = 60000) => { const end = Date.now() + ms; while (Date.now() < end) { if (re.test(await status())) return true; await new Promise((r) => setTimeout(r, 200)); } return false; };
  await until(/Listening/); await p.evaluate(() => window.__say('/__a.wav'));
  if (second) { await until(/Matched|Blocked|Error/); if (/Matched/.test(await status())) await p.evaluate(() => window.__say('/__b.wav')); }
  await until(/Released|Blocked|Cancelled|Error/, 60000);
  await new Promise((r) => setTimeout(r, 600));
  const r = await p.evaluate(() => ({
    status: document.querySelector('.status')?.innerText, heard: document.querySelector('.heard')?.innerText,
    voice: document.querySelector('.voice p')?.innerText, fidelity: document.querySelector('.fid')?.innerText,
    verdict: document.querySelector('.verdict .tag')?.innerText, rules: [...document.querySelectorAll('.findings .rid')].map((x) => x.innerText),
    attestation: document.querySelector('.attest dd')?.innerText ?? null, attestationBytes: document.querySelector('.attest')?.dataset.bytes ?? null, released: document.body.innerText.match(/Released\. No wallet[^.]*\./)?.[0] ?? null,
    error: document.querySelector('.err')?.innerText ?? null, log: [...document.querySelectorAll('.log li')].map((x) => x.innerText),
  }));
  await p.screenshot({ path: `${out}/${shot}.png` });
  console.log(JSON.stringify({ seconds: (Date.now() - t0) / 1000, ...r }, null, 2));
  await b.close();
})();
