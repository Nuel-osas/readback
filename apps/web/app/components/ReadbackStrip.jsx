'use client';
import { useEffect, useState } from 'react';
import Signal from './Signal';

/**
 * The hero instrument. It replays three real readbacks. Each "It does" line and each
 * verdict below is verbatim output of @readback/core against real calldata and live
 * Base facts, captured Sep 24 2026.
 */
const SCENES = [
  { site: 'base-rewards.claims', said: 'Claim my airdrop.', does: 'Let a wallet address with no history at all spend unlimited USDC, forever.', verdict: 'stop', line: 'A claim should give you something. This lets a wallet address with no history at all take your USDC, all of it, forever.' },
  { site: 'app.uniswap.org', said: 'Swap a hundred USDC for ETH.', does: 'Swap 100 USDC for at least 0.02 WETH through the Uniswap swap router, paid to you.', verdict: 'go', line: 'That matches. Say confirm to sign.' },
  { site: 'app.safe.global', said: 'Send one ETH to my cold wallet.', does: 'Hand control of this Safe to an unverified contract, deployed 1 hour ago.', verdict: 'stop', line: "This doesn't send anything. It hands control of your Safe to an unverified contract. That is how Bybit lost one and a half billion dollars." },
];

export default function ReadbackStrip() {
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState('listening'); // listening → decoded → verdict
  const [level, setLevel] = useState(0);
  const s = SCENES[i];

  useEffect(() => {
    let n = 0, alive = true;
    setTyped(''); setPhase('listening');
    const type = setInterval(() => {
      if (!alive) return;
      n++; setTyped(s.said.slice(0, n)); setLevel(0.3 + Math.random() * 0.7);
      if (n >= s.said.length) { clearInterval(type); setLevel(0); setTimeout(() => alive && setPhase('decoded'), 500); setTimeout(() => alive && setPhase('verdict'), 1500); }
    }, 55);
    const next = setTimeout(() => alive && setI((x) => (x + 1) % SCENES.length), 8200);
    return () => { alive = false; clearInterval(type); clearTimeout(next); };
  }, [i]);

  const sig = phase === 'verdict' ? s.verdict : 'listening';
  return (
    <div className="strip" role="img" aria-label={`Readback example: you said "${s.said}". It does: ${s.does}. Verdict: ${s.verdict === 'go' ? 'match' : 'stop'}.`}>
      <div className="strip__top"><span>Readback</span><span className="strip__site">{s.site}</span></div>
      <Signal state={sig} level={level} />
      <div className="strip__row"><span className="k">YOU SAID</span><span className="v said">“{typed}{phase === 'listening' && <span className="caret" />}{typed.length === s.said.length && '”'}</span></div>
      <div className="strip__row"><span className="k">IT DOES</span><span className="v" style={{ opacity: phase === 'listening' ? 0.25 : 1, transition: 'opacity .5s' }}>{phase === 'listening' ? 'Decoding…' : s.does}</span></div>
      <div className={`verdict ${phase === 'verdict' ? s.verdict : 'wait'}`}>
        <span className="tag">{phase === 'verdict' ? (s.verdict === 'go' ? 'MATCH' : 'STOP') : 'WAIT'}</span>
        <span>{phase === 'verdict' ? s.line : 'Comparing what you said with what it does.'}</span>
      </div>
    </div>
  );
}
