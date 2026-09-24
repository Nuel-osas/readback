import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeFunctionData, parseAbi, maxUint256, parseUnits, parseEther } from 'viem';
import { decodeTx, UNLIMITED } from '../lib/decode.js';
import { readback } from '../lib/compare.js';

const ME = '0x1111111111111111111111111111111111111111';
const THIEF = '0xbadbadbadbadbadbadbadbadbadbadbadbadbad0';
const FRESH = '0xfee1deadfee1deadfee1deadfee1deadfee1dead';
const SAFE = '0x5afe5afe5afe5afe5afe5afe5afe5afe5afe5afe';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const WETH = '0x4200000000000000000000000000000000000006';
const ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481';

const FACTS = {
  [THIEF]: { isContract: false, txCount: 0 },
  [FRESH]: { isContract: true, verified: false, createdAt: new Date(Date.now() - 4 * 3600e3).toISOString() },
};

const abi = parseAbi([
  'function approve(address,uint256)',
  'function transfer(address,uint256)',
  'function setApprovalForAll(address,bool)',
  'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96))',
  'function multicall(uint256,bytes[])',
  'function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)',
]);
const swap = (amountIn, recipient = ME, minOut = parseEther('0.03')) => encodeFunctionData({
  abi, functionName: 'exactInputSingle',
  args: [{ tokenIn: USDC, tokenOut: WETH, fee: 500, recipient, amountIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }],
});
const run = (intent, tx) => readback(intent, decodeTx(tx), FACTS, ME);

test('the honest swap matches', () => {
  const r = run({ action: 'swap', amount: 100, token: 'usdc', token_out: 'eth' }, { to: ROUTER, data: swap(parseUnits('100', 6)) });
  assert.equal(r.verdict, 'match');
  assert.match(r.spoken, /^That matches\. It will swap 100 USDC for at least 0\.03 WETH through the Uniswap swap router, paid to you\./);
});

test('a swap wrapped in multicall is unwrapped and still matches', () => {
  const data = encodeFunctionData({ abi, functionName: 'multicall', args: [9999999999n, [swap(parseUnits('100', 6))]] });
  const actions = decodeTx({ to: ROUTER, data });
  assert.equal(actions.length, 1);
  assert.equal(actions[0].kind, 'swap');
  assert.equal(readback({ action: 'swap', amount: 100, token: 'usdc', token_out: 'eth' }, actions, FACTS, ME).verdict, 'match');
});

test('"claim my airdrop" that is really an unlimited approval is stopped', () => {
  const data = encodeFunctionData({ abi, functionName: 'approve', args: [THIEF, maxUint256] });
  const r = run({ action: 'claim' }, { to: USDC, data });
  assert.equal(r.verdict, 'block');
  assert.equal(decodeTx({ to: USDC, data })[0].amount, UNLIMITED);
  assert.equal(r.spoken, 'Stop. A claim should give you something. This lets a wallet address with no history at all take your USDC, all of it, forever.');
});

test('the Bybit shape, a Safe delegatecall, is stopped whatever you said', () => {
  const inner = encodeFunctionData({ abi, functionName: 'transfer', args: [ME, parseEther('1')] });
  const data = encodeFunctionData({ abi, functionName: 'execTransaction', args: [FRESH, 0n, inner, 1, 0n, 0n, 0n, '0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000', '0x'] });
  const r = run({ action: 'send', amount: 1, token: 'eth', recipient: 'my cold wallet' }, { to: SAFE, data });
  assert.equal(r.verdict, 'block');
  assert.match(r.spoken, /hands control of your Safe to an unverified contract, deployed 4 hours ago\. That is how Bybit lost/);
});

test('a Safe CALL is unwrapped and judged on its inner transfer', () => {
  const inner = encodeFunctionData({ abi, functionName: 'transfer', args: [ME, parseUnits('50', 6)] });
  const data = encodeFunctionData({ abi, functionName: 'execTransaction', args: [USDC, 0n, inner, 0, 0n, 0n, 0n, '0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000', '0x'] });
  const a = decodeTx({ to: SAFE, data });
  assert.equal(a[0].kind, 'transfer');
  assert.equal(a[0].viaSafe.toLowerCase(), SAFE);
});

test('ten times the amount you said is a mismatch', () => {
  const r = run({ action: 'swap', amount: 100, token: 'usdc', token_out: 'eth' }, { to: ROUTER, data: swap(parseUnits('1000', 6)) });
  assert.equal(r.verdict, 'block');
  assert.match(r.spoken, /You said 100, but this spends 1,000 USDC/);
});

test('a swap that pays someone else is stopped', () => {
  const r = run({ action: 'swap', amount: 100, token: 'usdc', token_out: 'eth' }, { to: ROUTER, data: swap(parseUnits('100', 6), THIEF) });
  assert.equal(r.verdict, 'block');
  assert.match(r.spoken, /doesn't come back to you/);
});

test('a swap with zero slippage protection passes with a warning', () => {
  const r = run({ action: 'swap', amount: 100, token: 'usdc', token_out: 'eth' }, { to: ROUTER, data: swap(parseUnits('100', 6), ME, 0n) });
  assert.equal(r.verdict, 'match');
  assert.match(r.spoken, /no slippage protection/);
});

test('an unlimited approval to a known router warns but does not block a swap', () => {
  const r = run({ action: 'swap', token: 'usdc' }, { to: USDC, data: encodeFunctionData({ abi, functionName: 'approve', args: [ROUTER, maxUint256] }) });
  assert.equal(r.verdict, 'match');
  assert.match(r.spoken, /unlimited USDC/);
});

test('a free mint that asks for your whole collection is stopped', () => {
  const r = run({ action: 'mint' }, { to: '0x0000000000000000000000000000000000c0ffee', data: encodeFunctionData({ abi, functionName: 'setApprovalForAll', args: [THIEF, true] }) });
  assert.equal(r.verdict, 'block');
});

test('calldata nobody can read is stopped', () => {
  const r = run({ action: 'swap' }, { to: ROUTER, data: '0xdeadbeef00000000' });
  assert.equal(r.verdict, 'block');
  assert.match(r.spoken, /can't read this transaction/);
});

test('sending ETH to the exact address you read out matches', () => {
  const r = run({ action: 'send', amount: 0.5, token: 'eth', recipient: THIEF }, { to: THIEF, value: parseEther('0.5') });
  assert.equal(r.verdict, 'match');
});

test('sending to a different address than the one you read out is stopped', () => {
  const r = run({ action: 'send', amount: 0.5, token: 'eth', recipient: '0x2222222222222222222222222222222222222222' }, { to: THIEF, value: parseEther('0.5') });
  assert.equal(r.verdict, 'block');
});

test('nothing hexadecimal is ever spoken', () => {
  const data = encodeFunctionData({ abi, functionName: 'approve', args: [THIEF, maxUint256] });
  const r = run({ action: 'claim' }, { to: USDC, data });
  assert.doesNotMatch(r.spoken, /0x/);
});
