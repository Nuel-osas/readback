/**
 * Tokens Readback can name out loud on Base. Anything not here is described by
 * its address and whatever the chain says about it, never guessed.
 */
export const TOKENS = {
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', decimals: 6, spoken: ['usdc', 'usd coin', 'dollars', 'usd'] },
  '0x4200000000000000000000000000000000000006': { symbol: 'WETH', decimals: 18, spoken: ['eth', 'ether', 'weth', 'ethereum'] },
  '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca': { symbol: 'USDbC', decimals: 6, spoken: ['usdbc', 'bridged usdc'] },
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': { symbol: 'DAI', decimals: 18, spoken: ['dai'] },
  '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf': { symbol: 'cbBTC', decimals: 8, spoken: ['btc', 'bitcoin', 'cbbtc'] },
  '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22': { symbol: 'cbETH', decimals: 18, spoken: ['cbeth'] },
  '0x940181a94a35a4569e4529a3cdfb74e38fd98631': { symbol: 'AERO', decimals: 18, spoken: ['aero', 'aerodrome'] },
  '0xb20000000000000000000078ee7ce2fe4908108c': { symbol: 'NVDAc', decimals: 8, spoken: ['nvidia', 'nvda'] },
  '0xb200000000000000000000c2e324d24d7eecd1fb': { symbol: 'AAPLc', decimals: 8, spoken: ['apple', 'aapl'] },
  '0xb2000000000000000000001e800a7f5189430cd0': { symbol: 'TSLAc', decimals: 8, spoken: ['tesla', 'tsla'] },
};

export const NATIVE = { symbol: 'ETH', decimals: 18, spoken: ['eth', 'ether', 'ethereum'] };

/** Contracts whose job we can state in a sentence. The chain still gets asked. */
export const KNOWN = {
  '0x2626664c2603336e57b271c5c0b26f421741e481': 'the Uniswap swap router',
  '0x6ff5693b99212da76ad316178a184ab56d299b43': 'the Uniswap universal router',
  '0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43': 'the Aerodrome router',
  '0x6131b5fae19ea4f9d964eac0408e4408b66337b5': 'the KyberSwap router',
  '0x000000000022d473030f116ddee9f6b43ac78ba3': 'Permit2',
};

export const token = (addr) => (addr ? TOKENS[addr.toLowerCase()] : undefined);
export const known = (addr) => (addr ? KNOWN[addr.toLowerCase()] : undefined);

/** Which registered token does a spoken word mean? */
export function tokenBySpoken(word) {
  if (!word) return undefined;
  const w = word.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  if (NATIVE.spoken.includes(w)) return { address: 'native', ...NATIVE };
  for (const [address, t] of Object.entries(TOKENS)) {
    if (t.symbol.toLowerCase() === w || t.spoken.includes(w)) return { address, ...t };
  }
  return undefined;
}

/**
 * Vocabulary for the speech model. Deliberately the whole registry, never the
 * tokens in the transaction under review: priming recognition with what the
 * transaction contains would bias the transcript toward agreeing with it, which
 * is the one thing a readback must never do.
 */
export const KEYTERMS = [
  ...new Set([
    ...Object.values(TOKENS).flatMap((t) => [t.symbol, ...t.spoken]),
    'Uniswap', 'Aerodrome', 'Base', 'airdrop', 'approve', 'swap', 'bridge', 'Safe', 'multisig', 'cold wallet',
  ]),
].filter((t) => t.length > 2).slice(0, 100);
