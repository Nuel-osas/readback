import Providers from './providers';
import Console from './Console';

export default function Home() {
  return (
    <Providers>
      <div className="wrap">
        <header className="top">
          <div className="brand">
            <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#141414" /><path d="M5 12h2M8 9v6M11 6v12M14 9v6M17 11v2" stroke="#f4f1ea" strokeWidth="1.8" strokeLinecap="round" /></svg>
            Readback
          </div>
          <span className="chip">voice-verified signing</span>
          <span className="sp" />
          <a className="btn" href="https://github.com/Nuel-osas/readback">Code</a>
        </header>

        <section className="hero">
          <div className="kicker">Built on AssemblyAI · Base</div>
          <h1>Say what you think you’re signing.</h1>
          <p>
            Readback listens, decodes what the transaction really does, and stops it when the two don’t match.
            Pilots have read every clearance back to the tower for seventy years, because the mistake shows up in the gap
            between what was said and what was meant.
          </p>
        </section>

        <Console />

        <section className="how">
          <h2>Bybit lost $1.5 billion to a transaction its signers couldn’t read.</h2>
          <div className="steps">
            <div className="step"><div className="n">01 · HEAR</div><h3>AssemblyAI Universal-Streaming</h3><p>Your words stream in live. Turn detection knows when you’ve finished, even mid-address. Wallet vocabulary is primed, but never with the tokens in the transaction under review, so the transcript can’t be nudged into agreeing with it.</p></div>
            <div className="step"><div className="n">02 · UNDERSTAND</div><h3>AssemblyAI LLM Gateway</h3><p>What you said becomes a strict JSON intent: action, amount, asset, recipient. The model only listens. It never sees the transaction and never judges it.</p></div>
            <div className="step"><div className="n">03 · COMPARE</div><h3>Deterministic rules</h3><p>The calldata is decoded, nested calls unwrapped, every address checked on Base. Plain rules compare the two. Every sentence the agent speaks traces to one of them.</p></div>
          </div>
          <div className="rule">The model only listens. <span>The rules decide.</span> A safety check you can’t read is just another thing you’re trusting blindly.</div>
        </section>

        <footer className="foot">
          Readback · built for the AssemblyAI Voice Agent Hackathon, September 2026 · addresses are checked live on Base mainnet via Blockscout
        </footer>
      </div>
    </Providers>
  );
}
