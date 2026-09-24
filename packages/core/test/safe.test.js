import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encodeFunctionData, encodePacked, parseAbi, parseEther, parseUnits, maxUint256 } from 'viem';
import { decodeTx } from '../src/decode.js';
import { evaluate } from '../src/rules.js';

const ME = '0x1111111111111111111111111111111111111111';
const SAFE = '0x5afe5afe5afe5afe5afe5afe5afe5afe5afe5afe';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const STRANGER = '0xbadbadbadbadbadbadbadbadbadbadbadbadbad0';
const MSCO = '0x9641d764fc13c8B624c04430C7356C1C7C8102e2'; // MultiSendCallOnly 1.4.1
const ZERO = '0x0000000000000000000000000000000000000000';
const FACTS = { [STRANGER]: { isContract: false, txCount: 0 } };

const abi = parseAbi([
  'function transfer(address,uint256)', 'function approve(address,uint256)', 'function multiSend(bytes)',
  'function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)',
  'function addOwnerWithThreshold(address,uint256)', 'function enableModule(address)', 'function setGuard(address)', 'function approveHash(bytes32)',
]);
const leg = (op, to, value, data) => encodePacked(['uint8', 'address', 'uint256', 'uint256', 'bytes'], [op, to, value, BigInt((data.length - 2) / 2), data]);
const exec = (to, data, op = 0, { value = 0n, gasPrice = 0n, refund = ZERO } = {}) => ({
  to: SAFE, data: encodeFunctionData({ abi, functionName: 'execTransaction', args: [to, value, data, op, 0n, 0n, gasPrice, ZERO, refund, '0x'] }),
});
const run = (intent, tx) => evaluate(intent, decodeTx(tx), FACTS, ME);

test('every real MultiSend delegatecall on Base decodes without tripping RB-002', () => {
  const real = JSON.parse(readFileSync(new URL('./fixtures/base-multisend-delegatecalls.json', import.meta.url)));
  assert.ok(real.length >= 40, `expected a real sample, got ${real.length}`);
  for (const t of real) {
    const actions = decodeTx({ to: t.to, data: t.data, value: BigInt(t.value) });
    assert.ok(!actions.some((a) => a.kind === 'delegatecall'), `${t.hash} still reads as a raw delegatecall`);
    assert.ok(actions.every((a) => a.batch), `${t.hash} legs are not tagged with their batch`);
  }
});

test('a MultiSend batch is unpacked and each leg judged: pay two people', () => {
  const batch = encodeFunctionData({ abi, functionName: 'multiSend', args: [leg(0, ME, parseEther('0.1'), '0x') + leg(0, USDC, 0n, encodeFunctionData({ abi, functionName: 'transfer', args: [ME, parseUnits('5', 6)] })).slice(2)] });
  const a = decodeTx(exec(MSCO, batch, 1));
  assert.deepEqual(a.map((x) => x.kind), ['native_transfer', 'transfer']);
});

test('a drainer approval hidden as the second leg of a batch is caught', () => {
  const batch = encodeFunctionData({ abi, functionName: 'multiSend', args: [leg(0, ME, parseEther('0.1'), '0x') + leg(0, USDC, 0n, encodeFunctionData({ abi, functionName: 'approve', args: [STRANGER, maxUint256] })).slice(2)] });
  const r = run({ action: 'send', amount: 0.1, token: 'eth', recipient: 'me' }, exec(MSCO, batch, 1));
  assert.equal(r.verdict, 'block');
  assert.ok(r.findings.some((f) => f.rule === 'RB-005'));
});

test('a delegatecall smuggled inside MultiSendCallOnly is unreadable, because it would revert anyway', () => {
  const batch = encodeFunctionData({ abi, functionName: 'multiSend', args: [leg(1, STRANGER, 0n, '0x12345678')] });
  const r = run({ action: 'send' }, exec(MSCO, batch, 1));
  assert.equal(r.verdict, 'block');
});

test('adding an owner you did not mention is blocked', () => {
  const r = run({ action: 'send', amount: 1, token: 'eth' }, exec(SAFE, encodeFunctionData({ abi, functionName: 'addOwnerWithThreshold', args: [STRANGER, 1n] })));
  assert.equal(r.verdict, 'block');
  assert.match(r.spoken, /add a wallet address with no history at all as an owner of your Safe, needing 1 signature/);
});

test('adding the owner you read out is allowed', () => {
  const r = run({ action: 'add_owner', recipient: STRANGER }, exec(SAFE, encodeFunctionData({ abi, functionName: 'addOwnerWithThreshold', args: [STRANGER, 2n] })));
  assert.equal(r.verdict, 'match');
});

test('enabling a module is said as what it is', () => {
  const r = run({ action: 'claim' }, exec(SAFE, encodeFunctionData({ abi, functionName: 'enableModule', args: [STRANGER] })));
  assert.equal(r.verdict, 'block');
  assert.match(r.spoken, /can move everything in your Safe without any owner signing/);
});

test('removing the guard is blocked unless said', () => {
  const r = run({ action: 'send' }, exec(SAFE, encodeFunctionData({ abi, functionName: 'setGuard', args: [ZERO] })));
  assert.equal(r.verdict, 'block');
  assert.match(r.spoken, /remove the guard protecting your Safe/);
});

test('approveHash is always blocked', () => {
  const r = run({ action: 'approve' }, exec(SAFE, encodeFunctionData({ abi, functionName: 'approveHash', args: ['0x' + 'ab'.repeat(32)] })));
  assert.equal(r.verdict, 'block');
  assert.equal(r.findings[0].rule, 'RB-008');
});

test('a gas refund paid to a stranger is blocked', () => {
  const r = run({ action: 'send', amount: 1, token: 'eth', recipient: 'me' }, exec(ME, '0x', 0, { value: parseEther('1'), gasPrice: 10n ** 9n, refund: STRANGER }));
  assert.equal(r.verdict, 'block');
  assert.ok(r.findings.some((f) => f.rule === 'RB-009'));
});

test('every finding names a rule from the catalogue', async () => {
  const { RULES } = await import('../src/rules.js');
  const ids = new Set([...RULES.map((r) => r.id), 'RB-000']);
  const r = run({ action: 'claim' }, exec(SAFE, encodeFunctionData({ abi, functionName: 'enableModule', args: [STRANGER] })));
  for (const f of r.findings) assert.ok(ids.has(f.rule), f.rule);
});
