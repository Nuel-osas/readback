# AssemblyAI Voice Agent Hackathon: submission kit

Deadline Wed Sep 30 2026. Enrol on lablab.ai before submitting.

## Title
Readback

## Short description (255 max)
A voice agent that stops blind signing. Say what you think you're signing; Readback decodes the real transaction, speaks back whether they match, and a Safe guard contract refuses anything that wasn't read back.

## Long description
In February 2025 Bybit lost $1.46 billion to one transaction its signers could not read. Their screen showed a transfer; their wallets signed a DELEGATECALL that handed the Safe to an attacker. Every check happened on the channel the attacker controlled.

Pilots solved this decades ago with readback: every instruction is repeated aloud, and the controller listens for the mismatch. Readback brings that loop to crypto signing. You press Sign and say what you think you are signing. The AssemblyAI Voice Agent API hears you and records your intent through a tool call, without ever seeing the transaction. A notary decodes the real calldata, unpacks router multicalls and Safe MultiSend batches, checks every address on Base, and compares the two with 27 deterministic rules. The agent then speaks the verdict word for word: "Stop. A claim should give you something. This lets a wallet address with no history at all take your USDC, all of it, forever."

On a Safe, a match produces an EIP-712 attestation, and ReadbackGuard, a Safe transaction guard, refuses any transaction without one. On Base Sepolia, the same Bybit-shaped transaction, signed by both owners, reverted on a guarded Safe and took over an unguarded one. A transfer attested by a spoken readback in the browser executed on-chain.

Measured: 15/15 spoken intents understood, 15/15 verdicts spoken verbatim, 24/24 guard tests against real Safe contracts, 1.9 seconds from the end of your sentence to the verdict.

## Links
- Demo: https://readback-phi.vercel.app/app
- Site: https://readback-phi.vercel.app
- Repo: https://github.com/Nuel-osas/readback
- Guard: https://base-sepolia.blockscout.com/address/0xAA3356D3E0237898a3A613E111625043A1614355?tab=contract

## Assets
- [x] Cover image 16:9, 1920x1080: `submission/cover.png`
- [x] Slide deck PDF, 10 slides: `submission/readback-deck.pdf`
- [x] Video MP4, 2:44, 29 MB, loudness -16 LUFS: `submission/readback-demo.mp4`
      Real sessions recorded on the live site with the real AssemblyAI agent voice.

## Technologies
AssemblyAI Voice Agent API, Next.js, viem, wagmi, Solidity, Foundry, Safe, Base
