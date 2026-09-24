'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useWalletClient } from 'wagmi';
import { decodeTx, addressesOf } from '../lib/decode.js';
import { readback, sayAction } from '../lib/compare.js';
import { listen } from '../lib/listen.js';
import { speak, hush } from '../lib/speak.js';
import { withReadback } from '../lib/guard.js';
import { SCENARIOS, DEMO_SENDER } from '../lib/scenarios.js';

const YES = /\b(confirm|confirmed|yes|yeah|yep|go ahead|do it|sign it|send it)\b/i;
const NO = /\b(no|nope|cancel|stop|abort|don'?t)\b/i;
const BARS = 18;

export default function Console() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const sender = address ?? DEMO_SENDER;

  const [scene, setScene] = useState(null);
  const [phase, setPhase] = useState('idle');
  const [partial, setPartial] = useState('');
  const [said, setSaid] = useState('');
  const [agent, setAgent] = useState('');
  const [intent, setIntent] = useState(null);
  const [actions, setActions] = useState([]);
  const [facts, setFacts] = useState({});
  const [result, setResult] = useState(null);
  const [levels, setLevels] = useState(() => Array(BARS).fill(0));
  const [error, setError] = useState('');
  const [sent, setSent] = useState(null);
  const [custom, setCustom] = useState({ to: '', data: '', value: '' });

  const session = useRef(null);
  const waiting = useRef(null);

  const nextTurn = () => new Promise((res) => { waiting.current = res; });
  const say = async (text) => {
    setAgent(text);
    session.current?.mute(true);
    await speak(text);
    session.current?.mute(false);
  };

  const stopListening = () => { session.current?.stop(); session.current = null; };
  useEffect(() => () => { stopListening(); hush(); }, []);

  /** The spoken readback. Resolves true only on a match followed by a spoken confirm. */
  const review = useCallback(async (tx) => {
    setError(''); setSaid(''); setPartial(''); setIntent(null); setResult(null); setSent(null);
    const decoded = decodeTx(tx);
    setActions(decoded);
    const factsP = fetch('/api/facts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ addresses: addressesOf(decoded) }) })
      .then((r) => r.json()).catch(() => ({}));

    try {
      session.current = await listen({
        onPartial: setPartial,
        onTurn: (t) => { setPartial(''); const w = waiting.current; waiting.current = null; w?.(t); },
        onLevel: (l) => setLevels((v) => [...v.slice(1), Math.min(1, l * 3)]),
        onError: (e) => setError(e.message),
        onState: (s) => s === 'listening' && setPhase((p) => (p === 'asking' ? 'asking' : 'listening')),
      });
    } catch (e) {
      setError(/ASSEMBLYAI_API_KEY/.test(e.message) ? 'The AssemblyAI key is not configured on this deployment.' : `Microphone or connection failed: ${e.message}`);
      setPhase('error');
      return false;
    }

    setPhase('asking');
    await say('What are you signing?');
    setPhase('listening');
    const heard = await nextTurn();
    setSaid(heard);
    setPhase('thinking');

    const [intentRes, f] = await Promise.all([
      fetch('/api/intent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ transcript: heard }) }).then((r) => r.json()),
      factsP,
    ]);
    if (!intentRes.intent) { setError(intentRes.error || 'Could not understand that.'); setPhase('error'); stopListening(); return false; }
    setIntent(intentRes.intent); setFacts(f);

    const r = readback(intentRes.intent, decoded, f, tx.from);
    setResult(r);
    setPhase(r.verdict === 'block' ? 'blocked' : 'confirming');
    await say(r.spoken);

    if (r.verdict === 'block') { stopListening(); return false; }

    for (let i = 0; i < 3; i++) {
      const reply = await nextTurn();
      setSaid(reply);
      if (YES.test(reply) && !NO.test(reply)) { stopListening(); return true; }
      if (NO.test(reply)) { await say('Cancelled. Nothing was signed.'); stopListening(); setPhase('cancelled'); return false; }
      await say('Say confirm to sign, or cancel.');
    }
    stopListening(); setPhase('cancelled'); return false;
  }, []);

  /** A dapp calling its provider. The provider is wrapped once; that is the whole integration. */
  const run = async (buildTx, id) => {
    hush(); stopListening();
    setScene(id);
    const base = walletClient
      ? { request: (a) => walletClient.request(a) }
      : { request: async () => null }; // no wallet connected: nothing can be sent
    const provider = withReadback(base, review);
    const tx = buildTx(sender);
    try {
      const hash = await provider.request({ method: 'eth_sendTransaction', params: [tx] });
      setPhase('sent');
      setSent(hash ?? 'dry');
      await say(hash ? 'Sent to your wallet.' : 'That would now go to your wallet. No wallet is connected, so nothing was sent.');
    } catch (e) {
      if (e?.code !== 4001) setError(e?.shortMessage || e?.message || 'Wallet error');
    }
  };

  const runCustom = () => {
    const to = custom.to.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(to)) { setError('Paste a 0x address in "to".'); return; }
    run((me) => ({ from: me, to, data: custom.data.trim() || '0x', value: custom.value.trim() ? `0x${BigInt(custom.value.trim()).toString(16)}` : '0x0' }), 'custom');
  };

  const active = SCENARIOS.find((s) => s.id === scene);
  const busy = ['asking', 'listening', 'thinking', 'confirming'].includes(phase);
  const dot = phase === 'listening' || phase === 'confirming' ? 'live' : phase === 'blocked' ? 'stop' : phase === 'sent' ? 'go' : '';
  const label = { idle: 'Waiting for a transaction', asking: 'Asking', listening: 'Listening', thinking: 'Decoding and checking', confirming: 'Matched, waiting for confirm', blocked: 'Blocked', sent: 'Released to wallet', cancelled: 'Cancelled', error: 'Error' }[phase];

  return (
    <div className="console" id="try">
      <section className="card">
        <div className="browser"><div className="dots"><i /><i /><i /></div><div className="url">{active?.site ?? 'any dapp'}</div></div>
        <div className="card__body">
          <p className="muted" style={{ marginBottom: 12 }}>Three sites, three transactions. Each card shows what the site <em>says</em> it does.</p>
          {SCENARIOS.map((s) => (
            <button key={s.id} className={`scene ${scene === s.id ? 'on' : ''}`} onClick={() => run(s.build, s.id)} disabled={busy}>
              <div className="scene__site">{s.site}</div>
              <div className="scene__claim">{s.claim}</div>
              {s.note && <div className="scene__note">{s.note}</div>}
              <span className="scene__cta">Sign</span>
            </button>
          ))}
          <details className="paste">
            <summary>Or paste any transaction</summary>
            <input className="field" placeholder="to (0x…)" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
            <input className="field" placeholder="data (0x…)" value={custom.data} onChange={(e) => setCustom({ ...custom, data: e.target.value })} />
            <input className="field" placeholder="value in wei (optional)" value={custom.value} onChange={(e) => setCustom({ ...custom, value: e.target.value })} />
            <button className="btn" style={{ marginTop: 10 }} onClick={runCustom} disabled={busy}>Sign this</button>
          </details>
          <p className="muted" style={{ marginTop: 10 }}>
            {address ? <>Signing as <span className="mono">{address.slice(0, 6)}…{address.slice(-4)}</span> on Base.</> : 'No wallet connected: Readback runs fully, but nothing is ever sent.'}
          </p>
        </div>
      </section>

      <section className="card">
        <div className="card__head">
          <h2>Readback</h2>
          <div className="state"><span className={`dot ${dot}`} />{label}</div>
        </div>
        <div className="card__body">
          <div className="meter" aria-hidden="true">{levels.map((l, i) => <i key={i} style={{ height: `${4 + l * 24}px`, opacity: busy ? 1 : 0.25 }} />)}</div>

          <div className="said">
            {said || partial ? <>“{said}{partial && <span className="partial">{said ? ' ' : ''}{partial}</span>}”</> : <span className="ph">{active ? active.hint : 'Pick a transaction on the left.'}</span>}
          </div>
          {agent && <div className="agent">{agent}</div>}

          {(intent || actions.length > 0) && (
            <div className="strips">
              <div className="strip">
                <h3>You said</h3>
                {intent ? (
                  <dl className="kv">
                    <dt>action</dt><dd>{intent.action}</dd>
                    {intent.amount != null && <><dt>amount</dt><dd>{intent.amount}</dd></>}
                    {intent.token && <><dt>asset</dt><dd>{intent.token}</dd></>}
                    {intent.token_out && <><dt>for</dt><dd>{intent.token_out}</dd></>}
                    {intent.recipient && <><dt>to</dt><dd>{intent.recipient}</dd></>}
                  </dl>
                ) : <p className="muted">Listening…</p>}
              </div>
              <div className="strip">
                <h3>It actually does</h3>
                {actions.map((x, i) => <p key={i}>{sayAction(x, facts, sender).replace(/^./, (c) => c.toUpperCase())}.</p>)}
              </div>
            </div>
          )}

          {result && (
            <>
              <div className={`verdict ${result.verdict}`}>
                <b><span>{result.verdict === 'block' ? 'STOP' : 'MATCH'}</span></b>
                <div>{result.spoken.replace(/^(Stop\.|That matches\.)\s*/, '').replace(/\s*Say confirm to sign\.$/, '')}</div>
              </div>
              {result.findings.length > 0 && (
                <ul className="findings">
                  {result.findings.map((f, i) => <li key={i}><span className={`lv ${f.level}`}>{f.level}</span><div>{f.text}{f.detail && <small>{f.detail}</small>}</div></li>)}
                </ul>
              )}
            </>
          )}

          {sent && sent !== 'dry' && <p className="muted" style={{ marginTop: 12 }}>Transaction <a className="mono" href={`https://basescan.org/tx/${sent}`} target="_blank" rel="noreferrer">{sent.slice(0, 10)}…</a></p>}
          {error && <p className="err">{error}</p>}

          <div className="actions-row">
            {busy && <button className="btn" onClick={() => { hush(); stopListening(); setPhase('cancelled'); waiting.current?.('cancel'); }}>Stop listening</button>}
            {!address && <ConnectButton label="Connect a wallet" showBalance={false} chainStatus="none" />}
          </div>
        </div>
      </section>
    </div>
  );
}
