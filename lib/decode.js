/**
 * Calldata to plain actions.
 *
 * Every transaction is reduced to a list of actions in one small vocabulary:
 * native_transfer, transfer, approve, approval_for_all, swap, delegatecall,
 * unknown. Nested calls (router multicalls, Safe execTransaction) are unwrapped
 * recursively, because the dangerous part of a transaction is usually the part
 * the wallet screen doesn't show.
 */
import { decodeFunctionData, maxUint256, parseAbi, getAddress } from 'viem';

export const UNLIMITED = 'unlimited';
const LIMIT_THRESHOLD = maxUint256 / 2n; // anything this large is "forever" in practice

const ABI = parseAbi([
  // ERC-20
  'function transfer(address to, uint256 amount)',
  'function approve(address spender, uint256 amount)',
  'function transferFrom(address from, address to, uint256 amount)',
  'function increaseAllowance(address spender, uint256 addedValue)',
  // ERC-721 / ERC-1155
  'function setApprovalForAll(address operator, bool approved)',
  // Permit2
  'function approve(address token, address spender, uint160 amount, uint48 expiration)',
  // Uniswap SwapRouter02
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params)',
  'function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96) params)',
  'function multicall(uint256 deadline, bytes[] data)',
  'function multicall(bytes[] data)',
  // Aerodrome
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, (address from, address to, bool stable, address factory)[] routes, address to, uint256 deadline)',
  // Safe
  'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures)',
]);

const amount = (v) => (v >= LIMIT_THRESHOLD ? UNLIMITED : v);
const addr = (a) => getAddress(a);

/**
 * @param {{ to: string, from?: string, data?: string, value?: bigint }} tx
 * @returns {Array<object>} actions, outermost first
 */
export function decodeTx(tx, depth = 0) {
  const to = addr(tx.to);
  const value = BigInt(tx.value ?? 0n);
  const data = tx.data && tx.data !== '0x' ? tx.data : null;
  const out = [];

  if (value > 0n) out.push({ kind: 'native_transfer', to, amount: value });
  if (!data) return out;
  if (depth > 4) return [...out, { kind: 'unknown', target: to, selector: data.slice(0, 10), reason: 'nested too deep' }];

  let call;
  try {
    call = decodeFunctionData({ abi: ABI, data });
  } catch {
    return [...out, { kind: 'unknown', target: to, selector: data.slice(0, 10) }];
  }
  const { functionName: fn, args } = call;

  switch (fn) {
    case 'transfer':
      out.push({ kind: 'transfer', token: to, to: addr(args[0]), amount: args[1] });
      break;
    case 'transferFrom':
      out.push({ kind: 'transfer', token: to, from: addr(args[0]), to: addr(args[1]), amount: args[2] });
      break;
    case 'approve':
      if (args.length === 4) {
        // Permit2: approve(token, spender, amount, expiration), sent to the Permit2 contract
        out.push({ kind: 'approve', token: addr(args[0]), spender: addr(args[1]), amount: amount(args[2]), via: to, expiration: Number(args[3]) });
      } else {
        out.push({ kind: 'approve', token: to, spender: addr(args[0]), amount: amount(args[1]) });
      }
      break;
    case 'increaseAllowance':
      out.push({ kind: 'approve', token: to, spender: addr(args[0]), amount: amount(args[1]), increase: true });
      break;
    case 'setApprovalForAll':
      out.push({ kind: 'approval_for_all', collection: to, operator: addr(args[0]), approved: args[1] });
      break;
    case 'exactInputSingle': {
      const p = args[0];
      out.push({ kind: 'swap', via: to, tokenIn: addr(p.tokenIn), tokenOut: addr(p.tokenOut), amountIn: p.amountIn, minOut: p.amountOutMinimum, recipient: addr(p.recipient) });
      break;
    }
    case 'exactOutputSingle': {
      const p = args[0];
      out.push({ kind: 'swap', via: to, tokenIn: addr(p.tokenIn), tokenOut: addr(p.tokenOut), amountIn: p.amountInMaximum, minOut: p.amountOut, recipient: addr(p.recipient), exactOut: true });
      break;
    }
    case 'swapExactTokensForTokens': {
      const [amountIn, minOut, routes, recipient] = args;
      out.push({ kind: 'swap', via: to, tokenIn: addr(routes[0].from), tokenOut: addr(routes[routes.length - 1].to), amountIn, minOut, recipient: addr(recipient) });
      break;
    }
    case 'multicall': {
      const calls = args.length === 2 ? args[1] : args[0];
      for (const inner of calls) out.push(...decodeTx({ to, data: inner }, depth + 1));
      break;
    }
    case 'execTransaction': {
      const [innerTo, innerValue, innerData, operation] = args;
      if (operation === 1) {
        // DELEGATECALL: the target's code runs with the Safe's own storage and
        // authority. This is the Bybit shape: it moves nothing and takes everything.
        out.push({ kind: 'delegatecall', safe: to, target: addr(innerTo), selector: innerData.slice(0, 10) });
      } else {
        out.push(...decodeTx({ to: innerTo, value: innerValue, data: innerData }, depth + 1).map((a) => ({ ...a, viaSafe: to })));
      }
      break;
    }
    default:
      out.push({ kind: 'unknown', target: to, selector: data.slice(0, 10) });
  }
  return out;
}

/** Every address a verdict might need facts about. */
export function addressesOf(actions) {
  const s = new Set();
  for (const a of actions) for (const k of ['to', 'spender', 'operator', 'target', 'via', 'recipient', 'token', 'collection']) {
    if (a[k] && a[k].startsWith?.('0x')) s.add(a[k].toLowerCase());
  }
  return [...s];
}
