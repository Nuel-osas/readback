# Readback

**Say what you think you're signing.** Readback is a voice-verified signing protocol. It hears what you mean to sign, decodes what the transaction really does, and stops it when the two don't match. On a Safe, a guard contract refuses any transaction that wasn't read back, so a compromised screen can't get a signature through.

**Live:** https://readback-phi.vercel.app · **dApp:** https://readback-phi.vercel.app/app

In February 2025 Bybit lost $1.46B. Its signers were shown a routine transfer; the hardware wallets signed a Safe `DELEGATECALL` that replaced the Safe's implementation. Every check happened on the channel the attacker controlled. Aviation solved this decades ago: every clearance is read back aloud, and the controller listens for the mismatch. Readback puts that loop in front of a signature.

## Proof on a public chain

Base Sepolia, run by [`scripts/evidence.mjs`](scripts/evidence.mjs) against two identical 2-of-2 Safes, one guarded and one not:

| | Guarded Safe | Unguarded control |
|---|---|---|
| Honest transfer | notary attested, [executed](https://sepolia.basescan.org/tx/0x1ecb75a4b62be2006ea94168e2232ec0a371ed3e6eb2fa72b05ae5f23ab42c69) | |
| Bybit-shaped `DELEGATECALL`, both owners signed | notary refused, **[reverted](https://sepolia.basescan.org/tx/0x8e3c182b7ae8eff58907db8cd6c35699049413e6f5c88958384e197f8eed8bd8)** | **[succeeded](https://sepolia.basescan.org/tx/0x7919e8e9d0556cdb54f3045e97d6f1251ffc4d4cc06682d92190ec35fe4dae11)**: implementation replaced |
| Transfer attested by a **spoken** readback in the browser | [executed](https://sepolia.basescan.org/tx/0x7ee42abc14d896c34d457be959da9bfc0956d8e1d17c657ebcf8c77f51fc0276) | |

[ReadbackGuard](https://base-sepolia.blockscout.com/address/0xAA3356D3E0237898a3A613E111625043A1614355?tab=contract) `0xAA3356D3E0237898a3A613E111625043A1614355`, verified source.

## How it works

```
 you speak ──► AssemblyAI Voice Agent API ──► intent (tool call, strict schema)
                                                   │
 transaction ──► notary: decode · chain facts · 27 rules ──► verdict ──► spoken back word for word
                                                   │
                              match on a Safe ──► EIP-712 attestation ──► ReadbackGuard verifies on-chain
```

| Layer | Trusted with | Not trusted with |
|---|---|---|
| **Hear**: AssemblyAI Voice Agent API | turning speech into an intent, and speaking the verdict | seeing the transaction, or deciding anything |
| **Decide**: notary, `@readback/core` | decoding calldata, checking addresses on Base, 27 deterministic rules, signing only matches | |
| **Enforce**: `ReadbackGuard.sol` | refusing any Safe transaction without an attestation over its exact hash | |

Design choices that came out of measuring, not guessing (details in [DESIGN.md](DESIGN.md)):

- **The model only listens.** The voice agent is never shown the transaction and can't be talked into agreeing with it. Safety is decided by rules a person can read; every finding names its rule ID.
- **You never see what it does before you say it.** Otherwise you'd just read it aloud and parrot it back.
- **MultiSend is unpacked, not blocked.** 21.6% of real Safe transactions on Base are `DELEGATECALL`s, all to Safe's own MultiSend. Our first rule would have blocked every one of them (100% false positives on 81 real transactions). Batches are now unpacked and each leg judged: 77/77 real batches decode.
- **The guard binds the full Safe tx hash.** Safe Research's Fiducia cosigner zeroes the gas fields (leaving the refund path unbound) and permanently allowlists every cosigned `(to, selector, operation)`. ReadbackGuard does neither: one attestation, one exact transaction.
- **Recovery can't brick a Safe.** Guard exit and notary rotation pass without an attestation, after a public two-day delay.

## Measured

| | |
|---|---|
| Spoken intents extracted correctly (live API, 3 voices) | **15/15** |
| Verdicts spoken word for word | **15/15**, and checked live in the app on every readback |
| Guard tests on real Safe v1.3.0 and v1.4.1 (Base mainnet fork) | **24/24**, plus a JS↔Solidity attestation vector |
| End of speech → verdict, real browser | **1.9 s** wallet txs · **2.9–3.4 s** Safe txs |
| Active Safes on Base fully readable by an open decoder | **38.7%** (29/75). For the rest: *"I can't read this. Don't sign something nobody can read."* |
| Cost per readback | **~$0.02** |

## Repository

| Path | What |
|---|---|
| `packages/core` | decoder, rule catalogue, verdicts, EIP-712 attestations. 25 tests, including 77 real Base transactions as fixtures |
| `packages/provider` | `withReadback(provider, review)`: wrap any EIP-1193 provider |
| `contracts` | `ReadbackGuard.sol` and Foundry tests on a Base fork |
| `apps/web` | landing page, dApp, notary API |
| `eval` | live Voice Agent eval and real-browser end-to-end tests with recorded speech |
| `scripts` | on-chain evidence runs |

```bash
npm install
npm test                                  # rules and decoder, no keys
cd contracts && forge test                # guard, on a Base mainnet fork
cp apps/web/.env.example apps/web/.env.local   # ASSEMBLYAI_API_KEY, NOTARY_PRIVATE_KEY, READBACK_GUARD_ADDRESS
npm run dev
```

## Honest limits

- In v0.1 the notary accepts the transcript from the browser. A fully compromised client could forge speech that matches a malicious transaction. The on-chain guard still refuses anything the notary's rules reject (like the Bybit shape) regardless of what was said. v0.2 relays audio through the notary so it hears the signer itself.
- Modules already enabled on a Safe bypass transaction guards in Safe v1.3/1.4. Readback refuses to attest `enableModule` unless it was said and the module is verified.
- The guard is unaudited. The demo runs on Base Sepolia.

Photos: Andrés Dallimonti and Benjamin Chambon, Unsplash. Built for the AssemblyAI Voice Agent Hackathon, September 2026. MIT.
