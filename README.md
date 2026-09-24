# Readback

**Say what you think you're signing.** Readback listens, decodes what the transaction really does, and stops it when the two don't match.

In February 2025 Bybit lost $1.5 billion. Its signers approved what their screens showed as a routine transfer. The transaction was a Safe `DELEGATECALL` that handed the wallet to an attacker. Every signer looked at it. Nobody could read it.

Pilots solved this problem decades ago. Every clearance from the tower is read back aloud, and the controller listens for the mismatch. It works because intent and instruction travel on separate channels. Readback puts that loop in front of a wallet signature.

## What happens

| You click | You say | Readback says |
|---|---|---|
| "Swap 100 USDC for ETH" on a Uniswap page | "swap a hundred USDC for ETH" | *That matches. It will swap 100 USDC for at least 0.02 WETH through the Uniswap swap router, paid to you. Say confirm to sign.* |
| "Claim your 500 BASE airdrop" | "claim my airdrop" | *Stop. A claim should give you something. This lets a wallet address with no history at all take your USDC, all of it, forever.* |
| "Move 1 ETH to your cold wallet" on a Safe | "send one ETH to my cold wallet" | *Stop. This doesn't send anything. It hands control of your Safe to an unverified contract, deployed 1 hour ago. That is how Bybit lost one and a half billion dollars.* |

Those are the real outputs, from real calldata against real Base mainnet contracts, with every address checked live.

## How it works

```
 mic ──► AssemblyAI Universal-Streaming ──► transcript ──► AssemblyAI LLM Gateway ──► intent (strict JSON)
                                                                                          │
 tx  ──► calldata decoder ──► actions ──► Base facts (Blockscout) ─────────────────► deterministic rules ──► verdict ──► voice
```

1. **Hear.** AssemblyAI Universal-Streaming over a WebSocket, 16 kHz PCM from an AudioWorklet. Turn detection decides when you've finished, with extra silence allowed so an amount or an address isn't cut off mid-read. Wallet vocabulary is primed with `keyterms_prompt`, **but never with the tokens in the transaction under review**: priming recognition with what the transaction contains would bias the transcript toward agreeing with it, which is the one thing a readback must never do.
2. **Understand.** The final transcript goes to the AssemblyAI LLM Gateway with a strict JSON schema: action, amount, asset, recipient, confirm. The model never sees the transaction and never judges it. It only records what you said.
3. **Compare.** The calldata is decoded into a small vocabulary of actions (transfer, approve, approval for all, swap, delegatecall, unknown). Router multicalls and Safe `execTransaction` are unwrapped recursively, because the dangerous part is usually the part the wallet screen doesn't show. Every address is checked on Base: contract or wallet, verified source, deployment age, history. Then plain rules compare intent with action.

**The model only listens. The rules decide.** Every sentence the agent speaks traces back to one rule in [`lib/compare.js`](lib/compare.js). A safety check you can't read is just one more thing you're trusting blindly.

## What it catches

| Shape | Rule |
|---|---|
| Fake airdrop, fake mint, "connect wallet" that approves | A claim should give you something; this lets someone take something |
| Unlimited approval to a new, unverified or history-less address | Blocked outright |
| Safe `DELEGATECALL` (the Bybit shape) | Always blocked, whatever you said |
| Swap whose output goes to someone else | Blocked |
| Amount, asset or recipient different from what you said | Blocked, and the difference is read out |
| Calldata nothing can decode | Blocked: don't sign what nobody can read |
| Unlimited approval to a known router, zero slippage protection | Allowed, with a spoken warning |

## One line to integrate

Readback wraps any EIP-1193 provider. Nothing else about the provider changes:

```js
const provider = withReadback(window.ethereum, review);
```

If the readback blocks, the dapp gets the standard `4001 user rejected` error, exactly as if the user had clicked Reject.

## Run it

```bash
npm install
cp .env.example .env.local     # ASSEMBLYAI_API_KEY, and optionally ELEVENLABS_API_KEY for the voice
npm test                       # the rules, no keys needed
npm run dev
```

Without an ElevenLabs key the agent speaks with the browser's own voice. Without a wallet, Readback runs the whole loop and sends nothing.

## Tests

`npm test` runs 14 cases against real encoded calldata: the honest swap, a multicall-wrapped swap, the airdrop approval, the Bybit delegatecall, a Safe CALL unwrapped to its inner transfer, a tenfold amount, a swap paid to someone else, zero slippage, an unlimited approval to a known router, a malicious setApprovalForAll, unreadable calldata, a correct address read aloud, a wrong one, and a check that nothing hexadecimal is ever spoken.

## Notes

The addresses standing in for bad actors in the demo are real on-chain states picked for their properties: one with no history, one unverified contract freshly deployed on Base. Readback describes them only from what the chain reports and makes no claim about who controls them.

Built for the AssemblyAI Voice Agent Hackathon, September 2026. MIT licensed.
