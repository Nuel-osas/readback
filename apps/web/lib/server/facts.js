// What the chain knows about each address: contract or wallet, verified source, name,
// deployment time, history. From Blockscout for the chain in question. Missing stays missing.
import { CHAINS } from './chains.js';

async function j(url) {
  const r = await fetch(url, { next: { revalidate: 300 } });
  return r.ok ? r.json() : null;
}

async function one(api, address) {
  const a = await j(`${api}/addresses/${address}`);
  if (!a) return null;
  const f = { isContract: Boolean(a.is_contract), verified: Boolean(a.is_verified), name: a.name ?? null };
  const creation = a.creation_transaction_hash ?? a.creation_tx_hash;
  if (f.isContract && creation) f.createdAt = (await j(`${api}/transactions/${creation}`))?.timestamp ?? null;
  if (!f.isContract) f.txCount = Number((await j(`${api}/addresses/${address}/counters`))?.transactions_count ?? 0);
  return f;
}

export async function factsFor(chainId, addresses) {
  const api = CHAINS[chainId]?.blockscout;
  if (!api) return {};
  const uniq = [...new Set(addresses.map((x) => x.toLowerCase()))].filter((x) => /^0x[0-9a-f]{40}$/.test(x)).slice(0, 16);
  const rows = await Promise.all(uniq.map(async (x) => [x, await one(api, x).catch(() => null)]));
  return Object.fromEntries(rows.filter(([, v]) => v));
}
