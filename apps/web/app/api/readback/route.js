// The notary. Everything that decides safety runs here, not in the browser:
// the calldata is decoded server-side, every address is checked on-chain, the rules are
// evaluated, and for a Safe transaction the Safe tx hash is computed from chain state
// rather than taken from the client. Only a match is ever signed.
//
// Known v0.1 gap (DESIGN.md §8): the spoken intent itself arrives from the client.
import { createPublicClient, encodeFunctionData, http, parseAbi, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { addressesOf, decodeTx, evaluate, signAttestation } from '@readback/core';
import { CHAINS } from '../../../lib/server/chains.js';
import { factsFor } from '../../../lib/server/facts.js';

export const dynamic = 'force-dynamic';

const SAFE = parseAbi([
  'function nonce() view returns (uint256)',
  'function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 nonce) view returns (bytes32)',
  'function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)',
  'function isOwner(address) view returns (bool)',
]);
const ZERO = '0x0000000000000000000000000000000000000000';
const big = (v) => BigInt(v ?? 0);
const json = (v) => JSON.parse(JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x)));

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return Response.json({ error: 'bad json' }, { status: 400 }); }
  const { chainId = 8453, tx, intent = null, sender, safe } = body;
  const net = CHAINS[chainId];
  if (!net) return Response.json({ error: `unsupported chain ${chainId}` }, { status: 400 });
  if (!tx?.to || !/^0x[0-9a-fA-F]{40}$/.test(tx.to)) return Response.json({ error: 'tx.to must be an address' }, { status: 400 });

  const client = createPublicClient({ chain: net.chain, transport: http(net.rpc) });
  let decodeInput = { to: tx.to, data: tx.data ?? '0x', value: big(tx.value) };
  let safeCtx = null;

  if (safe) {
    // Rebuild the exact execTransaction the owners will sign, so every Safe rule applies
    // (MultiSend legs, delegatecall targets, gas refunds, owner and module changes).
    const s = {
      to: getAddress(tx.to), value: big(tx.value), data: tx.data ?? '0x', operation: Number(tx.operation ?? 0),
      safeTxGas: big(tx.safeTxGas), baseGas: big(tx.baseGas), gasPrice: big(tx.gasPrice),
      gasToken: tx.gasToken ?? ZERO, refundReceiver: tx.refundReceiver ?? ZERO,
    };
    try {
      const nonce = tx.nonce != null ? big(tx.nonce) : await client.readContract({ address: safe, abi: SAFE, functionName: 'nonce' });
      const safeTxHash = await client.readContract({ address: safe, abi: SAFE, functionName: 'getTransactionHash', args: [s.to, s.value, s.data, s.operation, s.safeTxGas, s.baseGas, s.gasPrice, s.gasToken, s.refundReceiver, nonce] });
      safeCtx = { safe: getAddress(safe), nonce, safeTxHash };
    } catch (e) {
      return Response.json({ error: `could not read that Safe on chain ${chainId}: ${e.shortMessage ?? e.message}` }, { status: 400 });
    }
    decodeInput = { to: safe, value: 0n, data: encodeFunctionData({ abi: SAFE, functionName: 'execTransaction', args: [s.to, s.value, s.data, s.operation, s.safeTxGas, s.baseGas, s.gasPrice, s.gasToken, s.refundReceiver, '0x'] }) };
  }

  const actions = decodeTx(decodeInput);
  const facts = await factsFor(chainId, addressesOf(actions));

  // Without an intent this is a description request: what does this transaction do?
  if (!intent) return Response.json(json({ actions, facts, safe: safeCtx }));

  const verdict = evaluate(intent, actions, facts, sender);
  const out = { ...verdict, facts, safe: safeCtx };

  const guard = process.env.READBACK_GUARD_ADDRESS?.split(',').map((x) => x.split(':')).find(([c]) => Number(c) === chainId)?.[1];
  if (verdict.verdict === 'match' && safeCtx && guard && process.env.NOTARY_PRIVATE_KEY) {
    const notary = privateKeyToAccount(process.env.NOTARY_PRIVATE_KEY);
    const expiry = Math.floor(Date.now() / 1000) + 600;
    const a = await signAttestation(notary, { chainId, guard, safe: safeCtx.safe, safeTxHash: safeCtx.safeTxHash, intent, expiry });
    out.attestation = { bytes: a.bytes, expiry, notary: notary.address, guard, intentHash: a.message.intentHash };
  }
  return Response.json(json(out));
}
