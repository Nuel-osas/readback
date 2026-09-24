import { base, baseSepolia } from 'viem/chains';
export const CHAINS = {
  8453: { chain: base, rpc: 'https://mainnet.base.org', blockscout: 'https://base.blockscout.com/api/v2', explorer: 'https://basescan.org' },
  84532: { chain: baseSepolia, rpc: 'https://sepolia.base.org', blockscout: 'https://base-sepolia.blockscout.com/api/v2', explorer: 'https://sepolia.basescan.org' },
};
