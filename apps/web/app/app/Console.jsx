'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useSwitchChain, useWalletClient } from 'wagmi';
import { sayAction } from '@readback/core';
import { withReadback } from '@readback/provider';
import Signal from '../components/Signal';
import { Mark } from '../components/Chrome';
import { startReadback } from '../../lib/voice';
import { DEMO_SENDER, EVIDENCE, EXPLORERS, GUARD, SCENARIOS } from '../../lib/scenarios';

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const ms = (a, b) => (a && b ? `${Math.round(b - a)} ms` : '—');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const STATUS = {
  idle: 'Ready', connecting: 'Opening voice channel', asking: 'Asking', listening: 'Listening', checking: 'Notary checking',
  speaking: 'Reading back', deciding: 'Matched · say confirm or cancel', released: 'Released', blocked: 'Blocked', cancelled: 'Cancelled', error: 'Error',
};

export default function Console() {
  const { address, chainId: walletChain } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const sender = address ?? DEMO_SENDER;

  const [scene, setScene] = useState(null);
  const [phase, setPhase] = useState('idle');
  const [level, setLevel] = useState(0);
  const [partial, setPartial] = useState('');
  const [heard, setHeard] = useState('');
  const [agentSaid, setAgentSaid] = useState('');
  const [result, setResult] = useState(null);
  const [fidelity, setFidelity] = useState(null);
  const [error, setError] = useState('');
  const [log, setLog] = useState([]);
  const [released, setReleased] = useState(null);
  const [paste, setPaste] = useState({ chainId: 8453, to: '', data: '', value: '', safe: '', operation: '0' });
  const [copied, setCopied] = useState(false);

  const session = useRef(null);
  const expect = useRef(null);
  const decide = useRef(null);
  const marks = useRef({});

  const note = (text) => setLog((l) => [...l, { t: new Date().toLocaleTimeString([], { hour12: false }), text }]);
  const end = () => { session.current?.stop(); session.current = null; };
  useEffect(() => () => end(), []);

  /** The spoken readback. Resolves true only on a notary match followed by a spoken confirm. */
  const review = useCallback((tx, ctx) => new Promise(async (resolve) => {
    setError(''); setPartial(''); setHeard(''); setAgentSaid(''); setResult(null); setFidelity(null); setReleased(null); setLog([]);
    marks.current = {}; expect.current = null; decide.current = null;
    setPhase('connecting'); note('Opening an AssemblyAI Voice Agent session');
    // Warm the notary's chain facts while the signer is still speaking. The response is
    // deliberately not shown: nobody sees what the transaction does before saying it.
    fetch('/api/readback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chainId: ctx.chainId, tx, safe: ctx.safe }) }).catch(() => {});

    const finish = (ok, p) => { setPhase(p); setTimeout(end, 2500); resolve(ok); };

    try {
      session.current = await startReadback({
        onEvent: async (e) => {
          switch (e.type) {
            case 'ready': if (!marks.current.ready) { marks.current.ready = e.t; setPhase('asking'); note('Voice channel open. The transaction has not been shown to anyone.'); } break;
            case 'level': setLevel(e.level * 2.4); break;
            case 'agent.speaking': if (expect.current) expect.current.started = true; break;
            case 'agent.silent':
              // Only the silence after the verdict's own audio ends the turn.
              if (expect.current?.after && expect.current.started) { const a = expect.current.after; expect.current.after = null; a(); }
              setPhase((p) => (p === 'asking' ? 'listening' : p));
              break;
            case 'user.speaking': marks.current.speech = e.t; setPhase((p) => (['asking', 'listening'].includes(p) ? 'listening' : p)); break;
            case 'user.stopped': if (!marks.current.verdict) marks.current.stopped = e.t; break; // the intent turn, not the confirm
            case 'user.delta': setPartial(e.text); break;
            case 'user': setPartial(''); setHeard(e.text); note(`Heard: “${e.text}”`); break;
            case 'agent':
              setAgentSaid(e.text);
              if (expect.current?.say) {
                const ok = norm(e.text) === norm(expect.current.say);
                setFidelity(ok ? 'verbatim' : 'paraphrased');
                note(ok ? 'The voice read the verdict back word for word.' : 'The voice paraphrased. The screen verdict is the authority.');
                expect.current.say = null;
              }
              break;
            case 'tool':
              if (e.name === 'report_intent') {
                marks.current.intent = e.t;
                setPhase('checking');
                const intent = { action: 'other', amount: null, token: null, token_out: null, recipient: null, ...e.args, confirm: false };
                note(`Intent recorded: ${JSON.stringify(e.args)}`);
                const r = await fetch('/api/readback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chainId: ctx.chainId, tx, intent, sender: ctx.sender, safe: ctx.safe }) }).then((x) => x.json());
                marks.current.verdict = performance.now();
                if (r.error) { setError(r.error); session.current?.answer(e.callId, { say: 'I could not check this transaction. Do not sign it.' }); finish(false, 'error'); return; }
                setResult(r);
                note(`Notary: ${r.verdict.toUpperCase()} in ${ms(marks.current.intent, marks.current.verdict)}${r.findings?.length ? ` · ${r.findings.map((f) => f.rule).join(', ')}` : ''}${r.attestation ? ' · attestation signed' : ''}`);
                setPhase('speaking');
                expect.current = { say: r.spoken, after: r.verdict === 'block' ? () => finish(false, 'blocked') : () => setPhase('deciding') };
                session.current?.answer(e.callId, { verdict: r.verdict, say: r.spoken });
              } else if (e.name === 'report_decision') {
                const yes = e.args?.decision === 'confirm';
                note(yes ? 'Confirmed aloud.' : 'Cancelled aloud.');
                const say = yes ? 'Confirmed. Releasing it to your wallet.' : 'Cancelled. Nothing was signed.';
                expect.current = { say, after: () => finish(yes, yes ? 'released' : 'cancelled') };
                session.current?.answer(e.callId, { say });
              }
              break;
            case 'error': setError(e.message); note(`Error: ${e.message}`); finish(false, 'error'); break;
            default: break;
          }
        },
      });
    } catch (err) {
      setError(/NotAllowed|Permission/i.test(String(err)) ? 'Microphone permission was refused. Readback needs to hear you.' : String(err.message || err));
      setPhase('error'); resolve(false);
    }
  }), []);

  /** A dapp asking its provider to send. The provider is wrapped once; that is the whole integration. */
  const sign = async (id, tx, ctx) => {
    end(); setScene(id);
    const base = {
      request: async (a) => {
        if (ctx.safe) return null; // Safe transactions leave with an attestation, not a wallet send
        if (!walletClient) return null;
        if (walletChain !== ctx.chainId) await switchChainAsync({ chainId: ctx.chainId });
        return walletClient.request(a);
      },
    };
    const provider = withReadback(base, (t) => review(t, ctx));
    try {
      const hash = await provider.request({ method: 'eth_sendTransaction', params: [{ ...tx, from: ctx.sender }] });
      setReleased(hash ?? (ctx.safe ? 'attested' : 'dry'));
    } catch (e) {
      if (e?.code !== 4001) setError(e?.shortMessage || e?.message || 'Wallet error');
    }
  };

  const runScene = (s) => sign(s.id, s.build(sender), { chainId: s.chainId, sender, safe: s.safe });
  const runPaste = () => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(paste.to.trim())) { setError('Paste a 0x address in “to”.'); return; }
    const safe = paste.safe.trim();
    if (safe && !/^0x[0-9a-fA-F]{40}$/.test(safe)) { setError('The Safe address is not an address.'); return; }
    sign('paste', { to: paste.to.trim(), data: paste.data.trim() || '0x', value: paste.value.trim() || '0', operation: Number(paste.operation) }, { chainId: Number(paste.chainId), sender, safe: safe || undefined });
  };
  const stop = () => { end(); setPhase('cancelled'); note('Stopped.'); };

  const active = SCENARIOS.find((s) => s.id === scene);
  const busy = ['connecting', 'asking', 'listening', 'checking', 'speaking', 'deciding'].includes(phase);
  const sig = result ? (result.verdict === 'match' ? 'go' : 'stop') : 'listening';
  const explorer = EXPLORERS[active?.chainId ?? paste.chainId];

  return (
    <div className="dapp">
      <header className="dapp__top">
        <a href="/" className="logo"><Mark size={24} /> Readback</a>
        <span className="pill mono">v0.1 · notary + guard</span>
        <span className="sp" />
        <a className="toplink" href="/#how">How it works</a>
        <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
      </header>

      <main className="dapp__grid">
        {/* ------------------------------------------------ transaction source */}
        <section className="panel">
          <div className="panel__head"><h2>Transaction</h2><span className="mono dim">{address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'no wallet · dry run'}</span></div>
          <p className="dim small" style={{ padding: '0 20px' }}>Each card shows what the site <em>claims</em>. Press Sign, then say what you think you’re signing. You won’t see what it really does until you’ve said it.</p>
          <div className="scenes">
            {SCENARIOS.map((s) => (
              <button key={s.id} className={`scene ${scene === s.id ? 'on' : ''}`} onClick={() => runScene(s)} disabled={busy}>
                <div className="scene__top"><span className="mono">{s.site}</span><span className="kind">{s.kind}</span></div>
                <div className="scene__claim">{s.claim}</div>
                {s.note && <div className="scene__note">{s.note}</div>}
                <div className="scene__foot"><span className="dim small">Try {s.hint}</span><span className="signbtn">Sign</span></div>
              </button>
            ))}
          </div>
          <details className="paste">
            <summary>Paste any transaction</summary>
            <div className="paste__grid">
              <select className="field" value={paste.chainId} onChange={(e) => setPaste({ ...paste, chainId: Number(e.target.value) })}><option value={8453}>Base</option><option value={84532}>Base Sepolia</option></select>
              <input className="field" placeholder="to  0x…" value={paste.to} onChange={(e) => setPaste({ ...paste, to: e.target.value })} />
              <input className="field" placeholder="data  0x…" value={paste.data} onChange={(e) => setPaste({ ...paste, data: e.target.value })} />
              <input className="field" placeholder="value in wei" value={paste.value} onChange={(e) => setPaste({ ...paste, value: e.target.value })} />
              <input className="field" placeholder="Safe address (optional)" value={paste.safe} onChange={(e) => setPaste({ ...paste, safe: e.target.value })} />
              <select className="field" value={paste.operation} onChange={(e) => setPaste({ ...paste, operation: e.target.value })}><option value="0">CALL</option><option value="1">DELEGATECALL</option></select>
            </div>
            <button className="btn" onClick={runPaste} disabled={busy} style={{ margin: '12px 20px 20px' }}>Sign this</button>
          </details>
          <div className="evidence">
            <div className="mono dim small" style={{ marginBottom: 8 }}>ON-CHAIN EVIDENCE · BASE SEPOLIA</div>
            <a href={EVIDENCE.guard} target="_blank" rel="noreferrer">ReadbackGuard, verified source ↗</a>
            <a href={EVIDENCE.honest} target="_blank" rel="noreferrer">Attested transfer, executed ↗</a>
            <a href={EVIDENCE.blocked} target="_blank" rel="noreferrer">Bybit shape on guarded Safe, reverted ↗</a>
            <a href={EVIDENCE.control} target="_blank" rel="noreferrer">Same tx on unguarded Safe, taken over ↗</a>
          </div>
        </section>

        {/* ------------------------------------------------ readback */}
        <section className="panel readback">
          <div className="panel__head">
            <h2>Readback</h2>
            <span className={`status ${phase}`}><i />{STATUS[phase]}</span>
          </div>
          <div className="rb__body">
            <Signal state={sig} level={level} />
            <div className="heard">
              {heard || partial ? <>“{heard}{partial && <span className="partial">{heard ? ' ' : ''}{partial}</span>}”</> : <span className="ph">{active ? `Say ${active.hint}` : 'Pick a transaction and press Sign.'}</span>}
            </div>
            {phase === 'idle' && !result && (
              <div className="idle">
                <div><b>01 · SIGN</b><span>Pick a transaction. Readback intercepts it before your wallet sees it.</span></div>
                <div><b>02 · SAY IT</b><span>Tell it what you think you’re signing. It never shows you first.</span></div>
                <div><b>03 · READ BACK</b><span>The notary decodes the real calldata and says whether you were right.</span></div>
              </div>
            )}
            {agentSaid && (
              <div className="voice">
                <span className="mono dim small">VOICE</span>
                <p>{agentSaid}</p>
                {fidelity && <span className={`fid ${fidelity}`}>{fidelity === 'verbatim' ? 'spoken word for word' : 'paraphrased · screen is authoritative'}</span>}
              </div>
            )}

            {result && (
              <>
                <div className="cols">
                  <div className="col">
                    <h3>You said</h3>
                    <dl>{Object.entries(result.intent).filter(([k, v]) => v != null && k !== 'confirm').map(([k, v]) => <div key={k}><dt>{k.replace('_', ' ')}</dt><dd>{String(v)}</dd></div>)}</dl>
                  </div>
                  <div className="col">
                    <h3>It actually does</h3>
                    {result.actions.map((x, i) => <p key={i}>{cap(sayAction({ ...x, amount: x.amount === 'unlimited' ? x.amount : x.amount != null ? BigInt(x.amount) : x.amount, amountIn: x.amountIn != null ? BigInt(x.amountIn) : undefined, minOut: x.minOut != null ? BigInt(x.minOut) : undefined }, result.facts, sender))}{x.batch ? <span className="dim"> · in a {x.batch} batch</span> : null}.</p>)}
                  </div>
                </div>
                <div className={`verdict ${result.verdict === 'match' ? 'go' : 'stop'}`}>
                  <span className="tag">{result.verdict === 'match' ? 'MATCH' : 'STOP'}</span>
                  <span>{result.spoken.replace(/^(Stop\.|That matches\.)\s*/, '')}</span>
                </div>
                {result.findings.length > 0 && (
                  <ul className="findings">
                    {result.findings.map((f, i) => (
                      <li key={i}><a href="/#rules" className="rid mono">{f.rule}</a><span className={`lvl ${f.level}`}>{f.level}</span><span>{f.text}{f.detail && <small>{f.detail}</small>}</span></li>
                    ))}
                  </ul>
                )}
                {result.attestation && (
                  <div className="attest" data-bytes={result.attestation.bytes} data-safe-tx-hash={result.safe.safeTxHash}>
                    <div className="attest__head"><span className="mono small">NOTARY ATTESTATION · EIP-712</span><button className="copy" onClick={() => { navigator.clipboard.writeText(result.attestation.bytes); setCopied(true); setTimeout(() => setCopied(false), 1400); }}>{copied ? 'Copied' : 'Copy bytes'}</button></div>
                    <dl>
                      <div><dt>Safe tx hash</dt><dd className="mono">{result.safe.safeTxHash}</dd></div>
                      <div><dt>Intent hash</dt><dd className="mono">{result.attestation.intentHash}</dd></div>
                      <div><dt>Guard</dt><dd className="mono"><a href={`${EXPLORERS[84532]}/address/${result.attestation.guard}`} target="_blank" rel="noreferrer">{result.attestation.guard}</a></dd></div>
                      <div><dt>Expires</dt><dd>{new Date(result.attestation.expiry * 1000).toLocaleTimeString()}</dd></div>
                    </dl>
                    <p className="dim small">Append these bytes after the owners’ signatures. ReadbackGuard verifies them on-chain; without them the Safe refuses to execute.</p>
                  </div>
                )}
                {result.safe && !result.attestation && result.verdict === 'block' && (
                  <p className="dim small" style={{ marginTop: 12 }}>No attestation was signed. On a Safe with ReadbackGuard installed, this transaction cannot execute even with every owner’s signature. <a href={EVIDENCE.blocked} target="_blank" rel="noreferrer" className="u">See it revert on-chain ↗</a></p>
                )}
              </>
            )}

            {released && released !== 'attested' && released !== 'dry' && <p className="small" style={{ marginTop: 14 }}>Sent: <a className="mono u" href={`${explorer}/tx/${released}`} target="_blank" rel="noreferrer">{released.slice(0, 12)}…</a></p>}
            {released === 'dry' && <p className="dim small" style={{ marginTop: 14 }}>Released. No wallet is connected, so nothing was sent.</p>}
            {error && <p className="err">{error}</p>}

            <div className="rb__actions">
              {busy && <button className="btn" onClick={stop}>Stop</button>}
              {!busy && active && <button className="btn" onClick={() => runScene(active)}>Try again</button>}
            </div>

            {log.length > 0 && (
              <ol className="log mono">
                {log.map((l, i) => <li key={i}><span className="dim">{l.t}</span> {l.text}</li>)}
                {marks.current.verdict && <li className="dim">end of speech → notary verdict: {ms(marks.current.stopped, marks.current.verdict)}</li>}
              </ol>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
