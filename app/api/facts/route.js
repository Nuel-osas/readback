// What the chain knows about each address: contract or wallet, verified source,
// its name, when it was deployed, how much history it has. Base mainnet, via
// Blockscout. Nothing here is inferred; missing data stays missing.
export const dynamic = 'force-dynamic';
const B = 'https://base.blockscout.com/api/v2';

async function j(url) {
  const r = await fetch(url, { next: { revalidate: 300 } });
  return r.ok ? r.json() : null;
}

async function factsFor(address) {
  const a = await j(`${B}/addresses/${address}`);
  if (!a) return null;
  const out = { isContract: Boolean(a.is_contract), verified: Boolean(a.is_verified), name: a.name ?? null };
  const creation = a.creation_transaction_hash ?? a.creation_tx_hash;
  if (out.isContract && creation) {
    const t = await j(`${B}/transactions/${creation}`);
    out.createdAt = t?.timestamp ?? null;
  }
  if (!out.isContract) {
    const c = await j(`${B}/addresses/${address}/counters`);
    out.txCount = c ? Number(c.transactions_count ?? 0) : null;
  }
  return out;
}

export async function POST(req) {
  const { addresses = [] } = await req.json();
  const uniq = [...new Set(addresses.map((x) => x.toLowerCase()))].filter((x) => /^0x[0-9a-f]{40}$/.test(x)).slice(0, 12);
  const entries = await Promise.all(uniq.map(async (x) => [x, await factsFor(x).catch(() => null)]));
  return Response.json(Object.fromEntries(entries.filter(([, v]) => v)));
}
