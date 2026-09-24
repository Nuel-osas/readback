/**
 * Readback as a provider wrapper. Any dapp or wallet wraps its EIP-1193
 * provider once:
 *
 *   const provider = withReadback(window.ethereum, review)
 *
 * and every eth_sendTransaction goes through a spoken readback first. Nothing
 * else about the provider changes. If the readback blocks, the dapp receives
 * the standard "user rejected" error, exactly as if the user had clicked Reject.
 */
export function withReadback(provider, review) {
  return {
    ...provider,
    async request(args) {
      if (args?.method === 'eth_sendTransaction') {
        const tx = args.params?.[0];
        const ok = await review(tx);
        if (!ok) throw Object.assign(new Error('Readback: the transaction did not match what you said'), { code: 4001 });
      }
      return provider.request(args);
    },
  };
}
