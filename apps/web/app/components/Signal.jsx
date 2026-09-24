'use client';
import { useEffect, useRef } from 'react';

/**
 * Two signals. Amber is what you said. The second is what the transaction does.
 * On a match they lock together and turn green; on a stop they tear apart and turn red.
 * While listening, the amber line follows the voice and the second line waits, flat.
 */
const COLORS = { said: [255, 181, 71], go: [61, 220, 151], stop: [255, 90, 79], idle: [108, 114, 125] };

export default function Signal({ state = 'listening', level = 0 }) {
  const ref = useRef(null);
  const target = useRef({ state, level });
  target.current = { state, level };

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv.getContext('2d');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf, t = 0;
    const s = { div: 0, lock: 0, amp: 0.2, col: [...COLORS.idle] };

    const fit = () => {
      const r = cv.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
      cv.width = r.width * d; cv.height = r.height * d; ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    fit(); window.addEventListener('resize', fit);

    const wave = (x, w, phase, amp, freq) => {
      const env = Math.sin((x / w) * Math.PI); // quiet at the edges, like a scope trace
      return env * amp * (Math.sin(x * freq + phase) * 0.62 + Math.sin(x * freq * 2.3 - phase * 1.4) * 0.28 + Math.sin(x * freq * 0.5 + phase * 0.6) * 0.1);
    };

    const draw = () => {
      const { state: st, level: lv } = target.current;
      const w = cv.clientWidth, h = cv.clientHeight, mid = h / 2;
      const k = reduced ? 1 : 0.06;
      const wantDiv = st === 'stop' ? 1 : 0, wantLock = st === 'go' ? 1 : 0;
      const wantAmp = st === 'listening' ? 0.35 + Math.min(1, lv) * 0.65 : 0.55;
      s.div += (wantDiv - s.div) * k; s.lock += (wantLock - s.lock) * k; s.amp += (wantAmp - s.amp) * k;
      const want = st === 'go' ? COLORS.go : st === 'stop' ? COLORS.stop : COLORS.idle;
      s.col = s.col.map((c, i) => c + (want[i] - c) * k);

      ctx.clearRect(0, 0, w, h);
      // hairline axis
      ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();

      const A = h * 0.38 * s.amp, f = 0.035;
      const line = (fn, rgb, width, glow) => {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 2) { const y = mid + fn(x); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.strokeStyle = `rgb(${rgb.map(Math.round).join(',')})`; ctx.lineWidth = width;
        ctx.shadowColor = `rgba(${rgb.map(Math.round).join(',')},.7)`; ctx.shadowBlur = glow;
        ctx.stroke(); ctx.shadowBlur = 0;
      };

      const said = (x) => wave(x, w, t, A, f);
      // The transaction's line: flat while waiting; the same shape when it matches;
      // a different, inverted shape when it doesn't.
      const does = (x) => {
        const same = wave(x, w, t, A, f);
        const other = wave(x, w, -t * 1.7 + 2.1, A * 1.05, f * 1.9) * -1;
        const shown = st === 'listening' ? 0.08 : 1;
        return (same * (1 - s.div) + other * s.div) * shown + (1 - s.lock) * s.div * Math.sin(x * 0.01 + t) * 4;
      };

      line(does, s.col, 2, 14);
      line(said, COLORS.said, 2.2 - s.lock * 0.6, 16);
      if (!reduced) t += 0.028 + (st === 'listening' ? lv * 0.05 : 0);
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', fit); };
  }, []);

  return <canvas ref={ref} className="signal" aria-hidden="true" />;
}
