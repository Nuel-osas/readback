// Writes vectors/attestation-0.json: what the JS notary produces for a fixed input.
// contracts/test/AttestationVector.t.sol checks the guard accepts exactly these bytes.
import { writeFileSync } from 'node:fs';
import { privateKeyToAccount } from 'viem/accounts';
import { hashTypedData } from 'viem';
import { signAttestation, attestationDomain, ATTESTATION_TYPES } from '../src/attest.js';

const key = '0x000000000000000000000000000000000000000000000000000000000000c0de';
const account = privateKeyToAccount(key);
const input = {
  chainId: 8453,
  guard: '0x00000000000000000000000000000000000Ba5e1',
  safe: '0x4f2083f5fbede34c2714affb3105539775f7fe64',
  safeTxHash: '0x8e0b1a628bfeb02de1056919bd9f6f154e5c1db8cb0fa4f2f09c0db65ca9a43b',
  intent: { action: 'send', amount: 1, token: 'eth', token_out: null, recipient: 'my cold wallet', confirm: false },
  expiry: 4102444800, // 2100-01-01
};
const out = await signAttestation(account, input);
const digest = hashTypedData({ domain: attestationDomain(input.chainId, input.guard), types: ATTESTATION_TYPES, primaryType: 'Readback', message: out.message });
writeFileSync(new URL('../../../vectors/attestation-0.json', import.meta.url), JSON.stringify({
  notary: account.address, chainId: input.chainId, guard: input.guard, safe: input.safe, safeTxHash: input.safeTxHash,
  intentHash: out.message.intentHash, rules: out.message.rules, expiry: input.expiry, digest, bytes: out.bytes,
}, null, 2));
console.log('wrote vectors/attestation-0.json, digest', digest);
