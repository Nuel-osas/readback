import { RULES } from '@readback/core';
import ReadbackStrip from './components/ReadbackStrip';
import { Nav, Reveal } from './components/Chrome';

const GITHUB = 'https://github.com/Nuel-osas/readback';

export default function Landing() {
  return (
    <>
      <Nav />
      <Reveal />

      {/* ---------------------------------------------------------------- hero */}
      <header className="hero" id="top">
        <div className="hero__img" role="img" aria-label="An airliner cockpit at night, instruments glowing below a blue and orange horizon" />
        <div className="hero__shade" />
        <div className="wrap">
          <div className="hero__body">
            <div>
              <div className="eyebrow"><span className="dot" /> Voice-verified signing protocol</div>
              <h1>Say what you think you’re <em>signing.</em></h1>
              <p className="hero__sub">
                Readback hears what you mean to sign, decodes what the transaction really does, and
                stops it when the two don’t match. On a Safe, a guard contract refuses anything that
                wasn’t read back, so a compromised screen can’t get a signature through.
              </p>
              <div className="hero__cta">
                <a href="/app" className="btn btn--launch btn--lg">Launch dApp <span className="arrow">→</span></a>
                <a href="#how" className="btn btn--lg">How it works</a>
              </div>
            </div>
            <ReadbackStrip />
          </div>
          <div className="hero__foot">
            <span>Voice by <b>AssemblyAI Voice Agent API</b></span>
            <span>Enforced by <b>ReadbackGuard</b> for Safe</span>
            <span>Decodes <b>Base</b> mainnet, live</span>
          </div>
        </div>
      </header>

      <div className="marquee" aria-hidden="true">
        <div className="marquee__track">
          {[0, 1].map((k) => (
            <div key={k} style={{ display: 'flex', gap: 56 }}>
              <span><i>$1.46B</i> lost to <b>one blind signature</b></span>
              <span><i>21.6%</i> of real Safe transactions on Base are <b>DELEGATECALLs</b></span>
              <span><i>15/15</i> spoken intents understood</span>
              <span><i>15/15</i> verdicts spoken word for word</span>
              <span><i>77/77</i> real MultiSend batches decoded</span>
              <span><i>24/24</i> guard tests on real Safe v1.3.0 and v1.4.1</span>
              <span><i>1.9s</i> from your last word to the verdict</span>
              <span><i>~$0.02</i> per readback</span>
            </div>
          ))}
        </div>
      </div>

      {/* ---------------------------------------------------------------- problem */}
      <section className="sec" id="problem">
        <div className="wrap">
          <div className="reveal">
            <div className="sec__label">The problem</div>
            <div className="big">$1.46B<small>Bybit · February 21, 2025 · one transaction</small></div>
            <h2 style={{ marginTop: 32 }}>The screen was the attack surface.</h2>
            <p className="lead">
              Bybit’s signers were shown a routine transfer. Each one checked it. Each one signed.
              <b> Every check happened on the channel the attacker controlled.</b>
            </p>
          </div>
          <div className="timeline reveal">
            <div className="tl"><div className="n">01 · SCREEN</div><h3>The UI showed a transfer.</h3><p>Malicious JavaScript injected into Safe{'{'}Wallet{'}'}’s front end rendered a normal-looking cold-to-warm transfer.</p></div>
            <div className="tl"><div className="n">02 · SIGNATURE</div><h3>The wallets signed something else.</h3><p>The payload was operation <code>1</code>, a <code>DELEGATECALL</code> to an attacker contract. Hardware wallets showed a hash nobody could read.</p></div>
            <div className="tl"><div className="n">03 · CHAIN</div><h3>The Safe changed hands.</h3><p>Running in the Safe’s own storage, the call overwrote its implementation at slot 0. Everything drained in one transaction.</p></div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- aviation */}
      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="wrap aviation">
          <figure className="photo reveal"><figcaption>Photo: Benjamin Chambon / Unsplash</figcaption></figure>
          <div className="reveal">
            <div className="sec__label">The fix is seventy years old</div>
            <h2>Pilots read every instruction back.</h2>
            <p className="lead">
              Air traffic control never trusts that a clearance was understood. The pilot repeats it,
              the controller listens for the mismatch. It works because <b>what was meant and what was heard travel on separate channels.</b>
            </p>
            <div className="radio">
              <div className="radio__row said"><span className="who">TOWER</span><span className="line">“Climb and maintain flight level three-five-zero.”</span></div>
              <div className="radio__row back"><span className="who">PILOT</span><span className="line">“Climb and maintain three-five-zero.”</span></div>
              <div className="radio__row said"><span className="who">YOU</span><span className="line">“Send one ETH to my cold wallet.”</span></div>
              <div className="radio__row bad"><span className="who">READBACK</span><span className="line">“Stop. This hands control of your Safe to an unverified contract.”</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- how */}
      <section className="sec" id="how" style={{ background: 'var(--ink-2)' }}>
        <div className="wrap">
          <div className="reveal">
            <div className="sec__label">How it works</div>
            <h2>Hear. Decide. Enforce.</h2>
            <p className="lead">Three layers, each trusted with exactly one thing. The model only listens. The rules decide. The chain enforces.</p>
          </div>
          <div className="how">
            <div className="card reveal">
              <div className="step">01 · HEAR</div><h3>You say it.</h3><div className="by">AssemblyAI Voice Agent API</div>
              <p>One WebSocket for speech, turn detection, tool calling and voice. The agent records your words as a strict intent and never sees the transaction, so it can’t be talked into agreeing with it.</p>
              <ul><li>15/15 spoken intents extracted correctly</li><li>15/15 verdicts spoken word for word</li><li>~$0.02 per readback</li></ul>
            </div>
            <div className="card reveal">
              <div className="step">02 · DECIDE</div><h3>The notary checks it.</h3><div className="by">@readback/core · deterministic rules</div>
              <p>The calldata is decoded server-side: router multicalls and Safe MultiSend batches unwrapped, every address checked on Base. {RULES.length} plain rules compare it with what you said. No model decides.</p>
              <ul><li>Safe tx hash computed from chain, never from the browser</li><li>Signs an EIP-712 attestation only on a match</li><li>Nothing it can’t read gets signed</li></ul>
            </div>
            <div className="card reveal">
              <div className="step">03 · ENFORCE</div><h3>The chain refuses the rest.</h3><div className="by">ReadbackGuard · Safe transaction guard</div>
              <p>Every Safe transaction must carry the notary’s attestation over its exact hash. Owner signatures alone are no longer enough. A lost notary key can’t brick the Safe: exits and key changes wait out a public delay.</p>
              <ul><li>Binds the full Safe tx hash, gas fields included</li><li>One attestation, one transaction, no allowlist creep</li><li>Tested on real Safe v1.3.0 and v1.4.1</li></ul>
            </div>
          </div>
          <div className="principle reveal">A safety check you can’t read is just another thing you’re trusting blindly. <span>Every sentence Readback speaks traces to one rule you can read.</span></div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- rules */}
      <section className="sec" id="rules">
        <div className="wrap">
          <div className="reveal">
            <div className="sec__label">Readback v0.1 · rule catalogue</div>
            <h2>{RULES.length} rules. Every verdict names one.</h2>
            <p className="lead">Rendered straight from the code that runs them. <b>Danger</b> and <b>mismatch</b> block. <b>Warn</b> is said aloud before you confirm.</p>
          </div>
          <div className="rules reveal">
            {RULES.map((r) => (
              <div className="rule" key={r.id}>
                <span className="id">{r.id}</span>
                <span className={`lvl ${r.level}`}>{r.level}</span>
                <span className="txt">{r.summary}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- measured */}
      <section className="sec" id="measured" style={{ background: 'var(--ink-2)' }}>
        <div className="wrap">
          <div className="reveal">
            <div className="sec__label">Measured, not claimed</div>
            <h2>Every number here was run.</h2>
          </div>
          <div className="stats reveal">
            <div className="stat"><div className="num go">15/15</div><div className="what">spoken intents extracted correctly across three voices</div><div className="src">live Voice Agent API · eval/</div></div>
            <div className="stat"><div className="num go">15/15</div><div className="what">verdicts spoken word for word, never softened</div><div className="src">live Voice Agent API · eval/</div></div>
            <div className="stat"><div className="num go">24/24</div><div className="what">guard tests on real Safe v1.3.0 and v1.4.1 contracts</div><div className="src">Foundry · Base mainnet fork</div></div>
            <div className="stat"><div className="num go">77/77</div><div className="what">real MultiSend batches decoded, none falsely blocked</div><div className="src">Base Safe transactions</div></div>
            <div className="stat"><div className="num amber">21.6%</div><div className="what">of real Safe transactions on Base are DELEGATECALLs</div><div className="src">375 txs, 75 Safes</div></div>
            <div className="stat"><div className="num stop">100%</div><div className="what">false positives from our first “always block DELEGATECALL” rule. Measured, then fixed.</div><div className="src">81/81 went to Safe’s own MultiSend</div></div>
            <div className="stat"><div className="num amber">38.7%</div><div className="what">of active Safes sent only transactions an open decoder could fully read</div><div className="src">29/75 · ERC-7730 adds 11.2% of calls</div></div>
            <div className="stat"><div className="num go">1.9s</div><div className="what">from the end of your sentence to the verdict, in a real browser. Safe transactions: 2.9 to 3.4s.</div><div className="src">notary 2,187ms → 12ms after prefetching</div></div>
          </div>
          <p className="honest reveal">The misses are on the page on purpose. Most multisigs routinely sign calldata no open tool can explain. For those, Readback’s answer is the only honest one: <i>“I can’t read this. Don’t sign something nobody can read.”</i></p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- build */}
      <section className="sec" id="build">
        <div className="wrap">
          <div className="reveal">
            <div className="sec__label">For builders</div>
            <h2>One line for a wallet. One transaction for a Safe.</h2>
          </div>
          <div className="codes reveal">
            <div className="code">
              <div className="code__head"><span>wallet or dapp</span><span>@readback/provider</span></div>
              <pre><span className="c">{'// every eth_sendTransaction is read back first'}</span>{'\n'}<span className="k">import</span>{' { withReadback } '}<span className="k">from</span> <span className="s">'@readback/provider'</span>{'\n\n'}<span className="k">const</span>{' provider = withReadback(window.ethereum, review)\n\n'}<span className="c">{'// a block throws 4001, exactly like the user\n// clicked Reject'}</span></pre>
            </div>
            <div className="code">
              <div className="code__head"><span>Safe</span><span>ReadbackGuard.sol</span></div>
              <pre><span className="c">{'// 1. point the guard at the notary'}</span>{'\nguard.'}<span className="k">setNotary</span>{'(notary)\n\n'}<span className="c">{'// 2. install it on the Safe'}</span>{'\nsafe.'}<span className="k">setGuard</span>{'(guard)\n\n'}<span className="c">{'// from now on: owners + notary, or nothing.\n// exit any time: scheduleExit(), wait 2 days'}</span></pre>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- cta */}
      <section className="cta">
        <div className="wrap reveal">
          <h2>Read it back before you sign it.</h2>
          <div className="hero__cta" style={{ justifyContent: 'center' }}>
            <a href="/app" className="btn btn--launch btn--lg">Launch dApp <span className="arrow">→</span></a>
            <a href={GITHUB} className="btn btn--lg">Read the code</a>
          </div>
        </div>
      </section>

      <footer className="wrap foot">
        <span>Readback · built for the AssemblyAI Voice Agent Hackathon, September 2026 · MIT</span>
        <span className="credits">Cockpit photo by Andrés Dallimonti, tower by Benjamin Chambon, both on Unsplash. <a href={GITHUB}>GitHub</a> · <a href={`${GITHUB}/blob/main/DESIGN.md`}>Design</a></span>
      </footer>
    </>
  );
}
