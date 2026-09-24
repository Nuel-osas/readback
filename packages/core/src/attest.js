/**
 * Readback attestations: the notary's signed statement that a specific Safe
 * transaction was read back and matched what the signer said.
 *
 * EIP-712, verified on-chain by ReadbackGuard. The notary only ever signs a
 * match, so there is no verdict field to get wrong: the existence of a valid
 * signature is the claim.
 *
 *   Readback(address safe, bytes32 safeTxHash, bytes32 intentHash, bytes32 rules, uint64 expiry)
 *
 * safeTxHash  binds it to one exact transaction, nonce included, so it cannot be replayed
 * intentHash  keccak256 of the canonical intent JSON, so what was said is on the record
 * rules       keccak256 of the rules version that produced the match
 * expiry      unix seconds; attestations are meant to be used within minutes
 */
import { keccak256, toBytes } from 'viem';
import { VERSION } from './rules.js';

export const ATTESTATION_TYPES = {
  Readback: [
    { name: 'safe', type: 'address' },
    { name: 'safeTxHash', type: 'bytes32' },
    { name: 'intentHash', type: 'bytes32' },
    { name: 'rules', type: 'bytes32' },
    { name: 'expiry', type: 'uint64' },
  ],
};

export const attestationDomain = (chainId, guard) => ({ name: 'ReadbackGuard', version: '1', chainId, verifyingContract: guard });

export const RULES_ID = keccak256(toBytes(VERSION));

/** Deterministic JSON: sorted keys, no whitespace. Two notaries must hash the same intent identically. */
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

export const intentHash = (intent) => keccak256(toBytes(canonical(intent)));

/** The message a notary signs. */
export function attestation({ safe, safeTxHash, intent, expiry }) {
  return { safe, safeTxHash, intentHash: intentHash(intent), rules: RULES_ID, expiry: BigInt(expiry) };
}
