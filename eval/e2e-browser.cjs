// The whole loop in a real browser: fake mic plays a recorded sentence, the page runs the
// Voice Agent session, the notary decides, and we read the result off the page.
const puppeteer = require('/Users/emmanuelosadebe/.npm/_npx/7d92d9a2d2ccc630/node_modules/puppeteer');
const [scene, wav, shot] = process.argv.slice(2);
const out = '/private/tmp/claude-501/-Users-emmanuelosadebe-Downloads-projects-hackies/dd4ce2e3-d512-40aa-b36e-d72d16bc3589/scratchpad';
(async () => {
  const b = await puppeteer.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`, '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'] });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  // The physical microphone is the only thing simulated: getUserMedia returns a real
  // MediaStream playing the recording on a loop. Worklet, resampling, socket, agent and
  // notary all run exactly as they do for a person.
  const fs = require('fs');
  const wavBytes = fs.readFileSync(wav);
  await p.setRequestInterception(true);
  p.on('request', (r) => (r.url().endsWith('/__mic.wav') ? r.respond({ status: 200, contentType: 'audio/wav', body: wavBytes }) : r.continue()));
  await p.evaluateOnNewDocument(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext(); await ctx.resume();
      const buf = await ctx.decodeAudioData(await (await fetch('/__mic.wav')).arrayBuffer());
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const dest = ctx.createMediaStreamDestination(); src.connect(dest); src.start();
      return dest.stream;
    };
  });
  await p.evaluateOnNewDocument(() => {
    window.__ws = { sent: 0, loud: 0, peak: 0, recv: {} };
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (d) {
      try { const m = JSON.parse(d); if (m.type === 'input.audio') { window.__ws.sent++; const b = atob(m.audio); let pk = 0; for (let i = 0; i < b.length; i += 2) { const v = (b.charCodeAt(i) | (b.charCodeAt(i + 1) << 8)) << 16 >> 16; pk = Math.max(pk, Math.abs(v)); } window.__ws.peak = Math.max(window.__ws.peak, pk); if (pk > 1500) window.__ws.loud++; } else { window.__ws.recv['>' + m.type] = (window.__ws.recv['>' + m.type] || 0) + 1; } } catch {}
      return send.call(this, d);
    };
    const add = WebSocket.prototype.addEventListener;
    Object.defineProperty(WebSocket.prototype, 'onmessage', { set(fn) { this.addEventListener('message', (e) => { try { const m = JSON.parse(e.data); window.__ws.recv[m.type] = (window.__ws.recv[m.type] || 0) + 1; if (m.type === 'error' || m.type === 'session.error') window.__ws.err = m; } catch {} fn(e); }); } });
  });
  await p.setViewport({ width: 1440, height: 1100 });
  await p.goto('http://127.0.0.1:4311/app', { waitUntil: 'networkidle2' });
  const idx = { swap: 0, airdrop: 1, 'safe-send': 2, 'safe-bybit': 3 }[scene];
  const els = await p.$$('.scene'); await els[idx].click(); // trusted gesture, like a real user
  const t0 = Date.now();
  // Wait until the voice has finished reading the verdict back (status leaves 'Reading back').
  await p.waitForFunction(() => { const s = document.querySelector('.status')?.innerText || ''; return /Blocked|Matched|Error|Released|Cancelled/.test(s); }, { timeout: 60000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 800));
  const r = await p.evaluate(() => ({
    status: document.querySelector('.status')?.innerText,
    heard: document.querySelector('.heard')?.innerText,
    voice: document.querySelector('.voice p')?.innerText,
    fidelity: document.querySelector('.fid')?.innerText,
    verdict: document.querySelector('.verdict')?.innerText,
    rules: [...document.querySelectorAll('.findings .rid')].map((x) => x.innerText),
    attestation: Boolean(document.querySelector('.attest')),
    error: document.querySelector('.err')?.innerText,
    log: [...document.querySelectorAll('.log li')].map((x) => x.innerText),
    ws: window.__ws,
  }));
  await p.screenshot({ path: `${out}/${shot}.png` });
  console.log(JSON.stringify({ secondsToVerdict: (Date.now() - t0) / 1000, ...r, pageErrors: errs.slice(0, 3) }, null, 2));
  await b.close();
})();
