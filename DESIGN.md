# Readback: design

Status: architecture locked. Remaining gates need the AssemblyAI key or a fork run (§10).

## 1. The real question

Not "a voice wallet." At Bybit, **the signer's screen was the compromised channel**:
Safe{Wallet}'s UI showed a transfer, the hardware wallets signed a `DELEGATECALL`
that replaced the Safe's implementation. Every signer looked; nobody could read it.

So the question is: *give intent a second channel the attacker doesn't control, and
make the chain refuse anything that didn't pass through it.*

- **System of record:** the exact transaction (its Safe tx hash, nonce-bound) and the
  hash of what the signer said about it.
- **Regenerable:** every description, decode, and spoken sentence. All derived.

## 2. The dominant numbers

| Number | Value | Source |
|---|---|---|
| Bybit loss, one blind-signed tx | ~$1.46B | incident reports (Feb 21 2025) |
| Real Safe txs on Base that are `DELEGATECALL` | **21.6%** (81/375) | measured, §10 M2 |
| ...of which to Safe's own MultiSend contracts | **100%** (81/81) | measured |
| Distinct active Safes fully readable by the typed decoder | **38.7%** (29/75) | measured, §10 M1 |
| Unreadable txs from 3 operational bots | 195 of 253 | measured |

The second and third lines killed a rule before it shipped (§5).

## 3. Precedents read at the source

| Precedent | We take | We reject |
|---|---|---|
| **Aviation readback / hearback** | Intent and instruction on separate channels; the listener checks the mismatch | nothing; it's the thesis |
| **Safe Research Guardrail** (v1.5.0+) | `DELEGATECALL` allowlist seeded with MultiSendCallOnly; delayed guard removal | rebuilding it: Readback defers to it where installed |
| **Safe Research Fiducia** (`src/Fiducia.sol`, 737 lines) | Cosigner transport: signature appended to Safe `signatures` with a 32-byte length suffix; `SignatureChecker` so EOA or ERC-1271 cosigners both work; nonce − 1 because the guard runs post-increment | **(a)** cosign hash with gas fields zeroed ("Not same as Safe Tx Hash", their comment): gas refund params go unbound. **(b)** `_allowanceByCosigner`: one cosigned tx permanently allowlists its `(to, selector, operation)`. Cosign `USDC.approve(Uniswap, 100)` once and every later `USDC.approve` to any spender passes unchecked. Incompatible with per-transaction readback. **(c)** `UNLICENSED`, unaudited: cannot be redistributed. |
| **ERC-7730 clear signing** + Sourcify reference lib | `intent` / `interpolatedIntent` as the natural thing to compare speech against; breadth across protocols | using it for the attack primitives, where rules need typed semantics (pending M4-7730) |
| **AssemblyAI Voice Agent API** | One WebSocket: STT, ~300 ms turn detection, barge-in, tool calling, TTS. **Tool calling *is* intent extraction**: the agent fills `report_intent(action, amount, …)` from speech. | Letting the agent's voice be the authority. It has no verbatim-speech command except `greeting`, so it can paraphrase. Enforcement never depends on what it says. |

## 4. Where the analogy breaks in our favour

Every existing cosigner (Varangian, simulators, threat feeds) checks the transaction
**against the world**: known-bad addresses, simulated balance changes. None checks it
**against the signer**. A simulator happily passes a perfectly valid transfer to the
wrong address. Readback is the first cosigner whose input is the human's stated intent.

And the Safe gives us replay protection for free: the attestation binds the exact
nonce-bound Safe tx hash, so no replay code exists.

## 5. Rejections

1. **"Always block DELEGATECALL" (our own RB-002).** Measured 100% false positives on
   real traffic. Replaced: delegatecall to Safe's canonical MultiSend/MultiSendCallOnly
   is unpacked and each inner call judged; any other target blocks.
2. **Writing a third unaudited guard with bespoke policy.** ReadbackGuard is the minimum:
   per-transaction cosigner requirement plus a delayed exit. Nothing else.
3. **Fiducia's zeroed-gas hash and pattern-learning** (see §3).
4. **An LLM deciding safety.** It only fills intent fields. 20 deterministic rules decide.
5. **A second TTS vendor.** The sponsor's Voice Agent API speaks.
6. **Priming speech recognition with the transaction's tokens.** Biases the transcript
   toward agreeing with the transaction. Vocabulary comes from the whole registry only.
7. **Vercel for audio.** No WebSocket servers there. v0.1: browser ↔ AssemblyAI direct.

## 6. The invariant

> **No Safe transaction executes unless the notary has signed its exact Safe tx hash,
> and the notary signs only when every decoded effect matches what the signer said.**

Falsifiable by fork test (§10 M3) and by the conformance vectors. From the scar:
Bybit's owners each signed a hash they had not read.

## 7. Native primitives

| Domain mechanic | Native primitive used |
|---|---|
| Bind approval to one exact tx | Safe tx hash (EIP-712, nonce inside) |
| Carry the cosigner signature | trailing bytes of Safe `signatures` (Fiducia's format) |
| Hook every execution | Safe transaction guard `checkTransaction` |
| Hear and extract intent | Voice Agent API tool call arguments |
| Describe unknown protocols | ERC-7730 `interpolatedIntent` |

## 8. Trust tiers

| Tier | Trusted with | Can a compromised UI defeat it? |
|---|---|---|
| T0 chain: ReadbackGuard | refusing txs without a notary signature | No |
| T1 notary: server | decode, facts, rules, signing | No for calldata; **yes for transcript in v0.1** |
| T2 client | audio, display | Yes, by assumption |

**Open gap, stated plainly:** in v0.1 the notary accepts the transcript from the client.
A fully compromised client could forge speech matching a malicious transaction.
v0.2 closes it by relaying audio through the notary (needs a WebSocket host, not Vercel)
so the notary hears the signer itself.

## 9. Economics

| Item | Cost |
|---|---|
| Voice Agent API | $4.50/hr, ~15 s per readback → **~$0.019 per signature** |
| LLM Gateway | not available on this account tier (measured: "no access to this model"). Not needed: tool calling does intent extraction. |
| Notary compute, Blockscout, RPC | free tier |
| Ceiling | **< $0.02 per readback** |

## 10. Measurements

| Gate | Result |
|---|---|
| M1 decoder coverage, 375 real Safe txs, 75 distinct Safes on Base | first build 32.5% of txs, **inflated**: it counted 81 unopened delegatecalls as readable. After unpacking batches: 17.1% of txs, 35.6% of non-bot txs, **38.7% of distinct Safes fully readable**. Three operational bots produce 195 of the unreadable txs. |
| M2 delegatecall share / false-positive rate of old RB-002 | 21.6% / 100% |
| M3 fork test on Base: Bybit-shape reverts, match executes, replay fails | pending |
| M4-7730 ERC-7730 coverage of inner human-shaped calls | 2.8% naive, **11.2%** (20/179) with proxy→implementation resolution; 0/375 outer Safe calls. Decision: typed decoders primary for attack primitives, ERC-7730 as the breadth layer. |
| M2b real MultiSend delegatecalls decoded without false block after fix | **77/77**, kept as test fixtures |
| M5 intent extraction, 15 synthesized utterances, 3 speakers, live Voice Agent API | run 1: 12/15. Two real schema gaps ("buy X with Y" direction; threshold number) fixed in the schema descriptions. Run 2: **15/15** (one scorer expectation corrected: "dollars" is what was said). |
| M6 end-of-speech → verdict audio | median **2.5 s** to intent (turn detection + tool-call decision inside the API) + **0.66 s** to first verdict audio. **~3.2 s total in the headless API run; see M6b for the browser, where the target is met for wallet transactions.** Our rules add ~0.1 s. Comparable to a hardware-wallet confirmation. |
| M6b end of speech → verdict on screen, in a real browser, full app | **1.86–1.96 s** for wallet transactions after prefetching chain facts while the signer speaks (notary 2,187 ms → 10–14 ms). **2.9–3.4 s** for Safe transactions: the notary reads the Safe's nonce and hash from chain on every request, deliberately uncached. |
| M8 full loop in a real browser (recorded speech in, cued turns) | airdrop → STOP RB-004; swap → MATCH → "confirm" → released; Safe honest send → MATCH → attestation; Bybit shape → STOP RB-002, no attestation. All verdicts spoken word for word. |
| M9 voice-produced attestation executed on-chain | a spoken readback's attestation executed a Safe transaction through ReadbackGuard on Base Sepolia: `0x7ee42abc…0276` |
| M7 verdict spoken verbatim (paraphrase risk) | **15/15 + 15/15** across both runs. Enforcement still never depends on it. |

## 10b. What the unreadable share means

Roughly 6 in 10 active Safes in the sample sent at least one transaction that neither
the typed decoders nor the ERC-7730 registry could read. Readback's answer to those is
RB-001: "I can't read this. Don't sign something nobody can read." That is not a
coverage failure to hide. It is the Bybit condition, measured: most multisigs routinely
sign calldata no open tool can explain.

## 11. Moat

The notary is cosigner-as-a-service for DAOs and treasuries. Every attested transaction
emits the intent hash on-chain: after an incident, "what did the signers say they were
approving?" has a verifiable answer. Nobody else records that.
