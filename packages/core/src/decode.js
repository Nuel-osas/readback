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
  'function multiSend(bytes transactions)',
  // Safe self-administration: every one of these changes who controls the Safe
  'function addOwnerWithThreshold(address owner, uint256 threshold)',
  'function removeOwner(address prevOwner, address owner, uint256 threshold)',
  'function swapOwner(address prevOwner, address oldOwner, address newOwner)',
  'function changeThreshold(uint256 threshold)',
  'function enableModule(address module)',
  'function disableModule(address prevModule, address module)',
  'function setGuard(address guard)',
  'function setFallbackHandler(address handler)',
  'function approveHash(bytes32 hashToApprove)',
]);

/**
 * Safe's canonical batching contracts on Base, from safe-deployments. Measured on
 * 375 real Safe transactions: 21.6% were DELEGATECALLs and every one targeted one of
 * these. A delegatecall here is a batch to unpack, not an attack.
 * MultiSendCallOnly refuses nested delegatecalls; MultiSend allows them, and those
 * nested ones are judged by the same allowlist.
 */
export const MULTISEND = {
  '0x40a2accbd92bca938b02010e17a5b8929b49130d': { name: 'MultiSendCallOnly 1.3.0', callOnly: true },
  '0xa1dabef33b3b82c7814b6d82a79e50f4ac44102b': { name: 'MultiSendCallOnly 1.3.0 (eip155)', callOnly: true },
  '0x9641d764fc13c8b624c04430c7356c1c7c8102e2': { name: 'MultiSendCallOnly 1.4.1', callOnly: true },
  '0xa83c336b20401af773b6219ba5027174338d1836': { name: 'MultiSendCallOnly 1.5.0', callOnly: true },
  '0xa238cbeb142c10ef7ad8442c6d1f9e89e07e7761': { name: 'MultiSend 1.3.0', callOnly: false },
  '0x998739bfdaadde7c933b942a68053933098f9eda': { name: 'MultiSend 1.3.0 (eip155)', callOnly: false },
  '0x38869bf66a61cf6bdb996a6ae40d5853fd43b526': { name: 'MultiSend 1.4.1', callOnly: false },
  '0x218543288004cd07832472d464648173c77d7eb7': { name: 'MultiSend 1.5.0', callOnly: false },
};

/** MultiSend's packed encoding: operation (1) | to (20) | value (32) | dataLength (32) | data. */
export function unpackMultiSend(packed) {
  const hex = packed.slice(2);
  const out = [];
  let i = 0;
  while (i < hex.length) {
    const operation = parseInt(hex.slice(i, i + 2), 16); i += 2;
    const to = getAddress(`0x${hex.slice(i, i + 40)}`); i += 40;
    const value = BigInt(`0x${hex.slice(i, i + 64)}`); i += 64;
    const len = Number(BigInt(`0x${hex.slice(i, i + 64)}`)); i += 64;
    const data = `0x${hex.slice(i, i + len * 2)}`; i += len * 2;
    out.push({ operation, to, value, data });
  }
  return out;
}

const SAFE_ADMIN = new Set(['addOwnerWithThreshold', 'removeOwner', 'swapOwner', 'changeThreshold', 'enableModule', 'disableModule', 'setGuard', 'setFallbackHandler']);

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
      const [innerTo, innerValue, innerData, operation, , , gasPrice, gasToken, refundReceiver] = args;
      if (gasPrice > 0n && (refundReceiver !== '0x0000000000000000000000000000000000000000' || gasToken !== '0x0000000000000000000000000000000000000000')) {
        // Safe pays a gas refund out of its own balance to refundReceiver: a known
        // drain vector, and invisible on most signing screens.
        out.push({ kind: 'gas_refund', safe: to, gasPrice, gasToken: addr(gasToken), refundReceiver: addr(refundReceiver) });
      }
      out.push(...decodeSafeCall(to, { operation, to: addr(innerTo), value: innerValue, data: innerData }, depth + 1));
      break;
    }
    case 'multiSend':
      // A plain CALL to multiSend runs in MultiSend's own context and can move nothing of
      // the caller's. Still unpacked so every leg is said aloud.
      for (const c of unpackMultiSend(args[0])) out.push(...decodeTx({ to: c.to, value: c.value, data: c.data }, depth + 1));
      break;
    case 'approveHash':
      out.push({ kind: 'approve_hash', safe: to, hash: args[0] });
      break;
    default:
      if (SAFE_ADMIN.has(fn)) {
        out.push({ kind: 'safe_admin', safe: to, op: fn, ...adminArgs(fn, args) });
        break;
      }
      out.push({ kind: 'unknown', target: to, selector: data.slice(0, 10) });
  }
  return out;
}

function adminArgs(fn, a) {
  switch (fn) {
    case 'addOwnerWithThreshold': return { owner: addr(a[0]), threshold: Number(a[1]) };
    case 'removeOwner': return { owner: addr(a[1]), threshold: Number(a[2]) };
    case 'swapOwner': return { oldOwner: addr(a[1]), owner: addr(a[2]) };
    case 'changeThreshold': return { threshold: Number(a[0]) };
    case 'enableModule': case 'disableModule': return { module: addr(a[a.length - 1]) };
    case 'setGuard': return { guard: addr(a[0]) };
    case 'setFallbackHandler': return { handler: addr(a[0]) };
    default: return {};
  }
}

/**
 * One call made *by* a Safe. The operation decides everything: CALL is judged on
 * what it calls; DELEGATECALL runs foreign code with the Safe's own storage and
 * authority, so it is only acceptable into Safe's own batching contracts, which
 * are unpacked and each leg judged the same way.
 */
function decodeSafeCall(safe, c, depth) {
  const tag = (a) => ({ ...a, viaSafe: safe });
  if (c.operation !== 1) {
    // Self-calls (owner changes, modules, guards) arrive here with to === safe.
    return decodeTx({ to: c.to, value: c.value, data: c.data }, depth).map(tag);
  }
  const ms = MULTISEND[c.to.toLowerCase()];
  if (!ms) return [{ kind: 'delegatecall', safe, target: c.to, selector: c.data.slice(0, 10) }];
  let legs;
  try {
    const call = decodeFunctionData({ abi: ABI, data: c.data });
    if (call.functionName !== 'multiSend') throw new Error('not multiSend');
    legs = unpackMultiSend(call.args[0]);
  } catch {
    return [{ kind: 'unknown', target: c.to, selector: c.data.slice(0, 10), reason: 'malformed batch' }];
  }
  const out = [];
  for (const leg of legs) {
    if (leg.operation === 1 && ms.callOnly) {
      out.push({ kind: 'unknown', target: leg.to, selector: leg.data.slice(0, 10), reason: 'delegatecall inside MultiSendCallOnly reverts' });
      continue;
    }
    // Inside a delegatecalled MultiSend, `this` is the Safe: legs act as the Safe.
    out.push(...decodeSafeCall(safe, { operation: leg.operation, to: leg.to, value: leg.value, data: leg.data }, depth + 1).map((a) => ({ ...a, batch: ms.name })));
  }
  return out;
}

/** Every address a verdict might need facts about. */
export function addressesOf(actions) {
  const s = new Set();
  for (const a of actions) for (const k of ['to', 'spender', 'operator', 'target', 'via', 'recipient', 'token', 'collection', 'owner', 'oldOwner', 'module', 'guard', 'handler', 'refundReceiver']) {
    if (a[k] && a[k].startsWith?.('0x')) s.add(a[k].toLowerCase());
  }
  return [...s];
}
