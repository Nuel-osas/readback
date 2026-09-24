// Records a real Readback session: the screen (puppeteer screencast), the user's cued speech,
// and the AssemblyAI agent's actual voice, captured from the socket and re-scheduled exactly as
// the app schedules playback. Output: <name>.webm + <name>.wav (the true conversation audio).
const puppeteer = require('/Users/emmanuelosadebe/.npm/_npx/7d92d9a2d2ccc630/node_modules/puppeteer');
const fs = require('fs'); const { execFileSync } = require('child_process');
const [scene, first, second, name] = process.argv.slice(2);
const OUT = '/Users/emmanuelosadebe/Downloads/projects/hackies/hackathons/assemblyai-voice/readback/submission/footage';
const APP = (process.env.APP_URL || 'https://readback-phi.vercel.app') + '/app';
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await puppeteer.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'] });
  const p = await b.newPage();
  const clips = { '/__a.wav': fs.readFileSync(first), '/__b.wav': second ? fs.readFileSync(second) : null };
  await p.setRequestInterception(true);
  p.on('request', (r) => { const k = Object.keys(clips).find((c) => r.url().endsWith(c)); k && clips[k] ? r.respond({ status: 200, contentType: 'audio/wav', body: clips[k] }) : r.continue(); });
  await p.evaluateOnNewDocument(() => {
    window.__rec = { t0: 0, agent: [], said: [] };
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext(); await ctx.resume();
      const dest = ctx.createMediaStreamDestination();
      const z = ctx.createConstantSource(); z.offset.value = 0; z.connect(dest); z.start();
      window.__say = async (url) => { const buf = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer()); const s = ctx.createBufferSource(); s.buffer = buf; s.connect(dest); s.start(); window.__rec.said.push({ url, t: performance.now() - window.__rec.t0 }); };
      return dest.stream;
    };
    const add = WebSocket.prototype.addEventListener;
    Object.defineProperty(WebSocket.prototype, 'onmessage', { set(fn) { this.addEventListener('message', (e) => { try { const m = JSON.parse(e.data); if (m.type === 'reply.audio') window.__rec.agent.push({ t: performance.now() - window.__rec.t0, d: m.data }); } catch {} fn(e); }); } });
  });
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await p.goto(APP, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 800));
  const rec = await p.screencast({ path: `${OUT}/${name}.webm` });
  await p.evaluate(() => { window.__rec.t0 = performance.now(); });
  await new Promise((r) => setTimeout(r, 1200));
  const idx = { swap: 0, airdrop: 1, 'safe-send': 2, 'safe-bybit': 3 }[scene];
  await (await p.$$('.scene'))[idx].click();
  const status = () => p.evaluate(() => document.querySelector('.status')?.innerText || '');
  const until = async (re, ms = 60000) => { const end = Date.now() + ms; while (Date.now() < end) { if (re.test(await status())) return; await new Promise((r) => setTimeout(r, 150)); } };
  await until(/Listening/); await new Promise((r) => setTimeout(r, 500)); await p.evaluate(() => window.__say('/__a.wav'));
  if (second) { await until(/Matched|Blocked|Error/); if (/Matched/.test(await status())) { await new Promise((r) => setTimeout(r, 600)); await p.evaluate(() => window.__say('/__b.wav')); } }
  await until(/Released|Blocked|Cancelled|Error/);
  // Let the reader take in the result, and scroll the findings into view.
  await new Promise((r) => setTimeout(r, 1500));
  await p.evaluate(() => document.querySelector('.verdict')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await new Promise((r) => setTimeout(r, 3500));
  const data = await p.evaluate(() => window.__rec);
  await rec.stop();
  await b.close();

  // Rebuild the soundtrack: agent PCM (24 kHz) scheduled like the app does, user clips at their cue times.
  const dur = 90, SR = 24000, mix = new Float32Array(dur * SR);
  let playhead = 0;
  for (const c of data.agent) {
    const buf = Buffer.from(c.d, 'base64'); const pcm = new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2);
    const at = Math.max(c.t / 1000 + 0.03, playhead); const i0 = Math.round(at * SR);
    for (let i = 0; i < pcm.length && i0 + i < mix.length; i++) mix[i0 + i] += pcm[i] / 0x8000;
    playhead = at + pcm.length / SR;
  }
  for (const s of data.said) {
    const f = s.url.endsWith('__a.wav') ? first : second;
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 's16le', '-ac', '1', '-ar', String(SR), '-']);
    const pcm = new Int16Array(raw.buffer, raw.byteOffset, raw.length / 2); const i0 = Math.round((s.t / 1000) * SR);
    for (let i = 0; i < pcm.length && i0 + i < mix.length; i++) mix[i0 + i] += pcm[i] / 0x8000;
  }
  const out = Buffer.alloc(mix.length * 2);
  for (let i = 0; i < mix.length; i++) out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(mix[i] * 0x7fff))), i * 2);
  fs.writeFileSync(`${OUT}/${name}.pcm`, out);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 's16le', '-ar', String(SR), '-ac', '1', '-i', `${OUT}/${name}.pcm`, `${OUT}/${name}.wav`]);
  fs.unlinkSync(`${OUT}/${name}.pcm`);
  console.log(name, 'agent chunks', data.agent.length, 'user clips', data.said.length, 'offset note: audio t=0 is 800ms+ after screencast start');
})();
