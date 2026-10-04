# Arbitrum Open House Online Buildathon: submission kit

Deadline Sun 4 Oct 2026, 15:59 UTC (16:59 WAT). Submit on HackQuest:
https://www.hackquest.io/hackathons/Arbitrum-Open-House-Singapore-Online-Buildathon
Existing projects are allowed. Requirement: deployed on an Arbitrum chain. Done.

## Project name
Readback

## One-liner
Say what you think you're signing. A Safe guard on Arbitrum refuses anything that wasn't read back.

## Short description (under 255)
A voice-verified signing protocol on Arbitrum. You say what you think you're signing, a notary decodes the real transaction, and ReadbackGuard, a Safe transaction guard, refuses any transaction that doesn't match. Understands USDG.

## Description
In February 2025 Bybit lost $1.46 billion to one transaction its signers could not read. The screen showed a transfer; the wallets signed a DELEGATECALL that handed the Safe to an attacker. Every check happened on the channel the attacker controlled.

Readback adds a second channel, the way pilots read every instruction back. You press Sign and say what you think you're signing. An AssemblyAI voice agent records your intent without ever seeing the transaction. A notary decodes the real calldata, unpacks Safe MultiSend batches, checks every address on chain, and compares the two with 27 deterministic rules. On a match it signs an EIP-712 attestation over the exact Safe transaction hash.

ReadbackGuard, deployed and verified on Arbitrum Sepolia, is a Safe transaction guard that refuses any transaction without that attestation. Owner signatures alone are no longer enough. On Arbitrum Sepolia, the same Bybit-shaped transaction, signed by both owners, reverted on a guarded Safe and replaced the implementation of an unguarded one. A Safe paying 2,500 USDG, read back by voice, was matched and attested.

Unlike Safe Research's Fiducia cosigner, the guard binds the full Safe transaction hash including gas fields, and one attestation authorises one transaction, never a pattern. Recovery is a public two-day delay, so a lost notary key cannot brick a Safe.

## Judging criteria, answered
| Criterion | Evidence |
|---|---|
| Smart contract quality | ReadbackGuard: 24 Foundry tests against real Safe v1.3.0 and v1.4.1 deployed from Safe's factories, plus a JS to Solidity attestation vector. Verified source on Arbitrum Sepolia. |
| Product-market fit | Every DAO and team treasury on Arbitrum that runs on a Safe signs transactions it cannot read. Readback installs as a guard; no migration. |
| Innovation | Voice as an independent second channel for intent. The model only listens; deterministic rules decide; the chain enforces. |
| Real problem solving | The Bybit attack, reproduced and stopped on Arbitrum Sepolia, with a control Safe that was taken over. |
| USDG | Paxos USDG on Arbitrum One and Arbitrum Sepolia is decoded, named and spoken; a 2,500 USDG Safe payment is matched and attested by voice. |

## Links
- Live dApp: https://readback-phi.vercel.app/app (Arbitrum scenarios are first)
- Site: https://readback-phi.vercel.app
- Code: https://github.com/Nuel-osas/readback
- Demo video: submission/readback-demo.mp4 (upload to YouTube, unlisted, if a link is required)
- Deck: submission/readback-deck.pdf

## Deployed on Arbitrum Sepolia (421614)
| Contract | Address |
|---|---|
| ReadbackGuard (verified) | 0xAA3356D3E0237898a3A613E111625043A1614355 |
| Guarded 2-of-2 Safe | 0x5Ae670a3b7800DA978529E82DF39E04C0FF058F0 |
| Control Safe, no guard | 0xd2CB70c017bb098a422C85f275ba711ec01Aa9b8 |
| Honest transfer, attested, executed | 0x1b5bc5e4c38cac581e019318b4e5b2d6093d161ff9bc693e2a342cd55f71c5e9 |
| Bybit shape on guarded Safe, reverted | 0xfc6bca84ad0f4ca7d5d80d701d0f6ddf7c5b4021a5e3a3ef7ee7119be11cc6df |
| Same tx on control Safe, taken over | 0xf25f47c35691624d9921631b371d663616b7faae5358beace119025eca52bbf9 |

## Tech
Solidity, Foundry, Safe, Arbitrum, Paxos USDG, AssemblyAI Voice Agent API, Next.js, viem, wagmi, Vercel
