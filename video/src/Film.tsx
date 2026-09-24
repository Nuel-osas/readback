import React from 'react';
import { AbsoluteFill, Img, Sequence, continueRender, delayRender, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { Audio, Video } from '@remotion/media';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';

const { fontFamily: MONO } = loadMono('normal', { weights: ['400', '500', '700'], subsets: ['latin'] });

// Brand faces from Fontshare's CDN, as their licence requires; render waits until they load.
if (typeof document !== 'undefined' && !document.getElementById('fontshare')) {
  const h = delayRender('fontshare');
  const l = document.createElement('link');
  l.id = 'fontshare'; l.rel = 'stylesheet';
  l.href = 'https://api.fontshare.com/v2/css?f[]=clash-display@500,600,700&f[]=satoshi@400,500,700&display=block';
  l.onload = () => document.fonts.load('600 80px "Clash Display"').then(() => document.fonts.load('500 30px Satoshi')).then(() => continueRender(h)).catch(() => continueRender(h));
  l.onerror = () => continueRender(h);
  document.head.appendChild(l);
}
const DISPLAY = '"Clash Display", Satoshi, system-ui, sans-serif';
const BODY = 'Satoshi, system-ui, sans-serif';
const C = { ink: '#07080a', ink2: '#0c0e12', fg: '#eef0f3', fg2: '#a7adb7', fg3: '#6c727d', line: 'rgba(255,255,255,.1)', amber: '#ffb547', go: '#3ddc97', stop: '#ff5a4f' };
const HORIZON = 'linear-gradient(90deg,#1b3fae 0%,#3a67d9 30%,#e8742a 72%,#ff9a3c 100%)';

const FPS = 30;
const f = (s: number) => Math.round(s * FPS);

// Scene lengths: narration clips measured with measure-vo.sh (+1.1 s), footage trimmed to its real
// action. Footage audio is the actual conversation: the user's words and the AssemblyAI agent's voice.
type Scene = { id: string; dur: number; vo?: string; footage?: { src: string; from: number; verdictAt: number } };
const SCENES: Scene[] = [
  { id: 'hook', dur: f(7.3), vo: 'n1' },
  { id: 'bybit', dur: f(10.1), vo: 'n2' },
  { id: 'tower', dur: f(8.0), vo: 'n3' },
  { id: 'brand', dur: f(9.8), vo: 'n4' },
  { id: 'card-airdrop', dur: f(3.3), vo: 'n5' },
  { id: 'airdrop', dur: f(22.5), footage: { src: 'footage/airdrop.mp4', from: 1.2, verdictAt: 9.4 } },
  { id: 'card-bybit', dur: f(4.5), vo: 'n6' },
  { id: 'safebybit', dur: f(25.5), footage: { src: 'footage/safe-bybit.mp4', from: 1.2, verdictAt: 9.8 } },
  { id: 'proof', dur: f(10.3), vo: 'n7' },
  { id: 'card-swap', dur: f(3.7), vo: 'n8' },
  { id: 'swap', dur: f(31.5), footage: { src: 'footage/swap.mp4', from: 1.2, verdictAt: 9.9 } },
  { id: 'how', dur: f(13.3), vo: 'n9' },
  { id: 'measured', dur: f(9.5), vo: 'n10' },
  { id: 'close', dur: f(5.2), vo: 'n11' },
];
export const DURATION = SCENES.reduce((a, s) => a + s.dur, 0);
const TOTAL_SCENES = 14;

const ease = (fr: number, start: number, dur = 16, rise = 24): React.CSSProperties => {
  const t = interpolate(fr - start, [0, dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const e = 1 - Math.pow(1 - t, 3);
  return { opacity: e, transform: `translateY(${(1 - e) * rise}px)` };
};
const fade = (fr: number, total: number, edge = 10) => interpolate(fr, [0, edge, total - edge, total], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

const PAPER = '#eceee9', PAPER_INK = '#0d1110';

/** Reel-style type: each line rises out of a masked slot, staggered. */
const Rise: React.FC<{ lines: string[]; size: number; start?: number; color?: string; caps?: boolean; gap?: number; weight?: number }> = ({ lines, size, start = 0, color = C.fg, caps = true, gap = 5, weight = 600 }) => {
  const fr = useCurrentFrame();
  return (
    <div style={{ fontFamily: DISPLAY, fontWeight: weight, fontSize: size, lineHeight: 0.96, letterSpacing: -size * 0.018, wordSpacing: `${size * 0.14}px`, color, textTransform: caps ? 'uppercase' : 'none' }}>
      {lines.map((l, i) => {
        const t = interpolate(fr - start - i * gap, [0, 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const e = 1 - Math.pow(1 - t, 4);
        return <div key={i} style={{ overflow: 'hidden', paddingBottom: size * 0.06 }}><div style={{ transform: `translateY(${(1 - e) * 112}%)` }}>{l}</div></div>;
      })}
    </div>
  );
};

/** Numbers count to their value, so they read as measured rather than asserted. */
const Count: React.FC<{ to: number; decimals?: number; start?: number; dur?: number; prefix?: string; suffix?: string }> = ({ to, decimals = 0, start = 0, dur = 34, prefix = '', suffix = '' }) => {
  const fr = useCurrentFrame();
  const t = interpolate(fr - start, [0, dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const e = 1 - Math.pow(1 - t, 3);
  return <>{prefix}{(to * e).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</>;
};

/** The editorial frame: section label, index, progress, corner marks. Same on every scene. */
const Hud: React.FC<{ label: string; index: number; of: number; light?: boolean }> = ({ label, index, of, light }) => {
  const fr = useCurrentFrame();
  const c = light ? 'rgba(13,17,16,.55)' : 'rgba(238,240,243,.45)';
  const bar = light ? 'rgba(13,17,16,.14)' : 'rgba(255,255,255,.12)';
  const p = interpolate(fr, [0, 60], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', fontFamily: MONO, fontSize: 17, letterSpacing: 3, color: light ? c : 'rgba(255,255,255,.62)', textTransform: 'uppercase', mixBlendMode: light ? 'normal' : 'difference' }}>
      <div style={{ position: 'absolute', left: 64, top: 48 }}>Readback / {label}</div>
      <div style={{ position: 'absolute', right: 64, top: 48 }}>{String(index).padStart(2, '0')} / {String(of).padStart(2, '0')}</div>
      <div style={{ position: 'absolute', left: 64, right: 64, bottom: 54, height: 2, background: bar }}>
        <div style={{ height: 2, width: `${((index - 1 + p) / of) * 100}%`, background: light ? PAPER_INK : C.amber }} />
      </div>
      <div style={{ position: 'absolute', right: 58, bottom: 72, fontSize: 26, letterSpacing: 0 }}>+</div>
      <div style={{ position: 'absolute', left: 64, bottom: 72 }}>Voice-verified signing</div>
    </AbsoluteFill>
  );
};

/** A field of short dashes that turn with time, like the reel's kinetic texture. */
const Dashes: React.FC<{ color?: string; opacity?: number }> = ({ color = 'rgba(255,255,255,.18)', opacity = 1 }) => {
  const fr = useCurrentFrame();
  const cols = 34, rows = 19, dx = 1920 / cols, dy = 1080 / rows;
  const out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = Math.sin(c * 0.45 + fr * 0.035) * 70 + Math.cos(r * 0.6 - fr * 0.028) * 50;
    out.push(<line key={`${r}-${c}`} x1={-7} y1={0} x2={7} y2={0} stroke={color} strokeWidth={2} strokeLinecap="round" transform={`translate(${c * dx + dx / 2},${r * dy + dy / 2}) rotate(${a})`} />);
  }
  return <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, opacity }}>{out}</svg>;
};

const Mark: React.FC<{ size?: number }> = ({ size = 60 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#12151a" stroke="rgba(255,255,255,.14)" /><path d="M5 12c4 0 6 4 11 4s7-4 11-4" stroke={C.amber} strokeWidth="2.2" fill="none" strokeLinecap="round" /><path d="M5 20c4 0 6-4 11-4s7 4 11 4" stroke={C.go} strokeWidth="2.2" fill="none" strokeLinecap="round" /></svg>
);

const Frame: React.FC<{ total: number; children: React.ReactNode; bg?: React.ReactNode; light?: boolean; label?: string; index?: number }> = ({ total, children, bg, light, label = 'Signing', index = 1 }) => {
  const fr = useCurrentFrame();
  // Wipe in from the right over 12 frames; fade out at the very end.
  const w = interpolate(fr, [0, 12], [100, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: (x) => 1 - Math.pow(1 - x, 3) });
  const out = interpolate(fr, [total - 8, total], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: light ? PAPER : C.ink, fontFamily: BODY, color: light ? PAPER_INK : C.fg, clipPath: `inset(0 0 0 ${w}%)`, opacity: out }}>
      {bg}
      {children}
      <Hud label={label} index={index} of={TOTAL_SCENES} light={light} />
    </AbsoluteFill>
  );
};

const Photo: React.FC<{ src: string; pos?: string; shade?: string; from?: number; to?: number; total: number }> = ({ src, pos = 'center', shade, from = 1.08, to = 1.0, total }) => {
  const fr = useCurrentFrame();
  const z = interpolate(fr, [0, total], [from, to]);
  return (
    <AbsoluteFill>
      <Img src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: pos, transform: `scale(${z})` }} />
      <AbsoluteFill style={{ background: shade ?? 'linear-gradient(90deg,rgba(7,8,10,.9) 0%,rgba(7,8,10,.55) 45%,rgba(7,8,10,.15) 80%)' }} />
    </AbsoluteFill>
  );
};

const H: React.FC<{ children: React.ReactNode; size?: number; start?: number; max?: number; color?: string }> = ({ children, size = 104, start = 0, max = 1400, color = C.fg }) => {
  const fr = useCurrentFrame();
  return <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: size, lineHeight: 0.98, letterSpacing: -size * 0.034, maxWidth: max, color, ...ease(fr, start) }}>{children}</div>;
};
const Label: React.FC<{ children: React.ReactNode; start?: number; color?: string }> = ({ children, start = 0, color = C.amber }) => {
  const fr = useCurrentFrame();
  return <div style={{ fontFamily: MONO, fontSize: 22, letterSpacing: 4, textTransform: 'uppercase', color, ...ease(fr, start) }}>{children}</div>;
};

// ---------------------------------------------------------------- scenes
const Hook: React.FC<{ total: number }> = ({ total }) => {
  const fr = useCurrentFrame();
  return (
    <Frame total={total} label="The problem" index={1}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 960, padding: '0 0 0 110px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontFamily: MONO, fontSize: 20, letterSpacing: 4, color: C.amber, textTransform: 'uppercase', ...ease(fr, 4) }}>Bybit · February 21, 2025</div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 230, lineHeight: 0.9, letterSpacing: -10, margin: '26px 0 16px' }}><Count to={1.46} decimals={2} prefix="$" suffix="B" start={6} dur={40} /></div>
        <Rise lines={['Lost to one', 'transaction.']} size={78} start={30} />
      </div>
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 960, overflow: 'hidden' }}>
        <Photo src="img/cockpit.webp" pos="62% 40%" total={total} shade="linear-gradient(90deg,rgba(7,8,10,.65),rgba(7,8,10,.05) 40%)" />
      </div>
    </Frame>
  );
};

const Bybit: React.FC<{ total: number }> = ({ total }) => {
  const fr = useCurrentFrame();
  return (
    <Frame total={total} label="What happened" index={2}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 960, background: PAPER, color: PAPER_INK, padding: '0 90px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontFamily: MONO, fontSize: 19, letterSpacing: 4, opacity: 0.55, ...ease(fr, 6) }}>WHAT THE SCREEN SHOWED</div>
        <div style={{ height: 26 }} />
        <Rise lines={['A routine', 'transfer.']} size={120} start={10} color={PAPER_INK} />
        <div style={{ fontFamily: MONO, fontSize: 26, marginTop: 40, ...ease(fr, 40) }}>transfer · cold wallet → warm wallet</div>
      </div>
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 960, padding: '0 90px', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'radial-gradient(80% 60% at 70% 50%, rgba(255,90,79,.12), transparent)' }}>
        <div style={{ fontFamily: MONO, fontSize: 19, letterSpacing: 4, color: C.stop, ...ease(fr, 120) }}>WHAT THE WALLETS SIGNED</div>
        <div style={{ height: 26 }} />
        <Rise lines={['A takeover.']} size={120} start={124} color={C.fg} />
        <div style={{ fontFamily: MONO, fontSize: 26, marginTop: 40, color: C.stop, ...ease(fr, 150) }}>operation 1 · DELEGATECALL → 0x9622…7242</div>
      </div>
    </Frame>
  );
};

const Tower: React.FC<{ total: number }> = ({ total }) => {
  const fr = useCurrentFrame();
  const row = (start: number, who: string, line: string, color: string) => (
    <div style={{ display: 'flex', gap: 30, padding: '24px 0', borderTop: `1px solid ${C.line}`, fontSize: 38, ...ease(fr, start) }}>
      <span style={{ fontFamily: MONO, fontSize: 19, letterSpacing: 3, color: C.fg3, width: 120, paddingTop: 12 }}>{who}</span><span style={{ color }}>{line}</span>
    </div>
  );
  return (
    <Frame total={total} label="The fix" index={3}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 760, overflow: 'hidden' }}>
        <Photo src="img/tower.webp" pos="center 45%" from={1.14} to={1.02} total={total} shade="linear-gradient(90deg,transparent 60%,rgba(7,8,10,.9))" />
      </div>
      <div style={{ position: 'absolute', left: 860, right: 110, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontFamily: MONO, fontSize: 20, letterSpacing: 4, color: C.amber, ...ease(fr, 4) }}>SEVENTY YEARS OLD</div>
        <div style={{ height: 24 }} />
        <Rise lines={['Pilots read', 'every instruction', 'back.']} size={92} start={8} />
        <div style={{ marginTop: 50 }}>
          {row(70, 'TOWER', '“Climb to flight level three-five-zero.”', C.amber)}
          {row(120, 'PILOT', '“Climbing to three-five-zero.”', C.go)}
        </div>
      </div>
    </Frame>
  );
};

/** The brand's one visible consequence: what you said and what it does, locking or tearing apart. */
const Lines: React.FC<{ state: 'go' | 'stop' | 'idle'; width?: number; height?: number; start?: number }> = ({ state, width = 1500, height = 200, start = 0 }) => {
  const fr = useCurrentFrame();
  const t = (fr - start) / 30;
  const k = interpolate(fr - start, [20, 60], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const wave = (x: number, ph: number, amp: number, fq: number) => Math.sin((x / width) * Math.PI) * amp * (Math.sin(x * fq + ph) * 0.62 + Math.sin(x * fq * 2.3 - ph * 1.4) * 0.28);
  const path = (fn: (x: number) => number) => Array.from({ length: width / 4 + 1 }, (_, i) => `${i ? 'L' : 'M'}${i * 4},${height / 2 + fn(i * 4)}`).join(' ');
  const said = (x: number) => wave(x, t * 1.6, height * 0.34, 0.012);
  const does = (x: number) => (state === 'stop' ? said(x) * (1 - k) + wave(x, -t * 2.6 + 2, height * 0.36, 0.023) * -k : said(x));
  const col = state === 'go' ? C.go : state === 'stop' ? C.stop : C.fg3;
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <path d={path(does)} stroke={col} strokeWidth={4} fill="none" style={{ filter: `drop-shadow(0 0 10px ${col})` }} />
      <path d={path(said)} stroke={C.amber} strokeWidth={4.4} fill="none" style={{ filter: `drop-shadow(0 0 12px ${C.amber})` }} />
    </svg>
  );
};

const Brand: React.FC<{ total: number }> = ({ total }) => {
  const fr = useCurrentFrame();
  return (
    <Frame total={total} label="Introducing" index={4} bg={<Dashes color="rgba(255,181,71,.16)" />}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(40% 40% at 50% 50%, rgba(7,8,10,.96), rgba(7,8,10,.4))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 30 }}><div style={{ ...ease(fr, 0) }}><Mark size={120} /></div><Rise lines={['Readback']} size={168} start={4} caps={false} /></div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 56, marginTop: 20, background: HORIZON, WebkitBackgroundClip: 'text', color: 'transparent', ...ease(fr, 20) }}>Say what you think you’re signing.</div>
        <div style={{ marginTop: 60, ...ease(fr, 40) }}><Lines state={fr > 150 ? 'stop' : 'idle'} start={150} width={1300} height={170} /></div>
        <div style={{ display: 'flex', gap: 60, marginTop: 20, fontFamily: MONO, fontSize: 21, letterSpacing: 3, ...ease(fr, 60) }}>
          <span style={{ color: C.amber }}>━ WHAT YOU SAID</span><span style={{ color: fr > 150 ? C.stop : C.fg3 }}>━ WHAT IT DOES</span>
        </div>
      </div>
    </Frame>
  );
};

const Card: React.FC<{ total: number; label: string; title: string[]; tone?: string; index: number }> = ({ total, label, title, tone = C.amber, index }) => {
  const fr = useCurrentFrame();
  return (
    <Frame total={total} light label="Live demo" index={index} bg={<Dashes color="rgba(13,17,16,.16)" />}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 120px', background: `linear-gradient(90deg, ${PAPER} 45%, rgba(236,238,233,.6))` }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, fontFamily: MONO, fontSize: 20, letterSpacing: 4, textTransform: 'uppercase', color: PAPER_INK, ...ease(fr, 2) }}><span style={{ width: 12, height: 12, borderRadius: 6, background: tone }} />{label}</div>
        <div style={{ height: 30 }} />
        <Rise lines={title} size={150} start={5} color={PAPER_INK} />
      </div>
    </Frame>
  );
};

/** Real footage of the live site. Pushes in on the Readback panel as the verdict lands. */
const Footage: React.FC<{ total: number; src: string; from: number; verdictAt: number; caption: string }> = ({ total, src, from, verdictAt, caption }) => {
  const fr = useCurrentFrame();
  const v = f(verdictAt - from);
  const z = interpolate(fr, [v - 20, v + 20], [1, 1.3], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: (x) => 1 - Math.pow(1 - x, 3) });
  const W = 1680, Hh = 1050;
  return (
    <AbsoluteFill style={{ background: C.ink, opacity: fade(fr, total, 8) }}>
      <div style={{ position: 'absolute', left: (1920 - W) / 2, top: 15, width: W, height: Hh, borderRadius: 22, overflow: 'hidden', boxShadow: '0 40px 100px -30px rgba(0,0,0,.9), 0 0 0 1px rgba(255,255,255,.08)' }}>
        <div style={{ width: W, height: Hh, transform: `scale(${z})`, transformOrigin: '98% 34%' }}>
          <Video src={staticFile(src)} trimBefore={f(from)} volume={0.8} style={{ width: W, height: Hh, objectFit: 'cover' }} />
        </div>
      </div>
      <div style={{ position: 'absolute', left: 150, bottom: 44, display: 'flex', gap: 12, fontFamily: MONO, fontSize: 19, ...ease(fr, 10, 14, 10) }}>
        <span style={{ background: 'rgba(7,8,10,.85)', border: `1px solid ${C.line}`, borderRadius: 999, padding: '10px 18px', color: C.fg2 }}>● REAL SESSION · readback-phi.vercel.app</span>
        <span style={{ background: 'rgba(7,8,10,.85)', border: `1px solid ${C.line}`, borderRadius: 999, padding: '10px 18px', color: C.amber }}>{caption}</span>
      </div>
    </AbsoluteFill>
  );
};

const Proof: React.FC<{ total: number }> = ({ total }) => {
  const fr = useCurrentFrame();
  const half = (side: 'l' | 'r', start: number, title: string, status: string, color: string, impl: string, note: string, hash: string) => (
    <div style={{ position: 'absolute', top: 0, bottom: 0, [side === 'l' ? 'left' : 'right']: 0, width: 960, padding: '0 100px', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: `radial-gradient(70% 55% at 50% 50%, ${color}18, transparent)`, borderRight: side === 'l' ? `1px solid ${C.line}` : 'none' }}>
      <div style={{ fontFamily: MONO, fontSize: 19, letterSpacing: 4, color: C.fg3, ...ease(fr, start) }}>{title}</div>
      <div style={{ height: 22 }} />
      <Rise lines={[status]} size={128} start={start + 4} color={color} />
      <div style={{ fontSize: 28, color: C.fg2, marginTop: 30, ...ease(fr, start + 20) }}>implementation after</div>
      <div style={{ fontFamily: MONO, fontSize: 30, margin: '8px 0 6px', ...ease(fr, start + 24) }}>{impl}</div>
      <div style={{ fontSize: 28, color, ...ease(fr, start + 28) }}>{note}</div>
      <div style={{ fontFamily: MONO, fontSize: 19, color: C.fg3, marginTop: 30, ...ease(fr, start + 32) }}>tx {hash}</div>
    </div>
  );
  return (
    <Frame total={total} label="On-chain proof · Base Sepolia" index={9}>
      {half('l', 8, 'WITH READBACKGUARD', 'Reverted.', C.go, '0x29fc…C762', 'Safe’s own SafeL2 1.4.1. Untouched.', '0x8e3c182b…8bd8')}
      {half('r', 40, 'WITHOUT IT', 'Taken over.', C.stop, '0x60b7…c98A', 'The attacker’s contract.', '0x7919e8e9…e11')}
    </Frame>
  );
};

const How: React.FC<{ total: number }> = ({ total }) => {
  const fr = useCurrentFrame();
  const col = (i: number, start: number, n: string, t: string[], by: string, body: string) => (
    <div style={{ position: 'absolute', top: 0, bottom: 0, left: i * 640, width: 640, padding: '0 64px', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderLeft: i ? `1px solid ${C.line}` : 'none', background: i === 1 ? 'rgba(255,255,255,.015)' : 'none' }}>
      <div style={{ fontFamily: MONO, fontSize: 19, letterSpacing: 4, color: C.fg3, ...ease(fr, start) }}>{n}</div>
      <div style={{ height: 20 }} />
      <Rise lines={t} size={78} start={start + 4} />
      <div style={{ fontFamily: MONO, fontSize: 21, color: C.amber, margin: '24px 0 18px', ...ease(fr, start + 16) }}>{by}</div>
      <div style={{ fontSize: 28, color: C.fg2, lineHeight: 1.4, ...ease(fr, start + 22) }}>{body}</div>
    </div>
  );
  return (
    <Frame total={total} label="How it works" index={12}>
      {col(0, 8, '01 · HEAR', ['You', 'say it.'], 'AssemblyAI Voice Agent API', 'Records your intent through a tool call. Never sees the transaction.')}
      {col(1, 110, '02 · DECIDE', ['Rules', 'check it.'], '27 deterministic rules', 'The notary decodes the real calldata and checks every address on Base.')}
      {col(2, 220, '03 · ENFORCE', ['The chain', 'refuses.'], 'ReadbackGuard for Safe', 'No attestation over the exact transaction hash, no execution.')}
    </Frame>
  );
};

const Measured: React.FC<{ total: number }> = ({ total }) => {
  const fr = useCurrentFrame();
  const stat = (i: number, start: number, big: React.ReactNode, w: string) => (
    <div style={{ position: 'absolute', top: 0, bottom: 0, left: i * 640, width: 640, padding: '0 64px', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderLeft: i ? '1px solid rgba(13,17,16,.12)' : 'none' }}>
      <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 176, letterSpacing: -7, lineHeight: 1, color: PAPER_INK, ...ease(fr, start, 12, 16) }}>{big}</div>
      <div style={{ fontSize: 32, color: 'rgba(13,17,16,.62)', marginTop: 20, ...ease(fr, start + 10) }}>{w}</div>
    </div>
  );
  return (
    <Frame total={total} light label="Measured, not claimed" index={13}>
      {stat(0, 10, <><Count to={15} start={10} dur={26} />/15</>, 'spoken intents understood')}
      {stat(1, 60, <><Count to={15} start={60} dur={26} />/15</>, 'verdicts spoken word for word')}
      {stat(2, 120, <><Count to={1.9} decimals={1} start={120} dur={26} />s</>, 'from your last word to the verdict')}
    </Frame>
  );
};

const Close: React.FC<{ total: number }> = ({ total }) => {
  const fr = useCurrentFrame();
  return (
    <Frame total={total} label="Readback v0.1" index={14} bg={<AbsoluteFill style={{ background: '#0b100e' }} />}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <Rise lines={['READBACK']} size={250} start={2} color="#e9ece6" />
        <div style={{ width: 1100, height: 1, background: 'rgba(255,255,255,.14)', margin: '30px 0 28px', ...ease(fr, 14) }} />
        <div style={{ fontFamily: MONO, fontSize: 36, color: C.fg2, ...ease(fr, 18) }}>readback-phi.vercel.app</div>
        <div style={{ fontFamily: MONO, fontSize: 18, letterSpacing: 4, color: C.fg3, marginTop: 22, textTransform: 'uppercase', ...ease(fr, 24) }}>Say what you think you’re signing</div>
      </div>
    </Frame>
  );
};

const RENDER: Record<string, (total: number) => React.ReactNode> = {
  hook: (t) => <Hook total={t} />, bybit: (t) => <Bybit total={t} />, tower: (t) => <Tower total={t} />, brand: (t) => <Brand total={t} />,
  'card-airdrop': (t) => <Card total={t} index={5} label="Demo 1 · a wallet" title={['A free', 'airdrop.']} />,
  airdrop: (t) => <Footage total={t} src="footage/airdrop.mp4" from={1.2} verdictAt={9.4} caption="“Claim my airdrop.”" />,
  'card-bybit': (t) => <Card total={t} index={7} label="Demo 2 · a guarded Safe on Base" title={['The Bybit', 'attack.']} tone={C.stop} />,
  safebybit: (t) => <Footage total={t} src="footage/safe-bybit.mp4" from={1.2} verdictAt={9.8} caption="“Send one ETH to my cold wallet.”" />,
  proof: (t) => <Proof total={t} />,
  'card-swap': (t) => <Card total={t} index={10} label="Demo 3 · an honest swap" title={['When you’re', 'right.']} tone={C.go} />,
  swap: (t) => <Footage total={t} src="footage/swap.mp4" from={1.2} verdictAt={9.9} caption="“Swap a hundred USDC for ETH.” … “Confirm.”" />,
  how: (t) => <How total={t} />, measured: (t) => <Measured total={t} />, close: (t) => <Close total={t} />,
};

export const Film: React.FC = () => {
  let at = 0;
  const fr = useCurrentFrame();
  // Music sits under narration and drops away under the real conversations.
  const inFootage = (() => { let a = 0; for (const s of SCENES) { if (fr >= a && fr < a + s.dur) return Boolean(s.footage); a += s.dur; } return false; })();
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <Audio src={staticFile('bed.mp3')} volume={inFootage ? 0.035 : 0.12} />
      {SCENES.map((s) => {
        const from = at; at += s.dur;
        return (
          <Sequence key={s.id} from={from} durationInFrames={s.dur}>
            {RENDER[s.id](s.dur)}
            {s.vo && <Sequence from={6}><Audio src={staticFile(`vo/${s.vo}.mp3`)} /></Sequence>}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
