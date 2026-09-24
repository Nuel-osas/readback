const puppeteer = require('/Users/emmanuelosadebe/.npm/_npx/7d92d9a2d2ccc630/node_modules/puppeteer');
const wav = process.argv[2];
(async () => {
  for (const [label, extra] of [['plain', {}], ['no-processing', { echoCancellation: false, noiseSuppression: false, autoGainControl: false }]]) {
    const b = await puppeteer.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`] });
    const p = await b.newPage();
    await p.goto('http://127.0.0.1:4311/app');
    const peak = await p.evaluate(async (extra) => {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, ...extra } });
      const ctx = new AudioContext(); await ctx.resume();
      const an = ctx.createAnalyser(); an.fftSize = 2048; ctx.createMediaStreamSource(s).connect(an);
      const buf = new Float32Array(2048); let pk = 0;
      for (let i = 0; i < 60; i++) { await new Promise((r) => setTimeout(r, 100)); an.getFloatTimeDomainData(buf); for (const v of buf) pk = Math.max(pk, Math.abs(v)); }
      return pk;
    }, extra);
    console.log(label, 'peak over 6s:', peak.toFixed(4));
    await b.close();
  }
})();
